/**
 * seamPlanarize.ts — the Tier-C refine loop's pre-triangulation planarity guard.
 *
 * The interior refinement (noBridgeRefine) subdivides constraint edges by inserting
 * seam-CONSISTENT (unwrapped) midpoints — u can leave [0,1) (measured: down to -0.375, and
 * exactly 1.0). addPt stores that raw u, so a seam-adjacent edge's subdivided half can join an
 * unwrapped midpoint to its original WRAPPED opposite-seam endpoint. In the periodic (cylinder)
 * topology that half-edge is tiny; in the FLAT mm space cdt2d triangulates it SPANS the whole
 * chart (u≈1 ↔ u≈0), crossing thousands of other constraint edges. cdt2d rejects any crossing
 * PSLG with the `mergeHulls` "Cannot read properties of undefined (reading 'upperIds')" throw
 * (see morseComplex.planarizeMM + project memory cdt_planarization).
 *
 * This guard restores a planar, non-spanning PSLG BEFORE each triangulation:
 *   1. canonicalize every vertex u into [0,1) (fixes the raw out-of-range storage),
 *   2. seam-split any constraint edge that straddles the seam (|Δu|>½) into two in-seam edges
 *      using twins at u=0 and u=1 (u=1 ⇒ x=uToMm, the far seam — the point that keeps a near-u=1
 *      edge from spanning), and
 *   3. split any residual proper crossing into a shared T-junction vertex (planarizeMM's proven
 *      iterate-to-zero-crossings mechanism), so cdt2d always sees a planar constraint set.
 *
 * APPEND-ONLY by construction: existing vertices never move index (their u VALUE may be
 * canonicalized, but no vertex is deleted or reordered), so noBridgeRefine's "uv only ever GROWS"
 * invariant — and the stable-index dirty-facet cache — hold. New split/twin points weld onto an
 * existing point within WELD_MM when one exists (near-triple-point robustness), else append.
 *
 * @module conforming/tierC/seamPlanarize
 */

/** Orientation epsilon (mm²) — matches morseComplex.planarizeMM. */
const EPS_CROSS = 1e-9;
/** Weld coincident NEW points below this (mm) — near-triple-point collapse. */
const WELD_MM = 3e-4;
/** Reuse an existing endpoint as the fan vertex when a crossing lands this close (param). */
const ENDPOINT_BAND = 0.02;
/** Straddle threshold: a constraint edge whose endpoints' u differ by more than this wraps the
 *  seam the short way and is drawn spanning in flat mm. Constraint (crest) edges are short, so a
 *  genuine >½-chart edge never occurs — a flag here is always a seam-wrap artifact. */
const STRADDLE_DU = 0.5;
/** Edge-broadphase spatial-hash cell (mm) — matches morseComplex.planarizeMM. */
const CELL_MM = 0.5;

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** Proper crossing param s on (a,b) of segment (a,b)×(c,d), or null. */
function properCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number | null {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  if (
    ((d1 > EPS_CROSS && d2 < -EPS_CROSS) || (d1 < -EPS_CROSS && d2 > EPS_CROSS)) &&
    ((d3 > EPS_CROSS && d4 < -EPS_CROSS) || (d3 < -EPS_CROSS && d4 > EPS_CROSS))
  ) {
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-15) return null;
    return ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
  }
  return null;
}

/**
 * Restore a planar, non-spanning constraint set in place. Mutates `uv` (append-only — existing
 * indices are stable; values may be u-canonicalized) and rewrites `cEdges`. Returns whether
 * anything changed (so the caller can skip a redundant re-triangulation / cache invalidation).
 */
export function planarizeChartMM(
  uv: number[],
  cEdges: Array<[number, number]>,
  uToMm: number,
  tToMm: number,
  maxPass = 12,
): boolean {
  let changed = false;
  const X = (i: number): number => uv[2 * i] * uToMm;
  const Y = (i: number): number => uv[2 * i + 1] * tToMm;

  // (1) Canonicalize STRICTLY out-of-range u into [0,1) in place (append-only: value change,
  // index stable). u=1 exactly is KEPT — it is the far-seam boundary coordinate (x=uToMm) and
  // collapsing it to u=0 would move a boundary/hull vertex across the whole chart. Only u<0 or
  // u>1 (the unwrapped-midpoint artifacts, measured down to -0.375 / above 1) are wrapped.
  const nV0 = uv.length / 2;
  for (let i = 0; i < nV0; i++) {
    const u = uv[2 * i];
    if (u < 0 || u > 1) {
      uv[2 * i] = ((u % 1) + 1) % 1;
      changed = true;
    }
  }

  // Weld grid over all current points (mm). A new point reuses an existing point within WELD_MM
  // (existing indices never move) else appends. `addVertMm` takes mm and stores chart coords.
  const wmap = new Map<string, number>();
  const wkey = (xmm: number, ymm: number): string =>
    `${Math.round(xmm / WELD_MM)}_${Math.round(ymm / WELD_MM)}`;
  for (let i = 0; i < uv.length / 2; i++) {
    const k = wkey(X(i), Y(i));
    if (!wmap.has(k)) wmap.set(k, i);
  }
  const addVertMm = (xmm: number, ymm: number): number => {
    const k = wkey(xmm, ymm);
    const h = wmap.get(k);
    if (h !== undefined) return h;
    const id = uv.length / 2;
    uv.push(xmm / uToMm, ymm / tToMm);
    wmap.set(k, id);
    return id;
  };

  // (2) Seam-split straddling constraint edges. The edge wraps the short way through the seam;
  // the low-u endpoint exits at u=0 and the high-u endpoint enters at u=1 (its x=uToMm twin).
  const afterSeam: Array<[number, number]> = [];
  for (const [a, b] of cEdges) {
    const ua = uv[2 * a];
    const ub = uv[2 * b];
    if (Math.abs(ua - ub) <= STRADDLE_DU) {
      afterSeam.push([a, b]);
      continue;
    }
    const lo = ua < ub ? a : b;
    const hi = ua < ub ? b : a;
    const uLo = uv[2 * lo]; // near 0
    const uHi = uv[2 * hi]; // near 1
    const tLo = uv[2 * lo + 1];
    const tHi = uv[2 * hi + 1];
    // Wrapped param distance lo→seam is uLo; seam→hi is (1-uHi).
    const denom = uLo + (1 - uHi) || 1e-12;
    const f = uLo / denom;
    const tSeam = tLo + f * (tHi - tLo);
    const v0 = addVertMm(0, tSeam * tToMm); // u=0 twin (x=0)
    const v1 = addVertMm(uToMm, tSeam * tToMm); // u=1 twin (x=uToMm)
    if (lo !== v0) afterSeam.push([lo, v0]);
    if (v1 !== hi) afterSeam.push([v1, hi]);
    changed = true;
  }
  cEdges.length = 0;
  for (const e of afterSeam) cEdges.push(e);

  // (3) Iterate: split every residual proper crossing into a shared T-junction until none remain.
  for (let pass = 0; pass < maxPass; pass++) {
    const grid = new Map<number, number[]>();
    const put = (gx: number, gy: number, ei: number): void => {
      const k = gx * 100003 + gy;
      const arr = grid.get(k);
      if (arr) arr.push(ei);
      else grid.set(k, [ei]);
    };
    for (let ei = 0; ei < cEdges.length; ei++) {
      const [a, b] = cEdges[ei];
      const x0 = Math.min(X(a), X(b));
      const y0 = Math.min(Y(a), Y(b));
      const x1 = Math.max(X(a), X(b));
      const y1 = Math.max(Y(a), Y(b));
      for (let gx = Math.floor(x0 / CELL_MM); gx <= Math.floor(x1 / CELL_MM); gx++) {
        for (let gy = Math.floor(y0 / CELL_MM); gy <= Math.floor(y1 / CELL_MM); gy++) {
          put(gx, gy, ei);
        }
      }
    }

    const splitsOnEdge: Array<Array<{ s: number; v: number }>> = cEdges.map(() => []);
    let crossFound = 0;
    const tested = new Set<number>();
    for (let ei = 0; ei < cEdges.length; ei++) {
      const [a, b] = cEdges[ei];
      const ax = X(a);
      const ay = Y(a);
      const bx = X(b);
      const by = Y(b);
      const cand = new Set<number>();
      for (let gx = Math.floor(Math.min(ax, bx) / CELL_MM); gx <= Math.floor(Math.max(ax, bx) / CELL_MM); gx++) {
        for (let gy = Math.floor(Math.min(ay, by) / CELL_MM); gy <= Math.floor(Math.max(ay, by) / CELL_MM); gy++) {
          const arr = grid.get(gx * 100003 + gy);
          if (arr) for (const ej of arr) if (ej > ei) cand.add(ej);
        }
      }
      for (const ej of cand) {
        const pk = ei * 1e7 + ej;
        if (tested.has(pk)) continue;
        tested.add(pk);
        const [c, d] = cEdges[ej];
        if (a === c || a === d || b === c || b === d) continue; // shared endpoint
        const cx = X(c);
        const cy = Y(c);
        const dx = X(d);
        const dy = Y(d);
        const s = properCross(ax, ay, bx, by, cx, cy, dx, dy);
        if (s === null) continue;
        crossFound++;
        const ix = ax + s * (bx - ax);
        const iy = ay + s * (by - ay);
        const den2 = (dx - cx) ** 2 + (dy - cy) ** 2 || 1e-12;
        const sj = ((ix - cx) * (dx - cx) + (iy - cy) * (dy - cy)) / den2;
        // Near-endpoint snap: the chains meet AT an existing vertex — reuse it as the fan vertex.
        let v: number;
        if (s < ENDPOINT_BAND) v = a;
        else if (s > 1 - ENDPOINT_BAND) v = b;
        else if (sj < ENDPOINT_BAND) v = c;
        else if (sj > 1 - ENDPOINT_BAND) v = d;
        else v = addVertMm(ix, iy);
        if (v !== a && v !== b) splitsOnEdge[ei].push({ s, v });
        if (v !== c && v !== d) splitsOnEdge[ej].push({ s: sj, v });
      }
    }

    if (crossFound === 0) break;
    changed = true;

    const next: Array<[number, number]> = [];
    for (let ei = 0; ei < cEdges.length; ei++) {
      const [a, b] = cEdges[ei];
      const sp = splitsOnEdge[ei];
      if (!sp.length) {
        if (a !== b) next.push([a, b]);
        continue;
      }
      sp.sort((p, q) => p.s - q.s);
      let prev = a;
      for (const s of sp) {
        if (s.v !== prev) {
          next.push([prev, s.v]);
          prev = s.v;
        }
      }
      if (prev !== b) next.push([prev, b]);
    }
    // Dedupe exact-duplicate + zero-length edges (a split can spawn a coincident pair).
    const eset = new Set<number>();
    const ded: Array<[number, number]> = [];
    for (const [a, b] of next) {
      if (a === b) continue;
      const k = a < b ? a * 1e7 + b : b * 1e7 + a;
      if (!eset.has(k)) {
        eset.add(k);
        ded.push([a, b]);
      }
    }
    cEdges.length = 0;
    for (const e of ded) cEdges.push(e);
  }

  return changed;
}
