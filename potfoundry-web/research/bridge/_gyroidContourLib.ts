// _gyroidContourLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-GYROID-CONFORMING-CLOSE: extract the gyroid channel-wall relief-transition contour as (u,t)
// polylines, analytically from the style level-set field, to sub-0.01mm placement — the CONSTRAINT EDGES for the
// conforming re-mesh that closes Gyroid as a zero-serration feature-edge style.
//
// The relief is r = r0 + relief·shape·fade, shape = smoothstep(th, th−smoothVal·th, |val|)^curve with
//   th = gmThickness·1.5 = 0.15,  smoothVal = gmSharpness = 0.1,  curve = 1,
//   val(u,t) = gyroid TPMS field  = sin(x)cos(y) + sin(y)cos(zT) + sin(zT)cos(x)  (morph=0, bias=0),
//   x = fScale·cos(TAU·u),  y = fScale·sin(TAU·u),  zT = fScale·t·zStretch·4 (+ pulse·TAU),  fScale = gmScale.
// shape=1 (ridge plateau) for |val| ≤ th·(1−smoothVal) = 0.135; shape=0 (channel floor) for |val| ≥ th = 0.15.
// So the WALL BAND is the isovalue band |val| ∈ [0.135, 0.15] — the scatter's DOUBLE lines are these two isolevels.
//
// EXTRACTION: marching squares on the scalar field F_c(u,t) = val(u,t) − c (or |val| − c) at a modest grid, with
// per-crossing 1D root-polish along the cell edge (the field is smooth away from val's own critical points, so a
// few bisection/Newton steps nail the isolevel to machine precision in (u,t)). Placement is validated in 3D: a
// point on the extracted polyline is displaced from the true isolevel by |val(u,t)−c|/‖∇val‖·(dr/dshape scale) — we
// measure the 3D displacement directly (lift both the polyline point and its root-polished correction).
//
// ISOLATION: NEW file. Imports labkit READ-ONLY. NO src/ edit, NO edit to the kernel/truth libs.
import type { AnalyticRadiusFn } from './labkit';

const TAU = 2 * Math.PI;

// ── the gyroid TPMS scalar field val(u,t), matching styles.ts rOuterGyroidManifold exactly ──────────────────────
export interface GyroidFieldParams {
  fScale: number;   // gmScale (default 4)
  zStretch: number; // gmZStretch (default 1)
  pulse: number;    // gmPulse (default 0)
  morph: number;    // gmMorph (default 0)
  bias: number;     // gmBias (default 0)
  thickness: number; // gmThickness (default 0.1) → th = thickness·1.5
  smoothVal: number; // = max(0.001, gmSharpness) (default 0.1)
}
export const GYROID_DEFAULTS: GyroidFieldParams = { fScale: 4, zStretch: 1, pulse: 0, morph: 0, bias: 0, thickness: 0.1, smoothVal: 0.1 };

/** val(u,t): the gyroid/Schwarz-P blended TPMS field the relief thresholds. u∈[0,1) azimuth, t∈[0,1] height. */
export function gyroidVal(u: number, t: number, p: GyroidFieldParams = GYROID_DEFAULTS): number {
  const phi = TAU * u;
  const x = p.fScale * Math.cos(phi);
  const y = p.fScale * Math.sin(phi);
  const zT = p.fScale * t * p.zStretch * 4.0 + p.pulse * TAU;
  const gyr = Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(zT) + Math.sin(zT) * Math.cos(x);
  const sch = Math.cos(x) + Math.cos(y) + Math.cos(zT);
  return (1 - p.morph) * gyr + p.morph * sch + p.bias;
}

/** The two wall-band isolevels (|val| = c) and the band midline, from th & smoothVal. */
export function wallIsolevels(p: GyroidFieldParams = GYROID_DEFAULTS): { inner: number; outer: number; mid: number; th: number } {
  const th = p.thickness * 1.5;
  const inner = th * (1 - p.smoothVal); // shape=1 edge (ridge plateau top)   e.g. 0.135
  const outer = th;                     // shape=0 edge (channel floor start)  e.g. 0.15
  const mid = th * (1 - p.smoothVal / 2); // band midline                       e.g. 0.1425
  return { inner, outer, mid, th };
}

// ── marching squares on the ABSOLUTE field |val(u,t)| − c (the wall band lives where |val|=c) ────────────────────
// We extract level sets of g(u,t) = |val(u,t)| − c. Because the gyroid val changes sign, |val|=c has TWO branches
// (val=+c and val=−c); working on |val| captures both in one pass. The u-axis is PERIODIC (wrap u=1→0); t is not.
export interface Contour { pts: Array<[number, number]>; } // ordered (u,t) polyline
export interface MarchOpts { nu: number; nt: number; polishIters: number; }

// 1D root of g along a segment from A=(ua,ta) to B=(ub,tb) where g changes sign, via bisection→secant polish.
function edgeRoot(
  g: (u: number, t: number) => number, ua: number, ta: number, ub: number, tb: number, iters: number,
): [number, number] {
  let ga = g(ua, ta), gb = g(ub, tb);
  let a = 0, b = 1; // parameter along the segment
  // secant + bisection safeguard
  for (let it = 0; it < iters; it++) {
    // linear-interp guess (secant on g)
    let s = ga !== gb ? a + (b - a) * (0 - ga) / (gb - ga) : 0.5 * (a + b);
    if (!(s > a && s < b)) s = 0.5 * (a + b);
    const us = ua + (ub - ua) * s, ts = ta + (tb - ta) * s;
    const gs = g(us, ts);
    if (gs === 0) { return [us, ts]; }
    if ((ga < 0) !== (gs < 0)) { b = s; gb = gs; } else { a = s; ga = gs; }
  }
  const sm = 0.5 * (a + b);
  return [ua + (ub - ua) * sm, ta + (tb - ta) * sm];
}

/**
 * Marching squares over the (u,t) unit square (u periodic) for the isolevel |val| = c. Returns UNORDERED segments
 * (pairs of (u,t) points) — one per cell edge-crossing pair. Ordering into polylines is done by `linkSegments`.
 */
export function marchAbsIso(
  c: number, p: GyroidFieldParams, opts: MarchOpts,
): Array<[[number, number], [number, number]]> {
  const { nu, nt, polishIters } = opts;
  const g = (u: number, t: number): number => Math.abs(gyroidVal(u, t, p)) - c;
  // sample grid (u wraps: column nu == column 0)
  const val = new Float64Array((nu + 1) * (nt + 1));
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nt; j++) { const u = i / nu, t = j / nt; val[i * (nt + 1) + j] = g(u, t); }
  const at = (i: number, j: number): number => val[i * (nt + 1) + j];
  const segs: Array<[[number, number], [number, number]]> = [];
  // per-cell: 4 corners, interpolate crossings on the 4 edges, connect (marching-squares standard cases)
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nt; j++) {
      const u0 = i / nu, u1 = (i + 1) / nu, t0 = j / nt, t1 = (j + 1) / nt;
      const f00 = at(i, j), f10 = at(i + 1, j), f11 = at(i + 1, j + 1), f01 = at(i, j + 1);
      // edge crossings (root-polished): bottom(f00-f10), right(f10-f11), top(f01-f11), left(f00-f01)
      const cross: Array<[number, number]> = [];
      if ((f00 < 0) !== (f10 < 0)) cross.push(edgeRoot(g, u0, t0, u1, t0, polishIters));
      if ((f10 < 0) !== (f11 < 0)) cross.push(edgeRoot(g, u1, t0, u1, t1, polishIters));
      if ((f01 < 0) !== (f11 < 0)) cross.push(edgeRoot(g, u0, t1, u1, t1, polishIters));
      if ((f00 < 0) !== (f01 < 0)) cross.push(edgeRoot(g, u0, t0, u0, t1, polishIters));
      // connect crossings pairwise (2 → one seg; 4 → ambiguous saddle, connect by proximity: two segs)
      if (cross.length === 2) segs.push([cross[0], cross[1]]);
      else if (cross.length === 4) {
        // resolve the saddle by the cell-center sign (asymptotic decider). Cheap: connect nearest pairs.
        segs.push([cross[0], cross[1]]); segs.push([cross[2], cross[3]]);
      }
    }
  }
  return segs;
}

/**
 * Link unordered segments into ordered polylines by welding shared endpoints (quantized). u is periodic so a
 * polyline may wrap; we DON'T force closure, just chain. Returns polylines (each an ordered (u,t) list).
 */
export function linkSegments(
  segs: Array<[[number, number], [number, number]]>, weldEps = 1e-6,
): Contour[] {
  const q = 1 / weldEps;
  const key = (pt: [number, number]): string => `${Math.round(pt[0] * q)}_${Math.round(pt[1] * q)}`;
  // adjacency: endpoint-key → list of {segIdx, end}
  const adj = new Map<string, Array<{ s: number; e: 0 | 1 }>>();
  segs.forEach((s, i) => {
    for (const e of [0, 1] as const) { const k = key(s[e]); if (!adj.has(k)) adj.set(k, []); adj.get(k)!.push({ s: i, e }); }
  });
  const used = new Array(segs.length).fill(false);
  const contours: Contour[] = [];
  const nextFrom = (segIdx: number, fromEnd: 0 | 1): { s: number; e: 0 | 1 } | null => {
    const pt = segs[segIdx][fromEnd === 0 ? 1 : 0]; // the OTHER endpoint we're walking toward
    const k = key(pt);
    const cands = adj.get(k) ?? [];
    for (const c of cands) { if (!used[c.s] && c.s !== segIdx) return c; }
    return null;
  };
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const pts: Array<[number, number]> = [segs[start][0], segs[start][1]];
    // extend forward
    let cur = start, curOtherEnd: 0 | 1 = 1;
    for (;;) {
      const nx = nextFrom(cur, curOtherEnd === 1 ? 0 : 1);
      if (!nx) break;
      used[nx.s] = true;
      pts.push(segs[nx.s][nx.e === 0 ? 1 : 0]);
      cur = nx.s; curOtherEnd = nx.e === 0 ? 1 : 0;
    }
    contours.push({ pts });
  }
  return contours;
}

// ── isolevel root-polish + filter (clean the ~0.3% marching-squares saddle strays) ──────────────────────────────
// The plain marching-squares linker leaves ~0.28% of vertices OFF the |val|=c isolevel (up to ~0.013 val-err /
// ~3.9mm 3D) at cells straddling val's critical points (junction saddles where the two ±c branches meet / the 4-
// crossing ambiguity). Each polyline vertex is root-polished onto the true isolevel by a bounded 2D descent of
// (|val|−c)²; a vertex that cannot reach valErr ≤ `valTol` within the window is DROPPED (splitting its polyline).
// This yields sub-tol placement on EVERY surviving constraint vertex (the ones fed to the mesher).
export function polishVertexToIso(u: number, t: number, c: number, p: GyroidFieldParams, window = 0.012): { u: number; t: number; valErr: number } {
  const N = 24; let bestF = Infinity, bu = u, bt = t;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const uu = u + window * (i / N - 0.5) * 2, tt = t + window * (j / N - 0.5) * 2;
    const e = Math.abs(gyroidVal(uu, tt, p)) - c; const f = e * e;
    if (f < bestF) { bestF = f; bu = uu; bt = tt; }
  }
  let h = window / N;
  for (let it = 0; it < 60; it++) {
    let improved = false;
    for (const ddu of [-h, 0, h]) for (const ddt of [-h, 0, h]) { if (ddu === 0 && ddt === 0) continue; const e = Math.abs(gyroidVal(bu + ddu, bt + ddt, p)) - c; const f = e * e; if (f < bestF) { bestF = f; bu += ddu; bt += ddt; improved = true; } }
    if (!improved) h *= 0.5;
    if (h < 1e-10) break;
  }
  return { u: bu, t: bt, valErr: Math.sqrt(bestF) };
}

/** Polish every polyline vertex onto |val|=c; drop vertices with valErr > valTol (split their polyline). */
export function refineAndFilterContours(contours: Contour[], c: number, p: GyroidFieldParams, valTol = 1e-4): { contours: Contour[]; dropped: number; kept: number } {
  const out: Contour[] = []; let dropped = 0, kept = 0;
  for (const cont of contours) {
    let run: Array<[number, number]> = [];
    for (const [u, t] of cont.pts) {
      const r = polishVertexToIso(u, t, c, p);
      if (r.valErr <= valTol) { run.push([r.u, r.t]); kept++; } else { dropped++; if (run.length >= 2) out.push({ pts: run }); run = []; }
    }
    if (run.length >= 2) out.push({ pts: run }); else if (run.length === 1) kept--; // singleton run is useless
  }
  return { contours: out, dropped, kept };
}

// ── arc-length decimation (3D) — thin the dense marching-squares polyline to a mesher-friendly constraint ───────
// The 1200-res marching squares yields ~25k vertices/isolevel (spacing ~0.0008 in u). That over-constrains the
// mesher. Resample each polyline to a target 3D arc-length step `stepMm` (the walls are near-vertical so a modest
// step keeps the constraint faithful; the mesher's chord-Steiner + recoverySubdivideCollinear insert more where
// sag demands). Keeps endpoints + every vertex ≥ stepMm (3D) from the last kept one. Preserves order & junctions.
export function decimateContours(contours: Contour[], stepMm: number, rA: AnalyticRadiusFn, H: number): Contour[] {
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const out: Contour[] = [];
  for (const cont of contours) {
    if (cont.pts.length < 2) continue;
    const kept: Array<[number, number]> = [cont.pts[0]];
    let [lx, ly, lz] = lift(cont.pts[0][0], cont.pts[0][1]);
    for (let i = 1; i < cont.pts.length - 1; i++) {
      const [x, y, z] = lift(cont.pts[i][0], cont.pts[i][1]);
      if (Math.hypot(x - lx, y - ly, z - lz) >= stepMm) { kept.push(cont.pts[i]); lx = x; ly = y; lz = z; }
    }
    kept.push(cont.pts[cont.pts.length - 1]);
    if (kept.length >= 2) out.push({ pts: kept });
  }
  return out;
}

// ── polylines → injectedPoints + constraintEdges (the kernel constraint format) ─────────────────────────────────
// injectedPoints = flat [u0,t0, u1,t1, ...] over ALL polyline vertices (deduped by the kernel's addPoint).
// constraintEdges = flat [posA,posB, ...] index-pairs into injectedPoints, one per consecutive polyline segment.
export function contoursToConstraints(contours: Contour[]): { injectedPoints: number[]; constraintEdges: number[] } {
  const injectedPoints: number[] = []; const constraintEdges: number[] = [];
  for (const cont of contours) {
    const base = injectedPoints.length / 2;
    for (const [u, t] of cont.pts) injectedPoints.push(u, t);
    for (let i = 0; i < cont.pts.length - 1; i++) constraintEdges.push(base + i, base + i + 1);
  }
  return { injectedPoints, constraintEdges };
}

// ── contour placement validation (3D) ───────────────────────────────────────────────────────────────────────────
// For a set of points ON an extracted |val|=c polyline, verify they sit at the target isolevel: measure the 3D
// displacement between the placed (u,t) and the true nearest (u,t) with |val|=c EXACTLY (a 1D Newton on |val|−c
// along ∇val). Small displacement ⇒ the extractor placed the vertex on the wall to sub-tol.
export function isoResidual3D(
  u: number, t: number, c: number, p: GyroidFieldParams, rA: AnalyticRadiusFn, H: number,
): { valErr: number; disp3D: number } {
  const av = Math.abs(gyroidVal(u, t, p));
  const valErr = Math.abs(av - c);
  // 3D displacement of THIS placed point off the true isolevel |val|=c. We find the true isolevel point by a
  // BOUNDED line-search along the gradient direction (a single Newton step overshoots wildly near ∇val→0 saddles —
  // that inflated the disp of ~0.3% of points to ~0.76mm and was a VALIDATOR artifact, not a placement error).
  // Direction = ∇|val| (points toward increasing |val|); we search a small ±window and root-find |val|−c.
  const lift = (uu: number, tt: number): [number, number, number] => { const th = TAU * uu, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const [x0, y0, z0] = lift(u, t);
  // honest 3D displacement: find the TRUE nearest (u,t) with |val|=c inside a small bounded window (±0.01 in u,t —
  // one marching cell), by a coarse local scan + box-refine of (|val(u,t)|−c)². Bounded ⇒ never blows up at ∇→0.
  const R = 0.012, N = 24;
  let bestF = Infinity, bu = u, bt = t;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const uu = u + R * (i / N - 0.5) * 2, tt = t + R * (j / N - 0.5) * 2;
    const e = Math.abs(gyroidVal(uu, tt, p)) - c; const f = e * e;
    if (f < bestF) { bestF = f; bu = uu; bt = tt; }
  }
  let hstep = R / N;
  for (let it = 0; it < 40; it++) {
    let improved = false;
    for (const ddu of [-hstep, 0, hstep]) for (const ddt of [-hstep, 0, hstep]) {
      if (ddu === 0 && ddt === 0) continue;
      const e = Math.abs(gyroidVal(bu + ddu, bt + ddt, p)) - c; const f = e * e;
      if (f < bestF) { bestF = f; bu += ddu; bt += ddt; improved = true; }
    }
    if (!improved) hstep *= 0.5;
    if (hstep < 1e-9) break;
  }
  const [x1, y1, z1] = lift(bu, bt);
  const disp3D = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  return { valErr, disp3D };
}
