// _diag_tip_serration.cjs — quantify ridge-tip serration vs mid-wall on the
// structured-ridge SFB wall. Bands the outer petal wall into TIP zones (z>114
// near rim t=1, z<6 near base t=0) and the MID zone (6<=z<=114, corridor-covered),
// then reports min-angle sliver fraction + dihedral roughness per zone. If the
// corridor t-clip [0.05,0.95] reverts the tips to per-cell staircase, the TIP
// zones show markedly worse %<20deg and more sharp dihedral flips than MID.
// Usage: node --max-old-space-size=6144 e2e/_diag_tip_serration.cjs [stlPath]
const fs = require('fs');
const path = require('path');
const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_structured_p3b.stl');
const buf = fs.readFileSync(STL);
const nTri = buf.readUInt32LE(80);
console.log(`[tip-diag] ${path.basename(STL)} tris=${nTri}`);

const Q = 1e4;
const key = (x, y, z) => `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
const vmap = new Map();
const vx = [], vy = [], vz = [];
const tri = new Int32Array(nTri * 3);
let off = 84;
const idOf = (x, y, z) => { const k = key(x, y, z); let id = vmap.get(k); if (id === undefined) { id = vx.length; vmap.set(k, id); vx.push(x); vy.push(y); vz.push(z); } return id; };
for (let t = 0; t < nTri; t++) { const b = off + 12; for (let c = 0; c < 3; c++) { const o = b + c * 12; tri[t * 3 + c] = idOf(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)); } off += 50; }
const nV = vx.length;

const sub = (a, b) => [vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]];
function ang(o1, o2, op) { return Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - op * op) / (2 * o1 * o2)))) * 180 / Math.PI; }
function ekey(i, j) { return i < j ? `${i}:${j}` : `${j}:${i}`; }

// zones keyed by triangle-centroid z, OUTER petal wall only (cr>42).
// RIM-TIP: 114<z<120 ; BASE-TIP: 0<z<6 ; MID: 6<=z<=114.
const Z = { rimTip: [114, 120], baseTip: [0, 6], mid: [6, 114] };
const stat = { rimTip: [0, 0, 0, 0], baseTip: [0, 0, 0, 0], mid: [0, 0, 0, 0] }; // <5,<15,<20,total
const dih = { rimTip: [], baseTip: [], mid: [] };
const edgeFaceN = new Map(); // key -> {n, zone}

function zoneOf(z) { if (z > 114 && z < 120.0001) return 'rimTip'; if (z >= 0 && z < 6) return 'baseTip'; if (z >= 6 && z <= 114) return 'mid'; return null; }

for (let t = 0; t < nTri; t++) {
  const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
  const ccx = (vx[a] + vx[b] + vx[c]) / 3, ccy = (vy[a] + vy[b] + vy[c]) / 3, ccz = (vz[a] + vz[b] + vz[c]) / 3;
  const cr = Math.hypot(ccx, ccy);
  if (!(cr > 42)) continue; // outer petal wall only
  const zone = zoneOf(ccz);
  if (!zone) continue;
  const A = Math.hypot(...sub(b, c)), B = Math.hypot(...sub(c, a)), C = Math.hypot(...sub(a, b));
  if (A < 1e-9 || B < 1e-9 || C < 1e-9) continue;
  const m = Math.min(ang(B, C, A), ang(A, C, B), ang(A, B, C));
  const s = stat[zone]; s[3]++; if (m < 20) s[2]++; if (m < 15) s[1]++; if (m < 5) s[0]++;
  const n = (() => { const u = sub(b, a), v = sub(c, a); const nn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const l = Math.hypot(...nn) || 1; return [nn[0] / l, nn[1] / l, nn[2] / l]; })();
  for (const [i, j] of [[a, b], [b, c], [c, a]]) {
    const k = ekey(i, j); const prev = edgeFaceN.get(k);
    if (prev === undefined) edgeFaceN.set(k, { n, zone });
    else { const d = Math.acos(Math.max(-1, Math.min(1, prev.n[0] * n[0] + prev.n[1] * n[1] + prev.n[2] * n[2]))) * 180 / Math.PI; if (dih[zone]) dih[zone].push(d); }
  }
}
function pct(arr, p) { if (!arr.length) return NaN; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
for (const z of ['baseTip', 'mid', 'rimTip']) {
  const s = stat[z]; const d = dih[z];
  const sharp = d.filter((x) => x > 30).length;
  console.log(`[${z}] tris=${s[3]} %<20=${(100 * s[2] / s[3]).toFixed(2)} %<15=${(100 * s[1] / s[3]).toFixed(2)} %<5=${(100 * s[0] / s[3]).toFixed(2)} | dihedral n=${d.length} >30deg=${(100 * sharp / Math.max(1, d.length)).toFixed(2)}% p99=${pct(d, 0.99).toFixed(1)} max=${pct(d, 1).toFixed(1)}`);
}
