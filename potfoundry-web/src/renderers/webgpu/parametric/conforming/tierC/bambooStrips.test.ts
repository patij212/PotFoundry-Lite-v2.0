// bambooStrips.test.ts — BAMBOO-SEGMENTS ring-strip productionization (E-2026-07-22-BAMBOO-SCHED), the first
// LAYERED-class production closure. Mirrors dsRingStrips.test.ts: this pins the MECHANISM invariants that make the
// fidelity result trustworthy — the interior segment-boundary tread pairs, the sag-law body, watertight BY
// CONSTRUCTION, and flag-gated default-OFF (byte-identical). NO fidelity claim here (that is the research probe
// research/bridge/_bambooScheduleClose.test.ts against the honest whole-mesh ruler + the judge).
//
// Bamboo (post rim-floor() fix) is a smooth body (Gaussian node bulges + taper + striations) with a genuine C0
// asymVar STEP at each INTERIOR segment boundary t=k/nodeCount (k=1..nodeCount-1) when bsAsymmetry≠0 — the judge's
// "radial curtains". The ring-strip schedule brackets each with a double-valued tread pair (never chords it) and the
// rim (t=1) is now smooth (no bracket needed). Uses the REAL analytic Bamboo surface (a src primitive) — no synthetic.

import { describe, it, expect } from 'vitest';
import {
  buildBambooTSchedule,
  buildBambooRingStripWallGeometric,
} from './dsRingStrips';
import { buildBambooDispatchWall, isBambooStyle, BAMBOO_STYLES } from './index';
import { isBambooEnabled } from './regionLayerFlag';
import { buildAnalyticRadiusFn } from '../../../../../geometry/analyticRadius';
import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const H = DIMS.H;
const NODE = 5; // registry-default bsNodeCount.
const rA: AnalyticRadiusFn = buildAnalyticRadiusFn('BambooSegments', {}, DIMS);

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

describe('BAMBOO-SCHED buildBambooTSchedule — structured emitter invariants', () => {
  it('brackets every interior segment boundary (tread PAIR straddles t=k/nodeCount; no row AT the C0 jump)', () => {
    const treadHalfMm = 0.002;
    const tRows = buildBambooTSchedule(H, rA, { treadHalfMm, nodeCount: NODE });
    expect(tRows[0]).toBe(0);
    expect(tRows[tRows.length - 1]).toBe(1);
    for (let i = 1; i < tRows.length; i++) expect(tRows[i]).toBeGreaterThan(tRows[i - 1]);
    const dtHalf = treadHalfMm / H;
    for (let k = 1; k < NODE; k++) {
      const tk = k / NODE;
      // no row exactly at the jump
      expect(tRows.some((t) => Math.abs(t - tk) < dtHalf * 0.5)).toBe(false);
      // a row just below (r-) and just above (r+) — the double-tread pair
      expect(tRows.some((t) => t < tk && tk - t <= dtHalf * 1.01)).toBe(true);
      expect(tRows.some((t) => t > tk && t - tk <= dtHalf * 1.01)).toBe(true);
    }
  });

  it('does NOT bracket the rim: t=1 is a single smooth row (no tread pair) after the rim-floor() fix', () => {
    const treadHalfMm = 0.002;
    const dtHalf = treadHalfMm / H;
    const tRows = buildBambooTSchedule(H, rA, { treadHalfMm, nodeCount: NODE });
    // no row sits in (1-2·dtHalf, 1) forming a rim bracket — the last real segment extends smoothly to t=1.
    const near = tRows.filter((t) => t > 1 - 2 * dtHalf && t < 1);
    expect(near.length).toBe(0);
  });

  it('the interior tread pair lifts to DISTINCT one-sided radii (the asymVar C0 step captured as a near-vertical strip)', () => {
    const dtHalf = 0.002 / H;
    let stepsSeen = 0;
    for (let k = 1; k < NODE; k++) {
      const tk = k / NODE;
      const rMinus = rA(0.13 * TAU, (tk - dtHalf) * H); // segment k-1
      const rPlus = rA(0.13 * TAU, (tk + dtHalf) * H); // segment k (asymVar flipped)
      if (Math.abs(rPlus - rMinus) > 0.1) stepsSeen++;
    }
    // default bsAsymmetry=0.1 ⇒ each interior boundary is a genuine radial step at this θ.
    expect(stepsSeen).toBeGreaterThan(0);
  });

  it('sag-law body responds to the tolerance: a tighter sagTol places more rows', () => {
    const coarse = buildBambooTSchedule(H, rA, { sagTolMm: 0.02, nodeCount: NODE }).length;
    const fine = buildBambooTSchedule(H, rA, { sagTolMm: 0.002, nodeCount: NODE }).length;
    expect(fine).toBeGreaterThan(coarse);
  });

  it('bounds EVERY body interval chord to tol at the DEFAULT sag (verify-and-bisect, no nodal stride-over) — E-2026-07-23-SAGLAW-MAXBOUND', () => {
    // REGRESSION GUARD. The old walk read r''(z) nodally at the current row then stepped Δt=sqrt(8·tol/|r''|), STRIDING
    // OVER the Gaussian node-bulge peak between rows: MAX busted ~32× at the export default (worst body chord 1.61mm at
    // tol=0.05) while p99 stayed ~0.002mm — so a p99-scoped gate passed a mesh with 0.7mm cliffs. Verify-and-bisect
    // shrinks each step until the TRUE chord honors tol, bounding MAX. This assertion FAILS on the old code, passes now.
    const tol = 0.05; // 'high' profile epsPosMm — the sagTolMm=qMaxSag the emitter receives on a default export.
    const rows = buildBambooTSchedule(H, rA, { sagTolMm: tol, nodeCount: NODE });
    const rProfile = (z: number): number => rA(0, Math.max(0, Math.min(H, z)));
    const chordSag = (tA: number, tB: number): number => {
      const zA = tA * H, zB = tB * H, rAe = rProfile(zA), rBe = rProfile(zB);
      let worst = 0;
      for (let i = 1; i < 100; i++) {
        const f = i / 100;
        worst = Math.max(worst, Math.abs(rProfile(zA + (zB - zA) * f) - (rAe + (rBe - rAe) * f)));
      }
      return worst;
    };
    const crossesStep = (a: number, b: number): boolean => {
      for (let k = 1; k < NODE; k++) { const e = k / NODE; if (a < e - 1e-6 && b > e + 1e-6) return true; }
      return false;
    };
    let worst = 0;
    for (let i = 0; i + 1 < rows.length; i++) {
      if (crossesStep(rows[i], rows[i + 1])) continue; // the tread-pair C0 riser — bracketed by construction, not chorded
      worst = Math.max(worst, chordSag(rows[i], rows[i + 1]));
    }
    expect(worst).toBeLessThanOrEqual(tol);
  });
});

describe('BAMBOO-SCHED buildBambooRingStripWallGeometric — watertight by construction', () => {
  it('emitted wall is watertight (0 non-manifold edges; boundary only on the two t-rims) + vertices on-surface', () => {
    const nU = 64;
    const wall = buildBambooRingStripWallGeometric(rA, H, nU, { nodeCount: NODE, flankRows: 0 });
    const rows = wall.tRows.length;
    expect(wall.vertices.length / 3).toBe(nU * rows);
    expect(wall.indices.length / 3).toBe((rows - 1) * nU * 2);
    const census = manifoldCensus(wall.indices);
    expect(census.nonManifold).toBe(0);
    expect(census.boundary).toBe(2 * nU); // u-seam welded by index ⇒ only the two rims open
    // every emitted vertex sits EXACTLY on rA(θ,z) (the single-valued lift reproduces the xyz).
    let maxDelta = 0;
    for (let i = 0; i < wall.ut.length / 2; i++) {
      const u = wall.ut[2 * i], t = wall.ut[2 * i + 1];
      const th = TAU * u, z = t * H, r = rA(th, z);
      maxDelta = Math.max(
        maxDelta,
        Math.abs(r * Math.cos(th) - wall.vertices[3 * i]),
        Math.abs(r * Math.sin(th) - wall.vertices[3 * i + 1]),
        Math.abs(z - wall.vertices[3 * i + 2]),
      );
    }
    expect(maxDelta).toBeLessThan(1e-4);
  });
});

describe('BAMBOO-SCHED dispatch — default OFF, byte-identical', () => {
  type G = { __pfBamboo?: boolean };

  it('BambooSegments is the sole member of the dispatch allow-list', () => {
    expect(isBambooStyle('BambooSegments')).toBe(true);
    expect(isBambooStyle('DragonScales')).toBe(false);
    expect(isBambooStyle(undefined)).toBe(false);
    expect(BAMBOO_STYLES.has('BambooSegments')).toBe(true);
  });

  it('isBambooEnabled defaults to false and is true only when explicitly set', () => {
    const g = globalThis as unknown as G;
    const prior = g.__pfBamboo;
    delete g.__pfBamboo;
    try {
      expect(isBambooEnabled()).toBe(false);
      g.__pfBamboo = false;
      expect(isBambooEnabled()).toBe(false);
      g.__pfBamboo = true;
      expect(isBambooEnabled()).toBe(true);
    } finally {
      g.__pfBamboo = prior;
    }
  });

  it('buildBambooDispatchWall is inert (undefined) when the flag is off, a watertight wall when on', () => {
    const g = globalThis as unknown as G;
    const prior = g.__pfBamboo;
    const params = { analyticRA: rA, H, tolMm: 0.004, nodeCount: NODE, ringStripNU: 64 };
    try {
      delete g.__pfBamboo;
      expect(buildBambooDispatchWall(params, 'BambooSegments')).toBeUndefined(); // flag off ⇒ byte-identical fall-through
      g.__pfBamboo = true;
      expect(buildBambooDispatchWall(params, 'DragonScales')).toBeUndefined(); // non-Bamboo style ⇒ inert
      const out = buildBambooDispatchWall(params, 'BambooSegments');
      expect(out).toBeDefined();
      if (out) {
        expect(manifoldCensus(out.indices).nonManifold).toBe(0);
        for (let i = 0; i < out.gridVertexCount; i++) expect(out.vertices[3 * i + 2]).toBe(0);
      }
    } finally {
      g.__pfBamboo = prior;
    }
  });
});
