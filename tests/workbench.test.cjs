const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const hash=s=>createHash('sha256').update(s).digest('hex');
const html=fs.readFileSync('tools/heatmap-blur.html','utf8');
const baseline=require('./fixtures/material-ui-baseline.json').tools['heatmap-blur'];
const scripts=s=>[...s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>! /\bsrc\s*=/.test(m[1])).map(m=>m[2]);
test('Heatmap original rendering, settings and export code is preserved',()=>{
 const original=baseline.inlineScriptSha256[0];
 const updated=require('./keyboard-preservation.cjs').stripOwnedHooks(scripts(html)[0]).replace('  document.dispatchEvent(new Event("workbench:source"));\n','');
 assert.equal(hash(updated),original);
});
test('Every original Heatmap ID remains unique and reachable',()=>{
 const oldIds=Object.keys(baseline.idCounts);
 const newIds=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 for(const id of oldIds)assert.equal(newIds.filter(x=>x===id).length,1,id);
});
test('Workbench source adapter parses and retains optional entry URLs',()=>{
 for(const script of scripts(html))new vm.Script(script);
 assert.match(html,/entry==='media'/);assert.match(html,/entry==='type'/);
 assert.match(html,/document\.addEventListener\('workbench:source',syncShell\)/);
 assert.match(html,/dialog\.showModal\(\)/);assert.match(html,/exportClose.*dialog\.close\(\)/);
});
test('Halftone shared settings take priority over entrance mode',()=>{
 const h=fs.readFileSync('tools/halftone-lab.html','utf8');
 assert.match(h,/const _entryState=_shared\|\|\(_workspace==='generate'\?\{source:'ripple'\}/);
 assert.match(h,/_workspace==='image'\?\{source:'image'\}/);
});
test('Editor styling is opt-in and contains responsive adaptations',()=>{
 const css=fs.readFileSync('shared/editor.css','utf8');
 assert.match(css,/body\.workbench/);assert.match(css,/@media\(max-width:820px\)/);
 assert.match(css,/\.inspector-group\[hidden\]/);assert.match(css,/#mediaEmpty\[hidden\]/);
 for(const path of fs.readdirSync('tools').filter(p=>p.endsWith('.html')&&p!=='heatmap-blur.html'))assert.doesNotMatch(fs.readFileSync('tools/'+path,'utf8'),/shared\/editor\.css/);
});
