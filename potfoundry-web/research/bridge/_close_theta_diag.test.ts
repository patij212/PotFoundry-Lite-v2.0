// _close_theta_diag.test.ts — DEV-ONLY (PF_CT_DIAG=1). Localize the SFB / GothicArches red-facet residual:
// is it the SEAM-CLIFF / near-seam knife-edge class (STRUCTCOL2-characterised, radial-overstated) or a body defect?
// Cheap density (h=0.5) so it runs fast alongside the HD scoring run. Splits the honest true-3D worst-red set by
// u-band (seam vs interior) and reports INTERIOR true-3D (seam petal + seam excluded) — the flank-body verdict.
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, bruteAnchoredRedPerp, triangleQualityDistribution } from './labkit';
import { analyticBruteDist } from './_sfbPushLib';
import { buildScaleColMesh } from './_scaleColDriver';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_CT_DIAG === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_close_theta');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;

function p99(arr: number[]): number { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(0.99 * s.length))]; }

describe('CLOSE-THETA diag — localize SFB/Gothic red residual', () => {
  for (const [style, hRow, seamExcl] of [['SuperformulaBlossom', 0.5, 0.10], ['GothicArches', 0.35, 0.02]] as const) {
    it.skipIf(!RUN)(`localize ${style}`, () => {
      mkdirSync(DIR, { recursive: true });
      const rA = buildRadiusFn(style as StyleId, {}, DIMS);
      const build = buildScaleColMesh(rA, H, { hRowMm: hRow });
      const m = build.mesh; const ut = m.ut; const idx = m.idx;
      const xyz = m.xyz instanceof Float64Array ? m.xyz : Float64Array.from(m.xyz);
      const radial = perFaceChordSag(ut, idx, rA, H);
      // build INTERIOR facet index (exclude seam band by centroid-u) and score INTERIOR true-3D worst-red separately.
      const nF = idx.length / 3; const intIdx: number[] = [];
      const seamFaceErr: number[] = [];
      for (let f = 0; f < nF; f++) {
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
        let u = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3; u = ((u % 1) + 1) % 1;
        const dSeam = Math.min(u, 1 - u);
        if (dSeam >= seamExcl) intIdx.push(a, b, c); else if (radial.faceErr[f] > 0.1) seamFaceErr.push(radial.faceErr[f]);
      }
      // interior brute-anchored true-3D worst-red
      const intRadial = perFaceChordSag(ut, intIdx, rA, H);
      const intAnchor = intRadial.fracOver(0.1) > 0
        ? bruteAnchoredRedPerp(ut, intIdx, rA, H, { redMm: 0.1, sampleN: 40, radial: intRadial })
        : { trustedP99: 0, gnP99: 0, nRed: 0, gnOver: 0 };
      const intHonest = intAnchor.nRed > 0 ? intAnchor.trustedP99 : p99(Array.from(intRadial.faceErr));
      // whole brute-anchored for the seam-inclusive number + count where seam facets dominate the red set
      const wholeAnchor = radial.fracOver(0.1) > 0 ? bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.1, sampleN: 40, radial }) : { trustedP99: 0, gnP99: 0, nRed: 0, gnOver: 0 };
      let seamRed = 0, intRed = 0;
      for (let f = 0; f < nF; f++) {
        if (radial.faceErr[f] <= 0.1) continue;
        const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
        let u = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3; u = ((u % 1) + 1) % 1;
        if (Math.min(u, 1 - u) < seamExcl) seamRed++; else intRed++;
      }
      // OWN-REGION true-3D: re-score the worst-K red facets with a TIGHT z-window analytic brute (zWin 3mm) at the
      // facet CENTROID. Unlike the ±14mm-band bruteAnchoredRedPerp, this cannot jump to an ADJACENT petal fold ~35mm
      // away in xyz (SFB petals fold close in 3D but are far in z is FALSE — folds are near in z, so the wide band
      // finds a wrong-well neighbour-petal foot). The tight window = the STRUCTCOL2 own-region ruler. Top-K by radial.
      const redFaces: number[] = [];
      for (let f = 0; f < nF; f++) if (radial.faceErr[f] > 0.1) redFaces.push(f);
      redFaces.sort((x, y) => radial.faceErr[y] - radial.faceErr[x]);
      const ownDists: number[] = []; let ownSeamRed = 0, ownIntRed = 0;
      const lift = (i: number): [number, number, number] => { const th = 2 * Math.PI * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
      for (const f of redFaces.slice(0, 200)) {
        const [ax, ay, az] = lift(idx[3 * f]), [bx, by, bz] = lift(idx[3 * f + 1]), [cx, cy, cz] = lift(idx[3 * f + 2]);
        const px = (ax + bx + cx) / 3, py = (ay + by + cy) / 3, pz = (az + bz + cz) / 3;
        const d = analyticBruteDist(px, py, pz, rA, H, { nTheta: 4096, zWinMm: 2.0, nZ: 9 });
        ownDists.push(d);
        let u = (ut[2 * idx[3 * f]] + ut[2 * idx[3 * f + 1]] + ut[2 * idx[3 * f + 2]]) / 3; u = ((u % 1) + 1) % 1;
        if (Math.min(u, 1 - u) < seamExcl) ownSeamRed++; else ownIntRed++;
      }
      const ownP99 = p99(ownDists), ownMax = ownDists.length ? Math.max(...ownDists) : 0;
      const itq = triangleQualityDistribution({ vertices: xyz, indices: intIdx });
      const row = {
        ownRegionP99Mm: +ownP99.toFixed(4), ownRegionMaxMm: +ownMax.toFixed(4), ownRedSampled: ownDists.length,
        ownSeamRed, ownIntRed,
        style, hRow, tris: m.nF, path: build.path, builder: build.builder,
        wholeAnchoredP99: +wholeAnchor.trustedP99.toFixed(4), wholeNRed: wholeAnchor.nRed,
        seamRedFacets: seamRed, intRedFacets: intRed,
        interiorHonestTrue3dP99: +intHonest.toFixed(4), interiorNRed: intAnchor.nRed,
        interiorPctBelow20: +itq.pctBelow20.toFixed(2), interiorMinAngle: +itq.minAngleDeg.toFixed(1),
        interiorRadialP99: +p99(Array.from(intRadial.faceErr)).toFixed(4),
      };
      appendFileSync(join(DIR, 'diag.ndjson'), JSON.stringify(row) + '\n');
      console.log(`${style} DIAG: OWN-REGION(zWin2) p99=${row.ownRegionP99Mm} max=${row.ownRegionMaxMm} (sampled ${ownDists.length}: seam ${ownSeamRed}/int ${ownIntRed}) | wideBand anchoredP99=${row.wholeAnchoredP99} (nRed ${row.wholeNRed}) | int%<20=${row.interiorPctBelow20} intRadialP99=${row.interiorRadialP99}`);
      expect(m.nF).toBeGreaterThan(0);
    }, 30 * 60 * 1000);
  }
});
