// Robust end-to-end UI export: scroll to the EXPORT section, expand it, find the
// export button WITHIN the panel by text, click → dialog → Download 3MF → validate.
const fs = require('fs'); const path = require('path');
const { chromium } = require('@playwright/test');
const BASE = 'http://127.0.0.1:3003/';
const OUT = 'C:/Users/patij212/AppData/Local/Temp/pf_ui_export';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  page.on('console', (m) => { const t = m.text(); if (/conform|downloadMesh|export fail|3mf|generateMesh|profile/i.test(t)) console.log('  [page]', t.slice(0, 150)); });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    // Wait for the sidebar to be fully ready (background style-pipeline compiles can
    // delay it). Poll for the EXPORT section trigger to attach.
    const trig = page.locator('.pf-section__trigger', { hasText: 'EXPORT' }).first();
    await trig.waitFor({ state: 'attached', timeout: 120000 });
    await page.waitForTimeout(3000);
    await trig.scrollIntoViewIfNeeded();
    await trig.click();
    await page.waitForTimeout(2500);
    // Dump the export-panel buttons (incl. hidden) to find the real one.
    const panelBtns = await page.evaluate(() => {
      const panel = document.querySelector('.export-panel');
      if (!panel) return { noPanel: true };
      return { btns: [...panel.querySelectorAll('button')].map((b) => ({ t: (b.innerText || '').trim().slice(0, 30), c: (b.className || '').slice(0, 60), disabled: b.disabled, vis: b.offsetParent !== null })) };
    });
    console.log('EXPORT-panel buttons:', JSON.stringify(panelBtns));
    await page.screenshot({ path: OUT + '/v3_after_expand.png' });
    // Click the panel's export action button (text Export…/Download), by text within the panel.
    const exportBtn = page.locator('.export-panel button', { hasText: /export|download/i }).first();
    await exportBtn.waitFor({ state: 'visible', timeout: 30000 });
    console.log('Clicking export action…');
    await exportBtn.click({ timeout: 60000 });
    await page.waitForTimeout(2000);
    // Dialog open? Click Download.
    const dlBtn = page.locator('.ed-btn--primary').first();
    await dlBtn.waitFor({ state: 'visible', timeout: 20000 });
    console.log('Dialog open; clicking Download (build may take 10-60s)…');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 300000 }),
      dlBtn.click(),
    ]);
    const suggested = download.suggestedFilename();
    const dest = path.join(OUT, suggested);
    await download.saveAs(dest);
    const buf = fs.readFileSync(dest);
    console.log(`DOWNLOADED: ${suggested} (${(buf.length / 1048576).toFixed(2)} MB)`);
    if (suggested.endsWith('.3mf')) {
      const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
      let verts = 0, tris = 0, unit = null;
      try { const JSZip = require('jszip'); const zip = await JSZip.loadAsync(buf); const m = zip.file('3D/3dmodel.model'); if (m) { const xml = await m.async('string'); verts = (xml.match(/<vertex /g) || []).length; tris = (xml.match(/<triangle /g) || []).length; const u = xml.match(/unit="([a-z]+)"/); unit = u ? u[1] : null; } } catch (e) { console.log('  (zip parse:', String(e.message).slice(0, 50), ')'); }
      console.log(`3MF: zip=${isZip} unit=${unit} vertices=${verts} triangles=${tris}`);
      console.log(isZip && verts > 1000 && tris > 1000 && unit === 'millimeter' ? '>>> UI EXPORT OK — Cura-ready 3MF at ' + dest + ' <<<' : '>>> CHECK 3MF <<<');
    } else { const tc = buf.length >= 84 ? buf.readUInt32LE(80) : 0; console.log(`${suggested}: triangleCount=${tc}`); }
  } catch (e) { console.error('FAILED:', String(e.message || e).slice(0, 180)); await page.screenshot({ path: OUT + '/v3_fail.png' }).catch(() => {}); }
  finally { await browser.close(); }
  process.exit(0);
})();
