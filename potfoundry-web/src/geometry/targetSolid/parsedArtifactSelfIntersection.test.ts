import { describe, expect, it } from 'vitest';
import { generateBinarySTL } from '../stlExport';
import type { MeshData } from '../types';
import { parseBinaryStlArtifact } from './binaryStlArtifact';
import type { ParsedBinaryStlArtifact } from './binaryStlArtifact';
import { trianglesHaveForbiddenIntersection } from './exactTriangleIntersection';
import {
  assessParsedArtifactSelfIntersections,
  HARD_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS,
  HARD_SELF_INTERSECTION_MAX_BUILD_WORK,
  HARD_SELF_INTERSECTION_MAX_BVH_BYTES,
  HARD_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS,
  HARD_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS,
  ParsedSelfIntersectionError,
} from './parsedArtifactSelfIntersection';

function mesh(vertices: number[], indices: number[]): MeshData {
  return {
    vertices: Float32Array.from(vertices),
    indices: Uint32Array.from(indices),
    vertexCount: vertices.length / 3,
    triangleCount: indices.length / 3,
  };
}

function artifact(source: MeshData): ParsedBinaryStlArtifact {
  return parseBinaryStlArtifact(generateBinarySTL(source));
}

function caughtCode(action: () => unknown): string | undefined {
  try {
    action();
    return undefined;
  } catch (error) {
    expect(error).toBeInstanceOf(ParsedSelfIntersectionError);
    return (error as ParsedSelfIntersectionError).code;
  }
}

function bruteIntersectionCount(source: ParsedBinaryStlArtifact): number {
  const first = new Float64Array(9);
  const second = new Float64Array(9);
  let count = 0;
  for (let firstIndex = 0; firstIndex < source.triangleCount; firstIndex += 1) {
    source.readTriangle(firstIndex, first);
    for (let secondIndex = firstIndex + 1; secondIndex < source.triangleCount; secondIndex += 1) {
      source.readTriangle(secondIndex, second);
      if (trianglesHaveForbiddenIntersection(first, second)) count += 1;
    }
  }
  return count;
}

function bruteAabbCandidateCount(source: ParsedBinaryStlArtifact): number {
  const bounds: number[][] = [];
  const triangle = new Float64Array(9);
  for (let triangleIndex = 0; triangleIndex < source.triangleCount; triangleIndex += 1) {
    source.readTriangle(triangleIndex, triangle);
    bounds.push([
      Math.min(triangle[0], triangle[3], triangle[6]),
      Math.min(triangle[1], triangle[4], triangle[7]),
      Math.min(triangle[2], triangle[5], triangle[8]),
      Math.max(triangle[0], triangle[3], triangle[6]),
      Math.max(triangle[1], triangle[4], triangle[7]),
      Math.max(triangle[2], triangle[5], triangle[8]),
    ]);
  }
  let count = 0;
  for (let first = 0; first < bounds.length; first += 1) {
    for (let second = first + 1; second < bounds.length; second += 1) {
      const a = bounds[first];
      const b = bounds[second];
      if (
        !(a[0] > b[3] || a[3] < b[0] || a[1] > b[4] || a[4] < b[1] || a[2] > b[5] || a[5] < b[2])
      ) {
        count += 1;
      }
    }
  }
  return count;
}

const TETRAHEDRON = mesh(
  [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
  [0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]
);

function cleanCylinder(thetaCount: number, heightCount: number): MeshData {
  const vertices: number[] = [];
  for (let height = 0; height <= heightCount; height += 1) {
    for (let theta = 0; theta < thetaCount; theta += 1) {
      const angle = (theta / thetaCount) * Math.PI * 2;
      vertices.push(Math.cos(angle) * 5, Math.sin(angle) * 5, height);
    }
  }
  const indices: number[] = [];
  const index = (height: number, theta: number): number =>
    height * thetaCount + (theta % thetaCount);
  for (let height = 0; height < heightCount; height += 1) {
    for (let theta = 0; theta < thetaCount; theta += 1) {
      const lower0 = index(height, theta);
      const lower1 = index(height, theta + 1);
      const upper0 = index(height + 1, theta);
      const upper1 = index(height + 1, theta + 1);
      indices.push(lower0, lower1, upper1, lower0, upper1, upper0);
    }
  }
  return mesh(vertices, indices);
}

describe('assessParsedArtifactSelfIntersections', () => {
  it('completes a clear proof for a clean tetrahedron and binds final artifact hashes', () => {
    const source = artifact(TETRAHEDRON);
    const result = assessParsedArtifactSelfIntersections(source);
    expect(result).toMatchObject({
      triangleCount: 4,
      intersectionPairCountLowerBound: 0,
      scanComplete: true,
      selfIntersectionFree: true,
      samplePairs: [],
      artifactByteSha256: source.byteSha256,
      parsedArtifactSha256: source.parsedArtifactSha256,
      parsedTriangleSetSha256: source.parsedTriangleSetSha256,
    });
    expect(result.proofMethodSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.narrowPhaseProofSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('finds a proper final-facet piercing and can stop with an honest lower bound', () => {
    const source = artifact(
      mesh([0, 0, 0, 2, 0, 0, 0, 2, 0, 0.5, 0.5, -1, 0.5, 0.5, 1, 0.5, 2, 0], [0, 1, 2, 3, 4, 5])
    );
    const result = assessParsedArtifactSelfIntersections(source, { maxFoundPairs: 1 });
    expect(result.intersectionPairCountLowerBound).toBe(1);
    expect(result.scanComplete).toBe(false);
    expect(result.selfIntersectionFree).toBe(false);
    expect(result.samplePairs).toHaveLength(1);
  });

  it('does not flag legitimate exact shared edges and vertices on a 9k-facet cylinder', () => {
    const source = artifact(cleanCylinder(96, 48));
    const result = assessParsedArtifactSelfIntersections(source);
    expect(result.scanComplete).toBe(true);
    expect(result.selfIntersectionFree).toBe(true);
    expect(result.intersectionPairCountLowerBound).toBe(0);
    expect(result.candidatePairCount).toBeLessThan(source.triangleCount * 64);
    expect(result.broadPhasePairCheckCount).toBeLessThan(source.triangleCount * 128);
  });

  it('keeps a robustly nondegenerate near-singular projection clear through final STL parsing', () => {
    const m = 2 ** -48;
    const source = artifact(
      mesh([0, m, 3 * m, m, 40, 120, 0, 0, 0, 0, -m, -3 * m, -m, -40, -120], [0, 1, 2, 3, 4, 2])
    );
    const result = assessParsedArtifactSelfIntersections(source);
    expect(result.scanComplete).toBe(true);
    expect(result.intersectionPairCountLowerBound).toBe(0);
    expect(result.selfIntersectionFree).toBe(true);
  });

  it('detects coplanar T-junction contact as an unintended intersection', () => {
    const source = artifact(
      mesh([0, 0, 0, 2, 0, 0, 0, 2, 0, 1, 0, 0, 2, -1, 0, 0, -1, 0], [0, 1, 2, 3, 4, 5])
    );
    const result = assessParsedArtifactSelfIntersections(source);
    expect(result.scanComplete).toBe(true);
    expect(result.intersectionPairCountLowerBound).toBe(1);
    expect(result.selfIntersectionFree).toBe(false);
  });

  it('matches independent exhaustive AABB counts across deterministic small triangle soups', () => {
    let state = 0xc0ff_ee12;
    const random = (): number => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      return state;
    };
    const vertices: number[] = [];
    for (let value = 1; value <= 10; value += 1) {
      vertices.push(value, value * value, value * value * value);
    }
    for (let fixture = 0; fixture < 24; fixture += 1) {
      const indices: number[] = [];
      for (let triangle = 0; triangle < 10; triangle += 1) {
        const first = random() % 10;
        let second = random() % 10;
        let third = random() % 10;
        while (second === first) second = random() % 10;
        while (third === first || third === second) third = random() % 10;
        indices.push(first, second, third);
      }
      const source = artifact(mesh(vertices, indices));
      const expectedCandidates = bruteAabbCandidateCount(source);
      const expected = bruteIntersectionCount(source);
      const result = assessParsedArtifactSelfIntersections(source, { maxFoundPairs: 1000 });
      expect(result.scanComplete, `fixture ${fixture}`).toBe(true);
      expect(result.candidatePairCount, `fixture ${fixture}`).toBe(expectedCandidates);
      expect(result.intersectionPairCountLowerBound, `fixture ${fixture}`).toBe(expected);
      expect(result.selfIntersectionFree, `fixture ${fixture}`).toBe(expected === 0);
    }
  });

  it('enumerates tied centroids completely for every supported leaf partition shape', () => {
    const triangleCount = 10;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index < triangleCount; index += 1) {
      vertices.push(-1, -1, 0, 1, -1, 0, 0, 2, 0);
      indices.push(index * 3, index * 3 + 1, index * 3 + 2);
    }
    const source = artifact(mesh(vertices, indices));
    const expectedPairs = (triangleCount * (triangleCount - 1)) / 2;
    for (const leafSize of [1, 2, 3, 8, 64]) {
      const result = assessParsedArtifactSelfIntersections(source, {
        leafSize,
        maxFoundPairs: 100,
      });
      expect(result.scanComplete, `leafSize ${leafSize}`).toBe(true);
      expect(result.candidatePairCount, `leafSize ${leafSize}`).toBe(expectedPairs);
      expect(result.intersectionPairCountLowerBound, `leafSize ${leafSize}`).toBe(expectedPairs);
    }
  });

  it('bounds pair checks before AABB rejection on long-span disjoint triangles', () => {
    const vertices: number[] = [];
    const indices: number[] = [];
    for (let index = 0; index < 64; index += 1) {
      const y = index * 2;
      vertices.push(-1000, y, 0, 1000, y + 0.25, 0, -999, y + 0.5, 0);
      indices.push(index * 3, index * 3 + 1, index * 3 + 2);
    }
    const source = artifact(mesh(vertices, indices));
    expect(bruteAabbCandidateCount(source)).toBe(0);
    expect(
      caughtCode(() =>
        assessParsedArtifactSelfIntersections(source, {
          leafSize: 64,
          maxBroadPhasePairChecks: 10,
        })
      )
    ).toBe('RESOURCE_LIMIT');
  });

  it('fails closed on degeneracy, memory, candidates, and cancellation', () => {
    const clean = artifact(TETRAHEDRON);
    expect(caughtCode(() => assessParsedArtifactSelfIntersections(clean, { maxBvhBytes: 1 }))).toBe(
      'RESOURCE_LIMIT'
    );
    expect(
      caughtCode(() =>
        assessParsedArtifactSelfIntersections(clean, { leafSize: 1, maxTraversalVisits: 1 })
      )
    ).toBe('RESOURCE_LIMIT');
    expect(
      caughtCode(() => assessParsedArtifactSelfIntersections(clean, { maxBroadPhasePairChecks: 1 }))
    ).toBe('RESOURCE_LIMIT');
    expect(
      caughtCode(() => assessParsedArtifactSelfIntersections(clean, { maxCandidatePairs: 1 }))
    ).toBe('RESOURCE_LIMIT');

    const cancellationFlag = new Int32Array(new SharedArrayBuffer(4));
    Atomics.store(cancellationFlag, 0, 1);
    expect(
      caughtCode(() => assessParsedArtifactSelfIntersections(clean, { cancellationFlag }))
    ).toBe('CANCELLED');

    const degenerate = artifact(mesh([0, 0, 0, 1, 0, 0, 2, 0, 0], [0, 1, 2]));
    expect(caughtCode(() => assessParsedArtifactSelfIntersections(degenerate))).toBe(
      'DEGENERATE_TRIANGLE'
    );

    for (const options of [
      { maxBvhBytes: HARD_SELF_INTERSECTION_MAX_BVH_BYTES + 1 },
      { maxBuildWork: HARD_SELF_INTERSECTION_MAX_BUILD_WORK + 1 },
      { maxTraversalVisits: HARD_SELF_INTERSECTION_MAX_TRAVERSAL_VISITS + 1 },
      {
        maxBroadPhasePairChecks:
          HARD_SELF_INTERSECTION_MAX_BROAD_PHASE_PAIR_CHECKS + 1,
      },
      { maxCandidatePairs: HARD_SELF_INTERSECTION_MAX_CANDIDATE_PAIRS + 1 },
    ]) {
      expect(caughtCode(() => assessParsedArtifactSelfIntersections(clean, options))).toBe(
        'RESOURCE_LIMIT'
      );
    }
  });
});
