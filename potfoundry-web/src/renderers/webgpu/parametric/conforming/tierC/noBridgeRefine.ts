/**
 * noBridgeRefine.ts — the Tier-C fidelity core: no-bridge crest lock + the
 * whole-mesh honest-brute interior refinement loop.
 *
 * Port of research/bridge/_pf_perfectMesherBruteLib refineInteriorBruteWhole
 * (VALIDATION 7: drove Gothic 32→0 and GeoStar 791→0 residuals to LITERAL
 * whole-mesh 0 interior outliers, watertight, flat-P1). Mechanism:
 *
 *  - NO-BRIDGE: the protected complex's constraint edges are passed to cdt2d
 *    and re-passed unchanged on every re-triangulation, so every crest chain
 *    is a set of SHARED mesh edges — two flank facets meet AT the ridge and
 *    no facet interior straddles the zero-width cusp.
 *  - WHOLE-MESH stop driver: EVERY facet is scored EVERY pass (never an
 *    active-cavity restriction — that hid moderate-gradU residuals). PHASE A
 *    uses the cheap 7-pt lattice to converge the dense near-crest tail;
 *    PHASE B switches to the dense 45-pt lattice == the acceptance guard, so
 *    the loop can SEE everything the guard measures. Convergence only counts
 *    under the dense driver.
 *  - Edge-mode RED 1→4 insertion: outlier facets split at all three edge
 *    midpoints (in-chart, lifted on-surface), so a persistent apex facet
 *    converges geometrically; crest-edge midpoints are themselves on the
 *    crest (the constraint set keeps them locked).
 *  - Cap-hit facets remain outliers — honest; the caller's guard decides.
 *
 * @module conforming/tierC/noBridgeRefine
 */

import cdt2d from 'cdt2d';
import type { SurfaceSampler } from '../SurfaceSampler';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';
import type { ProtectedComplex } from './morseComplex';
import {
  BARY_STOP,
  denseBary,
  facetInteriorHonest,
  liftChartMesh,
  radialSurfaceFromSampler,
  analyticSurfaceSampler,
  radialSurfaceFromAnalytic,
  type ChartMesh,
  type RadialSurface,
  type RulerOptions,
} from './interiorRuler';

/** A rectangular chart domain (u in [0,1) fractions, t in [0,1]). */
export interface ChartDomain {
  uLo: number;
  uHi: number;
  tLo: number;
  tHi: number;
}

export interface RefineOptions {
  tolMm: number;
  maxPass: number;
  /** PHASE-A passes on the cheap 7-pt driver before the dense driver. */
  bulkPasses7pt: number;
  /** Background seed grid pitch (mm of 3D arc). */
  bgArcMm: number;
  /** Max 3D pitch (mm) constraint chains are densified to (default 0.15). */
  maxConstraintMm?: number;
  /**
   * ADAPTIVE SEED (LEVER A, opt-in, default off ⇒ uniform bgArcMm unchanged).
   * When set, the background t-rows are placed CURVATURE-ADAPTIVELY: at each t
   * level the local chord-sag over one row of pitch h is ≈ h²·|r''(z)|/8, so a
   * uniform bgArcMm leaves a marginal-facet tail exactly where |r''| is high
   * (the smooth low-κ HIGH-amplitude arch arc the κ-ridge detector correctly
   * ignores — MEASURED at t≈0.465 |r''|≈2 ⇒ sag@0.3 = 0.022mm > tol). The
   * field targets the pitch that makes sag == `tolMm` (clamped to
   * [`hMinMm`, bgArcMm]), sampling |r''(z)| = max over the domain u-range so the
   * density responds to the worst chord-sag at each t. Rows are placed at equal
   * cumulative-density intervals ⇒ SUB-tol pitch ONLY on the high-|r''| bands,
   * coarse elsewhere (uniform-tighten explodes tris past the 6M budget). u stays
   * uniform (the u-ridges are already carried by locked constraint edges).
   */
  adaptiveSeed?: boolean;
  /** Adaptive-seed floor pitch (mm 3D arc). Default 0.09 (measured need). */
  hMinMm?: number;
  /** Adaptive-seed recursion depth cap. Default 5. */
  adaptiveMaxLevel?: number;
  /** Adaptive-seed: also split in u (default true). False ⇒ t-only rows. */
  adaptiveUSplit?: boolean;
  /**
   * RIB-AWARE seed (LEVER, E-2026-07-08-TIERC-RIBAWARE-SEED, opt-in). The plain
   * adaptive sag field (LEVER A) fires ~UNIFORMLY across all t-bands because RIB
   * curvature dominates the local chord-sag everywhere — yet the ribs are ALREADY
   * carried by the locked protected-complex constraint chains + the refine loop,
   * so seeding them again wastes tris (measured 8.3M full-pot, over 6M). RIB-AWARE
   * modes EXCLUDE constraint-chain-carried curvature from the sag field so seeding
   * densifies ONLY the smooth residual (the dead-zone arch arc):
   *  - 'mask' (design a): a cell only sag-splits if its center is FURTHER than
   *    `ribBandMm` (3D mm) from ANY constraint-chain point. Rib flanks lie within
   *    the band of a locked chain ⇒ ignored; the smooth arch bump is far from any
   *    chain ⇒ still seeds. Cheapest; a spatial hash over chain points.
   *  - 'thetaAvg' (design c): the t-axis sag is computed on the θ-AVERAGED profile
   *    r̄(t) (mean r over the domain u-range at each t) instead of max-over-u. r̄(t)
   *    captures the horizontal arch arc EXACTLY and is immune to rib content (ribs
   *    average out along θ). The u-axis sag is left off (u-ridges = locked edges).
   * Default undefined ⇒ plain LEVER-A behaviour (byte-identical to prior).
   */
  ribAwareMode?: 'mask' | 'thetaAvg';
  /** Rib-aware 'mask' distance band (3D mm) around any constraint chain. Default 1.0. */
  ribBandMm?: number;
  /**
   * SPLIT MODE (LEVER, E-2026-07-08-TIERC-ANISO-RED, opt-in, default undefined ⇒
   * ISOTROPIC RED 1→4 — BYTE-IDENTICAL to prior). 'aniso' switches an outlier
   * facet's refinement from all-3-edge-midpoints to a SINGLE-edge bisection along
   * the SAG-DOMINANT (across-crest / high-|r''|) direction: a rib-flank facet's
   * P1 chord-sag is dominated by ONE axis (VALIDATION 5: the needle's longest edge
   * sits median ~76° to the crest ⇒ sag axis ⊥ crest), so splitting only that edge
   * buys the same across-crest sag reduction at ~half the point growth. The refine
   * loop re-CDTs the whole point set every pass, so a 1-midpoint insertion is
   * conforming with no T-junctions.
   */
  splitMode?: 'aniso';
  /**
   * ANISO direction signal (default 'edgeSag'):
   *  - 'edgeSag': bisect the edge whose P1 midpoint 3D chord-sag vs the surface is
   *    largest (3 surface evals/facet). Sag-selective by construction.
   *  - 'longEdge': bisect the longest CHART edge (mm-scaled, seam-consistent u).
   *    Cheapest — the ~76°-to-crest cross-flank edge, no surface eval.
   */
  anisoDirection?: 'edgeSag' | 'longEdge';
  /**
   * ANISO ambiguity fallback (default 0.15). If the best edge's signal is within
   * (1−anisoAspectTol)·bestSignal of the second-best edge (aspect≈1 / no dominant
   * axis, e.g. a near-equilateral apex facet), FALL BACK to isotropic 1→4 for that
   * facet — an anisotropic-only loop could stall on a facet with no short axis.
   */
  anisoAspectTol?: number;
  ruler: RulerOptions;
  /**
   * SURFACE SOURCE (LEVER, Arm C2, E-2026-07-11-TIERC-HEADTOHEAD, opt-in;
   * default undefined ⇒ 'sampler' — BYTE-IDENTICAL to prior). The K2 kernel is
   * parametrized purely over a `SurfaceSampler`; today every call site passes
   * a `styleSampler` `GpuSurfaceSampler` — a pre-evaluated bilinear grid
   * (default 512²) that CHORDS across sub-mm knife-edge crests (C1 finding:
   * ~0.17mm off analytic at Gothic's crests, sampler grid itself up to 1.35mm
   * off analytic at 512², shrinking with resolution — C1-gothic-verdict.md).
   * 'analytic' swaps the effective sampler for {@link analyticSurfaceSampler}
   * (built from `analyticRA`/`analyticH`) for BOTH placement (seed/lift/
   * insertion — every vertex then sits exactly on the analytic surface) AND
   * ruling ({@link radialSurfaceFromAnalytic} replaces
   * {@link radialSurfaceFromSampler} for `facetInteriorHonest`/
   * `scoreWholeMesh`), so the refine loop converges the mesh to the TRUE
   * surface instead of the discretized grid it otherwise targets. Requires
   * `analyticRA` when set (throws otherwise); `analyticH` defaults to the
   * height measured off the ORIGINAL `sampler` argument (z1−z0 at u=0),
   * cheap and exact since z is unaffected by radial bilinear error. Evaluating
   * `analyticRA` per query is genuinely more expensive than the grid lookup —
   * accepted; that cost IS the fidelity this buys.
   */
  surfaceSource?: 'sampler' | 'analytic';
  /** Exact analytic radius function r(theta,z); required when `surfaceSource` is 'analytic'. */
  analyticRA?: AnalyticRadiusFn;
  /** Override the analytic surface's wall height (mm); default = measured off `sampler`. */
  analyticH?: number;
  /**
   * Cross-pass DIRTY-FACET cache (default off; opt-in perf lever). A facet
   * whose canonical (u,t) signature (its 3 sorted vertex coords) is UNCHANGED
   * since a prior pass under the SAME lattice reuses its cached dev verdict —
   * the ruler is a pure function of the 3 (u,t) pairs + lattice + opts, so the
   * cached verdict is EXACT. Only unchanged facets hit; every re-triangulated
   * facet is re-scored. Byte-identical trajectory (outliers/worst/inserted/
   * tris per pass identical); only the diagnostic `bruteCalls` counter drops
   * (cached facets legitimately do no brute work — that IS the speedup).
   * A per-pass hit rate is reported via `cacheHits`/`cacheChecks` in the stat.
   */
  dirtyFacetCache?: boolean;
  /**
   * REFINE-LOOP DEDUPE CELL (mm, E-2026-07-08-TIERC-LITERAL0, opt-in; default
   * undefined ⇒ `DEDUPE_CELL_MM` = 0.004 = BYTE-IDENTICAL to prior). The refine
   * loop rejects any midpoint split whose (u,t) lands in an already-occupied
   * `dedupeCellMm`-sized cell (a sub-cell edge midpoint collapses onto an
   * endpoint under the hash). On NEAR-VERTICAL rib-flank facets — tiny (u,t)
   * footprint, large 3D relief — the residual outlier population FREEZES against
   * this 0.004mm lattice: the anisotropic split fires but ~99% of inserts are
   * dedupe-rejected (MEASURED: round-7 plateau inserted≈1230/pass vs dTris≈20 ⇒
   * outliers pinned ~1150, worst frozen 0.4689). Lowering the cell lets the loop
   * subdivide those near-vertical facets further in (u,t) so their P1 chord-sag
   * shrinks below tol. The key packs `round(u_mm/cell)*1e5 + round(t_mm/cell)`;
   * SAFE while `round(t_mm/cell) < 1e5` (t-span ~29mm ⇒ cell ≥ ~0.0003mm).
   */
  dedupeCellMm?: number;
}

export interface RefinePassStat {
  pass: number;
  nTris: number;
  outliers: number;
  worstMm: number;
  inserted: number;
  bruteCalls: number;
  dense: boolean;
  ms: number;
  /** Dirty-cache: facets whose verdict was reused this pass (0 when off). */
  cacheHits?: number;
  /** Dirty-cache: facets checked against the cache this pass (0 when off). */
  cacheChecks?: number;
}

export interface RefineResult extends ChartMesh {
  passes: number;
  capped: boolean;
  history: RefinePassStat[];
  constraintEdges: Array<[number, number]>;
}

const DEDUPE_CELL_MM = 0.004;

/**
 * Default constraint-chain 3D pitch (mm). Detector chains arrive at fine-cell
 * pitch (Gothic p50 0.99mm / p90 3.36mm / max 59mm — probe _tierc_constraintLen);
 * cdt2d cannot split a locked edge, so a long constraint edge floors every
 * crest-adjacent facet at ~L²κ/8 (a 1mm chord on a rib ≈ 0.4mm — the measured
 * plateau). Densifying to this pitch matches the research kernel's ~0.1mm
 * analytic crest chains and lets the crest refine along its length.
 */
const MAX_CONSTRAINT_MM = 0.15;

/** Build the AdaptiveSeedCfg from RefineOptions (undefined ⇒ uniform seed). */
function adaptiveCfg(opts: RefineOptions): AdaptiveSeedCfg | undefined {
  if (opts.adaptiveSeed !== true) return undefined;
  return {
    tolMm: opts.tolMm,
    hMinMm: opts.hMinMm ?? 0.09,
    maxLevel: opts.adaptiveMaxLevel ?? 5,
    uSplit: opts.adaptiveUSplit ?? true,
    ribAwareMode: opts.ribAwareMode,
    ribBandMm: opts.ribBandMm ?? 1.0,
  };
}

/**
 * 2D curvature-adaptive background seed (LEVER A). Returns non-uniform (u,t)
 * chart points whose local pitch tracks the chord-sag floor in BOTH directions.
 *
 * MEASURED CALIBRATION (E-2026-07-08-TIERC-ADAPTIVE-SEED, _adaptiveDiag):
 * on the count-unstable Gothic gate the DEAD-ZONE relief the κ-ridge detector
 * misses is a smooth 2D bump (max |d²r/dz²| ≈ 9 AND |d²r/du²| ≈ 2 at ≈(0.142,
 * 0.589)) needing pitch ~0.094mm in t AND ~0.198mm in u — a UNIFORM bgArcMm 0.3
 * seed leaves a chord-sag tail there, while a uniform hMin tighten explodes tris
 * on the flat complement (u-ridges are carried by locked edges, not the bg grid).
 *
 * Method: start from the uniform bgArcMm cell grid; recursively split any cell
 * (in u, t, or both) whose local chord sag (½·|Δ²r| across the cell span in that
 * axis, the exact P1 midpoint chord error against the grid surface) exceeds
 * `tolMm`, down to a floor pitch `hMinMm`. Emit the corner lattice of the final
 * (non-uniform) cells. This packs points into the 2D bump and NOWHERE else, so
 * the tri count stays near the uniform seed off the bump. `maxLevel` bounds it.
 */
export interface RibAwareArgs {
  /** 'mask' (chain-distance gate) or 'thetaAvg' (θ-averaged t-sag). */
  mode: 'mask' | 'thetaAvg';
  /** 'mask': flat 3D mm chain points [x0,y0,z0, x1,y1,z1, ...] to keep away from. */
  chainPtsMm?: number[];
  /** 'mask': distance band (3D mm). A cell only sag-splits if its center is >band from every chain point. */
  bandMm?: number;
}

export function adaptiveSeedPoints(
  sampler: SurfaceSampler,
  domain: ChartDomain,
  uToMm: number,
  tToMm: number,
  bgArcMm: number,
  tolMm: number,
  hMinMm: number,
  maxLevel = 5,
  uSplit = true,
  ribAware?: RibAwareArgs,
): number[] {
  const rAt = (u: number, t: number): number => {
    const [x, y] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
    return Math.hypot(x, y);
  };
  // Chord sag of the P1 midpoint of a straight cell edge vs the surface: the
  // 3D distance from the interpolated midpoint of the two endpoints' lifted
  // positions to the surface point at the parametric midpoint. For a radial
  // surface this is dominated by the radial second difference; we compute it
  // directly in 3D for both a u-edge (fixed t) and a t-edge (fixed u).
  const P = (u: number, t: number): [number, number, number] => {
    const [x, y, z] = sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
    return [x, y, z];
  };
  const edgeSagU = (u0: number, u1: number, t: number): number => {
    const A = P(u0, t);
    const B = P(u1, t);
    const M = P((u0 + u1) / 2, t);
    return Math.hypot(
      (A[0] + B[0]) / 2 - M[0],
      (A[1] + B[1]) / 2 - M[1],
      (A[2] + B[2]) / 2 - M[2],
    );
  };
  const edgeSagT = (u: number, t0: number, t1: number): number => {
    const A = P(u, t0);
    const B = P(u, t1);
    const Mm = P(u, (t0 + t1) / 2);
    return Math.hypot(
      (A[0] + B[0]) / 2 - Mm[0],
      (A[1] + B[1]) / 2 - Mm[1],
      (A[2] + B[2]) / 2 - Mm[2],
    );
  };
  // RIB-AWARE (design c) θ-AVERAGED profile r̄(t): mean radius over the domain
  // u-range at each t. Ribs (periodic in u) average out ⇒ r̄(t) is the smooth
  // horizontal arch arc alone. Cached per t (quantized) since the recursion
  // queries the same t-levels repeatedly. The t-edge sag on the θ-averaged
  // profile is computed by lifting r̄ back onto a (u=domain-mid, r̄) point so the
  // sag is in the same 3D-mm scale as the plain path.
  const AVG_N = 24;
  const uAvgLo = domain.uLo;
  const uAvgHi = domain.uHi;
  const rBarCache = new Map<number, number>();
  const rBar = (t: number): number => {
    const q = Math.round(t / 1e-5);
    const hit = rBarCache.get(q);
    if (hit !== undefined) return hit;
    let s = 0;
    for (let i = 0; i < AVG_N; i++) {
      const u = uAvgLo + ((uAvgHi - uAvgLo) * (i + 0.5)) / AVG_N;
      s += rAt(u, t);
    }
    const v = s / AVG_N;
    rBarCache.set(q, v);
    return v;
  };
  const zAt = (t: number): number => {
    const [, , z] = sampler.position(((domain.uLo % 1) + 1) % 1, Math.min(1, Math.max(0, t)));
    return z;
  };
  // t-edge sag of the θ-averaged profile: 1D chord error of the midpoint of a
  // straight (r̄,z) segment vs r̄ at the parametric midpoint (radial component
  // dominates; z is monotone in t so the (Δr̄,Δz) chord midpoint error ≈ the
  // radial second difference — the exact horizontal-arch sag, rib-immune).
  const edgeSagTBar = (t0: number, t1: number): number => {
    const rA = rBar(t0);
    const rB = rBar(t1);
    const rM = rBar((t0 + t1) / 2);
    const zA = zAt(t0);
    const zB = zAt(t1);
    const zM = zAt((t0 + t1) / 2);
    return Math.hypot((rA + rB) / 2 - rM, (zA + zB) / 2 - zM);
  };
  // RIB-AWARE (design a) chain-distance MASK. Spatial hash of the constraint
  // chain points (3D mm) on a bandMm grid; a cell center within bandMm of any
  // chain point is rib-adjacent ⇒ its sag is IGNORED (the ribs are already
  // carried by the locked chains + the refine loop). The smooth dead-zone bump
  // is >bandMm from every chain ⇒ still seeds.
  const maskMode = ribAware?.mode === 'mask';
  const bandMm = ribAware?.bandMm ?? 1.0;
  const chainHash = new Map<string, number[]>();
  if (maskMode && ribAware?.chainPtsMm) {
    const cp = ribAware.chainPtsMm;
    for (let i = 0; i < cp.length / 3; i++) {
      const gx = Math.floor(cp[3 * i] / bandMm);
      const gy = Math.floor(cp[3 * i + 1] / bandMm);
      const gz = Math.floor(cp[3 * i + 2] / bandMm);
      const k = `${gx}_${gy}_${gz}`;
      let arr = chainHash.get(k);
      if (arr === undefined) {
        arr = [];
        chainHash.set(k, arr);
      }
      arr.push(cp[3 * i], cp[3 * i + 1], cp[3 * i + 2]);
    }
  }
  const nearChain = (u: number, t: number): boolean => {
    if (!maskMode) return false;
    const [x, y, z] = P(u, t);
    const gx = Math.floor(x / bandMm);
    const gy = Math.floor(y / bandMm);
    const gz = Math.floor(z / bandMm);
    const b2 = bandMm * bandMm;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const arr = chainHash.get(`${gx + dx}_${gy + dy}_${gz + dz}`);
          if (!arr) continue;
          for (let i = 0; i < arr.length / 3; i++) {
            const ddx = arr[3 * i] - x;
            const ddy = arr[3 * i + 1] - y;
            const ddz = arr[3 * i + 2] - z;
            if (ddx * ddx + ddy * ddy + ddz * ddz < b2) return true;
          }
        }
      }
    }
    return false;
  };
  const thetaAvgMode = ribAware?.mode === 'thetaAvg';
  // The uniform cell size in fractions.
  const nu0 = Math.max(8, Math.round(((domain.uHi - domain.uLo) * uToMm) / bgArcMm));
  const nt0 = Math.max(8, Math.round(((domain.tHi - domain.tLo) * tToMm) / bgArcMm));
  const du0 = (domain.uHi - domain.uLo) / nu0;
  const dt0 = (domain.tHi - domain.tLo) / nt0;
  // Floor pitch in fractions per axis.
  const duMin = hMinMm / uToMm;
  const dtMin = hMinMm / tToMm;
  // Dedupe points on a fine lattice (hMin/4) so shared cell corners coincide.
  const cell = Math.min(duMin, dtMin) / 4;
  const seen = new Set<string>();
  const out: number[] = [];
  const emit = (u: number, t: number): void => {
    const k = `${Math.round(u / cell)}_${Math.round(t / cell)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(u, t);
  };
  // Recursive cell subdivision (split the axis whose edge sag is worst; both if
  // both exceed tol). Emits the 4 corners of every leaf cell ⇒ a conforming
  // non-uniform lattice (shared corners dedupe).
  const stack: Array<[number, number, number, number, number]> = [];
  for (let i = 0; i < nu0; i++) {
    for (let j = 0; j < nt0; j++) {
      stack.push([
        domain.uLo + i * du0,
        domain.uLo + (i + 1) * du0,
        domain.tLo + j * dt0,
        domain.tLo + (j + 1) * dt0,
        0,
      ]);
    }
  }
  while (stack.length) {
    const [u0, u1, t0, t1, lvl] = stack.pop() as [number, number, number, number, number];
    const tMid = (t0 + t1) / 2;
    const uMid = (u0 + u1) / 2;
    // Worst chord sag across the cell in each axis (check both t-levels / u-levels).
    // RIB-AWARE modes replace / gate the sag so ONLY the smooth residual splits:
    //  - thetaAvg: t-sag from the θ-averaged profile (rib-immune); u-sag off
    //    (u-ridges are locked-edge-carried, not a bg-grid concern here).
    //  - mask: the plain sag, but ZEROED when the cell center is rib-adjacent
    //    (within bandMm of a locked constraint chain) ⇒ only off-rib cells split.
    let sagU: number;
    let sagT: number;
    if (thetaAvgMode) {
      sagU = 0;
      sagT = edgeSagTBar(t0, t1);
    } else {
      sagU = Math.max(edgeSagU(u0, u1, t0), edgeSagU(u0, u1, t1), edgeSagU(u0, u1, tMid));
      sagT = Math.max(edgeSagT(u0, t0, t1), edgeSagT(u1, t0, t1), edgeSagT(uMid, t0, t1));
      if (maskMode && nearChain(uMid, tMid)) {
        sagU = 0;
        sagT = 0;
      }
    }
    const canU = u1 - u0 > 2 * duMin;
    const canT = t1 - t0 > 2 * dtMin;
    // u-split is OPTIONAL (default on). Off ⇒ only t-rows densify: the u-ridges
    // are carried by LOCKED constraint edges + the refine loop, and the pinned
    // outlier is a t-SPANNING needle (pin_diag: uSpan≈0, tSpan≈0.075) — so
    // t-only interior points break the needle without paying the rib-tracking
    // u-refinement tri cost (MEASURED: u-split ⇒ 8.3M full-pot projection).
    const splitU = uSplit && sagU > tolMm && canU && lvl < maxLevel;
    const splitT = sagT > tolMm && canT && lvl < maxLevel;
    if (splitU && splitT) {
      stack.push([u0, uMid, t0, tMid, lvl + 1], [uMid, u1, t0, tMid, lvl + 1], [u0, uMid, tMid, t1, lvl + 1], [uMid, u1, tMid, t1, lvl + 1]);
    } else if (splitU) {
      stack.push([u0, uMid, t0, t1, lvl + 1], [uMid, u1, t0, t1, lvl + 1]);
    } else if (splitT) {
      stack.push([u0, u1, t0, tMid, lvl + 1], [u0, u1, tMid, t1, lvl + 1]);
    } else {
      emit(u0, t0);
      emit(u1, t0);
      emit(u0, t1);
      emit(u1, t1);
      emit(uMid, tMid);
    }
  }
  return out;
}

/**
 * Seed the chart mesh: protected-complex vertices (converted mm → chart) with
 * their constraint edges LOCKED (the complex is already dense + on-ridge +
 * planar from morseComplex; a straight belt-and-suspenders densification to
 * `maxConstraintMm` only splits any coarse chain — never re-snaps, which
 * would break planarity), plus a uniform background grid at bgArcMm pitch
 * over the domain, CDT'd in mm space (isotropic predicates).
 */
export interface AdaptiveSeedCfg {
  tolMm: number;
  hMinMm: number;
  maxLevel: number;
  uSplit: boolean;
  /** RIB-AWARE mode (undefined ⇒ plain LEVER-A sag field). */
  ribAwareMode?: 'mask' | 'thetaAvg';
  /** 'mask' distance band (3D mm) around any constraint chain. */
  ribBandMm?: number;
}

export function seedFromComplex(
  complex: ProtectedComplex,
  domain: ChartDomain,
  bgArcMm: number,
  sampler?: SurfaceSampler,
  maxConstraintMm = MAX_CONSTRAINT_MM,
  adaptive?: AdaptiveSeedCfg,
): { uv: number[]; cEdges: Array<[number, number]> } {
  const { uToMm, tToMm } = complex;
  const uv: number[] = [];
  const cEdges: Array<[number, number]> = [];
  const idMap = new Map<number, number>(); // complex vertex → seed vertex
  const inDomain = (u: number, t: number): boolean =>
    u >= domain.uLo - 1e-9 &&
    u <= domain.uHi + 1e-9 &&
    t >= domain.tLo - 1e-9 &&
    t <= domain.tHi + 1e-9;
  // Border-crossing constraint segments are CLIPPED AT the boundary (an
  // interpolated boundary vertex; interior portion kept + locked), NEVER
  // dropped. Dropping them leaves an UNPROTECTED crest stub inside the
  // domain — facets bridge the unlocked cusp and the refine loop stalls at
  // an irreducible ~0.4mm floor (MEASURED: full Gothic gate capped at pass
  // 16 with ~295 outliers, worst 0.40, insertions a no-op).
  const clipToDomain = (
    pu: number,
    pt: number,
    qu: number,
    qt: number,
  ): [number, number] | null => {
    // p is inside; slide q toward p until inside (param clip per axis).
    let s = 1;
    if (qu < domain.uLo) s = Math.min(s, (domain.uLo - pu) / (qu - pu));
    if (qu > domain.uHi) s = Math.min(s, (domain.uHi - pu) / (qu - pu));
    if (qt < domain.tLo) s = Math.min(s, (domain.tLo - pt) / (qt - pt));
    if (qt > domain.tHi) s = Math.min(s, (domain.tHi - pt) / (qt - pt));
    if (!(s > 1e-6)) return null; // degenerate sliver at the border
    return [pu + s * (qu - pu), pt + s * (qt - pt)];
  };
  const addVert = (u: number, t: number, complexId?: number): number => {
    if (complexId !== undefined) {
      const hit = idMap.get(complexId);
      if (hit !== undefined) return hit;
    }
    const id = uv.length / 2;
    uv.push(u, t);
    if (complexId !== undefined) idMap.set(complexId, id);
    return id;
  };
  const pos3D = (u: number, t: number): [number, number, number] =>
    sampler
      ? [...sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)))]
      : [u * uToMm, t * tToMm, 0];
  // The complex is already dense (≤0.15mm) + on-ridge + planar (morseComplex
  // densifies+snaps BEFORE planarizeMM — snapping HERE, post-planarization,
  // re-introduces crossings and cdt2d throws `upperIds`). This is a STRAIGHT,
  // collinear densification only (planarity-safe — collinear points on a
  // non-crossing segment add no crossings): a belt-and-suspenders splitter in
  // case a chain arrives coarse. NEVER snap here.
  const pushConstraint = (ia: number, ib: number): void => {
    const au = uv[2 * ia];
    const atv = uv[2 * ia + 1];
    const bu = uv[2 * ib];
    const bt = uv[2 * ib + 1];
    const A = pos3D(au, atv);
    const B = pos3D(bu, bt);
    const len3 = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    const nSeg = Math.max(1, Math.ceil(len3 / maxConstraintMm));
    let prev = ia;
    for (let s = 1; s < nSeg; s++) {
      const f = s / nSeg;
      const mid = addVert(au + f * (bu - au), atv + f * (bt - atv));
      if (mid !== prev) cEdges.push([prev, mid]);
      prev = mid;
    }
    if (prev !== ib) cEdges.push([prev, ib]);
  };
  for (const [a, b] of complex.edges) {
    const ua = complex.vertices[2 * a] / uToMm;
    const ta = complex.vertices[2 * a + 1] / tToMm;
    const ub = complex.vertices[2 * b] / uToMm;
    const tb = complex.vertices[2 * b + 1] / tToMm;
    const aIn = inDomain(ua, ta);
    const bIn = inDomain(ub, tb);
    if (!aIn && !bIn) continue; // fully outside (border-to-border spans are rare noise)
    if (aIn && bIn) {
      pushConstraint(addVert(ua, ta, a), addVert(ub, tb, b));
      continue;
    }
    // One endpoint outside: keep the interior portion up to the boundary.
    const [pu, pt, pid, qu, qt] = aIn
      ? ([ua, ta, a, ub, tb] as const)
      : ([ub, tb, b, ua, ta] as const);
    const clipped = clipToDomain(pu, pt, qu, qt);
    if (clipped === null) continue;
    pushConstraint(addVert(pu, pt, pid), addVert(clipped[0], clipped[1]));
  }
  // Background grid (dedupe against existing points on a fine mm lattice).
  const pmap = new Map<number, number>();
  const keyOf = (u: number, t: number): number =>
    Math.round((u * uToMm) / DEDUPE_CELL_MM) * 100000 +
    Math.round((t * tToMm) / DEDUPE_CELL_MM);
  for (let i = 0; i < uv.length / 2; i++) {
    const k = keyOf(uv[2 * i], uv[2 * i + 1]);
    if (!pmap.has(k)) pmap.set(k, i);
  }
  if (adaptive && sampler) {
    // LEVER A: 2D curvature-adaptive background points (opt-in). Packs points
    // into the smooth-arc bump the κ-detector misses, coarse elsewhere.
    // RIB-AWARE (opt-in): the 'mask' mode needs the constraint chain points as
    // 3D-mm surface positions to keep the seed away from ribs. Lift each complex
    // vertex (flat 2D mm = (u·uToMm, t·tToMm)) back to chart (u,t) then to 3D.
    let ribAware: RibAwareArgs | undefined;
    if (adaptive.ribAwareMode === 'thetaAvg') {
      ribAware = { mode: 'thetaAvg' };
    } else if (adaptive.ribAwareMode === 'mask') {
      const chainPtsMm: number[] = [];
      const nCV = complex.vertices.length / 2;
      for (let i = 0; i < nCV; i++) {
        const cu = complex.vertices[2 * i] / uToMm;
        const ct = complex.vertices[2 * i + 1] / tToMm;
        if (
          cu < domain.uLo - 0.02 ||
          cu > domain.uHi + 0.02 ||
          ct < domain.tLo - 0.02 ||
          ct > domain.tHi + 0.02
        )
          continue;
        const [x, y, z] = sampler.position(((cu % 1) + 1) % 1, Math.min(1, Math.max(0, ct)));
        chainPtsMm.push(x, y, z);
      }
      ribAware = { mode: 'mask', chainPtsMm, bandMm: adaptive.ribBandMm ?? 1.0 };
    }
    const pts = adaptiveSeedPoints(
      sampler,
      domain,
      uToMm,
      tToMm,
      bgArcMm,
      adaptive.tolMm,
      adaptive.hMinMm,
      adaptive.maxLevel,
      adaptive.uSplit,
      ribAware,
    );
    for (let i = 0; i < pts.length / 2; i++) {
      const u = pts[2 * i];
      const t = pts[2 * i + 1];
      const key = keyOf(u, t);
      if (pmap.has(key)) continue;
      pmap.set(key, uv.length / 2);
      uv.push(u, t);
    }
  } else {
    const nu = Math.max(8, Math.round(((domain.uHi - domain.uLo) * uToMm) / bgArcMm));
    const nt = Math.max(8, Math.round(((domain.tHi - domain.tLo) * tToMm) / bgArcMm));
    for (let i = 0; i <= nu; i++) {
      for (let k = 0; k <= nt; k++) {
        const u = domain.uLo + (domain.uHi - domain.uLo) * (i / nu);
        const t = domain.tLo + (domain.tHi - domain.tLo) * (k / nt);
        const key = keyOf(u, t);
        if (pmap.has(key)) continue;
        pmap.set(key, uv.length / 2);
        uv.push(u, t);
      }
    }
  }
  return { uv, cEdges };
}

/** mm-scaled chart CDT with locked constraint edges. */
function triangulateMM(
  uv: number[],
  uToMm: number,
  tToMm: number,
  cEdges: Array<[number, number]>,
): number[] {
  const nV = uv.length / 2;
  const pts: Array<[number, number]> = new Array<[number, number]>(nV);
  for (let i = 0; i < nV; i++) {
    pts[i] = [uv[2 * i] * uToMm, uv[2 * i + 1] * tToMm];
  }
  const t = cdt2d(pts, cEdges, { exterior: true }) as number[][];
  const out: number[] = [];
  for (const tr of t) out.push(tr[0], tr[1], tr[2]);
  return out;
}

/** Resolved split configuration (undefined splitMode ⇒ isotropic). */
interface SplitCfg {
  mode: 'iso' | 'aniso';
  direction: 'edgeSag' | 'longEdge';
  aspectTol: number;
  uToMm: number;
  tToMm: number;
  /** Surface position P(u,t) — needed for 'edgeSag' + zeroArea guard. */
  pos: (u: number, t: number) => [number, number, number];
}

function splitCfgFrom(opts: RefineOptions, uToMm: number, tToMm: number, sampler: SurfaceSampler): SplitCfg {
  return {
    mode: opts.splitMode === 'aniso' ? 'aniso' : 'iso',
    direction: opts.anisoDirection ?? 'edgeSag',
    aspectTol: opts.anisoAspectTol ?? 0.15,
    uToMm,
    tToMm,
    pos: (u, t) => [...sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)))],
  };
}

/**
 * The per-outlier-facet insertion (shared by the sync loop AND applyScoredPass
 * ⇒ byte-identical mesh across the two paths given identical facet iteration).
 *
 * ISOTROPIC (default): insert all 3 seam-consistent edge midpoints (RED 1→4).
 * ANISOTROPIC (splitMode 'aniso'): score the 3 edges by the direction signal,
 * insert ONLY the sag-dominant edge's midpoint (a 1→2 point split; the per-pass
 * re-CDT keeps the mesh conforming). Falls back to isotropic when the top-2 edge
 * signals are within aspectTol (no dominant axis). A locked constraint edge is
 * subdivided in place ([a,b]→[a,m],[m,b], straight midpoint). Sub-DEDUPE_CELL_MM
 * candidate edges are rejected (dedupe floor).
 */
function insertOutlierSplit(
  a: number,
  b: number,
  c: number,
  uv: number[],
  cfg: SplitCfg,
  cEdges: Array<[number, number]>,
  cMap: Map<number, number>,
  cKey: (a: number, b: number) => number,
  keyOf: (u: number, t: number) => number,
  addPt: (u: number, t: number) => number,
  inserted: Set<number>,
): void {
  // Seam-consistent u images (shortest around a's u) — identical convention to
  // the ruler + the prior isotropic block.
  let ua = uv[2 * a];
  let ub = uv[2 * b];
  let uc = uv[2 * c];
  const ta = uv[2 * a + 1];
  const tb = uv[2 * b + 1];
  const tc = uv[2 * c + 1];
  while (ub - ua > 0.5) ub -= 1;
  while (ua - ub > 0.5) ub += 1;
  while (uc - ua > 0.5) uc -= 1;
  while (ua - uc > 0.5) uc += 1;
  // Edge tuples: [va, vb, ua, ta, ub, tb].
  const edges: Array<[number, number, number, number, number, number]> = [
    [a, b, ua, ta, ub, tb],
    [b, c, ub, tb, uc, tc],
    [c, a, uc, tc, ua, ta],
  ];

  const splitOneEdge = (e: [number, number, number, number, number, number]): void => {
    const [va, vb, eua, eta, eub, etb] = e;
    const mu = (eua + eub) / 2;
    const mt = (eta + etb) / 2;
    // Dedupe floor: reject a candidate whose 3D edge is already sub-cell (the
    // midpoint would collapse onto an endpoint under the dedupe hash anyway).
    const ck = cKey(va, vb);
    const ci = cMap.get(ck);
    if (ci !== undefined) {
      const k = keyOf(mu, mt);
      if (inserted.has(k)) return;
      inserted.add(k);
      const mid = addPt(mu, mt);
      if (mid !== va && mid !== vb) {
        cEdges[ci] = [va, mid];
        cMap.delete(ck);
        cMap.set(cKey(va, mid), ci);
        const ni = cEdges.length;
        cEdges.push([mid, vb]);
        cMap.set(cKey(mid, vb), ni);
      }
    } else {
      const k = keyOf(mu, mt);
      if (!inserted.has(k)) {
        inserted.add(k);
        addPt(mu, mt);
      }
    }
  };

  if (cfg.mode === 'iso') {
    for (const e of edges) splitOneEdge(e);
    return;
  }

  // ANISOTROPIC: score each edge by the direction signal.
  const signal = (e: [number, number, number, number, number, number]): number => {
    const [, , eua, eta, eub, etb] = e;
    if (cfg.direction === 'longEdge') {
      const du = (eua - eub) * cfg.uToMm;
      const dt = (eta - etb) * cfg.tToMm;
      return Math.hypot(du, dt);
    }
    // edgeSag: 3D P1 midpoint chord-sag of the straight edge vs the surface.
    const A = cfg.pos(eua, eta);
    const B = cfg.pos(eub, etb);
    const M = cfg.pos((eua + eub) / 2, (eta + etb) / 2);
    return Math.hypot(
      (A[0] + B[0]) / 2 - M[0],
      (A[1] + B[1]) / 2 - M[1],
      (A[2] + B[2]) / 2 - M[2],
    );
  };
  const s0 = signal(edges[0]);
  const s1 = signal(edges[1]);
  const s2 = signal(edges[2]);
  // Best + second-best.
  let bi = 0;
  let best = s0;
  if (s1 > best) {
    best = s1;
    bi = 1;
  }
  if (s2 > best) {
    best = s2;
    bi = 2;
  }
  const second = Math.max(...[s0, s1, s2].filter((_, i) => i !== bi));
  // Ambiguous (no dominant axis) ⇒ isotropic fallback so the loop cannot stall.
  if (!(best > 0) || second >= (1 - cfg.aspectTol) * best) {
    for (const e of edges) splitOneEdge(e);
    return;
  }
  splitOneEdge(edges[bi]);
}

/**
 * Resolve the effective placement sampler + ruling surface from
 * `opts.surfaceSource` (see {@link RefineOptions.surfaceSource}). Undefined/
 * 'sampler' returns `sampler` BY REFERENCE (unchanged) and the existing
 * `radialSurfaceFromSampler(sampler)` construction — BYTE-IDENTICAL to the
 * pre-Arm-C2 behaviour for every caller that doesn't set the new option.
 * 'analytic' builds both halves from the SAME `analyticRA`/H so placement and
 * ruling agree by construction.
 */
function resolveSurfaceSource(
  sampler: SurfaceSampler,
  opts: RefineOptions,
): { effSampler: SurfaceSampler; surface: RadialSurface } {
  if (opts.surfaceSource !== 'analytic') {
    return { effSampler: sampler, surface: radialSurfaceFromSampler(sampler) };
  }
  if (!opts.analyticRA) {
    throw new Error(
      "refineToZeroOutliers: surfaceSource:'analytic' requires opts.analyticRA",
    );
  }
  // Height is unaffected by radial bilinear error (t=0/t=1 rows are exact grid
  // rows, no interpolation) — measuring it off the ORIGINAL sampler is cheap
  // and exact, mirroring radialSurfaceFromSampler's own z0/z1 probe.
  const H =
    opts.analyticH ?? sampler.position(0, 1)[2] - sampler.position(0, 0)[2];
  return {
    effSampler: analyticSurfaceSampler(opts.analyticRA, H),
    surface: radialSurfaceFromAnalytic(opts.analyticRA, H),
  };
}

/**
 * The whole-mesh honest-brute refine loop (see module doc). Returns the
 * refined chart mesh; `capped` is true when the pass budget ran out with
 * outliers remaining (the caller's mandatory guard then fails, honestly).
 */
export function refineToZeroOutliers(
  sampler: SurfaceSampler,
  complex: ProtectedComplex,
  domain: ChartDomain,
  opts: RefineOptions,
  onPass?: (s: RefinePassStat) => void,
): RefineResult {
  const { effSampler, surface } = resolveSurfaceSource(sampler, opts);
  const { uToMm, tToMm } = complex;
  const seed = seedFromComplex(
    complex,
    domain,
    opts.bgArcMm,
    effSampler,
    opts.maxConstraintMm,
    adaptiveCfg(opts),
  );
  let uv = seed.uv.slice();
  const cEdges = seed.cEdges;
  let tris = triangulateMM(uv, uToMm, tToMm, cEdges);

  const dedupeCell = opts.dedupeCellMm ?? DEDUPE_CELL_MM;
  const pmap = new Map<number, number>();
  const keyOf = (u: number, t: number): number =>
    Math.round(((((u % 1) + 1) % 1) * uToMm) / dedupeCell) * 100000 +
    Math.round((t * tToMm) / dedupeCell);
  const rehash = (): void => {
    pmap.clear();
    for (let i = 0; i < uv.length / 2; i++) {
      const k = keyOf(uv[2 * i], uv[2 * i + 1]);
      if (!pmap.has(k)) pmap.set(k, i);
    }
  };
  const addPt = (u: number, t: number): number => {
    const k = keyOf(u, t);
    const hit = pmap.get(k);
    if (hit !== undefined) return hit;
    const id = uv.length / 2;
    pmap.set(k, id);
    uv.push(u, t);
    return id;
  };

  // CONSTRAINT SUBDIVISION (the full-gate stall fix — the campaign's
  // recoverySubdivideCollinear lesson resurfacing in this port): cdt2d
  // cannot split a locked edge through a vertex collinear-on it, so a
  // crest-adjacent facet bounded by a LONG constraint edge (detector-pitch
  // ~2.4mm vs the ~0.1mm research crest chains) can NEVER refine along the
  // crest — midpoint insertions dedupe-no-op forever (measured: inserted
  // ~850/pass, tris +~120/pass, worst pinned at 0.404). When refinement
  // wants a constraint edge's midpoint, SUBDIVIDE THE CONSTRAINT itself
  // ([a,b] → [a,m],[m,b]) with m RIDGE-SNAPPED along the edge normal so the
  // refined crest follows the true cusp, not the chain's chord.
  const cKey = (a: number, b: number): number =>
    a < b ? a * 1e7 + b : b * 1e7 + a;
  const cMap = new Map<number, number>(); // canonical pair → cEdges index
  for (let i = 0; i < cEdges.length; i++) {
    cMap.set(cKey(cEdges[i][0], cEdges[i][1]), i);
  }
  const splitCfg = splitCfgFrom(opts, uToMm, tToMm, effSampler);
  const dense = denseBary(8);
  const history: RefinePassStat[] = [];
  let capped = false;
  let pass = 0;
  let bulk = opts.bulkPasses7pt;
  // Cross-pass dirty-facet cache (opt-in). The `uv` array only ever GROWS
  // (addPt appends, never reorders), so a vertex index is STABLE across passes
  // and a facet's identity is its sorted (a,b,c) triple. Combined with the
  // lattice phase (dense vs 7-pt) the key uniquely determines the pure ruler
  // verdict ⇒ a hit is EXACT. Cleared when the phase flips (a 7-pt verdict is
  // not valid for a dense query).
  const useCache = opts.dirtyFacetCache === true;
  const devCache = new Map<string, number>();
  let cachePhaseDense: boolean | null = null;
  const facetKey = (a: number, b: number, c: number): string => {
    let x = a;
    let y = b;
    let z = c;
    if (x > y) [x, y] = [y, x];
    if (y > z) [y, z] = [z, y];
    if (x > y) [x, y] = [y, x];
    // Distinct sorted index triple → collision-free (a numeric pack overflows
    // Number.MAX_SAFE_INTEGER at >~10^5 vertices; a string is exact).
    return `${x}_${y}_${z}`;
  };
  for (pass = 1; pass <= opts.maxPass; pass++) {
    const t0 = Date.now();
    const xyz = liftChartMesh(effSampler, uv);
    const nF = tris.length / 3;
    const useDense = pass > bulk;
    rehash();
    if (useCache && cachePhaseDense !== useDense) {
      devCache.clear();
      cachePhaseDense = useDense;
    }
    let outliers = 0;
    let worst = 0;
    let bruteCalls = 0;
    let cacheHits = 0;
    let cacheChecks = 0;
    const inserted = new Set<number>();
    for (let f = 0; f < nF; f++) {
      const a = tris[3 * f];
      const b = tris[3 * f + 1];
      const c = tris[3 * f + 2];
      let dev: number;
      if (useCache) {
        cacheChecks++;
        const fk = facetKey(a, b, c);
        const cached = devCache.get(fk);
        if (cached !== undefined) {
          dev = cached;
          cacheHits++;
        } else {
          const g = facetInteriorHonest(
            surface,
            xyz,
            uv,
            a,
            b,
            c,
            useDense ? dense : BARY_STOP,
            opts.ruler,
          );
          bruteCalls += g.bruteCalls;
          dev = g.dev;
          devCache.set(fk, dev);
        }
      } else {
        const g = facetInteriorHonest(
          surface,
          xyz,
          uv,
          a,
          b,
          c,
          useDense ? dense : BARY_STOP,
          opts.ruler,
        );
        bruteCalls += g.bruteCalls;
        dev = g.dev;
      }
      if (dev > worst) worst = dev;
      if (dev > opts.tolMm) {
        outliers++;
        // Edge-mode split: isotropic RED 1→4 (all 3 midpoints) OR anisotropic
        // single-sag-edge bisection (splitMode 'aniso'). Shared with the parallel
        // path (applyScoredPass) ⇒ byte-identical mesh. Constraint edges are
        // subdivided in place; crest midpoints stay locked.
        insertOutlierSplit(a, b, c, uv, splitCfg, cEdges, cMap, cKey, keyOf, addPt, inserted);
      }
    }
    const stat: RefinePassStat = {
      pass,
      nTris: nF,
      outliers,
      worstMm: worst,
      inserted: inserted.size,
      bruteCalls,
      dense: useDense,
      ms: Date.now() - t0,
      cacheHits,
      cacheChecks,
    };
    history.push(stat);
    if (onPass) onPass(stat);
    // PHASE-A 0-outliers under the cheap driver is NOT convergence — only the
    // dense driver's verdict counts (measured: 7-pt read 0 while the 45-pt
    // guard found 17 on the same mesh).
    if (outliers === 0 && useDense) break;
    if (outliers === 0 && !useDense) {
      bulk = pass; // bulk done early — switch to the dense driver next pass
      continue;
    }
    tris = triangulateMM(uv, uToMm, tToMm, cEdges);
    if (pass === opts.maxPass && outliers > 0) capped = true;
  }
  return { uv, tris, passes: pass, capped, history, constraintEdges: cEdges };
}

/**
 * Minimal parallel-scorer contract (a {@link ParallelScorerPool}). Kept as a
 * structural interface so this module does not import worker_threads at load —
 * the sync production path (index.ts) never touches the pool.
 */
export interface DevScorer {
  scoreDev(
    xyz: Float64Array,
    uv: number[],
    tris: number[],
    opts: RulerOptions,
  ): Promise<{ dev: Float64Array; bruteCalls: number }>;
}

/**
 * Parallel variant of {@link refineToZeroOutliers}: DENSE passes score every
 * facet via the injected worker pool (`scorer`), 7-pt PHASE-A passes stay
 * sequential (already cheap). The insertion + convergence logic is IDENTICAL
 * (shared {@link applyScoredPass}), so the refined mesh is byte-identical to
 * the sequential loop given a byte-identical dev[] (which the pool guarantees).
 * The dirty-facet cache is NOT applied here (the pool already elides the
 * sequential cost); pass `dirtyFacetCache` to the sync path instead.
 */
export async function refineToZeroOutliersParallel(
  sampler: SurfaceSampler,
  complex: ProtectedComplex,
  domain: ChartDomain,
  opts: RefineOptions,
  scorer: DevScorer,
  onPass?: (s: RefinePassStat) => void,
): Promise<RefineResult> {
  const surface = radialSurfaceFromSampler(sampler);
  const { uToMm, tToMm } = complex;
  const seed = seedFromComplex(
    complex,
    domain,
    opts.bgArcMm,
    sampler,
    opts.maxConstraintMm,
    adaptiveCfg(opts),
  );
  const uv = seed.uv.slice();
  const cEdges = seed.cEdges;
  let tris = triangulateMM(uv, uToMm, tToMm, cEdges);

  const dedupeCell = opts.dedupeCellMm ?? DEDUPE_CELL_MM;
  const pmap = new Map<number, number>();
  const keyOf = (u: number, t: number): number =>
    Math.round(((((u % 1) + 1) % 1) * uToMm) / dedupeCell) * 100000 +
    Math.round((t * tToMm) / dedupeCell);
  const addPt = (u: number, t: number): number => {
    const k = keyOf(u, t);
    const hit = pmap.get(k);
    if (hit !== undefined) return hit;
    const id = uv.length / 2;
    pmap.set(k, id);
    uv.push(u, t);
    return id;
  };
  const rehash = (): void => {
    pmap.clear();
    for (let i = 0; i < uv.length / 2; i++) {
      const k = keyOf(uv[2 * i], uv[2 * i + 1]);
      if (!pmap.has(k)) pmap.set(k, i);
    }
  };
  const cKey = (a: number, b: number): number =>
    a < b ? a * 1e7 + b : b * 1e7 + a;
  const cMap = new Map<number, number>();
  for (let i = 0; i < cEdges.length; i++) {
    cMap.set(cKey(cEdges[i][0], cEdges[i][1]), i);
  }
  const splitCfg = splitCfgFrom(opts, uToMm, tToMm, sampler);
  const history: RefinePassStat[] = [];
  let capped = false;
  let pass = 0;
  let bulk = opts.bulkPasses7pt;
  for (pass = 1; pass <= opts.maxPass; pass++) {
    const t0 = Date.now();
    const xyz = liftChartMesh(sampler, uv);
    const nF = tris.length / 3;
    const useDense = pass > bulk;
    rehash();

    let dev: Float64Array;
    let bruteCalls = 0;
    if (useDense) {
      const r = await scorer.scoreDev(xyz, uv, tris, opts.ruler);
      dev = r.dev;
      bruteCalls = r.bruteCalls;
    } else {
      // 7-pt PHASE-A: sequential (cheap; the pool worker is dense-only).
      dev = new Float64Array(nF);
      for (let f = 0; f < nF; f++) {
        const g = facetInteriorHonest(
          surface,
          xyz,
          uv,
          tris[3 * f],
          tris[3 * f + 1],
          tris[3 * f + 2],
          BARY_STOP,
          opts.ruler,
        );
        dev[f] = g.dev;
        bruteCalls += g.bruteCalls;
      }
    }

    const applied = applyScoredPass(
      dev,
      tris,
      uv,
      opts.tolMm,
      cEdges,
      cMap,
      cKey,
      keyOf,
      addPt,
      splitCfg,
    );
    const stat: RefinePassStat = {
      pass,
      nTris: nF,
      outliers: applied.outliers,
      worstMm: applied.worst,
      inserted: applied.inserted,
      bruteCalls,
      dense: useDense,
      ms: Date.now() - t0,
    };
    history.push(stat);
    if (onPass) onPass(stat);
    if (applied.outliers === 0 && useDense) break;
    if (applied.outliers === 0 && !useDense) {
      bulk = pass;
      continue;
    }
    tris = triangulateMM(uv, uToMm, tToMm, cEdges);
    if (pass === opts.maxPass && applied.outliers > 0) capped = true;
  }
  return { uv, tris, passes: pass, capped, history, constraintEdges: cEdges };
}

/**
 * Apply an already-scored pass: given the per-facet dev[] for the CURRENT
 * `tris`, count outliers/worst and perform the edge-mode RED 1→4 insertions
 * (mutating `uv`, `cEdges`, `cMap`, `pmap` in place via the passed helpers).
 * Returns the pass's outlier/worst/inserted counts. Extracted so the sync loop
 * and the parallel loop share IDENTICAL insertion logic ⇒ byte-identical mesh.
 */
function applyScoredPass(
  dev: Float64Array,
  tris: number[],
  uv: number[],
  tolMm: number,
  cEdges: Array<[number, number]>,
  cMap: Map<number, number>,
  cKey: (a: number, b: number) => number,
  keyOf: (u: number, t: number) => number,
  addPt: (u: number, t: number) => number,
  splitCfg: SplitCfg,
): { outliers: number; worst: number; inserted: number } {
  const nF = tris.length / 3;
  let outliers = 0;
  let worst = 0;
  const inserted = new Set<number>();
  for (let f = 0; f < nF; f++) {
    const d = dev[f];
    if (d > worst) worst = d;
    if (d <= tolMm) continue;
    outliers++;
    // Shared isotropic/anisotropic split (byte-identical to the sync loop given
    // identical facet iteration + dev[]).
    insertOutlierSplit(
      tris[3 * f],
      tris[3 * f + 1],
      tris[3 * f + 2],
      uv,
      splitCfg,
      cEdges,
      cMap,
      cKey,
      keyOf,
      addPt,
      inserted,
    );
  }
  return { outliers, worst, inserted: inserted.size };
}
