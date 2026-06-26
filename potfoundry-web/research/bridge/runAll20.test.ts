// runAll20.test.ts — the all-20 re-baseline RUNNER (not a unit test; a batch driver).
// Runs 20 styles x {triangle, gmsh-iso, gmsh-aniso} through the oracle harness, measures each
// with the project's own instruments, and writes an incremental scorecard. Tangled-lattice
// styles run FIRST so a partial run still answers H1. Resilient: a failing config records an
// error row and the run continues. The controller classifies H1/H2/H3 from the scorecard JSON.
//
// Run (long; background): npx vitest run research/bridge/runAll20.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runStyle, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
// Pre-registered tol=0.05; hMin floors the (u,t) edge length so high-relief meshes stay tractable
// overnight (max ~ (1/hMin)^2*2 ≈ 80k tris). Where the floor bites, chord simply won't reach 0.05 —
// that is honest (it shows where the triangle budget runs out), and the gate check is p99 ≤ 0.1.
const TOL = 0.05, SIZE_RES = 32, HMIN = 0.005, HMAX = 0.1;

const TANGLED: StyleId[] = ['GyroidManifold', 'BasketWeave', 'CelticKnot', 'CelticTriquetra', 'GothicArches'] as StyleId[];
const REST: StyleId[] = [
  'HarmonicRipple', 'FourierBloom', 'SuperformulaBlossom', 'SuperellipseMorph', 'WaveInterference',
  'RippleInterference', 'Crystalline', 'SpiralRidges', 'HexagonalHive', 'LowPolyFacet', 'Voronoi',
  'DragonScales', 'BambooSegments', 'GeometricStar', 'ArtDeco',
] as StyleId[];
const STYLES = [...TANGLED, ...REST];

interface Row {
  style: string; config: string;
  tris?: number; chordP99Mm?: number; chordMaxMm?: number; vertexMaxMm?: number;
  pctUnder20deg?: number; minAngleDeg?: number; engineMs?: number; error?: string;
}

const OUT_DIR = join('research', 'exchange');
const SCORECARD = join(OUT_DIR, '_scorecard.json');

function runConfig(style: StyleId, engine: string, aniso: boolean): Row {
  const config = engine === 'triangle' ? 'triangle' : aniso ? 'gmsh-aniso' : 'gmsh-iso';
  try {
    const [r] = runStyle(style, DIMS, [engine], { tolMm: TOL, sizeRes: SIZE_RES, hMin: HMIN, hMax: HMAX, aniso });
    return {
      style: String(style), config, tris: r.tris, chordP99Mm: r.chordP99Mm, chordMaxMm: r.chordMaxMm,
      vertexMaxMm: r.vertexMaxMm, pctUnder20deg: r.pctUnder20deg, minAngleDeg: r.minAngleDeg, engineMs: r.engineMs,
    };
  } catch (e) {
    return { style: String(style), config, error: String(e).slice(0, 300) };
  }
}

describe('all-20 re-baseline (batch runner)', () => {
  // Gated OFF by default (this is a multi-minute batch, not a unit test). Run explicitly with
  // PF_REBASELINE=1. Mirrors the project's PF_DERISK convention so `npm test` stays fast.
  it.skipIf(!process.env.PF_REBASELINE)('runs the matrix tangled-first, writes incrementally to research/exchange/_scorecard.json', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const rows: Row[] = [];
    const configs: Array<[string, boolean]> = [['triangle', false], ['gmsh', false], ['gmsh', true]];
    for (const s of STYLES) {
      for (const [engine, aniso] of configs) {
        const row = runConfig(s, engine, aniso);
        rows.push(row);
        writeFileSync(SCORECARD, JSON.stringify(rows, null, 2));
        const summary = row.error
          ? `ERR ${row.error}`
          : `tris=${row.tris} chordP99=${row.chordP99Mm?.toFixed(3)} %<20=${row.pctUnder20deg?.toFixed(1)} minAng=${row.minAngleDeg?.toFixed(1)} (${Math.round(row.engineMs ?? 0)}ms)`;
        // eslint-disable-next-line no-console
        console.log(`[${rows.length}/${STYLES.length * 3}] ${row.style}/${row.config}: ${summary}`);
      }
    }
    expect(rows.length).toBe(STYLES.length * 3);
  }, 3 * 60 * 60 * 1000); // 3-hour cap; incremental scorecard survives a partial/timeout run
});
