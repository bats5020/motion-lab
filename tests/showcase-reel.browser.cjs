// Showcase Reel QA. Run: node tests/showcase-reel.browser.cjs (Playwright required).
// Checks every template renders, loops seamlessly (first frame == last frame) and that MP4 export produces a file.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript'};
const server=http.createServer((req,res)=>{const p=decodeURIComponent(new URL(req.url,'http://x').pathname);const f=path.resolve(root,'.'+p);if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(f,(e,d)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',types[path.extname(f)]||'application/octet-stream');res.end(d);});});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=`http://127.0.0.1:${server.address().port}/tools/showcase-reel.html`;
  const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'],...(process.env.CATALOG_CHROMIUM_PATH?{executablePath:process.env.CATALOG_CHROMIUM_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.evaluate(()=>localStorage.clear());await page.reload();await page.waitForTimeout(1200);
    const templates=await page.$$eval('.tpl',b=>b.map(x=>x.dataset.k));
    assert.equal(templates.length,9);
    const diff=([a,b])=>new Promise(done=>{const ld=s=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.src='data:image/png;base64,'+s;});Promise.all([ld(a),ld(b)]).then(([A,B])=>{const c=document.createElement('canvas');c.width=A.width;c.height=A.height;const g=c.getContext('2d');g.drawImage(A,0,0);const x=g.getImageData(0,0,c.width,c.height).data;g.drawImage(B,0,0);const y=g.getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<x.length;i+=4)s+=Math.abs(x[i]-y[i])+Math.abs(x[i+1]-y[i+1])+Math.abs(x[i+2]-y[i+2]);done(s/(x.length/4));});});
    for(const t of templates){
      await page.click(`.tpl[data-k="${t}"]`);
      await page.evaluate(()=>{MLShowcaseReel.pause();MLShowcaseReel.set('grain',0);});
      const shots=[];
      for(const f of [0,0.9999999]){await page.evaluate(f=>MLShowcaseReel.setTime(MLShowcaseReel.loopLength()*f),f);await page.waitForTimeout(200);shots.push((await page.locator('#view').screenshot()).toString('base64'));}
      const d=await page.evaluate(diff,shots);
      assert.ok(d<0.05,`${t}: loop seam mean diff ${d}`);
    }
    console.log('PASS: 9 templates render and loop seamlessly');
    await page.evaluate(()=>{const s=MLShowcaseReel;s.set('quality',720);s.set('loop',1);s.set('fps',24);s.set('template','wall');});
    const download=page.waitForEvent('download',{timeout:120000});await page.click('#exVideo');
    const file=await download;assert.match(file.suggestedFilename(),/\.(mp4|webm)$/);
    const out=path.join(require('node:os').tmpdir(),'showcase-reel-qa-'+file.suggestedFilename());await file.saveAs(out);assert.ok(fs.statSync(out).size>10000);
    console.log('PASS: video export',file.suggestedFilename(),fs.statSync(out).size,'bytes');
    assert.deepEqual(errors,[]);
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exit(1);});
