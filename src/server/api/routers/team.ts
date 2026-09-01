import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const teamRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db.team.findMany({
      where: { organizationId: ctx.session.user.organizationId },
      include: {
        workflowStates: { orderBy: { position: "asc" } },
        _count: { select: { issues: true } },
      },
      orderBy: { name: "asc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(80),
        key: z
          .string()
          .min(1)
          .max(6)
          .regex(/^[A-Z0-9]+$/, "Key must be uppercase letters/numbers"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.team.findUnique({
        where: { organizationId_key: { organizationId: ctx.session.user.organizationId, key: input.key } },
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `Team key "${input.key}" is already in use.` });
      }

      return ctx.db.team.create({
        data: {
          name: input.name,
          key: input.key,
          organizationId: ctx.session.user.organizationId,
          memberships: {
            create: { userId: ctx.session.user.id, role: "ADMIN" },
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
    }),
});
