import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { encryptSecret, decryptSecret } from "@/server/github/crypto";
import {
  requestDeviceCode,
  pollDeviceToken,
  fetchGitHubUser,
  fetchPullRequest,
  GitHubApiError,
} from "@/server/github/client";
import { setPendingDeviceAuth, getPendingDeviceAuth, clearPendingDeviceAuth } from "@/server/github/device-auth-store";
import { applyForwardTransition } from "@/server/github/state-transitions";
import { parsePrUrl } from "@/lib/github";

// GitHub's classic OAuth scopes are coarse-grained — there is no read-only
// scope for private repos, so linking PRs from a private repo requires the
// full "repo" scope even though this integration only ever reads PR/user
// data. Self-hosters who only need public-repo linking (a much smaller
// blast radius if a token ever leaked — no private-repo access at all) can
// opt into "public_repo" via GITHUB_OAUTH_SCOPE.
const SCOPE = process.env.GITHUB_OAUTH_SCOPE || "repo";

async function assertIssueAccess(db: PrismaClient, issueId: string, organizationId: string) {
  const issue = await db.issue.findFirst({ where: { id: issueId, team: { organizationId } } });
  if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found." });
  return issue;
}

// Maps a classified GitHub API failure to a tRPC error with a message the UI
// can show directly, instead of a generic "something went wrong".
function mapGitHubError(err: unknown): TRPCError {
  if (err instanceof GitHubApiError) {
    const code = err.kind === "not_found" ? "NOT_FOUND" : err.kind === "rate_limited" ? "TOO_MANY_REQUESTS" : "BAD_REQUEST";
    return new TRPCError({ code, message: err.message });
  }
  return new TRPCError({
    code: "BAD_REQUEST",
    message: err instanceof Error ? err.message : "GitHub request failed.",
  });
}

async function requireConnection(db: PrismaClient, userId: string) {
  const connection = await db.gitHubConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Connect your GitHub account in Settings → GitHub first.",
    });
  }
  return connection;
}

export const githubRouter = createTRPCRouter({
  getConnection: protectedProcedure.query(async ({ ctx }) => {
    const connection = await ctx.db.gitHubConnection.findUnique({
      where: { userId: ctx.session.user.id },
    });
    return { connected: !!connection, githubLogin: connection?.githubLogin ?? null };
  }),

  startDeviceAuth: protectedProcedure.mutation(async ({ ctx }) => {
    const code = await requestDeviceCode(SCOPE);
    await setPendingDeviceAuth(ctx.db, ctx.session.user.id, {
      deviceCode: code.deviceCode,
      interval: code.interval,
      expiresAt: Date.now() + code.expiresIn * 1000,
    });
    return {
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      interval: code.interval,
      expiresIn: code.expiresIn,
    };
  }),

  pollDeviceAuth: protectedProcedure.mutation(async ({ ctx }) => {
    const pending = await getPendingDeviceAuth(ctx.db, ctx.session.user.id);
    if (!pending) return { status: "expired" as const };

    const result = await pollDeviceToken(pending.deviceCode);
    if (result.status === "pending") return { status: "pending" as const };
    if (result.status === "slow_down") {
      await setPendingDeviceAuth(ctx.db, ctx.session.user.id, { ...pending, interval: result.interval });
      return { status: "slow_down" as const, interval: result.interval };
    }
    if (result.status === "expired" || result.status === "denied") {
      await clearPendingDeviceAuth(ctx.db, ctx.session.user.id);
      return { status: result.status };
    }

    await clearPendingDeviceAuth(ctx.db, ctx.session.user.id);
    const ghUser = await fetchGitHubUser(result.accessToken).catch((err) => {
      throw mapGitHubError(err);
    });
    await ctx.db.gitHubConnection.upsert({
      where: { userId: ctx.session.user.id },
      create: {
        userId: ctx.session.user.id,
        githubLogin: ghUser.login,
        githubUserId: ghUser.id,
        accessTokenEncrypted: encryptSecret(result.accessToken),
        scope: result.scope,
      },
      update: {
        githubLogin: ghUser.login,
        githubUserId: ghUser.id,
        accessTokenEncrypted: encryptSecret(result.accessToken),
        scope: result.scope,
        connectedAt: new Date(),
      },
    });
    return { status: "ok" as const, githubLogin: ghUser.login };
  }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.gitHubConnection.deleteMany({ where: { userId: ctx.session.user.id } });
    return { success: true };
  }),

  linkPr: protectedProcedure
    .input(z.object({ issueId: z.string(), prUrl: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertIssueAccess(ctx.db, input.issueId, ctx.session.user.organizationId);
      const parsed = parsePrUrl(input.prUrl);
      if (!parsed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Paste a GitHub PR URL, e.g. https://github.com/owner/repo/pull/123.",
        });
      }
      const connection = await requireConnection(ctx.db, ctx.session.user.id);
      const token = decryptSecret(connection.accessTokenEncrypted);
      const pr = await fetchPullRequest(token, parsed.owner, parsed.repo, parsed.number).catch((err) => {
        throw mapGitHubError(err);
      });

      const link = await ctx.db.issueGitHubLink.upsert({
        where: {
          issueId_repoOwner_repoName_prNumber: {
            issueId: input.issueId,
            repoOwner: parsed.owner,
            repoName: parsed.repo,
            prNumber: parsed.number,
          },
        },
        create: {
          issueId: input.issueId,
          repoOwner: parsed.owner,
          repoName: parsed.repo,
          prNumber: pr.number,
          prUrl: pr.url,
          prTitle: pr.title,
          prState: pr.state,
          isDraft: pr.isDraft,
          headBranch: pr.headBranch,
          authorLogin: pr.authorLogin,
        },
        update: {
          prTitle: pr.title,
          prState: pr.state,
          isDraft: pr.isDraft,
          headBranch: pr.headBranch,
          authorLogin: pr.authorLogin,
          lastSyncedAt: new Date(),
        },
      });

      if (pr.state === "OPEN" && !pr.isDraft) {
        await applyForwardTransition(ctx.db, input.issueId, "STARTED");
      } else if (pr.state === "MERGED") {
        await applyForwardTransition(ctx.db, input.issueId, "COMPLETED");
      }

      return link;
    }),

  unlinkPr: protectedProcedure
    .input(z.object({ linkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.issueGitHubLink.deleteMany({
        where: {
          id: input.linkId,
          issue: { team: { organizationId: ctx.session.user.organizationId } },
        },
      });
      return { success: true };
    }),

  syncIssueLinks: protectedProcedure
    .input(z.object({ issueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertIssueAccess(ctx.db, input.issueId, ctx.session.user.organizationId);
      const connection = await requireConnection(ctx.db, ctx.session.user.id);
      const token = decryptSecret(connection.accessTokenEncrypted);

      const links = await ctx.db.issueGitHubLink.findMany({ where: { issueId: input.issueId } });
      for (const link of links) {
        // Abort on the first failure (e.g. rate limit) rather than continuing
        // best-effort — a partial sync with a swallowed error is more
        // confusing than a clear "sync failed, try again" surfaced to the UI.
        const pr = await fetchPullRequest(token, link.repoOwner, link.repoName, link.prNumber).catch((err) => {
          throw mapGitHubError(err);
        });
        const previousState = link.prState;
        const previousDraft = link.isDraft;
        await ctx.db.issueGitHubLink.update({
          where: { id: link.id },
          data: {
            prTitle: pr.title,
            prState: pr.state,
            isDraft: pr.isDraft,
            headBranch: pr.headBranch,
            authorLogin: pr.authorLogin,
            lastSyncedAt: new Date(),
          },
        });
        // Only drive an auto-transition off a state the PR just moved *into*
        // this sync — re-observing an already-known state (e.g. a PR that
        // was merged last sync and is still merged) must not re-fire it,
        // otherwise a human manually moving the issue back out of a
        // non-terminal state gets silently overridden on the next poll.
        if (pr.state === previousState && pr.isDraft === previousDraft) continue;
        if (pr.state === "OPEN" && !pr.isDraft) {
          await applyForwardTransition(ctx.db, input.issueId, "STARTED");
        } else if (pr.state === "MERGED") {
          await applyForwardTransition(ctx.db, input.issueId, "COMPLETED");
        }
      }
      return { success: true };
    }),
});
