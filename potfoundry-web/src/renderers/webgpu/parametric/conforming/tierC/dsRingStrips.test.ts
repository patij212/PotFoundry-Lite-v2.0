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
  buildDsConeFanTSchedule,
  buildDsConeFanWall,
  buildDsConeFanWallGeometric,
} from './dsRingStrips';
import { isDsRingStripsEnabled, isDsConeFanEnabled, isRegionLayerEnabled } from './regionLayerFlag';
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

describe('DS-CONEFAN-PROD coneFan — structured tip-fan invariants', () => {
  const SCALES_PER_ROW = DEFAULT_DS_LATTICE.scalesPerRow; // 16
  // scale-tip (u,t) apexes: even rows u=(m+0.5)/16, odd rows u=m/16, at t=(k+0.5)/8.
  function tipUts(): Array<{ u: number; t: number }> {
    const tips: Array<{ u: number; t: number }> = [];
    for (let k = 0; k < SCALE_ROWS; k++) { const t = (k + 0.5) / SCALE_ROWS; for (let m = 0; m < SCALES_PER_ROW; m++) { let u = (k % 2 === 0 ? m + 0.5 : m) / SCALES_PER_ROW; u -= Math.floor(u); tips.push({ u, t }); } }
    return tips;
  }

  it('crest-anchored schedule places a row EXACTLY on every scale-center crest t=(k+0.5)/8', () => {
    const tRows = buildDsConeFanTSchedule(H, { bodyStepMm: 2, crestLadderRows: 3 });
    expect(tRows[0]).toBe(0);
    expect(tRows[tRows.length - 1]).toBe(1);
    for (let i = 1; i < tRows.length; i++) expect(tRows[i]).toBeGreaterThan(tRows[i - 1]);
    for (let k = 0; k < SCALE_ROWS; k++) {
      const tc = (k + 0.5) / SCALE_ROWS;
      expect(tRows.some((t) => Math.abs(t - tc) < 1e-12)).toBe(true);
    }
  });

  it('cone-fan wall is watertight BY CONSTRUCTION (0 non-manifold edges; boundary only on the two t-rims)', () => {
    const nU = 64; // = 2*2*scalesPerRow ⇒ every apex u lands on a column
    const wall = buildDsConeFanWall(syntheticDsRA, H, nU, buildDsConeFanTSchedule(H, { bodyStepMm: 2, crestLadderRows: 3 }), { patchP: 1 });
    expect(wall.apexCount).toBeGreaterThan(0);
    const census = manifoldCensus(wall.indices);
    expect(census.nonManifold).toBe(0);
    // the fan is INTERIOR (welds to the grid) ⇒ the only open boundary is still the two rims (nU edges each).
    expect(census.boundary).toBe(2 * nU);
    expect(wall.bottomRing.length).toBe(nU);
    expect(wall.topRing.length).toBe(nU);
    expect(wall.fanTriangles).toBeGreaterThan(0);
  });

  it('every cone-fan triangle is positively oriented (CCW) in (u,t) — correct BY CONSTRUCTION, not repaired downstream', () => {
    // The assembly's orientOutward pass re-derives a consistent outward winding from geometry, so a mesh that is
    // internally winding-INconsistent still exports correctly — but only AFTER repair. This pins the stronger property
    // the cert-clean partition needs and the production mesh should have anyway: every emitted triangle already winds
    // CCW in (u,t) (= outward normal on this increasing-u/increasing-t cylinder). Grid quads are CCW by construction;
    // this catches the per-apex fan, whose ring-band triangles wound CW (latent, masked by orientOutward).
    const nU = 64;
    const wall = buildDsConeFanWall(syntheticDsRA, H, nU, buildDsConeFanTSchedule(H, { bodyStepMm: 2, crestLadderRows: 3 }), { patchP: 1 });
    const gridVertexCount = wall.tRows.length * wall.nU; // grid vertices are emitted first, then the fan spokes.
    // Signed (u,t) area, unwrapping u relative to the first vertex so the periodic seam never fakes the sign.
    const signedArea2 = (a: number, b: number, c: number): number => {
      const ua = wall.ut[2 * a], ta = wall.ut[2 * a + 1];
      let ub = wall.ut[2 * b]; const tb = wall.ut[2 * b + 1];
      let uc = wall.ut[2 * c]; const tc = wall.ut[2 * c + 1];
      if (ub - ua > 0.5) ub -= 1; else if (ua - ub > 0.5) ub += 1;
      if (uc - ua > 0.5) uc -= 1; else if (ua - uc > 0.5) uc += 1;
      return (ub - ua) * (tc - ta) - (uc - ua) * (tb - ta);
    };
    const nF = wall.indices.length / 3;
    let gridCW = 0, fanCW = 0, fanCount = 0;
    for (let f = 0; f < nF; f++) {
      const a = wall.indices[3 * f], b = wall.indices[3 * f + 1], c = wall.indices[3 * f + 2];
      const isFan = a >= gridVertexCount || b >= gridVertexCount || c >= gridVertexCount;
      const area2 = signedArea2(a, b, c);
      if (isFan) { fanCount++; if (area2 <= 0) fanCW++; }
      else if (area2 <= 0) gridCW++;
    }
    expect(fanCount).toBeGreaterThan(0);
    expect(gridCW).toBe(0); // reference: the structured grid quads are already CCW
    expect(fanCW).toBe(0); // the per-apex fan must be CCW by construction too
  });

  it('each non-skipped fan APEX is a grid vertex EXACTLY on the analytic scale tip (u,t) and its lift', () => {
    const nU = 64;
    const wall = buildDsConeFanWall(syntheticDsRA, H, nU, buildDsConeFanTSchedule(H, { bodyStepMm: 2, crestLadderRows: 3 }), { patchP: 1 });
    let matched = 0;
    for (const tip of tipUts()) {
      // a vertex at exactly (tip.u, tip.t)?
      for (let v = 0; v < wall.ut.length / 2; v++) {
        if (Math.abs(wall.ut[2 * v] - tip.u) < 1e-9 && Math.abs(wall.ut[2 * v + 1] - tip.t) < 1e-9) {
          const th = TAU * tip.u, z = tip.t * H, r = syntheticDsRA(th, z);
          expect(Math.abs(wall.vertices[3 * v] - r * Math.cos(th))).toBeLessThan(1e-3);
          expect(Math.abs(wall.vertices[3 * v + 1] - r * Math.sin(th))).toBeLessThan(1e-3);
          expect(Math.abs(wall.vertices[3 * v + 2] - z)).toBeLessThan(1e-3);
          matched++;
          break;
        }
      }
    }
    // every apex u lands on a column at nU=64 ⇒ all interior (non-rim-skipped) tips are matched.
    expect(matched).toBe(wall.apexCount);
  });

  it('fan rings are geometric-graded (fractions strictly increasing) and welded (geometric convenience matches explicit)', () => {
    const frac = [0.05, 0.12, 0.25, 0.45, 0.7];
    for (let i = 1; i < frac.length; i++) expect(frac[i]).toBeGreaterThan(frac[i - 1]);
    const nU = 64;
    const opts = { patchP: 1, fanFrac: frac, bodyStepMm: 2, crestLadderRows: 3 };
    const a = buildDsConeFanWallGeometric(syntheticDsRA, H, nU, opts);
    const b = buildDsConeFanWall(syntheticDsRA, H, nU, buildDsConeFanTSchedule(H, opts), opts);
    expect(a.indices.length).toBe(b.indices.length);
    expect(a.vertices.length).toBe(b.vertices.length);
    expect(a.apexCount).toBe(b.apexCount);
    // more fan rings ⇒ more fan triangles per apex (graded resolution is real).
    const coarse = buildDsConeFanWall(syntheticDsRA, H, nU, buildDsConeFanTSchedule(H, { bodyStepMm: 2, crestLadderRows: 3 }), { patchP: 1, fanFrac: [0.3, 0.7] });
    expect(a.fanTriangles).toBeGreaterThan(coarse.fanTriangles);
  });

  it('cone-fan wall packs into a watertight ConformingOuterWallResult (u,t,0)', () => {
    const nU = 64;
    const wall = buildDsConeFanWall(syntheticDsRA, H, nU, buildDsConeFanTSchedule(H, { bodyStepMm: 2, crestLadderRows: 3 }), { patchP: 1 });
    const res = dsRingStripWallToOuterWall(wall);
    expect(res.gridVertexCount).toBe(wall.vertices.length / 3);
    expect(manifoldCensus(res.indices).nonManifold).toBe(0);
    for (let i = 0; i < res.gridVertexCount; i++) expect(res.vertices[3 * i + 2]).toBe(0);
  });

  it('cone-fan DEFAULTS are the E-DS-SLIVER sliver-Pareto schedule (no crest ladder, steeper flank, finer body)', () => {
    // Measurement-driven defaults (research/bridge/_dsSliver.test.ts sweep @ nU4096, real DS radius): body 0.10 +
    // crestLadderRows 0 + flankGrade 2.5 took the production cone-fan from 14.3% to 3.3% <20° while IMPROVING fidelity
    // (fwd 0.0072→0.005, rev 0.0024→0.0028, watertight, both ≤0.01). This guards the DEFAULTS against accidental
    // revert; the sliver/fidelity OUTCOME is the research probe's verdict (it needs nU4096 + the real radius).
    const def = buildDsConeFanTSchedule(H).length;
    // crest ladder is OFF by default — adding it back inserts fine rows around every crest.
    expect(buildDsConeFanTSchedule(H, { crestLadderRows: 7 }).length).toBeGreaterThan(def);
    // flank grade is the steeper 2.5 by default — the shallower pre-DS-SLIVER 1.5 packs more fine near-tread rows.
    expect(buildDsConeFanTSchedule(H, { flankGrade: 1.5 }).length).toBeGreaterThan(def);
    // body step is the finer 0.10 by default — the old 0.12 is coarser ⇒ fewer body rows.
    expect(buildDsConeFanTSchedule(H, { bodyStepMm: 0.12 }).length).toBeLessThan(def);
  });
});

describe('CONVERGE-A flag gating — default OFF, byte-identical', () => {
  type G = { __pfDsRingStrips?: boolean; __pfDsConeFan?: boolean; __pfRegionLayer?: boolean };

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

  it('isDsConeFanEnabled defaults to false and is true only when explicitly set (default byte-identical gate)', () => {
    const g = globalThis as unknown as G;
    const prior = g.__pfDsConeFan;
    delete g.__pfDsConeFan;
    try {
      expect(isDsConeFanEnabled()).toBe(false);
      g.__pfDsConeFan = false;
      expect(isDsConeFanEnabled()).toBe(false);
      g.__pfDsConeFan = true;
      expect(isDsConeFanEnabled()).toBe(true);
    } finally {
      g.__pfDsConeFan = prior;
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
