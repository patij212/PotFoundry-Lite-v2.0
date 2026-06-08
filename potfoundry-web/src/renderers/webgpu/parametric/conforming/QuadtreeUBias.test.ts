/**
 * QuadtreeUBias.test.ts — anisotropic-cell foundation (GAP 1 fix).
 *
 * A global `uBias` B decouples the u-resolution from t: a level-L leaf spans
 * Δu = 1/2^(L+B) and Δt = 1/2^L, so cells are 3D-near-square under extreme
 * circumference/height anisotropy (instead of √E/√G:1 slivers — see
 * Gap1FoundationAspect.test.ts). B is chosen so default dims → B=0 (a perfect
 * no-op, preserving the 20/20 default-dim result); only wide/flat pots get B>0.
 *
 * Invariants under uBias:
 *  - B=0 is byte-identical to the default (no-op).
 *  - B>0 erases the sliver field on extreme-aspect surfaces (cell aspect < 100).
 *  - 2:1 balance still holds (neighbours differ ≤ 1 level), periodic seam closed.
 *  - The triangulation stays watertight + T-junction-free.
 */
import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree, type QuadLeaf } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree, type QuadtreeMesh } from './QuadtreeTriangulator';
import { firstFundamentalForm, metricStepsForSampler } from './SurfaceMetricTensor';

function field(s: SyntheticCylinderSampler, opts: Partial<SizingOptions> = {}): MetricSizingField {
  return new MetricSizingField(s, {
    maxSagMm: 0.1, minEdgeMm: 0.2, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128, ...opts,
  });
}

/** Stable per-leaf key for set comparison. */
function leafKeys(qt: PeriodicBalancedQuadtree): string[] {
  return qt
    .leaves()
    .map((l) => `${l.level}:${Math.round(l.u0 * (1 << (l.level + qt.uBias())))}:${Math.round(l.t0 * (1 << l.level))}`)
    .sort();
}

/** Right-triangle aspect of a physical w×h cell (matches metrics.ts). */
function cellAspect(w: number, h: number): number {
  const a = Math.max(w, 1e-12);
  const b = Math.max(h, 1e-12);
  return ((a * a + b * b) * Math.sqrt(3)) / (4 * (0.5 * a * b));
}

/** Max 3D cell aspect over all leaves (du = 1/2^(level+B), dt = 1/2^level). */
function maxCellAspect(qt: PeriodicBalancedQuadtree, s: SyntheticCylinderSampler): number {
  const steps = metricStepsForSampler(s);
  const B = qt.uBias();
  let max = 0;
  for (const l of qt.leaves()) {
    const du = 1 / (1 << (l.level + B));
    const dt = 1 / (1 << l.level);
    const uc = l.u0 + du / 2;
    const tc = l.t0 + dt / 2;
    const { E, G } = firstFundamentalForm(s, uc, tc, steps.hu, steps.ht);
    const asp = cellAspect(Math.sqrt(Math.max(E, 0)) * du, Math.sqrt(Math.max(G, 0)) * dt);
    if (asp > max) max = asp;
  }
  return max;
}

/** Audit a wall mesh: T-junctions (interior edges used once) + non-manifold edges. */
function wallEdgeAudit(mesh: QuadtreeMesh): { nonManifold: number; interiorBoundary: number } {
  const tEps = 1e-9;
  const vt = (i: number): number => mesh.vertices[i * 3 + 1];
  const edges = new Map<string, number>();
  const tri = mesh.indices;
  for (let k = 0; k < tri.length; k += 3) {
    const [a, b, c] = [tri[k], tri[k + 1], tri[k + 2]];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let nonManifold = 0;
  let interiorBoundary = 0;
  for (const [key, count] of edges) {
    if (count > 2) nonManifold++;
    else if (count === 1) {
      const [iS, jS] = key.split(':');
      const onT0 = vt(Number(iS)) < tEps && vt(Number(jS)) < tEps;
      const onT1 = vt(Number(iS)) > 1 - tEps && vt(Number(jS)) > 1 - tEps;
      if (!(onT0 || onT1)) interiorBoundary++;
    }
  }
  return { nonManifold, interiorBoundary };
}

describe('Quadtree uBias — anisotropic cells (GAP 1)', () => {
  it('uBias=0 is a perfect no-op (identical leaf set to the default)', () => {
    const s = new SyntheticCylinderSampler(50, 120, 8, 2);
    const f = field(s, { minEdgeMm: 0.5, maxEdgeMm: 120, gradeRatio: 4, resU: 65, resT: 9 });
    const a = new PeriodicBalancedQuadtree(f, s, { maxLevel: 7 });
    const b = new PeriodicBalancedQuadtree(f, s, { maxLevel: 7, uBias: 0 });
    expect(a.uBias()).toBe(0);
    expect(b.uBias()).toBe(0);
    expect(leafKeys(b)).toEqual(leafKeys(a));
  });

  it('uBias erases the short-wide sliver field (sharp-facet cells → 3D-near-square)', () => {
    // Short-wide sharp facet: base √E/√G≈22, local relief pushes it past 115.
    const s = new SyntheticCylinderSampler(145, 40, 10, 80);
    const f = field(s);
    const noBias = new PeriodicBalancedQuadtree(f, s, { maxLevel: 7 });
    const biased = new PeriodicBalancedQuadtree(f, s, { maxLevel: 7, uBias: 4 });
    expect(maxCellAspect(noBias, s)).toBeGreaterThan(100); // slivers without uBias
    expect(maxCellAspect(biased, s)).toBeLessThan(100); // fixed with uBias
  });

  it('uBias>0 keeps 2:1 balance across every edge (incl. u-wrap)', () => {
    const s = new SyntheticCylinderSampler(145, 40, 8, 6);
    const f = field(s);
    const qt = new PeriodicBalancedQuadtree(f, s, { maxLevel: 7, uBias: 3 });
    for (const leaf of qt.leaves()) {
      for (const { leaf: nb } of qt.neighbors(leaf)) {
        expect(Math.abs(leaf.level - nb.level)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('uBias>0 triangulates watertight + T-junction-free', () => {
    const s = new SyntheticCylinderSampler(145, 40, 8, 6);
    const f = field(s);
    const qt = new PeriodicBalancedQuadtree(f, s, { maxLevel: 7, uBias: 3, pinBoundaryLevel: 4 });
    const mesh = triangulateQuadtree(qt);
    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0);
  });

  it('uBias>0 pins the boundary rows to 2^(pin+B) uniform u-columns', () => {
    const s = new SyntheticCylinderSampler(145, 40, 8, 6);
    const f = field(s);
    const B = 3;
    const PIN = 4;
    const qt = new PeriodicBalancedQuadtree(f, s, { maxLevel: 7, uBias: B, pinBoundaryLevel: PIN });
    const bottom = qt.leaves().filter((l: QuadLeaf) => Math.abs(l.t0) < 1e-9);
    // Every bottom-row leaf at the pin t-level; u-columns = 2^(PIN+B).
    expect(bottom.every((l) => l.level === PIN)).toBe(true);
    expect(bottom.length).toBe(1 << (PIN + B));
  });
});
