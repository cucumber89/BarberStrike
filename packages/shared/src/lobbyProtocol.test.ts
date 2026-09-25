import { describe, expect, it } from "vitest";
import {
  LOBBY_CHAT_MAX_LEN, LOBBY_CHAT_MIN_INTERVAL_MS, TOURNAMENT_MAX_ENTRANTS,
  TOURNAMENT_MAX_SPECTATORS_TOTAL, sanitizeChat,
} from "./lobbyProtocol";

describe("lobby protocol constants (D8, §3.3)", () => {
  it("pins the production caps and chat limits", () => {
    expect(TOURNAMENT_MAX_ENTRANTS).toBe(32);
    expect(TOURNAMENT_MAX_SPECTATORS_TOTAL).toBe(96);
    expect(LOBBY_CHAT_MAX_LEN).toBe(200);
    expect(LOBBY_CHAT_MIN_INTERVAL_MS).toBe(1000);
  });
});

describe("sanitizeChat", () => {
  it("truncates anything longer than 200 characters", () => {
    const out = sanitizeChat("a".repeat(500));
    expect(out).toHaveLength(200);
    expect(out).toBe("a".repeat(200));
  });

  it("escapes < > & so <b> cannot survive as a tag", () => {
    const out = sanitizeChat("<b>x</b>");
    expect(out).toBe("&lt;b&gt;x&lt;/b&gt;");
    expect(out).not.toContain("<b>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
  });

  it("escapes an ampersand before the entities it produces (no double-escape)", () => {
    expect(sanitizeChat("a & b")).toBe("a &amp; b");
    expect(sanitizeChat("<")).toBe("&lt;");
  });

  it("strips control characters", () => {
    expect(sanitizeChat("a\u0001b\u0007c\u007fd")).toBe("abcd");
  });

  it("truncates BEFORE escaping, so a long line cannot balloon past the cap on the wire", () => {
    // 200 '<' become 200 '&lt;' — the point is the stored text is bounded at 200 raw chars first.
    const out = sanitizeChat("<".repeat(400));
    expect(out).toBe("&lt;".repeat(200));
  });

  it("is safe on non-string input", () => {
    // @ts-expect-error deliberately wrong type — server data can be anything
    expect(sanitizeChat(undefined)).toBe("");
    // @ts-expect-error deliberately wrong type
    expect(sanitizeChat(null)).toBe("");
  });
});
