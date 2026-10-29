const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {NativeController}=require('../shared/editor-history.js');
function thermal(){
 const source=fs.readFileSync('tools/thermal-flow.html','utf8'),calls=[];
 const ctx=vm.createContext({console,JSON,document:{body:{dataset:{}},querySelectorAll:()=>[]},performance:{now:()=>200},state:{gain:1},_recording:false,_maskImg:{name:'source'},playback:{time:1,playing:true},_frameTime:1,_animT:{x:.2},UNDO:[],REDO:[],clone:x=>JSON.parse(JSON.stringify(x)),historyEntry(){return{json:JSON.stringify(ctx.state),image:ctx._maskImg,playback:{...ctx.playback},frameTime:ctx._frameTime,anim:{...ctx._animT}};},restoreRecord(x){Object.assign(ctx.state,x);calls.push('restore');},buildLut(){calls.push('lut');},refreshAll(){calls.push('ui');},redraw(){calls.push('draw');},syncHistoryUI(){},undo(){const e=ctx.UNDO.pop();ctx.REDO.push(ctx.historyEntry());ctx.restoreRecord(JSON.parse(e.json));ctx._maskImg=e.image;},redo(){const e=ctx.REDO.pop();ctx.UNDO.push(ctx.historyEntry());ctx.restoreRecord(JSON.parse(e.json));ctx._maskImg=e.image;}});
 ctx.window={MLEditorHistory:true,addEventListener:(name,fn)=>fn()};ctx.MLEditorHistory={register:o=>new NativeController(o)};
 const body=source.match(/\/\* ML_KEYBOARD_BEGIN:integration \*\/([\s\S]*?)\/\* ML_KEYBOARD_END:integration \*\//)[1];
 vm.runInContext(body.slice(0,body.indexOf('  window.MLThermalHistory=controller;')+'  window.MLThermalHistory=controller;'.length)+'\n});',ctx);
 return{ctx,h:ctx.window.MLThermalHistory,calls};
}
function heatmap(){
 const source=fs.readFileSync('tools/heatmap-blur.html','utf8');const ctx=vm.createContext({JSON,document:{body:{dataset:{}}},S:{gain:1,vals:[.1,.2,.3,.4]},HIST:[],REDO:[],histStable:null,histArmed:true,recording:null});
 ctx.window={MLEditorHistory:true,mlHeatmapRevision:0,addEventListener:(n,f)=>f()};ctx.MLEditorHistory={register:o=>new NativeController(o)};
 ctx.restoreState=s=>Object.assign(ctx.S,JSON.parse(s));ctx.undo=()=>{ctx.REDO.push(JSON.stringify(ctx.S));ctx.restoreState(ctx.HIST.pop());};ctx.redo=()=>{ctx.HIST.push(JSON.stringify(ctx.S));ctx.restoreState(ctx.REDO.pop());};
 const body=source.match(/\/\* ML_KEYBOARD_BEGIN:integration \*\/([\s\S]*?)\/\* ML_KEYBOARD_END:integration \*\//)[1];
 vm.runInContext(body.slice(0,body.indexOf('  window.MLHeatmapHistory=controller;')+'  window.MLHeatmapHistory=controller;'.length)+'\n});',ctx);
 return{ctx,h:ctx.window.MLHeatmapHistory};
}
test('Thermal native grouping collapses repeated pre-change entries and preserves asset reference',()=>{const{ctx,h}=thermal(),asset=ctx._maskImg;h.begin('gain');for(const v of[2,3,4]){ctx.UNDO.push(ctx.historyEntry());ctx.state.gain=v;}h.commit();assert.equal(ctx.UNDO.length,1);h.undo();assert.equal(ctx.state.gain,1);assert.equal(ctx._maskImg,asset);h.redo();assert.equal(ctx.state.gain,4);h.undo();h.redo();assert.equal(ctx.state.gain,4);});
test('Thermal canceled gesture restores real model, playback and UI without history growth',()=>{const{ctx,h,calls}=thermal();h.begin('gain');ctx.state.gain=7;ctx._maskImg=null;ctx.playback.time=8;h.cancel();assert.equal(ctx.state.gain,1);assert.equal(ctx.playback.time,1);assert.equal(ctx._maskImg.name,'source');assert.equal(ctx.UNDO.length,0);assert.deepEqual(calls,['restore','lut','ui','draw']);});
test('Thermal no-op preserves redo; export prevents history travel',()=>{const{ctx,h}=thermal();ctx.REDO.push({json:'{}'});h.begin('noop');h.commit();assert.equal(ctx.REDO.length,1);ctx._recording=true;assert.equal(h.begin('blocked'),false);assert.equal(h.undo(),false);});
test('Heatmap native grouping removes one-second heuristic splits, undo and redo restore actual values',()=>{const{ctx,h}=heatmap();h.begin('gain');for(const v of[1.1,1.2,1.3]){ctx.HIST.push(JSON.stringify(ctx.S));ctx.S.gain=v;ctx.window.mlHeatmapRevision++;}h.commit();assert.equal(ctx.HIST.length,1);h.undo();assert.equal(ctx.S.gain,1);h.redo();assert.equal(ctx.S.gain,1.3);h.undo();h.redo();assert.equal(ctx.S.gain,1.3);});
test('Heatmap playback changes without authored saves do not create history',()=>{const{ctx,h}=heatmap();h.begin('canvas click');ctx.S.gain=1.25;h.commit();assert.equal(ctx.HIST.length,0);});
test('Heatmap source boundary explicitly clears both native stacks',()=>{const{ctx,h}=heatmap();h.begin('gain');ctx.S.gain=2;ctx.window.mlHeatmapRevision++;h.commit();h.undo();h.reset('new media');assert.equal(ctx.HIST.length,0);assert.equal(ctx.REDO.length,0);});
test('Thermal precise raw range value is kept outside native range quantization',()=>{const s=fs.readFileSync('tools/thermal-flow.html','utf8');assert.match(s,/getValue:\(\)=>raw,setValue:v=>\{raw=v/);assert.match(s,/opts.scale=\(\)=>state.motion.loopSec\/100/);});
test('Heatmap dynamic point updates only target original ranges',()=>{const s=fs.readFileSync('tools/heatmap-blur.html','utf8');assert.match(s,/range-filter \*\/"input\[type=range\]"/);assert.match(s,/b.range.isConnected/);assert.match(s,/scale:100,getValue:\(\)=>S.vals\[i\]/);});
