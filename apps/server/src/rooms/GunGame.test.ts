/**
 * Drop D — Gun Game in the room. The ladder rules themselves are tested in shared (`modes.ts`);
 * here it is the room's side: the loadout is the rung, a kill re-arms the killer on the spot, the
 * victim's setback shows at their respawn, nothing is for sale, respawn is the mode's own timer,
 * and only the last rung's kill ends the match.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { C2S, GUN_GAME, MODES, MatchPhase, RESPAWN_DELAY_MS, S2C, WEAPONS, ladderWeapon } from "@frankibarber/shared";
import type { PlayerState } from "../schema";
import { RoomHarness, type FakeClient } from "./testHarness";

let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

type Damage = { applyDamage(attacker: PlayerState, victimId: string, amount: number, headshot: boolean, client: undefined, weapon: string): void };
type LadderSession = { rung: number; respawnAt: number };

async function match(): Promise<{ a: FakeClient; b: FakeClient }> {
  h = await RoomHarness.create({ room: "gungame-test", mode: "gungame", bots: 0 });
  const a = await h.join("Alpha"), b = await h.join("Bravo");
  await h.until(MatchPhase.Playing);
  return { a, b };
}
/** A kill made with `weapon`, straight into the damage path (spawn protection is lifted first). */
function killWith(killer: FakeClient, victim: FakeClient, weapon: string): void {
  h.player(victim.sessionId).protectedUntil = 0;
  (h.room as unknown as Damage).applyDamage(h.player(killer.sessionId), victim.sessionId, 999, false, undefined, weapon);
}
const session = (c: FakeClient): LadderSession => h.session(c.sessionId) as unknown as LadderSession;

it("(a) everyone starts on the first rung: the pistol alone, no money, score 0", async () => {
  const { a, b } = await match();
  for (const c of [a, b]) {
    const p = h.player(c.sessionId);
    expect(p.alive).toBe(true);
    expect(p.weapon).toBe("pistol");
    expect([...p.owned]).toEqual(["pistol"]);
    expect(p.score).toBe(0);
    expect(p.money).toBe(0);
    expect(p.ammo).toBe(WEAPONS.pistol.magazine);
    expect(p.lethalCount + p.tacticalCount + p.armor).toBe(0);
  }
  expect(MODES.gungame.shop).toBe("none");
});

it("(b) a rung-weapon kill hands the killer the next gun immediately, full, and moves their score; the victim is unchanged", async () => {
  const { a, b } = await match();
  killWith(a, b, "pistol");
  const k = h.player(a.sessionId), v = h.player(b.sessionId);
  expect(k.weapon).toBe("revolver");
  expect([...k.owned]).toEqual(["revolver"]);
  expect(k.ammo).toBe(WEAPONS.revolver.magazine);
  expect(k.reserve).toBe(WEAPONS.revolver.reserve);
  expect(k.score).toBe(1);
  expect(k.kills).toBe(1);
  expect(k.money, "no kill reward on the ladder").toBe(0);
  expect(session(a).rung).toBe(1);
  expect(v.alive).toBe(false);
  expect(v.score).toBe(0);
  expect(session(b).rung).toBe(0);
  // The client will see the change as a server weapon change; the equip happened here.
  await h.advance(WEAPONS.revolver.equipMs + 50);
  expect(h.player(a.sessionId).weapon).toBe("revolver");
});

it("(c) a clippers kill from a higher rung shaves one rung off the victim and leaves the killer where they are", async () => {
  const { a, b } = await match();
  session(a).rung = 3; h.player(a.sessionId).score = 3;
  session(b).rung = 2; h.player(b.sessionId).score = 2;
  killWith(a, b, "clippers");
  expect(session(a).rung).toBe(3);
  expect(h.player(a.sessionId).score).toBe(3);
  expect(session(b).rung).toBe(1);
  expect(h.player(b.sessionId).score).toBe(1);
  await h.respawns();
  const v = h.player(b.sessionId);
  expect(v.alive).toBe(true);
  expect(v.weapon).toBe(ladderWeapon(1));
  expect([...v.owned]).toEqual([ladderWeapon(1)]);
  expect(v.ammo).toBe(WEAPONS[ladderWeapon(1)].magazine);
});

it("(d) buying is refused outright, money or not", async () => {
  const { a } = await match();
  const p = h.player(a.sessionId);
  p.money = 9000;
  h.send(a, C2S.Buy, { item: "rifle" });
  const shop = h.sentOf(a, S2C.Shop).at(-1)?.payload as { ok: boolean; reason?: string };
  expect(shop.ok).toBe(false);
  expect(shop.reason).toBe("no-shop");
  expect([...p.owned]).toEqual(["pistol"]);
  expect(p.weapon).toBe("pistol");
  h.send(a, C2S.Buy, { item: "fade" });
  expect(p.perks.get("fade") ?? 0).toBe(0);
});

it("(e) a casualty is back after the mode's own 3 s, not the standard delay", async () => {
  const { a, b } = await match();
  expect(GUN_GAME.respawnMs).not.toBe(RESPAWN_DELAY_MS);
  killWith(a, b, "pistol");
  const at = h.now();
  expect(session(b).respawnAt - at).toBe(GUN_GAME.respawnMs);
  await h.advance(GUN_GAME.respawnMs - 100);
  expect(h.player(b.sessionId).alive).toBe(false);
  await h.advance(100 + 50);
  expect(h.player(b.sessionId).alive).toBe(true);
});

it("(f) eleven kills, each with the rung weapon, finish the ladder: the killer wins and the match ends", async () => {
  const { a, b } = await match();
  for (let rung = 0; rung < GUN_GAME.ladder.length; rung++) {
    expect(h.state.phase).toBe(MatchPhase.Playing);
    expect(h.player(a.sessionId).weapon).toBe(ladderWeapon(rung));
    killWith(a, b, ladderWeapon(rung));
    if (rung < GUN_GAME.ladder.length - 1) await h.respawns();
  }
  expect(h.state.phase).toBe(MatchPhase.Ended);
  expect(h.state.winnerId).toBe(a.sessionId);
  expect(h.state.winnerName).toBe("Alpha");
  expect(h.state.winner).toBe(-1);
  expect(h.player(a.sessionId).score).toBe(GUN_GAME.ladder.length);
  const ended = h.broadcastsOf(S2C.MatchEvent).at(-1)?.payload as { phase: MatchPhase; winnerId: string };
  expect(ended.phase).toBe(MatchPhase.Ended);
  expect(ended.winnerId).toBe(a.sessionId);
});

it("(f') eleven kills with the wrong weapon move nobody and do not end the match on the kill count", async () => {
  const { a, b } = await match();
  for (let i = 0; i < MODES.gungame.scoreLimit; i++) {
    killWith(a, b, "rifle"); // a rung-5 gun in the hands of a rung-0 player
    await h.respawns();
  }
  expect(h.player(a.sessionId).kills).toBe(MODES.gungame.scoreLimit);
  expect(h.player(a.sessionId).score).toBe(0);
  expect(session(a).rung).toBe(0);
  expect(h.player(a.sessionId).weapon).toBe("pistol");
  expect(h.state.phase).toBe(MatchPhase.Playing);
  expect(h.state.winnerId).toBe("");
});
