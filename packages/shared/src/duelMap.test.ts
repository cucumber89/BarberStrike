import { describe, expect, it } from "vitest";
import { DUEL_MAP_ID, DUEL_MAP_IDS, MAP_ORDER, MAPS, duelMapOf } from "./map";

/**
 * Drop W (P1): which map a 1 v 1 really plays. The server room, the loading card and the menu all
 * ask `duelMapOf`, so the contract is pinned once here: both arenas are honoured, everything else
 * falls to the default, and the default is DOLNA — the owner's brief of 2026-09-26 — while DOLNA
 * stays out of the other modes' menus (`MAP_ORDER`).
 */
describe("duelMapOf", () => {
  it("honours either duel arena as asked", () => {
    expect(duelMapOf("dolna")).toBe("dolna");
    expect(duelMapOf("gora")).toBe("gora");
    for (const id of DUEL_MAP_IDS) expect(duelMapOf(id)).toBe(id);
  });

  it("puts an unknown map, the district, an empty string and nothing on the default", () => {
    expect(duelMapOf(undefined)).toBe(DUEL_MAP_ID);
    expect(duelMapOf("")).toBe(DUEL_MAP_ID);
    expect(duelMapOf("night_district")).toBe(DUEL_MAP_ID);
    expect(duelMapOf("no-such-map")).toBe(DUEL_MAP_ID);
  });

  it("defaults to DOLNA, lists DOLNA first, and lists only maps the build has", () => {
    expect(DUEL_MAP_ID).toBe("dolna");
    expect(DUEL_MAP_IDS[0]).toBe(DUEL_MAP_ID);
    expect(DUEL_MAP_IDS).toContain("gora");
    expect(new Set(DUEL_MAP_IDS).size).toBe(DUEL_MAP_IDS.length);
    for (const id of DUEL_MAP_IDS) expect(MAPS[id]?.id, id).toBe(id);
  });

  it("keeps DOLNA out of the shared menu order: duel and tournament only for now", () => {
    expect(MAP_ORDER).not.toContain("dolna");
    expect(MAP_ORDER).toContain("gora");
  });
});
