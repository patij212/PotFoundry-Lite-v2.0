// regionMetric.ts — SRC region-layer M=g/h² metric-Delaunay kernel (ported from research/bridge/inhouseMetricMesh.ts).
//
// PROD-TIERC region kernel: the CERTIFIED M=g/h² accelerator, productionized as a browser-capable src kernel so the
// region dispatch can route sliver-heavy styles (DragonScales/GeometricStar) to it. Pure JS — imports only the
// `AnalyticRadiusFn` TYPE from src/fidelity + `delaunator` (npm) + the moved pure-JS deps (surfaceMetricField,
// surfaceSmoothing, constraintRecovery). Zero node:/gmsh/WASM ⇒ ships to the browser.
//
// `buildMetricMesh` (+ `flipHE`) is a byte-faithful port of the research `buildInhouseMetricMesh` (+ `flipHE`); the
// ONLY changes from the research copy are the import paths, the public symbol names, and the added
// `buildMetricOuterWall` wrapper (which forces the MANDATORY `guardManifoldAlways` watertight guard and is reachable
// ONLY under the D-1 `isRegionLayerEnabled()` flag). Nothing in the production dispatch imports this module yet
// (region wiring is a follow-up), so flag-off it is structurally unreachable ⇒ byte-identical production.
//
// --- research header preserved below ---
// performant IN-HOUSE metric-Delaunay mesher (no gmsh). The kernel rebuild core.
//
// Upgrades over the src/fidelity/spike (global anisotropy scale + per-triangle oracle chord sampling):
//   1. PER-NODE metric: density is driven by the precomputed surface metric field M=g/h₃D(u,t)²
//      (buildSurfaceMetricField). A triangle is "too big" when its longest edge exceeds the local metric
//      target — refine by METRIC edge length, not a global 3D length. Cheap (bilinear field lookups, no
//      per-triangle oracle chord sampling), so it scales past gmsh BAMG's ~1.8M cap.
//   2. FAST flips: a true-3D max-min-angle Lawson flip over Delaunator's HALFEDGE structure (no per-pass edge
//      Map — the measured 84%-of-runtime bottleneck) with a per-round precomputed xyz array and an acos-free
//      squared-cosine comparison → flips stay cheap at millions of triangles.
//   3. Optimization: iterated [on-surface smooth + flip] (the pass the spike lacked).
//
// Connectivity: initial Euclidean Delaunay (shipped delaunator) in coords scaled by the global median
// anisotropy s=median(√(M00/M11)); the true-3D flips then correct the local diagonals the global scale misses.
import Delaunator from 'delaunator';
import { buildSurfaceMetricField, type CrestSizeSample } from './surfaceMetricField';
import { smoothSurfaceOnRadial } from './surfaceSmoothing';
import { recoverAndLockEdges, lockedPredicate } from './constraintRecovery';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';
import type { ConformingOuterWallResult } from '../ConformingOuterWall';
import { isRegionLayerEnabled } from './regionLayerFlag';

const TAU = 2 * Math.PI;

export interface MetricMeshOpts {
  tolMm: number; hMin: number; hMax: number;
  sizeRes?: number; gradeBeta?: number; seedN?: number;
  maxPoints?: number; maxRounds?: number; splitThresh?: number; optimizeSweeps?: number; dedupeEps?: number;
  profile?: boolean;
  /** Also split any triangle whose DIRECT facet→surface chord-sag (sampled on the true surface) exceeds this —
   *  a fidelity guarantee that catches sharp/thin relief the grid-curvature metric aliases (e.g. GothicArches
   *  V-grooves). mm. */
  chordTolMm?: number;
  /** With chordTolMm: when a facet exceeds the chord tolerance, insert a STEINER point at the WORST-sag sample
   *  (the centroid for sharp apex/junction faces where the surface bulges in the facet interior) instead of the
   *  longest-edge midpoint — an edge split can never converge a vertex onto an interior apex, a Steiner point can.
   *  Opt-in → STRICT NO-OP when false/absent (the longest-edge branch runs exactly as before). */
  chordSteiner?: boolean;
  /** OPT-IN: sample the deep-sag chord guard (chordSag / chordWorstBary) at a DENSE denseBary(chordSampleN) lattice
   *  ((n+1)(n+2)/2 samples) instead of the default 4 (3 edge-midpoints + centroid). The 4-pt sampler UNDER-reports a
   *  facet whose sag PEAKS between its edge-midpoints (measured E-2026-07-08-SMOOTH-TAILS: Ripple/Harmonic residual
   *  crest facets read 4-pt 0.0101 vs 45-pt 0.0126 = the acceptance ruler) → the guard declares a still-bulged facet
   *  "done" and floors at ~6 outliers. A dense guard sampler matches the 45-pt true-3D acceptance ruler so the guard
   *  keeps splitting until the honest sag is under tol. STRICT NO-OP when absent/<=2 (the BARY 4-pt path is unchanged
   *  → byte-identical default). n=8 ⇒ 45 samples (the acceptance-ruler lattice). */
  chordSampleN?: number;
  /** OPT-IN: size the metric with FINE-step, sub-cell-window-max curvature (resolves sharp sub-cell ridges the
   *  sizeRes grid aliases 5-10× → crest facets born small, killing crest-straddle chord sag). Passed straight to
   *  buildSurfaceMetricField. Absent ⇒ byte-identical default. */
  curvatureFineStep?: number;
  curvatureSubsamples?: number;
  /**
   * OPT-IN CREST-AWARE SIZING overlay (E-2026-07-01-CRESTAWARE). KNOWN crest/valley loci samples (u,t + a
   * pre-computed local target 3D size), rasterized into the sizing field's h3D grid as a MIN-overlay BEFORE
   * gradation (see buildSurfaceMetricField.crestSizeOverlay). This defeats the grid-fraction curvature aliasing
   * (E-2026-07-01-FRONTIER-BET2): the sizing grid samples κ at cell corners and MISSES sub-cell crests at fracU
   * 0.35/0.65 → under-sizes → crest-straddle chord sag. Feeding the loci directly makes fineness FOLLOW them.
   * Built by buildFeatureConformingMeshB from its refined loci (crestAwareSizing option). STRICT NO-OP when
   * absent/empty (the h3D grid is untouched ⇒ the metric field is byte-identical to the default). */
  crestSizeOverlay?: ReadonlyArray<CrestSizeSample>;
  /** MIN-overlay neighbourhood half-width in grid cells for crestSizeOverlay (default 1). Only used with it. */
  crestBandCells?: number;
  /**
   * OPT-IN feature-conforming hook (DEV/LAB only). Flat (u,t) pairs of FORCED points to seed into the point
   * set alongside the seed grid — typically dense feature loci refined to the true crest/valley extremum
   * (see research/bridge/featureConformingMesh.ts). De-duped against existing points via the same addPoint
   * keyOf as the seeds. STRICT NO-OP when undefined or empty: the default path is byte-identical (the seed
   * loop, refinement, flips, and smoothing are unchanged; this only appends extra points BEFORE the first
   * Delaunay, exactly where a denser seed grid would add them).
   */
  injectedPoints?: number[];
  /**
   * When true (and injectedPoints non-empty), the injected vertices are PINNED during the on-surface
   * smoothing sweeps so the optimizer cannot relax them OFF the crest/valley they were placed on. No-op
   * unless injectedPoints is non-empty. Default false (injected points smooth like any interior vertex).
   */
  pinInjected?: boolean;
  /**
   * OPT-IN Stage-B constrained edges (DEV/LAB only). Flat list of vertex-PAIRS as positions into
   * injectedPoints: [posA0,posB0, posA1,posB1, ...]. On the FINAL triangulation the kernel recovers each
   * edge via locked Lawson flips (constraintRecovery.ts) so a mesh edge FOLLOWS the locus, then LOCKS it so
   * the optimization flips never cut back across it. STRICT NO-OP when undefined/empty. Requires
   * injectedPoints (the pair positions index into it). Reports recovery stats via the returned `constraint`.
   */
  constraintEdges?: number[];
  /**
   * OPT-IN manifold guard for the DEFAULT (non-injection) path (DEV/LAB only). The kernel's optimization-sweep
   * flips create NON-MANIFOLD edges on sharp/near-vertical styles at default settings (MEASURED, E-2026-06-30-
   * FEAT-CONFORM-SPIKE Finding 5: ArtDeco 181, GothicArches 24 non-manifold edges) — flipHE requests a diagonal
   * flip that DUPLICATES an existing edge. When true, BOTH the post-Delaunay flip AND the sweep flips use the
   * guardManifold (reject a flip whose new diagonal already exists). STRICT NO-OP when absent/false: the default
   * path stays byte-identical (verified by the no-op fingerprint). The injection path always guards regardless.
   * Task 4: enabling this FIXES the pre-existing non-manifold defect; it CHANGES output ONLY on the buggy styles.
   */
  guardManifoldAlways?: boolean;
  /**
   * OPT-IN RIM-PIN for the PROD-TIERC region-assembly share (self-contained; NOT the noBridgeRefine K2 path).
   * When set to `nRing >= 2`, the kernel is built so its FOUR patch boundaries are LOCKED to fixed stations that
   * make `buildMetricOuterWall` able to emit periodic bottom/top rings of EXACTLY `nRing` ascending-u vertices:
   *   • the t=0 and t=1 RIM rows are seeded at u=i/nRing (i=0..nRing, incl. the u=1 seam image) and never split,
   *   • the u=0 and u=1 SEAM columns are seeded with identical t-stations and never split (so the post-pass can
   *     weld u=1→u=0 into ONE shared column — a periodic cylinder — closing the seam manifold-by-construction).
   * Refinement never subdivides an edge lying wholly on a boundary line; the INTERIOR refines freely by the metric.
   * Smoothing already pins patch-boundary vertices (u or t at 0/1), so the locked stations never move. STRICT NO-OP
   * when absent/<2 (the seed + split loop are byte-identical to the default kernel). `guardManifoldAlways` stays on.
   */
  rimPinRing?: number;
  /**
   * OPT-IN manifold guard for the CONSTRAINT-RECOVERY flips (E-2026-07-01-PUREGREEN). On a PLANARIZED constraint
   * graph the dense T-junction fans let a recovery flip duplicate an existing edge → non-manifold (MEASURED
   * nonMan=2 on planarized GothicArches). When true, recoverAndLockEdges rejects any crossing-flip whose new
   * diagonal already exists. STRICT NO-OP when absent/false (recovery runs exactly as before → the shipped
   * non-planarized conforming numbers are byte-identical). Only meaningful with constraintEdges.
   */
  guardRecoveryManifold?: boolean;
  /**
   * OPT-IN ROBUST constraint recovery for DENSE near-collinear pickets (E-2026-07-02-KERNEL-HARDEN). The
   * legacy guardRecoveryManifold multiset DRIFTS on dense pickets (SFB@1 petal-tip ladders at step <=0.03;
   * Crystalline-class): it counts each interior undirected edge TWICE at init but only +/-1 per flip, so it
   * leaves stale positives + understates new diagonals -> the tolerance-free convex-flip predicate produces
   * near-collinear SLIVERS + NON-MANIFOLD folds it cannot reject (MEASURED: SFB@1 step 0.03 -> 72 nonMan).
   * When true, recoverAndLockEdges additionally rejects any convex crossing flip that (a) creates a sub-eps
   * SLIVER triangle or (b) whose new diagonal already exists as a LIVE mesh edge (a drift-free non-manifold
   * test) -- both pure rejections -> manifold-safe by construction. STRICT NO-OP when absent/false (the robust
   * checks never run; the recovery path is byte-identical -> shipped conforming numbers unchanged). Only
   * meaningful with constraintEdges.
   */
  recoveryRobust?: boolean;
  /** Sliver |signed-area| threshold (local u-frame) for recoveryRobust. Default 0 (OFF) — sliver-rejection was
   *  A/B-REFUTED (it starves recovery: SFB@1 failed 86->2082, chord WORSE). Set >0 only to probe a specific
   *  sliver-attributed fold. Only used with recoveryRobust. */
  recoverySliverEps?: number;
  /**
   * OPT-IN SUBDIVIDE-COLLINEAR recovery (E-2026-07-04-COL-SUBDIV). The DOMINANT recovery failure on the
   * count-unstable Gothic crest network (E-2026-07-04-CU-GOTHICSEG: recovery 90.1%@3M → 65.7%@5.87M, true-3D
   * floored 0.058 = the un-embedded ~1/3) is a kernel interior/Steiner vertex landing (near-)collinear ON a
   * constraint segment a→b — the crossing-chain walk hits it as an on-segment apex and gives up, failing the
   * whole a→b. This is the TEXTBOOK CDT case: the on-segment vertex must SUBDIVIDE the constraint into a→v and
   * v→b (recursively), each of which recovers as an ordinary edge. When true, recoverAndLockEdges detects the
   * blocking on-segment vertex and splits there instead of failing — lifting recovery toward ~100% REGARDLESS of
   * density (finer sizing inserts MORE on-segment vertices, which USED to make recovery worse). STRICT NO-OP when
   * absent/false (the byte-identical recovery path; verified by the no-op fingerprint). Only meaningful with
   * constraintEdges. Independent of recoveryRobust — may combine. */
  recoverySubdivideCollinear?: boolean;
  /** local-u-frame perp distance under which a vertex counts as ON a constraint segment. Default 1e-9 (tight).
   *  Only used with recoverySubdivideCollinear. */
  recoveryCollinearEps?: number;
  /**
   * OPT-IN recovery HOOK (E-2026-07-02-SFB-CHAIN, DEV/LAB only). When present AND constraintEdges is non-empty,
   * this callback is invoked on the FINAL triangulation IN PLACE OF the internal recoverAndLockEdges — it
   * receives the live (triangles, halfedges, uv, cverts) and MUST recover+lock the constraints in-place, then
   * return the locked-edge Set (canonical key min*(nV+1)+max) plus recovery stats for the returned `constraint`.
   * Lets the SFB-CHAIN diagnostic plug in a caps-configurable / failure-classifying recovery (constraintRecovery
   * copy) WITHOUT editing the shared committed constraintRecovery.ts. STRICT NO-OP when absent: the internal
   * recoverAndLockEdges runs exactly as before (byte-identical). Only meaningful with constraintEdges.
   */
  recoveryHook?: (triangles: Uint32Array, halfedges: Int32Array, uv: number[], cverts: number[]) => { locked: Set<number>; stats: ConstraintRecoveryStats };
}
export interface ConstraintRecoveryStats { requested: number; alreadyPresent: number; recovered: number; failed: number; flips: number; robustSliverRejects?: number; robustManifoldRejects?: number; [k: string]: number | undefined; }
export interface MetricMesh { ut: number[]; indices: Uint32Array; points: number; rounds: number; hitBudget: boolean; constraint?: ConstraintRecoveryStats; }

/**
 * MAX interior-angle cosine of the 3D triangle (a,b,c) — monotone proxy for its MIN angle (largest cos ⇔
 * smallest angle), with no `acos` (the flip decision only needs to COMPARE worst angles). Returns 1
 * (cos 0°) for a degenerate triangle so it ranks as the worst.
 */
function maxCosXYZ(xyz: Float64Array, a: number, b: number, c: number): number {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  const la2 = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2; // opposite a
  const lb2 = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2; // opposite b
  const lc2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2; // opposite c
  if (la2 < 1e-24 || lb2 < 1e-24 || lc2 < 1e-24) return 1;
  const cosA = (lb2 + lc2 - la2) / (2 * Math.sqrt(lb2 * lc2));
  const cosB = (la2 + lc2 - lb2) / (2 * Math.sqrt(la2 * lc2));
  const cosC = (la2 + lb2 - lc2) / (2 * Math.sqrt(la2 * lb2));
  return Math.max(cosA, cosB, cosC);
}

const linkHE = (halfedges: Int32Array, a: number, b: number): void => { halfedges[a] = b; if (b !== -1) halfedges[b] = a; };

/**
 * In-place true-3D max-min-angle Lawson flips over Delaunator's halfedge structure — NO per-pass edge Map
 * (the 84%-of-runtime bottleneck). Each flip relinks a constant number of halfedges following Delaunator's own
 * `_legalize`, so a pass is O(edges) array iteration + O(flips) relink. Mutates `triangles` + `halfedges`.
 * Edge a (halfedge, twin b=halfedges[a]) has triangles T_a={pr,pl,p0}, T_b={pl,?,p1} sharing edge pr-pl with
 * apexes p0,p1; flipping swaps the diagonal to p0-p1 when that raises the worse of the two 3D min-angles.
 */
export function flipHE(
  triangles: Uint32Array, halfedges: Int32Array, xyz: Float64Array, uv: number[], maxPasses: number,
  shouldFlip?: (pr: number, pl: number, p0: number, p1: number) => boolean,
  isLocked?: (pr: number, pl: number) => boolean,
  guardManifold?: boolean,
): void {
  const ne = triangles.length;
  // OPT-IN manifold guard: a Lawson flip (pr,pl)→(p0,p1) creates a NON-MANIFOLD edge if (p0,p1) already
  // exists elsewhere. For a Delaunay mesh this never happens, but a PINNED/non-Delaunay configuration (the
  // feature-conforming injection path) can request such a flip — MEASURED: the sweep flips introduced
  // 22–193 non-manifold edges with pinned crest vertices. When guardManifold is set we maintain an
  // undirected-edge set and reject any flip whose new diagonal already exists. STRICT NO-OP when absent
  // (the default kernel path never builds the set → byte-identical).
  const nV = uv.length / 2;
  const EK = nV + 1;
  const ekey = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  // Undirected-edge presence, SHARDED: a single JS Set caps at 2^24 (16.7M) entries, which a large
  // feature-conforming mesh exceeds — shard by the low bits of the min vertex so each Set stays well under cap.
  const NSHARD = 64;
  const eshard = (a: number, b: number): number => ((a < b ? a : b) & (NSHARD - 1));
  let edgeSets: Set<number>[] | undefined;
  const edgeHas = (a: number, b: number): boolean => edgeSets![eshard(a, b)].has(ekey(a, b));
  const edgeAdd = (a: number, b: number): void => { edgeSets![eshard(a, b)].add(ekey(a, b)); };
  const edgeDel = (a: number, b: number): void => { edgeSets![eshard(a, b)].delete(ekey(a, b)); };
  if (guardManifold === true) {
    edgeSets = Array.from({ length: NSHARD }, () => new Set<number>());
    for (let e = 0; e < ne; e++) { const u = triangles[e], v = triangles[e % 3 === 2 ? e - 2 : e + 1]; edgeAdd(u, v); }
  }
  for (let pass = 0; pass < maxPasses; pass++) {
    let flips = 0;
    const touched = new Uint8Array(ne / 3);
    for (let a = 0; a < ne; a++) {
      const b = halfedges[a];
      if (b === -1 || b < a) continue; // each interior edge once, from its lower halfedge
      const t0 = (a / 3) | 0, t1 = (b / 3) | 0;
      if (touched[t0] || touched[t1]) continue;
      const a0 = a - (a % 3), b0 = b - (b % 3);
      const al = a0 + (a + 1) % 3, ar = a0 + (a + 2) % 3, bl = b0 + (b + 2) % 3;
      const pr = triangles[a], pl = triangles[al], p0 = triangles[ar], p1 = triangles[bl];
      // OPT-IN: never flip a LOCKED constraint edge (the shared edge pr-pl). No-op when isLocked is absent.
      if (isLocked !== undefined && isLocked(pr, pl)) continue;
      // OPT-IN manifold guard: reject the flip if the new diagonal (p0,p1) already exists elsewhere.
      if (edgeSets !== undefined && edgeHas(p0, p1)) continue;
      // validity: pr,pl must straddle the new diagonal p0-p1 in (u,t) (convex quad, no inversion)
      const dx = uv[p1 * 2] - uv[p0 * 2], dy = uv[p1 * 2 + 1] - uv[p0 * 2 + 1];
      const sPr = dx * (uv[pr * 2 + 1] - uv[p0 * 2 + 1]) - dy * (uv[pr * 2] - uv[p0 * 2]);
      const sPl = dx * (uv[pl * 2 + 1] - uv[p0 * 2 + 1]) - dy * (uv[pl * 2] - uv[p0 * 2]);
      if (sPr * sPl >= 0) continue;
      let doFlip: boolean;
      if (shouldFlip !== undefined) {
        doFlip = shouldFlip(pr, pl, p0, p1);            // pluggable criterion (e.g. anisotropic metric in-circle)
      } else {
        // default: flip if it LOWERS the worst max-cos (raises the worse true-3D min-angle).
        const curWorstCos = Math.max(maxCosXYZ(xyz, pr, pl, p0), maxCosXYZ(xyz, pr, pl, p1));
        const flpWorstCos = Math.max(maxCosXYZ(xyz, p0, p1, pl), maxCosXYZ(xyz, p0, p1, pr));
        doFlip = flpWorstCos < curWorstCos - 1e-9;
      }
      if (!doFlip) continue;
      triangles[a] = p1; triangles[b] = p0;
      const hbl = halfedges[bl], har = halfedges[ar];
      linkHE(halfedges, a, hbl);
      linkHE(halfedges, b, har);
      linkHE(halfedges, ar, bl);
      if (edgeSets !== undefined) { edgeDel(pr, pl); edgeAdd(p0, p1); }
      touched[t0] = 1; touched[t1] = 1; flips++;
    }
    if (flips === 0) break;
  }
}

export function buildMetricMesh(rA: AnalyticRadiusFn, H: number, opts: MetricMeshOpts): MetricMesh {
  const sizeRes = opts.sizeRes ?? 160;
  const seedN = opts.seedN ?? 12;
  const maxPoints = opts.maxPoints ?? 5_000_000;
  const maxRounds = opts.maxRounds ?? 60;
  const splitThresh2 = (opts.splitThresh ?? 1.5) ** 2; // split if longest metric-edge² exceeds this
  const sweeps = opts.optimizeSweeps ?? 6;
  const dedupeEps = opts.dedupeEps ?? 1e-6;
  // OPT-IN rim-pin (region-assembly share). Lock the four patch boundaries to fixed stations so
  // buildMetricOuterWall can weld the seam and emit nRing-length periodic rims. STRICT NO-OP when absent.
  const rimPinRing = opts.rimPinRing;
  const doRimPin = rimPinRing !== undefined && rimPinRing >= 2;
  const BND_EPS = 1e-9;
  // Rim-pin near-boundary SPLIT guard (PROD-TIERC feature-conforming region path). Under rim-pin, refining an edge
  // from an INTERIOR (feature-u) vertex down to the locked rim/seam marches split-midpoints geometrically toward
  // the boundary (t or u halving each round). At a NON-seed station — which the feature-conforming injection
  // introduces (θ-valley/flank-toe loci sit at the scale lattice, not the nRing rim stations) — those midpoints are
  // NOT deduped against the seed columns, so once one lands within the ring-collection band (metricMeshToOuterWall
  // collects t/u within 1e-6) it pollutes the emitted rim ring or breaks the u-seam weld bijection. Rejecting any
  // split midpoint inside a thin locked-boundary band keeps the marching clear of that zone (the band is 1000× the
  // collection epsilon, so smoothing drift cannot re-enter it). STRICT NO-OP when doRimPin is false (the default and
  // non-rim-pinned region paths never evaluate it → the split loop is byte-identical). Without injection the marching
  // only occurs at seed-u (which dedupes), so this guard changes nothing for a plain rim-pinned wall either.
  const RIM_SPLIT_BAND = 1e-3;
  const rimSplitBlocked = (mu: number, mt: number): boolean =>
    doRimPin && (mt < RIM_SPLIT_BAND || mt > 1 - RIM_SPLIT_BAND || mu < RIM_SPLIT_BAND || mu > 1 - RIM_SPLIT_BAND);

  const mf = buildSurfaceMetricField(rA, H, { resU: sizeRes, resT: sizeRes, tolMm: opts.tolMm, hMin: opts.hMin, hMax: opts.hMax, gradeBeta: opts.gradeBeta ?? 0.2, curvatureFineStep: opts.curvatureFineStep, curvatureSubsamples: opts.curvatureSubsamples, crestSizeOverlay: opts.crestSizeOverlay, crestBandCells: opts.crestBandCells });
  const RU = mf.resU, RT = mf.resT, M = mf.m;
  const metricAt = (u: number, t: number): [number, number, number] => {
    const fu = Math.min(Math.max(u, 0), 1) * (RU - 1), ft = Math.min(Math.max(t, 0), 1) * (RT - 1);
    const iu = Math.min(Math.floor(fu), RU - 2), it = Math.min(Math.floor(ft), RT - 2);
    const au = fu - iu, bt = ft - it;
    const c00 = (it * RU + iu) * 3, c10 = c00 + 3, c01 = ((it + 1) * RU + iu) * 3, c11 = c01 + 3;
    const w00 = (1 - au) * (1 - bt), w10 = au * (1 - bt), w01 = (1 - au) * bt, w11 = au * bt;
    return [
      M[c00] * w00 + M[c10] * w10 + M[c01] * w01 + M[c11] * w11,
      M[c00 + 1] * w00 + M[c10 + 1] * w10 + M[c01 + 1] * w01 + M[c11 + 1] * w11,
      M[c00 + 2] * w00 + M[c10 + 2] * w10 + M[c01 + 2] * w01 + M[c11 + 2] * w11,
    ];
  };
  const metricLen2 = (u0: number, t0: number, u1: number, t1: number): number => {
    const [m00, m01, m11] = metricAt((u0 + u1) / 2, (t0 + t1) / 2);
    const du = u1 - u0, dt = t1 - t0;
    return m00 * du * du + 2 * m01 * du * dt + m11 * dt * dt;
  };
  // DIRECT facet→surface chord-sag of triangle (va,vb,vc): sample the TRUE surface at the 3 edge-midpoints +
  // centroid, return the max |deviation| from the facet plane. Robust to grid aliasing of sharp relief.
  const chordTolMm = opts.chordTolMm;
  const liftP = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  // Deep-sag chord sampler lattice. Default = 4 pts (3 edge-mids + centroid) → byte-identical. chordSampleN>2 opts
  // into a dense denseBary(n) lattice matching the acceptance ruler (E-2026-07-08-SMOOTH-TAILS): a facet whose sag
  // peaks BETWEEN the 4 coarse samples is invisible to the 4-pt guard but caught by the dense one.
  const BARY: [number, number, number][] = (() => {
    const n = opts.chordSampleN ?? 0;
    if (n <= 2) return [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
    const B: [number, number, number][] = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
    return B;
  })();
  const chordSag = (va: number, vb: number, vc: number): number => {
    const A = liftP(uv[2 * va], uv[2 * va + 1]), B = liftP(uv[2 * vb], uv[2 * vb + 1]), C = liftP(uv[2 * vc], uv[2 * vc + 1]);
    let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
    let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
    let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let mx = 0;
    for (const [w0, w1, w2] of BARY) {
      const p = liftP(w0 * uv[2 * va] + w1 * uv[2 * vb] + w2 * uv[2 * vc], w0 * uv[2 * va + 1] + w1 * uv[2 * vb + 1] + w2 * uv[2 * vc + 1]);
      const d = Math.abs((p[0] - A[0]) * nx + (p[1] - A[1]) * ny + (p[2] - A[2]) * nz);
      if (d > mx) mx = d;
    }
    return mx;
  };
  // Like chordSag but returns the (u,t) of the WORST-sag bary sample (opt-in Steiner refinement target).
  const chordWorstBary = (va: number, vb: number, vc: number): { sag: number; u: number; t: number } => {
    const A = liftP(uv[2 * va], uv[2 * va + 1]), B = liftP(uv[2 * vb], uv[2 * vb + 1]), C = liftP(uv[2 * vc], uv[2 * vc + 1]);
    let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
    let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
    let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let mx = 0, mu = (uv[2 * va] + uv[2 * vb] + uv[2 * vc]) / 3, mt = (uv[2 * va + 1] + uv[2 * vb + 1] + uv[2 * vc + 1]) / 3;
    for (const [w0, w1, w2] of BARY) {
      const su = w0 * uv[2 * va] + w1 * uv[2 * vb] + w2 * uv[2 * vc];
      const st = w0 * uv[2 * va + 1] + w1 * uv[2 * vb + 1] + w2 * uv[2 * vc + 1];
      const p = liftP(su, st);
      const d = Math.abs((p[0] - A[0]) * nx + (p[1] - A[1]) * ny + (p[2] - A[2]) * nz);
      if (d > mx) { mx = d; mu = su; mt = st; }
    }
    return { sag: mx, u: mu, t: mt };
  };

  // global anisotropy scale for the initial Euclidean Delaunay (flips fix the local residual)
  const ratios: number[] = [];
  for (let i = 0; i < RU * RT; i++) { const a = M[i * 3], c = M[i * 3 + 2]; if (a > 0 && c > 0) ratios.push(Math.sqrt(a / c)); }
  ratios.sort((x, y) => x - y);
  const s = ratios[Math.floor(ratios.length / 2)] || 1;

  const uv: number[] = [];
  // key → vertex index. Map (not Set) so the OPT-IN constraint path can recover the index of a point that
  // merged into an existing vertex (injPosToVert). Dedup decisions + push order are unchanged ⇒ the default
  // path stays byte-identical (verified by the no-op fingerprint test).
  const seen = new Map<number, number>();
  const keyOf = (u: number, t: number): number => Math.round(u / dedupeEps) * 1_500_000 + Math.round(t / dedupeEps);
  const addPoint = (u: number, t: number): boolean => { const k = keyOf(u, t); if (seen.has(k)) return false; seen.set(k, uv.length / 2); uv.push(u, t); return true; };
  const vertOfKey = (k: number): number => seen.get(k) ?? -1;

  // Rim-pin: seed EXACTLY `rimPinRing` u-columns (u=i/nRing, i=0..nRing) so the t=0/t=1 rows carry nRing+1
  // stations (the u=1 station is the periodic image of u=0) AND the u=0/u=1 seam columns share identical
  // t-stations (both are the seed rows j/seedNt) — the clean bijection buildMetricOuterWall welds. Default: the
  // anisotropy-scaled column count.
  const seedNt = Math.max(2, seedN), seedNu = doRimPin ? rimPinRing! : Math.max(2, Math.round(seedN * s));
  for (let i = 0; i <= seedNu; i++) for (let j = 0; j <= seedNt; j++) addPoint(i / seedNu, j / seedNt);

  // Rim-pin boundary lock: true iff the edge (i0,i1) lies WHOLLY on one patch boundary line (both endpoints on
  // t=0, or both on t=1, or both on u=0, or both on u=1). Such edges are never split, so the seeded rim/seam
  // stations stay fixed → the emitted rings are exactly nRing and the seam columns stay a weldable bijection.
  const onSameBoundaryLine = (i0: number, i1: number): boolean => {
    const u0 = uv[2 * i0], t0v = uv[2 * i0 + 1], u1 = uv[2 * i1], t1v = uv[2 * i1 + 1];
    return (t0v <= BND_EPS && t1v <= BND_EPS)
      || (t0v >= 1 - BND_EPS && t1v >= 1 - BND_EPS)
      || (u0 <= BND_EPS && u1 <= BND_EPS)
      || (u0 >= 1 - BND_EPS && u1 >= 1 - BND_EPS);
  };

  // OPT-IN feature-conforming injection. Forced points (e.g. refined crest/valley loci) are appended to the
  // point set here — exactly where a denser seed grid would add them — then participate in EVERY round of
  // Delaunay/flip/split below. addPoint de-dupes against the seeds. We record which final-vertex indices are
  // injected (the uv length before/after each successful add) so smoothing can pin them. STRICT NO-OP when
  // the option is absent/empty: the loop never executes, leaving the default path byte-identical.
  const pinnedInjected = opts.pinInjected === true ? new Set<number>() : undefined;
  const inj = opts.injectedPoints;
  // map[injectedArrayPosition] = kernel vertex index (or the index of the existing dup it merged into).
  // Needed so opt.constraintEdges (pairs of injected positions) can be resolved to vertex indices.
  const wantConstraints = opts.constraintEdges !== undefined && opts.constraintEdges.length > 0;
  const injPosToVert: Int32Array | undefined = (inj !== undefined && wantConstraints) ? new Int32Array(inj.length / 2).fill(-1) : undefined;
  if (inj !== undefined && inj.length >= 2) {
    for (let i = 0; i + 1 < inj.length; i += 2) {
      const before = uv.length / 2;
      const u = inj[i], t = inj[i + 1];
      if (addPoint(u, t)) {
        if (pinnedInjected !== undefined) pinnedInjected.add(before);
        if (injPosToVert !== undefined) injPosToVert[i / 2] = before;
      } else if (injPosToVert !== undefined) {
        // merged into an existing vertex — recover its index from the dedupe key.
        injPosToVert[i / 2] = vertOfKey(keyOf(u, t));
      }
    }
  }

  const scaledCoords = (): Float64Array => { const c = new Float64Array(uv.length); for (let k = 0; k < uv.length; k += 2) { c[k] = uv[k] * s; c[k + 1] = uv[k + 1]; } return c; };
  const computeXYZ = (): Float64Array => {
    const n = uv.length / 2, p = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const u = uv[2 * i], t = uv[2 * i + 1], th = TAU * u, z = t * H, r = rA(th, z); p[3 * i] = r * Math.cos(th); p[3 * i + 1] = r * Math.sin(th); p[3 * i + 2] = z; }
    return p;
  };

  const prof = opts.profile === true;
  const now = (): number => Date.now();
  let tDel = 0, tFlip = 0, tXYZ = 0, tSplit = 0, tSmooth = 0;

  // Annotated bare `Uint32Array` (defaults to <ArrayBufferLike>) so Delaunator's ArrayBufferLike-backed `.triangles`
  // assigns without the TS5.7 typed-array-generic mismatch a narrowed `new Uint32Array(0)` (<ArrayBuffer>) would cause.
  let tris: Uint32Array = new Uint32Array(0); let rounds = 0; let hitBudget = false;
  for (; rounds < maxRounds; rounds++) {
    let z = now(); const d = new Delaunator(scaledCoords()); tris = d.triangles; const he = d.halfedges; tDel += now() - z;
    z = now(); const xyzR = computeXYZ(); tXYZ += now() - z;
    z = now(); flipHE(tris, he, xyzR, uv, 3); tFlip += now() - z;
    z = now();
    let added = 0;
    // split EVERY over-size edge's midpoint this round (not just the longest per triangle) — shared edges dedup
    // via addPoint, and refining all over-size edges at once converges in ~log2(ratio) rounds, not ~60.
    for (let ti = 0; ti < tris.length; ti += 3) {
      const a = tris[ti] * 2, b = tris[ti + 1] * 2, c = tris[ti + 2] * 2;
      // Rim-pin: an edge lying wholly on a patch boundary is LOCKED (never split) so the seeded rim/seam
      // stations stay fixed. No-op when doRimPin is false (all three flags stay false → byte-identical splits).
      const lockAB = doRimPin && onSameBoundaryLine(tris[ti], tris[ti + 1]);
      const lockBC = doRimPin && onSameBoundaryLine(tris[ti + 1], tris[ti + 2]);
      const lockCA = doRimPin && onSameBoundaryLine(tris[ti + 2], tris[ti]);
      const eAB = metricLen2(uv[a], uv[a + 1], uv[b], uv[b + 1]);
      const eBC = metricLen2(uv[b], uv[b + 1], uv[c], uv[c + 1]);
      const eCA = metricLen2(uv[c], uv[c + 1], uv[a], uv[a + 1]);
      // Midpoints of each edge (rim-pin guard rejects any that land inside the locked-boundary band; no-op off).
      const mABu = (uv[a] + uv[b]) / 2, mABt = (uv[a + 1] + uv[b + 1]) / 2;
      const mBCu = (uv[b] + uv[c]) / 2, mBCt = (uv[b + 1] + uv[c + 1]) / 2;
      const mCAu = (uv[c] + uv[a]) / 2, mCAt = (uv[c + 1] + uv[a + 1]) / 2;
      if (!lockAB && eAB > splitThresh2 && !rimSplitBlocked(mABu, mABt) && addPoint(mABu, mABt)) added++;
      if (!lockBC && eBC > splitThresh2 && !rimSplitBlocked(mBCu, mBCt) && addPoint(mBCu, mBCt)) added++;
      if (!lockCA && eCA > splitThresh2 && !rimSplitBlocked(mCAu, mCAt) && addPoint(mCAu, mCAt)) added++;
      // fidelity guard: if the facet deviates from the TRUE surface > chordTolMm, split the longest edge
      // (catches sharp/thin relief the grid-curvature metric aliases). Skip if already metric-split this edge.
      if (chordTolMm !== undefined && Math.max(eAB, eBC, eCA) <= splitThresh2) {
        if (opts.chordSteiner === true) {
          // Steiner at the worst-sag sample (interior apex faces): an edge split can't converge a vertex onto
          // an interior bulge; the worst-sag point (often the centroid) can.
          const w = chordWorstBary(tris[ti], tris[ti + 1], tris[ti + 2]);
          // Rim-pin: never place a Steiner point ON a locked boundary line (would break the seam bijection).
          const wOnBnd = doRimPin && (w.u <= BND_EPS || w.u >= 1 - BND_EPS || w.t <= BND_EPS || w.t >= 1 - BND_EPS);
          if (!wOnBnd && w.sag > chordTolMm && addPoint(w.u, w.t)) added++;
        } else if (chordSag(tris[ti], tris[ti + 1], tris[ti + 2]) > chordTolMm) {
          if (eAB >= eBC && eAB >= eCA) { if (!lockAB && !rimSplitBlocked(mABu, mABt) && addPoint(mABu, mABt)) added++; }
          else if (eBC >= eCA) { if (!lockBC && !rimSplitBlocked(mBCu, mBCt) && addPoint(mBCu, mBCt)) added++; }
          else if (!lockCA && !rimSplitBlocked(mCAu, mCAt) && addPoint(mCAu, mCAt)) added++;
        }
      }
      if (uv.length / 2 > maxPoints) { hitBudget = true; break; }
    }
    tSplit += now() - z;
    if (hitBudget || added === 0) { rounds++; break; }
  }

  // OPT-IN: force the manifold guard on the DEFAULT (non-injection) path too (Task 4). The injection path
  // always guards (guardMan below). When guardManifoldAlways is set, the final flip + sweep flips reject any
  // flip whose new diagonal already exists, fixing the pre-existing kernel non-manifold defect. STRICT NO-OP
  // when false (the flips run exactly as before → byte-identical default).
  const guardAlways = opts.guardManifoldAlways === true;

  // final connectivity + optimization sweeps (relocate on the surface, then re-flip to the true-3D Delaunay).
  // Smoothing moves vertices but NOT connectivity, so the halfedge structure stays valid across sweeps.
  let z = now(); const dF = new Delaunator(scaledCoords()); tris = dF.triangles; const heF = dF.halfedges; tDel += now() - z;
  z = now(); flipHE(tris, heF, computeXYZ(), uv, 4, undefined, undefined, guardAlways); tFlip += now() - z;

  // OPT-IN Stage-B: recover + lock the constraint edges on the final triangulation, BEFORE the optimization
  // sweeps, so the locus becomes a real mesh edge and the locked-flip guard keeps it. STRICT NO-OP when
  // constraintEdges is absent/empty (the block never runs; isLocked stays undefined → flipHE unchanged).
  let isLocked: ((a: number, b: number) => boolean) | undefined;
  let constraintStats: ConstraintRecoveryStats | undefined;
  const cEdges = opts.constraintEdges;
  if (cEdges !== undefined && cEdges.length >= 2 && injPosToVert !== undefined) {
    // resolve injected positions → vertex indices
    const cverts: number[] = [];
    for (let i = 0; i + 1 < cEdges.length; i += 2) {
      const a = injPosToVert[cEdges[i]], b = injPosToVert[cEdges[i + 1]];
      if (a >= 0 && b >= 0 && a !== b) cverts.push(a, b);
    }
    z = now();
    if (opts.recoveryHook !== undefined) {
      // OPT-IN recovery hook (E-2026-07-02-SFB-CHAIN): the caller's recovery runs IN PLACE OF the internal one
      // (caps-configurable / failure-classifying diagnostic). It mutates tris/heF in place + returns locked+stats.
      const hooked = opts.recoveryHook(tris, heF, uv, cverts);
      isLocked = lockedPredicate(hooked.locked, uv.length / 2);
      constraintStats = hooked.stats;
    } else {
      // OPT-IN robust recovery (E-2026-07-02-KERNEL-HARDEN) + OPT-IN subdivide-collinear (E-2026-07-04-COL-SUBDIV):
      // threads recoveryRobust/recoverySliverEps + recoverySubdivideCollinear/recoveryCollinearEps to the recovery
      // path. STRICT NO-OP when BOTH switches are absent/false → robustOpts is undefined → the extra checks / the
      // subdivide worklist never run → byte-identical recovery.
      const wantRobust = opts.recoveryRobust === true;
      const wantSubdiv = opts.recoverySubdivideCollinear === true;
      const robustOpts = (wantRobust || wantSubdiv)
        ? {
            ...(wantRobust ? { robust: true, sliverEps: opts.recoverySliverEps } : {}),
            ...(wantSubdiv ? { subdivideCollinear: true, ...(opts.recoveryCollinearEps !== undefined ? { collinearEps: opts.recoveryCollinearEps } : {}) } : {}),
          }
        : undefined;
      const rec = recoverAndLockEdges(tris, heF, uv, cverts, 64, opts.guardRecoveryManifold === true, robustOpts);
      isLocked = lockedPredicate(rec.locked, uv.length / 2);
      constraintStats = { requested: cverts.length / 2, alreadyPresent: rec.alreadyPresent, recovered: rec.recovered, failed: rec.recoveryFailed, flips: rec.flips, robustSliverRejects: rec.robustSliverRejects, robustManifoldRejects: rec.robustManifoldRejects, subdivSplits: rec.subdivSplits, subdivSubSegments: rec.subdivSubSegments, subdivFailNonCollinear: rec.subdivFailNonCollinear, subdivFailBudget: rec.subdivFailBudget };
    }
    tFlip += now() - z;
    if (prof) {
      // eslint-disable-next-line no-console
      console.log(`  [constraint] requested=${constraintStats?.requested} present=${constraintStats?.alreadyPresent} recovered=${constraintStats?.recovered} failed=${constraintStats?.failed} flips=${constraintStats?.flips}`);
    }
  }

  // The optimization sweeps re-flip on a PINNED (non-Delaunay) configuration when feature points are injected,
  // which can request a flip that duplicates an existing edge → non-manifold. Guard those flips against
  // creating a duplicate edge on the injection path (always) OR when guardManifoldAlways is set (Task 4 —
  // fixes the DEFAULT-path non-manifold defect on sharp styles). Default path stays byte-identical.
  const guardMan = (inj !== undefined && inj.length >= 2) || guardAlways;
  let cur = uv.slice();
  for (let k = 0; k < sweeps; k++) {
    z = now(); cur = smoothSurfaceOnRadial(cur, tris, rA, H, { iterations: 3, relax: 0.5, pinned: pinnedInjected }); tSmooth += now() - z;
    z = now();
    const n = cur.length / 2, p = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) { const u = cur[2 * i], t = cur[2 * i + 1], th = TAU * u, zz = t * H, r = rA(th, zz); p[3 * i] = r * Math.cos(th); p[3 * i + 1] = r * Math.sin(th); p[3 * i + 2] = zz; }
    tXYZ += now() - z;
    z = now(); flipHE(tris, heF, p, cur, 4, undefined, isLocked, guardMan); tFlip += now() - z;
  }

  if (prof) {
    // eslint-disable-next-line no-console
    console.log(`  [profile] delaunay=${(tDel / 1000).toFixed(1)}s flip=${(tFlip / 1000).toFixed(1)}s smooth=${(tSmooth / 1000).toFixed(1)}s xyz=${(tXYZ / 1000).toFixed(1)}s split=${(tSplit / 1000).toFixed(1)}s`);
  }
  return { ut: cur, indices: tris, points: cur.length / 2, rounds, hitBudget, constraint: constraintStats };
}

/**
 * Public region-layer opts for {@link buildMetricOuterWall}. A curated subset of {@link MetricMeshOpts} — the
 * feature-conforming injection/constraint/recovery levers are DEV-only and intentionally NOT exposed on the region
 * dispatch surface (the default sliver-heavy route never uses them). `guardManifoldAlways` is NOT here: it is forced
 * `true` internally (the MANDATORY watertight guard — see below).
 */
export interface MetricOuterWallOpts {
  /** Chord tolerance (mm) driving the curvature-adaptive M=g/h² sizing field. */
  tolMm: number;
  /** Lower / upper clamp on the target 3D edge length (mm). */
  hMin: number;
  hMax: number;
  /** Metric-field grid resolution (per axis; default 160). */
  sizeRes?: number;
  /** h-gradation ratio β (default 0.2). */
  gradeBeta?: number;
  /** Seed-grid density before refinement (default 12). */
  seedN?: number;
  /** Vertex budget cap (default 5,000,000). */
  maxPoints?: number;
  /** Max refinement rounds (default 60). */
  maxRounds?: number;
  /** Metric-edge² split threshold (default 1.5). */
  splitThresh?: number;
  /** On-surface smooth+flip optimization sweeps (default 6). */
  optimizeSweeps?: number;
  /** Dedupe epsilon in (u,t) (default 1e-6). */
  dedupeEps?: number;
  /** OPT-IN direct facet→surface chord-sag fidelity guard (mm). */
  chordTolMm?: number;
  /** With chordTolMm: Steiner at the worst-sag sample instead of the longest-edge midpoint. */
  chordSteiner?: boolean;
  /** OPT-IN dense chord-sag sampler lattice (n≥3 ⇒ (n+1)(n+2)/2 samples). */
  chordSampleN?: number;
  /** OPT-IN fine-step sub-cell curvature sizing (resolves sharp sub-cell ridges). */
  curvatureFineStep?: number;
  curvatureSubsamples?: number;
  /**
   * PROD-TIERC FEATURE-CONFORMING graph (opt-in, region-dispatch only). Flat (u,t) pairs of FORCED points seeded
   * alongside the seed grid — typically a per-style crease/valley edge graph (e.g. the DragonScales θ-valley ∪
   * flank-toe contour built by {@link buildDragonScalesConformingGraph}). Threaded straight to
   * {@link MetricMeshOpts.injectedPoints}. The region dispatch generates these per style; a plain region wall (no
   * style graph) leaves them absent. STRICT NO-OP when absent/empty (kernel injection block never runs ⇒
   * byte-identical to the pre-conforming region wall). MUST be clipped to the patch INTERIOR (off the four locked
   * boundaries) so the rim-pin seam-weld bijection holds — {@link buildDragonScalesConformingGraph} does this.
   */
  injectedPoints?: number[];
  /**
   * PROD-TIERC constraint edges (opt-in): vertex-PAIRS as positions into {@link injectedPoints} — the kernel
   * recovers each as a real mesh edge (a locus edge lies ON the crease). Threaded to
   * {@link MetricMeshOpts.constraintEdges}. Requires {@link injectedPoints}. STRICT NO-OP when absent/empty.
   */
  constraintEdges?: number[];
  /** With {@link injectedPoints}: PIN the injected crease vertices during smoothing (default true when a graph is
   *  supplied). Threaded to {@link MetricMeshOpts.pinInjected}. No-op without a graph. */
  pinInjected?: boolean;
  /** With {@link constraintEdges}: robust SUBDIVIDE-COLLINEAR recovery (lifts recovery→~100% regardless of density
   *  — the proven DS-close recovery mode). Threaded to {@link MetricMeshOpts.recoverySubdivideCollinear}. No-op
   *  without a graph. */
  recoverySubdivideCollinear?: boolean;
  /**
   * PROD-TIERC region-assembly RIM-PIN (opt-in). When set, the emitted `bottomRing`/`topRing` are reconciled to
   * EXACTLY this many evenly-spaced ascending-u stations, and the u=0/u=1 seam is welded into a periodic cylinder,
   * so {@link WatertightAssembly.assembleWatertight}'s shared rim (`annulusStrip`) and base caps (`emitRadialCap`)
   * adopt this wall UNCHANGED (they pair index-for-index against the pinned-nRing inner wall). MUST equal the
   * assembly's `nRing`. Absent ⇒ emergent CDT rim counts + all-zero seam-triangle flags (byte-identical to the
   * pre-share build; the assembler must not adopt an un-pinned wall).
   */
  nRing?: number;
}

/**
 * Build the region-layer OUTER WALL as a {@link ConformingOuterWallResult} — the uniform shape the region dispatch +
 * WatertightAssembly consume from every builder (DS/K2/…). Wraps the ported {@link buildMetricMesh} M=g/h² kernel.
 *
 * MANDATORY WATERTIGHT GUARD: `guardManifoldAlways` is forced `true` here. The default kernel flip path leaves
 * 228–257 non-manifold edges on sharp/near-vertical styles (MEASURED); the guard rejects any flip whose new diagonal
 * already exists, closing that to 0 non-manifold edges, and is byte-identical-OFF on non-buggy configs. It is not a
 * caller lever — the region wall must be watertight by construction.
 *
 * REACHABLE ONLY UNDER THE D-1 FLAG: throws unless {@link isRegionLayerEnabled} is true. Combined with the fact that
 * no production dispatch imports this module yet, the kernel is structurally unreachable flag-off ⇒ byte-identical
 * production. When the region dispatch is wired (follow-up), it gates the route on the same flag.
 *
 * The kernel meshes the [0,1]² (u,t) patch with DISTINCT u=0 and u=1 boundary columns (a flat patch, not a wrapped
 * cylinder); the u-seam is welded downstream by position (u=0 and u=1 lift to the same xyz). Accordingly no triangle
 * spans the seam, so `seamTriangles` is all-zero; the seam weld is WatertightAssembly's responsibility.
 */
export function buildMetricOuterWall(
  rA: AnalyticRadiusFn,
  dims: { H: number },
  opts: MetricOuterWallOpts,
): ConformingOuterWallResult {
  if (!isRegionLayerEnabled()) {
    throw new Error('buildMetricOuterWall: region layer is disabled (set globalThis.__pfRegionLayer = true). '
      + 'The M=g/h² region kernel is reachable only under the D-1 flag.');
  }
  const mesh = buildMetricMesh(rA, dims.H, {
    tolMm: opts.tolMm, hMin: opts.hMin, hMax: opts.hMax,
    sizeRes: opts.sizeRes, gradeBeta: opts.gradeBeta, seedN: opts.seedN,
    maxPoints: opts.maxPoints, maxRounds: opts.maxRounds, splitThresh: opts.splitThresh,
    optimizeSweeps: opts.optimizeSweeps, dedupeEps: opts.dedupeEps,
    chordTolMm: opts.chordTolMm, chordSteiner: opts.chordSteiner, chordSampleN: opts.chordSampleN,
    curvatureFineStep: opts.curvatureFineStep, curvatureSubsamples: opts.curvatureSubsamples,
    // OPT-IN feature-conforming graph (region dispatch, per style). Absent ⇒ kernel injection/constraint blocks
    // never run ⇒ byte-identical to the plain region wall. The dispatch clips the graph to the interior so the
    // rim-pin seam-weld bijection below still holds.
    injectedPoints: opts.injectedPoints,
    constraintEdges: opts.constraintEdges,
    pinInjected: opts.pinInjected,
    recoverySubdivideCollinear: opts.recoverySubdivideCollinear,
    guardManifoldAlways: true, // MANDATORY — watertight-by-construction (byte-identical off on non-buggy configs).
    rimPinRing: opts.nRing,    // OPT-IN region-assembly rim-pin (undefined ⇒ emergent rims, byte-identical).
  });
  return metricMeshToOuterWall(mesh, opts.nRing);
}

/**
 * Adapt a {@link MetricMesh} (flat (u,t) + index buffer over the [0,1]² patch) to a {@link ConformingOuterWallResult}
 * (packed (u,t,0) vertices + ordered boundary rings).
 *
 * DEFAULT (rimPinRing absent): a pure repack — no geometry change, distinct u=0/u=1 columns, all-zero seam flags,
 * emergent bottom/top rings (byte-identical to the pre-share port).
 *
 * RIM-PIN (rimPinRing set): the mesh was built with all four boundaries LOCKED (see {@link MetricMeshOpts.rimPinRing}),
 * so the u=0 and u=1 seam columns are an exact t-station bijection. We WELD u=1→u=0 (remap the u=1 column indices onto
 * their u=0 twins, then compact) — closing the periodic seam into ONE shared index column (manifold-by-construction:
 * each seam hull-edge is now shared by the u≈0-side and u≈1-side triangles) — and emit `bottomRing`/`topRing` of
 * EXACTLY `rimPinRing` ascending-u stations. Seam-adjacent triangles now span the wrap, so `seamTriangles` is
 * recomputed by u-span (>0.5). Throws if the seam columns are NOT a clean bijection (the rim-pin invariant broke —
 * never emit a mesh the assembler would silently mis-adopt).
 */
function metricMeshToOuterWall(mesh: MetricMesh, rimPinRing?: number): ConformingOuterWallResult {
  const ut = mesh.ut;
  const nV = ut.length / 2;
  const RING_EPS = 1e-6;
  const doRimPin = rimPinRing !== undefined && rimPinRing >= 2;

  // remap[i] = surviving vertex i maps to (identity by default; u=1→u=0 under the rim-pin weld).
  const remap = new Int32Array(nV);
  for (let i = 0; i < nV; i++) remap[i] = i;
  if (doRimPin) {
    const col0: number[] = [], col1: number[] = [];
    for (let i = 0; i < nV; i++) {
      const u = ut[2 * i];
      if (u <= RING_EPS) col0.push(i);
      else if (u >= 1 - RING_EPS) col1.push(i);
    }
    // The seed-lock keeps both seam columns as the SAME t-station multiset; a clean k-th↔k-th (t-sorted) bijection
    // is required to weld. Anything else means the lock leaked (a boundary edge got split) — fail loudly.
    if (col0.length === 0 || col0.length !== col1.length) {
      throw new Error(`buildMetricOuterWall: rim-pin seam columns are not a bijection (u0=${col0.length}, u1=${col1.length})`);
    }
    col0.sort((a, b) => ut[2 * a + 1] - ut[2 * b + 1]);
    col1.sort((a, b) => ut[2 * a + 1] - ut[2 * b + 1]);
    for (let k = 0; k < col1.length; k++) {
      if (Math.abs(ut[2 * col1[k] + 1] - ut[2 * col0[k] + 1]) >= RING_EPS) {
        throw new Error('buildMetricOuterWall: rim-pin seam t-stations are not matched (lock leaked)');
      }
      remap[col1[k]] = col0[k];
    }
  }

  // Compact the surviving vertices (those that map to themselves) to dense new indices.
  const oldToNew = new Int32Array(nV).fill(-1);
  let newCount = 0;
  for (let i = 0; i < nV; i++) if (remap[i] === i) oldToNew[i] = newCount++;
  const finalOf = (i: number): number => oldToNew[remap[i]];

  const vertices = new Float32Array(newCount * 3);
  for (let i = 0; i < nV; i++) {
    if (remap[i] !== i) continue;
    const ni = oldToNew[i];
    vertices[3 * ni] = ut[2 * i]; vertices[3 * ni + 1] = ut[2 * i + 1]; vertices[3 * ni + 2] = 0;
  }
  const nTri = mesh.indices.length / 3;
  const indices = new Uint32Array(mesh.indices.length);
  for (let k = 0; k < mesh.indices.length; k++) indices[k] = finalOf(mesh.indices[k]);

  // DEFAULT: no triangle spans the seam ⇒ all-zero seam flags. RIM-PIN: seam-adjacent triangles wrap after the
  // weld ⇒ flag any triangle whose u-span exceeds 0.5 (mirrors index.ts toOuterWallResult).
  const seamTriangles = new Uint8Array(nTri);
  if (doRimPin) {
    for (let f = 0; f < nTri; f++) {
      const ua = vertices[3 * indices[3 * f]], ub = vertices[3 * indices[3 * f + 1]], uc = vertices[3 * indices[3 * f + 2]];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) seamTriangles[f] = 1;
    }
  }

  // Boundary rings: t≈0 (bottom) / t≈1 (top), each ordered by u ascending. Boundary vertices are pinned during
  // smoothing so they stay EXACTLY on t=0/t=1. Under the rim-pin weld the u=1 corner folds onto u=0, so a locked
  // t-row of nRing+1 stations becomes a periodic ring of EXACTLY nRing entries.
  const bottom: number[] = [], top: number[] = [];
  for (let i = 0; i < nV; i++) {
    if (remap[i] !== i) continue;
    const t = ut[2 * i + 1];
    const ni = oldToNew[i];
    if (t <= RING_EPS) bottom.push(ni);
    else if (t >= 1 - RING_EPS) top.push(ni);
  }
  bottom.sort((a, b) => vertices[3 * a] - vertices[3 * b]);
  top.sort((a, b) => vertices[3 * a] - vertices[3 * b]);
  return { vertices, indices, seamTriangles, gridVertexCount: newCount, bottomRing: bottom, topRing: top };
}
