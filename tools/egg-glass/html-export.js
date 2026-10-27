const textFiles=['index.html','style.css','egg.js','keyframes.js','scroll-controls.js','transform-gizmo.js','lighting-controls.js','light-placement.js','preview-viewport.js','svg-background.js','flow-mapping.js','pattern-controls.js','logo-controls.js','shell-material.js','export-controls.js','html-export.js','webm-duration.js','vendor/three.module.js','vendor/three.core.js','vendor/SVGLoader.js','vendor/LICENSE','assets/u19-background.svg'];
/* ML_KEYBOARD_BEGIN */
textFiles.push('keyboard-controls.js','editor-history.js','editor-history.css','numeric-input.js','numeric-input.css');
/* ML_KEYBOARD_END */
/* ML_EXPORT_BEGIN */
textFiles.push('export-workbench.js','export-workbench.css','export-type-shape.js');
/* ML_EXPORT_END */

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
/* ML_EXPORT_BEGIN */
  // Module execution also works for these self-contained IIFEs; no network scripts remain.
  await import('u19/export-workbench.js');
  await import('u19/export-type-shape.js');
/* ML_EXPORT_END */
}

export async function buildHtml(search,embed) {
  const files=await getFiles();
  const doc=new DOMParser().parseFromString(files['index.html'],'text/html');
/* ML_KEYBOARD_BEGIN original-base64:ICBkb2MucXVlcnlTZWxlY3RvcignbGlua1tyZWw9c3R5bGVzaGVldF0nKS5yZW1vdmUoKTtkb2MucXVlcnlTZWxlY3Rvcignc2NyaXB0W3R5cGU9bW9kdWxlXScpLnJlbW92ZSgpOw== */
  doc.querySelectorAll('link[rel=stylesheet]').forEach(link=>link.remove());doc.querySelector('script[type=module]').remove();
/* ML_KEYBOARD_END */
/* ML_EXPORT_BEGIN */
  doc.querySelectorAll('script[src="./export-workbench.js"],script[src="./export-type-shape.js"]').forEach(script=>script.remove());
/* ML_EXPORT_END */
/* ML_KEYBOARD_BEGIN original-base64:ICBjb25zdCBzdHlsZT1kb2MuY3JlYXRlRWxlbWVudCgnc3R5bGUnKTtzdHlsZS50ZXh0Q29udGVudD1maWxlc1snc3R5bGUuY3NzJ107ZG9jLmhlYWQuYXBwZW5kQ2hpbGQoc3R5bGUpOw== */
  const style=doc.createElement('style');style.textContent=[files['style.css'],files['numeric-input.css'],files['editor-history.css']].join('\n');doc.head.appendChild(style);
/* ML_KEYBOARD_END */
/* ML_EXPORT_BEGIN */
  const exportStyle=doc.createElement('style');exportStyle.textContent=files['export-workbench.css'];doc.head.appendChild(exportStyle);
/* ML_EXPORT_END */
  doc.querySelector('#mlab-home')?.remove();
  doc.body.classList.add('ui-hidden');
  const license=doc.createElement('script');license.type='text/plain';license.id='third-party-license';license.textContent=files['vendor/LICENSE'];doc.body.appendChild(license);
  const data=doc.createElement('script');data.type='application/json';data.id='u19-package';data.textContent=JSON.stringify({files,search,embed}).replaceAll('<','\\u003c');doc.body.appendChild(data);
  const script=doc.createElement('script');script.textContent=`(${boot.toString()})().catch(error=>{const node=document.querySelector('#fallback');node.hidden=false;node.textContent='3Dを開始できませんでした: '+error.message;});`;doc.body.appendChild(script);
  return new Blob(['<!doctype html>\n'+doc.documentElement.outerHTML],{type:'text/html;charset=utf-8'});
}
