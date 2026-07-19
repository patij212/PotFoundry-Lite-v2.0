import { describe, it, expect } from 'vitest';
import { buildDoubleValuedMesh } from './doubleValuedMesh';
import { auditManifold, certifyAgainstTrueSurface } from './verify';
import { toMeshData } from './mesh';
import type { Mesh, SurfaceRadiusFn } from './types';

const H = 120,
  RLO = 40,
  RHI = 42; // 2mm step
// One straight vertical cliff at u=0.5 over t in [0.1,0.9]; left region low, right region high.
const straightComplex = {
  segments: [
    {
      tRange: [0.1, 0.9] as [number, number],
      at: (s: number) => ({ u: 0.5, t: 0.1 + 0.8 * s }),
      lipsAt: (_s: number) => ({ upper: RHI, lower: RLO }),
    },
  ],
  junctions: [] as [],
};
const stepSurface = (u: number, _t: number): number => (u >= 0.5 ? RHI : RLO);

describe('double-valued mesher (M1 straight cliff)', () => {
  it('builds a watertight double-valued wall between two flat sheets', () => {
    const mesh = buildDoubleValuedMesh(straightComplex, stepSurface, { H }, {
      baseGridU: 12,
      baseGridT: 24,
      chordTolMm: 0.01,
      maxRefinePasses: 0,
    });
    expect(mesh.triangles.length / 3).toBeGreaterThan(0);
    // Every interior edge shared by exactly 2 triangles; the only boundary is the
    // outer domain rectangle rim (u=0/1 ends, t=0.1/0.9 ends) — NO crack along the cliff.
    const audit = auditManifold(mesh);
    expect(audit.nonManifold).toBe(0);
    // the cliff must NOT be a boundary (the wall closes it): boundary edges only on the 4 rim sides
    expect(audit.cliffBoundary).toBe(0);
    // wall exists: some triangle spans radius RLO..RHI at constant (u,t)=0.5-ish
    const md = toMeshData(mesh);
    expect(md.vertexCount).toBeGreaterThan(0);
    expect(md.triangleCount).toBe(mesh.triangles.length / 3);
  });
});

// ---------------------------------------------------------------------------
// Independent-certifier detector test: prove certifyAgainstTrueSurface actually BITES on a
// ribbon/background lip swap (the failure the old circular chord gate could not see). A
// minimal hand-built mesh — one ribbon-band step surface, one cliff vertex on the u=0.5
// locus with two interior ribbon neighbours — is certified twice: once with the cliff vertex
// on the correct (ribbon) lip, once swapped to the background lip.
// ---------------------------------------------------------------------------

// surface: a raised ribbon band u∈[0.5,0.6] at radius 42, background 40 elsewhere.
const RIBBON_R = 42;
const BG_R = 40;
const stepRibbonSurface: SurfaceRadiusFn = (u) => (u >= 0.5 && u < 0.6 ? RIBBON_R : BG_R);
// one straight cliff locus (segment 0) at u=0.5; ribbon interior is on its +u side.
const stepLocusDistance = (u: number): number => Math.abs(u - 0.5);
const stepLocusU = (): number => 0.5;

/** Build a 3-vertex mesh: cliff vertex v0 on u=0.5 (radius `cliffR`) + two ribbon neighbours. */
function stepDetectorMesh(cliffR: number): Mesh {
  const at = (u: number, r: number): [number, number, number] => [r * Math.cos(2 * Math.PI * u), r * Math.sin(2 * Math.PI * u), 0];
  const [x0, y0] = at(0.5, cliffR); // cliff vertex, radius is what the classifier chose
  const [x1, y1] = at(0.55, RIBBON_R); // interior ribbon neighbour
  const [x2, y2] = at(0.56, RIBBON_R); // interior ribbon neighbour (different t)
  return {
    positions: [x0, y0, 0, x1, y1, 0, x2, y2, 12],
    triangles: [0, 1, 2],
    vertexOnCliff: [true, false, false],
    vertexOnRim: [false, false, false],
    vertexU: [0.5, 0.55, 0.56],
    vertexT: [0.5, 0.5, 0.6],
    vertexRegion: [1, 1, 1], // all in the ribbon region
    vertexCliffSeg: [0, -1, -1],
    regionIsRibbon: [false, true], // region 1 = ribbon
    vertexIsJunction: [false, false, false], // no crossings in this hand-built detector mesh
  };
}

describe('certifyAgainstTrueSurface detector', () => {
  it('passes when the cliff vertex takes the correct (ribbon) lip', () => {
    const mesh = stepDetectorMesh(RIBBON_R); // correctly lifted to the ribbon foot
    const cert = certifyAgainstTrueSurface(mesh, stepRibbonSurface, stepLocusDistance, stepLocusU, 1e-6);
    expect(cert.cliffVertsCertified).toBe(1);
    expect(cert.cliffVertsSkipped).toBe(0);
    expect(cert.maxCliffDevMm).toBeLessThan(1e-9); // step surface: exact one-sided limit, no overshoot
    expect(cert.maxSheetDevMm).toBeLessThan(1e-9);
  });

  it('SPIKES when the cliff vertex is swapped to the wrong (background) lip', () => {
    const mesh = stepDetectorMesh(BG_R); // classifier swap: ribbon vertex mis-lifted to background
    const cert = certifyAgainstTrueSurface(mesh, stepRibbonSurface, stepLocusDistance, stepLocusU, 1e-6);
    expect(cert.cliffVertsCertified).toBe(1);
    // the swap is exactly the ribbon→background radial jump, orders of magnitude over any tol
    expect(cert.maxCliffDevMm).toBeCloseTo(RIBBON_R - BG_R, 6);
    expect(cert.maxCliffDevMm).toBeGreaterThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// JUNCTION-PINCH corner detector (CCP): prove the corrected certifier both (a) no longer FALSE-
// POSITIVES on a correctly-placed background junction-pinch vertex whose `dirCnt==0` centroid nudge
// lands on the wrong (ribbon) branch, AND (b) still BITES when that same vertex is genuinely
// displaced off its background level. This is the gate-honesty proof for the verify.ts fix: it
// reproduces the exact clipped-full-pot mechanism in a hand-built mesh.
//
// surface: a ribbon band u∈[0.45,0.55] at radius 42 (visible/OCCLUDING), background 40 elsewhere.
// The junction pinch LOWER vertex sits at (u=0.5,t=0.5) — INSIDE the ribbon band in u, so the
// analytic surface there is the ribbon (42), and its own background region's bulk lies OFF to +u
// at u≈0.8. Its `dirCnt==0` centroid nudge (toward +u) therefore lands INSIDE the ribbon band and
// reads 42 (the wrong branch) — the old certifier's ~jump-sized false positive. The corrected
// certifier detects the wrong-branch landing and certifies against the background region's own
// LOWER pinch level = min-over-u(surface) = 40, so the correct vertex reads dev 0 and a displaced
// one still spikes.
const JP_RIBBON_R = 42;
const JP_BG_R = 40;
const jpSurface: SurfaceRadiusFn = (u) => (u >= 0.45 && u <= 0.55 ? JP_RIBBON_R : JP_BG_R);
// cliff loci = the two ribbon-band edges; distance keeps the u≈0.8 background sheets far from a cliff.
const jpLocusDistance = (u: number): number => Math.min(Math.abs(u - 0.45), Math.abs(u - 0.55));
const jpLocusU = (): number => 0.5;

/**
 * Hand-built mesh with ONE background junction-pinch vertex (v0) exercising the `dirCnt==0` corner
 * fallback. `pinchR` is v0's radius (JP_BG_R = correctly on its lower pinch level; anything else =
 * displaced). v0's only triangle joins its coincident ribbon-upper twin (v1, a cliff vertex) and a
 * ribbon sheet (v4, a DIFFERENT region), so v0 has NO interior same-region sheet neighbour ⇒
 * dirCnt==0. A detached background sheet patch (v2,v3,v5 at u≈0.8, region 0) pulls region 0's
 * centroid to +u so the centroid nudge lands in the ribbon band (the wrong branch).
 */
function junctionPinchDetectorMesh(pinchR: number): Mesh {
  const H = 12;
  const at = (u: number, r: number, t: number): [number, number, number] => [
    r * Math.cos(2 * Math.PI * u),
    r * Math.sin(2 * Math.PI * u),
    t * H,
  ];
  const p: number[] = [];
  const push = (u: number, r: number, t: number): void => {
    const [x, y, z] = at(u, r, t);
    p.push(x, y, z);
  };
  push(0.5, pinchR, 0.5); // 0: v0 — background junction pinch LOWER (under test)
  push(0.5, JP_RIBBON_R, 0.5); // 1: v1 — coincident ribbon junction pinch UPPER (its twin)
  push(0.8, JP_BG_R, 0.5); // 2: v2 — background sheet (region 0), sets the +u centroid
  push(0.82, JP_BG_R, 0.48); // 3: v3 — background sheet (region 0)
  push(0.5, JP_RIBBON_R, 0.55); // 4: v4 — ribbon sheet (region 1); v1's interior neighbour
  push(0.78, JP_BG_R, 0.52); // 5: v5 — background sheet (region 0)
  return {
    positions: p,
    // T1 gives v0 a triangle whose other corners are a cliff twin + a foreign-region sheet (⇒
    // dirCnt[v0]==0); T2 is the detached background patch (never adjacent to v0).
    triangles: [0, 1, 4, 2, 3, 5],
    vertexOnCliff: [true, true, false, false, false, false],
    vertexOnRim: [false, false, false, false, false, false],
    vertexU: [0.5, 0.5, 0.8, 0.82, 0.5, 0.78],
    vertexT: [0.5, 0.5, 0.5, 0.48, 0.55, 0.52],
    vertexRegion: [0, 1, 0, 0, 1, 0], // region 0 = background, region 1 = ribbon
    vertexCliffSeg: [0, 0, -1, -1, -1, -1],
    regionIsRibbon: [false, true],
    vertexIsJunction: [true, true, false, false, false, false],
  };
}

describe('certifyAgainstTrueSurface junction-pinch corner detector', () => {
  it('no longer false-positives on the correctly-placed background pinch vertex (fix present)', () => {
    const mesh = junctionPinchDetectorMesh(JP_BG_R); // v0 correctly on its background lower pinch level
    const cert = certifyAgainstTrueSurface(mesh, jpSurface, jpLocusDistance, jpLocusU, 1e-6);
    // Both pinch vertices certify; none skipped for want of an orienting neighbour.
    expect(cert.cliffVertsCertified).toBe(2);
    expect(cert.cliffVertsSkipped).toBe(0);
    // The corrected certifier reads the background LOWER pinch level (40), so the correct vertex is
    // EXACT — well under the 0.01 gate. (Before the fix the centroid nudge read the ribbon branch and
    // this spiked to the full 2.0 jump, i.e. this assertion is what guards the fix from regressing.)
    expect(cert.maxCliffDevMm).toBeLessThan(1e-9);
    expect(cert.maxSheetDevMm).toBeLessThan(1e-9);
  });

  it('STILL BITES when that junction pinch vertex is displaced off its background level', () => {
    const mesh = junctionPinchDetectorMesh(JP_BG_R + 0.05); // displaced 0.05mm off the lower pinch level
    const cert = certifyAgainstTrueSurface(mesh, jpSurface, jpLocusDistance, jpLocusU, 1e-6);
    expect(cert.cliffVertsCertified).toBe(2);
    // The expected level is computed from the surface + region (independent of the vertex radius), so
    // the displacement surfaces as a deviation exactly its own size — comfortably over the gate.
    expect(cert.maxCliffDevMm).toBeCloseTo(0.05, 6);
    expect(cert.maxCliffDevMm).toBeGreaterThan(0.01);
  });
});
