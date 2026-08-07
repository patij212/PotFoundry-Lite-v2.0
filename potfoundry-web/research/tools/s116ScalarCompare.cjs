// s116ScalarCompare.cjs — area-weighted comparison of a per-facet f64 scalar between two STLs.
// A COUNT alone is forbidden by this campaign's measurement discipline: refinement multiplies small
// facets, so any per-facet count moves even when the defect does not. COUNT + AREA + MAX, together.
// usage: node s116ScalarCompare.cjs <stlA> <scalarA> <stlB> <scalarB> <label> <bar1,bar2,...>
const fs = require('node:fs');

function readSTL(p) {
  const buf = fs.readFileSync(p);
  const nTri = buf.readUInt32LE(80);
  const area = new Float64Array(nTri);
  let o = 84; let tot = 0;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    const v = new Float64Array(9);
    for (let k = 0; k < 9; k += 1) { v[k] = buf.readFloatLE(o); o += 4; }
    o += 2;
    const ux = v[3] - v[0], uy = v[4] - v[1], uz = v[5] - v[2];
    const wx = v[6] - v[0], wy = v[7] - v[1], wz = v[8] - v[2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    area[t] = 0.5 * Math.hypot(nx, ny, nz); tot += area[t];
  }
  return { nTri, area, tot };
}
function stats(stl, sp, bars) {
  const { nTri, area, tot } = readSTL(stl);
  const b = fs.readFileSync(sp);
  if (b.length !== nTri * 8) throw new Error(`${sp}: ${b.length} bytes, expected ${nTri * 8}`);
  const s = new Float64Array(b.buffer, b.byteOffset, nTri);
  const rows = bars.map((bar) => { let n = 0; let a = 0; for (let t = 0; t < nTri; t += 1) if (s[t] > bar) { n += 1; a += area[t]; } return { bar, n, a }; });
  let mx = 0; let aw = 0;
  for (let t = 0; t < nTri; t += 1) { if (s[t] > mx) mx = s[t]; aw += s[t] * area[t]; }
  // area-weighted median
  const idx = Array.from({ length: nTri }, (_, i) => i).sort((x, y) => s[x] - s[y]);
  let acc = 0; let p50 = 0; let p90 = 0; let p99 = 0;
  for (const i of idx) { acc += area[i]; if (p50 === 0 && acc >= 0.5 * tot) p50 = s[i]; if (p90 === 0 && acc >= 0.9 * tot) p90 = s[i]; if (p99 === 0 && acc >= 0.99 * tot) p99 = s[i]; }
  return { nTri, tot, rows, mx, mean: aw / tot, p50, p90, p99 };
}
const [stlA, spA, stlB, spB, label, barsS] = process.argv.slice(2);
const bars = barsS.split(',').map(Number);
const A = stats(stlA, spA, bars); const B = stats(stlB, spB, bars);
const pc = (a, b) => ((a / b) * 100).toFixed(4);
console.log(`\n=== ${label} — AREA-WEIGHTED, COUNT + AREA + MAX TOGETHER ===`);
console.log(`   arm        facets      area mm2    area-wtd p50    p90       p99      MAX`);
for (const [nm, S] of [['A base', A], ['B best', B]]) {
  console.log(`   ${nm.padEnd(8)} ${String(S.nTri).padStart(9)}  ${S.tot.toFixed(3).padStart(11)}  ${S.p50.toFixed(4).padStart(12)}  ${S.p90.toFixed(4).padStart(9)}  ${S.p99.toFixed(4).padStart(9)}  ${S.mx.toFixed(4)}`);
}
for (let i = 0; i < bars.length; i += 1) {
  console.log(`   over ${String(bars[i]).padStart(8)}:  A COUNT ${String(A.rows[i].n).padStart(8)} (${pc(A.rows[i].n, A.nTri)}%)  AREA ${A.rows[i].a.toFixed(4).padStart(11)} mm2 (${pc(A.rows[i].a, A.tot)}% of mesh)   |   B COUNT ${String(B.rows[i].n).padStart(8)} (${pc(B.rows[i].n, B.nTri)}%)  AREA ${B.rows[i].a.toFixed(4).padStart(11)} mm2 (${pc(B.rows[i].a, B.tot)}% of mesh)   AREA ratio A/B ${(A.rows[i].a / Math.max(1e-12, B.rows[i].a)).toFixed(3)}x`);
}
