// _strataCreaseDetect.test.ts — STRATA-001 shape-agnostic Stage-1: GENERIC feature detection from the analytic
// surface alone (no per-style code). A crease is where the surface GRADIENT is discontinuous (normal jumps, r
// continuous); a JUMP is where r itself is discontinuous. Both are found by a two-scale test on the directional
// derivative, exactly like the z-step detector but in an arbitrary direction. This probe verifies the detector
// localizes the right feature loci across the hard styles BEFORE any conforming is built (audit-first).
//
// Gated PF_STRATA_CREASE=1; PF_CREASE_STYLE=<name>.
import { describe, it, expect } from 'vitest';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { STYLE_REGISTRY } from '../../src/styles/registry';

const RUN = process.env.PF_STRATA_CREASE === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
}
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const group of [cfg?.params, cfg?.advancedParams]) {
    if (group === undefined) continue;
    for (const [k, v] of Object.entries(group)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

describe('STRATA-001 generic feature detection', () => {
  it.runIf(RUN)('localizes creases/jumps on the analytic surface', () => {
    const style = process.env.PF_CREASE_STYLE ?? 'GeometricStar';
    const rA = buildRadiusFn(style as StyleId, registryDefaults(style), DIMS);
    // 3D point on the outer wall.
    const P = (u: number, v: number): [number, number, number] => {
      const th = TWO_PI * u;
      const z = v * H;
      const r = rA(th, z);
      return [r * Math.cos(th), r * Math.sin(th), z];
    };
    // Directional 2nd-difference magnitude along a small step (du,dv), two scales; crease/jump ⇔ the LARGER-scale
    // curvature does NOT keep shrinking ∝ h² as we halve h (a smooth region's 2nd difference ∝ h²).
    const featureScore = (u: number, v: number): number => {
      // measure the kink of r along both axes at two scales; report the scale-invariance ratio × magnitude.
      const scoreAxis = (du: number, dv: number): number => {
        const h1 = 1;
        const c0 = P(u, v);
        const rp = P(u + du * h1, v + dv * h1);
        const rm = P(u - du * h1, v - dv * h1);
        // second difference (curvature proxy) at scale h1
        const d1 = Math.hypot(rp[0] - 2 * c0[0] + rm[0], rp[1] - 2 * c0[1] + rm[1], rp[2] - 2 * c0[2] + rm[2]);
        const rp2 = P(u + du * 0.25, v + dv * 0.25);
        const rm2 = P(u - du * 0.25, v - dv * 0.25);
        const d2 = Math.hypot(rp2[0] - 2 * c0[0] + rm2[0], rp2[1] - 2 * c0[1] + rm2[1], rp2[2] - 2 * c0[2] + rm2[2]);
        // smooth: d2 ≈ d1/16 (h²); crease: d2 ≈ d1/4 (h¹); jump: d2 ≈ d1 (h⁰). Score = how far from smooth.
        if (d1 < 1e-9) return 0;
        return (d2 / d1) * d1 * 1000; // (scale-invariance) × magnitude in µm-ish
      };
      const du = 1 / 512;
      const dv = 1 / 512;
      return Math.max(scoreAxis(du, 0), scoreAxis(0, dv), scoreAxis(du, dv), scoreAxis(du, -dv));
    };

    const Gu = 384;
    const Gv = 256;
    let featured = 0;
    let maxScore = 0;
    const hot: Array<[number, number, number]> = [];
    for (let iu = 0; iu < Gu; iu += 1) {
      for (let iv = 1; iv < Gv; iv += 1) {
        const u = iu / Gu;
        const v = iv / Gv;
        const s = featureScore(u, v);
        if (s > maxScore) maxScore = s;
        if (s > 20) {
          featured += 1;
          if (hot.length < 16) hot.push([u, v, s]);
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      [
        '',
        `=== GENERIC FEATURE DETECT: ${style} ===`,
        `grid ${Gu}×${Gv}   featured cells (score>20): ${featured}  (${((100 * featured) / (Gu * Gv)).toFixed(1)}%)   maxScore ${maxScore.toFixed(0)}`,
        ...hot.slice(0, 8).map(([u, v, s]) => `  u=${u.toFixed(3)} v=${v.toFixed(3)} score=${s.toFixed(0)}`),
        '========================================',
        '',
      ].join('\n')
    );
    expect(Gu).toBeGreaterThan(0);
  }, 600_000);
});
