#!/usr/bin/env node
// s120StlAr.cjs — INDEPENDENT, STL-side scan for facets over the driver's own 3-D aspect cap.
//
//   node research/tools/s120StlAr.cjs <abs path to .stl> [cap]
//
// WHY A SEPARATE, DEPENDENCY-FREE SCRIPT. The in-driver S120 tread census and the driver's own post-loop
// cap scan are the same function inside the same process. This reads the SHIPPED FILE with an independent
// transcription of `_shapeGuard.aspect3` (copied operand-for-operand from research/bridge/_shapeGuard.ts
// lines 61-75) so the claim "the only over-cap facets in the STL come from stitchRings" rests on two
// instruments, not one. Plain CJS on purpose: no esbuild invocation, so it is safe to run while a vitest
// driver arm is live.
//
// EXHAUSTIVE. Every facet, no stride, no cap on the scan.
'use strict';
const fs = require('fs');

const stl = process.argv[2];
const CAP = Number(process.argv[3] || 50);
if (!stl) { console.log('usage: node s120StlAr.cjs <abs .stl> [cap]'); process.exit(2); }

const aspect3 = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  const L = Math.max(e0, e1, e2);
  return (L * (e0 + e1 + e2)) / (4 * area);
};

const buf = fs.readFileSync(stl);
const n = buf.readUInt32LE(80);
let over = 0, overArea = 0, arMax = 0, area3 = 0, degenerate = 0;
const zs = [];          // z-extent of every over-cap facet, so their LOCATION can be checked
const arHist = [0, 0, 0, 0, 0, 0];   // <10, <20, <50, <100, <200, >=200
for (let f = 0; f < n; f += 1) {
  const o = 84 + f * 50 + 12;
  const ax = buf.readFloatLE(o), ay = buf.readFloatLE(o + 4), az = buf.readFloatLE(o + 8);
  const bx = buf.readFloatLE(o + 12), by = buf.readFloatLE(o + 16), bz = buf.readFloatLE(o + 20);
  const cx = buf.readFloatLE(o + 24), cy = buf.readFloatLE(o + 28), cz = buf.readFloatLE(o + 32);
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  area3 += A;
  if (!(A > 0)) degenerate += 1;
  const ar = aspect3(ax, ay, az, bx, by, bz, cx, cy, cz);
  if (ar > arMax && Number.isFinite(ar)) arMax = ar;
  arHist[ar < 10 ? 0 : ar < 20 ? 1 : ar < 50 ? 2 : ar < 100 ? 3 : ar < 200 ? 4 : 5] += 1;
  if (ar > CAP) { over += 1; overArea += A; zs.push([Math.min(az, bz, cz), Math.max(az, bz, cz)]); }
}
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(4) : 'n/a');
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log(`S120 STL-SIDE 3-D ASPECT SCAN (independent transcription of _shapeGuard.aspect3)`);
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log(`mesh ${stl}`);
console.log(`facets ${n.toLocaleString()}   3-D area ${area3.toFixed(3)} mm2   EXHAUSTIVE, no stride`);
console.log(`cap AR > ${CAP}`);
console.log(`  OVER THE CAP: ${over.toLocaleString()} facets (${pct(over, n)}%)   area ${overArea.toFixed(6)} mm2 (${pct(overArea, area3)}%)`);
console.log(`  worst 3-D AR ${arMax.toFixed(2)}   exactly-zero-area facets ${degenerate}`);
console.log(`  AR histogram:  <10 ${arHist[0].toLocaleString()}   <20 ${arHist[1].toLocaleString()}   <50 ${arHist[2].toLocaleString()}   <100 ${arHist[3].toLocaleString()}   <200 ${arHist[4].toLocaleString()}   >=200 ${arHist[5].toLocaleString()}`);
if (zs.length > 0) {
  // WHERE they are. A tread riser is a thin z-band at a detected C0 step; the wall is not.
  const lo = zs.map((p) => p[0]).sort((a, b) => a - b);
  const bands = new Map();
  for (const [z0, z1] of zs) {
    const k = (Math.round(z0 * 10) / 10).toFixed(1);
    const v = bands.get(k) || { n: 0, span: 0 };
    v.n += 1; v.span = Math.max(v.span, z1 - z0);
    bands.set(k, v);
  }
  const top = [...bands.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  console.log(`  z of the over-cap facets: min ${lo[0].toFixed(4)}  max ${lo[lo.length - 1].toFixed(4)}   distinct 0.1mm bands ${bands.size}`);
  console.log('  top bands (z, count, max z-span of the facet):');
  for (const [k, v] of top) console.log(`     z=${k}  n=${v.n}  maxSpan ${v.span.toExponential(3)} mm`);
}
console.log('S120 STL AR SCAN DONE');
