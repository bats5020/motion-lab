const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname,'../tools/ascii-wave.html'),'utf8');
const fn = name => html.match(new RegExp('^function '+name+'\\([\\s\\S]*?^}', 'm'))[0];
const context = vm.createContext({Intl});
vm.runInContext(fn('characterRamp'),context);
const ramp = text => Array.from(context.characterRamp(text));

test('a single character or emoji preserves wave gaps without substituting @', () => {
  for(const glyph of ['A','あ','🎃','🔥','👩🏽‍💻','👨‍👩‍👧‍👦','🇯🇵','1️⃣','🏳️‍🌈','e\u0301','か\u3099']){
    assert.deepEqual(ramp(glyph),[' ',glyph],glyph);
  }
});

test('mixed sets retain whole graphemes, order, and intentional spaces', () => {
  const glyphs = [' ','🎃',' ','👩🏽‍💻','🇯🇵','1️⃣','A','e\u0301'];
  assert.deepEqual(ramp(glyphs.join('')),glyphs);
  for(const text of [' .:-=+*#%@',' .·•●',' ░▒▓█',' .,:;i!?+=*x%&#@','01']){
    assert.deepEqual(ramp(text),Array.from(text));
  }
  assert.deepEqual(ramp(''),[' ','@']);
  assert.deepEqual(ramp('  '),[' ',' ']);
});

test('older browsers retain basic character and single-codepoint emoji support', () => {
  const fallback = vm.createContext({Intl:{}});
  vm.runInContext(fn('characterRamp'),fallback);
  assert.deepEqual(Array.from(fallback.characterRamp('🎃')),[' ','🎃']);
  assert.deepEqual(Array.from(fallback.characterRamp('01')),['0','1']);
});

test('standalone HTML includes the same character handling and color emoji fonts', () => {
  const embed = vm.createContext({state:{chars:'👩🏽‍💻🇯🇵',bg:'#07080c'},FONTS:'test-font'});
  for(const name of ['characterRamp','makeNoise','fbm','fieldValue','hex2rgb','mixHex','buildEmbedHtml']){
    vm.runInContext(fn(name),embed);
  }
  const driver = html.match(/var EMBED_DRIVER =\s*`([\s\S]*?)`;/)[1];
  embed.EMBED_DRIVER = driver;
  const exported = embed.buildEmbedHtml();
  const script = exported.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => new vm.Script(script));
  // Execute the real exported driver and record the text passed to its canvas.
  const drawn = [];
  const canvas = {getContext:()=>({setTransform(){},fillRect(){},fillText:glyph=>drawn.push(glyph)})};
  let frame;
  const runtime = vm.createContext({Intl,document:{getElementById:()=>canvas,addEventListener(){},hidden:false},
    window:{devicePixelRatio:1},innerWidth:200,innerHeight:150,performance:{now:()=>0},addEventListener(){},requestAnimationFrame:callback=>{frame=callback;}});
  // Supply renderer state as a real export would, while keeping the frame small.
  embed.state = {seed:1337,chars:'👩🏽‍💻🇯🇵',bg:'#07080c',fg:'#ffffff',accent:'#ff0000',accentOn:true,invert:false,
    cell:20,letterSpacing:1,lineHeight:1,bold:false,speed:0,flowDir:0,flowStr:0,scale:1.7,octaves:3,contrast:1.35,threshold:.12,interactive:false,radius:180,strength:1,mode:'repel'};
  const fullScript = embed.buildEmbedHtml().match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(fullScript,runtime);frame(16);
  assert.ok(drawn.length>0);
  assert.ok(drawn.every(glyph=>['👩🏽‍💻','🇯🇵'].includes(glyph)));
  assert.match(html,/Apple Color Emoji/);
  assert.match(html,/Segoe UI Emoji/);
  assert.match(html,/Noto Color Emoji/);
});
