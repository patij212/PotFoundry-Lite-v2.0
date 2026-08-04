// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// _s29FpVeto.test.ts — THE BARS FOR THE FOOT-POINT ACCEPT-SIDE VETO (PF_CB_FPVETO). RESEARCH ONLY.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// S29 died on COST, not on correctness: ~2,844 rA evaluations per honest accept test, and the mesher ran
// its entire 5,400 s budget without converging. The veto keeps S29's rule verbatim —
//     accept(t)  <=>  blindAccept(t)  AND  ( listed(t) ? perp(t) <= bar : true )
// — and swaps only the POINT RULER underneath it: `s29PerpAt`'s registered sweep + descent + damped Newton
// (~1,241 rA evals a point) for `footPointDistance`'s Gauss-Newton relaxation (~5 rA evals an iteration).
//
// These bars are written BEFORE the implementation and every one of them must be seen to FAIL first.
// The three that carry the argument:
//   * TEETH (V9) — on a slope the radial foot reads 300.000 um and the answer is 294.174 um. A reading that
//     is only reachable BY SOLVING. A ruler that quietly returns the radial foot passes every cylinder bar
//     ever written and this one alone.
//   * NEVER UNDER-STATES — the veto's whole licence is `_facetTruthLib`'s rule that every candidate is a
//     genuine surface point and therefore an UPPER bound. If Gauss-Newton can return something BELOW the
//     true distance the veto accepts facets the certificate rejects, which is worse than not having it.
//   * COST — the registered success criterion. <= ~50 rA evaluations per honest accept test.
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { fpVetoAt, fpVetoTriangle } from './s29FpVeto';
import { distRadial, type RadiusFn } from './s29Perp';

const H = 120;
const R0 = 45;
const cylinder: RadiusFn = () => R0;
const cone = (k: number): RadiusFn => (_th, z) => R0 + k * z;

/** count rA calls without changing what the ruler sees */
const counted = (f: RadiusFn): { fn: RadiusFn; n: () => number } => {
  let n = 0;
  return { fn: (th, z) => { n += 1; return f(th, z); }, n: () => n };
};

describe('s29FpVeto — the point ruler', () => {
  // ── TEETH. The V9 fixture, verbatim: perpendicular = gap*cos(slope), radial = gap.
  it('V9 solves the perpendicular foot on a slope, not the radial one', () => {
    for (const k of [0.2, 0.5, 1.0]) {
      const rA = cone(k);
      const th = 0.7; const z = 50; const gap = 0.3;
      const rp = rA(th, z) - gap;
      const px = rp * Math.cos(th); const py = rp * Math.sin(th);
      const expected = gap / Math.sqrt(1 + k * k);
      const radial = distRadial(rA, H, px, py, z);
      const r = fpVetoAt(rA, px, py, z, th, z, { H });
      expect(Math.abs(r.d - expected) / expected).toBeLessThan(1e-4);
      // and the bar has teeth: the radial reading is a DIFFERENT number, so this cannot be passed by
      // returning the seed.
      expect(radial / r.d).toBeGreaterThan(1.0);
    }
  });

  // ── V8. A cylinder's radial foot ALREADY IS its perpendicular foot, so this tests accuracy, not the
  //    solver — and it must not be DEGRADED by the solver either (a diverging Newton walks off a converged
  //    seed).
  it('V8 cylinder offsets are exact and the solver does not walk off them', () => {
    for (const off of [0.4, 0.05, 0.004]) {
      const rp = R0 - off; const th = 1.1; const z = 47;
      const r = fpVetoAt(cylinder, rp * Math.cos(th), rp * Math.sin(th), z, th, z, { H });
      expect(Math.abs(r.d - off)).toBeLessThan(1e-7);
    }
  });

  // ── NEVER UNDER-STATES. On a feature-bearing surface, over 40 probes: perpendicular <= radial is
  //    structural, and the reading must never fall below the true distance (checked against the exact
  //    offset, which is constructed).
  it('is an UPPER bound: never below the constructed truth, never above the radial reading', () => {
    const k = 0.7;
    const rA = cone(k);
    let viol = 0; let under = 0;
    for (let i = 0; i < 40; i += 1) {
      const th = 0.3 + i * 0.05; const z = 10 + i * 2.5;
      const gap = 0.02 + i * 0.005;
      const rp = rA(th, z) - gap;
      const px = rp * Math.cos(th); const py = rp * Math.sin(th);
      const exact = gap / Math.sqrt(1 + k * k);
      const radial = distRadial(rA, H, px, py, z);
      const r = fpVetoAt(rA, px, py, z, th, z, { H });
      if (r.d > radial + 1e-9) viol += 1;
      if (r.d < exact - 1e-9) under += 1;
    }
    expect(viol).toBe(0);
    expect(under).toBe(0);
  });

  // ── THE BOUNDS ARE LOAD-BEARING. Gauss-Newton with no damping can take an unbounded step; the domain
  //    clamp is what stops a bad step leaving the patch (and, on a bounded surface, the domain).
  it('honours uBounds/vBounds — a diverging step cannot leave the patch', () => {
    const rA = cone(1.0);
    const th = 0.7; const z = 50;
    const rp = rA(th, z) - 0.3;
    const r = fpVetoAt(rA, rp * Math.cos(th), rp * Math.sin(th), z, th, z, {
      H, uBounds: [th - 1e-4, th + 1e-4], vBounds: [z - 1e-3, z + 1e-3],
    });
    // pinned inside a window far too small to reach the true foot, the reading is WORSE (an upper bound
    // is still an upper bound) — but it is finite, and it is not the unclamped answer.
    expect(Number.isFinite(r.d)).toBe(true);
    expect(r.d).toBeGreaterThan(0.3 / Math.sqrt(2));
  });
});

describe('s29FpVeto — the accept quantity over a triangle', () => {
  /** a chord facet across the cylinder subtending `dth`: exact sagitta R(1-cos(dth/2)) */
  const chord = (dth: number, rA: RadiusFn = cylinder): Parameters<typeof fpVetoTriangle> => {
    const t0 = 1.0; const zA = 40; const zB = 40 + 45 * dth;
    return [
      rA,
      R0 * Math.cos(t0), R0 * Math.sin(t0), zA,
      R0 * Math.cos(t0 + dth), R0 * Math.sin(t0 + dth), zA,
      R0 * Math.cos(t0 + dth / 2), R0 * Math.sin(t0 + dth / 2), zB,
      { H, tol: 0.01 },
    ];
  };

  it('T1 recovers a chord of known sagitta', () => {
    const dth = 0.02;
    const sag = R0 * (1 - Math.cos(dth / 2));
    const r = fpVetoTriangle(...chord(dth));
    expect(r.witnessed).toBeLessThanOrEqual(sag + 1e-6);
    expect(r.witnessed).toBeGreaterThan(sag * 0.4);
  });

  it('F3 the accept decision goes BOTH ways on geometry of known error', () => {
    const coarse = fpVetoTriangle(...chord(0.06));   // sagitta 20.25 um — REJECT at a 10 um bar
    const fine = fpVetoTriangle(...chord(0.02));     // sagitta  2.25 um — ACCEPT
    expect(coarse.witnessed).toBeGreaterThan(0.01);
    expect(fine.witnessed).toBeLessThanOrEqual(0.01);
  });

  // ── THE REGISTERED SUCCESS CRITERION. S29 measured ~2,844 rA evaluations per honest accept test; the
  //    criterion for this arm is <= ~50. `cost` is COUNTED, not estimated — the bar is checked against the
  //    ruler's own counter AND against an independent count of the rA calls, so a mis-accounted cost cannot
  //    pass it.
  it('COST: an honest accept test costs <= 50 rA evaluations', () => {
    const c = counted(cylinder);
    const args = chord(0.02);
    args[0] = c.fn;
    const r = fpVetoTriangle(...args);
    expect(r.cost).toBe(c.n());
    expect(r.cost).toBeLessThanOrEqual(50);
  });

  // A REJECTING test is the expensive side — it is the one that actually runs Newton. It must not blow the
  // budget either: the max is exact because radial >= perpendicular pointwise, so a point whose RADIAL
  // reading is already at or below the running max cannot raise it and is never tightened.
  it('COST: a rejecting accept test tightens only what can move the max', () => {
    const c = counted(cylinder);
    const args = chord(0.06);
    args[0] = c.fn;
    const r = fpVetoTriangle(...args);
    expect(r.cost).toBe(c.n());
    expect(r.cost).toBeLessThanOrEqual(150);
    expect(r.fpPoints).toBeGreaterThan(0);
  });

  // ── THE SKIP IS EXACT, NOT A HEURISTIC. Tightening every over-bar lattice point must give the SAME
  //    witnessed value as tightening only those that can move the max. If it does not, the cheap path is
  //    buying its speed with the answer.
  it('the max-driven skip returns the same reading as tightening everything', () => {
    for (const dth of [0.02, 0.04, 0.06, 0.1]) {
      const lazy = fpVetoTriangle(...chord(dth));
      const args = chord(dth);
      (args[10] as { tightenAll?: boolean }).tightenAll = true;
      const eager = fpVetoTriangle(...args);
      expect(Math.abs(lazy.witnessed - eager.witnessed)).toBeLessThan(1e-9);
      expect(lazy.cost).toBeLessThanOrEqual(eager.cost);
    }
  });
});
