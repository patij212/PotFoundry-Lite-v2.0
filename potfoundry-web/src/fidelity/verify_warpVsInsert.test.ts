/**
 * verify_warpVsInsert.test.ts — MAIN-LOOP independent check of the accuracy
 * audit's most consequential claim ("the warp doesn't fix the real sliver").
 *
 * The audit's verify_modelVsRealMesh measured TWO things that are NOT the
 * proposed cure: (B) the CURRENT path = crests INSERTED as cutting constraints
 * on an axis grid + snap (→ 1.24deg), and (C) a warped flank quad vs an axis
 * flank quad where NEITHER inserts the crest. Neither runs the actual proposed
 * architecture: crest becomes a COLUMN EDGE (no cutting insertion, no snap) via
 * a t-dependent warp on the PLAIN triangulator.
 *
 * This probe runs the REAL triangulators both ways and scores the EMITTED
 * triangles in 3D on BOTH the exact f64 surface AND the production bilinear-256
 * surface (what the real mesh is built on), at production feature-cell density
 * AND one level finer (the tRows-sensitivity concern):
 *   PATH A (current): triangulateQuadtreeWithFeatures (crests inserted + snap)
 *   PATH B (proposed): triangulateQuadtree (plain) + t-dependent petal warp
 *                      (crests pinned onto columns; watertight per-vertex bijection)
 *
 * If B >> A (B sliver-free where A slivers), the column-via-warp architecture is
 * sound and the audit's "warp doesn't fix it" is a path mismatch. If B also
 * slivers, the architecture is in genuine doubt.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { triangulateQuadtree } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { buildCreaseUWarp, applyUWarp, type UWarp } from '../renderers/webgpu/parametric/conforming/CreaseUWarp';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike, QuadtreeMesh } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import type { PositionSampler } from './metrics';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);

const DENSE_RES = 256;
function buildBilinear(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = exact.position(col / res, tVal);
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}
const bilinear = buildBilinear(DENSE_RES);

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}
/** Crest+valley loci present at height t (the CreasePetalWarp loci). */
function petalLociAt(t: number): number[] {
  const m = mOf(t);
  const out: number[] = [];
  for (let j = 1; (2 * j - 1) / (2 * m) < 1 && j < 4096; j++) {
    out.push((2 * j - 1) / (2 * m));
    if (j / m < 1) out.push(j / m);
  }
  return out;
}

type V3 = readonly [number, number, number];
function triMin3(P: PositionSampler, u0: number, t0: number, u1: number, t1: number, u2: number, t2: number): number {
  const a = P.position(u0, t0), b = P.position(u1, t1), c = P.position(u2, t2);
  const ang = (X: V3, Y: V3, Z: V3): number => {
    const x1 = Y[0] - X[0], y1 = Y[1] - X[1], z1 = Y[2] - X[2];
    const x2 = Z[0] - X[0], y2 = Z[1] - X[1], z2 = Z[2] - X[2];
    const l1 = Math.hypot(x1, y1, z1), l2 = Math.hypot(x2, y2, z2);
    if (l1 < 1e-12 || l2 < 1e-12) return 0;
    let cs = (x1 * x2 + y1 * y2 + z1 * z2) / (l1 * l2);
    cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
    return (Math.acos(cs) * 180) / Math.PI;
  };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}

interface Dist { n: number; min: number; p1: number; median: number; b15: number; b20: number }
function distOf(v: number[]): Dist {
  const s = [...v].sort((x, y) => x - y);
  const n = s.length;
  let b15 = 0, b20 = 0;
  for (const x of s) { if (x < 15) b15++; if (x < 20) b20++; }
  return { n, min: n ? s[0] : 0, p1: n ? s[Math.floor(0.01 * n)] : 0, median: n ? s[Math.floor(0.5 * n)] : 0, b15: n ? 100 * b15 / n : 0, b20: n ? 100 * b20 / n : 0 };
}
function fmt(name: string, d: Dist): string {
  return `${name}: n=${d.n} min ${d.min.toFixed(2)} p1 ${d.p1.toFixed(2)} median ${d.median.toFixed(2)} <15 ${d.b15.toFixed(2)}% <20 ${d.b20.toFixed(2)}%`;
}

function uniformAnisoQuadtree(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias);
  const tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++)
    for (let iu = 0; iu < uSpan; iu++)
      leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  return { leaves: () => leaves, uBias: () => uBias };
}

/** Score a (u,t) mesh's emitted triangles in 3D on a given surface, seam column
 *  excluded (out of scope), via the SAME exclusion as the probes. */
function scoreMesh(mesh: QuadtreeMesh, surf: PositionSampler, uSpanForSeam: number): number[] {
  const v = mesh.vertices, idx = mesh.indices;
  const seam = 1.5 / uSpanForSeam;
  const out: number[] = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const cu = (((v[a * 3] + v[b * 3] + v[c * 3]) / 3) % 1 + 1) % 1;
    if (cu < seam || cu > 1 - seam) continue; // seam out of scope
    out.push(triMin3(surf, v[a * 3], v[a * 3 + 1], v[b * 3], v[b * 3 + 1], v[c * 3], v[c * 3 + 1]));
  }
  return out;
}

/** Apply the t-dependent petal warp to a plain (u,t) mesh in place (watertight:
 *  per-vertex bijection, seam-fixed). Caches the per-t-row warp. */
function petalWarpMesh(mesh: QuadtreeMesh, grid: number): void {
  const v = mesh.vertices;
  const cache = new Map<number, UWarp>();
  for (let i = 0; i < v.length; i += 3) {
    const t = v[i + 1];
    const key = Math.round(t * (1 << 20));
    let w = cache.get(key);
    if (!w) { w = buildCreaseUWarp(petalLociAt(t), grid); cache.set(key, w); }
    v[i] = applyUWarp(w, v[i]);
  }
}

describe('VERIFY warp-as-columns vs insert-as-constraint (real triangulator, both surfaces)', () => {
  for (const level of [7, 8]) {
    it(`level ${level} (tSpan=${1 << level}, uSpan=${1 << (level + SFB_UBIAS)})`, () => {
      const uSpan = 1 << (level + SFB_UBIAS);
      const cornerSnap = 0.06 / (1 << level);
      const uMargin = 1.5 / (1 << level);
      const tMargin = 1 / 1024;

      // PATH A — current: crests INSERTED as cutting constraints + snap.
      const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
      const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
      const meshA = triangulateQuadtreeWithFeatures(uniformAnisoQuadtree(level, SFB_UBIAS), clipped, { cornerSnap });

      // PATH B — proposed: plain triangulator, crests pinned onto COLUMNS by the
      // t-dependent petal warp (no cutting insertion, no snap).
      const meshB = triangulateQuadtree(uniformAnisoQuadtree(level, SFB_UBIAS));
      petalWarpMesh(meshB, uSpan);

      const aEx = distOf(scoreMesh(meshA, exact, uSpan));
      const aBi = distOf(scoreMesh(meshA, bilinear, uSpan));
      const bEx = distOf(scoreMesh(meshB, exact, uSpan));
      const bBi = distOf(scoreMesh(meshB, bilinear, uSpan));

      /* eslint-disable no-console */
      console.log(`\n===== WARP-vs-INSERT (real triangulator), level ${level}, seam excluded =====`);
      console.log('  ' + fmt('A insert+snap  EXACT   ', aEx));
      console.log('  ' + fmt('A insert+snap  BILINEAR', aBi));
      console.log('  ' + fmt('B warp-columns EXACT   ', bEx));
      console.log('  ' + fmt('B warp-columns BILINEAR', bBi));
      console.log('=============================================================================\n');
      /* eslint-enable no-console */

      expect(aEx.n).toBeGreaterThan(1000);
      expect(bEx.n).toBeGreaterThan(1000);
    });
  }
});
