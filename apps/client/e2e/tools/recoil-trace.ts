/**
 * recoil-trace — the path the view takes through a burst, old model against the new one.
 *
 * Run:  ./apps/server/node_modules/.bin/tsx apps/client/e2e/tools/recoil-trace.ts \
 *         > apps/client/e2e/out/recoil/trace.md
 *
 * The realistic-recoil change (2026-09-28) keeps every pattern step (so spray, TTK and the Drop B
 * signature are unchanged) and changes only the SHAPE in time: the muzzle rises over `kickMs`
 * instead of teleporting, and the return is a critically damped spring instead of an exponential.
 * This prints, per weapon, a six-shot burst (one shot for the slow guns) sampled at 60 fps: the
 * view pitch in mrad at key instants for both models, plus the numbers a reviewer asks for — the
 * climb at the last shot (must match), the first-frame jump (the teleport that is gone) and the
 * time back to 5 %.
 */
import { WEAPONS, WEAPON_ORDER, fireIntervalMs, recoilStep, type WeaponId } from "@frankibarber/shared";
import { AimRecoil } from "../../src/game/combat/recoilModel";
import { feelOf, signatureOf } from "../../src/game/combat/weaponFeel";

const FRAME = 1000 / 60;

/** The model this replaced, verbatim: instant kick, exponential decay after the hold. */
class OldRecoil {
  pitch = 0;
  private rate = 8;
  private holdUntil = 0;
  kick(up: number, rate: number, holdMs: number, now: number): void { this.pitch -= up; this.rate = rate; this.holdUntil = now + holdMs; }
  step(dt: number, now: number): void { if (now >= this.holdUntil) { this.pitch *= Math.exp(-this.rate * dt); if (Math.abs(this.pitch) < 1e-4) this.pitch = 0; } }
}

function trace(id: WeaponId) {
  const w = WEAPONS[id];
  const shape = feelOf(id).recoil;
  const shots = w.automatic ? 6 : 1;
  const interval = fireIntervalMs(w);
  const oldR = new OldRecoil(), newR = new AimRecoil();
  const rows: { t: number; old: number; now: number }[] = [];
  const out: [number, number] = [0, 0];
  let shot = 0, t = 0, lastShotAt = 0;
  const rnd = () => 0.5; // no jitter: the two models see the same steps
  let firstFrameOld = 0, firstFrameNew = 0;
  let backOld = -1, backNew = -1;
  let peak = 0;
  while (t < 2500) {
    if (shot < shots && t >= shot * interval) {
      const [up] = recoilStep(w, shot, rnd, out);
      oldR.kick(up, w.recoilRecoverPerSec, w.recoilRecoverDelayMs, t);
      newR.kick(up, 0, shape.kickMs, w.recoilRecoverPerSec, w.recoilRecoverDelayMs, t);
      lastShotAt = t; shot++;
    }
    t += FRAME;
    oldR.step(FRAME / 1000, t); newR.step(FRAME / 1000, t);
    if (shot === 1 && t - lastShotAt <= FRAME + 1e-6) { firstFrameOld = -oldR.pitch; firstFrameNew = -newR.pitch; }
    peak = Math.max(peak, -oldR.pitch, -newR.pitch);
    if (shot === shots) {
      if (backOld < 0 && -oldR.pitch < peak * 0.05) backOld = t - lastShotAt;
      if (backNew < 0 && -newR.pitch < peak * 0.05) backNew = t - lastShotAt;
    }
    rows.push({ t, old: -oldR.pitch * 1000, now: -newR.pitch * 1000 });
  }
  const at = (ms: number) => rows.reduce((b, r) => (Math.abs(r.t - ms) < Math.abs(b.t - ms) ? r : b));
  const lastShot = (shots - 1) * interval;
  const climb = at(lastShot + shape.kickMs + FRAME);
  return { id, shots, kickMs: shape.kickMs, firstFrameOld, firstFrameNew, climbOld: climb.old, climbNew: climb.now, backOld, backNew, samples: [0, 16, 33, 50, 100, 200, 400].map((d) => at(lastShot + d)) };
}

const f = (v: number) => v.toFixed(1).padStart(6);
console.log("# Recoil trace — old (teleport + exponential) vs new (rise + critical spring)\n");
console.log("Pitch in mrad (up positive), 60 fps, jitter off. `climb` is sampled just after the last shot's rise; it must match.\n");
console.log("`matrix` is the six-shot climb `docs/WEAPON_MATRIX.md` declares (the sum of the steps, `signatureOf`): the old model leaked");
console.log("recovery between rounds wherever the hold is shorter than the interval, so its bursts fell short of the signed numbers.\n");
console.log("| weapon | shots | kickMs | 1st frame old | 1st frame new | climb old | climb new | matrix | back to 5 % old (ms) | new (ms) |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const all = WEAPON_ORDER.filter((id) => WEAPONS[id].kind !== "melee").map(trace);
for (const r of all) console.log(`| ${r.id} | ${r.shots} | ${r.kickMs} | ${f(r.firstFrameOld * 1000)} | ${f(r.firstFrameNew * 1000)} | ${f(r.climbOld)} | ${f(r.climbNew)} | ${r.shots > 1 ? f(signatureOf(r.id, 0).climb * 1000) : "—"} | ${r.backOld.toFixed(0)} | ${r.backNew.toFixed(0)} |`);
console.log("\n## After the last shot (ms → old / new mrad)\n");
for (const r of all) console.log(`- **${r.id}**: ${r.samples.map((s, i) => `+${[0, 16, 33, 50, 100, 200, 400][i]}: ${s.old.toFixed(1)} / ${s.now.toFixed(1)}`).join(" · ")}`);
