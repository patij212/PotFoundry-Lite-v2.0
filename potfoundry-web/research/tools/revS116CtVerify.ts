// revS116CtVerify.ts — INDEPENDENT REFUTATION PASS on the S116 CelticTriquetra mesh claim.
//
// WHAT IS UNDER TEST
//   The claim quotes, as THE honest position number, R3 perpendicular > 0.01 mm on
//   100,031 facets / 1247.746 mm2 / 2.5154% OF MESH, MAX 8.5085e-1 mm, and asserts that the
//   radial R1 figure (11.6293%) is a 4.6x over-read to be discarded.
//
//   But s116PosFloor.ts computes R1 over a 45-point (k=8) barycentric lattice and then hands
//   ONLY THE TOP-4 LATTICE POINTS BY R1 to the projector (PERP_TOP=4, 1,461,357 x 4 = 5,845,428
//   calls). R3 <= R1 pointwise, but the ARGMAX OF R3 NEED NOT BE THE ARGMAX OF R1. So the
//   per-facet R3 is a max over 4 points while the per-facet R1 is a max over 45. The two rulers
//   are NOT sampled at matched density, and the mismatch biases in the claim's favour.
//
// THE TEST (exhaustive on the disputed set, no stride)
//   DISPUTED = { f : R1[f] > 0.01 AND R3stored[f] <= 0.01 }  — the facets the claim CLEARS.
//   Re-adjudicate EVERY one of them with the projector at ALL 45 lattice points.
//   Any facet whose full-45 R3 exceeds 0.01 mm was cleared by an under-sampled ruler.
//   Also re-run the OVER set at full 45 to check the quoted MAX.
//   Plus a k=16 (153-pt) lattice sub-ladder: scar 2 was NEVER swept for R3, only for R1.
//
// Usage: bash research/tools/run-rev-s116-ctverify.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { readFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_REV_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_REV_STL ?? '';
const R3BIN = process.env.PF_REV_R3 ?? '';
const DIMS: StyleDims = { H: envF('PF_REV_H', 120), Rb: envF('PF_REV_RB', 40), Rt: envF('PF_REV_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = 0.01;
const BAR_LO = 0.001;
const K = envI('PF_REV_K', 8);
const K2 = envI('PF_REV_K2', 16);
const PROJ_NTH = envI('PF_REV_PNTH', 1024);
const PROJ_NZ = envI('PF_REV_PNZ', 512);
const PROJ_K = envI('PF_REV_PK', 6);
const K2_N = envI('PF_REV_K2N', 4000);       // facets in the k=16 sub-ladder
if (STL.length === 0) { log('*** PF_REV_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const latticePts = (k: number): Float64Array => {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
};
const pct = (a: number, b: number): string => (b === 0 ? '  —  ' : ((a / b) * 100).toFixed(4));

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;

log('════════════════════════════════════════════════════════════════════════════════════════');
log(`===== REV-S116 INDEPENDENT VERIFY — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════');
log(`stl    ${STL}`);
log(`facets ${nTri}`);
log('');

// ── T1: geometry basics, independent ──────────────────────────────────────────────────────
const areaA = new Float64Array(nTri);
let area3D = 0;
for (let f = 0; f < nTri; f += 1) {
  const o = f * 9;
  const ux = xyz[o + 3] - xyz[o], uy = xyz[o + 4] - xyz[o + 1], uz = xyz[o + 5] - xyz[o + 2];
  const vx = xyz[o + 6] - xyz[o], vy = xyz[o + 7] - xyz[o + 1], vz = xyz[o + 8] - xyz[o + 2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  const a = 0.5 * Math.hypot(cx, cy, cz);
  areaA[f] = a; area3D += a;
}
log(`── T1 GEOMETRY ── total 3D area ${area3D.toFixed(3)} mm2   (claim 49604.859)`);
log('');

// ── T2: R1 exhaustive at k=8, independent reproduction ────────────────────────────────────
const LAT = latticePts(K); const NP = LAT.length / 3;
const r1 = new Float64Array(nTri);
{
  const t0 = Date.now();
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > w) w = dd;
    }
    r1[f] = w;
  }
  let nH = 0, aH = 0, nL = 0, aL = 0, mx = 0;
  for (let f = 0; f < nTri; f += 1) { const d = r1[f]; if (d > BAR_HI) { nH += 1; aH += areaA[f]; } if (d > BAR_LO) { nL += 1; aL += areaA[f]; } if (d > mx) mx = d; }
  log(`── T2 R1 RADIAL, EXHAUSTIVE k=${K} (${NP} pts) in ${((Date.now() - t0) / 1000).toFixed(1)}s ──`);
  log(`   >HI  ${nH} (${pct(nH, nTri)}%)  ${aH.toFixed(3)} mm2 = ${pct(aH, area3D)}% OF MESH   (claim 185853 / 5768.685 / 11.6293%)`);
  log(`   >LO  ${nL} (${pct(nL, nTri)}%)  ${aL.toFixed(3)} mm2 = ${pct(aL, area3D)}% OF MESH   (claim 1400455 / 48367.238 / 97.5050%)`);
  log(`   MAX  ${mx.toExponential(4)} mm   (claim 1.5114e+0)`);
  log('');
}

// ── T3: reproduce the claim's R3 tallies from the stored per-facet binary ─────────────────
let r3stored: Float32Array | null = null;
if (R3BIN.length > 0) {
  const buf = readFileSync(R3BIN);
  r3stored = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  let nH = 0, aH = 0, nL = 0, aL = 0, mx = 0;
  for (let f = 0; f < nTri; f += 1) { const d = r3stored[f]; if (d > BAR_HI) { nH += 1; aH += areaA[f]; } if (d > BAR_LO) { nL += 1; aL += areaA[f]; } if (d > mx) mx = d; }
  log(`── T3 R3 STORED (top-4 lattice pts), reproduced from ${R3BIN} ──`);
  log(`   >HI  ${nH} (${pct(nH, nTri)}%)  ${aH.toFixed(3)} mm2 = ${pct(aH, area3D)}% OF MESH   (claim 100031 / 1247.746 / 2.5154%)`);
  log(`   >LO  ${nL} (${pct(nL, nTri)}%)  ${aL.toFixed(3)} mm2 = ${pct(aL, area3D)}% OF MESH   (claim 1328037 / 47377.039 / 95.5089%)`);
  log(`   MAX  ${mx.toExponential(4)} mm   (claim 8.5085e-1)`);
  log('');
}

// ── T4: THE CORE TEST — re-adjudicate the DISPUTED set at ALL 45 lattice points ───────────
const proj = buildRadialSurfaceProjector(rA, { H, nTheta: PROJ_NTH, nZ: PROJ_NZ, seedTopK: PROJ_K });
const r3full = new Float64Array(nTri);
{
  // classify against the claim's own bars
  const disputed: number[] = [];
  const overSet: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    if (r1[f] <= BAR_HI) continue;                        // certified by the upper bound; untouched
    if (r3stored !== null && r3stored[f] > BAR_HI) overSet.push(f);
    else disputed.push(f);
  }
  log(`── T4 FULL-LATTICE R3 RE-ADJUDICATION (EXHAUSTIVE over the disputed set, no stride) ──`);
  log(`   R1>HI facets ${disputed.length + overSet.length}   of which claim CLEARED (disputed) ${disputed.length}, claim OVER ${overSet.length}`);
  log(`   projector calls this pass: ${(disputed.length + overSet.length) * NP}`);
  const t0 = Date.now();
  let c2viol = 0;
  const runSet = (set: number[]): void => {
    for (const f of set) {
      const o = f * 9;
      const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
      const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
      const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
      let best = 0;
      for (let p = 0; p < NP; p += 1) {
        const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
        const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
        const rad = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        const d = proj.project(x, y, z).dist;
        if (d > rad + 1e-9) c2viol += 1;                 // CONTROL: R3 must never exceed R1 pointwise
        if (d > best) best = d;
      }
      r3full[f] = best;
    }
  };
  runSet(disputed); runSet(overSet);
  log(`   done in ${((Date.now() - t0) / 1000).toFixed(1)}s   C2 pointwise R3>R1 violations ${c2viol}  ${c2viol === 0 ? 'CONTROL HOLDS' : '*** CONTROL FIRES — RUN VOID ***'}`);

  // how many of the CLEARED facets actually break the bar under matched sampling?
  let nFlip = 0, aFlip = 0, mxFlip = 0;
  for (const f of disputed) { if (r3full[f] > BAR_HI) { nFlip += 1; aFlip += areaA[f]; if (r3full[f] > mxFlip) mxFlip = r3full[f]; } }
  log('');
  log(`   *** FACETS THE CLAIM CLEARED THAT THE MATCHED-SAMPLING RULER DOES NOT: ***`);
  log(`       ${nFlip} facets (${pct(nFlip, nTri)}% of mesh count)   ${aFlip.toFixed(3)} mm2 = ${pct(aFlip, area3D)}% OF MESH   MAX ${mxFlip.toExponential(4)} mm`);
  log(`       that is ${pct(nFlip, disputed.length)}% of the disputed set BY COUNT`);

  // corrected headline: R3 at matched 45-pt sampling over every R1>HI facet
  let nH = 0, aH = 0, mx = 0;
  for (let f = 0; f < nTri; f += 1) {
    const d = r1[f] > BAR_HI ? r3full[f] : r1[f];        // R1<=HI is certified: R3<=R1<=HI
    if (d > BAR_HI) { nH += 1; aH += areaA[f]; }
    if (d > mx) mx = d;
  }
  log('');
  log(`   CORRECTED R3 (matched ${NP}-pt lattice, exhaustive over all R1>HI facets):`);
  log(`       >HI  ${nH} (${pct(nH, nTri)}%)   ${aH.toFixed(3)} mm2 = ${pct(aH, area3D)}% OF MESH   MAX ${mx.toExponential(4)} mm`);
  log(`       CLAIM said 100031 / 1247.746 mm2 / 2.5154% / MAX 8.5085e-1`);
  log('');
}

// ── T5: SCAR 2 for R3 — was never swept. k=8 vs k=16 on a sub-ladder. ────────────────────
{
  log(`── T5 SCAR 2 ON R3 (never swept in the claim): lattice order ladder ──`);
  const cand: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (r1[f] > BAR_HI) cand.push(f);
  const stride = Math.max(1, Math.floor(cand.length / K2_N));
  const sub: number[] = [];
  for (let i = 0; i < cand.length; i += stride) sub.push(cand[i]);
  log(`   sub-ladder on ${sub.length} facets strided 1-in-${stride} out of the ${cand.length} R1>HI facets`);
  log(`     k    pts        MAX R3 mm      >HI count    >HI of sub`);
  for (const k of [4, 8, K2, 24]) {
    const L = latticePts(k); const np = L.length / 3;
    let mx = 0, nH = 0;
    for (const f of sub) {
      const o = f * 9;
      const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
      const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
      const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
      let best = 0;
      for (let p = 0; p < np; p += 1) {
        const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
        const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
        const d = proj.project(x, y, z).dist;
        if (d > best) best = d;
      }
      if (best > mx) mx = best; if (best > BAR_HI) nH += 1;
    }
    log(`   ${String(k).padStart(4)}  ${String(np).padStart(5)}    ${mx.toExponential(4).padStart(13)}   ${String(nH).padStart(10)}    ${pct(nH, sub.length)}%`);
  }
  log('');
}

// ── T6: PRECOND — how far does the perpendicular ruler actually reach? ───────────────────
{
  log(`── T6 PRECOND: the claim says "HONEST PRECOND = 0.002 um MAX" from 4 adjudicated corners ──`);
  // radial residual at every corner, exhaustive
  const nC = nTri * 3;
  let over1um = 0, over02um = 0, mxRad = 0;
  const hot: number[] = [];
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    for (let v = 0; v < 3; v += 1) {
      const x = xyz[o + v * 3], y = xyz[o + v * 3 + 1], z = xyz[o + v * 3 + 2];
      const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)) * 1000; // um
      if (d > mxRad) mxRad = d;
      if (d > 1) over1um += 1;
      if (d > 0.02) { over02um += 1; if (hot.length < 400000) hot.push(f * 3 + v); }
    }
  }
  log(`   corners ${nC}   MAX radial ${mxRad.toFixed(3)} um   (claim 1374.778)   over 1 um ${over1um} (claim 4)   over 0.02 um ${over02um}`);
  let mxPerp = 0;
  for (const ci of hot) {
    const f = Math.floor(ci / 3), v = ci % 3; const o = f * 9;
    const d = proj.project(xyz[o + v * 3], xyz[o + v * 3 + 1], xyz[o + v * 3 + 2]).dist * 1000;
    if (d > mxPerp) mxPerp = d;
  }
  log(`   PERPENDICULAR max over ALL ${hot.length} corners above 0.02 um radial: ${mxPerp.toFixed(4)} um`);
  log(`   (the claim adjudicated only the 4 worst-RADIAL corners and quoted 0.002 um as the mesh-wide precond)`);
  log('');
}

// ── T7: topology + fold ladder, analytic-free, independent ───────────────────────────────
{
  const idx = new Uint32Array(nTri * 3);
  for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
  const t0 = Date.now();
  const R = facetDihedrals(xyz, idx);
  log(`── T7 TOPOLOGY + DIHEDRAL, analytic-free, in ${((Date.now() - t0) / 1000).toFixed(1)}s ──`);
  log(`   interior ${R.interiorEdges}  boundary ${R.boundaryEdges}  NON-MANIFOLD ${R.nonManifoldEdges}  INCONSISTENT ${R.inconsistentEdges}`);
  log(`   (claim: interior 2571657, boundary 600, NM 0, INC 0)`);
  const pf = R.perFacetMaxRad;
  for (const barDeg of [45, 90, 150, 163.374, 170, 175, 179.5]) {
    const b = (barDeg * Math.PI) / 180;
    let n = 0, a = 0, mx = 0;
    for (let f = 0; f < nTri; f += 1) { const d = pf[f]; if (d > b) { n += 1; a += areaA[f]; } if (d > mx) mx = d; }
    log(`   bar ${barDeg.toFixed(3).padStart(8)} deg   count ${String(n).padStart(8)}   area ${a.toFixed(3).padStart(11)} mm2 = ${pct(a, area3D)}% OF MESH   MAX ${((mx * 180) / Math.PI).toFixed(3)}`);
  }
}
log('');
log('REV-S116 VERIFY DONE');
