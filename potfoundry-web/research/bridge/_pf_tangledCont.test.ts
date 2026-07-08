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
import { worstFacetsByRadial, newtonNearest } from './_gyroid_truthLib';
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

// ── NEWTON TRUTH-FLOOR (V11j §3 adjudication, the SOUND grid-free true-3D verdict) ───────────────────────────────
// The radial bound is a SOUND UPPER bound but OVERSTATES ~2-9× on near-vertical walls (Gyroid: 206k radial → ~12k
// true-3D, 8-9× inflated). The grid-free multi-start Newton (newtonNearest, VALIDATED truth-grade in §V11j) is the
// honest true-3D nearest. Recipe: extract the worst-N radial-flagged facets (the sound upper-bound population) + a
// stratified random sample of the radial-outlier facets, Newton-score each → honest true-3D dev per facet → (a) worst
// true-3D max, (b) TRUE-outlier fraction of the radial population (→ scaled honest count), (c) wall-slope + (u,t)
// scatter to classify CLIFF-CLASS (designed near-vertical walls) vs distributed body gap. Newton ≈ a few ms/facet ⇒
// worst-3000 + 3000 stratified is tractable (~minutes) even under contention. CHECKPOINT the row + scatter ndjson.
function newtonN(rA: (th: number, z: number) => number, H: number): (px: number, py: number, pz: number) => number {
  return (px, py, pz) => newtonNearest(rA, H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 5, nZSeeds: 5, maxIter: 40 }).dist;
}
// Cost control: newtonNearest is ~200ms/call (coarse-grid seed insurance). facetTrue3D does 45 calls/facet ⇒ too
// expensive at scale. Instead score ONLY the facet's WORST-radial-bound sample point (1 Newton/facet) — the true-3D
// worst is at/near the radial worst on near-vertical walls (radial is a per-sample upper bound), and this is the V11j
// worst-POINT recipe. Returns the true-3D dev at the worst-radial sample. `bary` = the DENSE lattice from the lib.
const DENSE_TF = ((): Array<[number, number, number]> => { const B: Array<[number, number, number]> = []; const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]); return B; })();
function facetTrue3DWorstPoint(
  rec: { verts: [number, number, number][] }, rA: (th: number, z: number) => number, H: number,
  nearest: (px: number, py: number, pz: number) => number,
): number {
  const [A, B, C] = rec.verts;
  const TAU2 = 2 * Math.PI;
  const radBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > H) return Infinity; const th = Math.atan2(py, px); return Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + TAU2 : th, pz)); };
  // pick the sample with the max radial bound (cheap), then Newton it (expensive, once)
  let bwa = 1, bwb = 0, bwc = 0, bB = -1;
  for (const [wa, wb, wc] of DENSE_TF) {
    const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2];
    const b = radBound(px, py, pz); if (b > bB) { bB = b; bwa = wa; bwb = wb; bwc = wc; }
  }
  const px = bwa * A[0] + bwb * B[0] + bwc * C[0], py = bwa * A[1] + bwb * B[1] + bwc * C[1], pz = bwa * A[2] + bwb * B[2] + bwc * C[2];
  return nearest(px, py, pz);
}
function runTruthFloor(
  style: StyleId, meshSource: 'best20', topWorst: number, nStrat: number, tol = 0.01,
  excludePred?: (u: number, t: number) => boolean, exclLabel?: string,
): void {
  mkdirSync(join(DIR, style), { recursive: true });
  const fp = join(DIR, style, 'truthfloor.ndjson');
  const rowLabel = exclLabel ? `truthfloor_${exclLabel}` : 'truthfloor';
  if (labelDone(style, 'truthfloor.ndjson', rowLabel)) { process.stderr.write(`  SKIP ${rowLabel} ${style} (done)\n`); return; }
  const rA = radiusFn(style, DIMS);
  const { ut, idx, tris } = loadReaching(style); void meshSource;
  const t0 = Date.now();
  // 1) all facets ranked by radial bound → the radial-outlier population (sound upper bound). Take worst-N for the
  //    max/wall-slope + a stratified sample across the rest of the radial-outlier tail for the honest fraction.
  const big = worstFacetsByRadial(rA, DIMS.H, ut, idx, tris); // topN=tris ⇒ full ranked list
  const radialOutliersAll = big.recs.filter((r) => r.radialDev > tol);
  // CREASE EXCLUSION (designed features): drop radial-outlier facets whose centroid (u,t) is on a crease locus. Report
  // exclFrac honestly — the excluded facets are the designed C0 braid/medallion creases, adjudicated as feature edges.
  const nRadialRaw = radialOutliersAll.length;
  const radialOutliers = excludePred ? radialOutliersAll.filter((r) => !excludePred(r.uc, r.tc)) : radialOutliersAll;
  const nExcluded = nRadialRaw - radialOutliers.length;
  const exclFrac = nRadialRaw ? nExcluded / nRadialRaw : 0;
  const nRadial = radialOutliers.length;
  const nearest = newtonN(rA, DIMS.H);
  // worst-N (the fat tail) — full Newton
  const worstSet = radialOutliers.slice(0, Math.min(topWorst, nRadial));
  // stratified sample of the REST (uniform over the remaining radial-outlier ranks) for the true-outlier fraction
  const rest = radialOutliers.slice(worstSet.length);
  const stratIdx: number[] = [];
  if (rest.length > 0) { const step = Math.max(1, Math.floor(rest.length / Math.max(1, nStrat))); for (let i = 0; i < rest.length; i += step) stratIdx.push(i); }
  const scatter: Array<{ u: number; t: number; rad: number; tru: number; slope: number }> = [];
  let worstTrue = 0, worstU = 0, worstT = 0;
  const scoreOne = (rec: (typeof radialOutliers)[number]): { tru: number; slope: number } => {
    const tru = facetTrue3DWorstPoint(rec, rA, DIMS.H, nearest);
    // wall-slope proxy: local |d rA/dz| at the worst sample chart coords (near-vertical relief ⇒ large)
    const th = 2 * Math.PI * rec.uc, z = rec.tc * DIMS.H;
    const dz = 0.02; const slope = Math.abs((rA(th, Math.min(DIMS.H, z + dz)) - rA(th, Math.max(0, z - dz))) / (2 * dz));
    if (tru > worstTrue) { worstTrue = tru; worstU = rec.uc; worstT = rec.tc; }
    return { tru, slope };
  };
  // worst-N: every one, record scatter
  let worstTrueOut = 0;
  for (const rec of worstSet) { const { tru, slope } = scoreOne(rec); if (tru > tol) worstTrueOut++; if (scatter.length < 4000) scatter.push({ u: +rec.uc.toFixed(5), t: +rec.tc.toFixed(5), rad: +rec.radialDev.toFixed(5), tru: +tru.toFixed(5), slope: +slope.toFixed(3) }); }
  // stratified: fraction of the rest-tail that is TRUE-outlier
  let stratTrueOut = 0, stratScored = 0; let stratSlopeSum = 0;
  for (const i of stratIdx) { const { tru, slope } = scoreOne(rest[i]); stratScored++; if (tru > tol) stratTrueOut++; stratSlopeSum += slope; if (scatter.length < 4000 && tru > tol) scatter.push({ u: +rest[i].uc.toFixed(5), t: +rest[i].tc.toFixed(5), rad: +rest[i].radialDev.toFixed(5), tru: +tru.toFixed(5), slope: +slope.toFixed(3) }); }
  const worstFrac = worstSet.length ? worstTrueOut / worstSet.length : 0;
  const stratFrac = stratScored ? stratTrueOut / stratScored : 0;
  // honest whole-mesh true-3D outlier estimate: worst-N contributes worstTrueOut exactly; the rest-tail contributes
  // rest.length × stratFrac. (Facets with radialDev ≤ tol are PROVABLY ≤ tol — not counted.)
  const honestTrueOutliers = Math.round(worstTrueOut + rest.length * stratFrac);
  // wall-slope of the TRUE outliers (cliff signature): median slope over the scored true-outliers
  const trueSlopes = scatter.filter((s) => s.tru > tol).map((s) => s.slope).sort((a, b) => a - b);
  const slopeMed = trueSlopes.length ? trueSlopes[Math.floor(trueSlopes.length / 2)] : 0;
  const slopeP90 = trueSlopes.length ? trueSlopes[Math.floor(trueSlopes.length * 0.9)] : 0;
  const row = {
    label: rowLabel, style, tris, tol,
    nRadialOutliersRaw: nRadialRaw, nExcluded, exclFrac: +exclFrac.toFixed(4), nRadialOutliers: nRadial,
    worstNscored: worstSet.length, worstTrueOutliers: worstTrueOut, worstFrac: +worstFrac.toFixed(4),
    stratScored, stratTrueOutliers: stratTrueOut, stratFrac: +stratFrac.toFixed(4),
    honestTrueOutliers, honestFracOfRadial: nRadial ? +(honestTrueOutliers / nRadial).toFixed(4) : 0,
    worstTrueMax: +worstTrue.toFixed(5), worstTrueUt: [+worstU.toFixed(5), +worstT.toFixed(5)],
    slopeMed: +slopeMed.toFixed(3), slopeP90: +slopeP90.toFixed(3),
    ms: Date.now() - t0,
  };
  void stratSlopeSum;
  appendFileSync(fp, JSON.stringify(row) + '\n');
  appendFileSync(join(DIR, style, `${rowLabel}_scatter.ndjson`), scatter.map((s) => JSON.stringify(s)).join('\n') + '\n');
  // eslint-disable-next-line no-console
  console.log(`TRUTHFLOOR ${style}${exclLabel ? '/' + exclLabel : ''}: tris=${tris} radialRaw=${nRadialRaw} excl=${nExcluded}(${row.exclFrac}) → nRadialOut=${nRadial} honestTrue=${honestTrueOutliers} (${row.honestFracOfRadial} of remaining) worstTrueMax=${row.worstTrueMax}@${JSON.stringify(row.worstTrueUt)} | slopeMed=${row.slopeMed} slopeP90=${row.slopeP90} | ${row.ms}ms`);
}

const HRS = 60 * 60 * 1000;

describe('E-2026-07-08-TANGLED-CONTINUATION — Newton truth-floor (V11j sound true-3D)', () => {
  for (const style of ['Voronoi', 'HexagonalHive', 'CelticKnot', 'Crystalline', 'BasketWeave'] as const) {
    it.skipIf(process.env.PF_TC_TRUTH !== style)(`truthfloor ${style}`, () => {
      runTruthFloor(style as StyleId, 'best20', 1500, 1500);
      expect(true).toBe(true);
    }, 6 * HRS);
  }
  // CelticTriquetra: creases are designed features. Run BOTH the raw truth-floor AND the C0-crease-EXCLUDED floor
  // (validated celticTriquetraC0Predicate, band 2e-3, V11c recall 0.968). The excluded row = the off-crease body gap.
  it.skipIf(process.env.PF_TC_TRUTH !== 'CelticTriquetra')('truthfloor CelticTriquetra', () => {
    runTruthFloor('CelticTriquetra' as StyleId, 'best20', 1500, 1500); // raw (all facets)
    const band = 2e-3;
    const pred = celticTriquetraC0Predicate(band, {}, { gridN: 3072, gridT: 2048 });
    runTruthFloor('CelticTriquetra' as StyleId, 'best20', 1500, 1500, 0.01, pred, `exclB${band}`); // off-crease
    expect(true).toBe(true);
  }, 6 * HRS);
});

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
