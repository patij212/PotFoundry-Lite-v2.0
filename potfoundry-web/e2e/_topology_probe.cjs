const { chromium } = require('@playwright/test');

const styleId = process.env.PF_STYLE_ID || 'SuperformulaBlossom';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const sampleLimit = Number(process.env.PF_TOPOLOGY_SAMPLE_LIMIT || 64);
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,UseSkiaRenderer',
    ],
  });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log(`[browser] ${msg.text()}`));
  if (process.env.PF_WINDING_STAGE === '1') {
    await page.addInitScript(() => {
      window.__pfEnableWindingStageDiagnostics = true;
    });
  }
  if (process.env.PF_BYCONSTRUCTION === '1') {
    await page.addInitScript(() => {
      window.__pfByConstruction = true;
    });
  }
  if (process.env.PF_SOURCE_DIAG === '1') {
    await page.addInitScript(() => {
      window.__pfEnableSourceDiagnostics = true;
    });
  }
  if (process.env.PF_SOURCE_TRIS) {
    const tris = process.env.PF_SOURCE_TRIS
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0);
    await page.addInitScript((triangles) => {
      window.__pfEnableSourceDiagnostics = true;
      window.__pfSourceTriangleProbe = triangles;
    }, tris);
  }
  if (process.env.PF_SOURCE_EDGES) {
    const edges = process.env.PF_SOURCE_EDGES
      .split(',')
      .map((s) => s.trim().split('-').map((part) => Number(part)))
      .filter((pair) => pair.length === 2 && pair.every((n) => Number.isFinite(n) && n >= 0));
    await page.addInitScript((sourceEdges) => {
      window.__pfEnableSourceDiagnostics = true;
      window.__pfSourceEdgeProbe = sourceEdges;
    }, edges);
  }

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
  await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
  await page.evaluate((s) => window.__pfFidelity.setStyle(s), styleId);

  const diag = await page.evaluate(
    ({ targetTriangles: t, sampleLimit: limit }) =>
      window.__pfFidelity.diagnoseTopology({ targetTriangles: t, sampleLimit: limit }),
    { targetTriangles, sampleLimit },
  );

  console.log(`DIAG_JSON ${JSON.stringify(diag)}`);
  await browser.close();
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
