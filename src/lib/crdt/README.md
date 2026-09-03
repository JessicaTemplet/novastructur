# CRDT primitives

Four building blocks, pick the one that matches how a field can collide.
None of these do persistence or network sync, that's a separate layer on
top (see "Not built yet" below). Each primitive here only answers "given
two concurrent writes, what does the merged state look like."

## Which primitive for which kind of field

**LWWRegister** (`lww-register.ts`)
Any single scalar value where "most recent write wins" is the right
semantics, and losing the loser's write entirely is fine because there
was nothing to merge, just two different opinions about one value.
In this schema: Issue.title, Issue.priority, Issue.stateId,
Issue.assigneeId, Issue.dueDate, Issue.estimate, Issue.cycleId,
Issue.sortOrder, Doc.title.

**ORSet** (`or-set.ts`)
Any many-valued, add/remove field, join-table shaped. In this schema:
the label set on an Issue (IssueLabel), a user's team memberships
(TeamMembership), the docs linked to an issue (DocIssueLink).

**Fugue** (`fugue.ts`)
Ordered content where concurrent inserts at the same position need to
merge without character-level interleaving. In this schema: Doc.content
is the real case. Issue.description is a judgment call, it's markdown
too, but if two people editing the same issue description at once
isn't a scenario you actually expect, LWWRegister is simpler and one
person's edit just wins, decide this when you build the Issue write
path rather than defaulting to the heavier option everywhere.

**Clock / OpId** (`clock.ts`)
Not a data type, the shared ordering primitive the other three build
on. One `Clock` per active client/session (seed it with a stable site
id, e.g. the user's session id or a generated device id, not the raw
user id, since one user editing from two tabs is two concurrent
writers).

## What's deliberately not here yet

- **Persistence.** Nothing here talks to Prisma. The natural shape is:
  store each field's CRDT state (or its op log) alongside the row,
  probably as a JSON column, and rehydrate via each type's
  `toJSON`/`fromJSON`.
- **Network sync / transport.** How ops actually get from one client to
  another (WebSocket, polling, whatever) isn't built. Fugue and ORSet
  are written as operation-based CRDTs (you call `.merge()` or
  `.applyOp()` with whatever arrives), so any transport that
  eventually delivers every op works, it doesn't need to be
  real-time.
- **Fugue causal delivery.** `Fugue.applyOp` throws if an insert's
  parent hasn't arrived yet rather than silently dropping it, so
  whatever transport you build needs to either guarantee per-site
  ordering (easy, most queues do this for free) or buffer and retry.
- **Tombstone garbage collection.** `Fugue.compact()` prunes the
  narrower, easy case: a deleted node with no children, which can
  never be needed for tree structure or as an insert anchor again, see
  its doc comment for the full argument. `doc-content.ts` calls it on
  every save, so a Doc that gets edited for years doesn't accumulate a
  tombstone per deleted character forever. What's still not built is
  the general, harder problem this is often confused with: pruning a
  tombstone that a remote, not-yet-synced replica might still reference
  in an op it hasn't sent yet, which needs an actual "everyone has seen
  this delete" protocol (version vectors, causal stability tracking).
  `compact()`'s safety argument leans on NovaStructur not having that
  problem today, every op is generated fresh against the current
  server-side tree in the same transaction that persists it, never
  replayed later from an independent op log, so there's no stale
  replica to strand. If NovaStructur ever grows real offline,
  multi-replica sync, that assumption stops holding and this needs
  revisiting.

## Fugue specifically: what's verified vs. what's assumed

The core placement rule (right-child-of-left-neighbor, else
left-child-of-next-neighbor) and the resulting non-interleaving
behavior are tested against the canonical concurrent-typing example
from the Fugue paper (`fugue.test.ts`) and a seeded randomized fuzz
test across many concurrent inserts/deletes and merge orderings
(`fugue.fuzz.test.ts`), both passing. What's **not** independently
re-verified here is the paper's full formal "maximal non-interleaving"
proof for every edge case (concurrent backward/right-to-left typing in
particular). If that specific case ever matters for how NovaStructur's
editor handles it, it needs its own targeted test before being trusted.

Run the suite: `npm run test:crdt`
