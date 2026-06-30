// featureLocalizedFidelity.test.ts — DEV-ONLY runner (env PF_FEATFID=1).
//
// MEASURE-ONLY. Quantifies feature-localized generalization of the in-house surface-metric
// mesher on the sharpest/narrowest styles. Builds the kernel mesh at two configs (default
// fidelity vs +chord-sag guard) and measures: feature-line chord vs global chord, crest/valley
// height retention, narrow-channel coverage. Does NOT modify the kernel or any src/ file.
//
// Run: PF_FEATFID=1 npx vitest run research/bridge/featureLocalizedFidelity.test.ts
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, crestValleyRetention,
  narrowChannelCoverage, globalChord,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['GeometricStar', 'GothicArches', 'Crystalline'] as StyleId[];

// hMin is the feature-line arc-length sampling step (mm) and the kernel's min edge.
const HMIN = 0.008;
// Arc-length sample step along feature lines (mm). Use ~hMin so we sample at mesh resolution.
const STEP_MM = HMIN;
// Dense-truth marching grid resolution (feature LOCATIONS). 384 keeps loci sub-cell on a
// 1024^2 sampler; higher would be slower without moving the location materially.
const TRUTH_RES = 384;

const CONFIG_A: InhouseMeshOpts = {
  tolMm: 0.004, hMin: HMIN, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2,
};
const CONFIG_B: InhouseMeshOpts = { ...CONFIG_A, chordTolMm: 0.05 };

interface Row {
  style: string; config: string; tris: number; runtimeS: number;
  globalRms: number; globalP99: number; globalMax: number;
  flRms: number; flP99: number; flMax: number; flSamples: number; flMissed: number;
  flRatio: number; // featureLineRms / globalRms
  crestUnderMeanMm: number; crestUnderWorstMm: number; crestUnderMeanPct: number; crestUnderWorstPct: number;
  valleyOverWorstMm: number; crestSamples: number;
  narrowestWidthMm: number; minTrisAcross: number; medianSpacingMm: number;
}

function runOne(style: StyleId, config: string, opts: InhouseMeshOpts): Row {
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, opts);
  const runtimeS = (Date.now() - t0) / 1000;

  const meshUt = buildMeshUt(mesh.ut, mesh.indices, rA, DIMS.H);
  const locator = buildLocator(meshUt, 256);
  const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);

  const gc = globalChord(mesh.ut, mesh.indices, rA, DIMS.H);
  const fl = featureLineChord(truth, locator, rA, DIMS.H, STEP_MM);
  const cr = crestValleyRetention(truth, locator, rA, DIMS.H, STEP_MM);
  const ch = narrowChannelCoverage(truth, meshUt, locator, STEP_MM);

  return {
    style: String(style), config, tris: mesh.indices.length / 3, runtimeS,
    globalRms: gc.rmsMm, globalP99: gc.p99Mm, globalMax: gc.maxMm,
    flRms: fl.rmsMm, flP99: fl.p99Mm, flMax: fl.maxMm, flSamples: fl.samples, flMissed: fl.missed,
    flRatio: gc.rmsMm > 0 ? fl.rmsMm / gc.rmsMm : 0,
    crestUnderMeanMm: cr.crestUnderMeanMm, crestUnderWorstMm: cr.crestUnderWorstMm,
    crestUnderMeanPct: cr.crestUnderMeanPct, crestUnderWorstPct: cr.crestUnderWorstPct,
    valleyOverWorstMm: cr.valleyOverWorstMm, crestSamples: cr.crestSamples,
    narrowestWidthMm: ch.narrowestWidthMm, minTrisAcross: ch.minTrisAcross, medianSpacingMm: ch.medianSpacingMm,
  };
}

function printRow(r: Row): void {
  // eslint-disable-next-line no-console
  console.log(
    `${r.style.padEnd(14)} ${r.config.padEnd(3)} ` +
    `tris=${String(r.tris).padStart(7)} ` +
    `gRms=${r.globalRms.toFixed(4)} ` +
    `flRms=${r.flRms.toFixed(4)} flP99=${r.flP99.toFixed(3)} flMax=${r.flMax.toFixed(3)} ` +
    `RATIO=${r.flRatio.toFixed(2)} ` +
    `crestU(mean/worst)=${r.crestUnderMeanMm.toFixed(3)}/${r.crestUnderWorstMm.toFixed(3)}mm ` +
    `(${r.crestUnderMeanPct.toFixed(1)}/${r.crestUnderWorstPct.toFixed(1)}%) ` +
    `narrow=${r.narrowestWidthMm.toFixed(3)}mm tris-across=${r.minTrisAcross} ` +
    `(med=${r.medianSpacingMm.toFixed(2)}) ` +
    `flN=${r.flSamples}(miss${r.flMissed}) crestN=${r.crestSamples} ` +
    `${r.runtimeS.toFixed(0)}s`,
  );
}

describe('feature-localized fidelity (straddle-mask quantified)', () => {
  it.skipIf(!process.env.PF_FEATFID)('measure 3 styles x 2 configs', () => {
    const rows: Row[] = [];
    // eslint-disable-next-line no-console
    console.log('\n=== FEATURE-LOCALIZED FIDELITY (E-2026-06-30-FEAT-FID) ===\n');
    for (const style of STYLES) {
      for (const [label, opts] of [['A', CONFIG_A], ['B', CONFIG_B]] as const) {
        const r = runOne(style, label, opts);
        rows.push(r);
        printRow(r);
      }
    }
    // eslint-disable-next-line no-console
    console.log('\n=== JSON ===\n' + JSON.stringify(rows, null, 2));
    expect(rows.length).toBe(6);
  }, 60 * 60 * 1000);
});
