'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {HistoryController}=require('../shared/editor-history.js');
const {validate}=require('../shared/numeric-input.js')._test;
const read=name=>fs.readFileSync(path.join(__dirname,'../tools',name+'.html'),'utf8');
function setup(name){
  const source=read(name),elements=new Map(),calls=[];
  function node(id){if(!elements.has(id))elements.set(id,{id,value:'',textContent:'',checked:false,disabled:false,hidden:false,style:{},dataset:{},classList:{toggle(){},remove(){},add(){}},querySelectorAll(){return[];},querySelector(){return null;},removeAttribute(k){delete this[k];},replaceChildren(){this.empty=true;}});return elements.get(id);}
  const ctx={window:{_peekURL:null},document:{},console,Set,JSON,Number,Math,clearTimeout:()=>calls.push('clear'),setTimeout:fn=>{calls.push('timer');return 1;},queueMicrotask:fn=>fn(),
    $:id=>node(id.replace(/^#/,'')),state:{},srcImage:null,renderTimer:0,zoom:{pendingFit:false},lastSVG:'svg',
    setPeekCSSVars:()=>calls.push('peekCSS'),removeRing:()=>calls.push('removeRing'),scheduleRender:()=>calls.push('scheduleRender'),isCellMethod:m=>['halftone','dotgrid'].includes(m),
    memPresets:[],persistPresets:()=>calls.push('persistPresets'),renderPresetList:()=>calls.push('renderPresetList'),wrTimer:0,vx:5,vy:8,vz:2,lastT:0,recActive:false,syncUI:()=>calls.push('syncUI'),sizesDirty:()=>calls.push('sizesDirty'),applyView:()=>calls.push('applyView'),render:()=>calls.push('render'),rebuildWorking:()=>calls.push('rebuildWorking'),
    rt:0,srcFull:{width:100,height:80},originalFull:{width:100,height:80},isSample:true,view:node('view'),buildPreview:()=>calls.push('buildPreview'),requestRender:()=>calls.push('requestRender'),
    hist:[4,3],_rt:0,_rec:null,refreshAll:()=>calls.push('refreshAll'),syncVideoLoop:()=>calls.push('syncVideoLoop'),schedule:()=>calls.push('schedule'),renderChips:()=>calls.push('renderChips'),
    renderColorList:()=>calls.push('renderColorList'),fmtv:v=>String(v),fmts:new Proxy({},{get:()=>v=>String(v)})};
  vm.createContext(ctx);
  if(name==='halftone-lab'||name==='dither-svg')vm.runInContext('state='+source.match(/const state\s*=\s*(\{[\s\S]*?\n\});/)[1],ctx);
  if(name==='grid-stretch')vm.runInContext('state='+source.match(/var state=(\{[^\n]+\});/)[1],ctx);
  if(name==='effect-stack')ctx.state={seed:4,canvas:{mode:'custom',w:640,h:480},src:{type:'mesh',pal:['#000','#fff'],n:2,var:1,noiseScale:3,shapeN:6},stack:[{id:'A',on:true,p:{amt:5}},{id:'B',on:false,p:{r:6.1}}],stamp:{on:true,pos:'tl',size:12}};
  if(name==='pixel-gradient'){const fn=source.match(/function defaultState\(\)\{[\s\S]*?\n\}/)[0];vm.runInContext(fn+';state=defaultState();',ctx);ctx.currentColors=()=>ctx.state.type==='mesh'?ctx.state.meshPoints:ctx.state.stops;}
  const blocks=[...source.matchAll(/\/\* ML_KEYBOARD_BEGIN \*\/\n([\s\S]*?)\n\/\* ML_KEYBOARD_END \*\//g)].map(m=>m[1]);
  const hook=blocks.find(b=>b.includes('window.MLRasterModel='));assert.ok(hook,name);
  vm.runInContext(hook,ctx,{filename:name+'-model-hook'});
  return{ctx,model:ctx.window.MLRasterModel,node,calls,source};
}
const names=['halftone-lab','dither-svg','grid-stretch','effect-stack','pixel-gradient'];
for(const name of names){
  test(name+': snapshots own their mutable settings',()=>{
    const x=setup(name),a=x.model.capture(),before=JSON.stringify(a.values||a);
    if(name==='pixel-gradient')x.ctx.state.meshPoints[0].x=.9;
    else if(name==='grid-stretch'){x.ctx.state.selRows.add(3);x.ctx.state.strength=99;}
    else if(name==='effect-stack'){x.ctx.state.stack[0].p.amt=90;x.ctx.hist.push(20);}
    else if(name==='dither-svg')x.ctx.state.peek.size=400;
    else x.ctx.state.bright=.4;
    assert.equal(JSON.stringify(a.values||a),before);
  });
  test(name+': grouped model changes undo and redo with full UI/cache refresh',()=>{
    const x=setup(name),h=new HistoryController({capture:x.model.capture,restore:x.model.restore,equals:x.model.equals,isBusy:x.model.isBusy});
    const before=x.model.capture();h.begin('gesture');
    for(const value of [1,2,3]){
      if(name==='halftone-lab')x.ctx.state.cell=8+value;
      if(name==='dither-svg')x.ctx.state.peek.size=200+value;
      if(name==='grid-stretch'){x.ctx.state.strength=62+value;x.ctx.state.selRows.add(value);}
      if(name==='effect-stack')x.ctx.state.stack[0].p.amt=value;
      if(name==='pixel-gradient')x.ctx.state.meshPoints[0].x=value/10;
    }
    const after=x.model.capture();h.commit();assert.equal(h.past.length,1);assert.equal(h.undo(),true);
    assert.ok((x.model.equals||((a,b)=>JSON.stringify(a)===JSON.stringify(b)))(x.model.capture(),before));
    assert.equal(h.redo(),true);assert.ok((x.model.equals||((a,b)=>JSON.stringify(a)===JSON.stringify(b)))(x.model.capture(),after));
    assert.ok(x.calls.length>0);
  });
  test(name+': invalid shared numeric drafts never reach the model setter',()=>{
    const x=setup(name),before=JSON.stringify(x.model.capture().values||x.model.capture());
    const cfg={min:0,max:100,scale:1,keyboardStep:1};let writes=0;
    for(const raw of [NaN,Infinity,-Infinity,-1,101]){if(!validate(raw,cfg))writes++;}
    assert.equal(writes,0);assert.equal(JSON.stringify(x.model.capture().values||x.model.capture()),before);
  });
}
test('Halftone exact fractional model values are not snapped by native range assignment',()=>{
  const x=setup('halftone-lab');const range={id:'waveAmp',value:'0.26'};
  assert.equal(x.model.valueFor(range),.25);x.model.setRange(range,.27);
  assert.equal(x.ctx.state.waveAmp,.27);assert.equal(x.model.valueFor(range),.27);
  const before=x.model.capture();x.ctx.state.cell=12;x.model.restore(before);
  assert.equal(x.ctx.vx,5);assert.equal(x.ctx.vy,8);assert.equal(x.ctx.vz,2);assert.ok(x.calls.includes('applyView'));
});
test('Dither restores the decoded source, owned peek URL and empty-state controls',()=>{
  const x=setup('dither-svg'),empty=x.model.capture(),imageA={name:'a'},imageB={name:'b'};
  x.ctx.srcImage=imageA;x.ctx.window._peekURL='blob:a';const a=x.model.capture();
  x.ctx.srcImage=imageB;x.ctx.window._peekURL='blob:b';x.model.restore(a);
  assert.equal(x.ctx.srcImage,imageA);assert.equal(x.ctx.window._peekURL,'blob:a');assert.equal(x.node('peekImg').src,'blob:a');assert.equal(x.node('emptyWrap').style.display,'none');
  x.model.restore(empty);assert.equal(x.ctx.srcImage,null);assert.equal(x.node('btnDownloadSVG').disabled,true);assert.equal(x.node('svgHolder').empty,true);
});
test('Dither peek-only numeric updates do not schedule conversion',()=>{
  const x=setup('dither-svg');x.model.setRange({id:'peekFadeR'},320);
  assert.equal(x.ctx.state.peek.fade,320);assert.ok(x.calls.includes('peekCSS'));assert.ok(!x.calls.includes('scheduleRender'));
  x.model.setRange({id:'gamR'},1.25);assert.equal(x.ctx.state.gamma,1.25);assert.ok(x.calls.includes('scheduleRender'));
});
test('Grid restores Sets and immutable rotation/source references, not JSON-lost selections',()=>{
  const x=setup('grid-stretch');x.ctx.state.selRows.add(2);x.ctx.state.selCols.add(4);x.ctx.state.manual=true;
  const snap=x.model.capture(),source=snap.source;x.ctx.srcFull={width:80,height:100};x.ctx.state.selRows.clear();x.model.restore(snap);
  assert.ok(x.ctx.state.selRows instanceof Set);assert.deepEqual([...x.ctx.state.selRows],[2]);assert.deepEqual([...x.ctx.state.selCols],[4]);assert.equal(x.ctx.srcFull,source);assert.equal(x.node('manualHint').hidden,false);assert.ok(x.calls.includes('buildPreview'));
});
test('Effect Stack restores exact ordered parameters and recent seed UI without import quantization',()=>{
  const x=setup('effect-stack'),snap=x.model.capture();x.ctx.state.stack.reverse();x.ctx.state.stack[0].p.r=9.5;x.ctx.hist=[];x.model.restore(snap);
  assert.equal(x.ctx.state.stack[0].id,'A');assert.equal(x.ctx.state.stack[1].p.r,6.1);assert.deepEqual(Array.from(x.ctx.hist),[4,3]);assert.ok(x.calls.includes('refreshAll'));assert.ok(x.calls.includes('syncVideoLoop'));
});
test('Pixel restores point arrays and rebuilds object-bound controls and mode guidance',()=>{
  const x=setup('pixel-gradient'),snap=x.model.capture();x.ctx.state.type='conic';x.ctx.state.meshPoints.splice(0,1);x.model.restore(snap);
  assert.equal(x.ctx.state.type,'mesh');assert.equal(x.ctx.state.meshPoints.length,4);assert.ok(x.calls.includes('renderColorList'));assert.match(x.node('typeHint').textContent,/Mesh/);
  const next=x.model.capture();next.selected={kind:'mesh',index:2};assert.equal(x.model.equals(snap,next),true,'selection-only interaction is not a document edit');
});
test('Dither retained-source limit resets before releasing old URL references',()=>{
  const code=fs.readFileSync(path.join(__dirname,'../shared/raster-keyboard.js'),'utf8');
  const expression=code.slice(code.indexOf('window.MLRasterKeyboard=')+'window.MLRasterKeyboard='.length,code.indexOf("  window.addEventListener('pagehide'" )).trim().replace(/;$/,'');
  const events=[],ctx={history:{begin:()=>events.push('begin'),commit:()=>events.push('commit')},urls:new Set(),canvases:new Set(),model:{capture:()=>({})},reset:()=>events.push('reset'),URL:{revokeObjectURL:url=>events.push(url)}};
  vm.createContext(ctx);const lifecycle=vm.runInContext('('+expression+')',ctx);
  for(let i=1;i<=8;i++)lifecycle.afterImageLoad(i>1?'blob:'+(i-1):null,'blob:'+i);
  assert.equal(events.filter(x=>x==='reset').length,0);lifecycle.afterImageLoad('blob:8','blob:9');
  assert.equal(events[8],'reset');assert.deepEqual(events.slice(9),Array.from({length:8},(_,i)=>'blob:'+(i+1)));assert.deepEqual([...ctx.urls],['blob:9']);
});
test('Media replacement boundaries occur only after successful source decode',()=>{
  for(const name of ['halftone-lab','grid-stretch','effect-stack'])assert.match(read(name),/queueMicrotask\(\(\)=>window\.MLRasterKeyboard\?\.boundary\(/);
  const dither=read('dither-svg');assert.ok(dither.indexOf('beforeImageLoad()')<dither.indexOf('    srcImage=img;'));
  assert.match(dither,/if\(window\.MLRasterKeyboard\)window\._peekURL=null;/);
});
function labelAdapterFixture(tool='pixel-gradient'){
  const source=fs.readFileSync(path.join(__dirname,'../shared/raster-keyboard.js'),'utf8');
  const bound=new Map(),created=[],destroyed=[];let options,ranges=[];
  const container={children:[]};
  function rebuild(){
    for(const binding of bound.values()){binding.input.isConnected=false;binding.range.isConnected=false;}
    container.children=[{parentElement:container},{parentElement:container}];ranges=[];
    container.children.forEach((card,i)=>{
      for(const key of i===0?['x','y']:['t']){
        const attrs={},effect=tool==='effect-stack'?{dataset:{id:i?'BLUR':'GLITCH'},querySelector:()=>({textContent:i?'BLUR':'GLITCH'})}:null;
        const range={id:'',dataset:{k:key},value:'.15',isConnected:true,getAttribute:k=>attrs[k]||null,setAttribute:(k,v)=>attrs[k]=v,
          closest:s=>s==='.color-card'&&tool==='pixel-gradient'?card:s==='.fxrow'?effect:s==='.prow'&&effect?{querySelector:s=>s===':scope > span'?{textContent:'強度'}:null}:null};
        if(effect)attrs['aria-label']='強度';ranges.push(range);
      }
    });
  }
  rebuild();
  const numeric={getBinding:r=>bound.get(r),refresh(){},bind:opts=>{
    const binding={range:opts.range,input:{isConnected:true,label:opts.label},destroy(){destroyed.push(this);bound.delete(this.range);}};
    created.push(binding);bound.set(opts.range,binding);return binding;
  }};
  const history={subscribe:fn=>fn(),reset(){},begin(){},commit(){}};
  const document={body:{dataset:{}},createElement:()=>({setAttribute(){}}),querySelector:()=>null,querySelectorAll:()=>ranges,getElementById:()=>null};
  const window={MLRasterModel:{name:'test',tool,capture:()=>({}),restore:rebuild,valueFor:()=>.15},MLNumberInputs:numeric,MLEditorHistory:{register:o=>{options=o;return history;}},addEventListener(){}};
  vm.runInNewContext(source,{window,document,MutationObserver:class{observe(){}},URL:{revokeObjectURL(){}},Event:class{},Set});
  return{options,created,destroyed,get ranges(){return ranges;}};
}
test('Pixel generated numbers receive semantic labels before any observer runs',()=>{
  const x=labelAdapterFixture();assert.deepEqual(x.created.map(b=>b.input.label),['カラー 1 横位置','カラー 1 縦位置','カラー 2 位置']);
  assert.equal(x.ranges[0].getAttribute('aria-label'),'カラー 1 横位置');
});
test('Pixel undo rebuild preserves unique numeric labels synchronously and removes stale bindings',()=>{
  const x=labelAdapterFixture(),before=x.created.map(b=>b.input.label);x.options.restore({});
  assert.equal(x.destroyed.length,3);assert.deepEqual(x.created.slice(3).map(b=>b.input.label),before);
  assert.ok(x.created.slice(3).every(b=>b.input.isConnected));
});
test('Effect Stack numeric names include effect identity instead of ambiguous repeated labels',()=>{
  const x=labelAdapterFixture('effect-stack');
  assert.equal(x.created[0].input.label,'GLITCH / 強度');assert.equal(x.created.at(-1).input.label,'BLUR / 強度');
});

test('native-only raster ranges use validated canonical events instead of a silent snapping setter',()=>{const s=fs.readFileSync('shared/raster-keyboard.js','utf8');assert.match(s,/setValue:model\.setRange\?value=>model\.setRange\(range,value\):undefined/);});
