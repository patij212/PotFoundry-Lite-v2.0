/**
 * QuadtreeCellKeyCodec.ts — collision-free packed-INTEGER encoding of a
 * quadtree leaf's identity, replacing the per-leaf template-literal STRING keys
 * (`${level}:${it}:${eUL}:${iu}`) that PeriodicBalancedQuadtree and both
 * triangulators used for their `Set`/`Map` cell indices.
 *
 * ## Why
 *
 * E-2026-07-10-EMIT-CPU-PROFILE (a real V8 sampling profile of a production
 * default export) found the string-key pattern — build a template-literal
 * string per cell, then `Set<string>.has`/`add` it — was ~56% of the ENTIRE
 * export's CPU time, split across `PeriodicBalancedQuadtree.hasLeaf`/`cellKey`/
 * `cellOfKey` (50.4%) plus the triangulators' own re-implementations (5.6%),
 * with a further 9.2% in the garbage collector churning the per-call string
 * allocations. A numeric key hashes/compares with NO allocation. The codebase
 * already proves this pattern works: the triangulators' grid-line registry
 * (`regH`/`regV`) is numeric-keyed and cheap.
 *
 * ## Why it stays correct (the load-bearing invariant)
 *
 * The packed key MUST be a BIJECTION on the same (level, it, uExtra, iu) domain
 * the string key covered — a collision would silently merge two distinct
 * quadtree leaves and corrupt the mesh (not just slow it). Each field is packed
 * into its own bit-range wide enough to hold its full range, so distinct tuples
 * NEVER share a key (proven by {@link QuadtreeCellKeyCodec.test.ts}: exhaustive
 * round-trip + distinctness at low levels, boundary-sampled higher up). The
 * fields' widths are computed from the tree's actual (maxLevel, uBiasLevel), and
 * the constructor THROWS if they would exceed JS's 53-bit safe-integer range
 * (unreachable for production — maxLevel ≤ 18 / uBias ≤ 4 packs into ≤ 50 bits)
 * rather than silently overflow into collisions.
 *
 * The key stores `uExtra` (not the derived `eUL = level + uBiasLevel + uExtra`)
 * because uExtra ∈ [0, MAX_U_EXTRA_FOR_CODEC] needs only 3 bits vs eUL's ~5, and
 * (level, uExtra) ⟺ (level, eUL) bijectively for a fixed uBiasLevel — so the
 * equivalence classes are IDENTICAL to the old `${level}:${it}:${eUL}:${iu}`.
 *
 * @module conforming/QuadtreeCellKeyCodec
 */

/** Cap on per-leaf directional u-refinement — MUST match `MAX_U_EXTRA` in
 *  PeriodicBalancedQuadtree.ts (the codec sizes the uExtra field to it). */
export const MAX_U_EXTRA_FOR_CODEC = 4;

/** Bits needed to represent every integer in [0, maxValue] (exact integer math,
 *  no Math.log2 rounding fuzz). bitsFor(0)=1, bitsFor(16)=5, bitsFor(4)=3. */
function bitsFor(maxValue: number): number {
  if (maxValue <= 0) return 1;
  let bits = 0;
  let v = maxValue;
  while (v > 0) {
    v = Math.floor(v / 2);
    bits++;
  }
  return bits;
}

export interface QuadtreeCellKeyCodec {
  /** Pack a primary leaf identity (level, it, uExtra, iu) into one integer key. */
  packCell(level: number, it: number, uExtra: number, iu: number): number;
  /** Inverse of {@link packCell}. */
  unpackCell(key: number): { level: number; it: number; uExtra: number; iu: number };
  /** Pack a SECONDARY effective-u index key (eUL, it, iu) — the `uByEffective`
   *  map key; never decoded, only used for membership/lookup, so no unpack. */
  packUEff(eUL: number, it: number, iu: number): number;
}

/**
 * Build a codec for a quadtree with the given bounds. `maxLevel` bounds `level`
 * (and hence `it < 2^level`); `maxEUL = maxLevel + uBiasLevel + MAX_U_EXTRA`
 * bounds `eUL` (and hence `iu < 2^eUL`). Throws if the packed key would exceed
 * the safe-integer range (would collide) — see the module doc.
 */
export function makeQuadtreeCellKeyCodec(maxLevel: number, uBiasLevel: number): QuadtreeCellKeyCodec {
  const maxEUL = maxLevel + uBiasLevel + MAX_U_EXTRA_FOR_CODEC;

  // Field widths. it < 2^level ≤ 2^maxLevel ⇒ IT_BITS = maxLevel exactly;
  // iu < 2^eUL ≤ 2^maxEUL ⇒ IU_BITS = maxEUL exactly.
  const LEVEL_BITS = bitsFor(maxLevel);
  const IT_BITS = maxLevel;
  const UEXTRA_BITS = bitsFor(MAX_U_EXTRA_FOR_CODEC);
  const IU_BITS = maxEUL;
  const EUL_BITS = bitsFor(maxEUL);

  const cellBits = LEVEL_BITS + IT_BITS + UEXTRA_BITS + IU_BITS;
  const uEffBits = EUL_BITS + IT_BITS + IU_BITS;
  const totalBits = Math.max(cellBits, uEffBits);
  // 52 (not 53) for a full bit of margin: max key < 2^totalBits ≤ 2^52 < 2^53−1.
  if (totalBits > 52) {
    throw new Error(
      `QuadtreeCellKeyCodec: packed key needs ${totalBits} bits (> 52) for ` +
        `maxLevel=${maxLevel}, uBias=${uBiasLevel} — exceeds JS safe-integer range, ` +
        `the numeric key would collide. Unreachable for production (maxLevel ≤ 18 / uBias ≤ 4).`,
    );
  }

  // Powers of two ⇒ every multiply/divide below is EXACT on IEEE-754 doubles.
  const IU_P = 2 ** IU_BITS;
  const UEXTRA_P = 2 ** UEXTRA_BITS;
  const IT_P = 2 ** IT_BITS;
  // Primary key field order, low → high: iu | uExtra | it | level.
  const CELL_UEXTRA_MUL = IU_P;
  const CELL_IT_MUL = IU_P * UEXTRA_P;
  const CELL_LEVEL_MUL = IU_P * UEXTRA_P * IT_P;
  // uEff key field order, low → high: iu | it | eUL.
  const UEFF_IT_MUL = IU_P;
  const UEFF_EUL_MUL = IU_P * IT_P;

  return {
    packCell(level, it, uExtra, iu) {
      return iu + uExtra * CELL_UEXTRA_MUL + it * CELL_IT_MUL + level * CELL_LEVEL_MUL;
    },
    unpackCell(key) {
      const iu = key % IU_P;
      let r = (key - iu) / IU_P;
      const uExtra = r % UEXTRA_P;
      r = (r - uExtra) / UEXTRA_P;
      const it = r % IT_P;
      const level = (r - it) / IT_P;
      return { level, it, uExtra, iu };
    },
    packUEff(eUL, it, iu) {
      return iu + it * UEFF_IT_MUL + eUL * UEFF_EUL_MUL;
    },
  };
}
