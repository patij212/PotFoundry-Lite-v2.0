/**
 * verify_sfbExactEval.derisk.test.ts — does EXACT per-vertex evaluation fix the
 * SFB@1 valley-cusp defect, or is it a topology fold that survives?
 *
 * Root cause (workflow wf_4164cc5e): the CPU styleSampler is a 512x512 BILINEAR
 * grid; sampler.position(u,t) chords the knife-sharp petal tips => vertices up to
 * ~0.8mm (7mm at the seam) INSIDE the true surface, and 243 outer-wall triangles
 * fold 3D-inward at the deep valley seam (theta=30deg) because the per-cell CDT
 * winding-checks ONLY in (u,t).
 *
 * This builds the EXACT sharp.stl topology, then evaluates each vertex BOTH ways:
 *   - GRID:  sampler.position(u,t)            (the chorded 512-grid — what shipped)
 *   - EXACT: radiusFn(theta,z,...) directly   (the true analytic surface = what a
 *            GPU exact-eval production export does)
 * and reports, for each, the off-true-surface radial gap AND the 3D-fold count
 * (face normal vs the analytic outward normal). Writes the EXACT-eval STL.
 *
 * DECISIVE: if EXACT folds ~= 0 => exact eval is the whole fix (off-surface + folds)
 * and the defect is a CPU-harness artifact (production GPU-exact is clean). If EXACT
 * folds persist => the fold is a topology issue (valley loci / orientation guard).
 * Pure CPU, PF_DERISK.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { styleSampler } from '../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { extractAnalyticFeatures, type FeatureLine } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { buildStyleParamPayload } from '../utils/styleParams';
import { buildConformingWall } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import { STYLE_FUNCTIONS } from '../geometry/styles';
import { baseRadius } from '../geometry/profile';
import { DEFAULT_STYLE_PARAMS } from '../geometry/types';

const H = 120, R0 = 40;
const STYLE_DIMS = { H, Rt: R0, Rb: R0, expn: 1 };
const FL = 11;
const OUT = path.resolve(__dirname, '..', '..', 'export-deliverables');

type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

describe.skipIf(!process.env.PF_DERISK)('SFB exact-eval vs grid-eval — isolates sampler chord from topology fold', () => {
  it('re-evaluates the sharp.stl topology exactly and counts off-surface + folds both ways', () => {
    fs.mkdirSync(OUT, { recursive: true });

    // ALL petal feature-curves (the full-feature build = sharp.stl), unclipped.
    const [, packed] = buildStyleParamPayload('SuperformulaBlossom', { sf_strength: 1 });
    const graph = extractAnalyticFeatures('SuperformulaBlossom', Float32Array.from(packed), { H, Rt: R0, Rb: R0 }, { surfaceFidelityExact: true });
    const featLines: FeatureLine[] = graph.lines.filter((l) => l.kind === 'general-curve').map((c, i) => ({ kind: 'general-curve', label: `c${i}`, points: c.points.map((p) => ({ u: p.u, t: p.t })) }));

    // DENSER build (fold-vs-density probe): finer cells at the valley flanks.
    const DENSE = process.env.SFB_DENSE === '1';
    const sampler = styleSampler('SuperformulaBlossom', { sf_strength: 1 }, { ...STYLE_DIMS, gridResU: DENSE ? 2048 : undefined, gridResT: DENSE ? 1024 : undefined });
    const w = buildConformingWall(sampler, {
      maxSagMm: DENSE ? 0.025 : 0.05, maxEdgeMm: DENSE ? 0.4 : 1, minEdgeMm: 0.05, gradeRatio: 2, maxLevel: DENSE ? 13 : 12,
      resU: 128, resT: 128, nRing: 1 << (DENSE ? 12 : FL), surfaceId: 0, featureLines: featLines, featureLevel: DENSE ? 12 : FL,
      targetTriangles: 8_000_000, budgetMode: 'cap', uBias: 2,
    });

    // EXACT analytic position — exactly what styleSampler evaluates at grid NODES,
    // but at the vertex's true (u,t) (no bilinear interpolation) = the true surface.
    const radiusFn = STYLE_FUNCTIONS['SuperformulaBlossom'];
    const opts = { ...DEFAULT_STYLE_PARAMS['SuperformulaBlossom'], sf_strength: 1 };
    const exactPos = (u: number, t: number): V3 => {
      const z = t * H;
      const r0 = baseRadius(z, H, R0, R0, 1, opts);
      const theta = 2 * Math.PI * u;
      const r = radiusFn(theta, z, r0, H, opts);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    };
    const exactNormal = (u: number, t: number): V3 => {
      const hu = 1e-3, ht = 1e-3;
      const tu = Math.min(0.999, Math.max(0.001, t));
      const pu = sub(exactPos(u + hu, tu), exactPos(u - hu, tu));
      const pt = sub(exactPos(u, Math.min(1, tu + ht)), exactPos(u, Math.max(0, tu - ht)));
      let n = norm(cross(pu, pt));
      const theta = 2 * Math.PI * u;
      if (n[0] * Math.cos(theta) + n[1] * Math.sin(theta) < 0) n = [-n[0], -n[1], -n[2]];
      return n;
    };

    const nV = w.vertices.length / 3;
    const uv: Array<[number, number]> = [];
    const pGrid: V3[] = [];
    const pExact: V3[] = [];
    const offGrid: number[] = [];
    for (let i = 0; i < nV; i++) {
      const u = w.vertices[i * 3], t = w.vertices[i * 3 + 1];
      uv.push([u, t]);
      const g = sampler.position(u, t) as unknown as V3;
      const e = exactPos(u, t);
      pGrid.push([g[0], g[1], g[2]]); pExact.push(e);
      const z = t * H;
      // outer wall only (match the analyzer filter): r>42, z in [8,112]
      const rg = Math.hypot(g[0], g[1]);
      if (rg > 42 && z >= 8 && z <= 112) offGrid.push(Math.abs(rg - Math.hypot(e[0], e[1])));
    }

    const idx = w.indices;
    const nT = idx.length / 3;
    let foldGrid = 0, foldExact = 0, outerT = 0;
    const foldExactLoc: Array<{ theta: number; z: number; r: number }> = [];
    for (let f = 0; f < nT; f++) {
      const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
      const uc = (uv[a][0] + uv[b][0] + uv[c][0]) / 3, tc = (uv[a][1] + uv[b][1] + uv[c][1]) / 3;
      const ge = pExact[a], cz = tc * H;
      const cr = Math.hypot((pExact[a][0] + pExact[b][0] + pExact[c][0]) / 3, (pExact[a][1] + pExact[b][1] + pExact[c][1]) / 3);
      if (!(cr > 42 && cz >= 8 && cz <= 112)) continue;
      outerT++;
      const nA = exactNormal(uc, tc);
      const nG = norm(cross(sub(pGrid[b], pGrid[a]), sub(pGrid[c], pGrid[a])));
      const nE = norm(cross(sub(pExact[b], pExact[a]), sub(pExact[c], pExact[a])));
      if (dot(nG, nA) < 0) foldGrid++;
      if (dot(nE, nA) < 0) { foldExact++; foldExactLoc.push({ theta: (Math.atan2(ge[1], ge[0]) * 180 / Math.PI + 360) % 360, z: cz, r: cr }); }
      void 0;
    }

    // Write the EXACT-eval STL (the candidate on-surface deliverable).
    const buf = Buffer.alloc(80 + 4 + nT * 50);
    buf.write('SFB sf1 EXACT-eval (on-surface)', 0, 'ascii'); buf.writeUInt32LE(nT, 80);
    let off = 84;
    for (let f = 0; f < nT; f++) {
      const a = idx[f * 3], b = idx[f * 3 + 1], c = idx[f * 3 + 2];
      const A = pExact[a], B = pExact[b], C = pExact[c];
      const n = norm(cross(sub(B, A), sub(C, A)));
      buf.writeFloatLE(n[0], off); buf.writeFloatLE(n[1], off + 4); buf.writeFloatLE(n[2], off + 8);
      for (let k = 0; k < 3; k++) { const pp = [A, B, C][k]; buf.writeFloatLE(pp[0], off + 12 + k * 12); buf.writeFloatLE(pp[1], off + 16 + k * 12); buf.writeFloatLE(pp[2], off + 20 + k * 12); }
      buf.writeUInt16LE(0, off + 48); off += 50;
    }
    fs.writeFileSync(path.join(OUT, 'SuperformulaBlossom_sf1_exacteval.stl'), buf);

    /* eslint-disable no-console */
    console.log(`[EXACT-EVAL] verts=${nV} tris=${nT} outerTris=${outerT}`);
    const offGridMax = offGrid.reduce((m, v) => (v > m ? v : m), 0);
    console.log(`  off-surface (GRID, outer): p50=${pct(offGrid, 0.5).toFixed(4)} p99=${pct(offGrid, 0.99).toFixed(4)} max=${offGridMax.toFixed(4)} mm  (n=${offGrid.length})`);
    console.log(`  off-surface (EXACT): 0 by construction (vertices placed ON radiusFn)`);
    console.log(`  3D FOLDS: grid=${foldGrid}  exact=${foldExact}  (outer-wall faces, normal vs analytic outward)`);
    if (foldExact > 0) {
      const tm = foldExactLoc.map((l) => ((l.theta % 30) + 30) % 30);
      console.log(`  exact-fold theta mod 30: p10=${pct(tm, 0.1).toFixed(1)} p50=${pct(tm, 0.5).toFixed(1)} p90=${pct(tm, 0.9).toFixed(1)} ; r p50=${pct(foldExactLoc.map((l) => l.r), 0.5).toFixed(1)}`);
    }
    console.log(`  wrote export-deliverables/SuperformulaBlossom_sf1_exacteval.stl`);
    /* eslint-enable no-console */

    expect(nT).toBeGreaterThan(0);
  }, 600000);
});
