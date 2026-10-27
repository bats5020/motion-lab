'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const fixture=JSON.parse(read('tests/fixtures/raster-ui-baseline.json'));
const adapter=read('shared/raster-workbench.js');
const css=read('shared/raster-workbench.css');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const includes='<link rel="stylesheet" href="../shared/workbench.css">\n<link rel="stylesheet" href="../shared/raster-workbench.css">\n<script src="../shared/raster-workbench.js" defer></script>\n';
function originalHTML(html,name){
  if(name==='dither-svg')for(const change of JSON.parse(read('tests/fixtures/dither-export-fix.json')).changes.slice().reverse()){
    assert.equal(html.split(change.after).length-1,change.count,'bounded Dither F5 replacement remains exact');
    html=html.split(change.after).join(change.before);
  }
  html=html.replace(/<!-- ML_EXPORT_ASSETS_BEGIN -->\n[\s\S]*?<!-- ML_EXPORT_ASSETS_END -->\n/g,'');
  // Approved keyboard enhancement is confined to explicitly marked additive hooks/assets.
  html=html.replace(/<!-- ML_KEYBOARD_ASSETS_BEGIN -->\n[\s\S]*?<!-- ML_KEYBOARD_ASSETS_END -->\n/g,'').replace(/\/\* ML_KEYBOARD_BEGIN \*\/\n[\s\S]*?\n\/\* ML_KEYBOARD_END \*\/\n/g,'');
  html=html.replace(includes,'').replace(`<body class="ml-workbench raster-workbench" data-raster-tool="${name}">`,'<body>');
  // The parent-approved source-specific entry points are the sole engine-adjacent change.
  if(name==='halftone-lab')html=html.replace("const _workspace=new URLSearchParams(location.search).get('workspace');\nconst _entryState=_shared||(_workspace==='generate'?{source:'ripple'}:_workspace==='image'?{source:'image'}:null);\ndemo(_entryState ? ()=>{ Object.assign(state,_entryState); syncUI(); sizesDirty(); } : null);",'demo(_shared ? ()=>{ Object.assign(state,_shared); syncUI(); sizesDirty(); } : null);');
  return html;
}
for(const [name,baseline] of Object.entries(fixture.tools)){
  const html=read(`tools/${name}.html`);
  test(`${name}: shell is explicitly opted in and all dependencies exist`,()=>{
    assert.ok(html.includes(`<body class="ml-workbench raster-workbench" data-raster-tool="${name}">`));
    assert.equal(html.split(includes).length,2);
    for(const href of ['shared/workbench.css','shared/raster-workbench.css','shared/raster-workbench.js'])assert.ok(fs.existsSync(path.join(root,href)));
    assert.ok(html.indexOf(includes)<html.indexOf('</head>'));
  });
  test(`${name}: original markup, state, renderer and export code remain byte-identical`,()=>{
    assert.equal(hash(originalHTML(html,name)),baseline.originalHtmlSHA256);
  });
  test(`${name}: every original static control ID is preserved exactly once`,()=>{
    const markup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'');
    const ids=[...markup.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]);
    for(const id of baseline.ids)assert.equal(ids.filter(v=>v===id).length,1,id);
    assert.deepEqual(ids,baseline.ids);
  });
}
test('Additive adapter parses and never clones, replaces, or executes engine markup',()=>{
  new vm.Script(adapter,{filename:'shared/raster-workbench.js'});
  assert.doesNotMatch(adapter,/\.innerHTML\s*=|cloneNode\s*\(|eval\s*\(|new Function\s*\(/);
  assert.match(adapter,/root\.append\(stage,panel\)/,'normalizes the original Halftone panel-first order');
  assert.match(adapter,/requestAnimationFrame\(\(\)=>window\.dispatchEvent\(new Event\('resize'\)\)\)/);
});
test('Source deep links retain shared-hash precedence',()=>{
  const html=read('tools/halftone-lab.html');
  assert.match(html,/const _entryState=_shared\|\|\(_workspace==='generate'\?\{source:'ripple'\}:_workspace==='image'\?\{source:'image'\}:null\)/);
});
test('Effect Stack retains a single live reorderable stack',()=>{
  assert.match(adapter,/const stack=find\('#secStack'\)/);
  assert.ok(adapter.includes("find('#secSrc').append(find('#fileImg'))"),'media input stays with source controls, outside the modal');
  assert.match(adapter,/\['stack','スタック',\[stack\]\]/);
  assert.doesNotMatch(adapter,/find\('#stack'\)\.(?:remove|replaceChildren|replaceWith)/);
});
test('Export UI supports repeat open/close and Dither SVG-code handoff',()=>{
  assert.match(adapter,/if\(!dialog\.open\)dialog\.showModal\(\)/);
  assert.match(adapter,/close\.addEventListener\('click',\(\)=>dialog\.close\(\)\)/);
  assert.match(adapter,/dialog\.addEventListener\('keydown',e=>e\.stopPropagation\(\)\)/);
  assert.match(adapter,/codeModal\.classList\.contains\('show'\)\)\{dialog\.close\(\);requestAnimationFrame\(\(\)=>codeText\.focus\(\)\)/);
  assert.match(adapter,/if\(e\.key==='Escape'\)\{find\('#modalClose'\)\.click\(\)/);
  assert.match(adapter,/if\(e\.key==='Tab'\)/);
});
test('Inspector controls have keyboard navigation, status announcements and disabled state styling',()=>{
  assert.match(adapter,/head\.tabIndex=0/);assert.match(adapter,/aria-expanded/);
  assert.match(adapter,/aria-controls/);assert.match(adapter,/aria-pressed/);
  assert.match(adapter,/toast\.setAttribute\('aria-live','polite'\)/);
  assert.match(css,/:focus-visible/);assert.match(css,/:disabled/);
});
test('Raster layout covers compact desktop, mobile and reduced motion',()=>{
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:380px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css,/raster-workspace-compact\{grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/body\.raster-workbench \[hidden\]\{display:none!important\}/);
});

test('Output font tokens keep their monospace semantics',()=>{
  assert.doesNotMatch(css,/--mono\s*:/);
  assert.match(css,/--raster-ui-font:/);
});
test('Legacy #app viewport dimensions cannot overflow scrollbar-reduced mobile content',()=>{
  for(const name of ['dither-svg','effect-stack','pixel-gradient']){
    assert.match(read(`tools/${name}.html`),/#app\s*\{[^}]*width:100vw/);
  }
  // The ID-qualified adapter beats the preserved original #app rule, unlike a class-only rule.
  assert.match(css,/body\.raster-workbench #app\.raster-workspace\{width:100%;max-width:100%;min-width:0;height:calc\(100dvh - 49px\)\}/);
  assert.match(css,/@media\(max-width:900px\)\{body\.raster-workbench #app\.raster-workspace\{height:auto;overflow:visible\}\}/);
});

test('Keyboard enhancement uses only bounded additive hooks outside preserved engine code',()=>{
  const expected={'halftone-lab':2,'dither-svg':4,'grid-stretch':3,'effect-stack':5,'pixel-gradient':1};
  for(const [name,count] of Object.entries(expected)){
    const source=read(`tools/${name}.html`);
    assert.equal((source.match(/\/\* ML_KEYBOARD_BEGIN \*\//g)||[]).length,count,name);
    assert.equal((source.match(/<!-- ML_KEYBOARD_ASSETS_BEGIN -->/g)||[]).length,1,name);
    assert.match(source,/window\.MLRasterModel=/);
  }
});
