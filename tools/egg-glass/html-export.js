const textFiles=['index.html','style.css','egg.js','keyframes.js','scroll-controls.js','transform-gizmo.js','lighting-controls.js','light-placement.js','preview-viewport.js','svg-background.js','flow-mapping.js','pattern-controls.js','logo-controls.js','shell-material.js','export-controls.js','html-export.js','webm-duration.js','vendor/three.module.js','vendor/three.core.js','vendor/SVGLoader.js','vendor/LICENSE','assets/u19-background.svg'];

async function getFiles() {
  if(globalThis.__eggBundle)return globalThis.__eggBundle;
  const pairs=await Promise.all(textFiles.map(async path=>{
    const response=await fetch('./'+path);if(!response.ok)throw new Error(path+'を取得できませんでした');return [path,await response.text()];
  }));
  const images=await Promise.all(['assets/thermal-flow-pattern.png','assets/u19-logo.png'].map(async path=>{
    const response=await fetch('./'+path);if(!response.ok)throw new Error(path+'を取得できませんでした');
    const blob=await response.blob();
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
    return [path,data];
  }));
  return Object.fromEntries([...pairs,...images]);
}

// Runs in the downloaded document. All imports and assets resolve locally.
async function boot() {
  const payload=JSON.parse(document.querySelector('#u19-package').textContent);
  globalThis.__eggBundle=payload.files;globalThis.__eggInitialSearch=payload.search;globalThis.__eggEmbed=payload.embed;
  const files=payload.files,imports={};
  const svgUrl=URL.createObjectURL(new Blob([files['assets/u19-background.svg']],{type:'image/svg+xml'}));
  for(const [path,original] of Object.entries(files)) {
    if(!path.endsWith('.js'))continue;
    let source=original.replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_,before,relative,after)=>{
      const parts=path.split('/');parts.pop();
      for(const part of relative.split('/')){if(part==='..')parts.pop();else if(part!=='.')parts.push(part);}
      return before+'u19/'+parts.join('/')+after;
    });
    if(path==='egg.js')source=source.replaceAll('./assets/thermal-flow-pattern.png',files['assets/thermal-flow-pattern.png']);
    if(path==='logo-controls.js')source=source.replaceAll('./assets/u19-logo.png',files['assets/u19-logo.png']);
    if(path==='svg-background.js')source=source.replaceAll('./assets/u19-background.svg',svgUrl);
    imports['u19/'+path]=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  }
  const map=document.createElement('script');map.type='importmap';map.textContent=JSON.stringify({imports});document.head.appendChild(map);
  await import('u19/egg.js');
}

export async function buildHtml(search,embed) {
  const files=await getFiles();
  const doc=new DOMParser().parseFromString(files['index.html'],'text/html');
  doc.querySelector('link[rel=stylesheet]').remove();doc.querySelector('script[type=module]').remove();
  const style=doc.createElement('style');style.textContent=files['style.css'];doc.head.appendChild(style);
  doc.querySelector('#mlab-home')?.remove();
  doc.body.classList.add('ui-hidden');
  const license=doc.createElement('script');license.type='text/plain';license.id='third-party-license';license.textContent=files['vendor/LICENSE'];doc.body.appendChild(license);
  const data=doc.createElement('script');data.type='application/json';data.id='u19-package';data.textContent=JSON.stringify({files,search,embed}).replaceAll('<','\\u003c');doc.body.appendChild(data);
  const script=doc.createElement('script');script.textContent=`(${boot.toString()})().catch(error=>{const node=document.querySelector('#fallback');node.hidden=false;node.textContent='3Dを開始できませんでした: '+error.message;});`;doc.body.appendChild(script);
  return new Blob(['<!doctype html>\n'+doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'});
}
