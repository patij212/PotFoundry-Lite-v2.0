/**
 * warpDomainCeiling.ts — the GLOBAL feature-aligned warp ceiling, the
 * follow-on to crestAlignedCeiling.ts.
 *
 * `crestAlignedCeiling.ts` proved that aligning the lattice to ONE crest CURES
 * the axis-aligned slivers (55.5% sub-15° → 0.1-0.9%, median 23-38°), but it
 * measured crest-adjacent flank cells IN ISOLATION — it did NOT tile a global
 * warp across the WHOLE domain, and the SFB@1 petal count MORPHS (m(t) = 6 at
 * t=0 → 10 at t=1), so a static one-crest shear cannot be the answer. The four
 * remaining openUnknowns all live in the GLOBAL warp:
 *
 *   - watertight TILING of the aligned ribbon into the bulk (transition zone),
 *   - the periodic SEAM when the warp period m(t) is NON-INTEGER,
 *   - petal BIRTHS where m(t) crosses a half-integer and a new feature enters,
 *   - VALLEYS between crests (not just crests).
 *
 * ## The warp under test — the feature phase coordinate φ = u·m(t)
 *
 * SFB@1's relief is EXACTLY periodic in the feature phase φ = u·m(t): `sfRf`
 * extremizes at x = (π/4)(2·m·u + 1) = j·π/2, i.e. at φ = u·m = j/2 − 1/4… but
 * the closed-form crest/valley loci land at φ = j − 0.5 (crests) and φ = j
 * (valleys) once the π/m seam offset is folded in (see sfClosedFormCrestLoci).
 * So in φ-space EVERY feature is on a HALF-INTEGER line, INDEPENDENT of t — the
 * morphing m(t) is absorbed entirely into the coordinate. This is the IDEAL
 * global alignment: a regular lattice in (φ, t) puts crests AND valleys AND the
 * inter-feature bulk each on their own φ-columns, at every height.
 *
 * The map is φ → u = φ/m(t) → 3D via SfbWallSampler. Building a regular (φ, t)
 * grid with φ-spacing ≤ 1 (the aspect constraint: cross-feature extent ≤ the
 * along-feature unit, since one full petal is Δφ = 1) and mapping every node to
 * 3D gives the warp's true ceiling — measured in 3D, never in (u,t) or (φ,t).
 *
 * ## What this measures (all in 3D on the true surface)
 *
 *  (1) The 3D min-angle of EVERY cell over the FULL feature band — crests
 *      (φ = j−0.5), valleys (φ = j), inter-feature bulk — best of the 2 quad
 *      diagonals. median / worst / fracBelow15 / fracBelow20, REGION-TAGGED.
 *  (2) The Jacobian determinant SIGN of (φ,t)→3D at every node. The surface
 *      Jacobian J3 = [∂P/∂φ | ∂P/∂t] is 3×2; its signed area is the magnitude
 *      of the cross product ∂P/∂φ × ∂P/∂t projected on the surface normal —
 *      we track the SIGN of (∂P/∂φ × ∂P/∂t)·n̂_ref against a fixed reference
 *      normal. ANY sign flip across the domain ⇒ a FOLD ⇒ the warp is invalid.
 *      We ALSO track the (φ,t)→(u,t) planar Jacobian det = ∂u/∂φ·∂t/∂t −
 *      ∂u/∂t·∂t/∂φ = (1/m(t)) > 0 always (monotone), the bijection proof.
 *  (3) The SEAM: φ runs [0, m(t)] but m(t) is NON-INTEGER, so the last full
 *      column at u=1 (φ=m(t)) does NOT align with a half-integer feature line.
 *      We place the seam EXACTLY at u=0≡u=1 (φ=0≡φ=m(t)) — both derive the
 *      identical 3D point P(0,t)=P(1,t) by periodicity — and measure the worst
 *      3D gap (mm) between the u=0 column node and the u=1 column node at each
 *      t (must be ~0 by construction), AND the min-angle of the partial seam
 *      cells (φ ∈ [⌊m(t)⌋, m(t)]).
 *  (4) Petal BIRTHS: at the t where m(t) = j − 0.5 a new crest column φ=j−0.5
 *      enters [0, m(t)); at m(t) = j a new valley. We locate these birth t's
 *      and report the min-angle of the cells straddling each birth row (the
 *      structurally-special endpoint class).
 *
 * Pure CPU (vitest-trusted). Imports production/fidelity modules READ-ONLY; the
 * surface and config are pinned through the SAME SfbWallSampler / SFB1_PACKED
 * single source of truth the sibling audits use.
 */
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import type { PositionSampler } from './metrics';
import { polygonBestMinAngle3D } from './cellTriangulationCeiling';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS } from './snapPlacementAudit';

type V3 = readonly [number, number, number];

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}

// ─────────────────────────────────────────────────────────────────────────────
// m(t) — the SFB@1 petal-count morphism (packed slots 1,2,3 = mBase,mTop,c)
// ─────────────────────────────────────────────────────────────────────────────

/** m(t) = mBase + (mTop − mBase)·t^c, the SuperformulaBlossom petal count.
 *  Mirrors sfMOf in crestLateralDeviation.ts (the single source of truth for
 *  the morphism) — re-stated here because that helper is module-private. */
function mOf(p: Float32Array | readonly number[], t: number): number {
  const tc = t < 0 ? 0 : t > 1 ? 1 : t;
  const mBase = p[1];
  const mTop = p[2];
  const c = Math.max(p[3], 1e-4);
  return mBase + (mTop - mBase) * Math.pow(tc, c);
}

// ─────────────────────────────────────────────────────────────────────────────
// Region classification of a φ-column (crest / valley / bulk)
// ─────────────────────────────────────────────────────────────────────────────

export type Region = 'crest' | 'valley' | 'bulk' | 'seam' | 'birth';

/** Classify a cell by its φ-midpoint: a crest column straddles a half-integer
 *  φ = j−0.5, a valley column straddles an integer φ = j, otherwise bulk. The
 *  cell whose φ-interval CONTAINS the feature line is the feature cell. */
function regionOfCell(phiLo: number, phiHi: number): Region {
  // Does [phiLo, phiHi] contain a half-integer (crest) line?
  for (let j = Math.ceil(phiLo + 0.5); j - 0.5 <= phiHi + 1e-12; j++) {
    const crest = j - 0.5;
    if (crest >= phiLo - 1e-12 && crest <= phiHi + 1e-12) return 'crest';
  }
  // Does it contain an integer (valley) line, j ≥ 1?
  for (let j = Math.ceil(phiLo); j <= phiHi + 1e-12; j++) {
    if (j >= 1 && j >= phiLo - 1e-12 && j <= phiHi + 1e-12) return 'valley';
  }
  return 'bulk';
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────────────────────────────

export interface AngleStats {
  count: number;
  minDeg: number;
  p05Deg: number;
  medianDeg: number;
  below15: number;
  below20: number;
  fracBelow15: number;
  fracBelow20: number;
}

function angleStats(values: number[]): AngleStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number): number => (n === 0 ? 0 : sorted[Math.min(n - 1, Math.floor(q * n))]);
  let b15 = 0;
  let b20 = 0;
  for (const v of sorted) {
    if (v < 15) b15++;
    if (v < 20) b20++;
  }
  const denom = Math.max(1, n);
  return {
    count: n,
    minDeg: n > 0 ? sorted[0] : 0,
    p05Deg: at(0.05),
    medianDeg: at(0.5),
    below15: b15,
    below20: b20,
    fracBelow15: b15 / denom,
    fracBelow20: b20 / denom,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The global warp-domain ceiling audit
// ─────────────────────────────────────────────────────────────────────────────

export interface WarpDomainCeilingResult {
  config: {
    styleId: 'SuperformulaBlossom';
    packedParams: number[];
    dims: { H: number; Rt: number; Rb: number; expn: number };
    mBase: number;
    mTop: number;
    /** Half-integer φ feature lines per petal (1 crest + 1 valley = 2). */
    featuresPerPetal: number;
    /** φ-cells per petal actually used — either the fixed override or the value
     *  DERIVED from the aspect constraint at the worst-petal row. */
    phiSamplesPerPetal: number;
    /** TRUE when phiSamplesPerPetal was derived from the surface aspect (false
     *  when the caller pinned a fixed override). */
    aspectDerived: boolean;
    /** The aspect target the φ count was sized to honor (cross ≤ aspectMax×along). */
    aspectMax: number;
    /** Worst-row one-petal cross-feature 3D extent (mm) at Δφ=1. */
    worstPetalCrossMm: number;
    /** Along-feature 3D spacing (mm) at that worst row (|∂P/∂t|·Δt). */
    alongSpacingAtWorstMm: number;
    /** Achieved cross/along aspect of a cell at the worst row (≤ aspectMax ⇒
     *  the constraint is satisfied). */
    achievedAspect: number;
    /** t rows over [0,1]. */
    tRows: number;
    tBandLo: number;
    tBandHi: number;
  };

  /** (1) Full-domain ceiling, ALL cells. */
  all: AngleStats;
  /** (1) Region-tagged ceilings. */
  crest: AngleStats;
  valley: AngleStats;
  bulk: AngleStats;
  /** (3) The partial seam cells (φ ∈ [⌊m(t)⌋, m(t)]). */
  seam: AngleStats;
  /** (4) Cells straddling a petal-birth row. */
  birth: AngleStats;

  /** (2) Fold detection — the surface signed-area sign over (φ,t). */
  jacobian: {
    /** Nodes where (∂P/∂φ × ∂P/∂t)·n̂_ref evaluated. */
    samples: number;
    positiveSign: number;
    negativeSign: number;
    nearZero: number;
    /** TRUE iff the sign is single-signed everywhere (no fold). */
    singleSigned: boolean;
    /** Worst (smallest |signed area|) — a near-degenerate (potential fold). */
    minAbsSignedArea: number;
    /** The planar (φ,t)→(u,t) Jacobian det = 1/m(t): min over the domain
     *  (>0 ⇒ the coordinate change is a monotone bijection, no planar fold). */
    minPlanarDet: number;
  };

  /** (3) Seam-closure gap: worst 3D distance (mm) between the u=0 node and the
   *  u=1 node at the same t (must be ~0 by periodicity — the watertight proof). */
  seamGap: {
    samples: number;
    maxGapMm: number;
    rmsGapMm: number;
    /** The t where the worst gap occurs. */
    worstT: number;
    /** φ at u=1 (= m(t)) at the worst t — shows the non-integer period. */
    worstPhiAtSeam: number;
  };

  /** (4) Petal-birth events located on the closed-form m(t). */
  births: Array<{
    kind: 'crest' | 'valley';
    /** The feature index j (crest φ=j−0.5, valley φ=j). */
    j: number;
    /** The t where m(t) = j−0.5 (crest) or m(t) = j (valley). */
    tBirth: number;
    /** φ of the newborn line. */
    phi: number;
  }>;
}

export interface WarpDomainCeilingOptions {
  /** φ-cells per petal (the aspect knob). When set, OVERRIDES aspect derivation
   *  and uses a fixed integer count (lets a caller probe the aspect cliff). One
   *  full petal is Δφ = 1, so phiSamplesPerPetal=2 ⇒ Δφ = 0.5. */
  phiSamplesPerPetal?: number;
  /** t rows over the band. Default 64 (Δz ≈ 1.875mm at H=120) — chosen so an
   *  aspect-MATCHED φ grid is feasible at a sane column count; the production
   *  featureLevel-7 along-feature density is far finer, but matching THAT (Δz ≈
   *  0.47mm) needs ~117 φ-cells/petal — see the report. */
  tRows?: number;
  /** Feature-band t-extent. Default [0,1] (the WHOLE wall — caps are pinned
   *  rings handled separately, but the warp must cover the full height). */
  tBandLo?: number;
  tBandHi?: number;
  /** Finite-difference step in (φ,t) for the Jacobian. Default 1e-5. */
  fdStep?: number;
  /** When `phiSamplesPerPetal` is NOT set, DERIVE the φ count per petal from the
   *  surface so the cross-feature 3D cell extent ≤ aspectMax × the along-feature
   *  3D spacing (the HARD aspect constraint). Default 1 (3D-square). The count is
   *  chosen at the band's WORST (widest-petal) row and held fixed across t so the
   *  φ grid lines are watertight (no inter-row T-junctions). */
  aspectMax?: number;
}

/**
 * Run the GLOBAL feature-aligned warp ceiling for SFB@1. Builds a regular grid
 * in (φ, t) with φ-spacing ≤ 1 (aspect-safe), maps every node φ→u=φ/m(t)→3D,
 * and measures the 3D cell quality across the FULL domain (region-tagged),
 * the Jacobian sign (fold detection), the seam-closure gap, and the petal-birth
 * geometry. Returns the four channels separately — a fold or seam gap reported
 * truthfully is the valuable negative result.
 */
export function runWarpDomainCeilingAudit(
  opts: WarpDomainCeilingOptions = {},
): WarpDomainCeilingResult {
  const phiPerPetalFixed =
    opts.phiSamplesPerPetal !== undefined
      ? Math.max(1, Math.floor(opts.phiSamplesPerPetal))
      : 0; // 0 ⇒ derive from the aspect constraint below
  const tRows = Math.max(2, Math.floor(opts.tRows ?? 64));
  const tLo = opts.tBandLo ?? 0;
  const tHi = opts.tBandHi ?? 1;
  const h = opts.fdStep ?? 1e-5;

  const p = Float32Array.from(SFB1_PACKED);
  const surf: PositionSampler = new SfbWallSampler(p);
  const mBase = mOf(p, 0);
  const mTop = mOf(p, 1);

  // 3D position from a (φ, t) node: u = φ/m(t) (wrap into [0,1) for the
  // sampler), then SfbWallSampler. The seam node φ=m(t) maps to u=1 ≡ u=0.
  const P = (phi: number, t: number): V3 => {
    const m = mOf(p, t);
    const u = phi / m;
    return surf.position(wrapU(u), t);
  };

  // ── Aspect-driven φ count (the HARD constraint: cross ≤ aspectMax×along) ──
  // The cross-feature 3D extent of a Δφ cell is |∂P/∂φ|·Δφ; the along-feature
  // 3D extent is |∂P/∂t|·Δt. We choose Δφ so the WIDEST-petal row in the band
  // is aspect-safe, then hold it fixed across t (uniform φ lattice ⇒ watertight
  // horizontal grid lines, no inter-row T-junctions). |∂P/∂φ| peaks where the
  // circumference 2πr is largest and m smallest — measured, not assumed.
  const aspectMax = opts.aspectMax ?? 1;
  const dtBand = (tHi - tLo) / tRows;
  let worstCrossPerPetal = 0; // max over the band of |∂P/∂φ| at Δφ=1
  let alongAtWorst = 1;
  const aspectRows = 64;
  for (let i = 0; i <= aspectRows; i++) {
    const t = tLo + ((tHi - tLo) * i) / aspectRows;
    const tt = t <= tLo ? tLo + h : t >= tHi ? tHi - h : t;
    // |∂P/∂φ| via FD; one petal (Δφ=1) cross extent ≈ |∂P/∂φ|·1.
    const dPdphi = len(sub(P(0.25, tt), P(0.25 + 1, tt))) / 1; // φ-span of exactly one petal
    const dPdt = len(sub(P(0.25, Math.min(tHi, tt + h)), P(0.25, Math.max(tLo, tt - h)))) / (2 * h);
    const crossPerPetal = dPdphi; // 3D length of one full petal at this row
    if (crossPerPetal > worstCrossPerPetal) {
      worstCrossPerPetal = crossPerPetal;
      alongAtWorst = dPdt * dtBand;
    }
  }
  // φ-cells per petal so the worst-row cross extent ≤ aspectMax × along spacing.
  // Round UP to an EVEN count so every feature line (crests at φ=j−0.5, valleys
  // at φ=j — i.e. multiples of 0.5) lands EXACTLY on a φ grid LINE: the crest is
  // then a shared column edge (both flank cells derive the identical u) — the
  // watertight aligned placement, not a chord cutting across a cell.
  const phiNeeded =
    phiPerPetalFixed > 0
      ? phiPerPetalFixed
      : Math.max(1, Math.ceil(worstCrossPerPetal / Math.max(1e-9, aspectMax * alongAtWorst)));
  const phiPerPetalAuto = phiPerPetalFixed > 0 ? phiNeeded : phiNeeded + (phiNeeded % 2);
  const dPhi = 1 / phiPerPetalAuto;

  // ── (4) Petal-birth events on the closed-form monotone m(t) ──
  const births: WarpDomainCeilingResult['births'] = [];
  const mMin = Math.min(mBase, mTop);
  const mMax = Math.max(mBase, mTop);
  const solveBirth = (need: number): number | null => {
    // m(t) = need on the monotone m(t); only if it is crossed inside (0,1).
    if (need <= mMin + 1e-12 || need >= mMax - 1e-12) return null;
    let lo = 0;
    let hi = 1;
    const inc = mTop >= mBase;
    for (let it = 0; it < 80; it++) {
      const mid = (lo + hi) / 2;
      const inside = mOf(p, mid) > need;
      if (inc ? inside : !inside) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  for (let j = 1; j <= Math.ceil(mMax) + 1; j++) {
    const tc = solveBirth(j - 0.5); // crest line φ = j − 0.5
    if (tc !== null) births.push({ kind: 'crest', j, tBirth: tc, phi: j - 0.5 });
    const tv = solveBirth(j); // valley line φ = j
    if (tv !== null) births.push({ kind: 'valley', j, tBirth: tv, phi: j });
  }
  births.sort((a, b) => a.tBirth - b.tBirth);
  const birthTs = births.map((b) => b.tBirth);
  const nearBirth = (t0: number, t1: number): boolean =>
    birthTs.some((tb) => tb >= t0 - 1e-9 && tb <= t1 + 1e-9);

  // ── (1) + (3) Cell quality over the full (φ, t) domain ──
  const allVals: number[] = [];
  const crestVals: number[] = [];
  const valleyVals: number[] = [];
  const bulkVals: number[] = [];
  const seamVals: number[] = [];
  const birthVals: number[] = [];

  for (let it = 0; it < tRows; it++) {
    const t0 = tLo + ((tHi - tLo) * it) / tRows;
    const t1 = tLo + ((tHi - tLo) * (it + 1)) / tRows;
    const tm = (t0 + t1) / 2;
    // φ runs [0, m(t)); use m at the row midpoint to enumerate full columns,
    // and place a PARTIAL seam cell for the residual [⌊nFull·dPhi⌋ … m(tm)].
    const mMid = mOf(p, tm);
    const nFull = Math.floor(mMid / dPhi); // full dPhi-wide columns
    const rowIsBirth = nearBirth(t0, t1);

    for (let k = 0; k < nFull; k++) {
      const phiLo = k * dPhi;
      const phiHi = (k + 1) * dPhi;
      // Quad CCW: (phiLo,t0) (phiHi,t0) (phiHi,t1) (phiLo,t1), mapped to (u,t).
      const quad: CellPoint[] = [
        toUT(phiLo, t0, p),
        toUT(phiHi, t0, p),
        toUT(phiHi, t1, p),
        toUT(phiLo, t1, p),
      ];
      const a = polygonBestMinAngle3D(quad, surf);
      allVals.push(a);
      const region = regionOfCell(phiLo, phiHi);
      if (region === 'crest') crestVals.push(a);
      else if (region === 'valley') valleyVals.push(a);
      else bulkVals.push(a);
      if (rowIsBirth) birthVals.push(a);
    }

    // ── (3) Partial seam cell: φ ∈ [nFull·dPhi, m(tm)] closing onto u=1≡u=0. ──
    const phiSeamLo = nFull * dPhi;
    // The seam closes at u=1 ≡ u=0, i.e. φ = m(t) at each t — NOT a fixed φ,
    // because m varies in t. Use φ = m(t0) at t0 and φ = m(t1) at t1 so the
    // right edge IS the literal u=1 column (the watertight seam line).
    const seamQuad: CellPoint[] = [
      toUT(phiSeamLo, t0, p),
      { u: 1, t: t0 }, // u=1 ≡ u=0 seam node (φ = m(t0))
      { u: 1, t: t1 },
      toUT(phiSeamLo, t1, p),
    ];
    // Skip a degenerate seam sliver if the residual is sub-µ-petal (phiSeamLo
    // already ~ m(t)); otherwise measure it as a real cell.
    if (mMid - phiSeamLo > 1e-6) {
      const sa = polygonBestMinAngle3D(seamQuad, surf);
      allVals.push(sa);
      seamVals.push(sa);
      if (rowIsBirth) birthVals.push(sa);
    }
  }

  // ── (2) Jacobian sign over a dense (φ, t) node lattice ──
  // FOLD TEST (faithful): a fold of the (φ,t) PARAMETRIZATION is an orientation
  // flip of (∂P/∂φ × ∂P/∂t) relative to the surface's OWN outward normal — NOT
  // relative to a single fixed reference (which would mis-read the petal normal
  // sweeping past 90° as a "fold" on a non-convex blossom). The outward normal
  // is the radial direction n_rad = (P_xy)/|P_xy| (pottery walls are radial
  // graphs); the parametric area-vector projected on n_rad is single-signed iff
  // the map preserves orientation everywhere. We ALSO track the bare |area| so a
  // VANISHING Jacobian (the true degeneracy a fold passes through) is visible.
  let jPos = 0;
  let jNeg = 0;
  let jZero = 0;
  let minAbsArea = Infinity;
  let minPlanarDet = Infinity;
  const jacRows = Math.min(tRows, 129);
  const jacCols = Math.max(8, phiPerPetalAuto * 6);
  for (let it = 0; it <= jacRows; it++) {
    const t = tLo + ((tHi - tLo) * it) / jacRows;
    const tt = t <= tLo ? tLo + h : t >= tHi ? tHi - h : t;
    const m = mOf(p, tt);
    // planar det of (φ,t)→(u,t) is ∂u/∂φ = 1/m (∂u/∂t cancels in the 2×2 with
    // the identity t-row) — strictly positive for m>0 (monotone bijection).
    const planarDet = 1 / m;
    if (planarDet < minPlanarDet) minPlanarDet = planarDet;
    for (let k = 0; k <= jacCols; k++) {
      const phi = (m * k) / jacCols; // sweep φ across the full [0, m(t)]
      const Pc = P(phi, tt);
      const dPdphi = sub(P(phi + h, tt), P(phi - h, tt));
      const dPdt = sub(P(phi, Math.min(tHi, tt + h)), P(phi, Math.max(tLo, tt - h)));
      const area = cross(dPdphi, dPdt);
      // Local outward radial normal (pottery wall is a radial graph).
      const rxy = Math.hypot(Pc[0], Pc[1]);
      const nRad: V3 = rxy > 1e-12 ? [Pc[0] / rxy, Pc[1] / rxy, 0] : [1, 0, 0];
      const signed = dot(area, nRad);
      const aLen = len(area);
      if (aLen < minAbsArea) minAbsArea = aLen;
      if (signed > 1e-12) jPos++;
      else if (signed < -1e-12) jNeg++;
      else jZero++;
    }
  }
  const jacSamples = jPos + jNeg + jZero;
  const singleSigned = (jPos === 0 || jNeg === 0) && jZero === 0;

  // ── (3) Seam-closure gap: |P(u=0,t) − P(u=1,t)| over the rows. ──
  let maxGap = 0;
  let sumSqGap = 0;
  let worstT = tLo;
  let worstPhiAtSeam = mBase;
  const seamSamples = tRows + 1;
  for (let it = 0; it <= tRows; it++) {
    const t = tLo + ((tHi - tLo) * it) / tRows;
    const p0 = surf.position(0, t);
    const p1 = surf.position(1, t); // wrapU(1)=0, but we pass 1 to exercise the seam
    const g = len(sub(p1, p0));
    sumSqGap += g * g;
    if (g > maxGap) {
      maxGap = g;
      worstT = t;
      worstPhiAtSeam = mOf(p, t);
    }
  }

  return {
    config: {
      styleId: 'SuperformulaBlossom',
      packedParams: [...SFB1_PACKED],
      dims: { ...SFB_DIMS },
      mBase,
      mTop,
      featuresPerPetal: 2,
      phiSamplesPerPetal: phiPerPetalAuto,
      aspectDerived: phiPerPetalFixed === 0,
      aspectMax,
      worstPetalCrossMm: worstCrossPerPetal,
      alongSpacingAtWorstMm: alongAtWorst,
      achievedAspect: worstCrossPerPetal / phiPerPetalAuto / Math.max(1e-9, alongAtWorst),
      tRows,
      tBandLo: tLo,
      tBandHi: tHi,
    },
    all: angleStats(allVals),
    crest: angleStats(crestVals),
    valley: angleStats(valleyVals),
    bulk: angleStats(bulkVals),
    seam: angleStats(seamVals),
    birth: angleStats(birthVals),
    jacobian: {
      samples: jacSamples,
      positiveSign: jPos,
      negativeSign: jNeg,
      nearZero: jZero,
      singleSigned,
      minAbsSignedArea: Number.isFinite(minAbsArea) ? minAbsArea : 0,
      minPlanarDet: Number.isFinite(minPlanarDet) ? minPlanarDet : 0,
    },
    seamGap: {
      samples: seamSamples,
      maxGapMm: maxGap,
      rmsGapMm: Math.sqrt(sumSqGap / seamSamples),
      worstT,
      worstPhiAtSeam,
    },
    births,
  };
}

/** Map a (φ, t) node to a (u, t) CellPoint. u = φ/m(t); wrapped into [0,1) for
 *  the sampler, EXCEPT exact-seam φ=m(t) is left at u=1 by the caller. */
function toUT(phi: number, t: number, p: Float32Array | readonly number[]): CellPoint {
  const m = mOf(p, t);
  return { u: wrapU(phi / m), t };
}
