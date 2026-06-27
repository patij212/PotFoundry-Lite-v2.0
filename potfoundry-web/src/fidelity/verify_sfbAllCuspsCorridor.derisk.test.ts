/**
 * verify_sfbAllCuspsCorridor.derisk.test.ts — SCALING gate for the SFB serration fix.
 *
 * Single-cusp hole-fill is GO (verify_sfbCuspCorridor: 0/0, clean edge, 0.09% slivers).
 * This scales to ALL SFB petal cusps at once via {@link realFeatureCorridorMulti}
 * (ONE emit-gate over every band footprint → one hole with many loops → corridor
 * fill). It answers the make-or-break scaling question: does the WHOLE-GRAPH corridor
 * weld 0/0 on the full SFB cusp set, or does it crash / T-junction (the
 * assembleFeatureAligned whole-wall NO-GO) — i.e. do we need PER-LOOP fills?
 *
 * Reports the outcome either way (crash caught, audit numbers) — a documented
 * scaling result is the deliverable. Pure CPU, PF_DERISK-gated.
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { realFeatureCorridorPerLoop, type MultiFeatureSpec } from './bandRemesh/realCorridor';
import { auditWatertight, triangleQuality3D, type Mesh3 } from './bandRemesh/audit';
import type { UTPoint } from './bandRemesh/corridorPave';

const H = 120, R0 = 40, TBOTTOM = 6;
const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };

/** All substantial interior, off-seam SFB petal cusps, clipped to t∈[0.12,0.88]. */
function pickAllSfbCusps(): UTPoint[][] {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
  const graph = extractAnalyticFeatures(
    'SuperformulaBlossom', Float32Array.from(packed),
    { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true },
  );
  const out: UTPoint[][] = [];
  for (const c of graph.lines.filter((l) => l.kind === 'general-curve')) {
    const pts = c.points;
    if (pts.length < 8) continue;
    let tMin = 1, tMax = 0, uMin = 1, uMax = 0, seam = false;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t);
      uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u);
      if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) seam = true;
    }
    if (seam || uMin < 0.08 || uMax > 0.92 || tMax - tMin < 0.5) continue;
    const sub = pts.filter((p) => p.t >= 0.12 && p.t <= 0.88).map((p) => ({ u: p.u, t: p.t }));
    if (sub.length >= 4) out.push(sub);
  }
  return out;
}

describe.skipIf(!process.env.PF_DERISK)('SFB ALL-cusps corridor — SCALING gate', () => {
  const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, STYLE_DIMS);
  const cusps = pickAllSfbCusps();

  it('whole-graph corridor over ALL SFB cusps: welds 0/0 (or documents the scaling crack)', () => {
    const features: MultiFeatureSpec[] = cusps.map((polyline) => ({ polyline }));
    // eslint-disable-next-line no-console
    console.log(`[SFB ALL-CUSPS] count=${features.length} ptsTotal=${cusps.reduce((s, c) => s + c.length, 0)}`);

    let r: ReturnType<typeof realFeatureCorridorPerLoop> | null = null;
    let crashed = '';
    try {
      r = realFeatureCorridorPerLoop(sampler, features, { featureLevel: 11, widthMm: 3, dims: DIMS });
    } catch (e) {
      crashed = String((e as Error).message).slice(0, 160);
    }
    // eslint-disable-next-line no-console
    if (crashed) console.log(`[SFB ALL-CUSPS] CRASH (whole-graph) ⇒ per-loop fills needed: ${crashed}`);

    expect(crashed).toBe(''); // GO requires no crash; a crash means "build per-loop"
    if (!r) return;

    const positions = new Float32Array(r.merged.vertexUT.length * 3);
    for (let i = 0; i < r.merged.vertexUT.length; i++) {
      const p = sampler.position(r.merged.vertexUT[i][0], r.merged.vertexUT[i][1]);
      positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
    }
    const mesh: Mesh3 = { positions, indices: new Uint32Array(r.merged.indices) };
    const audit = auditWatertight(mesh, { boundaryVertexIndices: r.merged.ringVertexIds });

    const edges = new Set<string>();
    for (let k = 0; k + 2 < r.merged.indices.length; k += 3) {
      const tri = [r.merged.indices[k], r.merged.indices[k + 1], r.merged.indices[k + 2]];
      for (let e = 0; e < 3; e++) { const i = tri[e], j = tri[(e + 1) % 3]; edges.add(i < j ? `${i}:${j}` : `${j}:${i}`); }
    }
    let allFollowed = true;
    for (const chain of r.paved.featureChains) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i], b = chain[i + 1];
        if (!edges.has(a < b ? `${a}:${b}` : `${b}:${a}`)) { allFollowed = false; break; }
      }
      if (!allFollowed) break;
    }
    const q = triangleQuality3D({ positions, indices: new Uint32Array(r.paved.triangles.flat()) });
    /* eslint-disable no-console */
    console.log(
      `[SFB ALL-CUSPS GATE] holeLoops=${r.hole.loops.length} chains=${r.paved.featureChains.length} fillTris=${r.paved.triangles.length} ` +
      `| bnd=${audit.boundaryEdges} (rings=${r.merged.ringVertexIds.size}) nonMan=${audit.nonManifoldEdges} tJ=${audit.tJunctions} ` +
      `| allFollowed=${allFollowed} aspectMax=${q.aspectMax.toFixed(1)} %<10=${q.pctMinAngleBelow10.toFixed(2)} inv=${r.paved.inversionCount} drop=${r.paved.droppedCount}`,
    );
    /* eslint-enable no-console */

    expect(audit.boundaryEdges).toBe(r.merged.ringVertexIds.size);
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(allFollowed).toBe(true);
    expect(q.pctMinAngleBelow10).toBeLessThan(5);
  }, 600000);
});
