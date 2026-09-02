import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { db } from "../server/db";
import { appRouter } from "../server/api/root";

type Caller = ReturnType<typeof appRouter.createCaller>;

async function resolveTeamId(caller: Caller, teamKey?: string): Promise<string> {
  const teams = await caller.team.list();
  if (teamKey) {
    const team = teams.find((t) => t.key.toLowerCase() === teamKey.toLowerCase());
    if (!team) throw new Error(`No team with key "${teamKey}". Teams: ${teams.map((t) => t.key).join(", ")}`);
    return team.id;
  }
  if (teams.length === 1) return teams[0]!.id;
  throw new Error(`Multiple teams exist — pass "team" (one of: ${teams.map((t) => t.key).join(", ")})`);
}

async function resolveStateId(caller: Caller, teamId: string, statusName: string): Promise<string> {
  const teams = await caller.team.list();
  const team = teams.find((t) => t.id === teamId);
  const state = team?.workflowStates.find((s) => s.name.toLowerCase() === statusName.toLowerCase());
  if (!state) {
    const valid = team?.workflowStates.map((s) => s.name).join(", ") ?? "";
    throw new Error(`No status "${statusName}" for this team. Valid: ${valid}`);
  }
  return state.id;
}

async function resolveAssigneeId(caller: Caller, name: string): Promise<string | null> {
  if (name.toLowerCase() === "unassigned") return null;
  const members = await caller.user.listOrgMembers();
  const member = members.find(
    (m) => m.name.toLowerCase() === name.toLowerCase() || m.email.toLowerCase() === name.toLowerCase()
  );
  if (!member) throw new Error(`No member named "${name}". Members: ${members.map((m) => m.name).join(", ")}`);
  return member.id;
}

async function resolveLabelIds(caller: Caller, names: string[]): Promise<string[]> {
  const labels = await caller.label.list();
  return names.map((name) => {
    const label = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (!label) throw new Error(`No label "${name}". Labels: ${labels.map((l) => l.name).join(", ")}`);
    return label.id;
  });
}

function summarizeIssue(issue: {
  identifier: string;
  title: string;
  priority: string;
  state: { name: string };
  assignee: { name: string } | null;
  labels: { label: { name: string } }[];
}) {
  return {
    identifier: issue.identifier,
    title: issue.title,
    status: issue.state.name,
    priority: issue.priority,
    assignee: issue.assignee?.name ?? null,
    labels: issue.labels.map((l) => l.label.name),
  };
}

async function main() {
  const actorEmail = process.env.NOVASTRUCTUR_USER_EMAIL;
  if (!actorEmail) {
    console.error("NOVASTRUCTUR_USER_EMAIL environment variable is required");
    process.exit(1);
  }

  const actor = await db.user.findUnique({ where: { email: actorEmail } });
  if (!actor) {
    console.error(`No NovaStructur user found for "${actorEmail}"`);
    process.exit(1);
  }

  const caller = appRouter.createCaller({
    db,
    session: {
      user: {
        id: actor.id,
        organizationId: actor.organizationId,
        avatarColor: actor.avatarColor,
        name: actor.name,
        email: actor.email,
      },
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    },
  });

  const server = new Server({ name: "novastructur-mcp", version: "1.0.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_teams",
        description: "List teams, their key, and their workflow statuses",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "list_issues",
        description: "List issues, optionally filtered",
        inputSchema: {
          type: "object",
          properties: {
            team: { type: "string", description: "Team key, e.g. ENG" },
            status: { type: "string", description: "Workflow status name, e.g. 'In Progress'" },
            assignee: { type: "string", description: "Member name/email, or 'unassigned'" },
            priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW", "NO_PRIORITY"] },
            label: { type: "string" },
            type: { type: "string", enum: ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] },
            query: { type: "string", description: "Text search over title/description/identifier" },
          },
        },
      },
      {
        name: "get_issue",
        description: "Get full detail on one issue: description, comments, sub-issues, relations, linked docs",
        inputSchema: {
          type: "object",
          properties: { identifier: { type: "string", description: "e.g. ENG-8" } },
          required: ["identifier"],
        },
      },
      {
        name: "create_issue",
        description: "Create an issue",
        inputSchema: {
          type: "object",
          properties: {
            team: { type: "string", description: "Team key — required if there's more than one team" },
            title: { type: "string" },
            description: { type: "string" },
            type: { type: "string", enum: ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] },
            priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW", "NO_PRIORITY"] },
            assignee: { type: "string", description: "Member name or email" },
            labels: { type: "array", items: { type: "string" } },
            parent: { type: "string", description: "Parent issue identifier, to create this as a sub-issue" },
          },
          required: ["title"],
        },
      },
      {
        name: "update_issue",
        description: "Update an existing issue's title, description, status, priority, assignee, type, or labels",
        inputSchema: {
          type: "object",
          properties: {
            identifier: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            status: { type: "string" },
            priority: { type: "string", enum: ["URGENT", "HIGH", "MEDIUM", "LOW", "NO_PRIORITY"] },
            type: { type: "string", enum: ["EPIC", "STORY", "TASK", "BUG", "SUBTASK"] },
            assignee: { type: "string", description: "Member name/email, or 'unassigned'" },
            labels: { type: "array", items: { type: "string" }, description: "Replaces the full label set" },
          },
          required: ["identifier"],
        },
      },
      {
        name: "add_comment",
        description: "Add a comment to an issue",
        inputSchema: {
          type: "object",
          properties: { identifier: { type: "string" }, body: { type: "string" } },
          required: ["identifier", "body"],
        },
      },
      {
        name: "list_cycles",
        description: "List a team's cycles (sprints) with their date range and status",
        inputSchema: {
          type: "object",
          properties: { team: { type: "string" } },
        },
      },
      {
        name: "create_cycle",
        description: "Start a new cycle for a team",
        inputSchema: {
          type: "object",
          properties: {
            team: { type: "string" },
            name: { type: "string" },
            startDate: { type: "string", description: "ISO date" },
            endDate: { type: "string", description: "ISO date" },
          },
          required: ["startDate", "endDate"],
        },
      },
      {
        name: "list_docs",
        description: "List the project's wiki pages (id, title, parent)",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "get_doc",
        description: "Get a doc's full markdown content and its linked issues",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      },
      {
        name: "create_doc",
        description: "Create a wiki page",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            parentId: { type: "string" },
          },
          required: ["title"],
        },
      },
      {
        name: "search_project",
        description:
          "Semantic search over this project's docs and issues (local embeddings, not keyword match) — " +
          "use this to find relevant prior art before creating something new",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" }, topK: { type: "number", default: 5 } },
          required: ["query"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const a = (args ?? {}) as Record<string, unknown>;

    try {
      switch (name) {
        case "list_teams": {
          const teams = await caller.team.list();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  teams.map((t) => ({
                    key: t.key,
                    name: t.name,
                    issueCount: t._count.issues,
                    statuses: t.workflowStates.map((s) => s.name),
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "list_issues": {
          // teamId stays undefined (searching across all teams) unless a team was
          // named, or a status filter forces resolution (workflow states are
          // per-team, so "status=Backlog" needs *some* team to resolve it against).
          const explicitTeamId = a.team ? await resolveTeamId(caller, a.team as string) : undefined;
          const teamId = a.status && !explicitTeamId ? await resolveTeamId(caller, undefined) : explicitTeamId;
          const assigneeId =
            a.assignee !== undefined ? ((await resolveAssigneeId(caller, a.assignee as string)) ?? "unassigned") : undefined;
          const stateId = a.status ? await resolveStateId(caller, teamId!, a.status as string) : undefined;
          const labelId = a.label ? (await resolveLabelIds(caller, [a.label as string]))[0] : undefined;
          const issues = await caller.issue.list({
            teamId,
            stateId,
            assigneeId,
            labelId,
            priority: a.priority as never,
            type: a.type as never,
            query: a.query as string | undefined,
          });
          return { content: [{ type: "text", text: JSON.stringify(issues.map(summarizeIssue), null, 2) }] };
        }

        case "get_issue": {
          const issue = await caller.issue.byIdentifier({ identifier: (a.identifier as string).toUpperCase() });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    ...summarizeIssue(issue),
                    description: issue.description,
                    creator: issue.creator.name,
                    cycle: issue.cycle ? `Cycle ${issue.cycle.number}` : null,
                    subIssues: issue.subIssues.map((s) => ({ identifier: s.identifier, title: s.title, status: s.state.name })),
                    comments: issue.comments.map((c) => ({ author: c.author.name, body: c.body, at: c.createdAt })),
                    linkedDocs: issue.linkedDocs.map((l) => ({ id: l.doc.id, title: l.doc.title })),
                    githubLinks: issue.githubLinks.map((g) => `${g.repoOwner}/${g.repoName}#${g.prNumber} (${g.prState})`),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "create_issue": {
          const teamId = await resolveTeamId(caller, a.team as string | undefined);
          const issue = await caller.issue.create({
            teamId,
            title: a.title as string,
            description: a.description as string | undefined,
            type: a.type as never,
            priority: a.priority as never,
            assigneeId: a.assignee ? (await resolveAssigneeId(caller, a.assignee as string)) ?? undefined : undefined,
            labelIds: a.labels ? await resolveLabelIds(caller, a.labels as string[]) : undefined,
            parentId: a.parent ? (await caller.issue.byIdentifier({ identifier: (a.parent as string).toUpperCase() })).id : undefined,
          });
          return { content: [{ type: "text", text: `Created ${issue.identifier}: ${issue.title}` }] };
        }

        case "update_issue": {
          const existing = await caller.issue.byIdentifier({ identifier: (a.identifier as string).toUpperCase() });
          const stateId = a.status ? await resolveStateId(caller, existing.team.id, a.status as string) : undefined;
          const assigneeId =
            a.assignee !== undefined ? await resolveAssigneeId(caller, a.assignee as string) : undefined;
          const issue = await caller.issue.update({
            id: existing.id,
            title: a.title as string | undefined,
            description: a.description as string | undefined,
            type: a.type as never,
            priority: a.priority as never,
            stateId,
            assigneeId,
          });

          // update doesn'"'"'t take a bulk label array (see issue.ts'"'"'s addLabel/
          // removeLabel comment: a whole-array replace can silently clobber a
          // concurrent add/remove of a *different* label), so a label change
          // here is applied as a diff against the current set instead.
          if (a.labels) {
            const desiredIds = new Set(await resolveLabelIds(caller, a.labels as string[]));
            const currentIds = new Set(existing.labels.map((l) => l.label.id));
            for (const id of desiredIds) {
              if (!currentIds.has(id)) await caller.issue.addLabel({ id: existing.id, labelId: id });
            }
            for (const id of currentIds) {
              if (!desiredIds.has(id)) await caller.issue.removeLabel({ id: existing.id, labelId: id });
            }
          }

          return { content: [{ type: "text", text: `Updated ${issue.identifier}` }] };
        }

        case "add_comment": {
          const existing = await caller.issue.byIdentifier({ identifier: (a.identifier as string).toUpperCase() });
          await caller.issue.addComment({ issueId: existing.id, body: a.body as string });
          return { content: [{ type: "text", text: `Comment added to ${existing.identifier}` }] };
        }

        case "list_cycles": {
          const teamId = await resolveTeamId(caller, a.team as string | undefined);
          const cycles = await caller.cycle.list({ teamId });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  cycles.map((c) => ({
                    number: c.number,
                    name: c.name,
                    startDate: c.startDate,
                    endDate: c.endDate,
                    issueCount: c._count.issues,
                  })),
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "create_cycle": {
          const teamId = await resolveTeamId(caller, a.team as string | undefined);
          const cycle = await caller.cycle.create({
            teamId,
            name: a.name as string | undefined,
            startDate: new Date(a.startDate as string).toISOString(),
            endDate: new Date(a.endDate as string).toISOString(),
          });
          return { content: [{ type: "text", text: `Created cycle ${cycle.number}${cycle.name ? ` (${cycle.name})` : ""}` }] };
        }

        case "list_docs": {
          const docs = await caller.doc.list();
          return { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] };
        }

        case "get_doc": {
          const doc = await caller.doc.byId({ id: a.id as string });
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    title: doc.title,
                    content: doc.content,
                    linkedIssues: doc.linkedIssues.map((l) => l.issue.identifier),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        }

        case "create_doc": {
          const doc = await caller.doc.create({ title: a.title as string, parentId: a.parentId as string | undefined });
          if (a.content) await caller.doc.update({ id: doc.id, content: a.content as string });
          return { content: [{ type: "text", text: `Created doc "${doc.title}" (id: ${doc.id})` }] };
        }

        case "search_project": {
          const { semanticSearch } = await import("../server/rag/binsg");
          const matches = await semanticSearch(db, actor.organizationId, a.query as string, (a.topK as number) ?? 5);
          if (matches.length === 0) {
            return {
              content: [
                {
                  type: "text",
                  text: "No matches (or binsg isn't configured — set BINSG_BIN/BINSG_MODEL_DIR).",
                },
              ],
            };
          }
          return { content: [{ type: "text", text: JSON.stringify(matches, null, 2) }] };
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      return { content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }], isError: true };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("NovaStructur MCP server running");
}

main();
