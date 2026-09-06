import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Btn, C2S, S2C, ARMOR, MATCH, MELEE, PERKS, PERK_EFFECT, RESPAWN_DELAY_MS, SPAWN_PROTECTION_MS, WEAPONS, packInput,
  type BoomEvent, type DamagedEvent, type HitEvent, type PlayerInput, type ShopResult, type ThrowEvent,
} from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/** Drop 3: armour, barber perks, sidearm swap, clippers melee, launcher — the server rules. */

let h: RoomHarness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await RoomHarness.create({ room: "drop3" });
});

afterEach(async () => {
  await h.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const input = (seq: number, dt: number, buttons = 0, yaw = 0): PlayerInput => ({ seq, dt, buttons, yaw, pitch: 0 });
const lastShop = (c: FakeClient): ShopResult => h.sentOf(c, S2C.Shop).at(-1)?.payload as ShopResult;

async function duel(): Promise<{ a: FakeClient; b: FakeClient }> {
  const a = await h.join("Alpha");
  const b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  await h.settle();
  await h.arm(a, "rifle");
  return { a, b };
}

/** One rifle round from Alpha into Bravo's chest; returns the damage the server credited. */
async function rifleHit(a: FakeClient, b: FakeClient): Promise<number> {
  const aim = await h.faceOff(a.sessionId, b.sessionId);
  const before = h.player(b.sessionId).health;
  h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o: aim.o, d: aim.d, t: h.now() });
  await h.tick();
  return before - h.player(b.sessionId).health;
}

describe("armour and perks", () => {
  it("a plate takes half of every hit until it breaks; the hit marker and the victim both learn about it", async () => {
    const { a, b } = await duel();
    await h.arm(b, "light");
    expect(h.player(b.sessionId).armor).toBe(ARMOR.light.armor);
    const taken = await rifleHit(a, b);
    // 27 → 14 absorbed, 13 through.
    expect(taken).toBe(13);
    expect(h.player(b.sessionId).armor).toBe(ARMOR.light.armor - 14);
    expect((h.sentOf(a, S2C.Hit).at(-1)?.payload as HitEvent).armor).toBe(true);
    expect((h.sentOf(b, S2C.Damaged).at(-1)?.payload as DamagedEvent)).toMatchObject({ armor: 36, broke: false });
    // Worn down to nothing: the last hit reports the break, the next one goes fully through.
    h.player(b.sessionId).armor = 5;
    await h.advance(200);
    expect(await rifleHit(a, b)).toBe(22);
    expect((h.sentOf(b, S2C.Damaged).at(-1)?.payload as DamagedEvent)).toMatchObject({ armor: 0, broke: true });
    await h.advance(200);
    expect(await rifleHit(a, b)).toBe(27);
  });

  it("the flask shaves 20 % off a hit; the roids regenerates health after a pause", async () => {
    const { a, b } = await duel();
    await h.arm(b, "flask");
    expect(await rifleHit(a, b)).toBe(22);
    const hurt = h.player(b.sessionId).health;
    await h.arm(b, "roids"); // arm() itself advances 700 ms of the 2 s delay
    // Inside the delay: nothing. After it: ~6 hp/s.
    await h.advance(PERK_EFFECT.roidsDelayMs - 900);
    expect(h.player(b.sessionId).health).toBe(hurt);
    await h.advance(1200);
    expect(h.player(b.sessionId).health).toBeGreaterThanOrEqual(hurt + 5);
    expect(h.player(b.sessionId).health).toBeLessThanOrEqual(hurt + 7);
    // Perks expire.
    expect(h.player(b.sessionId).perks.get("roids")).toBeGreaterThan(h.now());
    await h.advance(PERKS.roids.durationMs);
    expect(h.player(b.sessionId).perks.get("roids")!).toBeLessThanOrEqual(h.now());
  });

  it("the energy drink makes a sprint measurably faster", async () => {
    const a = await h.join("Alpha");
    await h.advance(100);
    const run = async (): Promise<number> => {
      const sp = h.openRun();
      await h.place(a.sessionId, sp);
      const s = h.session(a.sessionId);
      const x0 = s.body.x, z0 = s.body.z;
      for (let i = 1; i <= 60; i++) {
        h.send(a, C2S.Input, [packInput(input(seqBase + i, 16, Btn.Forward | Btn.Sprint, sp.yaw))]);
        await h.advance(16);
      }
      seqBase += 60;
      return Math.hypot(s.body.x - x0, s.body.z - z0);
    };
    let seqBase = 0;
    const plain = await run();
    await h.arm(a, "energy");
    const boosted = await run();
    expect(boosted / plain).toBeGreaterThan(1.1);
    expect(boosted / plain).toBeLessThan(1.2);
  });

  it("a fresh fade respawns sooner with a longer shield and is spent by the death; the plate is lost", async () => {
    const { a, b } = await duel();
    await h.arm(b, "fade"); await h.arm(b, "heavy");
    const victim = h.player(b.sessionId);
    victim.health = 1;
    await rifleHit(a, b);
    expect(victim.alive).toBe(false);
    expect(victim.armor).toBe(0);
    expect(victim.perks.get("fade")).toBe(0);
    // The perk respawns this player early and grants its extended shield.
    await h.respawns();
    expect(victim.alive).toBe(true);
    const fadeLeft = victim.protectedUntil - h.now();
    expect(fadeLeft).toBeGreaterThan(PERK_EFFECT.fadeShieldMs - 100);
    expect(fadeLeft).toBeLessThanOrEqual(PERK_EFFECT.fadeShieldMs + 20);
    expect(fadeLeft).toBeGreaterThan(SPAWN_PROTECTION_MS);
    // The next death is a normal one: the default shield, measured the same way.
    victim.health = 1;
    await h.advance(PERK_EFFECT.fadeShieldMs + 100);
    await rifleHit(a, b);
    await h.respawns();
    const plainLeft = victim.protectedUntil - h.now();
    expect(plainLeft).toBeGreaterThan(SPAWN_PROTECTION_MS - 100);
    expect(plainLeft).toBeLessThanOrEqual(SPAWN_PROTECTION_MS + 20);
  });
});

describe("sidearms and clippers", () => {
  it("the revolver replaces the pistol in slot 2; selling it brings the pistol back", async () => {
    const a = await h.join("Alpha");
    await h.advance(100);
    await h.arm(a, "revolver");
    const p = h.player(a.sessionId);
    expect(p.weapon).toBe("revolver");
    expect(Array.from(p.owned)).toEqual(["revolver"]);
    expect(p.ammo).toBe(WEAPONS.revolver.magazine);
    h.send(a, C2S.Equip, 3); await h.tick();
    expect(p.weapon).toBe("clippers");
    h.send(a, C2S.Equip, 2); await h.tick();
    expect(p.weapon).toBe("revolver");
    h.send(a, C2S.Sell, { item: "revolver" }); await h.tick();
    expect(lastShop(a).ok).toBe(true);
    expect(p.weapon).toBe("pistol");
    expect(Array.from(p.owned)).toEqual(["pistol"]);
  });

  it("clippers: a swing from behind kills, from the front it does the listed damage, and it never needs ammo", async () => {
    const { a, b } = await duel();
    h.send(a, C2S.Equip, 3); await h.advance(WEAPONS.clippers.equipMs + 50);
    expect(h.player(a.sessionId).weapon).toBe("clippers");
    const v = h.session(b.sessionId), s = h.session(a.sessionId);
    const fx = Math.sin(v.lastYaw), fz = Math.cos(v.lastYaw);
    // Behind: 1.4 m against the victim's facing, swinging along it.
    await h.place(a.sessionId, { x: v.body.x - fx * 1.4, y: v.body.y, z: v.body.z - fz * 1.4, yaw: v.lastYaw, team: 0 });
    const o: [number, number, number] = [s.body.x, s.body.y + 1.62, s.body.z];
    h.send(a, C2S.Fire, { seq: 1, weapon: "clippers", o, d: [fx, -0.1, fz], t: h.now() });
    await h.tick();
    expect(h.player(b.sessionId).alive).toBe(false);
    expect((h.sentOf(a, S2C.Hit).at(-1)?.payload as HitEvent).damage).toBe(MELEE.backstabDamage);
    // Respawn, then a frontal swing. Since drop 7 a respawn during a match is a WAVE, not a
    // per-player timer, so this is how a test gets a live victim back.
    await h.respawns();
    await h.advance(SPAWN_PROTECTION_MS + 100);
    const v2 = h.session(b.sessionId);
    const gx = Math.sin(v2.lastYaw), gz = Math.cos(v2.lastYaw);
    await h.place(a.sessionId, { x: v2.body.x + gx * 1.4, y: v2.body.y, z: v2.body.z + gz * 1.4, yaw: v2.lastYaw + Math.PI, team: 0 });
    const o2: [number, number, number] = [s.body.x, s.body.y + 1.62, s.body.z];
    h.send(a, C2S.Fire, { seq: 2, weapon: "clippers", o: o2, d: [-gx, -0.1, -gz], t: h.now() });
    await h.tick();
    expect(h.player(b.sessionId).health).toBe(100 - WEAPONS.clippers.damage);
    // A swing is broadcast without trace end points (no tracer), and ammo stays at zero.
    const shot = h.broadcastsOf(S2C.Shot).at(-1)?.payload as { weapon: string; e: unknown[] };
    expect(shot.weapon).toBe("clippers");
    expect(shot.e).toEqual([]);
    expect(h.player(a.sessionId).ammo).toBe(0);
  });
});

describe("launcher", () => {
  it("fires a shell through the projectile sim that goes off on a body and credits the launcher", async () => {
    const { a, b } = await duel();
    await h.arm(a, "launcher");
    expect(h.player(a.sessionId).ammo).toBe(1);
    const aim = await h.faceOff(a.sessionId, b.sessionId);
    h.send(a, C2S.Fire, { seq: 1, weapon: "launcher", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    const thr = h.broadcastsOf(S2C.Throw).at(-1)?.payload as ThrowEvent;
    expect(thr).toMatchObject({ kind: "shell", owner: a.sessionId, fuseMs: 0 });
    expect(h.player(a.sessionId).ammo).toBe(0);
    await h.advance(1500);
    const boom = h.broadcastsOf(S2C.Boom).at(-1)?.payload as BoomEvent;
    expect(boom.kind).toBe("shell");
    expect(h.player(b.sessionId).health).toBeLessThan(100);
    const hit = h.sentOf(a, S2C.Hit).at(-1)?.payload as HitEvent;
    expect(hit.damage).toBeGreaterThan(40);
  });
});
