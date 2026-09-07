import {chromium} from '@playwright/test';
import fs from 'node:fs';
const out=process.env.SHOT_DIR;if(!out)throw new Error('Set SHOT_DIR');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:600}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://localhost:5174/graphics-review.html');await page.waitForFunction(()=>window.graphicsReview);
const results=[];
for(const [label,preset,patch] of [['high','high',{}],['low-after-high','low',{}],['medium','medium',{}],['ultra','ultra',{}],['low-after-ultra','low',{}],['low-with-aa','low',{antialiasing:true}],['high-no-post','high',{postProcessing:false}]]){
 await page.evaluate(({preset,patch})=>window.graphicsReview.set(preset,patch),{preset,patch});
 await page.evaluate(()=>window.graphicsReview.scene.whenReadyAsync());await page.waitForTimeout(700);
 const png=await page.screenshot({path:`${out}/${label}.png`});
 const light=await page.evaluate(async data=>{const img=new Image();img.src=data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;let mean=0;const samples=[];for(let y=100;y<500;y+=4)for(let x=120;x<840;x+=4){let i=(y*c.width+x)*4;const l=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];samples.push(l);mean+=l;}samples.sort((a,b)=>a-b);return {mean:mean/samples.length,median:samples[Math.floor(samples.length/2)]};},'data:image/png;base64,'+png.toString('base64'));
 const state=await page.evaluate(()=>{const {scene,camera,engine}=window.graphicsReview;const ip=scene.imageProcessingConfiguration;return {postProcesses:camera._postProcesses.filter(Boolean).map(p=>p.name),applyByPostProcess:ip.applyByPostProcess,exposure:ip.exposure,contrast:ip.contrast,textures:scene.textures.length,materials:scene.materials.length};});results.push({label,...light,...state});
}
const lifecycle=await page.evaluate(async()=>{
 const r=window.graphicsReview;
 r.set('low');await r.scene.whenReadyAsync();
 const before={materials:r.scene.materials.length,textures:r.scene.textures.length};
 for(let i=0;i<4;i++){
  r.set('high');await r.scene.whenReadyAsync();r.set('low');await r.scene.whenReadyAsync();
 }
 r.set('low',{brightness:1.2});await r.scene.whenReadyAsync();
 const brightnessExposure=r.scene.imageProcessingConfiguration.exposure;
 r.set('low',{antialiasing:true});await r.scene.whenReadyAsync();
 const original=r.camera._postProcesses.filter(Boolean);
 r.settings.audio.master=.2;r.events.emit('settings',{});
 const unchanged=original.every((p,i)=>p===r.camera._postProcesses.filter(Boolean)[i]);
 r.set('low');await r.scene.whenReadyAsync();
 for(const q of ['medium','high','off','medium','off']){r.map.setShadowQuality(q);await r.scene.whenReadyAsync();r.scene.render();}
 return {before,after:{materials:r.scene.materials.length,textures:r.scene.textures.length},brightnessExposure,unrelatedSettingsKeepPipeline:unchanged,shadowsOff:r.map.shadowGenerators.length===0};
});
fs.writeFileSync(`${out}/metrics.json`,JSON.stringify({results,lifecycle,errors},null,2));console.log(JSON.stringify({results,lifecycle,errors}));await browser.close();
if(process.env.ASSERT_GRAPHICS==='1'){
 const high=results[0].mean;
 for(const r of results)if(Math.abs(r.mean/high-1)>.1)throw new Error(`Brightness regression: ${r.label}`);
 if(errors.length)throw new Error(errors.join('\n'));
 if(JSON.stringify(lifecycle.before)!==JSON.stringify(lifecycle.after)||!lifecycle.unrelatedSettingsKeepPipeline||!lifecycle.shadowsOff||Math.abs(lifecycle.brightnessExposure-1.5)>.001)throw new Error('Graphics lifecycle regression');
 if(!results.find(r=>r.label==='low-with-aa').postProcesses.includes('fxaa'))throw new Error('AA missing on low');
}
