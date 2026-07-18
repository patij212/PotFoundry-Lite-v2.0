import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../state/types';
import { createCanonicalTargetInputBinding } from './canonicalTargetInput';
import {
  createCompleteMappedGeometryTargetBindingFromSurfaceComplex,
  type MappedPatchProofJob,
} from './completeMappedArtifactGeometry';
import { createFinalArtifactProofSession } from './finalArtifactProofSession';
import {
  FinalStlPartialCertificationError,
  proveFinalStlMappedGeometryAndStructure,
} from './finalStlPartialCertification';
import { verifyExactDyadicRectanglePartition } from './exactDyadicDomainPartition';
import { assessProofSessionStructuralIntegrity } from './proofSessionStructuralIntegrity';
import {
  createSinglePatchAnnularRadialSolidTargetBinding,
  type SinglePatchAnnularRadialSolidTargetBinding,
} from './singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from './styleOuterWallTargetRegistry';
import {
  dyadicEdgeLadder,
  rationalFeatureAngularLadder,
  rationalStationLadder,
  snappedFeatureAngularLadder,
  tessellateAnnularRadialSolidTargetForCertification,
  type AnnularSolidReferenceTessellation,
  type AnnularSolidReferenceTessellationOptions,
} from './annularSolidReferenceTessellation';
import { compileValidatedResidualEvaluator } from './validatedResidualEvaluatorRegistry';

const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });

// A small, valid HarmonicRipple pot chosen so a uniform dyadic reference grid
// provably reaches the 0.01 mm continuous budget inside the proof layer's
// 131,072 mapped-triangle and elapsed-time hard caps. Every value is inside
// the registry/geometry bounds — this is a real supported pot, not a toy
// abstraction; production-DEFAULT scale at default style params does NOT fit
// the caps yet (see the fail-closed case below).
const SMALL_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 40,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});
const GENTLE_HARMONIC_RIPPLE = Object.freeze({
  hr_petal_amp: 0.01,
  hr_ripple_amp: 0,
  hr_bell: 0,
});

function atlas(
  geometry: Readonly<Record<string, number>>,
  styleParams: Readonly<Record<string, number>>,
  styleId = 'HarmonicRipple'
): {
  binding: SinglePatchAnnularRadialSolidTargetBinding;
  canonicalInput: ReturnType<typeof createCanonicalTargetInputBinding>;
} {
  const canonicalInput = createCanonicalTargetInputBinding(
    geometry,
    styleId,
    styleParams,
    TARGET_CONTROLS
  );
  const binding = createSinglePatchAnnularRadialSolidTargetBinding(
    canonicalInput,
    createStyleOuterWallTargetRegistryBinding(canonicalInput)
  );
  return { binding, canonicalInput };
}

function jobsFor(
  binding: SinglePatchAnnularRadialSolidTargetBinding,
  tessellation: AnnularSolidReferenceTessellation,
  targetSha256: string
): readonly MappedPatchProofJob[] {
  const programByPatch = new Map(
    binding.programs.map((program) => [program.patchId, program.programCanonicalJson])
  );
  return tessellation.partitions.map((partition) => {
    const programCanonicalJson = programByPatch.get(
      partition.patchId as (typeof binding.programs)[number]['patchId']
    );
    if (programCanonicalJson === undefined) {
      throw new Error(`missing program for partition patch '${partition.patchId}'`);
    }
    return {
      partition,
      evaluator: compileValidatedResidualEvaluator({ targetSha256, programCanonicalJson }),
    };
  });
}

// 256 angular stations give ~4x sag margin at the gentle petal amplitude
// (~0.0017 mm estimated vs the 0.0095 mm geometric budget). The radial
// annuli (rim, both bottoms) are ruled surfaces — linear in v but with a
// ruling direction that rotates with u — so a triangle spanning du x dv
// carries a mixed d2P/dudv twist error of roughly r'(v)*theta'(u)*du*dv/4.
// Measured on this pot: ~31 um at one v-cell across the 6.1 mm bottom
// annulus (the continuous proof correctly REFUSED that mesh, and at two
// rim v-cells it pinned a true 9.50010 um point against the 9.5 um budget).
// Eight v-cells on the bottoms (~3.8 um) and four on the 3 mm rim
// (~2.3 um) leave real margin. The drain wall is a straight cylinder
// (r constant in v), so its mixed term is exactly zero and one v-cell is
// exact. Total ~18.9k triangles.
const SMALL_POT_DIVISIONS: AnnularSolidReferenceTessellationOptions = Object.freeze({
  angularDivisionsLog2: 8,
  verticalDivisionsLog2ByPatch: Object.freeze({
    'outer-wall': 3,
    'inner-wall': 3,
    'top-rim': 3,
    'bottom-top': 4,
    'bottom-under': 4,
    'drain-wall': 0,
  }),
});

describe('annular solid reference tessellation', () => {
  it('welds a tiny grid into a closed genus-one embedded solid', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    expect(session.triangleCount).toBe(tessellation.triangleCount);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    expect(structural.scanComplete).toBe(true);
  });

  it('builds strictly increasing dyadic edge ladders toward either edge', () => {
    const towardTop = dyadicEdgeLadder(3, 4, 'v1');
    const towardBase = dyadicEdgeLadder(3, 4, 'v0');
    for (const ladder of [towardTop, towardBase]) {
      expect(ladder.log2Denominator).toBe(7);
      expect(ladder.numerators[0]).toBe(0);
      expect(ladder.numerators[ladder.numerators.length - 1]).toBe(128);
      expect(ladder.numerators.length).toBe(8 + 4 + 1);
      for (let station = 1; station < ladder.numerators.length; station += 1) {
        expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
      }
    }
    // Finest rows hug the requested edge with geometrically halving widths.
    expect(towardTop.numerators.slice(-3)).toEqual([126, 127, 128]);
    expect(towardBase.numerators.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it('builds symmetric snapped-feature angular ladders and welds them closed', () => {
    const ladder = snappedFeatureAngularLadder(4, [1 / 24, 5 / 24, 7 / 24], 10);
    const denominator = 1 << ladder.log2Denominator;
    expect(ladder.numerators[0]).toBe(0);
    expect(ladder.numerators[ladder.numerators.length - 1]).toBe(denominator);
    for (let station = 1; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
    }
    // Symmetric under reversal so the atlas's reversed junctions weld.
    for (let station = 0; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBe(
        denominator - ladder.numerators[ladder.numerators.length - 1 - station]
      );
    }
    // A tessellation on the snapped ladder still welds into a closed solid.
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      angularStations: ladder,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    expect(structural.scanComplete).toBe(true);
  });

  it('splits cells along parallel conforming feature lines with exact one-sided triangles', () => {
    // U5 spike: diagonal jump lines a*u + b*v = c can never be avoided by an
    // axis-aligned grid; the conforming splitter cuts every crossed rectangle
    // along the EXACT line so no emitted triangle straddles it. The partition
    // kernel is the conformity oracle (area sum + pair audit), and every
    // triangle must be exactly one-sided against every declared line.
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    // All 48ths: contains every v=0 crossing (m/24) and v=1 crossing
    // ((2m-1)/48) of the line family 48u + v = 2m, and is symmetric.
    const ladder = rationalStationLadder(
      4,
      Array.from({ length: 47 }, (_, index) => [index + 1, 48] as const)
    );
    const lines = Array.from({ length: 23 }, (_, index) => ({
      aNumerator: 48,
      bNumerator: 1,
      cNumerator: 2 * (index + 1),
    }));
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      angularStations: ladder,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
      conformingLinesByPatch: { 'outer-wall': lines },
    });
    // Still a closed genus-one embedded solid after the splits.
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    expect(session.triangleCount).toBe(tessellation.triangleCount);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    const outerWall = tessellation.partitions.find(
      (partition) => partition.patchId === 'outer-wall'
    );
    const innerWall = tessellation.partitions.find(
      (partition) => partition.patchId === 'inner-wall'
    );
    if (outerWall === undefined || innerWall === undefined) {
      throw new Error('expected outer-wall and inner-wall partitions');
    }
    // The kernel accepts the split partition as an exact complete coverage.
    const verified = verifyExactDyadicRectanglePartition(outerWall);
    expect(verified.exactPartition).toBe(true);
    expect(verified.scanComplete).toBe(true);
    // The split patch carries MORE triangles than its plain grid would.
    const plainGridTriangles = 2 * 48 * 4;
    expect(outerWall.triangles.length).toBeGreaterThan(plainGridTriangles);
    // Unsplit patches keep their plain grids.
    expect(innerWall.triangles.length).toBe(plainGridTriangles);
    // EXACT one-sidedness: no emitted triangle straddles any declared line.
    const declared = BigInt(outerWall.oddDenominatorFactor ?? '1') << BigInt(outerWall.fractionBits);
    for (const line of lines) {
      const a = BigInt(line.aNumerator);
      const b = BigInt(line.bNumerator);
      const c = BigInt(line.cNumerator) * declared;
      for (const triangle of outerWall.triangles) {
        let positive = false;
        let negative = false;
        for (const vertex of triangle.vertices) {
          const sign = a * BigInt(vertex.uNumerator) + b * BigInt(vertex.vNumerator) - c;
          if (sign > 0n) positive = true;
          if (sign < 0n) negative = true;
        }
        expect(positive && negative).toBe(false);
      }
    }
  });

  it('splits cells along a conforming chord chain (curved guide polyline)', () => {
    // U5 curved extension: a guide polyline approximating a curved feature is
    // supplied as exact chord chains whose vertices lie ON grid lines, one
    // chord per crossed cell. Interior chain vertices are shared by the two
    // adjacent cells' chords (conformity), boundary endpoints sit on angular
    // stations (junction safety). Chords need no divisions: the split is a
    // boundary walk between two on-boundary points.
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    // 4x4 grid on the outer wall; chain crosses rows v=0..1 near u ~ 1/4,
    // drifting right by 1/64 per row (denominator 64 covers all coords).
    const chain = [
      { U: 16n, V: 0n },
      { U: 17n, V: 16n },
      { U: 18n, V: 32n },
      { U: 19n, V: 48n },
      { U: 16n, V: 64n },
    ];
    const chords = Array.from({ length: 4 }, (_, index) => ({
      denominator: '64',
      start: {
        uNumerator: chain[index].U.toString(),
        vNumerator: chain[index].V.toString(),
      },
      end: {
        uNumerator: chain[index + 1].U.toString(),
        vNumerator: chain[index + 1].V.toString(),
      },
    }));
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 2,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
      conformingChordsByPatch: { 'outer-wall': chords },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    const outerWall = tessellation.partitions.find(
      (partition) => partition.patchId === 'outer-wall'
    );
    if (outerWall === undefined) throw new Error('expected outer-wall partition');
    const verified = verifyExactDyadicRectanglePartition(outerWall);
    expect(verified.exactPartition).toBe(true);
    // Four crossed cells contribute extra triangles beyond the plain 4x4 grid.
    expect(outerWall.triangles.length).toBeGreaterThan(2 * 4 * 4);
    // Every emitted triangle is exactly one-sided against every chord's line
    // (restricted to the chord's own cell, one-sidedness against the full
    // line is what the splitter guarantees for the crossed cell's pieces).
    const declared =
      BigInt(outerWall.oddDenominatorFactor ?? '1') << BigInt(outerWall.fractionBits);
    const scale = declared / 64n;
    for (let index = 0; index < 4; index += 1) {
      const start = { U: chain[index].U * scale, V: chain[index].V * scale };
      const end = { U: chain[index + 1].U * scale, V: chain[index + 1].V * scale };
      const a = end.V - start.V;
      const b = start.U - end.U;
      const c = a * start.U + b * start.V;
      for (const triangle of outerWall.triangles) {
        let positive = false;
        let negative = false;
        for (const vertex of triangle.vertices) {
          const u = BigInt(vertex.uNumerator);
          const v = BigInt(vertex.vNumerator);
          // Only vertices inside the chord's own row band constrain the test.
          if (v < start.V || v > end.V) continue;
          const sign = a * u + b * v - c;
          if (sign > 0n) positive = true;
          if (sign < 0n) negative = true;
        }
        expect(positive && negative).toBe(false);
      }
    }
  });

  it('splits a cell along a chord chain with interior pass-through vertices (collar points)', () => {
    // U5 kernel extension: chain vertices STRICTLY INSIDE one cell are legal
    // when they are degree-2 pass-through points (shared by exactly two
    // chords). They carry along-curve resolution — e.g. the Gothic crease
    // collar — at zero grid breadth. On the 4x4 grid below (denominator 64,
    // grid lines at multiples of 16) the chain enters cell [16,32]x[16,32]
    // on the u=16/64 station column, bends at two interior points, and exits
    // on the u=32/64 column.
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    // Grid-line contacts follow the conformity rule the Gothic generator
    // obeys: chain ends sit on GRID CORNERS (shared by every adjacent cell's
    // plain triangulation) and mid-edge crossings CONTINUE into the
    // neighbouring cell so both split sides carry the shared vertex.
    const chain = [
      { U: 16n, V: 16n }, // grid corner (anchored chain end)
      { U: 21n, V: 24n }, // INTERIOR (no grid line)
      { U: 26n, V: 27n }, // INTERIOR (no grid line)
      { U: 32n, V: 30n }, // on the u = 32/64 column — continued below
      { U: 48n, V: 32n }, // grid corner (anchored chain end, next cell over)
    ];
    const chords = Array.from({ length: 4 }, (_, index) => ({
      denominator: '64',
      start: {
        uNumerator: chain[index].U.toString(),
        vNumerator: chain[index].V.toString(),
      },
      end: {
        uNumerator: chain[index + 1].U.toString(),
        vNumerator: chain[index + 1].V.toString(),
      },
    }));
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 2,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
      conformingChordsByPatch: { 'outer-wall': chords },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    const outerWall = tessellation.partitions.find(
      (partition) => partition.patchId === 'outer-wall'
    );
    if (outerWall === undefined) throw new Error('expected outer-wall partition');
    const verified = verifyExactDyadicRectanglePartition(outerWall);
    expect(verified.exactPartition).toBe(true);
    const declared =
      BigInt(outerWall.oddDenominatorFactor ?? '1') << BigInt(outerWall.fractionBits);
    const scale = declared / 64n;
    // Every chain vertex — including the two interior ones — is a REAL
    // partition vertex, and every chain segment is an interior mesh edge
    // (shared by exactly two triangles).
    const vertexKey = (u: bigint, v: bigint): string => `${u},${v}`;
    const seenVertices = new Set<string>();
    const edgeCount = new Map<string, number>();
    for (const triangle of outerWall.triangles) {
      const scaled = triangle.vertices.map((vertex) => ({
        u: BigInt(vertex.uNumerator),
        v: BigInt(vertex.vNumerator),
      }));
      for (const vertex of scaled) seenVertices.add(vertexKey(vertex.u, vertex.v));
      for (let side = 0; side < 3; side += 1) {
        const a = scaled[side];
        const b = scaled[(side + 1) % 3];
        const key =
          a.u < b.u || (a.u === b.u && a.v < b.v)
            ? `${vertexKey(a.u, a.v)}|${vertexKey(b.u, b.v)}`
            : `${vertexKey(b.u, b.v)}|${vertexKey(a.u, a.v)}`;
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      }
    }
    for (const point of chain) {
      expect(seenVertices.has(vertexKey(point.U * scale, point.V * scale))).toBe(true);
    }
    for (let index = 0; index + 1 < chain.length; index += 1) {
      const a = { u: chain[index].U * scale, v: chain[index].V * scale };
      const b = { u: chain[index + 1].U * scale, v: chain[index + 1].V * scale };
      const key =
        a.u < b.u || (a.u === b.u && a.v < b.v)
          ? `${vertexKey(a.u, a.v)}|${vertexKey(b.u, b.v)}`
          : `${vertexKey(b.u, b.v)}|${vertexKey(a.u, a.v)}`;
      expect(edgeCount.get(key)).toBe(2);
    }
  });

  it('splits a chained cell further with straight chords across the non-convex piece', () => {
    // After the interior-vertex chain splits the cell, the upper piece is
    // NON-convex (the chain bulges into it). A later straight chord across
    // that piece exercises the general boundary walk + the ear-clip
    // triangulation fallback.
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const chainChords = [
      [
        { U: 16n, V: 16n },
        { U: 21n, V: 24n },
      ],
      [
        { U: 21n, V: 24n },
        { U: 26n, V: 27n },
      ],
      [
        { U: 26n, V: 27n },
        { U: 32n, V: 30n },
      ],
      [
        { U: 32n, V: 30n },
        { U: 48n, V: 32n },
      ],
      // Second chain strictly above the first, corner to corner through an
      // interior vertex: splits the NON-convex upper piece of the cell.
      [
        { U: 16n, V: 32n },
        { U: 28n, V: 31n },
      ],
      [
        { U: 28n, V: 31n },
        { U: 32n, V: 32n },
      ],
    ];
    const chords = chainChords.map(([start, end]) => ({
      denominator: '64',
      start: { uNumerator: start.U.toString(), vNumerator: start.V.toString() },
      end: { uNumerator: end.U.toString(), vNumerator: end.V.toString() },
    }));
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 2,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
      conformingChordsByPatch: { 'outer-wall': chords },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    const outerWall = tessellation.partitions.find(
      (partition) => partition.patchId === 'outer-wall'
    );
    if (outerWall === undefined) throw new Error('expected outer-wall partition');
    expect(verifyExactDyadicRectanglePartition(outerWall).exactPartition).toBe(true);
  });

  it('triangulates twin-chain (ladder) pieces with rungs, never all-on-one-chain slivers', () => {
    // Two dense parallel chains through one cell (the Gothic kink + a
    // near-kink offset curve): a fan triangulation from any single origin
    // creates triangles whose three vertices all lie on ONE chain — long
    // diagonals sagging off the bending curve (measured 9,519,723 pm on the
    // +0.002 curve). Chain-split pieces must triangulate with cross rungs.
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const chainA = [
      { U: 16n, V: 16n },
      { U: 20n, V: 20n },
      { U: 24n, V: 22n },
      { U: 28n, V: 23n },
      { U: 32n, V: 24n },
      { U: 48n, V: 32n },
    ];
    const chainB = [
      { U: 16n, V: 32n },
      { U: 20n, V: 26n },
      { U: 24n, V: 27n },
      { U: 28n, V: 28n },
      { U: 32n, V: 29n },
      { U: 48n, V: 32n },
    ];
    const chordsOf = (
      chain: readonly { U: bigint; V: bigint }[]
    ): { denominator: string; start: { uNumerator: string; vNumerator: string }; end: { uNumerator: string; vNumerator: string } }[] =>
      Array.from({ length: chain.length - 1 }, (_, index) => ({
        denominator: '64',
        start: {
          uNumerator: chain[index].U.toString(),
          vNumerator: chain[index].V.toString(),
        },
        end: {
          uNumerator: chain[index + 1].U.toString(),
          vNumerator: chain[index + 1].V.toString(),
        },
      }));
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 2,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
      conformingChordsByPatch: {
        'outer-wall': [...chordsOf(chainA), ...chordsOf(chainB)],
      },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    const outerWall = tessellation.partitions.find(
      (partition) => partition.patchId === 'outer-wall'
    );
    if (outerWall === undefined) throw new Error('expected outer-wall partition');
    expect(verifyExactDyadicRectanglePartition(outerWall).exactPartition).toBe(true);
    // The chained cells must be SLIVER-FREE: a fan triangulation emits
    // triangles hugging one chain with ~3.7-6 degree corners (the measured
    // ~10 um sag class on the Gothic offset curves); the max-min-angle DP
    // keeps every corner fat. 8 degrees separates the two states with
    // margin on this geometry (fan worst 3.7, DP worst ~10.6).
    let worstDegrees = Number.POSITIVE_INFINITY;
    for (const triangle of outerWall.triangles) {
      const points = triangle.vertices.map((vertex) => ({
        u: Number(BigInt(vertex.uNumerator)),
        v: Number(BigInt(vertex.vNumerator)),
      }));
      for (let corner = 0; corner < 3; corner += 1) {
        const at = points[corner];
        const left = points[(corner + 1) % 3];
        const right = points[(corner + 2) % 3];
        const cross =
          (left.u - at.u) * (right.v - at.v) - (left.v - at.v) * (right.u - at.u);
        const dot =
          (left.u - at.u) * (right.u - at.u) + (left.v - at.v) * (right.v - at.v);
        const degrees = (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
        if (degrees < worstDegrees) worstDegrees = degrees;
      }
    }
    expect(worstDegrees).toBeGreaterThanOrEqual(8);
  });

  it('refuses interior chord vertices that dangle, branch, or form grid-free cycles', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const base = {
      angularDivisionsLog2: 2,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    } as const;
    const chord = (
      startU: number,
      startV: number,
      endU: number,
      endV: number
    ): {
      denominator: string;
      start: { uNumerator: string; vNumerator: string };
      end: { uNumerator: string; vNumerator: string };
    } => ({
      denominator: '64',
      start: { uNumerator: startU.toString(), vNumerator: startV.toString() },
      end: { uNumerator: endU.toString(), vNumerator: endV.toString() },
    });
    // Dangling: the interior point (21,24) is touched by only ONE chord.
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        conformingChordsByPatch: { 'outer-wall': [chord(16, 20, 21, 24)] },
      })
    ).toThrow(/degree-2 chain pass-through/);
    // Branching: (21,24) is touched by THREE chords.
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        conformingChordsByPatch: {
          'outer-wall': [
            chord(16, 20, 21, 24),
            chord(21, 24, 32, 30),
            chord(21, 24, 26, 32),
          ],
        },
      })
    ).toThrow(/degree-2 chain pass-through/);
    // Cycle: three interior points, each degree 2, but no grid contact.
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        conformingChordsByPatch: {
          'outer-wall': [
            chord(21, 24, 26, 27),
            chord(26, 27, 23, 29),
            chord(23, 29, 21, 24),
          ],
        },
      })
    ).toThrow(/closed loop without grid contact/);
  });

  it('refuses conforming chords that are off grid lines, off-station at boundaries, or cell-ambiguous', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const base = {
      angularDivisionsLog2: 2,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    } as const;
    const chord = (
      startU: number,
      startV: number,
      endU: number,
      endV: number
    ): { denominator: string; start: { uNumerator: string; vNumerator: string }; end: { uNumerator: string; vNumerator: string } } => ({
      denominator: '64',
      start: { uNumerator: startU.toString(), vNumerator: startV.toString() },
      end: { uNumerator: endU.toString(), vNumerator: endV.toString() },
    });
    // Start point (17/64, 3/64) lies on NO grid line of the 4x4 grid. Since
    // the interior-vertex extension, an off-grid endpoint is legal ONLY as a
    // degree-2 chain pass-through — a lone chord leaves it dangling.
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        conformingChordsByPatch: { 'outer-wall': [chord(17, 3, 18, 16)] },
      })
    ).toThrow(/degree-2 chain pass-through/);
    // Boundary-row endpoint at u = 17/64 is not an angular station.
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        conformingChordsByPatch: { 'outer-wall': [chord(17, 0, 18, 16)] },
      })
    ).toThrow(/boundary row off-station/);
    // Endpoints on grid lines of two DIFFERENT cells (no common cell).
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        conformingChordsByPatch: { 'outer-wall': [chord(17, 16, 40, 32)] },
      })
    ).toThrow(/common cell/);
  });

  it('refuses conforming lines whose boundary-row crossings miss the angular stations', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 4,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 2,
          'inner-wall': 2,
          'top-rim': 1,
          'bottom-top': 1,
          'bottom-under': 1,
          'drain-wall': 1,
        },
        // v=0 crossing at u = 1/48 is NOT a station of the plain 2^4 grid.
        conformingLinesByPatch: {
          'outer-wall': [{ aNumerator: 48, bNumerator: 1, cNumerator: 1 }],
        },
      })
    ).toThrow(/boundary row off-station/);
  });

  it('refuses non-parallel conforming line sets and seam-interior crossings', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const base = {
      angularDivisionsLog2: 4,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    } as const;
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        conformingLinesByPatch: {
          'outer-wall': [
            { aNumerator: 48, bNumerator: 1, cNumerator: 2 },
            { aNumerator: 1, bNumerator: 48, cNumerator: 2 },
          ],
        },
      })
    ).toThrow(/pairwise parallel/);
    expect(() =>
      tessellateAnnularRadialSolidTargetForCertification(binding, {
        ...base,
        // At u=0 this line sits at v=1/2: a periodic-seam interior crossing.
        conformingLinesByPatch: {
          'outer-wall': [{ aNumerator: 1, bNumerator: 4, cNumerator: 2 }],
        },
      })
    ).toThrow(/seam/);
  });

  it('builds exact-rational feature angular ladders (U3b): stations exactly ON k/N', () => {
    // N = 24 jump lines (odd part 3): every k/24 must be an exact station of
    // the ladder — no dyadic snapping — over denominator 3 * 2^f.
    const ladder = rationalFeatureAngularLadder(4, 24);
    expect(ladder.oddDenominatorFactor).toBe(3);
    const denominator = 3 * 2 ** ladder.log2Denominator;
    expect(ladder.numerators[0]).toBe(0);
    expect(ladder.numerators[ladder.numerators.length - 1]).toBe(denominator);
    for (let station = 1; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
    }
    // Exact feature stations: k/24 = k * (denominator / 24), an integer.
    expect(denominator % 24).toBe(0);
    for (let jump = 0; jump <= 24; jump += 1) {
      expect(ladder.numerators).toContain((jump * denominator) / 24);
    }
    // Symmetric under reversal (numerator -> D - numerator) so the atlas's
    // reversed junction welds stay station-exact.
    for (let station = 0; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBe(
        denominator - ladder.numerators[ladder.numerators.length - 1 - station]
      );
    }
    // A power-of-two jump denominator needs no odd factor at all.
    const dyadic = rationalFeatureAngularLadder(4, 8);
    expect(dyadic.oddDenominatorFactor).toBeUndefined();
  });

  it('welds a rational-ladder tessellation closed and emits rational partitions', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const ladder = rationalFeatureAngularLadder(4, 24);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      angularStations: ladder,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    expect(structural.scanComplete).toBe(true);
    // Every patch partition inherits the angular odd factor and declares the
    // complete unit square over oddFactor * 2^fractionBits on BOTH axes.
    for (const partition of tessellation.partitions) {
      expect(partition.oddDenominatorFactor).toBe('3');
      const declared = 3 * 2 ** partition.fractionBits;
      expect(partition.domain.minUNumerator).toBe('0');
      expect(partition.domain.minVNumerator).toBe('0');
      expect(partition.domain.maxUNumerator).toBe(declared.toString());
      expect(partition.domain.maxVNumerator).toBe(declared.toString());
      // The jump station u = 1/24 appears verbatim among the cell corners.
      const jumpNumerator = declared / 24;
      expect(Number.isInteger(jumpNumerator)).toBe(true);
      const uNumerators = new Set<string>();
      for (const triangle of partition.triangles) {
        for (const vertex of triangle.vertices) {
          uNumerators.add(vertex.uNumerator);
        }
      }
      expect(uNumerators.has(jumpNumerator.toString())).toBe(true);
    }
  });

  it('builds vertical rational-station ladders (U3b slice 5): arbitrary exact p/q stations', () => {
    // Inner-wall lattice lines for a dyadic bottom fraction c = 3/32 sit at
    // v = (4k-3)/29 — arbitrary rationals, not k/N of one family. The
    // ladder must contain each EXACTLY over odd(L)*2^v2(L) with L the lcm
    // of the uniform grid and every station denominator.
    const stations = [1, 2, 3, 4, 5, 6, 7].map(
      (k) => [4 * k - 3, 29] as readonly [number, number]
    );
    const ladder = rationalStationLadder(5, stations);
    expect(ladder.oddDenominatorFactor).toBe(29);
    expect(ladder.log2Denominator).toBe(5);
    const denominator = 29 * 2 ** 5;
    expect(ladder.numerators[0]).toBe(0);
    expect(ladder.numerators[ladder.numerators.length - 1]).toBe(denominator);
    for (let station = 1; station < ladder.numerators.length; station += 1) {
      expect(ladder.numerators[station]).toBeGreaterThan(ladder.numerators[station - 1]);
    }
    for (const [p, q] of stations) {
      expect(Number.isInteger((p * denominator) / q)).toBe(true);
      expect(ladder.numerators).toContain((p * denominator) / q);
    }
  });

  it('combines angular and vertical odd factors in partition emission', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const vertical = rationalStationLadder(2, [[1, 29]]);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 4,
      angularStations: rationalFeatureAngularLadder(4, 24),
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 2,
        'inner-wall': 2,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
      verticalStationsByPatch: { 'inner-wall': vertical },
    });
    const session = createFinalArtifactProofSession(tessellation.stlBytes);
    const structural = assessProofSessionStructuralIntegrity(session, {
      componentCount: 1,
      genus: 1,
    });
    expect(structural.structurallyValid).toBe(true);
    // The inner-wall partition combines q = lcm(3, 29) = 87; every other
    // patch keeps the angular factor 3 alone. All declare the complete unit
    // square over their own q * 2^fractionBits.
    for (const partition of tessellation.partitions) {
      const expectedOdd = partition.patchId === 'inner-wall' ? 87 : 3;
      expect(partition.oddDenominatorFactor).toBe(expectedOdd.toString());
      const declared = expectedOdd * 2 ** partition.fractionBits;
      expect(partition.domain.maxUNumerator).toBe(declared.toString());
      expect(partition.domain.maxVNumerator).toBe(declared.toString());
    }
    const inner = tessellation.partitions.find((p) => p.patchId === 'inner-wall');
    if (inner === undefined) throw new Error('missing inner-wall partition');
    // The rational vertical station 1/29 appears verbatim among v corners.
    const innerDeclared = 87 * 2 ** inner.fractionBits;
    const vNumerators = new Set<string>();
    for (const triangle of inner.triangles) {
      for (const vertex of triangle.vertices) {
        vNumerators.add(vertex.vNumerator);
      }
    }
    expect(innerDeclared % 29).toBe(0);
    expect(vNumerators.has((innerDeclared / 29).toString())).toBe(true);
  });

  it('assigns every artifact triangle to exactly one exact dyadic patch partition', () => {
    const { binding } = atlas(SMALL_POT_GEOMETRY, GENTLE_HARMONIC_RIPPLE);
    const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
      angularDivisionsLog2: 3,
      verticalDivisionsLog2ByPatch: {
        'outer-wall': 1,
        'inner-wall': 1,
        'top-rim': 1,
        'bottom-top': 1,
        'bottom-under': 1,
        'drain-wall': 1,
      },
    });
    expect(tessellation.partitions).toHaveLength(6);
    const seen = new Set<number>();
    for (const partition of tessellation.partitions) {
      expect(partition.artifactTriangleCount).toBe(tessellation.triangleCount);
      for (const triangle of partition.triangles) {
        expect(seen.has(triangle.artifactTriangleIndex)).toBe(false);
        seen.add(triangle.artifactTriangleIndex);
      }
    }
    expect(seen.size).toBe(tessellation.triangleCount);
  });

  // Styles proven through the full chain on the small pot. Configs are the
  // measured winners of the 2026-07-15 certification matrix (see
  // research/lab/2026-07-15-g2-style-certification-matrix.md): HarmonicRipple
  // at 9,499,923 pm / 29k tris and SpiralRidges (low-turn gentle helix) at
  // 9,499,969 pm / 54k tris. Styles absent here are blocked by the measured
  // frontier (131,072-triangle cap x 30 s deadline x uniform dyadic grids,
  // plus two screen op gaps), not by the proof machinery.
  // Crystalline heightPhase 0.25 conforming machinery: both wrap families are
  // the parallel diagonal lines 12u + 0.25t = k/2; the u-REVERSED inner and
  // drain walls carry the remapped families. The shared angular ladder holds
  // every boundary-row crossing (j/48 and (64k±3)/1536) so junction welds
  // stay station-exact.
  const CRYSTALLINE_HP_LADDER_FRACTIONS: (readonly [number, number])[] = [];
  for (let j = 1; j < 48; j += 1) CRYSTALLINE_HP_LADDER_FRACTIONS.push([j, 48]);
  for (let k = 1; k <= 24; k += 1) {
    CRYSTALLINE_HP_LADDER_FRACTIONS.push([64 * k - 3, 1536]);
  }
  for (let k = 0; k < 24; k += 1) {
    CRYSTALLINE_HP_LADDER_FRACTIONS.push([64 * k + 3, 1536]);
  }
  const CRYSTALLINE_HP_CONFORMING_LINES = {
    'outer-wall': Array.from({ length: 24 }, (_, index) => ({
      aNumerator: 48,
      bNumerator: 1,
      cNumerator: 2 * (index + 1),
    })),
    'inner-wall': Array.from({ length: 24 }, (_, index) => ({
      aNumerator: 1536,
      bNumerator: -29,
      cNumerator: 1539 - 64 * (index + 1),
    })),
    'drain-wall': Array.from({ length: 24 }, (_, index) => ({
      aNumerator: 1536,
      bNumerator: -3,
      cNumerator: 1536 - 64 * (index + 1),
    })),
  } as const;

  const CERTIFIED_POTS: readonly {
    styleId: string;
    styleParams: Readonly<Record<string, number>>;
    geometry: Readonly<Record<string, number>>;
    divisions: AnnularSolidReferenceTessellationOptions;
    maxElapsedMilliseconds: number;
    /** Envelope opt-ins for megatriangle-class pots (v5); merged into the composed options. */
    proofOptions?: Readonly<Record<string, unknown>>;
    /** Vitest timeout override for pots that outgrow the 180 s default. */
    timeoutMilliseconds?: number;
  }[] = [
    {
      styleId: 'HarmonicRipple',
      styleParams: GENTLE_HARMONIC_RIPPLE,
      geometry: SMALL_POT_GEOMETRY,
      divisions: SMALL_POT_DIVISIONS,
      maxElapsedMilliseconds: 30_000,
    },
    {
      styleId: 'SpiralRidges',
      styleParams: {
        spiral_amp_min: 0.02,
        spiral_amp_max: 0.02,
        spiral_groove_amp: 0,
        spiral_turns: 0.2,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 30_000,
    },
    // FULL DEFAULT PARAMETERS — certified 9,499,927 pm over 206,848
    // triangles in ~65 s under the 2026-07-15 resource envelope (524,288
    // mapped triangles / 120 s composed ceiling / differentiated work
    // charging / numeric screen channel).
    {
      styleId: 'FourierBloom',
      styleParams: {},
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 10,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 2,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // FULL DEFAULT PARAMETERS — certified 9,499,679 pm over 107,520
    // triangles in ~38 s once the screen's varying-exponent power gained
    // cell-local a^y*ln(a) bounds (screen v2).
    {
      styleId: 'SuperellipseMorph',
      styleParams: {},
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 9,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // PRODUCTION-DEFAULT SCALE (OD140/H120, gentle params) — certified
    // 9,499,996 pm over 155,648 triangles in ~85 s. The live profile
    // exponent t^1.1 has unbounded curvature at the base (kappa ~ t^-0.9);
    // the geometric v0 wall ladders match that divergence — each dyadic
    // halving toward the base halves the local sag.
    {
      styleId: 'HarmonicRipple',
      styleParams: GENTLE_HARMONIC_RIPPLE,
      geometry: Object.freeze({ ...DEFAULT_GEOMETRY, r_drain: 10 }),
      divisions: {
        angularDivisionsLog2: 9,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 1,
        },
        verticalStationsByPatch: {
          'outer-wall': dyadicEdgeLadder(5, 7, 'v0'),
          'inner-wall': dyadicEdgeLadder(5, 7, 'v0'),
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // FIRST FRACT-FAMILY CERTIFICATE (U3b): gentle Crystalline. Facet and
    // sub-facet wraps are value jumps of fract at u = k/24 — never on a
    // dyadic station, so before exact-rational stations + band-resolved
    // fract nodes every jump-adjacent cell hulled to [0,1] and certification
    // was impossible at ANY density. The rational angular ladder puts all 25
    // wrap stations exactly ON cell boundaries (denominator 3 * 2^8) and the
    // exact per-cell band check takes the smooth shifted path across them.
    {
      styleId: 'Crystalline',
      styleParams: {
        cr_facet_depth: 0.02,
        cr_edge_sharpness: 2,
        cr_asymmetry: 0,
        cr_height_phase: 0,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        angularStations: rationalFeatureAngularLadder(8, 24),
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 3,
          'inner-wall': 3,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 60_000,
    },
    // FIRST style with BOTH exact jump families (U3b slice 6): gentle
    // GeometricStar. Sector floors jump in u (k/8 at pointCount 8) and row
    // floors jump in v (t = k/4 at layers*zoom = 4); the affine sector
    // re-emission (target v6) + the H-32 pot (bottom fraction c = 3/32
    // exactly dyadic) put the outer-wall lines on dyadic stations and the
    // REMAPPED inner-wall lines on the exact rationals v = (8k-3)/29 that
    // the slice-5 vertical rational ladder expresses. Roundness 1 widens the
    // strap smoothstep (edge 0.22) so its diagonal cross-section resolves at
    // walls 2^6 — at roundness 0 the strap fits inside one v-cell and the
    // dense-sampled bottom-edge residual is a real 15.1 um (probe
    // 2026-07-16). Per-patch measured: all six converge, ~37 s geometry.
    {
      styleId: 'GeometricStar',
      styleParams: { gs_relief: 0.02, gs_roundness: 1 },
      geometry: Object.freeze({
        ...DEFAULT_GEOMETRY,
        H: 32,
        top_od: 30,
        bottom_od: 30,
        r_drain: 6,
      }),
      divisions: {
        angularDivisionsLog2: 9,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 6,
          'inner-wall': 6,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'inner-wall': rationalStationLadder(6, [
            [5, 29],
            [13, 29],
            [21, 29],
          ]),
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // POSITIVITY ROUTE, NOT BANDING (slice 8, confirming the slice-7
    // rerouting): SuperformulaBlossom's sign gate argument is transcendental,
    // but gentle params make it interval-positive everywhere — constant
    // integer symmetry (m=6 both ends) keeps every |trig| zero line vertical,
    // even powers n2=2 / n3=4 make the abs-power terms analytically smooth,
    // and n1=1 keeps denominator = cos^2 + sin^4 inside [3/4, 1], clearing
    // the 1e-6 epsilon by 3/4. No banding, no ladder: a plain uniform 2^8
    // grid certified 9,499,801 pm over 53,760 triangles in ~22 s. The
    // reachable level set denominator = epsilon at sharp params (n1 small,
    // n2/n3 large) stays an output-discontinuity/curtain obligation.
    {
      styleId: 'SuperformulaBlossom',
      styleParams: {
        sf_strength: 0.15,
        sf_m_top: 6,
        sf_n1: 1,
        sf_n1_top: 1,
        sf_n2: 2,
        sf_n2_top: 2,
        sf_n3: 4,
        sf_n3_top: 4,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 5,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // FIRST CONFORMING-CELLS CERTIFICATE (U5 spike, slice 9): Crystalline at
    // heightPhase 0.25 — the diagonal-jump corner Addendum 8 classified
    // U5-impossible for axis-aligned partitions. conformingLinesByPatch
    // splits every crossed cell along the EXACT parallel lines, every piece
    // is one-sided so both fract families band-resolve, and the proof runs
    // at depth <= 2 with ~85% fast-screen acceptance. All six patches
    // converge per-patch (drain-wall: 688 cells, depth 0, ~50 ms). The
    // remaining conforming frontier is CURVED feature lines (WI/Gothic) —
    // straight rational-affine diagonals are now closed.
    {
      styleId: 'Crystalline',
      styleParams: {
        cr_facet_depth: 0.02,
        cr_edge_sharpness: 2,
        cr_asymmetry: 0,
        cr_height_phase: 0.25,
      },
      geometry: Object.freeze({
        ...DEFAULT_GEOMETRY,
        H: 32,
        top_od: 30,
        bottom_od: 30,
        r_drain: 6,
      }),
      divisions: {
        angularDivisionsLog2: 8,
        angularStations: rationalStationLadder(8, CRYSTALLINE_HP_LADDER_FRACTIONS),
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 4,
          'inner-wall': 4,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
        conformingLinesByPatch: CRYSTALLINE_HP_CONFORMING_LINES,
      },
      maxElapsedMilliseconds: 110_000,
    },
    // TENTH STYLE (slice 11, envelope v3): Voronoi bubble. Addendum 9's
    // "compute-bound" was partly a LADDER gap: the true 80 um wall was the
    // inner wall's remapped t-lattice at EVERY t = k/8 (v = (4k-3)/29 at
    // H32) — the GS ladder only covered k even. With the full odd-k ladder
    // + walls 2^7 (bisector-kink chords) the composed proof runs ~119 s
    // under the v3 240 s ceiling. Banded floors + proven-constant pcg2d
    // carry the lattice; certified 9,499,879 pm / 172,032 tris.
    {
      styleId: 'Voronoi',
      styleParams: { v_morph: 0, v_relief: 0.04 },
      geometry: Object.freeze({
        ...DEFAULT_GEOMETRY,
        H: 32,
        top_od: 30,
        bottom_od: 30,
        r_drain: 6,
      }),
      divisions: {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 7,
          'inner-wall': 7,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'inner-wall': rationalStationLadder(7, [
            [1, 29],
            [5, 29],
            [9, 29],
            [13, 29],
            [17, 29],
            [21, 29],
            [25, 29],
          ]),
        },
      },
      maxElapsedMilliseconds: 235_000,
    },
    // CLASSIFICATION CORRECTED (slice 10): WaveInterference at defaults is
    // SMOOTH-but-dense, not cusp-class — the earlier "sqrt-cusp by
    // elimination" call was the lesson-#1 contour artifact. Dense ridge
    // sampling shows the clamp branches unreachable (ridge in [0.14, 0.66]
    // at the failing cell); the binding axis is ANGULAR (moire products at
    // effective frequency ~27), so 2^10 angular closes it with no conforming
    // machinery. Defaults with relief gentled 2.3 -> 0.25 mm and edge fade
    // off; certified 9,499,973 pm over 411,648 triangles in ~84 s.
    {
      styleId: 'WaveInterference',
      styleParams: { wi_relief_depth: 0.25, wi_edge_fade: 0 },
      geometry: Object.freeze({
        ...DEFAULT_GEOMETRY,
        H: 32,
        top_od: 30,
        bottom_od: 30,
        r_drain: 6,
      }),
      divisions: {
        angularDivisionsLog2: 10,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 6,
          'inner-wall': 6,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
    // FULL DEFAULTS (slice 11, 2026-07-18): relief 2.3 mm (9.2x the gentled
    // pot above) with the edge fade ACTIVE. Measured demand: vertical 87 um
    // at 2^6 rows with a knife-edge ~9.5000005 um global miss at 2^8 (closed
    // by the uniform 288-row rational ladder, odd factor 9); angular <= 10 um
    // at 2^10; edge-fade C1 kinks at t = 3/20 and 17/20 held by exact
    // stations; inner wall passes at plain 2^8. First megatriangle-class
    // certified artifact (1,267,712 tris) — envelope v5 opt-ins below.
    // Certified 9,499,990 pm in ~187 s (parallel) / ~250 s (sequential).
    {
      styleId: 'WaveInterference',
      styleParams: {},
      geometry: Object.freeze({
        ...DEFAULT_GEOMETRY,
        H: 32,
        top_od: 30,
        bottom_od: 30,
        r_drain: 6,
      }),
      divisions: {
        angularDivisionsLog2: 10,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 5,
          'inner-wall': 8,
          'top-rim': 3,
          'bottom-top': 5,
          'bottom-under': 5,
          'drain-wall': 0,
        },
        verticalStationsByPatch: {
          'outer-wall': rationalStationLadder(5, [
            ...Array.from({ length: 287 }, (_, i) => [i + 1, 288] as const).filter(
              ([numerator]) => numerator % 9 !== 0
            ),
            [3, 20],
            [17, 20],
          ]),
        },
      },
      maxElapsedMilliseconds: 560_000,
      timeoutMilliseconds: 600_000,
      proofOptions: {
        maxTotalWorkCells: 16_000_000,
        maxTotalPartitionWorkUnits: 400_000_000,
        maxStructuralWorkUnits: 2_000_000_000,
        topology: { maxWorkUnits: 400_000_000 },
        selfIntersection: {
          maxBuildWork: 400_000_000,
          maxTraversalVisits: 400_000_000,
          maxBroadPhasePairChecks: 400_000_000,
          maxCandidatePairs: 100_000_000,
        },
        patchProof: {
          maxWorkCells: 6_000_000,
          maxDepth: 30,
          partition: {
            maxTriangles: 1_048_576,
            maxBuildWork: 320_000_000,
            maxBvhNodes: 4_194_304,
            maxTraversalVisits: 320_000_000,
            maxBroadPhasePairChecks: 320_000_000,
            maxPairChecks: 160_000_000,
          },
        },
      },
    },
    // DYADIC DEFAULT OFFSETS (slice 8): at source_count 4 / rotation 0 every
    // RippleInterference source sits at an EXACT float dyadic (i/4), so the
    // antipode fract jump lines land on k/4 — already uniform-dyadic
    // stations — and the fract argument u - sourceU + 0.5 is point-affine
    // (no tau roundtrip). Addendum-8's float-offset wall exists only at
    // non-power-of-two source counts or rotation != 0 (the honest envelope
    // boundary, exactly like GeometricStar shift != 0). Frequency 6 keeps
    // wall sag ~6.5 um at 2^6 vertical cells. Certified 9,499,975 pm over
    // 86,528 triangles in ~49 s.
    {
      styleId: 'RippleInterference',
      styleParams: {
        ri_source_count: 4,
        ri_wave_frequency: 6,
        ri_relief_depth: 0.15,
        ri_phase: 0,
        ri_rotation: 0,
      },
      geometry: SMALL_POT_GEOMETRY,
      divisions: {
        angularDivisionsLog2: 8,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 6,
          'inner-wall': 6,
          'top-rim': 3,
          'bottom-top': 4,
          'bottom-under': 4,
          'drain-wall': 0,
        },
      },
      maxElapsedMilliseconds: 110_000,
    },
  ];

  // The pot-scale composed proofs take ~20-25 s each, so they ride the
  // PF_G2_POT env gate like the repo's other heavy fidelity gates. This IS
  // the G2 e2e gate: atlas -> reference tessellation -> final bytes -> full
  // partial certification at the 0.01 mm claim.
  for (const certified of CERTIFIED_POTS) {
    it.skipIf(!process.env.PF_G2_POT)(
      `proves a complete ${certified.styleId} pot (${certified.geometry.top_od}mm OD) to the continuous 0.01 mm partial certificate`,
      { timeout: certified.timeoutMilliseconds ?? 180_000 },
      () => {
        const { binding, canonicalInput } = atlas(
          certified.geometry,
          certified.styleParams,
          certified.styleId
        );
        const tessellation = tessellateAnnularRadialSolidTargetForCertification(
          binding,
          certified.divisions
        );
        const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
          binding.surfaceComplex
        );
        const session = createFinalArtifactProofSession(tessellation.stlBytes);
        const result = proveFinalStlMappedGeometryAndStructure(
          session,
          canonicalInput,
          target,
          jobsFor(binding, tessellation, target.targetSha256),
          {
            requestedTolerancePm: 10_000_000n,
            reservedNonGeometricMarginPm: 500_000n,
            maxElapsedMilliseconds: certified.maxElapsedMilliseconds,
            ...certified.proofOptions,
          }
        );
        // The module can never mint a full certificate — but the continuous
        // two-sided geometric claim over the COMPLETE closed solid must hold.
        expect(result.certified).toBe(false);
        expect(result.provenClaims).toContain('patch-distance');
        expect(result.provenClaims).toContain('artifact-coverage');
        expect(result.provenClaims).toContain('topology');
        expect(result.provenClaims).toContain('self-intersection');
        expect(result.structural.structurallyValid).toBe(true);
        expect(result.geometry.scanComplete).toBe(true);
        const upper = BigInt(result.geometricTwoSidedUpperPm);
        expect(upper > 0n).toBe(true);
        expect(upper <= BigInt(result.geometricBudgetPm)).toBe(true);
        expect(BigInt(result.geometryPlusReservedUpperPm) <= 10_000_000n).toBe(true);
      }
    );
  }

  it.skipIf(!process.env.PF_G2_POT)(
    'refuses fail-closed at production-default scale instead of weakening tolerance',
    { timeout: 120_000 },
    () => {
      // DEFAULT_GEOMETRY at default HarmonicRipple params needs more than the
      // proof layer's 131,072 mapped-triangle hard cap to reach 0.01 mm with a
      // uniform grid. The honest outcome today is a refusal, never a silently
      // weakened tolerance. This documents the exact refusal shape.
      const { binding, canonicalInput } = atlas({ ...DEFAULT_GEOMETRY, r_drain: 10 }, {});
      const tessellation = tessellateAnnularRadialSolidTargetForCertification(binding, {
        angularDivisionsLog2: 10,
        verticalDivisionsLog2ByPatch: {
          'outer-wall': 6,
          'inner-wall': 6,
          'top-rim': 1,
          'bottom-top': 3,
          'bottom-under': 3,
          'drain-wall': 2,
        },
      });
      const target = createCompleteMappedGeometryTargetBindingFromSurfaceComplex(
        binding.surfaceComplex
      );
      const session = createFinalArtifactProofSession(tessellation.stlBytes);
      expect(() =>
        proveFinalStlMappedGeometryAndStructure(
          session,
          canonicalInput,
          target,
          jobsFor(binding, tessellation, target.targetSha256),
          {
            requestedTolerancePm: 10_000_000n,
            reservedNonGeometricMarginPm: 500_000n,
            maxElapsedMilliseconds: 30_000,
          }
        )
      ).toThrow(FinalStlPartialCertificationError);
    }
  );
});
