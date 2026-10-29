const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash} = require('node:crypto');
const baseline = require('./fixtures/type-shape-baseline.json');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const root = path.resolve(__dirname, '..');
const tools = ['ascii-wave','warp-type','u19-aberration','wireframe'];
const read = file => fs.readFileSync(path.join(root,file),'utf8');
const stripKeyboard = (source,egg=false) => {
  source=source.replace(/\/\* ML_QA_FIX_BEGIN:(wireframe-export-cleanup|wireframe-fps-group) original-base64:([A-Za-z0-9+/=]+) \*\/\n[\s\S]*?\n\/\* ML_QA_FIX_END:\1 \*\//g,(_,name,original)=>Buffer.from(original,'base64').toString('utf8'));
  source=source.replace(/\n\/\* ML_QA_FIX_BEGIN:wireframe-panel-rebuild \*\/[\s\S]*?\/\* ML_QA_FIX_END:wireframe-panel-rebuild \*\//g,'');
  source=source.replace(/\n\/\* ML_EXPORT_BEGIN \*\/[\s\S]*?\/\* ML_EXPORT_END \*\//g,'');
  source=source.replace(/\/\* ML_KEYBOARD_BEGIN original-base64:([A-Za-z0-9+/=]+) \*\/[\s\S]*?\/\* ML_KEYBOARD_END \*\//g,(_,original)=>Buffer.from(original,'base64').toString('utf8'));
  return source.replace(egg?/\n\/\* ML_KEYBOARD_BEGIN \*\/[\s\S]*?\/\* ML_KEYBOARD_END \*\//g:/\/\* ML_KEYBOARD_BEGIN \*\/[\s\S]*?\/\* ML_KEYBOARD_END \*\//g,'');
};
const inline = html => [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>!(/\bsrc\s*=/.test(m[1]))).map(m=>m[2]);
const ids = html => [...html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
for (const name of tools) {
  const file=`tools/${name}.html`;
  test(`${name}: baseline engine is preserved outside bounded keyboard/export QA integration regions`,()=>{
    assert.deepEqual(inline(stripKeyboard(read(file))).map(sha256),baseline.files[file].inlineScriptsSha256);
  });
  test(`${name}: original control IDs retained; shell IDs unique`,()=>{
    const before=baseline.files[file].originalIds, after=ids(read(file));
    for(const id of before)assert.ok(after.includes(id),`Missing control ${id}`);
    assert.equal(new Set(after).size,after.length,'Duplicate static IDs');
    assert.equal(after.filter(id=>id==='ml-type-rail').length,1);
  });
  test(`${name}: opt-in assets are valid local resources, adapter outside engine/export template`,()=>{
    const html=read(file);
    assert.ok(html.includes(`data-ml-editor="${name}"`));
    for(const asset of ['workbench.css','type-shape.css','type-shape-workbench.js'])assert.ok(fs.existsSync(path.join(root,'shared',asset)));
    assert.equal(html.split('src="../shared/type-shape-workbench.js"').length-1,1);
    assert.match(html,/<\/script>\s*<script src="\.\.\/shared\/type-shape-workbench.js"><\/script>\s*<script src="\.\.\/shared\/type-shape-history.js"><\/script>\s*<\/body>/);
  });
}
test('UI adapter parses, labels keyboard controls, and follows regenerated Wireframe controls',()=>{
  const js=read('shared/type-shape-workbench.js');new vm.Script(js);
  assert.match(js,/MutationObserver\(refresh\)/);
  assert.match(js,/aria-expanded/);assert.match(js,/e.key==='Enter'/);
  assert.match(js,/\.ctrl-label/);assert.match(js,/書き出しの幅/);
  assert.match(js,/getContext\('webgl'\)/);
  assert.match(js,/el.disabled=true/);
  assert.doesNotMatch(js,/localStorage\.(setItem|removeItem)|indexedDB\.deleteDatabase|fetch\(/);
});
test('Egg Glass keeps every original control ID and self-contained style/module dependencies',()=>{
  const file='tools/egg-glass/index.html',html=read(file);
  for(const id of baseline.files[file].originalIds)assert.ok(ids(html).includes(id),`Missing control ${id}`);
  assert.equal(new Set(ids(html)).size,ids(html).length);
  assert.equal([...html.matchAll(/<link\b[^>]*rel="stylesheet"/g)].length,4);
  for(const name of ['style.css','editor-history.css','numeric-input.css','export-workbench.css'])assert.ok(html.includes(`href="./${name}"`));
  for(const name of ['export-workbench.js','export-type-shape.js'])assert.equal(html.split(`src="./${name}"`).length-1,1);
  assert.match(html,/href="\.\/style.css"/);
  assert.doesNotMatch(html,/\.\.\/shared\//);
  assert.match(html,/<script type="module" src="\.\/egg.js"><\/script>/);
  for(const script of inline(html))new vm.Script(script);
  assert.match(html,/getContext\('webgl2'\)/);
  assert.match(html,/control.disabled = true/);
});
test('Egg Glass renderer, settings and assets are unchanged; bundle additions use explicit integration regions',()=>{
  const modules=fs.readdirSync(path.join(root,'tools/egg-glass')).filter(name=>name.endsWith('.js')).map(name=>`tools/egg-glass/${name}`).sort();
  const additions=['tools/egg-glass/editor-history.js','tools/egg-glass/keyboard-controls.js','tools/egg-glass/numeric-input.js','tools/egg-glass/export-workbench.js','tools/egg-glass/export-type-shape.js'];
  assert.deepEqual(modules,[...Object.keys(baseline.eggModulesSha256),...additions].sort(),'Original module set retained with explicit keyboard/export helpers');
  for(const file of Object.keys(baseline.eggModulesSha256))assert.equal(sha256(stripKeyboard(read(file),true)),baseline.eggModulesSha256[file],file);
});
test('Egg standalone HTML embeds local export helpers and starts them after the native editor',()=>{
  const source=read('tools/egg-glass/html-export.js');
  new vm.Script(source.replace('export async function buildHtml','async function buildHtml'));
  assert.match(source,/textFiles\.push\('export-workbench\.js','export-workbench\.css','export-type-shape\.js'\)/);
  assert.match(source,/await import\('u19\/egg\.js'\);[\s\S]*await import\('u19\/export-workbench\.js'\);\s*await import\('u19\/export-type-shape\.js'\);/);
  assert.ok(source.includes('script[src="./export-workbench.js"],script[src="./export-type-shape.js"]'));
  assert.match(source,/exportStyle\.textContent=files\['export-workbench\.css'\]/);
  assert.equal((source.match(/\/\* ML_EXPORT_BEGIN \*\//g)||[]).length,4);
  assert.equal((source.match(/\/\* ML_EXPORT_END \*\//g)||[]).length,4);
  for(const name of ['export-workbench.js','export-workbench.css','export-type-shape.js'])assert.ok(fs.existsSync(path.join(root,'tools/egg-glass',name)),name);
});
test('Egg Glass @ fullscreen and mobile adapters preserve accessible preview and timeline',()=>{
  const css=read('tools/egg-glass/style.css');
  const originalStyle=Buffer.from(css).subarray(0,baseline.eggStylePrefix.utf8Bytes);
  assert.equal(sha256(originalStyle),baseline.eggStylePrefix.sha256,'Original Egg CSS remains an unchanged prefix');
  assert.match(css,/\.ui-hidden \.stage>:not\(#preview-workspace\):not\(#fallback\)/);
  assert.match(css,/\.ml-egg-workbench\.ui-hidden #preview-workspace\{inset:0;height:auto/);
  assert.match(css,/@media\(max-width:600px\)/);
  assert.match(css,/#keyframe-timeline/);
  assert.match(read('shared/type-shape.css'),/@media\(max-width:820px\)/);
});
