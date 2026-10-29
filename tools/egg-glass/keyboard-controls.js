/* Shared ergonomic editing, with Egg-owned model restoration and asset boundaries. */
import * as historyModule from './editor-history.js';
import * as numericModule from './numeric-input.js';

export function setupEggKeyboard(context) {
  const {state,materials,backdrop,lightingControls,scrollControls,previewViewport,patternControls,logoControls,selectSurface,updatePause,resize}=context;
  const doc=document;
  // Format selection is presentation state in the unified dialog, not an undoable edit.
  // Do not restore the native codec behind a different currently selected format.
  const outputIds=['export-frame','export-start','export-end','export-duration','export-fps','export-png-target'];
  doc.querySelector('#export-video-format').dataset.mlHistoryIgnore='true';
  const capture=()=>({
    lighting:structuredClone(lightingControls.state),
    motion:scrollControls.captureEditor(),viewport:previewViewport.serialize(),
    pattern:patternControls.serialize(),logo:logoControls.serialize(),
    appearance:{surface:doc.querySelector('[data-surface][aria-pressed="true"]').dataset.surface,
      transmission:materials.pattern.transmission,backdrop:backdrop.visible,mode:state.mode,paused:state.paused},
    output:Object.fromEntries(outputIds.map(id=>[id,doc.getElementById(id).value]))
  });
  function restore(snapshot) {
    // Assets are intentionally fixed within a history generation. Never pretend
    // to restore an uploaded image from a parameters-only snapshot.
    if(snapshot.logo.imageSource!==logoControls.serialize().imageSource)return false;
    const viewport=snapshot.viewport;
    previewViewport.setSize(viewport.width,viewport.height,viewport.mode);
    Object.assign(lightingControls.state,structuredClone(snapshot.lighting));
    scrollControls.restoreEditor(snapshot.motion);
    patternControls.restoreEditor(snapshot.pattern);logoControls.restoreEditor(snapshot.logo);
    const appearance=snapshot.appearance;
    doc.querySelector('#backdrop').setAttribute('aria-pressed',String(appearance.backdrop));backdrop.visible=appearance.backdrop;
    materials.pattern.transmission=appearance.transmission;
    const transparency=Number((appearance.transmission*100).toPrecision(12));
    doc.querySelector('#transparency').value=transparency;
    doc.querySelector('#transparency-value').textContent=transparency+'%';
    doc.querySelector(`[data-mode="${appearance.mode}"]`).click();
    state.paused=appearance.paused;updatePause();selectSurface(appearance.surface);lightingControls.apply(true);
    for(const id of outputIds)doc.getElementById(id).value=snapshot.output[id];
    resize();window.MLNumberInputs.refresh();return true;
  }
  const history=window.MLEditorHistory.register({
    // Native export controls may be moved into a body-level dialog. Keep their history scope.
    name:'Egg Glass',capture,restore,root:doc.body,toolbar:doc.querySelector('.egg-toolbar-actions'),
    isBusy:()=>!!state.exporting||patternControls.busy||logoControls.busy,
    onError:()=>{doc.querySelector('#scroll-status').textContent='履歴を復元できませんでした。画像変更後の設定から編集を続けてください。';}
  });
  scrollControls.useEditorHistory(history);
  // Do not allow parameter edits to escape history while an image is loading.
  // The original upload event enters before busy=true; subsequent edits wait.
  const waitForAsset=event=>{
    const inEditor=doc.querySelector('.stage').contains(event.target)||doc.querySelector('#mlUnifiedExport')?.contains(event.target);
    if(!(patternControls.busy||logoControls.busy)||!inEditor)return;
    if(event.key==='Escape')return;
    event.preventDefault();event.stopImmediatePropagation();
    doc.querySelector(logoControls.busy?'#logo-status':'#pattern-status').textContent='画像を処理しています。完了してから編集してください。';
  };
  for(const type of ['pointerdown','click','beforeinput','change'])window.addEventListener(type,waitForAsset,true);
  const hint='数値・色・動きは ⌘ / Ctrl Z で戻せます。画像の差し替えは履歴の区切りとなり、それ以前の編集には戻れません。';
  for(const id of ['pattern-settings','logo-settings']){
    const note=doc.createElement('p');note.className='egg-history-boundary-note';note.textContent=hint;doc.getElementById(id).append(note);
  }
  doc.addEventListener('egg-asset-boundary',event=>{
    history.reset('画像を変更したため編集履歴を区切りました。ここからの数値調整を取り消せます。');
    doc.querySelector(event.detail.kind==='logo'?'#logo-status':'#pattern-status').textContent='画像を変更しました。変更前の履歴はクリアし、ここから編集を記録します。';
    window.MLNumberInputs.refresh();
  });
  bindEggNumbers(doc);
  return {history,capture,restore};
}

export function bindEggNumbers(doc=document) {
  const numbers=window.MLNumberInputs,bound=new Set();
  for(const attribute of ['data-transform','data-background','data-pattern','data-logo']){
    for(const range of doc.querySelectorAll(`[${attribute}][type="range"]`)){
      const key=range.getAttribute(attribute),number=doc.querySelector(`[${attribute}="${key}"][type="number"]`);
      const label=number?.getAttribute('aria-label')||range.getAttribute('aria-label')?.replace('のスライダー','')||range.closest('label')?.querySelector('span')?.textContent||key;
      numbers.bind({range,number,label,keyboardStep:Number(range.step)||1,integer:attribute==='data-pattern'&&key==='seed'});if(number)bound.add(number);
    }
  }
  for(const range of doc.querySelectorAll('[data-light][type="range"]')){
    const key=range.dataset.light,readout=doc.querySelector(`[data-light-value="${key}"]`);
    numbers.bind({range,readout,label:range.closest('label').firstChild.textContent.trim(),keyboardStep:1,
      suffix:['azimuth','elevation'].includes(key)?'°':'%'});
  }
  numbers.bind({range:doc.querySelector('#transparency'),readout:doc.querySelector('#transparency-value'),label:'透け感',suffix:'%',keyboardStep:1});
  const percent=doc.querySelector('#scroll-percent');
  numbers.bind({range:doc.querySelector('#scroll-preview'),number:percent,label:'スクロール位置',suffix:'%',keyboardStep:.1});bound.add(percent);
  for(const number of doc.querySelectorAll('input[type="number"]')){
    if(bound.has(number)||number.dataset.mlNumber!==undefined)continue;
    const label=number.getAttribute('aria-label')||number.dataset.label||number.closest('label')?.textContent.trim()||'数値';
    numbers.bind({number,label,commitEvents:['change'],keyboardStep:Number(number.step)||1,integer:['preview-width','preview-height','responsive-breakpoint'].includes(number.id)});
  }
}
