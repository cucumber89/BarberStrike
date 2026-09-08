/**
 * Where a remote player's gun actually points.
 *
 * `HAND_POSE` in `CharacterModel.ts` is the one hand-tuned number in the whole import path: the
 * rotation that takes the weapon frame (+Z down the bore) into the wrist bone's frame. Getting it
 * wrong is not subtle — every enemy holds their rifle at the sky — but it is also not visible in a
 * screenshot of a dark alley. So measure it: the angle between the gun's bore and the direction the
 * body faces, and the muzzle's height and offset relative to the player's eye.
 *
 * Ideal: bore within ~20° of facing, muzzle roughly at chest height, about half a metre in front.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
// Relative to THIS tool, not to the shell's cwd: run from the repo root and a bare
// "e2e/out" lands outside the ignored directory and shows up as untracked files.
const OUT = process.env.OUT ? resolve(process.env.OUT) : resolve(dirname(fileURLToPath(import.meta.url)), "../out/weapons");
const WEAPONS = process.env.WEAPONS ? process.env.WEAPONS.split(",") : ["pistol", "revolver", "smg", "smg2", "rifle", "lmg", "shotgun", "dmr", "sniper", "launcher", "clippers"];
const SET = JSON.stringify({ graphics: { preset: "medium", renderer: "webgl2", renderScale: 1, shadows: "off", postProcessing: false, effects: 0.3, antialiasing: false, importedModels: true } });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 800, height: 450 } });
await ctx.addInitScript((v) => localStorage.setItem("fb_settings_v1", v), SET);
const p = await ctx.newPage();
await p.goto("http://localhost:5174/");
await p.getByTestId("btn-play").click();
await p.getByTestId("input-name").fill("HAND");
await p.getByTestId("input-room").fill("hand-" + Date.now());
await p.getByTestId("bots-range").evaluate((el) => { const s = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; s.call(el, "2"); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
await p.getByTestId("btn-quickplay").click();
await p.waitForFunction(() => window.__fb?.game && window.__fb.hud.get().loadStage === "ready", null, { timeout: 90000 });
await p.waitForTimeout(9000);
const results = [];
for (const WEAPON of WEAPONS) {
// Put a gun we have a model for in every bot's hands, and face them all the same way, so the
// numbers below are about the hand pose and not about who happens to be holding what.
await p.evaluate((WEAPON) => {
  for (const r of window.__fb.game.remotes.values()) {
    r.yaw = 0;
    r.character.root.rotation.y = 0;
    r.character.update({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: WEAPON, moveDir: 0 }, 16);
  }
}, WEAPON);
await p.waitForTimeout(1500);
// Settle everyone into the same idle pose before measuring: a bot mid-stride or mid-death has its
// arm somewhere else entirely, and that is the animation working, not the hand pose being wrong.
const rows = await p.evaluate((WEAPON) => {
  const s = window.__fb.game.currentScene ?? window.__fb.game.scene;
  for (let i = 0; i < 90; i++) {
    for (const r of window.__fb.game.remotes.values()) {
      r.yaw = 0; r.character.root.rotation.y = 0;
      r.character.revive();
      r.character.update({ speed: 0, grounded: true, crouch: false, pitch: 0, alive: true, reloading: false, weapon: WEAPON, moveDir: 0 }, 16);
    }
    s.render();
  }
  // Measure NOW, in the same task: a game-loop frame in between would re-pose every bot from its
  // live snapshot (aiming down, sprinting, dying) and the numbers would be about that, not the pose.
  const g = window.__fb.game;
  const am = s.getActiveMeshes();
  const active = new Set(am.data.slice(0, am.length));
  const out = [];
  for (const r of g.remotes.values()) {
    const ch = r.character;
    r.weapon = WEAPON;
    // A skinned CharacterModel exposes its wrist as `handNode`; the procedural Character hangs the
    // gun off `gunHand` under the torso (Character.ts). Measure whichever this build uses.
    const hand = ch.handNode ?? ch.gunHand;
    if (!hand) { out.push({ id: r.id, note: "no hand node" }); continue; }
    hand.computeWorldMatrix(true);
    const gun = hand.getChildren().find((n) => /^tp_/.test(n.name) && n.isEnabled());
    if (!gun) { out.push({ id: r.id.slice(0, 6), weapon: r.weapon, note: `no ENABLED gun (children: ${hand.getChildren().map((n) => n.name).join(",") || "none"})` }); continue; }
    gun.computeWorldMatrix(true);
    const m = gun.getWorldMatrix().m;
    // Third column of the world matrix = the node's +Z in world space.
    const bore = [m[8], m[9], m[10]];
    const len = Math.hypot(...bore);
    const dir = bore.map((v) => v / len);
    // The body faces +Z rotated by yaw; Babylon is left-handed, so facing = (sin yaw, 0, cos yaw).
    const face = [Math.sin(r.yaw), 0, Math.cos(r.yaw)];
    const dot = dir[0] * face[0] + dir[1] * face[1] + dir[2] * face[2];
    const muzzle = gun.getChildren().find((n) => /_muzzle$/.test(n.name)) ?? gun;
    muzzle.computeWorldMatrix(true);
    const mp = muzzle.getAbsolutePosition();
    const root = ch.root.getAbsolutePosition();
    // Forward/side offsets of the muzzle relative to the body, in the body's own frame.
    const dx = mp.x - root.x, dz = mp.z - root.z;
    out.push({
      id: r.id.slice(0, 6),
      weapon: r.weapon,
      alive: r.alive,
      boreVsFacingDeg: +(Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI).toFixed(1),
      borePitchDeg: +(Math.asin(Math.max(-1, Math.min(1, dir[1]))) * 180 / Math.PI).toFixed(1),
      muzzleHeight: +(mp.y - root.y).toFixed(3),
      muzzleForward: +(dx * face[0] + dz * face[2]).toFixed(3),
      muzzleSide: +(dx * face[2] - dz * face[0]).toFixed(3),
      // Is the gun actually DRAWN? A node in the right place that never reaches the render is the
      // failure mode a position check cannot see.
      gunMeshes: gun.getChildMeshes(false).length,
      gunActive: gun.getChildMeshes(false).filter((m) => active.has(m)).length,
      gunSizeCm: (() => {
        const ms = gun.getChildMeshes(false);
        if (!ms.length) return null;
        let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
        for (const m of ms) {
          m.computeWorldMatrix(true);
          const bb = m.getBoundingInfo().boundingBox;
          mn = [Math.min(mn[0], bb.minimumWorld.x), Math.min(mn[1], bb.minimumWorld.y), Math.min(mn[2], bb.minimumWorld.z)];
          mx = [Math.max(mx[0], bb.maximumWorld.x), Math.max(mx[1], bb.maximumWorld.y), Math.max(mx[2], bb.maximumWorld.z)];
        }
        return [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].map((v) => Math.round(v * 100));
      })(),
    });
  }
  return out;
}, WEAPON);
results.push(...rows.map((r) => ({ weapon: WEAPON, ...r })));
}
await b.close();
mkdirSync(OUT, { recursive: true });
writeFileSync(`${OUT}/hand-pose.json`, JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.note || r.boreVsFacingDeg > 5);
console.log(`hand-pose: ${results.length} measurements, ${bad.length} over 5° or missing (acceptance: bore within 5° of facing)`);
for (const r of results) console.log(String(r.weapon).padEnd(9), r.id, r.note ?? `bore ${r.boreVsFacingDeg}° pitch ${r.borePitchDeg}° muzzle h ${r.muzzleHeight} fwd ${r.muzzleForward} side ${r.muzzleSide} meshes ${r.gunMeshes}/${r.gunActive}`);
