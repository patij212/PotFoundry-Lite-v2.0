// s115CrossStyle.ts — S115: DO THE "GENUINE MESH DEFECT" STYLES SHARE ONE MECHANISM?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. S114 measured, per style, whether the >45 deg adjacent-dihedral class is REAL ANALYTIC TURN
// (Gothic: 94.83% of flagged area is accurate facets rendering a genuine crease) or MESH DEFECT. It found
// six styles on the mesh-defect side — HexagonalHive, ArtDeco, SpiralRidges, WaveInterference, Voronoi,
// Crystalline — and CelticTriquetra as the biggest reducible target. *** NOBODY HAS RUN A MECHANISM TEST
// ON ANY OF THEM. *** If they share ONE mechanism, one operator serves all of them. If they do not, that
// is equally decisive and the campaign must stop looking for a single shape-agnostic operator.
//
// This tool is a CENSUS + a MECHANISM PARTITION. Nothing is flipped, split, snapped or moved.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// *** THE PARTITION, AND WHOSE THRESHOLDS THESE ARE. ***
// The brief asked for "the SAME mechanism partition char:mechanism is running on CelticTriquetra, with
// the same thresholds". AT THE TIME THIS FILE WAS WRITTEN NO SUCH TOOL EXISTED ON DISK (research/tools
// contains no s115*; git status is clean). So the partition below is DEFINED HERE, from the campaign's
// own instrument semantics, and it is PRE-REGISTERED with every threshold named and swept. It is NOT a
// copy of a sibling's thresholds and must not be quoted as if it were. CelticTriquetra is run through
// THE IDENTICAL CODE PATH as the other six so the cross-style comparison is internally like-for-like
// even if a sibling's absolute numbers differ.
//
// Per FACET (never per pair — per-pair accounting inflated a published campaign figure by 1.711x), on
// the >45 deg class, priority-ordered, mutually exclusive, exhaustive:
//
//   1. CURTAIN     graphRatio > R (default 8).  NOT A MECHANISM — an INSTRUMENT LIMIT. The facet is far
//                  from a graph over (theta, z), so rA's normal is not the surface normal there and every
//                  analytic quantity below is undefined. Reported first so it cannot contaminate a
//                  mechanism share. R IS SWEPT {2,4,8,16,32,128} (scar 4: on CelticTriquetra this cut is
//                  KNOWN unconverged).
//   2. SLIVER      min 3-D altitude < A (default 20 um).  S111's mechanism for "the mesh ADDS turn":
//                  a degenerate facet's normal is ill-conditioned, so it reads a large dihedral against a
//                  neighbour without the surface turning at all. A IS SWEPT {2,5,10,20,50} um.
//   3. STRADDLE    a C0 feature is LOCATED inside the footprint (locateKinkRaw fires on >=1 of the three
//                  footprint edges) AND spreadDeg > S (default 10). The analytic surface genuinely turns
//                  inside this facet. Remedy = SPLIT ON THE LOCUS / ALIGN.
//   4. UNDER-RES   no kink located AND spreadDeg > S. The normal field sweeps SMOOTHLY through more angle
//                  than one plane can carry. Remedy = REFINE.
//   5. MIS-ORIENT  spreadDeg <= S AND normDeg > S. The analytic normal field is near-constant inside the
//                  footprint and the facet is simply tilted off it. Remedy = REPLACE/FLIP at zero
//                  triangle cost. (orientRuler's own doc names spreadRad as exactly this discriminator.)
//   -- and then the accurate remainder (spreadDeg <= S AND normDeg <= S) is SPLIT BY ITS PARTNER, because
//      the smoke run proved it must be: on WaveInterference 80.6% of class facets are SLIVER BY COUNT
//      while 92.7% of class AREA sat in one undifferentiated "accurate" bucket. A facet enters the class
//      if ANY neighbour makes a >45 edge with it, so most class AREA is INNOCENT BIG NEIGHBOURS of tiny
//      defective facets. Reporting that as one bucket would have hidden the entire mechanism.
//   6. REAL_TURN   accurate, and its >45 partner is ALSO accurate. *** THIS IS A PROOF, NOT AN INFERENCE:
//                  normDeg is a SUP over the footprint, so if both facets are within S of the analytic
//                  normal everywhere and their mutual angle is `dih`, the analytic normal field must turn
//                  by at least dih - nd1 - nd2 across the shared edge. That lower bound is COMPUTED and
//                  its distribution printed. *** This is Gothic's 94.83% class.
//   7. PARTNER     accurate, and every >45 partner is locally flagged (2-5). The defect is on the OTHER
//                  side of the edge; THIS facet needs no operator. Area here is NOT a target.
//   8. PARTNER_UND accurate, and its only >45 partners are CURTAIN (ruler undefined there). UNDECIDABLE.
//
// THE OPERATOR TARGET is therefore SLIVER + STRADDLE + UNDER_RES + MIS_ORIENT ("locally flagged"), and
// it is quoted as COUNT + AREA(% of class) + AREA(% of mesh) + MAX, never as one of those alone.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR INSTRUMENT SCARS — every one is obeyed and its ladder is PRINTED, not assumed.
//  1. `inset`  passed EXPLICITLY, swept {0, 0.02, 0.05, 0.1}. Canonical 0.05.
//  2. lattice `k` swept {4,8,16,32} WITH the resulting partition shares, because spreadDeg is a
//     classification input and *** spreadRad IS KNOWN NOT TO CONVERGE IN k ***. A partition whose shares
//     move with k is reported as k-UNSTABLE and its verdict is downgraded. spreadRad is NEVER quoted at
//     one k as if it were a measurement.
//  3. *** THE FINITE-DIFFERENCE STEP h *** (fdNormals' hArc/hZ) swept {2e-6, 2e-5, 2e-4, 1e-3, 5e-3} on
//     normDeg, spreadDeg AND the partition shares. A style whose partition moves with h is reported as
//     h-UNSTABLE and NO normDeg number is quoted for it without its h.
//  4. classification thresholds: curtain R, sliver A, spread/normDeg bar S, and the 45 deg visibility bar
//     all swept with the ladder printed.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS — a run whose control fires is VOID, reported as void, never rescued.
//  C1 PRECOND. max |r_mesh - rA| over a stride sample. > 50 um => REFUSE THE MESH, no analytic number
//     is admissible for that style.
//  C2 PLACEBO (the classifier's negative control, COST-MATCHED: identical code, identical sample size,
//     on facets whose per-facet max dihedral is < 2 deg, i.e. provably smooth wall). The partition must
//     put ~0% of those into SLIVER/STRADDLE/UNDER-RES/MIS-ORIENT. *** > 5% VOIDS THE STYLE. ***
//  C3 FLOOR (two-sided: a one-sided bar is satisfied by a degenerate answer). The >45 class itself must
//     come out substantially NON-ACCURATE, else the partition is vacuous on that style.
//  C4 RECONCILIATION. The >45 class is derived twice (from the edge list and from the per-facet max) and
//     the facet sets must agree exactly.
//  C5 WINDING/INVERSION census, printed alongside, because comparing an as-wound dihedral to an analytic
//     turn without that audit is how S97/S98 mislabelled a census.
//
// MEASUREMENT DISCIPLINE: COUNT + AREA-share + MAX on every population. NEVER a bare count, never a bare
// max. *** NEVER AVERAGED ACROSS STYLES. *** The output is a table and named groupings.
//
// Usage: bash research/tools/run-s115-crossstyle.sh   (env PF_S115_STEMS / PF_S115_TAG / PF_S115_STAGE)
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');

const DEG = 180 / Math.PI;
const OUTDIR = process.env.PF_S115_OUTDIR ?? 'research/exchange/_strataConformBisect/s115cross';
const TAG = process.env.PF_S115_TAG ?? 'X';
const EXDIR = process.env.PF_S115_EXDIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';

// ── THE ROSTER. stem = the mesh the PRIOR sweeps used (s91StyleCensus DEFAULT_STEMS, carried through
// S114-A/B/C/D verbatim). CelticTriquetra is the REFERENCE, GothicArches the instrument CONTROL. ──
const DEFAULT_STEMS = [
  'CelticTriquetra:celtictriquetra_ring_D--',   // S114 reference: 65x Gothic reducible
  'HexagonalHive:hexagonalhive_ring_D--',       // S114: 0.00% irreducible
  'ArtDeco:artdeco_ring_D--',                   // S114: 0.00% (straddling arm)
  'SpiralRidges:spiralridges_ring_D--',         // S114: 0.00%
  'WaveInterference:waveinterference_ring_D--', // S114: 0.00%
  'Voronoi:voronoi_ring_D--',                   // S114: 2.15%
  'Crystalline:crystalline_ring_D--',           // S114-B: the 6th
  'GothicArches:gothicarches_ring_DS-HT_S39CTL', // CTL: the style whose class IS real turn
].join(',');
const STEMS = (process.env.PF_S115_STEMS ?? DEFAULT_STEMS).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

const DIMS: StyleDims = { H: envF('PF_S115_H', 120), Rb: envF('PF_S115_RB', 40), Rt: envF('PF_S115_RT', 50), expn: 1 };
const H = DIMS.H;

// ── PRE-REGISTERED THRESHOLDS (canonical values; every one is swept below) ──
const PRECOND_UM = envF('PF_S115_PRECOND_UM', 50);
const HI_DEG = envF('PF_S115_HI', 45);            // S108's visibility cut (a CONVENTION, never validated)
const CURTAIN_R = envF('PF_S115_CURTAIN', 8);     // S112's wall/curtain cut on graphRatio
const SLIVER_UM = envF('PF_S115_SLIVER_UM', 20);  // min 3-D altitude, um (S111 class read 5.94 um)
const BAR_DEG = envF('PF_S115_BAR', 10);          // S112's normHi bar, reused for spreadDeg
const K_CANON = envI('PF_S115_K', 8);
const INSET_CANON = envF('PF_S115_INSET', 0.05);
const H_CANON = envF('PF_S115_HFD', 2e-4);
const H_LADDER = (process.env.PF_S115_HLADDER ?? '2e-6,2e-5,2e-4,1e-3,5e-3').split(',').map(Number);
const K_LADDER = (process.env.PF_S115_KLADDER ?? '4,8,16,32').split(',').map(Number);
const INSET_LADDER = (process.env.PF_S115_INSETS ?? '0,0.02,0.05,0.1').split(',').map(Number);
const R_LADDER = (process.env.PF_S115_RLADDER ?? '2,4,8,16,32,128').split(',').map(Number);
const A_LADDER_UM = (process.env.PF_S115_ALADDER ?? '2,5,10,20,50').split(',').map(Number);
const VIS_LADDER = (process.env.PF_S115_VISLADDER ?? '30,45,60,90,120').split(',').map(Number);

const NCLASS = envI('PF_S115_NCLASS', 2500);      // >45 class sample put through the full partition
const NLAD = envI('PF_S115_NLAD', 250);           // h/k/inset ladder subsample
const NINV = envI('PF_S115_NINV', 15000);         // whole-mesh golden-stride sample for the inverted census
const NPLACEBO = envI('PF_S115_NPLACEBO', 2500);  // cost-matched negative control
const RESUME = envB('PF_S115_RESUME', true);

// the driver's own kink predicate constants, verbatim from S114-A
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.6 / 1000,
};

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

const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
const pc = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');

/** Deterministic golden-stride index sample of `n` from [0,N). No RNG; spread over the whole mesh. */
function goldenSample(N: number, n: number): Int32Array {
  if (n >= N) { const all = new Int32Array(N); for (let i = 0; i < N; i += 1) all[i] = i; return all; }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let step = Math.max(1, Math.round(N * 0.6180339887498949));
  while (gcd(step, N) !== 1) step += 1;
  const out = new Int32Array(n);
  let cur = 0;
  for (let i = 0; i < n; i += 1) { out[i] = cur; cur = (cur + step) % N; }
  return out;
}
function goldenPick<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return arr.slice();
  const idx = goldenSample(arr.length, n);
  const out: T[] = [];
  for (let i = 0; i < idx.length; i += 1) out.push(arr[idx[i]]);
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const MECHS = ['CURTAIN', 'SLIVER', 'STRADDLE', 'UNDER_RES', 'MIS_ORIENT', 'REAL_TURN', 'PARTNER', 'PARTNER_UND'] as const;
type Mech = typeof MECHS[number];
/** the buckets an operator would have to act ON — the defect is IN this facet */
const FLAGGED: Mech[] = ['SLIVER', 'STRADDLE', 'UNDER_RES', 'MIS_ORIENT'];

interface Bucket { cnt: number; area: number; maxNd: number; maxDih: number; maxSpread: number }
const emptyBuckets = (): Record<Mech, Bucket> => {
  const o = {} as Record<Mech, Bucket>;
  for (const m of MECHS) o[m] = { cnt: 0, area: 0, maxNd: -Infinity, maxDih: -Infinity, maxSpread: -Infinity };
  return o;
};

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('  S115 — CROSS-STYLE MECHANISM PARTITION OF THE >45 DEG CLASS');
log('  QUESTION: do the "genuine mesh defect" styles share ONE mechanism with CelticTriquetra?');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log(`  canonical setting: k=${K_CANON}  inset=${INSET_CANON}  h=${H_CANON}  curtainR=${CURTAIN_R}  sliver=${SLIVER_UM}um  bar=${BAR_DEG}deg  vis=${HI_DEG}deg`);
log(`  ladders: h ${H_LADDER.join('/')} | k ${K_LADDER.join('/')} | inset ${INSET_LADDER.join('/')} | R ${R_LADDER.join('/')} | A ${A_LADDER_UM.join('/')}um | vis ${VIS_LADDER.join('/')}deg`);
log(`  samples: class ${NCLASS}  ladder ${NLAD}  inverted ${NINV}  placebo ${NPLACEBO}`);
log(`  *** THE PARTITION THRESHOLDS ARE DEFINED IN THIS FILE (no sibling tool existed to copy). ***`);
log('');

const NDJSON = `${OUTDIR}/S115_CROSS_${TAG}.ndjson`;
const done = new Set<string>();
const results: Array<Record<string, unknown>> = [];
if (RESUME && existsSync(NDJSON)) {
  for (const l of readFileSync(NDJSON, 'utf8').split('\n')) {
    if (l.length < 3) continue;
    try { const r = JSON.parse(l) as Record<string, unknown>; done.add(r.style as string); results.push(r); }
    catch { /* partial line */ }
  }
  if (done.size > 0) log(`RESUME: ${done.size} styles already in ${NDJSON} — skipping (PF_S115_RESUME=0 to force)\n`);
}

for (const spec of STEMS) {
  const ci = spec.indexOf(':');
  const style = spec.slice(0, ci); const file = spec.slice(ci + 1);
  if (done.has(style)) continue;
  const stl = file.includes('/') || file.includes('\\') ? file : `${EXDIR}/${file}.stl`;
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style}   ${file} ═════`);
  const defs = registryDefaults(style);
  log(`  registry defaults: ${Object.entries(defs).map(([k2, v]) => `${k2}=${v}`).join(' ')}`);
  const rec: Record<string, unknown> = { style, stl, file, ts: new Date().toISOString() };

  const rAbase = buildRadiusFn(style as StyleId, { ...defs }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const scratch = new Float64Array(12);
  const nsCache = new Map<number, NormalSampler>();
  const nsOf = (h: number): NormalSampler => {
    let s = nsCache.get(h);
    if (s === undefined) { s = fdNormals(rA, H, h, h); nsCache.set(h, s); }
    return s;
  };

  const M = readMeshFloat64(stl, false);
  const xyz = M.xyz; const nTri = M.nTri;
  log(`  ${nTri} facets loaded   ${el()}`);

  // ── C1 PRECOND ──────────────────────────────────────────────────────────────────────────────────
  {
    let worst = 0; const all: number[] = [];
    const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) {
      for (let k = 0; k < 3; k += 1) {
        const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
        const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        if (dd > worst) worst = dd; all.push(dd);
      }
    }
    rec.precondMaxUm = worst * 1000; rec.precondP50Um = q(all, 0.5) * 1000; rec.precondP99Um = q(all, 0.99) * 1000;
    rec.precondN = all.length;
    log(`  *** C1 PRECOND max |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um  (p50 ${(q(all, 0.5) * 1000).toExponential(2)}  p99 ${(q(all, 0.99) * 1000).toExponential(2)} um, ${all.length} samples) ***`);
    if (worst * 1000 > PRECOND_UM) {
      log(`  *** REFUSED: PRECOND ${(worst * 1000).toFixed(1)} um > ${PRECOND_UM} um. NO ANALYTIC NUMBER IS ADMISSIBLE FOR ${style}. ***`);
      rec.refused = true; results.push(rec);
      writeFileSync(NDJSON, `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
      continue;
    }
    rec.refused = false;
  }

  // ── STAGE 1: EXHAUSTIVE dihedral, the >45 class ─────────────────────────────────────────────────
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  const dihDeg = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) dihDeg[f] = d.perFacetMaxRad[f] * DEG;
  rec.facets = nTri; rec.areaMm2 = meshArea;
  rec.interiorEdges = d.interiorEdges; rec.boundaryEdges = d.boundaryEdges;
  rec.nonManifoldEdges = d.nonManifoldEdges; rec.inconsistentEdges = d.inconsistentEdges;
  log(`  AREA ${meshArea.toFixed(3)} mm2   interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  nonmanifold ${d.nonManifoldEdges}  inconsistent ${d.inconsistentEdges}   ${el()}`);

  // the class, by FACET
  const classF: number[] = [];
  let classArea = 0; let classDihMax = -Infinity;
  for (let f = 0; f < nTri; f += 1) {
    if (dihDeg[f] > HI_DEG) { classF.push(f); classArea += d.areaMm2[f]; if (dihDeg[f] > classDihMax) classDihMax = dihDeg[f]; }
  }
  rec.classCnt = classF.length; rec.classAreaMm2 = classArea;
  rec.classAreaPctMesh = (classArea / meshArea) * 100; rec.classCntPct = (classF.length / nTri) * 100;
  rec.classDihMax = classDihMax;
  const pfArr = Array.from(dihDeg);
  rec.dihP50 = q(pfArr, 0.5); rec.dihP99 = q(pfArr, 0.99); rec.dihMax = mx(pfArr);
  log(`  ── STAGE 1: DIHEDRAL (analytic-free, EXHAUSTIVE, per-facet MAX) ──`);
  log(`     p50 ${(rec.dihP50 as number).toFixed(3)}  p99 ${(rec.dihP99 as number).toFixed(3)}  MAX ${(rec.dihMax as number).toFixed(5)} deg`);
  log(`     >${HI_DEG} deg CLASS:  COUNT ${classF.length} (${pc(classF.length, nTri)}%)   AREA ${classArea.toFixed(4)} mm2 (${pc(classArea, meshArea)}% of mesh)   MAX ${classDihMax === -Infinity ? 'n/a' : classDihMax.toFixed(5)} deg`);

  // the >45 EDGE list — the partition is edge-driven so the PARTNER refinement is available
  const hiEdges: number[] = [];
  {
    const viaEdge = new Set<number>();
    const thr = (HI_DEG * Math.PI) / 180;
    for (let e = 0; e < d.edgeAngRad.length; e += 1) {
      if (d.edgeAngRad[e] > thr) { hiEdges.push(e); viaEdge.add(d.edgeF1[e]); viaEdge.add(d.edgeF2[e]); }
    }
    // C4 RECONCILIATION: the class derived from the edge list must equal the class from the per-facet max
    let mismatch = 0;
    for (const f of classF) if (!viaEdge.has(f)) mismatch += 1;
    for (const f of viaEdge) if (dihDeg[f] <= HI_DEG) mismatch += 1;
    rec.c4Mismatch = mismatch; rec.hiEdges = hiEdges.length;
    log(`     interior EDGES over ${HI_DEG} deg: ${hiEdges.length} (${pc(hiEdges.length, d.interiorEdges)}% of interior edges)`);
    log(`     C4 RECONCILIATION (edge-list vs per-facet-max): mismatch ${mismatch}  ${mismatch === 0 ? 'OK' : '*** VOIDS THE STYLE ***'}`);
  }

  // visibility-bar ladder (scar 4: 45 deg is a CONVENTION, not a truth) — cheap, exhaustive
  {
    const rows: Array<Record<string, number>> = [];
    log(`  ── LADDER: THE VISIBILITY BAR (45 deg is INHERITED FROM S108 AND NEVER VALIDATED) ──`);
    for (const v of VIS_LADDER) {
      let c = 0; let a = 0;
      for (let f = 0; f < nTri; f += 1) if (dihDeg[f] > v) { c += 1; a += d.areaMm2[f]; }
      rows.push({ bar: v, cnt: c, areaMm2: a, areaPct: (a / meshArea) * 100, cntPct: (c / nTri) * 100 });
      log(`     >${String(v).padStart(3)} deg   COUNT ${String(c).padStart(9)} (${pc(c, nTri)}%)   AREA ${a.toFixed(4).padStart(12)} mm2 (${pc(a, meshArea)}% of mesh)`);
    }
    rec.visLadder = rows;
  }

  if (classF.length === 0) {
    log('  *** NO VISIBLE CLASS: this mesh has zero facets over the bar. The partition is VACUOUS. ***');
    rec.verdict = 'NO-VISIBLE-CLASS';
    results.push(rec);
    writeFileSync(NDJSON, `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
    continue;
  }

  // ── geometry helpers ────────────────────────────────────────────────────────────────────────────
  const th3 = (f: number): [number, number, number] => {
    const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
    const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
    const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
    return [a, b, c];
  };
  const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
    + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
  /** area ratio 3-D / (theta,z)-parameter — > R means the facet is FAR FROM A GRAPH (curtain). */
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
  /** MIN ALTITUDE of the 3-D triangle, mm = 2*area / longest edge. The sliver diagnostic (S111). */
  function minAltMm(f: number): number {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const L = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz),
      Math.hypot(ax - bx, ay - by, az - bz));
    const ar = d.areaMm2[f];
    return L > 0 ? (2 * ar) / L : 0;
  }
  function orientOf(f: number, inset: number, kk: number, hfd: number):
  { nd: number; sp: number; overFrac: number; signMargin: number } {
    const [ath, bth, cth] = th3(f);
    const o = orientOfFacet(nsOf(hfd),
      xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
      { k: kk, inset, orient: 'winding', scratch });
    return { nd: o.normDeg, sp: o.spreadRad * DEG, overFrac: o.overFrac, signMargin: o.signMargin };
  }
  /** |f . n_S(centroid)| under the 'outward' convention — how DECISIVE an inversion verdict is. */
  function outwardMargin(f: number): number {
    const [ath, bth, cth] = th3(f);
    const o = orientOfFacet(nsOf(H_CANON),
      xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
      { k: 2, inset: INSET_CANON, orient: 'outward', scratch });
    return o.signMargin;
  }
  /** Does a C0 feature LIE INSIDE the footprint? locateKinkRaw on all three footprint edges. */
  function kinkInFootprint(f: number): { hit: boolean; jump: boolean } {
    const [ath, bth, cth] = th3(f);
    const zs = [xyz[f * 9 + 2], xyz[f * 9 + 5], xyz[f * 9 + 8]];
    const ths = [ath, bth, cth];
    let hit = false; let jump = false;
    for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      const kk = locateKinkRaw(rA, ths[i], zs[i], ths[j], zs[j], PRED);
      if (kk !== null) { hit = true; if (kk.jump) jump = true; }
    }
    return { hit, jump };
  }

  // ── THE PARTITION, as one function so every ladder arm runs the IDENTICAL code ───────────────────
  type Opt = { R: number; altMm: number; bar: number; inset: number; k: number; h: number };
  interface Base { mech: Mech; nd: number; sp: number; gr: number; alt: number; kink: boolean }
  /** stage 1 of the partition: the LOCAL verdict, before the partner is consulted. */
  function classifyBase(f: number, opt: Opt): Base {
    const gr = graphRatio(f);
    const alt = minAltMm(f);
    if (gr > opt.R) return { mech: 'CURTAIN', nd: NaN, sp: NaN, gr, alt, kink: false };
    if (alt < opt.altMm) return { mech: 'SLIVER', nd: NaN, sp: NaN, gr, alt, kink: false };
    const o = orientOf(f, opt.inset, opt.k, opt.h);
    if (o.sp > opt.bar) {
      const kk = kinkInFootprint(f);
      return { mech: kk.hit ? 'STRADDLE' : 'UNDER_RES', nd: o.nd, sp: o.sp, gr, alt, kink: kk.hit };
    }
    // 'PARTNER' is the placeholder for "locally accurate"; stage 2 resolves it against the partner.
    return { mech: o.nd > opt.bar ? 'MIS_ORIENT' : 'PARTNER', nd: o.nd, sp: o.sp, gr, alt, kink: false };
  }

  interface PartOut {
    b: Record<Mech, Bucket>; totCnt: number; totArea: number;
    turnLB: number[];           // rigorous analytic-turn lower bounds, deg, one per REAL_TURN edge
    edgesScored: number;
  }
  /**
   * THE PARTITION over a set of >45 EDGES. Facet area is DEDUPED (a facet on two flagged edges is counted
   * once), which is why this takes edges and not facets: the partner refinement needs the edge, the area
   * accounting needs the facet.
   */
  function partition(edges: number[], opt: Opt): PartOut {
    const b = emptyBuckets();
    const memo = new Map<number, Base>();
    const cls = (f: number): Base => {
      let v = memo.get(f);
      if (v === undefined) { v = classifyBase(f, opt); memo.set(f, v); }
      return v;
    };
    // pass 1: local verdicts + partner bookkeeping for the locally-accurate facets
    const accPartnerAcc = new Set<number>();   // accurate facet with an accurate >45 partner => REAL_TURN
    const accPartnerFlag = new Set<number>();  // accurate facet with a flagged >45 partner
    const turnLB: number[] = [];
    for (const e of edges) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const c1 = cls(f1); const c2 = cls(f2);
      const a1 = c1.mech === 'PARTNER'; const a2 = c2.mech === 'PARTNER';
      if (a1 && a2) {
        accPartnerAcc.add(f1); accPartnerAcc.add(f2);
        // *** THE PROOF: normDeg is a SUP over the footprint, so the analytic normal field must turn by
        // at least (dihedral - nd1 - nd2) across this edge. A positive value is a WITNESSED real turn. ***
        turnLB.push(d.edgeAngRad[e] * DEG - c1.nd - c2.nd);
      } else {
        if (a1 && FLAGGED.includes(c2.mech)) accPartnerFlag.add(f1);
        if (a2 && FLAGGED.includes(c1.mech)) accPartnerFlag.add(f2);
      }
    }
    // pass 2: attribute each touched facet ONCE
    let totCnt = 0; let totArea = 0;
    for (const [f, c] of memo) {
      let m: Mech = c.mech;
      if (m === 'PARTNER') {
        if (accPartnerAcc.has(f)) m = 'REAL_TURN';
        else if (accPartnerFlag.has(f)) m = 'PARTNER';
        else m = 'PARTNER_UND';   // only CURTAIN partners => the ruler cannot decide
      }
      const bk = b[m];
      bk.cnt += 1; bk.area += d.areaMm2[f];
      if (Number.isFinite(c.nd) && c.nd > bk.maxNd) bk.maxNd = c.nd;
      if (Number.isFinite(c.sp) && c.sp > bk.maxSpread) bk.maxSpread = c.sp;
      if (dihDeg[f] > bk.maxDih) bk.maxDih = dihDeg[f];
      totCnt += 1; totArea += d.areaMm2[f];
    }
    return { b, totCnt, totArea, turnLB, edgesScored: edges.length };
  }
  const shareStr = (b: Record<Mech, Bucket>, totArea: number): string =>
    MECHS.map((m) => `${m.slice(0, 4)} ${((b[m].area / Math.max(1e-30, totArea)) * 100).toFixed(1)}%`).join(' ');
  const flaggedPct = (p: PartOut): number =>
    (FLAGGED.reduce((a, m) => a + p.b[m].area, 0) / Math.max(1e-30, p.totArea)) * 100;

  // ── STAGE 1c: *** THE EXHAUSTIVE LOCAL CENSUS — NO SAMPLING, NO rA, NO ESTIMATOR. *** ────────────
  // graphRatio and minAlt are pure arithmetic on the facet's own coordinates: no analytic evaluation,
  // no lattice, no h, no inset. So the CURTAIN and SLIVER buckets can be measured over EVERY facet of
  // the class exactly. This removes sampling error from the two largest buckets AND gives a direct
  // check on the edge-induced sample used in STAGE 3 (which over-represents facets carrying several
  // >45 edges — slivers do exactly that, so the bias, if any, INFLATES the sliver share).
  {
    log(`  ── STAGE 1c: *** EXHAUSTIVE LOCAL CENSUS over all ${classF.length} class facets (no sampling, no rA) *** ──`);
    let cCnt = 0; let cArea = 0; let sCnt = 0; let sArea = 0; let sMaxDih = -Infinity;
    const alts: number[] = [];
    for (const f of classF) {
      const gr = graphRatio(f);
      if (gr > CURTAIN_R) { cCnt += 1; cArea += d.areaMm2[f]; continue; }
      const alt = minAltMm(f);
      alts.push(alt * 1000);
      if (alt < SLIVER_UM / 1000) { sCnt += 1; sArea += d.areaMm2[f]; if (dihDeg[f] > sMaxDih) sMaxDih = dihDeg[f]; }
    }
    rec.exCurtainCnt = cCnt; rec.exCurtainCntPct = (cCnt / classF.length) * 100;
    rec.exCurtainAreaPct = (cArea / classArea) * 100;
    rec.exSliverCnt = sCnt; rec.exSliverCntPct = (sCnt / classF.length) * 100;
    rec.exSliverAreaPctClass = (sArea / classArea) * 100;
    rec.exSliverAreaPctMesh = (sArea / meshArea) * 100;
    rec.exSliverAreaMm2 = sArea; rec.exSliverMaxDih = Number.isFinite(sMaxDih) ? sMaxDih : null;
    rec.exAltP10Um = q(alts, 0.1); rec.exAltP50Um = q(alts, 0.5);
    log(`     CURTAIN (graphRatio>${CURTAIN_R})  COUNT ${cCnt} (${pc(cCnt, classF.length)}%)   AREA ${cArea.toFixed(4)} mm2 (${pc(cArea, classArea)}% of class)`);
    log(`     SLIVER  (minAlt<${SLIVER_UM}um)   COUNT ${sCnt} (${pc(sCnt, classF.length)}%)   AREA ${sArea.toFixed(5)} mm2 (${pc(sArea, classArea)}% of class = ${pc(sArea, meshArea)}% of MESH)   MAX dihedral ${Number.isFinite(sMaxDih) ? sMaxDih.toFixed(3) : '—'} deg`);
    log(`     min-altitude over the NON-curtain class: p10 ${q(alts, 0.1).toFixed(3)} um  p50 ${q(alts, 0.5).toFixed(3)} um   (S111's class read 5.94 um)`);
    // exhaustive A-ladder — again no rA, so it is exact
    const rows: Array<Record<string, number>> = [];
    let line = '     exhaustive SLIVER AREA% of class vs A: ';
    for (const A of A_LADDER_UM) {
      let a = 0; let c = 0;
      for (const f of classF) {
        if (graphRatio(f) > CURTAIN_R) continue;
        if (minAltMm(f) < A / 1000) { a += d.areaMm2[f]; c += 1; }
      }
      rows.push({ altUm: A, cnt: c, areaPctClass: (a / classArea) * 100, areaPctMesh: (a / meshArea) * 100 });
      line += `A=${A}um ${((a / classArea) * 100).toFixed(2)}%  `;
    }
    rec.exSliverALadder = rows;
    log(line);

    // ── *** THE ENRICHMENT CONTROL — and the RECONCILIATION with the aspect-ratio sliver definition. ***
    // TWO things are tested here and both are necessary.
    //  (a) RECONCILIATION. The sibling S115 mechanism tool (research/tools/s115Mechanism.ts, written in
    //      parallel with this one) defines a sliver SCALE-FREELY as aspect = longestEdge/minAlt >= 20.
    //      This file's bar is ABSOLUTE (minAlt < 20 um), following S111's own 5.94 um figure. They are
    //      different tests, so BOTH are reported and neither is quoted as the other.
    //  (b) *** ENRICHMENT. A bare share is not evidence that slivers SELECT the class. *** If slivers are
    //      just as common in the mesh at large, sliverness explains nothing. ENRICH = class share / mesh
    //      share; it must be >> 1 for the mechanism to be the selector. Exhaustive on both populations —
    //      this is pure arithmetic, so there is no estimator anywhere in it.
    const aspOf = (f2: number): number => {
      const a = minAltMm(f2);
      const ax = xyz[f2 * 9]; const ay = xyz[f2 * 9 + 1]; const az = xyz[f2 * 9 + 2];
      const bx = xyz[f2 * 9 + 3]; const by = xyz[f2 * 9 + 4]; const bz = xyz[f2 * 9 + 5];
      const cx = xyz[f2 * 9 + 6]; const cy = xyz[f2 * 9 + 7]; const cz = xyz[f2 * 9 + 8];
      const L = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz),
        Math.hypot(ax - bx, ay - by, az - bz));
      return a > 0 ? L / a : Infinity;
    };
    const census = (fs: Iterable<number>, n: number): {
      aspCnt: number; aspArea: number; altCnt: number; altArea: number; tot: number; totArea: number;
    } => {
      let aspCnt = 0; let aspArea = 0; let altCnt = 0; let altArea = 0; let tot = 0; let totArea = 0;
      for (const f2 of fs) {
        tot += 1; totArea += d.areaMm2[f2];
        if (aspOf(f2) >= 20) { aspCnt += 1; aspArea += d.areaMm2[f2]; }
        if (minAltMm(f2) < SLIVER_UM / 1000) { altCnt += 1; altArea += d.areaMm2[f2]; }
      }
      return { aspCnt, aspArea, altCnt, altArea, tot: n > 0 ? n : tot, totArea };
    };
    const cl = census(classF, classF.length);
    const allIdx = { *[Symbol.iterator](): Iterator<number> { for (let f2 = 0; f2 < nTri; f2 += 1) yield f2; } };
    const me = census(allIdx, nTri);
    const enrCntAsp = (cl.aspCnt / cl.tot) / Math.max(1e-30, me.aspCnt / me.tot);
    const enrAreaAsp = (cl.aspArea / cl.totArea) / Math.max(1e-30, me.aspArea / me.totArea);
    const enrCntAlt = (cl.altCnt / cl.tot) / Math.max(1e-30, me.altCnt / me.tot);
    const enrAreaAlt = (cl.altArea / cl.totArea) / Math.max(1e-30, me.altArea / me.totArea);
    rec.aspClassCntPct = (cl.aspCnt / cl.tot) * 100; rec.aspClassAreaPct = (cl.aspArea / cl.totArea) * 100;
    rec.aspMeshCntPct = (me.aspCnt / me.tot) * 100; rec.aspMeshAreaPct = (me.aspArea / me.totArea) * 100;
    rec.altMeshCntPct = (me.altCnt / me.tot) * 100; rec.altMeshAreaPct = (me.altArea / me.totArea) * 100;
    rec.enrichCntAspect = enrCntAsp; rec.enrichAreaAspect = enrAreaAsp;
    rec.enrichCntAlt = enrCntAlt; rec.enrichAreaAlt = enrAreaAlt;
    log(`     ASPECT>=20 sliver (the sibling tool's scale-free definition, EXHAUSTIVE both populations):`);
    log(`        class  COUNT ${cl.aspCnt} (${pc(cl.aspCnt, cl.tot)}%)   AREA ${pc(cl.aspArea, cl.totArea)}% of class`);
    log(`        MESH   COUNT ${me.aspCnt} (${pc(me.aspCnt, me.tot)}%)   AREA ${pc(me.aspArea, me.totArea)}% of mesh`);
    log(`        *** ENRICHMENT class/mesh:  by COUNT x${enrCntAsp.toFixed(2)}   by AREA x${enrAreaAsp.toFixed(2)}   (x1 = sliverness does NOT select the class) ***`);
    log(`     minAlt<${SLIVER_UM}um sliver (THIS file's absolute definition):`);
    log(`        MESH   COUNT ${me.altCnt} (${pc(me.altCnt, me.tot)}%)   AREA ${pc(me.altArea, me.totArea)}% of mesh`);
    log(`        *** ENRICHMENT class/mesh:  by COUNT x${enrCntAlt.toFixed(2)}   by AREA x${enrAreaAlt.toFixed(2)} ***`);
  }

  // ── STAGE 2: *** SCAR 3 — THE h LADDER *** (the newest and largest instrument scar) ──────────────
  const ladE = goldenPick(hiEdges, NLAD);
  const ladF = (() => { const s = new Set<number>(); for (const e of ladE) { s.add(d.edgeF1[e]); s.add(d.edgeF2[e]); } return Array.from(s); })();
  {
    log(`  ── STAGE 2: *** h LADDER *** on ${ladE.length} class edges / ${ladF.length} facets (k=${K_CANON}, inset=${INSET_CANON}) ──`);
    log('     h        normDeg p50    p90       MAX     | spreadDeg p50   p90      MAX   | PARTITION AREA SHARES');
    const rows: Array<Record<string, unknown>> = [];
    for (const hh of H_LADDER) {
      const nds: number[] = []; const sps: number[] = [];
      for (const f of ladF) { const o = orientOf(f, INSET_CANON, K_CANON, hh); nds.push(o.nd); sps.push(o.sp); }
      const p = partition(ladE, { R: CURTAIN_R, altMm: SLIVER_UM / 1000, bar: BAR_DEG, inset: INSET_CANON, k: K_CANON, h: hh });
      rows.push({
        h: hh, ndP50: q(nds, 0.5), ndP90: q(nds, 0.9), ndMax: mx(nds),
        spP50: q(sps, 0.5), spP90: q(sps, 0.9), spMax: mx(sps),
        shares: Object.fromEntries(MECHS.map((m) => [m, (p.b[m].area / Math.max(1e-30, p.totArea)) * 100])),
      });
      log(`     ${hh.toExponential(0).padStart(7)}  ${q(nds, 0.5).toFixed(4).padStart(9)} ${q(nds, 0.9).toFixed(3).padStart(9)} ${mx(nds).toFixed(3).padStart(9)} | ${q(sps, 0.5).toFixed(4).padStart(9)} ${q(sps, 0.9).toFixed(3).padStart(9)} ${mx(sps).toFixed(3).padStart(8)} | ${shareStr(p.b, p.totArea)}`);
    }
    rec.hLadder = rows;
    // h-STABILITY VERDICT: how much does the canonical h's normDeg p50 and the dominant share move?
    const ndP50s = rows.map((r) => r.ndP50 as number).filter(Number.isFinite);
    const spread = mx(ndP50s) / Math.max(1e-12, Math.min(...ndP50s));
    rec.hStabilityNdP50Ratio = spread;
    // dominant-mechanism agreement across h
    const doms = rows.map((r) => {
      const s = r.shares as Record<string, number>;
      return MECHS.reduce((a, m) => (s[m] > s[a] ? m : a), MECHS[0] as string);
    });
    rec.hLadderDominants = doms;
    const hStable = new Set(doms).size === 1;
    rec.hStableDominant = hStable;
    log(`     *** h-STABILITY: normDeg p50 moves x${spread.toFixed(2)} across ${H_LADDER[0].toExponential(0)}..${H_LADDER[H_LADDER.length - 1].toExponential(0)};  dominant mechanism ${hStable ? 'IDENTICAL at every h' : `MOVES: ${doms.join(' -> ')}`} ***`);
  }

  // ── STAGE 2b: *** SCAR 2 — the k LADDER, WITH the partition shares *** ───────────────────────────
  {
    log(`  ── STAGE 2b: *** k LADDER *** (spreadRad is a CLASSIFICATION INPUT and is KNOWN not to converge in k) ──`);
    log('     k     normDeg p50    p90       MAX     | spreadDeg p50   p90      MAX   | PARTITION AREA SHARES');
    const rows: Array<Record<string, unknown>> = [];
    for (const kk of K_LADDER) {
      const nds: number[] = []; const sps: number[] = [];
      for (const f of ladF) { const o = orientOf(f, INSET_CANON, kk, H_CANON); nds.push(o.nd); sps.push(o.sp); }
      const p = partition(ladE, { R: CURTAIN_R, altMm: SLIVER_UM / 1000, bar: BAR_DEG, inset: INSET_CANON, k: kk, h: H_CANON });
      rows.push({
        k: kk, ndP50: q(nds, 0.5), ndP90: q(nds, 0.9), ndMax: mx(nds),
        spP50: q(sps, 0.5), spP90: q(sps, 0.9), spMax: mx(sps),
        shares: Object.fromEntries(MECHS.map((m) => [m, (p.b[m].area / Math.max(1e-30, p.totArea)) * 100])),
      });
      log(`     ${String(kk).padStart(3)}  ${q(nds, 0.5).toFixed(4).padStart(9)} ${q(nds, 0.9).toFixed(3).padStart(9)} ${mx(nds).toFixed(3).padStart(9)} | ${q(sps, 0.5).toFixed(4).padStart(9)} ${q(sps, 0.9).toFixed(3).padStart(9)} ${mx(sps).toFixed(3).padStart(8)} | ${shareStr(p.b, p.totArea)}`);
    }
    rec.kLadder = rows;
    const doms = rows.map((r) => {
      const s = r.shares as Record<string, number>;
      return MECHS.reduce((a, m) => (s[m] > s[a] ? m : a), MECHS[0] as string);
    });
    rec.kLadderDominants = doms;
    rec.kStableDominant = new Set(doms).size === 1;
    log(`     *** k-STABILITY: dominant mechanism ${(rec.kStableDominant as boolean) ? 'IDENTICAL at every k' : `MOVES: ${doms.join(' -> ')}`} ***`);
  }

  // ── STAGE 2c: *** SCAR 1 — the inset LADDER *** ─────────────────────────────────────────────────
  {
    log(`  ── STAGE 2c: *** inset LADDER *** (default 0 is NOT the honest value; normDeg moves 64x on crease classes) ──`);
    const rows: Array<Record<string, unknown>> = [];
    for (const ins of INSET_LADDER) {
      const nds: number[] = []; const sps: number[] = [];
      for (const f of ladF) { const o = orientOf(f, ins, K_CANON, H_CANON); nds.push(o.nd); sps.push(o.sp); }
      const p = partition(ladE, { R: CURTAIN_R, altMm: SLIVER_UM / 1000, bar: BAR_DEG, inset: ins, k: K_CANON, h: H_CANON });
      rows.push({
        inset: ins, ndP50: q(nds, 0.5), ndP90: q(nds, 0.9), ndMax: mx(nds),
        spP50: q(sps, 0.5), spMax: mx(sps),
        shares: Object.fromEntries(MECHS.map((m) => [m, (p.b[m].area / Math.max(1e-30, p.totArea)) * 100])),
      });
      log(`     inset ${ins.toFixed(2)}  normDeg p50 ${q(nds, 0.5).toFixed(4).padStart(9)} p90 ${q(nds, 0.9).toFixed(3).padStart(9)} MAX ${mx(nds).toFixed(3).padStart(9)} | spread p50 ${q(sps, 0.5).toFixed(4).padStart(9)} | ${shareStr(p.b, p.totArea)}`);
    }
    rec.insetLadder = rows;
  }

  // ── STAGE 3: THE MAIN PARTITION at the canonical setting ────────────────────────────────────────
  const sampE = goldenPick(hiEdges, NCLASS);
  const sampF = (() => { const s = new Set<number>(); for (const e of sampE) { s.add(d.edgeF1[e]); s.add(d.edgeF2[e]); } return Array.from(s); })();
  let sampArea = 0;
  for (const f of sampF) sampArea += d.areaMm2[f];
  const areaScale = classArea / Math.max(1e-30, sampArea);
  {
    log(`  ── STAGE 3: *** THE MECHANISM PARTITION *** on ${sampE.length} of ${hiEdges.length} class edges (${pc(sampE.length, hiEdges.length)}%) => ${sampF.length} of ${classF.length} class facets, sampled AREA ${sampArea.toFixed(4)} mm2, scale-up x${areaScale.toFixed(3)}   ${el()} ──`);
    const p = partition(sampE, { R: CURTAIN_R, altMm: SLIVER_UM / 1000, bar: BAR_DEG, inset: INSET_CANON, k: K_CANON, h: H_CANON });
    log('     mechanism    COUNT   cnt%    AREA(samp) mm2   AREA% of class   AREA(est) mm2   % of MESH   MAX normDeg   MAX spread   MAX dihedral');
    const out: Record<string, unknown> = {};
    for (const m of MECHS) {
      const b = p.b[m];
      const estArea = b.area * areaScale;
      out[m] = {
        cnt: b.cnt, cntPct: (b.cnt / p.totCnt) * 100, areaSampMm2: b.area,
        areaPctClass: (b.area / p.totArea) * 100, areaEstMm2: estArea, areaPctMesh: (estArea / meshArea) * 100,
        maxNd: Number.isFinite(b.maxNd) ? b.maxNd : null,
        maxSpread: Number.isFinite(b.maxSpread) ? b.maxSpread : null,
        maxDih: Number.isFinite(b.maxDih) ? b.maxDih : null,
      };
      log(`     ${m.padEnd(11)} ${String(b.cnt).padStart(6)}  ${((b.cnt / p.totCnt) * 100).toFixed(2).padStart(6)}  ${b.area.toFixed(5).padStart(14)}   ${((b.area / p.totArea) * 100).toFixed(3).padStart(13)}   ${estArea.toFixed(4).padStart(13)}   ${((estArea / meshArea) * 100).toFixed(5).padStart(9)}   ${(Number.isFinite(b.maxNd) ? b.maxNd.toFixed(2) : '—').padStart(11)}   ${(Number.isFinite(b.maxSpread) ? b.maxSpread.toFixed(2) : '—').padStart(10)}   ${(Number.isFinite(b.maxDih) ? b.maxDih.toFixed(3) : '—').padStart(12)}`);
    }
    rec.partition = out;
    rec.partSampN = sampF.length; rec.partSampArea = sampArea; rec.areaScale = areaScale;
    // dominant by AREA, and by AREA EXCLUDING curtain (the instrument limit)
    const domAll = MECHS.reduce((a, m) => (p.b[m].area > p.b[a].area ? m : a), MECHS[0]);
    const scoped = MECHS.filter((m) => m !== 'CURTAIN');
    const scopedArea = scoped.reduce((a, m) => a + p.b[m].area, 0);
    const domScoped = scoped.reduce((a, m) => (p.b[m].area > p.b[a].area ? m : a), scoped[0]);
    rec.dominantAll = domAll; rec.dominantScoped = domScoped;
    rec.scopedAreaPctOfClass = (scopedArea / p.totArea) * 100;
    rec.dominantScopedSharePct = scopedArea > 0 ? (p.b[domScoped].area / scopedArea) * 100 : 0;
    log(`     *** DOMINANT (all buckets, by AREA): ${domAll} ***`);
    log(`     *** DOMINANT excluding CURTAIN (the instrument limit): ${domScoped} at ${(rec.dominantScopedSharePct as number).toFixed(2)}% of the RULER-DEFINED ${(rec.scopedAreaPctOfClass as number).toFixed(2)}% of the class ***`);

    // *** THE OPERATOR TARGET: the facets whose defect is IN them (not innocent partners). ***
    const flCnt = FLAGGED.reduce((a, m) => a + p.b[m].cnt, 0);
    const flArea = FLAGGED.reduce((a, m) => a + p.b[m].area, 0);
    const flMaxDih = FLAGGED.reduce((a, m) => Math.max(a, p.b[m].maxDih), -Infinity);
    const domFl = FLAGGED.reduce((a, m) => (p.b[m].area > p.b[a].area ? m : a), FLAGGED[0]);
    const domFlCnt = FLAGGED.reduce((a, m) => (p.b[m].cnt > p.b[a].cnt ? m : a), FLAGGED[0]);
    rec.flaggedCnt = flCnt; rec.flaggedCntPct = (flCnt / p.totCnt) * 100;
    rec.flaggedAreaPctClass = (flArea / p.totArea) * 100;
    rec.flaggedAreaEstMm2 = flArea * areaScale;
    rec.flaggedAreaPctMesh = ((flArea * areaScale) / meshArea) * 100;
    rec.dominantFlaggedByArea = domFl; rec.dominantFlaggedByCount = domFlCnt;
    rec.dominantFlaggedAreaShareOfFlagged = flArea > 0 ? (p.b[domFl].area / flArea) * 100 : 0;
    rec.dominantFlaggedCntShareOfFlagged = flCnt > 0 ? (p.b[domFlCnt].cnt / flCnt) * 100 : 0;
    log(`     *** OPERATOR TARGET (SLIVER+STRADDLE+UNDER_RES+MIS_ORIENT — the defect is IN the facet): ***`);
    log(`         COUNT ${flCnt} (${((flCnt / p.totCnt) * 100).toFixed(3)}% of class)   AREA ${(flArea * areaScale).toFixed(5)} mm2 = ${((flArea / p.totArea) * 100).toFixed(3)}% of class = ${(((flArea * areaScale) / meshArea) * 100).toFixed(6)}% of MESH   MAX dihedral ${Number.isFinite(flMaxDih) ? flMaxDih.toFixed(3) : '—'} deg`);
    log(`         dominant mechanism  BY AREA ${domFl} (${(rec.dominantFlaggedAreaShareOfFlagged as number).toFixed(2)}% of the target)  |  BY COUNT ${domFlCnt} (${(rec.dominantFlaggedCntShareOfFlagged as number).toFixed(2)}% of the target)`);

    // REAL_TURN's rigorous lower bound on the analytic turn. NOTE: on a >45 edge with both normDeg <= S
    // the bound is >= 45 - 2S = 25 deg BY CONSTRUCTION, so its POSITIVITY is not a test — its MAGNITUDE
    // is the measurement, and the bucket's SIZE is the result.
    if (p.turnLB.length > 0) {
      rec.realTurnEdges = p.turnLB.length;
      rec.realTurnLBp50 = q(p.turnLB, 0.5); rec.realTurnLBp90 = q(p.turnLB, 0.9); rec.realTurnLBMax = mx(p.turnLB);
      log(`     REAL_TURN witness (dihedral - nd1 - nd2 = a RIGOROUS lower bound on the analytic turn across the shared edge;`);
      log(`         positivity is guaranteed by the bars, the MAGNITUDE is the measurement): ${p.turnLB.length} edges  p50 ${q(p.turnLB, 0.5).toFixed(3)}  p90 ${q(p.turnLB, 0.9).toFixed(3)}  MAX ${mx(p.turnLB).toFixed(3)} deg`);
    } else { rec.realTurnEdges = 0; }

    // *** THE THREE-WAY ROLLUP — the decisive summary. Every mm2 of the class is attributed to exactly
    // one of: a facet-local DEFECT (the flagged facet plus the innocent partner it drags in), a REAL
    // analytic TURN, or UNDECIDABLE (the ruler was not defined on at least one side). ***
    const defectSide = FLAGGED.reduce((a, m) => a + p.b[m].area, 0) + p.b.PARTNER.area;
    const realSide = p.b.REAL_TURN.area;
    const undec = p.b.CURTAIN.area + p.b.PARTNER_UND.area;
    rec.rollupDefectPct = (defectSide / p.totArea) * 100;
    rec.rollupRealTurnPct = (realSide / p.totArea) * 100;
    rec.rollupUndecidablePct = (undec / p.totArea) * 100;
    log(`     *** THREE-WAY ROLLUP of the class AREA:  FACET-LOCAL DEFECT (flagged + its innocent partners) ${((defectSide / p.totArea) * 100).toFixed(2)}%  |  REAL ANALYTIC TURN ${((realSide / p.totArea) * 100).toFixed(2)}%  |  UNDECIDABLE (curtain) ${((undec / p.totArea) * 100).toFixed(2)}% ***`);
  }

  // ── STAGE 4: THRESHOLD LADDERS (scar 4) ─────────────────────────────────────────────────────────
  {
    log(`  ── STAGE 4a: LADDER on the CURTAIN cut R (KNOWN unconverged on CelticTriquetra) ──`);
    const rows: Array<Record<string, unknown>> = [];
    for (const R of R_LADDER) {
      const p = partition(ladE, { R, altMm: SLIVER_UM / 1000, bar: BAR_DEG, inset: INSET_CANON, k: K_CANON, h: H_CANON });
      rows.push({ R, shares: Object.fromEntries(MECHS.map((m) => [m, (p.b[m].area / Math.max(1e-30, p.totArea)) * 100])) });
      log(`     R=${String(R).padStart(3)}   ${shareStr(p.b, p.totArea)}`);
    }
    rec.rLadder = rows;
    log(`  ── STAGE 4b: LADDER on the SLIVER altitude A ──`);
    const rowsA: Array<Record<string, unknown>> = [];
    for (const A of A_LADDER_UM) {
      const p = partition(ladE, { R: CURTAIN_R, altMm: A / 1000, bar: BAR_DEG, inset: INSET_CANON, k: K_CANON, h: H_CANON });
      rowsA.push({ altUm: A, shares: Object.fromEntries(MECHS.map((m) => [m, (p.b[m].area / Math.max(1e-30, p.totArea)) * 100])) });
      log(`     A=${String(A).padStart(3)}um   ${shareStr(p.b, p.totArea)}`);
    }
    rec.aLadder = rowsA;
    log(`  ── STAGE 4c: LADDER on the spread/normDeg BAR S ──`);
    const rowsB: Array<Record<string, unknown>> = [];
    for (const S of [2, 5, 10, 20, 45]) {
      const p = partition(ladE, { R: CURTAIN_R, altMm: SLIVER_UM / 1000, bar: S, inset: INSET_CANON, k: K_CANON, h: H_CANON });
      rowsB.push({ bar: S, shares: Object.fromEntries(MECHS.map((m) => [m, (p.b[m].area / Math.max(1e-30, p.totArea)) * 100])) });
      log(`     S=${String(S).padStart(3)}deg  ${shareStr(p.b, p.totArea)}`);
    }
    rec.sLadder = rowsB;
  }

  // ── STAGE 5: C2 PLACEBO (cost-matched) + C3 FLOOR ───────────────────────────────────────────────
  {
    // COST-MATCHED and CODE-IDENTICAL: the same `partition()` on EDGES whose BOTH facets are provably
    // smooth (per-facet max dihedral < 2 deg). Same sample size, same classifier, same thresholds.
    const smoothE: number[] = [];
    for (let e = 0; e < d.edgeAngRad.length && smoothE.length < 8 * NPLACEBO; e += 1) {
      if (dihDeg[d.edgeF1[e]] < 2 && dihDeg[d.edgeF2[e]] < 2) smoothE.push(e);
    }
    const plE = goldenPick(smoothE, NPLACEBO);
    log(`  ── STAGE 5: *** C2 PLACEBO (cost-matched, code-identical) *** — the SAME partition on ${plE.length} edges whose BOTH facets have max dihedral < 2 deg ──`);
    if (plE.length < 50) {
      log(`     only ${plE.length} provably-smooth edges on this mesh — the placebo is UNTESTABLE here.`);
      rec.placebo = null; rec.placeboDefectPct = null;
    } else {
      const p = partition(plE, { R: CURTAIN_R, altMm: SLIVER_UM / 1000, bar: BAR_DEG, inset: INSET_CANON, k: K_CANON, h: H_CANON });
      const defectPct = flaggedPct(p);
      rec.placebo = Object.fromEntries(MECHS.map((m) => [m, (p.b[m].area / Math.max(1e-30, p.totArea)) * 100]));
      rec.placeboDefectPct = defectPct;
      rec.placeboN = p.totCnt;
      log(`     ${shareStr(p.b, p.totArea)}`);
      log(`     *** PLACEBO defect-labelled AREA = ${defectPct.toFixed(3)}%  ${defectPct > 5 ? '*** > 5% => THE STYLE IS VOID ***' : '(<= 5%, control HELD)'} ***`);
      rec.placeboFired = defectPct > 5;
    }
    // C3 FLOOR (the other side of the bar). Two things must be non-degenerate:
    //   (a) the class must not be ~entirely CURTAIN (else the ruler never spoke), and
    //   (b) the class must not be ~entirely REAL_TURN+PARTNER (else there is no defect to attribute).
    const part = rec.partition as Record<string, { areaPctClass: number }> | undefined;
    if (part !== undefined) {
      const ruled = 100 - part.CURTAIN.areaPctClass;
      const flag = rec.flaggedAreaPctClass as number;
      rec.floorRuledPct = ruled; rec.floorFlaggedPct = flag;
      log(`     *** C3 FLOOR: ${ruled.toFixed(2)}% of class AREA is RULER-DEFINED (non-curtain); ${flag.toFixed(3)}% is LOCALLY FLAGGED. ***`);
      if (ruled < 10) log(`         (< 10% ruler-defined => this style's verdict is CARRIED BY THE CURTAIN and is NOT a mechanism result.)`);
      if (flag < 1) log(`         (< 1% locally flagged => the class on this style is NOT a facet-local defect at all.)`);
    }
  }

  // ── STAGE 6: C5 THE INVERTED CENSUS (normDeg > 90) ──────────────────────────────────────────────
  {
    log(`  ── STAGE 6: *** THE INVERTED CENSUS (normDeg > 90 deg) *** — CelticTriquetra reads 2.994% by AREA vs Gothic 0.006-0.013% ──`);
    const idx = goldenSample(nTri, NINV);
    let cnt = 0; let area = 0; let tot = 0; let totA = 0;
    const margins: number[] = []; const nds: number[] = [];
    for (let i = 0; i < idx.length; i += 1) {
      const f = idx[i];
      const o = orientOf(f, INSET_CANON, K_CANON, H_CANON);
      if (!Number.isFinite(o.nd)) continue;
      tot += 1; totA += d.areaMm2[f]; nds.push(o.nd);
      // signMargin is 1 BY CONSTRUCTION in 'winding' mode (no sign decision is taken), so it is
      // re-measured in 'outward' mode on the inverted facets ONLY — that is where it means something:
      // how DECISIVE the inversion is, vs a near-horizontal facet whose sign is a coin toss (S98).
      if (o.nd > 90) { cnt += 1; area += d.areaMm2[f]; margins.push(outwardMargin(f)); }
      if ((i + 1) % 5000 === 0) log(`     inverted sample ${i + 1}/${idx.length}   ${el()}`);
    }
    rec.invWholeN = tot; rec.invWholeCnt = cnt;
    rec.invWholeCntPct = (cnt / Math.max(1, tot)) * 100;
    rec.invWholeAreaPct = (area / Math.max(1e-30, totA)) * 100;
    rec.invWholeMarginP50 = margins.length > 0 ? q(margins, 0.5) : null;
    rec.ndWholeP50 = q(nds, 0.5); rec.ndWholeP90 = q(nds, 0.9); rec.ndWholeP99 = q(nds, 0.99); rec.ndWholeMax = mx(nds);
    log(`     WHOLE MESH (golden-stride n=${tot}, ${pc(tot, nTri)}% of facets):  normDeg p50 ${q(nds, 0.5).toFixed(4)} p90 ${q(nds, 0.9).toFixed(3)} p99 ${q(nds, 0.99).toFixed(3)} MAX ${mx(nds).toFixed(3)}`);
    log(`        INVERTED  COUNT ${cnt} (${((cnt / Math.max(1, tot)) * 100).toFixed(4)}%)   *** AREA ${((area / Math.max(1e-30, totA)) * 100).toFixed(4)}% ***   signMargin p50 ${margins.length > 0 ? q(margins, 0.5).toFixed(4) : 'n/a'}`);
    // and on the class itself
    let ccnt = 0; let carea = 0; let ctot = 0; let ctotA = 0; const cmar: number[] = [];
    for (const f of sampF) {
      const o = orientOf(f, INSET_CANON, K_CANON, H_CANON);
      if (!Number.isFinite(o.nd)) continue;
      ctot += 1; ctotA += d.areaMm2[f];
      if (o.nd > 90) { ccnt += 1; carea += d.areaMm2[f]; cmar.push(outwardMargin(f)); }
    }
    rec.invClassCntPct = (ccnt / Math.max(1, ctot)) * 100;
    rec.invClassAreaPct = (carea / Math.max(1e-30, ctotA)) * 100;
    log(`     >${HI_DEG} CLASS (n=${ctot}):  INVERTED COUNT ${ccnt} (${((ccnt / Math.max(1, ctot)) * 100).toFixed(4)}%)   AREA ${((carea / Math.max(1e-30, ctotA)) * 100).toFixed(4)}% of the class   signMargin p50 ${cmar.length > 0 ? q(cmar, 0.5).toFixed(4) : 'n/a'}`);
  }

  results.push(rec);
  writeFileSync(NDJSON, `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
  log(`  [style done ${el()}]`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('  S115 PER-STYLE TABLE — *** NEVER AVERAGED ACROSS STYLES. STYLES DIFFER IN KIND. ***');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('── TABLE 1: THE PARTITION, by AREA share of the >45 class ──');
log('style             facets   PRE um  class AREA%   CURT%   SLIV%   STRD%   UNDR%   MISO%   REAL%   PART%   PUND%');
for (const r of results) {
  if (r.refused === true) { log(`${(r.style as string).padEnd(17)} REFUSED (PRECOND ${(r.precondMaxUm as number).toFixed(1)} um)`); continue; }
  if (r.verdict === 'NO-VISIBLE-CLASS') { log(`${(r.style as string).padEnd(17)} ${String(r.facets).padStart(8)}  ${(r.precondMaxUm as number).toFixed(4).padStart(6)}  NO VISIBLE CLASS`); continue; }
  const p = r.partition as Record<string, { areaPctClass: number }>;
  const g = (m: string): string => (p[m].areaPctClass).toFixed(2).padStart(7);
  log(`${(r.style as string).padEnd(17)} ${String(r.facets).padStart(8)}  ${(r.precondMaxUm as number).toFixed(4).padStart(6)}  ${(r.classAreaPctMesh as number).toFixed(4).padStart(11)}  ${g('CURTAIN')} ${g('SLIVER')} ${g('STRADDLE')} ${g('UNDER_RES')} ${g('MIS_ORIENT')} ${g('REAL_TURN')} ${g('PARTNER')} ${g('PARTNER_UND')}`);
}
log('');
log('');
log('── TABLE 1b: THE THREE-WAY ROLLUP of the class AREA ──');
log('style             FACET-LOCAL DEFECT%   REAL ANALYTIC TURN%   UNDECIDABLE(curtain)%');
for (const r of results) {
  if (r.refused === true || r.verdict === 'NO-VISIBLE-CLASS') continue;
  log(`${(r.style as string).padEnd(17)} ${(r.rollupDefectPct as number).toFixed(2).padStart(19)}   ${(r.rollupRealTurnPct as number).toFixed(2).padStart(19)}   ${(r.rollupUndecidablePct as number).toFixed(2).padStart(21)}`);
}
log('');
log('── TABLE 2: THE OPERATOR TARGET + the controls ──');
log('style             TARGET cnt  cnt% class  TARGET AREA% class  TARGET AREA% MESH   dominant BY AREA    dominant BY COUNT   h-stable  k-stable  placebo%  INVERTED area%');
for (const r of results) {
  if (r.refused === true || r.verdict === 'NO-VISIBLE-CLASS') continue;
  log(`${(r.style as string).padEnd(17)} ${String(r.flaggedCnt).padStart(10)}  ${(r.flaggedCntPct as number).toFixed(3).padStart(10)}  ${(r.flaggedAreaPctClass as number).toFixed(3).padStart(18)}  ${(r.flaggedAreaPctMesh as number).toFixed(6).padStart(17)}   ${(r.dominantFlaggedByArea as string).padEnd(18)}  ${(r.dominantFlaggedByCount as string).padEnd(18)}  ${String(r.hStableDominant).padEnd(8)}  ${String(r.kStableDominant).padEnd(8)}  ${(r.placeboDefectPct === undefined || r.placeboDefectPct === null ? 'n/a' : (r.placeboDefectPct as number).toFixed(2)).padStart(8)}  ${(r.invWholeAreaPct as number).toFixed(4).padStart(14)}`);
}
writeFileSync(`${OUTDIR}/S115_CROSS_${TAG}.json`, JSON.stringify(results, null, 2));
log('');
log(`wrote ${OUTDIR}/S115_CROSS_${TAG}.json  and  ${NDJSON}`);
log(`done ${el()}`);
