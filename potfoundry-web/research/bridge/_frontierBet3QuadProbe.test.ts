// _frontierBet3QuadProbe.test.ts — DEV-ONLY (env PF_BET3=1). FRONTIER Bet 3 discriminator: does a FIELD-ALIGNED
// mesher (gmsh Algorithm 11 quasi-structured/cross-field quads) beat the 2:1 transition-fan sliver floor (~2° worst
// angle, density-invariant) on the tangled lattices? Isolated: new oracle quad mode + this new probe; NO kernel edit.
//
// Compares depth-invariant min interior angle (lifted 3D) across three meshers at comparable budget on Gyroid +
// BasketWeave: (A) gmsh field-aligned QUAD (Algo 11, triangulated), (B) the in-house surface-metric kernel
// (buildInhouseMetricMesh — already ~sliver-free per registry), (C) gmsh BAMG tri (Algo 7). Production 2:1-quadtree
// floor ≈ 2° is the wall. Pre-registered CONFIRM (Bet 3): quad minAngle >= 12° on BOTH styles.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildRadiusFn, buildInhouseMetricMesh, liftUtToRadial, triangleQualityDistribution, type StyleDims } from './labkit';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_bet3quad');
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const RES = 160, TOL = 0.02, HMIN = 0.02, HMAX = 8;

function minAngleOf(ut: number[], indices: number[], rA: (th: number, z: number) => number): { minA: number; p5: number; pct20: number; tris: number } {
  const lifted = liftUtToRadial(ut, rA, DIMS.H);
  const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: Uint32Array.from(indices) });
  return { minA: q.minAngleDeg, p5: q.p5MinAngleDeg, pct20: q.pctBelow20, tris: indices.length / 3 };
}

describe('FRONTIER Bet 3 — field-aligned quad vs the 2:1 transition-fan floor', () => {
  it.skipIf(process.env.PF_BET3 !== '1')('Gyroid + BasketWeave: gmsh Algo-11 quad minAngle vs in-house kernel vs BAMG', () => {
    mkdirSync(DIR, { recursive: true });
    for (const style of ['GyroidManifold', 'BasketWeave'] as StyleId[]) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const mf = buildSurfaceMetricField(rA, DIMS.H, { resU: RES, resT: RES, tolMm: TOL, hMin: HMIN, hMax: HMAX, gradeBeta: 0.2 });
      const metric = { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) };
      const base: OracleInput = { style: String(style), H: DIMS.H, domain: { uPeriodic: false }, sizing: { resU: 2, resT: 2, h: [0.03, 0.03, 0.03, 0.03] }, metric, ours: null };

      // (A) field-aligned quad (Algo 11)
      writeOracleInput(DIR, { ...base, quad: true, quadAlgo: 11 });
      execFileSync(PY, [ORACLE, 'mesh', '--in', DIR, '--engine', 'gmsh'], { stdio: 'pipe' });
      const qOut = readOracleOutput(join(DIR, 'out_gmsh.json'));
      const A = minAngleOf(qOut.ut, qOut.indices, rA);

      // (C) gmsh BAMG tri (Algo 7) — same metric
      writeOracleInput(DIR, { ...base });
      execFileSync(PY, [ORACLE, 'mesh', '--in', DIR, '--engine', 'gmsh'], { stdio: 'pipe' });
      const tOut = readOracleOutput(join(DIR, 'out_gmsh.json'));
      const C = minAngleOf(tOut.ut, tOut.indices, rA);

      // (B) in-house surface-metric kernel
      const ih = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: TOL, hMin: HMIN, hMax: HMAX, sizeRes: RES, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2 });
      const B = minAngleOf(Array.from(ih.ut), Array.from(ih.indices), rA);

      // eslint-disable-next-line no-console
      console.log(
        `${String(style).padEnd(15)} | QUAD(algo11) minA=${A.minA.toFixed(1)} p5=${A.p5.toFixed(1)} %<20=${A.pct20.toFixed(1)} tris=${A.tris} ` +
        `| in-house minA=${B.minA.toFixed(1)} p5=${B.p5.toFixed(1)} %<20=${B.pct20.toFixed(1)} tris=${B.tris} ` +
        `| BAMG-tri minA=${C.minA.toFixed(1)} p5=${C.p5.toFixed(1)} %<20=${C.pct20.toFixed(1)} tris=${C.tris} ` +
        `| vs production 2:1-quadtree floor ~2° | quad CONFIRM(>=12°): ${A.minA >= 12 ? 'YES' : 'no'}`,
      );
    }
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});
