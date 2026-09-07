import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GRENADES, createProjectile, type Projectile } from "@frankibarber/shared";
import { BotBrain } from "../bots/BotBrain";
import { RoomHarness } from "./testHarness";
let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.restoreAllMocks(); vi.useRealTimers(); });
function detonate(p: Projectile) {
  (h.room as unknown as { detonate(p: Projectile, now: number): void }).detonate(p, h.now());
}
it("passes actual flash blindness to a bot without a browser connection", async () => {
  h = await RoomHarness.create({ room: "flash-bot", bots: 1 });
  const bot = [...h.state.players.values()][0];
  await h.join("Human"); // bots only think for someone (task 2)
  await h.place(bot.id, { x: -21, y: 0, z: 21, yaw: 0, team: 0 });
  const spy = vi.spyOn(BotBrain.prototype, "think");
  detonate(createProjectile(101, "flash", bot.id, [-21, 1.5, 22], [0, 0, 0]));
  await h.advance(100);
  expect(spy.mock.calls.some(([s]) => s.blinded)).toBe(true);
  expect(spy.mock.results.every(r => r.value.fire === null)).toBe(true);
});
it("blocks the bot's server sight through active smoke and restores it on expiry", async () => {
  h = await RoomHarness.create({ room: "smoke-bot", bots: 1 });
  const bot = [...h.state.players.values()][0];
  await h.join("Human");
  const spy = vi.spyOn(BotBrain.prototype, "think");
  detonate(createProjectile(102, "smoke", bot.id, [-21, 0, 21], [0, 0, 0]));
  await h.advance(1000);
  expect(spy.mock.calls.at(-1)![0].los(-23, 1.6, 21, -19, 1.6, 21)).toBe(false);
  await h.advance(GRENADES.smoke.effectMs);
  expect(spy.mock.calls.at(-1)![0].los(-23, 1.6, 21, -19, 1.6, 21)).toBe(true);
});
