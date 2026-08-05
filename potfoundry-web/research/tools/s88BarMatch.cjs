// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// S88b — IS "ORIENTATION IS THE LARGER DEFECT BY 410x IN AREA" A DEFECT RATIO, OR A BAR RATIO?
// READ-ONLY post-processing of S87's per-facet checkpoints. No mesh, no rA, no certificate.
//
//     node research/tools/s88BarMatch.cjs
//
// ── PRE-REGISTERED, WRITTEN BEFORE THE RUN ──────────────────────────────────────────────────────────
//
// WHAT PROVOKED IT.  The s88ReviewProbe 2x2 returned `posFail & orientationOK = 0` on FIVE independent
// meshes — 587/587, 751/751, 23/23, 1775/1775, 814/814. Honest position failure is a strict SUBSET of
// orientation over-bar. Under independence that is 0.62^587 ~ 1e-122, so it is structural.
//
// THE MECHANISM THAT WOULD EXPLAIN IT.  For a facet of diameter d on a patch of normal curvature kappa,
// the chord sagitta is  s = d^2*kappa/8  and the normal turns by  theta = d*kappa, so the orientation
// chord  2*sin(theta/2)*d ~ theta*d = d^2*kappa = 8s.  *** IF THAT HOLDS, THE ORIENTATION CHORD AT A
// 10 um BAR IS AN ~8x STRICTER BAR THAN THE POSITION RULER AT 10 um, ON THE SAME FACET, IN THE SAME
// UNITS — and "orientation is the larger defect by 410x in AREA" is then partly a statement about the
// two BARS, not about two defects. ***
//
// H-R2d.  The 410x area gap is substantially a BAR-CALIBRATION artefact.
//   MEASURE: per facet, the ratio  o2 / w  (orientation chord / honest witnessed position), on the
//   facets where both are meaningful. Then re-read the orientation over-bar AREA at a BAR-MATCHED
//   threshold  10 um * median(o2/w)  and compare THAT to the position over-bar area at 10 um.
//   KILL (the 410x is real, not a bar artefact): the bar-matched orientation/position area ratio stays
//        above 100x.
//   CONFIRM (it is substantially a bar artefact): the ratio falls below 30x.
//   Between 30x and 100x -> "partly", and quote the number, not the word.
//
// TWO-SIDED CONTROL, so a degenerate answer cannot pass: the SAME calculation is run at the RAW 10 um
// orientation bar, where it MUST reproduce the published 410x-class gap (S87: 43.08% orientation area
// vs 0.105% position area on _S24i2 = 409x). If it does not reproduce that, the recalibration below is
// measuring my arithmetic and not the mesh.
//
// STATED: the ratio o2/w is NOT a theorem, it is a measurement on this mesh family. `w` is a WITNESSED
// LOWER bound (certifyTriangle stops once it has a witness over tol), so on FAILING facets o2/w is an
// UPPER bound on the true ratio and the recalibration is CONSERVATIVE in the direction that keeps
// orientation looking large. Said before the number is read.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const DIR = path.join(__dirname, '..', 'exchange', '_strataConformBisect', 's87ledger');
const out = []; const log = (s) => { out.push(s); console.log(s); };

function load(tag) {
  const f = path.join(DIR, `${tag}.pos.ndjson`);
  if (!fs.existsSync(f)) return null;
  return fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l));
}
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };

log('════════════════════════════════════════════════════════════════════════════════════════════════');
log('S88b — BAR-MATCHED ORIENTATION vs POSITION.  H-R2d, pre-registered in the file header.');
log('════════════════════════════════════════════════════════════════════════════════════════════════');

for (const tag of ['S24i2', 'C2S39CTL', 'S9A', 'S28i1', 's88S10B']) {
  const rows = load(tag); if (!rows) continue;
  const n = rows.length;
  const areaAll = rows.reduce((a, r) => a + r.area, 0);

  // ── the per-facet ratio, on facets whose position error is above the f32/ruler floor ──────────────
  const rat = rows.filter((r) => r.w > 0.05).map((r) => r.o2 / r.w);
  const ratFail = rows.filter((r) => r.v === 1).map((r) => r.o2 / r.w);
  log(`\n──── ${tag}  n=${n} ────`);
  log(`  o2/w over all facets with w > 0.05 um  (n=${rat.length}):  p10 ${q(rat, 0.10).toFixed(2)}  p50 ${q(rat, 0.50).toFixed(2)}  p90 ${q(rat, 0.90).toFixed(2)}  p99 ${q(rat, 0.99).toFixed(2)}`);
  if (ratFail.length) log(`  o2/w on the PROVEN-FAIL facets only    (n=${ratFail.length}):  p10 ${q(ratFail, 0.10).toFixed(2)}  p50 ${q(ratFail, 0.50).toFixed(2)}  p90 ${q(ratFail, 0.90).toFixed(2)}`);

  // ── the two-sided control: reproduce the published gap at the RAW bar ─────────────────────────────
  const posArea = rows.filter((r) => r.v === 1).reduce((a, r) => a + r.area, 0) / areaAll;
  const oArea = (bar) => rows.filter((r) => r.o2 > bar).reduce((a, r) => a + r.area, 0) / areaAll;
  const oCount = (bar) => rows.filter((r) => r.o2 > bar).length / n;
  const posCount = rows.filter((r) => r.v === 1).length / n;
  log(`  CONTROL, RAW 10 um bar on both:  orientation AREA ${(100 * oArea(10)).toFixed(4)}%  /  position AREA ${(100 * posArea).toFixed(6)}%  =  ${(oArea(10) / Math.max(1e-12, posArea)).toFixed(0)}x`
    + `   (S87 published 409x on S24i2 — must reproduce)`);

  // ── the bar-matched reading ───────────────────────────────────────────────────────────────────────
  const k = q(rat, 0.50);
  const matched = 10 * k;
  log(`  BAR-MATCHED: orientation bar set to 10 um x median(o2/w) = ${matched.toFixed(1)} um`);
  log(`     orientation over-bar AREA  ${(100 * oArea(matched)).toFixed(4)}%   COUNT ${(100 * oCount(matched)).toFixed(3)}%`);
  log(`     position    over-bar AREA  ${(100 * posArea).toFixed(6)}%   COUNT ${(100 * posCount).toFixed(3)}%`);
  log(`     *** BAR-MATCHED AREA RATIO = ${(oArea(matched) / Math.max(1e-12, posArea)).toFixed(1)}x   (raw-bar ratio was ${(oArea(10) / Math.max(1e-12, posArea)).toFixed(0)}x) ***`);

  // ── and the bar at which the two defects have EQUAL over-bar AREA, found by bisection ─────────────
  let lo = 10, hi = 100000;
  for (let i = 0; i < 60; i++) { const m = 0.5 * (lo + hi); if (oArea(m) > posArea) lo = m; else hi = m; }
  log(`     the orientation bar at which the two over-bar AREAS are EQUAL: ${(0.5 * (lo + hi)).toFixed(1)} um  = ${(0.05 * (lo + hi)).toFixed(1)}x the position bar`);

  // ── containment, restated at the matched bar ──────────────────────────────────────────────────────
  let a = 0, b = 0;
  for (const r of rows) { if (r.v === 1) { if (r.o2 > matched) a++; else b++; } }
  log(`     containment at the MATCHED bar: posFail & oriOver ${a}   posFail & oriOK ${b}   (at the raw bar it was ${rows.filter((r) => r.v === 1 && r.o2 > 10).length} / ${rows.filter((r) => r.v === 1 && r.o2 <= 10).length})`);
}

log('\nNOT MEASURED: whether o2/w ~ 8 is a THEOREM. It is a measurement on GothicArches-ring only.');
log('NOT MEASURED: the same ratio on Voronoi / LowPolyFacet — no pos.ndjson exists for either.');
fs.writeFileSync(path.join(__dirname, '..', 'exchange', '_strataConformBisect', 's88BarMatch.report.txt'), out.join('\n') + '\n');
log('\nreport written to research/exchange/_strataConformBisect/s88BarMatch.report.txt');
