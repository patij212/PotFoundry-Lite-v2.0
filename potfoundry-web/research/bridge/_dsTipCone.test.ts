// _dsTipCone.test.ts — E-2026-07-23-DS-TIPCONE-RULER. Refute-or-confirm the DragonScales scale-tip
// "~0.096mm cone-apex concession". Measure the PRODUCTION cone-fan wall's TRUE-3D PERPENDICULAR chord at
// the scale-tip apex with FOUR independent rulers, sweep density, and trace the provenance of 0.096.
//
// The apex is a C1 CONE (ruled surface): a graded polar fan of flat triangles must close it to any tol
// (circumferential chord ≈ r·Δφ²/8 → 0). Registry E-2026-07-21-DS-CONEFAN-PROD already read apex true-3D
// MAX 0.0072 @nU4096 (perFaceTrue3DSag) on a ~22.9/√tris law. This probe INDEPENDENTLY cross-checks that
// against the `measureProjectorMax` engine (buildRadialSurfaceProjector — a globally-correct PERPENDICULAR
// projector, NOT a same-θ radial ruler) on the EMITTED f32 verts, a brute gold-standard, and the radial
// same-(u,t) ruler, and nails where the 0.096 headline comes from (fan-off vs tread-inflation vs cone).
//
// DEV-ONLY; research/ only; READ-ONLY src (buildDsConeFanWallGeometric / buildDsRingStripWallGeometric /
// buildRadialSurfaceProjector / measureProjectorMax / buildRadiusFn / labkit). Env-gated + checkpointed.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import {
  perFaceTrue3DSag, triangleQualityDistribution, auditNonManByIndex, nonManRawBigStats,
  bruteNearestOnRadialSurface, projectPointToRadialSurface, buildRadiusFn,
} from './labkit';
import type { StyleDims } from './labkit';
import {
  buildDsConeFanWallGeometric, buildDsRingStripWallGeometric,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { measureProjectorMax } from '../../src/fidelity/measureProjectorMax';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';
import type { RadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';

const TAU = 2 * Math.PI;
const H = 120;
const TOL = 0.01;
const SCALE_ROWS = 8;
const SCALES_PER_ROW = 16;
const OUT_DIR = join('research', 'exchange', '_dsTipCone');
const NDJSON = join(OUT_DIR, 'tipcone.ndjson');

// Production dims: DEFAULT_DIMENSIONS (OD140 ⇒ Rt70/Rb45/expn1.1) is the app default the cone-fan ships on.
// registry Rt50/Rb40/expn1 = the prodtruth-capture dims the E-CONEFAN-PROD 0.0072 baseline used.
const DIMS_DEFAULT: StyleDims = { H, Rb: 45, Rt: 70, expn: 1.1 };
const DIMS_REG: StyleDims = { H, Rb: 40, Rt: 50, expn: 1 };

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}

function dtToCrest(t: number): number {
  let m = 1e9;
  for (let k = 0; k < SCALE_ROWS; k++) { const d = Math.abs(t - (k + 0.5) / SCALE_ROWS); if (d < m) m = d; }
  return m;
}
function rAOf(dims: StyleDims): AnalyticRadiusFn {
  return buildRadiusFn('DragonScales' as StyleId, {}, dims);
}
/** The tail `fanTriangles` faces of the cone-fan index array ARE the per-apex fan triangles (src pushes grid
 *  quads first, then the fans) — the exact apex population, by construction. */
function fanFaceList(totalTris: number, fanTriangles: number): number[] {
  const start = totalTris - fanTriangles;
  const out: number[] = [];
  for (let f = start; f < totalTris; f++) out.push(f);
  return out;
}
/** Faces whose centroid t is within bandT of a crest row (registry-comparable apex-band). */
function crestBandFaceList(xyz: Float32Array, idx: Uint32Array, bandT: number): number[] {
  const out: number[] = []; const nF = idx.length / 3;
  for (let f = 0; f < nF; f++) {
    const zc = (xyz[3 * idx[3 * f] + 2] + xyz[3 * idx[3 * f + 1] + 2] + xyz[3 * idx[3 * f + 2] + 2]) / 3;
    if (dtToCrest(zc / H) < bandT) out.push(f);
  }
  return out;
}

const SAG_BARY: ReadonlyArray<readonly [number, number, number]> = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];

interface SubsetResult { gnMax: number; globalMax: number; vertexMax: number; worstFace: number; perFaceGn: Map<number, number>; }
/**
 * True-3D perpendicular over a face subset, with BOTH the single-seed GN projector (projectPointToRadialSurface,
 * what perFaceTrue3DSag uses) AND the globally-correct grid projector (buildRadialSurfaceProjector, what
 * measureProjectorMax uses). `emitted` = the actual f32 wall.vertices (placement-honest, incl. apex-placement
 * bug); omit it to RE-LIFT vertices from (u,t) via rA (registry-faithful, vertices exactly on the surface).
 */
function subsetTrue3D(
  ut: number[], idx: Uint32Array, faces: number[], rA: AnalyticRadiusFn, projGlobal: RadialSurfaceProjector,
  emitted?: Float32Array,
): SubsetResult {
  const relift = (i: number): [number, number, number] => { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const pos = (i: number): [number, number, number] => emitted ? [emitted[3 * i], emitted[3 * i + 1], emitted[3 * i + 2]] : relift(i);
  let gnMax = 0, globalMax = 0, vertexMax = 0, worstFace = -1;
  const perFaceGn = new Map<number, number>();
  for (const f of faces) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const [ax, ay, az] = pos(a), [bx, by, bz] = pos(b), [cx, cy, cz] = pos(c);
    // placement channel (only meaningful for the emitted verts)
    for (const [px, py, pz] of [[ax, ay, az], [bx, by, bz], [cx, cy, cz]] as const) {
      const d = projGlobal.project(px, py, pz).dist; if (d > vertexMax) vertexMax = d;
    }
    let fGn = 0, fGl = 0;
    for (const [wa, wb, wc] of SAG_BARY) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const dg = projectPointToRadialSurface(px, py, pz, rA).dist; if (dg > fGn) fGn = dg;
      const dG = projGlobal.project(px, py, pz).dist; if (dG > fGl) fGl = dG;
    }
    perFaceGn.set(f, fGn);
    if (fGn > gnMax) { gnMax = fGn; worstFace = f; }
    if (fGl > globalMax) globalMax = fGl;
  }
  return { gnMax, globalMax, vertexMax, worstFace, perFaceGn };
}
/** Radial same-(u,t) chord sag over a face subset (re-lifted) — the OVERSTATING ruler, for the 1/cos cross-check. */
function subsetRadial(ut: number[], idx: Uint32Array, faces: number[], rA: AnalyticRadiusFn): number {
  const relift = (i: number): [number, number, number] => { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  let radMax = 0;
  for (const f of faces) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const [ax, ay, az] = relift(a), [bx, by, bz] = relift(b), [cx, cy, cz] = relift(c);
    let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay), ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az), nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    for (const [wa, wb, wc] of SAG_BARY) {
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const th = TAU * um, z = tm * H, r = rA(th, z);
      const d = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
      if (d > radMax) radMax = d;
    }
  }
  return radMax;
}
/** Brute gold-standard (full-azimuth grid + box-refine) on the worst-N faces by GN, re-lifted samples. */
function bruteWorst(ut: number[], idx: Uint32Array, sub: SubsetResult, rA: AnalyticRadiusFn, n: number): number {
  const relift = (i: number): [number, number, number] => { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const worst = [...sub.perFaceGn.entries()].sort((p, q) => q[1] - p[1]).slice(0, n).map((e) => e[0]);
  let bMax = 0;
  for (const f of worst) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const [ax, ay, az] = relift(a), [bx, by, bz] = relift(b), [cx, cy, cz] = relift(c);
    for (const [wa, wb, wc] of SAG_BARY) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const d = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 4096, nZ: 800 }).dist;
      if (d > bMax) bMax = d;
    }
  }
  return bMax;
}
function nmOf(xyz: Float32Array, idx: Uint32Array): number {
  return idx.length / 3 < 5_400_000 ? auditNonManByIndex(xyz, idx) : nonManRawBigStats(idx).nonMan;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('DS-TIPCONE-RULER — cross-ruler apex + density law + provenance', () => {
  // UNIT CORE: production cone-fan @nU4096, FOUR rulers on the fan faces, both dims. The decisive cross-check.
  it.skipIf(process.env.PF_DSTIP_CORE !== '1')('CORE — 4-ruler apex MAX @nU4096 (both dims)', () => {
    plog(`=== CORE => ${NDJSON} ===`);
    const nU = 4096;
    for (const [tag, dims] of [['Rt70def', DIMS_DEFAULT], ['Rt50reg', DIMS_REG]] as const) {
      const key = `CORE|${tag}|nU${nU}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const rA = rAOf(dims);
      const t0 = Date.now(); const c0 = cpuUsage();
      const w = buildDsConeFanWallGeometric(rA, H, nU);
      const buildS = (Date.now() - t0) / 1000; const cpu = cpuUsage(c0);
      const totalTris = w.indices.length / 3;
      plog(`[CORE][${tag}] tris=${totalTris} fanTris=${w.fanTriangles} apex=${w.apexCount}/128 skipped=${w.skippedApexes} build=${buildS.toFixed(2)}s`);
      const projGlobal = buildRadialSurfaceProjector(rA, { H, nTheta: 2048, nZ: 1024, seedTopK: 8, maxIter: 24 });
      const fanFaces = fanFaceList(totalTris, w.fanTriangles);
      const crestFaces = crestBandFaceList(w.vertices, w.indices, 0.6 / H);
      // FOUR rulers on the fan (apex) faces
      const reMeas = subsetTrue3D(w.ut, w.indices, fanFaces, rA, projGlobal);              // re-lifted (registry-faithful)
      const emMeas = subsetTrue3D(w.ut, w.indices, fanFaces, rA, projGlobal, w.vertices);   // emitted f32 (placement-honest)
      const radMax = subsetRadial(w.ut, w.indices, fanFaces, rA);                           // radial same-(u,t)
      const bruteMax = bruteWorst(w.ut, w.indices, reMeas, rA, 40);                          // brute gold standard
      // crest-band true-3D (registry-comparable apex band) — re-lifted single-seed
      const crestMeas = subsetTrue3D(w.ut, w.indices, crestFaces, rA, projGlobal);
      // whole-body confirm (Rt70 only, once — the heavy pass; registry-precedented)
      let wholeBodyMax = -1;
      if (tag === 'Rt70def') {
        const sag = perFaceTrue3DSag(w.ut, w.indices, rA, H, { preFilterMm: 0.006 });
        wholeBodyMax = sag.worstMm;
      }
      const nm = nmOf(w.vertices, w.indices);
      const idx2 = new Uint32Array(w.indices.length + 3); idx2.set(w.indices);
      idx2[w.indices.length] = w.indices[0]; idx2[w.indices.length + 1] = w.indices[1]; idx2[w.indices.length + 2] = w.indices[2];
      const nmCrack = idx2.length / 3 < 5_400_000 ? auditNonManByIndex(w.vertices, idx2) : nonManRawBigStats(idx2).nonMan;
      const q = triangleQualityDistribution({ vertices: w.vertices, indices: w.indices });
      const infl = reMeas.gnMax > 0 ? radMax / reMeas.gnMax : 0;
      plog(`[CORE][${tag}] FAN apex true-3D: perFaceTrue3D(reGN)=${reMeas.gnMax.toFixed(6)} globalProj(reGN)=${reMeas.globalMax.toFixed(6)} emittedGlobal=${emMeas.globalMax.toFixed(6)} vtxPlacement=${emMeas.vertexMax.toFixed(6)} BRUTE=${bruteMax.toFixed(6)} | RADIAL=${radMax.toFixed(6)} (radial/true=${infl.toFixed(2)}x)`);
      plog(`[CORE][${tag}] crestBand true-3D MAX=${crestMeas.gnMax.toFixed(6)} | wholeBodyMax=${wholeBodyMax.toFixed(6)} | nonMan=${nm} crack=${nmCrack} | %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(3)}`);
      checkpoint({
        key, tag, nU, tris: totalTris, fanTris: w.fanTriangles, apex: w.apexCount, skipped: w.skippedApexes,
        buildS: +buildS.toFixed(2), cpuS: +((cpu.user + cpu.system) / 1e6).toFixed(2),
        fanReGnMax: +reMeas.gnMax.toFixed(6), fanReGlobalMax: +reMeas.globalMax.toFixed(6),
        fanEmittedGlobalMax: +emMeas.globalMax.toFixed(6), fanVtxPlacementMax: +emMeas.vertexMax.toFixed(6),
        fanBruteMax: +bruteMax.toFixed(6), fanRadialMax: +radMax.toFixed(6), radialOverTrue: +infl.toFixed(2),
        crestBandMax: +crestMeas.gnMax.toFixed(6), wholeBodyMax: +wholeBodyMax.toFixed(6),
        nonMan: nm, crackNonMan: nmCrack, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(3),
        apexClosed: reMeas.gnMax <= TOL && emMeas.globalMax <= TOL && bruteMax <= TOL,
      });
    }
    plog('[CORE] DONE');
  }, 60 * 60 * 1000);

  // UNIT SWEEP: density law — nU {1024,2048,4096,8192}, fan-apex true-3D MAX + tris ⇒ C/√tris (floor-vs-converge).
  it.skipIf(process.env.PF_DSTIP_SWEEP !== '1')('SWEEP — apex MAX vs nU (1/√tris law)', () => {
    plog(`=== SWEEP => ${NDJSON} ===`);
    const rA = rAOf(DIMS_DEFAULT);
    const projGlobal = buildRadialSurfaceProjector(rA, { H, nTheta: 2048, nZ: 1024, seedTopK: 8, maxIter: 24 });
    for (const nU of [1024, 2048, 4096, 8192]) {
      const key = `SWEEP|Rt70|nU${nU}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const t0 = Date.now();
      const w = buildDsConeFanWallGeometric(rA, H, nU);
      const buildS = (Date.now() - t0) / 1000;
      const totalTris = w.indices.length / 3;
      const fanFaces = fanFaceList(totalTris, w.fanTriangles);
      const m = subsetTrue3D(w.ut, w.indices, fanFaces, rA, projGlobal);
      const law = m.gnMax * Math.sqrt(totalTris);
      plog(`[SWEEP] nU=${nU} tris=${totalTris} apex(reGN)=${m.gnMax.toFixed(6)} apex(global)=${m.globalMax.toFixed(6)} sag*sqrt(tris)=${law.toFixed(2)} build=${buildS.toFixed(2)}s`);
      checkpoint({ key, nU, tris: totalTris, apexGnMax: +m.gnMax.toFixed(6), apexGlobalMax: +m.globalMax.toFixed(6), sagTimesSqrtTris: +law.toFixed(2), buildS: +buildS.toFixed(2) });
    }
    // fan-depth lever @nU4096: a deeper geometric-graded fan (rings nearer the apex) should shrink the apex further.
    const key2 = 'SWEEP|Rt70|nU4096|deepFan';
    if (!keyExists(key2)) {
      const nU = 4096;
      const w = buildDsConeFanWallGeometric(rA, H, nU, { fanFrac: [0.02, 0.05, 0.1, 0.2, 0.35, 0.6], patchP: 3 });
      const totalTris = w.indices.length / 3;
      const fanFaces = fanFaceList(totalTris, w.fanTriangles);
      const m = subsetTrue3D(w.ut, w.indices, fanFaces, rA, projGlobal);
      plog(`[SWEEP] nU4096 DEEP-FAN(6 rings) tris=${totalTris} apex(reGN)=${m.gnMax.toFixed(6)} apex(global)=${m.globalMax.toFixed(6)}`);
      checkpoint({ key: key2, nU, tris: totalTris, fanRings: 6, apexGnMax: +m.gnMax.toFixed(6), apexGlobalMax: +m.globalMax.toFixed(6) });
    }
    plog('[SWEEP] DONE');
  }, 60 * 60 * 1000);

  // UNIT PROV: where does 0.096 come from? (a) FAN-OFF ring-strip apex; (b) full measureProjectorMax with/without
  // tread-aware on cone-fan vs no-fan. nU2048 for tractability of the async whole-mesh ruler.
  it.skipIf(process.env.PF_DSTIP_PROV !== '1')('PROV — 0.096 provenance (fan-off + measureProjectorMax)', async () => {
    plog(`=== PROV => ${NDJSON} ===`);
    const key = 'PROV|Rt70|nU2048';
    if (keyExists(key)) { plog(`[skip] ${key}`); plog('[PROV] DONE'); return; }
    const nU = 2048;
    const rA = rAOf(DIMS_DEFAULT);
    const projGlobal = buildRadialSurfaceProjector(rA, { H, nTheta: 2048, nZ: 1024, seedTopK: 8, maxIter: 24 });
    // (a) FAN-OFF ring-strip — no apex vertex ⇒ the tip cone is chorded (the "concession" reading).
    const noFan = buildDsRingStripWallGeometric(rA, H, nU);
    const noFanCrest = crestBandFaceList(noFan.vertices, noFan.indices, 0.6 / H);
    const noFanMeas = subsetTrue3D(noFan.ut, noFan.indices, noFanCrest, rA, projGlobal);
    const noFanBrute = bruteWorst(noFan.ut, noFan.indices, noFanMeas, rA, 40);
    plog(`[PROV] FAN-OFF ring-strip nU${nU} tris=${noFan.indices.length / 3}: crest-band true-3D reGN=${noFanMeas.gnMax.toFixed(6)} global=${noFanMeas.globalMax.toFixed(6)} brute=${noFanBrute.toFixed(6)}`);
    // (b) full measureProjectorMax on cone-fan vs no-fan, WITH and WITHOUT tread-aware (reproduce the headline).
    const cf = buildDsConeFanWallGeometric(rA, H, nU);
    const cfMesh = { vertices: cf.vertices, indices: cf.indices };
    const nfMesh = { vertices: noFan.vertices, indices: noFan.indices };
    const cfPlain = await measureProjectorMax(cfMesh, rA, { H, tolMm: TOL });
    const cfTread = await measureProjectorMax(cfMesh, rA, { H, tolMm: TOL, treadRadiusSpreadMm: 0.5 });
    const nfPlain = await measureProjectorMax(nfMesh, rA, { H, tolMm: TOL });
    const nfTread = await measureProjectorMax(nfMesh, rA, { H, tolMm: TOL, treadRadiusSpreadMm: 0.5 });
    plog(`[PROV] measureProjectorMax CONE-FAN: plain max=${cfPlain.maxMm.toFixed(6)} (vtx=${cfPlain.vertexMaxMm.toFixed(6)} chord=${cfPlain.chordMaxMm.toFixed(6)}) | tread-aware smoothMax=${cfTread.smoothMaxMm.toFixed(6)} treadChord=${cfTread.treadChordMaxMm.toFixed(6)} treadFaces=${cfTread.treadFaceCount}`);
    plog(`[PROV] measureProjectorMax RING-STRIP(no fan): plain max=${nfPlain.maxMm.toFixed(6)} | tread-aware smoothMax=${nfTread.smoothMaxMm.toFixed(6)} treadChord=${nfTread.treadChordMaxMm.toFixed(6)}`);
    checkpoint({
      key, nU,
      noFanCrestReGn: +noFanMeas.gnMax.toFixed(6), noFanCrestGlobal: +noFanMeas.globalMax.toFixed(6), noFanBrute: +noFanBrute.toFixed(6),
      cfPlainMax: +cfPlain.maxMm.toFixed(6), cfChordMax: +cfPlain.chordMaxMm.toFixed(6), cfVtxMax: +cfPlain.vertexMaxMm.toFixed(6),
      cfTreadSmoothMax: +cfTread.smoothMaxMm.toFixed(6), cfTreadChordMax: +cfTread.treadChordMaxMm.toFixed(6), cfTreadFaces: cfTread.treadFaceCount,
      nfPlainMax: +nfPlain.maxMm.toFixed(6), nfTreadSmoothMax: +nfTread.smoothMaxMm.toFixed(6), nfTreadChordMax: +nfTread.treadChordMaxMm.toFixed(6),
    });
    plog('[PROV] DONE');
  }, 60 * 60 * 1000);
});
