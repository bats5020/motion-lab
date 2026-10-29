// Recording lifecycle regression tests. Browser APIs are mocked; no encoding/GPU validation.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const names=['glass-lab','effect-stack','halftone-lab','u19-aberration'];
function setup(name,options={}){
  const html=fs.readFileSync(`tools/${name}.html`,'utf8');
  const marker=name==='halftone-lab'?'let recActive=false;':name==='u19-aberration'?'let _rec=null;':'let _rec=null,_recIv=0,_recTo=0;';
  const end=name==='halftone-lab'?'const effWrap=':name==='u19-aberration'?'/* ============ PNG export':name==='glass-lab'?'/* ============ media input':"$('#btnJsonOut')";
  const code=html.slice(html.indexOf(marker),html.indexOf(end,html.indexOf(marker)));
  const elements=new Map(),downloads=[],messages=[],instances=[],timers=new Map(),tracks=[];
  let nextTimer=0;
  const element=id=>{
    id=id.replace(/^#/,'');
    if(!elements.has(id))elements.set(id,{value:'1',classList:{add(){},remove(){}},addEventListener(_,fn){this.onclick=fn;}});
    return elements.get(id);
  };
  class Recorder{
    static isTypeSupported(type){return options.unsupported?false:options.mp4?type==='video/mp4':type.startsWith('video/webm');}
    constructor(stream,{mimeType}){
      if(options.fail==='constructor')throw Error('constructor failed');
      this.stream=stream;this.mimeType=mimeType;this.state='inactive';instances.push(this);
    }
    start(){if(options.fail==='start')throw Error('start failed');this.state='recording';}
    stop(){assert.equal(this.state,'recording');this.state='inactive';this.pendingStop=true;}
    finish(){if(!options.empty)this.ondataavailable({data:new Blob(['video'])});this.onstop();}
  }
  const state={seed:7,effect:'dots',animOn:false,motion:{loop:true,loopSec:1,recSec:1}};
  const captureStream=()=>{
    if(options.fail==='capture')throw Error('capture failed');
    const track={stopped:false,stop(){this.stopped=true;}};tracks.push(track);
    return {getTracks:()=>[track]};
  };
  const schedule=fn=>{timers.set(++nextTimer,fn);return nextTimer;};
  const context=vm.createContext({
    window:options.noRecorder?{}:{MediaRecorder:Recorder},MediaRecorder:Recorder,Blob,
    $:element,view:options.noCapture?{}:{captureStream},state,
    _recording:false,_recDur:0,_recStart:0,_recLockSize:null,tEvo:4,
    toast:msg=>messages.push(msg),alert:msg=>messages.push(msg),
    download:(blob,file)=>downloads.push({blob,file}),dl:(blob,file)=>downloads.push({blob,file}),
    setInterval:schedule,setTimeout:schedule,clearInterval:id=>timers.delete(id),clearTimeout:id=>timers.delete(id),
    videoActive:()=>true,exReady:()=>true,needLoop:()=>state.animOn,kick(){},
    previewSize:()=>[640,480],fullSize:()=>[640,480],renderFrame(){},
    srcVideo:{currentTime:0,duration:1,play:()=>Promise.resolve()},syncVideoLoop(){},
    UI:{recDur:false},performance:{now:()=>100},
  });
  vm.runInContext(code,context);
  const click=()=>element('btnRec').onclick();
  const active=()=>vm.runInContext(name==='halftone-lab'?'recActive':name==='u19-aberration'?'_recording':'!!_rec',context);
  return {click,active,instances,downloads,messages,timers,tracks,state,options,context};
}
for(const name of names){
  for(const mode of ['webm',...(name==='u19-aberration'?[]:['mp4'])]){
    test(`${name}: ${mode} export and repeat recording`,()=>{
      const x=setup(name,{mp4:mode==='mp4'});
      for(let i=0;i<2;i++){
        x.click();assert.equal(x.active(),true);
        const rec=x.instances.at(-1);rec.stop();
        // Final data arrives asynchronously; a click before stop must not start another session.
        x.click();assert.equal(x.instances.length,i+1);
        rec.finish();assert.equal(x.active(),false);
        assert.ok(x.downloads[i].file.endsWith('.'+mode));
        assert.equal(x.downloads[i].blob.type,'video/'+mode);
        assert.ok(x.tracks.every(t=>t.stopped));assert.equal(x.timers.size,0);
        assert.equal(x.state.animOn,false);
      }
    });
  }
  for(const reason of ['noRecorder','noCapture','unsupported','capture','constructor','start']){
    test(`${name}: ${reason} leaves no recording lock`,()=>{
      const options=['capture','constructor','start'].includes(reason)?{fail:reason}:{[reason]:true};
      const x=setup(name,options);x.click();
      assert.equal(x.active(),false);assert.equal(x.downloads.length,0);
      assert.ok(x.messages.length);assert.ok(x.tracks.every(t=>t.stopped));
      assert.equal(x.timers.size,0);assert.equal(x.state.animOn,false);
      if(name==='effect-stack')assert.equal(x.context._recLockSize,null);
      if(name==='u19-aberration')assert.equal(x.context.tEvo,4);
      if(options.fail){options.fail=null;x.click();assert.equal(x.active(),true);}
    });
  }
  test(`${name}: async error releases resources and ignores late stop`,()=>{
    const x=setup(name);x.click();const first=x.instances[0];
    first.state='inactive';first.onerror();
    assert.equal(x.active(),false);assert.ok(x.tracks.every(t=>t.stopped));assert.equal(x.timers.size,0);
    x.click();assert.equal(x.active(),true);first.finish();
    assert.equal(x.active(),true);assert.equal(x.downloads.length,0);
    x.instances[1].stop();x.instances[1].finish();assert.equal(x.downloads.length,1);
  });
  test(`${name}: empty recording is not saved`,()=>{
    const x=setup(name,{empty:true});x.click();x.instances[0].stop();x.instances[0].finish();
    assert.equal(x.active(),false);assert.equal(x.downloads.length,0);assert.ok(x.messages.length);
  });
}
test('All inline application scripts parse',()=>{
  for(const file of ['index.html',...fs.readdirSync('tools').filter(f=>f.endsWith('.html')).map(f=>'tools/'+f)]){
    const source=fs.readFileSync(file,'utf8');
    for(const match of source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
      if(/\bsrc=|x-shader/.test(match[1]))continue;
      new vm.Script(match[2],{filename:file});
    }
  }
});
