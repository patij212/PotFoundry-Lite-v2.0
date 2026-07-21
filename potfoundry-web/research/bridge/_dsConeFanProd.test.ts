// _dsConeFanProd.test.ts — E-2026-07-21-DS-CONEFAN-PROD. Round 4: settle the SUBSTRATE for the tournament-winning
// scale-tip CONE-FAN (E-DS-TIPCONE-TOURNAMENT), productionize it flag-gated, verify at the law budget.
//
// SUBSTRATE A/B (Phase A, this file, probe-only, screen budget):
//   (a) REGION KERNEL cone-fan — PROVEN (E-DS-TIPCONE-TOURNAMENT T3HD: apex 0.0162@2.0M, law ~23/√tris, nonMan 0)
//       but the region kernel is COMPUTE-PROHIBITIVE above ~2.4M pts (E-DS-HYBRID D1 HD killed >28 CPU-min) ⇒ the
//       Phase-C law budget (~5.2M tris) is INFEASIBLE there on this machine. Data reused from the tournament ndjson.
//   (b) STRIP EMITTER cone-fan — per-apex GRADED POLAR FAN patches replacing the uniform grid cells around each of
//       the 128 apexes, WELDED BY INDEX (arm-4 machinery hosting the PROVEN fan geometry). The strip emitter is
//       ~1000× faster (CONVERGE-A: 1.1s @3.17M) ⇒ the ONLY substrate on which Phase C at ~5.2M is tractable HERE.
//
// PRE-REGISTERED "cheaper" (Phase-A exit, committed BEFORE running): the strip fan WINS iff it (1) holds the apex
// law (apex fwd true-3D MAX on the ~23/√tris trajectory, i.e. ≤ the region kernel's apex at equal tris), (2) builds
// ≥5× faster than the region kernel at equal tris, AND (3) nonMan-by-index = 0 (a non-vacuous crack control moves it).
// If the weld is architecturally ugly (nonMan≠0 / T-junctions the fan-vs-uniform-row boundary forces), SAY SO and
// take the region kernel — accepting Phase C is compute-limited on this machine (verify at max tractable budget).
//
// DEV-ONLY; research/ only; READ-ONLY src (dsRingStrips schedule + doubleValued primitives + labkit + prodtruth lib).
// The strip cone-fan is prototyped HERE first; src only in Phase B if it wins. Env-gated + checkpointed.
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
import { buildDsRingTSchedule } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const SCALE_ROWS = 8;
const OUT_DIR = join('research', 'exchange', '_dsConeFanProd');
const NDJSON = join(OUT_DIR, 'conefanprod.ndjson');

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

function ringZsArr(): number[] { return dragonRings().map((r) => r.z); }
function dtToCrest(t: number): number { let m = 1e9; for (let k = 0; k < SCALE_ROWS; k++) { const d = Math.abs(t - (k + 0.5) / SCALE_ROWS); if (d < m) m = d; } return m; }

/** Crest-anchored t-schedule: ring machinery (tread pairs + flank ladders, no uniform body fill) + a row EXACTLY on
 * each crest t=(k+0.5)/8 + a symmetric geometric ladder fanning out from each crest (so the fan block has rows to
 * span) + a modest uniform body fill. Same family as DS-BODY-CLOSE; a vertex lands on every crest. */
function buildCrestAnchoredTRows(bodyStepMm: number, crestLadderRows: number): number[] {
  const base = buildDsRingTSchedule(DS_H, { treadHalfMm: 0.005, flankReachMm: 1.3, flankRows: 30, flankGrade: 1.25, bodyStepMm: 1e6 });
  const set = new Set<number>(base);
  for (let k = 0; k < SCALE_ROWS; k++) {
    const tc = (k + 0.5) / SCALE_ROWS; set.add(tc);
    let d = 0.02 / DS_H, step = 0.02 / DS_H;
    for (let j = 0; j < crestLadderRows; j++) { const a = tc - d, b = tc + d; if (a > 0) set.add(a); if (b < 1) set.add(b); step *= 1.4; d += step; if (d > 1.3 / DS_H) break; }
  }
  const rows = [...set].sort((a, b) => a - b);
  // uniform fill of remaining big gaps.
  const out: number[] = []; const stepT = bodyStepMm / DS_H;
  for (let i = 0; i < rows.length; i++) {
    out.push(rows[i]);
    if (i + 1 >= rows.length) break;
    const gap = rows[i + 1] - rows[i];
    if (gap > stepT * 1.5) { const n = Math.ceil(gap / stepT); for (let m = 1; m < n; m++) out.push(rows[i] + (gap * m) / n); }
  }
  const uniq: number[] = []; for (const t of out) if (uniq.length === 0 || t - uniq[uniq.length - 1] > 1e-9) uniq.push(t);
  return uniq;
}

/** The 128 scale-tip (u,t) apexes. */
function scaleTipUts(): Array<{ u: number; t: number }> {
  const tips: Array<{ u: number; t: number }> = [];
  for (let k = 0; k < SCALE_ROWS; k++) { const t = (k + 0.5) / SCALE_ROWS; for (let m = 0; m < 16; m++) { let u = (k % 2 === 0 ? (m + 0.5) : m) / 16; u -= Math.floor(u); tips.push({ u, t }); } }
  return tips;
}

interface StripFanWall { xyz: Float32Array; idx: Uint32Array; ut: number[]; tris: number; fanTris: number; apexCells: number; overlaps: number }
/**
 * STRIP EMITTER cone-fan: structured cylinder grid (nU cols × tRows) with a per-apex GRADED POLAR FAN welded BY INDEX.
 * For each apex vertex (crest row × scale-center col), the (2p+1)×(2p+1) grid block is retriangulated as a radial fan:
 * apex + G graded rings (geometric fractions `fanFrac`) spoked to the block's 8p perimeter vertices. The perimeter
 * vertices are EXISTING grid vertices ⇒ the fan welds to the untouched outer grid by index (each perimeter edge shared
 * by the fan + one outer cell ⇒ 2 ⇒ manifold). Cells INSIDE any block are removed (replaced by the fan). Overlapping
 * blocks are skipped (counted) — pick nU/p so apex blocks don't overlap.
 */
function buildStripConeFanWall(nU: number, tRows: number[], rA: AnalyticRadiusFn, p: number, fanFrac: number[]): StripFanWall {
  const cols = Math.max(3, Math.floor(nU));
  const rows = tRows.length;
  const grid = new Int32Array(rows * cols);
  const xyz: number[] = []; const ut: number[] = [];
  const addV = (u: number, t: number): number => { const th = TAU * u, z = t * DS_H, r = rA(th, z); const id = xyz.length / 3; xyz.push(r * Math.cos(th), r * Math.sin(th), z); ut.push(u, t); return id; };
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) grid[j * cols + i] = addV(i / cols, tRows[j]);

  // locate each apex grid (row,col); nearest row to t_crest, nearest col to u_apex.
  const rowOfT = (t: number): number => { let br = 0, bd = 1e9; for (let j = 0; j < rows; j++) { const d = Math.abs(tRows[j] - t); if (d < bd) { bd = d; br = j; } } return br; };
  const apexRC: Array<{ r: number; c: number }> = [];
  for (const tip of scaleTipUts()) apexRC.push({ r: rowOfT(tip.t), c: Math.round(tip.u * cols) % cols });

  // mark removed cells (interior of each block) + detect overlaps.
  const removed = new Uint8Array((rows - 1) * cols);
  const cellKey = (j: number, i: number): number => j * cols + ((i % cols) + cols) % cols;
  let overlaps = 0; const usedBlocks: Array<{ r: number; c: number }> = [];
  const keep: Array<{ r: number; c: number }> = [];
  for (const ap of apexRC) {
    if (ap.r - p < 0 || ap.r + p > rows - 1) { overlaps++; continue; } // block would exceed t-range
    let clash = false;
    for (let dj = -p; dj < p && !clash; dj++) for (let di = -p; di < p; di++) { if (removed[cellKey(ap.r + dj, ap.c + di)]) { clash = true; break; } }
    if (clash) { overlaps++; continue; }
    for (let dj = -p; dj < p; dj++) for (let di = -p; di < p; di++) removed[cellKey(ap.r + dj, ap.c + di)] = 1;
    keep.push(ap); usedBlocks.push(ap);
  }
  void usedBlocks;

  const idx: number[] = [];
  // uniform quads for all NON-removed cells.
  for (let j = 0; j + 1 < rows; j++) for (let i = 0; i < cols; i++) {
    if (removed[j * cols + i]) continue;
    const iN = (i + 1) % cols;
    const a = grid[j * cols + i], b = grid[j * cols + iN], c = grid[(j + 1) * cols + iN], d = grid[(j + 1) * cols + i];
    idx.push(a, b, c, a, c, d);
  }
  // per-apex graded fan.
  let fanTris = 0;
  const G = fanFrac.length;
  for (const ap of keep) {
    const apexV = grid[ap.r * cols + ap.c];
    // perimeter loop of the (2p+1)^2 block, CCW: top row L→R, right col T→B, bottom row R→L, left col B→T.
    const loop: number[] = [];
    const rTop = ap.r - p, rBot = ap.r + p, cL = ap.c - p, cR = ap.c + p;
    for (let i = cL; i <= cR; i++) loop.push(grid[rTop * cols + (((i % cols) + cols) % cols)]);
    for (let j = rTop + 1; j <= rBot; j++) loop.push(grid[j * cols + (((cR % cols) + cols) % cols)]);
    for (let i = cR - 1; i >= cL; i--) loop.push(grid[rBot * cols + (((i % cols) + cols) % cols)]);
    for (let j = rBot - 1; j >= rTop + 1; j--) loop.push(grid[j * cols + (((cL % cols) + cols) % cols)]);
    const B = loop.length; // = 8p
    // spoke vertices: for each boundary vertex, G graded points between apex and it (fraction fanFrac[g]).
    const au = ut[2 * apexV], at = ut[2 * apexV + 1];
    const spoke: number[][] = [];
    for (let k = 0; k < B; k++) {
      let bu = ut[2 * loop[k]]; const bt = ut[2 * loop[k] + 1];
      if (bu - au > 0.5) bu -= 1; else if (au - bu > 0.5) bu += 1; // unwrap seam
      const col: number[] = [];
      for (let g = 0; g < G; g++) { const f = fanFrac[g]; let u = au + f * (bu - au); u -= Math.floor(u); col.push(addV(u, at + f * (bt - at))); }
      spoke.push(col);
    }
    // innermost fan: apex → spoke[k][0] → spoke[k+1][0].
    for (let k = 0; k < B; k++) { const kn = (k + 1) % B; idx.push(apexV, spoke[k][0], spoke[kn][0]); fanTris++; }
    // annuli between ring g and g+1.
    for (let g = 0; g + 1 < G; g++) for (let k = 0; k < B; k++) { const kn = (k + 1) % B; idx.push(spoke[k][g], spoke[kn][g], spoke[kn][g + 1], spoke[k][g], spoke[kn][g + 1], spoke[k][g + 1]); fanTris += 2; }
    // outer annulus: spoke[k][G-1] → loop[k] → loop[k+1] → spoke[k+1][G-1].
    for (let k = 0; k < B; k++) { const kn = (k + 1) % B; idx.push(spoke[k][G - 1], loop[k], loop[kn], spoke[k][G - 1], loop[kn], spoke[kn][G - 1]); fanTris += 2; }
  }
  return { xyz: Float32Array.from(xyz), idx: Uint32Array.from(idx), ut, tris: idx.length / 3, fanTris, apexCells: keep.length, overlaps };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('DS-CONEFAN-PROD — substrate A/B + productionize + verify', () => {
  // PHASE A: strip-emitter cone-fan — manifold GATE first, then apex fidelity + build time vs the region kernel.
  it.skipIf(process.env.PF_CFP_A !== '1')('A stripFan — weld manifold gate + apex sag + build time', () => {
    plog(`=== A stripFan => ${NDJSON} ===`);
    const rA = dsRadiusFn() as AnalyticRadiusFn;
    const ringZs = ringZsArr();
    const arms: Array<{ tag: string; nU: number; bodyStep: number; p: number; fan: number[] }> = [
      { tag: 'nU1024_p2', nU: 1024, bodyStep: 0.25, p: 2, fan: [0.12, 0.3, 0.6] },
      { tag: 'nU2048_p2', nU: 2048, bodyStep: 0.2, p: 2, fan: [0.1, 0.25, 0.5] },
    ];
    for (const a of arms) {
      const key = `A|${a.tag}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const tRows = buildCrestAnchoredTRows(a.bodyStep, 6);
      const t0 = Date.now(); const c0 = cpuUsage();
      const w = buildStripConeFanWall(a.nU, tRows, rA, a.p, a.fan);
      const cpu = cpuUsage(c0); const buildS = (Date.now() - t0) / 1000;
      // MANIFOLD GATE (by index) + non-vacuous crack control.
      const nm = w.tris < 5_400_000 ? auditNonManByIndex(w.xyz, w.idx) : nonManRawBigStats(w.idx).nonMan;
      const idx2 = Uint32Array.from(w.idx); const xyz2 = new Float32Array(w.xyz.length + 3); xyz2.set(w.xyz);
      const nv = w.xyz.length / 3; xyz2[3 * nv] = w.xyz[3 * idx2[0]] + 5; xyz2[3 * nv + 1] = w.xyz[3 * idx2[0] + 1]; xyz2[3 * nv + 2] = w.xyz[3 * idx2[0] + 2]; idx2[0] = nv;
      const nmCrack = w.tris < 5_400_000 ? auditNonManByIndex(xyz2, idx2) : nonManRawBigStats(idx2).nonMan;
      plog(`[A][${a.tag}] rows=${tRows.length} tris=${w.tris} fanTris=${w.fanTris} apexCells=${w.apexCells}/128 overlaps=${w.overlaps} build=${buildS.toFixed(2)}s cpu=${(cpu.user + cpu.system) / 1e6}s | nonMan=${nm} crackNonMan=${nmCrack}`);
      const row: Record<string, unknown> = { key, tag: a.tag, nU: a.nU, p: a.p, rows: tRows.length, tris: w.tris, fanTris: w.fanTris, apexCells: w.apexCells, overlaps: w.overlaps, buildS: +buildS.toFixed(2), cpuS: +((cpu.user + cpu.system) / 1e6).toFixed(2), nonMan: nm, crackNonMan: nmCrack };
      if (nm === 0) {
        // apex fidelity: fwd true-3D over facets within 0.6mm(t) of a crest (the tip cone population).
        const sag = perFaceTrue3DSag(w.ut, w.idx, rA, DS_H, { preFilterMm: 0.005 });
        let apexMax = 0, apexN = 0, apexOut = 0, aT = 0; const nF = w.idx.length / 3;
        for (let f = 0; f < nF; f++) {
          const zc = (w.xyz[3 * w.idx[3 * f] + 2] + w.xyz[3 * w.idx[3 * f + 1] + 2] + w.xyz[3 * w.idx[3 * f + 2] + 2]) / 3;
          if (dtToCrest(zc / DS_H) < 0.6 / DS_H) { apexN++; if (sag.faceErr[f] > apexMax) { apexMax = sag.faceErr[f]; aT = zc / DS_H; } if (sag.faceErr[f] > TOL) apexOut++; }
        }
        const q = triangleQualityDistribution({ vertices: w.xyz, indices: w.idx });
        plog(`[A][${a.tag}] APEX-cone fwd MAX=${apexMax.toFixed(6)} (out=${apexOut}/${apexN}) worst dtToCrest=${dtToCrest(aT).toFixed(5)} | %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(3)}`);
        row.apexConeMax = +apexMax.toFixed(6); row.apexOut = apexOut; row.apexN = apexN; row.pctBelow20 = +q.pctBelow20.toFixed(2); row.minAngle = +q.minAngleDeg.toFixed(3);
      }
      checkpoint(row);
    }
    plog('[A] DONE');
  }, 60 * 60 * 1000);
});

// reserved for Phase C rev-coverage (winner only).
void buildArtifactLocator; void oneSidedRA;
