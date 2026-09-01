import { createTRPCRouter } from "@/server/api/trpc";
import { issueRouter } from "@/server/api/routers/issue";
import { teamRouter } from "@/server/api/routers/team";
import { workflowRouter } from "@/server/api/routers/workflow";
import { labelRouter } from "@/server/api/routers/label";
import { userRouter } from "@/server/api/routers/user";
import { aiRouter } from "@/server/api/routers/ai";
import { githubRouter } from "@/server/api/routers/github";
import { cycleRouter } from "@/server/api/routers/cycle";
import { savedViewRouter } from "@/server/api/routers/saved-view";
import { docRouter } from "@/server/api/routers/doc";
import { automationRouter } from "@/server/api/routers/automation";
import { notificationRouter } from "@/server/api/routers/notification";

export const appRouter = createTRPCRouter({
  issue: issueRouter,
  team: teamRouter,
  workflow: workflowRouter,
  label: labelRouter,
  user: userRouter,
  ai: aiRouter,
  github: githubRouter,
  cycle: cycleRouter,
  savedView: savedViewRouter,
  doc: docRouter,
  automation: automationRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;
