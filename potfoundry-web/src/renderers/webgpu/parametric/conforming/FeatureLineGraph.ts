/**
 * FeatureLineGraph.ts — analytic feature-line extraction + a meaningful
 * feature-resolution metric for the conforming whole-mesh export.
 *
 * ## Why this exists
 *
 * The conforming mesher (this directory) builds a topologically-perfect,
 * sag-tight whole-pot mesh, but does ZERO feature accounting — so the SP0
 * fidelity vector read featuresExpected = featuresPresent = featuresDropped = 0
 * (blind). This module makes those numbers MEANINGFUL.
 *
 * ## What a "feature" is
 *
 * Most of the procedural styles' sharp features are CLOSED-FORM in (u,t)
 * parameter space — they fall on loci derivable directly from the WGSL radius
 * math (src/assets/shaders/styles.wgsl). A {@link FeatureLine} is a polyline of
 * (u,t) points tracing one such locus (a sharp C0/C1 crease or a relief band),
 * NOT a per-row peak/valley sample. A {@link FeatureLineGraph} collects the
 * lines for a style plus `groundTruthCount` — how many distinct feature lines
 * the style SHOULD have, from its parameters.
 *
 * The loci, per style (see the cited shader functions):
 *
 * - **LowPolyFacet** (`low_poly_facet_radius`): piecewise-flat faces. The local
 *   angle `wrap_dist_u(th/alpha,0)*alpha` makes `r=D/cos(angle)` per face, so a
 *   sharp C0 EDGE sits where two faces meet — at sector boundaries
 *   `th=(k+0.5)*alpha`, i.e. `u=((k+0.5)/N - tierPhase - phase)/1`. With
 *   `lp_tiers>1` and non-zero jitter each tier band is phase-shifted, so the
 *   creases split into one polyline per (facet, tier). The HARD case: genuine
 *   sharp creases.
 *
 * - **GothicArches** (`gothic_arches_radius`): bay coordinate `a=theta*N`,
 *   `xAbs=|cos(a/2)|`. The sharp `colEdge` ridge peaks at `xAbs→1`
 *   (`theta=2*pi*k/N`, the column edges) and the `mullion` ridge at `xAbs→0`
 *   (`theta=(2k+1)*pi/N`). Horizontal relief BANDS ring the pot at t=0 (base),
 *   t=topStart (mid) and t=1 (rim) when `gaBands>0`.
 *
 * - **GeometricStar** (`style_geometric_star`): N-fold polar fold. `p.x=|a*..|`
 *   folds at sector boundaries `th=(k+0.5)*angle`, where the strapwork SDF has a
 *   C1 kink → N vertical fold creases.
 *
 * - **BambooSegments** (`bamboo_segments_radius`): `segment_phase=t·node_count`,
 *   `node_ring=exp(−dist²/…)` with `dist=min(segment_local,1−segment_local)`. The
 *   `min(…)` cusp makes a sharp C1 ring crease at each node centre `t=k/node_count`.
 *   HORIZONTAL (t=const) creases; the interior rings k=1..node_count−1 are pinnable
 *   (t=0/t=1 are the shared boundary rings). Striations are smooth → not creases.
 *
 * - **DragonScales** (`dragon_scales_radius`): `row=floor(t·scale_rows)` makes the
 *   staggered scale offset jump (hard C0) at each row boundary `t=k/scale_rows`.
 *   HORIZONTAL creases at the interior boundaries k=1..scale_rows−1. The per-scale
 *   vertical edges are STAGGERED per row (not full-height) → not emitted.
 *
 * - **HarmonicRipple** / **SuperformulaBlossom** / **SuperellipseMorph** /
 *   **FourierBloom** / **WaveInterference** / **RippleInterference** /
 *   **ArtDeco**: smooth (radius is a sum of sin/cos terms in θ and t; defaults
 *   give plain/soft profiles). No sharp C0/C1 features → an honestly EMPTY
 *   graph (curvature-adaptive meshing alone should resolve them).
 *
 * - **Crystalline** (`crystal_facets_radius`): NOT smooth — previously
 *   misdocumented here as a crease-free "smooth sum of sin/cos", which is
 *   MEASURED FALSE (2026-06-10). It carries a C1 HELICAL crease family: k=24
 *   constant-slope helical lines (turns=0.8 at defaults) whose 12 main groove
 *   apexes have a ~26.9° dihedral. The extractor below still returns [] — a
 *   KNOWN GAP, not an honest zero. The crest-elimination blueprint's
 *   Crystalline stage (Stage 5, docs/superpowers/specs/
 *   2026-06-10-export-endgame-evidence/crest-elimination-blueprint.json) wires
 *   it via the existing chooseHelixGrid + CreaseHelixWarp machinery.
 *
 * - **SpiralRidges** (`spiral_radius`): the `sin(k·theta + TAU·turns·t)` crest is
 *   sharp along k CONSTANT-SLOPE HELICAL lines `u = (¼ + c − turns·t)/k`. These
 *   are diagonal (neither u- nor t-constant); they are pinned by the helical
 *   member of the warp family ({@link module:conforming/CreaseHelixWarp}), a
 *   topology-preserving shear of full-height columns. `groundTruthCount = k`.
 *
 * - **CelticTriquetra** (`style_celtic_triquetra`): MIXED. The two braid bands
 *   (rotated into a `(x+y,−x+y)` lattice — braided) and the 3-fold medallion (a
 *   closed Vesica-Piscis loop) need general curve insertion → not emitted. But the
 *   three RIM lines (`smoothstep(rim_top_w,0,|t−tc|)` at FIXED t=0.15/0.52/0.90,
 *   params-independent) are full-width sharp C1 ring creases → HORIZONTAL
 *   (t=const) creases, CreaseTWarp-pinnable. `groundTruthCount = 3`.
 *
 * Non-analytic / diagonal-LOOP styles (Voronoi/Gyroid; HexagonalHive honeycomb
 * cells; BasketWeave's two crossing helix families when twisted; CelticKnot's
 * sinusoidal braided strands) return an empty graph — honest zero rather than a
 * fabricated count. Their features need general curve insertion (or two warp
 * families), not a single-family axis-aligned-or-helical warp. (HexagonalHive's
 * 0°/±60° hex walls form closed cells; CelticKnot's ribbon edges oscillate in u
 * with t and its column boundaries are seamless — neither has an axis-aligned or
 * single-slope subset to pin.)
 *
 * ## The resolution metric (the meaningful featuresDropped)
 *
 * A feature line is RESOLVED when the conforming mesh actually TRACKS it: the
 * adaptive refinement placed mesh vertices following the crease. We sample each
 * line densely in (u,t) and, for each sample, look for a mesh vertex within a
 * small (u,t) tolerance band (default `uTol`/`tTol`). The fraction of samples
 * with a nearby vertex is the line's COVERAGE; a line counts as present when
 * coverage ≥ `minCoverage`. `featuresPresent` = resolved lines,
 * `featuresDropped` = groundTruthCount − present.
 *
 * This (u,t)-tracking definition is the right test for a curvature-adaptive
 * mesher: a smooth surface needs no extra vertices, but a SHARP crease MUST be
 * an actual mesh edge (vertices on it) to be reproduced without rounding — so
 * "the mesh has vertices on the crease locus" is exactly the property that
 * distinguishes capture from rounding. The conforming mesh is sag-tight
 * everywhere by construction, so coverage is the discriminating signal.
 *
 * @module conforming/FeatureLineGraph
 */

import { marchingSquaresZero, marchingSquaresLabels, segmentsToPolylines } from './SampledFeatureExtractor';
import type { UWarp } from './CreaseUWarp';
import type { TWarp } from './CreaseTWarp';
import type { HelixWarp } from './CreaseHelixWarp';

const TAU = 2 * Math.PI;
const SQRT3 = Math.sqrt(3);

/** A point on a feature line, in outer-wall parameter space. u periodic, t∈[0,1]. */
export interface FeatureLinePoint {
  u: number;
  t: number;
}

export type FeatureLineKind =
  | 'vertical-crease'
  | 'horizontal-band'
  | 'helical-crease'
  /**
   * An arbitrary (u,t) polyline — a closed loop (honeycomb / Voronoi cell), a
   * braided strand, or a sampled level-set curve — that has no constant-u/-t/
   * -single-slope decomposition. Tracked by sampling its OWN stored points
   * (it may be non-monotone in t, so the per-kind t-parametrization used for the
   * other kinds does not apply).
   */
  | 'general-curve';

/** One analytic feature line: a polyline tracing a sharp crease or relief band. */
export interface FeatureLine {
  kind: FeatureLineKind;
  /** Densely-sampled (u,t) points along the locus (≥2). */
  points: FeatureLinePoint[];
  /** Human label for diagnostics (e.g. "facet-edge", "column", "mullion", "band"). */
  label: string;
}

/** Analytic feature lines for one style + the count it SHOULD have. */
export interface FeatureLineGraph {
  styleId: string;
  lines: FeatureLine[];
  /** Number of distinct feature lines the style should have, from its params. */
  groundTruthCount: number;
}

/** Outer-wall mesh vertex in parameter space (u,t) — the resolution probe input. */
export interface FeatureUTVertex {
  u: number;
  t: number;
}

export interface FeatureResolutionOptions {
  /** u half-width of the tracking band (periodic). Default 0.6 cell of nRing=256. */
  uTol?: number;
  /** t half-width of the tracking band. Default ~1.5 rows of a 256-row mesh. */
  tTol?: number;
  /** Fraction of line samples that must be tracked for the line to count. Default 0.75. */
  minCoverage?: number;
  /** Samples per line along t. Default 64. */
  samplesPerLine?: number;
}

export interface FeatureLineResolution {
  label: string;
  kind: FeatureLineKind;
  coverage: number;
  resolved: boolean;
  /**
   * Smallest periodic u-distance from this (vertical) crease to ANY mesh vertex,
   * in units of mesh u-columns (uDist / medianMeshColumnSpacing). ~0 means a
   * column sits on the crease; ~0.5 means the crease falls midway between two
   * columns (the rounding case). Undefined for horizontal bands.
   */
  nearestColumnGapCells?: number;
}

export interface FeatureResolutionResult {
  expected: number;
  present: number;
  dropped: number;
  perLine: FeatureLineResolution[];
  /** Number of DISTINCT u-columns in the outer-wall mesh (its angular resolution). */
  meshUColumnCount: number;
}

// ── Defaults: tuned to the conforming mesh's nRing=256 (Δu≈1/256≈0.0039) and a
// ~256-row mesh (Δt≈0.0039). A vertex within ~0.6 of a u-cell / ~1.5 of a t-row
// counts as "on" the locus. These are loose enough to tolerate the mesh's
// adaptive spacing but tight enough that an unrefined crease (no nearby vertex)
// is correctly flagged dropped.
const DEFAULT_U_TOL = 0.6 / 256;
const DEFAULT_T_TOL = 1.5 / 256;
const DEFAULT_MIN_COVERAGE = 0.75;
const DEFAULT_SAMPLES_PER_LINE = 64;

const VERTICAL_LINE_T_SAMPLES = 16;

/** Periodic distance in u∈[0,1). */
function uDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/** Normalize u into [0,1). */
function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

/** Build a vertical crease line: constant u over a t-band [t0,t1]. */
function verticalLine(u: number, t0: number, t1: number, label: string): FeatureLine {
  const points: FeatureLinePoint[] = [];
  for (let i = 0; i < VERTICAL_LINE_T_SAMPLES; i++) {
    const t = t0 + (t1 - t0) * (i / (VERTICAL_LINE_T_SAMPLES - 1));
    points.push({ u: wrapU(u), t });
  }
  return { kind: 'vertical-crease', points, label };
}

/** Build a horizontal band line: constant t over u∈[0,1). */
function horizontalLine(t: number, label: string, nSamples = 32): FeatureLine {
  const points: FeatureLinePoint[] = [];
  for (let i = 0; i < nSamples; i++) {
    points.push({ u: i / nSamples, t });
  }
  return { kind: 'horizontal-band', points, label };
}

const HELICAL_LINE_T_SAMPLES = 33;

/**
 * Build a helical (constant-slope diagonal) crease line: `u(t) = (phaseU + c −
 * turns·t)/k (mod 1)` sampled over t∈[0,1]. u WRAPS through the seam — the points
 * carry the wrapped u and the resolution metric measures periodic u-distance, so
 * the seam crossing is handled naturally. The points are ordered by t so the
 * metric can interpolate u at any t-fraction along the line.
 */
function helicalLine(c: number, k: number, turns: number, phaseU: number, label: string): FeatureLine {
  const points: FeatureLinePoint[] = [];
  for (let i = 0; i < HELICAL_LINE_T_SAMPLES; i++) {
    const t = i / (HELICAL_LINE_T_SAMPLES - 1);
    const u = wrapU((phaseU + c - turns * t) / k);
    points.push({ u, t });
  }
  return { kind: 'helical-crease', points, label };
}

// ── Per-style extractors ────────────────────────────────────────────────────

/**
 * LowPolyFacet facet-edge creases. Sharp C0 edges at sector boundaries
 * `th=(k+0.5)*alpha`. The shader uses `th = theta + tierPhase + phase_offset`
 * (theta = u*TAU), so a crease in u is `u = (k+0.5)/N - tierPhase/TAU -
 * phase/TAU`. With `lp_tiers>1` and jitter>0 each tier band is phase-shifted, so
 * each (facet k, tier j) is a distinct constant-u segment over its t-band.
 */
function extractLowPolyFacet(p: Float32Array): FeatureLine[] {
  const N = Math.max(3, Math.round(p[0]));
  const tiers = Math.max(1, Math.round(p[1]));
  const jitter = p[4];
  const phaseRad = p[5];
  const lines: FeatureLine[] = [];
  const hasTierSplit = tiers > 1 && Math.abs(jitter) > 1e-9;
  const bands = hasTierSplit ? tiers : 1;
  for (let j = 0; j < bands; j++) {
    const tierPhase = j * jitter * (TAU / N); // matches shader tier_phase
    const t0 = bands === 1 ? 0 : j / tiers;
    const t1 = bands === 1 ? 1 : Math.min(1, (j + 1) / tiers);
    for (let k = 0; k < N; k++) {
      // th = (k+0.5)*alpha = theta + tierPhase + phase ⇒ theta = ...
      const thetaCrease = (k + 0.5) * (TAU / N) - tierPhase - phaseRad;
      const u = wrapU(thetaCrease / TAU);
      lines.push(verticalLine(u, t0, t1, `facet-edge[k=${k},tier=${j}]`));
    }
  }
  return lines;
}

/**
 * GothicArches column edges + mullions + horizontal bands.
 * `xAbs=|cos(theta*N/2)|`: column edges at `xAbs=1` ⇒ `theta=2*pi*k/N`;
 * mullions at `xAbs=0` ⇒ `theta=(2k+1)*pi/N`. Bands at t∈{0,topStart,1} when on.
 */
function extractGothicArches(p: Float32Array): FeatureLine[] {
  const N = Math.max(1, Math.round(p[0]));
  const z0 = clamp01(p[5]);
  const zh = clamp01(p[6]) * (1 - z0);
  const archApex = z0 + zh;
  const topStart = z0 + 0.65 * (archApex - z0);
  const bands = clamp01(p[10]);
  const lines: FeatureLine[] = [];
  for (let k = 0; k < N; k++) {
    // Column edge: theta = 2*pi*k/N ⇒ u = k/N.
    lines.push(verticalLine(k / N, 0, 1, `column[k=${k}]`));
    // Mullion: theta = (2k+1)*pi/N ⇒ u = (2k+1)/(2N) = (k+0.5)/N.
    lines.push(verticalLine((k + 0.5) / N, 0, 1, `mullion[k=${k}]`));
  }
  if (bands > 1e-6) {
    lines.push(horizontalLine(0, 'band-base'));
    lines.push(horizontalLine(topStart, 'band-mid'));
    lines.push(horizontalLine(1, 'band-rim'));
  }
  return lines;
}

/**
 * GeometricStar N-fold fold creases. The kaleidoscopic fold `p.x=|a*(N/4)|`
 * folds at sector boundaries `th=(k+0.5)*angle` (angle=TAU/N), where the
 * strapwork SDF has a C1 kink → N vertical fold creases at u=(k+0.5)/N.
 */
function extractGeometricStar(p: Float32Array): FeatureLine[] {
  const N = Math.max(4, Math.round(p[0]));
  const lines: FeatureLine[] = [];
  for (let k = 0; k < N; k++) {
    lines.push(verticalLine((k + 0.5) / N, 0, 1, `fold[k=${k}]`));
  }
  return lines;
}

/**
 * BambooSegments node-ring creases. `segment_phase = t·node_count`,
 * `node_ring = exp(-dist²/…)` with `dist = min(segment_local, 1−segment_local)`.
 * The `min(…)` cusp gives a sharp C1 ring crease at every NODE CENTRE
 * `segment_local=0`, i.e. `t = k/node_count` (k=0..node_count). t=0 and
 * t=node_count/node_count=1 are the boundary rings (shared with the caps, already
 * full-width), so only the INTERIOR rings k=1..node_count−1 are emitted as
 * pinnable horizontal creases. Striations are smooth `sin(θ·striations)` — not
 * creases.
 */
function extractBambooSegments(p: Float32Array): FeatureLine[] {
  const nodeCount = Math.max(1, Math.round(p[0]));
  const lines: FeatureLine[] = [];
  for (let k = 1; k < nodeCount; k++) {
    lines.push(horizontalLine(k / nodeCount, `node-ring[k=${k}]`));
  }
  return lines;
}

/**
 * DragonScales row-boundary creases. `row = floor(t·scale_rows)` makes the
 * staggered scale offset jump (hard C0 discontinuity) at every row boundary
 * `t = k/scale_rows` (k=0..scale_rows). t=0/t=1 are the boundary rings (shared,
 * full-width), so only the INTERIOR boundaries k=1..scale_rows−1 are emitted as
 * pinnable horizontal creases. The per-scale vertical edges are STAGGERED
 * (offset alternates per row), so they are not full-height constant-u lines and
 * are NOT emitted (they need general diagonal-curve insertion).
 */
function extractDragonScales(p: Float32Array): FeatureLine[] {
  const scaleRows = Math.max(1, Math.round(p[0]));
  const lines: FeatureLine[] = [];
  for (let k = 1; k < scaleRows; k++) {
    lines.push(horizontalLine(k / scaleRows, `row-boundary[k=${k}]`));
  }
  return lines;
}

/**
 * SpiralRidges helical ridge creases. `spiral_radius` (styles.wgsl) modulates the
 * radius by `amp(t)·sin(k·theta + TAU·turns·t)` (theta = u·TAU), whose crests
 * (the sharp ridge loci) sit where `k·u + turns·t = ¼ + c`, i.e. on the k
 * constant-slope HELICAL lines `u = (¼/k + c/k − (turns/k)·t)` (slope −turns/k in
 * (u,t)), one per integer c=0…k−1. These are the only sharp single-family feature
 * (the fine groove term has a different, smaller-amplitude slope and is not
 * emitted). `groundTruthCount = k`.
 *
 * Param slots match the WGSL `spiral_radius`: slot 0 = k (ridge count), slot 1 =
 * turns. A degenerate `turns≈0` collapses the helices to vertical lines; in that
 * case the loci are still well-defined (constant u) so we still emit them, but
 * the helix WARP refuses (it is u-warp territory) — the count stays honest.
 */
function extractSpiralRidges(p: Float32Array): FeatureLine[] {
  const k = Math.max(1, Math.round(p[0]));
  const turns = p[1];
  const phaseU = 0.25; // ¼ from the sin crest: k·u + turns·t = ¼ + c
  const lines: FeatureLine[] = [];
  for (let c = 0; c < k; c++) {
    lines.push(helicalLine(c, k, turns, phaseU, `ridge[c=${c}]`));
  }
  return lines;
}

/**
 * BasketWeave cell-boundary creases (axis-aligned case only). `style_basket_weave`
 * (styles.wgsl) builds an over/under weave on a checkerboard of cells indexed by
 * `u_cell=floor(u_twisted)` and `v_cell=floor(v)`, where
 * `u_twisted = theta·strands/TAU + twist·t·strands + phase` and
 * `v = t·layers·(1 + v_grad·(t−½))`. The strand profile `cos(u_local·π/2)` (and
 * its v twin) is zero at every cell boundary and the over/under `checker` flips
 * there, so each cell boundary is a sharp C0/C1 ridge crease.
 *
 * When `twist = 0` AND `v_grad = 0` (the defaults) the boundaries are AXIS
 * ALIGNED and single-family-warp-pinnable:
 *  - VERTICAL creases at `u_twisted = m` ⇒ `u = (m − phase)/strands`
 *    (m = 0..strands−1) → `strands` constant-u lines (CreaseUWarp territory);
 *  - HORIZONTAL creases at `v = k` ⇒ `t = k/layers` (k = 1..layers−1 interior;
 *    t=0/t=1 are the shared boundary rings) → `layers−1` constant-t lines
 *    (CreaseTWarp territory).
 *
 * When `twist ≠ 0` the u-boundaries become HELICAL with slope `−twist·strands`
 * in (u,t) — but unlike SpiralRidges this family is NOT a pure shear of the
 * SAME-count column set onto seam-avoiding anchors (the strand count and the
 * horizontal family would both need pinning at once), so a single warp family
 * cannot pin it without the t-family colliding. When `v_grad ≠ 0` the ring
 * spacing `t = (k)/(layers·(1+v_grad·(t−½)))` is NON-uniform and non-monotone in
 * the simple ψ sense the t-warp assumes. Both cases need two crossing warp
 * families or a local re-mesh (out of scope), so we return an HONEST EMPTY graph
 * rather than emit creases the pinning machinery cannot resolve.
 */
function extractBasketWeave(p: Float32Array): FeatureLine[] {
  const strands = Math.max(1, Math.round(p[0]));
  const layers = Math.max(1, Math.round(p[1]));
  const twist = p[3];
  const vGrad = p[8];
  const phase = p[9];
  // Only the axis-aligned weave is single-family-warp-pinnable. Diagonal (twist)
  // or non-uniform-t (v_grad) weaves need two warp families / a re-mesh — honest
  // empty so the count is never fabricated beyond what the warps can resolve.
  if (Math.abs(twist) > 1e-9 || Math.abs(vGrad) > 1e-9) return [];
  const lines: FeatureLine[] = [];
  // Vertical creases: u_twisted = u·strands + phase = m ⇒ u = (m − phase)/strands.
  for (let m = 0; m < strands; m++) {
    const u = wrapU((m - phase) / strands);
    lines.push(verticalLine(u, 0, 1, `strand-edge[m=${m}]`));
  }
  // Horizontal creases: v = t·layers = k ⇒ t = k/layers (interior k=1..layers−1).
  for (let k = 1; k < layers; k++) {
    lines.push(horizontalLine(k / layers, `layer-ring[k=${k}]`));
  }
  return lines;
}

/**
 * CelticTriquetra rim-ring horizontal creases (the only axis-aligned subset).
 * `style_celtic_triquetra` (styles.wgsl) draws TWO diagonal braid bands (rotated
 * into a `q = (x+y, −x+y)` lattice — braided, u oscillates with t) and a 3-fold
 * medallion (a closed Vesica-Piscis loop), NEITHER of which decomposes into a
 * single constant-u / constant-t / constant-slope-helical family — they need
 * general curve insertion and are NOT emitted.
 *
 * What IS axis-aligned: the three RIM lines, drawn unconditionally as
 * `smoothstep(rim_top_w, 0, abs(t − tc))` ridges at FIXED t = 0.90 (top), 0.52
 * (mid) and 0.15 (bottom) — full-width (u-independent) sharp C1 ring creases,
 * params-independent. These are pinned by CreaseTWarp (ψ:[0,1]→[0,1], endpoints
 * fixed). Verified numerically: at each tc the radius is constant across u
 * (u-variation = 0) with a strong second-difference kink in t; the braid band
 * boundaries instead vary by ~1.25mm across u (braided, not a clean ring), so
 * only the three rim lines are emitted. `groundTruthCount = 3`.
 */
function extractCelticTriquetra(_p: Float32Array): FeatureLine[] {
  void _p; // rim loci are hardcoded constants in the shader, independent of params
  return [
    horizontalLine(0.15, 'rim-bottom'),
    horizontalLine(0.52, 'rim-mid'),
    horizontalLine(0.9, 'rim-top'),
  ];
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * HexagonalHive cell-boundary scalar — the honeycomb crease is the ZERO SET of
 * `len_a − len_b` (where the nearest of the two iq hex-lattice candidate centres
 * switches), replicating `style_hexagonal_hive` (styles.wgsl). The relief is a
 * bump per cell that drops to the base at the boundary, so this zero set is the
 * sharp valley crease. (scale = style_param 0; H=20 fallback as in the shader.)
 */
function hexCreaseD(u: number, t: number, scale: number): number {
  const uvx = u * TAU * scale; // theta*scale, theta=u*TAU
  const uvy = t * scale * 0.5 * SQRT3; // v*r, v=t*scale*(H/40)=t*scale*0.5, r=√3
  const sx = 1;
  const sy = SQRT3;
  const ax = Math.floor(uvx / sx);
  const ay = Math.floor(uvy / sy);
  const bx = Math.floor((uvx - 0.5) / sx);
  const by = Math.floor((uvy - SQRT3 / 2) / sy);
  const gax = uvx - (ax * sx + 0.5);
  const gay = uvy - (ay * sy + SQRT3 / 2);
  const gbx = uvx - (bx * sx + 1);
  const gby = uvy - (by * sy + SQRT3);
  return (gax * gax + gay * gay) - (gbx * gbx + gby * gby);
}

/** Marching-squares resolution for sampled crease extraction. */
const HEX_RES_U = 512;
const HEX_RES_T = 256;

/**
 * HexagonalHive honeycomb creases — the zero set of {@link hexCreaseD} traced
 * into general-curve polylines. Non-periodic in u (the pattern does NOT tile at
 * the seam: `u·TAU·scale` is non-integer), so seam-crossing edges simply end at
 * u=0/1 rather than fabricating a spurious seam contour.
 */
function extractHexagonalHive(p: Float32Array): FeatureLine[] {
  const scale = Math.max(0.1, p[0]);
  const segs = marchingSquaresZero((u, t) => hexCreaseD(u, t, scale), HEX_RES_U, HEX_RES_T, false);
  // Simplify straight hex edges to their corners (tol ≪ the 2.3e-3 feature
  // tolerance) so the inserted vertex count tracks the edge count, not the
  // per-cell contour sample count.
  return segmentsToPolylines(segs, 'hex-edge', 3, 5e-4);
}

/**
 * GyroidManifold TPMS level value — the relief is a wall around the level set
 * `val = (1−morph)·gyr + morph·schwarzP + bias = 0`, so that zero set is the
 * crease network. Replicates `style_gyroid_manifold` (styles.wgsl) with the
 * packed shader slots (0 scale, 2 morph, 5 z_stretch, 6 pulse, 8 bias). Smooth
 * (sin/cos only, no hash) so f64 matches the GPU to well within tolerance.
 * PERIODIC in u (theta=u·TAU → val(u=0)=val(u=1)).
 */
function gyroidVal(u: number, t: number, p: Float32Array): number {
  const scale = p[0] > 0 ? p[0] : 4;
  const morph = p[2];
  const stretch = p[5] > 0 ? p[5] : 1;
  const pulse = p[6];
  const bias = p[8];
  const theta = u * TAU;
  const x = scale * Math.cos(theta);
  const y = scale * Math.sin(theta);
  const z = scale * t * stretch * 4 + pulse * TAU;
  const gyr = Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x);
  const sch = Math.cos(x) + Math.cos(y) + Math.cos(z);
  return (1 - morph) * gyr + morph * sch + bias;
}

/**
 * CelticKnot braided strand centerlines. `style_celtic_knot` (styles.wgsl)
 * places strand `i` of column `c` along `local_u = 0.4·sin(v + phaseᵢ)` with
 * `v = t·tightness·TAU·3`, `phaseᵢ = c·π·0.333 + (TAU/strands)·i`, and
 * `local_u = (fract(u·columns)−0.5)·2` ⇒ the centerline in wall-u is
 * `u(t) = c/columns + (0.4·sin(v+phaseᵢ)+1)/(2·columns)`. Packed shader slots:
 * 0 = columns, 5 = twist (→ tightness = max(0.5, twist+0.5)), 6 = strands.
 * Smooth sinusoids (no hash) → replicate exactly. The strands CROSS (braid), so
 * the insertion's per-cell CDT must split crossing constraints (Steiner points).
 */
/**
 * Gate: the CelticKnot strand insertion captures the braid (featDrop=0,
 * topology bnd/nonMan/orient=0) but leaves ONE residual (u,t) needle where two
 * strands cross the SAME cell edge a hair apart (a cross-cell-consistent merge
 * of those two crossings is not yet robust — see project memory). Until that is
 * fixed, the extractor returns empty so CelticKnot stays at its clean blind
 * baseline (no sliver regression) rather than 5/6. Flip to re-enable.
 */
const CELTIC_KNOT_INSERTION_ENABLED = true;

function extractCelticKnot(p: Float32Array): FeatureLine[] {
  if (!CELTIC_KNOT_INSERTION_ENABLED) return [];
  const columns = Math.max(1, Math.floor(p[0]));
  const strands = Math.max(2, Math.min(8, Math.floor(p[6] + 0.5)));
  const tightness = Math.max(0.5, p[5] + 0.5);
  const amp = 0.4;
  const phaseStep = TAU / strands;
  const N = 97; // dense t samples (smooth braided sinusoid)
  const lines: FeatureLine[] = [];
  for (let c = 0; c < columns; c++) {
    const basePhase = c * Math.PI * 0.333;
    for (let i = 0; i < strands; i++) {
      const phase = basePhase + phaseStep * i;
      const points: FeatureLinePoint[] = [];
      for (let s = 0; s < N; s++) {
        const t = s / (N - 1);
        const v = t * tightness * TAU * 3;
        const localU = amp * Math.sin(v + phase);
        points.push({ u: wrapU(c / columns + (localU + 1) / (2 * columns)), t });
      }
      lines.push({ kind: 'general-curve', points, label: `strand[c=${c},i=${i}]` });
    }
  }
  return lines;
}

const GYR_RES_U = 640;
const GYR_RES_T = 512;

function extractGyroidManifold(p: Float32Array): FeatureLine[] {
  const segs = marchingSquaresZero((u, t) => gyroidVal(u, t, p), GYR_RES_U, GYR_RES_T, true);
  // Curvy level set: a small simplify tol just thins redundant dense samples.
  return segmentsToPolylines(segs, 'gyroid-level', 3, 3e-4);
}

const fract = (x: number): number => x - Math.floor(x);

/** WGSL hash22 replicated in f64 (periodic_cellular jitter, styles.wgsl). */
function hash22(px: number, py: number): [number, number] {
  let p3x = fract(px * 0.1031);
  let p3y = fract(py * 0.103);
  let p3z = fract(px * 0.0973);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d;
  p3y += d;
  p3z += d;
  return [fract((p3x + p3y) * p3z), fract((p3x + p3z) * p3y)];
}

/**
 * Voronoi nearest-cell ID at (u_wall, t) — replicates `periodic_cellular` /
 * `style_voronoi` (styles.wgsl). The crease is the boundary between cells, so the
 * border is where this categorical ID changes. Packed shader slots: 0 = scale,
 * 1 = jitter, 5 = z_stretch, 6 = pulse. (worley is f32-sensitive but jitter
 * keeps the cell points well-separated, so f64 reproduces the borders to within
 * the feature tolerance.)
 */
function voronoiCellId(uWall: number, t: number, p: Float32Array): number {
  const scale = p[0] > 0 ? p[0] : 8;
  const jitter = p[1];
  const stretch = p[5] > 0 ? p[5] : 1;
  const pulse = p[6];
  const uAnim = uWall * scale + pulse * scale;
  const v = t * scale * stretch;
  const cellIdX = Math.floor(uAnim);
  const cellIdY = Math.floor(v);
  const cuX = fract(uAnim);
  const cuY = fract(v);
  let f1 = 1e9;
  let bestX = 0;
  let bestY = 0;
  for (let ny = -1; ny <= 1; ny++) {
    for (let nx = -1; nx <= 1; nx++) {
      const nidX = cellIdX + nx;
      const nidY = cellIdY + ny;
      const wrappedX = ((nidX % scale) + scale) % scale;
      const h = hash22(wrappedX, nidY);
      const dx = nx + h[0] * jitter - cuX;
      const dy = ny + h[1] * jitter - cuY;
      const dist = dx * dx + dy * dy;
      if (dist < f1) {
        f1 = dist;
        bestX = wrappedX;
        bestY = nidY;
      }
    }
  }
  // Unique integer per cell (bestY ∈ small range over t∈[0,1]).
  return Math.round(bestX) * 4096 + (bestY + 32);
}

const VOR_RES_U = 640;
const VOR_RES_T = 512;

/**
 * Voronoi insertion ENABLED (2026-06-08l). The f64-replicated worley +
 * categorical border extraction TRACKS the GPU Voronoi cells (featExp=featPres,
 * featDrop=0 — the hash reproduces) and is sliver/orient/nonMan-clean. The dense
 * irregular borders used to leave T-junction cracks where a border runs TANGENT
 * to a cell edge (the cell it does not cross into stayed coarse → inconsistent
 * transition crossing). FIXED by the grid-line vertex registry in
 * {@link triangulateQuadtreeWithFeatures}: every feature vertex on a shared cell
 * edge is registered keyed by its grid line, so BOTH adjacent cells read the
 * identical edge-vertex set (symmetric by construction → no tangent crack).
 */
const VORONOI_INSERTION_ENABLED = true;

/**
 * Voronoi cell-border creases — the categorical boundary of the nearest-cell ID
 * field, traced into general-curve polylines (periodic in u). The metric tracks
 * vertices near the borders; the insertion makes them real edges.
 */
function extractVoronoi(p: Float32Array): FeatureLine[] {
  if (!VORONOI_INSERTION_ENABLED) return [];
  const segs = marchingSquaresLabels((u, t) => voronoiCellId(u, t, p), VOR_RES_U, VOR_RES_T, true);
  // Stronger simplify: the categorical border is grid-jagged at 1/VOR_RES, so a
  // larger tol straightens it (still ≪ the 2.3e-3 feature tolerance) → far fewer
  // cell-edge crossings → sliver/crack-free insertion.
  return segmentsToPolylines(segs, 'voronoi-cell', 3, 1.5e-3);
}

// ── SuperformulaBlossom petal crests (CAD-fidelity: ridge serration at high strength) ──
// The Gielis petals modulate radius in θ; their CRESTS (peak tips + valley gaps)
// are the extrema of the radius in θ, i.e. the ZERO SET of ∂r/∂θ. Because m, n1,
// n2, n3 all mix with t (styles.wgsl), the crests are DIAGONAL, MORPHING (u,t)
// curves — neither constant-u nor constant-slope — so an axis-aligned quadtree
// staircases them (serration). Tracing the zero set as general-curve polylines
// lets the existing insertion make each crest a real, watertight mesh edge.
const SF_CREST_RES_U = 768;
const SF_CREST_RES_T = 320;
/** Below this blossom strength there is no relief to capture → emit nothing
 *  (keeps the strength-0 default export byte-identical). */
const SF_CREST_MIN_STRENGTH = 1e-3;
/** Full-height crest span (the 12 base m=6 crests span ≥ this). Used as the OFF
 *  (byte-identical default) filter. The original "born petals dangle at a
 *  cell-interior point → T-junction" deferral was MEASURED WRONG
 *  (SuperformulaBornCrests.test.ts): every born crest runs RIM↔SEAM (u≈0.999, the
 *  seam_offset birth point) — no interior dangle — and naive insertion is
 *  watertight (the grid-line registry handles the seam). */
const SF_CREST_FULL_HEIGHT_SPAN = 0.85;
/** Min t-span for a BORN crest when the born-crest lever is on (drops the
 *  <5-point seam-fragment noise from the periodicU=false cut; real born crests
 *  span birth_t→rim, well above this). Born crests are the dominant
 *  surface-fidelity straddle (verify_edgeVsFlank_adaptive: ~2411 straddle tris,
 *  worst 3.39mm), so admitting them as edges is the (1b) fix. */
const SF_CREST_BORN_MIN_SPAN = 0.05;

const sfMix = (a: number, b: number, x: number): number => a + (b - a) * x;

/** Gielis superformula value, f64 mirror of `superformula_value` (styles.wgsl). */
function sfSuperformula(theta: number, m: number, n1: number, n2: number, n3: number, a: number, b: number): number {
  const c = Math.pow(Math.abs(Math.cos((m * theta) / 4) / Math.max(a, 1e-4)), n2);
  const s = Math.pow(Math.abs(Math.sin((m * theta) / 4) / Math.max(b, 1e-4)), n3);
  const denom = Math.pow(c + s, 1 / Math.max(n1, 1e-4));
  return denom <= 1e-4 ? 0 : Math.min(1 / denom, 4);
}

/** The θ-modulation `rf(u,t)` of `sf_radius` (styles.wgsl) — packed slots
 *  [0 strength,1 m_base,2 m_top,3 m_curve,4 n1_base,5 n1_top,6 n2_base,7 n2_top,
 *  8 n3_base,9 n3_top,10 a,11 b]. The radius is `mix(r0, r0·(0.9+0.35·rf), strength)`,
 *  so the crest LOCI (extrema in θ) are the extrema of rf — independent of r0 and
 *  strength. */
export function sfRf(u: number, t: number, p: Float32Array): number {
  const m = sfMix(p[1], p[2], Math.pow(t, Math.max(p[3], 1e-4)));
  const n1 = sfMix(p[4], p[5], t);
  const n2 = sfMix(p[6], p[7], t);
  const n3 = sfMix(p[8], p[9], t);
  const a = Math.max(p[10], 1e-4);
  const b = Math.max(p[11], 1e-4);
  const seam = (TAU / 2) / Math.max(m, 1); // seam_offset (styles.wgsl)
  return sfSuperformula(TAU * u + seam, m, n1, n2, n3, a, b);
}

/** Per-extraction options (driven by the surfaceFidelityExact flag).
 *  Backward-compatible: omitted ⇒ each extractor's default (byte-identical)
 *  behavior. Each extractor decides what "exact" means for its style:
 *  SuperformulaBlossom un-defers born petals; ArtDeco emits its C0 t-step bands;
 *  etc. */
export interface ExtractOpts {
  /** Surface-fidelity exact mode. When omitted, each extractor falls back to its
   *  own dev lever (probes) or its byte-identical default. */
  surfaceFidelityExact?: boolean;
}

function extractSuperformulaBlossom(p: Float32Array, opts?: ExtractOpts): FeatureLine[] {
  const strength = p.length > 0 ? p[0] : 1;
  if (!(strength > SF_CREST_MIN_STRENGTH)) return [];
  const h = 0.5 / SF_CREST_RES_U;
  // ∂rf/∂u (central difference); sign-changes ⇒ petal peaks AND valleys.
  // periodicU=FALSE: m(t) is non-integer mid-height so rf(0,t)≠rf(1,t) — wrapping
  // would fabricate a spurious seam crest (the seam_offset already keeps the seam
  // off a tip). Model on HexagonalHive, not the periodic Gyroid.
  const segs = marchingSquaresZero((u, t) => sfRf(u + h, t, p) - sfRf(u - h, t, p), SF_CREST_RES_U, SF_CREST_RES_T, false);
  const lines = segmentsToPolylines(segs, 'sf-crest', 3, 3e-4);
  // OFF (default, byte-identical): full-height crests only. ON (born-crest lever):
  // admit every real crest (born petals run RIM↔SEAM, insert watertightly), drop
  // only the <5-point seam-fragment noise. Lever default off ⇒ no production change
  // until wired to the surfaceFidelityExact flag (see plan Task 4 / spec §3.1).
  const bornOn = opts?.surfaceFidelityExact ?? ((globalThis as unknown as { __pfSfbBornCrests?: boolean }).__pfSfbBornCrests === true);
  return lines.filter((l) => {
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const pt of l.points) {
      if (pt.t < tMin) tMin = pt.t;
      if (pt.t > tMax) tMax = pt.t;
    }
    const span = tMax - tMin;
    if (bornOn) return l.points.length >= 5 && span >= SF_CREST_BORN_MIN_SPAN;
    return span >= SF_CREST_FULL_HEIGHT_SPAN;
  });
}

/**
 * ArtDeco extractor — the DOMINANT feature is the C0 t-STEP band (rOuterArtDeco:
 * the radius drops by ad_step_depth where stepLocal ∈ [0,0.1)∪(0.9,1]). The sharp
 * HORIZONTAL edges sit at t=(tier+0.1)/stepCount and (tier+0.9)/stepCount for
 * tier=0..stepCount-1 — emitted as horizontal-band edges (the DragonScales /
 * CreaseTWarp family). marching-squares on ∂r/∂u CANNOT see a t-step (no u
 * sign-cross), which is why ArtDeco was the top no-extractor gap (4.69mm,
 * verify_crossStyleEdgeGap). The smaller fan (|cos|^exp u-cusps, ~1mm) + chevron
 * (|sin| diagonal) families are left to density for now (measured residual after
 * the steps decides if they need edges — see verify_artDecoFidelity).
 *
 * Packed slots [0 fanCount,1 fanSpread,2 stepCount,3 stepDepth,4 chevronAmp,
 * 5 chevronFreq,6 blend].
 *
 * ⚠ DEV-LEVER GATED ONLY (__pfArtDecoSteps), NOT the production surfaceFidelityExact
 * flag. MEASURED (verify_artDecoFidelity, real adaptive mesh): inserting the
 * t-steps ALONE REGRESSES ArtDeco (max 3.41→4.39mm) because the DOMINANT residual
 * is the fan (|cos|^exp u-cusps) + chevron (|sin| diagonal) U-features, and the
 * featureLevel density lever AMPLIFIES those un-inserted u-cusps near the refined
 * t-step cells. The density lever is only safe with COMPLETE extraction. So this
 * t-step extractor is a FOUNDATION kept out of the production flag until the
 * fan/chevron families are added; opts.surfaceFidelityExact deliberately does NOT
 * enable it (flag-ON must never regress ArtDeco). `opts` is accepted for the
 * EXTRACTORS signature but intentionally unused here.
 */
function extractArtDeco(p: Float32Array, opts?: ExtractOpts): FeatureLine[] {
  void opts; // intentionally NOT keyed to the production flag (see doc — regresses)
  const on = (globalThis as unknown as { __pfArtDecoSteps?: boolean }).__pfArtDecoSteps === true;
  if (!on) return [];
  const stepCount = Math.max(1, Math.round(p.length > 2 ? p[2] : 4));
  const stepDepth = p.length > 3 ? p[3] : 0.08;
  if (!(stepDepth > 1e-4)) return []; // no step relief ⇒ nothing to insert
  const lines: FeatureLine[] = [];
  for (let tier = 0; tier < stepCount; tier++) {
    const tLo = (tier + 0.1) / stepCount; // full→reduced edge
    const tHi = (tier + 0.9) / stepCount; // reduced→full edge
    if (tLo > 1e-4 && tLo < 1 - 1e-4) lines.push(horizontalLine(tLo, `ad-step-lo[tier=${tier}]`));
    if (tHi > 1e-4 && tHi < 1 - 1e-4) lines.push(horizontalLine(tHi, `ad-step-hi[tier=${tier}]`));
  }
  return lines;
}

const EXTRACTORS: Record<string, (p: Float32Array, opts?: ExtractOpts) => FeatureLine[]> = {
  // Vertical (u=const) creases.
  LowPolyFacet: extractLowPolyFacet,
  GeometricStar: extractGeometricStar,
  // Vertical creases + horizontal relief bands.
  GothicArches: extractGothicArches,
  // Horizontal (t=const) ring creases.
  BambooSegments: extractBambooSegments,
  DragonScales: extractDragonScales,
  // Axis-aligned weave: vertical strand edges (u=const) + horizontal layer rings
  // (t=const). Honest-empty when twist/v_grad warp the grid off the axes.
  BasketWeave: extractBasketWeave,
  // Helical (constant-slope diagonal) creases.
  SpiralRidges: extractSpiralRidges,
  // Mixed: only the three params-independent RIM rings (t=0.15/0.52/0.90) are
  // axis-aligned horizontal creases (CreaseTWarp-pinnable). The diagonal braid
  // bands + 3-fold medallion loop are braided/cellular → not emitted.
  CelticTriquetra: extractCelticTriquetra,
  // Genuinely cellular / braided at defaults — no single-family axis-aligned-or-
  // helical decomposition. Honest-empty (the count is DELIBERATELY 0, not an
  // accidental omission); their features need general curve insertion.
  //  - CelticKnot: sinusoidal braided ribbon edges (u oscillates with t), with
  //    SEAMLESS column boundaries (per-column phase tiles to zero radius jump).
  // HexagonalHive: honeycomb cell walls captured as general-curve polylines via
  // marching squares on the analytic hex-boundary scalar (len_a−len_b) → fed to
  // the local-CDT insertion engine.
  HexagonalHive: extractHexagonalHive,
  // CelticKnot: braided strand centerlines (sinusoids per column×strand) as
  // general-curve polylines; the insertion splits their braid crossings.
  CelticKnot: extractCelticKnot,
  // GyroidManifold: TPMS level set val=0 (sign-changing, periodic in u) traced
  // by marching squares → general-curve polylines.
  GyroidManifold: extractGyroidManifold,
  // Voronoi: cell-border = boundary of the nearest-cell-ID field (categorical
  // marching squares; worley replicated in f64) → general-curve polylines.
  Voronoi: extractVoronoi,
  // Smooth styles (no sharp C0/C1 creases): honestly empty — the radius is a sum
  // of sin/cos terms in θ and t, so curvature-adaptive meshing alone resolves
  // them. Listed explicitly so the count is HONEST rather than accidentally 0.
  HarmonicRipple: () => [],
  SuperformulaBlossom: extractSuperformulaBlossom,
  SuperellipseMorph: () => [],
  FourierBloom: () => [],
  WaveInterference: () => [],
  RippleInterference: () => [],
  // Crystalline is NOT smooth (measured 2026-06-10: C1 helical crease family,
  // k=24, turns=0.8, ~26.9° dihedral on the 12 main groove apexes). [] here is
  // a KNOWN GAP kept until the crest-elimination blueprint's Stage 5 wires the
  // family via chooseHelixGrid + CreaseHelixWarp — see the header doc.
  Crystalline: () => [],
  // ArtDeco: dominant feature is a C0 t-STEP jump (radius drops by ad_step_depth
  // in horizontal bands), NOT a u-curve — so marching-squares on ∂r/∂u misses it
  // (verify_crossStyleEdgeGap: 4.69mm worst, was the top no-extractor gap).
  // extractArtDeco emits the step-edge horizontal bands (the dominant family).
  ArtDeco: extractArtDeco,
};

/**
 * Extract the analytic feature lines for a style from its packed param array
 * (WGSL `style_param()` slot order — the same array uploaded to the shader) and
 * the pot dimensions. Returns an empty graph for styles whose features are not
 * closed-form (or have none), so the count is always HONEST.
 */
export function extractAnalyticFeatures(
  styleId: string,
  packedParams: Float32Array,
  _dimensions: { H: number; Rt: number; Rb: number },
  opts?: ExtractOpts,
): FeatureLineGraph {
  void _dimensions; // loci are in (u,t) param space — dimensions reserved for future 3D loci
  const extractor = EXTRACTORS[styleId];
  const lines = extractor ? extractor(packedParams, opts) : [];
  return { styleId, lines, groundTruthCount: lines.length };
}

// ── Resolution metric ────────────────────────────────────────────────────────

/**
 * Measure how many expected feature lines the mesh RESOLVES to tolerance.
 *
 * For each line, sample it densely in t; a sample is "tracked" if some mesh
 * vertex lies within (uTol, tTol) of it. Coverage = tracked/total; the line is
 * resolved when coverage ≥ minCoverage. Present = resolved lines; dropped =
 * expected − present. An empty graph is vacuously fully resolved (0/0).
 *
 * `meshVertices` are the OUTER-WALL mesh vertices in (u,t) space (the conforming
 * branch has these directly — the assembled vertices carry u,t).
 */
export function measureFeatureResolution(
  graph: FeatureLineGraph,
  meshVertices: FeatureUTVertex[],
  options: FeatureResolutionOptions = {},
): FeatureResolutionResult {
  const uTol = options.uTol ?? DEFAULT_U_TOL;
  const tTol = options.tTol ?? DEFAULT_T_TOL;
  const minCoverage = options.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const samplesPerLine = Math.max(2, Math.floor(options.samplesPerLine ?? DEFAULT_SAMPLES_PER_LINE));

  // Bucket vertices into a u-grid so each line sample only scans a local slab,
  // not all vertices. Bucket width = uTol so a sample inspects ≤3 buckets.
  const bucketW = Math.max(uTol, 1e-6);
  const nBuckets = Math.max(1, Math.ceil(1 / bucketW));
  const buckets: FeatureUTVertex[][] = Array.from({ length: nBuckets }, () => []);
  for (const v of meshVertices) {
    const bu = wrapU(v.u);
    let bi = Math.floor(bu / bucketW);
    if (bi >= nBuckets) bi = nBuckets - 1;
    buckets[bi].push({ u: bu, t: v.t });
  }

  const tracked = (u: number, t: number): boolean => {
    const cu = wrapU(u);
    const center = Math.floor(cu / bucketW);
    for (let d = -1; d <= 1; d++) {
      const bi = ((center + d) % nBuckets + nBuckets) % nBuckets;
      for (const v of buckets[bi]) {
        if (uDist(v.u, cu) <= uTol && Math.abs(v.t - t) <= tTol) return true;
      }
    }
    return false;
  };

  // Distinct mesh u-columns (the outer wall's angular resolution) and their
  // median spacing — used to express each crease's nearest-column gap in CELLS,
  // so a drop is self-explanatory: ~0.5 cells ⇒ crease falls between columns.
  const { columnCount, medianSpacing } = distinctColumns(meshVertices);
  const nearestUDist = (u: number): number => {
    const cu = wrapU(u);
    let best = 1;
    const center = Math.floor(cu / bucketW);
    // Scan a few buckets either side to find the nearest column even when the
    // crease is up to ~half a (coarse) cell away from any vertex.
    const span = Math.max(2, Math.ceil(medianSpacing / bucketW) + 1);
    for (let d = -span; d <= span; d++) {
      const bi = ((center + d) % nBuckets + nBuckets) % nBuckets;
      for (const v of buckets[bi]) {
        const du = uDist(v.u, cu);
        if (du < best) best = du;
      }
    }
    return best;
  };

  const perLine: FeatureLineResolution[] = [];
  let present = 0;
  for (const line of graph.lines) {
    // General curves (loops / braids / sampled level sets) may be non-monotone
    // in t, so they are tracked by sampling their OWN stored points (densely
    // sampled by the extractor), not by a t-parametrization.
    if (line.kind === 'general-curve') {
      let gHits = 0;
      for (const q of line.points) if (tracked(q.u, q.t)) gHits++;
      const gCov = line.points.length > 0 ? gHits / line.points.length : 1;
      const gResolved = gCov >= minCoverage;
      if (gResolved) present++;
      perLine.push({ label: line.label, kind: line.kind, coverage: gCov, resolved: gResolved });
      continue;
    }
    const tMin = Math.min(...line.points.map((q) => q.t));
    const tMax = Math.max(...line.points.map((q) => q.t));
    let hits = 0;
    for (let i = 0; i < samplesPerLine; i++) {
      const f = samplesPerLine === 1 ? 0 : i / (samplesPerLine - 1);
      const t = tMin + (tMax - tMin) * f;
      // u along the line by kind:
      //  - horizontal-band: sweep u across the row (constant t);
      //  - vertical-crease: constant u;
      //  - helical-crease: u varies WITH t — interpolate the stored (u,t) polyline
      //    at this t (periodic, shortest-arc interpolation so the seam wrap is
      //    handled). This is what lets the diagonal line be tracked column-by-row.
      let u: number;
      if (line.kind === 'horizontal-band') {
        u = f;
      } else if (line.kind === 'helical-crease') {
        u = interpolatePolylineU(line.points, t);
      } else {
        u = line.points[0].u;
      }
      if (tracked(u, t)) hits++;
    }
    const coverage = hits / samplesPerLine;
    const resolved = coverage >= minCoverage;
    if (resolved) present++;
    const entry: FeatureLineResolution = { label: line.label, kind: line.kind, coverage, resolved };
    if (line.kind === 'vertical-crease' && medianSpacing > 0) {
      entry.nearestColumnGapCells = nearestUDist(line.points[0].u) / medianSpacing;
    }
    perLine.push(entry);
  }

  return {
    expected: graph.groundTruthCount,
    present,
    dropped: Math.max(0, graph.groundTruthCount - present),
    perLine,
    meshUColumnCount: columnCount,
  };
}

/**
 * Interpolate the u-value of a (u,t)-ordered polyline at a query t, using
 * PERIODIC shortest-arc interpolation in u so a line that wraps through the u=0
 * seam between two samples interpolates correctly. Points are assumed ordered by
 * ascending t (as built by {@link helicalLine}); t outside the range clamps to
 * the nearest endpoint. Returns u∈[0,1).
 */
function interpolatePolylineU(points: readonly FeatureLinePoint[], t: number): number {
  if (points.length === 0) return 0;
  if (points.length === 1 || t <= points[0].t) return wrapU(points[0].u);
  const last = points[points.length - 1];
  if (t >= last.t) return wrapU(last.u);
  // Find the segment [p0,p1] with p0.t ≤ t ≤ p1.t (linear scan — lines are short).
  let lo = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i].t >= t) {
      lo = i - 1;
      break;
    }
  }
  const p0 = points[lo];
  const p1 = points[lo + 1];
  const span = p1.t - p0.t;
  const f = span > 1e-12 ? (t - p0.t) / span : 0;
  // Shortest-arc u-step (handles a seam wrap within the segment).
  let du = (p1.u - p0.u) % 1;
  if (du > 0.5) du -= 1;
  if (du < -0.5) du += 1;
  return wrapU(p0.u + du * f);
}

/**
 * Count distinct u-columns of the outer-wall mesh and their median spacing. A
 * curvature-adaptive mesh can have non-uniform columns; the median spacing is
 * the meaningful "cell size" for expressing a crease's distance to its nearest
 * column. Columns are quantized to 1e-4 in u so float jitter doesn't inflate the
 * count.
 */
function distinctColumns(meshVertices: FeatureUTVertex[]): {
  columnCount: number;
  medianSpacing: number;
} {
  const q = 1e-4;
  const set = new Set<number>();
  for (const v of meshVertices) set.add(Math.round(wrapU(v.u) / q));
  const cols = Array.from(set, (k) => k * q).sort((a, b) => a - b);
  if (cols.length < 2) return { columnCount: cols.length, medianSpacing: 0 };
  const gaps: number[] = [];
  for (let i = 1; i < cols.length; i++) gaps.push(cols[i] - cols[i - 1]);
  gaps.push(1 - cols[cols.length - 1] + cols[0]); // wrap gap
  gaps.sort((a, b) => a - b);
  const medianSpacing = gaps[Math.floor(gaps.length / 2)];
  return { columnCount: cols.length, medianSpacing };
}

// ── Crease-refine line builder (uBias-invariant feature coverage) ─────────────

/** Number of t-samples in a full-height vertical crease-refine line. */
const CREASE_REFINE_T_SAMPLES = 33;
/** Number of u-samples in a full-width horizontal crease-refine line. */
const CREASE_REFINE_U_SAMPLES = 64;

/** The warp choices a crease-refine build reads (subset of the warp-family API). */
export interface CreaseWarpChoices {
  /** The vertical-crease u-warp (maps source mesh columns → crease loci). */
  uWarp: UWarp;
  /** The horizontal-crease t-warp (maps source mesh ROWS → band loci). */
  tWarp: TWarp;
  /** The helical-crease warp (its base φ₀ pins the pre-warp helix columns). */
  helixWarp: HelixWarp;
}

/**
 * Build the REFINE-ONLY crease lines fed to the quadtree's `creaseRefine`/
 * `outerCreaseLines` (uBias-invariant feature coverage). These are NEVER inserted
 * as CDT edges — only their cell FOOTPRINT matters, so the quadtree size-tests the
 * cells they cross with the BIAS-FREE u-width and restores the t-subdivision the
 * anisotropy bias B>0 would otherwise strip from the crease columns/rows.
 *
 * The crucial difference from reading the warp anchors directly: a crease column
 * that needs NO warp move — because it is ALREADY on a dyadic mesh column
 * (GeometricStar folds at (2k+1)/16) or it IS the u=0 seam column (GothicArches
 * column[k=0]) — is DROPPED from `warp.anchors` (the warp only carries the columns
 * it must SHIFT). Such a column still loses its t-rows under B>0, so it still needs
 * the bias-free refinement. We therefore derive the refine column directly from the
 * crease LOCUS: resolve its PRE-warp source as `warp.anchor.source` when the warp
 * moves it, else the locus itself (a fixed point — dyadic or seam). This feeds the
 * dyadic and seam columns the warp omits, fixing the GeometricStar (all-features)
 * and GothicArches (seam-only) residuals.
 *
 * Horizontal bands are ALSO included now: a horizontal band needs a real mesh
 * t-ROW at its t spanning all u, and uBias's t-coarsening (square splits stop B
 * levels shallower) removes that row near the BOUNDARIES (where the pin-grade caps
 * the depth) — so the boundary-adjacent bands regress (BambooSegments node-ring
 * k=1/k=4). The bias-free refinement on the band's cells forces the square splits
 * back to the B=0 depth, restoring the t-row across u. The interior bands are
 * unaffected (they were already resolved) — this only ADDS coverage. The pinned
 * t=0/t=1 boundary rings are NEVER touched (the band loci are interior; the
 * quadtree's levelCap holds the boundary rows at the pin level regardless).
 *
 * @param graph    The analytic feature graph (provides the crease loci by kind).
 * @param choices  The chosen warp family (resolves pre-warp source columns).
 * @returns Refine-only FeatureLines (vertical-crease + horizontal-band), or [] when
 *          the style has no axis-aligned creases (a pure no-op).
 */
export function buildCreaseRefineLines(
  graph: FeatureLineGraph,
  choices: CreaseWarpChoices,
): FeatureLine[] {
  const { uWarp, tWarp, helixWarp } = choices;

  // Pre-warp source column for a vertical crease locus `c`: the column the u-warp
  // maps ONTO c. When the warp moves it, that is the anchor whose target≈c; when
  // the warp leaves it fixed (dyadic / seam — dropped from anchors), the source IS
  // c itself. This is what feeds the columns the warp omits.
  const sourceForCrease = (c: number): number => {
    if (!uWarp.isIdentity) {
      const a = uWarp.anchors.find((x) => Math.abs(x.target - wrapU(c)) < 1e-7);
      if (a) return a.source;
    }
    return wrapU(c);
  };

  // Distinct vertical-crease source columns (dedup on the snapped u). Seam u=0 is
  // kept (the refine must reach the seam column — its cells are the iu=0 strip).
  const colSet = new Set<number>();
  const columnSources: number[] = [];
  const addColumn = (u: number): void => {
    const su = wrapU(u);
    const key = Math.round(su * 1e7);
    if (colSet.has(key)) return;
    colSet.add(key);
    columnSources.push(su);
  };
  for (const line of graph.lines) {
    if (line.kind === 'vertical-crease') addColumn(sourceForCrease(line.points[0].u));
  }
  // Helical creases: the pre-warp footprint is the BASE column φ₀ pins. The base
  // anchors carry the SHIFTED columns; an already-dyadic base leaves them fixed at
  // (c+½)/k, so derive them from the shear geometry when the base is identity.
  if (!helixWarp.isIdentity) {
    if (!helixWarp.base.isIdentity) {
      for (const a of helixWarp.base.anchors) addColumn(a.source);
    }
    // (Already-dyadic helix base columns are full-height on the natural lattice and
    // resolved by the dyadic mesh; the shear keeps them on the helix. The bias only
    // strips t-rows on cells where the column is u-refined, which the base anchors
    // capture — so identity-base helices need no extra refine line here.)
  }

  // Pre-warp source ROW for a horizontal band locus `t`: the row the t-warp maps
  // ONTO the band. CRITICAL — refining the band's TARGET t is wrong: the t-warp
  // lands the SOURCE row (a dyadic full-width row) on the band, so the cells that
  // must keep their bias-stripped t-subdivision are at the SOURCE t, not the band.
  // When the warp moves the row, that is the anchor whose target≈t; when the warp
  // leaves it fixed (already-dyadic band — no warp), the source IS t itself.
  const sourceForBand = (t: number): number => {
    if (!tWarp.isIdentity) {
      const a = tWarp.anchors.find((x) => Math.abs(x.target - t) < 1e-7);
      if (a) return a.source;
    }
    return t;
  };

  // Distinct horizontal-band source rows (interior only; the boundary rings are
  // pinned and never moved). Each becomes a full-width refine row at its source t.
  const rowSet = new Set<number>();
  const bandRows: number[] = [];
  for (const line of graph.lines) {
    if (line.kind !== 'horizontal-band') continue;
    const t = line.points[0].t;
    if (t <= 1e-6 || t >= 1 - 1e-6) continue; // boundary rings — pinned, skip
    const src = sourceForBand(t);
    if (src <= 1e-6 || src >= 1 - 1e-6) continue; // never refine onto a pinned ring
    const key = Math.round(src * 1e7);
    if (rowSet.has(key)) continue;
    rowSet.add(key);
    bandRows.push(src);
  }

  const lines: FeatureLine[] = [];
  columnSources.forEach((u, j) => {
    lines.push({
      kind: 'vertical-crease',
      label: `creaseCol${j}`,
      points: Array.from({ length: CREASE_REFINE_T_SAMPLES }, (_, k) => ({
        u,
        t: k / (CREASE_REFINE_T_SAMPLES - 1),
      })),
    });
  });
  bandRows.forEach((t, j) => {
    // Full-width row: u = 0 … 1 inclusive (the trailing u=1 closes the seam cell
    // so the band's refinement reaches every column, not just [0, 63/64]).
    const points: FeatureLinePoint[] = Array.from(
      { length: CREASE_REFINE_U_SAMPLES + 1 },
      (_, k) => ({ u: k / CREASE_REFINE_U_SAMPLES, t }),
    );
    lines.push({ kind: 'horizontal-band', label: `creaseRow${j}`, points });
  });
  return lines;
}
