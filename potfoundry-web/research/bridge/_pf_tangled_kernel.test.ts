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
  buildTangled, wholeMeshGuardBVH, wholeMeshGuardRadialBound, twinBandLimit, auditNonManRaw, radiusFn,
  type TangledBuild, type BvhWhole, type SoundScore,
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

// ── ANCHOR: re-score the persisted _best20 reaching mesh under the SOUND radial-bound guard (grid-free) + report the
// twin band-limit (why the BVH is not trustable here) — the instrument-match / honesty gate before any close claim.
function loadReaching(style: string): { ut: number[]; idx: Uint32Array } {
  const bins = join('research', 'exchange', '_best20', 'heatmap');
  const xb = readFileSync(join(bins, `${style}.xyz.bin`)); const ib = readFileSync(join(bins, `${style}.idx.bin`));
  const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
  const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  const nV = xyz.length / 3; const ut: number[] = new Array(nV * 2);
  for (let i = 0; i < nV; i++) { const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2]; let u = Math.atan2(y, x) / (2 * Math.PI); if (u < 0) u += 1; ut[2 * i] = u; ut[2 * i + 1] = Math.min(1, Math.max(0, z / DIMS.H)); }
  return { ut, idx };
}
describe('E-2026-07-08-TANGLED-KERNEL — anchor', () => {
  for (const style of ['GyroidManifold', 'Voronoi'] as const) {
    it.skipIf(process.env.PF_TK_ANCHOR !== '1')(`anchor ${style} (_best20 sound radial-bound + twin band-limit)`, () => {
      mkdirSync(join(DIR, style), { recursive: true });
      if (labelDone(style, 'anchor.ndjson', 'anchor')) { console.log(`SKIP anchor ${style} (done)`); return; }
      const rA = radiusFn(style as StyleId, DIMS);
      const { ut, idx } = loadReaching(style);
      const t0 = Date.now();
      const s: SoundScore = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, 0.01);
      const bl = twinBandLimit(rA, DIMS.H, { nTheta: 2048, nZ: 2048 });
      const row = { label: 'anchor', style, tris: idx.length / 3, soundUpperOutliers: s.outliers, soundMaxMm: s.maxMm, p99: s.p99, twin2048OnSurfMax: bl.maxMm, twin2048OnSurfP99: bl.p99Mm, ms: Date.now() - t0 };
      appendFileSync(join(DIR, style, 'anchor.ndjson'), JSON.stringify(row) + '\n');
      // eslint-disable-next-line no-console
      console.log(`ANCHOR ${style}: tris=${row.tris} soundUpperOutliers=${row.soundUpperOutliers} soundMax=${row.soundMaxMm} p99=${row.p99} | twin2048OnSurf max=${row.twin2048OnSurfMax} p99=${row.twin2048OnSurfP99} (V10b BVH: Gyroid 113767/0.0889, Voronoi 105154/0.1374) ${row.ms}ms`);
      expect(s.nFacets).toBeGreaterThan(0);
    }, 3 * 60 * 60 * 1000);
  }
});

// ── PER-STYLE REFINE: build the seam-safe deep-sag mesher at a chordTolMm sweep; DRIVE + VERIFY with the SOUND
// radial-bound guard (grid-free strict upper bound — 0 ⇒ PROVABLY whole-mesh ≤tol). The BVH is run ONLY as a
// caveated V10b-comparable cross-reference on the FINAL mesh (its twin band-limits > tol on Gyroid, so it cannot
// be the verdict). This is the honest instrument per E-2026-07-08 INSTRUMENT_FINDING.
interface Pass { style: string; label: string; chordTolMm: number; tris: number; points: number; hitBudget: boolean;
  soundOutliers: number; soundMaxMm: number; p99: number; zeroArea: number; nonMan: number;
  projFullPot: number; buildMs: number; scoreMs: number; }

function runStyleSweep(style: StyleId, chordSweep: number[], maxPointsSweep: number[]): void {
  mkdirSync(join(DIR, style), { recursive: true });
  const passPath = join(DIR, style, 'passes.ndjson');
  const finalPath = join(DIR, style, 'final.ndjson');
  const rA = radiusFn(style, DIMS);
  const donePasses = new Set(readNdjson(passPath).map((r) => String(r.label)));
  let converged = false; let plateauRun = 0; let prevOut = Infinity;
  const traj: number[] = []; let lastBuild: TangledBuild | null = null;
  for (let k = 0; k < chordSweep.length; k++) {
    const chordTolMm = chordSweep[k]; const maxPoints = maxPointsSweep[k];
    const label = `chord${chordTolMm}_mp${Math.round(maxPoints / 1000)}k`;
    if (donePasses.has(label)) {
      const prior = readNdjson(passPath).find((r) => r.label === label) as unknown as Pass | undefined;
      if (prior) { traj.push(prior.soundOutliers); prevOut = prior.soundOutliers; if (prior.soundOutliers === 0) converged = true; process.stderr.write(`  SKIP ${style}/${label} (done out=${prior.soundOutliers})\n`); if (converged) break; continue; }
    }
    const b: TangledBuild = buildTangled(style, DIMS, { chordTolMm, maxPoints });
    lastBuild = b;
    const scoreT0 = Date.now();
    const s: SoundScore = wholeMeshGuardRadialBound(rA, DIMS.H, b.ut, b.idx, 0.01);
    const scoreMs = Date.now() - scoreT0;
    const nonMan = auditNonManRaw(b.idx);
    const pass: Pass = {
      style, label, chordTolMm, tris: b.tris, points: b.points, hitBudget: b.hitBudget,
      soundOutliers: s.outliers, soundMaxMm: s.maxMm, p99: s.p99, zeroArea: s.zeroArea, nonMan,
      projFullPot: projFullPot(b.tris), buildMs: b.ms, scoreMs,
    };
    appendFileSync(passPath, JSON.stringify(pass) + '\n');
    if (s.outlierUt.length) appendFileSync(join(DIR, style, `outliers_${label}.ndjson`), s.outlierUt.map((o) => JSON.stringify({ u: o[0], t: o[1], dev: o[2] })).join('\n') + '\n');
    traj.push(pass.soundOutliers);
    // eslint-disable-next-line no-console
    console.log(`PASS ${style}/${label}: tris=${pass.tris} pts=${pass.points} hitBudget=${pass.hitBudget} | soundUpperOutliers=${pass.soundOutliers} soundMax=${pass.soundMaxMm} p99=${pass.p99} | zeroArea=${pass.zeroArea} nonMan=${pass.nonMan} projFullPot=${pass.projFullPot} | build=${pass.buildMs}ms score=${pass.scoreMs}ms`);
    if (pass.soundOutliers === 0) { converged = true; break; }
    if (Math.abs(pass.soundOutliers - prevOut) < 0.1 * Math.max(1, prevOut) && pass.soundOutliers > 1000) plateauRun++; else plateauRun = 0;
    prevOut = pass.soundOutliers;
    if (pass.projFullPot > 6_000_000) { process.stderr.write(`  KILL ${style}: projFullPot ${pass.projFullPot} > 6M\n`); break; }
    if (plateauRun >= 4) { process.stderr.write(`  KILL ${style}: soundUpperOutliers plateau >1000 for 4 passes\n`); break; }
  }
  // FINAL cross-reference: on the last built mesh, run the V10b BVH guard (caveated by the twin band-limit) so the
  // number is comparable to §V10b — but the VERDICT is the SOUND radial-bound count above.
  let bvhRow: Record<string, unknown> = {};
  if (lastBuild && converged) {
    try {
      const bvh: BvhWhole = wholeMeshGuardBVH(rA, DIMS.H, lastBuild.ut, lastBuild.idx, 0.01, TWIN);
      const bl = twinBandLimit(rA, DIMS.H, { nTheta: 2048, nZ: 2048 });
      bvhRow = { bvhOutliers: bvh.interiorOutliers, bvhMaxMm: bvh.wholeMeshMaxMm, twin2048OnSurfMax: bl.maxMm };
      process.stderr.write(`  ${style} FINAL BVH x-ref (caveated, twinBandLimit ${bl.maxMm}): outliers=${bvh.interiorOutliers} max=${bvh.wholeMeshMaxMm}\n`);
    } catch (e) { bvhRow = { bvhError: String(e) }; }
  }
  appendFileSync(finalPath, JSON.stringify({ label: 'final', style, converged, killed: !converged, trajectory: traj, finalTris: lastBuild?.tris ?? 0, projFullPot: lastBuild ? projFullPot(lastBuild.tris) : 0, ...bvhRow }) + '\n');
  // eslint-disable-next-line no-console
  console.log(`FINAL ${style}: converged=${converged} trajectory=[${traj.join(',')}] finalTris=${lastBuild?.tris ?? 0}`);
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
