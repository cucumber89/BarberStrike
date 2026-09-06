import { describe, expect, it } from "vitest";
import { BOMB, BOMB_SITES, blastDamage, dropBomb, insideSite, resetBomb, siteAt, stepBomb, type BombData, type BombPlayer } from "./bomb";
const A = BOMB_SITES[0];
const player = (id: string, team: number): BombPlayer => ({ id, team, alive: true, connected: true, x: A.x, y: A.y, z: A.z, using: false });
const empty = (): BombData => ({ round: 0, attackTeam: 0, stage: "idle", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0, actor: "", progress: 0, result: "", droppedBy: "", droppedAt: 0 });
function setup() {
  const players = [player("a", 0), player("b", 1), player("c", 0)];
  players[2].x = -10;
  const b = empty();
  resetBomb(b, 1000, players, () => 0); return { b, players };
}
describe("bomb objective", () => {
  it("requires an uninterrupted plant and resets when released", () => {
    const { b, players } = setup(); players[0].using = true;
    stepBomb(b, players, 2000, 1000); expect(b.progress).toBeCloseTo(1000 / BOMB.plantMs);
    players[0].using = false; stepBomb(b, players, 2100, 100); expect(b.progress).toBe(0);
    players[0].using = true; stepBomb(b, players, 5000, BOMB.plantMs); expect(b.stage).toBe("planted"); expect(b.endsAt).toBe(45000);
  });
  it("plants where the planter stands, anywhere inside the zone, never outside it", () => {
    const { b, players } = setup();
    players[0].x = A.x + A.hw - 0.2; players[0].z = A.z - A.hd + 0.2; players[0].using = true;
    stepBomb(b, players, 5000, BOMB.plantMs);
    expect(b.stage).toBe("planted"); expect(b.site).toBe("A");
    expect(b.x).toBeCloseTo(A.x + A.hw - 0.2); expect(b.z).toBeCloseTo(A.z - A.hd + 0.2);
    const { b: b2, players: p2 } = setup();
    p2[0].x = A.x + A.hw + 0.5; p2[0].using = true;
    stepBomb(b2, p2, 5000, BOMB.plantMs);
    expect(b2.stage).toBe("carried"); expect(b2.progress).toBe(0);
    expect(siteAt(p2[0])).toBeUndefined();
    expect(insideSite({ x: A.x, y: A.y + 3, z: A.z }, A), "a roof above the site is not the site").toBe(false);
  });
  it("keeps the fuse running after all attackers die", () => {
    const { b, players } = setup(); players[0].using = true; stepBomb(b, players, 4000, BOMB.plantMs);
    players[0].alive = players[2].alive = false;
    expect(stepBomb(b, players, 5000, 1000)).toBeNull();
    expect(stepBomb(b, players, b.endsAt, 100)).toBe(0);
  });
  it("only living defenders next to the charge can defuse, and cannot finish after the fuse", () => {
    const { b, players } = setup(); players[0].using = true; stepBomb(b, players, 4000, BOMB.plantMs);
    expect(stepBomb(b, players, 5000, BOMB.defuseMs)).toBeNull();
    players[1].using = true;
    players[1].x = b.x + BOMB.defuseRadius + 0.5; stepBomb(b, players, 6000, 100); expect(b.progress).toBe(0);
    players[1].x = b.x + 0.5;
    expect(stepBomb(b, players, 10000, BOMB.defuseMs)).toBe(1);
    expect(b.result).toBe("BOMB DEFUSED");
    expect(stepBomb(b, players, 11000, BOMB.defuseMs)).toBeNull();
  });
  it("a defuse kit halves the defuse", () => {
    const { b, players } = setup(); players[0].using = true; stepBomb(b, players, 4000, BOMB.plantMs);
    players[1].using = true; players[1].kit = true; players[1].x = b.x + 0.5;
    stepBomb(b, players, 5000, BOMB.defuseKitMs / 2); expect(b.progress).toBeCloseTo(0.5);
    expect(stepBomb(b, players, 6000, BOMB.defuseKitMs / 2)).toBe(1);
  });
  it("drops on death and lets another attacker recover the charge", () => {
    const { b, players } = setup(); players[0].alive = false;
    stepBomb(b, players, 2000, 100); expect(b.stage).toBe("dropped");
    players[2].x = b.x; stepBomb(b, players, 2100, 100); expect(b.carrier).toBe("c");
  });
  it("can be dropped on purpose and handed to a teammate, but not scooped straight back", () => {
    const { b, players } = setup();
    expect(dropBomb(b, "b", 2000), "a defender holds nothing").toBe(false);
    expect(dropBomb(b, "a", 2000, [1, 0])).toBe(true);
    expect(b.stage).toBe("dropped"); expect(b.x).toBeCloseTo(A.x + 0.6);
    stepBomb(b, players, 2100, 100);
    expect(b.stage, "the dropper is still standing on it").toBe("dropped");
    players[2].x = b.x; stepBomb(b, players, 2200, 100);
    expect(b.carrier).toBe("c");
    dropBomb(b, "c", 2300); players[2].x = -10;
    stepBomb(b, players, 2400, 100);
    expect(b.carrier, "the previous dropper, still next to it, may take it back").toBe("a");
    expect(dropBomb(b, "a", 3000)).toBe(true);
    for (let t = 3100; t < 6000; t += 100) stepBomb(b, players, t, 100);
    expect(b.stage, "no timer hands it back while the dropper camps on it").toBe("dropped");
    players[0].x = b.x + BOMB.redropLeaveRadius + 0.3; stepBomb(b, players, 6100, 100);
    expect(b.droppedBy, "stepping away clears the bar").toBe("");
    players[0].x = b.x; stepBomb(b, players, 6200, 100);
    expect(b.carrier, "walking back over it picks it up again").toBe("a");
    expect(dropBomb(b, "a", 6300)).toBe(true);
    expect(stepBomb(b, players, b.roundEndsAt, 100), "a charge left on the floor is a lost round").toBe(1);
  });
  it("the blast is certain death near the charge, a graze at the edge, nothing beyond", () => {
    expect(blastDamage(0)).toBe(BOMB.blastDamage); expect(blastDamage(BOMB.blastLethal)).toBe(BOMB.blastDamage);
    expect(blastDamage(12)).toBeGreaterThanOrEqual(100);
    expect(blastDamage(20)).toBeLessThan(40); expect(blastDamage(20)).toBeGreaterThan(0);
    expect(blastDamage(BOMB.blastRadius)).toBe(0); expect(blastDamage(40)).toBe(0);
  });
  it("awards the defence an unplanted timeout, hands the charge to a random attacker and swaps sides only at halftime", () => {
    const { b, players } = setup(); expect(stepBomb(b, players, b.roundEndsAt, 100)).toBe(1);
    resetBomb(b, 100000, players, () => 0); expect(b.round).toBe(2); expect(b.attackTeam).toBe(0); expect(b.carrier).toBe("a");
    resetBomb(b, 100000, players, () => 0.99); expect(b.carrier).toBe("c");
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) { b.round = 0; resetBomb(b, 100000, players); seen.add(b.carrier); }
    expect([...seen].sort()).toEqual(["a", "c"]);
    b.round = BOMB.halfRounds; resetBomb(b, 200000, players, () => 0); expect(b.attackTeam).toBe(1); expect(b.carrier).toBe("b");
  });
});
