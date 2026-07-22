// smoothGridAssembly.test.ts — END-TO-END proof that the productionized smooth-grid outer wall assembles into a
// WATERTIGHT closed solid through the real assembly (E-2026-07-22 certifiable-production-mesh campaign). The unit tests
// (smoothGrid.test.ts / smoothGridDispatch.test.ts) pin the emitter + dispatch guard in isolation; this closes the loop:
// with __pfSmoothGrid + __pfPerfectMesher on, the dispatch wall is ADOPTED as surfaceId 0, the inner wall is pinned to
// its EMERGENT nU rims (WatertightAssembly pins to outer.bottomRing.length), and the rim/base/drain caps stitch it into
// a 2-manifold closed solid — boundary=0, nonManifold=0, orientationMismatch=0. Runs headless (CPU-only), no WebGPU.
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from '../SurfaceSampler';
import { assembleWatertight, type AssemblyDimensions } from '../WatertightAssembly';
import { buildSmoothGridDispatchWall } from './index';
import type { ConformingOuterWallResult } from '../ConformingOuterWall';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const H = 120;
const tBottom = 8;
const rDrain = 10;
const Ri = 44; // inner wall radius — strictly inside the outer wall's min radius (~46.5)

/** Gentle C∞ outer radius (angular + vertical ripple), min ≈ 46.5 > Ri. The wall AND the caps share this exactly. */
const outerRadius: AnalyticRadiusFn = (theta: number, z: number): number =>
  50 + 2 * Math.sin(4 * theta) + 1.5 * Math.sin((Math.PI * z) / H);

const outerS: SurfaceSampler = {
  position: (u: number, t: number): Vec3 => {
    const th = TAU * (u - Math.floor(u));
    const z = t * H;
    const r = outerRadius(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  },
};
const innerS: SurfaceSampler = {
  position: (u: number, t: number): Vec3 => {
    const th = TAU * (u - Math.floor(u));
    const z = tBottom + t * (H - tBottom);
    return [Ri * Math.cos(th), Ri * Math.sin(th), z];
  },
};

/**
 * The GPU's evaluate_vertices (headless): walls via the samplers, and the rim/base/drain caps blend to the ACTUAL
 * (varying) outer radius at each u — so the caps weld to the varying wall rings with no crack (the existing assembly
 * tests can hardcode a constant Ro because their walls are constant-radius; ours is not).
 */
function geom(u: number, t: number, s: number): Vec3 {
  const th = TAU * (u - Math.floor(u));
  if (s < 0.5) return outerS.position(u, t);
  if (s < 1.5) return innerS.position(u, t);
  if (s < 2.5) {
    // rim @ z=H: inner top → outer top (actual outer radius at z=H)
    const r = Ri + (outerRadius(th, H) - Ri) * t;
    return [r * Math.cos(th), r * Math.sin(th), H];
  }
  if (s < 3.5) {
    // bottom-under @ z=0: outer bottom (actual outer radius at z=0) → drain
    const r0 = outerRadius(th, 0);
    const r = r0 + (rDrain - r0) * t;
    return [r * Math.cos(th), r * Math.sin(th), 0];
  }
  if (s < 4.5) {
    // bottom-top @ z=tBottom: inner → drain
    const r = Ri + (rDrain - Ri) * t;
    return [r * Math.cos(th), r * Math.sin(th), tBottom];
  }
  // drain: r=rDrain, z=t·tBottom
  return [rDrain * Math.cos(th), rDrain * Math.sin(th), t * tBottom];
}

function eval3D(packed: Float32Array): Float32Array {
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

/** Weld by position (1e-4 mm) then classify directed-edge uses (boundary / non-manifold / orientation). */
function topology(pos: Float32Array, indices: Uint32Array): { boundary: number; nonManifold: number; orientationMismatch: number } {
  const n = pos.length / 3;
  const inv = 1 / 1e-4;
  const buckets = new Map<string, number>();
  const remap = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * inv)},${Math.round(pos[i * 3 + 1] * inv)},${Math.round(pos[i * 3 + 2] * inv)}`;
    const ex = buckets.get(key);
    if (ex === undefined) { buckets.set(key, i); remap[i] = i; } else remap[i] = ex;
  }
  const uses = new Map<string, { fwd: number; rev: number }>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      if (a === b) continue;
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      let uu = uses.get(key);
      if (!uu) { uu = { fwd: 0, rev: 0 }; uses.set(key, uu); }
      if (a === Math.min(a, b)) uu.fwd++; else uu.rev++;
    }
  }
  let boundary = 0, nonManifold = 0, orientationMismatch = 0;
  for (const uu of uses.values()) {
    const total = uu.fwd + uu.rev;
    if (total === 1) boundary++;
    else if (total > 2) nonManifold++;
    else if (total === 2 && !(uu.fwd === 1 && uu.rev === 1)) orientationMismatch++;
  }
  return { boundary, nonManifold, orientationMismatch };
}

/** Set both gates, build+adopt the smooth wall synchronously, restore the globals (no leak, even on throw). */
function assembleWithSmoothGrid(): { outerWall: ConformingOuterWallResult; asm: { vertices: Float32Array; indices: Uint32Array } } {
  const g = globalThis as unknown as { __pfSmoothGrid?: boolean; __pfPerfectMesher?: boolean };
  const prevSmooth = g.__pfSmoothGrid;
  const prevPM = g.__pfPerfectMesher;
  g.__pfSmoothGrid = true;
  g.__pfPerfectMesher = true;
  try {
    const outerWall = buildSmoothGridDispatchWall(
      { analyticRA: outerRadius, H, tolMm: 0.2, density: { minNU: 64, maxNU: 128, minNT: 16, maxNT: 48 } },
      'HarmonicRipple',
    );
    if (!outerWall) throw new Error('dispatch returned undefined with both flags on');
    const dims: AssemblyDimensions = { H, tBottom, rDrain };
    const asm = assembleWatertight(outerS, innerS, dims, {
      maxSagMm: 0.5, maxEdgeMm: 200, minEdgeMm: 1, gradeRatio: 2, maxLevel: 7,
      resU: 33, resT: 9, nRing: 64, tierCOuterWall: outerWall,
    });
    return { outerWall, asm };
  } finally {
    g.__pfSmoothGrid = prevSmooth;
    g.__pfPerfectMesher = prevPM;
  }
}

describe('smooth-grid outer wall → assembleWatertight (end-to-end adoption, no GPU)', () => {
  const { outerWall, asm } = assembleWithSmoothGrid();
  const pos = eval3D(asm.vertices);
  const topo = topology(pos, asm.indices);

  it('adopts the emergent-nU smooth grid as surfaceId 0 (power-of-two rims)', () => {
    const nU = outerWall.bottomRing.length;
    expect(nU & (nU - 1)).toBe(0);
    expect(nU).toBeGreaterThanOrEqual(64);
    expect(outerWall.topRing.length).toBe(nU);
  });

  it('assembles into a WATERTIGHT closed solid: boundary=0, nonManifold=0, orientationMismatch=0', () => {
    expect(topo.boundary).toBe(0);
    expect(topo.nonManifold).toBe(0);
    expect(topo.orientationMismatch).toBe(0);
  });

  it('the solid is more than just the outer wall (inner wall + caps stitched in)', () => {
    const outerTris = outerWall.indices.length / 3;
    const asmTris = asm.indices.length / 3;
    expect(asmTris).toBeGreaterThan(outerTris);
  });
});
