// _dsCompose.test.ts — E-2026-07-21-DS-COMPOSE. Gate the FULL DragonScales outer wall whole-MESH ≤0.01mm true-3D,
// composing the two proven mechanisms: cone-fan body (3f2b7462) + CONVERGE-A ring bands (af1544d0) + rims.
//
// THE JOINS (this round is about the JOINS, not re-measuring the closed parts):
//   #1 body↔ring-band seam: ESTABLISHED by inspection = there is NONE. buildDsConeFanWall builds its schedule from
//      buildDsRingTSchedule (tread pairs + flank ladders) ⇒ the cone-fan wall is ONE structured wall already carrying
//      the CONVERGE-A ring bands. So "compose" = confirm the ring bands survive at WHOLE-MESH scope (Phase C excluded
//      dz<1mm) inside the cone-fan wall — measured here (rev-coverage over the ring bands, fwd shoulder/flank).
//   #2 rim reconciliation: ESTABLISHED by reading WatertightAssembly.assembleWatertight — when adopting the tierC
//      outer wall it pins the INNER wall to `nRing: outer.bottomRing.length` (the emergent nU) and asserts both rims
//      match ⇒ the assembly ADAPTS to the cone-fan's nU; the memo's "follow-up" is resolved. Here we VERIFY the outer
//      wall's rims are exactly nU ascending-u (the pairing precondition) + the rims are clean (fans never touch them).
//   #3 u=0≡u=1 periodic seam at whole-mesh scope — measured (dense seam strip + by-index weld).
//
// DISCRIMINATOR (cheapest-first): score the PRODUCTION-dispatch outer wall (src buildDsConeFanWallGeometric at the
// __pfDsConeFan default nU=4096) with the adversarial-grade instruments and let the WORST facet localize the join.
//
// PRE-REGISTERED KILL-CRITERION (committed BEFORE running): CLOSED iff the assembled DS wall has whole-mesh fwd
// true-3D MAX ≤0.01 (ring-crossing tread quads scored on the double-valued wall, not the invalid single-valued rA)
// AND rev-coverage MAX ≤0.01 (0 samples >0.01 at nU1024×nT2400, one-sided near rings) AND every seam/rim ≤0.01 AND
// auditNonManByIndex 0 (non-vacuous crack) AND prod auditWatertight agrees (nonManifoldEdges 0, tJunctions 0,
// boundary = the two intended nU rims). Report build wall-clock + tris + slivers minAngle. WALL otherwise — name the
// join + mechanism.
//
// DEV-ONLY; research/ only; READ-ONLY src (the SRC buildDsConeFanWallGeometric = the production path; audit lib).
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import {
  perFaceTrue3DSag, triangleQualityDistribution, auditNonManByIndex, nonManRawBigStats,
} from './labkit';
import {
  dsRadiusFn, dragonRings, H as DS_H, TOL, buildArtifactLocator, oneSidedRA,
} from './_ds_prodtruth_lib';
import { buildDsConeFanWallGeometric, dsRingStripWallToOuterWall } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { DS_CONE_FAN_DEFAULT_NU } from '../../src/renderers/webgpu/parametric/conforming/tierC/index';
import { auditWatertight, type Mesh3 } from '../../src/fidelity/bandRemesh/audit';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const SCALE_ROWS = 8;
const OUT_DIR = join('research', 'exchange', '_dsCompose');
const NDJSON = join(OUT_DIR, 'compose.ndjson');

function plog(m: string): void { mkdirSync(OUT_DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT_DIR, 'run.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); }
function keyExists(k: string): boolean { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } }); }
function checkpoint(row: Record<string, unknown>): void { mkdirSync(OUT_DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key as string}] ${JSON.stringify(row)}`); }

function ringZsArr(): number[] { return dragonRings().map((r) => r.z); }
function dtToCrest(t: number): number { let m = 1e9; for (let k = 0; k < SCALE_ROWS; k++) { const d = Math.abs(t - (k + 0.5) / SCALE_ROWS); if (d < m) m = d; } return m; }
function centroidZ(xyz: Float32Array, idx: Uint32Array, f: number): number { return (xyz[3 * idx[3 * f] + 2] + xyz[3 * idx[3 * f + 1] + 2] + xyz[3 * idx[3 * f + 2] + 2]) / 3; }
function dzToRing(z: number, ringZs: number[]): number { let m = 1e9; for (const rz of ringZs) { const d = Math.abs(z - rz); if (d < m) m = d; } return m; }
/** facet straddles a ring z (its verts span the C0) ⇒ the double-valued tread quad; single-valued rA is invalid on it. */
function crossesRing(xyz: Float32Array, idx: Uint32Array, f: number, ringZs: number[]): boolean {
  const za = xyz[3 * idx[3 * f] + 2], zb = xyz[3 * idx[3 * f + 1] + 2], zc = xyz[3 * idx[3 * f + 2] + 2];
  const lo = Math.min(za, zb, zc), hi = Math.max(za, zb, zc);
  for (const rz of ringZs) if (rz > lo && rz < hi) return true;
  return false;
}
function bandOf(t: number, ringZs: number[]): 'ring' | 'body' { return dzToRing(t * DS_H, ringZs) <= 1.0 ? 'ring' : 'body'; }

describe('DS-COMPOSE — full DragonScales outer wall, whole-mesh ≤0.01 gate', () => {
  it.skipIf(process.env.PF_DSCOMPOSE !== '1')('whole-mesh fwd + rev + seams/rims + watertight (production dispatch)', () => {
    plog(`=== DS-COMPOSE nU=${DS_CONE_FAN_DEFAULT_NU} => ${NDJSON} ===`);
    const key = `compose|nU${DS_CONE_FAN_DEFAULT_NU}`;
    if (keyExists(key)) { plog(`[skip] ${key}`); return; }
    const rA = dsRadiusFn() as AnalyticRadiusFn;
    const ringZs = ringZsArr();
    // PRODUCTION dispatch config: the exact wall __pfDsConeFan emits (index.ts DS branch, DS_CONE_FAN_DEFAULT_NU).
    const t0 = Date.now(); const c0 = cpuUsage();
    const wall = buildDsConeFanWallGeometric(rA, DS_H, DS_CONE_FAN_DEFAULT_NU);
    const cpuD = cpuUsage(c0); const buildS = (Date.now() - t0) / 1000;
    const xyz = wall.vertices, idx = wall.indices, ut = wall.ut, tris = idx.length / 3;
    plog(`[C] tris=${tris} verts=${xyz.length / 3} rows=${wall.tRows.length} nU=${wall.nU} apexCount=${wall.apexCount} skipped=${wall.skippedApexes} build=${buildS.toFixed(2)}s cpu=${(cpuD.user + cpuD.system) / 1e6}s`);

    // ── FWD whole-mesh: perFaceTrue3DSag; ring-CROSSING tread quads are the double-valued wall (single-valued rA
    //    invalid) ⇒ report the worst SAME-SIDE (continuous) facet whole-mesh + per band; count crossings separately.
    const sag = perFaceTrue3DSag(ut, idx, rA, DS_H, { preFilterMm: 0.005 });
    let fwdMax = 0, fwdT = 0, fwdRingMax = 0, fwdBodyMax = 0, fwdOut = 0, crossings = 0, crossMax = 0;
    for (let f = 0; f < tris; f++) {
      if (crossesRing(xyz, idx, f, ringZs)) { crossings++; if (sag.faceErr[f] > crossMax) crossMax = sag.faceErr[f]; continue; }
      const t = centroidZ(xyz, idx, f) / DS_H; const e = sag.faceErr[f];
      if (e > fwdMax) { fwdMax = e; fwdT = t; }
      if (e > TOL) fwdOut++;
      if (bandOf(t, ringZs) === 'ring') { if (e > fwdRingMax) fwdRingMax = e; } else if (e > fwdBodyMax) fwdBodyMax = e;
    }
    plog(`[C] FWD same-side MAX=${fwdMax.toFixed(6)} out>${TOL}=${fwdOut} worst@t=${fwdT.toFixed(5)} dtToCrest=${dtToCrest(fwdT).toFixed(5)} band=${bandOf(fwdT, ringZs)} | ring-band ${fwdRingMax.toFixed(6)} body ${fwdBodyMax.toFixed(6)} | crossings(tread)=${crossings} singleValMax=${crossMax.toFixed(4)}(invalid ruler)`);

    // ── REV whole-mesh coverage (one-sided rA near rings ⇒ handles the C0 correctly), NO exclusion.
    const loc = buildArtifactLocator(xyz, idx);
    const rAos = oneSidedRA(rA, ringZs, 1e-4) as unknown as AnalyticRadiusFn;
    const nUu = 1024, nTt = 2400;
    let revMax = 0, revOut = 0, revT = 0, revRingMax = 0, revBodyMax = 0;
    for (let j = 0; j < nTt; j++) {
      const z = (j / (nTt - 1)) * DS_H; const band = dzToRing(z, ringZs) <= 1.0 ? 'ring' : 'body';
      for (let i = 0; i < nUu; i++) {
        const th = (i / nUu) * TAU; const r = rAos(th, z); const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z);
        if (d > TOL) revOut++;
        if (d > revMax) { revMax = d; revT = z / DS_H; }
        if (band === 'ring') { if (d > revRingMax) revRingMax = d; } else if (d > revBodyMax) revBodyMax = d;
      }
    }
    plog(`[C] REV MAX=${revMax.toFixed(6)} out>${TOL}=${revOut}/${nUu * nTt} worst@t=${revT.toFixed(5)} dtToCrest=${dtToCrest(revT).toFixed(5)} band=${dzToRing(revT * DS_H, ringZs) <= 1 ? 'ring' : 'body'} | ring-band ${revRingMax.toFixed(6)} body ${revBodyMax.toFixed(6)}`);

    // ── #3 u-SEAM: dense true-surface strip straddling u=0 → nearest mesh (one-sided near rings).
    let seamMax = 0, seamT = 0;
    for (let j = 0; j <= 4000; j++) {
      const z = (j / 4000) * DS_H;
      for (const uu of [-0.0007, -0.0003, 0, 0.0003, 0.0007]) { const th = (((uu % 1) + 1) % 1) * TAU; const r = rAos(th, z); const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z); if (d > seamMax) { seamMax = d; seamT = z / DS_H; } }
    }
    plog(`[C] U-SEAM MAX=${seamMax.toFixed(6)} worst@t=${seamT.toFixed(5)}`);

    // ── #2 RIM validity: outer wall rims must be exactly nU ascending-u (the assembly pairs index-for-index vs the
    //    inner wall it pins to outer.bottomRing.length). + rims are CLEAN (no fan touches t=0/t=1).
    const nU = wall.nU;
    let rimsAscending = wall.bottomRing.length === nU && wall.topRing.length === nU;
    for (let i = 0; i < nU && rimsAscending; i++) {
      if (Math.abs(ut[2 * wall.bottomRing[i]] - i / nU) > 1e-9 || ut[2 * wall.bottomRing[i] + 1] !== 0) rimsAscending = false;
      if (Math.abs(ut[2 * wall.topRing[i]] - i / nU) > 1e-9 || ut[2 * wall.topRing[i] + 1] !== 1) rimsAscending = false;
    }
    plog(`[C] RIM validity: bottomRing=${wall.bottomRing.length} topRing=${wall.topRing.length} (nU=${nU}) ascending-u & on t=0/1 = ${rimsAscending}`);

    // ── WATERTIGHT: auditNonManByIndex (no Map cap) + NON-VACUOUS control (append a duplicate triangle) + prod audit.
    const nm = tris < 5_400_000 ? auditNonManByIndex(xyz, idx) : nonManRawBigStats(idx).nonMan;
    const idx2 = new Uint32Array(idx.length + 3); idx2.set(idx); idx2[idx.length] = idx[0]; idx2[idx.length + 1] = idx[1]; idx2[idx.length + 2] = idx[2];
    const nmCrack = idx2.length / 3 < 5_400_000 ? auditNonManByIndex(xyz, idx2) : nonManRawBigStats(idx2).nonMan;
    const res = dsRingStripWallToOuterWall(wall);
    const bvi = new Set<number>([...wall.bottomRing, ...wall.topRing]);
    const mesh3: Mesh3 = { positions: res.vertices, indices: res.indices };
    const prod = auditWatertight(mesh3, { boundaryVertexIndices: bvi });
    plog(`[C] WATERTIGHT nonManByIndex=${nm} (crack ${nmCrack}) | prod nonManifoldEdges=${prod.nonManifoldEdges} tJunctions=${prod.tJunctions} boundaryEdges=${prod.boundaryEdges} (intended rims=${2 * nU})`);
    const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
    plog(`[C] slivers %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(3)}`);

    const closed = fwdMax <= TOL && revMax <= TOL && revOut === 0 && seamMax <= TOL && nm === 0 && nmCrack !== nm
      && prod.nonManifoldEdges === 0 && prod.tJunctions === 0 && prod.boundaryEdges === 2 * nU && rimsAscending;
    checkpoint({
      key, nU, tris, rows: wall.tRows.length, apexCount: wall.apexCount, skippedApexes: wall.skippedApexes, buildS: +buildS.toFixed(2),
      fwdSameSideMax: +fwdMax.toFixed(6), fwdOut, fwdWorst: { t: +fwdT.toFixed(5), dtToCrest: +dtToCrest(fwdT).toFixed(5), band: bandOf(fwdT, ringZs) }, fwdRingBandMax: +fwdRingMax.toFixed(6), fwdBodyMax: +fwdBodyMax.toFixed(6), treadCrossings: crossings,
      revMax: +revMax.toFixed(6), revOut, revWorst: { t: +revT.toFixed(5), dtToCrest: +dtToCrest(revT).toFixed(5) }, revRingBandMax: +revRingMax.toFixed(6), revBodyMax: +revBodyMax.toFixed(6),
      uSeamMax: +seamMax.toFixed(6), rimsAscending, boundaryEdges: prod.boundaryEdges, intendedRims: 2 * nU,
      nonMan: nm, crackNonMan: nmCrack, prodNonManifoldEdges: prod.nonManifoldEdges, prodTJunctions: prod.tJunctions,
      pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(3),
      WHOLE_MESH_CLOSED: closed,
    });
    plog(`[C] DONE — WHOLE_MESH_CLOSED=${closed}`);
  }, 60 * 60 * 1000);
});
