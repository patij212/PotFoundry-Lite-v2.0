// chordConvergence.test.ts — does gmsh-aniso's chord on a CLEAN-CHORD tangled lattice converge toward
// CAD (≤0.1mm) as density rises? Settles the H1 chord leg that the all-20 run left hMin-floor-confounded.
// Gated: PF_CHORDCONV=1 npx vitest run research/bridge/chordConvergence.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { runStyle, type StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId; // smooth-relief tangled lattice (chord is honest, no exclusion)
const HMINS = [0.005, 0.0025, 0.00125]; // progressively denser floor

describe('chord convergence (gmsh-aniso, GyroidManifold)', () => {
  it.skipIf(!process.env.PF_CHORDCONV)('chord p99 vs density (hMin) — the H1 chord leg', () => {
    const out: Array<Record<string, unknown>> = [];
    for (const hMin of HMINS) {
      let row: Record<string, unknown>;
      try {
        const [r] = runStyle(STYLE, DIMS, ['gmsh'], { tolMm: 0.05, sizeRes: 48, hMin, hMax: 0.1, aniso: true });
        row = { hMin, tris: r.tris, chordP99Mm: r.chordP99Mm, chordMaxMm: r.chordMaxMm, pctUnder20deg: r.pctUnder20deg, minAngleDeg: r.minAngleDeg, engineMs: r.engineMs };
      } catch (e) { row = { hMin, error: String(e).slice(0, 200) }; }
      out.push(row);
      mkdirSync(join('research', 'exchange'), { recursive: true });
      writeFileSync(join('research', 'exchange', '_chordconv.json'), JSON.stringify(out, null, 2));
      // eslint-disable-next-line no-console
      console.log(`hMin=${hMin}: ${row.error ?? `tris=${row.tris} chordP99=${(row.chordP99Mm as number)?.toFixed(3)} chordMax=${(row.chordMaxMm as number)?.toFixed(3)} %<20=${(row.pctUnder20deg as number)?.toFixed(1)}`}`);
    }
    expect(out.length).toBe(HMINS.length);
  }, 20 * 60 * 1000);
});
