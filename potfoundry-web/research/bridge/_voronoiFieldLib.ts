// _voronoiFieldLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-09-VORONOI-EMBED: extract the Voronoi cell-wall relief-transition contours as (u,t) polylines from the
// SAMPLER's OWN distance-difference field, to sub-0.01mm placement — the DOUBLED constraint edges for the conforming
// re-mesh that (if embeddable) closes Voronoi as a zero-serration feature-edge style like Gyroid (§V11o/q).
//
// CRITICAL HISTORY (do not re-derive): Voronoi's hash22 had a proven f32/f64 precision floor AND a %-vs-fract port
// fix (styles.ts:1438 comment). The loci MUST be derived from the SAME hash/formula the mesh sampler evaluates.
// Therefore hash22 + periodicCellular below are ported VERBATIM from src/geometry/styles.ts (byte-for-byte logic),
// and every extracted vertex is validated in (u,t) against a direct sampler evaluation, NOT a reimplementation.
//
// THE FIELD (styles.ts rOuterVoronoi, DEFAULTS vScale=8 vJitter=0.8 vThickness=0.1 vRelief=2 vMorph=1 zStretch=1
//   pulse=0 edgeFade=0.15):
//   u2d = (u_azimuth)·vScale,  v2d = t·vScale·zStretch  (pulse shifts u2d; morph=1 ⇒ pattern = web)
//   {f1,f2} = periodicCellular({u2d,v2d}, period={vScale,0}, jitter)   (f1 = nearest seed dist, f2 = 2nd-nearest)
//   cellSdf = f2 − f1   (≥0; ==0 EXACTLY on the Voronoi cell boundary = equidistant between two seeds)
//   web  = 1 − smoothstep(0, th, cellSdf)   (th = vThickness = 0.1)   ⇒ raised RIDGE on the boundary crest
//   fade = edge-fade in t (smoothstep bands near t=0 and t=1)
//   r = r0 + relief·web·fade
//
// So the "wall band" is cellSdf ∈ [0, th]: web=1 (full raised crest, +relief·fade) at cellSdf=0 (ON the boundary),
// web=0 (flat cell interior) at cellSdf≥th. The relief is a smooth-ramp DECAY off the boundary crest — structurally
// a ONE-SIDED cliff (Gyroid-class), NOT a two-sided occlusion fold (CelticKnot-class). The point-fold pre-check
// MEASURES which. The wall loci = the two isolevels bracketing the band: inner (cellSdf=0, the crest) and outer
// (cellSdf=th, the flat edge). Note cellSdf=0 is a C0 CREASE of cellSdf itself (nearest/2nd-nearest identity swaps),
// so the crest isolevel sits on a non-differentiable valley — the §V11u-3 outlier loci.
//
// ISOLATION: NEW file. Imports labkit READ-ONLY. NO src/ edit, NO edit to the kernel/truth/gyroid libs.
import type { AnalyticRadiusFn } from './labkit';

const TAU = 2 * Math.PI;

// ── hash22 + periodicCellular: ported VERBATIM from src/geometry/styles.ts (the SAMPLER formula) ─────────────────
function hash22(px: number, py: number): { x: number; y: number } {
  const fract = (x: number): number => x - Math.floor(x);
  const p3 = { x: fract(px * 0.1031), y: fract(py * 0.103), z: fract(px * 0.0973) };
  const dot = p3.x * (p3.y + 33.33) + p3.y * (p3.z + 33.33) + p3.z * (p3.x + 33.33);
  p3.x += dot; p3.y += dot; p3.z += dot;
  return { x: fract((p3.x + p3.y) * p3.z), y: fract((p3.x + p3.z) * p3.y) };
}

/** {f1,f2} = nearest & 2nd-nearest seed distances at 2D grid point (ux,vy). periodX = vScale, jitter = vJitter. */
function periodicCellular(ux: number, vy: number, periodX: number, jitter: number): { f1: number; f2: number } {
  const cellX = Math.floor(ux), cellY = Math.floor(vy);
  const cuX = ux - cellX, cuY = vy - cellY;
  let f1 = 999.0, f2 = 999.0;
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const nIdX = cellX + x, nIdY = cellY + y;
      const wrapX = ((nIdX % periodX) + periodX) % periodX; // periodic wrap (X only, cylinder)
      const ph = hash22(wrapX, nIdY);
      const cx = x + ph.x * jitter, cy = y + ph.y * jitter;
      const dx = cx - cuX, dy = cy - cuY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < f1) { f2 = f1; f1 = dist; } else if (dist < f2) { f2 = dist; }
    }
  }
  return { f1, f2 };
}

export interface VoronoiFieldParams {
  scale: number;    // vScale (default 8)
  jitter: number;   // vJitter (default 0.8)
  thickness: number; // vThickness = th (default 0.1)
  relief: number;   // vRelief (default 2)
  morph: number;    // vMorph (default 1 = cells/web)
  zStretch: number; // vZStretch (default 1)
  pulse: number;    // vPulse (default 0)
  edgeFade: number; // vEdgeFade (default 0.15)
}
export const VORONOI_DEFAULTS: VoronoiFieldParams = { scale: 8, jitter: 0.8, thickness: 0.1, relief: 2, morph: 1, zStretch: 1, pulse: 0, edgeFade: 0.15 };

const smoothstep = (e0: number, e1: number, x: number): number => { const s = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return s * s * (3 - 2 * s); };

/** The 2D grid coords the sampler evaluates the noise at, from azimuth u∈[0,1) and height t∈[0,1]. */
function grid(u: number, t: number, p: VoronoiFieldParams): { ux: number; vy: number } {
  const sc = p.scale > 0 ? p.scale : 8.0;
  const st = p.zStretch > 0 ? p.zStretch : 1.0;
  const ux = u * sc + p.pulse * sc; // pulse shift
  const vy = t * sc * st;
  return { ux, vy };
}

/** cellSdf(u,t) = f2 − f1 — 0 on the Voronoi cell boundary, grows into the cell interior. THE wall field. */
export function cellSdf(u: number, t: number, p: VoronoiFieldParams = VORONOI_DEFAULTS): number {
  const { ux, vy } = grid(u, t, p);
  const sc = p.scale > 0 ? p.scale : 8.0;
  const { f1, f2 } = periodicCellular(ux, vy, sc, p.jitter);
  return f2 - f1;
}

/** f1(u,t) = nearest-seed distance (for the bubble term; not used at morph=1 but kept for completeness). */
export function nearestF1(u: number, t: number, p: VoronoiFieldParams = VORONOI_DEFAULTS): number {
  const { ux, vy } = grid(u, t, p);
  const sc = p.scale > 0 ? p.scale : 8.0;
  return periodicCellular(ux, vy, sc, p.jitter).f1;
}

/** The relief height fraction web·fade ∈ [0,1] at (u,t) (morph=1). r = r0 + relief·web(u,t)·fade(t). */
export function webValue(u: number, t: number, p: VoronoiFieldParams = VORONOI_DEFAULTS): number {
  const sdf = cellSdf(u, t, p);
  const web = 1.0 - smoothstep(0.0, p.thickness, sdf);
  const bubble = smoothstep(1.0, 0.0, nearestF1(u, t, p));
  const pattern = bubble * (1 - p.morph) + web * p.morph;
  // edge fade
  let fade = 1.0;
  const lim = Math.min(p.edgeFade, 0.49);
  if (lim > 0) { const b = smoothstep(0, lim, t); const tp = 1 - smoothstep(1 - lim, 1, t); fade = b * tp; }
  return pattern * fade;
}

/** The two wall-band isolevels of cellSdf (crest at 0, flat edge at th) + mid. */
export function wallIsolevels(p: VoronoiFieldParams = VORONOI_DEFAULTS): { crest: number; flat: number; mid: number; th: number } {
  return { crest: 0.0, flat: p.thickness, mid: p.thickness * 0.5, th: p.thickness };
}

// ── marching squares on g(u,t) = cellSdf(u,t) − c ───────────────────────────────────────────────────────────────
// The u-axis is PERIODIC (u=1 wraps to 0 — the seed grid has period vScale so u=1 maps to grid vScale ≡ 0 mod scale
// when scale is an integer; for scale=8 it wraps cleanly). t is NOT periodic. cellSdf ≥ 0 everywhere and its own
// crease is at cellSdf=0 (the boundary), so the crest isolevel c=0 is degenerate (the field only touches 0, never
// crosses) — extract the crest via a small POSITIVE epsilon offset (cellSdf = εc) instead, and the flat edge at c=th.
export interface Contour { pts: Array<[number, number]>; }
export interface MarchOpts { nu: number; nt: number; polishIters: number; }

function edgeRoot(g: (u: number, t: number) => number, ua: number, ta: number, ub: number, tb: number, iters: number): [number, number] {
  let ga = g(ua, ta); const gb = g(ub, tb);
  let a = 0, b = 1;
  for (let it = 0; it < iters; it++) {
    let s = ga !== gb ? a + (b - a) * (0 - ga) / (gb - ga) : 0.5 * (a + b);
    if (!(s > a && s < b)) s = 0.5 * (a + b);
    const us = ua + (ub - ua) * s, ts = ta + (tb - ta) * s;
    const gs = g(us, ts);
    if (gs === 0) return [us, ts];
    if ((ga < 0) !== (gs < 0)) { b = s; } else { a = s; ga = gs; }
  }
  const sm = 0.5 * (a + b);
  return [ua + (ub - ua) * sm, ta + (tb - ta) * sm];
}

/** Marching squares over (u,t) for cellSdf = c. u periodic (column nu ≡ column 0). Returns unordered segments. */
export function marchSdfIso(c: number, p: VoronoiFieldParams, opts: MarchOpts): Array<[[number, number], [number, number]]> {
  const { nu, nt, polishIters } = opts;
  const g = (u: number, t: number): number => cellSdf(u, t, p) - c;
  const val = new Float64Array((nu + 1) * (nt + 1));
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nt; j++) { val[i * (nt + 1) + j] = g(i / nu, j / nt); }
  const at = (i: number, j: number): number => val[i * (nt + 1) + j];
  const segs: Array<[[number, number], [number, number]]> = [];
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nt; j++) {
      const u0 = i / nu, u1 = (i + 1) / nu, t0 = j / nt, t1 = (j + 1) / nt;
      const f00 = at(i, j), f10 = at(i + 1, j), f11 = at(i + 1, j + 1), f01 = at(i, j + 1);
      const cross: Array<[number, number]> = [];
      if ((f00 < 0) !== (f10 < 0)) cross.push(edgeRoot(g, u0, t0, u1, t0, polishIters));
      if ((f10 < 0) !== (f11 < 0)) cross.push(edgeRoot(g, u1, t0, u1, t1, polishIters));
      if ((f01 < 0) !== (f11 < 0)) cross.push(edgeRoot(g, u0, t1, u1, t1, polishIters));
      if ((f00 < 0) !== (f01 < 0)) cross.push(edgeRoot(g, u0, t0, u0, t1, polishIters));
      if (cross.length === 2) segs.push([cross[0], cross[1]]);
      else if (cross.length === 4) { segs.push([cross[0], cross[1]]); segs.push([cross[2], cross[3]]); }
    }
  }
  return segs;
}

/** Link unordered segments into ordered polylines by welding quantized shared endpoints. */
export function linkSegments(segs: Array<[[number, number], [number, number]]>, weldEps = 1e-6): Contour[] {
  const q = 1 / weldEps;
  const key = (pt: [number, number]): string => `${Math.round(pt[0] * q)}_${Math.round(pt[1] * q)}`;
  const adj = new Map<string, Array<{ s: number; e: 0 | 1 }>>();
  segs.forEach((s, i) => { for (const e of [0, 1] as const) { const k = key(s[e]); if (!adj.has(k)) adj.set(k, []); adj.get(k)!.push({ s: i, e }); } });
  const used = new Array(segs.length).fill(false);
  const contours: Contour[] = [];
  const nextFrom = (segIdx: number, fromEnd: 0 | 1): { s: number; e: 0 | 1 } | null => {
    const pt = segs[segIdx][fromEnd === 0 ? 1 : 0];
    const k = key(pt); const cand = adj.get(k); if (!cand) return null;
    for (const c of cand) { if (!used[c.s] && c.s !== segIdx) return c; }
    return null;
  };
  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const pts: Array<[number, number]> = [segs[start][0], segs[start][1]];
    let cur = start, fromEnd: 0 | 1 = 1;
    for (;;) { const nx = nextFrom(cur, fromEnd); if (!nx) break; used[nx.s] = true; const other = nx.e === 0 ? 1 : 0; pts.push(segs[nx.s][other]); cur = nx.s; fromEnd = other; }
    contours.push({ pts });
  }
  return contours;
}

// ── vertex polish onto cellSdf = c (2D nearest-isolevel, bounded) ───────────────────────────────────────────────
export function polishVertexToIso(u: number, t: number, c: number, p: VoronoiFieldParams, iters = 30): { u: number; t: number; valErr: number } {
  let bu = u, bt = t, bf = Math.abs(cellSdf(u, t, p) - c);
  // bounded local scan + box-refine of (cellSdf−c)² in a ±window (cellSdf is C0 at boundaries; central FD gradient
  // is ill-defined ON the crease, so a robust box-refine is used rather than a Newton step).
  let h = 1 / p.scale * 0.25; // one grid-cell in (u,t) roughly
  for (let it = 0; it < iters; it++) {
    let improved = false;
    for (const du of [-h, 0, h]) for (const dt of [-h, 0, h]) {
      if (du === 0 && dt === 0) continue;
      const uu = bu + du, tt = Math.max(0, Math.min(1, bt + dt));
      const f = Math.abs(cellSdf(uu, tt, p) - c);
      if (f < bf) { bf = f; bu = uu; bt = tt; improved = true; }
    }
    if (!improved) h *= 0.5;
  }
  return { u: bu, t: bt, valErr: bf };
}

/** Polish every contour vertex onto cellSdf=c; split runs where a vertex can't reach the isolevel (crest crease). */
export function refineAndFilterContours(contours: Contour[], c: number, p: VoronoiFieldParams, valTol = 1e-4): { contours: Contour[]; dropped: number; kept: number } {
  const out: Contour[] = []; let dropped = 0, kept = 0;
  for (const cont of contours) {
    let run: Array<[number, number]> = [];
    for (const [u, t] of cont.pts) {
      const r = polishVertexToIso(u, t, c, p);
      if (r.valErr <= valTol) { run.push([r.u, r.t]); kept++; } else { dropped++; if (run.length >= 2) out.push({ pts: run }); run = []; }
    }
    if (run.length >= 2) out.push({ pts: run }); else if (run.length === 1) kept--;
  }
  return { contours: out, dropped, kept };
}

// ── arc-length decimation (3D) to a mesher-friendly picket ──────────────────────────────────────────────────────
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

/** Contours → kernel injectedPoints + constraintEdges (each polyline segment is a locked edge). */
export function contoursToConstraints(contours: Contour[]): { injectedPoints: number[]; constraintEdges: number[] } {
  const injectedPoints: number[] = []; const constraintEdges: number[] = [];
  for (const cont of contours) {
    const base = injectedPoints.length / 2;
    for (const [u, t] of cont.pts) injectedPoints.push(u, t);
    for (let i = 0; i < cont.pts.length - 1; i++) constraintEdges.push(base + i, base + i + 1);
  }
  return { injectedPoints, constraintEdges };
}

// ── 3D placement validation: verify a placed (u,t) sits at cellSdf=c to sub-tol in 3D (vs the SAMPLER field) ─────
export function isoResidual3D(u: number, t: number, c: number, p: VoronoiFieldParams, rA: AnalyticRadiusFn, H: number): { valErr: number; disp3D: number } {
  const valErr = Math.abs(cellSdf(u, t, p) - c);
  const lift = (uu: number, tt: number): [number, number, number] => { const th = TAU * uu, z = tt * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const [x0, y0, z0] = lift(u, t);
  const R = 0.012, N = 24;
  let bestF = Infinity, bu = u, bt = t;
  for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
    const uu = u + (R * i) / N, tt = Math.max(0, Math.min(1, t + (R * j) / N));
    const f = Math.abs(cellSdf(uu, tt, p) - c);
    if (f < bestF) { bestF = f; bu = uu; bt = tt; }
  }
  const [x1, y1, z1] = lift(bu, bt);
  return { valErr, disp3D: Math.hypot(x1 - x0, y1 - y0, z1 - z0) };
}

// ── POINT-FOLD PRE-CHECK (KILL-1): is the relief a one-sided RAMP (embeddable) or a two-sided FOLD (exclude)? ────
// For a single-valued radial height field r(u,t) there is NO occlusion (every (u,t)→one surface point), so the CK
// occlusion fold cannot occur analytically. The real question: across a cell boundary, is the relief profile a
// SMOOTH RAMP (web decays monotonically from crest to flat via smoothstep — Gyroid-embeddable) or a near-vertical
// STEP/CREASE whose chord is irreducible? We MEASURE the relief profile normal to the boundary at sampled crest
// points: sample r along the local ∇cellSdf direction on both sides and report (a) whether web is one-sided
// (monotone decay each side, single crest) vs two-sided-multivalued, (b) the max local slope |dr/ds| (the cliff
// steepness), (c) the crest-crease sharpness (angle of the web profile at the boundary).
export interface FoldProbe {
  u: number; t: number;        // a crest point (cellSdf≈0)
  rCrest: number;              // relief height at crest
  slopeLeft: number;          // max |dr/ds| moving into the left cell (mm relief / mm arc)
  slopeRight: number;         // max |dr/ds| moving into the right cell
  monotoneLeft: boolean;      // web decays monotonically left (one-sided)
  monotoneRight: boolean;     // web decays monotonically right
  crestAngleDeg: number;      // interior angle of the web(s) profile at the crest (180=flat, →0=sharp cusp)
}
