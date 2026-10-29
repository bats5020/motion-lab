// Thermal frame: static selection, animated preview and exact still persistence.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require(process.env.THERMAL_PLAYWRIGHT_MODULE||'playwright');
const output=process.env.THERMAL_FRAME_OUTPUT||'/private/tmp/thermal-frame-qa';fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({headless:true}),checks=[],errors=[],measurements=[];
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.THERMAL_URL||'http://127.0.0.1:8766/tools/thermal-flow.html';
  await page.goto(base+'?p='+encodeURIComponent('サーモフレーム')+'&size=916');
  await page.waitForFunction(()=>document.querySelectorAll('[data-ready=true]').length===PRESETS.length,{},{timeout:120000});
  const note=t=>{checks.push(t);console.log('PASS',t)};
  const record=()=>page.evaluate(()=>stateRecord());
  const range=async(name,v,scope='#stage')=>page.locator(scope).getByRole('slider',{name,exact:true}).evaluate((el,v)=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));},v);
  const choose=()=>page.getByRole('button',{name:'ルック: サーモフレーム',exact:true}).click();
  const capture=(w=240,h=400)=>page.evaluate(({w,h})=>{
   renderGL(w,h,1);const png=view.toDataURL(),px=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
   let bright=0,centerMax=0;const edges=[0,0,0,0];for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,l=Math.max(...px.subarray(i,i+3));if(l>30){bright++;if(x<w*.2)edges[0]++;if(x>w*.8)edges[1]++;if(y<h*.2)edges[2]++;if(y>h*.8)edges[3]++;}if(x>w*.4&&x<w*.6&&y>h*.4&&y<h*.6)centerMax=Math.max(centerMax,l);}
   redraw();return{png,bright:bright/(w*h),centerMax,edges,error:gl.getError()};
  },{w,h});
  const save=(name,png)=>fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(png.split(',')[1],'base64'));
  let s=await record();assert.equal(s.field.mode,'frame');assert.equal(s.motion.on,false);assert.equal(s.grain.amount,0);assert.equal(s.studio.noise.amount,0);assert.equal(s.field.framePhase,25);
  assert.equal(await page.locator('#quickControls input[type=range]:visible').count(),3);assert.equal(await page.locator('#framePreviewBar').isVisible(),true);
  for(const [w,h] of [[240,400],[400,240],[300,300]]){const img=await capture(w,h);assert.equal(img.error,0);assert.ok(img.edges.every(n=>n>300));assert.ok(img.centerMax<8);assert.ok(img.bright>.03&&img.bright<.5);save('aspect-'+w+'-'+h,img.png);const {png,...stats}=img;measurements.push({w,h,...stats});}
  note('frame starts as a still with zero grain; portrait, landscape and square keep glowing edges and an empty center');
  const original=await capture(),before=await record();await range('表示する瞬間',62.5);const selected=await capture();assert.notEqual(selected.png,original.png);await page.waitForTimeout(450);assert.equal((await capture()).png,selected.png);
  await page.locator('#btnUndo').click();assert.equal((await capture()).png,original.png);await page.locator('#btnRedo').click();assert.equal((await capture()).png,selected.png);
  const staticProject=await page.evaluate(()=>projectSnapshot());await page.evaluate(p=>{applyPreset(PRESETS.find(p=>p.name==='グラデ'));loadProject(p)},staticProject);assert.equal((await capture()).png,selected.png);
  note('scrubbing changes the still without playback; undo, redo and JSON restore the selected moment');
  await page.getByRole('button',{name:'動きを見る',exact:true}).click();await page.waitForFunction(()=>playback.time>5.15);await page.getByRole('button',{name:'この瞬間で止める',exact:true}).click();
  const frozen=await capture(),paused=await record();assert.equal(paused.motion.paused,true);assert.equal(paused.motion.on,true);const time=await page.evaluate(()=>playback.time);await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>playback.time),time);assert.equal((await capture()).png,frozen.png);
  const project=await page.evaluate(()=>projectSnapshot()),hash=await page.evaluate(()=>encodeState());
  await page.evaluate(p=>{applyPreset(PRESETS.find(p=>p.name==='ラジアル'));loadProject(p)},project);assert.equal((await capture()).png,frozen.png);assert.equal(await page.evaluate(()=>playback.playing),false);
  // A real page load tests initialization order, beyond decodeState in an existing editor.
  const fresh=await browser.newPage({viewport:{width:1280,height:800}});fresh.on('pageerror',e=>errors.push(e.message));
  await fresh.route('**/tools/thermal-flow.html*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/requestAnimationFrame\(loop\);\s*renderLookThumbnails\(\);/,'requestAnimationFrame(loop);')});});
  await fresh.goto(base+'#'+hash);await fresh.waitForFunction(()=>typeof quick!=='undefined'&&quick);
  const restored=await fresh.evaluate(()=>{renderGL(240,400,1);return{png:view.toDataURL(),playing:playback.playing,phase:state.field.framePhase}});assert.equal(restored.png,frozen.png);assert.equal(restored.playing,false);assert.equal(restored.phase,paused.field.framePhase);await fresh.close();
  note('play/pause freezes the actual frame; project JSON and a fresh URL load reproduce it exactly');
  await choose();const areas=[];for(const v of [0,50,100]){await range('光の広がり',v,'#quickControls');areas.push((await capture()).bright);}assert.ok(areas[0]<areas[1]&&areas[1]<areas[2]);
  await range('炎の出方',20,'#quickControls');const sparse=await capture();await range('炎の出方',95,'#quickControls');const full=await capture();assert.ok(sparse.bright<full.bright);measurements.push({reachAreas:areas,flareAreas:[sparse.bright,full.bright]});
  await choose();const chosenPhase=(await record()).field.framePhase;await page.locator('#btnShape').click();assert.notEqual((await capture()).png,original.png);assert.deepEqual((await record()).lut,before.lut);assert.equal((await record()).field.framePhase,chosenPhase);
  note('primary controls change glow area and density; shape variations preserve palette and the selected moment');
  await choose();await page.getByRole('button',{name:'グラデを編集',exact:true}).click();
  assert.equal(await page.getByRole('combobox',{name:'グラデーションの形',exact:true}).inputValue(),'frame');assert.equal(await page.locator('#gradientGeometry input[type=range]:visible').count(),7);
  for(const [name,v] of [['炎の細かさ',55],['流れの伸び',90],['層の重なり',90],['枠線の太さ %',3],['色のにじみ',30]]){const image=await capture();await range(name,v,'#gradientGeometry');assert.notEqual((await capture()).png,image.png);}
  await page.getByRole('button',{name:'形をリセット',exact:true}).click();assert.equal((await record()).field.frameScale,3);
  const start=await page.evaluate(()=>gradientHandles().find(h=>h.kind==='frameReach').p),box=await page.locator('#studioEditCanvas').boundingBox();
  await page.mouse.move(box.x+start[0]*box.width,box.y+(1-start[1])*box.height);await page.mouse.down();await page.mouse.move(box.x+.46*box.width,box.y+.5*box.height,{steps:3});await page.mouse.up();assert.ok((await record()).field.frameReach>30);
  const pal=(await record()).lut;await page.getByRole('combobox',{name:'グラデーションの形',exact:true}).selectOption('line');assert.equal(await page.locator('#framePreviewBar').isVisible(),false);await page.getByRole('combobox',{name:'グラデーションの形',exact:true}).selectOption('frame');assert.deepEqual((await record()).lut,pal);
  await page.locator('#gradientEditor > summary').click();await page.evaluate(()=>{studioEdit='';document.querySelector('#studioEditCanvas').style.pointerEvents='none';drawStudioHandles()});
  note('detailed controls and canvas handles affect the frame; changing geometry preserves the palette');
  await choose();const frames=await page.evaluate(()=>{_recording=true;state.motion.on=true;const out=[];for(const t of [0,2,8]){setAnimPhase(t);renderGL(240,400,1);out.push(view.toDataURL());}_recording=false;state.motion.on=false;restoreFramePlayback();return out});assert.notEqual(frames[0],frames[1]);assert.equal(frames[0],frames[2]);
  note('animated thermal glow closes an eight-second loop without a visible seam');
  await choose();await range('表示する瞬間',62.5);
  const expected=await page.evaluate(()=>{renderGL(1080,1920,1);return prepareExportArtwork(1080,1920).toDataURL()});const download=page.waitForEvent('download');await page.locator('#btnPng1').click();const file=await download;await file.saveAs(path.join(output,'thermal-frame.png'));
  const png=fs.readFileSync(path.join(output,'thermal-frame.png'));assert.equal(png.readUInt32BE(16),1080);assert.equal(png.readUInt32BE(20),1920);assert.equal(png.toString('base64'),expected.split(',')[1]);
  const mask=await page.evaluate(()=>{state.mask.on=true;state.mask.text='FLOW';state.mask.text2='';state.mask.size=20;state.mask.transparent=true;renderGL(240,400,1);const c=prepareExportArtwork(240,400);state.mask.on=false;refreshAll();return[c.width,c.height]});assert.ok(mask[0]<240&&mask[1]<400&&mask[0]>0&&mask[1]>0);
  note('1080×1920 PNG matches the selected still exactly and existing mask export trims correctly');
  // Exporting animation from a still must neither animate the editor nor discard its selected frame.
  await page.evaluate(()=>{state.canvas.mode='custom';state.canvas.w=120;state.canvas.h=200;state.motion.loopSec=1;state.studio.animation.fps=12;restoreFramePlayback();refreshAll()});
  const exportBefore=await capture(),exportState=await record();const zipDownload=page.waitForEvent('download');await page.evaluate(()=>exportFrames('zip'));const zip=await zipDownload;await zip.saveAs(path.join(output,'frames.zip'));
  assert.deepEqual(await record(),exportState);assert.equal((await capture()).png,exportBefore.png);
  const zipInfo=JSON.parse(execFileSync('python3',['-c','import zipfile,hashlib,json,sys; z=zipfile.ZipFile(sys.argv[1]); p=[n for n in z.namelist() if n.endswith(".png")]; print(json.dumps({"count":len(p),"different":len({hashlib.sha256(z.read(n)).hexdigest() for n in p}),"bad":z.testzip()}))',path.join(output,'frames.zip')],{encoding:'utf8'}));assert.equal(zipInfo.count,12);assert.equal(zipInfo.different,12);assert.equal(zipInfo.bad,null);
  note('animation export from a still restores the same paused composition');
  await choose();await page.evaluate(()=>{state.canvas.mode='916';refreshAll()});
  for(const [width,height] of [[1280,800],[1440,1000]]){await page.setViewportSize({width,height});await page.evaluate(()=>document.querySelector('#panelScroll').scrollTop=0);await page.waitForTimeout(200);
   assert.equal(await page.evaluate(()=>{const b=document.querySelector('#framePreviewBar').getBoundingClientRect(),v=view.getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth&&b.bottom<innerHeight&&b.top>=v.bottom&&b.left>=0}),true);await page.screenshot({path:path.join(output,'desktop-'+width+'.png')});
  }
  note('frame playback controls and artwork fit both desktop sizes');
  // Pixel regression: extra frame uniforms and paused playback must not alter existing modes.
  const baseline=process.env.THERMAL_FRAME_BASELINE_FILE;
  if(baseline){const old=await browser.newPage();await old.route('**/tools/thermal-flow.html*',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(baseline,'utf8').replace(/requestAnimationFrame\(loop\);\s*renderLookThumbnails\(\);/,'requestAnimationFrame(loop);')}));await old.goto(base);await old.waitForFunction(()=>typeof quick!=='undefined'&&quick);
   for(const name of ['四隅フレア','溶融リボン','KVスワール','グラデ','ラジアル']){const get=name=>{applyPreset(PRESETS.find(p=>p.name===name));renderGL(240,300,1);return view.toDataURL()};assert.equal(await page.evaluate(get,name),await old.evaluate(get,name),name);}
   const legacy=await old.evaluate(()=>{applyPreset(PRESETS.find(p=>p.name==='サーモフレーム'));renderGL(240,300,1);return{project:projectSnapshot(),png:view.toDataURL()}});
   await page.evaluate(p=>loadProject(p),legacy.project);const restoredLegacy=await page.evaluate(()=>{renderGL(240,300,1);return{png:view.toDataURL(),flow:state.field.frameFlow,layers:state.field.frameLayers}});assert.equal(restoredLegacy.png,legacy.png);assert.equal(restoredLegacy.flow,legacy.project.field.frameFlow??0);assert.equal(restoredLegacy.layers,legacy.project.field.frameLayers??0);
   await old.close();note('five existing looks and a legacy frame project remain pixel-identical to the baseline');
  }
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({time:new Date().toISOString(),checks,measurements,errors},null,2));console.log('FRAME RESULT',checks.length,'checks passed');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
