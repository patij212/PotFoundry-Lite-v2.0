/**
 * verify_artDecoRiser.test.ts — SCOPING experiment for the ArtDeco t-step riser.
 * The step is a C0 radius JUMP; a single horizontal edge can't represent the
 * vertical riser. HYPOTHESIS: emitting a PAIRED ring at t_step±ε (a thin riser
 * band whose quad approximates the vertical face) captures the step, with the
 * rest of the wall clean. If so, the "capability" is just emitting paired step
 * lines (cheap extractor change); if not, a real assembler riser is needed.
 *
 * Measures deviation EXCLUDING the riser bands (|t-t_step|<bandHalf) and the seam
 * — the band IS the feature (the vertical face), like a crest edge. Compares: no
 * features, SINGLE line (the regressing approach), PAIRED ε=1e-3, PAIRED ε=3e-4.
 * Pure CPU, read-only, no production change (builds features inline).
 */
import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS, type StyleFunction } from '../geometry/styles';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const H = 120, Rt = 70, Rb = 45, expn = 1.1;
const fn: StyleFunction = STYLE_FUNCTIONS['ArtDeco'];
type V3 = readonly [number, number, number];
const P = (u: number, t: number): V3 => {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const theta = 2 * Math.PI * u, z = tc * H, r0 = Rb + (Rt - Rb) * Math.pow(tc, expn);
  let r = fn(theta, z, r0, H, {});
  if (!Number.isFinite(r)) r = r0;
  return [r * Math.cos(theta), r * Math.sin(theta), z];
};
const UBIAS = 2, STEP_COUNT = 4;
const HIGH = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 };
type FLine = { kind: string; points: Array<{ u: number; t: number }>; label: string };
const hline = (t: number, label: string): FLine => {
  const points = []; for (let i = 0; i < 48; i++) points.push({ u: i / 48, t }); return { kind: 'horizontal-band', points, label };
};
function stepEdges(): number[] {
  const out: number[] = [];
  for (let tier = 0; tier < STEP_COUNT; tier++) { out.push((tier + 0.1) / STEP_COUNT, (tier + 0.9) / STEP_COUNT); }
  return out.filter((t) => t > 2e-3 && t < 1 - 2e-3);
}
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
  for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = P(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
  SAMPLER = new GpuSurfaceSampler(grid, res, res); return SAMPLER;
}
function buildAndMeasure(features: FLine[], bandHalf: number): { max: number; p99: number; nAbove: number; nTris: number } {
  const s = sampler(), level = 7, cornerSnap = 0.06 / (1 << level);
  const featRefine = features.length > 0
    ? { level: 11, intersects: (u0: number, t0: number, size: number): boolean => {
        const u1 = u0 + size, t1 = t0 + size;
        for (const ln of features) for (let i = 0; i + 1 < ln.points.length; i++) { if (segHits(ln.points[i].u, ln.points[i].t, ln.points[i + 1].u, ln.points[i + 1].t, u0, u1, t0, t1)) return true; }
        return false;
      } }
    : undefined;
  const qt = new PeriodicBalancedQuadtree(new MetricSizingField(s, HIGH), s, { maxLevel: 12, uBias: UBIAS, featureRefine: featRefine });
  const m = triangulateQuadtreeWithFeatures(qt, features, { cornerSnap });
  const v = m.vertices, idx = m.indices, seam = 1.5 / (1 << (level + UBIAS)), edges = stepEdges();
  const devs: number[] = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3], ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
    const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1, ct = (ta + tb + tc) / 3;
    if (cu < seam || cu > 1 - seam || Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
    if (edges.some((te) => Math.abs(ct - te) < bandHalf)) continue; // exclude the riser band (the feature)
    const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc), trC = P(cu, ct);
    const dC = Math.hypot((Va[0] + Vb[0] + Vc[0]) / 3 - trC[0], (Va[1] + Vb[1] + Vc[1]) / 3 - trC[1], (Va[2] + Vb[2] + Vc[2]) / 3 - trC[2]);
    let dmax = dC;
    if (dC > 0.04) { const N = 10; for (let ii = 0; ii <= N; ii++) for (let jj = 0; jj <= N - ii; jj++) { const aa = ii / N, bb = jj / N, cc = 1 - aa - bb; const tr = P(aa * ua + bb * ub + cc * uc, aa * ta + bb * tb + cc * tc); const d = Math.hypot(aa * Va[0] + bb * Vb[0] + cc * Vc[0] - tr[0], aa * Va[1] + bb * Vb[1] + cc * Vc[1] - tr[1], aa * Va[2] + bb * Vb[2] + cc * Vc[2] - tr[2]); if (d > dmax) dmax = d; } }
    devs.push(dmax);
  }
  devs.sort((x, y) => x - y);
  let mx = 0; for (const d of devs) if (d > mx) mx = d;
  return { max: mx, p99: devs[Math.floor(0.99 * devs.length)] ?? 0, nAbove: devs.filter((d) => d > 0.05).length, nTris: devs.length };
}

describe('ArtDeco t-step riser scoping — does a paired-ring band capture the C0 jump?', () => {
  it('compares no-feature / single-line / paired ε, non-riser-band deviation', () => {
    const edges = stepEdges();
    const single = edges.map((t) => hline(t, `single@${t.toFixed(3)}`));
    const paired = (eps: number): FLine[] => edges.flatMap((t) => [hline(t - eps, `lo@${t.toFixed(3)}`), hline(t + eps, `hi@${t.toFixed(3)}`)]);

    /* eslint-disable no-console */
    console.log('\n===== ArtDeco t-step RISER scoping (non-riser-band + seam excluded) =====');
    const none = buildAndMeasure([], 0.003);
    console.log(`  no features (riser band excl): max ${none.max.toFixed(3)}mm p99 ${none.p99.toFixed(3)} #>tol ${none.nAbove}/${none.nTris}`);
    const sng = buildAndMeasure(single, 0.003);
    console.log(`  SINGLE line @t_step          : max ${sng.max.toFixed(3)}mm p99 ${sng.p99.toFixed(3)} #>tol ${sng.nAbove}/${sng.nTris}`);
    const pe3 = buildAndMeasure(paired(1e-3), 1e-3 * 1.6);
    console.log(`  PAIRED ε=1e-3 (riser band excl): max ${pe3.max.toFixed(3)}mm p99 ${pe3.p99.toFixed(3)} #>tol ${pe3.nAbove}/${pe3.nTris}`);
    const pe4 = buildAndMeasure(paired(3e-4), 3e-4 * 1.6);
    console.log(`  PAIRED ε=3e-4 (riser band excl): max ${pe4.max.toFixed(3)}mm p99 ${pe4.p99.toFixed(3)} #>tol ${pe4.nAbove}/${pe4.nTris}`);
    console.log('  => the entire ~4mm is INSIDE the step bands (no-feat non-band max ~0.15); a PAIRED-ring riser at ε≈1e-3 captures the C0 step (non-band clean), ε=3e-4 too tight (leaks). Cheap extractor change, no new assembler capability.');
    console.log('========================================================================\n');
    /* eslint-enable no-console */
    expect(none.max).toBeLessThan(0.5);   // the 4mm is all in the step bands; outside them ArtDeco is ~0.15mm
    expect(pe3.max).toBeLessThan(0.5);    // paired ε=1e-3 keeps the non-band wall clean (step captured by the riser band)
    expect(pe4.max).toBeGreaterThan(pe3.max * 3); // ε=3e-4 is too tight → the step leaks out of the band
  }, 300000);
});
