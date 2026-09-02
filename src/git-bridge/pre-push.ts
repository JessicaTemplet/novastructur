// Installed as .git/hooks/pre-push. Chosen over a post-commit hook on
// purpose: a comment per local commit would spam an issue with every "wip"
// and "fix typo" you make before you've even shared the work, which is
// exactly the kind of upkeep-that-becomes-a-job this bridge exists to
// avoid. Pushing is the moment the work becomes visible to anyone else, so
// that's the moment worth a comment, one summary per push, not one per
// commit.
//
// Git feeds ref updates on stdin, one line per pushed ref:
//   <local ref> <local sha1> <remote ref> <remote sha1>
import { execFileSync } from "node:child_process";
import * as readline from "node:readline";
import { createBridgeCaller } from "./context";
import { resolveIssueFromText } from "./resolve";
import { linkPrIfFound } from "./pr-link";

const ZERO_SHA = "0000000000000000000000000000000000000000";
const MAX_COMMITS = 20; // cap the summary — this is a log entry, not a full history dump

async function readStdinLines(): Promise<string[]> {
  const lines: string[] = [];
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  return lines;
}

function commitShasForPush(localSha: string, remoteSha: string): string[] {
  try {
    // Brand-new remote branch (remoteSha is all zeros): there's no prior
    // point to diff from, so just show the most recent commits rather than
    // the branch's entire history back to its fork point.
    const range = remoteSha === ZERO_SHA ? localSha : `${remoteSha}..${localSha}`;
    const out = execFileSync("git", ["rev-list", `--max-count=${MAX_COMMITS}`, range], { encoding: "utf8" });
    return out.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function commitSubject(sha: string): string {
  return execFileSync("git", ["log", "-1", "--pretty=%s", sha], { encoding: "utf8" }).trim();
}

async function main() {
  const lines = await readStdinLines();
  if (lines.length === 0) return; // e.g. `git push --delete`, nothing pushed

  const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  const { caller } = await createBridgeCaller();

  for (const line of lines) {
    const [, localSha, , remoteSha] = line.split(" ");
    if (!localSha || localSha === ZERO_SHA) continue; // deleting a remote ref, not pushing commits

    const shas = commitShasForPush(localSha, remoteSha ?? ZERO_SHA);
    if (shas.length === 0) continue;

    const subjects = shas.map(commitSubject);

    // Prefer a key mentioned in one of the pushed commits; fall back to the
    // branch name so this still lands somewhere even if nobody typed the
    // key into a commit message this time.
    let issue = null;
    for (const subject of subjects) {
      issue = await resolveIssueFromText(caller, subject);
      if (issue) break;
    }
    issue ??= await resolveIssueFromText(caller, branch);
    if (!issue) continue;

    const summary = shas.map((sha, i) => `- ${sha.slice(0, 7)} ${subjects[i]}`).join("\n");
    await caller.issue.addComment({
      issueId: issue.id,
      body: `Pushed ${shas.length} commit${shas.length === 1 ? "" : "s"} on \`${branch}\`:\n${summary}`,
    });
    console.error(`[novastructur] logged push on ${issue.identifier}`);

    const prUrl = await linkPrIfFound(caller, issue.id);
    if (prUrl) console.error(`[novastructur] linked ${prUrl}`);
  }
}

main()
  .catch((err) => {
    // A hook must never block a push over a bridge failure.
    console.error("[novastructur-bridge] pre-push:", err instanceof Error ? err.message : err);
  })
  .finally(() => process.exit(0));
