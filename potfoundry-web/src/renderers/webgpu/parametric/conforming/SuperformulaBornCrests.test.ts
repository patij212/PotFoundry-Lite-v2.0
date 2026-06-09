/**
 * SuperformulaBornCrests.test.ts — documents the MEASURED geometry of the
 * SuperformulaBlossom born/forking petal crests (the m:6→10 morph), correcting
 * the original handoff's assumption that they "end at a cell-interior point →
 * dangle → T-junction".
 *
 * MEASURED FACT (this test): the ~7 born crests each run from the RIM (t=1) to
 * the u-SEAM (u≈0.999, at the birth height) — the new petals are born AT the
 * seam because seam_offset=(TAU/2)/m=π/m places them there. NONE has a truly
 * interior dangling endpoint. (A separate e2e experiment then proved naive
 * insertion is watertight — the grid-line registry handles the seam — but does
 * NOT reduce serration: the residual is curvature-resolution-limited flank chord
 * error, not an along-crest staircase. See memory `project_cad_fidelity.md`.)
 *
 * Uses the REAL marching-squares + polyline tracer with a copy of `sfRf`
 * (FeatureLineGraph.ts) so the measured geometry matches production.
 */
import { describe, it, expect } from 'vitest';
import { marchingSquaresZero, segmentsToPolylines } from './SampledFeatureExtractor';

const TAU = 2 * Math.PI;
const SF_CREST_RES_U = 768;
const SF_CREST_RES_T = 320;

const sfMix = (a: number, b: number, x: number): number => a + (b - a) * x;

function sfSuperformula(theta: number, m: number, n1: number, n2: number, n3: number, a: number, b: number): number {
  const c = Math.pow(Math.abs(Math.cos((m * theta) / 4) / Math.max(a, 1e-4)), n2);
  const s = Math.pow(Math.abs(Math.sin((m * theta) / 4) / Math.max(b, 1e-4)), n3);
  const denom = Math.pow(c + s, 1 / Math.max(n1, 1e-4));
  return denom <= 1e-4 ? 0 : Math.min(1 / denom, 4);
}

function sfRf(u: number, t: number, p: Float32Array): number {
  const m = sfMix(p[1], p[2], Math.pow(t, Math.max(p[3], 1e-4)));
  const n1 = sfMix(p[4], p[5], t);
  const n2 = sfMix(p[6], p[7], t);
  const n3 = sfMix(p[8], p[9], t);
  const a = Math.max(p[10], 1e-4);
  const b = Math.max(p[11], 1e-4);
  const seam = (TAU / 2) / Math.max(m, 1);
  return sfSuperformula(TAU * u + seam, m, n1, n2, n3, a, b);
}

/** Pack in WGSL slot order [strength,m_base,m_top,m_curve,n1,n1,n2,n2,n3,n3,a,b]. */
function pack(strength: number, mBase: number, mTop: number): Float32Array {
  return Float32Array.from([strength, mBase, mTop, 1.2, 0.35, 0.35, 0.8, 0.8, 0.8, 0.8, 1, 1]);
}

function rawCrests(p: Float32Array) {
  const h = 0.5 / SF_CREST_RES_U;
  const segs = marchingSquaresZero(
    (u, t) => sfRf(u + h, t, p) - sfRf(u - h, t, p),
    SF_CREST_RES_U, SF_CREST_RES_T, false,
  );
  return segmentsToPolylines(segs, 'sf-crest', 3, 3e-4);
}

const PIN = 0.02;
const isPinned = (t: number): boolean => t < PIN || t > 1 - PIN;
const isSeam = (u: number): boolean => u < 0.01 || u > 0.99;

describe('SuperformulaBlossom born-crest geometry (the m:6→10 morph)', () => {
  it('the full-height set is exactly the 12 base crests; morphing adds more', () => {
    const lines = rawCrests(pack(1, 6, 10));
    const full = lines.filter((l) => {
      const ts = l.points.map((q) => q.t);
      return Math.max(...ts) - Math.min(...ts) >= 0.85;
    });
    expect(full.length).toBe(12); // 6 peaks + 6 valleys at the base m=6
    expect(lines.length).toBeGreaterThan(full.length);
  });

  it('every real born crest runs RIM ↔ SEAM — none dangles at a true interior point', () => {
    const lines = rawCrests(pack(1, 6, 10));
    // Real crests (drop the n=2 seam-fragment noise from the periodicU=false cut).
    const born = lines.filter((l) => {
      if (l.points.length < 5) return false;
      const ts = l.points.map((q) => q.t);
      return Math.max(...ts) - Math.min(...ts) < 0.85;
    });
    expect(born.length).toBeGreaterThanOrEqual(4); // the morph births ≥4 petal crests
    for (const l of born) {
      const a = l.points[0];
      const b = l.points[l.points.length - 1];
      // Each endpoint is either on the rim/base (pinned t) or on the u-seam —
      // never a free interior point. So there is NO interior dangle.
      const endOk = (pt: { u: number; t: number }): boolean => isPinned(pt.t) || isSeam(pt.u);
      expect(endOk(a)).toBe(true);
      expect(endOk(b)).toBe(true);
      // And specifically one end is the rim and the other is the seam.
      const onRim = (pt: { u: number; t: number }): boolean => pt.t > 1 - PIN;
      const onSeam = (pt: { u: number; t: number }): boolean => isSeam(pt.u) && !isPinned(pt.t);
      expect((onRim(a) && onSeam(b)) || (onSeam(a) && onRim(b))).toBe(true);
    }
  });
});
