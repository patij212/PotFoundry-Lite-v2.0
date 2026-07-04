// _pf_bamboo.test.ts — DEV-ONLY (env PF_BAMBOO=1). research/ ONLY; src/ NEVER imports this.
//
// STYLE: BambooSegments. Phase-3 of the doubled-RINGS program (E-2026-07-04-DCREST-BAMBOO recommended it):
// Bamboo's DOMINANT relief is a HORIZONTAL node-RING feature at each segment boundary t=k/5 (k=1..4). Verified
// recon: at each boundary there is BOTH (a) a SMOOTH steep Gaussian bulge (prominence*exp(-dfn²/2w²), peak at the
// boundary, ~4.5mm, steep in t) AND (b) a TRUE C0 radius STEP of ~1.47–1.68mm (θ-modulated) from
// asymVar=sin(floor(t*5)*7 + θ*3) which JUMPS when the segment integer increments. |dr/dz|→∞ at the step.
// The doubled-CREST (u-column) primitive was REFUTED (wrong axis, floored 0.026). This probe applies the PROVEN
// doubled-RINGS z-riser primitive: DOUBLE the ring at each boundary (ringBelow radius r(θ,z⁻), ringAbove radius
// r(θ,z⁺) at the SAME z ⇒ the C0 step is an explicit near-vertical RUNG = a chain of mesh edges ⇒ zero serration
// by construction) + z-GRADED smooth platform rows (clustered near the boundary to resolve the steep Gaussian
// flank; the DENSITY-RESPONSIVE lever). Because the step is θ-MODULATED (not a constant-z annulus), there is NO
// tread annulus — the rung is a direct ringBelow→ringAbove strip.
//
// METRIC DISCIPLINE: this is a NATIVE-3D mesh with a genuine z-discontinuity ⇒ the single-valued analytic-surface
// projection is BLIND at the step. The HONEST ruler is BVH-vs-CLOSED-OBJECT (facet 4-sample → nearest pt on a
// DENSE doubled-ring reference built with the SAME construction, graded). Reference is validated on-surface
// (refOnSurf must be « CAD_TOL) + BVH==brute. Serration = feature-ring true-curve → own mesh-edge distance (the
// node ring MUST be a mesh edge). rawNonMan by literal index. Two densities (fragility explicit).
//
// Reuses READ-ONLY: labkit + _sharp3dRef (buildRefLocator + RefMesh) + _sharp3dMesh (buildStructuredWall,
// evenThetas). Writes ONLY research/exchange/_pf_bamboo/. Env sub-gate + skip-if-row-exists ⇒ resumable / kill-safe.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex, vertErrColors, dumpRenderBins,
  perFaceChordSag,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildRefLocator, type RefMesh } from './_sharp3dRef';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;
const SERR_TOL = 0.001;
const DIR = join('research', 'exchange', '_pf_bamboo');
const NDJSON = join(DIR, 'scorecard.ndjson');
const NODE_COUNT = 5; // DEFAULT_BAMBOO_SEGMENTS.bsNodeCount
const BOUNDARIES = [1, 2, 3, 4].map((k) => k / NODE_COUNT); // interior node t=k/5 (t=0/1 = open rim)

const rowKey = (tag: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).tag === tag; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CHECKPOINT ${row.tag}] ${JSON.stringify(row)}`);
};
const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'progress.log'), `${new Date().toISOString()} ${msg}\n`); };

const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
/**
 * HYBRID true-3D per-face error. On a single-valued smooth facet the RADIAL own-(u,t) chord sag IS the true-3D
 * error (vertices lie exactly on rA); at a genuine z-STEP (rung facets) the own-(u,t) ruler is BLIND / spurious
 * (the rung's stored ut.t=boundary re-lifts at the WRONG one-sided radius), so those facets are re-scored by BVH
 * facet(4-sample)→nearest-point on the DENSE closed-3D reference (which INCLUDES the rung, using actual xyz).
 * Facets are routed by a radial-sag PREFILTER: sag ≤ preFilterMm ⇒ keep radial (true on smooth body, cheap);
 * sag > preFilterMm ⇒ BVH (rungs + steep flanks). Honest AND fast (BVH runs on ~the reddest few %).
 */
function metricHybrid(mesh: BuiltMesh, rA: (t: number, z: number) => number, loc: { dist: (x: number, y: number, z: number) => number }, preFilterMm: number): { worst: number; p99: number; over01: number; faceErr: Float64Array; nBvh: number } {
  const rad = perFaceChordSag(mesh.ut, mesh.idx, rA, H);
  const { xyz, idx, nF } = mesh; const faceErr = new Float64Array(nF); let nBvh = 0;
  for (let f = 0; f < nF; f++) {
    if (rad.faceErr[f] <= preFilterMm) { faceErr[f] = rad.faceErr[f]; continue; }
    nBvh++;
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let mx = 0;
    for (const [w0, w1, w2] of BARY) { const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz; const d = loc.dist(px, py, pz); if (d > mx) mx = d; }
    faceErr[f] = mx;
  }
  const s = Float64Array.from(faceErr).sort(); let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > CAD_TOL) over++;
  return { worst: s.length ? s[s.length - 1] : 0, p99: s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0, over01: over, faceErr, nBvh };
}
function auditNonManRaw(idx: Uint32Array): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < idx.length; k += 3) { const a = idx[k], b = idx[k + 1], c = idx[k + 2]; if (a === b || b === c || a === c) continue; for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); } }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}
function segPtDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}
/** node-ring serration: for each doubled ring row (ringBelow AND ringAbove), sample its own true curve at 2×
 * density; nearest distance to the row's own consecutive mesh edges. The C0 node-ring IS a mesh edge chain ⇒ 0. */
function ringSerration(rA: (t: number, z: number) => number, mesh: BuiltMesh, rows: RowSpec[]): number {
  let ser = 0;
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = mesh.rowStart[r], n = rows[r].thetas.length, rz = rows[r].rz, z = rows[r].z;
    for (let s = 0; s < n * 2; s++) {
      const th = TAU * (s / (n * 2)); const rr = rA(th, rz); const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      const c0 = Math.floor((th / TAU) * n); let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) { const c = ((c0 + dc) % n + n) % n; const cn = (c + 1) % n; const va = base + c, vb = base + cn;
        const d = segPtDist(px, py, pz, mesh.xyz[3 * va], mesh.xyz[3 * va + 1], mesh.xyz[3 * va + 2], mesh.xyz[3 * vb], mesh.xyz[3 * vb + 1], mesh.xyz[3 * vb + 2]); if (d < best) best = d; }
      if (best > ser) ser = best;
    }
  }
  return ser;
}

// 3D vertical speed |dS/dz| at (u,t), averaged over a few u (θ-modulated node ring ⇒ speed varies with θ).
function vSpeedMean(rA: (t: number, z: number) => number, t: number): number {
  let acc = 0; const nU = 24;
  for (let iu = 0; iu < nU; iu++) { const th = TAU * (iu / nU); const z0 = Math.max(0, t - 1e-4) * H, z1 = Math.min(1, t + 1e-4) * H; const r0 = rA(th, z0), r1 = rA(th, z1); acc += Math.hypot(r1 * Math.cos(th) - r0 * Math.cos(th), r1 * Math.sin(th) - r0 * Math.sin(th), z1 - z0) / (z1 - z0); }
  return acc / nU;
}
/**
 * ARC-LENGTH node row schedule (SLIVER-FREE + BOUNDED). Rows advance ~hRowMm in 3D per step (dt = hRowMm/speed) so
 * rows AUTO-CONCENTRATE on the steep node-ring Gaussian flank — but the per-step speed is CLAMPED to a ceiling
 * (spCeil ≈ hRowMm/dtFloor) so the near-vertical C0-adjacent flank cannot explode the row count to millions (the
 * step itself is the RUNG's job, not the sheet rows'). dt is also capped (hRowMm*capMul/H) so flat regions stay
 * chord-faithful. This keeps cells ~square (dz≈hRowMm≈θ-arc when nTh matched) ⇒ minAngle stays high (no slivers),
 * unlike raw msquareRows which drove dt→0 on the near-vertical flank (17.8M rows). At each interior node boundary
 * emit ringBelow(rz=z⁻)+ringAbove(rz=z⁺) at the SAME z ⇒ vertical rung = C0 step as a mesh edge (zero serration).
 */
function buildBambooRows(rA: (t: number, z: number) => number, nTh: number, hRowMm: number, speedBlend: number, dtFloorMul = 1): RowSpec[] {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const th = (): Float64Array => evenThetas(nTh);
  // arc-length rows with a SQUARE-CELL dt floor so the near-vertical flank stays bounded AND cells stay ~square
  // (aspect≈1 ⇒ minAngle high, no slivers): the flank concentrates rows down to dz≈θ-arc (=2π·r/nTh) and no finer
  // (finer dz than dθ would make tall-thin slivers — the 51%-<20 failure of the earlier cosine-clustered run).
  // The C0 step itself is the RUNG's job, not the sheet rows, so bounding the flank dz at θ-arc is correct.
  // dtFloorMul<1 (REFERENCE only) allows finer-than-square flank dz — a reference does not need good quality.
  const thetaArc = (TAU * 45) / nTh; // representative θ-arc at r≈45 (mm)
  const dtFloor = (thetaArc / H) * dtFloorMul; // square-cell floor ⇒ dz ≥ θ-arc on the flank (×mul for ref)
  const dtCap = hRowMm / H * 6;      // max row spacing in t (chord guard on flat regions)
  const ts: number[] = [0];
  let t = 0, guard = 0;
  while (t < 1 && guard++ < 500000) {
    const sp = Math.max(1e-6, vSpeedMean(rA, t));
    // finer where steep: dt = hRow/(H·sp^blend). blend∈(0,1]; then clamp to [dtFloor, dtCap].
    let dt = hRowMm / H / Math.pow(sp, speedBlend);
    if (dt < dtFloor) dt = dtFloor; if (dt > dtCap) dt = dtCap;
    t = Math.min(1, t + dt); ts.push(+t.toFixed(8));
  }
  // mandatory rows at ±birthWin around each node boundary so the rung splices between straddling sheet rows.
  const birthWin = 6e-4;
  for (const b of BOUNDARIES) { ts.push(+Math.max(0, b - birthWin).toFixed(8)); ts.push(+Math.min(1, b + birthWin).toFixed(8)); }
  const tsU = Array.from(new Set(ts)).filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b);
  for (let i = 0; i < tsU.length; i++) {
    const tt = tsU[i];
    if (i === 0) { rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' }); continue; }
    if (i === tsU.length - 1) { rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' }); continue; }
    rows.push({ z: tt * H, rz: tt * H, thetas: th(), kind: 'sheet' });
  }
  // inject the doubled RUNG at each node boundary (msquareRows already put sheet rows at ±birthWin around it).
  for (const b of BOUNDARIES) {
    const zb = b * H;
    // insert in z-order: find the two straddling sheet rows and splice the rung between them.
    let ins = rows.length;
    for (let i = 0; i < rows.length; i++) if (rows[i].z > zb) { ins = i; break; }
    rows.splice(ins, 0,
      { z: zb, rz: zb - zEps, thetas: th(), kind: 'ringBelow' },
      { z: zb, rz: zb + zEps, thetas: th(), kind: 'ringAbove' });
  }
  return rows;
}

/** DENSE reference RefMesh via the SAME construction but with a FINER flank floor (dtFloorMul<1) so the steep
 * Gaussian flank is over-resolved ⇒ refOnSurf « CAD_TOL (quality irrelevant for a reference). */
function buildBambooRef(rA: (t: number, z: number) => number, nTh: number, hRowMm: number, speedBlend: number, dtFloorMul: number): RefMesh {
  const rows = buildBambooRows(rA, nTh, hRowMm, speedBlend, dtFloorMul);
  const m = buildStructuredWall(rA, H, rows);
  return { xyz: m.xyz, idx: m.idx, nV: m.nV, nF: m.nF };
}

// two densities: [nTheta, hRowMm, speedBlend, tag, dump]. dtFloor=θ-arc/H ⇒ square cells (aspect≈1). Density lever
// = nTheta (finer θ-arc ⇒ finer flank dz too, since the floor tracks θ-arc) — resolves the steep flank + stays square.
const CONFIGS: Array<[number, number, number, string, boolean]> = [
  [1400, 0.08, 0.6, 'bs_c1400_sq', true],
  [2000, 0.06, 0.6, 'bs_c2000_sq', false],
];

describe('PF-BAMBOO-doubledRings', () => {
  it.skipIf(process.env.PF_BAMBOO !== '1')('BambooSegments: graded doubled-RINGS at node boundaries → BVH true-3D triple @2 densities', () => {
    const style: StyleId = 'BambooSegments';
    const rA = buildRadiusFn(style, {}, DIMS);
    const ringZs = BOUNDARIES.map((t) => t * H);
    // DENSE closed-3D reference via the SAME M-square construction (much finer hRow so the steep Gaussian flank is
    // resolved ⇒ low refOnSurf). Moderate θ so the BVH locator stays fast (only the reddest facets query it).
    // ref: nTh 1600 × flank floor 0.3×θ-arc (dz~0.053mm on flank) ⇒ fine reference (~7M faces; BVH only queries
    // prefiltered flank+rung facets, seconds). refOnSurf must read « CAD_TOL for the verdict to be trustworthy.
    const ref = buildBambooRef(rA, 1600, 0.05, 0.6, 0.3);
    const loc = buildRefLocator(ref, 2.0);
    plog(`ref built nF=${ref.nF}`);
    // validate: on-surface residual (open bands, off the step) + BVH==brute on perturbed pts.
    let refOnSurf = 0, hashErr = 0;
    for (let s = 0; s < 400; s++) { const th = TAU * Math.random(), z = H * (0.02 + 0.96 * Math.random());
      let near = false; for (const rz of ringZs) if (Math.abs(z - rz) < 0.03) near = true; if (near) continue;
      const r = rA(th, z); const d = loc.dist(r * Math.cos(th), r * Math.sin(th), z); if (d > refOnSurf) refOnSurf = d; }
    for (let s = 0; s < 80; s++) { const th = TAU * Math.random(), z = H * (0.02 + 0.96 * Math.random());
      const r = rA(th, z) + (Math.random() - 0.5) * 2; const px = r * Math.cos(th), py = r * Math.sin(th), pz = z + (Math.random() - 0.5) * 4;
      const e = Math.abs(loc.dist(px, py, pz) - loc.bruteDist(px, py, pz)); if (e > hashErr) hashErr = e; }
    plog(`ref validated refOnSurf=${refOnSurf.toFixed(4)} hashErr=${hashErr.toExponential(2)}`);

    for (const [nTh, hRow, blend, tag, dump] of CONFIGS) {
      if (rowKey(tag)) { plog(`${tag} row exists — skip`); continue; }
      const t0 = Date.now();
      const rows = buildBambooRows(rA, nTh, hRow, blend);
      const mesh = buildStructuredWall(rA, H, rows);
      plog(`${tag} built ${mesh.nF} tris (${Date.now() - t0}ms)`);
      const m = metricHybrid(mesh, rA, loc, 0.008);
      plog(`${tag} HYBRID p99=${m.p99.toFixed(4)} worst=${m.worst.toFixed(4)} over01=${m.over01} nBvh=${m.nBvh} (${Date.now() - t0}ms)`);
      const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
      const rawNM = auditNonManRaw(mesh.idx);
      const ser = ringSerration(rA, mesh, rows);
      plog(`${tag} q%<20=${q.pctBelow20.toFixed(1)} minAng=${q.minAngleDeg.toFixed(2)} rawNM=${rawNM} ser=${ser.toExponential(2)} (${Date.now() - t0}ms)`);
      if (dump) {
        const vertErr = new Float64Array(mesh.nV);
        for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
        dumpRenderBins(DIR, 'bamboo_heat', mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01),
          meta: { ruler: 'true3d-closed-object-BVH', label: `BambooSegments graded doubled-RINGS — 3D vs closed object (scale 0.01mm)`, worstMm: m.worst, p99Mm: m.p99, pctOver0_01: 100 * m.over01 / mesh.nF, scaleMm: 0.01 }, stl: true });
      }
      checkpoint({
        tag, style, axis: 'z-node-ring (Gaussian flank + C0 θ-modulated step)', primitive: 'SHARP3D M-square doubled-RINGS (rung, no annulus)',
        tris: mesh.nF, nTheta: nTh, hRowMm: hRow, speedBlend: blend,
        true3dP99Mm: +m.p99.toFixed(4), true3dMaxMm: +m.worst.toFixed(4), nAbove01: m.over01, nBvhScored: m.nBvh,
        serrationMm: +ser.toExponential(3), pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
        rawNonMan: rawNM, weldNonMan: auditNonManByIndex(mesh.xyz, mesh.idx),
        ruler: 'BVH-closed-object', refOnSurfMm: +refOnSurf.toFixed(4), bvhHashErrMm: +hashErr.toExponential(2),
        reaches: m.p99 <= CAD_TOL && ser <= SERR_TOL && rawNM === 0 && q.pctBelow20 < 10,
      });
    }
    expect(true).toBe(true);
  }, 1_800_000);
});
