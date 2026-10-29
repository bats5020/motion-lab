// Visual/interaction regression for the molten ribbon and pool workflow.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.THERMAL_PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.THERMAL_RIBBON_OUTPUT || '/private/tmp/thermal-ribbon-qa';
fs.mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [], checks = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.on('pageerror', e => errors.push(e.message));
    const note = text => { checks.push(text); console.log('PASS', text); };
    const base = process.env.THERMAL_URL || 'http://127.0.0.1:8766/tools/thermal-flow.html';
    await page.goto(base + '?p=' + encodeURIComponent('溶融リボン') + '&size=32');
    await page.waitForFunction(() => document.querySelectorAll('[data-ready=true]').length === PRESETS.length, {}, { timeout: 90000 });
    const state = () => page.evaluate(() => stateRecord());
    const pixels = () => page.evaluate(() => { renderGL(360, 240, 1); const result = view.toDataURL(); renderGL(...previewSize(), 1); return result; });
    const choose = async name => {
      const button = page.getByRole('button', { name: 'ルック: ' + name, exact: true });
      if (!(await button.isVisible())) await page.locator('#moreLooks > summary').click();
      await button.click();
      if (await page.locator('#moreLooks').evaluate(el => el.open)) await page.locator('#moreLooks > summary').click();
    };
    const range = async (name, value) => page.getByRole('slider', { name, exact: true }).evaluate((el, value) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      el.value = value; el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    assert.equal((await state()).field.mode, 'ribbon');
    assert.equal(await page.getByRole('slider').count(), 3);
    assert.equal((await state()).canvas.mode, '32');
    const lookImages = [];
    for (const [index, name] of ['溶融リボン', '溶融プール', '溶融ウェーブ'].entries()) {
      await choose(name); lookImages.push(await pixels());
      const png = await page.evaluate(() => { renderGL(1050, 700, 1); const png = view.toDataURL(); renderGL(...previewSize(), 1); return png; });
      fs.writeFileSync(path.join(output, 'look-' + index + '.png'), Buffer.from(png.split(',')[1], 'base64'));
    }
    assert.equal(new Set(lookImages).size, 3);
    note('three distinct molten looks remain selectable with three sliders');

    for (const name of ['溶融リボン', '溶融プール', '溶融ウェーブ']) {
      await choose(name); const before = await state(), original = await pixels();
      await range('模様の大きさ', 0); const small = await pixels();
      await range('模様の大きさ', 100); const large = await pixels();
      assert.equal(new Set([small, original, large]).size, 3);
      await range('伸び具合', 95); const stretched = await pixels(), a = await state();
      assert.notEqual(stretched, large); assert.deepEqual(a.lut, before.lut); assert.deepEqual(a.grain, before.grain);
      await page.locator('#btnQuickReset').click(); assert.deepEqual(await state(), before); assert.equal(await pixels(), original);
      await range('伸び具合', 95); await range('模様の大きさ', 100);
      assert.deepEqual(await state(), a); assert.equal(await pixels(), stretched);
      await page.locator('#btnQuickReset').click();
    }
    note('size and elongation visibly change every look, compose in either order, and reset exactly');

    await choose('溶融リボン');
    const before = await state(), original = await pixels();
    await page.getByRole('combobox', { name: '帯の向き', exact: true }).selectOption('90');
    assert.notEqual(await pixels(), original);
    await page.locator('#btnUndo').click(); assert.deepEqual(await state(), before);
    await page.locator('#btnRedo').click(); assert.equal((await state()).field.flowAngle, 90);
    await range('粒感', 0); const smooth = await pixels(); await range('粒感', 65); assert.notEqual(await pixels(), smooth);
    await page.locator('#btnShape').click(); const variant = await state(); assert.deepEqual(variant.lut, before.lut); assert.equal(variant.grain.amount, 65);
    note('direction, grain and shape variation work with undo/redo and preserve chosen colors');

    await choose('溶融リボン'); await page.getByRole('button', { name: 'グラデを編集', exact: true }).click();
    assert.equal(await page.getByRole('combobox', { name: 'グラデーションの形', exact: true }).inputValue(), 'ribbon');
    const dragHandle = async (kind, target) => {
      const start = await page.evaluate(kind => gradientHandles().find(h => h.kind === kind).p, kind);
      const b = await page.locator('#studioEditCanvas').boundingBox();
      await page.mouse.move(b.x + start[0] * b.width, b.y + (1 - start[1]) * b.height); await page.mouse.down();
      await page.mouse.move(b.x + target[0] * b.width, b.y + (1 - target[1]) * b.height, { steps: 5 }); await page.mouse.up();
    };
    const beforeDrag = await pixels(); await dragHandle('flowCenter', [.62, .58]); assert.notEqual(await pixels(), beforeDrag);
    await page.locator('#btnUndo').click(); assert.equal(await pixels(), beforeDrag);
    await dragHandle('flowAngle', [.72, .58]); assert.notEqual(await pixels(), beforeDrag);
    await page.locator('#btnUndo').click(); assert.equal(await pixels(), beforeDrag);
    note('native canvas drags move and rotate the pattern and each gesture undoes in one step');

    const share = await page.evaluate(() => encodeState()), expected = await state(), expectedPixels = await pixels();
    await page.evaluate(hash => { applyPreset(PRESETS.find(p => p.name === 'グラデ')); decodeState(hash); buildLut(); refreshAll(); }, share);
    assert.deepEqual((await state()).field, expected.field); assert.equal(await pixels(), expectedPixels);
    const project = await page.evaluate(() => projectSnapshot());
    await page.evaluate(async project => { applyPreset(PRESETS.find(p => p.name === 'ラジアル')); await loadProject(project); }, project);
    assert.deepEqual((await state()).field, expected.field); assert.equal(await pixels(), expectedPixels);
    await choose('溶融プール'); await page.locator('#btnQuickReset').click(); assert.equal((await state()).field.aniso, 0);
    await choose('グラデ'); assert.equal((await state()).field.flowZoom, 100); assert.equal((await state()).field.flowAngle, 0);
    note('URL and JSON restore the flow geometry; switching looks clears flow transforms');

    await choose('溶融リボン');
    await page.evaluate(() => { state.motion.on = true; state.motion.loop = true; state.motion.loopSec = 8; refreshAll(); });
    const frames = await page.evaluate(() => { _recording = true; const frames = []; for (const t of [0, 2, 8]) { setAnimPhase(t); renderGL(360, 240, 1); frames.push(view.toDataURL()); } _recording = false; state.motion.on = false; _animT = { z: 0, x: 0, h: 0 }; refreshAll(); redraw(); return frames; });
    assert.notEqual(frames[0], frames[1]); assert.equal(frames[0], frames[2]);
    note('the new flow mode animates and its loop endpoints match');
    await choose('溶融リボン');
    const download = page.waitForEvent('download'); await page.locator('#btnPng1').click(); const file = await download;
    await file.saveAs(path.join(output, 'molten-ribbon.png')); const png = fs.readFileSync(path.join(output, 'molten-ribbon.png'));
    assert.equal(png.readUInt32BE(16), 1500); assert.equal(png.readUInt32BE(20), 1000);
    await page.locator('#gradientEditor').evaluate(el => { el.open = false; });
    await page.evaluate(() => { studioEdit = ''; document.querySelector('#studioEditCanvas').style.pointerEvents = 'none'; document.querySelector('#panelScroll').scrollTop = 0; drawStudioHandles(); });
    for (const [width, height] of [[1280, 800], [1440, 1000]]) {
      await page.setViewportSize({ width, height }); await page.waitForTimeout(300);
      assert.ok(await page.locator('#btnPng1').isVisible());
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.evaluate(() => {
        const panel = document.querySelector('#panelScroll').getBoundingClientRect();
        return [...document.querySelectorAll('#quickControls input[type=range]')].every(el => {
          const b = el.getBoundingClientRect(); return b.top >= panel.top && b.bottom <= panel.bottom;
        });
      }), true, 'all three primary sliders fit inside the panel');
      await page.screenshot({ path: path.join(output, 'desktop-' + width + '.png') });
    }
    note('1500×1000 PNG downloads successfully and desktop layouts remain usable');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ at: new Date().toISOString(), checks, errors }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
