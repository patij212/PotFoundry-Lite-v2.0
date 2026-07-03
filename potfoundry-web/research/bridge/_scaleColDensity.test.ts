// _scaleColDensity.test.ts — DEV-ONLY. E-SCALECOL density-response test: separate "wrong-primitive-but-fixable"
// (z-tiled: chord DENSITY-RESPONSIVE via uniform/SHARP3D) from "true WALL" (multi-valued weave: DENSITY-INVARIANT).
// FAST: build via the driver at a given hRow, measure interior true-3D worst on worst-K=600 facets only (min(GN,
// analyticBrute)) + min-angle + rawNonMan. One (style,path,hRow) per run; resumable checkpoint.
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface } from './labkit';
import { buildScaleColMesh } from './_scaleColDriver';
import { analyticBruteDist } from './_sfbPushLib';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SCALECOL === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_scalecol');

function rawAudit(idxA: Uint32Array): number {
  let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
  const EK = mx + 1; const NSHARD = 64; const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
  const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
  for (let f = 0; f < idxA.length; f += 3) { bump(idxA[f], idxA[f + 1]); bump(idxA[f + 1], idxA[f + 2]); bump(idxA[f], idxA[f + 2]); }
  let nm = 0; for (const m of ms) for (const v of m.values()) if (v > 2) nm++; return nm;
}

describe.skipIf(!RUN)('E-SCALECOL density-response (fast)', () => {
  it('interior true-3D worst on worst-K vs density (resumable)', () => {
    const STYLE = (process.env.PF_SCALECOL_STYLE ?? 'DragonScales') as StyleId;
    const hRowMm = Number(process.env.PF_SCALECOL_HROW ?? '0.15');
    const forcePath = process.env.PF_SCALECOL_PATH as ('ridge-graph' | 'uniform-smooth' | undefined);
    const sub = process.env.PF_SCALECOL_SUB ?? 'd';
    const K = Number(process.env.PF_SCALECOL_K ?? '600');
    const name = `dens_${STYLE}_${sub}_${forcePath ?? 'auto'}_h${String(hRowMm).replace('.', 'p')}`;
    if (existsSync(join(ROOT, `${name}.json`))) { console.log(`SKIP ${name}`); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS); const t0 = Date.now();
    const build = buildScaleColMesh(rA, DIMS.H, { hRowMm, scanN: 5000, ...(forcePath ? { forcePath } : {}) });
    const mesh = build.mesh; const idxA = mesh.idx; const nF = mesh.nF;
    const own = perFaceChordSag(mesh.ut, idxA, rA, DIMS.H);
    const seamBand = 0.01;
    const faceInt = (f: number): boolean => { for (let e = 0; e < 3; e++) { const u = mesh.ut[2 * idxA[3 * f + e]]; if (u < seamBand || u > 1 - seamBand) return false; } return true; };
    const intFaces: number[] = []; for (let f = 0; f < nF; f++) if (faceInt(f)) intFaces.push(f);
    intFaces.sort((a, b) => own.faceErr[b] - own.faceErr[a]);
    let intTrue = 0, over01 = 0; const kk = Math.min(K, intFaces.length);
    for (let ii = 0; ii < kk; ii++) {
      const f = intFaces[ii]; const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
      const cx = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, cy = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, cz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
      const d = Math.min(projectPointToRadialSurface(cx, cy, cz, rA).dist, analyticBruteDist(cx, cy, cz, rA, DIMS.H));
      if (d > intTrue) intTrue = d; if (d > 0.01) over01++;
    }
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(mesh.xyz), indices: idxA });
    const nm = rawAudit(idxA);
    const rec = { style: STYLE, path: build.path, builder: build.builder, hRowMm, tris: nF, K: kk, intTrueWorstMm: +intTrue.toFixed(4), nOver01: over01, minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20, rawNonMan: nm, elapsedSec: +((Date.now() - t0) / 1000).toFixed(1) };
    mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(rec, null, 2));
    console.log(`${name}: tris=${nF} intTrueWorst=${intTrue.toFixed(4)} over01=${over01} minAng=${tq.minAngleDeg.toFixed(1)} %<20=${tq.pctBelow20.toFixed(1)} nm=${nm} (${rec.elapsedSec}s)`);
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
