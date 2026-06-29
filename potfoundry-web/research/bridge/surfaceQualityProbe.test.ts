// surfaceQualityProbe.test.ts — pin the root cause of the residual ~4% interior slivers at high density.
// (PF_SURFPROBE=1.) Two discriminators vs the sizeRes-128 chord baseline (%<20≈4.1 at ~885k):
//   A) UNIFORM metric at matched density — no size gradient/anisotropy-from-chord. If %<20≈0 ⇒ chord sizing is
//      the sliver source; if it ALSO slivers ⇒ band-limited grid or fundamental.
//   B) CHORD metric at sizeRes 256 (finer curvature) — if %<20 drops ⇒ band-limited metric is the source.
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
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_surfprobe');
const OUT = join(ROOT, 'scorecard.json');
const DUMPS = join(ROOT, 'dumps');

interface Row { probe: string; tris: number; worst: number; p5: number; mean: number; pctB20: number; rmsMm: number; error?: string; }

describe('surface-metric sliver root-cause probe', () => {
  it.skipIf(!process.env.PF_SURFPROBE)('uniform-at-density vs sizeRes256-chord', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dir = join(ROOT, '_work'); mkdirSync(dir, { recursive: true });
    const sizing = (r: number): { resU: number; resT: number; h: number[] } => { const f = buildIsotropicSizingField(rA, DIMS.H, { resU: r, resT: r, tolMm: 0.05, hMin: 0.001, hMax: 0.1 }); return { resU: f.resU, resT: f.resT, h: Array.from(f.h) }; };
    const rows: Row[] = [];
    const push = (r: Row): void => { rows.push(r); writeFileSync(OUT, JSON.stringify(rows, null, 2)); /* eslint-disable-next-line no-console */ console.log(`${r.probe.padEnd(22)} tris=${String(r.tris).padStart(8)} worst=${r.worst.toFixed(1)} p5=${r.p5.toFixed(1)} mean=${r.mean.toFixed(1)} %<20=${r.pctB20.toFixed(2)} rms=${r.rmsMm < 0 ? 'skip' : r.rmsMm.toFixed(3)}`); };

    const run = (probe: string, metric: { resU: number; resT: number; m: number[] }, sizeRes: number, dumpIt: boolean): void => {
      try {
        const input: OracleInput = { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: true }, sizing: sizing(sizeRes), metric, ours: null };
        writeOracleInput(dir, input);
        execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe', maxBuffer: 1 << 30 });
        const out = readOracleOutput(join(dir, 'out_gmsh.json'));
        const lifted = liftUtToRadial(out.ut, rA, DIMS.H);
        const idx = Uint32Array.from(out.indices);
        const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
        const tris = idx.length / 3;
        let rms = -1;
        if (tris <= 1_200_000) rms = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.01, seamExclU: 0, denseN: 4 }).rmsDevMm;
        if (dumpIt) writeFileSync(join(DUMPS, `${probe}.json`), JSON.stringify({ style: String(STYLE), arm: probe, triCount: tris, minAngleDeg: q.minAngleDeg, xyz: Array.from(lifted.vertices), idx: out.indices, tris: out.indices, config: `${probe} ${(tris / 1000).toFixed(0)}k` }));
        push({ probe, tris, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, rmsMm: rms });
      } catch (e) { push({ probe, tris: 0, worst: 0, p5: 0, mean: 0, pctB20: 0, rmsMm: -1, error: String(e).slice(0, 160) }); }
    };

    // A) uniform metric at matched ~885k density (h3D≈0.30 ⇒ ~885k tris)
    const mfUni = buildSurfaceMetricField(rA, DIMS.H, { resU: 128, resT: 128, h3DMm: 0.30 });
    run('uniform-885k', { resU: mfUni.resU, resT: mfUni.resT, m: Array.from(mfUni.m) }, 128, true);

    // B) chord metric at sizeRes 256 (finer curvature), gradation on
    const mf256 = buildSurfaceMetricField(rA, DIMS.H, { resU: 256, resT: 256, tolMm: 0.003, hMin: 0.03, hMax: 8, gradeBeta: 0.25 });
    run('chord256-grade', { resU: mf256.resU, resT: mf256.resT, m: Array.from(mf256.m) }, 256, true);

    expect(rows.length).toBe(2);
  }, 40 * 60 * 1000);
});
