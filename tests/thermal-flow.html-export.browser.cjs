const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pw=require(process.env.THERMAL_PLAYWRIGHT_MODULE||'playwright');
const out=process.env.THERMAL_HTML_OUTPUT||'/private/tmp/thermal-html-qa';fs.mkdirSync(out,{recursive:true});
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/thermal-html-banner.json'),'utf8'));
const url=process.env.THERMAL_URL||'http://127.0.0.1:8783/tools/thermal-flow.html';
const results=[],errors=[];
const pass=s=>{results.push(s);console.log('PASS',s)};
(async()=>{for(const engine of (process.env.THERMAL_HTML_ENGINES||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch({headless:true});try{
 const editor=await browser.newPage({viewport:{width:1440,height:1000}});editor.on('pageerror',e=>errors.push(engine+' editor: '+e.message));editor.setDefaultTimeout(90000);
 // Thumbnail rendering is covered by the editor checks; keep this test focused on artwork.
 await editor.route('**/tools/thermal-flow.html*',async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text()).replace(/renderLookThumbnails\(\);\s*<\/script>/,'</script>')})});
 const hash=Buffer.from(JSON.stringify(fixture)).toString('base64');await editor.goto(url+'#'+hash);await editor.waitForFunction(()=>typeof studioReady!=='undefined'&&studioReady);
 await editor.evaluate(()=>{playback.playing=false;playback.time=0;setAnimPhase(0);renderGL(...renderSize(),1)});
 assert.deepEqual(await editor.evaluate(()=>fullSize()),[1376,260]);
 const original=await editor.evaluate(()=>stateRecord());
 const pending=editor.waitForEvent('download');await editor.locator('#btnHtml').click();const download=await pending;
 assert.equal(download.suggestedFilename(),'thermal-flow.html');const file=path.join(out,engine+'-banner.html');await download.saveAs(file);
 assert.deepEqual(await editor.evaluate(()=>stateRecord()),original);assert.equal(await editor.evaluate(()=>_recording),false);
 await editor.screenshot({path:path.join(out,engine+'-editor.png')});
 const context=await browser.newContext({viewport:{width:1376,height:260},offline:engine==='chromium'});
 const player=await context.newPage(),requests=[];player.on('pageerror',e=>errors.push(engine+' player: '+e.message));player.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url())});
 // WebKit's offline emulation rejects file:// navigation; block HTTP(S) instead.
 await player.route(/^https?:/,route=>route.abort());
 async function open(file){await player.goto('file://'+file);await player.waitForFunction(()=>document.querySelector('#artwork')?.dataset.ready==='true');}
 async function expected(time){return editor.evaluate(t=>{playback.playing=false;playback.time=t;if(state.motion.on)setAnimPhase(remapTime(t));const[w,h]=renderSize();renderGL(w,h,1);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(composeArtwork(w,h),0,0);return c.toDataURL()},time)}
 async function actual(time){return player.evaluate(t=>{thermalFlow.seek(t);return document.querySelector('#artwork').toDataURL()},time)}
 await open(file);assert.equal(await player.evaluate(()=>thermalFlow.duration),15);
 const frames=[];for(const time of [0,3.75,7.5,15]){const want=await expected(time),got=await actual(time);assert.equal(got,want,engine+' banner at '+time);frames.push(got)}assert.equal(frames[0],frames[3]);assert.notEqual(frames[0],frames[1]);
 await player.screenshot({path:path.join(out,engine+'-banner.png')});
 pass(engine+': downloaded 1376×260 HTML matches native frames at 0/3.75/7.5/15s; loop endpoints match');
 // Canvas backing resolution stays native while CSS contains it without stretching.
 await player.setViewportSize({width:800,height:500});assert.equal(await player.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(await player.locator('#artwork').evaluate(c=>[c.width,c.height,getComputedStyle(c).objectFit]),[1376,260,'contain']);
 await player.evaluate(()=>{thermalFlow.seek(14.9);thermalFlow.play()});await player.waitForFunction(()=>thermalFlow.time<1&&thermalFlow.playing,null,{timeout:15000});await player.locator('#play').click();assert.equal(await player.evaluate(()=>thermalFlow.playing),false);
 pass(engine+': responsive display, playback, pause and automatic loop work offline');
 const scenes=engine==='chromium'?['circle','text-mask','image-mask','overlay','slit-image','effects','keyframes','static']:['circle'];
 for(const scene of scenes){
  await editor.evaluate(async scene=>{
   playback.playing=false;playback.time=0;state.canvas={mode:'custom',w:320,h:240};state.studio=normalizeStudio();state.mask.on=false;state.motion.on=true;state.motion.loop=true;state.motion.loopSec=4;state.field.norm=false;state.field.mode='ribbon';_maskImg=null;slitImage=null;overlayImage=null;
   Object.assign(state.field,{frameShape:'rect',frameReach:30,frameFlow:52,frameLayers:45});
   if(scene==='circle'){state.field.mode='frame';state.field.frameShape='circle';state.field.frameSize=82;}
   if(scene==='text-mask')Object.assign(state.mask,{on:true,src:'text',text:'TEST',text2:'',size:32,transparent:true});
   if(['image-mask','overlay','slit-image'].includes(scene)){
    const c=document.createElement('canvas');c.width=80;c.height=60;const x=c.getContext('2d');x.fillStyle='#ff3000';x.fillRect(4,5,30,50);x.fillStyle='#0066ff';x.fillRect(42,15,30,25);const src=c.toDataURL(),im=new Image();im.src=src;await im.decode();
    if(scene==='image-mask'){Object.assign(state.mask,{on:true,src:'image',transparent:true});_maskImg=im;}
    if(scene==='overlay'){Object.assign(state.studio.image,{on:true,data:src,opacity:.7,size:50,x:60,y:40});overlayImage=im;}
    if(scene==='slit-image'){Object.assign(state.studio.slit,{on:true,image:true,imageData:src,count:6});slitImage=im;gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,slitTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,lutTex);}
   }
   if(scene==='effects'){Object.assign(state.studio.gradient,{space:'oklch',interp:'cardinal',sharpness:45});Object.assign(state.studio.noise,{on:true,amount:20});Object.assign(state.studio.stretch,{on:true,glow:true});state.studio.distort.on=true;state.studio.distort.strokes=[{x:.5,y:.5,dx:.1,dy:.05,r:.4,strength:1,hardness:1.8,mode:'warp'}];Object.assign(state.studio.post,{on:true,type:'distort',strokes:[{x:.2,y:.5,dx:.05,dy:-.1,r:.3,strength:1,hardness:2,mode:'swirl'}]});}
   if(scene==='keyframes'){state.studio.animation.remap=true;state.studio.animation.pingpong=true;state.studio.animation.tracks=[{path:'field.flowAngle',enabled:true,keys:[{t:0,v:20,ease:'ease'},{t:4,v:130,ease:'ease'}]},{path:'lut.stops.2.c',enabled:true,keys:[{t:0,v:'#00ff00',ease:'ease'},{t:4,v:'#ff00ff',ease:'ease'}]}];}
   if(scene==='static'){state.motion.on=false;_animT={z:0,x:0,h:0};state.studio.output.name='</script><script>window.injected=true</script>';}
   _blobs=blobState();setAnimPhase(0);if(!state.motion.on)_animT={z:0,x:0,h:0};buildLut();renderGL(320,240,1);
  },scene);
  const html=await editor.evaluate(()=>buildStandaloneHTML()),sceneFile=path.join(out,engine+'-'+scene+'.html');fs.writeFileSync(sceneFile,html);await open(sceneFile);
  for(const time of [0,1.2])assert.equal(await actual(time),await expected(time),engine+' '+scene+' at '+time);
  if(scene==='circle'||scene.includes('mask'))assert.equal(await player.locator('#artwork').evaluate(c=>c.getContext('2d').getImageData(0,0,1,1).data[3]),0);
  if(scene==='static'){assert.equal(await player.locator('#play').isVisible(),false);assert.equal(await player.evaluate(()=>window.injected),undefined);}
  pass(engine+': '+scene+' matches editor, including alpha and embedded assets');
 }
 if(engine==='chromium'){
  const shortHTML=await editor.evaluate(()=>{state.studio.output.name='thermal-flow';state.studio.animation.remap=false;state.studio.animation.pingpong=false;state.studio.animation.tracks=[];state.motion.on=true;state.motion.loop=false;state.motion.loopSec=.3;playback.playing=true;playback.time=0;setAnimPhase(0);renderGL(320,240,1);return buildStandaloneHTML()});
  const shortFile=path.join(out,'one-shot.html');fs.writeFileSync(shortFile,shortHTML);
  await player.emulateMedia({reducedMotion:'reduce'});await open(shortFile);await player.waitForTimeout(200);assert.equal(await player.evaluate(()=>thermalFlow.playing),false);assert.equal(await player.evaluate(()=>thermalFlow.time),0);
  await player.locator('#play').click();await player.waitForFunction(()=>!thermalFlow.playing);assert.equal(await player.evaluate(()=>thermalFlow.time),.3);assert.equal(await player.locator('#play').textContent(),'もう一度');
  await player.emulateMedia({reducedMotion:'no-preference'});await open(shortFile);await player.waitForFunction(()=>thermalFlow.time>0);await player.waitForFunction(()=>!thermalFlow.playing);assert.equal(await player.evaluate(()=>thermalFlow.time),.3);
  pass('chromium: reduced motion pauses automatically; one-shot playback stops at its end and can replay');
 }
 assert.deepEqual(requests,[]);await context.close();
 }finally{await browser.close();fs.writeFileSync(path.join(out,engine+'-report.json'),JSON.stringify({at:new Date().toISOString(),results:results.filter(s=>s.startsWith(engine+':')),errors},null,2))}
}
assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({at:new Date().toISOString(),results,errors},null,2));console.log('RESULT',results.length,'checks passed');
})().catch(e=>{console.error(e);process.exit(1)});
