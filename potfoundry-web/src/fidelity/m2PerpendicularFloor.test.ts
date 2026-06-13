/**
 * m2PerpendicularFloor.test.ts — does the M2 PERPENDICULAR crest-frame lift the
 * floor above M1's 17deg? (user: "push the floor higher first" before committing
 * the architecture).
 *
 * M1 (feature-phase φ=u·m(t), Stages 5/6): cross edges are HORIZONTAL (t=const),
 * so crest-flank cells are sheared PARALLELOGRAMS — the 17deg floor is the shear
 * limit at the steepest crest. M2: cross edges PERPENDICULAR to the crest tangent
 * (in-surface, via the Jacobian) — RECTANGLES in the crest frame, no shear.
 *
 * This builds PER-CELL-SQUARE M2 flank cells (perpendicular offset w == the local
 * along-crest 3D spacing) for crests AND valleys at production density tRows=256,
 * seam excluded, steady vs near-birth, 3D angles via SfbWallSampler. Apples-to-
 * apples vs the M1 17deg floor (featureDensityLocalization / dyadicWarpFloor).
 *
 * Decision: if M2 floors clearly above M1 (toward ~25-30deg), the perpendicular
 * frame + its Jacobian offset is worth the extra code; if not, M1 wins (simpler,
 * tiles the whole domain incl. valleys/bulk with no transition zone).
 *
 * Pure CPU, production byte-identical.
 */
import { describe, it, expect } from 'vitest';
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import { polygonBestMinAngle3D } from './cellTriangulationCeiling';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const surf = new SfbWallSampler(p);

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a);
  return l > 1e-15 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
};

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}
const mTop = mOf(1);
const mBase = mOf(0);

function birthT(need: number): number {
  if (need <= Math.min(mBase, mTop) + 1e-9 || need >= Math.max(mBase, mTop) - 1e-9) return 0;
  let lo = 0, hi = 1;
  const inc = mTop >= mBase;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const inside = mOf(mid) > need;
    if (inc ? inside : !inside) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

interface Acc { vals: number[] }
function stat(a: Acc): { n: number; min: number; median: number; b15: number; b20: number; b25: number } {
  const s = [...a.vals].sort((x, y) => x - y);
  const n = s.length;
  let b15 = 0, b20 = 0, b25 = 0;
  for (const v of s) {
    if (v < 15) b15++;
    if (v < 20) b20++;
    if (v < 25) b25++;
  }
  return { n, min: n ? s[0] : 0, median: n ? s[Math.floor(n / 2)] : 0, b15: n ? (100 * b15) / n : 0, b20: n ? (100 * b20) / n : 0, b25: n ? (100 * b25) / n : 0 };
}
function line(name: string, a: Acc): string {
  const s = stat(a);
  return `${name}: n=${s.n} min ${s.min.toFixed(2)}deg median ${s.median.toFixed(2)}deg <15deg ${s.b15.toFixed(1)}% <20deg ${s.b20.toFixed(1)}% <25deg ${s.b25.toFixed(1)}%`;
}

describe('M2 perpendicular crest-frame floor (per-cell-square, tRows=256, seam excluded)', () => {
  it('measures whether perpendicular framing lifts the floor above M1 17deg', () => {
    const tRows = 256;
    const e = 1e-5;
    const birthBand = 0.015;

    const crestSteady: Acc = { vals: [] };
    const crestBirth: Acc = { vals: [] };
    const valleySteady: Acc = { vals: [] };
    const valleyBirth: Acc = { vals: [] };

    interface Feature { phi: number; kind: 'crest' | 'valley'; tBirth: number }
    const features: Feature[] = [];
    for (let j = 1; j <= 10; j++) {
      if (j - 0.5 < mTop) features.push({ phi: j - 0.5, kind: 'crest', tBirth: birthT(j - 0.5) });
      if (j < mTop) features.push({ phi: j, kind: 'valley', tBirth: birthT(j) });
    }

    const P = (u: number, t: number): V3 => surf.position(u, t);

    for (const feat of features) {
      for (let it = 0; it < tRows; it++) {
        const t0 = it / tRows, t1 = (it + 1) / tRows, tm = (t0 + t1) / 2;
        const m = mOf(tm);
        if (feat.phi < 1 || feat.phi > m - 1) continue; // seam excluded
        const uc0 = feat.phi / mOf(t0);
        const uc1 = feat.phi / mOf(t1);
        const ucm = feat.phi / m;
        const C0 = P(uc0, t0);
        const C1 = P(uc1, t1);
        const T = sub(C1, C0); // along-crest 3D segment
        const w = len(T); // per-cell-square: perpendicular extent == along extent
        if (!(w > 1e-9)) continue;

        // Surface tangents at the feature midpoint.
        const Pu = ((): V3 => {
          const a = P(ucm + e, tm), b = P(ucm - e, tm);
          return [(a[0] - b[0]) / (2 * e), (a[1] - b[1]) / (2 * e), (a[2] - b[2]) / (2 * e)];
        })();
        const Pt = ((): V3 => {
          const a = P(ucm, Math.min(1, tm + e)), b = P(ucm, Math.max(0, tm - e));
          return [(a[0] - b[0]) / (2 * e), (a[1] - b[1]) / (2 * e), (a[2] - b[2]) / (2 * e)];
        })();
        const N = norm(cross(Pu, Pt));
        const Th = norm(T);
        const nPerp = norm(cross(N, Th)); // in-surface, perpendicular to the crest

        // Solve J·δ = w·nPerp for δ=(du,dt), J=[Pu|Pt]; JᵀJ is 2×2 SPD.
        const b: V3 = [w * nPerp[0], w * nPerp[1], w * nPerp[2]];
        const a11 = dot(Pu, Pu), a12 = dot(Pu, Pt), a22 = dot(Pt, Pt);
        const r1 = dot(Pu, b), r2 = dot(Pt, b);
        const det = a11 * a22 - a12 * a12;
        if (!(Math.abs(det) > 1e-18)) continue;
        const du = (r1 * a22 - r2 * a12) / det;
        const dt = (a11 * r2 - a12 * r1) / det;

        // +flank and -flank quads (perpendicular offset).
        const plus: CellPoint[] = [
          { u: uc0, t: t0 },
          { u: uc1, t: t1 },
          { u: uc1 + du, t: t1 + dt },
          { u: uc0 + du, t: t0 + dt },
        ];
        const minus: CellPoint[] = [
          { u: uc0, t: t0 },
          { u: uc0 - du, t: t0 - dt },
          { u: uc1 - du, t: t1 - dt },
          { u: uc1, t: t1 },
        ];
        const angP = polygonBestMinAngle3D(plus, surf);
        const angM = polygonBestMinAngle3D(minus, surf);
        const nearBirth = feat.tBirth > 0 && tm - feat.tBirth < birthBand;
        const dst = feat.kind === 'crest'
          ? nearBirth ? crestBirth : crestSteady
          : nearBirth ? valleyBirth : valleySteady;
        dst.vals.push(angP);
        dst.vals.push(angM);
      }
    }

    const worstOf = (a: Acc): number => {
      let mn = Infinity;
      for (const v of a.vals) if (v < mn) mn = v;
      return Number.isFinite(mn) ? mn : 90;
    };
    const worstSteady = Math.min(worstOf(crestSteady), worstOf(valleySteady));

    /* eslint-disable no-console */
    console.log('\n===== M2 PERPENDICULAR FLOOR (per-cell-square, tRows=256, seam excluded) =====');
    console.log('  ' + line('crest  STEADY   ', crestSteady));
    console.log('  ' + line('crest  NEAR-BIRTH', crestBirth));
    console.log('  ' + line('valley STEADY   ', valleySteady));
    console.log('  ' + line('valley NEAR-BIRTH', valleyBirth));
    console.log(`  WORST steady (crest|valley) = ${worstSteady.toFixed(2)}deg   [M1 baseline ~17-18deg]`);
    console.log('=============================================================================\n');
    /* eslint-enable no-console */

    expect(crestSteady.vals.length).toBeGreaterThan(100);
    expect(valleySteady.vals.length).toBeGreaterThan(100);
  });
});
