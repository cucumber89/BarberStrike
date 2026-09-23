import { describe, expect, it } from "vitest";
import { DEFAULT_HAIRCUT, DEFAULT_MAP_ID, HAIRCUTS, MAP_ORDER } from "@frankibarber/shared";
import { errorEndsMatch, joinOptions } from "./Connection";

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
    expect(opts).toEqual({ deferSpawn: true, boysClass: 1, name: "frank", room: "", mode: "tdm", map: "night_district", bots: 0, botLevel: "normal", haircut: DEFAULT_HAIRCUT, skins: "", spectator: false });
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

/**
 * A watcher's join has to be unmistakable at the far end: the room decides whether to build a
 * `PlayerState` from this one boolean, so it is always sent and always a boolean.
 */
it("says plainly whether this client wants to play or to watch", () => {
  const base = { url: "ws://x", name: "Widz" };
  expect(joinOptions(base, 1).spectator).toBe(false);
  expect(joinOptions({ ...base, spectator: true }, 1).spectator).toBe(true);
  expect(joinOptions({ ...base, spectator: false }, 1).spectator).toBe(false);
  // The rest of the join is unchanged by it — a viewer still names the room it wants to watch.
  expect(joinOptions({ ...base, spectator: true, roomName: "finał" }, 1).room).toBe("finał");
});

/**
 * A dropped socket is not a lost match. The SDK reconnects on its own and reports each failed
 * attempt as an error with no code; the client used to end the match on the first of them.
 *
 * MEASURED on a 1.5 s outage before this rule existed (`e2e/tools/reconnect.mjs`): the player was
 * in the menu at 1.0 s, and the SDK's retry chain then reconnected at 3.7 s into a room nobody was
 * holding. After: "reconnecting" in the HUD, the same session back, still alive, inputs acked
 * (39 -> 48).
 */
describe("what ends a match", () => {
  it("ignores the noise of a reconnection in progress, and nothing else", () => {
    expect(errorEndsMatch(true), "the SDK is retrying: not fatal").toBe(false);
    expect(errorEndsMatch(false), "a real error with nothing being retried").toBe(true);
    // `reconnection` is optional on the room; an SDK that does not have it behaves as before.
    expect(errorEndsMatch(undefined)).toBe(true);
  });
});
