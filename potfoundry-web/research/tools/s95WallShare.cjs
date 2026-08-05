#!/usr/bin/env node
/* eslint-disable no-console */
// s95WallShare.cjs — W1: HOW MUCH OF VORONOI'S ORIENTATION DEFECT IS *NEAR-VERTICAL WALL*?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CHEAPEST DISCRIMINATOR FIRST. S93's `frontierTaxonomy.ts` already dumped a 60,000-facet per-facet
// NDJSON for Voronoi, GothicArches and LowPolyFacet with EXACTLY the fields W1 needs:
//     ar area  dm diam  ma minAngle  nd normDeg(covering k=8 sup)  tu tangUm(= chord = the bar's
//     currency)  clb/cub coneLB/UB  sp spread  kk kink  st = r_theta/r  sz = r_z  ...
// So W1 costs ZERO rA evals and zero re-runs. Earn the mesher arm with a census — this IS the census.
//
// ── THE GEOMETRIC DEFINITION OF "NEAR-VERTICAL WALL" (not by eye) ─────────────────────────────────
// For a radial graph r = R(theta, z), X(th,z) = (R cos th, R sin th, z). In the orthonormal frame
// (rhat, thhat, zhat):   X_th = (R_th, R, 0),  X_z = (R_z, 0, 1),  so
//     n  proportional to  (R, -R_th, -R*R_z)  ==  R * (1, -R_th/R, -R_z)
//     => cos(angle(n, rhat)) = 1 / sqrt(1 + (R_th/R)^2 + R_z^2)
//     => *** BETA := angle(surface normal, radial direction) = atan( hypot(R_th/R, R_z) ) = atan(slope)
// beta = 0  : the surface is a pure radial-graph "floor" -- the chart is nearly an isometry.
// beta -> 90: the surface is a WALL parallel to the radial direction -- rhat lies IN the tangent plane
//             and the chart is nearly singular (a small d(theta) is a large dr).
// This is exactly S93's `slope`, restated as an ANGLE so the thresholds mean something:
//     slope 0.577 = 30deg | 1.000 = 45deg | 1.732 = 60deg | 3.00 = 71.6deg | 5.67 = 80deg | 11.4 = 85deg
//
// ── PRE-REGISTERED HYPOTHESIS AND KILL-CRITERION (written before the first run) ────────────────────
// H-W1: Voronoi's over-bar ORIENTATION defect AREA is dominated by the near-vertical-wall class.
//   *** KILL: if facets with beta >= 60deg hold < 40% of Voronoi's over-bar CHORD area, H-W1 is
//   REFUTED and near-vertical wall is NOT the missing ~88%. (Threshold mirrors S93's own H-C line.) ***
// H-W1b (the control): the same class holds < 20% of GOTHIC's over-bar chord area -- if Gothic is
//   equally near-vertical the covariate is not discriminating and means nothing.
// Reported in BOTH currencies (chord `tu` > 10um AND angle `nd` > 1.0deg), COUNT *and* AREA, with the
// population share and the ENRICHMENT on every row -- a class holding 33% of the defect while covering
// 33% of the mesh explains NOTHING.
//
// ⚠ THE KNOWN WEAKNESS OF THIS PASS, STATED UP FRONT: `st`/`sz` in that NDJSON are evaluated at ONE
// point (the mean-vertex parameter point) -- a CENTROID SAMPLE, the exact shape of five instrument
// defects in this project. This pass is therefore a SCREEN. `s95WallCensus.ts` recomputes beta as a
// COVERING quantity (sup + area-weighted mean over the same k=8 lattice, zero extra rA evals because
// the lattice normals are already there) and the two are compared before any share is quoted.
//
// Usage: node research/tools/s95WallShare.cjs
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('node:fs');
const path = require('node:path');

const DIR = 'research/exchange/_strataConformBisect/frontier';
const SETS = [
  { tag: 'VORONOI', file: 'FR_TAX_VORONOI.ndjson', note: 'voronoi_ring_D--.stl  806,765 tris  SHAPE-off (the WORSE of the two on disk, per 060f3cd9)' },
  { tag: 'S39CTL', file: 'FR_TAX_S39CTL.ndjson', note: 'gothicarches_ring_DS-HT_S39CTL.stl  1,142,166 tris  (the SMOOTH-RELIEF control)' },
  { tag: 'LOWPOLY', file: 'FR_TAX_LOWPOLY.ndjson', note: 'lowpolyfacet  137,480 tris  (the REVERSE control -- 0.108% over-bar area)' },
];
const BAR_UM = 10;
const ANG_BAR = 1.0;

function load(f) {
  const txt = fs.readFileSync(path.join(DIR, f), 'utf8');
  const out = [];
  for (const ln of txt.split('\n')) {
    if (ln.length < 3) continue;
    out.push(JSON.parse(ln));
  }
  return out;
}

const D = (r) => (r * 180) / Math.PI;
const beta = (o) => D(Math.atan(Math.hypot(o.st, o.sz)));      // deg, normal-vs-radial
const betaTh = (o) => D(Math.atan(Math.abs(o.st)));            // the AZIMUTHAL (cell-wall) component
const betaZ = (o) => D(Math.atan(Math.abs(o.sz)));             // the AXIAL (z-step / tread) component

function areaWtQ(rows, val, ps) {
  const arr = rows.map((o) => [val(o), o.ar]).filter((x) => Number.isFinite(x[0]));
  arr.sort((a, b) => a[0] - b[0]);
  const tot = arr.reduce((s, x) => s + x[1], 0);
  const out = []; let i = 0; let acc = 0;
  for (const p of ps) {
    const t = p * tot;
    while (i < arr.length && acc + arr[i][1] < t) { acc += arr[i][1]; i += 1; }
    out.push(arr[Math.min(i, arr.length - 1)][0]);
  }
  return out;
}

for (const S of SETS) {
  const rows = load(S.file);
  const areaAll = rows.reduce((s, o) => s + o.ar, 0);
  console.log('');
  console.log('='.repeat(104));
  console.log(`  ${S.tag}   ${rows.length} facets sampled`);
  console.log(`  ${S.note}`);
  console.log('='.repeat(104));

  for (const CUR of [
    { name: `CHORD  2sin(nd/2)*diam > ${BAR_UM}um  (the campaign bar)`, over: (o) => o.tu > BAR_UM },
    { name: `ANGLE  normDeg > ${ANG_BAR}deg        (the invariant)`, over: (o) => o.nd > ANG_BAR },
  ]) {
    const over = rows.filter((o) => Number.isFinite(o.nd) && CUR.over(o));
    const areaOver = over.reduce((s, o) => s + o.ar, 0);
    console.log('');
    console.log(`── currency: ${CUR.name}`);
    console.log(`   over-bar  COUNT ${over.length}/${rows.length} = ${((100 * over.length) / rows.length).toFixed(2)}%   AREA ${((100 * areaOver) / areaAll).toFixed(3)}% of sampled area`);
    const row = (label, pred) => {
      let c = 0; let a = 0;
      for (const o of over) if (pred(o)) { c += 1; a += o.ar; }
      let aAll = 0;
      for (const o of rows) if (Number.isFinite(o.nd) && pred(o)) aAll += o.ar;
      const dS = a / Math.max(1e-30, areaOver); const pS = aAll / Math.max(1e-30, areaAll);
      console.log(`     ${label.padEnd(46)} cnt ${String(c).padStart(6)} (${((100 * c) / Math.max(1, over.length)).toFixed(1).padStart(5)}%)  defAREA ${(100 * dS).toFixed(2).padStart(6)}%  popAREA ${(100 * pS).toFixed(2).padStart(6)}%  ENRICH ${pS > 0 ? (dS / pS).toFixed(2) : '  -  '}`);
    };
    console.log('   ── BETA = angle(surface normal, radial) = atan(hypot(r_th/r, r_z)) — CUMULATIVE ──');
    for (const b of [15, 30, 45, 60, 71.57, 80, 85]) row(`beta >= ${b.toFixed(1)}deg  (slope >= ${Math.tan((b * Math.PI) / 180).toFixed(2)})`, (o) => beta(o) >= b);
    console.log('   ── the same, DISJOINT bands ──');
    const bands = [[0, 15], [15, 30], [30, 45], [45, 60], [60, 71.57], [71.57, 80], [80, 90.1]];
    for (const [lo, hi] of bands) row(`beta in [${lo.toFixed(0)}, ${hi.toFixed(0)})deg`, (o) => beta(o) >= lo && beta(o) < hi);
    console.log('   ── WHICH DIRECTION is the wall? (beta>=60 split by dominant component) ──');
    row('beta>=60 AND azimuthal-dominant |r_th/r| > |r_z|', (o) => beta(o) >= 60 && Math.abs(o.st) > Math.abs(o.sz));
    row('beta>=60 AND axial-dominant     |r_z| >= |r_th/r|', (o) => beta(o) >= 60 && Math.abs(o.sz) >= Math.abs(o.st));
    console.log('   ── cross-tab: is the near-vertical class the SAME thing as the S93 classes? ──');
    row('beta>=60 AND turning (sp >= nd/2)', (o) => beta(o) >= 60 && o.sp >= o.nd / 2);
    row('beta>=60 AND well-shaped (ma >= 25deg)', (o) => beta(o) >= 60 && o.ma >= 25);
    row('beta>=60 AND BIG (dm > 1mm)', (o) => beta(o) >= 60 && o.dm > 1);
    row('beta>=60 AND irreducible (floorChordLB > bar)', (o) => beta(o) >= 60 && 2 * Math.sin((0.5 * o.clb * Math.PI) / 180) * o.dm * 1000 > BAR_UM);
    row('beta< 60 AND irreducible (floorChordLB > bar)', (o) => beta(o) < 60 && 2 * Math.sin((0.5 * o.clb * Math.PI) / 180) * o.dm * 1000 > BAR_UM);
    const P = [0.05, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0];
    console.log(`   area-wt p05/25/50/75/90/99/max of BETA over the DEFECT     : ${areaWtQ(over, beta, P).map((x) => x.toFixed(2)).join('  ')}`);
    console.log(`   area-wt p05/25/50/75/90/99/max of BETA over the WHOLE MESH : ${areaWtQ(rows, beta, P).map((x) => x.toFixed(2)).join('  ')}`);
    console.log(`   area-wt p50 of BETA_theta / BETA_z over the DEFECT         : ${areaWtQ(over, betaTh, [0.5])[0].toFixed(2)} / ${areaWtQ(over, betaZ, [0.5])[0].toFixed(2)}`);
  }
}
console.log('');
console.log('NOTE: `st`/`sz` here are ONE-POINT (mean-vertex) samples. This is a SCREEN; s95WallCensus.ts');
console.log('recomputes beta as a covering quantity over the same k=8 lattice before anything is quoted.');
