"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Plus, X, RefreshCw, Copy, Check } from "lucide-react";
import { api } from "@/trpc/react";
import { PrStateBadge, type GitHubPrState } from "@/lib/issue-meta";
import { suggestBranchName } from "@/lib/github";

type GitHubLink = {
  id: string;
  repoOwner: string;
  repoName: string;
  prNumber: number;
  prUrl: string;
  prTitle: string;
  prState: GitHubPrState;
  isDraft: boolean;
};

type IssueWithGithubLinks = {
  id: string;
  identifier: string;
  title: string;
  githubLinks: GitHubLink[];
};

const SYNC_INTERVAL_MS = 60_000;

export function GithubLinks({ issue }: { issue: IssueWithGithubLinks }) {
  const [adding, setAdding] = useState(false);
  const [prUrl, setPrUrl] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const utils = api.useUtils();

  const { data: connection } = api.github.getConnection.useQuery();

  const linkPr = api.github.linkPr.useMutation({
    onSuccess: () => {
      setPrUrl("");
      setAdding(false);
      setError("");
      void utils.issue.byIdentifier.invalidate();
    },
    onError: (e) => setError(e.message),
  });

  const unlinkPr = api.github.unlinkPr.useMutation({
    onSuccess: () => void utils.issue.byIdentifier.invalidate(),
  });

  const syncLinks = api.github.syncIssueLinks.useMutation({
    onSuccess: () => void utils.issue.byIdentifier.invalidate(),
  });

  const hasOpenLinks = issue.githubLinks.some((l) => l.prState === "OPEN");

  // Auto-sync while there's an open PR to watch, but a failure (e.g. a GitHub
  // rate limit) pauses the interval rather than retrying blind every 60s —
  // clicking "Sync" manually clears the mutation's error state and re-arms it.
  useEffect(() => {
    if (!connection?.connected || !hasOpenLinks || syncLinks.isError) return;
    const interval = setInterval(() => {
      syncLinks.mutate({ issueId: issue.id });
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.connected, hasOpenLinks, issue.id, syncLinks.isError]);

  const branchName = suggestBranchName(connection?.githubLogin ?? "you", issue.identifier, issue.title);

  async function copyBranchName() {
    try {
      await navigator.clipboard.writeText(branchName);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be denied by the browser; nothing to recover here.
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-display text-[10px] font-bold uppercase tracking-wide text-ns-text-faint">
          GitHub {issue.githubLinks.length > 0 && `(${issue.githubLinks.length})`}
        </h3>
        <div className="flex items-center gap-2">
          {issue.githubLinks.length > 0 && connection?.connected && (
            <button
              onClick={() => syncLinks.mutate({ issueId: issue.id })}
              disabled={syncLinks.isPending}
              className="flex items-center gap-1 text-xs text-ns-text-faint hover:text-ns-text-dim"
            >
              <RefreshCw className={`h-3 w-3 ${syncLinks.isPending ? "animate-spin" : ""}`} /> Sync
            </button>
          )}
          <button
            onClick={() => (connection?.connected ? setAdding((v) => !v) : undefined)}
            disabled={!connection?.connected}
            title={connection?.connected ? undefined : "Connect GitHub in Settings → GitHub first"}
            className="flex items-center gap-1 text-xs text-ns-text-faint hover:text-ns-text-dim disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> Link PR
          </button>
        </div>
      </div>

      <div className="mb-2 flex items-center gap-1.5 text-xs text-ns-text-faint">
        <span>Branch:</span>
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-ns-text-dim">{branchName}</code>
        <button onClick={copyBranchName} className="text-ns-text-faint hover:text-ns-text-dim">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>

      {adding && (
        <div className="mb-2 flex items-center gap-1.5">
          <input
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && prUrl.trim() && linkPr.mutate({ issueId: issue.id, prUrl })}
            placeholder="https://github.com/owner/repo/pull/123"
            className="w-64 rounded-md border border-ns-border-strong bg-white/[.03] px-2 py-1 text-xs text-ns-text-body outline-none placeholder:text-ns-text-faint"
          />
          <button
            onClick={() => linkPr.mutate({ issueId: issue.id, prUrl })}
            disabled={!prUrl.trim() || linkPr.isPending}
            className="rounded-md bg-ns-accent-bg px-2 py-1 text-xs font-bold text-ns-accent ring-1 ring-ns-accent/70 disabled:opacity-40"
          >
            {linkPr.isPending ? "Linking…" : "Link"}
          </button>
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      )}

      {syncLinks.isError && (
        <div className="mb-2 text-xs text-red-400">{syncLinks.error.message}</div>
      )}

      {issue.githubLinks.length === 0 && !adding && (
        <div className="text-xs text-ns-text-faint">No linked pull requests yet.</div>
      )}

      <div className="space-y-1">
        {issue.githubLinks.map((link) => (
          <div key={link.id} className="flex items-center gap-2 text-sm">
            <PrStateBadge state={link.prState} isDraft={link.isDraft} />
            <a
              href={link.prUrl}
              target="_blank"
              rel="noreferrer"
              className="flex min-w-0 items-center gap-1 truncate text-ns-text-body hover:underline"
            >
              <span className="truncate">
                {link.repoOwner}/{link.repoName}#{link.prNumber} {link.prTitle}
              </span>
              <ExternalLink className="h-3 w-3 shrink-0 text-ns-text-faint" />
            </a>
            <button
              onClick={() => unlinkPr.mutate({ linkId: link.id })}
              className="ml-auto shrink-0 text-ns-text-faint hover:text-red-400"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
