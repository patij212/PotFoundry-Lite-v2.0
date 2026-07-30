// _strataLocusTraceNegControl.test.ts — S10 TRACER NEGATIVE CONTROL, LAYER 1 (synthetic, closed form).
//
// RUN:  npx vitest run research/bridge/_strataLocusTraceNegControl.test.ts -c vitest.s10trace.config.ts
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS FILE EXISTS, STATED AS A THREAT MODEL
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The aligned seed places CONSTRAINT EDGES on the traced loci. A mistraced curve is therefore not a
// degraded result, it is a MISPLACED CONSTRAINT — a brand-new artifact class, manufactured with the same
// confidence as a correct one, and invisible to every instrument the campaign already owns (the shape
// census scores triangles, not whether they sit on the feature; H1/H2 would read it as ordinary
// under-refinement). So the tracer must be validated against ground truth BEFORE it is trusted, on
// surfaces whose loci are known in CLOSED FORM.
//
// AND THE VALIDATION MUST BE ABLE TO FAIL. Every check below is run twice: once on the tracer's own output
// and once on a DELIBERATELY PERTURBED copy of it (each traced vertex pushed PERTURB_UM normal to the local
// tangent). The perturbed run must FAIL every bar the clean run passes. An instrument that cannot fail is
// not an instrument — the 2026-07-29 retraction in this campaign's worklog exists because three separate
// checks were structurally incapable of seeing a real defect.
//
// COMPLETENESS IS CHECKED SEPARATELY FROM ACCURACY, because a tracer that finds ONE locus and traces it
// perfectly passes every distance bar. Each fixture states how many locus components it has and the test
// asserts that count.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// PRE-STATED BARS (registered in research/lab/2026-07-29-strata-perf-convergence-worklog.md, S10 section,
// BEFORE this file was first executed):
//   T1  every traced vertex within  25 um  of the nearest analytic locus            (max, surface metric)
//   T2  every analytic sample within 50 um of the nearest traced polyline segment   (max, both directions
//       together = a two-sided Hausdorff bound)
//   T3  component COUNT exactly as the closed form says
//   T4  a PERTURB_UM = 200 um normal perturbation FAILS T1 and T2  (expect-nonzero discipline)
//   T5  junction positions within 100 um of the closed-form crossing, and the count exact
// ────────────────────────────────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { canonTheta, dThRaw, type SweepPredConst, type SweepRadiusFn } from './_sweepPredicate';
import { traceLoci, splitAtSeam, DEFAULT_TRACE_OPTS, type LocusArtifact } from './_strataLocusTrace';

const TWO_PI = Math.PI * 2;

/** The driver's own kink constants at their defaults (_strataConformBisect.test.ts `PRED`). */
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.0006,
};

const BAR_VERT_UM = 25;
const BAR_CURVE_UM = 50;
const BAR_JN_UM = 100;
const PERTURB_UM = 200;

const H = 120;
const RBASE = 45;
const AMP = 1.5;

// ───────────────────────────── fixtures: r(theta,z) with loci in closed form ─────────────────────────────

/** triangular wave of period 1 with its minimum at s=0.5 and its maximum at s=0 — kinks at BOTH. */
const tri = (s: number): number => Math.abs(s - Math.floor(s) - 0.5) * 2;

/**
 * FIXTURE A — n VERTICAL crease families. r = R - amp * tri(n*theta/2pi + phase).
 * Loci: the 2n straight lines theta = 2pi*(k/2 - phase)/n, k = 0..2n-1.
 */
function fixtureA(n: number, phase: number): { r: SweepRadiusFn; loci: (z: number) => number[] } {
  return {
    r: (th) => RBASE - AMP * tri((th * n) / TWO_PI + phase),
    loci: () => {
      const out: number[] = [];
      for (let k = 0; k < 2 * n; k += 1) out.push(canonTheta((TWO_PI * (k / 2 - phase)) / n));
      return out;
    },
  };
}

/**
 * FIXTURE B — a HELICAL crease family: the same wave sheared in z. Its loci are slanted straight lines that
 * WRAP THE SEAM, which is the case a tracer written in wrapped theta gets wrong.
 * r = R - amp * tri(n*(theta - twist*z)/2pi + phase);  loci: theta = twist*z + 2pi*(k/2 - phase)/n.
 */
function fixtureB(n: number, phase: number, twist: number): { r: SweepRadiusFn; theta: (k: number, z: number) => number } {
  return {
    r: (th, z) => RBASE - AMP * tri((n * (th - twist * z)) / TWO_PI + phase),
    theta: (k, z) => twist * z + (TWO_PI * (k / 2 - phase)) / n,
  };
}

/**
 * FIXTURE C — a CURVED crease family (sinusoidally swept in z). This is the fixture the ADAPTIVE STEP has
 * to earn: a fixed step either over-resolves the straight parts or cuts the corners of the curved ones.
 * r = R - amp * tri(n*(theta - A*sin(2pi z/H))/2pi + phase);  loci: theta = A*sin(2pi z/H) + 2pi(k/2-phase)/n.
 */
function fixtureC(n: number, phase: number, A: number): { r: SweepRadiusFn; theta: (k: number, z: number) => number } {
  return {
    r: (th, z) => RBASE - AMP * tri((n * (th - A * Math.sin((TWO_PI * z) / H))) / TWO_PI + phase),
    theta: (k, z) => A * Math.sin((TWO_PI * z) / H) + (TWO_PI * (k / 2 - phase)) / n,
  };
}

/**
 * FIXTURE D — an X-CROSSING lattice: a theta family PLUS a z family, so the loci genuinely INTERSECT and
 * the junction machinery has ground truth. Junctions sit at every (theta_i, z_j) pair, at 90 degrees.
 */
function fixtureD(n: number, m: number, phaseT: number, phaseZ: number): {
  r: SweepRadiusFn; thetas: number[]; zs: number[];
} {
  const thetas: number[] = [];
  for (let k = 0; k < 2 * n; k += 1) thetas.push(canonTheta((TWO_PI * (k / 2 - phaseT)) / n));
  const zs: number[] = [];
  // k runs to 4m, not 2m: tri() has a kink every HALF period and the phase shift pushes one more into the
  // band. Getting this wrong under-states the ground truth — caught by the tracer reporting a 6th z-locus
  // (z=111.56) the first draft of this enumeration did not list.
  for (let k = 0; k <= 4 * m; k += 1) {
    const z = (H * (k / 2 - phaseZ)) / m;
    if (z > 2 && z < H - 2) zs.push(z);
  }
  return {
    r: (th, z) => RBASE - AMP * tri((th * n) / TWO_PI + phaseT) - AMP * tri((z * m) / H + phaseZ),
    thetas,
    zs,
  };
}

// ───────────────────────────── measurement helpers (surface metric, mm) ─────────────────────────────

const rAt = (rf: SweepRadiusFn, th: number, z: number): number => Math.max(1e-6, rf(canonTheta(th), z));

/** distance from (pTh,pZ) to a straight vertical/analytic locus given as theta(z), in mm on the surface. */
function distToCurveMm(rf: SweepRadiusFn, pTh: number, pZ: number, thetaOf: (z: number) => number): number {
  // sample z around pZ and take the min; the loci here are shallow in z so a local scan is exact enough.
  let best = Infinity;
  const r = rAt(rf, pTh, pZ);
  for (let k = -12; k <= 12; k += 1) {
    const z = pZ + k * 0.05;
    if (z < 0 || z > H) continue;
    const dth = dThRaw(canonTheta(pTh), canonTheta(thetaOf(z)));
    const d = Math.hypot(r * dth, z - pZ);
    if (d < best) best = d;
  }
  return best;
}

/** distance from a point to the nearest segment of any polyline, mm. */
function distToPolysMm(rf: SweepRadiusFn, pTh: number, pZ: number, polys: Array<Array<[number, number]>>): number {
  const r = rAt(rf, pTh, pZ);
  let best = Infinity;
  for (const P of polys) {
    for (let i = 0; i + 1 < P.length; i += 1) {
      const ax = 0; const ay = P[i][1];
      const bx = r * dThRaw(canonTheta(P[i][0]), canonTheta(P[i + 1][0])); const by = P[i + 1][1];
      const px = r * dThRaw(canonTheta(P[i][0]), canonTheta(pTh)); const py = pZ;
      const ux = bx - ax; const uy = by - ay;
      const l2 = ux * ux + uy * uy;
      let t = l2 < 1e-18 ? 0 : ((px - ax) * ux + (py - ay) * uy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(px - (ax + t * ux), py - (ay + t * uy));
      if (d < best) best = d;
    }
  }
  return best;
}

/** push every vertex PERTURB_UM normal to the local tangent — the DELIBERATE MISTRACE. */
function perturb(polys: Array<Array<[number, number]>>, rf: SweepRadiusFn, um: number): Array<Array<[number, number]>> {
  const d = um / 1000;
  return polys.map((P) => P.map((p, i) => {
    const a = P[Math.max(0, i - 1)]; const b = P[Math.min(P.length - 1, i + 1)];
    const r = rAt(rf, p[0], p[1]);
    const tx = r * dThRaw(canonTheta(a[0]), canonTheta(b[0])); const ty = b[1] - a[1];
    const n = Math.hypot(tx, ty);
    if (n < 1e-12) return p;
    const nx = -ty / n; const ny = tx / n;
    return [p[0] + (d * nx) / r, p[1] + d * ny] as [number, number];
  }));
}

/** max over traced vertices of the distance to the nearest analytic locus, in um. */
function vertexErrUm(art: LocusArtifact, rf: SweepRadiusFn, curves: Array<(z: number) => number>, polysIn?: Array<Array<[number, number]>>): number {
  const polys = polysIn ?? art.loci.map((l) => l.pts);
  let worst = 0;
  for (const P of polys) {
    for (const p of P) {
      let best = Infinity;
      for (const c of curves) { const d = distToCurveMm(rf, p[0], p[1], c); if (d < best) best = d; }
      if (best > worst) worst = best;
    }
  }
  return worst * 1000;
}

/** max over analytic samples of the distance to the nearest traced segment, in um. */
function curveErrUm(art: LocusArtifact, rf: SweepRadiusFn, curves: Array<(z: number) => number>, polysIn?: Array<Array<[number, number]>>): number {
  const polys = polysIn ?? art.loci.map((l) => l.pts);
  let worst = 0;
  const NZ = 160;
  for (const c of curves) {
    for (let k = 1; k < NZ; k += 1) {
      const z = (H * k) / NZ;
      const d = distToPolysMm(rf, c(z), z, polys);
      if (d > worst) worst = d;
    }
  }
  return worst * 1000;
}

// ───────────────────────────────────────── the tests ─────────────────────────────────────────

describe('S10 LAYER 1 — locus tracer vs closed form', () => {
  it('T1/T2/T3 fixture A (vertical creases): traces every component within the pre-stated bars', () => {
    const n = 8;
    const F = fixtureA(n, 0.137);
    const art = traceLoci(F.r, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 240, nv: 160 });
    const thetas = F.loci(0);
    const curves = thetas.map((th) => () => th);

    const vErr = vertexErrUm(art, F.r, curves);
    const cErr = curveErrUm(art, F.r, curves);
    // eslint-disable-next-line no-console
    console.log(`A  loci ${art.loci.length}/${2 * n}  vertexErr ${vErr.toFixed(2)} um  curveErr ${cErr.toFixed(2)} um  pts ${art.counts.polylinePts}  rEvals ${(art.meta.rEvals / 1e6).toFixed(1)}M  ${art.meta.wallMs} ms`);

    expect(art.loci.length).toBe(2 * n);                       // T3 COMPLETENESS
    expect(vErr).toBeLessThanOrEqual(BAR_VERT_UM);             // T1
    expect(cErr).toBeLessThanOrEqual(BAR_CURVE_UM);            // T2

    // T4 — the SAME checks on a deliberately mistraced copy MUST fail.
    const bad = perturb(art.loci.map((l) => l.pts), F.r, PERTURB_UM);
    const vBad = vertexErrUm(art, F.r, curves, bad);
    const cBad = curveErrUm(art, F.r, curves, bad);
    // eslint-disable-next-line no-console
    console.log(`A  PERTURBED ${PERTURB_UM} um -> vertexErr ${vBad.toFixed(2)} um  curveErr ${cBad.toFixed(2)} um  (both MUST exceed the bars)`);
    expect(vBad).toBeGreaterThan(BAR_VERT_UM);
    expect(cBad).toBeGreaterThan(BAR_CURVE_UM);
  });

  it('T1/T2/T3 fixture B (helical creases across the theta seam): seam is traced continuously', () => {
    const n = 6; const twist = 0.05;                    // ~0.05 rad per mm => ~6 rad over the band
    const F = fixtureB(n, 0.137, twist);
    const art = traceLoci(F.r, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 240, nv: 160 });
    const curves: Array<(z: number) => number> = [];
    for (let k = 0; k < 2 * n; k += 1) curves.push((z) => F.theta(k, z));

    const vErr = vertexErrUm(art, F.r, curves);
    const cErr = curveErrUm(art, F.r, curves);
    const seamTotal = art.loci.reduce((s, l) => s + l.seamCrossings, 0);
    // eslint-disable-next-line no-console
    console.log(`B  loci ${art.loci.length}/${2 * n}  vertexErr ${vErr.toFixed(2)} um  curveErr ${cErr.toFixed(2)} um  seamCrossings ${seamTotal}  pts ${art.counts.polylinePts}`);

    expect(art.loci.length).toBe(2 * n);
    expect(vErr).toBeLessThanOrEqual(BAR_VERT_UM);
    expect(cErr).toBeLessThanOrEqual(BAR_CURVE_UM);
    // the loci WRAP: twist*H = 6 rad ~ 0.95 turns, so at least some component must cross the seam
    expect(seamTotal).toBeGreaterThan(0);

    // splitAtSeam must produce NO chain segment spanning the cut domain (the cdt2d spanner failure mode)
    let worstSpan = 0;
    for (const l of art.loci) {
      for (const chain of splitAtSeam(l.pts)) {
        for (let i = 0; i + 1 < chain.length; i += 1) worstSpan = Math.max(worstSpan, Math.abs(chain[i + 1][0] - chain[i][0]));
      }
    }
    // eslint-disable-next-line no-console
    console.log(`B  splitAtSeam worst |dtheta| on a chain segment = ${worstSpan.toFixed(4)} rad (must be << pi)`);
    expect(worstSpan).toBeLessThan(Math.PI / 2);

    const bad = perturb(art.loci.map((l) => l.pts), F.r, PERTURB_UM);
    expect(vertexErrUm(art, F.r, curves, bad)).toBeGreaterThan(BAR_VERT_UM);
    expect(curveErrUm(art, F.r, curves, bad)).toBeGreaterThan(BAR_CURVE_UM);
  });

  it('T1/T2/T3 fixture C (curved creases): the adaptive step follows curvature', () => {
    const n = 6; const A = 0.25;
    const F = fixtureC(n, 0.137, A);
    const art = traceLoci(F.r, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 240, nv: 160 });
    const curves: Array<(z: number) => number> = [];
    for (let k = 0; k < 2 * n; k += 1) curves.push((z) => F.theta(k, z));

    const vErr = vertexErrUm(art, F.r, curves);
    const cErr = curveErrUm(art, F.r, curves);
    // eslint-disable-next-line no-console
    console.log(`C  loci ${art.loci.length}/${2 * n}  vertexErr ${vErr.toFixed(2)} um  curveErr ${cErr.toFixed(2)} um  pts ${art.counts.polylinePts}`);

    expect(art.loci.length).toBe(2 * n);
    expect(vErr).toBeLessThanOrEqual(BAR_VERT_UM);
    expect(cErr).toBeLessThanOrEqual(BAR_CURVE_UM);

    const bad = perturb(art.loci.map((l) => l.pts), F.r, PERTURB_UM);
    expect(vertexErrUm(art, F.r, curves, bad)).toBeGreaterThan(BAR_VERT_UM);
    expect(curveErrUm(art, F.r, curves, bad)).toBeGreaterThan(BAR_CURVE_UM);
  });

  it('T5 fixture D (X-crossings): junctions are found at the closed-form intersections', () => {
    const n = 4; const m = 3;
    const F = fixtureD(n, m, 0.137, 0.211);
    const art = traceLoci(F.r, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 240, nv: 200, hRefMm: 0.35 });

    const expected: Array<[number, number]> = [];
    for (const th of F.thetas) for (const z of F.zs) expected.push([th, z]);

    // every EXPECTED junction must have a found junction near it
    let worstUm = 0;
    let missing = 0;
    for (const [th, z] of expected) {
      let best = Infinity;
      for (const j of art.junctions) {
        const r = rAt(F.r, th, z);
        const d = Math.hypot(r * dThRaw(canonTheta(th), j.theta), j.z - z);
        if (d < best) best = d;
      }
      if (best === Infinity) { missing += 1; continue; }
      if (best * 1000 > worstUm) worstUm = best * 1000;
      if (best * 1000 > BAR_JN_UM) missing += 1;
    }
    const angles = art.junctions.map((j) => j.minAngleDeg);
    const medAng = angles.length === 0 ? 0 : angles.slice().sort((a, b) => a - b)[Math.floor(angles.length / 2)];
    const medRad = art.junctions.length === 0 ? 0 : art.junctions.map((j) => j.radiusMm).sort((a, b) => a - b)[Math.floor(art.junctions.length / 2)];
    const medSpread = art.junctions.length === 0 ? 0 : art.junctions.map((j) => j.spreadMm).sort((a, b) => a - b)[Math.floor(art.junctions.length / 2)];
    // eslint-disable-next-line no-console
    console.log(`D  expected junctions ${expected.length}  found ${art.junctions.length}  worst offset ${worstUm.toFixed(1)} um  missing/over-bar ${missing}  median minAngle ${medAng.toFixed(1)} deg  median radius ${medRad.toFixed(3)} mm  median spread ${medSpread.toFixed(3)} mm`);

    expect(missing).toBe(0);
    expect(worstUm).toBeLessThanOrEqual(BAR_JN_UM);
    // NO OVER-PRODUCTION. A tracer that reports 20x too many junctions would over-trigger the P5 router on
    // phantom sites; the count is a bar, not a diagnostic.
    expect(art.junctions.length).toBeGreaterThanOrEqual(expected.length);
    expect(art.junctions.length).toBeLessThanOrEqual(Math.round(expected.length * 1.5));
    // a right-angle lattice: the minimum angle between branches must read ~90 deg
    expect(medAng).toBeGreaterThan(70);
  });

  it('T4 CONTROL: the perturbation check itself is sensitive — a 0 um perturbation must PASS', () => {
    const F = fixtureA(8, 0.137);
    const art = traceLoci(F.r, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 240, nv: 160 });
    const curves = F.loci(0).map((th) => () => th);
    const same = perturb(art.loci.map((l) => l.pts), F.r, 0);
    expect(vertexErrUm(art, F.r, curves, same)).toBeLessThanOrEqual(BAR_VERT_UM);
    expect(curveErrUm(art, F.r, curves, same)).toBeLessThanOrEqual(BAR_CURVE_UM);
  });

  it('JUMP-CLASS IS EXCLUDED, exactly as the S9a sweep excludes it', () => {
    // a true C0 jump surface: the tracer must produce NO loci and must COUNT the exclusions.
    const n = 6;
    const rJump: SweepRadiusFn = (th) => {
      const f = (th * n) / TWO_PI + 0.137;
      const s = f - Math.floor(f);
      return s < 0.5 ? RBASE : RBASE + AMP;
    };
    const art = traceLoci(rJump, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 240, nv: 160 });
    // eslint-disable-next-line no-console
    console.log(`JUMP  loci ${art.loci.length}  crossings ${art.counts.crossings}  jumpExcluded ${art.counts.jumpExcluded}`);
    expect(art.counts.jumpExcluded).toBeGreaterThan(0);
    expect(art.loci.length).toBe(0);
  });
});
