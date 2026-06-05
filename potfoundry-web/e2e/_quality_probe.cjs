const { chromium } = require('@playwright/test');

const styleId = process.env.PF_STYLE_ID || 'HarmonicRipple';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const sampleLimit = Number(process.env.PF_QUALITY_SAMPLE_LIMIT || 30);
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
  });
  const page = await browser.newPage();
  if (process.env.PF_BYCONSTRUCTION === '1') {
    await page.addInitScript(() => {
      window.__pfByConstruction = true;
    });
  }
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
  await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
  await page.evaluate((s) => window.__pfFidelity.setStyle(s), styleId);

  const diag = await page.evaluate(
    ({ targetTriangles: t, sampleLimit: limit }) =>
      window.__pfFidelity.diagnoseQuality({ targetTriangles: t, sampleLimit: limit }),
    { targetTriangles, sampleLimit },
  );

  console.log(`QUALITY_JSON ${JSON.stringify(diag)}`);
  await browser.close();
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
