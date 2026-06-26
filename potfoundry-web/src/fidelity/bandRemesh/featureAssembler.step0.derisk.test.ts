/**
 * featureAssembler.step0.derisk.test.ts — STEP 0 (throwaway de-risk): the KEYSTONE
 * band↔interior weld.
 *
 * The whole feature-aligned assembler rests on ONE unproven thing: that a CURVED,
 * DIAGONAL `paveRidge` band welds to a `cdt2d`-filled featureless complement with
 * ZERO T-junctions — via quantize-first (`quantizeRailUT`) + exact-(u,t)-key intern
 * (the band is the SOURCE OF TRUTH; the interior CONSUMES the band's rail vertices
 * as fixed boundary constraints). Everything else (the strip-pave quality, the
 * junction fan, the conditioner) is already proven. This spike settles the weld,
 * measure-first, BEFORE any production wiring.
 *
 * ## The fill entry (first sub-task — settled by reading corridorPave.ts)
 *
 * `corridorPave` REQUIRES a feature crossing (it indexes `featurePolyline[0/last]`),
 * so it cannot fill a FEATURELESS complement. `corridorPaveMulti({features: []})`
 * degrades GRACEFULLY to a pure boundary+Steiner constrained-Delaunay fill — it
 * reuses the entire PROVEN core verbatim (topological flood-fill, largest-area
 * interior classification, boundary-completeness audit → `unfillablePinches`,
 * `reconcileToComplement` winding) and returns exactly the diagnostics this gate
 * needs. So the featureless complement fill entry = `corridorPaveMulti` with an
 * EMPTY feature array. (Verified: no empty-features hazard — junction minting,
 * `planarizeChains`, and feature-segment rejection are all skipped cleanly.)
 *
 * ## Setup (isolates the weld)
 *
 * A diagonal ridge spine (u:0.2→0.6, t:0.1→0.9) on a `SyntheticCylinderSampler`
 * (R0=50, H=100, with a real ripple so the rail is genuinely curved). `paveRidge`
 * gives the watertight crease band + dyadic `vertexUT`; its OUTER perimeter (the
 * two flank crest rails + the two t-end caps — i.e. the band's count-1 edges; the
 * spine crease is count-2 interior) is the hole the complement fills around.
 *
 * The band perimeter loop + its directed traversal (`complementDir`) come for FREE
 * from `extractHoleBoundary(bandMesh, ∅)` — exactly the `HoleBoundary` shape
 * `corridorPaveMulti` consumes. The complement is bounded OUTSIDE by a dyadic
 * RECTANGLE frame [0,1]×[0,1] (the band sits comfortably interior in u). This is a
 * NON-PERIODIC patch on purpose: the u-seam (u=1≡u=0) weld is a SEPARATE concern
 * already shipped by the production complement (the quadtree + WatertightAssembly
 * wrap u by-construction) and is re-verified at STEP 4's faithful gate. STEP 0
 * isolates the one new thing — the diagonal curved rail ↔ cdt2d weld. The "rings"
 * gate accordingly generalizes to "the rectangle frame": every non-rail count-1
 * edge must lie on the frame (its 4 sides), nowhere else.
 *
 * ## The gate (measure incidence DIRECTLY — UV/unit tests understate seam cracks)
 *
 *  - the band perimeter is a single SIMPLE closed loop (degree-2);
 *  - `corridorPaveMulti` reports `inversionCount==0` and `unfillablePinches==[]`;
 *  - on the MERGED mesh (band tris ++ fill tris over the shared id table):
 *      nonManifoldEdges==0, tJunctions==0 with the frame as the open boundary;
 *  - EVERY band-outer-rail (perimeter) edge incidence==2 (1 band tri + 1 fill tri);
 *  - NEGATIVE CONTROL: splitting one interior perimeter vertex band-side → the gate
 *    reports tJunctions>0 (proves the gate is non-vacuous).
 *
 * CPU throwaway spike. Touches NO production code; reuses only proven primitives.
 * Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/featureAssembler.step0.derisk.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { paveRidge } from './featureStrip';
import type { RidgeResult } from './featureStrip';
import { corridorPaveMulti } from './corridorPave';
import type { CorridorPaveMultiResult } from './corridorPave';
import { extractHoleBoundary } from './seamFill';
import type { HoleBoundary } from './seamFill';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { QSCALE } from './railKey';
import type { StationPoint } from './stations';

// ── Cylinder + band parameters ──────────────────────────────────────────────────

const R0 = 50; // mm — cylinder radius
const H = 100; // mm — cylinder height
const AMP = 4; // mm — ripple amplitude (real curvature so the rail is genuinely curved)
const K = 3; // ripples around the circumference

/** The DIAGONAL spine (worst case for the weld; a vertical rail is already proven by stitch.test). */
const SPINE: StationPoint[] = [
  { u: 0.2, t: 0.1 },
  { u: 0.6, t: 0.9 },
];
const RIDGE_OPTS = { widthMm: 6, edgeMm: 3 };

// ── Helpers ──────────────────────────────────────────────────────────────────────

/** Canonical undirected edge key (i<j). */
function edgeKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/**
 * Plain (NON-periodic) dyadic snap onto the QSCALE grid. The frame welds to NOTHING
 * (it is the true open outer boundary), so — unlike rail vertices — it must NOT use
 * `quantizeRailUT`'s periodic u-fold, which would collapse u=1 onto u=0 and destroy
 * the rectangle. Frame vertices are still exactly dyadic (k/QSCALE).
 */
function dyadicSnap(x: number): number {
  return Math.round(x * QSCALE) / QSCALE;
}

/**
 * Build the rectangle-frame outer loop as an ordered ring of NEW dyadic vertices,
 * subdivided at ~`stepUT` spacing. Walks the perimeter CCW without duplicating
 * corners. Returns the (u,t) list (caller assigns ids `baseId + index`).
 */
function buildFrameLoop(
  uLo: number,
  uHi: number,
  tLo: number,
  tHi: number,
  stepUT: number,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const push = (u: number, t: number): void => out.push([dyadicSnap(u), dyadicSnap(t)]);
  const segs = (len: number): number => Math.max(1, Math.round(len / stepUT));
  const nU = segs(uHi - uLo);
  const nT = segs(tHi - tLo);
  // bottom edge: (uLo,tLo) → (uHi,tLo), excluding the final corner.
  for (let i = 0; i < nU; i++) push(uLo + ((uHi - uLo) * i) / nU, tLo);
  // right edge: (uHi,tLo) → (uHi,tHi), excluding the final corner.
  for (let i = 0; i < nT; i++) push(uHi, tLo + ((tHi - tLo) * i) / nT);
  // top edge: (uHi,tHi) → (uLo,tHi), excluding the final corner.
  for (let i = 0; i < nU; i++) push(uHi - ((uHi - uLo) * i) / nU, tHi);
  // left edge: (uLo,tHi) → (uLo,tLo), excluding the final corner.
  for (let i = 0; i < nT; i++) push(uLo, tHi - ((tHi - tLo) * i) / nT);
  return out;
}

/** Median undirected edge length (in (u,t)) of a loop of ids over `ut`. */
function medianLoopEdge(loop: number[], ut: Array<[number, number]>): number {
  const lens: number[] = [];
  for (let i = 0; i < loop.length; i++) {
    const a = ut[loop[i]];
    const b = ut[loop[(i + 1) % loop.length]];
    lens.push(Math.hypot(a[0] - b[0], a[1] - b[1]));
  }
  lens.sort((x, y) => x - y);
  return lens[Math.floor(lens.length / 2)] || 0.01;
}

interface Step0Build {
  ridge: RidgeResult;
  bandBoundary: HoleBoundary;
  perimeter: number[];
  fill: CorridorPaveMultiResult;
  merged: Mesh3;
  frameSet: Set<number>;
  nBand: number;
}

/**
 * Run the full STEP-0 construction once: paveRidge → extract band perimeter →
 * frame → corridorPaveMulti featureless fill → merged mesh. Pure, deterministic.
 */
function buildStep0(): Step0Build {
  const sampler = new SyntheticCylinderSampler(R0, H, AMP, K);

  // 1. The band (source of truth; vertices already QSCALE-dyadic via quantizeRailUT).
  const ridge = paveRidge(SPINE, sampler, RIDGE_OPTS);
  const nBand = ridge.vertexUT.length;

  // 2. The band's OUTER perimeter = its count-1 edges (spine crease is count-2 interior).
  //    extractHoleBoundary(∅ rings) orders them into closed loops and asserts degree-2,
  //    and hands back complementDir = the band's directed traversal of each edge.
  const bandBoundary = extractHoleBoundary({ indices: ridge.mesh.indices }, new Set<number>());
  const perimeter = bandBoundary.loops.length === 1 ? bandBoundary.loops[0] : [];

  // 3. The dyadic rectangle frame (outer open boundary). Subdivide ~3× the band's
  //    perimeter spacing so the annulus triangulates without absurd long edges.
  const bandStep = bandBoundary.loops.length === 1 ? medianLoopEdge(perimeter, ridge.vertexUT) : 0.01;
  const frameUT = buildFrameLoop(0, 1, 0, 1, Math.max(0.01, bandStep * 3));
  const frameIds = frameUT.map((_, i) => nBand + i);
  const frameSet = new Set(frameIds);

  // 4. Merged id table: band ids first (identity), then the frame.
  const mergedUT: Array<[number, number]> = ridge.vertexUT
    .map((p) => [p[0], p[1]] as [number, number])
    .concat(frameUT);

  // 5. The complement hole boundary: frame OUTER loop + band perimeter INNER loop(s).
  //    complementDir carries ONLY the band-perimeter edges (the frame is open) so the
  //    fill flips to weld OPPOSITE the band on the perimeter.
  const boundary: HoleBoundary = {
    loops: [frameIds, ...bandBoundary.loops],
    complementDir: bandBoundary.complementDir,
    vertexCount: mergedUT.length,
  };

  // 6. Fill the featureless complement (the entry settled in the docstring).
  const fill = corridorPaveMulti({ boundary, vertexUT: mergedUT, features: [], sampler });

  // 7. Merge band tris (ids < nBand, identity-preserved by the fill) ++ fill tris,
  //    over the fill's vertex table (band ++ frame ++ interior). Eval all positions.
  const allUT = fill.vertexUT;
  const positions = new Float32Array(allUT.length * 3);
  for (let i = 0; i < allUT.length; i++) {
    const p = sampler.position(allUT[i][0], allUT[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const indices = new Uint32Array(ridge.mesh.indices.length + fill.triangles.length * 3);
  indices.set(ridge.mesh.indices, 0);
  let w = ridge.mesh.indices.length;
  for (const tri of fill.triangles) {
    indices[w++] = tri[0];
    indices[w++] = tri[1];
    indices[w++] = tri[2];
  }
  const merged: Mesh3 = { positions, indices };

  return { ridge, bandBoundary, perimeter, fill, merged, frameSet, nBand };
}

/** Lazy single build (the describe body runs at collection even when skipped). */
let cached: Step0Build | undefined;
function getBuild(): Step0Build {
  if (!cached) cached = buildStep0();
  return cached;
}

/** Edge-incidence map over a flat index buffer. */
function incidence(indices: Uint32Array | number[]): Map<string, number> {
  const m = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k];
    const b = indices[k + 1];
    const c = indices[k + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      if (i === j) continue;
      const key = edgeKey(i, j);
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  }
  return m;
}

// ── THE GATE ──────────────────────────────────────────────────────────────────

// Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
describe.skipIf(!process.env.PF_DERISK)('STEP 0 — KEYSTONE weld: diagonal paveRidge band ↔ cdt2d complement', () => {
  it('the band perimeter is a single SIMPLE closed loop (degree-2)', () => {
    const { bandBoundary, perimeter } = getBuild();
    // extractHoleBoundary throws on any non-degree-2 vertex (a self-touch / open chain),
    // so reaching here with exactly one loop proves the band footprint is simple.
    expect(bandBoundary.loops.length).toBe(1);
    expect(perimeter.length).toBeGreaterThan(8);
  });

  it('corridorPaveMulti fills with inversionCount==0 and unfillablePinches==[]', () => {
    const { fill } = getBuild();
    expect(fill.triangles.length).toBeGreaterThan(0);
    expect(fill.inversionCount).toBe(0);
    expect(fill.unfillablePinches).toEqual([]);
  });

  it('GATE: merged mesh has nonManifoldEdges==0 and tJunctions==0 (no crack at the weld)', () => {
    const { merged, frameSet } = getBuild();
    const audit = auditWatertight(merged, { boundaryVertexIndices: frameSet });
    // eslint-disable-next-line no-console
    console.log('[STEP0] audit', JSON.stringify(audit));
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    // The frame IS the open boundary (otherwise the band rails would be wrongly forgiven).
    expect(audit.boundaryEdges).toBeGreaterThan(0);
  });

  it('every band-outer-rail (perimeter) edge incidence==2 (1 band tri + 1 fill tri)', () => {
    const { merged, perimeter } = getBuild();
    const inc = incidence(merged.indices);
    expect(perimeter.length).toBeGreaterThan(0);
    let cracked = 0;
    for (let i = 0; i < perimeter.length; i++) {
      const key = edgeKey(perimeter[i], perimeter[(i + 1) % perimeter.length]);
      if (inc.get(key) !== 2) cracked++;
    }
    expect(cracked).toBe(0);
  });

  it('reports merged triangle quality (informational — the weld, not quality, is the de-risk)', () => {
    const { merged, ridge, fill } = getBuild();
    const q = triangleQuality3D(merged);
    // eslint-disable-next-line no-console
    console.log(
      `[STEP0] tris band=${ridge.mesh.indices.length / 3} fill=${fill.triangles.length} ` +
        `aspectMax=${q.aspectMax.toFixed(2)} pct<10=${q.pctMinAngleBelow10.toFixed(1)}% p50=${q.minAngleP50.toFixed(1)}°`,
    );
    expect(merged.indices.length % 3).toBe(0);
  });

  it('NEGATIVE CONTROL: splitting one interior perimeter vertex band-side → tJunctions>0', () => {
    const { merged, ridge, perimeter, frameSet } = getBuild();

    // Pick an interior perimeter vertex: a band id, t strictly inside (0.2, 0.8) so it is
    // unambiguously a shared weld vertex (never a frame vertex, never a near-cap tip).
    let splitId = -1;
    for (const id of perimeter) {
      const t = ridge.vertexUT[id][1];
      if (t > 0.2 && t < 0.8) {
        splitId = id;
        break;
      }
    }
    expect(splitId).toBeGreaterThanOrEqual(0);

    // Duplicate it; re-point only the BAND triangles (the first ridge.mesh.indices span of
    // the merged buffer) — the fill triangles keep the original id → a real rail crack.
    const newId = merged.positions.length / 3;
    const positions = new Float32Array(merged.positions.length + 3);
    positions.set(merged.positions);
    positions[merged.positions.length] = merged.positions[splitId * 3];
    positions[merged.positions.length + 1] = merged.positions[splitId * 3 + 1];
    positions[merged.positions.length + 2] = merged.positions[splitId * 3 + 2];

    const indices = new Uint32Array(merged.indices);
    const bandSpan = ridge.mesh.indices.length;
    for (let k = 0; k < bandSpan; k++) {
      if (indices[k] === splitId) indices[k] = newId;
    }

    const crackedAudit = auditWatertight({ positions, indices }, { boundaryVertexIndices: frameSet });
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
  });
});
