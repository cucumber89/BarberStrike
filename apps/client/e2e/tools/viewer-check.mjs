/**
 * Proof that `/viewer` works, in a real browser, against a real room.
 *
 * Run:  FB_DEV_TOOLS=1 pnpm dev            (client :5174, server :2567)
 *       PW_CHROMIUM=<chromium> node apps/client/e2e/tools/viewer-check.mjs
 *
 * It loads the page, joins a room as a spectator, jumps between viewpoints and reads the position
 * back, then asks `/health` how many PLAYERS the server thinks are connected. That last number is
 * the point: a watcher must not be one. Screenshots land in apps/client/e2e/out/map1/viewer/.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
const out = "apps/client/e2e/out/map1/viewer";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true, executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message)));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

await page.goto("http://localhost:5174/viewer");
await page.waitForSelector('[data-testid="viewer-pick"]', { timeout: 30000 });
await page.screenshot({ path: `${out}/pick.png` });
const emptyShown = await page.locator('[data-testid="viewer-empty"]').count();

// "SAMA MAPA" creates/joins a room as a spectator — the map-tool path.
await page.click('[data-testid="viewer-empty-map"]');
await page.waitForSelector('[data-testid="viewer-stage"]', { timeout: 45000 });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/stage.png` });
const stats = await page.locator('[data-testid="viewer-stats"]').innerText();
const spots = await page.locator('[data-testid="viewer-spots"] button').count();

// Fly somewhere and prove the camera moved.
const posBefore = stats;
await page.click('[data-testid="viewer-go-yard"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/yard.png` });
const posAfter = await page.locator('[data-testid="viewer-stats"]').innerText();
await page.click('[data-testid="viewer-go-A"]');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${out}/site-a.png` });

// The room must NOT have gained a player.
const health = await (await fetch("http://localhost:2567/health")).json();

console.log(JSON.stringify({ emptyShown, spots, posBefore: posBefore.replace(/\s+/g, " "), posAfter: posAfter.replace(/\s+/g, " "), playersOnServer: health.players, rooms: health.rooms, errors }, null, 1));
await browser.close();
