import { describe, expect, it } from "vitest";
import { BOMB, BOMB_SITES, bombAttackTeam, bombSpawnSide, resetBomb, stepBomb, type BombData, type BombPlayer } from "./bomb";
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

/**
 * Two rules that only fire in the awkward cases, and were both wrong there.
 *
 * A round is decided by asking two questions in an order, and the order was the wrong way round when
 * the answer to both was "nobody". The bomb's resting place had a `?? 0` in it, and `0` on a map is
 * a real coordinate.
 */
describe("bomb objective, the awkward cases", () => {
  const wipe = (players: BombPlayer[]) => { for (const p of players) p.alive = false; };

  it("gives a mutual wipe with no bomb down to the DEFENDERS", () => {
    // One frag kills the last attacker and the last defender on the same tick. Nobody planted
    // anything, so the attack failed — it used to be scored as "DEFENDERS ELIMINATED" and won by a
    // team that had just been wiped itself.
    const { b, players } = setup();
    expect(b.stage).toBe("carried");
    wipe(players);
    const winner = stepBomb(b, players, 2000, 16);
    expect(winner).toBe(1 - b.attackTeam);
    expect(b.result).toBe("ATTACKERS ELIMINATED");
  });

  it("still gives the round to the attackers when only the defenders die", () => {
    const { b, players } = setup();
    players[1].alive = false; // the only defender
    expect(stepBomb(b, players, 2000, 16)).toBe(b.attackTeam);
    expect(b.result).toBe("DEFENDERS ELIMINATED");
  });

  it("detonates a planted bomb when the last defender dies, whatever the timer says", () => {
    const { b, players } = setup();
    players[0].using = true;
    stepBomb(b, players, 4000, BOMB.plantMs);
    stepBomb(b, players, 5000, BOMB.plantMs);
    expect(b.stage).toBe("planted");
    players[1].alive = false;
    expect(stepBomb(b, players, 6000, 16)).toBe(b.attackTeam);
  });

  it("never leaves the bomb at the world origin when nobody can carry it", () => {
    const players = [player("a", 0), player("b", 1)];
    players[0].x = 40; players[0].y = 2; players[0].z = -12;
    const b: BombData = { round: 0, attackTeam: 0, stage: "idle", carrier: "", site: "", x: 0, y: 0, z: 0, endsAt: 0, roundEndsAt: 0, actor: "", progress: 0, result: "" };
    // The attacker is connected but has not respawned yet — a real state on the reset paths that do
    // not respawn first. The bomb belongs where they are, not at (0, 0, 0).
    players[0].alive = false;
    resetBomb(b, 1000, players);
    expect(b.stage).toBe("dropped");
    expect(b.carrier).toBe("");
    expect([b.x, b.y, b.z]).toEqual([40, 2, -12]);

    // And with no attacker at all it stays where it was rather than teleporting to the origin.
    b.x = 7; b.y = 1; b.z = 3;
    resetBomb(b, 2000, [player("b", 1)]);
    expect([b.x, b.y, b.z]).toEqual([7, 1, 3]);
  });
});

/**
 * The asymmetric map is fair because the SIDE follows the ROLE, not the team. This pins it: over a
 * full twelve rounds each team spends six on the south set and six on the north, so neither keeps
 * the north set's 22 m head start to site B or the south set's two buy stations. The owner chose
 * this over moving the sites (2026-09-10), and it is one expression in TdmRoom that could be
 * "simplified" back to `p.team` without anything else noticing.
 */
describe("which side of the map a team spawns on", () => {
  it("gives each team half the rounds on each set across a full match", () => {
    const rounds = Array.from({ length: BOMB.maxRounds }, (_, i) => i + 1);
    for (const team of [0, 1] as const) {
      const south = rounds.filter((r) => bombSpawnSide(team, bombAttackTeam(r)) === 0).length;
      expect(south, `team ${team} plays ${south} of ${BOMB.maxRounds} rounds on the south set`).toBe(BOMB.maxRounds / 2);
    }
  });

  it("always puts the attacker on the south set and the defender on the north", () => {
    for (const round of [1, 6, 7, 12]) {
      const atk = bombAttackTeam(round);
      expect(bombSpawnSide(atk, atk)).toBe(0);
      expect(bombSpawnSide((1 - atk) as 0 | 1, atk)).toBe(1);
    }
  });

  it("never leaves both teams on the same set", () => {
    for (const round of [1, 6, 7, 12]) {
      const atk = bombAttackTeam(round);
      expect(bombSpawnSide(0, atk)).not.toBe(bombSpawnSide(1, atk));
    }
  });
});
