/**
 * _diag_sfbCuspFold.derisk.test.ts — READ-ONLY diagnostic (no production edits).
 *
 * Rebuilds the SFB@1 sharp outer wall via buildConformingWall (same opts as the
 * STL under test), then measures, per stored (u,t) vertex/triangle:
 *
 *  (A) cdtStats: the (u,t)-space winding-inversion + zero-area-drop counters the
 *      per-cell CDT already records (ConstrainedCellTriangulator.normalizeWinding).
 *  (B) 3D-INVERTED triangles: reconstruct each triangle's 3D positions via
 *      sampler.position(u,t), compute its 3D face normal, and compare to the TRUE
 *      outward surface normal (∂P/∂u × ∂P/∂t, oriented outward radially) at the
 *      triangle centroid. dot<0 ⇒ the triangle is FLIPPED in 3D even though the
 *      per-cell CDT made it CCW in (u,t). This is the cusp-fold signal: a cell
 *      well-shaped in (u,t) maps to an inverted shape in 3D under the extreme
 *      valley Jacobian.
 *  (C) Localize the 3D-inverted tris: their centroid (theta=atan2(y,x), z) and
 *      whether they sit in a deep valley (radius near min) vs a ridge.
 *  (D) Jacobian magnitude |∂P/∂u| at the inverted-tri centroids vs mesh-wide.
 *
 * Pure CPU, PF_DERISK gated. Does NOT touch production source.
 */
import { describe, it, expect } from 'vitest';
import { styleSampler, type StyleId } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { buildConformingWall } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import type { SurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const H = 120, R0 = 40;
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const FL = 11;

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

describe.skipIf(!process.env.PF_DERISK)('SFB@1 cusp-fold 3D-inversion diagnostic', () => {
  it('counts (u,t)-CCW-but-3D-inverted triangles and localizes them', () => {
    const opts = { sf_strength: 1 };
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', opts);
    const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
    const featLines: FeatureLine[] = graph.lines
      .filter((l) => l.kind === 'general-curve')
      .map((c, i) => ({ kind: 'general-curve' as const, label: `c${i}`, points: c.points.map((p) => ({ u: p.u, t: p.t })) }));
    const sampler: SurfaceSampler = styleSampler('SuperformulaBlossom' as StyleId, opts, STYLE_DIMS);
    const w = buildConformingWall(sampler, {
      maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12,
      resU: 128, resT: 128, nRing: 1 << FL, surfaceId: 0, featureLines: featLines, featureLevel: FL,
      targetTriangles: 6_000_000, budgetMode: 'cap', uBias: 2,
    });

    const v = w.vertices, idx = w.indices, nTri = idx.length / 3;
    const cdt = w.cdtStats;
    // eslint-disable-next-line no-console
    console.log(`[diag] tris=${nTri} verts=${v.length / 3}`);
    // eslint-disable-next-line no-console
    console.log(`[diag][A cdtStats (u,t)-space] inversions=${cdt?.inversions ?? 'n/a'} drops=${cdt?.drops ?? 'n/a'} incidents=${cdt?.incidents?.length ?? 0}`);

    // True outward surface normal at (u,t) via central-difference Jacobian.
    const EPS = 1e-5;
    const pos = (u: number, t: number): V3 => { const r = sampler.position(u, t); return [r[0], r[1], r[2]]; };
    const trueNormalAndJac = (u: number, t: number): { n: V3; juLen: number; jtLen: number } => {
      const uu = Math.min(1 - EPS, Math.max(EPS, u));
      const tt = Math.min(1 - EPS, Math.max(EPS, t));
      const pu1 = pos(uu + EPS, tt), pu0 = pos(uu - EPS, tt);
      const pt1 = pos(uu, tt + EPS), pt0 = pos(uu, tt - EPS);
      const ju: V3 = sub(pu1, pu0);   // ∂P/∂u * 2EPS
      const jt: V3 = sub(pt1, pt0);   // ∂P/∂t * 2EPS
      let n = cross(ju, jt);
      // Orient outward: radial direction at the point.
      const p = pos(uu, tt);
      const radial: V3 = [p[0], p[1], 0];
      if (dot(n, radial) < 0) n = [-n[0], -n[1], -n[2]];
      return { n, juLen: len(ju) / (2 * EPS), jtLen: len(jt) / (2 * EPS) };
    };

    let inv3D = 0, ok3D = 0, degen3D = 0;
    const invTheta: number[] = [], invZ: number[] = [], invR: number[] = [];
    const invJu: number[] = [], allJuSample: number[] = [];
    const invAreaRatio: number[] = []; // |3D area| / |(u,t) area scaled| crude fold metric
    // also gather min wall radius for "valley vs ridge" classification
    let rMin = 1e9, rMax = 0;

    for (let tIdx = 0; tIdx < nTri; tIdx++) {
      const ia = idx[tIdx * 3], ib = idx[tIdx * 3 + 1], ic = idx[tIdx * 3 + 2];
      const ua = v[ia * 3], ta = v[ia * 3 + 1];
      const ub = v[ib * 3], tb = v[ib * 3 + 1];
      const uc = v[ic * 3], tc = v[ic * 3 + 1];
      const pa = pos(ua, ta), pb = pos(ub, tb), pc = pos(uc, tc);
      const fn = cross(sub(pb, pa), sub(pc, pa)); // 3D face normal (CCW in (u,t) winding)
      const fl = len(fn);
      // centroid + true normal
      const um = (ua + ub + uc) / 3, tm = (ta + tb + tc) / 3;
      const cx = (pa[0] + pb[0] + pc[0]) / 3, cy = (pa[1] + pb[1] + pc[1]) / 3, cz = (pa[2] + pb[2] + pc[2]) / 3;
      const cr = Math.hypot(cx, cy);
      // outer-wall filter (same as the reference analyzer): r>42, z in [8,112]
      const outer = cr > 42 && cz > 8 && cz < 112;
      if (!outer) continue;
      if (cr < rMin) rMin = cr; if (cr > rMax) rMax = cr;
      if (fl < 1e-12) { degen3D++; continue; }
      const tn = trueNormalAndJac(um, tm);
      const tnl = len(tn.n);
      if (tnl < 1e-12) { degen3D++; continue; }
      const d = dot(fn, tn.n) / (fl * tnl);
      if ((tIdx & 31) === 0) allJuSample.push(tn.juLen);
      invAreaRatio.push(d); // reuse: collect ALL cosines for robustness histogram
      if (d < 0) {
        inv3D++;
        invTheta.push(Math.atan2(cy, cx) * 180 / Math.PI);
        invZ.push(cz);
        invR.push(cr);
        invJu.push(tn.juLen);
      } else ok3D++;
    }

    const total = inv3D + ok3D;
    // eslint-disable-next-line no-console
    console.log(`[diag][B 3D-inversion OUTER WALL] tris=${total} inverted=${inv3D} (${(100 * inv3D / Math.max(1, total)).toFixed(3)}%) degenerate=${degen3D}`);
    // eslint-disable-next-line no-console
    console.log(`[diag] wall radius range r=[${rMin.toFixed(2)}, ${rMax.toFixed(2)}] (valley=rMin ridge=rMax)`);
    if (inv3D > 0) {
      // classify inverted tris: valley-proximate iff cr within 15% of (rMax-rMin) above rMin
      const valleyCut = rMin + 0.15 * (rMax - rMin);
      const inValley = invR.filter((r) => r <= valleyCut).length;
      const onRidge = invR.filter((r) => r >= rMax - 0.15 * (rMax - rMin)).length;
      // eslint-disable-next-line no-console
      console.log(`[diag][C location of inverted tris] valley(<=${valleyCut.toFixed(2)})=${inValley} ridge(>=${(rMax - 0.15 * (rMax - rMin)).toFixed(2)})=${onRidge} mid=${inv3D - inValley - onRidge}`);
      // eslint-disable-next-line no-console
      console.log(`[diag] inverted r: p1=${pct(invR, 0.01).toFixed(2)} p50=${pct(invR, 0.5).toFixed(2)} p99=${pct(invR, 0.99).toFixed(2)}`);
      // eslint-disable-next-line no-console
      console.log(`[diag] inverted z: p1=${pct(invZ, 0.01).toFixed(1)} p50=${pct(invZ, 0.5).toFixed(1)} p99=${pct(invZ, 0.99).toFixed(1)}`);
      // theta histogram into 12 petals worth of bins (sf petals; show spread)
      const thetaAbs = invTheta.map((x) => ((x % 30) + 30) % 30); // fold to 30° cell
      // eslint-disable-next-line no-console
      console.log(`[diag] inverted theta mod30: p10=${pct(thetaAbs, 0.1).toFixed(1)} p50=${pct(thetaAbs, 0.5).toFixed(1)} p90=${pct(thetaAbs, 0.9).toFixed(1)}`);
      // eslint-disable-next-line no-console
      console.log(`[diag][D Jacobian |dP/du|] inverted-tri: p50=${pct(invJu, 0.5).toFixed(3)} p99=${pct(invJu, 0.99).toFixed(3)} max=${pct(invJu, 1).toFixed(3)} | mesh sample: p50=${pct(allJuSample, 0.5).toFixed(3)} p99=${pct(allJuSample, 0.99).toFixed(3)} max=${pct(allJuSample, 1).toFixed(3)}`);
    }

    // Robustness: how strongly negative are the inverted cosines? (rule out EPS noise)
    const negs = invAreaRatio.filter((x) => x < 0);
    // eslint-disable-next-line no-console
    console.log(`[diag][robust] cos(face,trueN) over inverted: p1=${pct(negs, 0.01).toFixed(3)} p50=${pct(negs, 0.5).toFixed(3)} p99=${pct(negs, 0.99).toFixed(3)} (near 0 ⇒ EPS-grazing; near -1 ⇒ hard fold)`);
    // eslint-disable-next-line no-console
    console.log(`[diag][robust] inverted with cos<-0.5 (hard folds): ${negs.filter((x) => x < -0.5).length} / cos<-0.9: ${negs.filter((x) => x < -0.9).length}`);

    expect(total).toBeGreaterThan(0);
  }, 600000);
});
