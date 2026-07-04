// _gf_gothic_recon.test.ts — DEV-ONLY (PF_GF_GOTHIC=1). E-2026-07-04-GF-GOTHIC recon (the cheapest discriminator).
//
// MECHANISM QUESTION (no meshing): the GD-GOTHIC diagnosis proved 93.5% of Gothic's worst true-3D facets are on the
// near-vertical rib CREST/flank (gradU_arc med 0.82 / p90 3.46 mm-radius per mm-arc; gradT med 0.40 / p90 3.15). The
// task lever = lay explicit flank STRIPS (rows ACROSS the flank, perpendicular to the crest) at a fine pitch sized
// from the TRUE-3D gradient. BUT before building strips, MEASURE whether the flank is even flank-pitch-RESPONSIVE:
//   For each embedded crest, walk the flank (both sides, crest -> adjacent valley) and measure the TRUE-3D chord a
//   flat strip facet incurs at a given flank pitch. If a single crest->valley chord is huge but N sub-rows collapse
//   it toward <=0.01, strips WILL help (analog: DragonScales nZband). If it FLOORS above 0.02 even as pitch->0 (a
//   knife-edge cusp the flat facet cannot follow because the flank is a near-vertical CLIFF), strips CANNOT help =>
//   steep-EXCLUDE. Also compares u-flank vs t-flank so the strip is laid on the STEEP axis.
//
// This is pure surface geometry (rA sampled along flank rays), so it is SECONDS, not a build. It DECIDES the verdict
// direction before any 90-minute mesh build. CHECKPOINT each crest-family + pitch row.
//
// ISOLATION: NEW files only. Reuses labkit rulers + _cu_gothicsegLib READ-ONLY. Writes ONLY research/exchange/_gf_gothic/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, type AnalyticRadiusFn } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { extractGothicCrestSegments, type CrestExtractOpts, type CrestExtractResult } from './_cu_gothicsegLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const DIR = join(process.cwd(), 'research', 'exchange', '_gf_gothic');
const NDJSON = join(DIR, 'recon.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };

// lift (u,t) -> 3D on the true surface
function lift(rA: AnalyticRadiusFn, u: number, t: number): [number, number, number] {
  const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}
// true-3D distance of point P to the straight segment A..B (all 3D)
function segDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
  let tt = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(p[0] - (a[0] + tt * dx), p[1] - (a[1] + tt * dy), p[2] - (a[2] + tt * dz));
}

// Find the adjacent VALLEY (radial min) on one side of a crest, walking in +/- u at fixed t.
function findValley(rA: AnalyticRadiusFn, uCrest: number, t: number, dir: number, maxDu: number): number {
  const z = t * H; const N = 400; let uPrev = uCrest, rPrev = rA(TAU * (uCrest - Math.floor(uCrest)), z);
  for (let i = 1; i <= N; i++) {
    const u = uCrest + dir * maxDu * (i / N);
    const r = rA(TAU * (u - Math.floor(u)), z);
    if (r > rPrev) return uPrev; // radius started climbing again => uPrev was the valley
    uPrev = u; rPrev = r;
  }
  return uCrest + dir * maxDu; // never turned => valley at window edge
}
// same but in t (arch-rib flank runs in z): find adjacent valley in +/- t at fixed u.
function findValleyT(rA: AnalyticRadiusFn, u: number, tCrest: number, dir: number, maxDt: number): number {
  const th = TAU * (u - Math.floor(u)); const N = 400; let tPrev = tCrest, rPrev = rA(th, tCrest * H);
  for (let i = 1; i <= N; i++) {
    const t = Math.max(0, Math.min(1, tCrest + dir * maxDt * (i / N)));
    const r = rA(th, t * H);
    if (r > rPrev) return tPrev;
    tPrev = t; rPrev = r;
  }
  return Math.max(0, Math.min(1, tCrest + dir * maxDt));
}

// Given crest endpoint A and valley endpoint B (in (u,t) with one coord fixed), compute the WORST true-3D chord of
// the flank when split into `nRows` equal-(param) strips: for each strip [p_i, p_{i+1}] sample the surface at the
// strip midpoint and measure its 3D distance to the straight strip chord. Returns worst over all strips + params.
function flankChord(
  rA: AnalyticRadiusFn, aU: number, aT: number, bU: number, bT: number, nRows: number,
): number {
  let worst = 0;
  for (let i = 0; i < nRows; i++) {
    const s0 = i / nRows, s1 = (i + 1) / nRows;
    const p0 = lift(rA, aU + (bU - aU) * s0, aT + (bT - aT) * s0);
    const p1 = lift(rA, aU + (bU - aU) * s1, aT + (bT - aT) * s1);
    // sample several interior points of this strip against its chord (surface may bow WITHIN a strip)
    for (let k = 1; k <= 7; k++) {
      const sm = s0 + (s1 - s0) * (k / 8);
      const pm = lift(rA, aU + (bU - aU) * sm, aT + (bT - aT) * sm);
      const d = segDist(pm, p0, p1);
      if (d > worst) worst = d;
    }
  }
  return worst;
}

const EXTRACT: CrestExtractOpts = { nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true };
const EXCACHE = join(process.cwd(), 'research', 'exchange', '_gd_gothic', 'extract.cache.json'); // reuse GD's cached extraction

function loadExtract(rA: AnalyticRadiusFn): CrestExtractResult {
  if (existsSync(EXCACHE)) {
    try { const c = JSON.parse(readFileSync(EXCACHE, 'utf8')); if (c.points && c.crestUt) { plog(`extract: CACHE hit (GD) peaks=${c.nPeaks}`); return c as CrestExtractResult; } } catch { /* re-extract */ }
  }
  const t0 = Date.now(); const ex = extractGothicCrestSegments(rA, H, EXTRACT);
  plog(`extract FRESH peaks=${ex.nPeaks} in ${((Date.now() - t0) / 1000).toFixed(1)}s`); return ex;
}

describe('gf-gothic recon: is the rib FLANK flank-pitch-responsive?', () => {
  // A) U-FLANK: for a sample of embedded crests, measure crest->valley true-3D chord vs nRows (flank sub-rows in u).
  it.skipIf(process.env.PF_GF_GOTHIC !== '1')('recon-uflank', () => {
    if (rowExists('uflank-N16')) { plog('uflank exists, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const ex = loadExtract(rA);
    // sample crest points across the wall; keep those that are genuine u-walls (steep gradU)
    const crestUt = ex.crestUt;
    const du = 1 / 8192;
    const samples: Array<{ u: number; t: number; gradU: number }> = [];
    for (let i = 0; i + 1 < crestUt.length; i += 2) {
      const u = crestUt[i], t = crestUt[i + 1];
      const z = t * H;
      const gU = Math.abs(rA(TAU * ((u + du) - Math.floor(u + du)), z) - rA(TAU * ((u - du) - Math.floor(u - du)), z)) / (2 * du * TAU);
      samples.push({ u, t, gradU: gU });
    }
    // sort by gradU desc, take the steepest 400 u-walls (the worst-facet population)
    samples.sort((a, b) => b.gradU - a.gradU);
    const steep = samples.slice(0, 400);
    plog(`uflank: ${steep.length} steep crest samples, gradU range ${steep[steep.length - 1].gradU.toFixed(1)}..${steep[0].gradU.toFixed(1)} mm/rad`);
    const maxDu = 1 / 72 / 2 * 1.2; // half a bay (72 slots) + margin
    for (const nRows of [1, 2, 4, 8, 16]) {
      const chords: number[] = [];
      let maxValleyDu = 0;
      for (const s of steep) {
        for (const dir of [1, -1]) {
          const uV = findValley(rA, s.u, s.t, dir, maxDu);
          const dvu = Math.abs(uV - s.u); if (dvu > maxValleyDu) maxValleyDu = dvu;
          if (dvu < 1e-6) continue;
          chords.push(flankChord(rA, s.u, s.t, uV, s.t, nRows));
        }
      }
      chords.sort((a, b) => a - b);
      const p50 = chords[Math.floor(0.5 * chords.length)] ?? 0;
      const p99 = chords[Math.min(chords.length - 1, Math.floor(0.99 * chords.length))] ?? 0;
      const mx = chords[chords.length - 1] ?? 0;
      // pitch = mean flank arc-length / nRows: median valley-du * r * TAU / nRows
      const pitchMm = (maxValleyDu * 48 * TAU) / nRows; // rough worst pitch in mm-arc
      const row = { key: `uflank-N${nRows}`, axis: 'u', nRows, nSteep: steep.length, nChord: chords.length, worstPitchMmArc: +pitchMm.toFixed(4), chordP50: +p50.toFixed(4), chordP99: +p99.toFixed(4), chordMax: +mx.toFixed(4) };
      checkpoint(row);
      plog(`uflank N=${nRows}: chordP99=${p99.toFixed(4)} chordMax=${mx.toFixed(4)} worstPitch~${pitchMm.toFixed(4)}mm`);
    }
    expect(steep.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  // B) T-FLANK: same but the arch-rib runs in z, so flank across it is in t. Detect crests that are ALSO t-walls.
  it.skipIf(process.env.PF_GF_GOTHIC !== '1')('recon-tflank', () => {
    if (rowExists('tflank-N16')) { plog('tflank exists, skip'); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const ex = loadExtract(rA);
    const crestUt = ex.crestUt;
    const dt = 1 / 8192;
    const samples: Array<{ u: number; t: number; gradT: number }> = [];
    for (let i = 0; i + 1 < crestUt.length; i += 2) {
      const u = crestUt[i], t = crestUt[i + 1]; const th = TAU * (u - Math.floor(u));
      const tzHi = Math.min(1, t + dt) * H, tzLo = Math.max(0, t - dt) * H;
      const gT = Math.abs(rA(th, tzHi) - rA(th, tzLo)) / Math.max(1e-9, tzHi - tzLo);
      samples.push({ u, t, gradT: gT });
    }
    samples.sort((a, b) => b.gradT - a.gradT);
    const steep = samples.slice(0, 400);
    plog(`tflank: ${steep.length} steep-t crest samples, gradT range ${steep[steep.length - 1].gradT.toFixed(3)}..${steep[0].gradT.toFixed(3)} mm/mmz`);
    const maxDt = 0.05; // z-flank window (fraction of wall)
    for (const nRows of [1, 2, 4, 8, 16]) {
      const chords: number[] = [];
      for (const s of steep) {
        for (const dir of [1, -1]) {
          const tV = findValleyT(rA, s.u, s.t, dir, maxDt);
          if (Math.abs(tV - s.t) < 1e-6) continue;
          chords.push(flankChord(rA, s.u, s.t, s.u, tV, nRows));
        }
      }
      chords.sort((a, b) => a - b);
      const p99 = chords[Math.min(chords.length - 1, Math.floor(0.99 * chords.length))] ?? 0;
      const mx = chords[chords.length - 1] ?? 0;
      const row = { key: `tflank-N${nRows}`, axis: 't', nRows, nSteep: steep.length, nChord: chords.length, chordP99: +p99.toFixed(4), chordMax: +mx.toFixed(4) };
      checkpoint(row);
      plog(`tflank N=${nRows}: chordP99=${p99.toFixed(4)} chordMax=${mx.toFixed(4)}`);
    }
    expect(steep.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);
});
