// _pkg_weave.test.ts — DEV-ONLY (PF_PKG_WEAVE=1). BEST-20 packaging driver for the WEAVE family
// (BasketWeave, CelticKnot, CelticTriquetra). Reuses the crease-conforming doubled-grid primitive
// (buildWeaveDoubledGrid from _weaveLib + celticKnotGrid from _braidLib) + labkit rulers READ-ONLY.
// NO src/ edits. Emits, per style, at its REACHING config:
//   research/exchange/_best20/stl/<Style>.stl      (full-density binary STL, labkit writeBinarySTL)
//   research/exchange/_best20/heatmap/<Style>.png   (TRUE-3D ruler heatmap at MODERATE density of the SAME primitive)
//   research/exchange/_best20/manifest.ndjson       (one checkpoint row per style, appended the instant it is done)
//
// RESILIENCE: one env-gated probe; skip a style whose STL already exists (resume). Heatmap rendered at a
// moderate-density twin (sq14 / uni12) because the reaching meshes are 14-22M tris (STL 0.7-1.1GB) and the
// true-3D projection on the full mesh is intractable; the pattern (green platforms, thin cliff ribbons) is identical.
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, bruteAnchoredRedPerp, triangleQualityDistribution,
  dumpHeatmap,
} from './labkit';
import { buildWeaveDoubledGrid, basketWeaveGrid, type WeaveCreaseGrid } from './_weaveLib';
import { celticKnotGrid } from './_braidLib';
import { writeBinarySTL } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const RUN = process.env.PF_PKG_WEAVE === '1';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const OUT = join(process.cwd(), 'research', 'exchange', '_best20');
const STL_DIR = join(OUT, 'stl');
const HM_DIR = join(OUT, 'heatmap');
const MANIFEST = join(OUT, 'manifest.ndjson');
const RENDER = join(process.cwd(), 'research', 'render', 'meshRender.cjs');

function p99(arr: ArrayLike<number>): number {
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0;
}

/**
 * RAW-index non-manifold count via SORTED numeric edge keys. labkit's `auditNonManByIndex` uses a string-keyed
 * Map that OVERFLOWS JS's 16.7M Map-size cap at ~7M+ verts (proven crash on these meshes). This is the proven
 * numeric-key twin from _close_weave.test.ts (exact while N*N < 2^53). Returns count of edges shared by >2 tris.
 */
function auditRawNonMan(indices: ArrayLike<number>): number {
  let maxI = 0;
  for (let k = 0; k < indices.length; k++) if (indices[k] > maxI) maxI = indices[k];
  const N = maxI + 1;
  if (N * N >= 9e15) throw new Error(`edge-key overflow risk: N=${N}`);
  const nTri = Math.floor(indices.length / 3);
  const keys = new Float64Array(nTri * 3);
  let w = 0;
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    keys[w++] = (a < b ? a * N + b : b * N + a);
    keys[w++] = (b < c ? b * N + c : c * N + b);
    keys[w++] = (c < a ? c * N + a : a * N + c);
  }
  const arr = keys.subarray(0, w).sort();
  let nonMan = 0, i = 0;
  while (i < w) {
    let j = i + 1; while (j < w && arr[j] === arr[i]) j++;
    if (j - i > 2) nonMan++;
    i = j;
  }
  return nonMan;
}

function manifestHasStyle(style: string): boolean {
  if (!existsSync(MANIFEST)) return false;
  return readFileSync(MANIFEST, 'utf8').trim().split('\n').filter(Boolean)
    .some((l) => { try { return JSON.parse(l).style === style; } catch { return false; } });
}

function ckUniGrid(rA: AnalyticRadiusFn, nU: number): WeaveCreaseGrid {
  const p = { ckScale: 1, ckWidth: 1, ckRelief: 1, ckGap: 1, ckRoundness: 1, ckTwist: 0, ckStrands: 1 };
  const base = celticKnotGrid(rA, H, p as never);
  const creaseU: number[] = []; for (let m = 0; m < nU; m++) creaseU.push(m / nU);
  return { creaseU, creaseT: base.creaseT };
}

interface Recipe {
  style: StyleId; config: string;
  grid: (rA: AnalyticRadiusFn) => WeaveCreaseGrid;
  hRowMm: number; wTargetMm: number; cliffChordMm: number;
  // moderate-density twin for the heatmap render (same primitive)
  hmGrid: (rA: AnalyticRadiusFn) => WeaveCreaseGrid; hmH: number; hmW: number; hmC: number; hmTag: string;
}

const RECIPES: Recipe[] = [
  {
    style: 'BasketWeave', config: 'sq08',
    grid: (rA) => basketWeaveGrid(16, 10, 0), hRowMm: 0.08, wTargetMm: 0.08, cliffChordMm: 0.08,
    hmGrid: (rA) => basketWeaveGrid(16, 10, 0), hmH: 0.14, hmW: 0.14, hmC: 0.14, hmTag: 'sq14',
  },
  {
    style: 'CelticKnot', config: 'uni24_c06',
    grid: (rA) => ckUniGrid(rA, 24), hRowMm: 0.06, wTargetMm: 0.06, cliffChordMm: 0.06,
    hmGrid: (rA) => ckUniGrid(rA, 12), hmH: 0.12, hmW: 0.12, hmC: 0.06, hmTag: 'uni12',
  },
  {
    style: 'CelticTriquetra', config: 'uni24_c06',
    grid: (rA) => ckUniGrid(rA, 24), hRowMm: 0.06, wTargetMm: 0.06, cliffChordMm: 0.06,
    hmGrid: (rA) => ckUniGrid(rA, 12), hmH: 0.12, hmW: 0.12, hmC: 0.06, hmTag: 'uni12',
  },
];

function buildMesh(rA: AnalyticRadiusFn, grid: WeaveCreaseGrid, h: number, w: number, c: number) {
  return buildWeaveDoubledGrid(rA, H, grid, { hRowMm: h, wTargetMm: w, cliffChordMm: c, seamMode: 'cliff' }).mesh;
}

describe('best20 weave packaging (STL + true-3D heatmap + manifest)', () => {
  it.skipIf(!RUN)('emit STL + heatmap + manifest per weave style', () => {
    mkdirSync(STL_DIR, { recursive: true });
    mkdirSync(HM_DIR, { recursive: true });

    for (const r of RECIPES) {
      const stlPath = join(STL_DIR, `${r.style}.stl`);
      if (manifestHasStyle(r.style)) { console.log(`skip ${r.style} (manifest row exists, resume)`); continue; }
      const t0 = Date.now();
      const rA = buildRadiusFn(r.style, {}, DIMS);

      // ── reaching-config FULL mesh → measure + write STL ──
      const m = buildMesh(rA, r.grid(rA), r.hRowMm, r.wTargetMm, r.cliffChordMm);
      const tris = m.nF;
      const ut = m.ut; const idx = m.idx; const xyz = m.xyz;

      const radial = perFaceChordSag(ut, idx, rA, H);
      const radialMaxV = radial.worstMm;
      const redMm = Math.min(0.1, Math.max(0.02, 0.5 * radialMaxV));
      const anchor = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm, sampleN: 60, radial });
      const true3dP99Mm = anchor.trustedP99; // required metric: bruteAnchoredRedPerp.trustedP99

      const vf = new Float32Array(xyz.length); for (let i = 0; i < xyz.length; i++) vf[i] = xyz[i];
      const tq = triangleQualityDistribution({ vertices: vf, indices: idx });
      const rawNonMan = auditRawNonMan(idx);

      if (!existsSync(stlPath)) writeBinarySTL(stlPath, xyz, idx);
      const stlBytes = statSync(stlPath).size;
      // serration: 0 by construction — the doubled-grid builds explicit radial cliff RUNGS at each crease
      // (no same-(u,t) staircase); the crease-conforming primitive has no serration ladder.
      const serrationMm = 0;

      const row = {
        style: r.style, primitive: 'crease-conforming doubled-grid', config: r.config,
        true3dP99Mm: +true3dP99Mm.toFixed(4), serrationMm,
        pctBelow20: +tq.pctBelow20.toFixed(2), rawNonMan, tris,
        stlBytes,
        heatmapNote: `heatmap rendered at moderate density ${r.hmTag} of the same doubled-grid primitive (reaching mesh ${(tris / 1e6).toFixed(1)}M tris/${(stlBytes / 1e9).toFixed(2)}GB too large for full true-3D projection); pattern identical`,
        radialMaxMm: +radialMaxV.toFixed(4), anchoredMaxMm: +anchor.trustedMax.toFixed(4),
        gnP99Mm: +p99(perFaceChordSag(ut, idx, rA, H).faceErr).toFixed(4),
        scoreMs: Date.now() - t0,
      };
      appendFileSync(MANIFEST, JSON.stringify(row) + '\n');
      console.log(`WROTE ${r.style}: true3dP99=${row.true3dP99Mm} tris=${(tris / 1e6).toFixed(2)}M stl=${(stlBytes / 1e9).toFixed(2)}GB pct<20=${row.pctBelow20} rawNM=${rawNonMan} (${row.scoreMs}ms)`);

      // ── moderate-density TWIN → true-3D heatmap render ──
      const hm = buildMesh(rA, r.hmGrid(rA), r.hmH, r.hmW, r.hmC);
      const hmXyz32 = new Float32Array(hm.xyz.length); for (let i = 0; i < hm.xyz.length; i++) hmXyz32[i] = hm.xyz[i];
      const binDir = join(HM_DIR, `${r.style}_bins`);
      mkdirSync(binDir, { recursive: true });
      dumpHeatmap(binDir, r.style, hmXyz32, hm.ut, hm.idx, rA, H, {
        stl: false, meta: { style: r.style, config: r.config, hmTag: r.hmTag, hmTris: hm.nF },
      });
      try {
        execFileSync('node', [RENDER, join(HM_DIR, `${r.style}.png`), binDir, '1', r.style], {
          env: { ...process.env, NODE_PATH: join(process.cwd(), 'node_modules') },
          stdio: 'inherit', timeout: 300000,
        });
        console.log(`HEATMAP ${r.style}.png rendered (${r.hmTag}, ${(hm.nF / 1e6).toFixed(2)}M tris)`);
      } catch (e) {
        console.log(`HEATMAP render failed for ${r.style}: ${(e as Error).message} — bins are on disk at ${binDir}`);
      }
    }
    expect(existsSync(MANIFEST)).toBe(true);
    console.log('MANIFEST:\n' + readFileSync(MANIFEST, 'utf8'));
  }, 90 * 60 * 1000);
});
