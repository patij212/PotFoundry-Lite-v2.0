#!/usr/bin/env node
// s121TreadSign.cjs — IS THE MIXED +z/-z SIGN INSIDE A TREAD BAND A DEFECT, OR IS IT CORRECT?
//
//   node research/tools/s121TreadSign.cjs <abs .stl> <nTread>
//
// A tread annulus bridges radius r- (below the step) to r+ (above it). The material is on the z>zStep
// side wherever r+ > r-, so the OUTWARD normal of that annulus points DOWN; where r+ < r- it points UP.
// Hence the correct sign is  sign(n_z) = -sign(r+ - r-)  FACET BY FACET, and because the radius jump
// changes sign with theta (measured in the cliff profile), a band containing BOTH signs is EXPECTED.
// This script tests that prediction against the shipped bytes instead of arguing it.
//
// r- / r+ are taken from the facet's own vertices: each tread facet has its vertices on two z-levels
// (the two loops), so the level means ARE the two radii. EXHAUSTIVE, no stride. Plain CJS: no esbuild.
'use strict';
const fs = require('fs');
const stl = process.argv[2];
const NTREAD = Number(process.argv[3] || 0);
if (!stl || !NTREAD) { console.log('usage: node s121TreadSign.cjs <abs .stl> <nTread>'); process.exit(2); }
const buf = fs.readFileSync(stl);
const n = buf.readUInt32LE(80);
const nWall = n - NTREAD;
let agree = 0; let disagree = 0; let degenerate = 0; let agreeA = 0; let disagreeA = 0;
let flatDr = 0;
const worst = [];
for (let f = nWall; f < n; f += 1) {
  const o = 84 + f * 50 + 12;
  const p = [];
  for (let k = 0; k < 3; k += 1) p.push([buf.readFloatLE(o + 12 * k), buf.readFloatLE(o + 12 * k + 4), buf.readFloatLE(o + 12 * k + 8)]);
  const zs = p.map((q) => q[2]);
  const rs = p.map((q) => Math.hypot(q[0], q[1]));
  const zLo = Math.min(...zs); const zHi = Math.max(...zs);
  if (!(zHi - zLo > 0)) { degenerate += 1; continue; }
  const mid = 0.5 * (zLo + zHi);
  let rLo = 0; let nLo = 0; let rHi = 0; let nHi = 0;
  for (let k = 0; k < 3; k += 1) { if (zs[k] < mid) { rLo += rs[k]; nLo += 1; } else { rHi += rs[k]; nHi += 1; } }
  if (nLo === 0 || nHi === 0) { degenerate += 1; continue; }
  rLo /= nLo; rHi /= nHi;
  const dr = rHi - rLo;
  const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
  const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
  const nz = ux * wy - uy * wx;
  const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, nz);
  if (Math.abs(dr) < 1e-9) { flatDr += 1; continue; }
  const predicted = dr > 0 ? -1 : 1;
  const actual = nz >= 0 ? 1 : -1;
  if (predicted === actual) { agree += 1; agreeA += A; } else {
    disagree += 1; disagreeA += A;
    if (worst.length < 10) worst.push({ f, dr, nz, A, z: mid, th: Math.atan2((p[0][1] + p[1][1] + p[2][1]) / 3, (p[0][0] + p[1][0] + p[2][0]) / 3) * 180 / Math.PI });
  }
}
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// THE SAME TEST, WITH THE CONFOUND REMOVED.
// Above, r- and r+ are the facet's OWN vertex means, so they are taken at DIFFERENT theta and the
// step jump is mixed with the ring's own dR/dtheta. Here both radii are read at the SAME theta — the
// facet centroid's — by interpolating each loop's polyline, which is the quantity the prediction is
// actually about. Loops are rebuilt from the tread vertices alone; still STL-only, still exhaustive.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
const bandsOf = new Map();                       // rounded step z -> { lo: [[th,r]], hi: [[th,r]] }
const TWO_PI = 2 * Math.PI;
for (let f = nWall; f < n; f += 1) {
  const o = 84 + f * 50 + 12;
  for (let k = 0; k < 3; k += 1) {
    const x = buf.readFloatLE(o + 12 * k); const y = buf.readFloatLE(o + 12 * k + 4); const z = buf.readFloatLE(o + 12 * k + 8);
    const key = (Math.round(z * 10) / 10).toFixed(1);
    let b = bandsOf.get(key);
    if (b === undefined) { b = { zs: Number(key), lo: [], hi: [] }; bandsOf.set(key, b); }
    let th = Math.atan2(y, x); if (th < 0) th += TWO_PI;
    (z < b.zs ? b.lo : b.hi).push([th, Math.hypot(x, y)]);
  }
}
for (const b of bandsOf.values()) { b.lo.sort((p, q) => p[0] - q[0]); b.hi.sort((p, q) => p[0] - q[0]); }
const interp = (arr, th) => {
  if (arr.length === 0) return NaN;
  let lo = 0; let hi = arr.length - 1;
  if (th <= arr[0][0] || th >= arr[hi][0]) {                    // wrap segment
    const a = arr[hi]; const c = arr[0];
    const span = c[0] + TWO_PI - a[0];
    const t = span > 0 ? ((th > a[0] ? th : th + TWO_PI) - a[0]) / span : 0;
    return a[1] + t * (c[1] - a[1]);
  }
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arr[m][0] <= th) lo = m; else hi = m; }
  const a = arr[lo]; const c = arr[hi];
  const span = c[0] - a[0];
  return span > 0 ? a[1] + ((th - a[0]) / span) * (c[1] - a[1]) : a[1];
};
let agree2 = 0; let disagree2 = 0; let agree2A = 0; let disagree2A = 0; let skip2 = 0;
for (let f = nWall; f < n; f += 1) {
  const o = 84 + f * 50 + 12;
  const p = [];
  for (let k = 0; k < 3; k += 1) p.push([buf.readFloatLE(o + 12 * k), buf.readFloatLE(o + 12 * k + 4), buf.readFloatLE(o + 12 * k + 8)]);
  const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
  const key = (Math.round(cz * 10) / 10).toFixed(1);
  const b = bandsOf.get(key);
  if (b === undefined) { skip2 += 1; continue; }
  const cx = (p[0][0] + p[1][0] + p[2][0]) / 3; const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
  let th = Math.atan2(cy, cx); if (th < 0) th += TWO_PI;
  const dr = interp(b.hi, th) - interp(b.lo, th);
  const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
  const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
  const nz = ux * wy - uy * wx;
  const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, nz);
  if (!Number.isFinite(dr) || Math.abs(dr) < 1e-9) { skip2 += 1; continue; }
  const predicted = dr > 0 ? -1 : 1;
  const actual = nz >= 0 ? 1 : -1;
  if (predicted === actual) { agree2 += 1; agree2A += A; } else { disagree2 += 1; disagree2A += A; }
}

const tot = agree + disagree;
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(4) : 'n/a');
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log('S121 TREAD NORMAL SIGN — predicted sign(n_z) = -sign(r+ - r-), tested facet by facet');
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log(`mesh ${stl}   treads ${NTREAD}`);
console.log(`  adjudicated ${tot} of ${NTREAD}   (skipped: ${degenerate} not spanning two z-levels, ${flatDr} with |r+ - r-| < 1 nm)`);
console.log(`  *** AGREE    ${agree} (${pct(agree, tot)}%)   ${agreeA.toFixed(6)} mm2`);
console.log(`  *** DISAGREE ${disagree} (${pct(disagree, tot)}%)   ${disagreeA.toFixed(6)} mm2`);
if (disagree > 0) {
  console.log('  worst disagreements (facet, dr mm, nz, area mm2, z, theta deg):');
  for (const w of worst) console.log(`     ${w.f}  dr ${w.dr.toExponential(3)}  nz ${w.nz.toExponential(3)}  A ${w.A.toExponential(3)}  z ${w.z.toFixed(4)}  th ${w.th.toFixed(3)}`);
}
const tot2 = agree2 + disagree2;
console.log('  ── SAME-THETA TEST (both radii interpolated on their own loop at the facet centroid theta) ──');
console.log(`     adjudicated ${tot2} of ${NTREAD}   skipped ${skip2}`);
console.log(`     *** AGREE    ${agree2} (${pct(agree2, tot2)}%)   ${agree2A.toFixed(6)} mm2 (${pct(agree2A, agree2A + disagree2A)}% of adjudicated area)`);
console.log(`     *** DISAGREE ${disagree2} (${pct(disagree2, tot2)}%)   ${disagree2A.toFixed(6)} mm2 (${pct(disagree2A, agree2A + disagree2A)}%)`);
console.log('  (a high AGREE rate means the mixed +z/-z sign inside one band is the CORRECT answer to a');
console.log('   radius jump that changes sign with theta, NOT an orientation defect.)');
console.log('S121 TREAD SIGN DONE');
