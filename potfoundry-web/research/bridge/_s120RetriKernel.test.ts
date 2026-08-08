// _s120RetriKernel.test.ts — S120 TASK D. THE FAILING TEST, WRITTEN FIRST.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT MECHANISM THIS IS THE FIX FOR — stated so the test can be read as a claim, not as scaffolding
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S120 Task C named it: THE DRIVER ADMITS FACETS UP TO aspect3 = PF_CB_SHAPE_AR (50) BUT CANNOT SPLIT
// ABOVE ~25. `bisectAt`'s own arithmetic is childAR/parentAR ~= 1/min(t,1-t) >= 2 at the best possible
// placement (t = 1/2), so a facet at AR > SHAPE_AR/2 has NO legal split ANYWHERE on ANY of its three
// edges: every candidate placement produces a child over the same cap the parent was admitted under.
// The facet is then STRANDED at its birth fidelity for the rest of the run while its neighbours refine
// around it — which is the positive-feedback cascade S119 measured (pole count ~ N^1.992 / N^1.810).
//
// NO GUARD AT THE EMIT SITE CAN FIX THAT (S118's ADMIT gate cleared the class only by making the headline
// MAX 2.18x worse), because refusing the emit does not give the driver a LEGAL MOVE — it only deletes the
// illegal one. What is missing is a move: an operator that changes the CONNECTIVITY of the trapped facet's
// patch, at ZERO net triangles and ZERO new vertices, so that the trapped shape stops existing.
//
// That operator is the 1-ring retriangulation: take the trapped facet t and its three edge-neighbours
// (4 triangles, one hexagonal boundary, 6 ring vertices, no interior vertex), delete them, and re-fill the
// hexagon with the triangulation that MINIMISES THE MAXIMUM 3-D aspect3 over all of its triangulations.
// 4 triangles in, 4 triangles out. This file tests that kernel and nothing else: it is pure geometry, no
// mesh, no globals, no I/O — exactly the shape of _shapeGuard.ts, and for the same reason.
//
// TWO METRICS, DELIBERATELY DIFFERENT, AND THE TESTS PIN BOTH:
//   * SHAPE is scored in 3-D with `aspect3` — the driver's own emit-guard metric and the census's own
//     metric, so a repair scored here is checkable by the instrument that judges the mesh (K8).
//   * ORIENTATION is scored in the (theta, z) PARAMETER plane — the driver's own fold test
//     (`signedAreaParam`) — because a triangulation that is fine in 3-D can still fold the
//     parametrisation, and a folded sheet passes every incidence/Euler/orientation check (K4).
//
//   npx vitest run --config vitest.s120retri.config.ts
import { describe, it, expect } from 'vitest';
import { aspect3 } from './_shapeGuard';
import { retriMinMaxAr, retriFan, maxArOfTri, triSignsOk, type RetriOut } from './_s120RetriKernel';

/** brute force: every triangulation of a convex-position n-gon, by recursive ear enumeration. */
function allTriangulations(n: number): number[][][] {
  const memo = new Map<string, number[][][]>();
  const rec = (i: number, j: number): number[][][] => {
    if (j - i < 2) return [[]];
    const k0 = `${i},${j}`;
    const hit = memo.get(k0); if (hit !== undefined) return hit;
    const out: number[][][] = [];
    for (let k = i + 1; k < j; k += 1) {
      for (const L of rec(i, k)) for (const Rr of rec(k, j)) out.push([[i, k, j], ...L, ...Rr]);
    }
    memo.set(k0, out);
    return out;
  };
  return rec(0, n - 1);
}

const arOfIdx = (t: number[], x: number[], y: number[], z: number[]): number =>
  aspect3(x[t[0]], y[t[0]], z[t[0]], x[t[1]], y[t[1]], z[t[1]], x[t[2]], y[t[2]], z[t[2]]);

/** 2x signed area of the ring in the parameter plane. */
const ringSign = (u: number[], v: number[]): number => {
  let s = 0;
  for (let i = 0; i < u.length; i += 1) { const j = (i + 1) % u.length; s += u[i] * v[j] - u[j] * v[i]; }
  return Math.sign(s);
};

/** a triangulation is STRUCTURALLY valid iff each ring edge is used once and each chord exactly twice. */
function edgeUse(tri: number[], n: number): { bnd: number[]; chordBad: number } {
  const use = new Map<string, number>();
  for (let i = 0; i < tri.length; i += 3) {
    const p = [tri[i], tri[i + 1], tri[i + 2]];
    for (let e = 0; e < 3; e += 1) {
      const a = p[e]; const b = p[(e + 1) % 3];
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  const bnd: number[] = [];
  for (let i = 0; i < n; i += 1) { const j = (i + 1) % n; const k = i < j ? `${i}_${j}` : `${j}_${i}`; bnd.push(use.get(k) ?? 0); use.delete(k); }
  let chordBad = 0;
  for (const c of use.values()) if (c !== 2) chordBad += 1;
  return { bnd, chordBad };
}

// ── F1: a regular hexagon, flat in z. Parameter plane == the 3-D plane, so brute force is exact. ──
const F1 = ((): { x: number[]; y: number[]; z: number[]; u: number[]; v: number[] } => {
  const x: number[] = []; const y: number[] = []; const z: number[] = [];
  for (let k = 0; k < 6; k += 1) { const a = (k * Math.PI) / 3; x.push(Math.cos(a)); y.push(Math.sin(a)); z.push(0); }
  return { x, y, z, u: x.slice(), v: y.slice() };
})();

// ── F2: THE TRAP, and it is the mechanism verbatim. Ring vertex 1 sits 1 µm off the straight line
//    through 0 and 2, so the ear (0,1,2) is a facet at aspect3 ~ 2000 — admitted by no guard, but the
//    driver EMITS shapes like it and then cannot split them. A different triangulation of the SAME
//    hexagon, with the SAME six vertices and NO new triangle, never uses that ear at all. ──
const F2 = {
  x: [0, 1, 2, 2, 1, 0], y: [0, 0.001, 0, 1, 1, 1], z: [0, 0, 0, 0, 0, 0],
  u: [0, 1, 2, 2, 1, 0], v: [0, 0.001, 0, 1, 1, 1],
};

// ── F3: 3-D SHAPE vs PARAMETER ORIENTATION are different quantities. A patch of a cylinder of radius 8:
//    (u,v) is (arc, z) and is a well-shaped rectangle-ish hexagon, but the 3-D chords are shortened by
//    the wrap, so `aspect3` in 3-D is NOT the parameter-plane aspect. The kernel must rank on the 3-D one. ──
const F3 = ((): { x: number[]; y: number[]; z: number[]; u: number[]; v: number[] } => {
  const Rr = 8;
  const th = [0, 0.35, 0.7, 0.7, 0.35, 0];
  const zz = [0, 0.02, 0, 1.2, 1.2, 1.2];
  const x = th.map((t) => Rr * Math.cos(t)); const y = th.map((t) => Rr * Math.sin(t));
  return { x, y, z: zz.slice(), u: th.map((t) => Rr * t), v: zz.slice() };
})();

describe('S120 1-ring retriangulation kernel', () => {
  it('K1 — regular hexagon: the DP attains the brute-force min-max 3-D aspect3', () => {
    const out = retriMinMaxAr(6, F1.x, F1.y, F1.z, F1.u, F1.v, Infinity);
    expect(out.ok).toBe(true);
    expect(out.reason).toBe('ok');
    let best = Infinity;
    for (const T of allTriangulations(6)) {
      let m = 0; for (const t of T) m = Math.max(m, arOfIdx(t, F1.x, F1.y, F1.z));
      best = Math.min(best, m);
    }
    expect(out.maxAr).toBeCloseTo(best, 12);
    expect(out.tri.length).toBe(12);         // 4 triangles, always: n - 2 for n = 6
  });

  it('K2 — THE TRAP: an incumbent fan at aspect3 ~ 2e3 is replaced, at ZERO net triangles, by max AR < 25', () => {
    const fan = retriFan(6, 0);
    const fanMax = maxArOfTri(fan, F2.x, F2.y, F2.z);
    expect(fanMax).toBeGreaterThan(1000);    // the trapped shape: no legal split exists at SHAPE_AR = 50
    const out = retriMinMaxAr(6, F2.x, F2.y, F2.z, F2.u, F2.v, 50);
    expect(out.ok).toBe(true);
    expect(out.maxAr).toBeLessThan(25);      // ... and the repair is BELOW the split cap, not merely below the emit cap
    expect(out.tri.length).toBe(fan.length); // 4 in, 4 out — the operator spends no triangles
  });

  it('K3 — the DP output is a structurally valid triangulation (ring edge x1, chord x2)', () => {
    for (const F of [F1, F2, F3]) {
      const out = retriMinMaxAr(6, F.x, F.y, F.z, F.u, F.v, Infinity);
      expect(out.ok).toBe(true);
      const { bnd, chordBad } = edgeUse(out.tri, 6);
      expect(bnd).toEqual([1, 1, 1, 1, 1, 1]);
      expect(chordBad).toBe(0);
    }
  });

  it('K4 — every emitted triangle carries the RING’s parameter-plane orientation (fold-free)', () => {
    for (const F of [F1, F2, F3]) {
      const out = retriMinMaxAr(6, F.x, F.y, F.z, F.u, F.v, Infinity);
      expect(triSignsOk(out.tri, F.u, F.v, ringSign(F.u, F.v))).toBe(true);
    }
  });

  it('K5 — a degenerate ring is REFUSED by name, never silently fanned', () => {
    const u = [0, 1, 2, 3, 4, 5]; const v = [0, 0, 0, 0, 0, 0];
    const out = retriMinMaxAr(6, u, v, v, u, v, Infinity);
    expect(out.ok).toBe(false);
    expect(out.reason).toBe('ring-degenerate');
  });

  it('K6 — capAr is a REFUSAL, and the achievable max is still reported so the caller can price it', () => {
    const free: RetriOut = retriMinMaxAr(6, F1.x, F1.y, F1.z, F1.u, F1.v, Infinity);
    const capped = retriMinMaxAr(6, F1.x, F1.y, F1.z, F1.u, F1.v, free.maxAr * 0.5);
    expect(capped.ok).toBe(false);
    expect(capped.reason).toBe('over-cap');
    expect(capped.maxAr).toBeCloseTo(free.maxAr, 12);
    const justOk = retriMinMaxAr(6, F1.x, F1.y, F1.z, F1.u, F1.v, free.maxAr * (1 + 1e-12));
    expect(justOk.ok).toBe(true);
  });

  it('K7 — deterministic: the same ring twice gives byte-equal output', () => {
    const a = retriMinMaxAr(6, F3.x, F3.y, F3.z, F3.u, F3.v, 50);
    const b = retriMinMaxAr(6, F3.x, F3.y, F3.z, F3.u, F3.v, 50);
    expect(a.tri).toEqual(b.tri);
    expect(a.maxAr).toBe(b.maxAr);
    expect(a.reason).toBe(b.reason);
  });

  it('K8 — RULER IDENTITY: maxArOfTri is `_shapeGuard.aspect3`, the census’s own metric, to the last digit', () => {
    const out = retriMinMaxAr(6, F3.x, F3.y, F3.z, F3.u, F3.v, Infinity);
    let m = 0;
    for (let i = 0; i < out.tri.length; i += 3) m = Math.max(m, arOfIdx([out.tri[i], out.tri[i + 1], out.tri[i + 2]], F3.x, F3.y, F3.z));
    expect(maxArOfTri(out.tri, F3.x, F3.y, F3.z)).toBe(m);
    expect(out.maxAr).toBe(m);
  });

  it('K9 — the PLACEBO fan is structurally identical work: same triangle count, same edge use, different CHOICE', () => {
    for (let a0 = 0; a0 < 6; a0 += 1) {
      const fan = retriFan(6, a0);
      expect(fan.length).toBe(12);
      const { bnd, chordBad } = edgeUse(fan, 6);
      expect(bnd).toEqual([1, 1, 1, 1, 1, 1]);
      expect(chordBad).toBe(0);
    }
    // ... and on the TRAP fixture the placebo is measurably WORSE than the DP, which is the whole point
    // of running it: an improvement that a random valid fan also delivers is not the operator's.
    const dp = retriMinMaxAr(6, F2.x, F2.y, F2.z, F2.u, F2.v, Infinity);
    let anyWorse = false;
    for (let a0 = 0; a0 < 6; a0 += 1) if (maxArOfTri(retriFan(6, a0), F2.x, F2.y, F2.z) > dp.maxAr) anyWorse = true;
    expect(anyWorse).toBe(true);
  });

  it('K10 — 3-D SHAPE, not parameter shape: the wrap changes the answer', () => {
    const out3d = retriMinMaxAr(6, F3.x, F3.y, F3.z, F3.u, F3.v, Infinity);
    // score the SAME rings in the parameter plane and confirm the argmin differs or the value does —
    // if these agreed identically the kernel would not be measuring what its header claims.
    const outPar = retriMinMaxAr(6, F3.u, F3.v, F3.v.map(() => 0), F3.u, F3.v, Infinity);
    expect(out3d.maxAr).not.toBe(outPar.maxAr);
  });

  it('K12 — THE TIE the driver must refuse vs THE WIN it must take (the live-lock boundary)', () => {
    // A mesh 1-ring is the facet (0,2,4) plus three ears — chords (0,2) (2,4) (4,0). The driver's
    // acceptance test is STRICT: newMax < incumbentMax. That is not fussiness, it is the no-cycle
    // argument — accepting a TIE lets the operator re-emit an equally-good patch, whose products are
    // re-queued, popped, and retriangulated again, forever. These two fixtures sit on either side of it.
    const incumbentMax = (F: typeof F1): number => maxArOfTri([0, 2, 4, 0, 1, 2, 2, 3, 4, 4, 5, 0], F.x, F.y, F.z);
    const GAIN = 0.001;                                        // the driver's PF_CB_S120_RETRI_GAIN default
    // (a) REGULAR HEXAGON — the incumbent triforce is already optimal, and the DP "beats" it BY ONE ULP:
    //     3.7320508075688767 vs 3.7320508075688776. A bare `> 0` test fires on that and re-emits an
    //     equally-good patch forever. MEASURED, and it is the reason the floor is not zero.
    const f1 = retriMinMaxAr(6, F1.x, F1.y, F1.z, F1.u, F1.v, Infinity);
    const ulpGain = 1 - f1.maxAr / incumbentMax(F1);
    expect(ulpGain).toBeGreaterThan(0);                        // a bare `<` WOULD fire — the trap in the guard
    expect(ulpGain).toBeLessThan(1e-12);                       // ... on a gain 12 orders below the floor
    expect(f1.maxAr < incumbentMax(F1) * (1 - GAIN)).toBe(false);   // ⇒ the driver refuses: no live-lock
    // (b) THE TRAP — the incumbent is a 2e3 sliver and the DP beats it by more than 80x. The driver fires.
    const f2 = retriMinMaxAr(6, F2.x, F2.y, F2.z, F2.u, F2.v, Infinity);
    expect(incumbentMax(F2)).toBeGreaterThan(1000);
    expect(f2.maxAr < incumbentMax(F2) * (1 - GAIN)).toBe(true);    // ⇒ the driver fires
    expect(incumbentMax(F2) / f2.maxAr).toBeGreaterThan(80);
  });

  it('K11 — n is honoured: a quadrilateral 1-ring (n = 4) yields 2 triangles', () => {
    const u = [0, 1, 1, 0]; const v = [0, 0, 1, 1];
    const out = retriMinMaxAr(4, u, v, [0, 0, 0, 0], u, v, Infinity);
    expect(out.ok).toBe(true);
    expect(out.tri.length).toBe(6);
    const { bnd, chordBad } = edgeUse(out.tri, 4);
    expect(bnd).toEqual([1, 1, 1, 1]);
    expect(chordBad).toBe(0);
  });
});
