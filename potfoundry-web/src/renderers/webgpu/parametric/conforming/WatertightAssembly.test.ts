import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import { assembleWatertight, type AssemblyDimensions } from './WatertightAssembly';

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

  it('ring vertices are shared (no duplicate ring verts; vertexCount reasonable)', () => {
    // Each wall ~nRing² verts; caps add only the two drain rings (2·nRing).
    // If rings were duplicated, vertexCount would jump by ≥4·nRing.
    expect(asm.vertices.length / 3).toBeGreaterThan(0);
    // Drain rings: exactly 2·nRing new vertices beyond the two walls.
    const wallVerts = asm.surfaceRanges[0].vertexCount + asm.surfaceRanges[1].vertexCount;
    const extra = asm.vertices.length / 3 - wallVerts;
    expect(extra).toBe(2 * WALL_OPTS.nRing);
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

  it('no drain surface; bottom discs fan to single centres (2 centre verts)', () => {
    // No drain (surfaceId 5) triangles.
    const drainRange = asm.surfaceRanges.find((r) => r.surfaceId === 5);
    expect(drainRange === undefined || drainRange.indexEnd === drainRange.indexStart).toBe(true);
    const wallVerts = asm.surfaceRanges[0].vertexCount + asm.surfaceRanges[1].vertexCount;
    const extra = asm.vertices.length / 3 - wallVerts;
    // Two centre vertices (one per disc).
    expect(extra).toBe(2);
  });
});
