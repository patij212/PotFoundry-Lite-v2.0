// surfaceMetricIsolation.test.ts — does meshing under the FIRST fundamental form (M=g/h²) beat plain
// Euclidean (u,t) Delaunay on 3D triangle QUALITY at matched budget? (PF_SURFMETRIC=1 to run.)
// Pre-reg: docs/superpowers/specs/2026-06-29-surface-metric-isolation-prereg.md
//   Arm A (euclid):     gmsh Frontal-Delaunay under the scalar curvature sizing field, swept over tol.
//   Arm B (surfmetric): gmsh BAMG under M=g/h² (surface-intrinsic), swept over uniform 3D target h3DMm.
// Both lifted to 3D and scored by honestGate → minAngleDeg (3D quality) + rmsFidelityMm (chord). Per-run dumps
// (xyz+idx) saved for a flat-shaded 3D render of the matched-budget pair.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildIsotropicSizingField } from './sizingField';
import { buildSurfaceMetricField } from './surfaceMetricField';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import { honestGate } from './honestMetrics';
import { liftUtToRadial } from './measure';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['GyroidManifold', 'BasketWeave'] as StyleId[];
const SIZE_RES = 64;
const TOLS_A = [0.1, 0.05, 0.025, 0.0125];       // Arm A budget knob (Euclidean iso)
const H3D_B = [6, 4, 3, 2.2, 1.6];               // Arm B budget knob (uniform 3D edge length, mm)
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';
const ROOT = join('research', 'exchange', '_surfmetric');
const OUT = join(ROOT, 'scorecard.json');
const DUMPS = join(ROOT, 'dumps');

interface Row {
  style: string; arm: 'euclid' | 'surfmetric'; knob: number;
  tris?: number; minAngleDeg?: number; rmsMm?: number; p99Mm?: number; pctBelow20?: number; error?: string;
}

function runOne(dir: string, engine: string): { ut: number[]; indices: number[] } {
  execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', engine], { stdio: 'pipe' });
  const out = readOracleOutput(join(dir, `out_${engine}.json`));
  return { ut: out.ut, indices: out.indices };
}

describe('surface-metric isolation (first fundamental form vs Euclidean)', () => {
  it.skipIf(!process.env.PF_SURFMETRIC)('3D minAngle-vs-tris: does M=g/h² beat Euclidean (u,t) Delaunay?', () => {
    mkdirSync(DUMPS, { recursive: true });
    const rows: Row[] = [];
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const dir = join(ROOT, `_${String(style)}`);
      mkdirSync(dir, { recursive: true });
      const sizing = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: 0.05, hMin: 0.001, hMax: 0.1 });
      const baseSizing = { resU: sizing.resU, resT: sizing.resT, h: Array.from(sizing.h) };

      // Arm A — Euclidean Frontal-Delaunay under the scalar curvature sizing field.
      for (const tol of TOLS_A) {
        let row: Row;
        try {
          const f = buildIsotropicSizingField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, tolMm: tol, hMin: 0.001, hMax: 0.1 });
          const input: OracleInput = { style: String(style), H: DIMS.H, domain: { uPeriodic: true }, sizing: { resU: f.resU, resT: f.resT, h: Array.from(f.h) }, ours: null };
          writeOracleInput(dir, input);
          const mesh = runOne(dir, 'gmsh');
          const g = honestGate(mesh.ut, mesh.indices, rA, DIMS.H, { tolMm: tol, seamExclU: 0, denseN: 8 });
          row = { style: String(style), arm: 'euclid', knob: tol, tris: g.triCount, minAngleDeg: g.minAngleDeg, rmsMm: g.rmsFidelityMm, p99Mm: g.p99Mm, pctBelow20: g.pctBelow20 };
          const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
          writeFileSync(join(DUMPS, `${String(style)}_euclid_${tol}.json`), JSON.stringify({ style: String(style), arm: 'euclid', knob: tol, triCount: g.triCount, minAngleDeg: g.minAngleDeg, xyz: Array.from(lifted.vertices), idx: mesh.indices }));
        } catch (e) {
          row = { style: String(style), arm: 'euclid', knob: tol, error: String(e).slice(0, 200) };
        }
        rows.push(row);
        writeFileSync(OUT, JSON.stringify(rows, null, 2));
        // eslint-disable-next-line no-console
        console.log(`${row.style} euclid tol=${row.knob}: ${row.error ?? `tris=${row.tris} minAng=${(row.minAngleDeg as number)?.toFixed(1)} rms=${(row.rmsMm as number)?.toFixed(3)}`}`);
      }

      // Arm B — BAMG under the surface-intrinsic metric M = g/h3D².
      for (const h3DMm of H3D_B) {
        let row: Row;
        try {
          const mf = buildSurfaceMetricField(rA, DIMS.H, { resU: SIZE_RES, resT: SIZE_RES, h3DMm });
          const input: OracleInput = { style: String(style), H: DIMS.H, domain: { uPeriodic: true }, sizing: baseSizing, metric: { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) }, ours: null };
          writeOracleInput(dir, input);
          const mesh = runOne(dir, 'gmsh');
          const g = honestGate(mesh.ut, mesh.indices, rA, DIMS.H, { tolMm: 0.05, seamExclU: 0, denseN: 8 });
          row = { style: String(style), arm: 'surfmetric', knob: h3DMm, tris: g.triCount, minAngleDeg: g.minAngleDeg, rmsMm: g.rmsFidelityMm, p99Mm: g.p99Mm, pctBelow20: g.pctBelow20 };
          const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
          writeFileSync(join(DUMPS, `${String(style)}_surfmetric_${h3DMm}.json`), JSON.stringify({ style: String(style), arm: 'surfmetric', knob: h3DMm, triCount: g.triCount, minAngleDeg: g.minAngleDeg, xyz: Array.from(lifted.vertices), idx: mesh.indices }));
        } catch (e) {
          row = { style: String(style), arm: 'surfmetric', knob: h3DMm, error: String(e).slice(0, 200) };
        }
        rows.push(row);
        writeFileSync(OUT, JSON.stringify(rows, null, 2));
        // eslint-disable-next-line no-console
        console.log(`${row.style} surfmetric h3D=${row.knob}: ${row.error ?? `tris=${row.tris} minAng=${(row.minAngleDeg as number)?.toFixed(1)} rms=${(row.rmsMm as number)?.toFixed(3)}`}`);
      }
    }
    expect(rows.length).toBe(STYLES.length * (TOLS_A.length + H3D_B.length));
  }, 40 * 60 * 1000);
});
