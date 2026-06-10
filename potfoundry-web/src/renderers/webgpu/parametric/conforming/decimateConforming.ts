/**
 * Hard triangle-budget ceiling for the conforming export path.
 *
 * The conforming mesher's sizing field treats its triangle budget as a SOFT
 * guide (it only removes over-refinement and never coarsens below the sag-
 * required mesh), and `ConformingWall.MAX_BUDGET_SCALE=4` cannot bound the
 * sliver explosion at extreme dimensions. `decimateConforming` turns the budget
 * into a HARD ceiling: when the assembled mesh exceeds `target`, it runs a
 * border-locking meshoptimizer simplification (the same `lockBorders:true` /
 * `'LockBorder'` flag the legacy GPU-grid export uses in `ExportComputer`) so
 * the output triangle count is `<= target` while the watertight/oriented
 * surface survives.
 *
 * meshoptimizer is a lazy-loaded WASM module. It is dynamically imported so a
 * missing/unsupported WASM runtime degrades to a no-op (the original mesh) and
 * `isConformingDecimationAvailable()` lets callers/tests detect that up front,
 * rather than throwing inside the hot export path.
 *
 * NOTE on stride: the meshoptimizer JS binding takes `vertex_positions_stride`
 * in FLOAT elements, not bytes (it asserts `positions.length % stride === 0`),
 * so the correct value for a packed `[x,y,z]` buffer is 3. (The legacy
 * `meshDecimator.decimateMesh` hardcodes 12, which only happens to satisfy that
 * assertion when the vertex count is divisible by 4 — conforming meshes are
 * not, so we call `simplify` directly here and reuse only `compactMesh`.)
 */

import type { MeshData } from '../../../../geometry/types';

/** Options for the conforming hard-budget decimation. */
export interface DecimateConformingOptions {
  /**
   * Maximum allowed triangle count. When `mesh.triangleCount <= target` the
   * call is a no-op (returns the input mesh unchanged).
   */
  target: number;
  /**
   * Geometric error budget passed to meshoptimizer, as a fraction of the mesh
   * bounding-box diagonal. Defaults to 1% (matches the legacy export path).
   */
  errorThreshold?: number;
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

/** Bounding-box diagonal length, used to scale the relative error budget. */
function boundingBoxDiagonal(vertices: Float32Array, vertexCount: number): number {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const x = vertices[i * 3];
    const y = vertices[i * 3 + 1];
    const z = vertices[i * 3 + 2];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2 + (maxZ - minZ) ** 2);
}

/**
 * Enforce a HARD triangle-budget ceiling on a conforming mesh.
 *
 * - No-op (returns the same `MeshData` reference) when already at/under target.
 * - Otherwise runs meshoptimizer `simplify` with the `'LockBorder'` flag to drop
 *   the triangle count to `<= target`, preserving boundary vertices and (for a
 *   closed mesh) watertightness, then compacts away the now-unused vertices.
 * - Degrades to a no-op (returns the original mesh) if the WASM module is
 *   unavailable or simplification fails — never throws, never blocks export.
 */
export async function decimateConforming(
  mesh: MeshData,
  options: DecimateConformingOptions,
): Promise<MeshData> {
  const { target, errorThreshold = 0.01 } = options;

  // Already within budget — nothing to do.
  if (mesh.triangleCount <= target || target <= 0) {
    return mesh;
  }

  const simplifier = await loadSimplifier();
  if (!simplifier) return mesh;

  // Absolute triangle ceiling → meshoptimizer target index count (multiple of
  // 3, never below a single triangle).
  const targetTriangles = Math.max(1, Math.floor(target));
  const targetIndexCount = targetTriangles * 3;

  const diagonal = boundingBoxDiagonal(mesh.vertices, mesh.vertexCount);
  const scaledError = errorThreshold * (diagonal > 0 ? diagonal : 1);

  let newIndices: Uint32Array;
  try {
    [newIndices] = simplifier.simplify(
      mesh.indices,
      mesh.vertices,
      3, // stride in FLOAT elements for a packed [x,y,z] buffer
      targetIndexCount,
      scaledError,
      ['LockBorder'],
    );
  } catch {
    // Keep the watertight original rather than risk a partial result.
    return mesh;
  }

  const newTriangleCount = Math.floor(newIndices.length / 3);
  if (newTriangleCount <= 0 || newTriangleCount > target) {
    return mesh;
  }

  // simplify keeps the original vertex array and removes triangles; compact away
  // the orphaned vertices so the output is a clean, self-contained MeshData.
  const simplified: MeshData = {
    vertices: mesh.vertices,
    indices: newIndices,
    vertexCount: mesh.vertexCount,
    triangleCount: newTriangleCount,
  };

  try {
    const { compactMesh } = await import('../../../../geometry/meshDecimator');
    return compactMesh(simplified);
  } catch {
    return simplified;
  }
}
