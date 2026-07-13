// dsFeatureEdges.test.ts — FAST src smoke for the DragonScales feature-conforming edge graph + its wiring into the
// M=g/h² region kernel (buildRegionOuterWall → buildMetricOuterWall → buildMetricMesh).
//
// Proves: (1) the ported graph is pure/valid + clipped to the patch INTERIOR (rim-pin safe); (2) fed to the kernel
// the constraint edges are RECOVERED (recovery>0) and the mesh stays WATERTIGHT-by-construction (nonMan 0); (3) the
// rim-pin still emits EXACTLY nRing rings WITH the graph present (the T-A rim-pin invariant holds); (4) the DS branch
// is INERT for non-DS region styles ⇒ byte-identical (hashMesh) to the plain region wall.
//
// The HEAVY true-3D fidelity gate (witness/composite body p99 ≤ 0.01 on the assembled DS body) is the env-gated
// research probe research/bridge/_dsInteriorClose.test.ts — see the report for the exact command.
import { describe, it, expect } from 'vitest';
import {
  buildThetaEdgeGraph,
  buildFlankToeGraph,
  mergeGraphs,
  clipGraphToInterior,
  buildDragonScalesConformingGraph,
  DEFAULT_DS_LATTICE,
  DS_CURVATURE_FINE_STEP,
  DS_CURVATURE_SUBSAMPLES,
  type FeatureGraph,
} from './dsFeatureEdges';
import { buildMetricMesh, buildMetricOuterWall } from './regionMetric';
import { buildRegionOuterWall } from './index';
import { hashMesh } from './__testutil';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

type FlagGlobal = { __pfRegionLayer?: boolean };
const H = 60;


// A gentle θ-only radial surface (the SAME shape the existing rim-pin/assembly smokes use). Deliberately mild so
// the rim-pin seam-weld bijection is exercised under stable refinement — the constraint-recovery + rim-pin smoke
// only needs a finite radius, since the DS graph is analytic from the lattice (independent of rA). NOTE: an
// aggressive surface (high z-frequency + many-fold θ, i.e. a REAL DragonScales riser) can drive near-seam interior
// vertices into the seam columns and break this bijection — see the report's rim-pin-fragility concern; that is a
// property of the rim-pin machinery, not this graph, and the graph clips itself off the seam to avoid ADDING to it.
const dsishRA: AnalyticRadiusFn = (theta) => 40 + 2 * Math.cos(3 * theta);

/** Count index-space non-manifold edges (undirected edges incident to > 2 triangles). */
function nonManifoldEdgeCount(indices: ArrayLike<number>): number {
  const count = new Map<number, number>();
  const nTri = indices.length / 3;
  const key = (a: number, b: number): number => (a < b ? a * 100_000_000 + b : b * 100_000_000 + a);
  for (let f = 0; f < nTri; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = key(u, v);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  let nonMan = 0;
  for (const n of count.values()) if (n > 2) nonMan++;
  return nonMan;
}

/** Every edge references two distinct in-range point indices. */
function edgesValid(g: FeatureGraph): boolean {
  const nPts = g.pts.length / 2;
  if (g.edges.length % 2 !== 0) return false;
  for (let e = 0; e + 1 < g.edges.length; e += 2) {
    const a = g.edges[e], b = g.edges[e + 1];
    if (a < 0 || b < 0 || a >= nPts || b >= nPts || a === b) return false;
  }
  return true;
}

describe('dsFeatureEdges — pure graph generators (browser-capable, analytic from the DS lattice)', () => {
  it('θ-valley graph: one line per (row, scale), collinear samples chained', () => {
    const g = buildThetaEdgeGraph(H, 24, 1.3);
    expect(g.lines).toBe(DEFAULT_DS_LATTICE.scaleRows * DEFAULT_DS_LATTICE.scalesPerRow); // 8*16 = 128
    // Each line = 24 samples ⇒ 24 pts, 23 edges.
    expect(g.pts.length / 2).toBe(g.lines * 24);
    expect(g.edges.length / 2).toBe(g.lines * 23);
    expect(edgesValid(g)).toBe(true);
  });

  it('flank-toe graph: two arcs per scale, valid edges', () => {
    const g = buildFlankToeGraph(H, 16, 1.3, 0.04);
    expect(g.arcs).toBe(DEFAULT_DS_LATTICE.scaleRows * DEFAULT_DS_LATTICE.scalesPerRow * 2); // 2 per valley
    expect(g.pts.length / 2).toBeGreaterThan(0);
    expect(edgesValid(g)).toBe(true);
  });

  it('clipGraphToInterior drops boundary points + re-indexes edges', () => {
    // Hand graph: p0 on the seam (u=0), p1 interior, p2 on t=1, p3 interior; edges 0-1, 1-2, 1-3.
    const raw: FeatureGraph = {
      pts: [0, 0.5, 0.3, 0.4, 0.7, 1.0, 0.6, 0.6],
      edges: [0, 1, 1, 2, 1, 3],
    };
    const c = clipGraphToInterior(raw);
    // p0 (u=0) and p2 (t=1) dropped ⇒ 2 survivors (old p1, p3).
    expect(c.pts.length / 2).toBe(2);
    // Only edge 1-3 survives (0-1 and 1-2 referenced dropped points), re-indexed to the two survivors.
    expect(c.edges.length / 2).toBe(1);
    expect(edgesValid(c)).toBe(true);
    // The surviving edge connects the two kept interior points.
    expect(new Set(c.edges)).toEqual(new Set([0, 1]));
  });

  it('composed DS graph is non-empty, valid, and STRICTLY INTERIOR (rim-pin safe)', () => {
    const g = buildDragonScalesConformingGraph(H);
    expect(g.pts.length / 2).toBeGreaterThan(100);
    expect(g.edges.length / 2).toBeGreaterThan(100);
    expect(edgesValid(g)).toBe(true);
    const nPts = g.pts.length / 2;
    for (let i = 0; i < nPts; i++) {
      const u = g.pts[2 * i], t = g.pts[2 * i + 1];
      expect(u).toBeGreaterThan(1e-6);
      expect(u).toBeLessThan(1 - 1e-6);
      expect(t).toBeGreaterThan(1e-6);
      expect(t).toBeLessThan(1 - 1e-6);
    }
  });

  it('mergeGraphs offsets the second graph edge indices', () => {
    const a: FeatureGraph = { pts: [0.1, 0.1, 0.2, 0.2], edges: [0, 1] };
    const b: FeatureGraph = { pts: [0.3, 0.3, 0.4, 0.4], edges: [0, 1] };
    const m = mergeGraphs(a, b);
    expect(m.pts.length / 2).toBe(4);
    expect(m.edges).toEqual([0, 1, 2, 3]);
  });
});

describe('dsFeatureEdges — kernel wiring (constraint recovery + watertight)', () => {
  // A reduced-density graph (fewer samples) keeps the kernel smoke fast while exercising the exact recovery path.
  const reduced = buildDragonScalesConformingGraph(H, { thetaSamplesPerLine: 5, flankSamplesPerHalf: 3 });

  it('the DS constraint edges are RECOVERED and the mesh is manifold (nonMan 0)', () => {
    const mesh = buildMetricMesh(dsishRA, H, {
      tolMm: 0.5, hMin: 0.5, hMax: 8, sizeRes: 32, seedN: 6, maxPoints: 40_000, optimizeSweeps: 2,
      rimPinRing: 12, guardManifoldAlways: true,
      injectedPoints: reduced.pts,
      constraintEdges: reduced.edges,
      pinInjected: true,
      recoverySubdivideCollinear: true,
      curvatureFineStep: DS_CURVATURE_FINE_STEP,
      curvatureSubsamples: DS_CURVATURE_SUBSAMPLES,
    });
    const c = mesh.constraint;
    expect(c).toBeDefined();
    // Constraint present: the graph edges are recovered (or already Delaunay-present) — recovery > 0.
    expect((c!.recovered + c!.alreadyPresent)).toBeGreaterThan(0);
    expect(c!.requested).toBeGreaterThan(0);
    // Watertight by construction: the mandatory guard leaves zero non-manifold edges even with pinned creases.
    expect(nonManifoldEdgeCount(mesh.indices)).toBe(0);
  }, 30_000);

  it('rim-pin still emits EXACTLY nRing rings WITH the graph present (T-A invariant holds)', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      const NRING = 12;
      const wall = buildMetricOuterWall(dsishRA, { H }, {
        tolMm: 0.5, hMin: 0.5, hMax: 8, sizeRes: 32, seedN: 6, maxPoints: 40_000, optimizeSweeps: 2, nRing: NRING,
        injectedPoints: reduced.pts,
        constraintEdges: reduced.edges,
        pinInjected: true,
        recoverySubdivideCollinear: true,
        curvatureFineStep: DS_CURVATURE_FINE_STEP,
        curvatureSubsamples: DS_CURVATURE_SUBSAMPLES,
      });
      expect(wall.bottomRing.length).toBe(NRING);
      expect(wall.topRing.length).toBe(NRING);
      expect(nonManifoldEdgeCount(wall.indices)).toBe(0);
    } finally {
      g.__pfRegionLayer = prior;
    }
  }, 30_000);
});

describe('buildRegionOuterWall — DS branch wiring + flag-off/non-DS byte-identity', () => {
  const mk = (H2: number): Parameters<typeof buildRegionOuterWall>[0] => ({
    analyticRA: dsishRA, H: H2, nRing: 8, tolMm: 0.5, hMin: 0.5, hMax: 8, sizeRes: 24, seedN: 4, maxPoints: 30_000,
  });

  it('DragonScales dispatch injects the graph and still rim-pins to nRing', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      const wall = buildRegionOuterWall(mk(H), 'DragonScales');
      expect(wall).toBeDefined();
      expect(wall!.bottomRing.length).toBe(8);
      expect(wall!.topRing.length).toBe(8);
      expect(nonManifoldEdgeCount(wall!.indices)).toBe(0);
    } finally {
      g.__pfRegionLayer = prior;
    }
  }, 60_000);

  it('NON-DS region style (GeometricStar) is BYTE-IDENTICAL to the plain no-graph region wall', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      const params = mk(H);
      // GeometricStar takes NO DS branch ⇒ buildRegionOuterWall passes plain kernelOpts (no injection fields).
      const viaDispatch = buildRegionOuterWall(params, 'GeometricStar')!;
      // The exact plain opts buildRegionOuterWall constructs for a non-DS region style (no injected graph).
      const plain = buildMetricOuterWall(params.analyticRA, { H: params.H }, {
        tolMm: params.tolMm, hMin: params.hMin, hMax: params.hMax, nRing: params.nRing,
        sizeRes: params.sizeRes, seedN: params.seedN, maxPoints: params.maxPoints,
      });
      // Byte-identical: the MetricOuterWallOpts injection-field extension is a strict no-op when absent.
      expect(hashMesh(viaDispatch)).toBe(hashMesh(plain));
    } finally {
      g.__pfRegionLayer = prior;
    }
  }, 30_000);
});
