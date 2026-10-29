// Authorized F6/F7 regressions. Executes actual bounded production functions with controlled IO.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const html=name=>fs.readFileSync(path.join(root,`tools/${name}.html`),'utf8');
function region(name,id){const s=html(name),a=`/* QA_FIX_BEGIN:${id} */`,b=`/* QA_FIX_END:${id} */`;assert.equal(s.split(a).length,2);return s.slice(s.indexOf(a)+a.length,s.indexOf(b));}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tick=()=>new Promise(r=>setImmediate(r));
function classes(){const values=new Set();return{add:v=>values.add(v),remove:v=>values.delete(v),contains:v=>values.has(v)};}
function exporter(tool,options={}){
 const buttons=new Map(),log={probe:0,starts:0,ends:0,saves:0,frames:0,closedFrames:0,paused:0,resumed:0,tracks:0,toasts:[],encoders:[]};
 const button=id=>{if(!buttons.has(id))buttons.set(id,{classList:classes(),textContent:'',disabled:false});return buttons.get(id);};
 const env={recording:null,EX:{on:false,stop:false},FPS:1,W:100,H:100,view:{},cv:{},window:{gsap:{}},mlFlameHistory:{refresh(){}},mlHudHistory:{refresh(){}},outSize:()=>[100,100],totalDur:()=>1,stamp:()=> 'test',opaqueMode:()=>0,
  pickMp4Config:()=>{log.probe++;return options.config||Promise.resolve({codec:'avc1'});},
  $:button,exBtn:button('exBtn'),setBusy:(busy)=>{log.busy=busy;if(!busy)button('rec').classList.remove('rec');},toast:m=>log.toasts.push(m),
  beginSession:()=>{log.starts++;env.recording={stop:false,head:0,wasPlaying:true};return env.recording;},endSession:()=>{log.ends++;env.recording=null;},
  seekScenesExact:async()=>{},render:()=>{log.frames++;},syncBar(){},makeMp4:()=>({size:100}),dl:()=>{log.saves++;},saveFile:async()=>{if(options.saveFailure)throw Error('save failed');log.saves++;},
  play(){},boot:()=>{log.starts++;},mt:{startTime:()=>0,totalDuration:()=>0},frameOnly:false,gsap:{globalTimeline:{pause:()=>{log.paused++;},resume:()=>{log.resumed++;}}},
  clip:{readyState:4,src:'blob:ready',duration:0},stepTo:async()=>{log.frames++;},performance:{now:()=>10000},requestAnimationFrame:fn=>queueMicrotask(fn),setTimeout:fn=>queueMicrotask(fn),Uint8Array,Blob,
  VideoFrame:class{close(){log.closedFrames++;}},
  VideoEncoder:class{
   constructor({output}){if(options.constructorFailure)throw Error('constructor failed');this.output=output;this.state='unconfigured';this.encodeQueueSize=0;log.encoders.push(this);}
   configure(){if(options.configureFailure)throw Error('configure failed');this.state='configured';}
   encode(){if(options.encodeFailure)throw Error('encode failed');this.output({byteLength:1,copyTo(){},type:'key',timestamp:0},{decoderConfig:{description:new Uint8Array([1])}});}
   async flush(){if(options.flush)await options.flush;if(options.flushFailure)throw Error('flush failed');}
   close(){this.state='closed';}
  }
 };
 const context=vm.createContext(env);vm.runInContext(region(tool,tool==='flame-transition'?'flame-export-single-flight':'hud-export-single-flight')+'\nthis.invoke=exportMp4;',context);
 return{env,context,log,button,invoke:context.invoke,run:s=>vm.runInContext(s,context)};
}
for(const tool of ['flame-transition','u19-hud-sequence']){
 test(`${tool}: preflight is single-flight and a second activation requests cancellation`,async()=>{
  const gate=deferred(),x=exporter(tool,{config:gate.promise});const first=x.invoke();assert.equal(x.log.probe,1);assert.equal(x.button(tool==='flame-transition'?'rec':'exBtn').classList.contains('rec'),true);
  await x.invoke();assert.equal(x.log.probe,1);gate.resolve({codec:'avc1'});await first;assert.equal(x.log.starts,0);assert.equal(x.log.saves,0);assert.equal(x.button(tool==='flame-transition'?'rec':'exBtn').classList.contains('rec'),false);
  assert.equal(tool==='flame-transition'?x.run('mlFlameExportPending'):x.env.EX.pending,null);assert.ok(x.log.toasts.some(t=>t.includes('中止')));
  await x.invoke();assert.equal(x.log.starts,1);assert.equal(x.log.saves,1,'a new export works after cancellation');
 });
 for(const failure of ['preflight','constructor','configure','encode','flush'])test(`${tool}: ${failure} failure clears busy state and releases owned resources`,async()=>{
  const gate=deferred(),options=failure==='preflight'?{config:gate.promise}:{[failure+'Failure']:true};const x=exporter(tool,options),task=x.invoke();if(failure==='preflight')gate.reject(Error('probe failed'));await task;
  assert.equal(x.log.saves,0);assert.equal(x.button(tool==='flame-transition'?'rec':'exBtn').classList.contains('rec'),false);assert.equal(tool==='flame-transition'?x.run('mlFlameExportPending'):x.env.EX.pending,null);
  assert.ok(x.log.encoders.every(e=>e.state==='closed'));assert.equal(x.log.starts,tool==='flame-transition'?x.log.ends:x.log.resumed);assert.ok(x.log.toasts.some(t=>t.includes('失敗')));
  if(failure==='encode')assert.equal(x.log.closedFrames,1,'failed encode still closes the VideoFrame');
 });
 test(`${tool}: active cancellation during flush never saves and keeps session locked until flush settles`,async()=>{
  const gate=deferred(),x=exporter(tool,{flush:gate.promise}),task=x.invoke();await tick();await x.invoke();assert.equal(x.button(tool==='flame-transition'?'rec':'exBtn').classList.contains('rec'),true);gate.resolve();await task;assert.equal(x.log.saves,0);assert.ok(x.log.encoders.every(e=>e.state==='closed'));assert.equal(x.button(tool==='flame-transition'?'rec':'exBtn').classList.contains('rec'),false);
 });
}
test('HUD: rejected save cleans up encoder and resumes timeline',async()=>{const x=exporter('u19-hud-sequence',{saveFailure:true});await x.invoke();assert.equal(x.log.saves,0);assert.equal(x.env.EX.on,false);assert.equal(x.env.EX.pending,null);assert.equal(x.log.resumed,1);assert.ok(x.log.encoders.every(e=>e.state==='closed'));});
test('preflight locks are integrated with native history and source replacement',()=>{
 assert.match(region('flame-transition','flame-export-history-busy'),/isBusy:\(\)=>!!recording\|\|!!mlFlameExportPending/);
 assert.match(region('u19-hud-sequence','hud-export-history-busy'),/EX\.on\|\|!!EX\.pending\|\|mlHudLoading/);
 assert.match(region('u19-hud-sequence','hud-export-media-lock'),/EX\.on\|\|EX\.pending\|\|mlHudLoading/);
});
function imageCache(){
 let serial=0;const elements=new Map(),el=id=>{if(!elements.has(id))elements.set(id,{disabled:false,value:''});return elements.get(id);};
 const env={assets:[],config:{},selected:null,samples:false,preset:'',time:0,playing:false,busy:false,undoStack:[],redoStack:[],images:new Map(),mlImageGesture:null,mlImageHistory:null,$:el,
  normalizeConfig:x=>x,decodeImage:async()=>({naturalWidth:100,naturalHeight:100}),readData:async()=> 'data:image/png;base64,test',crypto:{randomUUID:()=>String(++serial)},clamp:(v,a,b)=>Math.min(b,Math.max(a,v)),toast(){},setBusy:v=>{env.busy=v;}};
 const context=vm.createContext(env);const names=['snapshot','checkpoint','syncHistory','restore','travel'];const code=names.map(name=>html('image-switcher').match(new RegExp(`^function ${name}\\([^\\n]*`,'m'))[0]).join('\n');
 const load=html('image-switcher').match(/^async function loadProject\([^\n]*/m)[0];
 vm.runInContext(region('image-switcher','image-cache-retention')+'\nfunction refresh(){pruneImageCache();}\n'+code+'\n'+load+'\n'+region('image-switcher','image-cache-import-pins')+'\nthis.load=loadProject;this.add=addFiles;this.prune=pruneImageCache;',context);
 const project={app:'image-switcher',version:1,config:{},assets:[{src:'data:image/png;base64,test',name:'same.png'}]};
 const reachable=()=>new Set([...env.assets,...env.undoStack.flatMap(s=>s.assets),...env.redoStack.flatMap(s=>s.assets),...(env.mlImageGesture?.assets||[])].map(a=>a.id));
 const verify=()=>assert.deepEqual([...env.images.keys()].sort(),[...reachable()].sort());
 return{env,context,load:()=>context.load(project),run:s=>vm.runInContext(s,context),verify};
}
test('Image: 40 project loads prune evicted images but retain all current and 30 undo entries',async()=>{
 const x=imageCache();for(let i=0;i<40;i++)await x.load();assert.equal(x.env.undoStack.length,30);assert.equal(x.env.images.size,31);x.verify();
 for(let i=0;i<30;i++){x.run('travel(undoStack,redoStack)');x.verify();assert.ok(x.env.assets.every(a=>x.env.images.has(a.id)));}
 for(let i=0;i<30;i++){x.run('travel(redoStack,undoStack)');x.verify();assert.ok(x.env.assets.every(a=>x.env.images.has(a.id)));}
});
test('Image: new edit after undo releases images held only by abandoned redo branch',async()=>{
 const x=imageCache();for(let i=0;i<8;i++)await x.load();for(let i=0;i<3;i++)x.run('travel(undoStack,redoStack)');const future=x.env.redoStack.map(s=>s.assets[0].id);await x.load();assert.equal(x.env.redoStack.length,0);x.verify();for(const id of future)assert.equal(x.env.images.has(id),false);
});
test('Image: cache retains active gesture and in-flight import pins until ownership ends',async()=>{
 const x=imageCache();await x.load();x.env.images.set('gesture',{});x.env.images.set('orphan',{});x.env.mlImageGesture={assets:[{id:'gesture'}]};x.run('pruneImageCache()');assert.equal(x.env.images.has('gesture'),true);assert.equal(x.env.images.has('orphan'),false);x.env.mlImageGesture=null;x.run('pruneImageCache()');assert.equal(x.env.images.has('gesture'),false);
 const second=deferred();let reads=0;x.env.readData=()=>++reads===1?Promise.resolve('data:image/png;base64,test'):second.promise;
 const add=x.context.add([{name:'one.png',size:1,type:'image/png'},{name:'two.png',size:1,type:'image/png'}]);await tick();const pinned=x.run('[...mlImagePendingIds]');assert.equal(pinned.length,1);x.run('pruneImageCache()');assert.equal(x.env.images.has(pinned[0]),true);second.reject(Error('read failed'));await add;assert.equal(x.run('mlImagePendingIds.size'),0);x.verify();assert.ok(x.env.assets.some(a=>a.id===pinned[0]));
});
test('Image: failed project decoding does not evict current or undo/redo images',async()=>{
 const x=imageCache();await x.load();await x.load();const before=[...x.env.images.keys()];x.env.decodeImage=async()=>{throw Error('bad image');};await assert.rejects(x.load(),/bad image/);assert.deepEqual([...x.env.images.keys()],before);x.verify();
});
test('Image: pruning is wired to renderer refresh and completed native history gestures',()=>{
 assert.match(region('image-switcher','image-cache-refresh'),/pruneImageCache\(\);\}\s*$/);
 assert.match(region('image-switcher','image-cache-gesture-commit'),/pruneImageCache\(\);syncHistory/);
});
test('QA fixture restoration is explicit and rejects unknown regions',()=>{
 const {restoreMotionQA}=require('./motion-qa-preservation.cjs');assert.throws(()=>restoreMotionQA('image-switcher','/* QA_FIX_BEGIN:unknown */\nx\n/* QA_FIX_END:unknown */'),/Unknown QA/);
});
test('HUD: cancellation while media fetch is pending never replaces the clip or starts encoding',async()=>{
 const gate=deferred(),x=exporter('u19-hud-sequence');x.env.clip={readyState:4,src:'https://example.invalid/clip.mp4',currentSrc:'https://example.invalid/clip.mp4',duration:1,seekable:{length:0}};x.env.fetch=()=>gate.promise;
 const task=x.invoke();await tick();await x.invoke();gate.resolve({blob:async()=>new Blob(['video'])});await task;assert.equal(x.env.clip.src,'https://example.invalid/clip.mp4');assert.equal(x.log.starts,0);assert.equal(x.env.EX.pending,null);assert.equal(x.button('exBtn').classList.contains('rec'),false);
});
test('HUD: media fetch failure clears preparation lock and leaves the clip unchanged',async()=>{
 const x=exporter('u19-hud-sequence');x.env.clip={readyState:4,src:'https://example.invalid/clip.mp4',currentSrc:'https://example.invalid/clip.mp4',duration:1,seekable:{length:0}};x.env.fetch=async()=>{throw Error('fetch failed');};await x.invoke();assert.equal(x.log.starts,0);assert.equal(x.env.EX.pending,null);assert.equal(x.button('exBtn').classList.contains('rec'),false);assert.ok(x.log.toasts.some(t=>t.includes('fetch failed')));
});
for(const fail of [false,true])test(`HUD: MediaRecorder fallback ${fail?'constructor failure':'success'} releases stream tracks`,async()=>{
 const x=exporter('u19-hud-sequence',{config:Promise.resolve(null)});const track={stop:()=>{x.log.tracks++;},requestFrame(){}};x.env.cv.captureStream=()=>({getVideoTracks:()=>[track],getTracks:()=>[track]});let time=0;x.env.performance.now=()=>time+=10000;
 const Recorder=class{static isTypeSupported(){return true;}constructor(){if(fail)throw Error('recorder failed');this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['frame'])});this.onstop?.();}};
 x.env.window.MediaRecorder=x.env.MediaRecorder=Recorder;await x.invoke();assert.equal(x.log.tracks,1);assert.equal(x.log.saves,fail?0:1);assert.equal(x.env.EX.pending,null);assert.equal(x.env.EX.on,false);assert.equal(x.log.resumed,1);
});
for(const tool of ['flame-transition','u19-hud-sequence'])test(`${tool}: unsupported codec releases lock and a later supported retry succeeds`,async()=>{
 const x=exporter(tool,{config:Promise.resolve(null)});await x.invoke();assert.equal(x.log.saves,0);assert.equal(x.button(tool==='flame-transition'?'rec':'exBtn').classList.contains('rec'),false);assert.equal(tool==='flame-transition'?x.run('mlFlameExportPending'):x.env.EX.pending,null);
 x.env.pickMp4Config=async()=>({codec:'avc1'});await x.invoke();assert.equal(x.log.saves,1);
});
test('HUD: throwing track cleanup cannot strand export state',async()=>{
 const x=exporter('u19-hud-sequence',{config:Promise.resolve(null)}),track={stop(){throw Error('stop failed');}};x.env.cv.captureStream=()=>({getVideoTracks:()=>[track],getTracks:()=>[track]});
 x.env.window.MediaRecorder=x.env.MediaRecorder=class{static isTypeSupported(){return true;}constructor(){throw Error('recorder failed');}};await x.invoke();assert.equal(x.env.EX.pending,null);assert.equal(x.env.EX.on,false);assert.equal(x.button('exBtn').classList.contains('rec'),false);
});
test('HUD: throwing timeline resume cannot strand export state or prevent later retry',async()=>{
 const x=exporter('u19-hud-sequence');x.env.gsap.globalTimeline.resume=()=>{throw Error('resume failed');};await x.invoke();assert.equal(x.log.saves,1);assert.equal(x.env.EX.pending,null);assert.equal(x.button('exBtn').classList.contains('rec'),false);await x.invoke();assert.equal(x.log.saves,2);
});
