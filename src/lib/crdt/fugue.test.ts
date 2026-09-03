import test from "node:test";
import assert from "node:assert/strict";
import { Clock } from "./clock";
import { Fugue, FugueOp } from "./fugue";

function typeString(doc: Fugue<string>, s: string): FugueOp<string>[] {
  const ops: FugueOp<string>[] = [];
  for (let i = 0; i < s.length; i++) {
    ops.push(doc.insertAt(i, s[i]));
  }
  return ops;
}

test("sequential local typing renders in order", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "hello");
  assert.equal(doc.toArray().join(""), "hello");
});

test("local delete removes the character but keeps the tombstone", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "hello");
  doc.deleteAt(4); // 'o'
  assert.equal(doc.toArray().join(""), "hell");
  // typing right after the deletion still works (exercises the
  // full-tree-successor logic for a left neighbor with a tombstoned
  // right child)
  doc.insertAt(4, "p");
  assert.equal(doc.toArray().join(""), "hellp");
});

test("two replicas typing at the same position concurrently do not interleave", () => {
  // This is the canonical example from the Fugue paper: A types
  // "Hello " and B types "Hi ", both starting from an empty document,
  // neither having seen the other's edits yet. The bad outcome plain
  // RGA can produce is something like "HHeil lo". The only acceptable
  // outcomes are "Hello Hi " or "Hi Hello ".
  const a = new Fugue<string>(new Clock("A"));
  const b = new Fugue<string>(new Clock("B"));

  const opsA = typeString(a, "Hello ");
  const opsB = typeString(b, "Hi ");

  for (const op of opsB) a.applyOp(op);
  for (const op of opsA) b.applyOp(op);

  const resultA = a.toArray().join("");
  const resultB = b.toArray().join("");

  assert.equal(resultA, resultB, "replicas must converge to the same string");
  assert.ok(
    resultA === "Hello Hi " || resultA === "Hi Hello ",
    `expected a non-interleaved merge, got: ${JSON.stringify(resultA)}`
  );
});

test("three replicas, out-of-order merge, all converge to the same string", () => {
  const a = new Fugue<string>(new Clock("A"));
  const b = new Fugue<string>(new Clock("B"));
  const c = new Fugue<string>(new Clock("C"));

  const opsA = typeString(a, "cat");
  const opsB = typeString(b, "dog");
  const opsC = typeString(c, "fox");

  // Apply in three different orders across the three replicas.
  for (const op of [...opsB, ...opsC]) a.applyOp(op);
  for (const op of [...opsC, ...opsA]) b.applyOp(op);
  for (const op of [...opsA, ...opsB]) c.applyOp(op);

  const resultA = a.toArray().join("");
  const resultB = b.toArray().join("");
  const resultC = c.toArray().join("");

  assert.equal(resultA, resultB);
  assert.equal(resultB, resultC);
  // Each site's own burst should still be contiguous, not interleaved
  // with the others.
  for (const chunk of ["cat", "dog", "fox"]) {
    assert.ok(resultA.includes(chunk), `expected "${chunk}" to stay contiguous in ${resultA}`);
  }
});

test("applying the same op twice is a no-op (idempotent)", () => {
  const a = new Fugue<string>(new Clock("A"));
  const b = new Fugue<string>(new Clock("B"));
  const ops = typeString(a, "hi");
  for (const op of ops) {
    b.applyOp(op);
    b.applyOp(op); // duplicate delivery
  }
  assert.equal(b.toArray().join(""), "hi");
});

test("applying an insert before its parent throws instead of silently corrupting state", () => {
  const a = new Fugue<string>(new Clock("A"));
  const b = new Fugue<string>(new Clock("B"));
  const ops = typeString(a, "hi");
  assert.throws(() => b.applyOp(ops[1]), /parent .* not found/);
});

test("concurrent delete of the same character from two replicas converges", () => {
  const insertOps = typeString(new Fugue<string>(new Clock("A")), "hi");

  const replicaA = new Fugue<string>(new Clock("A"));
  const replicaB = new Fugue<string>(new Clock("B"));
  for (const op of insertOps) {
    replicaA.applyOp(op);
    replicaB.applyOp(op);
  }

  const deleteOpA = replicaA.deleteAt(0); // both delete 'h' concurrently
  const deleteOpB = replicaB.deleteAt(0);

  replicaA.applyOp(deleteOpB);
  replicaB.applyOp(deleteOpA);

  assert.equal(replicaA.toArray().join(""), replicaB.toArray().join(""));
  assert.equal(replicaA.toArray().join(""), "i");
});

test("compact removes a leaf tombstone without changing visible content", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "hello world");
  // Sequential typing makes a straight chain where each character's
  // child is the next one typed, so only the TRAILING character has no
  // child, deleting from the middle (the space, say) leaves a
  // tombstone that still has a live child and correctly isn't prunable,
  // see the "leaves a tombstone alone" test below for that case.
  doc.deleteAt(10); // trailing 'd', nothing was ever typed after it
  const before = doc.toArray().join("");
  const beforeCount = doc.toSnapshot().length;

  const removed = doc.compact();

  assert.equal(doc.toArray().join(""), before);
  assert.equal(removed, 1);
  assert.equal(doc.toSnapshot().length, beforeCount - 1);
});

test("compact leaves a tombstone alone while it still has children", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "ab"); // 'b' becomes a child of 'a' in the tree
  doc.deleteAt(0); // tombstone 'a', but 'b' still hangs off it

  const removed = doc.compact();

  assert.equal(removed, 0, "a tombstone with a live child must not be pruned");
  assert.equal(doc.toArray().join(""), "b");
});

test("compact peels a chain of tombstones inward, once the innermost one becomes a leaf too", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "ab");
  doc.deleteAt(0); // 'a', still has 'b' hanging off it
  doc.deleteAt(0); // 'b' (the only visible char left), now a leaf tombstone
  const beforeCount = doc.toSnapshot().length;

  const removed = doc.compact();

  assert.equal(removed, 2, "both tombstones should prune in one pass, innermost first");
  assert.equal(doc.toSnapshot().length, beforeCount - 2);
  assert.equal(doc.toArray().join(""), "");
});

test("compacting does not break inserting into a position a tombstone used to anchor", () => {
  const doc = new Fugue<string>(new Clock("A"));
  typeString(doc, "hello");
  doc.deleteAt(4); // tombstone 'o', a leaf, prunable immediately
  doc.compact();
  // Same scenario as the plain "local delete" test above, exercising the
  // full-tree-successor logic in insertAt, but now the successor
  // tombstone it used to resolve against is gone from the tree entirely.
  doc.insertAt(4, "p");
  assert.equal(doc.toArray().join(""), "hellp");
});

test("compacting one replica does not break convergence with a replica that never compacts", () => {
  // compact() is purely local cleanup, it never produces an op, so this
  // simulates the real deployment: doc-content.ts compacts on every
  // save, but nothing tells any other in-flight session that happened,
  // nor does anything need to.
  const a = new Fugue<string>(new Clock("A"));
  const opsInsert = typeString(a, "hello");
  const opDelete = a.deleteAt(4); // tombstone 'o'
  a.compact();

  const b = new Fugue<string>(new Clock("B"));
  for (const op of opsInsert) b.applyOp(op);
  b.applyOp(opDelete);

  assert.equal(a.toArray().join(""), b.toArray().join(""));

  // And a further edit generated on the compacted replica still applies
  // cleanly to the uncompacted one, which is still carrying the
  // tombstone a already dropped.
  const furtherOp = a.insertAt(4, "p");
  b.applyOp(furtherOp);
  assert.equal(a.toArray().join(""), b.toArray().join(""));
  assert.equal(a.toArray().join(""), "hellp");
});
