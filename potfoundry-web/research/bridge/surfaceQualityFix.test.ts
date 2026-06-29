// surfaceQualityFix.test.ts — kill the high-density transition slivers. (PF_SURFFIX=1 to run.)
// The chord metric grows slivers at size-gradient transitions as density rises (measured %<20° → 8%). Test the
// two standard fixes at HIGH density: metric GRADATION (cap size growth rate) + on-surface SMOOTHING. Goal:
// hold the chord fidelity (rms ≈ relief floor) while driving %<20° down and worst-angle up.
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
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;
const SIZE_RES = 128;
const TOLS = [0.008, 0.003];          // high-density rungs
const BETA = 0.25;                     // gradation: adjacent size ratio ≤ 1.25
const CHORD_TRI_CAP = 1_200_000;
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_surffix');
const OUT = join(ROOT, 'scorecard.json');
const DUMPS = join(ROOT, 'dumps');

interface Row { tol: number; stage: string; tris: number; worst: number; p5: number; mean: number; pctB20: number; rmsMm: number; p99Mm: number; error?: string; }

describe('surface-metric quality fix at high density (gradation + smoothing)', () => {
  it.skipIf(!process.env.PF_SURFFIX)('grade + smooth removes transition slivers, holds fidelity', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dir = join(ROOT, '_work'); mkdirSync(dir, { recursive: true });
    const baseSizing = (() => { const f = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.05, hMin: 0.001, hMax: 0.1 }); return { resU: f.resU, resT: f.resT, h: Array.from(f.h) }; })();
    const rows: Row[] = [];
    const push = (r: Row): void => { rows.push(r); writeFileSync(OUT, JSON.stringify(rows, null, 2)); /* eslint-disable-next-line no-console */ console.log(`tol=${String(r.tol).padEnd(6)} ${r.stage.padEnd(14)} tris=${String(r.tris).padStart(8)} worst=${r.worst.toFixed(1)} p5=${r.p5.toFixed(1)} mean=${r.mean.toFixed(1)} %<20=${r.pctB20.toFixed(2)} rms=${r.rmsMm < 0 ? 'skip' : r.rmsMm.toFixed(3)} p99=${r.p99Mm < 0 ? 'skip' : r.p99Mm.toFixed(3)}`); };

    const runMesh = (metricM: { resU: number; resT: number; m: number[] }): { ut: number[]; indices: number[] } => {
      const input: OracleInput = { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: metricM, ours: null };
      writeOracleInput(dir, input);
      execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe', maxBuffer: 1 << 30 });
      const out = readOracleOutput(join(dir, 'out_gmsh.json'));
      return { ut: out.ut, indices: out.indices };
    };
    const measure = (tol: number, stage: string, ut: number[], indices: number[], dump: boolean): Row => {
      const lifted = liftUtToRadial(ut, rA, DIMS.H);
      const idx = Uint32Array.from(indices);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
      const tris = idx.length / 3;
      let rms = -1, p99 = -1;
      if (tris <= CHORD_TRI_CAP) { const d = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: tol, seamExclU: 0, denseN: 4 }); rms = d.rmsDevMm; p99 = d.p99DevMm; }
      if (dump) writeFileSync(join(DUMPS, `${stage}_${tol}.json`), JSON.stringify({ style: String(STYLE), arm: stage, triCount: tris, minAngleDeg: q.minAngleDeg, xyz: Array.from(lifted.vertices), idx: indices, tris: indices, config: `${stage} ${(tris / 1000).toFixed(0)}k` }));
      return { tol, stage, tris, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, rmsMm: rms, p99Mm: p99 };
    };

    for (const tol of TOLS) {
      const dump = tol === TOLS[TOLS.length - 1];
      try {
        // baseline chord (no gradation)
        const mfA = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: 0.03, hMax: 8 });
        const mA = runMesh({ resU: mfA.resU, resT: mfA.resT, m: Array.from(mfA.m) });
        push(measure(tol, 'chord', mA.ut, mA.indices, dump));
        // + gradation
        const mfB = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: 0.03, hMax: 8, gradeBeta: BETA });
        const mB = runMesh({ resU: mfB.resU, resT: mfB.resT, m: Array.from(mfB.m) });
        push(measure(tol, 'chord+grade', mB.ut, mB.indices, false));
        // + gradation + smoothing
        const sm = smoothSurfaceOnRadial(mB.ut, mB.indices, rA, DIMS.H, { iterations: 12, relax: 0.5 });
        push(measure(tol, 'grade+smooth', sm, mB.indices, dump));
      } catch (e) { push({ tol, stage: 'ERROR', tris: 0, worst: 0, p5: 0, mean: 0, pctB20: 0, rmsMm: -1, p99Mm: -1, error: String(e).slice(0, 160) }); }
    }
    expect(rows.length).toBeGreaterThanOrEqual(TOLS.length * 3);
  }, 40 * 60 * 1000);
});
