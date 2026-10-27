// Exercise the actual early window-capture shortcut handler with a tiny DOM mock.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../shared/editor-history.js'),'utf8');
function target(tagName='BUTTON',type='',options={}){
 return {tagName,type,...options,closest(selector){
  if(selector.includes('data-ml-number')&&this.bound)return this;
  if(selector.includes('contenteditable')&&this.editable)return this;
  if(selector.includes('dialog[open]')&&this.modal)return this;
  return null;
 }};
}
function setup(){
 const listeners=[],calls={undo:0,redo:0,legacy:0},state={busy:false};
 const document={body:{append(){}},querySelector(){return null},createElement(){return{setAttribute(){},textContent:''}}};
 const window={document,addEventListener(type,fn,capture=false){listeners.push({type,fn,capture})},MLNumberInputs:{isBoundTarget:el=>!!el.bound,isEditingTarget:el=>!!el.dirty,refresh(){}}};
 vm.runInNewContext(source,{window,console,setTimeout,clearTimeout});
 window.MLEditorHistory.register({name:'mock',autoEvents:false,toolbar:false,isBusy:()=>state.busy,native:{undo(){calls.undo++},redo(){calls.redo++},canUndo:()=>true,canRedo:()=>true}});
 // This is the legacy editor's later key handler; a handled shortcut must never reach it.
 window.addEventListener('keydown',()=>calls.legacy++);
 function dispatch(properties={}){
  const e={key:'z',metaKey:true,ctrlKey:false,altKey:false,shiftKey:false,isComposing:false,keyCode:90,target:target(),defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true},...properties};
  for(const l of listeners.filter(l=>l.type==='keydown').sort((a,b)=>Number(b.capture)-Number(a.capture))){l.fn(e);if(e.stopped)break;}
  return e;
 }
 return{window,listeners,calls,state,dispatch};
}
test('early capture executes Cmd/Ctrl Z once and suppresses legacy project undo',()=>{
 const x=setup();assert.equal(x.listeners[0].capture,true);
 let e=x.dispatch();assert.equal(x.calls.undo,1);assert.equal(x.calls.legacy,0);assert.equal(e.defaultPrevented,true);
 e=x.dispatch({metaKey:false,ctrlKey:true});assert.equal(x.calls.undo,2);assert.equal(x.calls.legacy,0);assert.equal(e.defaultPrevented,true);
});
test('Shift Z and Ctrl Y dispatch exactly one redo, not undo or legacy handlers',()=>{
 const x=setup();x.dispatch({shiftKey:true});x.dispatch({key:'y',metaKey:false,ctrlKey:true,keyCode:89});
 assert.deepEqual(x.calls,{undo:0,redo:2,legacy:0});
});
test('text/number/textarea/contenteditable keep native undo while suppressing legacy undo',()=>{
 const x=setup();
 for(const el of [target('INPUT','text'),target('INPUT','number'),target('TEXTAREA'),target('DIV','',{editable:true})]){
  const e=x.dispatch({target:el});assert.equal(e.defaultPrevented,false);assert.equal(e.stopped,true);
 }
 assert.deepEqual(x.calls,{undo:0,redo:0,legacy:0});
});
test('IME composition and keyCode 229 never prevent the browser default',()=>{
 const x=setup();for(const props of [{isComposing:true},{keyCode:229}]){
  const e=x.dispatch(props);assert.equal(e.defaultPrevented,false);assert.equal(e.stopped,true);
 }
 assert.deepEqual(x.calls,{undo:0,redo:0,legacy:0});
});
test('dirty bound number uses native text undo; clean bound number and bound range use model history',()=>{
 const x=setup();let e=x.dispatch({target:target('INPUT','number',{bound:true,dirty:true})});
 assert.equal(e.defaultPrevented,false);assert.equal(x.calls.undo,0);
 e=x.dispatch({target:target('INPUT','number',{bound:true,dirty:false})});assert.equal(e.defaultPrevented,true);assert.equal(x.calls.undo,1);
 e=x.dispatch({target:target('INPUT','range',{bound:true,dirty:false})});assert.equal(e.defaultPrevented,true);assert.equal(x.calls.undo,2);assert.equal(x.calls.legacy,0);
});
test('busy editor consumes undo/redo without changing model or reaching legacy handlers',()=>{
 const x=setup();x.state.busy=true;
 for(const props of [{},{shiftKey:true},{key:'y',metaKey:false,ctrlKey:true}])assert.equal(x.dispatch(props).defaultPrevented,true);
 assert.deepEqual(x.calls,{undo:0,redo:0,legacy:0});
});
test('ordinary and Alt shortcuts remain untouched',()=>{
 const x=setup();let e=x.dispatch({metaKey:false,key:'z'});assert.equal(e.defaultPrevented,false);assert.equal(e.stopped,false);
 e=x.dispatch({altKey:true});assert.equal(e.defaultPrevented,false);assert.equal(e.stopped,false);
 assert.equal(x.calls.undo,0);assert.equal(x.calls.legacy,2);
});
