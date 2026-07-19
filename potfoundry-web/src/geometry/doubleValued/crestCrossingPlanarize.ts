// crestCrossingPlanarize.ts — CCP Task 2: pure crest × inner-edge crossing computation.
//
// Standalone (src/geometry/doubleValued/) pure-function stage, sibling to the P3b T1
// visibleEnvelope.ts. For each overlap-diamond corner it computes WHERE the over-strand
// CREST crease (the ribbon centreline ridge, the braid's C1 top) geometrically crosses the
// emerging under-strand INNER-edge cliff (the C0 wall toward the over strand), and records
// the split t-values that crossing must induce on BOTH curves. No mesh vertex sits at that
// crossing today, so the CDT bridges the ~0.6mm step with a flat facet (~0.21mm chord,
// density-INVARIANT ⇒ structural). Task 3 consumes these splits to insert the shared vertex
// and split both constraints so the CDT can no longer bridge them.
//
// Re-derives the CelticKnot strand geometry (centreline / zHeight / u closed form) locally
// from the read-only P1 types — exactly as visibleEnvelope.ts does — so the P1 declaration
// (celticKnotCliffComplex.ts) stays untouched.
//
// Geometry (the load-bearing fact, proven against the measured baseline in the test):
//   The over-crest sits at u = uFrac(centre_over). The under inner-edge (toward the over
//   strand) sits at u = uFrac(centre_under + underSide·strandWidth). Since uFrac is affine
//   in localU, the two u-curves are equal exactly where
//        centre_over(t) − centre_under(t) = underSide·strandWidth,
//   i.e. |centre_over − centre_under| = strandWidth. That is always < 2·strandWidth, so every
//   root lies inside an overlap diamond by construction. Per unordered strand pair {a,b} the
//   difference centre_a − centre_b is a single sinusoid; it hits the level +w on one side of
//   each diamond and −w on the other, giving the two diamond-corner crossings (the crest
//   sweeps across the whole under ribbon, crossing the entering and exiting near-edges).
//   over/under is decided by zHeight at the root (higher = crest on top); underSide is the
//   sign of centre_over − centre_under (the under edge that faces the over strand).

import type {
  CelticKnotCliffParams,
  CliffDims,
} from '../../renderers/webgpu/parametric/conforming/tierC/celticKnotCliffComplex';

/** The interior t-band the crossings are searched over (theta=2π·u, z=t·H). Rims are pinned elsewhere. */
export interface CrestDomain {
  tLo: number;
  tHi: number;
}

/** One over-crest × under-inner-edge crossing — a point that lacks a vertex, so a facet bridges the step. */
export interface CrestCrossing {
  column: number;
  /** Strand whose CREST crease crosses here (higher zHeight at `t` ⇒ on top). */
  overStrand: number;
  /** Strand whose INNER-edge cliff is crossed (lower zHeight at `t`). */
  underStrand: number;
  /** Which under-strand edge: the side toward the over strand. +1 = centre+strandWidth, −1 = centre−strandWidth. */
  underSide: 1 | -1;
  /** Longitudinal parameter of the crossing. */
  t: number;
  /** Circumferential u-fraction; equals both the over-crest u and the under-inner-edge u at `t`. */
  u: number;
}

/** Crossings plus the split t-values each induces on the over-crest crease and the under-inner-edge cliff. */
export interface CrestPlanarization {
  crossings: CrestCrossing[];
  /** key `${column}:${overStrand}` → sorted split t-values on that strand's crest crease. */
  crestSplitsByStrand: Map<string, number[]>;
  /** key `${column}:${underStrand}:${underSide}` → sorted split t-values on that inner-edge cliff. */
  innerEdgeSplitsBySeg: Map<string, number[]>;
}

const TAU = 2 * Math.PI;
/** WGSL braid amplitude (styles.ts `rOuterCelticKnot`; same constant P1 uses). */
const AMP = 0.4;
/** Root-scan step in t (same as visibleEnvelope.ts / celticKnotCliffComplex.ts). */
const SCAN = 0.0005;

/** Same closed form P1 (celticKnotCliffComplex.ts) and the mesher use; re-derived read-only. */
function argOf(p: CelticKnotCliffParams, column: number, strand: number, t: number): number {
  return t * p.tightness * TAU * 3 + column * Math.PI * 0.333 + strand * (TAU / p.strandCount);
}

function centre(p: CelticKnotCliffParams, column: number, strand: number, t: number): number {
  return AMP * Math.sin(argOf(p, column, strand, t));
}

function zHeight(p: CelticKnotCliffParams, column: number, strand: number, t: number): number {
  const weave = Math.max(1, p.strandCount - 1);
  const o = argOf(p, column, strand, t) * weave;
  return p.strandCount % 2 !== 0 ? Math.sin(o) : Math.cos(o);
}

/** Map a strand-local u offset to the circumferential u-fraction (P1's `localUToTheta` without the TAU). */
function uFrac(p: CelticKnotCliffParams, column: number, localU: number): number {
  return (column + localU / 2 + 0.5) / p.columnCount;
}

/**
 * Circumferential u-fraction of strand `strand`'s CREST crease (its centreline ridge) at `t`.
 * Exported so callers — and the test — can assert a crossing lies on the over-crest directly.
 */
export function crestUAt(
  p: CelticKnotCliffParams,
  column: number,
  strand: number,
  t: number
): number {
  return uFrac(p, column, centre(p, column, strand, t));
}

/**
 * Circumferential u-fraction of strand `strand`'s `side` INNER-edge cliff (`centre ± strandWidth`)
 * at `t`. Exported so the test can assert a crossing lies on the under inner-edge directly.
 */
export function innerEdgeUAt(
  p: CelticKnotCliffParams,
  column: number,
  strand: number,
  side: 1 | -1,
  t: number
): number {
  return uFrac(p, column, centre(p, column, strand, t) + side * p.strandWidth);
}

/** Append `tv` to `map[key]`, deduplicating exact repeats (crossings are ~0.007 apart ⇒ never merged). */
function record(map: Map<string, number[]>, key: string, tv: number): void {
  const arr = map.get(key);
  if (!arr) {
    map.set(key, [tv]);
    return;
  }
  if (!arr.some((x) => Math.abs(x - tv) < 1e-9)) arr.push(tv);
}

/**
 * Compute every over-crest × under-inner-edge crossing for the CelticKnot double-valued wall,
 * plus the split t-values each induces on the over-crest crease and the under-inner-edge cliff.
 *
 * Pure and deterministic: for each column and unordered strand pair {a,b}, and each target level
 * ±strandWidth, a fixed forward scan (`SCAN`) detects the single sign change of the smooth
 * `centre_a − centre_b − level·strandWidth`, then a fixed 50-iteration bisection refines the
 * crossing t. over/under is decided by zHeight at the root, underSide by the sign of
 * `centre_over − centre_under`. No Date/Math.random/DOM. `dims` is unused (the crossing (u,t) is
 * a function of the lattice params alone) but kept for signature parity with the sibling stages.
 */
export function planarizeCrestCrossings(
  p: CelticKnotCliffParams,
  _dims: CliffDims,
  domain: CrestDomain
): CrestPlanarization {
  const { columnCount, strandCount, strandWidth } = p;
  const { tLo, tHi } = domain;
  const crossings: CrestCrossing[] = [];
  const crestSplitsByStrand = new Map<string, number[]>();
  const innerEdgeSplitsBySeg = new Map<string, number[]>();

  for (let column = 0; column < columnCount; column += 1) {
    for (let a = 0; a < strandCount; a += 1) {
      for (let b = a + 1; b < strandCount; b += 1) {
        // The two near-edge crossings of a diamond: centre_a − centre_b = +w and = −w.
        for (const level of [1, -1] as const) {
          const f = (t: number): number =>
            centre(p, column, a, t) - centre(p, column, b, t) - level * strandWidth;
          let prev = f(tLo);
          for (let t = tLo + SCAN; t <= tHi + 1e-9; t += SCAN) {
            const cur = f(t);
            if (prev === 0 || (prev < 0) !== (cur < 0)) {
              // bisect the sign change for a clean crossing t
              let lo = t - SCAN;
              let hi = t;
              for (let bi = 0; bi < 50; bi += 1) {
                const m = 0.5 * (lo + hi);
                if ((f(lo) < 0) !== (f(m) < 0)) hi = m;
                else lo = m;
              }
              const tc = 0.5 * (lo + hi);
              // over = the crest on top (higher zHeight); under = the other strand.
              const overStrand = zHeight(p, column, a, tc) >= zHeight(p, column, b, tc) ? a : b;
              const underStrand = overStrand === a ? b : a;
              // underSide = the under edge facing the over strand = sign(centre_over − centre_under).
              const underSide: 1 | -1 =
                centre(p, column, overStrand, tc) >= centre(p, column, underStrand, tc) ? 1 : -1;
              const u = crestUAt(p, column, overStrand, tc);
              crossings.push({ column, overStrand, underStrand, underSide, t: tc, u });
              record(crestSplitsByStrand, `${column}:${overStrand}`, tc);
              record(innerEdgeSplitsBySeg, `${column}:${underStrand}:${underSide}`, tc);
            }
            prev = cur;
          }
        }
      }
    }
  }

  // deterministic ordering (by t, then strands) for stable downstream consumption
  crossings.sort(
    (x, y) => x.t - y.t || x.overStrand - y.overStrand || x.underStrand - y.underStrand
  );
  for (const arr of crestSplitsByStrand.values()) arr.sort((x, y) => x - y);
  for (const arr of innerEdgeSplitsBySeg.values()) arr.sort((x, y) => x - y);

  return { crossings, crestSplitsByStrand, innerEdgeSplitsBySeg };
}
