import { describe, expect, it } from "vitest";
import { DEFAULT_MAP_ID, MAPS, MAP_ORDER } from "@frankibarber/shared";
import { inviteLink, isSharedOrigin, mapChoices, parseInvite, roomFromPath, suggestRoomName } from "./invite";

describe("invite links", () => {
  it("round-trips a room, a mode and a map through the page address as /r/<room>?mode=&map= (Drop D/G)", () => {
    const link = inviteLink("https://barberstrike.click/index.html?old=1#x", "late shift", "dom");
    expect(link).toBe("https://barberstrike.click/r/late%20shift?mode=dom&map=night_district");
    const u = new URL(link);
    expect(parseInvite(u.search, u.pathname)).toEqual({ room: "late shift", mode: "dom", map: "night_district", join: null, viaLink: true });
  });

  it("carries the picked map to whoever opens the link (Drop G)", () => {
    const link = inviteLink("https://barberstrike.click/", "late-shift", "bomb", "gora");
    expect(link).toBe("https://barberstrike.click/r/late-shift?mode=bomb&map=gora");
    const u = new URL(link);
    expect(parseInvite(u.search, u.pathname).map).toBe("gora");
    // A map this build does not have is no map at all: the lobby falls back to its default.
    expect(parseInvite("?map=banana").map).toBeNull();
    expect(parseInvite("?mode=tdm").map).toBeNull();
    expect(inviteLink("https://barberstrike.click/", "", "tdm", "banana")).toBe(`https://barberstrike.click/?mode=tdm&map=${DEFAULT_MAP_ID}`);
  });

  it("offers every map the build has, in the shared order and under the name the map calls itself", () => {
    expect(mapChoices()).toEqual(MAP_ORDER.map((id) => ({ id, name: MAPS[id].name })));
    expect(mapChoices().map((m) => m.id)).toEqual(["night_district", "gora"]);
    expect(mapChoices().map((m) => m.name)).toEqual(["Night District", "GÓRA (THE FLAT)"]);
  });

  it("still reads the older ?room= query, which is not a link join", () => {
    expect(parseInvite("?room=late-shift&mode=dom", "/")).toEqual({ room: "late-shift", mode: "dom", map: null, join: null, viaLink: false });
  });

  it("the path wins over the query for the room; the mode comes from the query alone", () => {
    expect(parseInvite("?room=other&mode=gungame", "/r/late-shift")).toEqual({ room: "late-shift", mode: "gungame", map: null, join: null, viaLink: true });
    expect(parseInvite("", "/r/late-shift").mode).toBeNull();
  });

  it("knows every mode the lobby offers, including the Drop D ones", () => {
    expect(parseInvite("?mode=gungame").mode).toBe("gungame");
    expect(parseInvite("?mode=ostrzyzeni").mode).toBe("ostrzyzeni");
  });

  it("reads only /r/<one segment>, undoes percent-encoding, and never throws", () => {
    expect(roomFromPath("/r/late-shift")).toBe("late-shift");
    expect(roomFromPath("/r/late-shift/")).toBe("late-shift");
    expect(roomFromPath("/r/late%20shift")).toBe("late shift");
    expect(roomFromPath("/r/100%")).toBe("100%");
    expect(roomFromPath("/r/")).toBe("");
    expect(roomFromPath("/r/a/b")).toBe("");
    expect(roomFromPath("/rooms")).toBe("");
    expect(roomFromPath("/")).toBe("");
    expect(roomFromPath("/r/" + "x".repeat(60))).toHaveLength(24);
  });

  it("ignores garbage without throwing", () => {
    expect(parseInvite("")).toEqual({ room: "", mode: null, map: null, join: null, viaLink: false });
    expect(parseInvite("?mode=banana&map=banana&room=%20%20&join=")).toEqual({ room: "", mode: null, map: null, join: null, viaLink: false });
    expect(parseInvite("?room=" + "x".repeat(60)).room).toHaveLength(24);
    expect(parseInvite("?join=abc123").join).toBe("abc123");
  });

  it("leaves the room out when there is none, so quick play still matches anyone", () => {
    expect(inviteLink("http://192.168.1.4:2567/", "  ", "tdm")).toBe("http://192.168.1.4:2567/?mode=tdm&map=night_district");
    // A link made from a link does not nest paths.
    expect(inviteLink("https://barberstrike.click/r/old?mode=ffa", "new", "ffa", "gora")).toBe("https://barberstrike.click/r/new?mode=ffa&map=gora");
  });

  it("suggests a readable, deterministic name for a fixed generator", () => {
    let i = 0;
    const seq = [0.05, 0.15, 0.5];
    const name = suggestRoomName(() => seq[i++ % seq.length]);
    expect(name).toMatch(/^[a-z]+-[a-z]+-\d\d$/);
    expect(suggestRoomName(() => 0.999)).toMatch(/^loud-comb-99$/);
  });

  it("knows which origins other people can open", () => {
    expect(isSharedOrigin({ protocol: "http:", hostname: "localhost", port: "2567" })).toBe(false);
    expect(isSharedOrigin({ protocol: "http:", hostname: "127.0.0.1", port: "" })).toBe(false);
    expect(isSharedOrigin({ protocol: "http:", hostname: "192.168.1.7", port: "5174" })).toBe(false);
    expect(isSharedOrigin({ protocol: "http:", hostname: "192.168.1.7", port: "2567" })).toBe(true);
    expect(isSharedOrigin({ protocol: "https:", hostname: "mild-fox.trycloudflare.com", port: "" })).toBe(true);
    expect(isSharedOrigin({ protocol: "https:", hostname: "sd89-barberstrike.hf.space", port: "" })).toBe(true);
  });
});
