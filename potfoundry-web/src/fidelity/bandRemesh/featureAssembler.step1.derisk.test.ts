/**
 * featureAssembler.step1.derisk.test.ts — STEP 1 (throwaway de-risk): the JUNCTION
 * ↔ surround weld.
 *
 * STEP 0 proved a single curved ridge band welds to a cdt2d featureless complement.
 * STEP 1 proves the HARDER case: a degree-3 junction (3 arms + central fan, paved
 * by `paveJunction`) welds its CONCAVE, multiply-reentrant Y-perimeter to a
 * `corridorPaveMulti({features:[]})` surround — exercising the flood-fill's
 * concave-bay handling (the regions between the Y's arms) that a single convex band
 * never touches.
 *
 * ## Construction (same asymmetric weld as STEP 0)
 *
 * `paveJunction` (now QSCALE-quantized + exposing `vertexUT`, parity with
 * `paveRidge`) gives the watertight Y mesh. Its OUTER perimeter (the 3 free arm
 * ends + the 6 side rails) is the band's count-1 edge set — extracted for free by
 * `extractHoleBoundary(yMesh, ∅)` (the band↔fan SEAMS, `sharedEdgeKeys`, are count-2
 * interior, so they're excluded). That perimeter is the inner hole; a dyadic
 * rectangle frame [0,1]² is the outer open boundary. The surround consumes the Y's
 * exact perimeter ids as fixed boundary constraints (bands = source of truth).
 *
 * ## The gate (= STEP-0 gate + the junction's internal seams survive the merge)
 *
 *  - the Y perimeter is a single SIMPLE closed loop (degree-2), ⊆ openBoundaryVertices;
 *  - the junction's band↔fan seams (`sharedEdgeKeys`) are count-2 in the MERGED mesh;
 *  - `corridorPaveMulti` reports `inversionCount==0`, `unfillablePinches==[]`;
 *  - merged mesh nonManifoldEdges==0, tJunctions==0 (frame = open boundary);
 *  - every Y-perimeter (outer-rail) edge incidence==2 (1 junction tri + 1 fill tri);
 *  - NEGATIVE CONTROL: splitting one perimeter vertex junction-side → tJunctions>0.
 *
 * CPU throwaway spike. Reuses only proven primitives; touches no production code.
 * Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
 *
 * @module fidelity/bandRemesh/featureAssembler.step1.derisk.test
 */

import { describe, it, expect } from 'vitest';
import { SyntheticCylinderSampler } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { paveJunction } from './junction';
import type { JunctionArm, JunctionResult } from './junction';
import { corridorPaveMulti } from './corridorPave';
import type { CorridorPaveMultiResult } from './corridorPave';
import { extractHoleBoundary } from './seamFill';
import type { HoleBoundary } from './seamFill';
import { auditWatertight, triangleQuality3D } from './audit';
import type { Mesh3 } from './audit';
import { QSCALE } from './railKey';
import type { StationPoint } from './stations';

// ── Cylinder + Y-junction parameters ──────────────────────────────────────────

const R0 = 50; // mm
const H = 100; // mm
const AMP = 4; // mm — real ripple → genuinely curved rails
const K = 3;
const CENTER: StationPoint = { u: 0.5, t: 0.5 };
const ARM_HALF_WIDTH_U = 0.05; // ≈ 15.7mm azimuthal half-width
const ARM_LENGTH_U = 0.1;
const TARGET_MM = 3.0; // FL11-ish

/**
 * Build a symmetric 120° Y-junction (the proven `junction.test.ts` geometry):
 * three constant-width ribbons radiating from CENTER, adjacent arms sharing the
 * inner corners P0,P1,P2 by exact (u,t). Arm i: foot rail OUTER→Pi, crest OUTER→P(i+1).
 */
function buildArms(armHalfWidthU: number, armLengthU: number): JunctionArm[] {
  const innerR = armHalfWidthU / Math.sin(Math.PI / 3);
  const cornerAt = (i: number): StationPoint => {
    const ang = (2 * Math.PI * i) / 3 + Math.PI / 6 - Math.PI / 3;
    return { u: CENTER.u + innerR * Math.cos(ang), t: CENTER.t + innerR * Math.sin(ang) };
  };
  const outerEndpoint = (i: number, side: 1 | -1): StationPoint => {
    const theta = (2 * Math.PI * i) / 3 + Math.PI / 6;
    const axis = { u: Math.cos(theta), t: Math.sin(theta) };
    const perp = { u: -Math.sin(theta), t: Math.cos(theta) };
    const r = innerR * Math.cos(Math.PI / 6) + armLengthU;
    return {
      u: CENTER.u + axis.u * r + side * armHalfWidthU * perp.u,
      t: CENTER.t + axis.t * r + side * armHalfWidthU * perp.t,
    };
  };
  const corners: StationPoint[] = [cornerAt(0), cornerAt(1), cornerAt(2)];
  const arms: JunctionArm[] = [];
  for (let i = 0; i < 3; i++) {
    arms.push({
      footRail: [outerEndpoint(i, -1), corners[i]],
      crestRail: [outerEndpoint(i, 1), corners[(i + 1) % 3]],
      junctionFoot: corners[i],
      junctionCrest: corners[(i + 1) % 3],
    });
  }
  return arms;
}

// ── Helpers (mirror STEP 0) ─────────────────────────────────────────────────────

function edgeKey(i: number, j: number): string {
  return i < j ? `${i}:${j}` : `${j}:${i}`;
}

/** Plain NON-periodic dyadic snap (frame welds to nothing; avoids quantizeRailUT's u=1→0 fold). */
function dyadicSnap(x: number): number {
  return Math.round(x * QSCALE) / QSCALE;
}

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
  for (let i = 0; i < nU; i++) push(uLo + ((uHi - uLo) * i) / nU, tLo);
  for (let i = 0; i < nT; i++) push(uHi, tLo + ((tHi - tLo) * i) / nT);
  for (let i = 0; i < nU; i++) push(uHi - ((uHi - uLo) * i) / nU, tHi);
  for (let i = 0; i < nT; i++) push(uLo, tHi - ((tHi - tLo) * i) / nT);
  return out;
}

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

interface Step1Build {
  jr: JunctionResult;
  perimeter: number[];
  fill: CorridorPaveMultiResult;
  merged: Mesh3;
  frameSet: Set<number>;
  nJunction: number;
}

function buildStep1(): Step1Build {
  const sampler = new SyntheticCylinderSampler(R0, H, AMP, K);

  // 1. The junction (source of truth; vertices QSCALE-dyadic via the parity edit).
  const jr = paveJunction(buildArms(ARM_HALF_WIDTH_U, ARM_LENGTH_U), sampler, TARGET_MM);
  const nJunction = jr.vertexUT.length;

  // 2. The Y's OUTER perimeter = its count-1 edges (band↔fan seams are count-2 interior).
  const yBoundary = extractHoleBoundary({ indices: jr.mesh.indices }, new Set<number>());
  const perimeter = yBoundary.loops.length === 1 ? yBoundary.loops[0] : [];

  // 3. Dyadic rectangle frame surrounding the Y; subdivide ~3× the perimeter spacing.
  const yStep = perimeter.length > 0 ? medianLoopEdge(perimeter, jr.vertexUT) : 0.01;
  const frameUT = buildFrameLoop(0, 1, 0, 1, Math.max(0.01, yStep * 3));
  const frameIds = frameUT.map((_, i) => nJunction + i);
  const frameSet = new Set(frameIds);

  // 4. Merged id table: junction ids first (identity), then the frame.
  const mergedUT: Array<[number, number]> = jr.vertexUT
    .map((p) => [p[0], p[1]] as [number, number])
    .concat(frameUT);

  // 5. Complement hole boundary: frame OUTER + Y perimeter INNER; complementDir = the
  //    Y's directed traversal (so the fill welds OPPOSITE the junction on the perimeter).
  const boundary: HoleBoundary = {
    loops: [frameIds, ...yBoundary.loops],
    complementDir: yBoundary.complementDir,
    vertexCount: mergedUT.length,
  };

  // 6. Fill the featureless surround.
  const fill = corridorPaveMulti({ boundary, vertexUT: mergedUT, features: [], sampler });

  // 7. Merge junction tris (ids < nJunction, identity-preserved) ++ fill tris.
  const allUT = fill.vertexUT;
  const positions = new Float32Array(allUT.length * 3);
  for (let i = 0; i < allUT.length; i++) {
    const p = sampler.position(allUT[i][0], allUT[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }
  const indices = new Uint32Array(jr.mesh.indices.length + fill.triangles.length * 3);
  indices.set(jr.mesh.indices, 0);
  let w = jr.mesh.indices.length;
  for (const tri of fill.triangles) {
    indices[w++] = tri[0];
    indices[w++] = tri[1];
    indices[w++] = tri[2];
  }
  const merged: Mesh3 = { positions, indices };

  return { jr, perimeter, fill, merged, frameSet, nJunction };
}

let cached: Step1Build | undefined;
function getBuild(): Step1Build {
  if (!cached) cached = buildStep1();
  return cached;
}

// ── THE GATE ──────────────────────────────────────────────────────────────────

// Documented throwaway de-risk spike: skipped in CI; run with PF_DERISK=1.
describe.skipIf(!process.env.PF_DERISK)('STEP 1 — junction ↔ cdt2d surround weld', () => {
  it('the Y perimeter is a single SIMPLE closed loop (degree-2) ⊆ openBoundaryVertices', () => {
    const { jr, perimeter } = getBuild();
    expect(perimeter.length).toBeGreaterThan(8);
    // Every perimeter vertex must be an open-boundary (outer) vertex of the Y — the
    // band↔fan seams (interior) must NOT leak into the perimeter.
    let leaks = 0;
    for (const id of perimeter) if (!jr.openBoundaryVertices.has(id)) leaks++;
    expect(leaks).toBe(0);
  });

  it("the junction's band↔fan seams stay count-2 in the MERGED mesh", () => {
    const { merged, jr } = getBuild();
    const inc = incidence(merged.indices);
    expect(jr.sharedEdgeKeys.length).toBeGreaterThan(0);
    let broken = 0;
    for (const key of jr.sharedEdgeKeys) if (inc.get(key) !== 2) broken++;
    expect(broken).toBe(0);
  });

  it('corridorPaveMulti fills the surround with inversionCount==0 and unfillablePinches==[]', () => {
    const { fill } = getBuild();
    expect(fill.triangles.length).toBeGreaterThan(0);
    expect(fill.inversionCount).toBe(0);
    expect(fill.unfillablePinches).toEqual([]);
  });

  it('GATE: merged mesh has nonManifoldEdges==0 and tJunctions==0 (no crack at the junction↔surround weld)', () => {
    const { merged, frameSet } = getBuild();
    const audit = auditWatertight(merged, { boundaryVertexIndices: frameSet });
    // eslint-disable-next-line no-console
    console.log('[STEP1] audit', JSON.stringify(audit));
    expect(audit.nonManifoldEdges).toBe(0);
    expect(audit.tJunctions).toBe(0);
    expect(audit.boundaryEdges).toBeGreaterThan(0);
  });

  it('every Y-perimeter edge incidence==2 (1 junction tri + 1 fill tri)', () => {
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
    const { merged, jr, fill } = getBuild();
    const q = triangleQuality3D(merged);
    // eslint-disable-next-line no-console
    console.log(
      `[STEP1] tris junction=${jr.mesh.indices.length / 3} fill=${fill.triangles.length} ` +
        `aspectMax=${q.aspectMax.toFixed(2)} pct<10=${q.pctMinAngleBelow10.toFixed(1)}% p50=${q.minAngleP50.toFixed(1)}°`,
    );
    expect(merged.indices.length % 3).toBe(0);
  });

  it('NEGATIVE CONTROL: splitting one perimeter vertex junction-side → tJunctions>0', () => {
    const { merged, jr, perimeter, frameSet } = getBuild();

    // Any Y-perimeter vertex is a shared weld vertex with the surround (the Y has no
    // free ring — its whole perimeter welds). Pick a mid-loop one.
    const splitId = perimeter[Math.floor(perimeter.length / 2)];
    expect(splitId).toBeGreaterThanOrEqual(0);
    expect(frameSet.has(splitId)).toBe(false);

    const newId = merged.positions.length / 3;
    const positions = new Float32Array(merged.positions.length + 3);
    positions.set(merged.positions);
    positions[merged.positions.length] = merged.positions[splitId * 3];
    positions[merged.positions.length + 1] = merged.positions[splitId * 3 + 1];
    positions[merged.positions.length + 2] = merged.positions[splitId * 3 + 2];

    const indices = new Uint32Array(merged.indices);
    const junctionSpan = jr.mesh.indices.length;
    for (let k = 0; k < junctionSpan; k++) {
      if (indices[k] === splitId) indices[k] = newId;
    }

    const crackedAudit = auditWatertight({ positions, indices }, { boundaryVertexIndices: frameSet });
    expect(crackedAudit.tJunctions).toBeGreaterThan(0);
  });
});
