// _sfb_stair_vs_clean.cjs — distinguish STAIRCASE (per-cell revert) from CLEAN corridor
// crease, as a function of z, by measuring per-petal ridge-APEX theta JITTER. The petal
// ridge is the local-max radius meridian. In a CLEAN corridor the apex theta is a smooth
// monotone curve in z (the explicit feature edge). In a per-cell staircase the apex theta
// ZIG-ZAGS row-to-row (the ridge crosses cell diagonals). We sample the welded wall by
// horizontal z-slabs (1mm), find the radial-max vertex within each petal sector, and
// report the row-to-row theta SECOND DIFFERENCE (curvature/jitter) — high jitter = staircase.
// Compares the tip bands z<6 / z>114 with the covered interior.
// Usage: node --max-old-space-size=6144 e2e/_sfb_stair_vs_clean.cjs
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_structured_p3b.stl');
const H = 120;
function readWeld(file) {
  const buf = fs.readFileSync(file); const nTri = buf.readUInt32LE(80); const Q = 1e4;
  const key = (x, y, z) => `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
  const idOf = new Map(); const vx = [], vy = [], vz = []; const tri = new Int32Array(nTri * 3); let off = 84;
  const vid = (x, y, z) => { const k = key(x, y, z); let i = idOf.get(k); if (i === undefined) { i = vx.length; idOf.set(k, i); vx.push(x); vy.push(y); vz.push(z); } return i; };
  for (let t = 0; t < nTri; t++) { const b = off + 12; for (let c = 0; c < 3; c++) { const o = b + c * 12; tri[t * 3 + c] = vid(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)); } off += 50; }
  return { nV: vx.length, vx, vy, vz };
}
const { nV, vx, vy, vz } = readWeld(FILE);
// First find petal count via the radial profile at mid-height: sample r(theta) at z=60.
const NPHI = 720;
function rProfileAt(z0, dz) {
  const r = new Float64Array(NPHI).fill(0);
  for (let v = 0; v < nV; v++) { if (Math.abs(vz[v] - z0) > dz) continue; const th = (Math.atan2(vy[v], vx[v]) + 2 * Math.PI) % (2 * Math.PI); const bi = Math.min(NPHI - 1, Math.floor(th / (2 * Math.PI) * NPHI)); const rr = Math.hypot(vx[v], vy[v]); if (rr > r[bi]) r[bi] = rr; }
  return r;
}
const rp = rProfileAt(60, 1.5);
// count petals = local maxima in r(theta) above mean
let mean = 0, cnt = 0; for (const x of rp) if (x > 0) { mean += x; cnt++; } mean /= cnt;
const peaks = [];
for (let i = 0; i < NPHI; i++) { const v = rp[i]; if (v < mean) continue; const lo = rp[(i - 1 + NPHI) % NPHI], hi = rp[(i + 1) % NPHI]; if (v >= lo && v > hi) peaks.push(i / NPHI * 2 * Math.PI); }
// merge close peaks
const mp = []; for (const p of peaks) { if (mp.length && Math.min(Math.abs(p - mp[mp.length - 1]), 2 * Math.PI - Math.abs(p - mp[mp.length - 1])) < 0.15) continue; mp.push(p); }
const NPETAL = mp.length;
console.log(`detected ${NPETAL} petals; apex thetas(deg)=${mp.map((p) => (p * 180 / Math.PI).toFixed(0)).join(',')}`);

// For each 1mm z-slab, for each petal sector, find the max-radius theta (apex). Track per
// petal the apex-theta sequence in z; compute row-to-row |2nd difference| (jitter) in deg.
const NZ = 120; const dz = 0.6;
const apex = Array.from({ length: NPETAL }, () => new Float64Array(NZ).fill(NaN));
const sectorHalf = Math.PI / NPETAL; // sector around each petal apex
for (let zi = 0; zi < NZ; zi++) {
  const z0 = (zi + 0.5) * (H / NZ);
  // bucket verts in this slab by nearest petal
  const best = new Array(NPETAL).fill(-1); const bestR = new Array(NPETAL).fill(-1);
  for (let v = 0; v < nV; v++) {
    if (Math.abs(vz[v] - z0) > dz) continue;
    const th = (Math.atan2(vy[v], vx[v]) + 2 * Math.PI) % (2 * Math.PI); const rr = Math.hypot(vx[v], vy[v]);
    // nearest petal
    let pk = -1, pd = 9; for (let k = 0; k < NPETAL; k++) { const a = Math.abs(th - mp[k]); const d = Math.min(a, 2 * Math.PI - a); if (d < pd) { pd = d; pk = k; } }
    if (pd > sectorHalf) continue;
    if (rr > bestR[pk]) { bestR[pk] = rr; best[pk] = th; }
  }
  for (let k = 0; k < NPETAL; k++) if (best[k] >= 0) apex[k][zi] = best[k];
}
function jitterBand(zlo, zhi) {
  let sum = 0, n = 0, mx = 0;
  for (let k = 0; k < NPETAL; k++) {
    for (let zi = 1; zi < NZ - 1; zi++) {
      const z0 = (zi + 0.5) * (H / NZ); if (z0 < zlo || z0 >= zhi) continue;
      const a = apex[k][zi - 1], b = apex[k][zi], c = apex[k][zi + 1]; if (isNaN(a) || isNaN(b) || isNaN(c)) continue;
      const un = (x, ref) => { let d = ((x - ref + Math.PI) % (2 * Math.PI)) - Math.PI; return ref + d; };
      const bb = un(b, a), cc = un(c, bb); const d2 = Math.abs(cc - 2 * bb + a) * 180 / Math.PI; // deg
      sum += d2; n++; if (d2 > mx) mx = d2;
    }
  }
  return { mean: sum / Math.max(1, n), max: mx, n };
}
const base = jitterBand(0, 6), rim = jitterBand(114, 120), interior = jitterBand(6, 114);
const baseEdge = jitterBand(0, 12), rimEdge = jitterBand(108, 120);
console.log(`\napex-theta row-to-row 2nd-difference JITTER (deg) — high = staircase zig-zag, low = clean crease:`);
console.log(`  BASE  z<6     : mean=${base.mean.toFixed(2)}  max=${base.max.toFixed(2)}  (n=${base.n})`);
console.log(`  RIM   z>114   : mean=${rim.mean.toFixed(2)}  max=${rim.max.toFixed(2)}  (n=${rim.n})`);
console.log(`  INTERIOR 6-114: mean=${interior.mean.toFixed(2)}  max=${interior.max.toFixed(2)}  (n=${interior.n})`);
console.log(`  (wider) BASE z<12 : mean=${baseEdge.mean.toFixed(2)} max=${baseEdge.max.toFixed(2)}`);
console.log(`  (wider) RIM z>108 : mean=${rimEdge.mean.toFixed(2)} max=${rimEdge.max.toFixed(2)}`);
console.log(`\nratio tip/interior jitter:  base/int=${(base.mean / interior.mean).toFixed(2)}x   rim/int=${(rim.mean / interior.mean).toFixed(2)}x`);
