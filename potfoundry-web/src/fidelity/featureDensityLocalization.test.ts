/**
 * featureDensityLocalization.test.ts — IN-SCOPE follow-up (seam is out of scope
 * per 2026-06-13 direction: the sharp seam cliff is accepted).
 *
 * Stage 4 confirmed the global feature-aligned warp REGRESSES at production
 * along-density (crest sub-20deg 0.5% -> 16.6%, min 2.91deg at tRows=256). This
 * probe localizes WHERE that regression lives, with the seam EXCLUDED, to decide
 * whether "every triangle perfect" is reachable for the in-scope features
 * (crests + valleys):
 *
 *   - Builds PER-ROW 3D-SQUARE aligned flank cells (dφ chosen per row so the
 *     cross-feature 3D extent == the along-feature 3D spacing — the BEST case
 *     for alignment, isolating cusp/birth irreducibility from any uniform-
 *     lattice cost) at production density tRows=256.
 *   - Partitions crest AND valley flank cells into STEADY vs NEAR-BIRTH.
 *   - Measures 3D min-angle via SfbWallSampler.position (never in (u,t)).
 *
 * Verdict logic:
 *   - STEADY crests/valleys CLEAN (<2% sub-20) => the cusp does NOT poison
 *     aligned flank cells; the tRows=256 regression is the localized birth tail
 *     (the emergence cusp where amplitude->0) => every-triangle-perfect reachable
 *     except a bounded birth residual.
 *   - STEADY crests SLIVERED even per-row-square => the n1=0.35 cusp poisons
 *     flank cells at fine density => irreducible floor, perfect is impossible
 *     near cusps without a different primitive.
 *
 * Pure CPU, production byte-identical. Reuses the pinned config + 3D angle math.
 */
import { describe, it, expect } from 'vitest';
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import { polygonBestMinAngle3D } from './cellTriangulationCeiling';
import { SfbWallSampler, SFB1_PACKED } from './snapPlacementAudit';

const p = Float32Array.from(SFB1_PACKED);
const surf = new SfbWallSampler(p);

function mOf(t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  return p[1] + (p[2] - p[1]) * Math.pow(tc, Math.max(p[3], 1e-4));
}
const mBase = mOf(0);
const mTop = mOf(1);

/** t where m(t)=need on the monotone m(t), or null if not crossed in (0,1). */
function birthT(need: number): number | null {
  if (need <= Math.min(mBase, mTop) + 1e-9 || need >= Math.max(mBase, mTop) - 1e-9) return null;
  let lo = 0;
  let hi = 1;
  const inc = mTop >= mBase;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const inside = mOf(mid) > need;
    if (inc ? inside : !inside) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

interface Acc {
  vals: number[];
}
function push(a: Acc, v: number): void {
  a.vals.push(v);
}
function stat(a: Acc): { n: number; min: number; median: number; b15: number; b20: number } {
  const s = [...a.vals].sort((x, y) => x - y);
  const n = s.length;
  const med = n ? s[Math.floor(n / 2)] : 0;
  let b15 = 0;
  let b20 = 0;
  for (const v of s) {
    if (v < 15) b15++;
    if (v < 20) b20++;
  }
  return {
    n,
    min: n ? s[0] : 0,
    median: med,
    b15: n ? (100 * b15) / n : 0,
    b20: n ? (100 * b20) / n : 0,
  };
}
function fmt(name: string, a: Acc): string {
  const s = stat(a);
  return `${name}: n=${s.n} min ${s.min.toFixed(2)}deg median ${s.median.toFixed(2)}deg <15deg ${s.b15.toFixed(1)}% <20deg ${s.b20.toFixed(1)}%`;
}

describe('feature density localization — per-row 3D-square aligned cells, seam excluded', () => {
  it('partitions crest+valley flank quality at tRows=256 into steady vs near-birth', () => {
    const tRows = 256;
    const e = 1e-5;
    const birthBand = 0.015; // ~4 rows above a birth = the emergence band

    const crestSteady: Acc = { vals: [] };
    const crestBirth: Acc = { vals: [] };
    const valleySteady: Acc = { vals: [] };
    const valleyBirth: Acc = { vals: [] };

    // Feature lines: crests at phi=j-0.5, valleys at phi=j (j>=1), up to m(1)=10.
    interface Feature { phi: number; kind: 'crest' | 'valley'; tBirth: number }
    const features: Feature[] = [];
    for (let j = 1; j <= 10; j++) {
      const cphi = j - 0.5;
      if (cphi < mTop) features.push({ phi: cphi, kind: 'crest', tBirth: birthT(cphi) ?? 0 });
      const vphi = j;
      if (vphi < mTop) features.push({ phi: vphi, kind: 'valley', tBirth: birthT(vphi) ?? 0 });
    }

    const P = (u: number, t: number): readonly [number, number, number] => surf.position(u, t);

    for (const feat of features) {
      for (let it = 0; it < tRows; it++) {
        const t0 = it / tRows;
        const t1 = (it + 1) / tRows;
        const tm = (t0 + t1) / 2;
        const m = mOf(tm);
        if (feat.phi >= m - 1e-9) continue; // feature not yet born at this row
        const uc = feat.phi / m;

        // Per-row 3D-square dφ: cross (|dP/du|/m·dφ) == along (|dP/dt|·Δt).
        const a = P(uc + e, tm);
        const b = P(uc - e, tm);
        const dPdu = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (2 * e);
        const c = P(uc, Math.min(1, tm + e));
        const d = P(uc, Math.max(0, tm - e));
        const dPdt = Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) / (2 * e);
        if (!(dPdu > 1e-9) || !(dPdt > 1e-9)) continue;
        const along = dPdt * (t1 - t0);
        const dphi = (along * m) / dPdu; // makes cross == along at this row
        if (!(dphi > 1e-9) || dphi >= 0.5) continue; // 0.5 = half the feature spacing

        // Exclude the SEAM (out of scope): skip if either flank would cross u=1.
        if (feat.phi + dphi >= m || feat.phi - dphi <= 0) continue;

        // +flank and -flank quads (u = phi/m(t) at each corner's own t).
        const uHiT0 = (feat.phi + dphi) / mOf(t0);
        const uHiT1 = (feat.phi + dphi) / mOf(t1);
        const uLoT0 = (feat.phi - dphi) / mOf(t0);
        const uLoT1 = (feat.phi - dphi) / mOf(t1);
        const ucT0 = feat.phi / mOf(t0);
        const ucT1 = feat.phi / mOf(t1);
        const plus: CellPoint[] = [
          { u: ucT0, t: t0 },
          { u: uHiT0, t: t0 },
          { u: uHiT1, t: t1 },
          { u: ucT1, t: t1 },
        ];
        const minus: CellPoint[] = [
          { u: uLoT0, t: t0 },
          { u: ucT0, t: t0 },
          { u: ucT1, t: t1 },
          { u: uLoT1, t: t1 },
        ];
        const angPlus = polygonBestMinAngle3D(plus, surf);
        const angMinus = polygonBestMinAngle3D(minus, surf);
        const nearBirth = feat.tBirth > 0 && tm - feat.tBirth < birthBand;
        const dst = feat.kind === 'crest'
          ? nearBirth ? crestBirth : crestSteady
          : nearBirth ? valleyBirth : valleySteady;
        push(dst, angPlus);
        push(dst, angMinus);
      }
    }

    /* eslint-disable no-console */
    console.log('\n===== FEATURE DENSITY LOCALIZATION (per-row 3D-square, tRows=256, seam excluded) =====');
    console.log('  ' + fmt('crest  STEADY   ', crestSteady));
    console.log('  ' + fmt('crest  NEAR-BIRTH', crestBirth));
    console.log('  ' + fmt('valley STEADY   ', valleySteady));
    console.log('  ' + fmt('valley NEAR-BIRTH', valleyBirth));
    console.log('=====================================================================================\n');
    /* eslint-enable no-console */

    expect(crestSteady.vals.length).toBeGreaterThan(100);
    expect(valleySteady.vals.length).toBeGreaterThan(100);
  });
});
