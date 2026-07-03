// _ct_sfbwater.test.ts — DEV-ONLY (PF_CT_SFBWATER=1). E-2026-07-03-SFB-WATER.
// SuperformulaBlossom is the ONLY style with a watertightness defect: rawNonMan 8 at the non-2π θ=0 seam-cliff
// ladder + a 35.7mm ladder count-transition degeneracy. Body is already CAD-grade (radial own-region p99 0.0033,
// interior %<20 0.8-1.1%). GOAL: rawNonMan 0 (non-negotiable) + honest true-3D p99 ≤0.01 (or steep-EXCLUDE-but-
// watertight) + %<20 <~5% + serration ~0 on the seam.
//
// Probes (each env-gated, resumable — checkpoint the instant scored):
//   L)  LOCALIZE  — print (u,t)+key of the rawNonMan edges of the CURRENT buildStructWallSeamSquare (confirm they
//                   are the SM ladder count-transition, NOT a body defect). Cheap: one coarse build.
//   A)  FIX A     — buildSeamLadderWatertight: rebuild the seam cliff as an INDEPENDENT watertight ladder strip
//                   between the body's OPEN u=1- and u=0+ boundary columns (shared by index) → no positional-key
//                   fan → rawNonMan 0 by construction. Score at 2 densities.
//   B)  FIX B     — CDT-under-M + deep sag (buildInhouseMetricMesh {chordTolMm,chordSteiner,guardManifoldAlways})
//                   with the θ=0 seam locus fed as constraintEdges. Score at 2 densities.
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator,
  featureLineChord3D, liftUtToRadial, triangleQualityDistribution, perFaceChordSag,
  bruteAnchoredRedPerp, dumpHeatmap,
} from './labkit';
import { analyticBruteDist } from './_sfbPushLib';
import { buildScaleColMesh, findBirths, measureSeamStep } from './_scaleColDriver';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { msquareRows, rasterizeColumnsSquare, buildStructWallSquare } from './_qcolMsquare';
import { buildSeamLadderWatertight } from './_ct_sfbwaterLib';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_CT_SFBWATER === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_ct_sfbwater');
const LEDGER = join(DIR, 'scorecard.ndjson');
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H, TAU = 2 * Math.PI;
const STYLE = 'SuperformulaBlossom' as StyleId;

/** RAW-index non-manifold: undirected edges (literal index, no weld) shared by >2 tris. (E-prodMeasure pattern.) */
function auditNonManRaw(indices: ArrayLike<number>): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}
/** list the non-manifold edges (endpoints + multiplicity), for the localizer. */
function nmEdges(indices: ArrayLike<number>): Array<{ a: number; b: number; mult: number }> {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  const out: Array<{ a: number; b: number; mult: number }> = [];
  for (const [k, m] of ec) if (m > 2) { const [a, b] = k.split('_').map(Number); out.push({ a, b, mult: m }); }
  return out;
}
/** count degenerate (zero-area) facets — the "ladder degeneracy" signal. */
function degenFaces(xyz: Float64Array | Float32Array, idx: ArrayLike<number>): number {
  let n = 0;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.hypot(nx, ny, nz) < 1e-9) n++;
  }
  return n;
}

/** serration on the seam: max mesh-edge deviation of a seam feature edge from the true feature locus.
 * Here we measure it operationally as: are the seam columns (u≈0/u≈1) exact mesh edges? = 0 if body cols carry
 * u=0+/u=1- vertices exactly on rA(0,z)/rA(2π-,z). We report the max radial residual of any seam-column vertex. */
function seamSerration(ut: number[], xyz: Float64Array, rA: (th: number, z: number) => number): number {
  let mx = 0; const nV = ut.length / 2;
  for (let i = 0; i < nV; i++) {
    const u = ((ut[2 * i] % 1) + 1) % 1;
    if (u < 2e-3 || u > 1 - 2e-3) {
      const z = ut[2 * i + 1] * H; const th = u * TAU; const r = rA(th, z);
      const rx = Math.hypot(xyz[3 * i] - r * Math.cos(th), xyz[3 * i + 1] - r * Math.sin(th));
      if (rx > mx) mx = rx;
    }
  }
  return mx;
}

/** Full scorecard on a structured mesh {xyz,ut,idx}. */
function score(label: string, density: string | number, m: { xyz: Float64Array; ut: number[]; idx: Uint32Array }, rA: ReturnType<typeof buildRadiusFn>, truth: ReturnType<typeof buildFeatureTruth>, ms: number): Record<string, unknown> {
  const ut = m.ut, idx = m.idx;
  const rawNonMan = auditNonManRaw(idx);
  const degen = degenFaces(m.xyz, idx);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, H).vertices, indices: idx });
  const radial = perFaceChordSag(ut, Array.from(idx), rA, H);
  const anchored = bruteAnchoredRedPerp(ut, Array.from(idx), rA, H, { radial, redMm: 0.1, sampleN: 40 });
  // interior feature-line true-3D (body fidelity) — exclude seam/rim band
  const meshUt = buildMeshUt(ut, Array.from(idx), rA, H);
  const loc = buildLocator(meshUt, 256);
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.02 && p.u < 0.98 && p.t > 0.02 && p.t < 0.98)) };
  const fl3 = interior.lines.length ? featureLineChord3D(interior, loc, meshUt, rA, H, 0.05, 0, 4) : { p99Mm: 0, maxMm: 0 };
  const serr = seamSerration(ut, m.xyz, rA);
  const row = {
    label, density, tris: idx.length / 3,
    rawNonMan, degenFaces: degen,
    verdictTrue3dP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(4), gnOver: +anchored.gnOver.toFixed(3), nRed: anchored.nRed,
    flChordP99: +fl3.p99Mm.toFixed(4), flChordMax: +fl3.maxMm.toFixed(4),
    pctB20: +q.pctBelow20.toFixed(2), pctB10: +q.pctBelow10.toFixed(2), p5MinA: +q.p5MinAngleDeg.toFixed(1), medMinA: +q.medianMinAngleDeg.toFixed(1),
    seamSerration: +serr.toFixed(4), ms: Math.round(ms),
  };
  mkdirSync(DIR, { recursive: true });
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${label}/${density} tris=${row.tris} rawNonMan=${row.rawNonMan} degen=${row.degenFaces} verdictP99=${row.verdictTrue3dP99}(gn ${row.gnP99},over ${row.gnOver},red ${row.nRed}) flP99=${row.flChordP99} %<20=${row.pctB20} p5minA=${row.p5MinA} serr=${row.seamSerration} ${row.ms}ms`);
  return row;
}

describe('E-SFB-WATER — SuperformulaBlossom seam-cliff watertightness fix', () => {
  // ── L) LOCALIZE the 8 rawNonMan edges of the current builder ──────────────────────────────────────
  it.skipIf(!RUN)('L: localize the current seam-cliff ladder non-manifold edges', () => {
    mkdirSync(DIR, { recursive: true });
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const build = buildScaleColMesh(rA, H, { hRowMm: 0.35 }); // coarse for speed
    const m = build.mesh;
    const xyz = m.xyz instanceof Float64Array ? m.xyz : Float64Array.from(m.xyz);
    const ut = m.ut, idx = m.idx;
    const rawNonMan = auditNonManRaw(idx);
    const degen = degenFaces(xyz, idx);
    const nm = nmEdges(idx);
    const BIRTHS = findBirths(rA, H, 4096);
    const classify = nm.map((e) => {
      const uA = ((ut[2 * e.a] % 1) + 1) % 1, uB = ((ut[2 * e.b] % 1) + 1) % 1;
      const tA = ut[2 * e.a + 1], tB = ut[2 * e.b + 1];
      const seamBand = (u: number): boolean => u < 0.03 || u > 0.97;
      const nearBirth = BIRTHS.some((bb) => Math.abs(tA - bb) < 0.02 || Math.abs(tB - bb) < 0.02);
      return { uA: +uA.toFixed(3), uB: +uB.toFixed(3), tA: +tA.toFixed(3), tB: +tB.toFixed(3), mult: e.mult, seam: seamBand(uA) || seamBand(uB), nearBirth };
    });
    const seamN = classify.filter((c) => c.seam).length;
    const birthN = classify.filter((c) => c.nearBirth).length;
    const row = { label: 'LOCALIZE', density: 0.35, rawNonMan, degenFaces: degen, seamEdges: seamN, birthEdges: birthN, sample: classify.slice(0, 12) };
    appendFileSync(join(DIR, 'localize.ndjson'), JSON.stringify(row) + '\n');
    // eslint-disable-next-line no-console
    console.log(`LOCALIZE: rawNonMan=${rawNonMan} degen=${degen} | seamBand=${seamN} nearBirth=${birthN}`);
    for (const c of classify) console.log('  ', JSON.stringify(c));
    expect(m.nF).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  // ── A) FIX A: independent watertight seam-cliff ladder strip ──────────────────────────────────────
  for (const hRow of [0.30, 0.15]) {
    it.skipIf(!RUN)(`A: watertight seam ladder @hRow=${hRow}`, () => {
      mkdirSync(DIR, { recursive: true });
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
      const t0 = Date.now();
      // reproduce the driver's structured pipeline but build the body OPEN + close the seam with the fixed ladder.
      const births = findBirths(rA, H, 4096);
      const ts = msquareRows(rA, H, hRow, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: hRow * 6 });
      const graph = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
      const rows = rasterizeColumnsSquare(graph, rA, H, 0.03, 2, 0.03, 0.6);
      const mesh = buildSeamLadderWatertight(rA, H, rows);
      const ms = Date.now() - t0;
      const row = score('FIXA-ladder', hRow, mesh, rA, truth, ms);
      if (hRow === 0.15) {
        const mu = buildMeshUt(mesh.ut, Array.from(mesh.idx), rA, H);
        dumpHeatmap(DIR, `fixA_${hRow}_chord`, mu.xyz, mesh.ut, Array.from(mesh.idx), rA, H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
      }
      expect(row.rawNonMan).toBe(0); // NON-NEGOTIABLE
    }, 40 * 60 * 1000);
  }

  // ── A2) WRAP builder (committed buildStructWallSquare 'wrap'): watertight-by-construction; the θ=0 seam is a
  //      SINGLE bridging facet/row = a genuine near-vertical cliff (steep-EXCLUDE, radial-overstated). This is the
  //      minimal rawNonMan-0 path (the nonMan-8 defect was ONLY in the explicit-cliff seam builder, NOT the wrap). ──
  for (const hRow of [0.30, 0.15]) {
    it.skipIf(!RUN)(`A2: wrap builder @hRow=${hRow}`, () => {
      mkdirSync(DIR, { recursive: true });
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
      const t0 = Date.now();
      const births = findBirths(rA, H, 4096);
      const ts = msquareRows(rA, H, hRow, births, { seamBand: 0.02, speedBlend: 0.5, hRowCapMm: hRow * 6 });
      const graph = buildRidgeGraphDeflicker(rA, H, ts, 4096, { persistFrac: 0.06 });
      const rows = rasterizeColumnsSquare(graph, rA, H, 0.03, 2, 0.03, 0.6);
      const raw = buildStructWallSquare(rA, H, rows, 'wrap');
      const xyz = raw.xyz instanceof Float64Array ? raw.xyz : Float64Array.from(raw.xyz);
      const mesh = { xyz, ut: raw.ut, idx: raw.idx };
      const ms = Date.now() - t0;
      const row = score('A2-wrap', hRow, mesh, rA, truth, ms);
      if (hRow === 0.15) {
        const mu = buildMeshUt(mesh.ut, Array.from(mesh.idx), rA, H);
        dumpHeatmap(DIR, `a2wrap_${hRow}_chord`, mu.xyz, mesh.ut, Array.from(mesh.idx), rA, H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
      }
      expect(row.rawNonMan).toBe(0); // NON-NEGOTIABLE
    }, 40 * 60 * 1000);
  }

  // ── B) FIX B: CDT-under-M + deep sag with seam constraintEdges ─────────────────────────────────────
  const BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;
  for (const [maxPoints, chordTol] of [[900_000, 0.03], [2_200_000, 0.02]] as const) {
    it.skipIf(!RUN)(`B: CDT-under-M + seam constraint @${maxPoints}/${chordTol}`, () => {
      mkdirSync(DIR, { recursive: true });
      const rA = buildRadiusFn(STYLE, {}, DIMS);
      const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
      // seam locus as constraintEdges: chain of (u≈0,t) points down the θ=0 seam. injectedPoints = [u0,t0,u1,t1,...]
      // in the kernel's (u,t) param space (u∈[0,1], t∈[0,1]); constraintEdges = index pairs into that array.
      const nSeam = 200;
      const inj: number[] = [];
      for (let i = 0; i <= nSeam; i++) { const t = i / nSeam; inj.push(1e-6, t); }
      const cEdges: number[] = [];
      for (let i = 0; i < nSeam; i++) cEdges.push(i, i + 1);
      const t0 = Date.now();
      const km = buildInhouseMetricMesh(rA, H, {
        ...BASE, maxPoints, optimizeSweeps: 2, guardManifoldAlways: true,
        chordTolMm: chordTol, chordSteiner: true,
        injectedPoints: inj, constraintEdges: cEdges, guardRecoveryManifold: true, recoveryRobust: true,
      });
      const ms = Date.now() - t0;
      const meshUt = buildMeshUt(Array.from(km.ut), Array.from(km.indices), rA, H);
      const m = { xyz: meshUt.xyz as Float64Array, ut: Array.from(km.ut), idx: km.indices };
      const row = score('FIXB-cdt', `${maxPoints}/${chordTol}`, m, rA, truth, ms);
      (row as Record<string, unknown>).constraint = km.constraint ? { req: km.constraint.requested, rec: km.constraint.recovered, fail: km.constraint.failed } : null;
      appendFileSync(LEDGER, JSON.stringify({ ...row, constraintDetail: (row as Record<string, unknown>).constraint }) + '\n');
      if (chordTol === 0.02) {
        dumpHeatmap(DIR, `fixB_${maxPoints}_chord`, meshUt.xyz, Array.from(km.ut), Array.from(km.indices), rA, H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
      }
      expect(row.tris).toBeGreaterThan(0);
    }, 60 * 60 * 1000);
  }
});
