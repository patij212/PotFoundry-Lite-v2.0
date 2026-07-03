// _weaveLoc.test.ts — DEV-ONLY. LOCALIZE the BasketWeave crease-conforming residual: is the chord error ENTIRELY
// at the 2D grid cliffs (strand boundaries u=m/16 AND layer rings t=k/10), leaving cell INTERIORS already CAD-grade?
// If yes => the fix is doubled grid lines + cliff ladders on BOTH axes; the interiors need nothing.
//
// Rebuild the same mesh; re-measure interior true-3D worst but EXCLUDE facets within a band of ANY grid line
// (u within uBand of m/16, OR t within tBand of k/10). Report the excluded-interior worst vs the with-grid worst.
// Env PF_WEAVE=1.

import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, projectPointToRadialSurface } from './labkit';
import { analyticBruteDist } from './_sfbPushLib';
import { buildWeaveCreaseMesh, basketWeaveGrid } from './_weaveLib';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleDims } from './runStyle';

const RUN = process.env.PF_WEAVE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_weave');
const ck = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };

describe.skipIf(!RUN)('WEAVE localize — is the residual entirely at the 2D grid cliffs?', () => {
  it('measure interior chord EXCLUDING grid-line bands', () => {
    const H = DIMS.H;
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const strands = DEFAULT_BASKET_WEAVE.bwStrands, layers = DEFAULT_BASKET_WEAVE.bwLayers;
    const grid = basketWeaveGrid(strands, layers, DEFAULT_BASKET_WEAVE.bwPhase);
    const build = buildWeaveCreaseMesh(rA, H, grid, { hRowMm: 0.30, seamMode: 'cliff' });
    const mesh = build.mesh; const idxA = mesh.idx; const nF = mesh.nF; const ut = mesh.ut;
    const own = perFaceChordSag(ut, idxA, rA, H);

    // grid-line proximity: nearest strand boundary distance in u; nearest layer ring distance in t.
    const uBand = 0.6 / strands; // half a strand cell — VERY generous exclusion (only cell centers survive)
    const tBand = 0.6 / layers;
    const distU = (u: number): number => { let best = 1; for (let m = 0; m < strands; m++) { let d = Math.abs(u - m / strands); if (d > 0.5) d = 1 - d; if (d < best) best = d; } return best; };
    const distT = (t: number): number => { let best = 1; for (let k = 1; k < layers; k++) { const d = Math.abs(t - k / layers); if (d < best) best = d; } return Math.min(best, t, 1 - t); };
    // face is "cell interior" iff ALL 3 verts are > band from every grid line (u AND t)
    const seamBand = 0.02;
    const faceCellInterior = (f: number, ub: number, tb: number): boolean => {
      for (let e = 0; e < 3; e++) { const v = idxA[3 * f + e]; const u = ut[2 * v], t = ut[2 * v + 1]; if (u < seamBand || u > 1 - seamBand) return false; if (distU(u) < ub || distT(t) < tb) return false; }
      return true;
    };

    const measure = (ub: number, tb: number, label: string): void => {
      const faces: number[] = []; for (let f = 0; f < nF; f++) if (faceCellInterior(f, ub, tb)) faces.push(f);
      faces.sort((a, b) => own.faceErr[b] - own.faceErr[a]);
      const K = Math.min(2000, faces.length);
      let worst = 0, over = 0;
      for (let ii = 0; ii < K; ii++) {
        const f = faces[ii]; const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
        const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
        const d = Math.min(projectPointToRadialSurface(cx, cy, cz, rA).dist, analyticBruteDist(cx, cy, cz, rA, H));
        if (d > worst) worst = d; if (d > 0.01) over++;
      }
      console.log(`${label}: nFaces=${faces.length} worst-K true-3D=${worst.toFixed(4)} over01(inK)=${over}`);
      ck(`loc_${label}`, { uBand: ub, tBand: tb, nFaces: faces.length, worstMm: +worst.toFixed(4), over01inK: over });
    };
    // A: exclude generous bands around all grid lines (only cell-center cores survive)
    measure(uBand, tBand, 'excl_generous');
    // B: exclude tighter bands (2 mesh cells) to see how far the cliff influence reaches
    measure(0.15 / strands, 0.15 / layers, 'excl_tight');
    console.log(`(baseline with-grid interior worst was 0.59 — this localizes how much is the grid cliffs)`);
  });
});
