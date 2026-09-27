import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/**
 * Evidence for the dances on H: every emote frozen at a few instants of its loop, on one stage.
 * Writes `e2e/out/emotes/t-<seconds>.png` (all twelve side by side) and, with `EMOTE=<id>`,
 * `e2e/out/emotes/<id>-<seconds>.png` from two sides. Needs the client dev server (:5174).
 */
const out = fileURLToPath(new URL("../out/emotes/", import.meta.url));
await mkdir(out, { recursive: true });
const base = `${process.env.CLIENT_URL ?? "http://localhost:5174"}/e2e/tools/emote-review.html`;
const browser = await chromium.launch({
  headless: true, executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 820 } });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}?emote=machanie&times=0`);
  await page.waitForFunction(() => window.__emoteReview?.ready, null, { timeout: 60000 });
  const catalog = await page.evaluate(() => window.__emoteReview.catalog);
  const ids = process.env.EMOTE ? process.env.EMOTE.split(",") : catalog.map((e) => e.id);
  for (const id of ids) {
    const loop = catalog.find((e) => e.id === id).loopMs / 1000;
    const fracs = process.env.FRACS ? process.env.FRACS.split(",").map(Number) : [0, 0.2, 0.4, 0.6, 0.8];
    const times = fracs.map((f) => +(f * loop).toFixed(3));
    for (const alpha of [1.25, 2.4]) {
      await page.goto(`${base}?emote=${id}&times=${times.join(",")}&alpha=${alpha}`);
      await page.waitForFunction(() => window.__emoteReview?.ready, null, { timeout: 60000 });
      await page.waitForTimeout(500);
      const blends = await page.evaluate(() => window.__emoteReview.dancing());
      if (blends.some((b) => b.blend < 0.99)) errors.push(`${id}: not fully into the dance`);
      await page.screenshot({ path: `${out}/${id}${alpha === 1.25 ? "" : "-side"}.png` });
    }
  }
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log(`ok: ${out}`);
