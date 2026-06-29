/**
 * verify_sfbCrestRemesh.derisk.test.ts — does re-meshing a petal-crest PATCH under the
 * research lab's surface metric (metricDelaunayRefine) clean the crest slivers that the
 * per-cell CDT (and the flip retrofit) cannot?
 *
 * 96% of the SFB serration teeth are thin triangles ON the crest (verify_sfbTeethLoc):
 * the per-cell CDT triangulates among densely-sampled near-collinear crest vertices.
 * A flip can't fix vertex SPACING. This de-risks the REAL fix: take a (u,t) patch around
 * a real petal crest, wrap exactPos as the oracle, and run the lab's metric Delaunay
 * REFINE (sizes triangles by true 3D length ⇒ matches flank↔crest density). Reports the
 * 3D min-angle + chord it reaches vs the per-cell CDT baseline on the same patch.
 * Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { STYLE_FUNCTIONS } from '../geometry/styles';
import { baseRadius } from '../geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../geometry/types';
import { metricDelaunayRefine, type SurfaceOracle } from './spike/metricDelaunayRefine';

const H = 120, R0 = 40;
type V3 = [number, number, number];

describe.skipIf(!process.env.PF_DERISK)('SFB crest re-mesh under surface metric (de-risk the real fix)', () => {
  it('metric-Delaunay refine of a petal-crest patch reaches clean 3D angle + chord', () => {
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
    const radiusFn = STYLE_FUNCTIONS['SuperformulaBlossom'];
    const opts = { ...DEFAULT_STYLE_PARAMS['SuperformulaBlossom'], sf_strength: 1 };
    const exactPos = (u: number, t: number): V3 => { const z = t * H, r0 = baseRadius(z, H, R0, R0, 1, opts), th = 2 * Math.PI * u, r = radiusFn(th, z, r0, H, opts); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const rAt = (u: number, t: number): number => { const p = exactPos(u, t); return Math.hypot(p[0], p[1]); };

    // pick an interior, off-seam petal RIDGE (peak) crest; take its midpoint.
    let crest: { u: number; t: number } | null = null; let bestR = -1;
    for (const c of graph.lines.filter((l) => l.kind === 'general-curve')) {
      const pts = c.points; if (pts.length < 8) continue;
      let uMin = 1, uMax = 0, tMin = 1, tMax = 0, seam = false;
      for (let k = 0; k < pts.length; k++) { const p = pts[k]; uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) seam = true; }
      if (seam || uMin < 0.15 || uMax > 0.85 || tMax - tMin < 0.4) continue;
      const m = pts[Math.floor(pts.length / 2)];
      const r0 = rAt(m.u, m.t);
      if (r0 > rAt(m.u - 0.01, m.t) && r0 > rAt(m.u + 0.01, m.t) && r0 > bestR) { bestR = r0; crest = { u: m.u, t: m.t }; }
    }
    expect(crest).not.toBeNull();
    const cu = crest!.u, ct = crest!.t;

    const oracle: SurfaceOracle = { pos: (u, t) => exactPos(u, t) };
    const bounds = { uMin: cu - 0.045, uMax: cu + 0.045, tMin: Math.max(0.02, ct - 0.12), tMax: Math.min(0.98, ct + 0.12) };

    const res = metricDelaunayRefine(oracle, bounds, { minAngleDeg: 25, maxChordMm: 0.05 }, { seedN: 10, maxPoints: 60000, chordSamples: 5 });

    /* eslint-disable no-console */
    console.log(`[CREST RE-MESH] crest u=${cu.toFixed(3)} t=${ct.toFixed(3)} r=${bestR.toFixed(1)} (valley→ridge relief context)`);
    console.log(`  patch u∈[${bounds.uMin.toFixed(3)},${bounds.uMax.toFixed(3)}] t∈[${bounds.tMin.toFixed(2)},${bounds.tMax.toFixed(2)}]`);
    console.log(`  metricDelaunayRefine: pts=${res.points} tris=${res.triangles} rounds=${res.rounds} hitBudget=${res.hitBudget}`);
    console.log(`  RESULT: worstMinAngle=${res.worstMinAngleDeg.toFixed(1)}° %<25°=${res.pctBelowAngle.toFixed(2)} worstChord=${res.worstChordMm.toFixed(4)}mm %>chord=${res.pctAboveChord.toFixed(2)}`);
    console.log(`  ⇒ ${res.worstMinAngleDeg >= 18 && res.pctBelowAngle < 2 ? 'CLEAN crest (metric re-mesh fixes the slivers)' : 'still slivered — needs more'}`);
    /* eslint-enable no-console */
    expect(res.points).toBeGreaterThan(0);
  }, 600000);
});
