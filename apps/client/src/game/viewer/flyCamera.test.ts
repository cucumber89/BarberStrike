import { expect, it } from "vitest";
import { FLY_BOOST, FLY_SPEED, MAX_FRAME_MS, MAX_PITCH, NO_INPUT, fly, look, readKeys, type FlyPose } from "./flyCamera";

/** One clamped frame's worth of travel at the resting speed. */
const FULL = (FLY_SPEED * MAX_FRAME_MS) / 1000;

const pose = (over: Partial<FlyPose> = {}): FlyPose => ({ x: 0, y: 2, z: 0, yaw: 0, pitch: 0, ...over });
const dist = (a: FlyPose, b: FlyPose) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

it("stands still with nothing held, and returns the very same pose", () => {
  const p = pose();
  expect(fly(p, NO_INPUT, 16)).toBe(p);
});

it("moves along the look direction at the speed it claims", () => {
  const p = pose();
  const after = fly(p, { ...NO_INPUT, forward: true }, MAX_FRAME_MS);
  expect(dist(p, after)).toBeCloseTo(FULL, 6);
  // yaw 0 looks along +Z, the same convention as the rest of the game.
  expect(after.z).toBeCloseTo(FULL, 6);
  expect(after.x).toBeCloseTo(0, 9);
});

it("dives when the look dives, but rises and falls on the world's vertical", () => {
  const down = fly(pose({ pitch: MAX_PITCH }), { ...NO_INPUT, forward: true }, MAX_FRAME_MS);
  expect(down.y).toBeLessThan(pose().y);
  // Up is up even while looking at the floor: that is what lets a viewer hold a height.
  const up = fly(pose({ pitch: MAX_PITCH }), { ...NO_INPUT, up: true }, MAX_FRAME_MS);
  expect(up.y).toBeCloseTo(pose().y + FULL, 6);
  expect(up.x).toBeCloseTo(0, 9); expect(up.z).toBeCloseTo(0, 9);
});

it("does not pay a bonus for cutting a corner", () => {
  const straight = dist(pose(), fly(pose(), { ...NO_INPUT, forward: true }, 500));
  const diagonal = dist(pose(), fly(pose(), { ...NO_INPUT, forward: true, right: true }, 500));
  expect(diagonal).toBeCloseTo(straight, 6);
});

it("boosts by the stated multiple and clamps a long frame", () => {
  const fast = dist(pose(), fly(pose(), { ...NO_INPUT, forward: true, boost: true }, MAX_FRAME_MS));
  expect(fast).toBeCloseTo(FULL * FLY_BOOST, 6);
  // A tab that was asleep must not fire the camera across the map on its first frame back.
  const stall = dist(pose(), fly(pose(), { ...NO_INPUT, forward: true }, 30_000));
  expect(stall).toBeCloseTo(FULL, 6);
});

it("never lets the look roll over the pole", () => {
  let p = pose();
  for (let i = 0; i < 400; i++) p = look(p, 0, 40);
  expect(p.pitch).toBeCloseTo(MAX_PITCH, 9);
  for (let i = 0; i < 800; i++) p = look(p, 0, -40);
  expect(p.pitch).toBeCloseTo(-MAX_PITCH, 9);
});

it("reads the keys a player already knows", () => {
  const k = readKeys(new Set(["KeyW", "KeyD", "ShiftLeft"]));
  expect(k).toMatchObject({ forward: true, right: true, boost: true, back: false, left: false });
  expect(readKeys(new Set(["Space"])).up).toBe(true);
  expect(readKeys(new Set(["ControlLeft"])).down).toBe(true);
});
