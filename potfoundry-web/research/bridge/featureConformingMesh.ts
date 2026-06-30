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
  },
): FeatureConformBResult {
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

  // TASK 4: reorder constraint pairs strongest-first so the kernel locks high-relief loci before weak crossers.
  let orderedConstraints = constraints;
  if (priority && constraintAmp.length === constraints.length / 2) {
    const idx = constraintAmp.map((_, i) => i).sort((a, b) => constraintAmp[b] - constraintAmp[a]);
    orderedConstraints = new Array(constraints.length);
    for (let j = 0; j < idx.length; j++) { orderedConstraints[2 * j] = constraints[2 * idx[j]]; orderedConstraints[2 * j + 1] = constraints[2 * idx[j] + 1]; }
  }

  const injected = dd.points;
  if (opts.profile === true) {
    // eslint-disable-next-line no-console
    console.log(`  [feat-conform-B ${styleId}] injected=${injected.length / 2} (deduped @${dedupeMm.toFixed(3)}mm) constraints=${constraints.length / 2} meanMove=${(moveN ? moveSum / moveN : 0).toFixed(3)}mm`);
  }

  const mesh = buildInhouseMetricMesh(rA, H, { ...opts, injectedPoints: injected, pinInjected: pin, constraintEdges: orderedConstraints });
  return { ...mesh, injected: injected.length / 2, meanRefineMoveMm: moveN ? moveSum / moveN : 0, constraintsRequested: orderedConstraints.length / 2 };
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
