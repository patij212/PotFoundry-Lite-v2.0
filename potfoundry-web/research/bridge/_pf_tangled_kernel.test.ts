// _pf_tangled_kernel.test.ts — DEV-ONLY (env-gated). E-2026-07-08-TANGLED-KERNEL.
//
// Dispatch the whole-mesh honest perfect-mesher mechanism to the TANGLED class. PILOT: Gyroid + Voronoi.
//
// RULER DECISION (E-2026-07-08 INSTRUMENT_FINDING, research/exchange/_tangled_kernel/): the θ-window analytic grid
// brute (V10e production ruler) LIES on Gyroid ±0.024mm — grid-trapped in wrong local minima on the fine multi-well
// r(θ,z). So the VERDICT + STOP-driver here is `wholeMeshGuardBVH` = the EXACT V10b basis (dense radial twin 3072² +
// BVH closest-point + the SOUND radial same-azimuth prefilter, a grid-free strict analytic upper bound), directly
// comparable to the §V10b scorecard (Gyroid 113767/0.0889, Voronoi 105154/0.1374). Every facet, no top-N guard.
//
// The build is the seam-safe inhouse deep-sag mesher (buildInhouseMetricMesh chordSteiner) — the tangled protected
// complex is EMPTY (spec §4). The kernel job = drive refinement toward honest whole-mesh ≤0.01 by tightening
// chordTolMm, re-scoring EVERY facet with the BVH guard after each build (the honest-true-3D STOP driver).
//
// PROBES (each its own env gate + ndjson checkpoint → resume/env-kill safe):
//   PF_TK_ANCHOR      — re-score the persisted _best20 reaching mesh under wholeMeshGuardBVH → reproduce V10b baseline.
//   PF_TANGLED_KERNEL — per-style chordTolMm sweep + BVH whole-mesh guard until 0 outliers OR kill. Gyroid, Voronoi.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTangled, wholeMeshGuardBVH, twinBandLimit, auditNonManRaw, radiusFn,
  type TangledBuild, type BvhWhole,
} from './_pf_tangledKernelLib';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_tangled_kernel');
const TWIN = { nTheta: 3072, nZ: 3072 }; // V10b density

function readNdjson(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const ln of readFileSync(path, 'utf8').split('\n')) { if (!ln.trim()) continue; try { rows.push(JSON.parse(ln)); } catch { /* skip */ } }
  return rows;
}
function labelDone(style: string, file: string, label: string): boolean {
  return readNdjson(join(DIR, style, file)).some((r) => r.label === label);
}
// full-pot projection: the tangled mesh IS the full ring (u 0..1, t 0..1) outer wall already; report 2× outer as a
// conservative full-pot est (inner wall + base/rim add ~the same order).
function projFullPot(outerTris: number): number { return 2 * outerTris; }

// ── ANCHOR: re-score the persisted _best20 reaching mesh under the BVH whole-mesh guard (instrument-match) ────────
describe('E-2026-07-08-TANGLED-KERNEL — anchor', () => {
  for (const style of ['GyroidManifold', 'Voronoi'] as const) {
    it.skipIf(process.env.PF_TK_ANCHOR !== '1')(`anchor ${style} (_best20 re-score vs V10b)`, () => {
      mkdirSync(join(DIR, style), { recursive: true });
      if (labelDone(style, 'anchor.ndjson', 'anchor')) { console.log(`SKIP anchor ${style} (done)`); return; }
      const bins = join('research', 'exchange', '_best20', 'heatmap');
      const xb = readFileSync(join(bins, `${style}.xyz.bin`)); const ib = readFileSync(join(bins, `${style}.idx.bin`));
      const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
      const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
      const rA = radiusFn(style as StyleId, DIMS);
      const nV = xyz.length / 3; const ut: number[] = new Array(nV * 2);
      for (let i = 0; i < nV; i++) { const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2]; let u = Math.atan2(y, x) / (2 * Math.PI); if (u < 0) u += 1; ut[2 * i] = u; ut[2 * i + 1] = Math.min(1, Math.max(0, z / DIMS.H)); }
      const t0 = Date.now();
      const s = wholeMeshGuardBVH(rA, DIMS.H, ut, idx, 0.01, TWIN,
        (d, tot, no, w) => { if (d % Math.max(1, Math.floor(tot / 8)) < (tot / 200)) process.stderr.write(`  anchor ${style} ${d}/${tot} out=${no} worst=${w.toFixed(4)}\n`); });
      const row = { label: 'anchor', style, tris: idx.length / 3, outliers: s.interiorOutliers, maxMm: s.wholeMeshMaxMm, p99: s.p99, twinOnSurfMax: s.twinOnSurfMax, ms: Date.now() - t0 };
      appendFileSync(join(DIR, style, 'anchor.ndjson'), JSON.stringify(row) + '\n');
      // eslint-disable-next-line no-console
      console.log(`ANCHOR ${style}: tris=${row.tris} outliers=${row.outliers} max=${row.maxMm} p99=${row.p99} twinOnSurf=${row.twinOnSurfMax} (V10b: Gyroid 113767/0.0889, Voronoi 105154/0.1374) ${row.ms}ms`);
      expect(s.nFacets).toBeGreaterThan(0);
    }, 6 * 60 * 60 * 1000);
  }
});

// ── PER-STYLE REFINE: build deep-sag mesher at a chordTolMm sweep, score EVERY facet with the BVH guard ──────────
interface Pass { style: string; label: string; chordTolMm: number; tris: number; points: number; hitBudget: boolean;
  outliers: number; maxMm: number; p99: number; zeroArea: number; nonMan: number; twinOnSurfMax: number;
  projFullPot: number; buildMs: number; scoreMs: number; }

function runStyleSweep(style: StyleId, chordSweep: number[], maxPointsSweep: number[]): void {
  mkdirSync(join(DIR, style), { recursive: true });
  const passPath = join(DIR, style, 'passes.ndjson');
  const finalPath = join(DIR, style, 'final.ndjson');
  const rA = radiusFn(style, DIMS);
  // one-time twin band-limit report (numbers, for honesty)
  if (!existsSync(join(DIR, style, 'twin.json'))) {
    const bl = twinBandLimit(rA, DIMS.H, TWIN);
    appendFileSync(join(DIR, style, 'twin.json'), JSON.stringify({ twin: TWIN, ...bl }) + '\n');
    process.stderr.write(`  ${style} twin band-limit: max=${bl.maxMm} p99=${bl.p99Mm} (must be << tol 0.01)\n`);
  }
  const donePasses = new Set(readNdjson(passPath).map((r) => String(r.label)));
  let converged = false; let plateauRun = 0; let prevOut = Infinity;
  const traj: number[] = [];
  for (let k = 0; k < chordSweep.length; k++) {
    const chordTolMm = chordSweep[k]; const maxPoints = maxPointsSweep[k];
    const label = `chord${chordTolMm}_mp${Math.round(maxPoints / 1000)}k`;
    if (donePasses.has(label)) {
      const prior = readNdjson(passPath).find((r) => r.label === label) as unknown as Pass | undefined;
      if (prior) { traj.push(prior.outliers); prevOut = prior.outliers; if (prior.outliers === 0) converged = true; process.stderr.write(`  SKIP ${style}/${label} (done out=${prior.outliers})\n`); if (converged) break; continue; }
    }
    const b: TangledBuild = buildTangled(style, DIMS, { chordTolMm, maxPoints });
    const scoreT0 = Date.now();
    const s: BvhWhole = wholeMeshGuardBVH(rA, DIMS.H, b.ut, b.idx, 0.01, TWIN,
      (d, tot, no, w) => { if (d % Math.max(1, Math.floor(tot / 6)) < (tot / 200)) process.stderr.write(`    ${style}/${label} score ${d}/${tot} out=${no} worst=${w.toFixed(4)}\n`); });
    const scoreMs = Date.now() - scoreT0;
    const nonMan = auditNonManRaw(b.idx);
    const pass: Pass = {
      style, label, chordTolMm, tris: b.tris, points: b.points, hitBudget: b.hitBudget,
      outliers: s.interiorOutliers, maxMm: s.wholeMeshMaxMm, p99: s.p99, zeroArea: s.zeroArea, nonMan,
      twinOnSurfMax: s.twinOnSurfMax, projFullPot: projFullPot(b.tris), buildMs: b.ms, scoreMs,
    };
    appendFileSync(passPath, JSON.stringify(pass) + '\n');
    if (s.outlierUt.length) appendFileSync(join(DIR, style, `outliers_${label}.ndjson`), s.outlierUt.map((o) => JSON.stringify({ u: o[0], t: o[1], dev: o[2] })).join('\n') + '\n');
    traj.push(pass.outliers);
    // eslint-disable-next-line no-console
    console.log(`PASS ${style}/${label}: tris=${pass.tris} pts=${pass.points} hitBudget=${pass.hitBudget} | outliers=${pass.outliers} max=${pass.maxMm} p99=${pass.p99} | zeroArea=${pass.zeroArea} nonMan=${pass.nonMan} twinOnSurf=${pass.twinOnSurfMax} projFullPot=${pass.projFullPot} | build=${pass.buildMs}ms score=${pass.scoreMs}ms`);
    if (pass.outliers === 0) { converged = true; break; }
    if (Math.abs(pass.outliers - prevOut) < 0.1 * Math.max(1, prevOut) && pass.outliers > 1000) plateauRun++; else plateauRun = 0;
    prevOut = pass.outliers;
    if (pass.projFullPot > 6_000_000) { process.stderr.write(`  KILL ${style}: projFullPot ${pass.projFullPot} > 6M\n`); break; }
    if (plateauRun >= 4) { process.stderr.write(`  KILL ${style}: outliers plateau >1000 for 4 passes\n`); break; }
  }
  appendFileSync(finalPath, JSON.stringify({ label: 'final', style, converged, trajectory: traj, killed: !converged }) + '\n');
  // eslint-disable-next-line no-console
  console.log(`FINAL ${style}: converged=${converged} trajectory=[${traj.join(',')}]`);
}

describe('E-2026-07-08-TANGLED-KERNEL — per-style honest-driven refine', () => {
  it.skipIf(process.env.PF_TANGLED_KERNEL !== '1')('GyroidManifold', () => {
    if (labelDone('GyroidManifold', 'final.ndjson', 'final')) { const f = readNdjson(join(DIR, 'GyroidManifold', 'final.ndjson')).find((r) => r.label === 'final'); if (f && f.converged) { console.log('SKIP Gyroid (converged)'); return; } }
    runStyleSweep('GyroidManifold' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000]);
    expect(true).toBe(true);
  }, 6 * 60 * 60 * 1000);

  it.skipIf(process.env.PF_TANGLED_KERNEL !== '1')('Voronoi', () => {
    if (labelDone('Voronoi', 'final.ndjson', 'final')) { const f = readNdjson(join(DIR, 'Voronoi', 'final.ndjson')).find((r) => r.label === 'final'); if (f && f.converged) { console.log('SKIP Voronoi (converged)'); return; } }
    runStyleSweep('Voronoi' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000]);
    expect(true).toBe(true);
  }, 6 * 60 * 60 * 1000);
});
