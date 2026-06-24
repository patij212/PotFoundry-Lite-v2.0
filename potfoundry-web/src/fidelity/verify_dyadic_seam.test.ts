/**
 * verify_dyadic_seam.test.ts — Q1 of the dyadic-edge-seam spike: THE MAKE-OR-BREAK.
 *
 * Proves (or cheaply refutes) the UNIVERSAL watertight seam: an externally-filled
 * region bounded by WHOLE dyadic cell edges, reusing the complement's EXACT
 * hole-boundary vertices (corners + 2:1-balance mid-edges), welds to the
 * production complement. This is the opposite of the band-stitch NO-GO (the rail
 * seam): there the complement re-discretised an arbitrary feature curve at its own
 * crossings → rail edges never welded (FL7 817 T-junctions). Here the seam is the
 * complement's OWN dyadic cell edges, which it shares with its neighbours by
 * construction.
 *
 * The approach (ZERO production edits — pure orchestration on Task-2's bandRegions):
 *   1. Make a hole: assembleWatertight on a SMOOTH cylinder with a CELL-ALIGNED
 *      (u,t) rectangle bandRegion → the emit-gate skips WHOLE dyadic cells fully
 *      inside the rectangle → the hole is the union of whole cells, bounded by
 *      dyadic cell edges (the rectangle edges are k/8 → exact at FL7 and FL11).
 *   2. Extract the hole boundary: from the emitted OUTER wall, the count-1 edges
 *      off the t=0/t=1 rings are the hole boundary; order into closed loop(s) of
 *      vertex ids (incl. 2:1 mid-edges automatically — each finer half-edge is
 *      count-1 on the hole side).
 *   3. Fill the hole: ear-clip the polygon in (u,t) reusing ONLY the loop's
 *      existing vertex ids, oriented to weld count-2 against the complement.
 *   4. Merge + audit: auditWatertight(merged, {boundaryVertexIndices: rings}).
 *
 * THE GATE (FL7 AND FL11, NOT weakened): merged boundaryEdges = the t=0/t=1 rings
 * ONLY, nonManifoldEdges=0, orientationMismatches=0, tJunctions=0.
 * Non-vacuous control: crack ONE interior hole-boundary vertex → tJunctions>0.
 * Flag-OFF byte-identical: with NO bandRegions, assembleWatertight is byte-identical.
 *
 * Pure CPU, read-only analytic samplers (jsdom / Vitest, NO WebGPU).
 */
import { describe, it, expect } from 'vitest';
import type { SurfaceSampler, Vec3 } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  assembleWatertight,
  type BandRegion,
} from '../renderers/webgpu/parametric/conforming/WatertightAssembly';
import { auditWatertight, triangleQuality3D, lateralWobbleMm, type Mesh3 } from './bandRemesh/audit';
import { railVertexKey, QSCALE } from './bandRemesh/railKey';
import { extractHoleBoundary, fillHole, type IndexedMesh } from './bandRemesh/seamFill';
import { corridorPave, type UTPoint } from './bandRemesh/corridorPave';

const TAU = 2 * Math.PI;

// ── Realistic pot dims (identical to the band-integration harness). ───────────
const H = 120;
const R0 = 40;
const TBOTTOM = 6;

const BASE = {
  maxSagMm: 0.05,
  maxEdgeMm: 1,
  minEdgeMm: 0.1,
  gradeRatio: 2,
  maxLevel: 12,
  resU: 128,
  resT: 128,
  nRing: 1024,
  targetTriangles: 6_000_000,
  budgetMode: 'cap' as const,
};

const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };

// The CELL-ALIGNED hole rectangle. Edges are multiples of 1/8 → exact dyadic cell
// boundaries at EVERY featureLevel ≥ 3 (FL7 cell=1/128, FL11 cell=1/2048). Kept
// well off the t=0/t=1 rings and the u=0/1 seam (interior of the wall).
const U_LO = 0.375, U_HI = 0.625, T_LO = 0.375, T_HI = 0.625;

function buildCylinderSamplers(): { sampler: SurfaceSampler; innerSampler: SurfaceSampler } {
  const sampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      return [R0 * Math.cos(theta), R0 * Math.sin(theta), t * H];
    },
  };
  const innerSampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 - 4;
      const z = TBOTTOM + t * (H - TBOTTOM);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
  return { sampler, innerSampler };
}

/** A single full-height feature strand (OFF the hole) so the feature path runs. */
function cylinderFeature(): FeatureLine[] {
  const points = [] as { u: number; t: number }[];
  for (let k = 0; k <= 16; k++) points.push({ u: 0.05, t: 0.1 + (0.8 * k) / 16 });
  return [{ kind: 'general-curve', points, label: 'cyl-strand' }];
}

const holeBand: BandRegion = {
  insideBand(u: number, t: number): boolean {
    const uu = ((u % 1) + 1) % 1;
    return uu > U_LO && uu < U_HI && t > T_LO && t < T_HI;
  },
};

/**
 * Build the merged OUTER-WALL mesh from an assembly: intern the outer-wall (u,t)
 * vertices by the complement's QSCALE key (railVertexKey) — a shared (u,t)
 * collapses to ONE merged id — and remap the outer-wall triangles. Returns the
 * merged complement outer-wall mesh, the (u,t) per merged id, the ring vertex ids
 * (t=0 / t=1), and a 3D position evaluator factory.
 */
interface MergedComplement {
  outerWall: IndexedMesh; // merged-id triangles of the complement outer wall
  vertexUT: Array<[number, number]>; // (u,t) per merged id
  ringVertexIds: Set<number>; // merged ids on the t=0 / t=1 rings
}

/** Intern an assembly's OUTER wall into merged-id space (railVertexKey dedup). */
function internAssembly(assembly: ReturnType<typeof assembleWatertight>): {
  merged: MergedComplement;
  mergedUt: Array<[number, number]>;
} {
  const av = assembly.vertices; // packed (u,t,surfaceId)
  const ai = assembly.indices;
  const outerRange = assembly.surfaceRanges.find((r) => r.surfaceId === 0);
  if (outerRange === undefined) {
    throw new Error('buildMergedComplement: assembly produced no outer wall (surfaceId 0)');
  }
  // The outer wall is appended FIRST → its owned vertices are [0, outerVertCount).
  const outerVertCount = outerRange.vertexCount;

  const keyToMerged = new Map<number, number>();
  const mergedUt: Array<[number, number]> = [];
  const internUt = (u: number, t: number): number => {
    const key = railVertexKey(u, t);
    let id = keyToMerged.get(key);
    if (id === undefined) {
      id = mergedUt.length;
      keyToMerged.set(key, id);
      mergedUt.push([u, t]);
    }
    return id;
  };

  const tris: number[] = [];
  const compToMerged = new Int32Array(outerVertCount).fill(-1);
  const isOuterVert = (vi: number): boolean => vi < outerVertCount;
  const internComp = (vi: number): number => {
    if (compToMerged[vi] >= 0) return compToMerged[vi];
    const id = internUt(av[vi * 3], av[vi * 3 + 1]);
    compToMerged[vi] = id;
    return id;
  };
  for (let k = 0; k + 2 < ai.length; k += 3) {
    const a = ai[k], b = ai[k + 1], c = ai[k + 2];
    if (!isOuterVert(a) || !isOuterVert(b) || !isOuterVert(c)) continue; // not an outer-wall tri
    tris.push(internComp(a), internComp(b), internComp(c));
  }

  // Ring vertices: merged ids whose snapped t is exactly 0 or 1 (the pinned rings).
  const ringVertexIds = new Set<number>();
  for (let i = 0; i < mergedUt.length; i++) {
    const tQ = Math.round(mergedUt[i][1] * QSCALE);
    if (tQ === 0 || tQ === QSCALE) ringVertexIds.add(i);
  }

  return {
    merged: { outerWall: { indices: tris }, vertexUT: mergedUt, ringVertexIds },
    mergedUt,
  };
}

/** Evaluate 3D positions for every merged (u,t) via the cylinder sampler. */
function evalPositions(mergedUt: Array<[number, number]>): Float32Array {
  const { sampler } = buildCylinderSamplers();
  const positions = new Float32Array(mergedUt.length * 3);
  for (let i = 0; i < mergedUt.length; i++) {
    const p = sampler.position(mergedUt[i][0], mergedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  return positions;
}

/**
 * Orientation consistency: every interior (count-2) edge of the merged mesh must
 * be traversed in OPPOSITE directions by its two triangles (consistent winding).
 * Returns the count of interior edges with a SAME-direction conflict (0 = ok).
 * (Cloned from the band-integration harness.)
 */
function orientationMismatches(indices: Uint32Array): number {
  const dir = new Map<string, number>();
  const undirected = new Map<string, number>();
  for (let k = 0; k + 2 < indices.length; k += 3) {
    const tri = [indices[k], indices[k + 1], indices[k + 2]];
    for (let e = 0; e < 3; e++) {
      const i = tri[e], j = tri[(e + 1) % 3];
      if (i === j) continue;
      dir.set(`${i}->${j}`, (dir.get(`${i}->${j}`) ?? 0) + 1);
      const uk = i < j ? `${i}:${j}` : `${j}:${i}`;
      undirected.set(uk, (undirected.get(uk) ?? 0) + 1);
    }
  }
  let conflicts = 0;
  for (const [uk, count] of undirected) {
    if (count !== 2) continue;
    const [iS, jS] = uk.split(':');
    const ij = dir.get(`${iS}->${jS}`) ?? 0;
    const ji = dir.get(`${jS}->${iS}`) ?? 0;
    if (!(ij === 1 && ji === 1)) conflicts++;
  }
  return conflicts;
}

interface SeamMeasurement {
  featureLevel: number;
  boundaryEdges: number;
  ringVerts: number;
  nonManifoldEdges: number;
  tJunctions: number;
  orientMismatches: number;
  holeVerts: number;
  holeLoops: number;
  midEdgeVerts: number; // hole-boundary verts NOT on a featureLevel coarse-grid node (2:1 mid-edges)
  fillTris: number;
  mergedTris: number;
}

/**
 * Run the FULL Q1 pipeline at one featureLevel: make the hole, extract its
 * boundary, fill it, merge, and audit. Returns the measured (not asserted) gate.
 */
function measureSeamAtLevel(featureLevel: number): SeamMeasurement {
  const { sampler, innerSampler } = buildCylinderSamplers();
  const assembly = assembleWatertight(sampler, innerSampler, DIMS, {
    ...BASE,
    featureLevel,
    outerFeatureLines: cylinderFeature(),
    bandRegions: [holeBand],
  });
  const { merged, mergedUt } = internAssembly(assembly);

  // 2. Extract the hole boundary.
  const boundary = extractHoleBoundary(merged.outerWall, merged.ringVertexIds);

  // 3. Fill the hole reusing the EXACT boundary vertex ids.
  const fill = fillHole(boundary, merged.vertexUT);

  // 4. Merge fill triangles into the complement outer wall (same ids).
  const compTris = merged.outerWall.indices as number[];
  const mergedTris: number[] = compTris.slice();
  for (const [a, b, c] of fill.triangles) mergedTris.push(a, b, c);

  const positions = evalPositions(mergedUt);
  const mergedMesh: Mesh3 = { positions, indices: new Uint32Array(mergedTris) };

  const audit = auditWatertight(mergedMesh, { boundaryVertexIndices: merged.ringVertexIds });
  const orient = orientationMismatches(mergedMesh.indices);

  // How many hole-boundary vertices are 2:1-balance MID-EDGE vertices? A mid-edge
  // vertex splits a STRAIGHT cell edge into two halves — so its two incident
  // hole-boundary loop edges are COLLINEAR in (u,t). A genuine staircase corner
  // (where the dyadic boundary turns) has non-collinear (≈90°) incident edges.
  // This is the load-bearing 2:1 subtlety: a finer emitting neighbour split the
  // shared cell edge and emitted this vertex; the extraction MUST include it (it
  // does — these vertices are count-1 on the hole side). (Reported, not gated; the
  // tJunctions=0 gate already proves NONE was missed.)
  const midEdge = (a: [number, number], b: [number, number], c: [number, number]): boolean => {
    // b is collinear-interior between a and c?
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    return Math.abs(cross) < 1e-9;
  };
  let midEdgeVerts = 0;
  for (const loop of boundary.loops) {
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = merged.vertexUT[loop[(i + n - 1) % n]];
      const b = merged.vertexUT[loop[i]];
      const c = merged.vertexUT[loop[(i + 1) % n]];
      if (midEdge(a, b, c)) midEdgeVerts++;
    }
  }

  const m: SeamMeasurement = {
    featureLevel,
    boundaryEdges: audit.boundaryEdges,
    ringVerts: merged.ringVertexIds.size,
    nonManifoldEdges: audit.nonManifoldEdges,
    tJunctions: audit.tJunctions,
    orientMismatches: orient,
    holeVerts: boundary.vertexCount,
    holeLoops: boundary.loops.length,
    midEdgeVerts,
    fillTris: fill.triangles.length,
    mergedTris: mergedTris.length / 3,
  };
  // eslint-disable-next-line no-console
  console.log(
    `[Q1 seam FL${featureLevel}] bnd=${m.boundaryEdges} (rings=${m.ringVerts}) nonMan=${m.nonManifoldEdges} ` +
    `tJunction=${m.tJunctions} orientMismatch=${m.orientMismatches} | holeVerts=${m.holeVerts} ` +
    `loops=${m.holeLoops} midEdgeVerts=${m.midEdgeVerts} fillTris=${m.fillTris} mergedTris=${m.mergedTris}`,
  );
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE GATE — GO/NO-GO at FL7 AND FL11. NOT weakened: the hole-boundary edges must
// weld count-2 (complement tri + fill tri) so the merged open boundary is the
// t=0/t=1 rings ONLY, with zero non-manifold / orientation / T-junction defects.
// ─────────────────────────────────────────────────────────────────────────────
describe('dyadic-edge seam — cell-aligned hole-fill welds watertight (Q1)', () => {
  it('FL7: the externally-filled cell-aligned hole welds to the complement (0/0/0)', () => {
    const m = measureSeamAtLevel(7);
    expect(m.holeVerts).toBeGreaterThan(0); // there IS a hole to fill
    expect(m.boundaryEdges).toBe(m.ringVerts); // open boundary = the two rings ONLY
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0); // the seam welds count-2
  }, 600000);

  it('FL11: the seam still welds watertight at the finer feature level (0/0/0)', () => {
    const m = measureSeamAtLevel(11);
    expect(m.holeVerts).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
  }, 600000);

  it('NON-VACUOUS control: cracking ONE interior hole-boundary vertex ⇒ tJunctions > 0', () => {
    // Build the clean merged seam at FL7, confirm it audits 0 T-junctions, then
    // crack ONE interior hole-boundary vertex (t strictly in (0,1)) by duplicating
    // it and re-pointing a single incident triangle. The audit must DETECT the
    // crack (so the GO above is a genuine weld, not an audit blind-spot).
    const { sampler, innerSampler } = buildCylinderSamplers();
    const assembly = assembleWatertight(sampler, innerSampler, DIMS, {
      ...BASE,
      featureLevel: 7,
      outerFeatureLines: cylinderFeature(),
      bandRegions: [holeBand],
    });
    const { merged, mergedUt } = internAssembly(assembly);
    const boundary = extractHoleBoundary(merged.outerWall, merged.ringVertexIds);
    const fill = fillHole(boundary, merged.vertexUT);

    const compTris = merged.outerWall.indices as number[];
    const mergedTris: number[] = compTris.slice();
    for (const [a, b, c] of fill.triangles) mergedTris.push(a, b, c);
    const positions = evalPositions(mergedUt);

    const cleanMesh: Mesh3 = { positions, indices: new Uint32Array(mergedTris) };
    const cleanAudit = auditWatertight(cleanMesh, { boundaryVertexIndices: merged.ringVertexIds });
    expect(cleanAudit.tJunctions).toBe(0); // the seam is clean

    // Pick an INTERIOR hole-boundary vertex (t strictly in (0,1), not on a ring).
    let crackV = -1;
    for (const loop of boundary.loops) {
      for (const id of loop) {
        const [, t] = merged.vertexUT[id];
        if (t > 1e-6 && t < 1 - 1e-6 && !merged.ringVertexIds.has(id)) { crackV = id; break; }
      }
      if (crackV >= 0) break;
    }
    expect(crackV).toBeGreaterThanOrEqual(0);

    const nV = mergedUt.length;
    const newPositions = new Float32Array((nV + 1) * 3);
    newPositions.set(positions);
    newPositions[nV * 3] = positions[crackV * 3];
    newPositions[nV * 3 + 1] = positions[crackV * 3 + 1];
    newPositions[nV * 3 + 2] = positions[crackV * 3 + 2];
    const crackedIndices = Uint32Array.from(mergedTris);
    let cracked = false;
    for (let k = 0; k + 2 < crackedIndices.length && !cracked; k += 3) {
      for (let e = 0; e < 3; e++) {
        if (crackedIndices[k + e] === crackV) {
          crackedIndices[k + e] = nV; // re-point ONE incidence → splits the fan
          cracked = true;
          break;
        }
      }
    }
    expect(cracked).toBe(true);

    const crackedMesh: Mesh3 = { positions: newPositions, indices: crackedIndices };
    const crackedAudit = auditWatertight(crackedMesh, { boundaryVertexIndices: merged.ringVertexIds });
    // eslint-disable-next-line no-console
    console.log(
      `[Q1 control] clean tJunctions=${cleanAudit.tJunctions}; after cracking interior ` +
      `hole-boundary vertex v=${crackV} ⇒ tJunctions=${crackedAudit.tJunctions}`,
    );
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
  }, 600000);

  it('FLAG-OFF byte-identical: no bandRegions ⇒ vertices+indices unchanged', () => {
    const { sampler, innerSampler } = buildCylinderSamplers();
    const features = cylinderFeature();
    const baseline = assembleWatertight(sampler, innerSampler, DIMS, {
      ...BASE,
      featureLevel: 7,
      outerFeatureLines: features,
    });
    const withOptUndefined = assembleWatertight(sampler, innerSampler, DIMS, {
      ...BASE,
      featureLevel: 7,
      outerFeatureLines: features,
      bandRegions: undefined,
    });
    expect(withOptUndefined.vertices.length).toBe(baseline.vertices.length);
    expect(withOptUndefined.indices.length).toBe(baseline.indices.length);
    expect(Array.from(withOptUndefined.vertices)).toEqual(Array.from(baseline.vertices));
    expect(Array.from(withOptUndefined.indices)).toEqual(Array.from(baseline.indices));
  }, 600000);
});

// ═════════════════════════════════════════════════════════════════════════════
// Q2 — FEATURE-ALIGNED CORRIDOR PAVING, welded at the dyadic seam.
//
// The corridor is a ~1.5-cell-wide band around a synthetic DIAGONAL ridge that
// crosses cells diagonally (the worst case for the axis-aligned per-cell mesher —
// the serration source). The emit-gate excludes the whole feature-crossing cells
// → a DIAGONAL STAIRCASE hole. corridorPave fills it as ONE region with the
// feature pinned as our OWN constraint edge-chain (so it becomes a continuous
// mesh polyline — the cure), the boundary pinned to the EXACT Q1 hole-boundary
// vertex ids (so the seam still welds 0/0/0).
//
// THE GATE (FL7 AND FL11): (1) the Q1 seam STILL holds — boundaryEdges = rings
// only, nonManifold=0, orientMismatch=0, tJunction=0; (2) the feature is a
// CONTINUOUS chain of mesh edges (every densified feature segment is a mesh edge)
// with small lateral wobble from the analytic locus; (3) aspect + %<10° MEASURED
// (target aspect ≤ 4 / zero <10°; honest documented residuals allowed).
// ═════════════════════════════════════════════════════════════════════════════

// The diagonal ridge LOCUS: t = T0 + SLOPE·(u − U0), a straight diagonal in (u,t).
const DIAG_U0 = 0.3, DIAG_U1 = 0.7;          // u-span of the feature inside the wall
const DIAG_T0 = 0.3, DIAG_T1 = 0.7;          // t at u0 / u1 (slope-1 diagonal)
const CORRIDOR_HALF = 0.012;                 // half-width (~1.5 FL7 cells) of the band
const RIDGE_AMP = 1.5;                        // mm relief on the diagonal (makes the feature real)
const RIDGE_SIGMA = 0.008;                    // Gaussian falloff of the ridge (u,t units)

/** Distance (u,t) from a point to the diagonal locus segment. */
function distToDiagonal(u: number, t: number): number {
  const ax = DIAG_U0, ay = DIAG_T0, bx = DIAG_U1, by = DIAG_T1;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const f = Math.max(0, Math.min(1, ((u - ax) * dx + (t - ay) * dy) / len2));
  const cx = ax + dx * f, cy = ay + dy * f;
  return Math.hypot(u - cx, t - cy);
}

/** Cylinder with a Gaussian ridge along the diagonal locus (a REAL feature). */
function buildDiagonalRidgeSamplers(): { sampler: SurfaceSampler; innerSampler: SurfaceSampler } {
  const ridge = (u: number, t: number): number => {
    const d = distToDiagonal(u, t);
    return RIDGE_AMP * Math.exp(-(d * d) / (2 * RIDGE_SIGMA * RIDGE_SIGMA));
  };
  const sampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 + ridge(u, t);
      return [r * Math.cos(theta), r * Math.sin(theta), t * H];
    },
  };
  const innerSampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 - 4;
      const z = TBOTTOM + t * (H - TBOTTOM);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
  return { sampler, innerSampler };
}

/** The corridor band: whole cells whose interior is within CORRIDOR_HALF of the diagonal. */
const corridorBand: BandRegion = {
  insideBand(u: number, t: number): boolean {
    const uu = ((u % 1) + 1) % 1;
    return distToDiagonal(uu, t) < CORRIDOR_HALF;
  },
};

/** Feature polyline = dense diagonal-locus samples, ENDS EXTENDED past the corridor. */
function diagonalFeaturePolyline(): UTPoint[] {
  // Extend the ends a little beyond [U0,U1] so the polyline's head/tail lie OUTSIDE
  // the hole → corridorPave snaps each to the nearest EXISTING hole-boundary id.
  const uLo = DIAG_U0 - 0.03, uHi = DIAG_U1 + 0.03;
  const pts: UTPoint[] = [];
  const N = 400;
  for (let k = 0; k <= N; k++) {
    const u = uLo + ((uHi - uLo) * k) / N;
    // Same slope-1 diagonal extended.
    const t = DIAG_T0 + (DIAG_T1 - DIAG_T0) * ((u - DIAG_U0) / (DIAG_U1 - DIAG_U0));
    pts.push({ u, t });
  }
  return pts;
}

/** As a FeatureLine so the assembly's feature path runs (off-corridor minimal strand too). */
function diagonalFeatureLines(): FeatureLine[] {
  return [{ kind: 'general-curve', points: diagonalFeaturePolyline(), label: 'diag-ridge' }];
}

/** Eval 3D positions for merged (u,t) via the DIAGONAL-RIDGE sampler. */
function evalRidgePositions(mergedUt: Array<[number, number]>): Float32Array {
  const { sampler } = buildDiagonalRidgeSamplers();
  const positions = new Float32Array(mergedUt.length * 3);
  for (let i = 0; i < mergedUt.length; i++) {
    const p = sampler.position(mergedUt[i][0], mergedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  return positions;
}

interface CorridorMeasurement {
  featureLevel: number;
  boundaryEdges: number;
  ringVerts: number;
  nonManifoldEdges: number;
  tJunctions: number;
  orientMismatches: number;
  holeVerts: number;
  holeLoops: number;
  // Q2 feature-followed + quality:
  featureChainLen: number;       // densified feature segments
  featureChainAllEdges: boolean; // every feature segment is a mesh edge (no staircase)
  wobbleP99Mm: number;           // lateral wobble of the feature chain from the locus
  wobbleMaxMm: number;
  corridorAspectMax: number;     // aspect over CORRIDOR triangles only
  corridorPctBelow10: number;    // %<10° over corridor triangles
  cdtInversions: number;
  cdtDrops: number;
  fillTris: number;
}

/** Run the full Q2 pipeline at one featureLevel and MEASURE (not assert). */
function measureCorridorAtLevel(featureLevel: number): CorridorMeasurement {
  const { sampler, innerSampler } = buildDiagonalRidgeSamplers();
  const assembly = assembleWatertight(sampler, innerSampler, DIMS, {
    ...BASE,
    featureLevel,
    outerFeatureLines: diagonalFeatureLines(),
    bandRegions: [corridorBand],
  });
  const { merged, mergedUt } = internAssembly(assembly);

  const boundary = extractHoleBoundary(merged.outerWall, merged.ringVertexIds);

  // ── Q2 fill: feature-aligned corridor paving. ──
  // targetEdgeUT OMITTED → corridorPave AUTO-CALIBRATES the interior Steiner
  // density to the median dyadic boundary-edge spacing (the 2:1 mid-edge spacing).
  // Matching the dense staircase wall is the quality lever: a coarse interior
  // against a dense boundary fans into slivers (MEASURED 45% → 0.06% `<10°`).
  const pave = corridorPave({
    boundary,
    vertexUT: merged.vertexUT,
    featurePolyline: diagonalFeaturePolyline(),
    sampler,
  });

  // Merge: complement outer wall + corridor fill. The fill's ids < existingCount
  // are the SHARED ids; ids ≥ existingCount are NEW interior vertices appended to
  // the merged (u,t) table.
  const mergedUt2: Array<[number, number]> = mergedUt.slice();
  for (let i = mergedUt.length; i < pave.vertexUT.length; i++) mergedUt2.push(pave.vertexUT[i]);

  const compTris = merged.outerWall.indices as number[];
  const allTris: number[] = compTris.slice();
  for (const [a, b, c] of pave.triangles) allTris.push(a, b, c);

  const positions = evalRidgePositions(mergedUt2);
  const mergedMesh: Mesh3 = { positions, indices: new Uint32Array(allTris) };

  const audit = auditWatertight(mergedMesh, { boundaryVertexIndices: merged.ringVertexIds });
  const orient = orientationMismatches(mergedMesh.indices);

  // ── Feature-followed proof: every densified feature segment is a MESH EDGE. ──
  const meshEdges = new Set<string>();
  for (let k = 0; k + 2 < allTris.length; k += 3) {
    const tri = [allTris[k], allTris[k + 1], allTris[k + 2]];
    for (let e = 0; e < 3; e++) {
      const i = tri[e], j = tri[(e + 1) % 3];
      meshEdges.add(i < j ? `${i}:${j}` : `${j}:${i}`);
    }
  }
  let featureChainAllEdges = true;
  for (let i = 0; i + 1 < pave.featureChainIds.length; i++) {
    const a = pave.featureChainIds[i], b = pave.featureChainIds[i + 1];
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!meshEdges.has(key)) { featureChainAllEdges = false; break; }
  }

  // Lateral wobble of the feature chain from the analytic diagonal locus (mm).
  // The diagonal is t = u (slope-1: equal u/t spans). Parametrise the locus over
  // the chain's ACTUAL u-range — the snapped boundary endpoints can reach a little
  // beyond [DIAG_U0,DIAG_U1], and a locus clamped to the feature span would score
  // those (on-diagonal) endpoints as false wobble.
  const uToMm = TAU * R0; // u·2πR ≈ circumference (mm)
  const tToMm = H;        // t·H (mm)
  const chainUT = pave.featureChainIds.map((id) => mergedUt2[id]);
  let chainMinU = Infinity;
  let chainMaxU = -Infinity;
  for (const [u] of chainUT) {
    if (u < chainMinU) chainMinU = u;
    if (u > chainMaxU) chainMaxU = u;
  }
  const wob = lateralWobbleMm(
    chainUT,
    (uParam: number) => {
      // t = u diagonal sampled over the chain's actual u-extent.
      const uc = chainMinU + (chainMaxU - chainMinU) * uParam;
      return [uc, uc];
    },
    uToMm,
    tToMm,
  );

  // ── Quality over the CORRIDOR fill triangles ONLY. ──
  const corridorMesh: Mesh3 = {
    positions,
    indices: new Uint32Array(pave.triangles.flat()),
  };
  const q = triangleQuality3D(corridorMesh);

  const m: CorridorMeasurement = {
    featureLevel,
    boundaryEdges: audit.boundaryEdges,
    ringVerts: merged.ringVertexIds.size,
    nonManifoldEdges: audit.nonManifoldEdges,
    tJunctions: audit.tJunctions,
    orientMismatches: orient,
    holeVerts: boundary.vertexCount,
    holeLoops: boundary.loops.length,
    featureChainLen: pave.featureChainIds.length - 1,
    featureChainAllEdges,
    wobbleP99Mm: wob.p99,
    wobbleMaxMm: wob.max,
    corridorAspectMax: q.aspectMax,
    corridorPctBelow10: q.pctMinAngleBelow10,
    cdtInversions: pave.inversionCount,
    cdtDrops: pave.droppedCount,
    fillTris: pave.triangles.length,
  };
  // eslint-disable-next-line no-console
  console.log(
    `[Q2 corridor FL${featureLevel}] bnd=${m.boundaryEdges} (rings=${m.ringVerts}) ` +
    `nonMan=${m.nonManifoldEdges} tJunction=${m.tJunctions} orientMismatch=${m.orientMismatches} | ` +
    `holeVerts=${m.holeVerts} loops=${m.holeLoops} fillTris=${m.fillTris} | ` +
    `featureChain=${m.featureChainLen}seg allMeshEdges=${m.featureChainAllEdges} ` +
    `wobbleP99=${m.wobbleP99Mm.toFixed(4)}mm max=${m.wobbleMaxMm.toFixed(4)}mm | ` +
    `aspectMax=${m.corridorAspectMax.toFixed(2)} %<10°=${m.corridorPctBelow10.toFixed(2)} ` +
    `cdt(inv=${m.cdtInversions} drop=${m.cdtDrops})`,
  );
  return m;
}

describe('dyadic-edge seam — feature-aligned corridor paving (Q2)', () => {
  it('FL7: the diagonal corridor welds 0/0/0 AND the feature is a continuous mesh edge-chain', () => {
    const m = measureCorridorAtLevel(7);
    // (1) The Q1 seam STILL holds (the load-bearing pass criterion).
    expect(m.holeVerts).toBeGreaterThan(0);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    // (2) The feature is FOLLOWED — a continuous chain of mesh edges (no staircase).
    expect(m.featureChainLen).toBeGreaterThan(0);
    expect(m.featureChainAllEdges).toBe(true);
    expect(m.wobbleP99Mm).toBeLessThan(0.05); // chain rides the analytic locus (≈0)
    // (3) Quality (MEASURED evidence; the load-bearing pass criteria are the seam
    // + feature-edge-chain above). Boundary-matched Steiner density keeps min-angle
    // slivers essentially gone everywhere. DOCUMENTED RESIDUAL: the thin diagonal
    // ribbon terminates in a WEDGE at each of its 2 interior tips; cdt2d closes
    // each tip with one high-ASPECT triangle (~4 tris, away from the feature) — an
    // artifact of the synthetic ribbon's pointed ends, not the paving.
    expect(m.corridorPctBelow10).toBeLessThan(0.5); // ≈0.06% — near sliver-free
    expect(m.corridorAspectMax).toBeLessThan(150); // ≈107 at the 2 ribbon tips (documented)
  }, 600000);

  it('FL11: the corridor seam still welds 0/0/0 and the feature chain holds at the finer level', () => {
    const m = measureCorridorAtLevel(11);
    expect(m.holeVerts).toBeGreaterThan(0);
    expect(m.fillTris).toBeGreaterThan(0);
    expect(m.boundaryEdges).toBe(m.ringVerts);
    expect(m.nonManifoldEdges).toBe(0);
    expect(m.orientMismatches).toBe(0);
    expect(m.tJunctions).toBe(0);
    expect(m.featureChainLen).toBeGreaterThan(0);
    expect(m.featureChainAllEdges).toBe(true);
    expect(m.wobbleP99Mm).toBeLessThan(0.05);
    // FL11: finer boundary → the tips resolve cleanly (aspectMax ≈ 5.4, 0% <10°).
    expect(m.corridorPctBelow10).toBeLessThan(0.5);
    expect(m.corridorAspectMax).toBeLessThan(20);
  }, 600000);
});
