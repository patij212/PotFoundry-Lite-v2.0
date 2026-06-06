// Resilient scorecard: a FRESH PAGE per style (closed after) so a slow/hung style cannot
// poison the rest — page.evaluate timeouts don't cancel in-page work, but closing the page
// destroys its context. Measures topology (orient/bnd/nonMan) + quality (sliver). Set
// PF_BYCONSTRUCTION=1 to exercise the by-construction path.
const { chromium } = require('@playwright/test');

const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 300000);
const byCon = process.env.PF_BYCONSTRUCTION === '1';
const only = (process.env.PF_STYLES || '').split(',').map((s) => s.trim()).filter(Boolean);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function freshPage(browser) {
  const page = await browser.newPage();
  if (byCon) await page.addInitScript(() => { window.__pfByConstruction = true; });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
  await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
  return page;
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  try {
    let styles;
    { const p = await freshPage(browser); styles = await p.evaluate(() => window.__pfFidelity.listStyles()); await p.close(); }
    if (only.length) styles = styles.filter((s) => only.includes(s));
    console.log(`SCORECARD styles=${styles.length} byCon=${byCon}`);
    let pass = 0;
    for (const s of styles) {
      const t0 = Date.now();
      let page;
      try {
        page = await freshPage(browser);
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        const topo = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseTopology({ targetTriangles: t, sampleLimit: 0 }), targetTriangles), PER_OP_MS, `${s} topo`);
        const qual = await withTimeout(page.evaluate((t) => window.__pfFidelity.diagnoseQuality({ targetTriangles: t, sampleLimit: 0 }), targetTriangles), PER_OP_MS, `${s} qual`);
        const ok = topo.orientationMismatches === 0 && topo.boundaryEdges === 0 && topo.nonManifoldEdges === 0 && qual.sliverCount === 0;
        if (ok) pass++;
        console.log(`ROW ${s} orient=${topo.orientationMismatches} bnd=${topo.boundaryEdges} nonMan=${topo.nonManifoldEdges} sliver=${qual.sliverCount} maxAspect=${qual.maxAspect3D.toFixed(0)} tris=${topo.triangleCount} ${ok ? 'PASS' : 'FAIL'} ms=${Date.now() - t0}`);
      } catch (e) {
        console.log(`ROW ${s} ERROR ${(e && e.message ? e.message : String(e)).slice(0, 80)} ms=${Date.now() - t0}`);
      } finally {
        if (page) { try { await page.close(); } catch { /* noop */ } }
      }
    }
    console.log(`SCORECARD done pass=${pass}/${styles.length}`);
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
