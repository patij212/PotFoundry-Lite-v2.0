// surfaceReach001b.test.ts — single aggressive rung to confirm rms ≤ 0.01mm. (PF_REACHB=1.)
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildIsotropicSizingField } from './sizingField';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { liftUtToRadial } from './measure';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;
const SIZE_RES = 384; // finer metric grid — sizeRes 192 band-limited density at ~1.8M / rms ~0.014
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_reach001b');

describe('confirm rms ≤ 0.01', () => {
  it.skipIf(!process.env.PF_REACHB)('dense isotropic surface metric', () => {
    mkdirSync(ROOT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dir = join(ROOT, '_work'); mkdirSync(dir, { recursive: true });
    const f = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.05, hMin: 0.001, hMax: 0.1 });
    const baseSizing = { resU: f.resU, resT: f.resT, h: Array.from(f.h) };
    const mf = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.0004, hMin: 0.0003, hMax: 8, gradeBeta: 0.2 });
    const input: OracleInput = { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) }, ours: null };
    writeOracleInput(dir, input);
    const t0 = Date.now();
    execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe', maxBuffer: 1 << 30 });
    const ms = Date.now() - t0;
    const out = readOracleOutput(join(dir, 'out_gmsh.json'));
    const lifted = liftUtToRadial(out.ut, rA, DIMS.H);
    const idx = Uint32Array.from(out.indices);
    const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
    const d = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.0003, seamExclU: 0, denseN: 2 });
    const result = { tris: idx.length / 3, rmsMm: d.rmsDevMm, p99Mm: d.p99DevMm, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, engineSec: ms / 1000 };
    writeFileSync(join(ROOT, 'result.json'), JSON.stringify(result, null, 2));
    // eslint-disable-next-line no-console
    console.log(`tris=${result.tris} rms=${result.rmsMm.toFixed(4)} p99=${result.p99Mm.toFixed(4)} worst=${result.worst} p5=${result.p5} mean=${result.mean} %<20=${result.pctB20.toFixed(1)}`);
    expect(result.tris).toBeGreaterThan(0);
  }, 40 * 60 * 1000);
});
