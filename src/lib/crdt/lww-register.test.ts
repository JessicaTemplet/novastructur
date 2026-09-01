import test from "node:test";
import assert from "node:assert/strict";
import { Clock } from "./clock";
import { LWWRegister } from "./lww-register";

test("later write wins locally", () => {
  const clock = new Clock("A");
  const reg = LWWRegister.init("todo", clock.tick());
  reg.set("in_progress", clock.tick());
  reg.set("done", clock.tick());
  assert.equal(reg.get(), "done");
});

test("an older set() after a newer one is a no-op", () => {
  const clock = new Clock("A");
  const id1 = clock.tick();
  const id2 = clock.tick();
  const reg = LWWRegister.init("todo", id1);
  reg.set("done", id2);
  // Simulate a stale/reordered write arriving with an older id.
  reg.set("in_progress", id1);
  assert.equal(reg.get(), "done");
});

test("merge converges regardless of order (commutative)", () => {
  const clockA = new Clock("A");
  const clockB = new Clock("B");
  const base = clockA.tick();

  const a = LWWRegister.init("todo", base);
  const b = LWWRegister.init("todo", base);

  a.set("in_progress", clockA.tick());
  b.set("done", clockB.tick());

  const merged1 = LWWRegister.fromJSON(a.toJSON());
  merged1.merge(b);

  const merged2 = LWWRegister.fromJSON(b.toJSON());
  merged2.merge(a);

  assert.equal(merged1.get(), merged2.get());
});

test("merge is idempotent", () => {
  const clock = new Clock("A");
  const a = LWWRegister.init("todo", clock.tick());
  a.set("done", clock.tick());
  const snapshot = LWWRegister.fromJSON(a.toJSON());

  a.merge(snapshot);
  a.merge(snapshot);
  assert.equal(a.get(), "done");
});
