const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createConfig,supportsVideo,EGG_VIDEO}=require('../shared/export-type-shape.js');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
function fixture(){
  const elements=new Map();
  const node=(selector)=>{
    if(!elements.has(selector))elements.set(selector,{disabled:false,hidden:true,title:'',open:false,value:'',dataset:{},options:[],classList:{contains:()=>false},addEventListener(type,fn){this[type]=fn;},click(){this.click?.handler?.();},showModal(){this.open=true;},close(){this.open=false;}});
    return elements.get(selector);
  };
  const doc={body:{dataset:{}},querySelector:node,createElement:()=>({dataset:{},children:[],append(child){this.children.push(child);},addEventListener(type,fn){this[type]=fn;}})};
  const env={MediaRecorder:{isTypeSupported:()=>true},HTMLCanvasElement:{prototype:{captureStream(){}}},GIF:function(){},JSZip:function(){}};
  const ui={field:(label,target,note)=>({type:'field',label,target,note}),take:target=>({type:'take',target}),readout:(label,value,note)=>({type:'readout',label,value,note}),note:text=>({type:'note',text}),nativeClick:()=>{},close:()=>{},refresh:()=>{}};
  return {doc,env,ui,node};
}
test('type/shape adapter parses without rewriting or fetching export engines',()=>{
  const source=read('shared/export-type-shape.js');new vm.Script(source);
  assert.doesNotMatch(source,/new MediaRecorder|\.toBlob\(|fetch\(|captureStream\(/);
});
test('video capability checks require recorder, stream API and supported codec',()=>{
  const {env}=fixture();assert.equal(supportsVideo(env),true);
  assert.equal(supportsVideo({...env,MediaRecorder:null}),false);
  assert.equal(supportsVideo({...env,HTMLCanvasElement:null}),false);
  assert.equal(supportsVideo({...env,MediaRecorder:{isTypeSupported:()=>false}}),false);
  assert.equal(supportsVideo({...env,MediaRecorder:{isTypeSupported:()=>{throw new Error('unsupported');}}}),false);
});
test('all five configurations expose the same four ordered field builders',()=>{
  for(const kind of ['ascii-wave','warp-type','u19-aberration','wireframe','egg-glass']){
    const {doc,env}=fixture(),config=createConfig(kind,doc,env);
    assert.deepEqual(Object.keys(config.fields),['size','alpha','fps','extra']);
    assert.ok(config.trigger);assert.equal(typeof config.fields.size,'function');
    for(const format of config.formats){assert.equal(typeof format.button,'function');assert.equal(typeof format.available,'function');}
  }
});
test('actual format inventories: no speculative MP4, SVG or static PNG in unsupported tools',()=>{
  const expected={'ascii-wave':['png','webm','html'],'warp-type':['png','webm'],'u19-aberration':['png','webm'],wireframe:['webm','png','gif','svg','html'],'egg-glass':['png','mp4','webm-vp9','webm-vp8','html']};
  for(const [kind,ids]of Object.entries(expected)){const {doc,env}=fixture();assert.deepEqual(createConfig(kind,doc,env).formats.map(format=>format.id),ids);}
});
test('ASCII HTML is responsive; still PNG has no FPS; WebM has fixed 60 FPS and native duration',()=>{
  const {doc,env,ui}=fixture(),config=createConfig('ascii-wave',doc,env);
  assert.match(config.fields.size({id:'html'},ui).value,/画面に追従/);
  assert.equal(config.fields.fps({id:'png'},ui).value,'不要');
  assert.equal(config.fields.fps({id:'webm'},ui).value,'60 fps（固定）');
  assert.equal(config.fields.extra({id:'webm'},ui)[0].target,'#i-dur');
  assert.match(config.fields.extra({id:'webm'},ui)[2].text,/破棄する中止機能ではありません/);
});
test('Warp preserves derived height and labels stop-to-save rather than cancellation',()=>{
  const {doc,env,ui}=fixture(),config=createConfig('warp-type',doc,env);
  assert.equal(config.fields.size({id:'png'},ui)[2].target,'#v-exp');
  assert.equal(config.fields.fps({id:'webm'},ui).value,'60 fps（固定）');
  assert.match(config.fields.extra({id:'webm'},ui)[2].text,/破棄する中止機能ではありません/);
  assert.equal(config.cancel,undefined);
});
test('U19 PNG multiplier belongs in size and selects the corresponding original callback',()=>{
  const {doc,env,ui}=fixture(),config=createConfig('u19-aberration',doc,env),png=config.formats[0];
  assert.equal(png.button(),doc.querySelector('#btnPng1'));
  const select=config.fields.size({id:'png'},ui)[1].target;
  assert.deepEqual(select.children.map(option=>option.value),['1','2']);
  select.change({target:{value:'2'}});
  assert.match(config.fields.size({id:'png'},ui)[2].text,/2倍.*8192/);
  assert.equal(png.button(),doc.querySelector('#btnPng2'));
  assert.equal(config.fields.fps({id:'png'},ui).value,'不要');
  assert.match(JSON.stringify(config.fields.extra({id:'webm'},ui)),/ループON/);
  assert.ok(!config.formats.some(format=>format.button()===doc.querySelector('#btnUrl')));
});
test('Wireframe GIF effective FPS/frame cap and HTML network requirement are explicit',()=>{
  const {doc,env,ui}=fixture(),config=createConfig('wireframe',doc,env);
  assert.match(JSON.stringify(config.fields.fps({id:'gif'},ui)),/25 fps.*200/);
  assert.match(config.formats.find(format=>format.id==='gif').note,/短く/);
  assert.match(config.formats.find(format=>format.id==='html').note,/CDN.*インターネット/);
  assert.equal(config.fields.fps({id:'svg'},ui).value,'不要');
  assert.match(config.fields.extra({id:'png'},ui)[2].text,/中止は未対応/);
});
test('Wireframe missing dependencies disable only their formats with visible reasons',()=>{
  const {doc,env}=fixture();delete env.GIF;delete env.JSZip;
  const config=createConfig('wireframe',doc,env);
  assert.equal(config.formats.find(format=>format.id==='gif').available().ok,false);
  assert.equal(config.formats.find(format=>format.id==='png').available().ok,false);
  assert.equal(config.formats.find(format=>format.id==='svg').available().ok,true);
});
test('GPU-unavailable state disables every format, including HTML that needs initialization',()=>{
  for(const kind of ['warp-type','u19-aberration','wireframe','egg-glass']){
    const {doc,env}=fixture();doc.body.dataset.mlUnavailable='true';
    for(const format of createConfig(kind,doc,env).formats){assert.equal(format.available().ok,false);assert.match(format.available().reason,/WebGL/);}
  }
});
test('Egg PNG alone exposes native alpha choice and warns about output cropping',()=>{
  const {doc,env,ui}=fixture(),config=createConfig('egg-glass',doc,env);
  assert.equal(config.fields.alpha({id:'png'},ui).target,'#export-png-target');
  assert.match(config.fields.alpha({id:'png'},ui).note,/トリミング/);
  for(const id of ['mp4','webm-vp9','webm-vp8','html'])assert.match(config.fields.alpha({id},ui).value,/非対応/);
  assert.equal(config.fields.fps({id:'png'},ui).value,'不要');
  assert.equal(config.fields.fps({id:'mp4'},ui).target,'#export-fps');
});
test('Egg format selection writes existing native codec and hands off before native busy lifecycle',()=>{
  const {doc,env,node}=fixture(),nativeSelect=node('#export-video-format');
  nativeSelect.options=EGG_VIDEO.map(([,label,value])=>({label,value}));
  const config=createConfig('egg-glass',doc,env);
  for(const [id,,mime]of EGG_VIDEO){const format=config.formats.find(format=>format.id===id);format.select();assert.equal(nativeSelect.value,mime);assert.equal(format.available().ok,true);assert.equal(format.handoff,true);}
  const action=config.formats.find(format=>format.id==='png').button();let clicked=false;
  node('#export-png').click=()=>{clicked=true;};action.click();
  assert.equal(node('#export-dialog').open,true);assert.equal(clicked,true);
});
test('Egg prepare initializes original dialog through guarded native click then closes it',()=>{
  const {doc,env,node,ui}=fixture(),config=createConfig('egg-glass',doc,env);let initialized=false;
  ui.nativeClick=element=>{assert.equal(element,node('#export-open'));initialized=true;node('#export-dialog').open=true;};
  config.prepare(ui);assert.equal(initialized,true);assert.equal(node('#export-dialog').open,false);
});
test('Egg frame preview hands off before native validation, preserving its error display',()=>{
  const {doc,env,node}=fixture(),config=createConfig('egg-glass',doc,env),preview=config.actions[0];
  assert.equal(preview.handoff,true);assert.equal(preview.when({id:'png'}),true);assert.equal(preview.when({id:'html'}),false);
  let dialogOpenAtClick=false;node('#export-frame-preview').click=()=>{dialogOpenAtClick=node('#export-dialog').open;};
  preview.button().click();assert.equal(dialogOpenAtClick,true);
});
test('Egg handoff refreshes the native size caption after unified size changes',()=>{
  const {doc,env,node}=fixture(),config=createConfig('egg-glass',doc,env);
  node('#export-size').textContent='1440 × 900 px';node('#preview-width').value='1920';node('#preview-height').value='1080';
  config.formats.find(format=>format.id==='png').button().click();
  assert.equal(node('#export-size').textContent,'1920 × 1080 px');
});
