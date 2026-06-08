import { describe, it, expect } from 'vitest';
import type { QuadLeaf } from './PeriodicBalancedQuadtree';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { MetricSizingField } from './MetricSizingField';
import { SyntheticCylinderSampler } from './SurfaceSampler';
import type { QuadtreeLike, QuadtreeMesh } from './QuadtreeTriangulator';
import { triangulateQuadtree } from './QuadtreeTriangulator';
import { triangulateQuadtreeWithFeatures } from './FeatureConformingTriangulator';
import type { FeatureLine } from './FeatureLineGraph';

/** A uniform 2^level × 2^level quadtree of leaves. */
function uniformQuadtree(level: number): QuadtreeLike {
  const span = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < span; it++) {
    for (let iu = 0; iu < span; iu++) {
      leaves.push({ u0: iu / span, t0: it / span, level });
    }
  }
  return { leaves: () => leaves };
}

/**
 * A uniform ANISOTROPIC quadtree (GAP 1 uBias): a level-L leaf spans
 * Δu=1/2^(L+B) in u, Δt=1/2^L in t — 2^(L+B) columns × 2^L rows.
 */
function uniformAnisoQuadtree(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias);
  const tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) {
    for (let iu = 0; iu < uSpan; iu++) {
      leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
    }
  }
  return { leaves: () => leaves, uBias: () => uBias };
}

const QSCALE = 1 << 24;
const qkey = (u: number, t: number): string =>
  `${Math.round(u * QSCALE)}:${Math.round(t * QSCALE)}`;

interface AuditResult {
  nonManifold: number; // edges used > 2 times
  interiorBoundary: number; // edges used once that are NOT on t=0/t=1 (T-junctions)
  tBoundaryEdges: number;
}

/**
 * Audit a wall mesh (periodic in u, open in t). After seam closure every edge
 * must be shared by exactly 2 triangles EXCEPT edges with both endpoints on
 * t=0 or both on t=1 (the open rings). An interior edge used once is a
 * T-junction; an edge used > 2 times is non-manifold.
 */
function wallEdgeAudit(mesh: QuadtreeMesh): AuditResult {
  const tEps = 1e-9;
  const vt = (i: number): number => mesh.vertices[i * 3 + 1];
  const edges = new Map<string, number>();
  const tri = mesh.indices;
  for (let k = 0; k < tri.length; k += 3) {
    const a = tri[k];
    const b = tri[k + 1];
    const c = tri[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = i < j ? `${i}:${j}` : `${j}:${i}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  let nonManifold = 0;
  let interiorBoundary = 0;
  let tBoundaryEdges = 0;
  for (const [key, count] of edges) {
    if (count > 2) nonManifold++;
    else if (count === 1) {
      const [iS, jS] = key.split(':');
      const ti = vt(Number(iS));
      const tj = vt(Number(jS));
      const onT0 = ti < tEps && tj < tEps;
      const onT1 = ti > 1 - tEps && tj > 1 - tEps;
      if (onT0 || onT1) tBoundaryEdges++;
      else interiorBoundary++;
    }
  }
  return { nonManifold, interiorBoundary, tBoundaryEdges };
}

/** Index of the mesh vertex exactly at (u,t) by quantized key, or -1. */
function vertexIndexAt(mesh: QuadtreeMesh, u: number, t: number): number {
  const n = mesh.vertices.length / 3;
  const target = qkey(u, t);
  for (let i = 0; i < n; i++) {
    if (qkey(mesh.vertices[i * 3], mesh.vertices[i * 3 + 1]) === target) return i;
  }
  return -1;
}

/** Is there a mesh vertex within Euclidean (u,t) tolerance of (u,t)? */
function hasVertexNear(mesh: QuadtreeMesh, u: number, t: number, tol: number): boolean {
  const n = mesh.vertices.length / 3;
  for (let i = 0; i < n; i++) {
    if (Math.hypot(mesh.vertices[i * 3] - u, mesh.vertices[i * 3 + 1] - t) <= tol) return true;
  }
  return false;
}

function meshHasEdge(mesh: QuadtreeMesh, ia: number, ib: number): boolean {
  const tri = mesh.indices;
  for (let k = 0; k < tri.length; k += 3) {
    const s = new Set([tri[k], tri[k + 1], tri[k + 2]]);
    if (s.has(ia) && s.has(ib)) return true;
  }
  return false;
}

/** Total signed area in (u,t), unwrapping seam triangles (u≈0 → u=1). */
function totalUnwrappedArea(mesh: QuadtreeMesh): number {
  const tri = mesh.indices;
  const u = (i: number, seam: boolean): number => {
    const uu = mesh.vertices[i * 3];
    return seam && Math.round(uu * QSCALE) === 0 ? 1 : uu;
  };
  const t = (i: number): number => mesh.vertices[i * 3 + 1];
  let total = 0;
  for (let k = 0; k < tri.length; k += 3) {
    const seam = mesh.seamTriangles[k / 3] === 1;
    const a = tri[k];
    const b = tri[k + 1];
    const c = tri[k + 2];
    total += 0.5 * ((u(b, seam) - u(a, seam)) * (t(c) - t(a)) - (u(c, seam) - u(a, seam)) * (t(b) - t(a)));
  }
  return total;
}

function vertical(u: number): FeatureLine {
  const points = [];
  for (let i = 0; i <= 16; i++) points.push({ u, t: i / 16 });
  return { kind: 'vertical-crease', points, label: `v@${u}` };
}

describe('triangulateQuadtreeWithFeatures', () => {
  it('delegates to the plain triangulator when there are no features', () => {
    const qt = uniformQuadtree(2);
    const a = triangulateQuadtreeWithFeatures(qt, []);
    const b = triangulateQuadtree(qt);
    expect(a.vertices.length).toBe(b.vertices.length);
    expect(a.indices.length).toBe(b.indices.length);
    expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  });

  it('plain mesh audits clean on a 4×4 grid (audit sanity)', () => {
    const mesh = triangulateQuadtree(uniformQuadtree(2));
    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0);
  });

  it('inserts a non-dyadic vertical feature as a connected edge chain, watertight + T-junction-free', () => {
    const qt = uniformQuadtree(2); // 4×4 grid; u=0.3 is NOT on any cell column
    const mesh = triangulateQuadtreeWithFeatures(qt, [vertical(0.3)]);

    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0); // no T-junctions

    // The crease is tracked by an actual connected chain of mesh edges (sharp
    // dihedral): every feature SAMPLE point is a mesh vertex, and every
    // consecutive sample pair is a real mesh edge.
    const line = vertical(0.3);
    const idx = line.points.map((p) => vertexIndexAt(mesh, p.u, p.t));
    for (const i of idx) expect(i).toBeGreaterThanOrEqual(0);
    for (let r = 0; r + 1 < idx.length; r++) {
      expect(meshHasEdge(mesh, idx[r], idx[r + 1])).toBe(true);
    }

    // Coverage preserved: triangles tile the whole [0,1)x[0,1] domain, all CCW.
    expect(totalUnwrappedArea(mesh)).toBeCloseTo(1, 6);
  });

  it('inserts a closed loop (cell boundary) watertight + T-junction-free, every vertex tracked', () => {
    // A diamond loop centred at (0.5,0.5) — the prototype for a honeycomb/Voronoi
    // cell boundary. Non-dyadic corners, crosses many cells, closes on itself.
    const pts = [];
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const a = (2 * Math.PI * i) / N;
      pts.push({ u: 0.5 + 0.23 * Math.cos(a), t: 0.5 + 0.23 * Math.sin(a) });
    }
    const loop: FeatureLine = { kind: 'vertical-crease', points: pts, label: 'loop' };
    const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(3), [loop]);

    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0);
    expect(totalUnwrappedArea(mesh)).toBeCloseTo(1, 6);

    // The loop is tracked: a mesh vertex sits on every sample point (curve →
    // real mesh edges). 1e-5 absorbs benign sub-quantum jitter at near-tangent
    // points; the production fidelity tolerance is ~2e-3, far looser.
    for (const p of pts) expect(hasVertexNear(mesh, p.u, p.t, 1e-5)).toBe(true);
  });

  it('tangent border running just below a horizontal grid line stays T-junction-free', () => {
    // GAP 2 regression: a dense border that runs nearly PARALLEL to a cell edge,
    // grazing it from below (the Voronoi / curve-extremum failure mode). The
    // cell below snaps the near-edge curve onto the shared edge (subdividing it);
    // the cell above never sees the curve and keeps the edge un-subdivided →
    // a T-junction triplet. The grid-line vertex registry must make both cells
    // carry the identical edge-vertex set. Tested across amplitudes incl. the
    // near-tangent worst case.
    for (const amp of [0.06, 0.02, 0.005, 0.001]) {
      const pts = [];
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const u = 0.05 + 0.9 * (i / N);
        const t = 0.5 - 0.0005 - amp * 0.5 * (1 + Math.cos(2 * Math.PI * 5 * (i / N)));
        pts.push({ u, t });
      }
      const line: FeatureLine = { kind: 'general-curve', points: pts, label: `wavy@${amp}` };
      const mesh = triangulateQuadtreeWithFeatures(uniformQuadtree(4), [line], { cornerSnap: 0.06 / 16 });
      const audit = wallEdgeAudit(mesh);
      expect(audit.nonManifold, `nonManifold amp=${amp}`).toBe(0);
      expect(audit.interiorBoundary, `T-junctions amp=${amp}`).toBe(0);
      expect(totalUnwrappedArea(mesh)).toBeCloseTo(1, 5);
    }
  });

  it('inserts a loop into an ANISOTROPIC (uBias>0) quadtree, watertight + T-junction-free', () => {
    // GAP 1 STEP 3: under the anisotropy bias the cells are 2^B× finer in u than t.
    // The feature insertion (cellSet/neighbour reconstruction, edge-snap, corner-snap
    // thresholds) must respect that — else slivers/T-junctions. A closed loop crosses
    // many anisotropic cells in both axes.
    for (const uBias of [1, 2, 3]) {
      const qt = uniformAnisoQuadtree(3, uBias); // 2^(3+B) cols × 8 rows
      const pts = [];
      const N = 48;
      for (let i = 0; i <= N; i++) {
        const a = (2 * Math.PI * i) / N;
        pts.push({ u: 0.5 + 0.27 * Math.cos(a), t: 0.5 + 0.27 * Math.sin(a) });
      }
      const loop: FeatureLine = { kind: 'general-curve', points: pts, label: `loop@B${uBias}` };
      // cornerSnap is the t-extent fraction (production: 0.06/2^featureLevel, B-independent);
      // the triangulator derives the finer u-threshold cornerSnap/2^B from qt.uBias().
      const cornerSnap = 0.06 / (1 << 3);
      const mesh = triangulateQuadtreeWithFeatures(qt, [loop], { cornerSnap });
      const audit = wallEdgeAudit(mesh);
      expect(audit.nonManifold, `nonManifold B=${uBias}`).toBe(0);
      expect(audit.interiorBoundary, `T-junctions B=${uBias}`).toBe(0);
      expect(totalUnwrappedArea(mesh)).toBeCloseTo(1, 5);
      // The loop is tracked: a mesh vertex near every sample. A sample may be
      // edge-snapped by up to ~2·cornerSnap (snapToCellEdge then snapToAnchor) at
      // this coarse level, so allow that margin (production featureLevel=7 makes
      // cornerSnap ≪ the 2.3e-3 feature tolerance).
      for (const p of pts) expect(hasVertexNear(mesh, p.u, p.t, 2.5 * cornerSnap)).toBe(true);
    }
  });

  it('inserts a diagonal feature on a real adaptive 2:1-balanced quadtree', () => {
    // Adaptive (non-uniform) tree from a rippled cylinder → transition cells with
    // mid-edge vertices. A diagonal feature exercises crossings on both u- and
    // t-edges AND ordering against mid-edge vertices.
    const sampler = new SyntheticCylinderSampler(45, 120, 6, 7);
    const field = new MetricSizingField(sampler, {
      maxSagMm: 0.3,
      minEdgeMm: 1,
      maxEdgeMm: 20,
      gradeRatio: 2,
      resU: 64,
      resT: 64,
    });
    const qt = new PeriodicBalancedQuadtree(field, sampler, { maxLevel: 6 });

    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const f = i / 40;
      pts.push({ u: 0.13 + 0.74 * f, t: f }); // stays within [0,1), no seam wrap
    }
    const diag: FeatureLine = { kind: 'helical-crease', points: pts, label: 'diag' };
    const mesh = triangulateQuadtreeWithFeatures(qt, [diag]);

    const audit = wallEdgeAudit(mesh);
    expect(audit.nonManifold).toBe(0);
    expect(audit.interiorBoundary).toBe(0);
    expect(totalUnwrappedArea(mesh)).toBeCloseTo(1, 5);
    for (const p of pts) expect(hasVertexNear(mesh, p.u, p.t, 1e-5)).toBe(true);
  });
});
