// _sfb_serration_zoom.cjs — drill into the WALL (P3b) tip region. The t-clip keeps the
// corridor only for t in [0.05,0.95] → z in [6,114]. Below 6 / above 114 the per-cell
// staircase reverts. Test: bin rough-crease edges (dih>25) and slivers at 2mm z-resolution
// near both tips, and measure the dihedral DISTRIBUTION + sawtooth sign-alternation as a
// function of z. A corridor ridge = ONE coherent monotone high-dihedral crease per petal
// per row (few edges, aligned). A per-cell staircase = MANY high-dihedral edges with
// ALTERNATING sign (zig-zag) at every cell boundary. Compares t<0.05 / t>0.95 band vs the
// adjacent covered band.  Usage: node --max-old-space-size=6144 e2e/_sfb_serration_zoom.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'export-deliverables');
const FILE = path.join(OUT, 'SuperformulaBlossom_sf1_structured_p3b.stl');
const H = 120;

function readWeld(file) {
  const buf = fs.readFileSync(file); const nTri = buf.readUInt32LE(80); const Q = 1e4;
  const key = (x, y, z) => `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
  const idOf = new Map(); const vx = [], vy = [], vz = []; const tri = new Int32Array(nTri * 3); let off = 84;
  const vid = (x, y, z) => { const k = key(x, y, z); let i = idOf.get(k); if (i === undefined) { i = vx.length; idOf.set(k, i); vx.push(x); vy.push(y); vz.push(z); } return i; };
  for (let t = 0; t < nTri; t++) { const b = off + 12; for (let c = 0; c < 3; c++) { const o = b + c * 12; tri[t * 3 + c] = vid(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)); } off += 50; }
  return { nTri, nV: vx.length, vx, vy, vz, tri };
}
const m = readWeld(FILE);
const { nTri, nV, vx, vy, vz, tri } = m;
const sub = (a, b) => [vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const hyp = (a) => Math.hypot(a[0], a[1], a[2]);
const MULT = 1e8; const ek = (i, j) => (i < j ? i * MULT + j : j * MULT + i);
function minAngle(a, b, c) { const d = (p, q) => Math.hypot(vx[p] - vx[q], vy[p] - vy[q], vz[p] - vz[q]); const A = d(b, c), B = d(c, a), C = d(a, b); if (A < 1e-9 || B < 1e-9 || C < 1e-9) return 0; const law = (x, y, op) => Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - op * op) / (2 * x * y)))) * 180 / Math.PI; return Math.min(law(B, C, A), law(A, C, B), law(A, B, C)); }

const fnx = new Float64Array(nTri), fny = new Float64Array(nTri), fnz = new Float64Array(nTri), fcz = new Float64Array(nTri);
for (let t = 0; t < nTri; t++) { const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2]; const n = cross(sub(b, a), sub(c, a)); const nl = hyp(n) || 1; fnx[t] = n[0] / nl; fny[t] = n[1] / nl; fnz[t] = n[2] / nl; fcz[t] = (vz[a] + vz[b] + vz[c]) / 3; }
const edgeFaces = new Map();
for (let t = 0; t < nTri; t++) { const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2]; for (const [i, j] of [[a, b], [b, c], [c, a]]) { const k = ek(i, j); const l = edgeFaces.get(k); if (l) l.push(t); else edgeFaces.set(k, [t]); } }

// 2mm-resolution z scan over [0,12] and [108,120]: rough-edge count, sliver count, and
// the "directional dihedral" (signed by radial bend) so we can see sign-alternation.
function scanBand(zlo, zhi, dz, lbl) {
  const NB = Math.round((zhi - zlo) / dz);
  const rough = new Int32Array(NB), tot = new Int32Array(NB), bigDih = new Float64Array(NB);
  for (const [k, fl] of edgeFaces) {
    if (fl.length !== 2) continue; const i = Math.floor(k / MULT), j = k % MULT; const mz = (vz[i] + vz[j]) / 2;
    if (mz < zlo || mz >= zhi) continue; const t0 = fl[0], t1 = fl[1];
    const dih = Math.acos(Math.max(-1, Math.min(1, fnx[t0] * fnx[t1] + fny[t0] * fny[t1] + fnz[t0] * fnz[t1]))) * 180 / Math.PI;
    const bi = Math.min(NB - 1, Math.floor((mz - zlo) / dz)); tot[bi]++; if (dih > 25) rough[bi]++; if (dih > bigDih[bi]) bigDih[bi] = dih;
  }
  // sliver per band
  const sliv = new Int32Array(NB);
  for (let t = 0; t < nTri; t++) { const z = fcz[t]; if (z < zlo || z >= zhi) continue; const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2]; if (minAngle(a, b, c) < 10) sliv[Math.min(NB - 1, Math.floor((z - zlo) / dz))]++; }
  console.log(`\n  [${lbl}] z=${zlo}..${zhi} (${dz}mm bins)  format z-range: rough/total(rough%)  maxDih  slivers`);
  for (let b = 0; b < NB; b++) { const zl = zlo + b * dz; console.log(`    ${zl.toFixed(0).padStart(3)}-${(zl + dz).toFixed(0).padStart(3)}: ${String(rough[b]).padStart(4)}/${String(tot[b]).padStart(4)} (${(100 * rough[b] / Math.max(1, tot[b])).toFixed(0).padStart(2)}%)  maxDih=${bigDih[b].toFixed(0).padStart(3)}  sliv=${sliv[b]}`); }
}
console.log(`tris=${nTri} verts=${nV}`);
console.log(`t-clip → covered z=[6,114].  t<0.05 ⇒ z<6 ;  t>0.95 ⇒ z>114  are the suspected revert bands.`);
scanBand(0, 14, 2, 'BASE TIP');
scanBand(106, 120, 2, 'RIM TIP');

// Mid-wall control band for the staircase baseline (covered region, should be smooth crease).
scanBand(56, 64, 2, 'MID CONTROL');
