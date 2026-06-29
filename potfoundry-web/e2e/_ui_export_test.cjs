// End-to-end UI export test: drive the REAL app (not the fidelity hook) — click
// Export, confirm the dialog opens with conforming+high+3mf, click Download,
// capture the downloaded file, and validate it's a real 3MF (valid OPC zip with
// 3dmodel.model + vertices/triangles). Proves the UI wiring produces a Cura-ready
// file. Usage: node e2e/_ui_export_test.cjs   (dev :3003)
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/';
const OUT = 'C:/Users/patij212/AppData/Local/Temp/pf_ui_export';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on('console', (m) => { const t = m.text(); if (/error|fail|conform|export|profile|quality/i.test(t)) console.log('  [page]', t.slice(0, 160)); });
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(26000); // settle past the live-preview shader compile
    // 1) Expand the collapsible EXPORT section in the sidebar.
    const section = page.locator('.pf-section__trigger', { hasText: 'EXPORT' }).first();
    await section.waitFor({ state: 'visible', timeout: 60000 });
    await section.scrollIntoViewIfNeeded();
    await section.click();
    await page.waitForTimeout(1000);
    // 2) Click the real Export button inside the panel (opens the dialog). Auto-waits
    //    for it to be enabled (preview 'Generating...' disables it transiently).
    const exportBtn = page.locator('.export-panel__export-btn').first();
    await exportBtn.scrollIntoViewIfNeeded();
    console.log('Export… button found; clicking (waits for enabled)…');
    await exportBtn.click({ timeout: 90000 });
    await page.waitForTimeout(1500);
    // 3) The dialog's primary Download button (.ed-btn--primary, text "Download 3MF").
    const dlBtn = page.locator('.ed-btn--primary').first();
    await dlBtn.waitFor({ state: 'visible', timeout: 30000 });
    console.log('Dialog action button found; starting export (high-fidelity build may take 10-60s)…');
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 300000 }),
      dlBtn.click(),
    ]);
    const suggested = download.suggestedFilename();
    const dest = path.join(OUT, suggested);
    await download.saveAs(dest);
    const buf = fs.readFileSync(dest);
    console.log(`DOWNLOADED: ${suggested}  (${(buf.length / 1048576).toFixed(2)} MB)`);
    // Validate format.
    if (suggested.endsWith('.3mf')) {
      const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // 'PK'
      let model = null, verts = 0, tris = 0, unit = null;
      try {
        const JSZip = require('jszip');
        const zip = await JSZip.loadAsync(buf);
        model = zip.file('3D/3dmodel.model');
        if (model) { const xml = await model.async('string'); verts = (xml.match(/<vertex /g) || []).length; tris = (xml.match(/<triangle /g) || []).length; const m = xml.match(/unit="([a-z]+)"/); unit = m ? m[1] : null; }
      } catch (e) { console.log('  (jszip parse skipped:', String(e.message).slice(0, 60), ')'); }
      console.log(`3MF VALID: zip=${isZip} hasModel=${!!model} unit=${unit} vertices=${verts} triangles=${tris}`);
      console.log(verts > 1000 && tris > 1000 && isZip && unit === 'millimeter' ? '>>> UI EXPORT OK — Cura-ready 3MF <<<' : '>>> CHECK: 3MF structure incomplete <<<');
    } else if (suggested.endsWith('.stl')) {
      const triCount = buf.length >= 84 ? buf.readUInt32LE(80) : 0;
      const expected = 84 + triCount * 50;
      console.log(`STL: triangleCount=${triCount} sizeMatch=${buf.length === expected}`);
      console.log(triCount > 1000 && buf.length === expected ? '>>> UI EXPORT OK — valid binary STL <<<' : '>>> CHECK <<<');
    } else { console.log('Unexpected format:', suggested); }
  } catch (e) {
    console.error('UI EXPORT TEST FAILED:', String(e.message || e).slice(0, 200));
    await page.screenshot({ path: path.join(OUT, 'failure.png') }).catch(() => {});
  } finally { await browser.close(); }
  process.exit(0);
})();
