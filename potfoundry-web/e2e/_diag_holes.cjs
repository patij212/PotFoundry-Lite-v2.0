// _diag_holes.cjs — HOLES + VALLEY CHORD-BRIDGING diagnostic for SFB@1 outer wall.
//
// User report: "the mesh doesn't fill the holes between the serrations ... the density
// looks ok but the vertices do not lie on the actual surface defined by the math model."
//
// This script:
//  (1) WELD + edge->triangle adjacency. Count BOUNDARY (1-tri) + NON-MANIFOLD (>2-tri)
//      edges and report their (theta,z) locations — are there literal holes at valleys?
//  (2) Port the TRUE analytic SuperformulaBlossom R(theta,z) (literal port of styles.wgsl
//      / styles.ts at sf_strength=1, defaults). Cross-check at smooth vertices (<0.05mm).
//  (3) VERTEX-ON-SURFACE gap: each welded vertex vs true R(theta,z). The STL was built
//      from a 512x512 bilinear sampler grid, so reproduce that grid to separate the
//      "sampler quantization" gap from the analytic surface.
//  (4) VALLEY CHORD-BRIDGING: for each outer-wall triangle, sample the true surface at
//      barycentric points of its (theta,z) footprint, measure radial face->surface gap.
//      Report max/p99 and whether big chords sit at valley floors.
//
// Usage: node --max-old-space-size=6144 e2e/_diag_holes.cjs [stlPath]
const fs = require('fs');
const path = require('path');

const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');

// ───────────────────────────── build params ─────────────────────────────
const H = 120, R0 = 40, expn = 1;
const Rb = R0, Rt = R0;
// DEFAULT_SUPERFORMULA (types.ts) + sf_strength=1
const P = {
  sfMBase: 6.0, sfMTop: 10.0, sfMCurveExp: 1.2,
  sfN1: 0.35, sfN1Top: 0.50, sfN2: 0.8, sfN2Top: 1.4, sfN3: 0.8, sfN3Top: 0.8,
  sfA: 1.0, sfB: 1.0,
};
const EPS = 1e-6;
const TAU = Math.PI * 2;

// baseRadius (profile.ts): no bell by default => r = Rb + (Rt-Rb)*pow(t,expn)
function baseRadius(z) {
  if (H <= 0) return Rb;
  const t = Math.max(0, Math.min(1, z / H));
  return Rb + (Rt - Rb) * Math.pow(t, expn);
}

function superformulaValue(theta, m, n1, n2, n3, a, b) {
  const c = Math.pow(Math.abs(Math.cos(m * theta / 4.0) / Math.max(a, EPS)), n2);
  const s = Math.pow(Math.abs(Math.sin(m * theta / 4.0) / Math.max(b, EPS)), n3);
  const denom = Math.pow(c + s, 1.0 / Math.max(n1, EPS));
  if (denom <= EPS) return 0.0;
  return Math.min(1.0 / denom, 4.0);
}

// TRUE analytic radius: literal port of rOuterSuperformulaBlossom (sf_strength=1).
function trueRadius(theta, z) {
  const t = H > 0 ? z / H : 0.0;
  const m = P.sfMBase + (P.sfMTop - P.sfMBase) * Math.pow(t, P.sfMCurveExp);
  const n1 = P.sfN1 + (P.sfN1Top - P.sfN1) * t;
  const n2 = P.sfN2 + (P.sfN2Top - P.sfN2) * t;
  const n3 = P.sfN3 + (P.sfN3Top - P.sfN3) * t;
  const seamOffset = Math.PI / Math.max(m, 1.0);
  const thetaAdj = theta + seamOffset;
  const rf = superformulaValue(thetaAdj, m, n1, n2, n3, P.sfA, P.sfB);
  return baseRadius(z) * (0.90 + 0.35 * rf); // strength=1 => sf_result directly
}

// ──────────────── 512x512 bilinear sampler grid (GpuSurfaceSampler) ────────────────
// The STL vertices were written as sampler.position(u,t) with this exact grid.
const RESU = 512, REST = 512;
let GRID = null; // Float32Array(RESU*REST*3)
function buildSamplerGrid() {
  const pos = new Float32Array(RESU * REST * 3);
  for (let row = 0; row < REST; row++) {
    const t = row / (REST - 1);
    const z = t * H;
    for (let col = 0; col < RESU; col++) {
      const u = col / RESU;
      const theta = TAU * u;
      const r = trueRadius(theta, z);
      const b = (row * RESU + col) * 3;
      pos[b] = r * Math.cos(theta);
      pos[b + 1] = r * Math.sin(theta);
      pos[b + 2] = z;
    }
  }
  GRID = pos;
}
function samplerPosition(u, t) {
  let uu = u - Math.floor(u); if (uu < 0) uu += 1;
  const uf = uu * RESU;
  const u0 = Math.floor(uf) % RESU;
  const u1 = (u0 + 1) % RESU;
  const fu = uf - Math.floor(uf);
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const tf = tc * (REST - 1);
  const t0 = Math.min(Math.floor(tf), REST - 1);
  const t1 = Math.min(t0 + 1, REST - 1);
  const ft = tf - t0;
  const idx = (col, rw) => (rw * RESU + col) * 3;
  const i00 = idx(u0, t0), i10 = idx(u1, t0), i01 = idx(u0, t1), i11 = idx(u1, t1);
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const bot = GRID[i00 + c] + (GRID[i10 + c] - GRID[i00 + c]) * fu;
    const top = GRID[i01 + c] + (GRID[i11 + c] - GRID[i01 + c]) * fu;
    out[c] = bot + (top - bot) * ft;
  }
  return out;
}

// ───────────────────────────── read + weld STL ─────────────────────────────
const buf = fs.readFileSync(STL);
const nTri = buf.readUInt32LE(80);
console.log(`[diag-holes] ${path.basename(STL)} tris=${nTri}`);

const Q = 1e5; // quantize to 1e-5 mm
const vmap = new Map();
const vx = [], vy = [], vz = [];
const tri = new Int32Array(nTri * 3);
let off = 84;
function idOf(x, y, z) {
  const k = `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
  let id = vmap.get(k);
  if (id === undefined) { id = vx.length; vmap.set(k, id); vx.push(x); vy.push(y); vz.push(z); }
  return id;
}
for (let t = 0; t < nTri; t++) {
  const b = off + 12;
  for (let c = 0; c < 3; c++) {
    const o = b + c * 12;
    tri[t * 3 + c] = idOf(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8));
  }
  off += 50;
}
const nV = vx.length;
console.log(`[diag-holes] welded verts=${nV} (from ${nTri * 3} face-verts)`);

// per-vertex theta/z + r
const vth = new Float64Array(nV), vr = new Float64Array(nV);
for (let v = 0; v < nV; v++) {
  vth[v] = Math.atan2(vy[v], vx[v]); if (vth[v] < 0) vth[v] += TAU;
  vr[v] = Math.hypot(vx[v], vy[v]);
}

// ───────────────────────────── (1) edge adjacency ─────────────────────────────
const edgeCount = new Map(); // "i:j" -> count
function ek(i, j) { return i < j ? `${i}:${j}` : `${j}:${i}`; }
for (let t = 0; t < nTri; t++) {
  const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
  for (const [i, j] of [[a, b], [b, c], [c, a]]) {
    const k = ek(i, j); edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
  }
}
let nBoundary = 0, nNonMan = 0;
const boundaryLoc = [], nonManLoc = [];
// classify edge by midpoint theta,z and how deep it is in a valley (r vs local max ridge r)
for (const [k, cnt] of edgeCount) {
  if (cnt === 1 || cnt > 2) {
    const [i, j] = k.split(':').map(Number);
    const mz = (vz[i] + vz[j]) / 2;
    const mth = (vth[i] + vth[j]) / 2; // crude (ignores wrap; fine for buckets)
    const mr = (vr[i] + vr[j]) / 2;
    if (cnt === 1) { nBoundary++; if (boundaryLoc.length < 4000) boundaryLoc.push([mth, mz, mr]); }
    else { nNonMan++; if (nonManLoc.length < 4000) nonManLoc.push([mth, mz, mr, cnt]); }
  }
}
console.log(`\n[1] EDGE TOPOLOGY:`);
console.log(`  manifold(2-tri) edges = ${[...edgeCount.values()].filter((c) => c === 2).length}`);
console.log(`  BOUNDARY(1-tri) edges = ${nBoundary}`);
console.log(`  NON-MANIFOLD(>2-tri) edges = ${nNonMan}`);

// Are boundary edges at valley floors? Need ridge radius at that z to know valley-depth.
// petalMaxR(z) = max over theta of trueRadius. petalMinR(z) = min (valley floor).
function petalExtrema(z) {
  let mx = -1e9, mn = 1e9;
  for (let s = 0; s < 2000; s++) { const th = TAU * s / 2000; const r = trueRadius(th, z); if (r > mx) mx = r; if (r < mn) mn = r; }
  return [mn, mx];
}
function reportLoc(label, arr) {
  if (!arr.length) { console.log(`  ${label}: none`); return; }
  // bucket by z band and by valley-proximity
  let atValley = 0, atRidge = 0, mid = 0;
  const zc = {};
  for (const e of arr) {
    const z = e[1], r = e[2];
    const [mn, mx] = petalExtrema(z);
    const frac = (r - mn) / Math.max(1e-6, mx - mn); // 0=valley floor, 1=ridge tip
    if (frac < 0.25) atValley++; else if (frac > 0.75) atRidge++; else mid++;
    const zb = Math.round(z / 10) * 10; zc[zb] = (zc[zb] || 0) + 1;
  }
  console.log(`  ${label}: sampled ${arr.length} -> valleyFloor(frac<.25)=${atValley} ridgeTip(>.75)=${atRidge} mid=${mid}`);
  console.log(`     z-histogram(10mm bins): ${Object.entries(zc).sort((a, b) => a[0] - b[0]).map(([z, c]) => `z${z}:${c}`).join(' ')}`);
}
reportLoc('boundary-edge locations', boundaryLoc);
reportLoc('nonman-edge locations', nonManLoc);

// ───────────────────────────── (2) port cross-check ─────────────────────────────
console.log(`\n[2] PORT CROSS-CHECK (true R(theta,z) vs welded vertex r at SMOOTH points):`);
buildSamplerGrid();
// "smooth" = vertices where local theta-gradient of trueRadius is small (not near cusp/valley).
// We compare vertex r to trueRadius AND to samplerPosition radius.
let chkAnalytic = [], chkSampler = [];
let smoothN = 0;
for (let v = 0; v < nV; v++) {
  if (vz[v] < 8 || vz[v] > 112 || vr[v] < 42) continue; // outer wall band only
  const th = vth[v], z = vz[v];
  // gradient magnitude of trueRadius in theta (finite diff)
  const dth = 1e-3;
  const g = Math.abs(trueRadius(th + dth, z) - trueRadius(th - dth, z)) / (2 * dth);
  // recover the vertex's intended u for sampler comparison
  const u = th / TAU, t = z / H;
  const sp = samplerPosition(u, t);
  const sr = Math.hypot(sp[0], sp[1]);
  const dAnalytic = Math.abs(vr[v] - trueRadius(th, z));
  const dSampler = Math.abs(vr[v] - sr);
  if (g < 2.0) { // smooth (low slope): petal flank/ridge body, away from knife cusp
    smoothN++;
    if (chkAnalytic.length < 200000) { chkAnalytic.push(dAnalytic); chkSampler.push(dSampler); }
  }
}
function stats(arr) {
  if (!arr.length) return 'n=0';
  const s = arr.slice().sort((a, b) => a - b);
  const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return `mean=${(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(5)} p50=${p(0.5).toFixed(5)} p99=${p(0.99).toFixed(5)} max=${p(1).toFixed(5)} (n=${arr.length})`;
}
console.log(`  smooth-vertex |vr - trueRadius|: ${stats(chkAnalytic)}`);
console.log(`  smooth-vertex |vr - samplerRadius|: ${stats(chkSampler)}`);
let maxSampler = 0; for (const d of chkSampler) if (d > maxSampler) maxSampler = d;
console.log(`  => port vs SAMPLER GRID max=${maxSampler.toFixed(5)}mm ${maxSampler < 0.01 ? 'TRUSTED (reproduces build grid)' : 'CHECK'}`);

// ───────────── (3) vertex-on-surface gap (ALL outer-wall verts) ─────────────
console.log(`\n[3] VERTEX-ON-SURFACE radial gap |vr - trueRadius(theta,z)| (ALL outer-wall verts):`);
let gAnalytic = [], gSampler = [];
let valleyVerts = [], ridgeVerts = [];
for (let v = 0; v < nV; v++) {
  if (vz[v] < 8 || vz[v] > 112 || vr[v] < 42) continue;
  const th = vth[v], z = vz[v];
  const tr = trueRadius(th, z);
  const u = th / TAU, t = z / H;
  const sp = samplerPosition(u, t); const sr = Math.hypot(sp[0], sp[1]);
  const dA = Math.abs(vr[v] - tr), dS = Math.abs(vr[v] - sr);
  gAnalytic.push(dA); gSampler.push(dS);
  const [mn, mx] = petalExtrema(z);
  const frac = (vr[v] - mn) / Math.max(1e-6, mx - mn);
  if (frac < 0.25) valleyVerts.push(dA); else if (frac > 0.75) ridgeVerts.push(dA);
}
console.log(`  vs TRUE analytic surface:  ${stats(gAnalytic)}`);
console.log(`  vs 512-col SAMPLER grid:   ${stats(gSampler)}  (gap to the grid the mesh was built on)`);
console.log(`  valley-floor verts (frac<.25) vs true: ${stats(valleyVerts)}`);
console.log(`  ridge-tip   verts (frac>.75) vs true: ${stats(ridgeVerts)}`);

// ───────────── (4) valley chord-bridging: face -> true surface ─────────────
console.log(`\n[4] VALLEY CHORD-BRIDGING: triangle face -> true surface gap (barycentric samples):`);
// For each outer-wall tri, sample barycentric pts; recover (theta,z) of the sample point,
// compute true surface 3D position at that (theta,z), measure 3D distance from the face's
// flat plane to that true point along the radial direction (and absolute 3D).
const BARY = [[0.5, 0.5, 0.0], [0.5, 0.0, 0.5], [0.0, 0.5, 0.5], [1 / 3, 1 / 3, 1 / 3],
  [0.25, 0.25, 0.5], [0.25, 0.5, 0.25], [0.5, 0.25, 0.25]];
let chord = [];               // max chord per triangle (radial gap)
let bridgingTris = 0;          // tris with chord>0.1mm
let valleyBridge = [], ridgeBridge = [], midBridge = [];
const bigChords = [];          // locations of worst chords
let outerTris = 0;
for (let t = 0; t < nTri; t++) {
  const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
  const ccz = (vz[a] + vz[b] + vz[c]) / 3, ccx = (vx[a] + vx[b] + vx[c]) / 3, ccy = (vy[a] + vy[b] + vy[c]) / 3;
  const cr = Math.hypot(ccx, ccy);
  if (cr < 42 || ccz < 8 || ccz > 112) continue;
  outerTris++;
  let maxGap = 0, worst = null;
  for (const [wa, wb, wc] of BARY) {
    const px = vx[a] * wa + vx[b] * wb + vx[c] * wc;
    const py = vy[a] * wa + vy[b] * wb + vy[c] * wc;
    const pz = vz[a] * wa + vz[b] * wb + vz[c] * wc;
    const fr = Math.hypot(px, py);              // radius of the FACE at this bary point
    let pth = Math.atan2(py, px); if (pth < 0) pth += TAU;
    const tr = trueRadius(pth, pz);             // TRUE surface radius at that (theta,z)
    const gap = Math.abs(tr - fr);              // radial face->surface chord
    if (gap > maxGap) { maxGap = gap; worst = [pth, pz, fr, tr]; }
  }
  chord.push(maxGap);
  if (maxGap > 0.1) bridgingTris++;
  // classify by valley/ridge using the face centroid radius vs petal extrema
  const [mn, mx] = petalExtrema(ccz);
  const frac = (cr - mn) / Math.max(1e-6, mx - mn);
  if (frac < 0.25) valleyBridge.push(maxGap); else if (frac > 0.75) ridgeBridge.push(maxGap); else midBridge.push(maxGap);
  if (maxGap > 0.3 && bigChords.length < 6000) bigChords.push([worst[0], worst[1], frac, maxGap]);
}
console.log(`  outer-wall tris analyzed = ${outerTris}`);
console.log(`  per-tri max radial chord:  ${stats(chord)}`);
console.log(`  tris bridging >0.1mm = ${bridgingTris} (${(100 * bridgingTris / outerTris).toFixed(2)}%)`);
console.log(`  chord by location:`);
console.log(`     valley-floor tris (frac<.25): ${stats(valleyBridge)}`);
console.log(`     mid-flank tris   (.25-.75):   ${stats(midBridge)}`);
console.log(`     ridge-tip tris   (frac>.75):  ${stats(ridgeBridge)}`);
// where are the BIG chords?
if (bigChords.length) {
  let atValley = 0, atRidge = 0, mid = 0; const zc = {};
  for (const e of bigChords) { const frac = e[2]; if (frac < 0.25) atValley++; else if (frac > 0.75) atRidge++; else mid++; const zb = Math.round(e[1] / 10) * 10; zc[zb] = (zc[zb] || 0) + 1; }
  console.log(`  BIG chords (>0.3mm) sampled=${bigChords.length}: valleyFloor=${atValley} ridgeTip=${atRidge} mid=${mid}`);
  console.log(`     z-histogram: ${Object.entries(zc).sort((a, b) => a[0] - b[0]).map(([z, c]) => `z${z}:${c}`).join(' ')}`);
  // print a few worst
  bigChords.sort((a, b) => b[3] - a[3]);
  console.log(`     worst 8: ${bigChords.slice(0, 8).map((e) => `(th=${e[0].toFixed(3)},z=${e[1].toFixed(1)},frac=${e[2].toFixed(2)},gap=${e[3].toFixed(3)}mm)`).join(' ')}`);
}

// Petal geometry context: valley depth at a few z
console.log(`\n[ctx] petal valley depth (ridge-tip r - valley-floor r) by z:`);
for (const z of [20, 40, 60, 80, 100, 110]) { const [mn, mx] = petalExtrema(z); console.log(`   z=${z}: valleyR=${mn.toFixed(2)} ridgeR=${mx.toFixed(2)} depth=${(mx - mn).toFixed(2)}mm baseR0=${baseRadius(z).toFixed(2)}`); }
