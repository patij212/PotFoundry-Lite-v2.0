// _dsSliver.test.ts — E-2026-07-22-DS-SLIVER (SCOPE arm): LOCALIZE the DragonScales cone-fan sliver population before
// touching the emitter. DS-COMPOSE closed the FULL wall to whole-mesh ≤0.01mm true-3D + watertight, with ONE named,
// out-of-scope concession: slivers %<20°=14.3 / minAngle 1.4°. The user's priority is a clean PRODUCTION ship, and a
// 14.3%-sliver mesh is not print-clean regardless of fidelity. Audit-first (no fix until measured): attribute every
// <20° triangle of the PRODUCTION emitter (src buildDsConeFanWallGeometric) to its STRUCTURAL source so the fix targets
// the dominant one, not a guess.
//
// SOURCES (from the emitter structure, dsRingStrips.ts):
//   • FAN (per-apex graded polar fan): apex-ring (apex+2 innermost spokes; the fan-center convergence) / ring-band
//     (annuli between graded rings) / outer-band (outermost ring → block perimeter). Emitted AFTER the grid, apex by
//     apex, B·(2G+1) tris each (B=8p perimeter verts, G fan rings).
//   • GRID (structured cylinder quads): body rows (bodyStepMm≈0.12) / tread pairs (t=k/8±dtHalf, the near-vertical C0
//     step — intentionally thin) / crest ladders (fine rows fanning from each crest (k+0.5)/8) / flank ladders (fine
//     rows fanning from each ring). A row thinner than the u-arc (2πr/nU ≈ 0.069mm @ nU4096) makes EVERY column quad in
//     it a horizontal sliver.
//
// READ-ONLY src (the production emitter + labkit + prodtruth lib). Env-gated PF_DSSLIVER; checkpointed. No fix here.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import { triangleQualityDistribution } from './labkit';
import { dsRadiusFn, H as DS_H } from './_ds_prodtruth_lib';
import {
  buildDsConeFanWallGeometric,
  type DsConeFanOpts,
} from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const SCALE_ROWS = 8;
const OUT_DIR = join('research', 'exchange', '_dsSliver');
const NDJSON = join(OUT_DIR, 'sliver.ndjson');

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

/** Angle (deg) at the vertex opposite side z, given triangle side lengths x,y,z — the metrics.ts law-of-cosines. */
function angOpp(x: number, y: number, z: number): number {
  const c = (x * x + y * y - z * z) / (2 * x * y);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}
/** Smallest interior angle (deg) of triangle (a,b,c) from flat xyz; -1 if degenerate. */
function triMinAngle(xyz: Float32Array, a: number, b: number, c: number): number {
  const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
  const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
  const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
  const ab = Math.hypot(bx - ax, by - ay, bz - az);
  const bc = Math.hypot(cx - bx, cy - by, cz - bz);
  const ca = Math.hypot(ax - cx, ay - cy, az - cz);
  if (ab < 1e-9 || bc < 1e-9 || ca < 1e-9) return -1;
  return Math.min(angOpp(bc, ca, ab), angOpp(ab, ca, bc), angOpp(ab, bc, ca));
}

interface Bucket { n: number; ltCount: number; minAng: number; sumLt: number }
function emptyBucket(): Bucket { return { n: 0, ltCount: 0, minAng: 180, sumLt: 0 }; }
function tally(b: Bucket, ang: number, thr: number): void {
  b.n++;
  if (ang >= 0 && ang < b.minAng) b.minAng = ang;
  if (ang >= 0 && ang < thr) { b.ltCount++; b.sumLt += ang; }
}

const RING_TS: number[] = []; for (let k = 1; k < SCALE_ROWS; k++) RING_TS.push(k / SCALE_ROWS);
const CREST_TS: number[] = []; for (let k = 0; k < SCALE_ROWS; k++) CREST_TS.push((k + 0.5) / SCALE_ROWS);
function nearestMm(t: number, arr: number[]): number { let m = 1e9; for (const a of arr) { const d = Math.abs(t - a) * DS_H; if (d < m) m = d; } return m; }

describe('DS-SLIVER (SCOPE) — localize the production cone-fan <20° population by structural source', () => {
  it.skipIf(process.env.PF_DSSLIVER !== '1')('classify every <20° triangle to grid/fan sub-source', () => {
    plog(`=== DS-SLIVER SCOPE => ${NDJSON} ===`);
    const rA = dsRadiusFn() as AnalyticRadiusFn;
    const nU = process.env.PF_DSSLIVER_NU ? parseInt(process.env.PF_DSSLIVER_NU, 10) : 4096;
    const key = `sliver|nU${nU}`;
    if (keyExists(key)) { plog(`[skip] ${key}`); return; }

    // Production emitter, production defaults made explicit so the fan sub-group index model is exact.
    const P = 3;
    const FRAC = [0.05, 0.12, 0.25, 0.45, 0.7];
    const opts: DsConeFanOpts = { patchP: P, fanFrac: FRAC, bodyStepMm: 0.12, crestLadderRows: 7 };
    const t0 = Date.now(); const c0 = cpuUsage();
    const w = buildDsConeFanWallGeometric(rA, DS_H, nU, opts);
    const buildS = (Date.now() - t0) / 1000; const cpu = cpuUsage(c0);
    const rows = w.tRows.length;
    const gridVerts = rows * w.nU;
    const nF = w.indices.length / 3;
    const fanTris = w.fanTriangles;
    const gridTris = nF - fanTris;
    const B = 8 * P, G = FRAC.length, perApex = B * (2 * G + 1);
    plog(`[SLIVER] nU=${nU} rows=${rows} tris=${nF} gridTris=${gridTris} fanTris=${fanTris} apex=${w.apexCount}/${w.apexCount + w.skippedApexes} skipped=${w.skippedApexes} build=${buildS.toFixed(2)}s cpu=${((cpu.user + cpu.system) / 1e6).toFixed(2)}s`);
    // sanity: the fan emission model (B·(2G+1) per apex) must reproduce the returned fanTriangles.
    plog(`[SLIVER] model check: apex*perApex=${w.apexCount * perApex} vs fanTris=${fanTris} (${w.apexCount * perApex === fanTris ? 'OK' : 'MISMATCH'})`);

    const uArcMm = (2 * Math.PI * 45) / nU; // ≈ column arc length at r≈45mm — the sliver yardstick
    const THR = 20;
    const src: Record<string, Bucket> = {
      'fan-apexRing': emptyBucket(), 'fan-ringBand': emptyBucket(), 'fan-outerBand': emptyBucket(),
      'grid-tread': emptyBucket(), 'grid-crestLadder': emptyBucket(), 'grid-flankLadder': emptyBucket(),
      'grid-body': emptyBucket(),
    };
    // global worst + a dz-histogram of grid slivers.
    let worstAng = 180; let worstInfo: Record<string, unknown> = {};
    const dzHist: Record<string, number> = { '<0.005': 0, '0.005-0.02': 0, '0.02-0.05': 0, '0.05-0.12': 0, '>0.12': 0 };

    for (let f = 0; f < nF; f++) {
      const a = w.indices[3 * f], b = w.indices[3 * f + 1], c = w.indices[3 * f + 2];
      const ang = triMinAngle(w.vertices, a, b, c);
      let source: string;
      if (f >= gridTris) {
        const within = (f - gridTris) % perApex;
        source = within < B ? 'fan-apexRing' : within < B + (G - 1) * B * 2 ? 'fan-ringBand' : 'fan-outerBand';
      } else {
        const ta = w.ut[2 * a + 1], tb = w.ut[2 * b + 1], tc = w.ut[2 * c + 1];
        const tLo = Math.min(ta, tb, tc), tHi = Math.max(ta, tb, tc);
        const dz = (tHi - tLo) * DS_H, tMid = (tLo + tHi) / 2;
        const dRing = nearestMm(tMid, RING_TS), dCrest = nearestMm(tMid, CREST_TS);
        if (dRing < 0.02 && dz < 0.02) source = 'grid-tread';
        else if (dCrest < dRing) source = 'grid-crestLadder';
        else if (dRing < 0.4) source = 'grid-flankLadder';
        else source = 'grid-body';
        if (ang >= 0 && ang < THR) {
          dzHist[dz < 0.005 ? '<0.005' : dz < 0.02 ? '0.005-0.02' : dz < 0.05 ? '0.02-0.05' : dz < 0.12 ? '0.05-0.12' : '>0.12']++;
        }
      }
      tally(src[source], ang, THR);
      if (ang >= 0 && ang < worstAng) {
        worstAng = ang;
        worstInfo = { source, ang: +ang.toFixed(3), ut: [w.ut[2 * a], w.ut[2 * a + 1], w.ut[2 * b], w.ut[2 * b + 1], w.ut[2 * c], w.ut[2 * c + 1]].map((x) => +x.toFixed(5)) };
      }
    }

    const q = triangleQualityDistribution({ vertices: w.vertices, indices: w.indices });
    plog(`[SLIVER] HEADLINE  tris=${nF}  %<20=${q.pctBelow20.toFixed(2)}  %<10=${q.pctBelow10.toFixed(2)}  minAngle=${q.minAngleDeg.toFixed(3)}  uArcMm≈${uArcMm.toFixed(4)}`);
    plog('[SLIVER] SOURCE | totalTris | <20count | <20 %ofAll | srcMinAng | mean<20');
    const table: Record<string, unknown> = {};
    for (const [name, bk] of Object.entries(src)) {
      const pctOfAll = (100 * bk.ltCount) / nF;
      plog(`  ${name.padEnd(16)} | ${String(bk.n).padStart(9)} | ${String(bk.ltCount).padStart(8)} | ${pctOfAll.toFixed(2).padStart(9)} | ${bk.minAng.toFixed(2).padStart(9)} | ${(bk.ltCount ? bk.sumLt / bk.ltCount : 0).toFixed(1)}`);
      table[name] = { n: bk.n, lt20: bk.ltCount, pctOfAll: +pctOfAll.toFixed(3), minAng: +bk.minAng.toFixed(2) };
    }
    plog(`[SLIVER] grid-sliver dz histogram (mm): ${JSON.stringify(dzHist)}`);
    plog(`[SLIVER] WORST triangle: ${JSON.stringify(worstInfo)}`);
    checkpoint({ key, nU, rows, tris: nF, gridTris, fanTris, apex: w.apexCount, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(3), uArcMm: +uArcMm.toFixed(4), bySource: table, dzHist, worst: worstInfo });
    plog('[SLIVER] DONE');
  }, 60 * 60 * 1000);
});
