import test from "node:test";
import assert from "node:assert/strict";
import { Clock } from "./clock";
import { ORSet } from "./or-set";

test("add then remove locally", () => {
  const clock = new Clock("A");
  const set = new ORSet<string>();
  set.add("urgent", clock.tick());
  assert.equal(set.has("urgent"), true);
  set.remove("urgent");
  assert.equal(set.has("urgent"), false);
});

test("concurrent add and remove: the add survives (the whole point of OR-Set)", () => {
  const clockA = new Clock("A");
  const clockB = new Clock("B");

  // Replica A: label exists, then gets removed.
  const a = new ORSet<string>();
  a.add("urgent", clockA.tick());
  a.remove("urgent");

  // Replica B, concurrently, never saw A's add, so it adds its own
  // "urgent" independently (different tag).
  const b = new ORSet<string>();
  b.add("urgent", clockB.tick());

  a.merge(b);
  b.merge(a);

  // B's add used a tag A's remove never observed, so it survives.
  assert.equal(a.has("urgent"), true);
  assert.equal(b.has("urgent"), true);
});

test("merge is commutative and converges", () => {
  const clockA = new Clock("A");
  const clockB = new Clock("B");

  const a = new ORSet<string>();
  a.add("bug", clockA.tick());
  a.add("urgent", clockA.tick());

  const b = new ORSet<string>();
  b.add("urgent", clockB.tick());
  b.remove("urgent"); // removes only B's own tag for "urgent"

  const merged1 = ORSet.fromJSON(a.toJSON());
  merged1.merge(b);

  const merged2 = ORSet.fromJSON(b.toJSON());
  merged2.merge(a);

  assert.deepEqual(merged1.values().sort(), merged2.values().sort());
  // A's independent "urgent" tag was never removed, so it survives
  // even though B removed its own copy.
  assert.equal(merged1.has("urgent"), true);
});

test("merge is idempotent", () => {
  const clock = new Clock("A");
  const a = new ORSet<string>();
  a.add("bug", clock.tick());
  const snapshot = ORSet.fromJSON(a.toJSON());
  a.merge(snapshot);
  a.merge(snapshot);
  assert.deepEqual(a.values(), ["bug"]);
});
