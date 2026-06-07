/**
 * RingStrip.ts — Index-referencing triangulation of cap surfaces between
 * shared boundary rings.
 *
 * The walls (outer/inner) own their uniform `nRing` boundary-ring vertices. The
 * caps (rim, bottom-under, bottom-top, drain) do NOT create new ring vertices —
 * they create triangles that REFERENCE the walls' shared ring vertex indices.
 * This is what makes the assembly watertight *by construction*: a ring vertex
 * has exactly one index (and one owning (u,t,surfaceId) triple), so both
 * neighbouring surfaces' triangles point at the same vertex → no gap, no weld.
 *
 * Two primitives:
 *  - {@link annulusStrip}: an annular band between two equal-count index-rings
 *    (e.g. outer-top ↔ inner-top for the rim). 2·nRing triangles, every spoke
 *    edge shared by two triangles, the only boundary edges are the two rings.
 *  - {@link discFan}: a full disc fanned from one centre vertex to a ring (used
 *    when there is no drain, so the base discs collapse to the axis).
 *
 * `invert` flips the winding of every emitted triangle, so each cap can match
 * its outward-facing orientation (per SURFACE_CONFIG.invertWinding).
 *
 * @module conforming/RingStrip
 */

/**
 * Triangulate the annular strip between two index-rings of equal length.
 *
 * `ringA` and `ringB` are vertex indices ordered the SAME way (both by
 * increasing u). Segment i spans ringA[i]→ringA[i+1] (and ringB likewise, with
 * wrap). The quad (A_i, A_{i+1}, B_{i+1}, B_i) is split into two triangles.
 *
 * @param ringA First ring vertex indices (length nRing, ordered).
 * @param ringB Second ring vertex indices (length nRing, same order as ringA).
 * @param invert Reverse the winding of every triangle.
 * @returns Flat triangle index array (3 indices per triangle).
 */
export function annulusStrip(
  ringA: readonly number[],
  ringB: readonly number[],
  invert: boolean,
): number[] {
  const n = ringA.length;
  if (n !== ringB.length) {
    throw new Error(
      `annulusStrip: rings differ in length (${n} vs ${ringB.length})`,
    );
  }
  const out: number[] = [];
  const push = (a: number, b: number, c: number): void => {
    if (a === b || b === c || a === c) return; // skip degenerate
    if (invert) out.push(a, c, b);
    else out.push(a, b, c);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a0 = ringA[i];
    const a1 = ringA[j];
    const b0 = ringB[i];
    const b1 = ringB[j];
    // Quad (a0, a1, b1, b0) → two CCW triangles along the a0→b1 diagonal.
    push(a0, a1, b0);
    push(a1, b1, b0);
  }
  return out;
}

/**
 * Triangulate a disc as a fan from a single centre vertex to a closed ring.
 *
 * Each ring segment (ring[i]→ring[i+1], wrapping) forms a triangle with the
 * centre. nRing triangles total; every spoke edge (centre→ring[i]) is shared by
 * two triangles, so the only boundary is the ring itself.
 *
 * @param ring Ring vertex indices (length nRing, ordered by increasing u).
 * @param centreIdx The single centre (axis) vertex index.
 * @param invert Reverse the winding of every triangle.
 * @returns Flat triangle index array (3 indices per triangle).
 */
export function discFan(
  ring: readonly number[],
  centreIdx: number,
  invert: boolean,
): number[] {
  const n = ring.length;
  const out: number[] = [];
  const push = (a: number, b: number, c: number): void => {
    if (a === b || b === c || a === c) return;
    if (invert) out.push(a, c, b);
    else out.push(a, b, c);
  };
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    // CCW: ring[i] → ring[i+1] → centre.
    push(ring[i], ring[j], centreIdx);
  }
  return out;
}
