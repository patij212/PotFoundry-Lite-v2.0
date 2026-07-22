// Production Export Truth audit — Pass 1: the 9 closed-and-wired styles, OFF vs ON,
// production dims (H120/OD140/bottom90/drain10) + registry defaults, on REAL WebGPU.
//
// Per style/state (one generateMesh): true-3D MAX fidelity (measureProjectorMax, MAX-first,
// outer wall vs exact rA, cliffs measured), full-mesh watertight (topologyMetric), the REAL
// validateMeshForExport download gate, tris, buildMs — via window.__pfFidelity.diagnoseExportTruth.
// Plus a flag-plumbing check (ON tris must differ from OFF for a wired emitter).
//
// Usage (dev server up): PF_BASE_URL=http://127.0.0.1:<port>/?fidelity=1 node e2e/_production_export_truth.cjs
//   PF_STYLES=HarmonicRipple  → smoke one style.   PF_RESUME=1 → keep prior non-error rows.
const fs = require('fs');
const { chromium } = require('@playwright/test');

const BASE = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const TARGET = Number(process.env.PF_TARGET || 2000000); // export budget for the OFF conforming path
const OUT = process.env.PF_OUT || 'e2e/baselines/production-export-truth-pass1.json';
const DIMS = { H: 120, top_od: 140, bottom_od: 90, r_drain: 10 };

// style -> ON flag map (every ON run also sets __pfConforming + __pfPerfectMesher). Cross-checked
// against src/renderers/webgpu/parametric/conforming/tierC/index.ts + regionLayerFlag.ts.
const ON_FLAGS = {
  HarmonicRipple: { __pfSmoothGrid: true },
  SuperellipseMorph: { __pfSmoothGrid: true },
  FourierBloom: { __pfSmoothGrid: true },
  SpiralRidges: { __pfSmoothGrid: true },
  SuperformulaBlossom: { __pfSmoothGrid: true },
  WaveInterference: { __pfSmoothGrid: true },
  LowPolyFacet: { __pfSmoothGrid: true }, // facet-aligned via FACET_GRID_ALIGN_NU
  DragonScales: { __pfRegionLayer: true, __pfDsConeFan: true },
  BambooSegments: { __pfBamboo: true },
};
const STYLES = (process.env.PF_STYLES || Object.keys(ON_FLAGS).join(',')).split(',');

const wt = (p, ms, label) => {
  let to;
  const t = new Promise((_, r) => { to = setTimeout(() => r(new Error(label + ' timeout ' + ms + 'ms')), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
};

const rows = [];
const save = () => fs.writeFileSync(OUT, JSON.stringify({ measuredAt: 'pass1', dims: DIMS, target: TARGET, rows }, null, 2));

async function runState(browser, style, state) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`  [pageerror ${style}/${state}] ${String(e).slice(0, 140)}`));
  if (state === 'on') {
    const flags = { __pfConforming: true, __pfPerfectMesher: true, ...ON_FLAGS[style] };
    await page.addInitScript((f) => { Object.assign(window, f); }, flags);
  } else {
    await page.addInitScript(() => { window.__pfConforming = true; });
  }
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await wt(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
  await wt(page.evaluate((s) => window.__pfFidelity.setStyle(s), style), 150000, 'setStyle');
  await wt(page.evaluate((d) => window.__pfFidelity.setDimensions(d), DIMS), 40000, 'setDims');
  const t0 = Date.now();
  // The projector-max fidelity scan can take many minutes on a multi-million-tri wall — budget generously.
  const r = await wt(page.evaluate((t) => window.__pfFidelity.diagnoseExportTruth({ targetTriangles: t }), TARGET), 1800000, 'exportTruth');
  const buildMs = Date.now() - t0;
  await page.close();
  return { ...r, buildMs, flagsApplied: state === 'on' ? { __pfPerfectMesher: true, ...ON_FLAGS[style] } : {} };
}

(async () => {
  let browser;
  try {
    // Same WebGPU-enabling flags the project's playwright.config uses (a real GPU adapter needs
    // Vulkan on Windows; --enable-unsafe-webgpu alone leaves navigator.gpu undefined).
    browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan,UseSkiaRenderer'] });
  } catch (e) {
    console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 200));
    process.exit(3);
  }
  // PF_RESUME: keep prior non-error rows.
  const done = new Set();
  if (process.env.PF_RESUME === '1' && fs.existsSync(OUT)) {
    for (const r of (JSON.parse(fs.readFileSync(OUT, 'utf8')).rows || [])) {
      if (!r.error) { rows.push(r); done.add(r.style + '|' + r.state); }
    }
    console.log('resuming: ' + rows.length + ' rows kept');
  }
  try {
    for (const style of STYLES) {
      for (const state of ['off', 'on']) {
        if (done.has(style + '|' + state)) continue;
        try {
          const row = await runState(browser, style, state);
          rows.push({ style, state, ...row });
          console.log(`${style}/${state}: maxMm=${row.maxMm} vertexMax=${row.vertexMaxMm} refTrusted=${row.referenceTrusted} boundary=${row.boundaryEdges} minAngle=${row.minAngleDeg} tris=${row.triangleCount} dl=${row.downloadOk} (${row.buildMs}ms)`);
        } catch (e) {
          rows.push({ style, state, error: String(e.message).slice(0, 200) });
          console.log(`${style}/${state}: ERROR ${String(e.message).slice(0, 140)}`);
        }
        save();
      }
      // Flag-plumbing check: ON must differ from OFF (tris/routing) for a wired emitter.
      const off = rows.find((r) => r.style === style && r.state === 'off' && !r.error);
      const on = rows.find((r) => r.style === style && r.state === 'on' && !r.error);
      if (off && on) {
        const wired = on.triangleCount !== off.triangleCount;
        console.log(`  plumbing ${style}: tris ${off.triangleCount} -> ${on.triangleCount} ${wired ? 'WIRED' : 'UNCHANGED(!)'}`);
      }
    }
  } finally {
    await browser.close();
    save();
    console.log('saved ' + rows.length + ' rows -> ' + OUT);
  }
})();
