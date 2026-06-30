// SMOKE test for the feature-localized harness mechanics (PF_FEATFID_SMOKE=1).
// Tiny budget — validates point-location, periodic seam, finite numbers, no crashes.
// NOT a measurement run; just proves the harness works before the full sweep.
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  crestValleyRetention, narrowChannelCoverage, featureAdjacentSlivers, globalChord, liftTrue,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };

describe('feature-localized harness smoke', () => {
  it.skipIf(!process.env.PF_FEATFID_SMOKE)('locator + metrics finite on a small mesh', () => {
    const style = 'GothicArches' as StyleId;
    const rA = buildRadiusFn(style, {}, DIMS);
    // small but real mesh
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
      tolMm: 0.02, hMin: 0.05, hMax: 8, sizeRes: 96, gradeBeta: 0.2,
      seedN: 10, maxPoints: 200_000, splitThresh: 1.5, optimizeSweeps: 1,
    });
    // eslint-disable-next-line no-console
    console.log(`smoke mesh: tris=${mesh.indices.length / 3} verts=${mesh.ut.length / 2}`);
    const meshUt = buildMeshUt(mesh.ut, mesh.indices, rA, DIMS.H);
    const locator = buildLocator(meshUt, 128);

    // Point-location self-consistency: query at each mesh vertex's (u,t); the
    // interpolated P must be within a hair of the true lift at that vertex.
    let maxSelf = 0; let nMiss = 0;
    const nv = mesh.ut.length / 2;
    for (let i = 0; i < nv; i += Math.max(1, Math.floor(nv / 2000))) {
      const u = mesh.ut[2 * i], t = mesh.ut[2 * i + 1];
      const q = locator.query(u, t);
      if (q === null) { nMiss++; continue; }
      const P = liftTrue(u, t, rA, DIMS.H);
      const d = Math.hypot(P[0] - q.P[0], P[1] - q.P[1], P[2] - q.P[2]);
      if (d > maxSelf) maxSelf = d;
    }
    // eslint-disable-next-line no-console
    console.log(`self-locate: maxErr=${maxSelf.toExponential(2)}mm misses=${nMiss}/${Math.ceil(nv / Math.max(1, Math.floor(nv / 2000)))}`);

    // Seam check: query exactly at u=0 and u≈1 should both succeed (periodic).
    const q0 = locator.query(0.0, 0.5);
    const q1 = locator.query(0.9999, 0.5);
    // eslint-disable-next-line no-console
    console.log(`seam: u=0 -> ${q0 ? 'hit' : 'MISS'}, u=0.9999 -> ${q1 ? 'hit' : 'MISS'}`);

    const truth = buildFeatureTruth(style, {}, DIMS, 256);
    // eslint-disable-next-line no-console
    console.log(`truth lines=${truth.lines.length} uToMm=${truth.uToMm.toFixed(2)} tToMm=${truth.tToMm}`);

    const gc  = globalChord(mesh.ut, mesh.indices, rA, DIMS.H);
    const fl  = featureLineChord(truth, locator, rA, DIMS.H, 0.05);
    const fl3 = featureLineChord3D(truth, locator, meshUt, rA, DIMS.H, 0.05, fl.p99Mm);
    const cr  = crestValleyRetention(truth, locator, rA, DIMS.H, 0.05);
    const ch  = narrowChannelCoverage(truth, meshUt, locator, 0.05);
    const sl  = featureAdjacentSlivers(truth, locator, meshUt, 0.05);
    // eslint-disable-next-line no-console
    console.log(`global rms=${gc.rmsMm.toFixed(4)} | FL rms=${fl.rmsMm.toFixed(4)} p99=${fl.p99Mm.toFixed(3)} max=${fl.maxMm.toFixed(3)} n=${fl.samples} miss=${fl.missed}`);
    // eslint-disable-next-line no-console
    console.log(`true3D: rms=${fl3.rmsMm.toFixed(4)} p99=${fl3.p99Mm.toFixed(4)} max=${fl3.maxMm.toFixed(3)} radOvr=${fl3.radialOverstatementRatio.toFixed(1)}x miss=${fl3.missed}`);
    // eslint-disable-next-line no-console
    console.log(`crest under mean/worst=${cr.crestUnderMeanMm.toFixed(3)}/${cr.crestUnderWorstMm.toFixed(3)}mm pct=${cr.crestUnderMeanPct.toFixed(1)}/${cr.crestUnderWorstPct.toFixed(1)}% n=${cr.crestSamples}`);
    // eslint-disable-next-line no-console
    console.log(`narrow width=${ch.narrowestWidthMm.toFixed(3)}mm tris-across=${ch.minTrisAcross} median=${ch.medianSpacingMm.toFixed(2)} fpts=${ch.featurePoints}`);
    // eslint-disable-next-line no-console
    console.log(`adjSlivers: adj=${sl.featureAdjCount} pct20=${sl.featureAdj_pct20.toFixed(1)}% vs whole=${sl.wholeMesh_pct20.toFixed(1)}% ratio=${sl.sliverRatio.toFixed(2)}`);

    // Assertions: everything finite, locator mostly hits, seam works.
    expect(Number.isFinite(gc.rmsMm)).toBe(true);
    expect(Number.isFinite(fl.rmsMm)).toBe(true);
    expect(Number.isFinite(fl3.rmsMm)).toBe(true);
    expect(fl3.p99Mm).toBeLessThan(fl.p99Mm + 0.001); // 3D ≤ same-param (never worse)
    expect(fl.samples).toBeGreaterThan(0);
    expect(sl.featureAdjCount).toBeGreaterThan(0);
    expect(maxSelf).toBeLessThan(0.01); // self-locate should be ~exact (barycentric of exact verts)
    expect(q0).not.toBeNull();
    expect(q1).not.toBeNull();
  }, 10 * 60 * 1000);
});
