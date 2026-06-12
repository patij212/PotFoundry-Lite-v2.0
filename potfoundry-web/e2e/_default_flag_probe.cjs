// Default-flag verification probe (permanent — re-run after any flag-routing change).
//
// Verifies the 2026-06-11 DEFAULT FLIP: loads the app with NO overrides —
// crucially WITHOUT window.__pfConforming (that hatch forces conforming and
// would mask the default) — and runs __pfFidelity.diagnoseTopoQuality, which
// resolves flags via resolveFeatureFlags(undefined), i.e. the exact production
// default path. If the default now routes to the conforming mesher, the
// numbers must show the conforming signature (sliver=orient=bnd=nonMan=0);
// the legacy battery shows hundreds-to-thousands of orientation mismatches
// on these styles. Console lines mentioning the conforming/battery branch are
// captured as direct code-path evidence.
//
// Usage: node e2e/_default_flag_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3002/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 400000);
const styles = (process.env.PF_STYLES || 'Voronoi,DragonScales').split(',').map((s) => s.trim()).filter(Boolean);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 300000);

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  // NO --enable-features=Vulkan (forces a slow Dawn compile → shader timeouts).
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  try {
    for (const s of styles) {
      const t0 = Date.now();
      let page;
      const pathEvidence = [];
      try {
        page = await browser.newPage();
        // NO addInitScript: the whole point is to exercise the bare default.
        page.on('console', (msg) => {
          const text = msg.text();
          if (/conforming|battery|by-construction/i.test(text)) pathEvidence.push(text.slice(0, 160));
        });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
        await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
        await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
        const hatch = await page.evaluate(() => ({
          conforming: typeof window.__pfConforming,
          byConstruction: typeof window.__pfByConstruction,
        }));
        if (hatch.conforming !== 'undefined' || hatch.byConstruction !== 'undefined') {
          console.log(`${s}: ABORT — an override hatch is set (${JSON.stringify(hatch)}); probe would not measure the default`);
          continue;
        }
        await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
        const r = await withTimeout(
          page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles),
          PER_OP_MS, `${s} diagnoseTopoQuality`,
        );
        console.log(
          `${s}: sliver=${r.sliverCount} orient=${r.orientationMismatches} bnd=${r.boundaryEdges} ` +
          `nonMan=${r.nonManifoldEdges} minAngle=${r.minAngleDeg.toFixed(2)} maxAspect=${r.maxAspect3D.toFixed(1)} ` +
          `tris=${r.triangleCount} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
        );
        for (const line of pathEvidence.slice(0, 6)) console.log(`  [console] ${line}`);
      } catch (e) {
        console.log(`${s}: ERROR ${(e && e.message ? e.message : String(e)).slice(0, 120)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        for (const line of pathEvidence.slice(0, 6)) console.log(`  [console] ${line}`);
      } finally { if (page) { try { await page.close(); } catch { /* */ } } }
    }
  } finally { await browser.close(); }
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
