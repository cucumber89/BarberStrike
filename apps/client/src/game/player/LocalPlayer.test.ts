import { describe, expect, it } from "vitest";
import { Btn, createBody } from "@frankibarber/shared";
import { LocalPlayer } from "./LocalPlayer";

/** The predicate is intentionally testable without constructing a Babylon camera. */
function sprintProbe(buttons: number, crouching = false): LocalPlayer {
  const player = Object.create(LocalPlayer.prototype) as LocalPlayer;
  Object.defineProperty(player, "body", { value: createBody() });
  player.body.crouching = crouching;
  player.lastButtons = buttons;
  return player;
}

describe("LocalPlayer.isSprinting", () => {
  it("matches the movement simulation when firing or aiming cancels a sprint", () => {
    expect(sprintProbe(Btn.Forward | Btn.Sprint).isSprinting()).toBe(true);
    expect(sprintProbe(Btn.Forward | Btn.Sprint | Btn.Fire).isSprinting()).toBe(false);
    expect(sprintProbe(Btn.Forward | Btn.Sprint | Btn.Aim).isSprinting()).toBe(false);
    expect(sprintProbe(Btn.Forward | Btn.Sprint, true).isSprinting()).toBe(false);
  });
});
