/* Additive editor chrome for Canvas/SVG tools. Existing rendering and state code stays in each HTML. */
(() => {
  'use strict';
  const body=document.body;
  const tool=body.dataset.rasterTool;
  const configs={
    'halftone-lab':{name:'Halftone Lab',category:'IMAGE / TEXTURE',stage:'.stagecol',panel:'.side',root:'.main'},
    'dither-svg':{name:'Dither → SVG',category:'IMAGE PROCESSING',stage:'#previewPane',panel:'#propPane',root:'#app'},
    'grid-stretch':{name:'Grid Stretch',category:'IMAGE PROCESSING',stage:'#stage',panel:'#panel'},
    'effect-stack':{name:'Effect Stack',category:'IMAGE PROCESSING',stage:'#stage',panel:'#panel',root:'#app'},
    'pixel-gradient':{name:'Pixel Gradient',category:'BACKGROUND / TEXTURE',stage:'#previewPane',panel:'#propPane',root:'#app'},
  };
  const config=configs[tool];if(!config)return;
  const find=selector=>document.querySelector(selector);
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const stage=find(config.stage),panel=find(config.panel);if(!stage||!panel)return;
  let root=config.root&&find(config.root);
  if(!root){root=el('div');body.insertBefore(root,stage);root.append(stage,panel);}
  root.classList.add('raster-workspace');root.id=root.id||'rasterWorkspace';
  panel.classList.add('raster-inspector');panel.setAttribute('aria-label','調整パネル');
  stage.classList.add('raster-stage');stage.setAttribute('aria-label','作品のプレビュー');
  const rail=el('aside','raster-library');rail.setAttribute('aria-label','素材とプリセット');root.prepend(rail);
  // Normalize existing source order (Halftone originally placed its inspector first).
  root.append(stage,panel);
  const toolbar=el('header','ml-toolbar raster-toolbar');toolbar.id='rasterToolbar';
  const home=find('#mlab-home');home.classList.add('ml-home');home.textContent='↖ MOTION LAB';toolbar.append(home);
  const documentTitle=el('div','ml-document raster-document');documentTitle.append(el('strong','',config.name),el('span','ml-context',config.category));toolbar.append(documentTitle);
  const actions=el('div','ml-toolbar-actions raster-toolbar-actions');actions.append(el('span','raster-local','● ブラウザ内で処理'));
  const exportButton=el('button','ml-button ml-primary raster-export-button','書き出し ↗');exportButton.type='button';exportButton.id='rasterExport';actions.append(exportButton);toolbar.append(actions);body.prepend(toolbar);
  const inspectorTitle=el('div','raster-panel-heading','INSPECTOR');panel.prepend(inspectorTitle);
  const railTitle=el('div','raster-panel-heading','WORKSPACE');rail.append(railTitle);
  const dialog=el('dialog','raster-export-dialog');dialog.id='rasterExportDialog';dialog.setAttribute('aria-labelledby','rasterExportTitle');
  const dialogHead=el('div','raster-dialog-head');const dialogTitle=el('div');dialogTitle.append(el('small','','EXPORT'));const h=el('h2','','作品を書き出す');h.id='rasterExportTitle';dialogTitle.append(h);
  const close=el('button','ml-button raster-dialog-close','×');close.type='button';close.setAttribute('aria-label','書き出しを閉じる');dialogHead.append(dialogTitle,close);dialog.append(dialogHead);body.append(dialog);
  exportButton.addEventListener('click',()=>{if(!dialog.open)dialog.showModal();});close.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('keydown',e=>e.stopPropagation());
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();});
  function section(title){const s=el('section','raster-section');s.append(el('h2','raster-section-title',title));return s;}
  function note(text){return el('p','raster-note',text);}
  function moveSection(s,parent){if(!s)return;parent.append(s);s.classList.add('raster-section');}
  function setTitle(s,title){const h=s?.querySelector('.head h2, h2, summary');if(h)h.textContent=title;}
  function tabs(groups){
    const nav=el('nav','raster-inspector-tabs');nav.setAttribute('aria-label','調整する内容');inspectorTitle.after(nav);
    groups.forEach(([key,label,items])=>{
      const button=el('button','',label);button.type='button';button.dataset.panel=key;
      const group=el('div','raster-inspector-page');group.id='rasterPanel-'+key;items.filter(Boolean).forEach(item=>group.append(item));panel.append(group);
      button.setAttribute('aria-controls',group.id);nav.append(button);
      button.addEventListener('click',()=>select(key));
    });
    function select(key){nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.panel===key)));panel.querySelectorAll('.raster-inspector-page').forEach(g=>g.hidden=g.id!=='rasterPanel-'+key);panel.scrollTop=0;}
    select(groups[0][0]);return select;
  }
  function action(text,id){const b=el('button','ml-button raster-quick-action',text);b.type='button';b.addEventListener('click',()=>document.getElementById(id)?.click());return b;}
  function sectionGroups(side){
    const map=new Map();let current;
    [...side.childNodes].forEach(node=>{
      if(node.nodeType===1&&node.classList.contains('seclabel')){current=section(node.textContent.trim());map.set(node.textContent.trim(),current);node.remove();}
      else if(current)current.append(node);
    });return map;
  }
  function textOf(node,text){if(node)node.textContent=text;}

  if(tool==='halftone-lab'){
    const legacyHeader=[...body.children].find(n=>n.tagName==='HEADER'&&n!==toolbar);
    const groups=sectionGroups(panel);
    const presets=section('ルックからはじめる');presets.append(find('#presets'));moveSection(presets,rail);
    moveSection(groups.get('画像'),rail);setTitle(groups.get('画像'),'素材');
    moveSection(groups.get('ソース'),rail);
    moveSection(groups.get('生成'),rail);
    if(legacyHeader)legacyHeader.hidden=true;
    tabs([
      ['look','調整',[groups.get('エフェクト'),groups.get('共通パラメータ'),groups.get('カラー'),groups.get('マスク')]],
      ['motion','動き',[groups.get('アニメーション（波）')]],
      ['save','作品保存',[groups.get('マイプリセット')]],
    ]);
    groups.get('マイプリセット')?.append(note('設定の保存・共有です。読み込んだ画像ファイルは含まれません。別の環境では同じ画像を読み込んでください。'));
    moveSection(groups.get('アニメ書き出し'),dialog);moveSection(groups.get('書き出し'),dialog);
    const description=el('div','raster-source-description');railTitle.after(description);
    const updateSource=()=>{const active=find('#sources button.on');const generated=active?.dataset.s!=='image';description.textContent=generated?'模様を生成 → 質感を調整':'画像を読み込む → 質感を調整';documentTitle.querySelector('.ml-context').textContent=generated?'PATTERN / GENERATE':'IMAGE / PROCESS';};
    new MutationObserver(updateSource).observe(find('#sources'),{attributes:true,attributeFilter:['class'],subtree:true});updateSource();
    find('#recDur')?.setAttribute('aria-label','録画時間');find('#maskType')?.setAttribute('aria-label','マスクの形');
    find('#presetName')?.setAttribute('aria-label','プリセット名');find('#tokenIn')?.setAttribute('aria-label','設定トークン');
    find('#fg')?.setAttribute('aria-label','インク色');find('#bg')?.setAttribute('aria-label','背景色');
  }
  if(tool==='dither-svg'){
    const source=[...panel.querySelectorAll(':scope > .section')][0];moveSection(source,rail);source.querySelector('.body>div').hidden=true;source.querySelector('.body').prepend(el('h2','raster-section-title','素材'));
    const method=find('[data-sec="method"]');moveSection(method,rail);
    const adjust=find('[data-sec="adjust"]'),style=find('[data-sec="style"]'),peek=find('[data-sec="peek"]');
    peek.classList.add('collapsed');setTitle(peek,'のぞき窓（プレビューのみ）');
    const previewNote=note('ここでの変更は比較表示だけに反映されます。SVG・PNGの書き出しには含まれません。');
    tabs([['edit','変換・調整',[adjust,style]],['preview','表示設定',[previewNote,peek]]]);
    const output=find('[data-sec="export"]');moveSection(output,dialog);output.classList.remove('collapsed');setTitle(output,'ファイル形式');
    textOf(find('#btnDownloadSVG'),'SVGを書き出す');textOf(find('#btnDownloadPNG'),'PNGを書き出す');textOf(find('#btnCopySVG'),'SVGコードを表示');
    const empty=find('#emptyState');const text=empty.querySelector('.big')?.nextElementSibling;if(text)text.textContent='ここに画像をドロップするか、下のボタンから選択';
    const pick=action('画像を選択','btnPick');pick.classList.add('ml-primary');empty.append(pick);
    rail.append(note('素材 → 変換方式 → トーン調整。画像はサーバーに送信されません。'));
    const codeModal=find('#modalBg');codeModal.setAttribute('role','dialog');codeModal.setAttribute('aria-label','SVGコード');codeModal.setAttribute('aria-modal','true');
    const codeText=find('#modalText');codeText.setAttribute('aria-label','書き出し用SVGコード');
    // The legacy SVG-code modal must not remain behind the native export dialog.
    find('#btnCopySVG').addEventListener('click',()=>{if(codeModal.classList.contains('show')){dialog.close();requestAnimationFrame(()=>codeText.focus());}});
    new MutationObserver(()=>{if(!codeModal.classList.contains('show'))exportButton.focus();}).observe(codeModal,{attributes:true,attributeFilter:['class']});
    codeModal.addEventListener('keydown',e=>{
      e.stopPropagation();
      if(e.key==='Escape'){find('#modalClose').click();return;}
      if(e.key==='Tab'){
        const controls=[...codeModal.querySelectorAll('button,textarea')];const first=controls[0],last=controls.at(-1);
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
  }
  if(tool==='grid-stretch'){
    rail.remove();root.classList.add('raster-workspace-compact');
    const legacyHeader=panel.querySelector('header');if(legacyHeader)legacyHeader.hidden=true;
    const details=[...panel.querySelectorAll(':scope > details')];
    setTitle(details[0],'素材');setTitle(details[1],'グリッド');setTitle(details[2],'ストレッチ');
    tabs([['edit','調整',[details[0],details[1],details[2]]]]);
    moveSection(details[3],dialog);details[3].open=true;
    actions.insertBefore(action('画像を選択','upBtn'),actions.firstChild);
    const guide=el('div','raster-stage-guide');guide.id='rasterGridGuide';guide.setAttribute('role','status');stage.append(guide);
    const updateGuide=()=>guide.textContent=find('#manual').checked?'手動選択：クリックで行を選択・解除 / Shift + クリックで列を選択・解除':'画像をドロップ / 強度・方向を調整 / 手動モードで行と列を選択';
    find('#manual').addEventListener('change',updateGuide);updateGuide();find('#status').setAttribute('role','status');
  }
  if(tool==='effect-stack'){
    const legacyHeader=panel.querySelector('header');legacyHeader.classList.add('raster-generator');legacyHeader.querySelector('h1').hidden=true;legacyHeader.querySelector('p').hidden=true;
    moveSection(find('#secSrc'),rail);find('#secSrc').append(find('#fileImg'));moveSection(legacyHeader,rail);legacyHeader.prepend(el('h2','raster-section-title','バリエーション'));
    const project=section('作品設定');project.append(find('#btnJsonOut').parentElement,find('#fileJson'),note('JSONには効果の順序・数値・配色を保存します。画像・動画そのものは含まれません。'));
    const stack=find('#secStack');setTitle(stack,'効果を重ねる');stack.prepend(note('上から順に適用されます。効果をオンにし、矢印またはドラッグで順番を調整。'));
    tabs([['stack','スタック',[stack]],['finish','仕上げ',[find('#secFinish')]],['save','作品保存',[project]]]);
    moveSection(find('#secExport'),dialog);setTitle(find('#secExport'),'画像・動画');
    rail.append(note('効果は組み合わせたまま編集できます。現在の画像とスタックを見ながら調整してください。'));
    find('#seed')?.setAttribute('aria-label','生成シード');
  }
  if(tool==='pixel-gradient'){
    const project=[...panel.querySelectorAll(':scope > .section')][0];project.classList.add('raster-project-actions');moveSection(project,rail);
    const title=project.querySelector('.body>div');if(title)title.textContent='バリエーション・作品設定';
    const description=title?.nextElementSibling;if(description)description.textContent='色の配置を変えて、表現を探す';
    textOf(find('#btnRandom'),'配置をランダムに');textOf(find('#btnSave'),'設定を保存');textOf(find('#btnLoad'),'保存設定を読込');textOf(find('#btnReset'),'初期状態');
    project.querySelector('.body').append(note('「設定を保存」はこのブラウザ内への保存です。PNGの書き出しとは別です。'));
    moveSection(find('[data-sec="type"]'),rail);setTitle(find('[data-sec="type"]'),'グラデーション');
    moveSection(find('[data-sec="variations"]'),rail);setTitle(find('[data-sec="variations"]'),'配置の候補');
    const colors=find('[data-sec="colors"]'),texture=find('[data-sec="pixel"]'),canvas=find('[data-sec="canvas"]');
    setTitle(colors,'カラー');setTitle(texture,'ピクセル・質感');setTitle(canvas,'キャンバスサイズ');
    tabs([['color','カラー',[colors]],['texture','質感',[texture]],['canvas','サイズ',[canvas]]]);
    moveSection(find('[data-sec="export"]'),dialog);setTitle(find('[data-sec="export"]'),'PNG・設定データ');
  }

  // Keep original event handlers and provide keyboard access to legacy disclosure headings.
  document.querySelectorAll('.section[data-sec] > .head').forEach(head=>{
    head.tabIndex=0;head.setAttribute('role','button');head.setAttribute('aria-expanded',String(!head.parentElement.classList.contains('collapsed')));
    head.addEventListener('click',()=>head.setAttribute('aria-expanded',String(!head.parentElement.classList.contains('collapsed'))));
    head.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();head.click();}});
  });
  function labelControls(scope){
    scope.querySelectorAll('.fxrow').forEach(row=>{
      const name=row.querySelector('.fxname')?.textContent||'効果';
      row.querySelectorAll('.updn button').forEach((b,i)=>b.setAttribute('aria-label',name+(i===0?'を前に移動':'を後に移動')));
      row.querySelector('.chev')?.setAttribute('aria-label',name+'のパラメータを開閉');
    });
    scope.querySelectorAll('.color-card').forEach((card,i)=>card.querySelector('button')?.setAttribute('aria-label',`カラー ${i+1} を削除`));
    scope.querySelectorAll('input,select,textarea').forEach(input=>{
      if(input.hasAttribute('aria-label')||input.type==='file'||input.type==='hidden')return;
      const toggle=input.closest('.fxrow');
      if(toggle&&input.type==='checkbox'&&input.closest('.sw')){input.setAttribute('aria-label',toggle.querySelector('.fxname').textContent+'を有効にする');return;}
      const colorCard=input.closest('.color-card');
      if(colorCard){
        const index=[...colorCard.parentElement.children].indexOf(colorCard)+1;
        input.setAttribute('aria-label',`カラー ${index} ${input.type==='color'?'色を選択':input.type==='range'?(input.dataset.k==='x'?'横位置':input.dataset.k==='y'?'縦位置':'位置'):'カラーコード'}`);return;
      }
      if(input.closest('#palRow')){input.setAttribute('aria-label','パレット色 '+([...input.parentElement.querySelectorAll('input')].indexOf(input)+1));return;}
      if(input.closest('#customWH')&&input.type==='number'){input.setAttribute('aria-label',[...input.parentElement.querySelectorAll('input')].indexOf(input)===0?'キャンバス幅 px':'キャンバス高さ px');return;}
      if(input.closest('label'))return;
      let label=input.closest('.row')?.querySelector('label');
      if(!label)label=input.closest('.field')?.querySelector(':scope > label');
      if(!label)label=input.closest('.ctl')?.querySelector('.lab>span');
      if(!label)label=input.closest('.prow')?.querySelector(':scope > span');
      const text=label?.textContent.trim();if(text)input.setAttribute('aria-label',text);
    });
  }
  labelControls(body);
  if(tool==='effect-stack'||tool==='pixel-gradient'){
    const dynamic=tool==='effect-stack'?find('#stack'):find('#colorList');
    new MutationObserver(()=>labelControls(dynamic)).observe(dynamic,{childList:true,subtree:true});
  }
  const rec=find('#btnRec');if(rec){
    const sync=()=>{const active=/録画中/.test(rec.textContent);exportButton.textContent=active?'録画中… 開く':'書き出し ↗';exportButton.classList.toggle('raster-recording',active);};
    new MutationObserver(sync).observe(rec,{childList:true,characterData:true,subtree:true});sync();
  }
  const toast=find('#toast');if(toast){
    toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');
    // Keep the original success/error feedback visible above the modal backdrop.
    exportButton.addEventListener('click',()=>dialog.append(toast));
    dialog.addEventListener('close',()=>body.append(toast));
  }
  // Refit the unchanged canvas renderer after the shell has resized its stage.
  requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
  body.dataset.rasterReady='true';
})();
