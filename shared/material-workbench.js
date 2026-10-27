/* Layout adapters for Glass Lab, Thermal Flow and Smearworks.
   Original engine scripts, control nodes and event handlers remain in place. */
(() => {
  'use strict';
  const tool=document.body.dataset.materialTool;
  const titles={'glass-lab':'Glass Lab','thermal-flow':'Thermal Flow','smearworks':'Smearworks'};
  if(!titles[tool])return;
  const $=id=>document.getElementById(id);
  const create=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
  const toolbar=create('header','ml-toolbar');toolbar.id='mlToolbar';
  const home=$('mlab-home');home.removeAttribute('style');home.removeAttribute('onmouseover');home.removeAttribute('onmouseout');home.className='ml-home';home.textContent='↖ MOTION LAB';
  const doc=create('div','ml-document');doc.append(create('strong','',titles[tool]),create('span','ml-context',tool==='smearworks'?'Image processing':'Background / Texture'));
  const actions=create('div','ml-toolbar-actions');actions.append(create('span','ml-toolbar-note','素材はブラウザ内で処理'));
  const exportButton=create('button','ml-button ml-primary','書き出し ↗');exportButton.id='mlExport';exportButton.type='button';actions.append(exportButton);toolbar.append(home,doc,actions);document.body.prepend(toolbar);
  const panel=$('panel'),stage=$('stage');panel.setAttribute('aria-label','調整パネル');stage.setAttribute('aria-label','作品プレビュー');
  const rail=create('aside','ml-material-rail ml-scroll');rail.id='mlMaterialRail';rail.setAttribute('aria-label','素材とルック');
  const railHeading=create('div','ml-section-title',tool==='smearworks'?'SOURCE / PRESETS':'LOOKS / SOURCE');rail.append(railHeading);
  let app=$('app');
  if(!app){app=create('div','');app.id='mlMaterialApp';toolbar.after(app);app.append(stage,panel);}
  app.prepend(rail);app.classList.add('ml-material-app');
  const inspector=create('div','ml-section-title','INSPECTOR');inspector.id='mlInspectorTitle';panel.prepend(inspector);
  let exportTarget;
  if(tool==='glass-lab'){
    const header=panel.querySelector('header'),sections=[...panel.querySelectorAll(':scope > section')];
    header.classList.add('ml-material-source-head');rail.append(header,sections[0],sections[1]);
    header.querySelector('h1').hidden=true;header.querySelector('p').className='ml-field-note';
    const tabs=create('div','ml-tabs');tabs.setAttribute('aria-label','調整する内容');panel.insertBefore(tabs,sections[2]);
    const groups=[['glass','ガラス',sections[2]],['motion','動き',sections[3]],['export','保存',sections[4]]];
    const setTab=name=>{groups.forEach(([key,,section])=>section.hidden=key!==name);tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===name)));panel.scrollTop=0;};
    groups.forEach(([key,label])=>{const b=create('button','',label);b.type='button';b.dataset.panel=key;b.addEventListener('click',()=>setTab(key));tabs.append(b);});
    setTab('glass');exportButton.addEventListener('click',()=>{setTab('export');$('btnPng').focus();});
    exportTarget=sections[4];
  }else if(tool==='thermal-flow'){
    panel.querySelector('header').classList.add('ml-material-legacy-title');
    const sections=[...$('panelScroll').querySelectorAll(':scope > section')];rail.append(sections[0],sections[1]);
    exportTarget=$('exportBar');
    exportButton.addEventListener('click',()=>{$('btnPng1').focus();exportTarget.classList.add('ml-export-attention');setTimeout(()=>exportTarget.classList.remove('ml-export-attention'),900);});
  }else{
    const header=panel.querySelector('header'),preset=panel.querySelector('section');header.classList.add('ml-material-source-head');header.querySelector('h1').hidden=true;rail.append(header,preset);
    const guidance=create('div','ml-source-guidance');guidance.append(create('strong','','写真から始める'),create('p','','写真を開くか、中央へドロップ。構図 → ブラー → 色面の順に調整します。'),create('p','','Beforeは押している間、元の写真を表示します。'));
    rail.append(guidance);exportTarget=panel.querySelector('.foot');exportButton.addEventListener('click',()=>$('export').click());
    $('export').textContent='PNGを書き出す';
  }
  exportTarget?.classList.add('ml-material-export');
  const railNote=create('p','ml-material-rail-note',tool==='smearworks'?'写真はこのブラウザ内で処理されます。保存プリセットに写真本体は含まれません。':'ルックを起点に、形・色・動きを調整。元の設定URLと作品ファイルをそのまま利用できます。');rail.append(railNote);
  const ready=MLWorkbench.requireGraphics({canvas:tool==='smearworks'?'#gl':'#view',context:tool==='smearworks'?'webgl2':'webgl',stage});
  MLWorkbench.labelControls(document);
  if(!ready)return;
  const observer=new MutationObserver(()=>MLWorkbench.labelControls(document));observer.observe(app,{childList:true,subtree:true});
})();
