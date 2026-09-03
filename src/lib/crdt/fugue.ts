import { OpId, compareOpId, Clock } from "./clock";

type Side = "L" | "R";

// Reserved id, no real Clock ever produces counter 0, so this can never
// collide with an actual op.
const ROOT: OpId = { counter: 0, site: "" };

export type FugueNode<T> = {
  id: OpId;
  parent: OpId;
  side: Side;
  value: T;
  deleted: boolean;
};

export type FugueInsertOp<T> = {
  type: "insert";
  id: OpId;
  parent: OpId;
  side: Side;
  value: T;
};

export type FugueDeleteOp = {
  type: "delete";
  id: OpId;
};

export type FugueOp<T> = FugueInsertOp<T> | FugueDeleteOp;

function key(id: OpId): string {
  return `${id.counter}@${id.site}`;
}

/**
 * Tree-Fugue sequence CRDT (Weidner, Gentle & Kleppmann, "The Art of the
 * Fugue", 2023). Use this for anything ordered where concurrent inserts
 * at the same position need to merge without splicing unrelated edits
 * together character by character. Doc.content is the case here.
 *
 * The core placement rule, this is the entire trick of Fugue: when
 * inserting a new element between an existing left neighbor L and the
 * node that immediately follows L in the full tree (tombstones included,
 * call it R),
 *   - if L has no right child yet, the new element becomes L's right
 *     child
 *   - otherwise, it becomes R's left child
 * Once a node's parent and side are assigned they never change, so a
 * remote replica applying this op later just inserts it into its own
 * tree map. No recomputation on receipt, no dependence on delivery
 * order beyond a node's parent existing before the node itself.
 *
 * Why that rule avoids interleaving: each site's own burst of
 * concurrent typing only ever attaches new nodes to that site's own
 * most recent node (since the neighbor pair it's reasoning about only
 * contains that site's own ops until a merge happens), so the whole
 * burst becomes one contiguous subtree. Verified below against the
 * "Hello " / "Hi " example from the paper's own motivating case.
 *
 * Sibling ordering (same parent, same side) is resolved by OpId so
 * every replica computes an identical linear order deterministically.
 * That's sufficient for convergence (strong eventual consistency) and
 * for avoiding the common interleaving failure mode tested below. It
 * has not been independently re-verified against every edge case in
 * the paper's formal "maximal non-interleaving" proof (concurrent
 * backward / right-to-left typing is the notable one), so treat that
 * specific guarantee as tested-for-the-common-case, not formally
 * re-derived here.
 *
 * Deletions are tombstones. A node is never removed from the tree purely
 * by being deleted, since a later insert may still reference it as a
 * neighbor, or one of its own children may still depend on it for tree
 * structure. `compact()` below removes exactly the tombstones that have
 * neither reason left to stay: no children, so nothing in the tree
 * depends on the node's position anymore. That is NOT the general
 * distributed tombstone-GC problem ("has every replica seen this
 * delete yet"), which still needs its own protocol and is still not
 * built here, it is safe specifically because of how NovaStructur
 * applies edits: every op is generated fresh against the current
 * server-side tree, in the same transaction that persists the result,
 * never replayed later from an independent op log. See `compact()`'s
 * own doc comment for the full argument, and fugue.test.ts for the
 * cases that pin it down.
 *
 * This class assumes causal delivery of ops: a node's parent must be
 * applied before the node itself. That's a transport-layer concern
 * (buffering, ordering, or retry), not something this class does, so
 * applyOp throws loudly instead of silently dropping an op it can't
 * place.
 */
export class Fugue<T> {
  private nodes = new Map<string, FugueNode<T>>();
  private appliedDeletes = new Set<string>();

  constructor(private readonly clock: Clock) {}

  private childrenOf(parentKey: string, side: Side): FugueNode<T>[] {
    const kids: FugueNode<T>[] = [];
    for (const n of this.nodes.values()) {
      if (key(n.parent) === parentKey && n.side === side) kids.push(n);
    }
    return kids.sort((a, b) => compareOpId(a.id, b.id));
  }

  private hasRightChild(parentKey: string): boolean {
    for (const n of this.nodes.values()) {
      if (key(n.parent) === parentKey && n.side === "R") return true;
    }
    return false;
  }

  // In-order traversal of one node's subtree: its left children (each
  // fully expanded), then the node itself, then its right children
  // (each fully expanded).
  private subtree(nodeId: OpId, out: FugueNode<T>[]): void {
    const nk = key(nodeId);
    const node = this.nodes.get(nk);
    for (const child of this.childrenOf(nk, "L")) this.subtree(child.id, out);
    if (node) out.push(node);
    for (const child of this.childrenOf(nk, "R")) this.subtree(child.id, out);
  }

  // Full in-order list including tombstones. Root itself has no value
  // so it contributes only its children's subtrees.
  private fullList(): FugueNode<T>[] {
    const out: FugueNode<T>[] = [];
    for (const child of this.childrenOf(key(ROOT), "L")) this.subtree(child.id, out);
    for (const child of this.childrenOf(key(ROOT), "R")) this.subtree(child.id, out);
    return out;
  }

  // Visible sequence: tombstones filtered out.
  toArray(): T[] {
    return this.fullList()
      .filter((n) => !n.deleted)
      .map((n) => n.value);
  }

  private applyInsert(op: FugueInsertOp<T>): void {
    const k = key(op.id);
    if (this.nodes.has(k)) return; // idempotent
    if (op.parent.counter !== 0 && !this.nodes.has(key(op.parent))) {
      throw new Error(
        `Fugue.applyOp: parent ${key(op.parent)} not found for insert ${k}. ` +
          `Ops must be applied in causal order (parent before child).`
      );
    }
    this.nodes.set(k, {
      id: op.id,
      parent: op.parent,
      side: op.side,
      value: op.value,
      deleted: false,
    });
    this.clock.observe(op.id);
  }

  private applyDelete(op: FugueDeleteOp): void {
    const k = key(op.id);
    if (this.appliedDeletes.has(k)) return; // idempotent
    const node = this.nodes.get(k);
    if (!node) {
      throw new Error(
        `Fugue.applyOp: cannot delete ${k}, node not found. ` +
          `Ops must be applied in causal order (insert before delete).`
      );
    }
    node.deleted = true;
    this.appliedDeletes.add(k);
  }

  // Integrate a remote (or locally-generated) op. Safe to call more
  // than once with the same op.
  applyOp(op: FugueOp<T>): void {
    if (op.type === "insert") this.applyInsert(op);
    else this.applyDelete(op);
  }

  // Local convenience: insert `value` at visible index `index` (0 =
  // start of document). Returns the op so the caller can broadcast it.
  insertAt(index: number, value: T): FugueInsertOp<T> {
    const full = this.fullList();
    const visible = full.filter((n) => !n.deleted);

    const leftId: OpId = index === 0 ? ROOT : visible[index - 1].id;
    const leftKey = key(leftId);

    // Full-tree (tombstones included) successor of leftId, this is what
    // makes the two-branch placement rule always well-defined, see the
    // class doc comment for why the "next VISIBLE node" is not enough.
    let rightId: OpId | null;
    if (index === 0) {
      rightId = full[0]?.id ?? null;
    } else {
      const leftFullIndex = full.findIndex((n) => key(n.id) === leftKey);
      rightId = full[leftFullIndex + 1]?.id ?? null;
    }

    const side: Side = this.hasRightChild(leftKey) ? "L" : "R";
    const parent = side === "R" ? leftId : rightId;
    if (!parent) {
      throw new Error("Fugue.insertAt: could not resolve a parent, this indicates a bug.");
    }

    const op: FugueInsertOp<T> = {
      type: "insert",
      id: this.clock.tick(),
      parent,
      side,
      value,
    };
    this.applyInsert(op);
    return op;
  }

  // Local convenience: delete the value currently at visible index
  // `index`. Returns the op so the caller can broadcast it.
  deleteAt(index: number): FugueDeleteOp {
    const visible = this.fullList().filter((n) => !n.deleted);
    const target = visible[index];
    if (!target) throw new Error(`Fugue.deleteAt: no visible element at index ${index}`);
    const op: FugueDeleteOp = { type: "delete", id: target.id };
    this.applyDelete(op);
    return op;
  }

  // Remove tombstoned nodes that have become structurally dead weight: a
  // deleted node with zero children. `fullList()`/`insertAt` only ever
  // reach a tombstone via its parent's child-scan (see `childrenOf`,
  // `subtree`), which reads each node's OWN `.parent` field, not the
  // parent's. So a leaf tombstone's removal can't strand anything: no
  // node depended on that specific node object, only on whatever
  // position it held in `fullList()`, and once it has no children,
  // nothing was still anchored to it there either.
  //
  // Removing a leaf tombstone can turn its own (also-tombstoned) parent
  // into a leaf too, so this peels inward, repeatedly, in one O(n) pass
  // via a child-count map, until nothing removable is left. It never
  // touches a non-deleted node, and never removes a tombstone that still
  // has children (that would sever the parent link its remaining
  // descendants rely on to be found during traversal, see fugue.test.ts
  // for why the chained case works).
  //
  // Purely local cleanup: it doesn't produce an op, has nothing to
  // broadcast, and a replica that never calls this still converges fine
  // with one that does (its tree just stays a little larger).
  //
  // Scope this to how doc-content.ts actually uses it: call it right
  // before persisting, on the same tree that just generated its own new
  // ops fresh, in the same transaction. Do NOT call it on a replica that
  // will later receive an op via applyOp() that was generated somewhere
  // else, against a DIFFERENT, uncompacted copy of tree history, that
  // op's parent could be exactly the node this call just removed, and
  // applyOp throws rather than silently drop it (see the fuzz test in
  // fugue.fuzz.test.ts that pins this distinction down). NovaStructur
  // never does that today, every op is generated fresh against whatever
  // is currently persisted, never replayed from an independent history,
  // which is also why it's fine for a pruned node's OpId counter to get
  // reused by a later op from the same site: nothing anywhere still
  // holds a reference to the original one to collide with.
  compact(): number {
    const childCount = new Map<string, number>();
    for (const n of this.nodes.values()) {
      const pk = key(n.parent);
      childCount.set(pk, (childCount.get(pk) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const n of this.nodes.values()) {
      const nk = key(n.id);
      if (n.deleted && (childCount.get(nk) ?? 0) === 0) queue.push(nk);
    }

    let removed = 0;
    while (queue.length > 0) {
      const nk = queue.pop()!;
      const node = this.nodes.get(nk);
      if (!node) continue;

      this.nodes.delete(nk);
      this.appliedDeletes.delete(nk);
      removed++;

      const pk = key(node.parent);
      const remaining = (childCount.get(pk) ?? 0) - 1;
      childCount.set(pk, remaining);
      if (remaining === 0) {
        const parentNode = this.nodes.get(pk);
        if (parentNode?.deleted) queue.push(pk);
      }
    }

    return removed;
  }

  // A snapshot of every node (tombstones included), for persistence.
  // Restoring from a snapshot (fromSnapshot) is O(n): it writes the node
  // map directly instead of replaying every insert/delete through
  // applyOp's causal-order checks. Prefer this over storing and replaying
  // a raw op log for anything long-lived, replaying grows quadratic (each
  // of k ops does an O(n) scan) as the document accumulates edits, this
  // does not.
  toSnapshot(): FugueNode<T>[] {
    return [...this.nodes.values()].map((n) => ({ ...n }));
  }

  // Rebuild a Fugue directly from a prior toSnapshot() call. The caller
  // supplies the Clock (same as the constructor), it gets pulled forward
  // past every id in the snapshot so subsequent local inserts/deletes
  // still sort after everything restored.
  static fromSnapshot<T>(snapshot: FugueNode<T>[], clock: Clock): Fugue<T> {
    const doc = new Fugue<T>(clock);
    for (const n of snapshot) {
      doc.nodes.set(key(n.id), { ...n });
      if (n.deleted) doc.appliedDeletes.add(key(n.id));
      clock.observe(n.id);
    }
    return doc;
  }
}
