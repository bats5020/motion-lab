import * as THREE from './vendor/three.module.js';
import {defaultKeyframes,restoreKeyframes,sampleKeyframes,transformLimits,backgroundLimits,defaultBackground,round} from './keyframes.js';
import {setupTransformGizmo} from './transform-gizmo.js';

export function setupScrollControls({root,egg,pivot,camera,renderer,svgBackground,motionState,shareUrl}) {
  const panel=document.querySelector('#scroll-panel'),lightPanel=document.querySelector('#lighting-panel');
  let config=defaultKeyframes(),preview=null,force=true,gizmo,target=new URLSearchParams(globalThis.__eggInitialSearch??location.search).get('track')==='background'?'background':'egg';
  const track=()=>target==='background'?config.background:config;
  const limits=()=>target==='background'?backgroundLimits:transformLimits;
  const storageKey='fennel.egg.scroll.v3',history=[],future=[];
  const scrub=document.querySelector('#scroll-preview'),percentInput=document.querySelector('#scroll-percent');
  const atInput=document.querySelector('#keyframe-at'),marks=document.querySelector('#keyframe-marks');
  const select=document.querySelector('#keyframe-select'),status=document.querySelector('#scroll-status');
  try {
    const raw=new URLSearchParams(globalThis.__eggInitialSearch??location.search).get('scrollMotion')??localStorage.getItem(storageKey)??localStorage.getItem('fennel.egg.scroll.v2')??localStorage.getItem('fennel.egg.scroll.v1');
    if(raw)config=restoreKeyframes(JSON.parse(raw));
  } catch {}
  const currentPercent=()=>round((preview??(motionState.mode==='auto'?0:motionState.scroll))*100);
  const currentKey=()=>track().keyframes.find(key=>Math.abs(key.at-currentPercent())<.05);
  const snapshot=()=>JSON.stringify(config);
  function remember() {
    const value=snapshot();if(history.at(-1)!==value)history.push(value);
    if(history.length>60)history.shift();future.length=0;
  }
  function save() {try{localStorage.setItem(storageKey,snapshot());}catch{}}
  function setPreview(value) {
    preview=value;motionState.scrollPreview=value;force=true;
    document.querySelector('#scroll-live').hidden=value===null;sync();
  }
  function ensureKey() {
    let key=currentKey();
    if(!key) {
      key={...sampleKeyframes(track(),currentPercent()),id:crypto.randomUUID(),at:currentPercent()};
      track().keyframes.push(key);track().keyframes.sort((a,b)=>a.at-b.at);save();
      status.textContent=key.at+'%にキーフレームを追加しました';
    }
    return key;
  }
  function beginEdit() {remember();ensureKey();setPreview(currentPercent()/100);}
  function changePose(pose) {
    const key=ensureKey();
    for(const name of Object.keys(limits()))if(Number.isFinite(pose[name]))key[name]=round(THREE.MathUtils.clamp(pose[name],...limits()[name]));
    save();force=true;sync();
  }
  function moveKey(key,time) {
    const next=round(THREE.MathUtils.clamp(time,0,100));
    if(track().keyframes.some(item=>item.id!==key.id&&Math.abs(item.at-next)<.05)) {
      status.textContent=next+'%にはすでにキーがあります';return false;
    }
    key.at=next;track().keyframes.sort((a,b)=>a.at-b.at);save();setPreview(next/100);return true;
  }
  function deleteKey() {
    const key=currentKey();if(!key||track().keyframes.length===1)return;
    remember();track().keyframes=track().keyframes.filter(item=>item.id!==key.id);save();force=true;sync();status.textContent=key.at+'%のキーを削除しました';
  }
  function sync() {
    const time=currentPercent(),key=currentKey(),pose=key??sampleKeyframes(track(),time);
    document.querySelectorAll('[data-egg-field]').forEach(element=>element.hidden=target!=='egg');
    document.querySelectorAll('[data-background-field]').forEach(element=>element.hidden=target!=='background');
    document.querySelectorAll('[data-track]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.track===target)));
    const marginInput=document.querySelector('#background-margin');if(document.activeElement!==marginInput)marginInput.value=config.background.margin;
    document.querySelector('#background-fit').value=config.background.fit;
    document.querySelector('#timeline-target').textContent=target==='background'?'BACKGROUND':'EGG';
    if(document.activeElement!==percentInput)percentInput.value=String(time);
    if(document.activeElement!==atInput)atInput.value=key?String(key.at):'';
    atInput.disabled=!key;
    document.querySelector('#keyframe-selection').textContent=key?`${key.at}% のキーを編集中`:`${time}% は補間中 · 編集するとキーを追加`;
    for(const name of Object.keys(limits())) {
      const value=round(pose[name]);
      for(const input of document.querySelectorAll(`[${target==='background'?'data-background':'data-transform'}="${name}"]`))if(document.activeElement!==input)input.value=String(value);
    }
    document.querySelector('#scroll-easing').value=pose.easing??'smooth';
    document.querySelector('#keyframe-delete').disabled=!key||track().keyframes.length===1;
    document.querySelector('#keyframe-add').disabled=!!key;
    document.querySelector('#scroll-undo').disabled=history.length===0;
    document.querySelector('#scroll-redo').disabled=future.length===0;
    select.replaceChildren(new Option('キーを選択',''));
    for(const item of track().keyframes)select.add(new Option(item.at+'%',item.id));
    select.value=key?.id??'';
    for(const button of marks.children)if(!track().keyframes.some(item=>item.id===button.dataset.key))button.remove();
    for(const item of track().keyframes) {
      let button=[...marks.children].find(button=>button.dataset.key===item.id);
      if(!button) {
        button=document.createElement('button');button.className='keyframe-marker';button.dataset.key=item.id;
        button.innerHTML='<i aria-hidden="true"></i>';marks.appendChild(button);
        let dragging=false;
        button.addEventListener('pointerdown',event=>{
          if(event.button!==0)return;event.preventDefault();event.stopPropagation();remember();setPreview(item.at/100);dragging=true;button.setPointerCapture(event.pointerId);
        });
        button.addEventListener('pointermove',event=>{
          if(!dragging)return;const rect=marks.getBoundingClientRect();moveKey(item,(event.clientX-rect.left)/rect.width*100);
        });
        for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>{dragging=false;});
        button.addEventListener('click',()=>setPreview(item.at/100));
        button.addEventListener('keydown',event=>{
          if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();remember();moveKey(item,item.at+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?5:1));}
          if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();setPreview(item.at/100);deleteKey();}
        });
      }
      button.style.left=item.at+'%';button.title=item.at+'%';button.setAttribute('aria-label',item.at+'%のキーフレーム。ドラッグで時点を移動');button.setAttribute('aria-pressed',String(item.id===key?.id));
    }
  }
  function validNumber(input) {return input.value.trim()!==''&&Number.isFinite(input.valueAsNumber)?input.valueAsNumber:null;}
  percentInput.addEventListener('change',()=>{const value=validNumber(percentInput);if(value!==null)setPreview(round(THREE.MathUtils.clamp(value,0,100))/100);percentInput.value=String(currentPercent());});
  atInput.addEventListener('change',()=>{const key=currentKey(),value=validNumber(atInput);if(key&&value!==null){remember();moveKey(key,value);}atInput.value=currentKey()?String(currentKey().at):'';});
  select.addEventListener('change',()=>{const key=track().keyframes.find(key=>key.id===select.value);if(key)setPreview(key.at/100);});
  document.querySelector('#keyframe-add').addEventListener('click',()=>{remember();ensureKey();setPreview(currentPercent()/100);save();});
  document.querySelector('#keyframe-delete').addEventListener('click',deleteKey);
  for(const input of document.querySelectorAll('[data-transform],[data-background]')) {
    const number=input.type==='number',property=input.dataset.transform??input.dataset.background;
    if(!number){input.addEventListener('pointerdown',remember);input.addEventListener('keydown',remember);}
    input.addEventListener(number?'change':'input',()=>{
      const value=validNumber(input);if(value===null){input.value=String((currentKey()??sampleKeyframes(track(),currentPercent()))[property]);return;}
      if(number)remember();setPreview(currentPercent()/100);changePose({[property]:value});
      if(number)input.value=String(currentKey()[property]);
    });
  }
  scrub.addEventListener('input',()=>setPreview(Number(scrub.value)/100));
  document.querySelector('#scroll-live').addEventListener('click',()=>{gizmo.setEditing(false);setPreview(null);});
  window.addEventListener('scroll',()=>{gizmo?.setEditing(false);if(preview!==null)setPreview(null);},{passive:true});
  document.querySelector('#scroll-easing').addEventListener('change',event=>{remember();const value=event.target.value;setPreview(currentPercent()/100);ensureKey().easing=value;save();force=true;sync();});
  for(const [id,from,to] of [['scroll-undo',history,future],['scroll-redo',future,history]])document.querySelector('#'+id).addEventListener('click',()=>{
    if(!from.length)return;to.push(snapshot());config=JSON.parse(from.pop());save();force=true;marks.replaceChildren();sync();
  });
  document.querySelectorAll('[data-scroll-preset]').forEach(button=>button.addEventListener('click',()=>{
    remember();config.keyframes=defaultKeyframes().keyframes;
    if(button.dataset.scrollPreset==='return')track().keyframes.splice(1,0,{id:'middle',at:45,x:20,y:8,scale:55,easing:'smooth'});
    else Object.assign(track().keyframes[1],button.dataset.scrollPreset==='shrink'?{x:20,y:8,scale:55}:{scale:140});
    marks.replaceChildren();save();setPreview(0);document.querySelector('[data-mode="scroll"]').click();status.textContent='プリセットを適用しました';
  }));
  document.querySelector('#scroll-reset').addEventListener('click',()=>{remember();if(target==='background')config.background=defaultBackground();else config.keyframes=defaultKeyframes().keyframes;marks.replaceChildren();save();gizmo.setEditing(false);setPreview(null);status.textContent='キーを初期状態に戻しました';});
  document.querySelector('#scroll-copy').addEventListener('click',async()=>{
    const url=shareUrl();try{await navigator.clipboard.writeText(url);document.querySelector('#scroll-url').hidden=true;status.textContent='設定URLをコピーしました';}
    catch{const field=document.querySelector('#scroll-url');field.value=url;field.hidden=false;field.select();status.textContent='選択したURLをコピーしてください';}
  });
  document.querySelectorAll('[data-track]').forEach(button=>button.addEventListener('click',()=>{
    gizmo.setEditing(false);target=button.dataset.track;marks.replaceChildren();sync();
  }));
  document.querySelector('#background-margin').addEventListener('change',event=>{
    const value=validNumber(event.target);if(value!==null){remember();config.background.margin=round(THREE.MathUtils.clamp(value,0,120));save();force=true;}
    event.target.value=config.background.margin;sync();
  });
  document.querySelector('#background-fit').addEventListener('change',event=>{remember();config.background.fit=event.target.value;save();force=true;sync();});
  function timelineVisibility(){document.querySelector('#keyframe-timeline').hidden=!panel.open&&!gizmo?.editing;document.body.classList.toggle('timeline-open',panel.open||gizmo?.editing);}
  panel.addEventListener('pointermove',event=>event.stopPropagation());
  document.querySelector('#keyframe-timeline').addEventListener('pointermove',event=>event.stopPropagation());
  panel.addEventListener('toggle',()=>{if(panel.open&&matchMedia('(max-width:600px)').matches)lightPanel.open=false;timelineVisibility();});
  lightPanel.addEventListener('toggle',()=>{if(lightPanel.open){gizmo?.setEditing(false);if(matchMedia('(max-width:600px)').matches)panel.open=false;}});
  if(new URLSearchParams(globalThis.__eggInitialSearch??location.search).get('panel')==='scroll'){lightPanel.open=false;panel.open=true;}
  gizmo=setupTransformGizmo({root,egg,pivot,camera,renderer,motionState,getPose:()=>currentKey()??sampleKeyframes(track(),currentPercent()),beginEdit,changePose,onEditing:timelineVisibility});
  sync();timelineVisibility();
  let lastTime=-1;
  function update(dt) {
    const time=currentPercent(),pose=sampleKeyframes(config,time);
    if(force||(!motionState.paused&&!motionState.lightingEditing&&!motionState.objectEditing)) {
      const height=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z;
      const blend=force?1:1-Math.exp(-dt*8);
      root.position.x=THREE.MathUtils.lerp(root.position.x,pose.x*height*camera.aspect/100,blend);
      root.position.y=THREE.MathUtils.lerp(root.position.y,pose.y*height/100,blend);
      root.scale.setScalar(THREE.MathUtils.lerp(root.scale.x,pose.scale/100,blend));
      svgBackground.apply(sampleKeyframes(config.background,time),config.background);force=false;
    }
    scrub.value=String(time);document.querySelector('#timeline-playhead').style.left=time+'%';
    document.querySelector('#scroll-feedback').textContent=(preview!==null?'プレビュー':motionState.mode==='auto'?'自動回転：0%の位置':'ページスクロール')+` · ${time}% / ${target==='background'?'背景':'卵'} ${round(target==='background'?svgBackground.pose.scale:root.scale.x*100)}%`;
    document.querySelector('#hint').textContent=gizmo.editing?'卵をドラッグ：移動 / 赤・緑の矢印：軸を固定 / 右下の角：拡大縮小':preview!==null?`動きのプレビュー ${time}% / ページをスクロールすると連動に戻ります`:motionState.mode==='auto'?'ゆっくり自動回転':motionState.mode==='scroll'?'下にスクロールして移動・拡大縮小・回転':'マウスを動かす / 下にスクロール';
    if(lastTime!==time){sync();lastTime=time;}
  }
  return {get config(){return config;},get target(){return target;},update,setPreview,serialize:()=>config,resize:()=>{force=true;},get preview(){return preview;},gizmo,updateGizmo:gizmo.update};
}
