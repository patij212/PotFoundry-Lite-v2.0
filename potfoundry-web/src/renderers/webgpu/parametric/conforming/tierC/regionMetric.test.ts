// regionMetric.test.ts — FAST src smoke for the ported M=g/h² region kernel (buildMetricOuterWall).
//
// Verifies the PORT is live in src: on a small gently-rippled radial surface the kernel BUILDS a non-empty
// ConformingOuterWallResult and is WATERTIGHT-BY-CONSTRUCTION (zero index-space non-manifold edges — the domain the
// MANDATORY guardManifoldAlways guard closes; the default flip path leaves 228–257 on sharp styles). Also pins the
// D-1 reachability contract (throws flag-off) so the kernel is structurally unreachable in production.
//
// This is the fast/small acceptance gate. The HEAVY DS+GeoStar sliver reproduction (%<20° ~3.1% / ~0.6%) lives in
// the env-gated research probe research/bridge/_msurf_regionKernel.test.ts (PF_MSURFIH_REGION=1) — see that file.
import { describe, it, expect } from 'vitest';
import { buildMetricOuterWall } from './regionMetric';
import { buildRegionOuterWall, isRegionLayerStyle } from './index';
import { assembleWatertight, type AssemblyDimensions } from '../WatertightAssembly';
import type { SurfaceSampler, Vec3 } from '../SurfaceSampler';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

type FlagGlobal = { __pfRegionLayer?: boolean };
const TAU = 2 * Math.PI;
const H = 40;

// A small, gently-curved radial surface: enough curvature to drive a few refinement rounds + flips, tiny enough to
// build in milliseconds. Smooth (no discontinuities) so the metric field is well-defined everywhere.
const rippleRA: AnalyticRadiusFn = (theta, z) => 30 + 3 * Math.sin(3 * theta) + 2 * Math.sin((z / H) * TAU * 2);

/** Count index-space non-manifold edges (undirected edges incident to > 2 triangles) — the guard's domain. */
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

describe('buildMetricOuterWall — region M=g/h² kernel (src smoke)', () => {
  it('is reachable ONLY under the D-1 flag (throws flag-off)', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    delete g.__pfRegionLayer;
    try {
      expect(() => buildMetricOuterWall(rippleRA, { H }, { tolMm: 0.5, hMin: 0.5, hMax: 8 })).toThrow(/region layer/i);
    } finally {
      g.__pfRegionLayer = prior;
    }
  });

  it('builds a non-empty, watertight-by-construction ConformingOuterWallResult (nonMan 0)', () => {
    const g = globalThis as unknown as FlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      const wall = buildMetricOuterWall(rippleRA, { H }, {
        tolMm: 0.5, hMin: 0.5, hMax: 8, sizeRes: 32, seedN: 6, maxPoints: 40_000, optimizeSweeps: 2,
      });

      // Non-empty, well-shaped result.
      const nV = wall.gridVertexCount;
      expect(nV).toBeGreaterThan(10);
      expect(wall.vertices.length).toBe(nV * 3);
      expect(wall.indices.length).toBeGreaterThan(0);
      expect(wall.indices.length % 3).toBe(0);
      expect(wall.seamTriangles.length).toBe(wall.indices.length / 3);

      // Every (u,t) vertex in-range and lifts to a finite 3D position; z=0 packed in slot 3.
      for (let i = 0; i < nV; i++) {
        const u = wall.vertices[3 * i], t = wall.vertices[3 * i + 1];
        expect(wall.vertices[3 * i + 2]).toBe(0);
        expect(u).toBeGreaterThanOrEqual(0); expect(u).toBeLessThanOrEqual(1);
        expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(1);
        const r = rippleRA(u * TAU, t * H);
        expect(Number.isFinite(r * Math.cos(u * TAU))).toBe(true);
      }

      // Indices reference valid vertices.
      for (let k = 0; k < wall.indices.length; k++) {
        expect(wall.indices[k]).toBeLessThan(nV);
      }

      // WATERTIGHT-BY-CONSTRUCTION: the mandatory guard leaves zero index-space non-manifold edges.
      expect(nonManifoldEdgeCount(wall.indices)).toBe(0);

      // Boundary rings present + strictly ordered by u (bottom = t≈0, top = t≈1), for downstream seam/ring assembly.
      expect(wall.bottomRing.length).toBeGreaterThanOrEqual(2);
      expect(wall.topRing.length).toBeGreaterThanOrEqual(2);
      for (const ring of [wall.bottomRing, wall.topRing]) {
        for (let i = 1; i < ring.length; i++) {
          expect(wall.vertices[3 * ring[i]]).toBeGreaterThanOrEqual(wall.vertices[3 * ring[i - 1]]);
        }
      }
    } finally {
      g.__pfRegionLayer = prior;
    }
  });
});

// ── PROD-TIERC rim-pin + region-assembly share ──────────────────────────────
type PerfectFlagGlobal = { __pfRegionLayer?: boolean; __pfPerfectMesher?: boolean };

/** Directed-edge index-space topology of a raw index buffer (boundary / nonManifold / orientationMismatch). */
function edgeTopology(indices: ArrayLike<number>): { boundary: number; nonManifold: number; orientationMismatch: number } {
  const uses = new Map<number, { fwd: number; rev: number }>();
  const key = (a: number, b: number): number => (a < b ? a * 100_000_000 + b : b * 100_000_000 + a);
  const nTri = indices.length / 3;
  for (let f = 0; f < nTri; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      if (u === v) continue;
      const k = key(u, v);
      let e = uses.get(k);
      if (e === undefined) { e = { fwd: 0, rev: 0 }; uses.set(k, e); }
      if (u < v) e.fwd++; else e.rev++;
    }
  }
  let boundary = 0, nonManifold = 0, orientationMismatch = 0;
  for (const e of uses.values()) {
    const total = e.fwd + e.rev;
    if (total === 1) boundary++;
    else if (total > 2) nonManifold++;
    else if (total === 2 && !(e.fwd === 1 && e.rev === 1)) orientationMismatch++;
  }
  return { boundary, nonManifold, orientationMismatch };
}

/** Production-density overrides for the assembled smoke (default tractable). See the file-tail command. */
const ENV_NRING = Number(process.env.PF_REGION_NRING ?? '');
const ENV_MAXPTS = Number(process.env.PF_REGION_MAXPTS ?? '');
const SMOKE_NRING = Number.isFinite(ENV_NRING) && ENV_NRING >= 2 ? Math.floor(ENV_NRING) : 16;
const SMOKE_MAXPTS = Number.isFinite(ENV_MAXPTS) && ENV_MAXPTS >= 1000 ? Math.floor(ENV_MAXPTS) : 60_000;

describe('buildMetricOuterWall — RIM-PIN to nRing (region-assembly share)', () => {
  const rippleRA2: AnalyticRadiusFn = (theta) => 40 + 2 * Math.cos(3 * theta);
  const NRING = 16;
  const H2 = 60;

  it('pins bottom/top rings to EXACTLY nRing, welds the u-seam, stays manifold', () => {
    const g = globalThis as unknown as PerfectFlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      const wall = buildMetricOuterWall(rippleRA2, { H: H2 }, {
        tolMm: 0.5, hMin: 0.5, hMax: 8, nRing: NRING, sizeRes: 32, seedN: 4, maxPoints: 60_000, optimizeSweeps: 2,
      });

      // HARD GATE: the rim rows are exactly nRing (the annulusStrip/emitRadialCap precondition).
      expect(wall.bottomRing.length).toBe(NRING);
      expect(wall.topRing.length).toBe(NRING);

      // Rings are the evenly-spaced periodic stations u=i/nRing (ascending, u=1 folded onto u=0 by the weld).
      for (const ring of [wall.bottomRing, wall.topRing]) {
        for (let i = 0; i < ring.length; i++) {
          expect(wall.vertices[3 * ring[i]]).toBeCloseTo(i / NRING, 6);
        }
      }
      // The weld removes the distinct u=1 column ⇒ no surviving vertex sits on u≈1.
      for (let i = 0; i < wall.gridVertexCount; i++) {
        expect(wall.vertices[3 * i]).toBeLessThan(1 - 1e-6);
      }
      // Watertight-by-construction: manifold AND the periodic seam is closed ⇒ the ONLY index-space boundary
      // edges are the t=0/t=1 rims (2·nRing), which the assembly caps consume.
      const topo = edgeTopology(wall.indices);
      expect(topo.nonManifold).toBe(0);
      expect(topo.boundary).toBe(2 * NRING);
    } finally {
      g.__pfRegionLayer = prior;
    }
  });
});

describe('buildRegionOuterWall — D-2 region dispatch', () => {
  const ra: AnalyticRadiusFn = (theta) => 40 + 2 * Math.cos(3 * theta);
  const mk = (): Parameters<typeof buildRegionOuterWall>[0] => ({
    analyticRA: ra, H: 60, nRing: 16, tolMm: 0.5, hMin: 0.5, hMax: 8, sizeRes: 32, seedN: 4, maxPoints: 60_000,
  });

  it('allow-lists DragonScales + GeometricStar', () => {
    expect(isRegionLayerStyle('DragonScales')).toBe(true);
    expect(isRegionLayerStyle('GeometricStar')).toBe(true);
    expect(isRegionLayerStyle('Voronoi')).toBe(false);
    expect(isRegionLayerStyle(undefined)).toBe(false);
  });

  it('returns undefined when the region flag is OFF (byte-identical caller path)', () => {
    const g = globalThis as unknown as PerfectFlagGlobal;
    const prior = g.__pfRegionLayer;
    delete g.__pfRegionLayer;
    try {
      expect(buildRegionOuterWall(mk(), 'DragonScales')).toBeUndefined();
    } finally {
      g.__pfRegionLayer = prior;
    }
  });

  it('builds a rim-pinned M-kernel wall for DS/GeoStar when the flag is ON; undefined for other styles', () => {
    const g = globalThis as unknown as PerfectFlagGlobal;
    const prior = g.__pfRegionLayer;
    g.__pfRegionLayer = true;
    try {
      for (const style of ['DragonScales', 'GeometricStar'] as const) {
        const wall = buildRegionOuterWall(mk(), style);
        expect(wall).toBeDefined();
        expect(wall!.bottomRing.length).toBe(16);
        expect(wall!.topRing.length).toBe(16);
      }
      expect(buildRegionOuterWall(mk(), 'Voronoi')).toBeUndefined();
    } finally {
      g.__pfRegionLayer = prior;
    }
  });
});

describe('assembleWatertight adopts the rim-pinned M-kernel wall (tractable smoke)', () => {
  // Analytic pot: rippled outer (θ-only so the rim/cap radial lerp is well-defined), constant-offset inner.
  const R0 = 40, AMP = 2, K = 3, H = 60, WALL = 4, TBOTTOM = 8, RDRAIN = 8;
  const NRING = SMOKE_NRING;
  const rOuter = (theta: number): number => R0 + AMP * Math.cos(K * theta);
  const rInner = (theta: number): number => rOuter(theta) - WALL;
  const rAOuter: AnalyticRadiusFn = (theta) => rOuter(theta);
  const geom = (u: number, t: number, s: number): Vec3 => {
    const theta = 2 * Math.PI * (u - Math.floor(u));
    let r: number, z: number;
    if (s < 0.5) { r = rOuter(theta); z = t * H; }
    else if (s < 1.5) { r = rInner(theta); z = TBOTTOM + t * (H - TBOTTOM); }
    else if (s < 2.5) { r = rInner(theta) + (rOuter(theta) - rInner(theta)) * t; z = H; }
    else if (s < 3.5) { r = rOuter(theta) + (RDRAIN - rOuter(theta)) * t; z = 0; }
    else if (s < 4.5) { r = rInner(theta) + (RDRAIN - rInner(theta)) * t; z = TBOTTOM; }
    else { r = RDRAIN; z = t * TBOTTOM; }
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  };
  const outerSampler: SurfaceSampler = { position: (u, t) => geom(u, t, 0) };
  const innerSampler: SurfaceSampler = { position: (u, t) => geom(u, t, 1) };

  it('closes the RIM (no ring-mismatch throw); reports whole-solid boundary', () => {
    const g = globalThis as unknown as PerfectFlagGlobal;
    const priorR = g.__pfRegionLayer, priorP = g.__pfPerfectMesher;
    g.__pfRegionLayer = true;
    g.__pfPerfectMesher = true; // the assembly adopt hook (unchanged) gates on this.
    try {
      const wall = buildMetricOuterWall(rAOuter, { H }, {
        tolMm: 0.5, hMin: 0.5, hMax: 8, nRing: NRING, sizeRes: 32, seedN: 4, maxPoints: SMOKE_MAXPTS, optimizeSweeps: 2,
      });
      expect(wall.bottomRing.length).toBe(NRING);
      expect(wall.topRing.length).toBe(NRING);

      const dims: AssemblyDimensions = { H, tBottom: TBOTTOM, rDrain: RDRAIN };
      // No ring-mismatch throw ⇒ the shared rim/base caps adopted the pinned wall index-for-index.
      const asm = assembleWatertight(outerSampler, innerSampler, dims, {
        maxSagMm: 0.5, maxEdgeMm: 200, minEdgeMm: 0.5, gradeRatio: 2, maxLevel: 7,
        resU: 33, resT: 9, nRing: NRING, tierCOuterWall: wall,
      });

      // Position-weld topology on the GPU-evaluated 3D mesh (mirrors the WatertightAssembly test's contract).
      const nAsm = asm.vertices.length / 3;
      const pos = new Float32Array(nAsm * 3);
      for (let i = 0; i < nAsm; i++) {
        const p = geom(asm.vertices[3 * i], asm.vertices[3 * i + 1], asm.vertices[3 * i + 2]);
        pos[3 * i] = p[0]; pos[3 * i + 1] = p[1]; pos[3 * i + 2] = p[2];
      }
      const inv = 1 / 1e-4;
      const remap = new Map<string, number>();
      const rid = new Int32Array(nAsm);
      for (let i = 0; i < nAsm; i++) {
        const k = `${Math.round(pos[3 * i] * inv)},${Math.round(pos[3 * i + 1] * inv)},${Math.round(pos[3 * i + 2] * inv)}`;
        const ex = remap.get(k);
        if (ex === undefined) { remap.set(k, i); rid[i] = i; } else rid[i] = ex;
      }
      const remapped = new Uint32Array(asm.indices.length);
      for (let k = 0; k < asm.indices.length; k++) remapped[k] = rid[asm.indices[k]];
      const topo = edgeTopology(remapped);

      // otherBoundary is REPORTED, not gated at tractable density (the interior converges at production density).
      // eslint-disable-next-line no-console
      console.log(`[region-assembly smoke] nRing=${NRING} maxPts=${SMOKE_MAXPTS} verts=${nAsm} tris=${asm.indices.length / 3} boundary=${topo.boundary} nonManifold=${topo.nonManifold} orient=${topo.orientationMismatch}`);
      // The rim/base caps closed (no throw got us here); the assembled solid is watertight by construction —
      // the seam weld closes the periodic u-seam, so boundary/nonManifold/orient are all 0.
      expect(topo.nonManifold).toBe(0);
      expect(topo.boundary).toBe(0);
      expect(topo.orientationMismatch).toBe(0);
    } finally {
      g.__pfRegionLayer = priorR;
      g.__pfPerfectMesher = priorP;
    }
  });
});
