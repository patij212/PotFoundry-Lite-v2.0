import { describe, expect, it } from 'vitest';

import { generateBinarySTL } from '../stlExport';
import type { MeshData } from '../types';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import {
  assessMappedProofSessionStructuralIntegrity,
} from './mappedProofSessionStructuralIntegrity';
import { createObjFinalArtifactProofSession } from './objArtifact';

const tetrahedron: MeshData = {
  vertices: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: Uint32Array.from([0, 2, 1, 0, 1, 3, 1, 2, 3, 2, 0, 3]),
  vertexCount: 4,
  triangleCount: 4,
};

function objTetrahedron() {
  return createObjFinalArtifactProofSession(
    new TextEncoder().encode([
      'o Proof',
      'v 0.000000000 0.000000000 0.000000000',
      'v 1.000000000 0.000000000 0.000000000',
      'v 0.000000000 1.000000000 0.000000000',
      'v 0.000000000 0.000000000 1.000000000',
      'f 1 3 2',
      'f 1 2 4',
      'f 2 3 4',
      'f 3 1 4',
    ].join('\n'))
  );
}

describe('mapped proof-session structural integrity', () => {
  it.each([
    ['stl', () => createFinalArtifactProofSession(generateBinarySTL(tetrahedron))],
    ['obj', objTetrahedron],
  ] as const)('proves exact closed structure for %s final bytes', (format, createSession) => {
    const result = assessMappedProofSessionStructuralIntegrity(
      createSession(),
      { componentCount: 1, genus: 0 }
    );
    expect(result.artifactFormat).toBe(format);
    expect(result.structurallyValid).toBe(true);
    expect(result.scanComplete).toBe(true);
    expect(Object.values(result.checks)).toEqual(new Array(9).fill(true));
    expect(result.configuredByteCeiling).toBeLessThanOrEqual(768 * 1024 * 1024);
    expect(result.structuralWorkUnitCount).toBeGreaterThan(0);
  });

  it('rejects format-mismatched options and forged sessions', () => {
    const genuine = objTetrahedron();
    expect(() =>
      assessMappedProofSessionStructuralIntegrity(
        genuine,
        { componentCount: 1, genus: 0 },
        { stl: {} }
      )
    ).toThrow(/do not apply/i);
    expect(() =>
      assessMappedProofSessionStructuralIntegrity(
        { ...genuine },
        { componentCount: 1, genus: 0 }
      )
    ).toThrow(/not minted/i);
  });

  it('rejects aggregate budget raises and accessors before structural work', () => {
    const session = createFinalArtifactProofSession(generateBinarySTL(tetrahedron));
    expect(() =>
      assessMappedProofSessionStructuralIntegrity(
        session,
        { componentCount: 1, genus: 0 },
        { maxTotalBytes: 768 * 1024 * 1024 + 1 }
      )
    ).toThrow(/hard limit/i);
    expect(() =>
      assessMappedProofSessionStructuralIntegrity(
        session,
        { componentCount: 1, genus: 0 },
        { maxTotalWorkUnits: 1 }
      )
    ).toThrow();

    let getterCalls = 0;
    const accessor = Object.defineProperty({}, 'maxTotalBytes', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 1;
      },
    });
    expect(() =>
      assessMappedProofSessionStructuralIntegrity(
        session,
        { componentCount: 1, genus: 0 },
        accessor
      )
    ).toThrow(/data property/i);
    expect(getterCalls).toBe(0);
  });
});
