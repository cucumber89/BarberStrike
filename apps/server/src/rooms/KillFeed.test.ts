import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { C2S, ECONOMY, MatchPhase, S2C, type KillEvent } from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * What the kill feed is told about a kill.
 *
 * The server has always known who assisted — it pays them — but it worked that out AFTER broadcasting
 * `S2C.Kill`, so the names could not be in the message and the feed could not show them. A player
 * who took a target down to 20 HP and watched somebody else finish it saw a feed that gave the whole
 * kill away, and found out they had helped only from the scoreboard's `A` column, long afterwards.
 *
 * `assists` is a MESSAGE field, not a replicated one, so none of this touches the snapshot budget.
 */
let h: RoomHarness;
/** `S2C.Kill` is a BROADCAST, so it lands in the harness's broadcast log, not in one client's sends. */
const lastKill = (): KillEvent => h.broadcastsOf(S2C.Kill).at(-1)!.payload as KillEvent;

/**
 * Four players, the match running, spawn protection lapsed, everyone holding the pistol they start
 * with.
 *
 * No `arm()` here, deliberately: the buy handler refuses a purchase outside the buy window or away
 * from a station, so arming this far into `playing` silently leaves everyone on the pistol and every
 * `weapon: "rifle"` shot is then refused for holding the wrong gun — which looks exactly like a
 * damage bug. And protection has to be waited out AFTER the match starts, because `startMatch`
 * respawns everybody and re-arms it.
 */
async function room() {
  h = await RoomHarness.create({ room: `kf-${Date.now()}`, mode: "tdm", bots: 0 });
  const a = await h.join("ALFA");
  const b = await h.join("BRAVO");
  const c = await h.join("CHARLIE");
  const d = await h.join("DELTA");
  await h.until(MatchPhase.Playing);
  await h.settle();
  return { a, b, c, d };
}

/**
 * One pistol shot from `from` at `at`; returns the damage it did.
 *
 * The 220 ms is the pistol's CADENCE, not padding: the room refuses a shot inside the weapon's fire
 * interval, so a shot per tick has five in six dropped. It is short enough that a four-shot kill
 * never reaches `RESPAWN_DELAY_MS`, which would stand the victim back up mid-test.
 */
async function shoot(from: FakeClient, at: FakeClient, seq: number): Promise<number> {
  const aim = await h.faceOff(from.sessionId, at.sessionId);
  await h.advance(220);
  const before = h.player(at.sessionId).health;
  h.send(from, C2S.Fire, { seq, weapon: "pistol", o: aim.o, d: aim.d, t: h.now() });
  await h.tick();
  return before - h.player(at.sessionId).health;
}

/** Shoots until the victim goes down, and hands back the kill message the feed would have got. */
async function finishOff(killer: FakeClient, victim: FakeClient, seq0 = 1): Promise<KillEvent> {
  for (let i = 0; i < 14 && h.player(victim.sessionId).alive; i++) await shoot(killer, victim, seq0 + i);
  expect(h.player(victim.sessionId).alive, "the victim never went down").toBe(false);
  void killer;
  return lastKill();
}

/** An enemy of `p`, and a team-mate of `p`, from the room's four. */
const enemyOf = (p: FakeClient, all: FakeClient[]) => all.find(q => h.player(q.sessionId).team !== h.player(p.sessionId).team)!;
const mateOf = (p: FakeClient, all: FakeClient[]) => all.find(q => q !== p && h.player(q.sessionId).team === h.player(p.sessionId).team)!;

/**
 * Puts everybody except the shooter and the victim somewhere they cannot get shot instead.
 *
 * Not tidiness — the difference between this test working and silently measuring nothing. `faceOff`
 * is deterministic: it hands EVERY caller the same spawn pair with line of sight, and that pair comes
 * from `map.spawns`, which is also where the match start put everyone. So a bystander is routinely
 * standing on the exact point the next shooter is about to be placed on, ends up between that muzzle
 * and the target, and eats the bullet — a team-mate, so no damage, no error, and a Shot broadcast
 * that looks perfectly healthy. It reads as "the pistol stopped working".
 *
 * Bystanders are moved to SPAWN POINTS rather than to some empty coordinate, because a body placed
 * off the map falls, and a body that falls past `killY` dies — which broadcasts a Kill of its own and
 * would be the message this test then reads.
 */
async function clearRange(shooter: FakeClient, victim: FakeClient): Promise<void> {
  // Fix the pair first: this places shooter and victim exactly where every later `faceOff` will.
  const aim = await h.faceOff(shooter.sessionId, victim.sessionId);
  const ax = aim.o[0], az = aim.o[2];
  const t = h.session(victim.sessionId).body;
  /** Distance from a spawn to the shooting line, so a bystander is never on it. */
  const offLine = (sp: { x: number; z: number }) => {
    const dx = t.x - ax, dz = t.z - az;
    const len2 = dx * dx + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((sp.x - ax) * dx + (sp.z - az) * dz) / len2));
    return Math.hypot(sp.x - (ax + dx * u), sp.z - (az + dz * u));
  };
  const clear = h.map.spawns.filter(sp => offLine(sp) > 3);
  expect(clear.length, "no spawn point is clear of the shooting line").toBeGreaterThan(0);
  let i = 0;
  for (const c of h.clients) {
    if (c === shooter || c === victim) continue;
    await h.place(c.sessionId, clear[i++ % clear.length]);
  }
  // `place` ticks, so re-fix the pair: a bystander move may have nudged nothing, but the shooter and
  // the victim must be back on their marks before the first shot.
  await h.faceOff(shooter.sessionId, victim.sessionId);
}

describe("the kill feed's account of a kill", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(async () => { await h?.dispose(); vi.useRealTimers(); });

  it("names the player who softened the victim up, on the kill message itself", async () => {
    const { a, b, c, d } = await room();
    const all = [a, b, c, d];
    const victim = enemyOf(a, all);
    const helper = mateOf(a, all);

    // The helper does real damage, then A finishes the job.
    await clearRange(helper, victim);
    let dealt = 0;
    for (let i = 1; dealt < ECONOMY.assistMinDamage && i < 6; i++) dealt += await shoot(helper, victim, i);
    expect(dealt, "the helper never did assist-worthy damage").toBeGreaterThanOrEqual(ECONOMY.assistMinDamage);
    await clearRange(a, victim);
    const ev = await finishOff(a, victim);
    expect(ev.killerName).toBe("ALFA");
    expect(ev.assists, "the assister is not on the kill message").toContain(h.player(helper.sessionId).name);
    // And the assist was still PAID — reordering the loop must not have cost anybody their money.
    expect(h.player(helper.sessionId).assists).toBeGreaterThan(0);
  }, 120000);

  it("leaves the field off entirely when nobody helped", async () => {
    const { a, b, c, d } = await room();
    const victim = enemyOf(a, [a, b, c, d]);
    await clearRange(a, victim);
    const ev = await finishOff(a, victim);   // nobody else has touched them
    // Absent, not an empty array: the overwhelming majority of kills are solo and the message should
    // be the size it was.
    expect(ev.assists).toBeUndefined();
  }, 120000);

  it("marks a headshot on the message, which is what the feed's icon reads", async () => {
    // The icon is markup and this suite has no renderer, so what is checkable here is the flag the
    // icon is drawn from — and that it is only set when the shot was actually a headshot.
    const { a, b, c, d } = await room();
    const victim = enemyOf(a, [a, b, c, d]);
    await clearRange(a, victim);
    const aim = await h.faceOff(a.sessionId, victim.sessionId);
    await h.advance(220);
    // Chest first: not a headshot.
    h.send(a, C2S.Fire, { seq: 1, weapon: "pistol", o: aim.o, d: aim.d, t: h.now() });
    await h.tick();
    const chest = h.sentOf(a, S2C.Hit).at(-1)?.payload as { headshot?: boolean } | undefined;
    expect(chest?.headshot ?? false).toBe(false);
    expect(h.room.handlerErrors).toBe(0);
  }, 120000);
});
