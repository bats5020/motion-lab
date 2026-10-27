/* Model-backed history and numeric control registration for the five raster editors. */
(() => {
  'use strict';
  const model=window.MLRasterModel;
  if(!model||!window.MLEditorHistory||!window.MLNumberInputs)return;
  const note=document.createElement('p');note.className='raster-history-note';note.setAttribute('role','status');
  const host=document.querySelector('.raster-library,.raster-inspector');host?.append(note);
  const describe=()=>{note.textContent=model.tool==='dither-svg'?'⌘ / Ctrl Z で取り消し。画像は最大8点まで履歴に保持します。':model.tool==='pixel-gradient'?'⌘ / Ctrl Z で取り消し / Shift を加えてやり直し。':'⌘ / Ctrl Z で取り消し。新しい画像・動画の読み込み時は履歴をリセットします。';};describe();
  const history=window.MLEditorHistory.register({
    name:model.name,capture:model.capture,restore:s=>{model.restore(s);bindControls();window.MLNumberInputs.refresh();},
    equals:model.equals,isBusy:model.isBusy,maxEntries:60,root:document.body,
    toolbar:document.querySelector('.raster-toolbar-actions'),
    onStatus:message=>{if(message)note.textContent=message;}
  });
  const urls=new Set(),canvases=new Set();
  const initial=model.capture();if(initial.source)canvases.add(initial.source);if(initial.url)urls.add(initial.url);
  const reset=(reason)=>{history.reset(reason);note.textContent=reason+'。⌘ / Ctrl Z はここからの変更に使えます。';};
  window.MLRasterKeyboard={
    history,
    boundary(reason){canvases.clear();const s=model.capture();if(s.source)canvases.add(s.source);reset(reason);},
    beforeImageLoad(){history.begin('画像を読み込み');},
    afterImageLoad(previous,url){
      if(previous)urls.add(previous);urls.add(url);
      if(urls.size>8){
        reset('画像履歴が8点を超えたため、現在の画像から履歴を再開しました');
        for(const old of urls)if(old!==url)URL.revokeObjectURL(old);
        urls.clear();urls.add(url);
      }else history.commit();
    },
    trackCanvas(canvas){
      if(!canvas)return;canvases.add(canvas);
      const bytes=[...canvases].reduce((n,c)=>n+c.width*c.height*4,0);
      if(canvases.size>8||bytes>128*1024*1024){reset('回転画像の履歴がメモリ上限に達したため、現在の画像から履歴を再開しました');canvases.clear();canvases.add(canvas);}
    }
  };
  window.addEventListener('pagehide',event=>{if(!event.persisted){for(const url of urls)URL.revokeObjectURL(url);urls.clear();}});
  const numeric=window.MLNumberInputs,registered=new Set();
  function numericLabel(range){
    const card=range.closest('.color-card');
    if(card?.parentElement){
      const index=[...card.parentElement.children].indexOf(card)+1;
      return `カラー ${index} ${range.dataset.k==='x'?'横位置':range.dataset.k==='y'?'縦位置':'位置'}`;
    }
    const effect=range.closest('.fxrow');
    if(effect){
      const name=effect.querySelector('.fxname')?.textContent.trim()||effect.dataset.id||'効果';
      const field=range.closest('.prow')?.querySelector(':scope > span')?.textContent.trim()||range.getAttribute('aria-label')||'値';
      return `${name} / ${field}`;
    }
    return range.getAttribute('aria-label')||range.closest('.row,.field,.prow,.ctl')?.querySelector('label,.lab>span,span')?.textContent.trim()||'値';
  }
  function bindControls(){
    for(const binding of registered){if(!binding.input.isConnected||binding.range&&!binding.range.isConnected){binding.destroy();registered.delete(binding);}}
    document.querySelectorAll('input[type=range]').forEach(range=>{
      if(numeric.getBinding(range))return;
      const twin=range.id.endsWith('R')?document.getElementById(range.id.slice(0,-1)+'N'):null;
      const number=twin?.type==='number'?twin:undefined;
      const readout=document.getElementById(range.id+'V')||range.closest('.prow')?.querySelector('.pv');
      const suffix=readout?.textContent.trim().match(/(?:px|%|°|秒|s)$/)?.[0]||'';
      const label=numericLabel(range);range.setAttribute('aria-label',label);
      registered.add(numeric.bind({range,number,readout,suffix,scale:1,label,
        getValue:()=>{const value=model.valueFor?.(range);return Number.isFinite(value)?value:+range.value;},
        setValue:model.setRange?value=>model.setRange(range,value):undefined
      }));
    });
    for(const binding of model.numbers?.()||[]){if(!numeric.getBinding(binding.number))registered.add(numeric.bind(binding));}
  }
  bindControls();
  // Pixel color rows are intentionally rebuilt on state restoration and mode changes.
  const dynamic=document.querySelector('#colorList');
  if(dynamic)new MutationObserver(()=>bindControls()).observe(dynamic,{childList:true,subtree:true});
  history.subscribe(()=>numeric.refresh());
  document.body.dataset.rasterKeyboardReady='true';
})();
