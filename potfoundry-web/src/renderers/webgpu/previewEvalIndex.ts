/**
 * Builds the per-vertex index inputs for the preview eval-compute prototype,
 * replicating the vs_main cell walk in preview_main.wgsl so that
 * getEvalPositionWGSL / getNeighborNormalWGSL can stay free of that walk.
 *
 * For each preview pot vertex (the vid >= 9 range in vs_main, re-based to 0) this
 * emits:
 *   - seg : the surface segment id (0 outer, 1 inner, 2 bottom-top, 3 bottom-under,
 *           4 rim, 5 drain)
 *   - uv  : the (u, v) the vertex shader evaluates surface_point at
 *   - nbr : {iL, iR, iD, iU, flags, pad0} — the four grid-neighbour vertex indices
 *           reproducing surface_normal's central-difference stencil (du = 1/cellsX,
 *           dv = 1/segY), plus a flags field encoding surface_normal's special cases.
 *
 * Neighbour rules (matched to surface_normal):
 *   - u wraps periodically (sample_u wraps theta): right/left = (gx ± 1) mod cellsX.
 *   - v clamps one-sided at the top/bottom rows (clamp(v ± dv)): the missing side
 *     points at the vertex itself, giving a one-sided full-step difference.
 *   - caps (seg 2/4 → +Z, seg 3 → -Z) and the inner-wall flip (seg 1) are flags;
 *     their neighbour indices are unused by the shader.
 */
export interface PreviewEvalCounts {
  cellsX: number;
  cellsOuterY: number;
  innerY: number;
  bottomRings: number;
  rimRings: number;
}

export interface PreviewEvalIndexBuffers {
  vertexCount: number;
  seg: Uint32Array;   // 1 u32 / vertex
  uv: Float32Array;   // 2 f32 / vertex
  nbr: Uint32Array;   // 6 u32 / vertex: [iL, iR, iD, iU, flags, pad0]
}

export const FLAG_CAP_UP = 1;
export const FLAG_CAP_DOWN = 2;
export const FLAG_INNER = 4;

// Per-segment flag matching surface_normal()'s early-returns:
//   0 outer (finite diff), 1 inner (finite diff + flip), 2 bottom-top (+Z),
//   3 bottom-under (-Z), 4 rim (+Z), 5 drain (finite diff).
const SEG_FLAG = [0, FLAG_INNER, FLAG_CAP_UP, FLAG_CAP_DOWN, FLAG_CAP_UP, 0];

// corner -> grid-node offset (dgx, dgy) within a cell, matching vs_main's corner map:
//   0:(u0,v0) 1:(u0,v1) 2:(u1,v0) 3:(u1,v0) 4:(u0,v1) 5:(u1,v1)
// (two triangles per quad; corners 2==3 and 1==4 are duplicated shared vertices).
const CORNER_DGX = [0, 0, 1, 1, 0, 1];
const CORNER_DGY = [0, 1, 0, 0, 1, 1];

export function buildPreviewEvalIndexBuffers(counts: PreviewEvalCounts): PreviewEvalIndexBuffers {
  const cellsX = Math.max(1, Math.floor(counts.cellsX));
  const segY = [
    Math.max(1, Math.floor(counts.cellsOuterY)),
    Math.max(1, Math.floor(counts.innerY)),
    Math.max(1, Math.floor(counts.bottomRings)),
    Math.max(1, Math.floor(counts.bottomRings)),
    Math.max(1, Math.floor(counts.rimRings)),
    Math.max(1, Math.floor(counts.bottomRings)),
  ];

  let vertexCount = 0;
  for (const y of segY) vertexCount += cellsX * y * 6;

  const seg = new Uint32Array(vertexCount);
  const uv = new Float32Array(vertexCount * 2);
  const nbr = new Uint32Array(vertexCount * 6);
  const gxOf = new Int32Array(vertexCount);
  const gyOf = new Int32Array(vertexCount);

  // One representative vertex per (canonical gx, gy) grid node, PER SEGMENT
  // (separate maps avoid cross-segment key collisions). Position is a pure
  // function of (seg, u, v), so any vertex at a node yields the same position.
  const reps: Array<Map<number, number>> = Array.from({ length: 6 }, () => new Map());
  const nodeKey = (cgx: number, gy: number) => cgx * 1_000_003 + gy;

  // Pass 1: seg/uv + representative map.
  let vid = 0;
  for (let s = 0; s < 6; s++) {
    const y = segY[s];
    const cellCount = cellsX * y;
    for (let cell = 0; cell < cellCount; cell++) {
      const cx = cell % cellsX;
      const cy = Math.floor(cell / cellsX);
      for (let corner = 0; corner < 6; corner++) {
        const gx = cx + CORNER_DGX[corner];
        const gy = cy + CORNER_DGY[corner];
        seg[vid] = s;
        uv[vid * 2] = gx / cellsX;
        uv[vid * 2 + 1] = gy / y;
        gxOf[vid] = gx;
        gyOf[vid] = gy;
        const k = nodeKey(gx % cellsX, gy);
        if (!reps[s].has(k)) reps[s].set(k, vid);
        vid++;
      }
    }
  }

  // Pass 2: neighbour indices + flags.
  vid = 0;
  for (let s = 0; s < 6; s++) {
    const y = segY[s];
    const flag = SEG_FLAG[s];
    const rep = reps[s];
    const segVerts = cellsX * y * 6;
    for (let j = 0; j < segVerts; j++) {
      const gx = gxOf[vid];
      const gy = gyOf[vid];
      const cgx = gx % cellsX;
      const iR = rep.get(nodeKey((cgx + 1) % cellsX, gy)) ?? vid;
      const iL = rep.get(nodeKey((cgx - 1 + cellsX) % cellsX, gy)) ?? vid;
      const iU = gy + 1 <= y ? (rep.get(nodeKey(cgx, gy + 1)) ?? vid) : vid;
      const iD = gy - 1 >= 0 ? (rep.get(nodeKey(cgx, gy - 1)) ?? vid) : vid;
      const o = vid * 6;
      nbr[o] = iL;
      nbr[o + 1] = iR;
      nbr[o + 2] = iD;
      nbr[o + 3] = iU;
      nbr[o + 4] = flag;
      nbr[o + 5] = 0;
      vid++;
    }
  }

  return { vertexCount, seg, uv, nbr };
}
