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
  function riffleMerge(streams: FugueOp<string>[][], rng: () => number): FugueOp<string>[] {
    const cursors = streams.map(() => 0);
    const out: FugueOp<string>[] = [];
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
