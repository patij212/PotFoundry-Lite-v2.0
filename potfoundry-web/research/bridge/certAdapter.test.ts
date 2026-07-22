// certAdapter.test.ts — cross-validate the GENERAL cut-at-gap judge-cert bridge against the proven DS-specific path.
// The general adapter (cutAtGapCertDomain / certifyPeriodicGridMesh) must reproduce src `buildDsConeFanCertDomain`
// on the DS wall AND earn a judge ACCEPT — so any style whose production mesh is a periodic (u,t) grid can reuse it.
import { describe, it, expect } from 'vitest';
import {
  buildDsConeFanWallGeometric,
  buildDsConeFanCertDomain,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { DEFAULT_DS_LATTICE } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsFeatureEdges';
import { cutAtGapCertDomain, certifyPeriodicGridMesh } from './certAdapter';

const TAU = 2 * Math.PI;
const H = 120;
const SCALE_ROWS = DEFAULT_DS_LATTICE.scaleRows;

/** Synthetic DS-like radius with a C0 jump at every interior ring (row-parity stagger) — self-contained. */
function syntheticDsRA(theta: number, z: number): number {
  const t = z / H;
  const row = Math.floor(Math.min(t * SCALE_ROWS, SCALE_ROWS - 1e-9));
  const stagger = row % 2 === 1 ? Math.PI / DEFAULT_DS_LATTICE.scalesPerRow : 0;
  return 45 + 2.5 * Math.sin(DEFAULT_DS_LATTICE.scalesPerRow * theta + stagger * DEFAULT_DS_LATTICE.scalesPerRow);
}

describe('certAdapter — general cut-at-gap judge-cert bridge', () => {
  const NU = 256; // apexColStep=8 > 2·p(3); cut column q=4 (the DS src computes the same)
  const OPTS = { patchP: 3, bodyStepMm: 2, crestLadderRows: 0 };

  it('cutAtGapCertDomain reproduces src buildDsConeFanCertDomain on the DS wall', () => {
    const wall = buildDsConeFanWallGeometric(syntheticDsRA, H, NU, OPTS);
    const ref = buildDsConeFanCertDomain(syntheticDsRA, H, NU, OPTS); // the DS-specific path
    const gen = cutAtGapCertDomain(wall.ut, wall.indices, wall.vertices, NU, ref.cutColumn); // the general adapter
    expect(gen.seamDupCount).toBe(ref.seamDupCount);
    expect(gen.indices.length).toBe(ref.indices.length);
    expect(gen.uJudge.length).toBe(ref.uJudge.length);
    // no triangle spans the flat seam
    const nF = gen.indices.length / 3;
    let maxSpan = 0, nonPos = 0;
    for (let f = 0; f < nF; f++) {
      const a = gen.indices[3 * f], b = gen.indices[3 * f + 1], c = gen.indices[3 * f + 2];
      const span = Math.max(gen.uJudge[a], gen.uJudge[b], gen.uJudge[c]) - Math.min(gen.uJudge[a], gen.uJudge[b], gen.uJudge[c]);
      if (span > maxSpan) maxSpan = span;
      const area2 = (gen.uJudge[b] - gen.uJudge[a]) * (gen.t[c] - gen.t[a]) - (gen.uJudge[c] - gen.uJudge[a]) * (gen.t[b] - gen.t[a]);
      if (area2 <= 0) nonPos++;
    }
    expect(maxSpan).toBeLessThan(0.5);
    expect(nonPos).toBe(0);
  });

  it('certifyPeriodicGridMesh earns a judge ACCEPT on the DS wall (health checks clean, δ tiny)', () => {
    const wall = buildDsConeFanWallGeometric(syntheticDsRA, H, NU, OPTS);
    const q = buildDsConeFanCertDomain(syntheticDsRA, H, NU, OPTS).cutColumn;
    const verdict = certifyPeriodicGridMesh(wall.ut, wall.indices, wall.vertices, NU, q, syntheticDsRA, H, 20);
    expect(verdict.wrapTris).toBe(0);
    expect(verdict.nonPosTris).toBe(0);
    expect(verdict.accepted).toBe(true);
    expect(verdict.maxDelta).toBeLessThan(0.001); // path-A snap δ at N=2^20 folds ≪ 0.01
  }, 120_000);

  it('a BAD cut column (inside a fan block, off the apex) is DIAGNOSED via nonGapStraddle', () => {
    // Cutting at column 0 is CLEAN (the apex sits exactly on u=0 ⇒ it splits, redirected verts stay at u=0). A bad cut
    // is a column INSIDE a fan block but OFF the apex (col 1, inside apex-0's p=3 block): the fan's u≈0.0x verts get
    // clamped to u=1 ⇒ a DISTORTED (topologically-valid) domain. wrap/nonPos stay 0; nonGapStraddle (+ a blown-up δ)
    // flags it. The adapter must fail LOUD, not silently certify.
    const wall = buildDsConeFanWallGeometric(syntheticDsRA, H, NU, OPTS);
    const v = certifyPeriodicGridMesh(wall.ut, wall.indices, wall.vertices, NU, 1, syntheticDsRA, H, 20);
    expect(v.nonGapStraddle).toBeGreaterThan(0);
    expect(v.maxDelta).toBeGreaterThan(0.01); // the clamped-to-u=1 fan verts land at the wrong θ ⇒ huge δ
  }, 120_000);
});
