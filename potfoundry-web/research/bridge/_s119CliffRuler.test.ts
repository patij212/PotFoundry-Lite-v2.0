// _s119CliffRuler.test.ts — TWO-SIDED VALIDATION OF THE S119 CLIFF-AWARE POSITION RULER.
//
// THE ONE-SIDED TRAP THIS TEST EXISTS TO AVOID. The headline claim of the cliff ruler is "a facet lying
// on the cliff face reads ~0 instead of ~jump/2". A ruler that returned 0 for EVERYTHING would pass that
// check perfectly and would silently certify every bad mesh in the campaign. So every probe below is
// asserted in BOTH directions: the on-curtain probes must read ~0, AND the off-surface probes must
// reproduce an independently written CLOSED FORM — not approximately, and not merely "non-zero".
//
// THE FIXTURE. rA(th,z) = R0 for th in [0,TH0), R0+JUMP for th in [TH0,2pi). Its solid is a two-radius
// cylinder with TWO cliffs: one at th=TH0 and one at the wrap th=0. Every piece of its lateral boundary
// has a closed-form point-distance (a cylinder patch and a flat radial rectangle are both separable in
// (theta, z)), so `exactDist` below is written from the geometry, independently of the module under test.
//
//   npx vitest run --config vitest.s119cliff.config.ts
import { describe, it, expect } from 'vitest';
import {
  scanSeams, SeamIndex, segDist, curtainDist, curtainWindow, newCurtainStat,
} from '../tools/s119CliffLib';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';

const TAU = 2 * Math.PI;
const R0 = 40;
const JUMP = 1.720469;      // the CelticTriquetra jump, so the fixture reproduces the real magnitude
const TH0 = 2.5;
const H = 120;
const RMAX = R0 + JUMP;

const canon = (t: number): number => { let x = t % TAU; if (x < 0) x += TAU; return x; };
const rAstep = (th: number, z: number): number => (canon(th) < TH0 ? R0 : R0 + JUMP);

// ── CLOSED FORM, written from the geometry and not from the module under test ────────────────────────
/** distance to the cylinder patch {r=R, th in [a,b], z in [0,H]} — separable in theta and z */
function cylPatchDist(x: number, y: number, z: number, R: number, a: number, b: number): number {
  const thP = canon(Math.atan2(y, x));
  // circular clamp of thP into [a,b]
  let thC: number;
  if (thP >= a && thP <= b) thC = thP;
  else {
    const dA = Math.min(Math.abs(thP - a), TAU - Math.abs(thP - a));
    const dB = Math.min(Math.abs(thP - b), TAU - Math.abs(thP - b));
    thC = dA <= dB ? a : b;
  }
  const zC = z < 0 ? 0 : z > H ? H : z;
  const dx = x - R * Math.cos(thC); const dy = y - R * Math.sin(thC); const dz = z - zC;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** distance to the flat radial rectangle {th=phi, rho in [rlo,rhi], z in [0,H]} */
function curtainRectDist(x: number, y: number, z: number, phi: number, rlo: number, rhi: number): number {
  const c = Math.cos(phi); const s = Math.sin(phi);
  const t = x * c + y * s;
  const tc = t < rlo ? rlo : t > rhi ? rhi : t;
  const zC = z < 0 ? 0 : z > H ? H : z;
  const dx = x - tc * c; const dy = y - tc * s; const dz = z - zC;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** GRAPH-ONLY reference: the two cylinder patches. This is what the campaign's ruler measures. */
const graphExact = (x: number, y: number, z: number): number => Math.min(
  cylPatchDist(x, y, z, R0, 0, TH0),
  cylPatchDist(x, y, z, R0 + JUMP, TH0, TAU),
);
/** CURTAIN-ONLY reference: the two cliff faces. */
const curtainExact = (x: number, y: number, z: number): number => Math.min(
  curtainRectDist(x, y, z, TH0, R0, R0 + JUMP),
  curtainRectDist(x, y, z, 0, R0, R0 + JUMP),
);
/** THE TRUE SOLID's lateral boundary distance. */
const exactDist = (x: number, y: number, z: number): number => Math.min(graphExact(x, y, z), curtainExact(x, y, z));

const P = (rho: number, th: number, z: number): [number, number, number] => [rho * Math.cos(th), rho * Math.sin(th), z];

// ── the ruler under test, assembled exactly as the tool assembles it ─────────────────────────────────
const SCAN = scanSeams(rAstep, {
  H, nZlev: 1200, nThScan: 4000, nThVal: 512, nZscan: 512, minJump: 0.02, rMax: RMAX,
});
const IDX = new SeamIndex(SCAN.samples, 0.5, RMAX, SCAN.spacingBound);
const COPT = { H, minJump: 0.02, margin: 4 * SCAN.spacingBound, refineK: 24, refineIters: 4 };
const dCurtain = (x: number, y: number, z: number, u: number): number => curtainDist(rAstep, IDX, x, y, z, u, COPT, newCurtainStat());

describe('S119 cliff ruler — the seam scanner', () => {
  it('finds BOTH cliffs of the fixture and no others, with the right one-sided limits', () => {
    expect(SCAN.samples.length).toBeGreaterThan(2000);
    const az = new Set<string>();
    for (const s of SCAN.samples) {
      az.add(canon(s.th).toFixed(3));
      expect(s.rLo).toBeCloseTo(R0, 9);
      expect(s.rHi).toBeCloseTo(R0 + JUMP, 9);
    }
    // canon(2pi) rounds to 6.283; canon of the located wrap seam may land at either end.
    const norm = [...az].map((v) => (Number(v) > 6.28 ? '0.000' : v)).sort();
    expect([...new Set(norm)]).toEqual(['0.000', '2.500']);
  });

  it('the family bound is a BOUND, not a statistic: no z-level is left without a sample', () => {
    // family A puts a sample on every z level x every seam => 1201 * 2
    expect(SCAN.nFamA).toBe(1201 * 2);
    // a seam at constant theta is crossed by NO theta-value column, so family B must be empty here
    expect(SCAN.nFamB).toBe(0);
  });
});

describe('S119 cliff ruler — ON the curtain it reads ~0 (side 1 of 2)', () => {
  it('probes exactly on the cliff face read ~0, while the GRAPH-ONLY ruler reads the S118 signature', () => {
    for (const frac of [0.5, 0.25, 0.1, 0.02]) {
      const rho = R0 + frac * JUMP;
      const [x, y, z] = P(rho, TH0, 60);
      const dG = graphExact(x, y, z);
      const dC = dCurtain(x, y, z, dG);
      // the pathology the ruler exists to correct, reproduced in closed form:
      expect(dG).toBeCloseTo(Math.min(frac, 1 - frac) * JUMP, 6);
      // and the correction:
      expect(dC).toBeLessThan(1e-9);
      expect(Math.min(dG, dC)).toBeLessThan(1e-9);
    }
  });

  it('a whole FACET lying on the curtain reads ~0 at every barycentric lattice point', () => {
    const tri = [P(R0 + 0.05, TH0, 55), P(R0 + JUMP - 0.05, TH0, 55), P(R0 + JUMP * 0.5, TH0, 58)];
    let worstCliff = 0; let worstGraph = 0;
    for (let i = 0; i <= 8; i += 1) {
      for (let j = 0; i + j <= 8; j += 1) {
        const w = [(8 - i - j) / 8, i / 8, j / 8];
        const x = w[0] * tri[0][0] + w[1] * tri[1][0] + w[2] * tri[2][0];
        const y = w[0] * tri[0][1] + w[1] * tri[1][1] + w[2] * tri[2][1];
        const z = w[0] * tri[0][2] + w[1] * tri[1][2] + w[2] * tri[2][2];
        const dG = graphExact(x, y, z);
        worstGraph = Math.max(worstGraph, dG);
        worstCliff = Math.max(worstCliff, Math.min(dG, dCurtain(x, y, z, dG)));
      }
    }
    expect(worstGraph).toBeGreaterThan(0.8);   // graph-only: ~jump/2, i.e. 86x over the 0.01 mm bar
    expect(worstCliff).toBeLessThan(1e-9);     // cliff-aware: on the surface
  });
});

describe('S119 cliff ruler — OFF the surface it reads the CLOSED FORM (side 2 of 2)', () => {
  it('does NOT return zero away from the boundary — a rejection of the degenerate ruler', () => {
    for (const [rho, th, z] of [[R0 + 3, 1.0, 40], [R0 - 2.5, 4.0, 70], [R0 + JUMP + 1.25, 5.0, 20]] as const) {
      const [x, y, zz] = P(rho, th, z);
      const dG = graphExact(x, y, zz);
      const d = Math.min(dG, dCurtain(x, y, zz, dG));
      expect(d).toBeCloseTo(exactDist(x, y, zz), 9);
      expect(d).toBeGreaterThan(1.0);
    }
  });

  it('reproduces the closed form on 4000 pseudo-random probes, including near-cliff ones', () => {
    let s = 12345;
    const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let worstAbs = 0; let worstRel = 0; let nNear = 0; let nZero = 0;
    for (let i = 0; i < 4000; i += 1) {
      // half the probes are deliberately parked in the cliff gap, where the graph ruler is worst
      const nearCliff = i % 2 === 0;
      const th = nearCliff ? TH0 + (rnd() - 0.5) * 0.02 : rnd() * TAU;
      const rho = nearCliff ? R0 + rnd() * JUMP : R0 - 2 + rnd() * (JUMP + 4);
      const z = 5 + rnd() * (H - 10);
      const [x, y, zz] = P(rho, th, z);
      const want = exactDist(x, y, zz);
      const dG = graphExact(x, y, zz);
      const got = Math.min(dG, dCurtain(x, y, zz, Math.max(dG, 1e-12)));
      const e = Math.abs(got - want);
      if (e > worstAbs) worstAbs = e;
      if (want > 1e-6 && e / want > worstRel) worstRel = e / want;
      if (want < 1e-6) nZero += 1;
      if (nearCliff) nNear += 1;
    }
    expect(nNear).toBe(2000);
    expect(nZero).toBeLessThan(2000);          // the probe battery is not degenerate
    expect(worstAbs).toBeLessThan(1e-7);       // mm
    expect(worstRel).toBeLessThan(1e-6);
  });

  it('a facet displaced a KNOWN distance off the curtain reads that distance, not zero', () => {
    const nx = -Math.sin(TH0); const ny = Math.cos(TH0);
    for (const d of [0.002, 0.01, 0.05, -0.01, -0.05]) {
      const rho = R0 + JUMP * 0.5;
      const [x0, y0, z0] = P(rho, TH0, 60);
      const x = x0 + d * nx; const y = y0 + d * ny; const z = z0;
      const dG = graphExact(x, y, z);
      const got = Math.min(dG, dCurtain(x, y, z, dG));
      expect(got).toBeCloseTo(Math.abs(d), 7);
      expect(dG).toBeGreaterThan(0.8);         // the graph ruler still reads ~jump/2 there
    }
  });
});

describe('S119 cliff ruler — the window tier alone, and the table tier alone', () => {
  it('curtainWindow finds the cliff when it is within W and reports Infinity when it is not', () => {
    const rho = R0 + JUMP * 0.5;
    const [x, y, z] = P(rho, TH0 + 0.01, 60);   // ~0.417 mm off the curtain
    const off = 0.01 * rho;
    const inW = curtainWindow(rAstep, x, y, z, off * 2, 0.02, H, 24);
    expect(inW.found).toBeGreaterThan(0);
    expect(inW.d).toBeCloseTo(off, 3);
    const outW = curtainWindow(rAstep, x, y, z, off * 0.5, 0.02, H, 24);
    expect(outW.d).toBe(Infinity);
  });

  it('the table alone is a valid UPPER bound everywhere it answers', () => {
    let s = 999;
    const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    let checked = 0;
    for (let i = 0; i < 3000; i += 1) {
      const th = TH0 + (rnd() - 0.5) * 0.05;
      const rho = R0 + rnd() * JUMP;
      const z = 5 + rnd() * (H - 10);
      const [x, y, zz] = P(rho, th, z);
      const tbl = IDX.nearest(x, y, zz, 10);
      if (!Number.isFinite(tbl)) continue;
      checked += 1;
      expect(tbl).toBeGreaterThanOrEqual(curtainExact(x, y, zz) - 1e-12);
    }
    expect(checked).toBeGreaterThan(2500);
  });
});

describe('S119 cliff ruler — the GRAPH tier is the SAME instrument the campaign already uses', () => {
  it('buildRadialSurfaceProjector reproduces the closed-form graph distance off the seams', () => {
    const proj = buildRadialSurfaceProjector(rAstep, { H, nTheta: 3072, nZ: 512, seedTopK: 6 });
    let worst = 0;
    for (let i = 0; i < 400; i += 1) {
      const th = 0.05 + (i / 400) * (TH0 - 0.1);   // strictly inside the R0 sheet
      const rho = R0 + 0.3 * Math.sin(i);
      const z = 10 + (i / 400) * 100;
      const [x, y, zz] = P(rho, th, z);
      worst = Math.max(worst, Math.abs(proj.project(x, y, zz).dist - graphExact(x, y, zz)));
    }
    expect(worst).toBeLessThan(1e-6);
  });
});
