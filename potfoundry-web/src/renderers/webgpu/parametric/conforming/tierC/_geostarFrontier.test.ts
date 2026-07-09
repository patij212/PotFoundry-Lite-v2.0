import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { styleSampler } from '../featureGraph/styleSampler';
import { buildProtectedComplex } from './morseComplex';
import {
  refineToZeroOutliers,
  type RefineOptions,
} from './noBridgeRefine';
import {
  DEFAULT_RULER,
  scoreWholeMesh,
  radialSurfaceFromSampler,
  liftChartMesh,
  facetInteriorHonest,
  denseBary,
} from './interiorRuler';

// DEV DIAGNOSTIC (PF_GSFRONT=1): the FULL GeoStar band (t[0.4,0.6]) plateaus at
// 2 outliers @0.028 under the BASE kernel (capped). Classify the 2 residuals
// and test the banked escalation levers (aniso edgeSag + tighter dedupe +
// adaptiveSeed) — literal-0 or Gothic-frontier pattern?
const GO = process.env.PF_GSFRONT === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_rebaseline20_final');
const cp = (row: Record<string, unknown>): void => {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(join(DIR, 'geostar_frontier.ndjson'), JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[gsfront] ${JSON.stringify(row)}`);
};

const DOMAIN = { uLo: 0, uHi: 0.1, tLo: 0.4, tHi: 0.6 };
const NTHETA = 1024;

function runCfg(
  tag: string,
  sampler: ReturnType<typeof styleSampler>,
  complex: ReturnType<typeof buildProtectedComplex>,
  extra: Partial<RefineOptions>,
): void {
  const t0 = Date.now();
  const loopRuler = { ...DEFAULT_RULER, nTheta: NTHETA, thetaWindowRad: 0.5 };
  const refined = refineToZeroOutliers(
    sampler,
    complex,
    DOMAIN,
    {
      tolMm: 0.01,
      maxPass: 20,
      bulkPasses7pt: 4,
      bgArcMm: 0.5,
      ruler: loopRuler,
      ...extra,
    },
    (s) => {
      // eslint-disable-next-line no-console
      if (s.pass >= (extra.bulkPasses7pt ?? 4))
        console.log(
          `[gsfront ${tag} pass ${s.pass}${s.dense ? ' D' : ''}] tris=${s.nTris} out=${s.outliers} worst=${s.worstMm.toFixed(5)} ins=${s.inserted}`,
        );
    },
  );
  const surface = radialSurfaceFromSampler(sampler);
  const guardRuler = { ...DEFAULT_RULER, nTheta: NTHETA };
  const score = scoreWholeMesh(sampler, surface, refined, 0.01, guardRuler);

  // classify the residual outlier facets: gradU (near-vertical flank signal),
  // (u,t) location, worst-sample distance to the nearest crest.
  const xyz = liftChartMesh(sampler, refined.uv);
  const nF = refined.tris.length / 3;
  const bary = denseBary(8);
  const outDetail: Array<Record<string, number>> = [];
  const TAU = 2 * Math.PI;
  const du = 1 / 8192;
  const wrap = (x: number): number => ((x % 1) + 1) % 1;
  for (let f = 0; f < nF && outDetail.length < 20; f++) {
    const a = refined.tris[3 * f];
    const b = refined.tris[3 * f + 1];
    const c = refined.tris[3 * f + 2];
    const um = (refined.uv[2 * a] + refined.uv[2 * b] + refined.uv[2 * c]) / 3;
    const tm =
      (refined.uv[2 * a + 1] + refined.uv[2 * b + 1] + refined.uv[2 * c + 1]) / 3;
    const g = facetInteriorHonest(surface, xyz, refined.uv, a, b, c, bary, guardRuler);
    if (g.dev > 0.01) {
      const z = tm * 120;
      const gradU =
        Math.abs(surface.rA(TAU * wrap(um + du), z) - surface.rA(TAU * wrap(um - du), z)) /
        (2 * du * TAU);
      outDetail.push({ f, um: +um.toFixed(5), tm: +tm.toFixed(5), dev: +g.dev.toFixed(5), gradU: +gradU.toFixed(1) });
    }
  }
  cp({
    tag,
    domain: 't[0.4,0.6]',
    tris: nF,
    capped: refined.capped,
    outliers: score.outliers,
    worstMm: +score.maxMm.toFixed(5),
    p99: +score.p99.toFixed(5),
    secs: +((Date.now() - t0) / 1000).toFixed(0),
    outDetail,
  });
}

describe.skipIf(!GO)('GeoStar full-relief-band frontier', () => {
  it('classify residuals + escalation levers', () => {
    const sampler = styleSampler('GeometricStar', {}, { H: 120, Rt: 50, Rb: 40 });
    const complex = buildProtectedComplex(sampler, 'GeometricStar');
    expect(complex.residualCrossings).toBe(0);

    // A: base (reproduce the plateau + classify the 2 residuals).
    runCfg('base', sampler, complex, {});
    // B: aniso edgeSag (banked Gothic lever — half the growth on flank needles).
    runCfg('aniso', sampler, complex, { splitMode: 'aniso', anisoDirection: 'edgeSag' });
    // C: aniso + tighter dedupe lattice (the plateau is dedupe-floored).
    runCfg('aniso+dedupe1e-3', sampler, complex, {
      splitMode: 'aniso',
      anisoDirection: 'edgeSag',
      dedupeCellMm: 0.001,
    });
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
