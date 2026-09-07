import { chromium } from '@playwright/test';
import fs from 'node:fs';
const out=process.env.SHOT_DIR;
if(!out) throw new Error('Set SHOT_DIR');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://localhost:5174/map-review.html');
await page.waitForFunction(()=>window.review,{timeout:120000});
await page.evaluate(()=>window.review.scene.whenReadyAsync());
const results=[];
for(const [name,p,t] of [
 ['street',[-10,1.7,-12],[2,3,0]],
 ['perimeter',[1,1.7,-12],[-12,6,-22]],
 ['shop',[2,1.7,1.2],[5,1.7,7]],
 ['yard',[-3,1.7,30],[-12,5,45]],
 ['depot',[-32,1.7,-9],[-39,3,2]],
 ['overview',[-30,21,-32],[4,0,9]]
]){
 await page.evaluate(({p,t})=>window.review.view(p,t),{p,t});
 await page.waitForTimeout(1600);
 await page.screenshot({path:`${out}/${name}.png`});
 results.push(await page.evaluate(name=>{const {scene,engine}=window.review;const start=engine._drawCalls.current;scene.render();const calls=engine._drawCalls.current-start;return {name,drawCalls:calls,activeMeshes:scene.getActiveMeshes().length,totalVertices:scene.getTotalVertices(),lights:scene.lights.length,textures:scene.textures.length};},name));
}
fs.writeFileSync(`${out}/metrics.json`,JSON.stringify({results,errors},null,2));
console.log(JSON.stringify({results,errors}));await browser.close();
