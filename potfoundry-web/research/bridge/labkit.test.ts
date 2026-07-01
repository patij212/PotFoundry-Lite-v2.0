// labkit.test.ts — fast, synthetic regression guard for the consolidated lab-kit helpers. No mesh build (runs in
// ms), so it is crash-proof and safe to keep ungated. Proves: manifold audit is non-vacuous (an injected 3rd
// triangle on a shared edge MUST move the count), binary STL header/size are correct, per-face chord sag is
// non-negative and shrinks under refinement, the heat ramp maps 0→green / large→red, and the barrel re-exports resolve.
import { describe, it, expect } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  auditNonManByIndex, perFaceChordSag, chordSagColor, vertErrColors, writeBinarySTL,
  buildInhouseMetricMesh, featureLineChord3D, computeMeasuredGate, recoverAndLockEdges, perpendicular3DDeviation,
  // these three were mis-routed in the barrel (caught by verification) — import them so the guard is non-vacuous:
  honestGate, lockedPredicate, crestBandTriangleQuality,
} from './labkit';

describe('labkit helpers', () => {
  it('auditNonManByIndex is non-vacuous (injected 3rd tri on a shared edge moves the count)', () => {
    // unit quad split into 2 tris sharing edge 0-2 → manifold.
    const xyz = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
    expect(auditNonManByIndex(xyz, [0, 1, 2, 0, 2, 3])).toBe(0);
    // add a 3rd triangle on the SAME edge 0-2 (with a new out-of-plane vertex) → edge shared by 3 → non-manifold.
    const xyz3 = [...xyz, 0.5, 0.5, 1];
    expect(auditNonManByIndex(xyz3, [0, 1, 2, 0, 2, 3, 0, 2, 4])).toBeGreaterThanOrEqual(1);
  });

  it('writeBinarySTL header + size are correct', () => {
    const p = join(tmpdir(), 'labkit_stl_test.stl');
    writeBinarySTL(p, [0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    const buf = readFileSync(p);
    expect(buf.length).toBe(84 + 50); // 80 header + 4 count + 1 tri × 50
    expect(buf.readUInt32LE(80)).toBe(1);
    rmSync(p, { force: true });
  });

  it('perFaceChordSag is non-negative and SHRINKS under refinement', () => {
    const rA = (th: number, _z: number): number => 40 + 5 * Math.cos(3 * th); // synthetic radial bump
    const H = 120;
    // one triangle spanning a WIDE u band (coarse) vs a NARROW band (fine), same t.
    const big = perFaceChordSag([0.0, 0.5, 0.2, 0.5, 0.1, 0.55], [0, 1, 2], rA, H);
    const small = perFaceChordSag([0.0, 0.5, 0.02, 0.5, 0.01, 0.505], [0, 1, 2], rA, H);
    expect(big.worstMm).toBeGreaterThan(0);
    expect(small.worstMm).toBeGreaterThanOrEqual(0);
    expect(big.worstMm).toBeGreaterThan(small.worstMm); // refinement reduces chord sag
    expect(Number.isFinite(big.worstMm)).toBe(true);
    expect(big.fracOver(0)).toBeGreaterThan(0);
  });

  it('chordSagColor maps 0→green and ≥scale→red; vertErrColors packs rgb', () => {
    const g = chordSagColor(0, 0.15); expect(g[1]).toBeGreaterThan(g[0]); expect(g[1]).toBeGreaterThan(g[2]); // green dominant
    const r = chordSagColor(0.3, 0.15); expect(r[0]).toBeGreaterThan(r[1]); // red dominant (clamped)
    const col = vertErrColors(Float64Array.from([0, 0.3]), 0.15);
    expect(col.length).toBe(6); expect(col[1]).toBeGreaterThan(col[0]); expect(col[3]).toBeGreaterThan(col[4]);
  });

  it('barrel re-exports resolve to callables (incl. the cross-module ones)', () => {
    // honestGate←honestMetrics, lockedPredicate←constraintRecovery, crestBandTriangleQuality←src/fidelity/metrics
    // are re-routed through the barrel — a mis-routed `export {x} from './wrong'` yields undefined here.
    for (const fn of [buildInhouseMetricMesh, featureLineChord3D, computeMeasuredGate, recoverAndLockEdges, perpendicular3DDeviation, honestGate, lockedPredicate, crestBandTriangleQuality]) {
      expect(typeof fn).toBe('function');
    }
  });
});
