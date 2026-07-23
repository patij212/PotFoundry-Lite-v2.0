// smoothGridFacetAlign.test.ts — E-2026-07-22-LOWPOLY-GRID-CLOSE, BLOCKER B (facet-aligned density).
//
// LowPolyFacet is a FACETED grid style, not a C∞ smooth one: its 12 static vertical facet edges sit at u=odd/24, so
// power-of-two columns STRADDLE them (whole-mesh MAX floors ~0.044 at the shipped-heuristic nU=1024) while columns
// that LAND on the edges — a multiple of 24 — close the flat faces at tiny nU (body 0.0037 at nU=48; the campaign
// scorecard research/exchange/_lowPolyGridClose/grid.ndjson). deriveSmoothGridDensity gains an optional `alignNU`
// lever that snaps nU to the nearest multiple of alignNU instead of forcing pow2; the production dispatch routes
// LowPolyFacet through the SAME structured-grid emitter with alignNU=24 (a FACET_GRID_ALIGN_NU map, DISJOINT from
// the 6 C∞ SMOOTH_GRID_STYLES), flag-gated default-OFF (__pfSmoothGrid) byte-identical.
import { describe, it, expect, afterEach } from 'vitest';
import {
  deriveSmoothGridDensity,
  buildSmoothGridDispatchWall,
  isSmoothGridStyle,
  isStructuredGridStyle,
  facetGridAlignNU,
  FACET_GRID_ALIGN_NU,
  SMOOTH_GRID_STYLES,
} from './index';
import { buildAnalyticRadiusFn } from '../../../../../geometry/analyticRadius';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

const H = 120, Rb = 45, Rt = 70, expn = 1.1; // production DEFAULT_DIMENSIONS (OD140/H120 tapered)
const lowPolyRA = buildAnalyticRadiusFn('LowPolyFacet', {}, { H, Rb, Rt, expn }) as unknown as AnalyticRadiusFn;

function setSmoothGrid(on: boolean): void {
  (globalThis as unknown as { __pfSmoothGrid?: boolean }).__pfSmoothGrid = on;
}
afterEach(() => {
  delete (globalThis as unknown as { __pfSmoothGrid?: boolean }).__pfSmoothGrid;
});

describe('facet-aligned smooth-grid density (Blocker B)', () => {
  it('deriveSmoothGridDensity WITHOUT alignNU keeps the power-of-two nU (existing 6-smooth behavior unchanged)', () => {
    const { nU } = deriveSmoothGridDensity(lowPolyRA, H, 0.01);
    expect(nU & (nU - 1)).toBe(0); // power of two
  });

  it('deriveSmoothGridDensity WITH alignNU=24 snaps nU to a multiple of 24 (columns land on the facet edges)', () => {
    const { nU } = deriveSmoothGridDensity(lowPolyRA, H, 0.01, { alignNU: 24 });
    expect(nU % 24).toBe(0);
    expect(nU).toBeGreaterThanOrEqual(24);
    // Facet-aligned closes the body at FAR lower nU than pow2 (which needs 8192/2.08M tris): stays well under
    // the ~1.05M-tri judge cap. (Body ≤0.01 is proven from nU=48 up in the scorecard.)
    expect(nU).toBeLessThanOrEqual(4096);
  });

  it('alignNU snaps to a genuine multiple even when clamped to bounds', () => {
    // A coarse min still yields a multiple of 24 (re-snapped after the clamp), never a raw bound like 256.
    const { nU } = deriveSmoothGridDensity(lowPolyRA, H, 0.01, { alignNU: 24, minNU: 256, maxNU: 8192 });
    expect(nU % 24).toBe(0);
  });

  it('FACET_GRID_ALIGN_NU is EMPTY — LowPolyFacet routed to OFF (mult-24 rim cannot be a pow2 nRing)', () => {
    // The facet-align MECHANISM (deriveSmoothGridDensity alignNU) is retained + tested above, but NO style uses it:
    // a facet-aligned nU is a multiple of 24 (never a power of two), yet the assembly adopts the emitter rim as the
    // inner wall's nRing which buildConformingWall requires to be a power of two ⇒ generateMesh null (2026-07-23 audit).
    // LowPolyFacet OFF already holds 0.00102mm, so it routes through the normal (OFF) path instead.
    expect([...FACET_GRID_ALIGN_NU.keys()]).toEqual([]);
    expect(facetGridAlignNU('LowPolyFacet')).toBeUndefined();
    expect(facetGridAlignNU('HarmonicRipple')).toBeUndefined();
    expect(facetGridAlignNU(undefined)).toBeUndefined();
    // LowPolyFacet is NOT a smooth-grid style AND (now) NOT a structured-grid style ⇒ falls through to the OFF path.
    expect(isSmoothGridStyle('LowPolyFacet')).toBe(false);
    expect(SMOOTH_GRID_STYLES.has('LowPolyFacet')).toBe(false);
    expect(isStructuredGridStyle('LowPolyFacet')).toBe(false);
    // The 6 C∞ smooth styles are unaffected (still structured-grid).
    expect(isStructuredGridStyle('HarmonicRipple')).toBe(true);
    expect(isStructuredGridStyle('DragonScales')).toBe(false);
    expect(isStructuredGridStyle(undefined)).toBe(false);
  });

  it('dispatch flag-OFF: LowPolyFacet returns undefined (byte-identical production path)', () => {
    setSmoothGrid(false);
    expect(buildSmoothGridDispatchWall({ analyticRA: lowPolyRA, H, tolMm: 0.01 }, 'LowPolyFacet')).toBeUndefined();
  });

  it('dispatch flag-ON: LowPolyFacet returns undefined (routed to OFF, not the emitter — the pow2-rim null fix)', () => {
    setSmoothGrid(true);
    // LowPolyFacet is no longer a structured-grid style ⇒ the smooth-grid dispatch declines it, so the export falls to
    // the OFF conforming wall (feature-aligned, 0.001) instead of emitting a non-pow2 rim that null-s the assembly.
    expect(buildSmoothGridDispatchWall({ analyticRA: lowPolyRA, H, tolMm: 0.01 }, 'LowPolyFacet')).toBeUndefined();
    // A C∞ smooth style still emits a valid pow2-rim wall (the 6-style emitter path is intact).
    const hrWall = buildSmoothGridDispatchWall({ analyticRA: lowPolyRA, H, tolMm: 0.01 }, 'HarmonicRipple');
    expect(hrWall).toBeDefined();
    for (let i = 0; i < hrWall!.gridVertexCount; i++) expect(hrWall!.vertices[3 * i + 2]).toBe(0);
  });
});
