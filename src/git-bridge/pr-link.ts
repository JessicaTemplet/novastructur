import { execFileSync } from "node:child_process";
import type { Caller } from "./context";

type GhPr = {
  url: string;
  state: "OPEN" | "MERGED" | "CLOSED";
  isDraft: boolean;
};

// Best-effort: no `gh` CLI installed, `gh` not authenticated, or no PR open
// on this branch are all the same outcome here — nothing to link, not an
// error. This is a bonus on top of the status/comment tracking, never a
// reason to fail a hook.
function findPrForCurrentBranch(): GhPr | null {
  try {
    const out = execFileSync("gh", ["pr", "view", "--json", "url,state,isDraft"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const pr = JSON.parse(out) as GhPr;
    return pr.url ? pr : null;
  } catch {
    return null;
  }
}

// Reuses the same github.linkPr procedure the web UI's "paste a PR URL" box
// calls — upsert-based, so calling it again on an already-linked PR just
// refreshes state and re-runs applyForwardTransition's forward-only check,
// it doesn't error or duplicate the link.
export async function linkPrIfFound(caller: Caller, issueId: string): Promise<string | null> {
  const pr = findPrForCurrentBranch();
  if (!pr) return null;
  try {
    await caller.github.linkPr({ issueId, prUrl: pr.url });
    return pr.url;
  } catch {
    // Most likely cause: this NovaStructur user hasn't connected GitHub in
    // Settings → GitHub yet. Silent skip, same reasoning as above.
    return null;
  }
}
