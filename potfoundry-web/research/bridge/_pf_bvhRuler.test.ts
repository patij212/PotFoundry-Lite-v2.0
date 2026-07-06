// _pf_bvhRuler.test.ts — DEV-ONLY. E-2026-07-06-BVH-RULER: is the whole-mesh interior ruler honest on steep facets?
//   PF_BVH_SMOKE=1  — instrument self-test: twin+BVH == analytic brute on a SMOOTH control (validates the ruler).
//   PF_BVH_Q1=1     — Q1 worst-facet ratio study on Gyroid / Voronoi / HexHive (ruler vs BVH-truth + density check).
//   PF_BVH_Q3=1     — Q3 whole-mesh BVH re-score of the tractable gap styles (checkpoint one ndjson row per style).
//   PF_BVH_Q3_BIG=1 — Q3 for the huge meshes (Crystalline + weave twins) behind a separate gate.
//
// RESILIENCE: one env-gated `it` per style; CHECKPOINT one ndjson row the INSTANT a style is scored; a style whose
// row already exists is SKIPPED ⇒ a killed run resumes by re-running only the unfinished styles. Edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, bruteNearestOnRadialSurface, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import {
  buildRadialTwin, twinOnSurfaceResidual, ratioStudy, scoreWholeMeshBVH, pickWorstFacetsByRuler, loadBinMesh,
} from './_pf_bvhRuler';
import { buildRefLocator } from './_sharp3dRef';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TOL = 0.01;
const BEST20 = join('research', 'exchange', '_best20', 'heatmap');
const OUT = join('research', 'exchange', '_pf_bvh');
const plog = (m: string): void => { mkdirSync(OUT, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT, 'progress.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (file: string, style: string): boolean => { if (!existsSync(file)) return false; return readFileSync(file, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).style === style; } catch { return false; } }); };
const checkpoint = (file: string, row: Record<string, unknown>): void => { mkdirSync(OUT, { recursive: true }); appendFileSync(file, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.style}] ${JSON.stringify(row)}`); };

function loadStyle(style: string, binDir?: string): { xyz: Float32Array; idx: Uint32Array } | null {
  const dir = binDir ? join(BEST20, binDir) : BEST20;
  const xp = join(dir, `${style}.xyz.bin`), ip = join(dir, `${style}.idx.bin`);
  if (!existsSync(xp) || !existsSync(ip)) { plog(`[MISSING] ${style} bins at ${dir}`); return null; }
  return loadBinMesh(xp, ip);
}

// ─────────────────── SMOKE: validate the instrument on a SMOOTH control ───────────────────
describe('BVH-RULER smoke — twin+BVH agrees with analytic brute on a smooth control', () => {
  it.skipIf(process.env.PF_BVH_SMOKE !== '1')('SuperellipseMorph twin BVH == analytic brute', () => {
    const style = 'SuperellipseMorph';
    const rA = buildRadiusFn(style as StyleId, {}, DIMS);
    // twin-on-surface residual vs resolution (band-limit calibration)
    for (const res of [768, 1536, 3072]) {
      const tw = buildRadialTwin(rA, H, res, res);
      const loc = buildRefLocator(tw, 3.0);
      const on = twinOnSurfaceResidual(loc, rA, H, res, res);
      plog(`[smoke ${style}] twin ${res}x${res} (${tw.nF} tris): onSurf max=${on.maxMm} p99=${on.p99Mm} p50=${on.p50Mm}mm`);
    }
    // agreement on off-surface probe points (lift facet-interior points slightly off S, compare BVH vs analytic brute)
    const tw = buildRadialTwin(rA, H, 3072, 3072);
    const loc = buildRefLocator(tw, 3.0);
    const TAU = 2 * Math.PI; let maxDiff = 0, n = 0;
    for (let i = 0; i < 400; i++) {
      const th = (i / 400) * TAU, z = ((i * 7) % 400) / 400 * H;
      const r = rA(th, z);
      // point pushed 0.05mm radially outward (off-surface probe)
      const off = 0.05; const px = (r + off) * Math.cos(th), py = (r + off) * Math.sin(th), pz = z;
      const bvh = loc.dist(px, py, pz);
      const ab = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 2048, nZ: 400, zBandMm: 3, refineIters: 60 }).dist;
      maxDiff = Math.max(maxDiff, Math.abs(bvh - ab)); n++;
    }
    plog(`[smoke ${style}] off-surface probe (n=${n}): |BVH - analytic-brute| max=${maxDiff.toFixed(6)}mm (should be << 0.01)`);
    expect(maxDiff).toBeLessThan(0.02);
  }, 30 * 60 * 1000);
});

// ─────────────────── Q1: worst-facet ratio study ───────────────────
interface Q1Spec { style: StyleId; twinRes: { nTheta: number; nZ: number }; selStride: number; nWorst: number; }
const Q1: Q1Spec[] = [
  { style: 'GyroidManifold' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, selStride: 1, nWorst: 2000 },
  { style: 'Voronoi' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, selStride: 1, nWorst: 2000 },
  { style: 'HexagonalHive' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, selStride: 1, nWorst: 2000 },
];
describe('BVH-RULER Q1 — worst-facet ratio study (ruler vs BVH-truth + density stability)', () => {
  for (const spec of Q1) {
    it.skipIf(process.env.PF_BVH_Q1 !== '1')(`Q1 ${spec.style}`, () => {
      const file = join(OUT, 'q1.ndjson');
      if (rowExists(file, spec.style)) { plog(`[skip Q1] ${spec.style} row exists`); return; }
      const m = loadStyle(spec.style); if (!m) return;
      const rA = buildRadiusFn(spec.style, {}, DIMS);
      plog(`[Q1 ${spec.style}] tris=${m.idx.length / 3} — selecting worst ${spec.nWorst} by ruler...`);
      const worst = pickWorstFacetsByRuler(m.xyz, m.idx, rA, H, spec.nWorst, { stride: spec.selStride, onProgress: (d, t) => plog(`[Q1 ${spec.style}] select ${d}/${t}`) });
      plog(`[Q1 ${spec.style}] selected ${worst.length}; ratio study (twin ${spec.twinRes.nTheta}x${spec.twinRes.nZ})...`);
      const r = ratioStudy(String(spec.style), m.xyz, m.idx, worst, rA, H, spec.twinRes, { onProgress: (d, t) => { if (d % 400 === 0 || d === t) plog(`[Q1 ${spec.style}] ratio ${d}/${t}`); } });
      checkpoint(file, { ...r });
      plog(`[Q1 ${spec.style}] rulerMax=${r.rulerMax} bvhMax=${r.bvhMax} ratioP50=${r.ratioP50} frac<0.3=${r.fracRatioBelow03} frac>0.7=${r.fracRatioAbove07} densΔp90=${r.densityDeltaP90} stable=${r.densityStable} twinOnSurf=${r.twin.onSurfMaxMm} xcheck=${r.bruteXcheckMaxMm}`);
      expect(true).toBe(true);
    }, 3 * 60 * 60 * 1000);
  }
});

// ─────────────────── Q3: whole-mesh BVH re-score ───────────────────
interface Q3Spec { style: StyleId; binDir?: string; twinRes: { nTheta: number; nZ: number }; stride: number; note: string; }
const Q3: Q3Spec[] = [
  { style: 'RippleInterference' as StyleId, twinRes: { nTheta: 1536, nZ: 1536 }, stride: 1, note: 'smooth' },
  { style: 'WaveInterference' as StyleId, twinRes: { nTheta: 1536, nZ: 1536 }, stride: 1, note: 'smooth' },
  { style: 'FourierBloom' as StyleId, twinRes: { nTheta: 1536, nZ: 1536 }, stride: 1, note: 'smooth' },
  { style: 'HarmonicRipple' as StyleId, twinRes: { nTheta: 1536, nZ: 1536 }, stride: 1, note: 'smooth' },
  { style: 'GyroidManifold' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, stride: 1, note: 'tangled lattice' },
  { style: 'Voronoi' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, stride: 1, note: 'tangled lattice' },
  { style: 'HexagonalHive' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, stride: 1, note: 'tangled lattice' },
];
const Q3BIG: Q3Spec[] = [
  { style: 'Crystalline' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, stride: 2, note: 'tangled lattice (3.5M)' },
  { style: 'DragonScales' as StyleId, twinRes: { nTheta: 2048, nZ: 3072 }, stride: 1, note: 'riser (2.1M)' },
  { style: 'LowPolyFacet' as StyleId, twinRes: { nTheta: 2048, nZ: 2048 }, stride: 2, note: 'crest riser (11.3M)' },
  { style: 'BasketWeave' as StyleId, binDir: 'BasketWeave_bins', twinRes: { nTheta: 3072, nZ: 3072 }, stride: 1, note: 'weave over-under (moderate twin 4.8M)' },
  { style: 'CelticKnot' as StyleId, binDir: 'CelticKnot_bins', twinRes: { nTheta: 3072, nZ: 3072 }, stride: 1, note: 'braid (moderate twin 4.9M)' },
  { style: 'CelticTriquetra' as StyleId, binDir: 'CelticTriquetra_bins', twinRes: { nTheta: 3072, nZ: 3072 }, stride: 1, note: 'braid (moderate twin 5.7M)' },
  { style: 'SuperformulaBlossom' as StyleId, twinRes: { nTheta: 3072, nZ: 3072 }, stride: 2, note: 'seam-ladder (13M)' },
];

// Parallel sharding: PF_BVH_SHARD="k/N" scores facet ordinals ≡ k (mod N) —
// launch N processes; each rebuilds its own twin (cheap), shard 0 carries the
// full twin band-limit gate, others subsample it. PF_BVH_STYLES="A,B" filters.
// Merge: outliers/scanned sum across shards, max of maxes; percentiles are
// per-shard (uniform interleave ⇒ each shard is an unbiased facet sample).
const SHARD = ((): { k: number; n: number } | null => {
  const s = process.env.PF_BVH_SHARD; if (!s) return null;
  const mm = /^(\d+)\/(\d+)$/.exec(s); return mm ? { k: +mm[1], n: +mm[2] } : null;
})();
const STYLE_FILTER = (process.env.PF_BVH_STYLES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

function scoreQ3(spec: Q3Spec): void {
  const file = join(OUT, 'q3.ndjson');
  if (STYLE_FILTER.length && !STYLE_FILTER.includes(spec.style)) return;
  const rowKey = SHARD ? `${spec.style}#${SHARD.k}of${SHARD.n}` : spec.style;
  if (rowExists(file, rowKey)) { plog(`[skip Q3] ${rowKey} row exists`); return; }
  const m = loadStyle(spec.style, spec.binDir); if (!m) return;
  const rA = buildRadiusFn(spec.style, {}, DIMS);
  const tris = m.idx.length / 3;
  plog(`[Q3 ${rowKey}] tris=${tris} twin=${spec.twinRes.nTheta}x${spec.twinRes.nZ} stride=${spec.stride} — scoring...`);
  const t0 = Date.now();
  const r = scoreWholeMeshBVH(m.xyz, m.idx, rA, H, spec.twinRes, {
    tol: TOL, stride: spec.stride,
    shard: SHARD ?? undefined,
    twinValidate: SHARD && SHARD.k > 0 ? 'sub' : 'full',
    onProgress: (d, t, no, w) => { if (Math.floor(d / t * 20) !== Math.floor((d - 1) / t * 20)) plog(`[Q3 ${rowKey}] ${Math.floor(d / t * 100)}% out=${no} worst=${w.toFixed(5)} ${((Date.now() - t0) / 1000).toFixed(0)}s`); },
  });
  const scoreMs = Date.now() - t0;
  const row = {
    style: rowKey, baseStyle: spec.style, note: spec.note, tris, twinTris: r.twinTris, twinOnSurfMaxMm: r.twinOnSurfMaxMm,
    scannedFacets: r.scannedFacets, stride: r.stride,
    interiorOutliers: r.interiorOutliers, scaledOutlierEstimate: r.scaledOutlierEstimate,
    wholeMeshMaxMm: r.wholeMeshMaxMm, p50: r.p50, p90: r.p90, p99: r.p99,
    worstXyz: r.worstXyz, scoreMs,
    ruler: `whole-mesh BVH-truth-twin ${r.stride > 1 ? `stride-${r.stride}` : 'every-facet'} denseBary(45pt) point-to-triangle, no top-N cap`,
  };
  checkpoint(file, row);
  plog(`[Q3 ${rowKey}] SCORED out=${r.interiorOutliers}/${r.scannedFacets} (×${r.stride}=${r.scaledOutlierEstimate}) max=${r.wholeMeshMaxMm} p99=${r.p99} twinOnSurf=${r.twinOnSurfMaxMm} in ${(scoreMs / 1000).toFixed(0)}s`);
}

describe('BVH-RULER Q3 — whole-mesh BVH re-score of the gap styles', () => {
  for (const spec of Q3) {
    it.skipIf(process.env.PF_BVH_Q3 !== '1')(`Q3 ${spec.style}`, () => { scoreQ3(spec); expect(true).toBe(true); }, 3 * 60 * 60 * 1000);
  }
  for (const spec of Q3BIG) {
    it.skipIf(process.env.PF_BVH_Q3_BIG !== '1')(`Q3-BIG ${spec.style}`, () => { scoreQ3(spec); expect(true).toBe(true); }, 5 * 60 * 60 * 1000);
  }
});
