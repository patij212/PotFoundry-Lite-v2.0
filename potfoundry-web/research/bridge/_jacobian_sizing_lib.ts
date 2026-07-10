// E-2026-07-10-JACOBIAN-SIZING — warp-Jacobian-aware sizing library.
//
// NAMED FOLLOW-UP from E-2026-07-10-ANALYTIC-FLOOR-MASKED (KILL-A, commit fa7e8c48):
// the masked-floor arm proved the SIZING was right (floor >= 0.8x true-kappa at 100%
// of failing loci) but the DELIVERED mesh did not obey it, because MetricSizingField
// reads the PLAIN (unwarped) sampler while the u/helix domain warps compress/shear u
// AFTER triangulation (production comment, ConformingWall.ts ~line 514: "the per-wall
// efg samplers (warp-composed maps) arm the shaped templates; sizing stays on the
// plain samplers"). Realized chord sag over plain-domain sizing runs ~J^2, where
// J = d(uFinal)/du is the LOCAL derivative of the domain warp at the sizing node.
//
// This module derives J(u,t) ANALYTICALLY (closed-form, piecewise-constant — NOT
// finite differences, so it cannot alias against the warp's own kink discontinuities)
// from the exact same warp-choice objects the twin/production pipeline already builds
// (chooseCreaseGrid / chooseCreaseTGrid / chooseHelixGrid), and composes J^2 into the
// EXISTING `curvatureFloor` hook — no new production wiring, per the mission brief.
//
// DEV-ONLY. src/ never imports research/. This file only IMPORTS production src (for
// warp primitives + the existing analytic floor) and the READ-ONLY
// `_analytic_floor_lib.ts` / `_gyroid_prodclose_lib.ts` twins — it does not modify them.
//
// Scope: this file + its .test.ts sibling are the ONLY files this experiment may
// create/modify (research/bridge/_jacobian_sizing* and research/lab/E-2026-07-10-
// JACOBIAN-SIZING*). Data under research/exchange/_jacobian_sizing/ is gitignored.

import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { getHeapStatistics } from 'node:v8';

import type { AnalyticRadiusFn } from './labkit';
import { denseBary } from './_pf_rebaselineRuler';
import { newtonNearest } from './_gyroid_truthLib';
import {
  gpcPrescreenDetail,
  type SurvivorRec,
} from './_gyroid_prodclose_lib';
import {
  prepareTwinInputs,
  type TwinInputs,
  type FloorSpec,
} from './_analytic_floor_lib';

import type { UWarp } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import { applyUWarp, chooseCreaseGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseUWarp';
import type { TWarp } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import { applyTWarp, chooseCreaseTGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseTWarp';
import type { HelixWarp } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { applyHelixWarp, chooseHelixGrid } from '../../src/renderers/webgpu/parametric/conforming/CreaseHelixWarp';
import { uWarpDerivative, tWarpDerivative } from '../../src/renderers/webgpu/parametric/conforming/PullbackMetric';
import {
  extractAnalyticFeatures,
} from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import type { AnalyticFloorSpec } from '../../src/renderers/webgpu/parametric/conforming/AnalyticCurvatureFloor';
import type { StyleId, StyleOptions } from '../../src/geometry/types';

// ───────────────────────────── OPS: heap gate + breadcrumbs ─────────────────────────────

/** The fork child's ACTUAL V8 heap limit (MB) — verifies NODE_OPTIONS propagated
 *  (mirrors _gyroid_prodclose_lib.ts's gpcHeapLimitMB; ported here since
 *  _analytic_floor_lib.ts predates this hardening and has no such gate). */
export function jsHeapLimitMB(): number {
  return Math.round(getHeapStatistics().heap_size_limit / 1048576);
}

export const JS_EXCHANGE = join('research', 'exchange', '_jacobian_sizing');

/** Append-only run log (vitest buffers sync-test stdout entirely — side-channel is
 *  the only way to see progress on a multi-minute build). */
export function jsBreadcrumb(msg: string): void {
  try {
    mkdirSync(JS_EXCHANGE, { recursive: true });
    appendFileSync(join(JS_EXCHANGE, 'run.log'), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* progress is best-effort */
  }
}

// ───────────────────────────── warp choices (generic, style-parametric) ─────────────────────────────

/** The subset of TwinInputs the Jacobian only needs — lets SpiralRidges reuse the
 *  real, proven `prepareTwinInputs()` (imported read-only) while other styles (fleet
 *  diagnostic) use the generic `extractWarpChoices` below interchangeably. */
export interface WarpChoices {
  creaseChoice: { warp: UWarp };
  creaseTChoice: { warp: TWarp };
  helixChoice: { warp: HelixWarp };
}

/**
 * Generic (any-style) warp-choice extraction — mirrors `prepareTwinInputs`'s feature-
 * graph + warp-choice derivation (_analytic_floor_lib.ts:169-227) but parameterized by
 * styleId/dims and WITHOUT building samplers/assembly, for the cheap fleet diagnostic
 * (no mesh is built; only the warp objects are needed to evaluate J(u,t) on a dense
 * grid). The primary SpiralRidges arm does NOT use this — it calls the real
 * `prepareTwinInputs()` for maximum fidelity to the proven twin.
 */
export function extractWarpChoices(
  styleId: StyleId,
  styleOpts: StyleOptions,
  dims: { H: number; Rt: number; Rb: number },
): WarpChoices {
  const [, packedWarpParams] = buildStyleParamPayload(styleId, styleOpts);
  const featureGraph = extractAnalyticFeatures(
    styleId,
    Float32Array.from(packedWarpParams),
    dims,
    { surfaceFidelityExact: false },
  );
  const creaseUSet = new Set<number>();
  const creaseU: number[] = [];
  const creaseTSet = new Set<number>();
  const creaseT: number[] = [];
  const helixLines = featureGraph.lines.filter((l) => l.kind === 'helical-crease');
  for (const line of featureGraph.lines) {
    if (line.kind === 'vertical-crease') {
      const u = line.points[0].u;
      const key = Math.round(u * 1e7);
      if (creaseUSet.has(key)) continue;
      creaseUSet.add(key);
      creaseU.push(u);
    } else if (line.kind === 'horizontal-band') {
      const t = line.points[0].t;
      const key = Math.round(t * 1e7);
      if (creaseTSet.has(key)) continue;
      creaseTSet.add(key);
      creaseT.push(t);
    }
  }
  const creaseChoice = chooseCreaseGrid(creaseU);
  const creaseTChoice = chooseCreaseTGrid(creaseT);
  let helixChoice: ReturnType<typeof chooseHelixGrid> = {
    warp: { isIdentity: true, base: { isIdentity: true, anchors: [] }, shearRate: 0, offset: 0 },
    grid: 0,
    level: 0,
  };
  if (helixLines.length > 0) {
    const k = helixLines.length;
    const l0 = helixLines[0].points;
    const p0 = l0[0];
    const p1 = l0[Math.min(1, l0.length - 1)];
    let du = (p1.u - p0.u) % 1;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    const dt = p1.t - p0.t;
    const slope = dt > 1e-9 ? du / dt : 0;
    const turns = -slope * k;
    const phaseU = p0.u * k;
    helixChoice = chooseHelixGrid(k, turns, phaseU);
  }
  return { creaseChoice, creaseTChoice, helixChoice };
}

/** Build SpiralRidges' warp choices via the REAL, proven production twin (maximum
 *  fidelity for the primary arm — not the generic extractor above). */
export function spiralRidgesWarpChoices(): TwinInputs {
  return prepareTwinInputs();
}

// ───────────────────────────── the analytic Jacobian ─────────────────────────────

export interface WarpJacobian {
  /** d(uFinal)/du — the dominant compression/expansion factor at this sizing node.
   *  This is what E-2026-07-10-JACOBIAN-SIZING corrects for (kappa_eff = kappa*Ju^2). */
  Ju: number;
  /** d(tEff)/dt. */
  Jt: number;
  /** d(uFinal)/dt — the shear cross-term (helix branch only; 0 otherwise). NOT folded
   *  into the scalar correction (documented simplification — see prereg design). */
  shear: number;
  /** Which composition branch fired, mirroring the production XOR guard exactly. */
  branch: 'helix' | 'uwarp' | 'identity';
}

/**
 * Analytic (closed-form, piecewise-constant) Jacobian of the domain warp map
 * (u,t) -> (uFinal,tEff), mirroring `composedWallSampler`'s exact branch order
 * (PullbackMetric.ts:160-179): tEff=applyTWarp(t), uEff=applyUWarp(u), uFinal =
 * helix-active ? applyHelixWarp(uEff,tEff) : uEff, where helix fires iff
 * `!helix.isIdentity && uWarp.isIdentity` (production XOR guard).
 *
 * Derivation (chain rule; both applyUWarp/applyTWarp are piecewise-LINEAR so no
 * second-derivative correction term exists within a segment — see PullbackMetric.ts's
 * own doc comment on why FD is safe at cell centers away from kinks; here we avoid FD
 * entirely and read the exact segment slope via uWarpDerivative/tWarpDerivative):
 *
 *   helix branch (uWarp identity, so uEff=u exactly):
 *     uFinal = phi0(u) - shearRate*tEff + offset,  phi0 = applyUWarp(helix.base, u)
 *     dUfinal/du = phi0'(u) = uWarpDerivative(helix.base, u)          [[Ju]]
 *     dUfinal/dt = -shearRate * dTeff/dt = -shearRate * tWarpDerivative(tWarp,t)  [[shear]]
 *     dTeff/dt   = tWarpDerivative(tWarp,t) (or 1 if tWarp identity)   [[Jt]]
 *
 *   uwarp branch (helix inactive, u-warp active):
 *     uFinal = phi(u); dUfinal/du = uWarpDerivative(uWarp,u); shear = 0
 *
 *   identity branch: Ju=Jt=1, shear=0.
 */
export function domainWarpJacobian(w: WarpChoices, u: number, t: number): WarpJacobian {
  const uWarpActive = !w.creaseChoice.warp.isIdentity;
  const tWarpActive = !w.creaseTChoice.warp.isIdentity;
  const helixActive = !w.helixChoice.warp.isIdentity && !uWarpActive; // mirrors PEC :2604 XOR guard
  const Jt = tWarpActive ? tWarpDerivative(w.creaseTChoice.warp, t) : 1;

  if (helixActive) {
    const Ju = uWarpDerivative(w.helixChoice.warp.base, u);
    const shear = -w.helixChoice.warp.shearRate * Jt;
    return { Ju, Jt, shear, branch: 'helix' };
  }
  if (uWarpActive) {
    const Ju = uWarpDerivative(w.creaseChoice.warp, u);
    return { Ju, Jt, shear: 0, branch: 'uwarp' };
  }
  return { Ju: 1, Jt, shear: 0, branch: 'identity' };
}

/** The actual (non-differentiated) domain warp map, built from the SAME primitives
 *  `composedWallSampler` uses (applyUWarp/applyTWarp/applyHelixWarp) in the SAME
 *  branch order — used only for the finite-difference VALIDATION of the analytic
 *  Jacobian above, never as the runtime mechanism. */
export function evalDomainWarp(w: WarpChoices, u: number, t: number): { uFinal: number; tEff: number } {
  const uw = !w.creaseChoice.warp.isIdentity ? w.creaseChoice.warp : undefined;
  const tw = !w.creaseTChoice.warp.isIdentity ? w.creaseTChoice.warp : undefined;
  const hx = !w.helixChoice.warp.isIdentity && !uw ? w.helixChoice.warp : undefined;
  const tEff = tw ? applyTWarp(tw, t) : t;
  const uEff = uw ? applyUWarp(uw, u) : u;
  const uFinal = hx ? applyHelixWarp(hx, uEff, tEff) : uEff;
  return { uFinal, tEff };
}

/** Deterministic RNG (mulberry32) — probe sets must be reproducible (mirrors the
 *  gyroid arms' stratified-estimator RNG pattern). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Kink (anchor source) positions of whichever warp branch is active — FD probes
 *  within `margin` of a kink are excluded (the derivative is genuinely discontinuous
 *  there; uWarpDerivative/tWarpDerivative return the documented right-segment-slope
 *  convention, which a straddling central difference cannot reproduce — this is a
 *  boundary-condition mismatch, not an error in either function). */
function collectKinkPositions(w: WarpChoices): number[] {
  const uWarpActive = !w.creaseChoice.warp.isIdentity;
  const helixActive = !w.helixChoice.warp.isIdentity && !uWarpActive;
  const kinks = [0, 1];
  if (helixActive) {
    for (const a of w.helixChoice.warp.base.anchors) kinks.push(a.source);
  } else if (uWarpActive) {
    for (const a of w.creaseChoice.warp.anchors) kinks.push(a.source);
  }
  return kinks;
}

function nearAnyKink(u: number, kinks: readonly number[], margin: number): boolean {
  const uu = u - Math.floor(u);
  for (const k of kinks) {
    const d = Math.abs(uu - k);
    if (d < margin || 1 - d < margin) return true;
  }
  return false;
}

export interface JacobianValidation {
  nProbes: number;
  nExcludedNearKink: number;
  maxAbsErrJu: number;
  maxRelErrJu: number;
  maxAbsErrShear: number;
  maxRelErrShear: number;
  worstJu: { u: number; t: number; analytic: number; fd: number; relErr: number } | null;
  ms: number;
}

/**
 * Validate the analytic Jacobian against finite differences of the ACTUAL composed
 * warp map (`evalDomainWarp`), at >= opts.nProbes random (u,t) points, excluding a
 * small margin around known warp kinks (piecewise-linear discontinuities — see
 * `collectKinkPositions`). Pre-registered gate: max rel-err < 1e-6 for Ju.
 */
export function validateJacobianFD(
  w: WarpChoices,
  opts: { nProbes: number; h?: number; seed?: number; kinkMargin?: number },
): JacobianValidation {
  const t0 = Date.now();
  const h = opts.h ?? 1e-6;
  const kinkMargin = opts.kinkMargin ?? 1e-4;
  const rng = mulberry32(opts.seed ?? 0x1acb1a);
  const kinks = collectKinkPositions(w);

  let n = 0;
  let excluded = 0;
  let maxAbsJu = 0;
  let maxRelJu = 0;
  let maxAbsShear = 0;
  let maxRelShear = 0;
  let worstJu: JacobianValidation['worstJu'] = null;

  while (n < opts.nProbes) {
    const u = rng();
    const t = 0.001 + rng() * 0.998; // keep clear of the t=0/1 clamp boundary for a fair central FD
    if (nearAnyKink(u, kinks, kinkMargin)) {
      excluded++;
      continue;
    }
    n++;
    const analytic = domainWarpJacobian(w, u, t);

    const pu = evalDomainWarp(w, u + h, t);
    const mu = evalDomainWarp(w, u - h, t);
    const fdJu = (pu.uFinal - mu.uFinal) / (2 * h);
    const absJu = Math.abs(fdJu - analytic.Ju);
    const relJu = absJu / Math.max(1e-9, Math.abs(analytic.Ju));
    if (absJu > maxAbsJu) maxAbsJu = absJu;
    if (relJu > maxRelJu) {
      maxRelJu = relJu;
      worstJu = { u, t, analytic: analytic.Ju, fd: fdJu, relErr: relJu };
    }

    if (analytic.branch === 'helix') {
      const pt = evalDomainWarp(w, u, t + h);
      const mt = evalDomainWarp(w, u, t - h);
      const fdShear = (pt.uFinal - mt.uFinal) / (2 * h);
      const absShear = Math.abs(fdShear - analytic.shear);
      const relShear = absShear / Math.max(1e-9, Math.abs(analytic.shear));
      if (absShear > maxAbsShear) maxAbsShear = absShear;
      if (relShear > maxRelShear) maxRelShear = relShear;
    }
  }

  return {
    nProbes: n,
    nExcludedNearKink: excluded,
    maxAbsErrJu: maxAbsJu,
    maxRelErrJu: maxRelJu,
    maxAbsErrShear: maxAbsShear,
    maxRelErrShear: maxRelShear,
    worstJu,
    ms: Date.now() - t0,
  };
}

// ───────────────────────────── J-composed floor ─────────────────────────────

/**
 * Compose J^2 into the EXISTING analytic curvature floor (no new production wiring —
 * the outerCurvatureFloor hook already threads MetricSizingField as
 * kappa = max(kappa_sampler, curvatureFloor(u,t))). DESIGN DECISION (pre-registered):
 * the composed floor is `base.curvatureFloor(u,t) * max(1, Ju(u,t)^2)` — i.e. J^2
 * ONLY EVER RAISES the already-validated base floor, never lowers it. Rationale:
 * (1) the base floor ("the sizing was right") is itself independently validated
 * (KILL-A: floor >= 0.8x true-kappa at 100% of failing loci) — multiplying it down
 * in Ju<1 zones would regress loci that were not part of the diagnosed failure class;
 * (2) MetricSizingField's own combinator is max()-based (raise-only) by construction,
 * so a "lower the effective kappa" design is not expressible through this hook
 * anyway without also touching the sampler kappa the field computes itself, which
 * would require editing MetricSizingField.ts (out of scope for this file-restricted
 * experiment); (3) only Ju (the dominant, cross-ridge-direction term) is used, NOT
 * the shear cross-term (dUfinal/dt) — this is a documented simplification (the task's
 * own hint names "du'/du"); residual shear-driven anisotropy is a candidate follow-up
 * if KILL-J1 fires.
 */
export function buildJacobianAwareFloor(base: AnalyticFloorSpec, w: WarpChoices): FloorSpec {
  const curvatureFloor = (u: number, t: number): number => {
    const kBase = base.curvatureFloor(u, t);
    const { Ju } = domainWarpJacobian(w, u, t);
    const J2 = Ju * Ju;
    return J2 > 1 ? kBase * J2 : kBase;
  };
  return { curvatureFloor, maxKappa: base.maxKappa };
}

// ───────────────────────────── fleet J-field diagnostic ─────────────────────────────

export interface JFieldStats {
  styleId: string;
  branch: string;
  maxJ2: number;
  p99J2: number;
  meanJ2: number;
  areaFracJ2Over1: number;
  areaFracJ2Over1_5: number;
  nSamples: number;
  ms: number;
}

/** Dense-grid J^2 statistics for a style's ACTIVE warp — the mandatory fleet
 *  diagnostic (cheap: no mesh is built, just a resU x resT closed-form evaluation). */
export function jFieldStats(w: WarpChoices, styleId: string, resU = 2048, resT = 512): JFieldStats {
  const t0 = Date.now();
  const n = resU * resT;
  const vals = new Float64Array(n);
  let k = 0;
  let sum = 0;
  let over1 = 0;
  let over1_5 = 0;
  let maxJ2 = 0;
  let branch = 'identity';
  for (let j = 0; j < resT; j++) {
    const t = resT > 1 ? j / (resT - 1) : 0;
    for (let i = 0; i < resU; i++) {
      const u = i / resU;
      const jac = domainWarpJacobian(w, u, t);
      branch = jac.branch;
      const J2 = jac.Ju * jac.Ju;
      vals[k++] = J2;
      sum += J2;
      if (J2 > maxJ2) maxJ2 = J2;
      if (J2 > 1) over1++;
      if (J2 > 1.5) over1_5++;
    }
  }
  const sorted = vals.slice(0, k).sort();
  const p99 = k > 0 ? sorted[Math.min(k - 1, Math.floor(0.99 * k))] : 0;
  return {
    styleId,
    branch,
    maxJ2,
    p99J2: p99,
    meanJ2: k > 0 ? sum / k : 0,
    areaFracJ2Over1: k > 0 ? over1 / k : 0,
    areaFracJ2Over1_5: k > 0 ? over1_5 / k : 0,
    nSamples: k,
    ms: Date.now() - t0,
  };
}

// ───────────────────────────── two-tier acceptance: prescreen -> stratified -> literal ─────────────────────────────

export type { SurvivorRec };

/** Re-exported read-only from _gyroid_prodclose_lib (100% style-agnostic: radial
 *  deviation against a generic AnalyticRadiusFn, no gyroid-specific field eval). */
export const prescreenDetail = gpcPrescreenDetail;

export interface JStratifiedResult {
  strata: Array<{ lo: number; hi: number; N: number; n: number; overTol: number; worstNewton: number }>;
  estOutliers: number;
  newtonWorst: number;
  sampled: number;
  overSampled: number;
  ms: number;
}

/**
 * Generic (style-agnostic) two-tier stratified Newton estimator — the METHOD reused
 * from E-2026-07-10-GYROID-PRODCLOSE's `gpcStratifiedNewton` (head-exhaustive +
 * equal-count-stratified-remainder, deterministic mulberry32 sampling, ratio
 * extrapolation per stratum), re-implemented here WITHOUT the gyroid-specific
 * `classify()` sub-step (which evaluates the gyroid implicit field — not meaningful
 * for SpiralRidges' geometry). Locus classification for THIS style is done
 * separately by `classifyJacobianResidual` (J-aware, below).
 */
export function stratifiedNewtonEstimate(
  recs: SurvivorRec[],
  rA: AnalyticRadiusFn,
  H: number,
  tol: number,
  plan: { topExhaustive: number; strata: number; perStratum: number },
  seed = 0xc0ffee,
): JStratifiedResult {
  const t0 = Date.now();
  const rng = mulberry32(seed);
  const sorted = [...recs].sort((a, b) => b.radial - a.radial);
  const N = sorted.length;
  const top = Math.min(plan.topExhaustive, N);
  const newtonAt = (r: SurvivorRec): number =>
    Math.min(
      r.radial,
      newtonNearest(rA, H, r.x, r.y, r.z, {
        seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
      }).dist,
    );

  const strataOut: JStratifiedResult['strata'] = [];
  let estOutliers = 0;
  let newtonWorst = 0;
  let sampled = 0;
  let overSampled = 0;

  {
    let kOver = 0;
    let worst = 0;
    for (let i = 0; i < top; i++) {
      const nd = newtonAt(sorted[i]);
      sampled++;
      if (nd > tol) { kOver++; overSampled++; }
      if (nd > worst) worst = nd;
    }
    newtonWorst = Math.max(newtonWorst, worst);
    estOutliers += kOver;
    strataOut.push({
      lo: top > 0 ? sorted[top - 1].radial : 0,
      hi: sorted[0]?.radial ?? 0, N: top, n: top, overTol: kOver, worstNewton: worst,
    });
  }

  const rem = N - top;
  if (rem > 0) {
    const S = Math.max(1, plan.strata);
    for (let s = 0; s < S; s++) {
      const startIdx = top + Math.floor((rem * s) / S);
      const endIdx = top + Math.floor((rem * (s + 1)) / S);
      const Ns = endIdx - startIdx;
      if (Ns <= 0) continue;
      const n = Math.min(plan.perStratum, Ns);
      let kOver = 0;
      let worst = 0;
      for (let j = 0; j < n; j++) {
        const pick = startIdx + Math.min(Ns - 1, Math.floor(rng() * Ns));
        const r = sorted[pick];
        const nd = newtonAt(r);
        sampled++;
        if (nd > tol) { kOver++; overSampled++; }
        if (nd > worst) worst = nd;
      }
      newtonWorst = Math.max(newtonWorst, worst);
      estOutliers += (kOver / n) * Ns;
      strataOut.push({ lo: sorted[endIdx - 1].radial, hi: sorted[startIdx].radial, N: Ns, n, overTol: kOver, worstNewton: worst });
    }
  }

  return { strata: strataOut, estOutliers, newtonWorst, sampled, overSampled, ms: Date.now() - t0 };
}

// ───────────────────────────── J-aware residual classifier (KILL-J1 diagnostic) ─────────────────────────────

export interface JResidualLocus {
  f: number;
  u: number;
  t: number;
  newton: number;
  Ju: number;
  J2: number;
  branch: string;
  kBase: number;
  kJFloor: number;
  demandedHmm: number;
}

/**
 * Dump the worst-N over-tolerance loci with local J, base-vs-J-composed floor kappa,
 * and the demanded edge length (sagitta law) — the pre-registered KILL-J1 diagnostic
 * ("dump worst-50 loci with local J, demanded-vs-delivered h"). Runs the dense-45
 * prescreen, Newton-refines every flagged point (exact, not sampled — the outer-facet
 * count at this scale is the same order as the precursor's own exhaustive pass), sorts
 * by Newton deviation, and reports the worst `topN`.
 */
export function classifyJacobianResidual(
  xyz: Float32Array,
  idx: Uint32Array,
  rA: AnalyticRadiusFn,
  H: number,
  tol: number,
  w: WarpChoices,
  jFloor: FloorSpec,
  maxSagMm: number,
  topN = 50,
): { pointsOver: number; facetsOver: number; worst: JResidualLocus[]; ms: number } {
  const t0 = Date.now();
  const TAU = Math.PI * 2;
  const { recs } = gpcPrescreenDetail(xyz, idx, rA, H, tol);
  const scored: JResidualLocus[] = [];
  const facetsOver = new Set<number>();
  for (const r of recs) {
    const nd = Math.min(
      r.radial,
      newtonNearest(rA, H, r.x, r.y, r.z, {
        seedTheta: 11, seedZ: 41, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60,
      }).dist,
    );
    if (nd <= tol) continue;
    facetsOver.add(r.f);
    let th = Math.atan2(r.y, r.x);
    if (th < 0) th += TAU;
    const u = th / TAU;
    const t = Math.min(1, Math.max(0, r.z / H));
    const jac = domainWarpJacobian(w, u, t);
    const kBase = jFloor.curvatureFloor(u, t) / Math.max(1e-9, jac.Ju * jac.Ju > 1 ? jac.Ju * jac.Ju : 1);
    const kJFloor = jFloor.curvatureFloor(u, t);
    const demandedHmm = Math.sqrt((8 * maxSagMm) / Math.max(1e-9, kJFloor));
    scored.push({ f: r.f, u, t, newton: nd, Ju: jac.Ju, J2: jac.Ju * jac.Ju, branch: jac.branch, kBase, kJFloor, demandedHmm });
  }
  scored.sort((a, b) => b.newton - a.newton);
  return {
    pointsOver: scored.length,
    facetsOver: facetsOver.size,
    worst: scored.slice(0, topN),
    ms: Date.now() - t0,
  };
}

/** Barycentric-lattice re-export (denseBary is already imported here; convenience for
 *  the test driver so it does not need a second import of the same low-level lib). */
export { denseBary };
