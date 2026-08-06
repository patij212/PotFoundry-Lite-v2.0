// s114SweepC.ts — THE ALL-STYLES SWEEP ON THE HONEST RULER, QUARTER C (3rd quarter, alphabetical).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TOOL EXISTS. Every STRATA number to date is GothicArches. S113 concluded, ON GOTHIC, that the
// >45 deg dihedral class is dominated by REAL ANALYTIC TURN and not by mesh defect (99.40% of the
// crease-labelled straddling class's area sits where the analytic surface itself turns >= 45 deg).
// That conclusion has never been tested on another style, and this campaign's own history is that styles
// differ in KIND (smooth / faceted-by-design / layered / anisotropic), not in degree.
//
// THE ROSTER (established from research/tools/s91StyleCensus.ts DEFAULT_STEMS, the only all-20 family on
// disk, and its committed run s91StyleCensus.report.txt). 20 registry styles, alphabetically:
//   ArtDeco BambooSegments BasketWeave CelticKnot CelticTriquetra Crystalline DragonScales FourierBloom
//   GeometricStar GothicArches | GyroidManifold HarmonicRipple HexagonalHive LowPolyFacet
//   RippleInterference | SpiralRidges SuperellipseMorph SuperformulaBlossom Voronoi WaveInterference
// QUARTER C = positions 11..15 = GyroidManifold, HarmonicRipple, HexagonalHive, LowPolyFacet,
// RippleInterference. Canonical mesh per style = the one s91 used (see MESHES below).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-06, BEFORE THE FIRST RUN OF THIS FILE. Nothing below is edited after a number
// is read. If a number falsifies a line here, the line stays and the falsification is reported.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// PC-0  THE REFUSAL GATE IS A RESULT. max |r_mesh - rA| over a stride sample, STYLE_REGISTRY defaults,
//       dims H120/Rb40/Rt50/expn1. Gothic reads 0.0310 um. > 50 um => THE STYLE IS REFUSED and every
//       analytic number for it is suppressed, not printed with a caveat.
//
// PC-1  THE GENERALISATION QUESTION, with the verdict rule fixed IN ADVANCE so I cannot pick it after
//       seeing the number. Per style, on the STRADDLING class (S112's scoping, reproduced exactly):
//         IRREDUCIBLE := the analytic across-crease turn over the pair's own footprint neighbourhood is
//                        >= 45 deg, i.e. ANY correct mesh shows a >45 deg dihedral there.
//         CONFIRMS      if IRREDUCIBLE >= 90% of the straddling class BY AREA (Gothic: 99.40%)
//         CONTRADICTS   if IRREDUCIBLE <= 60% BY AREA
//         INCONCLUSIVE  if 60-90%, OR if the straddling class has < 200 pairs (too small to speak)
//         NO VISIBLE CLASS  if the mesh has zero interior edges over 45 deg — a distinct result
//       *** NEVER AVERAGED ACROSS STYLES. *** Each style gets its own verdict line and its own row.
//
// PC-2  I PREDICT THE ROSTER SPLITS RATHER THAN CONFIRMING UNIFORMLY. Specifically: LowPolyFacet is
//       FACETED BY DESIGN (S70 smoke: its orientation p99 is 20 deg while `kinkRad` reads literally
//       zero) and HexagonalHive is a SEAMED LATTICE (project_hexhive_seam_closed). I pre-register that
//       at least one of the five comes out other than CONFIRMS. If all five CONFIRM, this prediction is
//       falsified and I say so.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// INSTRUMENT DISCIPLINE — each line answers a scar this lineage has already paid for.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  * NEVER A BARE COUNT, NEVER A BARE MAX. Every population carries COUNT + AREA-SHARE + MAX. Area is
//    accumulated over the UNIQUE facet set (a facet on two high-dihedral edges must not be double-counted).
//  * AN OPTION DEFAULT IS A MEASUREMENT CHOICE. `inset` is passed EXPLICITLY everywhere and reported at
//    0 AND 0.05 (normDeg moves 64x across that range on crease classes). The lattice order k is SWEPT
//    (4/8/16) on a subsample so convergence is shown, never assumed.
//  * KINK-AWARE SAMPLER. `fdNormals`, not `fdNormalsCentral` — a central difference across a C0 crease
//    returns the AVERAGE of the two one-sided normals and silently halves the defect (S111's bias).
//  * WINDING, NOT OUTWARD, as primary — the convention `dihedralRuler` uses and the one a consumer of
//    the STL renders. `signMargin` is aggregated so a coin-toss sign cannot hide.
//  * PROBE FOOTPRINTS, NOT ENDPOINTS. The across-crease turn is taken over the closest NCROSS
//    cross-flank sample PAIRS of an order-K lattice, never from two endpoints (S110's 13x under-read).
//  * TWO-SIDED IN SITU CONTROLS, per style, printed BEFORE the headline:
//      CTL-A  ANCHOR. The same binary is run on gothicarches_ring_DS-HT_S39CTL and must reproduce
//             PRECOND 0.0310 um and the S112 funnel (19,582 high / 13,092 wall / 5,174 straddling).
//             If the anchor misses, NO row in this table is admissible.
//      CTL-B  SMOOTH NEGATIVE CONTROL. The flank/crease classifier is run on wall facets whose adjacent
//             dihedral is < 2 deg. If it labels > 5% of them as containing a crease it is manufacturing
//             creases out of smooth curvature and the style's irreducibility number IS VOID.
//      CTL-C  RULER NEGATIVE CONTROL. normDeg on those same smooth facets. If the ruler reads a large
//             normDeg on the visibly-fine 97%+ of the mesh, it is broken and the style is VOID.
//  * A ONE-SIDED BAR IS VACUOUS. CTL-B/CTL-C assert FLOORS (the classifier must fire on the target class
//    at all; the ruler must not read zero everywhere) as well as ceilings.
//  * SAMPLED IS LABELLED SAMPLED. Whole-mesh normDeg is a golden-ratio low-discrepancy INDEX sample
//    (uniform stride aliases against a regular lattice mesh — HexagonalHive is exactly that). Every
//    sampled figure prints its N and its sampling fraction. Exact figures are marked EXACT.
//
// MESHES (absolute paths supplied by env; the exchange dir is gitignored and absent from this worktree):
//   GyroidManifold      gyroidmanifold_ring_D--.stl        s91 row: 1,132,314 facets   [s91 DEFAULT_STEMS]
//   HarmonicRipple      harmonicripple_ring_D--C.stl       s91 row:    74,121 facets   [s91 DEFAULT_STEMS;
//                       the `_ring_D--C` variant is the one s91 pinned — plain `harmonicripple_D--` is not
//                       in the `ring_` family and is a different construction]
//   HexagonalHive       hexagonalhive_ring_D--.stl         s91 row:   880,000 facets   [s91 DEFAULT_STEMS]
//   LowPolyFacet        lowpolyfacet_ring_D--.stl          s91 row:   137,480 facets   [s91 DEFAULT_STEMS]
//   RippleInterference  rippleinterference_ring_D--.stl    s91 row:   170,496 facets   [s91 DEFAULT_STEMS]
//   ANCHOR GothicArches gothicarches_ring_DS-HT_S39CTL.stl        1,142,166 facets   [the campaign reference]
//
// Usage: bash research/tools/run-s114c-sweep.sh
import { mkdirSync, writeFileSync } from 'node:fs';
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
const DEG = 180 / Math.PI;

const OUTDIR = process.env.PF_S114C_OUTDIR ?? 'research/exchange/_strataConformBisect/s114c';
const STAGE = process.env.PF_S114C_STAGE ?? 'full';         // 'recon' = cheap sizing pass, no rA-heavy work
const HI_DEG = envF('PF_S114C_HI_DEG', 45);                 // S108's visibility cut
const CURTAIN_RATIO = envF('PF_S114C_CURTAIN', 8);          // S112: graphRatio > this => ruler undefined
const DROP_CUT = envF('PF_S114C_DROP', 0.25);               // S112: inset-drop >= this => STRADDLING
const NORMHI_CUT = envF('PF_S114C_NORMHI', 10);             // S112: and normDeg(inset .05) > this
const K_OBS = Math.round(envF('PF_S114C_K', 8));            // lattice order for normDeg
const INSET_LO = envF('PF_S114C_INSET_LO', 0);
const INSET_HI = envF('PF_S114C_INSET_HI', 0.05);
const NSAMP = Math.round(envF('PF_S114C_N', 20000));        // whole-mesh normDeg sample
const NLADDER = Math.round(envF('PF_S114C_NLADDER', 300));  // k-ladder subsample
const CAP_WALL = Math.round(envF('PF_S114C_CAPWALL', 12000));  // wall edges scoped with the rA ruler
const CAP_STRAD = Math.round(envF('PF_S114C_CAPSTRAD', 1200)); // straddling pairs given the flank oracle
const CTLN = Math.round(envF('PF_S114C_CTLN', 400));        // smooth-control size
const K_LAT = Math.round(envF('PF_S114C_KLAT', 12));        // lattice order for the flank decomposition
const SEP_MIN = envF('PF_S114C_SEPMIN', 15);                // deg: a flank split must beat this to be a crease
const NCROSS = Math.round(envF('PF_S114C_NCROSS', 8));      // closest cross-flank pairs for the crease turn
const H_FD = envF('PF_S114C_HFD', 2e-4);
const DIMS: StyleDims = { H: envF('PF_S114C_H', 120), Rb: envF('PF_S114C_RB', 40), Rt: envF('PF_S114C_RT', 50), expn: 1 };
const H = DIMS.H;
const PRECOND_UM = envF('PF_S114C_PRECOND_UM', 50);

const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.0006,
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
/** area-weighted share of a boolean predicate over a facet list */
const areaShare = (fs: number[], area: Float64Array, pred: (f: number) => boolean): number => {
  let tot = 0; let hit = 0;
  for (const f of fs) { tot += area[f]; if (pred(f)) hit += area[f]; }
  return tot > 0 ? (hit / tot) * 100 : NaN;
};
/** golden-ratio low-discrepancy INDEX sample — does NOT alias against a periodic mesh the way a stride does */
function goldenSample(n: number, want: number): number[] {
  if (want >= n) { const a: number[] = []; for (let i = 0; i < n; i += 1) a.push(i); return a; }
  const GOLD = 0.6180339887498949;
  const seen = new Set<number>(); const out: number[] = [];
  let i = 0;
  while (out.length < want && i < want * 40) {
    const idx = Math.floor(((i * GOLD) % 1) * n);
    if (!seen.has(idx)) { seen.add(idx); out.push(idx); }
    i += 1;
  }
  return out;
}

const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE PER-STYLE MEASUREMENT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface StyleRow { [k: string]: unknown }

function measureStyle(style: string, stl: string, isAnchor: boolean): StyleRow {
  const row: StyleRow = { style, stl, anchor: isAnchor };
  log('');
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${style}${isAnchor ? '   [ANCHOR — CTL-A]' : ''} ═════`);
  log(`  mesh: ${stl}`);

  const defs = registryDefaults(style);
  log(`  registry defaults: ${Object.entries(defs).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  row.registryDefaults = defs;

  const rAbase = buildRadiusFn(style as StyleId, { ...defs }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const nsKink: NormalSampler = fdNormals(rA, H, H_FD, H_FD);
  const scratch = new Float64Array(12);

  // ── STAGE 0: LOAD + PRECOND ──────────────────────────────────────────────────────────────────────
  const M = readMeshFloat64(stl, false);
  const xyz = M.xyz; const nTri = M.nTri;
  let worst = 0; let worstAt = [0, 0, 0];
  {
    const step = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (dd > worst) { worst = dd; worstAt = [x, y, z]; }
    }
  }
  const precondUm = worst * 1000;
  log(`  facets ${nTri}   PRECOND max |r_mesh - rA| = ${precondUm.toFixed(4)} um   (Gothic reads 0.0310 um)`);
  row.nTri = nTri; row.precondUm = precondUm;
  if (precondUm > PRECOND_UM) {
    log(`  *** REFUSED: PRECOND ${precondUm.toFixed(2)} um > ${PRECOND_UM} um. A params/dims mismatch voids every`);
    log(`      analytic number for this style. Worst vertex (x,y,z) = ${worstAt.map((v) => v.toFixed(4)).join(', ')}.`);
    log('      NO analytic figure is printed for this style. THE REFUSAL IS THE RESULT.');
    row.refused = true; row.verdict = 'REFUSED (PRECOND)';
    return row;
  }
  row.refused = false;
  log(`  PRECOND OK -> TRUSTED   ${el()}`);

  // ── STAGE 1: DIHEDRAL DISTRIBUTION (EXACT, whole mesh) ───────────────────────────────────────────
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  const hiThr = (HI_DEG * Math.PI) / 180;
  const edgeDegAll: number[] = [];
  for (let e = 0; e < d.interiorEdges; e += 1) edgeDegAll.push(d.edgeAngRad[e] * DEG);
  const facetMaxDeg: number[] = [];
  for (let f = 0; f < nTri; f += 1) facetMaxDeg.push(d.perFacetMaxRad[f] * DEG);
  let areaOver45 = 0; let nOver45 = 0;
  for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > hiThr) { areaOver45 += d.areaMm2[f]; nOver45 += 1; }
  let nHigh = 0;
  for (let e = 0; e < d.interiorEdges; e += 1) if (d.edgeAngRad[e] > hiThr) nHigh += 1;
  log('');
  log(`  ── DIHEDRAL (facetDihedrals, EXACT whole mesh)   area ${meshArea.toFixed(3)} mm2   ${el()} ──`);
  log(`     interior edges ${d.interiorEdges}   boundary ${d.boundaryEdges}   non-manifold ${d.nonManifoldEdges}   inconsistent ${d.inconsistentEdges}`);
  log(`     EDGE angle deg      p50 ${q(edgeDegAll, 0.5).toFixed(3)}  p99 ${q(edgeDegAll, 0.99).toFixed(3)}  MAX ${mx(edgeDegAll).toFixed(3)}`);
  log(`     PER-FACET max deg   p50 ${q(facetMaxDeg, 0.5).toFixed(3)}  p99 ${q(facetMaxDeg, 0.99).toFixed(3)}  MAX ${mx(facetMaxDeg).toFixed(3)}`);
  log(`     OVER ${HI_DEG} deg:  edges ${nHigh} (${((nHigh / Math.max(1, d.interiorEdges)) * 100).toFixed(4)}%)   facets COUNT ${nOver45} (${((nOver45 / nTri) * 100).toFixed(4)}%)   AREA ${areaOver45.toFixed(4)} mm2 = ${((areaOver45 / meshArea) * 100).toFixed(4)}% of mesh`);
  Object.assign(row, {
    meshAreaMm2: meshArea, interiorEdges: d.interiorEdges, boundaryEdges: d.boundaryEdges,
    nonManifoldEdges: d.nonManifoldEdges, inconsistentEdges: d.inconsistentEdges,
    edgeDegP50: q(edgeDegAll, 0.5), edgeDegP99: q(edgeDegAll, 0.99), edgeDegMax: mx(edgeDegAll),
    facetMaxDegP50: q(facetMaxDeg, 0.5), facetMaxDegP99: q(facetMaxDeg, 0.99), facetMaxDegMax: mx(facetMaxDeg),
    nHighEdges: nHigh, nOver45Facets: nOver45, areaOver45Mm2: areaOver45,
    areaShareOver45Pct: (areaOver45 / meshArea) * 100,
  });

  // ── geometry helpers ─────────────────────────────────────────────────────────────────────────────
  const th3 = (f: number): [number, number, number] => {
    const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
    const b = a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3]));
    const c = a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]));
    return [a, b, c];
  };
  const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1])
    + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
  const argsOf = (f: number): [number, number, number, number, number, number, number, number, number, number, number, number] => {
    const [ath, bth, cth] = th3(f);
    return [xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth];
  };
  const orientOf = (f: number, inset: number, k: number): { normDeg: number; spreadDeg: number; signMargin: number; overFrac: number } => {
    const o = orientOfFacet(nsKink, ...argsOf(f), { k, inset, orient: 'winding', scratch });
    return { normDeg: o.normDeg, spreadDeg: o.spreadRad * DEG, signMargin: o.signMargin, overFrac: o.overFrac };
  };
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

  if (STAGE === 'recon') {
    // cheap sizing pass: how many wall edges are there, so the caps can be set honestly
    let nWall = 0;
    for (let e = 0; e < d.interiorEdges; e += 1) {
      if (!(d.edgeAngRad[e] > hiThr)) continue;
      if (graphRatio(d.edgeF1[e]) > CURTAIN_RATIO || graphRatio(d.edgeF2[e]) > CURTAIN_RATIO) continue;
      nWall += 1;
    }
    log(`  RECON: high ${nHigh}  wall ${nWall}  curtain ${nHigh - nWall}   ${el()}`);
    row.nWallEdges = nWall; row.recon = true;
    return row;
  }

  // ── STAGE 2: normDeg WHOLE-MESH ESTIMATE (golden-ratio index sample) ─────────────────────────────
  const samp = goldenSample(nTri, NSAMP);
  const nd0: number[] = []; const nd5: number[] = []; const sm: number[] = [];
  for (const f of samp) {
    nd0.push(orientOf(f, INSET_LO, K_OBS).normDeg);
    const o5 = orientOf(f, INSET_HI, K_OBS);
    nd5.push(o5.normDeg); sm.push(o5.signMargin);
  }
  const sampArea = (pred: (i: number) => boolean): number => {
    let tot = 0; let hit = 0;
    for (let i = 0; i < samp.length; i += 1) { tot += d.areaMm2[samp[i]]; if (pred(i)) hit += d.areaMm2[samp[i]]; }
    return tot > 0 ? (hit / tot) * 100 : NaN;
  };
  log('');
  log(`  ── normDeg (orientOfFacet, kink-aware fdNormals, WINDING, k=${K_OBS})   SAMPLED n=${samp.length} = ${((samp.length / nTri) * 100).toFixed(3)}% of facets   ${el()} ──`);
  for (const [tag, v, ins] of [['inset 0.00', nd0, INSET_LO], ['inset 0.05', nd5, INSET_HI]] as Array<[string, number[], number]>) {
    log(`     ${tag}   p50 ${q(v, 0.5).toFixed(4)}  p90 ${q(v, 0.9).toFixed(4)}  p99 ${q(v, 0.99).toFixed(4)}  MAX ${mx(v).toFixed(3)} deg`);
    const c1 = v.filter((x) => x > 1).length; const c5 = v.filter((x) => x > 5).length;
    log(`                over 1 deg  COUNT ${c1} (${((c1 / v.length) * 100).toFixed(3)}%)  AREA-share ${sampArea((i) => v[i] > 1).toFixed(4)}%`);
    log(`                over 5 deg  COUNT ${c5} (${((c5 / v.length) * 100).toFixed(3)}%)  AREA-share ${sampArea((i) => v[i] > 5).toFixed(4)}%`);
    row[`normDeg_inset${ins}`] = {
      p50: q(v, 0.5), p90: q(v, 0.9), p99: q(v, 0.99), max: mx(v),
      over1Count: c1, over1CountPct: (c1 / v.length) * 100, over1AreaPct: sampArea((i) => v[i] > 1),
      over5Count: c5, over5CountPct: (c5 / v.length) * 100, over5AreaPct: sampArea((i) => v[i] > 5),
      n: v.length,
    };
  }
  log(`     signMargin over the sample p10 ${q(sm, 0.1).toFixed(4)} p50 ${q(sm, 0.5).toFixed(4)}   (winding mode = 1 by construction; printed as a guard)`);
  row.signMarginP50 = q(sm, 0.5);

  // k-LADDER: never assume k=8 has converged
  const lad = goldenSample(nTri, NLADDER);
  log('     k-LADDER spot-check (n=' + lad.length + '), both insets:');
  const ladder: Record<string, unknown> = {};
  for (const k of [4, 8, 16]) {
    const a0 = lad.map((f) => orientOf(f, INSET_LO, k).normDeg);
    const a5 = lad.map((f) => orientOf(f, INSET_HI, k).normDeg);
    log(`        k=${String(k).padStart(2)}   inset0 p50 ${q(a0, 0.5).toFixed(4)} MAX ${mx(a0).toFixed(3)}   |   inset0.05 p50 ${q(a5, 0.5).toFixed(4)} MAX ${mx(a5).toFixed(3)}`);
    ladder[`k${k}`] = { i0p50: q(a0, 0.5), i0max: mx(a0), i5p50: q(a5, 0.5), i5max: mx(a5) };
  }
  row.kLadder = ladder;

  // ── CONTROLS CTL-B / CTL-C: the SMOOTH negative control, run BEFORE ANY headline and before any
  //    early return, so that a style with no visible class still gets its ruler guarded. ───────────
  const smoothF: number[] = [];
  {
    const loThr = (2 * Math.PI) / 180;
    const cand = goldenSample(nTri, Math.min(nTri, CTLN * 60));
    for (const f of cand) {
      if (smoothF.length >= CTLN) break;
      if (d.perFacetMaxRad[f] < loThr && graphRatio(f) <= CURTAIN_RATIO) smoothF.push(f);
    }
  }
  let ctlCreaseRate = NaN; let ctlNormP50 = NaN; let ctlNormMax = NaN; let ctlVoid = false; let ctlVoidWho = '';
  if (smoothF.length >= 50) {
    let cN = 0;
    for (const f of smoothF) if (footCrease(f)) cN += 1;
    ctlCreaseRate = (cN / smoothF.length) * 100;
    const nv = smoothF.map((f) => orientOf(f, INSET_HI, K_OBS).normDeg);
    ctlNormP50 = q(nv, 0.5); ctlNormMax = mx(nv);
    log('');
    log(`  ── CTL-B/CTL-C  SMOOTH NEGATIVE CONTROL (n=${smoothF.length} wall facets with per-facet max dihedral < 2 deg) ──`);
    log(`     CTL-B flank classifier labels ${cN} of them as containing a crease = ${ctlCreaseRate.toFixed(2)}%   (VOIDS the style if > 5%)`);
    log(`     CTL-C normDeg on the same facets  p50 ${ctlNormP50.toFixed(4)}  MAX ${ctlNormMax.toFixed(3)} deg`);
    if (ctlCreaseRate > 5) { log('     ⚠ CTL-B CAVEAT: the crease LABEL fires on smooth facets at this size. It feeds no verdict here; see CTL-D.'); row.ctlBOverFires = true; }
  } else {
    log('');
    log(`  ── CTL-B/CTL-C  SMOOTH NEGATIVE CONTROL: only ${smoothF.length} qualifying facets found; control CANNOT RUN. ──`);
    log('     Without it the irreducibility number is unguarded and is reported as INCONCLUSIVE (no control).');
  }
  Object.assign(row, { ctlSmoothN: smoothF.length, ctlCreaseRatePct: ctlCreaseRate, ctlNormP50, ctlNormMax });

  // ── STAGE 3: THE S112 SCOPING OF THE >45 DEG CLASS ───────────────────────────────────────────────
  const highEdges: number[] = [];
  for (let e = 0; e < d.interiorEdges; e += 1) if (d.edgeAngRad[e] > hiThr) highEdges.push(e);
  const wallEdges: number[] = []; const curtainEdges: number[] = [];
  for (const e of highEdges) {
    if (graphRatio(d.edgeF1[e]) > CURTAIN_RATIO || graphRatio(d.edgeF2[e]) > CURTAIN_RATIO) curtainEdges.push(e);
    else wallEdges.push(e);
  }
  const uniqOf = (es: number[]): number[] => {
    const s = new Set<number>();
    for (const e of es) { s.add(d.edgeF1[e]); s.add(d.edgeF2[e]); }
    return Array.from(s);
  };
  const areaOf = (fs: number[]): number => { let a = 0; for (const f of fs) a += d.areaMm2[f]; return a; };
  const uHigh = uniqOf(highEdges); const uCurt = uniqOf(curtainEdges); const uWall = uniqOf(wallEdges);
  const aHigh = areaOf(uHigh); const aCurt = areaOf(uCurt); const aWall = areaOf(uWall);
  log('');
  log(`  ── S112 SCOPING OF THE >${HI_DEG} DEG CLASS   ${el()} ──`);
  log(`     HIGH   edges ${highEdges.length}   facets ${uHigh.length}   AREA ${aHigh.toFixed(4)} mm2 = ${((aHigh / meshArea) * 100).toFixed(4)}% of mesh   [EXACT]`);
  log(`     CURTAIN (graphRatio > ${CURTAIN_RATIO}; the analytic ruler is UNDEFINED there)`);
  log(`            edges ${curtainEdges.length} (${((curtainEdges.length / Math.max(1, highEdges.length)) * 100).toFixed(2)}% of high)  facets ${uCurt.length}  AREA ${aCurt.toFixed(4)} mm2 = ${((aCurt / Math.max(1e-12, aHigh)) * 100).toFixed(2)}% of the high class   [EXACT]`);
  log(`     WALL   edges ${wallEdges.length} (${((wallEdges.length / Math.max(1, highEdges.length)) * 100).toFixed(2)}% of high)  facets ${uWall.length}  AREA ${aWall.toFixed(4)} mm2 = ${((aWall / Math.max(1e-12, aHigh)) * 100).toFixed(2)}% of the high class   [EXACT]`);
  Object.assign(row, {
    highEdges: highEdges.length, highFacets: uHigh.length, highAreaMm2: aHigh,
    curtainEdges: curtainEdges.length, curtainFacets: uCurt.length, curtainAreaMm2: aCurt,
    curtainShareOfHighAreaPct: (aCurt / Math.max(1e-12, aHigh)) * 100,
    wallEdges: wallEdges.length, wallFacets: uWall.length, wallAreaMm2: aWall,
    wallShareOfHighAreaPct: (aWall / Math.max(1e-12, aHigh)) * 100,
  });

  if (highEdges.length === 0) {
    log('     *** NO VISIBLE CLASS: this mesh has zero interior edges over 45 deg. ***');
    row.verdict = 'NO VISIBLE CLASS'; return row;
  }

  // straddling vs conformed, on a capped golden sample of the WALL edges
  const wallIdx = goldenSample(wallEdges.length, Math.min(CAP_WALL, wallEdges.length));
  const wallSamp = wallIdx.map((i) => wallEdges[i]);
  const capFiredWall = wallSamp.length < wallEdges.length;
  const stradEdges: number[] = []; const confEdges: number[] = [];
  const normHiOf = new Map<number, number>(); const normLoOf = new Map<number, number>();
  const dropOf = new Map<number, number>();
  for (const e of wallSamp) {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    for (const f of [f1, f2]) {
      if (!normHiOf.has(f)) { normHiOf.set(f, orientOf(f, INSET_HI, K_OBS).normDeg); normLoOf.set(f, orientOf(f, INSET_LO, K_OBS).normDeg); }
    }
    const normHi = Math.max(normHiOf.get(f1) as number, normHiOf.get(f2) as number);
    const normLo = Math.max(normLoOf.get(f1) as number, normLoOf.get(f2) as number);
    const drop = normLo > 1e-9 ? normHi / normLo : 1;
    dropOf.set(e, drop);
    if (drop >= DROP_CUT && normHi > NORMHI_CUT) stradEdges.push(e); else confEdges.push(e);
  }
  const uStradS = uniqOf(stradEdges); const uConfS = uniqOf(confEdges); const uWallS = uniqOf(wallSamp);
  const aStradS = areaOf(uStradS); const aConfS = areaOf(uConfS); const aWallS = areaOf(uWallS);
  const stradShareOfWallArea = (aStradS / Math.max(1e-12, aWallS)) * 100;
  const scale = wallEdges.length / Math.max(1, wallSamp.length);
  log(`     of the WALL class${capFiredWall ? `, on a golden sample of ${wallSamp.length}/${wallEdges.length} edges (${(100 / scale).toFixed(2)}%)` : ' (COMPLETE, no cap)'}:`);
  log(`        STRADDLING (drop >= ${DROP_CUT} AND normDeg@.05 > ${NORMHI_CUT})  edges ${stradEdges.length} (${((stradEdges.length / Math.max(1, wallSamp.length)) * 100).toFixed(2)}% of sampled wall)  facets ${uStradS.length}  AREA ${aStradS.toFixed(4)} mm2 = ${stradShareOfWallArea.toFixed(2)}% of sampled-wall area`);
  log(`        CONFORMED  (the rest)                          edges ${confEdges.length} (${((confEdges.length / Math.max(1, wallSamp.length)) * 100).toFixed(2)}%)  facets ${uConfS.length}  AREA ${aConfS.toFixed(4)} mm2 = ${((aConfS / Math.max(1e-12, aWallS)) * 100).toFixed(2)}%`);
  log(`        extrapolated STRADDLING edges over the whole wall class ~ ${Math.round(stradEdges.length * scale)}   (S112 Gothic: 5,174 of 13,092)`);
  const drops = wallSamp.map((e) => dropOf.get(e) as number);
  log(`        inset-drop normDeg(.05)/normDeg(0)  p10 ${q(drops, 0.1).toFixed(3)} p50 ${q(drops, 0.5).toFixed(3)} p90 ${q(drops, 0.9).toFixed(3)}`);
  Object.assign(row, {
    wallSampled: wallSamp.length, wallCapFired: capFiredWall,
    stradEdgesSampled: stradEdges.length, stradEdgesExtrap: Math.round(stradEdges.length * scale),
    stradFacetsSampled: uStradS.length, stradAreaSampledMm2: aStradS,
    stradShareOfWallAreaPct: stradShareOfWallArea,
    confEdgesSampled: confEdges.length, confShareOfWallAreaPct: (aConfS / Math.max(1e-12, aWallS)) * 100,
    dropP10: q(drops, 0.1), dropP50: q(drops, 0.5), dropP90: q(drops, 0.9),
  });

  // ── FLANK ORACLE MACHINERY (S113-OP4 verbatim in construction) ───────────────────────────────────
  interface Samp2 { n: Float64Array; pth: Float64Array; pz: Float64Array; m: number }
  function sampleFacet(f: number, k: number): Samp2 {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    const rRef = rRefOf(f);
    const cap = ((k + 1) * (k + 2)) / 2;
    const n = new Float64Array(cap * 4 * 3); const pth = new Float64Array(cap * 4); const pz = new Float64Array(cap * 4);
    let m = 0;
    for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      const th = wa * ath + wb * bth + wc * cth;
      const z = wa * az + wb * bz + wc * cz;
      const nc = nsKink(th, z, scratch);
      for (let qi = 0; qi < nc; qi += 1) {
        n[m * 3] = scratch[qi * 3]; n[m * 3 + 1] = scratch[qi * 3 + 1]; n[m * 3 + 2] = scratch[qi * 3 + 2];
        pth[m] = rRef * th; pz[m] = z; m += 1;
      }
    }
    return { n, pth, pz, m };
  }
  // NOTE: a `function` declaration, not a `const` arrow, ON PURPOSE — the whole flank-machinery block is
  // hoisted so the SMOOTH NEGATIVE CONTROL (CTL-B) can run BEFORE Stage 3's early returns. A style with
  // no visible class must still get its control printed; an unguarded ruler is not evidence.
  function angU(a: Float64Array, ai: number, b: Float64Array, bi: number): number {
    let dp = a[ai] * b[bi] + a[ai + 1] * b[bi + 1] + a[ai + 2] * b[bi + 2];
    dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
    return Math.acos(dp);
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
  /**
   * The merged-pair across-crease turn, probed at the crease over the CLOSEST cross-flank sample pairs,
   * PLUS the total normal-set DIAMETER over the merged footprint.
   *
   * *** WHY BOTH, AND WHY THE DIAMETER IS NOT OPTIONAL. *** `sepCreaseDeg` answers "is there a JUMP" —
   * S113's question, because on Gothic the visible edges sit on C0 creases. It reads SMALL on a footprint
   * where the surface turns 45 deg SMOOTHLY, because adjacent lattice samples then differ by little. But
   * a smooth 45-deg turn across a coarse pair is ALSO not a mesh placement defect: it is real geometry
   * that DENSITY fixes and a flip does not. Reporting only `sepCreaseDeg` would file that case as
   * "mesh defect" and repeat the campaign's own history of mislabelling under-resolution. The diameter
   * separates the three cases and all three are printed.
   */
  function pairTurn(f1: number, f2: number): { sepCreaseDeg: number; sepCentDeg: number; crease: boolean; gapMm: number; diamDeg: number } {
    const s1 = sampleFacet(f1, K_LAT); const s2 = sampleFacet(f2, K_LAT);
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
    let diam = 0;
    for (let a = 0; a < m; a += 1) for (let b = a + 1; b < m; b += 1) {
      const t = angU(n, a * 3, n, b * 3); if (t > diam) diam = t;
    }
    const sepCentDeg = sp.sepRad * DEG;
    const minSide = Math.min(idxA.length, idxB.length);
    const crease = sepCentDeg >= SEP_MIN && minSide >= 2 && sepCentDeg > Math.max(sp.wA, sp.wB) * DEG;
    return { sepCreaseDeg: sepCrease * DEG, sepCentDeg, crease, gapMm: gap, diamDeg: diam * DEG };
  }
  /** single-footprint flank classifier — the object CTL-B tests */
  function footCrease(f: number): boolean {
    const s = sampleFacet(f, K_LAT);
    const sp = twoMeans(s.n, s.m);
    let nA = 0; let nB = 0;
    for (let i = 0; i < s.m; i += 1) (sp.lab[i] === 0 ? nA += 1 : nB += 1);
    const sepDeg = sp.sepRad * DEG;
    return sepDeg >= SEP_MIN && Math.min(nA, nB) >= 2 && sepDeg > Math.max(sp.wA, sp.wB) * DEG;
  }

  // ── STAGE 4: THE HEADLINE — IRREDUCIBLE SHARE OF THE STRADDLING CLASS ────────────────────────────
  if (stradEdges.length === 0) {
    log('');
    log('  *** THE STRADDLING CLASS IS EMPTY on this mesh. There is no analogue of the Gothic figure to report. ***');
    row.verdict = 'NO STRADDLING CLASS'; return row;
  }
  const sIdx = goldenSample(stradEdges.length, Math.min(CAP_STRAD, stradEdges.length));
  const sSamp = sIdx.map((i) => stradEdges[i]);
  const capFiredStrad = sSamp.length < stradEdges.length;
  const turns: number[] = []; const irrPair: boolean[] = []; const creaseLab: boolean[] = [];
  const gaps: number[] = []; const diams: number[] = [];
  for (const e of sSamp) {
    const t = pairTurn(d.edgeF1[e], d.edgeF2[e]);
    turns.push(t.sepCreaseDeg); irrPair.push(t.sepCreaseDeg >= HI_DEG); creaseLab.push(t.crease);
    gaps.push(t.gapMm); diams.push(t.diamDeg);
  }

  // ── CTL-D  AREA-MATCHED SMOOTH CONTROL. CTL-B's smooth facets are SMALL (they have a small dihedral
  //    partly BECAUSE they are small), so CTL-B does not price the classifier's specificity at the
  //    target class's own footprint size. This one does: smooth facets drawn from the target class's own
  //    [p10,p90] AREA band. A one-sided bar is vacuous — this asserts the FLOOR (the classifier must fire
  //    far more on the target than on the matched control) as well as the ceiling. ─────────────────────
  //    *** THE FIRST VERSION OF THIS CONTROL WAS BROKEN AND ITS OWN OUTPUT SAID SO. *** It paired
  //    `matched[i]` with `matched[i+1]` — two smooth facets drawn INDEPENDENTLY from anywhere on the pot
  //    — and duly reported a "crease turn" of p50 128 deg / MAX 175 deg, which is just the angle between
  //    opposite sides of the vessel. The control must be an ADJACENT pair, exactly like the target, so it
  //    is drawn from smooth INTERIOR EDGES. The broken number is recorded here rather than deleted.
  const tgtAreas = uniqOf(sSamp).map((f) => d.areaMm2[f]);
  const aLoB = q(tgtAreas, 0.1); const aHiB = q(tgtAreas, 0.9);
  const matchedE: number[] = [];
  {
    const loThr = (2 * Math.PI) / 180;
    const cand = goldenSample(d.interiorEdges, Math.min(d.interiorEdges, CTLN * 400));
    for (const e of cand) {
      if (matchedE.length >= CTLN) break;
      if (!(d.edgeAngRad[e] < loThr)) continue;
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) continue;
      if (d.areaMm2[f1] < aLoB || d.areaMm2[f1] > aHiB || d.areaMm2[f2] < aLoB || d.areaMm2[f2] > aHiB) continue;
      matchedE.push(e);
    }
  }
  let ctlDRate = NaN; let ctlDTurnP50 = NaN; let ctlDTurnMax = NaN; let ctlDDiamP50 = NaN; let ctlDDiamMax = NaN;
  log('');
  log(`  ── CTL-D  AREA-MATCHED SMOOTH ADJACENT-PAIR CONTROL (target facet AREA band p10..p90 = ${aLoB.toExponential(3)}..${aHiB.toExponential(3)} mm2) ──`);
  if (matchedE.length >= 50) {
    let cN = 0; const mt: number[] = []; const md: number[] = [];
    for (const e of matchedE) {
      if (footCrease(d.edgeF1[e])) cN += 1;
      const t = pairTurn(d.edgeF1[e], d.edgeF2[e]);
      mt.push(t.sepCreaseDeg); md.push(t.diamDeg);
    }
    ctlDRate = (cN / matchedE.length) * 100;
    ctlDTurnP50 = q(mt, 0.5); ctlDTurnMax = mx(mt); ctlDDiamP50 = q(md, 0.5); ctlDDiamMax = mx(md);
    const overVis = mt.filter((x) => x >= HI_DEG).length;
    log(`     n=${matchedE.length} smooth adjacent pairs (edge dihedral < 2 deg) at the target's own facet size.`);
    log(`     flank classifier fires on ${ctlDRate.toFixed(2)}%   (VOIDS the style if > 5%)`);
    log(`     probed crease turn  p50 ${ctlDTurnP50.toFixed(3)}  p90 ${q(mt, 0.9).toFixed(3)}  MAX ${ctlDTurnMax.toFixed(2)} deg   |  ${overVis} of ${mt.length} would be called IRREDUCIBLE (must be ~0)`);
    log(`     normal-set diameter p50 ${ctlDDiamP50.toFixed(3)}  MAX ${ctlDDiamMax.toFixed(2)} deg   <<< THE FLOOR: this must be FAR BELOW the target's diameter, or the`);
    log('         "smooth sweep" bucket is measuring facet size rather than geometry.');
    // *** WHICH CONTROL GUARDS WHICH NUMBER. *** These are two different false-positive rates and the
    // first version of this block conflated them, voiding a style on a control that does not guard the
    // reported quantity. The HEADLINE is `sepCreaseDeg >= 45`, so its false-positive rate is `overVis`
    // and ONLY that voids it. `ctlDRate` is the false-positive rate of the CREASE LABEL (2-means with
    // sepMin), which feeds no verdict here — when it fires it is reported as a CAVEAT on the label.
    if (overVis / Math.max(1, mt.length) > 0.05) {
      log(`     *** CTL-D FIRED ON THE HEADLINE QUANTITY: ${overVis}/${mt.length} smooth pairs would be called IRREDUCIBLE.`);
      log('         THE IRREDUCIBILITY NUMBER FOR THIS STYLE IS VOID. ***');
      ctlVoid = true; ctlVoidWho = 'CTL-D headline false-positives';
    }
    if (ctlDRate > 5) {
      log(`     ⚠ CAVEAT (NOT a void): the CREASE LABEL over-fires at this facet size (${ctlDRate.toFixed(2)}% on smooth pairs).`);
      log('         The label is unreliable on this mesh; the headline does not use it, but do not quote it as a crease census.');
      row.creaseLabelUnreliable = true;
    }
    Object.assign(row, { ctlDOverVis: overVis, ctlDPairs: mt.length });
  } else {
    log(`     only ${matchedE.length} smooth adjacent pairs exist in the target's area band; CTL-D CANNOT RUN on this mesh.`);
    log('     (a mesh whose facets at that size are ALL high-dihedral has no matched smooth population — itself informative)');
  }
  Object.assign(row, { ctlDN: matchedE.length, ctlDRatePct: ctlDRate, ctlDTurnP50, ctlDTurnMax, ctlDDiamP50, ctlDDiamMax, ctlDAreaBand: [aLoB, aHiB] });
  // FLOOR ASSERTION (a one-sided bar is vacuous): the classifier must FIRE on the target class at all.
  const creaseRateTarget = (creaseLab.filter(Boolean).length / creaseLab.length) * 100;

  // facet-level area, deduplicated, LOOSE (any pair irreducible) and STRICT (all pairs)
  const anyIrr = new Map<number, boolean>(); const allIrr = new Map<number, boolean>();
  for (let i = 0; i < sSamp.length; i += 1) {
    for (const f of [d.edgeF1[sSamp[i]], d.edgeF2[sSamp[i]]]) {
      anyIrr.set(f, (anyIrr.get(f) ?? false) || irrPair[i]);
      allIrr.set(f, (allIrr.get(f) ?? true) && irrPair[i]);
    }
  }
  const uS = Array.from(anyIrr.keys());
  const aTarget = areaOf(uS);
  let aLoose = 0; let nLoose = 0; let aStrict = 0; let nStrict = 0; let ties = 0;
  for (const f of uS) {
    if (anyIrr.get(f) === true) { aLoose += d.areaMm2[f]; nLoose += 1; }
    if (allIrr.get(f) === true) { aStrict += d.areaMm2[f]; nStrict += 1; }
    if ((anyIrr.get(f) === true) !== (allIrr.get(f) === true)) ties += 1;
  }
  const irrAreaPct = (aLoose / Math.max(1e-12, aTarget)) * 100;
  const irrAreaStrictPct = (aStrict / Math.max(1e-12, aTarget)) * 100;
  const irrCountPct = (irrPair.filter(Boolean).length / irrPair.length) * 100;
  log('');
  log('  ════════════════════════════════════════════════════════════════════════════════════════════');
  log(`  THE HEADLINE — IRREDUCIBLE SHARE OF THE STRADDLING CLASS${capFiredStrad ? `  (golden sample ${sSamp.length}/${stradEdges.length} straddling pairs)` : '  (COMPLETE)'}`);
  log('  ════════════════════════════════════════════════════════════════════════════════════════════');
  log(`     analytic across-crease turn over the pair footprint  p10 ${q(turns, 0.1).toFixed(2)}  p50 ${q(turns, 0.5).toFixed(2)}  p90 ${q(turns, 0.9).toFixed(2)}  MAX ${mx(turns).toFixed(2)} deg`);
  log(`     probe parameter gap  p50 ${q(gaps, 0.5).toExponential(2)} mm  p90 ${q(gaps, 0.9).toExponential(2)} mm   (how tight the bracket on the crease is)`);
  log(`     pair-level flank classifier fires on ${creaseRateTarget.toFixed(2)}% of the TARGET class   (FLOOR: must be well above CTL-B's ${Number.isFinite(ctlCreaseRate) ? ctlCreaseRate.toFixed(2) : 'n/a'}% on smooth)`);
  log(`     IRREDUCIBLE by COUNT (pairs)   ${irrPair.filter(Boolean).length}/${irrPair.length} = ${irrCountPct.toFixed(2)}%`);
  log(`     IRREDUCIBLE by AREA  (loose)   COUNT ${nLoose}/${uS.length} facets   AREA ${aLoose.toFixed(4)} / ${aTarget.toFixed(4)} mm2 = ${irrAreaPct.toFixed(2)}%     <<< THE GOTHIC ANALOGUE (Gothic: 99.40%)`);
  log(`     IRREDUCIBLE by AREA  (strict)  COUNT ${nStrict}/${uS.length} facets   AREA ${aStrict.toFixed(4)} mm2 = ${irrAreaStrictPct.toFixed(2)}%   ambiguous facets ${ties}`);
  log(`     REDUCIBLE remainder            AREA ${(aTarget - aLoose).toFixed(4)} mm2 = ${(100 - irrAreaPct).toFixed(2)}% of the straddling class = ${(((aTarget - aLoose) / meshArea) * 100 * (capFiredStrad ? stradEdges.length / sSamp.length : 1)).toFixed(5)}% of mesh (scaled)`);
  const redTurns = turns.filter((t) => t < HI_DEG);
  if (redTurns.length > 0) log(`     among REDUCIBLE pairs the analytic turn is p50 ${q(redTurns, 0.5).toFixed(2)}  p90 ${q(redTurns, 0.9).toFixed(2)}  MAX ${mx(redTurns).toFixed(2)} deg`);

  // ── THE THREE-WAY SPLIT. `sepCreaseDeg >= 45` alone files a SMOOTH 45-deg turn as "mesh defect".
  //    It is not one — it is real geometry that DENSITY fixes. All three buckets, COUNT + AREA. ──────
  const bucketOf = (i: number): 0 | 1 | 2 => (turns[i] >= HI_DEG ? 0 : diams[i] >= HI_DEG ? 1 : 2);
  const bArea = [0, 0, 0]; const bCount = [0, 0, 0];
  {
    // per-pair area attribution: split each pair's two facet areas between its own bucket, deduplicated
    // by taking, for each facet, the SMALLEST bucket index any of its pairs assigns (0 beats 1 beats 2).
    const best = new Map<number, number>();
    for (let i = 0; i < sSamp.length; i += 1) {
      bCount[bucketOf(i)] += 1;
      for (const f of [d.edgeF1[sSamp[i]], d.edgeF2[sSamp[i]]]) {
        const b = bucketOf(i);
        best.set(f, Math.min(best.get(f) ?? 9, b));
      }
    }
    for (const [f, b] of best) bArea[b] += d.areaMm2[f];
  }
  const tot3 = bArea[0] + bArea[1] + bArea[2];
  log('');
  log('     ── THE THREE-WAY SPLIT OF THE STRADDLING CLASS (the diameter is what separates 2 from 3) ──');
  log(`        normal-set DIAMETER over the pair footprint  p10 ${q(diams, 0.1).toFixed(2)}  p50 ${q(diams, 0.5).toFixed(2)}  p90 ${q(diams, 0.9).toFixed(2)}  MAX ${mx(diams).toFixed(2)} deg`);
  log(`        (1) CREASE >= ${HI_DEG} deg   — a genuine C0 jump; NO correct mesh removes the visible edge`);
  log(`            COUNT ${bCount[0]} pairs (${((bCount[0] / sSamp.length) * 100).toFixed(2)}%)   AREA ${bArea[0].toFixed(4)} mm2 = ${((bArea[0] / Math.max(1e-12, tot3)) * 100).toFixed(2)}%`);
  log(`        (2) SMOOTH SWEEP >= ${HI_DEG} deg — the surface really turns that far, but SMOOTHLY; DENSITY fixes it, a flip does not`);
  log(`            COUNT ${bCount[1]} pairs (${((bCount[1] / sSamp.length) * 100).toFixed(2)}%)   AREA ${bArea[1].toFixed(4)} mm2 = ${((bArea[1] / Math.max(1e-12, tot3)) * 100).toFixed(2)}%`);
  log(`        (3) MESH-MANUFACTURED   — the surface turns LESS than the visible bar across the whole pair`);
  log(`            COUNT ${bCount[2]} pairs (${((bCount[2] / sSamp.length) * 100).toFixed(2)}%)   AREA ${bArea[2].toFixed(4)} mm2 = ${((bArea[2] / Math.max(1e-12, tot3)) * 100).toFixed(2)}%`);
  const realGeomPct = ((bArea[0] + bArea[1]) / Math.max(1e-12, tot3)) * 100;
  log(`        REAL GEOMETRY (1)+(2) = ${realGeomPct.toFixed(2)}% of the straddling class by AREA`);
  Object.assign(row, {
    diamP10: q(diams, 0.1), diamP50: q(diams, 0.5), diamP90: q(diams, 0.9), diamMax: mx(diams),
    bucketCreaseCount: bCount[0], bucketSweepCount: bCount[1], bucketMeshCount: bCount[2],
    bucketCreaseAreaPct: (bArea[0] / Math.max(1e-12, tot3)) * 100,
    bucketSweepAreaPct: (bArea[1] / Math.max(1e-12, tot3)) * 100,
    bucketMeshAreaPct: (bArea[2] / Math.max(1e-12, tot3)) * 100,
    realGeometryAreaPct: realGeomPct,
  });

  let verdict: string;
  if (ctlVoid) verdict = `VOID (${ctlVoidWho})`;
  else if (!Number.isFinite(ctlCreaseRate)) verdict = 'INCONCLUSIVE (no smooth control available)';
  else if (sSamp.length < 200) verdict = `INCONCLUSIVE (straddling class only ${stradEdges.length} pairs)`;
  else if (irrAreaPct >= 90) verdict = 'CONFIRMS';
  else if (irrAreaPct <= 60) verdict = 'CONTRADICTS';
  else verdict = 'INCONCLUSIVE (60-90%)';
  log('');
  log(`     >>> PC-1 VERDICT for ${style}:  ${verdict}   (irreducible AREA ${irrAreaPct.toFixed(2)}%; rule fixed before the run: >=90 CONFIRMS, <=60 CONTRADICTS)`);
  Object.assign(row, {
    stradSampled: sSamp.length, stradCapFired: capFiredStrad,
    turnP10: q(turns, 0.1), turnP50: q(turns, 0.5), turnP90: q(turns, 0.9), turnMax: mx(turns),
    gapP50: q(gaps, 0.5), creaseRateTargetPct: creaseRateTarget,
    irrCountPct, irrAreaLoosePct: irrAreaPct, irrAreaStrictPct,
    irrFacetsLoose: nLoose, targetFacets: uS.length, targetAreaMm2: aTarget,
    redTurnP50: redTurns.length > 0 ? q(redTurns, 0.5) : null,
    verdict, ctlVoid, ctlVoidWho,
  });
  log(`  ${el()}`);
  return row;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
mkdirSync(OUTDIR, { recursive: true });
const EXCH = process.env.PF_S114C_EXCH ?? 'research/exchange/_strataConformBisect';
const DEFAULT_LIST = [
  'GyroidManifold:gyroidmanifold_ring_D--.stl',
  'HarmonicRipple:harmonicripple_ring_D--C.stl',
  'HexagonalHive:hexagonalhive_ring_D--.stl',
  'LowPolyFacet:lowpolyfacet_ring_D--.stl',
  'RippleInterference:rippleinterference_ring_D--.stl',
].join(',');
const LIST = (process.env.PF_S114C_LIST ?? DEFAULT_LIST).split(',').map((s) => s.trim()).filter((s) => s.length > 0);
const ANCHOR = process.env.PF_S114C_ANCHOR ?? 'GothicArches:gothicarches_ring_DS-HT_S39CTL.stl';
const RUN_ANCHOR = (process.env.PF_S114C_RUN_ANCHOR ?? '1') === '1';
const TAG = process.env.PF_S114C_TAG ?? 'C';

log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
log('===== S114-C — THE ALL-STYLES SWEEP ON THE HONEST RULER, QUARTER C =====');
log('  roster (alphabetical, positions 11-15 of 20): GyroidManifold HarmonicRipple HexagonalHive');
log('                                                LowPolyFacet RippleInterference');
log(`  cuts: dihedral > ${HI_DEG} deg | curtain graphRatio > ${CURTAIN_RATIO} | straddling drop >= ${DROP_CUT} and normDeg@${INSET_HI} > ${NORMHI_CUT}`);
log(`  ruler: orientOfFacet k=${K_OBS}, kink-aware fdNormals, WINDING, insets ${INSET_LO} and ${INSET_HI}`);
log(`  oracle: lattice K=${K_LAT}, sepMin ${SEP_MIN} deg, ${NCROSS} closest cross-flank pairs`);
log(`  dims H=${DIMS.H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}   PRECOND refusal bar ${PRECOND_UM} um`);
log(`  caps: normDeg sample ${NSAMP}  wall ${CAP_WALL}  straddling ${CAP_STRAD}  ladder ${NLADDER}  control ${CTLN}`);
log('  VERDICT RULE, FIXED BEFORE THE RUN: irreducible AREA >= 90% CONFIRMS, <= 60% CONTRADICTS, else INCONCLUSIVE.');
log('  *** NEVER AVERAGED ACROSS STYLES. ***');
log('═══════════════════════════════════════════════════════════════════════════════════════════════════');

const rows: StyleRow[] = [];
const todo: Array<[string, string, boolean]> = [];
if (RUN_ANCHOR) { const [s, f] = ANCHOR.split(':'); todo.push([s, `${EXCH}/${f}`, true]); }
for (const item of LIST) { const [s, f] = item.split(':'); todo.push([s, `${EXCH}/${f}`, false]); }

for (const [s, f, isA] of todo) {
  try { rows.push(measureStyle(s, f, isA)); }
  catch (err) {
    log(`  *** ${s} THREW: ${(err as Error).message} ***`);
    rows.push({ style: s, stl: f, anchor: isA, error: (err as Error).message, verdict: 'ERROR' });
  }
}

// ── THE TABLE ────────────────────────────────────────────────────────────────────────────────────────
log('');
log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
log('S114-C PER-STYLE TABLE  (COUNT + AREA + MAX on every population; NEVER averaged across styles)');
log('═══════════════════════════════════════════════════════════════════════════════════════════════════');
const cols = ['style', 'nTri', 'PRECONDum', 'areaMm2', 'dihP50', 'dihP99', 'dihMAX', 'A>45%',
  'nd0_p50', 'nd0_MAX', 'nd5_p50', 'nd5_p99', 'nd5_MAX', 'nd5_A>1%', 'nd5_A>5%',
  'curtA%', 'wallA%', 'stradA%ofWall', 'IRR_A%', 'crease%', 'sweep%', 'mesh%', 'real%', 'VERDICT'];
log(cols.join(' | '));
for (const r of rows) {
  const g = (k: string): string => {
    const v = r[k];
    return typeof v === 'number' ? (Number.isFinite(v) ? v.toFixed(v >= 100 ? 1 : 4) : 'n/a') : String(v ?? '-');
  };
  const nd0 = r['normDeg_inset0'] as { p50: number; max: number } | undefined;
  const nd5 = r[`normDeg_inset${INSET_HI}`] as { p50: number; p99: number; max: number; over1AreaPct: number; over5AreaPct: number } | undefined;
  log([
    r.style, r.nTri ?? '-', g('precondUm'), g('meshAreaMm2'),
    g('edgeDegP50'), g('edgeDegP99'), g('edgeDegMax'), g('areaShareOver45Pct'),
    nd0 ? nd0.p50.toFixed(4) : '-', nd0 ? nd0.max.toFixed(2) : '-',
    nd5 ? nd5.p50.toFixed(4) : '-', nd5 ? nd5.p99.toFixed(3) : '-', nd5 ? nd5.max.toFixed(2) : '-',
    nd5 ? nd5.over1AreaPct.toFixed(3) : '-', nd5 ? nd5.over5AreaPct.toFixed(3) : '-',
    g('curtainShareOfHighAreaPct'), g('wallShareOfHighAreaPct'), g('stradShareOfWallAreaPct'),
    g('irrAreaLoosePct'), g('bucketCreaseAreaPct'), g('bucketSweepAreaPct'), g('bucketMeshAreaPct'),
    g('realGeometryAreaPct'), String(r.verdict ?? '-'),
  ].join(' | '));
}
log('');
log('VERDICTS:');
for (const r of rows) log(`  ${String(r.style).padEnd(20)} ${String(r.verdict ?? '-')}`);

writeFileSync(`${OUTDIR}/S114_SWEEP_${TAG}.json`, `${JSON.stringify({
  tool: 's114SweepC.ts', tag: TAG, generatedAt: new Date().toISOString(),
  cuts: { HI_DEG, CURTAIN_RATIO, DROP_CUT, NORMHI_CUT, K_OBS, INSET_LO, INSET_HI, K_LAT, SEP_MIN, NCROSS, H_FD },
  dims: DIMS, caps: { NSAMP, CAP_WALL, CAP_STRAD, NLADDER, CTLN }, precondBarUm: PRECOND_UM,
  verdictRule: { confirmsAtOrAbovePct: 90, contradictsAtOrBelowPct: 60, minPairs: 200 },
  rows,
}, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_SWEEP_${TAG}.json`);
log(`done ${el()}`);
