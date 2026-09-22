/**
 * How many people really fit — over real websockets, against a running server.
 *
 * The unit tests seat players through the matchmaker in-process; this joins N browser-side SDK
 * clients to a deathmatch room that already has its eight bots, then prints what `/rooms` and
 * `/health` say about it. It is the tool that answers "does the open lobby actually admit them",
 * including the refusal at the cap.
 *
 *   node apps/server/dist/index.js &                      # or: pnpm host
 *   HOST_URL=http://127.0.0.1:2567 N=34 node apps/client/e2e/tools/crowd-check.mjs
 *
 * N above the host's cap (`FB_MAX_PLAYERS`, 32 by default) is the point: the joiner past it must
 * be refused with "room full" and the room must stay exactly at its size.
 */
import { Client } from "@colyseus/sdk";

const URL = process.env.HOST_URL ?? "http://127.0.0.1:2567";
const N = Number(process.env.N ?? 16);
const client = new Client(URL.replace("http", "ws"));
const rooms = [];
let first;
for (let i = 0; i < N; i++) {
  try {
    const opts = { name: `P${i}`, room: "crowd", mode: "tdm", bots: 8, botLevel: "normal", map: "district" };
    const r = first ? await client.joinById(first, opts) : await client.joinOrCreate("tdm", opts);
    first ??= r.roomId;
    rooms.push(r);
  } catch (e) { console.log(`join ${i} REFUSED: ${e.message}`); break; }
}
await new Promise((r) => setTimeout(r, 1500));
const listing = await (await fetch(`${URL}/rooms`)).json();
const health = await (await fetch(`${URL}/health`)).json();
console.log(`joined ${rooms.length} humans over websockets`);
console.log("rooms:", JSON.stringify(listing));
console.log("health:", JSON.stringify({ players: health.players, maxPlayers: health.maxPlayers, openMaxPlayers: health.openMaxPlayers, tick: health.tick }));
console.log("bodies in state:", rooms[0]?.state?.players?.size);
for (const r of rooms) await r.leave();
process.exit(0);
