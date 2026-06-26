// PROBE (diagnostic, PF_DERISK) — attribute the SFB@1 crest slivers to the
// triangulation template (TRI_SOURCE) that produced them, on the REAL production
// per-cell path: extractAnalyticFeatures('SuperformulaBlossom', surfaceFidelityExact)
// → buildConformingWall (the same triangulateQuadtreeWithFeatures the export runs).
// Pure CPU, analytic styleSampler — no GPU. The question this answers (task #18):
// are the <20deg crest slivers FCT_FEATURE_CDT (the per-cell CDT we plan to graft
// strip-pave into)? If yes, the graft is the right lever; if not, redirect.
import { describe, it } from 'vitest';
import { buildConformingWall } from './ConformingWall';
import { extractAnalyticFeatures, type FeatureLine } from './FeatureLineGraph';
import { TRI_SOURCE } from './QuadtreeTriangulator';
import { computeUBias } from './WatertightAssembly';
import { styleSampler } from './featureGraph/styleSampler';
import type { SurfaceSampler } from './SurfaceSampler';
import { buildStyleParamPayload } from '../../../../utils/styleParams';

const SOURCE_NAME: Record<number, string> = {
  0: 'PLAIN_QUAD', 1: 'TRANSITION_FAN', 2: 'EAR_CLIP', 3: 'FCT_PLAIN_QUAD',
  4: 'FCT_PLAIN_FAN', 5: 'FCT_FEATURE_CDT', 6: 'RING_OR_CAP', 7: 'FCT_EAR_CLIP',
};

const DIMS = { H: 120, Rt: 40, Rb: 40, expn: 1 };

function minAngle3D(
  p: readonly [number, number, number],
  q: readonly [number, number, number],
  r: readonly [number, number, number],
): number {
  const d = (x: readonly number[], y: readonly number[]): number =>
    Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  const A = d(q, r), B = d(r, p), C = d(p, q);
  if (A < 1e-12 || B < 1e-12 || C < 1e-12) return 0;
  const ang = (o1: number, o2: number, op: number): number =>
    Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - op * op) / (2 * o1 * o2))));
  return Math.min(ang(B, C, A), ang(A, C, B), ang(A, B, C)) * (180 / Math.PI);
}

function runAtUBias(
  sampler: SurfaceSampler,
  generalCurves: FeatureLine[],
  uBias: number,
): void {
  const wall = buildConformingWall(sampler, {
    maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.1, gradeRatio: 2,
    maxLevel: 11, resU: 128, resT: 128, nRing: 256,
    surfaceId: 0,
    featureLines: generalCurves,
    featureLevel: 9,
    targetTriangles: 6_000_000, budgetMode: 'cap',
    uBias,
    efgSampler: sampler,
  });

  const idx = wall.indices;
  const vtx = wall.vertices; // packed (u,t,surfaceId)
  const src = wall.triangleSource;
  const nTri = idx.length / 3;

  const below1: Record<number, number> = {};
  const below10: Record<number, number> = {};
  const below20: Record<number, number> = {};
  const total: Record<number, number> = {};
  let worst = 180, worstSrc = -1;
  let allBelow20 = 0, allBelow10 = 0, allBelow1 = 0, allTotal = 0;
  for (let t = 0; t < nTri; t++) {
    const ia = idx[t * 3] * 3, ib = idx[t * 3 + 1] * 3, ic = idx[t * 3 + 2] * 3;
    const pa = sampler.position(vtx[ia], vtx[ia + 1]);
    const pb = sampler.position(vtx[ib], vtx[ib + 1]);
    const pc = sampler.position(vtx[ic], vtx[ic + 1]);
    const ang = minAngle3D(pa, pb, pc);
    const so = src ? src[t] : -1;
    total[so] = (total[so] ?? 0) + 1;
    allTotal++;
    if (ang < 20) { below20[so] = (below20[so] ?? 0) + 1; allBelow20++; }
    if (ang < 10) { below10[so] = (below10[so] ?? 0) + 1; allBelow10++; }
    if (ang < 1) { below1[so] = (below1[so] ?? 0) + 1; allBelow1++; }
    if (ang < worst) { worst = ang; worstSrc = so; }
  }
  const fmt = (h: Record<number, number>): string =>
    Object.entries(h).map(([k, v]) => `${SOURCE_NAME[+k] ?? k}=${v}`).join(' ');
  const cdt = TRI_SOURCE.FCT_FEATURE_CDT;
  const share = (n: number, d: number): string => (d > 0 ? ((n / d) * 100).toFixed(1) : '0.0');
  /* eslint-disable no-console */
  console.log(
    `\n[SFB@1 uBias=${uBias}] tris=${nTri} worst=${worst.toFixed(3)}deg (src=${SOURCE_NAME[worstSrc] ?? worstSrc}) ` +
    `cdtStats=${JSON.stringify(wall.cdtStats ? { inv: wall.cdtStats.inversions, drop: wall.cdtStats.drops } : null)}`,
  );
  console.log(`  whole-wall: <20=${allBelow20}(${share(allBelow20, allTotal)}%) <10=${allBelow10}(${share(allBelow10, allTotal)}%) <1=${allBelow1}`);
  console.log(`  total:  ${fmt(total)}`);
  console.log(`  <20deg: ${fmt(below20)}`);
  console.log(`  <10deg: ${fmt(below10)}`);
  console.log(`  <1deg:  ${fmt(below1)}`);
  console.log(
    `  >>> FCT_FEATURE_CDT share — <20:${share(below20[cdt] ?? 0, allBelow20)}% ` +
    `<10:${share(below10[cdt] ?? 0, allBelow10)}% <1:${share(below1[cdt] ?? 0, allBelow1)}%`,
  );
  /* eslint-enable no-console */
}

describe.skipIf(!process.env.PF_DERISK)('SFB@1 sliver source probe (real per-cell path)', () => {
  it('sweeps uBias and histograms <20/<10/<1deg slivers by TRI_SOURCE', () => {
    // ── Real SFB@1 crest feature lines (the production extractor, exact flag). ──
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const graph = extractAnalyticFeatures(
      'SuperformulaBlossom', Float32Array.from(packed),
      { H: DIMS.H, Rt: DIMS.Rt, Rb: DIMS.Rb },
      { surfaceFidelityExact: true },
    );
    const generalCurves: FeatureLine[] = graph.lines.filter((l) => l.kind === 'general-curve');

    // ── The CPU analytic SFB surface (3D eval + sizing). ──
    const sampler: SurfaceSampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, DIMS);

    // Relief sanity + the production uBias for THIS sampler (feature-inserting).
    let rMin = Infinity, rMax = -Infinity;
    for (let u = 0; u < 1; u += 1 / 256) {
      for (let t = 0; t < 1; t += 1 / 64) {
        const [x, y] = sampler.position(u, t);
        const r = Math.hypot(x, y);
        if (r < rMin) rMin = r;
        if (r > rMax) rMax = r;
      }
    }
    const prodUBias = computeUBias(sampler, true);
    /* eslint-disable no-console */
    console.log(
      `[SFB@1 PROBE] curves=${generalCurves.length} relief r=[${rMin.toFixed(2)},${rMax.toFixed(2)}] ` +
      `(Δ=${(rMax - rMin).toFixed(2)}mm) production computeUBias(sampler,hasFeatures)=${prodUBias}`,
    );
    /* eslint-enable no-console */

    for (const b of [0, 1, 2]) runAtUBias(sampler, generalCurves, b);
  }, 600000);
});
