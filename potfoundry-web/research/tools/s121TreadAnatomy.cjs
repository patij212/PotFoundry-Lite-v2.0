#!/usr/bin/env node
// s121TreadAnatomy.cjs — WHAT IS THE OVER-CAP FACET ACTUALLY SHAPED LIKE?
//
//   node research/tools/s121TreadAnatomy.cjs <abs .stl> [cap]
//
// S120 proved WHERE the over-cap facets are (three 0.1 mm z-bands = the driver's three detected C0 steps).
// It did NOT say what makes them thin. This reads the SHIPPED FILE and decomposes every over-cap facet
// into the quantities that can make aspect3 large:
//     dz   = z extent            (bounded by 2*PF_CB_STEP_EPS_UM = 8 um by construction)
//     dr   = radial extent       (the tread's own width at that theta — the CLIFF)
//     arc  = angular chord       (the ring pitch at that theta)
// aspect3 ~ longest edge / altitude, so which of {dz, dr} is the altitude decides the geometric cause.
// EXHAUSTIVE: every facet, no stride, no cap on the scan. Plain CJS: no esbuild invocation.
'use strict';
const fs = require('fs');

const stl = process.argv[2];
const CAP = Number(process.argv[3] || 50);
if (!stl) { console.log('usage: node s121TreadAnatomy.cjs <abs .stl> [cap]'); process.exit(2); }

const aspect3 = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  const L = Math.max(e0, e1, e2);
  return { ar: (L * (e0 + e1 + e2)) / (4 * area), area, L, alt: (2 * area) / L, e: [e0, e1, e2] };
};

const buf = fs.readFileSync(stl);
const n = buf.readUInt32LE(80);
const rows = [];
let over = 0; let overArea = 0; let arMax = 0;
for (let f = 0; f < n; f += 1) {
  const o = 84 + f * 50 + 12;
  const P = [];
  for (let k = 0; k < 3; k += 1) {
    P.push([buf.readFloatLE(o + 12 * k), buf.readFloatLE(o + 12 * k + 4), buf.readFloatLE(o + 12 * k + 8)]);
  }
  const g = aspect3(P[0][0], P[0][1], P[0][2], P[1][0], P[1][1], P[1][2], P[2][0], P[2][1], P[2][2]);
  if (!Number.isFinite(g.ar) || g.ar <= CAP) continue;
  over += 1; overArea += g.area; if (g.ar > arMax) arMax = g.ar;
  const zs = P.map((p) => p[2]);
  const rs = P.map((p) => Math.hypot(p[0], p[1]));
  const ths = P.map((p) => { const a = Math.atan2(p[1], p[0]); return a < 0 ? a + 2 * Math.PI : a; });
  // angular extent, wrap-aware: take the smallest arc containing the three thetas
  const s = ths.slice().sort((a, b) => a - b);
  let gapMax = s[0] + 2 * Math.PI - s[2];
  for (let k = 0; k + 1 < 3; k += 1) gapMax = Math.max(gapMax, s[k + 1] - s[k]);
  const dth = 2 * Math.PI - gapMax;
  const rm = (rs[0] + rs[1] + rs[2]) / 3;
  rows.push({
    ar: g.ar, area: g.area, L: g.L, alt: g.alt,
    dz: Math.max(...zs) - Math.min(...zs),
    dr: Math.max(...rs) - Math.min(...rs),
    arc: dth * rm, zmin: Math.min(...zs), rm,
  });
}
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(4) : 'n/a');
const q = (a, p) => (a.length === 0 ? NaN : a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]);
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log('S121 OVER-CAP FACET ANATOMY  (independent STL-side scan, EXHAUSTIVE, no stride)');
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log(`mesh ${stl}`);
console.log(`facets ${n.toLocaleString()}   cap AR > ${CAP}`);
console.log(`OVER THE CAP: ${over} (${pct(over, n)}%)   area ${overArea.toFixed(6)} mm2   worst AR ${arMax.toFixed(2)}`);
if (over === 0) { console.log('S121 ANATOMY DONE'); process.exit(0); }
const col = (k) => rows.map((r) => r[k]);
for (const k of ['ar', 'L', 'alt', 'dz', 'dr', 'arc', 'area']) {
  const v = col(k);
  console.log(`  ${k.padEnd(5)} min ${q(v, 0).toExponential(4)}  p50 ${q(v, 0.5).toExponential(4)}`
    + `  p90 ${q(v, 0.9).toExponential(4)}  max ${q(v, 0.999999).toExponential(4)}`);
}
// WHICH quantity is the altitude? A facet whose altitude tracks dz is a Z-GAP sliver (the 8 um band);
// one whose altitude tracks dr is a vanishing-CLIFF sliver. They imply different fixes.
let zLike = 0; let rLike = 0; let neither = 0;
for (const r of rows) {
  const dzr = Math.abs(r.alt - r.dz) / Math.max(r.alt, 1e-12);
  const drr = Math.abs(r.alt - r.dr) / Math.max(r.alt, 1e-12);
  if (dzr < 0.25 && dzr <= drr) zLike += 1; else if (drr < 0.25) rLike += 1; else neither += 1;
}
console.log(`  ALTITUDE SOURCE: tracks dz (the 8 um band) ${zLike}   tracks dr (a vanishing cliff) ${rLike}   neither ${neither}`);
const nDrTiny = rows.filter((r) => r.dr < 0.01).length;
const nDzTiny = rows.filter((r) => r.dz < 0.01).length;
console.log(`  dr < 10 um on ${nDrTiny} of ${over};  dz < 10 um on ${nDzTiny} of ${over}`);
console.log('  10 worst by AR — ar, longest edge L, altitude, dz, dr, arc, r, z:');
for (const r of rows.slice().sort((a, b) => b.ar - a.ar).slice(0, 10)) {
  console.log(`     AR ${r.ar.toFixed(2).padStart(8)}  L ${r.L.toExponential(3)}  alt ${r.alt.toExponential(3)}`
    + `  dz ${r.dz.toExponential(3)}  dr ${r.dr.toExponential(3)}  arc ${r.arc.toExponential(3)}`
    + `  r ${r.rm.toFixed(3)}  z ${r.zmin.toFixed(4)}`);
}
console.log('S121 ANATOMY DONE');
