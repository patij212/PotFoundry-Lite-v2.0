// flipBlocker.probe.test.ts — TRACK B: what ACTUALLY blocks flipping __pfPerfectMesher (+ __pfRegionLayer) to default.
//
// DEV-ONLY, env-gated (PF_FLIPBLOCK), NEW FILE — no src/ edit, no flag flipped to default. Measures the FLAG-ON
// production wall builders vs the FLAG-OFF default, on the SAME analytic surface, with the SAME true-3D + sliver +
// watertight-by-index instruments (labkit). One env-selectable phase per question so a killed run resumes cheaply;
// every row is fsync-appended the instant it is computed.
//
// PHASES:
//   PF_FLIPBLOCK=default  — flag-OFF buildConformingOuterWall (the current production outer-wall primitive) for
//                            {GeometricStar, DragonScales, GothicArches}. The baseline "what ships today".
//   PF_FLIPBLOCK=region   — flag-ON (both __pfRegionLayer + __pfPerfectMesher) buildRegionOuterWall (the CERTIFIED
//                            M=g/h² region kernel, DS with its conforming graph) for {GeometricStar, DragonScales}.
//                            The realistic flag-on candidate for the two region-eligible allow-listed styles.
//   PF_FLIPBLOCK=gothic-conv — the base-flag intractability witness: bounded refineToZeroOutliers over the FULL pot
//                            (Gothic is count-unstable but NOT region-eligible ⇒ it can ONLY take buildTierCOuterWall's
//                            serial full-pot refine). maxPass bounded + per-pass ndjson: shows it does not reach 0.
//
// Run: PF_FLIPBLOCK=default npx vitest run research/bridge/flipBlocker.probe.test.ts
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import {
  buildConformingOuterWall,
  type ConformingOuterWallOptions,
  type ConformingOuterWallResult,
} from '../../src/renderers/webgpu/parametric/conforming/ConformingOuterWall';
import {
  buildRegionOuterWall,
  buildProtectedComplex,
  refineToZeroOutliers,
  DEFAULT_RULER,
  type ChartDomain,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/index';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import type { StyleId } from '../../src/geometry/types';
import {
  perFaceTrue3DSag,
  perFaceChordSag,
  auditNonManByIndex,
  triangleQualityDistribution,
} from './labkit';

const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OUT_DIR = join('research', 'exchange', '_flipBlocker');
function appendRow(phase: string, obj: unknown): void {
  try { mkdirSync(OUT_DIR, { recursive: true }); appendFileSync(join(OUT_DIR, `${phase}.ndjson`), JSON.stringify(obj) + '\n'); } catch { /* best-effort */ }
}

type RA = (theta: number, z: number) => number;

/** Lift a (u,t,0)-packed ConformingOuterWallResult to {ut, xyz, indices} on the exact analytic surface. */
function liftWall(wall: ConformingOuterWallResult, rA: RA, H: number): { ut: number[]; xyz: Float64Array; indices: Uint32Array } {
  const nV = wall.vertices.length / 3;
  const ut = new Array<number>(nV * 2);
  const xyz = new Float64Array(nV * 3);
  const TAU = 2 * Math.PI;
  for (let i = 0; i < nV; i++) {
    const u = wall.vertices[3 * i], t = wall.vertices[3 * i + 1];
    ut[2 * i] = u; ut[2 * i + 1] = t;
    const th = TAU * u, z = t * H, r = rA(th, z);
    xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z;
  }
  return { ut, xyz, indices: wall.indices };
}

/** Undirected boundary-edge count (edges used by exactly one triangle) — the pre-assembly open-seam diagnostic. */
function boundaryEdges(indices: ArrayLike<number>): number {
  const use = new Map<string, number>();
  for (let f = 0; f < indices.length / 3; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]] as const) {
      const k = i < j ? `${i}_${j}` : `${j}_${i}`;
      use.set(k, (use.get(k) ?? 0) + 1);
    }
  }
  let bnd = 0; for (const n of use.values()) if (n === 1) bnd++;
  return bnd;
}

interface WallRow {
  style: string; mode: string; tris: number; verts: number; buildMs: number;
  true3d_max: number; true3d_over01: number; true3d_over03: number; radial_max: number;
  minAngle: number; pctBelow20: number; degenerate: number;
  nonManIndex: number; nonManCracked: number; boundaryEdges: number;
}

function measureWall(style: string, mode: string, wall: ConformingOuterWallResult, rA: RA, H: number, buildMs: number): WallRow {
  const { ut, xyz, indices } = liftWall(wall, rA, H);
  const nF = indices.length / 3;
  const t3 = perFaceTrue3DSag(ut, indices, rA, H);
  const rad = perFaceChordSag(ut, indices, rA, H);
  const qual = triangleQualityDistribution({ vertices: xyz as unknown as Float32Array, indices });
  const nonMan = auditNonManByIndex(xyz, indices);
  // Non-vacuous control: duplicate one triangle onto an existing edge ⇒ the audit MUST move.
  const cracked = new Uint32Array(indices.length + 3);
  cracked.set(indices); cracked[indices.length] = indices[0]; cracked[indices.length + 1] = indices[1]; cracked[indices.length + 2] = indices[2];
  const nonManCracked = auditNonManByIndex(xyz, cracked);
  return {
    style, mode, tris: nF, verts: ut.length / 2, buildMs: Math.round(buildMs),
    true3d_max: +t3.worstMm.toFixed(4), true3d_over01: +t3.fracOver(0.01).toFixed(4), true3d_over03: +t3.fracOver(0.03).toFixed(4),
    radial_max: +rad.worstMm.toFixed(4),
    minAngle: qual.minAngleDeg, pctBelow20: qual.pctBelow20, degenerate: qual.degenerateCount,
    nonManIndex: nonMan, nonManCracked, boundaryEdges: boundaryEdges(indices),
  };
}

function printRow(r: WallRow): void {
  // eslint-disable-next-line no-console
  console.log(
    `${r.style.padEnd(15)} ${r.mode.padEnd(12)} tris=${String(r.tris).padStart(7)} ` +
    `3dMax=${r.true3d_max.toFixed(4)} over.01=${(r.true3d_over01 * 100).toFixed(2)}% radMax=${r.radial_max.toFixed(3)} ` +
    `minAng=${r.minAngle.toFixed(1)} %<20=${r.pctBelow20.toFixed(1)} degen=${r.degenerate} ` +
    `nonMan=${r.nonManIndex}(crack=${r.nonManCracked}) bnd=${r.boundaryEdges} ${(r.buildMs / 1000).toFixed(1)}s`,
  );
}

function setFlag(name: '__pfPerfectMesher' | '__pfRegionLayer', on: boolean): void {
  (globalThis as unknown as Record<string, boolean>)[name] = on;
}

// Representative production-ish outer-wall config (mirrors the PEC self-probe at ParametricExportComputer.ts:2314).
const WALL_OPTS: ConformingOuterWallOptions = {
  maxSagMm: 0.05, maxEdgeMm: 8, minEdgeMm: 0.2, gradeRatio: 2, maxLevel: 10, resU: 128, resT: 128,
};
const REGION_MAXPOINTS = process.env.PF_FB_MAXPTS ? parseInt(process.env.PF_FB_MAXPTS, 10) : 1_200_000;

describe('flip-blocker: flag-ON production wall builders vs flag-OFF default', () => {
  const phase = process.env.PF_FLIPBLOCK;

  it.skipIf(phase !== 'default')('DEFAULT (flag-OFF) buildConformingOuterWall — GeoStar / DS / Gothic', () => {
    setFlag('__pfPerfectMesher', false); setFlag('__pfRegionLayer', false);
    const styles: StyleId[] = ['GeometricStar', 'DragonScales', 'GothicArches'];
    for (const style of styles) {
      try {
        const sampler = styleSampler(style, {}, DIMS);
        const rA = buildAnalyticRadiusFn(style, {}, DIMS);
        const t0 = Date.now();
        const wall = buildConformingOuterWall(sampler, WALL_OPTS);
        const row = measureWall(style, 'default-off', wall, rA, DIMS.H, Date.now() - t0);
        printRow(row); appendRow('default', row);
      } catch (e) { appendRow('default', { style, error: String(e) }); /* eslint-disable-next-line no-console */ console.log(`${style} ERROR ${String(e)}`); }
    }
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  it.skipIf(phase !== 'region')('REGION (flag-ON: __pfRegionLayer + __pfPerfectMesher) buildRegionOuterWall — GeoStar / DS', () => {
    setFlag('__pfPerfectMesher', true); setFlag('__pfRegionLayer', true);
    const styles: StyleId[] = ['GeometricStar', 'DragonScales'];
    try {
      for (const style of styles) {
        try {
          const rA = buildAnalyticRadiusFn(style, {}, DIMS);
          const t0 = Date.now();
          const wall = buildRegionOuterWall(
            { analyticRA: rA, H: DIMS.H, nRing: 256, tolMm: 0.05, hMin: 0.2, hMax: 8, sizeRes: 128, maxPoints: REGION_MAXPOINTS, chordTolMm: 0.05 },
            style,
          );
          if (!wall) { appendRow('region', { style, error: 'buildRegionOuterWall returned undefined (flag/style gate)' }); continue; }
          const row = measureWall(style, 'region-on', wall, rA, DIMS.H, Date.now() - t0);
          printRow(row); appendRow('region', row);
        } catch (e) { appendRow('region', { style, error: String(e) }); /* eslint-disable-next-line no-console */ console.log(`${style} ERROR ${String(e)}`); }
      }
    } finally { setFlag('__pfPerfectMesher', false); setFlag('__pfRegionLayer', false); }
    expect(true).toBe(true);
  }, 90 * 60 * 1000);

  it.skipIf(phase !== 'gothic-conv')('GOTHIC base-flag convergence witness: full-pot serial refine does NOT reach 0 (bounded)', () => {
    // Gothic is count-unstable but NOT region-eligible ⇒ flag-ON routes it to buildTierCOuterWall's serial full-pot
    // refineToZeroOutliers(maxPass:16) — which THROWS on cap. This bounded run (maxPass small) captures the outlier
    // trajectory + per-pass cost so the non-convergence (⇒ production export throw) is measured, not asserted.
    const MAXPASS = process.env.PF_FB_GOTHPASS ? parseInt(process.env.PF_FB_GOTHPASS, 10) : 3;
    const sampler = styleSampler('GothicArches', {}, DIMS);
    const complex = buildProtectedComplex(sampler, 'GothicArches');
    const domain: ChartDomain = { uLo: 0, uHi: 1, tLo: 0, tHi: 1 };
    const t0 = Date.now();
    let capped = false; let lastOut = -1; let lastTris = 0;
    try {
      const refined = refineToZeroOutliers(sampler, complex, domain, {
        tolMm: 0.01, maxPass: MAXPASS, bulkPasses7pt: 4, bgArcMm: 0.35, ruler: DEFAULT_RULER,
      }, (s) => {
        lastOut = s.outliers; lastTris = s.nTris;
        appendRow('gothic-conv', { pass: s.pass, tris: s.nTris, outliers: s.outliers, worstMm: +s.worstMm.toFixed(5), inserted: s.inserted, ms: Math.round(s.ms), sinceStartS: Math.round((Date.now() - t0) / 1000) });
      });
      capped = refined.capped;
      lastTris = refined.tris.length / 3;
      appendRow('gothic-conv', { done: true, capped, passes: refined.passes, finalTris: lastTris, sec: Math.round((Date.now() - t0) / 1000) });
    } catch (e) {
      appendRow('gothic-conv', { threw: String(e), lastOut, lastTris, sec: Math.round((Date.now() - t0) / 1000) });
    }
    // eslint-disable-next-line no-console
    console.log(`[gothic-conv] capped=${capped} lastOutliers=${lastOut} lastTris=${lastTris} ${(Date.now() - t0) / 1000}s`);
    expect(true).toBe(true);
  }, 40 * 60 * 1000);
});
