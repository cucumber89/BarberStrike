/**
 * Proof that the `/viewer` admin console works end to end, in a real browser against a real server
 * (owner's brief 2026-09-27, "w panelu admina dużo możliwości daj").
 *
 * Run:  FB_DEV_TOOLS=1 pnpm dev            (client :5174, server :2567, no ADMIN_PASSWORD = open)
 *       PW_CHROMIUM=<chromium> node apps/client/e2e/tools/admin-console.mjs
 *
 * It opens the console, screenshots the four cards, raises a quick match with ZAŁÓŻ MECZ, reads the
 * invite link back, waits for the MECZE table to list the room with its phase, presses ZAKOŃCZ on
 * that row and asserts the row is gone on the next refresh — then asks the server the same over
 * `/api/admin/rooms` so the table is proven against the truth and not against itself.
 * Screenshots land in apps/client/e2e/out/admin/.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const out = "apps/client/e2e/out/admin";
mkdirSync(out, { recursive: true });
const HTTP = process.env.HTTP_URL ?? "http://localhost:2567";
const KEY = process.env.ADMIN_PASSWORD ?? "";
const browser = await chromium.launch({
  headless: true, executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--disable-gpu-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
const fail = (m) => { console.log("FAIL:", m); process.exitCode = 1; };

await page.goto("http://localhost:5174/viewer");
await page.waitForSelector('[data-testid="viewer-admin"]', { timeout: 30000 });
await page.screenshot({ path: `${out}/lock.png` });

// The gate: with no password on the server any entry opens it; with one, the right one does.
await page.fill('[data-testid="admin-pw"]', KEY);
await page.click('[data-testid="admin-enter"]');
await page.waitForSelector('[data-testid="admin-console"]', { timeout: 10000 });
await page.waitForSelector('[data-testid="admin-health"]');
await page.waitForFunction(() => document.querySelector('[data-testid="admin-rooms"] tbody tr') !== null);
await page.screenshot({ path: `${out}/console.png`, fullPage: true });
const cards = await Promise.all(["admin-create", "admin-quick", "admin-matches", "admin-server"].map((id) => page.locator(`[data-testid="${id}"]`).count()));
const tourLink = await page.inputValue('[data-testid="admin-tour-link"]');
const health = (await page.locator('[data-testid="admin-health"]').innerText()).replace(/\s+/g, " ");

// ZAŁÓŻ MECZ: a Gun Game on GÓRA with two bots, named so the table row is unmistakable.
const roomName = `admin-${Date.now().toString(36).slice(-5)}`;
await page.selectOption('[data-testid="admin-quick-mode"]', "gungame");
await page.selectOption('[data-testid="admin-quick-map"]', "gora");
await page.locator('[data-testid="admin-quick-bots"]').fill("2");
await page.click('[data-testid="admin-quick-level-hard"]');
await page.fill('[data-testid="admin-quick-room"]', roomName);
await page.click('[data-testid="admin-quick-go"]');
await page.waitForSelector('[data-testid="admin-quick-made"]', { timeout: 15000 });
const quickLink = await page.inputValue('[data-testid="admin-quick-link"]');
if (!quickLink.includes(`/r/${roomName}?mode=gungame&map=gora`)) fail(`quick link: ${quickLink}`);

// The MECZE table lists it (auto-refresh, ≤ 5 s) with a phase; the server agrees.
const rowSel = `[data-testid="admin-rooms"] tbody tr:has-text("${roomName}")`;
await page.waitForSelector(rowSel, { timeout: 15000 });
const rowText = (await page.locator(rowSel).innerText()).replace(/\s+/g, " ");
const listed = (await (await fetch(`${HTTP}/api/admin/rooms`, { headers: { authorization: `Bearer ${KEY}` } })).json()).rooms;
const mine = listed.find((r) => r.name === roomName);
if (!mine) fail("server does not list the created room");
else if (mine.mode !== "gungame" || mine.map !== "gora" || mine.bots !== 2) fail(`server row: ${JSON.stringify(mine)}`);
await page.screenshot({ path: `${out}/match-created.png`, fullPage: true });

// ZAKOŃCZ on that row: the room ends and closes, and the row is gone on the next refresh.
await page.click(`${rowSel} [data-testid^="admin-end-"]`);
await page.waitForSelector(rowSel, { state: "detached", timeout: 15000 });
await page.waitForTimeout(500);
const after = (await (await fetch(`${HTTP}/api/admin/rooms`, { headers: { authorization: `Bearer ${KEY}` } })).json()).rooms;
if (after.some((r) => r.roomId === mine?.roomId)) fail("server still lists the ended room");
await page.screenshot({ path: `${out}/match-ended.png`, fullPage: true });

// The gate on the server, not only in the UI: an action with the wrong key is refused when a
// password is set. (Only provable when the server runs with one — reported, not asserted.)
const wrongKey = await fetch(`${HTTP}/api/admin/rooms`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${KEY}x` }, body: JSON.stringify({ mode: "tdm", map: "gora" }) });
if (wrongKey.status === 201) {
  // Open server (dev): tidy the room we just made by accident of the probe.
  const { roomId } = await wrongKey.json();
  await fetch(`${HTTP}/api/admin/rooms/${roomId}/end`, { method: "POST", headers: { authorization: `Bearer ${KEY}` } });
}

console.log(JSON.stringify({
  cards, tourLink, health, roomName, quickLink, rowText, serverRow: mine, rowsAfter: after.length,
  wrongKeyStatus: wrongKey.status, serverHasPassword: KEY.length > 0, errors,
}, null, 1));
await browser.close();
