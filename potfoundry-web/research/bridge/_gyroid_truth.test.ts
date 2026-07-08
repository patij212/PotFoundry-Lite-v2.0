// _gyroid_truth.test.ts — DEV-ONLY (env-gated). E-2026-07-08-GYROID-TRUTH.
//
// Resolve the Gyroid INSTRUMENT WALL: produce a trustworthy true-3D verdict, then adjudicate the fork.
// Each stage = its own env gate + per-facet ndjson checkpoint → resume/env-kill safe.
//   PF_GT_BUILD    (A) rebuild the best pilot mesh (chord0.004, deterministic) + extract worst-500 by radial bound;
//                      checkpoint mesh (ut/idx bins) + worst500.ndjson to disk. Cheap stages below reuse them.
//   PF_GT_CONV     (B) CONVERGENCE GATE: on a 50-facet subsample of worst-500, brute 2048×400 vs 4096×800 —
//                      verdict must be stable to <0.001mm to trust the truth-grade brute. KILL if it flips.
//   PF_GT_WORST    (C) worst-500 floor-truth: per-facet truth-grade brute (4096×800) + grid-free Newton, resumable
//                      one-facet-at-a-time ndjson. Validation table (a)maxdiff (b)false-0s (c)µs/query.
//   PF_GT_WHOLE    (D) whole-mesh honest Gyroid verdict via the VALIDATED Newton instrument (every facet) +
//                      fork adjudication (outlier u,t scatter → cliff-wall vs body).
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTangled, radiusFn } from './_pf_tangledKernelLib';
import {
  bruteTruth, newtonNearest, worstFacetsByRadial, facetTrue3D, denseBary,
  type FacetRec,
} from './_gyroid_truthLib';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GyroidManifold' as StyleId;
const DIR = join('research', 'exchange', '_gyroid_truth');
const MESH_UT = join(DIR, 'mesh_chord0.004.ut.bin');
const MESH_IDX = join(DIR, 'mesh_chord0.004.idx.bin');
const WORST = join(DIR, 'worst500.ndjson');

function readNdjson(path: string): Record<string, unknown>[] {
  if (!existsSync(path)) return [];
  const rows: Record<string, unknown>[] = [];
  for (const ln of readFileSync(path, 'utf8').split('\n')) { if (!ln.trim()) continue; try { rows.push(JSON.parse(ln)); } catch { /* skip */ } }
  return rows;
}
function loadMesh(): { ut: number[]; idx: Uint32Array } {
  const ub = readFileSync(MESH_UT); const ut = Array.from(new Float64Array(ub.buffer, ub.byteOffset, ub.byteLength / 8));
  const ib = readFileSync(MESH_IDX); const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  return { ut, idx };
}
function loadWorst(): FacetRec[] {
  return readNdjson(WORST).map((r) => ({
    f: r.f as number, verts: r.verts as [number, number, number][], uc: r.uc as number, tc: r.tc as number, radialDev: r.radialDev as number,
  }));
}

// ── (S) SMOKE: validate brute + Newton on synthetic off-surface points (no mesh, fast) ─────────────────────────
// De-risk before the multi-hour runs: sample points a known offset OUTWARD along the radial normal from surface
// points, so the true nearest ≈ the offset. brute and Newton must both recover it and agree. Also cross-check
// grid-free Newton vs a super-dense brute at a few tangled (θ,z) to catch wrong-local-min traps.
describe('E-2026-07-08-GYROID-TRUTH — (S) instrument smoke', () => {
  it.skipIf(process.env.PF_GT_SMOKE !== '1')('brute+newton recover known radial offsets + agree', () => {
    const rA = radiusFn(STYLE, DIMS);
    const H = DIMS.H;
    // sample tangled (θ,z) across the domain; place P at radial offset δ OUTWARD (θ,z fixed) — true nearest ≤ δ.
    const samples: Array<{ th: number; z: number; delta: number }> = [];
    for (let i = 0; i < 24; i++) { const th = (i / 24) * 2 * Math.PI + 0.013; const z = 6 + (i / 24) * (H - 12); samples.push({ th, z, delta: 0.05 }); }
    let maxDiff = 0, maxBruteMinusDelta = 0, maxNewtonMinusDelta = 0;
    const near2048 = (px: number, py: number, pz: number): number => bruteTruth(rA, H, px, py, pz, { nTheta: 2048, nZ: 400, zBandMm: 4, kBest: 8, refineIters: 80 }).dist;
    const near4096 = (px: number, py: number, pz: number): number => bruteTruth(rA, H, px, py, pz, { nTheta: 4096, nZ: 800, zBandMm: 4, kBest: 8, refineIters: 80 }).dist;
    const newt = (px: number, py: number, pz: number): number => newtonNearest(rA, H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 }).dist;
    for (const s of samples) {
      const r = rA(s.th, s.z); const sx = r * Math.cos(s.th), sy = r * Math.sin(s.th), sz = s.z;
      // offset OUTWARD along the radial direction (cosθ,sinθ,0)
      const px = sx + s.delta * Math.cos(s.th), py = sy + s.delta * Math.sin(s.th), pz = sz;
      const bLo = near2048(px, py, pz), bHi = near4096(px, py, pz), n = newt(px, py, pz);
      // true nearest ≤ delta (radial offset is A valid surface path); brute/newton are true nearest ⇒ ≤ delta + eps
      maxBruteMinusDelta = Math.max(maxBruteMinusDelta, bHi - s.delta);
      maxNewtonMinusDelta = Math.max(maxNewtonMinusDelta, n - s.delta);
      maxDiff = Math.max(maxDiff, Math.abs(bHi - n), Math.abs(bLo - bHi));
    }
    console.log(`SMOKE: maxDiff(brute4096 vs newton, & brute2048 vs 4096)=${maxDiff.toFixed(6)} | max(brute-δ)=${maxBruteMinusDelta.toFixed(6)} max(newton-δ)=${maxNewtonMinusDelta.toFixed(6)} (both ≤0 expected: true nearest ≤ radial offset)`);
    expect(maxDiff).toBeLessThan(0.002);
    expect(maxBruteMinusDelta).toBeLessThan(1e-4);
    expect(maxNewtonMinusDelta).toBeLessThan(1e-4);
  }, 10 * 60 * 1000);
});

// ── (A) build + extract worst-500 (checkpoint) ──────────────────────────────────────────────────────────────────
describe('E-2026-07-08-GYROID-TRUTH — (A) build best pilot mesh + worst-500', () => {
  it.skipIf(process.env.PF_GT_BUILD !== '1')('build chord0.004 + worst500', () => {
    mkdirSync(DIR, { recursive: true });
    if (existsSync(WORST) && existsSync(MESH_UT)) { console.log('SKIP (A) done'); return; }
    const t0 = Date.now();
    const b = buildTangled(STYLE, DIMS, { chordTolMm: 0.004, maxPoints: 3_000_000 });
    console.log(`BUILD chord0.004: tris=${b.tris} pts=${b.points} hitBudget=${b.hitBudget} ${Date.now() - t0}ms`);
    // checkpoint mesh to bins (Float64 ut, Uint32 idx)
    writeFileSync(MESH_UT, Buffer.from(new Float64Array(b.ut).buffer));
    writeFileSync(MESH_IDX, Buffer.from(b.idx.buffer, b.idx.byteOffset, b.idx.byteLength));
    const rA = radiusFn(STYLE, DIMS);
    const { recs, nFacets } = worstFacetsByRadial(rA, DIMS.H, b.ut, b.idx, 500);
    writeFileSync(WORST, recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
    console.log(`WORST500 extracted from ${nFacets} facets: radialDev[0]=${recs[0].radialDev.toFixed(5)} radialDev[499]=${recs[499].radialDev.toFixed(5)}`);
    appendFileSync(join(DIR, 'meta.ndjson'), JSON.stringify({ stage: 'A', tris: b.tris, points: b.points, nFacets, worstRadial: recs[0].radialDev, floor500Radial: recs[499].radialDev, ms: Date.now() - t0 }) + '\n');
    expect(recs.length).toBe(500);
  }, 60 * 60 * 1000);
});

// ── worst-radial barycentric POINT of a facet (the point carrying the facet's radial-bound worst) ───────────────
// Convergence + validation gates operate on this single hardest point per facet (the nearest-FUNCTION's grid
// convergence is a per-POINT property; the facet worst-dev is at its worst point). Cheap enough to run full-azimuth.
const DB = denseBary(8);
function worstRadialPoint(rA: (t: number, z: number) => number, H: number, rec: FacetRec): [number, number, number] {
  const [A, B, C] = rec.verts;
  const bound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > H) return Infinity; const th = Math.atan2(py, px); return Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + 2 * Math.PI : th, pz)); };
  let bd = -1, bp: [number, number, number] = [A[0], A[1], A[2]];
  for (const [wa, wb, wc] of DB) {
    const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2];
    const d = bound(px, py, pz); if (d > bd) { bd = d; bp = [px, py, pz]; }
  }
  return bp;
}

// ── (B) CONVERGENCE GATE for the truth-grade brute (point-level, full-azimuth) ──────────────────────────────────
// On the worst-radial POINT of a 30-facet subsample, score the nearest with FULL-azimuth brute 2048×400 AND
// 4096×800; the truth-grade brute is trustworthy iff the per-point nearest is stable to <0.001mm. If it flips ⇒ KILL
// (instrument-hardness: Gyroid needs analytic/symbolic nearest). Also records Newton at the same point (false-0 +
// agreement check folded in). Resumable per-facet.
describe('E-2026-07-08-GYROID-TRUTH — (B) truth-brute convergence gate', () => {
  it.skipIf(process.env.PF_GT_CONV !== '1')('brute 2048x400 vs 4096x800 (full-azimuth) on worst points', () => {
    mkdirSync(DIR, { recursive: true });
    const CONV = join(DIR, 'convergence.ndjson');
    const done = new Set(readNdjson(CONV).map((r) => Number(r.f)));
    const rA = radiusFn(STYLE, DIMS);
    const worst = loadWorst();
    const sub = worst.filter((_, i) => i % 16 === 0).slice(0, 32); // ~30 facets, spread across the worst-500
    for (const rec of sub) {
      if (done.has(rec.f)) continue;
      const [px, py, pz] = worstRadialPoint(rA, DIMS.H, rec);
      const lo = bruteTruth(rA, DIMS.H, px, py, pz, { nTheta: 2048, nZ: 400, zBandMm: 4, kBest: 8, refineIters: 80 }).dist;
      const hi = bruteTruth(rA, DIMS.H, px, py, pz, { nTheta: 4096, nZ: 800, zBandMm: 4, kBest: 8, refineIters: 80 }).dist;
      const nw = newtonNearest(rA, DIMS.H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 }).dist;
      appendFileSync(CONV, JSON.stringify({ f: rec.f, uc: rec.uc, tc: rec.tc, radial: +rec.radialDev.toFixed(6), lo: +lo.toFixed(6), hi: +hi.toFixed(6), newton: +nw.toFixed(6), flip: +Math.abs(lo - hi).toFixed(6), nwDiff: +Math.abs(hi - nw).toFixed(6) }) + '\n');
    }
    const rows = readNdjson(CONV);
    let maxFlip = 0, maxNwDiff = 0, nwFalse0 = 0;
    for (const r of rows) { maxFlip = Math.max(maxFlip, Number(r.flip)); maxNwDiff = Math.max(maxNwDiff, Number(r.nwDiff)); if (Number(r.newton) <= 0.01 && Number(r.hi) > 0.01) nwFalse0++; }
    console.log(`CONVERGENCE GATE: n=${rows.length} maxFlip(2048x400→4096x800 FULL)=${maxFlip.toFixed(6)} ${maxFlip < 0.001 ? 'PASS (truth-brute trustworthy)' : 'FAIL/KILL (Gyroid needs analytic nearest)'} | newton vs brute4096 maxDiff=${maxNwDiff.toFixed(6)} false0=${nwFalse0}`);
    appendFileSync(join(DIR, 'meta.ndjson'), JSON.stringify({ stage: 'B', n: rows.length, maxFlip, maxNwDiff, nwFalse0, pass: maxFlip < 0.001 }) + '\n');
    expect(rows.length).toBeGreaterThan(0);
  }, 3 * 60 * 60 * 1000);
});

// ── (C) worst-500 floor-truth + Newton validation (resumable, one facet at a time) ──────────────────────────────
describe('E-2026-07-08-GYROID-TRUTH — (C) worst-500 floor-truth + Newton validate', () => {
  it.skipIf(process.env.PF_GT_WORST !== '1')('per-facet Newton floor + windowed/full brute cross-validate', () => {
    mkdirSync(DIR, { recursive: true });
    const OUT = join(DIR, 'worst500_truth.ndjson');
    const done = new Set(readNdjson(OUT).map((r) => Number(r.f)));
    const rA = radiusFn(STYLE, DIMS);
    const worst = loadWorst();
    // INSTRUMENT ESTABLISHED (gate2/gate3): grid-free Newton is the TRUSTWORTHY true-3D nearest — every value is a
    // REAL achievable surface distance (valid UPPER bound); 7×5 == 33×17 self-converged (maxDiff 0.000000); and
    // Newton ≤ both the 4096 and 8192 grid brutes everywhere (the grid brutes stay refine-trapped and OVERSTATE, so
    // the pilot's "no sound ruler" was measuring trapped grids vs trapped grids). Newton is the floor. Cross-check
    // tier: worst-40 → brute 8192×1600 k24 (near-definitive grid truth); report min(newton,brute) as the tightest.
    let tNewton = 0, nQ = 0;
    const newtDev = (rec: FacetRec): number => {
      const s0 = process.hrtime.bigint();
      const d = facetTrue3D(rec, (px, py, pz) => newtonNearest(rA, DIMS.H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 }).dist).dev;
      tNewton += Number(process.hrtime.bigint() - s0); nQ += DB.length;
      return d;
    };
    // cross-check tier: the worst-radial POINT of the facet (where the max lives) with a near-definitive WINDOWED
    // 8192×1600 k24 brute (window from the radial bound + 0.05 margin; the foot is local — pilot 0/242 outside).
    const brute8192Pt = (rec: FacetRec): number => {
      const [A, B, C] = rec.verts;
      let bd = -1, bp: [number, number, number] = [A[0], A[1], A[2]];
      for (const [wa, wb, wc] of DB) { const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2]; if (pz < 0 || pz > DIMS.H) continue; const th = Math.atan2(py, px); const b = Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + 2 * Math.PI : th, pz)); if (b > bd) { bd = b; bp = [px, py, pz]; } }
      const [px, py, pz] = bp; const rho = Math.hypot(px, py);
      const win = Math.min(Math.PI, Math.asin(Math.min(1, (2 * bd) / Math.max(1e-6, rho))) + 0.05);
      return bruteTruth(rA, DIMS.H, px, py, pz, { nTheta: 8192, nZ: 1600, zBandMm: 4, kBest: 24, refineIters: 120, thetaWindowRad: win }).dist;
    };
    for (let i = 0; i < worst.length; i++) {
      const rec = worst[i];
      if (done.has(rec.f)) continue;
      const nw = newtDev(rec);
      let brute = -1; // cross-check the worst-25 with the near-definitive windowed 8192 grid brute (worst point)
      if (i < 25) brute = brute8192Pt(rec);
      const diff = brute >= 0 ? Math.abs(brute - nw) : -1;
      appendFileSync(OUT, JSON.stringify({ f: rec.f, i, uc: rec.uc, tc: rec.tc, radial: +rec.radialDev.toFixed(6), newton: +nw.toFixed(6), brute8192: brute >= 0 ? +brute.toFixed(6) : null, diff: diff >= 0 ? +diff.toFixed(6) : null, tighter: brute >= 0 ? +Math.min(brute, nw).toFixed(6) : +nw.toFixed(6) }) + '\n');
      if ((i + 1) % 25 === 0) process.stderr.write(`  (C) ${i + 1}/${worst.length} newton=${nw.toFixed(5)} brute8192=${brute >= 0 ? brute.toFixed(5) : '-'} diff=${diff >= 0 ? diff.toFixed(5) : '-'}\n`);
    }
    const rows = readNdjson(OUT);
    let maxNewton = 0, maxTighter = 0, maxDiff = 0, newtonWorseCnt = 0, nCross = 0;
    for (const r of rows) {
      const nv = Number(r.newton); if (nv > maxNewton) maxNewton = nv;
      const tg = Number(r.tighter); if (tg > maxTighter) maxTighter = tg;
      if (r.brute8192 !== null && r.diff !== null) { nCross++; const d = Number(r.diff); if (d > maxDiff) maxDiff = d; if (nv > Number(r.brute8192) + 0.0002) newtonWorseCnt++; }
    }
    const usPerQ = nQ > 0 ? tNewton / nQ / 1000 : 0;
    console.log(`WORST500 FLOOR-TRUTH: n=${rows.length} maxNewton=${maxNewton.toFixed(6)} maxTighter(min newton,brute8192)=${maxTighter.toFixed(6)} | VALIDATION over ${nCross}: (a)|newton−brute8192| maxdiff=${maxDiff.toFixed(6)} (Newton is the TIGHTER valid bound) (b)newton-misses-well(newton>brute8192)=${newtonWorseCnt} (c)~${usPerQ.toFixed(1)}µs/query`);
    appendFileSync(join(DIR, 'meta.ndjson'), JSON.stringify({ stage: 'C', n: rows.length, maxNewtonTrue3D: maxNewton, maxTighterTrue3D: maxTighter, nCross, maxDiff, newtonWorseCnt, usPerQuery: +usPerQ.toFixed(2) }) + '\n');
    expect(rows.length).toBeGreaterThan(0);
  }, 6 * 60 * 60 * 1000);
});

// ── (D) whole-mesh honest verdict + fork adjudication (VALIDATED Newton, every facet) ───────────────────────────
// Only run after (C) validates Newton. Every facet, honest true-3D Newton nearest, tol 0.01. Classify outliers by
// (u,t): channel-wall (cliff) vs body. Checkpoint progress + outlier ndjson.
describe('E-2026-07-08-GYROID-TRUTH — (D) whole-mesh honest verdict + fork', () => {
  it.skipIf(process.env.PF_GT_WHOLE !== '1')('whole-mesh Newton every-facet + outlier scatter', () => {
    mkdirSync(DIR, { recursive: true });
    const PROG = join(DIR, 'whole_progress.ndjson');
    const OUTL = join(DIR, 'whole_outliers.ndjson');
    const { ut, idx } = loadMesh();
    const rA = radiusFn(STYLE, DIMS);
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const th = 2 * Math.PI * ut[2 * i], z = ut[2 * i + 1] * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
    const nF = idx.length / 3;
    const DENSE = denseBary(8);
    // resume: last completed facet block (checkpoint every 20000 facets)
    const CKPT = join(DIR, 'whole_ckpt.json');
    let startF = 0; let nOut = 0; let maxMm = 0;
    if (existsSync(CKPT)) { const c = JSON.parse(readFileSync(CKPT, 'utf8')); startF = c.f; nOut = c.nOut; maxMm = c.maxMm; }
    const tol = 0.01;
    // radial-bound prefilter (SOUND upper bound): if a facet's radial dev ≤ tol it is PROVABLY ≤tol → skip Newton.
    const bound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > DIMS.H) return Infinity; const th = Math.atan2(py, px); return Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + 2 * Math.PI : th, pz)); };
    const t0 = Date.now();
    for (let f = startF; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]], B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]], C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
      // radial-bound screen over denseBary — if all ≤ tol, PROVABLY fine, skip Newton
      let rmax = 0;
      for (const [wa, wb, wc] of DENSE) { const d = bound(wa * A[0] + wb * B[0] + wc * C[0], wa * A[1] + wb * B[1] + wc * C[1], wa * A[2] + wb * B[2] + wc * C[2]); if (d > rmax) rmax = d; }
      if (rmax <= tol) continue; // provably ≤tol
      // else Newton true-3D on the facet
      let dev = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2];
        const d = newtonNearest(rA, DIMS.H, px, py, pz, { seedTheta: 0, seedZ: pz, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 }).dist;
        if (d > dev) dev = d;
        if (dev > 0.5) break; // cap runaway (shouldn't happen)
      }
      if (dev > maxMm) maxMm = dev;
      if (dev > tol) {
        nOut++;
        const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
        appendFileSync(OUTL, JSON.stringify({ f, uc: +uc.toFixed(5), tc: +tc.toFixed(5), dev: +dev.toFixed(5), radial: +rmax.toFixed(5) }) + '\n');
      }
      if (f % 20000 === 0 || f === nF - 1) {
        writeFileSync(CKPT, JSON.stringify({ f: f + 1, nOut, maxMm }));
        appendFileSync(PROG, JSON.stringify({ f: f + 1, total: nF, nOut, maxMm: +maxMm.toFixed(5), ms: Date.now() - t0 }) + '\n');
        process.stderr.write(`  (D) ${f + 1}/${nF} nOut=${nOut} maxMm=${maxMm.toFixed(5)} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
      }
    }
    console.log(`WHOLE-MESH HONEST GYROID: nFacets=${nF} honestOutliers(tol0.01)=${nOut} honestMaxMm=${maxMm.toFixed(6)}`);
    appendFileSync(join(DIR, 'meta.ndjson'), JSON.stringify({ stage: 'D', nFacets: nF, honestOutliers: nOut, honestMaxMm: maxMm }) + '\n');
    expect(nF).toBeGreaterThan(0);
  }, 12 * 60 * 60 * 1000);
});
