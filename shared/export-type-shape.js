/* Export setup adapters only. Rendering, encoding and downloads stay in each tool. */
(function(root){
  'use strict';
  const VIDEO_MIMES=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];
  const EGG_VIDEO=[['mp4','MP4','video/mp4'],['webm-vp9','WebM · VP9','video/webm;codecs=vp9'],['webm-vp8','WebM · VP8','video/webm;codecs=vp8']];
  function supportsVideo(env,mimes=VIDEO_MIMES){
    return !!(env.MediaRecorder&&env.HTMLCanvasElement?.prototype?.captureStream&&mimes.some(mime=>{
      try{return env.MediaRecorder.isTypeSupported(mime);}catch{return false;}
    }));
  }
  function createConfig(kind,doc,env=root){
    const q=selector=>doc.querySelector(selector), fmtId=fmt=>typeof fmt==='string'?fmt:fmt.id;
    const opaque=(_fmt,ui)=>ui.readout('背景透過','非対応（背景込み）','このツールの書き出しは背景を含みます。');
    const stillFps=ui=>ui.readout('FPS','不要','静止画にはフレームレートを指定しません。');
    const htmlFps=ui=>ui.readout('FPS','再生環境に依存','HTMLはブラウザで再生します。固定FPSの動画ではありません。');
    const graphics=()=>{
      if(doc.body.dataset.mlUnavailable||kind==='egg-glass'&&q('#fallback')&&!q('#fallback').hidden)return {ok:false,reason:'WebGLの描画を開始できないため、この環境では書き出せません。対応ブラウザで開いてください。'};
      return {ok:true};
    };
    const ready=(selector,mimes)=>()=>{
      const gpu=graphics();if(!gpu.ok)return gpu;
      if(mimes&&!supportsVideo(env,mimes))return {ok:false,reason:'このブラウザはこの動画形式の録画に対応していません。'};
      const node=q(selector);if(!node)return {ok:false,reason:'書き出しの準備中です。'};
      if(node.disabled)return {ok:false,reason:node.title||'現在この書き出しは利用できません。'};
      return {ok:true};
    };
    const native=(id,label,selector,note,mimes)=>({id,label,button:()=>q(selector),note,available:ready(selector,mimes)});
    const trigger='#ml-export-jump,[data-ml-jump="export"]';
    if(kind==='ascii-wave')return {
      id:kind,title:'ASCII Wave · 書き出し',trigger,
      formats:[native('png','PNG','#btn-png','現在のフレームを保存します。'),native('webm','WebM','#btn-webm','実時間で録画します。途中で停止すると、そこまでの動画を保存します。',VIDEO_MIMES),native('html','HTML','#btn-code','素材不要の単体HTML。画面いっぱいに表示し、カーソル操作にも対応します。')],
      busy:()=>!!q('#btn-webm')?.classList.contains('rec-on'),
      fields:{
        size:(fmt,ui)=>fmtId(fmt)==='html'?ui.readout('サイズ','表示先の画面に追従','PNG・WebMの固定サイズ設定はHTMLには適用されません。'):[ui.field('比率','#i-aspect'),ui.field('幅（px）','#i-expw'),ui.field('高さ（px）','#i-exph')],
        alpha:opaque,
        fps:(fmt,ui)=>fmtId(fmt)==='webm'?ui.readout('FPS','60 fps（固定）','実時間録画のため、描画負荷によって実際のフレーム数は変わります。'):fmtId(fmt)==='html'?htmlFps(ui):stillFps(ui),
        extra:(fmt,ui)=>fmtId(fmt)==='webm'?[ui.field('長さ','#i-dur'),ui.readout('品質','12 Mbps（固定）'),ui.note('録画中は同じボタンで停止して保存できます。破棄する中止機能ではありません。')]:[]
      }
    };
    if(kind==='warp-type')return {
      id:kind,title:'Warp Type · 書き出し',trigger,
      formats:[native('png','PNG','#btn-png','現在のフレームを保存します。'),native('webm','WebM','#btn-webm','実時間録画。もう一度ボタンを押すと停止して保存します。',VIDEO_MIMES)],
      busy:()=>!!q('#btn-webm')?.classList.contains('rec-on'),
      fields:{
        size:(_fmt,ui)=>[ui.field('比率','#i-aspect'),ui.field('幅（px）','#i-expw'),ui.field('高さ（比率から計算）','#v-exp')],
        alpha:opaque,
        fps:(fmt,ui)=>fmtId(fmt)==='webm'?ui.readout('FPS','60 fps（固定）','実時間録画のため、描画負荷によって実際のフレーム数は変わります。'):stillFps(ui),
        extra:(fmt,ui)=>fmtId(fmt)==='webm'?[ui.readout('長さ','手動で停止するまで'),ui.readout('品質','12 Mbps（固定）'),ui.note('停止するとそこまでを保存します。破棄する中止機能ではありません。')]:[]
      }
    };
    if(kind==='u19-aberration'){
      let pngScale=1;
      const png=native('png','PNG','#btnPng1',()=>pngScale===2?'現在のフレームを幅・高さそれぞれ2倍で保存します。':'現在のフレームをキャンバスと同じサイズで保存します。');
      png.button=()=>q(pngScale===2?'#btnPng2':'#btnPng1');
      png.available=()=>ready(pngScale===2?'#btnPng2':'#btnPng1')();
      const multiplier=ui=>{
        const select=doc.createElement('select');select.dataset.mlHistoryIgnore='true';
        for(const [value,label]of [['1','1倍 · キャンバスと同じ'],['2','2倍 · 幅・高さを各2倍']]){const option=doc.createElement('option');option.value=value;option.textContent=label;select.append(option);}
        select.value=String(pngScale);select.addEventListener('change',event=>{pngScale=event.target.value==='2'?2:1;ui.refresh();});
        return ui.field('出力倍率',select,'PNGのみ。最大辺8192px。');
      };
      return {
      id:kind,title:'U19 Aberration · 書き出し',trigger,
      formats:[png,native('webm','WebM','#btnRec','ループONなら1周、OFFなら指定した録画秒数で自動停止します。',VIDEO_MIMES)],
      busy:()=>!!q('#btnRec')?.classList.contains('on'),status:['#rectime','#toast'],
      fields:{
        size:(fmt,ui)=>fmtId(fmt)==='png'?[ui.take('#sizeBlock'),multiplier(ui),ui.note(pngScale===2?'出力は上の設定の2倍です（最大辺8192px）。':'出力は上のキャンバス設定と同じサイズです。')]:[ui.take('#sizeBlock'),ui.note('出力は上のキャンバス設定と同じサイズです。')],
        alpha:opaque,
        fps:(fmt,ui)=>fmtId(fmt)==='webm'?ui.field('FPS',q('#recOpts .seg'),'実時間録画。30 / 60 fpsの目安です。'):stillFps(ui),
        extra:(fmt,ui)=>{
          if(fmtId(fmt)!=='webm')return [];
          const widgets=typeof UI!=='undefined'?UI:null;
          return [widgets?.loop?.row?ui.take(widgets.loop.row):ui.note('長さは編集パネルのループ設定に従います。'),widgets?.loopSec?.row?ui.take(widgets.loopSec.row):null,widgets?.recSec?.row?ui.take(widgets.recSec.row):ui.take(q('#recOpts .prow')),ui.note('ループON：ループ秒数を使用します。OFF：録画秒を使用します。途中停止は保存であり、破棄ではありません。'),ui.readout('品質','16 Mbps（固定）')].filter(Boolean);
        }
      }
      };
    }
    if(kind==='wireframe'){
      const isMotion=fmt=>['webm','png','gif'].includes(fmtId(fmt));
      const formats=[native('webm','WebM','.exp-card[data-exp="webm"]','1ループを実時間で録画します。',VIDEO_MIMES),native('png','PNG連番 · ZIP','.exp-card[data-exp="png"]','1ループを連番PNGにしてZIPにまとめます。'),native('gif','GIF','.exp-card[data-exp="gif"]','最大25 fps・200フレーム。長いループは再生時間が短くなります。'),native('svg','SVG','.exp-card[data-exp="svg"]','現在のフレームをベクター化します。粒子・ビネット等のラスタ処理は含みません。'),native('html','HTML','.exp-card[data-exp="html"]','ブラウザで再生するHTML。Three.jsのCDN読み込みにインターネット接続が必要です。')];
      const baseGif= formats[2].available;
      formats[2].available=()=>{const check=baseGif();return check.ok&&typeof env.GIF!=='function'?{ok:false,reason:'GIFライブラリを読み込めていません。接続を確認して再読み込みしてください。'}:check;};
      const basePng=formats[1].available;
      formats[1].available=()=>{const check=basePng();return check.ok&&typeof env.JSZip!=='function'?{ok:false,reason:'ZIPライブラリを読み込めていません。接続を確認して再読み込みしてください。'}:check;};
      return {
        id:kind,title:'Wireframe · 書き出し',trigger,formats,
        busy:()=>typeof exporting!=='undefined'&&exporting,status:['#expStatus'],
        fields:{
          size:(fmt,ui)=>fmtId(fmt)==='html'?ui.readout('サイズ','表示先の画面に追従','カメラの比率は現在の設定を使います。固定ピクセルサイズの動画ではありません。'):[ui.field('幅（px）','#resW'),ui.field('高さ（px）','#resH')],
          alpha:opaque,
          fps:(fmt,ui)=>isMotion(fmt)?[ui.field('FPS','#fpsSeg'),fmtId(fmt)==='gif'?ui.note('GIFの実効値は24選択時24 fps、30/60選択時25 fpsです。最大200フレームのため、長いループは短縮されます。'):ui.note('WebMは実時間録画。PNG連番は指定FPSで各フレームを描画します。')]:fmtId(fmt)==='html'?htmlFps(ui):stillFps(ui),
          extra:(fmt,ui)=>isMotion(fmt)?[ui.take('[data-ml-param="loopLength"]'),fmtId(fmt)==='webm'?ui.readout('品質','16 Mbps（固定）'):fmtId(fmt)==='gif'?ui.readout('品質','GIF品質 10（固定）'):ui.note('連番の枚数はループ秒数 × FPSです。'),ui.note('処理開始後の中止は未対応です。完了までこのタブを開いたままにしてください。')]:[]
        }
      };
    }
    if(kind==='egg-glass'){
      const syncSizeCaption=()=>{
        const width=Number(q('#preview-width')?.value),height=Number(q('#preview-height')?.value),caption=q('#export-size');
        if(caption&&Number.isFinite(width)&&Number.isFinite(height)&&width>0&&height>0)caption.textContent=`${width} × ${height} px`;
      };
      // Return controls to their native dialog before native locking/abort logic starts.
      const action=(selector,label)=>()=>{
        const button=doc.createElement('button');button.type='button';button.textContent=label;button.dataset.mlHistoryIgnore='true';
        button.addEventListener('click',()=>{syncSizeCaption();const dialog=q('#export-dialog');if(!dialog.open)dialog.showModal();q(selector)?.click();});
        return button;
      };
      const png={...native('png','PNG','#export-png','卵のみの透過PNGは透明な余白を自動トリミングします。'),button:action('#export-png','PNGを保存'),handoff:true};
      const video=EGG_VIDEO.map(([id,label,mime])=>({id,label,button:action('#export-video','動画を保存'),handoff:true,note:'背景込みで実時間収録します。開始後は進行状況・中止の画面に移ります。',available:()=>{
        const check=ready('#export-video',[mime])();if(!check.ok)return check;
        if(![...(q('#export-video-format')?.options||[])].some(option=>option.value===mime))return {ok:false,reason:'このブラウザの動画形式として初期化されていません。'};
        return {ok:true};
      },select:()=>{const select=q('#export-video-format');if(select)select.value=mime;}}));
      const html={...native('html','HTML','#export-html','3D・素材・設定を1ファイルにまとめます。単体で開き、スクロールやマウスで操作できます。'),button:action('#export-html','HTMLを保存'),handoff:true};
      return {
        id:kind,title:'Egg Glass · 書き出し',trigger:'#export-open',formats:[png,...video,html],
        prepare:ui=>{if(graphics().ok){ui.nativeClick(q('#export-open'));q('#export-dialog')?.close();}},
        actions:[{label:'フレームを確認',button:action('#export-frame-preview','フレームを確認'),handoff:true,when:fmt=>fmtId(fmt)==='png',available:ready('#export-frame-preview')}],
        fields:{
          size:(fmt,ui)=>fmtId(fmt)==='html'?ui.readout('サイズ','現在の表示設定を保存','PC / SP別設定が有効なら、表示先の画面幅に応じて切り替わります。'):[ui.field('サイズ','#preview-preset'),ui.field('幅（px）','#preview-width'),ui.field('高さ（px）','#preview-height'),ui.note('透過PNGはこの描画サイズから卵の外周に合わせて切り抜くため、保存サイズが小さくなります。')],
          alpha:(fmt,ui)=>fmtId(fmt)==='png'?ui.field('背景透過','#export-png-target','「卵のみ」は背景透過＋透明な余白の自動トリミング。「卵＋背景」は透過なし。'):opaque(fmt,ui),
          fps:(fmt,ui)=>fmtId(fmt)==='png'?stillFps(ui):fmtId(fmt)==='html'?htmlFps(ui):ui.field('FPS','#export-fps','実時間録画の目安です。描画負荷により実際のフレーム数は変わります。'),
          extra:(fmt,ui)=>{
            if(fmtId(fmt)==='png')return [ui.field('保存フレーム（%）','#export-frame'),ui.take('#export-frame-current'),ui.note('保存開始後は元の書き出し画面で結果を確認できます。')];
            if(fmtId(fmt)==='html')return ui.note('HTMLには編集用UIも含まれます。@キーで表示を切り替えられます。');
            return [ui.field('開始（%）','#export-start'),ui.field('終了（%）','#export-end'),ui.field('長さ（秒）','#export-duration'),ui.readout('品質','8〜40 Mbps（サイズ・FPSから自動）'),ui.note('開始と終了を異なる値にしてください。書き出し中のタブ切替は中止になります。開始後の画面で中止できます。')];
          }
        }
      };
    }
    return null;
  }
  if(typeof module==='object'&&module.exports)module.exports={createConfig,supportsVideo,VIDEO_MIMES,EGG_VIDEO};
  if(!root.document||!root.MLExportUI)return;
  const kind=root.document.body.dataset.mlEditor||(root.document.body.classList.contains('ml-egg-workbench')?'egg-glass':'');
  const config=createConfig(kind,root.document,root);if(config)root.MLExportUI.register(config);
})(typeof window==='object'?window:globalThis);
