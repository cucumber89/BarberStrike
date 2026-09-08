import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
const out = fileURLToPath(new URL("../out/skins/preview/", import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL, args: ["--enable-unsafe-swiftshader"] });
const evidence = { errors: [], mounts: [], shots: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1050 } });
  page.on("pageerror", error => evidence.errors.push(error.message));
  await page.goto(`${process.env.CLIENT_URL ?? "http://localhost:5174"}/e2e/tools/skin-review.html`);
  const ready = () => page.waitForSelector('[data-testid="skin-preview"][data-ready="true"]', { timeout: 60000 });
  const diagnostics = () => page.evaluate(async () => (await import("/e2e/tools/skin-review.tsx")).diagnostics());
  await ready();
  for (const skin of ["warsztat", "stalowka", "talk", "slupek-frankiego", "szlaczek-babci", "osy"]) {
    await page.getByTestId(`skin-${skin}`).click(); await ready(); await page.waitForTimeout(200);
    await page.screenshot({ path: `${out}/${skin}.png` });
    const data = await diagnostics(); assert.ok(data.scenes[0].painted > 0); evidence.shots.push({ skin, ...data });
  }
  for (const weapon of ["sniper", "shotgun"]) {
    await page.getByTestId(`weapon-${weapon}`).click(); await page.getByTestId("skin-slupek-frankiego").click(); await ready();
    await page.waitForTimeout(200); await page.screenshot({ path: `${out}/stripes-${weapon}.png` });
  }
  for (let i = 0; i < 10; i++) {
    await page.getByTestId("toggle-preview").click(); assert.equal((await diagnostics()).engines, 0);
    await page.getByTestId("toggle-preview").click(); await ready();
    const d = await diagnostics(); assert.equal(d.engines, 1); assert.equal(d.scenes[0].cache.references, 1); evidence.mounts.push(d);
  }
  assert.deepEqual(evidence.errors, []);
} finally { await writeFile(`${out}/verification.json`, JSON.stringify(evidence, null, 2)); await browser.close(); }
