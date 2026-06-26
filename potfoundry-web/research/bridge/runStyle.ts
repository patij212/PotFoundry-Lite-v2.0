// potfoundry-web/research/bridge/runStyle.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_FUNCTIONS } from '../../src/geometry/styles';
import { baseRadius } from '../../src/geometry/profile';
import { DEFAULT_STYLE_PARAMS, type StyleId, type StyleOptions } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import { buildIsotropicSizingField } from './sizingField';
import { buildAnisotropicMetricField } from './metricField';
import { writeOracleInput, readOracleOutput, type OracleInput } from './exchange';
import { measureOracleMesh, type ScoreRow } from './measure';

export interface StyleDims { H: number; Rb: number; Rt: number; expn?: number; }

/** Build the continuous analytic radius fn rA(theta,z) exactly as styleSampler/production does. */
export function buildRadiusFn(styleId: StyleId, params: StyleOptions, dims: StyleDims): AnalyticRadiusFn {
  const radiusFn = STYLE_FUNCTIONS[styleId];
  const opts: StyleOptions = { ...DEFAULT_STYLE_PARAMS[styleId], ...params };
  const { H, Rb, Rt } = dims;
  const expn = dims.expn ?? 1;
  return (theta, z) => radiusFn(theta, z, baseRadius(z, H, Rb, Rt, expn, opts), H, opts);
}

// venv interpreter is platform-specific (win: Scripts/python.exe, unix: bin/python) so
// Phase-1B can run cross-platform / in CI. Paths are relative to potfoundry-web/ (the CWD).
const VENV_PY = process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python';
const PY = `research/oracle/.venv/${VENV_PY}`;
const ORACLE = 'research/oracle/oracle.py';

/** Run a style through the given engines; return one ScoreRow per engine. */
export function runStyle(
  styleId: StyleId, dims: StyleDims, engines: string[],
  opts: { tolMm: number; sizeRes: number; hMin: number; hMax: number; aniso?: boolean },
): ScoreRow[] {
  const rA = buildRadiusFn(styleId, {}, dims);
  const field = buildIsotropicSizingField(rA, dims.H, {
    resU: opts.sizeRes, resT: opts.sizeRes, tolMm: opts.tolMm, hMin: opts.hMin, hMax: opts.hMax,
  });
  const dir = join('research', 'exchange', String(styleId));
  mkdirSync(dir, { recursive: true });
  // Build anisotropic metric when requested (gmsh BAMG path).
  const metric = opts.aniso === true
    ? (() => {
        const mf = buildAnisotropicMetricField(rA, dims.H, {
          resU: opts.sizeRes, resT: opts.sizeRes,
          tolMm: opts.tolMm, hMin: opts.hMin, hMax: opts.hMax,
        });
        return { resU: mf.resU, resT: mf.resT, m: Array.from(mf.m) };
      })()
    : undefined;
  const input: OracleInput = {
    style: String(styleId), H: dims.H, domain: { uPeriodic: true },
    sizing: { resU: field.resU, resT: field.resT, h: Array.from(field.h) },
    ...(metric !== undefined && { metric }),
    ours: null,
  };
  writeOracleInput(dir, input);
  const rows: ScoreRow[] = [];
  for (const eng of engines) {
    try {
      execFileSync(PY, [ORACLE, 'mesh', '--in', dir, '--engine', eng], { stdio: 'pipe' });
    } catch (e: unknown) {
      const err = e as { stdout?: Buffer; stderr?: Buffer };
      throw new Error(`oracle ${eng} failed for ${String(styleId)}: ${err.stderr ?? err.stdout ?? e}`);
    }
    const out = readOracleOutput(join(dir, `out_${eng}.json`));
    // seamExclU: 0 — the oracle meshes a smooth periodic patch (no u-seam cliff to exclude).
    rows.push(measureOracleMesh(out, rA, dims.H, { tolMm: opts.tolMm, seamExclU: 0, denseN: 8 }));
  }
  return rows;
}
