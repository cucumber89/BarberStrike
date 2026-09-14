/**
 * Gameplay-feel cycle, in two real clients sharing one room.
 *
 * Player A (the SUBJECT) is driven through idle → walk → sprint → stop → ADS → fire → reload →
 * weapon switch → grenade → death → respawn. Player B (the OBSERVER) stands in front of A and
 * looks at them, so every step is captured twice: A's first-person view and B's third-person view
 * of A's body. Frame times, draw calls and active meshes are sampled on A's page per step.
 *
 * The frame numbers come from SwiftShader (software GL): they are CPU/scene-cost numbers and say
 * nothing about a real GPU. Use them to compare BEFORE and AFTER on the same machine only.
 *
 * Needs the dev servers (`pnpm dev`, server with FB_DEV_TOOLS=1 for money + teleport).
 *
 *   OUT=e2e/out/feel PRESET=low WEAPON=rifle node e2e/tools/feel-cycle.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = process.env.OUT ? resolve(process.env.OUT) : resolve(dirname(fileURLToPath(import.meta.url)), "../out/feel");
const PRESET = process.env.PRESET || "low";
const WEAPON = process.env.WEAPON || "rifle";
const W = +(process.env.W || 960), H = +(process.env.H || 540);
const SET = JSON.stringify({ graphics: { preset: PRESET, renderer: "webgl2", renderScale: +(process.env.RENDER || 1), shadows: PRESET === "low" ? "off" : "medium", postProcessing: PRESET !== "low", effects: 0.7, antialiasing: false, importedModels: false } });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"] });
const room = `feel-${Date.now()}`;

async function client(name) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`PAGEERROR[${name}]`, e.message));
  await page.goto("http://localhost:5174/");
  await page.getByTestId("btn-play").click();
  await page.getByTestId("input-name").fill(name);
  await page.getByTestId("input-room").fill(room);
  await page.getByTestId("btn-quickplay").click();
  await page.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().myId !== "" && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
  await page.getByRole("button", { name: /ENTER MATCH/i }).click({ timeout: 30000 });
  await page.waitForFunction(() => window.__fb.hud.get().alive === true, null, { timeout: 60000 });
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen());
  await page.evaluate(() => { const c = document.querySelector("canvas"); Object.defineProperty(document, "pointerLockElement", { get: () => c, configurable: true }); document.dispatchEvent(new Event("pointerlockchange")); });
  await page.waitForFunction(() => window.__fb.game.inputState.pointerLocked);
  return page;
}

const A = await client("SUBJ");
const B = await client("OBS");
await A.waitForFunction(() => window.__fb.game.remotes.size > 0, null, { timeout: 30000 });
await B.waitForFunction(() => window.__fb.game.remotes.size > 0, null, { timeout: 30000 });
await A.waitForTimeout(1500);

const frames = async (p, n) => { const s = await p.evaluate(() => window.__fb.game.frameCount); await p.waitForFunction((t) => window.__fb.game.frameCount >= t, s + n, { timeout: 60000 }); };
const hud = (p) => p.evaluate(() => window.__fb.hud.get());
const body = (p) => p.evaluate(() => { const lp = window.__fb.game.localPlayer; return { x: lp.body.x, y: lp.body.y, z: lp.body.z, yaw: lp.yaw }; });
const keys = (p, down, up = []) => p.evaluate(([down, up]) => { const k = window.__fb.game.inputState.keys; for (const c of down) k.add(c); for (const c of up) k.delete(c); }, [down, up]);
const mouse = (p, m) => p.evaluate((m) => { window.__fb.game.inputState.mouseButtons = m; }, m);
const lookAt = (p, tx, tz, ty = 1.4) => p.evaluate(([tx, tz, ty]) => {
  const lp = window.__fb.game.localPlayer; const b = lp.body;
  const dx = tx - b.x, dz = tz - b.z, dy = ty - (b.y + 1.62);
  lp.yaw = Math.atan2(dx, dz); lp.pitch = -Math.atan2(dy, Math.hypot(dx, dz));
}, [tx, tz, ty]);

// Frame sampler on the subject's page: per-frame dt, draw-call delta and active meshes.
await A.evaluate(() => {
  const g = window.__fb.game; const s = g.currentScene ?? g.scene; const e = s.getEngine();
  const S = (window.__feel = { samples: [], draws: [], active: [], on: false, last: e._drawCalls?.current ?? 0 });
  s.onAfterRenderObservable.add(() => {
    if (!S.on || document.hidden) return;
    S.samples.push(e.getDeltaTime());
    const d = e._drawCalls?.current ?? 0; S.draws.push(d - S.last); S.last = d;
    S.active.push(s.getActiveMeshes().length);
  });
});
const sample = (on) => A.evaluate((on) => { const S = window.__feel; S.on = on; if (on) { S.samples.length = 0; S.draws.length = 0; S.active.length = 0; } }, on);
const stats = () => A.evaluate(() => {
  const S = window.__feel; const s = [...S.samples].sort((a, b) => a - b);
  const q = (f) => (s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0);
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  return { frames: s.length, medianMs: +q(0.5).toFixed(1), p95Ms: +q(0.95).toFixed(1), p99Ms: +q(0.99).toFixed(1), over50: s.filter((x) => x > 50).length, drawCalls: Math.round(avg(S.draws)), activeMeshes: Math.round(avg(S.active)) };
});

const report = { preset: PRESET, weapon: WEAPON, viewport: [W, H], renderer: "webgl2/swiftshader", steps: {} };
let stepNo = 0;
/** The observer keeps A in frame: re-aim at A's body before every capture. */
const track = async () => { const a = await body(A); await lookAt(B, a.x, a.z, a.y + 1.2); await frames(B, 1); };
async function shot(label) {
  const n = String(++stepNo).padStart(2, "0");
  await track();
  await Promise.all([A.screenshot({ path: `${OUT}/${n}_${label}_fp.png` }), B.screenshot({ path: `${OUT}/${n}_${label}_tp.png` })]);
  console.log(`shot ${n} ${label}`);
}
async function step(label, fn) {
  await sample(true);
  const t0 = Date.now();
  await fn();
  const st = await stats();
  await sample(false);
  report.steps[label] = { ...st, wallMs: Date.now() - t0 };
  console.log(label, JSON.stringify(report.steps[label]));
}

// ---- stage. The match starts once both are in (Waiting → Countdown → Playing) and the start
// RESPAWNS everyone with the free sidearm in hand, so the staging waits for Playing and re-equips.
await A.waitForFunction(() => window.__fb.hud.get().phase === "playing", null, { timeout: 60000 }).catch(() => console.log("match did not start"));
await A.waitForTimeout(1500);
// The start also resets the wallet, so the buy happens HERE, inside the 30 s post-spawn window.
for (const p of [A, B]) {
  await p.evaluate(() => window.__fb.game.conn.send("dev:money", 9000));
  await p.waitForTimeout(300);
  await p.evaluate((w) => window.__fb.game.buy(w), WEAPON);
  await p.evaluate(() => window.__fb.game.buy("frag"));
  await p.waitForTimeout(600);
  await p.keyboard.press("Digit1");
  await p.waitForFunction((w) => window.__fb.hud.get().weapon === w, WEAPON, { timeout: 8000 }).catch(() => console.log(`subject weapon not equipped after start: ${WEAPON}`));
}
const teams = await Promise.all([A, B].map((p) => p.evaluate(() => { const h = window.__fb.hud.get(); return { team: h.myTeam, mode: h.mode }; })));
console.log("teams", JSON.stringify(teams));
const a0 = await body(A);
const bx = a0.x + Math.sin(a0.yaw) * 2.2, bz = a0.z + Math.cos(a0.yaw) * 2.2;
await B.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [bx, a0.y, bz]);
await B.waitForTimeout(600);
const b0 = await body(B);
console.log("A at", JSON.stringify(a0), "B at", JSON.stringify(b0), "dist", Math.hypot(a0.x - b0.x, a0.z - b0.z).toFixed(2));
await lookAt(B, a0.x, a0.z, a0.y + 1.3);
await lookAt(A, b0.x, b0.z, b0.y + 1.3);
await A.waitForTimeout(1500);
console.log("hud A", JSON.stringify(await hud(A).then((h) => ({ weapon: h.weapon, ammo: h.ammo, lethal: h.lethal, lethalCount: h.lethalCount, owned: h.owned, phase: h.phase }))));

const across = () => A.evaluate(([bx, bz]) => { const lp = window.__fb.game.localPlayer; const b = lp.body; lp.yaw = Math.atan2(bx - b.x, bz - b.z) + Math.PI / 2; lp.pitch = 0; }, [b0.x, b0.z]);
// A close look at the body first: A squares up to B (the hold, the hands on the gun, the face).
await step("face", async () => { await A.waitForTimeout(800); await frames(A, 3); await shot("face"); });
await across();
await step("idle", async () => { await A.waitForTimeout(1500); await frames(A, 4); await shot("idle"); });
await step("walk", async () => { await keys(A, ["KeyW"]); await A.waitForTimeout(1200); await frames(A, 3); await shot("walk"); await A.waitForTimeout(600); });
await step("sprint", async () => { await keys(A, ["ShiftLeft"]); await A.waitForTimeout(1200); await frames(A, 3); await shot("sprint"); await A.waitForTimeout(400); });
await step("stop", async () => { await keys(A, [], ["KeyW", "ShiftLeft"]); await A.waitForTimeout(250); await frames(A, 2); await shot("stop_early"); await A.waitForTimeout(700); await shot("stop_settled"); });
// The walk took A down the street: bring A back in front of B for the close-up steps.
await A.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [a0.x, a0.y, a0.z]);
await A.waitForTimeout(700);
await lookAt(A, b0.x, b0.z, b0.y + 1.3);
await A.evaluate(() => { window.__fb.game.localPlayer.yaw += 0.6; });   // 35° off B: the burst must not kill the observer
await A.waitForTimeout(400);
await step("ads", async () => { await mouse(A, 4); await A.waitForTimeout(700); await frames(A, 3); await shot("ads"); await mouse(A, 0); await A.waitForTimeout(600); });
await step("fire", async () => {
  await mouse(A, 1); await frames(A, 2); await shot("fire"); await A.waitForTimeout(300); await mouse(A, 0);
  await A.waitForTimeout(400);
});
await step("reload", async () => {
  await A.evaluate(() => { window.__fb.game.inputState.reloadRequested = true; });
  const started = await A.waitForFunction(() => window.__fb.hud.get().reloading, null, { timeout: 4000 }).then(() => true).catch(() => false);
  if (!started) console.log("reload did not start");
  const ms = await A.evaluate((w) => window.__fb.shared.WEAPONS[w].reloadMs, WEAPON);
  await A.waitForTimeout(ms * 0.2); await shot("reload_20");
  await A.waitForTimeout(ms * 0.25); await shot("reload_45");
  await A.waitForTimeout(ms * 0.4); await shot("reload_85");
  await A.waitForFunction(() => !window.__fb.hud.get().reloading, null, { timeout: 8000 }).catch(() => {});
  await A.waitForTimeout(800);
});
await step("switch", async () => {
  await A.keyboard.press("Digit2"); await A.waitForTimeout(150); await frames(A, 2); await shot("switch_pistol_early");
  await A.waitForTimeout(700); await shot("switch_pistol");
  await A.keyboard.press("Digit1"); await A.waitForTimeout(900); await frames(A, 2); await shot("switch_back");
});
await step("grenade", async () => {
  await A.evaluate(() => { window.__fb.game.inputState.lethalHeld = true; });
  await A.waitForTimeout(500); await frames(A, 2); await shot("grenade_held");
  await A.evaluate(() => { window.__fb.game.inputState.lethalHeld = false; window.__fb.game.inputState.lethalReleased = true; });
  await A.waitForTimeout(120); await shot("grenade_throw");
  await A.waitForTimeout(700); await shot("grenade_recover");
  await A.waitForTimeout(3500);
});
await step("death", async () => {
  // B shoots A until A is down: put B back in front of A first (A has walked), aim at the chest.
  const a1 = await body(A);
  await B.evaluate(([x, y, z]) => window.__fb.game.conn.send("dev:teleport", { x, y, z }), [a1.x + Math.sin(a1.yaw) * 2.2, a1.y, a1.z + Math.cos(a1.yaw) * 2.2]);
  await B.waitForTimeout(600);
  await lookAt(B, a1.x, a1.z, a1.y + 1.3);
  await B.waitForTimeout(200);
  // A held button fires an automatic weapon; a semi-automatic one needs the trigger pulsed.
  const auto = await B.evaluate((w) => window.__fb.shared.WEAPONS[w].automatic, WEAPON);
  let pulsing = true;
  const pulse = (async () => { while (pulsing) { await mouse(B, 1); await B.waitForTimeout(auto ? 400 : 60); await mouse(B, 0); await B.waitForTimeout(auto ? 50 : 160); } })();
  const dead = await A.waitForFunction(() => !window.__fb.hud.get().alive, null, { timeout: 20000 }).then(() => true).catch(() => false);
  pulsing = false; await pulse; await mouse(B, 0);
  if (!dead) console.log("subject did not die");
  await A.waitForTimeout(150); await shot("death_early");
  await A.waitForTimeout(600); await shot("death_settled");
});
await step("respawn", async () => {
  await A.waitForFunction(() => window.__fb.hud.get().alive, null, { timeout: 15000 }).catch(() => console.log("no respawn"));
  await A.waitForTimeout(200); await frames(A, 2); await shot("respawn_early");
  await A.waitForTimeout(1200); await shot("respawn");
});

report.hudA = await hud(A).then((h) => ({ weapon: h.weapon, ammo: h.ammo, health: h.health, phase: h.phase }));
writeFileSync(`${OUT}/feel-cycle.json`, JSON.stringify(report, null, 2));
console.log(`feel-cycle: ${stepNo} shots under ${OUT}`);
await browser.close();
