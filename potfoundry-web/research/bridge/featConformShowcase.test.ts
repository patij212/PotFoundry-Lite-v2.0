// featConformShowcase.test.ts — DEV-ONLY (env PF_SHOWCASE=1). Generates BASELINE vs feature-CONFORMED meshes
// for the user's two complaint styles (GothicArches, BambooSegments), measures true-3D + slivers + watertight,
// and dumps render-bins (.xyz.bin/.idx.bin/.meta.json) + binary STL for each. Also runs GothicArches at 3M
// (the D4 high-density confirmation) in the same pass. MEASURE + EXPORT only; no src/ edits.
//
// Run: PF_SHOWCASE=1 npx vitest run research/bridge/featConformShowcase.test.ts
import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildInhouseMetricMesh, type InhouseMeshOpts } from './inhouseMetricMesh';
import { buildFeatureConformingMeshB } from './featureConformingMesh';
import { computeMeasuredGate } from './featureSharpnessGate';
import { buildRadiusFn, type StyleDims } from './runStyle';
import {
  buildMeshUt, buildLocator, buildFeatureTruth, featureLineChord, featureLineChord3D,
  featureAdjacentSlivers,
} from './featureLocalizedFidelity';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TRUTH_RES = 384;
const STEP_MM = 0.05;
const GATE_FLOOR_MM = 0.1, GATE_STEP_MM = 0.12, CELL_R = 3;
const OUT = join('research', 'exchange', '_showcase');

type Job = { style: StyleId; tag: string; maxPoints: number; tolMm: number; hMin: number; confOnly?: boolean };
const JOBS: Job[] = [
  { style: 'GothicArches' as StyleId, tag: '1M', maxPoints: 1_000_000, tolMm: 0.006, hMin: 0.01 },
  { style: 'BambooSegments' as StyleId, tag: '1M', maxPoints: 1_000_000, tolMm: 0.006, hMin: 0.01 },
  { style: 'GothicArches' as StyleId, tag: '3M', maxPoints: 3_000_000, tolMm: 0.004, hMin: 0.008, confOnly: true },
];

/** 3D-weld-by-index non-manifold edge count (>2 incident tris after position-weld). */
function auditNonMan(xyz: Float64Array, indices: ArrayLike<number>): number {
  const n = xyz.length / 3;
  const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(xyz[3 * i] * 1e4)}_${Math.round(xyz[3 * i + 1] * 1e4)}_${Math.round(xyz[3 * i + 2] * 1e4)}`;
    const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; }
  }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const ec = new Map<number, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = canon[indices[k]], b = canon[indices[k + 1]], c = canon[indices[k + 2]];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const kk = key(p, q); ec.set(kk, (ec.get(kk) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

/** Binary STL (per-face normals from geometry). xyz = Float64 lifted positions. */
function writeBinarySTL(path: string, xyz: Float64Array, idx: ArrayLike<number>): void {
  const nTri = idx.length / 3;
  const buf = Buffer.alloc(84 + nTri * 50);
  buf.writeUInt32LE(nTri, 80);
  let off = 84;
  for (let t = 0; t < nTri; t++) {
    const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    buf.writeFloatLE(ax, off + 12); buf.writeFloatLE(ay, off + 16); buf.writeFloatLE(az, off + 20);
    buf.writeFloatLE(bx, off + 24); buf.writeFloatLE(by, off + 28); buf.writeFloatLE(bz, off + 32);
    buf.writeFloatLE(cx, off + 36); buf.writeFloatLE(cy, off + 40); buf.writeFloatLE(cz, off + 44);
    off += 50;
  }
  writeFileSync(path, buf);
}

function dump(name: string, ut: number[], indices: ArrayLike<number>, xyz: Float64Array, extra: object): void {
  const f32 = Float32Array.from(xyz);
  writeFileSync(join(OUT, `${name}.xyz.bin`), Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength));
  const u32 = indices instanceof Uint32Array ? indices : Uint32Array.from(indices);
  writeFileSync(join(OUT, `${name}.idx.bin`), Buffer.from(u32.buffer, u32.byteOffset, u32.byteLength));
  writeFileSync(join(OUT, `${name}.meta.json`), JSON.stringify({ name, tris: indices.length / 3, ...extra }));
  writeBinarySTL(join(OUT, `${name}.stl`), xyz, indices);
}

describe('feature-conform showcase (before/after renders + STL + HD confirm)', () => {
  it.skipIf(process.env.PF_SHOWCASE !== '1')('baseline vs conformed dumps', () => {
    mkdirSync(OUT, { recursive: true });
    for (const job of JOBS) {
      const { style, tag } = job;
      const rA = buildRadiusFn(style, {}, DIMS);
      const truth = buildFeatureTruth(style, {}, DIMS, TRUTH_RES);
      const OPTS: InhouseMeshOpts = {
        tolMm: job.tolMm, hMin: job.hMin, hMax: 8, sizeRes: 256, gradeBeta: 0.2,
        seedN: 14, maxPoints: job.maxPoints, splitThresh: 1.5, optimizeSweeps: 2,
      };
      const measure = (label: string, ut: number[], indices: Uint32Array): void => {
        const m = buildMeshUt(ut, indices, rA, DIMS.H);
        const loc = buildLocator(m, 256);
        const fl = featureLineChord(truth, loc, rA, DIMS.H, STEP_MM);
        const fl3 = featureLineChord3D(truth, loc, m, rA, DIMS.H, STEP_MM, fl.p99Mm, CELL_R);
        const sl = featureAdjacentSlivers(truth, loc, m, STEP_MM);
        const nonMan = auditNonMan(m.xyz, indices);
        // eslint-disable-next-line no-console
        console.log(`${label.padEnd(26)} tris=${String(indices.length / 3).padStart(8)} true3D_p99=${fl3.p99Mm.toFixed(4)} true3D_max=${fl3.maxMm.toFixed(3)} slivR=${sl.sliverRatio.toFixed(2)} featAdj%<20=${sl.featureAdj_pct20.toFixed(1)} nonMan=${nonMan}`);
        dump(label, ut, indices, m.xyz, { true3D_p99: fl3.p99Mm, true3D_max: fl3.maxMm, sliverRatio: sl.sliverRatio, featAdj_pct20: sl.featureAdj_pct20, nonMan });
      };

      // BASELINE (default kernel + manifold guard)
      const base = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true });
      const baseM = buildMeshUt(base.ut, base.indices, rA, DIMS.H);
      const baseLoc = buildLocator(baseM, 256);
      const gate = computeMeasuredGate(truth, baseLoc, baseM, rA, DIMS.H, { stepMm: GATE_STEP_MM, trueFloorMm: GATE_FLOOR_MM, cellR: CELL_R });
      if (!job.confOnly) measure(`${style}_${tag}_base`, base.ut, Uint32Array.from(base.indices));

      // CONFORMED (gated Stage-B + manifold guard)
      const conf = buildFeatureConformingMeshB(style, {}, DIMS, {
        ...OPTS, guardManifoldAlways: true, searchHalfMm: 0.6, truthRes: TRUTH_RES, pin: true, truth,
        injectStepMm: 0.08, lineFilter: (_l, i) => gate.keep[i],
      });
      // eslint-disable-next-line no-console
      console.log(`  gate kept ${gate.kept} loci; recovery ${conf.constraint ? `${conf.constraint.recovered}/${conf.constraint.requested}` : 'n/a'}`);
      measure(`${style}_${tag}_conf`, conf.ut, Uint32Array.from(conf.indices));
    }
    expect(true).toBe(true);
  }, 90 * 60 * 1000);
});
