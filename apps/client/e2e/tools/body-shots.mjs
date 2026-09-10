import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

/**
 * Evidence for the body builds: the six side by side, and the proof the preview closes clean.
 *
 * The screenshot is the point of the first half — "they are really different silhouettes" is a
 * claim only an image can settle. The second half is the leak test `skin-preview.mjs` already runs
 * for weapons: every mount owns a WebGL context, so a preview that does not release one on unmount
 * takes the whole menu down after about a dozen visits.
 */
const out = fileURLToPath(new URL("../out/builds/", import.meta.url));
await mkdir(out, { recursive: true });
// Same override the Playwright config uses: the sandbox ships a pinned Chromium, and downloading
// another one is neither possible nor wanted here.
const browser = await chromium.launch({
  headless: true, channel: process.env.PW_CHANNEL,
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl", "--disable-gpu-sandbox"],
});
const evidence = { errors: [], mounts: [], builds: null, outfits: null, hitbox: null };
try {
  const page = await browser.newPage({ viewport: { width: 1760, height: 1080 } });
  page.on("pageerror", error => evidence.errors.push(error.message));
  await page.goto(`${process.env.CLIENT_URL ?? "http://localhost:5174"}/e2e/tools/body-review.html`);
  const ready = async (n = 6) => {
    await page.waitForFunction((want) => document.querySelectorAll('[data-testid="character-preview"][data-ready="true"]').length === want, n, { timeout: 120000 });
    await page.waitForTimeout(700);
  };
  const diagnostics = () => page.evaluate(() => window.__bodyReview.diagnostics());
  await ready();

  const data = await diagnostics();
  evidence.builds = data.builds; evidence.hitbox = data.hitbox;
  // The claim the screenshot is captioned with, asserted rather than trusted.
  const crowns = data.builds.map(b => b.crownY), widths = data.builds.map(b => b.halfW);
  assert.ok(Math.max(...crowns) - Math.min(...crowns) < 1e-9, "every build's crown is the same height");
  assert.ok(Math.max(...widths) - Math.min(...widths) < 1e-9, "every build's widest point is the same");
  for (const b of data.builds) assert.ok(b.headBottomY > b.headZoneStart, `${b.id}'s chin is inside the head zone`);

  await page.screenshot({ path: `${out}/builds-cap.png`, fullPage: true });
  for (const cut of ["mohawk", "pompadour", "bleach"]) {
    await page.getByTestId(`cut-${cut}`).click(); await ready();
    await page.screenshot({ path: `${out}/builds-${cut}.png`, fullPage: true });
  }
  for (const build of data.builds) {
    const box = await page.getByTestId(`body-${build.id}`).boundingBox();
    await page.screenshot({ path: `${out}/${build.id}.png`, clip: box });
  }

  // ---- the outfits, all thirteen side by side, and the claim they are held to.
  await page.getByTestId("cut-cap").click(); await ready();
  await page.getByTestId("mode-outfits").click();
  const fits = data.outfits.length;
  await ready(fits);
  for (const o of data.outfits) {
    assert.ok(!o.paints.includes("accent"), `${o.id} must not be able to paint the team colour`);
  }
  await page.screenshot({ path: `${out}/outfits.png`, fullPage: true });
  for (const o of data.outfits) {
    const box = await page.getByTestId(`outfit-${o.id}`).boundingBox();
    await page.screenshot({ path: `${out}/fit-${o.id}.png`, clip: box });
  }
  // From behind: the cape, the backpack and the hood's drape are all back-of-body pieces, and a
  // front three-quarter view is the one angle that cannot show them.
  await page.getByTestId("toggle-back").click(); await ready(fits);
  await page.screenshot({ path: `${out}/outfits-back.png`, fullPage: true });
  for (const id of ["nietoperz", "kurier", "kibol"]) {
    const box = await page.getByTestId(`outfit-${id}`).boundingBox();
    await page.screenshot({ path: `${out}/back-${id}.png`, clip: box });
  }
  await page.getByTestId("toggle-back").click(); await ready(fits);

  // The same thirteen on a body that is not the default, to show a piece is cut for the build.
  await page.getByTestId("on-barylka").click(); await ready(fits);
  await page.screenshot({ path: `${out}/outfits-barylka.png`, fullPage: true });
  await page.getByTestId("on-tyczka").click(); await ready(fits);
  await page.screenshot({ path: `${out}/outfits-tyczka.png`, fullPage: true });
  evidence.outfits = data.outfits;

  await page.getByTestId("mode-builds").click(); await ready();

  // Ten open/close cycles: zero engines while closed, six while open, and no growth in between.
  // Polled rather than asserted on the spot — React unmounts on its own schedule, and "the context
  // is released" is the claim, not "released before the next tick of the test".
  const enginesSettle = async (want, label) => {
    for (let tries = 0; tries < 40; tries++) {
      if ((await diagnostics()).engines === want) return;
      await page.waitForTimeout(50);
    }
    assert.equal((await diagnostics()).engines, want, label);
  };
  await page.getByTestId("cut-cap").click(); await ready();
  for (let i = 0; i < 10; i++) {
    await page.getByTestId("toggle-preview").click();
    await enginesSettle(0, `cycle ${i}: engines left running after unmount`);
    await page.getByTestId("toggle-preview").click(); await ready();
    const d = await diagnostics();
    assert.equal(d.engines, 6, `cycle ${i}: one engine per preview, no more`);
    evidence.mounts.push({ cycle: i, engines: d.engines, meshes: d.scenes.map(s => s.meshes) });
  }
  assert.deepEqual(evidence.errors, []);
  console.log(`builds: ${data.builds.map(b => `${b.id} hip ${b.hipY.toFixed(3)} waist ${b.waistW.toFixed(3)}`).join(" | ")}`);
  console.log(`outfits: ${data.outfits.map(o => `${o.id}(${o.rarity},${o.pieces}p)`).join(" ")}`);
  console.log(`crown ${crowns[0]} halfW ${widths[0]} for all six; hitbox ${JSON.stringify(data.hitbox)}`);
} finally {
  await writeFile(`${out}/verification.json`, JSON.stringify(evidence, null, 2));
  await browser.close();
}
