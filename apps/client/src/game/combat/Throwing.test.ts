import { describe, expect, it } from "vitest";
import { C2S, GRENADES, THROW_INTERVAL_MS, type ThrowMessage } from "@frankibarber/shared";
import { THROW_WINDUP_MS, Throwing } from "./Throwing";
import type { Connection, NetPlayer } from "../net/Connection";
import type { LocalPlayer } from "../player/LocalPlayer";

/** Minimal stand-ins: the controller only sends messages and reads the eye/aim of the player. */
function rig(wallet: Partial<NetPlayer> = {}) {
  const sent: { type: string; msg: ThrowMessage }[] = [];
  const conn = { send: (type: string, msg: ThrowMessage) => sent.push({ type, msg }) } as unknown as Connection;
  const player = {
    alive: true, frozen: false, yaw: 0,
    eyePosition: (o: number[]) => { o[0] = 1; o[1] = 1.62; o[2] = 2; },
    aimDir: (d: number[]) => { d[0] = 0; d[1] = 0.5; d[2] = 0.866; },
  } as unknown as LocalPlayer;
  const t = new Throwing(conn, player);
  const events: string[] = [];
  t.onPrime = (k) => events.push(`prime:${k}`);
  t.onThrow = (k) => events.push(`throw:${k}`);
  t.onCancel = () => events.push("cancel");
  t.syncFrom({ lethal: "frag", lethalCount: 2, tactical: "flash", tacticalCount: 1, ...wallet } as NetPlayer);
  return { t, sent, events, player };
}

const run = (t: Throwing, from: number, to: number, step = 16) => { for (let n = from; n <= to; n += step) t.update(n); };

describe("Throwing (client grenade controller)", () => {
  it("cannot be primed during the frozen preparation window, and does not cook through it", () => {
    // The server refuses the throw regardless (drop 7). What this stops is the CLIENT priming and
    // cooking anyway: the pin comes out during a countdown nobody can be hurt in, and the player is
    // released holding a fully cooked frag they never chose to hold.
    const { t, sent, events, player } = rig();
    (player as unknown as { frozen: boolean }).frozen = true;
    t.pressLethal(1000);
    run(t, 1000, 3000);
    expect(events).toEqual([]);
    expect(t.state.kind).toBeNull();
    expect(t.state.cook).toBe(0);
    expect(sent).toEqual([]);
    // Released: the very next press works, with a fresh cook.
    (player as unknown as { frozen: boolean }).frozen = false;
    t.pressLethal(3100);
    expect(t.state.kind).toBe("frag");
    expect(t.state.cook).toBe(0);
  });

  it("cooks a frag while G is held and sends the cook time (including the wind-up) on release", () => {
    const { t, sent, events } = rig();
    t.pressLethal(1000);
    expect(events).toEqual(["prime:frag"]);
    run(t, 1000, 1800);
    expect(t.state.kind).toBe("frag");
    expect(t.state.cook).toBeCloseTo(800 / GRENADES.frag.fuseMs, 1);
    expect(sent.length).toBe(0);
    t.releaseLethal(1800);
    expect(events.at(-1)).toBe("throw:frag");
    run(t, 1800, 1800 + THROW_WINDUP_MS + 32);
    expect(sent.length).toBe(1);
    expect(sent[0].type).toBe(C2S.Throw);
    expect(sent[0].msg.kind).toBe("frag");
    expect(sent[0].msg.cookMs).toBe(800 + THROW_WINDUP_MS);
    // Release point is near the eye (the server allows 2.5 m) and the direction is the aim.
    expect(Math.hypot(sent[0].msg.o[0] - 1, sent[0].msg.o[1] - 1.62, sent[0].msg.o[2] - 2)).toBeLessThan(0.6);
    expect(sent[0].msg.d).toEqual([0, 0.5, 0.866]);
    expect(t.state.kind).toBeNull();
    expect(t.lethalCount).toBe(1); // optimistic
  });

  it("auto-releases a frag before the fuse so it never explodes in the hand", () => {
    const { t, sent } = rig();
    t.pressLethal(0);
    run(t, 0, GRENADES.frag.fuseMs + 200);
    expect(sent.length).toBe(1);
    // The server treats cook >= fuse − 50 as an in-hand detonation: we must stay clear of that.
    expect(sent[0].msg.cookMs).toBeLessThan(GRENADES.frag.fuseMs - 50);
    expect(sent[0].msg.cookMs).toBeGreaterThan(GRENADES.frag.fuseMs - 600);
  });

  it("non-cookable lethals and tacticals throw on press; empty slots and the rate limit refuse", () => {
    const { t, sent } = rig({ lethal: "knife", lethalCount: 1 });
    t.pressLethal(0);
    run(t, 0, THROW_WINDUP_MS + 32);
    expect(sent.map((s) => s.msg.kind)).toEqual(["knife"]);
    expect(sent[0].msg.cookMs).toBe(0);
    // Slot now empty (optimistic): a second press does nothing.
    t.pressLethal(300); run(t, 300, 600);
    expect(sent.length).toBe(1);
    // Tactical inside the throw interval is refused, after it goes.
    t.pressTactical(400); run(t, 400, 700);
    expect(sent.length).toBe(1);
    const later = THROW_WINDUP_MS + THROW_INTERVAL_MS + 50;
    t.pressTactical(later); run(t, later, later + THROW_WINDUP_MS + 32);
    expect(sent.map((s) => s.msg.kind)).toEqual(["knife", "flash"]);
  });

  it("death drops the grenade without a throw", () => {
    const { t, sent, events, player } = rig();
    t.pressLethal(0);
    run(t, 0, 500);
    player.alive = false;
    t.update(516);
    expect(events).toEqual(["prime:frag", "cancel"]);
    expect(sent.length).toBe(0);
    expect(t.state.kind).toBeNull();
  });
});
