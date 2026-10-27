const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
const dataCode=script.slice(0,script.indexOf('const $=id=>'))+'\nglobalThis.data={CATEGORIES,TOOLS,ENTRIES,TOOL_META};';
const context={};vm.createContext(context);vm.runInContext(dataCode,context);
const {CATEGORIES,TOOLS,ENTRIES,TOOL_META}=context.data;
test('library has 19 original tools and 21 purpose-specific entrances',()=>{
  assert.equal(TOOLS.length,19);assert.equal(ENTRIES.length,21);
  assert.equal(new Set(ENTRIES.map(t=>t.href.split('?')[0])).size,19);
  assert.equal(new Set(ENTRIES.map(t=>t.name)).size,21);
  for(const tool of TOOLS){assert.ok(TOOL_META[tool.name],tool.name);assert.ok(ENTRIES.some(t=>t.toolName===tool.name),tool.name);}
});
test('every original tool path still exists and every entry has supported metadata',()=>{
  for(const entry of ENTRIES){
    const url=new URL(entry.href,'https://motion-lab.test/');
    const file=path.join(root,url.pathname,url.pathname.endsWith('/')?'index.html':'');
    assert.ok(fs.existsSync(file),entry.href);
    assert.ok(CATEGORIES.some(c=>c.key===entry.cat),entry.name);
    assert.ok(entry.input&&entry.summary,entry.name);
    assert.ok(entry.output.length>0,entry.name);
    assert.ok(entry.output.every(o=>['PNG','SVG','VIDEO','HTML'].includes(o)),entry.name);
  }
});
test('five categories are purpose-based and U19 is a cross-category collection',()=>{
  assert.deepEqual(Array.from(CATEGORIES,c=>c.key),['image','texture','type','motion','3d']);
  const counts=Object.fromEntries(CATEGORIES.map(c=>[c.key,ENTRIES.filter(t=>t.cat===c.key).length]));
  assert.deepEqual(counts,{image:6,texture:5,type:4,motion:4,'3d':2});
  assert.equal(ENTRIES.filter(t=>t.collection==='u19').length,3);
  assert.equal(new Set(ENTRIES.filter(t=>t.collection==='u19').map(t=>t.cat)).size,2);
});
test('split entrances use query parameters without changing tool paths or hash settings',()=>{
  const expected={'Halftone Image':'tools/halftone-lab.html?workspace=image','Halftone Pattern':'tools/halftone-lab.html?workspace=generate','Heatmap Type':'tools/heatmap-blur.html?workspace=type','Heatmap Media':'tools/heatmap-blur.html?workspace=media'};
  for(const [name,href] of Object.entries(expected))assert.equal(ENTRIES.find(t=>t.name===name).href,href);
  assert.ok(ENTRIES.every(t=>!t.href.includes('#')));
});
test('library uses a local stylesheet and no new runtime dependencies',()=>{
  assert.ok(html.includes('href="shared/catalog.css"'));
  assert.ok(!/<script[^>]+src=/.test(html));
  assert.ok(html.includes('aria-live="polite"'));
  assert.ok(html.includes('href="#main"'));
  assert.ok(fs.readFileSync(path.join(root,'shared/catalog.css'),'utf8').includes('prefers-reduced-motion'));
});
test('output filter has five well-formed options including PNG',()=>{
  const select=html.match(/<select\b[^>]*id="outputFilter"[^>]*>([\s\S]*?)<\/select>/)[1];
  const options=[...select.matchAll(/<option\s+value="([^"]*)">([^<]+)<\/option>/g)];
  assert.deepEqual(options.map(m=>m[1]),['','PNG','SVG','VIDEO','HTML']);
  assert.deepEqual(options.map(m=>m[2]),['すべて','PNG','SVG','動画','HTML']);
  assert.equal(select.replace(/<option\s+value="[^"]*">[^<]+<\/option>/g,'').trim(),'');
  assert.ok(!/<\/[a-z][^>]*\s+[a-z]+=/i.test(html),'closing tags must not have attributes');
});
test('every local stylesheet referenced by the library exists',()=>{
  const paths=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(paths,['shared/tokens.css','shared/catalog.css']);
  paths.forEach(file=>assert.ok(fs.existsSync(path.join(root,file)),file));
});
test('category, collection, output and search predicates compose without losing entries',()=>{
  const filterSource=script.slice(script.indexOf('  const words=state.query'),script.indexOf('  catalog.replaceChildren();'));
  vm.runInContext('globalThis.filtered=state=>{'+filterSource+'return results.map(t=>t.name);};',context);
  const query=changes=>context.filtered({category:'all',collection:'',query:'',output:'',...changes});
  assert.equal(query({}).length,21);
  assert.equal(query({category:'image'}).length,6);
  assert.equal(query({category:'texture'}).length,5);
  assert.equal(query({collection:'u19'}).length,3);
  assert.equal(query({output:'SVG'}).length,5);
  assert.equal(query({query:'HEATMAP'}).length,2);
  assert.deepEqual(Array.from(query({query:'heatmap 動画'})),['Heatmap Media']);
  assert.deepEqual(Array.from(query({category:'type',output:'SVG'})),['Word Switcher']);
  assert.equal(query({query:'<script>not-a-tool</script>'}).length,0);
});
test('URL state restores filters and preserves unrelated query parameters and hash',()=>{
  const loc={href:'https://motion-lab.test/index.html?category=texture&output=PNG&q=halftone&keep=1#original'};
  Object.defineProperty(loc,'search',{get(){return new URL(this.href).search;}});
  const calls=[],fields={};
  const ctx={URL,URLSearchParams,location:loc,CATEGORIES,history:{pushState(a,b,url){calls.push('push');loc.href=url.href;},replaceState(a,b,url){calls.push('replace');loc.href=url.href;}}};
  vm.createContext(ctx);
  const locationSource=script.slice(script.indexOf('function readLocation(){'),script.indexOf('function makeCard('));
  vm.runInContext('const state={}; const fields={}; const $=id=>fields[id]||(fields[id]={});'+locationSource+';globalThis.api={state,fields,readLocation,saveLocation};',ctx);
  ctx.api.readLocation();
  assert.equal(ctx.api.state.category,'texture');assert.equal(ctx.api.state.output,'PNG');assert.equal(ctx.api.fields.search.value,'halftone');
  ctx.api.state.category='type';ctx.api.saveLocation(true);
  assert.equal(calls.at(-1),'push');assert.equal(new URL(loc.href).searchParams.get('category'),'type');
  ctx.api.state.query='warp';ctx.api.saveLocation(false);
  assert.equal(calls.at(-1),'replace');assert.equal(new URL(loc.href).searchParams.get('keep'),'1');assert.equal(new URL(loc.href).hash,'#original');
  loc.href='https://motion-lab.test/?category=invalid&output=invalid&collection=invalid';ctx.api.readLocation();
  assert.equal(ctx.api.state.category,'all');assert.equal(ctx.api.state.output,'');assert.equal(ctx.api.state.collection,'');
  assert.ok(script.includes('window.addEventListener("popstate",()=>{readLocation();render();});'));
});
