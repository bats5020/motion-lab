import * as THREE from './vendor/three.module.js';

const defaults=()=>({enabled:true,x:0,y:0,size:72,opacity:85,imageSource:'provided'});
const storageKey='fennel.egg.logo.v1';
function imageStore(value) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('fennel-egg-logo',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images');
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('画像保存を開始できませんでした'));
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('images',value===undefined?'readonly':'readwrite'),store=tx.objectStore('images');
      const query=value===undefined?store.get('logo'):store.put(value,'logo');let result;
      query.onsuccess=()=>result=query.result;
      tx.oncomplete=()=>{db.close();resolve(result);};tx.onerror=()=>{db.close();reject(tx.error);};
    };
  });
}
export async function setupLogoControls({egg,pivot,state,renderer,lightingControls,scrollControls,materials}) {
  const panel=document.querySelector('#logo-settings'),status=document.querySelector('#logo-status');
  const params=new URLSearchParams(globalThis.__eggInitialSearch??location.search);
  let settings=defaults(),texture=null,customImage=null,revision=0;
/* ML_KEYBOARD_BEGIN */
  let assetBusy=0;
/* ML_KEYBOARD_END */
  try {
    const saved=JSON.parse(params.get('logo')??localStorage.getItem(storageKey)??'null');
    if(saved&&typeof saved==='object'){
      for(const [key,min,max] of [['x',-45,45],['y',-45,45],['size',10,140],['opacity',0,100]])if(Number.isFinite(saved[key]))settings[key]=Math.max(min,Math.min(max,saved[key]));
      settings.enabled=saved.enabled!==false;settings.imageSource=saved.imageSource==='custom'?'custom':'provided';
    }
  }catch{}
  // Composite pigment before physical lighting, so the shell and logo share
  // exactly the same geometry, surface normal, reflection and transmission.
  const empty=new THREE.DataTexture(new Uint8Array([0,0,0,0]),1,1);empty.needsUpdate=true;
  const uniforms={logoMap:{value:empty},logoLayout:{value:new THREE.Vector4(0,0,1,1)},logoOpacity:{value:0}};
  const attached=new WeakSet();
  function attach(material){
    if(attached.has(material))return;attached.add(material);
    const previous=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
    material.onBeforeCompile=shader=>{
      previous.call(material,shader);Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 logoPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nlogoPosition=position;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 logoPosition;
        uniform sampler2D logoMap;
        uniform vec4 logoLayout;
        uniform float logoOpacity;`)
        .replace('#include <color_fragment>',`#include <color_fragment>
          vec2 logoUv=(logoPosition.xy-logoLayout.xy)/logoLayout.zw+.5;
          if(logoOpacity>0.&&logoPosition.z>0.&&all(greaterThanEqual(logoUv,vec2(0.)))&&all(lessThanEqual(logoUv,vec2(1.)))){
            vec4 logoInk=texture2D(logoMap,logoUv);
            diffuseColor.rgb=mix(diffuseColor.rgb,logoInk.rgb,logoInk.a*logoOpacity);
          }`);
    };
    material.customProgramCacheKey=()=>cacheKey+'-integrated-logo-v1';material.needsUpdate=true;
  }
  Object.values(materials).forEach(attach);
  function apply(save=false) {
    if(texture){
      const width=2.38*settings.size/100,height=width*texture.image.height/texture.image.width;
      uniforms.logoLayout.value.set(settings.x/100*2.38,settings.y/100*3.06,width,height);
    }
    uniforms.logoOpacity.value=settings.enabled&&texture?settings.opacity/100:0;
    panel.querySelectorAll('[data-logo]').forEach(input=>input.value=settings[input.dataset.logo]);
    document.querySelector('#logo-enabled').checked=settings.enabled;
    lightingControls.placement.markDirty();
    if(save)try{localStorage.setItem(storageKey,JSON.stringify(settings));status.textContent='位置とサイズを保存しました。画像ごと渡す場合はHTMLで保存できます。';}catch{status.textContent='設定を残すにはHTMLで保存してください。';}
  }
  async function load(source,name,token=revision) {
    const next=await new THREE.TextureLoader().loadAsync(source);
    if(token!==revision){next.dispose();return false;}
    next.colorSpace=THREE.SRGBColorSpace;next.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const old=texture;texture=next;uniforms.logoMap.value=texture;
    document.querySelector('#logo-thumbnail').src=source;
    document.querySelector('#logo-image-name').textContent=`${name} · ${next.image.width} × ${next.image.height}`;
    apply();old?.dispose();return true;
  }
  const provided='./assets/u19-logo.png';
  if(settings.imageSource==='custom'){
    try {
      const saved=globalThis.__eggEmbed?globalThis.__eggEmbed.logoImage:params.has('logo')?null:await imageStore();
      if(!saved?.data||!/^data:image\/(png|jpeg|webp);base64,/.test(saved.data))throw new Error('画像がありません');
      await load(saved.data,saved.name);customImage=saved;
    }catch{settings.imageSource='provided';status.textContent='保存画像が見つからないため、提供されたU19ロゴを表示しています。';}
  }
  if(settings.imageSource==='provided')try{await load(provided,'sMask group.png');}catch{settings.enabled=false;status.textContent='ロゴを読み込めませんでした。画像を選び直してください。';}
  panel.querySelectorAll('[data-logo]').forEach(input=>{
    input.addEventListener('input',()=>{const value=input.valueAsNumber;if(!Number.isFinite(value))return;settings[input.dataset.logo]=Math.max(+input.min,Math.min(+input.max,value));apply(true);});
    input.addEventListener('change',()=>apply());
  });
  document.querySelector('#logo-enabled').addEventListener('change',event=>{settings.enabled=event.target.checked;apply(true);});
  document.querySelector('#logo-center').addEventListener('click',()=>{settings.x=settings.y=0;settings.size=72;apply(true);});
  document.querySelector('#logo-front').addEventListener('click',()=>{
    scrollControls.gizmo.setEditing(false);lightingControls.placement.setEditing(false);
    if(!state.paused)document.querySelector('#pause').click();
    const percent=scrollControls.preview??(state.mode==='auto'?0:state.scroll);
    state.rotation=-percent*Math.PI*1.35;state.pointerX=state.pointerY=0;
    egg.rotation.set(0,0,0);pivot.rotation.set(0,0,-.055+percent*.18);lightingControls.placement.markDirty();
    status.textContent='正面で一時停止しました。下の「再生」で動きを再開できます。';
  });
  document.querySelector('#logo-original').addEventListener('click',async()=>{
/* ML_KEYBOARD_BEGIN original-base64:ICAgIGNvbnN0IHRva2VuPSsrcmV2aXNpb247dHJ5e2lmKGF3YWl0IGxvYWQocHJvdmlkZWQsJ3NNYXNrIGdyb3VwLnBuZycsdG9rZW4pKXtzZXR0aW5ncy5pbWFnZVNvdXJjZT0ncHJvdmlkZWQnO2N1c3RvbUltYWdlPW51bGw7c2V0dGluZ3MuZW5hYmxlZD10cnVlO2FwcGx5KHRydWUpO319Y2F0Y2h7c3RhdHVzLnRleHRDb250ZW50PSflhYPnlLvlg4/jgpLoqq3jgb/ovrzjgoHjgb7jgZvjgpPjgafjgZfjgZ/jgIInO30= */
    const token=++revision;assetBusy++;let assetChanged=false;
    try{if(await load(provided,'sMask group.png',token)){settings.imageSource='provided';customImage=null;settings.enabled=true;apply(true);assetChanged=true;}}catch{status.textContent='元画像を読み込めませんでした。';}
    finally{assetBusy=Math.max(0,assetBusy-1);if(assetChanged)document.dispatchEvent(new CustomEvent('egg-asset-boundary',{detail:{kind:'logo'}}));}
/* ML_KEYBOARD_END */
  });
  document.querySelector('#logo-upload').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>20*1024*1024){status.textContent='20MB以下のPNG・JPEG・WebPを選んでください。';return;}
    const token=++revision;status.textContent='画像を読み込んでいます…';
/* ML_KEYBOARD_BEGIN */
    assetBusy++;let assetChanged=false;
/* ML_KEYBOARD_END */
    try {
      const bitmap=await createImageBitmap(file),ratio=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const data=canvas.toDataURL('image/png');if(token!==revision)return;
      if(!await load(data,file.name,token))return;
      settings.imageSource='custom';settings.enabled=true;customImage={data,name:file.name};apply(true);
/* ML_KEYBOARD_BEGIN */
      assetChanged=true;
/* ML_KEYBOARD_END */
      try{await imageStore(customImage);}catch{status.textContent='画像の自動保存に失敗しました。HTMLで保存してください。';}
    }catch{status.textContent='画像を読み込めませんでした。現在の画像は維持しています。';}
/* ML_KEYBOARD_BEGIN */
    finally{assetBusy=Math.max(0,assetBusy-1);if(assetChanged)document.dispatchEvent(new CustomEvent('egg-asset-boundary',{detail:{kind:'logo'}}));}
/* ML_KEYBOARD_END */
  });
  apply();
/* ML_KEYBOARD_BEGIN original-base64:ICByZXR1cm4ge2F0dGFjaCx1bmlmb3JtcyxzZXJpYWxpemU6KCk9Pih7Li4uc2V0dGluZ3N9KSxnZXQgaW1hZ2UoKXtyZXR1cm4gc2V0dGluZ3MuaW1hZ2VTb3VyY2U9PT0nY3VzdG9tJz9jdXN0b21JbWFnZTpudWxsO319Ow== */
  function restoreEditor(saved) {
    if(saved.imageSource!==settings.imageSource)throw new Error('画像変更前の履歴は復元できません');
    settings=structuredClone(saved);revision++;apply(true);
  }
  return {attach,uniforms,serialize:()=>({...settings}),restoreEditor,get busy(){return assetBusy>0;},get image(){return settings.imageSource==='custom'?customImage:null;}};
/* ML_KEYBOARD_END */
}
