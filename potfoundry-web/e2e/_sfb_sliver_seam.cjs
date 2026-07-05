// _sfb_sliver_seam.cjs — locate the WALL slivers (minAngle<10) precisely in z at 1mm
// resolution, to test whether they cluster at the corridor↔per-cell TRANSITION seams
// z≈6 (t=0.05) and z≈114 (t=0.95), vs spread through the interior. Reports the count in
// the 4mm window straddling each clip boundary [4,8] & [112,116] vs the rest of the
// interior, and the worst-sliver z. Usage: node --max-old-space-size=6144 e2e/_sfb_sliver_seam.cjs
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
  return { nTri, vx, vy, vz, tri };
}
const { nTri, vx, vy, vz, tri } = readWeld(FILE);
function minAngle(a, b, c) { const d = (p, q) => Math.hypot(vx[p] - vx[q], vy[p] - vy[q], vz[p] - vz[q]); const A = d(b, c), B = d(c, a), C = d(a, b); if (A < 1e-9 || B < 1e-9 || C < 1e-9) return 0; const law = (x, y, op) => Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - op * op) / (2 * x * y)))) * 180 / Math.PI; return Math.min(law(B, C, A), law(A, C, B), law(A, B, C)); }
const NZ = 120; const h = new Int32Array(NZ); let total = 0;
let clipWin = 0, interiorRest = 0, tipBeyond = 0;
let worst = 99, worstZ = -1;
for (let t = 0; t < nTri; t++) {
  const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2]; const ang = minAngle(a, b, c);
  if (ang >= 10) continue; const z = (vz[a] + vz[b] + vz[c]) / 3;
  total++; h[Math.min(NZ - 1, Math.floor(z))]++; if (ang < worst) { worst = ang; worstZ = z; }
  const nearClip = (z >= 4 && z <= 8) || (z >= 112 && z <= 116);
  const beyond = z < 4 || z > 116;
  if (nearClip) clipWin++; else if (beyond) tipBeyond++; else interiorRest++;
}
console.log(`wall slivers (minAngle<10) total=${total}  worst=${worst.toFixed(2)}deg at z=${worstZ.toFixed(1)}`);
console.log(`\n1mm z-histogram (only nonzero bins):`);
let s = '';
for (let z = 0; z < NZ; z++) if (h[z]) { s += `${String(z).padStart(3)}:${h[z]} `; if (s.length > 96) { console.log('  ' + s); s = ''; } }
if (s) console.log('  ' + s);
console.log(`\nCLIP-SEAM windows [4,8]∪[112,116] = ${clipWin} (${(100 * clipWin / total).toFixed(1)}%)`);
console.log(`BEYOND tips z<4 ∪ z>116        = ${tipBeyond} (${(100 * tipBeyond / total).toFixed(1)}%)`);
console.log(`INTERIOR rest [8,112]          = ${interiorRest} (${(100 * interiorRest / total).toFixed(1)}%)`);
// peak bin
let pk = 0, pkz = 0; for (let z = 0; z < NZ; z++) if (h[z] > pk) { pk = h[z]; pkz = z; }
console.log(`peak sliver bin: z=${pkz}-${pkz + 1} with ${pk} slivers`);
