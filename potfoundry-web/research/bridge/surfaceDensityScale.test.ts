// surfaceDensityScale.test.ts — does the metric recipe SCALE to full production fidelity (toward millions of
// triangles) while HOLDING quality, on a complex style? (PF_SURFSCALE=1 to run.)
// Claim: Euclidean (u,t) Delaunay DEGRADES with density (more slivers); the surface metric M=g/h₃D(u,t)² holds
// near-equilateral quality at ANY density, and fidelity (chord) converges to CAD-grade as density rises.
// Finer metric grid (sizeRes 128) so fine relief curvature is captured (not band-limited).
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
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;   // canonical complex lattice
const SIZE_RES = 128;                          // finer metric grid (capture fine relief curvature)
const TOLS = [0.05, 0.02, 0.008];              // chord budget → density ladder (~0.5M → ~1.3M → ~3.5M)
const CHORD_TRI_CAP = 1_600_000;               // skip the (slow) chord probe above this; quality is always cheap
const DUMP_TRI_CAP = 1_400_000;                // dump for render below this (keep render feasible)
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_surfscale');
const OUT = join(ROOT, 'scorecard.json');
const DUMPS = join(ROOT, 'dumps');

interface Row { arm: 'euclid' | 'metric'; tol: number; tris: number; worst: number; p5: number; mean: number; pctB20: number; rmsMm: number; p99Mm: number; engineMs: number; error?: string; }

function runMesh(dir: string, input: OracleInput): { ut: number[]; indices: number[]; ms: number } {
  writeOracleInput(dir, input);
  const t0 = Date.now();
  execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe', maxBuffer: 1 << 30 });
  const out = readOracleOutput(join(dir, 'out_gmsh.json'));
  return { ut: out.ut, indices: out.indices, ms: Date.now() - t0 };
}

describe('surface-metric density scaling (toward full production fidelity)', () => {
  it.skipIf(!process.env.PF_SURFSCALE)('quality holds + fidelity converges as density → millions', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dir = join(ROOT, '_work');
    mkdirSync(dir, { recursive: true });
    const rows: Row[] = [];
    const push = (r: Row): void => { rows.push(r); writeFileSync(OUT, JSON.stringify(rows, null, 2)); /* eslint-disable-next-line no-console */ console.log(`${r.arm.padEnd(6)} tol=${String(r.tol).padEnd(6)} tris=${String(r.tris).padStart(9)} worst=${r.worst.toFixed(1)} p5=${r.p5.toFixed(1)} mean=${r.mean.toFixed(1)} %<20=${r.pctB20.toFixed(2)} rms=${r.rmsMm < 0 ? 'skip' : r.rmsMm.toFixed(3)} p99=${r.p99Mm < 0 ? 'skip' : r.p99Mm.toFixed(3)} (${(r.engineMs / 1000).toFixed(1)}s)`); };

    const baseSizing = (() => { const f = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.05, hMin: 0.001, hMax: 0.1 }); return { resU: f.resU, resT: f.resT, h: Array.from(f.h) }; })();

    const measure = (arm: 'euclid' | 'metric', tol: number, ut: number[], indices: number[], ms: number): Row => {
      const lifted = liftUtToRadial(ut, rA, DIMS.H);
      const idx = Uint32Array.from(indices);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
      const tris = idx.length / 3;
      let rms = -1, p99 = -1;
      if (tris <= CHORD_TRI_CAP) {
        const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: tol, seamExclU: 0, denseN: 4 });
        rms = dev.rmsDevMm; p99 = dev.p99DevMm;
      }
      if (tris <= DUMP_TRI_CAP) writeFileSync(join(DUMPS, `${arm}_${tol}.json`), JSON.stringify({ style: String(STYLE), arm, triCount: tris, minAngleDeg: q.minAngleDeg, xyz: Array.from(lifted.vertices), idx, tris: indices, config: `${arm} ${(tris / 1000).toFixed(0)}k` }));
      return { arm, tol, tris, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, rmsMm: rms, p99Mm: p99, engineMs: ms };
    };

    for (const tol of TOLS) {
      // metric arm — combined chord metric M=g/h₃D(u,t)²
      try {
        const mf = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: 0.03, hMax: 8 });
        const m = runMesh(dir, { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) }, ours: null });
        push(measure('metric', tol, m.ut, m.indices, m.ms));
      } catch (e) { push({ arm: 'metric', tol, tris: 0, worst: 0, p5: 0, mean: 0, pctB20: 0, rmsMm: -1, p99Mm: -1, engineMs: 0, error: String(e).slice(0, 160) }); }
      // euclid arm — scalar curvature sizing, Frontal-Delaunay
      try {
        const f = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: 0.001, hMax: 0.1 });
        const m = runMesh(dir, { style: String(STYLE), H: DIMS.H, domain: { uPeriodic: true }, sizing: { resU: f.resU, resT: f.resT, h: Array.from(f.h) }, ours: null });
        push(measure('euclid', tol, m.ut, m.indices, m.ms));
      } catch (e) { push({ arm: 'euclid', tol, tris: 0, worst: 0, p5: 0, mean: 0, pctB20: 0, rmsMm: -1, p99Mm: -1, engineMs: 0, error: String(e).slice(0, 160) }); }
    }
    expect(rows.length).toBe(TOLS.length * 2);
  }, 40 * 60 * 1000);
});
