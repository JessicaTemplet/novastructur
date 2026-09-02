import type { PrismaClient } from "@prisma/client";
import { Clock, ORSet, type OpId } from "@/lib/crdt";

type StoredOrSetState = {
  adds: (readonly [string, string, readonly string[]])[];
  removed: readonly string[];
};

function loadState(raw: string | null): StoredOrSetState {
  if (!raw) return { adds: [], removed: [] };
  return JSON.parse(raw) as StoredOrSetState;
}

// Tags are stored as "counter@site" strings (see ORSet.tagKey in
// src/lib/crdt/or-set.ts, which doesn't export a parser since it never
// needed one internally). Only used here to advance this request's
// Clock past whatever's already recorded, site ids are cuids and never
// contain "@", so this split is unambiguous.
function parseTag(tag: string): OpId {
  const at = tag.lastIndexOf("@");
  return { counter: Number(tag.slice(0, at)), site: tag.slice(at + 1) };
}

/**
 * Add and/or remove label ids on an Issue via ORSet, instead of the
 * previous delete-all-then-recreate-all approach `issue.update` used to
 * use. That approach loses data under concurrent edits: if two requests
 * both modify labels on the same issue around the same time, whichever
 * commits last replaces the WHOLE set, silently discarding the other
 * request's change even when the two touched completely different
 * labels. ORSet only ever touches the specific label each call names.
 *
 * Wrapped in a transaction so the read-merge-write is atomic against a
 * concurrent call touching the same issue.
 */
export async function applyIssueLabelOps(
  db: PrismaClient,
  issueId: string,
  op: { add?: string } | { remove?: string },
  actorSite: string
): Promise<string[]> {
  return db.$transaction(async (tx) => {
    const row = await tx.issue.findUniqueOrThrow({
      where: { id: issueId },
      select: { labelsCrdt: true },
    });
    const stored = loadState(row.labelsCrdt);
    const set = ORSet.fromJSON<string>(stored);
    const clock = new Clock(actorSite);
    for (const [, , tags] of stored.adds) {
      for (const t of tags) clock.observe(parseTag(t));
    }

    if ("add" in op && op.add) {
      set.add(op.add, clock.tick());
    } else if ("remove" in op && op.remove) {
      set.remove(op.remove);
    }

    const finalLabelIds = set.values();

    await tx.issueLabel.deleteMany({ where: { issueId } });
    if (finalLabelIds.length) {
      // No skipDuplicates: SQLite'"'"'s Prisma client doesn'"'"'t support it (type
      // error, not a runtime one), and it'"'"'s not actually needed here anyway -
      // set.values() already reads from an internal Map keyed by value, so
      // finalLabelIds can'"'"'t contain a duplicate label id to begin with.
      await tx.issueLabel.createMany({
        data: finalLabelIds.map((labelId) => ({ issueId, labelId })),
      });
    }
    await tx.issue.update({
      where: { id: issueId },
      data: { labelsCrdt: JSON.stringify(set.toJSON()) },
    });

    return finalLabelIds;
  });
}
