/** Reuse the existing deterministic pellet PRNG without changing any combat code. */
export { mulberry32 } from "./hitscan";

/** FNV-1a over UTF-16 code units, fixed across JS runtimes. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function pick<T>(rng: () => number, values: readonly T[]): T {
  if (!values.length) throw new RangeError("Cannot pick from an empty collection");
  return values[Math.floor(rng() * values.length)];
}

export function weightedPick<T>(rng: () => number, entries: readonly { value: T; weight: number }[]): T {
  if (entries.some(e => !Number.isFinite(e.weight) || e.weight < 0)) throw new RangeError("Invalid weight");
  const positive = entries.filter(e => e.weight > 0);
  const total = positive.reduce((sum, e) => sum + e.weight, 0);
  if (!Number.isFinite(total) || total <= 0) throw new RangeError("Weights must have a positive finite sum");
  let cursor = rng() * total;
  for (const entry of positive) { cursor -= entry.weight; if (cursor < 0) return entry.value; }
  return positive[positive.length - 1].value;
}
