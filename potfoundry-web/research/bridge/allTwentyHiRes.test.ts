// allTwentyHiRes.test.ts — HIGH-density iso meshes for all 20 styles (curvature-adaptive: complex styles get
// millions of triangles), exported as binary STL + binary xyz/idx dumps for the render pipeline. (PF_HIRES=1.)
// The earlier all-20 used a moderate tol (100k–900k); this represents each style at full fidelity.
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple', 'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave', 'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet'] as StyleId[];
const OUT = join('research', 'exchange', '_all20hi');

function writeBinarySTL(path: string, xyz: Float32Array, idx: Uint32Array): void {
  const nt = idx.length / 3;
  const buf = Buffer.alloc(84 + nt * 50);
  buf.writeUInt32LE(nt, 80);
  let o = 84;
  for (let t = 0; t < nt; t++) {
    const a = idx[3 * t] * 3, b = idx[3 * t + 1] * 3, c = idx[3 * t + 2] * 3;
    const ux = xyz[b] - xyz[a], uy = xyz[b + 1] - xyz[a + 1], uz = xyz[b + 2] - xyz[a + 2];
    const vx = xyz[c] - xyz[a], vy = xyz[c + 1] - xyz[a + 1], vz = xyz[c + 2] - xyz[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    buf.writeFloatLE(nx, o); buf.writeFloatLE(ny, o + 4); buf.writeFloatLE(nz, o + 8);
    buf.writeFloatLE(xyz[a], o + 12); buf.writeFloatLE(xyz[a + 1], o + 16); buf.writeFloatLE(xyz[a + 2], o + 20);
    buf.writeFloatLE(xyz[b], o + 24); buf.writeFloatLE(xyz[b + 1], o + 28); buf.writeFloatLE(xyz[b + 2], o + 32);
    buf.writeFloatLE(xyz[c], o + 36); buf.writeFloatLE(xyz[c + 1], o + 40); buf.writeFloatLE(xyz[c + 2], o + 44);
    o += 50;
  }
  writeFileSync(path, buf);
}

describe('all-20 HIGH-res export', () => {
  it.skipIf(!process.env.PF_HIRES)('build + STL + binary dump (high density)', () => {
    mkdirSync(join(OUT, 'stl'), { recursive: true });
    mkdirSync(join(OUT, 'bin'), { recursive: true });
    const rows: Record<string, unknown>[] = [];
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 2_000_000, splitThresh: 1.5, optimizeSweeps: 2 });
      const secs = (Date.now() - t0) / 1000;
      const lifted = liftUtToRadial(mesh.ut, rA, DIMS.H);
      const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: mesh.indices });
      const xyz = lifted.vertices, idx = Uint32Array.from(mesh.indices);
      writeBinarySTL(join(OUT, 'stl', `${String(style)}.stl`), xyz, idx);
      writeFileSync(join(OUT, 'bin', `${String(style)}.xyz.bin`), Buffer.from(xyz.buffer, xyz.byteOffset, xyz.byteLength));
      writeFileSync(join(OUT, 'bin', `${String(style)}.idx.bin`), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
      const tris = idx.length / 3;
      writeFileSync(join(OUT, 'bin', `${String(style)}.meta.json`), JSON.stringify({ style: String(style), tris, mean: q.meanMinAngleDeg, pctB20: q.pctBelow20, secs }));
      rows.push({ style: String(style), tris, mean: q.meanMinAngleDeg, secs });
      writeFileSync(join(OUT, 'hires.json'), JSON.stringify(rows, null, 2));
      // eslint-disable-next-line no-console
      console.log(`${String(style).padEnd(20)} tris=${String(tris).padStart(9)} mean=${q.meanMinAngleDeg.toFixed(1)} (${secs.toFixed(0)}s)`);
    }
    expect(rows.length).toBe(20);
  }, 90 * 60 * 1000);
});
