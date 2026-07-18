// celticKnotMesh.test.ts — Milestone 2 of the snaking-C0 P3 double-valued mesher.
//
// The FIRST real case: mesh ONE snaking CelticKnot ribbon strand (its two
// ±strandWidth cliff edges + the ribbon sheet + the two background sheets + the two
// vertical walls) from the actual P1-declared cliff complex + the exact analytic
// surface, and prove it is watertight (0 non-manifold, cliff seam closed, boundary
// only on the domain rims) and chords to the true analytic surface < 0.01mm after
// refinement. No strand crossings / Y-junctions yet (that is M3).

import { describe, it, expect } from 'vitest';
import { buildCelticKnotDoubleValuedMesh, buildCelticKnotColumnCrossingMesh } from './celticKnotMesh';

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

// ---------------------------------------------------------------------------
// Milestone 3: the FULL single-column complex — MULTIPLE strands whose ribbon
// edges genuinely CROSS. At every crossing the general per-region split would
// emit one cliff-copy per incident sheet (a non-manifold FAN); the proven-correct
// behaviour (_wallJunction: levels collapse 55→…→2) is that every sheet + wall
// meeting at a Y-junction PINCHES to exactly TWO shared vertices — the declared
// `pinch` double-vertex {upper:r0, lower:r0−jump}. This test meshes a window around
// one strand-0/strand-1 crossing (its overlap diamond + 4 corner junctions) and
// asserts: 0 non-manifold INCLUDING at every junction (no fan), junctionCount>0,
// each junction pinches to exactly 2 radius levels (r0, r0−jump), the mesh chords
// the true surface <0.01mm, and the INDEPENDENT fidelity gate certifies every sheet
// AND cliff vertex <0.01mm (occlusion on the diamond sides is lifted to the true
// one-sided analytic limit, not the naive lip). Occlusion *walls* proper + multi-
// column remain M4/M5. jumpMm = ckRelief*0.3 = 0.6.
// ckRoundness = 1 (smooth cosine crest): the crossing/pinch/occlusion mechanism is profile-
// independent, but a cornered crest (roundness < 1) is a sharp C0 ridge whose <0.01mm chord
// needs structured-strip CREASES — which, for two SNAKING strands that cross, would themselves
// need crossing-planarization. That strip-structuring is M2's already-proven concern; M3
// isolates the crossings + Y-junctions, so it meshes the smooth-crest ribbon (all cliffs,
// walls, occlusion steps and the r0/r0−jump pinch are fully present and exercised).
const STYLE_M3 = { ckScale: 1, ckWidth: 0.15, ckRelief: 2, ckGap: 0.02, ckRoundness: 1, ckTwist: 0, ckStrands: 2 };
const JUMP_MM = STYLE_M3.ckRelief * 0.3;

describe('CelticKnot double-valued mesher (M3: crossings + watertight Y-junction pinch)', () => {
  it('meshes a full crossing watertight with pinched Y-junctions and <0.01mm chord', () => {
    const { mesh, report } = buildCelticKnotColumnCrossingMesh(STYLE_M3, DIMS, {
      baseGridU: 92,
      baseGridT: 70,
      chordTolMm: 0.01,
      maxRefinePasses: 3,
    });

    // a real mesh came out
    expect(report.triangleCount).toBeGreaterThan(0);
    expect(mesh.triangleCount).toBe(report.triangleCount);
    expect(mesh.vertexCount).toBe(report.vertexCount);

    // watertight: no non-manifold edges ANYWHERE — including at the junctions (no fan)
    expect(report.nonManifold).toBe(0);
    // every open boundary edge lies on the domain rim: no interior holes, no cliff cracks,
    // and — critically — no crack at a Y-junction where several walls meet
    expect(report.cliffBoundary).toBe(0);
    expect(report.boundaryNonRim).toBe(0);

    // the crossing produced genuine junctions, and EVERY one pinched to exactly the two
    // declared radius levels {r0−jump, r0} (the 55→…→2 collapse) — not a multi-level fan
    expect(report.junctionCount).toBeGreaterThan(0);
    expect(report.junctions.length).toBe(report.junctionCount);
    for (const j of report.junctions) {
      expect(j.distinctLevels).toBe(2); // exactly upper + lower, nothing in between
      expect(j.upper - j.lower).toBeCloseTo(JUMP_MM, 3); // the declared r0 / r0−jump pinch
    }

    // after refinement the mesh chords the (self-consistent) true-surface reference < 0.01mm
    expect(report.refinePasses).toBeGreaterThanOrEqual(1);
    expect(report.maxChordMm).toBeLessThan(0.01);

    // INDEPENDENT fidelity certification (does NOT route through the region classifier):
    // every sheet vertex on the true analytic surface, every cliff split-vertex at the
    // ONE-SIDED analytic limit taken from INSIDE its own region. On the overlap-diamond
    // sides this limit is the OCCLUDED (raised) neighbour, not the naive r0 lip — so a
    // naive lip lift would spike this gate by ~the occlusion step. It must stay < 0.01mm.
    const cert = report.certification;
    expect(cert.maxSheetDevMm).toBeLessThan(0.01);
    expect(cert.maxCliffDevMm).toBeLessThan(0.01);
    // the certification actually covered the mesh (no cliff vertex skipped for want of a neighbour)
    expect(cert.sheetVertsChecked).toBeGreaterThan(0);
    expect(cert.cliffVertsCertified).toBeGreaterThan(0);
    expect(cert.cliffVertsSkipped).toBe(0);
  }, 180000);
});
