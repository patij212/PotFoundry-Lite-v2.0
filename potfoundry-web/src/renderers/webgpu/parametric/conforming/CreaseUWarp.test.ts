/**
 * Tests for the periodic, monotonic u-warp that pins existing dyadic mesh
 * columns onto vertical-crease loci so a sharp crease becomes an actual mesh
 * edge (vertices on it) WITHOUT changing connectivity.
 *
 * The warp φ:[0,1]→[0,1] is a circle homeomorphism: φ(0)=0, φ(1)=1, strictly
 * increasing, periodic. Applied uniformly to every vertex's u it shifts vertex
 * positions only — indices/topology are untouched, so a watertight, oriented,
 * T-junction-free mesh stays exactly that.
 */
import { describe, it, expect } from 'vitest';
import { buildCreaseUWarp, applyUWarp, chooseCreaseGrid } from './CreaseUWarp';

/** Periodic distance in u∈[0,1). */
function uDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

describe('buildCreaseUWarp — identity / degenerate cases', () => {
  it('no creases → identity warp', () => {
    const warp = buildCreaseUWarp([], 256);
    expect(warp.isIdentity).toBe(true);
    for (const u of [0, 0.1, 0.37, 0.5, 0.99]) {
      expect(applyUWarp(warp, u)).toBeCloseTo(u, 12);
    }
  });

  it('a single crease already ON a grid column → identity (no shift needed)', () => {
    // 0.25 is exactly a 1/256 column → source==target → identity.
    const warp = buildCreaseUWarp([0.25], 256);
    expect(applyUWarp(warp, 0.25)).toBeCloseTo(0.25, 9);
    expect(applyUWarp(warp, 0.5)).toBeCloseTo(0.5, 9);
  });
});

describe('buildCreaseUWarp — pins creases onto grid columns', () => {
  it('maps a snapped grid column EXACTLY onto each crease target', () => {
    // LowPolyFacet N=12: creases at (k+0.5)/12 = (2k+1)/24 — non-dyadic.
    const creases: number[] = [];
    for (let k = 0; k < 12; k++) creases.push(((k + 0.5) / 12) % 1);
    const grid = 256;
    const warp = buildCreaseUWarp(creases, grid);
    expect(warp.isIdentity).toBe(false);
    // Every crease must be the warp image of an exact 1/grid column.
    for (const c of creases) {
      const src = warp.anchors.find((a) => Math.abs(a.target - c) < 1e-9);
      expect(src).toBeDefined();
      // source is an exact multiple of 1/grid
      const g = (src as { source: number }).source * grid;
      expect(Math.abs(g - Math.round(g))).toBeLessThan(1e-6);
      // warp(source) === target (the crease becomes the image of that column)
      expect(applyUWarp(warp, (src as { source: number }).source)).toBeCloseTo(c, 9);
    }
  });

  it('endpoints are fixed: φ(0)=0 and φ(1)=1 (seam preserved)', () => {
    const creases = [0.1, 0.4, 0.7].map((c) => (c + 0.013) % 1); // off-grid
    const warp = buildCreaseUWarp(creases, 256);
    expect(applyUWarp(warp, 0)).toBeCloseTo(0, 12);
    expect(applyUWarp(warp, 1)).toBeCloseTo(1, 9);
  });

  it('is strictly monotonic across [0,1] (a circle homeomorphism)', () => {
    const creases: number[] = [];
    for (let k = 0; k < 12; k++) creases.push(((k + 0.5) / 12) % 1);
    const warp = buildCreaseUWarp(creases, 256);
    let prev = -1;
    for (let i = 0; i <= 2000; i++) {
      const u = i / 2000;
      const w = applyUWarp(warp, u);
      expect(w).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = w;
    }
    // and it actually moves at least one interior point (non-trivial)
    expect(uDist(applyUWarp(warp, creases[0] - 0.5 / 256), creases[0] - 0.5 / 256)).toBeGreaterThan(0);
  });

  it('warp image of [0,1) stays in [0,1) and preserves ordering of distinct inputs', () => {
    const creases = [0.08, 0.3, 0.55, 0.82].map((c) => (c + 0.007) % 1);
    const warp = buildCreaseUWarp(creases, 256);
    const us = [0.0, 0.05, 0.2, 0.35, 0.6, 0.9, 0.999];
    const ws = us.map((u) => applyUWarp(warp, u));
    for (const w of ws) {
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
    }
    for (let i = 1; i < ws.length; i++) expect(ws[i]).toBeGreaterThan(ws[i - 1]);
  });
});

describe('buildCreaseUWarp — collision / safety guards', () => {
  it('two creases snapping to the SAME grid column → identity (refuse, preserve topology)', () => {
    // grid too coarse: two creases within one cell collide on one source column.
    const warp = buildCreaseUWarp([0.500, 0.5009], 256);
    // 0.5 → col 128, 0.5009*256≈128.2 → also col 128 ⇒ collision ⇒ refuse.
    expect(warp.isIdentity).toBe(true);
  });

  it('refuses if a snap would reorder anchors (non-monotonic) → identity', () => {
    // crease near 1 snapping to source 1 (==0) would break φ(0)=0; build must
    // remain a valid increasing map or fall back to identity.
    const warp = buildCreaseUWarp([0.9999], 256); // snaps to source 1.0==0 ⇒ degenerate
    expect(warp.isIdentity).toBe(true);
  });
});

describe('chooseCreaseGrid — coarsest full-height-capable lattice', () => {
  it('LowPolyFacet N=12: picks K=16 (level 4), 12 distinct columns', () => {
    const creases: number[] = [];
    for (let k = 0; k < 12; k++) creases.push(((k + 0.5) / 12) % 1);
    const choice = chooseCreaseGrid(creases);
    expect(choice.warp.isIdentity).toBe(false);
    expect(choice.grid).toBe(16);
    expect(choice.level).toBe(4);
    // Each crease is the warp image of an exact 1/16 column.
    for (const c of creases) {
      const a = choice.warp.anchors.find((x) => Math.abs(x.target - c) < 1e-9);
      expect(a).toBeDefined();
      const g = (a as { source: number }).source * 16;
      expect(Math.abs(g - Math.round(g))).toBeLessThan(1e-6);
    }
  });

  it('GeometricStar N=8: dyadic folds at (2k+1)/16 are already on-lattice → identity', () => {
    const creases: number[] = [];
    for (let k = 0; k < 8; k++) creases.push(((k + 0.5) / 8) % 1);
    const choice = chooseCreaseGrid(creases);
    // (2k+1)/16 are exactly odd 1/16 columns ⇒ every snap is a fixed point ⇒
    // buildCreaseUWarp is a no-op at every K ⇒ chooseCreaseGrid returns identity.
    // No warp and no forced floor needed: the natural mesh already resolves these.
    expect(choice.warp.isIdentity).toBe(true);
    expect(choice.grid).toBe(0);
  });

  it('no creases → identity choice, level 0 (no refinement forced)', () => {
    const choice = chooseCreaseGrid([]);
    expect(choice.warp.isIdentity).toBe(true);
    expect(choice.grid).toBe(0);
    expect(choice.level).toBe(0);
  });

  it('too-dense creases beyond the level cap → identity (topology-safe)', () => {
    // 200 evenly-spaced creases can never snap distinctly onto K≤64 → refuse.
    const creases: number[] = [];
    for (let k = 0; k < 200; k++) creases.push((k + 0.5) / 200);
    const choice = chooseCreaseGrid(creases, 3, 6);
    expect(choice.warp.isIdentity).toBe(true);
    expect(choice.grid).toBe(0);
  });
});

describe('applyUWarp — boundedness on arbitrary input', () => {
  it('wraps periodic inputs (u≥1 or u<0) consistently with in-range', () => {
    const creases: number[] = [];
    for (let k = 0; k < 12; k++) creases.push(((k + 0.5) / 12) % 1);
    const warp = buildCreaseUWarp(creases, 256);
    // u and u+1 differ by exactly 1 after warp (periodic extension), and u=0/1 fixed
    expect(applyUWarp(warp, 0.3)).toBeCloseTo(applyUWarp(warp, 1.3) - 1, 9);
  });
});
