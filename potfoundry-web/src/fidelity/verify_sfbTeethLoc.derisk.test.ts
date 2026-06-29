/**
 * verify_sfbTeethLoc.derisk.test.ts — WHERE are the serrated ridge teeth, and what are they?
 *
 * User confirms the retrofit STILL serrates at the feature ridge (locked crest slivers).
 * This pins the teeth: builds the exact-eval wall, finds the worst slivers (<5° / <2° 3D),
 * and reports for each population: theta distribution (SEAM theta≈0/2π vs PETAL-PERIOD
 * theta≈30°·k vs uniform), on-feature fraction (are they ON the locked crest?), and the
 * (u,t) ASPECT (du-span / dt-span → U-LONG anisotropic sliver?). Dumps 5 example teeth.
 * Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { buildConformingWall } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { STYLE_FUNCTIONS } from '../geometry/styles';
import { baseRadius } from '../geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../geometry/types';

const H = 120, R0 = 40, FL = 11;
type V3 = [number, number, number];
const RAD2DEG = 180 / Math.PI;
function minAngle3D(a: V3, b: V3, c: V3): number {
  const d = (p: V3, q: V3): number => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  const lab = d(a, b), lbc = d(b, c), lca = d(c, a);
  if (lab < 1e-12 || lbc < 1e-12 || lca < 1e-12) return 0;
  const law = (a1: number, a2: number, op: number): number => Math.acos(Math.max(-1, Math.min(1, (a1 * a1 + a2 * a2 - op * op) / (2 * a1 * a2))));
  return Math.min(law(lca, lab, lbc), law(lab, lbc, lca), law(lbc, lca, lab)) * RAD2DEG;
}

describe.skipIf(!process.env.PF_DERISK)('SFB ridge teeth — location + shape census', () => {
  it('locates the worst slivers: seam vs petal-ridge, on-feat, U-long aspect', () => {
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
    const featLines: FeatureLine[] = graph.lines.filter((l) => l.kind === 'general-curve').map((c, i) => ({ kind: 'general-curve', label: `c${i}`, points: c.points.map((p) => ({ u: p.u, t: p.t })) }));
    const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, { H, Rt: R0, Rb: R0, expn: 1 });
    const w = buildConformingWall(sampler, {
      maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12,
      resU: 128, resT: 128, nRing: 1 << FL, surfaceId: 0, featureLines: featLines, featureLevel: FL,
      targetTriangles: 6_000_000, budgetMode: 'cap', uBias: 2,
    });
    const radiusFn = STYLE_FUNCTIONS['SuperformulaBlossom'];
    const opts = { ...DEFAULT_STYLE_PARAMS['SuperformulaBlossom'], sf_strength: 1 };
    const exactPos = (u: number, t: number): V3 => { const z = t * H, r0 = baseRadius(z, H, R0, R0, 1, opts), th = 2 * Math.PI * u, r = radiusFn(th, z, r0, H, opts); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const nV = w.vertices.length / 3;
    const uv = new Float64Array(nV * 2); const P: V3[] = new Array(nV);
    for (let i = 0; i < nV; i++) { const u = w.vertices[i * 3], t = w.vertices[i * 3 + 1]; uv[i * 2] = u; uv[i * 2 + 1] = t; P[i] = exactPos(u, t); }

    // on-feature marking (EPS_UT tight = the crest row only).
    const EPS_UT = 2e-4;
    const onFeat = new Uint8Array(nV);
    for (const fl of featLines) {
      let uMin = 1, uMax = 0, tMin = 1, tMax = 0;
      for (const p of fl.points) { uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u); tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); }
      for (let v = 0; v < nV; v++) { const u = uv[v * 2], t = uv[v * 2 + 1]; if (u < uMin - EPS_UT || u > uMax + EPS_UT || t < tMin - EPS_UT || t > tMax + EPS_UT) continue;
        for (let s = 0; s + 1 < fl.points.length; s++) { const ax = fl.points[s].u, ay = fl.points[s].t, bx = fl.points[s + 1].u, by = fl.points[s + 1].t; if (Math.abs(bx - ax) > 0.5) continue; const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12; let hh = ((u - ax) * dx + (t - ay) * dy) / L2; hh = Math.max(0, Math.min(1, hh)); if (Math.hypot(u - (ax + hh * dx), t - (ay + hh * dy)) < EPS_UT) { onFeat[v] = 1; break; } }
      }
    }

    const idx = w.indices;
    const cats = { lt5: 0, lt2: 0 };
    const stat = (key: 'lt5' | 'lt2'): { n: number; seam: number; onF: number; uLong: number; petal: number; ex: string[] } => ({ n: 0, seam: 0, onF: 0, uLong: 0, petal: 0, ex: [] });
    const S5 = stat('lt5'), S2 = stat('lt2');
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f], b = idx[f + 1], c = idx[f + 2];
      const cx = (P[a][0] + P[b][0] + P[c][0]) / 3, cy = (P[a][1] + P[b][1] + P[c][1]) / 3, cz = (P[a][2] + P[b][2] + P[c][2]) / 3;
      const cr = Math.hypot(cx, cy); if (!(cr > 42 && cz >= 8 && cz <= 112)) continue;
      const ang = minAngle3D(P[a], P[b], P[c]); if (ang >= 5) continue; cats.lt5++;
      const th = ((Math.atan2(cy, cx) * 180 / Math.PI) + 360) % 360;
      const seamD = Math.min(th, 360 - th); // deg from seam
      const petalD = Math.min(...[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360].map((k) => Math.abs(th - k)));
      const uS = Math.max(uv[a * 2], uv[b * 2], uv[c * 2]) - Math.min(uv[a * 2], uv[b * 2], uv[c * 2]);
      const tS = Math.max(uv[a * 2 + 1], uv[b * 2 + 1], uv[c * 2 + 1]) - Math.min(uv[a * 2 + 1], uv[b * 2 + 1], uv[c * 2 + 1]);
      const onF = (onFeat[a] || onFeat[b] || onFeat[c]) ? 1 : 0;
      const rec = (S: ReturnType<typeof stat>): void => { S.n++; if (seamD < 1.5) S.seam++; if (onF) S.onF++; if (uS > 3 * tS + 1e-9) S.uLong++; if (petalD < 1.5 && seamD >= 1.5) S.petal++; if (S.ex.length < 5 && S === S2) S.ex.push(`θ=${th.toFixed(1)} z=${cz.toFixed(0)} ang=${ang.toFixed(2)} uSpan=${uS.toExponential(1)} tSpan=${tS.toExponential(1)} onFeat=${onF}`); };
      rec(S5); if (ang < 2) { cats.lt2++; rec(S2); }
    }
    const pc = (x: number, n: number): string => `${(100 * x / Math.max(n, 1)).toFixed(0)}%`;
    /* eslint-disable no-console */
    console.log(`[TEETH <5°] n=${S5.n} | seam(θ<1.5°)=${pc(S5.seam, S5.n)} petal-ridge=${pc(S5.petal, S5.n)} | on-feat(crest)=${pc(S5.onF, S5.n)} | U-long(uSpan>3·tSpan)=${pc(S5.uLong, S5.n)}`);
    console.log(`[TEETH <2°] n=${S2.n} | seam=${pc(S2.seam, S2.n)} petal-ridge=${pc(S2.petal, S2.n)} | on-feat=${pc(S2.onF, S2.n)} | U-long=${pc(S2.uLong, S2.n)}`);
    for (const e of S2.ex) console.log(`   eg: ${e}`);
    /* eslint-enable no-console */
    expect(S5.n).toBeGreaterThan(0);
  }, 600000);
});
