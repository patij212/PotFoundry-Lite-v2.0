/**
 * CreaseHelixWarp.ts — a topology-preserving, t-dependent u-warp that bends
 * existing full-height dyadic mesh columns into CONSTANT-SLOPE HELICAL creases
 * (e.g. SpiralRidges ridges), turning a smeared diagonal ridge into an actual
 * mesh edge WITHOUT touching connectivity.
 *
 * ## Why this exists
 *
 * This is the DIAGONAL member of the warp family alongside
 * {@link module:conforming/CreaseUWarp} (vertical creases) and
 * {@link module:conforming/CreaseTWarp} (horizontal creases).
 *
 * SpiralRidges' sharp loci are NOT axis-aligned: the radius crest of
 * `sin(k·theta + TAU·turns·t)` (see `spiral_radius` in styles.wgsl) lies where
 * `k·u + turns·t = ¼ + c` (theta = u·TAU), i.e. on the helical lines
 *
 *     u = (¼ + c − turns·t) / k       (c = 0 … k−1)
 *
 * — k parallel straight lines in (u,t) of constant slope `−turns/k`. A vertical
 * mesh column (constant u, full height) CANNOT lie along a diagonal, so neither
 * the u-warp nor the t-warp can pin these; the dihedral is smeared over one cell
 * and the ridges are dropped (and badly under-resolved → large sag).
 *
 * ## The fix (shear + column-pin, applied uniformly ⇒ topology-safe)
 *
 * Build the mesh exactly as before, then apply a single per-vertex u-remap that
 * depends on BOTH u and t:
 *
 *     u_final = φ₀(u)  −  (turns/k)·t  +  offset      (mod 1)
 *
 * where:
 *  - **φ₀** is a PERIODIC, MONOTONE, seam-fixed circle homeomorphism (exactly the
 *    {@link module:conforming/CreaseUWarp} φ) that pins k full-height mesh columns
 *    onto the SEAM-AVOIDING anchor positions `(c + ½)/k` (c = 0 … k−1). These are
 *    equally spaced like the ridges but offset half a spacing, so NONE lands on
 *    the u=0 seam — every ridge gets an EXACT (not seam-approximated) pin. φ₀ is
 *    independent of t.
 *  - the **shear** `−(turns/k)·t (mod 1)` is, at any FIXED t, a RIGID ROTATION of
 *    the u-circle — an isometry, hence trivially a monotone bijection.
 *  - the constant **offset** `= (phaseU − ½)/k` is a rigid rotation that slides
 *    the half-spacing anchors back onto the true ridge phase. A constant rotation
 *    is a circle isometry, so it changes nothing about monotonicity/periodicity.
 *
 * Anchor `(c+½)/k`, pinned by φ₀, is swept and offset to trace
 * `u_final = (c+½)/k − (turns/k)·t + (phaseU−½)/k = (phaseU + c − turns·t)/k`
 * — exactly helix c. So a full-height column lies on EVERY ridge, at every t,
 * with no seam special-casing.
 *
 * ## Why topology is preserved (by construction)
 *
 * At each fixed t, `u ↦ φ₀(u) − (turns/k)·t (mod 1)` is the composition of a
 * monotone circle homeomorphism (φ₀) with a rigid rotation — itself a monotone
 * circle homeomorphism. Applied UNIFORMLY to every vertex's u (t held per
 * vertex), it only shifts u-positions; indices/connectivity are untouched, so a
 * watertight, oriented, T-junction-free mesh stays exactly that. No triangle can
 * invert because the within-row u-ordering is preserved and the inter-row shear
 * is a pure translation of the whole circle (it cannot fold).
 *
 * ## Periodicity / non-integer slope
 *
 * Unlike a naive "snap each helix to a column" scheme, the shear here is ADDITIVE
 * in u, so it is ALWAYS periodic regardless of whether `turns/k` is integer:
 * `u_final(u+1,t) = u_final(u,t) + 1`. The non-integer slope only means a column
 * does not return to itself after one circuit — which is fine for a per-row
 * rotation. So the periodicity caveat that would sink a column-snap scheme does
 * NOT apply; the warp is REFUSED only when φ₀ itself cannot pin the k base
 * columns cleanly (delegated to chooseCreaseGrid), never for slope reasons.
 *
 * @module conforming/CreaseHelixWarp
 */

import { type UWarp, applyUWarp, chooseCreaseGrid } from './CreaseUWarp';

/**
 * A helical u-warp: the periodic base column-pin φ₀ plus the per-t shear rate.
 * When `isIdentity` the map is u_final = u (warp unnecessary or refused). The
 * base warp φ₀ may itself be identity (k base columns already on-lattice) while
 * the shear is still active — that is the common SpiralRidges case.
 */
export interface HelixWarp {
  isIdentity: boolean;
  /** Periodic, seam-fixed base warp pinning columns onto the (c+½)/k anchors. */
  base: UWarp;
  /** Shear rate: u_final = φ₀(u) − shearRate·t + offset (mod 1). Equals turns/k. */
  shearRate: number;
  /** Constant rigid rotation sliding half-spacing anchors onto the ridge phase. */
  offset: number;
}

const IDENTITY: HelixWarp = {
  isIdentity: true,
  base: { isIdentity: true, anchors: [] },
  shearRate: 0,
  offset: 0,
};

/** Normalize u into [0,1). */
function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

/** A chosen helix grid: the warp plus the power-of-two column lattice it needs. */
export interface HelixGridChoice {
  /** The helical warp (may be identity if no clean base lattice was found). */
  warp: HelixWarp;
  /**
   * Power-of-two column count the BASE warp snaps to (so a uniform floor to
   * log2(grid) makes every pinned column full-height). 0 when no floor is forced
   * (identity, or the base columns are already dyadic and need no warp).
   */
  grid: number;
  /** log2(grid) — the uniform base level to refine to. 0 when no floor forced. */
  level: number;
}

/**
 * Choose the column lattice + build the helical warp for a constant-slope ridge
 * family with `k` ridges, total `turns` helical turns, and base phase `phaseU`
 * (the t=0 crest offset, in u, of ridge c=0 — `¼/k` for a pure `sin` crest, but
 * passed explicitly so the caller controls which locus is pinned).
 *
 * The k ridges intersect the t=0 row at `u_c(0) = (phaseU + c)/k`, k columns
 * equally spaced by 1/k. These are handed to {@link chooseCreaseGrid}, which
 * picks the coarsest power-of-two lattice hosting them on distinct, non-seam
 * columns and builds the periodic base warp φ₀ (or returns identity if already
 * dyadic / too dense). The shear rate is `turns/k`.
 *
 * REFUSAL (identity) is delegated to chooseCreaseGrid: if the k base columns
 * cannot be pinned cleanly (collision, seam clobber, or beyond the level cap) the
 * whole helix warp is identity — always topology-safe. The shear alone is never
 * applied without a successful (or already-resolved) base pin, so a ridge is
 * pinned only when a real full-height column can land on it.
 *
 * @param k       Ridge count (≥1). <1 or non-finite ⇒ identity.
 * @param turns   Total helical turns base→rim. 0 ⇒ vertical (degenerate helix);
 *                handled by the u-warp instead, so identity here.
 * @param phaseU  t=0 crest offset of ridge 0, in u (default ¼/k = sin crest).
 * @param minLevel Smallest base level to try (forwarded to chooseCreaseGrid).
 * @param maxLevel Largest base level to try (forwarded to chooseCreaseGrid).
 */
export function chooseHelixGrid(
  k: number,
  turns: number,
  phaseU?: number,
  minLevel = 3,
  maxLevel = 6,
): HelixGridChoice {
  if (!Number.isFinite(k) || k < 1) return { warp: IDENTITY, grid: 0, level: 0 };
  if (!Number.isFinite(turns) || Math.abs(turns) < 1e-9) {
    // No helical advance ⇒ the ridges are vertical; the u-warp family covers
    // that case. Refuse here (identity) so we never double-pin.
    return { warp: IDENTITY, grid: 0, level: 0 };
  }
  const kInt = Math.round(k);
  if (kInt < 1) return { warp: IDENTITY, grid: 0, level: 0 };

  // True ridge phase (t=0 crest offset of ridge 0, in u). Default ¼/k = sin crest.
  const ridgePhase = phaseU ?? 0.25 / kInt;
  // SEAM-AVOIDING anchors: equally spaced like the ridges but offset half a
  // spacing so none lands on the u=0 seam (which buildCreaseUWarp would have to
  // drop, leaving that ridge seam-approximated rather than exactly pinned).
  const anchorCols: number[] = [];
  for (let c = 0; c < kInt; c++) anchorCols.push(wrapU((c + 0.5) / kInt));
  // Constant rotation that slides the half-spacing anchors back onto the ridge
  // phase: anchor (c+½)/k + offset = (ridgePhase + c)/k ⇒ offset = (ridgePhase−½)/k.
  const offset = (ridgePhase - 0.5) / kInt;

  const choice = chooseCreaseGrid(anchorCols, minLevel, maxLevel);
  const shearRate = turns / kInt;

  // The base warp may legitimately be identity (the k columns are already dyadic
  // — e.g. fall on the natural lattice). In that case NO floor is forced, but the
  // shear is STILL needed to bend those (already-present) columns along the
  // helix. So we keep a non-identity helix warp with an identity base.
  // However, if chooseCreaseGrid REFUSED because the columns could not be pinned
  // (too dense / collision), we cannot guarantee full-height columns at the base
  // offsets, so the helix warp must also refuse. chooseCreaseGrid signals "clean
  // but no warp needed" (already dyadic) vs "refused" identically (identity,
  // grid 0); to disambiguate we re-check dyadicity here.
  if (choice.warp.isIdentity) {
    const allDyadic = anchorCols.every((u) => {
      const g = u * (1 << maxLevel);
      return Math.abs(g - Math.round(g)) < 1e-6;
    });
    if (!allDyadic) return { warp: IDENTITY, grid: 0, level: 0 }; // refused pin
    // Already-dyadic anchor columns: shear-only warp, no forced floor.
    return {
      warp: { isIdentity: false, base: choice.warp, shearRate, offset },
      grid: 0,
      level: 0,
    };
  }

  return {
    warp: { isIdentity: false, base: choice.warp, shearRate, offset },
    grid: choice.grid,
    level: choice.level,
  };
}

/**
 * Evaluate the helical warp at (u,t). Returns the CONTINUOUS (un-wrapped) value
 * `φ₀(u) − shearRate·t + offset`. It is NOT folded into [0,1): the downstream
 * mesh has index-shared SEAM vertices stored at u=0 whose seam-flagged triangles
 * are unwrapped by the GPU as u+1. The warp is periodic
 * (`f(u+1) = f(u)+1`), so keeping the output on the SAME continuous branch as the
 * input preserves that unwrap exactly — folding it back into [0,1) here would
 * shift a near-seam vertex by a full turn relative to its neighbours and collapse
 * the seam triangle. Consumers that need a fractional u (e.g. the resolution
 * metric) wrap it themselves; geometry uses theta = u·TAU, which is periodic, so
 * an out-of-range u is harmless. At any fixed t the map is still a monotone
 * (now branch-continuous) bijection.
 */
export function applyHelixWarp(warp: HelixWarp, u: number, t: number): number {
  if (warp.isIdentity) return u;
  const phi0 = applyUWarp(warp.base, u); // periodic, monotone, seam-fixed
  return phi0 - warp.shearRate * t + warp.offset;
}
