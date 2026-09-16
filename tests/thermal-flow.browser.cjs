// Browser regression checks for the Thermal Flow editing workflow.
// Start a local HTTP server, then run with Playwright available through NODE_PATH
// or THERMAL_PLAYWRIGHT_MODULE. Artifacts are written outside the repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.THERMAL_PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.THERMAL_URL || 'http://127.0.0.1:8766/tools/thermal-flow.html';
const output = process.env.THERMAL_QA_OUTPUT || '/private/tmp/thermal-flow-ux-qa';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [], checks = [];
    page.on('pageerror', error => errors.push(error.message));
    const note = name => { checks.push(name); console.log('PASS', name); };
    const ready = async p => p.waitForFunction(() => document.querySelectorAll('[data-ready=true]').length === PRESETS.length, {}, { timeout: 90000 });
    const record = async p => (p || page).evaluate(() => stateRecord());
    const pixels = async p => (p || page).evaluate(() => {
      const [w, h] = previewSize();
      renderGL(224, 280, 1);
      const data = view.toDataURL();
      renderGL(w, h, 1);
      return data;
    });
    const range = async (label, values) => {
      await page.getByRole('slider', { name: label, exact: true }).evaluate((input, changes) => {
        input.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        for (const value of changes) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      }, Array.isArray(values) ? values : [values]);
    };
    const choose = async name => {
      const button = page.getByRole('button', { name: 'ルック: ' + name, exact: true });
      if (!(await button.isVisible())) await page.locator('#moreLooks > summary').click();
      await button.click();
    };
    const unchanged = (before, after, keys) => keys.forEach(k => assert.deepEqual(after[k], before[k], k + ' must stay unchanged'));
    const savePng = async filename => {
      const download = page.waitForEvent('download');
      await page.locator('#btnPng1').click();
      const file = await download;
      await file.saveAs(path.join(output, filename));
      const png = fs.readFileSync(path.join(output, filename));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      return png;
    };

    const bootStart = Date.now();
    await page.goto(base);
    await ready(page);
    console.log('Browser ready in', Date.now()-bootStart, 'ms');
    assert.equal(await page.locator('#advanced').evaluate(e => e.open), false);
    assert.equal(await page.getByRole('slider').count(), 3);
    assert.equal(await page.locator('#motionDetails').isVisible(), false);
    assert.equal(await page.locator('#maskDetails').isVisible(), false);
    assert.equal(await page.locator('#btnUndo').isEnabled(), false);
    assert.equal(await page.locator('#ov').isVisible(), false);
    assert.equal(await page.locator('[data-look][aria-pressed=true]').count(), 1);
    assert.equal(await page.locator('[data-look="Web宵"]').count(), 0);
    note('initial screen has three sliders, all look thumbnails without Web宵, and no accidental pin editing');

    if (process.env.THERMAL_BASELINE_FILE) {
      // Color precision and default grain intentionally changed. Compare the
      // underlying field so this regression still catches changed compositions.
      const fieldPixels = p => p.evaluate(() => {
        const [w, h] = previewSize(); renderGL(224, 280, 1);
        gl.uniform1i(U.uOutField, 1); gl.drawArrays(gl.TRIANGLES, 0, 3);
        const data = view.toDataURL(); renderGL(w, h, 1); return data;
      });
      const original = await browser.newPage();
      await original.goto('file://' + process.env.THERMAL_BASELINE_FILE);
      await original.waitForFunction(() => typeof state !== 'undefined' && state.field.mode === 'linear');
      assert.equal(await fieldPixels(page), await fieldPixels(original));
      await choose('ラジアル');
      await original.evaluate(() => applyPreset(PRESETS.find(p => p.name === 'ラジアル')));
      assert.equal(await fieldPixels(page), await fieldPixels(original));
      await choose('グラデ');
      await original.evaluate(() => applyPreset(PRESETS.find(p => p.name === 'グラデ')));
      assert.equal(await fieldPixels(page), await fieldPixels(original));
      await choose('KVスワール');
      await original.close();
      note('neutral swirl, radial, and linear fields retain the original compositions pixel for pixel');
    }

    let before = await record();
    const firstImage = await pixels();
    await page.locator('#btnShape').click();
    let after = await record();
    unchanged(before, after, ['lut', 'grain', 'finish', 'motion', 'mask', 'canvas']);
    assert.notDeepEqual(before.field, after.field);
    assert.notEqual(firstImage, await pixels());
    await page.locator('#btnUndo').click();
    assert.deepEqual(await record(), before);
    await page.locator('#btnRedo').click();
    assert.deepEqual(await record(), after);
    note('shape variation preserves color/material/output settings; undo and redo restore the whole edit');

    before = await record();
    await page.locator('#btnPalette').click();
    after = await record();
    unchanged(before, after, ['field', 'seed', 'pins', 'grain', 'finish', 'motion', 'mask', 'canvas', 'quick']);
    assert.notDeepEqual(before.lut.stops, after.lut.stops);
    note('color variation changes only the palette');

    await choose('KVスワール');
    assert.equal(await pixels(), firstImage);
    before = await record();
    await range('うねりの強さ', [60, 70, 80]);
    const stronger = await pixels();
    assert.notEqual(firstImage, stronger);
    await page.locator('#btnUndo').click();
    assert.deepEqual(await record(), before);
    await page.locator('#btnRedo').click();
    assert.equal(await pixels(), stronger);
    await range('模様の大きさ', 70);
    assert.equal(await page.getByRole('slider', { name: 'うねりの強さ', exact: true }).inputValue(), '80');
    const combined = await pixels();
    await page.locator('#btnQuickReset').click();
    assert.deepEqual(await record(), before);
    await range('模様の大きさ', 70);
    await range('うねりの強さ', 80);
    assert.equal(await pixels(), combined);
    await page.locator('#btnQuickReset').click();
    note('a slider gesture is one undo step; size and flow compose independently and reset exactly');

    await choose('ラジアル');
    const radialNeutral = await record();
    const radialNeutralPixels = await pixels();
    // Isolate the radial footprint from color, grain, and distortion. Merely
    // changing noise frequency must not satisfy a test for changing its size.
    const radialFootprint = async () => page.evaluate(() => {
      const saved = stateRecord();
      try {
        Object.assign(state.field, { warp1: 0, curl: 0, rise: 0, gamma: 50, contrast: 50, offset: 0, norm: false });
        state.lut.stops = [S(0, '#000000'), S(1, '#ffffff')];
        state.lut.bands = 0; state.lut.shift = 0; state.lut.invert = false;
        state.grain.mode = 'off'; buildLut(); renderGL(240, 300, 1);
        const rgba = new Uint8Array(240 * 300 * 4);
        gl.readPixels(0, 0, 240, 300, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        let dark = 0;
        for (let i = 0; i < rgba.length; i += 4) if (rgba[i] < 64) dark++;
        return dark;
      } finally {
        restoreRecord(saved); const [w, h] = previewSize(); renderGL(w, h, 1);
      }
    });
    const radialAreas = { neutral: await radialFootprint() };
    const radialSlider = page.getByRole('slider', { name: '模様の大きさ', exact: true });
    await radialSlider.press('Home');
    assert.equal(await radialSlider.inputValue(), '0');
    radialAreas.small = await radialFootprint();
    await page.screenshot({ path: path.join(output, 'radial-small.png') });
    const radialSmall = await record();
    await radialSlider.press('End');
    assert.equal(await radialSlider.inputValue(), '100');
    radialAreas.large = await radialFootprint();
    await page.screenshot({ path: path.join(output, 'radial-large.png') });
    const radialLarge = await record();
    assert.ok(radialAreas.small < radialAreas.neutral * .6, JSON.stringify(radialAreas));
    assert.ok(radialAreas.large > radialAreas.neutral * 1.6, JSON.stringify(radialAreas));
    unchanged(radialNeutral, radialLarge, ['lut', 'grain', 'finish', 'motion', 'mask', 'canvas', 'seed', 'pins']);
    assert.equal(radialLarge.field.linCx, radialNeutral.field.linCx);
    assert.equal(radialLarge.field.linCy, radialNeutral.field.linCy);
    await page.locator('#btnUndo').click(); assert.deepEqual(await record(), radialSmall);
    await page.locator('#btnRedo').click(); assert.deepEqual(await record(), radialLarge);
    await page.locator('#btnQuickReset').click();
    assert.deepEqual(await record(), radialNeutral);
    assert.equal(await pixels(), radialNeutralPixels);
    fs.writeFileSync(path.join(output, 'radial-size.json'), JSON.stringify(radialAreas, null, 2));
    note('the radial footprint visibly shrinks and expands, preserving its center and palette; undo/redo/reset restore it');

    await range('模様の大きさ', 80);
    const radialUrl = await page.evaluate(() => encodeState());
    const radialRestored = await browser.newPage();
    radialRestored.on('pageerror', e => errors.push(e.message));
    await radialRestored.goto(base + '#' + radialUrl); await ready(radialRestored);
    assert.equal(await radialRestored.evaluate(() => encodeState()), radialUrl);
    assert.equal(await pixels(radialRestored), await pixels());
    await radialRestored.close();
    await savePng('radial-resized.png');
    note('resized radial artwork survives URL restoration and PNG export');

    await choose('グラデ');
    const linearNeutral = await record(), linearNeutralPixels = await pixels();
    assert.equal(await page.locator('#advanced').evaluate(e => e.open), false);
    assert.equal(await page.getByRole('slider').count(), 3);
    assert.equal(await page.getByRole('slider', { name: 'うねりの強さ', exact: true }).count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'グラデの方向', exact: true }).isVisible(), true);
    const linearMetrics = async () => page.evaluate(() => {
      const saved = stateRecord(), w = 320, h = 400;
      try {
        Object.assign(state.field, { warp1: 0, curl: 0, rise: 0, gamma: 50, contrast: 50, offset: 0, norm: false });
        state.lut.stops = [S(0, '#000000'), S(1, '#ffffff')];
        state.lut.bands = 0; state.lut.shift = 0; state.lut.invert = false;
        state.grain.mode = 'off'; buildLut(); renderGL(w, h, 1);
        const rgba = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
        const column = Array.from({ length: h }, (_, y) => rgba[(y * w + w / 2) * 4]);
        const row = Array.from({ length: w }, (_, x) => rgba[(h / 2 * w + x) * 4]);
        return {
          transition: column.filter(v => v >= 64 && v < 192).length,
          center: column.findIndex(v => v < 128),
          spanX: Math.max(...row) - Math.min(...row),
          spanY: Math.max(...column) - Math.min(...column)
        };
      } finally { restoreRecord(saved); const [w, h] = previewSize(); renderGL(w, h, 1); }
    });
    const linearMeasurements = { neutral: await linearMetrics() };
    const widthSlider = page.getByRole('slider', { name: 'グラデの幅', exact: true });
    await widthSlider.press('Home');
    linearMeasurements.narrow = await linearMetrics();
    const linearNarrow = await record();
    await page.screenshot({ path: path.join(output, 'linear-narrow.png') });
    await widthSlider.press('End');
    linearMeasurements.wide = await linearMetrics();
    const linearWide = await record();
    await page.screenshot({ path: path.join(output, 'linear-wide.png') });
    assert.ok(linearMeasurements.narrow.transition < linearMeasurements.neutral.transition * .7);
    assert.ok(linearMeasurements.wide.transition > linearMeasurements.neutral.transition * 1.5);
    unchanged(linearNeutral, linearWide, ['lut', 'grain', 'seed', 'pins', 'canvas', 'mask', 'motion', 'finish']);
    await page.locator('#btnUndo').click(); assert.deepEqual(await record(), linearNarrow);
    await page.locator('#btnRedo').click(); assert.deepEqual(await record(), linearWide);
    await page.locator('#btnQuickReset').click(); assert.deepEqual(await record(), linearNeutral);
    assert.equal(await pixels(), linearNeutralPixels);

    await range('グラデの位置', 25); linearMeasurements.start = await linearMetrics();
    await range('グラデの位置', 75); linearMeasurements.end = await linearMetrics();
    assert.ok(Math.abs(linearMeasurements.start.center - linearMeasurements.end.center) > 160);
    await page.locator('#btnQuickReset').click();
    await page.getByRole('combobox', { name: 'グラデの方向', exact: true }).selectOption('0');
    linearMeasurements.horizontal = await linearMetrics();
    assert.ok(linearMeasurements.horizontal.spanX > 180 && linearMeasurements.horizontal.spanY <= 4, JSON.stringify(linearMeasurements));
    await page.screenshot({ path: path.join(output, 'linear-horizontal.png') });
    unchanged(linearNeutral, await record(), ['lut', 'grain', 'seed', 'pins', 'canvas', 'mask', 'motion', 'finish']);
    fs.writeFileSync(path.join(output, 'linear-controls.json'), JSON.stringify(linearMeasurements, null, 2));
    note('linear controls change the actual gradient width, position, and direction with three visible sliders and preserve the palette');

    await range('グラデの幅', 70); await range('グラデの位置', 60);
    await page.getByRole('combobox', { name: 'グラデの方向', exact: true }).selectOption('315');
    const linearUrl = await page.evaluate(() => encodeState());
    const linearRestored = await browser.newPage();
    linearRestored.on('pageerror', e => errors.push(e.message));
    await linearRestored.goto(base + '#' + linearUrl); await ready(linearRestored);
    assert.equal(await linearRestored.evaluate(() => encodeState()), linearUrl);
    assert.equal(await pixels(linearRestored), await pixels());
    await linearRestored.close();
    await savePng('linear-adjusted.png');
    await page.locator('#btnQuickReset').click();
    assert.deepEqual(await record(), linearNeutral);
    assert.equal(await pixels(), linearNeutralPixels);
    note('linear edits compose without cancelling each other and survive undo/redo, reset, URL restoration, and PNG export');

    const legacyLinear = await page.evaluate(() => {
      const data = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(encodeState())))));
      delete data.field.linWidth; delete data.field.linPosition;
      return encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(data)))));
    });
    const legacyRestored = await browser.newPage();
    legacyRestored.on('pageerror', e => errors.push(e.message));
    await legacyRestored.goto(base + '#' + legacyLinear); await ready(legacyRestored);
    assert.equal(await pixels(legacyRestored), linearNeutralPixels);
    await legacyRestored.close();
    note('existing linear URLs without width or position fields keep their original artwork');
    await choose('KVスワール');

    await page.locator('#btnRemember').click();
    before = await record();
    await page.locator('#btnShape').click();
    after = await record();
    await page.locator('#btnCompare').click();
    assert.equal(await page.locator('#compareImage').isVisible(), true);
    assert.deepEqual(await record(), after);
    await page.screenshot({ path: path.join(output, 'comparison.png') });
    await page.locator('#btnCompare').click();
    assert.equal(await page.locator('#compareImage').isVisible(), false);
    note('comparison displays the remembered image without changing the current project');

    await page.locator('#advanced > summary').click();
    await range('ワープ1', 23);
    assert.equal((await record()).quick.name, 'カスタム');
    const preciseImage = await pixels();
    await range('模様の大きさ', 50);
    assert.equal(await pixels(), preciseImage);
    await page.locator('#advanced > summary').click();
    note('precise edits become the baseline for the simple controls without changing the artwork');

    await choose('Webフロー');
    assert.equal(await page.getByRole('checkbox', { name: 'モーション', exact: true }).isChecked(), false);
    await page.getByRole('checkbox', { name: 'モーション', exact: true }).check();
    assert.equal(await page.getByRole('checkbox', { name: 'モーション', exact: true }).isChecked(), true);
    assert.equal(await page.locator('#motionDetails').isVisible(), true);
    await choose('KVスワール');
    assert.equal(await page.getByRole('checkbox', { name: 'モーション', exact: true }).isChecked(), true);
    assert.equal(await page.locator('#motionDetails').isVisible(), true);
    assert.equal(await page.locator('#motionDetails').evaluate(e => e.open), true);
    await page.getByRole('checkbox', { name: 'モーション', exact: true }).uncheck();
    note('optional motion settings appear on demand and remain enabled across look changes');

    await range('うねりの強さ', 100);
    const encoded = await page.evaluate(() => encodeState());
    const restored = await browser.newPage();
    restored.on('pageerror', e => errors.push(e.message));
    await restored.goto(base + '#' + encoded);
    await ready(restored);
    assert.equal(await restored.evaluate(() => encodeState()), encoded);
    assert.equal(await restored.locator('#advanced').evaluate(e => e.open), false);
    assert.equal(await restored.locator('#btnUndo').isEnabled(), false);
    await restored.close();
    note('shared URLs restore all rendering settings, including strong vortex rotations, with a clean history');

    await choose('KVスワール');
    await page.getByRole('checkbox', { name: '文字・画像で切り抜く', exact: true }).check();
    assert.equal(await page.locator('#maskDetails').evaluate(e => e.open), true);
    await page.getByRole('textbox', { name: 'テキスト1', exact: true }).fill('FLOW');
    const textInput = page.getByRole('textbox', { name: 'テキスト1', exact: true });
    await textInput.press('End'); await textInput.pressSequentially('X');
    const historyCount = await page.evaluate(() => UNDO.length);
    await textInput.press('Meta+z');
    assert.equal(await textInput.inputValue(), 'FLOW');
    assert.equal(await page.evaluate(() => UNDO.length), historyCount);
    await page.getByRole('textbox', { name: 'テキスト2', exact: true }).fill('');
    await page.getByRole('checkbox', { name: '背景を透過', exact: true }).check();
    let png = await savePng('transparent-mask.png');
    assert.ok(png.readUInt32BE(16) > 0 && png.readUInt32BE(16) <= 1080);
    assert.ok(png.readUInt32BE(20) > 0 && png.readUInt32BE(20) < 1350);
    const alpha = await page.evaluate(async data => {
      const im = new Image(); im.src = 'data:image/png;base64,' + data; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const ctx = c.getContext('2d'); ctx.drawImage(im, 0, 0);
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let clear = 0, opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) { if (pixels[i] === 0) clear++; if (pixels[i] === 255) opaque++; }
      return { clear, opaque };
    }, png.toString('base64'));
    assert.ok(alpha.clear > 1000 && alpha.opaque > 1000);
    note('text masks and transparent PNG export remain functional');
    note('native text undo is preserved while editing mask text');

    await page.getByRole('checkbox', { name: '文字・画像で切り抜く', exact: true }).uncheck();
    await choose('マーブル');
    await page.locator('#paletteChoices').locator('..').evaluate(e => e.open = true);
    await page.getByRole('button', { name: '配色: VALO レッド', exact: true }).first().click();
    await page.locator('#paletteChoices').locator('..').evaluate(e => e.open = false);
    await range('粒感', 18);
    assert.equal(await page.locator('#advanced').evaluate(e => e.open), false);
    png = await savePng('basic-workflow.png');
    assert.equal(png.readUInt32BE(16), 1080); assert.equal(png.readUInt32BE(20), 1350);
    note('look → palette → simple adjustment → full-size PNG completes without opening advanced settings');

    await page.getByRole('combobox', { name: 'キャンバス', exact: true }).selectOption('custom');
    await page.getByRole('spinbutton', { name: 'キャンバス幅', exact: true }).fill('320');
    await page.getByRole('spinbutton', { name: 'キャンバス高さ', exact: true }).fill('400');
    await page.getByRole('spinbutton', { name: 'キャンバス高さ', exact: true }).press('Tab');
    await page.getByRole('checkbox', { name: 'モーション', exact: true }).check();
    await range('ループ秒', 2);
    const videoDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'WebM書き出し(1ループ)', exact: true }).click();
    await (await videoDownload).saveAs(path.join(output, 'motion.webm'));
    const movie = fs.readFileSync(path.join(output, 'motion.webm'));
    assert.ok(movie.length > 1000);
    const videoSize = await page.evaluate(async data => {
      const v = document.createElement('video');
      const loaded = new Promise((resolve, reject) => { v.onloadedmetadata = resolve; v.onerror = reject; });
      v.src = 'data:video/webm;base64,' + data; await loaded;
      return [v.videoWidth, v.videoHeight];
    }, movie.toString('base64'));
    assert.deepEqual(videoSize, [320, 400]);
    await page.getByRole('checkbox', { name: 'モーション', exact: true }).uncheck();
    await page.getByRole('combobox', { name: 'キャンバス', exact: true }).selectOption('45');
    note('custom dimensions and a two-second WebM export work through the reorganized controls');

    await choose('KVスワール');
    before = await record();
    await page.locator('#btnPins').click();
    const canvasBox = await page.locator('#ov').boundingBox();
    await page.mouse.click(canvasBox.x + canvasBox.width * .05, canvasBox.y + canvasBox.height * .05);
    assert.equal((await record()).pins.length, before.pins.length + 1);
    await page.locator('#btnUndo').click();
    assert.deepEqual(await record(), before);
    await page.locator('#btnPins').click();
    assert.equal(await page.locator('#ov').isVisible(), false);
    note('vortex editing is opt-in and pin additions can be undone');

    await page.getByText('すべての配色・保存した色', { exact: true }).click();
    await page.getByRole('button', { name: '＋ 現在の色を保存', exact: true }).click();
    await page.getByRole('textbox', { name: '保存する配色の名前', exact: true }).fill('<b>検証</b>');
    await page.locator('#lutSaveBtn').click();
    const savedPalette = (await record()).lut.stops;
    assert.equal(await page.locator('#lutPresets b').count(), 0);
    await page.locator('#btnPalette').click();
    await page.getByRole('button', { name: '配色: <b>検証</b>', exact: true }).click();
    assert.deepEqual((await record()).lut.stops, savedPalette);
    await page.reload(); await ready(page);
    assert.equal(await page.evaluate(() => loadUserLuts().length), 1);
    note('saved palettes retain their colors and literal names across a reload');

    await choose('KVスワール');
    for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.locator('#panelScroll').evaluate(e => e.scrollTop = 0);
      await page.waitForTimeout(100);
      const dimensions = await page.evaluate(() => {
        const save = document.querySelector('#btnPng1').getBoundingClientRect();
        const canvas = document.querySelector('#view').getBoundingClientRect();
        const stage = document.querySelector('#stage').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth > innerWidth, saveVisible: save.bottom <= innerHeight && save.top >= 0, canvasFits: canvas.left >= stage.left && canvas.right <= stage.right && canvas.bottom <= stage.bottom };
      });
      assert.equal(dimensions.overflow, false); assert.ok(dimensions.saveVisible); assert.ok(dimensions.canvasFits);
      await page.screenshot({ path: path.join(output, 'desktop-' + width + '.png') });
    }
    note('desktop layouts at 1280, 1440, and 1920 keep the preview and save action in view');
    assert.deepEqual(errors, []);
    const report = { testedAt: new Date().toISOString(), checks, errors, output };
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
