/* Numeric editing + model-backed history. Rendering stays with each original tool. */
(function(root){
  'use strict';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function restoreInPlace(target,source){
    if(Array.isArray(target)&&Array.isArray(source)){
      source.forEach((value,i)=>{if(value&&typeof value==='object'&&target[i]&&typeof target[i]==='object')restoreInPlace(target[i],value);else target[i]=copy(value);});
      target.length=source.length;return target;
    }
    for(const key of Object.keys(target))if(!(key in source))delete target[key];
    for(const [key,value]of Object.entries(source)){
      if(value&&typeof value==='object'&&target[key]&&typeof target[key]==='object'&&Array.isArray(value)===Array.isArray(target[key]))restoreInPlace(target[key],value);
      else target[key]=value&&typeof value==='object'?copy(value):value;
    }
    return target;
  }
  function modelAdapter(kind,api){
    if(kind==='ascii-wave')return{
      capture:()=>copy(api.state),
      restore:snapshot=>{restoreInPlace(api.state,snapshot);api.setSeed(api.state.seed);api.syncUI();api.rebuildAll();}
    };
    if(kind==='warp-type')return{
      capture:()=>({state:copy(api.state),noiseSeed:api.getNoiseSeed()}),
      restore:async snapshot=>{restoreInPlace(api.state,snapshot.state);api.setNoiseSeed(snapshot.noiseSeed);api.applySize();await api.applyState();api.syncExtras();}
    };
    if(kind==='u19-aberration')return{
      capture:()=>{const saved=copy(api.state);delete saved.color._sorted;return {state:saved,selectedStop:api.getSelectedStop?.()??0};},
      equals:(a,b)=>JSON.stringify(a.state)===JSON.stringify(b.state),
      restore:snapshot=>{restoreInPlace(api.state,snapshot.state);api.setSelectedStop?.(snapshot.selectedStop);api.syncAll();api.syncRecording();api.rebuildSDF();}
    };
    if(kind==='wireframe')return{
      capture:()=>copy(api.getDocument()),
      equals:(a,b)=>JSON.stringify({...a,phase:0})===JSON.stringify({...b,phase:0}),
      restore:snapshot=>{api.setDocument(copy(snapshot));api.rebuild();}
    };
    return null;
  }
  const exported={restoreInPlace,modelAdapter};
  if(typeof module==='object'&&module.exports)module.exports=exported;
  if(!root.document)return;
  const doc=root.document,kind=doc.body.dataset.mlEditor,$=id=>doc.getElementById(id);
  if(!['ascii-wave','warp-type','u19-aberration','wireframe'].includes(kind)||doc.body.dataset.mlUnavailable)return;
  if(!root.MLEditorHistory||!root.MLNumberInputs)return;
  function start(){
    let api,busy=()=>false,playheadEdit=0;const pendingAssets=new Set();
    if(kind==='ascii-wave'){
      api={state,setSeed,syncUI,rebuildAll};busy=()=>recording;
    }else if(kind==='warp-type'){
      let noiseSeed=1234,lastTextures=Promise.resolve();
      const seedNoise=NZ.seed;NZ.seed=value=>{noiseSeed=value;seedNoise(value);};
      const rebuild=rebuildTextures;rebuildTextures=function(){lastTextures=rebuild();return lastTextures;};
      api={state,getNoiseSeed:()=>noiseSeed,setNoiseSeed:value=>NZ.seed(value),applySize,
        applyState:()=>{applyState();return lastTextures;},syncExtras:()=>{
          $('i-aspect').value=state.aspect;$('i-expw').value=state.expW;$('i-falloff').value=state.falloff;
          $('btn-pause').textContent=state.paused?'再生':'一時停止';
        }};busy=()=>recording;
    }else if(kind==='u19-aberration'){
      api={state,syncAll,rebuildSDF,getSelectedStop:()=>selStop,setSelectedStop:value=>{selStop=Math.max(0,Math.min(state.color.stops.length-1,value));_dragStop=-1;},syncRecording:()=>{UI.recFps?.set(String(state.motion.recFps||30));UI.recSec?.set(state.motion.recSec);}};
      busy=()=>_recording||pendingAssets.size>0;
    }else{
      api={getDocument:()=>({scene:currentScene,params,activeLook,exportFps,playheadEdit,phase}),
        setDocument:snapshot=>{if(playheadEdit!==snapshot.playheadEdit){phase=snapshot.phase;playheadEdit=snapshot.playheadEdit;}currentScene=snapshot.scene;params=snapshot.params;activeLook=snapshot.activeLook;exportFps=snapshot.exportFps;},
        rebuild:()=>{
          doc.querySelectorAll('#sceneSwitch button').forEach(button=>button.classList.toggle('active',button.dataset.scene===currentScene));
          $('loopTime').textContent=params.loopLength.toFixed(2);buildScene();renderPanel();resizeRenderer();syncScrub();
          if(!playing)renderFrame(phase);
        }};busy=()=>exporting;
    }
    const adapter=modelAdapter(kind,api);
    const controller=root.MLEditorHistory.register({...adapter,name:kind,isBusy:busy,toolbar:kind==='wireframe'?'#topbar':'.ml-toolbar-actions'});
    root.MLTypeShapeHistory={controller,kind,assetBegin(channel){if(pendingAssets.has(channel))return;controller.commit();pendingAssets.add(channel);controller.refresh();},assetEnd(channel,success){if(!pendingAssets.delete(channel))return;if(!pendingAssets.size)controller.reset(success?'画像を変更したため、ここから新しい編集履歴を開始します。':'画像の読み込みを終了しました。ここから履歴を開始します。');}};
    if(kind==='u19-aberration'){
      $('lutCv').addEventListener('dblclick',()=>{controller.begin('カラーストップを削除',true);queueMicrotask(()=>controller.commit());},true);
      for(const event of ['pointercancel','lostpointercapture'])$('lutCv').addEventListener(event,()=>{_dragStop=-1;});
      const hint=doc.createElement('p');hint.className='ml-asset-history-note';hint.textContent='画像の読み込み・標準画像への変更は取り消せません。画像を変更すると編集履歴をリセットします。';$('thermoOpts').prepend(hint);
    }
    const N=root.MLNumberInputs,bindings=new Set();
    if(kind==='wireframe')$('scrub').addEventListener('input',()=>{playheadEdit++;});
    const labelOf=range=>range.closest('.row,.prow,.ctrl')?.querySelector('label,.ctrl-label,span')?.textContent.replace(/\?/g,'').trim()||range.getAttribute('aria-label')||'値';
    const bindRange=(range,options={})=>{if(range&&!N.getBinding(range))bindings.add(N.bind({range,label:labelOf(range),...options}));};
    const bindNumber=(number,options={})=>{if(number&&!N.getBinding(number))bindings.add(N.bind({number,label:number.getAttribute('aria-label')||'値',...options}));};
    function refreshNumbers(){
      doc.querySelectorAll('#btn-png,#btn-webm,#btn-code,#btnPng1,#btnPng2,#btnRec,#btnUrl,.export-grid button').forEach(button=>button.dataset.mlHistoryIgnore="true");
      for(const binding of bindings)if(!binding.input.isConnected){binding.destroy();bindings.delete(binding);}
      if(kind==='ascii-wave'){
        const keys={'i-scale':'scale','i-speed':'speed','i-octaves':'octaves','i-contrast':'contrast','i-threshold':'threshold','i-flowdir':'flowDir','i-flowstr':'flowStr','i-cell':'cell','i-lsp':'letterSpacing','i-lht':'lineHeight','i-radius':'radius','i-strength':'strength'};
        for(const [id,key]of Object.entries(keys))bindRange($(id),{readout:$(id+'-v'),integer:['octaves','cell'].includes(key),suffix:key==='flowDir'?'°':key==='cell'||key==='radius'?'px':'',getValue:()=>state[key],setValue:value=>{state[key]=value;syncUI();if(['cell','letterSpacing','lineHeight'].includes(key))rebuildGrid();}});
        for(const [id,key]of [['i-expw','expW'],['i-exph','expH']])bindNumber($(id),{min:200,max:4096,step:1,integer:true,getValue:()=>state[key],setValue:value=>{state[key]=value;state.aspect='custom';syncUI();rebuildAll();}});
      }else if(kind==='warp-type'){
        const specs=[['i-fsize','fontSize','v-fsize'],['i-leading','leading','v-leading'],['i-speed','speed','v-speed'],['i-radius','radius','v-radius'],['i-tumult','tumult','v-tumult'],['i-cols','cols','v-cols'],['i-rows','rows','v-rows']];
        for(const [id,key,out]of specs)bindRange($(id),{readout:$(out),integer:['cols','rows'].includes(key),scale:key==='tumult'?1/Math.PI:1,suffix:key==='tumult'?'π':'',keyboardStep:key==='tumult'?Math.PI/10:undefined,format:key==='tumult'?value=>String(Number(value.toFixed(4))):undefined,getValue:()=>state[key],setValue:value=>{
          state[key]=value;$(id).value=value;$(out).textContent=key==='tumult'?(value/Math.PI).toFixed(2)+'π':String(value);
          if(['fontSize','leading'].includes(key))rebuildTextures();if(['cols','rows'].includes(key))rebuildMesh();
        }});
        bindNumber($('i-expw'),{min:200,max:4096,step:1,integer:true,getValue:()=>state.expW,setValue:value=>{state.expW=value;applySize();}});
      }else if(kind==='u19-aberration'){
        const widgets=[...Object.values(UI),...(UI.lines||[]).flatMap(line=>[line.sz,line.ls])];
        for(const widget of widgets){if(!widget?.row||!widget.write)continue;const range=widget.row.querySelector('input[type=range]');bindRange(range,{readout:widget.row.querySelector('.pv'),getValue:widget.getValue,setValue:widget.write});}
        const dimensions=UI.custRow.row.querySelectorAll('input');
        [...dimensions].forEach((input,index)=>{const key=index?'h':'w';bindNumber(input,{label:index?'キャンバスの高さ':'キャンバスの幅',min:64,max:4096,step:1,integer:true,getValue:()=>state.canvas[key],setValue:value=>{state.canvas[key]=value;scheduleSDF();}});});
        bindNumber($('seed'),{label:'シード',min:0,max:4294967295,step:1,integer:true,getValue:()=>state.seed,setValue:value=>{state.seed=value;}});
      }else{
        // A panel rebuild may immediately move the new export controls into the modal.
        doc.querySelectorAll('#panel .ctrl[data-ml-param],#mlUnifiedExport .ctrl[data-ml-param]').forEach(ctrl=>{
          const key=ctrl.dataset.mlParam,range=ctrl.querySelector('input[type=range]'),number=ctrl.querySelector('.ctrl-val');
          if(range)bindRange(range,{number,integer:['segX','segZ','rings','stars','gridX','gridY','gridZ','crossRings','animSpeed'].includes(key),getValue:()=>params[key],setValue:value=>{params[key]=value;range.value=value;applyParamChange(key);}});
        });
        for(const [id,key]of [['resW','resW'],['resH','resH']])bindNumber($(id),{label:key==='resW'?'書き出しの幅':'書き出しの高さ',min:120,max:3840,step:1,integer:true,getValue:()=>params[key],setValue:value=>{
          params[key]=value;const rebuilt=matchBoxAspectToResolution();resizeRenderer();if(rebuilt)buildScene();else updateCamera();
          doc.querySelectorAll('#resSeg button').forEach(button=>button.classList.toggle('active',+button.dataset.w===params.resW&&+button.dataset.h===params.resH));
          N.refresh();if(!playing)renderFrame(phase);
        }});
        bindRange($('scrub'),{label:'ループ位置',min:0,max:1000,step:1,scale:.1,suffix:'%',getValue:()=>phase*1000,setValue:value=>{playheadEdit++;phase=value/1000;syncScrub();renderFrame(phase);}});
      }
      N.refresh();
    }
    refreshNumbers();
    if(kind==='wireframe')new MutationObserver(()=>refreshNumbers()).observe($('panel'),{childList:true});
    controller.subscribe(()=>N.refresh());
    // Refresh fields after native presets/randomize/select changes without rewriting model values.
    doc.addEventListener('click',()=>queueMicrotask(()=>N.refresh()));
    doc.addEventListener('change',()=>queueMicrotask(()=>N.refresh()));
  }
  if(kind==='wireframe'&&!$('panel').querySelector('[data-ml-param]')){
    const observer=new MutationObserver(()=>{if($('panel').querySelector('[data-ml-param]')){observer.disconnect();start();}});observer.observe($('panel'),{childList:true});
  }else start();
})(typeof window==='object'?window:globalThis);
