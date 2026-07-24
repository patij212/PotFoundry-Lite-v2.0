/**
 * PinBandRelax.test.ts — relaxation of the pinned-boundary `levelCap` grading
 * (E-2026-07-24-PINBAND).
 *
 * The t=0/t=1 rows are pinned to exactly `log2(nRing)−uBias` so the two shared
 * rings carry exactly `nRing` vertices (the watertight-assembly contract). The
 * SHIPPED `'linear'` grading then lets a cell gain only one level per pinned-row
 * height, so reaching `maxLevel` needs `nearEdge ≥ (maxLevel−pin)/2^pin` — the
 * frozen band WIDENS as you refine, and no refinement criterion (analytic,
 * curvature or feature) may subdivide inside it.
 *
 * `'geometric'` is the TIGHT cap that still admits a 2:1 staircase down to the
 * immovable pinned row (a level-`pin+j` cell needs `nearEdge ≥ (2−2^(1−j))/2^pin`),
 * so the capped band is bounded by TWO pinned-row heights at ANY `maxLevel`.
 *
 * Gates:
 *  1. FLAG OFF is byte-identical (with the analytic lever ALSO armed — the real
 *     combination), the load-bearing production guarantee.
 *  2. `'geometric'` is NON-VACUOUS: strictly more triangles on a band-capped config.
 *  3. `'geometric'` keeps BOTH shared rings exactly `nRing` long and ascending in U.
 *  4. `'geometric'` stays 2:1-legal ⇒ the mesh keeps EXACTLY the 2·nRing legitimate
 *     rim boundary edges and zero non-manifold edges (audited BY INDEX).
 *  5. `'rowsOnly'` (the naive "just pin the rows" relaxation) BREAKS gate 4 —
 *     measured, not assumed. This is why the geometric staircase bound is required.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { GpuSurfaceSampler, SyntheticCylinderSampler } from './SurfaceSampler';
import { MetricSizingField } from './MetricSizingField';
import { PeriodicBalancedQuadtree, type PinBandGrading } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree } from './QuadtreeTriangulator';
import { buildConformingWall, type ConformingWallOptions } from './ConformingWall';

const R0 = 40;
const H = 120;
const AMP = 3;
const RES_U = 64;
const RES_T = 17;
/** Ripple count == grid columns ⇒ the pre-evaluated grid aliases the relief away. */
const K = RES_U;
const N_RING = 32;

/** Bilinear sampler that is PROVABLY blind to the relief (see AnalyticSagRefine.test.ts). */
function blindSampler(): GpuSurfaceSampler {
  const positions = new Float32Array(RES_U * RES_T * 3);
  for (let row = 0; row < RES_T; row++) {
    const t = row / (RES_T - 1);
    for (let col = 0; col < RES_U; col++) {
      const theta = (2 * Math.PI * col) / RES_U;
      const r = R0 + AMP * Math.cos(K * theta);
      const b = (row * RES_U + col) * 3;
      positions[b] = r * Math.cos(theta);
      positions[b + 1] = r * Math.sin(theta);
      positions[b + 2] = t * H;
    }
  }
  return new GpuSurfaceSampler(positions, RES_U, RES_T);
}

const analyticRA = (theta: number): number => R0 + AMP * Math.cos(K * theta);

/** pin = log2(32) − uBias(0) = 5; maxLevel 9 ⇒ the linear band is 4/32 of the wall. */
function baseOpts(): ConformingWallOptions {
  return {
    maxSagMm: 0.2,
    maxEdgeMm: 20,
    minEdgeMm: 0.05,
    gradeRatio: 2,
    maxLevel: 9,
    resU: 33,
    resT: 17,
    nRing: N_RING,
    surfaceId: 0,
    analyticRA,
    analyticH: H,
    analyticSagMm: 0.05,
    analyticSagSamples: 3,
  };
}

function setAnalytic(on: boolean): void {
  (globalThis as unknown as { __pfConformingAnalyticScore?: boolean }).__pfConformingAnalyticScore = on;
}
function setRelax(mode: 'off' | 'geometric' | 'rowsOnly'): void {
  const g = globalThis as unknown as { __pfConformingPinBandRelax?: string };
  if (mode === 'off') delete g.__pfConformingPinBandRelax;
  else g.__pfConformingPinBandRelax = mode;
}

/**
 * Edge audit BY INDEX (the project's watertight ruler): how many undirected
 * edges carry exactly 1 face (boundary) and how many carry >2 (non-manifold).
 * A conforming WALL is an open cylinder, so exactly 2·nRing boundary edges — the
 * two rim rings — are legitimate; anything more is a T-junction crack.
 */
function edgeAudit(indices: Uint32Array): { boundary: number; nonManifold: number } {
  const counts = new Map<string, number>();
  for (let f = 0; f < indices.length; f += 3) {
    const tri = [indices[f], indices[f + 1], indices[f + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let boundary = 0, nonManifold = 0;
  for (const n of counts.values()) {
    if (n === 1) boundary++;
    else if (n > 2) nonManifold++;
  }
  return { boundary, nonManifold };
}

afterEach(() => {
  setAnalytic(false);
  setRelax('off');
});

const TIMEOUT_MS = 120_000;

describe('pin-band levelCap relaxation (__pfConformingPinBandRelax)', () => {
  it('FLAG OFF is byte-identical (analytic scoring armed in both arms)', () => {
    const sampler = blindSampler();
    setAnalytic(true);
    setRelax('off');
    const a = buildConformingWall(sampler, baseOpts());
    setRelax('off');
    const b = buildConformingWall(sampler, baseOpts());
    expect(Array.from(b.indices)).toEqual(Array.from(a.indices));
    expect(Array.from(b.vertices)).toEqual(Array.from(a.vertices));
    // …and an UNRECOGNISED flag value is also byte-identical (fail-closed).
    (globalThis as unknown as { __pfConformingPinBandRelax?: string }).__pfConformingPinBandRelax = 'nonsense';
    const c = buildConformingWall(sampler, baseOpts());
    expect(Array.from(c.indices)).toEqual(Array.from(a.indices));
    expect(Array.from(c.vertices)).toEqual(Array.from(a.vertices));
  }, TIMEOUT_MS);

  it("'geometric' is NON-VACUOUS — it frees the band interior the linear grading froze", () => {
    const sampler = blindSampler();
    setAnalytic(true);
    setRelax('off');
    const off = buildConformingWall(sampler, baseOpts());
    setRelax('geometric');
    const on = buildConformingWall(sampler, baseOpts());
    expect(on.indices.length).toBeGreaterThan(off.indices.length);
  }, TIMEOUT_MS);

  it("'geometric' leaves the SHARED RINGS intact (nRing long, ascending U, both ends)", () => {
    const sampler = blindSampler();
    setAnalytic(true);
    setRelax('geometric');
    const on = buildConformingWall(sampler, baseOpts());
    expect(on.bottomRing.length).toBe(N_RING);
    expect(on.topRing.length).toBe(N_RING);
    const uOf = (ring: number[]): number[] => ring.map((i) => on.vertices[i * 3]);
    for (const ring of [uOf(on.bottomRing), uOf(on.topRing)]) {
      for (let i = 1; i < ring.length; i++) expect(ring[i]).toBeGreaterThan(ring[i - 1]);
      // U = i/nRing exactly — the index-for-index cap pairing.
      for (let i = 0; i < ring.length; i++) expect(ring[i]).toBeCloseTo(i / N_RING, 6);
    }
  }, TIMEOUT_MS);

  it("'geometric' stays 2:1-legal — only the 2·nRing rim edges are boundary, zero non-manifold", () => {
    const sampler = blindSampler();
    setAnalytic(true);
    setRelax('off');
    const off = edgeAudit(buildConformingWall(sampler, baseOpts()).indices);
    setRelax('geometric');
    const on = edgeAudit(buildConformingWall(sampler, baseOpts()).indices);
    expect(off.boundary).toBe(2 * N_RING);
    expect(off.nonManifold).toBe(0);
    expect(on.boundary).toBe(2 * N_RING);
    expect(on.nonManifold).toBe(0);
  }, TIMEOUT_MS);

  /**
   * A tree whose refinement is FORCED to `maxLevel` in a thin t-band sitting one
   * pinned-row height above the rim — the exact place the grading arbitrates. The
   * sizing field is deliberately slack so the feature floor is the only driver.
   */
  const PIN = 5;
  const MAX_LEVEL = 9;
  function bandTree(grading: PinBandGrading | undefined): PeriodicBalancedQuadtree {
    const s = new SyntheticCylinderSampler(40, H, 0, 1);
    const f = new MetricSizingField(s, {
      maxSagMm: 50, minEdgeMm: 4, maxEdgeMm: 40, gradeRatio: 2, resU: 32, resT: 32,
    });
    // Rows 1.875–1.9375 above the rim: 'linear' caps this at pin+1 (floor(1.875)=1)
    // while the geometric staircase already allows maxLevel there.
    const tLo = 30 / (1 << (PIN + 4));
    const tHi = 31 / (1 << (PIN + 4));
    return new PeriodicBalancedQuadtree(f, s, {
      maxLevel: MAX_LEVEL,
      pinBoundaryLevel: PIN,
      pinBandGrading: grading,
      featureRefine: {
        level: MAX_LEVEL,
        intersects: (_u0: number, t0: number, size: number): boolean => t0 <= tHi && t0 + size >= tLo,
      },
    });
  }
  /** Worst |Δlevel| across any shared edge — the 2:1 invariant, measured. */
  function worstLevelJump(qt: PeriodicBalancedQuadtree): number {
    let worst = 0;
    for (const leaf of qt.leaves()) {
      for (const { leaf: nb } of qt.neighbors(leaf)) {
        const d = Math.abs(leaf.level - nb.level);
        if (d > worst) worst = d;
      }
    }
    return worst;
  }

  it("'geometric' preserves the 2:1 level invariant against the immovable pinned row", () => {
    // Non-vacuous: the forced band must actually reach deeper under 'geometric'
    // than under the shipped 'linear' grading (otherwise this proves nothing).
    const lin = bandTree(undefined);
    const geo = bandTree('geometric');
    const deepest = (qt: PeriodicBalancedQuadtree): number =>
      qt.leaves().reduce((m, l) => Math.max(m, l.level), 0);
    expect(deepest(geo)).toBeGreaterThan(deepest(lin));
    expect(worstLevelJump(lin)).toBeLessThanOrEqual(1);
    expect(worstLevelJump(geo)).toBeLessThanOrEqual(1);
    const rimEdges = 2 * (1 << PIN);
    expect(edgeAudit(triangulateQuadtree(geo).indices)).toEqual({ boundary: rimEdges, nonManifold: 0 });
  }, TIMEOUT_MS);

  /** Smallest triangle angle (degrees) after the cylinder lift — the sliver ruler. */
  function minAngleDeg(vertices: Float32Array, indices: Uint32Array): number {
    const lift = (i: number): [number, number, number] => {
      const th = vertices[i * 3] * 2 * Math.PI;
      return [40 * Math.cos(th), 40 * Math.sin(th), vertices[i * 3 + 1] * H];
    };
    let worst = 180;
    for (let f = 0; f < indices.length; f += 3) {
      const p = [lift(indices[f]), lift(indices[f + 1]), lift(indices[f + 2])];
      const len = (a: number, b: number): number =>
        Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1], p[a][2] - p[b][2]);
      const s = [len(1, 2), len(2, 0), len(0, 1)];
      if (Math.min(...s) <= 0) continue;
      for (let k = 0; k < 3; k++) {
        const a = s[k], b = s[(k + 1) % 3], c = s[(k + 2) % 3];
        const cosA = (b * b + c * c - a * a) / (2 * b * c);
        const ang = (Math.acos(Math.max(-1, Math.min(1, cosA))) * 180) / Math.PI;
        if (ang < worst) worst = ang;
      }
    }
    return worst;
  }

  it("'rowsOnly' BREAKS the 2:1 level invariant — the cost is QUALITY, not topology (measured)", () => {
    // The immovable pinned row cannot be split by balance(), so freeing its
    // neighbours to maxLevel leaves a >2:1 jump. MEASURED CORRECTION to the naive
    // expectation: the mesh does NOT crack — QuadtreeTopology's readH/readV collect
    // EVERY grid-line point inside a leaf side (a general hanging-node collector,
    // not the single mid-edge the module header describes), so a k-level jump is
    // sealed by a (2^k+3)-gon. What degrades instead is triangle shape: that gon
    // fans into ever-thinner slivers.
    const naive = bandTree('rowsOnly');
    const geo = bandTree('geometric');
    expect(worstLevelJump(naive)).toBeGreaterThan(1);
    expect(worstLevelJump(geo)).toBeLessThanOrEqual(1);
    const rimEdges = 2 * (1 << PIN);
    const naiveMesh = triangulateQuadtree(naive);
    expect(edgeAudit(naiveMesh.indices)).toEqual({ boundary: rimEdges, nonManifold: 0 });
    const geoMesh = triangulateQuadtree(geo);
    expect(minAngleDeg(naiveMesh.vertices, naiveMesh.indices))
      .toBeLessThan(minAngleDeg(geoMesh.vertices, geoMesh.indices));
  }, TIMEOUT_MS);
});
