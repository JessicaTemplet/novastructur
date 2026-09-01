import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const workflowRouter = createTRPCRouter({
  listByTeam: protectedProcedure
    .input(z.object({ teamId: z.string() }))
    .query(({ ctx, input }) => {
      return ctx.db.workflowState.findMany({
        where: { teamId: input.teamId, team: { organizationId: ctx.session.user.organizationId } },
        orderBy: { position: "asc" },
      });
    }),
});
