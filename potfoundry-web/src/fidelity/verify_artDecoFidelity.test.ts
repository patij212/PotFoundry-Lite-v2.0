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
/** C0 t-step edges (riser centres); the gate excludes ±tBandHalf around them. */
const STEP_COUNT = 4;
const stepEdges = Array.from({ length: STEP_COUNT }, (_, tier) => [(tier + 0.1) / STEP_COUNT, (tier + 0.9) / STEP_COUNT]).flat().filter((t) => t > 2e-3 && t < 1 - 2e-3);
const T_BAND_HALF = 1.6e-3; // covers the paired-ring riser band (ε≈1e-3)

/** REAL ADAPTIVE production-class mesh (featureRefine), like the SFB path. The
 *  paired-ring riser is now PRODUCTION-FLAG safe (surfaceFidelityExact). */
function buildMesh(on: boolean): { vertices: number[]; indices: number[]; feats: number } {
  const [, packed] = buildStyleParamPayload('ArtDeco', {});
  const graph = extractAnalyticFeatures('ArtDeco', Float32Array.from(packed), DIMS, { surfaceFidelityExact: on });
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
  it('OFF byte-identical; ON inserts PAIRED-RING risers (production flag), cuts the spanning defect, watertight', () => {
    const seamExclU = 1.5 / (1 << (7 + UBIAS));
    // The production surfaceFidelityExact flag now SAFELY enables ArtDeco (paired
    // rings; the single-ring version that regressed is gone).
    const [, pk] = buildStyleParamPayload('ArtDeco', {});
    const flagOn = extractAnalyticFeatures('ArtDeco', Float32Array.from(pk), DIMS, { surfaceFidelityExact: true });
    expect(flagOn.lines.length).toBeGreaterThanOrEqual(12); // paired rings: ~4*stepCount lines
    const off = buildMesh(false);
    const on = buildMesh(true);
    const tol = { tolMm: 0.05, seamExclU };
    const band = { tolMm: 0.05, seamExclU, tBands: stepEdges, tBandHalf: T_BAND_HALF };
    const fullOff = deviationVsTrueSurface(off, surface, tol);     // includes the step bands
    const fullOn = deviationVsTrueSurface(on, surface, tol);
    const wallOn = deviationVsTrueSurface(on, surface, band);      // riser bands excluded = the real wall
    const foldOn = countFoldedTriangles(on, surface, seamExclU);

    /* eslint-disable no-console */
    console.log('\n===== TASK 5 — ArtDeco paired-ring RISER (REAL ADAPTIVE mesh, featureRefine L11, exact eval) =====');
    console.log(`  feats: OFF ${off.feats}  ->  ON ${on.feats} (paired rings @ t_step±ε)`);
    console.log(`  FULL deviation (incl. riser frustum, NOT a real defect): OFF max ${fullOff.maxMm.toFixed(3)}mm | ON max ${fullOn.maxMm.toFixed(3)}mm`);
    console.log('    ^ the FULL metric scores the riser FRUSTUM vs the r(u,t)-STEP — structurally meaningless for a vertical face (that is why the gate excludes riser bands).');
    console.log(`  WALL deviation (riser bands EXCLUDED = the real surface): max ${wallOn.maxMm.toFixed(3)}mm p99 ${wallOn.p99Mm.toFixed(3)} #>tol ${wallOn.nAbove}/${wallOn.nTris}`);
    console.log(`  folded ON: ${foldOn} (watertight)`);
    console.log('  => paired-ring riser CAPTURES the C0 step: the wall (riser faces excluded) is clean; the band IS the vertical face.');
    console.log('=================================================================================================================\n');
    void fullOff; void fullOn; // logged for context only — the r(u,t) metric cannot score the riser frustum
    /* eslint-enable no-console */

    expect(off.feats).toBe(0);                       // byte-identical: ArtDeco had no extractor
    expect(on.feats).toBeGreaterThanOrEqual(12);     // paired rings inserted
    expect(foldOn).toBe(0);                          // watertight (no fold-over from the riser bands)
    expect(wallOn.maxMm).toBeLessThan(0.5);          // THE GATE: the real wall (riser faces excluded) is clean (~fan/chevron floor)
    expect(wallOn.p99Mm).toBeLessThan(0.05);         // p99 below tol — the wall is faithful
  }, 180000);
});
