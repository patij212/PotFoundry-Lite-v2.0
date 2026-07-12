// _featureAlignedCrossStyle.probe.test.ts — PROBE (PF_FACROSS) — sliver-frontier accelerator arm.
//
// featureAlignedCell.ts (per-cell strip-pave, __pfFeatureAlignedCells) was measured on
// SuperformulaBlossom ONLY (commits 9b8d94f7/999f3a0b/e7d4e8ab, 2026-06-26):
//   - fL9 (screen):        PARTIAL  — <1deg -91%, <10deg -22%, but <20deg TOTAL +34% (regression)
//   - fL11 (PRODUCTION):   NO-GO    — <20deg +25% (CPU probe) AND +1.1pp band<15 (real GPU export
//                          A/B). Worst min-angle UNCHANGED (0.184/0.22deg) because strip-pave SKIPS
//                          exactly the worst near-corner cells (ridge too short to subdivide).
//                          Graft stays flag-gated default-OFF; "reaching >=20deg needs vertices ON
//                          shared cell edges (railLines), i.e. a band that SPANS cells" (e7d4e8ab).
//
// FIX-PHASE-VERDICT.md (2026-07-12) separately names Gothic (19% <20deg) and DragonScales
// (96% <20deg quality) as a "flat-P1 needle" frontier assigned to curved-elements (Phase-2). BUT
// those numbers come from a DIFFERENT code path — the standalone "perfect mesher" research
// prototype (research/bridge/_pf_perfectMesherBruteLib.ts + buildDirectCrestStrip), NOT
// buildConformingWall/FeatureConformingTriangulator (the production path featureAlignedCell
// grafts into). This probe runs the ACTUAL production conforming-wall path on GothicArches and
// DragonScales, __pfFeatureAlignedCells OFF vs ON, at the PRODUCTION featureLevel=11 (the decisive
// e7d4e8ab check), using the SAME instrument as the rest of the lab
// (triangleQualityDistribution + auditNonManByIndex from labkit) so the SFB verdict's mechanism
// (per-cell graft can't reach the worst cells; keep-better trades catastrophic needles for mild
// slivers) is checked for generality — or refuted — on a second/third style class.
//
// Env-gated (PF_FACROSS=1), one it() per style (independently resumable/checkpointed — each
// style's OFF/ON pair logs immediately on completion). Pure CPU, analytic styleSampler, no GPU.
import { describe, it } from 'vitest';
import { buildConformingWall } from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import { extractAnalyticFeatures } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { TRI_SOURCE } from '../../src/renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { SurfaceSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { buildStyleParamPayload } from '../../src/utils/styleParams';
import { triangleQualityDistribution, auditNonManByIndex } from './labkit';

const SOURCE_NAME: Record<number, string> = {
  0: 'PLAIN_QUAD', 1: 'TRANSITION_FAN', 2: 'EAR_CLIP', 3: 'FCT_PLAIN_QUAD',
  4: 'FCT_PLAIN_FAN', 5: 'FCT_FEATURE_CDT', 6: 'RING_OR_CAP', 7: 'FCT_EAR_CLIP',
};

interface StyleCase { name: string; dims: { H: number; Rt: number; Rb: number; expn: number } }
const CASES: StyleCase[] = [
  { name: 'GothicArches', dims: { H: 120, Rt: 50, Rb: 40, expn: 1 } },
  { name: 'DragonScales', dims: { H: 120, Rt: 40, Rb: 40, expn: 1 } },
];

function buildXyzFlat(sampler: SurfaceSampler, vtx: Float32Array | Float64Array): Float64Array {
  const nV = vtx.length / 3;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const p = sampler.position(vtx[i * 3], vtx[i * 3 + 1]);
    xyz[i * 3] = p[0]; xyz[i * 3 + 1] = p[1]; xyz[i * 3 + 2] = p[2];
  }
  return xyz;
}

function runMode(
  styleName: string,
  sampler: SurfaceSampler,
  lines: ReturnType<typeof extractAnalyticFeatures>['lines'],
  uBias: number,
  featureLevel: number,
  stripPave: boolean,
): void {
  const g = globalThis as {
    __pfConformingRefine?: boolean;
    __pfFeatureAlignedCells?: boolean;
    __pfFeatureAlignedStats?: { tried: number; improved: number };
  };
  if (stripPave) {
    g.__pfConformingRefine = true;
    g.__pfFeatureAlignedCells = true;
    g.__pfFeatureAlignedStats = { tried: 0, improved: 0 };
  }
  const wall = buildConformingWall(sampler, {
    maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.1, gradeRatio: 2,
    maxLevel: 11, resU: 128, resT: 128, nRing: 256,
    surfaceId: 0,
    featureLines: lines,
    featureLevel,
    targetTriangles: 6_000_000, budgetMode: 'cap',
    uBias,
    efgSampler: sampler,
  });
  const faStats = g.__pfFeatureAlignedStats;
  if (stripPave) {
    g.__pfConformingRefine = undefined;
    g.__pfFeatureAlignedCells = undefined;
    g.__pfFeatureAlignedStats = undefined;
  }

  const idx = wall.indices;
  const vtx = wall.vertices;
  const src = wall.triangleSource;
  const nTri = idx.length / 3;
  const xyz = buildXyzFlat(sampler, vtx);
  const quality = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);

  // Per-source breakdown (same instrument as sfbSliversBySource, for mechanism parity).
  const below20: Record<number, number> = {};
  const below10: Record<number, number> = {};
  const below1: Record<number, number> = {};
  let allBelow1 = 0;
  const d = (x: readonly number[], y: readonly number[]): number =>
    Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  for (let t = 0; t < nTri; t++) {
    const ia = idx[t * 3], ib = idx[t * 3 + 1], ic = idx[t * 3 + 2];
    const pa = [xyz[ia * 3], xyz[ia * 3 + 1], xyz[ia * 3 + 2]] as const;
    const pb = [xyz[ib * 3], xyz[ib * 3 + 1], xyz[ib * 3 + 2]] as const;
    const pc = [xyz[ic * 3], xyz[ic * 3 + 1], xyz[ic * 3 + 2]] as const;
    const A = d(pb, pc), B = d(pc, pa), C = d(pa, pb);
    let ang = 0;
    if (A > 1e-12 && B > 1e-12 && C > 1e-12) {
      const acos = (o1: number, o2: number, op: number): number =>
        Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - op * op) / (2 * o1 * o2))));
      ang = Math.min(acos(B, C, A), acos(A, C, B), acos(A, B, C)) * (180 / Math.PI);
    }
    const so = src ? src[t] : -1;
    if (ang < 20) below20[so] = (below20[so] ?? 0) + 1;
    if (ang < 10) below10[so] = (below10[so] ?? 0) + 1;
    if (ang < 1) { below1[so] = (below1[so] ?? 0) + 1; allBelow1++; }
  }
  const fmt = (h: Record<number, number>): string =>
    Object.entries(h).map(([k, v]) => `${SOURCE_NAME[+k] ?? k}=${v}`).join(' ');
  const cdt = TRI_SOURCE.FCT_FEATURE_CDT;
  const share = (n: number, dd: number): string => (dd > 0 ? ((n / dd) * 100).toFixed(1) : '0.0');

  /* eslint-disable no-console */
  console.log(
    `\n[FACROSS ${styleName} fL${featureLevel} uBias=${uBias}${stripPave ? ' +STRIPPAVE' : ' (baseline)'}] ` +
    `tris=${nTri} minAngleDeg=${quality.minAngleDeg} pctBelow10=${quality.pctBelow10} ` +
    `pctBelow20=${quality.pctBelow20} pctBelow30=${quality.pctBelow30} nonManByIndex=${nonMan} ` +
    `below1total=${allBelow1}` +
    (faStats ? ` stripPaveStats(tried=${faStats.tried} improved=${faStats.improved})` : ''),
  );
  console.log(`  <20deg by source: ${fmt(below20)}`);
  console.log(`  <10deg by source: ${fmt(below10)}`);
  console.log(`  <1deg  by source: ${fmt(below1)}`);
  console.log(
    `  >>> FCT_FEATURE_CDT share — <20:${share(below20[cdt] ?? 0, Object.values(below20).reduce((a, b) => a + b, 0))}% ` +
    `<10:${share(below10[cdt] ?? 0, Object.values(below10).reduce((a, b) => a + b, 0))}% ` +
    `<1:${share(below1[cdt] ?? 0, allBelow1)}%`,
  );
  /* eslint-enable no-console */
}

describe.skipIf(!process.env.PF_FACROSS)('featureAlignedCell cross-style sliver-frontier probe (real production buildConformingWall path)', () => {
  for (const c of CASES) {
    it(`${c.name}: production fL11 strip-pave OFF vs ON (real per-cell path, honest instrument)`, () => {
      const [, packed] = buildStyleParamPayload(c.name, {});
      const graph = extractAnalyticFeatures(
        c.name, Float32Array.from(packed),
        { H: c.dims.H, Rt: c.dims.Rt, Rb: c.dims.Rb },
        { surfaceFidelityExact: true },
      );
      const lines = graph.lines;
      const sampler: SurfaceSampler = styleSampler(c.name as never, {}, c.dims);
      const prodUBias = computeUBias(sampler, lines.length > 0);
      /* eslint-disable no-console */
      console.log(`[FACROSS ${c.name} PROBE] lines=${lines.length} kinds=${[...new Set(lines.map((l) => l.kind))].join(',')} computeUBias=${prodUBias}`);
      /* eslint-enable no-console */
      runMode(c.name, sampler, lines, prodUBias, 11, false);
      runMode(c.name, sampler, lines, prodUBias, 11, true);
    }, 600000);
  }
});
