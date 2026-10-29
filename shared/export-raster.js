/* Export presentation only. Native nodes, callbacks, renderers and encoders are retained. */
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector);
  const tool=document.body.dataset.rasterTool||document.body.dataset.materialTool;
  const supported=['halftone-lab','dither-svg','grid-stretch','effect-stack','pixel-gradient','glass-lab','smearworks'];
  if(!supported.includes(tool))return;
  const formatId=fmt=>typeof fmt==='string'?fmt:fmt.id;
  const model=()=>window.MLRasterModel||window.MLMaterialModel;
  const snapshot=()=>{try{return model()?.capture()||{};}catch(_){return {};}};
  const values=()=>{const s=snapshot();return s.values||s;};
  const sizeText=(w,h)=>Number(w)>0&&Number(h)>0?`${Math.round(w)} × ${Math.round(h)} px`:'素材を読み込んでください';
  const canvasSize=selector=>{const c=$(selector);return sizeText(c?.width,c?.height);};
  const ok=()=>({ok:true});
  const graphics=()=>document.body.dataset.graphicsStatus==='unavailable'?{ok:false,reason:'WebGL が利用できないため、この環境では描画・書き出しできません。'}:ok();
  const mimes=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm','video/mp4'];
  function recordingSupport(){
    const canvas=$('#view'),Recorder=window.MediaRecorder;
    if(!Recorder||typeof Recorder.isTypeSupported!=='function'||!canvas||typeof canvas.captureStream!=='function')return {ok:false,reason:'このブラウザは Canvas の動画録画に対応していません。'};
    const mime=mimes.find(type=>Recorder.isTypeSupported(type));
    return mime?{ok:true,mime}:{ok:false,reason:'このブラウザには対応する WebM / MP4 エンコーダーがありません。'};
  }
  function videoAvailable(){
    const gpu=graphics();if(!gpu.ok)return gpu;
    if(tool==='effect-stack'&&(values().src?.type!=='video'||$('#recRow')?.style.display==='none'))return {ok:false,reason:'動画素材を読み込んだときだけ録画できます。'};
    return recordingSupport();
  }
  const videoNote=()=>{
    const support=recordingSupport();if(!support.ok)return support.reason;
    const format=support.mime.startsWith('video/mp4')?'MP4':support.mime.includes('vp9')?'WebM / VP9':support.mime.includes('vp8')?'WebM / VP8':'WebM';
    return `このブラウザでは ${format} を自動選択します。音声は含まれません。`;
  };
  const stillFPS=(fmt,ui)=>ui.readout('FPS','不要（静止画）','静止画にフレームレートはありません。');
  const opaque=(fmt,ui)=>ui.readout('背景透過','非対応（背景あり）','このツールの描画は背景を含みます。PNG を選んでも背景は透明になりません。');
  const busy=()=>!!model()?.isBusy?.();
  const copyAvailable=()=>window.ClipboardItem&&navigator.clipboard?.write?ok():{ok:false,reason:'このブラウザでは画像のクリップボード書き込みを利用できません。'};
  const cfg={id:tool,title:({'halftone-lab':'Halftone Lab','dither-svg':'Dither → SVG','grid-stretch':'Grid Stretch','effect-stack':'Effect Stack','pixel-gradient':'Pixel Gradient','glass-lab':'Glass Lab','smearworks':'Smearworks'})[tool],trigger:tool==='glass-lab'||tool==='smearworks'?'#mlExport':'#rasterExport',busy,status:['#toast','#status'],formats:[],fields:{alpha:opaque,fps:stillFPS}};
  if(tool==='halftone-lab'){
    const ready=()=>/\d+/.test($('#exRes')?.textContent||'')?ok():{ok:false,reason:'先に画像を読み込むか、生成ソースを選んでください。'};
    cfg.formats=[
      {id:'png',label:'PNG',button:'#btnPng',available:ready},
      {id:'svg',label:'SVG',button:'#btnSvg',available:()=>values().effect==='ascii'?{ok:false,reason:'ASCII は SVG に対応していません。PNG または HTML を選んでください。'}:(['halftone','dither'].includes(values().effect)&&values().melt>0)?{ok:false,reason:'メルトはラスター専用です。SVG に含まれないため、PNG を選ぶかメルトを 0 にしてください。'}:ready()},
      {id:'video',label:'動画（WebM / MP4 自動）',button:'#btnRec',available:()=>{const source=ready();return source.ok?videoAvailable():source;},note:videoNote},
      {id:'html',label:'HTML / JavaScript',button:'#btnCode',note:()=>values().source==='image'?'画像は HTML に埋め込まれません。書き出したコードの YOUR_IMAGE.jpg をご自分の画像パスに置き換えてください。':'生成パターンを再現する単体 HTML です。依存ライブラリは不要です。'}
    ];
    cfg.fields.size=(fmt,ui)=>formatId(fmt)==='video'||formatId(fmt)==='html'?ui.readout('出力サイズ',canvasSize('#view'),formatId(fmt)==='video'?'現在の作業キャンバスを録画します。PNG / SVG の原寸サイズとは異なります。':'作業キャンバスサイズで再生します。'):ui.take('#exRes');
    cfg.fields.fps=(fmt,ui)=>formatId(fmt)==='video'?ui.readout('FPS','30（固定）','実時間録画です。処理負荷により実際のフレーム間隔が変わります。'):formatId(fmt)==='html'?ui.readout('FPS','ブラウザの描画タイミング','HTML のアニメーションは requestAnimationFrame で再生します。固定 FPS の動画ではありません。'):stillFPS(fmt,ui);
    cfg.fields.extra=(fmt,ui)=>formatId(fmt)==='video'?[ui.field('長さ','#recDur'),ui.readout('画質','8 Mbps（固定）'),ui.note('録画は指定時間で終了します。途中停止・キャンセルには対応していません。')]:formatId(fmt)==='svg'?ui.note('静止した現在の状態をベクターで保存します。'):[];
    cfg.actions=[{label:'PNG をコピー',button:'#btnCopy',available:copyAvailable}];
  }
  if(tool==='dither-svg'){
    const ready=()=>((window.MLDitherExport?.isReady?window.MLDitherExport.isReady():!!$('#svgHolder svg')&&!$('#busy')?.classList.contains('show'))&&!$('#btnDownloadSVG')?.disabled)?ok():{ok:false,reason:'先に画像を読み込み、変換が終わるまでお待ちください。'};
    cfg.formats=[{id:'svg',label:'SVG',button:'#btnDownloadSVG',available:ready},{id:'png',label:'PNG',button:'#btnDownloadPNG',available:ready}];
    cfg.fields.size=(fmt,ui)=>{
      const dimensions=()=>{const state=snapshot(),image=state.image,w=Number((state.values||state).res)||160,h=image?Math.max(8,Math.round(w*image.height/image.width)):0,scale=formatId(fmt)==='png'?Math.max(1,Math.round(1200/w)):1;return {w,h,scale};};
      return [ui.readout('出力サイズ',()=>{const {w,h,scale}=dimensions();return h?sizeText(w*scale,h*scale):'素材を読み込んでください';},()=>formatId(fmt)==='png'?`SVG を整数 ${dimensions().scale} 倍で PNG にします。処理解像度は「解像度・トーン調整」で変更できます。`:'横ピクセル数は「解像度・トーン調整」で変更できます。SVG はベクターとして拡大できます。'),ui.note('のぞき窓はプレビュー専用です。SVG / PNG には含まれません。')];
    };
    cfg.fields.alpha=(fmt,ui)=>ui.take($('#transBg')?.closest('label'));
    cfg.actions=[{label:'SVG コードを表示',button:'#btnCopySVG',available:ready,handoff:true}];
  }
  if(tool==='grid-stretch'){
    cfg.formats=[{id:'png',label:'PNG',button:'#pngBtn'},{id:'jpeg',label:'JPEG',button:'#jpgBtn'}];
    cfg.fields.size=(fmt,ui)=>{return ui.readout('出力サイズ',()=>{const s=snapshot().source;return sizeText(s?.width,s?.height);},'ソースの処理解像度をそのまま使用します。読み込み時に長辺 4000 px まで縮小されます。');};
    cfg.fields.alpha=(fmt,ui)=>ui.readout('背景透過',formatId(fmt)==='png'?'元画像の透明部分を保持':'非対応（JPEG）',formatId(fmt)==='png'?'背景を消す機能ではありません。グリッド線・注釈は画像に含まれます。':'JPEG は透明部分を保持できません。透明部分が必要な場合は PNG を選んでください。');
    cfg.fields.extra=(fmt,ui)=>[...(formatId(fmt)==='jpeg'?[ui.take($('#jpgq')?.closest('.ctl'))]:[]),ui.note('グリッド線・注釈は現在の表示設定で書き出します。手動選択のガイドだけは含みません。')];
    cfg.actions=[{label:'PNG をコピー',button:'#copyBtn',available:copyAvailable}];
  }
  if(tool==='effect-stack'||tool==='glass-lab'){
    cfg.formats=[{id:'png',label:'PNG',button:'#btnPng',available:graphics},{id:'video',label:'動画（WebM / MP4 自動）',button:'#btnRec',available:videoAvailable,note:videoNote}];
    cfg.fields.size=(fmt,ui)=>formatId(fmt)==='video'?ui.readout('録画サイズ',canvasSize('#view'),tool==='effect-stack'?'現在のプレビュー解像度を録画開始時に固定します。処理負荷により PNG より小さい解像度になります。':'プレビュー解像度（長辺最大 1100 px）で録画します。PNG の設定サイズとは異なります。'):ui.take('#sizeBlock');
    cfg.fields.fps=(fmt,ui)=>formatId(fmt)==='video'?ui.readout('FPS',tool==='effect-stack'?'30（固定）':'60（固定）','実時間録画です。処理負荷により実際のフレーム間隔が変わります。'):stillFPS(fmt,ui);
    cfg.fields.extra=(fmt,ui)=>formatId(fmt)==='video'?[
      tool==='glass-lab'?ui.take('#recDurRow'):ui.readout('長さ','動画素材の 1 ループ（最大 60 秒）','再生時間を取得できない素材は 10 秒で終了します。'),
      ui.readout('画質',tool==='glass-lab'?'10 Mbps（固定）':'8 Mbps（固定）'),
      ui.note('録画中のボタンをもう一度押すと、その時点までを停止して保存します。破棄するキャンセルではありません。')
    ]:[];
    cfg.actions=[{label:'PNG をコピー',button:'#btnCopy',available:()=>{const g=graphics();return g.ok?copyAvailable():g;}}];
  }
  if(tool==='pixel-gradient'){
    let multiplier=1;
    cfg.formats=[{id:'png',label:'PNG',button:()=>$('#btnPNG'+multiplier)}];
    cfg.fields.size=(fmt,ui)=>{
      const scale=document.createElement('select');scale.setAttribute('aria-label','書き出し倍率');
      [1,2,4].forEach(value=>{const option=document.createElement('option');option.value=String(value);option.textContent='×'+value;scale.append(option);});scale.value=String(multiplier);
      scale.addEventListener('change',()=>{multiplier=Number(scale.value);ui.refresh();});
      return [ui.readout('出力サイズ',()=>{const resolution=values().res||{};return sizeText(resolution.w*multiplier,resolution.h*multiplier);},'基本の幅・高さは編集画面の「サイズ」で変更できます。'),ui.field('倍率',scale,'ピクセルの角を保った整数倍拡大です。大きいサイズはブラウザのメモリ上限に達することがあります。')];
    };
    // Settings export is not a rendered-media format. Keep it reachable outside the old dialog.
    cfg.prepare=()=>{const button=$('#btnCopyJSON'),host=$('.raster-project-actions .body');if(button&&host&&!host.contains(button))host.append(button);};
  }
  if(tool==='smearworks'){
    cfg.formats=[{id:'png',label:'PNG',button:'#export',available:graphics,handoff:true}];
    cfg.fields.size=(fmt,ui)=>ui.readout('出力サイズ','切り抜き範囲から自動計算','長辺は通常 2000〜4096 px。切り抜きの縦横比を保ち、GPU の最大テクスチャサイズを超えない範囲で決まります。');
    cfg.fields.extra=(fmt,ui)=>ui.note('書き出し開始時に実際のピクセル数を表示します。処理中のキャンセルには対応していません。');
  }
  function register(){if(window.MLExportUI)window.MLExportUI.register(cfg);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',register,{once:true});else register();
})();
