/**
 * Drop D (L3): the shaved head, measured rather than asserted. Two clients join an Ostrzyżeni room;
 * whoever the room shaved is stood in front of the other and photographed from the front and from
 * the side, alive, with a third shot of an unshaved player from the same camera for comparison.
 *
 *   pnpm --filter @frankibarber/client build
 *   FB_DEV_TOOLS=1 PORT=2601 node apps/server/dist/index.js     # another shell
 *   cd apps/client && HOST_URL=http://localhost:2601 node e2e/tools/shaved-shots.mjs
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
const URL = process.env.HOST_URL ?? "http://localhost:2601";
const OUT = "e2e/out/d/ostrzyzeni";
fs.mkdirSync(OUT, { recursive: true });
const LOW = JSON.stringify({ graphics: { preset: "low", renderer: "webgl2", renderScale: 1, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false, importedModels: false } });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const room = "shaved-" + Date.now();
const pages = [];
for (const name of ["GOLIBRODA", "KLIENT"]) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
  await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), LOW);
  await ctx.addInitScript(() => { localStorage.setItem("fb_mode", "ostrzyzeni"); localStorage.setItem("fb_bots", "0"); });
  const p = await ctx.newPage();
  await p.goto(URL);
  await p.getByTestId("btn-play").click();
  await p.getByTestId("input-name").fill(name);
  await p.getByTestId("input-room").fill(room);
  await p.getByTestId("btn-quickplay").click();
  await p.getByTestId("hud").waitFor({ timeout: 60000 });
  await p.waitForFunction(() => window.__fb?.hud.get().myId !== "", null, { timeout: 60000 });
  // Without a pointer lock the client shows the pause card over the scene.
  await p.evaluate(() => {
    const canvas = document.querySelector("canvas");
    Object.defineProperty(document, "pointerLockElement", { get: () => canvas, configurable: true });
    document.dispatchEvent(new Event("pointerlockchange"));
  });
  await p.waitForFunction(() => window.__fb.game.inputState.pointerLocked);
  pages.push(p);
}
const [a, c] = pages;
await a.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 90000 });
const state = (p, id) => p.evaluate((pid) => {
  const s = window.__fb.game.conn.state.players.get(pid);
  return { x: s.x, y: s.y, z: s.z, shaved: !!s.shaved, name: s.name };
}, id);
const idOf = (p) => p.evaluate(() => window.__fb.hud.get().myId);
const [ia, ic] = [await idOf(a), await idOf(c)];
const sa = await state(a, ia);
// The camera is whoever is NOT shaved; the subject is whoever is.
const [cam, camId, subj, subjId] = sa.shaved ? [c, ic, a, ia] : [a, ia, c, ic];
const tp = (p, x, y, z) => p.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [x, y, z]);
const look = (p, tx, tz, ty) => p.evaluate(([tx, tz, ty]) => {
  const lp = window.__fb.game.localPlayer, b = lp.body;
  lp.yaw = Math.atan2(tx - b.x, tz - b.z);
  lp.pitch = -Math.atan2(ty - (b.y + 1.62), Math.hypot(tx - b.x, tz - b.z));
}, [tx, tz, ty]);
const frames = async (p, n) => { const s = await p.evaluate(() => window.__fb.game.frameCount); await p.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 60000 }); };

async function shot(name, dist, side) {
  const t = await state(cam, subjId);
  await tp(cam, t.x + (side ? dist : 0), t.y, t.z + (side ? 0 : -dist));
  await cam.waitForTimeout(500);
  await look(cam, t.x, t.z, t.y + 1.55);
  await frames(cam, 8);
  await cam.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`${name}: subject=${t.name} shaved=${t.shaved} from ${dist} m ${side ? "side" : "front"}`);
}
await shot("shaved-front", 2.6, false);
await shot("shaved-side", 2.6, true);
// The same camera on an UNSHAVED head: the subject looks at the camera operator instead.
const t2 = await state(subj, camId);
await tp(subj, t2.x, t2.y, t2.z - 2.6);
await subj.waitForTimeout(500);
await look(subj, t2.x, t2.z, t2.y + 1.55);
await frames(subj, 8);
await subj.screenshot({ path: `${OUT}/unshaved-front.png` });
console.log(`unshaved-front: subject=${t2.name} shaved=${(await state(subj, camId)).shaved}`);
await b.close();
