/* eslint-disable no-console */
// _pfCloseSmoothCard.test.ts — DEV-ONLY (autonomous session 2026-07-23).
// SCORECARD: for each of the SIX C∞ smooth-grid styles, measure the honest true-3D MAX of the PRODUCTION smooth-grid
// emitter (buildSmoothGridDispatchWall, flag-gated __pfPerfectMesher + __pfSmoothGrid) at production (sag-derived pow2)
// density, to decide flip-readiness (does it close ≤0.01mm?). MEASURE ONLY — fixes nothing.
//
// Methodology (shared across scorecard agents):
//   - Dims H=120, Rb=45, Rt=70, expn=1.1.
//   - rA = buildAnalyticRadiusFn(style, {}, dims); {} == registry defaults (verified DEFAULT_STYLE_PARAMS ≡ registry).
//   - The dispatch wall returns ConformingOuterWallResult whose .vertices are (u,t,0); re-lift each (u,t) through rA to
//     the 3D wall exactly as the production GPU does (confirm vtx≈0 = re-lift + projector are faithful).
//   - RULER: measureProjectorMax (globally-correct PERPENDICULAR projector, 1.00× on cones) nTheta=2048, nZ=1024.
//     Smooth single-valued styles ⇒ no tread filter. Report maxMm / p99Mm / vertexMaxMm / chordMaxMm.
//   - Watertight by INDEX (nonManRawBigStats): the outer wall is a welded-seam OPEN cylinder ⇒ nonMan MUST be 0 and
//     boundary MUST equal 2·nU (top+bottom rims only; the u-seam is index-welded).
//
// Resilience: one it() per style (cheapest→SpiralRidges last), each checkpoints to an ndjson in os.tmpdir the INSTANT
// a phase completes ('emit' = nU/tris/watertight; 'scored' = full row) and SKIPS a style already 'scored' (resume).
// Run: PF_SMOOTHCARD=1 npx vitest run --config vitest.smoothcard.config.ts
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildSmoothGridDispatchWall } from '../../src/renderers/webgpu/parametric/conforming/tierC';
import { nonManRawBigStats } from './labkit';
import type { StyleId } from '../../src/geometry/types';

// Enable the production smooth-grid dispatch. BOTH flags are required (the assembly adopt hook needs __pfPerfectMesher;
// __pfSmoothGrid alone is inert). Byte-identical OFF ⇒ this only fires under the test.
(globalThis as unknown as { __pfPerfectMesher?: boolean }).__pfPerfectMesher = true;
(globalThis as unknown as { __pfSmoothGrid?: boolean }).__pfSmoothGrid = true;

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const TAU = 2 * Math.PI;
const TOL = 0.01;
const RUN = process.env.PF_SMOOTHCARD === '1';
const CKPT = process.env.PF_SC_CKPT ?? path.join(os.tmpdir(), 'pf_smoothcard.ndjson');
// Ruler resolution (default 2048×1024 per the shared methodology). Overridable for a robustness confirm: a FINER grid
// can only find a CLOSER nearest-surface point ⇒ if a GAP survives 2× it is real (not projector coarseness).
const NTHETA = Number(process.env.PF_SC_NTHETA ?? 2048);
const NZ_DEFAULT = Number(process.env.PF_SC_NZ ?? 1024);
// Optional style filter (comma list) to re-confirm only the GAP styles without recomputing the closed ones.
const ONLY = (process.env.PF_SC_ONLY ?? '').split(',').map((s) => s.trim()).filter((s) => s.length > 0);

interface ScoredRow {
  phase: 'emit' | 'scored';
  style: string;
  nU: number;
  tris: number;
  max?: number;
  p99?: number;
  vtx?: number;
  chord?: number;
  nonMan: number;
  boundary: number;
  expectedBoundary: number;
  seamWelded: boolean;
  nZ?: number;
  verdict?: 'CLOSED' | 'GAP';
  ms?: number;
}

function readRows(): ScoredRow[] {
  if (!fs.existsSync(CKPT)) return [];
  return fs
    .readFileSync(CKPT, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ScoredRow);
}
function scoredRow(style: string): ScoredRow | undefined {
  return readRows().find((r) => r.style === style && r.phase === 'scored');
}
function checkpoint(row: ScoredRow): void {
  fs.appendFileSync(CKPT, JSON.stringify(row) + '\n');
  console.log(`[SC-${row.phase}] ${JSON.stringify(row)}`);
}

/** Undirected index edge-multiplicity census (labkit, Map-free ⇒ safe at 4M tris). */
function watertight(indices: Uint32Array, nU: number): { nonMan: number; boundary: number; seamWelded: boolean } {
  const s = nonManRawBigStats(indices);
  // Outer wall = welded-seam open cylinder: nonMan 0, and the ONLY boundary edges are the 2 rims (nU each).
  return { nonMan: s.nonMan, boundary: s.boundary, seamWelded: s.nonMan === 0 && s.boundary === 2 * nU };
}

async function scoreStyle(style: StyleId, nZ = NZ_DEFAULT): Promise<ScoredRow> {
  const t0 = Date.now();
  const rA = buildAnalyticRadiusFn(style, {}, DIMS);
  const res = buildSmoothGridDispatchWall({ analyticRA: rA, H: DIMS.H, tolMm: TOL }, style);
  if (!res) throw new Error(`buildSmoothGridDispatchWall returned undefined for ${style} (flags not set?)`);

  const utv = res.vertices; // (u,t,0) per vertex
  const nV = utv.length / 3;
  const nU = res.bottomRing.length; // emergent pow2 column count
  const tris = res.indices.length / 3;

  // Watertight FIRST (cheap) so it is checkpointed before the (slow) ruler in case the run is killed mid-score.
  const wt = watertight(res.indices, nU);
  checkpoint({ phase: 'emit', style, nU, tris, nonMan: wt.nonMan, boundary: wt.boundary, expectedBoundary: 2 * nU, seamWelded: wt.seamWelded });

  // Re-lift (u,t) → 3D exactly as the production GPU does (single-valued lift through rA).
  const xyz = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const u = utv[3 * i];
    const t = utv[3 * i + 1];
    const z = t * DIMS.H;
    const th = TAU * u;
    const r = rA(th, z);
    xyz[3 * i] = r * Math.cos(th);
    xyz[3 * i + 1] = r * Math.sin(th);
    xyz[3 * i + 2] = z;
  }

  const rep = await measureProjectorMax({ vertices: xyz, indices: res.indices }, rA, {
    H: DIMS.H,
    tolMm: TOL,
    nTheta: NTHETA,
    nZ,
  });

  const row: ScoredRow = {
    phase: 'scored',
    style,
    nU,
    tris,
    max: rep.maxMm,
    p99: rep.p99Mm,
    vtx: rep.vertexMaxMm,
    chord: rep.chordMaxMm,
    nonMan: wt.nonMan,
    boundary: wt.boundary,
    expectedBoundary: 2 * nU,
    seamWelded: wt.seamWelded,
    nZ,
    verdict: rep.maxMm <= TOL ? 'CLOSED' : 'GAP',
    ms: Date.now() - t0,
  };
  checkpoint(row);
  return row;
}

// One it() per style, cheapest → most expensive (SpiralRidges ~4M tris last). Each resumes from the ndjson.
const CASES: Array<{ style: StyleId; timeout: number }> = [
  { style: 'SuperformulaBlossom', timeout: 900_000 },
  { style: 'SuperellipseMorph', timeout: 900_000 },
  { style: 'FourierBloom', timeout: 1_800_000 },
  { style: 'HarmonicRipple', timeout: 1_800_000 },
  { style: 'WaveInterference', timeout: 1_800_000 },
  { style: 'SpiralRidges', timeout: 5_400_000 },
];

describe('smooth-grid production scorecard (true-3D MAX @ production density)', () => {
  console.log(`[SC] checkpoint=${CKPT} RUN=${RUN}`);
  for (const { style, timeout } of CASES) {
    const included = ONLY.length === 0 || ONLY.includes(style);
    it.skipIf(!RUN || !included)(
      `${style} — emitter true-3D MAX vs registry-default rA`,
      async () => {
        const cached = scoredRow(style);
        if (cached) {
          console.log(`[SC-cached] ${JSON.stringify(cached)}`);
          expect(cached.nonMan).toBe(0);
          return;
        }
        const row = await scoreStyle(style);
        // Sanity: re-lifted vertices lie on rA ⇒ vtx placement error ≈ projector floor (not a fidelity claim).
        console.log(
          `[SC-note] ${style}: vtx=${row.vtx?.toFixed(6)} (should be ≈0 ⇒ re-lift+projector faithful)`,
        );
        expect(row.nonMan).toBe(0); // watertight-by-index invariant of the emitter
        expect(Number.isFinite(row.max)).toBe(true);
      },
      timeout,
    );
  }
});
