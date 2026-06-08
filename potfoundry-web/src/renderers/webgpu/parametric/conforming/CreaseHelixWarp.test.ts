/**
 * Tests for the topology-preserving HELICAL u-warp that bends full-height mesh
 * columns into constant-slope diagonal (helical) creases — the SpiralRidges
 * member of the warp family.
 *
 * The map is u_final(u,t) = φ₀(u) − (turns/k)·t (mod 1). The load-bearing
 * invariants (what keeps the mesh watertight/oriented/non-inverted):
 *  - at EVERY fixed t it is a strictly-monotone circle bijection in u,
 *  - it is periodic in u (u and u+1 map consistently),
 *  - a full-height column lands EXACTLY on each helix locus u_c(t),
 *  - it REFUSES (identity) when the k base columns cannot be pinned cleanly.
 */
import { describe, it, expect } from 'vitest';
import { chooseHelixGrid, applyHelixWarp, type HelixWarp } from './CreaseHelixWarp';

/** Periodic distance in u∈[0,1). */
function uDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

const K_SPIRAL = 9;
const TURNS_SPIRAL = 1.15;
const PHASE_DEFAULT = 0.25 / K_SPIRAL;

/** The c-th helix locus at row t: u = (phaseU + c − turns·t)/k (mod 1). */
function helixU(c: number, t: number, k = K_SPIRAL, turns = TURNS_SPIRAL, phaseU = PHASE_DEFAULT): number {
  let u = (phaseU + c - turns * t) / k;
  u %= 1;
  if (u < 0) u += 1;
  return u;
}

describe('chooseHelixGrid — degenerate / refusal cases', () => {
  it('k<1 or non-finite → identity', () => {
    expect(chooseHelixGrid(0, 1).warp.isIdentity).toBe(true);
    expect(chooseHelixGrid(Number.NaN, 1).warp.isIdentity).toBe(true);
  });

  it('turns≈0 (vertical ridges, not helical) → identity (u-warp territory)', () => {
    const choice = chooseHelixGrid(9, 0);
    expect(choice.warp.isIdentity).toBe(true);
    expect(choice.grid).toBe(0);
  });

  it('too many ridges to pin on K≤2^maxLevel distinct columns → identity', () => {
    // 200 ridges can never land on distinct columns for K≤64 ⇒ refuse.
    const choice = chooseHelixGrid(200, 1.0, undefined, 3, 6);
    expect(choice.warp.isIdentity).toBe(true);
    expect(choice.grid).toBe(0);
  });
});

describe('chooseHelixGrid — SpiralRidges defaults (k=9, turns=1.15)', () => {
  const choice = chooseHelixGrid(K_SPIRAL, TURNS_SPIRAL);

  it('produces a non-identity warp with shearRate = turns/k', () => {
    expect(choice.warp.isIdentity).toBe(false);
    expect(choice.warp.shearRate).toBeCloseTo(TURNS_SPIRAL / K_SPIRAL, 12);
  });

  it('forces a power-of-two floor that hosts k distinct seam-avoiding columns', () => {
    // The (c+½)/9 anchors snap to 9 distinct non-seam columns already at K=16.
    expect(choice.grid).toBeGreaterThanOrEqual(16);
    expect(choice.level).toBe(Math.round(Math.log2(choice.grid)));
  });
});

describe('applyHelixWarp — pins a full-height column EXACTLY onto each helix', () => {
  const choice = chooseHelixGrid(K_SPIRAL, TURNS_SPIRAL);
  const warp = choice.warp;

  it('the seam-avoiding anchor column (c+½)/k warps EXACTLY onto ridge c at every t', () => {
    // Each ridge is pinned by an EXACT full-height column (no seam approximation),
    // because the anchors (c+½)/k avoid the seam and the constant offset slides
    // them onto the true ridge phase.
    const grid = choice.grid;
    for (let c = 0; c < K_SPIRAL; c++) {
      const anchor = ((c + 0.5) / K_SPIRAL) % 1;
      const col = Math.round(anchor * grid) % grid;
      const srcU = col / grid;
      for (const t of [0, 0.13, 0.37, 0.5, 0.71, 0.99, 1]) {
        const got = applyHelixWarp(warp, srcU, t);
        expect(uDist(got, helixU(c, t))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('applyHelixWarp — topology invariants (the load-bearing properties)', () => {
  const warp = chooseHelixGrid(K_SPIRAL, TURNS_SPIRAL).warp;

  it('is strictly monotone in u at EVERY fixed t (no triangle inversion within a row)', () => {
    for (const t of [0, 0.2, 0.5, 0.8, 1]) {
      // Walk u around the circle; the warped value must increase monotonically
      // modulo a SINGLE wrap (it is a circle homeomorphism, so exactly one
      // descent as it wraps through the seam).
      let descents = 0;
      let prev = applyHelixWarp(warp, 0, t);
      for (let i = 1; i <= 4000; i++) {
        const u = i / 4000;
        const w = applyHelixWarp(warp, u, t);
        if (w < prev - 1e-9) descents++;
        prev = w;
      }
      // At most one wrap-around descent ⇒ injective on the circle.
      expect(descents).toBeLessThanOrEqual(1);
    }
  });

  it('preserves the u-ORDER of distinct vertices within a row (orientation-safe)', () => {
    // Pick a fixed t and a set of inputs; their cyclic order must be preserved.
    const t = 0.43;
    const us = [0.0, 0.07, 0.18, 0.29, 0.44, 0.61, 0.77, 0.9, 0.985];
    const ws = us.map((u) => applyHelixWarp(warp, u, t));
    // The sequence of warped values, read cyclically, must be strictly increasing
    // with exactly one wrap. Equivalent: rotating to start at the min yields a
    // sorted ascending list.
    const minIdx = ws.indexOf(Math.min(...ws));
    const rotated = [...ws.slice(minIdx), ...ws.slice(0, minIdx)];
    for (let i = 1; i < rotated.length; i++) {
      expect(rotated[i]).toBeGreaterThan(rotated[i - 1]);
    }
  });

  it('is periodic in u: u and u+1 map to the same point (mod 1)', () => {
    for (const t of [0, 0.33, 0.66, 1]) {
      for (const u of [0.1, 0.37, 0.62, 0.88]) {
        expect(uDist(applyHelixWarp(warp, u, t), applyHelixWarp(warp, u + 1, t))).toBeLessThan(1e-9);
      }
    }
  });

  it('inter-row shear is small relative to column spacing (well clear of inversion)', () => {
    // Over one mesh row (Δt = 1/256), the rigid rotation shifts u by
    // shearRate/256 ≪ the 1/9 ridge spacing — a sanity bound on the shear.
    const dtRow = 1 / 256;
    const shift = (warp as HelixWarp).shearRate * dtRow;
    expect(shift).toBeLessThan((1 / K_SPIRAL) * 0.05);
  });

  it('identity warp is a pure pass-through', () => {
    const id = chooseHelixGrid(0, 1).warp;
    for (const t of [0, 0.5, 1]) {
      for (const u of [0, 0.25, 0.5, 0.99]) {
        expect(applyHelixWarp(id, u, t)).toBeCloseTo(u, 12);
      }
    }
  });
});
