import * as THREE from './vendor/three.module.js';
import { createShellMaps, addPaintWear } from './shell-material.js';
import { applyFlowMapping } from './flow-mapping.js';
import { setupLightingControls } from './lighting-controls.js';
import { LIGHT_SOURCE } from './light-placement.js';
import { setupScrollControls } from './scroll-controls.js';
import { createSvgBackground } from './svg-background.js';
import { setupPreviewViewport } from './preview-viewport.js';
import { setupExports } from './export-controls.js';
import { setupPatternControls } from './pattern-controls.js';
import { setupLogoControls } from './logo-controls.js';

const container = document.querySelector('#scene');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const state = { mode: 'blend', paused: reducedMotion.matches, pointerX: 0, pointerY: 0, scroll: 0, rotation: globalThis.__eggEmbed?.rotation??0 };
const requestedMode=new URLSearchParams(globalThis.__eggInitialSearch??location.search).get('motionMode');
if(['blend','auto','scroll'].includes(requestedMode))state.mode=requestedMode;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
} catch (error) {
  document.querySelector('#fallback').hidden = false;
  document.querySelector('.controls').hidden = true;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x141416, 1);
container.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, .1, 100);
camera.position.set(0, .08, 8.5);
camera.lookAt(0, 0, 0);
let patternTexture;
try {
  patternTexture = await new THREE.TextureLoader().loadAsync('./assets/thermal-flow-pattern.png');
  for(const texture of [patternTexture]) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  }
} catch(error) {
  const fallback = document.querySelector('#fallback');
  fallback.textContent = '画像を読み込めませんでした。ページを再読み込みしてください。';
  fallback.hidden = false;
  throw error;
}

// Graduated surroundings and feathered oval sources give a polished curved reflection.
const studio = new THREE.Scene();
studio.background = new THREE.Color(.20, .22, .24);
const lightDome = new THREE.Mesh(new THREE.SphereGeometry(18,48,32),new THREE.ShaderMaterial({
  side:THREE.BackSide,depthWrite:false,toneMapped:false,
  uniforms:{mainLightDirection:{value:LIGHT_SOURCE}},
  vertexShader:'varying vec3 lightDirection;void main(){lightDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:`varying vec3 lightDirection;uniform vec3 mainLightDirection;
    void main(){
      vec3 d=normalize(lightDirection);
      float sky=smoothstep(-.6,.75,d.y);
      vec3 base=mix(vec3(.08,.10,.13),vec3(.85,.88,.9),sky);
      float broadLight=exp(-pow((1.-dot(d,normalize(vec3(-.65,.6,.3))))/.25,2.));
      vec3 source=mainLightDirection;
      vec3 horizontal=normalize(cross(vec3(0.,1.,0.),source));
      vec3 vertical=cross(source,horizontal);
      float facing=max(dot(d,source),0.);
      vec2 oval=vec2(dot(d,horizontal)/.15,dot(d,vertical)/.32);
      float polish=exp(-dot(oval,oval)*2.)*smoothstep(.2,.7,facing);
      vec3 rimSource=normalize(vec3(.82,.25,-.3));
      float rim=exp((dot(d,rimSource)-1.)/.045);
      gl_FragColor=vec4(base+vec3(.5,.52,.53)*broadLight+vec3(16.,15.7,15.)*polish+vec3(1.8,2.,2.1)*rim,1.);
    }`
}));
studio.add(lightDome);
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(studio, .008, .1, 30, {size:512});
scene.environment = environment.texture;
pmrem.dispose();
studio.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
const key = new THREE.DirectionalLight('#fffaf3', 2.2);
key.position.set(-3, 5, 4);
scene.add(key);
const fill = new THREE.DirectionalLight('#e9efff', .28);
fill.position.set(4, 0, 3);
scene.add(fill);
const lowerFill = new THREE.DirectionalLight('#ffffff', .65);
lowerFill.position.set(-1, -3, 5);
scene.add(lowerFill);
const patternFill = new THREE.HemisphereLight('#ffffff','#929ba4',1.35);
scene.add(patternFill);

const geometry = new THREE.SphereGeometry(1, 160, 112);
const position = geometry.attributes.position;
for (let i=0; i<position.count; i++) {
  const y = position.getY(i);
  const width = 1.19 * (1 - .135*y);
  position.setXYZ(i, position.getX(i)*width, y*1.53, position.getZ(i)*width);
}
geometry.computeVertexNormals();
const originalUv = geometry.attributes.uv;
// User palette, ordered by physical height: orange base → cream → blue crown.
// Original cylindrical flow field: a local vortex bends the transitions without
// introducing a UV seam. The colors belong to the mesh and turn with the egg.
const gradientStops = [
  [0, '#FF5A2A'], [.16, '#FF5A2A'], [.35, '#E6A06D'],
  [.49, '#F2EFC9'], [.68, '#54B6DF'], [1, '#54B6DF']
].map(([height, hex]) => ({ height, color: new THREE.Color(hex) }));
function sampleGradient(height) {
  const h = THREE.MathUtils.clamp(height, 0, 1);
  for (let i = 1; i < gradientStops.length; i++) {
    const a = gradientStops[i-1], b = gradientStops[i];
    if (h <= b.height) {
      const t = THREE.MathUtils.smoothstep(h, a.height, b.height);
      return a.color.clone().lerp(b.color, t);
    }
  }
  return gradientStops.at(-1).color.clone();
}
const vertexColors = new Float32Array(position.count * 3);
for (let i = 0; i < position.count; i++) {
  const x = position.getX(i), y = position.getY(i) / 1.53, z = position.getZ(i);
  const angle = Math.atan2(x, z);
  const flowX = angle * .68;
  const flowY = y + .05;
  const radius = Math.hypot(flowX, flowY);
  const influence = 1 - THREE.MathUtils.smoothstep(radius, 0, 1.1);
  const turn = -5.7 * influence * influence;
  const warpedY = flowX * Math.sin(turn) + flowY * Math.cos(turn) - .05;
  const poleFade = Math.max(0, 1-y*y);
  const ripple = poleFade * (.025*Math.sin(angle*3 + y*4) + .014*Math.sin(angle*5 - y*7));
  const height = (warpedY+1)/2 + ripple;
  const color = sampleGradient(height);
  vertexColors.set([color.r, color.g, color.b], i*3);
}
const paintedColors = new THREE.BufferAttribute(vertexColors, 3);
const glassColors = new Float32Array(position.count*3);
const warmGlass = new THREE.Color('#ffe2ca');
const coolGlass = new THREE.Color('#c9eaf2');
const clearGlass = new THREE.Color('#ffffff');
for(let i=0;i<position.count;i++) {
  const height = (position.getY(i)/1.53+1)/2;
  const tint = height<.5
    ? warmGlass.clone().lerp(clearGlass,THREE.MathUtils.smoothstep(height,0,.5))
    : clearGlass.clone().lerp(coolGlass,THREE.MathUtils.smoothstep(height,.5,1));
  glassColors.set([tint.r,tint.g,tint.b],i*3);
}
const tintedColors = new THREE.BufferAttribute(glassColors,3);
geometry.setAttribute('color', tintedColors);
const glassParameters = {
  color: '#ffffff', metalness: 0, roughness: .022, toneMapped: false,
  transmission: 1, thickness: .22, ior: 1.46, dispersion: .025,
  attenuationColor: '#ffffff', attenuationDistance: Infinity,
  clearcoat: 0, envMapIntensity: .95
};
const materials = {
  clear: new THREE.MeshPhysicalMaterial(glassParameters),
  tint: new THREE.MeshPhysicalMaterial({...glassParameters,vertexColors:true,attenuationColor:'#ffffff'}),
  pattern: new THREE.MeshPhysicalMaterial({...glassParameters,map:patternTexture,transmission:.58,roughness:.035,thickness:.3,envMapIntensity:.9})
};
applyFlowMapping(materials.pattern);
function paintedMaterial() {
  if(materials.painted) return materials.painted;
  const shell = createShellMaps(renderer);
  materials.painted = new THREE.MeshPhysicalMaterial({
    color: '#ffffff', vertexColors: true, metalness: 0, roughness: 1,
    map: shell.albedo, bumpMap: shell.bump, bumpScale: .11,
    aoMap: shell.surface, aoMapIntensity: .85,
    roughnessMap: shell.surface, clearcoat: .12, clearcoatRoughness: .48,
    envMapIntensity: .9
  });
  addPaintWear(materials.painted);
  logoControls?.attach(materials.painted);
  return materials.painted;
}
const material = materials.clear;
const egg = new THREE.Mesh(geometry, material);
const pivot = new THREE.Group();
const motionRoot = new THREE.Group();
pivot.add(egg); motionRoot.add(pivot); scene.add(motionRoot);
pivot.rotation.z = -.055;

// A real backdrop in the 3D scene is visible through and refracted by the glass.
// HTML behind a transparent canvas cannot participate in WebGL refraction.
scene.background = new THREE.Color('#141417');
const svgBackground=await createSvgBackground({camera,scene});
const backdrop=svgBackground.group;
const surfaceButtons = [...document.querySelectorAll('[data-surface]')];
let lightingControls,scrollControls,previewViewport,patternControls,logoControls;
function selectSurface(name) {
  egg.material = name==='painted' ? paintedMaterial() : materials[name];
  geometry.setAttribute('color',name==='painted' ? paintedColors : tintedColors);
  geometry.setAttribute('uv',originalUv);
  surfaceButtons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.surface===name)));
  backdrop.visible = document.querySelector('#backdrop').getAttribute('aria-pressed')==='true';
  key.visible = fill.visible = lowerFill.visible = name==='painted';
  patternFill.visible = name==='pattern';
  document.querySelector('.transparency').hidden = name!=='pattern';
  lightingControls?.apply();
}
surfaceButtons.forEach(button=>button.addEventListener('click',()=>selectSurface(button.dataset.surface)));
const backdropButton = document.querySelector('#backdrop');
backdropButton.addEventListener('click',()=>{
  const visible = backdropButton.getAttribute('aria-pressed')!=='true';
  backdropButton.setAttribute('aria-pressed',String(visible));
  backdrop.visible = visible;
});
const transparency = document.querySelector('#transparency');
transparency.addEventListener('input',()=>{
  materials.pattern.transmission = Number(transparency.value)/100;
  document.querySelector('#transparency-value').textContent = transparency.value+'%';
});
if(new URLSearchParams(globalThis.__eggInitialSearch??location.search).get('backdrop')==='0')backdropButton.click();
const requestedSurface = new URLSearchParams(globalThis.__eggInitialSearch??location.search).get('material');
selectSurface(['clear','tint','painted'].includes(requestedSurface) ? requestedSurface : 'pattern');
lightingControls=setupLightingControls({scene,materials,key,fill,lowerFill,patternFill,egg,camera,renderer,motionState:state,getScrollSettings:()=>scrollControls?.serialize(),getPreviewSettings:()=>previewViewport?.serialize(),getPatternSettings:()=>patternControls?.serialize(),getLogoSettings:()=>logoControls?.serialize()});
scrollControls=setupScrollControls({root:motionRoot,egg,pivot,camera,renderer,svgBackground,motionState:state,shareUrl:()=>lightingControls.shareUrl(),getViewport:()=>previewViewport?.size??{width:innerWidth,height:innerHeight},setViewport:(width,height)=>previewViewport.setSize(width,height)});

const buttons = [...document.querySelectorAll('[data-mode]')];
const pauseButton = document.querySelector('#pause');
function updatePause() {
  pauseButton.setAttribute('aria-pressed', String(state.paused));
  pauseButton.textContent = state.paused ? '再生' : '一時停止';
}
buttons.forEach(button => button.addEventListener('click', () => {
  state.mode = button.dataset.mode;
  buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  document.querySelector('#hint').textContent = state.mode === 'auto' ? 'ゆっくり自動回転' : state.mode === 'scroll' ? '下にスクロールして回転' : 'マウスを動かす / 下にスクロール';
}));
pauseButton.addEventListener('click', () => { state.paused = !state.paused; updatePause(); });
document.querySelector(`[data-mode="${state.mode}"]`).click();
reducedMotion.addEventListener('change', e => { state.paused = e.matches; updatePause(); });
updatePause();
previewViewport=setupPreviewViewport({container,onChange:resize});
// Use the typed character so both JIS @ and US Shift+2 work.
window.addEventListener('keydown',event=>{
  if(state.exporting||document.querySelector('#export-dialog').open||event.key!=='@'||event.repeat||event.isComposing||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.target instanceof Element&&(event.target.closest('input,textarea,select')||event.target.isContentEditable))return;
  event.preventDefault();
  state.uiHidden=!state.uiHidden;
  document.body.classList.toggle('ui-hidden',state.uiHidden);
  for(const element of document.querySelector('.stage').children) {
    if(element.id==='preview-workspace'||element.id==='fallback')continue;
    if(state.uiHidden&&element.contains(document.activeElement))document.activeElement.blur();
    element.inert=state.uiHidden;
  }
  resize();
});
window.addEventListener('pointermove', e => {
  if(e.pointerType === 'touch') return;
  if(state.exporting||state.lightingEditing||state.objectEditing)return;
  const rect=container.getBoundingClientRect();
  if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom){state.pointerX=state.pointerY=0;return;}
  state.pointerX = (e.clientX-rect.left) / rect.width * 2 - 1;
  state.pointerY = (e.clientY-rect.top) / rect.height * 2 - 1;
}, { passive: true });
document.documentElement.addEventListener('pointerleave', () => { state.pointerX = state.pointerY = 0; });
function scroll() {
  state.scroll = Math.max(0, Math.min(1, scrollY / Math.max(1, document.documentElement.scrollHeight-innerHeight)));
  document.querySelector('#progress').style.transform = `scaleX(${state.scroll})`;
}
window.addEventListener('scroll', scroll, { passive: true });
function resize() {
  if(state.exporting)return;
  const {width,height} = previewViewport.layout();
  camera.aspect = width / height;
  camera.position.z = camera.aspect < .8 ? 11.1 : 8.5;
  pivot.position.y = camera.aspect < .8 ? -.22 : 0;
  camera.updateProjectionMatrix();
  svgBackground.resize(width,height);
  renderer.setPixelRatio(Math.min(devicePixelRatio,2,Math.sqrt(8388608/(width*height)),renderer.capabilities.maxTextureSize/Math.max(width,height)));
  renderer.setSize(width, height,false);
  const rect=container.getBoundingClientRect();
  document.documentElement.style.setProperty('--preview-left',rect.left+'px');
  document.documentElement.style.setProperty('--preview-top',rect.top+'px');
  document.documentElement.style.setProperty('--preview-width',rect.width+'px');
  lightingControls.placement.markDirty();
  scrollControls.resize();
  scroll();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(previewViewport.workspace);
resize();
let previous = 0;
function frame(now) {
  if(state.exporting){previous=now;return;}
  const dt = Math.min((now-previous)/1000, .05); previous = now;
  if (!state.paused && !state.lightingEditing && !state.objectEditing && !document.hidden) {
    if(state.mode !== 'scroll' && state.scrollPreview==null) state.rotation += dt * .14;
    const blend = 1 - Math.exp(-dt * 4);
    const effectiveScroll=state.scrollPreview??state.scroll;
    const scrollAngle = state.mode === 'auto' && state.scrollPreview==null ? 0 : effectiveScroll*Math.PI*1.35;
    const mouseAngle = state.mode === 'blend' ? state.pointerX*.22 : 0;
    egg.rotation.y = THREE.MathUtils.lerp(egg.rotation.y, state.rotation + scrollAngle + mouseAngle, blend);
    pivot.rotation.x = THREE.MathUtils.lerp(pivot.rotation.x, state.mode === 'blend' ? state.pointerY*.11 : 0, blend);
    pivot.rotation.z = THREE.MathUtils.lerp(pivot.rotation.z, -.055 + (state.mode === 'auto' && state.scrollPreview==null ? 0 : effectiveScroll*.18), blend);
  }
  scrollControls.update(dt);
  renderer.render(scene, camera);
  lightingControls.updatePreview(now);
  scrollControls.updateGizmo();
}
patternControls=await setupPatternControls({material:materials.pattern,originalTexture:patternTexture,renderer,selectSurface,lightingControls,scrollControls});
logoControls=await setupLogoControls({egg,pivot,state,renderer,lightingControls,scrollControls,materials});
const exportControls=setupExports({renderer,scene,camera,egg,pivot,root:motionRoot,state,scrollControls,svgBackground,previewViewport,lightingControls,patternControls,logoControls,resize});
if(globalThis.__eggEmbed){state.uiHidden=true;document.body.classList.add('ui-hidden');for(const element of document.querySelector('.stage').children)if(element.id!=='preview-workspace'&&element.id!=='fallback')element.inert=true;resize();}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => { previous = performance.now(); renderer.setAnimationLoop(document.hidden ? null : frame); });
window.__eggStudy = { state, egg, pivot, motionRoot, renderer, material, materials, backdrop, scene, lightingControls,scrollControls,svgBackground,previewViewport,patternControls,logoControls,exportControls };
document.documentElement.dataset.ready = 'true';
