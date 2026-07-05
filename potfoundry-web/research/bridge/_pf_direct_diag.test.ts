// _pf_direct_diag.test.ts — DEV-ONLY (PF_DIAG=1). Diagnostic: crest u-drift + per-row crest count across the band,
// to decide fixed-column vs crest-tracking-column structure for the direct strip. Cheap, no brute.
import { describe, it, expect } from 'vitest';
import { makeGothicPatch, rowCrests, lift } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { metricScales } from './_pf_perfectMesherMsquareLib';

describe('direct-diag', () => {
  it.skipIf(process.env.PF_DIAG !== '1')('crest drift + counts', () => {
    const style = (process.env.PF_STYLE ?? 'gothic').toLowerCase();
    const patch = style === 'geostar' ? makeGeoStarPatch(2, 8) : makeGothicPatch(2, 8);
    const { rA, H, tLo, tHi, uLo, uHi } = patch;
    // eslint-disable-next-line no-console
    console.log(`[diag ${style}] u[${uLo.toFixed(4)}..${uHi.toFixed(4)}] t[${tLo.toFixed(4)}..${tHi.toFixed(4)}] arcU=${((uHi - uLo) * patch.arcPerU).toFixed(2)}mm band=${((tHi - tLo) * H).toFixed(2)}mm`);
    const rows = 8;
    const crestByRow: number[][] = [];
    for (let r = 0; r <= rows; r++) {
      const t = tLo + (tHi - tLo) * (r / rows);
      const c = rowCrests(rA, t, H, uLo, uHi, 3000, 0.03).filter((u) => u > uLo + 1e-9 && u < uHi - 1e-9);
      crestByRow.push(c);
      // eslint-disable-next-line no-console
      console.log(`  row t=${t.toFixed(4)} nCrest=${c.length} us=[${c.map((u) => u.toFixed(4)).join(',')}]`);
    }
    // drift: for the crest nearest the band-center u, track its u across rows
    const cMid = crestByRow[Math.floor(rows / 2)];
    if (cMid.length) {
      const uref = cMid[Math.floor(cMid.length / 2)];
      let maxDrift = 0;
      for (let r = 0; r <= rows; r++) {
        const c = crestByRow[r]; if (!c.length) continue;
        let best = Infinity, bu = uref; for (const u of c) { if (Math.abs(u - uref) < best) { best = Math.abs(u - uref); bu = u; } }
        const driftMm = Math.abs(bu - uref) * patch.arcPerU;
        if (driftMm > maxDrift) maxDrift = driftMm;
      }
      // eslint-disable-next-line no-console
      console.log(`  crest uref=${uref.toFixed(4)} maxDriftAcrossBand=${maxDrift.toFixed(4)}mm`);
    }
    // metric at crest center
    const m = metricScales(rA, H, ((uLo + uHi) / 2 + 1) % 1, (tLo + tHi) / 2);
    // eslint-disable-next-line no-console
    console.log(`  metric su=${m.su.toFixed(1)} st=${m.st.toFixed(1)} (mm/uunit, mm/tunit)`);
    // amplitude of the mid crest: r at crest vs r at valley
    const tc = (tLo + tHi) / 2;
    if (cMid.length >= 2) {
      const uCrest = cMid[Math.floor(cMid.length / 2)];
      const uVal = (cMid[Math.floor(cMid.length / 2)] + cMid[Math.floor(cMid.length / 2) - 1]) / 2;
      const rCrest = rA(2 * Math.PI * ((uCrest % 1 + 1) % 1), tc * H);
      const rVal = rA(2 * Math.PI * ((uVal % 1 + 1) % 1), tc * H);
      void lift;
      // eslint-disable-next-line no-console
      console.log(`  amp: rCrest=${rCrest.toFixed(3)} rValley=${rVal.toFixed(3)} amp=${(rCrest - rVal).toFixed(3)}mm`);
    }
    expect(true).toBe(true);
  });
});
