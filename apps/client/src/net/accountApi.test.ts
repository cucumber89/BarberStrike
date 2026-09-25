import { beforeAll, describe, expect, it } from "vitest";
import { AuthError, PROFILE_MAX_BYTES, apiUrl, profileTooBig, readError } from "./accountApi";
import { emptyProfile, type Profile } from "../game/progression/profile";

// `defaultServerUrl` reads the page `location`; there is none in the node test runner, so give it a
// minimal one. This pins `apiUrl` to a known origin (`http://localhost:2567`) rather than the host.
beforeAll(() => {
  (globalThis as { location?: unknown }).location = { protocol: "http:", hostname: "localhost", host: "localhost", port: "" };
});

/**
 * The account REST contract's pure surface — drop V (P6).
 *
 * These are the pieces the e2e (`account.mjs`, `profile.mjs`) rely on but that a live backend would
 * make slow to pin: the URL builder, the 64 kB profile guard, and the error-to-Polish mapping. The
 * `fetch` wrappers themselves are exercised by the e2e against the real P4 server.
 *
 * `defaultServerUrl` reads `location`, so `apiUrl` is asserted structurally (shape, not exact host)
 * to stay independent of the test host.
 */

describe("apiUrl", () => {
  it("mounts every path under /api/ with exactly one slash, trimming a leading slash on the path", () => {
    expect(apiUrl("me")).toMatch(/\/api\/me$/);
    expect(apiUrl("/me")).toMatch(/\/api\/me$/);
    expect(apiUrl("///login")).toMatch(/\/api\/login$/);
    // No double slash between base and /api.
    expect(apiUrl("me")).not.toMatch(/\/\/api\//);
  });

  it("carries a query string through untouched", () => {
    expect(apiUrl("tournaments?limit=50")).toMatch(/\/api\/tournaments\?limit=50$/);
    expect(apiUrl("trophies?login=frank_01")).toMatch(/\/api\/trophies\?login=frank_01$/);
  });

  it("resolves against the REST base beside the game server", () => {
    expect(apiUrl("me")).toBe("http://localhost:2567/api/me");
  });
});

describe("profileTooBig", () => {
  it("passes an ordinary profile and rejects one over 64 kB", () => {
    expect(profileTooBig(emptyProfile())).toBe(false);
    const huge: Profile = { ...emptyProfile(), badges: Array.from({ length: 20000 }, (_, i) => `b${i}`) };
    expect(profileTooBig(huge)).toBe(true);
  });

  it("draws the line at PROFILE_MAX_BYTES (64 kB)", () => {
    expect(PROFILE_MAX_BYTES).toBe(64 * 1024);
  });
});

describe("readError", () => {
  it("passes an AuthError's own message through and gives a generic Polish fallback otherwise", () => {
    expect(readError(new AuthError("Ta ksywka jest już zajęta.", 409))).toBe("Ta ksywka jest już zajęta.");
    expect(readError(new Error("boom"))).toMatch(/Serwer/);
    expect(readError("weird")).toMatch(/Serwer/);
  });

  it("keeps the status on an AuthError for the caller to branch on (409 migrate contract)", () => {
    const e = new AuthError("Konto ma już zapisany postęp — migracja pominięta.", 409);
    expect(e.status).toBe(409);
  });
});
