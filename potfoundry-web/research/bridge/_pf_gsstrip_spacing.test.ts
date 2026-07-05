// _pf_gsstrip_spacing.test.ts — DEV-ONLY (PF_GSSPACE=1). CHEAP DISCRIMINATOR before investing in the strip guard:
// measure the ACTUAL across-crest flank width available on the GeoStar patch band. If adjacent chevron straps are
// closer than a few strip-pitches apart, a direct-emission structured strip CANNOT tile the flank without overlap
// (the SMOKE build measured 284k non-manifold at widthMm=0.9). This tells us the max square-strip width the dense
// count-unstable field admits — the feasibility gate for the whole approach.
import { describe, it, expect } from 'vitest';
import { extractProtectedComplex, lift } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

describe('gsstrip-spacing', () => {
  it.skipIf(process.env.PF_GSSPACE !== '1')('across-crest flank width on the GeoStar band', () => {
    const BAYS = Number(process.env.PF_BAYS ?? 3), ZBAND = Number(process.env.PF_ZBAND ?? 6), TC = Number(process.env.PF_TCENTER ?? 0.08);
    const patch = makeGeoStarPatch(BAYS, ZBAND, TC);
    const { rA, H, arcPerU } = patch;
    const pc = extractProtectedComplex(patch, 120, 120, 0.03);
    // crest (u,t) points
    const cV = new Set<number>(); for (const [a, b] of pc.constraintEdges) { cV.add(a); cV.add(b); }
    const crest: Array<[number, number, number, number, number]> = []; // u,t,x,y,z
    for (const v of cV) { const u = pc.uv[2 * v], t = pc.uv[2 * v + 1]; const [x, y, z] = lift(rA, u, t, H); crest.push([u, t, x, y, z]); }
    /* eslint-disable no-console */
    console.log(`patch uSpan=${((patch.uHi - patch.uLo) * arcPerU).toFixed(2)}mm tSpan=${((patch.tHi - patch.tLo) * H).toFixed(2)}mm nCrestVerts=${crest.length} cEdges=${pc.constraintEdges.length}`);
    // for each crest vert, nearest-OTHER-crest 3D distance (proxy for 2× the max non-overlapping strip half-width)
    let dsum = 0, dmin = Infinity, dmax = 0, n = 0; const samples: number[] = [];
    for (let i = 0; i < crest.length; i++) {
      let best = Infinity;
      for (let j = 0; j < crest.length; j++) { if (i === j) continue; const dd = Math.hypot(crest[i][2] - crest[j][2], crest[i][3] - crest[j][3], crest[i][4] - crest[j][4]); if (dd > 1e-4 && dd < best) best = dd; }
      if (best < Infinity) { dsum += best; if (best < dmin) dmin = best; if (best > dmax) dmax = best; n++; samples.push(best); }
    }
    samples.sort((a, b) => a - b);
    const p = (q: number): number => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    console.log(`nearest-other-crest 3D dist (mm): min=${dmin.toFixed(3)} p10=${p(0.1).toFixed(3)} p50=${p(0.5).toFixed(3)} mean=${(dsum / n).toFixed(3)} p90=${p(0.9).toFixed(3)} max=${dmax.toFixed(3)}`);
    console.log(`=> max non-overlapping strip HALF-width ~ p50/2 = ${(p(0.5) / 2).toFixed(3)}mm; at h=0.06 that is ${(p(0.5) / 2 / 0.06).toFixed(1)} columns/flank`);
    /* eslint-enable no-console */
    expect(crest.length).toBeGreaterThan(0);
  }, 5 * 60 * 1000);
});
