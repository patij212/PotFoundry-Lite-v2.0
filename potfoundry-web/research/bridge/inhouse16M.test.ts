// inhouse16M.test.ts — build ~16M-triangle in-house meshes for GyroidManifold + SuperformulaBlossom (SFB) and
// BINARY-dump them (xyz Float32 + idx Uint32; JSON would be ~1GB). (PF_16M=1; PF_16M_MAX overrides maxPoints
// for a small smoke test.) Quality measured (cheap); chord skipped (perpendicular3DDeviation is too slow at 16M).
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['GyroidManifold', 'SuperformulaBlossom'] as StyleId[];
const OUT = join('research', 'exchange', '_16m');

describe('16M-triangle in-house meshes', () => {
  it.skipIf(!process.env.PF_16M)('build + binary dump Gyroid + SFB', () => {
    mkdirSync(OUT, { recursive: true });
    const maxPoints = process.env.PF_16M_MAX ? parseInt(process.env.PF_16M_MAX, 10) : 8_000_000;
    const tol = process.env.PF_16M_TOL ? parseFloat(process.env.PF_16M_TOL) : 0.0005;
    const only = process.env.PF_16M_ONLY;
    const styles = only ? STYLES.filter((s) => String(s) === only) : STYLES;
    for (const style of styles) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
        tolMm: tol, hMin: tol * 2.4, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 16,
        maxPoints, splitThresh: 1.5, optimizeSweeps: 2, profile: true,
      });
      const buildSecs = (Date.now() - t0) / 1000;
      const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: mesh.indices });
      const tris = mesh.indices.length / 3;
      const xyz = lifted.vertices;                    // Float32Array (n*3)
      const idx = Uint32Array.from(mesh.indices);     // Uint32Array (tris*3)
      writeFileSync(join(OUT, `${String(style)}.xyz.bin`), Buffer.from(xyz.buffer, xyz.byteOffset, xyz.byteLength));
      writeFileSync(join(OUT, `${String(style)}.idx.bin`), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
      const meta = { style: String(style), tris, verts: xyz.length / 3, worst: q.minAngleDeg, p5: q.p5MinAngleDeg, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, rounds: mesh.rounds, hitBudget: mesh.hitBudget, buildSecs };
      writeFileSync(join(OUT, `${String(style)}.meta.json`), JSON.stringify(meta, null, 2));
      // eslint-disable-next-line no-console
      console.log(`${String(style)}: tris=${tris} verts=${meta.verts} mean=${q.meanMinAngleDeg.toFixed(1)} p5=${q.p5MinAngleDeg.toFixed(1)} %<20=${q.pctBelow20.toFixed(2)} rounds=${mesh.rounds} build=${buildSecs.toFixed(0)}s`);
      expect(tris).toBeGreaterThan(0);
    }
  }, 60 * 60 * 1000);
});
