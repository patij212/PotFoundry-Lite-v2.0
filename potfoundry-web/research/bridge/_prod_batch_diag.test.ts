// E-2026-07-10-PROD-BATCH — per-style certification COST MODEL diagnostic (PF_PB_DIAG=1).
// After the drain post-mortem: measures, per remaining style, (1) rA eval cost, (2) prescreen
// survivor fraction on a systematic facet sample, (3) per-survivor-facet dense-scoring cost
// (min(GN, full-azimuth brute) — the pathological-class driver), then projects a 4-shard
// stride-4 fleet ETA. Two-stage survivor timing bounds the worst case: 4 facets first
// (cap ≈ 4×worst-case-per-facet), the +36-facet precision pass runs only if fast.
// Appends one ndjson row per style the INSTANT computed (resume-safe): a killed run resumes
// by skipping styles already present in the output file.
// DEV-ONLY; READ-ONLY imports; no src/ or committed-harness edits.
import { describe, it, expect } from 'vitest';
import { appendFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './runStyle';
import { scoreWholeMeshInterior } from './_pf_rebaselineRuler';
import { denseBary } from './_pf_tangledKernelLib';
import { loadBinMesh } from './_pf_bvhRuler';
import type { StyleId } from '../../src/geometry/types';

const ON = process.env.PF_PB_DIAG === '1';
const STYLES = ['SuperformulaBlossom', 'WaveInterference', 'GothicArches', 'BambooSegments', 'ArtDeco', 'BasketWeave', 'CelticKnot'];
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TOL = 0.01;
const ROOT = join('research', 'exchange', '_prod_truth');
const OUT_DIR = join('research', 'exchange', '_prod_batch');
const OUT = join(OUT_DIR, 'diag_cost_model.ndjson');
const TAU = Math.PI * 2;

function done(style: string): boolean {
  if (!existsSync(OUT)) return false;
  return readFileSync(OUT, 'utf8').split('\n').filter(Boolean).some((l) => {
    try { return (JSON.parse(l) as { style: string }).style === style; } catch { return false; }
  });
}

describe('PROD-BATCH vertexOnSurf discriminator (PF_PB_VTX=1)', () => {
  // The cost model measured survivorFrac ~1.0 (SFB) / ~0.93 (WaveInterference) — geometrically
  // implausible as real facet sag. Discriminator: are the artifact VERTICES on the
  // buildRadiusFn({}) truth? ON (p99 ~1e-5) => survivor fractions are real facet-interior sag;
  // OFF (p99 >> tol) => the certification truth's default params mismatch the capture's
  // app-store defaults — a REAL two-default-sources finding; interior scoring vs this truth is
  // then ill-posed (the pilot's pre-registered INSTRUMENT-VALIDITY-GATE class).
  for (const style of ['SuperformulaBlossom', 'WaveInterference', 'GothicArches']) {
    it.skipIf(process.env.PF_PB_VTX !== '1')(`${style}: vertexOnSurf sample`, () => {
      const rA = buildRadiusFn(style as StyleId, {}, DIMS);
      const outer = loadBinMesh(join(ROOT, style, 'outer.xyz.bin'), join(ROOT, style, 'outer.idx.bin'));
      const nV = outer.xyz.length / 3;
      const N = Math.min(50_000, nV);
      const step = Math.max(1, Math.floor(nV / N));
      const devs: number[] = [];
      for (let v = 0; v < nV; v += step) {
        const x = outer.xyz[v * 3], y = outer.xyz[v * 3 + 1];
        const z = Math.min(DIMS.H, Math.max(0, outer.xyz[v * 3 + 2]));
        let th = Math.atan2(y, x);
        if (th < 0) th += TAU;
        devs.push(Math.abs(Math.hypot(x, y) - rA(th, z)));
      }
      devs.sort((a, b) => a - b);
      const p99 = devs[Math.floor(0.99 * (devs.length - 1))];
      const max = devs[devs.length - 1];
      const row = { style, task: 'vtx-discriminator', n: devs.length, p99: +p99.toFixed(6), max: +max.toFixed(6), premiseOk: p99 <= TOL, at: new Date().toISOString() };
      appendFileSync(OUT, JSON.stringify(row) + '\n');
      console.log(`[diag-vtx] ${JSON.stringify(row)}`);
      expect(true).toBe(true);
    }, 5 * 60 * 1000);
  }
});

describe('PROD-BATCH cost-model diagnostic', () => {
  for (const style of STYLES) {
    it.skipIf(!ON)(`${style}: cost model`, () => {
      mkdirSync(OUT_DIR, { recursive: true });
      if (done(style)) { console.log(`[diag] ${style}: already measured, skip`); expect(true).toBe(true); return; }
      const t0 = Date.now();
      const rA = buildRadiusFn(style as StyleId, {}, DIMS);
      const H = DIMS.H;
      const outer = loadBinMesh(join(ROOT, style, 'outer.xyz.bin'), join(ROOT, style, 'outer.idx.bin'));
      const nF = outer.idx.length / 3;

      // (1) rA eval cost — 50k pseudo-random evals.
      const tA = Date.now();
      let sink = 0;
      for (let i = 0; i < 50_000; i++) {
        const th = (((i * 2654435761) >>> 0) / 4294967296) * TAU;
        const z = (((i * 40503) % 10007) / 10007) * H;
        sink += rA(th, z);
      }
      const rAUs = ((Date.now() - tA) * 1000) / 50_000;

      // (2) prescreen survivor fraction on a systematic sample (~24k facets).
      const bary = denseBary(8);
      const sampleN = Math.min(24_000, nF);
      const step = Math.max(1, Math.floor(nF / sampleN));
      const survivors: number[] = [];
      const tP = Date.now();
      let sampled = 0;
      for (let f = 0; f < nF; f += step) {
        sampled++;
        const a = outer.idx[f * 3] * 3, b = outer.idx[f * 3 + 1] * 3, c = outer.idx[f * 3 + 2] * 3;
        let green = true;
        for (const [wa, wb, wc] of bary) {
          const x = wa * outer.xyz[a] + wb * outer.xyz[b] + wc * outer.xyz[c];
          const y = wa * outer.xyz[a + 1] + wb * outer.xyz[b + 1] + wc * outer.xyz[c + 1];
          const z = wa * outer.xyz[a + 2] + wb * outer.xyz[b + 2] + wc * outer.xyz[c + 2];
          let th = Math.atan2(y, x);
          if (th < 0) th += TAU;
          if (Math.abs(Math.hypot(x, y) - rA(th, Math.min(H, Math.max(0, z)))) > TOL) { green = false; break; }
        }
        if (!green) survivors.push(f);
      }
      const prescreenSampleMs = Date.now() - tP;
      const survivorFrac = survivors.length / sampled;
      const prescreenFullProjS = ((prescreenSampleMs / sampled) * nF) / 1000;

      // (3) per-survivor-facet dense-scoring cost — two-stage (4 facets, then +36 if fast).
      function scoreSome(list: number[]): number {
        if (list.length === 0) return 0;
        const idx = new Uint32Array(list.length * 3);
        for (let i = 0; i < list.length; i++) {
          idx[i * 3] = outer.idx[list[i] * 3];
          idx[i * 3 + 1] = outer.idx[list[i] * 3 + 1];
          idx[i * 3 + 2] = outer.idx[list[i] * 3 + 2];
        }
        const tS = Date.now();
        scoreWholeMeshInterior(outer.xyz, idx, rA, H, { tol: TOL, stride: 1 });
        return (Date.now() - tS) / list.length;
      }
      const stage1 = survivors.slice(0, 4);
      const perFacetMs1 = scoreSome(stage1);
      let perFacetMs = perFacetMs1;
      let stage2N = 0;
      if (perFacetMs1 > 0 && perFacetMs1 < 1500 && survivors.length > 4) {
        const stage2 = survivors.slice(4, 40);
        stage2N = stage2.length;
        const perFacetMs2 = scoreSome(stage2);
        perFacetMs = (perFacetMs1 * stage1.length + perFacetMs2 * stage2N) / (stage1.length + stage2N);
      }

      // (4) fleet ETA projection: 4-shard stride-4 (each shard re-runs the full prescreen;
      // shard scores ~survivors/4 facets at stride 4 ⇒ /16 of survivor population per shard).
      const survivorsProj = Math.round(survivorFrac * nF);
      const shardScoreS = ((survivorsProj / 4 / 4) * perFacetMs) / 1000;
      const fixedS = 30; // bins+boot+watertight+vertexOnSurf+coverage amortized guess (shard0-heavy)
      const etaShardS = Math.round(prescreenFullProjS + shardScoreS + fixedS);

      const row = {
        style, nF, rAUs: +rAUs.toFixed(2), sampled, survivorFrac: +survivorFrac.toFixed(5),
        survivorsProj, prescreenFullProjS: +prescreenFullProjS.toFixed(1),
        perSurvivorFacetMs: +perFacetMs.toFixed(1), perFacetStage1Ms: +perFacetMs1.toFixed(1), stage2N,
        etaShardS_4shard_stride4: etaShardS,
        pathological: perFacetMs > 500 || etaShardS > 5400,
        sink: +sink.toFixed(3), ms: Date.now() - t0, at: new Date().toISOString(),
      };
      appendFileSync(OUT, JSON.stringify(row) + '\n');
      console.log(`[diag] ${JSON.stringify(row)}`);
      expect(true).toBe(true);
    }, 12 * 60 * 1000);
  }
});
