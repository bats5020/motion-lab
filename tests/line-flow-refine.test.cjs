const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../tools/line-flow.html'),'utf8');
const source=html.split('/* LINE_FLOW_REFINE_START')[1].split('*/')[1].split('/* LINE_FLOW_REFINE_END')[0];
const context={};vm.createContext(context);vm.runInContext(source+';this.refine=refineStroke;',context);
const refine=(p,s=.65,w=1200,h=800)=>JSON.parse(JSON.stringify(context.refine(p,w,h,s)));
const wave=Array.from({length:301},(_,i)=>({x:.1+.8*i/300,y:.5+.24*Math.sin(i/300*Math.PI*2)+.012*Math.sin(i*2.4)}));
const length=pts=>pts.slice(1).reduce((sum,p,i)=>sum+Math.hypot((p.x-pts[i].x)*1200,(p.y-pts[i].y)*800),0);
test('removes hand jitter while retaining endpoints and the large S flow',()=>{
 const fit=refine(wave,.85);assert.deepEqual(fit[0],wave[0]);assert.deepEqual(fit.at(-1),wave.at(-1));assert.ok(fit.length<=48);assert.ok(length(fit)<length(wave)*.86);
 assert.ok(Math.max(...fit.map(p=>p.y))>.69);assert.ok(Math.min(...fit.map(p=>p.y))<.31);
 for(const p of fit){const ideal=.5+.24*Math.sin((p.x-.1)/.8*Math.PI*2);assert.ok(Math.abs(p.y-ideal)<.04);}
});
test('strength actually relaxes the path and is deterministic, not cumulative',()=>{
 const weak=refine(wave,.05),strong=refine(wave,1);assert.notDeepEqual(weak,strong);assert.ok(strong.length<weak.length);assert.deepEqual(strong,refine(wave,1));
});
test('long straight gestures reduce to two endpoints independent of sample count',()=>{
 const straight=Array.from({length:700},(_,i)=>({x:i/699,y:.42}));assert.equal(refine(straight).length,2);
 assert.deepEqual(refine([{x:.1,y:.2},{x:.5,y:.4},{x:.9,y:.6}]),refine([{x:.1,y:.2},{x:.9,y:.6}]));
});
test('loops remain loops rather than collapsing to their coincident endpoints',()=>{
 const circle=Array.from({length:301},(_,i)=>({x:.5+.3*Math.cos(i/300*Math.PI*2),y:.5+.3*Math.sin(i/300*Math.PI*2)}));const fit=refine(circle,.8);assert.ok(fit.length>6);assert.ok(Math.max(...fit.map(p=>p.x))-Math.min(...fit.map(p=>p.x))>.55);assert.ok(length(fit)>1500);
});
test('duplicate points and stationary gestures never create NaN',()=>{
 for(const raw of [[],[{x:.2,y:.3}],Array(100).fill({x:.2,y:.3}),[{x:.1,y:.2},{x:.1,y:.2},{x:.9,y:.8}]])for(const p of refine(raw))assert.ok(Number.isFinite(p.x)&&Number.isFinite(p.y));
});
test('refinement is resolution independent when canvas dimensions scale together',()=>{
 const a=refine(wave,.75,1200,800),b=refine(wave,.75,2400,1600);assert.equal(a.length,b.length);a.forEach((p,i)=>{assert.ok(Math.abs(p.x-b[i].x)<1e-8);assert.ok(Math.abs(p.y-b[i].y)<1e-8);});
});
