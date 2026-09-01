import type { Prisma, PrismaClient } from "@prisma/client";

type AutomationEvent =
  | { trigger: "ISSUE_CREATED"; issueId: string; teamId: string }
  | { trigger: "STATE_CHANGED"; issueId: string; teamId: string; stateId: string }
  | { trigger: "LABEL_ADDED"; issueId: string; teamId: string; labelId: string }
  | { trigger: "ASSIGNED"; issueId: string; teamId: string };

/** Applies each matching rule's action with a direct db write (not through this
 * same function), so an action can never re-trigger automations — no cascades. */
export async function runAutomations(db: PrismaClient, event: AutomationEvent) {
  const rules = await db.automationRule.findMany({
    where: {
      teamId: event.teamId,
      enabled: true,
      trigger: event.trigger,
      ...(event.trigger === "STATE_CHANGED" ? { triggerStateId: event.stateId } : {}),
      ...(event.trigger === "LABEL_ADDED" ? { triggerLabelId: event.labelId } : {}),
    },
  });

  for (const rule of rules) {
    if (rule.action === "ADD_LABEL" && rule.actionLabelId) {
      await db.issueLabel.upsert({
        where: { issueId_labelId: { issueId: event.issueId, labelId: rule.actionLabelId } },
        create: { issueId: event.issueId, labelId: rule.actionLabelId },
        update: {},
      });
      continue;
    }

    const data: Prisma.IssueUpdateInput = {};
    if (rule.action === "SET_STATE" && rule.actionStateId) {
      const state = await db.workflowState.findUnique({ where: { id: rule.actionStateId } });
      if (state) {
        data.state = { connect: { id: state.id } };
        data.completedAt = state.type === "COMPLETED" ? new Date() : null;
        data.canceledAt = state.type === "CANCELED" ? new Date() : null;
      }
    } else if (rule.action === "SET_ASSIGNEE") {
      data.assignee = rule.actionAssigneeId ? { connect: { id: rule.actionAssigneeId } } : { disconnect: true };
    } else if (rule.action === "SET_PRIORITY" && rule.actionPriority) {
      data.priority = rule.actionPriority;
    }

    if (Object.keys(data).length > 0) {
      await db.issue.update({ where: { id: event.issueId }, data });
    }
  }
}
