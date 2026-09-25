import { describe, expect, it } from "vitest";
import { GRENADES, WEAPONS, respawnDelayMs } from "@frankibarber/shared";
import type { HudKiller } from "../../game/store";
import { CARD_IN_MS, CARD_OUT_MS } from "../../game/spectate";
import { DEATH_TEXT, barWords, damageLine, deathCard, liveWords, spectateBar, staticWords, type DeathCardInput } from "./deathText";

/**
 * The death card's words (UI_U_SPEC §5.2 rows 32–38, 40; §6.5): what it says, and that it can be
 * read in the time it is up — 3 words a second (Principle 4), live values excluded (§3.10).
 */
const killer = (o: Partial<HudKiller> = {}): HudKiller => ({
  id: "p5", name: "xXPiotrekXx", team: 1, weapon: "smg", headshot: true, assists: [],
  hp: 37, armor: 0, dealt: 64, dealtHits: 3, taken: 100, takenHits: 4, at: 0, ...o,
});
const NOW = 100_000;
const card = (o: Partial<DeathCardInput>) => deathCard({ killer: killer(), respawnAt: 0, now: NOW, clippers: false, standing: "", ...o });
/** Every id that can kill: the guns and the grenades. */
const KILLERS = [...Object.keys(WEAPONS), ...Object.keys(GRENADES)];
const all = (c: ReturnType<typeof deathCard>) => Object.values(c).join(" ");

describe("deathText", () => {
  it("round card static words ≤ 3 × 5.0 s", () => {
    const seconds = (CARD_OUT_MS - CARD_IN_MS) / 1000;
    expect(seconds).toBe(5);
    for (const weapon of KILLERS) {
      // The widest numbers the damage line can carry, and a nick of one word, as nicks are.
      const c = card({ killer: killer({ weapon: weapon as HudKiller["weapon"], dealt: 1_000, dealtHits: 99, taken: 1_000, takenHits: 99 }) });
      expect(c.footer).toBe(DEATH_TEXT.nextRound);
      expect(staticWords(c), weapon).toBeLessThanOrEqual(3 * seconds);
      expect(staticWords(c), weapon).toBe(14); // ZABIŁ CIĘ · nick · K-7 · ZADANE n (h) · OTRZYMANE n (h) · WRACASZ W NASTĘPNEJ RUNDZIE
      expect(staticWords(c) + liveWords(c), `${weapon}: the §5.1 round card budget`).toBeLessThanOrEqual(16);
    }
  });

  it("respawn card static words ≤ 3 × (2.2 − 0.3) s", () => {
    // The shortest wait a card can have: the fade perk's respawn, less the card's own entrance.
    const seconds = (respawnDelayMs("tdm", { fade: true }) - CARD_IN_MS) / 1000;
    expect(seconds).toBeCloseTo(1.9, 9);
    for (const weapon of KILLERS) {
      const c = card({ killer: killer({ weapon: weapon as HudKiller["weapon"] }), respawnAt: NOW + 2_200 });
      expect(c.damage, "no damage line on a 2 s card").toBe("");
      expect(c.live).toBe("ODRODZENIE ZA 3");
      expect(staticWords(c), weapon).toBeLessThanOrEqual(3 * seconds);
      expect(staticWords(c) + liveWords(c), `${weapon}: the §5.1 respawn card budget`).toBeLessThanOrEqual(9);
    }
    // The shaved come back with the clippers, on the same live line's clock.
    expect(card({ respawnAt: NOW + 2_300, clippers: true }).live).toBe("WRACASZ Z MASZYNKĄ ZA 3");
    expect(card({ respawnAt: NOW - 50 }).live, "never below zero").toBe("ODRODZENIE ZA 0");
  });

  it("the damage row reads ZADANE n (h) · OTRZYMANE n (h)", () => {
    expect(damageLine({ dealt: 64, dealtHits: 3, taken: 100, takenHits: 4 })).toBe("ZADANE 64 (3) · OTRZYMANE 100 (4)");
    expect(card({}).damage).toBe("ZADANE 64 (3) · OTRZYMANE 100 (4)");
    expect(damageLine({ dealt: 0, dealtHits: 0, taken: 99.6, takenHits: 1 })).toBe("ZADANE 0 (0) · OTRZYMANE 100 (1)");
    // No arrows (veto): the words say which way the damage went.
    expect(card({}).damage).not.toMatch(/[→←↑↓]/);
  });

  it("tournament waiting never says WYELIMINOWANY", () => {
    for (const standing of ["waiting", "out"] as const) {
      const c = card({ killer: null, standing });
      expect(all(c)).not.toMatch(/WYELIMINOWA/);
      expect(all(c)).not.toMatch(/ZABIŁ|ZGINĄŁ|ODRODZENIE/);
      expect(c.title).toBe(standing === "waiting" ? "CZEKASZ NA SWOJĄ PARĘ" : "ODPADŁEŚ Z TURNIEJU");
      // …and the bar under it watches the pair without promising a next round.
      expect(spectateBar({ target: { id: "b1", name: "ZDZICHU", health: 81 }, lateJoin: true, standing }).footer).toBe("");
    }
    // Nothing on the card or the bar says WYELIMINOWANY in any case: the word is gone from P1.
    for (const c of [card({}), card({ killer: null }), card({ respawnAt: NOW + 1 })]) expect(all(c)).not.toMatch(/WYELIMINOWA/);
  });

  it("self kill reads ZGINĄŁEŚ", () => {
    const c = card({ killer: null, respawnAt: NOW + 2_400 });
    expect(c.eyebrow).toBe("ZGINĄŁEŚ");
    expect(c.nick, "no nick: nobody killed me").toBe("");
    expect(c.weapon).toBe("");
    expect(c.hp).toBe("");
    expect(c.live).toBe("ODRODZENIE ZA 3");
    expect(card({}).eyebrow).toBe("ZABIŁ CIĘ");
  });

  it("late join reads DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE", () => {
    const b = spectateBar({ target: { id: "p1", name: "Kasia_Brzytwa", health: 74 }, lateJoin: true, standing: "" });
    expect(b).toEqual({ watch: "OBSERWUJESZ:", nick: "Kasia_Brzytwa", hp: "74", footer: "DOŁĄCZYSZ W NASTĘPNEJ RUNDZIE" });
    expect(barWords(b), "the §5.1 bar budget").toBeLessThanOrEqual(12);
    // A casualty's bar keeps the card's promise; nobody to watch says so.
    expect(spectateBar({ target: null, lateJoin: false, standing: "" })).toEqual({ watch: "NIKOGO DO OBSERWOWANIA", nick: "", hp: "", footer: "WRACASZ W NASTĘPNEJ RUNDZIE" });
  });
});
