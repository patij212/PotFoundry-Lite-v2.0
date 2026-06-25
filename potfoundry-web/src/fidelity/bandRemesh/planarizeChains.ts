/**
 * planarizeChains.ts — turn a set of feature chains that CROSS each other (a
 * non-planar PSLG) into a PLANAR one, so a downstream constrained-Delaunay
 * (`cdt2d`) does not hit its unguarded `mergeHulls` crash ('upperIds').
 *
 * MEASURED motivation (2026-06-25): the Phase-2 whole-wall corridor feeds `cdt2d`
 * ~3093 constraint edges with **483 proper off-endpoint crossings** → cdt2d throws
 * `Cannot read properties of undefined (reading 'upperIds')`. Point dedup/snap/jitter
 * do NOT help (the point set alone triangulates fine); the crash is the crossing
 * CONSTRAINTS. Splitting every crossing into a shared vertex (this module) makes
 * cdt2d succeed (483 crossings → reliable pass, idempotent).
 *
 * WELD-SAFETY: this operates on FEATURE CHAINS ONLY. It never sees — and therefore
 * never splits — a hole-boundary edge, so it can never mint a boundary-interior
 * vertex (the T-junction failure mode the watertight weld forbids). Chain ENDPOINTS
 * (anchors / shared junctions) are preserved exactly; only interior crossings are
 * interned as NEW shared vertices.
 *
 * Pure: inputs are not mutated; intersection points are appended to a fresh copy.
 * Deterministic (RNG-free, fixed iteration order, QSCALE-quantized interning) and
 * idempotent (planarizing the output adds nothing).
 *
 * @module fidelity/bandRemesh/planarizeChains
 */

/** Same quantum as the weld keyer (`railKey` QSCALE) so split points dedup consistently. */
const DEFAULT_QSCALE = 1 << 24;

export interface PlanarizeChainsResult {
  /** Point table: the input points (copied) followed by any interned crossing vertices. */
  points: Array<[number, number]>;
  /** Chains with crossing vertices spliced in (in along-segment order); endpoints preserved. */
  chains: number[][];
  /** Number of crossing intersections resolved (0 ⇒ input was already planar). */
  splitsAdded: number;
  /** Off-endpoint crossings remaining after planarization (diagnostic; 0 on clean input). */
  residualCrossings: number;
}

/** Proper (strict-interior) intersection of segments p1→p2 and p3→p4, or null. */
function properIntersect(
  p1: readonly [number, number],
  p2: readonly [number, number],
  p3: readonly [number, number],
  p4: readonly [number, number],
): { px: number; py: number; tS: number; tU: number } | null {
  const rx = p2[0] - p1[0];
  const ry = p2[1] - p1[1];
  const sx = p4[0] - p3[0];
  const sy = p4[1] - p3[1];
  const denom = rx * sy - ry * sx;
  if (denom === 0) return null; // parallel or collinear — not a proper crossing
  const qpx = p3[0] - p1[0];
  const qpy = p3[1] - p1[1];
  const tS = (qpx * sy - qpy * sx) / denom;
  const tU = (qpx * ry - qpy * rx) / denom;
  const EPS = 1e-12;
  if (tS > EPS && tS < 1 - EPS && tU > EPS && tU < 1 - EPS) {
    return { px: p1[0] + tS * rx, py: p1[1] + tS * ry, tS, tU };
  }
  return null;
}

/** Count proper off-endpoint crossings between all chain segments (diagnostic). */
function countResidualCrossings(points: Array<[number, number]>, chains: number[][]): number {
  const segs: Array<[number, number]> = [];
  for (const ch of chains) for (let i = 0; i + 1 < ch.length; i++) segs.push([ch[i], ch[i + 1]]);
  let n = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const [a, b] = segs[i];
      const [c, d] = segs[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (properIntersect(points[a], points[b], points[c], points[d])) n++;
    }
  }
  return n;
}

/**
 * Planarize a set of feature chains: resolve every proper crossing between chain
 * segments into a single shared vertex spliced into each chain that passes through it.
 *
 * @param inputPoints (u,t) per vertex id (read-only; copied).
 * @param inputChains feature chains as vertex-id polylines (read-only).
 * @param qscale quantum for interning crossing points (default {@link DEFAULT_QSCALE}).
 */
export function planarizeChains(
  inputPoints: ReadonlyArray<readonly [number, number]>,
  inputChains: ReadonlyArray<ReadonlyArray<number>>,
  qscale: number = DEFAULT_QSCALE,
): PlanarizeChainsResult {
  const points: Array<[number, number]> = inputPoints.map((p) => [p[0], p[1]]);

  // Intern map: quantized key → id, seeded with existing points so a crossing that
  // lands on (or near) an existing vertex reuses it rather than minting a duplicate.
  const keyToId = new Map<string, number>();
  const qkey = (x: number, y: number): string => `${Math.round(x * qscale)},${Math.round(y * qscale)}`;
  for (let i = 0; i < points.length; i++) {
    const k = qkey(points[i][0], points[i][1]);
    if (!keyToId.has(k)) keyToId.set(k, i);
  }
  const internPoint = (x: number, y: number): number => {
    const k = qkey(x, y);
    let id = keyToId.get(k);
    if (id === undefined) {
      id = points.length;
      points.push([x, y]);
      keyToId.set(k, id);
    }
    return id;
  };

  // Flatten chains into segments tagged with their (chain, segment) position.
  interface Seg { ci: number; si: number; a: number; b: number; }
  const segs: Seg[] = [];
  for (let ci = 0; ci < inputChains.length; ci++) {
    const ch = inputChains[ci];
    for (let si = 0; si + 1 < ch.length; si++) segs.push({ ci, si, a: ch[si], b: ch[si + 1] });
  }

  // Per-segment split points (id + param along the segment) keyed by "chain:segment".
  const splitsPer = new Map<string, Array<{ id: number; t: number }>>();
  const addSplit = (ci: number, si: number, id: number, t: number): void => {
    const k = `${ci}:${si}`;
    const arr = splitsPer.get(k);
    if (arr) arr.push({ id, t });
    else splitsPer.set(k, [{ id, t }]);
  };

  let splitsAdded = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const s = segs[i];
      const u = segs[j];
      if (s.a === u.a || s.a === u.b || s.b === u.a || s.b === u.b) continue; // shared vertex
      const x = properIntersect(points[s.a], points[s.b], points[u.a], points[u.b]);
      if (!x) continue;
      const id = internPoint(x.px, x.py);
      // If the crossing interns to an endpoint of either segment, they already meet there.
      if (id === s.a || id === s.b || id === u.a || id === u.b) continue;
      addSplit(s.ci, s.si, id, x.tS);
      addSplit(u.ci, u.si, id, x.tU);
      splitsAdded++;
    }
  }

  // Rebuild each chain: splice each segment's splits (sorted along the segment) between
  // its endpoints, deduping consecutive repeats (a triple-point lands the same id twice).
  const chains: number[][] = [];
  for (let ci = 0; ci < inputChains.length; ci++) {
    const ch = inputChains[ci];
    const out: number[] = [];
    for (let si = 0; si + 1 < ch.length; si++) {
      out.push(ch[si]);
      const arr = splitsPer.get(`${ci}:${si}`);
      if (arr) {
        arr.sort((p, q) => p.t - q.t);
        let prev = ch[si];
        for (const sp of arr) {
          if (sp.id !== prev) {
            out.push(sp.id);
            prev = sp.id;
          }
        }
      }
    }
    out.push(ch[ch.length - 1]);
    chains.push(out);
  }

  return { points, chains, splitsAdded, residualCrossings: countResidualCrossings(points, chains) };
}
