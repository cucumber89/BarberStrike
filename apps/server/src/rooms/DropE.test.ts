import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  C2S, S2C, DEFAULT_HAIRCUT, MATCH, MELEE, SPAWN_PROTECTION_MS, WEAPONS,
  encodeHaircut, haircutLook, parseHaircut, worstHaircut,
  type KillEvent,
} from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * Drop E — the shave, on the server, where it is decided.
 *
 * The rule itself is unit-tested in `shared/haircuts.test.ts`; what is tested HERE is that the room
 * reaches it with the right facts, writes the one field, keeps it across the respawn, and clears it
 * when the match does.
 */

let h: RoomHarness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await RoomHarness.create({ room: "dropE" });
});

afterEach(async () => {
  await h.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function duel(): Promise<{ a: FakeClient; b: FakeClient }> {
  const a = await h.join("Alpha");
  const b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  await h.settle();
  return { a, b };
}

/** Puts Alpha behind (or in front of) Bravo with the clippers out, and swings. */
async function clip(a: FakeClient, b: FakeClient, from: "behind" | "front", seq: number): Promise<void> {
  h.send(a, C2S.Equip, 3);
  await h.advance(WEAPONS.clippers.equipMs + 50);
  const v = h.session(b.sessionId), s = h.session(a.sessionId);
  const fx = Math.sin(v.lastYaw), fz = Math.cos(v.lastYaw);
  const sign = from === "behind" ? -1 : 1;
  await h.place(a.sessionId, {
    x: v.body.x + sign * fx * 1.4, y: v.body.y, z: v.body.z + sign * fz * 1.4,
    yaw: from === "behind" ? v.lastYaw : v.lastYaw + Math.PI, team: 0,
  });
  const o: [number, number, number] = [s.body.x, s.body.y + 1.62, s.body.z];
  h.send(a, C2S.Fire, { seq, weapon: "clippers", o, d: [sign * -fx, -0.1, sign * -fz], t: h.now() });
  await h.tick();
}

const lastKill = (): KillEvent => h.broadcastsOf(S2C.Kill).at(-1)?.payload as KillEvent;

describe("a clippers backstab is a shave", () => {
  it("marks the victim's head, flags the kill feed, and survives their respawn", async () => {
    const { a, b } = await duel();
    expect(parseHaircut(h.player(b.sessionId).haircut).shaves).toBe(0);

    await clip(a, b, "behind", 1);
    expect(h.player(b.sessionId).alive).toBe(false);
    expect(lastKill()).toMatchObject({ weapon: "clippers", shave: true, victim: b.sessionId });
    // The one field: the victim's head, written once, on the death.
    expect(parseHaircut(h.player(b.sessionId).haircut).shaves).toBe(1);
    expect(haircutLook(h.player(b.sessionId).haircut).style.track).toBeGreaterThan(0);

    // "For the rest of the match" starts with coming back wearing it.
    await h.respawns();
    await h.advance(SPAWN_PROTECTION_MS + 100);
    expect(h.player(b.sessionId).alive).toBe(true);
    expect(parseHaircut(h.player(b.sessionId).haircut).shaves).toBe(1);
  });

  it("does not shave from the front, and no other weapon shaves at all", async () => {
    const { a, b } = await duel();
    await clip(a, b, "front", 1);
    // A frontal swing is an ordinary hit — the victim is alive and unshaved.
    expect(h.player(b.sessionId).health).toBe(100 - WEAPONS.clippers.damage);
    expect(parseHaircut(h.player(b.sessionId).haircut).shaves).toBe(0);

    // A rifle round in the back kills without shaving: the clippers are the barber, not the angle.
    // `faceOff` picks a spawn pair with real line of sight and sets the attacker's simulated aim to
    // match the ray (the server checks every shot against it); turning the victim to face the same
    // way makes it a shot in the BACK without inventing geometry the map may not have.
    await h.arm(a, "rifle");
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    h.session(b.sessionId).lastYaw = Math.atan2(aim.d[0], aim.d[2]);
    h.player(b.sessionId).health = 5;
    h.send(a, C2S.Fire, { seq: 9, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    expect(h.player(b.sessionId).alive).toBe(false);
    expect(lastKill()).toMatchObject({ weapon: "rifle", shave: false });
    expect(parseHaircut(h.player(b.sessionId).haircut).shaves).toBe(0);
  });

  it("stacks, and the shave still pays and counts like the kill it is", async () => {
    const { a, b } = await duel();
    await clip(a, b, "behind", 1);
    await h.respawns(); await h.advance(SPAWN_PROTECTION_MS + 100);
    await clip(a, b, "behind", 2);
    expect(parseHaircut(h.player(b.sessionId).haircut).shaves).toBe(2);
    // Nothing about the shave changed the fight: it is a backstab, so it is still a one-hit kill,
    // and the killer is still credited with two kills.
    expect(h.player(a.sessionId).kills).toBe(2);
    expect(h.player(b.sessionId).deaths).toBe(2);
    expect(MELEE.backstabDamage).toBe(100);
  });
});

describe("the haircut field", () => {
  it("arrives with the join, falls back when the client makes one up, and never gates anything", async () => {
    const good = await h.join("Good", { haircut: "buzz" });
    const liar = await h.join("Liar", { haircut: "a-haircut-that-does-not-exist" });
    const quiet = await h.join("Quiet");
    expect(h.player(good.sessionId).haircut).toBe("buzz");
    expect(h.player(liar.sessionId).haircut).toBe(DEFAULT_HAIRCUT);
    expect(h.player(quiet.sessionId).haircut).toBe(DEFAULT_HAIRCUT);
    // L1: a haircut buys a look and nothing else. Same health, same wallet, same weapon.
    const [g, l] = [h.player(good.sessionId), h.player(liar.sessionId)];
    expect([g.health, g.money, g.weapon, g.armor]).toEqual([l.health, l.money, l.weapon, l.armor]);
  });

  it("changes on equip and on a shave — and equipping is not a way to grow it back", async () => {
    const { a, b } = await duel();
    h.send(b, C2S.Haircut, { id: "mohawk" }); await h.tick();
    expect(h.player(b.sessionId).haircut).toBe("mohawk");
    await clip(a, b, "behind", 1);
    expect(h.player(b.sessionId).haircut).toBe("mohawk#1");
    // Re-equipping after being done keeps the count: the id is yours, the tally is theirs.
    h.send(b, C2S.Haircut, { id: "bowl" }); await h.tick();
    expect(parseHaircut(h.player(b.sessionId).haircut)).toEqual({ id: "bowl", shaves: 1 });
    // A made-up id is ignored outright rather than resetting anything.
    h.send(b, C2S.Haircut, { id: "wig" }); await h.tick();
    expect(h.player(b.sessionId).haircut).toBe("bowl#1");
  });

  it("is cleared by the next match, keeping the look the player chose", async () => {
    const { a, b } = await duel();
    h.send(b, C2S.Haircut, { id: "taper" }); await h.tick();
    await clip(a, b, "behind", 1);
    expect(h.player(b.sessionId).haircut).toBe("taper#1");
    await h.advance(MATCH.durationMs + MATCH.endedMs + MATCH.countdownMs + 500);
    await h.settle();
    expect(h.player(b.sessionId).haircut).toBe("taper");
    expect(h.player(b.sessionId).kills).toBe(0); // the same reset that clears the scoreboard
  });
});

describe("Najgorsza fryzura, from the room's own rows", () => {
  it("names the most-shaved player at the end of the match", async () => {
    const { a, b } = await duel();
    await clip(a, b, "behind", 1);
    await h.respawns(); await h.advance(SPAWN_PROTECTION_MS + 100);
    await clip(a, b, "behind", 2);
    const rows = [...h.state.players.values()].map((p) => ({ id: p.id, name: p.name, haircut: p.haircut }));
    expect(worstHaircut(rows)).toMatchObject({ id: b.sessionId, name: "Bravo", shaves: 2 });
    // And nobody wins it in a match where nobody was done.
    expect(worstHaircut(rows.map((r) => ({ ...r, haircut: encodeHaircut(DEFAULT_HAIRCUT, 0) })))).toBeNull();
  });
});
