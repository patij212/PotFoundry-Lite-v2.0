// THE authoritative conforming baseline: 20 styles x 5 dim-sets + adversarial
// style params, production opts (auto uBias — no overrides), real WebGPU.
// Per cell: topo + quality + crest + features + serration(decoupled ref) + cdt
// health + seam bands + provenance attribution + hash + buildMs. 60-120 min.
// Dim configs mirror e2e/_conforming_dimspace_probe.cjs exactly (comparability
// with the historical dimspace logs).
const fs = require('fs');
const { chromium } = require('@playwright/test');
const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3001/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 400000);
const OUT = process.env.PF_OUT || 'e2e/baselines/authoritative-2026-06.json';
const STYLES = (process.env.PF_STYLES || [
  'SuperformulaBlossom', 'SuperellipseMorph', 'LowPolyFacet', 'ArtDeco', 'Crystalline',
  'BambooSegments', 'RippleInterference', 'WaveInterference', 'HarmonicRipple', 'GeometricStar',
  'BasketWeave', 'GyroidManifold', 'GothicArches', 'DragonScales', 'SpiralRidges',
  'FourierBloom', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'Voronoi',
].join(',')).split(',');
const DIMS = {
  default:    { H: 120, top_od: 140, bottom_od: 90, r_drain: 10 },
  shortWide:  { H: 40, top_od: 300, bottom_od: 280, r_drain: 20 },
  tallNarrow: { H: 480, top_od: 40, bottom_od: 36, r_drain: 6 },
  highFlare:  { H: 200, top_od: 320, bottom_od: 44, r_drain: 8, expn: 3.5 },
  noDrain:    { H: 120, top_od: 140, bottom_od: 90, r_drain: 0 },
};
// Adversarial style-param rows (default dims): the high-strength regimes.
const PARAM_CASES = [
  { tag: 'SFB_s1', style: 'SuperformulaBlossom', params: { sf_strength: 1 } },
];
const wt = (p, ms, l) => { let to; const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(l + ' timeout')), ms); }); return Promise.race([p, t]).finally(() => clearTimeout(to)); };
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] });
  const rows = [];
  const save = () => fs.writeFileSync(OUT, JSON.stringify({ measuredAt: '2026-06', opts: 'production (auto uBias)', target: TARGET, dims: DIMS, rows }, null, 2));
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => { window.__pfConforming = true; window.__pfReferenceDenseRes = 1024; });
    const boot = async () => {
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await page.waitForFunction(() => typeof window.__pfFidelity !== 'undefined', null, { timeout: 90000 });
      await page.waitForFunction(() => window.__pfFidelity.isReady && window.__pfFidelity.isReady() === true, null, { timeout: 90000 });
    };
    await boot();
    // PF_RESUME=1: skip (tag,dim) cells already measured WITHOUT error in OUT.
    const done = new Set();
    if (process.env.PF_RESUME === '1' && fs.existsSync(OUT)) {
      const prev = JSON.parse(fs.readFileSync(OUT, 'utf8'));
      for (const r of prev.rows || []) if (!r.error) { rows.push(r); done.add(r.tag + '|' + r.dim); }
      console.log('resuming: ' + rows.length + ' rows kept');
    }
    const measure = async (tag, style, dimName, dims, params) => {
      if (done.has(tag + '|' + dimName)) return;
      const t0 = Date.now();
      try {
        // Generous timeout: a style switch after a pathological build (ArtDeco
        // short-wide ~435s) can stall behind pending GPU work.
        await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 150000, 'setStyle');
        if (dims) await wt(page.evaluate((d) => window.__pfFidelity.setDimensions(d), dims), 30000, 'setDims');
        if (params) await wt(page.evaluate((p) => window.__pfFidelity.setStyleParams(p), params), 30000, 'setParams');
        const tq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseTopoQuality({ targetTriangles: t }), TARGET), 260000, 'tq');
        const cq = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: 15 }), TARGET), 260000, 'cq').catch(() => null);
        const feat = await wt(page.evaluate(() => window.__pfFidelity.diagnoseFeatures()), 120000, 'feat').catch(() => null);
        const serr = dimName === 'default'
          ? await wt(page.evaluate(() => window.__pfFidelity.diagnoseSerration()), 260000, 'serr').catch(() => null) : null;
        const cdt = await wt(page.evaluate(() => window.__pfFidelity.diagnoseCdtHealth()), 60000, 'cdt').catch(() => null);
        const seam = await wt(page.evaluate(() => window.__pfFidelity.diagnoseSeamBands()), 60000, 'seam').catch(() => null);
        const attr = await wt(page.evaluate(() => window.__pfFidelity.diagnoseSliverAttribution()), 60000, 'attr').catch(() => null);
        const ceil = style === 'SpiralRidges'
          ? await wt(page.evaluate(() => window.__pfFidelity.diagnoseCellCeiling()), 120000, 'ceil').catch(() => null) : null;
        const hash = dimName === 'default'
          ? await wt(page.evaluate((t) => window.__pfFidelity._debugMeshHash(t), TARGET), 120000, 'hash').catch(() => null) : null;
        rows.push({
          tag, dim: dimName, buildMs: Date.now() - t0,
          sliver: tq.sliverCount, bnd: tq.boundaryEdges, nonMan: tq.nonManifoldEdges,
          orient: tq.orientationMismatches, maxAspect: Math.round(tq.maxAspect3D), tris: tq.triangleCount,
          bandPctBelow15: cq && cq.bandPctBelow15, wallPctBelow15: cq && cq.pctBelow15, worst: cq && cq.worstMinAngleDeg,
          featDrop: feat ? feat.dropped : null, crestBandRmsMm: serr && serr.crestBandRmsMm,
          serrationScore: serr && serr.serrationScore,
          inversions: cdt && cdt.inversions, drops: cdt && cdt.drops,
          seam: seam && { seamPct: seam.seam.pctBelow15, bulkPct: seam.bulk.pctBelow15, capB: seam.capBottom.pctBelow15, capT: seam.capTop.pctBelow15, seamTris: seam.seam.triangles },
          attribution: attr && attr.byTag, ceiling: ceil,
          vertexHash: hash && hash.vertexHash, indexHash: hash && hash.indexHash,
        });
      } catch (e) {
        rows.push({ tag, dim: dimName, buildMs: Date.now() - t0, error: String(e.message || e).slice(0, 140) });
        // A wedged page (pathological build leaving pending GPU work) poisons
        // every later cell — recover with a fresh page load before continuing.
        try { await boot(); console.log('recovered: page reloaded'); }
        catch (e2) { console.log('recovery failed: ' + String(e2.message || e2).slice(0, 100)); }
      }
      console.log(JSON.stringify(rows[rows.length - 1]));
      save();
    };
    for (const style of STYLES) {
      for (const [dimName, dims] of Object.entries(DIMS)) await measure(style, style, dimName, dims, null);
      await wt(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIMS.default), 30000, 'resetDims').catch(async () => { await boot(); });
    }
    for (const pc of PARAM_CASES) await measure(pc.tag, pc.style, 'default+params', DIMS.default, pc.params);
  } finally { await browser.close(); }
  process.exit(0);
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
