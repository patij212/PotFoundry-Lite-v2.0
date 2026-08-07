/**
 * emitInvariant.ts — THE EMIT-TIME INVARIANT for the radial-graph conforming mesher (S117 P1).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS
 *
 * A per-triangle predicate that a conforming emitter can run on every triangle it is about to emit, so
 * that folds / blades / degenerate footprints are impossible BY CONSTRUCTION rather than repaired
 * afterwards. It is a pure function of the three vertices, their (theta, z), and — optionally — the
 * analytic radius rA. It allocates nothing when handed a scratch verdict.
 *
 * *** THIS MODULE IS NOT WIRED. *** Nothing in the shipping pipeline imports it yet; the one-line call
 * site is a separate, flag-gated change. Importing it changes no behaviour.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * WHY IT IS STATED IN PARAMETER SPACE
 *
 * The shipping surface is a RADIAL GRAPH r = rA(theta, z), so every 3D point on it CARRIES its own
 * parameter (theta = atan2(y,x), z = z). A predicate written in parameter space therefore needs no
 * extra emitter state — it is computable from the three emitted vertices alone. That is what makes it
 * an emit-time test rather than a post-hoc audit.
 *
 * Parameter coordinates are ARC LENGTH ON THE FACET'S OWN MEAN-RADIUS CYLINDER:
 *      s_i = ( rbar * theta_i , z_i )   [mm, mm],   rbar = mean vertex radius
 * so every quantity below is a length, or a ratio of equal powers of length ⇒ SCALE-FREE where it
 * claims to be, and an honest millimetre where it claims to be absolute.
 *
 *   apS     signed area of the parameter triangle                                     [mm^2]
 *   Lp      longest parameter edge                                                    [mm]
 *   qP      = 4*sqrt(3) * apS / Lp^2 — signed normalised parameter shape        [dimensionless]
 *   minAlt  = 2*|apS| / Lp — the parameter triangle's SHORTEST ALTITUDE               [mm]
 *
 * ⚠ NORMALISATION NOTE: under the 4*sqrt(3) constant an EQUILATERAL parameter triangle scores qP = 3,
 * not 1 (4*sqrt(3) * (sqrt(3)/4)L^2 / L^2 = 3). The constant is kept verbatim from the S116 probe so
 * every published threshold and ladder stays directly comparable; S116's inline comment calling it
 * "1 = equilateral" is off by exactly 3x. Collinear is still 0 and folded is still negative.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * THE TERMS, IN COST ORDER (cheapest first, so the common case exits early)
 *
 *  T1 PARAMETER DEGENERACY — |qP| >= tauQ.  ZERO analytic evaluations.
 *      The degeneracy pole is "apS / Lp^2 -> 0", NOT "apS -> 0": an absolute area bound is
 *      scale-DEPENDENT and would ban legitimate fine facets. Also rejects a non-finite or zero-area
 *      3D triangle, which is the same pathology seen from the other side.
 *  T2 FOLD / WINDING — sigma * apS > 0.  ZERO analytic evaluations.
 *      sigma is the emitter's fixed global parameter winding (+1 unless the emitter is wound the other
 *      way). T1 is the tauQ -> 0+ limit of the SIGNED form, so T1 and T2 are separated deliberately:
 *      a well-shaped triangle emitted backwards must report `fold`, not `degenerate`.
 *  T3 BLADE — minAlt >= minAltMm.  ZERO analytic evaluations.
 *      An ABSOLUTE bar, and the one term that is deliberately not scale-free: a triangle can be
 *      perfectly shaped and still be a sub-micron needle in the parameter domain, which is exactly the
 *      class S116 censused (94.87% of CelticTriquetra's over-ceiling class area sits under 2 um of
 *      arc-space altitude; the GothicArches control is 1.78% of ITS over-ceiling class area).
 *  T4 ORIENTATION + POSITION — costs analytic evaluations, and is OPTIONAL (skipped when no rA).
 *      Orientation: max over a 7-point INSET barycentric lattice of the angle between the facet normal
 *      (as wound, times wsign) and the analytic normal, <= tauNDeg.
 *      Position: max over the 7-point UN-INSET lattice of |r_pt - rA| <= posBarMm, reported through
 *      the PERPENDICULAR divisor by default.
 *
 * ══════════════════════════════════════════════════════════════════════════════════════════════════
 * TWO INSTRUMENT SCARS ARE BAKED INTO T4's SIGNATURE, NOT LEFT TO THE CALLER'S MEMORY
 *
 *  (1) `inset` — a conforming mesher puts its vertices ON the crease ON PURPOSE, and the analytic
 *      normal is undefined there. A stencil that samples the vertices indicts the mesher's best work:
 *      S116's smoke run measured inset 0 false-flagging 97.06% of GothicArches's GOOD-set area, versus
 *      0.00% at inset 0.05. `inset` is therefore an explicit, defaulted, documented parameter.
 *  (3) `fdStepMm` — the finite-difference step. At h = 1e-3 the same GothicArches class reads
 *      normDeg p50 11.7 deg; at h = 2e-6 it reads 2.2 deg. The default is the converged end.
 *  POSITION uses the PERPENDICULAR estimate |dr| / sqrt(1 + (r_th/r)^2 + r_z^2), not the raw radial
 *      one: radial >= perpendicular pointwise, so radial is a sound UPPER bound only, and on riser
 *      facets it inflates by ~4.6x. The divisor is taken as the MINIMUM over the stencil, which keeps
 *      the reported value an upper bound on the true perpendicular distance.
 *
 * @module conforming/emitInvariant
 */

/** Why a triangle was refused. `ok` means every enabled term passed. */
export type EmitRejectReason = 'ok' | 'degenerate' | 'fold' | 'blade' | 'orientation' | 'position';

/** Numeric codes, for callers that want to bucket rejects without string compares. */
export const EMIT_REASON_CODE: Readonly<Record<EmitRejectReason, number>> = Object.freeze({
  ok: 0, degenerate: 1, fold: 2, blade: 3, orientation: 4, position: 5,
});

/** The predicate's verdict. Every scalar is filled on every call — a scratch is never left stale. */
export interface EmitVerdict {
  /** True when every ENABLED term passed. */
  ok: boolean;
  /** The first term that refused, in cost order. */
  reason: EmitRejectReason;
  /** Signed normalised parameter shape, 4*sqrt(3)*apS/Lp^2 (equilateral = 3, collinear = 0). */
  qP: number;
  /** Signed parameter-triangle area on the mean-radius cylinder, mm^2. */
  apSMm2: number;
  /** Shortest altitude of the parameter triangle, mm. The blade measure. */
  minAltMm: number;
  /** 3D triangle area, mm^2. */
  a3Mm2: number;
  /** T4 orientation witness, degrees. NaN when T4 did not run. */
  normDeg: number;
  /** T4 position witness, mm (perpendicular by default). NaN when T4 did not run. */
  posMm: number;
  /** Analytic evaluations this call consumed (0 unless T4 ran). */
  evals: number;
}

/** Thresholds and the optional analytic surface. Every knob is a named, swept quantity. */
export interface EmitInvariantOptions {
  /** The emitter's fixed global parameter winding. Default +1. */
  sigma?: 1 | -1;
  /** T1 floor on |qP|. 0 disables T1's shape test (the 3D-degeneracy guard always runs). */
  tauQ?: number;
  /** T3 floor on the arc-space minimum altitude, mm. 0 disables T3. */
  minAltMm?: number;
  /** The analytic radius r = rA(theta, z). Omit to run the zero-evaluation core only. */
  rA?: (theta: number, z: number) => number;
  /** Domain floor for the z finite difference. Default -Infinity (no clamp). */
  zMin?: number;
  /** Domain ceiling for the z finite difference. Default +Infinity (no clamp). */
  zMax?: number;
  /** T4 orientation bar, degrees. Default 20. */
  tauNDeg?: number;
  /** T4 position bar, mm. Default 0.01. */
  posBarMm?: number;
  /** SCAR 1 — barycentric inset of the orientation stencil. Default 0.05. NEVER leave this at 0. */
  inset?: number;
  /** SCAR 3 — finite-difference step, mm of arc and of z. Default 2e-6. */
  fdStepMm?: number;
  /** The mesh's 3D winding against the analytic OUTWARD normal. Default +1. */
  wsign?: 1 | -1;
  /** 'perpendicular' (default, honest) or 'radial' (a sound upper bound that inflates on risers). */
  posMode?: 'perpendicular' | 'radial';
}

/**
 * THE DEFENSIBLE SETTING (S117).
 *
 * tauQ = 0.005 and the graph-fidelity band Gr in [0.25, 4] were S116's published defensible cut; the
 * blade bar replaces Gr here with the ZERO-EVALUATION arc-space altitude, so the core needs no rA at
 * all. minAltMm = 2e-3 is the bar at which S116's needle census separates the two meshes (94.87% vs
 * 1.78% of the respective over-ceiling class areas). inset and fdStepMm are the converged ends of
 * scars 1 and 3.
 */
export const DEFENSIBLE_EMIT_INVARIANT = Object.freeze({
  sigma: 1 as const,
  tauQ: 0.005,
  minAltMm: 2e-3,
  tauNDeg: 20,
  posBarMm: 0.01,
  inset: 0.05,
  fdStepMm: 2e-6,
  wsign: 1 as const,
  posMode: 'perpendicular' as const,
});

/** Allocate one verdict to reuse across a whole emit loop. */
export function makeEmitVerdict(): EmitVerdict {
  return {
    ok: false, reason: 'ok', qP: 0, apSMm2: 0, minAltMm: 0, a3Mm2: 0,
    normDeg: Number.NaN, posMm: Number.NaN, evals: 0,
  };
}

const DEG = 180 / Math.PI;
const SQ3x4 = 4 * Math.sqrt(3);
const THIRD = 1 / 3;

/**
 * The order-2 barycentric lattice: 3 vertices, 3 edge midpoints, 1 centroid.
 * Module-level and frozen, so no per-call allocation. 7 points x 3 weights, row-major.
 */
const LATTICE = new Float64Array([
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
  0.5, 0.5, 0,
  0, 0.5, 0.5,
  0.5, 0, 0.5,
  THIRD, THIRD, THIRD,
]);
const NLAT = 7;

/**
 * THE PREDICATE.
 *
 * `ath/bth/cth` MUST be UNWRAPPED theta on a common branch — the emitter always knows the true branch,
 * and a wrapped triple silently reports a seam-spanning triangle as a fold. This function does not and
 * cannot unwrap for you: with only three angles there is no way to tell a legitimate wrap from a real
 * one. z is taken from the vertices.
 *
 * Pass `out` to run allocation-free; the same object is returned.
 */
export function checkEmitInvariant(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  ath: number, bth: number, cth: number,
  opts: EmitInvariantOptions,
  out?: EmitVerdict,
): EmitVerdict {
  const v = out ?? makeEmitVerdict();
  const sigma = opts.sigma ?? 1;
  const tauQ = opts.tauQ ?? 0;
  const minAltBar = opts.minAltMm ?? 0;

  // ── 3D triangle ────────────────────────────────────────────────────────────────────────────────
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  let fx = uy * wz - uz * wy;
  let fy = uz * wx - ux * wz;
  let fz = ux * wy - uy * wx;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  const a3 = 0.5 * fl;

  // ── parameter triangle on the facet's own mean-radius cylinder ─────────────────────────────────
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
  v.normDeg = Number.NaN;
  v.posMm = Number.NaN;
  v.evals = 0;

  // ── T1 PARAMETER DEGENERACY — zero analytic evaluations ────────────────────────────────────────
  // The 3D guard first: a triangle with no area, or with a non-finite coordinate, cannot be reasoned
  // about at all and must never reach the emitter.
  if (!(a3 > 0) || !(lp > 0) || !Number.isFinite(qP) || !Number.isFinite(minAlt)) {
    v.ok = false; v.reason = 'degenerate'; return v;
  }
  if (Math.abs(qP) < tauQ) { v.ok = false; v.reason = 'degenerate'; return v; }

  // ── T2 FOLD / WINDING — zero analytic evaluations ──────────────────────────────────────────────
  if (!(sigma * apS > 0)) { v.ok = false; v.reason = 'fold'; return v; }

  // ── T3 BLADE — zero analytic evaluations ───────────────────────────────────────────────────────
  if (minAlt < minAltBar) { v.ok = false; v.reason = 'blade'; return v; }

  // ── T4 ORIENTATION + POSITION — the only term that costs analytic evaluations ──────────────────
  const rA = opts.rA;
  if (rA === undefined) { v.ok = true; v.reason = 'ok'; return v; }

  const inset = opts.inset ?? 0.05;
  const hfd = opts.fdStepMm ?? 2e-6;
  const zMin = opts.zMin ?? Number.NEGATIVE_INFINITY;
  const zMax = opts.zMax ?? Number.POSITIVE_INFINITY;
  const tauN = opts.tauNDeg ?? 20;
  const posBar = opts.posBarMm ?? 0.01;
  const wsign = opts.wsign ?? 1;
  const perp = (opts.posMode ?? 'perpendicular') === 'perpendicular';

  fx /= fl; fy /= fl; fz /= fl;

  let evals = 0;
  let dotMin = 2;
  let dotMax = -2;
  let jjMin = Number.POSITIVE_INFINITY;   // min over the stencil of J/r >= 1 ⇒ upper-bounds the perp dist

  for (let i = 0; i < NLAT; i += 1) {
    const w0r = LATTICE[i * 3]; const w1r = LATTICE[i * 3 + 1]; const w2r = LATTICE[i * 3 + 2];
    // SCAR 1: pull the sample toward the centroid so it never lands on a crease the mesh conformed to.
    const w0 = w0r + inset * (THIRD - w0r);
    const w1 = w1r + inset * (THIRD - w1r);
    const w2 = w2r + inset * (THIRD - w2r);
    const th = w0 * ath + w1 * bth + w2 * cth;
    const zz = w0 * az + w1 * bz + w2 * cz;

    const r0 = rA(th, zz);
    const hT = hfd / Math.max(1e-9, Math.abs(r0));
    const rt = (rA(th + hT, zz) - rA(th - hT, zz)) / (2 * hT);
    let zl = zz - hfd; let zh = zz + hfd;
    if (zl < zMin) { zl = zMin; zh = Math.min(zMax, zMin + 2 * hfd); }
    if (zh > zMax) { zh = zMax; zl = Math.max(zMin, zMax - 2 * hfd); }
    const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
    evals += 5;

    // outward analytic normal of the radial graph r = rA(theta, z)
    const cth0 = Math.cos(th); const sth0 = Math.sin(th);
    let nx = rt * sth0 + r0 * cth0;
    let ny = r0 * sth0 - rt * cth0;
    let nz = -r0 * rz;
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl > 0) { nx /= nl; ny /= nl; nz /= nl; } else { nx = cth0; ny = sth0; nz = 0; }

    const d = fx * nx + fy * ny + fz * nz;
    if (d < dotMin) dotMin = d;
    if (d > dotMax) dotMax = d;

    const ar = Math.abs(r0);
    const jj = ar > 0 ? Math.sqrt(1 + (rt / ar) * (rt / ar) + rz * rz) : 1;
    if (jj < jjMin) jjMin = jj;
  }

  const dSel = wsign > 0 ? dotMin : -dotMax;
  const normDeg = Math.acos(dSel < -1 ? -1 : dSel > 1 ? 1 : dSel) * DEG;
  v.normDeg = normDeg;
  v.evals = evals;
  if (!(normDeg <= tauN)) { v.ok = false; v.reason = 'orientation'; return v; }

  // POSITION on the FULL (un-inset) footprint: r vs rA has no crease singularity, so the vertices
  // belong in it. One evaluation per point — the derivative divisor is reused from the inset stencil.
  let drMax = 0;
  for (let i = 0; i < NLAT; i += 1) {
    const w0 = LATTICE[i * 3]; const w1 = LATTICE[i * 3 + 1]; const w2 = LATTICE[i * 3 + 2];
    const th = w0 * ath + w1 * bth + w2 * cth;
    const zz = w0 * az + w1 * bz + w2 * cz;
    const px = w0 * ax + w1 * bx + w2 * cx;
    const py = w0 * ay + w1 * by + w2 * cy;
    const dr = Math.abs(Math.sqrt(px * px + py * py) - rA(th, zz));
    evals += 1;
    if (dr > drMax) drMax = dr;
  }
  const posMm = perp && jjMin > 0 && Number.isFinite(jjMin) ? drMax / jjMin : drMax;
  v.posMm = posMm;
  v.evals = evals;
  if (!(posMm <= posBar)) { v.ok = false; v.reason = 'position'; return v; }

  v.ok = true; v.reason = 'ok';
  return v;
}

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// THE (u,t) FORM — what is ACTUALLY computable at the shipping emit closure
// ════════════════════════════════════════════════════════════════════════════════════════════════════
/**
 * *** SAY THE LIMITATION OUT LOUD BEFORE THE API. ***
 *
 * `checkEmitInvariant` above needs 3D positions and (for T4) the analytic radius. THE SHIPPING EMIT
 * CLOSURE HAS NEITHER. `QuadtreeTriangulator.ts:627` and its `FeatureConformingTriangulator.ts:1489`
 * mirror emit VERTEX INDICES into a (u,t) parameter mesh; the lift to millimetres happens two stages
 * later (`WatertightAssembly` `packedPosition`, theta = 2*pi*u). Wiring the full predicate there is not
 * a matter of effort — the inputs do not exist.
 *
 * What DOES exist, with zero extra emitter state, is the parameter triangle. So this is the emit-site
 * form: T1 (degeneracy) and T2 (fold) verbatim, plus T3 (blade) ONLY when the caller supplies the mm
 * scales — which the triangulator cannot, so T3 is OFF by default and reported, never gated.
 *
 * ── WHY T2 HERE IS THE SAME TEST AS T2 THERE, NOT AN ANALOGUE ──────────────────────────────────────
 * The assembly's lift is `theta = 2*pi*u`, `z = H*t`: a DIAGONAL map with POSITIVE entries. Its
 * Jacobian determinant `2*pi*H` is strictly positive whatever the style does, because the style
 * modulates only the RADIUS of the graph `r = rA(theta,z)` — it never reparameterises (theta,z). The
 * arc-space form additionally multiplies theta by `rbar > 0`. Composing three positive scalars cannot
 * flip a sign, so
 *      sign(signed area in (u,t)) === sign(signed area in (rbar*theta, z))     for every triangle.
 * A fold detected here is a fold there, and a fold there is detectable here. `emitCertificate.test.ts`
 * §BRIDGE proves the exact-equality of all three scalars on the linear lift, and §SIGN proves the sign
 * identity over 4,000 randomised triangles on a radial graph that varies in BOTH arguments.
 *
 * ── WHAT IS *NOT* CARRIED OVER, AND MUST NOT BE CLAIMED ────────────────────────────────────────────
 * T3's bar is ABSOLUTE MILLIMETRES. (u,t) are dimensionless, and the (u,t)->mm scale is anisotropic and
 * position-dependent (`2*pi*r(u,t)` by `dz/dt`), so a (u,t) altitude is NOT a millimetre altitude and
 * `DEFENSIBLE_EMIT_UV.minAltBar` is therefore 0 — OFF. T4 needs rA and is absent entirely. A caller
 * that genuinely knows constant scales may pass `scaleU`/`scaleT` and set a bar; the triangulator does
 * not, and does not pretend to.
 */
export type EmitUvReason = 'ok' | 'degenerate' | 'fold' | 'blade';

/** Numeric codes for bucketing without string compares. Shares 0..3 with {@link EMIT_REASON_CODE}. */
export const EMIT_UV_REASON_CODE: Readonly<Record<EmitUvReason, number>> = Object.freeze({
  ok: 0, degenerate: 1, fold: 2, blade: 3,
});

/** The (u,t) verdict. Every scalar is filled on every call — a scratch is never left stale. */
export interface EmitUvVerdict {
  /** True when every ENABLED term passed. */
  ok: boolean;
  /** The first term that refused, in cost order. */
  reason: EmitUvReason;
  /** Signed area of the (scaled) parameter triangle. Units: scaleU*scaleT (default: dimensionless). */
  apUv: number;
  /** Signed normalised parameter shape 4*sqrt(3)*apUv/Lp^2 — equilateral = 3, collinear = 0. */
  qUv: number;
  /** Shortest altitude of the (scaled) parameter triangle. Units: scaleU (default: dimensionless). */
  minAlt: number;
}

/** Thresholds for the (u,t) form. */
export interface EmitUvOptions {
  /** The emitter's fixed global parameter winding. Default +1 (SW->SE->NE is CCW in (u,t)). */
  sigma?: 1 | -1;
  /** T1 floor on |qUv|. 0 disables T1's shape test (the zero-area/non-finite guard always runs). */
  tauQ?: number;
  /** T3 floor on the minimum altitude, in `scaleU` units. 0 disables T3. Default 0 — see the note. */
  minAltBar?: number;
  /** mm per unit u. Default 1 (dimensionless). Only a caller that KNOWS this may set it. */
  scaleU?: number;
  /** mm per unit t. Default 1 (dimensionless). Only a caller that KNOWS this may set it. */
  scaleT?: number;
}

/**
 * THE DEFENSIBLE EMIT-SITE SETTING (S117 P1 part 2).
 *
 * `tauQ` = 0.005 is S116's published defensible cut, carried over verbatim so the ladder stays
 * comparable. `minAltBar` = 0 — DELIBERATELY OFF, because the emit site knows no millimetre scale
 * (see the module note). This setting therefore runs T1 + T2 only: exactly the two terms whose inputs
 * the shipping emitter actually holds.
 */
export const DEFENSIBLE_EMIT_UV = Object.freeze({
  sigma: 1 as const,
  tauQ: 0.005,
  minAltBar: 0,
});

/** Allocate one (u,t) verdict to reuse across a whole emit loop. */
export function makeEmitUvVerdict(): EmitUvVerdict {
  return { ok: false, reason: 'ok', apUv: 0, qUv: 0, minAlt: 0 };
}

/**
 * THE EMIT-SITE PREDICATE, in (u,t).
 *
 * `u` MUST be the emitter's UNWRAPPED u (a right-seam leaf keeps u = 1; it has NOT yet been collapsed
 * onto the u = 0 column). Both shipping triangulators satisfy this by construction: the seam merge is
 * a post-pass over the finished index list, so at emit time `vu[]` still holds the true extent.
 *
 * Pass `out` to run allocation-free; the same object is returned.
 */
export function checkEmitInvariantUV(
  u0: number, t0: number,
  u1: number, t1: number,
  u2: number, t2: number,
  opts: EmitUvOptions,
  out?: EmitUvVerdict,
): EmitUvVerdict {
  const v = out ?? makeEmitUvVerdict();
  const sigma = opts.sigma ?? 1;
  const tauQ = opts.tauQ ?? 0;
  const minAltBar = opts.minAltBar ?? 0;
  const sU = opts.scaleU ?? 1;
  const sT = opts.scaleT ?? 1;

  const x0 = sU * u0; const y0 = sT * t0;
  const x1 = sU * u1; const y1 = sT * t1;
  const x2 = sU * u2; const y2 = sT * t2;

  const ap = 0.5 * ((x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0));
  const e0x = x1 - x0; const e0y = y1 - y0;
  const e1x = x2 - x1; const e1y = y2 - y1;
  const e2x = x0 - x2; const e2y = y0 - y2;
  const l0 = Math.sqrt(e0x * e0x + e0y * e0y);
  const l1 = Math.sqrt(e1x * e1x + e1y * e1y);
  const l2 = Math.sqrt(e2x * e2x + e2y * e2y);
  const lp = l0 > l1 ? (l0 > l2 ? l0 : l2) : (l1 > l2 ? l1 : l2);

  const q = lp > 0 ? (SQ3x4 * ap) / (lp * lp) : 0;
  const alt = lp > 0 ? (2 * Math.abs(ap)) / lp : 0;
  v.apUv = ap;
  v.qUv = q;
  v.minAlt = alt;

  // ── T1 DEGENERACY ────────────────────────────────────────────────────────────────────────────────
  // The hard guard first: a zero-area or non-finite parameter triangle cannot be reasoned about and
  // must never reach the emitter. Then the SCALE-FREE shape floor (an absolute area bound would ban
  // legitimate fine cells — the degeneracy pole is ap/Lp^2 -> 0, not ap -> 0).
  if (!(lp > 0) || !Number.isFinite(ap) || !Number.isFinite(q) || ap === 0) {
    v.ok = false; v.reason = 'degenerate'; return v;
  }
  if (Math.abs(q) < tauQ) { v.ok = false; v.reason = 'degenerate'; return v; }

  // ── T2 FOLD / WINDING ────────────────────────────────────────────────────────────────────────────
  if (!(sigma * ap > 0)) { v.ok = false; v.reason = 'fold'; return v; }

  // ── T3 BLADE — only meaningful when the caller supplied a real mm scale ───────────────────────────
  if (minAltBar > 0 && alt < minAltBar) { v.ok = false; v.reason = 'blade'; return v; }

  v.ok = true; v.reason = 'ok';
  return v;
}
