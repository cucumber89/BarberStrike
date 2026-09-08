import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BOMB, BOMB_SITES, C2S, DEFAULT_MAP_ID, MAPS, MATCH, MatchPhase, S2C, planOffer, sitesOf,
  type PlanEvent,
} from "@frankibarber/shared";
import { RoomHarness, type FakeClient } from "./testHarness";

/**
 * DROP G: the server runs a room on either map.
 *
 * Everything here is about the ROOM taking its map from its create options rather than from a
 * module constant: what it replicates, where it spawns people, where the bomb may be planted, and
 * which of the map-shaped mechanics are on. Night District's own behaviour is covered by the rest
 * of the suite; these are the assertions that only hold once the map is a variable.
 */
const GORA = MAPS.gora;
const NIGHT = MAPS[DEFAULT_MAP_ID];

let h: RoomHarness;
beforeEach(() => vi.useFakeTimers());
afterEach(async () => { await h?.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

const clientFor = (id: string): FakeClient => {
  const c = h.clients.find((x) => x.sessionId === id);
  if (!c) throw new Error(`no client ${id}`);
  return c;
};

/** Holds the objective key the way a real client does: one message per 100 ms of match time. */
async function hold(c: FakeClient, ms: number): Promise<void> {
  for (let t = 0; t < ms; t += 100) { h.send(c, "objective", true); await h.advance(100); }
}

describe("a room on GÓRA", () => {
  it("builds the chosen map, replicates its id and spawns players on its points", async () => {
    h = await RoomHarness.create({ room: "gora-build", map: "gora" });
    const a = await h.join("Alpha"), b = await h.join("Bravo");
    expect(h.map.id).toBe("gora");
    expect(h.state.mapId).toBe("gora");
    // The lobby and the matchmaker both read this, and it has to be the ID: `filterBy` compares it
    // against a client's `map` option, so a display name there would match nothing.
    expect(h.room.metadata.map).toBe("gora");
    // The room's own collision world is GÓRA's geometry, not the other map's.
    expect(h.world.boxes.length).toBe(GORA.solids.length);
    expect(GORA.solids.length).not.toBe(NIGHT.solids.length);
    for (const c of [a, b]) {
      const p = h.player(c.sessionId);
      expect(p.alive).toBe(true);
      expect(GORA.spawns.some((s) => s.team === p.team && s.x === p.x && s.z === p.z),
        "a player must start on one of GÓRA's own team spawns").toBe(true);
      expect(NIGHT.spawns.some((s) => s.x === p.x && s.z === p.z)).toBe(false);
    }
    expect(h.room.handlerErrors).toBe(0);
  });

  it("falls back to the default map for a missing or unknown id", async () => {
    h = await RoomHarness.create({ room: "gora-bad", map: "no_such_map" });
    expect(h.map.id).toBe(DEFAULT_MAP_ID);
    expect(h.state.mapId).toBe(DEFAULT_MAP_ID);
    expect(h.room.metadata.map).toBe(DEFAULT_MAP_ID);
  });

  it("plants at one of GÓRA's sites, never at Night District's", async () => {
    h = await RoomHarness.create({ room: "gora-bomb", mode: "bomb", map: "gora", bots: 0 });
    await h.join("Alpha"); await h.join("Bravo");
    await h.advance(MATCH.countdownMs + BOMB.buyMs + 200);
    expect(h.state.phase).toBe(MatchPhase.Playing);
    const sites = sitesOf(GORA);
    expect(sites).not.toBe(BOMB_SITES);
    const site = sites[1];
    const carrier = h.state.bomb.carrier;
    expect(carrier).not.toBe("");
    await h.place(carrier, { x: site.x, y: site.y, z: site.z, yaw: 0, team: 0 });
    await hold(clientFor(carrier), BOMB.plantMs + 400);
    expect(h.state.bomb.stage).toBe("planted");
    expect(h.state.bomb.site).toBe(site.id);
    expect(h.state.bomb.x).toBe(site.x);
    expect(h.state.bomb.z).toBe(site.z);
    // And nowhere near DEPOT or COURTYARD, which are the coordinates the old global table held.
    for (const old of BOMB_SITES) {
      expect(Math.hypot(h.state.bomb.x - old.x, h.state.bomb.z - old.z)).toBeGreaterThan(10);
    }
    expect(h.room.handlerErrors).toBe(0);
  });

  it("offers no tactical plan, takes no vote and reshapes nothing", async () => {
    h = await RoomHarness.create({ room: "gora-plans", mode: "bomb", map: "gora", bots: 3 });
    const a = await h.join("Alpha");
    await h.advance(MATCH.countdownMs + 200);
    expect(h.state.phase).toBe(MatchPhase.Prep);
    expect(h.state.bomb.stage).toBe("buy");
    // The same round on the default map WOULD offer a choice; PLANS name Night District solids, so
    // here it must not be offered at all rather than silently removing nothing.
    const offer = planOffer(h.state.bomb.round + 1);
    expect(offer.length).toBeGreaterThan(0);
    const announced = h.broadcastsOf(S2C.Plan).map((m) => m.payload as PlanEvent);
    expect(announced.length).toBe(0);
    // A client that votes anyway (it has the same shared table) is ignored, not obeyed and not fatal.
    h.state.players.get(a.sessionId)!.team = h.state.bomb.attackTeam;
    const boxes = h.world.boxes.length;
    for (const plan of offer) { h.send(a, C2S.Vote, { plan }); await h.advance(30); }
    expect((h.room as unknown as { planVotes: Map<string, number> }).planVotes.size).toBe(0);
    // Through the freeze, where the vote would be tallied and the world rebuilt.
    await h.advance(BOMB.buyMs + 200);
    expect(h.state.phase).toBe(MatchPhase.Playing);
    expect(h.state.planId).toBe(0);
    expect(h.world.boxes.length).toBe(boxes);
    expect(h.broadcastsOf(S2C.Plan).length).toBe(0);
    expect(h.room.handlerErrors).toBe(0);
  });
});
