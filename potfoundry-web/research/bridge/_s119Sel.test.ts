// _s119Sel.test.ts — S119 TASK 1, the FAILING TEST FIRST.
//
// WHAT IS UNDER TEST. S118 named the STRATA-001 cause: on a radius cliff the driver selects the edge to
// split by a 3-D quantity (max-SAG, or longest-3-D). Halving delta-theta across a cliff does NOT shorten
// the 3-D edge — the radius jump is a constant term under the square root — so the driver splits the same
// edge again and again while the PARAMETRIC footprint collapses to zero. That is the DEGENERACY POLE.
//
// The fix is a metric change, so the test is a metric test: the parameter-metric edge length must HALVE
// when delta-theta halves ON A CLIFF, at exactly the moment the 3-D length does not move. Everything else
// here pins the selection rule that consumes it.
//
//   npx vitest run --config vitest.s119sel.config.ts
import { describe, it, expect } from 'vitest';
import { paramEdgeLen, s119Order, parseS119Sel, makeS119Rng } from './_s119Sel';

// CelticTriquetra's measured C0 cliff: rA jumps 1.720469 mm across the Math.floor(angle/(CT_TAU/3)) step
// (src/geometry/styles.ts:2263). These are the numbers the pole is made of, not invented ones.
const R_LO = 40;
const R_HI = 40 + 1.720469;

describe('S119 parameter-metric edge length', () => {
  it('is the arc-space length: pure-theta and pure-z edges reduce to r*dTheta and |dz|', () => {
    expect(paramEdgeLen(50, 50, 0.01, 0)).toBeCloseTo(0.5, 12);
    expect(paramEdgeLen(50, 50, 0, -0.25)).toBeCloseTo(0.25, 12);
    expect(paramEdgeLen(40, 60, 0.01, 0)).toBeCloseTo(0.5, 12); // rMean = 50
  });

  it('*** HALVES WHEN dTheta HALVES ACROSS A CLIFF, WHERE THE 3-D LENGTH DOES NOT ***', () => {
    const dz = 0;
    const l3 = (dth: number): number => {
      const ax = R_LO; const ay = 0;
      const bx = R_HI * Math.cos(dth); const by = R_HI * Math.sin(dth);
      return Math.hypot(bx - ax, by - ay, dz);
    };
    let dth = 1e-3;
    const l3First = l3(dth);
    const lpFirst = paramEdgeLen(R_LO, R_HI, dth, dz);
    for (let k = 0; k < 10; k += 1) dth /= 2;
    // 3-D: pinned to the radius jump, effectively immobile under ten halvings of dTheta.
    expect(l3(dth) / l3First).toBeGreaterThan(0.999);
    // PARAMETRIC: down by 2^10. THIS is the quantity a split must be able to shorten.
    expect(paramEdgeLen(R_LO, R_HI, dth, dz) / lpFirst).toBeCloseTo(1 / 1024, 6);
  });
});

describe('S119 selection order', () => {
  // A cliff triangle: edge 0 crosses the jump (3-D LONG, parametrically SHORT), edges 1 and 2 run along
  // the surface. The control rules (max-sag / longest-3-D) pick edge 0 and drive the pole; `param` must not.
  const lp: [number, number, number] = [0.004, 0.9, 0.7];
  const l3: [number, number, number] = [1.721, 0.9, 0.7];

  it('`param` picks the parametrically-longest edge even when it is the 3-D shortest', () => {
    expect(s119Order('param', lp, l3, [0, 1, 2], makeS119Rng(1))[0]).toBe(1);
  });
  it('`long3d` picks the 3-D longest — the arm that isolates METRIC from LONGEST-EDGE-RULE', () => {
    expect(s119Order('long3d', lp, l3, [0, 1, 2], makeS119Rng(1))[0]).toBe(0);
  });
  it('`short3d` picks the 3-D shortest — an uninformed placebo', () => {
    expect(s119Order('short3d', lp, l3, [0, 1, 2], makeS119Rng(1))[0]).toBe(2);
  });
  it('returns a PERMUTATION of the candidate list in every mode — no candidate is dropped', () => {
    for (const m of ['param', 'long3d', 'short3d', 'rand'] as const) {
      for (const cand of [[0, 1, 2], [1, 2], [0, 2], [2]]) {
        const o = s119Order(m, lp, l3, cand, makeS119Rng(7));
        expect(o.slice().sort()).toEqual(cand.slice().sort());
      }
    }
  });
  it('ties keep ascending edge index, exactly as the control`s stable sort does', () => {
    const flat: [number, number, number] = [0.5, 0.5, 0.5];
    expect(s119Order('param', flat, flat, [0, 1, 2], makeS119Rng(1))).toEqual([0, 1, 2]);
  });
  it('`rand` is DETERMINISTIC given a seed (a placebo arm has to be reproducible)', () => {
    const a = s119Order('rand', lp, l3, [0, 1, 2], makeS119Rng(12345));
    const b = s119Order('rand', lp, l3, [0, 1, 2], makeS119Rng(12345));
    expect(a).toEqual(b);
  });
  it('`rand` actually permutes — it is not a disguised identity', () => {
    const seen = new Set<string>();
    const rng = makeS119Rng(99);
    for (let i = 0; i < 200; i += 1) seen.add(s119Order('rand', lp, l3, [0, 1, 2], rng).join(''));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('S119 flag parsing — FAIL LOUD, matching the PF_CB_RANK precedent', () => {
  it('returns null when unset or empty, so flag-OFF is the untouched path', () => {
    expect(parseS119Sel(undefined)).toBeNull();
    expect(parseS119Sel('')).toBeNull();
    expect(parseS119Sel('0')).toBeNull();
  });
  it('accepts the four modes and maps 1 to param', () => {
    expect(parseS119Sel('1')).toBe('param');
    expect(parseS119Sel('param')).toBe('param');
    expect(parseS119Sel('long3d')).toBe('long3d');
    expect(parseS119Sel('short3d')).toBe('short3d');
    expect(parseS119Sel('rand')).toBe('rand');
  });
  it('THROWS on a typo — a run tagged as one experiment and driven by another is the confound', () => {
    expect(() => parseS119Sel('paramm')).toThrow(/PF_CB_S119_PARAMSEL/);
  });
});
