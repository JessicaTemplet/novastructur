# novastructur git-bridge

Local git hooks that keep issue status current as you work, without a
separate "now go update the ticket" step. The complaint this exists to fix:
tools like Jira turn into upkeep because nothing updates itself. This
watches two moments you'd hit anyway (checking out a branch, pushing) and
writes to NovaStructur through the same tRPC routers the web UI uses, same
validation, same automation, same forward-only status-transition rule the
GitHub PR sync already relies on.

## What it does

| Hook | Fires on | Action |
|---|---|---|
| `post-checkout` | switching to a branch named with an issue key, e.g. `eng-142-fix-thing` | moves the issue to its team's STARTED status (a no-op if it's already started, or if a human moved it somewhere terminal like Canceled) |
| `pre-push` | pushing commits | adds **one** comment on the issue summarizing the commits just pushed (sha + subject line each); if the `gh` CLI is installed, authenticated, and reports an open PR on the branch, also links it (reuses `github.linkPr`, so it drives the same OPEN→STARTED / MERGED→COMPLETED transition the web UI's paste-a-PR-URL box does) |

Deliberately **not** `post-commit`: a comment per local commit would spam
the issue with every "wip" and "fix typo" before the work is even shared.
Pushing is the moment it becomes visible to anyone else, so that's the
moment worth a comment.

The issue key is pulled from the commit messages first, falling back to the
branch name if none of the pushed commits mention one, so a whole feature
branch's work still lands on the issue even if you don't repeat the key in
every commit.

## Setup

1. Add the acting user to `.env` (same variable the MCP server uses):
   ```
   NOVASTRUCTUR_USER_EMAIL="you@example.com"
   ```
2. Install the hooks:
   ```bash
   npm run install-git-hooks
   ```
   Safe to rerun. Won't overwrite a hook it didn't install unless you pass
   `--force` (e.g. `npx tsx scripts/install-git-hooks.ts --force`) — if you
   already have a `pre-push` hook from something else (husky, lint-staged),
   it'll tell you instead of clobbering it.

## What's optional

- **GitHub auto-linking** needs the [`gh` CLI](https://cli.github.com)
  installed and authenticated (`gh auth login`) *and* GitHub connected in
  NovaStructur (Settings → GitHub). Missing either one just means the PR
  auto-link step quietly does nothing, same "skip, don't fail" reasoning as
  `search_project` when binsg isn't configured.

## Known limitations

- **Issue key matching is a plain regex** (`TEAM-123` shaped), not aware of
  which team keys actually exist. A branch or commit that happens to look
  key-shaped but doesn't match a real issue is silently ignored, not an
  error, so this is a "misses some real matches on typos" risk, not a "does
  something wrong" one.
- **First push of a new branch** shows at most the last 20 commits in the
  summary comment, not the full history back to the fork point, so a big
  branch pushed for the first time won't dump its entire log into a comment.
- **No un-doing.** Same as the GitHub sync: transitions only move an issue
  forward, never automatically move it backward. Moving something back is
  always a manual, human action.
- **Single local DB.** Like the MCP server, this talks to the same SQLite
  file the web app uses directly, no separate API call. Fine for local dev;
  if NovaStructur ever moves to a hosted Postgres setup, this needs to
  either call the deployed API over HTTP or run somewhere with DB access.

## Files

- `parse.ts` — pulls an issue key out of free text
- `context.ts` — loads `.env`, resolves the acting user, builds a tRPC
  caller (same pattern as `src/mcp/server.ts`)
- `resolve.ts` — key text → real issue, or `null`, never throws on a miss
- `pr-link.ts` — best-effort `gh pr view` + `github.linkPr`
- `post-checkout.ts`, `pre-push.ts` — the two hook entry points
- `../../scripts/install-git-hooks.ts` — writes the `.git/hooks/*` shims
