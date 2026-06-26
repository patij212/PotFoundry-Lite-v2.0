/**
 * featureStrip.ts — the ridge strip-pave primitive.
 *
 * {@link paveRidge} is the production form of the PROVEN feature-following
 * construction (Step-1 strip-pave + the featurefollow de-risk). Given a feature
 * SPINE (a conditioned-graph edge polyline) on a surface, it paves TWO flank
 * bands that SHARE the spine rail exactly, so the spine becomes a single
 * watertight CREASE EDGE and each flank's rows run PARALLEL to the ridge — which
 * kills serration (the crest is a real mesh edge, not a staircase) and keeps the
 * flank triangles well-shaped (rows ∥ feature ⇒ no spanning slivers). Rows are
 * sized in 3D metric arclength, so it is density-invariant.
 *
 * The two flanks share the spine because BOTH `buildStations` calls use the SAME
 * densified spine as their FOOT rail — `buildStations` selects foot rows purely
 * from the foot arclength, so both flanks select identical spine vertices, which
 * weld by exact (u,t) key into one crease.
 *
 * @module fidelity/bandRemesh/featureStrip
 */

import type { SurfaceSampler, Vec3 } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { Mesh3 } from './audit';
import { buildStations } from './stations';
import type { StationPoint } from './stations';
import { paveBand } from './paver';
import { densifyRail } from './stitch';
import { quantizeRailUT } from './railKey';

/** Options for {@link paveRidge}. */
export interface RidgeOptions {
  /** Flank half-width: each flank extends this far (mm) from the spine. */
  widthMm: number;
  /** Target 3D edge length (mm) — drives row + cross-band sizing. */
  edgeMm: number;
}

/** Result of {@link paveRidge}. */
export interface RidgeResult {
  /** Combined two-flank mesh (watertight by construction). */
  mesh: Mesh3;
  /**
   * (u,t) per mesh vertex (aligned to `mesh.positions`), each on the QSCALE dyadic
   * grid. The assembler welds bands to the cdt2d interior by `railVertexKey` over
   * these — so a band rail (u,t) and the same complement (u,t) collapse to one id.
   */
  vertexUT: Array<[number, number]>;
  /** Combined-mesh vertex ids of the shared spine rail, in spine order. */
  spineVertexIds: number[];
  /**
   * TRUE open-boundary vertices (the two outer flank rails + the two t-ends).
   * Pass to `auditWatertight({ boundaryVertexIndices })`; any count-1 edge NOT on
   * these is a real defect. The spine crease is interior (count-2), excluded.
   */
  openBoundaryVertices: Set<number>;
}

const METRIC_EPS = 1e-4;

function sub3(a: Vec3, b: Vec3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function len3(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/**
 * Unit-3D-length UV perpendicular to the spine tangent `(du,dt)` at `(u,t)`:
 * the (a,b) realizing the in-tangent-plane normal×tangent direction with 3D step
 * length 1 (solved via the first fundamental form). Caller scales by ±widthMm.
 */
function perpUV(sampler: SurfaceSampler, u: number, t: number, du: number, dt: number): { a: number; b: number } {
  const pu = sub3(sampler.position(u + METRIC_EPS, t), sampler.position(u - METRIC_EPS, t)).map((x) => x / (2 * METRIC_EPS)) as [number, number, number];
  const pt = sub3(sampler.position(u, t + METRIC_EPS), sampler.position(u, t - METRIC_EPS)).map((x) => x / (2 * METRIC_EPS)) as [number, number, number];
  const E = dot3(pu, pu), F = dot3(pu, pt), G = dot3(pt, pt);
  const tan3: Vec3 = [pu[0] * du + pt[0] * dt, pu[1] * du + pt[1] * dt, pu[2] * du + pt[2] * dt];
  const nrm: Vec3 = [pu[1] * pt[2] - pu[2] * pt[1], pu[2] * pt[0] - pu[0] * pt[2], pu[0] * pt[1] - pu[1] * pt[0]];
  let perp3: Vec3 = [nrm[1] * tan3[2] - nrm[2] * tan3[1], nrm[2] * tan3[0] - nrm[0] * tan3[2], nrm[0] * tan3[1] - nrm[1] * tan3[0]];
  const pl = len3(perp3) || 1;
  perp3 = [perp3[0] / pl, perp3[1] / pl, perp3[2] / pl];
  const det = E * G - F * F;
  if (!(Math.abs(det) > 1e-12)) return { a: -dt, b: du };
  const rhsU = dot3(pu, perp3), rhsT = dot3(pt, perp3);
  let a = (rhsU * G - rhsT * F) / det;
  let b = (rhsT * E - rhsU * F) / det;
  const step3 = Math.sqrt(Math.max(1e-12, E * a * a + 2 * F * a * b + G * b * b));
  a /= step3;
  b /= step3;
  return { a, b };
}

/** Offset every spine vertex perpendicular (metric) by `sign·widthMm` → a flank rail. */
function offsetRail(spine: StationPoint[], sampler: SurfaceSampler, widthMm: number, sign: 1 | -1): StationPoint[] {
  const n = spine.length;
  const out: StationPoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)];
    const b = spine[Math.min(n - 1, i + 1)];
    let du = (b.u - a.u) % 1;
    if (du > 0.5) du -= 1;
    if (du < -0.5) du += 1;
    const dt = b.t - a.t;
    const l = Math.hypot(du, dt) || 1;
    const { a: pa, b: pb } = perpUV(sampler, spine[i].u, spine[i].t, du / l, dt / l);
    out.push({ u: spine[i].u + sign * pa * widthMm, t: spine[i].t + sign * pb * widthMm });
  }
  return out;
}

/** Canonical (u,t) dedup key (matches paver/stitch interning). */
function utKey(u: number, t: number): string {
  return `${u}|${t}`;
}

/**
 * Pave a ridge: two flank bands sharing the spine rail → one watertight mesh with
 * the spine as a crease edge.
 *
 * @param spine   The feature spine polyline (≥2 (u,t) points; a conditioned-graph
 *                edge). May be sparse — it is densified internally.
 * @param sampler Surface position evaluator.
 * @param opts    Flank width + target edge length (mm).
 */
export function paveRidge(spine: StationPoint[], sampler: SurfaceSampler, opts: RidgeOptions): RidgeResult {
  const { widthMm, edgeMm } = opts;
  // Densify the spine ONCE to the buildStations precondition; both flanks use this
  // SAME densified spine as foot → identical spine rows → a shared crease.
  const maxSpacingMm = (edgeMm / 2) * 0.95;
  const spineDense = densifyRail(spine, sampler, maxSpacingMm);
  const leftRail = densifyRail(offsetRail(spineDense, sampler, widthMm, 1), sampler, maxSpacingMm);
  const rightRail = densifyRail(offsetRail(spineDense, sampler, widthMm, -1), sampler, maxSpacingMm);

  const leftGrid = buildStations(spineDense, leftRail, sampler, edgeMm);
  const rightGrid = buildStations(spineDense, rightRail, sampler, edgeMm);
  const leftBand = paveBand(leftGrid, sampler);
  const rightBand = paveBand(rightGrid, sampler);

  // Combine both bands into one (u,t)-interned vertex table.
  // Every vertex is SNAPPED onto the QSCALE dyadic grid (quantizeRailUT) before
  // interning + position eval. This is the crux that makes the band's weld key
  // bit-compatible with the production complement's railVertexKey, so a ridge rail
  // welds to the cdt2d interior with zero T-junctions (the assembler's keystone).
  // The snap is sub-micron (≤ 1/2·QSCALE in u,t) so quality/watertightness are
  // unaffected; coincident rail points from both flanks snap to ONE id (the crease).
  const keyToId = new Map<string, number>();
  const combinedUt: Array<[number, number]> = [];
  const intern = (uRaw: number, tRaw: number): number => {
    const [u, t] = quantizeRailUT(uRaw, tRaw);
    const key = utKey(u, t);
    let id = keyToId.get(key);
    if (id === undefined) {
      id = combinedUt.length;
      keyToId.set(key, id);
      combinedUt.push([u, t]);
    }
    return id;
  };

  const tris: number[] = [];
  const addBand = (band: typeof leftBand): number[] => {
    const map = band.utVertices.map((v) => intern(v[0], v[1]));
    for (let k = 0; k < band.indices.length; k += 3) {
      const a = map[band.indices[k]], b = map[band.indices[k + 1]], c = map[band.indices[k + 2]];
      if (a === b || b === c || c === a) continue;
      tris.push(a, b, c);
    }
    return map;
  };
  const leftMap = addBand(leftBand);
  addBand(rightBand);

  // Spine rail = the FOOT rail of either band (identical (u,t)); take the left's.
  const spineVertexIds = leftBand.railVertexIds.foot.map((id) => leftMap[id]);

  // Open boundary = the two outer flank rails (crest of each band) + the two
  // t-end rows of each flank. The spine (foot) crease is interior (count-2).
  const openBoundaryVertices = new Set<number>();
  for (const grid of [leftGrid, rightGrid]) {
    const rows = grid.rows;
    for (const p of rows[0].w) openBoundaryVertices.add(intern(p.u, p.t));
    for (const p of rows[rows.length - 1].w) openBoundaryVertices.add(intern(p.u, p.t));
  }
  for (const id of leftBand.railVertexIds.crest) openBoundaryVertices.add(leftMap[id]);
  for (const id of rightBand.railVertexIds.crest) {
    openBoundaryVertices.add(intern(rightBand.utVertices[id][0], rightBand.utVertices[id][1]));
  }

  const positions = new Float32Array(combinedUt.length * 3);
  for (let i = 0; i < combinedUt.length; i++) {
    const p = sampler.position(combinedUt[i][0], combinedUt[i][1]);
    positions[i * 3] = p[0];
    positions[i * 3 + 1] = p[1];
    positions[i * 3 + 2] = p[2];
  }

  return {
    mesh: { positions, indices: new Uint32Array(tris) },
    vertexUT: combinedUt.map((v) => [v[0], v[1]] as [number, number]),
    spineVertexIds,
    openBoundaryVertices,
  };
}
