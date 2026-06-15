// STAGE-2 PHASE-1b — efg-DP measurement. Toggles __pfConformingEfgDP (activates the
// max-min-angle Klincsek diagonal) and measures the reference-free min-angle
// (band-vs-bulk) + a chord regression sanity. Does the DP lift the bulk slivers?
//
// Usage: PF_STYLE=GyroidManifold PF_CHORD=1 node e2e/_fidelity_quality_efgdp_sweep.cjs
const { chromium } = require('@playwright/test');
const baseUrl = process.env.PF_BASE_URL || 'http://127.0.0.1:3000/?fidelity=1';
const STYLE = process.env.PF_STYLE || 'GyroidManifold';
// States: 'def' = production default (existing __pfConformingEfg ON -> DP active);
// 'efgoff' = __pfConformingEfg=false (turn the existing DP OFF, to confirm it helps).
const STATES = (process.env.PF_STATES || 'def,efgoff').split(',').map((s) => s.trim()).filter(Boolean);
const TARGET = Number(process.env.PF_TARGET_TRIS || 1000000);
const ANGLE_BAR = Number(process.env.PF_ANGLE_BAR || 20);
const CHORD = process.env.PF_CHORD === '1';
const DENSE_N = Number(process.env.PF_DENSE_N || 4);
const DIAG_TIMEOUT = Number(process.env.PF_DIAG_TIMEOUT || 600000);

function withTimeout(p, ms, label) {
  let to; const t = new Promise((_, rej) => { to = setTimeout(() => rej(new Error(`${label} timeout`)), ms); });
  return Promise.race([p, t]).finally(() => clearTimeout(to));
}

async function runState(browser, state) {
  const page = await browser.newPage();
  try {
    await page.addInitScript(([efgoff]) => {
      window.__pfConforming = true;
      window.__pfSurfaceFidelityExact = true;
      if (efgoff) window.__pfConformingEfg = false; // turn OFF the existing (default-on) max-min-angle DP
    }, [state === 'efgoff']);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await withTimeout(page.waitForFunction(() => window.__pfFidelity && window.__pfFidelity.isReady() === true, null, { timeout: 95000 }), 100000, 'ready');
    await withTimeout(page.evaluate((s) => window.__pfFidelity.setStyle(s), STYLE), 60000, 'setStyle');
    if (STYLE === 'SuperformulaBlossom') await withTimeout(page.evaluate((pp) => window.__pfFidelity.setStyleParams(pp), { sf_strength: 1 }), 60000, 'params');
    const q = await withTimeout(page.evaluate(([t, b]) => window.__pfFidelity.diagnoseCrestQuality({ targetTriangles: t, angleBarDeg: b }), [TARGET, ANGLE_BAR]), DIAG_TIMEOUT, 'qual');
    let c = null;
    if (CHORD) c = await withTimeout(page.evaluate(([t, d]) => window.__pfFidelity.diagnoseSurfaceFidelity({ targetTriangles: t, denseN: d, metric: 'perpendicular' }), [TARGET, DENSE_N]), DIAG_TIMEOUT, 'chord');
    return { q, c };
  } finally { await page.close(); }
}

(async () => {
  let browser;
  try { browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] }); }
  catch (e) { console.log('LAUNCH_FAILED: ' + String(e.message).slice(0, 160)); process.exit(0); }
  console.log(`=== efg-DP QUALITY SWEEP ${STYLE} (target=${TARGET}, bar=${ANGLE_BAR}deg) ===`);
  console.log('efgDP | worstMinAng | p1MinAng | %<bar  | bandedPct | bulkPct | tris    | chordP99');
  for (const st of STATES) {
    let r = null, err = null;
    try { r = await runState(browser, st); } catch (e) { err = String(e.message).slice(0, 60); }
    if (err || !r || !r.q) { console.log(`${st.padStart(5)} | ERROR ${err || 'null'}`); continue; }
    const q = r.q, c = r.c;
    console.log(`${st.padStart(5)} | ${(q.worstMinAngleDeg).toFixed(2).padStart(10)} | ${(q.p1MinAngleDeg).toFixed(0).padStart(7)} | ${(q.pctBelow15).toFixed(2).padStart(5)}% | ${(q.bandPctBelow15).toFixed(2).padStart(8)}% | ${(q.nonBandPctBelow15).toFixed(2).padStart(6)}% | ${String(q.triangleCount).padStart(7)} | ${c ? c.p99DevMm.toFixed(4) : '-'}`);
  }
  await browser.close();
})();
