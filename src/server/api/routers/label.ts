import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const labelRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db.label.findMany({
      where: { organizationId: ctx.session.user.organizationId },
      orderBy: { name: "asc" },
    });
  }),

  create: protectedProcedure
    .input(z.object({ name: z.string().min(1).max(40), color: z.string().min(1) }))
    .mutation(({ ctx, input }) => {
      return ctx.db.label.create({
        data: {
          name: input.name,
          color: input.color,
          organizationId: ctx.session.user.organizationId,
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.label.deleteMany({
        where: { id: input.id, organizationId: ctx.session.user.organizationId },
      });
      return { success: true };
    }),
});
