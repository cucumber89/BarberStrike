import { describe, expect, it } from "vitest";
import { inviteLink, isSharedOrigin, parseInvite, roomFromPath, suggestRoomName } from "./invite";

describe("invite links", () => {
  it("round-trips a room and a mode through the page address as /r/<room>?mode= (Drop D)", () => {
    const link = inviteLink("https://barberstrike.click/index.html?old=1#x", "late shift", "dom");
    expect(link).toBe("https://barberstrike.click/r/late%20shift?mode=dom");
    const u = new URL(link);
    expect(parseInvite(u.search, u.pathname)).toEqual({ room: "late shift", mode: "dom", join: null, viaLink: true });
  });

  it("still reads the older ?room= query, which is not a link join", () => {
    expect(parseInvite("?room=late-shift&mode=dom", "/")).toEqual({ room: "late-shift", mode: "dom", join: null, viaLink: false });
  });

  it("the path wins over the query for the room; the mode comes from the query alone", () => {
    expect(parseInvite("?room=other&mode=gungame", "/r/late-shift")).toEqual({ room: "late-shift", mode: "gungame", join: null, viaLink: true });
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
    expect(parseInvite("")).toEqual({ room: "", mode: null, join: null, viaLink: false });
    expect(parseInvite("?mode=banana&room=%20%20&join=")).toEqual({ room: "", mode: null, join: null, viaLink: false });
    expect(parseInvite("?room=" + "x".repeat(60)).room).toHaveLength(24);
    expect(parseInvite("?join=abc123").join).toBe("abc123");
  });

  it("leaves the room out when there is none, so quick play still matches anyone", () => {
    expect(inviteLink("http://192.168.1.4:2567/", "  ", "tdm")).toBe("http://192.168.1.4:2567/?mode=tdm");
    // A link made from a link does not nest paths.
    expect(inviteLink("https://barberstrike.click/r/old?mode=ffa", "new", "ffa")).toBe("https://barberstrike.click/r/new?mode=ffa");
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
