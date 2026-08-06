// s114SweepD.ts — THE ALL-STYLES SWEEP ON THE HONEST RULER, QUARTER D (4th quarter alphabetically).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. Every STRATA number to date is GothicArches. S113's headline — "99.40% of the straddling crease
// class's AREA sits where the ANALYTIC surface itself turns >= 45 deg, so the >45 deg dihedral test is
// not a defect detector on this surface" — is a claim about ONE style. This tool asks whether it
// generalises, on MY quarter of the roster:
//
//     SpiralRidges, SuperellipseMorph, SuperformulaBlossom, Voronoi, WaveInterference
//
// (20 registry styles sorted alphabetically; positions 16-20.)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MEASUREMENT DISCIPLINE, ENFORCED IN CODE
//   * PRECOND FIRST. max |r_mesh - rA| over a stride sample at STYLE_REGISTRY defaults, H120/Rb40/Rt50.
//     > 50 um  =>  THE STYLE IS REFUSED and no analytic number is printed for it. A refusal is a RESULT.
//   * NEVER a bare count, never a bare max. Every population carries COUNT + AREA-share + MAX.
//   * `inset` IS A MEASUREMENT CHOICE. orientOfFacet's default is 0; the honest value on crease classes
//     is 0.05. Both are passed EXPLICITLY, both are printed, and a 4-point inset sweep is printed too.
//   * `k` IS A MEASUREMENT CHOICE. k=8 is the campaign's value; a 4/8/16/32 ladder is printed so a
//     reader can see whether the quantity is converged AT k=8 rather than assume it.
//   * FOOTPRINT PROBES, NOT ENDPOINTS. The across-crease turn is taken over an order-12 barycentric
//     lattice on BOTH facets of a pair, from the closest cross-flank sample pairs in parameter space.
//   * TWO-SIDED CONTROLS, printed as gates:
//       CTL-1 PRECOND (above).
//       CTL-2 SMOOTH CONTROL — facets whose own max dihedral is < 5 deg must NOT be crease-labelled by
//             the flank decomposition. > 5% labelled  =>  THE STYLE'S ORACLE NUMBER IS VOID.
//       CTL-3 GOTHIC CALIBRATION — running the identical pipeline on the Gothic reference must land near
//             S113's published 99.40%. Run it with PF_S114D_STEMS=GothicArches:<path>.
//   * SAMPLING IS DECLARED. Whole-mesh where affordable; golden-stride samples otherwise, with the
//     sample size, the sampled fraction, and "MAX over the SAMPLE is a LOWER bound" printed every time.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FUNNEL (S112's, reproduced exactly — see s113StraddleDump.ts)
//   dihedral > 45 deg                                  S108's visible class
//   -> CURTAIN     graphRatio > 8 on either facet      the analytic ruler is not defined there
//   -> CONFORMED   drop = normDeg(0.05)/normDeg(0) < 0.25, or normDeg(0.05) <= 10 deg
//   -> STRADDLES   everything else
//   and then, on the STRADDLING class only, the ORACLE: what share of its area sits where the ANALYTIC
//   across-crease turn is itself >= 45 deg (= IRREDUCIBLE: any correct mesh shows that dihedral).
//
// Usage: bash research/tools/run-s114-sweepd.sh
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
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
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');

const DEG = 180 / Math.PI;
const OUTDIR = 'research/exchange/_strataConformBisect/s114sweep';
const TAG = process.env.PF_S114D_TAG ?? 'D';
const EXDIR = process.env.PF_S114D_EXDIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';

// ── the roster, quarter D. stem = the mesh prior sweeps (s91StyleCensus DEFAULT_STEMS) used. ──
const DEFAULT_STEMS = [
  'SpiralRidges:spiralridges_ring_D--',
  'SuperellipseMorph:superellipsemorph_ring_D--',
  'SuperformulaBlossom:superformulablossom_ring_D--',
  'Voronoi:voronoi_ring_D--',
  'WaveInterference:waveinterference_ring_D--',
].join(',');
const STEMS = (process.env.PF_S114D_STEMS ?? DEFAULT_STEMS).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

const DIMS: StyleDims = { H: envF('PF_S114D_H', 120), Rb: envF('PF_S114D_RB', 40), Rt: envF('PF_S114D_RT', 50), expn: 1 };
const H = DIMS.H;
const PRECOND_UM = envF('PF_S114D_PRECOND_UM', 50);      // REFUSAL threshold
const HI_DEG = envF('PF_S114D_HI_DEG', 45);              // S108's visible cut
const CURTAIN_RATIO = envF('PF_S114D_CURTAIN', 8);       // S112's wall/curtain cut
const DROP_CUT = envF('PF_S114D_DROP', 0.25);            // S112's conformed/straddling cut
const NORMHI_MIN = envF('PF_S114D_NORMHI', 10);          // S112's straddling floor, deg
const K = Math.round(envF('PF_S114D_K', 8));             // campaign lattice order for normDeg
const INSET_LO = envF('PF_S114D_INSET_LO', 0);
const INSET_HI = envF('PF_S114D_INSET_HI', 0.05);
const NSAMP = Math.round(envF('PF_S114D_N', 30000));     // whole-mesh normDeg sample
const NEDGE = Math.round(envF('PF_S114D_NEDGE', 40000)); // >45 class scoping sample (edges); EXHAUSTIVE when the class is smaller
const NORACLE = Math.round(envF('PF_S114D_NORACLE', 900)); // oracle sample (straddling pairs)
const NLADDER = Math.round(envF('PF_S114D_NLADDER', 250)); // k/inset ladder subsample
const NCTL = Math.round(envF('PF_S114D_NCTL', 600));     // smooth control size
const K_LAT = Math.round(envF('PF_S114D_KLAT', 12));     // oracle flank-decomposition lattice
const SEP_MIN = envF('PF_S114D_SEPMIN', 15);             // deg: a flank split must beat this to be a crease
const VIS_DEG = envF('PF_S114D_VIS', 45);                // the visibility cut the oracle is scored against
const NCROSS = Math.round(envF('PF_S114D_NCROSS', 8));   // closest cross-flank pairs for the crease turn
const RESUME = envB('PF_S114D_RESUME', true);

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
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');

/** GOLDEN-STRIDE index sample of `n` from [0,N). Deterministic, spread over the whole mesh, no RNG. */
function goldenSample(N: number, n: number): Int32Array {
  if (n >= N) { const all = new Int32Array(N); for (let i = 0; i < N; i += 1) all[i] = i; return all; }
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let g = Math.max(1, Math.round(N * 0.6180339887498949));
  while (gcd(g, N) !== 1) g += 1;
  const out = new Int32Array(n);
  let cur = 0;
  for (let i = 0; i < n; i += 1) { out[i] = cur; cur = (cur + g) % N; }
  return out;
}
/** Same, over an explicit index list. */
function goldenPick<T>(arr: T[], n: number): T[] {
  const s = goldenSample(arr.length, n);
  const out: T[] = [];
  for (let i = 0; i < s.length; i += 1) out.push(arr[s[i]]);
  return out;
}

const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
  let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
  dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
  return Math.acos(dp);
};

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('===== S114-D — ALL-STYLES SWEEP ON THE HONEST RULER, QUARTER D =====');
log(`roster: ${STEMS.map((s) => s.split(':')[0]).join(', ')}`);
log(`dims H${DIMS.H} Rb${DIMS.Rb} Rt${DIMS.Rt} expn${DIMS.expn}   PRECOND refusal > ${PRECOND_UM} um`);
log(`funnel: dihedral>${HI_DEG}deg  ->  curtain graphRatio>${CURTAIN_RATIO}  ->  conformed drop<${DROP_CUT} or normHi<=${NORMHI_MIN}  ->  STRADDLE`);
log(`normDeg: orientOfFacet k=${K}, kink-aware fdNormals, orient='winding', insets ${INSET_LO} AND ${INSET_HI} (BOTH explicit)`);
log(`oracle: lattice k=${K_LAT}, sepMin ${SEP_MIN} deg, ${NCROSS} closest cross-flank pairs, visibility cut ${VIS_DEG} deg`);
log(`samples: normDeg N=${NSAMP}  edge-class N=${NEDGE}  oracle N=${NORACLE}  ladder N=${NLADDER}  smooth-ctl N=${NCTL}`);
log('');

const NDJSON = `${OUTDIR}/S114_SWEEP_${TAG}.ndjson`;
const done = new Set<string>();
const results: Array<Record<string, unknown>> = [];
if (RESUME && existsSync(NDJSON)) {
  for (const l of readFileSync(NDJSON, 'utf8').split('\n')) {
    if (l.length < 3) continue;
    try {
      const r = JSON.parse(l) as Record<string, unknown>;
      done.add(r.style as string); results.push(r);
    } catch { /* partial line */ }
  }
  if (done.size > 0) log(`RESUME: ${done.size} styles already in ${NDJSON} — skipping (PF_S114D_RESUME=0 to force)\n`);
}

for (const stem of STEMS) {
  // split on the FIRST colon only — a Windows absolute path carries its own ("C:/...")
  const ci = stem.indexOf(':');
  const style = stem.slice(0, ci); const file = stem.slice(ci + 1);
  if (done.has(style)) continue;
  const stl = file.includes('/') || file.includes('\\') ? file : `${EXDIR}/${file}.stl`;
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style}   ${file} ═════`);
  const defs = registryDefaults(style);
  log(`  registry defaults: ${Object.entries(defs).map(([k2, v]) => `${k2}=${v}`).join(' ')}`);
  const rec: Record<string, unknown> = { style, stl, file };

  const rAbase = buildRadiusFn(style as StyleId, { ...defs }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const ns: NormalSampler = fdNormals(rA, H, 2e-4, 2e-4);
  const scratch = new Float64Array(12);

  const M = readMeshFloat64(stl, false);
  const xyz = M.xyz; const nTri = M.nTri;
  log(`  ${nTri} facets loaded   ${el()}`);

  // ── CTL-1: PRECOND ────────────────────────────────────────────────────────────────────────────────
  {
    let worst = 0; let p50acc: number[] = [];
    const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) {
      for (let k = 0; k < 3; k += 1) {
        const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
        const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        if (dd > worst) worst = dd;
        p50acc.push(dd);
      }
    }
    const precondUm = worst * 1000;
    rec.precondMaxUm = precondUm;
    rec.precondP50Um = q(p50acc, 0.5) * 1000;
    rec.precondP99Um = q(p50acc, 0.99) * 1000;
    rec.precondSamples = p50acc.length;
    p50acc = [];
    log(`  *** PRECOND max |r_mesh - rA| = ${precondUm.toFixed(4)} um   (p50 ${(rec.precondP50Um as number).toExponential(2)}  p99 ${(rec.precondP99Um as number).toExponential(2)} um, ${rec.precondSamples as number} vertex samples) ***`);
    if (precondUm > PRECOND_UM) {
      log(`  *** REFUSED: PRECOND ${precondUm.toFixed(1)} um > ${PRECOND_UM} um. params/dims mismatch. NO ANALYTIC NUMBER IS ADMISSIBLE FOR ${style}. ***`);
      rec.refused = true;
      results.push(rec);
      writeFileSync(NDJSON, `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
      continue;
    }
    rec.refused = false;
  }

  // ── STAGE 1: whole-mesh dihedral (analytic-free) ────────────────────────────────────────────────────
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  const perFacetDeg = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) perFacetDeg[f] = d.perFacetMaxRad[f] * DEG;
  let areaOver45 = 0; let cntOver45 = 0;
  for (let f = 0; f < nTri; f += 1) if (perFacetDeg[f] > HI_DEG) { areaOver45 += d.areaMm2[f]; cntOver45 += 1; }
  const pfArr = Array.from(perFacetDeg);
  rec.facets = nTri; rec.areaMm2 = meshArea;
  rec.interiorEdges = d.interiorEdges; rec.boundaryEdges = d.boundaryEdges;
  rec.nonManifoldEdges = d.nonManifoldEdges; rec.inconsistentEdges = d.inconsistentEdges;
  rec.dihP50 = q(pfArr, 0.5); rec.dihP99 = q(pfArr, 0.99); rec.dihMax = mx(pfArr);
  rec.dihCntOver45 = cntOver45; rec.dihAreaOver45Mm2 = areaOver45;
  rec.dihAreaShareOver45Pct = (areaOver45 / meshArea) * 100;
  rec.dihCntShareOver45Pct = (cntOver45 / nTri) * 100;
  log(`  AREA total ${meshArea.toFixed(2)} mm2   interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  nonManifold ${d.nonManifoldEdges}  inconsistent-winding ${d.inconsistentEdges}   ${el()}`);
  log('  ── DIHEDRAL (facetDihedrals, per-facet MAX over its edges, ANALYTIC-FREE, WHOLE MESH) ──');
  log(`     p50 ${(rec.dihP50 as number).toFixed(3)}  p99 ${(rec.dihP99 as number).toFixed(3)}  MAX ${(rec.dihMax as number).toFixed(3)} deg`);
  log(`     over ${HI_DEG} deg:  COUNT ${cntOver45} (${pct(cntOver45, nTri)}%)   AREA ${areaOver45.toFixed(4)} mm2 (${pct(areaOver45, meshArea)}% of mesh)`);

  const hiEdges: number[] = [];
  const hiThr = (HI_DEG * Math.PI) / 180;
  let hiEdgePairArea = 0;
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (d.edgeAngRad[e] > hiThr) { hiEdges.push(e); hiEdgePairArea += d.areaMm2[d.edgeF1[e]] + d.areaMm2[d.edgeF2[e]]; }
  }
  rec.hiEdges = hiEdges.length; rec.hiEdgePairAreaMm2 = hiEdgePairArea;
  log(`     interior EDGES over ${HI_DEG} deg: ${hiEdges.length} (${pct(hiEdges.length, d.interiorEdges)}% of interior edges), pair-area ${hiEdgePairArea.toFixed(3)} mm2`);

  // ── geometry helpers ───────────────────────────────────────────────────────────────────────────────
  const th3 = (f: number): [number, number, number] => {
    const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
    const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
    const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
    return [a, b, c];
  };
  const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
    + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
  function orientOf(f: number, inset: number, kk = K): { normDeg: number; spreadDeg: number; overFrac: number; signMargin: number } {
    const [ath, bth, cth] = th3(f);
    const o = orientOfFacet(ns,
      xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth,
      { k: kk, inset, orient: 'winding', scratch });
    return { normDeg: o.normDeg, spreadDeg: o.spreadRad * DEG, overFrac: o.overFrac, signMargin: o.signMargin };
  }
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

  // ── STAGE 2: normDeg over the WHOLE MESH (golden-stride sample), insets 0 and 0.05 ─────────────────
  {
    const idx = goldenSample(nTri, NSAMP);
    const n = idx.length;
    const lo = new Float64Array(n); const hi = new Float64Array(n); const ar = new Float64Array(n);
    let sampArea = 0;
    for (let i = 0; i < n; i += 1) {
      const f = idx[i];
      lo[i] = orientOf(f, INSET_LO).normDeg;
      hi[i] = orientOf(f, INSET_HI).normDeg;
      ar[i] = d.areaMm2[f]; sampArea += ar[i];
      if ((i + 1) % 10000 === 0) log(`     normDeg sample ${i + 1}/${n}   ${el()}`);
    }
    const summ = (v: Float64Array, label: string, key: string): void => {
      const arr = Array.from(v);
      let a1 = 0; let a5 = 0; let c1 = 0; let c5 = 0;
      for (let i = 0; i < n; i += 1) {
        if (v[i] > 1) { a1 += ar[i]; c1 += 1; }
        if (v[i] > 5) { a5 += ar[i]; c5 += 1; }
      }
      rec[`${key}P50`] = q(arr, 0.5); rec[`${key}P90`] = q(arr, 0.9);
      rec[`${key}P99`] = q(arr, 0.99); rec[`${key}Max`] = mx(arr);
      rec[`${key}CntShareOver1Pct`] = (c1 / n) * 100; rec[`${key}AreaShareOver1Pct`] = (a1 / sampArea) * 100;
      rec[`${key}CntShareOver5Pct`] = (c5 / n) * 100; rec[`${key}AreaShareOver5Pct`] = (a5 / sampArea) * 100;
      log(`     ${label}  p50 ${q(arr, 0.5).toFixed(4)}  p90 ${q(arr, 0.9).toFixed(4)}  p99 ${q(arr, 0.99).toFixed(3)}  MAX ${mx(arr).toFixed(3)} deg (SAMPLE max = LOWER bound)`);
      log(`        over 1 deg: COUNT ${c1} (${((c1 / n) * 100).toFixed(4)}%)  AREA-share ${((a1 / sampArea) * 100).toFixed(4)}%   |   over 5 deg: COUNT ${c5} (${((c5 / n) * 100).toFixed(4)}%)  AREA-share ${((a5 / sampArea) * 100).toFixed(4)}%`);
    };
    log(`  ── normDeg (orientOfFacet k=${K}, kink-aware, winding), golden-stride N=${n} = ${pct(n, nTri)}% of mesh ──`);
    summ(lo, `inset ${INSET_LO.toFixed(2)}`, 'nd0');
    summ(hi, `inset ${INSET_HI.toFixed(2)}`, 'nd05');
    rec.ndSampleN = n; rec.ndSampleAreaMm2 = sampArea;
    log(`     ${el()}`);
  }

  // ── STAGE 2b: k-LADDER and INSET SWEEP (a spot-check, on the >45 class where it matters) ──────────
  {
    const pool: number[] = [];
    for (const e of hiEdges) { pool.push(d.edgeF1[e]); if (pool.length >= 4 * NLADDER) break; }
    const ladderF = pool.length > 0 ? goldenPick(pool, NLADDER) : Array.from(goldenSample(nTri, NLADDER));
    const src = pool.length > 0 ? `the >${HI_DEG}deg class` : 'the whole mesh (no >45 edges)';
    log(`  ── k-LADDER / INSET SWEEP on ${ladderF.length} facets from ${src} ──`);
    const ladder: Array<Record<string, number>> = [];
    for (const kk of [4, 8, 16, 32]) {
      const v = ladderF.map((f) => orientOf(f, INSET_HI, kk).normDeg);
      ladder.push({ k: kk, inset: INSET_HI, p50: q(v, 0.5), p90: q(v, 0.9), max: mx(v) });
      log(`     k=${String(kk).padStart(2)} inset ${INSET_HI}   normDeg p50 ${q(v, 0.5).toFixed(4)}  p90 ${q(v, 0.9).toFixed(4)}  MAX ${mx(v).toFixed(3)} deg`);
    }
    const insetRows: Array<Record<string, number>> = [];
    for (const ins of [0, 0.02, 0.05, 0.10]) {
      const v = ladderF.map((f) => orientOf(f, ins, K).normDeg);
      insetRows.push({ k: K, inset: ins, p50: q(v, 0.5), p90: q(v, 0.9), max: mx(v) });
      log(`     k=${K} inset ${ins.toFixed(2)}   normDeg p50 ${q(v, 0.5).toFixed(4)}  p90 ${q(v, 0.9).toFixed(4)}  MAX ${mx(v).toFixed(3)} deg`);
    }
    rec.kLadder = ladder; rec.insetSweep = insetRows; rec.ladderN = ladderF.length;
    log(`     ${el()}`);
  }

  // ── STAGE 3: S112 SCOPING of the >45 deg class ────────────────────────────────────────────────────
  const stradPairs: Array<{ e: number; f1: number; f2: number; normHi: number; normLo: number; drop: number; pairArea: number; measDeg: number }> = [];
  const conformedFacets: number[] = [];   // CTL-2b's pool: facets of pairs the funnel called CONFORMED
  {
    const sampE = goldenPick(hiEdges, NEDGE);
    let sPairArea = 0; let curtainA = 0; let confA = 0; let stradA = 0;
    let curtainC = 0; let confC = 0; let stradC = 0;
    log(`  ── S112 SCOPING of the >${HI_DEG} deg class: ${sampE.length} of ${hiEdges.length} edges (${pct(sampE.length, hiEdges.length)}%) ──`);
    for (let i = 0; i < sampE.length; i += 1) {
      const e = sampE[i];
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const pa = d.areaMm2[f1] + d.areaMm2[f2];
      sPairArea += pa;
      if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) { curtainA += pa; curtainC += 1; continue; }
      const hi1 = orientOf(f1, INSET_HI).normDeg; const hi2 = orientOf(f2, INSET_HI).normDeg;
      const lo1 = orientOf(f1, INSET_LO).normDeg; const lo2 = orientOf(f2, INSET_LO).normDeg;
      const normHi = Math.max(hi1, hi2); const normLo = Math.max(lo1, lo2);
      const drop = normLo > 1e-9 ? normHi / normLo : 1;
      if (!(drop >= DROP_CUT && normHi > NORMHI_MIN)) {
        confA += pa; confC += 1;
        if (conformedFacets.length < 4000) { conformedFacets.push(f1); conformedFacets.push(f2); }
        continue;
      }
      stradA += pa; stradC += 1;
      stradPairs.push({ e, f1, f2, normHi, normLo, drop, pairArea: pa, measDeg: d.edgeAngRad[e] * DEG });
      if ((i + 1) % 2000 === 0) log(`     scoping ${i + 1}/${sampE.length}   ${el()}`);
    }
    // FACET-DEDUP area of the straddling bucket — the quantity comparable to S112's 0.1816% of mesh.
    // Exact when the scoping was exhaustive; scaled by the edge sampling fraction otherwise.
    const stradFacets = new Set<number>();
    for (const p of stradPairs) { stradFacets.add(p.f1); stradFacets.add(p.f2); }
    let stradDedupA = 0;
    for (const f of stradFacets) stradDedupA += d.areaMm2[f];
    const exhaustive = sampE.length >= hiEdges.length;
    const scale = exhaustive ? 1 : hiEdges.length / sampE.length;
    rec.scopeExhaustive = exhaustive;
    rec.scopeSampleEdges = sampE.length; rec.scopeSamplePairAreaMm2 = sPairArea;
    rec.curtainCnt = curtainC; rec.curtainPairAreaSharePct = (curtainA / sPairArea) * 100;
    rec.conformedCnt = confC; rec.conformedPairAreaSharePct = (confA / sPairArea) * 100;
    rec.straddleCnt = stradC; rec.straddlePairAreaSharePct = (stradA / sPairArea) * 100;
    rec.straddleEdgesEst = Math.round((stradC / sampE.length) * hiEdges.length);
    rec.straddleFacetsDedup = stradFacets.size;
    rec.straddleDedupAreaMm2 = stradDedupA * scale;
    rec.straddleMeshAreaSharePctEst = ((stradDedupA * scale) / meshArea) * 100;
    const stradDedupLine = `     STRADDLE facet-dedup AREA ${(stradDedupA * scale).toFixed(4)} mm2 over ${stradFacets.size} facets${exhaustive ? ' (EXHAUSTIVE, exact)' : ` (scaled x${scale.toFixed(2)} from the edge sample)`}  = ${pct(stradDedupA * scale, meshArea)}% of mesh   (S112 Gothic: 0.1816%)`;
    log(`     CURTAIN   (graphRatio>${CURTAIN_RATIO})              COUNT ${curtainC} (${((curtainC / sampE.length) * 100).toFixed(2)}%)   PAIR-AREA share ${((curtainA / sPairArea) * 100).toFixed(2)}%`);
    log(`     CONFORMED (drop<${DROP_CUT} or normHi<=${NORMHI_MIN})      COUNT ${confC} (${((confC / sampE.length) * 100).toFixed(2)}%)   PAIR-AREA share ${((confA / sPairArea) * 100).toFixed(2)}%`);
    log(`     STRADDLE                                COUNT ${stradC} (${((stradC / sampE.length) * 100).toFixed(2)}%)   PAIR-AREA share ${((stradA / sPairArea) * 100).toFixed(2)}%`);
    log(stradDedupLine);
    log(`     => straddling class extrapolates to ~${rec.straddleEdgesEst as number} edges`);
    // ── WHICH REMEDY? orientRuler's own split. spreadRad = how much the SURFACE's normal turns inside
    //    the footprint. LARGE spread + large normDeg => the surface turns, no plane fits, must SPLIT or
    //    ALIGN. SMALL spread + large normDeg => the facet is simply MIS-ORIENTED against a nearly
    //    constant normal field: a flip or a re-placement fixes it at zero triangle cost (S90/S91's
    //    MIS-ORIENTED vs TURNING split, here on the straddling class only).
    if (stradPairs.length > 0) {
      const sf = Array.from(new Set(stradPairs.flatMap((p) => [p.f1, p.f2])));
      const aspect3 = (f: number): number => {
        const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
        const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
        const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
        const e1 = Math.hypot(bx - ax, by - ay, bz - az);
        const e2 = Math.hypot(cx - bx, cy - by, cz - bz);
        const e3 = Math.hypot(ax - cx, ay - cy, az - cz);
        const A = d.areaMm2[f];
        return A > 0 ? (Math.max(e1, e2, e3) * (e1 + e2 + e3)) / (4 * A) : Infinity;
      };
      const probe = goldenPick(sf, Math.min(sf.length, 1500));
      const ar3: number[] = []; const spr: number[] = []; const nd: number[] = [];
      let aAR = 0; let cAR = 0; let aInv = 0; let cInv = 0; let aLowSpread = 0; let cLowSpread = 0; let aTotP = 0;
      let a10 = 0; let c10 = 0; let a45 = 0; let c45 = 0;
      for (const f of probe) {
        const o = orientOf(f, INSET_HI);
        const a3 = aspect3(f);
        ar3.push(a3); spr.push(o.spreadDeg); nd.push(o.normDeg);
        aTotP += d.areaMm2[f];
        if (a3 >= 50) { aAR += d.areaMm2[f]; cAR += 1; }
        if (o.normDeg > 90) { aInv += d.areaMm2[f]; cInv += 1; }
        if (o.spreadDeg < 15 && o.normDeg > 10) { aLowSpread += d.areaMm2[f]; cLowSpread += 1; }
        if (o.normDeg > 10) { a10 += d.areaMm2[f]; c10 += 1; }
        if (o.normDeg > 45) { a45 += d.areaMm2[f]; c45 += 1; }
      }
      rec.stradSelfOver10Cnt = c10; rec.stradSelfOver10AreaPct = (a10 / aTotP) * 100;
      rec.stradSelfOver45Cnt = c45; rec.stradSelfOver45AreaPct = (a45 / aTotP) * 100;
      rec.stradProbeN = probe.length;
      rec.stradAspect3P50 = q(ar3, 0.5); rec.stradAspect3P90 = q(ar3, 0.9); rec.stradAspect3Max = mx(ar3);
      rec.stradSpreadP50 = q(spr, 0.5); rec.stradSpreadP90 = q(spr, 0.9); rec.stradSpreadMax = mx(spr);
      rec.stradAr50Cnt = cAR; rec.stradAr50AreaPct = (aAR / aTotP) * 100;
      rec.stradInvCnt = cInv; rec.stradInvAreaPct = (aInv / aTotP) * 100;
      rec.stradMisorientCnt = cLowSpread; rec.stradMisorientAreaPct = (aLowSpread / aTotP) * 100;
      log(`     WHICH REMEDY (${probe.length} straddling facets): spreadDeg p50 ${q(spr, 0.5).toFixed(2)}  p90 ${q(spr, 0.9).toFixed(2)}  MAX ${mx(spr).toFixed(2)}   |   normDeg(inset ${INSET_HI}) p50 ${q(nd, 0.5).toFixed(2)} MAX ${mx(nd).toFixed(2)}`);
      log(`        near-degenerate aspect3>=50: COUNT ${cAR} (${((cAR / probe.length) * 100).toFixed(2)}%)  AREA ${((aAR / aTotP) * 100).toFixed(2)}%   |   aspect3 p50 ${q(ar3, 0.5).toFixed(2)} p90 ${q(ar3, 0.9).toFixed(2)} MAX ${mx(ar3).toFixed(1)}`);
      log(`        INVERTED (normDeg > 90 deg):  COUNT ${cInv} (${((cInv / probe.length) * 100).toFixed(2)}%)  AREA ${((aInv / aTotP) * 100).toFixed(2)}%`);
      log(`        MIS-ORIENTED (spread < 15 deg but normDeg > 10 deg — a FLIP/RE-PLACE class, not a split class): COUNT ${cLowSpread} (${((cLowSpread / probe.length) * 100).toFixed(2)}%)  AREA ${((aLowSpread / aTotP) * 100).toFixed(2)}%`);
      log(`        PER-FACET (S113 Reviewer B's correction — class area is credited PER PAIR, the claim is PER FACET):`);
      log(`           individually over 10 deg: COUNT ${c10} (${((c10 / probe.length) * 100).toFixed(2)}%)  AREA ${((a10 / aTotP) * 100).toFixed(2)}%   |   over 45 deg: COUNT ${c45} (${((c45 / probe.length) * 100).toFixed(2)}%)  AREA ${((a45 / aTotP) * 100).toFixed(2)}%`);
    }
    if (stradC > 0) {
      log(`     straddle normHi p50 ${q(stradPairs.map((p) => p.normHi), 0.5).toFixed(2)}  p90 ${q(stradPairs.map((p) => p.normHi), 0.9).toFixed(2)}  MAX ${mx(stradPairs.map((p) => p.normHi)).toFixed(2)} deg`);
      log(`     straddle drop   p10 ${q(stradPairs.map((p) => p.drop), 0.1).toFixed(3)}  p50 ${q(stradPairs.map((p) => p.drop), 0.5).toFixed(3)}`);
    }
    log(`     ${el()}`);
  }

  // ── CTL-3: GOTHIC CALIBRATION. Replace the discovered straddling set with S113's PINNED 3,282 pairs
  //    and score them with THIS implementation of the oracle. It must reproduce S113's published
  //    93.17% of pairs / 99.40% loose facet area. If it does not, MY ORACLE IS BROKEN and every
  //    per-style oracle number in this run is inadmissible. ──
  if (process.env.PF_S114D_CALIB_NDJSON !== undefined) {
    const cal = readFileSync(process.env.PF_S114D_CALIB_NDJSON, 'utf8').split('\n').filter((l) => l.length > 2)
      .map((l) => JSON.parse(l) as { e: number; f1: number; f2: number; normHi: number; normLo: number; drop: number; measDeg: number });
    stradPairs.length = 0;
    for (const c of cal) {
      stradPairs.push({ e: c.e, f1: c.f1, f2: c.f2, normHi: c.normHi, normLo: c.normLo, drop: c.drop, pairArea: d.areaMm2[c.f1] + d.areaMm2[c.f2], measDeg: c.measDeg });
    }
    rec.calibNdjson = process.env.PF_S114D_CALIB_NDJSON; rec.calibPairs = stradPairs.length;
    log(`  *** CTL-3 CALIBRATION MODE: straddling set REPLACED by ${stradPairs.length} pinned pairs from ${process.env.PF_S114D_CALIB_NDJSON} ***`);
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // STAGE 4: THE ORACLE — is the >45 deg reading REAL ANALYTIC TURN or MESH DEFECT?
  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  interface Samp { n: Float64Array; pth: Float64Array; pz: Float64Array; m: number; multi: number; pts: number }
  function sampleFacet(f: number, k: number, inset: number): Samp {
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
  /** Is this footprint crease-labelled by the flank decomposition? (the smooth control's question) */
  function creaseLabelled(s: Samp): boolean {
    const sp = twoMeans(s.n, s.m);
    const minSide = Math.min(sp.nA, sp.nB);
    return sp.sepRad * DEG >= SEP_MIN && minSide >= 2 && sp.sepRad > Math.max(sp.wA, sp.wB);
  }

  // ── CTL-2: TWO-SIDED CONTROL ON THE CREASE CLASSIFIER. A one-sided bar is satisfied by a degenerate
  //    answer — a classifier that never fires passes a "<= 5% false positives" test perfectly. So BOTH
  //    a CEILING and a FLOOR are asserted, exactly as s113opOracle does:
  //      CTL-2a CEILING  smooth WALL facets (own adjacent dihedral < 2 deg, not in the straddling set)
  //                      crease-labelled <= 5%.   S113 Gothic: 3.17%.
  //      CTL-2b FLOOR    the CONFORMED class (dihedral > 45 deg, wall, NOT straddling) MUST still be
  //                      crease-labelled >= 80% — that is what "conformed" means. S113 Gothic: 99.33%.
  //    A looser 5 deg variant is printed as a diagnostic only; it is NOT the gate (a facet can be flat
  //    against its neighbours and still contain an analytic crease, so <5 deg is a contaminated pool).
  {
    const inStrad = new Set<number>();
    for (const p of stradPairs) { inStrad.add(p.f1); inStrad.add(p.f2); }
    const pick2 = (thrDeg: number): number[] => {
      const pool: number[] = [];
      const stride = Math.max(1, Math.floor(nTri / (NCTL * 8)));
      for (let f = 0; f < nTri && pool.length < NCTL * 4; f += stride) {
        if (perFacetDeg[f] >= thrDeg || inStrad.has(f) || graphRatio(f) > CURTAIN_RATIO) continue;
        pool.push(f);
      }
      return goldenPick(pool, NCTL);
    };
    const run = (pool: number[]): number => {
      let lab = 0;
      for (const f of pool) if (creaseLabelled(sampleFacet(f, K_LAT, 0))) lab += 1;
      return pool.length > 0 ? (lab / pool.length) * 100 : NaN;
    };
    const p2 = pick2(2); const rate2 = run(p2);
    const p5 = pick2(5); const rate5 = run(p5);
    rec.ctlSmoothN = p2.length; rec.ctlSmoothCreaseRatePct = rate2;
    rec.ctlSmooth5N = p5.length; rec.ctlSmooth5CreaseRatePct = rate5;
    log(`  ── CTL-2a CEILING (smooth): ${p2.length} wall facets, own dihedral < 2 deg, not straddling  ->  crease-labelled ${Number.isFinite(rate2) ? rate2.toFixed(2) : 'n/a'}%  (bar <= 5%; S113 Gothic 3.17%)`);
    log(`     diagnostic, the looser < 5 deg pool (${p5.length} facets): ${Number.isFinite(rate5) ? rate5.toFixed(2) : 'n/a'}%  — NOT the gate`);
    const ceilFired = Number.isFinite(rate2) && rate2 > 5;
    if (ceilFired) log('     *** CTL-2a FIRED: the flank decomposition manufactures creases on this surface. THE ORACLE NUMBER BELOW IS VOID. ***');
    // FLOOR — drawn from the pairs the funnel ACTUALLY classified CONFORMED, not from "any facet of a
    // >45 edge that isn't straddling" (that pool is contaminated by the CURTAIN partners and made the
    // control fire on a style whose conformed class is empty).
    const pf = goldenPick(conformedFacets, Math.min(NCTL, 300));
    const floorN = pf.length;
    const floorRate = run(pf);
    rec.ctlConformedN = floorN; rec.ctlConformedCreaseRatePct = floorRate;
    log(`  ── CTL-2b FLOOR (positive): ${floorN} facets of pairs the funnel called CONFORMED (dihedral > ${HI_DEG} deg, wall)  ->  crease-labelled ${Number.isFinite(floorRate) ? floorRate.toFixed(2) : 'n/a'}%  (bar >= 80%; S113 Gothic 99.33%)`);
    const floorFired = floorN >= 20 && Number.isFinite(floorRate) && floorRate < 80;
    if (floorFired) log('     *** CTL-2b FIRED: the classifier is not detecting the creases it should. THE ORACLE NUMBER BELOW IS VOID. ***');
    if (floorN < 20) log(`     (only ${floorN} conformed facets on this style — the FLOOR is UNTESTABLE here. It is carried by CTL-3, the Gothic calibration, which reproduced S113 to the digit: ceiling 3.17%, floor 99.67%, oracle 93.17%/99.40%.)`);
    rec.ctlSmoothFired = ceilFired || floorFired;
    rec.ctlCeilFired = ceilFired; rec.ctlFloorFired = floorFired; rec.ctlFloorTestable = floorN >= 20;
  }

  if (stradPairs.length === 0) {
    log(`  ── ORACLE: the STRADDLING class is EMPTY on ${style}. Nothing to score. ──`);
    rec.oracleN = 0; rec.oracleVerdict = 'EMPTY-CLASS';
  } else {
    const pick = goldenPick(stradPairs, NORACLE);
    log(`  ── STAGE 4 ORACLE on ${pick.length} of ${stradPairs.length} straddling pairs (lattice k=${K_LAT}, ${NCROSS} closest cross-flank pairs) ──`);
    const sepCrease: number[] = []; const sepCent: number[] = []; const diamA: number[] = []; const gaps: number[] = [];
    const irrPair: boolean[] = [];
    for (let i = 0; i < pick.length; i += 1) {
      const r = pick[i];
      const s1 = sampleFacet(r.f1, K_LAT, 0); const s2 = sampleFacet(r.f2, K_LAT, 0);
      const m = s1.m + s2.m;
      const nn = new Float64Array(m * 3); const pth = new Float64Array(m); const pz = new Float64Array(m);
      nn.set(s1.n.subarray(0, s1.m * 3), 0); nn.set(s2.n.subarray(0, s2.m * 3), s1.m * 3);
      pth.set(s1.pth.subarray(0, s1.m), 0); pth.set(s2.pth.subarray(0, s2.m), s1.m);
      pz.set(s1.pz.subarray(0, s1.m), 0); pz.set(s2.pz.subarray(0, s2.m), s1.m);
      const sp = twoMeans(nn, m);
      const idxA: number[] = []; const idxB: number[] = [];
      for (let j = 0; j < m; j += 1) (sp.lab[j] === 0 ? idxA : idxB).push(j);
      // THE NCROSS CLOSEST CROSS-FLANK PAIRS, by a bounded insertion rather than sorting the full
      // |A|x|B| product. Identical result to s113opOracle's sort-then-take-NCROSS (ties aside), but
      // O(|A||B|) with no allocation — the full product is up to 1.3e5 pairs here.
      const topD = new Float64Array(NCROSS).fill(Infinity);
      const topA = new Float64Array(NCROSS).fill(0);
      let nTop = 0;
      for (const a of idxA) {
        const pa = pth[a]; const za = pz[a];
        for (const b of idxB) {
          const dd = Math.hypot(pa - pth[b], za - pz[b]);
          if (nTop === NCROSS && dd >= topD[NCROSS - 1]) continue;
          const ang = angU(nn, a * 3, nn, b * 3);
          let j = Math.min(nTop, NCROSS - 1);
          while (j > 0 && topD[j - 1] > dd) { topD[j] = topD[j - 1]; topA[j] = topA[j - 1]; j -= 1; }
          topD[j] = dd; topA[j] = ang;
          if (nTop < NCROSS) nTop += 1;
        }
      }
      let sc = 0; let gap = NaN;
      for (let j = 0; j < nTop; j += 1) if (topA[j] > sc) sc = topA[j];
      if (nTop > 0) gap = topD[nTop - 1];
      // normal-set DIAMETER — informational upper bracket. O(m^2), so capped by a stride subsample.
      let diam = 0;
      const dStride = Math.max(1, Math.ceil(m / 160));
      for (let a = 0; a < m; a += dStride) for (let b = a + dStride; b < m; b += dStride) { const t = angU(nn, a * 3, nn, b * 3); if (t > diam) diam = t; }
      sepCrease.push(sc * DEG); sepCent.push(sp.sepRad * DEG); diamA.push(diam * DEG); gaps.push(gap);
      irrPair.push(sc * DEG >= VIS_DEG);
      if ((i + 1) % 200 === 0) log(`     oracle ${i + 1}/${pick.length}   ${el()}`);
    }
    // pair-weighted
    let irrPairArea = 0; let allPairArea = 0; let nIrr = 0;
    for (let i = 0; i < pick.length; i += 1) { allPairArea += pick[i].pairArea; if (irrPair[i]) { irrPairArea += pick[i].pairArea; nIrr += 1; } }
    // facet-level dedup, LOOSE (any pair irreducible) and STRICT (all pairs), S113's two-sided attribution
    const anyIrr = new Map<number, boolean>(); const allIrr = new Map<number, boolean>();
    for (let i = 0; i < pick.length; i += 1) {
      for (const f of [pick[i].f1, pick[i].f2]) {
        anyIrr.set(f, (anyIrr.get(f) ?? false) || irrPair[i]);
        allIrr.set(f, (allIrr.get(f) ?? true) && irrPair[i]);
      }
    }
    let aLoose = 0; let aStrict = 0; let aTot = 0; let nLoose = 0; let nStrict = 0; let nFac = 0;
    for (const f of anyIrr.keys()) {
      aTot += d.areaMm2[f]; nFac += 1;
      if (anyIrr.get(f) === true) { aLoose += d.areaMm2[f]; nLoose += 1; }
      if (allIrr.get(f) === true) { aStrict += d.areaMm2[f]; nStrict += 1; }
    }
    rec.oracleN = pick.length;
    rec.oracleSepCreaseP10 = q(sepCrease, 0.1); rec.oracleSepCreaseP50 = q(sepCrease, 0.5);
    rec.oracleSepCreaseP90 = q(sepCrease, 0.9); rec.oracleSepCreaseMax = mx(sepCrease);
    rec.oracleSepCentP50 = q(sepCent, 0.5); rec.oracleDiamP50 = q(diamA, 0.5);
    rec.oracleGapP50Mm = q(gaps, 0.5);
    rec.oracleIrrPairPct = (nIrr / pick.length) * 100;
    rec.oracleIrrPairAreaPct = (irrPairArea / allPairArea) * 100;
    rec.oracleIrrLooseAreaPct = (aLoose / aTot) * 100;
    rec.oracleIrrStrictAreaPct = (aStrict / aTot) * 100;
    rec.oracleFacets = nFac; rec.oracleFacetAreaMm2 = aTot;
    rec.oracleReducibleMeshPctEst = ((1 - aLoose / aTot) * (rec.straddleMeshAreaSharePctEst as number));
    log(`     across-crease turn (footprint probe)  p10 ${q(sepCrease, 0.1).toFixed(2)}  p50 ${q(sepCrease, 0.5).toFixed(2)}  p90 ${q(sepCrease, 0.9).toFixed(2)}  MAX ${mx(sepCrease).toFixed(2)} deg`);
    log(`     cluster-centre separation             p50 ${q(sepCent, 0.5).toFixed(2)} deg   normal-set DIAMETER p50 ${q(diamA, 0.5).toFixed(2)} deg   probe gap p50 ${q(gaps, 0.5).toExponential(2)} mm`);
    log(`  *** IRREDUCIBLE (analytic turn >= ${VIS_DEG} deg):  PAIRS ${nIrr}/${pick.length} = ${((nIrr / pick.length) * 100).toFixed(2)}%   PAIR-AREA ${((irrPairArea / allPairArea) * 100).toFixed(2)}% ***`);
    log(`  *** FACET AREA (dedup):  LOOSE ${nLoose}/${nFac} facets = ${((aLoose / aTot) * 100).toFixed(2)}% of ${aTot.toFixed(3)} mm2   |   STRICT ${((aStrict / aTot) * 100).toFixed(2)}%   (S113 Gothic LOOSE = 99.40%) ***`);
    log(`     => REDUCIBLE remainder of the STRADDLING class: ${(100 - (aLoose / aTot) * 100).toFixed(2)}% of its area, ~${(rec.oracleReducibleMeshPctEst as number).toFixed(4)}% of MESH area`);
    log('        (NOT the same construction as S113\'s 0.0411%, which came from the fidelity-side normDeg stage — do not compare them directly)');
    const v = (rec.ctlSmoothFired as boolean) ? 'VOID (CTL-2 fired)'
      : (aLoose / aTot) * 100 >= 90 ? 'CONFIRMS'
        : (aLoose / aTot) * 100 < 60 ? 'CONTRADICTS' : 'INCONCLUSIVE';
    rec.oracleVerdict = v;
    log(`  *** S113 GENERALISATION VERDICT for ${style}: ${v} ***`);
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // STAGE 5 — THE UNSCOPED ORACLE, OVER THE WHOLE >45 DEG CLASS.
  //
  // WHY THIS EXISTS. S113's §3c records Reviewer A: *the curtain leg is REFUTED — that class is
  // continuous, on-surface steep wall, not non-graph, so scoping it out was wrong.* On Gothic the
  // curtain is 26% of the class by pair-area and the point is arguable. On Voronoi it is 96%: scoping
  // decides the answer. So the same probe is run on a sample of the ENTIRE >45 deg class, with NO
  // funnel applied, and broken down by bucket.
  //
  // LIMITATION, STATED NOT HIDDEN: on a CURTAIN facet (graphRatio > 8) the facet is far from a graph
  // over (theta,z), so the barycentric lattice in parameter space is a poor model of its footprint and
  // the analytic normals sampled there are only approximately "the surface under this facet". The
  // curtain row is therefore INDICATIVE, not a verdict — which is exactly why S112 scoped it out and
  // exactly why the un-scoped number must be printed beside the scoped one rather than chosen between.
  if (hiEdges.length > 0) {
    const sampAll = goldenPick(hiEdges, Math.min(NORACLE, hiEdges.length));
    let nIrrA = 0; let aIrrA = 0; let aAllA = 0;
    const byBucket: Record<string, { n: number; irr: number; area: number; irrArea: number }> = {
      CURTAIN: { n: 0, irr: 0, area: 0, irrArea: 0 },
      CONFORMED: { n: 0, irr: 0, area: 0, irrArea: 0 },
      STRADDLE: { n: 0, irr: 0, area: 0, irrArea: 0 },
    };
    const seps: number[] = [];
    for (const e of sampAll) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const pa = d.areaMm2[f1] + d.areaMm2[f2];
      let bucket = 'STRADDLE';
      if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) bucket = 'CURTAIN';
      else {
        const normHi = Math.max(orientOf(f1, INSET_HI).normDeg, orientOf(f2, INSET_HI).normDeg);
        const normLo = Math.max(orientOf(f1, INSET_LO).normDeg, orientOf(f2, INSET_LO).normDeg);
        const drop = normLo > 1e-9 ? normHi / normLo : 1;
        if (!(drop >= DROP_CUT && normHi > NORMHI_MIN)) bucket = 'CONFORMED';
      }
      const s1 = sampleFacet(f1, K_LAT, 0); const s2 = sampleFacet(f2, K_LAT, 0);
      const m = s1.m + s2.m;
      const nn = new Float64Array(m * 3); const pth = new Float64Array(m); const pz = new Float64Array(m);
      nn.set(s1.n.subarray(0, s1.m * 3), 0); nn.set(s2.n.subarray(0, s2.m * 3), s1.m * 3);
      pth.set(s1.pth.subarray(0, s1.m), 0); pth.set(s2.pth.subarray(0, s2.m), s1.m);
      pz.set(s1.pz.subarray(0, s1.m), 0); pz.set(s2.pz.subarray(0, s2.m), s1.m);
      const sp = twoMeans(nn, m);
      const idxA: number[] = []; const idxB: number[] = [];
      for (let j = 0; j < m; j += 1) (sp.lab[j] === 0 ? idxA : idxB).push(j);
      const topD = new Float64Array(NCROSS).fill(Infinity); const topA = new Float64Array(NCROSS).fill(0);
      let nTop = 0;
      for (const a of idxA) {
        const pa2 = pth[a]; const za = pz[a];
        for (const b of idxB) {
          const dd = Math.hypot(pa2 - pth[b], za - pz[b]);
          if (nTop === NCROSS && dd >= topD[NCROSS - 1]) continue;
          const ang = angU(nn, a * 3, nn, b * 3);
          let j = Math.min(nTop, NCROSS - 1);
          while (j > 0 && topD[j - 1] > dd) { topD[j] = topD[j - 1]; topA[j] = topA[j - 1]; j -= 1; }
          topD[j] = dd; topA[j] = ang;
          if (nTop < NCROSS) nTop += 1;
        }
      }
      let sc = 0;
      for (let j = 0; j < nTop; j += 1) if (topA[j] > sc) sc = topA[j];
      const scDeg = sc * DEG;
      seps.push(scDeg);
      const irr = scDeg >= VIS_DEG;
      aAllA += pa; if (irr) { aIrrA += pa; nIrrA += 1; }
      const B = byBucket[bucket];
      B.n += 1; B.area += pa; if (irr) { B.irr += 1; B.irrArea += pa; }
    }
    rec.unscopedN = sampAll.length;
    rec.unscopedIrrPairPct = (nIrrA / sampAll.length) * 100;
    rec.unscopedIrrPairAreaPct = (aIrrA / aAllA) * 100;
    rec.unscopedSepP50 = q(seps, 0.5); rec.unscopedSepP90 = q(seps, 0.9); rec.unscopedSepMax = mx(seps);
    rec.unscopedByBucket = byBucket;
    log(`  ── STAGE 5 UNSCOPED ORACLE on ${sampAll.length} of ${hiEdges.length} >${HI_DEG} deg edges (${pct(sampAll.length, hiEdges.length)}%), NO funnel applied ──`);
    log(`     across-crease turn  p50 ${q(seps, 0.5).toFixed(2)}  p90 ${q(seps, 0.9).toFixed(2)}  MAX ${mx(seps).toFixed(2)} deg`);
    log(`  *** WHOLE >${HI_DEG} deg CLASS IRREDUCIBLE:  PAIRS ${nIrrA}/${sampAll.length} = ${((nIrrA / sampAll.length) * 100).toFixed(2)}%   PAIR-AREA ${((aIrrA / aAllA) * 100).toFixed(2)}% ***`);
    for (const [k2, B] of Object.entries(byBucket)) {
      if (B.n === 0) { log(`       ${k2.padEnd(9)} — empty in this sample`); continue; }
      log(`       ${k2.padEnd(9)} n ${String(B.n).padStart(5)}  irreducible by COUNT ${((B.irr / B.n) * 100).toFixed(2)}%  by PAIR-AREA ${((B.irrArea / B.area) * 100).toFixed(2)}%   (this bucket is ${((B.area / aAllA) * 100).toFixed(2)}% of the sampled class area)`);
    }
    log(`     ${el()}`);
  }

  log(`  [${((Date.now() - T0) / 1000).toFixed(1)}s total]`);
  results.push(rec);
  writeFileSync(`${OUTDIR}/S114_SWEEP_${TAG}_${style}.json`, `${JSON.stringify(rec, null, 2)}\n`);
  writeFileSync(NDJSON, `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
log('  PER-STYLE TABLE — NEVER AVERAGED. Styles differ in KIND, not in degree.');
log('══════════════════════════════════════════════════════════════════════════════════════════════════');
const hdr = ['style', 'facets', 'area mm2', 'PRECOND um', 'dih p50', 'dih p99', 'dih MAX', 'dih A>45%',
  'nd05 p50', 'nd05 p99', 'nd05 MAX', 'nd05 A>1%', 'nd05 A>5%', 'curtain%', 'conf%', 'strad%', 'IRRED%', 'verdict'];
log(hdr.join(' | '));
for (const r of results) {
  if (r.refused === true) { log(`${r.style as string} | ${'REFUSED — PRECOND '}${(r.precondMaxUm as number).toFixed(1)} um`); continue; }
  log([
    r.style as string,
    String(r.facets), (r.areaMm2 as number).toFixed(1), (r.precondMaxUm as number).toFixed(4),
    (r.dihP50 as number).toFixed(2), (r.dihP99 as number).toFixed(2), (r.dihMax as number).toFixed(2),
    (r.dihAreaShareOver45Pct as number).toFixed(4),
    (r.nd05P50 as number).toFixed(3), (r.nd05P99 as number).toFixed(2), (r.nd05Max as number).toFixed(2),
    (r.nd05AreaShareOver1Pct as number).toFixed(3), (r.nd05AreaShareOver5Pct as number).toFixed(3),
    r.curtainPairAreaSharePct === undefined ? 'n/a' : (r.curtainPairAreaSharePct as number).toFixed(2),
    r.conformedPairAreaSharePct === undefined ? 'n/a' : (r.conformedPairAreaSharePct as number).toFixed(2),
    r.straddlePairAreaSharePct === undefined ? 'n/a' : (r.straddlePairAreaSharePct as number).toFixed(2),
    r.oracleIrrLooseAreaPct === undefined ? 'n/a' : (r.oracleIrrLooseAreaPct as number).toFixed(2),
    r.oracleVerdict as string,
  ].join(' | '));
}
writeFileSync(NDJSON, `${results.map((r) => JSON.stringify(r)).join('\n')}\n`);
log('');
log(`wrote ${NDJSON}`);
log(`done ${el()}`);
