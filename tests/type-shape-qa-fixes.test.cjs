// Production-function regressions for the owner's authorized F1/F3/F4 fixes.
// DOM/GPU objects below are deterministic fixtures, not browser-rendering claims.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const wire=read('tools/wireframe.html');
function exportHarness(){
  const start=wire.indexOf('async function runExport(kind)'),end=wire.indexOf('window.runExport = runExport;',start);
  const calls=[],errors=[],statuses=[];
  const env={playing:true,exporting:false,exRenderer:null,exCanvas:null,
    setPlay:value=>{env.playing=value;calls.push(['play',value]);},
    setExportLock:value=>{env.exporting=value;calls.push(['lock',value]);},
    setExportStatus:(...args)=>statuses.push(args),console:{error:error=>errors.push(error.message)},setTimeout:()=>0,
    makeExportRenderer(){env.exCanvas={};env.exRenderer={dispose(){calls.push(['dispose']);}};},
    exportWebM:async()=>{calls.push(['webm']);},exportPNG:async()=>{calls.push(['png']);},exportGIF:async()=>{calls.push(['gif']);},exportSVG:()=>{calls.push(['svg']);},exportHTML:()=>{calls.push(['html']);}
  };
  vm.runInNewContext(wire.slice(start,end)+';this.run=runExport;',env);
  return {env,calls,errors,statuses};
}
test('F1: renderer allocation failure unlocks export/history and restores playback',async()=>{
  const {env,errors,statuses}=exportHarness();env.makeExportRenderer=()=>{throw new Error('GPU allocation failed');};
  await env.run('webm');
  assert.equal(env.exporting,false);assert.equal(env.playing,true);assert.equal(env.exRenderer,null);assert.equal(env.exCanvas,null);
  assert.deepEqual(errors,['GPU allocation failed']);assert.match(statuses[0][1],/GPU allocation failed/);
});
test('F1: partial allocation is disposed, and a later export can succeed',async()=>{
  const {env,calls}=exportHarness();env.makeExportRenderer=()=>{env.exRenderer={dispose:()=>calls.push(['partial dispose'])};throw new Error('size rejected');};
  await env.run('png');assert.ok(calls.some(call=>call[0]==='partial dispose'));assert.equal(env.exporting,false);
  env.makeExportRenderer=()=>{env.exRenderer={dispose:()=>calls.push(['retry dispose'])};};
  await env.run('png');assert.ok(calls.some(call=>call[0]==='png'));assert.ok(calls.some(call=>call[0]==='retry dispose'));assert.equal(env.exporting,false);
});
test('F1: asynchronous encoder rejection cleans up without changing paused state',async()=>{
  const {env,calls}=exportHarness();env.playing=false;env.exportWebM=async()=>{throw new Error('encoder failed');};
  await env.run('webm');assert.equal(env.exporting,false);assert.equal(env.playing,false);assert.ok(calls.some(call=>call[0]==='dispose'));
});
test('F1: disposal failure cannot strand busy state or prevent the next export',async()=>{
  const {env,errors,calls}=exportHarness();env.makeExportRenderer=()=>{env.exRenderer={dispose(){throw new Error('dispose failed');}};};
  await env.run('html');assert.equal(env.exporting,false);assert.equal(env.playing,true);assert.equal(env.exRenderer,null);
  await env.run('svg');assert.equal(env.exporting,false);assert.ok(calls.some(call=>call[0]==='svg'));assert.deepEqual(errors,['dispose failed','dispose failed']);
});
test('F3: relocated native FPS buttons keep exactly one active choice',()=>{
  const code=wire.slice(wire.indexOf('function buildExportSection()'),wire.indexOf('let exportFps = 30;'));
  let moved=false;
  const buttons=[24,30,60].map(fps=>({dataset:{fps:String(fps)},active:fps===30,classList:{add(){this.owner.active=true;},remove(){this.owner.active=false;}}}));
  buttons.forEach(button=>button.classList.owner=button);
  const section={classList:{toggle(){}},querySelector:()=>({}),querySelectorAll:selector=>selector==='#fpsSeg button'?(moved?[]:buttons):[]};
  const env={document:{createElement:()=>section},t:key=>key,exportFps:30,window:{}};
  vm.runInNewContext(code+';buildExportSection();',env);moved=true;
  for(const index of [0,2,1,0]){buttons[index].onclick();assert.deepEqual(buttons.filter(button=>button.active).map(button=>Number(button.dataset.fps)),[Number(buttons[index].dataset.fps)]);assert.equal(env.exportFps,Number(buttons[index].dataset.fps));}
});
test('F3: native panel rebuild delegates through the shared synchronous restoration boundary',()=>{
  const code=wire.match(/\/\* ML_QA_FIX_BEGIN:wireframe-panel-rebuild \*\/([\s\S]*?)\/\* ML_QA_FIX_END:wireframe-panel-rebuild \*\//)[1];
  const calls=[],api={withNativeRebuild(callback){calls.push('restore controls');try{return callback();}finally{calls.push('render modal');}}};
  const env={window:{MLExportUI:{registrations:new Map([['wireframe',api]])}},renderPanel(){calls.push('replace native panel');return 42;}};
  vm.runInNewContext(code,env);assert.equal(env.renderPanel(),42);assert.deepEqual(calls,['restore controls','replace native panel','render modal']);
  env.window.MLExportUI=null;calls.length=0;assert.equal(env.renderPanel(),42);assert.deepEqual(calls,['replace native panel']);
});
test('F3: regenerated modal loop controls remain inside numeric binding discovery',()=>{
  const source=read('shared/type-shape-history.js');
  assert.match(source,/querySelectorAll\('#panel \.ctrl\[data-ml-param\],#mlUnifiedExport \.ctrl\[data-ml-param\]'\)/);
});

function eggHistoryHarness(){
  const nodes=new Map(),events=[],timers=new Map();let serial=0;
  const body={append(){},contains:target=>!!target?.owned},stage={contains:target=>!!target?.inStage},modal={contains:target=>!!target?.inUnified};
  function node(id){
    if(!nodes.has(id))nodes.set(id,{id,owned:true,inStage:false,inUnified:true,tagName:'SELECT',type:'select-one',value:'0',dataset:{},attrs:{},append(){},setAttribute(key,value){this.attrs[key]=String(value);},getAttribute(key){return this.attrs[key]??null;},closest(selector){return this.dataset.mlHistoryIgnore!==undefined&&selector.includes('data-ml-history-ignore')?this:null;}});
    return nodes.get(id);
  }
  const model={viewport:{mode:'fixed',width:1440,height:900},motion:{project:{keyframes:[]},target:'egg',preview:null},pattern:{source:'original'},logo:{imageSource:'provided'}};
  const ctx={state:{mode:'blend',paused:false,exporting:false},materials:{pattern:{transmission:.5}},backdrop:{visible:true},
    lightingControls:{state:{strength:100},apply(){}},
    scrollControls:{captureEditor:()=>structuredClone(model.motion),restoreEditor:value=>{model.motion=structuredClone(value);},useEditorHistory(){}},
    previewViewport:{serialize:()=>structuredClone(model.viewport),setSize(width,height,mode){model.viewport={width,height,mode};node('preview-preset').value=mode==='window'?'window':width+'x'+height;}},
    patternControls:{serialize:()=>structuredClone(model.pattern),restoreEditor:value=>{model.pattern=structuredClone(value);},busy:false},
    logoControls:{serialize:()=>structuredClone(model.logo),restoreEditor:value=>{model.logo=structuredClone(value);},busy:false},selectSurface(){},updatePause(){},resize(){}};
  const doc={body,activeElement:null,getElementById:node,createElement:()=>node('generated'+nodes.size),addEventListener(){},querySelectorAll:()=>[],querySelector(selector){
    if(selector==='.stage')return stage;if(selector==='#mlUnifiedExport')return modal;if(selector==='.egg-toolbar-actions')return null;
    if(selector==='[data-surface][aria-pressed="true"]')return {dataset:{surface:'pattern'}};
    if(selector.startsWith('[data-mode=')){const mode=selector.match(/"([^"]+)"/)[1];return {click(){ctx.state.mode=mode;}};}
    return selector.startsWith('#')&&!selector.includes(',')?node(selector.slice(1)):null;
  }};
  const win={document:doc,addEventListener:(type,fn,capture)=>events.push({type,fn,capture}),MLNumberInputs:{bind(){},refresh(){},getBinding:()=>null,isBoundTarget:()=>false,isEditingTarget:()=>false}};
  const sandbox={window:win,document:doc,structuredClone,setTimeout(fn){const id=++serial;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
  vm.createContext(sandbox);vm.runInContext(read('shared/editor-history.js'),sandbox);
  const source=read('tools/egg-glass/keyboard-controls.js').replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
  vm.runInContext(source+';this.setup=setupEggKeyboard;',sandbox);
  node('export-fps').value='30';node('export-png-target').value='scene';node('preview-preset').value='1440x900';
  const api=sandbox.setup(ctx);
  const send=(type,target)=>{const event={type,target,key:'',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const entry of events.filter(entry=>entry.type===type)){entry.fn(event);if(event.stopped)break;}return event;};
  const flush=()=>{while(timers.size){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
  function change(id,value,native){const target=node(id);send('pointerdown',target);target.value=value;native?.();send('change',target);send('pointerup',target);send('click',target);flush();}
  return {node,model,ctx,history:api.history,change,send};
}
test('F4: Egg moved FPS and alpha selects each undo/redo actual output state',()=>{
  const h=eggHistoryHarness();h.change('export-fps','60');h.change('export-png-target','egg');assert.equal(h.history.past.length,2);
  assert.equal(h.history.undo(),true);assert.equal(h.node('export-png-target').value,'scene');assert.equal(h.node('export-fps').value,'60');
  assert.equal(h.history.undo(),true);assert.equal(h.node('export-fps').value,'30');
  assert.equal(h.history.redo(),true);assert.equal(h.node('export-fps').value,'60');assert.equal(h.history.redo(),true);assert.equal(h.node('export-png-target').value,'egg');
});
test('F4: Egg moved viewport preset is undoable while presentation-only format selection remains ignored',()=>{
  const h=eggHistoryHarness();h.change('preview-preset','1920x1080',()=>h.ctx.previewViewport.setSize(1920,1080,'fixed'));
  assert.equal(h.history.past.length,1);assert.equal(h.model.viewport.width,1920);h.history.undo();assert.equal(h.model.viewport.width,1440);assert.equal(h.node('preview-preset').value,'1440x900');h.history.redo();assert.equal(h.model.viewport.height,1080);
  h.node('unified-format').dataset.mlHistoryIgnore='';h.change('unified-format','html');assert.equal(h.history.past.length,1);
});
test('F4: pending Egg assets block edits in the moved export controls too',()=>{
  const h=eggHistoryHarness();h.ctx.patternControls.busy=true;
  for(const type of ['pointerdown','click','beforeinput','change']){const event=h.send(type,h.node('export-fps'));assert.equal(event.defaultPrevented,true,type);assert.equal(event.stopped,true,type);}
  assert.equal(h.history.past.length,0);assert.equal(h.history.active,null);
  const unrelated={...h.node('unrelated'),inUnified:false,inStage:false};assert.equal(h.send('change',unrelated).defaultPrevented,false);
});
test('F4: undo restores FPS without silently reverting the currently selected codec',()=>{
  const h=eggHistoryHarness();h.node('export-video-format').value='video/mp4';h.change('export-fps','60');
  h.change('export-video-format','video/webm;codecs=vp9');assert.equal(h.history.past.length,1);
  h.history.undo();assert.equal(h.node('export-fps').value,'30');assert.equal(h.node('export-video-format').value,'video/webm;codecs=vp9');
  h.history.redo();assert.equal(h.node('export-fps').value,'60');assert.equal(h.node('export-video-format').value,'video/webm;codecs=vp9');
});
