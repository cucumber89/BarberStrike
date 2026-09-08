/**
 * Where the held gun actually sits, in CAMERA space, per weapon — and where its sights land on
 * screen in ADS.
 *
 * Screenshots of a first-person weapon are hard to compare by eye (lighting, the HUD, whether a bot
 * shot you mid-capture). These numbers are not: x is right of the eye, y is up, z is forward, all in
 * metres, so a gun that has slid off the bottom of the screen or grown by a factor of two says so.
 * The ADS pass projects the weapon's aim node (`vm_<id>_aim`, the point the solver puts on the
 * camera axis) into the viewport and reports its offset from the centre in pixels: the plan's
 * acceptance is ±1 px for every weapon (docs/PLAN_2_1.md, Drop A).
 *
 * Needs the dev servers (`pnpm dev`, server with FB_DEV_TOOLS=1 for the wallet). Output goes to
 * e2e/out/weapons/vm-fit.json and vm-fit.md; only the table is printed.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const OUT = process.env.OUT ?? "e2e/out/weapons";
const W = 960, H = 540;
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: false, effects: 0.7, antialiasing: false, importedModels: true } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
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
// Stand still, look level: the measurement is about the pose, not the sway or a wall push.
await p.evaluate(() => { const lp = window.__fb.game.localPlayer; lp.pitch = 0; });

const measure = () => p.evaluate(([W, H]) => {
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
  // Anchors: the nodes the model hangs off the gun root, in camera space, plus the aim node on screen.
  const camSpace = (n) => {
    n.computeWorldMatrix(true);
    const v = n.getAbsolutePosition();
    return [v.x * inv.m[0] + v.y * inv.m[4] + v.z * inv.m[8] + inv.m[12], v.x * inv.m[1] + v.y * inv.m[5] + v.z * inv.m[9] + inv.m[13], v.x * inv.m[2] + v.y * inv.m[6] + v.z * inv.m[10] + inv.m[14]];
  };
  const node = (suffix) => vm.getDescendants(false).find((n) => n.name === `vm_${weapon}_${suffix}`);
  const aimN = node("aim"), muzN = node("muzzle");
  let aimPx = null;
  if (aimN) {
    // Project through the camera's own matrices; +y up in camera space becomes −y on screen.
    const V = aimN.position.constructor, M = cam.getWorldMatrix().constructor;
    const pos = aimN.getAbsolutePosition();
    const pr = V.Project(pos, M.Identity(), s.getTransformMatrix(), cam.viewport.toGlobal(W, H));
    aimPx = [+(pr.x - W / 2).toFixed(2), +(pr.y - H / 2).toFixed(2)];
  }
  // Near-plane cut: vertices of the gun that are inside the view frustum but closer than the
  // camera's near plane (0.05 m). Every triangle they belong to is sliced open on screen — the
  // shotgun's pump was. The merged per-material meshes' boxes cannot tell this, so it walks the
  // vertices (a few hundred per gun).
  let nearCut = 0, nearest = Infinity;
  const tanV = Math.tan(cam.fov / 2), tanH = tanV * (W / H);
  for (const m of vm.getChildMeshes(false)) {
    if (!m.isEnabled() || !m.isVisible || !m.name.startsWith(`vm_${weapon}`)) continue;
    const pos = m.getVerticesData("position"); if (!pos) continue;
    const wm = m.getWorldMatrix().m;
    for (let i = 0; i < pos.length; i += 3) {
      const px = pos[i], py = pos[i + 1], pz = pos[i + 2];
      const wx = px * wm[0] + py * wm[4] + pz * wm[8] + wm[12], wy = px * wm[1] + py * wm[5] + pz * wm[9] + wm[13], wz = px * wm[2] + py * wm[6] + pz * wm[10] + wm[14];
      const cz = wx * inv.m[2] + wy * inv.m[6] + wz * inv.m[10] + inv.m[14];
      if (cz <= 0) continue;
      const cx = wx * inv.m[0] + wy * inv.m[4] + wz * inv.m[8] + inv.m[12], cy = wx * inv.m[1] + wy * inv.m[5] + wz * inv.m[9] + inv.m[13];
      if (Math.abs(cx) > cz * tanH * 1.05 || Math.abs(cy) > cz * tanV * 1.05) continue;
      nearest = Math.min(nearest, cz);
      if (cz < cam.minZ) nearCut++;
    }
  }
  const f = (v) => +v.toFixed(3);
  return {
    weapon, meshes: count, names: names.slice(0, 3), nearCut, nearestZ: Number.isFinite(nearest) ? f(nearest) : null,
    min: mn.map(f), max: mx.map(f), size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map(f),
    aim: aimN ? camSpace(aimN).map(f) : null, muzzle: muzN ? camSpace(muzN).map(f) : null,
    aimPx, fov: +cam.fov.toFixed(4), aimBlend: +(g.localPlayer.aimBlend ?? -1).toFixed(3),
  };
}, [W, H]);

const ads = (on) => p.evaluate((on) => { window.__fb.game.inputState.mouseButtons = on ? 4 : 0; }, on);
const out = [];
const WEAPONS = process.env.WEAPONS ? process.env.WEAPONS.split(",") : ["pistol", "revolver", "smg", "smg2", "rifle", "lmg", "shotgun", "dmr", "sniper", "launcher", "clippers"];
for (const id of WEAPONS) {
  // Slot 1 holds whatever you last bought; the pistol and the clippers have their own keys.
  if (id === "pistol") await p.keyboard.press("Digit2");
  else if (id === "clippers") await p.keyboard.press("Digit3");
  else {
    await p.evaluate(() => window.__fb.game.conn.send("dev:money", 9000));
    await p.waitForTimeout(300);
    await p.evaluate((w) => window.__fb.game.buy(w), id);
    await p.waitForFunction((w) => window.__fb.hud.get().weapon === w, id, { timeout: 8000 }).catch(() => {});
    await p.keyboard.press("Digit1");
  }
  await p.waitForTimeout(900);
  await frames(8);
  const hip = await measure();
  if (!hip || hip.weapon !== id) { out.push({ weapon: id, error: `not equipped (hud shows ${hip?.weapon})` }); continue; }
  await ads(true);
  // SwiftShader runs at ~10 fps: the ADS blend needs a handful of frames to settle.
  await p.waitForTimeout(id === "sniper" ? 2500 : 1500);
  await frames(10);
  const adsR = await measure();
  // The viewmodel breathes (±2.5 mm at 1.4 rad/s, halved in ADS), which alone is ±1.3 px at this
  // viewport. So the alignment claim is the MEAN over two breaths (9 s); the peak is reported too.
  // Two, not one: under CPU contention SwiftShader drops to 2–4 fps, and a single period sampled
  // 15 times reads 0.5–0.9 px of pure breath where an idle run reads 0.1.
  const samples = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 9200) { await frames(1); const m = await measure(); if (m?.aimPx) samples.push(m.aimPx); }
  if (samples.length) {
    const mean = [samples.reduce((a, s) => a + s[0], 0) / samples.length, samples.reduce((a, s) => a + s[1], 0) / samples.length].map((v) => +v.toFixed(2));
    const peak = +Math.max(...samples.map((s) => Math.hypot(s[0], s[1]))).toFixed(2);
    adsR.aimPxMean = mean; adsR.aimPxPeak = peak; adsR.samples = samples.length;
  }
  await ads(false);
  await p.waitForTimeout(600);
  out.push({ weapon: id, hip, ads: adsR });
}
await b.close();

mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/vm-fit.json`, JSON.stringify(out, null, 1));
const rows = [];
rows.push("| weapon | meshes | hip box min (x,y,z) | hip box max | hip size | hip muzzle | ADS box min | ADS box max | near-plane cut verts hip / ADS (nearest z) | ADS aim px mean (dx,dy) | ADS aim px peak | samples | ADS fov |");
rows.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of out) {
  if (r.error) { rows.push(`| ${r.weapon} | — | ${r.error} | | | | | | |`); continue; }
  const h = r.hip, a = r.ads;
  rows.push(`| ${r.weapon} | ${h.meshes} | ${h.min.join(", ")} | ${h.max.join(", ")} | ${h.size.join(", ")} | ${h.muzzle?.join(", ") ?? "—"} | ${a?.min.join(", ") ?? "—"} | ${a?.max.join(", ") ?? "—"} | ${h.nearCut} (${h.nearestZ ?? "—"}) / ${a?.nearCut ?? "—"} (${a?.nearestZ ?? "—"}) | ${a?.aimPxMean ? a.aimPxMean.join(", ") : "—"} | ${a?.aimPxPeak ?? "—"} | ${a?.samples ?? 0} | ${a?.fov ?? "—"} |`);
}
const worst = Math.max(...out.filter((r) => r.ads?.aimPxMean).map((r) => Math.hypot(...r.ads.aimPxMean)));
const peak = Math.max(...out.filter((r) => r.ads?.aimPxPeak).map((r) => r.ads.aimPxPeak));
const cut = out.filter((r) => !r.error && (r.hip.nearCut > 0 || r.ads?.nearCut > 0)).map((r) => `${r.weapon}[hip ${r.hip.nearCut} ads ${r.ads?.nearCut ?? 0}]`);
const summary = `vm-fit: ${out.filter((r) => !r.error).length}/${out.length} measured; worst mean ADS aim offset ${Number.isFinite(worst) ? worst.toFixed(2) : "?"} px over two breaths (acceptance ±1 px), worst instantaneous ${Number.isFinite(peak) ? peak.toFixed(2) : "?"} px; near-plane cuts: ${cut.length ? cut.join(" ") : "none"}`;
writeFileSync(`${OUT}/vm-fit.md`, [`# vm-fit — ${new Date().toISOString()}`, "", summary, "", `Viewport ${W}×${H}, camera space: +x right, +y up, +z forward, metres.`, "", ...rows].join("\n"));
console.log(summary);
for (const r of rows) console.log(r);
