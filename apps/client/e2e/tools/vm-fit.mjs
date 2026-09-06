/**
 * Where the held gun actually sits, in CAMERA space, per weapon.
 *
 * Screenshots of a first-person weapon are hard to compare by eye (lighting, the HUD, whether a bot
 * shot you mid-capture). These numbers are not: x is right of the eye, y is up, z is forward, all in
 * metres, so a gun that has slid off the bottom of the screen or grown by a factor of two says so.
 * Run it with and without `public/models/manifest.json` to compare imported against procedural.
 */
import { chromium } from "@playwright/test";
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: false, effects: 0.7, antialiasing: false, importedModels: true } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const p = await ctx.newPage();
await p.goto("http://localhost:5174/");
await p.getByTestId("btn-play").click();
await p.getByTestId("input-name").fill("VMFIT");
await p.getByTestId("input-room").fill("vmfit-" + Date.now());
await p.getByTestId("btn-quickplay").click();
await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
await p.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
await p.waitForFunction(() => window.__fb.game.inputState.pointerLocked);
await p.waitForTimeout(4000);
const frames = async (n) => { const s = await p.evaluate(() => window.__fb.game.frameCount); await p.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 60000 }); };

const out = [];
// One gun at a time: slot 1 holds whatever you last bought, so buying then pressing 1 is the only
// way to put a specific weapon in the hands. Cycling with X only swaps the last two.
for (const id of ["pistol", "revolver", "smg", "smg2", "rifle", "shotgun", "dmr", "sniper", "launcher"]) {
  if (id === "pistol") await p.keyboard.press("Digit2");
  else {
    await p.evaluate((w) => window.__fb.game.conn.send("buy", { item: w }), id);
    await p.waitForTimeout(500);
    await p.keyboard.press("Digit1");
  }
  await frames(6);
  const r = await p.evaluate(() => {
    const g = window.__fb.game; const s = g.currentScene ?? g.scene;
    const cam = g.localPlayer.camera;
    const vm = s.transformNodes.find((n) => n.name === "viewmodel_gun");
    if (!vm) return null;
    const inv = cam.getWorldMatrix().clone().invert();
    const weapon = window.__fb.hud.get().weapon;
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], count = 0;
    const names = [];
    // Only the gun: the hands and arms hang off the same pivot and would dominate the box.
    for (const m of vm.getChildMeshes(false)) {
      if (!m.isEnabled() || !m.isVisible || !m.name.startsWith(`vm_${weapon}`)) continue;
      m.computeWorldMatrix(true);
      for (const v of m.getBoundingInfo().boundingBox.vectorsWorld) {
        const x = v.x * inv.m[0] + v.y * inv.m[4] + v.z * inv.m[8] + inv.m[12];
        const y = v.x * inv.m[1] + v.y * inv.m[5] + v.z * inv.m[9] + inv.m[13];
        const z = v.x * inv.m[2] + v.y * inv.m[6] + v.z * inv.m[10] + inv.m[14];
        mn = [Math.min(mn[0], x), Math.min(mn[1], y), Math.min(mn[2], z)];
        mx = [Math.max(mx[0], x), Math.max(mx[1], y), Math.max(mx[2], z)];
      }
      names.push(m.name);
      count++;
    }
    const f = (v) => +v.toFixed(3);
    return { weapon, meshes: count, names: names.slice(0, 3), min: mn.map(f), max: mx.map(f), size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map(f) };
  });
  if (r && r.meshes) out.push(r);
}
for (const r of out) console.log(String(r.weapon).padEnd(9), "meshes", String(r.meshes).padStart(2), "min", r.min.join(","), "max", r.max.join(","), "size", r.size.join(","), r.names.join(" "));
await b.close();
