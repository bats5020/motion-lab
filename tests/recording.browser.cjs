// Real browser recording, frame decoding and repeated-session regression checks.
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.RECORDING_OUTPUT||'/private/tmp/motion-lab-recording-qa';fs.mkdirSync(out,{recursive:true});
const base=process.env.MOTION_LAB_URL||'http://127.0.0.1:8782';
const requestedMime=process.env.RECORDING_MIME||'';
const ffmpeg=process.env.FFMPEG||'ffmpeg',ffprobe=process.env.FFPROBE||'ffprobe';
const source=path.join(out,'source.mp4');
execFileSync(ffmpeg,['-v','error','-y','-f','lavfi','-i','testsrc2=size=160x120:rate=24','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',source]);
const results=[];
(async()=>{
for(const engine of (process.env.RECORDING_ENGINES||'chromium,webkit').split(',')){
 const browser=await pw[engine].launch({headless:true});
 try{for(const tool of ['glass-lab','effect-stack','halftone-lab','u19-aberration']){
  const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  await page.addInitScript(mime=>{window.recordedTracks=[];const capture=HTMLCanvasElement.prototype.captureStream;if(capture)HTMLCanvasElement.prototype.captureStream=function(...args){const stream=capture.apply(this,args);window.recordedTracks.push(...stream.getTracks());return stream;};if(mime&&window.MediaRecorder){const supports=MediaRecorder.isTypeSupported.bind(MediaRecorder);MediaRecorder.isTypeSupported=type=>type===mime&&supports(type);}},requestedMime);
  await page.goto(base+'/tools/'+tool+'.html');
  await page.waitForFunction(()=>typeof state!=='undefined');
  await page.evaluate(tool=>{
   if(tool==='halftone-lab'){state.workRes=320;setSource('ripple');document.querySelector('#recDur').value='3';}
   else{state.canvas={mode:'custom',w:320,h:240};if(tool!=='u19-aberration')refreshAll();}
   if(tool==='u19-aberration'){state.motion.loop=true;state.motion.loopSec=2;}
   if(tool==='glass-lab')document.querySelector('#recDurRow select').value='3';
  },tool);
  if(tool==='effect-stack'){
   await page.locator('#fileImg').setInputFiles(source);
   await page.waitForFunction(()=>videoActive());
  }
  await page.waitForTimeout(300);
  const supported=await page.evaluate(tool=>!!window.MediaRecorder&&['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm',...(tool==='u19-aberration'?[]:['video/mp4'])].some(m=>MediaRecorder.isTypeSupported(m)),tool);
  if(!supported){await page.locator('#btnRec').click();assert.equal(await page.evaluate(()=>typeof _recording!=='undefined'?_recording:false),false);results.push({engine,tool,supported:false,errors});console.log('UNSUPPORTED',engine,tool);await page.close();continue;}
  for(let attempt=1;attempt<=2;attempt++){
   const pending=page.waitForEvent('download',{timeout:20000});
   await page.locator('#btnRec').click();
   const download=await pending;
   const file=path.join(out,`${engine}-${tool}-${attempt}${path.extname(download.suggestedFilename())}`);await download.saveAs(file);
   const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-count_frames','-show_entries','stream=codec_name,width,height,nb_read_frames:format=format_name,duration','-of','json',file],{encoding:'utf8'}));
   const stream=probe.streams[0];assert.ok(+stream.nb_read_frames>1);assert.equal(stream.width,320);assert.equal(stream.height,tool==='halftone-lab'?200:240);
   if(file.endsWith('.webm'))assert.match(probe.format.format_name,/webm/);else assert.match(probe.format.format_name,/mp4/);
   const hashes=execFileSync(ffmpeg,['-v','error','-i',file,'-f','framemd5','-'],{encoding:'utf8'}).split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').at(-1).trim());
   assert.ok(new Set(hashes).size>1,'video frames must change');
   const clean=await page.evaluate(tool=>({inactive:tool==='halftone-lab'?!recActive:tool==='u19-aberration'?!_recording:!_rec,tracksEnded:window.recordedTracks.every(t=>t.readyState==='ended'),sizeUnlocked:tool!=='effect-stack'||_recLockSize===null,animationRestored:tool!=='halftone-lab'||state.animOn===false}),tool);
   assert.ok(Object.values(clean).every(Boolean),JSON.stringify(clean));assert.deepEqual(errors,[]);
   const result={engine,tool,attempt,file:path.basename(file),...stream,duration:probe.format.duration,uniqueFrames:new Set(hashes).size,clean,errors};results.push(result);console.log('PASS',JSON.stringify(result));
  }
  await page.close();
 }}finally{await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({at:new Date().toISOString(),results},null,2));}
}
})().catch(e=>{console.error(e);process.exit(1)});
