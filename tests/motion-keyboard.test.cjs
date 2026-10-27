// Model-level keyboard integration tests. No WebGL, browser decoding or encoding claims.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const History=require('../shared/editor-history.js');
const root=path.resolve(__dirname,'..');
const html=name=>fs.readFileSync(path.join(root,`tools/${name}.html`),'utf8');
function region(name,id='integration'){
 const s=html(name),a=`/* ML_KEYBOARD_BEGIN:${id} */`,b=`/* ML_KEYBOARD_END:${id} */`;
 assert.equal(s.split(a).length,2);return s.slice(s.indexOf(a)+a.length,s.indexOf(b));
}
function oneLine(name,fn){return html(name).match(new RegExp(`^function ${fn}\\([^\\n]*`,'m'))[0];}
function setup(prelude,globals={}){
 const elements=new Map(),bindings=[],calls=[];
 const element=id=>{if(!elements.has(id))elements.set(id,{value:'',disabled:false,parentElement:{querySelector:()=>({textContent:''}),append(){}},querySelectorAll:()=>[]});return elements.get(id);};
 const numbers={bind:o=>{bindings.push(o);return{};},refresh:()=>calls.push('refresh')};
 const history={register:o=>{const c=o.native?new History.NativeController(o):new History.HistoryController(o);context.controller=c;context.options=o;return c;}};
 const context=vm.createContext({window:{MLEditorHistory:history,MLNumberInputs:numbers},MLEditorHistory:history,MLNumberInputs:numbers,$:element,JSON,Math,Set,Map,Promise,performance:{now:()=>0},localStorage:{setItem(){}},document:{createElement:()=>({})},toast(){},...globals});
 vm.runInContext(prelude,context);return{context,bindings,calls,elements,run:code=>vm.runInContext(code,context)};
}
test('Image native history groups a numeric gesture and restores the actual model',()=>{
 const p=`var config={hold:.22},assets=[{id:'a',x:50,y:50}],selected='a',samples=true,preset='opening',time=0,playing=false,busy=false,ready=true,undoStack=[],redoStack=[],mlImageHistory=null,mlImageGesture=null;function refresh(){};function pruneImageCache(){};function normalizeConfig(v){return v;}`;
 const x=setup(p);x.run(['snapshot','checkpoint','syncHistory','restore','travel'].map(n=>oneLine('image-switcher',n)).join('\n'));x.run(region('image-switcher'));
 assert.equal(x.bindings.length,11);
 x.context.controller.begin();x.run('checkpoint();config.hold=.5;checkpoint();config.hold=.8;');x.context.controller.commit();
 assert.equal(x.run('undoStack.length'),1);x.context.controller.undo();assert.equal(x.run('config.hold'),.22);
 x.context.controller.redo();assert.equal(x.run('config.hold'),.8);
 x.context.controller.begin();x.context.controller.commit();assert.equal(x.run('undoStack.length'),1);
 x.context.controller.begin();x.run('config.hold=1');x.context.controller.cancel();assert.equal(x.run('config.hold'),.8);
 x.run('busy=true');assert.equal(x.context.controller.isBusy,true);assert.equal(x.context.controller.undo(),false);
});
test('Flame native history does not split repeated range updates and clears redo after a new edit',()=>{
 const src=html('flame-transition');
 const commit=src.slice(src.indexOf('function commitHist(){'),src.indexOf('function restoreState('));
 const x=setup(`var S={cut:.42,gain:1},fmt={cut:v=>v,gain:v=>v},HIST=[],REDO=[],histArmed=true,histStable=JSON.stringify(S),histLast=0,mlFlameHistory=null,mlFlameGesture=null,recording=null,mlFlameExportPending=null;function syncAllUI(){}function changed(){commitHist();}`);
 x.run(commit+'\n'+['mlFlameClearHistory','mlFlameAssetBoundary','restoreState','undo','redo'].map(n=>oneLine('flame-transition',n)).join('\n'));x.run(region('flame-transition'));
 assert.equal(x.bindings.find(b=>b.scale===100).getValue(),.42);
 x.context.controller.begin();x.run('S.cut=.5;commitHist();histArmed=true;S.cut=.6;commitHist();');x.context.controller.commit();assert.equal(x.run('HIST.length'),1);
 x.context.controller.undo();assert.equal(x.run('S.cut'),.42);x.context.controller.redo();assert.equal(x.run('S.cut'),.6);
 x.context.controller.undo();x.context.controller.begin();x.run('S.gain=1.2;commitHist()');x.context.controller.commit();assert.equal(x.run('REDO.length'),0);
 x.context.controller.begin();x.run('S.gain=1.4;commitHist()');x.context.controller.cancel();assert.equal(x.run('S.gain'),1.2);
 x.run('recording={}');assert.equal(x.context.controller.undo(),false);
});
test('Word undo restores authored state, order and inspector, not volatile playback',async()=>{
 const x=setup(`var state={order:[{id:'a',enabled:true}],playOrder:'sequential',anim:{duration:1,transition:.3},style:{wordScale:.78},exportCfg:{pad:16,fps:30,length:0,outW:0},playing:true},rt={pos:2,dir:-1,lastSwitch:10};var ui=0,assets=0,stage=0;function syncUI(){ui++}function renderAssetList(){assets++}function renderStage(){stage++}function pause(){state.playing=false}async function captureFrames(){return 7}`);
 x.run(region('word-switcher'));assert.equal(x.bindings.length,7);
 x.context.controller.begin();x.run('state.anim.duration=2;state.order[0].enabled=false');x.context.controller.commit();x.context.controller.undo();
 assert.equal(x.run('state.anim.duration'),1);assert.equal(x.run('state.order[0].enabled'),true);assert.equal(x.run('state.playing'),false);assert.equal(x.run('rt.pos'),0);assert.ok(x.run('ui&&assets&&stage'));
 assert.equal(await x.run('captureFrames()'),7);assert.equal(x.context.controller.isBusy,false);
});
test('Tile playback-derived values do not become edits; undo restores exact manual keys and selection',()=>{
 const x=setup(`var gl={},recording=null,mlTileHistory=null,S={angle:12,shift:1,scale:100,kfAuto:false,kf:[{t:0,v:{angle:12}}],ikf:[],holdA:1,trans:2,holdB:1},DEFAULTS={angle:0,shift:0,scale:100},KF_PARAMS=['angle','shift','scale'],SEL=new Set(),playhead=0,playing=true,lutDirty=false,sceneDirty=false,dirty=false,lastKB='',sliders={},scenes={A:{kind:'sample',el:null,name:'A'},B:{kind:'sample',el:null,name:'B'}};SEL.add(S.kf[0]);function keyed(p){return S.kf.some(k=>k.v[p]!==undefined)}function total(){return S.holdA+S.trans+S.holdB}function applyKeys(){S.angle=S.kf[0].v.angle}function syncUI(){}function drawTimeline(){}function syncBar(){}function drawThumbs(){}function persist(){}`);
 x.run(region('u19-tile-scroll'));
 x.context.controller.begin();x.run('S.angle=99;playhead=1');assert.equal(x.context.controller.commit(),false);
 x.context.controller.begin();x.run('S.kf[0].v.angle=25;S.kfAuto=true;SEL.clear()');x.context.controller.commit();x.context.controller.undo();
 assert.equal(x.run('S.kf[0].v.angle'),12);assert.equal(x.run('S.angle'),12);assert.equal(x.run('S.kfAuto'),false);assert.equal(x.run('SEL.has(S.kf[0])'),true);assert.equal(x.run('playing'),false);assert.equal(x.run('lutDirty&&sceneDirty&&dirty'),true);
});
test('Tile source snapshots restore retained media references as well as settings',()=>{
 const x=setup(`var gl={},recording=null,mlTileHistory=null,S={angle:0,shift:0,scale:100,kfAuto:false,kf:[],ikf:[],holdA:1,trans:2,holdB:1},DEFAULTS={},KF_PARAMS=[],SEL=new Set(),playhead=0,playing=false,lutDirty=false,sceneDirty=false,dirty=false,lastKB='',sliders={},scenes={A:{kind:'sample',el:null,name:'A'},B:{kind:'sample',el:null,name:'B'}};function keyed(){return false}function total(){return 4}function applyKeys(){}function syncUI(){}function drawTimeline(){}function syncBar(){}function drawThumbs(){}function persist(){}`);
 x.run(region('u19-tile-scroll'));x.context.controller.begin();x.run("scenes.A={kind:'image',el:{id:'image'},name:'new.png'}");x.context.controller.commit();x.context.controller.undo();assert.equal(x.run('scenes.A.kind'),'sample');x.context.controller.redo();assert.equal(x.run('scenes.A.el.id'),'image');
});
test('HUD media history keeps File references and recreates URLs on undo/redo',async()=>{
 const listeners=new Map(),revoked=[],created=[];let serial=0;
 const clip={src:'',addEventListener(t,f){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(f)},removeEventListener(t,f){listeners.get(t)?.delete(f)},removeAttribute(){this.src=''},load(){queueMicrotask(()=>{for(const f of [...(listeners.get('loadeddata')||[])])f()})}};
 const x=setup(`var EX={on:false},userURL=null,clipName='default',resetBtn={disabled:true};function showInfo(){}function play(){}`,{clip,setTimeout,clearTimeout,URL:{createObjectURL:f=>{const u='blob:'+ ++serial;created.push([u,f]);return u},revokeObjectURL:u=>revoked.push(u)}});
 x.run(region('u19-hud-sequence','media-history'));
 const a={name:'a.mp4',type:'video/mp4'},b={name:'b.mp4',type:'video/mp4'};x.context.a=a;x.context.b=b;
 await x.run('setClip(a)');await x.run('setClip(b)');assert.equal(x.run('mlHudFile.name'),'b.mp4');assert.equal(x.context.controller.past.length,2);
 await x.context.controller.undo();assert.equal(x.run('mlHudFile.name'),'a.mp4');assert.equal(x.run('userURL'),'blob:3');assert.equal(created[2][1],a);assert.ok(revoked.includes('blob:1'));
 await x.context.controller.undo();assert.equal(x.run('mlHudFile'),null);assert.equal(clip.src,'');
 await x.context.controller.redo();assert.equal(x.run('mlHudFile.name'),'a.mp4');assert.equal(x.context.controller.isBusy,false);
 x.run('EX.on=true');assert.equal(x.context.controller.undo(),false);
});
test('HUD has no invented numeric parameters; all five load helpers before application code',()=>{
 for(const name of ['image-switcher','word-switcher','u19-tile-scroll','u19-hud-sequence','flame-transition']){
  const s=html(name);assert.ok(s.indexOf('shared/editor-history.js')<s.indexOf('</head>'));assert.ok(s.indexOf('shared/numeric-input.js')<s.indexOf('</head>'));
 }
 assert.doesNotMatch(region('u19-hud-sequence','media-history'),/MLNumberInputs\.bind/);
 assert.match(region('flame-transition','keyboard-guard'),/e\.isComposing\|\|e\.keyCode===229\|\|recording/);
 assert.match(region('flame-transition','redo-text-guard'),/if\(typing\(\)\)return/);
});

test('Flame successful source change clears settings history before releasing old URLs; failed decode does not',()=>{
 const log=[],images=[];
 function Image(){images.push(this);}
 const x=setup(`var scenes={A:{url:'blob:old',media:{tagName:'IMG'},name:'old',redraw:false}},playing=true;function isVideo(sc){return sc.media?.tagName==='VIDEO'}function mlFlameAssetBoundary(){log.push('boundary')}function layoutTrack(){}function syncVideos(){}function render(){}`,{Image,log,URL:{createObjectURL:()=> 'blob:new',revokeObjectURL:u=>log.push('revoke:'+u)}});
 x.run(region('flame-transition','media-boundary'));x.context.file={name:'new.png',type:'image/png'};x.run("loadFile('A',file)");
 assert.equal(x.run('scenes.A.url'),'blob:old');assert.deepEqual(log,[]);
 images[0].onerror();assert.deepEqual(log,['revoke:blob:new']);assert.equal(x.run('scenes.A.url'),'blob:old');
 log.length=0;x.run("loadFile('A',file)");images[1].onload();assert.deepEqual(log,['boundary','revoke:blob:old']);assert.equal(x.run('scenes.A.url'),'blob:new');
 assert.match(region('flame-transition'),/素材の差し替え・サンプルに戻す操作は取り消せません/);
});
test('HUD failed load or failed undo keeps model and stack unchanged and releases only the failed URL',async()=>{
 const listeners=new Map(),revoked=[];let serial=0;
 const clip={src:'',failNext:false,addEventListener(t,f){if(!listeners.has(t))listeners.set(t,new Set());listeners.get(t).add(f)},removeEventListener(t,f){listeners.get(t)?.delete(f)},removeAttribute(){this.src=''},load(){const fail=this.failNext;this.failNext=false;queueMicrotask(()=>{for(const f of [...(listeners.get(fail?'error':'loadeddata')||[])])f()})}};
 const x=setup(`var EX={on:false},userURL=null,clipName='default',resetBtn={disabled:true};function showInfo(){}function play(){}`,{clip,setTimeout,clearTimeout,URL:{createObjectURL:()=> 'blob:'+ ++serial,revokeObjectURL:u=>revoked.push(u)}});
 x.run(region('u19-hud-sequence','media-history'));x.context.a={name:'a.mp4',type:'video/mp4'};x.context.b={name:'bad.mp4',type:'video/mp4'};
 await x.run('setClip(a)');clip.failNext=true;await x.run('setClip(b)');
 assert.equal(x.run('mlHudFile.name'),'a.mp4');assert.equal(x.run('userURL'),'blob:1');assert.equal(x.context.controller.past.length,1);assert.ok(revoked.includes('blob:2'));assert.ok(!revoked.includes('blob:1'));
 clip.failNext=true;assert.equal(await x.context.controller.undo(),false);assert.equal(x.context.controller.past.length,1);assert.equal(x.context.controller.future.length,0);assert.equal(x.run('mlHudFile.name'),'a.mp4');assert.equal(x.context.controller.isBusy,false);
});
