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
 *   **Crystalline** / **ArtDeco**: smooth (radius is a sum of sin/cos terms in θ
 *   and t; defaults give plain/soft profiles). No sharp C0/C1 features → an
 *   honestly EMPTY graph (curvature-adaptive meshing alone should resolve them).
 *
 * Non-analytic / diagonal-loop styles (Voronoi/Gyroid; HexagonalHive cells,
 * BasketWeave diagonals, Celtic knots, SpiralRidges helices) return an empty
 * graph — honest zero rather than a fabricated count. Their features need
 * general curve insertion, not an axis-aligned warp.
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

const TAU = 2 * Math.PI;

/** A point on a feature line, in outer-wall parameter space. u periodic, t∈[0,1]. */
export interface FeatureLinePoint {
  u: number;
  t: number;
}

export type FeatureLineKind = 'vertical-crease' | 'horizontal-band';

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

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

const EXTRACTORS: Record<string, (p: Float32Array) => FeatureLine[]> = {
  // Vertical (u=const) creases.
  LowPolyFacet: extractLowPolyFacet,
  GeometricStar: extractGeometricStar,
  // Vertical creases + horizontal relief bands.
  GothicArches: extractGothicArches,
  // Horizontal (t=const) ring creases.
  BambooSegments: extractBambooSegments,
  DragonScales: extractDragonScales,
  // Smooth styles (no sharp C0/C1 creases): honestly empty — the radius is a sum
  // of sin/cos terms in θ and t, so curvature-adaptive meshing alone resolves
  // them. Listed explicitly so the count is HONEST rather than accidentally 0.
  HarmonicRipple: () => [],
  SuperformulaBlossom: () => [],
  SuperellipseMorph: () => [],
  FourierBloom: () => [],
  WaveInterference: () => [],
  RippleInterference: () => [],
  Crystalline: () => [],
  ArtDeco: () => [],
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
): FeatureLineGraph {
  void _dimensions; // loci are in (u,t) param space — dimensions reserved for future 3D loci
  const extractor = EXTRACTORS[styleId];
  const lines = extractor ? extractor(packedParams) : [];
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
    const tMin = Math.min(...line.points.map((q) => q.t));
    const tMax = Math.max(...line.points.map((q) => q.t));
    let hits = 0;
    for (let i = 0; i < samplesPerLine; i++) {
      const f = samplesPerLine === 1 ? 0 : i / (samplesPerLine - 1);
      const t = tMin + (tMax - tMin) * f;
      // u along the line: vertical = constant; horizontal = sweep u.
      const u = line.kind === 'horizontal-band' ? f : line.points[0].u;
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
