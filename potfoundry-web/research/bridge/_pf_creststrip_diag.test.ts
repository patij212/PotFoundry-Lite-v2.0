// _pf_creststrip_diag.test.ts — DEV-ONLY (PF_CSDIAG=1). Honest reconciliation: the crest-strip refine loop CAPPED
// with 7 residual outliers (worst 0.152) while the top-400-gradU acceptanceGuard reported 0. WHERE do those 7 live,
// and is the AFTER mesh genuinely 0-outlier under a WIDER (higher-cap) honest population? Scores the 1-bay AFTER
// mesh with a large guard cap (all near-crest facets) + reports the residual outliers' gradU + on/off-crest split.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeGothicPatch, extractProtectedComplex, acceptanceGuard, liftMesh } from './_pf_perfectMesherLib';
import { facetInteriorBrute } from './_pf_perfectMesherBruteLib';

const TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_creststrip_smoke');
function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const size8 = 8 + nV * 16 + nT * 12, size16 = 16 + nV * 16 + nT * 12;
  const off = buf.length === size8 ? 8 : (buf.length === size16 ? 16 : -1); if (off < 0) return null;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; } return { uv, tris };
}

describe('creststrip diag: where are the loop-residual outliers vs the guard population', () => {
  it.skipIf(process.env.PF_CSDIAG !== '1')('score AFTER mesh whole-flank (large cap) + locate residuals', () => {
    const patch = makeGothicPatch(1, 5);
    const pc = extractProtectedComplex(patch, 120, 120, 0.03);
    const which = process.env.PF_DIAGMESH ?? 'after';
    const m = which === 'before'
      ? loadBin(join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_brute_smoke', 'refined_mesh.bin'))
      : loadBin(join(DIR, 'after_mesh.bin'));
    if (!m) { writeFileSync(join(DIR, 'diag.json'), JSON.stringify({ error: 'no after mesh' })); return; }
    const TAU = 2 * Math.PI; const H = patch.H;
    const xyz = liftMesh(patch, m.uv);
    const nF = m.tris.length / 3;
    const ruler = { gnScreen: 0.006, preFilter: 0.006, nTheta: 512, nZ: 80, zBandMm: 3, refineIters: 40 };
    // score EVERY facet with the honest two-stage brute (14550 facets — tractable; deep-green skip the brute)
    let whole = 0; let worst = 0; const resid: Array<{ f: number; dev: number; gradU: number }> = [];
    const du = 1 / 8192;
    for (let f = 0; f < nF; f++) {
      const a = m.tris[3 * f], b = m.tris[3 * f + 1], c = m.tris[3 * f + 2];
      const g = facetInteriorBrute(patch.rA, H, xyz, m.uv, a, b, c, ruler);
      if (g.dev > worst) worst = g.dev;
      if (g.dev > TOL) {
        whole++;
        const um = (m.uv[2 * a] + m.uv[2 * b] + m.uv[2 * c]) / 3, tm = (m.uv[2 * a + 1] + m.uv[2 * b + 1] + m.uv[2 * c + 1]) / 3;
        const z = tm * H;
        const gradU = Math.abs(patch.rA(TAU * ((um + du) - Math.floor(um + du)), z) - patch.rA(TAU * ((um - du) - Math.floor(um - du)), z)) / (2 * du * TAU);
        resid.push({ f, dev: +g.dev.toFixed(4), gradU: +gradU.toFixed(1) });
      }
    }
    resid.sort((x, y) => y.dev - x.dev);
    // guard at cap 400 (as run) and cap 5000 (near-whole) for comparison
    const g400 = acceptanceGuard(patch, m.uv, m.tris, TOL, 0.06, pc.crestSamples3D, 400);
    const gBig = acceptanceGuard(patch, m.uv, m.tris, TOL, 1.0, pc.crestSamples3D, 100000);
    const out = {
      nF, wholeMeshOutliers: whole, wholeWorst: +worst.toFixed(4),
      residTop: resid.slice(0, 15),
      guardCap400_outliers: g400.interiorOutliers, guardCap400_max: g400.interiorMaxMm, guardCap400_scored: g400.nScored,
      guardWhole_outliers: gBig.interiorOutliers, guardWhole_max: gBig.interiorMaxMm, guardWhole_scored: gBig.nScored, guardWhole_gradURange: gBig.gradUofScored,
    };
    mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `diag_${which}.json`), JSON.stringify(out, null, 2));
    /* eslint-disable-next-line no-console */ console.log('[CSDIAG]', JSON.stringify(out));
    expect(nF).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
