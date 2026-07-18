// celticKnotMesh.test.ts — Milestone 2 of the snaking-C0 P3 double-valued mesher.
//
// The FIRST real case: mesh ONE snaking CelticKnot ribbon strand (its two
// ±strandWidth cliff edges + the ribbon sheet + the two background sheets + the two
// vertical walls) from the actual P1-declared cliff complex + the exact analytic
// surface, and prove it is watertight (0 non-manifold, cliff seam closed, boundary
// only on the domain rims) and chords to the true analytic surface < 0.01mm after
// refinement. No strand crossings / Y-junctions yet (that is M3).

import { describe, it, expect } from 'vitest';
import { buildCelticKnotDoubleValuedMesh } from './celticKnotMesh';

const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
// CelticKnot params derived exactly as celticKnotOuterWallTarget.parameters(), with
// ckStrands set to 2 so a single strand isolates with no crossings (M2 scope).
const STYLE = { ckScale: 3, ckWidth: 0.15, ckRelief: 2, ckGap: 0.02, ckRoundness: 0.5, ckTwist: 0, ckStrands: 2 };

describe('CelticKnot double-valued mesher (M2: one real snaking strand)', () => {
  it('meshes a single isolated ribbon strand watertight and <0.01mm chord', () => {
    const { mesh, report } = buildCelticKnotDoubleValuedMesh(STYLE, DIMS, {
      baseGridU: 20,
      baseGridT: 40,
      chordTolMm: 0.01,
      maxRefinePasses: 6,
    });

    // a real mesh came out
    expect(report.triangleCount).toBeGreaterThan(0);
    expect(mesh.triangleCount).toBe(report.triangleCount);
    expect(mesh.vertexCount).toBe(report.vertexCount);

    // watertight: no non-manifold edges anywhere
    expect(report.nonManifold).toBe(0);
    // the snaking cliff is CLOSED by the double-valued wall — no crack along it
    expect(report.cliffBoundary).toBe(0);
    // every open boundary edge lies on the domain rim (t-rims / u-band sides): no interior holes
    expect(report.boundaryNonRim).toBe(0);

    // after refinement (>= 4 passes available) the mesh chords the true surface < 0.01mm
    expect(report.refinePasses).toBeGreaterThanOrEqual(1);
    expect(report.maxChordMm).toBeLessThan(0.01);

    // INDEPENDENT fidelity certification (does NOT route through the region classifier).
    // Every SHEET vertex sits on the true analytic surface, and every CLIFF split-vertex equals
    // the ONE-SIDED surface limit taken from INSIDE its own region. A classifier lip-swap is
    // invisible to the chord gate above (the wall ruled-face spans the whole radial jump, so a
    // mis-lifted cliff vertex still lands on it) but spikes maxCliffDevMm by the full ~0.6mm
    // jump — so this is what actually certifies the load-bearing M2 region classifier.
    const cert = report.certification;
    expect(cert.maxSheetDevMm).toBeLessThan(0.01);
    expect(cert.maxCliffDevMm).toBeLessThan(0.01);
    // the certification actually covered the mesh (no cliff vertex skipped for want of a neighbour)
    expect(cert.sheetVertsChecked).toBeGreaterThan(0);
    expect(cert.cliffVertsCertified).toBeGreaterThan(0);
    expect(cert.cliffVertsSkipped).toBe(0);

    // Direct classifier sanity: the classifier-labeled ribbon region must be geometrically
    // RAISED — its mean vertex radius above every background region's. Interior sheet lifts set
    // these means and never consult the label, so a swapped label inverts the ordering.
    expect(cert.ribbonRegionCount).toBeGreaterThanOrEqual(1);
    expect(cert.backgroundRegionCount).toBeGreaterThanOrEqual(1);
    expect(cert.minRibbonMeanRadiusMm).toBeGreaterThan(cert.maxBackgroundMeanRadiusMm);
  }, 120000);
});
