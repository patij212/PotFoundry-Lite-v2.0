// surfaceQualityMax.test.ts — drive 3D triangle quality as high as possible IN UV. (PF_SURFQUAL=1 to run.)
// Progression per style: euclid baseline → surface-metric (uniform) → surface-metric (CHORD: even shape +
// crease-tight sizing) → + on-surface smoothing polish. Full angle distribution (worst/p5/mean, %<20/<30) AND
// chord (rms/p99). Dumps each stage for a 3D quality-heatmap render.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildIsotropicSizingField } from './sizingField';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { smoothSurfaceOnRadial } from './surfaceSmoothing';
import { liftUtToRadial } from './measure';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['GyroidManifold', 'BasketWeave'] as StyleId[];
const SIZE_RES = 64;
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_surfqual');
const OUT = join(ROOT, 'scorecard.json');
const DUMPS = join(ROOT, 'dumps');

interface Row {
  style: string; stage: string; tris: number;
  worst: number; p5: number; mean: number; pctB20: number; pctB30: number;
  rmsMm: number; p99Mm: number; error?: string;
}

function runMesh(dir: string, input: OracleInput): { ut: number[]; indices: number[] } {
  writeOracleInput(dir, input);
  execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe' });
  const out = readOracleOutput(join(dir, 'out_gmsh.json'));
  return { ut: out.ut, indices: out.indices };
}

function score(style: string, stage: string, ut: number[], indices: number[], rA: AnalyticRadiusFn): Row {
  const lifted = liftUtToRadial(ut, rA, DIMS.H);
  const idx = Uint32Array.from(indices);
  const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
  const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.05, seamExclU: 0, denseN: 8 });
  return {
    style, stage, tris: idx.length / 3,
    worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, pctB30: q.pctBelow30,
    rmsMm: dev.rmsDevMm, p99Mm: dev.p99DevMm,
  };
}

function dump(style: string, stage: string, ut: number[], indices: number[], rA: AnalyticRadiusFn, row: Row): void {
  const lifted = liftUtToRadial(ut, rA, DIMS.H);
  writeFileSync(join(DUMPS, `${style}_${stage}.json`), JSON.stringify({ style, arm: stage, triCount: row.tris, minAngleDeg: row.worst, xyz: Array.from(lifted.vertices), idx: indices }));
}

describe('surface-metric quality maximization (drive 3D quality higher in UV)', () => {
  it.skipIf(!process.env.PF_SURFQUAL)('euclid → surfmetric → +chord → +smoothing', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rows: Row[] = [];
    const push = (r: Row): void => { rows.push(r); writeFileSync(OUT, JSON.stringify(rows, null, 2)); /* eslint-disable-next-line no-console */ console.log(`${r.style} ${r.stage.padEnd(16)} tris=${String(r.tris).padStart(7)} worst=${r.worst.toFixed(1)} p5=${r.p5.toFixed(1)} mean=${r.mean.toFixed(1)} %<20=${r.pctB20.toFixed(1)} rms=${r.rmsMm.toFixed(3)} p99=${r.p99Mm.toFixed(3)}`); };

    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const dir = join(ROOT, `_${String(style)}`);
      mkdirSync(dir, { recursive: true });

      // Stage 1 — Euclidean baseline (scalar curvature sizing, Frontal-Delaunay).
      const fEuclid = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.05, hMin: 0.001, hMax: 0.1 });
      const mEuclid = runMesh(dir, { style: String(style), H: DIMS.H, domain: { uPeriodic: true }, sizing: { resU: fEuclid.resU, resT: fEuclid.resT, h: Array.from(fEuclid.h) }, ours: null });
      const rEuclid = score(String(style), 'euclid', mEuclid.ut, mEuclid.indices, rA); push(rEuclid); dump(String(style), 'euclid', mEuclid.ut, mEuclid.indices, rA, rEuclid);

      const baseSizing = { resU: fEuclid.resU, resT: fEuclid.resT, h: Array.from(fEuclid.h) };

      // Stage 2 — surface metric, UNIFORM 3D size (even shape, one size).
      const mfU = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, h3DMm: 2.2 });
      const mUni = runMesh(dir, { style: String(style), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: { resU: mfU.resU, resT: mfU.resT, m: Array.from(mfU.m) }, ours: null });
      const rUni = score(String(style), 'surfmetric-uni', mUni.ut, mUni.indices, rA); push(rUni); dump(String(style), 'surfmetric-uni', mUni.ut, mUni.indices, rA, rUni);

      // Stage 3 — surface metric, CHORD sizing (even shape + crease-tight density in one field).
      const mfC = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.1, hMin: 0.6, hMax: 8 });
      const mChord = runMesh(dir, { style: String(style), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: { resU: mfC.resU, resT: mfC.resT, m: Array.from(mfC.m) }, ours: null });
      const rChord = score(String(style), 'surfmetric-chord', mChord.ut, mChord.indices, rA); push(rChord); dump(String(style), 'surfmetric-chord', mChord.ut, mChord.indices, rA, rChord);

      // Stage 4 — + on-surface smoothing polish (same connectivity, relocate interior vertices on the surface).
      const smoothed = smoothSurfaceOnRadial(mChord.ut, mChord.indices, rA, DIMS.H, { iterations: 10, relax: 0.5 });
      const rSmooth = score(String(style), 'chord+smooth', smoothed, mChord.indices, rA); push(rSmooth); dump(String(style), 'chord+smooth', smoothed, mChord.indices, rA, rSmooth);
    }
    expect(rows.length).toBe(STYLES.length * 4);
  }, 40 * 60 * 1000);
});
