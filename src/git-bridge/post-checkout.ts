// Installed as .git/hooks/post-checkout. Git calls this as:
//   post-checkout <prev-head-sha> <new-head-sha> <branch-checkout-flag>
// flag is "1" for an actual branch switch, "0" for a plain file checkout
// (e.g. `git checkout -- somefile.ts`) — only the former should move an
// issue's status, so this no-ops on anything else.
import { execFileSync } from "node:child_process";
import { createBridgeCaller } from "./context";
import { resolveIssueFromText } from "./resolve";
import { applyForwardTransition } from "../server/github/state-transitions";

async function main() {
  const isBranchCheckout = process.argv[4] === "1";
  if (!isBranchCheckout) return;

  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  if (branch === "HEAD") return; // detached HEAD, e.g. checking out a commit directly, nothing to key off

  const { db, caller } = await createBridgeCaller();
  const issue = await resolveIssueFromText(caller, branch);
  if (!issue) return;

  // Same forward-only/sticky rule the GitHub PR sync already relies on: this
  // will never pull an issue out of a state a human set on purpose (e.g.
  // Canceled), and never fires twice for no reason once it's already Started.
  await applyForwardTransition(db, issue.id, "STARTED");
  console.error(`[novastructur] ${issue.identifier} -> checked out, marked in progress`);
}

main()
  .catch((err) => {
    // A hook must never block a checkout over a bridge failure.
    console.error("[novastructur-bridge] post-checkout:", err instanceof Error ? err.message : err);
  })
  .finally(() => process.exit(0));
