// verify.ts — self-contained manifold audit for the double-valued mesher.

import type { Mesh } from './types';

export interface ManifoldReport {
  /** Count of edges shared by more than two triangles (must be 0). */
  nonManifold: number;
  /** Count of edges used by exactly one triangle (open edges; the outer rim is allowed). */
  boundary: number;
  /**
   * Count of open edges that lie ALONG a cliff and are NOT on the declared-open rim:
   * i.e. both endpoints are cliff split-vertices and neither is a rim vertex. A closed
   * (wall-bridged) cliff has 0 of these — a crack along the cliff shows up here.
   */
  cliffBoundary: number;
}

/**
 * Edge-use census over the triangle soup. Determines manifoldness and, using the
 * mesh's per-vertex cliff/rim tags, whether the cliff seam is watertight.
 */
export function auditManifold(m: Mesh): ManifoldReport {
  const use = new Map<string, number>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const tris = m.triangles;
  for (let i = 0; i < tris.length; i += 3) {
    const edgesOfTri: ReadonlyArray<readonly [number, number]> = [
      [tris[i], tris[i + 1]],
      [tris[i + 1], tris[i + 2]],
      [tris[i + 2], tris[i]],
    ];
    for (const [a, b] of edgesOfTri) {
      const k = key(a, b);
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }

  const onCliff = m.vertexOnCliff;
  const onRim = m.vertexOnRim;
  let nonManifold = 0;
  let boundary = 0;
  let cliffBoundary = 0;
  for (const [k, count] of use) {
    if (count > 2) {
      nonManifold += 1;
      continue;
    }
    if (count === 1) {
      boundary += 1;
      const sep = k.indexOf(':');
      const a = Number(k.slice(0, sep));
      const b = Number(k.slice(sep + 1));
      if (onCliff[a] && onCliff[b] && !onRim[a] && !onRim[b]) cliffBoundary += 1;
    }
  }
  return { nonManifold, boundary, cliffBoundary };
}
