// _pf_hybrid_diag.test.ts — DEV-ONLY (PF_HYDIAG=1). Diagnose WHY the localized red-green apex refine floors: locate
// the frozen-worst facet, report its 3 vertices' (u,t)+radius, gradU, and whether it TOUCHES the apex crest (a
// RED 1→4 of an apex-touching facet keeps an apex-touching child ⇒ cannot reduce the pow(sharp) chord). No src/ edit.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bruteNearestOnRadialSurface } from './labkit';
import { makeGothicPatch, lift, rowCrests } from './_pf_perfectMesherLib';
import { buildDirectCrestStrip } from './_pf_crestStripDirectLib';

const TAU = 2 * Math.PI;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_hybrid_diag');

describe('hybrid-diag', () => {
  it.skipIf(process.env.PF_HYDIAG !== '1')('locate the frozen-worst apex facet', () => {
    mkdirSync(DIR, { recursive: true });
    const patch = makeGothicPatch(1, 4);
    const { rA, H, rMean } = patch;
    const strip = buildDirectCrestStrip(patch, { dtRowMm: 0.15, hCrestMm: 0.15, hPanelMm: 0.3, nRamp: 6, minAmp: 0.03 });
    const uv = strip.uv, tris = strip.tris;
    // crest u's per row-t for apex classification
    const isNearCrest = (u: number, t: number): boolean => {
      const cs = rowCrests(rA, t, H, patch.uLo, patch.uHi, 3000, 0.03);
      let best = Infinity; for (const c of cs) best = Math.min(best, Math.abs(u - c));
      return best < 0.004; // ~within one apex cell
    };
    // score every facet with a dense full-azimuth brute at its worst barycentric sample; find the worst.
    const bary = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]];
    let worst = -1, worstF = -1; let worstSample = { u: 0, t: 0 };
    const nF = tris.length / 3;
    for (let f = 0; f < nF; f++) {
      const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
      const Pa = lift(rA, uv[2 * a], uv[2 * a + 1], H), Pb = lift(rA, uv[2 * b], uv[2 * b + 1], H), Pc = lift(rA, uv[2 * c], uv[2 * c + 1], H);
      let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
      while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
      // FAST pre-filter: only brute a facet whose CENTROID same-(u,t) bound suggests near-crest relief (skip deep panel).
      const ucn = (ua + ub + uc) / 3, tcn = (ta + tb + tc) / 3;
      const Pcn = [(Pa[0] + Pb[0] + Pc[0]) / 3, (Pa[1] + Pb[1] + Pc[1]) / 3, (Pa[2] + Pb[2] + Pc[2]) / 3];
      const thn = TAU * ((ucn % 1 + 1) % 1), zn = tcn * H, rn = rA(thn, zn);
      const bnd = Math.hypot(rn * Math.cos(thn) - Pcn[0], rn * Math.sin(thn) - Pcn[1], zn - Pcn[2]);
      if (bnd < 0.02) continue; // deep-green: cannot be the worst 0.39 facet
      for (const [wa, wb, wc] of bary) {
        const px = wa * Pa[0] + wb * Pb[0] + wc * Pc[0], py = wa * Pa[1] + wb * Pb[1] + wc * Pc[1], pz = wa * Pa[2] + wb * Pb[2] + wc * Pc[2];
        const d = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 512, nZ: 100, zBandMm: 3, refineIters: 60 }).dist;
        if (d > worst) { worst = d; worstF = f; worstSample = { u: wa * ua + wb * ub + wc * uc, t: wa * ta + wb * tb + wc * tc }; }
      }
    }
    const a = tris[3 * worstF], b = tris[3 * worstF + 1], c = tris[3 * worstF + 2];
    const V = (i: number): { u: number; t: number; r: number; nearCrest: boolean } => {
      const u = uv[2 * i], t = uv[2 * i + 1]; return { u: +u.toFixed(5), t: +t.toFixed(5), r: +rA(TAU * ((u % 1 + 1) % 1), t * H).toFixed(4), nearCrest: isNearCrest(u, t) };
    };
    const va = V(a), vb = V(b), vc = V(c);
    const touchesApex = va.nearCrest || vb.nearCrest || vc.nearCrest;
    const allNearCrest = va.nearCrest && vb.nearCrest && vc.nearCrest;
    const out = {
      worstMm: +worst.toFixed(5), worstF, worstSample: { u: +worstSample.u.toFixed(5), t: +worstSample.t.toFixed(5) },
      rMean: +rMean.toFixed(3), verts: { a: va, b: vb, c: vc },
      touchesApexCrest: touchesApex, allThreeNearCrest: allNearCrest,
      diagnosis: touchesApex ? 'worst facet TOUCHES apex crest ⇒ RED 1→4 keeps an apex-touching child ⇒ pow(sharp) chord floors (flat-P1 wall, needs cdt2d flip OR curved element)' : 'worst facet is OFF-crest ⇒ RED should reduce it (mechanism issue, not a floor)',
    };
    writeFileSync(join(DIR, 'diag.json'), JSON.stringify(out, null, 2));
    /* eslint-disable-next-line no-console */
    console.log('[hydiag] ' + JSON.stringify(out));
    expect(worst).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
