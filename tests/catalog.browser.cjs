// Focused library QA. Run: node tests/catalog.browser.cjs (Playwright required).
// Starts a local-only server; artifacts stay outside the repository.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = process.env.CATALOG_QA_OUTPUT || '/tmp/motion-lab-catalog-qa';
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname.endsWith('/') ? pathname + 'index.html' : pathname));
  if (!file.startsWith(root + path.sep)) {res.writeHead(403).end();return;}
  fs.readFile(file, (error, data) => {if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'text/html');res.end(data);});
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ headless: true, ...(process.env.CATALOG_CHROMIUM_PATH ? {executablePath:process.env.CATALOG_CHROMIUM_PATH} : {}) });
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);
    assert.equal(await page.locator('.card').count(),21);
    assert.equal(await page.locator('.category-section').count(),5);
    const paths=await page.locator('.card').evaluateAll(cards=>cards.map(a=>new URL(a.href).pathname));
    assert.equal(new Set(paths).size,19);
    paths.forEach(file=>assert.ok(fs.existsSync(path.join(root,file.endsWith('/')?file+'index.html':file)),file));
    assert.equal(await page.locator('a[target=_blank]').count(),0);
    assert.equal(await page.locator('a[href="tools/heatmap-blur.html?workspace=type"]').count(),1);
    assert.equal(await page.locator('a[href="tools/heatmap-blur.html?workspace=media"]').count(),1);
    assert.equal(await page.locator('a[href="tools/halftone-lab.html?workspace=image"]').count(),1);
    assert.equal(await page.locator('a[href="tools/halftone-lab.html?workspace=generate"]').count(),1);
    await page.screenshot({path:path.join(output,'catalog-desktop.png'),fullPage:true});
    console.log('PASS: 21 entries, 19 original tools, 5 categories, 4 split-workspace links');
    const counts={image:6,texture:5,type:4,motion:4,'3d':2};
    for(const [category,count] of Object.entries(counts)){
      await page.locator(`[data-category="${category}"]`).click();
      assert.equal(await page.locator('.card').count(),count);
      assert.equal(new URL(page.url()).searchParams.get('category'),category);
    }
    await page.goBack();
    assert.equal(await page.locator('[data-category=motion]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('.card').count(),4);
    await page.goForward();assert.equal(await page.locator('.card').count(),2);
    console.log('PASS: category filters and Back/Forward state restoration');
    await page.locator('#u19Filter').click();
    assert.equal(await page.locator('.card').count(),3);
    await page.locator('#u19Filter').click();assert.equal(await page.locator('.card').count(),21);
    await page.locator('#search').fill('heatmap');assert.equal(await page.locator('.card').count(),2);
    await page.locator('#search').fill('heatmap 動画');assert.equal(await page.locator('.card').count(),1);
    await page.reload();assert.equal(await page.locator('.card').count(),1);
    await page.locator('#search').fill('no-result-123');assert.equal(await page.locator('#emptyState').isVisible(),true);
    await page.locator('#clearFilters').click();assert.equal(await page.locator('.card').count(),21);
    assert.equal(await page.locator('#search').evaluate(e=>e===document.activeElement),true);
    await page.locator('#outputFilter').selectOption('SVG');
    assert.equal(await page.locator('.card').count(),5);
    await page.locator('#outputFilter').selectOption('');
    await page.locator('h1').click();await page.keyboard.press('/');
    assert.equal(await page.locator('#search').evaluate(e=>e===document.activeElement),true);
    console.log('PASS: U19, search AND terms, reload, empty state, reset, output filter, keyboard shortcut');
    await page.locator('[data-category=type]').click();
    await page.screenshot({path:path.join(output,'catalog-type.png'),fullPage:true});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});
      await page.goto(url);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}px overflow`);
      await page.locator('#u19Filter').click();assert.equal(await page.locator('.card').count(),3);
      await page.locator('#u19Filter').click();
      await page.screenshot({path:path.join(output,`catalog-mobile-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: mobile 390px/320px no horizontal overflow, filters work, zero page errors');
    console.log('Artifacts:',output);
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
