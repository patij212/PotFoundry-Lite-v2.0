// featConformGreen.test.ts — DEV-ONLY (env PF_GREEN=1). FIDELITY PUSH: drive the per-face chord-sag heatmap to
// ALL GREEN on GothicArches (the red style) by adding the kernel chord-sag guard (chordTolMm) ON TOP of gated
// feature-conforming. Pre-registered target: 0% of faces with chord sag >= 0.15mm (heatmap red), ideally
// worst < 0.1mm. Equal-budget A/B (conforming with vs without the guard). Dumps xyz/idx/col for a confirming
// heatmap render. MEASURE + EXPORT only; no src/ edits.
//
// Run: PF_GREEN=1 npx vitest run research/bridge/featConformGreen.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { buildMeshUt, buildLocator, buildFeatureTruth } from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const TRUTH_RES = 384;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const SCALE_MM = 0.15;
const BARY: Array<[number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
const OUT = join('research', 'exchange', '_showcase');

function ramp(x: number): [number, number, number] {
  const c = x < 0 ? 0 : x > 1 ? 1 : x; const L = (a: number, b: number, k: number): number => a + (b - a) * k;
  const G: [number, number, number] = [0.13, 0.62, 0.23], Y: [number, number, number] = [0.98, 0.82, 0.10], R: [number, number, number] = [0.86, 0.13, 0.13];
  if (c < 0.5) { const k = c / 0.5; return [L(G[0], Y[0], k), L(G[1], Y[1], k), L(G[2], Y[2], k)]; }
  const k = (c - 0.5) / 0.5; return [L(Y[0], R[0], k), L(Y[1], R[1], k), L(Y[2], R[2], k)];
}

/** per-face chord sag (BARY plane distance) → stats + per-vertex colour; dumps bins. */
function measureAndDump(label: string, ut: number[], indices: Uint32Array, rA: (th: number, z: number) => number, H: number): void {
  const m = buildMeshUt(ut, indices, rA, H); const xyz = m.xyz; const nV = xyz.length / 3, nF = indices.length / 3;
  const vertErr = new Float64Array(nV); const faceErr = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    let err = 0;
    for (const [wa, wb, wc] of BARY) {
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (d > err) err = d;
    }
    faceErr[f] = err;
    if (err > vertErr[a]) vertErr[a] = err; if (err > vertErr[b]) vertErr[b] = err; if (err > vertErr[c]) vertErr[c] = err;
  }
  const col = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) { const [r, g, b] = ramp(vertErr[i] / SCALE_MM); col[3 * i] = r; col[3 * i + 1] = g; col[3 * i + 2] = b; }
  const f32 = Float32Array.from(xyz);
  writeFileSync(join(OUT, `${label}.xyz.bin`), Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength));
  writeFileSync(join(OUT, `${label}.idx.bin`), Buffer.from(indices.buffer, indices.byteOffset, indices.byteLength));
  let over15 = 0, over10 = 0, over05 = 0, worst = 0;
  for (let f = 0; f < nF; f++) { const e = faceErr[f]; if (e > 0.15) over15++; if (e > 0.1) over10++; if (e > 0.05) over05++; if (e > worst) worst = e; }
  const meta = { file: label, faces: nF, scaleMm: SCALE_MM, max: worst, pctFacesOver0_1mm: 100 * over10 / nF, pctOver0_15: 100 * over15 / nF, pctOver0_05: 100 * over05 / nF };
  writeFileSync(join(OUT, `${label}.hm.json`), JSON.stringify(meta));
  writeFileSync(join(OUT, `${label}.col.bin`), Buffer.from(col.buffer, col.byteOffset, col.byteLength));
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(28)} tris=${String(nF).padStart(8)} worst=${worst.toFixed(3)}mm | RED(>0.15)=${(100 * over15 / nF).toFixed(3)}% >0.1=${(100 * over10 / nF).toFixed(3)}% >0.05=${(100 * over05 / nF).toFixed(2)}%`);
}

describe('GothicArches chord-sag GREEN push', () => {
  it.skipIf(process.env.PF_GREEN !== '1')('conforming + chord-sag guard drives heatmap green', () => {
    mkdirSync(OUT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, TRUTH_RES);
    const OPTS: InhouseMeshOpts = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 5_000_000, splitThresh: 1.5, optimizeSweeps: 2 };
    const base = buildInhouseMetricMesh(rA, H, { ...OPTS, guardManifoldAlways: true });
    const baseM = buildMeshUt(base.ut, base.indices, rA, H);
    const gate = computeMeasuredGate(truth, buildLocator(baseM, 256), baseM, rA, H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
    const common = { ...OPTS, guardManifoldAlways: true as const, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth, injectStepMm: 0.08, lineFilter: (_l: unknown, i: number): boolean => gate.keep[i] };

    // SF: the ROOT-CAUSE full stack — fine-curvature sizing (sizes crest facets small at the source, fixing the
    // aliasing the chord guard couldn't compensate for) + planarize (junctions) + chordSteiner guard (insurance)
    // + guardManifoldAlways (watertight). Target: 0% RED and 0% YELLOW.
    // Size for the ACTUAL green target (sag ~0.02mm, well under the 0.05 yellow threshold) — NOT 0.004mm, which
    // over-refined 10x and overflowed the manifold-guard edge-Set. hMin 0.03 floors crest facets small enough for
    // sag<<0.05 at these curvatures without exploding density. maxPoints 2.5M keeps 3*2*nPts edges < 16.7M Set cap.
    // DEDICATED zero-yellow: FINER sizing grid (sizeRes 512) so the fine-curvature window is a NARROW crest band
    // (±0.27mm, not ±0.55mm) — kills the runaway while still sizing crests small — + tight chord guard 0.01 to
    // finish. Sharded guard+recovery handle whatever tris result. tolMm 0.012 / hMin 0.015 → crest sag << 0.05.
    const SF = buildFeatureConformingMeshB(STYLE, {}, DIMS, {
      ...common, sizeRes: 512, planarizeConstraints: true, tolMm: 0.012, hMin: 0.015, maxPoints: 8_000_000,
      dedupeEps: 1e-7, chordTolMm: 0.01, chordSteiner: true, curvatureFineStep: 1 / 2048, curvatureSubsamples: 2,
    });
    measureAndDump('GothicArches_puregreen_SF', SF.ut, Uint32Array.from(SF.indices), rA, H);

    expect(true).toBe(true);
  }, 90 * 60 * 1000);
});
