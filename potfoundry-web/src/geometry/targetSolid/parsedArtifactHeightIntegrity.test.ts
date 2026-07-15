import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import { createObjFinalArtifactProofSession } from './objArtifact';
import { assessParsedArtifactHeightIntegrity } from './parsedArtifactHeightIntegrity';

type Point3 = readonly [number, number, number];
type Triangle3 = readonly [Point3, Point3, Point3];

function binaryStl(triangles: readonly Triangle3[]): Uint8Array {
  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, triangleIndex) => {
    const base = 84 + triangleIndex * 50;
    triangle.forEach((point, vertexIndex) => {
      point.forEach((coordinate, coordinateIndex) => {
        view.setFloat32(base + 12 + (vertexIndex * 3 + coordinateIndex) * 4, coordinate, true);
      });
    });
  });
  return bytes;
}

function boxTriangles(height: number): readonly Triangle3[] {
  const p000: Point3 = [0, 0, 0];
  const p100: Point3 = [1, 0, 0];
  const p110: Point3 = [1, 1, 0];
  const p010: Point3 = [0, 1, 0];
  const p001: Point3 = [0, 0, height];
  const p101: Point3 = [1, 0, height];
  const p111: Point3 = [1, 1, height];
  const p011: Point3 = [0, 1, height];
  return [
    [p000, p110, p100], [p000, p010, p110],
    [p001, p101, p111], [p001, p111, p011],
    [p000, p100, p101], [p000, p101, p001],
    [p100, p110, p111], [p100, p111, p101],
    [p110, p010, p011], [p110, p011, p111],
    [p010, p000, p001], [p010, p001, p011],
  ];
}

function canonicalInput() {
  return createCanonicalTargetInputBinding(
    { ...DEFAULT_GEOMETRY, H: 100 },
    'HarmonicRipple',
    {},
    { superformulaSeamBlendDegrees: 30 }
  );
}

describe('parsed final-artifact height integrity', () => {
  it('proves exact continuous z extents from authenticated final STL bytes', () => {
    const session = createFinalArtifactProofSession(binaryStl(boxTriangles(100)));
    const result = assessParsedArtifactHeightIntegrity(session, canonicalInput(), 0n);
    expect(result.heightDimensionProven).toBe(true);
    expect(result.maximumErrorUpperPm).toBe('0');
    expect(result.artifactHeightPm).toEqual({
      lower: '100000000000',
      upper: '100000000000',
    });
  });

  it('retains exact integer-picometre OBJ height endpoints', () => {
    const session = createObjFinalArtifactProofSession(
      new TextEncoder().encode([
        'o Proof',
        'v 0.000000000 0.000000000 0.000000000',
        'v 1.000000000 0.000000000 100.000000000',
        'v 0.000000000 1.000000000 100.000000000',
        'f 1 2 3',
      ].join('\n'))
    );
    const result = assessParsedArtifactHeightIntegrity(session, canonicalInput(), 0n);
    expect(result.artifactFormat).toBe('obj');
    expect(result.maximumErrorUpperPm).toBe('0');
  });

  it('accepts a sub-0.01 mm serialized discrepancy and records a conservative bound', () => {
    const session = createFinalArtifactProofSession(binaryStl(boxTriangles(99.995)));
    const result = assessParsedArtifactHeightIntegrity(
      session,
      canonicalInput(),
      10_000_000n
    );
    expect(BigInt(result.maximumErrorUpperPm)).toBeLessThan(10_000_000n);
    expect(BigInt(result.maximumErrorUpperPm)).toBeGreaterThan(4_000_000n);
  });

  it('refuses a discrepancy beyond the literal tolerance', () => {
    const session = createFinalArtifactProofSession(binaryStl(boxTriangles(99.98)));
    expect(() =>
      assessParsedArtifactHeightIntegrity(session, canonicalInput(), 10_000_000n)
    ).toThrow(/exceeds/i);
  });

  it('rejects structural session lookalikes and impossible budgets', () => {
    const session = createFinalArtifactProofSession(binaryStl(boxTriangles(100)));
    expect(() =>
      assessParsedArtifactHeightIntegrity({ ...session }, canonicalInput(), 0n)
    ).toThrow(/not minted/i);
    expect(() =>
      assessParsedArtifactHeightIntegrity(session, canonicalInput(), 10_000_001n)
    ).toThrow(/budget/i);
  });
});
