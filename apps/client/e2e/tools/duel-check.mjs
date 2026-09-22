#!/usr/bin/env node
/**
 * The 1 v 1, played against a running server over real websockets.
 *
 * The unit tests drive the room in-process with a fake clock; this joins a real duel room with a
 * real socket and a real bot opponent and watches the clock it actually ships with: how long the
 * freeze lasts, whether the shop takes a purchase during it, whether it still takes one five
 * seconds into the live round, whether it refuses one after that, and what the wallet does between
 * rounds. Anything that only works with fake timers fails here.
 *
 *   node apps/server/dist/index.js &                # or: pnpm host
 *   HOST_URL=http://127.0.0.1:2567 node apps/client/e2e/tools/duel-check.mjs
 */
import { Client } from "@colyseus/sdk";

const URL = process.env.HOST_URL ?? "http://127.0.0.1:2567";
const client = new Client(URL.replace("http", "ws"));
const log = [];
const say = (line) => { log.push(line); console.log(line); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const room = await client.joinOrCreate("tdm", {
  name: "PROBE", room: `duel-${Date.now()}`, mode: "duel", map: "gora", bots: 1, botLevel: "normal",
});
const me = () => room.state.players.get(room.sessionId);
const phase = () => room.state.phase;

// Wait for the room to reach its first frozen round.
const t0 = Date.now();
while (phase() !== "prep" && Date.now() - t0 < 30000) await wait(100);
const freezeStart = Date.now();
say(`phase=${phase()} money=${me()?.money} (pistol round should be $800)`);

const buy = async (item) => {
  const before = me()?.money ?? 0;
  room.send("buy", { item });
  await wait(400);
  const after = me()?.money ?? 0;
  const owned = [...(me()?.owned ?? [])];
  return { item, before, after, took: before !== after, owned };
};

// 1. In the freeze: $800 buys a sidearm and does not buy a rifle.
say(`freeze: revolver → ${JSON.stringify(await buy("revolver"))}`);
say(`freeze: rifle   → ${JSON.stringify(await buy("rifle"))}`);
// 2. A perk and the launcher must not be on sale at all in this mode.
say(`freeze: roids    → ${JSON.stringify(await buy("roids"))}`);
say(`freeze: launcher → ${JSON.stringify(await buy("launcher"))}`);

// 3. How long the freeze really lasts.
while (phase() === "prep" && Date.now() - freezeStart < 40000) await wait(100);
const freezeMs = Date.now() - freezeStart;
say(`freeze lasted ${(freezeMs / 1000).toFixed(1)} s (expected ~15 s), now phase=${phase()}`);

// 4. Sit through the round and read the wallet the next one starts with.
const roundStart = Date.now();
while (phase() === "playing" && Date.now() - roundStart < 70000) await wait(200);
await wait(200);
say(`round over after ${((Date.now() - roundStart) / 1000).toFixed(1)} s · score ${room.state.scoreA}:${room.state.scoreB} · reason "${room.state.bomb.result}"`);
while (phase() === "prep" && (me()?.alive ?? false) === false && Date.now() - roundStart < 80000) await wait(200);
await wait(500);
say(`next round: money=${me()?.money} owned=${JSON.stringify([...(me()?.owned ?? [])])} alive=${me()?.alive}`);

// 5. THE TAIL, tested in a round the wallet can actually afford: buying is still open a moment
// after the freeze ends (CS's buy time running past the freeze) and shut a few seconds later.
while (phase() === "prep") await wait(100);
const live = Date.now();
await wait(1500);
say(`+1.5 s into round 2: light plate → ${JSON.stringify(await buy("light"))} (must go through)`);
await wait(Math.max(0, 6500 - (Date.now() - live)));
say(`+6.5 s into round 2: heavy plate → ${JSON.stringify(await buy("heavy"))} (must be refused)`);

await room.leave();
process.exit(0);
