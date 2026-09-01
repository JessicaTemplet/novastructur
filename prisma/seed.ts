import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import bcrypt from "bcryptjs";

const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const db = new PrismaClient({ adapter });

async function main() {
  await db.notification.deleteMany();
  await db.automationRule.deleteMany();
  await db.savedView.deleteMany();
  await db.docIssueLink.deleteMany();
  await db.doc.deleteMany();
  await db.comment.deleteMany();
  await db.issueRelation.deleteMany();
  await db.issueLabel.deleteMany();
  await db.issue.deleteMany();
  await db.cycle.deleteMany();
  await db.label.deleteMany();
  await db.workflowState.deleteMany();
  await db.teamMembership.deleteMany();
  await db.team.deleteMany();
  await db.user.deleteMany();
  await db.organization.deleteMany();

  const org = await db.organization.create({
    data: { name: "Acme Inc", slug: "acme" },
  });

  const passwordHash = await bcrypt.hash("password123", 10);

  const lilith = await db.user.create({
    data: {
      email: "lilith@acme.dev",
      name: "Lilith Montrose",
      passwordHash,
      avatarColor: "#6366f1",
      organizationId: org.id,
      role: "ADMIN",
    },
  });

  const dana = await db.user.create({
    data: {
      email: "dana@acme.dev",
      name: "Dana Kim",
      passwordHash,
      avatarColor: "#22c55e",
      organizationId: org.id,
    },
  });

  const remy = await db.user.create({
    data: {
      email: "remy@acme.dev",
      name: "Remy Okafor",
      passwordHash,
      avatarColor: "#f97316",
      organizationId: org.id,
    },
  });

  const team = await db.team.create({
    data: {
      name: "Engineering",
      key: "ENG",
      organizationId: org.id,
      issueCounter: 0,
      memberships: {
        create: [
          { userId: lilith.id, role: "ADMIN" },
          { userId: dana.id, role: "MEMBER" },
          { userId: remy.id, role: "MEMBER" },
        ],
      },
      workflowStates: {
        create: [
          { name: "Triage", type: "TRIAGE", color: "#f59e0b", position: 0 },
          { name: "Backlog", type: "BACKLOG", color: "#9ca3af", position: 1 },
          { name: "Todo", type: "UNSTARTED", color: "#64748b", position: 2 },
          { name: "In Progress", type: "STARTED", color: "#3b82f6", position: 3 },
          { name: "In Review", type: "STARTED", color: "#a855f7", position: 4 },
          { name: "Done", type: "COMPLETED", color: "#22c55e", position: 5 },
          { name: "Canceled", type: "CANCELED", color: "#ef4444", position: 6 },
        ],
      },
    },
    include: { workflowStates: true },
  });

  const state = Object.fromEntries(team.workflowStates.map((s) => [s.name, s]));

  const [bug, feature, improvement, design, docs] = await Promise.all([
    db.label.create({ data: { name: "Bug", color: "#ef4444", organizationId: org.id } }),
    db.label.create({ data: { name: "Feature", color: "#3b82f6", organizationId: org.id } }),
    db.label.create({ data: { name: "Improvement", color: "#a855f7", organizationId: org.id } }),
    db.label.create({ data: { name: "Design", color: "#ec4899", organizationId: org.id } }),
    db.label.create({ data: { name: "Docs", color: "#6b7280", organizationId: org.id } }),
  ]);

  const dayMs = 24 * 60 * 60 * 1000;
  const now = Date.now();

  let counter = 0;
  const nextNumber = () => ++counter;

  const epic = await db.issue.create({
    data: {
      identifier: `ENG-${nextNumber()}`,
      number: counter,
      title: "Core Issue & Work Tracking",
      description: "Foundational issue model: hierarchy, statuses, priorities, labels, search.",
      type: "EPIC",
      priority: "HIGH",
      teamId: team.id,
      stateId: state["In Progress"].id,
      creatorId: lilith.id,
      assigneeId: lilith.id,
      sortOrder: 1000,
      createdAt: new Date(now - 10 * dayMs),
      dueDate: new Date(now + 20 * dayMs),
      labels: { create: [{ labelId: feature.id }] },
    },
  });

  await db.issue.create({
    data: {
      identifier: `ENG-${nextNumber()}`,
      number: counter,
      title: "GitHub Integration",
      description: "Branch/PR auto-linking with forward-only workflow-state automation.",
      type: "EPIC",
      priority: "HIGH",
      teamId: team.id,
      stateId: state["Done"].id,
      creatorId: lilith.id,
      assigneeId: lilith.id,
      sortOrder: 500,
      createdAt: new Date(now - 25 * dayMs),
      dueDate: new Date(now - 8 * dayMs),
      completedAt: new Date(now - 8 * dayMs),
      labels: { create: [{ labelId: feature.id }] },
    },
  });

  const issuesData = [
    {
      title: "Design issue data model (hierarchy, workflow, labels)",
      priority: "URGENT",
      state: "Done",
      assignee: lilith,
      labels: [feature],
      parentId: epic.id,
      description: "Prisma schema covering issues, sub-issues, workflow states, labels, relations.",
    },
    {
      title: "Build issue list view with filters",
      priority: "HIGH",
      state: "In Progress",
      assignee: lilith,
      labels: [feature],
      parentId: epic.id,
    },
    {
      title: "Build kanban board with drag-and-drop",
      priority: "HIGH",
      state: "Todo",
      assignee: dana,
      labels: [feature],
      parentId: epic.id,
    },
    {
      title: "Command palette (Cmd+K) and keyboard shortcuts",
      priority: "MEDIUM",
      state: "Backlog",
      assignee: remy,
      labels: [feature, improvement],
      parentId: epic.id,
    },
    {
      title: "Quick-create issue flow — title only, 2 second create",
      priority: "HIGH",
      state: "Todo",
      assignee: null,
      labels: [feature],
      parentId: epic.id,
    },
    {
      title: "Fix: due date picker shows wrong month on month boundary",
      priority: "LOW",
      state: "Backlog",
      assignee: null,
      labels: [bug],
    },
    {
      title: "Sidebar collapses unexpectedly on window resize",
      priority: "MEDIUM",
      state: "Triage",
      assignee: null,
      labels: [bug, design],
    },
    {
      title: "Write API docs for issue router",
      priority: "NO_PRIORITY",
      state: "Backlog",
      assignee: remy,
      labels: [docs],
    },
    {
      title: "Improve empty states across list and board views",
      priority: "LOW",
      state: "Backlog",
      assignee: null,
      labels: [design, improvement],
    },
    {
      title: "Investigate flaky search results on large backlog",
      priority: "MEDIUM",
      state: "Triage",
      assignee: dana,
      labels: [bug],
    },
  ] as const;

  const createdIssues = [];
  for (const data of issuesData) {
    const issue = await db.issue.create({
      data: {
        identifier: `ENG-${nextNumber()}`,
        number: counter,
        title: data.title,
        description: "description" in data ? data.description : undefined,
        type: "TASK",
        priority: data.priority,
        teamId: team.id,
        stateId: state[data.state].id,
        creatorId: lilith.id,
        assigneeId: data.assignee?.id,
        parentId: "parentId" in data ? data.parentId : undefined,
        sortOrder: counter * 1000,
        labels: { create: data.labels.map((label) => ({ labelId: label.id })) },
      },
    });
    createdIssues.push(issue);
  }

  const cycle1 = await db.cycle.create({
    data: {
      number: 1,
      teamId: team.id,
      startDate: new Date(now - 20 * dayMs),
      endDate: new Date(now - 7 * dayMs),
    },
  });
  const cycle2 = await db.cycle.create({
    data: {
      number: 2,
      teamId: team.id,
      startDate: new Date(now - 3 * dayMs),
      endDate: new Date(now + 10 * dayMs),
    },
  });
  await db.team.update({ where: { id: team.id }, data: { cycleCounter: 2 } });

  // Put the first (done) task in the completed cycle, and the two in-flight
  // tasks in the active cycle — everything else stays in the backlog.
  await db.issue.update({ where: { id: createdIssues[0]!.id }, data: { cycleId: cycle1.id } });
  await db.issue.update({ where: { id: createdIssues[1]!.id }, data: { cycleId: cycle2.id } });
  await db.issue.update({ where: { id: createdIssues[2]!.id }, data: { cycleId: cycle2.id } });

  await db.comment.create({
    data: {
      issueId: epic.id,
      authorId: dana.id,
      body: "Kicking this off — let's keep the first pass tight: hierarchy, statuses, priority, labels, search. No custom fields yet.",
    },
  });
  await db.comment.create({
    data: {
      issueId: createdIssues[0]!.id,
      authorId: lilith.id,
      body: "Schema's in. SQLite by default for local dev, Postgres is a one-line swap later.",
    },
  });

  await db.team.update({ where: { id: team.id }, data: { issueCounter: counter } });

  console.log(`Seeded org "${org.name}" with team "${team.name}" (${counter} issues).`);
  console.log("Login: lilith@acme.dev / password123");
  console.log("       dana@acme.dev / password123");
  console.log("       remy@acme.dev / password123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
