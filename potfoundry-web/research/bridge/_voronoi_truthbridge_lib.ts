// E-2026-07-09-VORONOI-TRUTHBRIDGE — pure NEW module, unwired (src/ never imports research/, and
// nothing in research/ imports this except its own probe). Does NOT modify src/geometry/styles.ts
// or src/assets/shaders/styles.wgsl.
//
// HYPOTHESIS (from E-2026-07-09-PROD-ARTIFACT-TRUTH): the CPU f64 truth (rOuterVoronoi,
// src/geometry/styles.ts:1505) and the GPU f32 WGSL (style_voronoi, styles.wgsl:919) run the
// IDENTICAL algorithm, but periodicCellular's `if (dist < f1) { f2=f1; f1=dist }` argmin over 9
// neighbor cells is a DISCONTINUOUS function of its inputs at Voronoi cell boundaries (by
// construction — that is what a Voronoi diagram IS). f64 accumulates the hash+distance chain to
// far more bits than f32, so near a boundary the two precisions can select a DIFFERENT winning
// cell, producing an O(cell-size) radius jump — not a small rounding error. An f32-EMULATED CPU
// evaluation (every op rounded to f32 via Math.fround, replicating IEEE-754 f32 arithmetic
// per-operation) should reproduce the GPU's argmin decisions and collapse the divergence.
//
// This is the byte-for-byte port of src/geometry/styles.ts's Voronoi chain (hash22 /
// periodicCellular / rOuterVoronoi), with every intermediate rounded to f32.

const f = Math.fround;

function hash22F32(px: number, py: number): { x: number; y: number } {
  const fract = (x: number): number => f(x - Math.floor(x));
  let p3x = fract(f(px * f(0.1031)));
  let p3y = fract(f(py * f(0.103)));
  let p3z = fract(f(px * f(0.0973)));
  // dot(p3, p3.yzx + 33.33) = p3.x*(p3.y+33.33) + p3.y*(p3.z+33.33) + p3.z*(p3.x+33.33)
  const dot = f(
    f(p3x * f(p3y + f(33.33))) + f(f(p3y * f(p3z + f(33.33))) + f(p3z * f(p3x + f(33.33)))),
  );
  p3x = f(p3x + dot);
  p3y = f(p3y + dot);
  p3z = f(p3z + dot);
  return {
    x: fract(f((p3x + p3y) * p3z)),
    y: fract(f((p3x + p3z) * p3y)),
  };
}

function periodicCellularF32(
  ux: number, uy: number, periodX: number, jitter: number,
): { f1: number; f2: number } {
  const cellIdX = Math.floor(ux);
  const cellIdY = Math.floor(uy);
  const cellUvX = f(ux - cellIdX);
  const cellUvY = f(uy - cellIdY);

  let f1 = 999;
  let f2 = 999;
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const neighborIdX = cellIdX + x;
      const neighborIdY = cellIdY + y;
      // WGSL: (neighbor_id.x % period.x + period.x) % period.x — JS '%' matches WGSL '%' sign
      // behavior for the f32 remainder op (both truncated, not floored) at these magnitudes.
      const wrappedX = f(f(f(neighborIdX % periodX) + periodX) % periodX);
      const pointHash = hash22F32(wrappedX, neighborIdY);
      const centerX = f(x + f(pointHash.x * jitter));
      const centerY = f(y + f(pointHash.y * jitter));
      const diffX = f(centerX - cellUvX);
      const diffY = f(centerY - cellUvY);
      const dist = f(Math.sqrt(f(f(diffX * diffX) + f(diffY * diffY))));
      if (dist < f1) {
        f2 = f1;
        f1 = dist;
      } else if (dist < f2) {
        f2 = dist;
      }
    }
  }
  return { f1, f2 };
}

function smoothstepF32(e0: number, e1: number, x: number): number {
  const s = Math.max(0, Math.min(1, f(f(x - e0) / f(e1 - e0))));
  return f(f(s * s) * f(3 - f(2 * s)));
}

export interface VoronoiParamsF32 {
  scale: number; jitter: number; thickness: number; relief: number;
  morph: number; zStretch: number; pulse: number; edgeFade: number;
}

/** f32-emulated rOuterVoronoi — same algorithm as src/geometry/styles.ts:1505, f32-rounded. */
export function rOuterVoronoiF32(
  theta: number, z: number, r0: number, H: number, p: VoronoiParamsF32,
): number {
  const t = Math.max(0, Math.min(1, f(z / f(Math.max(H, 1e-4)))));
  const scaleVal = p.scale > 0 ? f(p.scale) : 8;
  const stretchVal = p.zStretch > 0 ? f(p.zStretch) : 1;

  const u = f(f(theta / f(Math.PI * 2)) * scaleVal);
  const uAnim = f(u + f(p.pulse * scaleVal));
  const v = f(f(t * scaleVal) * stretchVal);

  const { f1, f2 } = periodicCellularF32(uAnim, v, scaleVal, f(p.jitter));
  const cellSdf = f(f2 - f1);

  const web = f(1 - smoothstepF32(0, p.thickness, cellSdf));
  const bubble = smoothstepF32(1, 0, f1);
  const pattern = f(f(bubble * f(1 - p.morph)) + f(web * p.morph));

  let fadeFactor = 1;
  const fadeLimit = Math.min(p.edgeFade, 0.49);
  if (fadeLimit > 0) {
    const bFade = smoothstepF32(0, fadeLimit, t);
    const tFade = f(1 - smoothstepF32(f(1 - fadeLimit), 1, t));
    fadeFactor = f(bFade * tFade);
  }
  return f(r0 + f(f(p.relief * pattern) * fadeFactor));
}
