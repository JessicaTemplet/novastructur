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
