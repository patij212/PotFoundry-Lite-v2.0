/**
 * WatertightAssembly.ts — Whole-pot watertight-by-construction assembly.
 *
 * Builds the outer and inner walls (conforming, pinned to a shared uniform
 * `nRing`), then joins them with cap surfaces (rim, bottom-under, bottom-top,
 * drain) that REFERENCE the walls' shared ring vertex indices rather than
 * duplicating them. Because every boundary ring is a single set of indices
 * shared by both neighbouring surfaces, the result is watertight by
 * construction — no weld, no repair battery.
 *
 * Output: a combined `{ vertices:(u,t,surfaceId), indices, surfaceRanges }`.
 * The pipeline (T5) GPU-evaluates every packed (u,t,surfaceId) vertex to 3D;
 * each shared ring vertex carries its OWNING surface's triple, and the GPU's
 * evaluate_vertices is constructed so neighbouring surfaces' ring positions
 * coincide exactly (same r, z, twist), so index-sharing yields a closed solid.
 *
 * Geometry per surfaceId (see adaptive_mesh.wgsl evaluate_vertices):
 *  - 0 outer wall: z=t·H
 *  - 1 inner wall: z=tBottom+t·(H−tBottom)
 *  - 2 rim @z=H:           inner-top (t=0) ↔ outer-top (t=1)
 *  - 3 bottom-under @z=0:  outer-bottom (t=0) ↔ drain ring (t=1)
 *  - 4 bottom-top @z=tBottom: inner-bottom (t=0) ↔ drain ring (t=1)
 *  - 5 drain: bottom-under drain ring (t=0, z=0) ↔ bottom-top drain ring (t=1, z=tBottom)
 *
 * If rDrain<=0 there is no drain surface; the two base discs fan to a single
 * centre vertex on the axis.
 *
 * @module conforming/WatertightAssembly
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { buildConformingWall, type ConformingWallResult } from './ConformingWall';
import { annulusStrip, discFan } from './RingStrip';
import type { FeatureLine } from './FeatureLineGraph';
import { firstFundamentalForm, metricStepsForSampler } from './SurfaceMetricTensor';

/** Reference metric anisotropy at which uBias=0 — tuned to the default pot. */
const UBIAS_AREF = 3;
/** Cap on the anisotropy bias (bounds triangle inflation + ring growth). */
const UBIAS_BMAX = 4;

function median(xs: number[]): number {
  if (xs.length === 0) return 1;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] || 1;
}

/**
 * Anisotropy bias B (≥0) for a wall sampler — a GATED, relief-aware estimate.
 *
 * Two metrics over a coarse (u,t) grid:
 *  - `baseA` = median of the SHAPE anisotropy `2π·r / √G` (circumference rate over
 *    height rate, EXCLUDING the ripple slope `r'` — i.e. the pot's wide/flat-vs-
 *    tall geometry, independent of a style's surface relief).
 *  - `fullA` = median of the true cell anisotropy `√E / √G` (INCLUDING relief).
 *
 * The bias is GATED on `baseA`: a pot whose SHAPE is not wide/flat (baseA within
 * the default band, ≤ AREF·√2) gets **B=0 regardless of relief** — a true no-op
 * that preserves the validated default-dim (20/20) meshes for every style, rippled
 * or not. Only a genuinely wide/flat pot (baseA above the band) is biased, and
 * then by `fullA` so that high-relief styles (whose cells are √E/√G:1 slivers, not
 * just 2π·r/√G:1) are corrected too. A square (u,t) cell maps to a √E/√G:1 3D
 * sliver (GAP 1, level-independent); the bias makes a level-L leaf span
 * Δu=1/2^(L+B) so cells are 3D-near-square. (Cells whose LOCAL √E/√G/2^B still
 * exceeds the sliver bound — extreme isolated relief — need local directional
 * refinement, beyond this global bias.)
 */
function computeUBias(sampler: SurfaceSampler): number {
  const steps = metricStepsForSampler(sampler);
  const baseRatios: number[] = [];
  const fullRatios: number[] = [];
  const N = 12;
  for (let j = 1; j < N; j++) {
    const t = j / N;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const p = sampler.position(u, t);
      const { E, G } = firstFundamentalForm(sampler, u, t, steps.hu, steps.ht);
      const sG = Math.sqrt(Math.max(G, 1e-12));
      baseRatios.push((2 * Math.PI * Math.hypot(p[0], p[1])) / sG); // 2π·r / √G (no relief)
      fullRatios.push(Math.sqrt(Math.max(E, 1e-12)) / sG); // √E / √G (with relief)
    }
  }
  // GATE: not a wide/flat pot (shape anisotropy in the default band) ⇒ no bias.
  if (median(baseRatios) <= UBIAS_AREF * Math.SQRT2) return 0;
  // Wide/flat pot ⇒ relief-aware bias (corrects √E/√G:1 cells, not just 2π·r/√G:1).
  return Math.max(0, Math.min(UBIAS_BMAX, Math.round(Math.log2(median(fullRatios) / UBIAS_AREF))));
}

/** Pot dimensions needed to place the cap/drain surfaces. */
export interface AssemblyDimensions {
  /** Overall height (mm). */
  H: number;
  /** Base thickness — z of the inner-wall bottom / bottom-top disc (mm). */
  tBottom: number;
  /** Drain radius (mm). <=0 ⇒ solid base (discs fan to a centre vertex). */
  rDrain: number;
}

/** Wall tuning shared by both walls (mirrors ConformingWallOptions sans surfaceId). */
export interface AssemblyWallOptions {
  maxSagMm: number;
  maxEdgeMm: number;
  minEdgeMm: number;
  gradeRatio: number;
  maxLevel: number;
  resU: number;
  resT: number;
  /**
   * Uniform ring count — power of two; both walls pin to this in t. With an
   * anisotropy bias B>0 the actual shared ring carries nRing·2^B vertices.
   */
  nRing: number;
  /**
   * Optional explicit anisotropy bias B (≥0) for BOTH walls (GAP 1). When
   * omitted it is auto-computed from the OUTER metric (median √E/√G), deferred to
   * 0 when the outer wall carries feature lines. Δu=1/2^(level+B), Δt=1/2^level —
   * cells stay 3D-near-square on wide/flat pots. B=0 (default at default dims) is
   * a perfect no-op.
   */
  uBias?: number;
  /**
   * Optional whole-pot triangle budget. Split evenly across the two walls (the
   * caps add only a small fixed amount), then each wall's sizing field is scaled
   * to approach its share — bounded so neither wall coarsens below the
   * sag-required mesh. Omit for the pure sag-driven mesh.
   */
  targetTriangles?: number;
  /**
   * Budget interpretation (see ConformingWallOptions.budgetMode). Defaults to
   * `'target'`; production passes `'cap'` so smooth walls keep their small
   * sag-tight count instead of being inflated up to the budget.
   */
  budgetMode?: 'target' | 'cap';
  /**
   * Optional uniform base-refinement level for BOTH walls (see
   * ConformingWallOptions.minUniformLevel). Guarantees full-height columns at
   * u=i/2^L so sharp vertical creases can be pinned to real mesh edges. Omit for
   * the pure adaptive mesh.
   */
  minUniformLevel?: number;
  /**
   * Optional feature curves (loops / diagonals / braids) inserted into the
   * OUTER wall only (surfaceId 0) as real mesh edges via local constrained
   * Delaunay. The inner wall is smooth (constant offset), so it gets none. See
   * {@link ConformingWallOptions.featureLines}. Clipped to keep the shared
   * boundary rings intact. Omit for the plain mesh.
   */
  outerFeatureLines?: FeatureLine[];
  /** t-margin for feature clipping (see ConformingWallOptions.featureTMargin). */
  featureTMargin?: number;
  /** Feature-cell refinement level (see ConformingWallOptions.featureLevel). */
  featureLevel?: number;
}

/** Index range and vertex count for one surface in the combined mesh. */
export interface SurfaceRange {
  surfaceId: number;
  /** First index (into `indices`) belonging to this surface. */
  indexStart: number;
  /** One past the last index. */
  indexEnd: number;
  /** Vertices uniquely OWNED by this surface (walls: grid verts; caps: 0 or new ring/centre verts). */
  vertexCount: number;
}

/** Combined watertight mesh in (u,t,surfaceId) parameter space. */
export interface WatertightAssemblyResult {
  /** Packed (u, t, surfaceId) per vertex — GPU-evaluated to 3D downstream. */
  vertices: Float32Array;
  /** Triangle indices into `vertices` (consistently oriented). */
  indices: Uint32Array;
  /** Per-surface index ranges + owned-vertex counts. */
  surfaceRanges: SurfaceRange[];
}

/** Append a wall's packed vertices to `verts`, returning the index offset. */
function appendWall(verts: number[], wall: ConformingWallResult): number {
  const offset = verts.length / 3;
  for (let i = 0; i < wall.vertices.length; i++) verts.push(wall.vertices[i]);
  return offset;
}

/**
 * Number of radial bands for a cap whose radius runs `rOuter`→`rInner` over a
 * ring of `nRing` U-samples. Picks bands so each is roughly square (radial step
 * ≈ tangential segment width at the mid radius), clamped to [1, 64]. A single
 * outer↔inner band on a wide base would be a long thin needle (high aspect); a
 * few intermediate concentric rings keep every band well-shaped — watertight by
 * construction (the intermediate rings are shared between adjacent bands).
 */
function radialBandCount(rOuter: number, rInner: number, nRing: number): number {
  const span = Math.abs(rOuter - rInner);
  const rMid = 0.5 * (Math.abs(rOuter) + Math.abs(rInner));
  const tangential = (2 * Math.PI * Math.max(rMid, 1e-6)) / nRing;
  if (tangential <= 1e-9) return 1;
  return Math.max(1, Math.min(64, Math.round(span / tangential)));
}

/**
 * Emit a radially-subdivided annular/disc cap referencing a shared outer ring.
 *
 * The cap surface parameterizes t: t=0 is the (shared) `outerRing`, t=1 is the
 * inner terminus — either a shared `innerRing` (e.g. a drain ring) or a single
 * `centreIdx` on the axis (solid base). `nRadial` bands are built; intermediate
 * rings (t=k/nRadial, k=1..nRadial-1) are NEW vertices owned by this surface and
 * SHARED between consecutive bands, so the cap stays watertight. Returns the
 * number of NEW vertices appended (for surfaceRange bookkeeping).
 */
function emitRadialCap(
  verts: number[],
  indices: number[],
  outerRing: number[],
  inner: { ring: number[] } | { centreIdx: number },
  surfaceId: number,
  nRing: number,
  nRadial: number,
  invert: boolean,
): number {
  const newVertStart = verts.length / 3;
  // Build the intermediate rings (t = k/nRadial for k=1..nRadial-1).
  const rings: number[][] = [outerRing];
  for (let k = 1; k < nRadial; k++) {
    const t = k / nRadial;
    const ring: number[] = [];
    for (let i = 0; i < nRing; i++) {
      ring.push(verts.length / 3);
      verts.push(i / nRing, t, surfaceId);
    }
    rings.push(ring);
  }

  const hasInnerRing = 'ring' in inner;
  if (hasInnerRing) rings.push(inner.ring);

  // Bands between consecutive rings.
  for (let b = 0; b < rings.length - 1; b++) {
    const tri = annulusStrip(rings[b], rings[b + 1], invert);
    for (const v of tri) indices.push(v);
  }
  // Final band to the centre (solid base), if any.
  if (!hasInnerRing) {
    const tri = discFan(rings[rings.length - 1], inner.centreIdx, invert);
    for (const v of tri) indices.push(v);
  }
  return verts.length / 3 - newVertStart;
}

/**
 * Assemble the whole pot watertight from an outer and inner wall sampler.
 *
 * @param outerSampler Returns outer-wall 3D positions for (u,t) (surfaceId 0).
 * @param innerSampler Returns inner-wall 3D positions for (u,t) (surfaceId 1).
 * @param dims Pot dimensions (H, tBottom, rDrain).
 * @param opts Wall tuning incl. the shared uniform `nRing`.
 */
export function assembleWatertight(
  outerSampler: SurfaceSampler,
  innerSampler: SurfaceSampler,
  dims: AssemblyDimensions,
  opts: AssemblyWallOptions,
): WatertightAssemblyResult {
  const nRing = opts.nRing;

  // --- 0. Anisotropy bias (GAP 1): make cells 3D-near-square on wide/flat pots.
  // Both walls MUST share the same bias so their boundary rings (= nRing verts
  // after the pin adjustment) match by index. Computed once from the OUTER metric.
  // The feature-insertion triangulator IS uBias-aware (STEP 3a, unit-validated for
  // loops), BUT un-deferring inserted styles e2e left a residual bnd=6 T-junction
  // crack on CelticKnot's BRAIDS at short-wide (crossing/Steiner asymmetry under
  // anisotropy — 3/4 inserted styles were clean bnd=0, only braids crack). So
  // inserted styles stay DEFERRED (B=0) until that braid-anisotropy case is fixed;
  // at default dims B=0 anyway, so this only holds the (already-failing) extreme-dim
  // inserted case at its prior baseline, never regresses a working one. `opts.uBias`
  // overrides (used by the uBias unit tests).
  const hasFeatures = (opts.outerFeatureLines?.length ?? 0) > 0;
  const uBias = opts.uBias ?? (hasFeatures ? 0 : computeUBias(outerSampler));

  // --- 1. Build the two conforming walls (uniform shared rings) -------------
  // Split the whole-pot budget across the two walls (caps add only a small fixed
  // amount). Each wall's own sag floor still bounds its share from below.
  const perWallBudget =
    opts.targetTriangles !== undefined && opts.targetTriangles > 0
      ? Math.max(1, Math.floor(opts.targetTriangles / 2))
      : undefined;
  const wallOpts = {
    maxSagMm: opts.maxSagMm,
    maxEdgeMm: opts.maxEdgeMm,
    minEdgeMm: opts.minEdgeMm,
    gradeRatio: opts.gradeRatio,
    maxLevel: opts.maxLevel,
    resU: opts.resU,
    resT: opts.resT,
    nRing,
    targetTriangles: perWallBudget,
    budgetMode: opts.budgetMode,
    minUniformLevel: opts.minUniformLevel,
    uBias,
  };
  // Features go on the OUTER wall only (the inner wall is a smooth offset).
  const outer = buildConformingWall(outerSampler, {
    ...wallOpts,
    surfaceId: 0,
    featureLines: opts.outerFeatureLines,
    featureTMargin: opts.featureTMargin,
    featureLevel: opts.featureLevel,
  });
  const inner = buildConformingWall(innerSampler, { ...wallOpts, surfaceId: 1 });

  // The shared ring vertex count grows with the bias: 2^(log2(nRing)+B). Both
  // walls pin the SAME (pinBoundaryLevel + uBias), so their rings match; the caps
  // reference this actual count (not the input nRing) so index-sharing holds.
  const nRingActual = outer.bottomRing.length;
  if (inner.bottomRing.length !== nRingActual) {
    throw new Error(
      `assembleWatertight: wall ring mismatch (outer ${nRingActual}, inner ${inner.bottomRing.length})`,
    );
  }

  const verts: number[] = [];
  const indices: number[] = [];
  const ranges: SurfaceRange[] = [];

  // --- 2. Concatenate wall vertices; remap each wall's local indices --------
  const outerOffset = appendWall(verts, outer); // 0
  const outerCount = outer.vertices.length / 3;
  const innerOffset = appendWall(verts, inner);
  const innerCount = inner.vertices.length / 3;

  const remap = (offset: number, ring: number[]): number[] =>
    ring.map((i) => i + offset);

  // Shared boundary rings (global indices), each ordered by ascending U.
  const outerTop = remap(outerOffset, outer.topRing); // z=H, r=outer
  const outerBottom = remap(outerOffset, outer.bottomRing); // z=0, r=outer
  const innerTop = remap(innerOffset, inner.topRing); // z=H, r=inner
  const innerBottom = remap(innerOffset, inner.bottomRing); // z=tBottom, r=inner

  // Wall triangle blocks (remapped) recorded as their own surface ranges.
  const pushWallTris = (
    surfaceId: number,
    offset: number,
    vertexCount: number,
    wall: ConformingWallResult,
  ): void => {
    const indexStart = indices.length;
    for (let i = 0; i < wall.indices.length; i++) indices.push(wall.indices[i] + offset);
    ranges.push({ surfaceId, indexStart, indexEnd: indices.length, vertexCount });
  };
  pushWallTris(0, outerOffset, outerCount, outer);
  pushWallTris(1, innerOffset, innerCount, inner);

  // --- 3. Rim (surfaceId 2): annulus inner-top ↔ outer-top, no new verts ----
  {
    const indexStart = indices.length;
    const tri = annulusStrip(innerTop, outerTop, false);
    for (const v of tri) indices.push(v);
    ranges.push({ surfaceId: 2, indexStart, indexEnd: indices.length, vertexCount: 0 });
  }

  const hasDrain = dims.rDrain > 0;

  // Representative ring radii for radial band sizing (twist-free magnitudes).
  const rOuterBot = radial(outerSampler.position(0, 0)); // outer-wall bottom
  const rInnerBot = radial(innerSampler.position(0, 0)); // inner-wall bottom

  if (hasDrain) {
    // --- 4. Drain rings (surfaceId 5): NEW vertices, ordered by U ----------
    const drainBottomRing: number[] = []; // z=0   (drain t=0)
    const drainTopRing: number[] = []; // z=tBottom (drain t=1)
    const drainVertStart = verts.length / 3;
    for (let i = 0; i < nRingActual; i++) {
      drainBottomRing.push(verts.length / 3);
      verts.push(i / nRingActual, 0, 5);
    }
    for (let i = 0; i < nRingActual; i++) {
      drainTopRing.push(verts.length / 3);
      verts.push(i / nRingActual, 1, 5);
    }
    const drainVertCount = verts.length / 3 - drainVertStart;

    // bottom-under (3): outer-bottom (t=0) ↔ drain bottom ring (t=1), radial bands.
    {
      const indexStart = indices.length;
      const nRad = radialBandCount(rOuterBot, dims.rDrain, nRingActual);
      const newV = emitRadialCap(
        verts, indices, outerBottom, { ring: drainBottomRing }, 3, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 3, indexStart, indexEnd: indices.length, vertexCount: newV });
    }
    // bottom-top (4): inner-bottom (t=0) ↔ drain top ring (t=1), radial bands.
    {
      const indexStart = indices.length;
      const nRad = radialBandCount(rInnerBot, dims.rDrain, nRingActual);
      const newV = emitRadialCap(
        verts, indices, innerBottom, { ring: drainTopRing }, 4, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 4, indexStart, indexEnd: indices.length, vertexCount: newV });
    }
    // drain (5): drain bottom ring (t=0) ↔ drain top ring (t=1).
    {
      const indexStart = indices.length;
      const tri = annulusStrip(drainBottomRing, drainTopRing, false);
      for (const v of tri) indices.push(v);
      ranges.push({
        surfaceId: 5,
        indexStart,
        indexEnd: indices.length,
        vertexCount: drainVertCount,
      });
    }
  } else {
    // --- 4'. Solid base: each disc reduces radially to ONE centre vertex ----
    // bottom-under (3): outer-bottom ring → centre at z=0.
    {
      const indexStart = indices.length;
      const centreUnder = verts.length / 3;
      verts.push(0, 1, 3); // (u=0, t=1, s=3) ⇒ r=rDrain≈0, z=0
      const nRad = radialBandCount(rOuterBot, 0, nRingActual);
      const newV = emitRadialCap(
        verts, indices, outerBottom, { centreIdx: centreUnder }, 3, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 3, indexStart, indexEnd: indices.length, vertexCount: newV + 1 });
    }
    // bottom-top (4): inner-bottom ring → centre at z=tBottom.
    {
      const indexStart = indices.length;
      const centreTop = verts.length / 3;
      verts.push(0, 1, 4); // (u=0, t=1, s=4) ⇒ r≈0, z=tBottom
      const nRad = radialBandCount(rInnerBot, 0, nRingActual);
      const newV = emitRadialCap(
        verts, indices, innerBottom, { centreIdx: centreTop }, 4, nRingActual, nRad, false,
      );
      ranges.push({ surfaceId: 4, indexStart, indexEnd: indices.length, vertexCount: newV + 1 });
    }
  }

  const vertices = new Float32Array(verts);
  const indexArr = new Uint32Array(indices);

  // --- 5. Orientation: make the closed solid consistently outward -----------
  orientOutward(vertices, indexArr, evalPos.bind(null, dims, outerSampler, innerSampler));

  return { vertices, indices: indexArr, surfaceRanges: ranges };
}

/**
 * 3D position of a packed (u,t,surfaceId) vertex, used only by the orientation
 * pass. Walls defer to their samplers; caps/drain are placed analytically to
 * coincide with the GPU geometry (same r, z as evaluate_vertices). The twist is
 * irrelevant to orientation (a rigid rotation about z preserves winding), so it
 * is omitted here.
 */
function evalPos(
  dims: AssemblyDimensions,
  outerSampler: SurfaceSampler,
  innerSampler: SurfaceSampler,
  u: number,
  t: number,
  surfaceId: number,
): [number, number, number] {
  if (surfaceId < 0.5) {
    const p = outerSampler.position(u, t);
    return [p[0], p[1], p[2]];
  }
  if (surfaceId < 1.5) {
    const p = innerSampler.position(u, t);
    return [p[0], p[1], p[2]];
  }
  const theta = 2 * Math.PI * (u - Math.floor(u));
  // Radii at the rings (twist-free; radial magnitude is all the orient pass needs).
  const rOuterTop = radial(outerSampler.position(u, 1));
  const rOuterBot = radial(outerSampler.position(u, 0));
  const rInnerTop = radial(innerSampler.position(u, 1));
  const rInnerBot = radial(innerSampler.position(u, 0));
  let r: number;
  let z: number;
  if (surfaceId < 2.5) {
    r = rInnerTop + (rOuterTop - rInnerTop) * t;
    z = dims.H;
  } else if (surfaceId < 3.5) {
    r = rOuterBot + (dims.rDrain - rOuterBot) * t;
    z = 0;
  } else if (surfaceId < 4.5) {
    r = rInnerBot + (dims.rDrain - rInnerBot) * t;
    z = dims.tBottom;
  } else {
    r = dims.rDrain;
    z = t * dims.tBottom;
  }
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

function radial(p: readonly number[]): number {
  return Math.hypot(p[0], p[1]);
}

/**
 * Make every triangle consistently outward-facing. The mesh is a single closed
 * manifold built from index-shared rings, so a position-welded edge adjacency
 * is connected; flood-fill orientation from a seed, then flip the whole mesh if
 * its signed volume is negative (i.e. it came out inward). Deterministic and
 * purely topological — not a repair/weld pass (it never merges/moves vertices).
 */
function orientOutward(
  packed: Float32Array,
  indices: Uint32Array,
  posOf: (u: number, t: number, s: number) => [number, number, number],
): void {
  const triCount = indices.length / 3;
  if (triCount === 0) return;

  // Weld vertices by 3D position so shared-ring edges are identified.
  const n = packed.length / 3;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = posOf(packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2]);
    pos[i * 3] = p[0];
    pos[i * 3 + 1] = p[1];
    pos[i * 3 + 2] = p[2];
  }
  const inv = 1 / 1e-4;
  const weld = new Uint32Array(n);
  const buckets = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * inv)},${Math.round(pos[i * 3 + 1] * inv)},${Math.round(pos[i * 3 + 2] * inv)}`;
    const ex = buckets.get(key);
    if (ex === undefined) { buckets.set(key, i); weld[i] = i; }
    else weld[i] = ex;
  }

  // Map each undirected welded edge to the (up to two) triangles using it.
  const edgeTris = new Map<string, number[]>();
  const edgeKey = (a: number, b: number): string =>
    a < b ? `${a}:${b}` : `${b}:${a}`;
  for (let t = 0; t < triCount; t++) {
    const a = weld[indices[t * 3]];
    const b = weld[indices[t * 3 + 1]];
    const c = weld[indices[t * 3 + 2]];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const k = edgeKey(i, j);
      let list = edgeTris.get(k);
      if (!list) { list = []; edgeTris.set(k, list); }
      list.push(t);
    }
  }

  // Flood-fill: neighbours across a shared edge must traverse it in opposite
  // directions. Flip a neighbour whose directed edge matches ours.
  const oriented = new Uint8Array(triCount);
  const flip = (t: number): void => {
    const i0 = t * 3;
    const tmp = indices[i0 + 1];
    indices[i0 + 1] = indices[i0 + 2];
    indices[i0 + 2] = tmp;
  };
  const directedHas = (t: number, i: number, j: number): boolean => {
    const a = weld[indices[t * 3]];
    const b = weld[indices[t * 3 + 1]];
    const c = weld[indices[t * 3 + 2]];
    return (
      (a === i && b === j) ||
      (b === i && c === j) ||
      (c === i && a === j)
    );
  };
  for (let seed = 0; seed < triCount; seed++) {
    if (oriented[seed]) continue;
    oriented[seed] = 1;
    const stack = [seed];
    while (stack.length > 0) {
      const t = stack.pop() as number;
      const a = weld[indices[t * 3]];
      const b = weld[indices[t * 3 + 1]];
      const c = weld[indices[t * 3 + 2]];
      const dirEdges: Array<[number, number]> = [[a, b], [b, c], [c, a]];
      for (const [i, j] of dirEdges) {
        if (i === j) continue;
        const list = edgeTris.get(edgeKey(i, j));
        if (!list) continue;
        for (const nb of list) {
          if (nb === t || oriented[nb]) continue;
          // Consistent if the neighbour traverses (i,j) as (j,i). If it has the
          // SAME directed edge, flip it.
          if (directedHas(nb, i, j)) flip(nb);
          oriented[nb] = 1;
          stack.push(nb);
        }
      }
    }
  }

  // Global sense: if the signed volume is negative the mesh is inward — flip all.
  let vol6 = 0;
  for (let t = 0; t < triCount; t++) {
    const ia = indices[t * 3] * 3;
    const ib = indices[t * 3 + 1] * 3;
    const ic = indices[t * 3 + 2] * 3;
    const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
    const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];
    vol6 +=
      ax * (by * cz - bz * cy) -
      ay * (bx * cz - bz * cx) +
      az * (bx * cy - by * cx);
  }
  if (vol6 < 0) {
    for (let t = 0; t < triCount; t++) flip(t);
  }
}
