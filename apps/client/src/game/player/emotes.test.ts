import { describe, expect, it } from "vitest";
import { Btn, EMOTE_MAX_MS } from "@frankibarber/shared";
import { canStartEmote, emoteBreak, remoteEmoteOver } from "./emotes";

const still = { vx: 0, vz: 0, grounded: true };

describe("when a dance may start and what ends it (L1: never a way to fight)", () => {
  it("starts only standing still on the ground, alive, with nothing held and no menu open", () => {
    expect(canStartEmote(true, still, 0, false)).toBe(true);
    expect(canStartEmote(false, still, 0, false)).toBe(false);
    expect(canStartEmote(true, { ...still, vx: 3 }, 0, false)).toBe(false);
    expect(canStartEmote(true, { ...still, grounded: false }, 0, false)).toBe(false);
    expect(canStartEmote(true, still, Btn.Forward, false)).toBe(false);
    expect(canStartEmote(true, still, 0, true)).toBe(false);
  });

  it("ends on any intent: a step, a jump, a crouch, the trigger, the sights, a lean, a sprint", () => {
    for (const b of [Btn.Forward, Btn.Back, Btn.Left, Btn.Right, Btn.Jump, Btn.Crouch, Btn.Fire, Btn.Aim, Btn.LeanL, Btn.LeanR, Btn.Sprint]) {
      expect(emoteBreak(true, still, b, 100, false), `button ${b}`).toBe("input");
    }
    expect(emoteBreak(true, still, 0, 100, false)).toBeNull();
    expect(emoteBreak(true, { ...still, vz: 2 }, 0, 100, false)).toBe("moved");
    expect(emoteBreak(false, still, 0, 100, false)).toBe("dead");
    expect(emoteBreak(true, still, 0, 100, true)).toBe("busy");
    expect(emoteBreak(true, still, 0, EMOTE_MAX_MS, false)).toBe("time");
  });

  it("a remote dancer stops on movement or death even if the stop packet is lost", () => {
    expect(remoteEmoteOver(true, 0, 1000)).toBe(false);
    expect(remoteEmoteOver(true, 3, 1000)).toBe(true);
    expect(remoteEmoteOver(false, 0, 1000)).toBe(true);
    expect(remoteEmoteOver(true, 0, EMOTE_MAX_MS + 1)).toBe(true);
  });
});
