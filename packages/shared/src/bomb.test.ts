import { describe, expect, it } from "vitest";
import { BOMB, BOMB_SITES, resetBomb, stepBomb, type BombData, type BombPlayer } from "./bomb";
const player = (id: string, team: number): BombPlayer => ({ ...BOMB_SITES[0], id, team, alive: true, connected: true, using: false });
function setup() {
  const players = [player("a", 0), player("b", 1), player("c", 0)];
  players[2].x = -10;
  const b: BombData = { round: 0, attackTeam: 0, stage: "idle", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0, actor: "", progress: 0, result: "" };
  resetBomb(b, 1000, players); return { b, players };
}
describe("bomb objective", () => {
  it("requires an uninterrupted plant and resets when released or occluded", () => {
    const { b, players } = setup(); players[0].using = true;
    stepBomb(b, players, 2000, 1000); expect(b.progress).toBeCloseTo(1000 / BOMB.plantMs);
    players[0].using = false; stepBomb(b, players, 2100, 100); expect(b.progress).toBe(0);
    players[0].using = true; stepBomb(b, players, 4000, BOMB.plantMs, () => false); expect(b.stage).toBe("carried");
    stepBomb(b, players, 5000, BOMB.plantMs); expect(b.stage).toBe("planted"); expect(b.endsAt).toBe(45000);
  });
  it("keeps the fuse running after all attackers die", () => {
    const { b, players } = setup(); players[0].using = true; stepBomb(b, players, 4000, BOMB.plantMs);
    players[0].alive = players[2].alive = false;
    expect(stepBomb(b, players, 5000, 1000)).toBeNull();
    expect(stepBomb(b, players, b.endsAt, 100)).toBe(0);
  });
  it("only living defenders can defuse, and cannot finish after the fuse", () => {
    const { b, players } = setup(); players[0].using = true; stepBomb(b, players, 4000, BOMB.plantMs);
    expect(stepBomb(b, players, 5000, BOMB.defuseMs)).toBeNull();
    players[1].using = true;
    expect(stepBomb(b, players, 10000, BOMB.defuseMs)).toBe(1);
    expect(b.result).toBe("BOMB DEFUSED");
    expect(stepBomb(b, players, 11000, BOMB.defuseMs)).toBeNull();
  });
  it("drops on death and lets another attacker recover the charge", () => {
    const { b, players } = setup(); players[0].alive = false;
    stepBomb(b, players, 2000, 100); expect(b.stage).toBe("dropped");
    players[2].x = b.x; stepBomb(b, players, 2100, 100); expect(b.carrier).toBe("c");
  });
  it("awards the defence an unplanted timeout and swaps sides only at halftime", () => {
    const { b, players } = setup(); expect(stepBomb(b, players, b.roundEndsAt, 100)).toBe(1);
    resetBomb(b, 100000, players); expect(b.round).toBe(2); expect(b.attackTeam).toBe(0); expect(b.carrier).toBe("a");
    b.round = BOMB.halfRounds; resetBomb(b, 200000, players); expect(b.attackTeam).toBe(1); expect(b.carrier).toBe("b");
  });
});
