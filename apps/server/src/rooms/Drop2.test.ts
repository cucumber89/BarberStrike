import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  C2S, S2C, ECONOMY, GRENADES, MATCH, THROW_INTERVAL_MS, WEAPON_PRICES, WEAPONS,
  type BoomEvent, type FlashedEvent, type KillEvent, type MoneyEvent, type ShopResult, type ThrowEvent, type ThrowMessage,
} from "@frankibarber/shared";
import { MatchPhase } from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/** Drop 2: shop, wallet, grenades — the server rules a client cannot bend. */

let h: RoomHarness;

beforeEach(async () => {
  vi.useFakeTimers();
  h = await RoomHarness.create({ room: "drop2" });
});

afterEach(async () => {
  await h.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const lastShop = (c: FakeClient): ShopResult => h.sentOf(c, S2C.Shop).at(-1)?.payload as ShopResult;
const lastMoney = (c: FakeClient): MoneyEvent | undefined => h.sentOf(c, S2C.Money).at(-1)?.payload as MoneyEvent | undefined;

async function playing(): Promise<{ a: FakeClient; b: FakeClient }> {
  const a = await h.join("Alpha");
  const b = await h.join("Bravo");
  await h.advance(MATCH.countdownMs + 100);
  await h.settle();
  return { a, b };
}

const throwMsg = (o: [number, number, number], d: [number, number, number], kind: ThrowMessage["kind"] = "frag", cookMs = 0): ThrowMessage => ({ kind, o, d, cookMs });

describe("shop", () => {
  it("a new player has the start money and only a pistol; a match start resets the wallet", async () => {
    const a = await h.join("Alpha");
    const p = h.player(a.sessionId);
    expect(p.money).toBe(ECONOMY.startMoney);
    expect(Array.from(p.owned)).toEqual(["pistol"]);
    expect(p.weapon).toBe("pistol");
    p.money = 50;
    await h.join("Bravo");
    await h.advance(MATCH.countdownMs + 100);
    expect(h.player(a.sessionId).money).toBe(ECONOMY.startMoney);
    expect((h.sentOf(a, S2C.Money).at(-1)?.payload as MoneyEvent).reason).toBe("reset");
  });

  it("buys inside the spawn window, equips the weapon full, and refuses when the window closed", async () => {
    const { a } = await playing();
    h.send(a, C2S.Buy, { item: "smg" });
    await h.tick();
    expect(lastShop(a)).toEqual({ ok: true, item: "smg" });
    const p = h.player(a.sessionId);
    expect(p.weapon).toBe("smg");
    expect(p.ammo).toBe(WEAPONS.smg.magazine);
    expect(p.money).toBe(ECONOMY.startMoney - WEAPON_PRICES.smg);
    expect(lastMoney(a)).toMatchObject({ delta: -WEAPON_PRICES.smg, reason: "buy" });
    // Window closes buyWindowMs after the spawn.
    await h.advance(ECONOMY.buyWindowMs);
    h.send(a, C2S.Buy, { item: "frag" });
    await h.tick();
    expect(lastShop(a)).toEqual({ ok: false, item: "frag", reason: "closed" });
  });

  it("refuses what the player cannot afford and unknown items; keeps the pistol unsellable", async () => {
    const { a } = await playing();
    h.send(a, C2S.Buy, { item: "dmr" });
    await h.tick();
    expect(lastShop(a)).toEqual({ ok: false, item: "dmr", reason: "money" });
    h.send(a, C2S.Buy, { item: "bazooka" });
    await h.tick();
    expect(lastShop(a)).toMatchObject({ ok: false, reason: "unknown" });
    h.send(a, C2S.Sell, { item: "pistol" });
    await h.tick();
    expect(lastShop(a)).toEqual({ ok: false, item: "pistol", reason: "pistol" });
  });

  it("the buy window reopens at a buy station", async () => {
    const { a } = await playing();
    await h.advance(ECONOMY.buyWindowMs + 500);
    const st = h.map.stations[0];
    await h.place(a.sessionId, { x: st.x, y: st.y, z: st.z, yaw: 0, team: 0 });
    h.send(a, C2S.Buy, { item: "flash" });
    await h.tick();
    expect(lastShop(a)).toEqual({ ok: true, item: "flash" });
    expect(h.player(a.sessionId)).toMatchObject({ tactical: "flash", tacticalCount: 1 });
  });

  it("equip only switches to owned weapons; a sold weapon falls back to the pistol", async () => {
    const { a } = await playing();
    h.send(a, C2S.Equip, 1); // no primary owned yet
    await h.tick();
    expect(h.player(a.sessionId).weapon).toBe("pistol");
    await h.arm(a, "shotgun");
    expect(h.player(a.sessionId).weapon).toBe("shotgun");
    h.send(a, C2S.Equip, 2); await h.tick();
    expect(h.player(a.sessionId).weapon).toBe("pistol");
    h.send(a, C2S.Equip, 1); await h.tick();
    expect(h.player(a.sessionId).weapon).toBe("shotgun");
    h.send(a, C2S.Sell, { item: "shotgun" }); await h.tick();
    expect(h.player(a.sessionId).weapon).toBe("pistol");
    expect(Array.from(h.player(a.sessionId).owned)).toEqual(["pistol"]);
  });

  it("pays for kills, more for head shots, and assists for recent damage by a teammate", async () => {
    const a = await h.join("Alpha");
    const b = await h.join("Bravo");
    const c = await h.join("Charlie"); // team 0 with Alpha
    await h.advance(MATCH.countdownMs + 100);
    await h.settle();
    await h.arm(a, "rifle"); await h.arm(c, "rifle");
    const victim = h.player(b.sessionId);
    // Charlie softens Bravo up (assist), Alpha finishes with a head shot.
    // faceOff is deterministic (same spawn pair each call) and spawns are random, so a bystander
    // can stand in the firing line and soak the ray as a teammate: park them far away first.
    const aimC = await h.faceOff(c.sessionId, b.sessionId);
    const vb = h.session(b.sessionId).body;
    const away = h.map.spawns.find((sp) => Math.hypot(sp.x - aimC.o[0], sp.z - aimC.o[2]) > 15 && Math.hypot(sp.x - vb.x, sp.z - vb.z) > 15)!;
    await h.place(a.sessionId, away);
    // Two body hits: one rifle round (27) is under the assist floor (30) — a single graze is not an assist.
    h.send(c, C2S.Fire, { seq: 1, weapon: "rifle", o: aimC.o, d: aimC.d, t: h.now() });
    await h.advance(120);
    h.send(c, C2S.Fire, { seq: 2, weapon: "rifle", o: aimC.o, d: aimC.d, t: h.now() });
    expect(victim.health).toBeLessThanOrEqual(100 - ECONOMY.assistMinDamage);
    const moneyA = h.player(a.sessionId).money, moneyC = h.player(c.sessionId).money;
    victim.health = 1;
    await h.place(c.sessionId, away);
    const aimA = await h.faceOff(a.sessionId, b.sessionId);
    h.send(a, C2S.Fire, { seq: 1, weapon: "rifle", o: aimA.o, d: aimA.d, t: h.now() });
    expect(victim.alive).toBe(false);
    expect(h.player(a.sessionId).money - moneyA).toBeGreaterThanOrEqual(ECONOMY.killReward);
    expect(h.player(c.sessionId).money - moneyC).toBe(ECONOMY.assistReward);
    expect(lastMoney(c)).toMatchObject({ reason: "assist", delta: ECONOMY.assistReward });
  });
});

describe("grenades", () => {
  it("a throw needs a grenade in the slot, is rate limited, and is broadcast with a fuse", async () => {
    const { a } = await playing();
    const s = h.session(a.sessionId);
    const o: [number, number, number] = [s.body.x, s.body.y + 1.6, s.body.z];
    h.send(a, C2S.Throw, throwMsg(o, [0, 0.5, 0.866]));
    await h.tick();
    expect(h.broadcastsOf(S2C.Throw).length).toBe(0); // nothing to throw
    await h.arm(a, "frag"); await h.arm(a, "frag");
    expect(h.player(a.sessionId).lethalCount).toBe(2);
    h.send(a, C2S.Throw, throwMsg(o, [0, 0.5, 0.866], "frag", 1000));
    await h.tick();
    const ev = h.broadcastsOf(S2C.Throw)[0]?.payload as ThrowEvent;
    expect(ev).toMatchObject({ kind: "frag", owner: a.sessionId });
    expect(ev.fuseMs).toBe(GRENADES.frag.fuseMs - 1000);
    expect(h.player(a.sessionId).lethalCount).toBe(1);
    // Second throw inside the interval is ignored; after it, accepted.
    h.send(a, C2S.Throw, throwMsg(o, [0, 0.5, 0.866]));
    await h.tick();
    expect(h.broadcastsOf(S2C.Throw).length).toBe(1);
    await h.advance(THROW_INTERVAL_MS);
    h.send(a, C2S.Throw, throwMsg(o, [0, 0.5, 0.866]));
    await h.tick();
    expect(h.broadcastsOf(S2C.Throw).length).toBe(2);
    expect(h.player(a.sessionId).lethalCount).toBe(0);
  });

  it("spends spawn protection on an accepted throw and refuses throws after the result", async () => {
    const { a } = await playing();
    await h.arm(a, "frag");
    const p = h.player(a.sessionId);
    const s = h.session(a.sessionId);
    const o: [number, number, number] = [s.body.x, s.body.y + 1.6, s.body.z];
    p.protectedUntil = h.now() + 1000;
    h.send(a, C2S.Throw, throwMsg(o, [0, 0.5, 0.866]));
    expect(p.protectedUntil).toBe(h.now());
    const count = p.lethalCount;
    h.state.phase = MatchPhase.Ended;
    await h.advance(THROW_INTERVAL_MS);
    h.send(a, C2S.Throw, throwMsg(o, [0, 0.5, 0.866]));
    expect(p.lethalCount).toBe(count);
  });

  it("a frag dropped at an enemy's feet detonates at the fuse, damages by distance and pays the kill", async () => {
    const { a, b } = await playing();
    await h.arm(a, "frag");
    const aim = await h.faceOff(a.sessionId, b.sessionId, 8);
    const sb = h.session(b.sessionId).body;
    const victim = h.player(b.sessionId);
    victim.health = 100;
    // Lob it straight down next to Bravo: origin near Alpha's eye, direction towards Bravo's feet.
    const sa = h.session(a.sessionId).body;
    const o: [number, number, number] = [sa.x, sa.y + 1.6, sa.z];
    const dx = sb.x - o[0], dy = sb.y + 0.5 - o[1], dz = sb.z - o[2];
    const len = Math.hypot(dx, dy, dz);
    void aim;
    h.send(a, C2S.Throw, throwMsg(o, [dx / len, dy / len, dz / len], "frag", 2600));
    await h.tick();
    expect(h.broadcastsOf(S2C.Throw).length).toBe(1);
    await h.advance(GRENADES.frag.fuseMs);
    const boom = h.broadcastsOf(S2C.Boom)[0]?.payload as BoomEvent;
    expect(boom?.kind).toBe("frag");
    expect(victim.health).toBeLessThan(100);
    // Kill feed names the grenade and the thrower gets paid.
    victim.health = 1;
    await h.arm(a, "frag");
    const money = h.player(a.sessionId).money;
    await h.advance(THROW_INTERVAL_MS);
    h.send(a, C2S.Throw, throwMsg(o, [dx / len, dy / len, dz / len], "frag", 2600));
    await h.advance(GRENADES.frag.fuseMs + 50);
    expect(victim.alive).toBe(false);
    const kill = h.broadcastsOf(S2C.Kill).at(-1)?.payload as KillEvent;
    expect(kill.weapon).toBe("frag");
    expect(h.player(a.sessionId).money - money).toBe(ECONOMY.killReward);
  });

  it("a flash sends a Flashed event only to players with line of sight, scaled by facing", async () => {
    const { a, b } = await playing();
    await h.arm(a, "flash");
    const aim = await h.faceOff(a.sessionId, b.sessionId, 8);
    const sb = h.session(b.sessionId).body;
    // Face Bravo towards the flash so it is strong.
    const sessB = h.session(b.sessionId) as unknown as { lastYaw: number; lastPitch: number };
    sessB.lastYaw = Math.atan2(aim.o[0] - sb.x, aim.o[2] - sb.z); sessB.lastPitch = 0;
    h.send(a, C2S.Throw, throwMsg(aim.o, [0, -1, 0], "flash"));
    await h.advance(GRENADES.flash.fuseMs + 50);
    const fb = h.sentOf(b, S2C.Flashed).at(-1)?.payload as FlashedEvent | undefined;
    expect(fb).toBeDefined();
    expect(fb!.strength).toBeGreaterThan(0.3);
    expect(fb!.ms).toBeGreaterThan(500);
    // Nobody is flashed through a wall: teleport Bravo far into another room and repeat.
    const far = h.map.spawns.find((s) => s.team !== h.player(a.sessionId).team)!;
    await h.place(b.sessionId, far);
    const before = h.sentOf(b, S2C.Flashed).length;
    await h.arm(a, "flash"); await h.advance(THROW_INTERVAL_MS);
    h.send(a, C2S.Throw, throwMsg(aim.o, [0, -1, 0], "flash"));
    await h.advance(GRENADES.flash.fuseMs + 50);
    expect(h.sentOf(b, S2C.Flashed).length).toBe(before);
  });

  it("a molotov leaves a fire that burns players standing in it", async () => {
    const { a, b } = await playing();
    await h.arm(a, "molotov");
    const sb = h.session(b.sessionId).body;
    const victim = h.player(b.sessionId);
    const o: [number, number, number] = [sb.x, sb.y + 2.5, sb.z]; // dropped from above Bravo (origin tolerance is generous for the test)
    const sa = h.session(a.sessionId);
    sa.body.x = sb.x + 1.5; sa.body.z = sb.z; // stand next to Bravo so the origin check passes
    h.send(a, C2S.Throw, throwMsg([sa.body.x, sa.body.y + 1.6, sa.body.z], [-0.4, -0.9, 0], "molotov"));
    void o;
    await h.advance(1500);
    expect(h.broadcastsOf(S2C.Boom).some((m) => (m.payload as BoomEvent).kind === "molotov")).toBe(true);
    expect(victim.health).toBeLessThan(100);
    const hp = victim.health;
    await h.advance(1000);
    expect(victim.health).toBeLessThan(hp);
  });
});
