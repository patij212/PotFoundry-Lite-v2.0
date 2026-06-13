/**
 * fidelityGate.ts — the shared surface-fidelity gate (Task 1). One faithful,
 * config-aware deviation metric every edge task gates on (DRY).
 *
 * Design: the gate takes a caller-provided `surface(u,t) -> [x,y,z]` = the TRUE
 * mathematical surface at the EXPORT's config. The caller builds it faithfully
 * (e.g. `SfbWallSampler(packed)` for SuperformulaBlossom, or a packed-param
 * evaluator per style). This sidesteps the snake_case/camelCase/packed mapping
 * landmine (BLOCKING-2): config-awareness is the caller's `surface`, not a
 * style-id dispatch the gate can't faithfully implement for every style on CPU.
 *
 * Production already evaluates every vertex EXACTLY at its (u,t)
 * (ParametricExportComputer.ts:2701), so a mesh vertex's 3D position IS
 * `surface(u,t)`; the residual is the flat triangle vs the curved surface across
 * its (u,t) footprint (chord) + any feature the triangle straddles (a missing
 * edge). The gate measures exactly that, seam excluded (the accepted cliff is
 * reported separately).
 *
 * Pure CPU, no production dependency beyond types. Used by the fidelity probes.
 */

export type SurfaceFn = (u: number, t: number) => readonly [number, number, number];

/** Parameter-space mesh: vertices as flat (u, t, _) triples + triangle indices. */
export interface FidelityMesh {
  readonly vertices: ArrayLike<number>;
  readonly indices: ArrayLike<number>;
}

export interface DeviationOpts {
  /** Tolerance (mm); fracAboveTol / nAbove count triangles whose deviation exceeds it. */
  tolMm: number;
  /** Half-width of the excluded u-seam band (the accepted non-periodic cliff). */
  seamExclU?: number;
  /** t-positions of accepted vertical-riser faces (C0 t-jumps, e.g. ArtDeco/Bamboo
   *  steps). Triangles whose centroid-t is within `tBandHalf` of any are excluded
   *  (the riser face IS the feature; the r(u,t) metric cannot score a vertical face). */
  tBands?: number[];
  /** Half-width of the riser-band exclusion in t (defaults to 2× the riser ε). */
  tBandHalf?: number;
  /** Barycentric sub-samples per edge for the dense chord (default 12). */
  denseN?: number;
  /** Centroid pre-filter threshold (mm) below which the dense scan is skipped (default 0.04). */
  preFilterMm?: number;
}

export interface DeviationResult {
  /** Max deviation (mm) over all NON-seam triangles. */
  maxMm: number;
  /** 99th-percentile deviation (mm). */
  p99Mm: number;
  /** Fraction of non-seam triangles whose deviation exceeds tolMm. */
  fracAboveTol: number;
  /** Count of non-seam triangles whose deviation exceeds tolMm. */
  nAbove: number;
  /** Total non-seam triangles measured. */
  nTris: number;
  /** (u,t) of the worst-deviation sample. */
  worst: { u: number; t: number; mm: number };
  /** Max deviation (mm) among the EXCLUDED seam-band triangles (tracked, not failed). */
  seamBandMaxMm: number;
}

type V3 = readonly [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

function pctl(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

/** Iterate triangles; `seam` flags excluded ones (u-seam, u-wrap, or a riser t-band). */
function forEachWallTri(
  mesh: FidelityMesh,
  seamExclU: number,
  fn: (ua: number, ta: number, ub: number, tb: number, uc: number, tc: number, cu: number, seam: boolean) => void,
  tBands?: number[],
  tBandHalf?: number,
): void {
  const v = mesh.vertices, idx = mesh.indices;
  const halfT = tBandHalf ?? 0;
  for (let i = 0; i + 2 < idx.length; i += 3) {
    const a = idx[i], b = idx[i + 1], c = idx[i + 2];
    const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
    const ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
    const cu = ((((ua + ub + uc) / 3) % 1) + 1) % 1;
    const spanWrap = Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5;
    let seam = cu < seamExclU || cu > 1 - seamExclU || spanWrap;
    if (!seam && tBands && tBands.length > 0 && halfT > 0) {
      const ct = (ta + tb + tc) / 3;
      if (tBands.some((te) => Math.abs(ct - te) < halfT)) seam = true; // riser face: accepted feature
    }
    fn(ua, ta, ub, tb, uc, tc, cu, seam);
  }
}

/** Max chord deviation (mm) of a flat triangle vs the surface over its footprint. */
function triChord(
  surface: SurfaceFn,
  ua: number, ta: number, ub: number, tb: number, uc: number, tc: number,
  N: number,
): { max: number; au: number; at: number } {
  const Va = surface(ua, ta), Vb = surface(ub, tb), Vc = surface(uc, tc);
  let m = 0, au = ua, at = ta;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N - i; j++) {
      const aa = i / N, bb = j / N, cc = 1 - aa - bb;
      const su = aa * ua + bb * ub + cc * uc, st = aa * ta + bb * tb + cc * tc;
      const tr = surface(su, st);
      const d = Math.hypot(
        aa * Va[0] + bb * Vb[0] + cc * Vc[0] - tr[0],
        aa * Va[1] + bb * Vb[1] + cc * Vc[1] - tr[1],
        aa * Va[2] + bb * Vb[2] + cc * Vc[2] - tr[2],
      );
      if (d > m) { m = d; au = su; at = st; }
    }
  }
  return { max: m, au, at };
}

/**
 * Deviation of the mesh from the true surface (mm), seam excluded. The dominant
 * gate for every edge task.
 */
export function deviationVsTrueSurface(mesh: FidelityMesh, surface: SurfaceFn, opts: DeviationOpts): DeviationResult {
  const seamExclU = opts.seamExclU ?? 0;
  const N = opts.denseN ?? 12;
  const pre = opts.preFilterMm ?? 0.04;
  const devs: number[] = [];
  let worst = { u: 0, t: 0, mm: 0 };
  let seamBandMax = 0;
  forEachWallTri(mesh, seamExclU, (ua, ta, ub, tb, uc, tc, cu, seam) => {
    // cheap centroid pre-filter
    const Va = surface(ua, ta), Vb = surface(ub, tb), Vc = surface(uc, tc);
    const ct = (ta + tb + tc) / 3;
    const trC = surface(cu, ct);
    const dC = Math.hypot((Va[0] + Vb[0] + Vc[0]) / 3 - trC[0], (Va[1] + Vb[1] + Vc[1]) / 3 - trC[1], (Va[2] + Vb[2] + Vc[2]) / 3 - trC[2]);
    let dmax = dC, au = cu, at = ct;
    if (dC > pre) { const dd = triChord(surface, ua, ta, ub, tb, uc, tc, N); dmax = Math.max(dC, dd.max); au = dd.au; at = dd.at; }
    if (seam) { if (dmax > seamBandMax) seamBandMax = dmax; return; }
    devs.push(dmax);
    if (dmax > worst.mm) worst = { u: au, t: at, mm: dmax };
  }, opts.tBands, opts.tBandHalf);
  devs.sort((x, y) => x - y);
  const nAbove = devs.filter((d) => d > opts.tolMm).length;
  return {
    maxMm: devs.length ? devs[devs.length - 1] : 0,
    p99Mm: pctl(devs, 0.99),
    fracAboveTol: devs.length ? nAbove / devs.length : 0,
    nAbove,
    nTris: devs.length,
    worst,
    seamBandMaxMm: seamBandMax,
  };
}

/**
 * Count folded / inverted triangles (a geometric-validity defect topology gates
 * miss). Robust to global winding: classify each non-seam wall triangle by the
 * SIGN of (3D face normal · outward radial); the majority sign is "correct" and
 * the minority count is the fold-over count. Returns 0 when all triangles agree.
 */
export function countFoldedTriangles(mesh: FidelityMesh, surface: SurfaceFn, seamExclU = 0): number {
  let pos = 0, neg = 0;
  const signs: number[] = [];
  forEachWallTri(mesh, seamExclU, (ua, ta, ub, tb, uc, tc, _cu, seam) => {
    if (seam) return;
    const Va = surface(ua, ta), Vb = surface(ub, tb), Vc = surface(uc, tc);
    const n = cross(sub(Vb, Va), sub(Vc, Va));
    if (len(n) < 1e-30) return; // degenerate: not a fold, skip
    const cx = (Va[0] + Vb[0] + Vc[0]) / 3, cy = (Va[1] + Vb[1] + Vc[1]) / 3;
    const dot = n[0] * cx + n[1] * cy; // outward radial = (cx,cy,0)
    if (dot >= 0) pos++; else neg++;
    signs.push(dot >= 0 ? 1 : -1);
  });
  return Math.min(pos, neg);
}

/** Smallest distinct-vertex 3D edge length (mm) over non-seam triangles. */
export function minVertexSpacing3D(mesh: FidelityMesh, surface: SurfaceFn, seamExclU = 0): number {
  let mn = Infinity;
  forEachWallTri(mesh, seamExclU, (ua, ta, ub, tb, uc, tc, _cu, seam) => {
    if (seam) return;
    const Va = surface(ua, ta), Vb = surface(ub, tb), Vc = surface(uc, tc);
    for (const [X, Y] of [[Va, Vb], [Vb, Vc], [Vc, Va]] as Array<[V3, V3]>) {
      const d = len(sub(X, Y));
      if (d > 1e-12 && d < mn) mn = d;
    }
  });
  return Number.isFinite(mn) ? mn : 0;
}

export interface StraddleStats {
  nAbove: number;
  nStraddle: number;
  nFlank: number;
  worstStraddle: number;
  worstFlank: number;
}

/**
 * Classify every >tol triangle as STRADDLE (a feature locus crosses its u-interior
 * at the worst-deviation t = a missing/partial mesh edge) vs FLANK (no feature =
 * chord/sizing). `lociAt(t)` returns the feature u-positions at height t.
 */
export function straddleStats(
  mesh: FidelityMesh,
  surface: SurfaceFn,
  lociAt: (t: number) => number[],
  opts: DeviationOpts,
): StraddleStats {
  const seamExclU = opts.seamExclU ?? 0;
  const N = opts.denseN ?? 12;
  const pre = opts.preFilterMm ?? 0.04;
  let nAbove = 0, nStraddle = 0, nFlank = 0, worstStraddle = 0, worstFlank = 0;
  forEachWallTri(mesh, seamExclU, (ua, ta, ub, tb, uc, tc, cu, seam) => {
    if (seam) return;
    // cheap centroid pre-filter: skip clearly-fine triangles before the dense scan.
    const Va = surface(ua, ta), Vb = surface(ub, tb), Vc = surface(uc, tc);
    const ct = (ta + tb + tc) / 3;
    const trC = surface(cu, ct);
    const dC = Math.hypot((Va[0] + Vb[0] + Vc[0]) / 3 - trC[0], (Va[1] + Vb[1] + Vc[1]) / 3 - trC[1], (Va[2] + Vb[2] + Vc[2]) / 3 - trC[2]);
    if (dC <= pre && dC <= opts.tolMm) return;
    const dd = triChord(surface, ua, ta, ub, tb, uc, tc, N);
    if (dd.max <= opts.tolMm) return;
    nAbove++;
    const uLo = Math.min(ua, ub, uc), uHi = Math.max(ua, ub, uc);
    const straddles = lociAt(dd.at).some((ul) => ul > uLo + 1e-6 && ul < uHi - 1e-6);
    if (straddles) { nStraddle++; if (dd.max > worstStraddle) worstStraddle = dd.max; }
    else { nFlank++; if (dd.max > worstFlank) worstFlank = dd.max; }
  });
  return { nAbove, nStraddle, nFlank, worstStraddle, worstFlank };
}
