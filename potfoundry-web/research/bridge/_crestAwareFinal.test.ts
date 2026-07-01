// _crestAwareFinal.test.ts — DEV-ONLY (env PF_CRESTFINAL=1). E-2026-07-01-CRESTAWARE deliverable + controls.
// Produces the mission-named render dumps at a FIXED equal budget with BOTH true-3D (honest default) and radial
// (mission heatmap) rulers via dumpHeatmap, so the render shows the honest comparison:
//   GothicArches_crestaware_base  = conforming, crest-aware OFF (the SF-mechanism baseline).
//   GothicArches_crestaware_conf  = conforming, crest-aware ON  (the mission approach).
// Plus the two required controls:
//   (P3 no-op) re-fingerprint the DEFAULT kernel (must stay idxHash 948740756).
//   (smooth control) HarmonicRipple with the crest-aware opt-in ON must be ~unaffected (gate keeps ~0 loci; the
//     overlay on a smooth style must not wreck it — dump both rulers so the render confirms all-green).
// Run: PF_CRESTFINAL=1 npx vitest run research/bridge/_crestAwareFinal.test.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildLocator, buildFeatureTruth } from './featureLocalizedFidelity';
import { dumpHeatmap, auditNonManByIndex, perFaceChordSag, perFaceTrue3DSag } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const OUT = join('research', 'exchange', '_showcase');

function report(label: string, ut: number[], idx: Uint32Array, rA: (th: number, z: number) => number, H: number): void {
  const nF = idx.length / 3;
  const rad = perFaceChordSag(ut, idx, rA, H); const t3 = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.02 });
  const cnt = (fe: Float64Array, thr: number): number => { let o = 0; for (let f = 0; f < nF; f++) if (fe[f] > thr) o++; return o; };
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(30)} tris=${nF} | RADIAL worst=${rad.worstMm.toFixed(3)} RED=${(100 * cnt(rad.faceErr, 0.15) / nF).toFixed(5)}% YEL=${(100 * cnt(rad.faceErr, 0.05) / nF).toFixed(5)}% | TRUE3D worst=${t3.worstMm.toFixed(3)} RED=${(100 * cnt(t3.faceErr, 0.15) / nF).toFixed(5)}% YEL=${(100 * cnt(t3.faceErr, 0.05) / nF).toFixed(5)}%`);
}

describe('crest-aware FINAL deliverable + controls', () => {
  it.skipIf(process.env.PF_CRESTFINAL !== '1')('mission dumps (base/conf) + no-op + smooth control', () => {
    mkdirSync(OUT, { recursive: true });
    const H = DIMS.H;

    // (P3) no-op fingerprint of the DEFAULT kernel — must be byte-identical (948740756).
    {
      const rA0 = buildRadiusFn('GothicArches' as StyleId, {}, DIMS);
      const NOOP = { tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 200_000, splitThresh: 1.5, optimizeSweeps: 2 };
      const m = buildInhouseMetricMesh(rA0, H, NOOP);
      let s = 0; for (let i = 0; i < m.indices.length; i++) s = (s * 31 + m.indices[i]) >>> 0;
      // eslint-disable-next-line no-console
      console.log(`NOOP idxHash=${s} (want 948740756) tris=${m.indices.length / 3}`);
      expect(s).toBe(948740756);
    }

    // GothicArches base (OFF) + conf (ON) at a FIXED equal budget.
    const rA = buildRadiusFn('GothicArches' as StyleId, {}, DIMS);
    const truth = buildFeatureTruth('GothicArches' as StyleId, {}, DIMS, TRUTH_RES);
    const OPTS: InhouseMeshOpts = { tolMm: 0.02, hMin: 0.02, hMax: 8, sizeRes: 512, gradeBeta: 0.2, seedN: 14, maxPoints: 1_200_000, splitThresh: 1.5, optimizeSweeps: 2 };
    const base0 = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base0.ut, base0.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i], planarizeConstraints: true as const, chordTolMm: 0.03, chordSteiner: true as const, curvatureFineStep: 1 / 2048, curvatureSubsamples: 2 };

    const baseB = buildFeatureConformingMeshB('GothicArches' as StyleId, {}, DIMS, { ...common });
    const baseIdx = Uint32Array.from(baseB.indices); const baseMesh = buildMeshUt(baseB.ut, baseIdx, rA, H);
    dumpHeatmap(OUT, 'GothicArches_crestaware_base', baseMesh.xyz, baseB.ut, baseIdx, rA, H, { meta: { config: 'conf, crest-aware OFF' } });
    dumpHeatmap(OUT, 'GothicArches_crestaware_base_radial', baseMesh.xyz, baseB.ut, baseIdx, rA, H, { ruler: 'radial', meta: { config: 'conf, crest-aware OFF (radial)' } });
    // eslint-disable-next-line no-console
    console.log(`base nonMan=${auditNonManByIndex(baseMesh.xyz, baseIdx)}`);
    report('BASE (crest-aware OFF)', baseB.ut, baseIdx, rA, H);

    const conf = buildFeatureConformingMeshB('GothicArches' as StyleId, {}, DIMS, { ...common, crestAwareSizing: true, crestBandCells: 1 });
    const confIdx = Uint32Array.from(conf.indices); const confMesh = buildMeshUt(conf.ut, confIdx, rA, H);
    dumpHeatmap(OUT, 'GothicArches_crestaware_conf', confMesh.xyz, conf.ut, confIdx, rA, H, { meta: { config: 'conf, crest-aware ON' } });
    dumpHeatmap(OUT, 'GothicArches_crestaware_conf_radial', confMesh.xyz, conf.ut, confIdx, rA, H, { ruler: 'radial', meta: { config: 'conf, crest-aware ON (radial)' } });
    // eslint-disable-next-line no-console
    console.log(`conf nonMan=${auditNonManByIndex(confMesh.xyz, confIdx)} crestOverlay=${conf.crestOverlayCount} crestHMin=${conf.crestHMinMm?.toFixed(4)}`);
    report('CONF (crest-aware ON)', conf.ut, confIdx, rA, H);

    // (smooth control) HarmonicRipple with crest-aware ON must stay ~unaffected.
    const rAh = buildRadiusFn('HarmonicRipple' as StyleId, {}, DIMS);
    const truthH = buildFeatureTruth('HarmonicRipple' as StyleId, {}, DIMS, TRUTH_RES);
    const baseH0 = buildInhouseMetricMesh(rAh, H, { ...OPTS, guardManifoldAlways: true });
    const baseHM = buildMeshUt(baseH0.ut, baseH0.indices, rAh, H);
    const gateH = computeMeasuredGate(truthH, buildLocator(baseHM, 256), baseHM, rAh, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    // eslint-disable-next-line no-console
    console.log(`HarmonicRipple gate: kept=${gateH.kept} of ${gateH.total} loci`);
    const commonH = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth: truthH, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gateH.keep[i], planarizeConstraints: true as const, chordTolMm: 0.03, chordSteiner: true as const, curvatureFineStep: 1 / 2048, curvatureSubsamples: 2 };
    const hOff = buildFeatureConformingMeshB('HarmonicRipple' as StyleId, {}, DIMS, { ...commonH });
    const hOn = buildFeatureConformingMeshB('HarmonicRipple' as StyleId, {}, DIMS, { ...commonH, crestAwareSizing: true, crestBandCells: 1 });
    const hOffIdx = Uint32Array.from(hOff.indices), hOnIdx = Uint32Array.from(hOn.indices);
    report('HarmonicRipple OFF', hOff.ut, hOffIdx, rAh, H);
    report('HarmonicRipple ON ', hOn.ut, hOnIdx, rAh, H);
    // eslint-disable-next-line no-console
    console.log(`HarmonicRipple overlay=${hOn.crestOverlayCount ?? 0} (0 or tiny ⇒ smooth style untouched by the opt-in)`);
    expect(auditNonManByIndex(confMesh.xyz, confIdx)).toBe(0);
  }, 90 * 60 * 1000);
});
