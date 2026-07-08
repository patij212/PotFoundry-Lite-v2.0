/**
 * _junctionPinDiag.test.ts — E-2026-07-08-TIERC-ADAPTIVE-SEED, TASK 1 (PIN-DIAG).
 *
 * The ~1.05918988549241mm pin survives on-seam/off-seam/lever1 (all share the
 * t-band). This probe DUMPS THE FULL STATE of the worst facet to establish WHY
 * RED-1→4 cannot reduce it:
 *   - its 3 vertices (u,t) + 3D
 *   - each edge's LOCKED-constraint status (membership in constraintEdges)
 *   - whether any vertex sits on a domain boundary (uLo/uHi/tLo/tHi)
 *   - its honest worst-sample (uWorst,tWorst) from facetInteriorHonest
 *   - what a HAND-APPLIED RED-1→4 produces: the 4 children + their honest devs
 *     (does a child re-inherit the worst sample? does the worst shrink?)
 *   - a Steiner-at-worst-sample probe: split the facet into 3 children through
 *     (uWorst,tWorst) and measure each child's honest dev (LEVER-B feasibility)
 *
 * Env-gated PF_TIERC_PINDIAG=1. Reuses the parallel refine to the dense
 * transition for tractability, then all diagnosis is sequential + exact.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliersParallel,
  type ChartDomain,
} from './noBridgeRefine';
import {
  DEFAULT_RULER,
  radialSurfaceFromSampler,
  facetInteriorHonest,
  denseBary,
  liftChartMesh,
  type RadialSurface,
} from './interiorRuler';
import { GpuSurfaceSampler } from '../SurfaceSampler';
import { ParallelScorerPool, samplerGrid } from './parallelScorer';

const RUN = process.env.PF_TIERC_PINDIAG === '1';
const OUT = 'research/exchange/_tierc_junction';
const MAXPASS = process.env.PF_PINDIAG_MAXPASS
  ? +process.env.PF_PINDIAG_MAXPASS
  : 5;

/** Honest dev of an ad-hoc triangle given three (u,t) chart coords. */
function adhocDev(
  surface: RadialSurface,
  sampler: GpuSurfaceSampler,
  A: [number, number],
  B: [number, number],
  C: [number, number],
): { dev: number; uWorst: number; tWorst: number } {
  const uv = [A[0], A[1], B[0], B[1], C[0], C[1]];
  const xyz = liftChartMesh(sampler, uv);
  const g = facetInteriorHonest(
    surface,
    xyz,
    uv,
    0,
    1,
    2,
    denseBary(8),
    DEFAULT_RULER,
  );
  return { dev: g.dev, uWorst: g.uWorst, tWorst: g.tWorst };
}

describe('Tier-C pin DIAGNOSIS (Task 1)', () => {
  it.skipIf(!RUN)('full state dump of the 1.0592mm pinned facet', async () => {
    const sampler = styleSampler(
      'GothicArches',
      {},
      { H: 120, Rt: 50, Rb: 40 },
    ) as GpuSurfaceSampler;
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0.05, uHi: 0.15, tLo: 0.38, tHi: 0.62 };
    const pool = new ParallelScorerPool(samplerGrid(sampler), 4);
    const refined = await refineToZeroOutliersParallel(
      sampler,
      complex,
      domain,
      {
        tolMm: 0.01,
        maxPass: MAXPASS,
        bulkPasses7pt: 4,
        bgArcMm: 0.3,
        ruler: { ...DEFAULT_RULER, thetaWindowRad: 0.5 },
      },
      pool,
    );

    const surface = radialSurfaceFromSampler(sampler);
    const xyz = liftChartMesh(sampler, refined.uv);
    const dense = denseBary(8);
    // Locked-edge set (canonical index pairs).
    const locked = new Set<string>();
    for (const [a, b] of refined.constraintEdges) {
      locked.add(a < b ? `${a}_${b}` : `${b}_${a}`);
    }
    // Score every facet in PARALLEL; find the worst facet index + max.
    const { dev: devAll } = await pool.scoreDev(
      xyz,
      refined.uv,
      refined.tris,
      DEFAULT_RULER,
    );
    await pool.close();
    let worst = 0;
    let wf = -1;
    for (let f = 0; f < devAll.length; f++) {
      if (devAll[f] > worst) {
        worst = devAll[f];
        wf = f;
      }
    }
    // Recompute the worst facet's honest sample sequentially (for uWorst/tWorst).
    const wg = facetInteriorHonest(
      surface,
      xyz,
      refined.uv,
      refined.tris[3 * wf],
      refined.tris[3 * wf + 1],
      refined.tris[3 * wf + 2],
      dense,
      DEFAULT_RULER,
    );
    const wUworst = wg.uWorst;
    const wTworst = wg.tWorst;
    const a = refined.tris[3 * wf];
    const b = refined.tris[3 * wf + 1];
    const c = refined.tris[3 * wf + 2];
    const V = (i: number): [number, number] => [
      refined.uv[2 * i],
      refined.uv[2 * i + 1],
    ];
    const P = (i: number): [number, number, number] => [
      xyz[3 * i],
      xyz[3 * i + 1],
      xyz[3 * i + 2],
    ];
    const va = V(a);
    const vb = V(b);
    const vc = V(c);
    const edgeLocked = (i: number, j: number): boolean =>
      locked.has(i < j ? `${i}_${j}` : `${j}_${i}`);
    const near = (x: number, v: number): boolean => Math.abs(x - v) < 1e-6;
    const onBoundary = (u: number, t: number): string[] => {
      const f: string[] = [];
      if (near(u, domain.uLo)) f.push('uLo');
      if (near(u, domain.uHi)) f.push('uHi');
      if (near(t, domain.tLo)) f.push('tLo');
      if (near(t, domain.tHi)) f.push('tHi');
      return f;
    };

    // HAND-APPLIED RED-1→4: 4 children (corner tris + center), honest devs.
    const mAB: [number, number] = [(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2];
    const mBC: [number, number] = [(vb[0] + vc[0]) / 2, (vb[1] + vc[1]) / 2];
    const mCA: [number, number] = [(vc[0] + va[0]) / 2, (vc[1] + va[1]) / 2];
    const red14 = [
      { name: 'A-mAB-mCA', dev: adhocDev(surface, sampler, va, mAB, mCA) },
      { name: 'B-mBC-mAB', dev: adhocDev(surface, sampler, vb, mBC, mAB) },
      { name: 'C-mCA-mBC', dev: adhocDev(surface, sampler, vc, mCA, mBC) },
      { name: 'center', dev: adhocDev(surface, sampler, mAB, mBC, mCA) },
    ].map((x) => ({
      name: x.name,
      dev: +x.dev.dev.toFixed(5),
      uWorst: +x.dev.uWorst.toFixed(5),
      tWorst: +x.dev.tWorst.toFixed(5),
    }));

    // STEINER-AT-WORST-SAMPLE: split into 3 children through (uWorst,tWorst).
    const S: [number, number] = [wUworst, wTworst];
    const steiner3 = [
      { name: 'A-B-S', dev: adhocDev(surface, sampler, va, vb, S) },
      { name: 'B-C-S', dev: adhocDev(surface, sampler, vb, vc, S) },
      { name: 'C-A-S', dev: adhocDev(surface, sampler, vc, va, S) },
    ].map((x) => ({
      name: x.name,
      dev: +x.dev.dev.toFixed(5),
      uWorst: +x.dev.uWorst.toFixed(5),
      tWorst: +x.dev.tWorst.toFixed(5),
    }));

    const result = {
      worstMm: +worst.toFixed(6),
      wf,
      tris: refined.tris.length / 3,
      passes: refined.passes,
      verts: {
        a: { idx: a, ut: va, xyz: P(a).map((x) => +x.toFixed(4)), boundary: onBoundary(va[0], va[1]) },
        b: { idx: b, ut: vb, xyz: P(b).map((x) => +x.toFixed(4)), boundary: onBoundary(vb[0], vb[1]) },
        c: { idx: c, ut: vc, xyz: P(c).map((x) => +x.toFixed(4)), boundary: onBoundary(vc[0], vc[1]) },
      },
      edges: {
        AB: { locked: edgeLocked(a, b) },
        BC: { locked: edgeLocked(b, c) },
        CA: { locked: edgeLocked(c, a) },
      },
      anyEdgeLocked: edgeLocked(a, b) || edgeLocked(b, c) || edgeLocked(c, a),
      worstSample: { u: +wUworst.toFixed(6), t: +wTworst.toFixed(6) },
      tSpan: +(Math.max(va[1], vb[1], vc[1]) - Math.min(va[1], vb[1], vc[1])).toFixed(6),
      uSpan: +(Math.max(va[0], vb[0], vc[0]) - Math.min(va[0], vb[0], vc[0])).toFixed(6),
      // 3D edge lengths (mm) — is the facet a needle or well-shaped?
      edgeLen3D: {
        AB: +Math.hypot(P(a)[0] - P(b)[0], P(a)[1] - P(b)[1], P(a)[2] - P(b)[2]).toFixed(4),
        BC: +Math.hypot(P(b)[0] - P(c)[0], P(b)[1] - P(c)[1], P(b)[2] - P(c)[2]).toFixed(4),
        CA: +Math.hypot(P(c)[0] - P(a)[0], P(c)[1] - P(a)[1], P(c)[2] - P(a)[2]).toFixed(4),
      },
      red14Children: red14,
      red14WorstChild: Math.max(...red14.map((x) => x.dev)),
      steinerAtWorst3: steiner3,
      steinerWorstChild: Math.max(...steiner3.map((x) => x.dev)),
    };
    // eslint-disable-next-line no-console
    console.log('[pinDiag]', JSON.stringify(result, null, 2));
    writeFileSync(`${OUT}/pin_diag.json`, JSON.stringify(result, null, 2));
    expect(worst).toBeGreaterThan(0.1);
  }, 2 * 60 * 60 * 1000);
});
