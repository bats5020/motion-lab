/* Motion exporters: presentation adapters only. Original renderers/encoders remain authoritative. */
(function(root){
 'use strict';
 function install(){
  const api=root.MLExportUI,doc=root.document;if(!api||!doc)return;
  const tool=doc.body?.dataset.mlMotion;if(!tool)return;
  const $=s=>doc.querySelector(s),el=id=>$('#'+id),fmtId=f=>f.id;
  const ok=()=>({ok:true}),no=reason=>({ok:false,reason});
  const unavailable=()=>doc.body.classList.contains('ml-render-unavailable');
  const renderOK=()=>unavailable()?no('この環境では描画できないため、書き出しも停止しています。対応するPCブラウザで開いてください。'):ok();
  const capture=()=>typeof root.HTMLCanvasElement?.prototype?.captureStream==='function';
  const recorder=types=>!!(root.MediaRecorder&&capture()&&types.some(t=>{try{return root.MediaRecorder.isTypeSupported(t);}catch(_){return false;}}));
  const videoTypes=['video/mp4;codecs=avc1.640033','video/mp4;codecs=avc1.640028','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const videoOK=()=>{
   if(unavailable())return renderOK();
   return (root.VideoEncoder&&root.VideoFrame)||recorder(videoTypes)?ok():no('このブラウザでは動画を保存できません。PNG / ロスレスMOVなど、対応する形式を選んでください。');
  };
  const active=(id,value,attr='v')=>!!el(id)?.querySelector(`[data-${attr}="${value}"][aria-pressed="true"], [data-${attr}="${value}"].on, [data-${attr}="${value}"].active`);
  const wrap=(ui,label,id,note)=>ui.field(label,el(id),note);
  const range=(ui,label,id,note)=>ui.field(label,el(id)?.closest('.slider-row')||el(id),note);
  const staticFPS=ui=>ui.readout('FPS','不要','静止画にはフレームレートを指定しません。');
  const htmlFPS=ui=>ui.readout('FPS','自動','単体HTMLはブラウザの描画タイミングで再生します。動画用FPSは適用されません。');
  const selection=(id)=>el(id)?.querySelector('[aria-pressed="true"],.on,.active')?.dataset.v;
  const standard={id:tool,title:({'image-switcher':'Image Switcher','word-switcher':'Word Switcher','u19-tile-scroll':'U19 Tile Scroll','flame-transition':'Flame Transition','u19-hud-sequence':'U19 HUD Sequence'})[tool],trigger:'#mlMotionExport'};
  const fixedSize=(ui)=>wrap(ui,'サイズ','size','プレビュー品質とは別に、書き出しは指定サイズの等倍です。');
  const recording=()=>!!doc.querySelector('#mov.rec,#mp4.rec,#rec.rec,#exBtn.rec');
  let uiRef=null;
  if(tool==='image-switcher'){
   const alphaVideo=()=>{
    if(el('transparent')?.checked)return no('動画は透過に対応していません。「透過」をオフにするか、PNG / PNG連番 / 単体HTMLを選んでください。');
    return recorder(['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'])?ok():no('このブラウザでは動画を保存できません。PNG連番または単体HTMLを選んでください。');
   };
   api.register({...standard,formats:[
    {id:'png',label:'PNG · 静止画',button:'#exportPNG',handoff:true,note:'現在の瞬間を1枚保存します。'},
    {id:'video',label:'動画 · 自動（WebM / MP4）',button:'#exportVideo',handoff:true,available:alphaVideo,note:'対応形式を自動で選びます（WebM優先）。背景あり・音声なし。'},
    {id:'png-sequence',label:'PNG連番 · ZIP',button:'#pngSeq',handoff:true,note:'1巡をPNG連番で保存します。最大3600枚 / 400MB。'},
    {id:'html',label:'単体HTML · アニメーション',button:'#exportHTML',handoff:true,note:'画像を含む単体HTML。動画ファイルではありません。'}
   ],fields:{
    size:(f,ui)=>[wrap(ui,'サイズプリセット','size'),ui.group([wrap(ui,'幅 px','width'),wrap(ui,'高さ px','height')])],
    alpha:(f,ui)=>[wrap(ui,'透過','transparent',fmtId(f)==='video'?'動画は透過非対応です。オフにすると設定した背景色で保存します。':'背景を透明にします。元画像の不透明な部分は残ります。'),wrap(ui,'背景色','background','透過オフのときに使います。')],
    fps:(f,ui)=>fmtId(f)==='png'?staticFPS(ui):fmtId(f)==='html'?htmlFPS(ui):wrap(ui,'FPS','fps'),
    extra:(f,ui)=>[ui.readout('長さ',el('time')?.textContent?.split('/').pop()?.trim()||'現在の1巡',fmtId(f)==='png'?'現在の再生位置の1フレームです。':'始まり・終わりを含む現在のタイムラインを使います。'),ui.note('作品JSONの保存・読み込みは、編集画面の「作品・書き出し設定」から行えます。')]
   },status:['#status','#toast']});
  }
  if(tool==='word-switcher'){
   let exporting=false;
   // The legacy SVG button copies before opening code. Save the same markup without changing the clipboard.
   const svgSave=doc.createElement('button');svgSave.type='button';svgSave.id='mlWordSVGSave';svgSave.textContent='SVGを保存';
   svgSave.addEventListener('click',()=>{
    const svg=el('stageSvg');if(!svg)return;
    const url=root.URL.createObjectURL(new root.Blob([svg.outerHTML],{type:'image/svg+xml;charset=utf-8'}));
    const a=doc.createElement('a');a.href=url;a.download='frame.svg';a.click();root.setTimeout(()=>root.URL.revokeObjectURL(url),1000);
   });
   // Wrap the original async click promise, including final GIF encoding / ZIP assembly.
   for(const id of ['btnGIF','btnWebM','btnPNGSeq']){
    const button=el(id),original=button?.onclick;if(typeof original!=='function')continue;
    button.onclick=async function(event){
     if(exporting)return;exporting=true;uiRef?.refresh();
     try{return await original.call(this,event);}finally{exporting=false;uiRef?.refresh();}
    };
   }
   const isRaster=f=>['gif','webm','png-sequence'].includes(fmtId(f));
   const alpha=()=>active('bgMode','transparent','val');
   const webmOK=()=>alpha()?no('WebMは透過非対応です。「背景あり」にするか、GIF / PNG連番を選んでください。'):recorder(['video/webm;codecs=vp9','video/webm'])?ok():no('このブラウザはWebM録画に対応していません。GIF / PNG連番を選んでください。');
   api.register({...standard,busy:()=>exporting,formats:[
    {id:'gif',label:'GIF · アニメーション',button:'#btnGIF',note:'最大256色。透過はオン / オフの2段階で、半透明には対応しません。'},
    {id:'webm',label:'WebM · 動画',button:'#btnWebM',available:webmOK,note:'背景あり・音声なし。対応時はVP9、それ以外は標準WebMで保存します。'},
    {id:'png-sequence',label:'PNG連番 · ZIP',button:'#btnPNGSeq',note:'各フレームの色と透過を保つPNG連番です。'},
    {id:'svg',label:'SVG · 現在の静止画',button:()=>svgSave,note:'表示中のSVGをそのまま保存します。書き出し範囲・出力幅は適用しません。'},
    {id:'html',label:'単体HTML · アニメーション',button:'#btnDownloadHTML',note:'レスポンシブな単体HTML。動画用の範囲・幅・透過・FPSは適用しません。'}
   ],fields:{
    size:(f,ui)=>isRaster(f)?[wrap(ui,'範囲','exportRegion'),range(ui,'余白 px','padN'),wrap(ui,'出力幅 px','outW','0は自動（選択範囲の2倍）。高さは比率に合わせます。')]:ui.readout('サイズ',fmtId(f)==='svg'?'元のアートボード':'レスポンシブ','書き出し範囲・出力幅の設定は使いません。'),
    alpha:(f,ui)=>isRaster(f)?wrap(ui,'透過','bgMode',fmtId(f)==='webm'?'WebMは背景ありのみ対応します。':fmtId(f)==='gif'?'GIFは半透明を保持できません。':'PNGは半透明にも対応します。'):ui.readout('透過',fmtId(f)==='svg'?'元のSVGのまま':'非対応',fmtId(f)==='svg'?'元のSVGに含まれる背景は残ります。透過設定は適用しません。':'HTMLは「見た目」の背景色を使用します。'),
    fps:(f,ui)=>isRaster(f)?range(ui,'FPS','fpsN',fmtId(f)==='gif'?'10–60 fps。GIFの実際の間隔は1/100秒単位に丸められます。':'10–60 fps。'):fmtId(f)==='svg'?staticFPS(ui):htmlFPS(ui),
    extra:(f,ui)=>isRaster(f)?[range(ui,'長さ 秒','lenN','0は1巡。最大20秒を指定できます。'),ui.take('#exportProgress'),ui.note('この書き出し処理は途中キャンセルに対応していません。完了までお待ちください。')]:ui.note('「設定を保存」はブラウザ内の編集設定です。書き出しファイルとは別に保存されます。')
   },status:['#exportMsg','#toast'],afterOpen:(f,ui)=>{uiRef=ui;},beforeClose:()=>{uiRef=null;}});
  }
  if(tool==='u19-tile-scroll'||tool==='flame-transition'){
   const tile=tool==='u19-tile-scroll',videoId=tile?'mp4':'rec';
   const transparent=()=>selection('outSeg')===(tile?'tiles':'alpha');
   const opaqueVideo=()=>transparent()?no(tile?'動画は透過を保持できません。「シーンと合成」にするか、PNG / PNG連番 / ロスレスMOVを選んでください。':'動画は透過を保持できません。「シーンと合成」にするか、PNG / ロスレスMOVを選んでください。'):videoOK();
   const formats=[{id:'png',label:'PNG · 静止画',button:'#png',available:renderOK,note:'現在の瞬間を、指定サイズの1枚で保存します。'},
    {id:'mov',label:'MOV · ロスレス（PNG）',button:'#mov',available:renderOK,note:'PNGを格納したQuickTime MOVです。透過対応、最大1.5GB。'},
    {id:'video',label:'動画 · 自動（MP4 / WebM）',button:'#'+videoId,available:opaqueVideo,note:'H.264エンコーダを確認し、利用できない場合は対応するMP4 / WebM録画方式を使います。背景あり・音声なし。'}];
   if(tile)formats.push({id:'png-sequence',label:'PNG連番 · ZIP',button:'#zip',available:renderOK,note:'透過対応。コマごとのPNGをZIPにまとめます。最大1.5GB。'});
   api.register({...standard,formats,busy:recording,cancel:()=>doc.querySelector('#mov.rec,#mp4.rec,#rec.rec')?.click(),cancelLabel:'書き出しを中止',fields:{
    size:(f,ui)=>fixedSize(ui),
    alpha:(f,ui)=>[wrap(ui,'透過 / 合成','outSeg',fmtId(f)==='video'?'動画は透過を保持できません。シーンと合成を選んでください。':tile?'「タイルだけ」は背景を透明にして保存します。':'「炎だけ」は背景を透明にして保存します。'),...(tile?[wrap(ui,'タイルの地を抜く','alpha','タイルの地の色を取り除き、ロゴを残します。出力全体の透過とは別の設定です。')]:[])],
    fps:(f,ui)=>fmtId(f)==='png'?staticFPS(ui):tile?wrap(ui,'FPS','fpsSeg'):ui.readout('FPS','30 fps · 固定','このツールのアニメーションは30fpsで書き出します。'),
    extra:(f,ui)=>[...(tile&&fmtId(f)!=='png'?[wrap(ui,'書き出す範囲','rangeSeg')]:[]),ui.readout('長さ',el('meta')?.textContent||'現在のタイムライン',fmtId(f)==='png'?'現在の再生位置の1フレームです。':'編集したタイムラインの長さを使います。'),ui.note('書き出し中のボタンを押すとフレーム生成を中止できます。ファイルの最終処理中はすぐに中止できない場合があります。'),...(tile?[ui.note('編集設定JSONは、元の「設定」セクションから保存・読み込みできます。')]:[])]
   },status:['#toast']});
  }
  if(tool==='u19-hud-sequence'){
   api.register({...standard,busy:recording,cancel:()=>el('exBtn')?.classList.contains('rec')&&el('exBtn').click(),cancelLabel:'書き出しを中止',formats:[{id:'video',label:'動画 · 自動（MP4 / WebM）',button:'#exBtn',available:videoOK,note:'H.264を優先し、非対応時はブラウザが使えるMP4 / WebM録画方式で保存します。音声なし。'}],fields:{
    size:(f,ui)=>ui.readout('サイズ','1920 × 1080 px · 固定','HUDのレイアウトに合わせた16:9出力です。'),
    alpha:(f,ui)=>ui.readout('透過','非対応','黒背景を含む映像として保存します。'),
    fps:(f,ui)=>ui.readout('FPS','30 fps · 固定'),
    extra:(f,ui)=>[ui.readout('長さ',el('exInfo')?.textContent||'HUD 3.4秒 ＋ 映像 ＋ 0.5秒'),ui.note('書き出し中のボタンを押すと中止できます。エンコーダーの最終処理中はすぐに中止できない場合があります。')]
   },status:['#toast']});
  }
 }
 if(root.document?.readyState==='loading')root.document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(typeof window!=='undefined'?window:globalThis);
