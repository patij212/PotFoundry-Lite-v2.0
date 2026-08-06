// s114SweepB.ts — THE ALL-STYLES SWEEP ON THE HONEST RULER, QUARTER B (alphabetical positions 6-10).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE GAP THIS CLOSES. Every STRATA angular number to date is GothicArches. S113 concluded, on Gothic,
// that the >45 deg dihedral class is DOMINATED BY REAL ANALYTIC TURN and not by mesh defect: 99.40% of
// the straddling class's area sits where the analytic surface itself turns >= 45 deg. That conclusion has
// never been tested on another style, and the campaign's own history is that styles differ in KIND
// (smooth / faceted-by-design / layered / anisotropic), not in degree. This tool re-runs the WHOLE S112
// funnel + the S113 oracle, per style, on a canonical mesh per style.
//
// QUARTER B ROSTER, alphabetical by StyleId over the 20 registry keys:
//   1 ArtDeco 2 BambooSegments 3 BasketWeave 4 CelticKnot 5 CelticTriquetra |
//   *** 6 Crystalline 7 DragonScales 8 FourierBloom 9 GeometricStar 10 GothicArches ***  <== MINE
//   11 GyroidManifold 12 HarmonicRipple 13 HexagonalHive 14 LowPolyFacet 15 RippleInterference |
//   16 SpiralRidges 17 SuperellipseMorph 18 SuperformulaBlossom 19 Voronoi 20 WaveInterference
//
// CANONICAL MESH PER STYLE — the mesh the PRIOR SWEEP (s91StyleCensus.ts DEFAULT_STEMS, and the
// S91_CENSUS_ALL20.log it produced) used, so this sweep is comparable to the only other all-20 census
// this campaign has. That is the `_ring_D--` family for 19 styles, and `DS-HT_S39CTL` for GothicArches
// (the campaign reference mesh, 1,142,166 facets, PRECOND 0.0310 um). NOT `gothicarches_ring_D--`, which
// s91 itself flags as a DIFFERENT mesh (overwritten 2026-07-29 at 61,120 facets) carried as a density
// control only.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MEASUREMENT DISCIPLINE — each line answers a scar this lineage has already paid for.
//
//  * PRECOND FIRST, PER MESH, AND A REFUSAL IS A RESULT. max |r_mesh - rA| over a stride sample against
//    STYLE_REGISTRY defaults at H120/Rb40/Rt50. > 50 um => the style is REFUSED and NO analytic number
//    is printed for it. Whole published runs here have been void for exactly this reason.
//  * COUNT + AREA-SHARE + MAX, always, never one alone. Count over-states defect AREA 13-184x here and
//    the two routinely disagree in DIRECTION.
//  * AN OPTION DEFAULT IS A MEASUREMENT CHOICE. `inset` is passed EXPLICITLY everywhere and reported at
//    BOTH 0 and 0.05 (normDeg moves 64x across that range on crease classes). The lattice order k is
//    SWEPT on a spot-check subsample and the convergence printed, never assumed.
//  * PROBE FOOTPRINTS, NOT ENDPOINTS. Every angle is an order-k barycentric COVERING of the footprint;
//    the across-crease turn is the max over the NCROSS CLOSEST cross-flank sample pairs, not two
//    endpoints. Two-point probes have under-read 13x here.
//  * DIFF PRINTED VALUES AGAINST A CONTROL. GothicArches is deliberately IN this quarter and is run
//    through the identical code path as the other four. Its funnel must reproduce S112/S113's pinned
//    19,582 / 13,092 / 5,174 / 3,282 / 69.826 mm2 / 0.1816%, and its oracle must reproduce 99.40%.
//    *** IF THE GOTHIC CONTROL MISSES, EVERY OTHER ROW IN THIS TABLE IS VOID AND IS REPORTED AS VOID. ***
//  * A ONE-SIDED BAR IS VACUOUS. The oracle's smooth-control arm asserts a FLOOR as well as a ceiling:
//    the crease classifier must label <= 5% of SMOOTH wall facets (adjacent dihedral < 2 deg) as
//    crease-bearing (ceiling: it is not manufacturing creases) AND must label >= 50% of the STRADDLING
//    class as crease-bearing (floor: it is not a degenerate always-no).
//  * NEVER AVERAGE ACROSS STYLES. Every verdict is per-style and is stated as CONFIRMS / CONTRADICTS /
//    INCONCLUSIVE with its own numbers beside it.
//
// SAMPLING, STATED WHERE IT IS USED. Whole-mesh honest orientation is 5 rA evals x (k+1)(k+2)/2 lattice
// points per facet per inset — 450 rA evals/facet at k=8 across two insets, i.e. ~5e8 evals on a 1.16 M
// facet mesh. So the DISTRIBUTION stages run on a coprime golden-stride sample (s87/s91 construction) and
// print n and the sampled fraction beside every number. The FUNNEL runs on the WHOLE >45 deg edge class
// when it fits under PF_S114B_ECAP and on a golden-stride sample of it otherwise — which arm was used is
// printed per style, and Gothic's whole class (19,582) fits, so the control is exact.
//
// Usage: bash research/tools/run-s114b-sweep.sh
import { mkdirSync, writeFileSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
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

const DEG = 180 / Math.PI;
const DIR = process.env.PF_S114B_DIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';
const DEFAULT_STEMS = [
  'Crystalline:crystalline_ring_D--',
  'DragonScales:dragonscales_ring_D--',
  'FourierBloom:fourierbloom_ring_D--',
  'GeometricStar:geometricstar_ring_D--',
  'GothicArches:gothicarches_ring_DS-HT_S39CTL',
].join(',');
const STEMS = (process.env.PF_S114B_STEMS ?? DEFAULT_STEMS).split(',').map((s) => s.trim()).filter((s) => s.length > 0);
const STAGE = process.env.PF_S114B_STAGE ?? 'full';         // 'recon' = cheap sizing pass only
const TAG = process.env.PF_S114B_TAG ?? 'B';
const OUTDIR = 'research/exchange/_strataConformBisect/s114sweep';

const DIMS: StyleDims = { H: envF('PF_S114B_H', 120), Rb: envF('PF_S114B_RB', 40), Rt: envF('PF_S114B_RT', 50), expn: 1 };
const H = DIMS.H;
const PRECOND_UM = envF('PF_S114B_PRECOND_UM', 50);          // REFUSAL threshold
const HI_DEG = envF('PF_S114B_HI_DEG', 45);                  // S108's visibility cut
const CURTAIN_RATIO = envF('PF_S114B_CURTAIN', 8);           // S112's WALL / CURTAIN split
const DROP_CUT = envF('PF_S114B_DROP', 0.25);                // S112's CONFORMED / STRADDLING split
const NORMHI_MIN = envF('PF_S114B_NORMHI', 10);              // S112's straddle floor, deg
const INSET_LO = envF('PF_S114B_INSET_LO', 0);
const INSET_HI = envF('PF_S114B_INSET_HI', 0.05);
const K = envI('PF_S114B_K', 8);                             // s87/S112 lattice order
const NSAMP = envI('PF_S114B_N', 20000);                     // normDeg distribution sample
const KLAD_N = envI('PF_S114B_KLADN', 300);                  // k-ladder spot-check subsample
const KLADDER = (process.env.PF_S114B_KLADDER ?? '4,8,12,16,24').split(',').map(Number);
const ECAP = envI('PF_S114B_ECAP', 30000);                   // cap on the >45 deg edge funnel
const OCAP = envI('PF_S114B_OCAP', 700);                     // cap on oracle pairs
const K_LAT = envI('PF_S114B_KLAT', 12);                     // s113opOracle's flank-decomposition order
const SEP_MIN = envF('PF_S114B_SEPMIN', 15);                 // deg: a flank split must beat this
const NCROSS = envI('PF_S114B_NCROSS', 8);                   // closest cross-flank pairs for the turn
const CTLN = envI('PF_S114B_CTLN', 600);                     // smooth-control size
const H_FD = envF('PF_S114B_HFD', 2e-4);

const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.6 / 1000,
};

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;
const NDJSON = `${OUTDIR}/S114_SWEEP_${TAG}.ndjson`;

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

const q = (v: ArrayLike<number>, p: number): number => {
  const s = Array.from(v).filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: ArrayLike<number>): number => {
  let m = -Infinity;
  for (let i = 0; i < v.length; i += 1) if (Number.isFinite(v[i]) && v[i] > m) m = v[i];
  return m;
};
/** AREA-weighted quantile: the p-th percentile of the area distribution, not of the count distribution. */
function qArea(vals: number[], areas: number[], p: number): number {
  const idx = vals.map((_, i) => i).filter((i) => Number.isFinite(vals[i])).sort((a, b) => vals[a] - vals[b]);
  let tot = 0;
  for (const i of idx) tot += areas[i];
  let acc = 0;
  for (const i of idx) { acc += areas[i]; if (acc >= p * tot) return vals[i]; }
  return idx.length === 0 ? NaN : vals[idx[idx.length - 1]];
}
/** Coprime golden stride over [0, n) — s87/s91's construction, deterministic and gap-free. */
function goldenStride(n: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let gs = Math.max(1, Math.round(n * 0.6180339887498949) | 1);
  while (gs > 1 && gcd(gs, n) !== 1) gs += 2;
  return gs >= n ? 1 : gs;
}

log('===================================================================================================');
log('  S114-B — ALL-STYLES SWEEP ON THE HONEST RULER, QUARTER B (Crystalline .. GothicArches)');
log('===================================================================================================');
log(`dims H${DIMS.H} Rb${DIMS.Rb} Rt${DIMS.Rt} expn${DIMS.expn ?? 1}   stage ${STAGE}`);
log(`cuts: dihedral>${HI_DEG}deg  graphRatio<=${CURTAIN_RATIO}  drop>=${DROP_CUT}  normHi>${NORMHI_MIN}deg  insets ${INSET_LO}/${INSET_HI}  k=${K}`);
log(`caps: normDeg sample ${NSAMP}   >45 funnel ${ECAP}   oracle pairs ${OCAP}   k-ladder ${KLADDER.join('/')} on ${KLAD_N}`);
log(`GOTHIC CONTROL (pinned S112/S113): funnel 19582 / 13092 / 5174 / 3282, target 69.826 mm2 = 0.1816%, oracle 99.40% irreducible`);
log('');

interface StyleRow { [k: string]: unknown }
const allRows: StyleRow[] = [];

for (const spec of STEMS) {
  const [STYLE, stem] = spec.split(':');
  const STL = `${DIR}/${stem}.stl`;
  const t0 = Date.now();
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${STYLE}   ${stem} ═════`);
  const row: StyleRow = { ts: new Date().toISOString(), style: STYLE, stem, stl: STL };

  if (!existsSync(STL)) { log(`  *** MISSING STL: ${STL} — style SKIPPED ***`); row.status = 'MISSING'; allRows.push(row); continue; }
  const defs = registryDefaults(STYLE);
  log(`  registry defaults: ${Object.entries(defs).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  row.registryDefaults = defs;

  const rAbase = buildRadiusFn(STYLE as StyleId, { ...defs }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

  const M = readMeshFloat64(STL, false);
  const xyz = M.xyz; const nTri = M.nTri;
  log(`  ${nTri} facets loaded   ${el()}`);

  // ── PRECOND. A refusal is a RESULT, and it happens BEFORE any analytic number is computed. ──────────
  let precondUm = 0;
  {
    let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
    let nS = 0;
    for (let f = 0; f < nTri; f += step) {
      nS += 1;
      for (let k = 0; k < 3; k += 1) {
        const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
        const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        if (dd > worst) worst = dd;
      }
    }
    precondUm = worst * 1000;
    log(`  *** PRECOND radial MAX |r_mesh - rA| = ${precondUm.toFixed(4)} um   over ${nS} facets (stride ${step})   [Gothic reads 0.0310] ***`);
  }
  row.precondUm = precondUm;
  if (precondUm > PRECOND_UM) {
    log(`  *** REFUSED: PRECOND ${precondUm.toFixed(3)} um > ${PRECOND_UM} um. params/dims mismatch — EVERY analytic number for this style would be void. ***`);
    row.status = 'REFUSED';
    allRows.push(row); appendFileSync(NDJSON, `${JSON.stringify(row)}\n`);
    continue;
  }
  row.status = 'MEASURED';

  // ── DIHEDRAL (analytic-free) ───────────────────────────────────────────────────────────────────────
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  const perDeg = new Float64Array(nTri);
  for (let f = 0; f < nTri; f += 1) perDeg[f] = d.perFacetMaxRad[f] * DEG;
  let hiN = 0; let hiA = 0;
  for (let f = 0; f < nTri; f += 1) if (perDeg[f] > HI_DEG) { hiN += 1; hiA += d.areaMm2[f]; }
  const perArr = Array.from(perDeg); const areaArr = Array.from(d.areaMm2);
  log(`  AREA total ${meshArea.toFixed(2)} mm2   interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  nonmanifold ${d.nonManifoldEdges}  inconsistent-winding ${d.inconsistentEdges}`);
  log('  ── DIHEDRAL (facetDihedrals, analytic-free, per-facet MAX over its edges) ──');
  log(`     by COUNT  p50 ${q(perDeg, 0.5).toFixed(3)}  p99 ${q(perDeg, 0.99).toFixed(3)}  MAX ${mx(perDeg).toFixed(3)} deg`);
  log(`     by AREA   p50 ${qArea(perArr, areaArr, 0.5).toFixed(3)}  p99 ${qArea(perArr, areaArr, 0.99).toFixed(3)} deg`);
  log(`     over ${HI_DEG} deg:  COUNT ${hiN} (${((100 * hiN) / nTri).toFixed(4)}%)   AREA ${hiA.toFixed(4)} mm2 (${((100 * hiA) / meshArea).toFixed(4)}%)`);
  let hiEdges = 0;
  for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] * DEG > HI_DEG) hiEdges += 1;
  log(`     interior EDGES over ${HI_DEG} deg: ${hiEdges} (${((100 * hiEdges) / d.interiorEdges).toFixed(4)}% of interior edges)`);
  Object.assign(row, {
    nTri, meshAreaMm2: meshArea, interiorEdges: d.interiorEdges, boundaryEdges: d.boundaryEdges,
    nonManifoldEdges: d.nonManifoldEdges, inconsistentEdges: d.inconsistentEdges,
    dihP50: q(perDeg, 0.5), dihP99: q(perDeg, 0.99), dihMax: mx(perDeg),
    dihP50Area: qArea(perArr, areaArr, 0.5), dihP99Area: qArea(perArr, areaArr, 0.99),
    hiFacetN: hiN, hiFacetPct: (100 * hiN) / nTri, hiFacetAreaMm2: hiA, hiFacetAreaPct: (100 * hiA) / meshArea,
    hiEdges, hiEdgePct: (100 * hiEdges) / d.interiorEdges,
  });

  if (STAGE === 'recon') {
    log(`  [recon only] ${el()}  (${((Date.now() - t0) / 1000).toFixed(1)}s for this mesh)`);
    allRows.push(row); appendFileSync(NDJSON, `${JSON.stringify(row)}\n`);
    continue;
  }

  // ── SHARED GEOMETRY HELPERS ────────────────────────────────────────────────────────────────────────
  const nsKink = fdNormals(rA, H, H_FD, H_FD);
  const scratch = new Float64Array(12);
  const th3 = (f: number): [number, number, number] => {
    const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
    const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
    const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
    return [a, b, c];
  };
  const argsOf = (f: number): [number, number, number, number, number, number, number, number, number, number, number, number] => {
    const [ath, bth, cth] = th3(f);
    return [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth];
  };
  const normDegOf = (f: number, inset: number, kk: number): number =>
    orientOfFacet(nsKink, ...argsOf(f), { k: kk, inset, orient: 'winding', scratch }).normDeg;
  function graphRatio(f: number): number {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const [ath, bth, cth] = th3(f);
    const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
    return aP > 1e-15 ? a3 / aP : Infinity;
  }
  const centroid = (f: number): [number, number, number] => {
    let cx = 0; let cy = 0; let cz = 0;
    for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
    return [cx / 3, cy / 3, cz / 3];
  };
  const sharedEndpoints = (e: number): number[] | null => {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e]; const out: number[] = [];
    for (let a = 0; a < 3; a += 1) {
      const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
      for (let b = 0; b < 3; b += 1) {
        if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
      }
    }
    return out.length === 6 ? out : null;
  };

  // ── normDeg DISTRIBUTION on a golden-stride sample, at BOTH insets ──────────────────────────────────
  {
    const gs = goldenStride(nTri);
    const nS = Math.min(NSAMP, nTri);
    const v0: number[] = []; const v5: number[] = []; const ar: number[] = [];
    let sampA = 0;
    for (let i = 0; i < nS; i += 1) {
      const f = (i * gs) % nTri;
      const a = argsOf(f);
      v0.push(orientOfFacet(nsKink, ...a, { k: K, inset: INSET_LO, orient: 'winding', scratch }).normDeg);
      v5.push(orientOfFacet(nsKink, ...a, { k: K, inset: INSET_HI, orient: 'winding', scratch }).normDeg);
      ar.push(d.areaMm2[f]); sampA += d.areaMm2[f];
      if ((i + 1) % 5000 === 0) log(`     normDeg sample ${i + 1}/${nS}  ${el()}`);
    }
    log(`  ── normDeg (orientOfFacet, kink-aware fdNormals, WINDING, k=${K}) on n=${nS} = ${((100 * nS) / nTri).toFixed(3)}% of facets, ${((100 * sampA) / meshArea).toFixed(3)}% of area ──`);
    for (const [nm, v, ins] of [['inset 0.00', v0, INSET_LO], ['inset 0.05', v5, INSET_HI]] as Array<[string, number[], number]>) {
      let o1n = 0; let o1a = 0; let o5n = 0; let o5a = 0;
      for (let i = 0; i < v.length; i += 1) {
        if (v[i] > 1) { o1n += 1; o1a += ar[i]; }
        if (v[i] > 5) { o5n += 1; o5a += ar[i]; }
      }
      log(`     ${nm}  p50 ${q(v, 0.5).toFixed(4)}  p90 ${q(v, 0.9).toFixed(4)}  p99 ${q(v, 0.99).toFixed(4)}  MAX ${mx(v).toFixed(3)} deg`);
      log(`        over 1 deg: COUNT ${o1n} (${((100 * o1n) / v.length).toFixed(4)}%)  AREA-share ${((100 * o1a) / sampA).toFixed(4)}%`);
      log(`        over 5 deg: COUNT ${o5n} (${((100 * o5n) / v.length).toFixed(4)}%)  AREA-share ${((100 * o5a) / sampA).toFixed(4)}%`);
      const pre = ins === INSET_LO ? 'nd0' : 'nd5';
      Object.assign(row, {
        [`${pre}P50`]: q(v, 0.5), [`${pre}P90`]: q(v, 0.9), [`${pre}P99`]: q(v, 0.99), [`${pre}Max`]: mx(v),
        [`${pre}Over1N`]: o1n, [`${pre}Over1Pct`]: (100 * o1n) / v.length, [`${pre}Over1AreaPct`]: (100 * o1a) / sampA,
        [`${pre}Over5N`]: o5n, [`${pre}Over5Pct`]: (100 * o5n) / v.length, [`${pre}Over5AreaPct`]: (100 * o5a) / sampA,
      });
    }
    row.ndSampleN = nS; row.ndSampleAreaPct = (100 * sampA) / meshArea;
    // area-weighted, because a count percentile and an area percentile disagree in DIRECTION here
    log(`     inset 0.05 by AREA:  p50 ${qArea(v5, ar, 0.5).toFixed(4)}  p90 ${qArea(v5, ar, 0.9).toFixed(4)}  p99 ${qArea(v5, ar, 0.99).toFixed(4)} deg`);
    row.nd5P50Area = qArea(v5, ar, 0.5); row.nd5P99Area = qArea(v5, ar, 0.99);
  }

  // ── k-LADDER SPOT CHECK. Never assume the lattice order; show it converging. ────────────────────────
  {
    const gs = goldenStride(nTri);
    const nS = Math.min(KLAD_N, nTri);
    const lad: Array<{ k: number; p50: number; p90: number; max: number }> = [];
    for (const kk of KLADDER) {
      const v: number[] = [];
      for (let i = 0; i < nS; i += 1) v.push(normDegOf((i * gs) % nTri, INSET_HI, kk));
      lad.push({ k: kk, p50: q(v, 0.5), p90: q(v, 0.9), max: mx(v) });
    }
    log(`  ── k-LADDER (inset ${INSET_HI}, n=${nS}) — normDeg is a LOWER bound in k, so it must rise and flatten ──`);
    for (const L of lad) log(`     k=${String(L.k).padStart(2)}  p50 ${L.p50.toFixed(4)}  p90 ${L.p90.toFixed(4)}  MAX ${L.max.toFixed(3)}`);
    const k8 = lad.find((L) => L.k === K); const kTop = lad[lad.length - 1];
    if (k8 !== undefined) {
      log(`     k=${K} vs k=${kTop.k}:  p50 x${(kTop.p50 / Math.max(1e-12, k8.p50)).toFixed(4)}   p90 x${(kTop.p90 / Math.max(1e-12, k8.p90)).toFixed(4)}   MAX x${(kTop.max / Math.max(1e-12, k8.max)).toFixed(4)}   <== how much k=${K} UNDER-READS`);
    }
    row.kLadder = lad;
  }

  // ── THE S112 FUNNEL over the >45 deg edge class ─────────────────────────────────────────────────────
  const hiEdgeIdx: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] * DEG > HI_DEG) hiEdgeIdx.push(e);
  if (hiEdgeIdx.length === 0) {
    // NOT A GAP — A RESULT. A style with no >45 deg interior edge at all has no visible class for S108's
    // test to flag, so the S112 funnel and the S113 oracle have an EMPTY domain and every downstream
    // question about it is vacuous rather than unanswered. Reported, then the style is closed out.
    log(`  ── S112 FUNNEL: the >${HI_DEG} deg edge class is EMPTY on this mesh (max dihedral ${mx(perDeg).toFixed(3)} deg). ──`);
    log('     The S108 visible class does not exist here, so the S112 funnel and the S113 oracle are VACUOUS, not unmeasured.');
    Object.assign(row, {
      funnelMode: 'EMPTY', funnelExamined: 0, hiClassFacets: 0, hiClassAreaMm2: 0, hiClassAreaPct: 0,
      funnel: null, targetPairs: 0, targetFacets: 0, targetAreaMm2: 0, targetAreaPct: 0, oracle: null,
    });
    log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s for this mesh]   ${el()}`);
    allRows.push(row); appendFileSync(NDJSON, `${JSON.stringify(row)}\n`);
    continue;
  }
  let funnelIdx = hiEdgeIdx; let funnelFrac = 1; let funnelMode = 'WHOLE';
  if (hiEdgeIdx.length > ECAP) {
    const gs = goldenStride(hiEdgeIdx.length);
    const pick: number[] = [];
    for (let i = 0; i < ECAP; i += 1) pick.push(hiEdgeIdx[(i * gs) % hiEdgeIdx.length]);
    funnelIdx = pick; funnelFrac = ECAP / hiEdgeIdx.length; funnelMode = `SAMPLED ${ECAP}/${hiEdgeIdx.length}`;
  }
  log(`  ── S112 FUNNEL over the >${HI_DEG} deg edge class  (${funnelMode}, scale-up x${(1 / funnelFrac).toFixed(3)})  ${el()} ──`);

  const bucketOf: string[] = [];
  const stradPairs: Array<{ e: number; f1: number; f2: number; normHi: number; normLo: number; drop: number; measDeg: number }> = [];
  let nCurtain = 0; let nConf = 0; let nLow = 0; let nStrad = 0;
  const areaOfBucket = new Map<string, Set<number>>();
  for (const b of ['CURTAIN', 'CONFORMED', 'LOW', 'STRADDLING']) areaOfBucket.set(b, new Set<number>());
  for (let i = 0; i < funnelIdx.length; i += 1) {
    const e = funnelIdx[i];
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    let b: string;
    let normHi = NaN; let normLo = NaN; let drop = NaN;
    if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) { b = 'CURTAIN'; nCurtain += 1; }
    else {
      normHi = Math.max(normDegOf(f1, INSET_HI, K), normDegOf(f2, INSET_HI, K));
      normLo = Math.max(normDegOf(f1, INSET_LO, K), normDegOf(f2, INSET_LO, K));
      drop = normLo > 1e-9 ? normHi / normLo : 1;
      if (drop < DROP_CUT) { b = 'CONFORMED'; nConf += 1; }
      else if (!(normHi > NORMHI_MIN)) { b = 'LOW'; nLow += 1; }
      else {
        b = 'STRADDLING'; nStrad += 1;
        stradPairs.push({ e, f1, f2, normHi, normLo, drop, measDeg: d.edgeAngRad[e] * DEG });
      }
    }
    bucketOf.push(b);
    (areaOfBucket.get(b) as Set<number>).add(f1); (areaOfBucket.get(b) as Set<number>).add(f2);
    if ((i + 1) % 5000 === 0) log(`     funnel ${i + 1}/${funnelIdx.length}  ${el()}`);
  }
  const areaSum = (s: Set<number>): number => { let a = 0; for (const f of s) a += d.areaMm2[f]; return a; };
  const classFacets = new Set<number>();
  for (const e of funnelIdx) { classFacets.add(d.edgeF1[e]); classFacets.add(d.edgeF2[e]); }
  const classArea = areaSum(classFacets);
  // THE SAMPLED ARM'S ARITHMETIC, STATED. When the funnel is sampled, a bucket's raw mm2 covers only the
  // sampled edges, so `% of mesh` taken raw would be UNDER-STATED by ~funnelFrac. The unbiased quantity is
  // the RATIO within the sampled class; it is rescaled onto the WHOLE class's area (known exactly from the
  // whole-mesh dihedral pass, `hiA`) and every rescaled number is labelled EST. On a WHOLE arm the two
  // coincide identically, which is checked on Gothic.
  const scale = hiA / classArea;
  log(`     >${HI_DEG} deg pairs examined ${funnelIdx.length}   unique facets ${classFacets.size}   AREA ${classArea.toFixed(4)} mm2 (scored arm) ; WHOLE class ${hiA.toFixed(4)} mm2 = ${((100 * hiA) / meshArea).toFixed(4)}% of mesh   [area scale-up x${scale.toFixed(4)}]`);
  const fun: Record<string, { n: number; facets: number; area: number; areaPctOfClass: number; areaPctOfMeshEst: number }> = {};
  for (const [b, n] of [['CURTAIN', nCurtain], ['CONFORMED', nConf], ['LOW', nLow], ['STRADDLING', nStrad]] as Array<[string, number]>) {
    const s = areaOfBucket.get(b) as Set<number>;
    const a = areaSum(s);
    fun[b] = { n, facets: s.size, area: a, areaPctOfClass: (100 * a) / classArea, areaPctOfMeshEst: (100 * a * scale) / meshArea };
    log(`     ${b.padEnd(11)} PAIRS ${String(n).padStart(7)} (${((100 * n) / funnelIdx.length).toFixed(2)}%)   facets ${String(s.size).padStart(7)}   AREA ${a.toFixed(4)} mm2 = ${((100 * a) / classArea).toFixed(2)}% of class = ${((100 * a * scale) / meshArea).toFixed(4)}% of mesh${funnelMode === 'WHOLE' ? '' : ' (EST)'}`);
  }
  Object.assign(row, {
    funnelMode, funnelExamined: funnelIdx.length, funnelFrac,
    hiClassFacets: classFacets.size, hiClassAreaMm2: classArea, hiClassAreaPct: (100 * classArea) / meshArea,
    funnel: fun,
  });

  // ── crease-labelling (S109/S110) on the STRADDLING pairs, to reproduce S112's TARGET SET ────────────
  const target: typeof stradPairs = [];
  for (const p of stradPairs) {
    const pt = sharedEndpoints(p.e); if (pt === null) continue;
    const thE = Math.atan2(pt[1], pt[0]);
    const kEdge = locateKinkRaw(rA, thE, pt[2], thE + dThRaw(thE, Math.atan2(pt[4], pt[3])), pt[5], PRED);
    const c1 = centroid(p.f1); const c2 = centroid(p.f2);
    const thC = Math.atan2(c1[1], c1[0]);
    const kSeg = locateKinkRaw(rA, thC, c1[2], thC + dThRaw(thC, Math.atan2(c2[1], c2[0])), c2[2], PRED);
    const onEdge = kEdge !== null && !kEdge.jump;
    const onSeg = kSeg !== null && !kSeg.jump;
    if (onEdge || onSeg) target.push(p);
  }
  const targetF = new Set<number>();
  for (const p of target) { targetF.add(p.f1); targetF.add(p.f2); }
  const targetArea = areaSum(targetF);
  log(`     ... AND crease-labelled (locateKinkRaw, !jump)   PAIRS ${target.length}   facets ${targetF.size}   AREA ${targetArea.toFixed(4)} mm2 = ${((100 * targetArea * scale) / meshArea).toFixed(4)}% of mesh${funnelMode === 'WHOLE' ? '' : ' (EST)'}   <== THE TARGET SET`);
  Object.assign(row, {
    targetPairs: target.length, targetFacets: targetF.size,
    targetAreaMm2: targetArea, targetAreaPct: (100 * targetArea * scale) / meshArea,
    targetAreaPctRaw: (100 * targetArea) / meshArea, areaScaleUp: scale,
  });
  if (STYLE === 'GothicArches' && funnelMode === 'WHOLE') {
    log(`     *** GOTHIC CONTROL: pinned 19582 / 13092(wall) / 5174(strad) / 3282(target), 69.826 mm2, 0.1816% ***`);
    log(`     *** THIS RUN     : ${hiEdgeIdx.length} / ${nConf + nLow + nStrad} / ${nStrad} / ${target.length}, ${targetArea.toFixed(3)} mm2, ${((100 * targetArea) / meshArea).toFixed(4)}% ***`);
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  // THE S113 ORACLE — is the >45 class REAL ANALYTIC TURN or MESH DEFECT?
  // ══════════════════════════════════════════════════════════════════════════════════════════════════
  interface Samp { n: Float64Array; pth: Float64Array; pz: Float64Array; m: number }
  function sampleFacet(f: number, k: number, inset: number, ns: NormalSampler): Samp {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    const rRef = (Math.hypot(xyz[f * 9], xyz[f * 9 + 1]) + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4])
      + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
    const cap = ((k + 1) * (k + 2)) / 2;
    const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
    const sh = 1 - inset; const sc = inset / 3;
    let m = 0;
    for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
      const wa = sh * (i / k) + sc; const wb = sh * (j / k) + sc; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = ns(th, z, scratch);
      for (let qi = 0; qi < nc; qi += 1) {
        n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
        pth[m] = rRef * th; pz[m] = z; m += 1;
      }
    }
    return { n, pth, pz, m };
  }
  const angU = (a: Float64Array, ai: number, b: Float64Array, bi: number): number => {
    let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    return Math.acos(dp);
  };
  interface Split { lab: Int8Array; c: Float64Array; sepRad: number; wA: number; wB: number; nA: number; nB: number }
  function twoMeans(n: Float64Array, m: number): Split {
    const lab = new Int8Array(m); const c = new Float64Array(6);
    if (m === 0) return { lab, c, sepRad: 0, wA: 0, wB: 0, nA: 0, nB: 0 };
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
    return { lab, c, sepRad: nA > 0 && nB > 0 ? angU(c, 0, c, 3) : 0, wA, wB, nA, nB };
  }
  const nsMain = fdNormals(rA, H, H_FD, H_FD);
  /** s113opOracle STAGE 3, verbatim in construction: the across-crease turn over a PAIR's footprints. */
  function pairTurn(f1: number, f2: number): { sepCentDeg: number; sepCreaseDeg: number; gapMm: number; crease: boolean } {
    const s1 = sampleFacet(f1, K_LAT, 0, nsMain); const s2 = sampleFacet(f2, K_LAT, 0, nsMain);
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
    return {
      sepCentDeg, sepCreaseDeg: sepCrease * DEG, gapMm: gap,
      crease: sepCentDeg >= SEP_MIN && minSide >= 2 && sepCentDeg > Math.max(sp.wA, sp.wB) * DEG,
    };
  }
  /** single-footprint crease label, for the smooth control arm. */
  function facetCrease(f: number): boolean {
    const s = sampleFacet(f, K_LAT, 0, nsMain);
    const sp = twoMeans(s.n, s.m);
    const minSide = Math.min(sp.nA, sp.nB);
    return sp.sepRad * DEG >= SEP_MIN && minSide >= 2 && sp.sepRad > Math.max(sp.wA, sp.wB);
  }

  if (target.length === 0) {
    log('  ── S113 ORACLE: the target set is EMPTY on this style — no straddling crease class to price. ──');
    row.oracle = null;
  } else {
    let oPairs = target;
    let oMode = 'WHOLE';
    if (target.length > OCAP) {
      const gs = goldenStride(target.length);
      oPairs = []; for (let i = 0; i < OCAP; i += 1) oPairs.push(target[(i * gs) % target.length]);
      oMode = `SAMPLED ${OCAP}/${target.length}`;
    }
    log(`  ── S113 ORACLE on the target set (${oMode}, K_LAT=${K_LAT}, NCROSS=${NCROSS}, sepMin=${SEP_MIN})  ${el()} ──`);
    const turns = oPairs.map((p, i) => {
      if ((i + 1) % 200 === 0) log(`     oracle ${i + 1}/${oPairs.length}  ${el()}`);
      return pairTurn(p.f1, p.f2);
    });
    const sc = turns.map((t) => t.sepCreaseDeg);
    log(`     sep from CLUSTER CENTRES  p10 ${q(turns.map((t) => t.sepCentDeg), 0.1).toFixed(2)} p50 ${q(turns.map((t) => t.sepCentDeg), 0.5).toFixed(2)} p90 ${q(turns.map((t) => t.sepCentDeg), 0.9).toFixed(2)} MAX ${mx(turns.map((t) => t.sepCentDeg)).toFixed(2)} deg`);
    log(`     sep AT THE CREASE (closest ${NCROSS} cross-flank pairs)  p10 ${q(sc, 0.1).toFixed(2)} p50 ${q(sc, 0.5).toFixed(2)} p90 ${q(sc, 0.9).toFixed(2)} MAX ${mx(sc).toFixed(2)} deg`);
    log(`     probe parameter gap  p50 ${q(turns.map((t) => t.gapMm), 0.5).toExponential(2)} p90 ${q(turns.map((t) => t.gapMm), 0.9).toExponential(2)} mm`);
    // IRREDUCIBLE = the analytic surface itself turns >= HI_DEG across a genuine crease in this footprint
    const irr = turns.map((t) => t.sepCreaseDeg >= HI_DEG);
    const nIrr = irr.filter(Boolean).length;
    const anyIrr = new Map<number, boolean>(); const allIrr = new Map<number, boolean>();
    for (let i = 0; i < oPairs.length; i += 1) for (const f of [oPairs[i].f1, oPairs[i].f2]) {
      anyIrr.set(f, (anyIrr.get(f) ?? false) || irr[i]);
      allIrr.set(f, (allIrr.get(f) ?? true) && irr[i]);
    }
    const oF = new Set<number>();
    for (const p of oPairs) { oF.add(p.f1); oF.add(p.f2); }
    let oArea = 0; let aLoose = 0; let aStrict = 0; let nLoose = 0; let nStrict = 0; let ties = 0;
    for (const f of oF) {
      oArea += d.areaMm2[f];
      if (anyIrr.get(f) === true) { aLoose += d.areaMm2[f]; nLoose += 1; }
      if (allIrr.get(f) === true) { aStrict += d.areaMm2[f]; nStrict += 1; }
      if ((anyIrr.get(f) === true) !== (allIrr.get(f) === true)) ties += 1;
    }
    log('     ════════════════════════════════════════════════════════════════════════════════════════');
    log(`     PAIRS  IRREDUCIBLE ${nIrr}/${oPairs.length} = ${((100 * nIrr) / oPairs.length).toFixed(2)}%     REDUCIBLE ${oPairs.length - nIrr} = ${((100 * (oPairs.length - nIrr)) / oPairs.length).toFixed(2)}%`);
    log(`     AREA   IRREDUCIBLE (loose, any-pair)  COUNT ${nLoose}  AREA ${aLoose.toFixed(4)} mm2 = ${((100 * aLoose) / oArea).toFixed(2)}% of scored target = ${((100 * aLoose) / meshArea).toFixed(4)}% of mesh`);
    log(`            IRREDUCIBLE (strict, all-pair) COUNT ${nStrict}  AREA ${aStrict.toFixed(4)} mm2 = ${((100 * aStrict) / oArea).toFixed(2)}% of scored target`);
    log(`            ambiguous facets (pairs disagree) ${ties}`);
    log(`     AREA   REDUCIBLE (loose complement) ${(oArea - aLoose).toFixed(4)} mm2 = ${((100 * (oArea - aLoose)) / oArea).toFixed(2)}% of scored target = ${((100 * (oArea - aLoose) * scale * (targetArea / oArea)) / meshArea).toFixed(4)}% of mesh (EST, rescaled onto the whole target set and the whole >45 class)`);
    if (STYLE === 'GothicArches') log('     *** GOTHIC CONTROL: S113-OP4 read 94.46% of pairs / 99.40% of AREA irreducible ***');
    // ── CONTROLS. Two-sided: a ceiling AND a floor, because a one-sided bar is vacuous. ───────────────
    const smooth: number[] = [];
    {
      const gs = goldenStride(nTri);
      for (let i = 0; i < nTri && smooth.length < CTLN; i += 1) {
        const f = (i * gs) % nTri;
        if (perDeg[f] < 2 && graphRatio(f) <= CURTAIN_RATIO) smooth.push(f);
      }
    }
    const ctlCrease = smooth.filter((f) => facetCrease(f)).length;
    const stradF = Array.from(targetF).slice(0, CTLN);
    const stradCrease = stradF.filter((f) => facetCrease(f)).length;
    const ctlPct = smooth.length > 0 ? (100 * ctlCrease) / smooth.length : NaN;
    const floorPct = stradF.length > 0 ? (100 * stradCrease) / stradF.length : NaN;
    log(`     CONTROL ceiling: smooth wall facets (dihedral<2deg) labelled crease-bearing ${ctlCrease}/${smooth.length} = ${ctlPct.toFixed(2)}%  (VOIDS the run if > 5%)`);
    log(`     CONTROL floor  : target facets labelled crease-bearing ${stradCrease}/${stradF.length} = ${floorPct.toFixed(2)}%  (VACUOUS if < 50%)`);
    const voided = Number.isFinite(ctlPct) && ctlPct > 5;
    const vacuous = Number.isFinite(floorPct) && floorPct < 50;
    if (voided) log('     *** CONTROL CEILING FIRED — the classifier is manufacturing creases. THIS STYLE\'S ORACLE IS VOID. ***');
    if (vacuous) log('     *** CONTROL FLOOR FIRED — the classifier is a degenerate always-no. THIS STYLE\'S ORACLE IS VACUOUS. ***');
    row.oracle = {
      mode: oMode, pairs: oPairs.length, scoredFacets: oF.size, scoredAreaMm2: oArea,
      irrPairs: nIrr, irrPairPct: (100 * nIrr) / oPairs.length,
      irrAreaLoosePct: (100 * aLoose) / oArea, irrAreaStrictPct: (100 * aStrict) / oArea,
      redAreaMm2Scored: oArea - aLoose,
      redAreaPctOfMeshEst: (100 * (oArea - aLoose) * scale * (targetArea / oArea)) / meshArea,
      sepCreaseP10: q(sc, 0.1), sepCreaseP50: q(sc, 0.5), sepCreaseP90: q(sc, 0.9), sepCreaseMax: mx(sc),
      ctlSmoothCreasePct: ctlPct, ctlFloorCreasePct: floorPct, voided, vacuous,
    };
  }

  log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s for this mesh]   ${el()}`);
  allRows.push(row);
  appendFileSync(NDJSON, `${JSON.stringify(row)}\n`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE TABLE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('');
log('===================================================================================================');
log('  S114-B PER-STYLE TABLE  (never averaged across styles — styles differ in KIND, not degree)');
log('===================================================================================================');
const pad = (s: unknown, n: number): string => String(s).padStart(n);
log('style              facets   area mm2  PRE um  dih p50   p99    MAX   >45 area%  nd5 p50  p99   MAX   >1deg A%  >5deg A%');
for (const r of allRows) {
  if (r.status !== 'MEASURED') { log(`${String(r.style).padEnd(18)} ${String(r.status)}  PRECOND ${r.precondUm === undefined ? 'n/a' : (r.precondUm as number).toFixed(3)} um`); continue; }
  const nf = (v: unknown, dp: number, w: number): string => pad(typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : '-', w);
  log(`${String(r.style).padEnd(18)}${pad(r.nTri, 8)} ${nf(r.meshAreaMm2, 1, 10)} ${nf(r.precondUm, 4, 7)} ${nf(r.dihP50, 2, 7)} ${nf(r.dihP99, 2, 7)} ${nf(r.dihMax, 1, 6)} ${nf(r.hiFacetAreaPct, 4, 9)} ${nf(r.nd5P50, 3, 8)} ${nf(r.nd5P99, 2, 6)} ${nf(r.nd5Max, 1, 6)} ${nf(r.nd5Over1AreaPct, 3, 9)} ${nf(r.nd5Over5AreaPct, 3, 9)}`);
}
log('');
log('style              >45 pairs  CURTAIN%  CONFORMED%  LOW%  STRADDLING%   target pairs  target area%  IRR pair%  IRR area%');
for (const r of allRows) {
  if (r.status !== 'MEASURED') continue;
  if (r.funnel === undefined || r.funnel === null) { log(`${String(r.style).padEnd(18)}         0   — the >45 deg class is EMPTY; the funnel and the oracle are VACUOUS on this style —`); continue; }
  const f = r.funnel as Record<string, { n: number; area: number }>;
  const tot = r.funnelExamined as number;
  const o = r.oracle as { irrPairPct: number; irrAreaLoosePct: number } | null;
  log(`${String(r.style).padEnd(18)}${pad(tot, 10)} ${pad(((100 * f.CURTAIN.n) / tot).toFixed(2), 9)} ${pad(((100 * f.CONFORMED.n) / tot).toFixed(2), 11)} ${pad(((100 * f.LOW.n) / tot).toFixed(2), 5)} ${pad(((100 * f.STRADDLING.n) / tot).toFixed(2), 12)} ${pad(r.targetPairs, 13)} ${pad((r.targetAreaPct as number).toFixed(4), 13)} ${pad(o === null ? 'n/a' : o.irrPairPct.toFixed(2), 10)} ${pad(o === null ? 'n/a' : o.irrAreaLoosePct.toFixed(2), 10)}`);
}
writeFileSync(`${OUTDIR}/S114_SWEEP_${TAG}.json`, `${JSON.stringify({
  tag: TAG, dims: DIMS, cuts: { HI_DEG, CURTAIN_RATIO, DROP_CUT, NORMHI_MIN, INSET_LO, INSET_HI, K, K_LAT, SEP_MIN, NCROSS },
  caps: { NSAMP, ECAP, OCAP, KLAD_N, KLADDER, CTLN }, dir: DIR, rows: allRows,
}, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_SWEEP_${TAG}.json  and  ${NDJSON}`);
log(`done ${el()}`);
