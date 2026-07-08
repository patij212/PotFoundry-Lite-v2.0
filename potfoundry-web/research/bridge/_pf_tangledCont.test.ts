// _pf_tangledCont.test.ts — DEV-ONLY (env-gated). E-2026-07-08-TANGLED-CONTINUATION.
//
// Continuation of the tangled/weave class after the Gyroid pilot (E-2026-07-08-TANGLED-KERNEL, REFUTED-for-Gyroid).
// Priority order (sequential): Voronoi → HexagonalHive → CelticTriquetra → CelticKnot → Crystalline → BasketWeave.
//
// THE PILOT'S LOAD-BEARING MANDATE (now enforced per style): the BVH twin is the trustworthy VERDICT driver on a
// style ONLY if its own on-surface residual (twinOnSurfaceResidual) ≪ tol. Measured in the pilot: Voronoi 0.0077
// @2048² SOUND; Gyroid 0.05-0.075 UNSOUND. The SOUND grid-free radial same-(u,t) bound (wholeMeshGuardRadialBound,
// 0 ⇒ PROVABLY ≤tol) is ALWAYS a sound upper-bound verdict but OVERSTATES ~2-3× on near-vertical channel walls
// (Gyroid density-floor artifact). So per style: (1) instrument-gate FIRST (twinOnSurf + is the radial bound
// density-responsive or density-invariant), (2) mechanism (deep-sag chordTolMm sweep), (3) close / floor / GYROID-CLASS.
//
// PROBES (each its own env gate + ndjson checkpoint → resume/env-kill safe):
//   PF_TC_GATE=<Style>   — instrument-gate: twinOnSurf @2048²/3072², anchor _best20 mesh under BOTH BVH + radial bound.
//   PF_TC_SWEEP=<Style>  — deep-sag chordTolMm sweep driven by the GATED instrument until 0 OR kill.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildTangled, wholeMeshGuardBVH, wholeMeshGuardRadialBound, twinBandLimit, auditNonManRaw, radiusFn,
  type TangledBuild, type BvhWhole, type SoundScore,
} from './_pf_tangledKernelLib';
import { celticTriquetraC0Predicate } from './_ct_creaseLib';
import { scoreWholeMeshBVH } from './_pf_bvhRuler';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_tangled_cont');
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
function projFullPot(outerTris: number): number { return 2 * outerTris; }

// Load a persisted _best20 reaching mesh (xyz+idx bins) → (ut, idx). Both flat and _bins-nested layouts supported.
function loadReaching(style: string): { ut: number[]; idx: Uint32Array; tris: number } {
  const base = join('research', 'exchange', '_best20', 'heatmap');
  const cand = [
    { xyz: join(base, `${style}.xyz.bin`), idx: join(base, `${style}.idx.bin`) },
    { xyz: join(base, `${style}_bins`, `${style}.xyz.bin`), idx: join(base, `${style}_bins`, `${style}.idx.bin`) },
  ];
  const pick = cand.find((c) => existsSync(c.xyz) && existsSync(c.idx));
  if (!pick) throw new Error(`no _best20 bins for ${style}`);
  const xb = readFileSync(pick.xyz); const ib = readFileSync(pick.idx);
  const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
  const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  const nV = xyz.length / 3; const ut: number[] = new Array(nV * 2);
  for (let i = 0; i < nV; i++) { const x = xyz[3 * i], y = xyz[3 * i + 1], z = xyz[3 * i + 2]; let u = Math.atan2(y, x) / (2 * Math.PI); if (u < 0) u += 1; ut[2 * i] = u; ut[2 * i + 1] = Math.min(1, Math.max(0, z / DIMS.H)); }
  return { ut, idx, tris: idx.length / 3 };
}

// ── INSTRUMENT GATE (TWO CHECKPOINTS, each written the INSTANT computed → env-kill resumable) ────────────────────
// Step A (CHEAP, ~30-90s): twinOnSurf @2048²/3072² only — decides BVH SOUND vs UNSOUND (Gyroid-class). No mesh scoring.
// Step B (EXPENSIVE, minutes on 1M+ tri _best20): anchor the reaching mesh under the radial bound (always) + BVH (if
//   twin sound) — reproduces the V10b baseline. Skipped independently if already done.
// Split so a kill during B still banks the sound/unsound triage from A. CHECKPOINT the INSTANT each is computed.
function runGate(style: StyleId, doAnchor: boolean): void {
  mkdirSync(join(DIR, style), { recursive: true });
  const gatePath = join(DIR, style, 'gate.ndjson');
  const rA = radiusFn(style, DIMS);
  // ── Step A: twin soundness (cheap) ──
  // SOUNDNESS BASIS = 2048² twinOnSurf (the pilot's measured basis: Voronoi 0.0077 SOUND / Gyroid 0.075 UNSOUND).
  // 2048² is ~2.25× cheaper than 3072² and the decision boundary (≪ tol=0.01) is unambiguous at either density.
  let twinSound = false;
  if (!labelDone(style, 'gate.ndjson', 'twin')) {
    const t0 = Date.now();
    const bl2048 = twinBandLimit(rA, DIMS.H, { nTheta: 2048, nZ: 2048 });
    twinSound = bl2048.maxMm >= 0 && bl2048.maxMm < 0.005; // ≪ tol=0.01
    const row = {
      label: 'twin', style,
      twin2048OnSurfMax: bl2048.maxMm, twin2048OnSurfP99: bl2048.p99Mm, twinSound, ms: Date.now() - t0,
    };
    appendFileSync(gatePath, JSON.stringify(row) + '\n');
    // eslint-disable-next-line no-console
    console.log(`GATE-TWIN ${style}: twinOnSurf 2048=${bl2048.maxMm}/${bl2048.p99Mm} SOUND=${twinSound} | ${row.ms}ms`);
  } else {
    const r = readNdjson(gatePath).find((x) => x.label === 'twin');
    twinSound = Boolean(r?.twinSound);
    process.stderr.write(`  SKIP gate-twin ${style} (done, sound=${twinSound})\n`);
  }
  // ── Step B: anchor the reaching mesh (expensive) — TWO independent checkpoints (each written the INSTANT computed):
  //   B1 = radial-bound (grid-free, NO twin, the SOUND upper-bound verdict) — cheaper, lands first.
  //   B2 = BVH (needs the 3072² twin; only run if twinSound) — the V10b-comparable cross-reference.
  if (!doAnchor) return;
  let reaching: { ut: number[]; idx: Uint32Array; tris: number } | null = null;
  try { reaching = loadReaching(style); } catch (e) { process.stderr.write(`  (no _best20 mesh for ${style}: ${String(e)})\n`); }
  if (!reaching) return;
  // B1 radial-bound
  if (!labelDone(style, 'gate.ndjson', 'anchorRadial')) {
    const t1 = Date.now();
    const sound: SoundScore = wholeMeshGuardRadialBound(rA, DIMS.H, reaching.ut, reaching.idx, 0.01);
    const row = {
      label: 'anchorRadial', style, tris: reaching.tris,
      soundRadialOutliers: sound.outliers, soundRadialMax: sound.maxMm, soundRadialP99: sound.p99, soundRadialP50: sound.p50,
      zeroArea: sound.zeroArea, ms: Date.now() - t1,
    };
    appendFileSync(gatePath, JSON.stringify(row) + '\n');
    if (sound.outlierUt.length) appendFileSync(join(DIR, style, 'anchor_radial_outliers.ndjson'), sound.outlierUt.map((o) => JSON.stringify({ u: o[0], t: o[1], dev: o[2] })).join('\n') + '\n');
    // eslint-disable-next-line no-console
    console.log(`GATE-ANCHOR-RADIAL ${style}: reaching tris=${row.tris} soundRadialOut=${row.soundRadialOutliers}(max ${row.soundRadialMax} p99 ${row.soundRadialP99}) zeroArea=${row.zeroArea} | ${row.ms}ms`);
  } else { process.stderr.write(`  SKIP gate-anchorRadial ${style} (done)\n`); }
  // B2 BVH (twin-sound styles only)
  if (twinSound && !labelDone(style, 'gate.ndjson', 'anchorBVH')) {
    const t2 = Date.now();
    try {
      const bvh: BvhWhole = wholeMeshGuardBVH(rA, DIMS.H, reaching.ut, reaching.idx, 0.01, TWIN);
      const row = { label: 'anchorBVH', style, tris: reaching.tris, twinSound, bvhOutliers: bvh.interiorOutliers, bvhMax: bvh.wholeMeshMaxMm, bvhP99: bvh.p99, twinOnSurfMax: bvh.twinOnSurfMax, ms: Date.now() - t2 };
      appendFileSync(gatePath, JSON.stringify(row) + '\n');
      if (bvh.outlierUt.length) appendFileSync(join(DIR, style, 'anchor_bvh_outliers.ndjson'), bvh.outlierUt.map((o) => JSON.stringify({ u: o[0], t: o[1], dev: o[2] })).join('\n') + '\n');
      // eslint-disable-next-line no-console
      console.log(`GATE-ANCHOR-BVH ${style}: bvhOut=${row.bvhOutliers}(max ${row.bvhMax} p99 ${row.bvhP99}) twinOnSurf=${row.twinOnSurfMax} | ${row.ms}ms`);
    } catch (e) { process.stderr.write(`  BVH err: ${String(e)}\n`); }
  } else if (!twinSound) { process.stderr.write(`  SKIP gate-anchorBVH ${style} (twin UNSOUND — Gyroid-class, BVH not a verdict here)\n`); }
}

// ── DEEP-SAG SWEEP driven by the GATED instrument. driver='bvh' (twin-sound styles) or 'radial' (sound upper bound).
interface Pass {
  style: string; label: string; chordTolMm: number; driver: string; tris: number; points: number; hitBudget: boolean;
  outliers: number; maxMm: number; p99: number; zeroArea: number; nonMan: number; projFullPot: number;
  soundRadialOutliers: number; soundRadialMax: number; buildMs: number; scoreMs: number;
  excl?: { predBand: number; excludedSamples: number; totalSamples: number; facetsAllExcluded: number };
}

function runSweep(
  style: StyleId, chordSweep: number[], maxPointsSweep: number[],
  driver: 'bvh' | 'radial', excludePred?: (u: number, t: number) => boolean, excludeBand?: number,
): void {
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
      if (prior) { traj.push(prior.outliers); prevOut = prior.outliers; if (prior.outliers === 0) converged = true; process.stderr.write(`  SKIP ${style}/${label} (done out=${prior.outliers})\n`); if (converged) break; continue; }
    }
    const b: TangledBuild = buildTangled(style, DIMS, { chordTolMm, maxPoints });
    lastBuild = b;
    // Always compute the SOUND radial-bound as the cross-check (grid-free, 0 ⇒ provably ≤tol).
    const scoreT0 = Date.now();
    const sound: SoundScore = wholeMeshGuardRadialBound(rA, DIMS.H, b.ut, b.idx, 0.01);
    let outliers = sound.outliers, maxMm = sound.maxMm, p99 = sound.p99;
    let excl: Pass['excl'] | undefined;
    if (driver === 'bvh') {
      const xyz = new Float64Array((b.ut.length / 2) * 3);
      for (let i = 0; i < b.ut.length / 2; i++) { const th = 2 * Math.PI * b.ut[2 * i], z = b.ut[2 * i + 1] * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
      const s = scoreWholeMeshBVH(xyz, b.idx, rA, DIMS.H, TWIN, { tol: 0.01, radialPrefilter: true, twinValidate: 'full', ...(excludePred ? { exclude: excludePred } : {}) });
      outliers = s.interiorOutliers; maxMm = s.wholeMeshMaxMm; p99 = s.p99;
      if (excludePred) excl = { predBand: excludeBand ?? 0, excludedSamples: s.excludedSamples ?? 0, totalSamples: s.totalSamples ?? 0, facetsAllExcluded: s.facetsAllExcluded ?? 0 };
    }
    const scoreMs = Date.now() - scoreT0;
    const nonMan = auditNonManRaw(b.idx);
    const pass: Pass = {
      style, label, chordTolMm, driver, tris: b.tris, points: b.points, hitBudget: b.hitBudget,
      outliers, maxMm, p99, zeroArea: sound.zeroArea, nonMan, projFullPot: projFullPot(b.tris),
      soundRadialOutliers: sound.outliers, soundRadialMax: sound.maxMm, buildMs: b.ms, scoreMs, excl,
    };
    appendFileSync(passPath, JSON.stringify(pass) + '\n');
    if (sound.outlierUt.length) appendFileSync(join(DIR, style, `outliers_${label}.ndjson`), sound.outlierUt.map((o) => JSON.stringify({ u: o[0], t: o[1], dev: o[2] })).join('\n') + '\n');
    traj.push(pass.outliers);
    // eslint-disable-next-line no-console
    console.log(`PASS ${style}/${label} (driver=${driver}): tris=${pass.tris} pts=${pass.points} hitBudget=${pass.hitBudget} | outliers=${pass.outliers} max=${pass.maxMm} p99=${pass.p99} | soundRadial=${pass.soundRadialOutliers}(max ${pass.soundRadialMax}) | zeroArea=${pass.zeroArea} nonMan=${pass.nonMan} projFullPot=${pass.projFullPot}${excl ? ` | exclFrac=${(excl.excludedSamples / Math.max(1, excl.totalSamples)).toFixed(4)}` : ''} | build=${pass.buildMs}ms score=${pass.scoreMs}ms`);
    if (pass.outliers === 0) { converged = true; break; }
    if (Math.abs(pass.outliers - prevOut) < 0.1 * Math.max(1, prevOut) && pass.outliers > 1000) plateauRun++; else plateauRun = 0;
    prevOut = pass.outliers;
    if (pass.projFullPot > 6_000_000) { process.stderr.write(`  KILL ${style}: projFullPot ${pass.projFullPot} > 6M\n`); break; }
    if (plateauRun >= 4) { process.stderr.write(`  KILL ${style}: outliers plateau >1000 for 4 passes\n`); break; }
  }
  appendFileSync(finalPath, JSON.stringify({ label: 'final', style, driver, converged, killed: !converged, trajectory: traj, finalTris: lastBuild?.tris ?? 0, projFullPot: lastBuild ? projFullPot(lastBuild.tris) : 0 }) + '\n');
  // eslint-disable-next-line no-console
  console.log(`FINAL ${style} (driver=${driver}): converged=${converged} trajectory=[${traj.join(',')}] finalTris=${lastBuild?.tris ?? 0}`);
}

const HRS = 60 * 60 * 1000;

// PF_TC_TWIN=1 → cheap twin-soundness triage for ALL six styles in one run (no mesh scoring). Resumable per style.
describe('E-2026-07-08-TANGLED-CONTINUATION — twin soundness triage', () => {
  it.skipIf(process.env.PF_TC_TWIN !== '1')('twin soundness (all styles)', () => {
    for (const style of ['Voronoi', 'HexagonalHive', 'CelticTriquetra', 'CelticKnot', 'Crystalline', 'BasketWeave'] as const) {
      runGate(style as StyleId, false);
    }
    expect(true).toBe(true);
  }, 3 * HRS);
});

// PF_TC_GATE=<Style> → twin (if not done) + anchor the _best20 reaching mesh (expensive; one style at a time).
describe('E-2026-07-08-TANGLED-CONTINUATION — instrument gate + anchor', () => {
  for (const style of ['Voronoi', 'HexagonalHive', 'CelticTriquetra', 'CelticKnot', 'Crystalline', 'BasketWeave'] as const) {
    it.skipIf(process.env.PF_TC_GATE !== style)(`gate ${style}`, () => {
      runGate(style as StyleId, true);
      expect(true).toBe(true);
    }, 3 * HRS);
  }
});

describe('E-2026-07-08-TANGLED-CONTINUATION — deep-sag sweep', () => {
  // Voronoi: BVH-sound (pilot: twinOnSurf 0.0077@2048²). Drive on BVH interiorOutliers.
  it.skipIf(process.env.PF_TC_SWEEP !== 'Voronoi')('Voronoi', () => {
    runSweep('Voronoi' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000], 'bvh');
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TC_SWEEP !== 'HexagonalHive')('HexagonalHive', () => {
    runSweep('HexagonalHive' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000], 'bvh');
    expect(true).toBe(true);
  }, 6 * HRS);

  // CelticTriquetra: BVH + validated C0-crease exclusion (creases are designed features). band 2e-3 (V11c recall 0.968).
  it.skipIf(process.env.PF_TC_SWEEP !== 'CelticTriquetra')('CelticTriquetra', () => {
    const band = 2e-3;
    const pred = celticTriquetraC0Predicate(band, {}, { gridN: 3072, gridT: 2048 });
    runSweep('CelticTriquetra' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000], 'bvh', pred, band);
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TC_SWEEP !== 'CelticKnot')('CelticKnot', () => {
    runSweep('CelticKnot' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000], 'bvh');
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TC_SWEEP !== 'Crystalline')('Crystalline', () => {
    runSweep('Crystalline' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000], 'bvh');
    expect(true).toBe(true);
  }, 6 * HRS);

  it.skipIf(process.env.PF_TC_SWEEP !== 'BasketWeave')('BasketWeave', () => {
    runSweep('BasketWeave' as StyleId, [0.03, 0.015, 0.008, 0.004], [700_000, 1_400_000, 2_400_000, 3_000_000], 'bvh');
    expect(true).toBe(true);
  }, 6 * HRS);
});
