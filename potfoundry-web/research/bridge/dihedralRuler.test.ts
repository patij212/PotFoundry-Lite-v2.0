// dihedralRuler.test.ts — the ADJACENT-FACET dihedral, which is the quantity a slicer preview actually
// shades and therefore the one the eye reads as "banding". The campaign has only ever measured
// facet-vs-ANALYTIC angle (`orientOfFacet`/`normDeg`); that is a fidelity quantity, not a visibility one.
// Two facets can each sit 3 deg off the true surface and be mutually FLAT (invisible), or each sit 0.5 deg
// off in OPPOSITE directions and show a 1 deg crease (visible). Pinned here on closed-form folds.
import { describe, it, expect } from 'vitest';
import { facetDihedrals, areaFractionOver } from './dihedralRuler';

/** unit square [0,1]^2 in z=0, split into two triangles across the (1,0)-(0,1) diagonal. Consistently wound. */
const FLAT = {
  xyz: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0],
  idx: [0, 1, 2, 1, 3, 2],
};

describe('facetDihedrals — angle between ADJACENT facet normals', () => {
  it('two coplanar triangles read 0 deg', () => {
    const d = facetDihedrals(FLAT.xyz, FLAT.idx);
    expect(d.interiorEdges).toBe(1);
    expect(d.perFacetMaxRad[0]).toBeCloseTo(0, 12);
    expect(d.perFacetMaxRad[1]).toBeCloseTo(0, 12);
  });

  it('a 90 deg fold reads 90 deg on both facets', () => {
    // Same square, second triangle folded 90 deg about the shared diagonal edge v1=(1,0,0)-v2=(0,1,0).
    // DERIVED, not guessed: midpoint M=(0.5,0.5,0); triangle A's apex sits at d=(-0.5,-0.5,0) from M,
    // which is already perpendicular to the edge axis e=(-1,1,0)/sqrt2 (d.e = 0). Rotating d by 90 deg
    // about e gives e x d = (0,0,1/sqrt2), so the folded apex is M + that = (0.5, 0.5, 1/sqrt2).
    // Check: triangle B normal is then (-1/sqrt2, -1/sqrt2, 0), whose dot with A's (0,0,1) is EXACTLY 0.
    const xyz = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0.5, 0.5, Math.SQRT1_2];
    const d = facetDihedrals(xyz, FLAT.idx);
    expect(d.interiorEdges).toBe(1);
    expect((d.perFacetMaxRad[0] * 180) / Math.PI).toBeCloseTo(90, 6);
    expect((d.perFacetMaxRad[1] * 180) / Math.PI).toBeCloseTo(90, 6);
  });

  it('a lone triangle has no neighbour: 3 boundary edges, 0 interior, dihedral 0', () => {
    const d = facetDihedrals([0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 1, 2]);
    expect(d.boundaryEdges).toBe(3);
    expect(d.interiorEdges).toBe(0);
    expect(d.perFacetMaxRad[0]).toBe(0);
  });

  it('areas are the true triangle areas, so the weighting is not vacuous', () => {
    const d = facetDihedrals(FLAT.xyz, FLAT.idx);
    expect(d.areaMm2[0]).toBeCloseTo(0.5, 12);
    expect(d.areaMm2[1]).toBeCloseTo(0.5, 12);
  });

  it('areaFractionOver is AREA-weighted, not count-weighted', () => {
    // one BIG flat facet + one SMALL folded facet: a count-weighted answer would say 50%,
    // an area-weighted one must say the small facet's area share. This is the campaign's
    // "count over-states defect AREA by 13-184x" rule, asserted rather than assumed.
    const perFacetMaxRad = Float64Array.from([0, Math.PI / 2]);
    const areaMm2 = Float64Array.from([99, 1]);
    expect(areaFractionOver({ perFacetMaxRad, areaMm2 }, (1 * Math.PI) / 180)).toBeCloseTo(0.01, 12);
    expect(areaFractionOver({ perFacetMaxRad, areaMm2 }, (91 * Math.PI) / 180)).toBeCloseTo(0, 12);
  });
});
