// Small deterministic DOM harness: exercises lifecycle semantics, not browser rendering.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../shared/export-workbench.js'),'utf8');
function harness(){
 const micro=[],events=[],intervals=new Map();let intervalID=0;
 const doc={activeElement:null,listeners:{},addEventListener(type,fn,capture){(this.listeners[type]??=[]).push({fn,capture});}};
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.nodeName=this.tagName;this.nodeType=tag==='#comment'?8:1;this.children=[];this.parentNode=null;this.attributes={};this.dataset={};this.className='';this.textContent='';this.disabled=false;this.hidden=false;this.open=false;this.value='';this.listeners={};this.ownerDocument=doc;}
  get classList(){return {add:(...v)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...v])].join(' ');},contains:v=>this.className.split(/\s+/).includes(v),remove:v=>{this.className=this.className.split(/\s+/).filter(x=>x!==v).join(' ');}};}
  get parentElement(){return this.parentNode;}
  get isConnected(){return this===doc.body||!!this.parentNode?.isConnected;}
  get options(){return this.children.filter(x=>x.tagName==='OPTION');}
  setAttribute(k,v){this.attributes[k]=String(v);if(k==='id')this.id=String(v);if(k==='class')this.className=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  removeAttribute(k){delete this.attributes[k];}
  append(...nodes){for(const n of nodes){if(n.parentNode)n.remove();n.parentNode=this;this.children.push(n);}}
  appendChild(n){this.append(n);return n;}
  before(n){if(!this.parentNode)return;if(n.parentNode)n.remove();const p=this.parentNode;p.children.splice(p.children.indexOf(this),0,n);n.parentNode=p;}
  replaceWith(n){const p=this.parentNode;if(!p)return;if(n.parentNode)n.remove();p.children[p.children.indexOf(this)]=n;n.parentNode=p;this.parentNode=null;}
  remove(){const p=this.parentNode;if(!p)return;if(this.contains(doc.activeElement))doc.activeElement=doc.body;p.children.splice(p.children.indexOf(this),1);this.parentNode=null;}
  replaceChildren(...nodes){for(const n of [...this.children])n.remove();this.append(...nodes);}
  contains(n){return this===n||this.children.some(c=>c.contains(n));}
  matches(selector){return selector.split(',').some(raw=>{const s=raw.trim();if(s==='fieldset:disabled')return this.tagName==='FIELDSET'&&this.disabled;if(s[0]==='#')return this.id===s.slice(1);if(s[0]==='.')return this.classList.contains(s.slice(1));const a=s.match(/^\[([^=]+)="([^"]+)"\]$/);if(a)return this.getAttribute(a[1])===a[2];const present=s.match(/^\[([^=]+)\]$/);if(present)return this.getAttribute(present[1])!==null;if(s==='a[href]')return this.tagName==='A'&&!!this.href;return this.tagName===s.toUpperCase();});}
  closest(s){return this.matches(s)?this:this.parentNode?.closest(s)||null;}
  querySelectorAll(s){const result=[];for(const c of this.children){if(c.matches(s))result.push(c);result.push(...c.querySelectorAll(s));}return result;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  getClientRects(){for(let n=this;n;n=n.parentNode){if(n.hidden||n.tagName==='DIALOG'&&!n.open)return [];}return this.isConnected?[{}]:[];}
  addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
  focus(){if(this.isConnected&&!this.disabled)doc.activeElement=this;}
  showModal(){this.open=true;}
  close(){if(!this.open)return;this.open=false;events.push(()=>this.dispatch('close'));}
  dispatch(type,props={}){const e={type,target:this,defaultPrevented:false,stopped:false,immediate:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;},stopImmediatePropagation(){this.immediate=true;this.stopped=true;},...props};
   for(const {fn,capture}of doc.listeners[type]||[]){if(capture)fn(e);if(e.immediate)return e;}
   for(let n=this;n;n=n.parentNode){for(const fn of n.listeners[type]||[]){fn(e);if(e.immediate)break;}if(e.stopped)break;}return e;
  }
  click(){if(this.disabled||this.closest('fieldset:disabled'))return;this.dispatch('click');}
 }
 doc.createElement=t=>new Element(t);doc.createComment=()=>new Element('#comment');doc.body=new Element('body');doc.activeElement=doc.body;doc.querySelector=s=>doc.body.querySelector(s);doc.querySelectorAll=s=>doc.body.querySelectorAll(s);
 const env={document:doc,CSS:{escape:s=>s},queueMicrotask:fn=>micro.push(fn),setInterval:fn=>{intervals.set(++intervalID,fn);return intervalID;},clearInterval:id=>intervals.delete(id)};env.window=env;
 vm.runInNewContext(code,env);
 const node=(tag,id,parent=doc.body)=>{const n=new Element(tag);n.id=id;parent.append(n);return n;};
 const flush=()=>{while(micro.length)micro.shift()();while(events.length)events.shift()();};
 const tick=()=>{for(const fn of [...intervals.values()])fn();};
 return{doc,node,env,flush,tick,intervals,register:env.MLExportUI.register};
}
function setup(extra={}){
 const h=harness(),host=h.node('div','native'),before=h.node('span','before',host),width=h.node('input','width',host),after=h.node('span','after',host),png=h.node('button','png',host),svg=h.node('button','svg',host),trigger=h.node('button','export');width.value='123';
 const api=h.register({id:'review',trigger:'#export',formats:[{id:'png',label:'PNG',button:'#png'},{id:'svg',label:'SVG',button:'#svg'}],fields:{size:(f,ui)=>ui.field('幅','#width'),alpha:(f,ui)=>ui.readout('透過','非対応'),fps:(f,ui)=>ui.readout('FPS','不要')},...extra});
 return{...h,host,before,width,after,png,svg,trigger,api,dialog:h.doc.querySelector('#mlUnifiedExport')};
}
test('core: repeated open/close restores the same nodes, order, values and focus',()=>{
 const h=setup();for(let i=0;i<3;i++){h.trigger.focus();h.trigger.click();assert.equal(h.dialog.open,true);assert.ok(h.dialog.contains(h.width));h.api.close();h.flush();assert.equal(h.width.parentNode,h.host);assert.deepEqual(h.host.children.map(n=>n.id),['before','width','after','png','svg']);assert.equal(h.width.value,'123');assert.equal(h.doc.activeElement,h.trigger);assert.equal(h.intervals.size,0);}
});
test('core: format change restores previous action then moves next action without cloning',()=>{
 const h=setup();h.trigger.click();const select=h.dialog.querySelector('select');select.value='svg';select.dispatch('change');assert.equal(h.png.parentNode,h.host);assert.ok(h.dialog.contains(h.svg));assert.equal(h.doc.activeElement,h.dialog.querySelector('select'));h.api.close();h.flush();assert.equal(h.svg.parentNode,h.host);
});
test('core: unsupported combination cannot activate native export',()=>{
 const h=setup({formats:[{id:'png',label:'PNG',button:'#png',available:()=>({ok:false,reason:'alpha unsupported'})}]});let runs=0;h.png.addEventListener('click',()=>runs++);h.trigger.click();h.png.click();assert.equal(runs,0);assert.equal(h.dialog.querySelector('select').options[0].disabled,true);
});
test('core: handoff restores controls before native callback and runs it once',()=>{
 const h=setup({formats:[{id:'png',label:'PNG',button:'#png',handoff:true}]});let runs=0;h.png.addEventListener('click',()=>{runs++;assert.equal(h.width.parentNode,h.host);assert.equal(h.dialog.open,false);});h.trigger.click();h.dialog.querySelector('.ml-export-native-action').click();h.flush();assert.equal(runs,1);assert.equal(h.width.parentNode,h.host);
});
test('core: Escape closes idle dialog, returns focus, and busy Escape requests genuine cancellation',()=>{
 let busy=false,cancelled=0;const h=setup({busy:()=>busy,cancel:()=>{cancelled++;}});h.trigger.click();h.dialog.dispatch('cancel');h.flush();assert.equal(h.dialog.open,false);assert.equal(h.doc.activeElement,h.trigger);h.trigger.click();busy=true;const e=h.dialog.dispatch('cancel');assert.equal(e.defaultPrevented,true);assert.equal(cancelled,1);assert.equal(h.dialog.open,true);
});
test('core: Tab and Shift+Tab wrap only among visible enabled dialog controls',()=>{
 const h=setup();h.trigger.click();h.png.focus();let e=h.dialog.dispatch('keydown',{key:'Tab'});assert.equal(e.defaultPrevented,true);assert.equal(h.doc.activeElement,h.dialog.querySelector('.ml-export-close'));e=h.dialog.dispatch('keydown',{key:'Tab',shiftKey:true});assert.equal(e.defaultPrevented,true);assert.equal(h.doc.activeElement,h.png);
});
test('core: close click checks busy immediately rather than waiting for polling',()=>{
 let busy=false;const h=setup({busy:()=>busy});h.trigger.click();busy=true;h.dialog.querySelector('.ml-export-close').click();assert.equal(h.dialog.open,true,'must not close during the pre-poll busy window');
});
test('core: format change checks busy immediately rather than waiting for polling',()=>{
 let busy=false;const h=setup({busy:()=>busy});h.trigger.click();busy=true;const select=h.dialog.querySelector('select');select.value='svg';select.dispatch('change');assert.ok(h.dialog.contains(h.png),'active export action must remain in place');assert.equal(select.value,'png');
});
test('core: refresh preserves focus in an existing moved field',()=>{
 const h=setup();h.trigger.click();h.width.focus();h.api.refresh();h.flush();assert.ok(h.doc.activeElement===h.width,'refresh should not strand keyboard focus on document body');
});
test('core: native secondary disabled state is not permanently overwritten by presentation capability',()=>{
 let allowed=false;const h=setup({actions:[{label:'Secondary',button:'#svg',available:()=>({ok:allowed,reason:'temporarily blocked'})}]});h.trigger.click();assert.ok(h.svg.disabled||h.svg.closest('fieldset:disabled'));h.api.close();h.flush();allowed=true;h.trigger.click();assert.ok(!h.svg.disabled&&!h.svg.closest('fieldset:disabled'),'recovered capability must re-enable a previously presentation-disabled action');
});
test('core: handoff mirrors native disabled state and recovers without losing it',()=>{
 const h=setup({formats:[{id:'png',label:'PNG',button:'#png',handoff:true}]});h.png.disabled=true;h.trigger.click();let proxy=h.dialog.querySelector('.ml-export-native-action');assert.equal(proxy.disabled,true);h.png.disabled=false;h.tick();assert.equal(proxy.disabled,false);h.api.close();h.flush();assert.equal(h.png.disabled,false);
});
test('core: queued close event cannot tear down a freshly reopened dialog',()=>{
 const h=setup();h.trigger.click();h.api.close();h.api.open(h.trigger);h.flush();assert.equal(h.dialog.open,true);assert.ok(h.dialog.contains(h.width),'stale close handler must not restore current-session controls');assert.equal(h.intervals.size,1,'only current dialog polling should remain');
});

test('core: refresh restores focus to a rebuilt control with a unique accessible label',()=>{
 const h=harness(),trigger=h.node('button','export'),action=h.node('button','save');let latest;
 const api=h.register({id:'rebuilt',trigger:'#export',formats:[{id:'png',label:'PNG',button:'#save'}],fields:{size:(f,ui)=>{latest=h.doc.createElement('select');latest.setAttribute('aria-label','書き出し倍率');return ui.field('倍率',latest);}}});
 trigger.click();latest.focus();const previous=latest;api.refresh();h.flush();assert.ok(latest!==previous);assert.ok(h.doc.activeElement===latest,'rebuilt size selector must keep keyboard focus');
});

test('core: reactive readouts refresh through history and polling without replacing focused fields',()=>{
 let size='1000 × 1080',note='initial',listener,unsubscribed=0;
 const h=setup({fields:{size:(f,ui)=>[ui.readout('Size',()=>size,()=>note),ui.field('Width','#width')]}});
 h.env.MLEditorHistory={getCurrent:()=>({subscribe(fn){listener=fn;fn();return()=>{listener=null;unsubscribed++;};}})};
 h.trigger.click();h.width.focus();const readout=h.dialog.querySelector('.ml-export-readout'),strong=readout.querySelector('strong');
 assert.equal(strong.textContent,size);size='1920 × 1080';note='after undo';listener();
 assert.equal(strong.textContent,'1920 × 1080');assert.equal(readout.querySelector('p').textContent,note);assert.equal(h.doc.activeElement,h.width);
 size='1000 × 1080';h.tick();assert.equal(strong.textContent,size);assert.equal(h.dialog.querySelector('strong'),strong);
 h.api.close();h.flush();assert.equal(unsubscribed,1);assert.equal(listener,null);
 h.trigger.click();assert.equal(h.dialog.querySelector('strong').textContent,size);h.api.close();h.flush();assert.equal(unsubscribed,2);
});
test('core: native rebuild returns moved nodes before replacing controls, keeping unique IDs and focus',()=>{
 const h=setup();h.trigger.click();h.width.focus();let replacement,newPng;
 const result=h.api.withNativeRebuild(()=>{assert.equal(h.width.parentNode,h.host);h.host.replaceChildren();replacement=h.node('input','width',h.host);replacement.value='1920';newPng=h.node('button','png',h.host);h.node('button','svg',h.host);return 42;});
 assert.equal(result,42);assert.equal(h.doc.querySelectorAll('#width').length,1);assert.equal(h.doc.querySelectorAll('#png').length,1);
 assert.ok(h.dialog.contains(replacement));assert.equal(h.doc.activeElement,replacement);assert.equal(h.width.isConnected,false);assert.equal(replacement.value,'1920');
 h.api.close();h.flush();assert.equal(replacement.parentNode,h.host);assert.equal(newPng.parentNode,h.host);
});
test('core: native rebuild is nested-safe and restores modal ownership after callback failure',()=>{
 const h=setup();let calls=0;h.trigger.click();
 assert.throws(()=>h.api.withNativeRebuild(()=>h.api.withNativeRebuild(()=>{calls++;throw new Error('rebuild failed');})),/rebuild failed/);
 assert.equal(calls,1);assert.equal(h.dialog.open,true);assert.ok(h.dialog.contains(h.width));h.api.close();h.flush();assert.equal(h.width.parentNode,h.host);
 assert.equal(h.api.withNativeRebuild(()=>7),7);
});
