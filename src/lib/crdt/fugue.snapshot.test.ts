import test from "node:test";
import assert from "node:assert/strict";
import { Clock } from "./clock";
import { Fugue, FugueOp } from "./fugue";

function typeString(doc: Fugue<string>, s: string): FugueOp<string>[] {
  const ops: FugueOp<string>[] = [];
  for (let i = 0; i < s.length; i++) ops.push(doc.insertAt(i, s[i]));
  return ops;
}

test("snapshot round-trips visible content", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "hello world");
  doc.deleteAt(5); // delete the space, leaves a tombstone
  const snapshot = doc.toSnapshot();

  const restored = Fugue.fromSnapshot(snapshot, new Clock("A"));
  assert.equal(restored.toArray().join(""), doc.toArray().join(""));
});

test("further edits after restoring from a snapshot still merge correctly with a second replica", () => {
  const original = new Fugue<string>(new Clock("A"));
  typeString(original, "hello");
  const snapshot = original.toSnapshot();

  // Simulate: this snapshot gets persisted, then loaded back for a new
  // request, and the site continues editing by appending more text.
  const restored = Fugue.fromSnapshot(snapshot, new Clock("A"));
  const tailOps: FugueOp<string>[] = [];
  for (let i = 0; i < " there".length; i++) {
    tailOps.push(restored.insertAt(5 + i, " there"[i]));
  }
  assert.equal(restored.toArray().join(""), "hello there");

  // A concurrent second replica, never saw the restored site's new ops,
  // makes its own concurrent edit against the same original snapshot.
  const concurrent = Fugue.fromSnapshot(snapshot, new Clock("B"));
  const concurrentOps = concurrent.insertAt(0, "!");

  for (const op of tailOps) concurrent.applyOp(op);
  restored.applyOp(concurrentOps);

  assert.equal(restored.toArray().join(""), concurrent.toArray().join(""));
  assert.equal(restored.toArray().join(""), "!hello there");
});

test("snapshot restore does not require replaying ops (no causal-order errors on out-of-order tombstoned nodes)", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "abc");
  doc.deleteAt(1); // tombstone 'b'
  const snapshot = doc.toSnapshot();

  // This must not throw, even though snapshot order in the array is
  // insertion order, not tree order, and includes a tombstoned node.
  const restored = Fugue.fromSnapshot(snapshot, new Clock("A"));
  assert.equal(restored.toArray().join(""), "ac");

  // clock continues correctly after restore
  const op = restored.insertAt(2, "d");
  assert.equal(op.id.counter > 0, true);
  assert.equal(restored.toArray().join(""), "acd");
});

test("compacting before snapshotting produces a smaller snapshot that still round-trips and merges correctly", () => {
  // The exact sequence doc-content.ts runs on every save: apply an
  // edit, compact, then persist the snapshot. Deletes come off the
  // TAIL here (not the middle), since only trailing characters are
  // leaf tombstones in a sequentially-typed chain, see fugue.test.ts's
  // compact tests for why.
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "hello world");
  doc.deleteAt(10); // trailing 'd', a leaf
  doc.deleteAt(9); // trailing 'l' (now the last char), a leaf once 'd' is gone
  const uncompactedSize = doc.toSnapshot().length;

  doc.compact();
  const compactedSnapshot = doc.toSnapshot();
  assert.ok(
    compactedSnapshot.length < uncompactedSize,
    "compacting before the snapshot should leave fewer nodes than skipping it would"
  );

  const restored = Fugue.fromSnapshot(compactedSnapshot, new Clock("A"));
  assert.equal(restored.toArray().join(""), "hello wor");

  // A concurrent second replica, restored from the SAME (compacted)
  // snapshot, makes its own concurrent edit, same scenario as the
  // uncompacted round-trip test above, confirming compaction doesn't
  // change what a later merge produces.
  const concurrent = Fugue.fromSnapshot(compactedSnapshot, new Clock("B"));
  const concurrentOp = concurrent.insertAt(0, "!");
  const tailOps: FugueOp<string>[] = [];
  for (let i = 0; i < " there".length; i++) tailOps.push(restored.insertAt(9 + i, " there"[i]));

  for (const op of tailOps) concurrent.applyOp(op);
  restored.applyOp(concurrentOp);

  assert.equal(restored.toArray().join(""), concurrent.toArray().join(""));
  assert.equal(restored.toArray().join(""), "!hello wor there");
});
