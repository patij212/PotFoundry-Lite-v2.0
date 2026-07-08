// _bwFieldLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-WEAVE-FEATURE-EDGE. BasketWeave is CLIFF-CLASS (§V11i: honest gap ~370,799 @0.633, slopeMed 33.6 —
// outliers ON the over-under weave WALLS). This lib derives those walls ANALYTICALLY (closed-form, no marching
// squares) from rOuterBasketWeave (src/geometry/styles.ts), and emits the DOUBLED flanking picket pair (the PROVEN
// Gyroid mechanism) as (u,t) constraint polylines for the conforming re-mesh.
//
// FIELD ANALYSIS (measured, banked): the relief h(u,t) is a per-cell over-under weave. At the cell BOUNDARIES the
// checker parity flips AND uLocal/vLocal jump ±1 ⇒ h STEPS ~2mm (radial). Those step lines are the C0 cliffs:
//   uTwisted = m  (integer m)  with uTwisted = u·strands + twist·t·strands + phase  → the VERTICAL walls
//   v        = k  (integer k)  with v        = t·layers·(1 + vGrad·(t-0.5))         → the HORIZONTAL walls
// (u here is the NORMALIZED azimuth u_norm=θ/2π; the style's internal `u`=u_norm·strands.) At default
// (strands 16, layers 10, twist 0, phase 0, vGrad 0) these are u_norm=m/16 and t=k/10 — a clean rectangular grid.
// With twist≠0 the vertical walls SLANT: u_norm(t) = (m - phase - twist·t·strands)/strands. With vGrad≠0 the
// horizontal walls shift: solve t·layers·(1+vGrad·(t-0.5)) = k (a quadratic in t).
//
// The cliff is a near-vertical STEP at the boundary line. The DOUBLED contour = a picket a small (u,t)-offset δ on
// EACH side of each boundary line, so the conforming mesher lands an edge on the plateau side (h≈1) and the floor
// side (h≈0); the facet spanning them IS the wall (chord-sag → chordTolMm lever, the expected on-wall residual).
//
// ISOLATION: NEW file. Imports labkit types + styles READ-ONLY. NO src/ edit.
import type { AnalyticRadiusFn } from './labkit';
import { rOuterBasketWeave } from '../../src/geometry/styles';
import { DEFAULT_BASKET_WEAVE } from '../../src/geometry/types';
import type { StyleOptions } from '../../src/geometry/types';

const TAU = 2 * Math.PI;

export interface BWParams {
  strands: number; layers: number; twist: number; phase: number; vGrad: number; depth: number;
}
export function bwParams(opts?: Partial<typeof DEFAULT_BASKET_WEAVE>): BWParams {
  const p = { ...DEFAULT_BASKET_WEAVE, ...(opts ?? {}) };
  return { strands: p.bwStrands, layers: p.bwLayers, twist: p.bwTwist, phase: p.bwPhase, vGrad: p.bwVerticalGrad, depth: p.bwDepth };
}

/** Live relief field h(u_norm,t) ∈ ~[-0.5,1] from rOuterBasketWeave. r = R0 + h·depth. */
export function bwReliefField(opts?: Partial<typeof DEFAULT_BASKET_WEAVE>): (u: number, t: number) => number {
  const p = { ...DEFAULT_BASKET_WEAVE, ...(opts ?? {}) };
  const O: StyleOptions = { ...p } as StyleOptions;
  const R0 = 40, H = 120;
  const depth = p.bwDepth;
  return (u: number, t: number): number => {
    const theta = (((u % 1) + 1) % 1) * TAU;
    const r = rOuterBasketWeave(theta, t * H, R0, H, O);
    return (r - R0) / Math.max(depth, 1e-6);
  };
}

export interface Contour { pts: Array<[number, number]>; }

// ── VERTICAL wall lines: uTwisted = m ⇒ u_norm = (m - phase - twist·t·strands)/strands, one polyline per m over t∈[0,1]
// sampled at nT points (t is the free coordinate). Returns the CENTRELINE polylines (one per m, unwrapped into [0,1)).
export function verticalWallLines(p: BWParams, nT = 200): Array<{ m: number; pts: Array<[number, number]> }> {
  const lines: Array<{ m: number; pts: Array<[number, number]> }> = [];
  // u_norm(m,t) may leave [0,1); we split each m-line into [0,1) segments as it wraps.
  for (let m = 0; m < p.strands; m++) {
    const runs: Array<Array<[number, number]>> = [[]];
    for (let j = 0; j <= nT; j++) {
      const t = j / nT;
      let u = (m - p.phase - p.twist * t * p.strands) / p.strands;
      u = ((u % 1) + 1) % 1;
      const run = runs[runs.length - 1];
      if (run.length > 0 && Math.abs(u - run[run.length - 1][0]) > 0.5) runs.push([]); // wrap → new segment
      runs[runs.length - 1].push([u, t]);
    }
    for (const r of runs) if (r.length >= 2) lines.push({ m, pts: r });
  }
  return lines;
}

// ── HORIZONTAL wall lines: v = k ⇒ t·layers·(1 + vGrad·(t-0.5)) = k. vGrad=0 ⇒ t=k/layers; else quadratic:
//   layers·vGrad·t² + layers·(1 - 0.5·vGrad)·t - k = 0. One horizontal polyline per interior k, sampled over u∈[0,1).
export function horizontalWallTs(p: BWParams): number[] {
  const ts: number[] = [];
  for (let k = 1; k < p.layers; k++) {
    let t: number;
    if (Math.abs(p.vGrad) < 1e-9) t = k / p.layers;
    else {
      const a = p.layers * p.vGrad, b = p.layers * (1 - 0.5 * p.vGrad), c = -k;
      const disc = b * b - 4 * a * c;
      if (disc < 0) continue;
      t = (-b + Math.sqrt(disc)) / (2 * a);
    }
    if (t > 2e-3 && t < 1 - 2e-3) ts.push(t);
  }
  return ts;
}
export function horizontalWallLines(p: BWParams, nU = 400): Array<{ k: number; t: number; pts: Array<[number, number]> }> {
  const lines: Array<{ k: number; t: number; pts: Array<[number, number]> }> = [];
  const ts = horizontalWallTs(p);
  ts.forEach((t, i) => {
    const pts: Array<[number, number]> = [];
    for (let j = 0; j <= nU; j++) pts.push([j / nU, t]);
    lines.push({ k: i + 1, t, pts });
  });
  return lines;
}

// ── DOUBLED PICKET generator ─────────────────────────────────────────────────────────────────────────────────────
// For each wall centreline, emit TWO offset polylines (± δ in the wall NORMAL direction). Vertical walls are ~const-u
// ⇒ offset in u; horizontal walls are ~const-t ⇒ offset in t. δ is chosen in (u,t) so the 3D offset ≈ offMm on the
// plateau/floor sides of the cliff (small — a fraction of the cell). We also decimate along the wall to a target 3D
// arc-length stepMm (fine picket; the Gyroid lesson — count-stable recovery needs a dense-ENOUGH but not over-dense
// picket). Returns the doubled contours (2× the walls).
export interface DoubledOpts { offU: number; offT: number; stepMm: number; }
export function bwDoubledPickets(
  p: BWParams, rA: AnalyticRadiusFn, H: number, opts: DoubledOpts,
): { contours: Contour[]; nVert: number; nHoriz: number } {
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const decimate = (pts: Array<[number, number]>): Array<[number, number]> => {
    if (pts.length < 2) return pts;
    const kept: Array<[number, number]> = [pts[0]];
    let [lx, ly, lz] = lift(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const [x, y, z] = lift(pts[i][0], pts[i][1]);
      if (Math.hypot(x - lx, y - ly, z - lz) >= opts.stepMm) { kept.push(pts[i]); lx = x; ly = y; lz = z; }
    }
    kept.push(pts[pts.length - 1]);
    return kept;
  };
  const out: Contour[] = [];
  const vlines = verticalWallLines(p);
  let nVert = 0;
  for (const L of vlines) {
    for (const s of [-1, 1] as const) {
      const off = L.pts.map(([u, t]) => [((u + s * opts.offU) % 1 + 1) % 1, t] as [number, number]);
      const dec = decimate(off);
      if (dec.length >= 2) { out.push({ pts: dec }); nVert++; }
    }
  }
  const hlines = horizontalWallLines(p);
  let nHoriz = 0;
  for (const L of hlines) {
    for (const s of [-1, 1] as const) {
      const tt = Math.min(1 - 1e-4, Math.max(1e-4, L.t + s * opts.offT));
      const off = L.pts.map(([u]) => [u, tt] as [number, number]);
      const dec = decimate(off);
      if (dec.length >= 2) { out.push({ pts: dec }); nHoriz++; }
    }
  }
  return { contours: out, nVert, nHoriz };
}

// SINGLE-midline variant (for the A/B that PROVES doubled is required — Gyroid showed single is CATASTROPHIC).
export function bwSinglePickets(
  p: BWParams, rA: AnalyticRadiusFn, H: number, stepMm: number,
): { contours: Contour[] } {
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const decimate = (pts: Array<[number, number]>): Array<[number, number]> => {
    if (pts.length < 2) return pts;
    const kept: Array<[number, number]> = [pts[0]]; let [lx, ly, lz] = lift(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const [x, y, z] = lift(pts[i][0], pts[i][1]); if (Math.hypot(x - lx, y - ly, z - lz) >= stepMm) { kept.push(pts[i]); lx = x; ly = y; lz = z; } }
    kept.push(pts[pts.length - 1]); return kept;
  };
  const out: Contour[] = [];
  for (const L of verticalWallLines(p)) { const d = decimate(L.pts); if (d.length >= 2) out.push({ pts: d }); }
  for (const L of horizontalWallLines(p)) { const d = decimate(L.pts); if (d.length >= 2) out.push({ pts: d }); }
  return { contours: out };
}

// ── placement validation: for each picket vertex, measure the 3D distance to the TRUE cliff line it flanks ──────────
// The cliff LINE is exact-analytic (u_norm=m/16 vertical, t=k/10 horizontal at default). A picket at boundary±δ should
// sit at 3D distance ≈ the intended offMm from the cliff. We report the (u,t)-to-nearest-cliff 3D distance so the
// overlay confirms the pickets straddle the wall by the intended amount (NOT sub-0.01 to the cliff — they're OFFSET;
// the sub-0.01 validation is that the CENTRELINE sits on the cliff, checked separately by centrelineOnCliff).
export function centrelineOnCliff(
  p: BWParams, rA: AnalyticRadiusFn, H: number, nSample = 50,
): { maxStepJump: number; nWalls: number } {
  // sample just ±ε across each vertical centreline: the relief must JUMP (C0 step) there → confirms the line is the cliff.
  const h = bwReliefField();
  let maxJump = 0; let nWalls = 0;
  const vlines = verticalWallLines(p);
  for (const L of vlines) {
    nWalls++;
    for (let s = 0; s < nSample; s++) {
      const [u, t] = L.pts[Math.floor((s / nSample) * L.pts.length)];
      const jump = Math.abs(h(u + 5e-4, t) - h(u - 5e-4, t));
      if (jump > maxJump) maxJump = jump;
    }
  }
  for (const L of horizontalWallLines(p)) {
    nWalls++;
    for (let s = 0; s < nSample; s++) {
      const u = s / nSample;
      const jump = Math.abs(h(u, L.t + 5e-4) - h(u, L.t - 5e-4));
      if (jump > maxJump) maxJump = jump;
    }
  }
  return { maxStepJump: maxJump, nWalls };
}

// ── polylines → injectedPoints + constraintEdges (kernel constraint format) ──────────────────────────────────────
export function contoursToConstraints(contours: Contour[]): { injectedPoints: number[]; constraintEdges: number[] } {
  const injectedPoints: number[] = []; const constraintEdges: number[] = [];
  for (const cont of contours) {
    const base = injectedPoints.length / 2;
    for (const [u, t] of cont.pts) injectedPoints.push(u, t);
    for (let i = 0; i < cont.pts.length - 1; i++) constraintEdges.push(base + i, base + i + 1);
  }
  return { injectedPoints, constraintEdges };
}
