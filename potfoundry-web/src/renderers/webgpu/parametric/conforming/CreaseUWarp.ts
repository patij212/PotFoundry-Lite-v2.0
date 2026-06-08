/**
 * CreaseUWarp.ts — a periodic, monotonic u-warp that pins existing dyadic mesh
 * columns onto VERTICAL-crease loci, turning a chamfered sharp crease into an
 * actual mesh edge WITHOUT touching connectivity.
 *
 * ## Why this exists
 *
 * The conforming outer wall is built from a periodic 2:1-balanced DYADIC
 * quadtree (columns at i/2^level). A style's sharp vertical creases (e.g.
 * LowPolyFacet facet edges at u=(k+0.5)/N) are usually at NON-dyadic u, so no
 * mesh column lands on them — the dihedral is smeared over one cell and
 * `featuresDropped > 0`.
 *
 * ## The fix (warp, not re-mesh)
 *
 * Build the mesh exactly as before, then apply a single monotonic, periodic
 * piecewise-linear remap φ:[0,1]→[0,1] to EVERY vertex's u-coordinate. φ is a
 * circle homeomorphism: strictly increasing, with the seam fixed (φ(0)=0,
 * φ(1)=1). Because φ is applied uniformly and is a bijection, connectivity is
 * untouched — the mesh stays watertight, oriented, and T-junction-free; only
 * vertex u-positions shift slightly. φ is chosen so a set of EXISTING mesh
 * columns (snapped to the 1/grid lattice the wall actually carries) map EXACTLY
 * onto the crease u-values, so a full-height column now lies on each crease.
 *
 * ## Safety
 *
 * The warp is REFUSED (falls back to identity) whenever pinning could not be
 * done cleanly — two creases colliding on one source column, a snap that would
 * reorder anchors, or a snap onto the fixed seam endpoint. Refusing is always
 * topology-safe (identity changes nothing); a partial/incorrect warp is not
 * attempted. This keeps the invariant "never regress topology" by construction.
 *
 * @module conforming/CreaseUWarp
 */

/** One pinned column: a source grid column mapped exactly onto a crease target. */
export interface UWarpAnchor {
  /** Source u — an exact multiple of 1/grid (an existing mesh column). */
  source: number;
  /** Target u — the crease locus this column is pinned onto. */
  target: number;
}

/**
 * A periodic monotonic u-warp. When `isIdentity` the map is φ(u)=u (the warp was
 * unnecessary or refused for safety). Otherwise `anchors` are the strictly
 * increasing (source→target) control points (with the implicit fixed seam
 * 0→0 / 1→1) of a piecewise-linear circle homeomorphism.
 */
export interface UWarp {
  isIdentity: boolean;
  /** Control points sorted by ascending source, each source∈(0,1), distinct. */
  anchors: UWarpAnchor[];
}

const IDENTITY: UWarp = { isIdentity: true, anchors: [] };

/** Normalize u into [0,1). */
function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

/**
 * Build a warp that pins one grid column onto each crease in `creases`.
 *
 * Each crease c is snapped to its nearest 1/grid column `s = round(c·grid)/grid`
 * (an existing mesh column position), giving a control point (s→c). The full set
 * is sorted by source and validated to be a strictly-increasing map with the
 * seam endpoints fixed (0→0, 1→1). The warp is REFUSED (identity) — never a
 * non-monotonic or topology-breaking map — whenever:
 *  - two creases snap to the same source column (grid too coarse here),
 *  - a NON-seam crease snaps to source 0 (would clobber the fixed seam endpoint),
 *  - sorting sources does not sort targets the same way (would reorder ⇒
 *    non-monotonic).
 *
 * A crease that snaps onto source 0 but is itself essentially on the seam is
 * simply DROPPED (the u=0 seam column is already full-height ⇒ naturally
 * resolved), not treated as a refusal.
 *
 * @param creases Vertical-crease u-loci (periodic, any order). Empty ⇒ identity.
 * @param grid    Column lattice the wall carries (e.g. nRing). Must be a
 *                positive integer; sources are multiples of 1/grid.
 */
export function buildCreaseUWarp(creases: readonly number[], grid: number): UWarp {
  if (!Number.isFinite(grid) || grid < 2) return IDENTITY;
  if (creases.length === 0) return IDENTITY;

  // Snap each crease to its nearest grid column; dedup identical targets.
  const targetSet = new Set<number>();
  const pairs: UWarpAnchor[] = [];
  for (const raw of creases) {
    const c = wrapU(raw);
    const tkey = Math.round(c * grid * 1024); // dedup near-identical targets
    if (targetSet.has(tkey)) continue;
    targetSet.add(tkey);
    let col = Math.round(c * grid) % grid; // source column index in [0,grid)
    if (col < 0) col += grid;
    const source = col / grid;
    // A crease snapping onto the seam column (source 0 ≡ u=1) is a special case:
    // the seam column is ALREADY full-height (u=0 vertices exist at every t), so
    // such a crease is naturally resolved. Only keep it as a real anchor if its
    // target is also essentially on the seam (a fixed point we simply drop);
    // a NON-seam target that snaps to source 0 would clobber the fixed φ(0)=0
    // endpoint, so we refuse the whole warp (topology-safe identity).
    if (source === 0) {
      const nearSeam = Math.min(c, 1 - c) <= 0.5 / grid + 1e-9;
      if (nearSeam) continue; // already on the full-height seam column; skip
      return IDENTITY; // would clobber the fixed seam endpoint
    }
    pairs.push({ source, target: c });
  }

  if (pairs.length === 0) return IDENTITY; // only seam creases ⇒ nothing to pin

  // Distinct source columns required (no two creases share a column).
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
  // be strictly increasing in BOTH source and target for φ to be a homeomorphism.
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

/** A chosen crease grid: the warp plus the power-of-two column lattice it uses. */
export interface CreaseGridChoice {
  /** The pinning warp (may be identity if no clean grid was found). */
  warp: UWarp;
  /**
   * Power-of-two column count the warp snaps to. Callers force a uniform base
   * refinement to log2(grid) so every snapped source column is full-height.
   * Equals 0 when `warp.isIdentity` (no refinement needed).
   */
  grid: number;
  /** log2(grid) — the uniform base level to refine to. 0 when identity. */
  level: number;
}

/**
 * Choose the COARSEST power-of-two column lattice on which every crease snaps to
 * a distinct, non-seam column, and build the pinning warp on it.
 *
 * Snapping to a COARSE grid (rather than the fine nRing) is essential: only
 * coarse columns can be made full-height cheaply (via a uniform base refinement
 * to log2(grid)), and a crease becomes a real mesh edge only if a full-height
 * column lands on it. The search walks K = 2^level from `minLevel`..`maxLevel`
 * and returns the first K whose warp is valid (non-identity).
 *
 * Creases that are ALREADY exactly dyadic (on the 1/2^level lattice for some
 * level ≤ maxLevel — e.g. GeometricStar folds at (2k+1)/16) need no warp: the
 * natural dyadic mesh already carries a full-height column there. Such cases
 * return identity (no warp, no forced floor), leaving the mesh untouched. If no
 * clean lattice is found (creases too dense for the level cap), identity is
 * returned too — always topology-safe.
 *
 * @param creases  Vertical-crease u-loci (periodic, any order).
 * @param minLevel Smallest base level to try (default 3 ⇒ K=8).
 * @param maxLevel Largest base level to try (default 6 ⇒ K=64; bounds triangle
 *                 inflation from the uniform floor).
 */
export function chooseCreaseGrid(
  creases: readonly number[],
  minLevel = 3,
  maxLevel = 6,
): CreaseGridChoice {
  if (creases.length === 0) return { warp: IDENTITY, grid: 0, level: 0 };

  // Already-dyadic creases (exact multiples of 1/2^L for some L ≤ maxLevel) are
  // resolved by the natural mesh — never warp them (no-op, no forced floor).
  const dyadicTol = 1e-6;
  const allDyadic = creases.every((raw) => {
    const c = wrapU(raw);
    const g = c * (1 << maxLevel);
    return Math.abs(g - Math.round(g)) < dyadicTol;
  });
  if (allDyadic) return { warp: IDENTITY, grid: 0, level: 0 };

  // The lattice must have at least as many columns as creases to host them all.
  let startLevel = minLevel;
  while ((1 << startLevel) < creases.length && startLevel < maxLevel) startLevel++;
  for (let level = startLevel; level <= maxLevel; level++) {
    const grid = 1 << level;
    const warp = buildCreaseUWarp(creases, grid);
    if (!warp.isIdentity) return { warp, grid, level };
  }
  return { warp: IDENTITY, grid: 0, level: 0 };
}

/**
 * Evaluate the warp at u (periodic). For u∈[0,1) returns φ(u)∈[0,1); inputs
 * outside [0,1) are handled by periodic extension (φ(u+1)=φ(u)+1) so callers may
 * pass raw vertex u (including the u=1 seam, which maps to exactly 1).
 */
export function applyUWarp(warp: UWarp, u: number): number {
  if (warp.isIdentity) return u;
  // Periodic extension: shift the integer part out, warp the fraction, add back.
  const base = Math.floor(u);
  const frac = u - base;
  // Augmented strictly-increasing control points including the fixed seam.
  const src = [0, ...warp.anchors.map((a) => a.source), 1];
  const tgt = [0, ...warp.anchors.map((a) => a.target), 1];
  // Find the segment [src[i], src[i+1]] containing frac (binary scan is overkill
  // for the tiny anchor count; linear is fine and branch-predictable).
  let i = 0;
  while (i < src.length - 2 && frac > src[i + 1]) i++;
  const s0 = src[i];
  const s1 = src[i + 1];
  const t0 = tgt[i];
  const t1 = tgt[i + 1];
  const span = s1 - s0;
  const f = span > 0 ? (frac - s0) / span : 0;
  const warped = t0 + (t1 - t0) * f;
  return base + warped;
}
