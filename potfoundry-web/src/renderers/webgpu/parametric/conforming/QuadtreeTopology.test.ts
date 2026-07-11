import { describe, expect, it } from 'vitest';
import type { QuadLeaf } from './PeriodicBalancedQuadtree';
import type { FeatureLine } from './FeatureLineGraph';
import { triangulateQuadtreeWithFeatures } from './FeatureConformingTriangulator';
import {
  triangulateQuadtree,
  type QuadtreeLike,
  type QuadtreeMesh,
} from './QuadtreeTriangulator';
import {
  buildQuadtreeTopology,
  QUAD_SIDE,
  topologyEdgePoints,
  topologySideNeighbours,
} from './QuadtreeTopology';

function treeOf(leaves: QuadLeaf[], uBias = 0): QuadtreeLike {
  return { leaves: () => leaves, uBias: () => uBias };
}

function expectExactMesh(actual: QuadtreeMesh, expected: QuadtreeMesh): void {
  expect(actual.vertices).toEqual(expected.vertices);
  expect(actual.indices).toEqual(expected.indices);
  expect(actual.seamTriangles).toEqual(expected.seamTriangles);
  expect(actual.triangleSource).toEqual(expected.triangleSource);
}

describe('QuadtreeTopology', () => {
  it('builds a 16K-cell uniform row without quadratic full-line scans', () => {
    const level = 14;
    const count = 1 << level;
    const leaves: QuadLeaf[] = Array.from({ length: count }, (_, iu) => ({
      u0: iu / count,
      t0: 0,
      level,
      iu,
      it: 0,
      uExtra: 0,
    }));
    const start = performance.now();
    const topology = buildQuadtreeTopology(leaves, 0, { includeAdjacency: true });
    const elapsedMs = performance.now() - start;
    expect(topology.edgePointOffsets[topology.edgePointOffsets.length - 1]).toBe(0);
    expect(topology.sideNeighbourOffsets).toHaveLength(count * 4 + 1);
    expect(topology.sideNeighbourIndices).toHaveLength(count * 2);
    // The removed implementation performed >500M full-line candidate checks.
    expect(elapsedMs).toBeLessThan(2000);
  }, 5000);

  it('stores exact sorted QSCALE edge slices, including periodic seam unwrapping', () => {
    const leaves: QuadLeaf[] = [];
    for (let iu = 0; iu < 8; iu++) {
      leaves.push({ u0: iu / 8, t0: 0, level: 1, iu, it: 0, uExtra: 2 });
    }
    leaves.push({ u0: 0, t0: 0.5, level: 1, iu: 0, it: 1, uExtra: 0 });
    leaves.push({ u0: 0.5, t0: 0.5, level: 1, iu: 1, it: 1, uExtra: 0 });

    const topology = buildQuadtreeTopology(leaves, 0, { includeAdjacency: true });
    expect(Array.from(topologyEdgePoints(topology, 8, QUAD_SIDE.SOUTH))).toEqual([
      0.125, 0.25, 0.375,
    ]);
    expect(Array.from(topologyEdgePoints(topology, 9, QUAD_SIDE.SOUTH))).toEqual([
      0.625, 0.75, 0.875,
    ]);
    for (let slot = 0; slot < leaves.length * 4; slot++) {
      expect(topology.edgePointOffsets[slot]).toBeLessThanOrEqual(topology.edgePointOffsets[slot + 1]);
    }
  });

  it('is byte-identical to the legacy oracle for mixed levels and the seam', () => {
    const leaves: QuadLeaf[] = [
      { u0: 0, t0: 0, level: 2 },
      { u0: 0.25, t0: 0, level: 2 },
      { u0: 0, t0: 0.25, level: 2 },
      { u0: 0.25, t0: 0.25, level: 2 },
      { u0: 0.5, t0: 0, level: 1 },
      { u0: 0, t0: 0.5, level: 1 },
      { u0: 0.5, t0: 0.5, level: 1 },
    ];
    const tree = treeOf(leaves);
    const topology = buildQuadtreeTopology(leaves, 0, { includeAdjacency: true });
    expect(Array.from(topologySideNeighbours(topology, 4, QUAD_SIDE.WEST))).toEqual([1, 3]);
    expect(Array.from(topologySideNeighbours(topology, 4, QUAD_SIDE.NORTH))).toEqual([6]);
    expect(Array.from(topologySideNeighbours(topology, 6, QUAD_SIDE.EAST))).toEqual([5]);
    expect(Array.from(topologySideNeighbours(topology, 0, QUAD_SIDE.WEST))).toEqual([4]);
    expect(topology.sideNeighbourOffsets).toHaveLength(leaves.length * 4 + 1);
    expectExactMesh(triangulateQuadtree(tree), triangulateQuadtree(tree, { legacyTopology: true }));
    const feature: FeatureLine = {
      kind: 'general-curve',
      label: 'mixed-level-parity',
      points: [{ u: 0.1, t: 0.1 }, { u: 0.8, t: 0.9 }],
    };
    const actual = triangulateQuadtreeWithFeatures(tree, [feature]);
    const legacy = triangulateQuadtreeWithFeatures(tree, [feature], { legacyTopology: true });
    expectExactMesh(actual, legacy);
    expect(actual.cdtStats).toEqual(legacy.cdtStats);
  });

  it('is byte-identical to the legacy oracle for directional N-mid transitions', () => {
    const leaves: QuadLeaf[] = [];
    for (let iu = 0; iu < 8; iu++) {
      leaves.push({ u0: iu / 8, t0: 0, level: 1, iu, it: 0, uExtra: 2 });
    }
    for (let iu = 0; iu < 2; iu++) {
      leaves.push({ u0: iu / 2, t0: 0.5, level: 1, iu, it: 1, uExtra: 0 });
    }
    const tree = treeOf(leaves);
    expectExactMesh(triangulateQuadtree(tree), triangulateQuadtree(tree, { legacyTopology: true }));
    const feature: FeatureLine = {
      kind: 'vertical-crease',
      label: 'topology-parity',
      points: Array.from({ length: 17 }, (_, index) => ({ u: 0.2, t: index / 16 })),
    };
    const actual = triangulateQuadtreeWithFeatures(tree, [feature]);
    const legacy = triangulateQuadtreeWithFeatures(tree, [feature], { legacyTopology: true });
    expectExactMesh(actual, legacy);
    expect(actual.cdtStats).toEqual(legacy.cdtStats);
  });

  it('is byte-identical to the legacy oracle with a global u-bias', () => {
    const leaves: QuadLeaf[] = [];
    for (let it = 0; it < 2; it++) {
      for (let iu = 0; iu < 8; iu++) {
        leaves.push({ u0: iu / 8, t0: it / 2, level: 1, iu, it, uExtra: 0 });
      }
    }
    const tree = treeOf(leaves, 2);
    expectExactMesh(triangulateQuadtree(tree), triangulateQuadtree(tree, { legacyTopology: true }));
  });
});
