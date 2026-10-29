'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../shared/export-raster.js'),'utf8');
function setup(tool,{state={},nodes={},gpu=false,recorder,clipboard=false,busy=false,snapshot,exportReady}={}){
  let config;const ready=[];
  const document={body:{dataset:{rasterTool:tool,graphicsStatus:gpu?'unavailable':'ready'}},readyState:'loading',querySelector:selector=>nodes[selector]||null,addEventListener:(type,cb)=>{if(type==='DOMContentLoaded')ready.push(cb);}};
  const model={capture:()=>snapshot||{values:state},isBusy:()=>busy};
  const window={MLRasterModel:model,MLDitherExport:exportReady,MediaRecorder:recorder,ClipboardItem:clipboard?function(){}:undefined,MLExportUI:{register:value=>config=value}};
  vm.runInNewContext(code,{document,window,navigator:{clipboard:clipboard?{write(){}}:undefined},queueMicrotask});
  assert.equal(config,undefined,'registration waits for original adapters');ready.forEach(cb=>cb());
  return config;
}
const ui={readout:(label,value,note)=>({label,get value(){return typeof value==='function'?value():value},get note(){return typeof note==='function'?note():note}}),note:text=>({text}),take:node=>({node}),field:(label,node,note)=>({label,node,note})};
const fmt=id=>({id});
const format=(config,id)=>config.formats.find(f=>f.id===id);
for(const tool of ['halftone-lab','dither-svg','grid-stretch','effect-stack','pixel-gradient','glass-lab','smearworks']){
  test(tool+': registers ordered-field adapter without replacing native engines',()=>{
    const config=setup(tool);assert.equal(config.id,tool);assert.equal(typeof config.fields.size,'function');assert.equal(typeof config.fields.alpha,'function');assert.equal(typeof config.fields.fps,'function');
    assert.ok(config.formats.length>0);assert.equal(config.trigger,['glass-lab','smearworks'].includes(tool)?'#mlExport':'#rasterExport');
  });
}
test('Native controls are moved; no cloned HTML or replacement encoder is introduced',()=>{
  assert.doesNotMatch(code,/innerHTML\s*=|cloneNode|toBlob\(|new MediaRecorder|captureStream\(|eval\(|new Function/);
  assert.match(code,/ui\.take\('#sizeBlock'\)/);assert.match(code,/ui\.take\(\$\('#transBg'\)\?\.closest\('label'\)\)/);
});
test('Halftone disables exactly SVG ASCII and active Melt combinations',()=>{
  for(const effect of ['ascii','halftone','dither','mosaic']){
    const config=setup('halftone-lab',{state:{effect,melt:10},nodes:{'#exRes':{textContent:'書き出し: 1920×1080px'}}});
    assert.equal(format(config,'svg').available().ok,effect==='mosaic');
    assert.equal(format(config,'png').available().ok,true);
  }
  assert.equal(format(setup('halftone-lab',{state:{effect:'halftone',melt:0},nodes:{'#exRes':{textContent:'1920 × 1080'}}}),'svg').available().ok,true);
});
test('Halftone HTML exposes missing-media and animation semantics',()=>{
  const config=setup('halftone-lab',{state:{source:'image'}});
  assert.match(format(config,'html').note(),/YOUR_IMAGE\.jpg/);
  assert.match(config.fields.fps(fmt('html'),ui).note,/固定 FPS の動画ではありません/);
  assert.equal(config.fields.fps(fmt('video'),ui).value,'30（固定）');
});
test('Dither checks conversion readiness, preserves transparent toggle and accurate PNG scale',()=>{
  const config=setup('dither-svg',{state:{res:160},snapshot:{values:{res:160},image:{width:1920,height:1080}},nodes:{'#svgHolder svg':{},'#busy':{classList:{contains:()=>false}}}});
  assert.equal(format(config,'svg').available().ok,true);
  assert.equal(config.fields.size(fmt('svg'),ui)[0].value,'160 × 90 px');
  assert.equal(config.fields.size(fmt('png'),ui)[0].value,'1280 × 720 px');
  assert.equal(config.actions[0].handoff,true);
  assert.equal(format(setup('dither-svg'),'png').available().ok,false);
});
test('Grid exposes existing alpha preservation, JPEG exclusion and source dimensions',()=>{
  const config=setup('grid-stretch',{snapshot:{values:{},source:{width:4000,height:2250}}});
  assert.equal(config.fields.size(fmt('png'),ui).value,'4000 × 2250 px');
  assert.equal(config.fields.alpha(fmt('png'),ui).value,'元画像の透明部分を保持');
  assert.equal(config.fields.alpha(fmt('jpeg'),ui).value,'非対応（JPEG）');
  assert.deepEqual(Array.from(config.formats,f=>f.id),['png','jpeg']);
});
test('Video capability detects browser support and reports the actual preferred codec',()=>{
  const nodes={'#view':{width:880,height:1100,captureStream(){}},'#recRow':{style:{display:''}}};
  for(const tool of ['halftone-lab','effect-stack','glass-lab']){
    const config=setup(tool,{state:{src:{type:'video'}},nodes:{...nodes,'#exRes':{textContent:'1920×1080'}},recorder:{isTypeSupported:type=>type==='video/mp4'}});
    assert.equal(format(config,'video').available().ok,true);assert.match(format(config,'video').note(),/MP4/);assert.match(format(config,'video').note(),/音声は含まれません/);
  }
  assert.equal(format(setup('effect-stack',{state:{src:{type:'mesh'}},nodes}),'video').available().ok,false);
  assert.equal(format(setup('glass-lab',{nodes}),'video').available().ok,false);
});
test('Glass / Effect video dimensions and FPS are not misrepresented as full PNG output',()=>{
  for(const [tool,fps] of [['glass-lab','60（固定）'],['effect-stack','30（固定）']]){
    const config=setup(tool,{nodes:{'#view':{width:880,height:1100}},busy:true});
    assert.equal(config.fields.size(fmt('video'),ui).value,'880 × 1100 px');
    assert.match(config.fields.size(fmt('video'),ui).note,/プレビュー/);assert.equal(config.fields.fps(fmt('video'),ui).value,fps);assert.equal(config.busy(),true);
    assert.match(config.fields.extra(fmt('video'),ui).at(-1).text,/停止して保存/);
  }
});
test('GPU failure blocks real exports rather than claiming a fallback render',()=>{
  for(const tool of ['glass-lab','smearworks']){
    const config=setup(tool,{gpu:true});assert.equal(format(config,'png').available().ok,false);assert.match(format(config,'png').available().reason,/WebGL/);
  }
});
test('Clipboard is a separate explicit secondary action; settings are not media formats',()=>{
  for(const tool of ['halftone-lab','grid-stretch','effect-stack','glass-lab']){
    const config=setup(tool);assert.equal(config.actions[0].available().ok,false);
    assert.ok(config.formats.every(f=>!['json','settings','clipboard'].includes(f.id)));
  }
  assert.equal(setup('grid-stretch',{clipboard:true}).actions[0].available().ok,true);
  assert.match(code,/Settings export is not a rendered-media format/);
});
test('Pixel multiplier chooses the corresponding native action; no export is executed by selection',()=>{
  let config,refreshes=0;const nodes={};
  for(const n of [1,2,4])nodes['#btnPNG'+n]={id:'btnPNG'+n};
  function element(tag){return {tag,children:[],listeners:{},value:'',setAttribute(){},append(child){this.children.push(child);},addEventListener(type,fn){this.listeners[type]=fn;}};}
  const document={body:{dataset:{rasterTool:'pixel-gradient'}},readyState:'complete',querySelector:selector=>nodes[selector]||null,createElement:element};
  const resolution={w:1920,h:1080};const window={MLRasterModel:{capture:()=>({res:resolution})},MLExportUI:{register:c=>config=c}};
  vm.runInNewContext(code,{document,window,navigator:{},queueMicrotask});
  const localUI={...ui,refresh(){refreshes++;}};
  const fields=config.fields.size(fmt('png'),localUI),select=fields[1].node;
  assert.equal(fields[0].value,'1920 × 1080 px');assert.equal(format(config,'png').button().id,'btnPNG1');
  resolution.w=1000;assert.equal(fields[0].value,'1000 × 1080 px');resolution.w=1920;assert.equal(fields[0].value,'1920 × 1080 px','undo refreshes the same readout');
  select.value='2';select.listeners.change();assert.equal(refreshes,1);assert.equal(format(config,'png').button().id,'btnPNG2');
  assert.equal(config.fields.size(fmt('png'),localUI)[0].value,'3840 × 2160 px');
  select.value='4';select.listeners.change();assert.equal(format(config,'png').button().id,'btnPNG4');
});

// QA F2/F5: values stay live without rebuilding/focus loss, readiness follows the current conversion.
test('Dither readout recomputes dimensions and scale after undo while the same dialog stays open',()=>{
 const snapshot={values:{res:160},image:{width:1920,height:1080}};
 const config=setup('dither-svg',{snapshot});const readout=config.fields.size(fmt('png'),ui)[0];
 assert.equal(readout.value,'1280 × 720 px');snapshot.values.res=320;
 assert.equal(readout.value,'1280 × 720 px');assert.match(readout.note,/整数 4 倍/);
 snapshot.values.res=1000;assert.equal(readout.value,'1000 × 563 px');assert.match(readout.note,/整数 1 倍/);
 snapshot.values.res=160;assert.equal(readout.value,'1280 × 720 px');assert.match(readout.note,/整数 8 倍/);
});
test('Grid readout follows source rotation and undo without reopening',()=>{
 const snapshot={source:{width:1000,height:1250}},config=setup('grid-stretch',{snapshot});
 const readout=config.fields.size(fmt('png'),ui);assert.equal(readout.value,'1000 × 1250 px');
 snapshot.source={width:1250,height:1000};assert.equal(readout.value,'1250 × 1000 px');
 snapshot.source={width:1000,height:1250};assert.equal(readout.value,'1000 × 1250 px');
});
test('Dither capability rejects stale preview after a queued or failed conversion',()=>{
 let ready=false;const native={disabled:false},config=setup('dither-svg',{exportReady:{isReady:()=>ready},nodes:{'#svgHolder svg':{},'#busy':{classList:{contains:()=>false}},'#btnDownloadSVG':native}});
 assert.equal(format(config,'svg').available().ok,false);ready=true;assert.equal(format(config,'svg').available().ok,true);
 native.disabled=true;assert.equal(format(config,'svg').available().ok,false);native.disabled=false;ready=false;assert.equal(format(config,'png').available().ok,false);
});
