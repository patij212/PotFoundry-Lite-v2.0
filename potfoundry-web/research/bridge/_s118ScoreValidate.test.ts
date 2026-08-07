// _s118ScoreValidate.test.ts — TWO-SIDED VALIDATION OF THE S118 SCORECARD'S ALGORITHMS.
//
// The standing rule in this campaign is that a verdict is only as good as the ruler's own two-sided
// fixtures. Reproducing the published GothicArches / CelticTriquetra numbers proves s118Score AGREES WITH
// THE OLD TOOL on the meshes that happen to exist. It proves nothing about whether it can SEE a defect
// that has not occurred yet — and the 0.001 mm meshes the DRIVE agents are about to build have not
// occurred yet. So every claim the scorecard makes is planted here and asserted in BOTH directions:
// the defect is detected, AND a matched clean control is not.
//
// The perpendicular scan is validated against a CLOSED-FORM surface (a cone), not against the
// Gauss-Newton projector, so a projector bug cannot hide a scan bug. The two arms `full` (no reductions)
// and `fast` (per-point radial prefilter + early-out + branch-and-bound) must return IDENTICAL
// overHi / overLo / max — that equality is the whole justification for the reductions, and it is the
// reason an exhaustive pass at 1e7 facets is affordable at all.
//
//   npx vitest run --config vitest.s118score.config.ts
import { describe, it, expect } from 'vitest';
import { facetGeom, perpScan, latticePts } from '../tools/s118ScoreLib';
import { dThRaw } from './_sweepPredicate';

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A CLOSED-FORM SURFACE: the cone r = R0 + s*z. The perpendicular distance from P to it is exact.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const R0 = 40; const SLOPE = 3;
const rA = (_th: number, z: number): number => R0 + SLOPE * z;
const GRAPH = Math.sqrt(1 + SLOPE * SLOPE);           // radial over-read factor: 3.1623
/** Exact perpendicular distance from P to the cone (in the (rho,z) half-plane, distance to a line). */
const projectExact = (x: number, y: number, z: number): number =>
  Math.abs(Math.hypot(x, y) - (R0 + SLOPE * z)) / GRAPH;

/** One facet, built in (theta,z) and lifted to radius rA + delta. Returns 9 coords. */
function coneFacet(th0: number, z0: number, dTh: number, dZ: number, delta: number): number[] {
  const P = (th: number, z: number): [number, number, number] => {
    const r = rA(th, z) + delta;
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  return [...P(th0, z0), ...P(th0 + dTh, z0), ...P(th0 + dTh * 0.5, z0 + dZ)];
}

interface Built { xyz: Float64Array; r1: Float64Array; areaA: Float64Array; order: Uint32Array }
function build(facets: number[][], lat: Float64Array): Built {
  const n = facets.length;
  const xyz = new Float64Array(n * 9);
  for (let f = 0; f < n; f += 1) xyz.set(facets[f], f * 9);
  const NP = lat.length / 3;
  const r1 = new Float64Array(n); const areaA = new Float64Array(n);
  for (let f = 0; f < n; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    areaA[f] = 0.5 * Math.hypot(nx, ny, nz);
    let w = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = lat[p * 3], w1 = lat[p * 3 + 1], w2 = lat[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const d = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      if (d > w) w = d;
    }
    r1[f] = w;
  }
  const ord = Array.from({ length: n }, (_v, i) => i).filter((i) => r1[i] > 1e-3).sort((a, b) => r1[b] - r1[a]);
  return { xyz, r1, areaA, order: Uint32Array.from(ord) };
}

const LAT = latticePts(8);
const BAR_HI = 0.01; const BAR_LO = 0.001;

// The five planted position cases. delta is the RADIAL offset; the true perpendicular offset is
// delta / GRAPH, so cases 3 and 4 are radially flagged but perpendicularly CLEAR of the bar they trip.
const D_CLEAN = 0;        // on the surface        -> not flagged at all
const D_BIGHI = 0.05;     // perp 1.58e-2          -> over HI and over LO
const D_MIDLO = 0.005;    // perp 1.58e-3          -> over LO only
const D_RADHI = 0.02;     // radial > HI, perp 6.3e-3 -> OVER LO, CLEARED AT HI  (the over-read case)
const D_RADLO = 0.002;    // radial > LO, perp 6.3e-4 -> CLEARED AT BOTH          (the over-read case)

describe('s118Score perpendicular scan — planted, closed form, two-sided', () => {
  const facets = [
    coneFacet(0.30, 1.0, 0.004, 0.02, D_CLEAN),
    coneFacet(0.90, 2.0, 0.004, 0.02, D_BIGHI),
    coneFacet(1.50, 3.0, 0.004, 0.02, D_MIDLO),
    coneFacet(2.10, 4.0, 0.004, 0.02, D_RADHI),
    coneFacet(2.70, 5.0, 0.004, 0.02, D_RADLO),
  ];
  const B = build(facets, LAT);
  const opts = {
    xyz: B.xyz, order: B.order, r1: B.r1, areaA: B.areaA, lattice: LAT,
    rA, project: projectExact, barHi: BAR_HI, barLo: BAR_LO, loOn: true,
  };

  it('the prefilter flags exactly the four facets a radial upper bound cannot certify', () => {
    // the clean facet's only radial residual is chord sag; it must fall below the LO bar
    expect(B.r1[0]).toBeLessThan(BAR_LO);
    expect(B.order.length).toBe(4);
  });

  it('full mode gets each planted case right — including the two the RADIAL ruler over-reads', () => {
    const R = perpScan({ ...opts, mode: 'full' });
    expect(R.c2Violations).toBe(0);
    // over HI: only the 0.05 mm facet (0.02 mm radial is 6.3e-3 perpendicular => CLEARED)
    expect(R.overHiCount).toBe(1);
    // over LO: 0.05, 0.005 and 0.02 (all perp > 1e-3); the 0.002 facet is 6.3e-4 => CLEARED
    expect(R.overLoCount).toBe(3);
    expect(R.max).toBeGreaterThan((D_BIGHI / GRAPH) * 0.98);
    expect(R.max).toBeLessThan((D_BIGHI / GRAPH) * 1.05);
  });

  it('*** fast and full agree to the digit on COUNT, AREA and MAX — the reductions are lossless ***', () => {
    const F = perpScan({ ...opts, mode: 'full' });
    const Q = perpScan({ ...opts, mode: 'fast' });
    expect(Q.overHiCount).toBe(F.overHiCount);
    expect(Q.overLoCount).toBe(F.overLoCount);
    expect(Q.overHiArea).toBe(F.overHiArea);
    expect(Q.overLoArea).toBe(F.overLoArea);
    expect(Q.max).toBe(F.max);
    expect(Q.c2Violations).toBe(0);
  });

  it('and fast really does fewer projector calls (otherwise the reduction is a no-op)', () => {
    const F = perpScan({ ...opts, mode: 'full' });
    const Q = perpScan({ ...opts, mode: 'fast' });
    expect(F.calls).toBe(B.order.length * (LAT.length / 3));   // 4 facets x 45 points, no skipping
    expect(Q.calls).toBeLessThan(F.calls);
  });

  it('NEGATIVE CONTROL — a projector that over-reads MUST trip C2 in both modes', () => {
    // If C2 never fires on a deliberately wrong projector, C2 is decoration and every "CONTROL HOLDS"
    // line in the report is worthless.
    const bad = (x: number, y: number, z: number): number => Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)) * 1.5;
    expect(perpScan({ ...opts, project: bad, mode: 'full' }).c2Violations).toBeGreaterThan(0);
    expect(perpScan({ ...opts, project: bad, mode: 'fast' }).c2Violations).toBeGreaterThan(0);
  });

  it('NEGATIVE CONTROL — a perfect mesh scores literal zero, not a floor', () => {
    const clean = build([coneFacet(0.3, 1.0, 0.004, 0.02, 0)], LAT);
    for (const mode of ['full', 'fast'] as const) {
      const R = perpScan({ ...opts, xyz: clean.xyz, order: Uint32Array.from([0]), r1: clean.r1, areaA: clean.areaA, mode });
      expect(R.overHiCount).toBe(0);
      expect(R.overLoCount).toBe(0);
    }
  });

  it('loOn=false suppresses the LO tally without disturbing the HI tally or the max', () => {
    const A = perpScan({ ...opts, mode: 'fast' });
    const Bo = perpScan({ ...opts, loOn: false, mode: 'fast' });
    expect(Bo.overHiCount).toBe(A.overHiCount);
    expect(Bo.overHiArea).toBe(A.overHiArea);
    expect(Bo.overLoCount).toBe(0);
    expect(Bo.max).toBe(A.max);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ARTEFACT CLASSIFIERS — needle, footprint-sign inversion, degeneracy pole. All analytic-free.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
/** Build one facet directly from three (theta, z, r) triples and return facetGeom with UNWRAPPED theta. */
function geomOf(pts: Array<[number, number, number]>, unwrap = true): ReturnType<typeof facetGeom> {
  const xy = pts.map(([th, z, r]) => [r * Math.cos(th), r * Math.sin(th), z] as [number, number, number]);
  const raw = xy.map(([x, y]) => Math.atan2(y, x));
  const tha = raw[0];
  const thb = unwrap ? tha + dThRaw(tha, raw[1]) : raw[1];
  const thc = unwrap ? tha + dThRaw(tha, raw[2]) : raw[2];
  return facetGeom(xy[0][0], xy[0][1], xy[0][2], xy[1][0], xy[1][1], xy[1][2], xy[2][0], xy[2][1], xy[2][2], tha, thb, thc);
}

describe('s118Score artefact classifiers — planted, two-sided', () => {
  it('NEEDLE: a 1 nm-tall arc-space footprint reads under 2 um; the 10 um control does not', () => {
    // three corners spread 0.01 rad in theta at r=40 (u-spread ~0.4 mm), apex lifted only 1e-6 mm in z
    const needle = geomOf([[0, 5, 40], [0.01, 5, 40], [0.005, 5 + 1e-6, 40]]);
    expect(needle.minAltUm).toBeLessThan(2);
    const control = geomOf([[0, 5, 40], [0.01, 5, 40], [0.005, 5 + 0.01, 40]]);
    expect(control.minAltUm).toBeGreaterThan(2);
    // and the control is a healthy facet by every other test
    expect(control.apsSign).not.toBe(-1);
    expect(control.graphRatio).toBeLessThan(100);
  });

  it('INVERSION: swapping two corners flips apsSign, and only apsSign', () => {
    const ok = geomOf([[0, 5, 40], [0.01, 5, 40], [0.005, 5.01, 40]]);
    const flip = geomOf([[0, 5, 40], [0.005, 5.01, 40], [0.01, 5, 40]]);
    expect(ok.apsSign).toBe(1);
    expect(flip.apsSign).toBe(-1);
    expect(flip.area).toBeCloseTo(ok.area, 12);          // 3D area is winding-blind
    expect(flip.minAltUm).toBeCloseTo(ok.minAltUm, 9);
  });

  it('DEGENERACY POLE: a collinear arc-space footprint with real 3D extent reads Infinity', () => {
    // same z, evenly spaced theta => arc-space signed area is exactly 0; radii differ so the 3D
    // triangle is NOT degenerate. That is the pole: a facet with 3D area and no parametric footprint.
    const pole = geomOf([[0, 5, 40], [0.01, 5, 46], [0.02, 5, 40]]);
    expect(pole.area).toBeGreaterThan(0);
    expect(pole.graphRatio).toBe(Infinity);
    // a control with the same radii but real z-extent must be far below the pole bar
    const control = geomOf([[0, 5, 40], [0.01, 5.5, 46], [0.02, 5, 40]]);
    expect(control.graphRatio).toBeLessThan(100);
  });

  it('*** SCAR: raw atan2 across the -pi seam fabricates an inversion; unwrapped theta does not ***', () => {
    // the identical facet, once away from the seam and once straddling it
    const away = geomOf([[0.00, 5, 40], [0.01, 5, 40], [0.005, 5.01, 40]], true);
    const seamUnwrapped = geomOf([[Math.PI - 0.005, 5, 40], [Math.PI + 0.005, 5, 40], [Math.PI, 5.01, 40]], true);
    expect(seamUnwrapped.apsSign).toBe(away.apsSign);
    expect(seamUnwrapped.minAltUm).toBeCloseTo(away.minAltUm, 6);
    expect(seamUnwrapped.graphRatio).toBeCloseTo(away.graphRatio, 9);
    // and with RAW atan2 the same facet is mis-read.
    const seamRaw = geomOf([[Math.PI - 0.005, 5, 40], [Math.PI + 0.005, 5, 40], [Math.PI, 5.01, 40]], false);
    // MEASURED, and it is NOT what I first assumed. The 2*pi wrap inflates the arc-space footprint by
    // ~2*pi*r, so:
    //   apsSign   +1 -> -1        a FABRICATED FOLD
    //   graphRatio 1.0012 -> 0.0016   a 627x collapse (the footprint, not the facet, grew)
    //   minAltUm  10.000 -> 9.992     essentially UNCHANGED
    // So the NEEDLE test is seam-robust and the INVERSION and POLE tests are NOT. Any census of folds
    // taken on raw atan2 would report one fabricated inversion per seam-straddling facet, and this
    // campaign has taken fold censuses. s118Score unwraps per facet for exactly this reason.
    expect(seamRaw.apsSign).toBe(-away.apsSign);
    expect(seamRaw.graphRatio).toBeLessThan(away.graphRatio / 100);
    expect(seamRaw.minAltUm).toBeCloseTo(away.minAltUm, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE LATTICE ITSELF
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
describe('barycentric lattice', () => {
  it('has (k+1)(k+2)/2 points and every point sums to 1', () => {
    for (const k of [2, 4, 8, 16]) {
      const L = latticePts(k);
      expect(L.length / 3).toBe(((k + 1) * (k + 2)) / 2);
      for (let p = 0; p < L.length / 3; p += 1) {
        expect(L[p * 3] + L[p * 3 + 1] + L[p * 3 + 2]).toBeCloseTo(1, 12);
      }
    }
  });
});
