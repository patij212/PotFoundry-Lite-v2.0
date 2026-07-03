// _all20StlFresh.test.ts — DEV-ONLY (env PF_ALL20STL=1). Fresh, CURRENT, consistent all-20 STL set for inspection.
// Uses the current best GENERAL recipe (metric-Delaunay under M + deep-sag chordSteiner + guardManifoldAlways) at a
// moderate, inspection-sized density. NOT the per-axis primitives (ridge-graph / doubled-grid / doubled-rings — those
// are the best but per-style; this is one uniform recipe for a coherent set). Checkpointed: skips a style whose STL
// already exists, so a killed run resumes. Isolated: CALLS the kernel; edits nothing. Outputs research/exchange/_all20fresh/stl/<Style>.stl
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, buildInhouseMetricMesh, liftUtToRadial, auditNonManByIndex, buildMeshUt, writeBinarySTL, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_all20fresh', 'stl');
const CK = join('research', 'exchange', '_all20fresh', 'ckpt.txt');
const MAXP = Number(process.env.PF_ALL20STL_MAXP ?? 800_000);
const STYLES = [
  'ArtDeco', 'BambooSegments', 'BasketWeave', 'CelticKnot', 'CelticTriquetra', 'Crystalline', 'DragonScales',
  'FourierBloom', 'GeometricStar', 'GothicArches', 'GyroidManifold', 'HarmonicRipple', 'HexagonalHive',
  'LowPolyFacet', 'RippleInterference', 'SpiralRidges', 'SuperellipseMorph', 'SuperformulaBlossom', 'Voronoi', 'WaveInterference',
] as const;

describe('fresh all-20 STL set (current recipe)', () => {
  it.skipIf(process.env.PF_ALL20STL !== '1')('mesh + STL each style', () => {
    mkdirSync(DIR, { recursive: true });
    for (const style of STYLES) {
      const out = join(DIR, `${style}.stl`);
      if (existsSync(out)) { appendFileSync(CK, `${style}: SKIP (exists)\n`); continue; } // resume
      const rA = buildRadiusFn(style as StyleId, {}, DIMS);
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
        tolMm: 0.004, hMin: 0.006, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
        maxPoints: MAXP, splitThresh: 1.5, optimizeSweeps: 2,
        guardManifoldAlways: true, chordTolMm: 0.04, chordSteiner: true,
      });
      const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
      const xyz = liftUtToRadial(ut, rA, DIMS.H).vertices;
      const nonMan = auditNonManByIndex(buildMeshUt(ut, idx, rA, DIMS.H).xyz, idx);
      writeBinarySTL(out, xyz, idx);
      const line = `${style}: tris=${idx.length / 3} nonMan=${nonMan} -> ${out}`;
      appendFileSync(CK, line + '\n'); // eslint-disable-next-line no-console
      console.log(line);
    }
    expect(STYLES.length).toBe(20);
  }, 120 * 60 * 1000);
});
