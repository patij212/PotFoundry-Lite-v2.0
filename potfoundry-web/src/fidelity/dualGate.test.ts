// @vitest-environment node
// EXPORT DUAL GATE — CI-runnable regression guard on the committed dual-gate baseline
// (no GPU needed). Enforces the CHORD gate on the tractable styles and pins the
// documented floor. See docs/superpowers/specs/2026-06-15-export-quality-gate-and-floor.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GATE_THRESHOLDS } from './gateThresholds';

interface Row {
  style: string;
  error?: string;
  perpP99Mm?: number;
  perpChordMaxMm?: number;
  vertexMaxMm?: number;
  worstMinAngleDeg?: number;
}

const BASELINE = resolve(
  __dirname,
  '../../../docs/superpowers/specs/2026-06-10-export-endgame-evidence/stage1-dualgate-baseline.json',
);
const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as { rows: Row[] };

// Documented inherent floor (2026-06-15-export-quality-gate-and-floor.md): the 5 tangled
// lattice/weave/braid styles chord across their curved walls — irreducible without heavy
// anisotropic meshing (five approaches measured + exhausted). Voronoi is ref-untrusted
// (f32/f64 hash-precision floor; its reference can't certify it).
const CHORD_FLOOR = new Set(['GyroidManifold', 'BasketWeave', 'CelticKnot', 'CelticTriquetra', 'GothicArches']);
const REF_UNTRUSTED = new Set(['Voronoi']);

describe('export dual gate (committed baseline)', () => {
  it('all 20 styles are measured in the baseline', () => {
    expect(baseline.rows.filter((r) => !r.error).length).toBe(20);
  });

  it('CHORD: every tractable (non-floor) style is under the curvature-relative ceiling', () => {
    for (const r of baseline.rows) {
      if (r.error || CHORD_FLOOR.has(r.style) || REF_UNTRUSTED.has(r.style)) continue;
      expect(r.perpP99Mm, `${r.style} perp-3D p99 present`).not.toBeUndefined();
      expect(r.perpP99Mm as number, `${r.style} perp-3D p99 ≤ tauCeil`).toBeLessThanOrEqual(
        GATE_THRESHOLDS.tauCeilMm + 1e-9,
      );
    }
  });

  it('the documented chord-floor styles are present and genuinely over tol', () => {
    const byStyle = new Map(baseline.rows.map((r) => [r.style, r]));
    for (const s of CHORD_FLOOR) {
      const r = byStyle.get(s);
      expect(r, `floor style ${s} in baseline`).toBeDefined();
      expect((r as Row).perpP99Mm as number, `${s} genuinely over tol`).toBeGreaterThan(GATE_THRESHOLDS.tauCeilMm);
    }
  });

  it('VERTEX: every ref-trusted style places vertices on the true surface (≈ f32 floor)', () => {
    for (const r of baseline.rows) {
      if (r.error || REF_UNTRUSTED.has(r.style) || r.vertexMaxMm == null) continue;
      expect(r.vertexMaxMm, `${r.style} vertexMax ≈ f32 floor`).toBeLessThan(0.01);
    }
  });
});
