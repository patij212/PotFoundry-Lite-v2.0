// _close_weave.test.ts — DEV-ONLY (PF_CLOSE_WEAVE=1). Close the WEAVE/BRAID axis toward the PotFoundry export
// standard: honest true-3D perpendicular <= 0.01mm, zero serration by construction, good quality + watertight, on
// BasketWeave, CelticKnot, CelticTriquetra.
//
// PRIMITIVE: crease-conforming doubled-grid brick (buildWeaveDoubledGrid from _weaveLib) — M-square platforms +
// doubled grid lines with explicit radial cliff rungs; SQUARE cliff cells kill the sliver tail. PROVEN (SCORECARD
// research/exchange/_weave): BasketWeave honest true-3D p99 density-responsive 0.0566@cliff0.15 -> 0.0291@cliff0.08,
// slope ~0.37 => cliff~0.027 predicts <=0.01. TASK 1 = CONFIRM literal <=0.01 at fine cliff, watch tri budget.
//
// RULERS (all from labkit): bruteAnchoredRedPerp -> trustedP99/trustedMax = HONEST true-3D (GN overstates steep
// walls up to 7x; the brute-anchor is trusted). perFaceChordSag = radial SCREEN + red-facet picker. perFaceTrue3DSag
// = GN field. triangleQualityDistribution -> pctBelow20/minAngle. RAW-index nonManifold MUST be 0.
//
// RESILIENCE: one env-gated probe; per-style ndjson checkpoint the INSTANT it is scored; skip a style whose row
// already exists (resume). SCREEN each style at <=1M tris; HD-confirm the WINNER recipe only.
//
// ISOLATION: dev-only. Reuses _weaveLib (buildWeaveDoubledGrid, basketWeaveGrid) + _braidLib (celticKnotGrid) +
// labkit rulers READ-ONLY. NO src/ or shared-kernel edits.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp,
  triangleQualityDistribution,
} from './labkit';
import { buildWeaveDoubledGrid, basketWeaveGrid, type WeaveCreaseGrid } from './_weaveLib';
import { celticKnotGrid } from './_braidLib';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const RUN = process.env.PF_CLOSE_WEAVE === '1';
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const OUT = join(process.cwd(), 'research', 'exchange', '_close_weave');
const NDJSON = join(OUT, 'scorecard.ndjson');

function p99(arr: ArrayLike<number>): number {
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0;
}
/**
 * RAW-index edge multiplicity via a SORTED typed-array of exact numeric edge keys (Map<string> overflows at >16.7M
 * distinct edges; a Map of numeric keys loses precision above 2^53). Key = min*N + max with N = maxIndex+1, exact
 * while N*N < 2^53 (max index ~1e7 ⇒ key ~1e14 < 9e15 ✓). Returns {nonMan: edges >2 tris, boundary: edges ==1}.
 */
function auditRawEdges(indices: ArrayLike<number>): { nonMan: number; boundary: number } {
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
  let nonMan = 0, boundary = 0, i = 0;
  while (i < w) {
    let j = i + 1; while (j < w && arr[j] === arr[i]) j++;
    const cnt = j - i;
    if (cnt > 2) nonMan++; else if (cnt === 1) boundary++;
    i = j;
  }
  return { nonMan, boundary };
}

interface Recipe { style: StyleId; grid: () => WeaveCreaseGrid; hRowMm: number; wTargetMm: number; cliffChordMm: number; tag: string; }

/** Score one doubled-grid recipe; append an ndjson checkpoint row the instant it is computed. */
function scoreRecipe(rA: AnalyticRadiusFn, r: Recipe): Record<string, unknown> {
  const t0 = Date.now();
  const grid = r.grid();
  const build = buildWeaveDoubledGrid(rA, H, grid, {
    hRowMm: r.hRowMm, wTargetMm: r.wTargetMm, cliffChordMm: r.cliffChordMm, seamMode: 'cliff',
  });
  const m = build.mesh;
  const tris = m.nF;
  const ut = m.ut; // flat number[] stride-2
  const idx = m.idx;
  const xyz = m.xyz; // Float64Array

  // radial screen (also the red-facet picker for the brute anchor)
  const radial = perFaceChordSag(ut, idx, rA, H);
  // GN true-3D field
  const true3d = perFaceTrue3DSag(ut, idx, rA, H);
  const gnP99 = p99(true3d.faceErr);
  const gnMax = true3d.worstMm;
  // HONEST true-3D: brute-anchor the worst facets (GN overstates near-vertical cliff walls up to 7x via wrong-local-
  // minimum feet). Trigger whenever the GN field is clearly overstating (gnMax >> radialMax, since honest true-3D <=
  // radial always) OR radial itself is red. Pick the red set with a redMm that GUARANTEES a non-empty sample even when
  // radialMax < 0.1 (steep weave walls: radial screen already tiny but GN stalls high). This is the fix for the
  // sq08-style case where radialMax=0.083<0.1 skipped the anchor and left honestP99 = raw GN garbage (0.76).
  const radialMaxV = radial.worstMm;
  let trustedP99 = gnP99, trustedMax = gnMax, nRed = 0, gnOver = 0;
  const gnStalls = gnMax > 2 * radialMaxV + 0.02; // GN clearly above the (over-stating) radial upper bound
  if (radialMaxV > 0.1 || gnStalls) {
    const redMm = Math.min(0.1, Math.max(0.02, 0.5 * radialMaxV));
    const a = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm, sampleN: 60, radial });
    trustedP99 = a.trustedP99; trustedMax = a.trustedMax; nRed = a.nRed; gnOver = a.gnOver;
    // The anchor only rescores the RED tail; the honest p99 of the WHOLE mesh is bounded by the radial screen
    // (true-3D <= radial). Report the trusted tail but never above the radial p99 (which the anchor cannot see).
  }
  // Honest whole-mesh true-3D p99 is bounded above by the radial screen p99 (radial OVERSTATES steep, never understates
  // the true perpendicular for these near-vertical faithful walls). Use min(anchored tail, radial p99) as the honest
  // verdict number; radial p99 is the trustworthy upper bound when the anchored red tail is a tiny facet count.
  const radialP99V = p99(radial.faceErr);
  const honestVerdictP99 = Math.min(trustedP99, radialP99V);
  // quality on the primitive mesh (Float32 vertices for the metric)
  const vf = new Float32Array(xyz.length); for (let i = 0; i < xyz.length; i++) vf[i] = xyz[i];
  const tq = triangleQualityDistribution({ vertices: vf, indices: idx });
  // watertight (RAW index) + boundary (rims only)
  const rawEdges = auditRawEdges(idx);
  const rawNonMan = rawEdges.nonMan;
  const bnd = rawEdges.boundary;

  const row = {
    style: r.style, tag: r.tag,
    hRowMm: r.hRowMm, wTargetMm: r.wTargetMm, cliffChordMm: r.cliffChordMm,
    tris, verts: m.nV,
    // honestVerdictP99 = min(brute-anchored red tail, radial-screen p99) — both are honest UPPER BOUNDS on the true
    // perpendicular for these faithful near-vertical walls (radial overstates; anchor corrects GN-stall).
    honestTrue3dP99: +honestVerdictP99.toFixed(4),
    anchoredTailP99: +trustedP99.toFixed(4), anchoredTailMax: +trustedMax.toFixed(4),
    gnTrue3dP99: +gnP99.toFixed(4), gnTrue3dMax: +gnMax.toFixed(4), nRedFacets: nRed, gnOver,
    radialP99: +radialP99V.toFixed(4), radialMax: +radialMaxV.toFixed(4),
    pctBelow20: +tq.pctBelow20.toFixed(2), pctBelow10: +tq.pctBelow10.toFixed(2),
    minAngleDeg: +tq.minAngleDeg.toFixed(2), medianMinAngle: +tq.medianMinAngleDeg.toFixed(2),
    rawNonMan, boundary: bnd,
    reaches001: honestVerdictP99 <= 0.01,
    scoreMs: Date.now() - t0,
  };
  mkdirSync(OUT, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  console.log(
    `${r.style}[${r.tag}] cliff=${r.cliffChordMm} tris=${(tris / 1e6).toFixed(2)}M honestP99=${row.honestTrue3dP99} ` +
    `(anchTail=${row.anchoredTailP99} gnP99=${row.gnTrue3dP99} nRed=${nRed}) radialP99=${row.radialP99} radMax=${row.radialMax} ` +
    `%<20=${row.pctBelow20} minAng=${row.minAngleDeg} rawNM=${rawNonMan} bnd=${bnd} reaches<=0.01=${row.reaches001} (${row.scoreMs}ms)`,
  );
  return row;
}

function alreadyScored(tag: string): boolean {
  if (!existsSync(NDJSON)) return false;
  const lines = readFileSync(NDJSON, 'utf8').trim().split('\n').filter(Boolean);
  return lines.some((l) => { try { return JSON.parse(l).tag === tag; } catch { return false; } });
}

describe('close weave/braid axis (doubled-grid brick, honest true-3D)', () => {
  // ── TASK 1: BasketWeave literal <=0.01 confirm (localized cliff density, watch budget). Screen coarse->fine. ──
  it.skipIf(!RUN)('BasketWeave — cliffChord density sweep to <=0.01', () => {
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const grid = (): WeaveCreaseGrid => basketWeaveGrid(16, 10, 0);
    // SQUARE-CELL lever (SCORECARD proven-clean): hRow = wTarget = cliffChord all EQUAL. First recipe (0.15) is the
    // SCORECARD's rawNonMan-0 anchor (4.15M) to VALIDATE the harness reproduces watertight, then drive cliff finer.
    // A NON-square recipe (hRow!=cliff) at 0.15/0.08 gave rawNM=181754 — the square constraint IS the watertight lever.
    const recipes: Recipe[] = [
      { style: 'BasketWeave', grid, hRowMm: 0.15, wTargetMm: 0.15, cliffChordMm: 0.15, tag: 'BW_sq15' },
      { style: 'BasketWeave', grid, hRowMm: 0.08, wTargetMm: 0.08, cliffChordMm: 0.08, tag: 'BW_sq08' },
    ];
    for (const r of recipes) {
      if (alreadyScored(r.tag)) { console.log(`skip ${r.tag} (resume)`); continue; }
      scoreRecipe(rA, r);
    }
    expect(existsSync(NDJSON)).toBe(true);
  }, 60 * 60 * 1000);

  // ── TASK 2: CelticKnot — the braid's creases are SWEPT sinusoidal ribbons (localU=0.4·sin(v+phase)), NOT constant-u
  // lines. celticKnotGrid returns ring creases only + creaseU=[] (the honest statement: constant-u columns are the
  // WRONG axis). The axis-aligned doubled-grid needs creaseU to build a lattice, so we augment with N UNIFORM columns
  // (matching the ~12 ribbon count) — a CONSTANT-U grid that necessarily STRADDLES the swept creases. Its honest
  // true-3D chord (high) + %<20 MEASURES the swept-grid need (the SCALECOL wall), the cheap discriminator for whether
  // the braid is REFUTED-primitive (needs swept-curve grid) without building the swept grid. Also sweep density: if
  // the chord is DENSITY-INVARIANT (straddle floor), that proves it is a WRONG-AXIS straddle, not under-tessellation.
  it.skipIf(!RUN)('CelticKnot — constant-u doubled-grid straddle baseline', () => {
    const rA = buildRadiusFn('CelticKnot', {}, DIMS);
    const grid = (nU: number) => (): WeaveCreaseGrid => {
      const p = { ckScale: 1, ckWidth: 1, ckRelief: 1, ckGap: 1, ckRoundness: 1, ckTwist: 0, ckStrands: 1 };
      const base = celticKnotGrid(rA, H, p as never); // ring creaseT only, creaseU=[]
      const creaseU: number[] = []; for (let m = 0; m < nU; m++) creaseU.push(m / nU);
      return { creaseU, creaseT: base.creaseT };
    };
    const recipes: Recipe[] = [
      { style: 'CelticKnot', grid: grid(12), hRowMm: 0.12, wTargetMm: 0.12, cliffChordMm: 0.06, tag: 'CK_uni12_c06' },
      { style: 'CelticKnot', grid: grid(24), hRowMm: 0.06, wTargetMm: 0.06, cliffChordMm: 0.06, tag: 'CK_uni24_c06' },
    ];
    for (const r of recipes) {
      if (alreadyScored(r.tag)) { console.log(`skip ${r.tag} (resume)`); continue; }
      scoreRecipe(rA, r);
    }
    expect(existsSync(NDJSON)).toBe(true);
  }, 60 * 60 * 1000);

  // ── TASK 3: CelticTriquetra — same braid/swept-grid class. Same constant-u straddle baseline + density sweep. ──
  it.skipIf(!RUN)('CelticTriquetra — constant-u doubled-grid straddle baseline', () => {
    const rA = buildRadiusFn('CelticTriquetra', {}, DIMS);
    const grid = (nU: number) => (): WeaveCreaseGrid => {
      const p = { ckScale: 1, ckWidth: 1, ckRelief: 1, ckGap: 1, ckRoundness: 1, ckTwist: 0, ckStrands: 1 };
      const base = celticKnotGrid(rA, H, p as never);
      const creaseU: number[] = []; for (let m = 0; m < nU; m++) creaseU.push(m / nU);
      return { creaseU, creaseT: base.creaseT };
    };
    const recipes: Recipe[] = [
      { style: 'CelticTriquetra', grid: grid(12), hRowMm: 0.12, wTargetMm: 0.12, cliffChordMm: 0.06, tag: 'CT_uni12_c06' },
      { style: 'CelticTriquetra', grid: grid(24), hRowMm: 0.06, wTargetMm: 0.06, cliffChordMm: 0.06, tag: 'CT_uni24_c06' },
    ];
    for (const r of recipes) {
      if (alreadyScored(r.tag)) { console.log(`skip ${r.tag} (resume)`); continue; }
      scoreRecipe(rA, r);
    }
    expect(existsSync(NDJSON)).toBe(true);
  }, 60 * 60 * 1000);
});
