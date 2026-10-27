/* Shared editor transactions. Tool adapters own model snapshots and restoration. */
(function(root){
  'use strict';
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  function rememberNumericFocus(){
    const doc=root.document,element=doc?.activeElement,binding=root.MLNumberInputs?.getBinding?.(element);
    if(!binding||element!==binding.input)return()=>{};
    const id=binding.range?.id,label=element.getAttribute?.('aria-label'),inputId=binding.range?null:element.id;
    return()=>{const restore=()=>{
      if(doc.activeElement&&doc.activeElement!==doc.body)return;
      if(element.isConnected){if(!element.disabled)element.focus({preventScroll:true});return;}
      const candidates=[...doc.querySelectorAll('[data-ml-number]')].filter(input=>{
        const candidate=root.MLNumberInputs.getBinding(input);
        return id?candidate?.range?.id===id:inputId?input.id===inputId:label&&input.getAttribute('aria-label')===label;
      });
      if(candidates.length===1&&!candidates[0].disabled)candidates[0].focus({preventScroll:true});
    };if(root.queueMicrotask)root.queueMicrotask(restore);else restore();};
  }
  class HistoryController {
    constructor(options){
      this.options=options;this.past=[];this.future=[];this.active=null;
      this.isRestoring=false;this.pending=false;this.limit=options.maxEntries||60;
      this.stable=this.read();this.listeners=new Set();
    }
    get isBusy(){return this.isRestoring||this.pending||!!this.options.isBusy?.();}
    get canUndo(){return !this.isBusy&&this.past.length>0;}
    get canRedo(){return !this.isBusy&&this.future.length>0;}
    read(){return this.options.capture();}
    equal(a,b){return (this.options.equals||same)(a,b);}
    emit(message){for(const fn of this.listeners)fn(this,message);this.options.onStatus?.(message||'',this);}
    subscribe(fn){this.listeners.add(fn);fn(this);return()=>this.listeners.delete(fn);}
    begin(label='編集',fromStable=false){
      if(this.isBusy)return false;
      if(!this.active)this.active={snapshot:fromStable?this.stable:this.read(),label};
      return true;
    }
    commit(){
      if(this.isBusy)return false;
      const after=this.read(),entry=this.active;this.active=null;
      const changed=!!entry&&!this.equal(entry.snapshot,after);
      if(changed){this.past.push(entry);if(this.past.length>this.limit)this.past.shift();this.future.length=0;}
      this.stable=after;this.emit();return changed;
    }
    cancel(){
      if(this.isBusy||!this.active)return false;
      const entry=this.active;
      if(this.equal(entry.snapshot,this.read())){this.active=null;this.stable=entry.snapshot;this.emit();return false;}
      return this.restoreSnapshot(entry.snapshot,()=>{this.active=null;this.stable=this.read();this.emit('入力を取り消しました');});
    }
    transact(label,fn){
      if(!this.begin(label))return false;
      let result;try{result=fn();}catch(error){this.active=null;this.stable=this.read();throw error;}
      if(result&&typeof result.then==='function'){
        this.pending=true;this.emit();return result.then(value=>{this.pending=false;this.commit();return value;},error=>{this.pending=false;this.active=null;this.stable=this.read();this.emit('変更を完了できませんでした');throw error;});
      }
      this.commit();return result;
    }
    restoreSnapshot(snapshot,done){
      const restoreFocus=rememberNumericFocus();this.isRestoring=true;this.emit();
      const finish=()=>{this.isRestoring=false;done();root.MLNumberInputs?.refresh?.();restoreFocus();};
      const fail=error=>{this.isRestoring=false;this.emit('履歴を復元できませんでした');this.options.onError?.(error);return false;};
      try{const result=this.options.restore(snapshot);if(result&&typeof result.then==='function')return result.then(value=>{if(value===false)return fail(new Error('Restore rejected'));finish();return true;},fail);if(result===false)return fail(new Error('Restore rejected'));finish();return true;}catch(error){return fail(error);}
    }
    travel(from,to,message){
      if(this.isBusy)return false;
      this.commit();if(!from.length){this.emit(from===this.past?'これ以上取り消せません':'やり直せる操作はありません');return false;}
      const entry=from[from.length-1],current={snapshot:this.read(),label:entry.label};
      return this.restoreSnapshot(entry.snapshot,()=>{from.pop();to.push(current);this.stable=this.read();this.emit(message);});
    }
    undo(){return this.travel(this.past,this.future,'取り消しました');}
    redo(){return this.travel(this.future,this.past,'やり直しました');}
    reset(reason){this.active=null;this.past=[];this.future=[];this.stable=this.read();this.emit(reason);}
    refresh(){this.emit();}
  }
  class NativeController {
    constructor(options){this.options=options;this.native=options.native;this.isRestoring=false;this.pending=false;this.active=null;this.listeners=new Set();}
    get isBusy(){return this.isRestoring||this.pending||!!this.options.isBusy?.();}
    get canUndo(){return !this.isBusy&&(this.native.canUndo?!!this.native.canUndo():true);}
    get canRedo(){return !this.isBusy&&(this.native.canRedo?!!this.native.canRedo():true);}
    emit(message){for(const fn of this.listeners)fn(this,message);this.options.onStatus?.(message||'',this);}
    subscribe(fn){this.listeners.add(fn);fn(this);return()=>this.listeners.delete(fn);}
    begin(label){if(this.isBusy)return false;if(!this.active){this.active={label};this.native.begin?.(label);}return true;}
    commit(){if(this.isBusy)return false;if(this.active){this.native.commit?.();this.active=null;}this.emit();return true;}
    cancel(){if(this.isBusy)return false;this.native.cancel?.();this.active=null;this.emit();root.MLNumberInputs?.refresh?.();return true;}
    transact(label,fn){if(!this.begin(label))return false;try{const result=fn();if(result&&typeof result.then==='function'){this.pending=true;this.emit();return result.finally(()=>{this.pending=false;this.commit();});}this.commit();return result;}catch(error){this.active=null;throw error;}}
    travel(which,message){if(this.isBusy)return false;this.commit();if(!(which==='undo'?this.canUndo:this.canRedo))return false;const restoreFocus=rememberNumericFocus();this.isRestoring=true;this.emit();const finish=()=>{this.isRestoring=false;root.MLNumberInputs?.refresh?.();this.emit(message);restoreFocus();};try{const value=this.native[which]();if(value&&typeof value.then==='function')return value.finally(finish);finish();return value;}catch(error){finish();this.options.onError?.(error);return false;}}
    undo(){return this.travel('undo','取り消しました');}redo(){return this.travel('redo','やり直しました');}
    reset(reason){this.active=null;this.native.reset?.();this.emit(reason);}refresh(){this.emit();}
  }
  let current=null;
  function boundNumber(target){return !!root.MLNumberInputs?.isBoundTarget?.(target)||!!target?.closest?.('[data-ml-number],[data-ml-number-range]');}
  function isEditableTarget(target){
    if(!target)return false;
    if(boundNumber(target))return !!root.MLNumberInputs?.isEditingTarget?.(target);
    if(target.closest?.('[contenteditable]:not([contenteditable="false"]),[role="textbox"]'))return true;
    if(target.tagName==='TEXTAREA')return true;
    return target.tagName==='INPUT'&&!['range','checkbox','radio','button','submit','reset','file','color','hidden'].includes(target.type);
  }
  function shortcut(event){
    if(!current||event.defaultPrevented||event.altKey||!(event.metaKey||event.ctrlKey))return;
    const key=String(event.key||'').toLowerCase();if(key!=='z'&&key!=='y')return;
    // Stop legacy editor shortcuts, but do not cancel the browser's native text undo.
    if(event.isComposing||event.keyCode===229||isEditableTarget(event.target)){event.stopImmediatePropagation();return;}
    event.preventDefault();event.stopImmediatePropagation();
    if(current.isBusy){current.emit('処理が終わってから操作してください');return;}
    if(key==='y'||event.shiftKey)current.redo();else current.undo();
  }
  function attachEvents(controller,options){
    if(options.autoEvents===false)return;
    const doc=root.document,scope=typeof options.root==='string'?doc.querySelector(options.root):options.root||doc.body;
    let mode='',target=null,timer=null;
    const allowed=el=>scope?.contains(el)&&!boundNumber(el)&&!el.closest?.('[data-ml-history],a,input[type=file],[data-ml-history-ignore]');
    const finish=()=>{clearTimeout(timer);timer=null;if(controller.isBusy)return;controller.commit();mode='';target=null;};
    const defer=()=>{clearTimeout(timer);timer=setTimeout(finish,0);};
    const start=(kind,el,stable=false)=>{if(controller.isBusy)return;if(controller.active&&(mode!==kind||target!==el))finish();controller.begin(kind,stable);mode=kind;target=el;};
    const commitPriorNumber=el=>{const prior=root.MLNumberInputs?.getBinding?.(doc.activeElement);const next=root.MLNumberInputs?.getBinding?.(el);if(prior&&prior!==next&&root.MLNumberInputs.isEditingTarget(doc.activeElement)){if(prior.isComposing)return false;if(!prior.commit())prior.cancel();}return true;};
    root.addEventListener('pointerdown',event=>{if(!commitPriorNumber(event.target)){event.stopImmediatePropagation();return;}if(boundNumber(event.target)){if(controller.active&&mode)finish();return;}if(!allowed(event.target))return;start(isEditableTarget(event.target)?'text':'pointer',event.target);},true);
    root.addEventListener('pointerup',()=>{if(mode==='pointer')defer();},true);
    root.addEventListener('pointercancel',()=>{if(mode==='pointer')defer();},true);
    root.addEventListener('click',event=>{if(!allowed(event.target)||isEditableTarget(event.target)||controller.isBusy)return;if(!controller.active)start('click',event.target);if(mode!=='text'&&mode!=='key')defer();},true);
    root.addEventListener('focusin',event=>{if(boundNumber(event.target)){if(controller.active&&mode)finish();return;}if(allowed(event.target)&&isEditableTarget(event.target))start('text',event.target);},true);
    root.addEventListener('focusout',event=>{if(mode==='text'&&event.target===target)defer();},true);
    root.addEventListener('keydown',event=>{
      if(event.defaultPrevented||event.isComposing||event.keyCode===229||!allowed(event.target)||isEditableTarget(event.target)||event.metaKey||event.ctrlKey||event.altKey)return;
      if(['Shift','Control','Meta','Alt','Tab','Escape'].includes(event.key))return;
      start('key',event.target);
    },true);
    root.addEventListener('keyup',event=>{if(mode==='key'&&!event.isComposing)defer();},true);
    for(const type of ['input','change'])root.addEventListener(type,event=>{
      if(!allowed(event.target)||controller.isBusy)return;
      if(!controller.active)start(isEditableTarget(event.target)?'text':'input',event.target,true);
      if(!['text','pointer','key'].includes(mode))defer();
    },true);
    root.addEventListener('blur',()=>{if(controller.active)finish();});
  }
  function attachToolbar(controller,options){
    const doc=root.document;
    const locate=()=>typeof options.toolbar==='string'?doc.querySelector(options.toolbar):options.toolbar||doc.querySelector('#workbenchTop .wb-top-actions,.ml-toolbar-actions,#rasterToolbar,.ml-toolbar,#mlMotionToolbar,.toolbar');
    const status=doc.createElement('div');status.className='ml-history-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');doc.body.append(status);
    let undo,redo;
    const mount=()=>{const toolbar=locate();if(!toolbar||options.toolbar===false||undo)return false;
      const box=doc.createElement('div');box.className='ml-history-actions';box.dataset.mlHistory='true';box.setAttribute('role','group');box.setAttribute('aria-label','編集履歴');
      undo=doc.createElement('button');redo=doc.createElement('button');
      for(const [button,text,title,action]of [[undo,'↶','取り消す（⌘ / Ctrl Z）','undo'],[redo,'↷','やり直す（⌘ / Ctrl Shift Z）','redo']]){button.type='button';button.textContent=text;button.title=title;button.setAttribute('aria-label',title);button.addEventListener('click',()=>controller[action]());box.append(button);}
      toolbar.prepend(box);undo.disabled=!controller.canUndo;redo.disabled=!controller.canRedo;return true;
    };
    if(options.toolbar!==false&&!mount()&&root.MutationObserver){const observer=new root.MutationObserver(()=>{if(mount())observer.disconnect();});observer.observe(doc.body,{childList:true,subtree:true});}
    controller.subscribe((c,message)=>{if(undo)undo.disabled=!c.canUndo;if(redo)redo.disabled=!c.canRedo;if(message)status.textContent=message;});
  }
  const api={HistoryController,NativeController,isEditableTarget,getCurrent:()=>current,
    register(options){current=options.native?new NativeController(options):new HistoryController(options);if(root.document){attachEvents(current,options);attachToolbar(current,options);}return current;}
  };
  root.MLEditorHistory=api;
  if(root.document&&root.addEventListener)root.addEventListener('keydown',shortcut,true);
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis);
