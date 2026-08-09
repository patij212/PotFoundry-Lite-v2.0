#!/usr/bin/env node
// s121FanFeasibility.cjs — CAN THE TREAD BASE BE SHORTENED WITHOUT BREAKING THE WALL?
//
//   node research/tools/s121FanFeasibility.cjs <abs .stl> [cap]
//
// PRE-REGISTRATION MEASUREMENT for S121 FIX 1. The tread strip's every triangle has a RING edge as its base
// and the opposite loop 2*PF_CB_STEP_EPS_UM away, so aspect3 ~ base/gap and the ONLY way to lower it with
// the loops fixed is to shorten the base. A boundary edge belongs to exactly ONE wall facet, so shortening
// it forces that facet to be re-triangulated — and with the new points COLLINEAR on the old edge (the only
// placement that leaves the wall surface bit-identical) the ONLY non-degenerate re-triangulation is a FAN
// from the facet's opposite vertex. This script asks the decisive question BEFORE any code is written:
//     *** would those fan children themselves be over the cap? ***
// It reads the shipped STL only. EXHAUSTIVE over every facet; no stride, no cap on the scan.
'use strict';
const fs = require('fs');

const stl = process.argv[2];
const CAP = Number(process.argv[3] || 50);
if (!stl) { console.log('usage: node s121FanFeasibility.cjs <abs .stl> [cap]'); process.exit(2); }

const ar3 = (A, B, C) => {
  const e0 = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const e1 = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
  const e2 = Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]);
  const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
  const wx = C[0] - A[0]; const wy = C[1] - A[1]; const wz = C[2] - A[2];
  const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  if (!(area > 0)) return Infinity;
  return (Math.max(e0, e1, e2) * (e0 + e1 + e2)) / (4 * area);
};
const lerp = (A, B, t) => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t];

const buf = fs.readFileSync(stl);
const n = buf.readUInt32LE(80);
const tri = (f) => {
  const o = 84 + f * 50 + 12;
  return [0, 1, 2].map((k) => [buf.readFloatLE(o + 12 * k), buf.readFloatLE(o + 12 * k + 4), buf.readFloatLE(o + 12 * k + 8)]);
};

// ── 1. the z-levels that carry a near-zero-height band (the tread bands) ──
// A tread facet has ALL THREE vertices on one of exactly two z values 2*eps apart. Find those z values by
// histogramming the z of facets whose z-extent is under 100 um and whose 3 vertices take exactly 2 values.
const zHist = new Map();
for (let f = 0; f < n; f += 1) {
  const P = tri(f);
  const zs = [P[0][2], P[1][2], P[2][2]];
  const span = Math.max(...zs) - Math.min(...zs);
  if (span > 0.1 || span <= 0) continue;
  const k = `${Math.min(...zs).toFixed(3)}|${Math.max(...zs).toFixed(3)}`;
  zHist.set(k, (zHist.get(k) ?? 0) + 1);
}
const bands = [...zHist.entries()].filter(([, c]) => c > 50).sort((a, b) => b[1] - a[1]);
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log('S121 FAN FEASIBILITY — can a tread base be shortened without pushing the WALL over the cap?');
console.log('════════════════════════════════════════════════════════════════════════════════════════');
console.log(`mesh ${stl}\nfacets ${n.toLocaleString()}   cap AR > ${CAP}`);
console.log(`candidate tread bands (zlo|zhi, facets): ${bands.map(([k, c]) => `${k} n=${c}`).join('   ') || 'NONE'}`);
if (bands.length === 0) { console.log('NO TREAD BAND — this style has no detected C0 z-step. DONE.'); process.exit(0); }
const bandSet = new Set(bands.map(([k]) => k));

// ── 2. index every facet's edges by exact f32 key; tread facets vs wall facets ──
const key = (p) => `${p[0]},${p[1]},${p[2]}`;
const ek = (p, q) => { const a = key(p); const b = key(q); return a < b ? `${a}|${b}` : `${b}|${a}`; };
const isTread = new Uint8Array(n);
for (let f = 0; f < n; f += 1) {
  const P = tri(f);
  const zs = [P[0][2], P[1][2], P[2][2]];
  const k = `${Math.min(...zs).toFixed(3)}|${Math.max(...zs).toFixed(3)}`;
  if (bandSet.has(k)) isTread[f] = 1;
}
let nTread = 0; for (let f = 0; f < n; f += 1) nTread += isTread[f];
// wall facets that touch a band z: only those can own a tread base edge
const bandZ = new Set();
for (const [k] of bands) for (const s of k.split('|')) bandZ.add(Number(s));
const nearBandZ = (z) => { for (const b of bandZ) if (Math.abs(z - b) < 5e-4) return true; return false; };
const edgeOwner = new Map();   // edge key -> [facet, opposite vertex]
for (let f = 0; f < n; f += 1) {
  if (isTread[f]) continue;
  const P = tri(f);
  let hits = 0; for (let k = 0; k < 3; k += 1) if (nearBandZ(P[k][2])) hits += 1;
  if (hits < 2) continue;
  for (let k = 0; k < 3; k += 1) {
    const A = P[k]; const B = P[(k + 1) % 3]; const C = P[(k + 2) % 3];
    if (!nearBandZ(A[2]) || !nearBandZ(B[2]) || A[2] !== B[2]) continue;
    edgeOwner.set(ek(A, B), [f, C, A, B]);
  }
}
console.log(`tread facets ${nTread.toLocaleString()}   wall facets indexed on a band z: ${edgeOwner.size.toLocaleString()} ring edges`);

// ── 3. every OVER-CAP tread facet: its ring base, the owning wall facet, and the fan children ──
let over = 0; let matched = 0; let unmatched = 0;
const parentAR = []; const kNeed = []; const childWorst = []; let childOver = 0; let treadStillOver = 0;
const SAFE = 0.9;
for (let f = 0; f < n; f += 1) {
  if (!isTread[f]) continue;
  const P = tri(f);
  const a = ar3(P[0], P[1], P[2]);
  if (!(a > CAP)) continue;
  over += 1;
  // the ring base = the edge whose endpoints share a z
  let base = -1;
  for (let k = 0; k < 3; k += 1) if (P[k][2] === P[(k + 1) % 3][2]) base = k;
  if (base < 0) { unmatched += 1; continue; }
  const A = P[base]; const B = P[(base + 1) % 3]; const apex = P[(base + 2) % 3];
  const own = edgeOwner.get(ek(A, B));
  if (own === undefined) { unmatched += 1; continue; }
  matched += 1;
  const [, C, WA, WB] = own;
  parentAR.push(ar3(WA, WB, C));
  // altitude of the tread ear over its base decides how short the base must be
  const L = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
  const wx = apex[0] - A[0]; const wy = apex[1] - A[1]; const wz = apex[2] - A[2];
  const alt = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / L;
  const kk = Math.max(2, Math.ceil(L / Math.max(1e-12, SAFE * CAP * alt)));
  kNeed.push(kk);
  // the FAN: the wall facet (WA,WB,C) becomes k triangles (s_i, s_{i+1}, C)
  let worst = 0;
  for (let i = 0; i < kk; i += 1) {
    const s0 = lerp(WA, WB, i / kk); const s1 = lerp(WA, WB, (i + 1) / kk);
    const c = ar3(s0, s1, C); if (c > worst) worst = c;
  }
  childWorst.push(worst);
  if (worst > CAP) childOver += 1;
  // and the tread ear itself, re-scored on the shortened base (worst sub-ear)
  let te = 0;
  for (let i = 0; i < kk; i += 1) {
    const s0 = lerp(A, B, i / kk); const s1 = lerp(A, B, (i + 1) / kk);
    const c = ar3(s0, s1, apex); if (c > te) te = c;
  }
  if (te > CAP) treadStillOver += 1;
}
const q = (v, p) => (v.length === 0 ? NaN : v.slice().sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(p * v.length))]);
console.log(`OVER-CAP TREAD FACETS ${over}   base edge matched to a wall owner ${matched}   UNMATCHED ${unmatched}`);
console.log(`  wall parent AR   : min ${q(parentAR, 0).toFixed(3)}  p50 ${q(parentAR, 0.5).toFixed(3)}  p90 ${q(parentAR, 0.9).toFixed(3)}  max ${q(parentAR, 0.999999).toFixed(3)}`);
console.log(`  k needed (SAFE ${SAFE}): min ${q(kNeed, 0)}  p50 ${q(kNeed, 0.5)}  p90 ${q(kNeed, 0.9)}  max ${q(kNeed, 0.999999)}   sum ${kNeed.reduce((s, v) => s + v, 0)}`);
console.log(`  WORST FAN CHILD  : min ${q(childWorst, 0).toFixed(3)}  p50 ${q(childWorst, 0.5).toFixed(3)}  p90 ${q(childWorst, 0.9).toFixed(3)}  max ${q(childWorst, 0.999999).toFixed(3)}`);
console.log(`  *** fan children OVER the cap: ${childOver} of ${matched}  ***   tread ear STILL over cap after the split: ${treadStillOver}`);
console.log('S121 FAN FEASIBILITY DONE');
