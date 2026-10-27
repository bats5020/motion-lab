const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const baselineData=require('./fixtures/material-ui-baseline.json').tools;
const hash=s=>createHash('sha256').update(s).digest('hex');
const names=['glass-lab','thermal-flow','smearworks'];
const inline=s=>[...s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>! /\bsrc\s*=/.test(m[1])).map(m=>m[2]);
for(const name of names){
 const file='tools/'+name+'.html',current=fs.readFileSync(file,'utf8'),baseline=baselineData[name];
 test(name+': original inline engine/export code unchanged',()=>assert.deepEqual(inline(current).map(s=>hash(name==='thermal-flow'?require('./keyboard-preservation.cjs').stripOwnedHooks(s):s.replace(/\/\* ML_KEYBOARD_BEGIN \*\/\n[\s\S]*?\n\/\* ML_KEYBOARD_END \*\/\n/g,''))),baseline.inlineScriptSha256));
 test(name+': original IDs retained with their existing counts',()=>{
  const counts=s=>[...s.matchAll(/\bid="([^"]+)"/g)].reduce((m,x)=>(m[x[1]]=(m[x[1]]||0)+1,m),{});
  const old=baseline.idCounts,next=counts(current);for(const [id,count]of Object.entries(old))assert.equal(next[id],count,id);
 });
 test(name+': shared skin and adapter are explicitly enabled',()=>{
  assert.match(current,/class="ml-workbench ml-material"/);
  assert.match(current,/shared\/material-workbench.css/);assert.match(current,/shared\/material-workbench.js/);
  assert.equal(current.match(/src="\.\.\/shared\/material-workbench.js"/g).length,1);
 });
}
for(const file of ['shared/material-workbench.js','shared/workbench.js'])test(file+': script parses',()=>new vm.Script(fs.readFileSync(file,'utf8')));
function guardFixture(contextAvailable,missing=false){
 class E{
  constructor(tag='div'){this.tagName=tag;this.disabled=false;this.children=[];this.attrs={};this.dataset={};this.classList={add(){}};}
  setAttribute(k,v){this.attrs[k]=v}append(...els){this.children.push(...els)}addEventListener(k,v){this[k]=v}querySelectorAll(){return[]}
 }
 const controls=[new E('button'),new E('input')],body=new E('body'),stage=new E(),canvas=new E('canvas');body.querySelectorAll=()=>controls;canvas.getContext=kind=>{assert.equal(kind,'webgl2');return contextAvailable?{}:null};
 const document={body,createElement:t=>new E(t),querySelector:s=>s==='#stage'?stage:s==='#view'&&!missing?canvas:null};
 const context={document,window:{},location:{reload(){}},CSS:{escape:x=>x}};vm.runInNewContext(fs.readFileSync('shared/workbench.js','utf8'),context);
 return {api:context.window.MLWorkbench,controls,body,stage,canvas};
}
test('WebGL guard does not disable controls when the real context exists',()=>{const x=guardFixture(true);assert.equal(x.api.requireGraphics({canvas:'#view',stage:'#stage'}),true);assert.equal(x.stage.children.length,0);assert.ok(x.controls.every(c=>!c.disabled));});
test('WebGL guard disables unsafe actions and shows an honest compatibility notice',()=>{const x=guardFixture(false);assert.equal(x.api.requireGraphics({canvas:'#view',stage:'#stage'}),false);assert.ok(x.controls.every(c=>c.disabled));assert.equal(x.body.dataset.graphicsStatus,'unavailable');assert.equal(x.stage.children[0].children[0].attrs.role,'alert');assert.equal(x.canvas.attrs['aria-hidden'],'true');});
test('WebGL guard handles legacy failure code that already removed the canvas',()=>{const x=guardFixture(false,true);assert.equal(x.api.requireGraphics({canvas:'#view',stage:'#stage'}),false);assert.equal(x.stage.children.length,1);assert.ok(x.controls.every(c=>c.disabled));});

test('Material roots fit content width instead of scrollbar-inclusive viewport width',()=>assert.match(fs.readFileSync('shared/material-workbench.css','utf8'),/width:100%!important;max-width:100%/));

test('Thermal desktop inspector expansion cannot grow the fixed canvas grid row',()=>{
 const css=fs.readFileSync('shared/material-workbench.css','utf8');
 assert.match(css,/@media\(min-width:821px\)\{\s*\.ml-material\[data-material-tool=thermal-flow\] \.ml-material-app\{grid-template-rows:minmax\(0,1fr\)\}/);
 assert.match(css,/\.ml-material\[data-material-tool=thermal-flow\] #panel\{min-height:0\}/);
 assert.match(css,/#panelScroll\{min-height:0;overflow-y:auto;overscroll-behavior:contain\}/);
});
