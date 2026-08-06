// s113opOracle.ts — OPERATOR 4: THE ORACLE UPPER BOUND ON THE CREASE PROGRAMME.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION. Not "how good is my aligned-edge operator" — "what is the BEST any aligned-edge operator
// COULD do on this class". A ceiling, computed, not an implementation optimised.
//
// THE DECOMPOSITION. A crease divides a facet's footprint into FLANKS. Inside one flank the surface is
// smooth. So an oracle that puts mesh edges exactly ON the crease and vertices anywhere on the analytic
// surface can drive each child facet's normDeg down to the flank's OWN normal variation over its
// footprint — but it CANNOT remove the turn ACROSS the crease, because that turn is the surface. Two
// facets abutting a genuine 140-deg crease have normals 140 deg apart in ANY correct mesh, and a
// dihedral-based visibility test (S108's >45 deg) will flag them forever.
//
//   REDUCIBLE   := the mesh's own contribution — a facet STRADDLING the crease reads the whole turn as
//                  its own orientation error. An aligned edge removes it.
//   IRREDUCIBLE := the surface's own contribution — the analytic across-crease turn. No mesh removes it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, WRITTEN BEFORE THE FIRST RUN.
//
//  PR1 (PRIMARY, the ceiling). >= 60% of the target set's 69.826 mm2 sits on a neighbourhood whose
//      ANALYTIC across-crease turn is >= 45 deg — i.e. IRREDUCIBLE by the very metric (dihedral > 45)
//      that defined the visible class. *** KILL LINE: if that share is < 60% by AREA, PR1 is FALSIFIED
//      and the crease programme has real visible-metric headroom on the majority of this class. ***
//      Rationale for expecting it: S110 measured the analytic surface genuinely bending 135-157 deg
//      across 79% of these footprints. If that is right, the visible edge is CORRECT GEOMETRY.
//
//  PR2 (SECONDARY, the fidelity side). The per-facet normDeg IS largely reducible: median observed
//      normDeg >= 10x the median oracle single-flank normDeg upper bound.
//      *** KILL LINE: falsified if < 3x. *** If it fails, the flanks themselves are not smooth enough
//      for the "confine to one flank" premise and this whole oracle bounds nothing.
//
//  CONTROL KILL (voids the run, not a result). The flank classifier is run on a SMOOTH control — wall
//      facets with adjacent dihedral < 2 deg. If it labels > 5% of them as containing a crease, it is
//      manufacturing creases out of smooth curvature and EVERY number here is void.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// INSTRUMENT DISCIPLINE — each answering a scar this lineage has already paid for.
//  * COUNT + AREA-SHARE + MAX, always, never one of the three. Area over the UNIQUE facet set.
//  * TWO-SIDED BARS. The oracle normDeg is reported as a BRACKET: a Chebyshev-centre upper bound (an
//    achievable value, hence a valid UB on the minimax) and a half-diameter lower bound (valid by the
//    triangle inequality). A degenerate implementation cannot satisfy both.
//  * FOOTPRINTS, NOT ENDPOINTS. Every angle here is taken over an order-K lattice of the footprint. The
//    across-crease turn is estimated from the CLOSEST CROSS-FLANK SAMPLE PAIRS, not from two endpoints.
//  * OPTION DEFAULTS ARE MEASUREMENT CHOICES. `inset` is passed explicitly everywhere and swept
//    {0, 0.02, 0.05, 0.1}; the finite-difference step h is swept; the lattice order K is swept.
//  * DIFF PRINTED VALUES AGAINST A CONTROL. Stage 0 re-derives measDeg and area for all 3,282 rows from
//    the STL and diffs them against the pinned dump. A non-zero diff VOIDS the run.
//  * WINDING IS NOT ASSUMED. `facetDihedrals` measures normals AS WOUND; an inverted facet reads
//    180-theta. Stage 1 audits the sign of every target facet against the analytic outward normal and
//    reports a winding-corrected dihedral alongside the as-wound one, because comparing an as-wound
//    dihedral to an analytic turn without that audit is exactly how S97/S98 mislabelled a census.
//
// Usage: bash research/tools/run-s113op-oracle.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, radialNormal, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const NDJ = process.env.PF_S113OP_NDJSON ?? 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson';
const STL = process.env.PF_S113OP_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const STYLE = process.env.PF_S113OP_STYLE ?? 'GothicArches';
const TAG = process.env.PF_S113OP_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/straddle';
const DIMS: StyleDims = { H: envF('PF_S113OP_H', 120), Rb: envF('PF_S113OP_RB', 40), Rt: envF('PF_S113OP_RT', 50), expn: 1 };
const H = DIMS.H;

const K_LAT = Math.round(envF('PF_S113OP_K', 12));       // lattice order for the flank decomposition
const H_FD = envF('PF_S113OP_HFD', 2e-4);                // finite-difference step, mm (arc and z)
const SEP_MIN = envF('PF_S113OP_SEPMIN', 15);            // deg: a flank split must beat this to be a crease
const VIS_DEG = envF('PF_S113OP_VIS', 45);               // S108's visibility cut, deg
const BAR_DEG = envF('PF_S113OP_BAR', 10);               // the dump's normHi bar, deg
const NCROSS = Math.round(envF('PF_S113OP_NCROSS', 8));  // closest cross-flank pairs used for the crease turn
const K_OBS = Math.round(envF('PF_S113OP_KOBS', 8));     // k for the OBSERVED normDeg (matches the dump)
const INSET_OBS = envF('PF_S113OP_INSET', 0.05);         // honest inset on the crease class (S112)
const SUBN = Math.round(envF('PF_S113OP_SUBN', 400));    // ladder subsample size
const CTLN = Math.round(envF('PF_S113OP_CTLN', 600));    // smooth-control size
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
const nsObs = fdNormals(rA, H, 2e-4, 2e-4);   // the dump's sampler, for the OBSERVED normDeg

log('===== S113-OP4 — THE ORACLE UPPER BOUND ON THE ALIGNED-EDGE (CREASE) PROGRAMME =====');
log(`style ${STYLE}  tag ${TAG}`);
log(`lattice K=${K_LAT}  fd h=${H_FD} mm  sepMin=${SEP_MIN} deg  visibility=${VIS_DEG} deg  bar=${BAR_DEG} deg`);
log('');
log('PRE-REGISTERED (see file header):');
log(`  PR1  IRREDUCIBLE (analytic across-crease turn >= ${VIS_DEG} deg) >= 60% of target AREA.  KILL if < 60%.`);
log('  PR2  median observed normDeg >= 10x median oracle single-flank UB.  KILL if < 3x.');
log('  CTL  smooth control crease-labelled rate <= 5%.  VOIDS THE RUN if higher.');
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD, PRECOND, AND RECONCILE AGAINST THE PINNED DUMP
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Loc { f: number; edge: number; s: number; turnDeg: number; hFinal: number }
interface Row {
  e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number;
  spread1: number; spread2: number; area1: number; area2: number; gr1: number; gr2: number;
  onEdge: boolean; onSeg: boolean; z: number; thDeg: number; thMod30: number;
  tri1: number[]; tri2: number[]; shared: number[]; locs: Loc[];
}
const rows: Row[] = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2).map((l) => JSON.parse(l) as Row);
log(`loaded ${rows.length} pinned pairs from ${NDJ}   (S112/S113: 3282)`);
if (rows.length !== 3282) log('*** WARNING: row count differs from the pinned 3,282 — membership has drifted. ***');

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
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  inconsistent ${d.inconsistentEdges}  ${el()}`);

// CONTROL: re-derive the dump's own printed values from the STL. A drift voids everything downstream.
{
  let dMeas = 0; let dArea = 0; let dCoord = 0;
  for (const r of rows) {
    dMeas = Math.max(dMeas, Math.abs(d.edgeAngRad[r.e] * DEG - r.measDeg));
    dArea = Math.max(dArea, Math.abs(d.areaMm2[r.f1] - r.area1), Math.abs(d.areaMm2[r.f2] - r.area2));
    for (let i = 0; i < 9; i += 1) {
      dCoord = Math.max(dCoord, Math.abs(xyz[r.f1 * 9 + i] - r.tri1[i]), Math.abs(xyz[r.f2 * 9 + i] - r.tri2[i]));
    }
  }
  log(`CONTROL vs pinned dump: max |dmeasDeg| ${dMeas.toExponential(2)}  max |darea| ${dArea.toExponential(2)}  max |dcoord| ${dCoord.toExponential(2)}`);
  if (dMeas > 1e-9 || dArea > 1e-12 || dCoord > 0) {
    log('*** CONTROL FIRED: the STL and the pinned dump disagree. THE RUN IS VOID. ***');
    process.exit(5);
  }
}

const uniqF: number[] = [];
{
  const seen = new Set<number>();
  for (const r of rows) { for (const f of [r.f1, r.f2]) if (!seen.has(f)) { seen.add(f); uniqF.push(f); } }
}
let targetArea = 0;
for (const f of uniqF) targetArea += d.areaMm2[f];
log(`TARGET SET: ${rows.length} pairs, ${uniqF.length} unique facets, AREA ${targetArea.toFixed(3)} mm2 = ${((targetArea / meshArea) * 100).toFixed(4)}% of mesh  (pinned: 6193 / 69.826 / 0.1816%)`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// GEOMETRY HELPERS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
  const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
  return [a, b, c];
};
const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
  + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
function woundNormal(f: number, out: Float64Array): void {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz);
  if (L > 0) { nx /= L; ny /= L; nz /= L; }
  out[0] = nx; out[1] = ny; out[2] = nz;
}
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};

/** Sampled footprint: unit normals (3 each) plus the (rRef*theta, z) parameter point each came from. */
interface Samp { n: Float64Array; pth: Float64Array; pz: Float64Array; m: number; multi: number; pts: number }
function sampleFacet(f: number, k: number, inset: number, ns: NormalSampler): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const rRef = rRefOf(f);
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
  const sh = 1 - inset; const sc = inset / 3;
  let m = 0; let multi = 0; let pts = 0;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = ns(th, z, scratch);
      pts += 1; if (nc > 1) multi += 1;
      for (let qi = 0; qi < nc; qi += 1) {
        n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
        pth[m] = rRef * th; pz[m] = z; m += 1;
      }
    }
  }
  return { n, pth, pz, m, multi, pts };
}

/** 2-means on the sphere. Returns labels, centres, and the centre separation. */
interface Split { lab: Int8Array; c: Float64Array; nA: number; nB: number; sepRad: number; wA: number; wB: number }
function twoMeans(n: Float64Array, m: number): Split {
  const lab = new Int8Array(m); const c = new Float64Array(6);
  if (m === 0) return { lab, c, nA: 0, nB: 0, sepRad: 0, wA: 0, wB: 0 };
  // seed: mean -> farthest -> farthest from that
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < m; i += 1) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  let L = Math.hypot(sx, sy, sz); if (!(L > 0)) L = 1;
  const mean = new Float64Array([sx / L, sy / L, sz / L]);
  let i1 = 0; let best = -1;
  for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, mean, 0); if (a > best) { best = a; i1 = i; } }
  let i2 = 0; best = -1;
  for (let i = 0; i < m; i += 1) { const a = angU(n, i * 3, n, i1 * 3); if (a > best) { best = a; i2 = i; } }
  c[0] = n[i1 * 3]; c[1] = n[i1 * 3 + 1]; c[2] = n[i1 * 3 + 2];
  c[3] = n[i2 * 3]; c[4] = n[i2 * 3 + 1]; c[5] = n[i2 * 3 + 2];
  for (let it = 0; it < 30; it += 1) {
    let ax = 0; let ay = 0; let az = 0; let bx = 0; let by = 0; let bz = 0; let na = 0; let nb = 0;
    for (let i = 0; i < m; i += 1) {
      const da = angU(n, i * 3, c, 0); const db = angU(n, i * 3, c, 3);
      if (da <= db) { lab[i] = 0; ax += n[i * 3]; ay += n[i * 3 + 1]; az += n[i * 3 + 2]; na += 1; }
      else { lab[i] = 1; bx += n[i * 3]; by += n[i * 3 + 1]; bz += n[i * 3 + 2]; nb += 1; }
    }
    if (na > 0) { const l = Math.hypot(ax, ay, az) || 1; c[0] = ax / l; c[1] = ay / l; c[2] = az / l; }
    if (nb > 0) { const l = Math.hypot(bx, by, bz) || 1; c[3] = bx / l; c[4] = by / l; c[5] = bz / l; }
    if (na === 0 || nb === 0) break;
  }
  let nA = 0; let nB = 0; let wA = 0; let wB = 0;
  for (let i = 0; i < m; i += 1) {
    if (lab[i] === 0) { nA += 1; wA = Math.max(wA, angU(n, i * 3, c, 0)); }
    else { nB += 1; wB = Math.max(wB, angU(n, i * 3, c, 3)); }
  }
  return { lab, c, nA, nB, sepRad: nA > 0 && nB > 0 ? angU(c, 0, c, 3) : 0, wA, wB };
}

/**
 * MINIMAX PLANE FIT over a set of unit normals — a two-sided bracket on "the best a single facet plane
 * could do over this flank".  `ub` is the max angle from an explicitly-constructed centre, so it is an
 * ACHIEVABLE value and therefore a valid upper bound. `lb` is half the set diameter, valid by the
 * triangle inequality (no centre can be closer than half the diameter to both extremes).
 */
function minimax(n: Float64Array, idx: number[]): { ub: number; lb: number } {
  const m = idx.length;
  if (m === 0) return { ub: 0, lb: 0 };
  let sx = 0; let sy = 0; let sz = 0;
  for (const i of idx) { sx += n[i * 3]; sy += n[i * 3 + 1]; sz += n[i * 3 + 2]; }
  let L = Math.hypot(sx, sy, sz); if (!(L > 0)) L = 1;
  const c = new Float64Array([sx / L, sy / L, sz / L]);
  const worstOf = (cc: Float64Array): { a: number; i: number } => {
    let a = -1; let bi = idx[0];
    for (const i of idx) { const t = angU(n, i * 3, cc, 0); if (t > a) { a = t; bi = i; } }
    return { a, i: bi };
  };
  let ub = worstOf(c).a;
  const cur = new Float64Array(3); cur.set(c);
  for (let it = 0; it < 120; it += 1) {
    const w = worstOf(cur);
    const lam = 0.5 / (it + 2);
    const tx = (1 - lam) * cur[0] + lam * n[w.i * 3];
    const ty = (1 - lam) * cur[1] + lam * n[w.i * 3 + 1];
    const tz = (1 - lam) * cur[2] + lam * n[w.i * 3 + 2];
    const l2 = Math.hypot(tx, ty, tz) || 1;
    cur[0] = tx / l2; cur[1] = ty / l2; cur[2] = tz / l2;
    const a = worstOf(cur).a;
    if (a < ub) ub = a;
  }
  let diam = 0;
  for (let a = 0; a < m; a += 1) for (let b = a + 1; b < m; b += 1) {
    const t = angU(n, idx[a] * 3, n, idx[b] * 3); if (t > diam) diam = t;
  }
  return { ub, lb: 0.5 * diam };
}

/** The FLANK DECOMPOSITION of one footprint. */
interface Flank {
  sepDeg: number; nA: number; nB: number; wADeg: number; wBDeg: number; multi: number; pts: number;
  crease: boolean; oracleUB: number; oracleLB: number; diamDeg: number;
}
function decompose(s: Samp): Flank {
  const sp = twoMeans(s.n, s.m);
  const idxA: number[] = []; const idxB: number[] = [];
  for (let i = 0; i < s.m; i += 1) (sp.lab[i] === 0 ? idxA : idxB).push(i);
  const sepDeg = sp.sepRad * DEG;
  const wADeg = sp.wA * DEG; const wBDeg = sp.wB * DEG;
  // A SPLIT IS A CREASE only if it beats the bar AND beats the smooth variation it would otherwise be,
  // AND both flanks carry real support. A pure curvature sweep splits with sep ~ its own spread.
  const minSide = Math.min(idxA.length, idxB.length);
  const crease = sepDeg >= SEP_MIN && minSide >= 2 && sepDeg > Math.max(wADeg, wBDeg);
  const mmA = minimax(s.n, idxA); const mmB = minimax(s.n, idxB);
  let diam = 0;
  for (let a = 0; a < s.m; a += 1) for (let b = a + 1; b < s.m; b += 1) {
    const t = angU(s.n, a * 3, s.n, b * 3); if (t > diam) diam = t;
  }
  return {
    sepDeg, nA: idxA.length, nB: idxB.length, wADeg, wBDeg, multi: s.multi, pts: s.pts, crease,
    oracleUB: (crease ? Math.max(mmA.ub, mmB.ub) : minimax(s.n, idxA.concat(idxB)).ub) * DEG,
    oracleLB: (crease ? Math.max(mmA.lb, mmB.lb) : minimax(s.n, idxA.concat(idxB)).lb) * DEG,
    diamDeg: diam * DEG,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — WINDING AUDIT. Compare an as-wound dihedral to an analytic turn without this and you get S98.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const wn = new Float64Array(3);
const an = new Float64Array(3);
const signOf = new Map<number, number>();
const margOf = new Map<number, number>();
{
  let invN = 0; let invArea = 0; const margins: number[] = [];
  for (const f of uniqF) {
    woundNormal(f, wn);
    const [ath, bth, cth] = th3(f);
    const gth = (ath + bth + cth) / 3;
    const gz = (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
    const r0 = rA(gth, gz); const hTh = 2e-4 / Math.max(1e-9, Math.abs(r0));
    const rt = (rA(gth + hTh, gz) - rA(gth - hTh, gz)) / (2 * hTh);
    const zl = Math.max(0, gz - 2e-4); const zh = Math.min(H, gz + 2e-4);
    const rz = zh > zl ? (rA(gth, zh) - rA(gth, zl)) / (zh - zl) : 0;
    radialNormal(r0, rt, rz, gth, an, 0);
    const dp = wn[0] * an[0] + wn[1] * an[1] + wn[2] * an[2];
    signOf.set(f, dp < 0 ? -1 : 1); margOf.set(f, Math.abs(dp)); margins.push(Math.abs(dp));
    if (dp < 0) { invN += 1; invArea += d.areaMm2[f]; }
  }
  log('── STAGE 1: WINDING AUDIT of the target set (wound normal vs analytic OUTWARD normal at centroid) ──');
  log(`  INVERTED facets: COUNT ${invN} (${((invN / uniqF.length) * 100).toFixed(2)}%)  AREA ${invArea.toFixed(4)} mm2 = ${((invArea / targetArea) * 100).toFixed(2)}% of target`);
  log(`  |dot| margin over all target facets: p10 ${q(margins, 0.1).toFixed(4)} p50 ${q(margins, 0.5).toFixed(4)} p90 ${q(margins, 0.9).toFixed(4)}`);
  log('    (a small margin = the sign decision is a coin toss on that facet; see orientRuler signMargin)');
}

// per-pair as-wound and winding-CORRECTED dihedral
const dihCorr = new Float64Array(rows.length);
{
  const n1 = new Float64Array(3); const n2 = new Float64Array(3);
  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    woundNormal(r.f1, n1); woundNormal(r.f2, n2);
    const s1 = signOf.get(r.f1) ?? 1; const s2 = signOf.get(r.f2) ?? 1;
    let dp = s1 * s2 * (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]);
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    dihCorr[i] = Math.acos(dp) * DEG;
  }
  const asW = rows.map((r) => r.measDeg);
  const cor = Array.from(dihCorr);
  log(`  dihedral AS WOUND      p10 ${q(asW, 0.1).toFixed(2)} p50 ${q(asW, 0.5).toFixed(2)} p90 ${q(asW, 0.9).toFixed(2)} MAX ${mx(asW).toFixed(2)}`);
  log(`  dihedral SIGN-CORRECTED p10 ${q(cor, 0.1).toFixed(2)} p50 ${q(cor, 0.5).toFixed(2)} p90 ${q(cor, 0.9).toFixed(2)} MAX ${mx(cor).toFixed(2)}`);
  log(`  pairs where the two differ by > 1 deg: ${rows.filter((r, i) => Math.abs(r.measDeg - dihCorr[i]) > 1).length}`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — PER-FACET FLANK DECOMPOSITION + OBSERVED normDeg (inset SWEPT)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const nsMain = fdNormals(rA, H, H_FD, H_FD);
const sampOf = new Map<number, Samp>();
const flankOf = new Map<number, Flank>();
const obsWind = new Map<number, number>();
const obsOut = new Map<number, number>();
const obsSpread = new Map<number, number>();
const INSETS = (process.env.PF_S113OP_INSETS ?? '0,0.02,0.05,0.1').split(',').map(Number);
const obsByInset: Array<Map<number, number>> = INSETS.map(() => new Map<number, number>());
{
  for (const f of uniqF) {
    const s = sampleFacet(f, K_LAT, 0, nsMain);   // FULL footprint (inset 0): both flanks must be visible
    sampOf.set(f, s);
    flankOf.set(f, decompose(s));
    const [ath, bth, cth] = th3(f);
    const args: [number, number, number, number, number, number, number, number, number, number, number, number] = [
      xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth];
    const ow = orientOfFacet(nsObs, ...args, { k: K_OBS, inset: INSET_OBS, orient: 'winding', scratch });
    const oo = orientOfFacet(nsObs, ...args, { k: K_OBS, inset: INSET_OBS, orient: 'outward', scratch });
    obsWind.set(f, ow.normDeg); obsOut.set(f, oo.normDeg); obsSpread.set(f, ow.spreadRad * DEG);
    for (let ii = 0; ii < INSETS.length; ii += 1) {
      obsByInset[ii].set(f, orientOfFacet(nsObs, ...args, { k: K_OBS, inset: INSETS[ii], orient: 'outward', scratch }).normDeg);
    }
  }
  log(`── STAGE 2: per-facet flank decomposition over ${uniqF.length} unique target facets  ${el()} ──`);
  const fl = uniqF.map((f) => flankOf.get(f) as Flank);
  const creaseN = fl.filter((x) => x.crease).length;
  let creaseArea = 0;
  for (const f of uniqF) if ((flankOf.get(f) as Flank).crease) creaseArea += d.areaMm2[f];
  log(`  footprint CONTAINS A CREASE (sep >= ${SEP_MIN} deg, both flanks >= 2 pts, sep > within-flank spread):`);
  log(`     COUNT ${creaseN}/${uniqF.length} (${((creaseN / uniqF.length) * 100).toFixed(2)}%)  AREA ${creaseArea.toFixed(4)} mm2 = ${((creaseArea / targetArea) * 100).toFixed(2)}% of target  MAX sep ${mx(fl.map((x) => x.sepDeg)).toFixed(2)} deg`);
  log(`  sepDeg          p10 ${q(fl.map((x) => x.sepDeg), 0.1).toFixed(2)} p50 ${q(fl.map((x) => x.sepDeg), 0.5).toFixed(2)} p90 ${q(fl.map((x) => x.sepDeg), 0.9).toFixed(2)}`);
  log(`  flank split A/B (points) p50 ${q(fl.map((x) => Math.min(x.nA, x.nB)), 0.5).toFixed(0)} min-side of ${q(fl.map((x) => x.nA + x.nB), 0.5).toFixed(0)}`);
  log(`  within-flank max spread  p50 ${q(fl.map((x) => Math.max(x.wADeg, x.wBDeg)), 0.5).toFixed(3)} p90 ${q(fl.map((x) => Math.max(x.wADeg, x.wBDeg)), 0.9).toFixed(3)} deg`);
  log(`  ORACLE single-flank normDeg  UB p50 ${q(fl.map((x) => x.oracleUB), 0.5).toFixed(4)} p90 ${q(fl.map((x) => x.oracleUB), 0.9).toFixed(4)}  MAX ${mx(fl.map((x) => x.oracleUB)).toFixed(3)} deg`);
  log(`                               LB p50 ${q(fl.map((x) => x.oracleLB), 0.5).toFixed(4)} p90 ${q(fl.map((x) => x.oracleLB), 0.9).toFixed(4)}  MAX ${mx(fl.map((x) => x.oracleLB)).toFixed(3)} deg`);
  log(`  OBSERVED normDeg (k=${K_OBS}, inset ${INSET_OBS}, winding) p50 ${q(uniqF.map((f) => obsWind.get(f) as number), 0.5).toFixed(2)}  MAX ${mx(uniqF.map((f) => obsWind.get(f) as number)).toFixed(2)}`);
  log(`  OBSERVED normDeg (k=${K_OBS}, inset ${INSET_OBS}, outward) p50 ${q(uniqF.map((f) => obsOut.get(f) as number), 0.5).toFixed(2)}  MAX ${mx(uniqF.map((f) => obsOut.get(f) as number)).toFixed(2)}`);
  log('  INSET SWEEP on the observed normDeg (outward) — an option default is a measurement choice:');
  for (let ii = 0; ii < INSETS.length; ii += 1) {
    const v = uniqF.map((f) => obsByInset[ii].get(f) as number);
    log(`     inset ${INSETS[ii].toFixed(3)}   p10 ${q(v, 0.1).toFixed(2)}  p50 ${q(v, 0.5).toFixed(2)}  p90 ${q(v, 0.9).toFixed(2)}  MAX ${mx(v).toFixed(2)} deg`);
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — PER-PAIR IRREDUCIBLE ACROSS-CREASE TURN (the ceiling on the visible metric)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface PairOut { sepCentDeg: number; sepCreaseDeg: number; diamDeg: number; gapMm: number; crease: boolean }
const pairOut: PairOut[] = [];
{
  for (const r of rows) {
    const s1 = sampOf.get(r.f1) as Samp; const s2 = sampOf.get(r.f2) as Samp;
    const m = s1.m + s2.m;
    const n = new Float64Array(m * 3); const pth = new Float64Array(m); const pz = new Float64Array(m);
    n.set(s1.n.subarray(0, s1.m * 3), 0); n.set(s2.n.subarray(0, s2.m * 3), s1.m * 3);
    pth.set(s1.pth.subarray(0, s1.m), 0); pth.set(s2.pth.subarray(0, s2.m), s1.m);
    pz.set(s1.pz.subarray(0, s1.m), 0); pz.set(s2.pz.subarray(0, s2.m), s1.m);
    const sp = twoMeans(n, m);
    const idxA: number[] = []; const idxB: number[] = [];
    for (let i = 0; i < m; i += 1) (sp.lab[i] === 0 ? idxA : idxB).push(i);
    // THE ACROSS-CREASE TURN, probed at the crease: the closest cross-flank sample pairs in PARAMETER
    // space bracket the crease, so the angle between their normals is the one-sided jump. Take the MAX
    // over the NCROSS closest pairs (the sup direction), and report the parameter gap so the reader can
    // see how tight the bracket is. This is a FOOTPRINT probe, not a two-endpoint probe.
    const cand: Array<{ dd: number; ang: number }> = [];
    for (const a of idxA) for (const b of idxB) {
      const dd = Math.hypot(pth[a] - pth[b], pz[a] - pz[b]);
      cand.push({ dd, ang: angU(n, a * 3, n, b * 3) });
    }
    cand.sort((x, y) => x.dd - y.dd);
    let sepCrease = 0; let gap = NaN;
    const take = Math.min(NCROSS, cand.length);
    for (let i = 0; i < take; i += 1) { if (cand[i].ang > sepCrease) sepCrease = cand[i].ang; }
    if (take > 0) gap = cand[take - 1].dd;
    let diam = 0;
    for (let a = 0; a < m; a += 1) for (let b = a + 1; b < m; b += 1) {
      const t = angU(n, a * 3, n, b * 3); if (t > diam) diam = t;
    }
    const sepCentDeg = sp.sepRad * DEG;
    const minSide = Math.min(idxA.length, idxB.length);
    const crease = sepCentDeg >= SEP_MIN && minSide >= 2 && sepCentDeg > Math.max(sp.wA, sp.wB) * DEG;
    pairOut.push({ sepCentDeg, sepCreaseDeg: sepCrease * DEG, diamDeg: diam * DEG, gapMm: gap, crease });
  }
  const sc = pairOut.map((p) => p.sepCreaseDeg);
  const ct = pairOut.map((p) => p.sepCentDeg);
  const dm = pairOut.map((p) => p.diamDeg);
  log(`── STAGE 3: the ANALYTIC across-crease turn over each pair's neighbourhood  ${el()} ──`);
  log(`  sep from CLUSTER CENTRES   p10 ${q(ct, 0.1).toFixed(2)} p50 ${q(ct, 0.5).toFixed(2)} p90 ${q(ct, 0.9).toFixed(2)} MAX ${mx(ct).toFixed(2)} deg`);
  log(`  sep at the CREASE (closest ${NCROSS} cross-flank pairs)  p10 ${q(sc, 0.1).toFixed(2)} p50 ${q(sc, 0.5).toFixed(2)} p90 ${q(sc, 0.9).toFixed(2)} MAX ${mx(sc).toFixed(2)} deg`);
  log(`  normal-set DIAMETER over the pair (crease + curvature; an UPPER bracket) p50 ${q(dm, 0.5).toFixed(2)} p90 ${q(dm, 0.9).toFixed(2)} deg`);
  log(`  parameter gap of the probe  p50 ${q(pairOut.map((p) => p.gapMm), 0.5).toExponential(2)} mm  p90 ${q(pairOut.map((p) => p.gapMm), 0.9).toExponential(2)} mm`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — THE HEADLINE: IRREDUCIBLE vs REDUCIBLE, BY COUNT AND BY AREA
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  // Pair-level class on the VISIBLE metric.
  const irrPair = pairOut.map((p) => p.sepCreaseDeg >= VIS_DEG);
  const nIrr = irrPair.filter(Boolean).length;
  // Facet-level area, deduplicated. TWO-SIDED: the LOOSE attribution calls a facet irreducible if ANY of
  // its pairs is (conservative toward "correct geometry"); the STRICT one requires ALL of them. The gap
  // between the two is the ambiguity and it is printed, not hidden.
  const anyIrr = new Map<number, boolean>(); const allIrr = new Map<number, boolean>();
  for (let i = 0; i < rows.length; i += 1) {
    for (const f of [rows[i].f1, rows[i].f2]) {
      anyIrr.set(f, (anyIrr.get(f) ?? false) || irrPair[i]);
      allIrr.set(f, (allIrr.get(f) ?? true) && irrPair[i]);
    }
  }
  let aLoose = 0; let aStrict = 0; let nLoose = 0; let nStrict = 0; let ties = 0;
  for (const f of uniqF) {
    if (anyIrr.get(f) === true) { aLoose += d.areaMm2[f]; nLoose += 1; }
    if (allIrr.get(f) === true) { aStrict += d.areaMm2[f]; nStrict += 1; }
    if ((anyIrr.get(f) === true) !== (allIrr.get(f) === true)) ties += 1;
  }
  const maxIrrSep = mx(pairOut.filter((p) => p.sepCreaseDeg >= VIS_DEG).map((p) => p.sepCreaseDeg));
  const redSeps = pairOut.filter((p) => p.sepCreaseDeg < VIS_DEG).map((p) => p.sepCreaseDeg);
  log('════════════════════════════════════════════════════════════════════════════════════════════════');
  log('  STAGE 4 — THE ORACLE CEILING.  IRREDUCIBLE = the analytic surface really turns >= 45 deg across');
  log('  a genuine crease inside this neighbourhood, so ANY correct mesh shows a >45 deg dihedral there.');
  log('════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`  PAIRS   IRREDUCIBLE ${nIrr}/${rows.length} = ${((nIrr / rows.length) * 100).toFixed(2)}%      REDUCIBLE ${rows.length - nIrr} = ${(((rows.length - nIrr) / rows.length) * 100).toFixed(2)}%`);
  log(`  AREA    IRREDUCIBLE (loose, any-pair)  COUNT ${nLoose}  AREA ${aLoose.toFixed(4)} mm2 = ${((aLoose / targetArea) * 100).toFixed(2)}% of target = ${((aLoose / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`          IRREDUCIBLE (strict, all-pair) COUNT ${nStrict}  AREA ${aStrict.toFixed(4)} mm2 = ${((aStrict / targetArea) * 100).toFixed(2)}% of target = ${((aStrict / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`          ambiguous facets (pairs disagree): ${ties}`);
  log(`          MAX crease turn among IRREDUCIBLE pairs ${maxIrrSep.toFixed(2)} deg`);
  log(`  AREA    REDUCIBLE (loose complement) ${(targetArea - aLoose).toFixed(4)} mm2 = ${(((targetArea - aLoose) / targetArea) * 100).toFixed(2)}% of target = ${(((targetArea - aLoose) / meshArea) * 100).toFixed(4)}% of mesh`);
  log(`          among REDUCIBLE pairs, crease turn p50 ${q(redSeps, 0.5).toFixed(2)} p90 ${q(redSeps, 0.9).toFixed(2)} MAX ${mx(redSeps).toFixed(2)} deg`);
  const pr1 = (aLoose / targetArea) * 100;
  log('');
  log(`  >>> PR1 (>= 60% of target AREA irreducible): measured ${pr1.toFixed(2)}%  =>  ${pr1 >= 60 ? 'PR1 SURVIVES' : '*** PR1 FALSIFIED BY MY OWN KILL LINE ***'}`);
  log('');

  // The FIDELITY side: how far can the oracle push normDeg?
  const obs = uniqF.map((f) => obsOut.get(f) as number);
  const orUB = uniqF.map((f) => (flankOf.get(f) as Flank).oracleUB);
  const orLB = uniqF.map((f) => (flankOf.get(f) as Flank).oracleLB);
  const mObs = q(obs, 0.5); const mUB = q(orUB, 0.5);
  let aRed = 0; let nRed = 0; let aIrrN = 0; let nIrrN = 0;
  for (const f of uniqF) {
    const o = obsOut.get(f) as number; const fl = flankOf.get(f) as Flank;
    if (o > BAR_DEG && fl.oracleUB <= BAR_DEG) { aRed += d.areaMm2[f]; nRed += 1; }
    if (fl.oracleLB > BAR_DEG) { aIrrN += d.areaMm2[f]; nIrrN += 1; }
  }
  log('  ── THE FIDELITY SIDE (normDeg), which is a DIFFERENT question from the visible side ──');
  log(`  observed normDeg (outward, inset ${INSET_OBS})  p50 ${mObs.toFixed(3)}  MAX ${mx(obs).toFixed(2)} deg`);
  log(`  ORACLE single-flank normDeg  UB p50 ${mUB.toFixed(4)}  MAX ${mx(orUB).toFixed(3)} deg   |  LB p50 ${q(orLB, 0.5).toFixed(4)} MAX ${mx(orLB).toFixed(3)} deg`);
  log(`  reduction at the median: ${(mObs / Math.max(1e-9, mUB)).toFixed(1)}x   >>> PR2 (>= 10x, kill < 3x): ${mObs / Math.max(1e-9, mUB) >= 10 ? 'SURVIVES' : mObs / Math.max(1e-9, mUB) >= 3 ? 'WEAKENED (3-10x)' : '*** PR2 FALSIFIED ***'}`);
  log(`  facets the oracle brings under the ${BAR_DEG}-deg bar: COUNT ${nRed} (${((nRed / uniqF.length) * 100).toFixed(2)}%)  AREA ${aRed.toFixed(4)} mm2 = ${((aRed / targetArea) * 100).toFixed(2)}% of target`);
  log(`  facets whose oracle LOWER bound is still over the bar: COUNT ${nIrrN}  AREA ${aIrrN.toFixed(4)} mm2 = ${((aIrrN / targetArea) * 100).toFixed(2)}% of target`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — TRIANGLE COST OF THE ORACLE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  // A crease chord crossing a triangle between two edges splits it into 3; through a vertex into 2.
  // Count genuine crossings per facet from the pinned `locs` (turn beats SEP_MIN, s strictly interior).
  const crossOf = new Map<number, number>();
  for (const r of rows) {
    for (const L of r.locs) {
      if (!crossOf.has(L.f)) crossOf.set(L.f, 0);
    }
  }
  for (const r of rows) {
    const per = new Map<number, Set<number>>();
    for (const L of r.locs) {
      if (L.turnDeg >= SEP_MIN && L.s > 0.02 && L.s < 0.98) {
        if (!per.has(L.f)) per.set(L.f, new Set<number>());
        (per.get(L.f) as Set<number>).add(L.edge);
      }
    }
    for (const [f, es] of per) crossOf.set(f, Math.max(crossOf.get(f) ?? 0, es.size));
  }
  let add = 0; let n2 = 0; let n3 = 0; let n0 = 0;
  for (const f of uniqF) {
    const fl = flankOf.get(f) as Flank;
    if (!fl.crease) { n0 += 1; continue; }
    const c = crossOf.get(f) ?? 0;
    if (c >= 2) { add += 2; n3 += 1; } else { add += 1; n2 += 1; }
  }
  log(`── STAGE 5: TRIANGLE COST OF THE ORACLE (split every crease-carrying facet ON the crease) ──`);
  log(`  facets split into 3 (chord between two edges): ${n3}   into 2 (chord to a vertex / one crossing): ${n2}   not split: ${n0}`);
  log(`  triangles ADDED ${add}  = ${((add / nTri) * 100).toFixed(4)}% of the ${nTri}-facet mesh`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — CONTROLS. A result whose control fires is VOID, and this is where that is decided.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
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
let ctlVoid = false;
{
  // SMOOTH CONTROL: wall facets whose max adjacent dihedral is under 2 deg. The decomposition must find
  // no crease in them. If it does, it is manufacturing creases out of curvature and everything is void.
  const inTarget = new Set(uniqF);
  const pool: number[] = [];
  const lo = (2 * Math.PI) / 180;
  let seed = 12345;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let tries = 0; tries < 400000 && pool.length < CTLN; tries += 1) {
    const f = Math.floor(rnd() * nTri);
    if (inTarget.has(f) || d.perFacetMaxRad[f] >= lo || graphRatio(f) > 8) continue;
    pool.push(f);
  }
  const fls = pool.map((f) => decompose(sampleFacet(f, K_LAT, 0, nsMain)));
  const nC = fls.filter((x) => x.crease).length;
  log('── STAGE 6: CONTROLS ──');
  log(`  SMOOTH CONTROL (${pool.length} wall facets, adjacent dihedral < 2 deg, NOT in the target set):`);
  log(`     crease-labelled ${nC} = ${((nC / Math.max(1, pool.length)) * 100).toFixed(2)}%   (kill line 5%)`);
  log(`     sepDeg p50 ${q(fls.map((x) => x.sepDeg), 0.5).toFixed(4)} p90 ${q(fls.map((x) => x.sepDeg), 0.9).toFixed(4)} MAX ${mx(fls.map((x) => x.sepDeg)).toFixed(3)} deg`);
  log(`     oracle UB p50 ${q(fls.map((x) => x.oracleUB), 0.5).toFixed(5)} MAX ${mx(fls.map((x) => x.oracleUB)).toFixed(4)} deg`);
  if (nC / Math.max(1, pool.length) > 0.05) { ctlVoid = true; log('  *** CONTROL FIRED: the flank classifier manufactures creases. THE RUN IS VOID. ***'); }

  // HIGH-DIHEDRAL POSITIVE CONTROL: wall facets whose dihedral IS over 45 deg but which the S112 funnel
  // rejected as crease-CONFORMED (not straddling). The decomposition SHOULD still find the crease there
  // — that is what "conformed" means — while their observed normDeg is small. If it does not, the
  // classifier is really detecting STRADDLE, not CREASE, and Stage 4 is circular.
  const hiPool: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length && hiPool.length < 300; e += 1) {
    if (!(d.edgeAngRad[e] > (VIS_DEG * Math.PI) / 180)) continue;
    const f1 = d.edgeF1[e];
    if (inTarget.has(f1) || graphRatio(f1) > 8) continue;
    if (rnd() > 0.06) continue;
    hiPool.push(f1);
  }
  const hiFl = hiPool.map((f) => decompose(sampleFacet(f, K_LAT, 0, nsMain)));
  const hiObs = hiPool.map((f) => {
    const [ath, bth, cth] = th3(f);
    return orientOfFacet(nsObs, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_OBS, inset: INSET_OBS, orient: 'outward', scratch }).normDeg;
  });
  log(`  CONFORMED CONTROL (${hiPool.length} wall facets with dihedral > ${VIS_DEG} deg but NOT in the straddling target set):`);
  log(`     crease-labelled ${hiFl.filter((x) => x.crease).length} = ${((hiFl.filter((x) => x.crease).length / Math.max(1, hiPool.length)) * 100).toFixed(2)}%`);
  log(`     sepDeg p50 ${q(hiFl.map((x) => x.sepDeg), 0.5).toFixed(2)}   observed normDeg (inset ${INSET_OBS}) p50 ${q(hiObs, 0.5).toFixed(3)} MAX ${mx(hiObs).toFixed(2)} deg`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — LADDERS. Every knob that could be carrying the answer, moved.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const sub: number[] = [];
  for (let i = 0; i < uniqF.length && sub.length < SUBN; i += Math.max(1, Math.floor(uniqF.length / SUBN))) sub.push(uniqF[i]);
  log(`── STAGE 7: LADDERS on a ${sub.length}-facet subsample ──`);
  log('  h LADDER (finite-difference step, mm) — sep and oracle UB must not be a function of it:');
  for (const h of [2e-5, 5e-5, 2e-4, 1e-3, 5e-3]) {
    const ns = fdNormals(rA, H, h, h);
    const fl = sub.map((f) => decompose(sampleFacet(f, K_LAT, 0, ns)));
    log(`     h=${h.toExponential(0)}  crease ${((fl.filter((x) => x.crease).length / fl.length) * 100).toFixed(2)}%  sep p50 ${q(fl.map((x) => x.sepDeg), 0.5).toFixed(2)}  oracleUB p50 ${q(fl.map((x) => x.oracleUB), 0.5).toFixed(4)} MAX ${mx(fl.map((x) => x.oracleUB)).toFixed(3)}`);
  }
  log('  K LADDER (lattice order) — a footprint probe must converge in K:');
  for (const k of [6, 8, 12, 20, 28]) {
    const fl = sub.map((f) => decompose(sampleFacet(f, k, 0, nsMain)));
    log(`     K=${k}  pts ${((k + 1) * (k + 2)) / 2}  crease ${((fl.filter((x) => x.crease).length / fl.length) * 100).toFixed(2)}%  sep p50 ${q(fl.map((x) => x.sepDeg), 0.5).toFixed(2)}  oracleUB p50 ${q(fl.map((x) => x.oracleUB), 0.5).toFixed(4)} MAX ${mx(fl.map((x) => x.oracleUB)).toFixed(3)}`);
  }
  log('  SEP_MIN LADDER (the crease bar itself) — the headline must not sit on this cut:');
  for (const sm of [5, 10, 15, 30, 45]) {
    const irr = pairOut.filter((p) => p.sepCreaseDeg >= sm).length;
    log(`     visibility cut ${sm} deg: irreducible pairs ${irr}/${rows.length} = ${((irr / rows.length) * 100).toFixed(2)}%`);
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// DUMP
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const out = rows.map((r, i) => JSON.stringify({
    e: r.e, f1: r.f1, f2: r.f2, measDeg: r.measDeg, dihCorrDeg: dihCorr[i],
    sepCentDeg: pairOut[i].sepCentDeg, sepCreaseDeg: pairOut[i].sepCreaseDeg, diamDeg: pairOut[i].diamDeg,
    gapMm: pairOut[i].gapMm, pairCrease: pairOut[i].crease,
    irreducible: pairOut[i].sepCreaseDeg >= VIS_DEG,
    f1Crease: (flankOf.get(r.f1) as Flank).crease, f2Crease: (flankOf.get(r.f2) as Flank).crease,
    f1OracleUB: (flankOf.get(r.f1) as Flank).oracleUB, f2OracleUB: (flankOf.get(r.f2) as Flank).oracleUB,
    f1OracleLB: (flankOf.get(r.f1) as Flank).oracleLB, f2OracleLB: (flankOf.get(r.f2) as Flank).oracleLB,
    f1ObsOut: obsOut.get(r.f1), f2ObsOut: obsOut.get(r.f2),
    f1Sign: signOf.get(r.f1), f2Sign: signOf.get(r.f2),
    area1: r.area1, area2: r.area2, z: r.z, thMod30: r.thMod30,
  })).join('\n');
  writeFileSync(`${OUTDIR}/S113OP_ORACLE_${TAG}.ndjson`, `${out}\n`);
  log(`wrote ${OUTDIR}/S113OP_ORACLE_${TAG}.ndjson  (${rows.length} rows)`);
}
log(`done ${el()}${ctlVoid ? '   *** RUN IS VOID — A CONTROL FIRED ***' : ''}`);
