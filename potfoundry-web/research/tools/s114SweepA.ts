// s114SweepA.ts — S114 QUARTER A: THE ALL-STYLES SWEEP ON THE HONEST RULER.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. Every STRATA number to date is GothicArches. S113 concluded, ON GOTHIC, that the >45 deg adjacent
// dihedral class is dominated by REAL ANALYTIC TURN rather than mesh defect (99.40% of the straddling
// class's area sits where the analytic surface itself turns >= 45 deg). This tool asks whether that
// generalises. It is a CENSUS, not an operator: nothing is flipped, split or snapped.
//
// QUARTER A (alphabetical by style id, first 5 of the 20-style S91 roster):
//   ArtDeco, BambooSegments, BasketWeave, CelticKnot, CelticTriquetra
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED BEFORE THE FIRST NUMBER WAS READ.
//
//  PR-A1 (the generalisation question). For each style, IRREDUCIBLE-BY-AREA within its own STRADDLING
//        class. CONFIRMS Gothic if >= 60% (S113's own PR1 kill line, reused verbatim so the comparison
//        is like-for-like). CONTRADICTS if < 60%. INCONCLUSIVE if the class is too small to estimate
//        (< 30 straddling pairs) or the mesh was refused.
//        *** NEVER AVERAGED ACROSS STYLES. *** Each style stands or falls alone.
//
//  PR-A2 (the S112 scoping generalises). Report, per style, the four-way split of the >45 deg edge class:
//        CURTAIN (graphRatio > 8, the analytic ruler is not defined there) / ACCURATE (normHi <= 10 deg,
//        the S113 94.83% bucket) / CONFORMED (inset-drop < 0.25) / STRADDLING.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS — a run whose control fires is VOID and is reported as void, never rescued.
//
//  C1  PRECOND. max |r_mesh - rA| over a stride sample, registry defaults, H120/Rb40/Rt50/expn1.
//      *** > 50 um => REFUSE THE MESH AND EXIT. *** Set PF_S114_DIAG=1 to continue in an explicitly
//      labelled [VOID-DIAG] mode; every downstream line is then prefixed and is NOT admissible.
//      The full distribution AND the exceedance census are printed either way, because a params
//      mismatch (whole distribution moves) and an rA DISCONTINUITY (isolated spikes on a flat p99)
//      are different failures and only the census tells them apart.
//
//  C2  CLASSIFIER CONTROLS, THREE OF THEM, TWO-SIDED.
//      *** HISTORY, RECORDED BECAUSE IT CHANGED THE INSTRUMENT. *** The control originally
//      pre-registered here was "wall PAIRS whose shared-edge dihedral is < 2 deg must be <= 5%
//      crease-labelled". IT FIRED ON THE GOTHIC ANCHOR at 7.4% (37/500), with a max analytic turn of
//      166.87 deg inside a "smooth" pair. The classifier was not at fault: the control's PREMISE is
//      false. On a crease-CONFORMED mesh two facets can flank the same crease near-symmetrically and
//      read a small MUTUAL dihedral while their union footprint contains the full turn — which is
//      S113's own 94.83% phenomenon (normDeg ~2 deg while rendering a p50 159.76 deg dihedral) read
//      backwards. A control built on a false premise is not evidence about the classifier, so it is
//      demoted to a CHARACTERISATION and the voiding gate is moved to a real placebo:
//        C2a  S113's OWN control, verbatim: SINGLE facets with perFacetMaxRad < 2 deg, graphRatio <= 8,
//             not in the straddling set. Reported so this sweep is comparable to S113 line-for-line.
//        C2b  *** THE PLACEBO, AND THE VOIDING GATE. *** The identical classifier, on the identical
//             target footprints, against a provably C-infinity analytic (the bare truncated cone
//             r = Rb + (Rt-Rb)*z/H). A classifier that manufactures creases out of curvature or out of
//             facet shape will label these too. It must label ~0%. This is the arm that separates
//             "the crease is in the surface" from "the crease is in my instrument".
//        C2c  THE FLOOR. The target class itself must come out substantially crease-bearing. A
//             one-sided bar is satisfied by a degenerate answer; C2b and C2c bracket it from both ends.
//
//  C3  DIHEDRAL RECONCILIATION. The >45 deg edge population is derived twice — once from
//      `facetDihedrals`' edge list, once from the per-facet max — and the facet sets must agree.
//
//  C4  WINDING. `facetDihedrals` measures AS WOUND. The inverted-facet census over the class is printed
//      alongside a sign-corrected dihedral, because comparing an as-wound dihedral to an analytic turn
//      without that audit is exactly how S97/S98 mislabelled a census.
//
// INSTRUMENT DISCIPLINE
//  * COUNT + AREA-SHARE + MAX everywhere. Never a bare count, never a bare max.
//  * `inset` is passed EXPLICITLY and SWEPT {0, 0.02, 0.05, 0.1}. It is a measurement choice, not a
//    default: normDeg moves 64x across 0 -> 0.05 on crease classes.
//  * lattice order k is SWEPT {4,8,12,16} on a subsample and the convergence is printed, not assumed.
//  * FOOTPRINTS, NOT ENDPOINTS: every angle is taken over an order-k barycentric lattice; the
//    across-crease turn comes from the closest cross-flank sample PAIRS, not from two endpoints.
//  * Whole-mesh normDeg is a GOLDEN-STRIDE SAMPLE (620 rA evals/facet is not affordable at 2.5 M facets).
//    Sample size, sample area coverage and the resulting estimator are printed so the reader can price
//    the sampling error. Everything that is cheap (dihedral, area, graphRatio, curtain split) is
//    EXHAUSTIVE.
//
// Usage: bash research/tools/run-s114-sweep-a.sh   (env PF_S114_STYLE / PF_S114_STL / PF_S114_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, radialNormal, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));

const STYLE = process.env.PF_S114_STYLE ?? 'ArtDeco';
const STL = process.env.PF_S114_STL ?? '';
const TAG = process.env.PF_S114_TAG ?? STYLE;
const DIAG = process.env.PF_S114_DIAG === '1';
const OUTDIR = process.env.PF_S114_OUTDIR ?? 'research/exchange/_strataConformBisect/s114sweepA';

const DIMS: StyleDims = { H: envF('PF_S114_H', 120), Rb: envF('PF_S114_RB', 40), Rt: envF('PF_S114_RT', 50), expn: 1 };
const H = DIMS.H;

const HI_DEG = envF('PF_S114_HI_DEG', 45);          // S108's visibility cut
const CURTAIN_RATIO = envF('PF_S114_CURTAIN', 8);   // S112's WALL/CURTAIN split on graphRatio
const DROP_CUT = envF('PF_S114_DROP', 0.25);        // S112's CONFORMED/STRADDLING split on inset-drop
const NORMHI_BAR = envF('PF_S114_NORMHI', 10);      // S112's straddling normDeg floor, deg
const K_OBS = envI('PF_S114_K', 8);                 // the campaign's lattice order for normDeg
const INSET_LO = envF('PF_S114_INSET_LO', 0);
const INSET_HI = envF('PF_S114_INSET_HI', 0.05);
const INSETS = (process.env.PF_S114_INSETS ?? '0,0.02,0.05,0.1').split(',').map(Number);
const KLADDER = (process.env.PF_S114_KLADDER ?? '4,8,12,16').split(',').map(Number);
const NSAMP = envI('PF_S114_N', 20000);             // whole-mesh normDeg golden-stride sample
const NKLAD = envI('PF_S114_NKLAD', 400);           // k-ladder subsample
const HI_SCOPE_CAP = envI('PF_S114_HICAP', 24000);  // max WALL >45 edges scoped with orientOfFacet
const ORACLE_CAP = envI('PF_S114_ORACLE_N', 900);   // max straddling pairs put through the oracle
const CTL_N = envI('PF_S114_CTLN', 500);            // smooth-control pair count
const K_LAT_MUT = { v: envI('PF_S114_KLAT', 10) };             // oracle flank-decomposition lattice order
const SEP_MIN = envF('PF_S114_SEPMIN', 15);         // deg: a flank split must beat this to be a crease
const NCROSS = envI('PF_S114_NCROSS', 8);           // closest cross-flank pairs used for the crease turn
const H_FD = envF('PF_S114_HFD', 2e-4);
const DEG = 180 / Math.PI;

if (STL.length === 0) { log('*** PF_S114_STL is required (ABSOLUTE path). ***'); process.exit(2); }

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

const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.6 / 1000,
};

const DEFAULTS = registryDefaults(STYLE);
const rAbase = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsObs = fdNormals(rA, H, 2e-4, 2e-4);
const nsMain = fdNormals(rA, H, H_FD, H_FD);
const scratch = new Float64Array(12);

const OUT: Record<string, unknown> = { style: STYLE, tag: TAG, stl: STL, dims: DIMS, registryDefaults: DEFAULTS };

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S114-A — ALL-STYLES SWEEP ON THE HONEST RULER — ${STYLE}  (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl   ${STL}`);
log(`dims  H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`registry defaults: ${Object.entries(DEFAULTS).map(([k, v]) => `${k}=${v}`).join(' ')}`);
log(`cuts  dihedral>${HI_DEG}deg  graphRatio<=${CURTAIN_RATIO}  drop>=${DROP_CUT}  normHi>${NORMHI_BAR}deg  k=${K_OBS}  insets ${INSETS.join('/')}`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 0 — LOAD + PRECOND (C1)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`loaded ${nTri} facets  ${el()}`);

let PRECOND_REFUSED = false;
{
  const step = Math.max(1, Math.floor(nTri / 20000));
  const devs: number[] = [];
  const over: Array<{ f: number; k: number; dUm: number; z: number; thDeg: number }> = [];
  let worst = 0;
  for (let f = 0; f < nTri; f += step) {
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const th = Math.atan2(y, x);
      const dd = Math.abs(Math.hypot(x, y) - rA(th, z));
      devs.push(dd);
      if (dd > worst) worst = dd;
      if (dd * 1000 > 50 && over.length < 4000) over.push({ f, k, dUm: dd * 1000, z, thDeg: (th * DEG + 360) % 360 });
    }
  }
  const um = devs.map((v) => v * 1000);
  log('── STAGE 0 / CONTROL C1: PRECOND  max |r_mesh - rA| (registry defaults, stride sample) ──');
  log(`  samples ${um.length} (stride ${step} facets, 3 verts each)`);
  log(`  |dr|  p50 ${q(um, 0.5).toExponential(3)}  p99 ${q(um, 0.99).toExponential(3)}  p999 ${q(um, 0.999).toExponential(3)}  MAX ${q(um, 1).toExponential(4)} um`);
  log(`  *** PRECOND MAX = ${(worst * 1000).toFixed(4)} um  ***   (Gothic S39CTL reads 0.0310 um; gate = 50 um)`);
  log(`  exceedances over 50 um: ${over.length} of ${um.length} samples = ${pct(over.length, um.length)}%`);
  OUT.precond = {
    maxUm: worst * 1000, p50Um: q(um, 0.5), p99Um: q(um, 0.99), p999Um: q(um, 0.999),
    samples: um.length, exceed50: over.length, exceedFrac: over.length / um.length,
  };
  if (over.length > 0) {
    log(`     exceedance |dr| p50 ${q(over.map((o) => o.dUm), 0.5).toFixed(1)} MAX ${mx(over.map((o) => o.dUm)).toFixed(1)} um`);
    log(`     exceedance z    p10 ${q(over.map((o) => o.z), 0.1).toFixed(2)} p50 ${q(over.map((o) => o.z), 0.5).toFixed(2)} p90 ${q(over.map((o) => o.z), 0.9).toFixed(2)} mm`);
    log(`     first 6: ${over.slice(0, 6).map((o) => `f${o.f}v${o.k} ${o.dUm.toFixed(1)}um z=${o.z.toFixed(3)} th=${o.thDeg.toFixed(3)}`).join(' | ')}`);
    log('     READ: a params/dims MISMATCH moves the WHOLE distribution (p50 large). ISOLATED spikes on a');
    log('     tiny p99 are an rA DISCONTINUITY the stride sample happened to land on. Both refuse; only');
    log('     the census says which, and only the first invalidates the style params.');
    // *** DECISIVE PROBE, not an assertion. *** Walk rA across theta and z through the exceedance point.
    // A DISCONTINUITY shows a step of order the exceedance that does not shrink as the step shrinks;
    // a params mismatch shows a smooth rA that simply sits at the wrong radius everywhere.
    log('     JUMP PROBE at the 3 worst exceedances — rA across theta and z, step ladder:');
    const worst3 = over.slice().sort((a, b) => b.dUm - a.dUm).slice(0, 3);
    const jumps: Array<Record<string, number>> = [];
    for (const o of worst3) {
      const x = xyz[o.f * 9 + o.k * 3]; const y = xyz[o.f * 9 + o.k * 3 + 1]; const z = o.z;
      const th = Math.atan2(y, x); const rM = Math.hypot(x, y);
      const parts: string[] = [];
      let maxJumpTh = 0; let maxJumpZ = 0;
      for (const hh of [1e-2, 1e-3, 1e-4, 1e-5, 1e-6]) {
        const dth = hh / Math.max(1e-9, rM);
        const jt = Math.abs(rA(th + dth, z) - rA(th - dth, z)) * 1000;
        const jz = Math.abs(rA(th, Math.min(H, z + hh)) - rA(th, Math.max(0, z - hh))) * 1000;
        parts.push(`h=${hh.toExponential(0)}: dTh ${jt.toFixed(1)} dZ ${jz.toFixed(1)}`);
        maxJumpTh = Math.max(maxJumpTh, jt); maxJumpZ = Math.max(maxJumpZ, jz);
      }
      log(`       f${o.f}v${o.k} |dr|=${o.dUm.toFixed(1)}um  r_mesh=${rM.toFixed(6)} rA=${rA(th, z).toFixed(6)} mm`);
      log(`          rA jump across the point (um): ${parts.join('  |  ')}`);
      jumps.push({ f: o.f, drUm: o.dUm, jumpThUm: maxJumpTh, jumpZUm: maxJumpZ });
    }
    log('       A jump that DOES NOT SHRINK with h is a genuine rA DISCONTINUITY (the analytic surface is');
    log('       multi-valued/stepped there). A jump that shrinks ~linearly in h means rA is continuous and');
    log('       the deviation is a PARAMS/DIMS MISMATCH — which would void the style outright.');
    (OUT.precond as Record<string, unknown>).jumpProbe = jumps;
  }
  if (worst * 1000 > 50) {
    PRECOND_REFUSED = true;
    log('');
    log('  ██████████████████████████████████████████████████████████████████████████████████████████████');
    log(`  ██  *** MESH REFUSED: PRECOND ${(worst * 1000).toFixed(2)} um > 50 um. ***`);
    log('  ██  A params/dims mismatch silently voids every analytic number. THIS IS A RESULT, NOT A GAP.');
    log('  ██████████████████████████████████████████████████████████████████████████████████████████████');
    OUT.verdict = 'REFUSED-PRECOND';
    if (!DIAG) {
      writeFileSync(`${OUTDIR}/S114A_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
      log(`\nwrote ${OUTDIR}/S114A_${TAG}.json`);
      log('  (set PF_S114_DIAG=1 to continue in an explicitly labelled [VOID-DIAG] mode)');
      process.exit(0);
    }
    log('  PF_S114_DIAG=1 — continuing. EVERY LINE BELOW IS PREFIXED [VOID-DIAG] AND IS NOT ADMISSIBLE.');
  }
  log('');
}
const P = PRECOND_REFUSED ? '[VOID-DIAG] ' : '';

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 1 — DIHEDRAL (analytic-free, EXHAUSTIVE)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`${P}── STAGE 1: DIHEDRAL DISTRIBUTION (facetDihedrals — analytic-free, EXHAUSTIVE)  ${el()} ──`);
log(`${P}  facets ${nTri}   AREA ${meshArea.toFixed(3)} mm2`);
log(`${P}  edges: interior ${d.interiorEdges}  boundary ${d.boundaryEdges}  non-manifold ${d.nonManifoldEdges}  inconsistent-winding ${d.inconsistentEdges}`);
const edgeDeg: number[] = [];
for (let e = 0; e < d.edgeAngRad.length; e += 1) edgeDeg.push(d.edgeAngRad[e] * DEG);
const facetDeg: number[] = [];
for (let f = 0; f < nTri; f += 1) facetDeg.push(d.perFacetMaxRad[f] * DEG);
const hiThr = (HI_DEG * Math.PI) / 180;
let areaOver45 = 0; let cntOver45 = 0;
for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) { areaOver45 += d.areaMm2[f]; cntOver45 += 1; }
log(`${P}  EDGE dihedral   p50 ${q(edgeDeg, 0.5).toFixed(3)}  p99 ${q(edgeDeg, 0.99).toFixed(3)}  MAX ${q(edgeDeg, 1).toFixed(3)} deg`);
log(`${P}  FACET max-dihedral p50 ${q(facetDeg, 0.5).toFixed(3)}  p99 ${q(facetDeg, 0.99).toFixed(3)}  MAX ${q(facetDeg, 1).toFixed(3)} deg`);
log(`${P}  OVER ${HI_DEG} deg:  edges ${edgeDeg.filter((v) => v > HI_DEG).length} (${pct(edgeDeg.filter((v) => v > HI_DEG).length, edgeDeg.length)}% of interior edges)`);
log(`${P}                 facets COUNT ${cntOver45} (${pct(cntOver45, nTri)}%)   *** AREA ${areaOver45.toFixed(4)} mm2 = ${pct(areaOver45, meshArea)}% of mesh ***   MAX ${q(facetDeg, 1).toFixed(2)} deg`);
OUT.stage1 = {
  facets: nTri, areaMm2: meshArea, interiorEdges: d.interiorEdges, boundaryEdges: d.boundaryEdges,
  nonManifoldEdges: d.nonManifoldEdges, inconsistentEdges: d.inconsistentEdges,
  edgeDihP50: q(edgeDeg, 0.5), edgeDihP99: q(edgeDeg, 0.99), edgeDihMax: q(edgeDeg, 1),
  facetDihP50: q(facetDeg, 0.5), facetDihP99: q(facetDeg, 0.99), facetDihMax: q(facetDeg, 1),
  hiEdges: edgeDeg.filter((v) => v > HI_DEG).length, hiFacets: cntOver45,
  hiAreaMm2: areaOver45, hiAreaPct: (areaOver45 / meshArea) * 100,
};
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
function orientArgs(f: number): [number, number, number, number, number, number, number, number, number, number, number, number] {
  const [ath, bth, cth] = th3(f);
  return [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
    xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth];
}
const normDegOf = (f: number, inset: number, k = K_OBS): number =>
  orientOfFacet(nsObs, ...orientArgs(f), { k, inset, orient: 'winding', scratch }).normDeg;
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
const sharedEndpoints = (e: number): number[] | null => {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e]; const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
  }
  return out.length === 6 ? out : null;
};
const centroidOf = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
/** The PLACEBO analytic: a provably C-infinity truncated cone at the same scale. Nothing on it is a crease. */
const rFlat = (_th: number, z: number): number => DIMS.Rb + (DIMS.Rt - DIMS.Rb) * (Math.min(H, Math.max(0, z)) / H);
/** golden-stride index sequence over [0,n): distinct, low-discrepancy, order-independent of the mesh. */
function goldenStride(n: number, want: number): number[] {
  if (want >= n) return Array.from({ length: n }, (_, i) => i);
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  let g = Math.max(1, Math.round(n * 0.6180339887498949));
  while (gcd(g, n) !== 1) g += 1;
  const out: number[] = [];
  for (let i = 0; i < want; i += 1) out.push((i * g) % n);
  return out;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 2 — WHOLE-MESH normDeg (golden-stride SAMPLE; insets and k SWEPT)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const samp = goldenStride(nTri, Math.min(NSAMP, nTri));
let sampArea = 0;
for (const f of samp) sampArea += d.areaMm2[f];
log(`${P}── STAGE 2: WHOLE-MESH normDeg (orientOfFacet, kink-aware fdNormals, winding), k=${K_OBS} ──`);
log(`${P}  GOLDEN-STRIDE SAMPLE n=${samp.length} = ${pct(samp.length, nTri)}% of facets, holding ${sampArea.toFixed(2)} mm2 = ${pct(sampArea, meshArea)}% of area`);
log(`${P}  (all shares below are SAMPLE estimates of the mesh share; count percentiles are UNWEIGHTED)`);
const nd: Record<string, number[]> = {};
const s2: Record<string, unknown> = { n: samp.length, sampAreaMm2: sampArea, sampAreaPct: (sampArea / meshArea) * 100 };
for (const ins of INSETS) {
  const t = Date.now();
  const v: number[] = [];
  for (const f of samp) v.push(normDegOf(f, ins));
  nd[String(ins)] = v;
  let a1 = 0; let a5 = 0; let c1 = 0; let c5 = 0;
  for (let i = 0; i < samp.length; i += 1) {
    if (v[i] > 1) { a1 += d.areaMm2[samp[i]]; c1 += 1; }
    if (v[i] > 5) { a5 += d.areaMm2[samp[i]]; c5 += 1; }
  }
  log(`${P}  inset ${ins.toFixed(3)}  p50 ${q(v, 0.5).toFixed(3)}  p90 ${q(v, 0.9).toFixed(3)}  p99 ${q(v, 0.99).toFixed(3)}  MAX ${q(v, 1).toFixed(3)} deg`);
  log(`${P}            over 1 deg: COUNT ${c1} (${pct(c1, samp.length)}%)  AREA ${pct(a1, sampArea)}%   |   over 5 deg: COUNT ${c5} (${pct(c5, samp.length)}%)  AREA ${pct(a5, sampArea)}%   [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  s2[`inset${ins}`] = {
    p50: q(v, 0.5), p90: q(v, 0.9), p99: q(v, 0.99), max: q(v, 1),
    over1Count: c1, over1CountPct: (c1 / samp.length) * 100, over1AreaPct: (a1 / sampArea) * 100,
    over5Count: c5, over5CountPct: (c5 / samp.length) * 100, over5AreaPct: (a5 / sampArea) * 100,
  };
}
// k-LADDER spot check — convergence SHOWN, never assumed
{
  const sub = goldenStride(samp.length, Math.min(NKLAD, samp.length)).map((i) => samp[i]);
  log(`${P}  k-LADDER spot check on n=${sub.length} of the same sample, inset ${INSET_HI}:`);
  const lad: Record<string, unknown> = {};
  let prev: number[] | null = null;
  for (const kk of KLADDER) {
    const v = sub.map((f) => normDegOf(f, INSET_HI, kk));
    const rel = prev === null ? NaN : q(v.map((x, i) => (prev as number[])[i] > 1e-9 ? x / (prev as number[])[i] : 1), 0.5);
    log(`${P}     k=${String(kk).padStart(3)}  p50 ${q(v, 0.5).toFixed(4)}  p90 ${q(v, 0.9).toFixed(4)}  MAX ${q(v, 1).toFixed(3)} deg   median ratio vs previous k: ${Number.isFinite(rel) ? rel.toFixed(4) : '—'}`);
    lad[`k${kk}`] = { p50: q(v, 0.5), p90: q(v, 0.9), max: q(v, 1), medRatioVsPrev: rel };
    prev = v;
  }
  s2.kLadder = lad;
}
OUT.stage2 = s2;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 3 — THE >45 DEG CLASS AND THE S112 SCOPING
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const hiEdges: number[] = [];
for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] > hiThr) hiEdges.push(e);
// C3 — reconcile the edge-derived facet set against the per-facet max
{
  const fromEdges = new Set<number>();
  for (const e of hiEdges) { fromEdges.add(d.edgeF1[e]); fromEdges.add(d.edgeF2[e]); }
  let mismatch = 0;
  for (let f = 0; f < nTri; f += 1) if ((d.perFacetMaxRad[f] > hiThr) !== fromEdges.has(f)) mismatch += 1;
  log(`${P}── STAGE 3: THE >${HI_DEG} DEG CLASS — S112 SCOPING  ${el()} ──`);
  log(`${P}  CONTROL C3 (edge-derived vs per-facet-max facet sets): mismatched facets ${mismatch}  ${mismatch === 0 ? 'OK' : '*** CONTROL FIRED ***'}`);
  OUT.c3mismatch = mismatch;
}
// CURTAIN split — EXHAUSTIVE, no rA evals
const grCache = new Map<number, number>();
const grOf = (f: number): number => { let v = grCache.get(f); if (v === undefined) { v = graphRatio(f); grCache.set(f, v); } return v; };
const curtainE: number[] = []; const wallE: number[] = [];
for (const e of hiEdges) {
  if (grOf(d.edgeF1[e]) > CURTAIN_RATIO || grOf(d.edgeF2[e]) > CURTAIN_RATIO) curtainE.push(e); else wallE.push(e);
}
const areaOfSet = (fs: Iterable<number>): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
const facetsOfEdges = (es: number[]): Set<number> => { const s = new Set<number>(); for (const e of es) { s.add(d.edgeF1[e]); s.add(d.edgeF2[e]); } return s; };
const curtainF = facetsOfEdges(curtainE); const wallF = facetsOfEdges(wallE);
const curtainA = areaOfSet(curtainF); const wallA = areaOfSet(wallF);
log(`${P}  >${HI_DEG} deg interior edges: ${hiEdges.length}`);
log(`${P}    CURTAIN (graphRatio > ${CURTAIN_RATIO}; the analytic ruler is NOT DEFINED there)`);
log(`${P}       edges ${curtainE.length} (${pct(curtainE.length, hiEdges.length)}%)  facets ${curtainF.size}  AREA ${curtainA.toFixed(4)} mm2 = ${pct(curtainA, areaOver45)}% of the >45 class = ${pct(curtainA, meshArea)}% of mesh`);
log(`${P}    WALL    edges ${wallE.length} (${pct(wallE.length, hiEdges.length)}%)  facets ${wallF.size}  AREA ${wallA.toFixed(4)} mm2 = ${pct(wallA, areaOver45)}% of the >45 class = ${pct(wallA, meshArea)}% of mesh`);
// *** CURTAIN_RATIO IS AN OPTION DEFAULT, THEREFORE A MEASUREMENT CHOICE. SWEEP IT. ***
{
  const ladder = [2, 4, 8, 16, 32, 128, Infinity];
  log(`${P}    graphRatio LADDER — how much of the verdict the CURTAIN_RATIO default is carrying:`);
  const gl: Array<Record<string, number>> = [];
  for (const R of ladder) {
    const we: number[] = [];
    for (const e of hiEdges) if (!(grOf(d.edgeF1[e]) > R || grOf(d.edgeF2[e]) > R)) we.push(e);
    const wa = areaOfSet(facetsOfEdges(we));
    log(`${P}       ratio > ${String(R).padStart(8)} => CURTAIN;  WALL edges ${String(we.length).padStart(8)} (${pct(we.length, hiEdges.length).padStart(8)}%)  WALL area ${pct(wa, areaOver45).padStart(8)}% of the >45 class`);
    gl.push({ ratio: R === Infinity ? -1 : R, wallEdges: we.length, wallEdgePct: (we.length / Math.max(1, hiEdges.length)) * 100, wallAreaPctOfClass: (wa / Math.max(1e-30, areaOver45)) * 100 });
  }
  OUT.curtainLadder = gl;
  const grHi = hiEdges.map((e) => Math.max(grOf(d.edgeF1[e]), grOf(d.edgeF2[e])));
  log(`${P}    graphRatio over the >45 class (max of the pair): p10 ${q(grHi, 0.1).toFixed(3)} p50 ${q(grHi, 0.5).toFixed(3)} p90 ${q(grHi, 0.9).toFixed(3)} MAX ${q(grHi, 1).toExponential(2)}`);
}
// What normDeg READS on the curtain class — ill-conditioned by construction, printed so it cannot hide.
if (curtainE.length > 0) {
  const cs = goldenStride(curtainE.length, Math.min(1500, curtainE.length)).map((i) => curtainE[i]);
  const v: number[] = []; let a1 = 0; let aAll = 0;
  for (const e of cs) {
    for (const f of [d.edgeF1[e], d.edgeF2[e]]) {
      const nvv = normDegOf(f, INSET_HI);
      v.push(nvv); aAll += d.areaMm2[f]; if (nvv > 1) a1 += d.areaMm2[f];
    }
  }
  log(`${P}    [ILL-CONDITIONED, REPORTED NOT SCORED] normDeg on the CURTAIN class, n=${v.length} facets from ${cs.length} sampled edges, inset ${INSET_HI}:`);
  log(`${P}       p50 ${q(v, 0.5).toFixed(3)}  p90 ${q(v, 0.9).toFixed(3)}  p99 ${q(v, 0.99).toFixed(3)}  MAX ${q(v, 1).toFixed(3)} deg   over 1 deg AREA ${pct(a1, aAll)}%`);
  OUT.curtainNormDeg = { n: v.length, p50: q(v, 0.5), p90: q(v, 0.9), p99: q(v, 0.99), max: q(v, 1), over1AreaPct: (a1 / Math.max(1e-30, aAll)) * 100 };
  // ── STAGE 3b — THE ONE INSTRUMENT THAT IS DEFINED AT A CLIFF. ────────────────────────────────────
  // `orientOfFacet` needs the (theta,z) GRAPH to be well-conditioned, which is exactly what fails on a
  // near-vertical relief face. `locateKinkRaw` does not: it walks rA along the segment and sets `jump`
  // when it finds a genuine DISCONTINUITY rather than a C0 crease. So on the CURTAIN class the S113
  // question — "is this >45 deg edge REAL GEOMETRY or MESH DEFECT?" — can still be asked, in the only
  // form available: does the edge sit on a locus where rA itself is discontinuous or kinked?
  //   jump=true  => the analytic surface really is a CLIFF here => the >45 dihedral is CORRECT GEOMETRY.
  //   kink,no jump => a C0 crease => also correct geometry.
  //   nothing found => the analytic is smooth across it => a genuine MESH-SIDE defect.
  const cs2 = goldenStride(curtainE.length, Math.min(900, curtainE.length)).map((i) => curtainE[i]);
  let nJump = 0; let nKink = 0; let nNone = 0;
  let aJump = 0; let aKink = 0; let aNone = 0;
  for (const e of cs2) {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const a = d.areaMm2[f1] + d.areaMm2[f2];
    const p = sharedEndpoints(e);
    let k = null as ReturnType<typeof locateKinkRaw>;
    if (p !== null) {
      const thE = Math.atan2(p[1], p[0]);
      k = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
    }
    if (k === null) {
      const c1 = centroidOf(f1); const c2 = centroidOf(f2);
      const thC = Math.atan2(c1[1], c1[0]);
      k = locateKinkRaw(rA, thC, c1[2], thC + dThRaw(thC, Math.atan2(c2[1], c2[0])), c2[2], PRED);
    }
    if (k === null) { nNone += 1; aNone += a; } else if (k.jump) { nJump += 1; aJump += a; } else { nKink += 1; aKink += a; }
  }
  const aT = aJump + aKink + aNone;
  log(`${P}    >>> STAGE 3b — THE CURTAIN CLASS ON THE ONE RULER THAT IS DEFINED AT A CLIFF (locateKinkRaw):`);
  log(`${P}        n=${cs2.length} sampled curtain edges. Is the >${HI_DEG} deg edge REAL GEOMETRY or MESH DEFECT?`);
  log(`${P}        rA JUMP (a genuine cliff => CORRECT GEOMETRY)   COUNT ${nJump} (${pct(nJump, cs2.length)}%)  AREA ${pct(aJump, aT)}%`);
  log(`${P}        rA KINK, no jump (C0 crease => CORRECT GEOMETRY) COUNT ${nKink} (${pct(nKink, cs2.length)}%)  AREA ${pct(aKink, aT)}%`);
  log(`${P}        NEITHER (analytic smooth across it => MESH DEFECT) COUNT ${nNone} (${pct(nNone, cs2.length)}%)  AREA ${pct(aNone, aT)}%`);
  log(`${P}        => CORRECT-GEOMETRY share of the curtain class: COUNT ${pct(nJump + nKink, cs2.length)}%  *** AREA ${pct(aJump + aKink, aT)}% ***`);
  OUT.stage3b = {
    n: cs2.length, jump: nJump, kink: nKink, none: nNone,
    jumpAreaPct: (aJump / Math.max(1e-30, aT)) * 100, kinkAreaPct: (aKink / Math.max(1e-30, aT)) * 100,
    noneAreaPct: (aNone / Math.max(1e-30, aT)) * 100,
    correctGeometryAreaPct: ((aJump + aKink) / Math.max(1e-30, aT)) * 100,
  };
  // PLACEBO for 3b: the identical segments against the C-infinity cone. locateKinkRaw must find nothing.
  {
    let pJ = 0; let pK = 0;
    for (const e of cs2) {
      const p = sharedEndpoints(e); if (p === null) continue;
      const thE = Math.atan2(p[1], p[0]);
      const k = locateKinkRaw(rFlat, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
      if (k !== null) { if (k.jump) pJ += 1; else pK += 1; }
    }
    const fired = (pJ + pK) / Math.max(1, cs2.length) > 0.05;
    log(`${P}        PLACEBO (same ${cs2.length} segments, C-infinity cone): jump ${pJ} kink ${pK} = ${pct(pJ + pK, cs2.length)}%  ${fired ? '*** 3b PLACEBO FIRED — locateKinkRaw manufactures loci. 3b IS VOID. ***' : 'OK'}`);
    (OUT.stage3b as Record<string, unknown>).placeboPct = ((pJ + pK) / Math.max(1, cs2.length)) * 100;
    (OUT.stage3b as Record<string, unknown>).placeboFired = fired;
  }
  // ── STAGE 3c — DOES THE ANALYTIC ITSELF TURN >=45 DEG ACROSS THE CURTAIN EDGES? ──────────────────
  // 3b can only say whether the edge sits on a KINK/JUMP locus. It CANNOT distinguish "mesh defect"
  // from "smooth but so steep that the surface genuinely turns >45 deg inside the footprint" — and on
  // a relief style that distinction is the whole answer. So run S113's ORACLE on the curtain class too.
  //
  // THE CONDITIONING OBJECTION, MET HEAD-ON. S112 excluded these facets because the (theta,z) lattice is
  // ill-conditioned on a near-vertical wall. That is a claim about SAMPLING, and sampling claims are
  // settled by a convergence ladder, not by exclusion: if the measured analytic turn is stable in K, the
  // lattice resolves the footprint and the number stands. The ladder is printed. If it does NOT converge,
  // the curtain class is genuinely unmeasurable by this instrument and I say so instead of quoting it.
  {
    const cs3 = goldenStride(curtainE.length, Math.min(300, curtainE.length)).map((i) => curtainE[i]);
    log(`${P}    >>> STAGE 3c — THE ORACLE ON THE CURTAIN CLASS, n=${cs3.length}, with a K-CONVERGENCE LADDER:`);
    const kl = [6, 10, 16, 24];
    let last: number[] = [];
    for (const kk of kl) {
      const saveK = K_LAT_MUT.v; K_LAT_MUT.v = kk;
      const turns: number[] = []; let aIrr = 0; let aTot = 0; let nIrr = 0;
      for (const e of cs3) {
        const o = oraclePair(d.edgeF1[e], d.edgeF2[e]);
        const a = d.areaMm2[d.edgeF1[e]] + d.areaMm2[d.edgeF2[e]];
        turns.push(o.sepCreaseDeg); aTot += a; if (o.irr) { aIrr += a; nIrr += 1; }
      }
      K_LAT_MUT.v = saveK;
      const rel = last.length === 0 ? NaN : q(turns.map((x, i) => (last[i] > 1e-9 ? x / last[i] : 1)), 0.5);
      log(`${P}       K=${String(kk).padStart(2)}  analytic turn p50 ${q(turns, 0.5).toFixed(2)} p90 ${q(turns, 0.9).toFixed(2)} MAX ${q(turns, 1).toFixed(2)} deg   IRREDUCIBLE COUNT ${pct(nIrr, cs3.length)}%  *** AREA ${pct(aIrr, aTot)}% ***   median ratio vs prev K ${Number.isFinite(rel) ? rel.toFixed(4) : '—'}`);
      last = turns;
      if (kk === 16) OUT.stage3c = { n: cs3.length, K: kk, turnP50: q(turns, 0.5), turnP90: q(turns, 0.9), turnMax: q(turns, 1), irrCountPct: (nIrr / cs3.length) * 100, irrAreaPct: (aIrr / Math.max(1e-30, aTot)) * 100 };
    }
    log(`${P}       READ: a stable AREA column across K means the lattice RESOLVES these footprints and the`);
    log(`${P}       number stands. A drifting one means the curtain class is unmeasurable by this ruler.`);
  }
}

// The CONFORMED / STRADDLING split needs orientOfFacet — sample the WALL edges if the class is huge.
const wallScope = wallE.length > HI_SCOPE_CAP ? goldenStride(wallE.length, HI_SCOPE_CAP).map((i) => wallE[i]) : wallE;
const SCOPE_SAMPLED = wallScope.length < wallE.length;
log(`${P}    scoping ${wallScope.length} of ${wallE.length} WALL edges with orientOfFacet${SCOPE_SAMPLED ? '  *** GOLDEN-STRIDE SAMPLE — shares below are estimates ***' : '  (EXHAUSTIVE)'}`);
const ndHi = new Map<number, number>(); const ndLo = new Map<number, number>();
const getHi = (f: number): number => { let v = ndHi.get(f); if (v === undefined) { v = normDegOf(f, INSET_HI); ndHi.set(f, v); } return v; };
const getLo = (f: number): number => { let v = ndLo.get(f); if (v === undefined) { v = normDegOf(f, INSET_LO); ndLo.set(f, v); } return v; };
interface WEdge { e: number; f1: number; f2: number; measDeg: number; normHi: number; normLo: number; drop: number; cls: string }
const wrows: WEdge[] = [];
{
  const t = Date.now();
  for (let i = 0; i < wallScope.length; i += 1) {
    const e = wallScope[i];
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    const normHi = Math.max(getHi(f1), getHi(f2));
    const normLo = Math.max(getLo(f1), getLo(f2));
    const drop = normLo > 1e-9 ? normHi / normLo : 1;
    const cls = normHi <= NORMHI_BAR ? 'ACCURATE' : drop < DROP_CUT ? 'CONFORMED' : 'STRADDLING';
    wrows.push({ e, f1, f2, measDeg: d.edgeAngRad[e] * DEG, normHi, normLo, drop, cls });
    if ((i + 1) % 5000 === 0) log(`${P}       ... ${i + 1}/${wallScope.length}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  }
}
const byCls = (c: string): WEdge[] => wrows.filter((r) => r.cls === c);
const s3: Record<string, unknown> = {
  hiEdges: hiEdges.length, curtainEdges: curtainE.length, wallEdges: wallE.length,
  curtainFacets: curtainF.size, curtainAreaMm2: curtainA, curtainAreaPctOfClass: (curtainA / areaOver45) * 100,
  wallFacets: wallF.size, wallAreaMm2: wallA, wallAreaPctOfClass: (wallA / areaOver45) * 100,
  scoped: wallScope.length, scopeSampled: SCOPE_SAMPLED,
};
const scopedF = facetsOfEdges(wallScope); const scopedA = areaOfSet(scopedF);
log(`${P}    (scoped WALL edges hold ${scopedF.size} facets, ${scopedA.toFixed(4)} mm2)`);
log(`${P}    four-way split of the scoped WALL class — COUNT + AREA + MAX, per class:`);
for (const c of ['ACCURATE', 'CONFORMED', 'STRADDLING']) {
  const rs = byCls(c);
  const fs = facetsOfEdges(rs.map((r) => r.e));
  const a = areaOfSet(fs);
  const nh = rs.map((r) => r.normHi);
  log(`${P}       ${c.padEnd(11)} edges ${String(rs.length).padStart(7)} (${pct(rs.length, wallScope.length).padStart(8)}% of scoped WALL)  facets ${String(fs.size).padStart(7)}  AREA ${a.toFixed(4)} mm2 = ${pct(a, scopedA)}% of scoped WALL area = ${pct(a, meshArea)}% of mesh`);
  log(`${P}          ${' '.repeat(11)} normHi(inset ${INSET_HI}) p50 ${Number.isFinite(q(nh, 0.5)) ? q(nh, 0.5).toFixed(3) : '—'}  p99 ${Number.isFinite(q(nh, 0.99)) ? q(nh, 0.99).toFixed(3) : '—'}  MAX ${Number.isFinite(q(nh, 1)) ? q(nh, 1).toFixed(3) : '—'} deg   measured dihedral p50 ${Number.isFinite(q(rs.map((r) => r.measDeg), 0.5)) ? q(rs.map((r) => r.measDeg), 0.5).toFixed(2) : '—'} deg`);
  s3[c] = {
    edges: rs.length, edgePct: (rs.length / Math.max(1, wallScope.length)) * 100, facets: fs.size,
    areaMm2: a, areaPctOfScopedWall: (a / Math.max(1e-30, scopedA)) * 100, areaPctOfMesh: (a / meshArea) * 100,
    normHiP50: q(nh, 0.5), normHiP99: q(nh, 0.99), normHiMax: q(nh, 1),
    measDegP50: q(rs.map((r) => r.measDeg), 0.5),
  };
}
// The S113 headline analogue: how much of ALL >45-flagged area is ACCURATE (normHi <= 10)?
{
  const accF = facetsOfEdges(byCls('ACCURATE').map((r) => r.e));
  const accA = areaOfSet(accF);
  const nh = [...accF].map((f) => getHi(f));
  log(`${P}    >>> S113 ANALOGUE (Gothic: 641.841 mm2 = 94.83% — note 641.841/0.9483 = 676.87 = the WALL area,`);
  log(`${P}        so S113's denominator was the WALL class, not all >45 area. BOTH are printed here.)`);
  log(`${P}        ACCURATE facets ${accF.size}  AREA ${accA.toFixed(4)} mm2 = ${pct(accA, scopedA)}% of scoped WALL area  = ${pct(accA, areaOver45)}% of ALL >45 area`);
  log(`${P}                 normDeg(inset ${INSET_HI}) p50 ${Number.isFinite(q(nh, 0.5)) ? q(nh, 0.5).toFixed(2) : '—'}  MAX ${Number.isFinite(q(nh, 1)) ? q(nh, 1).toFixed(2) : '—'} deg   (Gothic: p50 1.95 / MAX 4.99)`);
  s3.accurateShareOfWallArea = (accA / Math.max(1e-30, scopedA)) * 100;
  s3.accurateShareOfAllHiArea = (accA / areaOver45) * 100;
  s3.accurateNormDegP50 = q(nh, 0.5); s3.accurateNormDegMax = q(nh, 1);
}
OUT.stage3 = s3;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ORACLE MACHINERY (flank decomposition; copied in construction from s113opOracle so the two are
// comparable line-for-line)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
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
/** Union the two footprints of an adjacent pair, split into flanks, and probe the turn AT the crease. */
interface PairOracle { sepCentDeg: number; sepCreaseDeg: number; gapMm: number; crease: boolean; irr: boolean }
function oraclePair(f1: number, f2: number, ns: NormalSampler = nsMain): PairOracle {
  const s1 = sampleFacet(f1, K_LAT_MUT.v, ns); const s2 = sampleFacet(f2, K_LAT_MUT.v, ns);
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

/** S109/S110's crease label: a kink on the shared edge or on the centroid segment. */
let creaseOnEdge = 0; let creaseOnSeg = 0; let creaseAsked = 0;
function creaseLabel(e: number, f1: number, f2: number): boolean {
  creaseAsked += 1;
  const p = sharedEndpoints(e);
  let oe = false;
  if (p !== null) {
    const thE = Math.atan2(p[1], p[0]);
    const kE = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
    oe = kE !== null && !kE.jump;
  }
  const c1 = centroidOf(f1); const c2 = centroidOf(f2);
  const thC = Math.atan2(c1[1], c1[0]);
  const kS = locateKinkRaw(rA, thC, c1[2], thC + dThRaw(thC, Math.atan2(c2[1], c2[0])), c2[2], PRED);
  const os = kS !== null && !kS.jump;
  if (oe) creaseOnEdge += 1; if (os) creaseOnSeg += 1;
  return oe || os;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 4 — THE QUESTION: IS THE >45 CLASS REAL ANALYTIC TURN?  (the Gothic 99.40% analogue)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const stradRows = byCls('STRADDLING');
log(`${P}── STAGE 4: THE ORACLE — is the STRADDLING class REAL ANALYTIC TURN or MESH DEFECT?  ${el()} ──`);
log(`${P}  Gothic reference: 99.40% of its straddling-class AREA is where the analytic surface itself turns >= 45 deg.`);
const s4: Record<string, unknown> = { straddlingEdges: stradRows.length };
let VERDICT = 'INCONCLUSIVE';
let irrAreaPct = NaN;
if (stradRows.length < 30) {
  log(`${P}  *** ONLY ${stradRows.length} STRADDLING PAIRS — TOO FEW TO ESTIMATE. VERDICT: INCONCLUSIVE. ***`);
  s4.note = 'straddling class too small (<30 pairs)';
} else {
  const orRows = stradRows.length > ORACLE_CAP ? goldenStride(stradRows.length, ORACLE_CAP).map((i) => stradRows[i]) : stradRows;
  const ORACLE_SAMPLED = orRows.length < stradRows.length;
  log(`${P}  oracle on ${orRows.length} of ${stradRows.length} straddling pairs${ORACLE_SAMPLED ? ' (GOLDEN-STRIDE SAMPLE)' : ' (EXHAUSTIVE)'}, K_LAT=${K_LAT_MUT.v}, NCROSS=${NCROSS}`);
  const t = Date.now();
  const po: PairOracle[] = [];
  const creaseLab: boolean[] = [];
  for (let i = 0; i < orRows.length; i += 1) {
    po.push(oraclePair(orRows[i].f1, orRows[i].f2));
    creaseLab.push(creaseLabel(orRows[i].e, orRows[i].f1, orRows[i].f2));
    if ((i + 1) % 200 === 0) log(`${P}     ... ${i + 1}/${orRows.length}  [${((Date.now() - t) / 1000).toFixed(1)}s]`);
  }
  // FACET-LEVEL AREA, deduplicated, TWO-SIDED (loose = any pair irreducible; strict = all pairs)
  const anyIrr = new Map<number, boolean>(); const allIrr = new Map<number, boolean>();
  const uniq: number[] = []; const seen = new Set<number>();
  for (let i = 0; i < orRows.length; i += 1) {
    for (const f of [orRows[i].f1, orRows[i].f2]) {
      if (!seen.has(f)) { seen.add(f); uniq.push(f); }
      anyIrr.set(f, (anyIrr.get(f) ?? false) || po[i].irr);
      allIrr.set(f, (allIrr.get(f) ?? true) && po[i].irr);
    }
  }
  let tArea = 0; let aLoose = 0; let aStrict = 0; let nLoose = 0; let nStrict = 0;
  for (const f of uniq) {
    tArea += d.areaMm2[f];
    if (anyIrr.get(f) === true) { aLoose += d.areaMm2[f]; nLoose += 1; }
    if (allIrr.get(f) === true) { aStrict += d.areaMm2[f]; nStrict += 1; }
  }
  const sc = po.map((p) => p.sepCreaseDeg);
  const nIrrPair = po.filter((p) => p.irr).length;
  const nCrease = po.filter((p) => p.crease).length;
  log(`${P}  analytic across-crease turn (closest ${NCROSS} cross-flank pairs, FOOTPRINT probe):`);
  log(`${P}     p10 ${q(sc, 0.1).toFixed(2)}  p50 ${q(sc, 0.5).toFixed(2)}  p90 ${q(sc, 0.9).toFixed(2)}  MAX ${q(sc, 1).toFixed(2)} deg`);
  log(`${P}     probe parameter gap p50 ${q(po.map((p) => p.gapMm), 0.5).toExponential(2)} mm  p90 ${q(po.map((p) => p.gapMm), 0.9).toExponential(2)} mm`);
  log(`${P}     footprint union CONTAINS A CREASE (sep>=${SEP_MIN} deg, both flanks >=2 pts, sep > within-flank spread): ${nCrease}/${po.length} = ${pct(nCrease, po.length)}%   <== CONTROL C2 FLOOR`);
  log(`${P}  *** IRREDUCIBLE (analytic turn >= ${HI_DEG} deg) ***`);
  log(`${P}     PAIRS  ${nIrrPair}/${po.length} = ${pct(nIrrPair, po.length)}%`);
  log(`${P}     AREA   loose(any-pair)  COUNT ${nLoose}/${uniq.length}  ${aLoose.toFixed(4)} mm2 = ${pct(aLoose, tArea)}% of the oracled straddling area`);
  log(`${P}     AREA   strict(all-pair) COUNT ${nStrict}/${uniq.length}  ${aStrict.toFixed(4)} mm2 = ${pct(aStrict, tArea)}% of the oracled straddling area`);
  log(`${P}     REDUCIBLE remainder ${(tArea - aLoose).toFixed(4)} mm2 = ${pct(tArea - aLoose, tArea)}% of straddling = ${pct(tArea - aLoose, meshArea)}% of mesh (scaled to the full class: ${pct((tArea - aLoose) * (stradRows.length / orRows.length), meshArea)}%)`);
  const red = po.filter((p) => !p.irr).map((p) => p.sepCreaseDeg);
  log(`${P}     among REDUCIBLE pairs the analytic turn is p50 ${Number.isFinite(q(red, 0.5)) ? q(red, 0.5).toFixed(2) : '—'} p90 ${Number.isFinite(q(red, 0.9)) ? q(red, 0.9).toFixed(2) : '—'} MAX ${Number.isFinite(q(red, 1)) ? q(red, 1).toFixed(2) : '—'} deg`);
  // ── THE EXACT GOTHIC ANALOGUE: S113's 99.40% is over the CREASE-LABELLED straddling set, not all of it.
  {
    const kIdx: number[] = [];
    for (let i = 0; i < orRows.length; i += 1) if (creaseLab[i]) kIdx.push(i);
    const anyK = new Map<number, boolean>(); const uK: number[] = []; const sK = new Set<number>();
    for (const i of kIdx) for (const f of [orRows[i].f1, orRows[i].f2]) {
      if (!sK.has(f)) { sK.add(f); uK.push(f); }
      anyK.set(f, (anyK.get(f) ?? false) || po[i].irr);
    }
    let kA = 0; let kIrrA = 0; let kIrrN = 0;
    for (const f of uK) { kA += d.areaMm2[f]; if (anyK.get(f) === true) { kIrrA += d.areaMm2[f]; kIrrN += 1; } }
    log(`${P}  ── CREASE-LABELLED SUBSET (locateKinkRaw on shared edge or centroid segment) — S113's own target set ──`);
    log(`${P}     crease-labelled pairs ${kIdx.length}/${orRows.length} = ${pct(kIdx.length, orRows.length)}%  (Gothic funnel: 3,282/5,174 = 63.4%)`);
    log(`${P}     IRREDUCIBLE within it: COUNT ${kIrrN}/${uK.length} facets   AREA ${kIrrA.toFixed(4)}/${kA.toFixed(4)} mm2 = ${pct(kIrrA, kA)}%   <<< THE DIRECT GOTHIC-99.40% ANALOGUE`);
    s4.creaseLabelledPairs = kIdx.length; s4.creaseLabelledPct = (kIdx.length / orRows.length) * 100;
    s4.irrAreaPctCreaseLabelled = kA > 0 ? (kIrrA / kA) * 100 : NaN;
    s4.creaseLabelledAreaMm2 = kA;
  }
  irrAreaPct = (aLoose / tArea) * 100;
  VERDICT = irrAreaPct >= 60 ? 'CONFIRMS' : 'CONTRADICTS';
  log('');
  log(`${P}  >>> PR-A1: IRREDUCIBLE-BY-AREA = ${irrAreaPct.toFixed(2)}%  vs the 60% line (Gothic reads 99.40%)  =>  *** ${VERDICT} ***`);
  s4.oracled = orRows.length; s4.oracleSampled = ORACLE_SAMPLED; s4.uniqueFacets = uniq.length;
  s4.oracledAreaMm2 = tArea;
  s4.irrPairs = nIrrPair; s4.irrPairPct = (nIrrPair / po.length) * 100;
  s4.irrAreaLoosePct = irrAreaPct; s4.irrAreaStrictPct = (aStrict / tArea) * 100;
  s4.creaseBearingPct = (nCrease / po.length) * 100;
  s4.turnP50 = q(sc, 0.5); s4.turnP90 = q(sc, 0.9); s4.turnMax = q(sc, 1);
  s4.reducibleAreaPctOfMesh = ((tArea - aLoose) * (stradRows.length / orRows.length) / meshArea) * 100;
}
OUT.stage4 = s4;
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 5 — CONTROLS C2 (CEILING) AND C4 (WINDING)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  // C2a — SMOOTH CONTROL: wall pairs under 2 deg. The classifier must find ~no crease and ~no irreducible.
  // Two passes so the control is spread over the WHOLE edge list: a front-truncated collection would
  // sample one region of the pot and is not a control on the mesh.
  const lo2 = (2 * Math.PI) / 180;
  let nSmooth = 0;
  for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] < lo2) nSmooth += 1;
  const smoothE = new Int32Array(nSmooth);
  { let j = 0; for (let e = 0; e < d.edgeAngRad.length; e += 1) if (d.edgeAngRad[e] < lo2) { smoothE[j] = e; j += 1; } }
  const ctl = goldenStride(nSmooth, Math.min(CTL_N * 3, nSmooth)).map((i) => smoothE[i])
    .filter((e) => grOf(d.edgeF1[e]) <= CURTAIN_RATIO && grOf(d.edgeF2[e]) <= CURTAIN_RATIO)
    .slice(0, CTL_N);
  log(`${P}  smooth (<2 deg) interior edges available: ${nSmooth} of ${d.interiorEdges}`);
  let nc = 0; let ni = 0;
  const cs: number[] = [];
  for (const e of ctl) { const o = oraclePair(d.edgeF1[e], d.edgeF2[e]); if (o.crease) nc += 1; if (o.irr) ni += 1; cs.push(o.sepCreaseDeg); }
  log(`${P}── STAGE 5 / C2-CHARACTERISATION (NOT a gate — its premise is false, see header): pair-union on <2 deg pairs ──`);
  log(`${P}  n=${ctl.length} WALL pairs whose SHARED-EDGE dihedral is < 2 deg`);
  log(`${P}  union footprint crease-labelled ${nc} (${pct(nc, ctl.length)}%)   irreducible ${ni} (${pct(ni, ctl.length)}%)`);
  log(`${P}  analytic turn inside these "flat" pairs: p50 ${Number.isFinite(q(cs, 0.5)) ? q(cs, 0.5).toFixed(3) : '—'} p90 ${Number.isFinite(q(cs, 0.9)) ? q(cs, 0.9).toFixed(2) : '—'} MAX ${Number.isFinite(q(cs, 1)) ? q(cs, 1).toFixed(2) : '—'} deg`);
  log(`${P}  READ: a NON-ZERO number here is the CONFORMED population — facets flanking a crease so`);
  log(`${P}  symmetrically that their MUTUAL dihedral is small. Gothic anchor reads 7.40%.`);
  OUT.c2pairChar = { n: ctl.length, creasePct: ctl.length > 0 ? (nc / ctl.length) * 100 : NaN, irrPct: ctl.length > 0 ? (ni / ctl.length) * 100 : NaN, turnMax: q(cs, 1) };
  log('');

  // ── C2a — S113's OWN control, verbatim: SINGLE facets, perFacetMaxRad < 2 deg, wall, not straddling.
  {
    const inStrad = new Set<number>();
    for (const r of stradRows) { inStrad.add(r.f1); inStrad.add(r.f2); }
    const pool: number[] = [];
    for (const f of goldenStride(nTri, Math.min(nTri, 200000))) {
      if (pool.length >= CTL_N) break;
      if (inStrad.has(f) || d.perFacetMaxRad[f] >= lo2 || grOf(f) > CURTAIN_RATIO) continue;
      pool.push(f);
    }
    let sc = 0; const seps: number[] = [];
    for (const f of pool) {
      const s = sampleFacet(f, K_LAT_MUT.v, nsMain);
      const sp = twoMeans(s.n, s.m);
      let na = 0; let nb = 0;
      for (let i = 0; i < s.m; i += 1) (sp.lab[i] === 0 ? (na += 1) : (nb += 1));
      const sep = sp.sepRad * DEG;
      const cr = sep >= SEP_MIN && Math.min(na, nb) >= 2 && sep > Math.max(sp.wA, sp.wB) * DEG;
      if (cr) sc += 1;
      seps.push(sep);
    }
    const rate = pool.length > 0 ? sc / pool.length : 0;
    log(`${P}── STAGE 5 / CONTROL C2a — S113's OWN smooth control, verbatim (single facet) ──`);
    log(`${P}  n=${pool.length} wall facets, perFacetMaxRad < 2 deg, NOT in the straddling set`);
    log(`${P}  crease-labelled ${sc} (${pct(sc, pool.length)}%)   [S113 kill line 5%]   sepDeg p50 ${Number.isFinite(q(seps, 0.5)) ? q(seps, 0.5).toFixed(4) : '—'} MAX ${Number.isFinite(q(seps, 1)) ? q(seps, 1).toFixed(3) : '—'} deg`);
    log(`${P}  ${rate > 0.05 ? '*** C2a OVER THE S113 LINE ***' : 'C2a OK'}`);
    OUT.c2a = { n: pool.length, creasePct: rate * 100, over: rate > 0.05 };
  }
  log('');

  // ── C2b — *** THE PLACEBO, AND THE VOIDING GATE. *** Same classifier, same footprints, C-infinity analytic.
  {
    const Rb = DIMS.Rb; const Rt = DIMS.Rt;
    const nsFlat = fdNormals(rFlat, H, H_FD, H_FD);
    const src = stradRows.length > 0 ? stradRows : wrows;
    const pl = goldenStride(src.length, Math.min(300, src.length)).map((i) => src[i]);
    let nc2 = 0; let ni2 = 0; const s2v: number[] = [];
    for (const r of pl) { const o = oraclePair(r.f1, r.f2, nsFlat); if (o.crease) nc2 += 1; if (o.irr) ni2 += 1; s2v.push(o.sepCreaseDeg); }
    const rate = pl.length > 0 ? nc2 / pl.length : 0;
    log(`${P}── STAGE 5 / CONTROL C2b — *** THE PLACEBO ARM (the voiding gate) *** ──`);
    log(`${P}  The SAME classifier on the SAME ${pl.length} target footprints, but against a provably`);
    log(`${P}  C-infinity analytic (bare truncated cone r = ${Rb} + ${Rt - Rb}*z/${H}). Nothing here is a crease.`);
    log(`${P}  crease-labelled ${nc2} (${pct(nc2, pl.length)}%)   irreducible ${ni2} (${pct(ni2, pl.length)}%)   turn p50 ${Number.isFinite(q(s2v, 0.5)) ? q(s2v, 0.5).toExponential(2) : '—'} MAX ${Number.isFinite(q(s2v, 1)) ? q(s2v, 1).toFixed(4) : '—'} deg`);
    const fired = rate > 0.05;
    log(`${P}  ${fired ? '*** CONTROL C2b FIRED — the classifier manufactures creases from facet shape alone. STAGE 4 IS VOID. ***' : 'C2b OK — every crease Stage 4 reports is in the ANALYTIC, not in the instrument.'}`);
    OUT.c2b = { n: pl.length, creasePct: rate * 100, irrPct: pl.length > 0 ? (ni2 / pl.length) * 100 : NaN, turnMax: q(s2v, 1), fired };
    if (fired) VERDICT = 'VOID-CONTROL-C2b';
  }
  log('');

  // C4 — WINDING audit over the >45 wall class
  const wn = new Float64Array(3); const an = new Float64Array(3);
  const audit = [...scopedF];
  let inv = 0; let invA = 0; const marg: number[] = [];
  for (const f of audit) {
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
    marg.push(Math.abs(dp));
    if (dp < 0) { inv += 1; invA += d.areaMm2[f]; }
  }
  log(`${P}── STAGE 5 / CONTROL C4: WINDING audit over the scoped >${HI_DEG} WALL class (n=${audit.length}) ──`);
  log(`${P}  INVERTED vs analytic outward normal: COUNT ${inv} (${pct(inv, audit.length)}%)  AREA ${invA.toFixed(4)} mm2 = ${pct(invA, scopedA)}% of scoped WALL area`);
  log(`${P}  |dot| sign margin p10 ${q(marg, 0.1).toFixed(4)} p50 ${q(marg, 0.5).toFixed(4)} p90 ${q(marg, 0.9).toFixed(4)}   (small margin = the sign is a coin toss on that facet)`);
  OUT.c4 = { n: audit.length, inverted: inv, invertedPct: (inv / Math.max(1, audit.length)) * 100, invertedAreaPct: (invA / Math.max(1e-30, scopedA)) * 100, margP50: q(marg, 0.5) };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 6 — CREASE LABEL (locateKinkRaw), so the class is comparable to S113's crease-labelled target set
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
if (creaseAsked > 0) {
  log(`${P}── STAGE 6: CREASE LABEL breakdown over the ${creaseAsked} oracled straddling pairs (locateKinkRaw) ──`);
  log(`${P}  crease on SHARED EDGE ${creaseOnEdge} (${pct(creaseOnEdge, creaseAsked)}%)   on CENTROID SEGMENT ${creaseOnSeg} (${pct(creaseOnSeg, creaseAsked)}%)`);
  log(`${P}  (S113 Gothic funnel: 5,174 straddling -> 3,282 crease-labelled = 63.4%)`);
  OUT.stage6 = { n: creaseAsked, onEdgePct: (creaseOnEdge / creaseAsked) * 100, onSegPct: (creaseOnSeg / creaseAsked) * 100 };
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// STAGE 7 — WHOLE->45-CLASS ACCOUNTING.
//
// WHY THIS EXISTS. PR-A1 scores the STRADDLING class, because that is the class S113's 99.40% is about
// and a like-for-like comparison must use the same class. But on a RELIEF style the straddling class is
// a rounding error — on ArtDeco it is 0.0027% of the mesh against a >45 class of 21.29%. Quoting PR-A1
// alone would describe 0.013% of the class and silently drop the other 99.99%. So the class is
// reassembled here, each sub-class carrying the irreducibility share MEASURED for it:
//   CURTAIN    -> Stage 3c's oracle share (with its own K-convergence ladder printed above)
//   ACCURATE   -> counted IRREDUCIBLE: the mesh is within 10 deg of the analytic and STILL renders >45,
//                 which is exactly S113's 94.83% argument — the edge is in the surface, not the mesh.
//   CONFORMED  -> counted IRREDUCIBLE: normDeg collapses when the footprint is inset off the locus, i.e.
//                 the turn is real and the mesh is already aligned to it.
//   STRADDLING -> Stage 4's measured oracle share.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const s3o = OUT.stage3 as Record<string, number>;
  const s3cO = OUT.stage3c as Record<string, number> | undefined;
  const scale = wallA / Math.max(1e-30, scopedA);   // scoped WALL sample -> full WALL class
  const aAcc = (s3o.ACCURATE as unknown as Record<string, number> | undefined) === undefined ? 0 : 0;
  void aAcc;
  const gA = (c: string): number => ((s3o[c] as unknown as Record<string, number>)?.areaMm2 ?? 0) * scale;
  const aAccurate = gA('ACCURATE'); const aConf = gA('CONFORMED'); const aStrad = gA('STRADDLING');
  const sCurtain = s3cO === undefined ? NaN : s3cO.irrAreaPct / 100;
  const sStrad = Number.isFinite(irrAreaPct) ? irrAreaPct / 100 : NaN;
  const irrTot = (Number.isFinite(sCurtain) ? curtainA * sCurtain : 0)
    + aAccurate + aConf + (Number.isFinite(sStrad) ? aStrad * sStrad : 0);
  const denom = curtainA + aAccurate + aConf + aStrad;
  log('');
  log(`${P}── STAGE 7: WHOLE->${HI_DEG}-CLASS ACCOUNTING (PR-A1 scores the straddling class only) ──`);
  log(`${P}  sub-class            AREA mm2      share of >45 class   measured IRREDUCIBLE share`);
  log(`${P}  CURTAIN            ${curtainA.toFixed(3).padStart(11)}   ${pct(curtainA, denom).padStart(8)}%           ${Number.isFinite(sCurtain) ? (sCurtain * 100).toFixed(2) + '% (Stage 3c)' : 'UNMEASURED'}`);
  log(`${P}  WALL/ACCURATE      ${aAccurate.toFixed(3).padStart(11)}   ${pct(aAccurate, denom).padStart(8)}%           100% by construction (<=${NORMHI_BAR} deg from analytic)`);
  log(`${P}  WALL/CONFORMED     ${aConf.toFixed(3).padStart(11)}   ${pct(aConf, denom).padStart(8)}%           100% by construction (inset-drop < ${DROP_CUT})`);
  log(`${P}  WALL/STRADDLING    ${aStrad.toFixed(3).padStart(11)}   ${pct(aStrad, denom).padStart(8)}%           ${Number.isFinite(sStrad) ? (sStrad * 100).toFixed(2) + '% (Stage 4)' : 'UNMEASURED'}`);
  log(`${P}  ${'-'.repeat(96)}`);
  log(`${P}  *** CLASS-WIDE IRREDUCIBLE = ${pct(irrTot, denom)}% of the >${HI_DEG} class AREA ***   (reducible remainder ${(denom - irrTot).toFixed(3)} mm2 = ${pct(denom - irrTot, meshArea)}% of MESH)`);
  OUT.stage7 = {
    curtainAreaMm2: curtainA, accurateAreaMm2: aAccurate, conformedAreaMm2: aConf, straddlingAreaMm2: aStrad,
    curtainIrrShare: sCurtain, straddlingIrrShare: sStrad,
    classWideIrrPct: (irrTot / Math.max(1e-30, denom)) * 100,
    reducibleAreaMm2: denom - irrTot, reduciblePctOfMesh: ((denom - irrTot) / meshArea) * 100,
  };
}
OUT.verdict = PRECOND_REFUSED ? 'REFUSED-PRECOND' : VERDICT;
OUT.irrAreaPct = irrAreaPct;
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`${P}VERDICT for ${STYLE}: ${OUT.verdict}${Number.isFinite(irrAreaPct) ? `  (irreducible-by-area ${irrAreaPct.toFixed(2)}% vs the 60% line; Gothic 99.40%)` : ''}`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
writeFileSync(`${OUTDIR}/S114A_${TAG}.json`, `${JSON.stringify(OUT, null, 2)}\n`);
log(`wrote ${OUTDIR}/S114A_${TAG}.json   done ${el()}`);
