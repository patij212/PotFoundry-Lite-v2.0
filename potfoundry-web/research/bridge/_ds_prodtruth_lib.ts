// _ds_prodtruth_lib.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-10-DS-PRODTRUTH. Ports the VALIDATED §V11g tread-CONFORMING open-surface composite
// ruler (E-2026-07-08-DS-CONFORMING-RULER, spec §V11g — passed the full 1a-1d metrologist battery
// on the research doubled-rings mesh) to score the CAPTURED PRODUCTION DragonScales artifact
// (research/exchange/_prod_truth/DragonScales/), whose forward scoring under the single-valued
// (tread-blind) radial ruler was previously STOPPED as intractable (E-2026-07-09-PROD-ARTIFACT-TRUTH,
// 130 CPU-min, no completion).
//
// READ-ONLY imports from labkit / _sharp3dRef / _ds_conformRef / _pf_bvhRuler — nothing here
// re-implements machinery that is already exported; this file adds ONLY what the production-artifact
// scoring direction needs on top of the existing V11g instrument: (a) an analytic re-derivation of
// the ring schedule (dragonRings — the SAME recipe as _pf_dsconform.test.ts's private helper,
// independently re-derived from src/geometry/types.ts + src/geometry/styles.ts per the mission's
// read-only-import discipline, since that helper is test-file-local and not exported), (b) a
// per-facet ring-band vs body classifier that works on an UNSTRUCTURED production mesh (the research
// mesh's classifier reads RowSpec.kind metadata that a curvature-adaptive production tessellation
// does not have), and (c) an artifact loader thin-wrapper.
//
// Edits NOTHING in src/. No kernel edits.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims } from './labkit';
import { buildRadialTwin, loadBinMesh, denseBary } from './_pf_bvhRuler';
import { buildRefLocator, type RefLocator, type RefMesh } from './_sharp3dRef';
import type { StepRing } from './_sharp3dRef';
import { buildWallOnlyReference, compositeLocator, riserWallPoints } from './_ds_conformRef';
import type { StyleId } from '../../src/geometry/types';

export const TAU = 2 * Math.PI;

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Production capture pinning (research/exchange/_prod_truth/DragonScales/meta.json): H120 /
// top_od 100 / bottom_od 80 / expn 1 / spinTurns 0 ⇒ Rt=50, Rb=40. DEFAULT style params
// (the capture harness passes {} — buildRadiusFn merges DEFAULT_STYLE_PARAMS itself).
// ─────────────────────────────────────────────────────────────────────────────────────────────
export const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
export const H = DIMS.H;
export const TOL = 0.01;

export const PROD_TRUTH_DIR = join('research', 'exchange', '_prod_truth', 'DragonScales');
export const OUT_DIR = join('research', 'exchange', '_ds_prodtruth');
export const NDJSON = join(OUT_DIR, 'scorecard.ndjson');

// V11g composite ruler resolution (identical to _pf_dsconform.test.ts — the VALIDATED config).
export const RAD_TWIN = { nTheta: 2048, nZ: 3072 };
const CIRC = 2 * Math.PI * ((DIMS.Rb + DIMS.Rt) / 2);
export const RAD_CELL = Math.max(0.35, 4 * (CIRC / RAD_TWIN.nTheta));
export const WALLEPS = 0.0005; // V11g-ALIGNED value (mesh ring-row zEps analogue; collapses the alignment artifact).
export const WALL_NTHETA = 4096;
export const WALL_CELL = 0.3;

/**
 * Build the DragonScales analytic radius function exactly as production does (same buildRadiusFn
 * labkit re-exports from ./runStyle, used verbatim by both _pf_dsconform.test.ts and
 * _prod_truth.test.ts for this exact artifact/dims pairing).
 */
export function dsRadiusFn(): (theta: number, z: number) => number {
  return buildRadiusFn('DragonScales' as StyleId, {}, DIMS);
}

/**
 * The 7 stagger-flip rings, re-derived analytically (NOT imported from _pf_dsconform.test.ts, which
 * is test-file-local): rOuterDragonScales (src/geometry/styles.ts) computes
 *   rowPhase = t * scaleRows;  row = floor(rowPhase);
 *   staggerOffset = (trunc(row) % 2 === 1) ? 0.5*TAU/scalesPerRow : 0
 * — a genuine radius discontinuity occurs at every INTEGER rowPhase (t = k/scaleRows), where
 * `row` increments and the stagger flips. DEFAULT_DRAGON_SCALES.dsScaleRows = 8 (src/geometry/types.ts)
 * ⇒ rings at t = k/8 for k = 1..7 (k=0 and k=8 are the pot's own top/bottom boundaries, not interior
 * discontinuities). Matches the V11g/V11c/V11f/V11l banked ringJumpMax figures (0.88-1.21mm) exactly.
 */
export function dragonRings(scaleRows = 8): StepRing[] {
  const rings: StepRing[] = [];
  for (let k = 1; k < scaleRows; k++) {
    const t = k / scaleRows;
    rings.push({ z: t * H, t, up: false }); // `up` unused by the composite ruler; kept for StepRing shape parity.
  }
  return rings;
}

/** Composite open-surface conforming ruler = min(radial-sheet twin, riser wall-only, z-gated). Identical
 * construction to _pf_dsconform.test.ts's buildConformRuler — the VALIDATED §V11g instrument. */
export function buildConformRuler(rA: (t: number, z: number) => number): RefLocator {
  const radTwin = buildRadialTwin(rA, H, RAD_TWIN.nTheta, RAD_TWIN.nZ);
  const sheetLoc = buildRefLocator(radTwin, RAD_CELL);
  const dr = dragonRings();
  const wallRef = buildWallOnlyReference(rA, dr, WALL_NTHETA, WALLEPS);
  const wallLoc = buildRefLocator(wallRef, WALL_CELL);
  return compositeLocator(sheetLoc, wallLoc, dr.map((r) => r.z));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Artifact loading
// ─────────────────────────────────────────────────────────────────────────────────────────────
export interface ArtifactMeta {
  style: string;
  dims: { H: number; top_od: number; bottom_od: number; expn: number; bellAmp: number; spinTurns: number };
  full?: { verts: number; tris: number; generateMs: number };
  outer?: { verts: number; tris: number; generateMs: number };
  ok: boolean;
}

export function loadArtifactMeta(dir = PROD_TRUTH_DIR): ArtifactMeta {
  return JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as ArtifactMeta;
}

/** Load the production outer-wall submesh (the surface that carries the export's visible geometry). */
export function loadArtifactOuter(dir = PROD_TRUTH_DIR): { xyz: Float32Array; idx: Uint32Array } {
  return loadBinMesh(join(dir, 'outer.xyz.bin'), join(dir, 'outer.idx.bin'));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Ring-band vs body classification (production mesh has NO RowSpec metadata — unlike the research
// mesh's facetClassifier, this must work purely from geometry: a facet is RING-BAND iff its
// centroid z lies within bandMm of some ring z).
// ─────────────────────────────────────────────────────────────────────────────────────────────
export function classifyRingBand(
  xyz: Float32Array | Float64Array, idx: Uint32Array, ringZs: number[], bandMm: number,
): (f: number) => 'body' | 'ringBand' {
  const zs = [...ringZs].sort((a, b) => a - b);
  const nearRing = (z: number): boolean => {
    for (const rz of zs) { if (Math.abs(z - rz) <= bandMm) return true; if (rz - z > bandMm) break; }
    return false;
  };
  return (f: number): 'body' | 'ringBand' => {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
    return nearRing(zc) ? 'ringBand' : 'body';
  };
}

// dense facet-interior barycentric lattice (45 pts, n=8) — the acceptance basis of the campaign.
export const DENSE = denseBary(8);

/** Sound radial same-(u,t) upper bound: |hypot(x,y) - rA(atan2,z)|. Strict upper bound on the true
 * distance to the composite ruler's SHEET component for z within [0,H] (the sheet IS the radial
 * surface) — a green bound proves the facet ≤ tol on the SAME dense basis without touching the BVH.
 * NOT sound for ring-band facets (the radial surface does not represent the riser wall there). */
export function radialBoundAt(rA: (t: number, z: number) => number, px: number, py: number, pz: number): number {
  if (pz < 0 || pz > H) return Infinity;
  let th = Math.atan2(py, px);
  if (th < 0) th += TAU;
  return Math.abs(Math.hypot(px, py) - rA(th, pz));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Forward scoring: artifact facet → composite ruler distance, split by population.
// ─────────────────────────────────────────────────────────────────────────────────────────────
export interface PopulationStats {
  scannedFacets: number;
  outliers: number;
  maxMm: number;
  p50: number; p90: number; p99: number;
  greenProvenFrac?: number; // BODY only: fraction proven green by the sound radial prefilter (no BVH touch).
}

function pctFromSorted(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}

/**
 * Score BODY facets against the composite ruler with the SOUND radial prefilter (facets whose
 * dense-45 radial bound is entirely ≤0.7*tol are GREEN-PROVEN and skip the BVH — exact-equivalent
 * by construction per E-2026-07-09-FAST-HONEST-RULER / the scoreMesh 'sheet' branch in
 * _pf_dsconform.test.ts, since the composite ruler's sheet component IS the radial surface).
 */
export function scoreBodyFacets(
  xyz: Float32Array, idx: Uint32Array, facets: number[],
  loc: RefLocator, rA: (t: number, z: number) => number, tol: number,
  onProgress?: (done: number, total: number) => void,
): PopulationStats {
  const advMargin = 0.7 * tol;
  const devs: number[] = [];
  let worst = 0, greenProven = 0;
  const total = facets.length;
  for (let i = 0; i < total; i++) {
    const f = facets[i];
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let bMax = 0;
    for (const [wa, wb, wc] of DENSE) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const bd = radialBoundAt(rA, px, py, pz);
      if (bd > bMax) { bMax = bd; if (bMax > advMargin) break; }
    }
    let dv: number;
    if (bMax <= advMargin) { dv = bMax; greenProven++; }
    else {
      dv = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        const d = loc.dist(px, py, pz); if (d > dv) dv = d;
      }
    }
    devs.push(dv);
    if (dv > worst) worst = dv;
    if (onProgress && (i % Math.max(1, Math.floor(total / 20)) === 0)) onProgress(i, total);
  }
  const sorted = Float64Array.from(devs).sort();
  let nOut = 0; for (const d of devs) if (d > tol) nOut++;
  return {
    scannedFacets: total, outliers: nOut, maxMm: +worst.toFixed(6),
    p50: pctFromSorted(sorted, 0.5), p90: pctFromSorted(sorted, 0.9), p99: pctFromSorted(sorted, 0.99),
    greenProvenFrac: total ? +(greenProven / total).toFixed(4) : 0,
  };
}

/**
 * Score RING-BAND facets: NO prefilter (the radial bound is unsound at the riser — the whole reason
 * the ring-band population exists) — every facet is dense-scored against the full composite locator,
 * per the mission mandate.
 */
export function scoreRingBandFacets(
  xyz: Float32Array, idx: Uint32Array, facets: number[],
  loc: RefLocator, tol: number,
  onProgress?: (done: number, total: number) => void,
): PopulationStats {
  const devs: number[] = [];
  let worst = 0;
  const total = facets.length;
  for (let i = 0; i < total; i++) {
    const f = facets[i];
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let dv = 0;
    for (const [wa, wb, wc] of DENSE) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const d = loc.dist(px, py, pz); if (d > dv) dv = d;
    }
    devs.push(dv);
    if (dv > worst) worst = dv;
    if (onProgress && (i % Math.max(1, Math.floor(total / 20)) === 0)) onProgress(i, total);
  }
  const sorted = Float64Array.from(devs).sort();
  let nOut = 0; for (const d of devs) if (d > tol) nOut++;
  return {
    scannedFacets: total, outliers: nOut, maxMm: +worst.toFixed(6),
    p50: pctFromSorted(sorted, 0.5), p90: pctFromSorted(sorted, 0.9), p99: pctFromSorted(sorted, 0.99),
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Reverse direction: dense true-surface lattice (one-sided radii near rings) + riser-wall samples
// → nearest distance to the artifact's own outer submesh (via buildRefLocator over it).
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** One-sided radius at z: if z sits within wallEps of a ring, evaluate at the correct one-sided
 * offset (z_k - wallEps from below, z_k + wallEps from above) rather than the ill-defined value
 * exactly AT the jump. Elsewhere, plain rA(theta,z). */
export function oneSidedRA(
  rA: (t: number, z: number) => number, ringZs: number[], wallEps: number,
): (theta: number, z: number) => number {
  const zs = [...ringZs].sort((a, b) => a - b);
  return (theta: number, z: number): number => {
    for (const rz of zs) {
      if (Math.abs(z - rz) <= wallEps) {
        // snap to the nearer one-sided offset (below if z<=rz, above otherwise; z==rz picks below by convention).
        const zSide = z <= rz ? rz - wallEps : rz + wallEps;
        return rA(theta, zSide);
      }
    }
    return rA(theta, z);
  };
}

export interface CoverageStats {
  max: number; p99: number; p50: number; over: number; n: number;
  worstUt?: [number, number];
}

function pctStatsArr(devs: Float64Array, n: number, tol: number): CoverageStats {
  const a = devs.subarray(0, n).slice(); a.sort();
  let over = 0; for (let i = n - 1; i >= 0 && a[i] > tol; i--) over++;
  return { max: n ? a[n - 1] : 0, p99: n ? a[Math.min(n - 1, Math.floor(0.99 * n))] : 0, p50: n ? a[Math.floor(0.5 * n)] : 0, over, n };
}

/** Build a RefLocator over the artifact's OWN outer submesh (the reverse-direction target). */
export function buildArtifactLocator(xyz: Float32Array, idx: Uint32Array): RefLocator {
  const refXyz = new Float64Array(xyz.length);
  for (let i = 0; i < xyz.length; i++) refXyz[i] = xyz[i];
  const ref: RefMesh = { xyz: refXyz, idx, nV: xyz.length / 3, nF: idx.length / 3 };
  // cell sized from mean edge length (banked V10 perf lesson: cell ~ 4x edge), sampled cheaply.
  let edgeSum = 0;
  const nF = idx.length / 3;
  const eSamples = Math.min(2000, nF);
  for (let s = 0; s < eSamples; s++) {
    const t = Math.floor((s / eSamples) * nF) * 3;
    const a = idx[t] * 3, b = idx[t + 1] * 3;
    edgeSum += Math.hypot(xyz[b] - xyz[a], xyz[b + 1] - xyz[a + 1], xyz[b + 2] - xyz[a + 2]);
  }
  const cell = Math.max(0.4, Math.min(3.0, (edgeSum / Math.max(1, eSamples)) * 4));
  return buildRefLocator(ref, cell);
}

/** Adversarial locator self-check: loc.dist vs loc.bruteDist on random on-surface samples. */
export function locatorSelfCheck(
  loc: RefLocator, rA: (t: number, z: number) => number, n = 24, bandMm = 0.5,
): number {
  let maxDelta = 0;
  for (let s = 0; s < n; s++) {
    const th = (TAU * ((s * 79) % 1024)) / 1024;
    const z = bandMm + (H - 2 * bandMm) * (((s * 131) % 997) / 997);
    const r = rA(th, z);
    const px = r * Math.cos(th), py = r * Math.sin(th);
    maxDelta = Math.max(maxDelta, Math.abs(loc.dist(px, py, z) - loc.bruteDist(px, py, z)));
  }
  return +maxDelta.toFixed(10);
}

/** Sheet coverage: dense (u,t) lattice with ONE-SIDED radii near rings → nearest distance to the
 * artifact locator. Boundary bands (t near 0/1) separated. */
export function sheetCoverage(
  loc: RefLocator, rAOneSided: (theta: number, z: number) => number, nU: number, nT: number, bandMm: number,
): { interior: CoverageStats; boundary: CoverageStats } {
  const cov = new Float64Array(nU * nT);
  let covN = 0, worstU = 0, worstT = 0, worstD = -1;
  for (let j = 0; j < nT; j++) {
    const z = bandMm + ((H - 2 * bandMm) * j) / (nT - 1);
    for (let i = 0; i < nU; i++) {
      const th = (TAU * i) / nU;
      const r = rAOneSided(th, z);
      const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
      cov[covN++] = d;
      if (d > worstD) { worstD = d; worstU = th / TAU; worstT = z / H; }
    }
  }
  const interior = pctStatsArr(cov, covN, TOL);
  interior.worstUt = [+worstU.toFixed(4), +worstT.toFixed(4)];
  const bDev = new Float64Array(nU * 4);
  let bN = 0;
  for (const z of [bandMm * 0.5, bandMm * 0.25, H - bandMm * 0.5, H - bandMm * 0.25]) {
    for (let i = 0; i < nU; i++) {
      const th = (TAU * i) / nU;
      const r = rAOneSided(th, z);
      bDev[bN++] = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
    }
  }
  const boundary = pctStatsArr(bDev, bN, TOL);
  return { interior, boundary };
}

/** Wall coverage (the mission-critical witness): dense samples ON the riser wall strips →
 * nearest distance to the artifact locator. Directly measures whether the artifact's chorded
 * ramp reaches the true vertical wall the ramp is supposed to span. */
export function wallCoverage(
  loc: RefLocator, rA: (theta: number, z: number) => number, rings: StepRing[], wallEps: number,
  nTheta: number, nS: number,
): CoverageStats {
  const pts = riserWallPoints(rA, rings, wallEps, nTheta, nS);
  const devs = new Float64Array(pts.length);
  for (let i = 0; i < pts.length; i++) { const [x, y, z] = pts[i]; devs[i] = loc.dist(x, y, z); }
  return pctStatsArr(devs, devs.length, TOL);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Checkpointing helpers (ndjson, INSTANT append — resilience per LAB-CHEATSHEET).
// ─────────────────────────────────────────────────────────────────────────────────────────────
export function plog(m: string): void {
  const { mkdirSync, appendFileSync } = require('node:fs') as typeof import('node:fs');
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}

export function checkpoint(row: Record<string, unknown>): void {
  const { mkdirSync, appendFileSync } = require('node:fs') as typeof import('node:fs');
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key}] ${JSON.stringify(row)}`);
}

export function keyExists(k: string): boolean {
  const { existsSync, readFileSync: rfs } = require('node:fs') as typeof import('node:fs');
  if (!existsSync(NDJSON)) return false;
  return rfs(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } });
}

export function readRow(k: string): Record<string, unknown> | null {
  const { existsSync, readFileSync: rfs } = require('node:fs') as typeof import('node:fs');
  if (!existsSync(NDJSON)) return null;
  for (const l of rfs(NDJSON, 'utf8').split('\n').filter(Boolean)) {
    try { const r = JSON.parse(l); if (r.key === k) return r; } catch { /* */ }
  }
  return null;
}
