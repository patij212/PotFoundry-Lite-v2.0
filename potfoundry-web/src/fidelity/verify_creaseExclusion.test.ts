/**
 * verify_creaseExclusion.test.ts — the over/under crease-locus exclusion in
 * radialAnalyticDeviation (the BasketWeave holdout fix). A triangle PINNED on /
 * straddling a weave crease (where the cell-parity floor() is two-valued and
 * GPU-f32/CPU-f64 flip the over/under strand) must be EXCLUDED — tracked in
 * creaseBandMaxMm, not maxDevMm — exactly like the u-seam cliff. A control
 * triangle away from any crease must still be measured.
 */
import { describe, it, expect } from 'vitest';
import { radialAnalyticDeviation, basketWeaveCreaseLoci, celticKnotCreasePredicate, geometricStarStrapField } from './analyticSurfaceGate';

const H = 100;
const R0 = 50;
const TAU = 2 * Math.PI;
// Cylinder point at (u,t) with an explicit radius (lets us inject an off-surface flip).
const P = (u: number, t: number, r: number): [number, number, number] => [r * Math.cos(u * TAU), r * Math.sin(u * TAU), t * H];

/** Two triangles: A away from any crease (on-surface), B straddling u=0.5 with one
 *  vertex flipped +2mm off the surface (the f32/f64 over/under disagreement). */
function buildMesh(): { vertices: Float32Array; indices: Uint32Array; ut: Float32Array } {
  // A: u≈0.11, on-surface (r=R0). B: straddles u=0.5, the on-locus vertex flipped.
  const verts: number[] = [];
  const ut: number[] = [];
  const push = (u: number, t: number, r: number): void => {
    const [x, y, z] = P(u, t, r);
    verts.push(x, y, z);
    ut.push(u, t, 0); // surfaceId 0 (outer wall); stash u = recovered u here
  };
  // Triangle A (measured): all on-surface, tiny span so the flat-facet-vs-cylinder
  // chord sagitta is negligible (~0.001mm).
  push(0.100, 0.40, R0); push(0.102, 0.40, R0); push(0.101, 0.405, R0);
  // Triangle B (crease straddle at u=0.5): middle vertex ON the locus, flipped +2mm.
  push(0.499, 0.60, R0); push(0.501, 0.60, R0); push(0.500, 0.605, R0 + 2.0);
  return { vertices: Float32Array.from(verts), indices: Uint32Array.from([0, 1, 2, 3, 4, 5]), ut: Float32Array.from(ut) };
}

describe('crease-locus exclusion (BasketWeave over/under discontinuity)', () => {
  const { vertices, indices, ut } = buildMesh();
  const rAnalytic = (): number => R0; // flat reference; only the injected flip deviates
  const base = { H, tolMm: 0.1, seamExclU: 0.01, denseN: 4 };

  it('WITHOUT creaseU: the flipped straddle triangle drives maxDev to ~2mm', () => {
    const r = radialAnalyticDeviation({ vertices, indices }, ut, rAnalytic, base);
    expect(r.maxDevMm).toBeGreaterThan(1.9);
    expect(r.vertexMaxMm).toBeGreaterThan(1.9);
    expect(r.creaseBandMaxMm).toBe(0);
  });

  it('WITH creaseU=[0.5]: the straddle triangle is EXCLUDED (tracked in creaseBandMaxMm)', () => {
    const r = radialAnalyticDeviation({ vertices, indices }, ut, rAnalytic, { ...base, creaseU: [0.5] });
    // The flip is now in the crease bucket, not the measured channels.
    expect(r.creaseBandMaxMm).toBeGreaterThan(1.9);
    expect(r.maxDevMm).toBeLessThan(0.05);
    expect(r.vertexMaxMm).toBeLessThan(0.05);
    // Control triangle A is still measured (not over-excluded).
    expect(r.wallTriangles).toBe(1);
    expect(r.samples).toBeGreaterThan(0);
  });

  it('WITH creasePredicate (swept braid creases): the flip triangle is EXCLUDED', () => {
    // A predicate that flags the u≈0.5 band (stands in for a swept braid crease at
    // the straddle triangle B's location). Same exclude=3 path as creaseU.
    const pred = (u: number): boolean => Math.abs(u - 0.5) < 0.01;
    const r = radialAnalyticDeviation({ vertices, indices }, ut, rAnalytic, { ...base, creasePredicate: pred });
    expect(r.creaseBandMaxMm).toBeGreaterThan(1.9);
    expect(r.maxDevMm).toBeLessThan(0.05);
    expect(r.wallTriangles).toBe(1); // control triangle A still measured
  });

  it('utPlacement: the VERTEX channel uses the placement param, not the recovered atan2', () => {
    // rAnalytic returns theta as the "radius" so we can tell which param was used.
    const rAna = (theta: number): number => theta;
    const R = Math.PI / 2; // vertex radius
    // 3 vertices near azimuth 0 (on +x axis → atan2≈0), at t=0.5; stash u=0.25 (off-seam).
    const vv: number[] = [], uu: number[] = [];
    for (const a of [0.0, 0.01, 0.005]) { vv.push(R * Math.cos(a), R * Math.sin(a), 50); uu.push(0.25, 0.5, 0); }
    const m = { vertices: Float32Array.from(vv), indices: Uint32Array.from([0, 1, 2]) };
    const utA = Float32Array.from(uu);
    // Placement says u=0.25 → theta=PI/2 → rAna=PI/2=R → vertex dev ≈ 0.
    const place = Float32Array.from([0.25, 0.5, 0, 0.25, 0.5, 0, 0.25, 0.5, 0]);
    const base2 = { H: 100, tolMm: 0.1, seamExclU: 0.01, denseN: 4 };
    const withPlace = radialAnalyticDeviation(m, utA, rAna, { ...base2, utPlacement: place });
    const without = radialAnalyticDeviation(m, utA, rAna, base2);
    // WITH placement: vertex channel matches (radius == rAna(placement theta)).
    expect(withPlace.vertexMaxMm).toBeLessThan(0.01);
    // WITHOUT: recovered atan2≈0 → rAna≈0 → vertex dev ≈ R = PI/2.
    expect(without.vertexMaxMm).toBeGreaterThan(1.5);
  });

  it('celticKnotCreasePredicate: returns a function flagging the strand-boundary band', () => {
    const pred = celticKnotCreasePredicate(3, 0.15, 0, 3);
    expect(typeof pred).toBe('function');
    // It returns a boolean for any (u,t) without throwing.
    expect(typeof pred(0.3, 0.5)).toBe('boolean');
    // Sweeping u at fixed t, SOME points are in a crease band and some are not
    // (the braid has discrete strand boundaries, not the whole row).
    let inBand = 0, outBand = 0;
    for (let i = 0; i < 200; i++) { if (pred(i / 200, 0.5)) inBand++; else outBand++; }
    expect(inBand).toBeGreaterThan(0);
    expect(outBand).toBeGreaterThan(0);
  });

  it('geometricStarStrapField: dStrap field returns lo=0, hi=edge and the cliff band', () => {
    // Defaults: N=8 gap=0.05 detail=0.5 layers=4 roundness=0 zoom=1 shift=0 ⇒ edge=0.02.
    const sf = geometricStarStrapField(8, 0.05, 0.5, 4, 0, 1, 0);
    expect(sf.lo).toBe(0);
    expect(sf.hi).toBeCloseTo(0.02, 6);
    // The cliff band [lo,hi] is a thin sub-set of the dStrap range; the plateau
    // (dStrap<0) and flat gaps (dStrap≫edge) both occur across a u-sweep.
    let inBand = 0, plateau = 0, gap = 0;
    for (let i = 0; i < 2000; i++) {
      const d = sf.field(i / 2000, 0.125); // mid-tile (v=0)
      if (d >= sf.lo && d <= sf.hi) inBand++;
      else if (d < -0.04) plateau++;
      else if (d > 0.1) gap++;
    }
    expect(inBand).toBeGreaterThan(0);
    expect(plateau).toBeGreaterThan(0);
    expect(gap).toBeGreaterThan(0);
  });

  it('creaseStraddle: triangle-level straddle excludes a facet spanning a thin cliff (both verts outside)', () => {
    // A flat reference; inject a near-vertical "cliff" by a field with a thin band
    // [0,0.02] and a triangle whose two measured vertices sit OUTSIDE the band but
    // STRADDLE it (one below, one above) with the apex flipped off-surface. A
    // per-vertex predicate would MISS it (no vertex in band); the straddle catches it.
    const Hc = 100, R0c = 50, TAUc = 2 * Math.PI;
    const PT = (u: number, t: number, r: number): [number, number, number] => [r * Math.cos(u * TAUc), r * Math.sin(u * TAUc), t * Hc];
    // field(u): linear in u so u=0.30→-0.05 (plateau), u=0.50→+0.05 (gap); the cliff
    // band [0,0.02] sits at u≈0.402..0.404 — BETWEEN the two base vertices.
    const field = (u: number): number => (u - 0.402) * 0.5;
    const v: number[] = [], ut: number[] = [];
    const push = (u: number, t: number, r: number): void => { const [x, y, z] = PT(u, t, r); v.push(x, y, z); ut.push(u, t, 0); };
    push(0.30, 0.5, R0c); push(0.50, 0.5, R0c); push(0.40, 0.505, R0c + 2.0); // apex flipped +2mm
    const mesh = { vertices: Float32Array.from(v), indices: Uint32Array.from([0, 1, 2]) };
    const base = { H: Hc, tolMm: 0.1, denseN: 4 };
    const rAna = (): number => R0c;
    // WITHOUT straddle: the flipped apex drives maxDev ~2mm.
    const without = radialAnalyticDeviation(mesh, Float32Array.from(ut), rAna, base);
    expect(without.maxDevMm).toBeGreaterThan(1.9);
    // WITH straddle on the field band [0,0.02]: vertex field values are -0.051, +0.049,
    // -0.001 → range [-0.051, +0.049] OVERLAPS [0,0.02] → excluded (creaseBandMaxMm).
    const withS = radialAnalyticDeviation(mesh, Float32Array.from(ut), rAna, { ...base, creaseStraddle: { field, lo: 0, hi: 0.02 } });
    expect(withS.creaseBandMaxMm).toBeGreaterThan(1.9);
    expect(withS.maxDevMm).toBeLessThan(0.05);
  });

  it('creaseStraddle: a facet entirely off the band (plateau) is still MEASURED', () => {
    const Hc = 100, R0c = 50, TAUc = 2 * Math.PI;
    const PT = (u: number, t: number, r: number): [number, number, number] => [r * Math.cos(u * TAUc), r * Math.sin(u * TAUc), t * Hc];
    const field = (u: number): number => (u - 0.402) * 0.5; // u≈0.30 → -0.05 (deep plateau)
    const v: number[] = [], ut: number[] = [];
    const push = (u: number, t: number, r: number): void => { const [x, y, z] = PT(u, t, r); v.push(x, y, z); ut.push(u, t, 0); };
    push(0.30, 0.5, R0c); push(0.302, 0.5, R0c); push(0.301, 0.505, R0c); // all dStrap≈-0.05, on-surface
    const mesh = { vertices: Float32Array.from(v), indices: Uint32Array.from([0, 1, 2]) };
    const r = radialAnalyticDeviation(mesh, Float32Array.from(ut), () => R0c, { H: Hc, tolMm: 0.1, denseN: 4, creaseStraddle: { field, lo: 0, hi: 0.02 } });
    expect(r.creaseBandMaxMm).toBe(0); // not excluded
    expect(r.wallTriangles).toBe(1); // measured
  });

  it('basketWeaveCreaseLoci: strand edges u=(m-phase)/strands + interior layer rings', () => {
    const { creaseU, creaseT } = basketWeaveCreaseLoci(16, 10, 0);
    expect(creaseU).toHaveLength(16);
    expect(creaseU[0]).toBeCloseTo(0, 10); // m=0 strand edge at u=0 (= seam)
    expect(creaseU[8]).toBeCloseTo(0.5, 10); // m=8 → u=0.5
    expect(creaseT).toHaveLength(9); // k=1..9 interior layer rings (t=0/1 excluded)
    expect(creaseT[0]).toBeCloseTo(0.1, 10);
    // phase shifts the strand edges; loci stay in [0,1).
    const shifted = basketWeaveCreaseLoci(16, 10, 4);
    expect(shifted.creaseU.every((u) => u >= 0 && u < 1)).toBe(true);
  });
});
