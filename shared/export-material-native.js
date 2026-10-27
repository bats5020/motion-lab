/* Export adapters for the two native GPU studios. No render/encoder implementation is replaced. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s),safe=(fn,fallback)=>{try{return fn();}catch(_){return fallback;}},byText=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
  const recorder=()=>!!window.MediaRecorder&&['video/webm;codecs=vp9','video/webm'].some(t=>MediaRecorder.isTypeSupported(t));
  function init(){
    const kit=window.MLExportUI;if(!kit)return;
    if(document.body.dataset.materialTool==='thermal-flow'){
      let multiplier=1;
      const lookup=text=>()=>byText(text),still=f=>['png','jpeg','webp','slits'].includes(f.id);
      kit.register({id:'thermal-flow',title:'Thermal Flow',trigger:'#mlExport',
        formats:[
          {id:'png',label:'PNG',button:()=>$('#btnPng'+multiplier),note:'現在のフレーム。マスクがある場合は作品の範囲に自動トリミングします。'},
          {id:'jpeg',label:'JPG',button:lookup('JPG'),note:'マスク背景色で合成します。透過は含まれません。'},
          {id:'webp',label:'WebP',button:lookup('WebP'),note:'現在のフレーム。ブラウザの画像エンコーダーを使用します。'},
          {id:'zip',label:'PNG連番 ZIP',button:lookup('連番PNG ZIP'),handoff:true,note:'全フレームを描画します。512MBを超えると停止します。'},
          {id:'mov',label:'MOV · PNGロスレス',button:lookup('ロスレスMOV'),handoff:true,note:'PNG圧縮の編集用動画。透過対応。容量が大きくなります（上限512MB）。'},
          {id:'webm',label:'WebM · 実時間',button:()=>safe(()=>UI.motRecRow.querySelector('button'),null),available:()=>!recorder()?{ok:false,reason:'このブラウザはWebM録画に対応していません。'}:safe(()=>state.mask.on&&state.mask.transparent||isCircularFrame()||state.studio.image.on&&state.studio.image.mode==='mask',false)?{ok:false,reason:'WebMは透過を保証できません。透過作品にはMOVまたはPNG連番を選んでください。'}:!safe(()=>state.motion.on&&state.motion.loop,false)?{ok:false,reason:'編集画面でモーションとシームレスループをオンにしてください。'}:{ok:true},note:'1ループを実時間録画します。途中で中止する機能はありません。音声なし。'},
          {id:'html',label:'HTML · 単体で再生',button:'#btnHtml',note:'動き・読み込んだ画像を1ファイルに含めます。編集UIは入りません。'},
          {id:'slits',label:'スリット別 PNG ZIP',button:lookup('スリット別PNG ZIP'),handoff:true,available:()=>safe(()=>state.studio.slit.on&&state.studio.slit.type==='linear',false)?{ok:true}:{ok:false,reason:'詳細設定で直線スリットを有効にしてください。'},note:'各スリットを個別PNGにします。'}
        ],
        fields:{
          size:(f,ui)=>{const scale=document.createElement('select');scale.setAttribute('aria-label','書き出し倍率');for(const n of [1,2,4]){const o=document.createElement('option');o.value=n;o.textContent='×'+n;scale.append(o);}scale.value=String(multiplier);scale.addEventListener('change',()=>{multiplier=+scale.value;ui.refresh();});return [f.id==='png'?ui.field('倍率',scale):null,$('#sizeBlock')?.children.length?ui.take('#sizeBlock'):ui.readout('キャンバス','描画環境の確認後に設定できます'),ui.note(still(f)?'マスク使用時は透明な余白を自動で除きます。倍率とGPU上限により実際の出力寸法が変わります。':'キャンバス全体を書き出します。GPUの最大描画サイズが上限です。')];},
          alpha:(f,ui)=>f.id==='jpeg'?ui.readout('透過','非対応','設定中のマスク背景色で合成します。'):safe(()=>state.mask.on,false)?[ui.take(safe(()=>UI.maskTrans.row,null)),ui.note('作品のマスク・画像マスク・円形フレームの設定を使用します。')]:ui.readout('透過','作品の形状に従う','円形フレームや画像マスクの透明部分を保持します。通常の背景は不透明です。'),
          fps:(f,ui)=>still(f)?ui.readout('FPS','不要 — 静止画'):f.id==='webm'?ui.readout('FPS','30 fps 固定','実時間録画のため、描画負荷で収録時間が延びる場合があります。'):[$('#motionOpts select[aria-label="フレームレート"]')?ui.field('FPS','#motionOpts select[aria-label="フレームレート"]'):ui.readout('FPS',safe(()=>state.studio.animation.fps+' fps','24 / 30 / 60 fps')),f.id==='html'?ui.note('HTMLはこの上限フレームレートでブラウザ再生します。動画ファイルではありません。'):ui.note('1秒あたりの描画フレーム数です。')],
          extra:(f,ui)=>{const nodes=[];if(!still(f))nodes.push(ui.readout('長さ',safe(()=>state.motion.loopSec+' 秒','ループの長さ')));if(['jpeg','webp'].includes(f.id)){const label=[...document.querySelectorAll('.studio-range')].find(n=>n.textContent.includes('JPG / WebPの品質'));if(label)nodes.push(ui.take(label));}if(f.id==='slits')nodes.push(ui.take($('#slitTrim')?.parentElement));if($('#exportFileName'))nodes.push(ui.field('ファイル名','#exportFileName'));return nodes;}
        },
        busy:()=>safe(()=>_recording,false),status:['#exportProgress','#toast'],actions:[{label:'画像をコピー',button:'#btnCopy'}]
      });
    }
    if($('#wbExport')&&$('#exportMount')){
      kit.register({id:'heatmap-blur',title:'Heatmap Blur',trigger:'#wbExport',
        formats:[
          {id:'png',label:'PNG',button:'#png',note:'現在のフレームを等倍で保存します。'},
          {id:'mov',label:'MOV · PNGロスレス',button:'#mov',note:'透過対応の編集用動画。音声なし。1.5GBを超えると停止します。'},
          {id:'video',label:'MP4 / WebM · 自動',button:'#rec',available:()=>safe(()=>S.bg==='alpha',false)?{ok:false,reason:'この動画形式は透過非対応です。透過を黒または色に切り替えるか、MOVを選んでください。'}:safe(()=>S.src==='video'&&!MP4.ok,false)?{ok:false,reason:'読み込んだ動画の変換にはH.264エンコーダーが必要です。MOVを使用してください。'}:safe(()=>MP4.ok||!!pickMime(),false)?{ok:true}:{ok:false,reason:'このブラウザは対応動画エンコーダーを利用できません。'},note:'対応環境はMP4/H.264を1コマずつ生成。その他はMP4/WebM実時間録画（音声なし）。'}
        ],
        fields:{size:(f,ui)=>ui.field('出力サイズ','#size','プレビューの軽量/等倍設定とは別です。'),alpha:(f,ui)=>[ui.take($('#bgSeg')?.parentElement),ui.note(f.id==='video'?'MP4 / WebMは透過非対応です。':'PNG・MOVは「透過」を選ぶと透明背景を保持します。')],fps:(f,ui)=>ui.readout('FPS',f.id==='png'?'不要 — 静止画':'30 fps 固定'),extra:(f,ui)=>f.id==='png'?null:ui.readout('長さ',safe(()=>S.len+' 秒','タイムラインで設定'),'動画ソースでは素材の長さが上限です。書き出し中の同じボタンで中止できます。')},
        busy:()=>safe(()=>!!recording,false),cancel:()=>safe(()=>finishRec(),null),status:['#toast'],
      });
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
