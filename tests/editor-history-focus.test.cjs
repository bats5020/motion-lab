const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('shared/editor-history.js','utf8');
function fixture(){
 const bindings=new Map(),tasks=[];let value=1;
 const body={append(){},contains:()=>true};const document={body,activeElement:body,querySelector:()=>null,querySelectorAll:()=>[...bindings.keys()].filter(e=>e.isConnected),createElement:()=>({setAttribute(){}})};
 const create=(label,id)=>{const input={id:'',disabled:false,isConnected:true,getAttribute:n=>n==='aria-label'?label:null,focus(){document.activeElement=this;}};bindings.set(input,{input,range:id?{id}:null});return input;};
 const window={document,queueMicrotask:f=>tasks.push(f),addEventListener(){},MLNumberInputs:{getBinding:e=>bindings.get(e),refresh(){}}};vm.runInNewContext(source,{window,setTimeout,clearTimeout});
 const controller=window.MLEditorHistory.register({toolbar:false,autoEvents:false,capture:()=>value,restore:v=>{value=v;}});
 return{document,bindings,create,controller,flush:()=>{while(tasks.length)tasks.shift()();},set:v=>value=v};
}
test('undo restores focus to uniquely labelled rebuilt numeric control',()=>{const f=fixture(),old=f.create('カラー 1 横位置');f.document.activeElement=old;f.controller.begin();f.set(2);f.controller.commit();let next;f.controller.options.restore=()=>{old.isConnected=false;f.document.activeElement=f.document.body;next=f.create('カラー 1 横位置');};f.controller.undo();f.flush();assert.equal(f.document.activeElement,next);});
test('reordered connected numeric input regains focus after DOM reparenting',()=>{const f=fixture(),old=f.create('強度','strength');f.document.activeElement=old;f.controller.begin();f.set(2);f.controller.commit();f.controller.options.restore=()=>{f.document.activeElement=f.document.body;};f.controller.undo();f.flush();assert.equal(f.document.activeElement,old);});
test('async rebuild does not steal focus from another user-selected field',()=>{const f=fixture(),old=f.create('値','one'),other=f.create('別の値','two');f.document.activeElement=old;f.controller.begin();f.set(2);f.controller.commit();f.controller.options.restore=()=>{old.isConnected=false;f.create('値','one');f.document.activeElement=other;};f.controller.undo();f.flush();assert.equal(f.document.activeElement,other);});
test('ambiguous duplicate labels do not move focus to an unrelated numeric field',()=>{const f=fixture(),old=f.create('強度');f.document.activeElement=old;f.controller.begin();f.set(2);f.controller.commit();f.controller.options.restore=()=>{old.isConnected=false;f.document.activeElement=f.document.body;f.create('強度');f.create('強度');};f.controller.undo();f.flush();assert.equal(f.document.activeElement,f.document.body);});
