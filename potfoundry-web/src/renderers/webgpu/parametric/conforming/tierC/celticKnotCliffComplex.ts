// celticKnotCliffComplex.ts — P1 of the snaking-C0 double-valued wall spec
// (docs/superpowers/specs/2026-07-17-snaking-c0-double-valued-wall-design.md).
//
// PURE, browser-capable DECLARATION of CelticKnot's feature-side complex: the
// snaking ribbon<->background C0 cliff curves, their one-sided lip radii, and the
// crossing Y-junctions with their shared pinch double-vertex. This is the single
// source of truth both later consumers read — the target's feature-curtain SSA
// emission (P2, flips `completeInternalFeatureSideGraphEmitted`) and the mesher's
// double-valued wall generation (P3). Nothing here detects structure from samples:
// the cliff curve is the style's OWN closed form `localU = x_i(t) ± strandWidth`
// (agnosticism contract, roadmap 2026-07-15 §340), and the lips are the analytic
// one-sided limits of the CelticKnot radius (ribbon edge -> baseRadius r0,
// background -> r0 - relief·0.3). The guarantees are proven by the committed
// research probes _wallSpike (8d146d50) and _wallJunction (86311aba) and pinned by
// celticKnotCliffComplex.test.ts.
//
// Pattern mirrors `dsFeatureEdges.ts` (pure per-style analytic feature declaration).
// Parameter derivation matches `celticKnotOuterWallTarget.parameters()` exactly.
//
// P1 SCOPE (this increment): the ribbon<->background OUTER walls (the dominant
// 0.6mm snaking cliffs) as segments over the interior t-band, plus the strand-pair
// crossing junctions filtered to genuine 2-sheet pinches. DEFERRED (documented, not
// assumed done): (a) the INTERNAL occlusion segments (the 0->0.65mm strand-over ->
// strand-under step inside each overlap diamond — declared by the target's
// `z-buffer-occlusion-ties` obligation); (b) full-envelope CLIPPING of each segment
// to exactly its cliff sub-arcs (segments currently span the whole interior band and
// carry the analytic curve+lips; occluded sub-arcs are a consumer/P1-remainder
// concern). Both are the remainder of P1 before P2 emission.

import { baseRadius } from '../../../../../geometry/profile';

/** Pot dimensions needed to evaluate the analytic lip radii (mm). */
export interface CliffDims {
  readonly H: number;
  readonly Rb: number;
  readonly Rt: number;
  readonly expn?: number;
}

/** CelticKnot lattice parameters, derived exactly as `celticKnotOuterWallTarget.parameters()`. */
export interface CelticKnotCliffParams {
  /** `Math.max(1, Math.floor(ckScale))`. */
  readonly columnCount: number;
  /** `ckWidth * 0.15`. */
  readonly strandWidth: number;
  /** `clamp(Math.floor(ckStrands + 0.5), 2, 8)`. */
  readonly strandCount: number;
  /** `Math.max(0.5, ckTwist + 0.5)`. */
  readonly tightness: number;
  /** `ckRelief`. */
  readonly relief: number;
}

/** The two one-sided radius limits at a cliff point: the upper (ribbon) and lower (background) lip (mm). */
export interface CliffLips {
  readonly upper: number;
  readonly lower: number;
}

/** A declared snaking C0 cliff curve segment in (u=theta, t) with its one-sided lips. */
export interface CliffSegment {
  readonly kind: 'ribbon-background';
  readonly column: number;
  readonly strand: number;
  /** Which strand edge: +1 = `centerline + strandWidth`, −1 = `centerline − strandWidth`. */
  readonly side: 1 | -1;
  /** The valid interior t-interval this segment is declared over. */
  readonly tRange: readonly [number, number];
  /** Point on the cliff curve at arc parameter `s ∈ [0,1]` (clamped) → (u=theta, t). */
  at(s: number): { readonly u: number; readonly t: number };
  /** The two one-sided lip radii at `s` (mm): upper = ribbon foot r0, lower = background r0 − jump. */
  lipsAt(s: number): CliffLips;
}

/** One incident cliff arm at a junction (which strand edge terminates/passes there). */
export interface CliffJunctionIncidence {
  readonly strand: number;
  readonly side: 1 | -1;
}

/** A crossing where two cliff curves meet — the shared pinch double-vertex all incident walls terminate on. */
export interface CliffJunction {
  readonly column: number;
  readonly u: number;
  readonly t: number;
  /** The single shared double-vertex: both ribbon sheets pinch to r0, background sits r0 − jump below. */
  readonly pinch: CliffLips;
  readonly incident: readonly CliffJunctionIncidence[];
}

/** The declared CelticKnot feature-side complex: snaking cliff segments + their pinch junctions. */
export interface CelticKnotCliffComplex {
  /** The exact declared radial C0 jump = `relief * 0.3` (mm). */
  readonly jumpMm: number;
  readonly segments: readonly CliffSegment[];
  readonly junctions: readonly CliffJunction[];
}

const TAU = 2 * Math.PI;
/** WGSL braid amplitude (styles.ts `rOuterCelticKnot`). */
const AMP = 0.4;
/** Interior t-band (rims t=0/1 are pinned by the outer-wall patch, not this complex). */
const T_LO = 0.02;
const T_HI = 0.98;
/** Root-scan step in t for junction location. */
const SCAN_STEP = 0.0005;

/**
 * Build the pure CelticKnot cliff complex. Deterministic: identical params ⇒
 * identical output (no Date/Math.random/DOM). See the module header for P1 scope.
 */
export function buildCelticKnotCliffComplex(
  params: CelticKnotCliffParams,
  dims: CliffDims,
): CelticKnotCliffComplex {
  const { columnCount, strandWidth, strandCount, tightness, relief } = params;
  const jumpMm = relief * 0.3;
  const expn = dims.expn ?? 1;

  const r0At = (t: number): number => baseRadius(t * dims.H, dims.H, dims.Rb, dims.Rt, expn, {});
  const centerline = (column: number, strand: number, t: number): number =>
    AMP * Math.sin(t * tightness * TAU * 3 + column * Math.PI * 0.333 + strand * (TAU / strandCount));
  const localUToTheta = (column: number, localU: number): number =>
    ((column + localU / 2 + 0.5) / columnCount) * TAU;
  const tOf = (s: number): number => {
    const f = s < 0 ? 0 : s > 1 ? 1 : s;
    return T_LO + (T_HI - T_LO) * f;
  };

  // ---- ribbon<->background outer-wall segments (column × strand × ±edge) ----
  const segments: CliffSegment[] = [];
  for (let column = 0; column < columnCount; column += 1) {
    for (let strand = 0; strand < strandCount; strand += 1) {
      for (const side of [1, -1] as const) {
        segments.push({
          kind: 'ribbon-background',
          column,
          strand,
          side,
          tRange: [T_LO, T_HI],
          at: (s: number) => {
            const t = tOf(s);
            const localU = centerline(column, strand, t) + side * strandWidth;
            return { u: localUToTheta(column, localU), t };
          },
          lipsAt: (s: number) => {
            const r0 = r0At(tOf(s));
            return { upper: r0, lower: r0 - jumpMm };
          },
        });
      }
    }
  }

  // ---- strand-pair crossing junctions (filtered to genuine 2-sheet pinches) ----
  const otherStrandInBand = (column: number, t: number, localU: number, i: number, j: number): boolean => {
    for (let k = 0; k < strandCount; k += 1) {
      if (k === i || k === j) continue;
      if (Math.abs(localU - centerline(column, k, t)) < strandWidth) return true;
    }
    return false;
  };
  const junctions: CliffJunction[] = [];
  const seen = new Set<string>();
  for (let column = 0; column < columnCount; column += 1) {
    for (let i = 0; i < strandCount; i += 1) {
      for (let j = i + 1; j < strandCount; j += 1) {
        for (const si of [1, -1] as const) {
          for (const sj of [1, -1] as const) {
            const f = (t: number): number =>
              centerline(column, i, t) + si * strandWidth - (centerline(column, j, t) + sj * strandWidth);
            let prev = f(T_LO);
            for (let t = T_LO + SCAN_STEP; t <= T_HI; t += SCAN_STEP) {
              const cur = f(t);
              if (prev === 0 || (prev < 0) !== (cur < 0)) {
                let lo = t - SCAN_STEP;
                let hi = t;
                for (let b = 0; b < 60; b += 1) {
                  const m = (lo + hi) / 2;
                  if ((f(lo) < 0) !== (f(m) < 0)) hi = m;
                  else lo = m;
                }
                const tj = (lo + hi) / 2;
                const localU = centerline(column, i, tj) + si * strandWidth;
                if (!otherStrandInBand(column, tj, localU, i, j)) {
                  const key = `${column}:${Math.round(localU / 1e-4)}:${Math.round(tj / 1e-4)}`;
                  if (!seen.has(key)) {
                    seen.add(key);
                    const r0 = r0At(tj);
                    junctions.push({
                      column,
                      u: localUToTheta(column, localU),
                      t: tj,
                      pinch: { upper: r0, lower: r0 - jumpMm },
                      incident: [{ strand: i, side: si }, { strand: j, side: sj }],
                    });
                  }
                }
              }
              prev = cur;
            }
          }
        }
      }
    }
  }

  return { jumpMm, segments, junctions };
}
