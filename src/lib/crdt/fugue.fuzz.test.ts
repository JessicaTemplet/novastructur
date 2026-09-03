import test from "node:test";
import assert from "node:assert/strict";
import { Clock } from "./clock";
import { Fugue, FugueOp } from "./fugue";

// Deterministic PRNG (mulberry32) so a failure is reproducible from the
// seed printed in the assertion message, rather than being a flaky
// one-off.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALPHABET = "abcdefghij";

// A transport only guarantees order within one site's own op stream,
// not across sites, so this interleaves several per-site streams in a
// random but order-preserving way (a riffle shuffle) rather than fully
// shuffling, which would violate causal order (parent before child)
// within a site's own stream.
function riffleMerge<T>(streams: FugueOp<T>[][], rng: () => number): FugueOp<T>[] {
  const cursors = streams.map(() => 0);
  const out: FugueOp<T>[] = [];
  const remaining = () => cursors.some((c, i) => c < streams[i].length);
  while (remaining()) {
    const choices = cursors
      .map((c, i) => i)
      .filter((i) => cursors[i] < streams[i].length);
    const pick = choices[Math.floor(rng() * choices.length)];
    out.push(streams[pick][cursors[pick]]);
    cursors[pick]++;
  }
  return out;
}

test("fuzz: N replicas with random concurrent inserts/deletes converge", () => {
  const SEED = 424242;
  const rand = mulberry32(SEED);
  const SITES = ["A", "B", "C", "D"];
  const OPS_PER_SITE = 40;

  const docs = SITES.map((site) => new Fugue<string>(new Clock(site)));
  const allOps: FugueOp<string>[] = [];

  // Each site generates ops against its OWN local (initially empty,
  // never-synced) view, simulating fully concurrent offline edits.
  for (let i = 0; i < SITES.length; i++) {
    const doc = docs[i];
    for (let j = 0; j < OPS_PER_SITE; j++) {
      const len = doc.toArray().length;
      const doDelete = len > 0 && rand() < 0.25;
      if (doDelete) {
        const idx = Math.floor(rand() * len);
        allOps.push(doc.deleteAt(idx));
      } else {
        const idx = Math.floor(rand() * (len + 1));
        const ch = ALPHABET[Math.floor(rand() * ALPHABET.length)];
        allOps.push(doc.insertAt(idx, ch));
      }
    }
  }

  // Now build several fresh replicas that each apply ALL ops, but in a
  // different random order. Causal order (parent before child, insert
  // before its own delete) is still respected per-site since each
  // site's own ops were generated in sequence, we only shuffle across
  // sites, which the tree structure does not require any particular
  // order for.
  //
  // Merge respecting per-site causal order: interleave the four
  // per-site op streams in a random but order-preserving way (a
  // riffle shuffle), since a transport only guarantees order within
  // one site's stream, not across sites.
  const perSiteStreams = SITES.map((_, i) =>
    allOps.filter((op) => op.id.site === SITES[i])
  );

  const results: string[] = [];
  for (let trial = 0; trial < 6; trial++) {
    const trialRand = mulberry32(SEED + trial + 1);
    const order = riffleMerge(perSiteStreams, trialRand);
    const replica = new Fugue<string>(new Clock("replica" + trial));
    for (const op of order) replica.applyOp(op);
    results.push(replica.toArray().join(""));
  }

  const first = results[0];
  for (let i = 1; i < results.length; i++) {
    assert.equal(
      results[i],
      first,
      `seed ${SEED}: replica ${i} diverged from replica 0.\n` +
        `replica 0: ${JSON.stringify(first)}\nreplica ${i}: ${JSON.stringify(results[i])}`
    );
  }
});

test("fuzz: repeatedly compacting and round-tripping through a snapshot across many sequential saves never diverges from a reference that never compacts", () => {
  const SEED = 99331;
  const SITES = ["A", "B", "C"];

  // The pattern doc-content.ts actually runs in production: one
  // persisted document, a long sequence of saves over time (the site
  // id rotates between saves too, since actorSite is the saving user's
  // id, and different users edit the same doc), each save loading
  // whatever's CURRENTLY persisted (possibly already-compacted by an
  // earlier save), generating a brand new op fresh against it,
  // compacting, and round-tripping through a snapshot before the next
  // save runs. `shadow` runs the identical sequence of edit decisions
  // but generates its own ops independently and never compacts, as the
  // reference.
  //
  // Deliberately NOT "generate ops on one instance, apply them via
  // applyOp to a second, separately-compacting instance": an earlier
  // version of this test did exactly that (both here and, it turned
  // out, in the plain fuzz test's replica-merge shape) and failed with
  // a spurious "parent not found". That pattern needs a node this call
  // just pruned to still be around for an op the OTHER instance
  // generates later, which is a replica receiving externally-generated
  // ops after compacting locally, the one thing `compact()`'s own doc
  // comment says not to do. It was a bad test, not a real bug: nothing
  // in NovaStructur ever applies an externally-generated op to an
  // already-compacted tree, every op is generated fresh, in the same
  // transaction, against whatever is currently persisted, which is
  // exactly what this version simulates instead.
  const rand = mulberry32(SEED);
  let compacting = new Fugue<string>(new Clock(SITES[0]));
  const shadow = new Fugue<string>(new Clock(SITES[0]));
  const SAVES = 150;

  for (let i = 0; i < SAVES; i++) {
    const site = SITES[i % SITES.length];
    const len = shadow.toArray().length;
    const doDelete = len > 0 && rand() < 0.3;
    const idx = doDelete ? Math.floor(rand() * len) : Math.floor(rand() * (len + 1));
    const ch = ALPHABET[Math.floor(rand() * ALPHABET.length)];

    if (doDelete) shadow.deleteAt(idx);
    else shadow.insertAt(idx, ch);

    // Simulate "the next save": restore fresh from what was last
    // persisted (a different site id than last time, most saves), then
    // generate this save's op fresh against that, exactly like
    // doc-content.ts does inside its transaction.
    compacting = Fugue.fromSnapshot(compacting.toSnapshot(), new Clock(site));
    if (doDelete) compacting.deleteAt(idx);
    else compacting.insertAt(idx, ch);
    compacting.compact();

    assert.equal(
      compacting.toArray().join(""),
      shadow.toArray().join(""),
      `seed ${SEED}, save ${i}: compacting lineage diverged from the never-compacted reference`
    );
  }

  assert.ok(
    compacting.toSnapshot().length < shadow.toSnapshot().length,
    `seed ${SEED}: expected ${SAVES} saves with deletes to leave the compacting lineage with fewer nodes`
  );
});
