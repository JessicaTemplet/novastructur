import type { PrismaClient } from "@prisma/client";
import { Clock, Fugue, type FugueNode } from "@/lib/crdt";

type StoredSnapshot = { nodes: FugueNode<string>[] };

function loadSnapshot(raw: string | null): FugueNode<string>[] {
  if (!raw) return [];
  return (JSON.parse(raw) as StoredSnapshot).nodes;
}

/**
 * Finds the common prefix/suffix between old and new content and turns
 * the differing middle into a delete + insert. Not a minimal diff (a
 * real Myers diff would produce fewer, smaller edits when changes are
 * scattered across the document), but correct, simple, and good enough
 * for whole-document autosave: the common case is one person editing
 * one localized region. Verified against a concurrent-edit scenario in
 * the CRDT library's own test suite (src/lib/crdt/diff-to-ops equivalent
 * in fugue.test.ts) before this was wired in.
 */
function diffToOps(oldStr: string, newStr: string): { insertAt: number; deleteCount: number; insertText: string } {
  let prefix = 0;
  const maxPrefix = Math.min(oldStr.length, newStr.length);
  while (prefix < maxPrefix && oldStr[prefix] === newStr[prefix]) prefix++;

  let suffix = 0;
  const maxSuffix = Math.min(oldStr.length, newStr.length) - prefix;
  while (suffix < maxSuffix && oldStr[oldStr.length - 1 - suffix] === newStr[newStr.length - 1 - suffix]) {
    suffix++;
  }

  return {
    insertAt: prefix,
    deleteCount: oldStr.length - prefix - suffix,
    insertText: newStr.slice(prefix, newStr.length - suffix),
  };
}

/**
 * Apply a whole-document content replacement to a Doc's Fugue state.
 *
 * `baselineContent` is the content the CALLER started editing from, not
 * whatever's currently stored server-side, this distinction matters:
 * diffing the incoming string against the server's current content
 * (which may have moved if someone else saved in the meantime) computes
 * the wrong edit, one save's diff gets computed against the other
 * save's already-applied result instead of against what the user
 * actually changed, and can turn "insert a whole second paragraph" into
 * "change one character", silently discarding real content. Diffing
 * against the caller's own baseline instead correctly recovers their
 * real edit regardless of what else changed underneath them, then that
 * edit's positions get applied to whatever the CURRENT tree is. This
 * was caught and fixed via a failing test before it ever reached this
 * file, see the CRDT library's diff-to-ops test suite.
 *
 * If the caller has no baseline to send (an older client, or a
 * first-ever save), `baselineContent` may be omitted, this falls back
 * to diffing against the current server content, the same weaker
 * guarantee `doc.update` had before this existed.
 */
export async function applyDocContentReplace(
  db: PrismaClient,
  docId: string,
  newContent: string,
  baselineContent: string | undefined,
  actorSite: string
): Promise<string> {
  return db.$transaction(async (tx) => {
    const row = await tx.doc.findUniqueOrThrow({
      where: { id: docId },
      select: { contentCrdt: true, content: true },
    });

    const clock = new Clock(actorSite);
    const snapshot = loadSnapshot(row.contentCrdt);
    const doc = snapshot.length > 0 ? Fugue.fromSnapshot<string>(snapshot, clock) : new Fugue<string>(clock);

    const base = baselineContent ?? doc.toArray().join("");
    const { insertAt, deleteCount, insertText } = diffToOps(base, newContent);

    for (let i = 0; i < deleteCount; i++) doc.deleteAt(insertAt);
    for (let i = 0; i < insertText.length; i++) doc.insertAt(insertAt + i, insertText[i]);

    const materialized = doc.toArray().join("");
    await tx.doc.update({
      where: { id: docId },
      data: {
        content: materialized,
        contentCrdt: JSON.stringify({ nodes: doc.toSnapshot() } satisfies StoredSnapshot),
      },
    });
    return materialized;
  });
}
