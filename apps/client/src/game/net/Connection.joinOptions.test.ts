import { describe, expect, it } from "vitest";
import { DEFAULT_HAIRCUT, DEFAULT_MAP_ID, HAIRCUTS, MAP_ORDER } from "@frankibarber/shared";
import { joinOptions } from "./Connection";

/**
 * What the lobby sends the room. A map the player picked that never leaves the menu is the whole
 * failure this covers: the pick has to be IN the join options, next to the mode.
 */
describe("join options", () => {
  it("takes skins as a pure parameter, with factory finish as the default", () => {
    expect(joinOptions({ url: "ws://x", name: "frank" }, 1, "cap", "pistol=osy").skins).toBe("pistol=osy");
    expect(joinOptions({ url: "ws://x", name: "frank" }, 1).skins).toBe("");
  });
  it("carries the picked map to the room, next to the mode (Drop G)", () => {
    for (const mapId of MAP_ORDER) {
      const opts = joinOptions({ url: "ws://x", name: "frank", gameMode: "bomb", mapId }, 1);
      expect(opts.map).toBe(mapId);
      expect(opts.mode).toBe("bomb");
    }
  });

  it("plays the map it has always played when the lobby picks none", () => {
    const opts = joinOptions({ url: "ws://x", name: "frank" }, 1);
    expect(opts.map).toBe(DEFAULT_MAP_ID);
    expect(opts.map).toBe("night_district");
    expect(opts).toEqual({ deferSpawn: true, boysClass: 1, name: "frank", room: "", mode: "tdm", map: "night_district", bots: 0, botLevel: "normal", haircut: DEFAULT_HAIRCUT, skins: "" });
  });

  it("carries the equipped haircut too, and wears the cap when nobody says otherwise (Drop E)", () => {
    // The haircut is a PARAMETER rather than a read of the profile inside `joinOptions`, which is
    // what keeps this contract testable without a browser — the same property Drop G built it for.
    for (const h of HAIRCUTS) {
      expect(joinOptions({ url: "ws://x", name: "frank" }, 1, h.id).haircut).toBe(h.id);
    }
    expect(joinOptions({ url: "ws://x", name: "frank" }, 1).haircut).toBe(DEFAULT_HAIRCUT);
  });
});
