/**
 * verify_sfbCuspUbias.derisk.test.ts — localize the corridor↔uBias crash.
 *
 * The hole-fill corridor welds 0/0 at uBias=0 but extractHoleBoundary crashes at
 * uBias=2 ("degree 4 — not simple loops"). Sweep uBias on a SINGLE SFB cusp to
 * isolate: single-band footprint pinch (anisotropic cells) vs multi-band touch.
 * Reports per-uBias outcome (crash / holeLoops / tJ). Pure CPU, PF_DERISK.
 */
import { describe, it } from 'vitest';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { realFeatureCorridor, realFeatureCorridorPerLoop, type MultiFeatureSpec } from './bandRemesh/realCorridor';
import { auditWatertight, type Mesh3 } from './bandRemesh/audit';
import type { UTPoint } from './bandRemesh/corridorPave';

const H = 120, R0 = 40, TBOTTOM = 6;
const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };

function allCusps(): UTPoint[][] {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
  const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
  const out: Array<{ pts: UTPoint[]; uMid: number }> = [];
  for (const c of graph.lines.filter((l) => l.kind === 'general-curve')) {
    const pts = c.points; if (pts.length < 8) continue;
    let tMin = 1, tMax = 0, uMin = 1, uMax = 0, seam = false;
    for (let k = 0; k < pts.length; k++) { const p = pts[k]; tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) seam = true; }
    if (seam || uMin < 0.08 || uMax > 0.92 || tMax - tMin < 0.5) continue;
    const sub = pts.filter((p) => p.t >= 0.12 && p.t <= 0.88).map((p) => ({ u: p.u, t: p.t }));
    if (sub.length >= 4) out.push({ pts: sub, uMid: sub[Math.floor(sub.length / 2)].u });
  }
  out.sort((a, b) => a.uMid - b.uMid);
  return out.map((o) => o.pts);
}

function pickCusp(): UTPoint[] {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
  const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
  let best: UTPoint[] | null = null, bestSpan = -1;
  for (const c of graph.lines.filter((l) => l.kind === 'general-curve')) {
    const pts = c.points; if (pts.length < 8) continue;
    let tMin = 1, tMax = 0, uMin = 1, uMax = 0, seam = false, span = 0;
    for (let k = 0; k < pts.length; k++) { const p = pts[k]; tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); if (k > 0) { const du = Math.abs(pts[k].u - pts[k - 1].u); if (du > 0.5) seam = true; span += Math.hypot(Math.min(du, 1 - du), pts[k].t - pts[k - 1].t); } }
    if (seam || uMin < 0.1 || uMax > 0.9 || tMax - tMin < 0.5) continue;
    if (span > bestSpan) { bestSpan = span; best = pts.map((p) => ({ u: p.u, t: p.t })); }
  }
  return best!.filter((p) => p.t >= 0.12 && p.t <= 0.88);
}

describe.skipIf(!process.env.PF_DERISK)('SFB single-cusp corridor — uBias sweep', () => {
  const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, STYLE_DIMS);
  const cusp = pickCusp();

  it('sweeps uBias 0/1/2 on ONE cusp (isolates the degree-4 crash)', () => {
    for (const uBias of [0, 1, 2, 3]) {
      let outcome = '';
      try {
        const r = realFeatureCorridor(sampler, cusp, {
          featureLevel: 11, widthMm: 3, dims: DIMS,
          baseOptions: { maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12, resU: 128, resT: 128, nRing: 1 << 11, targetTriangles: 6_000_000, budgetMode: 'cap', uBias },
        });
        const positions = new Float32Array(r.merged.vertexUT.length * 3);
        for (let i = 0; i < r.merged.vertexUT.length; i++) { const p = sampler.position(r.merged.vertexUT[i][0], r.merged.vertexUT[i][1]); positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2]; }
        const mesh: Mesh3 = { positions, indices: new Uint32Array(r.merged.indices) };
        const audit = auditWatertight(mesh, { boundaryVertexIndices: r.merged.ringVertexIds });
        outcome = `holeLoops=${r.hole.loops.length} fillTris=${r.paved.triangles.length} nonMan=${audit.nonManifoldEdges} tJ=${audit.tJunctions}`;
      } catch (e) {
        outcome = `CRASH: ${String((e as Error).message).slice(0, 110)}`;
      }
      // eslint-disable-next-line no-console
      console.log(`[single uBias=${uBias}] ${outcome}`);
    }
  }, 600000);

  it('MULTI: well-separated pairs + full set at uBias=0 vs 2 (touching vs transition bug)', () => {
    const all = allCusps();
    // The two MOST-separated cusps (first + last by uMid) — they cannot touch.
    const farPair: MultiFeatureSpec[] = [{ polyline: all[0] }, { polyline: all[all.length - 1] }];
    // An ADJACENT pair (most likely to touch).
    const adjPair: MultiFeatureSpec[] = [{ polyline: all[0] }, { polyline: all[1] }];
    const cases: Array<[string, MultiFeatureSpec[]]> = [['far-pair', farPair], ['adj-pair', adjPair], ['all', all.map((p) => ({ polyline: p }))]];
    for (const uBias of [0, 2]) {
      for (const [name, specs] of cases) {
        let outcome = '';
        try {
          const r = realFeatureCorridorPerLoop(sampler, specs, {
            featureLevel: 11, widthMm: 3, dims: DIMS,
            baseOptions: { maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12, resU: 128, resT: 128, nRing: 1 << 11, targetTriangles: 6_000_000, budgetMode: 'cap', uBias },
          });
          outcome = `holeLoops=${r.hole.loops.length} fillTris=${r.paved.triangles.length}`;
        } catch (e) {
          outcome = `CRASH: ${String((e as Error).message).slice(0, 90)}`;
        }
        // eslint-disable-next-line no-console
        console.log(`[multi uBias=${uBias} ${name}] ${outcome}`);
      }
    }
  }, 600000);
});
