// _dsRingStripsAdversarial.test.ts — ADVERSARIAL VERIFICATION of E-2026-07-19-DS-CONVERGE-A.
//
// THE CLAIM UNDER TEST (af1544d0 / fc73fa76): the DragonScales structured ring-strip mesh (src
// tierC/dsRingStrips.ts, flag __pfDsRingStrips, nU=2048 L2 arm) is FAITHFUL to <=0.01mm true-3D on the interior
// rings. The certified V11g composite ruler READS 0.0133 (>0.01), but the agent claims that 0.0133 is the RULER's
// OWN near-ring tessellation FLOOR (sheet-twin near-ring cell ~0.039mm >> wallEps 0.0005mm => shoulder facets in the
// [0.0005,0.039]mm gap scored against the twin's own C0 chord ~0.013), NOT mesh error. Backed by an analytic witness
// reading MAX 0.0026 / p99 0.0012.
//
// MY JOB: REFUTE it. Default to "there IS a real mesh residual" unless the evidence decisively shows otherwise.
// READ-ONLY on production + on the certified ruler lib (_ds_prodtruth_lib reused verbatim). NEW probe file only.
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE running):
//   A. RULER-REFINE (the decisive one). Re-score the SAME flag-on mesh against composites whose near-ring sheet-twin
//      is progressively refined (near-ring cell 0.039 -> 0.0025mm). RULER-FLOOR CONFIRMED iff the ring composite MAX
//      DROPS below 0.01 as the twin refines (proves the 0.0133 was the twin cell, not the mesh). REFUTED iff it STAYS
//      >=0.01 with a fine twin (a real mesh residual the coarse ruler happened to also read).
//   B. INDEPENDENT ANALYTIC (no twin/BVH in the truth path — raw closed form). Score the flag-on mesh vs exact
//      analytic rA both directions: (fwd) worst near-tread facets' true perpendicular 3D distance
//      (projectPointToRadialSurface, brute-cross-checked); (rev) dense true-surface samples -> nearest mesh
//      (coverage), incl the double-valued tread SHELF, the shoulder, the u-seam. CONFIRMED iff analytic MAX <=0.01
//      (agreeing with the 0.0026 witness); REFUTED iff any true-3D residual >0.01 (name the ring/location).
//   C. WATERTIGHT independently (auditNonManByIndex 3D-weld + prod auditWatertight by-index + a NON-VACUOUS crack
//      control). CONFIRMED iff nonMan 0 and the injected crack moves the count.
//
// FINAL VERDICT = ruler-floor CONFIRMED only if A drops <0.01 AND B analytic MAX <=0.01 AND C watertight. Otherwise
// REFUTED with the deciding number + residual mechanism.
//
// DEV-ONLY; research/ only. Every unit is env-gated + checkpointed => a killed run resumes by re-running the unit.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  triangleQualityDistribution, auditNonManByIndex, projectPointToRadialSurface, bruteNearestOnRadialSurface,
} from './labkit';
import {
  buildConformRuler, dragonRings, classifyRingBand, dsRadiusFn, DENSE, H as DS_H, TOL,
  RAD_TWIN, RAD_CELL, WALLEPS, WALL_NTHETA, WALL_CELL, buildArtifactLocator, oneSidedRA, wallCoverage,
} from './_ds_prodtruth_lib';
import { buildRefLocator, type RefMesh, type RefLocator } from './_sharp3dRef';
import { buildWallOnlyReference, compositeLocator } from './_ds_conformRef';
import { buildDsRingStripWall, buildDsRingTSchedule } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { auditWatertight, type Mesh3 } from '../../src/fidelity/bandRemesh/audit';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const OUT_DIR = join('research', 'exchange', '_dsRingStripsAdv');
const REFINE = join(OUT_DIR, 'refine.ndjson');
const ANALYTIC = join(OUT_DIR, 'analytic.ndjson');
const WT = join(OUT_DIR, 'watertight.ndjson');

// The EXACT registry L2 arm (E-2026-07-19-DS-CONVERGE-A, the arm reading 0.0133).
const L2_NU = 2048;
const L2_SCHED = { treadHalfMm: 0.005, flankReachMm: 1.3, flankRows: 30, flankGrade: 1.25, bodyStepMm: 0.2 };
const TREAD_HALF_MM = 0.005;
const NEAR_DZ_CAP = 0.05; // ring-band facets with |dz to nearest ring| < this carry the whole 0.0133 (flank>0.012 is 0.0056 @L2).

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function keyExists(file: string, k: string): boolean {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}
function append(file: string, row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(file, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`);
}

interface BuiltMesh { rA: AnalyticRadiusFn; xyz: Float32Array; idx: Uint32Array; ut: number[]; tris: number; bottomRing: number[]; topRing: number[]; rows: number; }
function buildMesh(nU = L2_NU): BuiltMesh {
  const rA = dsRadiusFn();
  const tRows = buildDsRingTSchedule(DS_H, L2_SCHED);
  const wall = buildDsRingStripWall(rA, DS_H, nU, tRows);
  return { rA, xyz: wall.vertices, idx: wall.indices, ut: wall.ut, tris: wall.indices.length / 3, bottomRing: wall.bottomRing, topRing: wall.topRing, rows: tRows.length };
}

/** |dz| of facet f's centroid to the nearest interior ring z. */
function dzOf(xyz: Float32Array, idx: Uint32Array, f: number, ringZs: number[]): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
  const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
  let bd = 1e9; for (const rz of ringZs) { const d = Math.abs(zc - rz); if (d < bd) bd = d; } return bd;
}
/** nearest ring z of a facet centroid. */
function nearRingZ(xyz: Float32Array, idx: Uint32Array, f: number, ringZs: number[]): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
  const zc = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
  let bz = 0, bd = 1e9; for (const rz of ringZs) { const d = Math.abs(zc - rz); if (d < bd) { bd = d; bz = rz; } } return bz;
}
/** all 3 verts strictly one side of the nearest ring z (continuous facet, no C0 crossing). */
function isSameSide(xyz: Float32Array, idx: Uint32Array, f: number, ringZs: number[]): boolean {
  const rz = nearRingZ(xyz, idx, f, ringZs);
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
  const za = xyz[3 * a + 2] - rz, zb = xyz[3 * b + 2] - rz, zc = xyz[3 * c + 2] - rz;
  return (za > 0 && zb > 0 && zc > 0) || (za < 0 && zb < 0 && zc < 0);
}
/** composite ruler distance of facet f (max over DENSE 45-pt bary lattice). */
function compMax(xyz: Float32Array, idx: Uint32Array, f: number, loc: RefLocator): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; let d = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
    const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
    const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
    const dd = loc.dist(px, py, pz); if (dd > d) d = dd;
  }
  return d;
}
/** true perpendicular 3D distance of facet f to the exact analytic surface (GN foot, no twin) — max over DENSE. */
function analTrue3D(xyz: Float32Array, idx: Uint32Array, f: number, rA: AnalyticRadiusFn): number {
  const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; let d = 0;
  for (const [wa, wb, wc] of DENSE) {
    const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
    const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
    const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
    const dd = projectPointToRadialSurface(px, py, pz, rA).dist; if (dd > d) d = dd;
  }
  return d;
}

/**
 * A radial twin with GRADED z-rows: uniform `bodyCell` everywhere, refined to `nearCell` within `nearBand` of each
 * ring z_k (so the straddle cell across the C0 jump shrinks to `nearCell`). Same periodic-theta triangulation as
 * buildRadialTwin; only the z-row schedule differs. This is the ruler-refine lever: as nearCell -> 0 the sheet-twin
 * represents the near-vertical jump faithfully, so a genuine ruler-floor reading MUST drop while a real mesh residual
 * MUST persist.
 */
function buildGradedRadialTwin(
  rA: AnalyticRadiusFn, H: number, nTheta: number, ringZs: number[],
  o: { bodyCell: number; nearCell: number; nearBand: number },
): RefMesh {
  const rows: number[] = [];
  const nBody = Math.max(1, Math.ceil(H / o.bodyCell));
  for (let i = 0; i <= nBody; i++) rows.push((i / nBody) * H);
  for (const zk of ringZs) {
    const nNear = Math.max(2, Math.ceil((2 * o.nearBand) / o.nearCell));
    for (let i = 0; i <= nNear; i++) { const z = zk - o.nearBand + (i / nNear) * 2 * o.nearBand; if (z >= 0 && z <= H) rows.push(z); }
  }
  rows.sort((a, b) => a - b);
  const uz: number[] = [];
  for (const z of rows) { if (uz.length === 0 || z - uz[uz.length - 1] > 1e-7) uz.push(z); }
  const nRow = uz.length;
  const xyz = new Float64Array(nTheta * nRow * 3);
  for (let iz = 0; iz < nRow; iz++) {
    const z = uz[iz];
    for (let it = 0; it < nTheta; it++) {
      const th = (it / nTheta) * TAU; const r = rA(th, z); const off = (iz * nTheta + it) * 3;
      xyz[off] = r * Math.cos(th); xyz[off + 1] = r * Math.sin(th); xyz[off + 2] = z;
    }
  }
  const nF = (nRow - 1) * nTheta * 2;
  const idx = new Uint32Array(nF * 3);
  let k = 0;
  for (let iz = 0; iz < nRow - 1; iz++) {
    for (let it = 0; it < nTheta; it++) {
      const itn = (it + 1) % nTheta;
      const v00 = iz * nTheta + it, v01 = iz * nTheta + itn, v10 = (iz + 1) * nTheta + it, v11 = (iz + 1) * nTheta + itn;
      idx[k++] = v00; idx[k++] = v10; idx[k++] = v11;
      idx[k++] = v00; idx[k++] = v11; idx[k++] = v01;
    }
  }
  return { xyz, idx, nV: nTheta * nRow, nF };
}

/** Twin fidelity on the SMOOTH flank (away from any ring by >gap): half-cell offset samples -> twin dist (should be ~0).
 * Skips the near-jump band where a single-valued twin legitimately cannot represent the C0 (that is not a twin fault). */
function twinFlankResidual(loc: RefLocator, rA: AnalyticRadiusFn, H: number, ringZs: number[], gap: number): number {
  let mx = 0;
  for (let j = 0; j < 4000; j++) {
    const z = (j / 4000) * H;
    let nearRing = false; for (const rz of ringZs) if (Math.abs(z - rz) < gap) { nearRing = true; break; }
    if (nearRing) continue;
    const th = ((j * 73) % 1024) / 1024 * TAU;
    const r = rA(th, z);
    const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
    if (d > mx) mx = d;
  }
  return +mx.toFixed(6);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
describe('DS RING STRIPS — ADVERSARIAL verification of the CONVERGE-A ruler-floor claim', () => {
  // UNIT A (DECISIVE): RULER-REFINE. Re-score the SAME flag-on mesh vs progressively finer near-ring twins.
  // SELECTION (corrected): the 0.0133 lives on SAME-SIDE shoulder facets that sit ON the continuous surface (so their
  // radial bound is ~0) but read high against the twin's straddle-CHORD across the C0 jump — i.e. composite >> radial
  // there, so a radial selector is USELESS (it ranks the crossing tread quads first). We therefore score the same-side
  // shoulder facets DIRECTLY (dz<0.05, all same-side, column-strided for tractability — the floor is ~uniform in u),
  // plus ALL crossing tread quads separately. Reproduce the certified 0.0133, then watch it under twin refinement.
  it.skipIf(process.env.PF_DSADV_REFINE !== '1')('A REFINE — ring composite MAX vs near-ring twin cell', () => {
    plog(`=== A REFINE nU=${L2_NU} => ${REFINE} ===`);
    const m = buildMesh(L2_NU);
    plog(`[A] mesh tris=${m.tris} verts=${m.xyz.length / 3} rows=${m.rows}`);
    const ringZs = dragonRings().map((r) => r.z);
    const cls = classifyRingBand(m.xyz, m.idx, ringZs, 1.0);
    // same-side shoulder facets (dz<0.05, continuous — carry the 0.0133 floor) + crossing tread quads (dz<0.012, span C0).
    const shoulderAll: number[] = [];
    const crossingAll: number[] = [];
    for (let f = 0; f < m.tris; f++) {
      if (cls(f) !== 'ringBand') continue;
      const dz = dzOf(m.xyz, m.idx, f, ringZs);
      if (dz < 0.012 && !isSameSide(m.xyz, m.idx, f, ringZs)) { crossingAll.push(f); continue; }
      if (dz < NEAR_DZ_CAP && isSameSide(m.xyz, m.idx, f, ringZs)) shoulderAll.push(f);
    }
    // The near-ring twin query is O(twin tris) (fine straddle region packs many thin tris) so each fine-twin query is
    // ~100-400us; scoring 250k facets x45 vs an 18M twin is hours. The 0.0133 floor is ~uniform in u => a uniform
    // subsample (SCORE_CAP, all 7 rings, every dz-row) captures the MAX to a few %. The EXACT twin-free worst is
    // pinned separately by Unit B (projectPointToRadialSurface). Raise PF_DSADV_CAP to tighten.
    const SCORE_CAP = process.env.PF_DSADV_CAP ? parseInt(process.env.PF_DSADV_CAP, 10) : 6000;
    const capSub = (arr: number[], n: number): number[] => { if (arr.length <= n) return arr; const s = Math.ceil(arr.length / n); const o: number[] = []; for (let i = 0; i < arr.length; i += s) o.push(arr[i]); return o; };
    const shoulder = capSub(shoulderAll, SCORE_CAP);
    const crossing = capSub(crossingAll, SCORE_CAP);
    plog(`[A] same-side shoulder dz<${NEAR_DZ_CAP}: ${shoulderAll.length} (scoring ${shoulder.length}); crossing tread quads: ${crossingAll.length} (scoring ${crossing.length})`);

    const scoreList = (facets: number[], loc: RefLocator, tag: string): { max: number; p99: number; out: number; worst: { d: number; u: number; t: number; dz: number } } => {
      let worst = 0, wf = facets[0] ?? 0; const devs = new Float64Array(facets.length);
      for (let i = 0; i < facets.length; i++) { const d = compMax(m.xyz, m.idx, facets[i], loc); devs[i] = d; if (d > worst) { worst = d; wf = facets[i]; } }
      const s = devs.slice().sort();
      let out = 0; for (const d of devs) if (d > TOL) out++;
      const a = m.idx[3 * wf]; const u = m.ut[2 * a], t = m.ut[2 * a + 1];
      const p99 = s.length ? s[Math.floor(0.99 * s.length)] : 0;
      plog(`[A][${tag}] MAX=${worst.toFixed(6)} p99=${p99.toFixed(6)} out>${TOL}=${out}/${facets.length} worst@u=${u.toFixed(4)} t=${t.toFixed(5)} dz=${dzOf(m.xyz, m.idx, wf, ringZs).toFixed(5)}`);
      return { max: +worst.toFixed(6), p99: +p99.toFixed(6), out, worst: { d: +worst.toFixed(6), u: +u.toFixed(4), t: +t.toFixed(5), dz: +dzOf(m.xyz, m.idx, wf, ringZs).toFixed(5) } };
    };

    // (0) EXACT certified V11g composite ruler — must reproduce ~0.0133 on the shoulder (anchors the harness).
    if (!keyExists(REFINE, 'A|exactV11g')) {
      const exact = buildConformRuler(m.rA);
      const rs = scoreList(shoulder, exact, 'exactV11g/shoulder');
      const rc = scoreList(crossing, exact, 'exactV11g/crossing');
      append(REFINE, { key: 'A|exactV11g', nearCell: +(DS_H / RAD_TWIN.nZ).toFixed(5), twinTris: 2 * RAD_TWIN.nTheta * RAD_TWIN.nZ, shoulderMax: rs.max, shoulderP99: rs.p99, shoulderOut: rs.out, shoulderWorst: rs.worst, crossingMax: rc.max, crossingOut: rc.out });
    }

    // (1) refine ladder: graded near-ring twin, near cell shrinking; coarse body (only near-ring facets scored).
    const dr = dragonRings();
    const wallRef = buildWallOnlyReference(m.rA, dr, WALL_NTHETA, WALLEPS);
    const wallLoc = buildRefLocator(wallRef, WALL_CELL);
    const ladder = [0.039, 0.02, 0.01, 0.005, 0.0025];
    for (const nc of ladder) {
      const key = `A|nearCell${nc}`;
      if (keyExists(REFINE, key)) { plog(`[skip] ${key}`); continue; }
      const twin = buildGradedRadialTwin(m.rA, DS_H, RAD_TWIN.nTheta, ringZs, { bodyCell: 1.5, nearCell: nc, nearBand: 0.25 });
      const sheetLoc = buildRefLocator(twin, RAD_CELL);
      const flankRes = twinFlankResidual(sheetLoc, m.rA, DS_H, ringZs, 3 * nc);
      const comp = compositeLocator(sheetLoc, wallLoc, ringZs);
      const rs = scoreList(shoulder, comp, `nearCell${nc}/shoulder`);
      const rc = scoreList(crossing, comp, `nearCell${nc}/crossing`);
      append(REFINE, { key, nearCell: nc, twinTris: twin.nF, twinFlankResidual: flankRes, shoulderMax: rs.max, shoulderP99: rs.p99, shoulderOut: rs.out, shoulderWorst: rs.worst, crossingMax: rc.max, crossingOut: rc.out });
    }

    plog('[A] DONE');
  }, 180 * 60 * 1000);

  // UNIT B: INDEPENDENT ANALYTIC re-score (no twin/BVH in the truth path).
  it.skipIf(process.env.PF_DSADV_ANALYTIC !== '1')('B ANALYTIC — flag-on mesh vs EXACT rA (fwd true-3D + rev coverage + tread lips)', () => {
    plog(`=== B ANALYTIC nU=${L2_NU} => ${ANALYTIC} ===`);
    const m = buildMesh(L2_NU);
    const rA = m.rA;
    const dr = dragonRings();
    const ringZs = dr.map((r) => r.z);
    const cls = classifyRingBand(m.xyz, m.idx, ringZs, 1.0);

    // ---- B1 fwd: near-tread SAME-SIDE facets' TRUE perpendicular 3D distance (GN, NO twin), brute cross-checked. ----
    // No composite pre-selection (that needs the 12.6M twin). We score the TRUE analytic distance directly on ALL
    // same-side near-tread facets (dz<0.05), capped by a uniform subsample for tractability, and take the MAX — the
    // honest "is every near-tread facet faithful to the exact surface" number. Brute-cross-check the worst-30.
    if (!keyExists(ANALYTIC, 'B1|fwdWorstTrue3D')) {
      const cand: number[] = [];
      for (let f = 0; f < m.tris; f++) {
        if (cls(f) !== 'ringBand') continue;
        if (dzOf(m.xyz, m.idx, f, ringZs) >= NEAR_DZ_CAP) continue;
        if (!isSameSide(m.xyz, m.idx, f, ringZs)) continue;
        cand.push(f);
      }
      const CAP = process.env.PF_DSADV_B1CAP ? parseInt(process.env.PF_DSADV_B1CAP, 10) : 20000;
      const step = cand.length > CAP ? Math.ceil(cand.length / CAP) : 1;
      const sub: number[] = []; for (let i = 0; i < cand.length; i += step) sub.push(cand[i]);
      let trueMax = 0, wf = sub[0]; const trues = new Float64Array(sub.length);
      for (let i = 0; i < sub.length; i++) { const d = analTrue3D(m.xyz, m.idx, sub[i], rA); trues[i] = d; if (d > trueMax) { trueMax = d; wf = sub[i]; } }
      // adversarial brute cross-check on the worst-30 GN facets (GN can stall; brute = full-azimuth closed form).
      const byTrue = sub.map((f, i) => ({ f, d: trues[i] })).sort((x, y) => y.d - x.d).slice(0, 30);
      let bruteMax = 0, gnBruteMaxDelta = 0;
      for (const o of byTrue) {
        const a = m.idx[3 * o.f], b = m.idx[3 * o.f + 1], c = m.idx[3 * o.f + 2];
        for (const [wa, wb, wc] of DENSE) {
          const px = wa * m.xyz[3 * a] + wb * m.xyz[3 * b] + wc * m.xyz[3 * c];
          const py = wa * m.xyz[3 * a + 1] + wb * m.xyz[3 * b + 1] + wc * m.xyz[3 * c + 1];
          const pz = wa * m.xyz[3 * a + 2] + wb * m.xyz[3 * b + 2] + wc * m.xyz[3 * c + 2];
          const bd = bruteNearestOnRadialSurface(px, py, pz, rA, DS_H, { nTheta: 2048, nZ: 300, zBandMm: 2.5, refineIters: 60 }).dist;
          const gd = projectPointToRadialSurface(px, py, pz, rA).dist;
          if (bd > bruteMax) bruteMax = bd;
          if (Math.abs(bd - gd) > gnBruteMaxDelta) gnBruteMaxDelta = Math.abs(bd - gd);
        }
      }
      const s = trues.slice().sort();
      const a = m.idx[3 * wf]; const u = m.ut[2 * a], t = m.ut[2 * a + 1];
      plog(`[B1] near-tread SAME-SIDE ${cand.length} (scored ${sub.length}): GN true-3D MAX=${trueMax.toFixed(6)} p99=${s[Math.floor(0.99 * s.length)].toFixed(6)} worst@u=${u.toFixed(4)} t=${t.toFixed(5)} dz=${dzOf(m.xyz, m.idx, wf, ringZs).toFixed(5)}`);
      plog(`[B1] BRUTE cross-check (worst-30): brute true-3D MAX=${bruteMax.toFixed(6)} maxGNvsBruteDelta=${gnBruteMaxDelta.toFixed(6)}`);
      append(ANALYTIC, { key: 'B1|fwdWorstTrue3D', candidates: cand.length, scored: sub.length, gnTrueMax: +trueMax.toFixed(6), gnTrueP99: +s[Math.floor(0.99 * s.length)].toFixed(6), bruteTrueMax: +bruteMax.toFixed(6), maxGNvsBruteDelta: +gnBruteMaxDelta.toFixed(6), worst: { u: +u.toFixed(4), t: +t.toFixed(5), dz: +dzOf(m.xyz, m.idx, wf, ringZs).toFixed(5) } });
    }

    // ---- B2 rev: dense TRUE-surface coverage -> nearest mesh (catches under-coverage the fwd sag misses). ----
    if (!keyExists(ANALYTIC, 'B2|revCoverage')) {
      const loc = buildArtifactLocator(m.xyz, m.idx);
      const rAos = oneSidedRA(rA, ringZs, 1e-4);
      // (a) global body coverage: uniform (u,t), one-sided radii near rings.
      const nU = 1024, nT = 2400; // dz ~ 0.05mm
      let gMax = 0, gU = 0, gT = 0, gOut = 0;
      for (let j = 0; j < nT; j++) {
        const z = (j / (nT - 1)) * DS_H;
        for (let i = 0; i < nU; i++) {
          const th = (i / nU) * TAU; const r = rAos(th, z);
          const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
          if (d > TOL) gOut++;
          if (d > gMax) { gMax = d; gU = i / nU; gT = z / DS_H; }
        }
      }
      plog(`[B2a] GLOBAL body coverage: true-surface->mesh MAX=${gMax.toFixed(6)} out>${TOL}=${gOut}/${nU * nT} worst@u=${gU.toFixed(4)} t=${gT.toFixed(5)}`);
      // (b) near-ring dense coverage: fine z near each ring (the shoulder), one-sided.
      let nMax = 0, nU2 = 0, nT2 = 0, nOut = 0, nSamp = 0;
      const nThN = 1024, band = 1.3, dzc = 0.0025;
      for (const zk of ringZs) {
        const rows = Math.ceil((2 * band) / dzc);
        for (let jr = 0; jr <= rows; jr++) {
          const z = zk - band + (jr / rows) * 2 * band; if (z < 0 || z > DS_H) continue;
          for (let it = 0; it < nThN; it++) {
            const th = (it / nThN) * TAU; const r = rAos(th, z);
            const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z); nSamp++;
            if (d > TOL) nOut++;
            if (d > nMax) { nMax = d; nU2 = it / nThN; nT2 = z / DS_H; }
          }
        }
      }
      plog(`[B2b] NEAR-RING dense coverage: true-surface->mesh MAX=${nMax.toFixed(6)} out>${TOL}=${nOut}/${nSamp} worst@u=${nU2.toFixed(4)} t=${nT2.toFixed(5)}`);
      // (c) the double-valued tread SHELF: interpolate r-(one-sided) -> r+(one-sided) at z_k -> nearest mesh.
      //     wallEps=1e-4 => the TRUE shelf endpoints (tighter than the mesh's 0.005 lips: does the mesh reach z_k?).
      const shelf = wallCoverage(loc, rA, dr, 1e-4, 2048, 64);
      plog(`[B2c] TREAD SHELF coverage (true z_k shelf -> mesh): MAX=${shelf.max.toFixed(6)} p99=${shelf.p99.toFixed(6)} out>${TOL}=${shelf.over}/${shelf.n}`);
      // (d) u-seam: dense true-surface strip straddling u=0 -> nearest mesh.
      let sMax = 0, sT = 0;
      for (let j = 0; j <= 4000; j++) {
        const z = (j / 4000) * DS_H;
        for (const uu of [-0.0007, -0.0003, 0, 0.0003, 0.0007]) {
          const th = ((uu % 1) + 1) % 1 * TAU; const r = rAos(th, z);
          const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
          if (d > sMax) { sMax = d; sT = z / DS_H; }
        }
      }
      plog(`[B2d] U-SEAM coverage (near u=0): MAX=${sMax.toFixed(6)} worst@t=${sT.toFixed(5)}`);
      append(ANALYTIC, {
        key: 'B2|revCoverage',
        globalBodyMax: +gMax.toFixed(6), globalBodyOut: gOut, globalWorst: { u: +gU.toFixed(4), t: +gT.toFixed(5) },
        nearRingMax: +nMax.toFixed(6), nearRingOut: nOut, nearRingSamp: nSamp, nearRingWorst: { u: +nU2.toFixed(4), t: +nT2.toFixed(5) },
        treadShelfMax: +shelf.max.toFixed(6), treadShelfP99: +shelf.p99.toFixed(6), treadShelfOut: shelf.over,
        uSeamMax: +sMax.toFixed(6),
      });
    }

    // ---- B3: tread-LIP exactness — are the mesh's one-sided lip radii the TRUE one-sided limits? ----
    if (!keyExists(ANALYTIC, 'B3|treadLipRadii')) {
      let loMax = 0, hiMax = 0, loK = -1, hiK = -1;
      const LIM = 1e-7;
      for (let k = 1; k <= 7; k++) {
        const zk = (k / 8) * DS_H;
        for (let it = 0; it < 2048; it++) {
          const th = (it / 2048) * TAU;
          const lo = Math.abs(rA(th, zk - TREAD_HALF_MM) - rA(th, zk - LIM)); // mesh lower lip vs true r-
          const hi = Math.abs(rA(th, zk + TREAD_HALF_MM) - rA(th, zk + LIM)); // mesh upper lip vs true r+
          if (lo > loMax) { loMax = lo; loK = k; }
          if (hi > hiMax) { hiMax = hi; hiK = k; }
        }
      }
      plog(`[B3] tread lip radius error vs TRUE one-sided limit: lowerMax=${loMax.toFixed(6)}mm (ring k${loK}) upperMax=${hiMax.toFixed(6)}mm (ring k${hiK})`);
      append(ANALYTIC, { key: 'B3|treadLipRadii', lowerLipMaxErr: +loMax.toFixed(6), lowerRing: loK, upperLipMaxErr: +hiMax.toFixed(6), upperRing: hiK, treadHalfMm: TREAD_HALF_MM });
    }
    plog('[B] DONE');
  }, 180 * 60 * 1000);

  // UNIT C: WATERTIGHT independently + a NON-VACUOUS crack control.
  it.skipIf(process.env.PF_DSADV_WT !== '1')('C WATERTIGHT — auditNonManByIndex + prod auditWatertight + crack control', () => {
    plog(`=== C WATERTIGHT nU=${L2_NU} => ${WT} ===`);
    const m = buildMesh(L2_NU);
    // (1) independent 3D-weld by position (quantized) — the emitter welds by index; this catches position gaps too.
    const nonManByIdx = auditNonManByIndex(m.xyz, m.idx);
    // (2) production auditWatertight (by-index edge topology). Rims (t=0 / t=1) are legitimate open boundaries.
    const bvi = new Set<number>([...m.bottomRing, ...m.topRing]);
    const mesh3: Mesh3 = { positions: m.xyz, indices: m.idx };
    const prod = auditWatertight(mesh3, { boundaryVertexIndices: bvi });
    // (3) NON-VACUOUS control: detach one facet's first vertex to a fresh index (injects a crack) — the count MUST move.
    const idx2 = Uint32Array.from(m.idx);
    const xyz2 = Float32Array.from(m.xyz);
    const bumped = new Float32Array(xyz2.length + 3); bumped.set(xyz2);
    const newV = xyz2.length / 3;
    bumped[3 * newV] = xyz2[3 * idx2[0]] + 5; bumped[3 * newV + 1] = xyz2[3 * idx2[0] + 1]; bumped[3 * newV + 2] = xyz2[3 * idx2[0] + 2];
    idx2[0] = newV;
    const nonManCrack = auditNonManByIndex(bumped, idx2);
    const prodCrack = auditWatertight({ positions: bumped, indices: idx2 }, { boundaryVertexIndices: bvi });
    const q = triangleQualityDistribution({ vertices: m.xyz, indices: m.idx });
    plog(`[C] nonManByIndex=${nonManByIdx} | prod auditWatertight nonManifoldEdges=${prod.nonManifoldEdges} tJunctions=${prod.tJunctions} boundaryEdges=${prod.boundaryEdges}`);
    plog(`[C] CRACK CONTROL: nonManByIndex=${nonManCrack} (was ${nonManByIdx}); prod tJunctions=${prodCrack.tJunctions} (was ${prod.tJunctions}) — MUST differ`);
    plog(`[C] slivers: %<20deg=${q.pctBelow20.toFixed(2)} minAngle=${q.minAngleDeg.toFixed(3)}`);
    append(WT, {
      key: 'C|watertight', tris: m.tris, verts: m.xyz.length / 3,
      nonManByIndex: nonManByIdx, prodNonManifoldEdges: prod.nonManifoldEdges, prodTJunctions: prod.tJunctions, prodBoundaryEdges: prod.boundaryEdges, rimVerts: bvi.size,
      crackNonManByIndex: nonManCrack, crackProdTJunctions: prodCrack.tJunctions,
      pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3),
    });
    plog('[C] DONE');
  }, 60 * 60 * 1000);
});
