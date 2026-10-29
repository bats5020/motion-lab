const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {restoreInPlace,modelAdapter}=require('../shared/type-shape-history.js');
const {HistoryController}=require('../shared/editor-history.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('in-place restore preserves captured nested object and line identities',()=>{
 const state={type:{lines:[{size:1,text:'first'},{size:2,text:'second'}]},color:{stops:[{p:.5,c:'#fff'}],_sorted:['derived']}};
 const type=state.type,line=state.type.lines[0],lines=state.type.lines;
 restoreInPlace(state,{type:{lines:[{size:3,text:'restored'}]},color:{stops:[{p:.7,c:'#000'}]}});
 assert.equal(state.type,type);assert.equal(state.type.lines,lines);assert.equal(state.type.lines[0],line);assert.equal(line.size,3);assert.equal(lines.length,1);assert.ok(!('_sorted' in state.color));
});
test('ASCII restore rebuilds seed, UI and derived rendering data with exact numbers',()=>{
 const state={seed:99,scale:6.5,speed:1.7,flowDir:90,cell:14},calls=[];
 const adapter=modelAdapter('ascii-wave',{state,setSeed:v=>calls.push(['seed',v]),syncUI:()=>calls.push('ui'),rebuildAll:()=>calls.push('render')});
 const before=adapter.capture();state.seed=8;state.scale=1;adapter.restore(before);
 assert.deepEqual(state,before);assert.deepEqual(calls,[['seed',99],'ui','render']);state.cell=33;assert.equal(before.cell,14);
});
test('ASCII gestures undo and redo model state, not just input text',()=>{
 const state={seed:7,scale:6.5};let draws=0;
 const adapter=modelAdapter('ascii-wave',{state,setSeed(){},syncUI(){},rebuildAll(){draws++;}}),history=new HistoryController(adapter);
 history.begin('scale drag');state.scale=4;state.scale=2;state.scale=1.7;history.commit();
 assert.equal(history.past.length,1);history.undo();assert.equal(state.scale,6.5);history.redo();assert.equal(state.scale,1.7);assert.equal(draws,2);
});
test('Warp restores exact radian value and noise seed while awaiting texture rebuild',async()=>{
 const state={tumult:Math.PI*2,cols:45},calls=[];let seed=1234,release;
 const adapter=modelAdapter('warp-type',{state,getNoiseSeed:()=>seed,setNoiseSeed:v=>{seed=v;calls.push('seed');},applySize:()=>calls.push('size'),applyState:()=>new Promise(r=>{release=r;}),syncExtras:()=>calls.push('ui')});
 const snapshot=adapter.capture();seed=999;state.tumult=1;state.cols=3;
 const pending=adapter.restore(snapshot);assert.equal(state.tumult,Math.PI*2);assert.equal(seed,1234);assert.deepEqual(calls,['seed','size']);release();await pending;assert.deepEqual(calls,['seed','size','ui']);
});
test('Warp undo cannot overlap asynchronous restore',async()=>{
 const state={tumult:Math.PI};let seed=1,release;
 const api={state,getNoiseSeed:()=>seed,setNoiseSeed:v=>seed=v,applySize(){},applyState:()=>new Promise(r=>release=r),syncExtras(){}};
 const h=new HistoryController(modelAdapter('warp-type',api));h.begin('reseed');seed=8;h.commit();
 const p=h.undo();assert.equal(h.isBusy,true);assert.equal(h.redo(),false);release();await p;assert.equal(seed,1);assert.equal(h.isBusy,false);
});
test('U19 restores live line callbacks, recording options and SDF; excludes LUT cache',()=>{
 const state={color:{stops:[{p:.3,c:'#123456'}],_sorted:[1]},motion:{recSec:6},type:{lines:[{size:2.5,text:'JP'}]}},calls=[];
 const line=state.type.lines[0],color=state.color;
 const adapter=modelAdapter('u19-aberration',{state,syncAll:()=>calls.push('ui'),syncRecording:()=>calls.push('recording'),rebuildSDF:()=>calls.push('sdf')});
 const snap=adapter.capture();assert.ok(!('_sorted'in snap.state.color));state.type.lines[0].size=7;state.motion.recSec=20;adapter.restore(snap);
 assert.equal(state.type.lines[0],line);assert.equal(state.color,color);assert.equal(line.size,2.5);assert.equal(state.motion.recSec,6);assert.deepEqual(calls,['ui','recording','sdf']);
});
test('Wireframe captures scene, precise parameters, active look, FPS and deterministic star seed',()=>{
 let document={scene:'cross',params:{growth:.905,aspect:.473,mlStarSeed:123},activeLook:2,exportFps:60,phase:.2,playheadEdit:0},draws=0;
 const adapter=modelAdapter('wireframe',{getDocument:()=>document,setDocument:v=>document=v,rebuild:()=>draws++});
 const saved=adapter.capture();document.params.growth=.7;document.scene='box';adapter.restore(saved);
 assert.equal(document.params.growth,.905);assert.equal(document.params.aspect,.473);assert.equal(document.scene,'cross');assert.equal(document.params.mlStarSeed,123);assert.equal(draws,1);
 document.params.aspect=.5;assert.equal(saved.params.aspect,.473);
 assert.equal(adapter.equals(saved,{...saved,phase:.9}),true);assert.equal(adapter.equals(saved,{...saved,phase:.9,playheadEdit:1}),false);
});
test('actual Wireframe star RNG is local to exported builders and deterministic',()=>{
 const html=read('tools/wireframe.html');
 const rng=html.match(/let mlStarState=\(params\.mlStarSeed\?\?1234\)[\s\S]*?return mlStarState\/4294967296;};/)[0];
 const sample=seed=>vm.runInNewContext(rng+'Array.from({length:8},mlStarRandom)',{params:{mlStarSeed:seed}});
 assert.deepEqual([...sample(123)],[...sample(123)]);assert.notDeepEqual([...sample(123)],[...sample(456)]);
 assert.equal((html.match(/let mlStarState=/g)||[]).length,2);assert.match(html,/\$\{buildTunnel\.toString\(\)\}/);assert.match(html,/\$\{finishBox\.toString\(\)\}/);
});
test('classic tools load history early and bind numbers after the original engine',()=>{
 for(const name of ['ascii-wave','warp-type','u19-aberration','wireframe']){
  const html=read(`tools/${name}.html`);
  assert.ok(html.indexOf('src="../shared/editor-history.js"')<html.indexOf('</head>'));
  assert.ok(html.lastIndexOf('src="../shared/type-shape-history.js"')>html.lastIndexOf('src="../shared/type-shape-workbench.js"'));
  assert.match(html,/href="\.\.\/shared\/numeric-input.css"/);
 }
});
test('U19 image replacement boundaries are explicit and lock history while pending',()=>{
 const source=read('shared/type-shape-history.js');
 assert.match(source,/画像の読み込み・標準画像への変更は取り消せません/);
 assert.match(source,/busy=\(\)=>_recording\|\|pendingAssets.size>0/);
 assert.match(source,/if\(!pendingAssets.size\)controller.reset/);
 const html=read('tools/u19-aberration.html');assert.equal((html.match(/assetBegin\("(?:logo|background)"\)/g)||[]).length,4);assert.equal((html.match(/assetEnd\("(?:logo|background)",true\)/g)||[]).length,2);assert.equal((html.match(/assetEnd\("(?:logo|background)",false\)/g)||[]).length,4);
});
test('numeric adapters have model getters/setters, π units and preserve keyboard ownership',()=>{
 const source=read('shared/type-shape-history.js');new vm.Script(source);
 assert.match(source,/scale:key==='tumult'\?1\/Math.PI:1/);assert.match(source,/keyboardStep:key==='tumult'\?Math.PI\/10/);
 assert.match(source,/getValue:widget.getValue,setValue:widget.write/);assert.match(source,/getValue:\(\)=>params\[key\]/);
 assert.doesNotMatch(source,/addEventListener\(['"]keydown/);
 assert.match(source,/binding.destroy\(\)/);
});
test('Warp stale async font loads cannot overwrite a later restore',()=>{
 const source=read('tools/warp-type.html');assert.match(source,/const mlTextureToken=\+\+mlTextureRevision/);assert.match(source,/if\(mlTextureToken!==mlTextureRevision\)return/);
});

test('structural counts and image dimensions reject fractional hand-entry without snapping restored continuous values',()=>{
 const source=read('shared/type-shape-history.js');
 assert.match(source,/integer:\['cols','rows'\].includes\(key\)/);
 assert.match(source,/min:200,max:4096,step:1,integer:true/);
 assert.match(source,/min:64,max:4096,step:1,integer:true/);
 assert.match(source,/'gridX','gridY','gridZ','crossRings','animSpeed'/);
});

test('U19 selection is restored with document edits but selection-only navigation is not history',()=>{
 const state={color:{stops:[{p:0},{p:1}]},type:{lines:[]}};let selected=1;
 const adapter=modelAdapter('u19-aberration',{state,getSelectedStop:()=>selected,setSelectedStop:value=>selected=value,syncAll(){},syncRecording(){},rebuildSDF(){}});
 const before=adapter.capture();selected=0;assert.equal(adapter.equals(before,adapter.capture()),true);state.color.stops.pop();adapter.restore(before);assert.equal(selected,1);assert.equal(state.color.stops.length,2);
});
