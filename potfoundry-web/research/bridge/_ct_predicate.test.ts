// _ct_predicate.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// E-2026-07-08-CT-PREDICATE. (a) VALIDATE the CT braid-crease predicate tracks the C0 loci; (b) re-score CT
// dense-basis under crease-locus exclusion at bands 0/1e-3/2e-3, mirroring E-2026-07-07-WEAVE-CREASE-EXCLUDED.
//
//   PF_CT_VALIDATE=1 — fast (CPU grid): predicate-vs-K crease-tracking ratio + tileId-flip check + mask render.
//   PF_CT_PRED=1     — whole-mesh dense-basis BVH re-score with exclusion (3 bands). SLOW (per-band BVH).
//
// RESILIENCE: one env-gated `it` per band; CHECKPOINT one ndjson row per band the INSTANT scored. Edits NOTHING in src/.
//
// KILL CRITERIA (registry E-2026-07-08-CT-PREDICATE): PREDICATE VALID iff crease-tracking ratio (mean K in-band /
// out-band) >= ~3x AND tileId flips across the flagged band on a majority of crease points. COLLAPSE iff excluded
// outliers <=10% of band-0 AND exclFrac<=6% stable both bands. GENUINE iff >=50% survive both bands. MIXED else.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, type StyleDims, dumpRenderBins } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { scoreWholeMeshBVH, loadBinMesh } from './_pf_bvhRuler';
import { celticTriquetraCreasePredicate, celticTriquetraC0Predicate, ctReliefField, bandTileId, ctParams } from './_ct_creaseLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TOL = 0.01;
const OUT = join('research', 'exchange', '_ct_predicate');
const NDJSON = join(OUT, 'scorecard.ndjson');
const CT_BINS = join('research', 'exchange', '_best20', 'heatmap', 'CelticTriquetra_bins');
const TWIN = { nTheta: 3072, nZ: 3072 }; // EXACT V10b CT twin.

const plog = (m: string): void => { mkdirSync(OUT, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT, 'run.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const keyExists = (k: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === k; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(OUT, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

// ── K(u,t): C0 kink magnitude = max local |2nd central difference| of relief h across u and t. ─
// A smooth region has K→0 (2nd diff ~ h''·dx² small); a C0 kink has K ~ O(|Δslope|·dx) that does NOT vanish
// relative to smooth neighbours at this step. We report it as a crease proxy and compare in-band vs out-band.
function buildKField(nu: number, nt: number): { K: Float64Array; nu: number; nt: number; du: number; dt: number } {
  const h = ctReliefField();
  const du = 1 / nu, dt = 1 / nt;
  const K = new Float64Array(nu * nt);
  const at = (u: number, t: number): number => h(u, t);
  for (let j = 0; j < nt; j++) {
    const t = (j + 0.5) * dt;
    if (t < 0.1 || t > 0.95) continue; // relief lives in the bands+medallion; skip empty walls
    for (let i = 0; i < nu; i++) {
      const u = (i + 0.5) * du;
      const c = at(u, t);
      const kU = Math.abs(at(u + du, t) - 2 * c + at(u - du, t));
      const kT = Math.abs(at(u, Math.min(0.999, t + dt)) - 2 * c + at(u, Math.max(0.001, t - dt)));
      K[j * nu + i] = Math.max(kU, kT);
    }
  }
  return { K, nu, nt, du, dt };
}

describe('CT-PREDICATE validation — crease-tracking ratio + tileId-flip', () => {
  it.skipIf(process.env.PF_CT_VALIDATE !== '1')('predicate tracks the C0 loci', () => {
    const nu = 2048, nt = 1536;
    plog(`[validate] building K field ${nu}x${nt}...`);
    const { K, du, dt } = buildKField(nu, nt);
    const P = ctParams();
    plog(`[validate] CT params Nx=${P.Nx} Ny=${P.Ny} halfW=${P.halfW} medR=${P.medR} medY=${P.medY} gap=${P.gap}`);

    for (const band of [1e-3, 2e-3]) {
      const pred = celticTriquetraCreasePredicate(band);
      // Crease-tracking ratio: mean K inside flagged band vs outside, over cells with relief present (K nonzero region).
      let inSum = 0, inN = 0, outSum = 0, outN = 0;
      // Also: high-K localization — what fraction of the TOP-K cells (the real creases) are flagged (recall).
      const cells: Array<{ k: number; flagged: boolean }> = [];
      for (let j = 0; j < nt; j++) {
        const t = (j + 0.5) * dt;
        if (t < 0.1 || t > 0.95) continue;
        for (let i = 0; i < nu; i++) {
          const u = (i + 0.5) * du;
          const k = K[j * nu + i];
          if (k === 0) continue;
          const f = pred(u, t);
          if (f) { inSum += k; inN++; } else { outSum += k; outN++; }
          cells.push({ k, flagged: f });
        }
      }
      const meanIn = inN ? inSum / inN : 0, meanOut = outN ? outSum / outN : 0;
      const ratio = meanOut > 0 ? meanIn / meanOut : Infinity;
      // recall of the true creases: fraction of the top-1% K cells that are flagged.
      cells.sort((a, b) => b.k - a.k);
      const topN = Math.max(1, Math.floor(0.01 * cells.length));
      let topFlagged = 0; for (let i = 0; i < topN; i++) if (cells[i].flagged) topFlagged++;
      const recallTop1 = topFlagged / topN;
      const flaggedFrac = cells.length ? cells.filter((c) => c.flagged).length / cells.length : 0;

      // tileId flip: on flagged tile-edge crease points, does the upper-band tileId differ on the two sides?
      let flipTot = 0, flipYes = 0;
      for (let s = 0; s < 4000; s++) {
        const u = (s * 0.6180339887) % 1;
        const t = UPPER_Y0_sample(s);
        if (!pred(u, t)) continue;
        const idA = bandTileId(u - 2 * band, t, 0.55, 0.88, P.Nx, P.Ny, 0);
        const idB = bandTileId(u + 2 * band, t, 0.55, 0.88, P.Nx, P.Ny, 0);
        const idC = bandTileId(u, t - 2 * band, 0.55, 0.88, P.Nx, P.Ny, 0);
        const idD = bandTileId(u, t + 2 * band, 0.55, 0.88, P.Nx, P.Ny, 0);
        flipTot++;
        if (idA !== idB || idC !== idD) flipYes++;
      }
      const flipFrac = flipTot ? flipYes / flipTot : 0;

      const row = {
        key: `validate_band${band}`, band, nu, nt,
        meanKin: +meanIn.toExponential(4), meanKout: +meanOut.toExponential(4), creaseTrackingRatio: +ratio.toFixed(3),
        recallTop1pctK: +recallTop1.toFixed(4), flaggedFrac: +flaggedFrac.toFixed(4),
        tileIdFlipFrac: +flipFrac.toFixed(4), flipSampled: flipTot,
        VALID: ratio >= 3 && flipFrac >= 0.5,
      };
      checkpoint(row);
      plog(`[validate band=${band}] ratio=${ratio.toFixed(2)} recallTop1%K=${recallTop1.toFixed(3)} flaggedFrac=${flaggedFrac.toFixed(4)} tileIdFlip=${flipFrac.toFixed(3)} VALID=${row.VALID}`);
    }

    // ── C0-LOCUS DISCRIMINATOR: is the braid C0-kinky at a THIN locus set, or roughly everywhere? ──
    // K refinement exponent p in K∝dx^p: smooth C2 -> p≈2 (K/4 when dx halves), C0 slope-jump -> p≈1 (K/2),
    // C(-1) height-jump -> p≈0. Classify cells: TRUE C0/discontinuity iff p<1.4 AND K large. Report what fraction
    // of the braid is a true thin crease vs pervasively rough, and whether the predicate catches the true-C0 cells.
    {
      const h = ctReliefField();
      // sample on a moderate grid IN the upper band interior; two step sizes.
      const NU = 1024, NT = 768;
      let c0Cells = 0, smoothCells = 0, total = 0;
      let c0Flagged = 0;
      const pred1 = celticTriquetraCreasePredicate(1e-3);
      for (let j = 0; j < NT; j++) {
        const t = 0.55 + (j + 0.5) / NT * (0.88 - 0.55); // upper band
        for (let i = 0; i < NU; i++) {
          const u = (i + 0.5) / NU;
          const c = h(u, t);
          for (const dx of [1 / 4096]) {
            const k1 = Math.abs(h(u + dx, t) - 2 * c + h(u - dx, t)) + Math.abs(h(u, t + dx) - 2 * c + h(u, t - dx));
            const k2 = Math.abs(h(u + 2 * dx, t) - 2 * c + h(u - 2 * dx, t)) + Math.abs(h(u, t + 2 * dx) - 2 * c + h(u, t - 2 * dx));
            if (k1 < 1e-7) continue; // flat
            total++;
            // p = log2(k2/k1) (k2 uses 2dx). smooth: k2≈4k1 -> p≈2. C0: k2≈2k1 -> p≈1. jump: k2≈k1 -> p≈0.
            const p = Math.log2(Math.max(k2, 1e-12) / Math.max(k1, 1e-12));
            const isC0 = p < 1.4 && k1 > 3e-4;
            if (isC0) { c0Cells++; if (pred1(u, t)) c0Flagged++; } else smoothCells++;
          }
        }
      }
      const c0Frac = total ? c0Cells / total : 0;
      const c0Recall = c0Cells ? c0Flagged / c0Cells : 0;
      const row = {
        key: 'c0_discriminator', method: 'K-refinement exponent p=log2(k2/k1); C0 iff p<1.4 & k1>3e-4',
        band: 'upper', nu: NU, nt: NT, totalNonflat: total,
        c0Cells, smoothCells, c0FracOfBand: +c0Frac.toFixed(4),
        c0RecallByTileEdgePredicate1e3: +c0Recall.toFixed(4),
        note: 'c0FracOfBand high => braid is PERVASIVELY C0-rough (no thin crease set); low => thin locus set exists',
      };
      checkpoint(row);
      plog(`[c0-discriminator] c0Frac=${c0Frac.toFixed(4)} c0Cells=${c0Cells}/${total} tileEdgeRecallOfC0=${c0Recall.toFixed(3)}`);
    }

    // ── DIRECT C0 predicate validation: does celticTriquetraC0Predicate CATCH the true-C0 cells (recall) at a ──
    // sane exclFrac? This is the predicate the exclusion arm actually uses. Recall measured over the SAME true-C0
    // set (p-refinement classified) across the WHOLE relief region (bands + medallion), not just the upper band.
    for (const band of [1e-3, 2e-3]) {
      const c0pred = celticTriquetraC0Predicate(band);
      const h = ctReliefField();
      const NU = 1024, NT = 1024;
      const dx = 1 / 4096;
      let c0Cells = 0, c0Caught = 0, flaggedCells = 0, totalCells = 0;
      for (let j = 0; j < NT; j++) {
        const t = (j + 0.5) / NT;
        if (t < 0.12 || t > 0.94) continue;
        for (let i = 0; i < NU; i++) {
          const u = (i + 0.5) / NU;
          totalCells++;
          const f = c0pred(u, t);
          if (f) flaggedCells++;
          const c = h(u, t);
          const k1 = Math.abs(h(u + dx, t) - 2 * c + h(u - dx, t)) + Math.abs(h(u, t + dx) - 2 * c + h(u, t - dx));
          if (k1 < 3e-4) continue;
          const k2 = Math.abs(h(u + 2 * dx, t) - 2 * c + h(u - 2 * dx, t)) + Math.abs(h(u, t + 2 * dx) - 2 * c + h(u, t - 2 * dx));
          const p = Math.log2(Math.max(k2, 1e-12) / Math.max(k1, 1e-12));
          if (p < 1.4) { c0Cells++; if (f) c0Caught++; }
        }
      }
      const recall = c0Cells ? c0Caught / c0Cells : 0;
      const flaggedFrac = totalCells ? flaggedCells / totalCells : 0;
      const row = {
        key: `c0pred_validate_band${band}`, band,
        predicate: 'celticTriquetraC0Predicate (direct K-refinement C0 detector + band dilation)',
        c0Cells, c0Caught, recallOfTrueC0: +recall.toFixed(4),
        flaggedFrac: +flaggedFrac.toFixed(4),
        VALID: recall >= 0.5,
        note: 'this predicate IS the analytic C0 detector of the live surface; recall>=0.5 & sane flaggedFrac => VALID',
      };
      checkpoint(row);
      plog(`[c0pred band=${band}] recallOfTrueC0=${recall.toFixed(3)} flaggedFrac=${flaggedFrac.toFixed(4)} VALID=${row.VALID}`);
    }

    // Render: K-heatmap with the flagged mask overlaid (band 2e-3). Build a coarse (u,t) grid mesh for the render.
    renderMaskOverK(K, nu, nt, du, dt, 2e-3);
    expect(true).toBe(true);
  }, 30 * 60 * 1000);
});

function UPPER_Y0_sample(s: number): number { return 0.55 + ((s * 0.7548776662) % 1) * (0.88 - 0.55); }

// Render a flat (u,t) grid coloured by K (log) with flagged cells tinted — visual crease-tracking gate.
function renderMaskOverK(K: Float64Array, nu: number, nt: number, du: number, dt: number, band: number): void {
  const pred = celticTriquetraCreasePredicate(band);
  // downsample to a renderable grid
  const GU = 512, GT = 384;
  const xyz = new Float64Array((GU + 1) * (GT + 1) * 3);
  const col = new Float32Array((GU + 1) * (GT + 1) * 3);
  let kmax = 0; for (let i = 0; i < K.length; i++) if (K[i] > kmax) kmax = K[i];
  const logn = (v: number): number => Math.log10(1 + 999 * v / Math.max(kmax, 1e-12)) / 3;
  for (let j = 0; j <= GT; j++) {
    const t = j / GT;
    for (let i = 0; i <= GU; i++) {
      const u = i / GU;
      const o = (j * (GU + 1) + i) * 3;
      xyz[o] = u * 250; xyz[o + 1] = t * 120; xyz[o + 2] = 0;
      const ki = Math.min(nu - 1, Math.floor(u * nu)), kj = Math.min(nt - 1, Math.floor(t * nt));
      const kv = logn(K[kj * nu + ki]);
      const flagged = pred(u, t);
      // K in grayscale-blue; flagged overlay in red channel.
      col[o] = flagged ? 1.0 : kv * 0.2; col[o + 1] = kv * 0.7; col[o + 2] = kv;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < GT; j++) for (let i = 0; i < GU; i++) {
    const a = j * (GU + 1) + i, b = a + 1, c = a + (GU + 1), d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  dumpRenderBins(OUT, 'CT_crease_maskOverK', xyz, Uint32Array.from(idx), {
    colors: col, meta: { ruler: 'CT-crease-mask (red) over relief C0-kink K (blue, log); band=2e-3', label: 'CT crease predicate vs C0-kink K field' },
  });
  plog(`[validate] rendered CT_crease_maskOverK (${OUT})`);
}

// ── Exclusion scoring: mirror the weave arm. band 0 = unexcluded dense baseline. ─
describe('CT-PREDICATE exclusion re-score — dense-basis whole-mesh BVH with crease exclusion', () => {
  for (const band of [0, 1e-3, 2e-3]) {
    it.skipIf(process.env.PF_CT_PRED !== '1')(`Q3-EXCL CelticTriquetra band=${band}`, () => {
      const key = `excl_band${band}`;
      if (keyExists(key)) { plog(`[skip] ${key} exists`); return; }
      const xp = join(CT_BINS, 'CelticTriquetra.xyz.bin'), ip = join(CT_BINS, 'CelticTriquetra.idx.bin');
      if (!existsSync(xp) || !existsSync(ip)) { plog(`[MISSING] CT bins at ${CT_BINS}`); return; }
      const m = loadBinMesh(xp, ip);
      const rA = buildRadiusFn('CelticTriquetra' as StyleId, {}, DIMS);
      // Use the DIRECT C0 predicate (validated by recall) — the tile-edge predicate was refuted (10% recall).
      const exclude = band > 0 ? celticTriquetraC0Predicate(band) : undefined;
      plog(`[${key}] tris=${m.idx.length / 3} — scoring with exclude=${!!exclude}...`);
      const t0 = Date.now();
      const r = scoreWholeMeshBVH(m.xyz, m.idx, rA, H, TWIN, {
        tol: TOL, stride: 1, radialPrefilter: true, twinValidate: 'full', exclude,
        onProgress: (d, tot, no, w) => { if (Math.floor(d / tot * 10) !== Math.floor((d - 1) / tot * 10)) plog(`[${key}] ${Math.floor(d / tot * 100)}% out=${no} worst=${w.toFixed(5)} ${((Date.now() - t0) / 1000).toFixed(0)}s`); },
      });
      const row = {
        key, style: 'CelticTriquetra', band, tris: m.idx.length / 3,
        interiorOutliers: r.interiorOutliers, wholeMeshMaxMm: r.wholeMeshMaxMm, p50: r.p50, p90: r.p90, p99: r.p99,
        twinOnSurfMaxMm: r.twinOnSurfMaxMm, worstXyz: r.worstXyz,
        excludedSamples: r.excludedSamples ?? 0, totalSamples: r.totalSamples ?? 0,
        excludedFrac: r.totalSamples ? +((r.excludedSamples ?? 0) / r.totalSamples).toFixed(4) : 0,
        facetsAllExcluded: r.facetsAllExcluded ?? 0,
        ruler: 'whole-mesh dense radial twin BVH every-facet 45pt, radial prefilter, no screen (EXACT V10b basis)',
        scoreMs: Date.now() - t0,
      };
      checkpoint(row);
      plog(`[${key}] out=${r.interiorOutliers} max=${r.wholeMeshMaxMm} exclFrac=${row.excludedFrac} allExcl=${r.facetsAllExcluded} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      expect(true).toBe(true);
    }, 4 * 60 * 60 * 1000);
  }
});
