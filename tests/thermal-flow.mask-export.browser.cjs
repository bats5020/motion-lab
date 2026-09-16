// Check actual saved images, not just the export canvas dimensions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.THERMAL_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.THERMAL_MASK_OUTPUT || '/private/tmp/thermal-mask-export-qa';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [], checks = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => errors.push(e.message));
    const note = label => { checks.push(label); console.log('PASS', label); };
    await page.goto(process.env.THERMAL_URL || 'http://127.0.0.1:8766/tools/thermal-flow.html');
    await page.waitForFunction(() => document.querySelectorAll('[data-ready=true]').length === PRESETS.length, {}, { timeout: 90000 });
    await page.evaluate(() => { applyPreset(PRESETS.find(p => p.name === 'グラデ')); state.canvas = { mode: 'custom', w: 320, h: 240 }; refreshAll(); redraw(); });
    const inspect = async buffer => page.evaluate(async data => {
      const im = new Image(); im.src = 'data:image/png;base64,' + data; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const x = c.getContext('2d'); x.drawImage(im, 0, 0); const rgba = x.getImageData(0, 0, c.width, c.height).data;
      let opaque = 0, clear = 0, faint = 0; const edges = [false, false, false, false];
      for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) {
        const a = rgba[(y * c.width + xx) * 4 + 3]; if (a === 0) clear++; if (a === 255) opaque++; if (a > 0 && a < 5) faint++;
        if (a) { if (!xx) edges[0] = true; if (!y) edges[1] = true; if (xx === c.width - 1) edges[2] = true; if (y === c.height - 1) edges[3] = true; }
      }
      return { width: c.width, height: c.height, edges, opaque, clear, faint, corner: [...rgba.slice((c.width - 1) * 4, c.width * 4)] };
    }, buffer.toString('base64'));
    const save = async (name, format = 'png', mult = 1) => {
      const pending = page.waitForEvent('download');
      if (format === 'png' && mult === 1) await page.locator('#btnPng1').click();
      else await page.evaluate(async ({ format, mult }) => exportStill(format, mult), { format, mult });
      const download = await pending; const file = path.join(output, name); await download.saveAs(file);
      return { info: await inspect(fs.readFileSync(file)), name: download.suggestedFilename() };
    };
    const record = () => page.evaluate(() => ({ state: stateRecord(), undo: UNDO.length }));

    const full = await save('unmasked.png'); assert.equal(full.info.width, 320); assert.equal(full.info.height, 240);
    note('unmasked PNG keeps the chosen canvas dimensions');

    await page.getByRole('checkbox', { name: '文字・画像で切り抜く', exact: true }).check();
    await page.getByRole('textbox', { name: 'テキスト1', exact: true }).fill('Flow');
    await page.getByRole('textbox', { name: 'テキスト2', exact: true }).fill('');
    await page.evaluate(() => { state.mask.size = 24; state.mask.yoff = 18; state.mask.transparent = true; refreshAll(); redraw(); });
    const textState = await record(), text = await save('text.png');
    assert.ok(text.info.width < 320 && text.info.height < 240); assert.ok(text.info.clear > 0 && text.info.opaque > 0);
    assert.ok(text.info.edges.every(Boolean)); assert.deepEqual(await record(), textState);
    assert.ok(text.name.includes(text.info.width + 'x' + text.info.height));
    assert.match(await page.locator('#exportSize').innerText(), /トリミング/);
    note('text saves tightly cropped with alpha, accurate filename dimensions, and unchanged editor/history');

    const fixture = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 80; c.height = 60; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(10, 12, 30, 20); x.fillStyle = 'rgba(255,255,255,0.008)'; x.fillRect(4, 6, 1, 1); return c.toDataURL();
    });
    await page.locator('#maskOpts input[type=file]').setInputFiles({ name: 'padded-mask.png', mimeType: 'image/png', buffer: Buffer.from(fixture.split(',')[1], 'base64') });
    await page.waitForFunction(() => _maskImg && state.mask.src === 'image');
    await page.evaluate(() => { Object.assign(state.mask, { imgSize: 25, yoff: 0, bg: '#123456' }); refreshAll(); redraw(); });
    const imageState = await record(), image = await save('image-mask.png');
    assert.equal(image.info.width, 36); assert.equal(image.info.height, 26); assert.ok(image.info.faint > 0); assert.ok(image.info.edges.every(Boolean));
    assert.deepEqual(await record(), imageState);
    note('image masks lose their own transparent padding while retaining a 2/255-alpha edge pixel');

    for (const mult of [2, 4]) {
      const scaled = await save('image-mask-' + mult + 'x.png', 'png', mult);
      assert.ok(Math.abs(scaled.info.width - 36 * mult) <= mult * 2);
      assert.ok(Math.abs(scaled.info.height - 26 * mult) <= mult * 2);
      assert.ok(scaled.info.edges.every(Boolean)); assert.deepEqual(await record(), imageState);
    }
    note('2× and 4× PNG exports crop at output resolution without losing anti-aliased edges');

    await page.getByRole('checkbox', { name: '背景を透過', exact: true }).uncheck();
    const opaque = await save('opaque-mask.png'); assert.equal(opaque.info.width, 36); assert.equal(opaque.info.height, 26);
    assert.equal(opaque.info.clear, 0); assert.deepEqual(opaque.info.corner, [18, 52, 86, 255]);
    for (const [format, extension] of [['jpeg', 'jpg'], ['webp', 'webp']]) {
      const result = await save('mask.' + extension, format); assert.equal(result.info.width, 36); assert.equal(result.info.height, 26);
      assert.ok(result.name.endsWith('_36x26.' + extension));
    }
    note('opaque backgrounds, JPG and WebP use the mask bounds and retain the chosen background');

    await page.evaluate(() => { state.mask.transparent = true; Object.assign(state.studio.stretch, { on: true, glow: true, glowThreshold: 0, glowRadius: 12 }); refreshAll(); redraw(); });
    const glow = await save('glowing-mask.png');
    assert.ok(glow.info.width > 36 && glow.info.height > 26); assert.ok(glow.info.edges.every(Boolean));
    await page.evaluate(() => { state.mask.transparent = false; state.studio.stretch.on = false; refreshAll(); redraw(); });
    note('visible glow outside the mask is retained when trimming the saved image');

    await page.evaluate(() => {
      window.copied = null;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { write: async items => {
        const blob = await items[0].getType('image/png'); const reader = new FileReader();
        window.copied = await new Promise(resolve => { reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
      } } });
      document.querySelector('#exportMore').open = true;
    });
    await page.locator('#btnCopy').click(); await page.waitForFunction(() => window.copied);
    const copied = await inspect(Buffer.from((await page.evaluate(() => window.copied)).split(',')[1], 'base64'));
    assert.equal(copied.width, 36); assert.equal(copied.height, 26);
    note('image copying uses the same crop without writing to the real clipboard during the test');

    await page.evaluate(() => { state.mask.on = false; document.querySelector('#imageEditor').open = true; refreshAll(); });
    await page.locator('#studio-image-file').setInputFiles({ name: 'studio-mask.png', mimeType: 'image/png', buffer: Buffer.from(fixture.split(',')[1], 'base64') });
    await page.waitForFunction(() => overlayImage && overlayImage.src === state.studio.image.data);
    await page.evaluate(() => { Object.assign(state.studio.image, { mode: 'mask', size: 25, x: 50, y: 50, opacity: .5 }); refreshAll(); redraw(); });
    const studio = await save('studio-mask.png'); assert.equal(studio.info.width, 36); assert.equal(studio.info.height, 26); assert.ok(studio.info.faint > 0);
    await page.evaluate(() => { state.studio.image.mode = 'overlay'; refreshAll(); redraw(); });
    const overlay = await save('overlay.png'); assert.equal(overlay.info.width, 320); assert.equal(overlay.info.height, 240);
    note('the image panel mask also crops, while a normal overlay keeps the canvas size');

    let downloads = 0; const countDownload = () => downloads++; page.on('download', countDownload);
    await page.evaluate(async () => { state.studio.image.on = false; Object.assign(state.mask, { on: true, src: 'text', text: '', text2: '' }); await exportStill('png'); });
    assert.equal(downloads, 0); assert.equal(await page.evaluate(() => _recording), false);
    assert.match(await page.locator('#toast').innerText(), /マスクが空/);
    await page.evaluate(async () => { state.mask.src = 'image'; _maskImg = null; await exportStill('png'); });
    assert.equal(downloads, 0); assert.equal(await page.evaluate(() => _recording), false);
    assert.match(await page.locator('#toast').innerText(), /マスク画像を読み込んで/);
    page.off('download', countDownload);
    note('empty or missing masks show an error and produce no blank or unmasked download');

    await page.evaluate(() => { Object.assign(state.mask, { src: 'text', text: 'FLOW', text2: '', size: 24, transparent: true }); refreshAll(); redraw(); });
    await page.screenshot({ path: path.join(output, 'editor.png') });
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ at: new Date().toISOString(), checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
