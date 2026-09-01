import { OpId } from "./clock";

/**
 * Observed-remove set. Use for many-valued fields where concurrent
 * add/remove needs to converge without a remove silently discarding a
 * concurrent add: issue labels, team memberships, doc-issue links, any
 * join-table-shaped data.
 *
 * Why not just track member ids directly: if replica A adds "urgent"
 * and replica B concurrently removes "urgent" from a state where it
 * hadn't seen A's add yet, a plain set can't tell which happened last
 * without a clock, and either an add-wins or remove-wins global policy
 * loses one side's intent every single time, silently. OR-Set instead
 * tags every add with a unique id and a remove only removes the
 * specific tags it had actually observed, so an add whose tag that
 * remove never saw survives the merge. That's the whole mechanism.
 */
type TagKey = string;

type Entry<T> = { value: T; tags: Set<TagKey> };

export class ORSet<T> {
  private adds = new Map<string, Entry<T>>();
  private removedTags = new Set<TagKey>();

  private tagKey(t: OpId): TagKey {
    return `${t.counter}@${t.site}`;
  }

  // Values must be stably comparable across replicas. For non-string
  // values, pass a stable id string as T and keep the full object
  // elsewhere, keyed by that id.
  private elementKey(value: T): string {
    return typeof value === "string" ? value : JSON.stringify(value);
  }

  add(value: T, tag: OpId): void {
    const ek = this.elementKey(value);
    const entry = this.adds.get(ek) ?? { value, tags: new Set<TagKey>() };
    entry.tags.add(this.tagKey(tag));
    this.adds.set(ek, entry);
  }

  // Removes every tag currently observed for this value. A concurrent
  // add using a tag this replica has not received yet is untouched, so
  // it survives the merge.
  remove(value: T): void {
    const entry = this.adds.get(this.elementKey(value));
    if (!entry) return;
    for (const tag of entry.tags) this.removedTags.add(tag);
  }

  has(value: T): boolean {
    const entry = this.adds.get(this.elementKey(value));
    if (!entry) return false;
    return [...entry.tags].some((t) => !this.removedTags.has(t));
  }

  values(): T[] {
    return [...this.adds.values()]
      .filter((e) => [...e.tags].some((t) => !this.removedTags.has(t)))
      .map((e) => e.value);
  }

  // Idempotent, commutative, associative merge.
  merge(other: ORSet<T>): void {
    for (const [ek, entry] of other.adds) {
      const mine = this.adds.get(ek) ?? { value: entry.value, tags: new Set<TagKey>() };
      for (const t of entry.tags) mine.tags.add(t);
      this.adds.set(ek, mine);
    }
    for (const t of other.removedTags) this.removedTags.add(t);
  }

  toJSON() {
    return {
      adds: [...this.adds.entries()].map(
        ([ek, e]) => [ek, e.value, [...e.tags]] as const
      ),
      removed: [...this.removedTags],
    };
  }

  static fromJSON<T>(json: {
    adds: readonly (readonly [string, T, readonly TagKey[]])[];
    removed: readonly TagKey[];
  }): ORSet<T> {
    const set = new ORSet<T>();
    for (const [ek, value, tags] of json.adds) {
      set.adds.set(ek, { value, tags: new Set(tags) });
    }
    set.removedTags = new Set(json.removed);
    return set;
  }
}
