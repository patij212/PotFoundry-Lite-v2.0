/**
 * crestLateralDeviation.test.ts — TDD guards for the STAGE 2a faithful crest
 * lateral-deviation instrument (`crestLateralDeviation` + ridge builders in
 * src/fidelity/crestLateralDeviation.ts).
 *
 * The user's quantity: serration amplitude in MILLIMETERS versus the ANALYTIC
 * ridge, density-independent by construction. The existing crest metric
 * (crestBandTriangleQuality) measures triangle SHAPE, not geometric truth —
 * this instrument slices the outer-wall mesh by z-planes, finds the mesh crest
 * apex near the analytic ridge locus θ_true(z), and reports the LATERAL
 * deviation d = r·wrapPi(θ_mesh − θ_true)/√(1+(r·dθ_true/dz)²) per crest as
 * MAX and RMS amplitude (absolute mm, worst-case — no percent anywhere).
 *
 * The slicer is validated against synthetic meshes with KNOWN deviation BEFORE
 * anything uses it (blueprint faithfulMetricSpec item 2); u-seam wrap and
 * crest-birth chaining are explicit cases. The TRUE-ridge builders are pinned
 * by (6) the SuperformulaBlossom closed form vs a brute-force argmax of the
 * production f64 `sfRf` mirror, and (7) the generic bisection+continuation
 * path on an analytic test field, including a fold-point (ridge-birth)
 * endpoint solve g=0 ∧ ∂g/∂u=0.
 */
import { describe, it, expect } from 'vitest';
import {
  crestLateralDeviation,
  ridgeFromParamBranches,
  sfClosedFormCrestLoci,
  sfClosedFormParamRidge,
  solveParamRidgeByBisection,
  type RidgeBranch,
  type TrueRidge,
} from './crestLateralDeviation';
import type { PositionSampler } from './metrics';
import { sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';

const TAU = 2 * Math.PI;

// ── Synthetic mesh builders ──────────────────────────────────────────────────

interface ColumnOverride {
  /** Column index whose vertices are overridden. */
  col: number;
  /** Radius (mm) of the overridden column (crest > R0, valley < R0). */
  r: number;
  /** Lateral angular displacement (rad) of the column as a function of z. */
  dTheta?: (z: number) => number;
}

/**
 * Periodic cylinder wall mesh (nU columns × nT rows, R0, height H) with
 * optional per-column radius/θ overrides — a crest is a column pushed out,
 * a valley a column pulled in, each optionally displaced laterally by a KNOWN
 * function of z. Vertices land exactly where the overrides say, so the mesh
 * crest apex position is known by construction.
 */
function ridgeCylinderMesh(
  R0: number,
  H: number,
  nU: number,
  nT: number,
  overrides: ColumnOverride[] = [],
): { vertices: number[]; indices: number[] } {
  const byCol = new Map<number, ColumnOverride>();
  for (const o of overrides) byCol.set(o.col, o);
  const verts: number[] = [];
  for (let j = 0; j < nT; j++) {
    const z = (j / (nT - 1)) * H;
    for (let i = 0; i < nU; i++) {
      const o = byCol.get(i);
      const r = o ? o.r : R0;
      const theta = (TAU * i) / nU + (o?.dTheta ? o.dTheta(z) : 0);
      verts.push(r * Math.cos(theta), r * Math.sin(theta), z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nT - 1; j++) {
    for (let i = 0; i < nU; i++) {
      const i1 = (i + 1) % nU;
      const a = j * nU + i;
      const b = j * nU + i1;
      const c = (j + 1) * nU + i;
      const d = (j + 1) * nU + i1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return { vertices: verts, indices: idx };
}

/** Append a partial-height ridge ribbon (3-column strip) at angle `theta`. */
function appendRidgeRibbon(
  verts: number[],
  idx: number[],
  opts: {
    theta: number;
    rBase: number;
    rPeak: number;
    halfWidthRad: number;
    z0: number;
    z1: number;
    rows: number;
    dTheta?: (z: number) => number;
  },
): void {
  const base = verts.length / 3;
  for (let j = 0; j < opts.rows; j++) {
    const z = opts.z0 + ((opts.z1 - opts.z0) * j) / (opts.rows - 1);
    const dt = opts.dTheta ? opts.dTheta(z) : 0;
    const cols: Array<[number, number]> = [
      [opts.theta - opts.halfWidthRad, opts.rBase],
      [opts.theta + dt, opts.rPeak],
      [opts.theta + opts.halfWidthRad, opts.rBase],
    ];
    for (const [th, r] of cols) verts.push(r * Math.cos(th), r * Math.sin(th), z);
  }
  for (let j = 0; j < opts.rows - 1; j++) {
    for (let i = 0; i < 2; i++) {
      const a = base + j * 3 + i;
      const b = base + j * 3 + i + 1;
      const c = base + (j + 1) * 3 + i;
      const d = base + (j + 1) * 3 + i + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
}

function toMesh(m: { vertices: number[]; indices: number[] }): {
  vertices: Float32Array;
  indices: Uint32Array;
} {
  return { vertices: new Float32Array(m.vertices), indices: new Uint32Array(m.indices) };
}

/** Hand-built straight ridge branch (θ constant over [z0,z1]). */
function straightBranch(
  kind: 'crest' | 'valley',
  theta: number,
  z0: number,
  z1: number,
  windowRad: number,
  label?: string,
): RidgeBranch {
  return {
    kind,
    label,
    points: [
      { zMm: z0, thetaRad: theta, windowRad },
      { zMm: z1, thetaRad: theta, windowRad },
    ],
  };
}

/** Analytic wall sampler over a radius field (θ = TAU·u, z = t·H). */
class AnalyticWallSampler implements PositionSampler {
  constructor(
    private readonly rOf: (u: number, t: number) => number,
    private readonly H: number,
  ) {}

  position(u: number, t: number): readonly [number, number, number] {
    const r = this.rOf(u, t);
    const theta = TAU * u;
    return [r * Math.cos(theta), r * Math.sin(theta), t * this.H];
  }
}

// ── (1) + (2): slicer validation with KNOWN deviation + zero control ─────────

describe('crestLateralDeviation — z-plane slicer (synthetic mesh, known deviation)', () => {
  it('T1: recovers maxMm ≈ A and rmsMm ≈ A/√2 for a ridge displaced by A·sin(2πz/λ)', () => {
    const R0 = 50;
    const rPeak = 53;
    const H = 40;
    const A = 0.8; // mm lateral amplitude
    const lambda = 10; // mm — 4 full periods over H
    const col = 10;
    const nU = 96;
    const thetaR = (TAU * col) / nU;
    const mesh = ridgeCylinderMesh(R0, H, nU, 81, [
      { col, r: rPeak, dTheta: (z) => (A / rPeak) * Math.sin((TAU * z) / lambda) },
    ]);
    const ridge: TrueRidge = {
      branches: [straightBranch('crest', thetaR, 0, H, 0.3, 'sin-ridge')],
      refErrBoundMm: 0,
    };
    const r = crestLateralDeviation(toMesh(mesh), ridge, { sliceSpacingMm: 0.25 });

    expect(r.sliceSpacingMm).toBe(0.25);
    expect(r.crestCount).toBe(1);
    const b = r.branches[0];
    expect(b.kind).toBe('crest');
    // Coverage bookkeeping: every slice in the branch range yields an apex.
    expect(b.sliceCount).toBeGreaterThan(150);
    expect(b.sampleCount).toBe(b.sliceCount);
    // Known amplitude: max ≈ A (slice/row sampling attenuates a hair),
    // rms ≈ A/√2 over whole periods.
    expect(b.maxMm).toBeGreaterThan(0.95 * A);
    expect(b.maxMm).toBeLessThan(1.000001 * A);
    expect(b.rmsMm).toBeGreaterThan(0.68 * A);
    expect(b.rmsMm).toBeLessThan(0.72 * A);
    expect(r.worstCrestMaxMm).toBe(b.maxMm);
    expect(r.worstCrestRmsMm).toBe(b.rmsMm);
    expect(r.refErrBoundMm).toBe(0);
  });

  it('T2: zero-deviation control — apex exactly ON the true ridge reads ≈0', () => {
    // Small radius keeps the Float32Array vertex quantization below 1e-6 mm.
    const R0 = 1;
    const H = 40;
    const col = 24;
    const nU = 96;
    const mesh = ridgeCylinderMesh(R0, H, nU, 81, [{ col, r: 1.2 }]);
    const ridge: TrueRidge = {
      branches: [straightBranch('crest', (TAU * col) / nU, 0, H, 0.2)],
      refErrBoundMm: 0,
    };
    const r = crestLateralDeviation(toMesh(mesh), ridge, { sliceSpacingMm: 0.25 });
    expect(r.branches[0].sampleCount).toBe(r.branches[0].sliceCount);
    expect(r.worstCrestMaxMm).toBeLessThan(1e-6);
    expect(r.worstCrestRmsMm).toBeLessThan(1e-6);
  });

  it('T3: u-seam wrap — ridge at θ=0 with wrap-spanning triangles, no 2π phantom', () => {
    const R0 = 50;
    const rPeak = 53;
    const H = 40;
    const A = 0.8;
    const lambda = 10;
    const nU = 96;
    // Column 0 sits exactly at θ=0; the quad between columns nU−1 and 0 spans
    // the atan2 discontinuity. A wrapPi bug reads ~2π·r ≈ 300mm here.
    const mesh = ridgeCylinderMesh(R0, H, nU, 81, [
      { col: 0, r: rPeak, dTheta: (z) => (A / rPeak) * Math.sin((TAU * z) / lambda) },
    ]);
    const ridge: TrueRidge = {
      branches: [straightBranch('crest', 0, 0, H, 0.3)],
      refErrBoundMm: 0,
    };
    const r = crestLateralDeviation(toMesh(mesh), ridge, { sliceSpacingMm: 0.25 });
    expect(r.branches[0].sampleCount).toBe(r.branches[0].sliceCount);
    expect(r.worstCrestMaxMm).toBeGreaterThan(0.95 * A);
    expect(r.worstCrestMaxMm).toBeLessThan(1.000001 * A);
  });

  it('T4: crest-birth chaining — a branch born at z=20 gets no phantom samples below, attaches above', () => {
    const R0 = 50;
    const H = 40;
    const nU = 96;
    const colA = 20;
    const thetaA = (TAU * colA) / nU;
    const thetaB = thetaA + 0.25; // close neighbour, windows must keep them apart
    const D = 0.3; // mm constant lateral offset of the born ridge
    const m = ridgeCylinderMesh(R0, H, nU, 81, [{ col: colA, r: 52 }]);
    appendRidgeRibbon(m.vertices, m.indices, {
      theta: thetaB,
      rBase: R0,
      rPeak: 52,
      halfWidthRad: 0.05,
      z0: 20,
      z1: H,
      rows: 41,
      dTheta: () => D / 52,
    });
    const ridge: TrueRidge = {
      branches: [
        straightBranch('crest', thetaA, 0, H, 0.12, 'full'),
        straightBranch('crest', thetaB, 20, H, 0.12, 'born'),
      ],
      refErrBoundMm: 0,
    };
    const r = crestLateralDeviation(toMesh(m), ridge, { sliceSpacingMm: 0.25 });
    const full = r.branches.find((b) => b.label === 'full')!;
    const born = r.branches.find((b) => b.label === 'born')!;
    // No phantom: the born branch is only sliced inside its z-domain.
    expect(born.zMinMm).toBe(20);
    expect(born.sliceCount).toBeLessThan(85); // ≈80 slices in [20,40] at 0.25mm
    expect(born.sampleCount).toBe(born.sliceCount);
    // Attached to the correct branch: the born ridge reads its own 0.3mm
    // offset; the full ridge stays clean (a mis-attachment would read ~0.25rad·r).
    expect(born.maxMm).toBeGreaterThan(0.95 * D);
    expect(born.maxMm).toBeLessThan(1.02 * D);
    expect(born.rmsMm).toBeGreaterThan(0.95 * D);
    expect(full.maxMm).toBeLessThan(0.01);
  });

  it('T5: maxima/minima separation — a valley does not contaminate the crest channel', () => {
    const R0 = 50;
    const H = 40;
    const nU = 96;
    const colC = 24;
    const colV = 72; // opposite side
    const dC = 0.4; // mm crest lateral offset
    const dV = 0.25; // mm valley lateral offset
    const mesh = ridgeCylinderMesh(R0, H, nU, 81, [
      { col: colC, r: 52, dTheta: () => dC / 52 },
      { col: colV, r: 48, dTheta: () => -dV / 48 },
    ]);
    const ridge: TrueRidge = {
      branches: [
        straightBranch('crest', (TAU * colC) / nU, 0, H, 0.2, 'crest'),
        straightBranch('valley', (TAU * colV) / nU, 0, H, 0.2, 'valley'),
      ],
      refErrBoundMm: 0,
    };
    const r = crestLateralDeviation(toMesh(mesh), ridge, { sliceSpacingMm: 0.25 });
    expect(r.crestCount).toBe(1);
    expect(r.valleyCount).toBe(1);
    const crest = r.branches.find((b) => b.kind === 'crest')!;
    const valley = r.branches.find((b) => b.kind === 'valley')!;
    // Constant offsets: max ≈ rms ≈ the known displacement, per channel.
    expect(crest.maxMm).toBeGreaterThan(0.98 * dC);
    expect(crest.maxMm).toBeLessThan(1.02 * dC);
    expect(crest.rmsMm).toBeGreaterThan(0.98 * dC);
    expect(valley.maxMm).toBeGreaterThan(0.98 * dV);
    expect(valley.maxMm).toBeLessThan(1.02 * dV);
    expect(r.worstCrestMaxMm).toBe(crest.maxMm);
    expect(r.worstValleyMaxMm).toBe(valley.maxMm);
    expect(r.totalCrestSamples).toBe(crest.sampleCount);
    expect(r.totalValleySamples).toBe(valley.sampleCount);
  });
});

// ── (6): SuperformulaBlossom closed form vs brute-force f64 sfRf ─────────────

/** SFB packed params at defaults with sf_strength=1 (the pinned SFB@1 config). */
function sfbPacked(): Float32Array {
  return Float32Array.from([1, 6, 10, 1.2, 0.35, 0.5, 0.8, 1.4, 0.8, 0.8, 1, 1]);
}

function sfM(t: number): number {
  return 6 + (10 - 6) * Math.pow(t, 1.2);
}

/** Brute-force argmax of sfRf over u in [lo,hi]: dense scan + golden refine. */
function bruteArgmaxU(p: Float32Array, t: number, lo: number, hi: number): number {
  const N = 4000;
  let bestU = lo;
  let bestV = -Infinity;
  for (let i = 0; i <= N; i++) {
    const u = lo + ((hi - lo) * i) / N;
    const v = sfRf(u, t, p);
    if (v > bestV) {
      bestV = v;
      bestU = u;
    }
  }
  // Golden-section refine inside ±2 scan steps (rf is unimodal there, cusp ok).
  let a = Math.max(lo, bestU - (2 * (hi - lo)) / N);
  let b = Math.min(hi, bestU + (2 * (hi - lo)) / N);
  const phi = (Math.sqrt(5) - 1) / 2;
  let c = b - phi * (b - a);
  let d = a + phi * (b - a);
  let fc = sfRf(c, t, p);
  let fd = sfRf(d, t, p);
  while (b - a > 1e-10) {
    if (fc > fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - phi * (b - a);
      fc = sfRf(c, t, p);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + phi * (b - a);
      fd = sfRf(d, t, p);
    }
  }
  return (a + b) / 2;
}

describe('sfClosedFormCrestLoci — closed form vs brute-force argmax of sfRf', () => {
  it('T6a: loci match a brute-force argmax of the f64 sfRf mirror to ≤1e-6 in u', () => {
    const p = sfbPacked();
    for (const t of [0, 0.3, 0.5, 0.8, 1]) {
      const m = sfM(t);
      const crests = sfClosedFormCrestLoci(p, t).filter((l) => l.kind === 'crest');
      // All m stationary tip loci are crests at defaults (a=b=1, n2/n3 < 2).
      expect(crests.length).toBe(Math.floor(m + 0.5));
      for (const { u } of crests) {
        const half = 1 / (2 * m);
        const lo = Math.max(0, u - half * 0.9);
        const hi = Math.min(1 - 1e-9, u + half * 0.9);
        const uBrute = bruteArgmaxU(p, t, lo, hi);
        expect(Math.abs(uBrute - u)).toBeLessThanOrEqual(1e-6);
      }
    }
  });

  it('T6b: full SFB@1 closed-form ridge — branch births at m(t)=j−0.5, refErrBoundMm ≈ 0', () => {
    const p = sfbPacked();
    const H = 100;
    const R0 = 50;
    const strength = p[0];
    const rOf = (u: number, t: number): number => {
      const rf = sfRf(u, t, p);
      return R0 * (1 - strength) + R0 * strength * (0.9 + 0.35 * rf);
    };
    const sampler = new AnalyticWallSampler(rOf, H);
    const param = sfClosedFormParamRidge(p);
    // j=1..6 full height + j=7..10 born as m morphs 6→10.
    expect(param.branches.filter((b) => b.kind === 'crest').length).toBe(10);
    expect(param.duTol).toBe(0);
    const ridge = ridgeFromParamBranches(param, sampler);
    expect(ridge.branches.length).toBe(10);
    // Closed form ⇒ reference error ≈ 0 (sub-µm interpolation bound only).
    expect(ridge.refErrBoundMm).toBeLessThan(5e-4);
    // Births: m(t_birth) = j − 0.5 ⇒ t_birth = ((j−0.5−6)/4)^(1/1.2).
    const zMins = ridge.branches.map((b) => b.points[0].zMm).sort((a, b) => a - b);
    for (let k = 0; k < 6; k++) expect(zMins[k]).toBeLessThan(1e-6);
    const expectedBirths = [7, 8, 9, 10].map((j) => Math.pow((j - 0.5 - 6) / 4, 1 / 1.2) * H);
    for (let k = 0; k < 4; k++) {
      expect(Math.abs(zMins[6 + k] - expectedBirths[k])).toBeLessThan(1e-3);
    }
  });
});

// ── (7): generic bisection + continuation path ───────────────────────────────

describe('solveParamRidgeByBisection — generic path on analytic test fields', () => {
  it('T7a: recovers a known diagonal ridge family to the reported duTol', () => {
    const k = 5;
    const u0 = (t: number): number => 0.3 + 0.05 * t;
    const field = {
      value: (u: number, t: number): number => 30 + 2 * Math.cos(TAU * k * (u - u0(t))),
      periodicU: true,
    };
    const ridge = solveParamRidgeByBisection(field, {
      seedResU: 256,
      seedResT: 64,
      duTol: 1e-6,
      minProminence: 0.5,
    });
    expect(ridge.duTol).toBe(1e-6);
    const crests = ridge.branches.filter((b) => b.kind === 'crest');
    const valleys = ridge.branches.filter((b) => b.kind === 'valley');
    expect(crests.length).toBe(k);
    expect(valleys.length).toBe(k);
    let worst = 0;
    for (const b of crests) {
      // Full-height branches (no births in this field).
      expect(b.points[0].t).toBeLessThan(1e-9);
      expect(b.points[b.points.length - 1].t).toBeGreaterThan(1 - 1e-9);
      for (const pt of b.points) {
        // truth: u = u0(t) + j/k (mod 1)
        const rel = (pt.u - u0(pt.t)) * k;
        const err = Math.abs(rel - Math.round(rel)) / k;
        if (err > worst) worst = err;
      }
    }
    for (const b of valleys) {
      for (const pt of b.points) {
        const rel = (pt.u - u0(pt.t)) * k - 0.5;
        const err = Math.abs(rel - Math.round(rel)) / k;
        if (err > worst) worst = err;
      }
    }
    // The reported reference-error bound is honored.
    expect(worst).toBeLessThanOrEqual(1.5 * ridge.duTol);
  });

  it('T7b: fold-point ridge birth — endpoints solve g=0 ∧ ∂g/∂u=0, no phantom below', () => {
    // Base single crest at u=0 + a growing Gaussian bump at u=0.7: a crest+valley
    // pair is born mid-t where the bump slope first cancels the base slope.
    const A = 2;
    const bump = (u: number): number => Math.exp(-Math.pow((u - 0.7) / 0.04, 2));
    const dBump = (u: number): number =>
      bump(u) * (-2 * (u - 0.7)) / (0.04 * 0.04);
    const f = (u: number, t: number): number => 30 + A * Math.cos(TAU * u) + t * bump(u);
    const df = (u: number, t: number): number =>
      -A * TAU * Math.sin(TAU * u) + t * dBump(u);
    const field = { value: f, periodicU: true };
    const ridge = solveParamRidgeByBisection(field, {
      seedResU: 512,
      seedResT: 64,
      duTol: 1e-6,
      minProminence: 0.5,
    });
    const born = ridge.branches.filter((b) => b.points[0].t > 0.05);
    expect(born.length).toBe(2);
    const kinds = born.map((b) => b.kind).sort();
    expect(kinds).toEqual(['crest', 'valley']);
    const [b1, b2] = born;
    const e1 = b1.points[0];
    const e2 = b2.points[0];
    // The fold pair shares its birth endpoint.
    expect(Math.abs(e1.t - e2.t)).toBeLessThan(1e-4);
    expect(Math.abs(e1.u - e2.u)).toBeLessThan(1e-4);
    // Endpoint exactness: g = ∂r/∂u ≈ 0 AND ∂g/∂u ≈ 0 at the fold.
    expect(Math.abs(df(e1.u, e1.t))).toBeLessThan(1e-3);
    const h = 1e-4;
    const ddf = (df(e1.u + h, e1.t) - df(e1.u - h, e1.t)) / (2 * h);
    expect(Math.abs(ddf)).toBeLessThan(0.5);
    // No phantom branch below the birth: g has no zero near u=0.7 there.
    const tBelow = e1.t - 1e-3;
    let signChanges = 0;
    let prev = Math.sign(df(e1.u - 0.06, tBelow));
    for (let i = 1; i <= 64; i++) {
      const s = Math.sign(df(e1.u - 0.06 + (0.12 * i) / 64, tBelow));
      if (s !== 0 && prev !== 0 && s !== prev) signChanges++;
      if (s !== 0) prev = s;
    }
    expect(signChanges).toBe(0);
    // …and exactly two zeros just above the birth.
    const tAbove = e1.t + 1e-3;
    signChanges = 0;
    prev = Math.sign(df(e1.u - 0.06, tAbove));
    for (let i = 1; i <= 256; i++) {
      const s = Math.sign(df(e1.u - 0.06 + (0.12 * i) / 256, tAbove));
      if (s !== 0 && prev !== 0 && s !== prev) signChanges++;
      if (s !== 0) prev = s;
    }
    expect(signChanges).toBe(2);
  });
});
