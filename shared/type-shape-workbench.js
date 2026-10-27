/* Additive navigation and layout. Original rendering/settings/export functions remain untouched. */
(() => {
  'use strict';
  const body=document.body, kind=body.dataset.mlEditor;
  if(!kind)return;
  const $=id=>document.getElementById(id), panel=$('panel'), rail=$('ml-type-rail-content');
  const home=$('mlab-home');
  if(home){home.removeAttribute('style');home.removeAttribute('onmouseover');home.removeAttribute('onmouseout');home.className='ml-home';home.textContent='↖ MOTION LAB';}
  let exportButton=$('ml-export-jump');
  if(kind==='wireframe'){
    const top=$('topbar');top.classList.add('ml-toolbar','ml-type-toolbar');top.prepend(home);
    const scenes=$('sceneSwitch');if(scenes){const group=document.createElement('div');group.className='ml-type-scene-group';group.innerHTML='<div class="ml-type-small-title">SCENE</div>';group.append(scenes);rail.before(group);}
    exportButton=document.createElement('button');exportButton.id='ml-export-jump';exportButton.className='ml-button ml-primary';exportButton.textContent='書き出し ↗';top.append(exportButton);
  }else{
    $('ml-home-mount').append(home);
    if(kind==='u19-aberration'){
      const h=panel.querySelector('header');h.classList.add('ml-original-header');
      const source=document.createElement('div');source.className='ml-type-source-actions';
      source.append($('dice'),h.querySelector('.seedrow'));rail.before(source);
    }else $('topbar')?.classList.add('ml-canvas-caption');
  }
  panel.setAttribute('aria-label','調整パネル');
  const nav=document.createElement('nav');nav.className='ml-type-section-nav';nav.setAttribute('aria-label','調整パネルの移動');
  for(const [key,label] of [['edit','編集'],['motion','動き'],['export','書き出し']]){
    const button=document.createElement('button');button.className='ml-button';button.dataset.mlJump=key;button.textContent=label;nav.append(button);
  }
  panel.prepend(nav);
  function heading(el){return el.querySelector('summary,h2,.section-head .label')?.textContent.trim()||'';}
  function sections(){return [...panel.children].filter(n=>n.matches('details,section,.section'));}
  function jump(key){
    const blocks=sections();
    const target=key==='export'?blocks.find(n=>n.querySelector('#btn-png,#btnPng1,.export-grid')):
      key==='motion'?blocks.find(n=>/モーション|波|Motion|Global|全体/i.test(heading(n))):blocks.find(n=>!/書き出し|Export/i.test(heading(n)));
    if(!target)return;
    if(target.tagName==='DETAILS')target.open=true;
    target.classList.remove('collapsed');target.scrollIntoView({block:'start',behavior:'auto'});
    const focusTarget=target.querySelector('summary,.section-head');focusTarget?.focus({preventScroll:true});
  }
  exportButton.onclick=()=>jump('export');nav.addEventListener('click',e=>{const b=e.target.closest('[data-ml-jump]');if(b)jump(b.dataset.mlJump);});
  function labelControls(root){
    root.querySelectorAll('.row,.prow,.seedrow,.ctrl').forEach(row=>{
      const label=row.querySelector(':scope > label,:scope > .label,:scope > .lbl,:scope > span:first-child,.ctrl-label');
      if(!label)return;const name=label.textContent.replace(/\?/g,'').trim();if(!name)return;
      const controls=[...row.querySelectorAll('input:not([type=hidden]),select,textarea')];
      controls.forEach((el,i)=>{if(!el.getAttribute('aria-label')&&![...(el.labels||[])].some(label=>label.textContent.trim()))el.setAttribute('aria-label',name+(controls.length>1?' '+(i+1):''));if(controls.length===1&&label.tagName==='LABEL'&&el.id&&!label.htmlFor)label.htmlFor=el.id;});
    });
    root.querySelectorAll('.section-head').forEach(head=>{
      head.tabIndex=0;head.setAttribute('role','button');head.setAttribute('aria-expanded',String(!head.parentElement.classList.contains('collapsed')));
      if(!head.dataset.mlKeyboard){head.dataset.mlKeyboard='true';head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();head.click();}});head.addEventListener('click',()=>queueMicrotask(()=>head.setAttribute('aria-expanded',String(!head.parentElement.classList.contains('collapsed')))));}
    });
    root.querySelectorAll('button').forEach(b=>{if(!b.hasAttribute('type'))b.type='button';});
  }
  function refresh(){
    if(!nav.isConnected)panel.prepend(nav);
    const blocks=sections();
    const presets=kind==='wireframe'?blocks.find(n=>n.querySelector('.preset-grid')):
      kind==='u19-aberration'?blocks.find(n=>n.querySelector('#presets')):blocks.find(n=>heading(n)==='プリセット');
    if(presets){presets.classList.add('ml-rail-presets');if(presets.tagName==='DETAILS')presets.open=true;rail.replaceChildren(presets);}
    labelControls(panel);labelControls(rail);labelControls($('ml-type-rail'));
    if($('resW'))$('resW').setAttribute('aria-label','書き出しの幅');if($('resH'))$('resH').setAttribute('aria-label','書き出しの高さ');
  }
  refresh();
  new MutationObserver(refresh).observe(panel,{childList:true,subtree:kind==='u19-aberration'});
  if(kind==='warp-type')$('i-text').setAttribute('aria-label','テキスト（縦棒で改行）');
  if(kind==='ascii-wave')$('i-chars').setAttribute('aria-label','文字セット');
  function unavailable(message){
    if(body.dataset.mlUnavailable)return;body.dataset.mlUnavailable='true';
    const stage=$('stage'), notice=document.createElement('div');notice.className='ml-capability ml-type-capability';notice.setAttribute('role','status');
    notice.innerHTML='<span class="ml-type-capability-icon" aria-hidden="true">◇</span><strong>この環境では描画を開始できません</strong><p></p><small>画像・動画の書き出しを停止しています。保存した設定は変更していません。</small>';
    notice.querySelector('p').textContent=message;stage.append(notice);
    body.querySelectorAll('button,input,select,textarea').forEach(el=>{if(!el.closest('.ml-type-section-nav')&&!el.closest('#help')&&!el.closest('#coach'))el.disabled=true;});
    const boot=$('boot');if(boot)boot.style.display='none';
  }
  if(body.dataset.mlGraphics==='webgl'){
    let gl;try{gl=document.createElement('canvas').getContext('webgl');}catch{}
    if(!gl)unavailable('WebGL が使用できません。対応するブラウザで開き、ハードウェア アクセラレーションの設定を確認してください。');
    else{gl.getExtension('WEBGL_lose_context')?.loseContext();const canvas=$('cv')||$('three-canvas');canvas?.addEventListener('webglcontextlost',()=>unavailable('描画用の接続が失われました。ほかの重いタブを閉じてから、このページを再読み込みしてください。'));}
  }
  if(!body.dataset.mlUnavailable)window.dispatchEvent(new Event('resize'));
})();
