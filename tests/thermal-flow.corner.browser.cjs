// Four corner emitters: composition, editing, persistence and real PNG output.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.THERMAL_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.THERMAL_CORNER_OUTPUT || '/private/tmp/thermal-corner-qa';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [], checks = [], measurements = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    const note = text => { checks.push(text); console.log('PASS', text); };
    const base = process.env.THERMAL_URL || 'http://127.0.0.1:8766/tools/thermal-flow.html';
    await page.goto(base + '?p=' + encodeURIComponent('四隅フレア'));
    await page.waitForFunction(() => document.querySelectorAll('[data-ready=true]').length === PRESETS.length, {}, { timeout: 120000 });
    const record = () => page.evaluate(() => stateRecord());
    const choose = name => page.getByRole('button', { name: 'ルック: ' + name, exact: true }).click();
    const range = async (name, value) => page.getByRole('slider', { name, exact: true }).evaluate((el, value) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    const capture = (w = 320, h = 340) => page.evaluate(({ w, h }) => {
      renderGL(w, h, 1); const png = view.toDataURL();
      const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let bright = 0, centerMax = 0; const corners = [0, 0, 0, 0], emitters = [0, 0, 0, 0];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, light = Math.max(...px.subarray(i, i + 3));
        if (light > 30) { bright++; emitters[(x >= w / 2 ? 1 : 0) + (y >= h / 2 ? 2 : 0)]++; if (x < w * .25 || x >= w * .75) if (y < h * .25 || y >= h * .75) corners[(x >= w / 2 ? 1 : 0) + (y >= h / 2 ? 2 : 0)]++; }
        if (x > w * .4 && x < w * .6 && y > h * .4 && y < h * .6) centerMax = Math.max(centerMax, light);
      }
      redraw(); return { png, bright: bright / (w * h), centerMax, corners, emitters, glError: gl.getError() };
    }, { w, h });
    const save = (name, data) => fs.writeFileSync(path.join(output, name + '.png'), Buffer.from(data.png.split(',')[1], 'base64'));
    assert.equal((await record()).field.mode, 'corner');
    assert.equal(await page.locator('#presets [data-look="四隅フレア"]').isVisible(), true);
    assert.equal(await page.getByRole('slider').count(), 3);
    assert.equal((await record()).grain.amount, 0);
    assert.equal((await record()).studio.noise.amount, 0);
    for (const [w, h] of [[360, 384], [640, 360], [360, 640], [400, 400]]) {
      const image = await capture(w, h); const { png, ...stats } = image;
      assert.equal(stats.glError, 0); assert.ok(stats.centerMax <= 6); assert.ok(stats.corners.every(count => count > 1000));
      assert.ok(stats.bright > .08 && stats.bright < .5); measurements.push({ size: [w, h], ...stats }); save('aspect-' + w + '-' + h, image);
    }
    note('four visible corner flames surround a dark center in portrait, square and landscape formats');
    const before = await record(), original = await capture(); const areas = [];
    const balanceImages = [], spreads = [];
    for (const balance of ['0', '75', '100']) {
      await page.getByRole('combobox', { name: '四隅のバランス', exact: true }).selectOption(balance);
      const image = await capture(); balanceImages.push(image.png); spreads.push(Math.max(...image.emitters) / Math.min(...image.emitters));
      assert.equal((await record()).field.cornerScatter, +balance); save('balance-' + balance, image);
      assert.deepEqual((await record()).lut, before.lut); assert.deepEqual((await record()).grain, before.grain);
    }
    assert.equal(new Set(balanceImages).size, 3); assert.ok(spreads[1] > spreads[0] * 1.5 && spreads[2] > spreads[1]);
    await page.locator('#btnUndo').click(); assert.equal((await record()).field.cornerScatter, 75); assert.equal((await capture()).png, balanceImages[1]);
    await page.locator('#btnRedo').click(); assert.equal((await record()).field.cornerScatter, 100);
    await page.locator('#btnQuickReset').click(); assert.deepEqual(await record(), before);
    measurements.push({ balances: [0, 75, 100], largestToSmallest: spreads });
    note('balanced, natural and bold compositions change the relative flame areas; selection, undo/redo and reset preserve color and grain');
    for (const value of [0, 50, 100]) { await range('炎の長さ', value); const image = await capture(); areas.push(image.bright); save('length-' + value, image); }
    assert.ok(areas[0] * 2 < areas[1] && areas[1] * 1.4 < areas[2]); measurements.push({ length: [0, 50, 100], areas });
    await range('うねりの強さ', 95); const combined = await capture(), combinedState = await record();
    for (const k of ['lut', 'grain', 'studio', 'seed', 'pins']) assert.deepEqual(combinedState[k], before[k]);
    await page.locator('#btnQuickReset').click(); assert.deepEqual(await record(), before); assert.equal((await capture()).png, original.png);
    await range('うねりの強さ', 95); await range('炎の長さ', 100); assert.deepEqual(await record(), combinedState); assert.equal((await capture()).png, combined.png);
    await page.locator('#btnQuickReset').click(); await range('うねりの強さ', 0); const calm = await capture();
    await range('うねりの強さ', 100); const lively = await capture(); assert.notEqual(calm.png, lively.png); save('waves-0', calm); save('waves-100', lively);
    await page.locator('#btnUndo').click(); assert.equal((await capture()).png, calm.png);
    await page.locator('#btnRedo').click(); assert.equal((await capture()).png, lively.png);
    note('length changes occupied area; waviness changes the contour; combined controls, reset and undo/redo work');
    await choose('四隅フレア');
    for (let i = 0; i < 3; i++) {
      await page.locator('#btnShape').click(); const variant = await record(), image = await capture();
      assert.deepEqual(variant.lut, before.lut); assert.equal(variant.field.cornerReach, 50); assert.equal(variant.field.cornerWaves, 60); assert.equal(variant.field.cornerScatter, 75);
      assert.ok(image.corners.every(count => count > 500)); assert.ok(image.centerMax <= 6); assert.notEqual(image.png, original.png); save('variant-' + i, image);
    }
    note('shape variations keep all four sources, the center gap, colors and chosen flame length');
    await choose('四隅フレア'); await range('炎の長さ', 72); await range('うねりの強さ', 43);
    const expected = await record(), expectedImage = await capture(), hash = await page.evaluate(() => encodeState());
    await page.evaluate(hash => { applyPreset(PRESETS.find(p => p.name === 'グラデ')); if (!decodeState(hash)) throw Error('decode failed'); buildLut(); refreshAll(); }, hash);
    assert.deepEqual((await record()).field, expected.field); assert.equal((await capture()).png, expectedImage.png);
    const project = await page.evaluate(() => projectSnapshot());
    await page.evaluate(project => { applyPreset(PRESETS.find(p => p.name === 'ラジアル')); loadProject(project); }, project);
    assert.deepEqual((await record()).field, expected.field); assert.equal((await capture()).png, expectedImage.png);
    note('URL and project JSON restore the exact flame image and both controls');
    await choose('四隅フレア'); await page.getByRole('button', { name: 'グラデを編集', exact: true }).click();
    assert.equal(await page.getByRole('combobox', { name: 'グラデーションの形', exact: true }).inputValue(), 'corner');
    assert.deepEqual(await page.locator('#gradientGeometry input[type=range]:visible').evaluateAll(els => els.map(el => el.getAttribute('aria-label'))), ['炎の長さ %', '炎のうねり', '四隅のばらつき %']);
    const start = await page.evaluate(() => gradientHandles()[0].p), box = await page.locator('#studioEditCanvas').boundingBox();
    await page.mouse.move(box.x + start[0] * box.width, box.y + (1 - start[1]) * box.height); await page.mouse.down();
    await page.mouse.move(box.x + .34 * box.width, box.y + .66 * box.height, { steps: 4 }); await page.mouse.up();
    assert.ok((await record()).field.cornerReach > 70); assert.notEqual((await capture()).png, original.png);
    await page.locator('#btnUndo').click(); assert.equal((await capture()).png, original.png);
    await page.getByRole('combobox', { name: 'グラデーションの形', exact: true }).selectOption('line'); assert.equal((await record()).field.mode, 'linear');
    await page.getByRole('combobox', { name: 'グラデーションの形', exact: true }).selectOption('corner'); assert.equal((await record()).field.mode, 'corner');
    await range('炎の長さ %', 80); await page.getByRole('button', { name: '形をリセット', exact: true }).click(); assert.equal((await record()).field.cornerReach, 50);
    await page.locator('#gradientEditor > summary').click();
    await page.evaluate(() => { studioEdit = ''; document.querySelector('#studioEditCanvas').style.pointerEvents = 'none'; drawStudioHandles(); });
    note('canvas handles edit flame length; the gradient editor shows relevant geometry and resets it');
    await choose('四隅フレア');
    const frames = await page.evaluate(() => { _recording = true; state.motion.on = true; state.motion.loop = true; state.motion.loopSec = 8; const frames = []; for (const t of [0, 2, 8]) { setAnimPhase(t); renderGL(240, 256, 1); frames.push(view.toDataURL()); } _recording = false; state.motion.on = false; _animT = { z: 0, x: 0, h: 0 }; redraw(); return frames; });
    assert.notEqual(frames[0], frames[1]); assert.equal(frames[0], frames[2]);
    note('the flame animates and its loop starts and ends on the same image');
    await choose('四隅フレア');
    const download = page.waitForEvent('download'); await page.locator('#btnPng1').click(); const file = await download;
    await file.saveAs(path.join(output, 'corner-flare.png')); const png = fs.readFileSync(path.join(output, 'corner-flare.png'));
    assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    const mask = await page.evaluate(() => { state.mask.on = true; state.mask.text = 'FLOW'; state.mask.text2 = ''; state.mask.size = 20; state.mask.transparent = true; renderGL(480, 600, 1); const result = prepareExportArtwork(480, 600); state.mask.on = false; refreshAll(); return { w: result.width, h: result.height }; });
    assert.ok(mask.w > 0 && mask.w < 480 && mask.h > 0 && mask.h < 600, JSON.stringify(mask));
    note('1080×1350 PNG saves and the existing mask output still trims surrounding space');
    await choose('四隅フレア');
    for (const [width, height] of [[1280, 800], [1440, 1000]]) {
      await page.setViewportSize({ width, height }); await page.evaluate(() => { document.querySelector('#panelScroll').scrollTop = 0; });
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('#quickControls input[type=range], #btnShape, #btnPalette')].every(el => { const p = document.querySelector('#panelScroll').getBoundingClientRect(), b = el.getBoundingClientRect(); return b.top >= p.top && b.bottom <= p.bottom; })), true);
      const thumb = await page.locator('[data-look="四隅フレア"] canvas').screenshot();
      const quadrants = await page.evaluate(async data => {
        const im = new Image(); im.src = data; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0); const px = x.getImageData(0, 0, c.width, c.height).data, quadrants = [0, 0, 0, 0];
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) { const i = (y * c.width + x) * 4; if (Math.max(px[i], px[i + 1], px[i + 2]) > 60) quadrants[(x >= c.width / 2 ? 1 : 0) + (y >= c.height / 2 ? 2 : 0)]++; }
        return quadrants;
      }, 'data:image/png;base64,' + thumb.toString('base64'));
      assert.ok(quadrants.every(n => n > 25), 'the visible thumbnail must show all four flames');
      await page.screenshot({ path: path.join(output, 'desktop-' + width + '.png') });
    }
    note('primary sliders and shape variation buttons fit the desktop panel; the thumbnail shows all four flames');
    if (process.env.THERMAL_CORNER_BASELINE_FILE) {
      const old = await browser.newPage(); await old.goto('file://' + process.env.THERMAL_CORNER_BASELINE_FILE);
      await old.waitForFunction(() => document.querySelectorAll('[data-ready=true]').length === PRESETS.length, {}, { timeout: 120000 });
      const raw = async (p, name) => p.evaluate(name => { applyPreset(PRESETS.find(p => p.name === name)); renderGL(224, 280, 1); return view.toDataURL(); }, name);
      for (const name of ['KVスワール', 'グラデ', 'ラジアル', '溶融リボン']) assert.equal(await raw(page, name), await raw(old, name), name);
      note('four existing looks remain pixel-identical to the previous version');
      await old.evaluate(() => applyPreset(PRESETS.find(p => p.name === '四隅フレア')));
      const oldHash = await old.evaluate(() => encodeState());
      await page.evaluate(hash => { decodeState(hash); buildLut(); refreshAll(); }, oldHash);
      assert.equal((await record()).field.cornerScatter, 0);
      const samePixels = p => p.evaluate(() => { renderGL(224, 280, 1); return view.toDataURL(); });
      assert.equal(await samePixels(page), await samePixels(old));
      await old.close(); note('an older saved corner look retains its original image when scatter is absent');
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ at: new Date().toISOString(), checks, measurements, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
