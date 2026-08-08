// _s120EdgeRulerValidate.test.ts — VALIDATE THE EDGE RULER BEFORE IT IS USED. TWO-SIDED, ON CLOSED FORMS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE STANDING RULE THIS FILE EXISTS FOR
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A ruler that returns 0 everywhere passes a one-sided "the ruled edge reads ~0" test. A ruler that
// returns the RADIAL residual and calls it perpendicular passes every test on a CYLINDER, because on a
// cylinder they are equal. So every fixture below asserts BOTH directions, and the discriminating
// fixture is a CONE, where perpendicular and radial differ by exactly sqrt(1+k^2) and nothing else.
//
// FIXTURES
//   F1 RULED       — a cone GENERATOR (fixed theta, varying z) is a straight line ON the surface.
//                    Both the radial ruler and the perpendicular ruler must read 0 to f64 noise.
//   F2 CURVED      — a horizontal chord on a cone. Closed form: radial sag = r(1-cos(dth/2)) EXACTLY;
//                    perpendicular = that / sqrt(1+k^2) EXACTLY. Asserts the VALUE, and asserts the
//                    asymptotic sag law kappa*L^2/8 to the order it is valid at.
//   F3 DISCRIMINATOR — the SAME F2 edge: the perpendicular reading must be sqrt(1+k^2) = 1.0034662x
//                    SMALLER than the radial one. A radial ruler mislabelled perpendicular fails this.
//   F4 MOVED MAX   — a skew chord on a cone whose max is NOT at s=0.5. Closed form by golden section on
//                    the exact concave expression. Asserts the value AND that a midpoint-only ruler
//                    under-reads by a stated amount.
//   F5 SPIKE       — a tent-ridge surface whose radial profile has a spike NARROWER than the coarse
//                    sample spacing. Asserts (a) the converged ruler finds it, (b) rung nS=8 — which is
//                    EXACTLY the edge sample buried inside a k=8 facet lattice — MISSES it by a large
//                    factor, which is the whole reason this session exists, and (c) the ladder is
//                    monotone non-decreasing in nS, so a converged pair of rungs is evidence.
//   F6 TOPOLOGY    — uniqueEdges on a closed-form tube grid: counts must equal the closed form and must
//                    equal facetDihedralsBig's interior/boundary/nonManifold on the same soup.
import { describe, it, expect } from 'vitest';
import {
  radialResid, makeEdgeWorkspace, edgeRadialSag, goldenMax, weldExact, uniqueEdges,
} from '../tools/s120EdgeLib';
import { facetDihedralsBig } from './dihedralRulerBig';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';

const H = 120; const Rb = 40; const Rt = 50;
const K = (Rt - Rb) / H;                       // cone slope dr/dz
const SEC = Math.sqrt(1 + K * K);              // radial / perpendicular on a cone
const coneR = (_th: number, z: number): number => Rb + K * z;

/** EXACT perpendicular distance from P to the infinite cone r = Rb + K z (P inside, foot on the cone). */
const conePerpExact = (x: number, y: number, z: number): number =>
  Math.abs(Math.hypot(x, y) - (Rb + K * z)) / SEC;

const onCone = (th: number, z: number): [number, number, number] => {
  const r = coneR(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
};

/** brute reference: max over a very dense uniform scan. Slow, exact enough to be a reference. */
const bruteMax = (
  f: (s: number) => number, n: number,
): { max: number; s: number } => {
  let m = -Infinity; let sm = 0;
  for (let i = 0; i <= n; i += 1) { const s = i / n; const v = f(s); if (v > m) { m = v; sm = s; } }
  return { max: m, s: sm };
};

describe('S120 edge ruler — closed-form two-sided validation', () => {
  it('F1 RULED: a cone generator reads ~0 both radially and perpendicularly', () => {
    const a = onCone(0.7, 10); const b = onCone(0.7, 110);
    const w = makeEdgeWorkspace(256, 8);
    edgeRadialSag(coneR, a[0], a[1], a[2], b[0], b[1], b[2], 60, w);
    // radial: the chord IS the surface curve, so every point has residual 0 to f64 noise
    expect(w.max).toBeLessThan(1e-12);
    // perpendicular, via the production projector: same conclusion, and it must not be 0 by construction
    const proj = buildRadialSurfaceProjector(coneR, { H, nTheta: 512, nZ: 256, seedTopK: 6 });
    let pm = 0;
    for (let i = 0; i <= 256; i += 1) {
      const s = i / 256;
      const d = proj.project(a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1]), a[2] + s * (b[2] - a[2])).dist;
      if (d > pm) pm = d;
    }
    expect(pm).toBeLessThan(1e-6);
  });

  it('F1b CONTROL: the same projector is NOT identically zero — it reads a planted offset exactly', () => {
    const proj = buildRadialSurfaceProjector(coneR, { H, nTheta: 512, nZ: 256, seedTopK: 6 });
    const th = 0.7; const z = 60; const r = coneR(th, z);
    const off = 0.37;                                   // push the point radially inward by 0.37 mm
    const d = proj.project((r - off) * Math.cos(th), (r - off) * Math.sin(th), z).dist;
    expect(d).toBeGreaterThan(0);
    expect(Math.abs(d - off / SEC)).toBeLessThan(1e-7);  // exact cone perpendicular
  });

  it('F2 CURVED: a horizontal cone chord matches the closed-form sag, radially and perpendicularly', () => {
    const z = 60; const r = coneR(0, z);
    for (const dth of [0.02, 0.08, 0.25]) {
      const a = onCone(-dth / 2, z); const b = onCone(dth / 2, z);
      const w = makeEdgeWorkspace(256, 8);
      edgeRadialSag(coneR, a[0], a[1], a[2], b[0], b[1], b[2], 60, w);
      const radExact = r * (1 - Math.cos(dth / 2));
      expect(Math.abs(w.max - radExact) / radExact).toBeLessThan(1e-9);
      expect(Math.abs(w.sStar - 0.5)).toBeLessThan(1e-6);
      // asymptotic sag law kappa*L^2/8 with kappa = 1/r and L the chord length
      const L = 2 * r * Math.sin(dth / 2);
      const sagLaw = (1 / r) * L * L / 8;
      expect(Math.abs(sagLaw - radExact) / radExact).toBeLessThan(dth * dth);  // O(dth^2) relative
      // perpendicular, exact
      const perpExact = radExact / SEC;
      const proj = buildRadialSurfaceProjector(coneR, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });
      let pm = 0;
      for (let c = 0; c < w.nCand; c += 1) {
        const s = w.candS[c];
        const d = proj.project(a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1]), a[2] + s * (b[2] - a[2])).dist;
        if (d > pm) pm = d;
      }
      expect(Math.abs(pm - perpExact) / perpExact).toBeLessThan(1e-6);
    }
  });

  it('F3 DISCRIMINATOR: perpendicular is sqrt(1+k^2) SMALLER than radial on the cone — a radial ruler fails', () => {
    const z = 60; const r = coneR(0, z); const dth = 0.25;
    const a = onCone(-dth / 2, z); const b = onCone(dth / 2, z);
    const radExact = r * (1 - Math.cos(dth / 2));
    const proj = buildRadialSurfaceProjector(coneR, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });
    const mid: [number, number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const perp = proj.project(mid[0], mid[1], mid[2]).dist;
    const rad = radialResid(coneR, mid[0], mid[1], mid[2]);
    expect(Math.abs(rad - radExact) / radExact).toBeLessThan(1e-12);
    expect(Math.abs(rad / perp - SEC) / SEC).toBeLessThan(1e-6);
    expect(SEC).toBeGreaterThan(1.0034);      // the factor is real, not noise
    expect(perp).toBeLessThan(rad);           // perpendicular <= radial, the soundness invariant
  });

  it('F4 MOVED MAX: a skew cone chord peaks off the midpoint and the ruler tracks the closed form', () => {
    const a = onCone(-0.18, 20); const b = onCone(0.18, 100);
    const dx = b[0] - a[0]; const dy = b[1] - a[1]; const dz = b[2] - a[2];
    // exact radial residual along the chord: (Rb + K z(s)) - |xy(s)|, concave in s
    const exact = (s: number): number => (Rb + K * (a[2] + s * dz)) - Math.hypot(a[0] + s * dx, a[1] + s * dy);
    const g = goldenMax(exact, 0, 1, 200);
    expect(Math.abs(g.s - 0.5)).toBeGreaterThan(0.01);     // the max really is off-centre
    const w = makeEdgeWorkspace(256, 8);
    edgeRadialSag(coneR, a[0], a[1], a[2], b[0], b[1], b[2], 60, w);
    expect(Math.abs(w.max - g.v) / g.v).toBeLessThan(1e-9);
    expect(Math.abs(w.sStar - g.s)).toBeLessThan(1e-6);
    // a midpoint-only ruler under-reads, and by how much is stated rather than assumed
    const midOnly = exact(0.5);
    expect(midOnly).toBeLessThan(g.v);
    expect(g.v / midOnly).toBeGreaterThan(1.0001);
    // perpendicular closed form holds at the refined argmax
    const proj = buildRadialSurfaceProjector(coneR, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });
    const s = w.sStar;
    const d = proj.project(a[0] + s * dx, a[1] + s * dy, a[2] + s * dz).dist;
    expect(Math.abs(d - conePerpExact(a[0] + s * dx, a[1] + s * dy, a[2] + s * dz)) / d).toBeLessThan(1e-6);
  });

  it('F5 SPIKE: a sub-sample-width ridge is found at nS=256 and MISSED at nS=8 (the k=8 facet lattice)', () => {
    // tent ridge at theta0, half-width wRad, height A. Continuous, C0 at the crest — a planted cliff.
    const th0 = 0.5; const wRad = 0.004; const A = 0.6;
    const tentR = (th: number, _z: number): number => {
      let d = th - th0;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      const t = 1 - Math.abs(d) / wRad;
      return 45 + (t > 0 ? A * t : 0);
    };
    // An edge that spans the ridge but is much wider than it: 0.2 rad vs 0.008 rad full width, and
    // DELIBERATELY ASYMMETRIC — a symmetric span puts the crest at s=0.5, which every dyadic rung
    // samples exactly, and the fixture would then prove nothing about under-sampling.
    const zc = 60;
    const pt = (th: number): [number, number, number] => {
      const r = tentR(th, zc); return [r * Math.cos(th), r * Math.sin(th), zc];
    };
    const a = pt(th0 - 0.0431); const b = pt(th0 + 0.1569);
    const dx = b[0] - a[0]; const dy = b[1] - a[1];
    const exactAt = (s: number): number => radialResid(tentR, a[0] + s * dx, a[1] + s * dy, zc);
    const ref = bruteMax(exactAt, 4_000_000);
    const w = makeEdgeWorkspace(256, 8);
    edgeRadialSag(tentR, a[0], a[1], a[2], b[0], b[1], b[2], 80, w);
    // (a) converged ruler finds the ridge
    expect(Math.abs(w.max - ref.max) / ref.max).toBeLessThan(1e-4);
    expect(w.max).toBeGreaterThan(0.5);
    // (b) rung 3 (nS=8) — the edge sample inside a k=8 facet lattice — badly under-reads
    const rung8 = w.ladder[3];
    expect(rung8).toBeLessThan(w.max);
    expect(w.max / rung8).toBeGreaterThan(3);
    // (c) the ladder is monotone non-decreasing: a finer uniform grid contains the coarser one
    for (let j = 1; j <= w.levels; j += 1) expect(w.ladder[j]).toBeGreaterThanOrEqual(w.ladder[j - 1] - 0);
    // (d) and the coarse rungs really are strides of the fine one, not a separate scan
    expect(w.ladder[w.levels]).toBeLessThanOrEqual(w.max + 1e-15);
  });

  it('F5b SPIKE CONTROL: on a SMOOTH edge the nS=8 rung is already converged (the ladder is not always wrong)', () => {
    const z = 60; const dth = 0.05;
    const a = onCone(-dth / 2, z); const b = onCone(dth / 2, z);
    const w = makeEdgeWorkspace(256, 8);
    edgeRadialSag(coneR, a[0], a[1], a[2], b[0], b[1], b[2], 60, w);
    expect(w.max / w.ladder[3]).toBeLessThan(1.02);
  });

  it('F6 TOPOLOGY: uniqueEdges matches the tube closed form AND facetDihedralsBig on the same soup', () => {
    const nTh = 40; const nZ = 25;
    const xyz: number[] = [];
    const P = (i: number, j: number): [number, number, number] => {
      const th = (i % nTh) / nTh * 2 * Math.PI; const zz = (j / nZ) * H;
      const r = 45 + 2 * Math.sin(3 * th) + 0.5 * Math.cos(5 * zz / H);
      return [r * Math.cos(th), r * Math.sin(th), zz];
    };
    for (let i = 0; i < nTh; i += 1) {
      for (let j = 0; j < nZ; j += 1) {
        const p00 = P(i, j); const p10 = P(i + 1, j); const p01 = P(i, j + 1); const p11 = P(i + 1, j + 1);
        xyz.push(...p00, ...p10, ...p11);
        xyz.push(...p00, ...p11, ...p01);
      }
    }
    const nF = xyz.length / 9;
    const soup = new Float32Array(xyz);
    const { id, count } = weldExact(soup);
    const U = uniqueEdges(id, count, nF);
    // closed form for the wrapped tube grid
    const V = nTh * (nZ + 1);
    const E = nTh * (nZ + 1) + 2 * nTh * nZ;
    expect(count).toBe(V);
    expect(U.count).toBe(E);
    expect(U.boundary).toBe(2 * nTh);
    expect(U.interior).toBe(E - 2 * nTh);
    expect(U.nonManifold).toBe(0);
    expect(nF).toBe(2 * nTh * nZ);
    // and the shared instrument agrees, edge for edge
    const idx = new Int32Array(nF * 3);
    for (let i = 0; i < idx.length; i += 1) idx[i] = i;
    const DR = facetDihedralsBig(soup, idx);
    expect(DR.interiorEdges).toBe(U.interior);
    expect(DR.boundaryEdges).toBe(U.boundary);
    expect(DR.nonManifoldEdges).toBe(U.nonManifold);
  });

  it('F7 SOUNDNESS: perpendicular <= radial pointwise on a tangled analytic (the prefilter invariant)', () => {
    const wobbly = (th: number, z: number): number =>
      45 + 3 * Math.sin(7 * th + 0.3 * z) + 1.5 * Math.cos(11 * th - 0.17 * z) + 0.8 * Math.sin(0.4 * z);
    const proj = buildRadialSurfaceProjector(wobbly, { H, nTheta: 1024, nZ: 512, seedTopK: 6 });
    let viol = 0; let maxRatio = 0; let n = 0;
    for (let i = 0; i < 400; i += 1) {
      const th = (i * 0.0157) % (2 * Math.PI); const z = 5 + ((i * 0.29) % 110);
      const r = wobbly(th, z) * (1 - 0.004 * ((i % 7) + 1));
      const x = r * Math.cos(th); const y = r * Math.sin(th);
      const d = proj.project(x, y, z).dist;
      const rr = radialResid(wobbly, x, y, z);
      n += 1;
      if (d > rr + 1e-9) viol += 1;
      if (rr / Math.max(1e-12, d) > maxRatio) maxRatio = rr / Math.max(1e-12, d);
    }
    expect(n).toBe(400);
    expect(viol).toBe(0);
    expect(maxRatio).toBeGreaterThan(1.05);   // radial genuinely over-reads here; the two are not the same ruler
  });
});
