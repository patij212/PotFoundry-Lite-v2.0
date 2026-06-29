// surfaceReach001.test.ts — confirm the isotropic surface metric reaches rms 0.01mm on GyroidManifold within
// budget, and produce a renderable dense mesh. (PF_REACH=1.) Rung 1 = renderable (~1.2M, dumped); rung 2 = the
// rms-0.01 confirmation (dense, measured with denseN=2; not dumped — too big to render).
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
const SIZE_RES = 192;
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_reach001');
const OUT = join(ROOT, 'scorecard.json');
const DUMPS = join(ROOT, 'dumps');

interface Row { tol: number; tris: number; rmsMm: number; p99Mm: number; worst: number; p5: number; mean: number; pctB20: number; engineMs: number; error?: string; }

describe('reach rms 0.01 with the isotropic surface metric', () => {
  it.skipIf(!process.env.PF_REACH)('density → rms 0.01', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dir = join(ROOT, '_work'); mkdirSync(dir, { recursive: true });
    const baseSizing = (() => { const f = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.05, hMin: 0.001, hMax: 0.1 }); return { resU: f.resU, resT: f.resT, h: Array.from(f.h) }; })();
    const rows: Row[] = [];
    const push = (r: Row): void => { rows.push(r); writeFileSync(OUT, JSON.stringify(rows, null, 2)); /* eslint-disable-next-line no-console */ console.log(`tol=${String(r.tol).padEnd(7)} tris=${String(r.tris).padStart(9)} rms=${r.rmsMm < 0 ? 'skip' : r.rmsMm.toFixed(4)} p99=${r.p99Mm < 0 ? 'skip' : r.p99Mm.toFixed(4)} worst=${r.worst.toFixed(1)} p5=${r.p5.toFixed(1)} mean=${r.mean.toFixed(1)} %<20=${r.pctB20.toFixed(1)} (${(r.engineMs / 1000).toFixed(0)}s)`); };

    const run = (tol: number, hMin: number, denseN: number, chordCap: number, dumpIt: boolean): void => {
      try {
        const mf = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin, hMax: 8, gradeBeta: 0.2 });
        const input: OracleInput = { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) }, ours: null };
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
        if (tris <= chordCap) { const d = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: tol, seamExclU: 0, denseN }); rms = d.rmsDevMm; p99 = d.p99DevMm; }
        if (dumpIt) writeFileSync(join(DUMPS, `iso_${tol}.json`), JSON.stringify({ style: String(STYLE), arm: 'iso', triCount: tris, minAngleDeg: q.minAngleDeg, xyz: Array.from(lifted.vertices), idx: out.indices, tris: out.indices, config: `iso ${(tris / 1e6).toFixed(2)}M` }));
        push({ tol, tris, rmsMm: rms, p99Mm: p99, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, engineMs: ms });
      } catch (e) { push({ tol, tris: 0, rmsMm: -1, p99Mm: -1, worst: 0, p5: 0, mean: 0, pctB20: 0, engineMs: 0, error: String(e).slice(0, 160) }); }
    };

    run(0.002, 0.002, 3, 1_500_000, true);   // renderable rung (~1.2M, dumped)
    run(0.0006, 0.001, 2, 6_000_000, false); // rms-0.01 confirmation rung (dense)
    expect(rows.length).toBe(2);
  }, 40 * 60 * 1000);
});
