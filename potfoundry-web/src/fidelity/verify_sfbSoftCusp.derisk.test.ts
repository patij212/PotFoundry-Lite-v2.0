/**
 * verify_sfbSoftCusp.derisk.test.ts — does softening the petal cusps cut the slivers?
 *
 * The serration is the thin flank triangles at SFB@1's knife-sharp cusps (geometric,
 * present in BOTH per-cell and corridor). The only remaining lever is softening the
 * cusp (raise sf_n1 / sf_n1_top → wider flank angle). This writes per-cell outer-wall
 * STLs at SHARP (default n1) vs SOFT n1 so the mesh analyzer can compare the cusp
 * sliver/protrusion drop. Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { styleSampler, type StyleId } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { buildConformingWall } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import type { SurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const H = 120, R0 = 40;
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const FL = 11;
const OUT = path.resolve(__dirname, '..', '..', 'export-deliverables');

function buildAndWrite(label: string, opts: Record<string, number>): void {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', opts);
  const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
  const featLines: FeatureLine[] = graph.lines.filter((l) => l.kind === 'general-curve').map((c, i) => ({ kind: 'general-curve', label: `c${i}`, points: c.points.map((p) => ({ u: p.u, t: p.t })) }));
  const sampler: SurfaceSampler = styleSampler('SuperformulaBlossom' as StyleId, opts, STYLE_DIMS);
  const w = buildConformingWall(sampler, {
    maxSagMm: 0.05, maxEdgeMm: 1, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12,
    resU: 128, resT: 128, nRing: 1 << FL, surfaceId: 0, featureLines: featLines, featureLevel: FL,
    targetTriangles: 6_000_000, budgetMode: 'cap', uBias: 2,
  });
  const v = w.vertices, idx = w.indices, nTri = idx.length / 3;
  const buf = Buffer.alloc(80 + 4 + nTri * 50);
  buf.write(`SFB ${label}`.slice(0, 79), 0, 'ascii'); buf.writeUInt32LE(nTri, 80);
  let off = 84;
  const p3 = (i: number): [number, number, number] => { const r = sampler.position(v[i * 3], v[i * 3 + 1]); return [r[0], r[1], r[2]]; };
  for (let t = 0; t < nTri; t++) {
    const a = p3(idx[t * 3]), b = p3(idx[t * 3 + 1]), c = p3(idx[t * 3 + 2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    for (let k = 0; k < 3; k++) { const pp = [a, b, c][k]; buf.writeFloatLE(pp[0], off + 12 + k * 12); buf.writeFloatLE(pp[1], off + 16 + k * 12); buf.writeFloatLE(pp[2], off + 20 + k * 12); }
    buf.writeUInt16LE(0, off + 48); off += 50;
  }
  fs.writeFileSync(path.join(OUT, `SuperformulaBlossom_sf1_${label}.stl`), buf);
  // eslint-disable-next-line no-console
  console.log(`[soft-test] ${label} (${JSON.stringify(opts)}) tris=${nTri}`);
}

describe.skipIf(!process.env.PF_DERISK)('SFB sharp vs soft cusp sliver test', () => {
  it('writes per-cell STLs at sharp (default) and soft n1', () => {
    fs.mkdirSync(OUT, { recursive: true });
    buildAndWrite('sharp', { sf_strength: 1 }); // defaults: sf_n1=0.35, sf_n1_top=0.50
    buildAndWrite('soft', { sf_strength: 1, sf_n1: 1.0, sf_n1_top: 1.2 });
    expect(true).toBe(true);
  }, 600000);
});
