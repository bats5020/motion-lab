// Rendering size is independent from the editor's available display area.
export function setupPreviewViewport({container,onChange}) {
  const workspace=document.querySelector('#preview-workspace');
  const widthInput=document.querySelector('#preview-width'),heightInput=document.querySelector('#preview-height');
  const preset=document.querySelector('#preview-preset'),output=document.querySelector('#preview-size');
  let settings={mode:'window',width:1440,height:900},lastLayout;
  const clean=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?Math.round(Math.max(240,Math.min(3840,value))):fallback;
  try {
    const raw=new URLSearchParams(globalThis.__eggInitialSearch??location.search).get('previewViewport')??localStorage.getItem('fennel.egg.viewport.v1');
    if(raw){const saved=JSON.parse(raw);if(saved&&typeof saved==='object')settings={mode:saved.mode==='fixed'?'fixed':'window',width:clean(saved.width,1440),height:clean(saved.height,900)};}
  }catch{}
  function commit(width,height,mode='fixed') {
    settings={mode,width:clean(width,settings.width),height:clean(height,settings.height)};
    try{localStorage.setItem('fennel.egg.viewport.v1',JSON.stringify(settings));}catch{}
    onChange();
  }
  for(const input of [widthInput,heightInput])input.addEventListener('change',()=>{
    const w=widthInput.valueAsNumber,h=heightInput.valueAsNumber;
    if(!Number.isFinite(w)||!Number.isFinite(h)){layout();return;}
    commit(w,h);
  });
  preset.addEventListener('change',()=>{
    if(preset.value==='window')commit(innerWidth,innerHeight,'window');
    else if(preset.value!=='custom'){const [w,h]=preset.value.split('x').map(Number);commit(w,h);}
    else commit(+widthInput.value,+heightInput.value);
  });
  document.querySelector('#preview-swap').addEventListener('click',()=>commit(+heightInput.value,+widthInput.value));
  function layout() {
    const width=settings.mode==='window'?innerWidth:settings.width;
    const height=settings.mode==='window'?innerHeight:settings.height;
    const scale=Math.min(1,workspace.clientWidth/width,workspace.clientHeight/height);
    container.style.width=width*scale+'px';container.style.height=height*scale+'px';
    widthInput.value=String(width);heightInput.value=String(height);
    const matching=width+'x'+height;
    preset.value=settings.mode==='window'?'window':[...preset.options].some(option=>option.value===matching)?matching:'custom';
    output.textContent=`表示 ${Math.round(scale*100)}%`;
    output.title=`描画サイズ ${width} × ${height} CSS px。縮小してもレイアウトの基準サイズは変わりません。`;
    lastLayout={width,height,scale};return lastLayout;
  }
  return {workspace,layout,setSize:commit,serialize:()=>({...settings}),get size(){return {...lastLayout};}};
}
