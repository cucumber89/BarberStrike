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
 *   pnpm --filter @frankibarber/client build
 *   PORT=2599 pnpm --filter @frankibarber/server dev       # another shell
 *   HOST_URL=http://localhost:2599 node apps/client/e2e/tools/hostcheck.mjs
 *
 * MEASURED when this was written: page http://localhost:2599, socket ws://localhost:2599, HUD up,
 * zero console errors.
 */
import { chromium } from "@playwright/test";
const URL = process.env.HOST_URL ?? "http://localhost:2599";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 140)));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 140)); });
const sockets = [];
p.on("websocket", (ws) => sockets.push(ws.url()));

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
const ammo = await p.getByTestId("ammo").count().catch(() => 0);
console.log("page origin :", origin);
console.log("websockets  :", JSON.stringify(sockets));
console.log("hud ammo el :", ammo);
console.log("errors      :", errors.length ? JSON.stringify(errors.slice(0, 3)) : "none");
await b.close();
