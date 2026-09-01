import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const priorityEnum = z.enum(["NO_PRIORITY", "LOW", "MEDIUM", "HIGH", "URGENT"]);
const workflowStateTypeEnum = z.enum([
  "TRIAGE",
  "BACKLOG",
  "UNSTARTED",
  "STARTED",
  "COMPLETED",
  "CANCELED",
]);

export const savedViewRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db.savedView.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "asc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(60),
        teamId: z.string().optional(),
        assigneeId: z.string().optional(),
        priority: priorityEnum.optional(),
        labelId: z.string().optional(),
        stateType: workflowStateTypeEnum.optional(),
        query: z.string().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      return ctx.db.savedView.create({
        data: { ...input, userId: ctx.session.user.id },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.savedView.deleteMany({
        where: { id: input.id, userId: ctx.session.user.id },
      });
      return { success: true };
    }),
});
