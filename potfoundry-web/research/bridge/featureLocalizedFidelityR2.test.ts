// featureLocalizedFidelityR2.test.ts — Round 2: true-3D + sliver-adjacent + all-20 screen
// DEV-ONLY (env PF_FEATFID_R2=1). MEASURE-ONLY — no kernel or src/ edits.
//
// Runs: (a) all-20 screen at moderate budget; (b) high-density confirm on
// BambooSegments + GothicArches + 3 worst screened styles.
//
// Run: PF_FEATFID_R2=1 npx vitest run research/bridge/featureLocalizedFidelityR2.test.ts
import { describe, it, expect } from 'vitest';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  crestValleyRetention, narrowChannelCoverage, featureAdjacentSlivers, globalChord,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const HMIN_SCREEN = 0.02;
const HMIN_DENSE  = 0.008;
const STEP_MM_SCREEN = 0.025; // ~ hMin/2 — enough to mark feature triangles
const STEP_MM_DENSE  = 0.010;
const TRUTH_RES = 384;

const ALL_20: StyleId[] = [
  'SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple',
  'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales',
  'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave',
  'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet',
];

const SCREEN_OPTS: InhouseMeshOpts = {
  tolMm: 0.01, hMin: HMIN_SCREEN, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 800_000, splitThresh: 1.5, optimizeSweeps: 2,
};
const DENSE_OPTS: InhouseMeshOpts = {
  tolMm: 0.004, hMin: HMIN_DENSE, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
  seedN: 14, maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2,
};

// Kill-criterion triggers for REAL-DEFECT classification (pre-registered):
//   true-3D feature p99 > 0.1mm  OR  crest under-shoot > 0.1mm
//   OR  feature-adjacent %<20° materially worse (sliverRatio ≥ 1.5)
function isRealDefect(r: ScreenRow): boolean {
  return r.fl3d_p99 > 0.1 || r.crestUnderWorstMm > 0.1 || r.sliverRatio >= 1.5;
}

interface ScreenRow {
  style: string; tris: number; runtimeS: number;
  // true-3D feature (primary)
  fl3d_rms: number; fl3d_p99: number; fl3d_max: number;
  // same-param (for overstatement ratio)
  fl_p99: number; radialOverstatement: number;
  // global rms for context
  globalRms: number;
  // crest under-shoot
  crestUnderWorstMm: number; crestUnderWorstPct: number;
  // sliver adjacent vs whole mesh
  featAdj_pct20: number; wholeMesh_pct20: number; sliverRatio: number; adjCount: number;
  // channel coverage
  narrowestMm: number; minTrisAcross: number;
  // classification
  realDefect: boolean; mechanism: string;
  flSamples: number; missed3d: number;
}

function mechanism(r: ScreenRow): string {
  const parts: string[] = [];
  if (r.fl3d_p99 > 0.1) parts.push(`chord3D-p99=${r.fl3d_p99.toFixed(3)}`);
  if (r.crestUnderWorstMm > 0.1) parts.push(`crest-under=${r.crestUnderWorstMm.toFixed(3)}mm`);
  if (r.sliverRatio >= 1.5) parts.push(`adj-slivers=${r.sliverRatio.toFixed(1)}x`);
  if (r.minTrisAcross < 2) parts.push('stepped-over');
  if (parts.length === 0) return r.radialOverstatement > 5 ? 'radial-artifact(accept)' : 'accept-class';
  return parts.join('+');
}

function runStyle(style: StyleId, opts: InhouseMeshOpts, stepMm: number): ScreenRow | { style: string; error: string } {
  try {
    const rA = buildRadiusFn(style, {}, DIMS);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, opts);
    const runtimeS = (Date.now() - t0) / 1000;
    const meshUt = buildMeshUt(mesh.ut, mesh.indices, rA, DIMS.H);
    const locator = buildLocator(meshUt, 256);
    const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);

    const gc  = globalChord(mesh.ut, mesh.indices, rA, DIMS.H);
    const fl  = featureLineChord(truth, locator, rA, DIMS.H, stepMm);
    const fl3 = featureLineChord3D(truth, locator, meshUt, rA, DIMS.H, stepMm, fl.p99Mm);
    const cr  = crestValleyRetention(truth, locator, rA, DIMS.H, stepMm);
    const ch  = narrowChannelCoverage(truth, meshUt, locator, stepMm);
    const sl  = featureAdjacentSlivers(truth, locator, meshUt, stepMm);

    const row: ScreenRow = {
      style: String(style), tris: mesh.indices.length / 3, runtimeS,
      fl3d_rms: fl3.rmsMm, fl3d_p99: fl3.p99Mm, fl3d_max: fl3.maxMm,
      fl_p99: fl.p99Mm, radialOverstatement: fl3.radialOverstatementRatio,
      globalRms: gc.rmsMm,
      crestUnderWorstMm: cr.crestUnderWorstMm, crestUnderWorstPct: cr.crestUnderWorstPct,
      featAdj_pct20: sl.featureAdj_pct20, wholeMesh_pct20: sl.wholeMesh_pct20,
      sliverRatio: sl.sliverRatio, adjCount: sl.featureAdjCount,
      narrowestMm: ch.narrowestWidthMm, minTrisAcross: ch.minTrisAcross,
      realDefect: false, mechanism: '',
      flSamples: fl.samples, missed3d: fl3.missed,
    };
    row.realDefect = isRealDefect(row);
    row.mechanism  = mechanism(row);
    return row;
  } catch (e) {
    return { style: String(style), error: String(e) };
  }
}

function printRow(r: ScreenRow): void {
  const flag = r.realDefect ? 'DEFECT' : 'accept';
  // eslint-disable-next-line no-console
  console.log(
    `${r.style.padEnd(22)} ${flag.padEnd(6)} tris=${String(r.tris).padStart(7)} ` +
    `3d_p99=${r.fl3d_p99.toFixed(4)} 3d_max=${r.fl3d_max.toFixed(3)} ` +
    `gRms=${r.globalRms.toFixed(4)} radOvr=${r.radialOverstatement.toFixed(1)}x ` +
    `crestU=${r.crestUnderWorstMm.toFixed(3)}mm(${r.crestUnderWorstPct.toFixed(0)}%) ` +
    `adjSlv=${r.featAdj_pct20.toFixed(1)}%vs${r.wholeMesh_pct20.toFixed(1)}%(x${r.sliverRatio.toFixed(1)}) ` +
    `narrow=${r.narrowestMm.toFixed(3)}mm/tris=${r.minTrisAcross} ` +
    `[${r.mechanism}] ${r.runtimeS.toFixed(0)}s`,
  );
}

describe('feature-localized fidelity R2 (all-20 + true-3D + slivers)', () => {
  it.skipIf(!process.env.PF_FEATFID_R2)('all-20 screen + high-density confirm', () => {
    const screenRows: ScreenRow[] = [];
    const errors: Array<{ style: string; error: string }> = [];

    // eslint-disable-next-line no-console
    console.log('\n=== FEAT-FID R2: ALL-20 SCREEN (E-2026-06-30-FEAT-FID-R2) ===\n');

    // --- Phase 1: all-20 screen ---
    for (const style of ALL_20) {
      const r = runStyle(style, SCREEN_OPTS, STEP_MM_SCREEN);
      if ('error' in r) {
        errors.push(r);
        // eslint-disable-next-line no-console
        console.log(`${String(style).padEnd(22)} ERROR: ${r.error}`);
      } else {
        screenRows.push(r);
        printRow(r);
      }
    }

    // Rank by true-3D p99 descending + crest under-shoot
    const ranked = [...screenRows].sort((a, b) =>
      (b.fl3d_p99 + b.crestUnderWorstMm) - (a.fl3d_p99 + a.crestUnderWorstMm),
    );
    const defects = ranked.filter(r => r.realDefect);
    const accepts = ranked.filter(r => !r.realDefect);

    // eslint-disable-next-line no-console
    console.log('\n=== RANKED (worst → best, by true3D p99 + crest) ===');
    // eslint-disable-next-line no-console
    ranked.forEach(r => console.log(`  ${r.style.padEnd(22)} ${r.realDefect ? 'DEFECT' : 'accept'} 3d_p99=${r.fl3d_p99.toFixed(4)} crest=${r.crestUnderWorstMm.toFixed(3)}`));

    // Pick 3 worst from the screened (excl BambooSegments + GothicArches already confirmed)
    const alwaysConfirm = new Set(['BambooSegments', 'GothicArches']);
    const extraWorst = defects.filter(r => !alwaysConfirm.has(r.style)).slice(0, 3);

    const highDensityTargets: StyleId[] = [
      'BambooSegments', 'GothicArches',
      ...extraWorst.map(r => r.style as StyleId),
    ].filter((s, i, arr) => arr.indexOf(s) === i); // unique

    // eslint-disable-next-line no-console
    console.log(`\n=== HIGH-DENSITY CONFIRM on: ${highDensityTargets.join(', ')} ===\n`);

    const denseRows: ScreenRow[] = [];
    for (const style of highDensityTargets) {
      const r = runStyle(style, DENSE_OPTS, STEP_MM_DENSE);
      if ('error' in r) {
        errors.push(r);
        // eslint-disable-next-line no-console
        console.log(`${String(style).padEnd(22)} ERROR: ${r.error}`);
      } else {
        r.style = `${r.style}(hd)`;
        denseRows.push(r);
        printRow(r);
      }
    }

    // Full JSON for ledger
    // eslint-disable-next-line no-console
    console.log('\n=== JSON SCREEN ===\n' + JSON.stringify(screenRows, null, 2));
    // eslint-disable-next-line no-console
    console.log('\n=== JSON DENSE ===\n' + JSON.stringify(denseRows, null, 2));
    // eslint-disable-next-line no-console
    console.log('\n=== DEFECTS ===\n' + defects.map(r => r.style + ' ' + r.mechanism).join('\n'));
    // eslint-disable-next-line no-console
    console.log('\n=== ACCEPTS ===\n' + accepts.map(r => r.style).join(', '));
    if (errors.length) {
      // eslint-disable-next-line no-console
      console.log('\n=== ERRORS ===\n' + errors.map(e => `${e.style}: ${e.error}`).join('\n'));
    }

    expect(screenRows.length).toBeGreaterThan(0);
    expect(denseRows.length).toBeGreaterThan(0);
  }, 120 * 60 * 1000); // 2 hour cap for 20 screen + 5 dense
});
