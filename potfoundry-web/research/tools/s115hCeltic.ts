// s115hCeltic.ts — S115: IS CelticTriquetra's 2.06% REAL, OR AN h-ARTIFACT LIKE GOTHIC'S WAS?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. S114q proved that `normDeg` — the quantity every S112/S113/S114 verdict is built on —
// moves 48x on GothicArches with the finite-difference step `h` alone (4,656 "straddling" facets read
// p50 2.93 deg at h=2e-6 and 141.68 deg at h=5e-3). CelticTriquetra's normDeg has NEVER been swept in h,
// and S114 nevertheless published from it:
//     >45 class 3.197% of mesh area, class-wide IRREDUCIBLE 35.84%  =>  REDUCIBLE 2.06% of mesh
// which is 65x Gothic and is the campaign's single biggest claimed target. A number that moves with h is
// not a measurement. This tool sweeps h and re-derives the 2.06% at whatever rung survives.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST NUMBER WAS READ.
//
//  PR1  THE h-LADDER. normDeg over the >45 deg class at h in {5e-3, 1e-3, 2e-4(default), 2e-5, 2e-6,
//       2e-7, 2e-8}, PER FACET, COUNT + AREA + MAX at every rung, insets {0, 0.05} both printed.
//  PR2  THE h-STABLE SUBCLASS. A facet is h-STABLE iff its normDeg over the LAST THREE rungs varies by
//       <= 1.25x (or by <= 0.5 deg absolute, so the ratio test does not fire on noise near zero).
//       *** THAT SUBCLASS, NOT THE RAW CLASS, IS THE HONEST TARGET. *** COUNT + AREA + MAX.
//  PR3  THE RE-DERIVATION. The whole S114 Stage-3/4/7 accounting is re-run at TWO arms — h=2e-4 (the
//       campaign default, which must REPRODUCE S114's published numbers, and is therefore also the
//       arm's own control) and h=hStable. The reducible-%-of-mesh is quoted from both.
//       KILL LINE, stated before the run: if the h=2e-4 arm does not reproduce S114's 35.84% / 2.06%
//       to within the sampling error implied by its own n, THIS TOOL IS WRONG and no h verdict follows.
//  PR4  WHY h MATTERS. If normDeg depends on h, the analytic surface has structure at the h scale. The
//       distance from a footprint to the nearest turn locus is MEASURED (`hStar`, below) and compared
//       against the facet's own size and against the knot's mm feature scale.
//  PR5  GOTHIC ON THE SAME INSTRUMENT, same code path, as the control.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS — a run whose control fires is VOID and is reported as void, never rescued.
//
//  C1  PRECOND. max |r_mesh - rA| over a stride sample. > 50 um => REFUSE THE MESH AND EXIT.
//  C2  *** THE H-NOISE DISCRIMINATOR (the voiding gate for the whole ladder). *** The SAME ladder on a
//      SMOOTH control population (perFacetMaxRad < 2 deg, graphRatio <= 8). There is no crease within
//      reach of any h there, so:
//         H-WINDOW (h is a blur radius reaching a real locus) predicts the smooth ladder is FLAT.
//         H-NOISE  (rA is not f64-smooth, small h divides two near-equal numbers) predicts it COLLAPSES.
//      If the smooth control collapses, small h is garbage and NO h->0 number may be quoted.
//  C3  DERIVATIVE STABILITY. |rtF - rtB| / scale on smooth wall points at every rung. Under smoothness
//      this SHRINKS with h; under quantisation it BLOWS UP. This is what says whether 2e-8 is a real rung.
//  C4  CLOSED-FORM ANCHOR. The identical `fdNormals` at the identical rungs against a surface whose
//      normal is known exactly. Any h-dependence that shows up HERE belongs to the sampler, not to rA.
//  C5  THE ORACLE PLACEBO (C2b of S114, verbatim): the same classifier, the same footprints, against the
//      provably C-infinity truncated cone. Must label ~0%. Run at BOTH h arms — a small-h placebo could
//      manufacture creases just as a large-h one could.
//  C6  k-LADDER at both h arms (scar 2): normDeg convergence in the lattice order, SHOWN not assumed.
//
// INSTRUMENT DISCIPLINE: COUNT + AREA-share + MAX, PER FACET, never a bare count and never a bare max.
// `inset` is passed EXPLICITLY and swept. Every share over a golden-stride sample is labelled an estimate.
//
// Usage: bash research/tools/run-s115-hceltic.sh   (env PF_S115_STYLE / PF_S115_STL / PF_S115_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, radialNormal, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, dv: number): number => (process.env[n] === undefined ? dv : Number(process.env[n]));
const envI = (n: string, dv: number): number => Math.round(envF(n, dv));
const envS = (n: string, dv: string): string => process.env[n] ?? dv;

const STYLE = envS('PF_S115_STYLE', 'CelticTriquetra');
const STL = envS('PF_S115_STL', '');
const TAG = envS('PF_S115_TAG', STYLE);
const OUTDIR = envS('PF_S115_OUTDIR', 'research/exchange/_strataConformBisect/s115h');
const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;

const HS = envS('PF_S115_HS', '5e-3,1e-3,2e-4,2e-5,2e-6,2e-7,2e-8').split(',').map(Number);
const NSTAB = envI('PF_S115_NSTAB', 3);              // rungs used for the h-stability test (the LAST n)
const STAB_RATIO = envF('PF_S115_STABRATIO', 1.25);
const STAB_ABS = envF('PF_S115_STABABS', 0.5);       // deg — absolute escape so the ratio cannot fire on noise
const HI_DEG = envF('PF_S115_HI_DEG', 45);           // S108's visibility cut (a CONVENTION, not a truth)
const CURTAIN_RATIO = envF('PF_S115_CURTAIN', 8);
const DROP_CUT = envF('PF_S115_DROP', 0.25);
const NORMHI_BAR = envF('PF_S115_NORMHI', 10);
const K_OBS = envI('PF_S115_K', 8);
const INSETS = envS('PF_S115_INSETS', '0,0.05').split(',').map(Number);
const INSET_HI = envF('PF_S115_INSET_HI', 0.05);
const INSET_LO = envF('PF_S115_INSET_LO', 0);
const NCLASS = envI('PF_S115_N', 6000);              // >45 class golden-stride sample for the ladder
const NCTL = envI('PF_S115_NCTL', 2000);             // smooth control sample
const KLADDER = envS('PF_S115_KLADDER', '4,8,16,32').split(',').map(Number);
const NKLAD = envI('PF_S115_NKLAD', 400);
const H_CTL = envF('PF_S115_HCTL', 2e-4);            // the campaign default = the reproduction arm
const H_STABLE = envF('PF_S115_HSTABLE', 2e-6);      // the h-stable rung the re-derivation is quoted at
const WALLSCOPE = envI('PF_S115_WALLSCOPE', 8000);
const ORACLE_N = envI('PF_S115_ORACLE_N', 600);
const CURTAIN_N = envI('PF_S115_CURTAIN_N', 300);
const NWHY = envI('PF_S115_NWHY', 400);
const NFEAT = envI('PF_S115_NFEAT', 3000);           // wall points for the feature-scale distribution
const K_LAT = envI('PF_S115_KLAT', 10);
const K_LAT_CURTAIN = envI('PF_S115_KLATC', 16);
const SEP_MIN = envF('PF_S115_SEPMIN', 15);
const NCROSS = envI('PF_S115_NCROSS', 8);
const REDERIVE = envS('PF_S115_REDERIVE', '1') === '1';
const DEG = 180 / Math.PI;

if (STL.length === 0) { log('*** PF_S115_STL is required (ABSOLUTE path). ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
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
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');
const f3 = (v: number): string => (Number.isFinite(v) ? v.toFixed(3) : '—');
const f2 = (v: number): string => (Number.isFinite(v) ? v.toFixed(2) : '—');

const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const scratch = new Float64Array(12);
const OUT: Record<string, unknown> = { style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS, hs: HS };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S115 — THE h-LADDER ON THE >${HI_DEG} DEG CLASS — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`dims  H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`registry defaults: ${Object.entries(DEFAULTS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
log(`h rungs: ${HS.map((h) => h.toExponential(0)).join(' ')}   k=${K_OBS}   insets ${INSETS.join('/')}`);
log(`stability: last ${NSTAB} rungs, ratio <= ${STAB_RATIO}x OR |max-min| <= ${STAB_ABS} deg`);
log(`re-derive arms: h=${H_CTL.toExponential(0)} (campaign default / reproduction control) vs h=${H_STABLE.toExponential(0)} (h-stable)`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD + PRECOND (C1)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);
{
  const step = Math.max(1, Math.floor(nTri / 20000));
  const um: number[] = []; let worst = 0;
  for (let f = 0; f < nTri; f += step) {
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      um.push(dd * 1000); if (dd > worst) worst = dd;
    }
  }
  log('── STAGE 0 / CONTROL C1: PRECOND max |r_mesh - rA| (registry defaults, stride sample) ──');
  log(`  samples ${um.length}   p50 ${q(um, 0.5).toExponential(3)}  p99 ${q(um, 0.99).toExponential(3)}  *** MAX ${(worst * 1000).toFixed(4)} um ***  (gate 50 um)`);
  OUT.precond = { maxUm: worst * 1000, p50Um: q(um, 0.5), p99Um: q(um, 0.99), samples: um.length };
  if (worst * 1000 > 50) {
    log('  ██ *** MESH REFUSED: PRECOND OVER 50 um. THIS IS A RESULT, NOT A GAP. *** ██');
    OUT.verdict = 'REFUSED-PRECOND';
    writeFileSync(`${OUTDIR}/S115H_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
    process.exit(0);
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — DIHEDRAL + THE >45 CLASS + THE CURTAIN/WALL SPLIT (analytic-free, EXHAUSTIVE)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
const hiThr = (HI_DEG * Math.PI) / 180;
const classF: number[] = []; let classArea = 0;
for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) { classF.push(f); classArea += d.areaMm2[f]; }
log(`── STAGE 1: DIHEDRAL + THE >${HI_DEG} DEG CLASS (EXHAUSTIVE)  ${el()} ──`);
log(`  facets ${nTri}  AREA ${meshArea.toFixed(3)} mm2  interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent ${d.inconsistentEdges}`);
log(`  >${HI_DEG} deg class: facets ${classF.length} (${pct(classF.length, nTri)}%)  *** AREA ${classArea.toFixed(4)} mm2 = ${pct(classArea, meshArea)}% of mesh ***`);

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
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
const grCache = new Map<number, number>();
const grOf = (f: number): number => { let v = grCache.get(f); if (v === undefined) { v = graphRatio(f); grCache.set(f, v); } return v; };
const hiEdges: number[] = [];
for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] > hiThr) hiEdges.push(e);
const curtainE: number[] = []; const wallE: number[] = [];
for (const e of hiEdges) {
  if (grOf(d.edgeF1[e]) > CURTAIN_RATIO || grOf(d.edgeF2[e]) > CURTAIN_RATIO) curtainE.push(e); else wallE.push(e);
}
const facetsOfEdges = (es: number[]): Set<number> => { const s = new Set<number>(); for (const e of es) { s.add(d.edgeF1[e]); s.add(d.edgeF2[e]); } return s; };
const areaOfSet = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const curtainF = facetsOfEdges(curtainE); const wallF = facetsOfEdges(wallE);
const curtainA = areaOfSet(curtainF); const wallA = areaOfSet(wallF);
log(`  >${HI_DEG} interior edges ${hiEdges.length}:  CURTAIN (graphRatio>${CURTAIN_RATIO}) ${curtainE.length} edges / ${curtainF.size} facets / ${curtainA.toFixed(3)} mm2 = ${pct(curtainA, classArea)}% of class`);
log(`  ${' '.repeat(String(hiEdges.length).length + 21)}WALL ${wallE.length} edges / ${wallF.size} facets / ${wallA.toFixed(3)} mm2 = ${pct(wallA, classArea)}% of class`);
OUT.stage1 = {
  facets: nTri, areaMm2: meshArea, interiorEdges: d.interiorEdges, boundaryEdges: d.boundaryEdges,
  nonManifoldEdges: d.nonManifoldEdges, inconsistentEdges: d.inconsistentEdges,
  classFacets: classF.length, classAreaMm2: classArea, classAreaPct: (classArea / meshArea) * 100,
  hiEdges: hiEdges.length, curtainEdges: curtainE.length, wallEdges: wallE.length,
  curtainFacets: curtainF.size, curtainAreaMm2: curtainA, wallFacets: wallF.size, wallAreaMm2: wallA,
};
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// SAMPLING + RULER HELPERS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function goldenStride(n: number, want: number): number[] {
  if (want >= n) return Array.from({ length: n }, (_, i) => i);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let g = Math.max(1, Math.round(n * 0.6180339887498949));
  while (gcd(g, n) !== 1) g += 1;
  const out: number[] = [];
  for (let i = 0; i < want; i += 1) out.push((i * g) % n);
  return out;
}
const pick = (arr: number[], want: number): number[] => goldenStride(arr.length, Math.min(want, arr.length)).map((i) => arr[i]);
function orientArgs(f: number): [number, number, number, number, number, number, number, number, number, number, number, number] {
  const [ath, bth, cth] = th3(f);
  return [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth];
}
const normDegOf = (f: number, ns: NormalSampler, inset: number, k = K_OBS): number =>
  orientOfFacet(ns, ...orientArgs(f), { k, inset, orient: 'winding', scratch }).normDeg;
/** min triangle altitude, mm — the length scale the inset is measured against. */
function minAltitude(f: number): number {
  const p = [0, 1, 2].map((i) => [xyz[f * 9 + i * 3], xyz[f * 9 + i * 3 + 1], xyz[f * 9 + i * 3 + 2]]);
  const L = [0, 1, 2].map((i) => Math.hypot(p[(i + 1) % 3][0] - p[i][0], p[(i + 1) % 3][1] - p[i][1], p[(i + 1) % 3][2] - p[i][2]));
  return d.areaMm2[f] > 0 ? (2 * d.areaMm2[f]) / Math.max(...L) : 0;
}
const diamOf = (f: number): number => {
  const p = [0, 1, 2].map((i) => [xyz[f * 9 + i * 3], xyz[f * 9 + i * 3 + 1], xyz[f * 9 + i * 3 + 2]]);
  return Math.max(...[0, 1, 2].map((i) => Math.hypot(p[(i + 1) % 3][0] - p[i][0], p[(i + 1) % 3][1] - p[i][1], p[(i + 1) % 3][2] - p[i][2])));
};
/** SMOOTH CONTROL population: dihedral < 2 deg everywhere, wall-conditioned, not in the >45 class. */
const smoothF: number[] = [];
{
  const lo2 = (2 * Math.PI) / 180;
  for (const f of goldenStride(nTri, Math.min(nTri, 400000))) {
    if (smoothF.length >= NCTL) break;
    if (d.perFacetMaxRad[f] >= lo2 || grOf(f) > CURTAIN_RATIO) continue;
    smoothF.push(f);
  }
}
const sampClass = pick(classF, NCLASS);
const sampWall = sampClass.filter((f) => grOf(f) <= CURTAIN_RATIO);
const sampCurt = sampClass.filter((f) => grOf(f) > CURTAIN_RATIO);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — THE h LADDER (PR1) + THE SMOOTH CONTROL (C2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface LadRow {
  h: number; inset: number; n: number; p50: number; p90: number; p99: number; max: number;
  c1: number; c5: number; c45: number; a1: number; a5: number; a45: number; areaTot: number;
}
/** normDeg for every facet in `set` at every rung; rows are population-level, `per` is per-facet. */
function ladder(set: number[], inset: number): { rows: LadRow[]; per: Float64Array } {
  const per = new Float64Array(set.length * HS.length);
  const rows: LadRow[] = [];
  let areaTot = 0;
  for (const f of set) areaTot += d.areaMm2[f];
  for (let hi = 0; hi < HS.length; hi += 1) {
    const ns = fdNormals(rA, H, HS[hi], HS[hi]);
    const v: number[] = [];
    let c1 = 0; let c5 = 0; let c45 = 0; let a1 = 0; let a5 = 0; let a45 = 0;
    for (let i = 0; i < set.length; i += 1) {
      const nv = normDegOf(set[i], ns, inset);
      per[i * HS.length + hi] = nv;
      v.push(nv);
      const ar = d.areaMm2[set[i]];
      if (nv > 1) { c1 += 1; a1 += ar; }
      if (nv > 5) { c5 += 1; a5 += ar; }
      if (nv > HI_DEG) { c45 += 1; a45 += ar; }
    }
    rows.push({
      h: HS[hi], inset, n: set.length, p50: q(v, 0.5), p90: q(v, 0.9), p99: q(v, 0.99), max: q(v, 1),
      c1, c5, c45, a1, a5, a45, areaTot,
    });
  }
  return { rows, per };
}
function printLadder(name: string, rows: LadRow[]): void {
  log(`  ${name}  n=${rows[0].n}  area ${rows[0].areaTot.toFixed(3)} mm2`);
  log('     h (mm)     normDeg p50      p90      p99      MAX  |  over-1 CNT/AREA   over-5 CNT/AREA   over-45 CNT/AREA');
  for (const r of rows) {
    log(`     ${r.h.toExponential(0).padStart(6)}  ${f3(r.p50).padStart(12)} ${f2(r.p90).padStart(8)} ${f2(r.p99).padStart(8)} ${f2(r.max).padStart(8)}  |  ${pct(r.c1, r.n).padStart(7)}%/${pct(r.a1, r.areaTot).padStart(7)}%  ${pct(r.c5, r.n).padStart(7)}%/${pct(r.a5, r.areaTot).padStart(7)}%  ${pct(r.c45, r.n).padStart(7)}%/${pct(r.a45, r.areaTot).padStart(7)}%`);
  }
}
log(`── STAGE 2 / PR1: THE h LADDER (orientOfFacet, kink-aware fdNormals, winding), k=${K_OBS}  ${el()} ──`);
log(`  GOLDEN-STRIDE SAMPLE of the >${HI_DEG} class: n=${sampClass.length} of ${classF.length} facets (${pct(sampClass.length, classF.length)}%)`);
log(`  (AREA shares are ratio estimators over the SAMPLE: sum(area of over-bar sampled)/sum(area sampled))`);
const LAD: Record<string, LadRow[]> = {};
const PER: Record<string, { set: number[]; per: Float64Array }> = {};
for (const ins of INSETS) {
  log('');
  log(`  ══ inset ${ins.toFixed(3)} ══`);
  for (const [nm, set] of [[`>${HI_DEG} CLASS (all)`, sampClass], [`>${HI_DEG} CLASS / WALL`, sampWall],
    [`>${HI_DEG} CLASS / CURTAIN`, sampCurt], ['SMOOTH CONTROL (<2 deg)  <== C2', smoothF]] as Array<[string, number[]]>) {
    if (set.length === 0) { log(`  ${nm}  n=0 — SKIPPED`); continue; }
    const t = Date.now();
    const r = ladder(set, ins);
    printLadder(nm, r.rows);
    log(`     [${((Date.now() - t) / 1000).toFixed(1)}s]`);
    LAD[`${nm}|${ins}`] = r.rows;
    PER[`${nm}|${ins}`] = { set, per: r.per };
  }
}
OUT.stage2 = LAD;
// C2 VERDICT — the smooth control must be FLAT across the rungs that matter.
let C2_FIRED = false;
{
  const key = `SMOOTH CONTROL (<2 deg)  <== C2|${INSET_HI}`;
  const rows = LAD[key] ?? LAD[`SMOOTH CONTROL (<2 deg)  <== C2|${INSETS[0]}`];
  const p50s = rows.map((r) => r.p50).filter(Number.isFinite);
  const ratio = mx(p50s) / Math.max(1e-12, Math.min(...p50s));
  C2_FIRED = ratio > 1.25;
  log('');
  log(`  >>> CONTROL C2 (H-NOISE DISCRIMINATOR): smooth-control normDeg p50 across ALL rungs`);
  log(`      ${rows.map((r) => `${r.h.toExponential(0)}:${f3(r.p50)}`).join('  ')}`);
  log(`      max/min = ${ratio.toFixed(4)}x   ${C2_FIRED ? '*** C2 FIRED — the smooth control MOVES with h. H-NOISE is live. NO h->0 NUMBER MAY BE QUOTED. ***' : 'C2 OK — the smooth control is FLAT, so the class ladder is H-WINDOW (a real locus being reached), not sampler noise.'}`);
  OUT.c2 = { p50s, ratio, fired: C2_FIRED };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — THE h-STABLE SUBCLASS (PR2)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const iCtl = HS.findIndex((h) => Math.abs(h - H_CTL) / H_CTL < 1e-9);
const iStab = HS.findIndex((h) => Math.abs(h - H_STABLE) / H_STABLE < 1e-9);
log(`── STAGE 3 / PR2: THE h-STABLE SUBCLASS — last ${NSTAB} rungs (${HS.slice(-NSTAB).map((h) => h.toExponential(0)).join(', ')})  ${el()} ──`);
const s3: Record<string, unknown> = {};
const POPKEYS = [`>${HI_DEG} CLASS (all)`, `>${HI_DEG} CLASS / WALL`, `>${HI_DEG} CLASS / CURTAIN`];
for (const popNm of POPKEYS) for (const ins of INSETS) {
  const key = `${popNm}|${ins}`;
  const P = PER[key];
  if (P === undefined) continue;
  const nH = HS.length;
  let nStab = 0; let aStab = 0; let aTot = 0;
  let nS45 = 0; let aS45 = 0; let nS5 = 0; let aS5 = 0; let nS1 = 0; let aS1 = 0;
  let nEvap = 0; let aEvap = 0;              // the Gothic analogue: big at h=2e-4, gone at h-stable
  const stabVals: number[] = []; const stabMaxV: number[] = [];
  for (let i = 0; i < P.set.length; i += 1) {
    const f = P.set[i]; const ar = d.areaMm2[f]; aTot += ar;
    const tail: number[] = [];
    for (let j = nH - NSTAB; j < nH; j += 1) tail.push(P.per[i * nH + j]);
    const lo = Math.min(...tail); const hiV = Math.max(...tail);
    const stable = (hiV - lo) <= STAB_ABS || hiV <= STAB_RATIO * Math.max(lo, 1e-9);
    const vStab = P.per[i * nH + (iStab >= 0 ? iStab : nH - 1)];
    const vCtl = P.per[i * nH + (iCtl >= 0 ? iCtl : 0)];
    if (stable) {
      nStab += 1; aStab += ar; stabVals.push(vStab); stabMaxV.push(vStab);
      if (vStab > HI_DEG) { nS45 += 1; aS45 += ar; }
      if (vStab > 5) { nS5 += 1; aS5 += ar; }
      if (vStab > 1) { nS1 += 1; aS1 += ar; }
    }
    if (vCtl > HI_DEG && vStab <= 5) { nEvap += 1; aEvap += ar; }
  }
  log(`  ══ ${popNm} / inset ${ins.toFixed(3)} ══   n=${P.set.length}  sampled area ${aTot.toFixed(3)} mm2`);
  log(`     h-STABLE      COUNT ${nStab} (${pct(nStab, P.set.length)}%)   AREA ${aStab.toFixed(4)} mm2 = ${pct(aStab, aTot)}% of the sampled class`);
  log(`        within it, at h=${(iStab >= 0 ? HS[iStab] : HS[HS.length - 1]).toExponential(0)}:  normDeg p50 ${f3(q(stabVals, 0.5))} p90 ${f2(q(stabVals, 0.9))} p99 ${f2(q(stabVals, 0.99))} MAX ${f2(mx(stabMaxV))} deg`);
  log(`        over-1  COUNT ${nS1} (${pct(nS1, P.set.length)}% of class)  AREA ${pct(aS1, aTot)}%`);
  log(`        over-5  COUNT ${nS5} (${pct(nS5, P.set.length)}% of class)  AREA ${pct(aS5, aTot)}%`);
  log(`        over-45 COUNT ${nS45} (${pct(nS45, P.set.length)}% of class)  AREA ${pct(aS45, aTot)}%   <<< THE HONEST TARGET`);
  log(`     *** h-EVAPORATORS (normDeg > ${HI_DEG} at h=${H_CTL.toExponential(0)} AND <= 5 at h=${H_STABLE.toExponential(0)}): COUNT ${nEvap} (${pct(nEvap, P.set.length)}%)  AREA ${pct(aEvap, aTot)}% ***`);
  log(`        (Gothic S114q: 4,656 of 6,193 pinned facets went 141.68 deg -> 2.93 deg across this range)`);
  s3[`${popNm}|inset${ins}`] = {
    n: P.set.length, sampAreaMm2: aTot, stableCount: nStab, stableAreaPct: (aStab / aTot) * 100,
    stableP50: q(stabVals, 0.5), stableP90: q(stabVals, 0.9), stableP99: q(stabVals, 0.99), stableMax: mx(stabMaxV),
    stableOver1Count: nS1, stableOver1AreaPct: (aS1 / aTot) * 100,
    stableOver5Count: nS5, stableOver5AreaPct: (aS5 / aTot) * 100,
    stableOver45Count: nS45, stableOver45AreaPct: (aS45 / aTot) * 100,
    evapCount: nEvap, evapAreaPct: (aEvap / aTot) * 100,
  };
}
OUT.stage3 = s3;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — C3 (DERIVATIVE STABILITY) AND C4 (CLOSED-FORM ANCHOR)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log(`── STAGE 4 / CONTROL C3: DERIVATIVE STABILITY on smooth wall points — forward vs backward r_th  ${el()} ──`);
log('   Under smoothness |rtF-rtB| SHRINKS with h. Under quantisation it BLOWS UP. This is what says');
log('   whether the smallest rungs are real measurements or two near-equal f64s being subtracted.');
{
  const pts: Array<[number, number]> = [];
  for (const f of pick(smoothF, 400)) {
    const [ath, bth, cth] = th3(f);
    pts.push([(ath + bth + cth) / 3, (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3]);
  }
  const rowsC3: Array<Record<string, number>> = [];
  for (const h of HS) {
    const rel: number[] = []; const dif: number[] = [];
    for (const [th, z] of pts) {
      const r0 = rA(th, z); const hTh = h / Math.max(1e-9, Math.abs(r0));
      const rtF = (rA(th + hTh, z) - r0) / hTh;
      const rtB = (r0 - rA(th - hTh, z)) / hTh;
      const sc = Math.max(Math.abs(rtF), Math.abs(rtB), 1e-12);
      rel.push(Math.abs(rtF - rtB) / sc); dif.push(Math.abs(rtF - rtB));
    }
    log(`     h=${h.toExponential(0).padStart(6)}  |rtF-rtB|/scale p50 ${q(rel, 0.5).toExponential(2)} p90 ${q(rel, 0.9).toExponential(2)}   |rtF-rtB| p50 ${q(dif, 0.5).toExponential(2)}`);
    rowsC3.push({ h, relP50: q(rel, 0.5), relP90: q(rel, 0.9), absP50: q(dif, 0.5) });
  }
  OUT.c3 = rowsC3;
}
log('');
log('── STAGE 4 / CONTROL C4: CLOSED-FORM ANCHOR — fdNormals vs an EXACT normal at the same rungs ──');
{
  const rEx = (th: number, z: number): number => 40 + 0.5 * (z / 120) + 0.3 * Math.sin(8 * th);
  const rExTh = (th: number): number => 2.4 * Math.cos(8 * th);
  const nAx = new Float64Array(3);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 400; i += 1) pts.push([(i * 0.61803398875 * 2 * Math.PI) % (2 * Math.PI), 5 + (i % 100)]);
  const rowsC4: Array<Record<string, number>> = [];
  for (const h of HS) {
    const ns = fdNormals(rEx, 120, h, h);
    const errs: number[] = [];
    for (const [th, z] of pts) {
      const nc = ns(th, z, scratch);
      radialNormal(rEx(th, z), rExTh(th), 0.5 / 120, th, nAx, 0);
      let worst = 0;
      for (let i = 0; i < nc; i += 1) {
        let dp = nAx[0] * scratch[i * 3] + nAx[1] * scratch[i * 3 + 1] + nAx[2] * scratch[i * 3 + 2];
        dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
        const a = Math.acos(dp) * DEG; if (a > worst) worst = a;
      }
      errs.push(worst);
    }
    log(`     h=${h.toExponential(0).padStart(6)}  |fd normal - exact| p50 ${q(errs, 0.5).toExponential(2)} deg  p90 ${q(errs, 0.9).toExponential(2)}  MAX ${mx(errs).toExponential(2)}`);
    rowsC4.push({ h, p50: q(errs, 0.5), p90: q(errs, 0.9), max: mx(errs) });
  }
  OUT.c4 = rowsC4;
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — WHY DOES h MATTER? THE DISTANCE FROM THE FOOTPRINT TO THE NEAREST TURN LOCUS (PR4)
//
// `hStar(p)` — the SMALLEST h at which `fdNormals` returns candidates spread by >= TURN_BAR at p. The
// sampler's window is a box of half-width h in (arc, z), and the four one-sided combinations disagree
// EXACTLY WHEN that box reaches a locus where the one-sided derivatives differ. So hStar(p) IS the
// (axis-aligned) distance from p to the nearest turn locus, measured in mm, by the very instrument whose
// h-dependence is in question. No new ruler is introduced.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const TURN_BAR = envF('PF_S115_TURNBAR', 5) / DEG;
const HSTAR_LO = 1e-9; const HSTAR_HI = 1e-1;
function spreadAt(th: number, z: number, h: number): number {
  const ns = fdNormals(rA, H, h, h);
  const nc = ns(th, z, scratch);
  let worst = 0;
  for (let a = 0; a < nc; a += 1) {
    for (let b = 0; b < a; b += 1) {
      let dp = scratch[a * 3] * scratch[b * 3] + scratch[a * 3 + 1] * scratch[b * 3 + 1] + scratch[a * 3 + 2] * scratch[b * 3 + 2];
      dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
      const ang = Math.acos(dp); if (ang > worst) worst = ang;
    }
  }
  return worst;
}
/**
 * log-bisection for the smallest h whose window reaches a >= TURN_BAR turn.
 * RIGHT-CENSORED at HSTAR_HI: when no locus is found within HSTAR_HI mm the value returned is HSTAR_HI
 * itself, NOT Infinity, so that percentiles are taken over the WHOLE population rather than silently over
 * its finite subset. The censored count is reported alongside every percentile.
 */
function hStar(th: number, z: number): number {
  if (spreadAt(th, z, HSTAR_HI) < TURN_BAR) return HSTAR_HI;
  if (spreadAt(th, z, HSTAR_LO) >= TURN_BAR) return HSTAR_LO;
  let lo = Math.log(HSTAR_LO); let hi = Math.log(HSTAR_HI);
  for (let i = 0; i < 34; i += 1) {
    const mid = 0.5 * (lo + hi);
    if (spreadAt(th, z, Math.exp(mid)) >= TURN_BAR) hi = mid; else lo = mid;
  }
  return Math.exp(hi);
}
/** min over the facet's own order-k lattice (with the honest inset) of hStar — the footprint's distance. */
function facetHStar(f: number, k: number, inset: number): number {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const sh = 1 - inset; const sc = inset / 3;
  let best = Infinity;
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
      const v = hStar(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz);
      if (v < best) best = v;
    }
  }
  return best;
}
log(`── STAGE 5 / PR4: WHY h MATTERS — DISTANCE FROM THE FOOTPRINT TO THE NEAREST TURN LOCUS  ${el()} ──`);
log(`  hStar(p) = smallest h whose finite-difference window reaches a >= ${(TURN_BAR * DEG).toFixed(0)} deg turn at p, i.e. the mm`);
log('  distance from p to that locus. A facet whose min-over-lattice hStar EXCEEDS its own lattice spacing');
log('  has NO locus inside it: its large-h normDeg is the window reaching OUTSIDE the footprint = ARTEFACT.');
{
  const insetW = INSET_HI;
  const keyAll = `>${HI_DEG} CLASS (all)|${insetW}`;
  const P = PER[keyAll];
  const nH = HS.length;
  const movers: Array<{ f: number; ratio: number; vCtl: number; vStab: number }> = [];
  const stayers: Array<{ f: number; vStab: number }> = [];
  if (P !== undefined) {
    // MOVERS are drawn only from the population S114 ACTUALLY COUNTED — facets over the bar at the
    // campaign default h. A facet that is 0.01 deg at both rungs has a huge ratio and no relevance.
    for (let i = 0; i < P.set.length; i += 1) {
      const vCtl = P.per[i * nH + (iCtl >= 0 ? iCtl : 0)];
      const vStab = P.per[i * nH + (iStab >= 0 ? iStab : nH - 1)];
      const ratio = vCtl / Math.max(vStab, 1e-6);
      if (vCtl > HI_DEG) movers.push({ f: P.set[i], ratio, vCtl, vStab });
      if (vStab > HI_DEG) stayers.push({ f: P.set[i], vStab });
    }
    movers.sort((a, b) => b.ratio - a.ratio);
  }
  const topMovers = movers.slice(0, NWHY);
  const stayN = pick(stayers.map((s) => s.f), Math.min(NWHY, stayers.length));
  const rep = (nm: string, fs: number[]): Record<string, number> => {
    const hsv: number[] = []; const spac: number[] = []; const rel: number[] = []; const alt: number[] = [];
    let cens = 0;
    for (const f of fs) {
      const hv = facetHStar(f, K_OBS, insetW);
      const sp = diamOf(f) / K_OBS;
      if (hv >= HSTAR_HI) cens += 1;
      hsv.push(hv); spac.push(sp); rel.push(hv / Math.max(sp, 1e-12)); alt.push(minAltitude(f));
    }
    log(`  ${nm}  n=${fs.length}`);
    log(`     facet diam/k (lattice spacing) p50 ${q(spac, 0.5).toExponential(2)} mm   min altitude p50 ${q(alt, 0.5).toExponential(2)} mm`);
    log(`     min-over-lattice hStar  p10 ${q(hsv, 0.1).toExponential(2)}  p50 ${q(hsv, 0.5).toExponential(2)}  p90 ${q(hsv, 0.9).toExponential(2)} mm   (RIGHT-CENSORED at ${HSTAR_HI} mm: ${cens}/${fs.length} = ${pct(cens, fs.length)}%)`);
    log(`     hStar / lattice spacing p10 ${q(rel, 0.1).toExponential(2)}  p50 ${q(rel, 0.5).toExponential(2)}  p90 ${q(rel, 0.9).toExponential(2)}   (<1 => a locus is INSIDE the footprint)`);
    const inside = rel.filter((r) => r < 1).length;
    log(`     locus INSIDE the footprint (hStar < lattice spacing): ${inside}/${fs.length} = ${pct(inside, fs.length)}%`);
    return {
      n: fs.length, spacingP50: q(spac, 0.5), hStarP50: q(hsv, 0.5), relP50: q(rel, 0.5),
      insideFrac: fs.length > 0 ? inside / fs.length : NaN, censored: cens,
    };
  };
  const why: Record<string, unknown> = {};
  if (topMovers.length > 0) {
    log(`  TOP h-MOVERS (largest normDeg(${H_CTL.toExponential(0)})/normDeg(${H_STABLE.toExponential(0)}) ratio; p50 ratio in this set ${f2(q(topMovers.map((m) => m.ratio), 0.5))}x)`);
    why.movers = rep('    -> movers', topMovers.map((m) => m.f));
  }
  if (stayN.length > 0) {
    log(`  h-STAYERS (normDeg > ${HI_DEG} deg AT h=${H_STABLE.toExponential(0)} — the honest target)`);
    why.stayers = rep('    -> stayers', stayN);
  }
  // The whole-wall feature-scale distribution: how densely packed the turn loci actually are.
  {
    const fs = pick(smoothF.concat(sampWall), Math.min(NFEAT, smoothF.length + sampWall.length));
    const hsv: number[] = [];
    for (const f of fs) {
      const [ath, bth, cth] = th3(f);
      hsv.push(hStar((ath + bth + cth) / 3, (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3));
    }
    const cens = hsv.filter((v) => v >= HSTAR_HI).length;
    log(`  WHOLE-WALL LOCUS DENSITY (centroid hStar over n=${fs.length} mixed smooth+wall facets):`);
    log(`     p10 ${q(hsv, 0.1).toExponential(2)}  p50 ${q(hsv, 0.5).toExponential(2)}  p90 ${q(hsv, 0.9).toExponential(2)} mm   RIGHT-CENSORED at ${HSTAR_HI} mm (no locus that close): ${cens}/${fs.length} = ${pct(cens, fs.length)}%`);
    why.wallLocus = { n: fs.length, p10: q(hsv, 0.1), p50: q(hsv, 0.5), p90: q(hsv, 0.9), censored: cens };
  }
  // ── THE KNOT'S OWN mm SCALE, derived from the registry defaults (CelticTriquetra only). ──
  if (STYLE === 'CelticTriquetra') {
    const Nx = Math.max(1, Math.floor((DEFAULTS.ctScaleX ?? 14) + 0.5));
    const Ny = Math.max(2, Math.floor((DEFAULTS.ctRows ?? 6) + 0.5));
    const halfW = DEFAULTS.ctWidth ?? 0.18;
    const gap = DEFAULTS.ctGap ?? 0.05;
    const rMid = (DIMS.Rb + DIMS.Rt) / 2;
    const circ = 2 * Math.PI * rMid;
    const arcPerPX = circ / Nx;                       // mm of arc per unit of the knot's x index
    const zPerPY = ((0.88 - 0.55) * H) / Ny;          // mm of z per unit of the knot's y index (upper band)
    // the 45-deg diamond map (qx,qy) = (pX+pY, -pX+pY) has singular values arcPerPX/sqrt2, zPerPY/sqrt2
    const qMax = arcPerPX / Math.SQRT2; const qMin = zPerPY / Math.SQRT2;
    const aa = Math.max(0.006, halfW * 0.25);
    const coreW = Math.min(Math.max(halfW * (0.55 + gap * 1.5), halfW * 0.45), halfW * 0.90);
    log('  CelticTriquetra KNOT FEATURE SCALE, derived from the registry defaults + dims:');
    log(`     ribbon tile grid Nx=${Nx} Ny=${Ny}; one x-index = ${arcPerPX.toFixed(3)} mm of arc at r=${rMid}, one y-index = ${zPerPY.toFixed(3)} mm of z`);
    log(`     one diamond-tile unit measures between ${qMin.toFixed(3)} and ${qMax.toFixed(3)} mm`);
    log(`     ribbon half-width  ctWidth ${halfW} tile = ${(halfW * qMin).toFixed(4)} .. ${(halfW * qMax).toFixed(4)} mm`);
    log(`     ribbon edge blend  aa ${aa.toFixed(4)} tile = ${(aa * qMin).toFixed(4)} .. ${(aa * qMax).toFixed(4)} mm`);
    log(`     over/under carve   coreW ${coreW.toFixed(4)} tile (ctGap ${gap}) = ${(coreW * qMin).toFixed(4)} .. ${(coreW * qMax).toFixed(4)} mm`);
    log(`     *** COMPARE: the largest h rung is ${mx(HS).toExponential(0)} mm. The knot's own features are mm-scale, ${(halfW * qMin / mx(HS)).toExponential(1)}x larger. ***`);
    log('     So h is NOT resolving the ribbon width. Whatever h is straddling is a LOCUS (a curve where');
    log('     the one-sided derivatives differ), and hStar above measures the distance to it directly.');
    why.ctScale = { Nx, Ny, arcPerPX, zPerPY, qMin, qMax, halfWMmMin: halfW * qMin, halfWMmMax: halfW * qMax, aaMmMin: aa * qMin, coreWMmMin: coreW * qMin };
  }
  OUT.stage5 = why;
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ORACLE MACHINERY — COPIED IN CONSTRUCTION FROM s114SweepA SO THE TWO ARE COMPARABLE LINE-FOR-LINE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};
interface Samp { n: Float64Array; pth: Float64Array; pz: Float64Array; m: number }
function sampleFacet(f: number, k: number, ns: NormalSampler): Samp {
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  const rRef = rRefOf(f);
  const cap = ((k + 1) * (k + 2)) / 2;
  const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
  let m = 0;
  const sc = new Float64Array(12);
  for (let i = 0; i <= k; i += 1) {
    for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = ns(th, z, sc);
      for (let qi = 0; qi < nc; qi += 1) {
        n[m * 3] = sc[qi * 3]; n[m * 3 + 1] = sc[qi * 3 + 1]; n[m * 3 + 2] = sc[qi * 3 + 2];
        pth[m] = rRef * th; pz[m] = z; m += 1;
      }
    }
  }
  return { n, pth, pz, m };
}
interface Split { lab: Int8Array; c: Float64Array; nA: number; nB: number; sepRad: number; wA: number; wB: number }
function twoMeans(n: Float64Array, m: number): Split {
  const lab = new Int8Array(m); const c = new Float64Array(6);
  if (m === 0) return { lab, c, nA: 0, nB: 0, sepRad: 0, wA: 0, wB: 0 };
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
interface PairOracle { sepCentDeg: number; sepCreaseDeg: number; gapMm: number; crease: boolean; irr: boolean }
function oraclePair(f1: number, f2: number, ns: NormalSampler, kLat: number): PairOracle {
  const s1 = sampleFacet(f1, kLat, ns); const s2 = sampleFacet(f2, kLat, ns);
  const m = s1.m + s2.m;
  const n = new Float64Array(m * 3); const pth = new Float64Array(m); const pz = new Float64Array(m);
  n.set(s1.n.subarray(0, s1.m * 3), 0); n.set(s2.n.subarray(0, s2.m * 3), s1.m * 3);
  pth.set(s1.pth.subarray(0, s1.m), 0); pth.set(s2.pth.subarray(0, s2.m), s1.m);
  pz.set(s1.pz.subarray(0, s1.m), 0); pz.set(s2.pz.subarray(0, s2.m), s1.m);
  const sp = twoMeans(n, m);
  const idxA: number[] = []; const idxB: number[] = [];
  for (let i = 0; i < m; i += 1) (sp.lab[i] === 0 ? idxA : idxB).push(i);
  const cand: Array<{ dd: number; ang: number }> = [];
  for (const a of idxA) for (const b of idxB) cand.push({ dd: Math.hypot(pth[a] - pth[b], pz[a] - pz[b]), ang: angU(n, a * 3, n, b * 3) });
  cand.sort((x, y) => x.dd - y.dd);
  let sepCrease = 0; let gap = NaN;
  const take = Math.min(NCROSS, cand.length);
  for (let i = 0; i < take; i += 1) if (cand[i].ang > sepCrease) sepCrease = cand[i].ang;
  if (take > 0) gap = cand[take - 1].dd;
  const sepCentDeg = sp.sepRad * DEG;
  const minSide = Math.min(idxA.length, idxB.length);
  const crease = sepCentDeg >= SEP_MIN && minSide >= 2 && sepCentDeg > Math.max(sp.wA, sp.wB) * DEG;
  return { sepCentDeg, sepCreaseDeg: sepCrease * DEG, gapMm: gap, crease, irr: sepCrease * DEG >= HI_DEG };
}
/** The PLACEBO analytic: a provably C-infinity truncated cone at the same scale. Nothing on it is a crease. */
const rFlat = (_th: number, z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (Math.min(H, Math.max(0, z)) / H);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — THE RE-DERIVATION (PR3): S114's STAGE 3/4/7 ACCOUNTING, RUN AT TWO h ARMS
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface ArmOut {
  h: number; scoped: number;
  accEdges: number; accArea: number; accNormP50: number; accMeasP50: number;
  conEdges: number; conArea: number; strEdges: number; strArea: number; strNormP50: number;
  scopedArea: number; irrStrad: number; irrCurtain: number; classWideIrrPct: number;
  reducibleMm2: number; reduciblePctMesh: number; placeboPct: number; placeboFired: boolean;
  oracled: number; curtainOracled: number;
}
function runArm(h: number): ArmOut {
  const ns = fdNormals(rA, H, h, h);
  const ndHi = new Map<number, number>(); const ndLo = new Map<number, number>();
  const getHi = (f: number): number => { let v = ndHi.get(f); if (v === undefined) { v = normDegOf(f, ns, INSET_HI); ndHi.set(f, v); } return v; };
  const getLo = (f: number): number => { let v = ndLo.get(f); if (v === undefined) { v = normDegOf(f, ns, INSET_LO); ndLo.set(f, v); } return v; };
  const scope = pick(wallE, WALLSCOPE);
  interface WEdge { e: number; f1: number; f2: number; measDeg: number; normHi: number; cls: string }
  const wrows: WEdge[] = [];
  for (const e of scope) {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const normHi = Math.max(getHi(f1), getHi(f2));
    const normLo = Math.max(getLo(f1), getLo(f2));
    const drop = normLo > 1e-9 ? normHi / normLo : 1;
    const cls = normHi <= NORMHI_BAR ? 'ACCURATE' : drop < DROP_CUT ? 'CONFORMED' : 'STRADDLING';
    wrows.push({ e, f1, f2, measDeg: d.edgeAngRad[e] * DEG, normHi, cls });
  }
  const byCls = (c: string): WEdge[] => wrows.filter((r) => r.cls === c);
  const scopedF = facetsOfEdges(scope); const scopedA = areaOfSet(scopedF);
  const areaOfCls = (c: string): number => areaOfSet(facetsOfEdges(byCls(c).map((r) => r.e)));
  const aAccS = areaOfCls('ACCURATE'); const aConS = areaOfCls('CONFORMED'); const aStrS = areaOfCls('STRADDLING');
  const scale = wallA / Math.max(1e-30, scopedA);
  // Stage 4 — the oracle on the straddling class
  const strad = byCls('STRADDLING');
  const orRows = pick(strad.map((_r, i) => i), ORACLE_N).map((i) => strad[i]);
  const anyIrr = new Map<number, boolean>(); const uniq: number[] = []; const seen = new Set<number>();
  for (const r of orRows) {
    const o = oraclePair(r.f1, r.f2, ns, K_LAT);
    for (const f of [r.f1, r.f2]) {
      if (!seen.has(f)) { seen.add(f); uniq.push(f); }
      anyIrr.set(f, (anyIrr.get(f) ?? false) || o.irr);
    }
  }
  let tA = 0; let iA = 0;
  for (const f of uniq) { tA += d.areaMm2[f]; if (anyIrr.get(f) === true) iA += d.areaMm2[f]; }
  const irrStrad = tA > 0 ? iA / tA : NaN;
  // Stage 3c — the oracle on the curtain class
  const cs3 = pick(curtainE, CURTAIN_N);
  let cAll = 0; let cIrr = 0;
  for (const e of cs3) {
    const o = oraclePair(d.edgeF1[e], d.edgeF2[e], ns, K_LAT_CURTAIN);
    const a = d.areaMm2[d.edgeF1[e]] + d.areaMm2[d.edgeF2[e]];
    cAll += a; if (o.irr) cIrr += a;
  }
  const irrCurtain = cAll > 0 ? cIrr / cAll : NaN;
  // C5 — the placebo, at THIS h
  const nsFlat = fdNormals(rFlat, H, h, h);
  const src = strad.length > 0 ? strad : wrows;
  const pl = pick(src.map((_r, i) => i), 300).map((i) => src[i]);
  let nc2 = 0;
  for (const r of pl) if (oraclePair(r.f1, r.f2, nsFlat, K_LAT).crease) nc2 += 1;
  const placeboPct = pl.length > 0 ? (nc2 / pl.length) * 100 : NaN;
  // Stage 7 — the accounting
  const aAcc = aAccS * scale; const aCon = aConS * scale; const aStr = aStrS * scale;
  const irrTot = (Number.isFinite(irrCurtain) ? curtainA * irrCurtain : 0) + aAcc + aCon
    + (Number.isFinite(irrStrad) ? aStr * irrStrad : 0);
  const denom = curtainA + aAcc + aCon + aStr;
  const nhA = byCls('ACCURATE').map((r) => r.normHi); const nhS = byCls('STRADDLING').map((r) => r.normHi);
  return {
    h, scoped: scope.length,
    accEdges: byCls('ACCURATE').length, accArea: aAcc, accNormP50: q(nhA, 0.5), accMeasP50: q(byCls('ACCURATE').map((r) => r.measDeg), 0.5),
    conEdges: byCls('CONFORMED').length, conArea: aCon,
    strEdges: strad.length, strArea: aStr, strNormP50: q(nhS, 0.5),
    scopedArea: scopedA, irrStrad, irrCurtain,
    classWideIrrPct: (irrTot / Math.max(1e-30, denom)) * 100,
    reducibleMm2: denom - irrTot, reduciblePctMesh: ((denom - irrTot) / meshArea) * 100,
    placeboPct, placeboFired: placeboPct > 5, oracled: orRows.length, curtainOracled: cs3.length,
  };
}
if (REDERIVE) {
  log(`── STAGE 6 / PR3: THE RE-DERIVATION — S114's Stage 3/4/7 accounting at TWO h ARMS  ${el()} ──`);
  log(`  scope ${Math.min(WALLSCOPE, wallE.length)} of ${wallE.length} WALL edges; oracle ${ORACLE_N} straddling pairs (K=${K_LAT}); curtain ${CURTAIN_N} edges (K=${K_LAT_CURTAIN})`);
  const arms: ArmOut[] = [];
  for (const h of [H_CTL, H_STABLE]) {
    const t = Date.now();
    arms.push(runArm(h));
    log(`  arm h=${h.toExponential(0)} done [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  }
  const [A, B] = arms;
  log('');
  log(`  ${'quantity'.padEnd(46)} ${`h=${A.h.toExponential(0)} (S114 default)`.padStart(22)} ${`h=${B.h.toExponential(0)} (h-stable)`.padStart(22)}`);
  const row = (nm: string, a: string, b: string): void => log(`  ${nm.padEnd(46)} ${a.padStart(22)} ${b.padStart(22)}`);
  row('WALL/ACCURATE   edges (of scoped)', `${A.accEdges}`, `${B.accEdges}`);
  row('WALL/ACCURATE   AREA mm2 (scaled to full WALL)', A.accArea.toFixed(3), B.accArea.toFixed(3));
  row('  its normHi p50 / measured dihedral p50 (deg)', `${f2(A.accNormP50)} / ${f2(A.accMeasP50)}`, `${f2(B.accNormP50)} / ${f2(B.accMeasP50)}`);
  row('WALL/CONFORMED  edges / AREA mm2', `${A.conEdges} / ${A.conArea.toFixed(3)}`, `${B.conEdges} / ${B.conArea.toFixed(3)}`);
  row('WALL/STRADDLING edges / AREA mm2', `${A.strEdges} / ${A.strArea.toFixed(3)}`, `${B.strEdges} / ${B.strArea.toFixed(3)}`);
  row('  its normHi p50 (deg)', f2(A.strNormP50), f2(B.strNormP50));
  row('STRADDLING irreducible-by-area', `${(A.irrStrad * 100).toFixed(2)}%`, `${(B.irrStrad * 100).toFixed(2)}%`);
  row('CURTAIN    irreducible-by-area', `${(A.irrCurtain * 100).toFixed(2)}%`, `${(B.irrCurtain * 100).toFixed(2)}%`);
  row('C5 PLACEBO crease-labelled (kill > 5%)', `${A.placeboPct.toFixed(2)}%`, `${B.placeboPct.toFixed(2)}%`);
  log(`  ${'-'.repeat(94)}`);
  row('*** CLASS-WIDE IRREDUCIBLE (of >45 area) ***', `${A.classWideIrrPct.toFixed(2)}%`, `${B.classWideIrrPct.toFixed(2)}%`);
  row('*** REDUCIBLE mm2 ***', A.reducibleMm2.toFixed(2), B.reducibleMm2.toFixed(2));
  row('*** REDUCIBLE % OF MESH ***', `${A.reduciblePctMesh.toFixed(4)}%`, `${B.reduciblePctMesh.toFixed(4)}%`);
  log('');
  log(`  RATIO h-stable / h-default on the reducible share: ${(B.reduciblePctMesh / Math.max(1e-12, A.reduciblePctMesh)).toFixed(4)}x`);
  if (A.placeboFired || B.placeboFired) log('  *** CONTROL C5 FIRED ON AN ARM — that arm\'s oracle shares are VOID. ***');
  OUT.stage6 = { arms };
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — CONTROL C6: THE k LADDER AT BOTH h ARMS (scar 2 — convergence SHOWN, never assumed)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log(`── STAGE 7 / CONTROL C6: k LADDER at both h arms, inset ${INSET_HI}, n=${Math.min(NKLAD, sampClass.length)}  ${el()} ──`);
{
  const sub = pick(sampClass, NKLAD);
  const kl: Record<string, unknown> = {};
  for (const h of [H_CTL, H_STABLE]) {
    const ns = fdNormals(rA, H, h, h);
    let prev: number[] | null = null;
    for (const kk of KLADDER) {
      const v = sub.map((f) => normDegOf(f, ns, INSET_HI, kk));
      const rel = prev === null ? NaN : q(v.map((x, i) => ((prev as number[])[i] > 1e-9 ? x / (prev as number[])[i] : 1)), 0.5);
      log(`     h=${h.toExponential(0).padStart(6)}  k=${String(kk).padStart(3)}  p50 ${f3(q(v, 0.5)).padStart(10)}  p90 ${f2(q(v, 0.9)).padStart(8)}  MAX ${f2(q(v, 1)).padStart(8)} deg   median ratio vs prev k ${Number.isFinite(rel) ? rel.toFixed(4) : '—'}`);
      kl[`h${h}k${kk}`] = { p50: q(v, 0.5), p90: q(v, 0.9), max: q(v, 1), medRatioVsPrev: rel };
      prev = v;
    }
  }
  OUT.c6 = kl;
}
log('');
OUT.verdict = C2_FIRED ? 'VOID-CONTROL-C2' : 'MEASURED';
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`S115 h-LADDER for ${STYLE}: ${OUT.verdict}`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
writeFileSync(`${OUTDIR}/S115H_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/S115H_${TAG}.json   done ${el()}`);
