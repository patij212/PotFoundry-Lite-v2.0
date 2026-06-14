/**
 * analyticSurfaceGate.ts — the B5 ABSOLUTE surface-fidelity gate (pure CPU).
 *
 * Measures the REAL exported 3D mesh (x,y,z) against the TRUE ANALYTIC surface
 * with NO GPU-grid reference (which is band-limited + bin-quantized + GPU-vs-GPU
 * — red-team B5). The styles in scope are RADIAL surfaces r(theta,z): a 3D point
 * on the OUTER wall (surfaceId 0) maps back exactly (twist=0) via
 *   theta = atan2(y,x),  z,  t = z/H,  r0(t) = baseRadius(z,H,Rb,Rt,expn,opts)
 * so the radial residual |hypot(x,y) - rAnalytic(theta,z)| is the signed surface
 * distance projected onto the radial direction — EXACT for radial features and a
 * safe lower bound on a near-vertical wall (cos(normal-tilt) ≈ 1).
 *
 * Two channels, reported separately:
 *  - VERTEX channel: per outer-wall vertex, radial dev. Certifies the actual
 *    "mesh vertices lie on the true surface" claim (production places vertices
 *    exactly at their (u,t), so this reads ≈ the f32 floor when correct).
 *  - CHORD channel: dense barycentric samples on each FLAT triangle, radial dev.
 *    What a slicer/print sees — catches missing-edge straddle + facet chord error.
 *
 * Exclusions (the seam cliff + ArtDeco riser frustum are accepted feature faces,
 * tracked separately, never failed). Restricted to the outer wall via the
 * parallel PRE-WARP (u,t,surfaceId) assembly-UT stash, which gives the EXACT u
 * (twist-robust) for the seam/riser exclusion and surfaceId 0 for the wall mask.
 *
 * `rAnalytic` is a config-aware closure the CALLER builds (the fidelityGate.ts
 * convention): SFB via the packed `sfRf` + strength mix; every other style via
 * STYLE_FUNCTIONS with snake+camel opts. The gate never dispatches by style id.
 *
 * Pure CPU, no production dependency beyond types. Used by the fidelity probes.
 */

const TAU = 2 * Math.PI;

/** Config-true OUTER radius (mm) as a function of recovered (theta, z). */
export type AnalyticRadiusFn = (theta: number, z: number) => number;

export interface AnalyticDevOpts {
  /** Pot height (mm); outer-wall z = t·H. */
  H: number;
  /** Tolerance (mm); nAbove counts samples whose deviation exceeds it. */
  tolMm: number;
  /** Half-width of the excluded u-seam band (recovered pre-warp u near 0/1). */
  seamExclU?: number;
  /** t-positions of accepted vertical-riser faces (ArtDeco C0 steps). */
  tBands?: number[];
  /** Half-width of the riser-band exclusion in t (default 1.6e-3). */
  tBandHalf?: number;
  /**
   * Surface-u loci of VERTICAL over/under crease discontinuities (e.g. BasketWeave
   * strand edges at u=(m−phase)/strands). The conforming warp PINS mesh columns
   * exactly onto these, where the cell-parity `floor()` is two-valued — the GPU
   * (f32) and this CPU reference (f64) round to opposite sides and flip the
   * over/under strand, a false full-depth deviation (the vertical-crease analog of
   * the u-seam cliff). Triangles touching/straddling a locus are excluded and
   * tracked in `creaseBandMaxMm`. Recovered-u based (atan2 → [0,1)).
   */
  creaseU?: number[];
  /** Surface-t loci of HORIZONTAL over/under crease discontinuities (layer rings). */
  creaseT?: number[];
  /** Half-width of the crease-locus exclusion band (default 1.5e-3). */
  creaseHalf?: number;
  /**
   * POST-WARP placement (u,t,surfaceId), parallel to `mesh.vertices` (the exact
   * parameter the GPU evaluated each vertex at). When provided, the VERTEX channel
   * evaluates the reference at the placement (u·TAU, t·H) instead of recovering the
   * azimuth via atan2 — the atan2 round-trip through f64 trig carries an epsilon that
   * FLIPS the over/under strand at a discontinuity (a false full-relief vertex dev).
   * Reading the placement parameter is exact, so the vertex deviation reads the true
   * CPU↔WGSL parity. The CHORD channel still uses the recovered (atan2,z) — a flat
   * facet sample has no placement parameter. Omit to keep the recovery behaviour.
   */
  utPlacement?: ArrayLike<number>;
  /**
   * Geometric over/under crease PREDICATE for styles whose discontinuities SWEEP
   * through (u,t) (curved ribbons — e.g. the CelticKnot braid) and so cannot be
   * captured by constant-u/constant-t loci. Given a vertex's recovered (u∈[0,1),
   * t∈[0,1]), returns true when it is within the discontinuity band (the over/under
   * strand boundary / closest-strand tie) where GPU-f32/CPU-f64 flip the strand.
   * A triangle with ANY vertex satisfying it is excluded (tracked in creaseBandMaxMm).
   * MUST be geometric (proximity to the discontinuity), NOT an f32/f64 self-test —
   * the dominant deviation is a GPU-placement/CPU-recovery round-flip the self-test
   * is structurally blind to.
   */
  creasePredicate?: (u: number, t: number) => boolean;
  /**
   * Triangle-level STRADDLE exclusion for a swept scalar feature band. Excludes a
   * triangle whose vertices' field values OVERLAP [lo, hi] — i.e. max(field) ≥
   * lo−margin AND min(field) ≤ hi+margin. Unlike {@link creasePredicate} (per-vertex,
   * OR'd), this is ROBUST to facet size: a facet STRADDLING a thin band with BOTH
   * vertices outside it is still excluded (its value range crosses the band), so
   * margin≈0 suffices → MINIMAL over-exclusion. For near-vertical relief CLIFFS the
   * radial chord cannot score regardless of density (e.g. GeometricStar strapwork
   * edges `dStrap=|dLine|−gap ∈ [0,edge]`, a ~2mm/0.07mm wall). `field` is evaluated
   * at recovered (u∈[0,1), t∈[0,1]); return a value far outside [lo,hi] to opt a
   * vertex OUT (e.g. masked faded-relief regions). Excluded → creaseBandMaxMm.
   */
  creaseStraddle?: { field: (u: number, t: number) => number; lo: number; hi: number; margin?: number };
  /** Barycentric sub-samples per edge for the dense chord (default 12). */
  denseN?: number;
  /** Centroid pre-filter (mm) below which the dense chord scan is skipped (default 0.04). */
  preFilterMm?: number;
  /**
   * When set (0..1), DROP outer-wall facets whose 3D normal is more horizontal
   * than this (|nz|/|n| ≥ value) — a cap/foot face that slipped the surfaceId
   * mask. DEFAULT OFF: the radial deviation is a valid LOWER BOUND even on a
   * tilted face, so dropping tilted facets would HIDE defects there. The
   * surfaceId-0 mask is the primary wall isolation; enable this only to harden
   * against a mask leak. (A petaled SFB wall has many genuinely-tilted facets —
   * dropping them loses real wall coverage.)
   */
  dropNearHorizontalNz?: number;
}

export interface AnalyticDevResult {
  /** Max radial deviation (mm) over all NON-excluded samples (both channels). */
  maxDevMm: number;
  /** 99th-percentile radial deviation (mm). */
  p99DevMm: number;
  /** RMS radial deviation (mm). */
  rmsDevMm: number;
  /** Max deviation of the VERTEX channel only (exact placement, no inverse). */
  vertexMaxMm: number;
  /** Max deviation of the CHORD channel only (flat-triangle facet vs surface). */
  chordMaxMm: number;
  /** Non-excluded outer-wall triangles measured. */
  wallTriangles: number;
  /** Non-excluded samples accumulated (vertex + chord). */
  samples: number;
  /** Samples whose deviation exceeds tolMm. */
  nAbove: number;
  /** NaN/Inf mesh vertices skipped (>0 ⇒ DO NOT gate on the result). */
  nonFiniteCount: number;
  /** Max deviation (mm) among the EXCLUDED seam-band samples (tracked, not failed). */
  seamBandMaxMm: number;
  /** Max deviation (mm) among the EXCLUDED riser-band samples (tracked, not failed). */
  riserBandMaxMm: number;
  /** Max deviation (mm) among the EXCLUDED crease-locus samples (tracked, not failed). */
  creaseBandMaxMm: number;
  /** (theta,z,mm) of the worst non-excluded sample. */
  worst: { theta: number; z: number; mm: number };
}

const wrap1 = (u: number): number => ((u % 1) + 1) % 1;
const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * B5 radial deviation of the REAL 3D outer-wall mesh from the CPU ANALYTIC
 * surface. `ut` = the PRE-WARP (u,t,surfaceId) stash, PARALLEL to `mesh.vertices`
 * (getLastConformingAssemblyUT). The caller MUST guard `ut.length ===
 * mesh.vertices.length` before calling (the parallelism contract).
 */
export function radialAnalyticDeviation(
  mesh: { vertices: ArrayLike<number>; indices: ArrayLike<number> },
  ut: ArrayLike<number>,
  rAnalytic: AnalyticRadiusFn,
  opts: AnalyticDevOpts,
): AnalyticDevResult {
  // NOTE: opts.H is part of the contract (outer-wall z = t·H) but is baked into
  // the caller's rAnalytic(theta, z) closure, so this metric reads z directly.
  const V = mesh.vertices, I = mesh.indices;
  const seamU = opts.seamExclU ?? 0;
  const N = opts.denseN ?? 12;
  const pre = opts.preFilterMm ?? 0.04;
  const tol = opts.tolMm;
  const tBands = opts.tBands ?? [];
  const halfT = opts.tBandHalf ?? 1.6e-3;
  const creaseU = opts.creaseU ?? [];
  const creaseT = opts.creaseT ?? [];
  const halfCrease = opts.creaseHalf ?? 1.5e-3;
  const creasePredicate = opts.creasePredicate;
  const creaseStraddle = opts.creaseStraddle;
  const utPlace = opts.utPlacement;
  const H = opts.H;

  const devs: number[] = [];
  let vMax = 0, cMax = 0, seamMax = 0, riserMax = 0, creaseMax = 0, nonFinite = 0, wallTris = 0;
  let worst = { theta: 0, z: 0, mm: 0 };

  // Radial deviation at a 3D point (recover theta=atan2, z direct → r_analytic).
  // THETA CONVENTION: atan2 returns [−π,π]; the WGSL shader receives the azimuth
  // in [0,TAU). Styles whose radius has theta-SIGN-dependent INTEGER logic (cell
  // parity, column id — DragonScales, CelticKnot, …) sample the WRONG cell on the
  // back half (atan2<0) without this wrap; measured DragonScales 8.91mm→0.0001mm,
  // CelticKnot 2.6→0.42 when wrapped, while periodic styles (Gyroid/…) are a no-op.
  const devAt = (x: number, y: number, z: number): number => {
    let theta = Math.atan2(y, x);
    if (theta < 0) theta += TAU; // → [0,TAU) to match the shader's azimuth domain
    return Math.abs(Math.hypot(x, y) - rAnalytic(theta, z));
  };

  // VERTEX-channel reference at vertex `idx`: exact placement (u·TAU, t·H) when the
  // post-warp stash is available (no atan2 round-trip flip), else recovered (atan2,z).
  const vertexDev = (idx: number, x: number, y: number, z: number): number =>
    (utPlace
      ? Math.abs(Math.hypot(x, y) - rAnalytic(utPlace[idx * 3] * TAU, utPlace[idx * 3 + 1] * H))
      : devAt(x, y, z));

  for (let i = 0; i + 2 < I.length; i += 3) {
    const a = I[i], b = I[i + 1], c = I[i + 2];

    // OUTER WALL ONLY (surfaceId 0): t = z/H holds only here. Inner wall (1),
    // caps (2/3/4), drain (5) have a different z↔t mapping — excluded.
    if (ut[a * 3 + 2] >= 0.5 || ut[b * 3 + 2] >= 0.5 || ut[c * 3 + 2] >= 0.5) continue;

    // SEAM / WRAP / RISER exclusion from the PRE-WARP (u,t) (fidelityGate.ts:88-93).
    const ua = ut[a * 3], ub = ut[b * 3], uc = ut[c * 3];
    const ta = ut[a * 3 + 1], tb = ut[b * 3 + 1], tc = ut[c * 3 + 1];
    const cu = wrap1((ua + ub + uc) / 3);
    const spanWrap = Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5;
    let exclude: 0 | 1 | 2 | 3 = 0; // 0 measured, 1 seam, 2 riser, 3 over/under crease
    if (cu < seamU || cu > 1 - seamU || spanWrap) exclude = 1;
    else if (tBands.length > 0 && halfT > 0) {
      const ct = (ta + tb + tc) / 3;
      if (tBands.some((te) => Math.abs(ct - te) < halfT)) exclude = 2;
    }

    const ax = V[a * 3], ay = V[a * 3 + 1], az = V[a * 3 + 2];
    const bx = V[b * 3], by = V[b * 3 + 1], bz = V[b * 3 + 2];
    const cx = V[c * 3], cy = V[c * 3 + 1], cz = V[c * 3 + 2];
    if (!Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az)
      || !Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)
      || !Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(cz)) {
      nonFinite++;
      continue;
    }

    // OVER/UNDER CREASE exclusion (recovered-u/t based — the warp pins columns/rows
    // onto these discontinuities, where the cell-parity floor() is two-valued and
    // GPU-f32/CPU-f64 flip the over/under strand). A triangle that TOUCHES or
    // STRADDLES a locus is excluded. Recovered u = atan2 → [0,1) (post-warp, matches
    // where the pinning lands); recovered t = z/H. Seam-spanning triangles are
    // already excluded above, so the small-interval [lo,hi] test needs no wrap.
    if (exclude === 0 && (creaseU.length > 0 || creaseT.length > 0 || creasePredicate || creaseStraddle)) {
      const uA = wrap1(Math.atan2(ay, ax) / TAU), uB = wrap1(Math.atan2(by, bx) / TAU), uC = wrap1(Math.atan2(cy, cx) / TAU);
      const tA = az / H, tB = bz / H, tC = cz / H;
      const uLo = Math.min(uA, uB, uC), uHi = Math.max(uA, uB, uC);
      const tLo = Math.min(tA, tB, tC), tHi = Math.max(tA, tB, tC);
      const hitsU = creaseU.some((L) => L >= uLo - halfCrease && L <= uHi + halfCrease);
      const hitsT = creaseT.some((L) => L >= tLo - halfCrease && L <= tHi + halfCrease);
      // Geometric predicate (curved/swept creases): ANY vertex in the band.
      const hitsPred = creasePredicate !== undefined
        && (creasePredicate(uA, tA) || creasePredicate(uB, tB) || creasePredicate(uC, tC));
      // Triangle-level straddle (swept scalar cliff band): vertex field RANGE
      // overlaps [lo, hi] — robust to facets larger than the band (per-vertex would
      // miss a facet spanning a thin cliff with both vertices outside it).
      let hitsStraddle = false;
      if (creaseStraddle !== undefined) {
        const m = creaseStraddle.margin ?? 0;
        const fA = creaseStraddle.field(uA, tA), fB = creaseStraddle.field(uB, tB), fC = creaseStraddle.field(uC, tC);
        hitsStraddle = Math.max(fA, fB, fC) >= creaseStraddle.lo - m && Math.min(fA, fB, fC) <= creaseStraddle.hi + m;
      }
      if (hitsU || hitsT || hitsPred || hitsStraddle) exclude = 3;
    }

    // OPTIONAL near-horizontal geometric guard (default OFF — see opts doc): a
    // cap/foot face that slipped the surfaceId mask. Degenerate facets (zero
    // area) are always skipped.
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nlen = Math.hypot(nx, ny, nz);
    if (!(nlen > 1e-12)) continue; // degenerate facet
    const dropNz = opts.dropNearHorizontalNz;
    if (dropNz !== undefined && Math.abs(nz) / nlen >= dropNz) continue;

    // VERTEX channel — exact placement param (utPlacement) when available, else atan2.
    let triMax = 0;
    let triWorst = { theta: 0, z: 0, mm: 0 };
    for (const [vi, vxc, vyc, vzc] of [[a, ax, ay, az], [b, bx, by, bz], [c, cx, cy, cz]] as const) {
      const d = vertexDev(vi, vxc, vyc, vzc);
      if (exclude === 1) { if (d > seamMax) seamMax = d; continue; }
      if (exclude === 2) { if (d > riserMax) riserMax = d; continue; }
      if (exclude === 3) { if (d > creaseMax) creaseMax = d; continue; }
      devs.push(d);
      if (d > vMax) vMax = d;
      if (d > triMax) { triMax = d; triWorst = { theta: Math.atan2(vyc, vxc), z: vzc, mm: d }; }
    }

    // CHORD channel — dense barycentric samples on the FLAT facet.
    const ccx = (ax + bx + cx) / 3, ccy = (ay + by + cy) / 3, ccz = (az + bz + cz) / 3;
    let dCen = devAt(ccx, ccy, ccz);
    if (exclude === 1) { if (dCen > seamMax) seamMax = dCen; continue; }
    if (exclude === 2) { if (dCen > riserMax) riserMax = dCen; continue; }
    if (exclude === 3) { if (dCen > creaseMax) creaseMax = dCen; continue; }
    wallTris++;
    // Pre-filter: a clearly-fine facet skips the dense scan (centroid only).
    if (dCen <= pre) {
      devs.push(dCen);
      if (dCen > cMax) cMax = dCen;
      if (dCen > triMax) { triMax = dCen; triWorst = { theta: Math.atan2(ccy, ccx), z: ccz, mm: dCen }; }
    } else {
      for (let p = 0; p <= N; p++) {
        for (let q = 0; q <= N - p; q++) {
          const wa = p / N, wb = q / N, wc = 1 - wa - wb;
          const px = wa * ax + wb * bx + wc * cx;
          const py = wa * ay + wb * by + wc * cy;
          const pz = wa * az + wb * bz + wc * cz;
          const d = devAt(px, py, pz);
          devs.push(d);
          if (d > cMax) cMax = d;
          if (d > triMax) { triMax = d; triWorst = { theta: Math.atan2(py, px), z: pz, mm: d }; }
        }
      }
    }
    if (triMax > worst.mm) worst = triWorst;
  }

  devs.sort((x, y) => x - y);
  const n = devs.length;
  const p99 = n ? devs[Math.min(n - 1, Math.floor(0.99 * n))] : 0;
  let sumSq = 0, nAbove = 0;
  for (const d of devs) { sumSq += d * d; if (d > tol) nAbove++; }
  return {
    maxDevMm: n ? devs[n - 1] : 0,
    p99DevMm: p99,
    rmsDevMm: n ? Math.sqrt(sumSq / n) : 0,
    vertexMaxMm: vMax,
    chordMaxMm: cMax,
    wallTriangles: wallTris,
    samples: n,
    nAbove,
    nonFiniteCount: nonFinite,
    seamBandMaxMm: seamMax,
    riserBandMaxMm: riserMax,
    creaseBandMaxMm: creaseMax,
    worst,
  };
}

/**
 * ArtDeco C0 riser t-bands from the live step count (styles.ts rOuterArtDeco
 * stepEdge: stepLocal<0.1 || stepLocal>0.9). Returns the riser-centre t's at
 * (tier+0.1)/N and (tier+0.9)/N for tier∈[0..N), filtered off the t=0/1 caps.
 */
export function artDecoRiserTBands(stepCount: number): number[] {
  const n = Math.max(1, Math.round(stepCount));
  return Array.from({ length: n }, (_, tier) => [(tier + 0.1) / n, (tier + 0.9) / n])
    .flat()
    .filter((t) => t > 2e-3 && t < 1 - 2e-3);
}

/**
 * BasketWeave over/under crease loci (the conforming warp pins mesh columns/rows
 * onto these — `extractBasketWeave`/FeatureLineGraph). VERTICAL strand edges at
 * `u_twisted = u·strands + phase = m` ⇒ `u = (m−phase)/strands` (m=0..strands−1),
 * HORIZONTAL layer rings at `v = t·layers = k` ⇒ `t = k/layers` (interior
 * k=1..layers−1; t=0/1 are shared boundary rings, not creases). Only the
 * AXIS-ALIGNED weave (twist=0, vGrad=0) is warp-pinned — the caller passes [] for
 * the diagonal/non-uniform cases (no pinning ⇒ no false discontinuity dev).
 */
export function basketWeaveCreaseLoci(
  strands: number,
  layers: number,
  phase: number,
): { creaseU: number[]; creaseT: number[] } {
  const s = Math.max(1, Math.round(strands));
  const l = Math.max(1, Math.round(layers));
  const creaseU = Array.from({ length: s }, (_, m) => wrap1((m - phase) / s));
  const creaseT = Array.from({ length: l - 1 }, (_, i) => (i + 1) / l)
    .filter((t) => t > 2e-3 && t < 1 - 2e-3);
  return { creaseU, creaseT };
}

/**
 * CelticKnot over/under crease predicate (the braid's strand boundaries SWEEP
 * through (u,t) as curved sinusoidal ribbons — `style_celtic_knot`/rOuterCelticKnot
 * — so they cannot be captured by constant-u/constant-t loci). Reconstructs the
 * per-strand distances ds[i]=|localU − 0.4·sin(v + basePhase + phaseStep·i)| from the
 * live config and flags a point within `band` of EITHER the background cutoff
 * (min ds ≈ strandW) OR a closest-strand tie (ds[0] ≈ ds[1]) — the two discontinuity
 * families where GPU-f32/CPU-f64 flip the strand. band≈0.002 (in localU units)
 * captures the residual with ~1.6% over-exclusion (the true crease set is measure-zero).
 */
export function celticKnotCreasePredicate(
  scale: number,
  width: number,
  twist: number,
  strands: number,
  band = 2e-3,
): (u: number, t: number) => boolean {
  const numColumns = Math.max(1, Math.floor(scale));
  const strandW = width * 0.15;
  const tightness = Math.max(0.5, twist + 0.5);
  const numStrandsF = Math.max(2, Math.min(8, Math.floor(strands + 0.5)));
  const numStrands = Math.trunc(numStrandsF);
  const phaseStep = TAU / numStrandsF;
  const PI = Math.PI;
  return (u: number, t: number): boolean => {
    const scaled = u * numColumns;
    const columnId = Math.floor(scaled);
    const localU = ((scaled - columnId) - 0.5) * 2.0;
    const v = t * tightness * TAU * 3.0;
    const basePhase = columnId * PI * 0.333;
    const ds: number[] = [];
    for (let i = 0; i < numStrands; i++) {
      ds.push(Math.abs(localU - 0.4 * Math.sin(v + basePhase + phaseStep * i)));
    }
    ds.sort((a, b) => a - b);
    const d0 = ds[0];
    const d1 = ds.length > 1 ? ds[1] : Infinity;
    return Math.min(Math.abs(d0 - strandW), Math.abs(d0 - d1)) < band;
  };
}

/**
 * GeometricStar strapwork distance FIELD `dStrap = |dLine| − gap` in (u,t),
 * replicating `style_geometric_star` (styles.wgsl) / rOuterGeometricStar
 * (`dLine = p·(sin,cos)(starAngle)`, `p=(|a·N/4|, v)`, `v=(fract(t·layers·zoom)−0.5)·2`).
 * The relief is `1−smoothstep(0,edge,dStrap)` (edge=0.02+roundness·0.2), so the strap
 * EDGE band `dStrap ∈ [0,edge]` is a near-VERTICAL diagonal cliff: the v-term gradient
 * dominates (~relief over ~edge/|∇| ≈ 2mm/0.07mm in z at defaults), 2° from vertical.
 * MEASURED (2026-06-14): a near-radial facet there reads large RADIAL dev regardless
 * of density (general-curve chevron insertion left nAbove 27%→26.3% while exploding to
 * 2.2M tris). So the cliff is a designed C0-ish step, EXCLUDED like the ArtDeco/Bamboo
 * riser — via {@link AnalyticDevOptions.creaseStraddle} with the returned {field, lo:0,
 * hi:edge} (triangle-level straddle, robust to facets larger than the thin cliff). The
 * plateau tops + flat gaps stay measured. Mirrors the live shader (CPU↔WGSL byte-parity;
 * vtx 0.0001).
 */
export function geometricStarStrapField(
  points: number,
  gap: number,
  detail: number,
  layers: number,
  roundness: number,
  zoom: number,
  shift: number,
): { field: (u: number, t: number) => number; lo: number; hi: number } {
  const N = Math.max(4, points);
  const edge = 0.02 + roundness * 0.2;
  const starAngle = (0.2 + 0.6 * detail) * (Math.PI / 2);
  const sa = Math.sin(starAngle);
  const ca = Math.cos(starAngle);
  const angle = TAU / N;
  const field = (u: number, t: number): number => {
    const vRaw = t * layers * zoom;
    const row = Math.floor(vRaw);
    const v = (vRaw - row - 0.5) * 2.0;
    const rowOffset = (row % 2) * (Math.PI / N) * shift * 2.0;
    const th = u * TAU + rowOffset;
    const a = (th / angle - Math.floor(th / angle) - 0.5) * angle;
    const px = Math.abs(a * (N / 4.0));
    return Math.abs(px * sa + v * ca) - gap;
  };
  return { field, lo: 0, hi: edge };
}

export { TAU, wrap1, clamp01 };
