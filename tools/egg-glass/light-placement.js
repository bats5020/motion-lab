import * as THREE from './vendor/three.module.js';

// One source direction for the generated environment, controls and hit feedback.
export const LIGHT_SOURCE = new THREE.Vector3(-.48,.55,.68).normalize();
export function lightDirection(azimuth,elevation) {
  const a=THREE.MathUtils.degToRad(azimuth), e=THREE.MathUtils.degToRad(elevation);
  return new THREE.Vector3(Math.sin(a)*Math.cos(e),Math.sin(e),Math.cos(a)*Math.cos(e));
}
export function lightAngles(direction) {
  return {azimuth:THREE.MathUtils.radToDeg(Math.atan2(direction.x,direction.z)),elevation:THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(direction.y,-1,1)))};
}
export function setEnvironmentDirection(scene,direction) {
  const rotation=new THREE.Quaternion().setFromUnitVectors(LIGHT_SOURCE,direction);
  const lookup=new THREE.Euler().setFromQuaternion(rotation.invert());
  // r180 negates the scene Euler components for its PMREM lookup matrix.
  // Supply the inverse lookup explicitly; negating a multi-axis Euler alone
  // is not equivalent to inverting its rotation.
  scene.environmentRotation.set(-lookup.x,-lookup.y,-lookup.z,lookup.order);
}
export function migrateLightDirection(old) {
  const q=new THREE.Quaternion().setFromUnitVectors(lightDirection(-65,40),lightDirection(old.azimuth??-65,old.elevation??40));
  const e=new THREE.Euler().setFromQuaternion(q);
  const oldLookup=new THREE.Quaternion().setFromEuler(new THREE.Euler(-e.x,-e.y,-e.z,e.order));
  return lightAngles(LIGHT_SOURCE.clone().applyQuaternion(oldLookup.invert()));
}

export function setupLightPlacement({egg,camera,renderer,motionState,getDirection,setDirection}) {
  const panel=document.querySelector('#lighting-panel');
  const pad=document.querySelector('#light-direction');
  const dot=document.querySelector('#light-dot');
  const miniature=document.querySelector('#light-preview');
  const context=miniature.getContext('2d');
  const marker=document.querySelector('#light-hit');
  const editButton=document.querySelector('#light-edit');
  const feedback=document.querySelector('#light-feedback');
  const sourceFeedback=document.querySelector('#light-source-feedback');
  const canvas=renderer.domElement;
  const raycaster=new THREE.Raycaster();
  const normalMatrix=new THREE.Matrix3();
  const p=new THREE.Vector3(), n=new THREE.Vector3(), view=new THREE.Vector3(), reflection=new THREE.Vector3();
  const bestPoint=new THREE.Vector3(), projected=new THREE.Vector3();
  let crop=null, hitScreen=null, editing=false, dragging=false, dirty=true, lastUpdate=-Infinity;
  let previewAspect=miniature.width/miniature.height;
  const position=egg.geometry.attributes.position, normals=egg.geometry.attributes.normal;
  function freeze() {motionState.lightingEditing=editing||dragging;}
  function setEditing(value) {
    editing=value;freeze();
    editButton.setAttribute('aria-pressed',String(editing));
    editButton.textContent=editing?'位置の調整を終える':'卵の上で位置を指定';
    panel.classList.toggle('is-placing',editing);
    canvas.classList.toggle('placing-light',editing);
    document.querySelector('#light-edit-hint').hidden=!editing;
    marker.hidden=!editing||!hitScreen;
    dirty=true;
  }
  function place(clientX,clientY) {
    egg.updateWorldMatrix(true,false);camera.updateWorldMatrix(true,false);
    const rect=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((clientX-rect.left)/rect.width*2-1,1-(clientY-rect.top)/rect.height*2),camera);
    const hit=raycaster.intersectObject(egg,false)[0];
    if(!hit)return false;
    normalMatrix.getNormalMatrix(egg.matrixWorld);
    const normal=(hit.normal??hit.face.normal).clone().applyNormalMatrix(normalMatrix);
    const incident=hit.point.clone().sub(camera.position).normalize();
    setDirection(incident.reflect(normal).normalize());
    dirty=true;
    return true;
  }
  function fromMini(event) {
    if(!crop)return false;
    const rect=pad.getBoundingClientRect();
    return place(crop.left+(event.clientX-rect.left)/rect.width*crop.width,crop.top+(event.clientY-rect.top)/rect.height*crop.height);
  }
  function bindDrag(element,pick,enabled) {
    element.addEventListener('pointerdown',event=>{
      if(motionState.uiHidden||!enabled()||event.button!==0)return;
      if(!pick(event))return;
      event.preventDefault();event.stopPropagation();
      dragging=true;freeze();element.setPointerCapture(event.pointerId);
    });
    element.addEventListener('pointermove',event=>{
      if(motionState.uiHidden||!enabled())return;
      event.stopPropagation();if(dragging)pick(event);
    });
    for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,()=>{dragging=false;freeze();});
  }
  bindDrag(pad,fromMini,()=>true);
  bindDrag(canvas,event=>place(event.clientX,event.clientY),()=>editing);
  editButton.addEventListener('click',()=>setEditing(!editing));
  window.addEventListener('keydown',event=>{if(!motionState.uiHidden&&event.key==='Escape')setEditing(false);});
  panel.addEventListener('toggle',()=>{if(!panel.open)setEditing(false);dirty=true;});
  pad.addEventListener('keydown',event=>{
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(!delta||!hitScreen||!crop)return;
    event.preventDefault();
    const step=event.shiftKey?.05:.015;
    place(hitScreen.x+delta[0]*crop.width*step,hitScreen.y+delta[1]*crop.height*step);
  });
  document.querySelectorAll('[data-light-preset]').forEach(button=>button.addEventListener('click',()=>{
    if(!crop)return;
    const points={left:[.34,.30],right:[.66,.30],top:[.5,.22],front:[.5,.5]};
    const [x,y]=points[button.dataset.lightPreset];place(crop.left+x*crop.width,crop.top+y*crop.height);
  }));
  function update(now) {
    if(!panel.open&&!editing)return;
    if(!dirty&&now-lastUpdate<80)return;
    dirty=false;lastUpdate=now;
    const rect=canvas.getBoundingClientRect();
    const light=getDirection();
    normalMatrix.getNormalMatrix(egg.matrixWorld);
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,best=-Infinity;
    // Sample the actual mesh and interpolated normals, including egg taper,
    // camera perspective and its current rotation. No generic sphere proxy.
    for(let i=0;i<position.count;i++) {
      p.fromBufferAttribute(position,i).applyMatrix4(egg.matrixWorld);
      projected.copy(p).project(camera);
      const x=rect.left+(projected.x+1)*rect.width/2, y=rect.top+(1-projected.y)*rect.height/2;
      minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      n.fromBufferAttribute(normals,i).applyNormalMatrix(normalMatrix);
      view.copy(camera.position).sub(p).normalize();
      if(n.dot(view)<=0)continue;
      const score=reflection.copy(view).negate().reflect(n).dot(light);
      if(score>best){best=score;bestPoint.copy(p);}
    }
    if(pad.clientHeight>0)previewAspect=pad.clientWidth/pad.clientHeight;
    const aspect=previewAspect;
    const height=Math.max((maxY-minY)*1.1,(maxX-minX)*1.1/aspect),width=height*aspect;
    crop={left:(minX+maxX-width)/2,top:(minY+maxY-height)/2,width,height};
    const scale=canvas.width/rect.width;
    context.clearRect(0,0,miniature.width,miniature.height);
    context.drawImage(canvas,(crop.left-rect.left)*scale,(crop.top-rect.top)*scale,crop.width*scale,crop.height*scale,0,0,miniature.width,miniature.height);
    projected.copy(bestPoint).project(camera);
    hitScreen={x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};
    const x=(hitScreen.x-crop.left)/crop.width,y=(hitScreen.y-crop.top)/crop.height;
    dot.style.left=x*100+'%';dot.style.top=y*100+'%';
    marker.style.left=hitScreen.x+'px';marker.style.top=hitScreen.y+'px';
    const active=best>.985;
    dot.hidden=!active;marker.hidden=!editing||!active;
    const side=x<.45?'左':x>.55?'右':'中央';
    const heightLabel=y<.4?'上':y>.6?'下':'';
    const controls=document.querySelector('[data-light="strength"]');
    const reflectionControl=document.querySelector('[data-light="reflection"]');
    const lightOff=Number(controls.value)===0||Number(reflectionControl.value)===0;
    feedback.textContent=lightOff?'反射は非表示です（明るさ・反射の強さを上げる）':active?`ハイライト：${side}${heightLabel}（横 ${Math.round(x*100)}%・縦 ${Math.round(y*100)}%）`:'ハイライト：輪郭付近／画面外';
    dot.hidden=!active||lightOff;marker.hidden=!editing||!active||lightOff;
    const sourceSide=light.x<-.1?'左':light.x>.1?'右':'中央';
    const sourceHeight=light.y>.12?'上':light.y<-.12?'下':'';
    sourceFeedback.textContent=`光源：${light.z>=0?'手前':'奥'}・${sourceSide}${sourceHeight}`;
    pad.setAttribute('aria-label',feedback.textContent+'。卵をドラッグ、または矢印キーでハイライト位置を指定。');
  }
  return {update,markDirty:()=>{dirty=true;},setEditing,get crop(){return crop;},get hitScreen(){return hitScreen;}};
}
