import { afterEach, describe, expect, it } from "vitest";
import { bracketString, mulberry32, reportWinner, seedBracket, type Bracket } from "@frankibarber/shared";
import { closeDb, useTestDb } from "../accounts/db";
import { createAccount } from "../accounts/store";
import { hashPassword } from "../accounts/hash";
import { createSession } from "../accounts/session";
import { listTournaments, trophiesForLogin } from "../accounts/store";
import {
  persistFinish, placeOf, planFinish, resolveClaim, resolveIdentity, type LobbyIdentity,
} from "./tournamentFinish";

/**
 * Tournament finish (drop V, P7): the trophy + hall-of-fame write when a bracket reaches its final.
 *
 * The lobby room hooks `planFinish`/`persistFinish` on `phase="koniec"`; here they are driven directly
 * against an in-memory account DB so the whole write is asserted without a socket — the hall-of-fame
 * row lands, the champion's trophy is `place=1`, and identity resolves both from a real session token
 * (the strong path) and from a bare login claim (the browser's cookie-only path). This is the server
 * half of the P7 acceptance: `GET /api/tournaments` +1 and `GET /api/trophies?login=<winner>` place 1.
 */

afterEach(() => closeDb());

/** A finished four-player bracket where `winner` wins every match, by entrant id. */
function finishedBracket(ids: string[], names: string[], winner: string): Bracket {
  let b = seedBracket(ids.map((id, i) => ({ id, name: names[i] })), 4, mulberry32(1));
  // Play every real pair through, always sending `winner` on when present, else the current `a`.
  let guard = 0;
  while (b.at < b.matches.length && guard++ < 20) {
    const m = b.matches[b.at];
    const through = m.a === winner || m.b === winner ? winner : m.a || m.b;
    b = reportWinner(b, through, 6, m.a === through ? 0 : 0);
  }
  return b;
}

describe("placeOf", () => {
  it("is 1 for the champion and 2 for the player it beat in the final", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const b = finishedBracket(ids, ["A", "B", "C", "D"], "p1");
    expect(placeOf(b, "p1")).toBe(1);
    // The runner-up lost the final (round = last), so places second.
    const final = b.matches[b.matches.length - 1];
    const runnerUp = final.a === "p1" ? final.b : final.a;
    expect(placeOf(b, runnerUp)).toBe(2);
  });

  it("is 0 for an id that is not in the bracket", () => {
    const b = finishedBracket(["p1", "p2", "p3", "p4"], ["A", "B", "C", "D"], "p1");
    expect(placeOf(b, "ghost")).toBe(0);
  });
});

describe("planFinish", () => {
  it("returns null for a bracket that is not over", () => {
    const b = seedBracket([{ id: "p1", name: "A" }, { id: "p2", name: "B" }], 4, mulberry32(1));
    expect(planFinish("t1", b, new Map(), bracketString(b))).toBeNull();
  });

  it("records the champion's login and a trophy per signed-in placer", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const b = finishedBracket(ids, ["Franki", "Bot", "C", "D"], "p1");
    const identities = new Map<string, LobbyIdentity>([
      ["p1", { login: "franki", accountId: 10 }],
      // p2 is signed in too but a guest for p3/p4.
      [b.matches[b.matches.length - 1].a === "p1" ? b.matches[b.matches.length - 1].b : b.matches[b.matches.length - 1].a,
        { login: "runner", accountId: 20 }],
    ]);
    const plan = planFinish("t1", b, identities, bracketString(b))!;
    expect(plan).not.toBeNull();
    expect(plan.record.winner).toBe("franki");
    expect(plan.record.size).toBe(4);
    const champ = plan.trophies.find((t) => t.login === "franki")!;
    expect(champ.place).toBe(1);
    // The signed-in runner-up earns a place-2 trophy.
    expect(plan.trophies.find((t) => t.login === "runner")?.place).toBe(2);
  });

  it("records a guest champion under their nick with no trophy", () => {
    const ids = ["p1", "p2", "p3", "p4"];
    const b = finishedBracket(ids, ["Gość", "B", "C", "D"], "p1");
    const plan = planFinish("t2", b, new Map(), bracketString(b))!;
    expect(plan.record.winner).toBe("Gość");
    expect(plan.trophies.length).toBe(0);
  });
});

describe("persistFinish end to end", () => {
  it("adds one hall-of-fame row and a place=1 trophy for the winner", () => {
    useTestDb();
    const winnerId = createAccount("champ_login", hashPassword("hunter2xx"));
    createAccount("loser_login", hashPassword("hunter2xx"));

    expect(listTournaments().length).toBe(0);
    expect(trophiesForLogin("champ_login").length).toBe(0);

    const ids = ["p1", "p2", "p3", "p4"];
    const b = finishedBracket(ids, ["champ_login", "loser_login", "C", "D"], "p1");
    const identities = new Map<string, LobbyIdentity>([["p1", { login: "champ_login", accountId: winnerId }]]);
    const plan = planFinish("tourn-xyz", b, identities, bracketString(b))!;
    persistFinish(plan);

    // GET /api/tournaments +1
    const hof = listTournaments();
    expect(hof.length).toBe(1);
    expect(hof[0].winner).toBe("champ_login");
    expect(hof[0].size).toBe(4);

    // GET /api/trophies?login=champ_login has place=1
    const trophies = trophiesForLogin("champ_login");
    expect(trophies.length).toBe(1);
    expect(trophies[0].place).toBe(1);
    expect(trophies[0].tournamentId).toBe("tourn-xyz");
  });

  it("is idempotent on the tournament id (a re-run does not duplicate the hall-of-fame row)", () => {
    useTestDb();
    const winnerId = createAccount("champ2", hashPassword("hunter2xx"));
    const b = finishedBracket(["p1", "p2", "p3", "p4"], ["champ2", "B", "C", "D"], "p1");
    const identities = new Map<string, LobbyIdentity>([["p1", { login: "champ2", accountId: winnerId }]]);
    const plan = planFinish("same-id", b, identities, bracketString(b))!;
    persistFinish(plan);
    persistFinish(plan);
    expect(listTournaments().length).toBe(1);
  });
});

describe("identity resolution", () => {
  it("resolveIdentity accepts a valid session token and rejects a bad one", () => {
    useTestDb();
    const id = createAccount("tokenuser", hashPassword("hunter2xx"));
    const token = createSession(id);
    expect(resolveIdentity(token)).toEqual({ login: "tokenuser", accountId: id });
    expect(resolveIdentity("not-a-token")).toBeNull();
    expect(resolveIdentity("")).toBeNull();
    expect(resolveIdentity(undefined)).toBeNull();
  });

  it("resolveClaim accepts a known login and rejects an unknown one", () => {
    useTestDb();
    const id = createAccount("claimuser", hashPassword("hunter2xx"));
    expect(resolveClaim("claimuser")).toEqual({ login: "claimuser", accountId: id });
    expect(resolveClaim("nobody")).toBeNull();
    expect(resolveClaim("")).toBeNull();
  });
});
