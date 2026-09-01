import { OpId, compareOpId } from "./clock";

/**
 * Last-writer-wins register. Use for any single scalar field that only
 * needs "whoever wrote most recently wins" semantics: a status, an
 * assignee, a priority, a due date, a title.
 *
 * Not the right tool for free text someone else might be editing at the
 * same time, that's what fugue.ts is for, since LWW just discards the
 * loser's write entirely instead of merging both.
 */
export class LWWRegister<T> {
  private constructor(private value: T, private id: OpId) {}

  static init<T>(value: T, id: OpId): LWWRegister<T> {
    return new LWWRegister(value, id);
  }

  get(): T {
    return this.value;
  }

  // Local write. Caller supplies a fresh OpId from their Clock.
  set(value: T, id: OpId): void {
    if (compareOpId(id, this.id) > 0) {
      this.value = value;
      this.id = id;
    }
  }

  // Merge in a remote register's state. Idempotent, commutative, and
  // associative, so calling this in any order, any number of times,
  // converges to the same value on every replica.
  merge(other: LWWRegister<T>): void {
    if (compareOpId(other.id, this.id) > 0) {
      this.value = other.value;
      this.id = other.id;
    }
  }

  toJSON(): { value: T; id: OpId } {
    return { value: this.value, id: this.id };
  }

  static fromJSON<T>(json: { value: T; id: OpId }): LWWRegister<T> {
    return new LWWRegister(json.value, json.id);
  }
}
