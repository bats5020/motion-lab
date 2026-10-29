const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname,'../shared/numeric-input.js'),'utf8');

class Event {
  constructor(type, properties={}) { this.type=type; Object.assign(this, properties); this.defaultPrevented=false; this.stopped=false; }
  preventDefault(){this.defaultPrevented=true;}
  stopImmediatePropagation(){this.stopped=true;}
}
class Target {
  constructor(){this.listeners=[];}
  addEventListener(type,fn,capture=false){this.listeners.push({type,fn,capture:!!capture});}
  removeEventListener(type,fn,capture=false){this.listeners=this.listeners.filter(l=>l.type!==type||l.fn!==fn||l.capture!==!!capture);}
  dispatchEvent(event){
    event.target=this;
    const list=this.listeners.filter(l=>l.type===event.type).sort((a,b)=>Number(b.capture)-Number(a.capture));
    for(const listener of list){listener.fn(event);if(event.stopped)break;}
    if(!event.stopped&&typeof this['on'+event.type]==='function')this['on'+event.type](event);
    return !event.defaultPrevented;
  }
}
class Element extends Target {
  constructor(tag,document){super();this.tagName=tag.toUpperCase();this.ownerDocument=document;this.attributes=new Map();this.children=[];this.parentElement=null;this._value='';this.style={};this.labels=[];this.textContent='';const classes=new Set();this.classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)};}
  setAttribute(k,v){this.attributes.set(k,String(v));}
  getAttribute(k){return this.attributes.has(k)?this.attributes.get(k):null;}
  hasAttribute(k){return this.attributes.has(k);}
  removeAttribute(k){this.attributes.delete(k);}
  get type(){return this.getAttribute('type')||'text';}set type(v){this.setAttribute('type',v);}
  get id(){return this.getAttribute('id')||'';}set id(v){this.setAttribute('id',v);}
  get title(){return this.getAttribute('title')||'';}set title(v){this.setAttribute('title',v);}
  get disabled(){return this.hasAttribute('disabled');}set disabled(v){v?this.setAttribute('disabled',''):this.removeAttribute('disabled');}
  get hidden(){return this.hasAttribute('hidden');}set hidden(v){v?this.setAttribute('hidden',''):this.removeAttribute('hidden');}
  get value(){return this._value;}
  set value(v){
    if(this.type==='range'){
      const min=this.hasAttribute('min')?+this.getAttribute('min'):0,max=this.hasAttribute('max')?+this.getAttribute('max'):100;
      let n=Math.min(max,Math.max(min,Number(v)));
      if(this.getAttribute('step')!=='any'){const step=+this.getAttribute('step')||1;n=min+Math.round((n-min)/step)*step;}
      this._value=String(Number(n.toPrecision(14)));
    }else this._value=String(v);
  }
  get valueAsNumber(){return this.type==='number'||this.type==='range'?(this.value===''?NaN:Number(this.value)):NaN;}
  append(...els){for(const el of els){if(el.parentElement)el.remove();el.parentElement=this;this.children.push(el);}}
  insertAdjacentElement(position,el){assert.equal(position,'afterend');const p=this.parentElement;el.parentElement=p;p.children.splice(p.children.indexOf(this)+1,0,el);}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this);this.parentElement=null;}
  contains(el){return el===this||this.children.some(c=>c.contains(el));}
  get isConnected(){return this.ownerDocument.body.contains(this);}
}
function environment(){
  const window=new Target();window.Event=Event;window.console=console;
  const document={createElement:tag=>new Element(tag,document),querySelector(selector){return walk(this.body).find(e=>e.id===selector.slice(1))||null;}};
  document.body=new Element('body',document);window.document=document;
  class MutationObserver{constructor(fn){this.fn=fn;}observe(){}disconnect(){}}
  window.MutationObserver=MutationObserver;
  const context={window,console};vm.runInNewContext(source,context);
  return {window,document,api:window.MLNumberInputs,element(tag,attrs={},value){const el=document.createElement(tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);if(value!=null)el.value=value;document.body.append(el);return el;}};
}
function walk(el){return[el,...el.children.flatMap(walk)];}
function send(target,type,props={}){const e=new Event(type,props);target.dispatchEvent(e);return e;}
function type(input,value){send(input,'beforeinput',{inputType:'insertText'});input.value=value;send(input,'input',{inputType:'insertText'});}
function modelFixture({value=2,min=0,max=10,step=.1,number=false,scale=1,...extra}={}){
  const e=environment(),range=e.element('input',{type:'range',min,max,step},value),readout=e.element('span');
  let model=value,writes=0;const calls=[],snapshots=[];let start;
  const history={begin(label){calls.push(['begin',label]);start=model;},commit(){calls.push(['commit']);if(start!==model)snapshots.push(start);},cancel(){calls.push(['cancel']);},undo(){model=snapshots.pop();e.api.refresh();}};
  e.window.MLEditorHistory={getCurrent:()=>history};
  const input=number?e.element('input',{type:'number',min,max,step},value):null;
  const binding=e.api.bind({range,number:input,readout,scale,label:'テスト',getValue:()=>model,setValue:v=>{model=v;range.value=v;writes++;},...extra});
  return {...e,range,readout,binding,input:binding.input,calls,history,snapshots,get model(){return model},set model(v){model=v;},get writes(){return writes}};
}

test('number parser accepts finite decimals, scientific notation and Japanese full-width input',()=>{
  const p=environment().api._test.parse;
  for(const [s,n]of [['６．５０',6.5],['−0.005',-.005],['.25',.25],['1e2',100],['  -12.5  ',-12.5]])assert.equal(p(s),n);
});
test('number parser rejects empty, partial, NaN, infinity, expressions and ambiguous separators',()=>{
  const p=environment().api._test.parse;
  for(const s of ['', '-', '.', '1e', 'NaN', 'Infinity', '1e309','2+3','1,234','12px'])assert.equal(p(s),null,s);
});
test('formatting retains slider precision and off-grid preset values',()=>{
  const f=environment().api._test.formatNumber;
  assert.equal(f(6.5,.01),'6.50');assert.equal(f(.25,.02),'0.25');assert.equal(f(.005,.005),'0.005');assert.equal(f(.1+.2,.1),'0.3');
});
test('generated field retains original readout and range nodes without model writes',()=>{
  const x=modelFixture();assert.equal(x.readout.parentElement,x.document.body);assert.equal(x.readout.hidden,true);assert.equal(x.input.type,'text');assert.equal(x.input.getAttribute('role'),'spinbutton');assert.equal(x.writes,0);assert.equal(x.api.getBinding(x.range),x.binding);assert.equal(x.api.isBoundTarget(x.input),true);
});
test('existing number node keeps type and valueAsNumber compatibility',()=>{
  const x=modelFixture({number:true});assert.equal(x.input.type,'number');assert.equal(x.input.valueAsNumber,2);assert.equal(x.api.bind({range:x.range}),x.binding);
});
test('typing does not invoke legacy number handlers or alter the model before Enter',()=>{
  const x=modelFixture({number:true});let legacy=0;x.input.oninput=()=>legacy++;
  type(x.input,'4.5');assert.equal(x.model,2);assert.equal(legacy,0);assert.equal(x.api.isEditingTarget(x.input),true);
  send(x.input,'keydown',{key:'Enter'});assert.equal(x.model,4.5);assert.equal(x.writes,1);assert.equal(legacy,0);assert.equal(x.api.isEditingTarget(x.input),false);assert.equal(x.snapshots.length,1);
});
test('valid blur commits once and preserves one text edit history entry',()=>{
  const x=modelFixture();type(x.input,'3');type(x.input,'3.4');send(x.input,'change');assert.equal(x.model,2);send(x.input,'blur');assert.equal(x.model,3.4);assert.equal(x.writes,1);assert.equal(x.snapshots.length,1);
});
test('empty, nonfinite and out-of-bounds drafts never mutate model; blur restores prior display',()=>{
  for(const value of ['', 'oops','1e309','-1','11']){
    const x=modelFixture();type(x.input,value);assert.equal(x.binding.commit(),false);assert.equal(x.model,2);assert.equal(x.input.getAttribute('aria-invalid'),'true');send(x.input,'blur');assert.equal(x.input.value,'2.0');assert.equal(x.writes,0);assert.equal(x.snapshots.length,0);
  }
});
test('Escape discards only the numeric draft without changing model',()=>{
  const x=modelFixture();type(x.input,'7');const e=send(x.input,'keydown',{key:'Escape'});assert.equal(e.defaultPrevented,true);assert.equal(x.model,2);assert.equal(x.input.value,'2.0');assert.equal(x.api.isEditingTarget(x.input),false);
});
test('IME composition never commits or nudges until composition ends',()=>{
  const x=modelFixture();send(x.input,'compositionstart');assert.equal(x.binding.isComposing,true);type(x.input,'３．５０');const arrow=send(x.input,'keydown',{key:'ArrowUp',isComposing:true});send(x.input,'keydown',{key:'Enter',keyCode:229});send(x.input,'blur');assert.equal(x.model,2);assert.equal(arrow.defaultPrevented,false);send(x.input,'compositionend');assert.equal(x.binding.isComposing,false);assert.equal(x.model,3.5);assert.equal(x.writes,1);
});
test('native text undo shortcut remains untouched while draft editing',()=>{
  const x=modelFixture();type(x.input,'4');const event=send(x.input,'keydown',{key:'z',metaKey:true});assert.equal(event.defaultPrevented,false);assert.equal(event.stopped,false);assert.equal(x.api.isEditingTarget(x.input),true);
});
test('held arrows make one history entry and Shift multiplies each declared step by ten',()=>{
  const x=modelFixture({value:1,step:.005});send(x.input,'keydown',{key:'ArrowUp'});send(x.input,'keydown',{key:'ArrowUp',repeat:true});send(x.input,'keydown',{key:'ArrowUp',repeat:true,shiftKey:true});assert.equal(x.model,1.06);assert.equal(x.calls.filter(c=>c[0]==='begin').length,1);assert.equal(x.snapshots.length,0);send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.snapshots.length,1);assert.equal(x.api.isEditingTarget(x.input),false);x.history.undo();assert.equal(x.model,1);assert.equal(x.input.value,'1.000');
});
test('arrows clamp predictably at explicit bounds and do not create empty history',()=>{
  const x=modelFixture({value:9.5,step:.1});send(x.input,'keydown',{key:'ArrowUp',shiftKey:true});send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.model,10);const count=x.calls.length;send(x.input,'keydown',{key:'ArrowUp'});send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.calls.length,count);
});
test('Ctrl, Cmd and Alt arrows are not captured',()=>{
  for(const modifier of ['ctrlKey','metaKey','altKey']){const x=modelFixture();const event=send(x.input,'keydown',{key:'ArrowUp',[modifier]:true});assert.equal(event.defaultPrevented,false);assert.equal(x.model,2);}
});
test('step=any uses keyboardStep without rounding an existing fractional value',()=>{
  const x=modelFixture({value:.25,step:'any',keyboardStep:.005});send(x.input,'keydown',{key:'ArrowUp'});send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.model,.255);assert.equal(x.input.value,'0.255');
});
test('display scaling writes raw model values and bounds remain explicit',()=>{
  const x=modelFixture({value:.5,min:0,max:1,step:.01,scale:100,suffix:'%'});assert.equal(x.input.value,'50');type(x.input,'75');send(x.input,'keydown',{key:'Enter'});assert.equal(x.model,.75);send(x.input,'keydown',{key:'ArrowDown',shiftKey:true});send(x.input,'keyup',{key:'ArrowDown'});assert.equal(x.model,.65);type(x.input,'101');assert.equal(x.binding.commit(),false);assert.equal(x.model,.65);
});
test('explicit integer fields reject decimals instead of allowing legacy floor/clamp',()=>{
  const x=modelFixture({value:4,step:1,integer:true});type(x.input,'3.5');assert.equal(x.binding.commit(),false);assert.equal(x.model,4);assert.equal(x.writes,0);send(x.input,'blur');assert.equal(x.input.value,'4');type(x.input,'3');assert.equal(x.binding.commit(),true);assert.equal(x.model,3);
});
test('step one alone does not reject a valid authored fractional model value',()=>{
  const x=modelFixture({value:3.5,step:1});assert.equal(x.input.value,'3.5');type(x.input,'4.5');assert.equal(x.binding.commit(),true);assert.equal(x.model,4.5);
});
test('refresh preserves actual off-grid model values and does not write the range',()=>{
  const x=modelFixture({value:.25,step:.02});assert.equal(x.input.value,'0.25');assert.equal(x.range.value,'0.26');const range=x.range.value;x.api.refresh();assert.equal(x.input.value,'0.25');assert.equal(x.range.value,range);assert.equal(x.writes,0);send(x.input,'keydown',{key:'ArrowUp'});send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.model,.27);assert.equal(x.input.value,'0.27');
});
test('default range path emits only input and rejects native step snapping before dispatch',()=>{
  const e=environment(),range=e.element('input',{type:'range',min:0,max:1,step:.02},.2);let inputs=0,changes=0;range.oninput=()=>inputs++;range.onchange=()=>changes++;
  const binding=e.api.bind({range});type(binding.input,'.25');assert.equal(binding.commit(),false);assert.equal(range.value,'0.2');assert.equal(inputs,0);assert.equal(changes,0);type(binding.input,'.24');assert.equal(binding.commit(),true);assert.equal(inputs,1);assert.equal(changes,0);
});
test('number-only default commits requested original event with valueAsNumber intact',()=>{
  const e=environment(),input=e.element('input',{type:'number',min:1,max:20,step:1},4);let model=4,inputs=0;input.onchange=()=>model=input.valueAsNumber;input.oninput=()=>inputs++;
  const binding=e.api.bind({number:input,commitEvents:['change']});type(input,'8');assert.equal(model,4);binding.commit();assert.equal(model,8);assert.equal(inputs,0);assert.equal(input.type,'number');
});
test('number-only custom setter works even without a custom getter',()=>{
  const e=environment(),input=e.element('input',{type:'number',min:0,max:10,step:1},4);let model=4;const b=e.api.bind({number:input,setValue:v=>model=v});send(input,'keydown',{key:'ArrowUp'});send(input,'keyup',{key:'ArrowUp'});assert.equal(model,5);assert.equal(input.value,'5');assert.equal(b.getValue(),5);
});
test('custom setter may deliberately invoke the original number input listener once',()=>{
  const e=environment(),input=e.element('input',{type:'number',min:0,max:10,step:1},4);let model=4,calls=0;
  input.oninput=()=>{model=input.valueAsNumber;calls++;};const b=e.api.bind({number:input,getValue:()=>model,setValue:v=>{input.value=v;send(input,'input');}});
  type(input,'7');assert.equal(calls,0);b.commit();assert.equal(model,7);assert.equal(calls,1);
});
test('range pointer drag groups multiple updates into one model history entry',()=>{
  const x=modelFixture();x.range.oninput=()=>x.model=Number(x.range.value);send(x.range,'pointerdown',{pointerId:7});x.range.value=3;send(x.range,'input');x.range.value=4;send(x.range,'input');send(x.range,'change');assert.equal(x.snapshots.length,0);send(x.window,'pointerup',{pointerId:7});assert.equal(x.model,4);assert.equal(x.snapshots.length,1);assert.equal(x.input.value,'4.0');
});
test('accessibility range input captures history before original model handler',()=>{
  const x=modelFixture();x.range.oninput=()=>x.model=Number(x.range.value);x.range.value=5;send(x.range,'input');send(x.range,'change');assert.equal(x.model,5);assert.deepEqual(x.snapshots,[2]);
});
test('dynamic bounds and disabled/hidden state are respected',()=>{
  const x=modelFixture();x.range.setAttribute('max','3');x.range.setAttribute('step','.5');x.range.disabled=true;x.range.hidden=true;x.api.refresh();assert.equal(x.input.disabled,true);assert.equal(x.input.parentElement.hidden,true);type(x.input,'2.5');assert.equal(x.binding.commit(),false);assert.equal(x.writes,0);x.range.disabled=false;x.range.hidden=false;x.api.refresh();send(x.input,'keydown',{key:'Escape'});send(x.input,'keydown',{key:'ArrowUp'});send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.model,2.5);
});
test('history busy state rejects edits without mutating model',()=>{
  const x=modelFixture();x.history.isBusy=()=>true;type(x.input,'5');assert.equal(x.binding.commit(),false);send(x.input,'keydown',{key:'ArrowUp'});assert.equal(x.model,2);assert.equal(x.writes,0);
});
test('busy range input cannot reach a legacy model listener',()=>{
  const x=modelFixture();x.range.oninput=()=>x.model=Number(x.range.value);x.history.isBusy=()=>true;
  const pointer=send(x.range,'pointerdown',{pointerId:2});assert.equal(pointer.defaultPrevented,true);
  x.range.value=7;const input=send(x.range,'input');assert.equal(input.stopped,true);assert.equal(x.model,2);assert.equal(x.range.value,'2');
});
test('refresh prunes bindings removed by a dynamic inspector rebuild',()=>{
  const x=modelFixture();x.input.parentElement.remove();x.api.refresh();assert.equal(x.api.isBoundTarget(x.range),false);
});
test('destroy restores retained original nodes and removes helper binding',()=>{
  const x=modelFixture({number:true});x.binding.destroy();assert.equal(x.readout.hidden,false);assert.equal(x.input.type,'number');assert.equal(x.api.isBoundTarget(x.input),false);assert.equal(x.api.isBoundTarget(x.range),false);
});

function integratedHistoryFixture(options={}){
 const x=environment();let model=1;
 const historySource=fs.readFileSync(path.join(__dirname,'../shared/editor-history.js'),'utf8');
 vm.runInNewContext(historySource,{window:x.window,console});
 const history=new x.window.MLEditorHistory.HistoryController({capture:()=>model,restore:value=>{model=value},...options});
 x.window.MLEditorHistory.getCurrent=()=>history;
 const range=x.element('input',{type:'range',min:0,max:10,step:1},model);
 range.oninput=()=>model=Number(range.value);
 const binding=x.api.bind({range,getValue:()=>model,setValue:value=>{model=value;range.value=value}});
 return {...x,history,range,binding,input:binding.input,get model(){return model},set model(value){model=value}};
}
test('undo during held arrows starts a fresh history entry for a later repeat',()=>{
 const x=integratedHistoryFixture();send(x.input,'keydown',{key:'ArrowUp'});send(x.input,'keydown',{key:'ArrowUp',repeat:true});assert.equal(x.model,3);
 x.history.undo();assert.equal(x.model,1);
 send(x.input,'keydown',{key:'ArrowUp',repeat:true});send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.model,2);assert.equal(x.history.past.length,1);
 x.history.undo();assert.equal(x.model,1);x.history.redo();assert.equal(x.model,2);
});
test('undo during a range drag captures later native input as a fresh gesture',()=>{
 const x=integratedHistoryFixture();send(x.range,'pointerdown',{pointerId:7});x.range.value=3;send(x.range,'input');x.history.undo();assert.equal(x.model,1);
 x.range.value=4;send(x.range,'input');send(x.window,'pointerup',{pointerId:7});assert.equal(x.model,4);assert.equal(x.history.past.length,1);
 x.history.undo();assert.equal(x.model,1);
});
test('busy restoration blocks repeated arrows even if the old numeric gesture is held',async()=>{
 let resolve;const x=integratedHistoryFixture({restore:value=>new Promise(done=>{resolve=()=>{x.model=value;done()}})});
 send(x.input,'keydown',{key:'ArrowUp'});const pending=x.history.undo();assert.equal(x.history.isBusy,true);
 send(x.input,'keydown',{key:'ArrowUp',repeat:true});assert.equal(x.model,2);resolve();await pending;assert.equal(x.model,1);
 send(x.input,'keyup',{key:'ArrowUp'});assert.equal(x.history.active,null);assert.equal(x.history.future.length,1);
});
