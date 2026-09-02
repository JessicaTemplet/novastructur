// Pulls a NovaStructur issue key (e.g. "ENG-142") out of free text — a
// branch name, a commit message, a pushed commit subject. Team keys aren't
// constrained to a fixed format in the schema, so this stays permissive
// (letters/digits, must start with a letter) rather than hardcoding "ENG".
//
// Known false-positive risk: any hyphenated alphanumeric-then-digits token
// matches, e.g. a branch called "v2-1234-notes" would parse as key "V2",
// number "1234". In practice this only matters if it happens to collide
// with a real team key + real issue number, and resolveIssueFromText
// (resolve.ts) already no-ops silently when the "key" doesn't resolve to an
// actual issue, so a stray match is harmless, not a wrong write.
const ISSUE_KEY_PATTERN = /\b([A-Za-z][A-Za-z0-9]{1,9})-(\d{1,6})\b/;

export function parseIssueKey(text: string): string | null {
  const match = ISSUE_KEY_PATTERN.exec(text);
  if (!match) return null;
  return `${match[1]!.toUpperCase()}-${match[2]}`;
}
