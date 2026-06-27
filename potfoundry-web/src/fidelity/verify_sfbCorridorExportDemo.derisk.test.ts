/**
 * verify_sfbCorridorExportDemo.derisk.test.ts — A/B DELIVERABLE.
 *
 * Writes TWO SFB@1 outer-wall STLs to export-deliverables/ so the user can compare
 * the petal cusps in a slicer:
 *   - ..._percell.stl  : the current production path (per-cell CDT crest insertion) —
 *                        the SAWTOOTH.
 *   - ..._corridor.stl : the fix (per-loop hole-fill corridor) — CLEAN cusp edges.
 * Same analytic SFB surface, same cusps, same featureLevel. Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { buildConformingWall } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { realFeatureCorridorPerLoop, type MultiFeatureSpec } from './bandRemesh/realCorridor';
import type { UTPoint } from './bandRemesh/corridorPave';
import type { SurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';

const H = 120, R0 = 40, TBOTTOM = 6;
const DIMS = { H, tBottom: TBOTTOM, rDrain: 0 };
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const FL = 10; // demo featureLevel (smaller STL than FL11; cusp topology is the same)
const OUT = path.resolve(__dirname, '..', '..', 'export-deliverables');

function cusps(): UTPoint[][] {
  const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
  const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
  const out: UTPoint[][] = [];
  for (const c of graph.lines.filter((l) => l.kind === 'general-curve')) {
    const pts = c.points;
    if (pts.length < 8) continue;
    let tMin = 1, tMax = 0, uMin = 1, uMax = 0, seam = false;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k]; tMin = Math.min(tMin, p.t); tMax = Math.max(tMax, p.t); uMin = Math.min(uMin, p.u); uMax = Math.max(uMax, p.u);
      if (k > 0 && Math.abs(pts[k].u - pts[k - 1].u) > 0.5) seam = true;
    }
    if (seam || uMin < 0.08 || uMax > 0.92 || tMax - tMin < 0.5) continue;
    const sub = pts.filter((p) => p.t >= 0.12 && p.t <= 0.88).map((p) => ({ u: p.u, t: p.t }));
    if (sub.length >= 4) out.push(sub);
  }
  return out;
}

function writeStl(file: string, sampler: SurfaceSampler, utVerts: Array<[number, number]>, indices: number[] | Uint32Array, header: string): number {
  const nTri = indices.length / 3;
  const pos = new Float32Array(utVerts.length * 3);
  for (let i = 0; i < utVerts.length; i++) { const p = sampler.position(utVerts[i][0], utVerts[i][1]); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; }
  const buf = Buffer.alloc(80 + 4 + nTri * 50);
  buf.write(header.slice(0, 79), 0, 'ascii'); buf.writeUInt32LE(nTri, 80);
  let off = 84;
  for (let t = 0; t < nTri; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    buf.writeFloatLE(pos[a], off + 12); buf.writeFloatLE(pos[a + 1], off + 16); buf.writeFloatLE(pos[a + 2], off + 20);
    buf.writeFloatLE(pos[b], off + 24); buf.writeFloatLE(pos[b + 1], off + 28); buf.writeFloatLE(pos[b + 2], off + 32);
    buf.writeFloatLE(pos[c], off + 36); buf.writeFloatLE(pos[c + 1], off + 40); buf.writeFloatLE(pos[c + 2], off + 44);
    buf.writeUInt16LE(0, off + 48); off += 50;
  }
  fs.writeFileSync(file, buf);
  return buf.length;
}

describe.skipIf(!process.env.PF_DERISK)('SFB corridor export A/B demo (per-cell vs corridor)', () => {
  const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, STYLE_DIMS);
  const cs = cusps();

  it('writes per-cell (sawtooth) + corridor (clean) outer-wall STLs', () => {
    fs.mkdirSync(OUT, { recursive: true });

    // ── PER-CELL (the sawtooth): the cusps inserted via the per-cell CDT. ──
    const featLines: FeatureLine[] = cs.map((c, i) => ({ kind: 'general-curve', label: `cusp${i}`, points: c.map((p) => ({ u: p.u, t: p.t })) }));
    const pc = buildConformingWall(sampler, {
      maxSagMm: 0.1, maxEdgeMm: 8, minEdgeMm: 0.1, gradeRatio: 2, maxLevel: 12,
      resU: 128, resT: 128, nRing: 1 << FL, surfaceId: 0, featureLines: featLines, featureLevel: FL,
      targetTriangles: 6_000_000, budgetMode: 'cap', uBias: 2,
    });
    const pcUT: Array<[number, number]> = [];
    for (let i = 0; i < pc.vertices.length; i += 3) pcUT.push([pc.vertices[i], pc.vertices[i + 1]]);
    const pcBytes = writeStl(path.join(OUT, 'SuperformulaBlossom_sf1_percell.stl'), sampler, pcUT, pc.indices, 'SFB sf1 per-cell (sawtooth)');

    // ── CORRIDOR (the fix): per-loop hole-fill. ──
    const specs: MultiFeatureSpec[] = cs.map((polyline) => ({ polyline }));
    const co = realFeatureCorridorPerLoop(sampler, specs, { featureLevel: FL, widthMm: 3, dims: DIMS });
    const coBytes = writeStl(path.join(OUT, 'SuperformulaBlossom_sf1_corridor.stl'), sampler, co.merged.vertexUT, co.merged.indices, 'SFB sf1 corridor (clean cusps)');

    /* eslint-disable no-console */
    console.log(`[SFB A/B] cusps=${cs.length} | per-cell tris=${pc.indices.length / 3} (${(pcBytes / 1048576).toFixed(1)}MB) | corridor tris=${co.merged.indices.length / 3} (${(coBytes / 1048576).toFixed(1)}MB) holeLoops=${co.hole.loops.length}`);
    console.log(`  per-cell:  export-deliverables/SuperformulaBlossom_sf1_percell.stl`);
    console.log(`  corridor:  export-deliverables/SuperformulaBlossom_sf1_corridor.stl`);
    /* eslint-enable no-console */

    expect(cs.length).toBeGreaterThan(0);
    expect(pc.indices.length).toBeGreaterThan(0);
    expect(co.merged.indices.length).toBeGreaterThan(0);
  }, 600000);
});
