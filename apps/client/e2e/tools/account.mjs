/**
 * Accounts HTTP smoke (drop V / H, P4): does the REST auth surface behave?
 *
 * The account routes live off the game loop, so this tool does not need Colyseus at all — it boots a
 * bare Express with just the accounts router (the same `accountRoutes()` the real server mounts under
 * `/api`) against a throwaway in-memory database, then drives the contract from V_SPEC 4.3 over real
 * HTTP:
 *
 *   - register {login,password} -> 201 + Set-Cookie bs_sess; a duplicate login -> 409
 *   - login with the wrong password five times -> 401; the sixth -> 429 (rate limit login+ip)
 *   - GET /api/me with the cookie -> 200 {login,profile}; without it -> 401
 *   - migrate onto an empty profile -> 200; migrate again (now non-empty) -> 409 (hard contract)
 *   - the six-table schema exists (sqlite_master count == 6)
 *
 * Run from the repo root:  node apps/client/e2e/tools/account.mjs
 * Exit code 1 on any failed check.
 */
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "../../../../apps/server");
const serverSrc = path.join(serverRoot, "src");

// Resolve the server's own dependencies (express, better-sqlite3, tsx) from ITS node_modules, so the
// tool runs no matter which package's cwd invoked it. `tsx` is registered to import the .ts sources.
const req = createRequire(pathToFileURL(path.join(serverRoot, "package.json")).href);
const express = req("express");
try { req("tsx/esm/api").register(); } catch { /* tsx already registered by --import */ }

// In-memory DB so the smoke leaves nothing behind and never touches a real accounts.db.
process.env.ACCOUNTS_DB = ":memory:";

const { accountRoutes } = await import(pathToFileURL(path.join(serverSrc, "accounts/routes.ts")).href);
const { openDb, getDb } = await import(pathToFileURL(path.join(serverSrc, "accounts/db.ts")).href);
// P7: the tournament finish write (trophies + hall of fame) and the account store it writes through.
const { planFinish, persistFinish } = await import(pathToFileURL(path.join(serverSrc, "rooms/tournamentFinish.ts")).href);
const { createAccount } = await import(pathToFileURL(path.join(serverSrc, "accounts/store.ts")).href);
const { hashPassword } = await import(pathToFileURL(path.join(serverSrc, "accounts/hash.ts")).href);
const shared = req("@frankibarber/shared");

openDb();

const app = express();
app.use("/api", accountRoutes());
const server = http.createServer(app);
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(38)} ${detail}`);
};

/** A tiny fetch that carries one cookie jar across calls. */
function makeClient() {
  let cookie = "";
  return async (method, url, body) => {
    const headers = { "content-type": "application/json" };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(base + url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let json = null;
    try { json = await res.json(); } catch { /* 204 etc. */ }
    return { status: res.status, json, setCookie, cookie };
  };
}

try {
  const c = makeClient();

  // register -> 201 + cookie
  const reg = await c("POST", "/api/register", { login: "smoke_user", password: "hunter2xx" });
  check("register 201 + cookie", reg.status === 201 && !!reg.setCookie && /bs_sess=/.test(reg.setCookie), `status=${reg.status}`);

  // duplicate login -> 409
  const dup = await c("POST", "/api/register", { login: "smoke_user", password: "another11" });
  check("duplicate register 409", dup.status === 409, `status=${dup.status}`);

  // GET /api/me with cookie -> 200
  const me = await c("GET", "/api/me");
  check("me with cookie 200", me.status === 200 && me.json?.login === "smoke_user", `status=${me.status} login=${me.json?.login}`);

  // GET /api/me without cookie -> 401
  const anon = makeClient();
  const meAnon = await anon("GET", "/api/me");
  check("me without cookie 401", meAnon.status === 401, `status=${meAnon.status}`);

  // migrate onto empty -> 200
  const mig1 = await c("POST", "/api/migrate", { profile: { xp: 123 } });
  check("migrate empty 200", mig1.status === 200, `status=${mig1.status}`);

  // migrate again (non-empty) -> 409 hard contract
  const mig2 = await c("POST", "/api/migrate", { profile: { xp: 999 } });
  check("migrate non-empty 409", mig2.status === 409, `status=${mig2.status}`);

  // login with the correct password FIRST (before the rate limit trips for this login+ip) -> 200
  const good = makeClient();
  const ok = await good("POST", "/api/login", { login: "smoke_user", password: "hunter2xx" });
  check("login correct -> 200 + cookie", ok.status === 200 && !!ok.setCookie, `status=${ok.status}`);

  // logout -> 204
  const out = await good("POST", "/api/logout");
  check("logout -> 204", out.status === 204, `status=${out.status}`);

  // login wrong password 5x -> 401, 6th -> 429 (rate limit keyed on login+ip). Use a separate login
  // whose count starts fresh, so the earlier good login does not skew the window.
  await c("POST", "/api/register", { login: "rl_target", password: "hunter2xx" });
  const attacker = makeClient();
  const statuses = [];
  for (let i = 0; i < 5; i++) {
    const r = await attacker("POST", "/api/login", { login: "rl_target", password: "wrongwrong" });
    statuses.push(r.status);
  }
  const sixth = await attacker("POST", "/api/login", { login: "rl_target", password: "wrongwrong" });
  check("login bad x5 -> 401", statuses.every((s) => s === 401), `statuses=${statuses.join(",")}`);
  check("login 6th -> 429 rate limit", sixth.status === 429, `status=${sixth.status}`);

  // schema: exactly six tables
  const tables = getDb()
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name)
    .sort();
  check("six tables in schema", tables.length === 6, tables.join(","));

  // public reads answer
  const hof = await c("GET", "/api/tournaments?limit=5");
  check("GET /api/tournaments 200", hof.status === 200 && Array.isArray(hof.json?.tournaments), `status=${hof.status}`);
  const tro = await c("GET", "/api/trophies?login=smoke_user");
  check("GET /api/trophies 200", tro.status === 200 && Array.isArray(tro.json?.trophies), `status=${tro.status}`);

  // ---------------------------------------------------------------- P7: tournament save contract
  // A finished 4-player bracket is written through the finish planner/persister (the same path the
  // lobby room hooks on `phase="koniec"`), then the public reads confirm the contract from V_SPEC P7:
  // GET /api/tournaments gains a row, and GET /api/trophies?login=<winner> shows place=1.
  {
    const { seedBracket, reportWinner, bracketString, mulberry32 } = shared;
    const winnerId = createAccount("p7_winner", hashPassword("hunter2xx"));
    createAccount("p7_runner", hashPassword("hunter2xx"));

    const before = await c("GET", "/api/tournaments?limit=50");
    const beforeN = before.json?.tournaments?.length ?? 0;

    // Draw four, then play `p1` (login p7_winner) through every pair to the title.
    const ids = ["p1", "p2", "p3", "p4"];
    const names = ["p7_winner", "p7_runner", "C", "D"];
    let b = seedBracket(ids.map((id, i) => ({ id, name: names[i] })), 4, mulberry32(1));
    let guard = 0;
    while (b.at < b.matches.length && guard++ < 20) {
      const m = b.matches[b.at];
      const through = m.a === "p1" || m.b === "p1" ? "p1" : m.a || m.b;
      b = reportWinner(b, through, 6, 0);
    }
    const identities = new Map([["p1", { login: "p7_winner", accountId: winnerId }]]);
    const plan = planFinish("p7-tourn-1", b, identities, bracketString(b));
    check("planFinish returns a plan for a finished draw", !!plan, `plan=${!!plan}`);
    persistFinish(plan);

    const after = await c("GET", "/api/tournaments?limit=50");
    const afterN = after.json?.tournaments?.length ?? 0;
    check("GET /api/tournaments +1 after finish", afterN === beforeN + 1, `before=${beforeN} after=${afterN}`);
    const row = (after.json?.tournaments ?? []).find((t) => t.id === "p7-tourn-1");
    check("hall-of-fame row winner = p7_winner", row?.winner === "p7_winner", `winner=${row?.winner}`);

    const win = await c("GET", "/api/trophies?login=p7_winner");
    const champTrophy = (win.json?.trophies ?? []).find((t) => t.tournamentId === "p7-tourn-1");
    check("GET /api/trophies?login=p7_winner place=1", champTrophy?.place === 1, `place=${champTrophy?.place}`);
  }
} finally {
  server.close();
}

console.log(failed === 0 ? "\nACCOUNT SMOKE: all green" : `\nACCOUNT SMOKE: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
