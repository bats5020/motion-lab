'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {HistoryController}=require('../shared/editor-history.js');
const read=n=>fs.readFileSync(path.join(__dirname,'../tools',n+'.html'),'utf8');
function hooks(n){return [...read(n).matchAll(/\/\* ML_KEYBOARD_BEGIN \*\/\n([\s\S]*?)\n\/\* ML_KEYBOARD_END \*\//g)].map(m=>m[1]);}
function setup(name){
  const nodes=new Map(),calls=[];
  const node=id=>{if(!nodes.has(id))nodes.set(id,{id,value:'',textContent:'value',dataset:{},classList:{remove(){},toggle(){}},querySelector(){return node('select');},getAttribute(){return null;}});return nodes.get(id);};
  const ctx={window:{},JSON,Number,Math,console,$:s=>node(s),document:{querySelector:s=>node(s),querySelectorAll:()=>[]},state:{seed:1,canvas:{mode:'11',w:640,h:640},src:{type:'orb',n:1,size:46,glow:40,drift:30,cols:['#fff']},glass:{count:30,angle:90,shape:'lines',prof:'prism',dist:68,stretch:18,shift:14,chroma:22,hi:32,sh:46,blur:8,grain:14},motion:{speed:26,mouse:false}},_rec:null,_orbs:null,srcImage:null,srcVideo:null,
    srcTypeGuard:()=>calls.push('guard'),orbState:()=>[{seed:ctx.state.seed}],refreshAll:()=>calls.push('refresh'),renderGL:()=>calls.push('render'),previewSize:()=>[400,400],uploadTexture:()=>calls.push('upload'),applyRandom:v=>{ctx.state.seed=v;calls.push('random');},UI:{recDur:{row:node('recRow'),set:v=>node('select').value=v}},
    S:{aspect:'2:3',zoom:1,ox:.5,oy:.5,blur:.45,con:1.7,gi:0,col:'#fff'},G:{src:'dir',spread:1.6,ang:30,off:.1,warp:20,stops:[{t:0,c:'#000'},{t:1,c:'#fff'}]},GRADS:[{name:'one',stops:[{t:0,c:'#000'},{t:1,c:'#fff'}]}],presets:[{name:'saved',look:{blur:.45}}],clone:v=>JSON.parse(JSON.stringify(v)),drag:{},dragging:true,sliding:true,ov:node('ov'),buildLut:()=>calls.push('lut'),cropRect:()=>calls.push('crop'),sync:()=>calls.push('sync'),fit:()=>calls.push('fit'),schedule:()=>calls.push('schedule'),storePresets:()=>calls.push('persist'),renderPresets:()=>calls.push('presets'),updateSaveLabel:()=>calls.push('saveLabel')};
  vm.createContext(ctx);vm.runInContext(hooks(name).find(s=>s.includes('window.MLMaterialModel=')),ctx);
  return{ctx,model:ctx.window.MLMaterialModel,calls,node};
}
for(const name of ['glass-lab','smearworks']){
  test(name+': owned snapshot restores real state, UI and rendering cache',()=>{
    const x=setup(name),snap=x.model.capture(),before=JSON.stringify(snap);
    if(name==='glass-lab'){x.ctx.state.glass.dist=12;x.ctx.state.src.cols.push('#333');}else{x.ctx.S.blur=.99;x.ctx.G.stops[0].c='#ff0';x.ctx.GRADS.push({name:'two'});}
    assert.equal(JSON.stringify(snap),before);x.model.restore(snap);assert.equal(JSON.stringify(x.model.capture()),before);
    assert.ok(x.calls.includes(name==='glass-lab'?'render':'lut'));assert.ok(x.calls.includes(name==='glass-lab'?'refresh':'sync'));
  });
  test(name+': multiple gesture updates remain one undo/redo entry',()=>{
    const x=setup(name),h=new HistoryController({capture:x.model.capture,restore:x.model.restore,isBusy:x.model.isBusy});
    const before=x.model.capture();h.begin('gesture');for(const v of [20,30,40]){if(name==='glass-lab')x.ctx.state.glass.dist=v;else x.ctx.S.blur=v/100;}const after=x.model.capture();h.commit();
    assert.equal(h.past.length,1);assert.equal(h.undo(),true);assert.equal(JSON.stringify(x.model.capture()),JSON.stringify(before));assert.equal(h.redo(),true);assert.equal(JSON.stringify(x.model.capture()),JSON.stringify(after));
  });
}
test('Glass nested object identities survive restore and the original preset callback',()=>{
  const x=setup('glass-lab'),g=x.ctx.state.glass,src=x.ctx.state.src,canvas=x.ctx.state.canvas,motion=x.ctx.state.motion,snap=x.model.capture();
  x.ctx.state.glass.dist=1;x.model.restore(snap);assert.equal(x.ctx.state.glass,g);assert.equal(x.ctx.state.src,src);assert.equal(x.ctx.state.canvas,canvas);assert.equal(x.ctx.state.motion,motion);
  const source=read('glass-lab'),start=source.indexOf("    ch.addEventListener('click',()=>{"),end=source.indexOf('    c.appendChild(ch);',start);
  x.ctx.p={src:{type:'orb',cols:['#123']},glass:{...x.ctx.state.glass,dist:11},motion:{speed:12}};
  let click;x.ctx.ch={addEventListener:(_,fn)=>click=fn};vm.runInContext(source.slice(start,end),x.ctx);click();
  assert.equal(x.ctx.state.glass,g);g.dist=77;assert.equal(x.ctx.state.glass.dist,77,'old buildGlass callbacks still edit the live model');
});
test('Glass restore refreshes source texture/video transport and respects recording busy',()=>{
  const x=setup('glass-lab');x.ctx.srcImage={naturalWidth:100,naturalHeight:50};x.ctx.state.src.type='img';const s=x.model.capture();let paused=false;x.ctx.srcVideo={pause:()=>paused=true};x.model.restore(s);
  assert.ok(x.calls.includes('upload'));assert.equal(paused,true);x.ctx._rec={};assert.equal(x.model.isBusy(),true);
});
test('Smear restore persists changed preset library and resets stale drag state',()=>{
  const x=setup('smearworks'),snap=x.model.capture();x.ctx.presets=[];x.model.restore(snap);
  assert.deepEqual(x.ctx.presets,snap.presets);assert.ok(x.calls.includes('persist'));assert.equal(x.ctx.drag,null);assert.equal(x.ctx.dragging,false);assert.equal(x.ctx.sliding,false);
});
test('Smear displayed percent, zoom, angle and gradient controls use explicit raw-unit mapping',()=>{
  const x=setup('smearworks');const ranges=[['blur',{k:'blur'}],['zoom',{k:'zoom'}],['con',{k:'con'}],['goff',{g:'off'}],['gang',{g:'ang'}],['gspread',{g:'spread'}],['gwarp',{g:'warp'}]].map(([id,dataset])=>({id,dataset,getAttribute:()=>null}));
  x.ctx.document.querySelectorAll=()=>ranges;const entries=x.model.rangeEntries();
  assert.deepEqual(Array.from(entries,e=>e.scale),[100,1,1,100,1,1,1]);assert.equal(entries[0].getValue(),.45);entries[0].setValue(.7);assert.equal(x.ctx.S.blur,.7);entries[3].setValue(-.15);assert.equal(x.ctx.G.off,-.15);
});
function exportFixture(failure){
  const source=read('smearworks'),start=source.indexOf("$('#export').addEventListener('click', async () => {"),end=source.indexOf('\n\n/* ───── boot：',start),calls=[],timers=[];let fn;
  const keyboard={exportBusy:false,history:{refresh:()=>calls.push('refresh')}};
  const ctx={window:{MLMaterialKeyboard:keyboard},$:id=>id==='#export'?{addEventListener:(_,f)=>fn=f}:{hidden:false},cropRect:()=>[0,0,1,1],srcW:100,srcH:100,MAXTEX:16,Math,Uint8Array,Uint8ClampedArray,ImageData:class{},toast:()=>{},setTimeout:f=>{timers.push(f);},makeSet:()=>({ok:failure!=='memory'}),target:()=>({ok:true,fb:{}}),freeSet:()=>{},free:()=>{},run:()=>{calls.push('run');if(failure==='render')throw Error('render failed');},gl:{bindFramebuffer(){},readPixels(){}},schedule(){},document:{createElement:()=>({getContext:()=>({putImageData(){}}),toBlob:cb=>cb({type:'image/png'})})},save:()=>calls.push('save'),name:'sample'};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end),ctx);return{fn,calls,timers,keyboard};
}
for(const failure of [null,'memory','render'])test('Smear asynchronous export busy guard clears on '+(failure||'success'),async()=>{
  const x=exportFixture(failure),pending=x.fn();assert.equal(x.keyboard.exportBusy,true);await x.fn();assert.equal(x.timers.length,1,'repeat click is ignored');x.timers.shift()();
  if(failure==='render')await assert.rejects(pending,/render failed/);else await pending;
  assert.equal(x.keyboard.exportBusy,false);assert.equal(x.calls.filter(s=>s==='refresh').length,2);if(!failure)assert.ok(x.calls.includes('save'));
});
test('Material adapter installs wheel-burst boundary handling before shared auto events',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../shared/material-keyboard.js'),'utf8');
  new vm.Script(source);assert.ok(source.indexOf("window.addEventListener('pointerdown'")<source.indexOf('history=window.MLEditorHistory.register'));
  assert.match(source,/setTimeout\(\(\)=>\{wheelTimer=0;history\.commit\(\);\},180\)/);
  assert.match(source,/graphicsStatus==='unavailable'/);
});
