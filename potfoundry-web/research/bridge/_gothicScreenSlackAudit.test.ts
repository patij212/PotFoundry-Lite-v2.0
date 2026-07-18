import { writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '../../src/state/types';
import { createCanonicalTargetInputBinding } from '../../src/geometry/targetSolid/canonicalTargetInput';
import { createSinglePatchAnnularRadialSolidTargetBinding } from '../../src/geometry/targetSolid/singlePatchAnnularRadialSolidTarget';
import { createStyleOuterWallTargetRegistryBinding } from '../../src/geometry/targetSolid/styleOuterWallTargetRegistry';
import {
  compileGeneratedTargetProgramBackends,
  compileValidatedResidualProgram,
  fastEncloseCompiledValidatedResidualProgram,
  getLastScreenClarkeFired,
  getLastScreenSecondOrderUsed,
  getLastSecondOrderInvalidOp,
  setScreenJacobianPartition,
  setScreenSecondOrder,
} from '../../src/geometry/targetSolid/validatedResidualProgram';
import { outwardInterval, outwardVectorNormUpper } from '../../src/geometry/targetSolid/outwardFloat64Interval';
import {
  voronoiNearestCenterId,
  type VoronoiLatticeParams,
} from '../../src/geometry/targetSolid/voronoiBisectorGuides';
import type { ValidatedResidualEnclosureRequest } from '../../src/geometry/targetSolid/continuousMappedPatchDistance';

// Bubble-mode Voronoi lattice (scale 8, jitter 0.8, pulse 0, zStretch 1, period
// 8) — the certified defaults, verified against the compiled target in
// voronoiBisectorGuides.test.ts. Used only to classify cells as bisector-
// straddling vs interior when STYLE is Voronoi at v_morph 0.
const VORONOI_BUBBLE_LATTICE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};

/*
 * Increment 1 of the Gothic screen-slack audit (2026-07-17).
 *
 * Measures how much conservative slack the v14 triangle-exact centered
 * mean-value SCREEN carries on real Gothic (p=1) cells, at the ACCEPTANCE size
 * the branch-and-bound actually certifies at. Slack forces the b&b to subdivide
 * cells whose TRUE residual is already under budget -> more triangles / kernel
 * time for the same certificate. (Remaining sources: Jacobian pass over the
 * axis-aligned cell hull; unconditional Clarke subgradient hulls; inner/outer
 * asymmetry. This increment measures TOTAL slack; the per-source split is
 * Increment 2.)
 *
 * Faithful to the real proof:
 *   - Same compiled program (compileValidatedResidualProgram) the kernel screens
 *     with; same canonical JSON compiled for the oracle point sampler
 *     (compileGeneratedTargetProgramBackends.evaluateFloat64).
 *   - Faithful cells: artifact triangle vertices = fround(target(corner)) = an
 *     exact chord = a conforming mesh facet (matches the f32 STL to binary32).
 *   - ADAPTIVE DESCENT reproduces cMPD:983-987 exactly: a cell is ACCEPTED when
 *     screenUpper <= budget, else SUBDIVIDED (4-way midpoint) while depth<maxDepth.
 *   - screenUpper = outwardVectorNormUpper(fastEnclose(...)) (the exact quantity
 *     validatedResidualUpperMm feeds the b&b); trueUpper = max_L2 over a dense
 *     barycentric oracle sweep of target(uv) - affine(chord).
 *
 * Money metric: among cells the screen SUBDIVIDES (screen>budget), how many had
 * TRUE <= budget already (SLACK-FORCED, pure waste) vs TRUE>budget (genuine).
 * And among ACCEPTED leaves, the slack head-room screenUpper/trueUpper carries.
 *
 * Self-checks: SOUNDNESS (screenUpper >= trueUpper always); ORACLE CONVERGENCE
 * (trueUpper at res vs 2*res on the worst cells -> apparent slack is real, not
 * under-sampling).
 *
 * Gated PF_GOTHIC_SLACK=1; tunables via env.
 */

const RUN = process.env.PF_GOTHIC_SLACK === '1';

// Integer opcode -> name for the second-order fallback attribution (mirrors the
// FAST_OP_* constants in validatedResidualProgram; -1 = hull-only/other).
const SO_OP_NAME: Readonly<Record<number, string>> = {
  [-1]: 'hull/other',
  4: 'negate',
  5: 'abs',
  6: 'square',
  7: 'sqrt',
  8: 'exp',
  9: 'ln',
  10: 'sin',
  11: 'cos',
  12: 'add',
  13: 'sub',
  14: 'mul',
  15: 'divide',
  16: 'min',
  17: 'max',
  18: 'power',
  19: 'floor',
  20: 'ceil',
  21: 'round',
  22: 'fract',
  23: 'sign',
  24: 'step',
  25: 'atan2',
  26: 'pcg2d-x',
  27: 'pcg2d-y',
};

const H32_POT_GEOMETRY = Object.freeze({
  ...DEFAULT_GEOMETRY,
  H: 32,
  top_od: 30,
  bottom_od: 30,
  r_drain: 6,
});
const TARGET_CONTROLS = Object.freeze({ superformulaSeamBlendDegrees: 30 });
// Style + params are env-driven so the same black-box harness can measure any
// screen-full style. Defaults to the certified Gothic p1 recipe.
//   Gothic:  PF_SLACK_STYLE=GothicArches (default)
//   Voronoi: PF_SLACK_STYLE=Voronoi PF_SLACK_PARAMS='{"v_morph":0,"v_relief":0.04}'
const STYLE = process.env.PF_SLACK_STYLE ?? 'GothicArches';
const PARAMS: Readonly<Record<string, number>> = Object.freeze(
  process.env.PF_SLACK_PARAMS === undefined
    ? { gaPointiness: 1, gaDiamond: 0, gaRelief: 0.2 }
    : (JSON.parse(process.env.PF_SLACK_PARAMS) as Record<string, number>)
);

const BUDGET_MM = 0.0095; // 9.5 um geometric budget.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

// Optional uv window: restrict base facets to [UMIN,UMAX]x[VMIN,VMAX] to deeply
// resolve a feature band (e.g. the arch creases at u=k/24) without the whole-grid
// crease-straddle explosion. Defaults to the full domain.
const UMIN = envFloat('PF_SLACK_UMIN', 0);
const UMAX = envFloat('PF_SLACK_UMAX', 1);
const VMIN = envFloat('PF_SLACK_VMIN', 0);
const VMAX = envFloat('PF_SLACK_VMAX', 1);

const AU = envInt('PF_SLACK_AU', 128); // angular base columns (power of two)
const AV = envInt('PF_SLACK_AV', 16); // vertical base rows (power of two)
const F = envInt('PF_SLACK_FRACTION_BITS', 14); // domain denominator = 2^F
const MAX_DEPTH = envInt('PF_SLACK_MAX_DEPTH', 6); // adaptive subdivision cap
const ORACLE_RES = envInt('PF_SLACK_ORACLE_RES', 10); // barycentric sweep resolution
// Hard global work-cell cap (the guard cMPD has as maxWorkCells): a uniform grid
// straddles all 24 arch creases, whose genuine-C0 cells subdivide toward the
// depth cap; without this the run is unbounded. Coverage is reported honestly.
const MAX_CELLS = envInt('PF_SLACK_MAX_CELLS', 500_000);
// Accept/subdivide gate (Increment 2). 'screen' = the real v14 screen (baseline).
// 'box' = sampled mean-value replica over the AABB (validates against screen).
// 'triangle' = the FIX: same replica with the Jacobian over the true triangle.
const GATE = (process.env.PF_SLACK_GATE ?? 'screen') as 'screen' | 'box' | 'triangle';
const FIX_RES = envInt('PF_SLACK_FIX_RES', 4); // Jacobian-sample resolution per axis
// Real-kernel fix: K>1 turns on the sub-box triangle-Jacobian in the actual
// screen (gate=screen). K=0 is the untouched baseline. Compare totalCells.
const JAC_PARTITION = envInt('PF_SLACK_JAC_PARTITION', 0);

type Bary = { readonly a: bigint; readonly b: bigint; readonly c: bigint };
type Uv = { readonly uNumerator: bigint; readonly vNumerator: bigint };
type Vec3 = readonly [number, number, number];
type UvF = readonly [number, number];
type TriF = readonly [UvF, UvF, UvF];
type TriMm = readonly [Vec3, Vec3, Vec3];
type Cell = readonly [Bary, Bary, Bary];

const IDENTITY: Cell = [
  { a: 1n, b: 0n, c: 0n },
  { a: 0n, b: 1n, c: 0n },
  { a: 0n, b: 0n, c: 1n },
];

function cellPoint(base: readonly [Uv, Uv, Uv], w: Bary): Uv {
  return {
    uNumerator: w.a * base[0].uNumerator + w.b * base[1].uNumerator + w.c * base[2].uNumerator,
    vNumerator: w.a * base[0].vNumerator + w.b * base[1].vNumerator + w.c * base[2].vNumerator,
  };
}

function subdivide(t: Cell): readonly Cell[] {
  const [A, B, C] = t;
  const dbl = (p: Bary): Bary => ({ a: p.a * 2n, b: p.b * 2n, c: p.c * 2n });
  const mid = (p: Bary, q: Bary): Bary => ({ a: p.a + q.a, b: p.b + q.b, c: p.c + q.c });
  const A2 = dbl(A);
  const B2 = dbl(B);
  const C2 = dbl(C);
  const AB = mid(A, B);
  const BC = mid(B, C);
  const CA = mid(C, A);
  return [
    [A2, AB, CA],
    [AB, B2, BC],
    [CA, BC, C2],
    [AB, BC, CA],
  ];
}

function buildRequest(
  base: readonly [Uv, Uv, Uv],
  artifactMm: TriMm,
  cell: Cell,
  depth: number
): ValidatedResidualEnclosureRequest {
  const verts = cell.map((w) => {
    const p = cellPoint(base, w);
    return { uNumerator: p.uNumerator.toString(), vNumerator: p.vNumerator.toString() };
  }) as unknown as ValidatedResidualEnclosureRequest['cell']['vertices'];
  const bary = cell.map((w) => ({
    aNumerator: w.a.toString(),
    bNumerator: w.b.toString(),
    cNumerator: w.c.toString(),
  })) as unknown as ValidatedResidualEnclosureRequest['cell']['barycentricVertices'];
  return {
    patchId: 'outer-wall',
    artifactTriangleIndex: 0,
    artifactTriangleVerticesMm: artifactMm,
    originalDomainTriangle: base.map((p) => ({
      uNumerator: p.uNumerator.toString(),
      vNumerator: p.vNumerator.toString(),
    })) as unknown as ValidatedResidualEnclosureRequest['originalDomainTriangle'],
    cell: {
      fractionBits: F + depth,
      barycentricFractionBits: depth,
      vertices: verts,
      barycentricVertices: bary,
    },
  };
}

function screenUpperMm(
  request: ValidatedResidualEnclosureRequest,
  program: ReturnType<typeof compileValidatedResidualProgram>
): number | null {
  const enclosure = fastEncloseCompiledValidatedResidualProgram(program, request);
  if (enclosure === null) return null;
  return outwardVectorNormUpper(
    outwardInterval(enclosure.xMm.lower, enclosure.xMm.upper),
    outwardInterval(enclosure.yMm.lower, enclosure.yMm.upper),
    outwardInterval(enclosure.zMm.lower, enclosure.zMm.upper)
  );
}

/** max L2 of target(uv) - affine(chord) over a dense barycentric sweep of the cell. */
function trueUpperMm(
  baseUvFloat: TriF,
  artifactMm: TriMm,
  cell: Cell,
  depth: number,
  evaluateFloat64: (u: number, v: number) => Vec3,
  resolution: number
): number {
  const scale = 1 / 2 ** depth;
  const cw = cell.map((w) => [Number(w.a) * scale, Number(w.b) * scale, Number(w.c) * scale] as const);
  let worst = 0;
  for (let i = 0; i <= resolution; i += 1) {
    for (let j = 0; j <= resolution - i; j += 1) {
      const sa = i / resolution;
      const sb = j / resolution;
      const sc = 1 - sa - sb;
      const ba = sa * cw[0][0] + sb * cw[1][0] + sc * cw[2][0];
      const bb = sa * cw[0][1] + sb * cw[1][1] + sc * cw[2][1];
      const bc = sa * cw[0][2] + sb * cw[1][2] + sc * cw[2][2];
      const u = ba * baseUvFloat[0][0] + bb * baseUvFloat[1][0] + bc * baseUvFloat[2][0];
      const v = ba * baseUvFloat[0][1] + bb * baseUvFloat[1][1] + bc * baseUvFloat[2][1];
      const target = evaluateFloat64(u, v);
      const dx = target[0] - (ba * artifactMm[0][0] + bb * artifactMm[1][0] + bc * artifactMm[2][0]);
      const dy = target[1] - (ba * artifactMm[0][1] + bb * artifactMm[1][1] + bc * artifactMm[2][1]);
      const dz = target[2] - (ba * artifactMm[0][2] + bb * artifactMm[1][2] + bc * artifactMm[2][2]);
      const norm = Math.hypot(dx, dy, dz);
      if (norm > worst) worst = norm;
    }
  }
  return worst;
}

// ---- Increment 2: sampled-Jacobian mean-value replica (measure the fix) ----
// Reproduces the screen's centered mean-value bound with the interval Jacobian
// SAMPLED over a chosen domain. Over the AABB it tracks the real screen (Clarke
// two-sided range appears wherever the box straddles a kink); over the TRIANGLE
// the spurious straddle vanishes -> the fix. Not a sound bound (sampled J range
// slightly under-encloses), but a faithful MEASUREMENT of the AABB->triangle
// tightening, apples-to-apples between the two domains.
const FD_H = 1e-5;

function jacobianAt(
  f: (u: number, v: number) => Vec3,
  u: number,
  v: number
): { ju: Vec3; jv: Vec3 } {
  const c = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
  const up = f(c(u + FD_H), v);
  const um2 = f(c(u - FD_H), v);
  const vp = f(u, c(v + FD_H));
  const vm = f(u, c(v - FD_H));
  const inv = 1 / (2 * FD_H);
  return {
    ju: [(up[0] - um2[0]) * inv, (up[1] - um2[1]) * inv, (up[2] - um2[2]) * inv],
    jv: [(vp[0] - vm[0]) * inv, (vp[1] - vm[1]) * inv, (vp[2] - vm[2]) * inv],
  };
}

/** Centered mean-value bound (mm) with the Jacobian sampled over `domain`. */
function sampledMeanValueBound(
  corners: TriF,
  artifactMm: TriMm,
  f: (u: number, v: number) => Vec3,
  domain: 'box' | 'triangle',
  res: number
): number {
  const cu = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
  const cv = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
  const center = f(cu, cv);
  const artC: Vec3 = [
    (artifactMm[0][0] + artifactMm[1][0] + artifactMm[2][0]) / 3,
    (artifactMm[0][1] + artifactMm[1][1] + artifactMm[2][1]) / 3,
    (artifactMm[0][2] + artifactMm[1][2] + artifactMm[2][2]) / 3,
  ];
  const rc: Vec3 = [center[0] - artC[0], center[1] - artC[1], center[2] - artC[2]];
  const offs = corners.map((c) => [c[0] - cu, c[1] - cv] as const);
  const juLo: [number, number, number] = [Infinity, Infinity, Infinity];
  const juHi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const jvLo: [number, number, number] = [Infinity, Infinity, Infinity];
  const jvHi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  const consume = (u: number, v: number): void => {
    const { ju, jv } = jacobianAt(f, u, v);
    for (let k = 0; k < 3; k += 1) {
      if (ju[k] < juLo[k]) juLo[k] = ju[k];
      if (ju[k] > juHi[k]) juHi[k] = ju[k];
      if (jv[k] < jvLo[k]) jvLo[k] = jv[k];
      if (jv[k] > jvHi[k]) jvHi[k] = jv[k];
    }
  };
  if (domain === 'box') {
    const uLo = Math.min(corners[0][0], corners[1][0], corners[2][0]);
    const uHi = Math.max(corners[0][0], corners[1][0], corners[2][0]);
    const vLo = Math.min(corners[0][1], corners[1][1], corners[2][1]);
    const vHi = Math.max(corners[0][1], corners[1][1], corners[2][1]);
    for (let i = 0; i <= res; i += 1) {
      for (let j = 0; j <= res; j += 1) {
        consume(uLo + ((uHi - uLo) * i) / res, vLo + ((vHi - vLo) * j) / res);
      }
    }
  } else {
    for (let i = 0; i <= res; i += 1) {
      for (let j = 0; j <= res - i; j += 1) {
        const sa = i / res;
        const sb = j / res;
        const sc = 1 - sa - sb;
        consume(
          sa * corners[0][0] + sb * corners[1][0] + sc * corners[2][0],
          sa * corners[0][1] + sb * corners[1][1] + sc * corners[2][1]
        );
      }
    }
  }
  let sumSq = 0;
  for (let coord = 0; coord < 3; coord += 1) {
    let termLo = Infinity;
    let termHi = -Infinity;
    for (const [ou, ov] of offs) {
      // interval juRange*ou + jvRange*ov
      const u0 = juLo[coord] * ou;
      const u1 = juHi[coord] * ou;
      const v0 = jvLo[coord] * ov;
      const v1 = jvHi[coord] * ov;
      const lo = Math.min(u0, u1) + Math.min(v0, v1);
      const hi = Math.max(u0, u1) + Math.max(v0, v1);
      if (lo < termLo) termLo = lo;
      if (hi > termHi) termHi = hi;
    }
    const lo = rc[coord] + termLo;
    const hi = rc[coord] + termHi;
    const mag = Math.max(Math.abs(lo), Math.abs(hi));
    sumSq += mag * mag;
  }
  return Math.sqrt(sumSq);
}

/** The cell's three uv corners in float (barycentric weights over 2^depth). */
function cellCornersFloat(baseUvFloat: TriF, cell: Cell, depth: number): TriF {
  const scale = 1 / 2 ** depth;
  return cell.map((w) => {
    const a = Number(w.a) * scale;
    const b = Number(w.b) * scale;
    const c = Number(w.c) * scale;
    return [
      a * baseUvFloat[0][0] + b * baseUvFloat[1][0] + c * baseUvFloat[2][0],
      a * baseUvFloat[0][1] + b * baseUvFloat[1][1] + c * baseUvFloat[2][1],
    ] as const;
  }) as unknown as TriF;
}

// ---- POC: second-order Taylor ceiling on the residual over one cell ----
// residual(u,v) = target(u,v) - baseAffine(u,v) (baseAffine = the flat chord
// through the base cell's 3 mm vertices). Fit its 2nd-order Taylor from the
// cell centroid (finite-difference J, H of the field, stable step) and report
// the CEILING ratio 1 + max|residual - Taylor2| / max|residual|: the residual
// slack an ideal second-order screen would carry (its remainder is 3rd order).
// Valid on SMOOTH (interior) cells only; kinked cells would fall back to 1st order.
function secondOrderCeilingRatio(
  baseUvFloat: TriF,
  artifactMm: TriMm,
  corners: TriF,
  f: (u: number, v: number) => Vec3,
  resolution: number
): number {
  // baseAffine per coord: A + B*u + C*v through the 3 base vertices.
  const [P0, P1, P2] = baseUvFloat;
  const det = (P1[0] - P0[0]) * (P2[1] - P0[1]) - (P1[1] - P0[1]) * (P2[0] - P0[0]);
  const A: [number, number, number] = [0, 0, 0];
  const B: [number, number, number] = [0, 0, 0];
  const C: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k += 1) {
    const d1 = artifactMm[1][k] - artifactMm[0][k];
    const d2 = artifactMm[2][k] - artifactMm[0][k];
    B[k] = (d1 * (P2[1] - P0[1]) - d2 * (P1[1] - P0[1])) / det;
    C[k] = (d2 * (P1[0] - P0[0]) - d1 * (P2[0] - P0[0])) / det;
    A[k] = artifactMm[0][k] - B[k] * P0[0] - C[k] * P0[1];
  }
  const resAt = (u: number, v: number): Vec3 => {
    const t = f(u, v);
    return [t[0] - (A[0] + B[0] * u + C[0] * v), t[1] - (A[1] + B[1] * u + C[1] * v), t[2] - (A[2] + B[2] * u + C[2] * v)];
  };
  const cu = (corners[0][0] + corners[1][0] + corners[2][0]) / 3;
  const cv = (corners[0][1] + corners[1][1] + corners[2][1]) / 3;
  const h = 1e-3;
  const r0 = resAt(cu, cv);
  const rpu = resAt(cu + h, cv);
  const rmu = resAt(cu - h, cv);
  const rpv = resAt(cu, cv + h);
  const rmv = resAt(cu, cv - h);
  const rpp = resAt(cu + h, cv + h);
  const rpm = resAt(cu + h, cv - h);
  const rmp = resAt(cu - h, cv + h);
  const rmm = resAt(cu - h, cv - h);
  const Ju: [number, number, number] = [0, 0, 0];
  const Jv: [number, number, number] = [0, 0, 0];
  const Huu: [number, number, number] = [0, 0, 0];
  const Hvv: [number, number, number] = [0, 0, 0];
  const Huv: [number, number, number] = [0, 0, 0];
  for (let k = 0; k < 3; k += 1) {
    Ju[k] = (rpu[k] - rmu[k]) / (2 * h);
    Jv[k] = (rpv[k] - rmv[k]) / (2 * h);
    Huu[k] = (rpu[k] - 2 * r0[k] + rmu[k]) / (h * h);
    Hvv[k] = (rpv[k] - 2 * r0[k] + rmv[k]) / (h * h);
    Huv[k] = (rpp[k] - rpm[k] - rmp[k] + rmm[k]) / (4 * h * h);
  }
  let trueMax = 0;
  let remMax = 0;
  for (let i = 0; i <= resolution; i += 1) {
    for (let j = 0; j <= resolution - i; j += 1) {
      const sa = i / resolution;
      const sb = j / resolution;
      const sc = 1 - sa - sb;
      const u = sa * corners[0][0] + sb * corners[1][0] + sc * corners[2][0];
      const v = sa * corners[0][1] + sb * corners[1][1] + sc * corners[2][1];
      const ou = u - cu;
      const ov = v - cv;
      const actual = resAt(u, v);
      let remSq = 0;
      let actSq = 0;
      for (let k = 0; k < 3; k += 1) {
        const taylor =
          r0[k] + Ju[k] * ou + Jv[k] * ov + 0.5 * (Huu[k] * ou * ou + 2 * Huv[k] * ou * ov + Hvv[k] * ov * ov);
        remSq += (actual[k] - taylor) * (actual[k] - taylor);
        actSq += actual[k] * actual[k];
      }
      if (actSq > trueMax * trueMax) trueMax = Math.sqrt(actSq);
      if (remSq > remMax * remMax) remMax = Math.sqrt(remSq);
    }
  }
  return trueMax > 1e-12 ? 1 + remMax / trueMax : 1;
}

function cellCentroidUv(baseUvFloat: TriF, cell: Cell, depth: number): UvF {
  const scale = 1 / 2 ** depth;
  let u = 0;
  let v = 0;
  for (const w of cell) {
    const bu =
      (Number(w.a) * baseUvFloat[0][0] + Number(w.b) * baseUvFloat[1][0] + Number(w.c) * baseUvFloat[2][0]) *
      scale;
    const bv =
      (Number(w.a) * baseUvFloat[0][1] + Number(w.b) * baseUvFloat[1][1] + Number(w.c) * baseUvFloat[2][1]) *
      scale;
    u += bu / 3;
    v += bv / 3;
  }
  return [u, v];
}

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[idx];
}

const um = (mm: number): string => (mm * 1000).toFixed(4);

describe('Gothic screen-slack audit (Increment 1: total black-box slack)', () => {
  it.runIf(RUN)(
    'measures screen-bound overshoot vs true residual at b&b acceptance size',
    () => {
      const errPath = (process.env.PF_SLACK_OUT ?? 'gothic_slack_report.txt') + '.err';
      setScreenJacobianPartition(GATE === 'screen' ? JAC_PARTITION : 0);
      // Speedup measurement toggle: when PF_SLACK_SECOND_ORDER=1 the real screen
      // runs the flag-gated Hessian-interval (second-order) pass, so total cells /
      // accepted leaves fall by whatever the tighter bound buys; the minSlack
      // soundness gate below then also validates the second-order screen over the
      // whole real grid. Default (unset) is the untouched first-order baseline.
      const SECOND_ORDER = process.env.PF_SLACK_SECOND_ORDER === '1';
      setScreenSecondOrder(SECOND_ORDER);
      try {
      const canonicalInput = createCanonicalTargetInputBinding(
        H32_POT_GEOMETRY,
        STYLE,
        PARAMS,
        TARGET_CONTROLS
      );
      const binding = createSinglePatchAnnularRadialSolidTargetBinding(
        canonicalInput,
        createStyleOuterWallTargetRegistryBinding(canonicalInput)
      );
      const patchIds = binding.programs.map((p) => p.patchId);
      const outer = binding.programs.find((p) => p.patchId === 'outer-wall');
      expect(outer, `outer-wall among [${patchIds.join(', ')}]`).toBeDefined();
      if (outer === undefined) return;

      const program = compileValidatedResidualProgram(outer.programCanonicalJson);
      const backends = compileGeneratedTargetProgramBackends(outer.programCanonicalJson);
      const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
      const evaluateFloat64 = (u: number, v: number): Vec3 =>
        backends.evaluateFloat64(clamp01(u), clamp01(v)) as Vec3;

      const denom = 2 ** F;
      expect(denom % AU, `AU=${AU} must divide 2^F=${denom}`).toBe(0);
      expect(denom % AV, `AV=${AV} must divide 2^F=${denom}`).toBe(0);
      const uStepNum = BigInt(denom / AU);
      const vStepNum = BigInt(denom / AV);

      // Accumulators.
      let totalCells = 0;
      let capped = false;
      let refused = 0;
      let minSlack = Number.POSITIVE_INFINITY;
      const acceptSlack: number[] = []; // slack (mm) at accepted leaves
      const acceptRatio: number[] = []; // screen/true at accepted leaves
      const acceptTrue: number[] = []; // true residual (mm) at accepted leaves
      const clarkeRatio: number[] = []; // accepted-leaf ratio where Clarke fired
      const smoothRatio: number[] = []; // accepted-leaf ratio where it did not
      const straddleRatio: number[] = []; // Voronoi: cell straddles a bisector
      const interiorRatio: number[] = []; // Voronoi: cell inside one Voronoi cell
      const soCeilingRatio: number[] = []; // Voronoi interior: 2nd-order ceiling ratio
      const voronoiStraddle = STYLE === 'Voronoi' && PARAMS.v_morph === 0;
      let subdivided = 0;
      let secondOrderUsed = 0; // cells whose screen used the 2nd-order form (not fallback)
      const soInvalidOpHist = new Map<number, number>(); // fallback attribution: invalidating opcode -> count (-1 = hull-only/other)
      let slackForced = 0; // subdivided but true<=budget => pure waste
      let genuineOver = 0; // subdivided and true>budget => real
      let capLeaves = 0; // hit MAX_DEPTH still over budget (decimal/refuse regime)
      // Top-K accepted leaves by ratio, with recompute inputs for a convergence check.
      type Worst = {
        ratio: number;
        screen: number;
        trueMm: number;
        u: number;
        v: number;
        depth: number;
        baseUvFloat: TriF;
        artifactMm: TriMm;
        cell: Cell;
      };
      const worst: Worst[] = [];
      const K = 24;

      const recurse = (
        base: readonly [Uv, Uv, Uv],
        baseUvFloat: TriF,
        artifactMm: TriMm,
        cell: Cell,
        depth: number
      ): void => {
        if (totalCells >= MAX_CELLS) {
          capped = true;
          return;
        }
        totalCells += 1;
        const corners = cellCornersFloat(baseUvFloat, cell, depth);
        const screen =
          GATE === 'screen'
            ? screenUpperMm(buildRequest(base, artifactMm, cell, depth), program)
            : sampledMeanValueBound(corners, artifactMm, evaluateFloat64, GATE, FIX_RES);
        const clarkeFired = GATE === 'screen' && getLastScreenClarkeFired();
        if (GATE === 'screen' && SECOND_ORDER && getLastScreenSecondOrderUsed()) secondOrderUsed += 1;
        if (GATE === 'screen' && SECOND_ORDER && screen !== null && !getLastScreenSecondOrderUsed()) {
          const op = getLastSecondOrderInvalidOp();
          soInvalidOpHist.set(op, (soInvalidOpHist.get(op) ?? 0) + 1);
        }
        const trueMm = trueUpperMm(baseUvFloat, artifactMm, cell, depth, evaluateFloat64, ORACLE_RES);
        if (screen === null) {
          refused += 1;
          return;
        }
        if (screen - trueMm < minSlack) minSlack = screen - trueMm;

        if (screen <= BUDGET_MM) {
          // ACCEPTED leaf — this is the size the b&b certifies at.
          acceptSlack.push(screen - trueMm);
          acceptTrue.push(trueMm);
          const ratio = trueMm > 1e-9 ? screen / trueMm : Number.POSITIVE_INFINITY;
          if (Number.isFinite(ratio)) {
            acceptRatio.push(ratio);
            (clarkeFired ? clarkeRatio : smoothRatio).push(ratio);
            if (voronoiStraddle) {
              const s = VORONOI_BUBBLE_LATTICE.scale;
              const id0 = voronoiNearestCenterId(VORONOI_BUBBLE_LATTICE, corners[0][0] * s, corners[0][1] * s);
              const id1 = voronoiNearestCenterId(VORONOI_BUBBLE_LATTICE, corners[1][0] * s, corners[1][1] * s);
              const id2 = voronoiNearestCenterId(VORONOI_BUBBLE_LATTICE, corners[2][0] * s, corners[2][1] * s);
              if (id0 !== id1 || id1 !== id2) {
                straddleRatio.push(ratio);
              } else {
                interiorRatio.push(ratio);
                soCeilingRatio.push(
                  secondOrderCeilingRatio(baseUvFloat, artifactMm, corners, evaluateFloat64, ORACLE_RES)
                );
              }
            }
            const [u, v] = cellCentroidUv(baseUvFloat, cell, depth);
            worst.push({ ratio, screen, trueMm, u, v, depth, baseUvFloat, artifactMm, cell });
            worst.sort((x, y) => y.ratio - x.ratio);
            if (worst.length > K) worst.length = K;
          }
          return;
        }
        // screen > budget.
        if (depth >= MAX_DEPTH) {
          capLeaves += 1;
          return;
        }
        subdivided += 1;
        if (trueMm <= BUDGET_MM) slackForced += 1;
        else genuineOver += 1;
        for (const child of subdivide(cell)) {
          recurse(base, baseUvFloat, artifactMm, child, depth + 1);
        }
      };

      let baseFacets = 0;
      for (let iu = 0; iu < AU; iu += 1) {
        for (let iv = 0; iv < AV; iv += 1) {
          // Window filter: skip rects entirely outside [UMIN,UMAX]x[VMIN,VMAX].
          const ru0 = iu / AU;
          const ru1 = (iu + 1) / AU;
          const rv0 = iv / AV;
          const rv1 = (iv + 1) / AV;
          if (ru1 <= UMIN || ru0 >= UMAX || rv1 <= VMIN || rv0 >= VMAX) continue;
          baseFacets += 2;
          const u0 = BigInt(iu) * uStepNum;
          const u1 = BigInt(iu + 1) * uStepNum;
          const v0 = BigInt(iv) * vStepNum;
          const v1 = BigInt(iv + 1) * vStepNum;
          const corners: readonly Uv[] = [
            { uNumerator: u0, vNumerator: v0 },
            { uNumerator: u1, vNumerator: v0 },
            { uNumerator: u1, vNumerator: v1 },
            { uNumerator: u0, vNumerator: v1 },
          ];
          for (const [i0, i1, i2] of [
            [0, 1, 2],
            [0, 2, 3],
          ] as const) {
            const base = [corners[i0], corners[i1], corners[i2]] as const;
            const baseUvFloat = base.map(
              (p) => [Number(p.uNumerator) / denom, Number(p.vNumerator) / denom] as const
            ) as unknown as TriF;
            const artifactMm = baseUvFloat.map((uv) => {
              const t = evaluateFloat64(uv[0], uv[1]);
              return [Math.fround(t[0]), Math.fround(t[1]), Math.fround(t[2])] as Vec3;
            }) as unknown as TriMm;
            recurse(base, baseUvFloat, artifactMm, IDENTITY, 0);
          }
        }
      }

      acceptSlack.sort((a, b) => a - b);
      acceptRatio.sort((a, b) => a - b);
      acceptTrue.sort((a, b) => a - b);
      clarkeRatio.sort((a, b) => a - b);
      smoothRatio.sort((a, b) => a - b);
      straddleRatio.sort((a, b) => a - b);
      interiorRatio.sort((a, b) => a - b);
      soCeilingRatio.sort((a, b) => a - b);

      // Oracle-convergence check: recompute the worst accepted leaves at 2x res.
      // If trueUpper climbs materially (ratio drops), the "slack" was sampling
      // error, not screen looseness.
      const convergence = worst.slice(0, 6).map((w) => {
        const fine = trueUpperMm(
          w.baseUvFloat,
          w.artifactMm,
          w.cell,
          w.depth,
          evaluateFloat64,
          ORACLE_RES * 2
        );
        return {
          coarseRatio: w.ratio,
          fineRatio: w.screen / Math.max(fine, 1e-9),
          coarseTrueUm: um(w.trueMm),
          fineTrueUm: um(fine),
        };
      });

      const report = [
        '',
        '=============== SCREEN-SLACK AUDIT (Increment 1) ===============',
        `config: ${STYLE} ${JSON.stringify(PARAMS)}  H32/OD30/drain6`,
        `patches: [${patchIds.join(', ')}]`,
        `grid: ${AU}x${AV} base rects (x2 tris), fractionBits=${F}, adaptiveMaxDepth=${MAX_DEPTH}, oracleRes=${ORACLE_RES}`,
        `GATE: ${GATE}${GATE === 'screen' ? ` (real v14 screen, jacPartition K=${JAC_PARTITION})` : ` (sampled mean-value replica, Jacobian over ${GATE}, fixRes=${FIX_RES})`}`,
        `window: u[${UMIN},${UMAX}] v[${VMIN},${VMAX}]  base facets in window: ${baseFacets}`,
        `budget: ${um(BUDGET_MM)} um`,
        '',
        '--- b&b population (adaptive descent = cMPD accept/subdivide) ---',
        `  second-order screen        : ${SECOND_ORDER ? 'ON' : 'OFF (first-order baseline)'}${SECOND_ORDER ? `  (2nd-order cells: ${secondOrderUsed}, ${((100 * secondOrderUsed) / Math.max(totalCells, 1)).toFixed(1)}%; rest fell back)` : ''}`,
        ...(SECOND_ORDER
          ? [
              `  2nd-order fallback by op   : ${[...soInvalidOpHist.entries()]
                .sort((x, y) => y[1] - x[1])
                .map(([op, n]) => `${SO_OP_NAME[op] ?? `op${op}`}=${n}`)
                .join(' ')}`,
            ]
          : []),
        `  total cells visited        : ${totalCells}${capped ? ` (CAPPED at ${MAX_CELLS} — coverage partial)` : ''}`,
        `  screen-refused (unavailable): ${refused}`,
        `  accepted leaves            : ${acceptRatio.length}`,
        `  hit depth cap (over budget): ${capLeaves}`,
        `  soundness min slack (um)   : ${um(minSlack)}   (MUST be >= 0)`,
        '',
        '--- SLACK-FORCED SUBDIVISION (the money metric) ---',
        `  cells subdivided (screen>budget)     : ${subdivided}`,
        `    TRUE already <= budget (SLACK WASTE): ${slackForced}  (${((100 * slackForced) / Math.max(subdivided, 1)).toFixed(1)}%)`,
        `    TRUE also > budget (genuine)        : ${genuineOver}`,
        `  ~cells attributable to slack (4x waste): ${slackForced * 4}`,
        '',
        ...(voronoiStraddle
          ? [
              '--- LEVER A payoff: accepted-leaf ratio split by bisector straddle ---',
              `  interior (CONFORMING)   : p50 ${quantile(interiorRatio, 0.5).toFixed(3)}  p90 ${quantile(interiorRatio, 0.9).toFixed(3)}  (n=${interiorRatio.length}, ${((100 * interiorRatio.length) / Math.max(interiorRatio.length + straddleRatio.length, 1)).toFixed(1)}%)`,
              `  straddles a bisector    : p50 ${quantile(straddleRatio, 0.5).toFixed(3)}  p90 ${quantile(straddleRatio, 0.9).toFixed(3)}  (n=${straddleRatio.length})`,
              `  interior 2nd-ORDER ceiling: p50 ${quantile(soCeilingRatio, 0.5).toFixed(3)}  p90 ${quantile(soCeilingRatio, 0.9).toFixed(3)}  p99 ${quantile(soCeilingRatio, 0.99).toFixed(3)}  (vs 1st-order ${quantile(interiorRatio, 0.5).toFixed(3)})`,
              '',
            ]
          : []),
        '--- 1.30-floor attribution: accepted-leaf ratio split by Clarke firing ---',
        `  Clarke fired (bisector) : p50 ${quantile(clarkeRatio, 0.5).toFixed(3)}  p90 ${quantile(clarkeRatio, 0.9).toFixed(3)}  (n=${clarkeRatio.length}, ${((100 * clarkeRatio.length) / Math.max(acceptRatio.length, 1)).toFixed(1)}%)`,
        `  smooth (no Clarke)      : p50 ${quantile(smoothRatio, 0.5).toFixed(3)}  p90 ${quantile(smoothRatio, 0.9).toFixed(3)}  (n=${smoothRatio.length})`,
        '',
        '--- accepted-leaf slack head-room ---',
        `  screen/true ratio  p50 : ${quantile(acceptRatio, 0.5).toFixed(3)}`,
        `                     p90 : ${quantile(acceptRatio, 0.9).toFixed(3)}`,
        `                     p99 : ${quantile(acceptRatio, 0.99).toFixed(3)}`,
        `                     max : ${quantile(acceptRatio, 1).toFixed(3)}`,
        `  true residual (um) p50 : ${um(quantile(acceptTrue, 0.5))}   (budget=${um(BUDGET_MM)})`,
        `                     p10 : ${um(quantile(acceptTrue, 0.1))}   (low true = big head-room = wasted tightness)`,
        `  abs slack (um)     p50 : ${um(quantile(acceptSlack, 0.5))}`,
        `                     p90 : ${um(quantile(acceptSlack, 0.9))}`,
        '',
        '--- oracle convergence on worst accepted leaves (res vs 2x res) ---',
        ...convergence.map(
          (c) =>
            `  ratio ${c.coarseRatio.toFixed(2)} -> ${c.fineRatio.toFixed(2)}   true ${c.coarseTrueUm} -> ${c.fineTrueUm} um`
        ),
        '',
        '--- top worst-ratio accepted leaves ---',
        ...worst
          .slice(0, 12)
          .map(
            (w) =>
              `  u=${w.u.toFixed(4)} v=${w.v.toFixed(4)} depth=${w.depth}  screen=${um(w.screen)}  true=${um(w.trueMm)}  ratio=${w.ratio.toFixed(2)}`
          ),
        '======================================================================',
        '',
      ].join('\n');
      // eslint-disable-next-line no-console
      console.log(report);
      // Vitest fork workers buffer stdout unreliably; persist the report to a
      // file so the numbers always survive.
      const outPath = process.env.PF_SLACK_OUT;
      if (outPath !== undefined) writeFileSync(outPath, report, 'utf8');

      // Soundness only holds for the real screen; the sampled replica may dip
      // slightly negative where the sampled Jacobian under-encloses.
      if (GATE === 'screen') expect(minSlack).toBeGreaterThanOrEqual(-1e-9);
      expect(totalCells).toBeGreaterThan(0);
      } catch (e) {
        writeFileSync(errPath, e instanceof Error ? (e.stack ?? e.message) : String(e), 'utf8');
        throw e;
      } finally {
        setScreenJacobianPartition(0);
        setScreenSecondOrder(false);
      }
    },
    600_000
  );
});
