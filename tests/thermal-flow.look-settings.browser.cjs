// User look changes must preserve production settings and the animation playhead.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pw=require(process.env.THERMAL_PLAYWRIGHT_MODULE||'playwright');
const base=process.env.THERMAL_URL||'http://127.0.0.1:8784/tools/thermal-flow.html';
const output=process.env.THERMAL_LOOK_OUTPUT||'/private/tmp/thermal-look-settings-qa';
fs.mkdirSync(output,{recursive:true});
const checks=[],errors=[];
(async()=>{
 for(const engine of (process.env.THERMAL_LOOK_ENGINES||'chromium,webkit').split(',')){
  const browser=await pw[engine].launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1440,height:1000}});
   page.on('pageerror',e=>errors.push(engine+': '+e.message));page.setDefaultTimeout(60000);
   // Keep these checks focused on editing. The public smoke check includes thumbnails.
   await page.route('**/tools/thermal-flow.html*',async route=>{
    const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/renderLookThumbnails\(\);\s*<\/script>/,'</script>')});
   });
   await page.goto(base);await page.waitForFunction(()=>typeof studioReady!=='undefined'&&studioReady);
   const note=s=>{checks.push(engine+': '+s);console.log('PASS',engine,s)};
   await page.evaluate(()=>{
    window.productionSettings=()=>clone({studio:state.studio,motion:state.motion,canvas:state.canvas,mask:state.mask,grain:state.grain,finish:state.finish,
     lutOptions:{bands:state.lut.bands,invert:state.lut.invert,shift:state.lut.shift},
     layout:Object.fromEntries([...Object.keys(FRAME_LAYOUT_DEFAULTS),'framePhase'].map(k=>[k,state.field[k]])),
     playback:{playing:playback.playing,time:playback.time},frameTime:_frameTime,anim:_animT});
    window.chooseLook=name=>document.querySelector('[data-look="'+name+'"]').click();
   });
   // Distinct non-default values catch accidental resets, including image assets.
   await page.evaluate(async()=>{
    state.canvas={mode:'custom',w:320,h:240};state.studio.aspectLock=true;
    Object.assign(state.studio.gradient,{space:'oklch',interp:'linear',sharpness:47,repeat:2});
    Object.assign(state.studio.noise,{on:true,type:'curl',amount:13,scale:4});
    Object.assign(state.studio.diffuse,{on:true,scatter:24});
    Object.assign(state.studio.stretch,{on:true,amount:12});
    Object.assign(state.studio.normal,{on:true,strength:.2});
    Object.assign(state.studio.distort,{on:true,strokes:[{x:.5,y:.5,dx:.03,dy:.04,r:.2,strength:1,hardness:1.8,mode:'warp'}]});
    Object.assign(state.studio.post,{on:true,type:'mirror',amount:31});
    Object.assign(state.studio.animation,{fps:24,rate:1.25,bpm:96,beats:8,autoKey:true,remap:true,pingpong:true,curve:[.2,.1,.8,.9],tracks:[{path:'studio.noise.evolution',enabled:true,keys:[{t:0,v:0,ease:'linear'},{t:12,v:2,ease:'ease'}]}]});
    Object.assign(state.studio.output,{name:'retained-artwork',quality:.82});
    Object.assign(state.grain,{mode:'tone',amount:18,size:2,paper:'#e8e5dc'});
    Object.assign(state.finish,{bg:18,bgTop:'#ead4c4',bgBot:'#1a214b'});
    Object.assign(state.lut,{bands:7,invert:true,shift:12});
    Object.assign(state.field,{frameShape:'circle',frameSize:73,frameTopReach:120,frameRightStrength:42,frameLeftLean:-30});
    const canvas=document.createElement('canvas');canvas.width=40;canvas.height=40;const ctx=canvas.getContext('2d');ctx.fillStyle='#47aacc';ctx.fillRect(5,5,30,30);
    const data=canvas.toDataURL(),img=new Image();img.src=data;await img.decode();
    overlayImage=img;slitImage=img;_maskImg=img;
    Object.assign(state.studio.image,{on:true,data,mode:'overlay',opacity:.3});
    Object.assign(state.studio.slit,{on:true,image:true,imageData:data,width:24,count:3});
    Object.assign(state.mask,{on:true,src:'image',transparent:true,imgSize:60});
   });
   for(const mode of ['playing','paused','off']){
    const result=await page.evaluate(mode=>{
     Object.assign(state.motion,{on:mode!=='off',paused:mode!=='playing',loop:false,loopSec:12,evo:38,sway:17,speed:43,hue:22});
     playback.playing=mode==='playing';playback.time=2.5;playback.last=performance.now();
     state.field.framePhase=2.5/12*100;setAnimPhase(timelineTime());
     if(!state.motion.on)_animT={z:0,x:0,h:0};refreshAll();
     const before=productionSettings(),assets=[overlayImage,slitImage,_maskImg];
     return{before,looks:PRESETS.map(p=>{chooseLook(p.name);return{name:p.name,settings:productionSettings(),assetsRetained:assets.every((im,i)=>im===[overlayImage,slitImage,_maskImg][i]),checked:UI.motOn.row.querySelector('input').checked,mode:state.field.mode,expected:p.field.mode}})};
    },mode);
    assert.equal(result.looks.length,18);
    for(const look of result.looks){assert.deepEqual(look.settings,result.before,mode+' / '+look.name);assert.equal(look.assetsRetained,true);assert.equal(look.checked,mode!=='off');assert.equal(look.mode,look.expected);}
    note('all 18 looks retain '+mode+' state, playhead, effects, keyframes, assets and output settings');
   }
   const shapes=await page.evaluate(()=>{
    state.motion.on=true;state.motion.paused=true;playback.playing=false;playback.time=2.5;setAnimPhase(timelineTime());refreshAll();
    const before=productionSettings(),select=document.querySelector('[aria-label="グラデーションの形"]');
    return{before,states:['frame','corner','ribbon','radial','frame'].map(shape=>{select.value=shape;select.dispatchEvent(new Event('change',{bubbles:true}));return productionSettings()})};
   });
   for(const value of shapes.states)assert.deepEqual(value,shapes.before);
   note('shape dropdown also preserves motion and all independent settings');
   const history=await page.evaluate(()=>{
    UNDO.length=0;REDO.length=0;syncHistoryUI();
    const before=productionSettings(),oldField=clone(state.field),oldStops=clone(state.lut.stops);
    chooseLook('溶融リボン');const field=clone(state.field),stops=clone(state.lut.stops);
    document.querySelector('#btnUndo').click();const undone={settings:productionSettings(),field:clone(state.field),stops:clone(state.lut.stops)};
    document.querySelector('#btnRedo').click();return{before,oldField,oldStops,field,stops,undone,redone:{settings:productionSettings(),field:clone(state.field),stops:clone(state.lut.stops)}};
   });
   assert.deepEqual(history.undone,{settings:history.before,field:history.oldField,stops:history.oldStops});
   assert.deepEqual(history.redone,{settings:history.before,field:history.field,stops:history.stops});
   note('undo and redo restore the look without resetting the paused playhead or settings');
   // Exercise real pointer input, live animation and its resulting artwork.
   await page.evaluate(()=>{applyPreset(PRESETS.find(p=>p.name==='グラデ'));state.mask.on=false;state.canvas={mode:'custom',w:320,h:240};state.motion.loopSec=12;refreshAll()});
   await page.getByRole('checkbox',{name:'モーション',exact:true}).check();
   await page.getByRole('button',{name:'ルック: サーモフレーム',exact:true}).click();
   const start=await page.evaluate(()=>playback.time);await page.waitForFunction(t=>playback.time>t+.1,start);
   assert.equal(await page.getByRole('checkbox',{name:'モーション',exact:true}).isChecked(),true);
   await page.locator('#framePlay').click();
   const paused=await page.evaluate(()=>({time:playback.time,settings:productionSettings()}));
   const pixels=[];
   for(const look of ['ラジアル','溶融リボン','サーモフレーム']){
    await page.getByRole('button',{name:'ルック: '+look,exact:true}).click();
    assert.equal(await page.evaluate(()=>playback.time),paused.time);
    assert.equal(await page.evaluate(()=>playback.playing),false);
    pixels.push(await page.evaluate(()=>{renderGL(240,180,1);return view.toDataURL()}));
   }
   assert.equal(new Set(pixels).size,3);await page.screenshot({path:path.join(output,engine+'-paused.png')});
   note('pointer-selected looks continue animating; pause remains frozen while the artwork changes');
   const download=page.waitForEvent('download');await page.locator('#btnHtml').click();
   const exported=path.join(output,engine+'-after-switch.html');await(await download).saveAs(exported);
   const player=await browser.newPage();player.on('pageerror',e=>errors.push(engine+' player: '+e.message));
   await player.route(/^https?:/,route=>route.abort());await player.goto('file://'+exported);
   await player.waitForFunction(()=>document.querySelector('#artwork')?.dataset.ready==='true');
   assert.equal(await player.evaluate(()=>thermalFlow.duration),12);assert.equal(await player.evaluate(()=>thermalFlow.playing),false);assert.equal(await player.evaluate(()=>thermalFlow.time),paused.time);
   await player.close();note('standalone HTML keeps the retained duration and paused time after look changes');
   const initial=await page.evaluate(()=>{applyPreset(PRESETS.find(p=>p.name==='Webフロー'));return{on:state.motion.on,duration:state.motion.loopSec,noise:state.studio.noise.on}});
   assert.deepEqual(initial,{on:true,duration:16,noise:false});
   note('fresh preset initialization still applies its original defaults');
  }finally{await browser.close();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({at:new Date().toISOString(),checks,errors},null,2))}
 }
 assert.deepEqual(errors,[]);console.log('RESULT',checks.length,'checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
