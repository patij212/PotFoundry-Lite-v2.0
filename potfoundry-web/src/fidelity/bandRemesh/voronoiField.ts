/**
 * voronoiField.ts — f64 replication of the Voronoi web `f2−f1` field.
 *
 * Mirrors `voronoiWebField` in
 * `src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts`
 * and its integer-PCG2D jitter hash (both synced to the shipping surface in 03948af8).
 *
 * ⚠️ Must stay in sync with FeatureLineGraph.ts voronoiWebField.
 * Phase 0 spike — production wiring (calling into FeatureLineGraph) happens in Phase 1.
 *
 * Packed shader param slots: 0=scale, 1=jitter, 2=thickness, 5=z_stretch, 6=pulse.
 */

const fract = (x: number): number => x - Math.floor(x);

// Voronoi jitter hash — INTEGER-EXACT PCG2D, synced to the SHIPPING surface
// (styles.ts rOuterVoronoi / styles.wgsl style_voronoi, swapped in 03948af8
// E-2026-07-10-INTHASH-SWAP; FeatureLineGraph.ts voronoiWebField re-synced too).
// The pre-swap float hash22 traced a now-STALE cell layout — the bandRemesh rails
// would land on creases the surface no longer raises. Mirrors styles.ts
// pcg2dHash/u32ToUnitFloat/hash22Int and WGSL hash_pcg2d/u32_to_unit_float/hash22_int.
function pcg2dHash(vx: number, vy: number): { x: number; y: number } {
  let x = vx >>> 0;
  let y = vy >>> 0;
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  x = (x + Math.imul(y, 1664525)) >>> 0;
  y = (y + Math.imul(x, 1664525)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  y = (y ^ (y >>> 16)) >>> 0;
  return { x: x >>> 0, y: y >>> 0 };
}
function u32ToUnitFloat(h: number): number {
  return (h >>> 8) * 2 ** -24;
}
/** hash22 analog: integer cell coords in, [0,1)^2 out. Mirrors styles.ts hash22Int. */
function hash22Int(cx: number, cy: number): [number, number] {
  const seeded = pcg2dHash((cx + 0x9e3779b1) >>> 0, (cy + 0x85ebca77) >>> 0);
  return [u32ToUnitFloat(seeded.x), u32ToUnitFloat(seeded.y)];
}

/**
 * Returns the raw worley `f2 − f1` distance for (uWall, t) under the given params.
 * This is the UNSIGNED field whose level sets bound the visible web band:
 *   f2 − f1 = 0  → cell-border centerline (ridge minimum, no zero crossing)
 *   f2 − f1 = th → outer wall edge (relief returns to base radius; the production
 *                  crease locus at frac=1)
 *
 * To get a sign-changing field suitable for marching-squares contouring at a
 * chosen fraction `frac`, subtract `th * frac`:
 *   sdf = voronoiSdf(u, t, p) - th * frac
 */
export function voronoiSdf(uWall: number, t: number, p: Float32Array): number {
  const scale = p[0] > 0 ? p[0] : 8;
  // Integer period for the u-wrap, mirroring styles.ts periodicCellularInt.
  const periodXInt = Math.max(1, Math.round(scale));
  const jitter = p[1];
  const stretch = p[5] > 0 ? p[5] : 1;
  const pulse = p[6];
  const uAnim = uWall * scale + pulse * scale;
  const v = t * scale * stretch;
  const cellIdX = Math.floor(uAnim);
  const cellIdY = Math.floor(v);
  const cuX = fract(uAnim);
  const cuY = fract(v);
  let f1 = 999;
  let f2 = 999;
  for (let ny = -1; ny <= 1; ny++) {
    for (let nx = -1; nx <= 1; nx++) {
      const nidX = cellIdX + nx;
      const nidY = cellIdY + ny;
      const wrappedX = ((nidX % periodXInt) + periodXInt) % periodXInt;
      const h = hash22Int(wrappedX, nidY);
      const dx = nx + h[0] * jitter - cuX;
      const dy = ny + h[1] * jitter - cuY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < f1) {
        f2 = f1;
        f1 = dist;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  return f2 - f1;
}
