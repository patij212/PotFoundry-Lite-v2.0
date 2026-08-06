// s99ArCalib.ts — CALIBRATE the driver's `PF_CB_SHAPE_AR` against the S98 shape threshold.
//
// S98 measured a SHARP refinability threshold at q = h_min/sqrt(area) = 0.4 on the SHAPE-off Voronoi
// mesh: below it, 759.60x leaves/parent and 15.820% never clears; at or above it, 5.01x and 0.000%.
// The driver does not gate on q — it gates on `_shapeGuard.aspect3 = L*(e0+e1+e2)/(4*area)`, default
// PF_CB_SHAPE_AR = 50. This converts one bar into the other so the default can be judged.
//
// EXACT RELATION (algebra, not fit):  q = 2*sqrt(A)/L  =>  A = q^2 L^2 / 4
//   aspect3 = L*P/(4A) = L*P/(q^2 L^2) = (P/L) / q^2 ,  and P/L is in [2,3] for every triangle
//   (3 exactly at equilateral, -> 2 at a degenerate needle).
//   => q = 0.4  <=>  aspect3 in [12.5, 18.75]
//   => aspect3 = 50  <=>  q in [sqrt(2/50), sqrt(3/50)] = [0.200, 0.245]
// So the DEFAULT ADMITS the catastrophic band. This tool checks that on real facets.
//
// Read-only over a finished STL.  Usage: bash research/tools/run-s99-arcalib.sh
import { readMeshFloat64 } from '../bridge/_facetTruthPool';

// eslint-disable-next-line no-console
const log = console.log;
const STL = process.env.PF_S99_STL ?? 'research/exchange/_strataConformBisect/voronoi_ring_D--.stl';

log('===== S99 — q  <->  aspect3 CALIBRATION =====');
const { xyz, nTri } = readMeshFloat64(STL, false);
log(`${STL}   ${nTri} triangles`);

const qs: number[] = []; const ars: number[] = [];
const arAtQ: Map<number, number[]> = new Map();
const QB = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0];
for (const b of QB) arAtQ.set(b, []);
let nDegen = 0;
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) { nDegen += 1; continue; }
  const L = Math.max(e0, e1, e2);
  const ar = (L * (e0 + e1 + e2)) / (4 * area);
  const q = (2 * Math.sqrt(area)) / L;
  qs.push(q); ars.push(ar);
  for (const b of QB) { const lo = b - 0.02; const hi = b + 0.02; if (q >= lo && q < hi) (arAtQ.get(b) as number[]).push(ar); }
}
const quant = (v: number[], p: number): number => {
  if (v.length === 0) return NaN;
  const a = [...v].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))];
};
log(`scored ${qs.length} facets (${nDegen} zero-area skipped)`);
log('');
log('THE EXACT RELATION aspect3 = (P/L)/q^2 CHECKED ON REAL FACETS:');
log(`   ${'q ~='.padEnd(8)} ${'n'.padStart(8)} ${'aspect3 p05'.padStart(12)} ${'p50'.padStart(10)} ${'p95'.padStart(10)}   ${'(P/L)/q^2 band'.padStart(18)}`);
for (const b of QB) {
  const v = arAtQ.get(b) as number[];
  if (v.length === 0) continue;
  log(`   ${b.toFixed(2).padEnd(8)} ${String(v.length).padStart(8)} ${quant(v, 0.05).toFixed(2).padStart(12)} ${quant(v, 0.50).toFixed(2).padStart(10)} ${quant(v, 0.95).toFixed(2).padStart(10)}   ${`${(2 / (b * b)).toFixed(1)} - ${(3 / (b * b)).toFixed(1)}`.padStart(18)}`);
}
log('');
log('*** WHAT THE CURRENT DEFAULT ADMITS ***');
for (const AR of [50, 25, 18, 15, 12, 8]) {
  let n = 0; let nq04 = 0; let minq = Infinity;
  for (let i = 0; i < qs.length; i += 1) {
    if (ars[i] <= AR) { n += 1; if (qs[i] < 0.4) nq04 += 1; if (qs[i] < minq) minq = qs[i]; }
  }
  log(`   PF_CB_SHAPE_AR = ${String(AR).padStart(3)} : admits ${((100 * n) / qs.length).toFixed(3).padStart(7)}% of facets,  of which ${((100 * nq04) / Math.max(1, n)).toFixed(3).padStart(7)}% are in the CATASTROPHIC q<0.4 band,  worst admitted q = ${minq === Infinity ? 'n/a' : minq.toFixed(3)}`);
}
log('');
log('S98 THRESHOLD: q < 0.4 => 759.60x leaves/parent and 15.820% never clears.');
log('               q >= 0.4 => 5.01x and 0.000% uncleared.   (SHAPE-off Voronoi, LEPP, 10um chord)');
