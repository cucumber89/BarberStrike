import { describe, expect, it } from "vitest";
import { inviteLink, isSharedOrigin, parseInvite, suggestRoomName } from "./invite";

describe("invite links", () => {
  it("round-trips a room and a mode through the page URL", () => {
    const link = inviteLink("https://play.example.com/index.html?old=1#x", "late shift", "dom");
    expect(link).toBe("https://play.example.com/index.html?room=late+shift&mode=dom");
    expect(parseInvite(new URL(link).search)).toEqual({ room: "late shift", mode: "dom", join: null });
  });

  it("ignores garbage without throwing", () => {
    expect(parseInvite("")).toEqual({ room: "", mode: null, join: null });
    expect(parseInvite("?mode=banana&room=%20%20&join=")).toEqual({ room: "", mode: null, join: null });
    expect(parseInvite("?room=" + "x".repeat(60)).room).toHaveLength(24);
    expect(parseInvite("?join=abc123").join).toBe("abc123");
  });

  it("leaves the room out when there is none, so quick play still matches anyone", () => {
    expect(inviteLink("http://192.168.1.4:2567/", "  ", "tdm")).toBe("http://192.168.1.4:2567/?mode=tdm");
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
