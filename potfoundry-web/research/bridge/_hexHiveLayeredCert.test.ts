// _hexHiveLayeredCert.test.ts — E-2026-07-22-HEXHIVE-LAYERED-CERT.
//
// QUESTION (pre-registered): can the DragonScales structured-emitter template (ring-strip + cone-fan) be adapted to
// close HexagonalHive (ID 16, registry defaults) to true-3D MAX ≤0.01mm at PRODUCTION scale (OD140/H120 tapered),
// producing a watertight, judge-certifiable STRUCTURED mesh?
//
// PRIOR (registry): HexHive is a STAGGERED 2D honeycomb — walls at 0°/±60° forming closed cells (FeatureLineGraph
// extractHexagonalHive), NON-periodic in u (u·TAU·scale=25.13 cells ⇒ no seam tiling). E-CLOSE-THETA REFUTED the
// vertical-θ ridge-graph (33.5mm bridge). E-CT-HEXHIVE closed it to fl-chord p99 0.0093 @944k tris — but that was a
// FREE tangled-CDT (not judge-certifiable) measured on INTERIOR loci by p99 (flMax was 0.025, seam not measured). The
// DS ring-strip template assumes HORIZONTAL rings + vertical columns + point apexes; the honeycomb's ±60° diagonal
// walls + vertical seam cliff are a different structure. This probe MEASURES, MAX-first true-3D, whole-mesh.
//
// RESOLVED (2026-07-22): the u-wrap seam was NOT a meshing problem — it was a genuine C0 discontinuity of the TARGET
// surface. u=theta*scale laid out 2π·4=25.13 NON-integer hex columns (unit x-period ⇒ rA(2π)≠rA(0)). Fixed at the
// surface by snapping the effective angular frequency to round(2π·scale)=25 integer columns, in all four parity copies:
// styles.ts rOuterHexagonalHive + WGSL style_hexagonal_hive + FeatureLineGraph.hexCreaseD + hexagonalHiveOuterWallTarget.
// Post-fix (this probe): char seamMax 0.9209→0.0000mm; baseline 2048x512 whole-mesh true-3D MAX 0.738→0.01153mm (seam
// eliminated, now interior-limited & density-convergent); cert judge=ACCEPT maxδ 0.000066. The prior E-CT-HEXHIVE
// "p99 0.0093" claim EXCLUDED the seam — the honest whole-mesh MAX was 0.738; the remaining interior residual closes
// with density / the structured-emitter path.
//
// Arms (env PF_HEXHIVE=1 + PF_HEXHIVE_ARM):
//   char     — cheap surface characterization: relief range, seam-cliff magnitude, wall geometry. No big mesh.
//   baseline — uniform (u,t) structured grid density ladder → whole-mesh true-3D MAX + WHERE it concentrates + cert.
//   emitter  — the structured-emitter adaptation attempt (designed from the baseline localization) + cert.
//
// Research-only; src never imports research. Reuses labkit + certAdapter READ-ONLY. Checkpointed ndjson (resumable).
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceTrue3DSag, perFaceChordSag, nonManRawBigStats, auditNonManByIndex,
  triangleQualityDistribution, projectPointToRadialSurface, dumpHeatmap,
} from './labkit';
import { certifyPeriodicGridMesh } from './certAdapter';
import { baseRadius } from '../../src/geometry/profile';
import type { StyleId, StyleOptions } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const SQRT3 = Math.sqrt(3);
const OUT_DIR = join('research', 'exchange', '_hexHive');
const NDJSON = join(OUT_DIR, 'hexhive.ndjson');

// Production DEFAULT_DIMENSIONS: OD140/H120 TAPERED ⇒ H120 / Rt70 / Rb45 / expn1.1.
const H = 120, Rb = 45, Rt = 70, expn = 1.1;
const STYLE: StyleId = 'HexagonalHive';
const HH_SCALE = 4.0; // DEFAULT_HEXAGONAL_HIVE.hhScale

type RA = (theta: number, z: number) => number;

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP] ${JSON.stringify(row)}`);
}
function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => {
    try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; }
  });
}

/** HexHive honeycomb-crease scalar (len_a−len_b), replicating FeatureLineGraph.hexCreaseD — |value|→0 ON a wall. */
function hexCreaseD(u: number, t: number, scale: number): number {
  const uvx = u * TAU * scale;
  const uvy = t * scale * 0.5 * SQRT3;
  const sx = 1, sy = SQRT3;
  const ax = Math.floor(uvx / sx), ay = Math.floor(uvy / sy);
  const bx = Math.floor((uvx - 0.5) / sx), by = Math.floor((uvy - SQRT3 / 2) / sy);
  const gax = uvx - (ax * sx + 0.5), gay = uvy - (ay * sy + SQRT3 / 2);
  const gbx = uvx - (bx * sx + 1), gby = uvy - (by * sy + SQRT3);
  return (gax * gax + gay * gay) - (gbx * gbx + gby * gby);
}

/** Uniform STRUCTURED periodic cylinder grid (nU cols × nT rows), CCW (outward) winding. Welds u=nU→0 by index. */
function buildUniformGrid(rA: RA, nU: number, nT: number): { ut: number[]; indices: Uint32Array; positions: Float32Array; nU: number } {
  const positions: number[] = [];
  const ut: number[] = [];
  const grid = new Int32Array(nT * nU);
  for (let j = 0; j < nT; j++) for (let i = 0; i < nU; i++) {
    const u = i / nU, t = j / (nT - 1), th = TAU * u, z = t * H, r = rA(th, z);
    grid[j * nU + i] = positions.length / 3;
    positions.push(r * Math.cos(th), r * Math.sin(th), z);
    ut.push(u, t);
  }
  const idx: number[] = [];
  for (let j = 0; j + 1 < nT; j++) for (let i = 0; i < nU; i++) {
    const iN = (i + 1) % nU;
    const a = grid[j * nU + i], b = grid[j * nU + iN], c = grid[(j + 1) * nU + iN], d = grid[(j + 1) * nU + i];
    idx.push(a, b, c, a, c, d);
  }
  return { ut, indices: Uint32Array.from(idx), positions: Float32Array.from(positions), nU };
}

/** Lift a (u,t) mesh to 3D (Float64) for audits/dense sampling. */
function lift(ut: number[], rA: RA): Float64Array {
  const nV = ut.length / 2;
  const xyz = new Float64Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z);
    xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z;
  }
  return xyz;
}

/** DENSE per-facet true-3D MAX confirm: fine bary grid (nBary×nBary), project each to surface. Returns worst over `faces`. */
function denseFacetTrue3DMax(ut: number[], indices: ArrayLike<number>, xyz: Float64Array, rA: RA, faces: number[], nBary = 7): { max: number; face: number } {
  let max = 0, face = -1;
  for (const f of faces) {
    const a = indices[3 * f], b = indices[3 * f + 1], c = indices[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    for (let iu = 0; iu <= nBary; iu++) for (let iv = 0; iv + iu <= nBary; iv++) {
      const wa = 1 - (iu + iv) / nBary, wb = iu / nBary, wc = iv / nBary;
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const d = projectPointToRadialSurface(px, py, pz, rA).dist;
      if (d > max) { max = d; face = f; }
    }
  }
  return { max, face };
}

describe('HEXHIVE-LAYERED-CERT — can the DS structured-emitter template close HexagonalHive MAX ≤0.01 true-3D?', () => {
  // ── ARM: char — cheap surface characterization (no big mesh) ───────────────────────────────────────────────
  it.skipIf(process.env.PF_HEXHIVE !== '1' || process.env.PF_HEXHIVE_ARM !== 'char')('characterize the HexHive surface: relief, seam cliff, wall geometry', () => {
    plog('=== ARM char ===');
    const rA = buildRadiusFn(STYLE, {} as StyleOptions, { H, Rb, Rt, expn }) as unknown as RA;

    // relief range: rA - baseRadius over a dense grid
    let reliefMax = -Infinity, reliefMin = Infinity;
    const NT = 400, NU = 4000;
    for (let j = 0; j <= NT; j++) {
      const z = (j / NT) * H;
      const r0 = baseRadius(z, H, Rb, Rt, expn, {} as StyleOptions);
      for (let i = 0; i < NU; i++) {
        const th = (i / NU) * TAU;
        const rel = rA(th, z) - r0;
        if (rel > reliefMax) reliefMax = rel;
        if (rel < reliefMin) reliefMin = rel;
      }
    }
    plog(`relief range (rA−r0): [${reliefMin.toFixed(4)}, ${reliefMax.toFixed(4)}] mm (expect ~[0, 2] domes)`);

    // seam cliff: radial step |rA(0⁺,z) − rA(2π⁻,z)| over z (the non-periodic seam ray)
    const eps = 1e-6;
    let seamMax = 0, seamZ = 0, seamSum = 0;
    for (let j = 0; j <= NT; j++) {
      const z = (j / NT) * H;
      const step = Math.abs(rA(0 + eps, z) - rA(TAU - eps, z));
      seamSum += step;
      if (step > seamMax) { seamMax = step; seamZ = z; }
    }
    plog(`SEAM cliff |rA(0⁺)−rA(2π⁻)|: max=${seamMax.toFixed(4)}mm @z=${seamZ.toFixed(1)} mean=${(seamSum / (NT + 1)).toFixed(4)}mm`);

    // cell layout: cells around (uvx period 1 over [0, 2π·scale)) and vertically (uvy period √3 over [0, scale·0.5·√3))
    const cols = TAU * HH_SCALE; // ~25.13
    const rowsUv = HH_SCALE * 0.5 * SQRT3; // uvy at t=1
    plog(`honeycomb layout: uvx∈[0,${cols.toFixed(3)}) raw ⇒ PRODUCTION snaps to round(2π·scale)=${Math.round(cols)} integer columns (periodic ⇒ seam closed; see styles.ts rOuterHexagonalHive); uvy∈[0,${rowsUv.toFixed(3)}) ⇒ ${(rowsUv / SQRT3).toFixed(2)} rows`);

    // max radial gradient magnitude (steepness of the walls) — finite-difference dr/d(arc) in θ and z
    let gThMax = 0, gZMax = 0;
    const dTh = TAU / 20000, dZ = H / 20000;
    for (let j = 1; j < NT; j++) {
      const z = (j / NT) * H;
      for (let i = 0; i < 2000; i++) {
        const th = (i / 2000) * TAU;
        const gTh = Math.abs(rA(th + dTh, z) - rA(th - dTh, z)) / (2 * dTh * rA(th, z)); // per unit arc
        const gZ = Math.abs(rA(th, z + dZ) - rA(th, z - dZ)) / (2 * dZ);
        if (gTh > gThMax) gThMax = gTh;
        if (gZ > gZMax) gZMax = gZ;
      }
    }
    plog(`max |dr/d(arc)| θ-dir=${gThMax.toFixed(3)}  z-dir=${gZMax.toFixed(3)} (slope; >1 ⇒ steeper than 45°)`);
    checkpoint({ key: 'char', reliefMin: +reliefMin.toFixed(4), reliefMax: +reliefMax.toFixed(4), seamMax: +seamMax.toFixed(4), seamZ: +seamZ.toFixed(1), cols: +cols.toFixed(3), gThMax: +gThMax.toFixed(3), gZMax: +gZMax.toFixed(3) });
    plog('[char] DONE');
  }, 10 * 60 * 1000);

  // ── ARM: baseline — uniform (u,t) grid density ladder → whole-mesh true-3D MAX + localization ───────────────
  it.skipIf(process.env.PF_HEXHIVE !== '1' || process.env.PF_HEXHIVE_ARM !== 'baseline')('uniform structured grid: true-3D MAX ladder + WHERE the error concentrates', () => {
    plog('=== ARM baseline ===');
    const rA = buildRadiusFn(STYLE, {} as StyleOptions, { H, Rb, Rt, expn }) as unknown as RA;
    // density ladder (cap ~2M tris). power-of-2 nU (dyadic-snappable for the cert). one rung per key = resumable.
    const LADDER: Array<[number, number]> = [
      [512, 256], [1024, 384], [2048, 384], [2048, 512], [3072, 512], [4096, 512],
    ];
    const only = process.env.PF_HEXHIVE_RUNG; // "nUxnT" to run a single rung
    for (const [nU, nT] of LADDER) {
      if (only && only !== `${nU}x${nT}`) continue;
      const key = `base|${nU}x${nT}`;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const t0 = Date.now();
      const g = buildUniformGrid(rA, nU, nT);
      const nF = g.indices.length / 3;
      if (nF > 2_100_000) { plog(`[${key}] SKIP ${nF} tris > 2.1M cap`); continue; }
      const xyz = lift(g.ut, rA);
      // radial (cheap upper-bound) to pick candidate worst facets, then true-3D whole-mesh MAX.
      const rad = perFaceChordSag(g.ut, g.indices, rA as never, H);
      const sag = perFaceTrue3DSag(g.ut, g.indices, rA as never, H, { preFilterMm: 0.004 });
      // per-facet "on the u-seam band" test (the non-periodic seam quad column + its neighbours) — the wrapped u-span
      // of a facet exceeding 0.5 means it straddles u=0↔1; also flag facets touching u∈[0,3/nU]∪[1−3/nU,1].
      const seamBand = 3 / nU;
      const isSeamFace = (f: number): boolean => {
        const a = g.indices[3 * f], b = g.indices[3 * f + 1], c = g.indices[3 * f + 2];
        const ua = g.ut[2 * a], ub = g.ut[2 * b], uc = g.ut[2 * c];
        if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) return true; // wraps the seam
        return Math.min(ua, ub, uc) < seamBand || Math.max(ua, ub, uc) > 1 - seamBand;
      };
      let max = 0, out = 0, worstF = -1, maxInt = 0, outInt = 0;
      for (let f = 0; f < nF; f++) {
        const e = sag.faceErr[f]; if (e > max) { max = e; worstF = f; } if (e > 0.01) out++;
        if (!isSeamFace(f)) { if (e > maxInt) maxInt = e; if (e > 0.01) outInt++; }
      }
      // dense confirm on the worst-500 true-3D facets (4-pt SAG_BARY can under-report a diagonal-wall interior)
      const order = Array.from({ length: nF }, (_, i) => i).sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 500);
      const dense = denseFacetTrue3DMax(g.ut, g.indices, xyz, rA, order, 8);
      // dense confirm on the worst-500 INTERIOR (seam-excluded) facets — the honeycomb-wall residual trajectory
      const orderInt = Array.from({ length: nF }, (_, i) => i).filter((f) => !isSeamFace(f)).sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 500);
      const denseInt = denseFacetTrue3DMax(g.ut, g.indices, xyz, rA, orderInt, 8);
      const nm = nonManRawBigStats(g.indices);
      const nmWeld = auditNonManByIndex(xyz, g.indices);
      const q = triangleQualityDistribution({ vertices: g.positions, indices: g.indices });
      // localize the worst-60 INTERIOR (seam-excluded) facets: wall (|hexCreaseD|→0) vs off-wall interior
      const worst = orderInt.slice(0, 60);
      let onSeam = 0, onWall = 0, interior = 0;
      const locSamples: string[] = [];
      for (const f of worst) {
        const a = g.indices[3 * f], b = g.indices[3 * f + 1], c = g.indices[3 * f + 2];
        let ua = g.ut[2 * a], ub = g.ut[2 * b], uc = g.ut[2 * c];
        if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
        const um = (ua + ub + uc) / 3, tm = (g.ut[2 * a + 1] + g.ut[2 * b + 1] + g.ut[2 * c + 1]) / 3;
        const uMod = um - Math.floor(um);
        const nearSeam = uMod < 1.5 / nU || uMod > 1 - 1.5 / nU;
        const cd = Math.abs(hexCreaseD(uMod, tm, HH_SCALE));
        if (nearSeam) onSeam++; else if (cd < 0.06) onWall++; else interior++;
        if (locSamples.length < 6) locSamples.push(`(u=${uMod.toFixed(4)},t=${tm.toFixed(3)},err=${sag.faceErr[f].toFixed(4)},|cD|=${cd.toFixed(3)}${nearSeam ? ',SEAM' : ''})`);
      }
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      plog(`[${nU}x${nT}] tris=${nF} true3D MAX(4pt)=${max.toFixed(5)} MAX(dense8)=${dense.max.toFixed(5)} out(>0.01)=${out} | INTERIOR(seam-excl) MAX(4pt)=${maxInt.toFixed(5)} MAX(dense8)=${denseInt.max.toFixed(5)} out=${outInt} | radMax=${rad.worstMm.toFixed(4)} | nonMan=${nm.nonMan} weldNonMan=${nmWeld} boundary=${nm.boundary} | %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)} | worst60int loc: wall=${onWall} interior=${interior} | ${secs}s`);
      plog(`   worst interior samples: ${locSamples.join(' ')}`);
      // heatmap for the moderate rung (visual evidence)
      if (nF <= 1_600_000) {
        dumpHeatmap(OUT_DIR, `base_${nU}x${nT}`, xyz, g.ut, g.indices, rA as never, H, { scaleMm: 0.05, preFilterMm: 0.004, meta: { rung: `${nU}x${nT}`, true3dMax: max, denseMax: dense.max, interiorMaxDense: denseInt.max } });
      }
      checkpoint({ key, nU, nT, tris: nF, true3dMax4: +max.toFixed(5), true3dMaxDense: +dense.max.toFixed(5), out, intMax4: +maxInt.toFixed(5), intMaxDense: +denseInt.max.toFixed(5), outInt, radMax: +rad.worstMm.toFixed(4), nonMan: nm.nonMan, weldNonMan: nmWeld, boundary: nm.boundary, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2), locWall: onWall, locInterior: interior });
    }
    plog('[baseline] DONE');
  }, 30 * 60 * 1000);

  // ── ARM: emitter — un-welded structured grid + explicit seam CURTAIN (the DS double-valued mechanism, vertical) ──
  // The baseline localized TWO residuals: (1) the density-INVARIANT non-periodic SEAM (welded 0.738), (2) the
  // density-responsive INTERIOR honeycomb. A structured emitter must bridge the seam step explicitly. This arm builds
  // the un-welded grid (nU+1 columns, col nU at θ=2π ≠ col 0 at θ=0) + a vertical seam-curtain quad strip, and
  // measures INTERIOR vs CURTAIN true-3D SEPARATELY — the curtain is the seam floor.
  it.skipIf(process.env.PF_HEXHIVE !== '1' || process.env.PF_HEXHIVE_ARM !== 'emitter')('un-welded grid + seam curtain: interior vs curtain true-3D + watertight + cert', () => {
    plog('=== ARM emitter ===');
    const rA = buildRadiusFn(STYLE, {} as StyleOptions, { H, Rb, Rt, expn }) as unknown as RA;
    const CASES: Array<[number, number, number]> = [ // [nU, nT, seamGrade] seamGrade=extra curtain subdivisions (0=flat)
      [2048, 512, 0], [2560, 640, 0], [2048, 512, 8],
    ];
    const only = process.env.PF_HEXHIVE_RUNG;
    for (const [nU, nT, seamGrade] of CASES) {
      const key = `emit|${nU}x${nT}g${seamGrade}`;
      if (only && only !== `${nU}x${nT}g${seamGrade}`) continue;
      if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
      const t0 = Date.now();
      // un-welded grid: columns 0..nU inclusive. col nU at θ=2π (the last honeycomb phase), col 0 at θ=0.
      const positions: number[] = [];
      const ut: number[] = [];
      const grid = new Int32Array(nT * (nU + 1));
      for (let j = 0; j < nT; j++) for (let i = 0; i <= nU; i++) {
        const u = i / nU, t = j / (nT - 1), th = TAU * u, z = t * H, r = rA(th, z);
        grid[j * (nU + 1) + i] = positions.length / 3;
        positions.push(r * Math.cos(th), r * Math.sin(th), z);
        ut.push(u, t);
      }
      const interiorIdx: number[] = [];
      for (let j = 0; j + 1 < nT; j++) for (let i = 0; i < nU; i++) {
        const a = grid[j * (nU + 1) + i], b = grid[j * (nU + 1) + i + 1], c = grid[(j + 1) * (nU + 1) + i + 1], d = grid[(j + 1) * (nU + 1) + i];
        interiorIdx.push(a, b, c, a, c, d);
      }
      // seam curtain: bridge col nU (θ=2π, r=rA(2π⁻,z)) ↔ col 0 (θ=0, r=rA(0,z)). seamGrade>0 inserts intermediate
      // radial rings (linear ρ interpolation at azimuth 0) — a graded curtain, to test if micro-stepping helps.
      const curtainIdx: number[] = [];
      const curtainVstart = positions.length / 3;
      // per row: build a ladder of (seamGrade) intermediate vertices at azimuth≈0 between colNU and col0.
      if (seamGrade > 0) {
        const mid = new Int32Array(nT * seamGrade);
        for (let j = 0; j < nT; j++) {
          const t = j / (nT - 1), z = t * H;
          const rHi = rA(TAU - 1e-7, z), rLo = rA(0, z);
          for (let m = 0; m < seamGrade; m++) {
            const f = (m + 1) / (seamGrade + 1);
            const rho = rHi + (rLo - rHi) * f;
            mid[j * seamGrade + m] = positions.length / 3;
            positions.push(rho, 0, z); ut.push(1 - f * 1e-9, t); // azimuth 0; tiny u to keep off exact seam wrap
          }
        }
        for (let j = 0; j + 1 < nT; j++) {
          const cols = [grid[j * (nU + 1) + nU], ...Array.from({ length: seamGrade }, (_, m) => mid[j * seamGrade + m]), grid[j * (nU + 1) + 0]];
          const colsN = [grid[(j + 1) * (nU + 1) + nU], ...Array.from({ length: seamGrade }, (_, m) => mid[(j + 1) * seamGrade + m]), grid[(j + 1) * (nU + 1) + 0]];
          for (let s = 0; s + 1 < cols.length; s++) {
            curtainIdx.push(cols[s], cols[s + 1], colsN[s + 1], cols[s], colsN[s + 1], colsN[s]);
          }
        }
      } else {
        for (let j = 0; j + 1 < nT; j++) {
          const a = grid[j * (nU + 1) + nU], b = grid[j * (nU + 1) + 0], c = grid[(j + 1) * (nU + 1) + 0], d = grid[(j + 1) * (nU + 1) + nU];
          curtainIdx.push(a, b, c, a, c, d);
        }
      }
      const allIdx = Uint32Array.from([...interiorIdx, ...curtainIdx]);
      const pos = Float32Array.from(positions);
      const xyz = lift(ut, rA);
      const nInt = interiorIdx.length / 3, nCurt = curtainIdx.length / 3, nF = allIdx.length / 3;
      // true-3D on the whole mesh, then split interior vs curtain by face index range
      const sag = perFaceTrue3DSag(ut, allIdx, rA as never, H, { preFilterMm: 0.004 });
      let maxInt = 0, outInt = 0, maxCurt = 0, outCurt = 0;
      for (let f = 0; f < nInt; f++) { const e = sag.faceErr[f]; if (e > maxInt) maxInt = e; if (e > 0.01) outInt++; }
      for (let f = nInt; f < nF; f++) { const e = sag.faceErr[f]; if (e > maxCurt) maxCurt = e; if (e > 0.01) outCurt++; }
      // dense confirm on the worst-300 of each class
      const intOrder = Array.from({ length: nInt }, (_, i) => i).sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 300);
      const curtOrder = Array.from({ length: nCurt }, (_, i) => nInt + i).sort((x, y) => sag.faceErr[y] - sag.faceErr[x]).slice(0, 300);
      const dInt = denseFacetTrue3DMax(ut, allIdx, xyz, rA, intOrder, 8);
      const dCurt = denseFacetTrue3DMax(ut, allIdx, xyz, rA, curtOrder, 8);
      const nm = nonManRawBigStats(allIdx);
      const nmWeld = auditNonManByIndex(xyz, allIdx);
      const q = triangleQualityDistribution({ vertices: pos, indices: allIdx });
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      plog(`[${key}] tris=${nF} (int=${nInt} curtain=${nCurt}) | INTERIOR true3D MAX=${dInt.max.toFixed(5)} out=${outInt} | CURTAIN true3D MAX=${dCurt.max.toFixed(5)} out=${outCurt} | WHOLE MAX=${Math.max(dInt.max, dCurt.max).toFixed(5)} | nonMan=${nm.nonMan} weldNonMan=${nmWeld} boundary=${nm.boundary} | %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)} | ${secs}s`);
      dumpHeatmap(OUT_DIR, `emit_${key.replace(/\|/g, '_')}`, xyz, ut, allIdx, rA as never, H, { scaleMm: 0.05, preFilterMm: 0.004, meta: { key, interiorMax: dInt.max, curtainMax: dCurt.max } });
      checkpoint({ key, nU, nT, seamGrade, tris: nF, nInt, nCurt, interiorMaxDense: +dInt.max.toFixed(5), outInt, curtainMaxDense: +dCurt.max.toFixed(5), outCurt, wholeMax: +Math.max(dInt.max, dCurt.max).toFixed(5), nonMan: nm.nonMan, weldNonMan: nmWeld, boundary: nm.boundary, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2) });
    }
    plog('[emitter] DONE');
  }, 30 * 60 * 1000);

  // ── ARM: cert — judge the STRUCTURE of a welded uniform grid (representative under-cap). Documents that HexHive's
  // grid STRUCTURE is judge-certifiable (campaign thesis) even though whole-mesh FIDELITY fails on the seam. IF the
  // seam step were out-of-scope (production welds the periodic seam), the interior grid would be a certifiable mesh.
  it.skipIf(process.env.PF_HEXHIVE !== '1' || process.env.PF_HEXHIVE_ARM !== 'cert')('judge-cert the welded uniform grid structure (representative under-cap)', () => {
    plog('=== ARM cert ===');
    const rA = buildRadiusFn(STYLE, {} as StyleOptions, { H, Rb, Rt, expn }) as unknown as RA;
    const nU = 1024, nT = 384; // 785k tris — under the 1.05M judge cap; structure is density-invariant.
    const g = buildUniformGrid(rA, nU, nT);
    const v = certifyPeriodicGridMesh(g.ut, g.indices, g.positions, nU, 0, rA, H, 20, { patchId: 'hexhive-uniform' });
    plog(`[cert] welded ${nU}x${nT} (${v.tris} tris) judge=${v.accepted ? 'ACCEPT' : 'REJECT'} maxδ=${v.maxDelta.toFixed(6)} wrap=${v.wrapTris} nonPos=${v.nonPosTris} nonGapStraddle=${v.nonGapStraddle} :: ${v.detail}`);
    checkpoint({ key: `cert|${nU}x${nT}`, nU, nT, tris: v.tris, accepted: v.accepted, maxDelta: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPos: v.nonPosTris, nonGapStraddle: v.nonGapStraddle });
    plog('[cert] DONE');
  }, 20 * 60 * 1000);
});
