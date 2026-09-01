import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma, PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { runAutomations } from "@/server/automation";
import { notifyAssigned, notifyOnComment } from "@/server/notifications";
import { applyIssueLabelOps } from "@/server/crdt/issue-labels";

const priorityEnum = z.enum(["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"]);
const issueTypeEnum = z.enum(["EPIC", "STORY", "TASK", "BUG", "SUBTASK"]);
const relationTypeEnum = z.enum(["BLOCKS", "RELATES_TO", "DUPLICATES"]);
const workflowStateTypeEnum = z.enum([
  "TRIAGE",
  "BACKLOG",
  "UNSTARTED",
  "STARTED",
  "COMPLETED",
  "CANCELED",
]);

const listInclude = {
  state: true,
  assignee: { select: { id: true, name: true, avatarColor: true } },
  labels: { include: { label: true } },
  team: { select: { id: true, key: true, name: true } },
  parent: { select: { id: true, identifier: true, title: true } },
  cycle: { select: { id: true, number: true, name: true, startDate: true, endDate: true } },
  _count: { select: { subIssues: true, comments: true } },
} satisfies Prisma.IssueInclude;

const detailInclude = {
  ...listInclude,
  creator: { select: { id: true, name: true, avatarColor: true } },
  subIssues: {
    include: {
      state: true,
      assignee: { select: { id: true, name: true, avatarColor: true } },
    },
    orderBy: { sortOrder: "asc" },
  },
  comments: {
    include: { author: { select: { id: true, name: true, avatarColor: true } } },
    orderBy: { createdAt: "asc" },
  },
  outgoingRelations: {
    include: { target: { select: { id: true, identifier: true, title: true, state: true } } },
  },
  incomingRelations: {
    include: { source: { select: { id: true, identifier: true, title: true, state: true } } },
  },
  githubLinks: { orderBy: { createdAt: "asc" } },
  linkedDocs: { include: { doc: { select: { id: true, title: true } } } },
} satisfies Prisma.IssueInclude;

async function assertTeamAccess(db: PrismaClient, teamId: string, organizationId: string) {
  const team = await db.team.findFirst({ where: { id: teamId, organizationId } });
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  return team;
}

async function assertIssueAccess(db: PrismaClient, issueId: string, organizationId: string) {
  const issue = await db.issue.findFirst({
    where: { id: issueId, team: { organizationId } },
  });
  if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found." });
  return issue;
}

// Cross-references for fields that reference other org-scoped records
// (assignee, parent issue, cycle, labels, workflow state) so a caller can't
// point an issue at another organization's data by id.
async function assertOrgMember(db: PrismaClient, userId: string, organizationId: string) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee not found." });
}

async function assertLabelsInOrg(db: PrismaClient, labelIds: string[], organizationId: string) {
  if (labelIds.length === 0) return;
  const count = await db.label.count({ where: { id: { in: labelIds }, organizationId } });
  if (count !== labelIds.length) throw new TRPCError({ code: "BAD_REQUEST", message: "One or more labels not found." });
}

async function assertCycleInTeam(db: PrismaClient, cycleId: string, teamId: string) {
  const cycle = await db.cycle.findFirst({ where: { id: cycleId, teamId } });
  if (!cycle) throw new TRPCError({ code: "BAD_REQUEST", message: "Cycle not found." });
}

async function assertStateInTeam(db: PrismaClient, stateId: string, teamId: string) {
  const state = await db.workflowState.findFirst({ where: { id: stateId, teamId } });
  if (!state) throw new TRPCError({ code: "NOT_FOUND", message: "Workflow state not found." });
  return state;
}

export const issueRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          teamId: z.string().optional(),
          stateId: z.string().optional(),
          stateType: workflowStateTypeEnum.optional(),
          type: issueTypeEnum.optional(),
          assigneeId: z.string().optional(),
          priority: priorityEnum.optional(),
          labelId: z.string().optional(),
          query: z.string().optional(),
          parentId: z.string().nullable().optional(),
          cycleId: z.string().optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) => {
      const where: Prisma.IssueWhereInput = {
        team: { organizationId: ctx.session.user.organizationId },
      };
      if (input?.teamId) where.teamId = input.teamId;
      if (input?.stateId) where.stateId = input.stateId;
      if (input?.stateType) where.state = { type: input.stateType };
      if (input?.type) where.type = input.type;
      if (input?.assigneeId === "unassigned") where.assigneeId = null;
      else if (input?.assigneeId) where.assigneeId = input.assigneeId;
      if (input?.priority) where.priority = input.priority;
      if (input?.labelId) where.labels = { some: { labelId: input.labelId } };
      if (input?.query) {
        where.OR = [
          { title: { contains: input.query } },
          { description: { contains: input.query } },
          { identifier: { contains: input.query } },
        ];
      }
      if (input?.parentId !== undefined) where.parentId = input.parentId;
      if (input?.cycleId === "backlog") where.cycleId = null;
      else if (input?.cycleId) where.cycleId = input.cycleId;

      return ctx.db.issue.findMany({
        where,
        include: listInclude,
        orderBy: [{ state: { position: "asc" } }, { sortOrder: "asc" }],
      });
    }),

  byIdentifier: protectedProcedure
    .input(z.object({ identifier: z.string() }))
    .query(async ({ ctx, input }) => {
      const issue = await ctx.db.issue.findFirst({
        where: { identifier: input.identifier, team: { organizationId: ctx.session.user.organizationId } },
        include: detailInclude,
      });
      if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "Issue not found." });
      return issue;
    }),

  create: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        type: issueTypeEnum.optional(),
        priority: priorityEnum.optional(),
        stateId: z.string().optional(),
        assigneeId: z.string().optional(),
        labelIds: z.array(z.string()).optional(),
        estimate: z.number().optional(),
        dueDate: z.string().datetime().optional(),
        parentId: z.string().optional(),
        cycleId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const team = await assertTeamAccess(ctx.db, input.teamId, ctx.session.user.organizationId);

      if (input.assigneeId) await assertOrgMember(ctx.db, input.assigneeId, ctx.session.user.organizationId);
      if (input.labelIds?.length) await assertLabelsInOrg(ctx.db, input.labelIds, ctx.session.user.organizationId);
      if (input.cycleId) await assertCycleInTeam(ctx.db, input.cycleId, team.id);
      if (input.parentId) await assertIssueAccess(ctx.db, input.parentId, ctx.session.user.organizationId);
      if (input.stateId) await assertStateInTeam(ctx.db, input.stateId, team.id);

      let stateId = input.stateId;
      if (!stateId) {
        const defaultState = await ctx.db.workflowState.findFirst({
          where: { teamId: team.id, type: "BACKLOG" },
          orderBy: { position: "asc" },
        });
        const fallback =
          defaultState ??
          (await ctx.db.workflowState.findFirst({ where: { teamId: team.id }, orderBy: { position: "asc" } }));
        if (!fallback) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Team has no workflow states." });
        stateId = fallback.id;
      }

      const maxSort = await ctx.db.issue.aggregate({
        where: { stateId },
        _max: { sortOrder: true },
      });
      const sortOrder = (maxSort._max.sortOrder ?? 0) + 1000;

      const updatedTeam = await ctx.db.team.update({
        where: { id: team.id },
        data: { issueCounter: { increment: 1 } },
      });
      const number = updatedTeam.issueCounter;

      const issue = await ctx.db.issue.create({
        data: {
          identifier: `${team.key}-${number}`,
          number,
          title: input.title,
          description: input.description,
          type: input.type ?? "TASK",
          priority: input.priority ?? "NO_PRIORITY",
          estimate: input.estimate,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          teamId: team.id,
          stateId,
          assigneeId: input.assigneeId,
          creatorId: ctx.session.user.id,
          parentId: input.parentId,
          cycleId: input.cycleId,
          sortOrder,
          labels: input.labelIds?.length
            ? { create: input.labelIds.map((labelId) => ({ labelId })) }
            : undefined,
        },
      });

      await runAutomations(ctx.db, { trigger: "ISSUE_CREATED", issueId: issue.id, teamId: team.id });
      if (input.assigneeId) {
        await notifyAssigned(ctx.db, {
          issueId: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          assigneeId: input.assigneeId,
          actorId: ctx.session.user.id,
        });
        await runAutomations(ctx.db, { trigger: "ASSIGNED", issueId: issue.id, teamId: team.id });
      }

      return ctx.db.issue.findUniqueOrThrow({ where: { id: issue.id }, include: listInclude });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().nullable().optional(),
        type: issueTypeEnum.optional(),
        priority: priorityEnum.optional(),
        stateId: z.string().optional(),
        assigneeId: z.string().nullable().optional(),
        estimate: z.number().nullable().optional(),
        dueDate: z.string().datetime().nullable().optional(),
        parentId: z.string().nullable().optional(),
        cycleId: z.string().nullable().optional(),
        sortOrder: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await assertIssueAccess(ctx.db, input.id, ctx.session.user.organizationId);

      if (input.assigneeId) await assertOrgMember(ctx.db, input.assigneeId, ctx.session.user.organizationId);
      if (input.cycleId) await assertCycleInTeam(ctx.db, input.cycleId, existing.teamId);
      if (input.parentId) {
        if (input.parentId === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "An issue can't be its own parent." });
        }
        await assertIssueAccess(ctx.db, input.parentId, ctx.session.user.organizationId);
      }

      const data: Prisma.IssueUpdateInput = {};
      if (input.title !== undefined) data.title = input.title;
      if (input.description !== undefined) data.description = input.description;
      if (input.type !== undefined) data.type = input.type;
      if (input.priority !== undefined) data.priority = input.priority;
      if (input.estimate !== undefined) data.estimate = input.estimate;
      if (input.dueDate !== undefined) data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
      if (input.assigneeId !== undefined) {
        data.assignee = input.assigneeId ? { connect: { id: input.assigneeId } } : { disconnect: true };
      }
      if (input.parentId !== undefined) {
        data.parent = input.parentId ? { connect: { id: input.parentId } } : { disconnect: true };
      }
      if (input.cycleId !== undefined) {
        data.cycle = input.cycleId ? { connect: { id: input.cycleId } } : { disconnect: true };
      }

      if (input.stateId !== undefined && input.stateId !== existing.stateId) {
        const newState = await assertStateInTeam(ctx.db, input.stateId, existing.teamId);
        data.state = { connect: { id: newState.id } };
        data.completedAt = newState.type === "COMPLETED" ? new Date() : null;
        data.canceledAt = newState.type === "CANCELED" ? new Date() : null;
      }

      await ctx.db.issue.update({ where: { id: input.id }, data });

      if (input.stateId !== undefined && input.stateId !== existing.stateId) {
        await runAutomations(ctx.db, {
          trigger: "STATE_CHANGED",
          issueId: input.id,
          teamId: existing.teamId,
          stateId: input.stateId,
        });
      }
      if (input.assigneeId !== undefined && input.assigneeId !== null && input.assigneeId !== existing.assigneeId) {
        await notifyAssigned(ctx.db, {
          issueId: input.id,
          identifier: existing.identifier,
          title: input.title ?? existing.title,
          assigneeId: input.assigneeId,
          actorId: ctx.session.user.id,
        });
        await runAutomations(ctx.db, { trigger: "ASSIGNED", issueId: input.id, teamId: existing.teamId });
      }

      return ctx.db.issue.findUniqueOrThrow({ where: { id: input.id }, include: listInclude });
    }),

  // Adds one label. Uses ORSet (src/server/crdt/issue-labels.ts) instead
  // of the old "send the whole desired label array, server replaces
  // everything" pattern update() used to support, that pattern loses a
  // concurrent add/remove of a DIFFERENT label whenever two requests
  // land close together, since the second one's full array reflects a
  // state that no longer matches what's actually in the DB.
  addLabel: protectedProcedure
    .input(z.object({ id: z.string(), labelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await assertIssueAccess(ctx.db, input.id, ctx.session.user.organizationId);
      await assertLabelsInOrg(ctx.db, [input.labelId], ctx.session.user.organizationId);

      await applyIssueLabelOps(ctx.db, input.id, { add: input.labelId }, ctx.session.user.id);
      await runAutomations(ctx.db, {
        trigger: "LABEL_ADDED",
        issueId: input.id,
        teamId: existing.teamId,
        labelId: input.labelId,
      });

      return ctx.db.issue.findUniqueOrThrow({ where: { id: input.id }, include: listInclude });
    }),

  removeLabel: protectedProcedure
    .input(z.object({ id: z.string(), labelId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertIssueAccess(ctx.db, input.id, ctx.session.user.organizationId);
      await applyIssueLabelOps(ctx.db, input.id, { remove: input.labelId }, ctx.session.user.id);
      return ctx.db.issue.findUniqueOrThrow({ where: { id: input.id }, include: listInclude });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await assertIssueAccess(ctx.db, input.id, ctx.session.user.organizationId);
      await ctx.db.issue.delete({ where: { id: input.id } });
      return { success: true };
    }),

  addComment: protectedProcedure
    .input(z.object({ issueId: z.string(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const issue = await assertIssueAccess(ctx.db, input.issueId, ctx.session.user.organizationId);
      const comment = await ctx.db.comment.create({
        data: { issueId: input.issueId, body: input.body, authorId: ctx.session.user.id },
        include: { author: { select: { id: true, name: true, avatarColor: true } } },
      });

      await notifyOnComment(ctx.db, {
        issueId: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        body: input.body,
        authorId: ctx.session.user.id,
        organizationId: ctx.session.user.organizationId,
        assigneeId: issue.assigneeId,
        creatorId: issue.creatorId,
      });

      return comment;
    }),

  addRelation: protectedProcedure
    .input(z.object({ sourceId: z.string(), targetId: z.string(), type: relationTypeEnum }))
    .mutation(async ({ ctx, input }) => {
      await assertIssueAccess(ctx.db, input.sourceId, ctx.session.user.organizationId);
      await assertIssueAccess(ctx.db, input.targetId, ctx.session.user.organizationId);
      return ctx.db.issueRelation.create({ data: input });
    }),

  removeRelation: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.issueRelation.deleteMany({
        where: {
          id: input.id,
          source: { team: { organizationId: ctx.session.user.organizationId } },
        },
      });
      return { success: true };
    }),
});
