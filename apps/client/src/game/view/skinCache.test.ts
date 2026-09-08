import { expect, it } from "vitest";
import { SkinCache } from "./skinCache";

it("shares leases and never evicts a referenced set, even above the soft limit", () => {
  const destroyed: string[] = []; const cache = new SkinCache<string>(1, v => destroyed.push(v));
  const a = cache.acquire("a", () => "a"), anotherA = cache.acquire("a", () => { throw new Error("duplicate"); });
  const b = cache.acquire("b", () => "b");
  expect(cache.stats).toEqual({ sets: 2, active: 2, references: 3 });
  a.release(); a.release(); expect(destroyed).toEqual([]);
  anotherA.release(); expect(destroyed).toEqual(["a"]); expect(b.value).toBe("b");
  b.release(); cache.dispose(); expect(destroyed).toEqual(["a", "b"]);
});
it("evicts the least recently used idle set and reuses hot sets", () => {
  const destroyed: string[] = []; const cache = new SkinCache<string>(2, v => destroyed.push(v));
  cache.acquire("a", () => "a").release(); cache.acquire("b", () => "b").release();
  cache.acquire("a", () => "wrong").release(); cache.acquire("c", () => "c").release();
  expect(destroyed).toEqual(["b"]); expect(cache.stats.sets).toBe(2);
});
