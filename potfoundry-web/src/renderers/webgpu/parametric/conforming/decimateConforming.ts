/**
 * Quality-bounded hard triangle-budget ceiling for the conforming export path.
 *
 * The conforming mesher's sizing field treats its triangle budget as a SOFT
 * guide in `'cap'` mode (it only removes over-refinement and never coarsens
 * below the sag-required mesh, bounded by `MAX_BUDGET_SCALE`), so feature-dense
 * styles can exceed the budget. `decimateConforming` closes the residual gap
 * with a deterministic, ABSOLUTE-error-bounded meshoptimizer ladder — or
 * REFUSES honestly (returning the original mesh + a structured reason) when the
 * budget is unreachable without quality damage.
 *
 * HARD CONSTRAINTS (pinned by unit tests):
 * - Vertices are an EXACT SUBSET of the input — plain `simplify` only
 *   re-indexes over the untouched vertex array; positions stay exact analytic
 *   surface points BY CONSTRUCTION. No repositioning variants are ever used.
 * - `'ErrorAbsolute'` is ALWAYS set, and `errorAbsMm` is REQUIRED (no default)
 *   so the historical relative-vs-absolute units bug (an absolute-mm value
 *   passed into meshopt's RELATIVE `target_error` slot → unconstrained
 *   collapse → manufactured slivers) cannot silently regress.
 * - Every ladder attempt restarts from the ORIGINAL mesh, so retries are exact,
 *   cannot compound, and the output is deterministic for identical inputs
 *   (same-machine/same-lockfile scope; meshoptimizer is pinned exactly).
 * - Every budget-reaching candidate is GATED, never assumed (meshopt guarantees
 *   neither shape nor topology): DELTA-based triangle quality (no NEW slivers),
 *   a geometric fold-over guard, DELTA-based topology (bnd/nonMan/orient), and
 *   an optional caller gate (feature coverage at the call site). Delta gating
 *   (vs absolute-zero) keeps pre-defective inputs from poisoning the applied
 *   branch or corrupting the refusal taxonomy; `inputDefects` records them.
 * - Never throws, never blocks export: WASM-unavailable and simplify-throw both
 *   surface as structured refusals with the original mesh returned.
 *
 * NOTE on stride: the meshoptimizer JS binding takes `vertex_positions_stride`
 * in FLOAT elements, not bytes (it asserts `positions.length % stride === 0`),
 * so the correct value for a packed `[x,y,z]` buffer is 3. (The legacy
 * `meshDecimator.decimateMesh` hardcodes 12, which only happens to satisfy that
 * assertion when the vertex count is divisible by 4 — conforming meshes are
 * not, so we call `simplify` directly here and reuse only `compactMesh`.)
 */

import type { MeshData } from '../../../../geometry/types';
import { topologyMetric, triangleQuality3D } from '../../../../fidelity/metrics';
import { WELD_TOL_MM, ASPECT_MAX } from '../../../../fidelity/types';

/** One ladder attempt's full telemetry (per error rung × flag schedule). */
export interface DecimationAttempt {
  errorAbsMm: number;
  regularize: boolean;
  resultTriangles: number;
  /** meshoptimizer resultError — ABSOLUTE mm because 'ErrorAbsolute' is set. */
  resultErrorMm: number;
  reachedBudget: boolean;
  /** Candidate-minus-input deltas; -1 = stage not reached (cheap-first ordering). */
  sliverDelta: number;
  maxAspect3D: number;
  foldedDelta: number;
  bndDelta: number;
  nonManDelta: number;
  orientDelta: number;
  externalReject: string | null;
  elapsedMs: number;
  passed: boolean;
}

/** Defects measured on the INPUT mesh (the delta-gate baseline). */
export interface DecimationInputDefects {
  boundaryEdges: number;
  nonManifoldEdges: number;
  orientationMismatches: number;
  sliverCount: number;
  maxAspect3D: number;
  foldedTriangles: number;
}

/** Structured outcome of one decimation request (the honesty channel). */
export interface DecimationReport {
  applied: boolean;
  refused: boolean;
  reason: 'under-budget' | 'accepted' | 'wasm-unavailable' | 'simplify-threw'
        | 'budget-unreachable-within-error' | 'no-quality-safe-point';
  naturalTriangles: number;
  budget: number;
  errorSeedMm: number;
  errorCeilingMm: number;
  /** Defects already present in the INPUT (delta gate baseline) — refusals never
   *  misattribute pre-existing damage to decimation. Null when under budget. */
  inputDefects: DecimationInputDefects | null;
  attempts: DecimationAttempt[];
  /** Accepted candidate's PRE-compaction index buffer over the ORIGINAL vertex
   *  array (index-parallel to caller stashes). Undefined unless applied. */
  acceptedIndices?: Uint32Array;
}

/** Decimated (or original, on refusal) mesh + the structured report. */
export interface DecimateConformingResult {
  mesh: MeshData;
  report: DecimationReport;
}

/** Options for the quality-bounded conforming decimation. */
export interface DecimateConformingOptions {
  /**
   * Maximum allowed triangle count. When `mesh.triangleCount <= target` the
   * call is a no-op (returns the input mesh unchanged, reason 'under-budget').
   */
  target: number;
  /**
   * ABSOLUTE mm error seed ('ErrorAbsolute'). REQUIRED — no default, so the
   * relative-vs-absolute units bug cannot silently regress. The call site
   * passes the profile sag (qMaxSag), so decimation starts by spending exactly
   * the fidelity the mesher was allowed. Clamped to >= 1e-4.
   */
  errorAbsMm: number;
  /**
   * Honesty ceiling, ABSOLUTE mm. Default 0.2 (~FDM layer height). Clamped to
   * >= the seed, so a misconfigured pair degrades to a single-rung ladder.
   */
  errorCeilingMm?: number;
  /**
   * Caller gate run on a budget-reaching, delta-clean candidate. Receives the
   * RAW PRE-COMPACTION index buffer (vertex ids parallel to the caller's
   * stashes). Return a reject reason to refuse this candidate, null to accept.
   */
  validateCandidate?: (candidateIndices: Uint32Array) => string | null;
}

/** Lazily resolve the meshoptimizer simplifier, or `null` if unavailable. */
async function loadSimplifier(): Promise<
  typeof import('meshoptimizer').MeshoptSimplifier | null
> {
  try {
    const { MeshoptSimplifier } = await import('meshoptimizer');
    if (!MeshoptSimplifier.supported) return null;
    await MeshoptSimplifier.ready;
    return MeshoptSimplifier;
  } catch {
    return null;
  }
}

/**
 * Whether border-preserving WASM decimation can run in this environment.
 * Dynamically imports meshoptimizer so the conforming module never statically
 * pulls in the WASM binary.
 */
export async function isConformingDecimationAvailable(): Promise<boolean> {
  return (await loadSimplifier()) !== null;
}

/** Area-weighted vertex pseudo-normals of the input mesh (computed once). */
function accumulateVertexNormals(mesh: MeshData): Float32Array {
  const n = new Float32Array(mesh.vertexCount * 3);
  const v = mesh.vertices;
  const ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const abx = v[b] - v[a], aby = v[b + 1] - v[a + 1], abz = v[b + 2] - v[a + 2];
    const acx = v[c] - v[a], acy = v[c + 1] - v[a + 1], acz = v[c + 2] - v[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const k of [a, b, c]) {
      n[k] += nx;
      n[k + 1] += ny;
      n[k + 2] += nz;
    }
  }
  return n;
}

/**
 * Triangles whose face normal opposes the summed input vertex normals at their
 * corners — the geometric fold-overs combinatorial orient-checking cannot see
 * (meshopt's flip guard is a 75-degree heuristic; flipped output is documented
 * upstream). Delta-gated (`foldedDelta <= 0`) so sharp creases in the INPUT do
 * not poison the gate.
 */
function countFoldedTriangles(
  vertices: Float32Array,
  indices: Uint32Array,
  vertexNormals: Float32Array,
): number {
  let folded = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3, b = indices[t + 1] * 3, c = indices[t + 2] * 3;
    const abx = vertices[b] - vertices[a], aby = vertices[b + 1] - vertices[a + 1], abz = vertices[b + 2] - vertices[a + 2];
    const acx = vertices[c] - vertices[a], acy = vertices[c + 1] - vertices[a + 1], acz = vertices[c + 2] - vertices[a + 2];
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const rx = vertexNormals[a] + vertexNormals[b] + vertexNormals[c];
    const ry = vertexNormals[a + 1] + vertexNormals[b + 1] + vertexNormals[c + 1];
    const rz = vertexNormals[a + 2] + vertexNormals[b + 2] + vertexNormals[c + 2];
    if (nx * rx + ny * ry + nz * rz < 0) folded++;
  }
  return folded;
}

/**
 * Enforce a HARD triangle-budget ceiling on a conforming mesh — quality-bounded.
 *
 * Deterministic absolute-error ladder: rungs double from the clamped seed to
 * the ceiling, each tried plain then with 'Regularize' (the only shape lever in
 * meshoptimizer 1.0.1, still under the same absolute error cap). 'LockBorder'
 * is kept as inert defense only (provably nothing to lock on a closed pot —
 * never relied on). The first candidate that reaches the budget AND passes the
 * full delta gate ships (compacted); otherwise the ORIGINAL mesh ships with a
 * structured refusal. Never throws, never blocks export.
 */
export async function decimateConforming(
  mesh: MeshData,
  options: DecimateConformingOptions,
): Promise<DecimateConformingResult> {
  const { target, validateCandidate } = options;
  const seed = Math.max(options.errorAbsMm, 1e-4); // guards the e*=2 ladder at 0
  const ceiling = Math.max(options.errorCeilingMm ?? 0.2, seed); // seed>ceiling ⇒ single rung
  const report: DecimationReport = {
    applied: false,
    refused: false,
    reason: 'under-budget',
    naturalTriangles: mesh.triangleCount,
    budget: target,
    errorSeedMm: seed,
    errorCeilingMm: ceiling,
    inputDefects: null,
    attempts: [],
  };

  // Already within budget — nothing to do.
  if (mesh.triangleCount <= target || target <= 0) return { mesh, report };

  const simplifier = await loadSimplifier();
  if (!simplifier) {
    report.refused = true;
    report.reason = 'wasm-unavailable';
    return { mesh, report };
  }

  // DELTA-GATE BASELINE: measure the input ONCE. The gate accepts only
  // no-NEW-defects, so a pre-defective input (extreme dims, the Voronoi nm=2
  // carve-out) neither poisons the applied branch forever nor corrupts the
  // refusal taxonomy.
  const inputNormals = accumulateVertexNormals(mesh);
  const inQ = triangleQuality3D(mesh);
  const inT = topologyMetric(mesh, WELD_TOL_MM);
  const inFolded = countFoldedTriangles(mesh.vertices, mesh.indices, inputNormals);
  report.inputDefects = {
    boundaryEdges: inT.boundaryEdges,
    nonManifoldEdges: inT.nonManifoldEdges,
    orientationMismatches: inT.orientationMismatches,
    sliverCount: inQ.sliverCount,
    maxAspect3D: inQ.maxAspect3D,
    foldedTriangles: inFolded,
  };

  const targetIndexCount = Math.max(1, Math.floor(target)) * 3;
  const rungs: number[] = [];
  for (let e = seed; e < ceiling; e *= 2) rungs.push(e);
  rungs.push(ceiling);

  for (const errMm of rungs) {
    for (const regularize of [false, true] as const) {
      const t0 = performance.now();
      const flags: import('meshoptimizer').Flags[] = regularize
        ? ['ErrorAbsolute', 'LockBorder', 'Regularize']
        : ['ErrorAbsolute', 'LockBorder'];
      let newIndices: Uint32Array;
      let resultErrorMm = NaN;
      try {
        // EVERY attempt restarts from the ORIGINAL mesh: plain simplify only
        // re-indexes over the untouched vertex array, so retries are exact and
        // cannot compound, and positions stay analytic BY CONSTRUCTION.
        [newIndices, resultErrorMm] = simplifier.simplify(
          mesh.indices,
          mesh.vertices,
          3, // stride in FLOAT elements for a packed [x,y,z] buffer
          targetIndexCount,
          errMm,
          flags,
        );
      } catch {
        report.refused = true;
        report.reason = 'simplify-threw';
        return { mesh, report };
      }
      const tris = Math.floor(newIndices.length / 3);
      const attempt: DecimationAttempt = {
        errorAbsMm: errMm,
        regularize,
        resultTriangles: tris,
        resultErrorMm,
        reachedBudget: tris > 0 && tris <= target,
        sliverDelta: -1,
        maxAspect3D: -1,
        foldedDelta: -1,
        bndDelta: -1,
        nonManDelta: -1,
        orientDelta: -1,
        externalReject: null,
        elapsedMs: 0,
        passed: false,
      };
      report.attempts.push(attempt);
      if (!attempt.reachedBudget) {
        attempt.elapsedMs = performance.now() - t0;
        continue;
      }

      const view = { vertices: mesh.vertices, indices: newIndices };
      // CHEAP FIRST: shape (the expected common rejection), then folds, then topo.
      const q = triangleQuality3D(view);
      attempt.sliverDelta = q.sliverCount - inQ.sliverCount;
      attempt.maxAspect3D = q.maxAspect3D;
      const shapeOk = attempt.sliverDelta <= 0
        && q.maxAspect3D <= Math.max(inQ.maxAspect3D, ASPECT_MAX);
      if (!shapeOk) {
        attempt.elapsedMs = performance.now() - t0;
        continue;
      }

      attempt.foldedDelta =
        countFoldedTriangles(mesh.vertices, newIndices, inputNormals) - inFolded;
      if (attempt.foldedDelta > 0) {
        attempt.elapsedMs = performance.now() - t0;
        continue;
      }

      const topo = topologyMetric(view, WELD_TOL_MM);
      attempt.bndDelta = topo.boundaryEdges - inT.boundaryEdges;
      attempt.nonManDelta = topo.nonManifoldEdges - inT.nonManifoldEdges;
      attempt.orientDelta = topo.orientationMismatches - inT.orientationMismatches;
      if (attempt.bndDelta > 0 || attempt.nonManDelta > 0 || attempt.orientDelta > 0) {
        attempt.elapsedMs = performance.now() - t0;
        continue;
      }

      attempt.externalReject = validateCandidate?.(newIndices) ?? null;
      if (attempt.externalReject !== null) {
        attempt.elapsedMs = performance.now() - t0;
        continue;
      }

      attempt.passed = true;
      attempt.elapsedMs = performance.now() - t0;
      report.applied = true;
      report.reason = 'accepted';
      report.acceptedIndices = newIndices;
      const simplified: MeshData = {
        vertices: mesh.vertices,
        indices: newIndices,
        vertexCount: mesh.vertexCount,
        triangleCount: tris,
      };
      // simplify keeps the original vertex array and removes triangles; compact
      // away the orphaned vertices so the output is a clean, self-contained
      // MeshData. The dynamic import keeps the never-throws contract.
      try {
        const { compactMesh } = await import('../../../../geometry/meshDecimator');
        return { mesh: compactMesh(simplified), report };
      } catch {
        return { mesh: simplified, report }; // uncompacted but valid — never throws
      }
    }
  }

  report.refused = true;
  report.reason = report.attempts.some((a) => a.reachedBudget)
    ? 'no-quality-safe-point'
    : 'budget-unreachable-within-error';
  return { mesh, report };
}
