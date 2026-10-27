const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {capability}=require('../shared/export-workbench.js');
test('Export capability refuses GPU-unavailable, explicit unsupported and failed readiness checks',()=>{
 assert.equal(capability({},{}).ok,true);
 assert.equal(capability({},{graphicsUnavailable:true}).ok,false);
 assert.deepEqual(capability({available:()=>({ok:false,reason:'alpha unsupported'})}),{ok:false,reason:'alpha unsupported'});
 assert.equal(capability({available:()=>{throw Error('not ready');}}).ok,false);
});
const pages=fs.readdirSync(path.join(root,'tools')).filter(n=>n.endsWith('.html')).map(n=>'tools/'+n).concat('tools/egg-glass/index.html');
test('All 19 editor pages opt into one bounded export asset block with existing local dependencies',()=>{
 assert.equal(pages.length,19);
 for(const p of pages){const text=read(p),blocks=[...text.matchAll(/<!-- ML_EXPORT_ASSETS_BEGIN -->\n([\s\S]*?)<!-- ML_EXPORT_ASSETS_END -->/g)];assert.equal(blocks.length,1,p);for(const asset of blocks[0][1].matchAll(/(?:src|href)="([^"]+)"/g))assert.ok(fs.existsSync(path.resolve(root,path.dirname(p),asset[1])),p+': '+asset[1]);}
});
test('Shared export code parses and does not replace canvas renderers, use eval or send artwork remotely',()=>{
 for(const name of fs.readdirSync(path.join(root,'shared')).filter(n=>/^export-.*\.js$/.test(n))){const source=read('shared/'+name);new vm.Script(source);assert.doesNotMatch(source,/eval\(|new Function\(|fetch\(|XMLHttpRequest/);}
});
test('Core order, native restoration, busy guard, focus trap and secondary capability isolation are explicit',()=>{
 const s=read('shared/export-workbench.js');const keys=['size','format','alpha','fps'];let pos=-1;for(const key of keys){const next=s.indexOf("section('"+key+"'");assert.ok(next>pos,key);pos=next;}
 assert.match(s,/mark\.replaceWith\(node\)/);assert.match(s,/dialog\.close\(\);restore\(\);ui\.nativeClick\(button\)/);
 assert.match(s,/if\(busy\(\)\)\{formatSelect\.value=current\.id;return;/);
 assert.match(s,/close\.addEventListener\('click',\(\)=>ui\.close\(\)\)/);
 assert.match(s,/e\.key!=='Tab'/);assert.match(s,/e\.shiftKey/);assert.match(s,/opener\.focus\(\)/);
 assert.match(s,/secondaryActions/);assert.match(s,/fieldset\.disabled=locked\|\|!c\.ok/);
});
test('Thermal/Heatmap preserve fixed frame-rate and native MOV/PNG alpha distinctions',()=>{
 const s=read('shared/export-material-native.js');assert.match(s,/30 fps 固定/);assert.match(s,/state\.studio\.slit\.type==='linear'/);assert.match(s,/S\.bg==='alpha'/);assert.match(s,/recordLoopWebM|UI\.motRecRow/);assert.match(s,/finishRec\(\)/);
});
test('Thermal inspector height correction remains intact',()=>{
 assert.match(read('shared/material-workbench.css'),/grid-template-rows:minmax\(0,1fr\)/);
 assert.match(read('shared/material-workbench.css'),/#panelScroll\{min-height:0;overflow-y:auto/);
});
