// Restore only named, source-recorded QA corrections before baseline engine checks.
const assert=require('node:assert/strict');
const originals=require('./fixtures/motion-qa-fixes.json');
exports.restoreMotionQA=(name,source)=>{
 const seen=new Set();
 return source.replace(/\/\* QA_FIX_BEGIN:([\w-]+) \*\/\n[\s\S]*?\n\/\* QA_FIX_END:\1 \*\//g,(_,key)=>{
  assert.ok(Object.hasOwn(originals[name]||{},key),`Unknown QA correction: ${name}:${key}`);
  assert.ok(!seen.has(key),`Duplicate QA correction: ${name}:${key}`);seen.add(key);
  return originals[name][key];
 });
};
