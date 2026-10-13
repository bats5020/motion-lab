// Browser regression checks for Aberration Overlay.
// Start a local HTTP server at the repo root, then run with Playwright available through NODE_PATH
// or PLAYWRIGHT_MODULE. Artifacts are written outside the repository.
//   python3 -m http.server 8766 &
//   node tests/aberration-overlay.browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.ABERRATION_URL || 'http://127.0.0.1:8766/tools/aberration-overlay.html';
const output = process.env.ABERRATION_QA_OUTPUT || '/private/tmp/aberration-overlay-qa';
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, args: (process.env.CHROMIUM_ARGS || '').split(' ').filter(Boolean) });
  const errors = [];
  const pass = name => console.log('PASS', name);
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => document.querySelector('#thumbs .thumb img')?.src.startsWith('data:'), {}, { timeout: 60000 });
    pass('boot + preset thumbnails');

    // preset selection is cleared by editing a look parameter
    await page.click('#thumbs .thumb:nth-child(3)');
    assert.equal(await page.locator('#thumbs .thumb.on').count(), 1);
    await page.getByRole('slider', { name: 'ブルーム強さ', exact: true }).evaluate(i => { i.value = 80; i.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await page.locator('#thumbs .thumb.on').count(), 0);
    pass('preset highlight clears on edit');

    // transport: pause freezes time, scrub sets loop position
    await page.evaluate(() => { applyPreset(0); });
    await page.keyboard.press('Space');
    const t1 = await page.evaluate(() => tEvo);
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => tEvo), t1);
    await page.locator('#tpScrub').evaluate(i => { i.value = 250; i.dispatchEvent(new Event('input', { bubbles: true })); });
    const loopSec = await page.evaluate(() => state.motion.loopSec);
    assert.ok(Math.abs(await page.evaluate(() => tEvo) - loopSec * .25) < 1e-6);
    pass('pause + scrub');

    // preview resolution keeps the on-screen size
    const cssBefore = await page.evaluate(() => view.style.width);
    await page.click('#tpQ button[data-q="0.25"]');
    await page.waitForFunction(() => view.width < parseFloat(view.style.width) * .3, {}, { timeout: 15000 });
    assert.equal(await page.evaluate(() => view.style.width), cssBefore);
    await page.click('#tpQ button[data-q="1"]');
    pass('preview resolution toggle');

    // WARP center by dragging the preview
    await page.evaluate(() => { state.warp.on = true; refreshAll(); });
    const box = await page.locator('#view').boundingBox();
    await page.mouse.move(box.x + box.width * .25, box.y + box.height * .25);
    await page.mouse.down(); await page.mouse.up();
    const c = await page.evaluate(() => [state.warp.cx, state.warp.cy]);
    assert.ok(Math.abs(c[0] - .25) < .02 && Math.abs(c[1] - .75) < .02, 'warp center ' + c);
    pass('warp center drag');

    // code export renders identically (engine embedded via toString)
    await page.evaluate(() => { applyPreset(6); state.edge.on = true; state.warp.on = true; buildLut(); });
    const appPx = await page.evaluate(() => {
      ENG.render(state, timeVecOf(state.motion, 2.6), 2.6, 320, 180);
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      c.getContext('2d').drawImage(ENG.canvas, 0, 0);
      return Array.from(c.getContext('2d').getImageData(0, 0, 320, 180).data);
    });
    const html = await page.evaluate(() => { _rendering = true; return buildExportHtml(); }); // pause app loop while comparing
    const exp = await browser.newPage();
    exp.on('pageerror', e => errors.push('export: ' + e.message));
    await exp.setContent(html, { waitUntil: 'domcontentloaded' });
    await exp.waitForFunction(() => typeof ENG !== 'undefined' && srcKind === 'img', {}, { timeout: 30000 });
    const expPx = await exp.evaluate(() => {
      ENG.render(state, timeVecOf(state.motion, 2.6), 2.6, 320, 180);
      const c = document.createElement('canvas'); c.width = 320; c.height = 180;
      c.getContext('2d').drawImage(ENG.canvas, 0, 0);
      return Array.from(c.getContext('2d').getImageData(0, 0, 320, 180).data);
    });
    let maxDiff = 0;
    for (let i = 0; i < appPx.length; i++) maxDiff = Math.max(maxDiff, Math.abs(appPx[i] - expPx[i]));
    assert.ok(maxDiff <= 2, 'export pixel diff ' + maxDiff);
    await exp.close();
    await page.evaluate(() => { _rendering = false; });
    pass('code export WYSIWYG (max diff ' + maxDiff + ')');

    // video source goes through the luma/blur passes
    // VP9 WebM: Playwright's bundled Chromium has no proprietary H.264 decoder
    const src = path.join(output, 'source.webm');
    execFileSync(ffmpeg, ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=24', '-t', '2', '-c:v', 'libvpx-vp9', '-b:v', '1M', src]);
    await page.evaluate(() => { state.warp.on = false; state.edge.on = false; applyPreset(0); setPlaying(true); });
    await page.click('#tpQ button[data-q="0.25"]'); // keep software-GL CI responsive
    await page.locator('#fileMedia').setInputFiles(src);
    await page.waitForFunction(() => srcKind === 'video', {}, { timeout: 60000 });
    await page.evaluate(() => { applyPreset(3); });
    await page.waitForTimeout(800);
    pass('video source');

    // frame-accurate render queue completes
    await page.evaluate(() => {
      state.canvas.mode = 'custom'; state.canvas.w = 320; state.canvas.h = 180;
      state.motion.loop = false; state.motion.recSec = 3; state.motion.recFps = 24; state.motion.shutter = 40;
      refreshAll();
    });
    const dl = page.waitForEvent('download', { timeout: 180000 });
    await page.click('#btnRender');
    await page.waitForTimeout(300);
    assert.ok(await page.evaluate(() => document.body.classList.contains('rendering')));
    const d = await dl;
    const file = path.join(output, d.suggestedFilename());
    await d.saveAs(file);
    assert.ok(fs.statSync(file).size > 10000);
    await page.waitForFunction(() => !document.body.classList.contains('rendering'));
    pass('render queue → ' + d.suggestedFilename() + ' ' + fs.statSync(file).size + 'B');

    // phone layout: home button must not cover the panel
    const sp = await browser.newPage({ viewport: { width: 390, height: 844 } });
    sp.on('pageerror', e => errors.push('sp: ' + e.message));
    await sp.goto(base);
    await sp.waitForTimeout(1500);
    const home = await sp.locator('#mlab-home').boundingBox();
    const stage = await sp.locator('#stage').boundingBox();
    assert.ok(home.y + home.height <= stage.y + stage.height, 'home button inside stage');
    await sp.screenshot({ path: path.join(output, 'sp.png') });
    pass('phone layout');

    assert.deepEqual(errors, []);
    console.log('ALL PASS');
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e); process.exit(1); });
