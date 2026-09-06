/**
 * Headless render profiler: per-view draw calls, active meshes, lights per mesh, shadow casters.
 * Dev servers must be running. PRESET=low|medium|high. Numbers are GPU-independent (SwiftShader here).
 */
import { chromium } from "@playwright/test";
const PRESET = process.env.PRESET || "medium";
const SET = JSON.stringify({ graphics: { preset: PRESET, renderer: "webgl2", renderScale: 1, shadows: PRESET === "low" ? "off" : PRESET === "ultra" ? "high" : "medium", postProcessing: PRESET !== "low", effects: 0.7, antialiasing: PRESET !== "low" } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const p = await ctx.newPage();
await p.goto("http://localhost:5174/");
await p.getByTestId("btn-play").click();
await p.getByTestId("input-name").fill("PROF");
await p.getByTestId("input-room").fill("prof-" + Date.now());
await p.getByTestId("btn-quickplay").click();
await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
const frames = async (n) => { const s = await p.evaluate(() => window.__fb.game.frameCount); await p.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 120000 }); };
await frames(5);
const views = [["street", -6, 0.05, -5, 0.6, 0.02], ["shop", 2, 0.05, 1.2, 0.3, 0.05], ["hall", 0, 0.05, 11, 0.4, 0], ["yard", 2, 0.05, 19.5, 0, 0], ["storage", 12, 0.05, 15, 1.2, -0.1]];
for (const [name, x, y, z, yaw, pitch] of views) {
  await p.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [x, y, z]);
  await p.waitForTimeout(400);
  await p.evaluate(([yaw, pitch]) => { window.__fb.game.localPlayer.yaw = yaw; window.__fb.game.localPlayer.pitch = pitch; }, [yaw, pitch]);
  await frames(3);
  const r = await p.evaluate(() => {
    const g = window.__fb.game; const s = g.currentScene ?? g.scene; const e = s.getEngine();
    const dc0 = e._drawCalls.current; const t0 = performance.now();
    s.render(); const dt = performance.now() - t0; const dc = e._drawCalls.current - dc0;
    const act = s.getActiveMeshes(); let verts = 0, idx = 0; for (let i = 0; i < act.length; i++) { const m = act.data[i]; verts += m.getTotalVertices(); idx += m.getTotalIndices(); }
    const lightsPerMesh = act.data.slice(0, act.length).map((m) => m._lightSources?.length ?? 0);
    const maxL = Math.max(...lightsPerMesh), avgL = lightsPerMesh.reduce((a, b) => a + b, 0) / lightsPerMesh.length;
    const sg = s.lights.flatMap((l) => l.getShadowGenerator?.() ? [l.getShadowGenerator()] : []);
    const casters = sg.map((g) => g.getShadowMap()?.renderList?.length ?? 0);
    const shaders = e._compiledEffects ? Object.keys(e._compiledEffects).length : "n/a";
    return { drawCalls: dc, renderMs: +dt.toFixed(1), activeMeshes: act.length, totalMeshes: s.meshes.length, verts, tris: Math.round(idx / 3), maxLightsPerMesh: maxL, avgLightsPerMesh: +avgL.toFixed(1), shadowCasters: casters, effects: shaders, materials: s.materials.length, particles: s.particleSystems.length, pp: s.postProcesses.length, textures: s.textures.length };
  });
  console.log(PRESET, name, JSON.stringify(r));
}
await b.close();
