// With the client dev server running: node apps/client/e2e/tools/skin-batch.mjs
// Evidence only: bitmap outputs are gitignored, the game ships the recipes.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const out = fileURLToPath(new URL("../out/skins/", import.meta.url));
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PW_CHANNEL, args: ["--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(process.env.CLIENT_URL ?? "http://localhost:5174");
  const recipesUrl = new URL("../../../../packages/skins/src/index.ts", import.meta.url).pathname;
  await page.evaluate(async (url) => {
    const { catalog, DomSkinCanvas, renderSkin } = await import(url);
    document.body.innerHTML = '<main id="sheet"><h1>BARBERSTRIKE / DROP C</h1><p>Kierunki wykończenia · 6 receptur proceduralnych</p><section></section></main>';
    const style = document.createElement("style");
    style.textContent = 'body{margin:0;background:#11171c;color:#ece6d9;font:16px sans-serif}#sheet{padding:32px}h1{font-size:26px;letter-spacing:3px}section{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}article{background:#1b242b;padding:14px;border:1px solid #34414c}canvas{width:100%;height:220px;object-fit:cover}h2{margin:12px 0 4px;font-size:20px}p{color:#9fadb8;margin:0 0 24px}small{color:#a9b8c4}';
    document.head.appendChild(style);
    for (const skin of catalog) {
      const article = document.createElement("article"); const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1024; canvas.id = skin.id;
      renderSkin(skin, "rifle", "pattern", new DomSkinCanvas(canvas.getContext("2d"), 1024));
      const name = document.createElement("h2"); name.textContent = skin.name;
      const blurb = document.createElement("small"); blurb.textContent = skin.blurb;
      article.append(canvas, name, blurb); document.querySelector("section").append(article);
    }
  }, `/@fs/${decodeURIComponent(recipesUrl).replace(/^\/([A-Za-z]:)/, "$1")}`);
  const images = await page.locator("#sheet canvas").evaluateAll(nodes => nodes.map(c => ({ id: c.id, png: c.toDataURL("image/png").split(",")[1] })));
  for (const { id, png } of images) await writeFile(`${out}/${id}.png`, Buffer.from(png, "base64"));
  await page.locator("#sheet").screenshot({ path: `${out}/contact-sheet.png` });
  await writeFile(`${out}/batch.json`, JSON.stringify({ count: images.length, ids: images.map(i => i.id) }, null, 2));
} finally { await browser.close(); }
