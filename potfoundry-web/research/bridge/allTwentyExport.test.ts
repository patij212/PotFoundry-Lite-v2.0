// allTwentyExport.test.ts — all-20-style sweep: iso surface metric vs crease-aligned metric (triangle budget +
// fidelity), and EXPORT each style's iso mesh as a binary STL + a render dump. (PF_ALL20=1.)
// Note: this is the OUTER-WALL SURFACE from the in-house kernel (the (u,t) patch) — high-quality tessellation,
// but not yet the closed watertight solid (seam + rim/base are the deferred "full pot" work).
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh } from './inhouseMetricMesh';
import { buildCreaseAlignedMesh } from './creaseAlignedMesh';
import { buildRadiusFn, type StyleDims } from './runStyle';
import { liftUtToRadial } from './measure';
import { triangleQualityDistribution } from '../../src/fidelity/metrics';
import { perpendicular3DDeviation } from '../../src/fidelity/analyticSurfaceGate';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLES: StyleId[] = ['SuperformulaBlossom', 'FourierBloom', 'SpiralRidges', 'SuperellipseMorph', 'HarmonicRipple', 'GothicArches', 'WaveInterference', 'Crystalline', 'ArtDeco', 'DragonScales', 'BambooSegments', 'RippleInterference', 'GyroidManifold', 'Voronoi', 'BasketWeave', 'GeometricStar', 'HexagonalHive', 'CelticKnot', 'CelticTriquetra', 'LowPolyFacet'] as StyleId[];
const OUT = join('research', 'exchange', '_all20');

/** Binary STL of a lifted (xyz Float32) + indices mesh, with per-face normals. */
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

describe('all-20 sweep + STL/render export', () => {
  it.skipIf(!process.env.PF_ALL20)('iso vs crease per style; export iso STL + render dump', () => {
    mkdirSync(join(OUT, 'stl'), { recursive: true });
    mkdirSync(join(OUT, 'dumps'), { recursive: true });
    const rows: Record<string, unknown>[] = [];
    for (const style of STYLES) {
      const rA = buildRadiusFn(style, {}, DIMS);
      const row: Record<string, unknown> = { style: String(style) };
      // ISO (robust default → STL + render)
      try {
        const t0 = Date.now();
        const iso = buildInhouseMetricMesh(rA, DIMS.H, { tolMm: 0.012, hMin: 0.03, hMax: 8, sizeRes: 192, gradeBeta: 0.2, seedN: 12, maxPoints: 450_000, splitThresh: 1.5, optimizeSweeps: 2 });
        const lifted = liftUtToRadial(iso.ut, rA, DIMS.H);
        const q = triangleQualityDistribution({ vertices: lifted.vertices, indices: iso.indices });
        const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: iso.indices }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.012, seamExclU: 0, denseN: 3 });
        writeBinarySTL(join(OUT, 'stl', `${String(style)}.stl`), lifted.vertices, iso.indices);
        writeFileSync(join(OUT, 'dumps', `${String(style)}.json`), JSON.stringify({ style: String(style), triCount: iso.indices.length / 3, config: String(style), xyz: Array.from(lifted.vertices), tris: Array.from(iso.indices) }));
        row.isoTris = iso.indices.length / 3; row.isoMean = q.meanMinAngleDeg; row.isoPctB20 = q.pctBelow20; row.isoRms = dev.rmsDevMm; row.isoP99 = dev.p99DevMm; row.isoSecs = (Date.now() - t0) / 1000;
      } catch (e) { row.isoError = String(e).slice(0, 120); }
      // CREASE (efficiency comparison)
      try {
        const cr = buildCreaseAlignedMesh(rA, DIMS.H, { tolMm: 0.012, hMin: 0.02, hMax: 1.5, sizeRes: 192, seedN: 12, maxPoints: 450_000, splitThresh: 1.5, maxRounds: 28 });
        const lifted = liftUtToRadial(cr.ut, rA, DIMS.H);
        const dev = perpendicular3DDeviation({ vertices: lifted.vertices, indices: cr.indices }, lifted.utFlat, rA, { H: DIMS.H, tolMm: 0.012, seamExclU: 0, denseN: 3 });
        row.creaseTris = cr.indices.length / 3; row.creaseRms = dev.rmsDevMm; row.creaseHitBudget = cr.hitBudget;
      } catch (e) { row.creaseError = String(e).slice(0, 120); }
      rows.push(row);
      writeFileSync(join(OUT, 'sweep.json'), JSON.stringify(rows, null, 2));
      // eslint-disable-next-line no-console
      console.log(`${String(style).padEnd(20)} iso: tris=${String(row.isoTris ?? 'ERR').padStart(7)} mean=${(row.isoMean as number ?? 0).toFixed(1)} %<20=${(row.isoPctB20 as number ?? 0).toFixed(1)} rms=${(row.isoRms as number ?? 0).toFixed(4)} | crease tris=${String(row.creaseTris ?? '-').padStart(7)} rms=${(row.creaseRms as number ?? 0).toFixed(4)}`);
    }
    expect(rows.length).toBe(20);
  }, 60 * 60 * 1000);
});
