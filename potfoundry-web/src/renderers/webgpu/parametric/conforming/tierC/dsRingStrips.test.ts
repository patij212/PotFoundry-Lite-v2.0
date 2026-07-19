// dsRingStrips.test.ts — CONVERGE-A C1 lock: the structured ring-strip emitter is watertight BY CONSTRUCTION,
// brackets every C0 ring, and is flag-gated default-OFF (byte-identical). No fidelity claim here (that is the
// research probe research/bridge/_dsRingStrips.test.ts against the certified V11g ruler) — this pins the mechanism
// invariants that make the fidelity result trustworthy: guaranteed connectivity + the double-valued tread pair.

import { describe, it, expect } from 'vitest';
import {
  buildDsRingTSchedule,
  buildDsRingStripWall,
  buildDsRingStripWallGeometric,
  dsRingStripWallToOuterWall,
} from './dsRingStrips';
import { isDsRingStripsEnabled, isRegionLayerEnabled } from './regionLayerFlag';
import { buildRegionOuterWall } from './index';
import { DEFAULT_DS_LATTICE } from './dsFeatureEdges';

const TAU = 2 * Math.PI;
const H = 120;
const SCALE_ROWS = DEFAULT_DS_LATTICE.scaleRows; // 8 => interior rings at k/8, k=1..7

/**
 * Synthetic DragonScales-like radius with a genuine C0 JUMP at every interior ring t=k/scaleRows: a scale ripple
 * whose stagger phase FLIPS by half a period on odd rows (exactly the rOuterDragonScales row-parity mechanism), so
 * r(theta,z) is discontinuous across each k/8. Lets this src unit test exercise the double-tread bracketing without
 * importing the research DS radius fn.
 */
function syntheticDsRA(theta: number, z: number): number {
  const t = z / H;
  const rowPhase = t * SCALE_ROWS;
  const row = Math.floor(Math.min(rowPhase, SCALE_ROWS - 1e-9));
  const stagger = row % 2 === 1 ? Math.PI / DEFAULT_DS_LATTICE.scalesPerRow : 0;
  return 45 + 2.5 * Math.sin(DEFAULT_DS_LATTICE.scalesPerRow * theta + stagger * DEFAULT_DS_LATTICE.scalesPerRow);
}

/** Edge-multiplicity census by INDEX (shared-vertex weld): non-manifold (>2) + boundary (==1) counts. */
function manifoldCensus(indices: Uint32Array): { nonManifold: number; boundary: number } {
  const count = new Map<string, number>();
  const key = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let f = 0; f < indices.length; f += 3) {
    const a = indices[f], b = indices[f + 1], c = indices[f + 2];
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const k = key(p, q);
      count.set(k, (count.get(k) ?? 0) + 1);
    }
  }
  let nonManifold = 0, boundary = 0;
  for (const m of count.values()) {
    if (m > 2) nonManifold++;
    else if (m === 1) boundary++;
  }
  return { nonManifold, boundary };
}

describe('CONVERGE-A dsRingStrips — structured emitter invariants', () => {
  it('t-schedule brackets every interior ring (no row AT the C0 jump; a tread PAIR straddles it)', () => {
    const treadHalfMm = 0.005;
    const tRows = buildDsRingTSchedule(H, { treadHalfMm });
    expect(tRows[0]).toBe(0);
    expect(tRows[tRows.length - 1]).toBe(1);
    // strictly increasing
    for (let i = 1; i < tRows.length; i++) expect(tRows[i]).toBeGreaterThan(tRows[i - 1]);
    const dtHalf = treadHalfMm / H;
    for (let k = 1; k < SCALE_ROWS; k++) {
      const tk = k / SCALE_ROWS;
      // no row exactly at the jump
      expect(tRows.some((t) => Math.abs(t - tk) < dtHalf * 0.5)).toBe(false);
      // a row just below (r-) and just above (r+) — the double-tread pair
      expect(tRows.some((t) => t < tk && tk - t <= dtHalf * 1.01)).toBe(true);
      expect(tRows.some((t) => t > tk && t - tk <= dtHalf * 1.01)).toBe(true);
    }
  });

  it('the double-tread pair lifts to DISTINCT one-sided radii (the C0 step captured as a near-vertical strip)', () => {
    const treadHalfMm = 0.005;
    const dtHalf = treadHalfMm / H;
    for (let k = 1; k < SCALE_ROWS; k++) {
      const tk = k / SCALE_ROWS;
      const rMinus = syntheticDsRA(0.13 * TAU, (tk - dtHalf) * H); // just below => row k-1
      const rPlus = syntheticDsRA(0.13 * TAU, (tk + dtHalf) * H); // just above => row k (stagger flipped)
      expect(Math.abs(rPlus - rMinus)).toBeGreaterThan(0.1); // a genuine radial step, not a smooth slope
    }
  });

  it('emitted wall is watertight BY CONSTRUCTION: 0 non-manifold edges, boundary only on the two t-rims', () => {
    const nU = 64;
    const wall = buildDsRingStripWall(syntheticDsRA, H, nU, buildDsRingTSchedule(H));
    const rows = wall.tRows.length;
    // structural counts
    expect(wall.vertices.length / 3).toBe(nU * rows);
    expect(wall.indices.length / 3).toBe((rows - 1) * nU * 2);
    const census = manifoldCensus(wall.indices);
    expect(census.nonManifold).toBe(0);
    // exactly the two rims are open (u-seam welded by index => NO seam boundary): nU edges per rim.
    expect(census.boundary).toBe(2 * nU);
    expect(wall.bottomRing.length).toBe(nU);
    expect(wall.topRing.length).toBe(nU);
  });

  it('single-valued (u,t) lift reproduces the emitted xyz exactly (no vertex at a discontinuity)', () => {
    const nU = 48;
    const wall = buildDsRingStripWallGeometric(syntheticDsRA, H, nU);
    let maxDelta = 0;
    for (let i = 0; i < wall.ut.length / 2; i++) {
      const u = wall.ut[2 * i], t = wall.ut[2 * i + 1];
      const th = TAU * u, z = t * H, r = syntheticDsRA(th, z);
      maxDelta = Math.max(
        maxDelta,
        Math.abs(r * Math.cos(th) - wall.vertices[3 * i]),
        Math.abs(r * Math.sin(th) - wall.vertices[3 * i + 1]),
        Math.abs(z - wall.vertices[3 * i + 2]),
      );
    }
    expect(maxDelta).toBeLessThan(1e-4);
  });

  it('ConformingOuterWallResult packing is watertight + stores (u,t,0) with seam-span flags', () => {
    const nU = 32;
    const wall = buildDsRingStripWall(syntheticDsRA, H, nU, buildDsRingTSchedule(H, { flankRows: 4, bodyStepMm: 4 }));
    const res = dsRingStripWallToOuterWall(wall);
    expect(res.gridVertexCount).toBe(wall.vertices.length / 3);
    // packing preserves connectivity => same manifold census
    const census = manifoldCensus(res.indices);
    expect(census.nonManifold).toBe(0);
    expect(census.boundary).toBe(2 * nU);
    // vertices stored as (u,t,0)
    for (let i = 0; i < res.gridVertexCount; i++) expect(res.vertices[3 * i + 2]).toBe(0);
    // seam-adjacent triangles (wrap column nU-1 -> 0) are flagged
    expect(res.seamTriangles.some((f) => f === 1)).toBe(true);
  });
});

describe('CONVERGE-A flag gating — default OFF, byte-identical', () => {
  type G = { __pfDsRingStrips?: boolean; __pfRegionLayer?: boolean };

  it('isDsRingStripsEnabled defaults to false and is true only when explicitly set', () => {
    const g = globalThis as unknown as G;
    const prior = g.__pfDsRingStrips;
    delete g.__pfDsRingStrips;
    try {
      expect(isDsRingStripsEnabled()).toBe(false);
      g.__pfDsRingStrips = false;
      expect(isDsRingStripsEnabled()).toBe(false);
      g.__pfDsRingStrips = true;
      expect(isDsRingStripsEnabled()).toBe(true);
    } finally {
      g.__pfDsRingStrips = prior;
    }
  });

  it('buildRegionOuterWall stays undefined when the region layer is off, regardless of the strips flag', () => {
    const g = globalThis as unknown as G;
    const priorR = g.__pfRegionLayer, priorS = g.__pfDsRingStrips;
    delete g.__pfRegionLayer;
    g.__pfDsRingStrips = true; // strips flag on but region layer off => still inert
    try {
      expect(isRegionLayerEnabled()).toBe(false);
      const out = buildRegionOuterWall(
        { analyticRA: syntheticDsRA, H, nRing: 64, tolMm: 0.01, hMin: 0.02, hMax: 8 },
        'DragonScales',
      );
      expect(out).toBeUndefined();
    } finally {
      g.__pfRegionLayer = priorR;
      g.__pfDsRingStrips = priorS;
    }
  });
});
