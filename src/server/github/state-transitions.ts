import type { PrismaClient } from "@prisma/client";

// Auto-transition rules triggered by linked-PR activity. Deliberately
// forward-only: a PR reopening or a stale sync must never pull an issue back
// out of a state a human set manually (e.g. CANCELED). Terminal states
// (COMPLETED/CANCELED) are sticky — once there, PR activity is ignored.
export async function applyForwardTransition(
  db: PrismaClient,
  issueId: string,
  targetType: "STARTED" | "COMPLETED"
): Promise<void> {
  const issue = await db.issue.findUnique({
    where: { id: issueId },
    select: { teamId: true, stateId: true, state: { select: { type: true } } },
  });
  if (!issue) return;

  const currentType = issue.state.type;
  if (currentType === "COMPLETED" || currentType === "CANCELED") return;

  if (targetType === "STARTED") {
    const eligible = currentType === "TRIAGE" || currentType === "BACKLOG" || currentType === "UNSTARTED";
    if (!eligible) return;
  }
  // targetType === "COMPLETED": any non-terminal state may advance to completed.

  const target = await db.workflowState.findFirst({
    where: { teamId: issue.teamId, type: targetType },
    orderBy: { position: "asc" },
  });
  if (!target || target.id === issue.stateId) return;

  await db.issue.update({
    where: { id: issueId },
    data: {
      stateId: target.id,
      completedAt: targetType === "COMPLETED" ? new Date() : undefined,
    },
  });
}
