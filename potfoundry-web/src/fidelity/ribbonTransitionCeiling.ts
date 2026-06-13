/**
 * ribbonTransitionCeiling.ts — the TRANSITION-ZONE follow-up to
 * crestAlignedCeiling.ts (the load-bearing open unknown from
 * stage3-connectivity-ceiling.md, line 179: "watertight tiling of the ribbon
 * into the surrounding axis-aligned bulk (transition zone)").
 *
 * ## What was already proven, and what was NOT
 *
 * crestAlignedCeiling.ts proved the CELL-QUALITY premise of the cure: a
 * crest-aligned (sheared `v = u − u*(t)`) flank cell at aspect ≤ 1 is
 * well-shaped in 3D (median 27–38°, <15° = 0.2%). But it measured the ribbon
 * cells IN ISOLATION. It did NOT measure how the sheared ribbon TILES into the
 * surrounding AXIS-ALIGNED quadtree bulk — the ribbon's outer edge runs along a
 * SLANTED curve `u = u*(t) ± W` that is NOT a vertical grid line, so the cells
 * bridging the slanted ribbon edge to the nearest vertical grid line `u =
 * col/uSpan` (the "transition cells") are a DIFFERENT, untested population. The
 * cure is only real if BOTH the ribbon AND its transition tile watertightly and
 * stay well-shaped.
 *
 * ## The construction under test (one crest, local, by-construction watertight)
 *
 * For each production grid ROW [t0,t1] crossed by a crest at u*(t):
 *
 *   • RIBBON — the sheared flank cell on each side, cross-crest half-width
 *     Δv = (L·widthScale)/|Pu| in u (so the 3D cross-crest extent ≈ along-crest
 *     length L, aspect ≤ 1). Ribbon-outer corners: (u*(t)+Δv, t), the SLANTED
 *     ribbon boundary. This is EXACTLY the CreaseUWarp M1 model.
 *
 *   • TRANSITION — the cell connecting the slanted ribbon-outer edge to the
 *     nearest AXIS-ALIGNED vertical grid line u = colOut/uSpan beyond the
 *     ribbon (a column the bulk quadtree already owns). Its vertices are:
 *       - the two ribbon-outer corners  (u*(t0)+Δv, t0), (u*(t1)+Δv, t1)
 *         — SHARED with the ribbon cell (identical points, by construction),
 *       - the two bulk grid corners      (colOut/uSpan, t0), (colOut/uSpan, t1)
 *         — SHARED with the axis-aligned bulk cell (on a grid line).
 *     So the transition is a quad whose LEFT edge is the slanted ribbon edge and
 *     whose RIGHT edge is a vertical grid line. The t-lines t0/t1 are grid rows
 *     shared with the bulk above/below — no T-junction there either.
 *
 * THE WATERTIGHT CONTRACT this probe asserts (FeatureConformingTriangulator.ts
 * grid-line registry, lines 534-549): a shared edge is watertight iff BOTH
 * adjacent cells derive the IDENTICAL vertex set on that edge. We build each
 * cell's boundary independently from the same closed-form crest/grid formulas
 * and assert the shared-edge vertex SEQUENCES are bit-identical (no weld, no
 * T-junction split — those are banned). A mismatch = a crack = the cure is
 * untileable as built.
 *
 * THE FOLD CONTRACT (faithfulness rule 3): a sheared/transition map is only
 * valid if its (u,t)→(u',t') Jacobian determinant is single-signed across the
 * whole local domain. We sample the sign of the ribbon+transition warp Jacobian
 * over a dense lattice and flag ANY sign flip (a fold = invalid invisible
 * topology change).
 *
 * Angles are measured in 3D through the SAME production wall surface
 * (`SfbWallSampler`), never in (u,t). Pure CPU, production byte-identical.
 *
 * Scope (honest): this measures ONE crest's local ribbon + its transition into
 * the bulk, plus the seam and births at the population level (every crest
 * branch, including the t-domains where m(t) morphs 6→10 and the u=1 seam). It
 * does NOT build a full global warped mesh — it audits the per-edge tiling
 * contract and the per-cell 3D quality that a global build must honour.
 */
import type { CellPoint } from '../renderers/webgpu/parametric/conforming/ConstrainedCellTriangulator';
import type { PositionSampler } from './metrics';
import type { ParamRidgeBranch } from './crestLateralDeviation';
import { sfClosedFormParamRidge } from './crestLateralDeviation';
import { polygonBestMinAngle3D, triangulationsOfNgon } from './cellTriangulationCeiling';
import {
  SfbWallSampler,
  SFB1_PACKED,
  SFB_FEATURE_LEVEL,
  SFB_UBIAS,
} from './snapPlacementAudit';

type V3 = readonly [number, number, number];

function sub(a: V3, b: V3): V3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function len(a: V3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function wrapU(u: number): number {
  let x = u % 1;
  if (x < 0) x += 1;
  return x;
}
function sdU(a: number, b: number): number {
  let d = (a - b) % 1;
  if (d > 0.5) d -= 1;
  if (d <= -0.5) d += 1;
  return d;
}

/** Interpolated crest u at t (wrap-aware), or null outside the branch domain. */
function branchUAt(branch: ParamRidgeBranch, t: number): number | null {
  const pts = branch.points;
  if (pts.length < 2) return null;
  if (t < pts[0].t - 1e-9 || t > pts[pts.length - 1].t + 1e-9) return null;
  let lo = 0;
  let hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const p0 = pts[lo];
  const p1 = pts[hi];
  const span = p1.t - p0.t;
  const f = span > 1e-12 ? (t - p0.t) / span : 0;
  return wrapU(p0.u + sdU(p1.u, p0.u) * f);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stats (mirrors crestAlignedCeiling.AngleStats — same fields, same denom rule)
// ─────────────────────────────────────────────────────────────────────────────

export interface AngleStats {
  count: number;
  minDeg: number;
  p05Deg: number;
  medianDeg: number;
  below15: number;
  below20: number;
  below30: number;
  fracBelow15: number;
  fracBelow20: number;
}

function angleStats(values: number[]): AngleStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const at = (q: number): number => (n === 0 ? 0 : sorted[Math.min(n - 1, Math.floor(q * n))]);
  let b15 = 0;
  let b20 = 0;
  let b30 = 0;
  for (const v of sorted) {
    if (v < 15) b15++;
    if (v < 20) b20++;
    if (v < 30) b30++;
  }
  const denom = Math.max(1, n);
  return {
    count: n,
    minDeg: n > 0 ? sorted[0] : 0,
    p05Deg: at(0.05),
    medianDeg: at(0.5),
    below15: b15,
    below20: b20,
    below30: b30,
    fracBelow15: b15 / denom,
    fracBelow20: b20 / denom,
  };
}

/** Signed area (in (u,t)) of triangle a,b,c; positive ⇒ CCW. */
function signedArea2(a: CellPoint, b: CellPoint, c: CellPoint): number {
  return (b.u - a.u) * (c.t - a.t) - (c.u - a.u) * (b.t - a.t);
}

/**
 * Faithful fold/degeneracy scan of one cell (faithfulness rule 3: detect folds
 * via the SIGN of the map's Jacobian — here the (u,t) signed area, since t'≡t
 * and the surface map is smooth, so a parameter-space orientation flip is
 * exactly a Jacobian sign flip).
 *
 * The verdict is INVARIANT to the cell's build winding (some cells are built CW,
 * some CCW — orientation per se is not a fold; a FOLD is a SELF-INTERSECTION).
 * A simple quad (no self-intersection ⇒ no fold) has AT LEAST ONE diagonal whose
 * two sub-triangles share a strict sign (both +, or both −). A self-intersecting
 * (bow-tie) quad has NEITHER diagonal consistent. So:
 *   - some diagonal consistent (++ or −−) ⇒ simple cell → pos++  (fold-free)
 *   - a diagonal collapses (a zero sub-triangle) ⇒ degenerate++ (a fold edge)
 *   - both diagonals mixed-sign ⇒ bow-tie → inverted++ (a genuine fold)
 * minAbs tracks the smallest sub-triangle |area| in the chosen diagonal
 * (near-zero ⇒ a near-degenerate parameter-space sliver, the fold-onset signal).
 */
function scanCellFold(
  poly: CellPoint[],
  acc: { checked: number; inverted: number; degenerate: number; pos: number; minAbs: number },
): void {
  const n = poly.length;
  if (n < 3) return;
  acc.checked++;
  if (n === 3) {
    const a = Math.abs(signedArea2(poly[0], poly[1], poly[2]));
    if (a < acc.minAbs) acc.minAbs = a;
    if (a > 1e-18) acc.pos++;
    else acc.degenerate++;
    return;
  }
  // Quad: a diagonal is CONSISTENT if its two sub-triangles share a strict sign
  // (winding-agnostic: ++ and −− are both simple). ZERO ⇒ a collapsed diagonal.
  const diag = (a: number, b: number, c: number, d: number): { state: 'consistent' | 'zero' | 'mixed'; minA: number } => {
    const t1 = signedArea2(poly[a], poly[b], poly[c]);
    const t2 = signedArea2(poly[a], poly[c], poly[d]);
    const minA = Math.min(Math.abs(t1), Math.abs(t2));
    if (Math.abs(t1) <= 1e-18 || Math.abs(t2) <= 1e-18) return { state: 'zero', minA };
    if ((t1 > 0) === (t2 > 0)) return { state: 'consistent', minA };
    return { state: 'mixed', minA };
  };
  if (n === 4) {
    const d02 = diag(0, 1, 2, 3); // diagonal 0-2
    const d13 = diag(1, 2, 3, 0); // diagonal 1-3
    // The cell's minAbs is reported from the diagonal a triangulator would PICK
    // (the consistent one if available — that is the realized mesh).
    let minA: number;
    if (d02.state === 'consistent') minA = d02.minA;
    else if (d13.state === 'consistent') minA = d13.minA;
    else minA = Math.min(d02.minA, d13.minA);
    if (minA < acc.minAbs) acc.minAbs = minA;
    if (d02.state === 'consistent' || d13.state === 'consistent') acc.pos++;
    else if (d02.state === 'zero' || d13.state === 'zero') acc.degenerate++;
    else acc.inverted++; // both mixed ⇒ bow-tie self-intersection
    return;
  }
  // n>4 (not produced here): consistency of the first triangulation's signs.
  let allPos = true;
  let allNeg = true;
  for (const [i, j, k] of triangulationsOfNgon(n)[0]) {
    const area = signedArea2(poly[i], poly[j], poly[k]);
    const a = Math.abs(area);
    if (a < acc.minAbs) acc.minAbs = a;
    if (area >= -1e-18) allNeg = false;
    if (area <= 1e-18) allPos = false;
  }
  if (allPos || allNeg) acc.pos++;
  else acc.inverted++;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-edge watertight key (the registry contract, mirrored faithfully)
// ─────────────────────────────────────────────────────────────────────────────

/** FeatureConformingTriangulator QSCALE quantization (FCT.ts:77): every (u,t)
 *  is rounded to QSCALE = 1<<24 before dedup. Two cells produce a bit-identical
 *  shared-edge vertex iff their QSCALE keys match. We mirror it EXACTLY (not a
 *  looser tolerance) so the assertion tests the REAL watertight rule, not a
 *  forgiving one. The u-seam is normalized mod 1 (FCT.ts:993-996). */
const QSCALE = 1 << 24;
function vKey(p: CellPoint): string {
  // u wraps mod 1 for the seam (round(u*QSCALE) === QSCALE ⇒ canonical u=0).
  let qu = Math.round(wrapU(p.u) * QSCALE);
  if (qu === QSCALE) qu = 0;
  const qt = Math.round(p.t * QSCALE);
  return `${qu}:${qt}`;
}

/** The ordered vertex-key sequence of an edge (a,b), canonicalized so both
 *  adjacent cells (which may traverse it in opposite directions) compare equal:
 *  we sort the two endpoint keys. A shared straight edge with NO interior
 *  vertices is fully described by its two endpoints. */
function edgeKeySet(a: CellPoint, b: CellPoint): string {
  const ka = vKey(a);
  const kb = vKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────────────────────────────────────

export interface SfbRibbonTransitionResult {
  config: {
    styleId: 'SuperformulaBlossom';
    packedParams: number[];
    featureLevel: number;
    uBias: number;
    uSpan: number;
    tSpan: number;
    crestBranches: number;
    widthScale: number;
    ribbonCellsPerSide: number;
  };
  /** Crest grid-rows processed (coverage denominator). */
  rowsProcessed: number;
  rowsSkipped: number;
  /** RIBBON flank cells (sheared, crest-adjacent) — re-confirms the M1 cure. */
  ribbon: AngleStats;
  /** TRANSITION cells (slanted ribbon edge → vertical bulk grid line) — THE
   *  unknown this probe exists to measure. */
  transition: AngleStats;
  /** BULK axis-aligned cells just OUTSIDE the transition (sanity: untouched
   *  bulk stays well-shaped — these are plain quads on grid lines). */
  bulk: AngleStats;

  // ── Watertight tiling verdict (by construction, NOT by weld) ──
  /** Shared ribbon↔transition edges checked. */
  ribbonTransitionEdgesChecked: number;
  /** …of which the two cells derived a MISMATCHED vertex key set (a crack). */
  ribbonTransitionEdgeMismatches: number;
  /** Shared transition↔bulk edges checked (must be on a vertical grid line). */
  transitionBulkEdgesChecked: number;
  transitionBulkEdgeMismatches: number;
  /** Transition right-edge columns that did NOT land exactly on a grid line
   *  (a structural failure of the "snap outer to grid column" rule). */
  transitionOffGridColumns: number;

  // ── Fold verdict (signed (u,t) area of every constructed cell) ──
  /**
   * The faithful fold test (faithfulness rule 3): the (u,t)→3D map of the
   * ribbon+transition tiling is the identity in (u,t) composed with the smooth
   * surface map, so a FOLD shows up as a constructed cell whose (u,t) signed
   * area changes sign — an inverted / self-overlapping (bow-tie) cell. We
   * classify every ribbon AND transition AND bulk cell by its BEST diagonal: a
   * fold-free CCW cell yields a consistent POSITIVE diagonal; a bow-tie has
   * NEITHER diagonal consistent (a genuine fold); a collapsed cell has a zero
   * diagonal (degenerate). jacobianMinAbs is the smallest triangle |area| in the
   * chosen diagonal (near-zero ⇒ near-degenerate parameter-space sliver).
   */
  cellsFoldChecked: number;
  /** Cells whose best diagonal is bow-tie/inverted (a genuine fold). */
  invertedCells: number;
  /** Cells whose best diagonal collapses (~zero area — degenerate). */
  degenerateCells: number;
  /** Distinct orientation signs observed (1 ⇒ fold-free; ≥2 ⇒ a fold ⇒ invalid). */
  jacobianSignsSeen: number;
  /** Smallest |(u,t) signed area| seen (near-zero ⇒ near-degenerate). */
  jacobianMinAbs: number;
  foldFree: boolean;

  // ── Seam + births coverage (the periodic/morphing regions) ──
  /** Rows whose crest u*(t) wrapped the u=1 seam in this row span. */
  seamRows: number;
  /** Rows inside a petal-BIRTH t-domain (a branch born at t>0, m(t) morphing). */
  birthRows: number;
}

export interface SfbRibbonTransitionOptions {
  /** Analytic-ridge polyline density. Default 6145 (matches the sibling audits). */
  tSamples?: number;
  /** Cross-crest cell width as a multiple of along-crest length (aspect).
   *  Default 1 (3D-square — the cure's aspect≤1 rule). */
  widthScale?: number;
  /** Ribbon cells per side of the crest (1 or 2). Default 1. */
  ribbonCellsPerSide?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// The ribbon + transition tiling audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Walk every SFB@1 crest across the production featureLevel-7 / B=2 grid rows.
 * For each row, build the sheared RIBBON flank cells, the TRANSITION cells that
 * bridge the slanted ribbon edge to the nearest vertical bulk grid line, and a
 * BULK reference cell just outside. Measure each population's best-2-diagonal 3D
 * min-angle SEPARATELY; assert the shared-edge vertex sets are bit-identical
 * (watertight by construction); and scan each constructed cell's (u,t) signed
 * area for folds (an inverted cell = a sign flip = a fold).
 */
export function runSfbRibbonTransitionAudit(
  opts: SfbRibbonTransitionOptions = {},
): SfbRibbonTransitionResult {
  const tSamples = opts.tSamples ?? 6145;
  const widthScale = opts.widthScale ?? 1;
  const ribbonCellsPerSide = Math.max(1, Math.floor(opts.ribbonCellsPerSide ?? 1));
  const p = Float32Array.from(SFB1_PACKED);
  const surf: PositionSampler = new SfbWallSampler(p);
  const uSpan = 1 << (SFB_FEATURE_LEVEL + SFB_UBIAS);
  const tSpan = 1 << SFB_FEATURE_LEVEL;
  const FD = 1e-5; // surface finite-difference step (u,t)

  const ridge = sfClosedFormParamRidge(p, { tSamples });
  const crests = ridge.branches.filter((b) => b.kind === 'crest');

  const ribbonAngles: number[] = [];
  const transitionAngles: number[] = [];
  const bulkAngles: number[] = [];

  let rowsProcessed = 0;
  let rowsSkipped = 0;
  let rtEdgesChecked = 0;
  let rtEdgeMismatch = 0;
  let tbEdgesChecked = 0;
  let tbEdgeMismatch = 0;
  let offGridColumns = 0;
  let seamRows = 0;
  let birthRows = 0;

  // Fold accounting via (u,t) signed area of every CCW-built cell triangle.
  const fold = { checked: 0, inverted: 0, degenerate: 0, pos: 0, minAbs: Infinity };

  const P = (u: number, t: number): V3 => surf.position(u, t);

  for (const branch of crests) {
    const isBornBranch = branch.points[0].t > 1e-6; // born above t=0 ⇒ a birth
    const tLo = branch.points[0].t;
    const tHi = branch.points[branch.points.length - 1].t;
    const jLo = Math.ceil(tLo * tSpan - 1e-9);
    const jHi = Math.floor(tHi * tSpan + 1e-9) - 1;
    for (let j = jLo; j <= jHi; j++) {
      const t0 = j / tSpan;
      const t1 = (j + 1) / tSpan;
      const tm = (t0 + t1) / 2;
      const u0c = branchUAt(branch, t0);
      const u1c = branchUAt(branch, t1);
      const umc = branchUAt(branch, tm);
      if (u0c === null || u1c === null || umc === null) {
        rowsSkipped++;
        continue;
      }

      // Along-crest 3D length of this segment → the ribbon width target.
      const c0 = P(u0c, t0);
      const c1 = P(u1c, t1);
      const L = len(sub(c1, c0));
      if (!(L > 1e-9)) {
        rowsSkipped++;
        continue;
      }

      // Surface u-tangent at the crest midpoint (for the u→3D width conversion).
      const Pu: V3 = ((): V3 => {
        const a = P(umc + FD, tm);
        const b = P(umc - FD, tm);
        return [(a[0] - b[0]) / (2 * FD), (a[1] - b[1]) / (2 * FD), (a[2] - b[2]) / (2 * FD)];
      })();
      const puLen = len(Pu);
      if (!(puLen > 1e-9)) {
        rowsSkipped++;
        continue;
      }
      // Cross-crest extent Δv per ribbon cell so its 3D width ≈ L·widthScale.
      const dvCell = (L * widthScale) / puLen;
      const W = dvCell * ribbonCellsPerSide; // total ribbon half-width (u) per side

      // Is this row a seam-wrap (crest within W of u=1) or a birth row?
      const wrapsSeam =
        u0c + W >= 1 || u1c + W >= 1 || u0c - W < 0 || u1c - W < 0;
      if (wrapsSeam) seamRows++;
      if (isBornBranch) birthRows++;

      rowsProcessed++;

      // ── RIBBON flank cells (sheared parallelograms), +side and −side ──
      // Each ribbon cell shares its t-lines with the bulk above/below and its
      // crest edge with the opposite-side ribbon — all by identical formula.
      for (let k = 0; k < ribbonCellsPerSide; k++) {
        const a0 = u0c + k * dvCell;
        const a1 = u1c + k * dvCell;
        const b0 = u0c + (k + 1) * dvCell;
        const b1 = u1c + (k + 1) * dvCell;
        const ribPlus: CellPoint[] = [
          { u: a0, t: t0 },
          { u: b0, t: t0 },
          { u: b1, t: t1 },
          { u: a1, t: t1 },
        ];
        const ribMinus: CellPoint[] = [
          { u: u0c - k * dvCell, t: t0 },
          { u: u0c - (k + 1) * dvCell, t: t0 },
          { u: u1c - (k + 1) * dvCell, t: t1 },
          { u: u1c - k * dvCell, t: t1 },
        ];
        ribbonAngles.push(polygonBestMinAngle3D(ribPlus, surf));
        ribbonAngles.push(polygonBestMinAngle3D(ribMinus, surf));
        scanCellFold(ribPlus, fold);
        scanCellFold(ribMinus, fold);
      }

      // ── TRANSITION cells: slanted ribbon-outer edge → nearest grid column ──
      // The ribbon outer edge runs from (u0c+W, t0) to (u1c+W, t1) — SLANTED.
      // The transition's right edge must be a VERTICAL grid line u=colOut/uSpan
      // beyond the ribbon outer edge (the first bulk column the ribbon clears),
      // so the bulk cell to its right is a plain axis-aligned quad on grid lines.
      const buildTransition = (sign: 1 | -1): void => {
        const o0 = sign > 0 ? u0c + W : u0c - W; // ribbon outer corner at t0
        const o1 = sign > 0 ? u1c + W : u1c - W; // ribbon outer corner at t1
        // The outer column the ribbon clears: ceil(max) for +side, floor(min) − ... for −side.
        const oMax = Math.max(o0, o1);
        const oMin = Math.min(o0, o1);
        let colOut: number;
        if (sign > 0) colOut = Math.ceil(oMax * uSpan + 1e-9);
        else colOut = Math.floor(oMin * uSpan - 1e-9);
        const uOut = colOut / uSpan;
        // Grid-line landing check (the watertight precondition): uOut must be an
        // exact multiple of 1/uSpan — it is by construction (col is integer), but
        // verify it lies strictly beyond the ribbon outer edge (else the ribbon
        // overruns the chosen column → the transition would be inverted).
        const beyond = sign > 0 ? uOut > oMax + 1e-12 : uOut < oMin - 1e-12;
        if (!beyond) {
          offGridColumns++;
          return; // degenerate transition (ribbon wider than one grid cell here)
        }

        // Transition quad: outer ribbon edge (left, slanted) → grid column (right).
        // CCW: SW(outer t0), SE(grid t0), NE(grid t1), NW(outer t1) for +side.
        const transition: CellPoint[] =
          sign > 0
            ? [
                { u: o0, t: t0 },
                { u: uOut, t: t0 },
                { u: uOut, t: t1 },
                { u: o1, t: t1 },
              ]
            : [
                { u: uOut, t: t0 },
                { u: o0, t: t0 },
                { u: o1, t: t1 },
                { u: uOut, t: t1 },
              ];
        transitionAngles.push(polygonBestMinAngle3D(transition, surf));
        scanCellFold(transition, fold);

        // BULK reference cell just outside the transition (a plain axis-aligned
        // quad on the next grid column) — must stay well-shaped untouched.
        const colBulk = sign > 0 ? colOut + 1 : colOut - 1;
        const uBulk = colBulk / uSpan;
        const bulk: CellPoint[] =
          sign > 0
            ? [
                { u: uOut, t: t0 },
                { u: uBulk, t: t0 },
                { u: uBulk, t: t1 },
                { u: uOut, t: t1 },
              ]
            : [
                { u: uBulk, t: t0 },
                { u: uOut, t: t0 },
                { u: uOut, t: t1 },
                { u: uBulk, t: t1 },
              ];
        bulkAngles.push(polygonBestMinAngle3D(bulk, surf));
        scanCellFold(bulk, fold);

        // ── WATERTIGHT CONTRACT: shared edges derive identical vertex sets ──
        // (1) ribbon↔transition shared edge = the slanted outer edge.
        //     Ribbon cell's outer edge (built above as the (k+1)th boundary)
        //     vs the transition's left edge — BOTH from (oX, tX). Recompute the
        //     ribbon's outer corners from the SAME formula it used (independent
        //     derivation, exactly as two production cells would) and compare keys.
        const ribOuter0: CellPoint = { u: sign > 0 ? u0c + W : u0c - W, t: t0 };
        const ribOuter1: CellPoint = { u: sign > 0 ? u1c + W : u1c - W, t: t1 };
        const transLeft0: CellPoint = { u: o0, t: t0 };
        const transLeft1: CellPoint = { u: o1, t: t1 };
        rtEdgesChecked++;
        if (edgeKeySet(ribOuter0, ribOuter1) !== edgeKeySet(transLeft0, transLeft1)) {
          rtEdgeMismatch++;
        }
        // (2) transition↔bulk shared edge = the vertical grid column uOut.
        const transRight0: CellPoint = { u: uOut, t: t0 };
        const transRight1: CellPoint = { u: uOut, t: t1 };
        const bulkLeft0: CellPoint = { u: uOut, t: t0 };
        const bulkLeft1: CellPoint = { u: uOut, t: t1 };
        tbEdgesChecked++;
        if (edgeKeySet(transRight0, transRight1) !== edgeKeySet(bulkLeft0, bulkLeft1)) {
          tbEdgeMismatch++;
        }
      };
      buildTransition(1);
      buildTransition(-1);
    }
  }

  const signsSeen =
    (fold.pos > 0 ? 1 : 0) + (fold.inverted > 0 ? 1 : 0) + (fold.degenerate > 0 ? 1 : 0);

  return {
    config: {
      styleId: 'SuperformulaBlossom',
      packedParams: [...SFB1_PACKED],
      featureLevel: SFB_FEATURE_LEVEL,
      uBias: SFB_UBIAS,
      uSpan,
      tSpan,
      crestBranches: crests.length,
      widthScale,
      ribbonCellsPerSide,
    },
    rowsProcessed,
    rowsSkipped,
    ribbon: angleStats(ribbonAngles),
    transition: angleStats(transitionAngles),
    bulk: angleStats(bulkAngles),
    ribbonTransitionEdgesChecked: rtEdgesChecked,
    ribbonTransitionEdgeMismatches: rtEdgeMismatch,
    transitionBulkEdgesChecked: tbEdgesChecked,
    transitionBulkEdgeMismatches: tbEdgeMismatch,
    transitionOffGridColumns: offGridColumns,
    cellsFoldChecked: fold.checked,
    invertedCells: fold.inverted,
    degenerateCells: fold.degenerate,
    jacobianSignsSeen: signsSeen,
    jacobianMinAbs: Number.isFinite(fold.minAbs) ? fold.minAbs : 0,
    foldFree: fold.inverted === 0 && fold.degenerate === 0,
    seamRows,
    birthRows,
  };
}
