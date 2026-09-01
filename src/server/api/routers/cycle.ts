import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PrismaClient } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

async function assertTeamAccess(db: PrismaClient, teamId: string, organizationId: string) {
  const team = await db.team.findFirst({ where: { id: teamId, organizationId } });
  if (!team) throw new TRPCError({ code: "NOT_FOUND", message: "Team not found." });
  return team;
}

export const cycleRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertTeamAccess(ctx.db, input.teamId, ctx.session.user.organizationId);
      return ctx.db.cycle.findMany({
        where: { teamId: input.teamId },
        include: { _count: { select: { issues: true } } },
        orderBy: { number: "desc" },
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        teamId: z.string(),
        name: z.string().max(80).optional(),
        startDate: z.string().datetime(),
        endDate: z.string().datetime(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const team = await assertTeamAccess(ctx.db, input.teamId, ctx.session.user.organizationId);

      const updatedTeam = await ctx.db.team.update({
        where: { id: team.id },
        data: { cycleCounter: { increment: 1 } },
      });

      return ctx.db.cycle.create({
        data: {
          number: updatedTeam.cycleCounter,
          name: input.name || undefined,
          startDate: new Date(input.startDate),
          endDate: new Date(input.endDate),
          teamId: team.id,
        },
        include: { _count: { select: { issues: true } } },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().max(80).nullable().optional(),
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.cycle.findFirst({
        where: { id: input.id, team: { organizationId: ctx.session.user.organizationId } },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Cycle not found." });

      return ctx.db.cycle.update({
        where: { id: input.id },
        data: {
          name: input.name !== undefined ? input.name : undefined,
          startDate: input.startDate ? new Date(input.startDate) : undefined,
          endDate: input.endDate ? new Date(input.endDate) : undefined,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.cycle.deleteMany({
        where: { id: input.id, team: { organizationId: ctx.session.user.organizationId } },
      });
      return { success: true };
    }),
});
