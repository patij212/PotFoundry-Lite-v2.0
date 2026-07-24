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
 * STRATA-001 — CREASE-TAIL ATTRIBUTION.
 *
 * The crease-seeded ruler (E-2026-07-24-STRATA001-S2-RULER) showed conforming
 * closes the crease MEDIAN 128x but leaves a tail (p99 ~194 um, MAX ~439 um).
 * Three causes were NAMED by construction; this instrument MEASURES which one
 * carries the tail, so the next fix targets the dominant term rather than a
 * guess (audit-first doctrine):
 *
 *   J  near a Voronoi JUNCTION (interior segment endpoint) — the kernel forbids
 *      a degree-3 interior vertex, so three chains cannot meet there.
 *   U  on a crease but in an UNCONFORMED cell (chain dropped at a collision).
 *   A  within the ANCHOR band at a chain end (pulled to a grid corner, up to
 *      half a cell off the true bisector).
 *   C  on a crease in a CONFORMED cell, away from all of the above (should be
 *      tight — the control).
 *
 * Gated PF_STRATA_TAIL=1.
 */

const RUN = process.env.PF_STRATA_TAIL === '1';

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
  readonly u: Float64Array;
  readonly v: Float64Array;
  readonly mm: Float64Array;
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[index];
}

function pointSegmentDistance(
  px: number,
  py: number,
  a: readonly [number, number],
  b: readonly [number, number]
): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-18) return Math.hypot(px - a[0], py - a[1]);
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

describe('STRATA-001 crease-tail attribution', () => {
  it.runIf(RUN)('splits the crease tail into J / U / A / C loci', () => {
    const relief = envFloat('PF_STRATA_TAIL_RELIEF', 2.0);
    const morph = envFloat('PF_STRATA_TAIL_MORPH', 1);
    const aLog2 = envInt('PF_STRATA_TAIL_ALOG2', 9);
    const vLog2 = envInt('PF_STRATA_TAIL_VLOG2', 8);
    const perSegment = envInt('PF_STRATA_TAIL_CREASE', 400);

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

    const angularCells = 2 ** aLog2;
    const verticalCells = 2 ** vLog2;
    const assembly = assembleVoronoiConformingChords(LATTICE, {
      angularDivisionsLog2: aLog2,
      verticalDivisionsLog2: vLog2,
      chordFractionBits: 16,
    });
    const chordDenominator = 65536;
    // Cells a chord cuts (from the chord midpoint, matching the assembly).
    const claimedCells = new Set<number>();
    for (const chord of assembly.chords) {
      const mu = (Number(chord.start.uNumerator) + Number(chord.end.uNumerator)) / 2 / chordDenominator;
      const mv = (Number(chord.start.vNumerator) + Number(chord.end.vNumerator)) / 2 / chordDenominator;
      const cu = Math.min(angularCells - 1, Math.floor(mu * angularCells));
      const cv = Math.min(verticalCells - 1, Math.floor(mv * verticalCells));
      claimedCells.add(cv * angularCells + cu);
    }

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
      conformingChordsByPatch: { 'outer-wall': assembly.chords },
    });
    const partition = tessellation.partitions.find((p) => p.patchId === 'outer-wall');
    expect(partition).toBeDefined();
    if (partition === undefined) return;

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
        const point = evaluate(u[corner], v[corner]);
        mm[corner * 3] = Math.fround(point[0]);
        mm[corner * 3 + 1] = Math.fround(point[1]);
        mm[corner * 3 + 2] = Math.fround(point[2]);
      }
      triangles.push({ u, v, mm });
    }
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
    const chordErrorAt = (u: number, v: number): number | null => {
      for (const index of buckets[bucketOf(u, v)]) {
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
        if (b0 < -1e-9 || b1 < -1e-9 || b2 < -1e-9) continue;
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

    // Junctions: interior segment endpoints (a Voronoi vertex is shared by 3
    // segments; a box-clip endpoint sits on the domain edge and is not one).
    const segments = voronoiBisectorSegmentsUv(LATTICE);
    const junctions: Array<readonly [number, number]> = [];
    const onEdge = (p: readonly [number, number]): boolean =>
      p[0] <= 1e-6 || p[0] >= 1 - 1e-6 || p[1] <= 1e-6 || p[1] >= 1 - 1e-6;
    for (const segment of segments) {
      for (const endpoint of [segment.a, segment.b]) {
        if (onEdge(endpoint)) continue;
        const near = junctions.some(
          (j) => Math.abs(j[0] - endpoint[0]) < 1e-4 && Math.abs(j[1] - endpoint[1]) < 1e-4
        );
        if (!near) junctions.push(endpoint);
      }
    }
    const distToJunction = (u: number, v: number): number => {
      let best = Infinity;
      for (const j of junctions) {
        const d = Math.hypot(u - j[0], v - j[1]);
        if (d < best) best = d;
      }
      return best;
    };

    // Cell diagonal in UV, the natural unit for "near".
    const cellDiag = Math.hypot(1 / angularCells, 1 / verticalCells);
    const buckets4: Record<'J' | 'U' | 'A' | 'C', number[]> = { J: [], U: [], A: [], C: [] };
    interface Worst {
      error: number;
      u: number;
      v: number;
      locus: string;
      dj: number;
    }
    const worst: Worst[] = [];
    const K = 24;

    for (const segment of segments) {
      const du = segment.b[0] - segment.a[0];
      const dv = segment.b[1] - segment.a[1];
      for (let step = 0; step <= perSegment; step += 1) {
        const t = step / perSegment;
        const u = segment.a[0] + t * du;
        const v = segment.a[1] + t * dv;
        if (u <= 1e-4 || u >= 1 - 1e-4) continue; // seam, scored elsewhere
        const error = chordErrorAt(u, v);
        if (error === null) continue;
        const dj = distToJunction(u, v);
        const cu = Math.min(angularCells - 1, Math.floor(u * angularCells));
        const cv = Math.min(verticalCells - 1, Math.floor(v * verticalCells));
        const conformed = claimedCells.has(cv * angularCells + cu);
        // Anchor band: within a cell of a segment ENDPOINT (a chain end pulled
        // to a grid corner). Junctions are already peeled off above, so a
        // near-end sample that is not a junction is an anchored chain end.
        const nearSegEnd = Math.min(t, 1 - t) * Math.hypot(du, dv) < cellDiag;
        let locus: 'J' | 'U' | 'A' | 'C';
        if (dj < 1.5 * cellDiag) locus = 'J';
        else if (!conformed) locus = 'U';
        else if (nearSegEnd) locus = 'A';
        else locus = 'C';
        buckets4[locus].push(error);
        worst.push({ error, u, v, locus, dj: dj / cellDiag });
        worst.sort((a, b) => b.error - a.error);
        if (worst.length > K) worst.length = K;
      }
    }

    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const line = (label: string, key: 'J' | 'U' | 'A' | 'C'): string => {
      const data = buckets4[key].slice().sort((a, b) => a - b);
      return `  ${label.padEnd(28)} n=${String(data.length).padStart(6)}  MAX ${um(quantile(data, 1)).padStart(9)}  p99 ${um(quantile(data, 0.99)).padStart(9)}  p95 ${um(quantile(data, 0.95)).padStart(8)}  p90 ${um(quantile(data, 0.9)).padStart(8)}  p50 ${um(quantile(data, 0.5)).padStart(7)}`;
    };
    const report = [
      '',
      '========== STRATA-001 CREASE-TAIL ATTRIBUTION ==========',
      `recipe: Voronoi v_relief=${relief} v_morph=${morph}  grid 2^${aLog2} x 2^${vLog2}`,
      `chords: ${assembly.chords.length} (dropped ${assembly.droppedToJunctions})   junctions: ${junctions.length}   cell diag: ${(cellDiag * 1000).toFixed(1)} mUV`,
      '',
      line('J near junction (<1.5 cell)', 'J'),
      line('U unconformed cell', 'U'),
      line('A anchor band (chain end)', 'A'),
      line('C conformed control', 'C'),
      '',
      '  top worst crease samples:',
      ...worst
        .slice(0, 14)
        .map(
          (w) =>
            `    ${um(w.error).padStart(9)} um  uv(${w.u.toFixed(5)}, ${w.v.toFixed(5)})  locus=${w.locus}  dJ=${w.dj.toFixed(2)} cells`
        ),
      '========================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    const outPath = process.env.PF_STRATA_TAIL_OUT;
    if (outPath !== undefined) writeFileSync(outPath, report, 'utf8');
    expect(segments.length).toBeGreaterThan(0);
  }, 3_000_000);
});
