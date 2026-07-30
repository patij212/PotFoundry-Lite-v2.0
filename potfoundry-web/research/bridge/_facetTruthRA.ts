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
import type { StyleId } from '../../src/geometry/types';
import type { RadiusFn } from './_facetTruthLib';

const TWO_PI = 2 * Math.PI;

export interface AuditRadius {
  /** the audited surface: theta canonicalised to [0,2pi), z clamped to [0,H], every call counted */
  rA: RadiusFn;
  /** rA calls made so far (the report's "M rA evals") */
  evals: () => number;
}

/**
 * The audited analytic surface, wrapped exactly as the STRATA facet auditor has always wrapped it:
 * theta reduced into [0,2pi) and z clamped into [0,H] so the patch boundary is handled honestly, with an
 * eval counter so the report can price the audit.
 */
export function buildAuditRadiusFn(
  style: string, styleParams: Record<string, number>, dims: StyleDims, H: number,
): AuditRadius {
  const rAraw = buildRadiusFn(style as StyleId, styleParams, dims);
  let rEvals = 0;
  const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
  const rA = (th: number, z: number): number => { rEvals += 1; return rAraw(canon(th), z < 0 ? 0 : z > H ? H : z); };
  return { rA, evals: () => rEvals };
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
