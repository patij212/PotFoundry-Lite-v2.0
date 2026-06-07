import { describe, it, expect } from 'vitest';
import { annulusStrip, discFan } from './RingStrip';

/** Group a flat index array into {a,b,c} triangles. */
function tris(idx: number[]): Array<{ a: number; b: number; c: number }> {
  const out: Array<{ a: number; b: number; c: number }> = [];
  for (let i = 0; i < idx.length; i += 3) {
    out.push({ a: idx[i], b: idx[i + 1], c: idx[i + 2] });
  }
  return out;
}

/** Undirected edge-use counts over a triangle list. */
function edgeUse(
  triangles: Array<{ a: number; b: number; c: number }>,
): Map<string, number> {
  const m = new Map<string, number>();
  const bump = (i: number, j: number): void => {
    const k = i < j ? `${i}_${j}` : `${j}_${i}`;
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const t of triangles) {
    bump(t.a, t.b);
    bump(t.b, t.c);
    bump(t.c, t.a);
  }
  return m;
}

/** Directed edge set (a→b) for winding checks. */
function directedEdges(
  triangles: Array<{ a: number; b: number; c: number }>,
): Set<string> {
  const s = new Set<string>();
  for (const t of triangles) {
    s.add(`${t.a}->${t.b}`);
    s.add(`${t.b}->${t.c}`);
    s.add(`${t.c}->${t.a}`);
  }
  return s;
}

describe('RingStrip.annulusStrip — two index-rings of equal count', () => {
  // Two distinct index-rings of nRing=8 (e.g. outer-top ring 0..7, inner-top 8..15).
  const N = 8;
  const ringA = Array.from({ length: N }, (_, i) => i); // 0..7
  const ringB = Array.from({ length: N }, (_, i) => N + i); // 8..15

  it('produces 2·nRing triangles', () => {
    const t = tris(annulusStrip(ringA, ringB, false));
    expect(t.length).toBe(2 * N);
  });

  it('every interior edge is used exactly twice; only boundary edges are the two input rings', () => {
    const t = tris(annulusStrip(ringA, ringB, false));
    const eu = edgeUse(t);
    const ringAset = new Set(ringA);
    const ringBset = new Set(ringB);
    for (const [k, count] of eu) {
      expect(count).toBeLessThanOrEqual(2);
      if (count === 1) {
        const [i, j] = k.split('_').map(Number);
        const bothA = ringAset.has(i) && ringAset.has(j);
        const bothB = ringBset.has(i) && ringBset.has(j);
        // Boundary edges occur only along ringA or ringB — never the spokes.
        expect(bothA || bothB).toBe(true);
      }
    }
    // Each ring contributes exactly nRing boundary edges (closed loops).
    let ringEdges = 0;
    for (const [k, count] of eu) {
      if (count !== 1) continue;
      ringEdges++;
      void k;
    }
    expect(ringEdges).toBe(2 * N);
  });

  it('no degenerate (repeated-index) triangles', () => {
    const t = tris(annulusStrip(ringA, ringB, false));
    for (const tr of t) {
      expect(tr.a).not.toBe(tr.b);
      expect(tr.b).not.toBe(tr.c);
      expect(tr.a).not.toBe(tr.c);
    }
  });

  it('invert flips every triangle winding (directed edges reverse)', () => {
    const fwd = tris(annulusStrip(ringA, ringB, false));
    const inv = tris(annulusStrip(ringA, ringB, true));
    expect(inv.length).toBe(fwd.length);
    const fwdDir = directedEdges(fwd);
    const invDir = directedEdges(inv);
    // For a closed manifold strip, inverting must reverse every directed edge.
    for (const e of fwdDir) {
      const [a, b] = e.split('->');
      expect(invDir.has(`${b}->${a}`)).toBe(true);
    }
  });
});

describe('RingStrip.discFan — ring fanned to a single centre vertex', () => {
  const N = 8;
  const ring = Array.from({ length: N }, (_, i) => i); // 0..7
  const centre = N; // index 8

  it('produces nRing triangles, each containing the centre', () => {
    const t = tris(discFan(ring, centre, false));
    expect(t.length).toBe(N);
    for (const tr of t) {
      expect(tr.a === centre || tr.b === centre || tr.c === centre).toBe(true);
    }
  });

  it('every spoke edge used twice; only the ring is boundary', () => {
    const t = tris(discFan(ring, centre, false));
    const eu = edgeUse(t);
    const ringSet = new Set(ring);
    for (const [k, count] of eu) {
      expect(count).toBeLessThanOrEqual(2);
      if (count === 1) {
        const [i, j] = k.split('_').map(Number);
        expect(ringSet.has(i) && ringSet.has(j)).toBe(true);
      }
    }
    let boundary = 0;
    for (const count of eu.values()) if (count === 1) boundary++;
    expect(boundary).toBe(N);
  });

  it('invert flips disc winding', () => {
    const fwd = tris(discFan(ring, centre, false));
    const inv = tris(discFan(ring, centre, true));
    const fwdDir = directedEdges(fwd);
    const invDir = directedEdges(inv);
    for (const e of fwdDir) {
      const [a, b] = e.split('->');
      expect(invDir.has(`${b}->${a}`)).toBe(true);
    }
  });
});
