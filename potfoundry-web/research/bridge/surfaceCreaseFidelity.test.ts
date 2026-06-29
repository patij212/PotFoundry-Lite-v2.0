// surfaceCreaseFidelity.test.ts — reach rms 0.01mm and resolve the steep crease at highest fidelity.
// (PF_CREASE=1.) Isotropic crease cells would need ~40M tris in the crease bands; crease-ALIGNED anisotropy
// (curvature/2nd-fundamental-form metric, long-along-crease / short-across) reaches the same chord with far
// fewer. Ladder both metrics toward rms 0.01 and compare triangle cost + the worst (crease-dominated) p99.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildIsotropicSizingField } from './sizingField';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { buildAnisotropicMetricField } from './metricField';
import { liftUtToRadial } from './measure';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;
const SIZE_RES = 192;
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_crease');
const OUT = join(ROOT, 'scorecard.json');
const DUMPS = join(ROOT, 'dumps');

interface Row { metric: string; tol: number; tris: number; rmsMm: number; p99Mm: number; worst: number; p5: number; mean: number; engineMs: number; error?: string; }

describe('crease fidelity — reach rms 0.01 with crease-aligned anisotropy', () => {
  it.skipIf(!process.env.PF_CREASE)('aniso (2nd-form) vs iso (surface) ladder to rms 0.01', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dir = join(ROOT, '_work'); mkdirSync(dir, { recursive: true });
    const baseSizing = (() => { const f = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.05, hMin: 0.001, hMax: 0.1 }); return { resU: f.resU, resT: f.resT, h: Array.from(f.h) }; })();
    const rows: Row[] = [];
    const push = (r: Row): void => { rows.push(r); writeFileSync(OUT, JSON.stringify(rows, null, 2)); /* eslint-disable-next-line no-console */ console.log(`${r.metric.padEnd(6)} tol=${String(r.tol).padEnd(6)} tris=${String(r.tris).padStart(9)} rms=${r.rmsMm < 0 ? 'skip' : r.rmsMm.toFixed(4)} p99=${r.p99Mm < 0 ? 'skip' : r.p99Mm.toFixed(4)} worst=${r.worst.toFixed(1)} p5=${r.p5.toFixed(1)} mean=${r.mean.toFixed(1)} (${(r.engineMs / 1000).toFixed(0)}s)`); };

    const run = (metric: string, tol: number, mfield: { resU: number; resT: number; m: number[] }, dumpIt: boolean): void => {
      try {
        const input: OracleInput = { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: mfield, ours: null };
        writeOracleInput(dir, input);
        const t0 = Date.now();
        execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe', maxBuffer: 1 << 30 });
        const ms = Date.now() - t0;
        const out = readOracleOutput(join(dir, 'out_gmsh.json'));
        const lifted = liftUtToRadial(out.ut, rA, DIMS.H);
        const idx = Uint32Array.from(out.indices);
        const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
        const tris = idx.length / 3;
        let rms = -1, p99 = -1;
        if (tris <= 2_500_000) { const d = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: tol, seamExclU: 0, denseN: 3 }); rms = d.rmsDevMm; p99 = d.p99DevMm; }
        if (dumpIt && tris <= 1_600_000) writeFileSync(join(DUMPS, `${metric}_${tol}.json`), JSON.stringify({ style: String(STYLE), arm: metric, triCount: tris, minAngleDeg: q.minAngleDeg, xyz: Array.from(lifted.vertices), idx: out.indices, tris: out.indices, config: `${metric} ${(tris / 1000).toFixed(0)}k` }));
        push({ metric, tol, tris, rmsMm: rms, p99Mm: p99, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, engineMs: ms });
      } catch (e) { push({ metric, tol, tris: 0, rmsMm: -1, p99Mm: -1, worst: 0, p5: 0, mean: 0, engineMs: 0, error: String(e).slice(0, 160) }); }
    };

    // ANISO (crease-aligned 2nd-form chord metric): ladder toward rms 0.01
    for (const tol of [0.02, 0.008, 0.003, 0.001]) {
      const mf = buildAnisotropicMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: 0.002, hMax: 6 });
      run('aniso', tol, { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) }, tol === 0.003);
    }
    // ISO (surface metric, graded) for the triangle-cost comparison at matched tol
    for (const tol of [0.008, 0.003, 0.001]) {
      const mf = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: 0.002, hMax: 8, gradeBeta: 0.25 });
      run('iso', tol, { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) }, false);
    }
    expect(rows.length).toBe(7);
  }, 40 * 60 * 1000);
});
