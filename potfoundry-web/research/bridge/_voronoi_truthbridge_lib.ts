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
// periodicCellular / rOuterVoronoi), parameterized by a rounding operator so the SAME algorithm
// can be evaluated at f64 (identity round — a local re-derivation, NOT an import of the private
// production `periodicCellular`, so this stays a pure research/ module) or f32-emulated
// (Math.fround after every op) precision, enabling a direct argmin-divergence comparison.

type Round = (x: number) => number;
const F64: Round = (x) => x;
const F32: Round = Math.fround;

function hash22(px: number, py: number, r: Round): { x: number; y: number } {
  const fract = (x: number): number => r(x - Math.floor(x));
  let p3x = fract(r(px * r(0.1031)));
  let p3y = fract(r(py * r(0.103)));
  let p3z = fract(r(px * r(0.0973)));
  // dot(p3, p3.yzx + 33.33) = p3.x*(p3.y+33.33) + p3.y*(p3.z+33.33) + p3.z*(p3.x+33.33)
  const dot = r(
    r(p3x * r(p3y + r(33.33))) + r(r(p3y * r(p3z + r(33.33))) + r(p3z * r(p3x + r(33.33)))),
  );
  p3x = r(p3x + dot);
  p3y = r(p3y + dot);
  p3z = r(p3z + dot);
  return {
    x: fract(r((p3x + p3y) * p3z)),
    y: fract(r((p3x + p3z) * p3y)),
  };
}

export interface CellResult { f1: number; f2: number }

function periodicCellular(ux: number, uy: number, periodX: number, jitter: number, r: Round): CellResult {
  const cellIdX = Math.floor(ux);
  const cellIdY = Math.floor(uy);
  const cellUvX = r(ux - cellIdX);
  const cellUvY = r(uy - cellIdY);

  let f1 = 999;
  let f2 = 999;
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const neighborIdX = cellIdX + x;
      const neighborIdY = cellIdY + y;
      const wrappedX = r(r(r(neighborIdX % periodX) + periodX) % periodX);
      const pointHash = hash22(wrappedX, neighborIdY, r);
      const centerX = r(x + r(pointHash.x * jitter));
      const centerY = r(y + r(pointHash.y * jitter));
      const diffX = r(centerX - cellUvX);
      const diffY = r(centerY - cellUvY);
      const dist = r(Math.sqrt(r(r(diffX * diffX) + r(diffY * diffY))));
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

function smoothstep(e0: number, e1: number, x: number, r: Round): number {
  const s = Math.max(0, Math.min(1, r(r(x - e0) / r(e1 - e0))));
  return r(r(s * s) * r(3 - r(2 * s)));
}

export interface VoronoiParams {
  scale: number; jitter: number; thickness: number; relief: number;
  morph: number; zStretch: number; pulse: number; edgeFade: number;
}

function rOuterVoronoiAt(theta: number, z: number, r0: number, H: number, p: VoronoiParams, r: Round):
  { radius: number; cell: CellResult; uAnim: number; v: number } {
  const t = Math.max(0, Math.min(1, r(z / r(Math.max(H, 1e-4)))));
  const scaleVal = p.scale > 0 ? r(p.scale) : 8;
  const stretchVal = p.zStretch > 0 ? r(p.zStretch) : 1;

  const u = r(r(theta / r(Math.PI * 2)) * scaleVal);
  const uAnim = r(u + r(p.pulse * scaleVal));
  const v = r(r(t * scaleVal) * stretchVal);

  const cell = periodicCellular(uAnim, v, scaleVal, r(p.jitter), r);
  const cellSdf = r(cell.f2 - cell.f1);

  const web = r(1 - smoothstep(0, p.thickness, cellSdf, r));
  const bubble = smoothstep(1, 0, cell.f1, r);
  const pattern = r(r(bubble * r(1 - p.morph)) + r(web * p.morph));

  let fadeFactor = 1;
  const fadeLimit = Math.min(p.edgeFade, 0.49);
  if (fadeLimit > 0) {
    const bFade = smoothstep(0, fadeLimit, t, r);
    const tFade = r(1 - smoothstep(r(1 - fadeLimit), 1, t, r));
    fadeFactor = r(bFade * tFade);
  }
  return { radius: r(r0 + r(r(p.relief * pattern) * fadeFactor)), cell, uAnim, v };
}

/** f32-emulated rOuterVoronoi — same algorithm as src/geometry/styles.ts:1505, f32-rounded. */
export function rOuterVoronoiF32(theta: number, z: number, r0: number, H: number, p: VoronoiParams): number {
  return rOuterVoronoiAt(theta, z, r0, H, p, F32).radius;
}

/** Local f64 re-derivation (NOT importing the private production periodicCellular) — for the
 *  direct argmin-divergence comparison against the f32-emulated chain at matched inputs. */
export function rOuterVoronoiF64Ref(theta: number, z: number, r0: number, H: number, p: VoronoiParams): number {
  return rOuterVoronoiAt(theta, z, r0, H, p, F64).radius;
}

/** Cell-argmin comparison at one (theta,z): returns both precisions' F1/F2 so the caller can
 *  classify "same winning cell" (F1/F2 both close) vs "different winning cell" (a jump). */
export function cellArgminBothPrecisions(
  theta: number, z: number, H: number, p: VoronoiParams,
): { f64: CellResult; f32: CellResult } {
  const a = rOuterVoronoiAt(theta, z, 0, H, p, F64);
  const b = rOuterVoronoiAt(theta, z, 0, H, p, F32);
  return { f64: a.cell, f32: b.cell };
}
