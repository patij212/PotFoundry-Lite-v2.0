/**
 * verify_crossStyleEdgeGap.test.ts — CROSS-STYLE edge-gap sizing (honest
 * replacement for the phantom verify_crossStyleFidelity). For every style:
 * build a REAL mesh with the REAL extractor's feature edges, evaluate vertices
 * EXACTLY (the CPU style surface), and measure the surface residual seam-excluded.
 * The with-features residual = "how much this extractor still has to close."
 *
 * Why this is honest where verify_crossStyleFidelity was not:
 *  - exact per-vertex eval (production already does this), NOT a bilinear sampler.
 *  - real extractor edges inserted (extractAnalyticFeatures via the production
 *    packer buildStyleParamPayload), so missing/partial extractors show up as a
 *    residual, and a NO-FEATURES baseline isolates the extractor's contribution.
 *  - CONFIG consistency: packer + surface driven from the same defaults; SFB is
 *    special-cased to strength=1 (its CPU fn ignores strength; default packs to 0
 *    = smooth, BLOCKING-2). A consistency guard flags styles where extracted
 *    features do NOT sit on surface ridges (a packed-vs-CPU config mismatch).
 *  - seam excluded (the accepted out-of-scope cliff).
 *
 * NOTE: uniform-L7 baseline (not the per-style adaptive uBias) — a consistent
 * cross-style yardstick for PRIORITIZING extractor work, not the production mesh.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { STYLE_FUNCTIONS, type StyleFunction } from '../geometry/styles';
import { buildStyleParamPayload } from '../utils/styleParams';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { principalCurvatureMax } from '../renderers/webgpu/parametric/conforming/SurfaceMetricTensor';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import type { SurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const H = 120, Rt = 70, Rb = 45, expn = 1.1;
const DIMS = { H, Rt, Rb };
type V3 = readonly [number, number, number];

const sfbExact = new SfbWallSampler(Float32Array.from(SFB1_PACKED));
function makeSurface(id: string, fn: StyleFunction): (u: number, t: number) => V3 {
  if (id === 'SuperformulaBlossom') return (u, t) => sfbExact.position(u, t); // strength=1 packed surface
  return (u, t) => {
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    const theta = 2 * Math.PI * u, z = tc * H, r0 = Rb + (Rt - Rb) * Math.pow(tc, expn);
    let r = fn(theta, z, r0, H, {});
    if (!Number.isFinite(r)) r = r0;
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  };
}
/** Packer opts: SFB forced to strength=1 so packed matches the full-petal surface. */
function packerOpts(id: string): Record<string, unknown> {
  return id === 'SuperformulaBlossom' ? { sf_strength: 1 } : {};
}

function uniformQuad(level: number, uBias: number): QuadtreeLike {
  const uSpan = 1 << (level + uBias), tSpan = 1 << level;
  const leaves: QuadLeaf[] = [];
  for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
  return { leaves: () => leaves, uBias: () => uBias };
}
const pctl = (a: number[], q: number): number => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

type FLine = { points: Array<{ u: number; t: number }> };
function measureResidual(P: (u: number, t: number) => V3, clipped: FLine[], level: number, uBias: number): { above: number; p99: number; max: number } {
  const cornerSnap = 0.06 / (1 << level);
  const mesh = triangulateQuadtreeWithFeatures(uniformQuad(level, uBias), clipped, { cornerSnap });
  const v = mesh.vertices, idx = mesh.indices;
  const seam = 1.5 / (1 << (level + uBias));
  const devs: number[] = [];
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
    const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1;
    if (cu < seam || cu > 1 - seam) continue;
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
    const ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
    const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
    // cheap centroid pre-filter, then dense if promising
    const trC = P(cu, (ta + tb + tc) / 3);
    const dC = Math.hypot((Va[0] + Vb[0] + Vc[0]) / 3 - trC[0], (Va[1] + Vb[1] + Vc[1]) / 3 - trC[1], (Va[2] + Vb[2] + Vc[2]) / 3 - trC[2]);
    let dmax = dC;
    if (dC > 0.04) {
      const N = 10;
      for (let ii = 0; ii <= N; ii++) for (let jj = 0; jj <= N - ii; jj++) {
        const aa = ii / N, bb = jj / N, cc = 1 - aa - bb;
        const tr = P(aa * ua + bb * ub + cc * uc, aa * ta + bb * tb + cc * tc);
        const d = Math.hypot(aa * Va[0] + bb * Vb[0] + cc * Vc[0] - tr[0], aa * Va[1] + bb * Vb[1] + cc * Vc[1] - tr[1], aa * Va[2] + bb * Vb[2] + cc * Vc[2] - tr[2]);
        if (d > dmax) dmax = d;
      }
    }
    devs.push(dmax);
  }
  let mx = 0; for (const d of devs) if (d > mx) mx = d;
  return { above: devs.filter((d) => d > 0.1).length, p99: pctl(devs, 0.99), max: mx };
}

describe('VERIFY cross-style edge-gap sizing (real extractors, exact eval)', () => {
  it('per style: residual with real feature edges + extractor contribution + consistency guard', () => {
    const level = 7, uBias = 2; // uBias=2 (square-ish u-cells, ~production aspect) to de-contaminate chord from the edge-gap signal
    const uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
    type Row = { id: string; tris: string; withMax: number; withP99: number; withAbove: number; noneMax: number; feats: number; consistent: string };
    const rows: Row[] = [];
    for (const [id, fn] of Object.entries(STYLE_FUNCTIONS) as Array<[string, StyleFunction]>) {
      try {
        const P = makeSurface(id, fn);
        const [, packed] = buildStyleParamPayload(id, packerOpts(id));
        const graph = extractAnalyticFeatures(id, Float32Array.from(packed), DIMS);
        const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin) as unknown as FLine[];
        const withF = measureResidual(P, clipped, level, uBias);
        const noneF = measureResidual(P, [], level, uBias);
        // consistency guard: do extracted features sit on surface ridges?
        // mean surface curvature at feature midpoints vs a global sample median.
        let featK = 0, nf = 0;
        const surfSampler = { position: (u: number, t: number) => P(u, t) } as unknown as SurfaceSampler;
        for (const ln of clipped) for (let k = 1; k < ln.points.length; k += Math.max(1, (ln.points.length >> 3))) {
          const pt = ln.points[k]; featK += principalCurvatureMax(surfSampler, pt.u, pt.t, 1 / 4096, 1 / 4096); nf++;
        }
        const featMeanK = nf ? featK / nf : 0;
        const globalKs: number[] = [];
        for (let gi = 0; gi < 40; gi++) globalKs.push(principalCurvatureMax(surfSampler, (gi * 0.137) % 1, 0.3 + 0.4 * ((gi * 0.31) % 1), 1 / 4096, 1 / 4096));
        const globalMedK = pctl(globalKs, 0.5);
        const consistent = graph.lines.length === 0 ? 'no-feats' : (featMeanK > 2 * Math.max(1e-6, globalMedK) ? 'OK' : 'CHECK(feats not on ridges?)');
        rows.push({ id, tris: '', withMax: withF.max, withP99: withF.p99, withAbove: withF.above, noneMax: noneF.max, feats: graph.lines.length, consistent });
      } catch (e) {
        rows.push({ id, tris: 'ERR', withMax: -1, withP99: -1, withAbove: -1, noneMax: -1, feats: -1, consistent: String((e as Error).message).slice(0, 30) });
      }
    }
    rows.sort((a, b) => b.withMax - a.withMax);
    /* eslint-disable no-console */
    console.log('\n===== CROSS-STYLE EDGE-GAP (real extractors, EXACT eval, uniform L7, seam excl) =====');
    console.log('  style                    | withFeat max | p99 | #>0.1mm | noFeat max | #feats | consistency');
    for (const r of rows) {
      console.log(`  ${r.id.padEnd(24)} | ${r.withMax.toFixed(3).padStart(11)} | ${r.withP99.toFixed(3).padStart(5)} | ${String(r.withAbove).padStart(7)} | ${r.noneMax.toFixed(3).padStart(9)} | ${String(r.feats).padStart(6)} | ${r.consistent}`);
    }
    console.log('  withFeat max = residual AFTER the real extractor (the gap left to close); noFeat max = residual with NO edges (the extractor\'s job size).');
    console.log('  big withFeat max + few feats = MISSING/PARTIAL extractor; big withFeat + many feats = partial/other; consistency=CHECK ⇒ packed-vs-CPU config mismatch (number suspect).');
    console.log('==================================================================================\n');
    /* eslint-enable no-console */
    expect(rows.length).toBeGreaterThan(15);
  }, 600000);
});
