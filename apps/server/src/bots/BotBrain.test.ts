import { describe, expect, it, vi } from "vitest";

/**
 * `findPath` is counted, because keeping the route through a fight buys COST, not a different
 * destination — with the goal now standing on its own, a bot that threw its route away still
 * arrived, so only the number of searches tells the two apart.
 */
const nav = vi.hoisted(() => ({ searches: 0 }));
vi.mock("@frankibarber/shared", async (importOriginal) => {
  const real = await importOriginal<typeof import("@frankibarber/shared")>();
  return { ...real, findPath: (...a: Parameters<typeof real.findPath>) => { nav.searches++; return real.findPath(...a); } };
});
import {
  Btn, NIGHT_DISTRICT, TICK_MS, buildCollisionWorld, createBody, findPath, simulateBody, standHeight,
  walkable, wrapAngle, type BodyState, type NavPoint, type Walk,
} from "@frankibarber/shared";
import { BotBrain, type BotSenses } from "./BotBrain";

/**
 * Drop 6d: how a bot MOVES, driven through the real mover on the real map.
 *
 * These are closed-loop: the brain's buttons go into `simulateBody` and the resulting position
 * comes back as the next tick's senses, so what is measured is where the bot actually ends up —
 * not what it intended. The complaint they answer is that bots walked oddly and incoherently.
 */

const walk: Walk = walkable(NIGHT_DISTRICT);
const world = buildCollisionWorld(NIGHT_DISTRICT);

describe("fair perception and hazards", () => {
  it("cannot acquire someone behind it or shoot through smoke / flash", () => {
    const brain = new BotBrain("normal", walk, () => 0.5);
    const s = sensesFor(0, createBody(0, 0, 0), [], [{ id: "enemy", team: 1, x: 0, y: 0, z: -10, crouching: false }]);
    for (let t = 0; t < 2000; t += TICK_MS) { s.now = t; expect(brain.think(s).fire).toBeNull(); }
    s.enemies[0].z = 10; s.los = () => false;
    for (let t = 2000; t < 4000; t += TICK_MS) { s.now = t; expect(brain.think(s).fire).toBeNull(); }
    s.los = () => true; s.blinded = true;
    for (let t = 4000; t < 6000; t += TICK_MS) { s.now = t; expect(brain.think(s).fire).toBeNull(); }
  });
  it("gives the player a gap between bursts and retreats from fire", () => {
    const brain = new BotBrain("normal", walk, () => 0.5);
    const s = sensesFor(0, createBody(0, 0, 0), [], [{ id: "enemy", team: 1, x: 0, y: 0, z: 15, crouching: false }]);
    const shots: number[] = [];
    for (let t = 0; t < 3000; t += TICK_MS) { s.now = t; if (brain.think(s).fire) shots.push(t); }
    expect(shots.length).toBeGreaterThan(3); expect(shots[0]).toBeGreaterThanOrEqual(650);
    expect(shots[3] - shots[2]).toBeGreaterThan(600);
    s.hazards = [{ x: 0, y: 0, z: 1, radius: 3 }];
    const d = brain.think(s); expect(d.fire).toBeNull(); expect(d.input.buttons & Btn.Back).toBe(Btn.Back);
  });
});

describe("weapon-aware combat", () => {
  it("closes with a shotgun and holds distance with a rifle", () => {
    const s = sensesFor(1000, createBody(0, 0, 0), [], [{ id: "enemy", team: 1, x: 0, y: 0, z: 18, crouching: false }]);
    const shotgun = new BotBrain("normal", walk, () => 0.5);
    s.me.weapon = "shotgun";
    expect(shotgun.think(s).input.buttons & Btn.Forward).toBe(Btn.Forward);
    const rifle = new BotBrain("normal", walk, () => 0.5);
    s.me.weapon = "rifle";
    expect(rifle.think(s).input.buttons & Btn.Forward).toBe(0);
  });

  it("backs away to reload instead of advancing with an empty weapon", () => {
    const s = sensesFor(1000, createBody(0, 0, 0), [], [{ id: "enemy", team: 1, x: 0, y: 0, z: 30, crouching: false }]);
    s.me.ammo = 0;
    const d = new BotBrain("normal", walk, () => 0.5).think(s);
    expect(d.reload).toBe(true);
    expect(d.input.buttons & Btn.Back).toBe(Btn.Back);
    expect(d.input.buttons & Btn.Forward).toBe(0);
    expect(d.fire).toBeNull();
  });

  it("keeps reacting to one target when two opponents trade nearest place", () => {
    const brain = new BotBrain("normal", walk, () => 0.5);
    const s = sensesFor(0, createBody(0, 0, 0), [], [
      { id: "a", team: 1, x: 0, y: 0, z: 15, crouching: false },
      { id: "b", team: 1, x: 0, y: 0, z: 15.1, crouching: false },
    ]);
    let shots = 0;
    for (let tick = 0; tick < 60; tick++) {
      s.now = tick * TICK_MS;
      s.enemies[1].z = tick % 2 ? 14.9 : 15.1;
      if (brain.think(s).fire) shots++;
    }
    expect(shots).toBeGreaterThan(0);
  });
});

/** A senses object with no enemies: pure navigation towards a single roam point. */
function sensesFor(now: number, b: BodyState, roam: NavPoint[], enemies: BotSenses["enemies"] = []): BotSenses {
  return {
    now,
    me: {
      id: "bot", team: 0, x: b.x, y: b.y, z: b.z, crouching: b.crouching, grounded: b.grounded,
      ammo: 30, magazine: 30, reserve: 90, weapon: "rifle", fireIntervalMs: 92,
    },
    enemies,
    los: () => true,
    flags: [],
    roamPoints: roam,
  };
}

interface RunOut { body: BodyState; buttons: number[]; searches: number }

function run(brain: BotBrain, start: NavPoint, roam: NavPoint[], ticks: number, enemyAt?: (t: number) => BotSenses["enemies"]): RunOut {
  const b = createBody(start.x, start.y, start.z);
  const buttons: number[] = [];
  const before = nav.searches;
  let prev = 0;
  for (let t = 0; t < ticks; t++) {
    const d = brain.think(sensesFor(t * TICK_MS, b, roam, enemyAt?.(t) ?? []));
    buttons.push(d.input.buttons);
    simulateBody(world, b, d.input, 1, prev);
    prev = d.input.buttons;
  }
  return { body: b, buttons, searches: nav.searches - before };
}

/** A walkable point about `want` metres from `from`, taken from the grid itself. */
function pointNear(from: NavPoint, want: number): NavPoint {
  let best: NavPoint | null = null, bestErr = Infinity;
  for (const [k, ys] of walk.cells) {
    const [cx, cz] = k.split(",").map(Number);
    const p = { x: cx / 2 - 0.25, y: ys[0], z: cz / 2 - 0.25 };
    const err = Math.abs(Math.hypot(p.x - from.x, p.z - from.z) - want);
    if (err < bestErr && findPath(walk, from, p)) { bestErr = err; best = p; }
  }
  return best!;
}

/** mulberry32: a real varying sequence. A constant `rand` makes `pickGoal` deterministic, which
 * silently defeats any test of whether the bot changes its mind. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const spawn = NIGHT_DISTRICT.spawns[0];
const start: NavPoint = { x: spawn.x, y: standHeight(walk, spawn.x, spawn.z, spawn.y)!, z: spawn.z };

/**
 * These run whole simulations — 14 to 22 seconds of ticks each, through the real mover and the real
 * path search — against vitest's DEFAULT 5 s timeout, which was never chosen with that in mind.
 * MEASURED: "keeps its destination" is 1.77 s on a dev machine and 3.9x slower on a GitHub runner
 * (its siblings ran 818 ms → 3502 ms in the same job), which lands it either side of 5 s depending
 * on how loaded the runner is. It failed CI for that reason and nothing else.
 *
 * The timeout is raised rather than the work reduced or the assertion loosened: every test here
 * still runs in full and still asserts exactly what it did. 30 s is ~8x the slowest observed run,
 * so a genuine hang is still caught — it just is not caught by a stopwatch set for a unit test.
 */
describe("bot movement", { timeout: 30_000 }, () => {
  it("walks off immediately instead of standing still to turn round", () => {
    // The goal is placed BEHIND the bot's starting facing, the case the old code handled worst: it
    // pressed nothing until the body was within 0.6 rad, so an easy bot (3.2 rad/s) stood for a
    // fifth of a second at every corner. Measured over the first ten ticks.
    const goal = pointNear(start, 25);
    const brain = new BotBrain("easy", walk, () => 0.5);
    brain.onSpawn(wrapAngle(Math.atan2(goal.x - start.x, goal.z - start.z) + Math.PI));
    const out = run(brain, start, [goal], 10);
    const moving = out.buttons.filter((b) => (b & (Btn.Forward | Btn.Back | Btn.Left | Btn.Right)) !== 0);
    expect(moving.length).toBe(10); // every tick, starting with the first
    // 167 ms of accelerating from a standstill: MEASURED at 0.48 m, against 0 m for a bot that
    // waits to finish turning. The threshold only has to tell those two apart.
    expect(Math.hypot(out.body.x - start.x, out.body.z - start.z)).toBeGreaterThan(0.3);
  });

  it("actually arrives, on the real map through the real mover", () => {
    const goal = pointNear(start, 30);
    const brain = new BotBrain("normal", walk, () => 0.5);
    brain.onSpawn(0);
    // 20 s of ticks: a 30 m walk at ~5 m/s has a lot of room, and anything that gets stuck fails.
    const out = run(brain, start, [goal], Math.round(20000 / TICK_MS));
    expect(Math.hypot(out.body.x - goal.x, out.body.z - goal.z), JSON.stringify({ start, goal, at: out.body, route: findPath(walk, start, goal) })).toBeLessThan(3);
  });

  it("keeps its destination instead of changing its mind every couple of seconds", () => {
    // Four roam points spread round the spawn. A bot that re-picks its GOAL on a timer turns round
    // every time and ends up near where it started — which is what "the bots move incoherently"
    // looked like. Measured as ground covered: 26.4 m with the goal standing, 8.5 m when it is
    // re-picked on the old 2.5 s timer.
    const roam = [12, 20, 28, 34].map((d) => pointNear(start, d));
    const brain = new BotBrain("normal", walk, prng(7));
    brain.onSpawn(0);
    const out = run(brain, start, roam, Math.round(14000 / TICK_MS));
    expect(Math.hypot(out.body.x - start.x, out.body.z - start.z)).toBeGreaterThan(18);
  });

  it("fights, then carries on, without spending the tick budget on searches", () => {
    // An enemy is in sight for two seconds in the middle of the walk. The bot fights, then carries
    // on to the SAME place. The search budget is the real assertion here and it earned its keep: it
    // caught an arrived bot asking for a new route every tick for ever (857 over this run), drift
    // measured to the next waypoint instead of to the leg (326), and a chase re-arming a goal it
    // could not reach inside its own back-off (47). It now measures 4.
    const goal = pointNear(start, 30);
    const brain = new BotBrain("normal", walk, prng(3));
    brain.onSpawn(0);
    const enemyFrom = Math.round(3000 / TICK_MS), enemyTo = Math.round(5000 / TICK_MS);
    // On a real walk cell: an enemy standing inside geometry is a different test (an unreachable
    // chase), and it is covered below.
    const spot = pointNear(start, 10);
    const out = run(brain, start, [goal], Math.round(22000 / TICK_MS), (t) =>
      t >= enemyFrom && t < enemyTo
        ? [{ id: "e", team: 1, x: spot.x, y: spot.y, z: spot.z, crouching: false }]
        : []);
    expect(Math.hypot(out.body.x - goal.x, out.body.z - goal.z)).toBeLessThan(3);
    expect(out.searches).toBeLessThanOrEqual(8);
  });

  it("stops asking for a route to somewhere it cannot reach", () => {
    // The enemy is off the walk grid entirely, so the chase goal has no route. The chase branch set
    // the goal every tick regardless of the back-off, so the failed search repeated on each one.
    const goal = pointNear(start, 20);
    const brain = new BotBrain("normal", walk, prng(11));
    brain.onSpawn(0);
    const out = run(brain, start, [goal], Math.round(8000 / TICK_MS), (t) =>
      t >= 30 && t < 90 ? [{ id: "e", team: 1, x: 999, y: 0, z: 999, crouching: false }] : []);
    expect(out.searches).toBeLessThanOrEqual(8);
  });

  it("does not flicker in and out of a sprint", () => {
    const goal = pointNear(start, 40);
    const brain = new BotBrain("normal", walk, () => 0.5);
    brain.onSpawn(0);
    const out = run(brain, start, [goal], Math.round(12000 / TICK_MS));
    let flips = 0;
    for (let i = 1; i < out.buttons.length; i++) {
      if ((out.buttons[i] & Btn.Sprint) !== (out.buttons[i - 1] & Btn.Sprint)) flips++;
    }
    // A handful of genuine transitions over twelve seconds is fine; the old rule toggled on the
    // waypoint COUNT, so it flipped at every waypoint the bot passed.
    expect(flips).toBeLessThanOrEqual(6);
  });
});
