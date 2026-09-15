import * as THREE from './vendor/three.module.js';

const defaults=()=>({source:'original',scale:100,angle:0,warp:120,seed:1,x:0,y:0,recolor:false,height:100,softness:35,grain:0,stops:[0,.43,.74,1],colors:['#229dcf','#fcf8d8','#eb995b','#ff4f03']});
const limits={scale:[25,300],angle:[-180,180],warp:[0,300],seed:[1,999],x:[-100,100],y:[-100,100],height:[20,200],softness:[0,100],grain:[0,100]};
const storageKey='fennel.egg.pattern.v1';
function imageStore(value) {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('fennel-egg-assets',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('images');
    request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('画像保存用データベースを開けませんでした'));
    request.onsuccess=()=>{
      const db=request.result,tx=db.transaction('images',value===undefined?'readonly':'readwrite'),store=tx.objectStore('images');
      const query=value===undefined?store.get('pattern'):store.put(value,'pattern');let result;
      query.onsuccess=()=>{result=query.result;};tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=()=>{db.close();reject(tx.error);};
    };
  });
}
export async function setupPatternControls({material,originalTexture,renderer,selectSurface,lightingControls,scrollControls}) {
  const panel=document.querySelector('#pattern-panel'),status=document.querySelector('#pattern-status'),uniforms=material.userData.flowUniforms;
  let settings=defaults(),customTexture=null,imageData=null,imageName='',revision=0;
  const params=new URLSearchParams(globalThis.__eggInitialSearch??location.search);
  try {
    const saved=JSON.parse(params.get('pattern')??localStorage.getItem(storageKey)??'null');
    if(saved&&typeof saved==='object'){
      if(['original','image','marble','gradient','flame'].includes(saved.source))settings.source=saved.source;
      for(const [key,[min,max]] of Object.entries(limits))if(Number.isFinite(saved[key]))settings[key]=Math.max(min,Math.min(max,saved[key]));
      if(Array.isArray(saved.colors)&&[4,8].includes(saved.colors.length)&&saved.colors.every(c=>/^#[0-9a-f]{6}$/i.test(c))){
        const stops=saved.stops??(saved.colors.length===4?[0,.43,.74,1]:null);
        if(Array.isArray(stops)&&stops.length===saved.colors.length&&stops[0]===0&&stops.at(-1)===1&&stops.every((p,i)=>Number.isFinite(p)&&p>=0&&p<=1&&(!i||p>stops[i-1]))){settings.colors=saved.colors.slice(0,4);settings.stops=saved.colors.length===8?[0,.43,.74,1]:[...stops];}
      }
      settings.recolor=saved.recolor===true;
    }
  }catch{}
  async function loadImage(data,name,token=revision) {
    const texture=await new THREE.TextureLoader().loadAsync(data);
    if(token!==revision){texture.dispose();return;}
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
    const old=customTexture;customTexture=texture;imageData=data;imageName=name;apply();old?.dispose();
  }
  // Standalone exports use their own asset and never substitute a locally saved image.
  try {
    const saved=globalThis.__eggEmbed?globalThis.__eggEmbed.patternImage:params.has('pattern')&&settings.source==='image'?null:await imageStore();
    if(saved?.data&&/^data:image\/(png|jpeg|webp);base64,/.test(saved.data))await loadImage(saved.data,saved.name??'読み込み画像');
  }catch{status.textContent='保存した画像を読み込めませんでした。画像を選び直してください。';}
  if(settings.source==='image'&&!customTexture){settings.source='original';status.textContent='画像データがありません。画像を選ぶか、画像込みのHTMLを開いてください。';}
  function apply(save=false) {
    uniforms.flowMode.value={original:0,image:1,marble:2,gradient:3,flame:4}[settings.source];
    uniforms.flowFlameHeight.value=settings.height/100;uniforms.flowSoftness.value=settings.softness/100;uniforms.flowGrain.value=settings.grain/100;
    uniforms.flowScale.value=settings.scale/100;uniforms.flowAngle.value=settings.angle*Math.PI/180;
    uniforms.flowWarp.value=settings.warp/100;uniforms.flowSeed.value=settings.seed;
    uniforms.flowShift.value.set(settings.x/100,settings.y/100);uniforms.flowRecolor.value=+settings.recolor;
    uniforms.flowColorCount.value=settings.colors.length;
    for(let i=0;i<8;i++){uniforms.flowColors.value[i].set(settings.colors[i]??settings.colors.at(-1));uniforms.flowStops.value[i]=settings.stops[i]??1;}
    material.map=settings.source==='image'&&customTexture?customTexture:originalTexture;
    document.querySelector('#pattern-source').value=settings.source;
    for(const key of Object.keys(limits)){
      panel.querySelectorAll(`[data-pattern="${key}"]`).forEach(input=>input.value=settings[key]);
    }
    const swatches=panel.querySelector('.pattern-colors');
    if(swatches.children.length!==settings.colors.length){
      swatches.replaceChildren(...settings.colors.map((color,i)=>{const input=document.createElement('input');input.type='color';input.dataset.patternColor=i;return input;}));
    }
    panel.querySelectorAll('[data-pattern-color]').forEach((input,i)=>{input.value=settings.colors[i];input.setAttribute('aria-label',`柄の色${i+1}（${settings.stops[i]*100}%）`);input.title=`${settings.stops[i]*100}% · ${settings.colors[i].toUpperCase()}`;});
    document.querySelector('#pattern-gradient-strip').style.background='linear-gradient(to right,'+settings.colors.map((c,i)=>c+' '+settings.stops[i]*100+'%').join(',')+')';
    document.querySelector('#pattern-recolor').checked=settings.recolor;
    document.querySelector('#pattern-image-name').textContent=imageName||'画像未選択';
    document.querySelector('#pattern-recolor-row').hidden=settings.source!=='image';
    document.querySelector('#pattern-palette').hidden=settings.source==='image'&&!settings.recolor;
    panel.querySelectorAll('[data-generated]').forEach(node=>node.hidden=!['marble','flame'].includes(settings.source));
    panel.querySelectorAll('[data-flame]').forEach(node=>node.hidden=settings.source!=='flame');
    document.querySelector('#pattern-settings .pattern-upload').hidden=settings.source==='flame';document.querySelector('#pattern-image-name').hidden=settings.source==='flame';
    document.querySelector('#pattern-palette legend').textContent=['flame','gradient'].includes(settings.source)?'配色 · 下側から上側へ':'配色 · 左から色1〜'+settings.colors.length;
    lightingControls.placement.markDirty();
    if(save)try{localStorage.setItem(storageKey,JSON.stringify(settings));status.textContent=settings.source==='image'?'画像ごと渡す場合はExportのHTML保存を使ってください。':'変更をこのブラウザに保存しました。';}catch{status.textContent='保存領域を利用できません。設定を残すにはHTMLで保存してください。';}
  }
  function edit(){selectSurface('pattern');apply(true);}
  function appearance(name){
    document.querySelector('#pattern-settings').hidden=name!=='pattern';document.querySelector('#logo-settings').hidden=name!=='logo';
    panel.querySelectorAll('[data-appearance]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.appearance===name)));
  }
  panel.querySelectorAll('[data-appearance]').forEach(button=>button.addEventListener('click',()=>appearance(button.dataset.appearance)));
  if(params.get('appearance')==='logo')appearance('logo');
  panel.addEventListener('pointermove',event=>event.stopPropagation());
  document.querySelector('#pattern-open').addEventListener('click',()=>{
    panel.hidden=!panel.hidden;
    document.querySelector('#pattern-open').setAttribute('aria-expanded',String(!panel.hidden));
    if(!panel.hidden){scrollControls.gizmo.setEditing(false);lightingControls.placement.setEditing(false);document.querySelector('#scroll-panel').open=false;document.querySelector('#lighting-panel').open=false;}
  });
  const close=()=>{panel.hidden=true;document.querySelector('#pattern-open').setAttribute('aria-expanded','false');};
  document.querySelector('#pattern-close').addEventListener('click',close);
  for(const id of ['scroll-panel','lighting-panel'])document.getElementById(id).addEventListener('toggle',event=>{if(event.target.open)close();});
  document.querySelector('#pattern-source').addEventListener('change',event=>{
    if(event.target.value==='image'&&!customTexture){event.target.value=settings.source;status.textContent='先に「画像を読み込む」で画像を選んでください。';return;}
    settings.source=event.target.value;edit();
  });
  panel.querySelectorAll('[data-pattern]').forEach(input=>input.addEventListener('input',()=>{
    const key=input.dataset.pattern,value=input.valueAsNumber;if(!Number.isFinite(value))return;
    settings[key]=Math.max(limits[key][0],Math.min(limits[key][1],value));edit();
  }));
  panel.querySelectorAll('[data-pattern][type=number]').forEach(input=>input.addEventListener('change',()=>apply()));
  panel.querySelector('.pattern-colors').addEventListener('input',event=>{if(event.target.matches('[data-pattern-color]')){settings.colors[+event.target.dataset.patternColor]=event.target.value;edit();}});
  document.querySelector('#pattern-thermal-colors').addEventListener('click',()=>{
    settings.colors=['#1E9BD8','#FBF7DF','#E88E4A','#F43D05'];
    settings.stops=[0,.43,.74,1];
    if(settings.source==='image')settings.recolor=true;
    edit();status.textContent='指定グラデーションの主要4色を反映しました。';
  });
  const flamePresets={
    red:{colors:['#07162d','#ff202e','#fff7df','#6d465f'],warp:160,height:140,softness:30,grain:12,seed:4},
    warm:{colors:['#22262e','#b72220','#ffb84b','#81718b'],warp:65,height:125,softness:70,grain:12,seed:2},
    pink:{colors:['#23232b','#f0782e','#ffc3a3','#eb568e'],warp:210,height:160,softness:50,grain:85,seed:7}
  };
  panel.querySelectorAll('[data-flame-preset]').forEach(button=>button.addEventListener('click',()=>{
    revision++;settings={...defaults(),...flamePresets[button.dataset.flamePreset],source:'flame'};settings.colors=[...settings.colors];edit();
  }));
  document.querySelector('#pattern-recolor').addEventListener('change',event=>{settings.recolor=event.target.checked;edit();});
  document.querySelector('#pattern-shuffle').addEventListener('click',()=>{settings.seed=1+Math.floor(Math.random()*999);edit();});
  document.querySelector('#pattern-reset').addEventListener('click',()=>{revision++;settings=defaults();edit();});
  document.querySelector('#pattern-upload').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    const token=++revision;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){status.textContent='PNG・JPEG・WebPを選んでください。';return;}
    if(file.size>20*1024*1024){status.textContent='20MB以下の画像を選んでください。';return;}
    status.textContent='画像を読み込んでいます…';
    try {
      const bitmap=await createImageBitmap(file);
      const scale=Math.min(1,2048/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      const context=canvas.getContext('2d');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      const data=canvas.toDataURL('image/png');if(token!==revision)return;
      await loadImage(data,file.name,token);if(token!==revision)return;
      settings.source='image';settings.recolor=false;edit();
      try{await imageStore({data,name:file.name});}catch{status.textContent='画像の自動保存に失敗しました。画像を残すにはHTMLで保存してください。';}
    }catch{status.textContent='画像を読み込めませんでした。別のPNG・JPEG・WebPを選んでください。';}
  });
  apply();
  if(!globalThis.__eggEmbed&&params.get('panel')==='pattern')document.querySelector('#pattern-open').click();
  return {serialize:()=>structuredClone(settings),get image(){return imageData?{data:imageData,name:imageName}:null;}};
}
