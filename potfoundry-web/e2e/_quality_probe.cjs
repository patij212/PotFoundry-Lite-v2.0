const { chromium } = require('@playwright/test');

const styleId = process.env.PF_STYLE_ID || 'HarmonicRipple';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const sampleLimit = Number(process.env.PF_QUALITY_SAMPLE_LIMIT || 30);
const triangleStart = process.env.PF_QUALITY_TRIANGLE_START === undefined
  ? undefined
  : Number(process.env.PF_QUALITY_TRIANGLE_START);
const triangleEnd = process.env.PF_QUALITY_TRIANGLE_END === undefined
  ? undefined
  : Number(process.env.PF_QUALITY_TRIANGLE_END);
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'],
  });
  const page = await browser.newPage();
  page.on('console', (message) => {
    const text = message.text();
    if (
      text.includes('[StageProbe] A surfaceStats:') ||
      text.includes('[StageProbe] base-gen DONE:') ||
      text.includes('[LOOP-FILL-CAND]') ||
      text.includes('[LOOP-TRI-CAND]') ||
      text.includes('[BRANCHED-FILL]')
    ) {
      console.log(text);
    }
  });
  if (process.env.PF_LOOP_FILL_DIAG === '1') {
    await page.addInitScript(() => {
      window.__pfEnableLoopFillDiagnostics = true;
    });
  }
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
    ({ targetTriangles: t, sampleLimit: limit, triangleStart: start, triangleEnd: end }) =>
      window.__pfFidelity.diagnoseQuality({
        targetTriangles: t,
        sampleLimit: limit,
        ...(Number.isFinite(start) ? { triangleStart: start } : {}),
        ...(Number.isFinite(end) ? { triangleEnd: end } : {}),
      }),
    { targetTriangles, sampleLimit, triangleStart, triangleEnd },
  );

  console.log(`QUALITY_JSON ${JSON.stringify(diag)}`);
  await browser.close();
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
