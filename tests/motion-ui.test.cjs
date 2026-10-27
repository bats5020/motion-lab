// Additive motion-workbench contracts. These do not claim browser/GPU/video validation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const baseline=require('./fixtures/motion-ui-preservation.json');
const sanctioned=require('./fixtures/motion-keyboard-patches.json');
const {restoreMotionQA}=require('./motion-qa-preservation.cjs');
function originalEngine(name,code){
 code=restoreMotionQA(name,code);
 const seen=new Set();
 const restored=code.replace(/\/\* ML_KEYBOARD_BEGIN:([\w-]+) \*\/\n[\s\S]*?\n\/\* ML_KEYBOARD_END:\1 \*\//g,(_,key)=>{
  assert.ok(Object.hasOwn(sanctioned[name]||{},key),`Unknown integration region ${name}:${key}`);assert.ok(!seen.has(key),`Duplicate integration region ${key}`);seen.add(key);return sanctioned[name][key];
 });
 return restored;
}
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const scripts=html=>[...html.replace(/<!-- ML_EXPORT_ASSETS_BEGIN -->\n[\s\S]*?<!-- ML_EXPORT_ASSETS_END -->\n/g,'').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
for(const [name,expected] of Object.entries(baseline)){
  const html=read(`tools/${name}.html`), all=scripts(html), shell=all.filter(m=>m[1].includes('data-ml-shell="motion"'));
  test(`${name}: renderer/export code is byte-preserved outside sanctioned keyboard integration`,()=>{
    const original=all.filter(m=>!m[1].includes('data-ml-shell="motion"')&&!m[1].includes('data-ml-keyboard')).map(m=>({attributes:m[1],sha256:createHash('sha256').update(originalEngine(name,m[2])).digest('hex')}));
    assert.deepEqual(original,expected.engineScripts);
  });
  test(`${name}: original IDs, controls and document routes are retained`,()=>{
    const ids={};
    for(const m of html.matchAll(/\bid=["']([^"']+)["']/g))ids[m[1]]=(ids[m[1]]||0)+1;
    for(const [id,count] of Object.entries(expected.originalIds))assert.equal(ids[id],count,`${id} must remain present with original multiplicity`);
    assert.match(html,/href="\.\.\/index\.html"/);
    assert.equal(ids.mlMotionToolbar,1);assert.equal(ids.mlMotionExport,1);
  });
  test(`${name}: opt-in shell parses and resolves its stylesheets`,()=>{
    assert.equal(shell.length,1);
    assert.doesNotThrow(()=>new vm.Script(shell[0][2],{filename:`${name}-workbench.js`}));
    assert.ok(html.includes(`class="ml-workbench ml-motion-workbench" data-ml-motion="${name}"`));
    for(const file of ['workbench.css','motion-workbench.css']){
      assert.ok(html.includes(`href="../shared/${file}"`));assert.ok(fs.existsSync(path.join(root,'shared',file)));
    }
    assert.match(shell[0][2],/window\.dispatchEvent\(new Event\('resize'\)\)/);
    assert.match(shell[0][2],/aria-label/);
  });
}
test('Image Switcher: moved source controls follow the original export busy guard',()=>{
  const html=read('tools/image-switcher.html');
  assert.match(html,/sourceGuard=new MutationObserver\(\(\)=>\{rail\.inert=settings\.inert;\}\)/);
  assert.match(html,/attributeFilter:\['inert'\]/);
  assert.match(html,/rail\.inert=settings\.inert/);
  assert.match(html,/byId\('mlMotionExport'\)\.onclick=\(\)=>jumpTo\(exportBar\)/);
});
test('Word Switcher: real playback controls are moved, not duplicated; collapsible panels are keyboard accessible',()=>{
  const html=read('tools/word-switcher.html'), shell=scripts(html).find(m=>m[1].includes('data-ml-shell="motion"'))[2];
  assert.match(shell,/move\(transport,byId\('btnPlay'\),byId\('btnRestart'\),byId\('btnStep'\)\)/);
  assert.match(shell,/head\.setAttribute\('role','button'\);head\.tabIndex=0/);
  assert.match(shell,/e\.key==='Enter'\|\|e\.key===' '/);
  assert.match(shell,/aria-expanded/);
  assert.match(shell,/このブラウザ内に保存/);
});
for(const name of ['u19-tile-scroll','flame-transition'])test(`${name}: no WebGL2 honestly disables rendering and output`,()=>{
  const shell=scripts(read(`tools/${name}.html`)).find(m=>m[1].includes('data-ml-shell="motion"'))[2];
  assert.match(shell,/getContext\('webgl2'\)/);
  assert.match(shell,/WebGL2 が使えないため、描画と書き出しを停止/);
  assert.match(shell,/button:not\(\.ml-motion-tab\)/);
  assert.match(shell,/forEach\(el=>el\.disabled=true\)/);
  assert.match(shell,/exportJump\.disabled=true/);
  assert.doesNotMatch(shell,/data:image|drawImage|fillRect/);
});
test('HUD: actual media remains packaged; fixed timing overview and capability notes do not replace the renderer',()=>{
  const html=read('tools/u19-hud-sequence.html');
  for(const ext of ['mp4','webm'])assert.ok(fs.existsSync(path.join(root,`scenes/u19-ecs-hud-sequence/u19-window.${ext}`)));
  assert.match(html,/ml-hud-sequence/);assert.match(html,/typeof window\.gsap/);assert.match(html,/VideoEncoder/);
  assert.match(html,/3\.4秒/);assert.match(html,/0\.5秒/);
  assert.match(html,/const canRecord=/);assert.match(html,/if\(!canRecord\)\{byId\('exBtn'\)\.disabled=true/);
});
test('Motion layout: bounded desktop rails, responsive stacking and renderer-scoped HUD geometry',()=>{
  const css=read('shared/motion-workbench.css');
  assert.match(css,/body\.ml-motion-workbench #app\{[^}]*min-width:0;[^}]*grid-template-columns:224px minmax\(0,1fr\) 316px/);
  assert.match(css,/@media\(max-width:820px\)/);
  assert.match(css,/body\.ml-motion-workbench #app\{display:flex;flex-direction:column;height:auto/);
  assert.match(css,/\[data-ml-motion="u19-hud-sequence"\] #stage\{--bg:#000;padding:0;background:#000;background-image:none/);
  assert.match(css,/\.ml-motion-group\[hidden\]\{display:none!important/);
});

test('Renderer typography is isolated from editor typography',()=>{
  const css=read('shared/motion-workbench.css');
  assert.match(css,/--mono:var\(--ml-mono\)/);
  assert.doesNotMatch(css,/--mono:(?:Arial|var\(--ml-ui\))/);
  assert.match(css,/:is\(#mlMotionToolbar,#panel,#propPane,#mlMotionSources,#bar,[^}]+\{font-family:var\(--ml-ui\)\}/);
  // HUD output is its original Inter typography on a black stage, not the workbench font/background.
  const hud=read('tools/u19-hud-sequence.html');
  assert.match(hud,/\.t \{\s*font-family: var\(--font\)/);
  assert.match(hud,/--font: "Inter"/);
  assert.match(css,/\[data-ml-motion="u19-hud-sequence"\] #stage\{--bg:#000;padding:0;background:#000;background-image:none/);
});

test('Image Switcher keeps playback text on one line and bounds asset names without hiding controls',()=>{
  const css=read('shared/motion-workbench.css');
  assert.match(css,/\[data-ml-motion="image-switcher"\] #transport #play\{[^}]*min-width:68px;flex:0 0 auto;[^}]*white-space:nowrap/);
  assert.match(css,/\[data-ml-motion="image-switcher"\] #assetList\{min-width:0;max-width:100%;width:100%;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/\[data-ml-motion="image-switcher"\] #assetList \.asset\{min-width:0;max-width:100%;width:100%/);
  assert.match(css,/\.asset \.name\{flex:1 1 0;min-width:0;max-width:100%;[^}]*text-overflow:ellipsis/);
  assert.match(css,/\.asset input\[type=checkbox\]\{flex:0 0 13px/);
  assert.match(css,/\.asset \.small\{flex:0 0 20px/);
});
