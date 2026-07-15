import { describe, expect, it } from 'vitest';

import { generateBinarySTL } from '../stlExport';
import type { MeshData } from '../types';
import {
  createFinalArtifactProofSession,
  type FinalArtifactProofSession,
} from './finalArtifactProofSession';
import { assessProofSessionStructuralIntegrity } from './proofSessionStructuralIntegrity';

const tetrahedron: MeshData = {
  vertices: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: Uint32Array.from([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
  vertexCount: 4,
  triangleCount: 4,
};

describe('assessProofSessionStructuralIntegrity', () => {
  it('executes complete topology and embeddedness checks over the authenticated session', () => {
    const session = createFinalArtifactProofSession(generateBinarySTL(tetrahedron));
    const result = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 0,
    });

    expect(result.structurallyValid).toBe(true);
    expect(Object.values(result.checks)).toEqual(new Array(9).fill(true));
    expect(result.topology.volumeSign).toBe('positive-proven');
    expect(result.selfIntersection.selfIntersectionFree).toBe(true);
    expect(result.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.configuredByteCeiling).toBeLessThanOrEqual(768 * 1024 * 1024);
    expect(result.structuralWorkUnitCount).toBeGreaterThan(0);
  });

  it('fails a topology mismatch without weakening measured artifact facts', () => {
    const session = createFinalArtifactProofSession(generateBinarySTL(tetrahedron));
    const result = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });

    expect(result.topology.genus).toBe(0);
    expect(result.checks.genusMatches).toBe(false);
    expect(result.structurallyValid).toBe(false);
  });

  it('rejects a structural lookalike session that never passed the parser boundary', () => {
    const genuine = createFinalArtifactProofSession(generateBinarySTL(tetrahedron));
    const forged = Object.freeze({ ...genuine }) as FinalArtifactProofSession;

    expect(() =>
      assessProofSessionStructuralIntegrity(forged, { componentCount: 1, genus: 0 })
    ).toThrow(/not minted/);
  });

  it('never reports an outer complete scan when intersection enumeration stops early', () => {
    const crossing: MeshData = {
      vertices: Float32Array.from([
        0, 0, 0,
        2, 0, 0,
        0, 2, 0,
        0.5, 0.5, -1,
        0.5, 0.5, 1,
        0.5, 2, 0,
      ]),
      indices: Uint32Array.from([0, 1, 2, 3, 4, 5]),
      vertexCount: 6,
      triangleCount: 2,
    };
    const session = createFinalArtifactProofSession(generateBinarySTL(crossing));
    const result = assessProofSessionStructuralIntegrity(
      session,
      { componentCount: 1, genus: 0 },
      { selfIntersection: { maxFoundPairs: 1 } }
    );

    expect(result.selfIntersection.scanComplete).toBe(false);
    expect(result.scanComplete).toBe(false);
    expect(result.structurallyValid).toBe(false);
  });

  it('enforces aggregate resource ceilings and inert options', () => {
    const session = createFinalArtifactProofSession(generateBinarySTL(tetrahedron));
    expect(() =>
      assessProofSessionStructuralIntegrity(
        session,
        { componentCount: 1, genus: 0 },
        { maxTotalBytes: 768 * 1024 * 1024 + 1 }
      )
    ).toThrow(/hard limit/i);
    expect(() =>
      assessProofSessionStructuralIntegrity(
        session,
        { componentCount: 1, genus: 0 },
        { maxTotalWorkUnits: 1 }
      )
    ).toThrow();

    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'topology', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return {};
      },
    });
    expect(() =>
      assessProofSessionStructuralIntegrity(
        session,
        { componentCount: 1, genus: 0 },
        accessor
      )
    ).toThrow(/data property/i);
    expect(getterCalls).toBe(0);
  });
});
