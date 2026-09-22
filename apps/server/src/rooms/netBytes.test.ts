import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_BOTS, OPEN_MAX_PLAYERS } from "@frankibarber/shared";
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

/**
 * The same stream at the OPEN LOBBY cap, which is the case that decides whether
 * `OPEN_MAX_PLAYERS` is a number this server can send: 32 humans + 8 bots is 40 bodies, and every
 * one of them is in the patch every client gets — the room's outbound cost is the per-client
 * figure below times the number of sockets, so it grows as the square of the room.
 *
 * Only the bots move here (the harness sends the humans no input), so the standing players cost
 * what a still body costs: their schema, and nothing per tick. A room of 32 people all running
 * pays more per body, which is why the budget below leaves room rather than pinning what was
 * measured — and why a playtest, not this test, is what should move the cap.
 */
it("still fits the per-client budget with a room full of people", async () => {
  h = await RoomHarness.create({ room: "bytesOpen", mode: "tdm", bots: MAX_BOTS, botLevel: "normal", seed: 9 });
  const a = await h.join("ALPHA");
  for (let i = 1; i < OPEN_MAX_PLAYERS; i++) await h.join(`P${i}`);
  expect(h.state.players.size).toBe(OPEN_MAX_PLAYERS + MAX_BOTS);
  await h.tick(120);
  a.rawBytes = 0; a.rawFrames = 0; a.sent.length = 0;
  const SECONDS = 10;
  await h.tick(60 * SECONDS);
  const perSec = a.rawBytes / SECONDS;
  const clients = OPEN_MAX_PLAYERS;
  console.log(`snapshot stream to one client: ${(perSec / 1024).toFixed(1)} kB/s in ${a.rawFrames / SECONDS} patches/s, ${h.state.players.size} bodies · room total ~${((perSec * clients) / 1024 / 1024).toFixed(2)} MB/s out`);
  expect(a.rawFrames / SECONDS).toBeGreaterThan(15);
  expect(perSec).toBeLessThan(40 * 1024);
}, 120000);
