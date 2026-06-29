// Dump the EXPORT-section DOM to find the real export trigger + which UI is active.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const BASE = 'http://127.0.0.1:3003/';
const OUT = 'C:/Users/patij212/AppData/Local/Temp/pf_ui_export';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(26000);
    const info = await page.evaluate(() => {
      const out = { uiMarkers: {}, exportEls: [], allButtons: [] };
      out.uiMarkers.v1ExportPanel = !!document.querySelector('.export-panel__export-btn, [class*="export-panel"]');
      out.uiMarkers.v2StatusFooter = !!document.querySelector('[class*="status-footer"], [class*="StatusFooter"]');
      out.uiMarkers.exportDialog = !!document.querySelector('.ed-footer, [class*="export-dialog"]');
      // Find the EXPORT section trigger and click it.
      const triggers = [...document.querySelectorAll('.pf-section__trigger')];
      const exportTrig = triggers.find((t) => /export/i.test(t.innerText || ''));
      if (exportTrig) exportTrig.click();
      return out;
    });
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => {
      const els = [...document.querySelectorAll('[class*="export"], [class*="Export"]')].map((e) => ({ tag: e.tagName, c: (e.className || '').toString().slice(0, 55), t: (e.innerText || '').trim().slice(0, 28), vis: e.offsetParent !== null })).slice(0, 30);
      const btns = [...document.querySelectorAll('button')].filter((b) => b.offsetParent !== null).map((b) => ({ c: (b.className || '').slice(0, 45), t: (b.innerText || '').trim().slice(0, 28) })).slice(0, 40);
      return { els, btns };
    });
    console.log('UI markers:', JSON.stringify(info.uiMarkers));
    console.log('export-class elements:', JSON.stringify(after.els, null, 1));
    console.log('visible buttons:', JSON.stringify(after.btns));
    await page.screenshot({ path: OUT + '/export_section_expanded.png' });
  } catch (e) { console.error('FAIL', String(e.message || e).slice(0, 160)); }
  finally { await browser.close(); }
  process.exit(0);
})();
