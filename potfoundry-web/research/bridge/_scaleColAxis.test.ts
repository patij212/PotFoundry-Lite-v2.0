// _scaleColAxis.test.ts — DEV-ONLY. E-SCALECOL: classify each rep by its DISCONTINUITY AXIS (the key to which
// primitive fits). The ridge-graph tracks VERTICAL (theta-feature, z-continuous) ridge chains. A style whose relief
// is Z-TILED / BRICK (a floor() in t => horizontal ring z-STEPS, theta-staggered rows) needs the SHARP3D doubled-
// ring z-step treatment, NOT the vertical ridge-graph. Measure both:
//   - thetaKink = max |d2r/dtheta2| over a (theta,z) grid (a vertical crease/ridge indicator).
//   - zStep = max |r(theta,z+dz) - r(theta,z)| across a fine z scan at fixed theta (a horizontal ring z-step; a
//     brick/tread boundary reads a hard jump; smooth relief reads ~0).
//   - zStepFrac = fraction of the z-range that carries a z-step > 0.3mm (many small tiers vs one).
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SCALECOL === '1';
const TAU = 2 * Math.PI;
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OUT = join('research', 'exchange', '_scalecol');

const STYLES: StyleId[] = ['HarmonicRipple', 'ArtDeco', 'DragonScales', 'GeometricStar', 'LowPolyFacet', 'GyroidManifold', 'BasketWeave', 'CelticKnot', 'SuperformulaBlossom'];

describe.skipIf(!RUN)('E-SCALECOL discontinuity-axis classifier', () => {
  it('theta-kink vs z-step per rep', () => {
    mkdirSync(OUT, { recursive: true });
    const rows: Array<Record<string, unknown>> = [];
    const H = DIMS.H;
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      // theta kink (vertical ridge/crease): max |d2r/dtheta2| over grid
      let thetaKink = 0; const nZ = 81, nU = 3072;
      for (let iz = 0; iz < nZ; iz++) {
        const z = (iz / (nZ - 1)) * H; const r = new Float64Array(nU);
        for (let i = 0; i < nU; i++) r[i] = rA(TAU * (i / nU), z);
        for (let i = 0; i < nU; i++) { const d2 = Math.abs(r[(i - 1 + nU) % nU] - 2 * r[i] + r[(i + 1) % nU]); if (d2 > thetaKink) thetaKink = d2; }
      }
      // z-step (horizontal ring boundary): max |r(z+dz)-r(z)| at fixed theta, fine z scan; also count distinct steps.
      let zStep = 0; const nZfine = 4000, nThetaSamp = 24; let zStepCount = 0;
      const zStepThresh = 0.3;
      for (let it = 0; it < nThetaSamp; it++) {
        const th = TAU * (it / nThetaSamp); let prev = rA(th, 0); let localSteps = 0;
        for (let iz = 1; iz < nZfine; iz++) { const z = (iz / (nZfine - 1)) * H; const r = rA(th, z); const d = Math.abs(r - prev); if (d > zStep) zStep = d; if (d > zStepThresh) localSteps++; prev = r; }
        if (localSteps > zStepCount) zStepCount = localSteps;
      }
      const seamStep = (() => { let mx = 0; for (let i = 0; i < 121; i++) { const z = (i / 120) * H; const s = Math.abs(rA(0, z) - rA((1 - 1e-9) * TAU, z)); if (s > mx) mx = s; } return mx; })();
      // classify by axis
      const axis = zStep > 0.5 && zStepCount >= 1 ? 'z-tiled/step' : thetaKink > 0.12 ? 'theta-ridge/crease' : 'smooth';
      const row = { style, thetaKink: +thetaKink.toFixed(3), zStepMax: +zStep.toFixed(3), zStepCount, seamStepMm: +seamStep.toFixed(3), axis };
      rows.push(row);
      console.log(`${style.padEnd(20)} thetaKink=${thetaKink.toFixed(2)} zStepMax=${zStep.toFixed(2)} zStepCount=${zStepCount} seam=${seamStep.toFixed(2)} => ${axis}`);
      writeFileSync(join(OUT, `axis_${style}.json`), JSON.stringify(row, null, 2));
    }
    writeFileSync(join(OUT, 'axis_ALL.json'), JSON.stringify(rows, null, 2));
  }, 3_600_000);
});
