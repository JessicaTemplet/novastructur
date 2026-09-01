import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const priorityEnum = z.enum(["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"]);
const triggerEnum = z.enum(["ISSUE_CREATED", "STATE_CHANGED", "LABEL_ADDED", "ASSIGNED"]);
const actionEnum = z.enum(["SET_STATE", "SET_ASSIGNEE", "SET_PRIORITY", "ADD_LABEL"]);

async function assertTeamAccess(db: PrismaClient, teamId: string, organizationId: string) {
  const team = await db.team.findFirst({ where: { id: teamId, organizationId } });
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  return team;
}

async function assertStateInTeam(db: PrismaClient, stateId: string, teamId: string) {
  const state = await db.workflowState.findFirst({ where: { id: stateId, teamId } });
  if (!state) throw new TRPCError({ code: "BAD_REQUEST", message: "Workflow state not found." });
}

async function assertLabelInOrg(db: PrismaClient, labelId: string, organizationId: string) {
  const label = await db.label.findFirst({ where: { id: labelId, organizationId } });
  if (!label) throw new TRPCError({ code: "BAD_REQUEST", message: "Label not found." });
}

async function assertOrgMember(db: PrismaClient, userId: string, organizationId: string) {
  const user = await db.user.findFirst({ where: { id: userId, organizationId } });
  if (!user) throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee not found." });
}

const ruleInput = z.object({
  name: z.string().min(1).max(100),
  trigger: triggerEnum,
  triggerStateId: z.string().optional(),
  triggerLabelId: z.string().optional(),
  action: actionEnum,
  actionStateId: z.string().optional(),
  actionAssigneeId: z.string().optional(),
  actionPriority: priorityEnum.optional(),
  actionLabelId: z.string().optional(),
});

export const automationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTeamAccess(ctx.db, input.teamId, ctx.session.user.organizationId);
      return ctx.db.automationRule.findMany({
        where: { teamId: input.teamId },
        orderBy: { createdAt: "asc" },
      });
    }),

  create: protectedProcedure
    .input(ruleInput.extend({ teamId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const organizationId = ctx.session.user.organizationId;
      await assertTeamAccess(ctx.db, input.teamId, organizationId);
      if (input.triggerStateId) await assertStateInTeam(ctx.db, input.triggerStateId, input.teamId);
      if (input.triggerLabelId) await assertLabelInOrg(ctx.db, input.triggerLabelId, organizationId);
      if (input.actionStateId) await assertStateInTeam(ctx.db, input.actionStateId, input.teamId);
      if (input.actionAssigneeId) await assertOrgMember(ctx.db, input.actionAssigneeId, organizationId);
      if (input.actionLabelId) await assertLabelInOrg(ctx.db, input.actionLabelId, organizationId);
      return ctx.db.automationRule.create({ data: input });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.automationRule.updateMany({
        where: { id: input.id, team: { organizationId: ctx.session.user.organizationId } },
        data: { enabled: input.enabled },
      });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.automationRule.deleteMany({
        where: { id: input.id, team: { organizationId: ctx.session.user.organizationId } },
      });
      return { success: true };
    }),
});
