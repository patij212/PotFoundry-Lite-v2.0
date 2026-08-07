// research/bridge/_s118EmitAdmit.ts — S118. The EMIT-TIME ADMISSION CORE for the STRATA bisection driver.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// THIS IS A TRANSCRIPTION. SAY SO, AND SAY WHY.
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// The bodies of `checkS118Admit`'s T1 / T2 / T3 terms are TRANSCRIBED OPERAND-FOR-OPERAND from
// `src/renderers/webgpu/parametric/conforming/emitInvariant.ts` (`checkEmitInvariant`, S117 P1) — the
// zero-analytic-evaluation core only. T4 (orientation + position) is deliberately NOT transcribed: it costs
// 5-6 rA evaluations per lattice point per child, and the driver runs this predicate on both children of
// EVERY live incident triangle of EVERY candidate split. T4 there would multiply the driver's rA budget by
// ~40x, and the driver already has its own position ruler.
//
// *** WHY TRANSCRIBED RATHER THAN IMPORTED. *** The S118 session rule is that the research driver may not
// import `src/`. That rule is not bureaucracy: `_strataConformBisectL.test.ts` is a research fork whose
// whole value is that a flag-OFF run is BYTE-IDENTICAL to a committed baseline. An import binds that
// guarantee to a shipping module another agent may edit underneath it, and the byte-identity gate would
// then fail for a reason that has nothing to do with the driver.
//
// A transcription that is not PROVED equal to its original is just a second implementation with its own
// bugs. So `_s118EmitAdmit.test.ts` §BRIDGE imports BOTH — the test may import src/, the driver may not —
// and asserts `reason` and all four scalars are bit-identical (Object.is) over 4,000 randomised triangles
// spanning all four classes. That test is the contract; if it goes red the transcription has drifted.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE THREE TERMS ARE, AND WHICH ONE IS ACTUALLY NEW TO THE DRIVER
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// Coordinates are ARC LENGTH ON THE FACET'S OWN MEAN-RADIUS CYLINDER, s_i = (rbar*theta_i, z_i) [mm, mm],
// verbatim from the original, so every threshold published against `emitInvariant` transfers unchanged.
//
//  T1 DEGENERACY   |qP| >= tauQ,  qP = 4*sqrt(3)*apS / Lp^2   (equilateral 3, collinear 0, folded < 0).
//                  The driver's existing S1 guard bounds `aspect3` — a 3-D ratio — at 50. A facet that
//                  spans a radius CLIFF has real 3-D extent and passes aspect3 while its (theta,z)
//                  footprint is collinear. T1 sees that; aspect3 does not.
//  T2 FOLD         sigma*apS > 0. *** THE DRIVER ALREADY HAS THIS, DEFAULT ON *** — S2, PF_CB_SHAPE_FOLD,
//                  via `signedAreaParam` sign-compared against the parent. T2 is kept here so the
//                  transcription is the whole core and the BRIDGE proof covers it, and so the driver can
//                  report which term would have fired first; it is not expected to add refusals.
//  T3 BLADE        minAlt = 2|apS|/Lp >= minAltMm. *** THIS IS THE ONE THE DRIVER HAS NEVER HAD. ***
//                  It is an ABSOLUTE millimetre bar and it is deliberately NOT scale-free. `_shapeGuard.ts`
//                  argued against exactly this ("a min-ALTITUDE test in mm is not scale-invariant") and
//                  chose the scale-free `aspect3` instead — and that argument is why the hole exists:
//                  S116 measured 94.87% of CelticTriquetra's over-ceiling class AREA sitting under 2 um of
//                  arc-space altitude (GothicArches control 1.78% of ITS class = 53x apart). A needle whose
//                  three edges are all long in 3-D is well-shaped by `aspect3` and is still a sub-micron
//                  blade in the parameter domain. Only an absolute bar sees it.
//
// PURE. No mesh, no globals, no I/O — unit-testable, and reusable by an offline census without dragging the
// driver in. Same contract as `_shapeGuard.ts`, next to which this file is meant to be read.
//
// @module research/bridge/_s118EmitAdmit

/** Why a triangle was refused. `ok` means every ENABLED term passed. Shares its spelling with S117's. */
export type S118Reason = 'ok' | 'degenerate' | 'fold' | 'blade';

/** Numeric codes, for callers that bucket rejects without string compares. */
export const S118_REASON_CODE: Readonly<Record<S118Reason, number>> = Object.freeze({
  ok: 0, degenerate: 1, fold: 2, blade: 3,
});

/** The verdict. EVERY scalar is filled on EVERY call — a reused scratch is never left stale. */
export interface S118Verdict {
  /** True when every enabled term passed. */
  ok: boolean;
  /** The first term that refused, in cost order. */
  reason: S118Reason;
  /** Signed normalised parameter shape 4*sqrt(3)*apS/Lp^2 (equilateral 3, collinear 0, folded < 0). */
  qP: number;
  /** Signed parameter-triangle area on the mean-radius cylinder, mm^2. */
  apSMm2: number;
  /** Shortest altitude of the parameter triangle, mm. THE NEEDLE MEASURE. */
  minAltMm: number;
  /** 3-D triangle area, mm^2. */
  a3Mm2: number;
}

/** Thresholds. Every knob is a named, sweepable quantity — no magic constant is buried in the body. */
export interface S118AdmitOptions {
  /** The emitter's fixed global parameter winding. Default +1. */
  sigma?: 1 | -1;
  /** T1 floor on |qP|. 0 disables T1's SHAPE test (the 3-D / non-finite guard always runs). */
  tauQ?: number;
  /** T3 floor on the arc-space minimum altitude, mm. 0 disables T3. */
  minAltMm?: number;
}

/**
 * THE DEFENSIBLE SETTING, carried over from S117's `DEFENSIBLE_EMIT_INVARIANT` unchanged so every published
 * threshold and ladder stays directly comparable. tauQ 0.005 is S116's published defensible cut; minAltMm
 * 2e-3 is the bar at which S116's needle census separates the two meshes (94.87% vs 1.78%).
 */
export const S118_DEFENSIBLE: Readonly<Required<S118AdmitOptions>> = Object.freeze({
  sigma: 1 as const,
  tauQ: 0.005,
  minAltMm: 2e-3,
});

/** Allocate one verdict to reuse across a whole emit loop. */
export function makeS118Verdict(): S118Verdict {
  return { ok: false, reason: 'ok', qP: 0, apSMm2: 0, minAltMm: 0, a3Mm2: 0 };
}

const SQ3x4 = 4 * Math.sqrt(3);
const THIRD = 1 / 3;

/**
 * Put three canonical thetas on ONE branch, anchored at A, using shortest-arc deltas.
 *
 * `checkS118Admit` (like S117's original) REQUIRES unwrapped theta and cannot unwrap for you: with three
 * bare angles there is no way to tell a legitimate wrap from a real fold. The driver, however, always knows
 * the branch — it stores canonical theta per vertex and every one of its own parameter computations goes
 * through shortest-arc `dThRaw`. This helper is that same rule in one place, so the driver's call sites
 * cannot each invent their own.
 *
 * Shortest-arc is the correct rule here and its limit is worth stating: a triangle whose theta extent
 * reaches PI is genuinely ambiguous and would be mis-unwrapped. The driver's facets are many orders below
 * that (its coarsest initial cell is 2*PI/GRIDU with GRIDU >= 200, i.e. 0.031 rad).
 */
export function unwrapTheta3(thA: number, thB: number, thC: number): [number, number, number] {
  const d = (a: number, b: number): number => {
    let x = b - a;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
  };
  return [thA, thA + d(thA, thB), thA + d(thA, thC)];
}

/**
 * THE PREDICATE — T1 degeneracy, T2 fold, T3 blade. Zero analytic evaluations, ~40 flops.
 *
 * `ath/bth/cth` MUST be UNWRAPPED theta on a common branch (see {@link unwrapTheta3}).
 * Pass `out` to run allocation-free; the same object is returned.
 */
export function checkS118Admit(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  ath: number, bth: number, cth: number,
  opts: S118AdmitOptions,
  out?: S118Verdict,
): S118Verdict {
  const v = out ?? makeS118Verdict();
  const sigma = opts.sigma ?? 1;
  const tauQ = opts.tauQ ?? 0;
  const minAltBar = opts.minAltMm ?? 0;

  // ── 3-D triangle ──────────────────────────────────────────────────────────────────────────────────────
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const fx = uy * wz - uz * wy;
  const fy = uz * wx - ux * wz;
  const fz = ux * wy - uy * wx;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  const a3 = 0.5 * fl;

  // ── parameter triangle on the facet's own mean-radius cylinder ────────────────────────────────────────
  const ra = Math.sqrt(ax * ax + ay * ay);
  const rb = Math.sqrt(bx * bx + by * by);
  const rc = Math.sqrt(cx * cx + cy * cy);
  const rbar = (ra + rb + rc) * THIRD;
  const s0 = rbar * ath; const s1 = rbar * bth; const s2 = rbar * cth;
  const apS = 0.5 * ((s1 - s0) * (cz - az) - (bz - az) * (s2 - s0));
  const e0x = s1 - s0; const e0z = bz - az;
  const e1x = s2 - s1; const e1z = cz - bz;
  const e2x = s0 - s2; const e2z = az - cz;
  const l0 = Math.sqrt(e0x * e0x + e0z * e0z);
  const l1 = Math.sqrt(e1x * e1x + e1z * e1z);
  const l2 = Math.sqrt(e2x * e2x + e2z * e2z);
  const lp = l0 > l1 ? (l0 > l2 ? l0 : l2) : (l1 > l2 ? l1 : l2);

  const qP = lp > 0 ? (SQ3x4 * apS) / (lp * lp) : 0;
  const minAlt = lp > 0 ? (2 * Math.abs(apS)) / lp : 0;

  v.qP = qP;
  v.apSMm2 = apS;
  v.minAltMm = minAlt;
  v.a3Mm2 = a3;

  // ── T1 DEGENERACY ─────────────────────────────────────────────────────────────────────────────────────
  // The hard guard first: a triangle with no 3-D area, or a non-finite coordinate, cannot be reasoned about
  // and must never reach the emitter. Then the SCALE-FREE shape floor — the degeneracy pole is apS/Lp^2 -> 0,
  // not apS -> 0, so an absolute AREA bound here would ban legitimate fine facets.
  if (!(a3 > 0) || !(lp > 0) || !Number.isFinite(qP) || !Number.isFinite(minAlt)) {
    v.ok = false; v.reason = 'degenerate'; return v;
  }
  if (Math.abs(qP) < tauQ) { v.ok = false; v.reason = 'degenerate'; return v; }

  // ── T2 FOLD / WINDING ─────────────────────────────────────────────────────────────────────────────────
  if (!(sigma * apS > 0)) { v.ok = false; v.reason = 'fold'; return v; }

  // ── T3 BLADE — the absolute arc-space altitude bar, the term the driver never had ─────────────────────
  if (minAlt < minAltBar) { v.ok = false; v.reason = 'blade'; return v; }

  v.ok = true; v.reason = 'ok'; return v;
}
