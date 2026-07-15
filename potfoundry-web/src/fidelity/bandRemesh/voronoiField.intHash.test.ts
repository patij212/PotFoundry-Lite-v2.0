/**
 * voronoiField.intHash.test.ts — the Voronoi web SDF must use the SHIPPING hash.
 *
 * `voronoiField.voronoiSdf` replicates the Voronoi web `f2−f1` field and MUST match
 * the surface the mesher actually raises. Commit 03948af8 (E-2026-07-10-INTHASH-SWAP)
 * swapped the production Voronoi hash to the integer-exact PCG2D chain in styles.ts
 * (rOuterVoronoi) and styles.wgsl (style_voronoi), and the analytic reference
 * FeatureLineGraph.ts voronoiWebField was re-synced to it. This module is the last
 * copy: if it still uses the OLD float hash it traces a STALE cell layout, so the
 * bandRemesh rails would land on creases the surface no longer has.
 *
 * These tests pin voronoiSdf to the integer hash (RED while stale, GREEN once synced)
 * and separately MEASURE how far the old float hash diverges from the shipping hash.
 */
/* eslint-disable no-console */
import { describe, it, expect } from 'vitest';
import { voronoiSdf } from './voronoiField';

const fract = (x: number): number => x - Math.floor(x);

// OLD float hash — the pre-swap chain (what a stale voronoiSdf uses).
function hash22Old(px: number, py: number): [number, number] {
  let p3x = fract(px * 0.1031);
  let p3y = fract(py * 0.103);
  let p3z = fract(px * 0.0973);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d;
  p3y += d;
  p3z += d;
  return [fract((p3x + p3y) * p3z), fract((p3x + p3z) * p3y)];
}

// NEW integer PCG2D — verbatim from styles.ts (post-swap, the shipping surface hash).
function pcg2dHash(vx: number, vy: number): { x: number; y: number } {
  let x = vx >>> 0;
  let y = vy >>> 0;
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  return { x: x >>> 0, y: y >>> 0 };
}
function u32ToUnitFloat(h: number): number {
  return (h >>> 8) * 2 ** -24;
}
function hash22Int(cx: number, cy: number): [number, number] {
  const seeded = pcg2dHash((cx + 0x9e3779b1) >>> 0, (cy + 0x85ebca77) >>> 0);
  return [u32ToUnitFloat(seeded.x), u32ToUnitFloat(seeded.y)];
}

/** Reference `f2−f1` mirroring voronoiSdf exactly, hash + wrap swappable. */
function refSdf(uWall: number, t: number, p: Float32Array, useInt: boolean): number {
  const scale = p[0] > 0 ? p[0] : 8;
  const jitter = p[1];
  const stretch = p[5] > 0 ? p[5] : 1;
  const pulse = p[6];
  const periodXInt = Math.max(1, Math.round(scale));
  const uAnim = uWall * scale + pulse * scale;
  const v = t * scale * stretch;
  const cellIdX = Math.floor(uAnim);
  const cellIdY = Math.floor(v);
  const cuX = fract(uAnim);
  const cuY = fract(v);
  let f1 = 999;
  let f2 = 999;
  for (let ny = -1; ny <= 1; ny++) {
    for (let nx = -1; nx <= 1; nx++) {
      const nidX = cellIdX + nx;
      const nidY = cellIdY + ny;
      const h = useInt
        ? hash22Int(((nidX % periodXInt) + periodXInt) % periodXInt, nidY)
        : hash22Old(((nidX % scale) + scale) % scale, nidY);
      const dx = nx + h[0] * jitter - cuX;
      const dy = ny + h[1] * jitter - cuY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < f1) { f2 = f1; f1 = dist; } else if (dist < f2) { f2 = dist; }
    }
  }
  return f2 - f1;
}

// Integer scales so the periodic wrap is identical across hashes → the HASH is the
// only variable isolated by these tests.
function params(scale: number, jitter: number, stretch: number, pulse: number): Float32Array {
  const p = new Float32Array(8);
  p[0] = scale; p[1] = jitter; p[2] = 0.1; p[5] = stretch; p[6] = pulse;
  return p;
}
const PARAM_SETS: Array<[string, Float32Array]> = [
  ['default (scale8,jit0.8)', params(8, 0.8, 1, 0)],
  ['scale6,jit0.6,stretch1.5,pulse0.25', params(6, 0.6, 1.5, 0.25)],
  ['scale12,jit0.9,pulse0.5', params(12, 0.9, 1, 0.5)],
];
const RES_U = 200;
const RES_T = 160;

describe('voronoiField hash sync (03948af8 INTHASH-SWAP)', () => {
  it('MEASUREMENT: the old float hash traces a materially DIFFERENT web than the shipping integer hash', () => {
    const [, p] = PARAM_SETS[0];
    let diffCount = 0, total = 0, maxDiff = 0;
    for (let j = 0; j <= RES_T; j++) {
      const t = j / RES_T;
      for (let i = 0; i < RES_U; i++) {
        const u = i / RES_U;
        const d = Math.abs(refSdf(u, t, p, false) - refSdf(u, t, p, true));
        if (d > 1e-6) diffCount++;
        if (d > maxDiff) maxDiff = d;
        total++;
      }
    }
    const frac = diffCount / total;
    console.log(`old-vs-int f2−f1 divergence: ${(100 * frac).toFixed(1)}% of ${total} pts differ >1e-6; maxDiff=${maxDiff.toFixed(4)}`);
    // The two hashes seed cells differently → the webs are materially distinct.
    expect(frac).toBeGreaterThan(0.3);
  });

  it('voronoiSdf equals the shipping integer-PCG2D f2−f1 (bit-for-bit) across param sets', () => {
    let worst = 0;
    let worstLabel = '';
    for (const [label, p] of PARAM_SETS) {
      let maxDiff = 0;
      for (let j = 0; j <= RES_T; j++) {
        const t = j / RES_T;
        for (let i = 0; i < RES_U; i++) {
          const u = i / RES_U;
          const diff = Math.abs(voronoiSdf(u, t, p) - refSdf(u, t, p, true));
          if (diff > maxDiff) maxDiff = diff;
        }
      }
      console.log(`  ${label}: max|voronoiSdf − intRef| = ${maxDiff.toExponential(3)}`);
      if (maxDiff > worst) { worst = maxDiff; worstLabel = label; }
    }
    console.log(`worst param set: ${worstLabel} @ ${worst.toExponential(3)}`);
    expect(worst).toBeLessThan(1e-9);
  });
});
