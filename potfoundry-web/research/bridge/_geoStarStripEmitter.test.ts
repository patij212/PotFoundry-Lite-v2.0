// _geoStarStripEmitter.test.ts — E-2026-07-22-GEOSTAR-STRIP-EMITTER (PF_GSSTRIP=1).
//
// GOAL (coordinator mandate, follows the NO-GO on free-Delaunay/aniso): PROTOTYPE + MEASURE the analytic STRUCTURED
// chevron-strip emitter (the DragonScales ring-strip / cone-fan analog) and decide whether GeometricStar reaches
// whole-mesh true-3D MAX ≤ 0.01 at PRODUCTION scale — where free-Delaunay + aniso FLOOR at ~0.06-0.09 on the chevron
// apex (E-2026-07-22-GEOSTAR-PROD-CLOSE).
//
// THE MECHANISM (crease-aligned structured grid — watertight BY CONSTRUCTION, no free-Delaunay, no recovery):
//   GeoStar strap field (default 8/0.05/0.5/4/0/1/0, edge=0.02): dStrap = √½·|W| − gap, W = |2a| + v = (π/2)·ζ + v,
//   where ζ = |frac| ∈ [0, 0.5] is the FOLDED angular position in a sector (frac = 8u − s − 0.5) and v = row-local
//   height. shift=0 ⇒ the radius is CONTINUOUS at every row boundary (C0-SLOPE kink, NOT a value cliff) ⇒ NO
//   double-valued wall is needed. THE strap walls (the near-vertical smoothstep ramp, the residual class) are LEVEL
//   SETS |W| ∈ [gap√2, (gap+edge)√2] = [0.0707, 0.0990] ⇒ in ζ they are the curves ζ = (±W − v)·2/π that SHEAR with v.
//   • COLUMNS follow the creases: per row v, an inverse-CDF ζ-schedule CLUSTERS columns onto the in-range walls (so
//     mesh edges sit ACROSS the ramp with the density right where the near-vertical wall is — dodging the isotropic
//     V-wall sliver trap AND the 80.7%-embed recovery wall the free-Delaunay conform hit). Columns SHEAR row-to-row to
//     track the moving walls (the crease-aligned "rows-along / columns-across" structure, sheared).
//   • ROWS across v resolve the along-wall curvature; DENSE near the apex v's (star-tip v=0 at ζ=0, chevron V-turn
//     v≈−0.785 at ζ=0.5) so a VERTEX lands on each apex + a fine ring around it (the crease-aligned fan-equivalent —
//     the apex is ON a grid line ζ∈{0,0.5}, so fine rows+cols meeting there resolve the corner edge-split/Steiner could not).
//   • WATERTIGHT weld BY POSITION: sectors periodic (ζ=0.5 boundary shared with the neighbour sector's mirror side),
//     sides mirror (ζ=0 ridge shared), bands weld at clean r0 rings (relief pinches to 0 at t=k/4; columns BLEND to a
//     uniform schedule as |v|→1 so adjacent bands' boundary rings match u-for-u), u-seam by u mod 1. Rims = t∈{0,1}.
//
// INSTRUMENT (same rigor as the NO-GO): whole-mesh true-3D MAX via perFaceTrue3DSag + a dense-continuous trusted MAX
// (min(same-(u,t) UB, GN) on top-K + one full-azimuth brute on the single worst — SEAM INCLUDED, GeoStar GN honest).
// p99, tris, %<20° (triangleQualityDistribution minAngle), nonMan (auditNonManByIndex, non-vacuous crack control).
// Cert via certAdapter.certifyPeriodicGridMesh (cut at a sector-boundary column ⇒ no triangle straddles the seam).
//
// KILL-CRITERION (pre-registered, committed BEFORE measuring):
//   CLOSE    iff whole-mesh true-3D MAX ≤ 0.01 AND p99 ≤ 0.01, nonMan 0, tris ≤ ~4M ⇒ GO, productionize the emitter.
//   FRONTIER iff MAX ∈ (0.01, 0.05] (mechanism works, residual named + tri cost — a perfectly good result).
//   NO-GO    iff MAX ≥ 0.05 OR density-invariant (MAX flat across the two densities ⇒ representation wall, not budget).
//   nonMan MUST be 0 (watertight by construction is the whole point) — a crack-injection control proves the audit non-vacuous.
//
// DEV-ONLY; research/ only; imports src READ-ONLY (buildRadiusFn via labkit; certAdapter). NO src edit, NO flag, NO commit.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { cpuUsage } from 'node:process';
import {
  triangleQualityDistribution, auditNonManByIndex, perFaceTrue3DSag,
  buildRadiusFn, projectPointToRadialSurface, bruteNearestOnRadialSurface, dumpHeatmap,
} from './labkit';
import type { StyleDims } from './labkit';
import { certifyPeriodicGridMesh } from './certAdapter';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const H = DIMS.H;
const TOL = 0.01;
const TAU = 2 * Math.PI;

// GeoStar defaults (DEFAULT_GEOMETRIC_STAR): points8 / gap0.05 / detail0.5 / layers4 / roundness0 / zoom1 / shift0.
const N_SECT = 8, N_LAYERS = 4;
const GAP = 0.05, EDGE = 0.02, DETAIL = 0.5;
const SA = Math.sin((0.2 + 0.6 * DETAIL) * (Math.PI / 2)); // = √½ at detail0.5
// strap wall |W| level sets: dStrap∈[0,edge] ⇔ √½|W|∈[gap,gap+edge] ⇔ |W|∈[gap/√½, (gap+edge)/√½].
const W_INNER = GAP / SA;            // 0.0707 — strap top edge
const W_OUTER = (GAP + EDGE) / SA;   // 0.0990 — base edge
const V_VTURN = -(Math.PI / 2) * 0.5 + 0; // W=0 at ζ=0.5 ⇒ v=-π/4; the strap-CENTER meets the sector boundary here
// apex v's to densify rows around: star-tip (strap center at ζ=0 ⇒ v=0) and the V-turn band where the walls cross ζ=0.5.
const V_APEXES = [0, (W_INNER - (Math.PI / 2) * 0.5), (-W_INNER - (Math.PI / 2) * 0.5), V_VTURN];

const OUT_DIR = join('research', 'exchange', '_geoStarStripEmitter');
const WIT = join(OUT_DIR, 'witness.ndjson');

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
  console.log(`[CP ${row.key as string}] ${JSON.stringify(row).slice(0, 520)}`);
}
function pct(sorted: Float64Array, q: number): number {
  return sorted.length ? +sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))].toFixed(6) : 0;
}
function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
/** unit gaussian exp(-x²). */
function gauss(x: number): number { return Math.exp(-x * x); }

const gsRadiusFn = (): ((theta: number, z: number) => number) => buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);

// ───────────────────────── the emitter ─────────────────────────
interface StripOpts {
  nCol: number;      // columns per side across [ζ=0 ridge .. ζ=0.5 sector-boundary]
  nRow: number;      // rows per band in v ∈ [-1, 1]
  bumpA: number;     // inverse-CDF density amplitude at each wall ζ
  bumpW: number;     // inverse-CDF density width (in ζ) at each wall
  blendLo: number;   // |v| ≤ blendLo ⇒ full crease warp; → uniform at |v|=1 (band-weld matching)
  rowApexA: number;  // row-density amplitude near apex v's
  rowApexW: number;  // row-density width (in v) near apex v's
}

/** Monotone inverse-CDF ζ-schedule on [0,0.5] for row v: base 1 + gaussian bumps at each in-range wall ζ; blended to
 *  uniform as |v|→1 so adjacent bands' boundary rings share u-columns. Always monotone + non-degenerate (base ≥ 1). */
function columnZetas(v: number, o: StripOpts): Float64Array {
  const M = 512;
  const walls: number[] = [];
  for (const W of [W_INNER, -W_INNER, W_OUTER, -W_OUTER]) {
    const z = (W - v) * 2 / Math.PI;
    if (z > 1e-4 && z < 0.5 - 1e-4) walls.push(z);
  }
  const cdf = new Float64Array(M + 1);
  let prev = 1;
  for (const zw of walls) prev += o.bumpA * gauss((0 - zw) / o.bumpW);
  for (let i = 1; i <= M; i++) {
    const z = 0.5 * i / M;
    let d = 1;
    for (const zw of walls) d += o.bumpA * gauss((z - zw) / o.bumpW);
    cdf[i] = cdf[i - 1] + 0.5 * (d + prev);
    prev = d;
  }
  const total = cdf[M];
  const crease = new Float64Array(o.nCol);
  crease[o.nCol - 1] = 0.5;
  let ii = 0;
  for (let j = 1; j < o.nCol - 1; j++) {
    const target = j / (o.nCol - 1) * total;
    while (ii < M && cdf[ii + 1] < target) ii++;
    const c0 = cdf[ii], c1 = cdf[ii + 1];
    const w = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
    crease[j] = 0.5 * (ii + w) / M;
  }
  // blend to uniform near the band boundaries |v|→1
  const b = smoothstep(1, o.blendLo, Math.abs(v)); // 1 at |v|≤blendLo, 0 at |v|=1
  const out = new Float64Array(o.nCol);
  for (let j = 0; j < o.nCol; j++) out[j] = b * crease[j] + (1 - b) * (0.5 * j / (o.nCol - 1));
  return out;
}

/** v-schedule per band: inverse-CDF over [-1,1] with gaussian bumps at the apex v's (star-tip + V-turn). Endpoints -1,1. */
function rowVs(o: StripOpts): Float64Array {
  const M = 1024;
  const cdf = new Float64Array(M + 1);
  const dens = (v: number): number => { let d = 1; for (const va of V_APEXES) d += o.rowApexA * gauss((v - va) / o.rowApexW); return d; };
  let prev = dens(-1);
  for (let i = 1; i <= M; i++) { const v = -1 + 2 * i / M; const d = dens(v); cdf[i] = cdf[i - 1] + 0.5 * (d + prev); prev = d; }
  const total = cdf[M];
  const out = new Float64Array(o.nRow + 1);
  out[0] = -1; out[o.nRow] = 1;
  let ii = 0;
  for (let j = 1; j < o.nRow; j++) {
    const target = j / o.nRow * total;
    while (ii < M && cdf[ii + 1] < target) ii++;
    const c0 = cdf[ii], c1 = cdf[ii + 1];
    const w = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
    out[j] = -1 + 2 * (ii + w) / M;
  }
  return out;
}

interface EmitMesh { vertices: Float32Array; indices: Uint32Array; ut: number[]; verts: number; }

/**
 * buildGeometricStarStripEmitter — the analytic structured chevron-strip wall. Sheared crease-aligned columns +
 * apex-dense rows, welded by position (u mod 1, t). Watertight open cylinder (rims at t=0,1). Lifts via rA (exact).
 */
function buildGeometricStarStripEmitter(rA: (th: number, z: number) => number, o: StripOpts): EmitMesh {
  const Q = 1e7;
  const posMap = new Map<string, number>();
  const positions: number[] = [];
  const ut: number[] = [];
  const getV = (uRaw: number, t: number): number => {
    let u = uRaw - Math.floor(uRaw); // u mod 1 (seam weld)
    if (u >= 1) u -= 1;
    const key = `${Math.round(u * Q)}_${Math.round(t * Q)}`;
    const hit = posMap.get(key);
    if (hit !== undefined) return hit;
    const th = TAU * u, z = t * H, r = rA(th, z);
    const id = positions.length / 3;
    positions.push(r * Math.cos(th), r * Math.sin(th), z);
    ut.push(u, t);
    posMap.set(key, id);
    return id;
  };
  const indices: number[] = [];
  // CCW-in-(u,t) triangle (seam-unwrapped u) so the cert's positive-area check passes.
  const pushTri = (a: number, b: number, c: number): void => {
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    const area2 = (ub - ua) * (tc - ta) - (uc - ua) * (tb - ta);
    if (area2 < 0) { indices.push(a, c, b); } else { indices.push(a, b, c); }
  };

  const vs = rowVs(o);
  const nRows = vs.length;
  // per band, per row: precompute the ζ-schedule once (shared across sectors/sides).
  for (let k = 0; k < N_LAYERS; k++) {
    // grid ids: [sector][side(0=-,1=+)][row][col]
    const grid: number[][][][] = [];
    for (let s = 0; s < N_SECT; s++) { grid[s] = [[], []]; for (let sd = 0; sd < 2; sd++) for (let i = 0; i < nRows; i++) grid[s][sd][i] = []; }
    for (let i = 0; i < nRows; i++) {
      const v = vs[i];
      const t = (v / 2 + k + 0.5) / N_LAYERS;
      const zeta = columnZetas(v, o);
      for (let s = 0; s < N_SECT; s++) {
        for (let sd = 0; sd < 2; sd++) {
          const sigma = sd === 0 ? -1 : 1;
          const rowIds = grid[s][sd][i];
          for (let j = 0; j < o.nCol; j++) {
            const frac = sigma * zeta[j];
            const u = (s + 0.5 + frac) / N_SECT;
            rowIds.push(getV(u, t));
          }
        }
      }
    }
    // quads within each (sector, side) patch
    for (let s = 0; s < N_SECT; s++) {
      for (let sd = 0; sd < 2; sd++) {
        for (let i = 0; i + 1 < nRows; i++) {
          const r0 = grid[s][sd][i], r1 = grid[s][sd][i + 1];
          for (let j = 0; j + 1 < o.nCol; j++) {
            const a = r0[j], b = r0[j + 1], c = r1[j + 1], d = r1[j];
            if (a === b || b === c || c === d || d === a || a === c || b === d) continue; // skip degenerate (collapsed columns)
            pushTri(a, b, c); pushTri(a, c, d);
          }
        }
      }
    }
  }
  return { vertices: new Float32Array(positions), indices: new Uint32Array(indices), ut, verts: positions.length / 3 };
}

// ───────────────────────── trusted continuous MAX (seam-included) ─────────────────────────
function trustedContinuousMax(
  ut: number[], idx: Uint32Array, rA: (th: number, z: number) => number, faceErr: Float64Array, K: number, Nn: number,
): { contMax: number; worstU: number; worstT: number; nOver: number } {
  const tris = idx.length / 3;
  const order = Array.from({ length: tris }, (_, f) => f).sort((x, y) => faceErr[y] - faceErr[x]).slice(0, Math.min(K, tris));
  const BARY: [number, number, number][] = [];
  for (let i = 0; i <= Nn; i++) for (let j = 0; j + i <= Nn; j++) BARY.push([i / Nn, j / Nn, (Nn - i - j) / Nn]);
  const lift = (u: number, t: number): [number, number, number] => { const th = TAU * u, z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  let contMax = 0, worstU = 0, worstT = 0, nOver = 0, gWx = 0, gWy = 0, gWz = 0, gWm = 0;
  for (const f of order) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
    const ta = ut[2 * a + 1], tb = ut[2 * b + 1], tc = ut[2 * c + 1];
    const A = lift(ua, ta), B = lift(ub, tb), Cc = lift(uc, tc);
    let sMax = 0, sx = 0, sy = 0, sz = 0, su = 0, st = 0;
    for (const [wa, wb, wc] of BARY) {
      const fx = wa * A[0] + wb * B[0] + wc * Cc[0], fy = wa * A[1] + wb * B[1] + wc * Cc[1], fz = wa * A[2] + wb * B[2] + wc * Cc[2];
      const um = wa * ua + wb * ub + wc * uc, tm = wa * ta + wb * tb + wc * tc;
      const S = lift(um, tm);
      const ub3 = Math.hypot(S[0] - fx, S[1] - fy, S[2] - fz);
      const gn = projectPointToRadialSurface(fx, fy, fz, rA).dist;
      const d = Math.min(ub3, gn);
      if (d > sMax) { sMax = d; sx = fx; sy = fy; sz = fz; su = um; st = tm; }
    }
    if (sMax > TOL) nOver++;
    if (sMax > contMax) { contMax = sMax; worstU = su - Math.floor(su); worstT = st; gWx = sx; gWy = sy; gWz = sz; gWm = sMax; }
  }
  if (gWm > TOL) contMax = Math.min(contMax, bruteNearestOnRadialSurface(gWx, gWy, gWz, rA, H, { nTheta: 4096, nZ: 1024 }).dist);
  return { contMax: +contMax.toFixed(6), worstU: +worstU.toFixed(5), worstT: +worstT.toFixed(5), nOver };
}

interface Arm { key: string; o: StripOpts; note: string; }
function makeArms(): Arm[] {
  const base: StripOpts = { nCol: 64, nRow: 96, bumpA: 40, bumpW: 0.006, blendLo: 0.9, rowApexA: 6, rowApexW: 0.05 };
  return [
    { key: 'strip|c64r96', o: base, note: 'screen density (crease-clustered cols + apex-dense rows)' },
    // ANTI-SLIVER sweep: shrink the per-row shear step (more rows) + gentler/wider column clustering so the wall
    // columns move slower than the column spacing (the sheared-column sliver-trap fix). Report MAX vs slivers.
    { key: 'strip|c48r200', o: { nCol: 48, nRow: 200, bumpA: 10, bumpW: 0.02, blendLo: 0.9, rowApexA: 1.5, rowApexW: 0.1 }, note: 'gentle cluster + many rows' },
    { key: 'strip|c64r320', o: { nCol: 64, nRow: 320, bumpA: 8, bumpW: 0.025, blendLo: 0.9, rowApexA: 1, rowApexW: 0.12 }, note: 'gentler cluster + 320 rows' },
    // JUNCTION-focused: strong ROW clustering at the apex/V-turn v's (fine rows CROSS the horizontal wall there, which
    // the along-wall columns cannot) + gentle columns. Tests whether the density-invariant junction residual is
    // row-resolution-limited (⇒ FRONTIER) or a genuine representation wall needing a turning strip + point-fan (⇒ NO-GO).
    { key: 'strip|c56r384j', o: { nCol: 56, nRow: 384, bumpA: 10, bumpW: 0.02, blendLo: 0.9, rowApexA: 8, rowApexW: 0.035 }, note: 'junction row-cluster (V-turn/star-tip)' },
  ];
}

function runArm(arm: Arm): Record<string, unknown> {
  const rA = gsRadiusFn();
  const t0 = Date.now(); const c0 = cpuUsage();
  const mesh = buildGeometricStarStripEmitter(rA, arm.o);
  const cpuMs = Math.round(cpuUsage(c0).user / 1000);
  const idx = mesh.indices, ut = mesh.ut, xyz = mesh.vertices;
  const tris = idx.length / 3;
  plog(`[${arm.key}] emitted ${tris} tris / ${mesh.verts} verts in ${((Date.now() - t0) / 1000).toFixed(1)}s (cpu ${cpuMs}ms)`);

  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nonMan = auditNonManByIndex(xyz, idx);
  // NON-VACUOUS control: append a DUPLICATE of triangle 0 ⇒ each of its 3 edges is now shared by >2 tris ⇒ nonMan MUST rise.
  const crackIdx = Uint32Array.from([...idx, idx[0], idx[1], idx[2]]);
  const nonManCrack = auditNonManByIndex(xyz, crackIdx);

  const tW = Date.now();
  const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.006 });
  const faceErr = sag.faceErr;
  const wDevs: number[] = []; let wWorst = 0, wOut = 0;
  for (let f = 0; f < tris; f++) { const e = faceErr[f]; wDevs.push(e); if (e > wWorst) wWorst = e; if (e > TOL) wOut++; }
  const wSorted = Float64Array.from(wDevs).sort();
  const witP99 = pct(wSorted, 0.99), witP999 = pct(wSorted, 0.999), witMax = +wWorst.toFixed(6);
  plog(`[${arm.key}][WITNESS] p99=${witP99} p99.9=${witP999} max=${witMax} out=${wOut}/${tris} in ${((Date.now() - tW) / 1000).toFixed(1)}s`);

  const tc = trustedContinuousMax(ut, idx, rA, faceErr, 400, 6);
  plog(`[${arm.key}][TRUSTED] denseContinuousMax=${tc.contMax} (>0.01 in top400: ${tc.nOver}) worst@ u=${tc.worstU} t=${tc.worstT}`);

  // CERT: cut at a sector-boundary column (u=0.5 ⇒ nU=8, cutColumn=4 ⇒ shift=0.5; a mesh column line ⇒ no straddle).
  let cert: Record<string, unknown> = { skipped: 'noCert or tris>cap' };
  if (process.env.PF_GSSTRIP_NOCERT !== '1' && tris <= 1_040_000) {
    try {
      const v = certifyPeriodicGridMesh(ut, idx, xyz, 8, 4, rA, H, 20, { patchId: 'geostarstrip', maxTriangles: 1_048_576 });
      cert = { accepted: v.accepted, maxDelta: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPosTris: v.nonPosTris, seamDup: v.seamDupCount, detail: v.detail.slice(0, 120) };
    } catch (e) { cert = { error: String(e).slice(0, 160) }; }
    plog(`[${arm.key}][CERT] ${JSON.stringify(cert)}`);
  } else { plog(`[${arm.key}][CERT] skipped (tris ${tris} > judge cap)`); }

  return {
    key: arm.key, note: arm.note, nCol: arm.o.nCol, nRow: arm.o.nRow, tris, verts: mesh.verts, cpuMs,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(3), p5MinAngleDeg: +q.p5MinAngleDeg.toFixed(2),
    nonMan, nonManCrack, witP99, witP999, witMax, witOut: wOut,
    denseContinuousMax: tc.contMax, nOverTop400: tc.nOver, worstU: tc.worstU, worstT: tc.worstT, cert,
  };
}

describe('GEOSTAR strip emitter — analytic structured chevron-strip wall (production dims)', () => {
  const arms = makeArms();
  for (const arm of arms) {
    it.skipIf(process.env.PF_GSSTRIP !== '1')(`ARM ${arm.key} — ${arm.note}`, () => {
      if (keyExists(WIT, arm.key)) { plog(`[skip] ${arm.key}`); return; }
      append(WIT, runArm(arm));
    }, 3_600_000);
  }

  it.skipIf(process.env.PF_GSSTRIP_RENDER !== '1')('RENDER strip true-3D heatmap', () => {
    const rA = gsRadiusFn();
    const arm = arms[0];
    const mesh = buildGeometricStarStripEmitter(rA, arm.o);
    const sag = dumpHeatmap(OUT_DIR, 'gsStrip', mesh.vertices, mesh.ut, mesh.indices, rA, H,
      { scaleMm: 0.05, preFilterMm: 0.006, stl: false, meta: { arm: arm.key, dims: 'H120/Rb45/Rt70/expn1.1' } });
    plog(`[RENDER gsStrip] tris=${mesh.indices.length / 3} worst=${sag.worstMm.toFixed(4)} p99>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)}%`);
  }, 3_600_000);
});
