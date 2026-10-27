/* Model hooks for Glass Lab and Smearworks. The shader/rendering code owns the output. */
(() => {
  'use strict';
  const model=window.MLMaterialModel;
  if(!model||document.body.dataset.graphicsStatus==='unavailable'||!window.MLEditorHistory||!window.MLNumberInputs)return;
  const note=document.createElement('p');note.className='ml-material-history-note';note.setAttribute('role','status');
  note.textContent='⌘ / Ctrl Z で取り消し。新しい画像・動画の読み込み時は履歴をリセットします。';
  document.querySelector('#mlMaterialRail')?.append(note);
  let history,wheelTimer=0;
  if(model.tool==='smearworks'){
    const overlay=document.querySelector('#ov');
    // Install before common event tracking so a new pointer gesture ends the previous wheel burst.
    window.addEventListener('pointerdown',()=>{if(wheelTimer){clearTimeout(wheelTimer);wheelTimer=0;history?.commit();}},true);
    overlay.addEventListener('wheel',event=>{
      if(history.isBusy){event.preventDefault();event.stopImmediatePropagation();return;}
      if(!wheelTimer||!history.active){history.commit();history.begin('構図のズーム');}
      clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>{wheelTimer=0;history.commit();},180);
    },true);
  }
  history=window.MLEditorHistory.register({name:model.name,capture:model.capture,restore:s=>{model.restore(s);window.MLNumberInputs.refresh();},isBusy:model.isBusy,maxEntries:60,
    toolbar:document.querySelector('.ml-toolbar-actions'),root:document.body,
    onStatus:message=>{if(message)note.textContent=message;}
  });
  window.MLMaterialKeyboard={history,exportBusy:false,boundary(reason){history.reset(reason);note.textContent=reason+'。⌘ / Ctrl Z はここからの変更に使えます。';}};
  const numeric=window.MLNumberInputs;
  for(const entry of [...(model.rangeEntries?.()||[]),...(model.numbers?.()||[])])numeric.bind(entry);
  history.subscribe(()=>numeric.refresh());
  document.body.dataset.materialKeyboardReady='true';
})();
