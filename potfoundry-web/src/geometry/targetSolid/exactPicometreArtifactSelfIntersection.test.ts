import { describe, expect, it } from 'vitest';

import { exportTo3MF } from '../exporters/export3MF';
import type { MeshData } from '../types';
import {
  assessExactPicometreArtifactSelfIntersections,
  ExactPicometreSelfIntersectionError,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
  HARD_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
} from './exactPicometreArtifactSelfIntersection';
import { parseThreeMfArtifact } from './threeMfArtifact';

async function parsed(vertices: number[], indices: number[]) {
  const mesh: MeshData = {
    vertices: Float32Array.from(vertices),
    indices: Uint32Array.from(indices),
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
  const blob = await exportTo3MF(mesh, { name: 'Exact embeddedness' });
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
  return parseThreeMfArtifact(bytes);
}

const TETRA_VERTICES = [
  0, 0, 0,
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];
const TETRA_INDICES = [
  0, 2, 1,
  0, 1, 3,
  0, 3, 2,
  1, 2, 3,
];

describe('exact integer-picometre artifact self-intersection', () => {
  it('completes an intersection-free scan for a closed tetrahedron', async () => {
    const result = assessExactPicometreArtifactSelfIntersections(
      await parsed(TETRA_VERTICES, TETRA_INDICES)
    );
    expect(result.scanComplete).toBe(true);
    expect(result.selfIntersectionFree).toBe(true);
    expect(result.intersectionPairCountLowerBound).toBe(0);
    expect(result.candidatePairCount).toBeGreaterThan(0);
    expect(result.buildWorkCount).toBeGreaterThan(0);
  });

  it('finds a proper piercing and allows exact separation', async () => {
    const intersecting = await parsed([
      0, 0, 0,
      4, 0, 0,
      0, 4, 0,
      1, 1, -2,
      1, 1, 2,
      1, 4, 0,
    ], [0, 1, 2, 3, 4, 5]);
    const found = assessExactPicometreArtifactSelfIntersections(intersecting);
    expect(found.scanComplete).toBe(true);
    expect(found.selfIntersectionFree).toBe(false);
    expect(found.intersectionPairCountLowerBound).toBe(1);
    expect(found.samplePairs).toEqual([[0, 1]]);

    const separated = await parsed([
      0, 0, 0,
      2, 0, 0,
      0, 2, 0,
      0, 0, 1,
      2, 0, 1,
      0, 2, 1,
    ], [0, 1, 2, 3, 4, 5]);
    expect(assessExactPicometreArtifactSelfIntersections(separated).selfIntersectionFree).toBe(true);
  });

  it('refuses degeneracy, resource exhaustion, cancellation, and accessor options', async () => {
    const degenerate = await parsed([
      0, 0, 0,
      1, 0, 0,
      2, 0, 0,
    ], [0, 1, 2]);
    expect(() => assessExactPicometreArtifactSelfIntersections(degenerate)).toThrow(/degenerate/i);

    const tetra = await parsed(TETRA_VERTICES, TETRA_INDICES);
    expect(() => assessExactPicometreArtifactSelfIntersections(tetra, { maxBvhBytes: 1 }))
      .toThrow(ExactPicometreSelfIntersectionError);
    const cancellationFlag = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
    Atomics.store(cancellationFlag, 0, 1);
    expect(() => assessExactPicometreArtifactSelfIntersections(tetra, { cancellationFlag }))
      .toThrow(/cancelled/i);

    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'leafSize', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 8;
      },
    });
    expect(() => assessExactPicometreArtifactSelfIntersections(tetra, accessor))
      .toThrow(/data property/i);
    expect(getterCalls).toBe(0);

    for (const options of [
      { maxBvhBytes: HARD_EXACT_PM_SELF_INTERSECTION_MAX_BVH_BYTES + 1 },
      { maxBuildWork: HARD_EXACT_PM_SELF_INTERSECTION_MAX_BUILD_WORK + 1 },
      {
        maxTraversalVisits:
          HARD_EXACT_PM_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS + 1,
      },
      {
        maxBroadPhasePairChecks:
          HARD_EXACT_PM_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS + 1,
      },
      {
        maxCandidatePairs:
          HARD_EXACT_PM_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS + 1,
      },
    ]) {
      expect(() => assessExactPicometreArtifactSelfIntersections(tetra, options)).toThrow(
        ExactPicometreSelfIntersectionError
      );
    }
  });
});
