// Contract tests for motion export adapters; do not claim browser codec/GPU validation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../shared/export-motion.js'),'utf8');
function harness(tool,{transparent=false,mode='scene',supported=true,gpu=true,wordHandler}={}){
 const nodes=new Map(),registered=[],downloads=[],urls=[];
 const make=(id)=>({id,dataset:{},textContent:'',checked:false,onclick:null,parentElement:null,
  classList:{contains:c=>false},querySelector:s=>null,closest(){return this;},addEventListener(name,fn){this[name]=fn;},
  click(){if(this.download)downloads.push({name:this.download,href:this.href});return this.onclick?.({target:this})||this.clickHandler?.();}
 });
 const node=id=>{if(!nodes.has(id))nodes.set(id,make(id));return nodes.get(id);};
 node('transparent').checked=transparent;
 node('outSeg').querySelector=()=>({dataset:{v:mode}});
 node('bgMode').querySelector=s=>transparent?{dataset:{val:'transparent'}}:null;
 node('time').textContent='0.00 / 2.50 s';node('meta').textContent='1920×1080 · 30fps · 3.60s';
 node('exInfo').textContent='1920×1080・30fps・尺 7.8秒';node('stageSvg').outerHTML='<svg viewBox="0 0 10 20"><path d="M0 0"/></svg>';
 for(const id of ['btnGIF','btnWebM','btnPNGSeq'])node(id).onclick=wordHandler||(async()=>{});
 const doc={readyState:'complete',body:{dataset:{mlMotion:tool},classList:{contains:c=>c==='ml-render-unavailable'&&!gpu}},
  querySelector:s=>s.startsWith('#')&&!s.includes(',')?node(s.slice(1)):null,
  createElement:tag=>{const n=make(tag);n.addEventListener=(event,fn)=>{if(event==='click')n.clickHandler=fn;};return n;}
 };
 const context={document:doc,MLExportUI:{register:c=>registered.push(c)},HTMLCanvasElement:{prototype:{captureStream(){}}},MediaRecorder:{isTypeSupported:()=>supported},Blob,URL:{createObjectURL:b=>{urls.push(b);return 'blob:test';},revokeObjectURL(){}},setTimeout:fn=>fn()};
 context.window=context;vm.runInNewContext(source,context);
 const ui={field:(label,control,note)=>({kind:'field',label,id:typeof control==='string'?control:control?.id,note}),take:control=>({kind:'take',control}),readout:(label,value,note)=>({kind:'readout',label,value,note}),note:text=>({kind:'note',text}),group:nodes=>({kind:'group',nodes}),refresh(){this.refreshCount=(this.refreshCount||0)+1;}};
 return{config:registered[0],registered,nodes,node,ui,downloads,urls,context};
}
const names=['image-switcher','word-switcher','u19-tile-scroll','flame-transition','u19-hud-sequence'];
for(const name of names)test(`${name}: registers only its own export contract and keeps the four-field order`,()=>{
 const {config,registered}=harness(name);assert.equal(registered.length,1);assert.equal(config.id,name);assert.equal(config.trigger,'#mlMotionExport');
 assert.deepEqual(Object.keys(config.fields),['size','alpha','fps','extra']);assert.ok(config.formats.length);
});
test('other pages are untouched',()=>assert.equal(harness('ascii-wave').registered.length,0));
test('Image exposes only implemented exports; native progress-dialog exports use handoff',()=>{
 const {config}=harness('image-switcher');assert.deepEqual(Array.from(config.formats,f=>f.id),['png','video','png-sequence','html']);assert.ok(config.formats.every(f=>f.handoff));
 assert.equal(config.formats.find(f=>f.id==='video').button,'#exportVideo');
});
test('Image transparent video is blocked; changing native alpha immediately changes availability',()=>{
 const {config,node}=harness('image-switcher',{transparent:true});const video=config.formats.find(f=>f.id==='video');assert.equal(video.available().ok,false);assert.match(video.available().reason,/透過/);node('transparent').checked=false;assert.equal(video.available().ok,true);
});
test('Image video capability and still/HTML FPS are distinguished',()=>{
 const {config,ui}=harness('image-switcher',{supported:false});assert.equal(config.formats.find(f=>f.id==='video').available().ok,false);
 assert.equal(config.fields.fps({id:'png'},ui).value,'不要');assert.equal(config.fields.fps({id:'html'},ui).value,'自動');assert.equal(config.fields.fps({id:'png-sequence'},ui).id,'fps');
});
test('Word preserves separate raster, raw SVG and responsive HTML semantics',()=>{
 const {config,ui}=harness('word-switcher');assert.deepEqual(Array.from(config.formats,f=>f.id),['gif','webm','png-sequence','svg','html']);
 assert.equal(config.fields.size({id:'svg'},ui).value,'元のアートボード');assert.equal(config.fields.size({id:'html'},ui).value,'レスポンシブ');
 assert.equal(config.fields.alpha({id:'html'},ui).value,'非対応');assert.equal(config.fields.fps({id:'svg'},ui).value,'不要');assert.equal(config.fields.fps({id:'html'},ui).value,'自動');
 assert.equal(config.cancel,undefined,'never invent a Word cancel mechanism');
});
test('Word rejects unsupported transparent WebM and missing recorder codec',()=>{
 let h=harness('word-switcher',{transparent:true});assert.equal(h.config.formats.find(f=>f.id==='webm').available().ok,false);
 h=harness('word-switcher',{supported:false});assert.equal(h.config.formats.find(f=>f.id==='webm').available().ok,false);
});
test('Word tracks the complete original async export, prevents duplicates and restores after rejection',async()=>{
 let release,calls=0;const pending=new Promise(r=>release=r);
 const h=harness('word-switcher',{wordHandler:async()=>{calls++;await pending;throw Error('original failure');}});h.config.afterOpen(h.config.formats[0],h.ui);
 const task=h.node('btnGIF').onclick({});assert.equal(h.config.busy(),true);await h.node('btnGIF').onclick({});assert.equal(calls,1);
 release();await assert.rejects(task,/original failure/);assert.equal(h.config.busy(),false);assert.equal(h.ui.refreshCount,2);
});
test('Word SVG saves unchanged current SVG markup without any clipboard action',async()=>{
 const h=harness('word-switcher');const action=h.config.formats.find(f=>f.id==='svg').button();action.click();assert.equal(h.downloads[0].name,'frame.svg');assert.equal(await h.urls[0].text(),h.node('stageSvg').outerHTML);assert.match(h.urls[0].type,/image\/svg\+xml/);assert.doesNotMatch(source,/navigator\.clipboard|execCommand\(/);
});
for(const [name,mode]of[['u19-tile-scroll','tiles'],['flame-transition','alpha']])test(`${name}: transparent mode disables video without rewriting PNG/MOV capability`,()=>{
 const {config}=harness(name,{mode});assert.equal(config.formats.find(f=>f.id==='video').available().ok,false);assert.equal(config.formats.find(f=>f.id==='png').available().ok,true);assert.equal(config.formats.find(f=>f.id==='mov').available().ok,true);
});
for(const name of ['u19-tile-scroll','flame-transition'])test(`${name}: renderer-unavailable blocks all formats`,()=>{
 const {config}=harness(name,{gpu:false});for(const f of config.formats)assert.equal(f.available().ok,false);
});
test('Tile has PNG sequence and selectable FPS; Flame has no invented sequence or selectable FPS',()=>{
 let h=harness('u19-tile-scroll');assert.ok(h.config.formats.some(f=>f.id==='png-sequence'));assert.equal(h.config.fields.fps({id:'mov'},h.ui).id,'fpsSeg');
 h=harness('flame-transition');assert.ok(!h.config.formats.some(f=>f.id==='png-sequence'));assert.equal(h.config.fields.fps({id:'mov'},h.ui).value,'30 fps · 固定');
});
test('HUD exposes one opaque fixed-size/fixed-FPS native video route',()=>{
 const {config,ui}=harness('u19-hud-sequence');assert.equal(config.formats.length,1);assert.equal(config.formats[0].button,'#exBtn');assert.equal(config.fields.size({},ui).value,'1920 × 1080 px · 固定');assert.equal(config.fields.alpha({},ui).value,'非対応');assert.equal(config.fields.fps({},ui).value,'30 fps · 固定');
});
test('All control fields move native nodes rather than cloning or altering render/export source',()=>{
 assert.doesNotMatch(source,/cloneNode|innerHTML\s*=|getContext\(/);assert.match(source,/original\.call\(this,event\)/);assert.match(source,/ui\.field\(label,el\(id\),note\)/);
});
