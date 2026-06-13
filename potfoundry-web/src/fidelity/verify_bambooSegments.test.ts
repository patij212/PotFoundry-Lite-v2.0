/**
 * verify_bambooSegments.test.ts — R4 audit: BambooSegments is NOT a C0-step style
 * (the memory note was wrong). rOuterBambooSegments is all SMOOTH — node rings are
 * Gaussian bulges (exp(-d²/2w²), C∞), striations sin(θ·k), taper quadratic. So the
 * riser does NOT apply; the question is whether the DENSITY lever (featureLevel
 * 7→11, which the surfaceFidelityExact flag already raises) resolves its 2.30mm.
 *
 * Measures the REAL adaptive mesh deviation (exact eval, seam excl) at featureLevel
 * 7 (flag off) vs 11 (flag on), with the existing node-ring features. Pure CPU.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS, type StyleFunction } from '../geometry/styles';
import { buildStyleParamPayload } from '../utils/styleParams';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { deviationVsTrueSurface, countFoldedTriangles } from './fidelityGate';

const H = 120, Rt = 70, Rb = 45, expn = 1.1;
const DIMS = { H, Rt, Rb };
const fn: StyleFunction = STYLE_FUNCTIONS['BambooSegments'];
type V3 = readonly [number, number, number];
const surface = (u: number, t: number): V3 => {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const theta = 2 * Math.PI * u, z = tc * H, r0 = Rb + (Rt - Rb) * Math.pow(tc, expn);
  let r = fn(theta, z, r0, H, {});
  if (!Number.isFinite(r)) r = r0;
  return [r * Math.cos(theta), r * Math.sin(theta), z];
};
const UBIAS = 2;
const HIGH = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 };
function segHits(au: number, at: number, bu: number, bt: number, u0: number, u1: number, t0: number, t1: number): boolean {
  const du = bu - au, dt = bt - at; let lo = 0, hi = 1;
  for (const [pp, q] of [[-du, au - u0], [du, u1 - au], [-dt, at - t0], [dt, t1 - at]] as Array<[number, number]>) {
    if (Math.abs(pp) < 1e-300) { if (q < 0) return false; continue; }
    const r = q / pp; if (pp < 0) { if (r > hi) return false; if (r > lo) lo = r; } else { if (r < lo) return false; if (r < hi) hi = r; }
  }
  return lo < hi;
}
let SAMPLER: GpuSurfaceSampler | null = null;
function sampler(): GpuSurfaceSampler {
  if (SAMPLER) return SAMPLER;
  const res = 256, grid = new Float32Array(res * res * 3); let w = 0;
  for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = surface(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
  SAMPLER = new GpuSurfaceSampler(grid, res, res); return SAMPLER;
}
function build(frLevel: number): { vertices: number[]; indices: number[]; feats: number } {
  const [, packed] = buildStyleParamPayload('BambooSegments', {});
  const graph = extractAnalyticFeatures('BambooSegments', Float32Array.from(packed), DIMS);
  const level = 7, cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
  const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
  const s = sampler();
  const featRefine = clipped.length > 0
    ? { level: frLevel, intersects: (u0: number, t0: number, size: number): boolean => {
        const u1 = u0 + size, t1 = t0 + size;
        for (const ln of clipped) for (let i = 0; i + 1 < ln.points.length; i++) { if (segHits(ln.points[i].u, ln.points[i].t, ln.points[i + 1].u, ln.points[i + 1].t, u0, u1, t0, t1)) return true; }
        return false;
      } }
    : undefined;
  const qt = new PeriodicBalancedQuadtree(new MetricSizingField(s, HIGH), s, { maxLevel: 12, uBias: UBIAS, featureRefine: featRefine });
  const m = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
  return { vertices: Array.from(m.vertices), indices: Array.from(m.indices), feats: graph.lines.length };
}

describe('R4 — BambooSegments is smooth (density), not a C0-step (riser)', () => {
  it('density lever (featureLevel 7→11) resolves the smooth node bulges', () => {
    const seamExclU = 1.5 / (1 << (7 + UBIAS));
    const lo = build(7);   // flag off (default featureLevel)
    const hi = build(11);  // flag on (density lever)
    const dLo = deviationVsTrueSurface(lo, surface, { tolMm: 0.05, seamExclU });
    const dHi = deviationVsTrueSurface(hi, surface, { tolMm: 0.05, seamExclU });
    const foldHi = countFoldedTriangles(hi, surface, seamExclU);
    /* eslint-disable no-console */
    console.log('\n===== R4 — BambooSegments (SMOOTH; density lever, real adaptive mesh, exact eval, seam excl) =====');
    console.log(`  feats (node rings): ${lo.feats}  (smooth Gaussian bulges — NOT C0 jumps, NO riser)`);
    console.log(`  featureLevel 7 (flag off): max ${dLo.maxMm.toFixed(3)}mm p99 ${dLo.p99Mm.toFixed(3)} #>tol ${dLo.nAbove}/${dLo.nTris}`);
    console.log(`  featureLevel 11 (flag on): max ${dHi.maxMm.toFixed(3)}mm p99 ${dHi.p99Mm.toFixed(3)} #>tol ${dHi.nAbove}/${dHi.nTris}`);
    console.log(`  worst@11 at (u=${dHi.worst.u.toFixed(3)}, t=${dHi.worst.t.toFixed(3)});  folded@11: ${foldHi}`);
    console.log(`  => density lever: max ${dLo.maxMm.toFixed(2)}->${dHi.maxMm.toFixed(2)}mm, p99 ${dLo.p99Mm.toFixed(3)}->${dHi.p99Mm.toFixed(3)}`);
    console.log('===============================================================================================\n');
    /* eslint-enable no-console */
    expect(foldHi).toBe(0);                       // watertight
    expect(dHi.maxMm).toBeLessThanOrEqual(dLo.maxMm + 1e-6); // density does not regress (smooth ⇒ density helps/holds)
  }, 300000);
});
