// research/tools/_bladeFolds.mjs — DIAGNOSTIC ONLY (2026-07-29 blade investigation).
//
// The _strataConformBisect driver emits a triangulation of the (theta,z) CYLINDER: every vertex is
// `addV(theta,z)` -> (rA(theta,z)cos t, rA sin t, z). So the mesh is a piecewise-linear map of a
// (theta,z) triangulation into 3-space. A valid mesh therefore requires every triangle to have the SAME
// SIGN of signed area in (theta,z). A negative one is a FOLD: the parametrisation doubles back, the
// surface overlaps itself, and NO combinatorial check (manifold count, directed-edge orientation) can
// see it, because a crumpled sheet is still a consistently-oriented manifold.
//
// This tool welds the STL by exact float bits, rebuilds the (theta,z) triangulation, and measures:
//   * signed area in (theta,z)  -> fold count
//   * PARAMETRIC aspect ratio   -> separates "genuine fold of a well-shaped triangle" from float noise
//                                  on a degenerate sliver
//   * connected components of the fold set (a flap vs. scattered)
//   * directed-edge tallies (reproduces the driver's own orientation check for comparison)
//
// usage: node research/tools/_bladeFolds.mjs <file.stl> [dumpJson]
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
const dumpJson = process.argv[3] ?? '';
const buf = readFileSync(path);
const nT = buf.readUInt32LE(80);
const TWO_PI = Math.PI * 2;
const dTh = (a, b) => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };

// ─── weld by exact float32 bits (the writer emits the SAME double rounded the same way) ───
const key = new Map();
const px = [], py = [], pz = [];
const idx = new Int32Array(nT * 3);
{
  const b = buf;
  for (let i = 0; i < nT; i += 1) {
    const o = 84 + i * 50 + 12;
    for (let k = 0; k < 3; k += 1) {
      const oo = o + k * 12;
      const kx = b.readUInt32LE(oo), ky = b.readUInt32LE(oo + 4), kz = b.readUInt32LE(oo + 8);
      const s = `${kx},${ky},${kz}`;
      let v = key.get(s);
      if (v === undefined) { v = px.length; key.set(s, v); px.push(b.readFloatLE(oo)); py.push(b.readFloatLE(oo + 4)); pz.push(b.readFloatLE(oo + 8)); }
      idx[i * 3 + k] = v;
    }
  }
}
const nV = px.length;
console.log(`tris ${nT}  unique verts ${nV}  (V-E+F check below)`);

// parametric coords
const vth = new Float64Array(nV), vz = new Float64Array(nV), vr = new Float64Array(nV);
for (let v = 0; v < nV; v += 1) {
  let t = Math.atan2(py[v], px[v]); if (t < 0) t += TWO_PI;
  vth[v] = t; vz[v] = pz[v]; vr[v] = Math.hypot(px[v], py[v]);
}

// ─── per-triangle parametric measurements ───
// The (theta,z) domain is anisotropic (theta is an angle) — convert theta to ARC LENGTH at the local
// radius so "well-shaped in parameter space" means what it looks like it means.
const sParA = new Float64Array(nT);
const parAR = new Float64Array(nT);
const thSpan = new Float64Array(nT);
let nFold = 0;
for (let i = 0; i < nT; i += 1) {
  const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
  const rM = (vr[a] + vr[b] + vr[c]) / 3;
  const dB = dTh(vth[a], vth[b]), dC = dTh(vth[a], vth[c]);
  const ux = dB * rM, uy = vz[b] - vz[a];
  const wx = dC * rM, wy = vz[c] - vz[a];
  const s = ux * wy - uy * wx;           // 2*signed area in (arc,z)
  sParA[i] = s;
  const e0 = Math.hypot(ux, uy), e1 = Math.hypot(wx - ux, wy - uy), e2 = Math.hypot(wx, wy);
  const per = e0 + e1 + e2, L = Math.max(e0, e1, e2);
  parAR[i] = s !== 0 ? (L * per) / (2 * Math.abs(s)) : Infinity;
  thSpan[i] = Math.max(Math.abs(dB), Math.abs(dC), Math.abs(dC - dB));
  if (s < 0) nFold += 1;
}
console.log(`\nPARAMETRIC FOLDS (signed area in (arc,z) < 0): ${nFold}  (${(100 * nFold / nT).toFixed(4)}%)`);

// how many of the folds are WELL-SHAPED in parameter space (=> not float noise)
const bins = [2, 4, 8, 16, 32, 64, 128, 1e9];
const foldBin = new Array(bins.length).fill(0), okBin = new Array(bins.length).fill(0);
for (let i = 0; i < nT; i += 1) {
  let k = 0; while (k < bins.length - 1 && parAR[i] > bins[k]) k += 1;
  if (sParA[i] < 0) foldBin[k] += 1; else okBin[k] += 1;
}
console.log(`\nPARAMETRIC aspect-ratio distribution  (AR = longest*perimeter / (4*area), 1.0 = equilateral)`);
console.log('   parAR <=      folded        forward     fold%');
for (let k = 0; k < bins.length; k += 1) {
  const lbl = bins[k] > 1e8 ? '   inf' : String(bins[k]).padStart(6);
  const tot = foldBin[k] + okBin[k];
  console.log(`  ${lbl}  ${String(foldBin[k]).padStart(12)}  ${String(okBin[k]).padStart(13)}  ${tot ? (100 * foldBin[k] / tot).toFixed(3) : '-'}`);
}
let wellShapedFolds = 0;
for (let i = 0; i < nT; i += 1) if (sParA[i] < 0 && parAR[i] <= 8) wellShapedFolds += 1;
console.log(`\n  WELL-SHAPED FOLDS (parAR <= 8): ${wellShapedFolds}   <= these cannot be float noise`);

// ─── edge topology: incidence + directed tally (mirrors analyze()) ───
const emap = new Map();
const ek = (a, b) => (a < b ? a * 4194304 + b : b * 4194304 + a);
for (let i = 0; i < nT; i += 1) {
  const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
  for (const [x, y] of [[a, b], [b, c], [c, a]]) {
    const k = ek(x, y);
    let e = emap.get(k);
    if (e === undefined) { e = { n: 0, fwd: 0, t: [] }; emap.set(k, e); }
    e.n += 1; if (x < y) e.fwd += 1; if (e.t.length < 8) e.t.push(i);
  }
}
let nonMan = 0, bnd = 0, orientMis = 0;
for (const e of emap.values()) {
  if (e.n === 2) { if (e.fwd !== 1) orientMis += 1; continue; }
  if (e.n > 2) { nonMan += 1; continue; }
  bnd += 1;
}
console.log(`\nEXACT-WELD TOPOLOGY: edges ${emap.size}  non-manifold ${nonMan}  boundary ${bnd}  orientation-mismatch ${orientMis}`);
console.log(`Euler V-E+F = ${nV} - ${emap.size} + ${nT} = ${nV - emap.size + nT}`);

// ─── connected components of the fold set ───
const isFold = new Uint8Array(nT);
for (let i = 0; i < nT; i += 1) if (sParA[i] < 0) isFold[i] = 1;
const nbrOf = (i) => {
  const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
  const out = [];
  for (const [x, y] of [[a, b], [b, c], [c, a]]) {
    const e = emap.get(ek(x, y)); if (e === undefined) continue;
    for (const t of e.t) if (t !== i) out.push(t);
  }
  return out;
};
const comp = new Int32Array(nT).fill(-1);
let nComp = 0; const compSize = [];
for (let i = 0; i < nT; i += 1) {
  if (!isFold[i] || comp[i] >= 0) continue;
  const cid = nComp++; let sz = 0; const stack = [i]; comp[i] = cid;
  while (stack.length) { const t = stack.pop(); sz += 1; for (const u of nbrOf(t)) if (isFold[u] && comp[u] < 0) { comp[u] = cid; stack.push(u); } }
  compSize.push(sz);
}
compSize.sort((a, b) => b - a);
console.log(`\nFOLD CONNECTED COMPONENTS: ${nComp}   sizes: ${compSize.slice(0, 15).join(', ')}${nComp > 15 ? ' …' : ''}`);
const singles = compSize.filter((s) => s === 1).length;
console.log(`  singletons ${singles}   >=2 ${nComp - singles}   largest ${compSize[0]}   total folded tris ${nFold}`);

// ─── where are they? (theta,z) ───
const zb = new Array(24).fill(0), zbAll = new Array(24).fill(0);
for (let i = 0; i < nT; i += 1) {
  const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
  const zc = (vz[a] + vz[b] + vz[c]) / 3;
  const k = Math.max(0, Math.min(23, Math.floor((zc / 120) * 24)));
  zbAll[k] += 1; if (sParA[i] < 0) zb[k] += 1;
}
console.log(`\nZ-BAND fold rate (24 bands over H=120mm):`);
for (let k = 0; k < 24; k += 1) console.log(`   z ${(k * 5).toString().padStart(3)}-${((k + 1) * 5).toString().padStart(3)}mm : ${String(zb[k]).padStart(6)} / ${String(zbAll[k]).padStart(7)}  ${(100 * zb[k] / Math.max(1, zbAll[k])).toFixed(2)}%`);

// theta modulo the 12-fold arch pattern
const nArch = 12, tb = new Array(24).fill(0), tbAll = new Array(24).fill(0);
for (let i = 0; i < nT; i += 1) {
  const a = idx[i * 3];
  const phase = ((vth[a] * nArch) / TWO_PI) % 1;
  const k = Math.max(0, Math.min(23, Math.floor(phase * 24)));
  tbAll[k] += 1; if (sParA[i] < 0) tb[k] += 1;
}
console.log(`\nTHETA-PHASE fold rate (folded into ONE of the ${nArch} arch periods, 24 bins):`);
for (let k = 0; k < 24; k += 1) console.log(`   phase ${(k / 24).toFixed(3)}-${((k + 1) / 24).toFixed(3)} : ${String(tb[k]).padStart(6)} / ${String(tbAll[k]).padStart(7)}  ${(100 * tb[k] / Math.max(1, tbAll[k])).toFixed(2)}%`);

// ─── sample dump for the worst well-shaped folds ───
const cand = [];
for (let i = 0; i < nT; i += 1) if (sParA[i] < 0 && parAR[i] <= 8) cand.push(i);
cand.sort((a, b) => sParA[a] - sParA[b]);
console.log(`\n=== 20 LARGEST WELL-SHAPED FOLDS (most negative parametric area) ===`);
console.log('   tri      -2A(mm^2)  parAR   thSpan(rad)  z(mm)   comp-size');
for (const i of cand.slice(0, 20)) {
  const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
  console.log(`  ${String(i).padStart(8)} ${(-sParA[i]).toExponential(3)}  ${parAR[i].toFixed(2).padStart(6)}  ${thSpan[i].toExponential(2)}  ${((vz[a] + vz[b] + vz[c]) / 3).toFixed(3).padStart(8)}  ${compSize.length ? '' : ''}${comp[i] >= 0 ? '' : ''}`);
}

if (dumpJson !== '') {
  const out = [];
  for (const i of cand.slice(0, 200)) {
    const a = idx[i * 3], b = idx[i * 3 + 1], c = idx[i * 3 + 2];
    out.push({ tri: i, parAR: parAR[i], sPar: sParA[i], v: [a, b, c].map((v) => ({ x: px[v], y: py[v], z: pz[v], th: vth[v], r: vr[v] })) });
  }
  writeFileSync(dumpJson, JSON.stringify(out, null, 1));
  console.log(`\nwrote ${dumpJson}`);
}
