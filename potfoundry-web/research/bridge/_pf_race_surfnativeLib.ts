// _pf_race_surfnativeLib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// SURFACE-NATIVE (restricted-Delaunay / protected-1-feature) SINGLE-CUSP PROXY for the Gothic frontier target.
//
// THE MECHANISM UNDER TEST (cheapest proxy of Boissonnat-Oudot restricted Del|_S + CDRR protected crest 1-feature):
// the load-bearing assumption broken vs all 6 winning primitives AND all 5 refuted levers is that the mesh element
// lives in the (u,t) chart and is LIFTED. The GF-GOTHIC floor (0.080, flank-pitch-INVARIANT) IS the flat-facet
// crest->valley BRIDGE CHORD: a flat triangle whose vertices are exact on S still cuts the corner of the convex ridge.
// Surface-native meshing never forms that bridging segment: the crest is a PROTECTED 1-feature (a polyline of points
// sampled ON the apex ridge) and every facet edge that would bridge the ridge is FORBIDDEN because its dual Voronoi
// facet does not restrict to S there => two triangles MEET AT the apex sharing the crest edge; no interior straddles it.
//
// THE PROXY (no CGAL install, ~1 window): a SINGLE Gothic rib-crest cusp window in (u,t). We build TWO meshes on the
// SAME window at the SAME node budget and score them with the SAME interior ruler:
//   BEFORE = flat-UV: uniform (u,t) triangulation; triangles freely straddle the apex (reproduces the 0.080 floor).
//   AFTER  = surface-native (no-bridge): split the window ALONG the crest ridge polyline (K protected nodes on S);
//            mesh each flank as its own strip; the crest polyline is a chain of SHARED mesh edges by construction.
// Sweep K (crest node density) x1/x2/x4 and measure the interior-deviation slope — the decisive discriminator
// (flat-UV: flat/floored; surface-native: strictly negative if the mechanism works).

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import { bruteNearestOnRadialSurface } from './labkit';

const TAU = 2 * Math.PI;

/**
 * FAST LOCAL nearest-surface distance for a SINGLE-CUSP radial patch. On one Gothic cusp the surface S(θ,z)=r(θ,z)
 * is a single-valued graph over a TINY (θ,z) box (no tangled-lattice multi-sheet ambiguity), so the nearest foot
 * lives in a small window around the query point's OWN (θ,z). We seed at (θP, zP)=atan2 of P + pz, then do a coarse
 * local grid + box-refine over a +/-band. Validated against the full-azimuth `bruteNearestOnRadialSurface` on a
 * sample of points (see calibrate() in the test) — it must AGREE, else fall back to brute. ~1000x cheaper.
 */
export function localNearestOnRadialSurface(
  px: number, py: number, pz: number, rA: AnalyticRadiusFn, H: number,
  opts: { thBandRad?: number; zBandMm?: number; nTh?: number; nZ?: number; refineIters?: number } = {},
): number {
  // thBand must span >= a full bay each side (bay ~0.087 rad on this cusp) so the nearest foot on the panel / adjacent
  // flank is not missed — a ±0.06 band OVERSTATED by 0.019mm vs brute (E-2026-07-04 calibration). ±0.35 rad = ~4 bays.
  const thBand = opts.thBandRad ?? 0.35, zBand = opts.zBandMm ?? 4;
  const nTh = opts.nTh ?? 700, nZ = opts.nZ ?? 200, refineIters = opts.refineIters ?? 60;
  const thP = Math.atan2(py, px);
  const d2 = (th: number, z: number): number => { const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; return ex * ex + ey * ey + ez * ez; };
  const zLo = Math.max(0, pz - zBand), zHi = Math.min(H, pz + zBand);
  let best = Infinity, bth = thP, bz = pz;
  for (let i = 0; i <= nTh; i++) {
    const th = thP - thBand + 2 * thBand * (i / nTh);
    for (let j = 0; j <= nZ; j++) { const z = zLo + (zHi - zLo) * (j / nZ); const f = d2(th, z); if (f < best) { best = f; bth = th; bz = z; } }
  }
  let hTh = 2 * thBand / nTh, hZ = (zHi - zLo) / nZ;
  for (let it = 0; it < refineIters; it++) {
    let improved = false;
    for (const dth of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) { const f = d2(bth + dth, bz + dz); if (f < best) { best = f; bth += dth; bz += dz; improved = true; } }
    if (!improved) { hTh *= 0.5; hZ *= 0.5; }
    if (hTh < 1e-11 && hZ < 1e-11) break;
  }
  return Math.sqrt(best);
}

export interface CuspWindow {
  /** apex u (crest location). */ uApex: number;
  /** window half-width in u (both u-flanks, to the valley). */ halfDu: number;
  /** t-band [t0,t1] of the window (a short axial strip of the rib). */ t0: number; t1: number;
  /** mean radius for arc<->u. */ rMean: number; H: number;
}

/** golden-section refine of the crest u at fixed t. */
export function refineCrestU(rA: AnalyticRadiusFn, uSeed: number, t: number, win: number, H: number): number {
  const z = t * H; const GR = (Math.sqrt(5) - 1) / 2;
  let a = uSeed - win, b = uSeed + win;
  const f = (u: number): number => rA(TAU * (u - Math.floor(u)), z);
  let c = b - GR * (b - a), d = a + GR * (b - a); let fc = f(c), fd = f(d);
  for (let i = 0; i < 60; i++) { if (fc > fd) { b = d; d = c; fd = fc; c = b - GR * (b - a); fc = f(c); } else { a = c; c = d; fc = fd; d = a + GR * (b - a); fd = f(d); } if (b - a < 1e-9) break; }
  return (a + b) / 2;
}

/** Find the sharpest crest (max apex curvature) in a t-row, return its u. Representative worst cusp. */
export function findSharpestCrest(rA: AnalyticRadiusFn, t: number, H: number, rMean: number): { uApex: number; nCrests: number } {
  const z = t * H; const N = 8192; const rad = new Float64Array(N);
  for (let i = 0; i < N; i++) rad[i] = rA(TAU * (i / N), z);
  let bestU = 0, bestCurv = -1, nCrests = 0;
  for (let i = 0; i < N; i++) {
    const rp = rad[(i - 1 + N) % N], rc = rad[i], rn = rad[(i + 1) % N];
    if (!(rc > rp && rc >= rn)) continue; nCrests++;
    const u = refineCrestU(rA, i / N, t, 1.5 / N, H);
    const du = 0.5 / N; const arc = du * TAU * rMean;
    const rC = rA(TAU * (u - Math.floor(u)), z);
    const rL = rA(TAU * ((u - du) - Math.floor(u - du)), z), rR = rA(TAU * ((u + du) - Math.floor(u + du)), z);
    const curv = Math.abs(rL - 2 * rC + rR) / (arc * arc);
    if (curv > bestCurv) { bestCurv = curv; bestU = u; }
  }
  return { uApex: bestU, nCrests };
}

/**
 * Calibrate the fast local ruler against the trusted full-azimuth brute on a set of flat-facet interior points from
 * `mesh`. Returns the worst |local-brute| disagreement (mm) and the pair at the worst. If maxAbsDiff is tiny the fast
 * ruler is trusted for the whole sweep. Samples every `stride`-th facet centroid + edge-mids.
 */
export function calibrateRuler(
  rA: AnalyticRadiusFn, mesh: Mesh2D, H: number, stride: number,
): { nChecked: number; maxAbsDiff: number; meanAbsDiff: number; localAtWorst: number; bruteAtWorst: number } {
  const { verts, tris } = mesh;
  const nV = verts.length / 2; const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, verts[2 * i], verts[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const bary: Array<[number, number, number]> = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5]];
  let maxD = 0, sum = 0, n = 0, lw = 0, bw = 0;
  const nF = tris.length / 3;
  for (let f = 0; f < nF; f += stride) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    for (const [wa, wb, wc] of bary) {
      const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
      const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
      const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
      const loc = localNearestOnRadialSurface(px, py, pz, rA, H);
      const br = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 4096, nZ: 600, zBandMm: 6, refineIters: 60 }).dist;
      const d = Math.abs(loc - br); if (d > maxD) { maxD = d; lw = loc; bw = br; } sum += d; n++;
    }
  }
  return { nChecked: n, maxAbsDiff: maxD, meanAbsDiff: n ? sum / n : 0, localAtWorst: lw, bruteAtWorst: bw };
}

/** Lift a (u,t) to 3D on S. */
export function lift(rA: AnalyticRadiusFn, u: number, t: number, H: number): [number, number, number] {
  const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

export interface Mesh2D { verts: number[]; /* (u,t) pairs */ tris: number[]; /* index triples */ }

/**
 * BEFORE — flat-UV uniform triangulation of the cusp window. A regular (nU+1) x (nT+1) grid over
 * [uApex-halfDu, uApex+halfDu] x [t0,t1], split into 2 tris per cell. Triangles STRADDLE the apex column freely
 * (the apex u is not necessarily a grid line, and even if it is, cells span it). nU is the u-resolution (drives the
 * total node count so BEFORE/AFTER can be matched at equal budget).
 */
export function buildFlatUvGrid(win: CuspWindow, nU: number, nT: number): Mesh2D {
  const { uApex, halfDu, t0, t1 } = win;
  const verts: number[] = []; const tris: number[] = [];
  const idx = (i: number, j: number): number => j * (nU + 1) + i;
  for (let j = 0; j <= nT; j++) {
    const t = t0 + (t1 - t0) * (j / nT);
    for (let i = 0; i <= nU; i++) { const u = uApex - halfDu + 2 * halfDu * (i / nU); verts.push(u, t); }
  }
  for (let j = 0; j < nT; j++) for (let i = 0; i < nU; i++) {
    const a = idx(i, j), b = idx(i + 1, j), c = idx(i, j + 1), d = idx(i + 1, j + 1);
    tris.push(a, b, d, a, d, c);
  }
  return { verts, tris };
}

/**
 * AFTER — surface-native no-bridge mesh. The crest ridge is a PROTECTED 1-feature: K nodes sampled ON the apex ridge
 * (crest u recovered per t-row so the polyline hugs the true apex). The window is split into TWO flank strips (u<apex,
 * u>apex); each flank is meshed as its own (nFlank x K) grid whose apex column IS the shared crest polyline. Result:
 * every triangle lies on ONE flank; the crest polyline is a chain of shared mesh edges (edge between two crest nodes).
 * No triangle interior straddles the apex. nFlank = u-resolution per flank; K = crest node count (the swept lever).
 */
export function buildSurfaceNativeNoBridge(
  rA: AnalyticRadiusFn, win: CuspWindow, nFlank: number, K: number,
): Mesh2D {
  const { uApex, halfDu, t0, t1, H } = win;
  const verts: number[] = []; const tris: number[] = [];
  // crest polyline: K rows in t, apex u recovered per row (hugs the true ridge)
  const crestIdx: number[] = [];
  const crestU: number[] = [];
  for (let k = 0; k < K; k++) {
    const t = t0 + (t1 - t0) * (k / (K - 1));
    const uc = refineCrestU(rA, uApex, t, halfDu * 0.5, H);
    crestU.push(uc); crestIdx.push(verts.length / 2); verts.push(uc, t);
  }
  // LEFT flank strip: columns from valley (u=apex-halfDu) toward crest. nFlank interior columns + crest column.
  // RIGHT flank strip: crest column toward valley (u=apex+halfDu).
  // Each flank meshed on K rows (matching the crest row density in t) so its apex edge is exactly the crest polyline.
  const buildFlank = (dir: 1 | -1): void => {
    // grid: (nFlank+1) columns x K rows; column nFlank == crest (reuse crestIdx), columns 0..nFlank-1 = flank interior->near-crest
    const colIdx: number[][] = []; // colIdx[c][k]
    for (let c = 0; c <= nFlank; c++) {
      const col: number[] = [];
      for (let k = 0; k < K; k++) {
        const t = t0 + (t1 - t0) * (k / (K - 1));
        if (c === nFlank) { col.push(crestIdx[k]); continue; } // shared crest column
        // u marches from valley (c=0) to just-before-crest (c=nFlank-1); crest u varies per row (hug)
        const uc = crestU[k];
        const uValley = uApex + dir * halfDu;
        const frac = c / nFlank; // 0 at valley, ->1 at crest
        const u = uValley + (uc - uValley) * frac;
        col.push(verts.length / 2); verts.push(u, t);
      }
      colIdx.push(col);
    }
    for (let c = 0; c < nFlank; c++) for (let k = 0; k < K - 1; k++) {
      const a = colIdx[c][k], b = colIdx[c + 1][k], cc = colIdx[c][k + 1], d = colIdx[c + 1][k + 1];
      // consistent winding (orientation not scored here; interior ruler is orientation-free)
      tris.push(a, b, d, a, d, cc);
    }
  };
  buildFlank(1); buildFlank(-1);
  return { verts, tris, };
}

/**
 * AFTER-GRADED — surface-native no-bridge with ARC-LENGTH-GRADED flank columns. Identical topology to
 * buildSurfaceNativeNoBridge, but the nFlank flank columns are placed by EQUALIZING the 3D arc length along the flank
 * cross-section r(u) at each row (so columns cluster where the flank is near-vertical/steep, near the crest) instead
 * of uniformly in u-fraction. This is the cheapest proxy of the restricted-Delaunay FACET-INTERIOR criterion (insert
 * on-S Steiner points until every facet's interior < tol): it puts the density exactly where the flat-chord bridges
 * the curved flank. Tests whether ADAPTIVE near-crest density crosses 0.012 (the uniform strip floored at ~0.06).
 */
export function buildSurfaceNativeGraded(
  rA: AnalyticRadiusFn, win: CuspWindow, nFlank: number, K: number,
): Mesh2D {
  const { uApex, halfDu, t0, t1, H } = win;
  const verts: number[] = []; const tris: number[] = [];
  const crestIdx: number[] = []; const crestU: number[] = [];
  for (let k = 0; k < K; k++) {
    const t = t0 + (t1 - t0) * (k / (K - 1));
    const uc = refineCrestU(rA, uApex, t, halfDu * 0.5, H);
    crestU.push(uc); crestIdx.push(verts.length / 2); verts.push(uc, t);
  }
  // For a row at t, build the arc-length param along the flank from valley to crest, then invert to place nFlank
  // columns at equal arc-length. Arc length uses the 3D metric (dr, r*dth, 0 in u; dominated by dr on a steep flank).
  const placeFlankU = (uValley: number, uc: number, t: number, nSub: number): number[] => {
    const z = t * H; const M = 400;
    const us = new Float64Array(M + 1), s = new Float64Array(M + 1);
    let acc = 0; let prevX = 0, prevY = 0, prevZ = 0, have = false;
    for (let i = 0; i <= M; i++) {
      const u = uValley + (uc - uValley) * (i / M);
      const th = TAU * (u - Math.floor(u)), r = rA(th, z);
      const x = r * Math.cos(th), y = r * Math.sin(th);
      if (have) acc += Math.hypot(x - prevX, y - prevY, z - prevZ);
      us[i] = u; s[i] = acc; prevX = x; prevY = y; prevZ = z; have = true;
    }
    const total = s[M] || 1e-9;
    const cols: number[] = [];
    for (let c = 1; c <= nSub; c++) { // c=0 is valley (added separately), up to nSub-1 interior; crest is the shared col
      const target = total * (c / nSub);
      // find u at arc-length target (linear interp in s)
      let lo = 0; while (lo < M && s[lo + 1] < target) lo++;
      const seg = s[lo + 1] - s[lo] || 1e-9; const frac = (target - s[lo]) / seg;
      cols.push(us[lo] + (us[lo + 1] - us[lo]) * frac);
    }
    return cols; // length nSub; last ~= crest
  };
  const buildFlank = (dir: 1 | -1): void => {
    const uValley0 = uApex + dir * halfDu;
    const colIdx: number[][] = [];
    // column 0 = valley
    const valleyCol: number[] = [];
    for (let k = 0; k < K; k++) { const t = t0 + (t1 - t0) * (k / (K - 1)); valleyCol.push(verts.length / 2); verts.push(uValley0, t); }
    colIdx.push(valleyCol);
    // interior graded columns 1..nFlank-1 (nFlank-1 of them), then crest column
    for (let c = 1; c < nFlank; c++) {
      const col: number[] = [];
      for (let k = 0; k < K; k++) {
        const t = t0 + (t1 - t0) * (k / (K - 1));
        const cols = placeFlankU(uValley0, crestU[k], t, nFlank); // nFlank targets; take the (c)-th (arc-equal)
        const u = cols[c - 1];
        col.push(verts.length / 2); verts.push(u, t);
      }
      colIdx.push(col);
    }
    colIdx.push(crestIdx); // shared crest column
    const nc = colIdx.length; // = nFlank+1
    for (let c = 0; c < nc - 1; c++) for (let k = 0; k < K - 1; k++) {
      const a = colIdx[c][k], b = colIdx[c + 1][k], cc = colIdx[c][k + 1], d = colIdx[c + 1][k + 1];
      tris.push(a, b, d, a, d, cc);
    }
  };
  buildFlank(1); buildFlank(-1);
  return { verts, tris };
}

export interface InteriorScore {
  nTris: number; nOutliers: number; /* interior dev > tolMm */
  p50: number; p90: number; p99: number; maxMm: number;
  /** worst-N (crest-adjacent) subset stats for the head-to-head slope. */ worstNp50: number; worstN: number;
}

/**
 * Interior true-3D ruler on a flat-lifted 2D mesh. For each triangle, sample its interior on a bary grid
 * (edge-mids + centroid + a denser 15-point stencil), lift the FLAT (u,t) interior point to its 3D position on the
 * flat facet, and measure the true-3D distance to S via bruteNearestOnRadialSurface (the honest anchor — GN stalls on
 * steep ribs). A triangle's interior deviation = MAX over its interior samples. Outlier = interior dev > tolMm.
 * worstN = the reddest worstN triangles' p50 (the "worst-200 crest-adjacent" analogue for the head-to-head slope).
 */
export function scoreInterior(
  rA: AnalyticRadiusFn, mesh: Mesh2D, H: number, tolMm: number, worstN: number,
  ruler: 'local' | 'brute' = 'local',
): InteriorScore {
  const { verts, tris } = mesh;
  // interior stencil: 3 edge-mids + centroid + 3 mid-of-median points (7 pts). The MAX-interior-deviation of a flat
  // facet bridging a convex ridge peaks at the edge-mid / centroid nearest the apex, so 7 well-placed samples capture
  // the worst interior without a 15-pt grid (10x cost). Validated: worst sample is always an edge-mid or centroid.
  const bary: Array<[number, number, number]> = [
    [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3],
  ];
  // lift verts
  const nV = verts.length / 2; const xyz = new Float64Array(nV * 3);
  // handle u-wrap: window is small so no wrap; lift directly.
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(rA, verts[2 * i], verts[2 * i + 1], H); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const nF = tris.length / 3; const devs = new Float64Array(nF);
  // Ruler = FULL-AZIMUTH brute (the ONLY trusted anchor on this cusp: the flat-facet interior's nearest foot can lie
  // several bays away in azimuth, so a narrow-window local ruler OVERSTATED by 0.016mm — E-2026-07-04 calibration).
  // 'local' now maps to a CHEAP full-2pi brute (2048x120, +/-3mm z-band, box-refine) that AGREES with the trusted
  // 4096x600 brute to 2e-5mm at 227ms/call (calibrated in _pf_race_sn_time). 'brute' = the reference grid.
  const nearest = ruler === 'brute'
    ? (px: number, py: number, pz: number): number => bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 4096, nZ: 600, zBandMm: 6, refineIters: 60 }).dist
    : (px: number, py: number, pz: number): number => bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 2048, nZ: 120, zBandMm: 3, refineIters: 60 }).dist;
  // same-(u,t) FULL-3D distance = guaranteed UPPER BOUND on the true-3D nearest distance (cheap). Only run the
  // expensive local/brute nearest on facets whose bound exceeds `preFilter`; deep-green facets keep the bound (both
  // are << tol, so the outlier count + percentiles are unaffected). This is the same pre-filter perFaceTrue3DSag uses.
  const preFilter = 0.006;
  const utBound = (px: number, py: number, pz: number, um: number, tm: number): number => {
    const th = TAU * (um - Math.floor(um)), z = tm * H, r = rA(th, z);
    return Math.hypot(r * Math.cos(th) - px, r * Math.sin(th) - py, z - pz);
  };
  for (let f = 0; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    const ua = verts[2 * a], ub = verts[2 * b], uc = verts[2 * c];
    const ta = verts[2 * a + 1], tb = verts[2 * b + 1], tc = verts[2 * c + 1];
    let mx = 0;
    for (const [wa, wb, wc] of bary) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const bound = utBound(px, py, pz, um, tm);
      const d = bound <= preFilter ? bound : nearest(px, py, pz);
      if (d > mx) mx = d;
    }
    devs[f] = mx;
  }
  const sorted = Float64Array.from(devs).sort();
  const pct = (p: number): number => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : 0;
  let nOut = 0; for (let f = 0; f < nF; f++) if (devs[f] > tolMm) nOut++;
  // worst-N subset p50
  const desc = Float64Array.from(devs).sort().reverse();
  const wn = Math.min(worstN, desc.length);
  const worst = Float64Array.from(desc.subarray(0, wn)).sort();
  const worstNp50 = worst.length ? worst[Math.floor(0.5 * worst.length)] : 0;
  return { nTris: nF, nOutliers: nOut, p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), maxMm: sorted.length ? sorted[sorted.length - 1] : 0, worstNp50, worstN: wn };
}
