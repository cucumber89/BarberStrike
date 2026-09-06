/**
 * Drop 6b verification in a REAL browser: does the running game actually use the imported assets?
 *
 * Unit tests prove the pipeline builds the right thing from the files. This proves the game reaches
 * that pipeline at all — that the manifest is served, the vault loads, the viewmodel swaps its gun
 * and a remote player wears a skinned rig — and reports the draw-call cost of doing so.
 */
import { chromium } from "@playwright/test";

const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "medium", postProcessing: true, effects: 0.7, antialiasing: true, importedModels: true } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1024, height: 576 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const p = await ctx.newPage();
const errors = [];
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errors.push(m.text()); });
p.on("pageerror", (e) => errors.push(`PAGEERROR ${e.message}`));

const room = "assets-" + Date.now();
await p.goto("http://localhost:5174/");
await p.getByTestId("btn-play").click();
await p.getByTestId("input-name").fill("ASSETS");
await p.getByTestId("input-room").fill(room);
// Two bots, so there are remote players wearing the imported rig.
await p.getByTestId("bots-range").evaluate((el) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  set.call(el, "2");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
});
await p.getByTestId("btn-quickplay").click();
await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });

const frames = async (n) => { const s = await p.evaluate(() => window.__fb.game.frameCount); await p.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 120000 }); };
await frames(30);
// The viewmodel upgrade is asynchronous by design; give it a beat.
await p.waitForTimeout(4000);
await frames(30);

const report = await p.evaluate(() => {
  const g = window.__fb.game; const s = g.currentScene ?? g.scene;
  const named = (re) => s.meshes.filter((m) => re.test(m.name)).length;
  const remotes = [...g.remotes.values()];
  const e = s.getEngine();
  const dc0 = e._drawCalls.current; s.render(); const dc = e._drawCalls.current - dc0;
  return {
    importedWeaponSources: named(/^wpn_/),
    viewmodelImported: named(/^vm_(pistol|rifle|smg)_wpn_/),
    thirdPersonImported: named(/^tp_/),
    // Class names only survive in a DEV build; a production bundle mangles them (measured:
    // "FI"). Against `dist`, identify a skinned character by what it owns instead — its animation
    // groups and its hand node.
    charModels: remotes.map((r) => r.character?.constructor?.name),
    remoteCount: remotes.length,
    propBottle: named(/^prop_bottle_row/),
    bottleInstances: s.meshes.filter((m) => /^bottle_/.test(m.name)).length,
    drawCalls: dc,
    activeMeshes: s.getActiveMeshes().length,
    totalMeshes: s.meshes.length,
    materials: s.materials.length,
    textures: s.textures.length,
    animationGroups: s.animationGroups.length,
  };
});
console.log(JSON.stringify(report, null, 2));
const noisy = errors.filter((t) => !/Setting (receiveShadows|renderingGroupId)/.test(t));
console.log("console errors/warnings:", noisy.length);
for (const t of noisy.slice(0, 12)) console.log("  -", t.slice(0, 220));
await p.screenshot({ path: "e2e/out/assets-view.png" });
await b.close();
