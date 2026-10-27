const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,'tools/egg-glass',name),'utf8');
const clone=structuredClone;
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
function functionBody(source,name){
  const start=source.indexOf(`  function ${name}(`);assert.ok(start>=0,name);
  let open=source.indexOf('{',start),depth=1,i=open+1;
  // These restore functions contain no template literals/braces in strings.
  for(;depth&&i<source.length;i++){if(source[i]==='{')depth++;else if(source[i]==='}')depth--;}
  return source.slice(start,i);
}
test('Egg shared helpers are exact local mirrors for offline use',()=>{
  for(const file of ['editor-history.js','editor-history.css','numeric-input.js','numeric-input.css']){
    assert.equal(digest(read(file)),digest(fs.readFileSync(path.join(root,'shared',file))),file);
  }
});
test('Egg offline package includes every ergonomic dependency and inlines all styles',()=>{
  const html=read('html-export.js'),entry=read('keyboard-controls.js'),index=read('index.html');
  for(const file of ['keyboard-controls.js','editor-history.js','editor-history.css','numeric-input.js','numeric-input.css'])assert.ok(html.includes(`'${file}'`),file);
  assert.match(html,/querySelectorAll\('link\[rel=stylesheet\]'\)/);
  assert.match(html,/files\['numeric-input.css'\]/);assert.match(html,/files\['editor-history.css'\]/);
  assert.match(entry,/from '.\/editor-history.js'/);assert.match(entry,/from '.\/numeric-input.js'/);
  assert.doesNotMatch(index,/\.\.\/shared/);
});
test('Motion restore retains exact PC/SP keys, target and fractional values',()=>{
  const code=functionBody(read('scroll-controls.js'),'restoreEditor');
  const saved={project:{version:4,keyframes:[{id:'custom-uuid',at:14.3,x:.333,scale:72.77}],background:{fit:'edges',keyframes:[{id:'bg-unique',at:0,angle:1.234}]},responsive:{enabled:true,breakpoint:821,sp:{keyframes:[{id:'sp-own',at:22.2,y:-.777}]}}},target:'background',preview:.143};
  const c={structuredClone:clone,THREE:{MathUtils:{clamp:(v,a,b)=>Math.max(a,Math.min(b,v))}},gizmo:{setEditing:value=>c.editing=value},motionState:{},history:[1],future:[2],marks:{replaceChildren:()=>c.cleared=true},save:()=>c.saved=true,refreshProfile:()=>c.refreshed=true,setPreview:value=>c.previewApplied=value,project:null,target:null,preview:null,force:false};
  vm.createContext(c);vm.runInContext(code+'\nrestoreEditor(input);',Object.assign(c,{input:saved}));
  assert.deepEqual(c.project,saved.project);assert.notEqual(c.project,saved.project);assert.notEqual(c.project.responsive.sp,saved.project.responsive.sp);
  assert.equal(c.target,'background');assert.equal(c.previewApplied,.143);assert.equal(c.motionState.scrollPreview,.143);
  assert.equal(c.editing,false);assert.equal(c.history.length,0);assert.equal(c.future.length,0);assert.ok(c.saved&&c.refreshed&&c.cleared);
});
test('Pattern restore updates owned settings but refuses an unavailable image',()=>{
  const code=functionBody(read('pattern-controls.js'),'restoreEditor');
  const c={structuredClone:clone,settings:{},customTexture:{},revision:1,apply:save=>c.applied=save};vm.createContext(c);
  c.input={source:'image',colors:['#000000','#ffffff'],scale:123.456};vm.runInContext(code+'\nrestoreEditor(input);',c);
  assert.deepEqual(c.settings,c.input);assert.notEqual(c.settings,c.input);assert.equal(c.applied,true);assert.equal(c.revision,2);
  c.customTexture=null;assert.throws(()=>vm.runInContext('restoreEditor(input)',c),/画像/);
});
test('Logo restore preserves the active asset generation and restores parameters',()=>{
  const code=functionBody(read('logo-controls.js'),'restoreEditor');
  const c={structuredClone:clone,settings:{imageSource:'custom',size:72},revision:4,apply:save=>c.applied=save};vm.createContext(c);
  c.input={imageSource:'custom',size:55.555,enabled:false,x:-2.123};vm.runInContext(code+'\nrestoreEditor(input)',c);
  assert.deepEqual(c.settings,c.input);assert.notEqual(c.settings,c.input);assert.equal(c.applied,true);assert.equal(c.revision,5);
  c.input={imageSource:'provided'};assert.throws(()=>vm.runInContext('restoreEditor(input)',c),/画像変更/);
});
test('Common history owns motion buttons without a second private stack',()=>{
  const code=read('scroll-controls.js');
  assert.match(code,/function remember\(\) \{[\s\S]*?if\(editorHistory\)return;/);
  assert.match(code,/editorHistory\[id==='scroll-undo'\?'undo':'redo'\]\(\)/);
  assert.match(code,/controller.subscribe/);assert.match(code,/dataset.mlHistory='true'/);
  assert.match(code,/captureEditor:\(\)=>\(\{project:structuredClone\(project\),target,preview\}\)/);
});
test('Asset replacement is a visible, successful-only history boundary with busy guard',()=>{
  for(const file of ['pattern-controls.js','logo-controls.js']){
    const code=read(file);assert.match(code,/get busy\(\)\{return assetBusy>0;/);
    assert.match(code,/if\(assetChanged\)document.dispatchEvent\(new CustomEvent\('egg-asset-boundary'/);
  }
  const code=read('keyboard-controls.js');
  assert.match(code,/history.reset\('画像を変更したため/);assert.match(code,/画像の差し替えは履歴の区切り/);
  assert.match(code,/state.exporting\|\|patternControls.busy\|\|logoControls.busy/);
});
test('Egg numeric bindings cover paired, light, timeline and export inputs without hijacking canvas arrows',()=>{
  const code=read('keyboard-controls.js');
  for(const attr of ['data-transform','data-background','data-pattern','data-logo'])assert.ok(code.includes(attr));
  assert.match(code,/data-light/);assert.match(code,/keyboardStep:1/);assert.match(code,/input\[type="number"\]/);
  assert.match(code,/commitEvents:\['change'\]/);
  assert.doesNotMatch(code,/addEventListener\(['"]keydown/);
  assert.match(read('numeric-input.js'),/original.type === 'number'.*preserveType/);
});

test('Egg coordinator undo/redo restores real module settings, UI and caches together',()=>{
  const {HistoryController}=require(path.join(root,'shared/editor-history.js'));
  const values={};const handlers={};let activeSurface='pattern',numericRefreshes=0;
  function node(id){if(!values[id])values[id]={value:'0',dataset:{},textContent:'',attrs:{},append(){},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},contains(){return true},addEventListener(){},querySelector(){return null}};return values[id];}
  const doc={getElementById:node,createElement:()=>node('created-'+Object.keys(values).length),addEventListener:(name,fn)=>handlers[name]=fn,querySelectorAll:()=>[],querySelector(selector){
    if(selector==='[data-surface][aria-pressed="true"]')return{dataset:{surface:activeSurface}};
    if(selector.startsWith('[data-mode=')){const mode=selector.match(/"([^"]+)"/)[1];return{click(){context.state.mode=mode}};}
    return node(selector.startsWith('#')?selector.slice(1):selector);
  }};
  const model={motion:{project:{keyframes:[{id:'a',at:0,x:.333}],responsive:{enabled:false,sp:null}},target:'egg',preview:null},viewport:{mode:'fixed',width:1440,height:900},pattern:{source:'original',scale:100,colors:['#000','#fff']},logo:{imageSource:'provided',x:0,size:72}};
  const context={state:{mode:'blend',paused:false,rotation:7,pointerX:.5,exporting:false},materials:{pattern:{transmission:.58}},backdrop:{visible:true},lightingControls:{state:{azimuth:1.234,strength:100},apply:save=>{context.lightApplied=save}},scrollControls:{captureEditor:()=>clone(model.motion),restoreEditor:s=>{model.motion=clone(s)},useEditorHistory:h=>{context.motionHistory=h}},previewViewport:{serialize:()=>clone(model.viewport),setSize:(w,h,mode)=>{model.viewport={mode,width:w,height:h}}},patternControls:{serialize:()=>clone(model.pattern),restoreEditor:s=>{model.pattern=clone(s)},busy:false},logoControls:{serialize:()=>clone(model.logo),restoreEditor:s=>{model.logo=clone(s)},busy:false},selectSurface:name=>{activeSurface=name},updatePause:()=>context.pauseUpdated=true,resize:()=>context.resized=true};
  const win={addEventListener(){},MLNumberInputs:{bind(){},refresh(){numericRefreshes++}},MLEditorHistory:{register:options=>new HistoryController(options)}};
  const sandbox={window:win,document:doc,structuredClone:clone};vm.createContext(sandbox);
  const code=read('keyboard-controls.js').replace(/^import .*;\n/gm,'').replace(/export function /g,'function ');
  vm.runInContext(code+'\nthis.setup=setupEggKeyboard;',sandbox);
  for(const id of ['export-frame','export-start','export-end','export-duration','export-fps','export-video-format','export-png-target'])node(id).value=id==='export-duration'?'8':'0';
  const api=sandbox.setup(context),initial=JSON.stringify(api.capture());
  assert.equal(context.motionHistory,api.history);
  api.history.begin('数値');context.lightingControls.state.strength=175;model.motion.project.keyframes[0].x=12.345;model.pattern.scale=143;model.logo.size=99;model.viewport.width=1920;context.materials.pattern.transmission=.41;node('export-duration').value='12';api.history.commit();
  const edited=JSON.stringify(api.capture());assert.notEqual(edited,initial);assert.equal(api.history.past.length,1);
  assert.equal(api.history.undo(),true);assert.equal(JSON.stringify(api.capture()),initial);assert.equal(node('transparency').value,58);assert.equal(node('export-duration').value,'8');assert.ok(context.lightApplied&&context.pauseUpdated&&context.resized&&numericRefreshes);
  assert.equal(api.history.redo(),true);assert.equal(JSON.stringify(api.capture()),edited);
  context.state.exporting=true;assert.equal(api.history.undo(),false);assert.equal(JSON.stringify(api.capture()),edited);context.state.exporting=false;
  model.logo.imageSource='custom';handlers['egg-asset-boundary']({detail:{kind:'logo'}});assert.equal(api.history.past.length,0);assert.equal(api.history.future.length,0);assert.match(node('logo-status').textContent,/履歴はクリア/);
});
