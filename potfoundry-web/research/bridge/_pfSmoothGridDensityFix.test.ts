/* eslint-disable no-console */
// _pfSmoothGridDensityFix.test.ts — PROOF for E-2026-07-23-SMOOTHGRID-DENSITY-GUARANTEE.
//
// The verify-and-bump in `deriveSmoothGridDensity` (measure the emitted grid's true worst flat-facet chord via
// `worstSmoothFacetChord`, double the deficient axis until ≤ tol) must:
//   (1) CLOSE all 7 target styles (6 C∞ smooth + HexHive) to measureProjectorMax true-3D perpendicular MAX ≤0.01mm,
//   (2) NOT over-bump the 3 already-closing styles (SFB/SE/FB keep their seed nU/nT),
//   (3) run <2s per deriveSmoothGridDensity call (bounded scan),
//   (4) have the INTERNAL worstSmoothFacetChord metric agree with measureProjectorMax (no under-read ⇒ the bump
//       decision is calibrated; a >0.01 seed chord for GAP styles, ≤0.01 for CLOSED styles).
//
// Dims H120/Rb45/Rt70/expn1.1, tol=0.01, registry-default opts ({} == DEFAULT_STYLE_PARAMS). Build with the SHIPPED
// buildSmoothGridWall at the NEW derived (nU,nT); measure with measureProjectorMax (nTheta2048/nZ1024). One it() per
// style, checkpointed to an ndjson + resumable (a killed run re-runs only the unfinished style).
// Run: PF_SMOOTHFIX=1 npx vitest run --config vitest.smoothfix.config.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import {
  deriveSmoothGridDensity,
  buildSmoothGridWall,
  worstSmoothFacetChord,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/smoothGrid';
import { nonManRawBigStats } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const RUN = process.env.PF_SMOOTHFIX === '1';
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const TAU = 2 * Math.PI;
const TOL = 0.01;
const CKPT = process.env.PF_SF_CKPT ?? path.join(os.tmpdir(), 'pf_smoothfix.ndjson');

// Registry E-2026-07-23-SMOOTHGRID-PRODCARD "before" (seed) via the SAME instrument (measureProjectorMax
// nTheta2048/nZ1024). CLOSED must NOT bump; GAP must bump to ≤0.01. HexHive `before` MAX is self-measured below
// (the registry lacks a scorecard row; _pfCloseHexDensity documents its seed nU=2048 → 0.0115).
const BEFORE: Record<string, { nU: number; max: number; verdict: 'CLOSED' | 'GAP' }> = {
  SuperformulaBlossom: { nU: 512, max: 0.00595, verdict: 'CLOSED' },
  SuperellipseMorph: { nU: 1024, max: 0.00796, verdict: 'CLOSED' },
  FourierBloom: { nU: 2048, max: 0.00631, verdict: 'CLOSED' },
  HarmonicRipple: { nU: 2048, max: 0.01225, verdict: 'GAP' },
  SpiralRidges: { nU: 2048, max: 0.01667, verdict: 'GAP' },
  WaveInterference: { nU: 1024, max: 0.01825, verdict: 'GAP' },
  HexagonalHive: { nU: 2048, max: 0.0115, verdict: 'GAP' },
};

// Exact replica of deriveSmoothGridDensity's SEED (probe + pow2 snap, NO verify-bump) so we can report the pre-bump
// density and the seed chord for a rigorous before/after. The seed formula is UNCHANGED by this task (only the
// verify-bump was appended), so this reproduces the shipped-before density exactly.
function seedDensity(rA: AnalyticRadiusFn, H: number, tolMm: number): { nU: number; nT: number } {
  const n0 = 128;
  const safety = 1.5;
  const lift = (u: number, t: number): [number, number, number] => {
    const th = TAU * u, z = t * H, r = rA(th, z);
    return [r * Math.cos(th), r * Math.sin(th), z];
  };
  const sag2 = (Pm: number[], P: number[], Pp: number[]): number =>
    0.125 * Math.hypot(Pm[0] + Pp[0] - 2 * P[0], Pm[1] + Pp[1] - 2 * P[1], Pm[2] + Pp[2] - 2 * P[2]);
  let maxSagU = 0, maxSagT = 0;
  for (let j = 0; j <= n0; j++) {
    const t = j / n0;
    for (let i = 0; i < n0; i++) {
      const u = i / n0;
      const P = lift(u, t);
      const sU = sag2(lift(((i - 1 + n0) % n0) / n0, t), P, lift(((i + 1) % n0) / n0, t));
      if (sU > maxSagU) maxSagU = sU;
      if (j > 0 && j < n0) {
        const sT = sag2(lift(u, (j - 1) / n0), P, lift(u, (j + 1) / n0));
        if (sT > maxSagT) maxSagT = sT;
      }
    }
  }
  const nURaw = n0 * Math.sqrt(Math.max(maxSagU, 1e-12) / tolMm) * safety;
  const nTRaw = n0 * Math.sqrt(Math.max(maxSagT, 1e-12) / tolMm) * safety;
  let pow2 = 1;
  while (pow2 < nURaw) pow2 *= 2;
  const nU = Math.max(256, Math.min(8192, pow2));
  const nT = Math.max(32, Math.min(2048, Math.ceil(nTRaw)));
  return { nU, nT };
}

interface Row {
  style: string;
  seedNU: number; seedNT: number; seedChord: number; seedProjMax: number | null;
  nU: number; nT: number; tris: number; deriveMs: number; bumped: boolean;
  projMax: number; projChord: number; projVtx: number; projP99: number;
  finalChord: number; agree: number;
  nonMan: number; boundary: number; seamWelded: boolean; verdict: 'CLOSED' | 'GAP';
}

function readRows(): Row[] {
  if (!fs.existsSync(CKPT)) return [];
  return fs.readFileSync(CKPT, 'utf8').split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as Row);
}

async function projMax(vertices: Float32Array, indices: Uint32Array, rA: AnalyticRadiusFn): Promise<{ max: number; chord: number; vtx: number; p99: number; nonFinite: number }> {
  const rep = await measureProjectorMax({ vertices, indices }, rA, { H: DIMS.H, tolMm: TOL, nTheta: 2048, nZ: 1024 });
  return { max: rep.maxMm, chord: rep.chordMaxMm, vtx: rep.vertexMaxMm, p99: rep.p99Mm, nonFinite: rep.nonFiniteCount };
}

// Cheapest → most expensive (SpiralRidges last). Each resumes from the ndjson.
const ORDER = ['SuperformulaBlossom', 'SuperellipseMorph', 'FourierBloom', 'HarmonicRipple', 'WaveInterference', 'HexagonalHive', 'SpiralRidges'];

describe('smooth-grid density verify-and-bump — closes 7 styles ≤0.01 MAX (measureProjectorMax)', () => {
  console.log(`[SF] checkpoint=${CKPT} RUN=${RUN}`);
  for (const style of ORDER) {
    it.skipIf(!RUN)(`${style} closes ≤0.01 true-3D MAX after bump`, async () => {
      const cached = readRows().find((r) => r.style === style);
      if (cached) {
        console.log(`[SF-cached] ${JSON.stringify(cached)}`);
        expect(cached.projMax).toBeLessThanOrEqual(0.01);
        return;
      }
      const rA = buildAnalyticRadiusFn(style as StyleId, {}, DIMS);
      const seed = seedDensity(rA, DIMS.H, TOL);

      const t0 = performance.now();
      const { nU, nT } = deriveSmoothGridDensity(rA, DIMS.H, TOL);
      const deriveMs = performance.now() - t0;

      const seedChord = worstSmoothFacetChord(rA, DIMS.H, seed.nU, seed.nT);
      const finalChord = worstSmoothFacetChord(rA, DIMS.H, nU, nT);
      const bumped = nU > seed.nU || nT > seed.nT;

      const wall = buildSmoothGridWall(rA, DIMS.H, nU, nT);
      const wt = nonManRawBigStats(wall.indices);
      const rep = await projMax(wall.vertices, wall.indices, rA);

      // Self-measure the seed (before) MAX only for HexHive (registry lacks a row); registry supplies the other GAPs.
      let seedProjMax: number | null = null;
      if (style === 'HexagonalHive') {
        const sWall = buildSmoothGridWall(rA, DIMS.H, seed.nU, seed.nT);
        seedProjMax = (await projMax(sWall.vertices, sWall.indices, rA)).max;
      }

      const row: Row = {
        style, seedNU: seed.nU, seedNT: seed.nT, seedChord, seedProjMax,
        nU, nT, tris: wall.indices.length / 3, deriveMs, bumped,
        projMax: rep.max, projChord: rep.chord, projVtx: rep.vtx, projP99: rep.p99,
        finalChord, agree: rep.max > 0 ? finalChord / rep.max : 0,
        nonMan: wt.nonMan, boundary: wt.boundary, seamWelded: wt.nonMan === 0 && wt.boundary === 2 * nU,
        verdict: rep.max <= TOL ? 'CLOSED' : 'GAP',
      };
      fs.appendFileSync(CKPT, JSON.stringify(row) + '\n');
      console.log(
        `[SF] ${style}: seed nU${seed.nU}/nT${seed.nT} (chord ${seedChord.toFixed(5)}${seedProjMax !== null ? ` projMax ${seedProjMax.toFixed(5)}` : ''}) ` +
        `-> nU${nU}/nT${nT} tris ${(row.tris / 1e6).toFixed(3)}M | projMax ${rep.max.toFixed(5)} chord ${rep.chord.toFixed(5)} ` +
        `vtx ${rep.vtx.toExponential(1)} p99 ${rep.p99.toFixed(5)} | internal ${finalChord.toFixed(5)} agree ${row.agree.toFixed(2)}x | ` +
        `derive ${deriveMs.toFixed(0)}ms | nonMan ${wt.nonMan} bnd ${wt.boundary}(=${2 * nU}?) bumped ${bumped}`,
      );

      // ── PROOF ──
      const b = BEFORE[style];
      expect(rep.nonFinite).toBe(0);
      expect(rep.max).toBeLessThanOrEqual(0.01); // (1) closes whole-mesh true-3D perpendicular MAX
      expect(wt.nonMan).toBe(0); // watertight by index (welded u-seam)
      expect(wt.boundary).toBe(2 * nU); // only the two rims open by construction
      expect(deriveMs).toBeLessThan(2000); // (3) perf budget: bounded scan
      expect(finalChord).toBeGreaterThan(rep.max * 0.85); // (4) internal metric does NOT under-read the sanctioned ruler
      if (style !== 'HexagonalHive') expect(seed.nU).toBe(b.nU); // seed replica reproduces the documented pre-bump nU
      if (b.verdict === 'CLOSED') {
        expect(nU).toBe(seed.nU); // (2) NO over-bump: already-closing styles keep their seed density
        expect(nT).toBe(seed.nT);
        expect(seedChord).toBeLessThanOrEqual(0.01); // the metric correctly read ≤0.01 at the seed ⇒ no bump
      } else {
        expect(bumped).toBe(true); // (5) the bump fired for the GAP styles
        expect(seedChord).toBeGreaterThan(0.01); // the metric correctly read >0.01 at the seed ⇒ bump was necessary
      }
    }, 3_000_000);
  }
});
