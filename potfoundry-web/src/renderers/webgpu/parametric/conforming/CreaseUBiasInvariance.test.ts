/**
 * CreaseUBiasInvariance.test.ts — the crease FEATURE coverage must be invariant to
 * the anisotropy bias B (GATE B of computeUBias, which fires at default dims).
 *
 * ROOT CAUSE (measured): under a bias B>0 the u-driven SQUARE quadtree refinement
 * reaches the sizing target B levels SHALLOWER (`physW = √E/2^(level+B)` meets the
 * target earlier), so a sharp crease's column/row loses ~half its t-rows per bias
 * level → coverage drops below `minCoverage` → the crease is reported DROPPED, even
 * though the warp still pins a real, continuous edge there.
 *
 * THE FIX: pass the warp-pinned crease loci as `outerCreaseLines` (REFINE-ONLY,
 * never CDT-inserted). Cells those loci cross are size-tested with the BIAS-FREE
 * u-width (1/2^level, i.e. as if B=0), restoring exactly the t-rows the bias
 * stripped — and ONLY on the crease cells, so the rest of the wall keeps the bias's
 * triangle-quality win. The crease stays watertight by construction (no weld /
 * repair / T-junction pass).
 *
 * The refine lines are produced by the PRODUCTION builder {@link buildCreaseRefineLines}
 * so these tests exercise the real path. They cover the THREE hard cases the prior
 * warp-anchor-only builder missed:
 *  1. a VERTICAL crease that is ALREADY dyadic (GeometricStar folds at (2k+1)/16):
 *     the warp is identity, so it carried NO anchor — yet the column still loses
 *     its t-rows under B>0 and must be refined;
 *  2. a SEAM (u=0) vertical crease (GothicArches column[k=0]): dropped from the
 *     warp anchors (φ(0)=0 fixed), but its iu=0 cells still need bias-free refine;
 *  3. a HORIZONTAL band near a BOUNDARY (BambooSegments node-ring k=1/k=4): the
 *     band needs a real mesh t-row spanning all u, which uBias's t-coarsening
 *     removes near t=0/t=1 — the bias-free refine forces the square splits back.
 */
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from './SurfaceSampler';
import { assembleWatertight, type AssemblyDimensions } from './WatertightAssembly';
import {
  measureFeatureResolution,
  buildCreaseRefineLines,
  type FeatureLine,
  type FeatureLineGraph,
} from './FeatureLineGraph';
import { chooseCreaseGrid, applyUWarp } from './CreaseUWarp';
import { chooseCreaseTGrid, applyTWarp } from './CreaseTWarp';

/**
 * Heavy wall-build ceiling. Each case assembles several full conforming pots
 * (~2–3 s in isolation) but can spill past vitest's 5 s default under parallel
 * suite load — a pure timeout flake, not a regression (mirrors the existing
 * ConformingWall heavy-build tests). The fast assertions still run inside it.
 */
const HEAVY_BUILD_TIMEOUT_MS = 30_000;

/**
 * A cylinder wall carrying `k` sharp, full-height vertical creases (a narrow
 * Gaussian-in-u radius ridge at each locus — high √E curvature, smooth in t),
 * mirroring a Gothic-columns style. The inner wall is a smooth constant offset.
 */
function creaseWall(
  R: number, H: number, tBottom: number, creases: number[], amp: number, sigma: number, surfaceId: number,
): SurfaceSampler {
  return {
    position: (u: number, t: number): Vec3 => {
      const theta = 2 * Math.PI * (u - Math.floor(u));
      let bump = 0;
      if (surfaceId < 0.5) {
        for (const uc of creases) {
          let du = (u - uc) % 1;
          if (du > 0.5) du -= 1;
          if (du < -0.5) du += 1;
          bump += amp * Math.exp(-(du * du) / (2 * sigma * sigma));
        }
      }
      const r = R + bump;
      const z = surfaceId < 0.5 ? t * H : tBottom + t * (H - tBottom);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
}

/**
 * A cylinder wall carrying `m` sharp HORIZONTAL ring creases (a narrow Gaussian-in-t
 * radius ridge at each t-locus — high √G curvature, smooth in u), mirroring a
 * BambooSegments node-ring style. Inner wall is a smooth constant offset.
 */
function bandWall(
  R: number, H: number, tBottom: number, bands: number[], amp: number, sigma: number, surfaceId: number,
): SurfaceSampler {
  // Fine u-striations (like BambooSegments `bs_striations`): a small sin(θ·S)
  // ripple gives the mesh DENSE u-columns so a horizontal band's coverage reflects
  // whether the t-ROW lands at the band t — not just how sparse the columns are. A
  // pure t-only band (u-smooth) leaves the mesh coarse in u, capping band coverage
  // at the column spacing regardless of the t-row, which would mask the residual.
  const STRIATIONS = 48;
  const STRI_AMP = 0.25;
  return {
    position: (u: number, t: number): Vec3 => {
      const theta = 2 * Math.PI * (u - Math.floor(u));
      let bump = STRI_AMP * Math.sin(theta * STRIATIONS);
      if (surfaceId < 0.5) {
        for (const tc of bands) {
          const dt = t - tc;
          bump += amp * Math.exp(-(dt * dt) / (2 * sigma * sigma));
        }
      }
      const r = R + bump;
      const z = surfaceId < 0.5 ? t * H : tBottom + t * (H - tBottom);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
}

const DIMS: AssemblyDimensions = { H: 150, tBottom: 7.5, rDrain: 0 };
const BASE_OPTS = {
  maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.2, gradeRatio: 2,
  maxLevel: 10, resU: 128, resT: 128, nRing: 256,
};

/** Build the vertical-crease ground-truth feature graph for a crease set. */
function verticalGraph(creases: number[]): FeatureLineGraph {
  const lines: FeatureLine[] = creases.map((uc, j) => ({
    kind: 'vertical-crease', label: `c${j}`,
    points: Array.from({ length: 33 }, (_, k) => ({ u: uc, t: k / 32 })),
  }));
  return { styleId: 'creaseProbe', lines, groundTruthCount: lines.length };
}

/** Build the horizontal-band ground-truth feature graph for a band set. */
function horizontalGraph(bands: number[]): FeatureLineGraph {
  const lines: FeatureLine[] = bands.map((tc, j) => ({
    kind: 'horizontal-band', label: `b${j}`,
    points: Array.from({ length: 33 }, (_, k) => ({ u: k / 32, t: tc })),
  }));
  return { styleId: 'bandProbe', lines, groundTruthCount: lines.length };
}

/** A VERTICAL crease's per-line coverage on the assembled, warped outer wall. */
function verticalCreaseCoverage(
  creases: number[], uBias: number, withFix: boolean, amp: number, sigma: number,
): { minCoverage: number; dropped: number; boundary: number; perLine: number[] } {
  const outer = creaseWall(60, DIMS.H, DIMS.tBottom, creases, amp, sigma, 0);
  const inner = creaseWall(56, DIMS.H, DIMS.tBottom, creases, amp, sigma, 1);
  const choice = chooseCreaseGrid(creases);
  const minUniformLevel = choice.level > 0 ? choice.level : undefined;

  // The fix: REFINE the pre-warp crease loci. Use the PRODUCTION builder so the
  // dyadic / seam columns the warp omits are still fed (the whole point).
  let outerCreaseLines: FeatureLine[] | undefined;
  if (withFix) {
    const refine = buildCreaseRefineLines(verticalGraph(creases), {
      uWarp: choice.warp,
      tWarp: { isIdentity: true, anchors: [] },
      helixWarp: { isIdentity: true, base: { isIdentity: true, anchors: [] }, shearRate: 0, offset: 0 },
    });
    outerCreaseLines = refine.length > 0 ? refine : undefined;
  }

  const asm = assembleWatertight(outer, inner, DIMS, {
    ...BASE_OPTS, uBias, minUniformLevel, outerCreaseLines,
  });
  // Apply the production u-warp (lands the pinned columns on the crease loci).
  if (!choice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      asm.vertices[i] = applyUWarp(choice.warp, asm.vertices[i]);
    }
  }

  const graph = verticalGraph(creases);
  const outerUT: { u: number; t: number }[] = [];
  for (let i = 0; i < asm.vertices.length; i += 3) {
    if (asm.vertices[i + 2] < 0.5) outerUT.push({ u: asm.vertices[i], t: asm.vertices[i + 1] });
  }
  const res = measureFeatureResolution(graph, outerUT);
  const perLine = res.perLine.map((p) => p.coverage);
  const minCoverage = Math.min(...perLine);
  const boundary = boundaryEdges(asm.vertices, asm.indices, outer, inner, DIMS);
  return { minCoverage, dropped: res.dropped, boundary, perLine };
}

/**
 * The horizontal-band harness uses an OPEN base (rDrain>0). A SOLID base
 * (rDrain=0) collapses the bottom cap to a degenerate centre axis where dozens of
 * near-(0,0,z) vertices sit within the 1e-4 position-weld tolerance — the weld
 * then flickers (boundary count 0↔4) on float jitter, which is a TEST-PROBE
 * artifact at the axis, not a production crack (the assembler shares the centre by
 * INDEX). The drain annulus removes the axis so the position-weld is stable; it
 * does not affect the wall mesh the band-coverage test measures.
 */
const BAND_DIMS: AssemblyDimensions = { H: 150, tBottom: 7.5, rDrain: 5 };

/** A HORIZONTAL band's per-line coverage on the assembled, t-warped outer wall. */
function horizontalBandCoverage(
  bands: number[], uBias: number, withFix: boolean, amp: number, sigma: number,
): { minCoverage: number; dropped: number; boundary: number; perLine: number[] } {
  const outer = bandWall(60, BAND_DIMS.H, BAND_DIMS.tBottom, bands, amp, sigma, 0);
  const inner = bandWall(56, BAND_DIMS.H, BAND_DIMS.tBottom, bands, amp, sigma, 1);
  const tChoice = chooseCreaseTGrid(bands);
  const minUniformLevel = tChoice.level > 0 ? tChoice.level : undefined;

  let outerCreaseLines: FeatureLine[] | undefined;
  if (withFix) {
    const refine = buildCreaseRefineLines(horizontalGraph(bands), {
      uWarp: { isIdentity: true, anchors: [] },
      tWarp: tChoice.warp,
      helixWarp: { isIdentity: true, base: { isIdentity: true, anchors: [] }, shearRate: 0, offset: 0 },
    });
    outerCreaseLines = refine.length > 0 ? refine : undefined;
  }

  const asm = assembleWatertight(outer, inner, BAND_DIMS, {
    ...BASE_OPTS, uBias, minUniformLevel, outerCreaseLines,
  });
  // Apply the production t-warp to WALL vertices only (surfaceId 0/1), landing the
  // pinned full-width rows on the band loci. Caps reuse t as a radial parameter.
  if (!tChoice.warp.isIdentity) {
    for (let i = 0; i < asm.vertices.length; i += 3) {
      if (asm.vertices[i + 2] < 1.5) {
        asm.vertices[i + 1] = applyTWarp(tChoice.warp, asm.vertices[i + 1]);
      }
    }
  }

  const graph = horizontalGraph(bands);
  const outerUT: { u: number; t: number }[] = [];
  for (let i = 0; i < asm.vertices.length; i += 3) {
    if (asm.vertices[i + 2] < 0.5) outerUT.push({ u: asm.vertices[i], t: asm.vertices[i + 1] });
  }
  const res = measureFeatureResolution(graph, outerUT);
  const perLine = res.perLine.map((p) => p.coverage);
  const minCoverage = Math.min(...perLine);
  const boundary = boundaryEdges(asm.vertices, asm.indices, outer, inner, BAND_DIMS);
  return { minCoverage, dropped: res.dropped, boundary, perLine };
}

/** Count boundary (singly-used) welded edges — 0 ⇒ watertight. */
function boundaryEdges(
  packed: Float32Array, indices: Uint32Array,
  outer: SurfaceSampler, inner: SurfaceSampler, dims: AssemblyDimensions,
): number {
  const n = packed.length / 3;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = packed[i * 3];
    const t = packed[i * 3 + 1];
    const s = packed[i * 3 + 2];
    let p: Vec3;
    if (s < 0.5) p = outer.position(u, t);
    else if (s < 1.5) p = inner.position(u, t);
    else {
      // Caps: place analytically (radial lerp), matching evalPos in the assembler.
      const theta = 2 * Math.PI * (u - Math.floor(u));
      const rOTop = Math.hypot(...outer.position(u, 1));
      const rOBot = Math.hypot(...outer.position(u, 0));
      const rITop = Math.hypot(...inner.position(u, 1));
      const rIBot = Math.hypot(...inner.position(u, 0));
      let r: number; let z: number;
      if (s < 2.5) { r = rITop + (rOTop - rITop) * t; z = dims.H; }
      else if (s < 3.5) { r = rOBot + (dims.rDrain - rOBot) * t; z = 0; }
      else if (s < 4.5) { r = rIBot + (dims.rDrain - rIBot) * t; z = dims.tBottom; }
      else { r = dims.rDrain; z = t * dims.tBottom; }
      p = [r * Math.cos(theta), r * Math.sin(theta), z];
    }
    pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2];
  }
  const inv = 1 / 1e-4;
  const remap = new Uint32Array(n);
  const buckets = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * inv)},${Math.round(pos[i * 3 + 1] * inv)},${Math.round(pos[i * 3 + 2] * inv)}`;
    const ex = buckets.get(key);
    if (ex === undefined) { buckets.set(key, i); remap[i] = i; } else remap[i] = ex;
  }
  const uses = new Map<string, number>();
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [remap[indices[t]], remap[indices[t + 1]], remap[indices[t + 2]]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e]; const b = tri[(e + 1) % 3];
      if (a === b) continue;
      const k = a < b ? `${a}:${b}` : `${b}:${a}`;
      uses.set(k, (uses.get(k) ?? 0) + 1);
    }
  }
  let boundary = 0;
  for (const v of uses.values()) if (v === 1) boundary++;
  return boundary;
}

describe('crease t-coverage is anisotropy-bias (uBias) invariant', () => {
  // 12 evenly-spaced non-dyadic creases (Gothic-columns proxy), moderate relief.
  const creases = Array.from({ length: 12 }, (_, k) => (k + 0.5) / 12);
  const amp = 0.4;
  const sigma = 0.03;

  it('B=0 baseline: every crease resolved (dropped=0), watertight', () => {
    const r = verticalCreaseCoverage(creases, 0, false, amp, sigma);
    expect(r.dropped).toBe(0);
    expect(r.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);

  it('REGRESSION (documented): B=1 WITHOUT the crease-refine fix drops creases', () => {
    const b0 = verticalCreaseCoverage(creases, 0, false, amp, sigma);
    const b1 = verticalCreaseCoverage(creases, 1, false, amp, sigma);
    // The bias strips crease t-rows → coverage falls below B=0 and below threshold.
    expect(b1.minCoverage).toBeLessThan(b0.minCoverage);
    expect(b1.dropped).toBeGreaterThan(0);
    expect(b1.boundary).toBe(0); // still watertight even while under-covered
  }, HEAVY_BUILD_TIMEOUT_MS);

  it('FIX: B=1 WITH outerCreaseLines restores coverage to the B=0 case, watertight', () => {
    const b0 = verticalCreaseCoverage(creases, 0, false, amp, sigma);
    const b1fix = verticalCreaseCoverage(creases, 1, true, amp, sigma);
    // Coverage is restored to (at least) the B=0 baseline — bias-invariant.
    expect(b1fix.dropped).toBe(0);
    expect(b1fix.minCoverage).toBeGreaterThanOrEqual(b0.minCoverage - 1e-9);
    expect(b1fix.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);
});

describe('SEAM (u=0) vertical crease is uBias-invariant (GothicArches column[k=0])', () => {
  // Creases at k/12 INCLUDING k=0 (the u=0 seam column) plus the (k+0.5)/12
  // mullions — the full Gothic vertical set. The k=0 seam column is dropped from
  // the u-warp anchors (φ(0)=0 fixed), so the prior warp-anchor-only builder never
  // refined it → it stayed stuck under B>0 while every other column resolved.
  const creases = [
    ...Array.from({ length: 12 }, (_, k) => k / 12),         // columns (k=0 ⇒ u=0 seam)
    ...Array.from({ length: 12 }, (_, k) => (k + 0.5) / 12), // mullions
  ];
  const amp = 0.4;
  const sigma = 0.03;

  it('REGRESSION (documented): WITHOUT the fix the seam column drops below B=0 at B=1', () => {
    const b0 = verticalCreaseCoverage(creases, 0, false, amp, sigma);
    const b1 = verticalCreaseCoverage(creases, 1, false, amp, sigma);
    // The seam column (perLine[0] ⇒ u=0) loses coverage under the bias (its t-rows
    // are stripped) and gets NO refine line in the production warp-anchor set (φ(0)=0
    // fixed ⇒ dropped), so it regresses below its B=0 coverage. Watertight throughout.
    expect(b1.perLine[0]).toBeLessThan(b0.perLine[0] - 1e-9);
    expect(b1.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);

  it('FIX: the seam column is FULLY restored to the B=0 level at B=1 (uBias-invariant), watertight', () => {
    const b0 = verticalCreaseCoverage(creases, 0, false, amp, sigma);
    const b1fix = verticalCreaseCoverage(creases, 1, true, amp, sigma);
    // Nothing dropped, and the seam column (perLine[0]) is restored to AT LEAST its
    // B=0 coverage — the bias-free refinement fully (not approximately) restores the
    // B=0 level, so it is no longer the outlier (matches the best-resolved column).
    expect(b1fix.dropped).toBe(0);
    expect(b1fix.perLine[0]).toBeGreaterThanOrEqual(b0.perLine[0] - 1e-9);
    expect(b1fix.perLine[0]).toBeGreaterThanOrEqual(Math.max(...b1fix.perLine) - 1e-9);
    expect(b1fix.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);
});

describe('DYADIC vertical creases are uBias-invariant (GeometricStar folds)', () => {
  // GeometricStar N=8: folds at (k+0.5)/8 = (2k+1)/16 — EXACTLY dyadic. chooseCreaseGrid
  // returns identity (already on-lattice), so the prior warp-anchor-only builder fed
  // NOTHING — every fold dropped under B>0 even though a full-height column exists.
  const creases = Array.from({ length: 8 }, (_, k) => (k + 0.5) / 8);
  const amp = 0.4;
  const sigma = 0.03;

  it('REGRESSION: B=1 WITHOUT the fix drops the dyadic folds (identity warp ⇒ no refine line)', () => {
    const choice = chooseCreaseGrid(creases);
    expect(choice.warp.isIdentity).toBe(true); // dyadic ⇒ no warp, yet still needs refine
    const b1 = verticalCreaseCoverage(creases, 1, false, amp, sigma);
    expect(b1.dropped).toBeGreaterThan(0);
    expect(b1.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);

  it('FIX: all 8 dyadic folds restored to the B=0 level at B=1 (identity warp), watertight', () => {
    const b0 = verticalCreaseCoverage(creases, 0, false, amp, sigma);
    const b1fix = verticalCreaseCoverage(creases, 1, true, amp, sigma);
    // Even though chooseCreaseGrid is identity (no warp), buildCreaseRefineLines
    // still feeds the dyadic columns → bias-free refinement fully restores them to
    // (at least) the B=0 coverage. Nothing dropped, watertight.
    expect(b1fix.dropped).toBe(0);
    expect(b1fix.minCoverage).toBeGreaterThanOrEqual(b0.minCoverage - 1e-9);
    expect(b1fix.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);
});

describe('HORIZONTAL bands near a boundary are uBias-invariant (BambooSegments node-rings)', () => {
  // BambooSegments node_count=5: interior bands at t=k/5 for k=1..4 (0.2/0.4/0.6/0.8).
  // The two BOUNDARY-ADJACENT bands (t=0.2 near t=0, t=0.8 near t=1) regress under
  // B>0 (uBias's t-coarsening removes their row); the two interior bands stay 1.0.
  const bands = [0.2, 0.4, 0.6, 0.8];
  const amp = 0.5;
  const sigma = 0.02;

  it('B=0 baseline: every band fully resolved (coverage 1.0), watertight', () => {
    const r = horizontalBandCoverage(bands, 0, false, amp, sigma);
    expect(r.dropped).toBe(0);
    expect(r.minCoverage).toBeGreaterThanOrEqual(0.99); // every band fully covered
    expect(r.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);

  it('REGRESSION (documented): B=1 WITHOUT the fix loses band coverage vs B=0', () => {
    const b0 = horizontalBandCoverage(bands, 0, false, amp, sigma);
    const b1 = horizontalBandCoverage(bands, 1, false, amp, sigma);
    // The bias's t-coarsening strips the source-row t-subdivision → every band's
    // coverage falls below the B=0 baseline (watertight throughout).
    expect(b1.minCoverage).toBeLessThan(b0.minCoverage - 0.05);
    expect(b1.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);

  it('FIX: B=1 WITH horizontal crease-refine fully restores all bands to the B=0 level, watertight', () => {
    const b0 = horizontalBandCoverage(bands, 0, false, amp, sigma);
    const b1fix = horizontalBandCoverage(bands, 1, true, amp, sigma);
    // Every band — including the BOUNDARY-ADJACENT ones (perLine[0]=t0.2,
    // perLine[3]=t0.8) — is restored to (at least) its B=0 coverage WITH MARGIN
    // (fully covered, not borderline), and nothing is dropped.
    expect(b1fix.dropped).toBe(0);
    expect(b1fix.minCoverage).toBeGreaterThanOrEqual(b0.minCoverage - 1e-9);
    expect(b1fix.minCoverage).toBeGreaterThanOrEqual(0.99);
    expect(b1fix.boundary).toBe(0);
  }, HEAVY_BUILD_TIMEOUT_MS);
});
