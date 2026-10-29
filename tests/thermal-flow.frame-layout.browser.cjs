// Frame geometry and independent cardinal profiles: rendered behavior and persistence.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(process.env.THERMAL_PLAYWRIGHT_MODULE||'playwright');
const output=process.env.THERMAL_LAYOUT_OUTPUT||'/private/tmp/thermal-circle-sides/qa';fs.mkdirSync(output,{recursive:true});
(async()=>{const browser=await chromium.launch({headless:true}),checks=[],errors=[],measurements=[];try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),base=process.env.THERMAL_URL||'http://127.0.0.1:8766/tools/thermal-flow.html';
 const skipThumbs=body=>body.replace(/requestAnimationFrame\(loop\);\s*renderLookThumbnails\(\);/,'requestAnimationFrame(loop);');
 const prepare=async p=>{p.on('pageerror',e=>errors.push(e.message));await p.route('**/tools/thermal-flow.html*',async r=>{const response=await r.fetch();await r.fulfill({response,body:skipThumbs(await response.text())});});};await prepare(page);
 await page.goto(base+'?p='+encodeURIComponent('サーモフレーム'));await page.waitForFunction(()=>typeof quick!=='undefined'&&quick);
 const note=t=>{checks.push(t);console.log('PASS',t)};
 const reset=()=>page.evaluate(()=>{applyPreset(PRESETS.find(p=>p.name==='サーモフレーム'));state.canvas.mode='11';refreshAll()});
 const record=()=>page.evaluate(()=>stateRecord());
 const patch=f=>page.evaluate(f=>{Object.assign(state.field,f);refreshAll();redraw()},f);
 const shot=(w=240,h=240)=>page.evaluate(({w,h})=>{renderGL(w,h,1);const png=view.toDataURL(),pixels=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let count=0,sx=0,sy=0,xmin=w,xmax=0,ymin=h,ymax=0,centerMax=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,l=Math.max(pixels[i],pixels[i+1],pixels[i+2]);if(l>30){count++;sx+=x;sy+=y;xmin=Math.min(xmin,x);xmax=Math.max(xmax,x);ymin=Math.min(ymin,y);ymax=Math.max(ymax,y)}if(Math.hypot(x-w/2,y-h/2)<Math.min(w,h)*.05)centerMax=Math.max(centerMax,l)}const result={png,count,cx:sx/count/w,cy:sy/count/h,width:xmax-xmin+1,height:ymax-ymin+1,centerMax,error:gl.getError()};redraw();return result},{w,h});
 const save=(name,img)=>fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(img.png.split(',')[1],'base64'));
 const range=(name,value)=>page.locator('#frameLayoutControls').getByRole('slider',{name,exact:true}).evaluate((el,v)=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},value);
 await reset();await page.getByRole('button',{name:'グラデを編集',exact:true}).click();assert.equal(await page.locator('#frameSideDetails').getAttribute('open'),null);assert.equal(await page.locator('#quickControls input[type=range]:visible').count(),3);
 await page.getByRole('combobox',{name:'枠の形',exact:true}).selectOption('circle');
 for(const [w,h] of [[320,480],[480,320],[320,320]]){const img=await shot(w,h);assert.equal(img.error,0);assert.ok(Math.abs(img.width-img.height)<=2);assert.ok(Math.abs(img.width-288)<=2);assert.ok(img.centerMax<8);save('circle-'+w+'-'+h,img);const {png,...stats}=img;measurements.push({w,h,...stats});}
 const big=await shot();await range('円の大きさ %',50);const small=await shot();assert.ok(small.width<big.width*.6);assert.ok(Math.abs(small.width-120)<=2);
 note('circle stays circular in portrait, landscape and square; diameter is editable and center stays empty');
 await range('円の大きさ %',90);await page.locator('#frameSideDetails > summary').click();assert.equal(await page.locator('#frameSideDetails input[type=range]:visible').count(),3);
 // Each direction has a spatially local source, in both geometries.
 for(const shape of ['rect','circle'])for(const side of ['Top','Right','Bottom','Left']){
  await reset();await patch({frameShape:shape,frameFlare:100,...Object.fromEntries(['Top','Right','Bottom','Left'].map(s=>['frame'+s+'Strength',s===side?100:0]))});const img=await shot();assert.ok(img.count>50);
  assert.ok(side==='Top'?img.cy>.66:side==='Bottom'?img.cy<.34:side==='Right'?img.cx>.66:img.cx<.34,JSON.stringify({shape,side,cx:img.cx,cy:img.cy}));save(shape+'-only-'+side,img);
 }
 note('top, right, bottom and left each emit from their corresponding side in rectangular and circular frames');
 for(const shape of ['rect','circle']){
  await reset();await patch({frameShape:shape,frameFlare:100});
  for(const side of ['Top','Right','Bottom','Left'])for(const [param,value,original] of [['Reach',40,100],['Strength',30,100],['Lean',90,0]]){const before=await shot();await patch({['frame'+side+param]:value});assert.notEqual((await shot()).png,before.png,shape+side+param);await patch({['frame'+side+param]:original});}
  await patch(Object.fromEntries(['Top','Right','Bottom','Left'].map(s=>['frame'+s+'Strength',0])));assert.equal((await shot()).count,0);
 }
 note('all twelve individual controls affect rendered pixels in both shapes; zero strength removes all flames');
 await reset();await patch({frameShape:'circle'});await page.getByRole('button',{name:'上の炎を調整',exact:true}).click();const before=await record();await range('上の長さ %',65);assert.equal((await record()).field.frameTopReach,65);assert.equal((await record()).field.frameRightReach,100);
 await page.locator('#btnUndo').click();assert.equal((await record()).field.frameTopReach,100);await page.locator('#btnRedo').click();assert.equal((await record()).field.frameTopReach,65);
 const prior=await record();await page.getByRole('button',{name:'ばらつきを作る',exact:true}).click();const randomized=await record();assert.ok(new Set(['Top','Right','Bottom','Left'].map(s=>randomized.field['frame'+s+'Reach'])).size===4);assert.deepEqual(randomized.lut,prior.lut);assert.deepEqual(randomized.motion,prior.motion);assert.deepEqual(randomized.grain,prior.grain);assert.equal(randomized.seed,prior.seed);assert.equal(randomized.field.frameShape,'circle');assert.equal(randomized.field.framePhase,prior.field.framePhase);
 const randomImage=await shot();await page.locator('#btnUndo').click();assert.equal((await record()).field.frameTopReach,65);await page.locator('#btnRedo').click();assert.equal((await shot()).png,randomImage.png);
 await page.evaluate(()=>varyShape());const varied=await record();for(const side of ['Top','Right','Bottom','Left'])for(const param of ['Reach','Strength','Lean'])assert.equal(varied.field['frame'+side+param],randomized.field['frame'+side+param]);
 await page.getByRole('button',{name:'上下左右を揃える',exact:true}).click();for(const side of ['Top','Right','Bottom','Left'])assert.equal((await record()).field['frame'+side+'Reach'],100);assert.equal((await record()).field.frameShape,'circle');
 note('UI edits one direction at a time; randomized balance preserves palette and time, supports undo, and survives shape variation');
 await page.evaluate(()=>{state.field.frameTopReach=63;state.field.frameRightLean=75;state.field.frameBottomStrength=42;state.field.framePhase=62.5;restoreFramePlayback();refreshAll()});
 const saved=await page.evaluate(()=>({project:projectSnapshot(),hash:encodeState()})),still=await shot();await reset();await page.evaluate(p=>loadProject(p),saved.project);assert.equal((await shot()).png,still.png);
 const fresh=await browser.newPage();await prepare(fresh);await fresh.goto(base+'#'+saved.hash);await fresh.waitForFunction(()=>typeof quick!=='undefined'&&quick);const freshStill=await fresh.evaluate(()=>{renderGL(240,240,1);return view.toDataURL()});assert.equal(freshStill,still.png);await fresh.close();
 const loop=await page.evaluate(()=>{_recording=true;state.motion.on=true;const out=[];for(const t of [0,2,8]){setAnimPhase(t);renderGL(240,240,1);out.push(view.toDataURL())}_recording=false;state.motion.on=false;restoreFramePlayback();return out});assert.notEqual(loop[0],loop[1]);assert.equal(loop[0],loop[2]);
 note('circle and asymmetric profiles survive JSON and a fresh URL load exactly; animation closes its eight-second loop');
 await page.evaluate(p=>loadProject(p),saved.project);const handle=await page.evaluate(()=>gradientHandles().find(h=>h.kind==='frameSize').p);let box=await page.locator('#studioEditCanvas').boundingBox();await page.mouse.move(box.x+handle[0]*box.width,box.y+(1-handle[1])*box.height);await page.mouse.down();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.2,{steps:3});await page.mouse.up();assert.ok(Math.abs((await record()).field.frameSize-60)<2);
 const expected=await page.evaluate(()=>{renderGL(1080,1080,1);return prepareExportArtwork(1080,1080).toDataURL()});const download=page.waitForEvent('download');await page.locator('#btnPng1').click();await(await download).saveAs(path.join(output,'circle-export.png'));const png=fs.readFileSync(path.join(output,'circle-export.png'));assert.ok(png.readUInt32BE(16)>630&&png.readUInt32BE(16)<670);assert.equal(png.readUInt32BE(16),png.readUInt32BE(20));assert.equal(png.toString('base64'),expected.split(',')[1]);
 note('canvas handle resizes the circle and PNG renders at 1080px then trims to the circle without changing its pixels');
 // Loading old state after a customized circle must clear the new geometry/profile fields.
 const baseline=process.env.THERMAL_LAYOUT_BASELINE_FILE;
 if(baseline){const old=await browser.newPage();await old.route('**/tools/thermal-flow.html*',r=>r.fulfill({contentType:'text/html',body:skipThumbs(fs.readFileSync(baseline,'utf8'))}));await old.goto(base);await old.waitForFunction(()=>typeof quick!=='undefined'&&quick);
  for(const name of ['サーモフレーム','四隅フレア','溶融リボン','KVスワール','グラデ','ラジアル']){const legacy=await old.evaluate(name=>{applyPreset(PRESETS.find(p=>p.name===name));renderGL(240,300,1);return{png:view.toDataURL(),project:projectSnapshot()}},name);await page.evaluate(p=>loadProject(p),legacy.project);const result=await page.evaluate(()=>{renderGL(240,300,1);return{png:view.toDataURL(),shape:state.field.frameShape,reach:state.field.frameTopReach}});assert.equal(result.png,legacy.png,name);assert.equal(result.shape,'rect');assert.equal(result.reach,100);}
  await old.close();note('six previous looks and saved projects remain pixel-identical with neutral defaults');
 }
 // A malformed import cannot inject invalid shape/size/profile values into the shader.
 await page.evaluate(()=>{const project=projectSnapshot();project.field.frameShape='invalid';project.field.frameSize=500;project.field.frameTopReach=-30;project.field.frameLeftLean='bad';loadProject(project)});
 const clean=await record();assert.equal(clean.field.frameShape,'rect');assert.equal(clean.field.frameSize,100);assert.equal(clean.field.frameTopReach,0);assert.equal(clean.field.frameLeftLean,0);
 await reset();await page.evaluate(()=>{state.field.frameShape='circle';setPalette(LUT_PRESETS.find(p=>p.name==='基準サーモ'));state.field.frameTopReach=135;state.field.frameRightReach=65;state.field.frameBottomReach=100;state.field.frameLeftReach=85;state.field.frameTopLean=35;state.field.frameRightStrength=65;refreshAll()});
 for(const [width,height] of [[1280,800],[1440,1000]]){await page.setViewportSize({width,height});await page.evaluate(()=>{document.querySelector('#gradientEditor').open=true;document.querySelector('#frameSideDetails').open=true;document.querySelector('#gradientEditor').scrollIntoView()});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.equal(await page.locator('#frameSideDetails input[type=range]:visible').count(),3);await page.screenshot({path:path.join(output,'desktop-'+width+'.png')});}
 save('circle-base-colors',await shot(1080,1080));fs.writeFileSync(path.join(output,'preview-url.txt'),await page.evaluate(()=>location.origin+location.pathname+'#'+encodeState()));
 note('imported values are bounded; individual controls fit 1280px and 1440px desktop layouts');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({time:new Date().toISOString(),checks,measurements,errors},null,2));console.log('LAYOUT RESULT',checks.length,'checks passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
