// _scaleColRecon.test.ts — DEV-ONLY. E-2026-07-03-SCALECOL STEP-0 reconnaissance: for each class representative,
// measure the FEATURE STRUCTURE that determines its class BEFORE building any mesh. Pure rA sampling (cheap, seconds).
//  - crest/valley count vs t (constant => trivial strips; varies => births/deaths like SFB)
//  - seam step |rA(0,z)-rA(2pi-,z)| vs t (0 => 2pi-periodic wrap; >0 => explicit C0 cliff, SFB-family)
//  - MULTI-VALUED test: does a fixed-t radial ray hit the surface once (single-valued height field) or does the
//    style encode over/under strands (weave/braid) that a single-valued (u,t) sheet CANNOT represent? We can't see
//    multi-valued-ness in rA alone (rA IS single-valued by construction — it returns ONE radius per (theta,z)); the
//    weave/braid "wall" is that the DESIGNED relief (occlusion, crossing strands) is FLATTENED to a single radius by
//    the kernel, so the mesh is faithful to rA but rA itself has lost the over/under. We detect the SIGNATURE:
//    creases where drA/dtheta is DISCONTINUOUS (a strand edge) that FORM CLOSED LOOPS / cross (not open ridge chains).
// Env PF_SCALECOL=1; sub-name PF_SCALECOL_SUB. Output research/exchange/_scalecol/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import { rowExtrema } from './_structColLib';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SCALECOL === '1';
const TAU = 2 * Math.PI;
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OUT = join('research', 'exchange', '_scalecol');

// class representatives (brief STEP-2): smooth, step/riser, strap/edge, tangled-lattice, weave/braid.
const REPS: Array<{ style: StyleId; klass: string }> = [
  { style: 'HarmonicRipple', klass: 'smooth' },
  { style: 'ArtDeco', klass: 'step/riser' },
  { style: 'DragonScales', klass: 'step/riser-2' },
  { style: 'GeometricStar', klass: 'strap/edge' },
  { style: 'LowPolyFacet', klass: 'strap/edge-2' },
  { style: 'GyroidManifold', klass: 'tangled-lattice' },
  { style: 'BasketWeave', klass: 'weave/braid' },
  { style: 'CelticKnot', klass: 'weave/braid-2' },
  { style: 'SuperformulaBlossom', klass: 'petal (control, known PARTIAL)' },
];

describe.skipIf(!RUN)('E-SCALECOL STEP-0 recon', () => {
  it('feature structure per class representative', () => {
    mkdirSync(OUT, { recursive: true });
    const nT = 41;               // t rows to scan
    const scanN = 4096;          // azimuth samples for extrema
    const rows: Array<Record<string, unknown>> = [];
    for (const { style, klass } of REPS) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const H = DIMS.H;
      // crest / valley counts vs t
      const crestCounts: number[] = [], valleyCounts: number[] = [];
      let seamStepMax = 0, seamStepMean = 0;
      // dtheta discontinuity signature (strand edges): count sign-flips of the 2nd difference exceeding a threshold
      // per row, and whether they cluster (weave) vs form ~2*symmetry open chains (petal/star).
      let maxCornerDensity = 0;
      for (let it = 0; it < nT; it++) {
        const t = it / (nT - 1); const z = t * H;
        crestCounts.push(rowExtrema(rA, z, 1, scanN).length);
        valleyCounts.push(rowExtrema(rA, z, -1, scanN).length);
        const step = Math.abs(rA(0, z) - rA((1 - 1e-9) * TAU, z));
        if (step > seamStepMax) seamStepMax = step;
        seamStepMean += step;
        // corner (C1 crease) density: 2nd-difference of r over theta, count local kinks with |curvature| spikes
        const M = 2048; const r = new Float64Array(M);
        for (let i = 0; i < M; i++) r[i] = rA(TAU * (i / M), z);
        let kinks = 0;
        for (let i = 0; i < M; i++) {
          const a = r[(i - 1 + M) % M], b = r[i], c = r[(i + 1) % M];
          const d2 = Math.abs(a - 2 * b + c);
          // a "kink" = a large 2nd diff relative to the local scale (crease). threshold on absolute mm curvature.
          if (d2 > 0.15) kinks++;
        }
        if (kinks > maxCornerDensity) maxCornerDensity = kinks;
      }
      seamStepMean /= nT;
      const cMin = Math.min(...crestCounts), cMax = Math.max(...crestCounts);
      const vMin = Math.min(...valleyCounts), vMax = Math.max(...valleyCounts);
      const births = (cMax - cMin) + (vMax - vMin);
      const row = {
        style, klass,
        crestMin: cMin, crestMax: cMax, valleyMin: vMin, valleyMax: vMax,
        births,
        countVaries: cMin !== cMax || vMin !== vMax,
        seamStepMaxMm: +seamStepMax.toFixed(4), seamStepMeanMm: +seamStepMean.toFixed(4),
        seamIsPeriodic: seamStepMax < 0.02,
        maxKinkDensityPer2048: maxCornerDensity,
      };
      rows.push(row);
      // eslint-disable-next-line no-console
      console.log(`${style.padEnd(20)} [${klass}] crest ${cMin}-${cMax} valley ${vMin}-${vMax} births=${births} seamStep max=${seamStepMax.toFixed(3)} mean=${seamStepMean.toFixed(3)} periodic=${row.seamIsPeriodic} kinks/row=${maxCornerDensity}`);
      writeFileSync(join(OUT, `recon_${style}.json`), JSON.stringify(row, null, 2));
    }
    writeFileSync(join(OUT, 'recon_ALL.json'), JSON.stringify(rows, null, 2));
    expect(rows.length).toBe(REPS.length);
  }, 3_600_000);
});
