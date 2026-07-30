// research/tools/_bladeCensus.mjs — DIAGNOSTIC ONLY (2026-07-29 blade investigation).
// Pure-geometry census of an STL produced by _strataConformBisect: finds high-aspect "blade" facets and
// answers the ONE question that separates a placement bug from a topology bug —
//   is the facet's PARAMETRIC (theta,z) winding inverted?
// Every vertex this driver emits is lifted from (theta,z) by r = rA(theta,z), so the mesh is a triangulation
// of the (theta,z) cylinder. A negative signed area in (theta,z) is a FOLD by construction, not an opinion.
//
// usage: node research/tools/_bladeCensus.mjs <file.stl> [arThreshold]
import { readFileSync } from 'node:fs';

const path = process.argv[2];
const AR_T = Number.parseFloat(process.argv[3] ?? '50');
const buf = readFileSync(path);
const n = buf.readUInt32LE(80);
console.log(`file ${path}  tris ${n}`);
const REC = 50;
const TWO_PI = Math.PI * 2;

const dTh = (a, b) => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };

// pass 1: per-triangle metrics
let nBlade = 0, nNegPar = 0, nNegParBlade = 0, nInwardNormal = 0, nInwardBlade = 0;
const blades = [];           // {i, ar, L, S, negPar, radDot}
const hist = new Map();      // AR decade histogram
const negParList = [];

const V = new Float64Array(9);
function readTri(i) {
  const o = 84 + i * REC + 12;
  for (let k = 0; k < 9; k += 1) V[k] = buf.readFloatLE(o + k * 4);
}

for (let i = 0; i < n; i += 1) {
  readTri(i);
  const ax = V[0], ay = V[1], az = V[2];
  const bx = V[3], by = V[4], bz = V[5];
  const cx = V[6], cy = V[7], cz = V[8];
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const wx = cx - ax, wy = cy - ay, wz = cz - az;
  const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
  const nl = Math.hypot(nx, ny, nz);
  const area = 0.5 * nl;
  const per = e0 + e1 + e2;
  const L = Math.max(e0, e1, e2);
  const S = Math.min(e0, e1, e2);
  // AR = longest / (2 * inradius); inradius = 2*area/perimeter
  const ar = area > 0 ? (L * per) / (4 * area) : Infinity;

  // parametric winding in (theta,z) with shortest-arc deltas anchored at A
  const tA = Math.atan2(ay, ax), tB = Math.atan2(by, bx), tC = Math.atan2(cy, cx);
  const dB = dTh(tA, tB), dC = dTh(tA, tC);
  const sPar = dB * (cz - az) - (bz - az) * dC;  // 2 * signed area in (theta,z)
  // radial component of the facet normal (analytic surface always has n.rhat = r > 0)
  const gx = (ax + bx + cx) / 3, gy = (ay + by + cy) / 3;
  const gr = Math.hypot(gx, gy);
  const radDot = gr > 0 ? (nx * gx + ny * gy) / (nl * gr) : 0;

  if (sPar < 0) { nNegPar += 1; if (negParList.length < 4000) negParList.push(i); }
  if (radDot < 0) nInwardNormal += 1;
  const d = ar >= 1 ? Math.floor(Math.log10(ar)) : -1;
  hist.set(d, (hist.get(d) ?? 0) + 1);
  if (ar > AR_T) {
    nBlade += 1;
    if (sPar < 0) nNegParBlade += 1;
    if (radDot < 0) nInwardBlade += 1;
    if (blades.length < 400000) blades.push({ i, ar, L, S, sPar, radDot, area });
  }
}

console.log(`\n=== GLOBAL ===`);
console.log(`AR > ${AR_T}                 : ${nBlade}  (${(100 * nBlade / n).toFixed(3)}%)`);
console.log(`PARAMETRIC FOLD (signed area(theta,z) < 0) : ${nNegPar}  (${(100 * nNegPar / n).toFixed(4)}%)`);
console.log(`  ... of which AR>${AR_T}    : ${nNegParBlade}`);
console.log(`facet normal radially INWARD (n.rhat<0)    : ${nInwardNormal}  (${(100 * nInwardNormal / n).toFixed(4)}%)`);
console.log(`  ... of which AR>${AR_T}    : ${nInwardBlade}`);
console.log(`AR decade histogram (log10 floor -> count):`);
for (const d of [...hist.keys()].sort((a, b) => a - b)) console.log(`   1e${d}: ${hist.get(d)}`);

blades.sort((a, b) => b.ar - a.ar);
console.log(`\n=== WORST 25 BY AR ===`);
console.log('  idx        AR        L(um)      S(um)   area(um^2)  parSign  n.rhat');
for (const b of blades.slice(0, 25)) {
  console.log(`  ${String(b.i).padStart(8)} ${b.ar.toExponential(3)} ${(b.L * 1000).toFixed(1).padStart(10)} ${(b.S * 1000).toFixed(3).padStart(10)} ${(b.area * 1e6).toExponential(2)}  ${b.sPar < 0 ? 'NEG' : 'pos'}  ${b.radDot.toFixed(3)}`);
}

// index-stride structure among blades
console.log(`\n=== INDEX STRIDE STRUCTURE (consecutive blade index deltas) ===`);
const idx = blades.map((b) => b.i).sort((a, b) => a - b);
const strideHist = new Map();
for (let k = 1; k < idx.length; k += 1) {
  const d = idx[k] - idx[k - 1];
  if (d <= 64) strideHist.set(d, (strideHist.get(d) ?? 0) + 1);
}
const top = [...strideHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [d, c] of top) console.log(`   delta ${String(d).padStart(3)} : ${c}`);

console.log(`\n=== BLADE MODULO-6 PHASE ===`);
const ph = new Array(6).fill(0);
for (const i of idx) ph[i % 6] += 1;
console.log('  ' + ph.map((v, k) => `${k}:${v}`).join('  '));
