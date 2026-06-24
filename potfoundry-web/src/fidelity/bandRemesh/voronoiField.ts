/**
 * voronoiField.ts — f64 replication of the Voronoi web `f2−f1` field.
 *
 * Mirrors `voronoiWebField` in
 * `src/renderers/webgpu/parametric/conforming/FeatureLineGraph.ts` (lines 651-686)
 * and the helpers `fract` / `hash22` from the same file.
 *
 * ⚠️ Must stay in sync with FeatureLineGraph.ts voronoiWebField.
 * Phase 0 spike — production wiring (calling into FeatureLineGraph) happens in Phase 1.
 *
 * Packed shader param slots: 0=scale, 1=jitter, 2=thickness, 5=z_stretch, 6=pulse.
 */

const fract = (x: number): number => x - Math.floor(x);

/** WGSL hash22 replicated in f64 (mirrors FeatureLineGraph.ts). */
function hash22(px: number, py: number): [number, number] {
  let p3x = fract(px * 0.1031);
  let p3y = fract(py * 0.103);
  let p3z = fract(px * 0.0973);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d;
  p3y += d;
  p3z += d;
  return [fract((p3x + p3y) * p3z), fract((p3x + p3z) * p3y)];
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
      const wrappedX = ((nidX % scale) + scale) % scale;
      const h = hash22(wrappedX, nidY);
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
