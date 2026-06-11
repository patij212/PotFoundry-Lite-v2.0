// Budget-honesty acceptance probe (decimator-fix measurement gate).
//
// Per style x budget: ONE diagnoseBudget call = ONE build; the budget verdict,
// topology, triangle quality and featDrop all describe the SAME delivered mesh
// (the old 3-call pattern measured meshes that were only same-by-assumption).
//
// GATE per row (delivered mesh):
//   sliver=0 AND maxAspect3D<100 AND bnd=0 AND orient=0 AND
//   (nonMan=0 OR style==='Voronoi' && nonMan<=2  // pre-existing carve-out,
//    tracked separately and coherent with the decimator's delta gate)
//   AND featDrop===0, AND exactly one of:
//     (a) deliveredTriangles <= budget with decimation in {not-needed, applied}
//         and (if applied) decimationErrorMm within the seed-to-ceiling bound, or
//     (b) decimation==='refused' with delivered===built and a non-empty reason.
//   "met-safely OR refused-honestly — never a slivered/silent middle."
//
// PRE-REGISTERED de-vacuation rows (the gate FAILS — does not silently pass —
// if violated): at the Draft floor 499,998, ArtDeco (natural 574,620, -13%)
// and DragonScales (840,890, -41%) must read decimation==='applied' with the
// row gate clean. A refusal there means the budget feature is dead at Draft
// and escalates a named decision (vertex_lock / meshopt 1.1.x / accept a
// refusal-dominant Draft tier) to the controller.
//
// Usage:
//   PF_BASE_URL=http://127.0.0.1:3002/?fidelity=1 \
//   PF_STYLES=ArtDeco,DragonScales,SpiralRidges PF_BUDGETS=400000,499998 \
//   PF_OUT=C:/tmp/budget_probe_chunk.json node e2e/_conforming_budget_probe.cjs
const fs = require('fs');
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3002/?fidelity=1';
const OUT = process.env.PF_OUT || 'e2e/baselines/budget-honesty-2026-06.json';
const PER_OP_MS = Number(process.env.PF_PER_OP_MS || 400000);
const styles = (process.env.PF_STYLES || [
  // Minimum trio first (pre-registered acceptance rows), then the rest.
  'ArtDeco', 'DragonScales', 'SpiralRidges',
  'SuperformulaBlossom', 'SuperellipseMorph', 'LowPolyFacet', 'Crystalline',
  'BambooSegments', 'RippleInterference', 'WaveInterference', 'HarmonicRipple',
  'GeometricStar', 'BasketWeave', 'GyroidManifold', 'GothicArches',
  'FourierBloom', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'Voronoi',
].join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const budgets = (process.env.PF_BUDGETS || '400000,499998')
  .split(',').map((b) => Number(b.trim())).filter((b) => b > 0);
// Authoritative explicit default dims (mirrors _conforming_dimspace_probe.cjs /
// stage0-residuals.md: sliver counts are dims-sensitive, the explicit config rules).
const DIMS = { H: 120, top_od: 140, bottom_od: 90, r_drain: 10 };

function withTimeout(p, ms, label) {
  let to;
  const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

function gateRow(style, target, row) {
  const v = [];
  const q = row.quality; const topo = row.topo; const b = row.budget;
  if (q.sliverCount !== 0) v.push(`sliver=${q.sliverCount}`);
  if (!(q.maxAspect3D < 100)) v.push(`maxAspect=${q.maxAspect3D}`);
  if (topo.boundaryEdges !== 0) v.push(`bnd=${topo.boundaryEdges}`);
  if (topo.orientationMismatches !== 0) v.push(`orient=${topo.orientationMismatches}`);
  const nmOk = topo.nonManifoldEdges === 0 || (style === 'Voronoi' && topo.nonManifoldEdges <= 2);
  if (!nmOk) v.push(`nonMan=${topo.nonManifoldEdges}`);
  if (row.featDrop !== 0) v.push(`featDrop=${row.featDrop}`);
  const metSafely = b.deliveredTriangles <= target
    && (b.decimation === 'applied' || b.decimation === 'not-needed')
    && (b.decimation !== 'applied' || b.decimationErrorMm <= b.effectiveMaxSagMm + 0.2);
  const refusedHonestly = b.decimation === 'refused'
    && b.deliveredTriangles === b.builtTriangles
    && typeof b.refusalReason === 'string' && b.refusalReason.length > 0;
  if (!(metSafely || refusedHonestly)) v.push('neither met-safely nor refused-honestly');
  return v;
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  let anyFail = false;
  const rows = [];
  // meshoptimizer's exports map blocks `require('meshoptimizer/package.json')`;
  // read the installed manifest directly (the version is recorded inside the
  // committed baseline so a behaviour-changing bump is detectable, never silent).
  const meshoptimizerVersion = JSON.parse(fs.readFileSync(
    require('path').join(require('path').dirname(require.resolve('meshoptimizer')), 'package.json'), 'utf8',
  )).version;
  const save = () => fs.writeFileSync(OUT, JSON.stringify({
    measuredAt: '2026-06', dims: DIMS, meshoptimizerVersion, rows,
  }, null, 2));
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; });
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
    await page.waitForFunction(() => window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    for (const style of styles) {
      await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 60000, `${style} setStyle`);
      await withTimeout(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIMS), 30000, `${style} setDims`);
      // Deep-refusal exercise rows on the two pre-registered styles.
      const styleBudgets = (style === 'ArtDeco' || style === 'DragonScales') && !process.env.PF_BUDGETS
        ? [...budgets, 100000]
        : budgets;
      for (const target of styleBudgets) {
        const t0 = Date.now();
        try {
          const row = await withTimeout(
            page.evaluate((t) => window.__pfFidelity.diagnoseBudget({ targetTriangles: t }), target),
            PER_OP_MS, `${style}@${target} diagnoseBudget`,
          );
          if (!row) throw new Error('conforming branch did not run (diagnoseBudget=null)');
          const violations = gateRow(style, target, row);
          // Pre-registered de-vacuation teeth: applied REQUIRED at the Draft floor.
          if (target === 499998 && (style === 'ArtDeco' || style === 'DragonScales')
              && row.budget.decimation !== 'applied') {
            violations.push(`PRE-REGISTERED: expected applied at Draft floor, got ${row.budget.decimation}`);
          }
          const pass = violations.length === 0;
          if (!pass) anyFail = true;
          rows.push({ style, target, pass, violations, elapsedS: (Date.now() - t0) / 1000, ...row });
          const b = row.budget;
          console.log(
            `${style.padEnd(20)} @${String(target).padStart(6)} dec=${b.decimation.padEnd(10)} ` +
            `built=${String(b.builtTriangles).padStart(7)} delivered=${String(b.deliveredTriangles).padStart(7)} ` +
            `errMm=${b.decimationErrorMm !== undefined ? b.decimationErrorMm.toFixed(4) : 'n/a   '} ` +
            `capScale=${b.capScale.toFixed(2)} capSat=${b.capSaturated} ` +
            `sliver=${row.quality.sliverCount} maxAsp=${row.quality.maxAspect3D.toFixed(1)} ` +
            `bnd=${row.topo.boundaryEdges} nm=${row.topo.nonManifoldEdges} or=${row.topo.orientationMismatches} ` +
            `featDrop=${row.featDrop} -> ${pass ? 'PASS' : 'FAIL ' + violations.join('; ')} ` +
            `(${((Date.now() - t0) / 1000).toFixed(0)}s)`,
          );
        } catch (e) {
          anyFail = true;
          rows.push({ style, target, pass: false, violations: [String(e && e.message ? e.message : e).slice(0, 160)], elapsedS: (Date.now() - t0) / 1000 });
          console.log(`${style.padEnd(20)} @${String(target).padStart(6)} ERROR ${(e && e.message ? e.message : String(e)).slice(0, 100)} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
        save();
      }
    }
  } finally { await browser.close(); }
  save();
  console.log(anyFail ? 'GATE: FAIL' : 'GATE: PASS');
  process.exit(anyFail ? 1 : 0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
