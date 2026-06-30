// gothicChordFix.test.ts — does direct chord-sag refinement capture GothicArches' grooves the grid-curvature
// metric was aliasing (ragged/missing relief)? (PF_GOTHIC=1.) Baseline (metric only) vs +chordTolMm; the worst
// chord (p99/max) spikes where grooves are missing, so it should drop sharply with the fix. Binary-dump both.
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const OUT = join('research', 'exchange', '_gothic');

describe('GothicArches chord-sag fidelity fix', () => {
  it.skipIf(!process.env.PF_GOTHIC)('baseline vs chord-sag', () => {
    mkdirSync(OUT, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const run = (label: string, chordTolMm?: number): void => {
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 3_000_000, splitThresh: 1.5, optimizeSweeps: 2, chordTolMm });
      const secs = (Date.now() - t0) / 1000;
      const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
      const idx = Uint32Array.from(mesh.indices);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: idx });
      const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: idx }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.05, seamExclU: 0, denseN: 4 });
      const xyz = lifted.vertices;
      writeFileSync(join(OUT, `${label}.xyz.bin`), Buffer.from(xyz.buffer, xyz.byteOffset, xyz.byteLength));
      writeFileSync(join(OUT, `${label}.idx.bin`), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
      writeFileSync(join(OUT, `${label}.meta.json`), JSON.stringify({ style: label, tris: idx.length / 3, mean: q.meanMinAngleDeg }));
      // eslint-disable-next-line no-console
      console.log(`${label.padEnd(10)} tris=${(idx.length / 3).toString().padStart(8)} mean=${q.meanMinAngleDeg.toFixed(1)} | chord rms=${dev.rmsDevMm.toFixed(4)} p99=${dev.p99DevMm.toFixed(4)} MAX=${dev.chordMaxMm.toFixed(3)} | ${secs.toFixed(0)}s`);
    };
    run('baseline');
    run('chordfix', 0.1);
    expect(true).toBe(true);
  }, 40 * 60 * 1000);
});
