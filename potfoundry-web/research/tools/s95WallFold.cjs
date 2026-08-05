#!/usr/bin/env node
/* eslint-disable no-console */
// s95WallFold.cjs — W1 part 2 + W2 SCREEN: the two covariates that "wall angle" alone cannot separate.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS. `s95WallShare.cjs` measured BETA = angle(surface normal, radial) on the same
// 60,000-facet NDJSON S93 produced, and the answer INVERTS the brief's premise:
//
//     whole-mesh max BETA :  Voronoi 76.22 deg   |   GothicArches 85.73 deg
//     mesh AREA at beta>=80:  Voronoi  0.00%     |   GothicArches  4.24%
//
// *** GOTHIC IS THE STEEPER MESH, AND GOTHIC IS THE ONE LEPP CLOSES AT 6.67x WITH 0.00% UNCLEARED. ***
// So "near-vertical wall" as a STATIC property of the surface cannot be what breaks Voronoi's
// refinement. Two candidate discriminators remain, and both are free from the same NDJSON:
//
//  (A) THE SIZING COVARIATE  `tau = kapA * diam` — the facet's own size measured in units of the local
//      Gauss-map turning radius. A facet with tau << 1 sits inside one curvature radius (the surface is
//      locally a plane to it); tau >> 1 means the surface turns right through the facet. The orientation
//      chord is ~ kapA*diam^2 = tau*diam, so tau is the dimensionless part of the bar.
//
//  (B) THE FOLD COVARIATE  `phi` — a first-principles prediction of when lifting an edge midpoint onto
//      the surface INVERTS the child. Derivation (this is the whole of W2 in three lines):
//        * the mesher's `liftAt` places the new vertex at r = rA(theta_m, z_m): the displacement from the
//          3-D chord midpoint is PURELY RADIAL, magnitude delta.
//        * on a wall at angle BETA the radial direction makes angle BETA with the facet's own normal, so
//              delta_perp = delta*cos(beta)        delta_parallel = delta*sin(beta)
//          i.e. *** dPar/dPerp = tan(beta) = slope, EXACTLY. *** (S82 measured dPar/dPerp p50 = 7.01.)
//        * bisecting edge AB at its midpoint M0, the child (A,M,C) degenerates when M reaches line AC.
//          dist(M0, AC) = 1/2 * altitude from B; likewise for the other child. So the child INVERTS once
//              delta * sin(beta)  >  1/2 * h_min,     h_min = 2*Area/diam
//          => *** phi := 2*delta*sin(beta)/h_min  and the fold threshold is phi = 1. ***
//          => the critical radial sag is  delta_crit = h_min / (2 sin beta): a wall at beta=76deg folds at
//             0.515*h_min, a floor at beta=5deg needs 5.7*h_min and can never fold.
//      Here `delta` is proxied by the NDJSON's `dr` = the max RADIAL facet-to-surface deviation over the
//      k=8 covering, which is an UPPER bound on the edge-midpoint radial sag, so phi is an UPPER bound
//      and "phi <= 1" is the SOUND direction (proves no fold). Measured exactly, per edge, in
//      s95WallCensus.ts; this is the screen that decides whether that run is worth the night.
//
// ── PRE-REGISTERED, before the first run ──────────────────────────────────────────────────────────
//  H-W2a: tau separates the two styles. KILL: if area-wt p50 tau(Voronoi defect) < 2x tau(Gothic
//         defect), the sizing covariate does not discriminate and (A) is refuted.
//  H-W2b: phi separates them. KILL: if the over-bar AREA share with phi > 1 is not at least 3x larger
//         on Voronoi than on Gothic, the fold predictor does not discriminate and (B) is refuted.
//  Both are reported by AREA and by COUNT, in both currencies, with the population share.
//
// Usage: node research/tools/s95WallFold.cjs
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const fs = require('node:fs');
const path = require('node:path');

const DIR = 'research/exchange/_strataConformBisect/frontier';
const SETS = [
  { tag: 'VORONOI', file: 'FR_TAX_VORONOI.ndjson', note: 'voronoi_ring_D--.stl 806,765 tris SHAPE-off (the WORSE of the two, per 060f3cd9). LEPP: 222x, 15.6% uncleared' },
  { tag: 'S39CTL', file: 'FR_TAX_S39CTL.ndjson', note: 'gothicarches_ring_DS-HT_S39CTL.stl 1,142,166 tris. LEPP: 6.67x, 0.00% uncleared' },
  { tag: 'LOWPOLY', file: 'FR_TAX_LOWPOLY.ndjson', note: 'lowpolyfacet 137,480 tris (reverse control)' },
];
const BAR_UM = 10;

function load(f) {
  const out = [];
  for (const ln of fs.readFileSync(path.join(DIR, f), 'utf8').split('\n')) if (ln.length > 3) out.push(JSON.parse(ln));
  return out;
}
const D = (r) => (r * 180) / Math.PI;
const slope = (o) => Math.hypot(o.st, o.sz);
const beta = (o) => D(Math.atan(slope(o)));
const hmin = (o) => (2 * o.ar) / Math.max(1e-30, o.dm);                 // mm — smallest altitude
const tau = (o) => o.ka * o.dm;                                          // dimensionless facet size
const sinB = (o) => slope(o) / Math.sqrt(1 + slope(o) * slope(o));
const phi = (o) => (2 * (o.dr / 1000) * sinB(o)) / Math.max(1e-30, hmin(o));

function awq(rows, val, ps) {
  const arr = rows.map((o) => [val(o), o.ar]).filter((x) => Number.isFinite(x[0]));
  arr.sort((a, b) => a[0] - b[0]);
  const tot = arr.reduce((s, x) => s + x[1], 0);
  const out = []; let i = 0; let acc = 0;
  for (const p of ps) { const t = p * tot; while (i < arr.length && acc + arr[i][1] < t) { acc += arr[i][1]; i += 1; } out.push(arr[Math.min(i, arr.length - 1)][0]); }
  return out;
}
const P = [0.05, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0];
const fq = (v, d = 4) => v.map((x) => (Number.isFinite(x) ? x.toExponential(d) : 'NaN')).join(' ');

const summary = [];
for (const S of SETS) {
  const rows = load(S.file);
  const areaAll = rows.reduce((s, o) => s + o.ar, 0);
  console.log('');
  console.log('='.repeat(112));
  console.log(`  ${S.tag}   ${rows.length} facets   ${S.note}`);
  console.log('='.repeat(112));
  console.log(`  raw covariate ranges: max|r_th/r| ${Math.max(...rows.map((o) => Math.abs(o.st))).toFixed(4)}   max|r_z| ${Math.max(...rows.map((o) => Math.abs(o.sz))).toFixed(4)}   max slope ${Math.max(...rows.map(slope)).toFixed(4)} (beta ${Math.max(...rows.map(beta)).toFixed(2)}deg)`);

  for (const CUR of [
    { name: 'CHORD > 10um', over: (o) => o.tu > BAR_UM },
    { name: 'ANGLE > 1deg', over: (o) => o.nd > 1.0 },
  ]) {
    const over = rows.filter((o) => Number.isFinite(o.nd) && CUR.over(o));
    const aOver = over.reduce((s, o) => s + o.ar, 0);
    console.log('');
    console.log(`  ── ${CUR.name}:  cnt ${over.length} (${((100 * over.length) / rows.length).toFixed(2)}%)  AREA ${((100 * aOver) / areaAll).toFixed(3)}%`);
    const row = (label, pred) => {
      let c = 0; let a = 0; for (const o of over) if (pred(o)) { c += 1; a += o.ar; }
      let aAll = 0; for (const o of rows) if (Number.isFinite(o.nd) && pred(o)) aAll += o.ar;
      const dS = a / Math.max(1e-30, aOver); const pS = aAll / Math.max(1e-30, areaAll);
      console.log(`      ${label.padEnd(42)} cnt ${String(c).padStart(6)} (${((100 * c) / Math.max(1, over.length)).toFixed(1).padStart(5)}%)  defAREA ${(100 * dS).toFixed(2).padStart(6)}%  popAREA ${(100 * pS).toFixed(2).padStart(6)}%  ENRICH ${pS > 0 ? (dS / pS).toFixed(2) : '  -  '}`);
    };
    console.log(`      (A) tau = kapA*diam    area-wt p05/25/50/75/90/99/max, DEFECT : ${fq(awq(over, tau, P), 3)}`);
    console.log(`      (A) tau = kapA*diam    area-wt, WHOLE MESH                    : ${fq(awq(rows, tau, P), 3)}`);
    for (const t of [0.1, 0.5, 1, 2, 5]) row(`tau >= ${t}`, (o) => tau(o) >= t);
    console.log(`      (B) phi = 2*dr*sin(beta)/h_min   area-wt, DEFECT              : ${fq(awq(over, phi, P), 3)}`);
    console.log(`      (B) phi                          area-wt, WHOLE MESH          : ${fq(awq(rows, phi, P), 3)}`);
    for (const t of [0.1, 0.25, 0.5, 1.0, 2.0]) row(`phi >= ${t}  (>=1 predicts a FOLD)`, (o) => phi(o) >= t);
    console.log(`      h_min (mm)             area-wt, DEFECT                        : ${fq(awq(over, hmin, P), 3)}`);
    console.log(`      dr    (um radial sag)  area-wt, DEFECT                        : ${fq(awq(over, (o) => o.dr, P), 3)}`);
    console.log(`      kapA  (1/mm)           area-wt, DEFECT                        : ${fq(awq(over, (o) => o.ka, P), 3)}`);
    console.log(`      diam  (mm)             area-wt, DEFECT                        : ${fq(awq(over, (o) => o.dm, P), 3)}`);
    console.log(`      minAngle (deg)         area-wt, DEFECT                        : ${fq(awq(over, (o) => o.ma, P), 3)}`);
    if (CUR.name.startsWith('CHORD')) {
      let aPhi = 0; for (const o of over) if (phi(o) >= 1) aPhi += o.ar;
      summary.push({ tag: S.tag, tauP50: awq(over, tau, [0.5])[0], phiP50: awq(over, phi, [0.5])[0], phiGE1: (100 * aPhi) / Math.max(1e-30, aOver), maxBeta: Math.max(...rows.map(beta)) });
    }
  }
}
console.log('');
console.log('='.repeat(112));
console.log('  KILL-CRITERION SCORECARD (chord currency, area-weighted)');
console.log('='.repeat(112));
console.log('  style        maxBeta   tau_p50(def)   phi_p50(def)   defAREA with phi>=1');
for (const s of summary) console.log(`  ${s.tag.padEnd(10)} ${s.maxBeta.toFixed(2).padStart(7)}   ${s.tauP50.toExponential(3).padStart(12)}   ${s.phiP50.toExponential(3).padStart(12)}   ${s.phiGE1.toFixed(3).padStart(8)}%`);
const V = summary.find((s) => s.tag === 'VORONOI'); const G = summary.find((s) => s.tag === 'S39CTL');
if (V && G) {
  console.log('');
  console.log(`  H-W2a  tau_p50 ratio  Voronoi/Gothic = ${(V.tauP50 / G.tauP50).toFixed(3)}   KILL if < 2.0  -> ${V.tauP50 / G.tauP50 >= 2 ? 'CONFIRMED' : '*** REFUTED ***'}`);
  console.log(`  H-W2b  phi>=1 AREA ratio Voronoi/Gothic = ${(V.phiGE1 / Math.max(1e-9, G.phiGE1)).toFixed(3)}   KILL if < 3.0  -> ${V.phiGE1 / Math.max(1e-9, G.phiGE1) >= 3 ? 'CONFIRMED' : '*** REFUTED ***'}`);
}
