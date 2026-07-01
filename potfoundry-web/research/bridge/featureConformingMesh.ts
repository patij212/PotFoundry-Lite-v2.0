// featureConformingMesh.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// FEATURE-CONFORMING front-end for the in-house surface-metric kernel (inhouseMetricMesh.ts).
//
// MOTIVATION (E-2026-06-30-FEAT-FID-R2): the metric kernel gives even, sliver-free tessellation but is
// BLIND to features — it places vertices by sizing/quality alone, so mesh vertices never LAND on the sharp
// crests and the sharpest ribs get flattened (crest under-shoot 3.35mm ArtDeco / 1.51mm GothicArches,
// DENSITY-INVARIANT). The fix is to put vertices ON the crests.
//
// WHAT THIS DOES (Stage A — the dominant lever, vertex placement):
//   1. Extract the dense feature loci for the style (denseFeatureGroundTruth via styleSampler) — the SAME
//      truth the measurement harness scores against.
//   2. Sample each locus polyline at metric spacing (~ a few × hMin) and REFINE every sample to the TRUE
//      local radial extremum on the RAW analytic rA: search perpendicular to the line's local tangent in
//      (u,t) within ±~1 truth cell, find the crest (radial max) or valley (radial min) by a fine 1D scan +
//      golden-section, so the injected vertex lands on the EXACT crest/valley, not the bilinear truth
//      approximation. Periodic u is wrapped at the seam.
//   3. Inject the refined (u,t) points into the kernel via its OPT-IN injectedPoints option (de-duped by the
//      kernel's own addPoint), with pinInjected so the on-surface smoothing cannot relax them off the crest.
//
// Stage B (constrained edges) lives in featureConformingMeshB (cdt2d) — only needed if Stage A leaves
// residual under-shoot or feature-adjacent slivers; see featureConformingMeshR2.test.ts for the gate.
//
// Reuses: inhouseMetricMesh (kernel + its new injectedPoints/pinInjected no-op hooks), buildFeatureTruth
// (loci, same as the harness), runStyle (radius fn). Does NOT modify any src/ file or the default kernel path.

import { buildInhouseMetricMesh, type InhouseMeshOpts, type InhouseMesh } from './inhouseMetricMesh';
import { kappaMaxAt, type CrestSizeSample } from './surfaceMetricField';
import { buildFeatureTruth, type FeatureTruth } from './featureLocalizedFidelity';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import type { StyleId, StyleOptions } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

export interface FeatureConformOpts {
  /** Arc-length sampling step along each locus (mm) for the injected points. Default = 3·hMin (bounded). */
  injectStepMm?: number;
  /** Perpendicular search half-width for extremum refinement, in mm. Default 0.6mm (~1–2 truth cells). */
  searchHalfMm?: number;
  /** Dense-truth marching grid resolution (feature LOCATIONS). Default 384 (matches the harness). */
  truthRes?: number;
  /** Pin injected vertices during smoothing so the optimizer can't relax them off-crest. Default true. */
  pin?: boolean;
  /** Skip the extremum refinement (inject the raw bilinear loci) — A/B lever to isolate refinement's effect. */
  noRefine?: boolean;
  /**
   * Dedupe tolerance (mm) for the REFINED injected points. The extremum search snaps many distinct loci
   * samples onto the SAME crest, producing near-coincident (u,t) that differ below the kernel's dedupeEps
   * (1e-6 in (u,t) ≈ 3e-4 mm) — those coincident points make Delaunator emit degenerate/non-manifold
   * slivers (MEASURED: ~1376 dup verts + 156 non-manifold edges on HarmonicRipple, crestU 0.02→4.5mm).
   * We snap-dedupe the refined points to a `dedupeMm` mm grid BEFORE injection. Default = injectStepMm/2.
   */
  dedupeMm?: number;
  /** Emit count diagnostics. */
  profile?: boolean;
}

export interface FeatureConformResult extends InhouseMesh {
  /** Number of refined feature points handed to the kernel (pre-dedupe). */
  injected: number;
  /** Mean |refinement move| in mm (how far the bilinear loci were off the true extremum). */
  meanRefineMoveMm: number;
}

/**
 * Snap-deduper for refined (u,t) points on a mm grid. add(u,t) snaps to the grid (periodic u) and returns
 * the position (index into the deduped list) — reusing an existing position when the cell is already taken,
 * so near-coincident refined extrema collapse to ONE injected vertex. Holds the deduped flat (u,t) list.
 *
 * SEAM SYMMETRY: the kernel meshes an OPEN (u,t) patch (no periodic stitch — the seam at u=0 and u=1 is two
 * separate boundaries that downstream welds by 3D position). The baseline seed grid is u-symmetric so it
 * welds cleanly; injecting crest points near the seam on ONE side without a matching twin on the other makes
 * the welded seam non-conformal (MEASURED: ~22–1026 non-manifold edges after 3D-weld). So when a point lands
 * within `dedupeMm` of the seam we ALSO add its twin at the opposite side (u→u±1, clamped into [0,1]).
 */
function makeSnapDeduper(uToMm: number, tToMm: number, dedupeMm: number): {
  add: (u: number, t: number) => number; points: number[];
} {
  const points: number[] = [];
  const cellU = Math.max(dedupeMm / uToMm, 1e-7), cellT = Math.max(dedupeMm / tToMm, 1e-7);
  const seamU = dedupeMm / uToMm; // seam band half-width in u
  const map = new Map<number, number>();
  const nU = Math.max(1, Math.round(1 / cellU));
  const rawAdd = (uu: number, tc: number): number => {
    const gu = Math.round(uu / cellU), gt = Math.round(tc / cellT);
    const guW = ((gu % nU) + nU) % nU;
    const key = guW * 8_388_608 + gt;
    const hit = map.get(key);
    if (hit !== undefined) return hit;
    const pos = points.length / 2;
    points.push(uu, tc); map.set(key, pos);
    return pos;
  };
  const add = (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const pos = rawAdd(uu, tc);
    // seam twin: a point at u≈0 gets a copy at u=1 and vice-versa (exact 0 and 1 so the two seam boundaries
    // share identical 3D positions after lift → weld conformally).
    if (uu <= seamU) rawAdd(1, tc);
    else if (uu >= 1 - seamU) rawAdd(0, tc);
    return pos;
  };
  return { add, points };
}

/** Shortest periodic du in [-0.5,0.5). */
function periodicDu(u1: number, u0: number): number {
  let du = u1 - u0;
  if (du > 0.5) du -= 1; else if (du < -0.5) du += 1;
  return du;
}

/** Shortest-image u of `u` relative to reference `uRef` (periodic in 1). */
function wrapURef(u: number, uRef: number): number {
  let d = u - uRef;
  while (d > 0.5) d -= 1;
  while (d < -0.5) d += 1;
  return uRef + d;
}

/** 2D orientation sign of (a,b,c): >0 ccw, <0 cw, 0 collinear (mm-scaled inputs). */
function orient2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

export interface PlanarizeResult {
  /** augmented flat (u,t) injected points (original + crossing/split vertices). */
  injected: number[];
  /** the PLANAR (non-crossing) constraint edges as vertex-position pairs into `injected`. */
  constraints: number[];
  /** diagnostics. */
  crossingsSplit: number;
  passes: number;
  addedPoints: number;
  /** residual crossings still present after the last pass (should be 0). */
  residualCrossings: number;
}

/**
 * PLANARIZE a (u,t) PSLG: split every interior crossing of two constraint segments into a NEW shared vertex
 * (refined to the true surface) so the result is a planar graph — every junction is a FAN of non-crossing
 * edges and no facet can span a sharp cusp. Seam-aware in u (periodic): a segment pair is compared in the
 * first segment's local [uRef-0.5, uRef+0.5] band (shortest-image), mirroring the constraint-recovery /
 * locator normalization. Uniform (u,t) bucket grid over segment bboxes → only same/neighbour-bucket pairs
 * are tested (avoids O(E²)). Iterates until no crossings remain (a split can create new crossings) or a pass
 * cap. WELD is already done by the caller's snap-deduper (`dd`) — coincident endpoints share a vertex; this
 * only adds the interior crossing vertices.
 *
 * @param constraints0 vertex-position pairs into pointsRef.
 * @param uToMm,tToMm  (u,t)→mm scales (for mm-consistent orientation predicates).
 * @param pointsRef    the LIVE flat (u,t) points list — planarization APPENDS intersection vertices to it (via
 *                     its own fine hash) and returns edge pairs indexing into it. Must be the same list the
 *                     kernel receives as injectedPoints.
 */
export function planarizeConstraintGraph(
  constraints0: number[],
  uToMm: number, tToMm: number,
  pointsRef: number[],
  maxPasses = 4,
): PlanarizeResult {
  // SEGMENT ARRANGEMENT (single pass per iteration; converges in a few iterations even on a dense multi-ridge
  // apex): for every edge collect ALL its crossings with other edges, add each intersection as a distinct
  // shared vertex (via a FINE own hash — NOT the caller's coarse loci deduper, whose 0.04mm grid collapsed
  // crossing points onto endpoints and left the crossing unresolved), then rebuild the edge as the chain
  // through its sorted crossing points. Every crossing pair therefore ends up sharing the SAME vertex ⇒ a
  // planar fan. A split can create a new near-degenerate crossing (an intersection lying on a third edge), so
  // we re-run a couple of passes; residual counts what remains.
  //
  // Intersection vertices are placed AT THE TRUE (u,t) INTERSECTION and lifted to the surface by the kernel
  // (which evaluates rA at every (u,t)). We do NOT snap them to a 2D radial extremum — the two constraint
  // chords are the mesh's model of the two ridges, so their crossing IS the junction the mesh should pass
  // through; pulling it to a nearby extremum moves it OFF the chords and re-creates a spanning facet.
  const px = (v: number): number => pointsRef[2 * v];
  const py = (v: number): number => pointsRef[2 * v + 1];

  // FINE intersection-vertex dedupe (own hash on a mm grid ≪ the loci grid). Coincident crossings at one apex
  // share a vertex; distinct crossings stay distinct. Seam-wrapped in u. CRITICAL: the map is SEEDED with the
  // EXISTING points so an intersection that coincides with a loci endpoint MERGES onto it instead of adding a
  // near-coincident duplicate — MEASURED, that duplicate was the nonMan=2 (two vertices at the same near-
  // vertical apex (u,t) welding to one 3D point while both anchor a locked edge → incident=4 doubled edge).
  const fineMm = 0.006; // ≳ the loci injectStep/2 dedupe so a crossing at a loci sample collapses onto it
  const cellU = Math.max(fineMm / uToMm, 1e-8), cellT = Math.max(fineMm / tToMm, 1e-8);
  const nUcells = Math.max(1, Math.round(1 / cellU));
  const gkey = (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const gu = ((Math.round(uu / cellU) % nUcells) + nUcells) % nUcells;
    return gu * 16_777_216 + Math.round(tc / cellT);
  };
  const fineMap = new Map<number, number>();
  for (let i = 0; i < pointsRef.length / 2; i++) { const k = gkey(pointsRef[2 * i], pointsRef[2 * i + 1]); if (!fineMap.has(k)) fineMap.set(k, i); }
  let addedPoints = 0;
  const addFine = (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const key = gkey(uu, tc);
    const hit = fineMap.get(key); if (hit !== undefined) return hit;
    const pos = pointsRef.length / 2; pointsRef.push(uu, tc); fineMap.set(key, pos); addedPoints++;
    return pos;
  };

  const ekey = (a: number, b: number): number => { const lo = a < b ? a : b, hi = a < b ? b : a; return lo * 67_108_864 + hi; };
  let edges: Array<[number, number]> = [];
  {
    const seen = new Set<number>();
    for (let i = 0; i + 1 < constraints0.length; i += 2) {
      const a = constraints0[i], b = constraints0[i + 1];
      if (a === b || a < 0 || b < 0) continue;
      const k = ekey(a, b); if (seen.has(k)) continue; seen.add(k);
      edges.push([a, b]);
    }
  }

  const GRID = 384; // bucket grid; a segment registers in every cell its bbox overlaps
  let totalCrossings = 0, pass = 0, residual = 0;

  for (; pass < maxPasses; pass++) {
    // bucket edges by bbox (seam-aware: anchor each edge in its endpoint-a u-frame).
    const buckets = new Map<number, number[]>();
    const addToBucket = (cu: number, ct: number, ei: number): void => {
      const cuW = ((cu % GRID) + GRID) % GRID;
      const ctC = ct < 0 ? 0 : ct > GRID - 1 ? GRID - 1 : ct;
      let arr = buckets.get(cuW * (GRID + 2) + ctC); if (arr === undefined) { arr = []; buckets.set(cuW * (GRID + 2) + ctC, arr); }
      arr.push(ei);
    };
    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei];
      const uA = px(a), uB = wrapURef(px(b), uA), tA = py(a), tB = py(b);
      const cuLo = Math.floor(Math.min(uA, uB) * GRID), cuHi = Math.floor(Math.max(uA, uB) * GRID);
      const ctLo = Math.floor(Math.min(tA, tB) * GRID), ctHi = Math.floor(Math.max(tA, tB) * GRID);
      for (let cu = cuLo; cu <= cuHi; cu++) for (let ct = ctLo; ct <= ctHi; ct++) addToBucket(cu, ct, ei);
    }

    // per-edge crossing list: for edge ei, an array of {s (param along a→b), vertex}.
    const crossPerEdge: Array<Array<{ s: number; v: number }>> = edges.map(() => []);
    const pairSeen = new Set<number>();
    let passCrossings = 0;
    for (const arr of buckets.values()) {
      for (let x = 0; x < arr.length; x++) {
        for (let y = x + 1; y < arr.length; y++) {
          const ei = arr[x], ej = arr[y];
          if (ei === ej) continue;
          const pk = ei < ej ? ei * 67_108_864 + ej : ej * 67_108_864 + ei;
          if (pairSeen.has(pk)) continue; pairSeen.add(pk);
          const [a, b] = edges[ei], [c, d] = edges[ej];
          if (a === c || a === d || b === c || b === d) continue; // share a vertex → already a fan
          const uRef = px(a);
          const axU = px(a), ayU = py(a);
          const bxU = wrapURef(px(b), uRef), byU = py(b);
          const cxU = wrapURef(px(c), uRef), cyU = py(c);
          const dxU = wrapURef(px(d), uRef), dyU = py(d);
          const axM = axU * uToMm, ayM = ayU * tToMm, bxM = bxU * uToMm, byM = byU * tToMm;
          const cxM = cxU * uToMm, cyM = cyU * tToMm, dxM = dxU * uToMm, dyM = dyU * tToMm;
          const o1 = orient2(axM, ayM, bxM, byM, cxM, cyM), o2 = orient2(axM, ayM, bxM, byM, dxM, dyM);
          const o3 = orient2(cxM, cyM, dxM, dyM, axM, ayM), o4 = orient2(cxM, cyM, dxM, dyM, bxM, byM);
          if (!(((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0)))) continue;
          const rpx = bxU - axU, rpy = byU - ayU, spx = dxU - cxU, spy = dyU - cyU;
          const denom = rpx * spy - rpy * spx;
          if (Math.abs(denom) < 1e-18) continue;
          const s = ((cxU - axU) * spy - (cyU - ayU) * spx) / denom;
          const sj = ((cxU - axU) * rpy - (cyU - ayU) * rpx) / denom; // param along c→d
          if (s <= 1e-6 || s >= 1 - 1e-6 || sj <= 1e-6 || sj >= 1 - 1e-6) continue; // endpoint-touch, not interior
          const iu = axU + s * rpx, it = ayU + s * rpy;
          const v = addFine(iu, it);
          if (v === a || v === b || v === c || v === d) continue; // merged onto an endpoint → not a real split
          crossPerEdge[ei].push({ s, v });
          crossPerEdge[ej].push({ s: sj, v });
          passCrossings++;
        }
      }
    }

    if (passCrossings === 0) { residual = 0; break; }
    totalCrossings += passCrossings;

    // rebuild every edge as the chain through its sorted crossings; edges with none pass through unchanged.
    const next: Array<[number, number]> = [];
    const seen2 = new Set<number>();
    const pushEdge = (a: number, b: number): void => { if (a === b) return; const k = ekey(a, b); if (seen2.has(k)) return; seen2.add(k); next.push([a, b]); };
    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei];
      const xs = crossPerEdge[ei];
      if (xs.length === 0) { pushEdge(a, b); continue; }
      xs.sort((p, q) => p.s - q.s);
      let prev = a;
      for (const { v } of xs) { if (v !== prev) { pushEdge(prev, v); prev = v; } }
      pushEdge(prev, b);
    }
    edges = next;
    residual = passCrossings; // if the pass cap trips, this is the last unresolved count
  }

  const outC: number[] = [];
  for (const [a, b] of edges) outC.push(a, b);
  return { injected: pointsRef, constraints: outC, crossingsSplit: totalCrossings, passes: pass, addedPoints, residualCrossings: residual };
}

/**
 * Build the feature-conforming point injection for a style, then mesh with the kernel.
 *
 * The injection is the union of all dense-truth loci sampled at ~injectStepMm and each sample snapped to the
 * true local radial extremum (crest=max, valley=min) along the mm-perpendicular to the locus tangent. The raw
 * analytic rA is used for the extremum search (NOT the bilinear sampler) so the vertex lands on the exact
 * feature, defeating the grid-curvature aliasing the kernel's sizing field suffers from.
 */
export function buildFeatureConformingMesh(
  styleId: StyleId, params: StyleOptions, dims: StyleDims,
  opts: InhouseMeshOpts & FeatureConformOpts & {
    lineFilter?: (line: FeatureLine, index: number) => boolean;
    truth?: FeatureTruth;
  },
): FeatureConformResult {
  const rA = buildRadiusFnLocal(styleId, params, dims);
  const H = dims.H;
  const truthRes = opts.truthRes ?? 384;
  const injectStepMm = opts.injectStepMm ?? Math.max(3 * opts.hMin, 0.02);
  const searchHalfMm = opts.searchHalfMm ?? 0.6;
  const pin = opts.pin ?? true;
  // Opt-in SHARP GATE hook (parallel to Stage B): inject ONLY the gated loci. Default undefined = inject all
  // loci (the spike behaviour) — additive, no existing caller changes.
  const lineFilter = opts.lineFilter;

  const truth = opts.truth ?? buildFeatureTruth(styleId, params, dims, truthRes);
  const uToMm = truth.uToMm, tToMm = H;
  const ref = makeRefiner(rA, H, uToMm, tToMm, searchHalfMm);
  const dedupeMm = opts.dedupeMm ?? injectStepMm / 2;
  const dd = makeSnapDeduper(uToMm, tToMm, dedupeMm);

  let moveSum = 0, moveN = 0;

  truth.lines.forEach((line, lineIdx) => {
    if (lineFilter !== undefined && !lineFilter(line, lineIdx)) return; // SHARP GATE: skip un-gated loci
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const u0 = pts[i].u, u1 = pts[i + 1].u, t0 = pts[i].t, t1 = pts[i + 1].t;
      const du = periodicDu(u1, u0), dt = t1 - t0;
      const lenMm = Math.hypot(du * uToMm, dt * tToMm);
      if (lenMm < 1e-9) continue;
      // unit tangent in (u,t); perpendicular in mm = (-tyMm, txMm)/tl, converted back to (u,t) by /mm-scale.
      const txMm = du * uToMm, tyMm = dt * tToMm;
      const tl = Math.hypot(txMm, tyMm) || 1;
      const perpU = (-tyMm / tl) / uToMm, perpT = (txMm / tl) / tToMm;
      const n = Math.max(1, Math.ceil(lenMm / injectStepMm));
      for (let k = 0; k <= n; k++) {
        const ff = k / n;
        let u = u0 + du * ff; u -= Math.floor(u);
        const t = t0 + dt * ff;
        if (opts.noRefine === true) { dd.add(u, t); continue; }
        const seekMax = ref.radAt(u, t) >= ref.rowMean(t); // crest (above mean) → maximize; valley → minimize
        const r = ref.refine(u, t, perpU, perpT, seekMax);
        dd.add(r.u, r.t);
        moveSum += r.moveMm; moveN++;
      }
    }
  });

  const injected = dd.points;
  if (opts.profile === true) {
    // eslint-disable-next-line no-console
    console.log(`  [feat-conform ${styleId}] loci=${truth.lines.length} injected=${injected.length / 2} (deduped @${dedupeMm.toFixed(3)}mm) meanMove=${(moveN ? moveSum / moveN : 0).toFixed(3)}mm`);
  }

  const mesh = buildInhouseMetricMesh(rA, H, { ...opts, injectedPoints: injected, pinInjected: pin });
  return { ...mesh, injected: injected.length / 2, meanRefineMoveMm: moveN ? moveSum / moveN : 0 };
}

// ---------------------------------------------------------------------------
// Stage B — emit refined loci AS ordered polylines so consecutive samples become CONSTRAINT EDGES (the locus
// is then a real mesh edge, not a Delaunay diagonal cutting across the thin ridge). Returns the injected
// point list + the constraint-pair list (positions into the injected list), handed to the kernel's
// constraintEdges option. Stage A's refinement (extremum snap, seam wrap, crest/valley classify) is reused
// verbatim so the only delta vs Stage A is "consecutive samples are locked edges".
// ---------------------------------------------------------------------------

export interface FeatureConformBResult extends FeatureConformResult {
  constraintsRequested: number;
}

/**
 * Build the Stage-B (constrained-edge) feature-conforming mesh. Same refinement as Stage A, but each locus
 * polyline's consecutive refined samples are emitted as constraint edges so a mesh edge FOLLOWS the crest.
 *
 * @param tFilter optional [tMin,tMax] to restrict constraints to a t-band (mechanism prototype: isolate one
 *                ridge region to keep the O(constraints·tris) recovery tractable on a small mesh).
 * @param lineFilter optional per-line predicate (line, index) ⇒ conform-this-locus? This is the SHARP-FEATURE
 *                GATE hook (E-2026-06-30-FEAT-CONFORM-ALL20 Task 2): the measured gate passes a keep-mask so
 *                ONLY the loci the baseline metric mesh actually under-resolves become constraints. When
 *                absent, every line (subject to constrainLabels/tFilter) is conformed — the spike behaviour.
 *                A `truth` may be supplied to reuse loci already extracted by the gate (avoids re-extraction).
 */
export function buildFeatureConformingMeshB(
  styleId: StyleId, params: StyleOptions, dims: StyleDims,
  opts: InhouseMeshOpts & FeatureConformOpts & {
    tFilter?: [number, number]; constrainLabels?: string[];
    lineFilter?: (line: FeatureLine, index: number) => boolean;
    truth?: FeatureTruth;
    /**
     * TASK 4 (E-2026-06-30-FEAT-CONFORM-WARP D5): when true, emit the constraint edges ORDERED by relief
     * amplitude (|r − rowMean| at the edge, descending) so the kernel's recovery LOCKS the strongest/sharpest
     * loci FIRST and a weaker crosser gives up (the lock blocks it). Default false = emit in line order (the
     * shipped behaviour). Opt-in → byte-identical when off.
     */
    constraintPriority?: boolean;
    /**
     * E-2026-07-01-PUREGREEN: PLANARIZE the (u,t) constraint PSLG before meshing — split every interior crossing
     * of two constraint segments into a NEW shared vertex (refined to the true junction apex) so no facet can
     * span a sharp cusp and constraint recovery reaches ~100% (the ~90% ceiling is genuine locus CROSSINGS —
     * E-2026-06-30-SHOWCASE D5). Opt-in → STRICT NO-OP when false/absent (the constraint list is unchanged, so
     * a conforming build without the flag is byte-identical to the pre-change conforming output). When on with
     * constraintPriority, planarization runs FIRST (it removes crossings, making priority-give-up moot) so the
     * priority ordering is skipped.
     */
    planarizeConstraints?: boolean;
    /**
     * E-2026-07-01-CRESTAWARE: CREST-AWARE SIZING. When true, RASTERIZE the refined feature loci into the kernel's
     * sizing field as a min-h3D overlay (via crestSizeOverlay): for each refined locus point compute κ_max ON the
     * locus (kappaMaxAt, fine step), h3D=clamp(√(8·tol/κ),hMin,hMax), and force the sizing cells the loci pass
     * through to that size. This makes fineness FOLLOW the loci — defeating the sizing-grid curvature aliasing
     * (E-2026-07-01-FRONTIER-BET2: the grid samples κ at corners and MISSES sub-cell crests at fracU 0.35/0.65 →
     * under-sizes → the SYSTEMATIC crest-straddle residual). Opt-in → STRICT NO-OP when false/absent (no overlay is
     * emitted ⇒ the metric field + mesh are byte-identical to conforming-without-the-flag). Uses `chordTolMm ?? tolMm`
     * as the sizing chord target so the overlay targets the SAME green goal the chord guard does. */
    crestAwareSizing?: boolean;
    /** MIN-overlay neighbourhood half-width in sizing-grid cells for crestAwareSizing (default 1). Keep NARROW so
     *  the overlay does not balloon triangle count away from the loci. */
    crestBandCells?: number;
    /** FD step (in (u,t)) for the on-locus κ_max used by crestAwareSizing (default = curvatureFineStep ?? 1/2048).
     *  Small resolves the sharp sub-cell ridge; a TRUE C0 cusp is bounded by the hMin clamp on h3D. */
    crestKappaStep?: number;
  },
): FeatureConformBResult & { planarize?: PlanarizeResult; crestOverlayCount?: number; crestHMinMm?: number } {
  const rA = buildRadiusFnLocal(styleId, params, dims);
  const H = dims.H;
  const truthRes = opts.truthRes ?? 384;
  const injectStepMm = opts.injectStepMm ?? Math.max(3 * opts.hMin, 0.02);
  const searchHalfMm = opts.searchHalfMm ?? 0.6;
  const pin = opts.pin ?? true;
  const tFilter = opts.tFilter;
  const labelSet = opts.constrainLabels ? new Set(opts.constrainLabels) : undefined;
  const lineFilter = opts.lineFilter;
  const priority = opts.constraintPriority === true;

  const truth = opts.truth ?? buildFeatureTruth(styleId, params, dims, truthRes);
  const uToMm = truth.uToMm, tToMm = H;
  const ref = makeRefiner(rA, H, uToMm, tToMm, searchHalfMm);
  const dedupeMm = opts.dedupeMm ?? injectStepMm / 2;
  const dd = makeSnapDeduper(uToMm, tToMm, dedupeMm);

  const constraints: number[] = [];
  const constraintSeen = new Set<number>(); // dedupe constraint pairs too (a snap-collapsed pair can repeat)
  // For the priority option: per-constraint strength = max |r − rowMean| over its two endpoint loci (mm).
  const constraintAmp: number[] = [];
  let moveSum = 0, moveN = 0;

  truth.lines.forEach((line, lineIdx) => {
    if (labelSet !== undefined && !labelSet.has(String(line.label ?? ''))) return;
    if (lineFilter !== undefined && !lineFilter(line, lineIdx)) return; // SHARP GATE: skip un-gated loci
    const pts = line.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const u0 = pts[i].u, u1 = pts[i + 1].u, t0 = pts[i].t, t1 = pts[i + 1].t;
      if (tFilter !== undefined && (t0 < tFilter[0] || t0 > tFilter[1] || t1 < tFilter[0] || t1 > tFilter[1])) continue;
      const du = periodicDu(u1, u0), dt = t1 - t0;
      const lenMm = Math.hypot(du * uToMm, dt * tToMm);
      if (lenMm < 1e-9) continue;
      const txMm = du * uToMm, tyMm = dt * tToMm;
      const tl = Math.hypot(txMm, tyMm) || 1;
      const perpU = (-tyMm / tl) / uToMm, perpT = (txMm / tl) / tToMm;
      const n = Math.max(1, Math.ceil(lenMm / injectStepMm));
      let prevPos = -1, prevAmp = 0;
      for (let k = 0; k <= n; k++) {
        const ff = k / n;
        let u = u0 + du * ff; u -= Math.floor(u);
        const t = t0 + dt * ff;
        let uR = u, tR = t < 0 ? 0 : t > 1 ? 1 : t;
        if (opts.noRefine !== true) {
          const seekMax = ref.radAt(u, t) >= ref.rowMean(t);
          const r = ref.refine(u, t, perpU, perpT, seekMax);
          uR = r.u; tR = r.t; moveSum += r.moveMm; moveN++;
        }
        const pos = dd.add(uR, tR);
        // amplitude of THIS refined point: |r − rowMean| (mm), the locus strength.
        const amp = priority ? Math.abs(ref.radAt(uR, tR) - ref.rowMean(tR)) : 0;
        if (prevPos >= 0 && prevPos !== pos) {
          const a = prevPos < pos ? prevPos : pos, b = prevPos < pos ? pos : prevPos;
          const key = a * 16_777_216 + b;
          if (!constraintSeen.has(key)) { constraintSeen.add(key); constraints.push(prevPos, pos); if (priority) constraintAmp.push(Math.max(prevAmp, amp)); }
        }
        prevPos = pos; prevAmp = amp;
      }
    }
  });

  // E-2026-07-01-PUREGREEN: PLANARIZE the PSLG (split crossings into shared junction vertices) BEFORE the
  // priority reorder — planarization removes the crossings that priority-give-up existed to work around, so
  // when planarizing we skip the reorder. STRICT NO-OP when the flag is off (constraints unchanged).
  let planarize: PlanarizeResult | undefined;
  let planarConstraints = constraints;
  if (opts.planarizeConstraints === true) {
    planarize = planarizeConstraintGraph(constraints, uToMm, tToMm, dd.points);
    planarConstraints = planarize.constraints;
    if (opts.profile === true) {
      // eslint-disable-next-line no-console
      console.log(`  [planarize ${styleId}] crossingsSplit=${planarize.crossingsSplit} added=${planarize.addedPoints} passes=${planarize.passes} residual=${planarize.residualCrossings} constraints ${constraints.length / 2}->${planarConstraints.length / 2}`);
    }
  }

  // TASK 4: reorder constraint pairs strongest-first so the kernel locks high-relief loci before weak crossers.
  // (Skipped when planarizing — there are no crossings left for the ordering to help with.)
  let orderedConstraints = planarConstraints;
  if (priority && !planarize && constraintAmp.length === constraints.length / 2) {
    const idx = constraintAmp.map((_, i) => i).sort((a, b) => constraintAmp[b] - constraintAmp[a]);
    orderedConstraints = new Array(constraints.length);
    for (let j = 0; j < idx.length; j++) { orderedConstraints[2 * j] = constraints[2 * idx[j]]; orderedConstraints[2 * j + 1] = constraints[2 * idx[j] + 1]; }
  }

  const injected = dd.points;
  if (opts.profile === true) {
    // eslint-disable-next-line no-console
    console.log(`  [feat-conform-B ${styleId}] injected=${injected.length / 2} (deduped @${dedupeMm.toFixed(3)}mm) constraints=${orderedConstraints.length / 2} meanMove=${(moveN ? moveSum / moveN : 0).toFixed(3)}mm`);
  }

  // E-2026-07-01-CRESTAWARE: build the CREST-AWARE SIZING overlay. Sizing (unlike vertex injection) is cheap and
  // safe — it forces the metric fine on KNOWN crests without injecting vertices or locking edges, so it can cover
  // EVERY detected locus, not just the gated+injected ones. This matters: the SHARP GATE (lineFilter) drops loci
  // the BASE mesh already resolves OK for INJECTION, but those same loci can still be grid-ALIASED for SIZING (the
  // (0.5,0.54) hotspot is a `relief-wall-truth` locus detected 0.0195mm away — _crestLociDetect — that the gate can
  // filter off conforming yet the grid still under-sizes). So we sample the FULL truth loci (ungated), refine each
  // to the true extremum (reusing `ref`), and size h3D=clamp(√(8·tol/κ),hMin,hMax) with κ_max computed ON the
  // refined locus. STRICT NO-OP when the flag is off (overlay=undefined ⇒ the metric field is untouched).
  let crestSizeOverlay: CrestSizeSample[] | undefined;
  let crestHMinMm = 0;
  if (opts.crestAwareSizing === true) {
    const sizeTolMm = opts.chordTolMm ?? opts.tolMm;
    const kStep = opts.crestKappaStep ?? opts.curvatureFineStep ?? 1 / 2048;
    // dedupe overlay samples on a mm grid so overlapping loci families don't emit N× the same κ eval.
    const ovDedupeMm = Math.max(injectStepMm / 2, 0.01);
    const ovDD = makeSnapDeduper(uToMm, tToMm, ovDedupeMm);
    const ovUT: number[] = [];
    const pushOv = (u: number, t: number): void => { const before = ovDD.points.length / 2; ovDD.add(u, t); if (ovDD.points.length / 2 > before) { ovUT.push(u, t); } };
    truth.lines.forEach((line) => {
      // NOTE: NO lineFilter / labelSet / tFilter gate here — the overlay sizes ALL detected crests.
      const pts = line.points;
      for (let i = 0; i + 1 < pts.length; i++) {
        const u0 = pts[i].u, u1 = pts[i + 1].u, t0 = pts[i].t, t1 = pts[i + 1].t;
        const du = periodicDu(u1, u0), dt = t1 - t0;
        const lenMm = Math.hypot(du * uToMm, dt * tToMm);
        if (lenMm < 1e-9) continue;
        const txMm = du * uToMm, tyMm = dt * tToMm;
        const tl = Math.hypot(txMm, tyMm) || 1;
        const perpU = (-tyMm / tl) / uToMm, perpT = (txMm / tl) / tToMm;
        const n = Math.max(1, Math.ceil(lenMm / injectStepMm));
        for (let k = 0; k <= n; k++) {
          const ff = k / n;
          let u = u0 + du * ff; u -= Math.floor(u);
          const t = t0 + dt * ff;
          let uR = u, tR = t < 0 ? 0 : t > 1 ? 1 : t;
          if (opts.noRefine !== true) {
            const seekMax = ref.radAt(u, t) >= ref.rowMean(t);
            const r = ref.refine(u, t, perpU, perpT, seekMax); uR = r.u; tR = r.t;
          }
          pushOv(uR, tR);
        }
      }
    });
    crestSizeOverlay = [];
    let hmn = Infinity;
    for (let i = 0; i + 1 < ovUT.length; i += 2) {
      const u = ovUT[i], t = ovUT[i + 1];
      const kappa = kappaMaxAt(rA, H, u, t, kStep);
      const hRaw = kappa > 1e-9 ? Math.sqrt((8 * sizeTolMm) / kappa) : opts.hMax;
      const h3DMm = Math.min(Math.max(hRaw, opts.hMin), opts.hMax);
      crestSizeOverlay.push({ u, t, h3DMm });
      if (h3DMm < hmn) hmn = h3DMm;
    }
    crestHMinMm = crestSizeOverlay.length ? hmn : 0;
    if (opts.profile === true) {
      // eslint-disable-next-line no-console
      console.log(`  [crest-aware ${styleId}] overlay=${crestSizeOverlay.length} samples (ungated, all loci), sizeTol=${sizeTolMm}mm kStep=${kStep.toExponential(1)} minH3D=${crestHMinMm.toFixed(4)}mm band=${opts.crestBandCells ?? 1}`);
    }
  }

  // When planarizing, guard the recovery flips against creating a duplicate edge at the dense T-junction fans
  // (fixes the nonMan=2 planarize regression). Off otherwise → the shipped conforming recovery is byte-identical.
  const guardRecoveryManifold = opts.guardRecoveryManifold ?? (opts.planarizeConstraints === true);
  const mesh = buildInhouseMetricMesh(rA, H, { ...opts, injectedPoints: injected, pinInjected: pin, constraintEdges: orderedConstraints, guardRecoveryManifold, crestSizeOverlay, crestBandCells: opts.crestBandCells });
  return { ...mesh, injected: injected.length / 2, meanRefineMoveMm: moveN ? moveSum / moveN : 0, constraintsRequested: orderedConstraints.length / 2, planarize, crestOverlayCount: crestSizeOverlay?.length, crestHMinMm };
}

// Local copy of buildRadiusFn (runStyle imports node:child_process at module top, which is fine in vitest;
// re-export through here to keep this file's import surface obvious).
import { buildRadiusFn as _buildRadiusFn } from './runStyle';
function buildRadiusFnLocal(styleId: StyleId, params: StyleOptions, dims: StyleDims): AnalyticRadiusFn {
  return _buildRadiusFn(styleId, params, dims);
}

// Shared refiner factory (extracted so Stage A and Stage B use IDENTICAL extremum logic).
function makeRefiner(rA: AnalyticRadiusFn, H: number, uToMm: number, tToMm: number, searchHalfMm: number): {
  radAt: (u: number, t: number) => number;
  rowMean: (t: number) => number;
  refine: (u0: number, t0: number, puU: number, ptU: number, seekMax: boolean) => { u: number; t: number; moveMm: number };
} {
  const rowMeanCache = new Map<number, number>();
  const rowMean = (t: number): number => {
    const key = Math.round(t * 4096);
    const c = rowMeanCache.get(key); if (c !== undefined) return c;
    const z = t * H; let s = 0; const N = 256;
    for (let i = 0; i < N; i++) s += rA(TAU * (i / N), z);
    const mean = s / N; rowMeanCache.set(key, mean); return mean;
  };
  const radAt = (u: number, t: number): number => {
    let uu = u - Math.floor(u); if (uu < 0) uu += 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    return rA(TAU * uu, tc * H);
  };
  const GR = (Math.sqrt(5) - 1) / 2;
  const refine = (u0: number, t0: number, puU: number, ptU: number, seekMax: boolean): { u: number; t: number; moveMm: number } => {
    const pxMm = puU * uToMm, pyMm = ptU * tToMm;
    const pl = Math.hypot(pxMm, pyMm) || 1;
    const duPerMm = puU / pl, dtPerMm = ptU / pl;
    const f = (sMm: number): number => { const v = radAt(u0 + duPerMm * sMm, t0 + dtPerMm * sMm); return seekMax ? v : -v; };
    const STEPS = 16;
    let bestS = 0, bestV = f(0);
    for (let k = -STEPS; k <= STEPS; k++) { const sMm = (k / STEPS) * searchHalfMm; const v = f(sMm); if (v > bestV) { bestV = v; bestS = sMm; } }
    const w = searchHalfMm / STEPS;
    let a = bestS - w, b = bestS + w;
    let c = b - GR * (b - a), d = a + GR * (b - a);
    let fc = f(c), fd = f(d);
    for (let it = 0; it < 24; it++) {
      if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); }
      else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); }
      if (b - a < 1e-4) break;
    }
    const sBest = (a + b) / 2;
    let uN = u0 + duPerMm * sBest, tN = t0 + dtPerMm * sBest;
    uN -= Math.floor(uN); tN = tN < 0 ? 0 : tN > 1 ? 1 : tN;
    return { u: uN, t: tN, moveMm: Math.abs(sBest) };
  };
  return { radAt, rowMean, refine };
}
