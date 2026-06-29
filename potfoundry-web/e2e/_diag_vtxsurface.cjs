// T0 — DIRECT off-surface test on the STL.
// For each unique welded STL vertex: theta=atan2(y,x), z, r=hypot(x,y).
// Evaluate the TRUE SuperformulaBlossom radius R(theta,z) (port of styles.ts /
// WGSL math, sf_strength=1 defaults, H=120 R=40) and report the |r-R| distribution.
// CROSS-CHECK: smooth-slope vertices must have tiny |r-R| or the port is wrong.
// Usage: node --max-old-space-size=6144 e2e/_diag_vtxsurface.cjs [stl]
const fs = require('fs');
const path = require('path');

const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');

// ─────────── PORT of rOuterSuperformulaBlossom (styles.ts), defaults (sf_strength=1) ───────────
const EPSILON = 1e-9;
const TAU = 2 * Math.PI;
const H = 120, Rb = 40, Rt = 40, expn = 1;
// DEFAULT_SUPERFORMULA
const SF = {
  sfMBase: 6.0, sfMTop: 10.0, sfMCurveExp: 1.2,
  sfN1: 0.35, sfN1Top: 0.50, sfN2: 0.8, sfN2Top: 1.4,
  sfN3: 0.8, sfN3Top: 0.8, sfA: 1.0, sfB: 1.0,
};
function superformulaValue(theta, m, n1, n2, n3, a, b) {
  const c = Math.pow(Math.abs(Math.cos(m * theta / 4.0) / Math.max(a, EPSILON)), n2);
  const s = Math.pow(Math.abs(Math.sin(m * theta / 4.0) / Math.max(b, EPSILON)), n3);
  const denom = Math.pow(c + s, 1.0 / Math.max(n1, EPSILON));
  if (denom <= EPSILON) return 0.0;
  return Math.min(1.0 / denom, 4.0);
}
function baseRadius(z) {
  const t = Math.max(0, Math.min(1, z / H));
  return Rb + (Rt - Rb) * Math.pow(t, expn); // 40, no bell
}
// True outer radius R(theta,z). theta = atan2(y,x) in (-pi,pi]; formula uses theta in
// [0,2pi) but cos/sin of m*theta/4 are NOT 2pi-periodic in general — superformula uses
// theta directly. Match styles.ts which receives theta = 2*pi*u in [0,2pi). So map
// atan2 result into [0,2pi).
function Rtrue(theta, z) {
  const t = H > 0 ? z / H : 0;
  const m = SF.sfMBase + (SF.sfMTop - SF.sfMBase) * Math.pow(t, SF.sfMCurveExp);
  const n1 = SF.sfN1 + (SF.sfN1Top - SF.sfN1) * t;
  const n2 = SF.sfN2 + (SF.sfN2Top - SF.sfN2) * t;
  const n3 = SF.sfN3 + (SF.sfN3Top - SF.sfN3) * t;
  const a = SF.sfA, b = SF.sfB;
  const seamOffset = Math.PI / Math.max(m, 1.0);
  const thetaAdj = theta + seamOffset;
  const rf = superformulaValue(thetaAdj, m, n1, n2, n3, a, b);
  return baseRadius(z) * (0.90 + 0.35 * rf);
}

// ─────────── Read + weld STL ───────────
const buf = fs.readFileSync(STL);
const nTri = buf.readUInt32LE(80);
console.log(`[T0] ${path.basename(STL)} tris=${nTri}`);
const Q = 1e4;
const key = (x, y, z) => `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
const vmap = new Map();
const vx = [], vy = [], vz = [];
let off = 84;
function idOf(x, y, z) {
  const k = key(x, y, z); let id = vmap.get(k);
  if (id === undefined) { id = vx.length; vmap.set(k, id); vx.push(x); vy.push(y); vz.push(z); }
  return id;
}
for (let tI = 0; tI < nTri; tI++) {
  const b0 = off + 12;
  for (let c = 0; c < 3; c++) {
    const o = b0 + c * 12;
    idOf(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8));
  }
  off += 50;
}
const nV = vx.length;
console.log(`[T0] welded verts=${nV}`);

// ─────────── Per-vertex |r-R|, OUTER WALL only (r>42, z in [8,112]) ───────────
const diffs = [];        // signed r-R for outer-wall verts
const absAll = [];
const worst = [];        // {theta,z,r,R,d}
let nOuter = 0;
// Also bucket by "is this near a petal-edge cusp?" — measure how close theta is to a
// superformula EXTREMUM (peak r = max, valley = min) at this z. We classify by |dR/dtheta|:
// near a cusp the radius is at a local max with high curvature; smooth slope has moderate slope.
// Simpler robust proxy: local radius curvature via finite diff of Rtrue in theta.
function dRdth(theta, z, h = 1e-4) { return (Rtrue(theta + h, z) - Rtrue(theta - h, z)) / (2 * h); }
function d2Rdth(theta, z, h = 2e-3) { return (Rtrue(theta + h, z) - 2 * Rtrue(theta, z) + Rtrue(theta - h, z)) / (h * h); }

const cuspDiffs = [], slopeDiffs = [];
for (let v = 0; v < nV; v++) {
  const x = vx[v], y = vy[v], z = vz[v];
  const r = Math.hypot(x, y);
  if (r <= 42 || z <= 8 || z >= 112) continue; // outer wall only
  nOuter++;
  let theta = Math.atan2(y, x); if (theta < 0) theta += TAU;
  const R = Rtrue(theta, z);
  const d = r - R;            // signed: negative = vertex INSIDE true surface (chord across convex ridge)
  diffs.push(d); absAll.push(Math.abs(d));
  worst.push({ theta, z, r, R, d, ad: Math.abs(d) });
  // cusp proxy: |curvature| of R(theta). At a sharp convex peak |d2R| is huge.
  const curv = Math.abs(d2Rdth(theta, z));
  if (curv > 400) cuspDiffs.push(Math.abs(d)); else slopeDiffs.push(Math.abs(d));
}
console.log(`[T0] outer-wall verts=${nOuter}`);

function pct(arr, p) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function stats(name, arr) {
  if (!arr.length) { console.log(`  ${name}: (empty)`); return; }
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  console.log(`  ${name}: n=${arr.length} mean=${mean.toFixed(4)} p50=${pct(arr, 0.5).toFixed(4)} p90=${pct(arr, 0.9).toFixed(4)} p99=${pct(arr, 0.99).toFixed(4)} max=${pct(arr, 1).toFixed(4)}`);
}

console.log(`\n[|r - R_true|  (mm)  — the literal "vertices off the surface" test]`);
stats('|r-R| ALL outer-wall ', absAll);
const signedNeg = diffs.filter((x) => x < 0).length;
console.log(`  signed: ${(100 * signedNeg / diffs.length).toFixed(1)}% INSIDE true surface (r<R, chord under convex ridge); mean signed=${(diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(4)}`);
console.log(`  off-surface counts: >0.05mm=${absAll.filter((x) => x > 0.05).length} (${(100 * absAll.filter((x) => x > 0.05).length / absAll.length).toFixed(2)}%)  >0.1mm=${absAll.filter((x) => x > 0.1).length}  >0.3mm=${absAll.filter((x) => x > 0.3).length}`);

console.log(`\n[CROSS-CHECK: split by local R(theta) curvature]`);
stats('  SMOOTH-SLOPE verts (|d2R/dth2|<=400) — MUST be tiny if port correct', slopeDiffs);
stats('  CUSP-region verts (|d2R/dth2|>400)', cuspDiffs);

console.log(`\n[WORST 15 offenders (theta deg, z, r, R, r-R)]`);
worst.sort((a, b) => b.ad - a.ad);
for (let i = 0; i < 15; i++) {
  const w = worst[i];
  console.log(`  theta=${(w.theta * 180 / Math.PI).toFixed(1)}deg z=${w.z.toFixed(1)} r=${w.r.toFixed(3)} R=${w.R.toFixed(3)} d=${w.d.toFixed(3)}`);
}
// where do worst cluster in z?
const top1pct = worst.slice(0, Math.max(1, Math.floor(worst.length * 0.01)));
const zlo = top1pct.filter((w) => w.z < 40).length, zmid = top1pct.filter((w) => w.z >= 40 && w.z < 80).length, zhi = top1pct.filter((w) => w.z >= 80).length;
console.log(`\n[worst-1% z-distribution] z<40: ${zlo}  z[40,80): ${zmid}  z>=80: ${zhi}  (top n=${top1pct.length})`);
const insideTop = top1pct.filter((w) => w.d < 0).length;
console.log(`[worst-1% sign] ${(100 * insideTop / top1pct.length).toFixed(0)}% inside (r<R)`);
