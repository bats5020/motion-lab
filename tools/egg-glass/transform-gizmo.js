import * as THREE from './vendor/three.module.js';

export function setupTransformGizmo({root,egg,pivot,camera,renderer,motionState,getPose,beginEdit,changePose,onEditing}) {
  const canvas=renderer.domElement,box=document.querySelector('#transform-box'),gizmo=document.querySelector('#transform-gizmo');
  const toggle=document.querySelector('#object-edit'),hint=document.querySelector('#object-edit-hint');
  const panel=document.querySelector('#scroll-panel');
  const raycaster=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,0,1),0);
  const point=new THREE.Vector3(),projected=new THREE.Vector3();
  let editing=false,drag=null,bounds=null,center=null;
  const positions=egg.geometry.attributes.position;
  function setEditing(value) {
    editing=value;motionState.objectEditing=value;
    toggle.setAttribute('aria-pressed',String(value));toggle.textContent=value?'位置の編集を終える':'卵をドラッグして編集';
    canvas.classList.toggle('moving-object',value);panel.classList.toggle('is-moving',value);
    document.body.classList.toggle('editing-object',value);
    box.hidden=gizmo.hidden=hint.hidden=!value;
    if(value){document.querySelector('#lighting-panel').open=false;beginEdit();}
    if(!value)drag=null;
    onEditing(value);
  }
  toggle.addEventListener('click',()=>setEditing(!editing));
  document.querySelector('#light-edit').addEventListener('click',()=>{if(editing)setEditing(false);});
  function intersect(event) {
    const rect=canvas.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2),camera);
    return raycaster.ray.intersectPlane(plane,point)?.clone();
  }
  function start(event,axis) {
    if(motionState.uiHidden||!editing||event.button!==0)return;
    const world=intersect(event);if(!world)return;
    if(axis==='free'&&!raycaster.intersectObject(egg,false).length)return;
    beginEdit();update();
    const height=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.position.z;
    drag={axis,world,pose:{...getPose()},height,width:height*camera.aspect,center:{...center},radius:Math.hypot(event.clientX-center.x,event.clientY-center.y)};
    event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture(event.pointerId);
    canvas.focus({preventScroll:true});
  }
  function move(event) {
    if(motionState.uiHidden||!editing)return;
    event.stopPropagation();if(!drag)return;
    const world=intersect(event);if(!world)return;
    const next={...drag.pose};
    if(drag.axis==='scale') {
      next.scale=drag.pose.scale*Math.hypot(event.clientX-drag.center.x,event.clientY-drag.center.y)/Math.max(1,drag.radius);
    } else {
      if(drag.axis!=='y')next.x+=(world.x-drag.world.x)/drag.width*100;
      if(drag.axis!=='x')next.y+=(world.y-drag.world.y)/drag.height*100;
    }
    changePose(next);
  }
  function bind(element,axis) {
    element.addEventListener('pointerdown',event=>start(event,axis));
    element.addEventListener('pointermove',move);
    for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,()=>{drag=null;});
  }
  canvas.tabIndex=0;
  bind(canvas,'free');
  document.querySelectorAll('[data-axis]').forEach(element=>bind(element,element.dataset.axis));
  window.addEventListener('keydown',event=>{
    if(motionState.uiHidden)return;
    if(event.key==='Escape'){setEditing(false);return;}
    if(!editing||!['CANVAS','BUTTON'].includes(document.activeElement.tagName))return;
    if(document.activeElement!==canvas&&!gizmo.contains(document.activeElement)&&!box.contains(document.activeElement))return;
    const delta={ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['y',1],ArrowDown:['y',-1]}[event.key];
    if(!delta)return;
    event.preventDefault();beginEdit();const pose={...getPose()};pose[delta[0]]+=delta[1]*(event.shiftKey?5:.5);changePose(pose);
  });
  function update() {
    if(!editing)return;
    const rect=canvas.getBoundingClientRect();
    let left=Infinity,right=-Infinity,top=Infinity,bottom=-Infinity;
    for(let i=0;i<positions.count;i+=2) {
      projected.fromBufferAttribute(positions,i).applyMatrix4(egg.matrixWorld).project(camera);
      const x=rect.left+(projected.x+1)*rect.width/2,y=rect.top+(1-projected.y)*rect.height/2;
      left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    bounds={left,top,right,bottom};
    projected.setFromMatrixPosition(pivot.matrixWorld).project(camera);
    center={x:rect.left+(projected.x+1)*rect.width/2,y:rect.top+(1-projected.y)*rect.height/2};
    Object.assign(box.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
    Object.assign(gizmo.style,{left:center.x+'px',top:center.y+'px'});
    const lowerEdge=rect.bottom-18;
    const scaleHandle=box.querySelector('[data-axis=scale]');
    Object.assign(scaleHandle.style,{left:THREE.MathUtils.clamp(right,rect.left+18,rect.right-18)+'px',top:THREE.MathUtils.clamp(bottom,rect.top+18,lowerEdge)+'px'});
    gizmo.classList.toggle('flip-x',center.x>rect.right-110);
    gizmo.classList.toggle('flip-y',center.y<rect.top+110);
    const pose=getPose();document.querySelector('#object-pose').textContent=`X ${pose.x}% / Y ${pose.y}% / ${pose.scale}%`;
  }
  return {setEditing,update,get editing(){return editing;},get bounds(){return bounds;},get center(){return center;}};
}
