import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

export const notificationRouter = createTRPCRouter({
  list: protectedProcedure.query(({ ctx }) => {
    return ctx.db.notification.findMany({
      where: { userId: ctx.session.user.id },
      include: {
        actor: { select: { id: true, name: true, avatarColor: true } },
        issue: { select: { id: true, identifier: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({ where: { userId: ctx.session.user.id, read: false } });
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { read: true },
      });
      return { success: true };
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, read: false },
      data: { read: true },
    });
    return { success: true };
  }),
});
