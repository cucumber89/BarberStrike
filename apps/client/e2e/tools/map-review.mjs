// map-review — screenshots and draw-call metrics of `map-review.html` under SwiftShader (no GPU).
//
// Run: SHOT_DIR=<dir> [PRESET=raw|medium] [AREAS=1] [MAP=<id>] [VIEWS=<file.json>] \
//        node apps/client/e2e/tools/map-review.mjs          (needs the dev client on BASE_URL)
//
// WHY MAP AND VIEWS (Drop W). The script was pinned to the district: it opened `?preset=` only
// and carried the district's cameras in the source, so a third map could not be reviewed with it.
// `MAP=<id>` appends `&map=<id>` to the URL (the page's own switch), and `VIEWS=<file>` replaces
// the camera list with a JSON array of `[name, position, target]` — DOLNA has no twin of the
// district's streets, so its cameras are a table, like its places. Without both variables the run
// is byte-identical to before: the same URL, the same cameras, the same `metrics.json`.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out=process.env.SHOT_DIR;
if(!out) throw new Error('Set SHOT_DIR');
fs.mkdirSync(out,{recursive:true});
// Honour the same browser override as the game suite; review must work on CI too.
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM || undefined,channel:process.env.PW_CHANNEL || undefined,headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const mapParam=process.env.MAP ? `&map=${encodeURIComponent(process.env.MAP)}` : '';
await page.goto(`${process.env.BASE_URL || 'http://localhost:5174'}/map-review.html?preset=${process.env.PRESET || 'raw'}${mapParam}`);
await page.waitForFunction(()=>window.review,{timeout:120000});
await page.evaluate(()=>window.review.scene.whenReadyAsync());
const results=[];
// The district's cameras, or the `[name, position, target]` triples of VIEWS.
const views=process.env.VIEWS ? JSON.parse(fs.readFileSync(process.env.VIEWS,'utf8')) : [
 ['street',[-10,1.7,-12],[2,3,0]],
 ['perimeter',[1,1.7,-12],[-12,6,-22]],
 ['shop',[2,1.7,1.2],[5,1.7,7]],
 ['yard',[-3,1.7,30],[-12,5,45]],
 ['depot',[-32,1.7,-9],[-39,3,2]],
 ['overview',[-30,21,-32],[4,0,9]],
 ...(process.env.AREAS ? [
 ['west_yard',[-20,1.7,31],[-24,4,42]],
 ['site_a',[-30,1.7,18],[-38,3,26]],
 ['site_b',[38,1.7,19],[48,3,28]],
 ['cafe',[37,1.7,-7],[45,3,3]],
 ['north',[7,1.7,38],[-10,3,42]],
 ['backlot',[-18,1.7,10],[-24,3,4]],
 ['alley',[-10,1.7,2],[-5,3,15]],
 ['hall',[1,1.7,11],[3,2,17]],
 ['unit',[11,1.7,2],[17,3,7]],
 ['storage',[10,1.7,12],[17,4,16]],
 ['east',[22,1.7,9],[29,4,16]]
 ] : [])
];
if(!Array.isArray(views) || views.some(v=>!Array.isArray(v) || v.length!==3 || typeof v[0]!=='string')) throw new Error('VIEWS must be a JSON array of [name, [x,y,z], [x,y,z]]');
for(const [name,p,t] of views){
 await page.evaluate(({p,t})=>window.review.view(p,t),{p,t});
 await page.waitForTimeout(1600);
 await page.screenshot({path:`${out}/${name}.png`});
 results.push(await page.evaluate(name=>{const {scene,engine}=window.review;const start=engine._drawCalls.current;scene.render();const calls=engine._drawCalls.current-start;return {name,drawCalls:calls,activeMeshes:scene.getActiveMeshes().length,totalVertices:scene.getTotalVertices(),lights:scene.lights.length,textures:scene.textures.length};},name));
}
fs.writeFileSync(`${out}/metrics.json`,JSON.stringify({preset:process.env.PRESET || 'raw',...(process.env.MAP ? {map:process.env.MAP} : {}),results,errors},null,2));
console.log(JSON.stringify({results,errors}));await browser.close();
