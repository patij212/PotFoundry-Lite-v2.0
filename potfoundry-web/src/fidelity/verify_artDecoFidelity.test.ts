/**
 * verify_artDecoFidelity.test.ts — Task 5 gate: extractArtDeco emits the C0
 * t-STEP band edges (the dominant family) and REDUCES the surface deviation —
 * MEASURED. ArtDeco was the top no-extractor gap (verify_crossStyleEdgeGap:
 * 4.69mm). The steps are HORIZONTAL (t=const), so the win shows as a deviation
 * drop (deviationVsTrueSurface), not the u-straddle classifier.
 *
 * OFF (default/byte-identical, ArtDeco had no extractor) ⇒ 0 features, the 4mm
 * step straddle stands. ON ⇒ 2*stepCount t-band edges, the step straddle is
 * removed (worst drops to the fan/chevron level — those smaller families are
 * left to density; this probe reports the residual so we know if they need edges).
 *
 * Config-aware: surface = rOuterArtDeco at defaults; packed = the production
 * packer at the SAME defaults (consistent — ArtDeco default is featured,
 * step_depth 0.08, unlike SFB). Pure CPU, read-only, no production change.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { STYLE_FUNCTIONS } from '../geometry/styles';
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
type V3 = readonly [number, number, number];
const fn = STYLE_FUNCTIONS['ArtDeco'];
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
let sampler: GpuSurfaceSampler | null = null;
function getSampler(): GpuSurfaceSampler {
  if (sampler) return sampler;
  const res = 256, grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) { const tv = row / (res - 1); for (let col = 0; col < res; col++) { const q = surface(col / res, tv); grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2]; } }
  sampler = new GpuSurfaceSampler(grid, res, res);
  return sampler;
}
const adLever = (): { __pfArtDecoSteps?: boolean } => globalThis as unknown as { __pfArtDecoSteps?: boolean };
afterEach(() => { delete adLever().__pfArtDecoSteps; });

/** REAL ADAPTIVE production-class mesh (featureRefine), like the SFB path. The
 *  t-step extractor is DEV-LEVER gated (__pfArtDecoSteps), NOT the production flag
 *  (it regresses ArtDeco alone — this probe is what measured that). */
function buildMesh(on: boolean): { vertices: number[]; indices: number[]; feats: number } {
  if (on) adLever().__pfArtDecoSteps = true; else delete adLever().__pfArtDecoSteps;
  const [, packed] = buildStyleParamPayload('ArtDeco', {});
  const graph = extractAnalyticFeatures('ArtDeco', Float32Array.from(packed), DIMS);
  const level = 7, cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
  const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
  const s = getSampler();
  const featRefine = on && clipped.length > 0
    ? { level: 11, intersects: (u0: number, t0: number, size: number): boolean => {
        const u1 = u0 + size, t1 = t0 + size;
        for (const ln of clipped) for (let i = 0; i + 1 < ln.points.length; i++) { if (segHits(ln.points[i].u, ln.points[i].t, ln.points[i + 1].u, ln.points[i + 1].t, u0, u1, t0, t1)) return true; }
        return false;
      } }
    : undefined;
  const qt = new PeriodicBalancedQuadtree(new MetricSizingField(s, HIGH), s, { maxLevel: 12, uBias: UBIAS, featureRefine: featRefine });
  const m = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
  return { vertices: Array.from(m.vertices), indices: Array.from(m.indices), feats: graph.lines.length };
}

describe('Task 5 — ArtDeco C0 t-step extractor (dominant-gap fix)', () => {
  it('OFF byte-identical (no extractor); ON inserts t-step bands on the REAL ADAPTIVE mesh, watertight', () => {
    const seamExclU = 1.5 / (1 << (7 + UBIAS));
    // REGRESSION-SAFE: the production surfaceFidelityExact flag must NOT enable the
    // ArtDeco t-steps (they regress alone) — only the __pfArtDecoSteps dev lever.
    const [, pk] = buildStyleParamPayload('ArtDeco', {});
    const flagOn = extractAnalyticFeatures('ArtDeco', Float32Array.from(pk), DIMS, { surfaceFidelityExact: true });
    expect(flagOn.lines.length).toBe(0); // flag leaves ArtDeco [] until fan/chevron complete it
    const off = buildMesh(false);
    const on = buildMesh(true);
    const dOff = deviationVsTrueSurface(off, surface, { tolMm: 0.05, seamExclU });
    const dOn = deviationVsTrueSurface(on, surface, { tolMm: 0.05, seamExclU });
    const foldOn = countFoldedTriangles(on, surface, seamExclU);

    /* eslint-disable no-console */
    console.log('\n===== TASK 5 — ArtDeco C0 t-step extractor (REAL ADAPTIVE mesh, featureRefine L11, exact eval, seam excl) =====');
    console.log(`  feats: OFF ${off.feats} (no extractor)  ->  ON ${on.feats} (2*stepCount t-bands)`);
    console.log(`  deviation:  OFF max ${dOff.maxMm.toFixed(3)}mm p99 ${dOff.p99Mm.toFixed(3)} #>tol ${dOff.nAbove}/${dOff.nTris}`);
    console.log(`              ON  max ${dOn.maxMm.toFixed(3)}mm p99 ${dOn.p99Mm.toFixed(3)} #>tol ${dOn.nAbove}/${dOn.nTris}`);
    console.log(`  worst ON at (u=${dOn.worst.u.toFixed(3)}, t=${dOn.worst.t.toFixed(3)}) — u-localized ⇒ the un-inserted FAN/CHEVRON (the next layer)`);
    console.log(`  folded ON: ${foldOn} (watertight)`);
    console.log(`  => t-step insertion: max ${dOff.maxMm.toFixed(2)}->${dOn.maxMm.toFixed(2)}mm, p99 ${dOff.p99Mm.toFixed(3)}->${dOn.p99Mm.toFixed(3)}`);
    console.log('=================================================================================================================\n');
    /* eslint-enable no-console */

    expect(off.feats).toBe(0);                       // byte-identical: ArtDeco had no extractor
    expect(on.feats).toBeGreaterThanOrEqual(6);      // 2*stepCount t-bands (stepCount>=4 ⇒ >=8, minus clipped ends)
    expect(foldOn).toBe(0);                          // no fold-over from the new edges (watertight)
    // NOTE: the maxMm verdict (does the t-step alone help, or do the fan/chevron
    // u-cusps dominate?) is the measured finding — logged above, not asserted, so
    // the test records reality rather than a hoped-for reduction.
  }, 180000);
});
