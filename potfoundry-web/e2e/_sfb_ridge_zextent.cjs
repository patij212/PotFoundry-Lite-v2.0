// _sfb_ridge_zextent.cjs — confirm the corridor RIDGE CREASE z-extent. A petal ridge is a
// near-vertical chain of high-dihedral edges (the smooth corridor crease). For each such
// "ridge edge" (dih>40, and roughly meridional: |dz| dominant over the edge), record its
// z midpoint. If the corridor covers t in [0.05,0.95] only, the ridge crease edges should
// densely populate z in [6,114] and DROP OFF outside → the tips z<6 / z>114 have NO
// coherent ridge (they reverted to per-cell). Also: for each of the N petal meridians,
// find the min & max z of its ridge edges (where does the smooth crease start/stop).
// Usage: node --max-old-space-size=6144 e2e/_sfb_ridge_zextent.cjs
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
  return { nTri, nV: vx.length, vx, vy, vz, tri };
}
const m = readWeld(FILE); const { nTri, nV, vx, vy, vz, tri } = m;
const sub = (a, b) => [vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const hyp = (a) => Math.hypot(a[0], a[1], a[2]);
const MULT = 1e8; const ek = (i, j) => (i < j ? i * MULT + j : j * MULT + i);
const fnx = new Float64Array(nTri), fny = new Float64Array(nTri), fnz = new Float64Array(nTri);
for (let t = 0; t < nTri; t++) { const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2]; const n = cross(sub(b, a), sub(c, a)); const nl = hyp(n) || 1; fnx[t] = n[0] / nl; fny[t] = n[1] / nl; fnz[t] = n[2] / nl; }
const edgeFaces = new Map();
for (let t = 0; t < nTri; t++) { const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2]; for (const [i, j] of [[a, b], [b, c], [c, a]]) { const k = ek(i, j); const l = edgeFaces.get(k); if (l) l.push(t); else edgeFaces.set(k, [t]); } }

// ridge edges: dih>40 AND meridional (|dz| >= 0.5*edgeLen, i.e. mostly vertical).
const ridge = []; // {z, th}
for (const [k, fl] of edgeFaces) {
  if (fl.length !== 2) continue; const i = Math.floor(k / MULT), j = k % MULT;
  const dih = Math.acos(Math.max(-1, Math.min(1, fnx[fl[0]] * fnx[fl[1]] + fny[fl[0]] * fny[fl[1]] + fnz[fl[0]] * fnz[fl[1]]))) * 180 / Math.PI;
  if (dih < 40) continue;
  const dz = Math.abs(vz[i] - vz[j]), el = Math.hypot(vx[i] - vx[j], vy[i] - vy[j], vz[i] - vz[j]) || 1;
  if (dz / el < 0.5) continue; // not meridional
  const mz = (vz[i] + vz[j]) / 2, mth = (Math.atan2((vy[i] + vy[j]) / 2, (vx[i] + vx[j]) / 2) + 2 * Math.PI) % (2 * Math.PI);
  ridge.push({ z: mz, th: mth });
}
// z-histogram of meridional ridge edges, 2mm bins
const NB = 60; const h = new Int32Array(NB);
for (const r of ridge) h[Math.min(NB - 1, Math.floor(r.z / 2))]++;
console.log(`tris=${nTri} verts=${nV}  meridional ridge-crease edges (dih>40, vertical)=${ridge.length}`);
console.log(`covered band per t-clip = z[6,114]. Histogram of ridge edges (2mm bins):`);
let line = '';
for (let b = 0; b < NB; b++) { const z = b * 2; const mark = (z < 6 || z >= 114) ? '*TIP*' : ''; line += `${String(z).padStart(3)}:${String(h[b]).padStart(3)}${mark ? '!' : ' '} `; if ((b + 1) % 6 === 0) { console.log('  ' + line); line = ''; } }
if (line) console.log('  ' + line);
// summary: ridge edges in tip bands vs covered
let tip = 0, cov = 0; for (const r of ridge) { if (r.z < 6 || r.z >= 114) tip++; else cov++; }
console.log(`\nridge-crease edges:  TIP(z<6 or z>=114)=${tip}   COVERED[6,114]=${cov}   tip-fraction=${(100 * tip / Math.max(1, tip + cov)).toFixed(1)}%`);
// where does the lowest/highest ridge edge sit (does the crease reach the rim)?
let zmin = 999, zmax = -1; for (const r of ridge) { if (r.z < zmin) zmin = r.z; if (r.z > zmax) zmax = r.z; }
console.log(`ridge-crease z-extent: min=${zmin.toFixed(2)} max=${zmax.toFixed(2)}  (wall is z[0,${H}])`);
// density per mm covered vs the 0-6 and 114-120 tips
const covLen = 114 - 6, tipLen = 12;
console.log(`density: covered=${(cov / covLen).toFixed(1)} edges/mm   tip=${(tip / tipLen).toFixed(1)} edges/mm`);
