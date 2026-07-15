import { describe, expect, it } from 'vitest';

import {
  createFinalArtifactProofSession,
  parsedArtifactForProofSession,
  type FinalArtifactProofSession,
} from './finalArtifactProofSession';

function oneTriangleStl(): Uint8Array {
  const bytes = new Uint8Array(134);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, 1, true);
  const vertices = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  vertices.forEach((coordinate, index) => view.setFloat32(96 + index * 4, coordinate, true));
  return bytes;
}

describe('final artifact proof session', () => {
  it('mints a frozen parser-authenticated session bound to final bytes', () => {
    const bytes = oneTriangleStl();
    const session = createFinalArtifactProofSession(bytes);
    const parsed = parsedArtifactForProofSession(session);

    expect(Object.isFrozen(session)).toBe(true);
    expect(session.byteSha256).toBe(parsed.byteSha256);
    expect(session.parsedTriangleSetSha256).toBe(parsed.parsedTriangleSetSha256);
    expect(session.triangleCount).toBe(1);
  });

  it('rejects a frozen structural lookalike that bypassed the parser', () => {
    const genuine = createFinalArtifactProofSession(oneTriangleStl());
    const forged = Object.freeze({ ...genuine }) as FinalArtifactProofSession;

    expect(() => parsedArtifactForProofSession(forged)).toThrow(/not minted/);
  });

  it('retains the immutable parsed snapshot after caller bytes mutate', () => {
    const bytes = oneTriangleStl();
    const session = createFinalArtifactProofSession(bytes);
    const parsed = parsedArtifactForProofSession(session);
    const before = new Float64Array(9);
    const after = new Float64Array(9);
    parsed.readTriangle(0, before);
    bytes.fill(0);
    parsed.readTriangle(0, after);

    expect(Array.from(after)).toEqual(Array.from(before));
    expect(parsed.byteSha256).toBe(session.byteSha256);
  });
});
