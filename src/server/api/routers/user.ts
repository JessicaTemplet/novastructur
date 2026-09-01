import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),

  listOrgMembers: protectedProcedure.query(({ ctx }) => {
    return ctx.db.user.findMany({
      where: { organizationId: ctx.session.user.organizationId },
      select: { id: true, name: true, email: true, avatarColor: true },
      orderBy: { name: "asc" },
    });
  }),
});
