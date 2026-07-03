// _gap_gsbss.test.ts — DEV-ONLY (PF_GAP_GSBSS=1 + per-style sub-gate). Close GeometricStar / BambooSegments /
// SpiralRidges toward honest true-3D perp ≤0.01mm vs the ACTUAL 3D object, %<20 ≤~5%, rawNonMan 0, at TWO
// densities each (density-fragility must be explicit).
//
// PRIOR ART (must not re-derive): E-2026-07-03-CLOSE-ZTILED scored these 3 on a dense M-square sheet:
//   GeometricStar 0.019 (anchored) — density-responsive strapwork C1 crease.
//   BambooSegments 0.114 (anchored) / 0.006 (radial own-region) — the 0.114 was CLAIMED to be an azimuthal-foot
//     overstatement. But E-2026-07-03-VERIFY-WEAVE caught EXACTLY this pattern on BasketWeave: a radial-own-region /
//     min() path hid a GENUINE 3D cliff-wall tail. So Bamboo's 0.114 MUST be cross-checked (density-variance +
//     gnOver receipt) before accepting it as an artifact.
//   SpiralRidges reaches001 was REFUTED (E-2026-07-03-VERIFY-THETA): the partner's honest field fell back to the
//     BODY-DILUTED whole-mesh radial p99 because bruteAnchoredRedPerp used redMm=0.1 > radialMax 0.015 ⇒ the anchor
//     NEVER FIRED. The honest brute-anchored worst-red tail (redMm 0.01) was 0.013 @3.29M, 0.041 @0.82M.
//
// HONEST RULER FIX (load-bearing): to measure the worst-red TAIL, bruteAnchoredRedPerp MUST use redMm AT/BELOW the
// target (here 0.008), so the anchor fires on the tail instead of falling back to the body-diluted radial p99. If
// nRed(redMm=0.008)==0 the mesh is genuinely <0.008 everywhere (a real pass, not a mask). trustedP99 is the honest
// worst-red tail; gnOver reports whether GN overstated (F2). radial own-region p99 reported as the on-surface screen.
//
// LEVER: density + crest/crease-targeted z-row grading (chordSteiner-depth analog: extra z-rows where the surface is
// most curved). GeometricStar's crease runs along θ (in-plane strapwork) ⇒ also θ-refine near strap edges.
//
// ISOLATION: NEW files only (_gap_gsbss*). Reuses _sharp3dMesh (buildStructuredWall/evenThetas) + labkit rulers
// READ-ONLY. Writes ONLY research/exchange/_gap_gsbss/. Per-style env sub-gate + row-exists skip ⇒ resumable.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex,
  perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp, bruteNearestOnRadialSurface,
  vertErrColors, dumpRenderBins, perFaceTrue3DSagAnchored,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';
import { buildStepReference, buildRefLocator, type StepRing } from './_sharp3dRef';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_gap_gsbss');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };

/**
 * RAW-INDEX non-manifold: undirected edges (literal index) shared by >2 tris. Non-vacuous watertight gate.
 * SORT-BASED (no giant Map — V8 Map caps at ~16.7M entries; a 5.7M-tri mesh has ~17M edges → RangeError).
 * Packs the (min,max) index pair into one Number key: nV<2^26.5 ⇒ min*2^27+max < 2^53 (exact). Sort + run-length.
 */
function auditNonManRaw(idx: ArrayLike<number>): number {
  const nE = idx.length; // 3 edges per tri = idx.length edges
  const keys = new Float64Array(nE);
  let w = 0;
  const SHIFT = 2 ** 27; // supports index up to ~1.3e8 (2^27) with exact Number pack (2^27 * 2^27 = 2^54 > 2^53!)
  // safer: use min*BIG+max with BIG=2^26 so product < 2^52; index cap 6.7e7 (fine for our meshes)
  const BIG = 2 ** 26;
  void SHIFT;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const lo = p < q ? p : q, hi = p < q ? q : p; keys[w++] = lo * BIG + hi; }
  }
  const arr = keys.subarray(0, w); arr.sort();
  let nm = 0, i = 0;
  while (i < w) { let j = i + 1; while (j < w && arr[j] === arr[i]) j++; if (j - i > 2) nm++; i = j; }
  return nm;
}
function p99(arr: ArrayLike<number>): number { const s = Float64Array.from(arr as ArrayLike<number>).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0; }

/**
 * Curvature-graded z-rows: place `nZ` rows in [0,H] with density proportional to |d²r/dz²| (crest/crease targeting,
 * the chordSteiner-depth analog). Falls back to uniform when the profile is flat. Always includes 0 and H.
 */
function gradedZ(rA: (t: number, z: number) => number, nZ: number, grade: number): number[] {
  if (grade <= 0) return Array.from({ length: nZ + 1 }, (_, j) => (H * j) / nZ);
  // sample curvature density along z at a fixed θ=0 (the profile is θ-varying; use max over a few θ for robustness)
  const NS = 2000; const dens = new Float64Array(NS + 1);
  const thetas = [0, TAU * 0.13, TAU * 0.37, TAU * 0.61, TAU * 0.83];
  const dz = H / NS;
  for (let i = 0; i <= NS; i++) {
    const z = H * (i / NS); let c = 0;
    for (const th of thetas) {
      const zm = Math.max(0, z - dz), zp = Math.min(H, z + dz);
      const r0 = rA(th, zm), r1 = rA(th, z), r2 = rA(th, zp);
      c = Math.max(c, Math.abs(r2 - 2 * r1 + r0));
    }
    dens[i] = 1 + grade * c; // base 1 + curvature boost
  }
  // cumulative density → inverse-CDF sampling for nZ intervals
  const cdf = new Float64Array(NS + 1);
  for (let i = 1; i <= NS; i++) cdf[i] = cdf[i - 1] + 0.5 * (dens[i] + dens[i - 1]);
  const total = cdf[NS];
  const zs: number[] = [0];
  let k = 0;
  for (let j = 1; j < nZ; j++) {
    const target = (total * j) / nZ;
    while (k < NS && cdf[k + 1] < target) k++;
    const seg = cdf[k + 1] - cdf[k] || 1; const frac = (target - cdf[k]) / seg;
    zs.push(H * ((k + frac) / NS));
  }
  zs.push(H);
  return zs;
}

/** Build a dense M-square sheet with graded z-rows and uniform θ (equal-count structured strip path). */
function buildSheet(rA: (t: number, z: number) => number, nTh: number, nZ: number, zGrade: number): BuiltMesh {
  const zs = gradedZ(rA, nZ, zGrade);
  const rows: RowSpec[] = zs.map((z) => ({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' as const }));
  return buildStructuredWall(rA, H, rows);
}

interface Cfg { nTh: number; nZ: number; zGrade: number; tag: string; dump?: boolean; }
interface Plan { style: string; env: string; cfgs: Cfg[]; }

// ─────── BambooSegments DOUBLED-RING: the honest fix for its genuine C0 segment-ring cliff (±1.38mm step at
// z=k·24) — double the ring at each boundary so the near-vertical step is an explicit TREAD strip (feature edge =
// mesh edge), measured BVH-vs-CLOSED-OBJECT (the analytic surface has a zero-width step ⇒ radial/GN blind there).
const BS_RING_ZS = [24, 48, 72, 96];
function buildBambooDoubled(rA: (t: number, z: number) => number, nTh: number, nZband: number, treadSub: number): { mesh: BuiltMesh; rows: RowSpec[] } {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const th = (): Float64Array => evenThetas(nTh);
  const pushBand = (z0: number, z1: number, n: number): void => { for (let i = 1; i < n; i++) { const z = z0 + (z1 - z0) * (i / n); rows.push({ z, rz: z, thetas: th(), kind: 'sheet' }); } };
  rows.push({ z: 0, rz: zEps, thetas: th(), kind: 'sheet' });
  let cursor = 0;
  for (const zb of BS_RING_ZS) {
    pushBand(cursor, zb, nZband);
    const rzIn = zb - zEps, rzOut = zb + zEps;
    rows.push({ z: zb, rz: rzIn, thetas: th(), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: zb, rz: zb, thetas: th(), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: zb, rz: rzOut, thetas: th(), kind: 'ringAbove' });
    cursor = zb;
  }
  pushBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(), kind: 'sheet' });
  return { mesh: buildStructuredWall(rA, H, rows), rows };
}

function scoreCfg(style: string, rA: (t: number, z: number) => number, c: Cfg): void {
  const key = `${style}_${c.tag}`;
  if (rowExists(key)) { plog(`${key}: exists — skip`); return; }
  const t0 = Date.now();
  plog(`${key}: building nTh=${c.nTh} nZ=${c.nZ} zGrade=${c.zGrade} ...`);
  const mesh = buildSheet(rA, c.nTh, c.nZ, c.zGrade);
  plog(`${key}: built ${mesh.nF} tris (${Date.now() - t0}ms)`);
  // RADIAL own-region chord (faithful for a structured on-surface mesh; vertices lie exactly on r(θ,z)).
  const radial = perFaceChordSag(mesh.ut, mesh.idx, rA, H);
  const radP99 = p99(radial.faceErr);
  plog(`${key}: radial done radP99=${radP99.toFixed(5)} radMax=${radial.worstMm.toFixed(4)} (${Date.now() - t0}ms)`);
  // RAW-GN true-3D whole-mesh p99 (facet→analytic surface) — catches a genuine 3D tail the radial own-region hides.
  const gn = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.004 });
  const gnP99 = p99(gn.faceErr); const gnMax = gn.worstMm;
  let gnOver01 = 0; for (let f = 0; f < mesh.nF; f++) if (gn.faceErr[f] > 0.01) gnOver01++;
  plog(`${key}: GN true-3D done gnP99=${gnP99.toFixed(5)} gnMax=${gnMax.toFixed(4)} over01=${gnOver01} (${Date.now() - t0}ms)`);
  // HONEST worst-red tail: anchor at redMm=0.008 (AT/BELOW target) so the tail is actually measured (the F2/verify
  // fix). Full-azimuth brute floor corrects GN wrong-well overstatement; gnOver reports the overstatement.
  const anch = bruteAnchoredRedPerp(mesh.ut, mesh.idx, rA, H, {
    redMm: 0.008, sampleN: 240, radial,
    coarse: { nTheta: 1536, nZ: 400 }, fine: { nTheta: 3072, nZ: 800 },
  });
  plog(`${key}: anchor done nRed=${anch.nRed} gnP99=${anch.gnP99.toFixed(5)} trustedP99=${anch.trustedP99.toFixed(5)} trustedMax=${anch.trustedMax.toFixed(5)} gnOver=${anch.gnOver} (${Date.now() - t0}ms)`);
  // ADVERSARIAL cross-check (the VERIFY-WEAVE method): select the worst facets by GN TRUE-3D (not radial) and
  // brute-floor their centroids full-azimuth. If these stay high, radial UNDER-selected a genuine 3D tail.
  let gnSelTrustedMax = 0, gnSelTrustedP99 = 0, gnSelStayHi = 0;
  {
    const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => gn.faceErr[y] - gn.faceErr[x]).slice(0, 120);
    const lift = (i: number): [number, number, number] => { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const ds: number[] = [];
    for (const f of order) {
      const [ax, ay, az] = lift(mesh.idx[3 * f]), [bx, by, bz] = lift(mesh.idx[3 * f + 1]), [cx2, cy2, cz2] = lift(mesh.idx[3 * f + 2]);
      const px = (ax + bx + cx2) / 3, py = (ay + by + cy2) / 3, pz = (az + bz + cz2) / 3;
      const d = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 3072, nZ: 800 }).dist;
      ds.push(d); if (d > 0.01) gnSelStayHi++;
    }
    ds.sort((a, b) => a - b);
    gnSelTrustedMax = ds.length ? ds[ds.length - 1] : 0;
    gnSelTrustedP99 = ds.length ? ds[Math.min(ds.length - 1, Math.floor(0.99 * ds.length))] : 0;
  }
  plog(`${key}: GN-SEL adversarial worst120: trustedMax=${gnSelTrustedMax.toFixed(5)} trustedP99=${gnSelTrustedP99.toFixed(5)} stayHi(>0.01)=${gnSelStayHi} (${Date.now() - t0}ms)`);
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx);
  const weldNM = auditNonManByIndex(mesh.xyz, mesh.idx);
  // honest verdict = MAX of (radial-anchored trusted worst-red p99) and (GN-SELECTED adversarial p99) — the latter
  // guards against radial UNDER-selecting a genuine 3D tail (the VERIFY-WEAVE BasketWeave trap). If no radial red
  // set AND GN-sel is clean ⇒ every facet <0.008 (a genuine pass, not a body-diluted mask).
  const anchP99 = anch.nRed > 0 ? anch.trustedP99 : radP99;
  const honest = Math.max(anchP99, gnSelTrustedP99);
  const honestMax = Math.max(anch.nRed > 0 ? anch.trustedMax : radial.worstMm, gnSelTrustedMax);

  if (c.dump) {
    try {
      const anSag = perFaceTrue3DSagAnchored(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.008, redMm: 0.02, topK: 80, coarse: { nTheta: 1024, nZ: 300 }, fine: { nTheta: 2048, nZ: 600 } });
      dumpRenderBins(DIR, `${style}_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(anSag.vertErr, 0.01),
        meta: { ruler: 'true3d-anchored', label: `${style} M-square (${c.tag}) — true-3D vs analytic surface (anchored, scale 0.01mm)`, worstMm: anSag.worstMm, p99Mm: gnP99, scaleMm: 0.01 }, stl: true });
      plog(`${key}: heatmap dumped`);
    } catch (e) { plog(`${key}: heatmap failed ${String(e)}`); }
  }
  checkpoint({
    key, style, tag: c.tag, tris: mesh.nF, nTh: c.nTh, nZ: c.nZ, zGrade: c.zGrade,
    honestTrue3dP99Mm: +honest.toFixed(5), honestTrue3dMaxMm: +honestMax.toFixed(5),
    radialP99Mm: +radP99.toFixed(5), radialMaxMm: +radial.worstMm.toFixed(5),
    gnWholeMeshP99Mm: +gnP99.toFixed(5), gnWholeMeshMaxMm: +gnMax.toFixed(4), gnOver01: gnOver01,
    anchorNRed: anch.nRed, anchorTrustedP99Mm: +anch.trustedP99.toFixed(5), anchorTrustedMaxMm: +anch.trustedMax.toFixed(5),
    anchorGnP99Mm: +anch.gnP99.toFixed(5), gnOverstatedCount: anch.gnOver,
    gnSelAdvTrustedMaxMm: +gnSelTrustedMax.toFixed(5), gnSelAdvTrustedP99Mm: +gnSelTrustedP99.toFixed(5), gnSelAdvStayHi: gnSelStayHi,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngleDeg: +q.medianMinAngleDeg.toFixed(1),
    rawNonMan: rawNM, weldNonMan: weldNM,
    reaches001: honest <= CAD_TOL && q.pctBelow20 < 5 && rawNM === 0,
    tookMs: Date.now() - t0,
  });
  expect(rawNM).toBe(0);
}

const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
function metricBVH(mesh: BuiltMesh, loc: { dist: (x: number, y: number, z: number) => number }): { worst: number; p99: number; over01: number; faceErr: Float64Array } {
  const { xyz, idx, nF } = mesh; const faceErr = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2], cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let mx = 0; for (const [w0, w1, w2] of BARY) { const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz; const d = loc.dist(px, py, pz); if (d > mx) mx = d; }
    faceErr[f] = mx;
  }
  const s = Float64Array.from(faceErr).sort(); let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > 0.01) over++;
  return { worst: s.length ? s[s.length - 1] : 0, p99: s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0, over01: over, faceErr };
}

// BambooSegments doubled-ring vs CLOSED-OBJECT reference (tread = real vertical wall). Two densities.
function scoreBambooDoubled(nTh: number, nZband: number, treadSub: number, tag: string, dump: boolean): void {
  const style = 'BambooSegments'; const key = `${style}_${tag}`;
  if (rowExists(key)) { plog(`${key}: exists — skip`); return; }
  const t0 = Date.now();
  const rA = buildRadiusFn(style as StyleId, {}, DIMS);
  const rings: StepRing[] = BS_RING_ZS.map((z) => ({ z, t: z / H, up: true }));
  // closed reference: doubled rings + dense sheet bands (the tread is a per-θ radial wall connecting r(θ,z∓eps)).
  const ref = buildStepReference(rA, H, rings, { nTheta: 1600, nZperBand: 30, zEps: 5e-4 });
  const loc = buildRefLocator(ref, 3.0);
  plog(`${key}: ref built nF=${ref.nF} (${Date.now() - t0}ms)`);
  const { mesh } = buildBambooDoubled(rA, nTh, nZband, treadSub);
  plog(`${key}: mesh built ${mesh.nF} tris (${Date.now() - t0}ms)`);
  const m = metricBVH(mesh, loc);
  plog(`${key}: BVH scored p99=${m.p99.toFixed(5)} worst=${m.worst.toFixed(5)} over01=${m.over01} (${Date.now() - t0}ms)`);
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx);
  const weldNM = auditNonManByIndex(mesh.xyz, mesh.idx);
  if (dump) {
    const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
    try { dumpRenderBins(DIR, `${style}_doubled_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01), meta: { ruler: 'true3d-closed-object', label: `${style} doubled-ring (${tag}) — 3D vs CLOSED object (scale 0.01mm)`, worstMm: m.worst, p99Mm: m.p99, scaleMm: 0.01 }, stl: true }); plog(`${key}: heatmap dumped`); } catch (e) { plog(`${key}: heatmap failed ${String(e)}`); }
  }
  checkpoint({
    key, style, tag, primitive: 'SHARP3D doubled-rings + treads', tris: mesh.nF, nTh, nZband, treadSub,
    honestTrue3dP99Mm: +m.p99.toFixed(5), honestTrue3dMaxMm: +m.worst.toFixed(5), nAbove01: m.over01,
    ruler: 'BVH-closed-object', refNF: ref.nF,
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngleDeg: +q.medianMinAngleDeg.toFixed(1),
    rawNonMan: rawNM, weldNonMan: weldNM,
    reaches001: m.p99 <= CAD_TOL && q.pctBelow20 < 5 && rawNM === 0, tookMs: Date.now() - t0,
  });
  expect(rawNM).toBe(0);
}

function runStyle(plan: Plan): void {
  describe(`GAP-GSBSS-${plan.style}`, () => {
    it.skipIf(process.env.PF_GAP_GSBSS !== '1' || process.env[plan.env] !== '1')(`${plan.style}: dense M-square (2 densities) → honest true-3D`, () => {
      mkdirSync(DIR, { recursive: true });
      const rA = buildRadiusFn(plan.style as StyleId, {}, DIMS);
      for (const c of plan.cfgs) scoreCfg(plan.style, rA, c);
      expect(existsSync(NDJSON)).toBeTruthy();
    }, 60 * 60 * 1000);
  });
}

// SpiralRidges: smooth helix; prior finest 0.013 @3.29M. FIDELITY crossed at graded-z (0.0065@2.5M) but %<20 was
// wrecked by skewed cells. M-SQUARE: circumference≈2π·45≈283mm, H=120 ⇒ nZ≈0.42·nTh for square cells; light zGrade.
runStyle({ style: 'SpiralRidges', env: 'PF_GAP_SR', cfgs: [
  { nTh: 1600, nZ: 680, zGrade: 6, tag: 'sr_c1600_z680_sq' },
  { nTh: 2200, nZ: 940, zGrade: 6, tag: 'sr_c2200_z940_sq', dump: true },
] });
// GeometricStar: in-plane strapwork crease (crease along θ); prior 0.019 @1.8M. M-square (nZ≈0.42·nTh) + light
// zGrade (crease is θ-varying but the profile also has z-structure). Two densities.
runStyle({ style: 'GeometricStar', env: 'PF_GAP_GS', cfgs: [
  { nTh: 2600, nZ: 1100, zGrade: 8, tag: 'gs_c2600_z1100_sq' },
  { nTh: 3400, nZ: 1440, zGrade: 8, tag: 'gs_c3400_z1440_sq', dump: true },
] });
// BambooSegments: segment-ring. The M-square sheet has a GENUINE density-INVARIANT true-3D tail (0.56mm, all-120
// stay-hi) = the C0 ±1.38mm segment-ring cliff (asymVar phase-jump at z=k·24), CONFIRMED by _bs_step_probe. So the
// dense sheet is the WRONG primitive (single-valued analytic step, wall floats ~half-step). Kept as evidence:
runStyle({ style: 'BambooSegments', env: 'PF_GAP_BS', cfgs: [
  { nTh: 900, nZ: 900, zGrade: 60, tag: 'bs_c900_z900_g60' },
  { nTh: 1400, nZ: 1600, zGrade: 60, tag: 'bs_c1400_z1600_g60', dump: true },
] });
// The HONEST FIX: DOUBLED-RING at each segment boundary (the cliff = explicit tread strip = mesh edge), measured
// BVH-vs-CLOSED-OBJECT. Two densities.
describe('GAP-GSBSS-BambooSegments-DOUBLED', () => {
  it.skipIf(process.env.PF_GAP_GSBSS !== '1' || process.env.PF_GAP_BSD !== '1')('BambooSegments doubled-ring vs closed object (2 densities)', () => {
    mkdirSync(DIR, { recursive: true });
    scoreBambooDoubled(900, 24, 6, 'bsd_c900_z24_ts6', false);
    scoreBambooDoubled(1400, 40, 8, 'bsd_c1400_z40_ts8', true);
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 60 * 60 * 1000);
});
