export interface Lease<T> { value: T; release(): void }
interface Entry<T> { value: T; refs: number; used: number }

/** The limit is soft ONLY while every set is in use: evicting a live texture corrupts another gun. */
export class SkinCache<T> {
  private entries = new Map<string, Entry<T>>();
  private clock = 0;
  constructor(private readonly limit: number, private readonly destroy: (value: T) => void) {}
  acquire(key: string, create: () => T): Lease<T> {
    let entry = this.entries.get(key);
    if (!entry) { entry = { value: create(), refs: 0, used: 0 }; this.entries.set(key, entry); }
    entry.refs++; entry.used = ++this.clock; this.evict();
    let released = false;
    return { value: entry.value, release: () => {
      if (released) return; released = true;
      entry!.refs--; entry!.used = ++this.clock; this.evict();
    } };
  }
  private evict(): void {
    while (this.entries.size > this.limit) {
      const idle = [...this.entries].filter(([, e]) => e.refs === 0).sort((a, b) => a[1].used - b[1].used)[0];
      if (!idle) return;
      this.entries.delete(idle[0]); this.destroy(idle[1].value);
    }
  }
  get stats(): { sets: number; active: number; references: number } {
    const entries = [...this.entries.values()];
    return { sets: entries.length, active: entries.filter(e => e.refs > 0).length, references: entries.reduce((n, e) => n + e.refs, 0) };
  }
  dispose(): void { for (const e of this.entries.values()) this.destroy(e.value); this.entries.clear(); }
}
