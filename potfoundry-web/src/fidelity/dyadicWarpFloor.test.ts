/**
 * dyadicWarpFloor.test.ts — the LAST in-scope feasibility gate.
 *
 * Stage 5 showed PER-ROW 3D-SQUARE aligned cells hit no-triangle-below-18° at
 * production density. But per-row-square (continuously varying width) is NOT
 * watertight-tileable. The production quadtree uses DYADIC 2:1 refinement: cell
 * widths are 1/2^q, neighbours differ by at most one level, and the level steps
 * are bridged by mid-edge TRANSITION cells. This probe tests whether that dyadic
 * approximation holds the floor — and specifically whether the TRANSITION cells
 * (the only thing per-row-square lacked) stay well-shaped.
 *
 * Construction (feature-phase frame φ = u·m(t), seam EXCLUDED per scope):
 *   - tRows = 256 (production along-density).
 *   - per row, the φ-level q is the FINEST any in-scope crest/valley needs to
 *     hold cross ≤ along (per-row-square snapped UP to a power of 2), then
 *     2:1-BALANCED across rows (|Δq| ≤ 1) exactly as PeriodicBalancedQuadtree.
 *   - a cell whose t-neighbour row is one level FINER carries a mid-edge vertex
 *     on that shared edge ⇒ a 5-gon TRANSITION cell, triangulated the production
 *     way (max of best-diagonal and centroid-fan — the emitShapedTransition
 *     chooser). Regular cells use the best shorter-3D-diagonal.
 *   - every angle in 3D via SfbWallSampler.position. Seam excluded: φ∈[1, m−1].
 *
 * PASS: transition cells (and all regular cells) clear the floor (≥15° hard,
 * ideally ≥18° matching per-row-square) ⇒ the architecture is watertight-tileable
 * AND every-triangle-perfect at production density ⇒ research done, build next.
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

type V3 = readonly [number, number, number];
function triMin3(a: V3, b: V3, c: V3): number {
  const ang = (P: V3, Q: V3, R: V3): number => {
    const x1 = Q[0] - P[0], y1 = Q[1] - P[1], z1 = Q[2] - P[2];
    const x2 = R[0] - P[0], y2 = R[1] - P[1], z2 = R[2] - P[2];
    const l1 = Math.hypot(x1, y1, z1), l2 = Math.hypot(x2, y2, z2);
    if (l1 < 1e-12 || l2 < 1e-12) return 0;
    let cs = (x1 * x2 + y1 * y2 + z1 * z2) / (l1 * l2);
    cs = cs > 1 ? 1 : cs < -1 ? -1 : cs;
    return (Math.acos(cs) * 180) / Math.PI;
  };
  return Math.min(ang(a, b, c), ang(b, c, a), ang(c, a, b));
}

/** Centroid-fan 3D min-angle (the production transition fallback). */
function fanMin3D(poly: CellPoint[]): number {
  let uc = 0, tc = 0;
  for (const q of poly) {
    uc += q.u;
    tc += q.t;
  }
  uc /= poly.length;
  tc /= poly.length;
  const C = surf.position(uc, tc);
  let mn = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = surf.position(poly[i].u, poly[i].t);
    const b = surf.position(poly[(i + 1) % poly.length].u, poly[(i + 1) % poly.length].t);
    const m = triMin3(C, a, b);
    if (m < mn) mn = m;
  }
  return mn;
}

interface Acc { vals: number[] }
function stat(a: Acc): { n: number; min: number; median: number; b15: number; b20: number } {
  const s = [...a.vals].sort((x, y) => x - y);
  const n = s.length;
  let b15 = 0, b20 = 0;
  for (const v of s) {
    if (v < 15) b15++;
    if (v < 20) b20++;
  }
  return { n, min: n ? s[0] : 0, median: n ? s[Math.floor(n / 2)] : 0, b15: n ? (100 * b15) / n : 0, b20: n ? (100 * b20) / n : 0 };
}
function line(name: string, a: Acc): string {
  const s = stat(a);
  return `${name}: n=${s.n} min ${s.min.toFixed(2)}deg median ${s.median.toFixed(2)}deg <15deg ${s.b15.toFixed(1)}% <20deg ${s.b20.toFixed(1)}%`;
}

describe('dyadic 2:1 feature-aligned floor at production density (seam excluded)', () => {
  it('holds the floor including transition cells', () => {
    const tRows = 256;
    const e = 1e-5;

    // ── per-row finest φ-level needed (per-row-square snapped up to a power of 2) ──
    const qRaw = new Array<number>(tRows).fill(0);
    for (let it = 0; it < tRows; it++) {
      const t0 = it / tRows, t1 = (it + 1) / tRows, tm = (t0 + t1) / 2;
      const m = mOf(tm);
      let minDphi = Infinity;
      for (let k = 1; k <= 20; k++) {
        const phi = k * 0.5; // every feature line (crest=odd·0.5, valley=even·0.5)
        if (phi < 1 || phi > m - 1) continue; // seam-excluded scope
        const uc = phi / m;
        const a = surf.position(uc + e, tm), b = surf.position(uc - e, tm);
        const dPdu = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / (2 * e);
        const c = surf.position(uc, Math.min(1, tm + e)), d = surf.position(uc, Math.max(0, tm - e));
        const dPdt = Math.hypot(c[0] - d[0], c[1] - d[1], c[2] - d[2]) / (2 * e);
        if (dPdu > 1e-9 && dPdt > 1e-9) {
          const along = dPdt * (t1 - t0);
          const dphi = (along * m) / dPdu; // per-row-square width
          if (dphi < minDphi) minDphi = dphi;
        }
      }
      qRaw[it] = Number.isFinite(minDphi) && minDphi > 0 ? Math.max(0, Math.ceil(Math.log2(0.5 / minDphi))) : 0;
    }
    // ── 2:1 balance across rows (|Δq| ≤ 1) ──
    const q = [...qRaw];
    for (let pass = 0; pass < tRows; pass++) {
      let changed = false;
      for (let it = 1; it < tRows; it++) if (q[it] < q[it - 1] - 1) { q[it] = q[it - 1] - 1; changed = true; }
      for (let it = tRows - 2; it >= 0; it--) if (q[it] < q[it + 1] - 1) { q[it] = q[it + 1] - 1; changed = true; }
      if (!changed) break;
    }

    const reg: Record<string, Acc> = { crest: { vals: [] }, valley: { vals: [] }, bulk: { vals: [] } };
    // FORCED 2:1 transition cells (the real risk): the natural SFB@1 grid is
    // uniform (q const ⇒ no transitions), so we conservatively build a coarse
    // (2s-wide) cell with a mid-edge vertex on its top edge AT EVERY row — as if
    // the row above were one level finer everywhere — and measure that worst case.
    const trans: Record<string, Acc> = { crest: { vals: [] }, valley: { vals: [] }, bulk: { vals: [] } };
    let minQ = Infinity, maxQ = -Infinity;

    const regionOf = (phiLo: number, phiHi: number): 'crest' | 'valley' | 'bulk' => {
      for (let k = Math.ceil(phiLo * 2 - 1e-9); k <= Math.floor(phiHi * 2 + 1e-9); k++) {
        const f = k / 2;
        if (f >= phiLo - 1e-9 && f <= phiHi + 1e-9) return k % 2 === 1 ? 'crest' : 'valley';
      }
      return 'bulk';
    };

    for (let it = 0; it < tRows; it++) {
      const t0 = it / tRows, t1 = (it + 1) / tRows, tm = (t0 + t1) / 2;
      const m = mOf(tm);
      if (q[it] < minQ) minQ = q[it];
      if (q[it] > maxQ) maxQ = q[it];
      const s = 0.5 / Math.pow(2, q[it]);
      const m0 = mOf(t0), m1 = mOf(t1);
      const kStart = Math.ceil(1 / s), kEnd = Math.floor((m - 1) / s);
      for (let k = kStart; k < kEnd; k++) {
        const phiLo = k * s, phiHi = (k + 1) * s;
        const quad: CellPoint[] = [
          { u: phiLo / m0, t: t0 },
          { u: phiHi / m0, t: t0 },
          { u: phiHi / m1, t: t1 },
          { u: phiLo / m1, t: t1 },
        ];
        reg[regionOf(phiLo, phiHi)].vals.push(polygonBestMinAngle3D(quad, surf));
      }
      // FORCED transition: coarse cells of width 2s with a top mid-edge vertex.
      for (let k = kStart; k + 1 < kEnd; k += 2) {
        const phiLo = k * s, phiHi = (k + 2) * s, phiMid = (k + 1) * s;
        const poly: CellPoint[] = [
          { u: phiLo / m0, t: t0 },
          { u: phiHi / m0, t: t0 },
          { u: phiHi / m1, t: t1 },
          { u: phiMid / m1, t: t1 }, // mid-edge vertex (finer row above)
          { u: phiLo / m1, t: t1 },
        ];
        const ang = Math.max(polygonBestMinAngle3D(poly, surf), fanMin3D(poly));
        trans[regionOf(phiLo, phiHi)].vals.push(ang);
      }
    }
    const transitionRows = `forced (natural grid q∈[${minQ},${maxQ}] ⇒ ${minQ === maxQ ? 'no natural transitions' : 'has transitions'})`;

    const worstOf = (a: Acc): number => {
      let mn = Infinity;
      for (const v of a.vals) if (v < mn) mn = v;
      return Number.isFinite(mn) ? mn : 90;
    };
    const worstReg = Math.min(worstOf(reg.crest), worstOf(reg.valley), worstOf(reg.bulk));
    const worstTrans = Math.min(worstOf(trans.crest), worstOf(trans.valley), worstOf(trans.bulk));

    /* eslint-disable no-console */
    console.log('\n===== DYADIC 2:1 FEATURE-ALIGNED FLOOR (tRows=256, seam excluded) =====');
    console.log(`φ-levels q: min ${minQ} max ${maxQ}; transitions: ${transitionRows}`);
    console.log('  REGULAR cells:');
    console.log('    ' + line('crest ', reg.crest));
    console.log('    ' + line('valley', reg.valley));
    console.log('    ' + line('bulk  ', reg.bulk));
    console.log('  FORCED 2:1 TRANSITION cells (mid-edge — the new risk):');
    console.log('    ' + line('crest ', trans.crest));
    console.log('    ' + line('valley', trans.valley));
    console.log('    ' + line('bulk  ', trans.bulk));
    console.log(`  WORST regular ${worstReg.toFixed(2)}deg | WORST transition ${worstTrans.toFixed(2)}deg`);
    console.log('======================================================================\n');
    /* eslint-enable no-console */

    const allRegN = reg.crest.vals.length + reg.valley.vals.length + reg.bulk.vals.length;
    expect(allRegN).toBeGreaterThan(1000);
    // Hard gate: NO sliver below 15° anywhere, regular OR transition.
    expect(worstReg).toBeGreaterThan(15);
    expect(worstTrans).toBeGreaterThan(15);
  });
});
