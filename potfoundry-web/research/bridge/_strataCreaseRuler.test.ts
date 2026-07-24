import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../src/state/types';
import { tessellateAnnularRadialSolidTargetForCertification } from '../../src/geometry/targetSolid/annularSolidReferenceTessellation';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import { createSinglePatchAnnularRadialSolidTargetBinding } from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import { compileGeneratedTargetProgramBackends } from '../../src/geometry/targetSolid/validatedResidualProgram';
import {
  voronoiBisectorSegmentsUv,
  type VoronoiLatticeParams,
} from '../../src/geometry/targetSolid/voronoiBisectorGuides';
import { assembleVoronoiConformingChords } from '../../src/geometry/targetSolid/voronoiConformingChords';

/*
 * STRATA-001 — CREASE-SEEDED RULER.
 *
 * The certificate cannot rank two meshes: it reports the first MARGINAL cell to
 * reach maxDepth, i.e. `budget + eps(depth)`, so chords ON and OFF return the
 * same number (measured, E-2026-07-24-STRATA001-S2-CHORDS). Ranking needs a
 * fidelity measurement independent of the certifier.
 *
 * A GRID-sampled ruler cannot do it either. The max of |mesh - surface| across a
 * crease sits exactly ON the crease, and a grid only sees its nearest sample:
 * for this style at defaults the under-report is ~6 um on a 10 um budget
 * (sigma/2 * delta/2, sigma ~ 0.51 mm/mm, delta ~ 0.046 mm at 2048 columns), and
 * pcg2d jitter makes which creases land near a sample pure luck.
 *
 * So this ruler samples BOTH:
 *   - a uniform grid (the body / smooth term), and
 *   - densely ALONG the exact bisector geometry (the crease term),
 * and reports the two MAXima SEPARATELY. A blended number would hide exactly the
 * failure mode the conforming work exists to fix.
 *
 * Metric matches the certificate's: |target(u,v) - affine(artifact triangle)|,
 * the true chord error, evaluated against the SAME tessellation the certifier
 * would be handed.
 *
 * Gated PF_STRATA_RULER=1.
 */

const RUN = process.env.PF_STRATA_RULER === '1';

const LATTICE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};
const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
const H32_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}
function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

type Vec3 = readonly [number, number, number];

interface Triangle {
  readonly u: Float64Array; // 3 u values
  readonly v: Float64Array; // 3 v values
  readonly mm: Float64Array; // 9 = 3 vertices x xyz
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index];
}

describe('STRATA-001 crease-seeded ruler', () => {
  it.runIf(RUN)('reports grid-MAX and crease-MAX separately', () => {
    const relief = envFloat('PF_STRATA_RULER_RELIEF', 2.0);
    const morph = envFloat('PF_STRATA_RULER_MORPH', 1);
    const aLog2 = envInt('PF_STRATA_RULER_ALOG2', 8);
    const vLog2 = envInt('PF_STRATA_RULER_VLOG2', 7);
    const useChords = process.env.PF_STRATA_RULER_CHORDS === '1';
    /*
     * ALIASING GUARD — learned the hard way. With gridU/gridV = 512/256 against
     * a 2^9 x 2^8 mesh, every sample landed exactly on a mesh VERTEX and the body
     * MAX read 0.001 um — a mesh "certified perfect" while its creases were off
     * by 557 um. Sample counts must be INCOMMENSURATE with any power-of-two mesh
     * grid, so the defaults are primes and every sample is additionally pushed
     * off the lattice by a half-step-ish irrational offset.
     */
    const gridU = envInt('PF_STRATA_RULER_GRIDU', 521);
    const gridV = envInt('PF_STRATA_RULER_GRIDV', 263);
    const OFFSET = 0.381966; // (3 - sqrt 5)/2 — never a dyadic rational
    const perSegment = envInt('PF_STRATA_RULER_CREASE', 240);

    const canonicalInput = createCanonicalTargetInputBinding(
      H32_POT_GEOMETRY,
      'Voronoi',
      { v_morph: morph, v_relief: relief },
      TARGET_CONTROLS
    );
    const binding = createSinglePatchAnnularRadialSolidTargetBinding(
      canonicalInput,
      createStyleOuterWallTargetRegistryBinding(canonicalInput)
    );
    const outer = binding.programs.find((program) => program.patchId === 'outer-wall');
    expect(outer).toBeDefined();
    if (outer === undefined) return;
    const backends = compileGeneratedTargetProgramBackends(outer.programCanonicalJson);
    const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
    const evaluate = (u: number, v: number): Vec3 =>
      backends.evaluateFloat64(clamp01(u), clamp01(v)) as Vec3;

    const assembly = useChords
      ? assembleVoronoiConformingChords(LATTICE, {
          angularDivisionsLog2: aLog2,
          verticalDivisionsLog2: vLog2,
          chordFractionBits: 16,
        })
      : { chords: [], droppedToJunctions: 0, contestedCells: 0 };

    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: aLog2,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': vLog2,
        'inner-wall': vLog2,
        'top-rim': 3,
        'bottom-top': 5,
        'bottom-under': 5,
        'drain-wall': 0,
      },
      ...(useChords ? { conformingChordsByPatch: { 'outer-wall': assembly.chords } } : {}),
    });
    const partition = tessellation.partitions.find((p) => p.patchId === 'outer-wall');
    expect(partition).toBeDefined();
    if (partition === undefined) return;

    // ---- Build the triangle table + a cell bucket index over UV ----
    const denominator =
      Number(partition.oddDenominatorFactor ?? '1') * 2 ** partition.fractionBits;
    const triangles: Triangle[] = [];
    for (const triangle of partition.triangles) {
      const u = new Float64Array(3);
      const v = new Float64Array(3);
      const mm = new Float64Array(9);
      for (let corner = 0; corner < 3; corner += 1) {
        const vertex = triangle.vertices[corner];
        u[corner] = Number(vertex.uNumerator) / denominator;
        v[corner] = Number(vertex.vNumerator) / denominator;
        // The artifact stores binary32 vertices; match the certifier's chord.
        const point = evaluate(u[corner], v[corner]);
        mm[corner * 3] = Math.fround(point[0]);
        mm[corner * 3 + 1] = Math.fround(point[1]);
        mm[corner * 3 + 2] = Math.fround(point[2]);
      }
      triangles.push({ u, v, mm });
    }
    // Bucket by a coarse UV lattice so point location is O(1)-ish. Bounded by
    // construction (BUCKETS^2 cells), no unbounded accumulation.
    const BUCKETS = 256;
    const buckets: number[][] = Array.from({ length: BUCKETS * BUCKETS }, () => []);
    const bucketOf = (u: number, v: number): number => {
      const bu = Math.min(BUCKETS - 1, Math.max(0, Math.floor(u * BUCKETS)));
      const bv = Math.min(BUCKETS - 1, Math.max(0, Math.floor(v * BUCKETS)));
      return bv * BUCKETS + bu;
    };
    for (const [index, triangle] of triangles.entries()) {
      const uMin = Math.min(triangle.u[0], triangle.u[1], triangle.u[2]);
      const uMax = Math.max(triangle.u[0], triangle.u[1], triangle.u[2]);
      const vMin = Math.min(triangle.v[0], triangle.v[1], triangle.v[2]);
      const vMax = Math.max(triangle.v[0], triangle.v[1], triangle.v[2]);
      const bu0 = Math.min(BUCKETS - 1, Math.max(0, Math.floor(uMin * BUCKETS)));
      const bu1 = Math.min(BUCKETS - 1, Math.max(0, Math.floor(uMax * BUCKETS)));
      const bv0 = Math.min(BUCKETS - 1, Math.max(0, Math.floor(vMin * BUCKETS)));
      const bv1 = Math.min(BUCKETS - 1, Math.max(0, Math.floor(vMax * BUCKETS)));
      for (let bv = bv0; bv <= bv1; bv += 1) {
        for (let bu = bu0; bu <= bu1; bu += 1) buckets[bv * BUCKETS + bu].push(index);
      }
    }

    /** Chord error at a uv sample, or null if no triangle contains it. */
    const chordErrorAt = (u: number, v: number): number | null => {
      const candidates = buckets[bucketOf(u, v)];
      for (const index of candidates) {
        const triangle = triangles[index];
        const u0 = triangle.u[0];
        const v0 = triangle.v[0];
        const du1 = triangle.u[1] - u0;
        const dv1 = triangle.v[1] - v0;
        const du2 = triangle.u[2] - u0;
        const dv2 = triangle.v[2] - v0;
        const det = du1 * dv2 - dv1 * du2;
        if (det === 0) continue;
        const pu = u - u0;
        const pv = v - v0;
        const b1 = (pu * dv2 - pv * du2) / det;
        const b2 = (du1 * pv - dv1 * pu) / det;
        const b0 = 1 - b1 - b2;
        const tolerance = -1e-9;
        if (b0 < tolerance || b1 < tolerance || b2 < tolerance) continue;
        const target = evaluate(u, v);
        let sum = 0;
        for (let axis = 0; axis < 3; axis += 1) {
          const chord =
            b0 * triangle.mm[axis] + b1 * triangle.mm[3 + axis] + b2 * triangle.mm[6 + axis];
          const delta = target[axis] - chord;
          sum += delta * delta;
        }
        return Math.sqrt(sum);
      }
      return null;
    };

    // ---- Population 1: uniform grid (the smooth body term) ----
    const gridErrors: number[] = [];
    let gridMissed = 0;
    // Track WHERE each population's worst sample sits, so the residual tail can
    // be attributed to a locus (crease / cone / elsewhere) instead of guessed at.
    let gridArgmax: readonly [number, number] = [0, 0];
    let gridWorst = -1;
    let creaseArgmax: readonly [number, number] = [0, 0];
    let creaseWorst = -1;
    for (let iu = 0; iu < gridU; iu += 1) {
      for (let iv = 0; iv < gridV; iv += 1) {
        const u = (iu + OFFSET) / gridU;
        const v = (iv + OFFSET) / gridV;
        const error = chordErrorAt(u, v);
        if (error === null) gridMissed += 1;
        else {
          gridErrors.push(error);
          if (error > gridWorst) {
            gridWorst = error;
            gridArgmax = [u, v];
          }
        }
      }
    }

    // ---- Population 2: dense samples ALONG the exact bisector graph ----
    const creaseErrors: number[] = [];
    // The periodic seam is its own locus: the kernel refuses chord endpoints on
    // the seam column unless they are grid corners, so the seam is UNCONFORMED by
    // construction. Score it apart from ordinary crease so one does not mask the
    // other.
    const creaseInteriorErrors: number[] = [];
    const seamBand = envFloat('PF_STRATA_RULER_SEAMBAND', 0.01);
    let creaseMissed = 0;
    const segments = voronoiBisectorSegmentsUv(LATTICE);
    for (const segment of segments) {
      for (let step = 0; step <= perSegment; step += 1) {
        const t = step / perSegment;
        const u = segment.a[0] + t * (segment.b[0] - segment.a[0]);
        const v = segment.a[1] + t * (segment.b[1] - segment.a[1]);
        const error = chordErrorAt(u, v);
        if (error === null) creaseMissed += 1;
        else {
          creaseErrors.push(error);
          if (u > seamBand && u < 1 - seamBand) creaseInteriorErrors.push(error);
          if (error > creaseWorst) {
            creaseWorst = error;
            creaseArgmax = [u, v];
          }
        }
      }
    }

    gridErrors.sort((a, b) => a - b);
    creaseErrors.sort((a, b) => a - b);
    creaseInteriorErrors.sort((a, b) => a - b);
    const um = (mm: number): string => (mm * 1000).toFixed(3);

    const report = [
      '',
      '========== STRATA-001 CREASE-SEEDED RULER ==========',
      `recipe: Voronoi v_relief=${relief} v_morph=${morph}  (registry defaults 2.0 / 1.0)`,
      `grid: angular 2^${aLog2} x vertical 2^${vLog2}   conforming: ${useChords ? `ON (${assembly.chords.length} chords, ${assembly.droppedToJunctions} dropped)` : 'OFF'}`,
      `outer-wall triangles: ${partition.triangles.length}`,
      '',
      `--- BODY (uniform ${gridU}x${gridV} samples) ---`,
      `  MAX ${um(quantile(gridErrors, 1))} um   p99 ${um(quantile(gridErrors, 0.99))}   p50 ${um(quantile(gridErrors, 0.5))}   (n=${gridErrors.length}, missed ${gridMissed})`,
      '',
      `--- CREASE (${perSegment} samples along each of ${segments.length} exact bisectors) ---`,
      `  MAX ${um(quantile(creaseErrors, 1))} um   p99 ${um(quantile(creaseErrors, 0.99))}   p50 ${um(quantile(creaseErrors, 0.5))}   (n=${creaseErrors.length}, missed ${creaseMissed})`,
      '',
      `--- CREASE excluding the seam band (|u-0|,|u-1| > ${seamBand}) ---`,
      `  MAX ${um(quantile(creaseInteriorErrors, 1))} um   p99 ${um(quantile(creaseInteriorErrors, 0.99))}   p50 ${um(quantile(creaseInteriorErrors, 0.5))}   (n=${creaseInteriorErrors.length})`,
      '',
      `  worst BODY sample   at uv (${gridArgmax[0].toFixed(5)}, ${gridArgmax[1].toFixed(5)})`,
      `  worst CREASE sample at uv (${creaseArgmax[0].toFixed(5)}, ${creaseArgmax[1].toFixed(5)})`,
      '',
      `  A grid ruler alone would report ${um(quantile(gridErrors, 1))} um and MISS the crease term.`,
      '====================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    const outPath = process.env.PF_STRATA_RULER_OUT;
    if (outPath !== undefined) writeFileSync(outPath, report, 'utf8');
    expect(gridErrors.length + creaseErrors.length).toBeGreaterThan(0);
  }, 3_000_000);
});
