import * as THREE from './vendor/three.module.js';
import {sampleKeyframes} from './keyframes.js';
import {buildHtml} from './html-export.js';
import {withWebmDuration} from './webm-duration.js';

export function setupExports({renderer,scene,camera,egg,pivot,root,state,scrollControls,svgBackground,previewViewport,lightingControls,patternControls,logoControls,resize}) {
  const dialog=document.querySelector('#export-dialog'),status=document.querySelector('#export-status'),progress=document.querySelector('#export-progress');
  let busy=false,abort=null;
  const supported=typeof MediaRecorder!=='undefined'?[
    ['video/mp4','MP4'],['video/webm;codecs=vp9','WebM (VP9)'],['video/webm;codecs=vp8','WebM (VP8)']
  ].filter(([mime])=>MediaRecorder.isTypeSupported(mime)):[];
  const format=document.querySelector('#export-video-format');supported.forEach(([mime,label])=>format.add(new Option(label,mime)));
  if(!supported.length){document.querySelector('#export-video').disabled=true;document.querySelector('#video-support').textContent='このブラウザでは動画を書き出せません。';}
  function currentPercent(){return Math.round((scrollControls.preview??(state.mode==='auto'?0:state.scroll))*1000)/10;}
  document.querySelector('#export-open').addEventListener('click',()=>{
    document.querySelector('#export-frame').value=currentPercent();
    document.querySelector('#export-size').textContent=`${previewViewport.size.width} × ${previewViewport.size.height} px`;
    status.textContent='PNGは卵のみ・背景込みを選べます。動画とHTMLは背景込みです。編集UIは入りません。';dialog.showModal();
  });
  document.querySelector('#export-close').addEventListener('click',()=>{if(!busy)dialog.close();});
  dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();abort?.abort();}});
  document.querySelector('#export-cancel').addEventListener('click',()=>abort?.abort());
  document.addEventListener('visibilitychange',()=>{if(busy&&document.hidden)abort?.abort();});
  function number(id,min,max){const input=document.querySelector('#'+id),value=input.valueAsNumber;if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${input.dataset.label}は${min}〜${max}で指定してください`);return value;}
  function download(blob,name){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function trimTransparent(canvas) {
    const {width,height}=canvas,source=canvas.getContext('2d').getImageData(0,0,width,height);
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      if(source.data[(y*width+x)*4+3]===0)continue;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw new Error('指定フレームに卵が写っていません。位置・スケール・フレームを調整してください');
    const cropped=document.createElement('canvas');cropped.width=right-left+1;cropped.height=bottom-top+1;
    // Keep even the faintest antialiased edge; no scaling or alpha threshold.
    cropped.getContext('2d').putImageData(source,-left,-top);
    return cropped;
  }
  function setBusy(value) {
    busy=value;state.exporting=value;
    dialog.querySelectorAll('input,select,button').forEach(element=>{element.disabled=value;});
    document.querySelector('#export-cancel').disabled=false;document.querySelector('#export-cancel').hidden=!value;
    progress.hidden=!value;if(value)progress.value=0;
    if(!value&&!supported.length)document.querySelector('#export-video').disabled=true;
  }
  function capture() {
    const {width,height}=previewViewport.size;
    const snapshot={rotation:egg.rotation.clone(),pivot:pivot.rotation.clone(),rootPosition:root.position.clone(),rootScale:root.scale.clone(),preview:scrollControls.preview};
    renderer.setPixelRatio(1);renderer.setSize(width,height,false);
    const config=structuredClone(scrollControls.config),base=state.rotation,pointer={x:state.pointerX,y:state.pointerY},mode=state.mode;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d');
    return {
      canvas,width,height,
      render(percent,seconds=0,{eggOnly=false}={}) {
        const pose=sampleKeyframes(config,percent),viewHeight=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z;
        root.position.set(pose.x*viewHeight*camera.aspect/100,pose.y*viewHeight/100,0);root.scale.setScalar(pose.scale/100);
        svgBackground.apply(sampleKeyframes(config.background,percent),config.background);
        egg.rotation.y=base+(mode==='scroll'?0:seconds*.14)+percent/100*Math.PI*1.35+(mode==='blend'?pointer.x*.22:0);
        pivot.rotation.x=mode==='blend'?pointer.y*.11:0;pivot.rotation.z=-.055+percent/100*.18;
        // Keep the environment lighting, but remove artwork from transmission as well.
        const background=scene.background,visible=svgBackground.group.visible;
        const clearColor=renderer.getClearColor(new THREE.Color()),clearAlpha=renderer.getClearAlpha();
        const material=egg.material,premultipliedAlpha=material.premultipliedAlpha;
        const exportPremultiplied=renderer.getContext().getContextAttributes().premultipliedAlpha;
        try {
          if(eggOnly){
            scene.background=null;svgBackground.group.visible=false;renderer.setClearColor(0x000000,0);
            // Match the canvas alpha convention to avoid washed-out glass RGB on copy.
            if(material.premultipliedAlpha!==exportPremultiplied){material.premultipliedAlpha=exportPremultiplied;material.needsUpdate=true;}
          }
          renderer.render(scene,camera);
          context.clearRect(0,0,width,height);context.drawImage(renderer.domElement,0,0,width,height);
        }finally{
          scene.background=background;svgBackground.group.visible=visible;renderer.setClearColor(clearColor,clearAlpha);
          if(material.premultipliedAlpha!==premultipliedAlpha){material.premultipliedAlpha=premultipliedAlpha;material.needsUpdate=true;}
        }
      },
      restore(){egg.rotation.copy(snapshot.rotation);pivot.rotation.copy(snapshot.pivot);root.position.copy(snapshot.rootPosition);root.scale.copy(snapshot.rootScale);scrollControls.setPreview(snapshot.preview);}
    };
  }
  async function run(action) {
    if(busy)return;abort=new AbortController();setBusy(true);
    let session;
    try {
      session=capture();await action(session,abort.signal);
    }catch(error){status.textContent=error.name==='AbortError'?'書き出しを中止しました。':`書き出せませんでした：${error.message}`;}
    finally{session?.restore();setBusy(false);resize();abort=null;}
  }
  document.querySelector('#export-frame-current').addEventListener('click',()=>{document.querySelector('#export-frame').value=currentPercent();});
  document.querySelector('#export-frame-preview').addEventListener('click',()=>{
    try {
      const percent=number('export-frame',0,100);
      if(!state.paused)document.querySelector('#pause').click();
      state.exporting=true;const session=capture();scrollControls.setPreview(percent/100);session.render(percent);dialog.close();
    }catch(error){status.textContent=error.message;}
    finally{state.exporting=false;resize();}
  });
  document.querySelector('#export-png').addEventListener('click',()=>run(async(session,signal)=>{
    const percent=number('export-frame',0,100),eggOnly=document.querySelector('#export-png-target').value==='egg';session.render(percent,0,{eggOnly});
    const output=eggOnly?trimTransparent(session.canvas):session.canvas;
    const blob=await new Promise((resolve,reject)=>output.toBlob(blob=>blob?resolve(blob):reject(new Error('PNGを作成できませんでした')),'image/png'));
    signal.throwIfAborted();download(blob,`u19-${eggOnly?'egg-transparent':'frame'}-${percent}pct-${output.width}x${output.height}.png`);status.textContent=eggOnly?`${percent}%の卵のみをトリミングし、${output.width} × ${output.height} pxの背景透過PNGで保存しました。`:`${percent}%のフレームをPNGで保存しました。`;
  }));
  document.querySelector('#export-video').addEventListener('click',()=>run(async(session,signal)=>{
    const start=number('export-start',0,100),end=number('export-end',0,100),duration=number('export-duration',1,30),fps=+document.querySelector('#export-fps').value;
    if(start===end)throw new Error('開始と終了の%を変えてください');
    const mime=format.value;session.render(start);
    const stream=session.canvas.captureStream(fps);let recorder,animation;
    try {
      recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(40000000,Math.max(8000000,session.width*session.height*fps*.2))});
      const chunks=[];
      const stopped=new Promise((resolve,reject)=>{recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.onstop=resolve;recorder.onerror=event=>reject(event.error??new Error('動画エンコーダーが停止しました'));});
      // Attach a handler immediately, including while the animation is running.
      stopped.catch(()=>{});
      const recordingStart=performance.now();recorder.start(200);
      await new Promise((resolve,reject)=>{
        const began=performance.now();let last=-Infinity;
        function cleanup(){signal.removeEventListener('abort',cancel);recorder.removeEventListener('error',failed);}
        function fail(error){cancelAnimationFrame(animation);cleanup();reject(error);}
        const cancel=()=>fail(new DOMException('Cancelled','AbortError'));
        const failed=event=>fail(event.error??new Error('動画エンコーダーが停止しました'));
        signal.addEventListener('abort',cancel,{once:true});
        recorder.addEventListener('error',failed,{once:true});
        function tick(now){
          try {
            const elapsed=(now-began)/1000,t=Math.min(elapsed/duration,1);
            if(now-last>=1000/fps||t===1){session.render(start+(end-start)*t,elapsed);last=now;progress.value=t;status.textContent=`動画を書き出し中 ${Math.round(t*100)}% — このタブを開いたままお待ちください`;}
            if(t>=1){cleanup();resolve();}else animation=requestAnimationFrame(tick);
          }catch(error){fail(error);}
        }
        animation=requestAnimationFrame(tick);
      });
      await new Promise(resolve=>setTimeout(resolve,1000/fps+20));
      recorder.stop();await stopped;signal.throwIfAborted();
      let blob=new Blob(chunks,{type:recorder.mimeType});
      if(mime.includes('webm'))blob=await withWebmDuration(blob,performance.now()-recordingStart);
      signal.throwIfAborted();if(!blob.size)throw new Error('動画データを作成できませんでした');
      const extension=mime.includes('mp4')?'mp4':'webm';download(blob,`u19-motion-${session.width}x${session.height}.${extension}`);status.textContent=`${duration}秒の動画を${extension.toUpperCase()}で保存しました。`;
    }finally{cancelAnimationFrame(animation);if(recorder&&recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(track=>track.stop());}
  }));
  document.querySelector('#export-html').addEventListener('click',()=>run(async(session,signal)=>{
    status.textContent='素材・ライブラリ・設定をHTMLへまとめています…';
    const search=new URL(lightingControls.shareUrl()).search;
    const blob=await buildHtml(search,{rotation:state.rotation,patternImage:patternControls.serialize().source==='image'?patternControls.image:null,logoImage:logoControls.image});signal.throwIfAborted();
    download(blob,'u19-interactive.html');status.textContent='HTMLを保存しました。単体で開けます。@で編集UIも表示できます。';
  }));
  return {get busy(){return busy;}};
}
