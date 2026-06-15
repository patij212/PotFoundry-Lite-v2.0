// LOCALIZER (diagnostic) — attribute the catastrophic <1deg slivers to the triangulation
// template (TRI_SOURCE) that produced them, on a tangled gyroid-like wall. Uses the
// EXISTING per-triangle triangleSource channel — no instrumentation. Confirms the
// Stage-2 targeted-fix target (the TRANSITION_FAN centroid-fan fallback).
import { describe, it } from 'vitest';
import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import { MetricSizingField, type SizingOptions } from './MetricSizingField';
import { PeriodicBalancedQuadtree } from './PeriodicBalancedQuadtree';
import { triangulateQuadtree, TRI_SOURCE } from './QuadtreeTriangulator';

const SOURCE_NAME: Record<number, string> = {
  0: 'PLAIN_QUAD', 1: 'TRANSITION_FAN', 2: 'EAR_CLIP', 3: 'FCT_PLAIN_QUAD',
  4: 'FCT_PLAIN_FAN', 5: 'FCT_FEATURE_CDT', 6: 'RING_OR_CAP', 7: 'FCT_EAR_CLIP',
};

// Tangled gyroid-like wall (same pathology as the Option-C spike): R0=30, H=80, A=3.
class GyroidLikeSampler implements SurfaceSampler {
  position(u: number, t: number): Vec3 {
    const th = u * 2 * Math.PI;
    const z = t * 80;
    const a = 8 * th, b = 6 * (z / 80) * 2 * Math.PI;
    const r = 30 + 3 * (Math.sin(a) * Math.cos(b) + Math.sin(b) * Math.cos(a));
    return [r * Math.cos(th), r * Math.sin(th), z];
  }
  gridResolution(): { resU: number; resT: number } {
    return { resU: 256, resT: 256 };
  }
}

function minAngle3D(p: Vec3, q: Vec3, r: Vec3): number {
  const d = (x: Vec3, y: Vec3): number => Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  const A = d(q, r), B = d(r, p), C = d(p, q);
  if (A < 1e-12 || B < 1e-12 || C < 1e-12) return 0;
  const ang = (o1: number, o2: number, op: number): number =>
    Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - op * op) / (2 * o1 * o2))));
  return Math.min(ang(B, C, A), ang(A, C, B), ang(A, B, C)) * (180 / Math.PI);
}

describe('sliver source localizer (tangled gyroid-like wall)', () => {
  it('histograms <1deg / <20deg slivers by TRI_SOURCE', () => {
    const s = new GyroidLikeSampler();
    const sizing: SizingOptions = {
      maxSagMm: 0.1, minEdgeMm: 0.3, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128,
    };
    const field = new MetricSizingField(s, sizing);
    const qt = new PeriodicBalancedQuadtree(field, s, {
      maxLevel: 11,
      pinBoundaryLevel: 6,
      uBias: 2,            // mirror GATE-B firing on an anisotropic wall
      efgSampler: s,        // mirror production (__pfConformingEfg default ON)
    });
    const mesh = triangulateQuadtree(qt);
    const src = mesh.triangleSource;
    const idx = mesh.indices;
    const vtx = mesh.vertices; // packed (u,t,0)
    const nTri = idx.length / 3;

    const below1: Record<number, number> = {};
    const below20: Record<number, number> = {};
    const total: Record<number, number> = {};
    let worst = 180, worstSrc = -1;
    for (let t = 0; t < nTri; t++) {
      const ia = idx[t * 3] * 3, ib = idx[t * 3 + 1] * 3, ic = idx[t * 3 + 2] * 3;
      const pa = s.position(vtx[ia], vtx[ia + 1]);
      const pb = s.position(vtx[ib], vtx[ib + 1]);
      const pc = s.position(vtx[ic], vtx[ic + 1]);
      const ang = minAngle3D(pa, pb, pc);
      const so = src ? src[t] : -1;
      total[so] = (total[so] ?? 0) + 1;
      if (ang < 20) below20[so] = (below20[so] ?? 0) + 1;
      if (ang < 1) below1[so] = (below1[so] ?? 0) + 1;
      if (ang < worst) { worst = ang; worstSrc = so; }
    }
    const fmt = (h: Record<number, number>): string =>
      Object.entries(h).map(([k, v]) => `${SOURCE_NAME[+k] ?? k}=${v}`).join(' ');
    // eslint-disable-next-line no-console
    console.log(`LOCALIZER tris=${nTri} worst=${worst.toFixed(3)}deg (src=${SOURCE_NAME[worstSrc] ?? worstSrc})`);
    // eslint-disable-next-line no-console
    console.log(`  total:  ${fmt(total)}`);
    // eslint-disable-next-line no-console
    console.log(`  <20deg: ${fmt(below20)}`);
    // eslint-disable-next-line no-console
    console.log(`  <1deg:  ${fmt(below1)}`);
  }, 120000);
});
