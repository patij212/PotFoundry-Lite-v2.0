// s113opOracleB.ts — OPERATOR 4, PART B. DIAGNOSING MY OWN ORACLE, AND THE EMPIRICAL CEILING.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. Part A (`s113opOracle.ts`) returned two numbers, one of which indicts the other:
//
//   * IRREDUCIBLE by the VISIBLE metric = 99.40% of the target area. PR1 survived.
//   * ORACLE single-flank normDeg UB p50 30.27 deg, i.e. only a 2.3x reduction. PR2 FALSIFIED.
//
// and in the SAME run the CONFORMED CONTROL — 300 real wall facets of this very mesh, sitting beside
// creases of sep p50 153 deg, that the S112 funnel classed as already-aligned — measured normDeg
// p50 2.098 deg, MAX 3.56 deg. *** A REAL MESH ACHIEVES 2 DEG WHERE MY ANALYTIC ORACLE CLAIMS A 30-DEG
// FLOOR. *** An oracle that a shipped mesh already beats by 14x is not an oracle; it is a broken
// instrument. Part A's PR2 number must not be reported as a result. This file finds out why and replaces
// it with a measurement.
//
// TWO CANDIDATE MECHANISMS FOR THE 30 DEG, BOTH TESTED HERE:
//  (M1) C=2 IS TOO FEW. A footprint at an arch cusp can hold more than one crease. Forced into two
//       clusters, one cluster absorbs two flanks and its "within-flank spread" is really a second crease.
//       Part A measured within-flank spread p50 53.4 deg — far too large for a smooth 0.3 mm patch.
//       => sweep the cluster count C = 1..8 and watch the within-cluster minimax fall.
//  (M2) FIXED FOOTPRINT IS THE WRONG CEILING. The brief's oracle may place vertices ANYWHERE on the
//       analytic surface, so it may also REFINE inside a flank. Within a flank the surface is smooth and
//       the angle decays with h (S112 H2's smooth control: x28.43 over five halvings), so the fixed-
//       footprint number is not a floor at all.
//       => a REFINEMENT LADDER: subdivide the footprint 4^L ways, drop the sub-triangles that straddle
//       (the oracle cuts exactly there), and report the max minimax over the PURE ones vs L.
//
// AND THE MEASUREMENT THAT NEEDS NO CLUSTERING AT ALL — THE EMPIRICAL CEILING:
//       The mesh already contains its own answer. 13,092 wall pairs have a dihedral over 45 deg; only
//       3,282 of them straddle. The rest are ALIGNED to the same creases at the same scale. What normDeg
//       do they achieve, and — the whole question — do they STILL show a >45 deg dihedral? If they do,
//       the visible metric survives perfect alignment and IRREDUCIBILITY is demonstrated with no
//       analytic clustering anywhere in the chain.
//       The conformed/straddling split used here is GEOMETRIC (minority-flank share of the INTERIOR
//       lattice), never normDeg, so it cannot be circular with the quantity it then reports.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED FOR PART B, before the run.
//  PB1  The C-ladder explains M1: max within-cluster minimax at C=4 is under HALF its C=2 value.
//  PB2  The refinement ladder explains M2: the max normDeg over PURE sub-triangles falls by >= 2x per
//       level, i.e. the within-flank residual is smooth curvature and vanishes in the limit.
//  PB3  The EMPIRICAL ceiling: the geometrically-CONFORMED wall facets have normDeg p50 <= 5 deg AND
//       their adjacent dihedral p50 stays over 45 deg.
//  *** KILL LINE for the whole irreducibility claim: if the conformed class's dihedral p50 falls BELOW
//  45 deg, then alignment DOES remove the visible edge and Part A's 99.40% is an artefact. ***
//
// Usage: bash research/tools/run-s113op-oracleb.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STL = process.env.PF_S113OP_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const STYLE = process.env.PF_S113OP_STYLE ?? 'GothicArches';
const TAG = process.env.PF_S113OP_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_S113OP_H', 120), Rb: envF('PF_S113OP_RB', 40), Rt: envF('PF_S113OP_RT', 50), expn: 1 };
const H = DIMS.H;
const VIS_DEG = envF('PF_S113OP_VIS', 45);
const K_LAT = Math.round(envF('PF_S113OPB_K', 12));
const K_FINE = Math.round(envF('PF_S113OPB_KFINE', 48));
const H_FD = envF('PF_S113OP_HFD', 2e-4);
const K_OBS = 8;
const SUBN = Math.round(envF('PF_S113OPB_SUBN', 300));
const MINOR_CONF = envF('PF_S113OPB_MINCONF', 0.02);   // <= this minority share of INTERIOR pts = conformed
const MINOR_STRAD = envF('PF_S113OPB_MINSTRAD', 0.20); // >= this = straddling
const DEG = 180 / Math.PI;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const scratch = new Float64Array(12);
const nsObs = fdNormals(rA, H, 2e-4, 2e-4);
const nsMain = fdNormals(rA, H, H_FD, H_FD);

log('===== S113-OP4 PART B — DIAGNOSING THE ORACLE, AND THE EMPIRICAL CEILING =====');
log(`style ${STYLE}  tag ${TAG}   K=${K_LAT} Kfine=${K_FINE} h=${H_FD}`);
log('PRE-REGISTERED: PB1 C=4 halves the C=2 within-cluster minimax; PB2 refinement halves per level;');
log(`PB3 conformed normDeg p50 <= 5 deg AND conformed dihedral p50 still > ${VIS_DEG} deg.`);
log(`*** KILL: if the CONFORMED class dihedral p50 < ${VIS_DEG} deg, alignment removes the visible edge and`);
log('    Part A\'s irreducibility headline is an artefact. ***');
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  ${el()}`);
log('');

// ── shared geometry ────────────────────────────────────────────────────────────────────────────────────
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const [ath, bth, cth] = th3(f);
  const rRef = rRefOf(f);
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};
/** lattice sample of a footprint; keeps the barycentric weights so sub-triangles can be re-cut. */
interface Samp { n: Float64Array; wa: Float64Array; wb: Float64Array; m: number }
function sampleFacet(f: number, k: number, inset: number, ns: NormalSampler): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3); const wa = new Float64Array(cap * 4); const wb = new Float64Array(cap * 4);
  const sh = 1 - inset; const sc = inset / 3;
  let m = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const a = sh * (i / k) + sc; const b = sh * (j / k) + sc; const c = 1 - a - b;
      const nc = ns(a * ath + b * bth + c * cth, a * az + b * bz + c * cz, scratch);
      for (let qi = 0; qi < nc; qi += 1) {
        n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
        wa[m] = a; wb[m] = b; m += 1;
      }
    }
  }
  return { n, wa, wb, m };
}
/** k-means on the sphere with C clusters, seeded farthest-point. Returns labels. */
function kMeans(n: Float64Array, idx: number[], C: number): { lab: Int32Array; cent: Float64Array } {
  const m = idx.length;
  const lab = new Int32Array(m);
  const cent = new Float64Array(C * 3);
  if (m === 0) return { lab, cent };
  cent[0] = n[idx[0] * 3]; cent[1] = n[idx[0] * 3 + 1]; cent[2] = n[idx[0] * 3 + 2];
  for (let c = 1; c < C; c += 1) {
    let bi = idx[0]; let bd = -1;
    for (const i of idx) {
      let near = Infinity;
      for (let cc = 0; cc < c; cc += 1) near = Math.min(near, angU(n, i * 3, cent, cc * 3));
      if (near > bd) { bd = near; bi = i; }
    }
    cent[c * 3] = n[bi * 3]; cent[c * 3 + 1] = n[bi * 3 + 1]; cent[c * 3 + 2] = n[bi * 3 + 2];
  }
  for (let it = 0; it < 25; it += 1) {
    const sx = new Float64Array(C); const sy = new Float64Array(C); const sz = new Float64Array(C);
    for (let t = 0; t < m; t += 1) {
      const i = idx[t]; let bc = 0; let bd = Infinity;
      for (let c = 0; c < C; c += 1) { const a = angU(n, i * 3, cent, c * 3); if (a < bd) { bd = a; bc = c; } }
      lab[t] = bc; sx[bc] += n[i * 3]; sy[bc] += n[i * 3 + 1]; sz[bc] += n[i * 3 + 2];
    }
    for (let c = 0; c < C; c += 1) {
      const L = Math.hypot(sx[c], sy[c], sz[c]);
      if (L > 0) { cent[c * 3] = sx[c] / L; cent[c * 3 + 1] = sy[c] / L; cent[c * 3 + 2] = sz[c] / L; }
    }
  }
  return { lab, cent };
}
/** two-sided bracket on the best single plane over a normal set: UB = achievable, LB = half-diameter. */
function minimax(n: Float64Array, idx: number[]): { ub: number; lb: number } {
  const m = idx.length;
  if (m === 0) return { ub: 0, lb: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (const i of idx) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  const L = Math.hypot(sx, sy, sz) || 1;
  const cur = new Float64Array([sx / L, sy / L, sz / L]);
  const worstOf = (): { a: number; i: number } => {
    let a = -1; let bi = idx[0];
    for (const i of idx) { const t = angU(n, i * 3, cur, 0); if (t > a) { a = t; bi = i; } }
    return { a, i: bi };
  };
  let ub = worstOf().a;
  for (let it = 0; it < 120; it += 1) {
    const w = worstOf(); const lam = 0.5 / (it + 2);
    const tx = (1 - lam) * cur[0] + lam * n[w.i * 3];
    const ty = (1 - lam) * cur[1] + lam * n[w.i * 3 + 1];
    const tz = (1 - lam) * cur[2] + lam * n[w.i * 3 + 2];
    const l2 = Math.hypot(tx, ty, tz) || 1;
    cur[0] = tx / l2; cur[1] = ty / l2; cur[2] = tz / l2;
    const a = worstOf().a; if (a < ub) ub = a;
  }
  let diam = 0;
  for (let a = 0; a < m; a += 1) for (let b = a + 1; b < m; b += 1) {
    const t = angU(n, idx[a] * 3, n, idx[b] * 3); if (t > diam) diam = t;
  }
  return { ub, lb: 0.5 * diam };
}
const obsNorm = (f: number, inset: number): number => {
  const [ath, bth, cth] = th3(f);
  return orientOfFacet(nsObs, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_OBS, inset, orient: 'outward', scratch }).normDeg;
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE A — THE EMPIRICAL CEILING. No clustering in the verdict chain: the split is the minority-flank
// share of the INTERIOR lattice (a geometric fact about where the crease sits relative to the facet),
// and the quantities reported are the mesh's own normDeg and its own adjacent dihedral.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Cls { f: number; minor: number; sepDeg: number; dihDeg: number; area: number; n05: number; n10: number }
const rowsA: Cls[] = [];
{
  const hiThr = (VIS_DEG * Math.PI) / 180;
  const wallF = new Set<number>();
  const dihOf = new Map<number, number>();
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] > hiThr)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (graphRatio(f1) > 8 || graphRatio(f2) > 8) continue;
    for (const f of [f1, f2]) {
      wallF.add(f);
      dihOf.set(f, Math.max(dihOf.get(f) ?? 0, d.edgeAngRad[e] * DEG));
    }
  }
  log(`── STAGE A: the WALL + dihedral>${VIS_DEG} class — ${wallF.size} unique facets (S112 funnel: 13,092 PAIRS) ──`);
  for (const f of wallF) {
    // INTERIOR lattice (inset 0.1) so a crease touching only the boundary does not count as straddling
    const s = sampleFacet(f, K_LAT, 0.1, nsMain);
    const idx: number[] = []; for (let i = 0; i < s.m; i += 1) idx.push(i);
    const km = kMeans(s.n, idx, 2);
    let nA = 0; for (let i = 0; i < s.m; i += 1) if (km.lab[i] === 0) nA += 1;
    const minor = Math.min(nA, s.m - nA) / Math.max(1, s.m);
    const sepDeg = angU(km.cent, 0, km.cent, 3) * DEG;
    rowsA.push({
      f, minor, sepDeg, dihDeg: dihOf.get(f) ?? 0, area: d.areaMm2[f],
      n05: obsNorm(f, 0.05), n10: obsNorm(f, 0.1),
    });
  }
  const conf = rowsA.filter((r) => r.minor <= MINOR_CONF && r.sepDeg >= VIS_DEG);
  const strad = rowsA.filter((r) => r.minor >= MINOR_STRAD && r.sepDeg >= VIS_DEG);
  const mid = rowsA.filter((r) => r.sepDeg >= VIS_DEG && r.minor > MINOR_CONF && r.minor < MINOR_STRAD);
  const noCrease = rowsA.filter((r) => r.sepDeg < VIS_DEG);
  const rep = (name: string, v: Cls[]): void => {
    let a = 0; for (const r of v) a += r.area;
    log(`  ${name}`);
    log(`     COUNT ${v.length}  AREA ${a.toFixed(4)} mm2 = ${((a / meshArea) * 100).toFixed(4)}% of mesh`);
    log(`     normDeg inset0.05  p50 ${q(v.map((r) => r.n05), 0.5).toFixed(3)}  p90 ${q(v.map((r) => r.n05), 0.9).toFixed(2)}  MAX ${mx(v.map((r) => r.n05)).toFixed(2)} deg`);
    log(`     normDeg inset0.10  p50 ${q(v.map((r) => r.n10), 0.5).toFixed(3)}  p90 ${q(v.map((r) => r.n10), 0.9).toFixed(2)}  MAX ${mx(v.map((r) => r.n10)).toFixed(2)} deg`);
    log(`     ADJACENT DIHEDRAL  p10 ${q(v.map((r) => r.dihDeg), 0.1).toFixed(2)}  p50 ${q(v.map((r) => r.dihDeg), 0.5).toFixed(2)}  p90 ${q(v.map((r) => r.dihDeg), 0.9).toFixed(2)}  MAX ${mx(v.map((r) => r.dihDeg)).toFixed(2)} deg`);
    log(`     analytic sep       p50 ${q(v.map((r) => r.sepDeg), 0.5).toFixed(2)} deg`);
  };
  rep(`CONFORMED-GEOMETRIC (crease present, minority-flank share <= ${MINOR_CONF}):`, conf);
  rep(`STRADDLING-GEOMETRIC (crease present, minority-flank share >= ${MINOR_STRAD}):`, strad);
  rep(`INTERMEDIATE (crease present, minority share between):`, mid);
  rep(`NO CREASE in the interior footprint (sep < ${VIS_DEG} deg):`, noCrease);
  const cd = q(conf.map((r) => r.dihDeg), 0.5);
  const cn = q(conf.map((r) => r.n05), 0.5);
  log('');
  log(`  >>> PB3a  conformed normDeg p50 ${cn.toFixed(3)} deg (bar <= 5): ${cn <= 5 ? 'SURVIVES' : '*** FALSIFIED ***'}`);
  log(`  >>> PB3b  conformed adjacent dihedral p50 ${cd.toFixed(2)} deg (bar > ${VIS_DEG}): ${cd > VIS_DEG ? 'SURVIVES — ALIGNMENT DOES NOT REMOVE THE VISIBLE EDGE' : '*** KILL LINE FIRED: alignment removes the visible edge ***'}`);
  log(`  >>> EMPIRICAL ORACLE CEILING on normDeg = what an already-aligned facet of this mesh achieves`);
  log(`      beside a crease of the same size: p50 ${cn.toFixed(3)}  p90 ${q(conf.map((r) => r.n05), 0.9).toFixed(2)}  MAX ${mx(conf.map((r) => r.n05)).toFixed(2)} deg`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE B — WHY PART A's ANALYTIC ORACLE READ 30 DEG. Two ladders, on the straddling class only.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const strad = rowsA.filter((r) => r.minor >= MINOR_STRAD && r.sepDeg >= VIS_DEG).map((r) => r.f);
  const sub: number[] = [];
  const stride = Math.max(1, Math.floor(strad.length / SUBN));
  for (let i = 0; i < strad.length && sub.length < SUBN; i += stride) sub.push(strad[i]);
  log(`── STAGE B: ${sub.length}-facet subsample of the STRADDLING-GEOMETRIC class  ${el()} ──`);

  // (M1) C-LADDER
  log('  C-LADDER — max within-cluster minimax (deg) as the oracle is allowed more flanks:');
  const samples = sub.map((f) => sampleFacet(f, K_LAT, 0, nsMain));
  for (const C of [1, 2, 3, 4, 6, 8]) {
    const ubs: number[] = []; const lbs: number[] = [];
    for (const s of samples) {
      const idx: number[] = []; for (let i = 0; i < s.m; i += 1) idx.push(i);
      const km = kMeans(s.n, idx, C);
      let ub = 0; let lb = 0;
      for (let c = 0; c < C; c += 1) {
        const g = idx.filter((_, t) => km.lab[t] === c);
        if (g.length === 0) continue;
        const mm = minimax(s.n, g);
        ub = Math.max(ub, mm.ub); lb = Math.max(lb, mm.lb);
      }
      ubs.push(ub * DEG); lbs.push(lb * DEG);
    }
    log(`     C=${C}  UB p50 ${q(ubs, 0.5).toFixed(3)} p90 ${q(ubs, 0.9).toFixed(2)} MAX ${mx(ubs).toFixed(2)}   |  LB p50 ${q(lbs, 0.5).toFixed(3)} MAX ${mx(lbs).toFixed(2)}`);
  }

  // (M2) REFINEMENT LADDER: cut the footprint 4^L ways; drop straddling sub-triangles (the oracle's edge
  // goes exactly there); report the max minimax over the PURE ones. A SMOOTH CONTROL runs the same ladder.
  log(`  REFINEMENT LADDER (K=${K_FINE} parent lattice, 4^L sub-triangles, straddling sub-triangles dropped):`);
  const ladder = (fs: number[], label: string): void => {
    for (let L = 0; L <= 3; L += 1) {
      const nDiv = 1 << L;
      const pureUB: number[] = []; const pureFrac: number[] = [];
      for (const f of fs) {
        const s = sampleFacet(f, K_FINE, 0, nsMain);
        const buck = new Map<number, number[]>();
        for (let i = 0; i < s.m; i += 1) {
          const ia = Math.min(nDiv - 1, Math.floor(s.wa[i] * nDiv));
          const ib = Math.min(nDiv - 1, Math.floor(s.wb[i] * nDiv));
          const ic = Math.min(nDiv - 1, Math.floor((1 - s.wa[i] - s.wb[i]) * nDiv));
          const up = ia + ib + ic === nDiv - 1 ? 0 : 1;
          const key = ((ia * nDiv + ib) * 2) + up;
          if (!buck.has(key)) buck.set(key, []);
          (buck.get(key) as number[]).push(i);
        }
        let worst = 0; let nPure = 0; let nTot = 0;
        for (const g of buck.values()) {
          if (g.length < 3) continue;
          nTot += 1;
          const km = kMeans(s.n, g, 2);
          let na = 0; for (let t = 0; t < g.length; t += 1) if (km.lab[t] === 0) na += 1;
          const minor = Math.min(na, g.length - na) / g.length;
          const sep = angU(km.cent, 0, km.cent, 3) * DEG;
          if (sep >= VIS_DEG && minor > 0.1) continue;    // STRADDLES: the oracle cuts here, not scored
          nPure += 1;
          const mm = minimax(s.n, g);
          worst = Math.max(worst, mm.ub * DEG);
        }
        if (nPure > 0) { pureUB.push(worst); pureFrac.push(nPure / Math.max(1, nTot)); }
      }
      log(`     ${label} L=${L} (${nDiv}x${nDiv})  PURE sub-tris ${(q(pureFrac, 0.5) * 100).toFixed(1)}%  max-normDeg over pure: p50 ${q(pureUB, 0.5).toFixed(4)} p90 ${q(pureUB, 0.9).toFixed(3)} MAX ${mx(pureUB).toFixed(3)} deg`);
    }
  };
  ladder(sub.slice(0, Math.min(120, sub.length)), 'STRADDLING');
  // SMOOTH CONTROL for the same ladder: it must decay too, or the ladder measures nothing.
  const inHi = new Set(rowsA.map((r) => r.f));
  const ctl: number[] = []; let seed = 999;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let t = 0; t < 300000 && ctl.length < 60; t += 1) {
    const f = Math.floor(rnd() * nTri);
    if (inHi.has(f) || d.perFacetMaxRad[f] >= (2 * Math.PI) / 180 || graphRatio(f) > 8) continue;
    ctl.push(f);
  }
  ladder(ctl, 'SMOOTH-CTL');
  log('');
}

writeFileSync(`${OUTDIR}/S113OPB_ORACLE_${TAG}.ndjson`, `${rowsA.map((r) => JSON.stringify(r)).join('\n')}\n`);
log(`wrote ${OUTDIR}/S113OPB_ORACLE_${TAG}.ndjson  (${rowsA.length} rows)`);
log(`done ${el()}`);
