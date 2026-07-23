/* eslint-disable no-console */
// _wireListSmoothGrid.test.ts — WIRE-LIST audit (2026-07-23).
//
// QUESTION (pre-registered): for the two UNWIRED "close" candidates whose surface is single-valued radial —
// HexagonalHive (ID 16, seam-fix already in production styles.ts) and RippleInterference (ID 11) — does the ACTUAL
// production smooth-grid emitter (`buildSmoothGridWall`, the thing `SMOOTH_GRID_STYLES` wiring would invoke) close
// whole-mesh true-3D MAX ≤0.01mm at PRODUCTION dims (OD140/H120 tapered) + registry defaults?
//   • HexHive KILL: if smoothMax ≤0.01 at a feasible density (≤~4M tris) ⇒ READY-TO-WIRE via SMOOTH_GRID_STYLES.
//     If it floors >0.01 density-invariant ⇒ NEEDS-MESHER (structured/feature emitter).
//   • RippleInterference KILL: if it floors >0.01 across the density ladder (density-invariant) ⇒ NOT smooth-grid
//     closable (NEEDS-MESHER / feature-conforming). If it closes ⇒ READY-TO-WIRE.
//
// Ruler: `measureProjectorMax` (globally-correct radial projector, MAX-first) — the task's specified instrument.
// Both styles are single-valued radial (no vertical treads) ⇒ the ruler is honest (no tread inflation). Vertices sit
// on rA by construction ⇒ vertexMax ≈ f32 floor; the number to watch is chordMax (flat-facet tessellation).
//
// Isolated (imports the production emitter + ruler READ-ONLY; touches no shared src, no shared ndjson). Env-gated
// (PF_WIRELIST=1) + checkpointed per (style,density) so a killed run resumes. Research-only; src never imports research.
// Run: PF_WIRELIST=1 npx vitest run --config vitest.wirelist.config.ts
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import { buildSmoothGridWall } from '../../src/renderers/webgpu/parametric/conforming/tierC/smoothGrid';
import type { StyleId } from '../../src/geometry/types';

const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 }; // production DEFAULT_DIMENSIONS (tapered)
const OUT_DIR = join('research', 'exchange', '_wirelist');
const NDJSON = join(OUT_DIR, 'smoothgrid.ndjson');

function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  console.log(`[CP] ${JSON.stringify(row)}`);
}
function keyDone(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => {
    try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; }
  });
}

async function measureRung(style: StyleId, nU: number, nT: number): Promise<void> {
  const key = `${style}|${nU}x${nT}`;
  if (keyDone(key)) { console.log(`[skip] ${key}`); return; }
  const t0 = Date.now();
  const rA = buildAnalyticRadiusFn(style, {}, DIMS);
  const wall = buildSmoothGridWall(rA, DIMS.H, nU, nT);
  const tris = wall.indices.length / 3;
  const r = await measureProjectorMax(
    { vertices: wall.vertices, indices: wall.indices },
    rA,
    { H: DIMS.H, tolMm: 0.01, nTheta: 2048, nZ: 1024 },
  );
  const secs = ((Date.now() - t0) / 1000).toFixed(0);
  const verdict = r.maxMm <= 0.01 ? 'CLOSES' : 'FLOORS';
  console.log(
    `[${key}] tris=${tris} MAX=${r.maxMm.toFixed(5)} vtx=${r.vertexMaxMm.toFixed(5)} chord=${r.chordMaxMm.toFixed(5)} ` +
      `p99=${r.p99Mm.toFixed(5)} nonFinite=${r.nonFiniteCount} | ${verdict} | ${secs}s`,
  );
  checkpoint({
    key, style, nU, nT, tris,
    maxMm: +r.maxMm.toFixed(5), vtxMm: +r.vertexMaxMm.toFixed(5), chordMm: +r.chordMaxMm.toFixed(5),
    p99Mm: +r.p99Mm.toFixed(5), nonFinite: r.nonFiniteCount, verdict, secs: +secs,
  });
  expect(Number.isFinite(r.maxMm)).toBe(true);
}

describe('WIRE-LIST smooth-grid closure — HexHive (seam-fixed) + RippleInterference via buildSmoothGridWall', () => {
  it.skipIf(process.env.PF_WIRELIST !== '1')('HexagonalHive: does the production smooth grid close ≤0.01 at prod dims?', async () => {
    // 2048x512 cross-checks the parallel probe's perFaceTrue3DSag 0.01153 with the measureProjectorMax ruler;
    // 3072x512 (~3.1M) is the campaign's claimed-closing density; 4096x512 (~4.2M) is the confirm rung.
    await measureRung('HexagonalHive', 2048, 512);
    await measureRung('HexagonalHive', 3072, 512);
    await measureRung('HexagonalHive', 4096, 512);
  }, 3_600_000);

  it.skipIf(process.env.PF_WIRELIST !== '1')('RippleInterference: smooth grid density ladder — closes or floors?', async () => {
    await measureRung('RippleInterference', 2048, 512);
    await measureRung('RippleInterference', 3072, 512);
  }, 3_600_000);
});
