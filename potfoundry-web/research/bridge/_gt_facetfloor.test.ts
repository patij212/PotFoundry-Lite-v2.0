// _gt_facetfloor.test.ts — DEV-ONLY (env-gated). E-2026-07-08-GYROID-TRUTH.
//
// DEFINITIVE per-facet true-3D floor on the worst-N facets: the FULL-FACET windowed brute8192 (all 45 denseBary
// points, near-truth per-point), so the facet-dev is the true max over the facet (not just its worst-radial point).
// This adjudicates whether the whole-facet Newton dev OVERSTATES (Newton misses a well on some interior point) or
// the interior point is genuinely deviant. min(newton, brute) per point is the tightest honest per-point value.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bruteTruth, newtonNearest, denseBary, facetTrue3D, type FacetRec } from './_gyroid_truthLib';
import { radiusFn } from './_pf_tangledKernelLib';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_gyroid_truth');
const TAU = 2 * Math.PI;

describe('E-2026-07-08-GYROID-TRUTH — facet floor (full-facet brute8192 vs newton)', () => {
  it.skipIf(process.env.PF_GT_FLOOR !== '1')('worst-N full-facet true-3D floor', () => {
    mkdirSync(DIR, { recursive: true });
    const N = Number(process.env.PF_GT_FLOOR_N ?? 20);
    const rA = radiusFn('GyroidManifold' as StyleId, DIMS); const H = DIMS.H;
    const recs: FacetRec[] = readFileSync(join(DIR, 'worst500.ndjson'), 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x)).slice(0, N);
    const OUT = join(DIR, 'facetfloor.ndjson');
    const done = new Set(existsSync(OUT) ? readFileSync(OUT, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x).f) : []);
    // per-point windowed brute8192 (near-truth); newton per-point (validated tighter). min = honest per-point value.
    const brutePt = (px: number, py: number, pz: number): number => {
      const rho = Math.hypot(px, py); const th0 = Math.atan2(py, px); const bnd = Math.abs(rho - rA(th0 < 0 ? th0 + TAU : th0, Math.min(H, Math.max(0, pz))));
      const win = Math.min(Math.PI, Math.asin(Math.min(1, (2 * Math.max(bnd, 0.02)) / Math.max(1e-6, rho))) + 0.06);
      return bruteTruth(rA, H, px, py, pz, { nTheta: 8192, nZ: 1600, zBandMm: 4, kBest: 24, refineIters: 150, thetaWindowRad: win }).dist;
    };
    const newtPt = (px: number, py: number, pz: number): number => newtonNearest(rA, H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 }).dist;
    for (const rec of recs) {
      if (done.has(rec.f)) continue;
      const bDev = facetTrue3D(rec, brutePt).dev;      // true facet max via brute (all 45 pts)
      const nDev = facetTrue3D(rec, newtPt).dev;        // newton facet max
      const tDev = facetTrue3D(rec, (px, py, pz) => Math.min(brutePt(px, py, pz), newtPt(px, py, pz))).dev; // tightest per-point
      appendFileSync(OUT, JSON.stringify({ f: rec.f, radial: +rec.radialDev.toFixed(6), bruteFacet: +bDev.toFixed(6), newtonFacet: +nDev.toFixed(6), tightFacet: +tDev.toFixed(6), newtonOver: +(nDev - bDev).toFixed(6) }) + '\n');
      process.stderr.write(`  floor f=${rec.f} radial=${rec.radialDev.toFixed(4)} brute=${bDev.toFixed(5)} newton=${nDev.toFixed(5)} tight=${tDev.toFixed(5)}\n`);
    }
    const rows = readFileSync(OUT, 'utf8').split('\n').filter((x) => x.trim()).map((x) => JSON.parse(x));
    let maxTight = 0, maxBrute = 0, maxNewtonOver = 0;
    for (const r of rows) { if (r.tightFacet > maxTight) maxTight = r.tightFacet; if (r.bruteFacet > maxBrute) maxBrute = r.bruteFacet; if (r.newtonOver > maxNewtonOver) maxNewtonOver = r.newtonOver; }
    // eslint-disable-next-line no-console
    console.log(`FACET FLOOR (worst-${N}, full-facet): maxTight(min brute,newton)=${maxTight.toFixed(6)} maxBrute=${maxBrute.toFixed(6)} maxNewtonOver=${maxNewtonOver.toFixed(6)} (newtonOver>0 ⇒ newton misses interior wells; brute/tight is the honest floor)`);
    appendFileSync(join(DIR, 'meta.ndjson'), JSON.stringify({ stage: 'FLOOR', N, maxTightFacet: maxTight, maxBruteFacet: maxBrute, maxNewtonOver }) + '\n');
    expect(rows.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});
