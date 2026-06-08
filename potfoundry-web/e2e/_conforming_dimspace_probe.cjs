// Dimension-space robustness sweep for the conforming mesher: for each style,
// measure whole-mesh topology (orient/bnd/nonMan/sliver) at EXTREME pot
// dimensions (tall/narrow, short/wide, no-drain, high-flare, twisted). The
// default harness only tests H120/top140/bottom90 — this is the cutover
// prerequisite (find any dimension-dependent topology/sliver break before flip).
//
// Usage: PF_STYLES=HexagonalHive,GyroidManifold node e2e/_conforming_dimspace_probe.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const targetTriangles = Number(process.env.PF_TARGET_TRIANGLES || 500000);
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 180000);
const styles = (process.env.PF_STYLES ||
  'HexagonalHive,GyroidManifold,CelticKnot,GothicArches,DragonScales,SpiralRidges,SuperformulaBlossom')
  .split(',').map((s) => s.trim()).filter(Boolean);

// Extreme dimension configurations (patched over the defaults).
const DIMS = [
  { name: 'tall-narrow', d: { H: 480, top_od: 40, bottom_od: 36, r_drain: 6 } },
  { name: 'short-wide', d: { H: 40, top_od: 300, bottom_od: 280, r_drain: 20 } },
  { name: 'no-drain', d: { H: 120, top_od: 140, bottom_od: 90, r_drain: 0 } },
  { name: 'high-flare', d: { H: 200, top_od: 320, bottom_od: 44, r_drain: 8, expn: 3.5 } },
  { name: 'twisted', d: { H: 160, top_od: 130, bottom_od: 90, r_drain: 10, spinTurns: 2.5 } },
];

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  let anyFail = false;
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const s of styles) {
      await withTimeout(page.evaluate((x) => window.__pfFidelity.setStyle(x), s), 60000, `${s} setStyle`);
      for (const cfg of DIMS) {
        const t0 = Date.now();
        try {
          await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), cfg.d), 30000, `${s}/${cfg.name} setDims`);
          const r = await withTimeout(
            page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), targetTriangles),
            PER_OP_MS, `${s}/${cfg.name} probe`,
          );
          const ok = r.orientationMismatches === 0 && r.boundaryEdges === 0 && r.nonManifoldEdges === 0 && r.sliverCount === 0;
          if (!ok) anyFail = true;
          console.log(
            `${s.padEnd(20)} ${cfg.name.padEnd(11)} orient=${r.orientationMismatches} bnd=${r.boundaryEdges} ` +
            `nonMan=${r.nonManifoldEdges} sliver=${r.sliverCount} maxAspect=${r.maxAspect3D.toFixed(1)} ` +
            `tris=${r.triangleCount} -> ${ok ? 'PASS' : 'FAIL'} (${((Date.now() - t0) / 1000).toFixed(0)}s)`,
          );
        } catch (e) {
          anyFail = true;
          console.log(`${s.padEnd(20)} ${cfg.name.padEnd(11)} ERROR ${(e && e.message ? e.message : String(e)).slice(0, 70)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
      }
    }
  } finally { await browser.close(); }
  process.exit(anyFail ? 1 : 0);
})().catch((e) => { console.error(String(e).slice(0, 200)); process.exit(1); });
