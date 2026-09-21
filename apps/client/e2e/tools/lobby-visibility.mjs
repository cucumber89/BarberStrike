/**
 * Can a friend SEE the match you just made, and is JOIN live on it?
 *
 * The report "nie można grać online — jak ktoś tworzy mecz, inni go nie widzą" (2026-09-21).
 * Two real browsers against one process serving the built client: the host presses QUICK PLAY or
 * CREATE, the guest opens the page cold and the tool reads what the title screen and the lobby
 * list say, next to what `/rooms` says. Run for both a plain room and a room with bots, because
 * that is where it broke: a host alone with six bots was published as 7/6, which the lobby drew as
 * FULL with JOIN greyed out — five free seats nobody could take.
 *
 *   pnpm --filter @frankibarber/client build
 *   PORT=2611 pnpm --filter @frankibarber/server dev            # another shell
 *   HOST_URL=http://localhost:2611 node apps/client/e2e/tools/lobby-visibility.mjs
 *
 * Exit 1 when the guest cannot see or join either room. Table → apps/client/e2e/out/d/lobby-visibility.md
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL = process.env.HOST_URL ?? "http://localhost:2611";
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../out/d");
const CHROME = process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const rows = [];
const check = (name, ok, detail) => { rows.push({ name, ok, detail }); console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(44)} ${detail}`); };

const b = await chromium.launch({ executablePath: CHROME, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });

async function page(init) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)));
  p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  if (init) await p.addInitScript(init);
  return { ctx, p, errors };
}

async function scenario(label, hostInit, btn, bots) {
  const host = await page(hostInit);
  await host.p.goto(URL);
  await host.p.getByTestId("btn-play").click();
  await host.p.getByTestId("input-name").fill("HOST");
  await host.p.getByTestId(btn).click();
  // The room exists as soon as the server lists it; the HUD can take a minute on SwiftShader.
  // A room from the previous scenario may still be winding down (reconnect grace), so the room
  // under test is the one with THIS bot count, not the only one.
  let mine = null;
  for (let i = 0; i < 60 && !mine; i++) { await host.p.waitForTimeout(2000); const l = await (await fetch(`${URL}/rooms`)).json(); mine = l.find((r) => (r.metadata?.bots ?? 0) === bots) ?? null; }
  check(`${label}: server lists the room`, !!mine, mine ? JSON.stringify({ clients: mine.clients, maxClients: mine.maxClients, bots: mine.metadata?.bots }) : "not listed");
  const id = mine?.roomId ?? "";
  const guest = await page();
  await guest.p.goto(URL);
  await guest.p.waitForTimeout(4500);
  const status = await guest.p.getByTestId("server-status").innerText().catch(() => "?");
  check(`${label}: title screen counts a match`, /[1-9] MATCH/.test(status), status);
  await guest.p.getByTestId("btn-play").click();
  await guest.p.waitForTimeout(3500);
  const row = await guest.p.getByTestId(`room-${id}`).evaluate((e) => ({ text: e.innerText.replace(/\n/g, " "), disabled: e.disabled })).catch(() => null);
  check(`${label}: lobby shows the room with JOIN live`, !!row && !row.disabled, row ? JSON.stringify(row) : "no row for " + id);
  if (bots) check(`${label}: count is humans, not humans + bots`, mine?.clients === 1 && mine?.maxClients === 12 - bots, `${mine?.clients}/${mine?.maxClients}`);
  check(`${label}: console errors`, host.errors.length + guest.errors.length === 0, JSON.stringify([...host.errors, ...guest.errors].slice(0, 3)) || "none");
  await guest.ctx.close(); await host.ctx.close();
  await new Promise((r) => setTimeout(r, 1500));
}

await scenario("quick play, no bots", null, "btn-quickplay", 0);
await scenario("create, 6 bots", () => { localStorage.setItem("fb_bots", "6"); }, "btn-create", 6);
await b.close();

fs.mkdirSync(OUT, { recursive: true });
const md = ["# lobby-visibility", "", `Host: ${URL} · ${new Date().toISOString()}`, "", "| check | result | detail |", "|---|---|---|",
  ...rows.map((r) => `| ${r.name} | ${r.ok ? "ok" : "FAIL"} | ${String(r.detail).replace(/\|/g, "\\|")} |`), ""].join("\n");
fs.writeFileSync(path.join(OUT, "lobby-visibility.md"), md);
const failed = rows.filter((r) => !r.ok).length;
console.log(failed ? `${failed} check(s) failed` : `all ${rows.length} checks passed`, `→ ${path.join(OUT, "lobby-visibility.md")}`);
process.exit(failed ? 1 : 0);
