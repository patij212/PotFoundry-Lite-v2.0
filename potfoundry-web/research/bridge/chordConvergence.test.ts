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
// CHORD STORY (GyroidManifold, gmsh-aniso):
//   hMin sweep (0.005/0.0025/0.00125, sizeRes 48): chord HMIN-INVARIANT (~0.95mm, ~7300 tris flat).
//   sizeRes sweep (48/96/192): chord p99 ~INVARIANT (0.951→0.928 despite 3.6x tris); %<20° got WORSE (2.1→7.0).
//   iso tol sweep (0.1/0.05/0.025, 4x tris): chord p99 ALSO STUCK (0.931/0.935/0.932).
//   ⇒ CONCLUSION: GyroidManifold chord p99 ~0.93mm is DENSITY-IRREDUCIBLE across every lever (hMin, metric-res,
//   iso-tol) and BOTH engines. Size-independent chord = the worst facets STRADDLE a near-C0 relief STEP
//   (chord ≈ ½ step height), NOT smooth sag → more triangles cannot help. It's a straddle/steep-relief
//   ACCEPT-class feature needing the per-style analyticSurfaceGate crease/straddle EXCLUSION (this lab omitted
//   it) — NOT a density or mesher problem. Corrects the pre-registration (Gyroid is NOT clean-chord). The
//   QUALITY (min-angle) leg is exclusion-independent and is the decisive result.
const TOLS = [0.1, 0.05, 0.025];

describe('chord convergence (gmsh-ISO density, GyroidManifold)', () => {
  it.skipIf(!process.env.PF_CHORDCONV)('chord p99 vs iso density (tol↓) — does isotropic refinement close it?', () => {
    const out: Array<Record<string, unknown>> = [];
    for (const tolMm of TOLS) {
      let row: Record<string, unknown>;
      try {
        const [r] = runStyle(STYLE, DIMS, ['gmsh'], { tolMm, sizeRes: 64, hMin: 0.001, hMax: 0.1, aniso: false });
        row = { tolMm, tris: r.tris, chordP99Mm: r.chordP99Mm, chordMaxMm: r.chordMaxMm, pctUnder20deg: r.pctUnder20deg, minAngleDeg: r.minAngleDeg, engineMs: r.engineMs };
      } catch (e) { row = { tolMm, error: String(e).slice(0, 200) }; }
      out.push(row);
      mkdirSync(join('research', 'exchange'), { recursive: true });
      writeFileSync(join('research', 'exchange', '_chordconv_iso.json'), JSON.stringify(out, null, 2));
      // eslint-disable-next-line no-console
      console.log(`tol=${tolMm}: ${row.error ?? `tris=${row.tris} chordP99=${(row.chordP99Mm as number)?.toFixed(3)} chordMax=${(row.chordMaxMm as number)?.toFixed(3)} %<20=${(row.pctUnder20deg as number)?.toFixed(1)}`}`);
    }
    expect(out.length).toBe(TOLS.length);
  }, 20 * 60 * 1000);
});
