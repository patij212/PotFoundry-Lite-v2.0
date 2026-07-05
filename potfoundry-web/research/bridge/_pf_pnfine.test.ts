// _pf_pnfine.test.ts — DEV-ONLY (PF_PNFINE=1). Push the well-shaped apex bridging facet to EXTREME density to
// settle: does flat-P1 EVER cross below 0.02, or floor at the pow(sharp) cusp? And does one-sided PN close it?
import { describe, it, expect } from 'vitest';
import { bruteNearestOnRadialSurface, projectPointToRadialSurface } from './labkit';
import { makeGothicPatch, lift, rowCrests } from './_pf_perfectMesherLib';
import { apexLeafPN } from './_pf_perfectMesherBruteLib';

describe('pn-fine', () => {
  it.skipIf(process.env.PF_PNFINE !== '1')('extreme-density flat vs PN apex convergence', () => {
    const patch = makeGothicPatch(5, 14);
    const { rA, H } = patch;
    const uMid = (patch.uLo + patch.uHi) / 2, tMid = (patch.tLo + patch.tHi) / 2;
    const uc = rowCrests(rA, tMid, H, patch.uLo, patch.uHi, 8000, 0.03);
    let uCrest = uc[0]; for (const u of uc) if (Math.abs(u - uMid) < Math.abs(uCrest - uMid)) uCrest = u;
    const R = { gnScreen: 0.006, preFilter: 0.006, nTheta: 2048, nZ: 160, zBandMm: 2, refineIters: 70 };
    const rows: Array<Record<string, unknown>> = [];
    for (const du of [0.0000625, 0.00003125, 0.000015625, 0.0000078125, 0.00000390625]) {
      const dt = (du * patch.arcPerU) / H;
      const P0 = lift(rA, uCrest - du, tMid - dt / 2, H), P1 = lift(rA, uCrest + du, tMid - dt / 2, H), P2 = lift(rA, uCrest, tMid + dt / 2, H);
      const r = apexLeafPN(rA, H, P0, P1, P2, [uCrest - du, tMid - dt / 2, 0], [uCrest + du, tMid - dt / 2, 0], [uCrest, tMid + dt / 2, 0], R);
      const arc = +(du * patch.arcPerU * 2).toFixed(5);
      rows.push({ du, facetArcMm: arc, zHmm: +(dt * H).toFixed(5), devFlat: +r.devFlat.toFixed(6), devPN: +r.devPN.toFixed(6) });
      // eslint-disable-next-line no-console
      console.log(`[pnfine] arc=${arc}mm devFlat=${r.devFlat.toFixed(6)} devPN=${r.devPN.toFixed(6)}`);
    }
    void projectPointToRadialSurface; void bruteNearestOnRadialSurface;
    expect(rows.length).toBe(5);
  }, 20 * 60 * 1000);
});
