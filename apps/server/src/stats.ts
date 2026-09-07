/**
 * Process-wide tick timing for `/health` (performance pass, task 6): the VPS can be watched with
 * `curl` instead of `htop`. Every room reports how long each simulation tick took; the last sixty
 * seconds are kept in one-second buckets, so the answer is "the worst tick of the last minute and
 * the mean", which is what tells you whether the one core the simulation runs on is keeping up.
 */
const WINDOW_S = 60;
const maxBucket = new Float64Array(WINDOW_S);
const sumBucket = new Float64Array(WINDOW_S);
const countBucket = new Uint32Array(WINDOW_S);
const stampBucket = new Float64Array(WINDOW_S); // which second each bucket currently holds
let ticks = 0;

export function recordTick(ms: number, nowMs = Date.now()): void {
  const sec = Math.floor(nowMs / 1000);
  const i = sec % WINDOW_S;
  if (stampBucket[i] !== sec) { stampBucket[i] = sec; maxBucket[i] = 0; sumBucket[i] = 0; countBucket[i] = 0; }
  if (ms > maxBucket[i]) maxBucket[i] = ms;
  sumBucket[i] += ms; countBucket[i]++; ticks++;
}

export interface TickStats { maxMs: number; meanMs: number; ticks: number; windowS: number }

/** Worst and mean tick over the last minute (buckets older than that are ignored, not cleared). */
export function tickStats(nowMs = Date.now()): TickStats {
  const sec = Math.floor(nowMs / 1000);
  let max = 0, sum = 0, n = 0;
  for (let i = 0; i < WINDOW_S; i++) {
    if (sec - stampBucket[i] >= WINDOW_S) continue;
    if (maxBucket[i] > max) max = maxBucket[i];
    sum += sumBucket[i]; n += countBucket[i];
  }
  return { maxMs: Math.round(max * 100) / 100, meanMs: n ? Math.round((sum / n) * 1000) / 1000 : 0, ticks, windowS: WINDOW_S };
}
