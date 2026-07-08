// _weave_fe.test.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
// E-2026-07-08-WEAVE-FEATURE-EDGE. Env-gated resumable probes (PF_WEAVE_FE=1).
//   BasketWeave:
//     PF_WFE=bw-extract : derive C0 wall loci (closed-form) + placement/step validation + doubled/single scatter ndjson.
//     PF_WFE=bw-build   : conforming re-mesh with the DOUBLED picket pair (planarized PSLG), recovery/tris/proj/watertight.
//     PF_WFE=bw-verdict : whole-mesh radial prefilter + Newton verdict on radial-flagged worst points (on/off-wall split).
//   CelticTriquetra (second): PF_WFE=ct-build / ct-verdict via the validated celticTriquetraC0Predicate doubled band.
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  bwParams, bwReliefField, verticalWallLines, horizontalWallLines, bwDoubledPickets, bwSinglePickets,
  centrelineOnCliff, contoursToConstraints, BW_RAMP_LADDER_U, BW_RAMP_LADDER_T,
  BW_FINE_LADDER_U, BW_FINE_LADDER_T, type Contour,
} from './_bwFieldLib';
import { radiusFn, TANGLED_BASE, wholeMeshGuardRadialBound } from './_pf_tangledKernelLib';
import { planarizeMM } from './_pf_planarizeMM';
import { buildInhouseMetricMesh, auditNonManByIndex } from './labkit';
import { newtonNearest, type NewtonOpts } from './_gyroid_truthLib';
import type { StyleDims } from './labkit';

const RUN = process.env.PF_WEAVE_FE === '1';
const ROOT = join(process.cwd(), 'research/exchange/_weave_fe');
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = 2 * Math.PI;
const NW: NewtonOpts = { seedTheta: 0, seedZ: 0, nThetaSeeds: 11, nZSeeds: 41, maxIter: 60 };

function ensureDir(d: string): void { try { mkdirSync(d, { recursive: true }); } catch { /* exists */ } }

// Build a doubled-picket conforming mesh from an already-planarized (u,t) PSLG. Shared build path for bw + ct.
function buildConforming(
  rA: (th: number, z: number) => number, injectedPoints: number[], constraintEdges: number[],
  maxPoints: number, chordTolMm: number,
): ReturnType<typeof buildInhouseMetricMesh> {
  return buildInhouseMetricMesh(rA as never, DIMS.H, {
    ...TANGLED_BASE, maxPoints, optimizeSweeps: 2,
    guardManifoldAlways: true, chordTolMm, chordSteiner: true,
    injectedPoints, constraintEdges, pinInjected: true,
    guardRecoveryManifold: true, recoveryRobust: true, recoverySubdivideCollinear: true,
    recoveryCollinearEps: Number(process.env.PF_WFEEPS ?? '1e-9'),
  });
}

// Newton verdict on the radial-flagged population of a persisted mesh (mirrors the Gyroid Q3 recipe).
function newtonVerdict(
  rA: (th: number, z: number) => number, ut: number[], idx: Uint32Array, tol: number,
  onWall: (uc: number, tc: number) => boolean, sampleN: number,
): Record<string, number> {
  const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * DIMS.H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  for (let i = 0; i < nV; i++) { const [x, y, z] = lift(ut[2 * i], ut[2 * i + 1]); xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z; }
  const DENSE: Array<[number, number, number]> = [];
  { const n = 8; for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) DENSE.push([i / n, j / n, (n - i - j) / n]); }
  const radialBound = (px: number, py: number, pz: number): number => { if (pz < 0 || pz > DIMS.H) return Infinity; let th = Math.atan2(py, px); if (th < 0) th += TAU; return Math.abs(Math.hypot(px, py) - rA(th, pz)); };
  const nF = idx.length / 3;
  const radOut: Array<{ wbnd: number; wp: [number, number, number]; uc: number; tc: number }> = [];
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const A = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]] as const, B = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]] as const, C = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]] as const;
    let wbnd = 0, wp: [number, number, number] = [A[0], A[1], A[2]];
    for (const [wa, wb, wc] of DENSE) { const px = wa * A[0] + wb * B[0] + wc * C[0], py = wa * A[1] + wb * B[1] + wc * C[1], pz = wa * A[2] + wb * B[2] + wc * C[2]; const d = radialBound(px, py, pz); if (d > wbnd) { wbnd = d; wp = [px, py, pz]; } }
    if (wbnd <= tol) continue;
    const uc = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, tc = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    radOut.push({ wbnd, wp, uc, tc });
  }
  const nRadOut = radOut.length;
  radOut.sort((x, y) => y.wbnd - x.wbnd);
  const stride = Math.max(1, Math.floor(nRadOut / sampleN));
  const sampled = radOut.filter((_, i) => i % stride === 0).slice(0, sampleN);
  const trueDevs: number[] = []; let nTrueOut = 0, maxTrue = 0, nOnWall = 0, nOffWall = 0;
  for (const s of sampled) {
    const nr = newtonNearest(rA as never, DIMS.H, s.wp[0], s.wp[1], s.wp[2], NW);
    trueDevs.push(nr.dist);
    if (nr.dist > tol) { nTrueOut++; if (nr.dist > maxTrue) maxTrue = nr.dist; if (onWall(s.uc, s.tc)) nOnWall++; else nOffWall++; }
  }
  const trueOutFrac = sampled.length ? nTrueOut / sampled.length : 0;
  const scaledTrueOut = Math.round(trueOutFrac * nRadOut);
  trueDevs.sort((x, y) => x - y);
  const pc = (q: number): number => trueDevs.length ? trueDevs[Math.min(trueDevs.length - 1, Math.floor(q * trueDevs.length))] : 0;
  return {
    nRadOutliers: nRadOut, nSampled: sampled.length, nTrueOutInSample: nTrueOut, scaledTrueOutliers: scaledTrueOut,
    trueMax: +maxTrue.toFixed(5), truep50: +pc(0.5).toFixed(5), truep90: +pc(0.9).toFixed(5), truep99: +pc(0.99).toFixed(5),
    nOnWall, nOffWall, offWallFrac: nTrueOut ? +(nOffWall / nTrueOut).toFixed(4) : 0,
  };
}

describe('E-2026-07-08-WEAVE-FEATURE-EDGE', () => {
  // ── BasketWeave Q1: derive C0 wall loci + placement/step validation ────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_WFE !== 'bw-extract')('bw Q1 extract + validate wall loci', () => {
    const DIR = join(ROOT, 'BasketWeave'); ensureDir(DIR);
    const rA = radiusFn('BasketWeave', DIMS);
    const p = bwParams();
    const vlines = verticalWallLines(p), hlines = horizontalWallLines(p);
    const step = centrelineOnCliff(p, rA, DIMS.H, 80);
    const stepMm = Number(process.env.PF_WFESTEP ?? '0.15');
    // RAMP LADDER (measured): a multi-picket fan across the plateau ramp + boundary + floor lip. A single tight
    // bracket left ~0.13mm chord sag; the ladder resolves the ramp to sub-0.01 by construction. Scale via PF_WFELADSC.
    const ladSc = Number(process.env.PF_WFELADSC ?? '1');
    const fine = process.env.PF_WFEFINE === '1';
    const baseU = fine ? BW_FINE_LADDER_U : BW_RAMP_LADDER_U;
    const baseT = fine ? BW_FINE_LADDER_T : BW_RAMP_LADDER_T;
    const offsetsU = baseU.map((o) => o * ladSc);
    const offsetsT = baseT.map((o) => o * ladSc);
    const doubled = bwDoubledPickets(p, rA, DIMS.H, { offsetsU, offsetsT, stepMm });
    const single = bwSinglePickets(p, rA, DIMS.H, stepMm);
    const nPtsDoubled = doubled.contours.reduce((a, c) => a + c.pts.length, 0);
    const nPtsSingle = single.contours.reduce((a, c) => a + c.pts.length, 0);

    // placement: the DOUBLED pickets must FLANK the cliff — measure the 3D radial gap between the two flanking
    // pickets at matched t (proves they straddle the ~2mm wall). Sample the relief on each side.
    const h = bwReliefField();
    let plateauMean = 0, floorMean = 0, nS = 0;
    const probeOff = Math.max(...offsetsU.map(Math.abs));
    for (const L of vlines) for (let s = 0; s < 20; s++) {
      const [u, t] = L.pts[Math.floor((s / 20) * L.pts.length)];
      const hL = h(((u - probeOff) % 1 + 1) % 1, t), hR = h(((u + probeOff) % 1 + 1) % 1, t);
      plateauMean += Math.max(hL, hR); floorMean += Math.min(hL, hR); nS++;
    }
    plateauMean /= Math.max(1, nS); floorMean /= Math.max(1, nS);

    const rec = {
      stage: 'BW-Q1-EXTRACT', params: p,
      nVertWalls: vlines.length, nHorizWalls: hlines.length, maxStepJump: +step.maxStepJump.toFixed(4), nWalls: step.nWalls,
      offsetsU, offsetsT, stepMm,
      doubled: { nContours: doubled.contours.length, nVert: doubled.nVert, nHoriz: doubled.nHoriz, nPts: nPtsDoubled },
      single: { nContours: single.contours.length, nPts: nPtsSingle },
      flanking: { plateauMean: +plateauMean.toFixed(4), floorMean: +floorMean.toFixed(4), radialGapMm: +((plateauMean - floorMean) * p.depth).toFixed(4) },
    };
    appendFileSync(join(DIR, 'extract.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[BW-Q1]', JSON.stringify(rec, null, 2));

    // persist contours for build (resumable)
    const ser = (cs: Contour[]): number[][][] => cs.map((c) => c.pts);
    writeFileSync(join(DIR, 'contours.json'), JSON.stringify({ doubled: ser(doubled.contours), single: ser(single.contours) }));
    // scatter overlay (doubled)
    writeFileSync(join(DIR, 'scatter_doubled.ndjson'),
      doubled.contours.flatMap((c) => c.pts.map(([u, t]) => JSON.stringify({ uc: +u.toFixed(5), tc: +t.toFixed(5), dev: 0.05 }))).join('\n'));

    // KILL(1): the maxStepJump confirms the derived loci ARE the C0 cliffs (h STEPS ~full-depth there). And the
    // doubled pickets must straddle the wall (radialGap ≫ tol). Both are the sub-0.01 placement analog for a STEP.
    expect(step.maxStepJump).toBeGreaterThan(0.5); // the cliff is a near-full-depth step at the derived line
    expect((plateauMean - floorMean) * p.depth).toBeGreaterThan(0.5); // pickets flank a real wall
  }, 20 * 60_000);

  // ── BasketWeave Q2: conforming build (doubled vs single), planarized PSLG ──────────────────────────────────────
  // PF_WFEVARIANT=doubled|single  PF_WFEMAX=<maxPoints>  PF_WFECHORD=<chordTol>  PF_WFETAG=<tag>
  it.skipIf(!RUN || process.env.PF_WFE !== 'bw-build')('bw Q2 conforming build', () => {
    const DIR = join(ROOT, 'BasketWeave'); ensureDir(DIR);
    const rA = radiusFn('BasketWeave', DIMS);
    const variant = process.env.PF_WFEVARIANT ?? 'doubled';
    const maxPoints = Number(process.env.PF_WFEMAX ?? '3000000');
    const chordTolMm = Number(process.env.PF_WFECHORD ?? '0.004');
    const raw = JSON.parse(readFileSync(join(DIR, 'contours.json'), 'utf8')) as { doubled: number[][][]; single: number[][][] };
    const asC = (arr: number[][][]): Contour[] => arr.map((pts) => ({ pts: pts as [number, number][] }));
    const contours = variant === 'single' ? asC(raw.single) : asC(raw.doubled);

    // PLANARIZE the (u,t) PSLG (vertical × horizontal walls CROSS → cdt2d upperIds crash without shared crossing verts).
    // planarizeMM is mm-TUNED (WELD_MM 3e-4, MICRO_MM 5e-3, EPS_ON 3e-3): (u,t) segments are ~6e-4 in u — BELOW
    // MICRO_MM ⇒ ALL pickets get culled (MEASURED: addedVerts=0, edges 13650→5184). Scale (u,t) by SCALE=100 into a
    // pseudo-mm space where the epsilons resolve the ~0.06 segments + crossings, planarize, then unscale.
    const flat = contoursToConstraints(contours);
    const SCALE = Number(process.env.PF_WFEPSCALE ?? '100');
    const scaled = flat.injectedPoints.map((v) => v * SCALE);
    const edgePairs: Array<[number, number]> = [];
    for (let i = 0; i < flat.constraintEdges.length; i += 2) edgePairs.push([flat.constraintEdges[i], flat.constraintEdges[i + 1]]);
    const pl = planarizeMM(scaled, edgePairs);
    const injectedPoints = pl.pts.map((v) => v / SCALE);
    const constraintEdges: number[] = [];
    for (const e of pl.edges) constraintEdges.push(e[0], e[1]);
    const nConstraintVerts = injectedPoints.length / 2, nConstraintEdges = constraintEdges.length / 2;

    const t0 = Date.now();
    const mesh = buildConforming(rA, injectedPoints, constraintEdges, maxPoints, chordTolMm);
    const ms = Date.now() - t0;
    const ut = mesh.ut, idx = mesh.indices as Uint32Array, tris = idx.length / 3;

    // auditNonManByIndex is SHARDED (large-mesh safe); auditNonManRaw's single Map overflows at ≥~6M tris. Use the
    // sound by-index audit only (the mission's watertight gate).
    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
    const nmIdx = auditNonManByIndex(xyz, idx);
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, 0.01);
    // full-pot projection: the outer-wall patch is ~1/2 the pot verts; ×2 is the standard full-pot proj heuristic used across the arc.
    const projFullPot = tris * 2;

    const rec = {
      stage: 'BW-Q2-BUILD', variant, maxPoints, chordTolMm, ms, tris, points: mesh.points, hitBudget: mesh.hitBudget,
      planarize: { addedVerts: pl.addedVerts, residual: pl.residual }, nConstraintVerts, nConstraintEdges,
      recovery: mesh.constraint, nonManIdx: nmIdx, zeroArea: sound.zeroArea, projFullPot,
      soundRadial: { outliers: sound.outliers, max: sound.maxMm, p99: sound.p99 },
    };
    appendFileSync(join(DIR, 'build.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[BW-Q2]', JSON.stringify(rec, null, 2));

    const tag = process.env.PF_WFETAG ?? variant;
    writeFileSync(join(DIR, `mesh_${tag}.ut.bin`), Buffer.from(Float64Array.from(ut).buffer));
    writeFileSync(join(DIR, `mesh_${tag}.idx.bin`), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
    writeFileSync(join(DIR, `mesh_${tag}.meta.json`), JSON.stringify(rec));

    // KILL(2): recovery must not collapse (<90% ⇒ >10% failed)
    expect(mesh.constraint?.failed ?? 0).toBeLessThan(nConstraintEdges * 0.1);
  }, 120 * 60_000);

  // ── BasketWeave Q3: Newton verdict ─────────────────────────────────────────────────────────────────────────────
  it.skipIf(!RUN || process.env.PF_WFE !== 'bw-verdict')('bw Q3 Newton verdict', () => {
    const DIR = join(ROOT, 'BasketWeave'); ensureDir(DIR);
    const rA = radiusFn('BasketWeave', DIMS);
    const tag = process.env.PF_WFETAG ?? 'doubled';
    const tol = Number(process.env.PF_WFETOL ?? '0.01');
    const sampleN = Number(process.env.PF_WFESAMPLE ?? '2500');
    const utBuf = readFileSync(join(DIR, `mesh_${tag}.ut.bin`));
    const idxBuf = readFileSync(join(DIR, `mesh_${tag}.idx.bin`));
    const ut = Array.from(new Float64Array(utBuf.buffer, utBuf.byteOffset, utBuf.byteLength / 8));
    const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);

    // wall proximity: a facet is ON-wall if its centroid (u,t) is within band of ANY cell-boundary line (the cliff).
    const p = bwParams();
    const vlinesU = new Set<number>(); for (let m = 0; m < p.strands; m++) vlinesU.add(m / p.strands);
    const hlinesT: number[] = horizontalWallLines(p).map((L) => L.t);
    const wallBand = Number(process.env.PF_WFEWALLBAND ?? '0.01');
    const onWall = (uc: number, tc: number): boolean => {
      const uu = ((uc % 1) + 1) % 1;
      for (const uw of vlinesU) { let d = Math.abs(uu - uw); if (d > 0.5) d = 1 - d; if (d < wallBand) return true; }
      for (const tw of hlinesT) if (Math.abs(tc - tw) < wallBand) return true;
      return false;
    };

    const nV = ut.length / 2; const xyz = new Float64Array(nV * 3);
    for (let i = 0; i < nV; i++) { const u = ut[2 * i], t = ut[2 * i + 1], th = TAU * u, z = t * DIMS.H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
    const sound = wholeMeshGuardRadialBound(rA, DIMS.H, ut, idx, tol);
    const nm = auditNonManByIndex(xyz, idx);
    const verdict = newtonVerdict(rA, ut, idx, tol, onWall, sampleN);
    const rec = {
      stage: 'BW-Q3-VERDICT', tag, tol, tris: idx.length / 3,
      soundRadialOutliers: sound.outliers, soundRadialMax: sound.maxMm, soundRadialP99: sound.p99,
      ...verdict, nonManIdx: nm, zeroArea: sound.zeroArea,
    };
    appendFileSync(join(DIR, 'verdict.ndjson'), JSON.stringify(rec) + '\n');
    // eslint-disable-next-line no-console
    console.log('[BW-Q3]', JSON.stringify(rec, null, 2));
    expect(idx.length).toBeGreaterThan(0);
  }, 180 * 60_000);
});
