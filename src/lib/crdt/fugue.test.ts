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
