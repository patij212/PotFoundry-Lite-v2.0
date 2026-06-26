// sizingIsolation.test.ts — the decisive next experiment (PF_SIZING=1 to run).
// QUESTION: is the relief-fidelity gap (gmsh mushing the tangled lattices) a SIZING-FIELD accuracy problem,
// closable in (u,t)? Sweep metric accuracy (sizeRes 32 = band-limited vs 256 = accurate) × budget (tol) and
// plot RMS-fidelity vs triangle count, vs the dense-truth floor (Gyroid ~0.10mm, BasketWeave ~0.23mm).
// HONEST gates: RMS (perpendicular3DDeviation, via honestGate) + minAngle — NOT p99/%<20°.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildIsotropicSizingField } from './sizingField';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import { honestGate } from './honestMetrics';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['GyroidManifold', 'BasketWeave'] as StyleId[];
const SIZERES = [32, 256]; // 32 = band-limited metric (the all-20 run); 256 = accurate
const TOLS = [0.1, 0.05, 0.025, 0.0125]; // budget knob: smaller tol → more triangles
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const OUT = join('research', 'exchange', '_sizing', 'scorecard.json');

interface Row { style: string; sizeRes: number; tol: number; tris?: number; rmsMm?: number; minAngleDeg?: number; p99Mm?: number; error?: string; }

describe('sizing-field isolation (accurate vs band-limited UV metric)', () => {
  it.skipIf(!process.env.PF_SIZING)('RMS-vs-tris curve: does accurate UV sizing close the relief gap?', () => {
    mkdirSync(join('research', 'exchange', '_sizing'), { recursive: true });
    const rows: Row[] = [];
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      for (const sizeRes of SIZERES) {
        for (const tol of TOLS) {
          let row: Row;
          try {
            const field = buildIsotropicSizingField(rA, DIMS.H, { resU: sizeRes, resT: sizeRes, tolMm: tol, hMin: 0.001, hMax: 0.1 });
            const dir = join('research', 'exchange', `_sizing_${String(style)}`);
            mkdirSync(dir, { recursive: true });
            const input: OracleInput = { style: String(style), H: DIMS.H, domain: { uPeriodic: true }, sizing: { resU: field.resU, resT: field.resT, h: Array.from(field.h) }, ours: null };
            writeOracleInput(dir, input);
            execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', 'gmsh'], { stdio: 'pipe' });
            const out = readOracleOutput(join(dir, 'out_gmsh.json'));
            const g = honestGate(out.ut, out.indices, rA, DIMS.H, { tolMm: tol, seamExclU: 0, denseN: 6 });
            row = { style: String(style), sizeRes, tol, tris: g.triCount, rmsMm: g.rmsFidelityMm, minAngleDeg: g.minAngleDeg, p99Mm: g.p99Mm };
          } catch (e) {
            row = { style: String(style), sizeRes, tol, error: String(e).slice(0, 200) };
          }
          rows.push(row);
          writeFileSync(OUT, JSON.stringify(rows, null, 2));
          // eslint-disable-next-line no-console
          console.log(`${row.style} sizeRes=${row.sizeRes} tol=${row.tol}: ${row.error ?? `tris=${row.tris} rms=${(row.rmsMm as number)?.toFixed(3)} minAng=${(row.minAngleDeg as number)?.toFixed(1)}`}`);
        }
      }
    }
    expect(rows.length).toBe(STYLES.length * SIZERES.length * TOLS.length);
  }, 40 * 60 * 1000);
});
