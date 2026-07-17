// _wallSpike.test.ts — DEV-ONLY (PF_WALL_SPIKE=1). MECHANISM SPIKE, not a gate.
//
// QUESTION (Patryk, 2026-07-17): can a snaking TRUE-C0 cliff be meshed to the
// LITERAL 0.01mm true-3D standard by a DOUBLE-VALUED WALL — two vertices at ONE
// (u,t), different radii, joined by flat quads — instead of a steep ramp or a
// gate-excluded band? Nothing in the mesher builds a two-radii-at-one-(u,t)
// vertex today, so this de-risks the mechanism BEFORE any production spec.
//
// SUBJECT: CelticKnot, column 0 / strand 0 / +strandW edge. Its cliff is closed
// form (C0-SCAN, project_c0_scan_verdict): the nearest-strand ribbon edge
//   minD(u,t) = strandW,  centerline localU = amp·sin(t·tightness·TAU·3)
// with an EXACT radius jump = relief·0.3 (= 0.600mm at defaults): ribbon edge ->
// baseRadius r0 (profile->0 at the edge), background -> r0 − relief·0.3.
//
// CONSTRUCTION (pure analytic, no mesher touched):
//   1. trace C(s)=(theta_edge(t), t) along t,
//   2. two lips per s at the SAME (theta,t): upper=r0, lower=r0−0.6 (double-valued),
//   3. wall quads between consecutive (upper,lower) pairs,
//   4. GROUND TRUTH = the analytic RULED face swept by the vertical lip-segment
//      along the continuous curve.
//
// KILL-CRITERION (pre-registered): PASS iff (a) max perpendicular distance from
// the wall facets to the ruled cliff-face DRIVES BELOW 0.01mm as sample density
// rises — MEASURED, not excluded — at a per-sample spacing not pathologically
// finer than a typical surface edge (~0.5mm); and (b) the two lips are distinct
// (|upper−lower|>0) and each equals its one-sided surface limit (so a surface
// sheet sampled to the curve welds to them ⇒ watertight). FAIL if wallErr FLOORS
// above 0.01 regardless of density (the ruled-face model is wrong / not a clean
// C0), or the lips collapse.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import { baseRadius } from '../../src/geometry/profile';
import { type StyleId } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_wallspike');
const save = (name: string, obj: unknown): void => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, `${name}.json`), JSON.stringify(obj, null, 2)); };

type Vec3 = [number, number, number];

// ---- CelticKnot cliff, defaults (project_c0_scan_verdict) ----
const NUM_COLUMNS = 3;         // floor(ckScale=3)
const STRAND_W = 0.15 * 0.15;  // ckWidth·0.15 = 0.0225
const AMP = 0.4;               // WGSL braid amp
const TIGHTNESS = 0.5;         // max(0.5, ckTwist=0 + 0.5)
const RELIEF = 2.0;            // ckRelief
const JUMP = RELIEF * 0.3;     // exact C0 step = 0.600mm

/** localU of the traced +edge at height-fraction t (column 0, strand 0). */
function localUEdge(t: number): number {
  const arg = t * TIGHTNESS * TAU * 3; // v·frq + phase(0,0)=0
  return AMP * Math.sin(arg) + STRAND_W;
}
/** theta of the traced edge at t (maps localU∈[-1,1) back through the col-0 tiling). */
function thetaEdge(t: number): number {
  const fractColU = localUEdge(t) / 2 + 0.5;
  return (0 + fractColU) / NUM_COLUMNS * TAU; // columnId 0
}
/** Two lip radii at t: upper = ribbon-edge limit r0; lower = background r0−JUMP. */
function lips(t: number): { upper: number; lower: number } {
  const r0 = baseRadius(t * DIMS.H, DIMS.H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1, {});
  return { upper: r0, lower: r0 - JUMP };
}
/** Lift (theta, t, r) → 3D. Height along Y; distances are lift-frame invariant. */
function lift(theta: number, t: number, r: number): Vec3 {
  return [r * Math.cos(theta), t * DIMS.H, r * Math.sin(theta)];
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/** Squared distance from p to triangle (a,b,c) — Ericson, Real-Time Collision Detection. */
function distPtTri2(p: Vec3, a: Vec3, b: Vec3, c: Vec3): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); const q = add(a, ab, v); const d = sub(p, q); return dot(d, d); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); const q = add(a, ac, w); const d = sub(p, q); return dot(d, d); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); const q = add(b, sub(c, b), w); const d = sub(p, q); return dot(d, d); }
  const denom = 1 / (va + vb + vc); const v = vb * denom, w = vc * denom;
  const q: Vec3 = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
  const d = sub(p, q); return dot(d, d);
}

/** Build the double-valued wall over N t-samples in [tLo,tHi]. Returns quad tri list. */
function buildWall(N: number, tLo: number, tHi: number): { tris: [Vec3, Vec3, Vec3][]; minLipSep: number } {
  const up: Vec3[] = [], lo: Vec3[] = [];
  let minLipSep = Infinity;
  for (let s = 0; s < N; s++) {
    const t = tLo + (tHi - tLo) * (s / (N - 1));
    const th = thetaEdge(t); const { upper, lower } = lips(t);
    up.push(lift(th, t, upper)); lo.push(lift(th, t, lower));
    minLipSep = Math.min(minLipSep, upper - lower);
  }
  const tris: [Vec3, Vec3, Vec3][] = [];
  for (let s = 0; s + 1 < N; s++) {
    // quad [up[s], up[s+1], lo[s+1], lo[s]] → 2 tris
    tris.push([up[s], up[s + 1], lo[s + 1]]);
    tris.push([up[s], lo[s + 1], lo[s]]);
  }
  return { tris, minLipSep };
}

/** Max perpendicular distance from the analytic ruled cliff-face to the wall mesh. */
function wallHausdorff(tris: [Vec3, Vec3, Vec3][], tLo: number, tHi: number, M: number): number {
  let maxD = 0;
  for (let j = 0; j <= M; j++) {
    const t = tLo + (tHi - tLo) * (j / M);
    const th = thetaEdge(t); const { upper, lower } = lips(t);
    for (const lam of [0, 0.25, 0.5, 0.75, 1]) {
      const r = lower + (upper - lower) * lam;
      const p = lift(th, t, r);
      let best = Infinity;
      for (const [a, b, c] of tris) { const d2 = distPtTri2(p, a, b, c); if (d2 < best) best = d2; }
      const d = Math.sqrt(best);
      if (d > maxD) maxD = d;
    }
  }
  return maxD;
}

/** 3D arc length of the cliff midline over [tLo,tHi] (for mm-spacing reporting). */
function arcLen(tLo: number, tHi: number, n = 2000): number {
  let L = 0; let prev: Vec3 | null = null;
  for (let j = 0; j <= n; j++) {
    const t = tLo + (tHi - tLo) * (j / n);
    const { upper, lower } = lips(t);
    const p = lift(thetaEdge(t), t, (upper + lower) / 2);
    if (prev) L += Math.sqrt(dot(sub(p, prev), sub(p, prev)));
    prev = p;
  }
  return L;
}

describe('WALL-SPIKE', () => {
  it.skipIf(process.env.PF_WALL_SPIKE !== '1')('double-valued wall closes CelticKnot snaking C0 to <0.01', () => {
    const tLo = 0.02, tHi = 0.98;
    const rA = buildRadiusFn('CelticKnot' as StyleId, {}, DIMS);

    /* eslint-disable no-console */
    // ---- (b) LIP / WATERTIGHT check + per-sample cliff VALIDATION ----
    // Confirm each traced point is a real C0 (numeric one-sided jump ≈ JUMP) and
    // the analytic lips equal the one-sided surface limits.
    const dLU = 1e-5; // tiny localU nudge → approaches the edge limit
    const dTheta = dLU * TAU / (2 * NUM_COLUMNS); // localU→theta scale
    let validated = 0, tested = 0, worstJumpErr = 0, minSep = Infinity;
    for (let s = 0; s <= 400; s++) {
      const t = tLo + (tHi - tLo) * (s / 400); tested++;
      const th = thetaEdge(t), z = t * DIMS.H;
      const rIn = rA(th - dTheta, z);   // ribbon side (toward centerline)
      const rOut = rA(th + dTheta, z);  // background side
      const jumpNum = rIn - rOut;
      const { upper, lower } = lips(t);
      minSep = Math.min(minSep, upper - lower);
      if (Math.abs(jumpNum - JUMP) < 0.01) {
        validated++;
        worstJumpErr = Math.max(worstJumpErr, Math.abs(jumpNum - JUMP));
        // analytic lips must match the one-sided surface limits
        worstJumpErr = Math.max(worstJumpErr, Math.abs(rIn - upper), Math.abs(rOut - lower));
      }
    }
    const coverage = validated / tested;
    console.log(`\n[wall-spike] LIP/WATERTIGHT: minLipSep ${minSep.toFixed(4)}mm (expect ~${JUMP})  analytic-vs-numeric lip err ${worstJumpErr.toFixed(5)}mm`);
    console.log(`[wall-spike] CLIFF COVERAGE: ${(coverage * 100).toFixed(1)}% of the traced edge is a validated C0 (jump≈${JUMP})`);

    // ---- (a) WALL CHORD convergence ----
    const L = arcLen(tLo, tHi);
    console.log(`[wall-spike] cliff arc length ${L.toFixed(1)}mm over t∈[${tLo},${tHi}]`);
    const curve: Array<{ N: number; spacingMm: number; wallErrMm: number }> = [];
    for (const N of [8, 16, 32, 64, 128, 256, 512]) {
      const { tris, minLipSep } = buildWall(N, tLo, tHi);
      const err = wallHausdorff(tris, tLo, tHi, 1500);
      const spacing = L / (N - 1);
      curve.push({ N, spacingMm: spacing, wallErrMm: err });
      console.log(`  N=${String(N).padStart(3)}  spacing ${spacing.toFixed(3)}mm  wallErr ${err.toFixed(4)}mm  (lipSep ${minLipSep.toFixed(3)})`);
    }

    // ---- verdict ----
    const finest = curve[curve.length - 1];
    const monotone = curve.every((c, i) => i === 0 || c.wallErrMm <= curve[i - 1].wallErrMm + 1e-9);
    const cross = curve.find((c) => c.wallErrMm < 0.01);
    const lipsOk = minSep > 0.5 * JUMP && worstJumpErr < 0.02 && coverage > 0.5;
    const pass = monotone && !!cross && cross.spacingMm >= 0.1 && lipsOk;
    console.log(`\n[wall-spike] ===== VERDICT =====`);
    console.log(`  monotone decreasing: ${monotone}`);
    console.log(`  crosses 0.01mm at: ${cross ? `N=${cross.N}, spacing ${cross.spacingMm.toFixed(3)}mm (${(cross.spacingMm / 0.5).toFixed(1)}× a ~0.5mm surface edge)` : 'NEVER (floors at ' + finest.wallErrMm.toFixed(4) + 'mm)'}`);
    console.log(`  lips distinct & watertight-weldable: ${lipsOk}`);
    console.log(`  ${pass ? '>>> PASS — double-valued wall MESHES the snaking C0 to <0.01 (mechanism GO)' : '>>> FAIL — mechanism NO-GO (see above)'}`);
    /* eslint-enable no-console */
    save('celticknot_wall', { dims: DIMS, cliff: { NUM_COLUMNS, STRAND_W, AMP, TIGHTNESS, JUMP }, coverage, minLipSep: minSep, lipErr: worstJumpErr, arcLenMm: L, curve, verdict: { monotone, cross, lipsOk, pass } });
  }, 600_000);
});
