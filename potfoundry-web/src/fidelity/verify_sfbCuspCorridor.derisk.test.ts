/**
 * verify_sfbCuspCorridor.derisk.test.ts — THE GATE for the SFB serration fix.
 *
 * The user's serration = the per-cell triangulation's SAWTOOTH at the sharp petal
 * cusps (uBias-independent, proven by mesh analysis). The verified fix is the
 * HOLE-FILL band approach (NOT integrateSingleBand, which NO-GO'd): emit-gate the
 * band footprint → extract the dyadic hole → fill it reusing the wall's EXACT
 * boundary vertices ({@link realFeatureCorridor}). That approach is a GO on a real
 * Voronoi band (verify_real_feature_mesher Task 1: 0/0/0, near-sliver-free). THIS
 * test proves it transfers to a real SFB PETAL CUSP — the actual feature the user
 * sees serrate. If GO, the SFB fix is per-ridge hole-fills (avoiding the whole-wall
 * corridor cdt2d crash); if NO-GO, the cusp's sharpness breaks the corridor.
 *
 * Pure CPU, analytic SFB styleSampler (no GPU/DOM). PF_DERISK-gated (heavy).
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { realFeatureCorridor } from './bandRemesh/realCorridor';
import { auditWatertight, triangleQuality3D, type Mesh3 } from './bandRemesh/audit';
import type { UTPoint } from './bandRemesh/corridorPave';

const H = 120, R0 = 40, TBOTTOM = 6;
const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };

/** Pick ONE substantial interior, off-seam SFB petal cusp, clipped to t∈[0.12,0.88]. */
function pickSfbCusp(): UTPoint[] {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
  const graph = extractAnalyticFeatures(
    'SuperformulaBlossom', Float32Array.from(packed),
    { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true },
  );
  const curves = graph.lines.filter((l) => l.kind === 'general-curve');
  // Longest curve that stays interior (t∈[0.1,0.9]) and off the u-seam (u∈[0.1,0.9], no wrap).
  let best: UTPoint[] | null = null, bestSpan = -1;
  for (const c of curves) {
    const pts = c.points;
    if (pts.length < 8) continue;
    let tMin = 1, tMax = 0, uMin = 1, uMax = 0, seam = false, span = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t);
      uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u);
      if (k > 0) { const du = Math.abs(pts[k].u - pts[k - 1].u); if (du > 0.5) seam = true; span += Math.hypot(Math.min(du, 1 - du), pts[k].t - pts[k - 1].t); }
    }
    if (seam || uMin < 0.1 || uMax > 0.9) continue;
    if (tMax - tMin < 0.5) continue; // want a tall cusp
    if (span > bestSpan) { bestSpan = span; best = pts.map((p) => ({ u: p.u, t: p.t })); }
  }
  if (!best) throw new Error('pickSfbCusp: no interior off-seam cusp found');
  // Clip to the interior t-band (off the t=0/t=1 rings).
  const sub = best.filter((p) => p.t >= 0.12 && p.t <= 0.88);
  if (sub.length < 4) throw new Error('pickSfbCusp: clipped cusp too short');
  return sub;
}

describe.skipIf(!process.env.PF_DERISK)('SFB petal-cusp corridor — THE GATE (hole-fill band fix)', () => {
  const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, STYLE_DIMS);
  const cusp = pickSfbCusp();

  it('a real SFB cusp welds 0/0 via the hole-fill corridor + is a continuous mesh edge-chain', () => {
    const r = realFeatureCorridor(sampler, cusp, { featureLevel: 11, widthMm: 3, dims: DIMS });

    const positions = new Float32Array(r.merged.vertexUT.length * 3);
    for (let i = 0; i < r.merged.vertexUT.length; i++) {
      const p = sampler.position(r.merged.vertexUT[i][0], r.merged.vertexUT[i][1]);
      positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
    }
    const mesh: Mesh3 = { positions, indices: new Uint32Array(r.merged.indices) };
    const audit = auditWatertight(mesh, { boundaryVertexIndices: r.merged.ringVertexIds });

    // The cusp must be a continuous chain of mesh edges (no sawtooth detours).
    const edges = new Set<string>();
    for (let k = 0; k + 2 < r.merged.indices.length; k += 3) {
      const tri = [r.merged.indices[k], r.merged.indices[k + 1], r.merged.indices[k + 2]];
      for (let e = 0; e < 3; e++) { const i = tri[e], j = tri[(e + 1) % 3]; edges.add(i < j ? `${i}:${j}` : `${j}:${i}`); }
    }
    let chainFollowed = true;
    for (let i = 0; i + 1 < r.paved.featureChainIds.length; i++) {
      const a = r.paved.featureChainIds[i], b = r.paved.featureChainIds[i + 1];
      if (!edges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) { chainFollowed = false; break; }
    }

    const q = triangleQuality3D({ positions, indices: new Uint32Array(r.paved.triangles.flat()) });
    /* eslint-disable no-console */
    console.log(
      `[SFB CUSP GATE] cuspPts=${cusp.length} holeLoops=${r.hole.loops.length} fillTris=${r.paved.triangles.length} ` +
      `| bnd=${audit.boundaryEdges} (rings=${r.merged.ringVertexIds.size}) nonMan=${audit.nonManifoldEdges} tJ=${audit.tJunctions} ` +
      `| chainFollowed=${chainFollowed} featChain=${r.paved.featureChainIds.length} ` +
      `| aspectMax=${q.aspectMax.toFixed(1)} %<10=${q.pctMinAngleBelow10.toFixed(2)} cdt(inv=${r.paved.inversionCount} drop=${r.paved.droppedCount})`,
    );
    /* eslint-enable no-console */

    // THE GATE: watertight 0/0, cusp followed, fill near-sliver-free (the Voronoi-GO bar).
    expect(r.hole.loops.length).toBeGreaterThan(0);
    expect(r.paved.triangles.length).toBeGreaterThan(0);
    expect(audit.boundaryEdges).toBe(r.merged.ringVertexIds.size); // open boundary = rings only
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(chainFollowed).toBe(true);
    expect(q.pctMinAngleBelow10).toBeLessThan(5); // near sliver-free (Voronoi GO was ~0.14%)
  }, 600000);
});
