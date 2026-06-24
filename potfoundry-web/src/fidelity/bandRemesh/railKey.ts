/**
 * railKey.ts — the shared rail-vertex keyer reconciling the band-remesh exact
 * weld key with the production complement's QSCALE dyadic quantizer (Task 1 of
 * the general-mesher integration spike — the #1 crux).
 *
 * ## The two keying regimes
 *
 * The proven band-remesh paver ({@link module:fidelity/bandRemesh/paver}) welds
 * vertices by an EXACT string key `${u}|${t}` — NO quantization. The production
 * complement {@link triangulateQuadtreeWithFeatures} (in
 * `FeatureConformingTriangulator.ts`) welds by a QUANTIZED packed key, copied
 * here VERBATIM from its private `vertexIndex()` (line ~421-424):
 *
 * ```ts
 * const QSCALE = 1 << 24;
 * const qu = Math.round(u * QSCALE);
 * const qt2 = Math.round(t * QSCALE);
 * const key = qu * (QSCALE * 2 + 1) + qt2;
 * ```
 *
 * These regimes are NOT bit-compatible. A non-dyadic rail (u,t) the band treats
 * as a single vertex can round to a DIFFERENT quantized cell on the complement
 * side → two vertices → a T-junction across the seam between the band fill and
 * the complement.
 *
 * ## The reconciliation
 *
 * Snap every rail vertex onto the complement's QSCALE dyadic grid with
 * {@link quantizeRailUT} BEFORE feeding it to BOTH `paveBand` (band side) and the
 * complement's force-register (Task 3). A snapped (u,t) is an exact `k / QSCALE`
 * ratio, so the band's exact-string key and the complement's `railVertexKey`
 * agree on identity: two snapped points are equal under one keyer iff equal under
 * the other. u is taken mod 1 (periodic) BEFORE rounding so the seam (u≈0 ≡ u≈1)
 * closes to a single key — matching the complement's seam-merge pass.
 *
 * Pure CPU, no DOM, no GPU.
 *
 * @module fidelity/bandRemesh/railKey
 */

/**
 * Quantization scale for vertex dedup. MUST equal the complement triangulator's
 * `QSCALE` (`FeatureConformingTriangulator.ts:77`) — a one-bit difference defeats
 * the reconciliation. Exact for dyadic coords up to level 24.
 */
export const QSCALE = 1 << 24;

/**
 * Snap a rail (u,t) onto the complement's QSCALE dyadic grid.
 *
 * - `u` is taken mod 1 (periodic) BEFORE rounding so a vertex at u≈1 and its twin
 *   at u≈0 collapse to the IDENTICAL snapped value → the seam closes (matching the
 *   complement's u=1→u=0 column merge).
 * - `qu = round(uMod1 · QSCALE) / QSCALE`, `qt = round(t · QSCALE) / QSCALE`.
 *
 * The returned (u,t) is what BOTH `paveBand` and the complement's force-register
 * consume, so the band's exact-string key and the complement's quantized key
 * agree. Idempotent: snapping a snapped point is a no-op (a `k/QSCALE` ratio
 * rounds back to itself, and 0 mod 1 = 0).
 *
 * @param u rail u (any real; periodic in 1).
 * @param t rail t (expected in [0,1]; not wrapped — t has open boundaries).
 * @returns the snapped `[qu, qt]` on the QSCALE grid.
 */
export function quantizeRailUT(u: number, t: number): [number, number] {
  // Periodic wrap of u into [0,1) BEFORE rounding, so the seam closes. A u that
  // is an exact multiple of 1 (e.g. u===1 → 0) maps cleanly; a tiny u<1 twin of
  // a u>0 wrap rounds to the same grid node within half a quantum.
  const uMod = ((u % 1) + 1) % 1;
  const qu = Math.round(uMod * QSCALE) / QSCALE;
  const qt = Math.round(t * QSCALE) / QSCALE;
  // A u that wraps to exactly QSCALE (i.e. uMod rounded up to 1.0 — possible when
  // uMod is within half a quantum BELOW 1) must fold to 0 so the seam twin shares
  // the complement's u=0 column, not a phantom u=1 node.
  const quFolded = Math.round(qu * QSCALE) === QSCALE ? 0 : qu;
  return [quFolded, qt];
}

/**
 * Replicate the complement's `vertexIndex()` packed dedup key EXACTLY.
 *
 * VERBATIM from `FeatureConformingTriangulator.ts` (the `vertexIndex` closure):
 *
 * ```ts
 * const qu = Math.round(u * QSCALE);
 * const qt2 = Math.round(t * QSCALE);
 * const key = qu * (QSCALE * 2 + 1) + qt2;
 * ```
 *
 * NOTE: the complement does NOT wrap u inside `vertexIndex` — it dedups on the
 * raw u and closes the seam in a SEPARATE later pass (u=1 column → u=0 column).
 * To match that behaviour bit-for-bit, this function ALSO does not wrap u; callers
 * pass {@link quantizeRailUT}-snapped values (already wrapped + folded), so the
 * seam twin is already at u=0 here.
 *
 * @param u snapped rail u (a `k/QSCALE` ratio).
 * @param t snapped rail t (a `k/QSCALE` ratio).
 * @returns the integer packed key — equal across two (u,t) iff the complement
 *          treats them as the same vertex.
 */
export function railVertexKey(u: number, t: number): number {
  const qu = Math.round(u * QSCALE);
  const qt2 = Math.round(t * QSCALE);
  return qu * (QSCALE * 2 + 1) + qt2;
}
