import * as THREE from './vendor/three.module.js';
import {SVGLoader} from './vendor/SVGLoader.js';

// The SVG paths are the artwork source. Triangulate once; animate uniforms only.
// Keeping these surfaces in the scene makes them visible to glass transmission.
export async function createSvgBackground({camera,scene}) {
  const response=await fetch('./assets/u19-background.svg');
  if(!response.ok)throw new Error('SVG背景を読み込めませんでした');
  const source=await response.text();
  const xml=new DOMParser().parseFromString(source,'image/svg+xml');
  const svg=xml.documentElement,[, ,width,height]=svg.getAttribute('viewBox').split(/\s+/).map(Number);
  const originalPaths=[...xml.querySelectorAll('path')];
  const gradients=originalPaths.map(path=>{
    const id=path.getAttribute('fill').match(/#([^)]*)/)[1];
    const gradient=xml.getElementById(id)??xml.querySelector(`[id="${id}"]`);
    const stops=[...gradient.querySelectorAll('stop')];
    const colors=stops.map(stop=>new THREE.Color(stop.getAttribute('stop-color')).convertLinearToSRGB());
    return {side:path.closest('[data-side]').getAttribute('data-side'),colors,middle:+stops[1].getAttribute('offset'),start:new THREE.Vector2(+gradient.getAttribute('x1'),+gradient.getAttribute('y1')),end:new THREE.Vector2(+gradient.getAttribute('x2'),+gradient.getAttribute('y2'))};
  });
  originalPaths.forEach(path=>path.setAttribute('fill','#ffffff'));
  const parsed=new SVGLoader().parse(new XMLSerializer().serializeToString(xml));
  const group=new THREE.Group();group.name='SVG background';scene.add(group);
  const uniforms={
    sourceSize:{value:new THREE.Vector2(width,height)},fit:{value:new THREE.Vector2(1,1)},
    pixelWorld:{value:1},frameSize:{value:new THREE.Vector2(1,1)},zoom:{value:1},
    shift:{value:0},spread:{value:1},angle:{value:0}
  };
  parsed.paths.forEach((path,index)=>{
    const gradient=gradients[index];
    const geometry=new THREE.ShapeGeometry(SVGLoader.createShapes(path),12);
    const material=new THREE.ShaderMaterial({
      side:THREE.DoubleSide,toneMapped:false,
      uniforms:{...uniforms,gradientStart:{value:gradient.start},gradientEnd:{value:gradient.end},colorOuter:{value:gradient.colors[0]},colorMiddle:{value:gradient.colors[1]},colorInner:{value:gradient.colors[2]},middleStop:{value:gradient.middle}},
      vertexShader:`uniform vec2 sourceSize,fit;uniform float pixelWorld,zoom;
        varying vec2 artPosition,screenPosition;
        void main(){artPosition=position.xy;screenPosition=(position.xy-sourceSize*.5)*fit*zoom;
          vec3 p=vec3(screenPosition.x*pixelWorld,-screenPosition.y*pixelWorld,0.);
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
      fragmentShader:`uniform vec2 frameSize,gradientStart,gradientEnd;uniform float shift,spread,angle;
        uniform vec3 colorOuter,colorMiddle,colorInner;uniform float middleStop;varying vec2 artPosition,screenPosition;
        void main(){
          if(any(greaterThan(abs(screenPosition),frameSize*.5)))discard;
          vec2 d=gradientEnd-gradientStart;float lengthD=length(d);
          d=mat2(cos(angle),sin(angle),-sin(angle),cos(angle))*d;
          float t=clamp((dot(artPosition-gradientStart,d)/(lengthD*lengthD)-shift)/spread,0.,1.);
          vec3 color=t<middleStop?mix(colorOuter,colorMiddle,t/middleStop):mix(colorMiddle,colorInner,(t-middleStop)/(1.-middleStop));
          color=mix(color/12.92,pow((color+.055)/1.055,vec3(2.4)),step(vec3(.04045),color));
          gl_FragColor=vec4(color,1.);
          #include <colorspace_fragment>
        }`
    });
    const mesh=new THREE.Mesh(geometry,material);mesh.name=gradient.side;mesh.frustumCulled=false;group.add(mesh);
  });
  let viewport={width:1,height:1},layout={margin:32,fit:'edges'},pose={scale:100,shift:0,spread:100,angle:0};
  function resize(w=viewport.width,h=viewport.height) {
    viewport={width:w,height:h};
    const margin=Math.min(layout.margin,(Math.min(w,h)-1)/2);
    const fw=Math.max(1,w-margin*2),fh=Math.max(1,h-margin*2);
    const fx=fw/width,fy=fh/height,contain=Math.min(fx,fy);
    uniforms.fit.value.set(layout.fit==='contain'?contain:fx,layout.fit==='contain'?contain:fy);
    uniforms.frameSize.value.set(fw,fh);
    const distance=camera.position.z+2.6;
    uniforms.pixelWorld.value=2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*distance/h;
    camera.updateMatrixWorld();group.position.copy(camera.localToWorld(new THREE.Vector3(0,0,-distance)));group.quaternion.copy(camera.quaternion);
  }
  function apply(next,settings) {
    pose={...next};
    if(settings.margin!==layout.margin||settings.fit!==layout.fit){layout={...settings};resize();}
    uniforms.zoom.value=pose.scale/100;uniforms.shift.value=pose.shift/100;
    uniforms.spread.value=pose.spread/100;uniforms.angle.value=THREE.MathUtils.degToRad(pose.angle);
  }
  return {group,apply,resize,source,get pose(){return {...pose};},get layout(){return {...layout};},get frame(){return {width:uniforms.frameSize.value.x,height:uniforms.frameSize.value.y,margin:Math.min(layout.margin,(Math.min(viewport.width,viewport.height)-1)/2)};}};
}
