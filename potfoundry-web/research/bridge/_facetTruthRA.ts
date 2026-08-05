// _facetTruthRA.ts — the ONE definition of the audit's analytic surface. RESEARCH ONLY.
//
// WHY THIS FILE EXISTS. The H1 auditor now runs its per-facet certificates on worker threads, and an rA
// CLOSURE cannot be transferred to a thread: each worker has to rebuild it from (style, params, dims), which
// are plain JSON. If the parent and the worker each carried their own copy of the wrapper — the theta
// canonicalisation, the z clamp, the eval counter — then a one-character divergence between the two copies
// would silently produce two different surfaces, the pooled audit would score a mesh against a surface the
// serial audit never used, and NOTHING in the report would say so. (This repo has already paid for exactly
// that failure mode once: a partial int-hash swap left 2 of 4 copies of a Voronoi hash stale.)
//
// So there is one definition, imported by both sides. `buildRadiusFn` itself is untouched and shared.
// Bit-identity is therefore true BY CONSTRUCTION; `radiusLattice` exists so it is also CHECKED at runtime,
// because "by construction" is an argument and this suite runs on measurements.
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildFastRadiusFn } from './_raFast';
import type { StyleId } from '../../src/geometry/types';
import type { RadiusFn } from './_facetTruthLib';

const TWO_PI = 2 * Math.PI;
/** in-flight verification stride; MUST be a power of two (the check uses a bit-mask). +0.1% at 1024. */
const FAST_STRIDE = 1024;

export interface AuditRadius {
  /** the audited surface: theta canonicalised to [0,2pi), z clamped to [0,H], every call counted */
  rA: RadiusFn;
  /** rA calls made so far (the report's "M rA evals") */
  evals: () => number;
  /** whether the twin PASSED THE UPFRONT CHECK and was selected. A SNAPSHOT of that decision — it
   *  does NOT track a later in-flight rejection, which is what `inflightRejected()` is for. Read both. */
  fastUsed: boolean;
  /** lattice points on which the twin differed; 0 = identical, -1 = no twin exists for this style */
  fastDiffs: number;
  /** true if an IN-FLIGHT sample caught the twin diverging and this instance reverted to the shipped
   *  builder mid-run. A report that does not print this is not entitled to claim the twin was used. */
  inflightRejected: () => boolean;
}

/**
 * The audited analytic surface, wrapped exactly as the STRATA facet auditor has always wrapped it:
 * theta reduced into [0,2pi) and z clamped into [0,H] so the patch boundary is handled honestly, with an
 * eval counter so the report can price the audit.
 */
export function buildAuditRadiusFn(
  style: string, styleParams: Record<string, number>, dims: StyleDims, H: number,
): AuditRadius {
  const rAshipped = buildRadiusFn(style as StyleId, styleParams, dims);
  // ── THE HOISTED TWIN (S52) — TAKEN ONLY IF IT PROVES BIT-IDENTICAL, HERE, NOW, EVERY PROCESS ──
  // rA is 84% of the certificate's wall clock at 801 ns/call, and 52,736 M of those calls is 61x the
  // whole mesher's eval budget. `_raFast` hoists the per-call closure allocations, `??` reads and
  // derived constants that depend only on (params, dims) — measured 253 ns/call, 3.17x, and
  // Object.is-identical on 819,867 points (S52).
  //
  // IT IS NOT TRUSTED ON THAT MEASUREMENT. It is re-proven in THIS process, against THIS style's
  // params, BEFORE the caller can score a single facet, over `radiusLattice` — the same non-uniform
  // prime/golden-ratio/discontinuity-bracketed lattice the worker pool already uses to prove a
  // rebuilt surface identical. Any deviation at all and the shipped builder is used instead. So the
  // worst case of this block is NO SPEEDUP; it can never be A DIFFERENT SURFACE. That matters more
  // than the 3.17x: this repo has already paid once for a partial swap that left stale copies
  // (the Voronoi int-hash), and the whole value of the auditor is that it is the one thing nobody
  // has to take on trust.
  //
  // NOTE the twin is checked on RAW (theta, z) exactly as the wrapper will call it — canonicalised
  // theta and clamped z — so the lattice's deliberate out-of-domain probes exercise the clamp too.
  let rAraw = rAshipped;
  let fastUsed = false; let fastDiffs = -1;
  const fast = buildFastRadiusFn(style, styleParams, dims, H);
  if (fast !== null) {
    let diffs = 0;
    const cmp = (t: number, zz: number): void => { if (!Object.is(fast(t, zz), rAshipped(t, zz))) diffs += 1; };
    // (a) THE LATTICE — primes, golden-ratio z walk, discontinuity brackets, out-of-domain probes.
    const lat = radiusLattice(H, [], []);
    for (let i = 0; i < lat.th.length; i += 1) cmp(lat.th[i], lat.z[i]);
    // (b) *** A DENSE SWEEP, BECAUSE THE LATTICE ALONE WAS MEASURED INSUFFICIENT. ***
    // An adversarial audit built a real divergence (the `wT` clamp, now fixed in `_raFast`) and this
    // guard still reported fastUsed=true / fastDiffs=0 — the 16,471-point lattice simply never
    // sampled a (theta, z) where the divergent branch was live. A guard that can miss a divergence it
    // was built to catch is worth exactly what it caught, so the check is widened here rather than
    // the finding merely noted. 601 x 301 = 180,901 further points at ~0.1 s, deterministic, offset
    // off the lattice's own phase so the two do not sample the same places.
    const NT = 601; const NZ = 301;
    for (let i = 0; i < NT; i += 1) {
      const t = (TWO_PI * (i + 0.37)) / NT;
      for (let j = 0; j < NZ; j += 1) cmp(t, (H * (j + 0.11)) / NZ);
    }
    fastDiffs = diffs;
    if (diffs === 0) { rAraw = fast; fastUsed = true; }
  }
  let rEvals = 0;
  let inflightRejected = false;
  const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
  // ── (c) IN-FLIGHT SAMPLING, BECAUSE (a) AND (b) PROVABLY CANNOT BE SUFFICIENT ──
  // I mutation-tested the upfront check by injecting a divergence into a small (theta,z) window and
  // asking which half caught it:
  //     window 0.020 rad x 0.5 mm : lattice 1 hit, dense 8 hits   -> caught
  //     window 0.004 rad x 0.1 mm : lattice 0 hits, dense 0 hits  -> *** MISSED BY BOTH ***
  // That is not a sample-size problem to be fixed by another 10x of points. A divergence confined to
  // a window smaller than the sampling pitch evades ANY finite upfront sweep, so "verified by
  // sampling (theta,z)" is a smoke test and can never be a proof of transcription equivalence.
  //
  // The fix is to stop trying to prove it upfront and instead CHECK THE CALLS THE RUN ACTUALLY MAKES
  // — which is the only distribution that can affect a result. Every FAST_STRIDE'th call evaluates
  // both and compares. A mismatch permanently reverts this instance to the shipped builder and sets
  // `inflightRejected`, so the run CONTINUES ON THE SOUND PATH and the report can say it happened.
  // Fail-safe rather than fail-loud: throwing here would lose a multi-hour audit over a defect whose
  // correct handling is simply "use the slow one".
  // Cost at the default stride of 1024: +0.1% evaluations. It cannot prove equivalence either — but
  // it samples the ONE distribution where a divergence would do damage, which the sweeps do not.
  const rA = fastUsed
    ? (th: number, z: number): number => {
      rEvals += 1;
      const t = canon(th); const zz = z < 0 ? 0 : z > H ? H : z;
      const v = rAraw(t, zz);
      if ((rEvals & (FAST_STRIDE - 1)) === 0 && !Object.is(v, rAshipped(t, zz))) {
        inflightRejected = true; fastUsed = false; rAraw = rAshipped;
        return rAshipped(t, zz);
      }
      return v;
    }
    : (th: number, z: number): number => { rEvals += 1; return rAraw(canon(th), z < 0 ? 0 : z > H ? H : z); };
  return { rA, evals: () => rEvals, fastUsed, fastDiffs, inflightRejected: () => inflightRejected };
}

/**
 * The fixed (theta,z) lattice the parent and every worker evaluate rA over, so the parent can prove the
 * rebuilt surface is BIT-identical to its own before it believes a single worker result.
 *
 * It is not a uniform grid. A uniform grid on a style whose relief is periodic in theta lands on the same
 * phase in every column and can agree everywhere while disagreeing between the columns, so the sweep uses
 * counts that share no factor with any plausible period, walks z on an irrational offset, and adds a
 * tight bracket around every detected C0 locus — the places where a one-ULP difference in the wrapper would
 * actually change which side of a jump a sample lands on.
 */
export function radiusLattice(H: number, zJumps: readonly number[], thJumps: readonly number[]): { th: Float64Array; z: Float64Array } {
  const th: number[] = []; const z: number[] = [];
  const NT = 181; const NZ = 91;                 // both prime; 181*91 = 16,471 points
  const PHI = 0.6180339887498949;
  for (let i = 0; i < NT; i += 1) {
    const a = (TWO_PI * i) / NT;
    for (let j = 0; j < NZ; j += 1) {
      // walk z on a golden-ratio offset per theta column so no two columns sample the same z set
      const f = (j / NZ + PHI * i) % 1;
      th.push(a); z.push(H * f);
    }
  }
  // discontinuity brackets: both sides of every z-step and theta-jump, at several radii of approach
  for (const eps of [1e-9, 1e-7, 1e-5, 1e-3]) {
    for (const zj of zJumps) for (const s of [-1, 1]) for (let i = 0; i < 8; i += 1) { th.push((TWO_PI * i) / 8); z.push(zj + s * eps); }
    for (const tj of thJumps) for (const s of [-1, 1]) for (let j = 0; j <= 8; j += 1) { th.push(tj + s * eps); z.push((H * j) / 8); }
  }
  // out-of-domain probes: the clamp/canonicalisation itself is part of the surface definition
  for (const t of [-7.3, -1e-12, 0, TWO_PI, TWO_PI + 1e-12, 19.7]) for (const v of [-3, -1e-12, 0, H / 3, H, H + 1e-12, H + 3]) { th.push(t); z.push(v); }
  return { th: Float64Array.from(th), z: Float64Array.from(z) };
}
