// Shared event-boundary regression checks. No browser launch or tool model mocks.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../shared/editor-history.js'),'utf8');
function element(type='text',bound=false){
 return {tagName:'INPUT',type,bound,closest(selector){return selector.includes('data-ml-number')&&this.bound?this:null;}};
}
function environment(){
 const events=[],timers=new Map(),bindings=new Map();let serial=0,model={text:'before',n:1};
 const document={body:{append(){},contains:()=>true},querySelector(){return null},createElement(){return{setAttribute(){},textContent:''}}};
 const window={document,addEventListener(type,fn,capture=false){events.push({type,fn,capture});},MLNumberInputs:{isBoundTarget:t=>!!t?.bound,isEditingTarget:t=>!!t?.dirty,getBinding:t=>bindings.get(t),refresh(){}}};
 vm.runInNewContext(source,{window,console,setTimeout(fn){const id=++serial;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
 const controller=window.MLEditorHistory.register({toolbar:false,capture:()=>({...model}),restore:s=>model={...s}});
 function send(type,target,properties={}){
  const event={type,target,defaultPrevented:false,key:'',preventDefault(){this.defaultPrevented=true},stopImmediatePropagation(){this.stopped=true},...properties};
  for(const entry of events.filter(x=>x.type===type).sort((a,b)=>Number(b.capture)-Number(a.capture))){entry.fn(event);if(event.stopped)break;}
  return event;
 }
 function flush(){while(timers.size){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(fn=>fn());}}
 return {controller,send,flush,window,document,bindings,get model(){return model},set(values){Object.assign(model,values)}};
}
test('generic pointer gesture captures before the original handler and commits after click',()=>{
 const x=environment(),button={tagName:'BUTTON',closest:()=>null};
 x.send('pointerdown',button);x.send('pointerup',button);x.send('click',button);x.set({n:3});x.flush();
 assert.equal(x.controller.past.length,1);x.controller.undo();assert.equal(x.model.n,1);
});
test('text blur then bound range drag are distinct transactions, not a mid-drag timer merge',()=>{
 const x=environment(),text=element(),range=element('range',true);
 x.send('focusin',text);x.set({text:'after'});x.send('input',text);
 // Browser order: new control pointerdown, old text focusout, native range input.
 x.send('pointerdown',range);x.controller.begin('range');
 x.send('focusout',text);x.set({n:2});x.flush();
 // A drag continues over multiple browser tasks before pointerup.
 x.set({n:3});x.controller.commit();
 assert.equal(x.controller.past.length,2);
 x.controller.undo();assert.deepEqual(x.model,{text:'after',n:1});
 x.controller.undo();assert.deepEqual(x.model,{text:'before',n:1});
});
test('tabbing from a text field into a bound number closes the text transaction',()=>{
 const x=environment(),text=element(),number=element('number',true);
 x.send('focusin',text);x.set({text:'after'});x.send('focusout',text);x.send('focusin',number);
 // A focused number can be immediately nudged before the deferred blur callback.
 x.controller.begin('number');x.set({n:2});x.controller.commit();x.flush();
 assert.equal(x.controller.past.length,2);
 x.controller.undo();assert.deepEqual(x.model,{text:'after',n:1});
});
test('native async transaction locks concurrent model history until it settles',async()=>{
 const x=environment();let resolve;const calls=[];
 const c=new x.window.MLEditorHistory.NativeController({native:{begin(){calls.push('begin')},commit(){calls.push('commit')},undo(){calls.push('undo')}}});
 const result=c.transact('async',()=>new Promise(r=>resolve=r));
 const wasBusy=c.isBusy,blocked=c.undo();resolve();await result;
 assert.equal(wasBusy,true);assert.equal(blocked,false);assert.deepEqual(calls,['begin','commit']);assert.equal(c.isBusy,false);
});
test('failed cancel preserves the active snapshot so the user can recover the edit',()=>{
 const x=environment();x.controller.begin('text');x.set({text:'after'});
 x.controller.options.restore=()=>false;
 assert.equal(x.controller.cancel(),false);
 assert.ok(x.controller.active);
 x.controller.options.restore=s=>x.set(s);x.controller.cancel();assert.equal(x.model.text,'before');
});

function draftBinding(x,input,value,valid=true){
 input.dirty=true;x.document.activeElement=input;
 const binding={input,isComposing:false,commits:0,cancels:0,
  commit(){this.commits++;if(!valid)return false;x.controller.begin('number');x.set({n:value});x.controller.commit();input.dirty=false;return true;},
  cancel(){this.cancels++;input.dirty=false;}
 };x.bindings.set(input,binding);return binding;
}
test('dirty number commits before pointer starts a generic button edit',()=>{
 const x=environment(),number=element('number',true),button={tagName:'BUTTON',closest:()=>null};
 const binding=draftBinding(x,number,2);
 x.send('pointerdown',button);x.set({text:'button edit'});x.send('pointerup',button);x.send('click',button);x.flush();
 assert.equal(binding.commits,1);assert.equal(binding.cancels,0);assert.equal(x.controller.past.length,2);
 x.controller.undo();assert.deepEqual(x.model,{text:'before',n:2});
 x.controller.undo();assert.deepEqual(x.model,{text:'before',n:1});
});
test('dirty number commits before another bound range starts its own drag',()=>{
 const x=environment(),number=element('number',true),range=element('range',true);
 const binding=draftBinding(x,number,2);x.bindings.set(range,{});
 x.send('pointerdown',range);x.controller.begin('range');x.set({n:3});x.flush();x.set({n:4});x.controller.commit();
 assert.equal(binding.commits,1);assert.equal(x.controller.past.length,2);
 x.controller.undo();assert.equal(x.model.n,2);x.controller.undo();assert.equal(x.model.n,1);
});
test('invalid numeric draft cancels without merging with the next button edit',()=>{
 const x=environment(),number=element('number',true),button={tagName:'BUTTON',closest:()=>null};
 const binding=draftBinding(x,number,NaN,false);
 x.send('pointerdown',button);x.set({text:'button edit'});x.send('pointerup',button);x.send('click',button);x.flush();
 assert.equal(binding.commits,1);assert.equal(binding.cancels,1);assert.equal(x.model.n,1);assert.equal(x.controller.past.length,1);
 x.controller.undo();assert.deepEqual(x.model,{text:'before',n:1});
});

test('moving away during numeric IME composition does not force commit or cancel',()=>{
 const x=environment(),number=element('number',true),button={tagName:'BUTTON',closest:()=>null};
 const binding=draftBinding(x,number,2);binding.isComposing=true;
 const event=x.send('pointerdown',button);
 assert.equal(binding.commits,0);assert.equal(binding.cancels,0);assert.equal(x.controller.active,null);
 assert.equal(x.model.n,1);assert.equal(event.defaultPrevented,false);assert.equal(event.stopped,true);
});
