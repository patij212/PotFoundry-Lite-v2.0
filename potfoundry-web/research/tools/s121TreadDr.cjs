#!/usr/bin/env node
// s121TreadDr.cjs — HOW MUCH OF THE TREAD POPULATION IS BRIDGING A REAL CLIFF?
//
//   node research/tools/s121TreadDr.cjs <abs .stl> <nTread>
//
// A tread facet's RADIAL EXTENT dr is the width of the ledge it covers. Where the analytic radius is
// CONTINUOUS at the step z (which the cliff profile shows is most of theta), there is no ledge to
// cover and dr collapses to a few microns: the facet exists only because `zSteps` is a SCALAR and the
// driver cuts the wall at that z across ALL theta. EXHAUSTIVE, no stride. Plain CJS: no esbuild.
'use strict';
const fs = require('fs');
const stl = process.argv[2];
const NTREAD = Number(process.argv[3] || 0);
if (!stl || !NTREAD) { console.log('usage: node s121TreadDr.cjs <abs .stl> <nTread>'); process.exit(2); }
const buf = fs.readFileSync(stl);
const n = buf.readUInt32LE(80);
const nWall = n - NTREAD;
const rows = [];
let tot = 0;
for (let f = nWall; f < n; f += 1) {
  const o = 84 + f * 50 + 12;
  const p = [];
  for (let k = 0; k < 3; k += 1) p.push([buf.readFloatLE(o + 12 * k), buf.readFloatLE(o + 12 * k + 4), buf.readFloatLE(o + 12 * k + 8)]);
  const rs = p.map((q) => Math.hypot(q[0], q[1]));
  const zs = p.map((q) => q[2]);
  const ux = p[1][0] - p[0][0], uy = p[1][1] - p[0][1], uz = p[1][2] - p[0][2];
  const wx = p[2][0] - p[0][0], wy = p[2][1] - p[0][1], wz = p[2][2] - p[0][2];
  const A = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  tot += A;
  rows.push({ dr: Math.max(...rs) - Math.min(...rs), dz: Math.max(...zs) - Math.min(...zs), A, z: (zs[0] + zs[1] + zs[2]) / 3 });
}
const pct = (a, b) => (b > 0 ? ((100 * a) / b).toFixed(4) : 'n/a');
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))];
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log('S121 TREAD RADIAL EXTENT — is there a ledge to cover at all? (EXHAUSTIVE, no stride)');
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log(`mesh ${stl}`);
console.log(`treads ${NTREAD}   tread 3-D area ${tot.toFixed(6)} mm2`);
const dr = rows.map((r) => r.dr);
console.log(`  dr  min ${q(dr, 0).toExponential(4)}  p10 ${q(dr, 0.1).toExponential(4)}  p50 ${q(dr, 0.5).toExponential(4)}`
  + `  p90 ${q(dr, 0.9).toExponential(4)}  max ${q(dr, 0.999999).toExponential(4)}  (mm)`);
for (const bar of [0.001, 0.004, 0.008, 0.01, 0.05, 0.1]) {
  const sel = rows.filter((r) => r.dr < bar);
  const a = sel.reduce((s, r) => s + r.A, 0);
  console.log(`  dr < ${String(bar).padEnd(6)} mm : ${String(sel.length).padStart(6)} treads (${pct(sel.length, NTREAD)}%)   ${a.toFixed(6)} mm2 (${pct(a, tot)}% of tread area)`);
}
console.log('  (dr below the 8 um strip height means the two loops are radially coincident: the emitter is');
console.log('   bridging a step that does not exist at that theta.)');
console.log('S121 TREAD DR DONE');
