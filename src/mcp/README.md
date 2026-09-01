# novastructur-mcp

A local MCP server that lets an agent (Claude Desktop, Claude Code, or any
other MCP client) operate NovaStructur directly — list/create/update issues,
manage cycles, read/write docs, and semantically search the project — instead
of going through the web UI.

## Why this exists

Linear shipped native MCP agent support in 2026; this is the same idea at
NovaStructur's scale. It reuses NovaStructur's own tRPC routers via
[`appRouter.createCaller`](https://trpc.io/docs/server/server-side-calls)
rather than talking to a separate HTTP API, so every tool call runs through
the exact same validation, automation rules, and notifications a browser
action would trigger — there's no second, thinner code path to keep in sync.

## Requirements

- Node.js 18+ (run via `tsx`, no separate build step)
- A NovaStructur user account to act as (its email identifies which
  organization/permissions the agent operates under)
- An MCP-capable client

## Running it

```bash
cd C:\Users\jessi\Projects\NovaStructur
npm install
npm run mcp
```

`npm run mcp` runs `tsx src/mcp/server.ts` directly against the same SQLite
database (`DATABASE_URL`) the web app uses — no separate server process, no
HTTP port.

## Configuring your MCP client

For Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "novastructur": {
      "command": "npx",
      "args": ["tsx", "C:\\Users\\jessi\\Projects\\NovaStructur\\src\\mcp\\server.ts"],
      "env": {
        "DATABASE_URL": "file:C:\\Users\\jessi\\Projects\\NovaStructur\\dev.db",
        "NOVASTRUCTUR_USER_EMAIL": "you@example.com",
        "AI_KEY_ENCRYPTION_SECRET": "same value as NovaStructur's .env",
        "BINSG_BIN": "C:\\cargo_target\\release\\binsg.exe",
        "BINSG_MODEL_DIR": "C:\\Users\\jessi\\Projects\\binsg\\model"
      }
    }
  }
}
```

Only `NOVASTRUCTUR_USER_EMAIL` is required. `BINSG_BIN`/`BINSG_MODEL_DIR` are
optional — omit them and `search_project` just reports no matches, same as
the web app's AI-draft grounding does. `AI_KEY_ENCRYPTION_SECRET` is only
needed if a tool ever touches `ai.*` procedures (none currently do).

Restart the client after editing the config. The server logs
`NovaStructur MCP server running` to stderr once connected; a missing or
unknown `NOVASTRUCTUR_USER_EMAIL` logs an error and exits before that point.

## Available tools

| Tool | Description |
|---|---|
| `list_teams` | Teams, their key, and their workflow statuses |
| `list_issues` | Filter by team, status, assignee, priority, label, type, or free-text query |
| `get_issue` | Full detail: description, comments, sub-issues, relations, linked docs, GitHub links |
| `create_issue` | Team, title, description, type, priority, assignee, labels, parent |
| `update_issue` | Title, description, status, priority, type, assignee, or labels (replaces the full set) |
| `add_comment` | Add a comment to an issue |
| `list_cycles` | A team's cycles with date range, name, issue count |
| `create_cycle` | Start a new cycle |
| `list_docs` | The wiki page tree |
| `get_doc` | A doc's full content + linked issues |
| `create_doc` | Create a wiki page (optionally under a parent) |
| `search_project` | Semantic search (binsg) over docs + issues — find prior art before creating something new |

Every tool that takes team/status/assignee/label arguments accepts a
human-readable name (team key, status name, member name/email, label name),
not an internal ID — resolution happens inside the tool and fails with a
clear "no X named Y, valid: ..." message if it doesn't match.

## Known limitations

- No `delete_issue` tool — deletion isn't exposed to agents by design.
- Automation rules, saved views, notifications, and GitHub-link management
  aren't exposed as tools yet; the surface covers the core issue/cycle/doc
  loop, not every tRPC procedure.
- Single-file, no tests — same tradeoff `github-mcp` documents for the same
  reason: the surface is a thin, mostly mechanical mapping onto existing,
  already-tested tRPC procedures.

## Extending it

Add a tool's schema to the array in the `ListToolsRequestSchema` handler, add
a `case` in the `CallToolRequestSchema` switch that calls the matching
`caller.<router>.<procedure>(...)`, and shape the response as
`{ content: [{ type: "text", text: ... }] }`. No rebuild step — restart your
MCP client to pick up the change.
