// _breadthInspect.test.ts — DEV-ONLY (env PF_BREADTH_INSPECT=1). TEAM B — BREADTH.
// STEP 0: empirically characterize the discontinuity TYPE of each single-valued step/riser style
// (DragonScales / GeometricStar / BambooSegments / LowPolyFacet) BEFORE choosing the conforming recipe.
//
// For each style we scan the analytic rA(theta,z) on a fine (theta,z) grid and report:
//   (1) max |dr/dz| across an infinitesimal z-step at fixed theta  → a RADIUS STEP AT FIXED z (ArtDeco-like tread).
//   (2) max |dr/dtheta| across an infinitesimal theta-step at fixed z → an IN-PLANE C0 crease / radial cliff.
//   (3) where those maxima are (theta,z / t) → is the z-jump theta-INDEPENDENT (a clean ring) or diagonal?
// A large (2) with small (1) ⇒ in-plane crease (GeometricStar / LowPoly polygon edges) — no tread band needed.
// A large (1) at a FIXED t independent of theta ⇒ ArtDeco-like tread ring — needs a connecting band.
//
// ISOLATION: research/ only; reads src analytic rA via labkit's buildRadiusFn. Writes ONLY research/exchange/_breadth/.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_breadth', '_inspect');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

const STYLES: StyleId[] = ['DragonScales', 'GeometricStar', 'BambooSegments', 'LowPolyFacet'] as StyleId[];

describe('BREADTH-INSPECT', () => {
  it.skipIf(process.env.PF_BREADTH_INSPECT !== '1')('characterize discontinuity type of the 4 styles', () => {
    const nTh = 2000, nZ = 1600;
    const dEps = 1e-4; // relative-to-H / to-TAU infinitesimal step
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      // (1) z-jump: sample r(th, z) and r(th, z+dz), dz small in mm
      const dz = DIMS.H * dEps;
      const dth = TAU * dEps;
      let maxDrDz = 0, maxDrDzTh = 0, maxDrDzZ = 0;
      let maxDrDth = 0, maxDrDthTh = 0, maxDrDthZ = 0;
      // histogram of z-locations of large z-jumps (to see if theta-independent ring)
      const bigZjumps: Array<{ th: number; z: number; dr: number }> = [];
      const bigThJumps: Array<{ th: number; z: number; dr: number }> = [];
      for (let i = 0; i < nTh; i++) {
        const th = TAU * (i / nTh);
        for (let j = 0; j < nZ; j++) {
          const z = DIMS.H * (j / (nZ - 1));
          const r0 = rA(th, z);
          // z-derivative (mm radius per mm z, scaled by step)
          const rz = rA(th, Math.min(DIMS.H, z + dz));
          const drdz = Math.abs(rz - r0); // absolute radius change over dz mm
          if (drdz > maxDrDz) { maxDrDz = drdz; maxDrDzTh = th; maxDrDzZ = z; }
          if (drdz > 0.02 && bigZjumps.length < 4000) bigZjumps.push({ th, z, dr: drdz });
          // theta-derivative
          const rt = rA(th + dth, z);
          const drdth = Math.abs(rt - r0);
          if (drdth > maxDrDth) { maxDrDth = drdth; maxDrDthTh = th; maxDrDthZ = z; }
          if (drdth > 0.02 && bigThJumps.length < 4000) bigThJumps.push({ th, z, dr: drdth });
        }
      }
      // Are the big z-jumps at theta-INDEPENDENT z's (clean rings)? Bucket their z into 0.5mm bins; count distinct
      // z-bins that appear across MANY thetas (>50% of sampled thetas) ⇒ ring-like.
      const zbin = new Map<number, Set<number>>();
      for (const b of bigZjumps) { const zk = Math.round(b.z / 0.5); if (!zbin.has(zk)) zbin.set(zk, new Set()); zbin.get(zk)!.add(Math.round(b.th * 50)); }
      const ringZs: Array<{ z: number; thetaCoverage: number; worstDr: number }> = [];
      for (const [zk, ths] of zbin) {
        const cov = ths.size / (nTh * 0.5 / (TAU / (TAU / 50))); // approx coverage fraction proxy
        // simpler: coverage = distinct theta-buckets / total possible (100 buckets of th*50 over [0,2pi]≈ 314)
        const covFrac = ths.size / 314;
        if (covFrac > 0.3) {
          const worst = bigZjumps.filter(b => Math.round(b.z / 0.5) === zk).reduce((m, b) => Math.max(m, b.dr), 0);
          ringZs.push({ z: zk * 0.5, thetaCoverage: covFrac, worstDr: worst });
        }
      }
      ringZs.sort((a, b) => a.z - b.z);
      const rec = {
        style,
        maxRadiusStepPerDz_mm: maxDrDz, at_z: maxDrDzZ, at_th: maxDrDzTh, dz_mm: dz,
        maxRadiusStepPerDth_mm: maxDrDth, at_z2: maxDrDthZ, at_th2: maxDrDthTh, dth_rad: dth,
        nBigZjumps: bigZjumps.length, nBigThJumps: bigThJumps.length,
        ringLikeZlevels: ringZs.slice(0, 30),
        interpretation: maxDrDz > 5 * maxDrDth ? 'RADIUS-STEP-AT-Z (tread ring)'
          : maxDrDth > 5 * maxDrDz ? 'IN-PLANE-CREASE (radial cliff, no tread)'
          : 'MIXED / smooth',
      };
      save(`inspect_${style}`, rec);
      // eslint-disable-next-line no-console
      console.log(`[inspect ${style}] maxΔr/dz=${maxDrDz.toFixed(4)}mm @z=${maxDrDzZ.toFixed(2)} | maxΔr/dθ=${maxDrDth.toFixed(4)}mm @z=${maxDrDthZ.toFixed(2)} th=${maxDrDthTh.toFixed(3)} | ringZlevels=${ringZs.length} | ${rec.interpretation}`);
    }
  }, 600_000);
});
