import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RoomHarness } from "./testHarness";

/**
 * Outbound bytes per client (performance pass, task 5). Ten simulated seconds of a full-ish room —
 * eight bots on the move and two humans — counted at the fake clients' raw() (state patches; the
 * per-owner ack message is counted through send()). A budget with a record of what was measured:
 *
 *   before the trim (float32 yaw/pitch/vx/vy/vz + a replicated ack per player): see the log line
 *   in the commit that added this file.
 */
let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

it("keeps the per-client snapshot stream within budget with eight moving bots", async () => {
  h = await RoomHarness.create({ room: "bytes", mode: "tdm", bots: 8, botLevel: "normal", seed: 9 });
  const a = await h.join("ALPHA"); await h.join("BRAVO");
  await h.tick(120); // warm-up over, everyone moving
  a.rawBytes = 0; a.rawFrames = 0; a.sent.length = 0;
  const SECONDS = 10;
  await h.tick(60 * SECONDS);
  const msgBytes = a.sent.reduce((n, m) => n + JSON.stringify(m.payload ?? null).length + 4, 0);
  const perSec = a.rawBytes / SECONDS, msgPerSec = msgBytes / SECONDS;
  console.log(`snapshot stream to one client: ${(perSec / 1024).toFixed(1)} kB/s in ${a.rawFrames / SECONDS} patches/s (+ ~${(msgPerSec / 1024).toFixed(2)} kB/s of messages), 10 bodies`);
  expect(a.rawFrames / SECONDS).toBeGreaterThan(15);
  expect(perSec).toBeLessThan(12 * 1024);
});
