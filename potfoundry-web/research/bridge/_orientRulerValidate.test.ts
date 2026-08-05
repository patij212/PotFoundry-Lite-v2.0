// _orientRulerValidate.test.ts — FIXTURES FOR THE ORIENTATION RULER. RESEARCH ONLY.
//
//   PF_ORIENT_FTV=1 npx vitest run research/bridge/_orientRulerValidate.test.ts
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// EVERY BAR HERE IS TWO-SIDED, ON PURPOSE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// On 2026-08-05 a truncation passed the campaign's 12-bar hard gate while destroying the perpendicular
// ruler, because the gate asserted only `perp <= radial` — and a degenerate `perp == radial` satisfies it.
// So no assertion below is of the form "X is small" or "X <= Y". Every fixture pins the reading BETWEEN an
// upper and a lower bound derived from a CLOSED FORM, and where a plausible degenerate implementation
// exists (centroid-only sampling; `sin(acos(dot))`; no covering term; a curvature-only model) the fixture
// also asserts that THAT implementation's reading FAILS the same bar. A fixture that cannot fail anything
// is not evidence.
//
// The surfaces are radial r(theta, z) with derivatives in closed form, so the truth is arithmetic, not
// another mesher's opinion:
//   CYL(R)               r = R                       normal azimuth = theta          curvature 1/R
//   PLANE(d, th0)        r = d / cos(theta - th0)    normal azimuth = th0 (CONST)    curvature 0
//   CREASE(d, th0, th1)  the two planes, meeting at theta_c = (th0+th1)/2            curvature 0 + a C0 kink
//   SIN(R, A, m)         r = R + A cos(m theta)      normal azimuth non-monotone     curvature varies
// For any z-independent radial surface the normal's azimuth is exactly  phi(theta) = theta + atan2(-r_th, r),
// and the angle between two normals is exactly |phi(theta1) - phi(theta2)| — which is what makes the closed
// forms below closed.
import { describe, it, expect } from 'vitest';
import {
  orientOfFacet, exactNormals, fdNormals, fdNormalsCentral, farRadius, radialNormal,
  type NormalSampler, type OrientOut,
} from './orientRuler';

const RUN = process.env.PF_ORIENT_FTV === '1';
// eslint-disable-next-line no-console
const log = console.log;
const DEG = 180 / Math.PI;
const H = 120;

// ───────────────────────────────────────── surfaces ─────────────────────────────────────────
const cyl = (R: number) => ({
  r: () => R,
  rTh: () => 0,
  rZ: () => 0,
});
const plane = (d: number, th0: number) => ({
  r: (th: number) => d / Math.cos(th - th0),
  rTh: (th: number) => (d * Math.sin(th - th0)) / (Math.cos(th - th0) ** 2),
  rZ: () => 0,
});
const crease = (d: number, th0: number, th1: number) => {
  const thc = 0.5 * (th0 + th1);
  const p0 = plane(d, th0); const p1 = plane(d, th1);
  return {
    thc,
    r: (th: number) => (th < thc ? p0.r(th) : p1.r(th)),
    rTh: (th: number) => (th < thc ? p0.rTh(th) : p1.rTh(th)),
    rZ: () => 0,
  };
};
const sinS = (R: number, A: number, m: number) => ({
  r: (th: number) => R + A * Math.cos(m * th),
  rTh: (th: number) => -A * m * Math.sin(m * th),
  rThTh: (th: number) => -A * m * m * Math.cos(m * th),
  rZ: () => 0,
});

/** lift a parameter point onto the surface */
const lift = (r: (th: number, z: number) => number, th: number, z: number): [number, number, number] => {
  const rr = r(th, z); return [rr * Math.cos(th), rr * Math.sin(th), z];
};
/** the exact normal azimuth of a z-independent radial surface */
const phi = (r: (th: number) => number, rTh: (th: number) => number, th: number): number => th + Math.atan2(-rTh(th), r(th));

/** unit facet normal from three 3-D points, WINDING (no re-orientation) */
function facetN(A: number[], B: number[], C: number[]): number[] {
  const fx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
  const fy = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
  const fz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
  const L = Math.hypot(fx, fy, fz);
  return [fx / L, fy / L, fz / L];
}
const angTo = (f: number[], n: number[]): number => {
  let d = f[0] * n[0] + f[1] * n[1] + f[2] * n[2];
  d = d > 1 ? 1 : d < -1 ? -1 : d; return Math.acos(d);
};
const nAt = (r: (th: number) => number, rTh: (th: number) => number, th: number): number[] => {
  const o = new Float64Array(3); radialNormal(r(th), rTh(th), 0, th, o, 0); return [o[0], o[1], o[2]];
};

function run(
  ns: NormalSampler, P: Array<[number, number]>, r: (th: number, z: number) => number,
  k: number, extra: Record<string, unknown> = {},
): OrientOut {
  const A = lift(r, P[0][0], P[0][1]); const B = lift(r, P[1][0], P[1][1]); const C = lift(r, P[2][0], P[2][1]);
  return orientOfFacet(ns, A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2], P[0][0], P[1][0], P[2][0], { k, ...extra });
}
/** the S55 prototype, reproduced EXACTLY, so a fixture can fail it rather than my paraphrase of it */
function s55Prototype(
  rA: (th: number, z: number) => number, P: Array<[number, number]>,
): { tangMm: number; normDeg: number } {
  const A = lift(rA, P[0][0], P[0][1]); const B = lift(rA, P[1][0], P[1][1]); const C = lift(rA, P[2][0], P[2][1]);
  let fx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
  let fy = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
  let fz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  const gx = (A[0] + B[0] + C[0]) / 3; const gy = (A[1] + B[1] + C[1]) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thc = (P[0][0] + P[1][0] + P[2][0]) / 3;
  const zc = Math.min(H, Math.max(0, (P[0][1] + P[1][1] + P[2][1]) / 3));
  const rr = rA(thc, zc);
  const hTh = 1e-5 / Math.max(1e-6, rr); const hZ = 1e-5;
  const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
  const cc = Math.cos(thc); const ss = Math.sin(thc);
  let nx = rTh * ss + rr * cc; let ny = rr * ss - rTh * cc; let nz = -rr * rZ;
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  const diam = Math.max(
    Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]),
    Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]),
    Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]));
  return { tangMm: Math.sin(Math.acos(dot)) * diam, normDeg: Math.acos(dot) * DEG };
}

describe.skipIf(!RUN)('ORIENT-FTV — the orientation ruler, on closed forms', () => {
  it('F1 — CYLINDER: the sup is EXACTLY Delta/2, and centroid-only sampling reads Delta/6', () => {
    const R = 45; const D = 0.10; const hz = 3;
    const S = cyl(R);
    const ns = exactNormals(S.r, S.rTh, S.rZ);
    const P: Array<[number, number]> = [[0, 0], [D, 0], [0, hz]];
    const truth = D / 2;
    const rows: string[] = [];
    let k1 = 0; let k32 = 0;
    for (const k of [1, 2, 4, 8, 32]) {
      const o = run(ns, P, S.r, k);
      rows.push(`  k=${String(k).padStart(2)}  normRad ${o.normRad.toFixed(12)}  /truth ${(o.normRad / truth).toFixed(12)}  cov ${o.cov.toExponential(3)}`);
      if (k === 1) k1 = o.normRad; if (k === 32) k32 = o.normRad;
    }
    // the s55 prototype, on the same facet
    const proto = s55Prototype(S.r, P);
    const centroidRatio = (proto.normDeg / DEG) / truth;
    log('\nF1 CYLINDER  R=45 Delta=0.10 rad  ->  TRUE sup = Delta/2 = %s rad (%s deg)', truth.toFixed(12), (truth * DEG).toFixed(6));
    rows.forEach((r) => log(r));
    log('  S55 PROTOTYPE (centroid, sin(acos)):  normDeg %s  ratio-to-truth %s   [expected 1/3]',
      proto.normDeg.toFixed(6), centroidRatio.toFixed(6));
    // TWO-SIDED: the ruler must be the truth, and the degenerate one must NOT be
    expect(k32).toBeGreaterThan(truth * (1 - 1e-9));
    expect(k32).toBeLessThan(truth * (1 + 1e-9));
    expect(k1).toBeGreaterThan(truth * (1 - 1e-9));      // the lattice contains the vertices
    expect(k1).toBeLessThan(truth * (1 + 1e-9));
    expect(centroidRatio).toBeGreaterThan(0.30);          // the fixture is LIVE: it discriminates,
    expect(centroidRatio).toBeLessThan(0.40);             // and the prototype lands at 1/3, not at 1
  });

  it('F2 — COVERING: witness <= truth <= witness + kappa*cov at EVERY k, and the gap falls exactly as 1/k', () => {
    const R = 45; const A = 1.5; const m = 24;
    const S = sinS(R, A, m);
    const ns = exactNormals(S.r, S.rTh, S.rZ);
    const P: Array<[number, number]> = [[0.02, 0], [0.20, 0], [0.11, 4]];
    // reference sup: brute force at k=768 (295,681 points)
    const ref = run(ns, P, S.r, 768).normRad;
    // kappa = max |dphi/d(arc)| over the footprint = max|phi'(theta)| / rRef, phi' in closed form
    const rRef = (S.r(P[0][0]) + S.r(P[1][0]) + S.r(P[2][0])) / 3;
    let maxPhiP = 0;
    for (let i = 0; i <= 400000; i += 1) {
      const th = P[0][0] + ((P[1][0] - P[0][0]) * i) / 400000;
      const r0 = S.r(th); const r1 = S.rTh(th); const r2 = S.rThTh(th);
      const pp = 1 + (-r0 * r2 + r1 * r1) / (r0 * r0 + r1 * r1);
      maxPhiP = Math.max(maxPhiP, Math.abs(pp));
    }
    const kappa = maxPhiP / rRef;
    log('\nF2 COVERING  SIN(R=45,A=1.5,m=24)  ref sup (k=768) = %s rad (%s deg)   kappa = %s /mm',
      ref.toFixed(12), (ref * DEG).toFixed(6), kappa.toExponential(6));
    const gaps: number[] = [];
    for (const k of [1, 2, 4, 8, 16, 32]) {
      const o = run(ns, P, S.r, k, { kappa, rRef });
      const gap = o.bound - o.normRad;
      gaps.push(gap);
      log('  k=%s  witness %s  bound %s   cov %s  gap %s   brackets=%s',
        String(k).padStart(2), o.normRad.toFixed(12), o.bound.toFixed(12), o.cov.toFixed(9), gap.toExponential(6),
        o.normRad <= ref * (1 + 1e-9) && o.bound >= ref * (1 - 1e-9) ? 'YES' : '*** NO ***');
      expect(o.normRad).toBeLessThanOrEqual(ref * (1 + 1e-9));    // witness is a LOWER bound
      expect(o.bound).toBeGreaterThanOrEqual(ref * (1 - 1e-9));   // bound is an UPPER bound
    }
    // the covering term is EXACT, so the gap is exactly proportional to 1/k — a ruler with a constant or
    // absent covering term fails this outright
    const ratio = gaps[2] / gaps[5];        // k=4 vs k=32
    log('  gap(k=4)/gap(k=32) = %s   [EXACTLY 8 if cov = rho/k]', ratio.toFixed(12));
    expect(ratio).toBeGreaterThan(8 - 1e-9);
    expect(ratio).toBeLessThan(8 + 1e-9);
    // and the witness must actually GAIN with k (else the fixture's sup is at a vertex and proves nothing)
    log('  witness gain k=1 -> k=32: %s deg -> %s deg',
      (run(ns, P, S.r, 1).normRad * DEG).toFixed(6), (run(ns, P, S.r, 32).normRad * DEG).toFixed(6));
  });

  it('F3 — INVERTED FACET: the ruler reads ~180 deg; the s55 mm-form cannot tell it from a GOOD facet', () => {
    const R = 45; const D = 0.10; const hz = 3;
    const S = cyl(R);
    const ns = exactNormals(S.r, S.rTh, S.rZ);
    const good: Array<[number, number]> = [[0, 0], [D, 0], [0, hz]];
    const bad: Array<[number, number]> = [[0, 0], [0, hz], [D, 0]];      // winding reversed
    const og = run(ns, good, S.r, 8); const ob = run(ns, bad, S.r, 8);
    // TRUTH: for the reversed winding the angle field is pi - |theta - Delta/2|, whose sup over the
    // footprint is EXACTLY pi (attained at theta = Delta/2, which the k=8 lattice contains). It is NOT
    // pi - Delta/2 — that is the MINIMUM. Corrected here after the first run printed pi and the fixture
    // did not; the ruler was right and my closed form was wrong.
    const truthBad = Math.PI;
    log('\nF3 INVERTED  good normDeg %s  tangMm %s  legacyTangMm %s',
      og.normDeg.toFixed(6), og.tangMm.toExponential(6), og.legacyTangMm.toExponential(6));
    log('             BAD  normDeg %s  tangMm %s  legacyTangMm %s   (truth %s deg)',
      ob.normDeg.toFixed(6), ob.tangMm.toExponential(6), ob.legacyTangMm.toExponential(6), (truthBad * DEG).toFixed(6));
    log('             ratios  tangMm %sx   legacyTangMm %s  <- the s55 form reads ZERO on a FULLY INVERTED facet',
      (ob.tangMm / og.tangMm).toFixed(6), (ob.legacyTangMm / og.legacyTangMm).toExponential(3));
    expect(ob.normRad).toBeGreaterThan(truthBad * (1 - 1e-9));
    expect(ob.normRad).toBeLessThan(truthBad * (1 + 1e-9));
    // the monotone mm form separates them by >= 30x ...
    expect(ob.tangMm / og.tangMm).toBeGreaterThan(30);
    // ... and the s55 mm form scores the WORST POSSIBLE facet at exactly 0 mm, i.e. better than the good
    // one. Pinned two-sided: legacy(bad) must be ~0 AND legacy(good) must be clearly non-zero.
    expect(ob.legacyTangMm).toBeLessThan(1e-12);
    expect(og.legacyTangMm).toBeGreaterThan(1e-3);
  });

  it('F4 — C0 CREASE straddle: closed form matched by BOTH samplers, and kinkRad recovers the dihedral', () => {
    const d = 45; const t0 = -0.15; const t1 = 0.15;
    const S = crease(d, t0, t1);
    const P: Array<[number, number]> = [[-0.06, 0], [0.06, 0], [-0.01, 3]];
    const A = lift(S.r, P[0][0], P[0][1]); const B = lift(S.r, P[1][0], P[1][1]); const C = lift(S.r, P[2][0], P[2][1]);
    const f = facetN(A, B, C);
    const n0 = nAt(plane(d, t0).r, plane(d, t0).rTh, t0);
    const n1 = nAt(plane(d, t1).r, plane(d, t1).rTh, t1);
    const truth = Math.max(angTo(f, n0), angTo(f, n1));
    const oE = run(exactNormals(S.r, S.rTh, S.rZ), P, S.r, 8);
    const oC = run(fdNormalsCentral(S.r as (th: number, z: number) => number, H), P, S.r, 8);
    const oK = run(fdNormals(S.r as (th: number, z: number) => number, H), P, S.r, 8);
    log('\nF4 CREASE straddle  dihedral %s deg   TRUTH sup = %s deg', ((t1 - t0) * DEG).toFixed(6), (truth * DEG).toFixed(6));
    log('   DIAG  angle(f,n0) %s deg   angle(f,n1) %s deg   argTh %s (thc=%s)',
      (angTo(f, n0) * DEG).toFixed(9), (angTo(f, n1) * DEG).toFixed(9), oE.argTh.toExponential(4), S.thc.toFixed(3));
    log('   exact   %s deg  kink %s deg', oE.normDeg.toFixed(6), (oE.kinkRad * DEG).toFixed(6));
    log('   fd-cent %s deg  kink %s deg', oC.normDeg.toFixed(6), (oC.kinkRad * DEG).toFixed(6));
    log('   fd-kink %s deg  kink %s deg   <- kinkRad must equal the dihedral', oK.normDeg.toFixed(6), (oK.kinkRad * DEG).toFixed(6));
    // tolerances MATCH THE MEASURED CONVERGENCE ORDER (F8): exact is exact, the central difference is
    // O(h^2), the one-sided kink-aware pair is O(h). Each is pinned two-sided at its own order, so a
    // regression that turned one into another would fail here.
    for (const [o, tol] of [[oE, 1e-9], [oC, 1e-6], [oK, 1e-4]] as Array<[OrientOut, number]>) {
      expect(o.normRad).toBeGreaterThan(truth * (1 - tol));
      expect(o.normRad).toBeLessThan(truth * (1 + tol));
    }
    // kinkRad: zero for the smooth samplers, the DIHEDRAL for the kink-aware one — two-sided both ways
    expect(oE.kinkRad).toBeLessThan(1e-12);
    expect(oC.kinkRad).toBeLessThan(1e-12);
    expect(oK.kinkRad).toBeGreaterThan((t1 - t0) * (1 - 1e-3));
    expect(oK.kinkRad).toBeLessThan((t1 - t0) * (1 + 1e-3));
    // and on a SMOOTH surface kinkRad must be ~0, or it is not a crease detector but a noise generator
    const smooth = sinS(45, 1.5, 24);
    const oS = run(fdNormals(smooth.r as (th: number, z: number) => number, H), [[0.02, 0], [0.05, 0], [0.03, 1]], smooth.r, 8);
    log('   CONTROL smooth SIN: kink %s deg (must be ~0)', (oS.kinkRad * DEG).toFixed(9));
    expect(oS.kinkRad * DEG).toBeLessThan(0.05);
    // ── spreadRad: the h-FREE crease detector. On this straddle the footprint is split by the crease, so
    // the spread must be a large fraction of the dihedral; on a flat facet it must be ~0. Both sides
    // pinned, or "spread" is just another name for "something happened".
    const flat = run(exactNormals(plane(d, t0).r, plane(d, t0).rTh, () => 0), [[-0.06, 0], [-0.02, 0], [-0.04, 3]], plane(d, t0).r, 8);
    log('   spreadRad: straddle %s deg   FLAT control %s deg   (dihedral %s deg)',
      (oE.spreadRad * DEG).toFixed(6), (flat.spreadRad * DEG).toExponential(3), ((t1 - t0) * DEG).toFixed(6));
    expect(oE.spreadRad * DEG).toBeGreaterThan(0.3 * (t1 - t0) * DEG);
    expect(oE.spreadRad * DEG).toBeLessThan(1.001 * (t1 - t0) * DEG);
    expect(flat.spreadRad * DEG).toBeLessThan(1e-6);
  });

  it('F4b — VERTEX ON THE CREASE (what a CONFORMED mesh makes): the false alarm, and the inset that kills it', () => {
    const d = 45; const t0 = -0.15; const t1 = 0.15;              // crease at theta = 0
    const S = crease(d, t0, t1);
    const P: Array<[number, number]> = [[-0.06, 0], [0, 0], [-0.03, 3]];   // all three ON plane 0, CCW
    const truth = 0;                                              // the facet lies exactly in plane 0
    const rf = S.r as (th: number, z: number) => number;
    const oE = run(exactNormals(S.r, S.rTh, S.rZ), P, S.r, 8);
    const oC = run(fdNormalsCentral(rf, H), P, S.r, 8);
    const oK = run(fdNormals(rf, H), P, S.r, 8);
    const oCi = run(fdNormalsCentral(rf, H), P, S.r, 8, { inset: 0.01 });
    const oKi = run(fdNormals(rf, H), P, S.r, 8, { inset: 0.01 });
    const oEi = run(exactNormals(S.r, S.rTh, S.rZ), P, S.r, 8, { inset: 0.01 });
    log('\nF4b VERTEX-ON-CREASE  truth = %s deg  (facet lies exactly in plane 0)', truth.toFixed(6));
    log('   exact         %s deg   <- FALSE ALARM at the FULL dihedral: the analytic normal AT a crease is', oE.normDeg.toFixed(6));
    log('                            UNDEFINED, and any branch convention picks a side. NOT an FD artefact.');
    log('   fd-central    %s deg   <- FALSE ALARM at HALF the dihedral (the average of the two sides)', oC.normDeg.toFixed(6));
    log('   fd-kink       %s deg   <- FALSE ALARM at the FULL dihedral', oK.normDeg.toFixed(6));
    log('   exact      +inset 0.01  %s deg', oEi.normDeg.toExponential(3));
    log('   fd-central +inset 0.01  %s deg', oCi.normDeg.toExponential(3));
    log('   fd-kink    +inset 0.01  %s deg', oKi.normDeg.toExponential(3));
    // PIN the false alarm on ALL THREE samplers: it is real, it is half / full the dihedral, and it is
    // NOT a finite-difference artefact — it is the corner of the lattice sitting on the crease.
    expect(oE.normDeg).toBeGreaterThan((t1 - t0) * DEG * 0.9);
    expect(oE.normDeg).toBeLessThan((t1 - t0) * DEG * 1.1);
    expect(oC.normDeg).toBeGreaterThan(0.5 * (t1 - t0) * DEG * 0.9);
    expect(oC.normDeg).toBeLessThan(0.5 * (t1 - t0) * DEG * 1.1);
    expect(oK.normDeg).toBeGreaterThan((t1 - t0) * DEG * 0.9);
    expect(oK.normDeg).toBeLessThan((t1 - t0) * DEG * 1.1);
    // and PIN the cure — the inset is MANDATORY on any conformed mesh, not an optional refinement
    expect(oEi.normDeg).toBeLessThan(1e-6);
    expect(oCi.normDeg).toBeLessThan(1e-6);
    expect(oKi.normDeg).toBeLessThan(1e-3);
  });

  it('F5/F6 — ANTI-CORRELATION: a needle ALONG the axis is orientation-PERFECT, a cap ACROSS is not', () => {
    const R = 45; const S = cyl(R);
    const ns = exactNormals(S.r, S.rTh, S.rZ);
    // NEEDLE: 40 mm along z, 0.02 mm around theta  -> aspect3 huge, orientation ~0
    const dN = 0.02 / R;
    const needle: Array<[number, number]> = [[0, 0], [dN, 0], [0, 40]];
    // CAP: spans 60 deg of theta, 45 mm of z -> aspect3 modest, orientation EXACTLY 30 deg (the F1 form,
    // whose facet normal is n(Delta/2) for any height, so the closed form survives the wide span)
    const dC = Math.PI / 3;
    const cap: Array<[number, number]> = [[0, 0], [dC, 0], [0, 45]];
    const oN = run(ns, needle, S.r, 16); const oC = run(ns, cap, S.r, 16);
    const ar = (P: Array<[number, number]>): number => {
      const A = lift(S.r, P[0][0], P[0][1]); const B = lift(S.r, P[1][0], P[1][1]); const C = lift(S.r, P[2][0], P[2][1]);
      const e0 = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      const e1 = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
      const e2 = Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]);
      const ux = B[0] - A[0]; const uy = B[1] - A[1]; const uz = B[2] - A[2];
      const wx = C[0] - A[0]; const wy = C[1] - A[1]; const wz = C[2] - A[2];
      const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
      return (Math.max(e0, e1, e2) * (e0 + e1 + e2)) / (4 * area);
    };
    log('\nF5/F6 ANTI-CORRELATION');
    log('   NEEDLE along axis   aspect3 %s   orientation %s deg', ar(needle).toFixed(1), oN.normDeg.toExponential(3));
    log('   CAP across theta    aspect3 %s   orientation %s deg', ar(cap).toFixed(3), oC.normDeg.toFixed(6));
    log('   => aspect3 ratio %sx  while orientation ratio %sx  IN THE OPPOSITE DIRECTION',
      (ar(needle) / ar(cap)).toFixed(1), (oC.normDeg / Math.max(1e-12, oN.normDeg)).toExponential(2));
    expect(ar(needle)).toBeGreaterThan(100);
    expect(oN.normDeg).toBeLessThan(0.02);
    expect(ar(cap)).toBeLessThan(10);           // measured 7.50 on the first run; needle is 195x this
    expect(oC.normDeg).toBeGreaterThan(29.9);
    expect(oC.normDeg).toBeLessThan(30.1);
  });

  it('F7 — VACUITY CONTROL: a facet lying exactly IN a plane reads 0, and rho(T) is exact', () => {
    const d = 45; const t0 = 0.3;
    const S = plane(d, t0);
    const ns = exactNormals(S.r, S.rTh, S.rZ);
    const P: Array<[number, number]> = [[0.10, 0], [0.55, 0], [0.30, 7]];
    const o = run(ns, P, S.r, 16);
    log('\nF7 VACUITY  plane facet: normDeg %s  tangMm %s  kink %s', o.normDeg.toExponential(3), o.tangMm.toExponential(3), o.kinkRad.toExponential(3));
    expect(o.normDeg).toBeLessThan(1e-9);
    expect(o.tangMm).toBeLessThan(1e-9);
    // rho: right isoceles legs 3,4 -> hypotenuse 5, OBTUSE? no, right -> circumradius 2.5
    const rhoRight = farRadius(0, 0, 3, 0, 0, 4);
    const rhoObtuse = farRadius(0, 0, 10, 0, 1, 1);        // very obtuse -> half the longest edge = 5
    log('   farRadius right(3,4,5) = %s [truth 2.5]   obtuse = %s [truth 5]', rhoRight.toFixed(12), rhoObtuse.toFixed(12));
    expect(rhoRight).toBeGreaterThan(2.5 - 1e-12); expect(rhoRight).toBeLessThan(2.5 + 1e-12);
    expect(rhoObtuse).toBeGreaterThan(5 - 1e-12); expect(rhoObtuse).toBeLessThan(5 + 1e-12);
  });

  it('F8 — FD vs EXACT, away from the crease: agreement, and the h-sensitivity, MEASURED not assumed', () => {
    const S = sinS(45, 1.5, 24);
    const rf = S.r as (th: number, z: number) => number;
    const P: Array<[number, number]> = [[0.02, 0], [0.20, 0], [0.11, 4]];
    const ex = run(exactNormals(S.r, S.rTh, S.rZ), P, S.r, 16).normDeg;
    const rows: Array<[number, number, number]> = [];
    for (const h of [2e-3, 2e-4, 2e-5]) {
      const c = run(fdNormalsCentral(rf, H, h, h), P, S.r, 16).normDeg;
      const kk = run(fdNormals(rf, H, h, h), P, S.r, 16).normDeg;
      rows.push([h, c - ex, kk - ex]);
    }
    log('\nF8 FD vs EXACT on a SMOOTH facet (exact = %s deg)', ex.toFixed(9));
    rows.forEach(([h, dc, dk]) => log('   h=%s   central %s deg   kink-aware %s deg', h.toExponential(0), dc.toExponential(3), dk.toExponential(3)));
    // central FD is O(h^2) and must be tiny; the kink-aware one is O(h) one-sided and must be BIGGER but
    // still small — pinning both directions so neither can silently become the other
    expect(Math.abs(rows[1][1])).toBeLessThan(1e-4);
    expect(Math.abs(rows[1][2])).toBeLessThan(2e-2);
    expect(Math.abs(rows[1][2])).toBeGreaterThan(Math.abs(rows[1][1]));
  });

  it('H2 — DENSITY: on a crease straddle the ANGLE is invariant and only the mm form falls', () => {
    const d = 45; const t0 = -0.15; const t1 = 0.15;
    const S = crease(d, t0, t1);
    const ns = exactNormals(S.r, S.rTh, S.rZ);
    log('\nH2 DENSITY SWEEP — a facet straddling a C0 crease, halved 5 times');
    log('   split   half-span(rad)   normDeg      tangMm(um)   diam(mm)');
    const res: Array<[number, number, number]> = [];
    for (let s = 0; s < 6; s += 1) {
      const w = 0.06 / 2 ** s;            // half-span in theta, straddling theta=0 asymmetrically
      const P: Array<[number, number]> = [[-w, 0], [w, 0], [-w / 6, 3 / 2 ** s]];
      const o = run(ns, P, S.r, 16);
      res.push([o.normDeg, o.tangMm * 1000, o.diam]);
      log('   %s       %s        %s   %s   %s', s, w.toExponential(3), o.normDeg.toFixed(6).padStart(10), (o.tangMm * 1000).toFixed(3).padStart(10), o.diam.toFixed(5));
    }
    const angRatio = res[0][0] / res[5][0];
    const mmPerHalving = (res[0][1] / res[5][1]) ** (1 / 5);
    log('   ANGLE  x%s over 5 halvings   |   mm form  x%s PER HALVING', angRatio.toFixed(4), mmPerHalving.toFixed(4));
    // PRE-REGISTERED: CONFIRMED if the angle moves < 5% while the mm form falls >= 1.8x per halving
    expect(angRatio).toBeGreaterThan(0.95);
    expect(angRatio).toBeLessThan(1.05);
    expect(mmPerHalving).toBeGreaterThan(1.8);
    // the SMOOTH control must behave the OPPOSITE way, or "density-invariant" is a property of my fixture
    const SM = sinS(45, 1.5, 24);
    const nsm = exactNormals(SM.r, SM.rTh, SM.rZ);
    const smooth: number[] = [];
    for (let s = 0; s < 6; s += 1) {
      const w = 0.06 / 2 ** s;
      const P: Array<[number, number]> = [[0.11 - w, 0], [0.11 + w, 0], [0.11 - w / 6, 3 / 2 ** s]];
      smooth.push(run(nsm, P, SM.r, 16).normDeg);
    }
    log('   CONTROL smooth SIN: normDeg %s -> %s  (x%s over 5 halvings)',
      smooth[0].toFixed(6), smooth[5].toFixed(6), (smooth[0] / smooth[5]).toFixed(2));
    expect(smooth[0] / smooth[5]).toBeGreaterThan(8);      // smooth: the ANGLE does converge
  });
});
