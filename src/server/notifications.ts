import type { PrismaClient } from "@prisma/client";

async function actorName(db: PrismaClient, actorId: string) {
  const actor = await db.user.findUnique({ where: { id: actorId }, select: { name: true } });
  return actor?.name ?? "Someone";
}

export async function notifyAssigned(
  db: PrismaClient,
  opts: { issueId: string; identifier: string; title: string; assigneeId: string; actorId: string }
) {
  if (opts.assigneeId === opts.actorId) return;
  const name = await actorName(db, opts.actorId);
  await db.notification.create({
    data: {
      type: "ASSIGNED",
      userId: opts.assigneeId,
      actorId: opts.actorId,
      issueId: opts.issueId,
      message: `${name} assigned you ${opts.identifier}: ${opts.title}`,
    },
  });
}

/** Parses @mentions (by full name or first name, case-insensitive) out of a plain-text
 * comment body and notifies both the mentioned users and the issue's other watchers
 * (assignee, creator) — deduped so a mentioned watcher only gets the MENTIONED notice. */
export async function notifyOnComment(
  db: PrismaClient,
  opts: {
    issueId: string;
    identifier: string;
    title: string;
    body: string;
    authorId: string;
    organizationId: string;
    assigneeId: string | null;
    creatorId: string;
  }
) {
  const members = await db.user.findMany({
    where: { organizationId: opts.organizationId },
    select: { id: true, name: true },
  });
  const lowerBody = opts.body.toLowerCase();
  const mentioned = new Set<string>();
  for (const m of members) {
    if (m.id === opts.authorId) continue;
    const first = m.name.split(" ")[0]!.toLowerCase();
    if (lowerBody.includes(`@${m.name.toLowerCase()}`) || lowerBody.includes(`@${first}`)) {
      mentioned.add(m.id);
    }
  }

  const watchers = new Set<string>();
  if (opts.assigneeId && opts.assigneeId !== opts.authorId && !mentioned.has(opts.assigneeId)) {
    watchers.add(opts.assigneeId);
  }
  if (opts.creatorId !== opts.authorId && !mentioned.has(opts.creatorId)) {
    watchers.add(opts.creatorId);
  }

  if (mentioned.size === 0 && watchers.size === 0) return;
  const name = await actorName(db, opts.authorId);

  await db.notification.createMany({
    data: [
      ...[...mentioned].map((userId) => ({
        type: "MENTIONED" as const,
        userId,
        actorId: opts.authorId,
        issueId: opts.issueId,
        message: `${name} mentioned you in ${opts.identifier}: ${opts.title}`,
      })),
      ...[...watchers].map((userId) => ({
        type: "COMMENT" as const,
        userId,
        actorId: opts.authorId,
        issueId: opts.issueId,
        message: `${name} commented on ${opts.identifier}: ${opts.title}`,
      })),
    ],
  });
}
