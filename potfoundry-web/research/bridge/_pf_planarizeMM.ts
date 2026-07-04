// _pf_planarizeMM.ts — DEV-ONLY. Robust mm-space PSLG planarization for the perfect-mesher kernel.
//
// WHY: `planarizeConstraintGraph` reports residualCrossings=0 in a seam-aware NORMALIZED metric, but the raw
// mm-space geometry cdt2d actually consumes still had 840 real crossings on a 5-bay Gothic patch (MEASURED) —
// the u-family and t-family ridge chains X-cross, and cdt2d's monotone triangulation throws `upperIds` on any
// crossing/collinear-overlap constraint (project memory: cdt_planarization). This makes the graph EXACTLY planar
// in the same mm metric cdt2d uses: (1) split every proper edge×edge crossing at a shared vertex, (2) split every
// T-junction (a vertex on an edge interior) — iterate until no crossings remain. This is the "planarize feature
// edges + keep cdt2d" fix, done in the metric cdt2d consumes.

const EPS_CROSS = 1e-9;   // orientation epsilon (mm²)
const EPS_ON = 3e-3;      // point-on-segment perpendicular tol (mm); ridge samples are ~0.1mm apart
const WELD_MM = 3e-4;     // weld coincident vertices below this (mm). At a near-triple-point the three pairwise
                          // crossings land within ~WELD_MM and collapse to ONE shared fan vertex (avoids the
                          // chase-your-tail residual of a finer grid); still ≪ the 1e-4 audit quantize is avoided
                          // (3e-4 > audit 1e-4 so welded crossing verts stay a single audit-point).

interface PlanarResult { pts: number[]; edges: Array<[number, number]>; residual: number; addedVerts: number; }

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}
// proper crossing point of segment (a,b)×(c,d), or null. Returns the intersection param s on (a,b).
function properCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number | null {
  const d1 = orient(cx, cy, dx, dy, ax, ay), d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy), d4 = orient(ax, ay, bx, by, dx, dy);
  if (((d1 > EPS_CROSS && d2 < -EPS_CROSS) || (d1 < -EPS_CROSS && d2 > EPS_CROSS)) &&
      ((d3 > EPS_CROSS && d4 < -EPS_CROSS) || (d3 < -EPS_CROSS && d4 > EPS_CROSS))) {
    const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (Math.abs(den) < 1e-15) return null;
    const s = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
    return s;
  }
  return null;
}

export function planarizeMM(mm0: number[], edges0: Array<[number, number]>, maxPass = 12): PlanarResult {
  const pts = mm0.slice();
  // weld map on a fine grid
  const cellW = WELD_MM; const wmap = new Map<string, number>();
  const wkey = (x: number, y: number): string => `${Math.round(x / cellW)}_${Math.round(y / cellW)}`;
  for (let i = 0; i < pts.length / 2; i++) { const k = wkey(pts[2 * i], pts[2 * i + 1]); if (!wmap.has(k)) wmap.set(k, i); }
  const addVert = (x: number, y: number): number => { const k = wkey(x, y); const h = wmap.get(k); if (h !== undefined) return h; const id = pts.length / 2; pts.push(x, y); wmap.set(k, id); return id; };
  // Weld edge endpoints through the weld map + CULL micro-edges (extraction noise: a <MICRO_MM stub crosses a long
  // ridge at its very tip and re-registers as a residual crossing forever). These carry no geometry.
  const MICRO_MM = 5e-3;
  const canon = (v: number): number => { const h = wmap.get(wkey(pts[2 * v], pts[2 * v + 1])); return h ?? v; };
  let edges = edges0.map((e) => [canon(e[0]), canon(e[1])] as [number, number])
    .filter((e) => e[0] !== e[1] && Math.hypot(pts[2 * e[0]] - pts[2 * e[1]], pts[2 * e[0] + 1] - pts[2 * e[1] + 1]) >= MICRO_MM);
  const nAdded0 = pts.length / 2;

  const cell = 0.5; // spatial hash cell (mm) for edge broadphase
  let residual = 0;
  for (let pass = 0; pass < maxPass; pass++) {
    // spatial hash of edges by bbox cells
    const grid = new Map<number, number[]>();
    const put = (gx: number, gy: number, ei: number): void => { const k = gx * 100003 + gy; const a = grid.get(k); if (a) a.push(ei); else grid.set(k, [ei]); };
    const bbox = (e: [number, number]): [number, number, number, number] => { const [a, b] = e; return [Math.min(pts[2 * a], pts[2 * b]), Math.min(pts[2 * a + 1], pts[2 * b + 1]), Math.max(pts[2 * a], pts[2 * b]), Math.max(pts[2 * a + 1], pts[2 * b + 1])]; };
    for (let ei = 0; ei < edges.length; ei++) { const [x0, y0, x1, y1] = bbox(edges[ei]); for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) put(gx, gy, ei); }

    // collect one split point per edge (the crossings + T-junction verts on it), then rebuild
    const splitsOnEdge: Array<Array<{ s: number; v: number }>> = edges.map(() => []);
    let crossFound = 0;
    const tested = new Set<number>();
    for (let ei = 0; ei < edges.length; ei++) {
      const [x0, y0, x1, y1] = bbox(edges[ei]);
      const cand = new Set<number>();
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) { const a = grid.get(gx * 100003 + gy); if (a) for (const ej of a) if (ej > ei) cand.add(ej); }
      const [a, b] = edges[ei]; const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
      for (const ej of cand) {
        const pk = ei * 1e7 + ej; if (tested.has(pk)) continue; tested.add(pk);
        const [c, d] = edges[ej];
        if (a === c || a === d || b === c || b === d) continue; // share endpoint => not a proper crossing
        const cx = pts[2 * c], cy = pts[2 * c + 1], dx = pts[2 * d], dy = pts[2 * d + 1];
        const s = properCross(ax, ay, bx, by, cx, cy, dx, dy);
        if (s === null) continue;
        crossFound++;
        const ix = ax + s * (bx - ax), iy = ay + s * (by - ay);
        const den2 = (dx - cx) ** 2 + (dy - cy) ** 2 || 1e-12; const sj = ((ix - cx) * (dx - cx) + (iy - cy) * (dy - cy)) / den2;
        // NEAR-ENDPOINT SNAP: if the crossing lands within EB of one edge's endpoint, the two chains meet AT that
        // existing vertex (a T-junction at an endpoint) — reuse it as the shared fan vertex and split ONLY the other
        // edge through it. This kills the stuck sub-0.07mm near-triple-point residuals (a fresh intersection vertex
        // a hair off the endpoint keeps re-crossing forever).
        const EB = 0.02; // param band (~endpoint of a short 0.05mm edge)
        let v: number;
        if (s < EB) { v = a; }
        else if (s > 1 - EB) { v = b; }
        else if (sj < EB) { v = c; }
        else if (sj > 1 - EB) { v = d; }
        else { v = addVert(ix, iy); }
        if (v !== a && v !== b) splitsOnEdge[ei].push({ s, v });
        if (v !== c && v !== d) splitsOnEdge[ej].push({ s: sj, v });
      }
    }
    // T-junctions: any vertex lying on an edge interior (do a broadphase point-in-cell against edges)
    const vgrid = new Map<number, number[]>();
    for (let vi = 0; vi < pts.length / 2; vi++) { const gx = Math.floor(pts[2 * vi] / cell), gy = Math.floor(pts[2 * vi + 1] / cell); const k = gx * 100003 + gy; const a = vgrid.get(k); if (a) a.push(vi); else vgrid.set(k, [vi]); }
    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei]; const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
      const [x0, y0, x1, y1] = bbox(edges[ei]); const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1e-12;
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const a2 = vgrid.get(gx * 100003 + gy); if (!a2) continue;
        for (const vi of a2) {
          if (vi === a || vi === b) continue;
          const px = pts[2 * vi], py = pts[2 * vi + 1];
          const s = ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / L2;
          if (s <= 1e-4 || s >= 1 - 1e-4) continue;
          const projx = ax + s * (bx - ax), projy = ay + s * (by - ay);
          if (Math.hypot(px - projx, py - projy) < EPS_ON) splitsOnEdge[ei].push({ s, v: vi });
        }
      }
    }
    // rebuild edge list with splits
    const next: Array<[number, number]> = [];
    for (let ei = 0; ei < edges.length; ei++) {
      const [a, b] = edges[ei]; const sp = splitsOnEdge[ei];
      if (!sp.length) { if (a !== b) next.push([a, b]); continue; }
      sp.sort((p, q) => p.s - q.s);
      let prev = a;
      for (const s of sp) { if (s.v !== prev && s.s > 1e-4 && s.s < 1 - 1e-4) { next.push([prev, s.v]); prev = s.v; } }
      if (prev !== b) next.push([prev, b]);
    }
    // dedupe edges + CULL micro-edges each pass (a split near an endpoint can spawn a sub-micron stub that
    // re-crosses forever; a <MICRO_MM sub-edge is below tolerance and carries no geometry).
    const eset = new Set<number>(); const ded: Array<[number, number]> = [];
    for (const [a, b] of next) {
      if (a === b) continue;
      if (Math.hypot(pts[2 * a] - pts[2 * b], pts[2 * a + 1] - pts[2 * b + 1]) < MICRO_MM) continue;
      const k = a < b ? a * 1e7 + b : b * 1e7 + a; if (!eset.has(k)) { eset.add(k); ded.push([a, b]); }
    }
    edges = ded;
    residual = crossFound;
    if (crossFound === 0) break;
  }
  return { pts, edges, residual, addedVerts: pts.length / 2 - nAdded0 };
}
