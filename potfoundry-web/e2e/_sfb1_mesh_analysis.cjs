// SFB@1 STL mesh analysis — pinpoint the "topology serration" the user sees. Welds a
// binary STL, then measures, with NO rendering:
//   (1) PROTRUSION: each vertex's signed distance from its 1-ring neighbours' centroid
//       along the vertex normal, in mm and normalised by local edge length. A field of
//       real geometric SPIKES => many vertices protrude; on-surface slivers => ~0.
//   (2) DIHEDRAL: angle between adjacent face normals — the sharp feature-edge structure.
//   (3) MIN-ANGLE (3D): the sliver fraction.
//   (4) ANISOTROPY: triangle longest/shortest edge ratio (u-stretch from uBias).
// Usage: node e2e/_sfb1_mesh_analysis.cjs [stlPath]
//   default: export-deliverables/SuperformulaBlossom_sf1_corrected_uBias2.stl
const fs = require('fs');
const path = require('path');

const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_corrected_uBias2.stl');
const buf = fs.readFileSync(STL);
const nTri = buf.readUInt32LE(80);
console.log(`[analysis] ${path.basename(STL)} tris=${nTri}`);

// ── Weld vertices (the STL stores 3 dup verts/face). Quantise to 1e-4 mm. ──
const Q = 1e4;
const key = (x, y, z) => `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
const vmap = new Map();
const vx = [], vy = [], vz = [];
const tri = new Int32Array(nTri * 3);
let off = 84;
const idOf = (x, y, z) => {
  const k = key(x, y, z); let id = vmap.get(k);
  if (id === undefined) { id = vx.length; vmap.set(k, id); vx.push(x); vy.push(y); vz.push(z); }
  return id;
};
for (let t = 0; t < nTri; t++) {
  const b = off + 12;
  for (let c = 0; c < 3; c++) {
    const o = b + c * 12;
    tri[t * 3 + c] = idOf(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8));
  }
  off += 50;
}
const nV = vx.length;
console.log(`[analysis] welded verts=${nV} (from ${nTri * 3} face-verts)`);

// ── Per-vertex 1-ring (neighbour set) + incident face normals (area-weighted). ──
const nbr = Array.from({ length: nV }, () => new Set());
const vnx = new Float64Array(nV), vny = new Float64Array(nV), vnz = new Float64Array(nV);
const sub = (a, b) => [vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]];
function triNormal(a, b, c) {
  const u = sub(b, a), v = sub(c, a);
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}
// edge -> face normals (for dihedral) + min-angle + anisotropy accumulators.
const edgeFaceN = new Map(); // "i:j" -> [nx,ny,nz] of first face; on second, compute dihedral
const dihedrals = [];
let minA = [0, 0, 0, 0]; // <5,<15,<20,total counts for 3D min angle (full mesh)
let outerA = [0, 0, 0, 0]; // same, OUTER PETAL WALL only
let aniso = []; // edge-length ratio per tri (sampled)
function ekey(i, j) { return i < j ? `${i}:${j}` : `${j}:${i}`; }
function ang(o1, o2, op) { return Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - op * op) / (2 * o1 * o2)))) * 180 / Math.PI; }
for (let t = 0; t < nTri; t++) {
  const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
  nbr[a].add(b); nbr[a].add(c); nbr[b].add(a); nbr[b].add(c); nbr[c].add(a); nbr[c].add(b);
  const n = triNormal(a, b, c);
  const nl = Math.hypot(n[0], n[1], n[2]) || 1;
  const un = [n[0] / nl, n[1] / nl, n[2] / nl];
  for (const vId of [a, b, c]) { vnx[vId] += n[0]; vny[vId] += n[1]; vnz[vId] += n[2]; }
  // dihedral via shared edges
  for (const [i, j] of [[a, b], [b, c], [c, a]]) {
    const k = ekey(i, j); const prev = edgeFaceN.get(k);
    if (prev === undefined) edgeFaceN.set(k, un);
    else { const d = Math.acos(Math.max(-1, Math.min(1, prev[0] * un[0] + prev[1] * un[1] + prev[2] * un[2]))) * 180 / Math.PI; dihedrals.push(d); }
  }
  // min angle (3D) — full mesh AND outer-petal-wall-only (centroid r>42, z in [8,112]:
  // excludes the smooth inner cylinder r~36 and the flat base/rim caps).
  const A = Math.hypot(...sub(b, c)), B = Math.hypot(...sub(c, a)), C = Math.hypot(...sub(a, b));
  if (A > 1e-9 && B > 1e-9 && C > 1e-9) {
    const m = Math.min(ang(B, C, A), ang(A, C, B), ang(A, B, C));
    minA[3]++; if (m < 20) minA[2]++; if (m < 15) minA[1]++; if (m < 5) minA[0]++;
    const lo = Math.min(A, B, C), hi = Math.max(A, B, C);
    if ((t & 7) === 0) aniso.push(hi / Math.max(1e-9, lo)); // sample 1/8
    const ccx = (vx[a] + vx[b] + vx[c]) / 3, ccy = (vy[a] + vy[b] + vy[c]) / 3, ccz = (vz[a] + vz[b] + vz[c]) / 3;
    const cr = Math.hypot(ccx, ccy);
    if (cr > 42 && ccz > 8 && ccz < 112) {
      outerA[3]++; if (m < 20) outerA[2]++; if (m < 15) outerA[1]++; if (m < 5) outerA[0]++;
    }
  }
}

// ── Protrusion: vertex distance from 1-ring centroid along the vertex normal (mm) +
//    normalised by mean 1-ring edge length. ──
let protMm = [], protNorm = [];
let pMaxMm = 0, pAbsSumMm = 0, pCount = 0;
for (let v = 0; v < nV; v++) {
  const ns = nbr[v]; if (ns.size < 3) continue;
  let cx = 0, cy = 0, cz = 0, eLen = 0;
  for (const u of ns) { cx += vx[u]; cy += vy[u]; cz += vz[u]; eLen += Math.hypot(vx[u] - vx[v], vy[u] - vy[v], vz[u] - vz[v]); }
  const k = ns.size; cx /= k; cy /= k; cz /= k; eLen /= k;
  let nl = Math.hypot(vnx[v], vny[v], vnz[v]) || 1;
  const d = ((vx[v] - cx) * vnx[v] + (vy[v] - cy) * vny[v] + (vz[v] - cz) * vnz[v]) / nl;
  const ad = Math.abs(d);
  protMm.push(ad); protNorm.push(ad / Math.max(1e-9, eLen));
  pAbsSumMm += ad; pCount++; if (ad > pMaxMm) pMaxMm = ad;
}
function pct(arr, p) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
const dihSharp = dihedrals.filter((d) => d > 30).length;

console.log(`\n[PROTRUSION] (geometric spike test — real spikes => large; on-surface slivers => ~0)`);
console.log(`  mm:   mean=${(pAbsSumMm / pCount).toFixed(4)} p50=${pct(protMm, 0.5).toFixed(4)} p99=${pct(protMm, 0.99).toFixed(4)} p999=${pct(protMm, 0.999).toFixed(4)} max=${pMaxMm.toFixed(4)} (n=${pCount})`);
console.log(`  /edge: p50=${pct(protNorm, 0.5).toFixed(3)} p99=${pct(protNorm, 0.99).toFixed(3)} p999=${pct(protNorm, 0.999).toFixed(3)} max=${Math.max(...protNorm.slice(0, 1)).toFixed?.(3) ?? ''}`);
console.log(`  vertices protruding >0.05mm: ${protMm.filter((x) => x > 0.05).length} (${(100 * protMm.filter((x) => x > 0.05).length / pCount).toFixed(2)}%), >0.1mm: ${protMm.filter((x) => x > 0.1).length}`);
console.log(`\n[DIHEDRAL] sharedEdges=${dihedrals.length} >30deg=${dihSharp} (${(100 * dihSharp / dihedrals.length).toFixed(2)}%) p50=${pct(dihedrals, 0.5).toFixed(1)} p99=${pct(dihedrals, 0.99).toFixed(1)} max=${pct(dihedrals, 1).toFixed(1)}`);
console.log(`[MIN-ANGLE 3D full] tris=${minA[3]} <20=${(100 * minA[2] / minA[3]).toFixed(1)}% <15=${(100 * minA[1] / minA[3]).toFixed(1)}% <5=${(100 * minA[0] / minA[3]).toFixed(1)}%`);
console.log(`[MIN-ANGLE 3D OUTER-WALL] tris=${outerA[3]} <20=${(100 * outerA[2] / outerA[3]).toFixed(1)}% <15=${(100 * outerA[1] / outerA[3]).toFixed(1)}% <5=${(100 * outerA[0] / outerA[3]).toFixed(1)}%`);
console.log(`[ANISOTROPY] edge-len ratio (hi/lo) p50=${pct(aniso, 0.5).toFixed(2)} p90=${pct(aniso, 0.9).toFixed(2)} p99=${pct(aniso, 0.99).toFixed(2)} max=${pct(aniso, 1).toFixed(1)}`);
