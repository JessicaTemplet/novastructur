import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { applyDocContentReplace } from "@/server/crdt/doc-content";

const listInclude = {
  author: { select: { id: true, name: true, avatarColor: true } },
  _count: { select: { children: true } },
} as const;

export const docRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db.doc.findMany({
      where: { organizationId: ctx.session.user.organizationId },
      select: { id: true, title: true, parentId: true, sortOrder: true, updatedAt: true },
      orderBy: { sortOrder: "asc" },
    });
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const doc = await ctx.db.doc.findFirst({
        where: { id: input.id, organizationId: ctx.session.user.organizationId },
        include: {
          ...listInclude,
          linkedIssues: {
            include: {
              issue: { select: { id: true, identifier: true, title: true, state: true } },
            },
          },
        },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Doc not found." });
      return doc;
    }),

  create: protectedProcedure
    .input(z.object({ title: z.string().min(1).max(200), parentId: z.string().nullable().optional() }))
    .mutation(async ({ ctx, input }) => {
      const maxSort = await ctx.db.doc.aggregate({
        where: {
          organizationId: ctx.session.user.organizationId,
          parentId: input.parentId ?? null,
        },
        _max: { sortOrder: true },
      });
      return ctx.db.doc.create({
        data: {
          title: input.title,
          parentId: input.parentId ?? undefined,
          sortOrder: (maxSort._max.sortOrder ?? 0) + 1000,
          organizationId: ctx.session.user.organizationId,
          authorId: ctx.session.user.id,
        },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(200).optional(),
        content: z.string().optional(),
        // The content this save was based on, what the client last
        // loaded or synced, not necessarily what's currently stored
        // server-side. Needed so a concurrent save from someone else
        // doesn't get misread as part of THIS save's diff, see
        // src/server/crdt/doc-content.ts for why that distinction
        // matters. Optional for backward compatibility: omitting it
        // falls back to diffing against current server content, the
        // weaker guarantee this mutation had before.
        baselineContent: z.string().optional(),
        parentId: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.doc.findFirst({
        where: { id: input.id, organizationId: ctx.session.user.organizationId },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Doc not found." });
      if (input.parentId === input.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A doc can't be its own parent." });
      }

      // Content goes through the Fugue-backed merge path (its own
      // transaction); title/parentId/sortOrder are plain LWW-by-commit
      // columns, same as before, updated separately since they're
      // never sent together by the current editor UI.
      if (input.content !== undefined) {
        await applyDocContentReplace(ctx.db, input.id, input.content, input.baselineContent, ctx.session.user.id);
      }

      if (input.title !== undefined || input.parentId !== undefined || input.sortOrder !== undefined) {
        await ctx.db.doc.update({
          where: { id: input.id },
          data: {
            title: input.title,
            parentId: input.parentId,
            sortOrder: input.sortOrder,
          },
        });
      }

      return ctx.db.doc.findUniqueOrThrow({ where: { id: input.id } });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.doc.deleteMany({
        where: { id: input.id, organizationId: ctx.session.user.organizationId },
      });
      return { success: true };
    }),

  linkIssue: protectedProcedure
    .input(z.object({ docId: z.string(), issueId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.doc.findFirst({
        where: { id: input.docId, organizationId: ctx.session.user.organizationId },
      });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "Doc not found." });
      const issue = await ctx.db.issue.findFirst({
        where: { id: input.issueId, team: { organizationId: ctx.session.user.organizationId } },
      });
      if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found." });

      return ctx.db.docIssueLink.upsert({
        where: { docId_issueId: { docId: input.docId, issueId: input.issueId } },
        create: { docId: input.docId, issueId: input.issueId },
        update: {},
      });
    }),

  unlinkIssue: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.docIssueLink.deleteMany({
        where: { id: input.id, doc: { organizationId: ctx.session.user.organizationId } },
      });
      return { success: true };
    }),
});
