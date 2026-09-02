import { parseIssueKey } from "./parse";
import type { Caller } from "./context";

// Looks for an issue key in text and resolves it to a real issue. Returns
// null both when there's no key-shaped substring AND when there is one but
// it doesn't match a real issue (wrong team key, typo, coincidental match
// like "V2-1234") — a hook that finds nothing should always just no-op,
// never throw over a branch name that happens to look like a key.
export async function resolveIssueFromText(caller: Caller, text: string) {
  const key = parseIssueKey(text);
  if (!key) return null;
  try {
    return await caller.issue.byIdentifier({ identifier: key });
  } catch {
    return null;
  }
}
