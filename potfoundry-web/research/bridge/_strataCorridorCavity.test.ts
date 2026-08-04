import { describe, expect, it } from 'vitest';
import {
  planAtomicCorridorCavity,
  type CorridorCavityCallbacks,
  type CorridorCavityMesh,
  type CorridorCavityOptions,
  type CorridorTriangle,
  type CorridorVertex,
} from './_strataCorridorCavity';

const R_REF = 10;

function makeVertex(chartX: number, chartZ: number): CorridorVertex {
  return { theta: chartX / R_REF, z: chartZ, x: chartX, y: 0 };
}

function gridVertex(x: number, z: number): number {
  return z * 4 + x;
}

function makeMesh(twoFeatures = false, acuteJunction = false): { mesh: CorridorCavityMesh; seed: number } {
  const vertices: CorridorVertex[] = [];
  for (let z = 0; z < 4; z += 1) for (let x = 0; x < 4; x += 1) vertices.push(makeVertex(x, z));
  const needle = vertices.length;
  const centre = twoFeatures && !acuteJunction ? 1.5 : 1.01;
  vertices.push(makeVertex(centre, centre));
  const triangles: CorridorTriangle[] = [];
  let seed = -1;
  for (let z = 0; z < 3; z += 1) for (let x = 0; x < 3; x += 1) {
    const a = gridVertex(x, z);
    const b = gridVertex(x + 1, z);
    const c = gridVertex(x + 1, z + 1);
    const d = gridVertex(x, z + 1);
    if (x === 1 && z === 1) {
      seed = triangles.length;
      triangles.push(
        { v: [a, b, needle] },
        { v: [b, c, needle] },
        { v: [c, d, needle] },
        { v: [d, a, needle] },
      );
    } else {
      triangles.push({ v: [a, b, c] }, { v: [a, c, d] });
    }
  }
  const constraints = twoFeatures ? [
    { id: 'branch-east', vertices: [needle, gridVertex(2, 1)] },
    { id: 'branch-north', vertices: [needle, gridVertex(2, 2)] },
    { id: 'branch-west', vertices: [needle, gridVertex(1, 2)] },
    { id: 'branch-south', vertices: [needle, gridVertex(1, 1)] },
  ] : [{
    id: 'vertical',
    vertices: [gridVertex(2, 0), gridVertex(2, 1), gridVertex(2, 2), gridVertex(2, 3)],
  }];
  return { mesh: { vertices, triangles, constraints }, seed };
}

const callbacks: CorridorCavityCallbacks = {
  canonTheta: (theta) => theta,
  deltaTheta: (from, to) => to - from,
  lift: (theta, z) => makeVertex(theta * R_REF, z),
  admitted: () => true,
  visualError: () => 0,
};

const options: CorridorCavityOptions = {
  rings: 2,
  maxParents: 64,
  maxNewVertices: 256,
  maxLongestEdgeSplits: 64,
  rRefMm: R_REF,
  hardAr: 50,
  preferredAr: 45,
  weldMm: 1e-6,
  visualThresholdMm: 0.01,
  minimumVisualGain: 0,
  targetEdgeScales: [1, 0.75, 0.5],
};

describe('atomic Strata feature-corridor cavity', () => {
  it('removes an interior needle while preserving the frozen boundary and named feature', () => {
    const { mesh, seed } = makeMesh();
    const before = JSON.stringify(mesh);
    const result = planAtomicCorridorCavity(mesh, [seed], options, callbacks);

    expect(result.accepted).toBe(true);
    expect(result.proposal).toBeDefined();
    expect(result.proposal?.certificate.boundaryUnchanged).toBe(true);
    expect(result.proposal?.certificate.oldEuler).toBe(result.proposal?.certificate.newEuler);
    expect(result.proposal?.certificate.constraintObligations).toBe(1);
    expect(result.proposal?.certificate.recoveredConstraintObligations).toBe(1);
    expect(result.proposal?.certificate.missingConstraintEdges).toBe(0);
    expect(result.proposal?.certificate.properCrossings).toBe(0);
    expect(result.proposal?.certificate.nonManifoldEdges).toBe(0);
    expect(result.proposal?.certificate.newWorstAr).toBeLessThanOrEqual(50);
    expect(result.proposal?.addTriangles.length).toBeGreaterThan(0);
    expect(JSON.stringify(mesh)).toBe(before);
  });

  it('planarizes a feature junction into shared topology and recovers every identity', () => {
    const { mesh, seed } = makeMesh(true);
    const result = planAtomicCorridorCavity(mesh, [seed], options, callbacks);

    expect(result.accepted, JSON.stringify({ refusal: result.refusal, attempts: result.attempts })).toBe(true);
    expect(result.proposal?.certificate.constraintObligations).toBe(4);
    expect(result.proposal?.certificate.recoveredConstraintObligations).toBe(4);
    expect(result.proposal?.certificate.missingConstraintEdges).toBe(0);
    expect(result.proposal?.certificate.properCrossings).toBe(0);
    const chains = result.proposal?.featureChains ?? [];
    expect(chains).toHaveLength(4);
    const common = chains[0].vertices.filter((vertex) => chains.slice(1)
      .every((chain) => chain.vertices.includes(vertex)));
    expect(common).toHaveLength(1);
  });

  it('returns an exact infeasibility witness for an acute feature sector', () => {
    const { mesh, seed } = makeMesh(true, true);
    const before = JSON.stringify(mesh);
    const result = planAtomicCorridorCavity(mesh, [seed], options, callbacks);

    expect(result.accepted).toBe(false);
    expect(result.refusal).toBe('longest-edge-cap');
    expect(result.attempts.every((attempt) => attempt.refusal === 'longest-edge-cap')).toBe(true);
    expect(result.proposal).toBeUndefined();
    expect(JSON.stringify(mesh)).toBe(before);
  });

  it('is deterministic under identical inputs', () => {
    const { mesh, seed } = makeMesh(true);
    const first = planAtomicCorridorCavity(mesh, [seed], options, callbacks);
    const second = planAtomicCorridorCavity(mesh, [seed], options, callbacks);

    expect(first.proposal?.certificate.deterministicHash).toBe(second.proposal?.certificate.deterministicHash);
    expect(first.proposal?.addTriangles).toEqual(second.proposal?.addTriangles);
    expect(first.proposal?.featureChains).toEqual(second.proposal?.featureChains);
  });

  it('rolls back exactly when longest-edge closure cannot satisfy the hard cap', () => {
    const { mesh, seed } = makeMesh();
    const before = JSON.stringify(mesh);
    const result = planAtomicCorridorCavity(mesh, [seed], {
      ...options,
      hardAr: 1,
      preferredAr: 1,
      maxLongestEdgeSplits: 0,
      targetEdgeScales: [1],
    }, callbacks);

    expect(result.accepted).toBe(false);
    expect(result.refusal).toBe('longest-edge-cap');
    expect(result.proposal).toBeUndefined();
    expect(JSON.stringify(mesh)).toBe(before);
  });
});
