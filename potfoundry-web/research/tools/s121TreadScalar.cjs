#!/usr/bin/env node
// s121TreadScalar.cjs — per-facet f64 scalar files for s116Render, plus the tread band's zoom sites.
//
//   node research/tools/s121TreadScalar.cjs <abs .stl> <nTread> <outStem>
//
// Emits  <outStem>_ar3.f64   aspect3 per facet (STL file order) — the heat scalar
//        <outStem>_tread.f64 1.0 on a TREAD facet, 0.0 on a wall facet — the population mask
// and PRINTS the (theta, z) of the worst-AR tread facet and of the largest-area tread facet, which are
// the zoom sites s116Render needs. Plain CJS: no esbuild invocation, safe to run beside a live job.
'use strict';
const fs = require('fs');

const stl = process.argv[2];
const NTREAD = Number(process.argv[3] || 0);
const stem = process.argv[4];
if (!stl || !stem) { console.log('usage: node s121TreadScalar.cjs <abs .stl> <nTread> <outStem>'); process.exit(2); }

const buf = fs.readFileSync(stl);
const n = buf.readUInt32LE(80);
const nWall = n - NTREAD;
const ar = new Float64Array(n);
const mask = new Float64Array(n);
let worstAr = -1; let worstF = -1; let bigA = -1; let bigF = -1; let treadArea = 0;
const P = [];
for (let f = 0; f < n; f += 1) {
  const o = 84 + f * 50 + 12;
  const p = [];
  for (let k = 0; k < 3; k += 1) p.push([buf.readFloatLE(o + 12 * k), buf.readFloatLE(o + 12 * k + 4), buf.readFloatLE(o + 12 * k + 8)]);
  const e0 = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
  const e1 = Math.hypot(p[2][0] - p[1][0], p[2][1] - p[1][1], p[2][2] - p[1][2]);
  const e2 = Math.hypot(p[0][0] - p[2][0], p[0][1] - p[2][1], p[0][2] - p[2][2]);
  const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
  const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
  const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const L = Math.max(e0, e1, e2);
  ar[f] = A > 0 ? (L * (e0 + e1 + e2)) / (4 * A) : 1e9;
  if (f >= nWall) {
    mask[f] = 1; treadArea += A;
    if (ar[f] > worstAr) { worstAr = ar[f]; worstF = f; P[0] = p; }
    if (A > bigA) { bigA = A; bigF = f; P[1] = p; }
  }
}
fs.writeFileSync(`${stem}_ar3.f64`, Buffer.from(ar.buffer));
fs.writeFileSync(`${stem}_tread.f64`, Buffer.from(mask.buffer));
const DEG = 180 / Math.PI;
const site = (p) => {
  const cx = (p[0][0] + p[1][0] + p[2][0]) / 3;
  const cy = (p[0][1] + p[1][1] + p[2][1]) / 3;
  const cz = (p[0][2] + p[1][2] + p[2][2]) / 3;
  return { th: Math.atan2(cy, cx) * DEG, z: cz, r: Math.hypot(cx, cy) };
};
console.log(`facets ${n}   wall ${nWall}   tread ${NTREAD}   tread area ${treadArea.toFixed(6)} mm2`);
if (worstF >= 0) {
  const s = site(P[0]);
  console.log(`WORST-AR TREAD facet ${worstF}  AR ${worstAr.toFixed(2)}  th ${s.th.toFixed(4)} deg  z ${s.z.toFixed(4)} mm  r ${s.r.toFixed(4)} mm`);
}
if (bigF >= 0) {
  const s = site(P[1]);
  console.log(`LARGEST-AREA TREAD facet ${bigF}  area ${bigA.toExponential(4)} mm2  th ${s.th.toFixed(4)} deg  z ${s.z.toFixed(4)} mm  r ${s.r.toFixed(4)} mm`);
}
// per-band zoom sites: the worst-AR and the largest-area tread facet of EACH detected step band.
const BANDS = (process.argv[5] || '').split(',').map(Number).filter((v) => Number.isFinite(v));
for (const zb of BANDS) {
  let wA = -1; let wP = null; let bA = -1; let bP = null; let cnt = 0; let ar2 = 0;
  for (let f = nWall; f < n; f += 1) {
    const o = 84 + f * 50 + 12;
    const p = [];
    for (let k = 0; k < 3; k += 1) p.push([buf.readFloatLE(o + 12 * k), buf.readFloatLE(o + 12 * k + 4), buf.readFloatLE(o + 12 * k + 8)]);
    const zc = (p[0][2] + p[1][2] + p[2][2]) / 3;
    if (Math.abs(zc - zb) > 0.02) continue;
    cnt += 1;
    const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
    const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
    const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    ar2 += A;
    if (ar[f] > wA) { wA = ar[f]; wP = p; }
    if (A > bA) { bA = A; bP = p; }
  }
  if (wP === null) { console.log(`band z=${zb}: NO tread facets`); continue; }
  const sw = site(wP); const sb = site(bP);
  console.log(`band z=${zb}  treads ${cnt}  area ${ar2.toFixed(6)} mm2`);
  console.log(`   worst AR ${wA.toFixed(2)}  th ${sw.th.toFixed(4)} deg  z ${sw.z.toFixed(4)}  r ${sw.r.toFixed(4)}`);
  console.log(`   largest area ${bA.toExponential(4)} mm2  th ${sb.th.toFixed(4)} deg  z ${sb.z.toFixed(4)}  r ${sb.r.toFixed(4)}`);
}
console.log(`scalars -> ${stem}_ar3.f64 , ${stem}_tread.f64`);
