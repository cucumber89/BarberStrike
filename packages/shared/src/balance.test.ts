import { describe, expect, it } from "vitest";
import { HEADSHOT_MULTIPLIER, PLAYER } from "./constants";
import { ARMOR, ARMOR_ABSORB } from "./perks";
import { PRIMARY_ORDER, SECONDARY_ORDER, WEAPONS, damageAtDistance, fireIntervalMs, type WeaponDef } from "./weapons";

/**
 * Weapon balance, as arithmetic rather than opinion.
 *
 * Reported as "I don't know whether the weapons do too much damage". The overall level turned out
 * to be inside genre norms; three specific numbers were not, and each was a mistake of a kind you
 * cannot see by reading the table — you have to work out what the number MEANS at the health pool:
 *
 *  - A SHOTGUN THAT COULD NOT MISS. 9 pellets x 12 = 108 against 100 health, so a point-blank body
 *    hit was a guaranteed kill with nothing asked of the shooter and nothing the victim could do.
 *  - TWO SLIVERS. The sniper did 95 to the body and the DMR 99.2 to the head. Both leave the victim
 *    alive on a handful of health after a hit the shooter played perfectly, and both then demand a
 *    slow follow-up (1.3 s for the sniper). That is the worst of the two conventions: it neither
 *    rewards the shot nor honestly denies it.
 *  - A SIDEARM WITH A PRIMARY'S REACH. The revolver kept 34 damage out to 55 m, which is a two-shot
 *    kill at a range where the DMR — a 2 900 primary — is meant to live.
 */

const HP = PLAYER.maxHealth ?? 100;
/** A hit landing in this band is an accident: perfect play, victim survives, shooter punished. */
const SLIVER_LO = HP * 0.95;

/** Shots to kill, and the time between the first and the last. */
function ttk(w: WeaponDef, perShot: number): { shots: number; ms: number } {
  const shots = Math.max(1, Math.ceil(HP / perShot));
  return { shots, ms: Math.round((shots - 1) * fireIntervalMs(w)) };
}

const body = (w: WeaponDef, dist = 0): number => damageAtDistance(w, dist) * w.pellets;
const head = (w: WeaponDef, dist = 0): number => damageAtDistance(w, dist) * HEADSHOT_MULTIPLIER;

describe("weapon balance", () => {
  it("prints the time-to-kill table it is asserting on", () => {
    const rows = [...SECONDARY_ORDER, ...PRIMARY_ORDER, "clippers" as const]
      .map((id) => WEAPONS[id])
      .filter((w) => w.kind !== "launcher")
      .map((w) => {
        const b = ttk(w, body(w)), h = ttk(w, head(w));
        const far = ttk(w, body(w, w.rangeMax));
        // Heavy plate absorbs half of every hit until its 100 points are gone.
        let hp = HP, armour = ARMOR.heavy.armor, shots = 0;
        while (hp > 0 && shots < 40) {
          const dmg = Math.round(body(w));
          const absorbed = Math.min(armour, Math.round(dmg * ARMOR_ABSORB));
          armour -= absorbed; hp -= dmg - absorbed; shots++;
        }
        return `${w.id.padEnd(9)} ${String(Math.round(body(w))).padStart(3)} dmg  body ${b.shots}/${String(b.ms).padStart(4)} ms   head ${h.shots}/${String(h.ms).padStart(4)} ms   at ${w.rangeMax} m ${far.shots}   vs heavy plate ${shots}/${Math.round((shots - 1) * fireIntervalMs(w))} ms`;
      });
    console.log("\n" + rows.join("\n"));
    expect(rows.length).toBeGreaterThan(8);
  });

  it("leaves nobody alive on a sliver after a perfect hit", () => {
    // Either a hit kills outright or it clearly does not. Anything in [95, 100) is an accident.
    for (const id of [...SECONDARY_ORDER, ...PRIMARY_ORDER]) {
      const w = WEAPONS[id];
      if (w.kind === "launcher") continue;
      for (const [what, dmg] of [["body", body(w)], ["head", head(w)], ["body at range", body(w, w.rangeMax)], ["head at range", head(w, w.rangeMax)]] as const) {
        expect(`${w.id} ${what} ${dmg.toFixed(1)}`,
          `${w.id}: ${what} does ${dmg.toFixed(1)} against ${HP} health — a sliver`)
          .toBe(dmg >= SLIVER_LO && dmg < HP ? "" : `${w.id} ${what} ${dmg.toFixed(1)}`);
      }
    }
  });

  it("asks something of a shotgun's shooter: a body-only hit does not kill, an aimed one does", () => {
    // Every pellet in the torso must leave the victim alive — otherwise the weapon cannot miss. But
    // the one-shot has to stay REACHABLE, or the weapon is only a slow two-tap: a minority of the
    // pellets landing on the head must close it. At 10 a pellet that is two of nine (102).
    for (const w of Object.values(WEAPONS)) {
      if (w.pellets <= 1) continue;
      const per = damageAtDistance(w, 0);
      const withHeads = (n: number) => per * (w.pellets - n) + per * HEADSHOT_MULTIPLIER * n;
      expect(withHeads(0), `${w.id}: ${body(w)} from one point-blank body hit against ${HP} health`).toBeLessThan(HP);
      const needed = [...Array(w.pellets + 1).keys()].find((n) => withHeads(n) >= HP);
      expect(needed, `${w.id}: no number of head pellets reaches ${HP}`).toBeDefined();
      expect(needed!, `${w.id}: needs ${needed} of ${w.pellets} pellets on the head to kill`).toBeLessThanOrEqual(w.pellets / 3);
    }
  });

  it("keeps a 600-credit sidearm out of a marksman rifle's job", () => {
    // The revolver matched the DMR's 400 ms body kill for a fifth of the price. The answer is not
    // to make the revolver worse — it is a slow six-shooter with a 2.3 s reload and it has earned
    // that punch — but to give the expensive rifle the shot that defines it. Every marksman primary
    // must need FEWER head shots than any sidearm.
    const sidearm = Math.min(...SECONDARY_ORDER.map((id) => ttk(WEAPONS[id], head(WEAPONS[id])).shots));
    for (const id of ["dmr", "sniper"] as const) {
      expect(ttk(WEAPONS[id], head(WEAPONS[id])).shots, `${id} head shots vs the best sidearm's ${sidearm}`)
        .toBeLessThan(sidearm);
    }
  });

  it("gives a scope one rule: the head is a kill at any range, the body never is", () => {
    for (const w of Object.values(WEAPONS)) {
      if (!w.scoped) continue;
      expect(head(w, w.rangeMax), `${w.id} head at ${w.rangeMax} m`).toBeGreaterThanOrEqual(HP);
      expect(body(w), `${w.id} body point blank`).toBeLessThan(HP);
    }
  });

  it("keeps every unscoped primary's kill time inside the band the genre plays at", () => {
    // A bolt-action is exempt on purpose: its long body kill IS the weapon, and the rule above is
    // what holds it honest. Everything else lives between a fast rifle and a slow pump.
    for (const id of PRIMARY_ORDER) {
      const w = WEAPONS[id];
      if (w.kind === "launcher" || w.scoped) continue;
      const { ms } = ttk(w, body(w));
      expect(ms, `${w.id} body TTK`).toBeGreaterThan(0); // nothing is a free instant kill
      expect(ms, `${w.id} body TTK`).toBeLessThanOrEqual(900);
    }
  });
});
