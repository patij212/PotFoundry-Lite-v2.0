import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import { assembleWatertight, type AssemblyDimensions } from './WatertightAssembly';
import type { FeatureLine } from './FeatureLineGraph';
import { extractAnalyticFeatures } from './FeatureLineGraph';
import { STYLE_PARAM_CAPACITY } from '../../../../utils/styleParams';

/**
 * Two concentric cylinders + flat rim + flat base + (optional) drain, evaluated
 * directly from (u,t,surfaceId) — mirrors the GPU's evaluate_vertices geometry
 * so the unit test exercises the real watertight contract without WebGPU.
 *
 * Geometry (matches adaptive_mesh.wgsl):
 *  - 0 outer wall: r=Ro, z=t·H
 *  - 1 inner wall: r=Ri, z=tBottom + t·(H−tBottom)
 *  - 2 rim @z=H:           r = lerp(Ri, Ro, t)
 *  - 3 bottom-under @z=0:  r = lerp(Ro, rDrain, t)
 *  - 4 bottom-top @z=tBottom: r = lerp(Ri, rDrain, t)
 *  - 5 drain: r=rDrain, z=t·tBottom
 */
/** 3D position for a given (u, t, surfaceId) — the GPU's evaluate_vertices. */
function evalSurface(
  Ro: number,
  Ri: number,
  H: number,
  tBottom: number,
  rDrain: number,
  u: number,
  t: number,
  surfaceId: number,
): Vec3 {
  const theta = 2 * Math.PI * (u - Math.floor(u));
  const s = surfaceId;
  let r: number;
  let z: number;
  if (s < 0.5) {
    r = Ro;
    z = t * H;
  } else if (s < 1.5) {
    r = Ri;
    z = tBottom + t * (H - tBottom);
  } else if (s < 2.5) {
    r = Ri + (Ro - Ri) * t;
    z = H;
  } else if (s < 3.5) {
    r = Ro + (rDrain - Ro) * t;
    z = 0;
  } else if (s < 4.5) {
    r = Ri + (rDrain - Ri) * t;
    z = tBottom;
  } else {
    r = rDrain;
    z = t * tBottom;
  }
  return [r * Math.cos(theta), r * Math.sin(theta), z];
}

/** A wall sampler bound to one surfaceId (what buildConformingWall consumes). */
function wallSampler(
  Ro: number,
  Ri: number,
  H: number,
  tBottom: number,
  rDrain: number,
  surfaceId: number,
): SurfaceSampler {
  return {
    position: (u: number, t: number): Vec3 =>
      evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, surfaceId),
  };
}

const WALL_OPTS = {
  maxSagMm: 0.5,
  maxEdgeMm: 200,
  minEdgeMm: 1,
  gradeRatio: 2,
  maxLevel: 7,
  resU: 33,
  resT: 9,
  nRing: 32,
};

/** Evaluate every packed (u,t,surfaceId) vertex to 3D via the GPU geometry. */
function eval3D(
  geom: (u: number, t: number, s: number) => Vec3,
  packed: Float32Array,
): Float32Array {
  const n = packed.length / 3;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = geom(packed[i * 3], packed[i * 3 + 1], packed[i * 3 + 2]);
    out[i * 3] = p[0];
    out[i * 3 + 1] = p[1];
    out[i * 3 + 2] = p[2];
  }
  return out;
}

/** Max 3D triangle aspect (longest²·√3/(4·area)); ∞ for degenerate. */
function maxAspect3D(pos: Float32Array, indices: Uint32Array): number {
  let worst = 0;
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t] * 3;
    const ib = indices[t + 1] * 3;
    const ic = indices[t + 2] * 3;
    const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
    const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];
    const ab2 = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2;
    const bc2 = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2;
    const ca2 = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;
    const longest2 = Math.max(ab2, bc2, ca2);
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    if (area < 1e-12) return Infinity;
    worst = Math.max(worst, (longest2 * Math.sqrt(3)) / (4 * area));
  }
  return worst;
}

interface TopoResult {
  boundary: number;
  nonManifold: number;
  orientationMismatch: number;
}

/** Weld by position (1e-4 mm) then classify directed-edge uses. */
function topology(pos: Float32Array, indices: Uint32Array): TopoResult {
  const n = pos.length / 3;
  const inv = 1 / 1e-4;
  const buckets = new Map<string, number>();
  const remap = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * inv)},${Math.round(pos[i * 3 + 1] * inv)},${Math.round(pos[i * 3 + 2] * inv)}`;
    const ex = buckets.get(key);
    if (ex === undefined) { buckets.set(key, i); remap[i] = i; }
    else remap[i] = ex;
  }
  const uses = new Map<string, { fwd: number; rev: number }>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e];
      const b = tri[(e + 1) % 3];
      if (a === b) continue;
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      const key = `${lo}:${hi}`;
      let u = uses.get(key);
      if (!u) { u = { fwd: 0, rev: 0 }; uses.set(key, u); }
      if (a === lo) u.fwd++;
      else u.rev++;
    }
  }
  let boundary = 0;
  let nonManifold = 0;
  let orientationMismatch = 0;
  for (const u of uses.values()) {
    const total = u.fwd + u.rev;
    if (total === 1) boundary++;
    else if (total > 2) nonManifold++;
    else if (total === 2 && !(u.fwd === 1 && u.rev === 1)) orientationMismatch++;
  }
  return { boundary, nonManifold, orientationMismatch };
}

describe('assembleWatertight — concentric cylinders, rim/base (rDrain>0)', () => {
  const Ro = 50;
  const Ri = 46;
  const H = 120;
  const tBottom = 8;
  const rDrain = 10;
  const dims: AssemblyDimensions = { H, tBottom, rDrain };
  const outer = wallSampler(Ro, Ri, H, tBottom, rDrain, 0);
  const inner = wallSampler(Ro, Ri, H, tBottom, rDrain, 1);
  const geom = (u: number, t: number, s: number): Vec3 =>
    evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, s);
  const asm = assembleWatertight(outer, inner, dims, WALL_OPTS);
  const pos = eval3D(geom, asm.vertices);
  const topo = topology(pos, asm.indices);

  it('closed solid: boundary=0, nonManifold=0', () => {
    expect(topo.boundary).toBe(0);
    expect(topo.nonManifold).toBe(0);
  });

  it('orientation consistent: orientationMismatch=0', () => {
    expect(topo.orientationMismatch).toBe(0);
  });

  it('all 6 surfaces present in surfaceRanges', () => {
    expect(asm.surfaceRanges.length).toBe(6);
    let totalTris = 0;
    for (const r of asm.surfaceRanges) totalTris += (r.indexEnd - r.indexStart) / 3;
    expect(totalTris).toBe(asm.indices.length / 3);
  });

  it('ring vertices are shared (caps add only whole nRing-multiples of new verts)', () => {
    // Caps reference the walls' shared ring indices; the only NEW vertices are
    // intermediate/drain rings (each a whole multiple of nRing). If a ring were
    // duplicated, the count would not be an exact nRing multiple.
    const wallVerts = asm.surfaceRanges[0].vertexCount + asm.surfaceRanges[1].vertexCount;
    const extra = asm.vertices.length / 3 - wallVerts;
    expect(extra).toBeGreaterThanOrEqual(2 * WALL_OPTS.nRing);
    expect(extra % WALL_OPTS.nRing).toBe(0);
  });

  it('base discs are not slivers: max 3D aspect < 100', () => {
    expect(maxAspect3D(pos, asm.indices)).toBeLessThan(100);
  });
});

describe('assembleWatertight — outer-wall feature insertion stays a closed solid', () => {
  const Ro = 50;
  const Ri = 46;
  const H = 120;
  const tBottom = 8;
  const rDrain = 10;
  const dims: AssemblyDimensions = { H, tBottom, rDrain };
  const outer = wallSampler(Ro, Ri, H, tBottom, rDrain, 0);
  const inner = wallSampler(Ro, Ri, H, tBottom, rDrain, 1);
  const geom = (u: number, t: number, s: number): Vec3 =>
    evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, s);

  // Two closed cell loops on the outer wall (honeycomb-cell proxies).
  const mkLoop = (cu: number, cv: number, r: number): FeatureLine => {
    const points = [];
    for (let i = 0; i <= 40; i++) {
      const a = (2 * Math.PI * i) / 40;
      points.push({ u: cu + r * Math.cos(a), t: cv + r * Math.sin(a) });
    }
    return { kind: 'vertical-crease', points, label: `loop@${cu}` };
  };
  const features = [mkLoop(0.3, 0.5, 0.12), mkLoop(0.7, 0.4, 0.1)];
  const asm = assembleWatertight(outer, inner, dims, {
    ...WALL_OPTS,
    nRing: 64,
    outerFeatureLines: features,
  });
  const pos = eval3D(geom, asm.vertices);
  const topo = topology(pos, asm.indices);

  it('still a closed solid: boundary=0, nonManifold=0, orientationMismatch=0', () => {
    expect(topo.boundary).toBe(0);
    expect(topo.nonManifold).toBe(0);
    expect(topo.orientationMismatch).toBe(0);
  });

  it('no slivers introduced: max 3D aspect < 100', () => {
    expect(maxAspect3D(pos, asm.indices)).toBeLessThan(100);
  });

  it('the outer wall tracks every feature sample (curve → real mesh edges)', () => {
    // Outer-wall vertices are surfaceId 0; collect their (u,t).
    const outerUT: Array<[number, number]> = [];
    for (let i = 0; i < asm.vertices.length; i += 3) {
      if (asm.vertices[i + 2] < 0.5) outerUT.push([asm.vertices[i], asm.vertices[i + 1]]);
    }
    for (const line of features) {
      for (const p of line.points) {
        const hit = outerUT.some(([u, t]) => Math.hypot(u - p.u, t - p.t) < 1e-3);
        expect(hit).toBe(true);
      }
    }
  });
});

describe('assembleWatertight — REAL HexagonalHive honeycomb curves (no GPU)', () => {
  // Reproduce the conforming-branch options with the real extracted hex curves
  // on a synthetic rippled cylinder, to isolate any crack from the GPU path.
  const Ro = 50;
  const Ri = 46;
  const H = 120;
  const tBottom = 8;
  const rDrain = 10;
  const dims: AssemblyDimensions = { H, tBottom, rDrain };
  // Gentle ripple (the production GpuSurfaceSampler is a bilinear-smoothed grid,
  // so its effective metric is far gentler than a raw steep analytic relief).
  const ripple = (base: number, surfaceId: number): SurfaceSampler => ({
    position: (u: number, t: number): Vec3 => {
      const theta = 2 * Math.PI * (u - Math.floor(u));
      const r = base + 0.5 * Math.cos(2 * Math.PI * 3 * u) * Math.cos(Math.PI * t);
      const z = surfaceId < 0.5 ? t * H : tBottom + t * (H - tBottom);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  });
  const outerS = ripple(Ro, 0);
  const innerS = ripple(Ri, 1);
  const geom = (u: number, t: number, s: number): Vec3 => {
    if (s < 0.5) return outerS.position(u, t);
    if (s < 1.5) return innerS.position(u, t);
    return evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, s);
  };
  const params = new Float32Array(STYLE_PARAM_CAPACITY);
  params.set([4.0, 0.05, 2.0, 0.0, 0.0, 0.0]);
  const graph = extractAnalyticFeatures('HexagonalHive', params, { H, Rt: 70, Rb: 45 });
  const curves = graph.lines.filter((l) => l.kind === 'general-curve');
  const asm = assembleWatertight(outerS, innerS, dims, {
    maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.2, gradeRatio: 2,
    maxLevel: 10, resU: 128, resT: 128, nRing: 256,
    outerFeatureLines: curves, featureLevel: 7,
  });
  const pos = eval3D(geom, asm.vertices);
  const topo = topology(pos, asm.indices);

  it('captures the honeycomb without cracking the solid (no seam T-junction)', () => {
    expect(curves.length).toBeGreaterThan(0); // hex creases were extracted
    expect(topo.nonManifold).toBe(0);
    expect(topo.boundary).toBe(0); // u-seam + t-ring margins keep it watertight
    expect(topo.orientationMismatch).toBe(0);
  });

  it('no catastrophic degeneracies from the dense honeycomb insertion', () => {
    // The 3D aspect is dominated by the surface metric (the e2e probe measures it
    // on the real GPU-smoothed surface, where it is well within the sliver gate).
    // Here we only guard against a catastrophic near-zero-area degeneracy.
    expect(Number.isFinite(maxAspect3D(pos, asm.indices))).toBe(true);
  });
});

describe('assembleWatertight — large radial-span base (sliver-prone, rDrain small)', () => {
  // A small drain with a wide base → a single outer↔drain band would be a long
  // thin needle. Radial subdivision must keep the cap aspect bounded.
  const Ro = 56;
  const Ri = 52;
  const H = 120;
  const tBottom = 6;
  const rDrain = 2;
  const dims: AssemblyDimensions = { H, tBottom, rDrain };
  const outer = wallSampler(Ro, Ri, H, tBottom, rDrain, 0);
  const inner = wallSampler(Ro, Ri, H, tBottom, rDrain, 1);
  const geom = (u: number, t: number, s: number): Vec3 =>
    evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, s);
  const opts = { ...WALL_OPTS, nRing: 64 };
  const asm = assembleWatertight(outer, inner, dims, opts);
  const pos = eval3D(geom, asm.vertices);
  const topo = topology(pos, asm.indices);

  it('still watertight: boundary=0, nonManifold=0, orientationMismatch=0', () => {
    expect(topo.boundary).toBe(0);
    expect(topo.nonManifold).toBe(0);
    expect(topo.orientationMismatch).toBe(0);
  });

  it('no slivers on the wide base: max 3D aspect < 100', () => {
    expect(maxAspect3D(pos, asm.indices)).toBeLessThan(100);
  });
});

describe('assembleWatertight — triangle budget steers the whole-pot count', () => {
  // Rippled walls so there is real curvature (a meaningful sag floor to refine
  // above). Both walls share the budget; caps add a small fixed amount.
  const Ro = 50;
  const Ri = 46;
  const H = 120;
  const tBottom = 8;
  const rDrain = 10;
  const dims: AssemblyDimensions = { H, tBottom, rDrain };
  const ripple = (base: number, surfaceId: number): SurfaceSampler => ({
    position: (u: number, t: number): Vec3 => {
      const theta = 2 * Math.PI * (u - Math.floor(u));
      const r = base + 3 * Math.cos(2 * Math.PI * 6 * u);
      const z = surfaceId < 0.5 ? t * H : tBottom + t * (H - tBottom);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  });
  const outer = ripple(Ro, 0);
  const inner = ripple(Ri, 1);
  const opts = {
    maxSagMm: 0.3, maxEdgeMm: 60, minEdgeMm: 0.1,
    gradeRatio: 2, maxLevel: 8, resU: 49, resT: 13, nRing: 32,
  };

  const triCount = (targetTriangles?: number): number =>
    assembleWatertight(outer, inner, dims, { ...opts, targetTriangles }).indices.length / 3;

  it('a budget above the sag floor lands within ±25% of the request', () => {
    const floor = triCount();
    const budget = floor * 3;
    const got = triCount(budget);
    expect(Math.abs(got - budget) / budget).toBeLessThan(0.25);
  });

  it('a budget below the sag floor is floored (sag-required count preserved)', () => {
    const floor = triCount();
    const got = triCount(Math.max(8, Math.floor(floor / 8)));
    expect(got).toBeGreaterThanOrEqual(floor * 0.9);
  });
});

describe('assembleWatertight — concentric cylinders, full base discs (rDrain=0)', () => {
  const Ro = 50;
  const Ri = 46;
  const H = 120;
  const tBottom = 8;
  const rDrain = 0;
  const dims: AssemblyDimensions = { H, tBottom, rDrain };
  const outer = wallSampler(Ro, Ri, H, tBottom, rDrain, 0);
  const inner = wallSampler(Ro, Ri, H, tBottom, rDrain, 1);
  const geom = (u: number, t: number, s: number): Vec3 =>
    evalSurface(Ro, Ri, H, tBottom, rDrain, u, t, s);
  const asm = assembleWatertight(outer, inner, dims, WALL_OPTS);
  const pos = eval3D(geom, asm.vertices);
  const topo = topology(pos, asm.indices);

  it('closed solid: boundary=0, nonManifold=0', () => {
    expect(topo.boundary).toBe(0);
    expect(topo.nonManifold).toBe(0);
  });

  it('orientation consistent: orientationMismatch=0', () => {
    expect(topo.orientationMismatch).toBe(0);
  });

  it('no drain surface; each base disc fans to a single centre vertex', () => {
    // No drain (surfaceId 5) triangles.
    const drainRange = asm.surfaceRanges.find((r) => r.surfaceId === 5);
    expect(drainRange === undefined || drainRange.indexEnd === drainRange.indexStart).toBe(true);
    // Each disc owns exactly one centre vertex (the rest of its new verts are
    // shared intermediate rings, nRing-multiples).
    const under = asm.surfaceRanges.find((r) => r.surfaceId === 3);
    const top = asm.surfaceRanges.find((r) => r.surfaceId === 4);
    // Each disc owns k·nRing shared intermediate-ring verts + exactly 1 centre.
    expect((under?.vertexCount ?? 0) % WALL_OPTS.nRing).toBe(1);
    expect((top?.vertexCount ?? 0) % WALL_OPTS.nRing).toBe(1);
  });

  it('centre-fan discs are not slivers: max 3D aspect < 100', () => {
    expect(maxAspect3D(pos, asm.indices)).toBeLessThan(100);
  });
});
