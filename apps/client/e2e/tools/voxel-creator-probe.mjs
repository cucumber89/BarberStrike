/**
 * Drives the voxel creator like a person: opens it, picks a model, paints with the mouse on the
 * grid (left = ink, right = erase), checks the model's text and the cost line follow, and shoots
 * the screen. Needs the dev client on :5174.
 *   PW_CHROMIUM=… node apps/client/e2e/tools/voxel-creator-probe.mjs   → out/voxel/creator*.png
 */
import { chromium } from "@playwright/test";
const URL = process.env.HOST_URL ?? "http://localhost:5174";
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
p.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await p.goto(`${URL}/voxel-lab.html?edit=1&model=fridge`);
await p.waitForFunction(() => window.lab, null, { timeout: 120000 });
await p.evaluate(() => window.lab.scene.whenReadyAsync());
await p.waitForTimeout(800);
await p.screenshot({ path: "apps/client/e2e/out/voxel/creator_fridge.png" });
const before = await p.evaluate(() => window.lab.text());
const stat0 = await p.locator("#stat").innerText();
// select the front picture (part 2) and paint a stroke of ink "K" across it with the mouse
await p.locator("#parts .part").nth(1).click();
await p.keyboard.press("K");
const box = await p.locator("#grid").boundingBox();
// the grid's cell geometry: read the hint-free way, from the part's size and the canvas centre
const geo = await p.evaluate(() => { const g = document.getElementById("grid"); const p = window.lab.model().parts[1]; const w = Math.max(...p.rows.map((r) => r.length)), h = p.rows.length; const W = g.clientWidth, H = g.clientHeight; const cp = Math.max(4, Math.floor(Math.min((W - 40) / w, (H - 40) / h))); return { cp, gx0: Math.floor((W - w * cp) / 2), gy0: Math.floor((H - h * cp) / 2), w, h }; });
const px = (r, c) => [box.x + geo.gx0 + (c + 0.5) * geo.cp, box.y + geo.gy0 + (r + 0.5) * geo.cp];
let [x, y] = px(3, 0); await p.mouse.move(x, y); await p.mouse.down(); for (let c = 1; c < geo.w; c++) { [x, y] = px(3, c); await p.mouse.move(x, y); } await p.mouse.up();
[x, y] = px(5, 1); await p.mouse.click(x, y, { button: "right" });
await p.waitForTimeout(400);
const after = await p.evaluate(() => window.lab.text());
const stat1 = await p.locator("#stat").innerText();
await p.screenshot({ path: "apps/client/e2e/out/voxel/creator_painted.png" });
console.log("changed:", before !== after, "| stat before:", stat0, "| after:", stat1);
console.log("painted row:", JSON.stringify(after.split("\n").find((l, i, a) => a[i - 4]?.startsWith("#part z") ) ?? ""));
console.log("errors:", errors.length ? errors : "none");
await b.close();
