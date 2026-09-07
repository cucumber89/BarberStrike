/**
 * Player-hosted flow check (2.0): does one process really serve the game AND the page?
 *
 * Nothing else can prove this. The e2e suite runs against the dev pair — Vite on 5174, the game on
 * 2567 — which is exactly the arrangement self-hosting replaces, so it would pass whether or not
 * the single-port flow worked at all.
 *
 * The crux is the WebSocket URL: the page is on the host's port, so the socket must be on THAT port
 * too. A socket on 2567 means `defaultServerUrl` fell through to its hosted-deployment branch, and
 * a friend on another machine would be talking to nothing.
 *
 * Drop D adds the second half of "a friend on another machine": the LINK. `<host>/r/<room>?mode=…`
 * must come back as the page (the server's SPA fallback, not a 404), open the lobby asking for a
 * nickname and nothing else, and land in THAT room in THAT mode — proven from the server's own
 * `/rooms` listing, not from the page's opinion of itself.
 *
 *   pnpm --filter @frankibarber/client build
 *   PORT=2599 pnpm --filter @frankibarber/server dev       # another shell
 *   HOST_URL=http://localhost:2599 node apps/client/e2e/tools/hostcheck.mjs
 *
 * Exit code 1 when any of the checks below fails; the table is written to
 * apps/client/e2e/out/d/hostcheck.md as well as printed.
 *
 * MEASURED when this was written: page http://localhost:2599, socket ws://localhost:2599, HUD up,
 * zero console errors; link /r/link-<t>?mode=gungame → lobby shows only the nickname, the room
 * listing has {name: link-<t>, mode: gungame, clients: 1}.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.env.HOST_URL ?? "http://localhost:2599";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/d");
const rows = [];
const check = (name, ok, detail) => { rows.push({ name, ok, detail }); console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(34)} ${detail}`); };

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function openPage() {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 140)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 140)); });
  const sockets = [];
  p.on("websocket", (ws) => sockets.push(ws.url()));
  return { ctx, p, errors, sockets };
}

// ---- 1. The single-port flow (2.0): page and socket on the same origin.
{
  const { ctx, p, errors, sockets } = await openPage();
  await p.goto(URL);
  await p.getByTestId("btn-play").click();
  await p.getByTestId("input-name").fill("HOSTTEST");
  await p.getByTestId("input-room").fill("host-" + Date.now());
  await p.getByTestId("btn-quickplay").click();
  await p.getByTestId("hud").waitFor({ timeout: 60000 });
  // `window.__fb` is a DEV-build hook, so a production build has no HUD to read. The crux is
  // provable without it: which origin did the game open its socket to?
  await p.waitForTimeout(4000);
  const origin = await p.evaluate(() => location.origin);
  const socketOrigin = sockets[0] ? new globalThis.URL(sockets[0]).origin.replace(/^ws/, "http") : "(no socket)";
  check("page origin = socket origin", socketOrigin === origin, `${origin} / ${sockets[0] ?? "none"}`);
  check("hud ammo element", (await p.getByTestId("ammo").count().catch(() => 0)) > 0, "present");
  check("console errors (quick play)", errors.length === 0, errors.length ? JSON.stringify(errors.slice(0, 3)) : "none");
  await ctx.close();
}

// ---- 2. Join by link (Drop D): /r/<room>?mode=… is the page, asks only for a nickname, lands in that room.
{
  const room = "link-" + Date.now();
  const mode = "gungame";
  const res = await fetch(`${URL}/r/${room}?mode=${mode}`);
  check("GET /r/<room> is the page", res.status === 200 && /text\/html/.test(res.headers.get("content-type") ?? ""), `${res.status} ${res.headers.get("content-type")}`);
  const rooms404 = await fetch(`${URL}/assets/does-not-exist-123.js`);
  check("missing asset is 404, not a page", rooms404.status === 404, String(rooms404.status));

  const { ctx, p, errors } = await openPage();
  await p.goto(`${URL}/r/${room}?mode=${mode}`);
  await p.getByTestId("link-join").waitFor({ timeout: 30000 });
  const roomShown = await p.getByTestId("link-room").innerText();
  const modeShown = await p.getByTestId("link-mode").innerText();
  const roomInputs = await p.getByTestId("input-room").count();
  const modePickers = await p.getByTestId("mode-picker").count();
  check("lobby names the link's room", roomShown === room, roomShown);
  check("lobby names the link's mode", modeShown === "GUN", modeShown);
  check("lobby asks for the nickname only", roomInputs === 0 && modePickers === 0, `room inputs ${roomInputs}, mode pickers ${modePickers}`);
  await p.getByTestId("input-name").fill("LINKTEST");
  await p.getByTestId("btn-quickplay").click();
  await p.getByTestId("hud").waitFor({ timeout: 60000 });
  await p.waitForTimeout(2000);
  const listing = await (await fetch(`${URL}/rooms`)).json().catch(() => []);
  const rowsOf = Array.isArray(listing) ? listing : (listing.rooms ?? []);
  const mine = rowsOf.find((r) => (r.metadata?.name ?? r.name) === room);
  check("server lists the room from the link", !!mine, mine ? JSON.stringify({ name: mine.metadata?.name, mode: mine.metadata?.mode, clients: mine.clients }) : JSON.stringify(rowsOf).slice(0, 160));
  check("…in the link's mode, with this client in it", !!mine && mine.metadata?.mode === mode && mine.clients >= 1, mine ? `${mine.metadata?.mode} × ${mine.clients}` : "-");
  check("console errors (link join)", errors.length === 0, errors.length ? JSON.stringify(errors.slice(0, 3)) : "none");
  await ctx.close();
}

await b.close();
fs.mkdirSync(OUT, { recursive: true });
const md = ["# hostcheck", "", `Host: ${URL} · ${new Date().toISOString()}`, "", "| check | result | detail |", "|---|---|---|",
  ...rows.map((r) => `| ${r.name} | ${r.ok ? "ok" : "FAIL"} | ${String(r.detail).replace(/\|/g, "\\|")} |`), ""].join("\n");
fs.writeFileSync(path.join(OUT, "hostcheck.md"), md);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : `all ${rows.length} checks passed`, `→ ${path.join(OUT, "hostcheck.md")}`);
process.exit(failed ? 1 : 0);
