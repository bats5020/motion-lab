/* Small opt-in UI helpers. Never changes renderer state or saved artwork. */
(() => {
  'use strict';
  function labelControls(root=document) {
    root.querySelectorAll('.prow').forEach(row=>{
      const label=row.querySelector(':scope > span:first-child');
      if(!label||!label.textContent.trim())return;
      row.querySelectorAll('input:not([type=hidden]),select,textarea').forEach(input=>{
        if(input.hasAttribute('aria-label')||input.hasAttribute('aria-labelledby')||(input.id&&root.querySelector('label[for="'+CSS.escape(input.id)+'"]')))return;
        input.setAttribute('aria-label',label.textContent.trim());
      });
    });
  }
  function requireGraphics({canvas,context='webgl2',stage,controls=document.body}) {
    if(typeof canvas==='string')canvas=document.querySelector(canvas);
    if(typeof stage==='string')stage=document.querySelector(stage);
    if(typeof controls==='string')controls=document.querySelector(controls);
    if(!stage)return false;
    let graphics=null;try{if(canvas)graphics=canvas.getContext(context);}catch(_){}
    if(graphics)return true;
    document.body.classList.add('ml-graphics-unavailable');
    document.body.dataset.graphicsStatus='unavailable';
    if(canvas)canvas.setAttribute('aria-hidden','true');
    const overlay=document.createElement('div');overlay.className='ml-capability-overlay';
    const notice=document.createElement('div');notice.className='ml-capability';notice.setAttribute('role','alert');
    const title=document.createElement('strong');title.textContent='このブラウザでは描画を開始できません';
    const description=document.createElement('p');description.textContent=(context==='webgl2'?'WebGL 2':'WebGL')+' が利用できないため、編集・書き出しを停止しています。対応するPCブラウザで開いてください。作品や保存設定は変更されていません。';
    const detail=document.createElement('p');detail.className='ml-field-note';detail.textContent='描画機能が利用できる環境で、同じURLから編集を再開できます。';
    const reload=document.createElement('button');reload.className='ml-button';reload.type='button';reload.textContent='環境を再確認';reload.addEventListener('click',()=>location.reload());
    controls.querySelectorAll('button,input,select,textarea').forEach(control=>{control.disabled=true;});
    notice.append(title,description,detail,reload);overlay.append(notice);stage.append(overlay);
    const live=document.querySelector('[data-ml-live]');if(live)live.textContent='PREVIEW UNAVAILABLE';
    return false;
  }
  window.MLWorkbench={labelControls,requireGraphics};
})();
