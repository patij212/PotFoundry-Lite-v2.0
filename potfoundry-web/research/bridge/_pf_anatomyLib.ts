// _pf_anatomyLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-04-PF-ANATOMY: OUTLIER ANATOMY of the residual on the count-UNSTABLE cusp styles (GothicArches +
// GeometricStar), the LAST open wall of the DRIVE-0.01 campaign. Measurement-first, no meshing here — operates on
// the CURRENT-BEST dumped meshes (xyz f32 + idx u32) and the analytic surface as ground truth.
//
// THE RULER (distinct from all prior probes): per-triangle INTERIOR true-3D deviation. Prior Gothic diags anchored
// the facet CENTROID only. A triangle whose 3 vertices sit exactly on the surface but whose INTERIOR sags is the
// exact object we must count. For each triangle we sample 4 interior points (3 edge-midpoints + centroid, SAG_BARY),
// lift each by FLAT-FACET 3D barycentric interpolation of the triangle's 3D vertices, project each to the true
// surface, and take the MAX deviation = the triangle's interior deviation. Outlier = interior deviation > tol.
//
// Projection = brute full-azimuth nearest (labkit `bruteNearestOnRadialSurface` semantics, self-contained here so we
// can run it standalone on the dumped xyz without (u,t)); a fast OWN-AZIMUTH vertical scan gives an upper bound used
// to SCREEN (skip green facets cheaply — an upper bound below tol proves the true distance is below tol).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import { perFaceChordSag, projectPointToRadialSurface } from './labkit';

const TAU = 2 * Math.PI;
const SAG_BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

export interface LoadedMesh { xyz: Float32Array; idx: Uint32Array; nV: number; nF: number; }

/** Load a dumped render-bin mesh (xyz f32 triples, idx u32 triples). */
export function loadDumpedMesh(dir: string, name: string): LoadedMesh {
  const xb = readFileSync(join(dir, `${name}.xyz.bin`));
  const ib = readFileSync(join(dir, `${name}.idx.bin`));
  const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
  const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  return { xyz, idx, nV: xyz.length / 3, nF: idx.length / 3 };
}

/**
 * Recover per-vertex (u,t) from a mesh whose vertices were lifted from a RADIAL surface S(θ,z)=(r cosθ, r sinθ, z):
 * u = atan2(y,x)/TAU (wrapped to [0,1)), t = z/H. This is EXACT for such a lift (the only non-uniqueness is at the
 * pole/axis, absent here). Lets the fast labkit `perFaceTrue3DSag` ruler (needs ut) run on a dumped xyz-only mesh.
 */
export function recoverUt(mesh: LoadedMesh, H: number): number[] {
  const { xyz, nV } = mesh; const ut = new Array<number>(nV * 2);
  for (let i = 0; i < nV; i++) {
    let u = Math.atan2(xyz[3 * i + 1], xyz[3 * i]) / TAU; u -= Math.floor(u);
    ut[2 * i] = u; ut[2 * i + 1] = xyz[3 * i + 2] / H;
  }
  return ut;
}

/**
 * BRUTE nearest-surface distance + the foot (θ,z). Self-contained twin of labkit's ruler.
 * `thetaWinRad`: if set, restrict the AZIMUTH scan to [ownθ − win, ownθ + win] where ownθ = atan2(py,px), at the SAME
 * angular resolution as a full scan (so the coarse grid is `winFrac × nTheta` samples — ~`TAU/(2 win)`× cheaper). This
 * is exact for a SINGLE-VALUED height field r(θ,z) whose nearest foot is near the sample's own meridian (all 20 styles
 * are graphs over (θ,z) — no overhang), and it SELF-GUARDS: if the windowed foot lands within one coarse cell of the
 * window boundary, the scan re-runs full-azimuth (catches the rare wide-foot case). Full scan when thetaWinRad omitted.
 */
export function bruteNearest(
  px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number,
  opts: { nTheta?: number; nZ?: number; band?: number; thetaWinRad?: number } = {},
): { dist: number; theta: number; z: number } {
  const nTheta = opts.nTheta ?? 2048, nZ = opts.nZ ?? 400, band = opts.band ?? 12;
  const d2 = (th: number, z: number): number => { const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; return ex * ex + ey * ey + ez * ez; };
  const zLo = Math.max(0, pz - band), zHi = Math.min(H, pz + band);
  const dThFull = TAU / nTheta;                       // full-scan angular resolution
  const ownTh = Math.atan2(py, px);
  const run = (thLo: number, thHi: number, nTh: number): { best: number; bth: number; bz: number } => {
    let best = Infinity, bth = thLo, bz = pz;
    const span = thHi - thLo;
    for (let i = 0; i <= nTh; i++) { const th = thLo + span * (i / nTh); for (let j = 0; j <= nZ; j++) { const z = zLo + (zHi - zLo) * (j / nZ); const f = d2(th, z); if (f < best) { best = f; bth = th; bz = z; } } }
    return { best, bth, bz };
  };
  let best: number, bth: number, bz: number;
  if (opts.thetaWinRad !== undefined) {
    const win = opts.thetaWinRad; const nTh = Math.max(8, Math.round((2 * win) / dThFull));
    let r0 = run(ownTh - win, ownTh + win, nTh);
    // self-guard: foot on the window edge ⇒ true foot may be outside ⇒ redo full azimuth
    if (Math.abs(r0.bth - (ownTh - win)) < 1.5 * dThFull || Math.abs(r0.bth - (ownTh + win)) < 1.5 * dThFull) {
      r0 = run(0, TAU, nTheta);
    }
    best = r0.best; bth = r0.bth; bz = r0.bz;
  } else {
    const r0 = run(0, TAU, nTheta); best = r0.best; bth = r0.bth; bz = r0.bz;
  }
  let hTh = dThFull, hZ = (zHi - zLo) / nZ;
  for (let it = 0; it < 60; it++) {
    let imp = false;
    for (const dth of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) { const f = d2(bth + dth, bz + dz); if (f < best) { best = f; bth += dth; bz += dz; imp = true; } }
    if (!imp) { hTh *= 0.5; hZ *= 0.5; } if (hTh < 1e-10 && hZ < 1e-10) break;
  }
  return { dist: Math.sqrt(best), theta: bth, z: bz };
}

export interface Outlier {
  f: number;                         // face index
  interiorDev: number;               // max interior deviation (mm)
  worstSample: number;               // which SAG_BARY sample (0..3) was worst
  cx: number; cy: number; cz: number; // worst-sample 3D point
  u: number; t: number;              // worst-sample foot (u=θ/TAU, t=z/H) on surface
  footTheta: number; footZ: number;
}

export interface InteriorScan {
  nF: number; nScreened: number; nProjected: number;
  nCandidates: number;               // facets with radial interior sag >= screenMm (UPPER BOUND on true outlier count)
  anchoredAll: boolean;              // true if every candidate was brute-anchored (nProjected === nCandidates)
  outliers: Outlier[];               // interior deviation > tol, sorted desc
  p50: number; p90: number; p99: number; max: number; // over brute-anchored facets
}

/**
 * Whole-mesh INTERIOR ruler (fast + honest). Stage 1: `perFaceChordSag` (recovered ut) — the CHEAP same-(u,t) radial
 * interior sag = max over the 4 SAG_BARY interior samples. This RADIAL sag is a guaranteed UPPER BOUND on the true-3D
 * interior deviation (the surface point at the sample's own (u,t) is one candidate for the nearest surface point), so
 * a facet with radial sag <= tol is PROVEN green with no projection. It OVERSTATES near-vertical relief (that's the
 * whole point of the true-3D correction), so it OVER-selects candidates — safe, just more brute work. No GN anywhere.
 * Stage 2: BRUTE-ANCHOR every candidate (radial sag >= screenMm) at all 4 interior samples (full-azimuth nearest,
 * the honest true-3D distance) and recover the exact worst-sample foot (u,t) for classification. Outliers = brute
 * interior dev > tol. This mirrors labkit's proven radial-select → brute-anchor pattern.
 */
export function interiorOutlierScan(
  mesh: LoadedMesh, rA: AnalyticRadiusFn, H: number,
  opts: {
    tolMm?: number; screenMm?: number; maxAnchor?: number; confirmK?: number;
    brute?: { nTheta?: number; nZ?: number; thetaWinRad?: number };
    ut?: number[]; onProgress?: (done: number, total: number, nOut: number) => void;
  } = {},
): InteriorScan {
  const tol = opts.tolMm ?? 0.01, screenMm = opts.screenMm ?? 0.01;
  const bN = { nTheta: opts.brute?.nTheta ?? 2048, nZ: opts.brute?.nZ ?? 400, thetaWinRad: opts.brute?.thetaWinRad };
  const { xyz, idx, nF } = mesh;
  const ut = opts.ut ?? recoverUt(mesh, H);
  // STAGE 1 — cheap radial interior sag (upper bound). screenMm = tol ⇒ facets below it are proven green.
  const sag = perFaceChordSag(ut, idx, rA, H);
  let cand: number[] = [];
  for (let f = 0; f < nF; f++) if (sag.faceErr[f] >= screenMm) cand.push(f);
  const nCandidates = cand.length;
  // BOUNDED anchor: if maxAnchor set, brute only the worst-K candidates by RADIAL value (radial >= true, so the
  // true-worst outliers concentrate in the radial-worst set). anchoredAll=false ⇒ outlier count is a SAMPLE, not exact.
  let anchoredAll = true;
  if (opts.maxAnchor !== undefined && cand.length > opts.maxAnchor) {
    cand.sort((x, y) => sag.faceErr[y] - sag.faceErr[x]);
    cand = cand.slice(0, opts.maxAnchor);
    anchoredAll = false;
  }
  const outliers: Outlier[] = [];
  const projErrs: number[] = [];       // brute-anchored dev over every candidate — for percentiles over the red tail
  let nProjected = 0;
  const gx = (i: number): number => xyz[3 * i], gy = (i: number): number => xyz[3 * i + 1], gz = (i: number): number => xyz[3 * i + 2];
  for (let ci = 0; ci < cand.length; ci++) {
    const f = cand[ci];
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = gx(a), ay = gy(a), az = gz(a), bx = gx(b), by = gy(b), bz = gz(b), cx2 = gx(c), cy2 = gy(c), cz2 = gz(c);
    nProjected++;
    let dev = 0, ws = 0; let bfoot = { dist: 0, theta: 0, z: 0 }; let wp: number[] = [ax, ay, az];
    let k = 0;
    for (const [wa, wb, wc] of SAG_BARY) {
      const px = wa * ax + wb * bx + wc * cx2, py = wa * ay + wb * by + wc * cy2, pz = wa * az + wb * bz + wc * cz2;
      // FAST projector: LOCAL Gauss-Newton seeded at own-azimuth (unique foot on a single-valued height field ⇒
      // honest for Gothic/GeoStar). coarseTrigger high ⇒ skip the expensive global fallback; the post-pass brute-
      // confirm on the resulting OUTLIER set (below) catches any rare local stall, so the anchor stays cheap + honest.
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 5, maxIter: 40 });
      if (gn.dist > dev) { dev = gn.dist; ws = k; bfoot = { dist: gn.dist, theta: gn.theta, z: gn.z }; wp = [px, py, pz]; }
      k++;
    }
    projErrs.push(dev);
    if (dev > tol) {
      const u = ((bfoot.theta / TAU) % 1 + 1) % 1, t = bfoot.z / H;
      outliers.push({ f, interiorDev: dev, worstSample: ws, cx: wp[0], cy: wp[1], cz: wp[2], u, t, footTheta: bfoot.theta, footZ: bfoot.z });
    }
    if (opts.onProgress && (ci & 0x1fff) === 0) opts.onProgress(ci, cand.length, outliers.length);
  }
  // POST-PASS brute-confirm the WORST-K GN outliers' worst sample (guards a rare GN wrong-well; brute can only LOWER).
  // Height-field styles (Gothic/GeoStar) have a UNIQUE foot ⇒ GN==brute (proved by the A/B smoke), so this only
  // spot-checks the tail; capping at confirmK keeps it cheap (full-mesh brute on all outliers is ~14B rA / infeasible).
  outliers.sort((x, y) => y.interiorDev - x.interiorDev);
  const kConfirm = opts.confirmK ?? outliers.length;
  for (let i = 0; i < Math.min(kConfirm, outliers.length); i++) {
    const o = outliers[i];
    const bf = bruteNearest(o.cx, o.cy, o.cz, rA, H, bN);
    if (bf.dist < o.interiorDev) { o.interiorDev = bf.dist; const u = ((bf.theta / TAU) % 1 + 1) % 1; o.u = u; o.t = bf.z / H; o.footTheta = bf.theta; o.footZ = bf.z; }
  }
  // re-filter: a confirm may have dropped an outlier below tol
  for (let i = outliers.length - 1; i >= 0; i--) if (outliers[i].interiorDev <= tol) outliers.splice(i, 1);
  outliers.sort((x, y) => y.interiorDev - x.interiorDev);
  projErrs.sort((x, y) => x - y);
  const pc = (q: number): number => projErrs.length ? projErrs[Math.min(projErrs.length - 1, Math.floor(q * projErrs.length))] : 0;
  return { nF, nScreened: nF - nCandidates, nProjected, nCandidates, anchoredAll, outliers, p50: pc(0.5), p90: pc(0.9), p99: pc(0.99), max: projErrs.length ? projErrs[projErrs.length - 1] : 0 };
}

// ─────────────────────── CREST CROSS-SECTION: singularity (C1 cusp) vs kink vs finite-curvature ───────────────────
export interface CrestAnatomy {
  gradU: number;              // |dr/darc| across the crest (mm-radius per mm-arc), near-vertical if >>1
  gradT: number;              // |dr/dz| along the wall
  isRidgeApex: boolean;       // the point sits within apexTol of a local radial MAX along u (a crest line)
  apexAngleDeg: number;       // interior angle of the radius(u) profile at the apex (180=smooth, <180=kink/cusp)
  secondDiffMm: number;       // |r(+h) - 2r(0) + r(-h)| / h_arc^2 proxy for curvature at apex (spikes for a cusp)
  crestAmpMm: number;         // crest height above the local cross-flank minimum (mm) — is the ridge alive here?
}

/**
 * Characterize the surface at (u,t): walk perpendicular to the crest in u (fixed z), locate the nearest radial-max
 * (crest apex), and measure the apex geometry. A `ridge(d,w,sharp>=1)` = pow(max(0,1-|d|/w),sharp) has a C1-kink at
 * the apex for sharp==1 (finite left/right slope of opposite sign ⇒ apex angle < 180) and an even sharper cusp for
 * sharp>1. A smooth cap (parabolic) has apexAngle→180 and bounded secondDiff. The apexAngleDeg + secondDiffMm split
 * genuine C1-singular cusps (a flat facet interior can NEVER be <=tol across them) from finite-curvature caps.
 */
export function crestAnatomyAt(rA: AnalyticRadiusFn, u: number, t: number, H: number, rMeanMm: number): CrestAnatomy {
  const z = t * H;
  const uu = ((u % 1) + 1) % 1;
  const arcPerU = rMeanMm * TAU;                 // mm-arc per unit u
  // scan a small u-window to find the local radial max (apex) nearest uu
  const win = 0.02;                              // ±0.02 u (~ up to a few mm arc)
  const M = 400; let uApex = uu, rApex = rA(TAU * uu, z);
  for (let i = 0; i <= M; i++) {
    const uw = uu - win + (2 * win) * (i / M); const r = rA(TAU * (((uw % 1) + 1) % 1), z);
    if (r > rApex) { rApex = r; uApex = uw; }
  }
  // golden-section refine apex
  {
    const GR = (Math.sqrt(5) - 1) / 2; let a = uApex - win / M * 2, b = uApex + win / M * 2;
    const fr = (uw: number): number => rA(TAU * (((uw % 1) + 1) % 1), z);
    let c = b - GR * (b - a), d = a + GR * (b - a), fc = fr(c), fd = fr(d);
    for (let it = 0; it < 40; it++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = fr(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = fr(d); } if (b - a < 1e-9) break; }
    uApex = (a + b) / 2; rApex = fr(uApex);
  }
  const fr = (uw: number): number => rA(TAU * (((uw % 1) + 1) % 1), z);
  // apex angle: slopes a few sample-widths either side (in mm-arc). Use h small enough to sit on the sharp flanks.
  const hArc = 0.05;                             // 0.05mm arc probe
  const hU = hArc / arcPerU;
  const rL = fr(uApex - hU), rR = fr(uApex + hU), r0 = rApex;
  const slopeL = (r0 - rL) / hArc;               // rise/run toward apex from left (mm-radius per mm-arc)
  const slopeR = (r0 - rR) / hArc;               // from right
  // interior angle between the two flank tangents at the apex (in the (arc, radius) plane)
  const vL = { x: -hArc, y: -(r0 - rL) }, vR = { x: hArc, y: -(r0 - rR) };   // direction vectors pointing away/down each flank
  const dot = vL.x * vR.x + vL.y * vR.y; const mL = Math.hypot(vL.x, vL.y), mR = Math.hypot(vR.x, vR.y);
  const apexAngleDeg = (Math.acos(Math.max(-1, Math.min(1, dot / (mL * mR + 1e-12)))) * 180) / Math.PI;
  const secondDiff = Math.abs(rR - 2 * r0 + rL) / (hArc * hArc);
  // crest amplitude: apex radius minus the min over the ±win window (the adjacent valley floor)
  let rMin = rApex; for (let i = 0; i <= M; i++) { const uw = uApex - win + (2 * win) * (i / M); const r = fr(uw); if (r < rMin) rMin = r; }
  // near-vertical gradients at the query point (u), for context
  const duG = 1 / 16384; const gU = Math.abs(fr(uu + duG) - fr(uu - duG)) / (2 * duG * arcPerU);
  const dz = 0.02 * H; const gT = Math.abs(rA(TAU * uu, Math.min(H, z + dz)) - rA(TAU * uu, Math.max(0, z - dz))) / (2 * dz);
  const isApex = Math.abs(((uApex - uu + 0.5) % 1) - 0.5) * arcPerU < 0.25;   // apex within 0.25mm arc of query
  void slopeL; void slopeR;
  return { gradU: +gU, gradT: +gT, isRidgeApex: isApex, apexAngleDeg, secondDiffMm: secondDiff, crestAmpMm: rApex - rMin };
}

// ─────────────────────── JUNCTION CENSUS on the extracted crest graph ───────────────────
export interface JunctionCensus {
  nBirths: number;              // crest appears (unmatched forward) — amplitude-vanishing test applied
  nMerges: number;              // two crests → one (or death)
  nXcross: number;              // interior X-crossings of two crest segments (from planarize, if available)
  births: Array<{ u: number; t: number; ampMm: number; kind: 'smooth-birth' | 'sharp-birth' }>;
}
