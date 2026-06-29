// Inspect the export UI state after clicking Export: did the dialog open? what
// buttons/classes exist? Screenshot for vision. Usage: node e2e/_ui_inspect.cjs
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3003/';
const OUT = 'C:/Users/patij212/AppData/Local/Temp/pf_ui_export';
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForTimeout(16000); // settle past the 8s preview-pipeline compile
    const before = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].map((b) => ({ t: (b.innerText || '').trim().slice(0, 24), c: b.className.slice(0, 40), vis: b.offsetParent !== null }));
      return { count: btns.length, withExport: btns.filter((b) => /export/i.test(b.t)) };
    });
    console.log('BEFORE click — export-ish buttons:', JSON.stringify(before.withExport));
    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    await exportBtn.click();
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => {
      const dialog = document.querySelector('.ed-footer, .export-dialog, [class*="export-dialog"], [role="dialog"]');
      const primary = [...document.querySelectorAll('.ed-btn--primary, .ed-btn')].map((b) => ({ t: (b.innerText || '').trim().slice(0, 30), c: b.className.slice(0, 50), vis: b.offsetParent !== null }));
      const tabs = [...document.querySelectorAll('[class*="ed-tab"], [class*="tab"]')].map((b) => (b.innerText || '').trim().slice(0, 16)).filter(Boolean).slice(0, 12);
      return { dialogPresent: !!dialog, dialogClass: dialog ? dialog.className.slice(0, 60) : null, edButtons: primary, tabs };
    });
    console.log('AFTER click — dialog present:', after.dialogPresent, 'class:', after.dialogClass);
    console.log('  ed-buttons:', JSON.stringify(after.edButtons));
    console.log('  tabs:', JSON.stringify(after.tabs));
    await page.screenshot({ path: OUT + '/after_export_click.png', fullPage: false });
    console.log('screenshot:', OUT + '/after_export_click.png');
  } catch (e) { console.error('INSPECT FAILED:', String(e.message || e).slice(0, 160)); await page.screenshot({ path: OUT + '/inspect_fail.png' }).catch(() => {}); }
  finally { await browser.close(); }
  process.exit(0);
})();
