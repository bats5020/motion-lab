import * as THREE from './vendor/three.module.js';

export const transformLimits={x:[-45,45],y:[-45,45],scale:[20,200]};
export const round=value=>Math.round(value*10)/10;
const clean=(value,fallback,range)=>typeof value==='number'&&Number.isFinite(value)?THREE.MathUtils.clamp(value,...range):fallback;
export const backgroundLimits={scale:[50,200],shift:[-100,100],spread:[20,250],angle:[-180,180]};
export const defaultBackground=()=>({margin:32,fit:'edges',keyframes:[{id:'bg-start',at:0,scale:100,shift:0,spread:100,angle:0,easing:'smooth'},{id:'bg-end',at:100,scale:100,shift:0,spread:100,angle:0,easing:'smooth'}]});
export const defaultKeyframes=()=>({version:3,background:defaultBackground(),keyframes:[{id:'start',at:0,x:0,y:0,scale:100,easing:'smooth'},{id:'end',at:100,x:0,y:0,scale:100,easing:'smooth'}]});
export function restoreKeyframes(saved) {
  if(!saved||typeof saved!=='object')return defaultKeyframes();
  const source=Array.isArray(saved.keyframes)?saved.keyframes:[{...saved.start,at:0,easing:saved.easing},{...saved.end,at:100,easing:saved.easing}];
  const unique=new Map();
  for(const raw of source.slice(0,500)) {
    if(!raw||!Number.isFinite(raw.at))continue;
    const at=round(THREE.MathUtils.clamp(raw.at,0,100));
    unique.set(at,{id:'key-'+at,at,x:clean(raw.x,0,transformLimits.x),y:clean(raw.y,0,transformLimits.y),scale:clean(raw.scale,100,transformLimits.scale),easing:['smooth','linear','hold'].includes(raw.easing)?raw.easing:'smooth'});
  }
  const result=unique.size?{version:3,background:defaultBackground(),keyframes:[...unique.values()].sort((a,b)=>a.at-b.at)}:defaultKeyframes();
  if(saved.background&&typeof saved.background==='object') {
    const bg=saved.background,keys=new Map();
    result.background.margin=clean(bg.margin,32,[0,120]);result.background.fit=bg.fit==='contain'?'contain':'edges';
    if(Array.isArray(bg.keyframes))for(const raw of bg.keyframes.slice(0,500)) {
      if(!raw||!Number.isFinite(raw.at))continue;
      const at=round(THREE.MathUtils.clamp(raw.at,0,100)),key={id:'bg-'+at,at,easing:['smooth','linear','hold'].includes(raw.easing)?raw.easing:'smooth'};
      for(const [name,range] of Object.entries(backgroundLimits))key[name]=clean(raw[name],name==='scale'||name==='spread'?100:0,range);
      keys.set(at,key);
    }
    if(keys.size)result.background.keyframes=[...keys.values()].sort((a,b)=>a.at-b.at);
  }
  return result;
}
export function sampleKeyframes(config,percent) {
  const keys=config.keyframes;
  if(percent<=keys[0].at)return {...keys[0]};
  for(let i=1;i<keys.length;i++) {
    const a=keys[i-1],b=keys[i];
    if(percent<=b.at) {
      const fraction=(percent-a.at)/(b.at-a.at);
      const t=a.easing==='hold'?(fraction>=1?1:0):a.easing==='linear'?fraction:THREE.MathUtils.smoothstep(fraction,0,1);
      const pose={easing:a.easing};
      for(const name of ['x','y','scale','shift','spread','angle'])if(Number.isFinite(a[name])&&Number.isFinite(b[name]))pose[name]=THREE.MathUtils.lerp(a[name],b[name],t);
      return pose;
    }
  }
  return {...keys.at(-1)};
}
