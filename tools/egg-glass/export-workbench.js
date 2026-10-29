/* Shared export presentation. Original controls and encoder callbacks stay owned by each editor. */
(function(root){
  'use strict';
  const value=x=>typeof x==='function'?x():x;
  function capability(format,context={}){
    if(context.graphicsUnavailable)return {ok:false,reason:'この環境では描画を開始できません。WebGL対応のPCブラウザで開いてください。'};
    try{const result=format.available?.();if(result===false)return {ok:false,reason:'現在の設定では使用できません。'};if(result&&result.ok===false)return result;}
    catch(_){return {ok:false,reason:'書き出しの準備が整っていません。'};}
    return {ok:true,reason:''};
  }
  if(typeof module==='object'&&module.exports)module.exports={capability};
  if(!root.document)return;
  const doc=root.document, registrations=new Map();let nativeDepth=0;
  const resolve=ref=>typeof ref==='function'?ref():typeof ref==='string'?doc.querySelector(ref):ref;
  const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  function register(config){
    if(registrations.has(config.id))return registrations.get(config.id);
    let current=config.formats[0],moved=[],timer=null,opener=null,refreshQueued=false,readouts=[],unsubscribeHistory=null,rebuilding=false;
    const dialog=el('dialog','ml-export-dialog');dialog.id='mlUnifiedExport';dialog.setAttribute('aria-labelledby','mlUnifiedExportTitle');
    const head=el('header','ml-export-head'),heading=el('div'),title=el('h2','','作品を書き出す');title.id='mlUnifiedExportTitle';heading.append(el('small','',config.title||config.id),title);
    const close=el('button','ml-export-close','×');close.type='button';close.setAttribute('aria-label','書き出しを閉じる');head.append(heading,close);
    const body=el('div','ml-export-body'),settings=el('fieldset','ml-export-settings');settings.setAttribute('aria-label','書き出し設定');body.append(settings);
    const status=el('div','ml-export-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const footer=el('footer','ml-export-footer'),secondary=el('div','ml-export-secondary'),primary=el('fieldset','ml-export-primary');primary.setAttribute('aria-label','書き出し実行');
    const cancel=el('button','ml-export-cancel',config.cancelLabel||'書き出しを中止');cancel.type='button';cancel.hidden=true;footer.append(secondary,primary,cancel);
    dialog.append(head,body,status,footer);doc.body.append(dialog);
    let formatSelect,reasonBox,noteBox,actionButton,nativeAction,secondaryActions=[];
    const graphicsUnavailable=()=>doc.body.dataset.graphicsStatus==='unavailable'||doc.body.classList.contains('egg-graphics-unavailable')||doc.body.dataset.mlUnavailable==='true';
    const busy=()=>{try{return !!config.busy?.();}catch(_){return false;}};
    function take(ref){const n=resolve(ref);if(!n)return el('span');if(!moved.some(x=>x.node===n)&&n.parentNode){const mark=doc.createComment('export-control-home');n.before(mark);moved.push({node:n,mark});}return n;}
    function restore(){for(const {node,mark} of moved.reverse()){if(mark.parentNode){mark.replaceWith(node);}}moved=[];}
    const ui={
      take,
      field(label,ref,note){const wrapper=el('div','ml-export-field'),caption=el('div','ml-export-label',label),node=take(ref);wrapper.append(caption,node);if(node.matches?.('input,select,textarea')&&!node.getAttribute('aria-label'))node.setAttribute('aria-label',label);if(note)wrapper.append(ui.note(note));return wrapper;},
      note:text=>el('p','ml-export-note',text),
      readout(label,text,note){const n=el('div','ml-export-readout'),strong=el('strong'),caption=note?ui.note(''):null;n.append(el('span','ml-export-label',label),strong);if(caption)n.append(caption);const update=()=>{const next=String(value(text)??'');if(strong.textContent!==next)strong.textContent=next;if(caption){const detail=String(value(note)??'');if(caption.textContent!==detail)caption.textContent=detail;}};update();if(typeof text==='function'||typeof note==='function')readouts.push(update);return n;},
      group(nodes){const n=el('div','ml-export-group');(Array.isArray(nodes)?nodes:[nodes]).filter(Boolean).forEach(x=>n.append(x));return n;},
      nativeClick(ref){nativeDepth++;try{resolve(ref)?.click();}finally{nativeDepth--; }},
      refresh(){if(!dialog.open||busy())return sync();if(!refreshQueued){refreshQueued=true;queueMicrotask(()=>{refreshQueued=false;if(dialog.open&&!busy())render();});}},
      close(){if(!busy())dialog.close();},
      dialog,
    };
    function section(key,label,content){const s=el('section','ml-export-section');s.dataset.exportSection=key;s.append(el('h3','',label));const nodes=Array.isArray(content)?content:[content];nodes.filter(Boolean).forEach(n=>s.append(n));settings.append(s);return s;}
    function mountAction(format,parent){let button=resolve(format.button);if(!button){button=el('button','','書き出し');button.disabled=true;button.type='button';}
      button=take(button);button.classList.add('ml-export-native-action');button.setAttribute('data-ml-history-ignore','');
      // Handoff restores every native control before the original progress/code dialog opens.
      if(format.handoff){const proxy=el('button','ml-export-native-action',format.label||button.textContent);proxy.type='button';proxy.addEventListener('click',()=>{if(!capability(format,{graphicsUnavailable:graphicsUnavailable()}).ok)return;dialog.close();restore();ui.nativeClick(button);});parent.append(proxy);return proxy;}
      parent.append(button);return button;
    }
    function rememberFocus(){
      const focused=dialog.contains(doc.activeElement)?doc.activeElement:null,focusId=focused?.id,focusLabel=focused?.getAttribute('aria-label');
      return()=>{let target=focused&&dialog.contains(focused)?focused:null;if(!target&&focusId)target=dialog.querySelector('#'+CSS.escape(focusId));if(!target&&focusLabel){const matches=[...dialog.querySelectorAll('[aria-label]')].filter(n=>n.getAttribute('aria-label')===focusLabel);if(matches.length===1)target=matches[0];}if(target&&!target.disabled)target.focus();};
    }
    function withNativeRebuild(rebuild){
      if(!dialog.open||rebuilding)return rebuild();
      const focus=rememberFocus();rebuilding=true;restore();
      try{return rebuild();}finally{rebuilding=false;if(dialog.open){render();focus();}}
    }
    function render(){
      const focus=rememberFocus();readouts=[];
      restore();settings.replaceChildren();primary.replaceChildren();secondary.replaceChildren();secondaryActions=[];
      const field=(name,fallback)=>config.fields?.[name]?.(current,ui)||ui.note(fallback);
      section('size','01 サイズ',field('size','現在のキャンバスサイズで書き出します。'));
      formatSelect=el('select');formatSelect.setAttribute('aria-label','書き出し形式');formatSelect.setAttribute('data-ml-history-ignore','');
      for(const f of config.formats){const option=el('option','',f.label);option.value=f.id;formatSelect.append(option);}formatSelect.value=current.id;
      noteBox=ui.note(value(current.note)||'');reasonBox=el('ul','ml-export-constraints');section('format','02 形式',[formatSelect,noteBox,reasonBox]);
      section('alpha','03 透過',field('alpha','非対応 — 背景を含めて書き出します。'));
      section('fps','04 FPS',field('fps','不要 — 静止画にはフレームレートを使用しません。'));
      const extra=config.fields?.extra?.(current,ui);if(extra&&(!Array.isArray(extra)||extra.filter(Boolean).length))section('extra','その他の設定',extra);
      nativeAction=resolve(current.button);actionButton=mountAction(current,primary);
      for(const a of config.actions||[]){if(a.when&&!a.when(current))continue;const fieldset=el('fieldset','ml-export-secondary-action');secondary.append(fieldset);const b=mountAction(a,fieldset);if(a.label)b.textContent=a.label;b.dataset.exportSecondary='true';secondaryActions.push({format:a,fieldset,button:b,native:resolve(a.button)});}
      formatSelect.addEventListener('change',()=>{if(busy()){formatSelect.value=current.id;return;}const next=config.formats.find(f=>f.id===formatSelect.value);if(!next||!capability(next,{graphicsUnavailable:graphicsUnavailable()}).ok){formatSelect.value=current.id;return;}current=next;current.select?.();render();formatSelect.focus();});
      config.afterRender?.(current,ui);sync();
      focus();
    }
    function sync(){
      if(!dialog.open)return;for(const update of readouts)update();const locked=busy(),context={graphicsUnavailable:graphicsUnavailable()},selected=capability(current,context);
      if(current.handoff&&actionButton)actionButton.disabled=!!nativeAction?.disabled;
      settings.disabled=locked;formatSelect.disabled=locked;close.disabled=locked;cancel.hidden=!(locked&&config.cancel);primary.disabled=!locked&&!selected.ok;
      for(const a of secondaryActions){const c=capability(a.format,context);a.fieldset.disabled=locked||!c.ok;a.button.title=c.reason||'';if(a.format.handoff)a.button.disabled=!!a.native?.disabled;}
      const reasons=[];
      for(const f of config.formats){const c=capability(f,context),option=[...formatSelect.options].find(o=>o.value===f.id);if(option)option.disabled=!c.ok;if(!c.ok)reasons.push(f.label+'：'+c.reason);}
      const reasonText=reasons.join('\n');if(reasonBox.dataset.text!==reasonText){reasonBox.dataset.text=reasonText;reasonBox.replaceChildren(...reasons.map(t=>el('li','',t)));}reasonBox.hidden=!reasons.length;
      const note=value(current.note)||'';if(noteBox.textContent!==note)noteBox.textContent=note;
      const nativeMessages=(config.status||[]).map(s=>resolve(s)).filter(Boolean).filter(n=>n.textContent.trim()&&n.getClientRects().length&&(!root.getComputedStyle||root.getComputedStyle(n).opacity!=='0')).map(n=>n.textContent.trim());
      const message=locked?(nativeMessages.join(' · ')||'書き出し中…')+(config.cancel?'':'（この処理は中止できません。停止・保存ボタンがある場合は利用できます。）'):!selected.ok?selected.reason:nativeMessages.join(' · ');
      if(status.textContent!==message)status.textContent=message;status.hidden=!message;
    }
    function open(trigger){if(dialog.open)return;clearInterval(timer);opener=trigger||doc.activeElement;config.prepare?.(ui);current.select?.();render();dialog.showModal();sync();unsubscribeHistory?.();unsubscribeHistory=root.MLEditorHistory?.getCurrent?.()?.subscribe(sync)||null;timer=setInterval(sync,180);formatSelect.focus();config.afterOpen?.(current,ui);}
    close.addEventListener('click',()=>ui.close());cancel.addEventListener('click',()=>config.cancel?.());
    dialog.addEventListener('cancel',e=>{e.preventDefault();if(busy()){config.cancel?.();sync();}else dialog.close();});
    dialog.addEventListener('close',()=>{if(dialog.open)return;clearInterval(timer);timer=null;unsubscribeHistory?.();unsubscribeHistory=null;readouts=[];restore();config.beforeClose?.(current,ui);if(opener?.isConnected&&!opener.disabled&&!doc.querySelector('dialog[open]'))opener.focus();});
    dialog.addEventListener('keydown',e=>{e.stopPropagation();if(e.key!=='Tab')return;const nodes=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')].filter(n=>!n.disabled&&!n.closest('fieldset:disabled')&&n.getClientRects().length);if(!nodes.length){e.preventDefault();return;}const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&doc.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&doc.activeElement===last){e.preventDefault();first.focus();}});
    dialog.addEventListener('input',()=>queueMicrotask(sync));dialog.addEventListener('change',()=>queueMicrotask(sync));
    doc.addEventListener('click',e=>{if(nativeDepth)return;const trigger=e.target.closest?.(config.trigger);if(!trigger)return;e.preventDefault();e.stopImmediatePropagation();open(trigger);},true);
    // Capability information remains inspectable even on a GPU-less browser; render actions stay disabled.
    doc.querySelectorAll(config.trigger).forEach(n=>{n.disabled=false;n.setAttribute('aria-haspopup','dialog');n.setAttribute('data-ml-history-ignore','');});
    const api={open,close:ui.close,refresh:ui.refresh,withNativeRebuild,config};registrations.set(config.id,api);return api;
  }
  root.MLExportUI={register,capability,registrations};
})(typeof window==='undefined'?globalThis:window);
