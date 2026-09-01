export type OpId = {
  counter: number;
  site: string;
};

export function compareOpId(a: OpId, b: OpId): number {
  if (a.counter !== b.counter) return a.counter - b.counter;
  return a.site < b.site ? -1 : a.site > b.site ? 1 : 0;
}

export function opIdEquals(a: OpId, b: OpId): boolean {
  return a.counter === b.counter && a.site === b.site;
}

export class Clock {
  private counter = 0;
  constructor(private readonly site: string) {}

  tick(): OpId {
    this.counter += 1;
    return { counter: this.counter, site: this.site };
  }

  observe(remote: OpId): void {
    this.counter = Math.max(this.counter, remote.counter);
  }
}
