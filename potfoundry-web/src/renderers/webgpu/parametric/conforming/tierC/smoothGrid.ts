// smoothGrid.ts — SMOOTH-STYLE STRUCTURED-GRID EMITTER (E-2026-07-22 certifiable-production-mesh campaign).
//
// For C∞ smooth styles (HarmonicRipple, SuperellipseMorph, FourierBloom, SpiralRidges, SuperformulaBlossom,
// WaveInterference) a uniform (u,t) grid on the exact analytic surface, at the density that makes the chord sag ≤ tol,
// closes whole-mesh true-3D ≤0.01mm AND is JUDGE-CERTIFIABLE by the exact-dyadic partition (its columns sit on u=i/nU,
// power-of-two ⇒ exact dyadic snap). This is the certifiable production path for the smooth-style class — the
// free-Delaunay conforming mesher carries non-dyadic float stations and cannot be exact-dyadic certified.
// Measured (research/lab/2026-07-22-certifiable-production-mesh-campaign.md): all 6 smooth styles close ≤0.01 + judge
// ACCEPT on the tapered production geometry (SFB 65k → SR ~4M tris by shape).
//
// Watertight BY CONSTRUCTION (u-seam welded by index) + emergent rim counts (nU) that WatertightAssembly adopts (it
// pins the inner wall to outer.bottomRing.length, exactly as for the DS cone-fan). Flag-gated + byte-identical off:
// no default caller (the ParametricExportComputer dispatch only invokes this under __pfSmoothGrid + __pfPerfectMesher).
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';
import type { ConformingOuterWallResult } from '../ConformingOuterWall';

const TAU = 2 * Math.PI;

/** An explicit-XYZ uniform structured cylinder grid + its (u,t) provenance + rims. */
export interface SmoothGridWall {
  /** Flat xyz (3 per vertex). */
  vertices: Float32Array;
  /** Flat triangle vertex indices (3 per face). */
  indices: Uint32Array;
  /** Flat (u,t) per vertex (index-aligned; u ∈ [0,1), t ∈ [0,1]). */
  ut: number[];
  /** Circumferential column count. */
  nU: number;
  /** Row count. */
  nT: number;
  /** Ordered t=0 rim vertex indices (ascending u). */
  bottomRing: number[];
  /** Ordered t=1 rim vertex indices (ascending u). */
  topRing: number[];
}

/**
 * Emit a uniform structured periodic cylinder grid of `nU` circumferential columns × `nT` rows, lifted through `rA`.
 * Columns at u=i/nU (full 2π, u-seam welded by index → watertight cylinder), rows at t=j/(nT−1). Every quad is split
 * (a,b,c)+(a,c,d) — CCW in (u,t) = outward normal on this increasing-u/increasing-t cylinder.
 */
export function buildSmoothGridWall(rA: AnalyticRadiusFn, H: number, nU: number, nT: number): SmoothGridWall {
  const cols = Math.max(3, Math.floor(nU));
  const rows = Math.max(2, Math.floor(nT));
  const positions: number[] = [];
  const ut: number[] = [];
  const grid = new Int32Array(rows * cols);
  for (let j = 0; j < rows; j++) {
    const t = j / (rows - 1);
    const z = t * H;
    for (let i = 0; i < cols; i++) {
      const u = i / cols;
      const th = TAU * u;
      const r = rA(th, z);
      grid[j * cols + i] = positions.length / 3;
      positions.push(r * Math.cos(th), r * Math.sin(th), z);
      ut.push(u, t);
    }
  }
  const triangles: number[] = [];
  for (let j = 0; j + 1 < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const iN = i + 1 === cols ? 0 : i + 1;
      const a = grid[j * cols + i], b = grid[j * cols + iN], c = grid[(j + 1) * cols + iN], d = grid[(j + 1) * cols + i];
      triangles.push(a, b, c, a, c, d);
    }
  }
  const bottomRing: number[] = [];
  const topRing: number[] = [];
  for (let i = 0; i < cols; i++) {
    bottomRing.push(grid[i]);
    topRing.push(grid[(rows - 1) * cols + i]);
  }
  return { vertices: new Float32Array(positions), indices: new Uint32Array(triangles), ut, nU: cols, nT: rows, bottomRing, topRing };
}

/**
 * Pack a {@link SmoothGridWall} into the {@link ConformingOuterWallResult} the region dispatch + WatertightAssembly
 * consume (stores (u,t,0) — the downstream single-valued lift reproduces the xyz exactly, as the surface is smooth so
 * no vertex sits at a discontinuity), the structured index buffer, per-face seam flags by u-span, and the t=0/t=1 rims.
 */
export function smoothGridWallToOuterWall(wall: SmoothGridWall): ConformingOuterWallResult {
  const nV = wall.ut.length / 2;
  const vertices = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    vertices[3 * i] = wall.ut[2 * i];
    vertices[3 * i + 1] = wall.ut[2 * i + 1];
    vertices[3 * i + 2] = 0;
  }
  const nF = wall.indices.length / 3;
  const seamTriangles = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const ua = vertices[3 * wall.indices[3 * f]];
    const ub = vertices[3 * wall.indices[3 * f + 1]];
    const uc = vertices[3 * wall.indices[3 * f + 2]];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) seamTriangles[f] = 1;
  }
  return { vertices, indices: wall.indices, seamTriangles, gridVertexCount: nV, bottomRing: wall.bottomRing, topRing: wall.topRing };
}

/** Optional knobs for {@link deriveSmoothGridDensity}. */
export interface SmoothGridDensityOpts {
  probeRes?: number;
  minNU?: number;
  maxNU?: number;
  minNT?: number;
  maxNT?: number;
  /** Safety factor on the derived density (accounts for the coarse 2nd-difference sag estimate). Default 1.5. */
  safety?: number;
}

/**
 * Sag-based density sizing: probe the analytic surface on a coarse `probeRes²` grid, estimate the worst chord sag per
 * direction from the 3D second difference (sag ≈ |Δ²P|/8 at the probe spacing), then scale by the sag∝1/n² law to the
 * `nU`/`nT` that bring the whole-mesh chord sag ≤ `tolMm`. `nU` is rounded UP to a power of two so the grid columns snap
 * exactly on the exact-dyadic judge lattice. Clamped to sane bounds.
 */
export function deriveSmoothGridDensity(
  rA: AnalyticRadiusFn,
  H: number,
  tolMm: number,
  opts: SmoothGridDensityOpts = {},
): { nU: number; nT: number } {
  const n0 = Math.max(16, Math.floor(opts.probeRes ?? 128));
  const safety = opts.safety ?? 1.5;
  const lift = (u: number, t: number): [number, number, number] => {
    const th = TAU * u, z = t * H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const sag2 = (Pm: number[], P: number[], Pp: number[]): number =>
    0.125 * Math.hypot(Pm[0] + Pp[0] - 2 * P[0], Pm[1] + Pp[1] - 2 * P[1], Pm[2] + Pp[2] - 2 * P[2]);
  let maxSagU = 0, maxSagT = 0;
  for (let j = 0; j <= n0; j++) {
    const t = j / n0;
    for (let i = 0; i < n0; i++) {
      const u = i / n0;
      const P = lift(u, t);
      const sU = sag2(lift(((i - 1 + n0) % n0) / n0, t), P, lift(((i + 1) % n0) / n0, t)); // periodic in u
      if (sU > maxSagU) maxSagU = sU;
      if (j > 0 && j < n0) {
        const sT = sag2(lift(u, (j - 1) / n0), P, lift(u, (j + 1) / n0));
        if (sT > maxSagT) maxSagT = sT;
      }
    }
  }
  const nURaw = n0 * Math.sqrt(Math.max(maxSagU, 1e-12) / tolMm) * safety;
  const nTRaw = n0 * Math.sqrt(Math.max(maxSagT, 1e-12) / tolMm) * safety;
  let pow2 = 1;
  while (pow2 < nURaw) pow2 *= 2;
  const nU = Math.max(opts.minNU ?? 256, Math.min(opts.maxNU ?? 8192, pow2));
  const nT = Math.max(opts.minNT ?? 32, Math.min(opts.maxNT ?? 2048, Math.ceil(nTRaw)));
  return { nU, nT };
}

/** Inputs for {@link buildSmoothGridOuterWall} — the exact analytic surface + the export chord tolerance. */
export interface SmoothGridOuterWallParams {
  analyticRA: AnalyticRadiusFn;
  H: number;
  tolMm: number;
  density?: SmoothGridDensityOpts;
}

/**
 * Build the smooth-style outer wall for the production dispatch: derive the sag-based density, emit the uniform grid,
 * pack it into the {@link ConformingOuterWallResult} the assembly adopts (emergent nU rims). One call = a certifiable
 * ≤tol production outer wall for a smooth style.
 */
export function buildSmoothGridOuterWall(params: SmoothGridOuterWallParams): ConformingOuterWallResult {
  const { nU, nT } = deriveSmoothGridDensity(params.analyticRA, params.H, params.tolMm, params.density);
  return smoothGridWallToOuterWall(buildSmoothGridWall(params.analyticRA, params.H, nU, nT));
}
