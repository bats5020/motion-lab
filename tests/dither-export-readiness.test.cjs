'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../tools/dither-svg.html'),'utf8');
const helper=html.slice(html.indexOf('let renderTimer=null;'),html.indexOf('/* どのmethodがセル系か */'));
const renderer=html.slice(html.indexOf('function scheduleRender(){'),html.indexOf('/* ================================================================\n   UIバインド'));
const wrap=html.match(/function wrapSVG\(body,W,H,bg\)\{[\s\S]*?\n\}/)[0];
const output=html.slice(html.indexOf("$('#btnDownloadSVG').onclick="),html.indexOf('/* 初期表示のラベル */'));
const alpha=html.match(/\$\('#transBg'\)\.onchange=[^\n]+/)[0];
function setup(){
  const nodes=new Map(),timers=new Map(),raf=[],downloads=[],images=[],errors=[],fills=[];let serial=0,fail=false;
  const node=id=>{if(!nodes.has(id)){const classes=new Set();nodes.set(id,{id,disabled:false,style:{},offsetLeft:0,offsetTop:0,textContent:'',innerHTML:'',classList:{add:n=>classes.add(n),remove:n=>classes.delete(n),toggle(n,on){on?classes.add(n):classes.delete(n);},contains:n=>classes.has(n)},querySelector:()=>({style:{}})});}return nodes.get(id);};
  class Image{constructor(){this.width=160;this.height=90;images.push(this);}}
  const context={window:{},$:node,srcImage:{width:160,height:90},lastSVG:'<svg><rect fill="#fff"/></svg>',state:{method:'threshold',res:160,bg:'#fff',fg:'#000',transBg:false},zoom:{pendingFit:false},Blob,Image,
    console:{error:err=>errors.push(err.message)},toast:()=>{},setTimeout(fn,ms){const id=++serial;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),requestAnimationFrame:fn=>raf.push(fn),
    getGrayData(){if(fail)throw Error('decode failure');return {gray:[],W:160,H:90};},ditherToBitmap:()=>[],zoomFit(){},applyZoom(){},
    navigator:{clipboard:{writeText:()=>Promise.resolve()}},downloadFile:(name,data)=>downloads.push({name,data}),URL:{createObjectURL:()=>"blob:test",revokeObjectURL(){}},
    document:{createElement:tag=>{assert.equal(tag,'canvas');return {width:0,height:0,getContext:()=>({fillStyle:'',fillRect(){fills.push(this.fillStyle);},drawImage(){}}),toBlob:callback=>callback(new Blob(['png']))};}}
  };
  vm.createContext(context);vm.runInContext(helper+wrap+'\nfunction bitmapToSVG(b,W,H){return wrapSVG("<rect/>",W,H,state.bg);}\n'+renderer+output+alpha,context);
  return {ctx:context,node,downloads,images,errors,fills,ready:()=>context.window.MLDitherExport.isReady(),changeAlpha:checked=>node('#transBg').onchange({target:{checked}}),
    timer(){const entry=timers.entries().next().value;if(entry){timers.delete(entry[0]);entry[1].fn();}},frame(){raf.shift()?.();},flush(){while(timers.size){this.timer();}while(raf.length){this.frame();}},
    setFailure:value=>fail=value,setSource:value=>context.srcImage=value,schedule:()=>vm.runInContext('scheduleRender()',context),exportSVG:()=>node('#btnDownloadSVG').onclick(),exportPNG:()=>node('#btnDownloadPNG').onclick(),copySVG:()=>node('#btnCopySVG').onclick()};
}
test('rapid alpha → SVG/PNG/code export is blocked throughout debounce and animation frames',()=>{
  const x=setup();assert.equal(x.ready(),true);x.changeAlpha(true);
  assert.equal(x.ready(),false);assert.equal(x.node('#busy').classList.contains('show'),true);assert.equal(x.ctx.lastSVG,'');
  for(const id of ['#btnDownloadSVG','#btnDownloadPNG','#btnCopySVG'])assert.equal(x.node(id).disabled,true);
  x.exportSVG();x.exportPNG();x.copySVG();assert.equal(x.downloads.length,0);assert.equal(x.images.length,0);
  x.timer();assert.equal(x.ready(),false);x.frame();assert.equal(x.ready(),false);x.frame();
  assert.equal(x.ready(),true);assert.equal(x.node('#busy').classList.contains('show'),false);
  x.exportSVG();assert.equal(x.downloads.length,1);assert.doesNotMatch(x.downloads[0].data,/fill="#fff"/);
});
test('superseded animation-frame work cannot unlock a newer queued conversion',()=>{
  const x=setup();x.changeAlpha(true);x.timer();x.frame(); // old render awaiting its second frame
  x.changeAlpha(false);x.frame(); // stale completion must not release the new debounce
  assert.equal(x.ready(),false);assert.equal(x.node('#busy').classList.contains('show'),true);assert.equal(x.node('#btnDownloadSVG').disabled,true);
  x.flush();assert.equal(x.ready(),true);x.exportSVG();assert.match(x.downloads[0].data,/fill="#fff"/);
});
test('conversion failure releases busy but keeps stale preview unexportable, and next success recovers',()=>{
  const x=setup();x.setFailure(true);x.changeAlpha(true);x.flush();
  assert.equal(x.ready(),false);assert.equal(x.node('#busy').classList.contains('show'),false);assert.equal(x.node('#btnDownloadSVG').disabled,true);assert.deepEqual(x.errors,['decode failure']);
  x.exportSVG();x.exportPNG();assert.equal(x.downloads.length,0);assert.equal(x.images.length,0);
  x.setFailure(false);x.schedule();x.flush();assert.equal(x.ready(),true);assert.equal(x.node('#btnDownloadSVG').disabled,false);
});
test('empty source cancels pending conversion and never leaves a permanent busy lock',()=>{
  const x=setup();x.changeAlpha(true);x.timer();x.frame();x.setSource(null);x.schedule();x.flush();
  assert.equal(x.ready(),false);assert.equal(x.node('#busy').classList.contains('show'),false);assert.equal(x.ctx.lastSVG,'');
  for(const id of ['#btnDownloadSVG','#btnDownloadPNG','#btnCopySVG'])assert.equal(x.node(id).disabled,true);
  x.setSource({width:160,height:90});x.schedule();x.flush();assert.equal(x.ready(),true);
});
test('source disappearing between queued frames safely releases busy',()=>{
  const x=setup();x.schedule();x.timer();x.frame();x.setSource(null);x.frame();assert.equal(x.ready(),false);assert.equal(x.node('#busy').classList.contains('show'),false);
});
test('PNG alpha/background are snapshotted at export start rather than changed during image decode',()=>{
  const x=setup();x.schedule();x.flush();x.exportPNG();assert.equal(x.images.length,1);
  x.changeAlpha(true);x.ctx.state.bg='#f00';x.images[0].onload();
  assert.deepEqual(x.fills,['#fff']);assert.equal(x.downloads[0].name,'bitmap.png');
});
test('SVG and PNG native handlers both guard current conversion readiness',()=>{
  assert.equal((output.match(/if\(!ditherExportReady\(\)\)return;/g)||[]).length,3);
  const exact=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/dither-export-fix.json'),'utf8'));
  let restored=html;for(const change of exact.changes.slice().reverse()){assert.equal(restored.split(change.after).length-1,change.count);restored=restored.split(change.after).join(change.before);}
  assert.match(restored,/function scheduleRender\(\)\{ clearTimeout\(renderTimer\); renderTimer=setTimeout\(render,120\); \}/);
});
