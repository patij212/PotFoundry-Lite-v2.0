// _pf_pndiag.test.ts — DEV-ONLY (PF_PNDIAG=1). Diagnostic: WHERE does the apex bridging facet's worst interior
// sample sit, and WHY does the error GROW as the facet narrows? Confirms the zero-width knife-edge mechanism
// (the bridging facet's interior cannot follow the pow(sharp) cusp) is genuine, not a facet-construction artifact.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn, bruteNearestOnRadialSurface, projectPointToRadialSurface } from './labkit';
import { makeGothicPatch, lift, rowCrests, colCrests } from './_pf_perfectMesherLib';

describe('pn-diag', () => {
  it.skipIf(process.env.PF_PNDIAG !== '1')('worst-sample anatomy of the apex bridging facet', () => {
    const patch = makeGothicPatch(5, 14);
    const { rA, H } = patch;
    const uMid = (patch.uLo + patch.uHi) / 2, tMid = (patch.tLo + patch.tHi) / 2;
    const uc = rowCrests(rA, tMid, H, patch.uLo, patch.uHi, 8000, 0.03);
    let uCrest = uc[0]; for (const u of uc) if (Math.abs(u - uMid) < Math.abs(uCrest - uMid)) uCrest = u;
    const TAU = 2 * Math.PI;
    // profile ACROSS the crest at tMid: r(u) — how sharp is the cusp?
    const prof: Array<[number, number]> = [];
    for (let k = -20; k <= 20; k++) { const u = uCrest + k * 0.0002; prof.push([+((u - uCrest) * patch.arcPerU).toFixed(3), +rA(TAU * (u - Math.floor(u)), tMid * H).toFixed(4)]); }
    // eslint-disable-next-line no-console
    console.log('[pndiag] r(u) across crest (mmArc, r):', JSON.stringify(prof));
    // is it also a crest in t (a true 2D apex) or a ridge line?
    const tc = colCrests(rA, uCrest, H, patch.tLo, patch.tHi, 4000, 0.03);
    // eslint-disable-next-line no-console
    console.log('[pndiag] uCrest=', uCrest.toFixed(5), 'tMid=', tMid.toFixed(4), 'col-crests-in-t at uCrest:', tc.map((x) => +x.toFixed(4)));
    // finest facet: du=0.0000625, dt=0.02. worst bary sample.
    const du = 0.0000625, dt = 0.02;
    const P0 = lift(rA, uCrest - du, tMid, H), P1 = lift(rA, uCrest + du, tMid, H), P2 = lift(rA, uCrest, tMid + dt, H);
    const BARY: Array<[number, number, number]> = [];
    const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) BARY.push([i / n, j / n, (n - i - j) / n]);
    let mx = 0, arg: [number, number, number] = [0, 0, 0]; let worstUV: [number, number] = [0, 0];
    for (const [w0, w1, w2] of BARY) {
      const px = w0 * P0[0] + w1 * P1[0] + w2 * P2[0], py = w0 * P0[1] + w1 * P1[1] + w2 * P2[1], pz = w0 * P0[2] + w1 * P1[2] + w2 * P2[2];
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 1e9, maxIter: 40 }).dist;
      const d = gn <= 0.006 ? gn : bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 }).dist;
      const uu = w0 * (uCrest - du) + w1 * (uCrest + du) + w2 * uCrest, tt = w0 * tMid + w1 * tMid + w2 * (tMid + dt);
      if (d > mx) { mx = d; arg = [px, py, pz]; worstUV = [uu, tt]; }
    }
    // eslint-disable-next-line no-console
    console.log(`[pndiag] finest facet worst interior dev=${mx.toFixed(5)} at bary->(u,t)=(${worstUV[0].toFixed(6)},${worstUV[1].toFixed(4)}) mmFromCrest=${((worstUV[0] - uCrest) * patch.arcPerU).toFixed(4)} dzFromRow=${((worstUV[1] - tMid) * H).toFixed(3)}mm`);
    // the true surface r at the worst sample's own (u,t) vs the chord point z — how tall is the missed relief?
    const rTrue = rA(TAU * (worstUV[0] - Math.floor(worstUV[0])), worstUV[1] * H);
    // eslint-disable-next-line no-console
    console.log(`[pndiag] worst sample chordZ=${arg[2].toFixed(3)} r@(u,t)=${rTrue.toFixed(4)} (crest r=${rA(TAU * (uCrest - Math.floor(uCrest)), tMid * H).toFixed(4)})`);
    expect(mx).toBeGreaterThan(0);
  }, 10 * 60 * 1000);
});
