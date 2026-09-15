import * as THREE from './vendor/three.module.js';
import {LIGHT_SOURCE,lightDirection,lightAngles,setEnvironmentDirection,migrateLightDirection,setupLightPlacement} from './light-placement.js';

export function setupLightingControls({ scene, materials, key, fill, lowerFill, patternFill, egg, camera, renderer, motionState, getScrollSettings, getPreviewSettings, getPatternSettings, getLogoSettings }) {
  const panel = document.querySelector('#lighting-panel');
  const pad = document.querySelector('#light-direction');
  const status = document.querySelector('#lighting-status');
  const storageKey = 'fennel.egg.lighting.v2';
  const defaults = { ...lightAngles(LIGHT_SOURCE), strength:100, reflection:100, softness:100, gloss:70 };
  const limits = { azimuth:[-180,180], elevation:[-90,90], strength:[0,250], reflection:[0,250], softness:[0,300], gloss:[0,100] };
  const inputs = Object.fromEntries(Object.keys(defaults).map(name=>[name,document.querySelector(`[data-light="${name}"]`)]));
  const state = { ...defaults };
  function restore(value) {
    if(!value || typeof value!=='object' || Array.isArray(value))return;
    for(const name of Object.keys(defaults)) {
      if(typeof value[name]!=='number' || !Number.isFinite(value[name]))continue;
      state[name]=THREE.MathUtils.clamp(value[name],...limits[name]);
    }
  }
  const params = new URLSearchParams(globalThis.__eggInitialSearch??location.search);
  try {
    const shared=params.get('light');
    const saved=shared ?? localStorage.getItem(storageKey) ?? localStorage.getItem('fennel.egg.lighting.v1');
    if(saved) {
      const value=JSON.parse(saved);
      const legacy=shared ? params.get('lightVersion')!=='2' : !localStorage.getItem(storageKey);
      if(legacy && value && !Array.isArray(value) && typeof value==='object') {
        const valid={...defaults,azimuth:-65,elevation:40};
        for(const name of ['azimuth','elevation'])if(typeof value[name]==='number'&&Number.isFinite(value[name]))valid[name]=THREE.MathUtils.clamp(value[name],...limits[name]);
        Object.assign(value,migrateLightDirection(valid));
      }
      restore(value);
    }
  } catch { /* Storage and malformed shared URLs must not block the preview. */ }
  let placement;
  function apply(save=false) {
    const direction=lightDirection(state.azimuth,state.elevation);
    setEnvironmentDirection(scene,direction);
    const gain=state.strength/100;
    // The scene intensity controls materials using scene.environment in r180.
    scene.environmentIntensity=gain*state.reflection/100;
    key.intensity=2.2*gain;fill.intensity=.28*gain;lowerFill.intensity=.65*gain;
    patternFill.intensity=1.35*gain;
    key.position.copy(direction).multiplyScalar(6);
    for(const [name,base] of Object.entries({clear:.022,tint:.022,pattern:.035,painted:1})) {
      if(materials[name])materials[name].roughness=THREE.MathUtils.clamp(base*state.softness/100,0,1);
    }
    for(const name of ['clear','tint','pattern']) {
      materials[name].clearcoat=.65*state.gloss/100;
      materials[name].clearcoatRoughness=.025+.025*state.softness/100;
      materials[name].specularIntensity=.45+.55*state.gloss/100;
    }
    for(const [name,input] of Object.entries(inputs)) {
      input.value=String(state[name]);
      document.querySelector(`[data-light-value="${name}"]`).textContent=Math.round(state[name])+(['azimuth','elevation'].includes(name)?'°':'%');
    }
    document.querySelector('[data-light="gloss"]').closest('label').hidden=egg.material===materials.painted;
    placement?.markDirty();
    if(save)try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{}
  }
  for(const [name,input] of Object.entries(inputs))input.addEventListener('input',()=>{
    state[name]=Number(input.value);apply(true);status.textContent='';
  });
  placement=setupLightPlacement({egg,camera,renderer,motionState,
    getDirection:()=>lightDirection(state.azimuth,state.elevation),
    setDirection:direction=>{Object.assign(state,lightAngles(direction));apply(true);status.textContent='位置を保存しました';}
  });
  // Editing the light should not also tilt the egg through the global pointer handler.
  panel.addEventListener('pointermove',event=>event.stopPropagation());
  document.querySelector('#light-reset').addEventListener('click',()=>{
    Object.assign(state,defaults);apply(true);status.textContent='照明を初期状態に戻しました';
  });
  function shareUrl() {
    const url=new URL(location.href);
    url.searchParams.set('light',JSON.stringify(state));
    url.searchParams.set('lightVersion','2');
    url.searchParams.set('material',document.querySelector('[data-surface][aria-pressed="true"]').dataset.surface);
    url.searchParams.set('transparency',document.querySelector('#transparency').value);
    const scrollSettings=getScrollSettings?.();
    if(scrollSettings)url.searchParams.set('scrollMotion',JSON.stringify(scrollSettings));
    url.searchParams.set('motionMode',motionState.mode);
    url.searchParams.set('backdrop',document.querySelector('#backdrop').getAttribute('aria-pressed')==='true'?'1':'0');
    const viewport=getPreviewSettings?.();if(viewport)url.searchParams.set('previewViewport',JSON.stringify(viewport));
    const pattern=getPatternSettings?.();if(pattern)url.searchParams.set('pattern',JSON.stringify(pattern));
    const logo=getLogoSettings?.();if(logo)url.searchParams.set('logo',JSON.stringify(logo));
    return url.href;
  }
  document.querySelector('#light-copy').addEventListener('click',async()=>{
    const url=shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      document.querySelector('#lighting-url').hidden=true;
      status.textContent='設定URLをコピーしました';
    } catch {
      const field=document.querySelector('#lighting-url');field.value=url;field.hidden=false;field.select();
      status.textContent='選択したURLをコピーしてください';
    }
  });
  if(matchMedia('(max-width:600px)').matches)panel.open=false;
  apply();
  const savedTransparency=Number(params.get('transparency'));
  if(params.has('transparency')&&Number.isFinite(savedTransparency)) {
    const slider=document.querySelector('#transparency');
    slider.value=String(THREE.MathUtils.clamp(savedTransparency,0,100));
    slider.dispatchEvent(new Event('input',{bubbles:true}));
  }
  return {state,apply,shareUrl,placement,updatePreview:placement.update};
}
