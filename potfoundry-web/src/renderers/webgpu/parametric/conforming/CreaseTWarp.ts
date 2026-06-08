/**
 * CreaseTWarp.ts — a monotonic, ENDPOINT-FIXED t-warp that pins existing dyadic
 * mesh ROWS onto HORIZONTAL-crease loci (t=const), turning a chamfered sharp
 * ring crease into an actual mesh edge WITHOUT touching connectivity.
 *
 * ## Why this exists
 *
 * This is the horizontal twin of {@link module:conforming/CreaseUWarp}. Several
 * styles have sharp creases that ring the pot at constant height — e.g.
 * BambooSegments node rings at t=k/node_count, DragonScales row boundaries at
 * t=k/scale_rows. The conforming wall's dyadic rows (t=j/2^level) usually do NOT
 * land on those non-dyadic t-values, so the dihedral is smeared over one cell
 * and `featuresDropped > 0`.
 *
 * ## The fix (warp, not re-mesh)
 *
 * Build the mesh exactly as before, then apply a single monotonic piecewise-
 * linear remap ψ:[0,1]→[0,1] to EVERY (wall) vertex's t-coordinate. ψ is an
 * INTERVAL homeomorphism: strictly increasing, with BOTH endpoints fixed
 * (ψ(0)=0, ψ(1)=1). Fixing the endpoints is essential — the t=0 and t=1
 * boundary rings are SHARED with the cap/rim surfaces (WatertightAssembly), so
 * they must NOT move or the watertight index-sharing breaks. Because ψ is
 * applied uniformly and is a bijection, connectivity is untouched; only interior
 * vertex t-positions shift, so the mesh stays watertight, oriented, and
 * T-junction-free. ψ maps a set of EXISTING full-width mesh ROWS (snapped to the
 * 1/grid lattice the wall carries) EXACTLY onto the crease t-values, so a
 * full-width row now lies on each ring crease.
 *
 * ## Difference from the u-warp
 *
 * u is PERIODIC (a circle) with only the seam endpoint fixed; t is an INTERVAL
 * with BOTH endpoints fixed. So a horizontal crease that snaps onto row 0 OR row
 * `grid` (the t=0/t=1 boundaries) is simply DROPPED (those boundary rings are
 * already full-width and shared with the caps ⇒ naturally resolved), never
 * pinned. A non-boundary crease that would snap onto an endpoint refuses the
 * whole warp (topology-safe identity) so an endpoint never moves.
 *
 * ## Safety
 *
 * The warp is REFUSED (falls back to identity) whenever pinning could not be
 * done cleanly — two creases colliding on one source row, a snap that would
 * reorder anchors, or a snap onto a fixed endpoint row. Refusing is always
 * topology-safe (identity changes nothing); a partial/incorrect warp is not
 * attempted. This keeps the invariant "never regress topology" by construction.
 *
 * @module conforming/CreaseTWarp
 */

/** One pinned row: a source grid row mapped exactly onto a crease target. */
export interface TWarpAnchor {
  /** Source t — an exact multiple of 1/grid (an existing mesh row). */
  source: number;
  /** Target t — the crease locus this row is pinned onto. */
  target: number;
}

/**
 * A monotonic, endpoint-fixed t-warp. When `isIdentity` the map is ψ(t)=t (the
 * warp was unnecessary or refused for safety). Otherwise `anchors` are the
 * strictly increasing (source→target) control points (with the implicit fixed
 * endpoints 0→0 / 1→1) of a piecewise-linear interval homeomorphism.
 */
export interface TWarp {
  isIdentity: boolean;
  /** Control points sorted by ascending source, each source∈(0,1), distinct. */
  anchors: TWarpAnchor[];
}

const IDENTITY: TWarp = { isIdentity: true, anchors: [] };

/** Clamp t into [0,1] (t is an interval coordinate, NOT periodic). */
function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Build a warp that pins one grid row onto each crease in `creases`.
 *
 * Each crease c is snapped to its nearest 1/grid row `s = round(c·grid)/grid`
 * (an existing full-width mesh row), giving a control point (s→c). The full set
 * is sorted by source and validated to be a strictly-increasing map with the
 * endpoints fixed (0→0, 1→1). The warp is REFUSED (identity) — never a
 * non-monotonic or topology-breaking map — whenever:
 *  - two creases snap to the same source row (grid too coarse here),
 *  - a NON-boundary crease snaps to row 0 or row `grid` (would clobber a fixed
 *    endpoint),
 *  - sorting sources does not sort targets the same way (would reorder ⇒
 *    non-monotonic).
 *
 * A crease that snaps onto an endpoint row but is itself essentially on the
 * boundary (t≈0 or t≈1) is simply DROPPED (the boundary ring is already
 * full-width and shared with the caps ⇒ naturally resolved), not a refusal.
 *
 * @param creases Horizontal-crease t-loci (any order, in [0,1]). Empty ⇒ identity.
 * @param grid    Row lattice the wall carries (a power of two). Must be a
 *                positive integer ≥2; sources are multiples of 1/grid.
 */
export function buildCreaseTWarp(creases: readonly number[], grid: number): TWarp {
  if (!Number.isFinite(grid) || grid < 2) return IDENTITY;
  if (creases.length === 0) return IDENTITY;

  const targetSet = new Set<number>();
  const pairs: TWarpAnchor[] = [];
  for (const raw of creases) {
    const c = clamp01(raw);
    const tkey = Math.round(c * grid * 1024); // dedup near-identical targets
    if (targetSet.has(tkey)) continue;
    targetSet.add(tkey);
    const row = Math.round(c * grid); // source row index in [0,grid]
    const source = row / grid;
    // An endpoint row (0 or grid) is a FIXED point of ψ. A crease that snaps
    // there is either already on the boundary (drop — the boundary ring is
    // full-width and shared with the caps, so it is naturally resolved) or it is
    // a real interior crease that would clobber the fixed endpoint (refuse).
    if (row === 0 || row === grid) {
      const nearBoundary = Math.min(c, 1 - c) <= 0.5 / grid + 1e-9;
      if (nearBoundary) continue; // already on a full-width boundary row; skip
      return IDENTITY; // would clobber a fixed endpoint
    }
    pairs.push({ source, target: c });
  }

  if (pairs.length === 0) return IDENTITY; // only boundary creases ⇒ nothing to pin

  // Distinct source rows required (no two creases share a row).
  const srcKeys = new Set(pairs.map((p) => Math.round(p.source * grid)));
  if (srcKeys.size !== pairs.length) return IDENTITY;

  // Sort by source; verify targets are in the same (strictly increasing) order —
  // otherwise the piecewise-linear map would be non-monotonic.
  pairs.sort((a, b) => a.source - b.source);
  for (let i = 1; i < pairs.length; i++) {
    if (pairs[i].target <= pairs[i - 1].target) return IDENTITY;
    if (pairs[i].source <= pairs[i - 1].source) return IDENTITY;
  }

  // Every segment of the augmented control sequence (0→0, …anchors…, 1→1) must
  // be strictly increasing in BOTH source and target for ψ to be a homeomorphism.
  const augSrc = [0, ...pairs.map((p) => p.source), 1];
  const augTgt = [0, ...pairs.map((p) => p.target), 1];
  for (let i = 1; i < augSrc.length; i++) {
    if (augSrc[i] <= augSrc[i - 1]) return IDENTITY;
    if (augTgt[i] <= augTgt[i - 1]) return IDENTITY;
  }

  // If every anchor is already a fixed point (source==target) the warp is a no-op.
  const moves = pairs.some((p) => Math.abs(p.source - p.target) > 1e-12);
  if (!moves) return IDENTITY;

  return { isIdentity: false, anchors: pairs };
}

/** A chosen crease grid: the warp plus the power-of-two row lattice it uses. */
export interface CreaseTGridChoice {
  /** The pinning warp (may be identity if no clean grid was found). */
  warp: TWarp;
  /**
   * Power-of-two row count the warp snaps to. Callers force a uniform base
   * refinement to log2(grid) so every snapped source row is full-width.
   * Equals 0 when `warp.isIdentity` (no refinement needed).
   */
  grid: number;
  /** log2(grid) — the uniform base level to refine to. 0 when identity. */
  level: number;
}

/**
 * Choose the COARSEST power-of-two ROW lattice on which every crease snaps to a
 * distinct, non-endpoint row, and build the pinning warp on it.
 *
 * Snapping to a COARSE grid (rather than a fine row count) is essential: only
 * coarse rows can be made full-width cheaply (via a uniform base refinement to
 * log2(grid)), and a crease becomes a real mesh edge only if a full-width row
 * lands on it. The search walks K = 2^level from `minLevel`..`maxLevel` and
 * returns the first K whose warp is valid (non-identity).
 *
 * Creases that are ALREADY exactly dyadic (on the 1/2^level lattice for some
 * level ≤ maxLevel) need no warp: the natural dyadic mesh already carries a
 * full-width row there. Such cases return identity (no warp, no forced floor).
 * If no clean lattice is found (creases too dense for the level cap), identity
 * is returned too — always topology-safe.
 *
 * @param creases  Horizontal-crease t-loci (any order, in [0,1]).
 * @param minLevel Smallest base level to try (default 3 ⇒ K=8).
 * @param maxLevel Largest base level to try (default 6 ⇒ K=64; bounds triangle
 *                 inflation from the uniform floor).
 */
export function chooseCreaseTGrid(
  creases: readonly number[],
  minLevel = 3,
  maxLevel = 6,
): CreaseTGridChoice {
  if (creases.length === 0) return { warp: IDENTITY, grid: 0, level: 0 };

  // Only interior creases matter; boundary creases (t≈0/1) are already resolved.
  const interior = creases.filter((raw) => {
    const c = clamp01(raw);
    return Math.min(c, 1 - c) > 1e-6;
  });
  if (interior.length === 0) return { warp: IDENTITY, grid: 0, level: 0 };

  // Already-dyadic creases (exact multiples of 1/2^L for some L ≤ maxLevel) are
  // resolved by the natural mesh — never warp them (no-op, no forced floor).
  const dyadicTol = 1e-6;
  const allDyadic = interior.every((raw) => {
    const c = clamp01(raw);
    const g = c * (1 << maxLevel);
    return Math.abs(g - Math.round(g)) < dyadicTol;
  });
  if (allDyadic) return { warp: IDENTITY, grid: 0, level: 0 };

  // The lattice must have at least as many INTERIOR rows as creases to host them
  // all (rows 1..grid-1 are interior ⇒ grid-1 slots ≥ interior.length).
  let startLevel = minLevel;
  while ((1 << startLevel) - 1 < interior.length && startLevel < maxLevel) startLevel++;
  for (let level = startLevel; level <= maxLevel; level++) {
    const grid = 1 << level;
    const warp = buildCreaseTWarp(interior, grid);
    if (!warp.isIdentity) return { warp, grid, level };
  }
  return { warp: IDENTITY, grid: 0, level: 0 };
}

/**
 * Evaluate the warp at t∈[0,1]. Returns ψ(t)∈[0,1]. Inputs are clamped to [0,1]
 * (t is an interval coordinate, not periodic); the endpoints are exact fixed
 * points so ψ(0)=0 and ψ(1)=1.
 */
export function applyTWarp(warp: TWarp, t: number): number {
  if (warp.isIdentity) return t;
  const x = clamp01(t);
  // Augmented strictly-increasing control points including the fixed endpoints.
  const src = [0, ...warp.anchors.map((a) => a.source), 1];
  const tgt = [0, ...warp.anchors.map((a) => a.target), 1];
  // Find the segment [src[i], src[i+1]] containing x.
  let i = 0;
  while (i < src.length - 2 && x > src[i + 1]) i++;
  const s0 = src[i];
  const s1 = src[i + 1];
  const t0 = tgt[i];
  const t1 = tgt[i + 1];
  const span = s1 - s0;
  const f = span > 0 ? (x - s0) / span : 0;
  return t0 + (t1 - t0) * f;
}
