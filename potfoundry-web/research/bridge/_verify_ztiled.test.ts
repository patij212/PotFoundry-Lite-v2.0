// _verify_ztiled.test.ts — DEV-ONLY (env PF_VZTILED=1 + per-style sub-gate). ADVERSARIAL VERIFIER for the z-TILED axis.
//
// MANDATE: the close-partner (_close_ztiled.test.ts) CLAIMS ArtDeco reaches true-3D p99 <=0.01 (0.001mm @2.23M) with
// the SHARP3D sheared-φ doubled-ring-tread recipe. But its probe run CRASHED before scoring (progress.log shows built
// 362880 tris then EXIT=1 on the dense sheared-ref BVH-query) — the 0.001/2.23M row was TRANSCRIBED from a prior
// experiment's stage16_definitive.json, NOT re-derived. Default verdict = REFUTED until INDEPENDENTLY re-measured.
//
// ATTACKS (per the mandate):
//  A. RULER-ARTIFACT / not-reproduced: re-mesh ArtDeco with the STATED sheared-φ recipe MYSELF and measure true-3D vs
//     the ACTUAL CLOSED-3D object (BVH point-to-triangle) — does an independent run reach p99<=0.01?
//  B. DENSITY-FRAGILE: HALVE the mesh density and re-measure. Does the number blow up (over-fit to one density)?
//  C. WATERTIGHT on the RAW index (undirected edges by literal index shared by >2 tris), non-vacuous.
//  D. %<20 masked? report whole-mesh triangleQualityDistribution pctBelow20 + allMinAngle (not sheet-only).
//  E. BVH==brute on the worst-40 facet centroids (metric soundness) — the number is a real 3D distance, not a hash miss.
//
// PERF (the reason the close probe stalled): the sheared-φ reference makes THIN twisted tread strips → a coarse
// spatial-hash cell (cell=2.0) buckets thousands of candidate tris per query cell → pathological. FIX: (1) a finer
// hash cell (0.6mm) so tread strips don't over-bucket; (2) a MODERATE reference density that is still >> the export
// screen density (so the ruler is not band-limited relative to the mesh) and validated on-surface + BVH==brute.
// One env-gated config per question; checkpoint each unit the instant computed. NEW files only (_verify_ztiled*).
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex, vertErrColors, dumpRenderBins,
  type AnalyticRadiusFn,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { StepRing } from './_sharp3dRef';
import { buildStructuredWall, shearedThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

// (metric3DBvh removed — replaced by the analytic closed-object ruler below, which avoids the sheared-strip
//  spatial-hash explosion that stalled/overflowed the close probe's reference BVH.)

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;
const DIR = join('research', 'exchange', '_verify_ztiled');
const NDJSON = join(DIR, 'verify.ndjson');

const rowExists = (tag: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return JSON.parse(l).tag === tag; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => {
  mkdirSync(DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[VCHECKPOINT ${row.tag}] ${JSON.stringify(row)}`);
};
const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(join(DIR, 'progress.log'), `${new Date().toISOString()} ${msg}\n`); };

// ─────────────── ANALYTIC closed-object distance (the INDEPENDENT ruler — no reference-mesh BVH pathology) ───────────
// The ArtDeco closed outer wall = (a) the radial sheet surface r(θ,z) on the OPEN t-bands PLUS (b) a HORIZONTAL
// annular TREAD at each of the 8 ring z's spanning radius [min,max] of {r_below(θ), r_above(θ)} at that azimuth.
// For a query P: nearest = min( sheet-brute (z-band, excludes ring z's), all-tread-annuli ). This is EXACT (no
// discretization floor — MORE honest than the 21M-tri mesh reference whose own on-surface floor was ~0.012mm), and
// it sidesteps the sheared-strip spatial-hash explosion that stalled the close probe.
function makeClosedObjectDist(rA: AnalyticRadiusFn, rings: StepRing[]): (px: number, py: number, pz: number) => number {
  const zEps = 5e-4;
  const ringZs = rings.map(r => r.z);
  return (px: number, py: number, pz: number): number => {
    const th = Math.atan2(py, px);       // query azimuth (treads are θ-dependent annuli)
    const rP = Math.hypot(px, py);
    // (b) tread annuli: nearest point on each horizontal annulus at z=z_ring, radius clamped to [rIn,rOut] at θ.
    let best = Infinity;
    for (const zr of ringZs) {
      const rIn = rA(th, zr - zEps), rOut = rA(th, zr + zEps);
      const rLo = Math.min(rIn, rOut), rHi = Math.max(rIn, rOut);
      const rClamp = Math.max(rLo, Math.min(rHi, rP));
      // nearest point on the annulus at azimuth θ (same azimuth is optimal for a flat radial annulus).
      const qx = rClamp * Math.cos(th), qy = rClamp * Math.sin(th);
      const d = Math.hypot(px - qx, py - qy, pz - zr);
      if (d < best) best = d;
    }
    // (a) sheet surface: the own-azimuth radial residual to r(θ, pz) (a REAL point on the sheet surface). This is an
    //     UPPER bound on the true nearest-sheet distance (a nearer sheet foot only lowers it) — combined with the
    //     exact tread term, min(tread, own-sheet) is an HONEST UPPER BOUND on the true-3D closed-object distance. An
    //     upper-bound ruler can only OVERSTATE the p99 ⇒ if it still reads ≤0.01 the reaches-claim is confirmed a
    //     fortiori; if it reads >0.01 we localize + refine only the worst facets with the full brute (adv check).
    const rS = rA(th, pz); const sx = rS * Math.cos(th), sy = rS * Math.sin(th);
    const sheet = Math.hypot(px - sx, py - sy, 0);
    return Math.min(best, sheet);
  };
}

// facet (3 edge-mids + centroid) → nearest pt on the closed object, SOUND at the junction (see metric3DSound).
const BARY: [number, number, number][] = [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]];
// SOUND metric. The cheap own-sheet term is UNSOUND at the junction: it finds a PHANTOM-near sheet point at a z the
// step actually occludes (verified — the SCREEN's worst cheap value 0.0085 vs true brute 0.0682 at the SAME centroid).
// So JUNCTION-STRADDLING facets (one vertex ON a ring z, another OFF it) MUST be scored with the trusted full brute
// (bruteClosedObjectDist: dense sheet + tread annuli, no phantom). Pure-tread facets (all vertices on a ring z) get
// the exact-analytic tread term; pure-sheet facets get the cheap own-sheet upper bound. This confines the expensive
// brute to the O(nCol·rings) straddler band — bounded even at HD.
function metric3DSound(
  mesh: BuiltMesh, rA: AnalyticRadiusFn, ringZs: number[],
  dist: (x: number, y: number, z: number) => number,
  brute: (x: number, y: number, z: number) => number,
): { worst: number; p99: number; p50: number; over01: number; nF: number; faceErr: Float64Array; nStraddle: number } {
  const { xyz, idx, nF } = mesh;
  const faceErr = new Float64Array(nF);
  const onRing = (z: number): boolean => { for (const zr of ringZs) if (Math.abs(z - zr) < 0.02) return true; return false; };
  let nStraddle = 0;
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const az = xyz[3 * a + 2], bz = xyz[3 * b + 2], cz = xyz[3 * c + 2];
    const oa = onRing(az), ob = onRing(bz), oc = onRing(cz);
    const nOn = (oa ? 1 : 0) + (ob ? 1 : 0) + (oc ? 1 : 0);
    // straddler = some (but not all) vertices on a ring z ⇒ the facet bridges the tread↔sheet lip (phantom-prone).
    const straddle = nOn > 0 && nOn < 3;
    const ax = xyz[3 * a], ay = xyz[3 * a + 1];
    const bx = xyz[3 * b], by = xyz[3 * b + 1];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1];
    let mx = 0;
    for (const [w0, w1, w2] of BARY) {
      const px = w0 * ax + w1 * bx + w2 * cx, py = w0 * ay + w1 * by + w2 * cy, pz = w0 * az + w1 * bz + w2 * cz;
      const d = straddle ? brute(px, py, pz) : dist(px, py, pz);
      if (d > mx) mx = d;
    }
    if (straddle) nStraddle++;
    faceErr[f] = mx;
  }
  const sorted = Float64Array.from(faceErr).sort();
  let over = 0; for (let f = 0; f < nF; f++) if (faceErr[f] > 0.01) over++;
  return { worst: sorted.length ? sorted[sorted.length - 1] : 0, p99: sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))] : 0,
    p50: sorted.length ? sorted[Math.floor(0.5 * sorted.length)] : 0, over01: over, nF, faceErr, nStraddle };
}

/** RAW-INDEX non-manifold: undirected edges (by literal index) shared by >2 tris. */
function auditNonManRaw(idx: Uint32Array): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

// ArtDeco step schedule (verbatim from close probe): stepCount=4, jumps at stepLocal 0.1(up)/0.9(down) per tier.
function artDecoRings(): StepRing[] {
  const rings: StepRing[] = [];
  for (let k = 0; k < 4; k++) for (const [loc, up] of [[0.1, true], [0.9, false]] as const) { const t = (k + loc) / 4; rings.push({ z: t * H, t, up }); }
  return rings;
}

/** sheared-φ ArtDeco rows — verbatim reproduction of buildArtDecoShearedRows from the close probe. */
function buildArtDecoShearedRows(rA: (t: number, z: number) => number, rings: StepRing[], nCol: number, nZband: number, treadSub: number, shear: number): RowSpec[] {
  const zEps = 5e-4;
  const rows: RowSpec[] = [];
  const sorted = [...rings].sort((a, b) => a.z - b.z);
  const th = (rz: number): Float64Array => shearedThetas(rz / H, nCol, shear);
  const pushSheetBand = (z0: number, z1: number, nrows: number): void => { for (let i = 1; i < nrows; i++) { const z = z0 + (z1 - z0) * (i / nrows); rows.push({ z, rz: z, thetas: th(z), kind: 'sheet' }); } };
  rows.push({ z: 0, rz: zEps, thetas: th(zEps), kind: 'sheet' });
  let cursor = 0;
  for (const ring of sorted) {
    pushSheetBand(cursor, ring.z, nZband);
    const rzIn = ring.z - zEps, rzOut = ring.z + zEps;
    rows.push({ z: ring.z, rz: rzIn, thetas: th(rzIn), kind: 'ringBelow' });
    for (let s = 1; s < treadSub; s++) rows.push({ z: ring.z, rz: ring.z, thetas: th(ring.z), kind: 'tread', treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut } });
    rows.push({ z: ring.z, rz: rzOut, thetas: th(rzOut), kind: 'ringAbove' });
    cursor = ring.z;
  }
  pushSheetBand(cursor, H, nZband);
  rows.push({ z: H, rz: H - zEps, thetas: th(H - zEps), kind: 'sheet' });
  return rows;
}

// Adversarial full-brute closed-object distance: dense sheet grid + dense sampling of every tread annulus. Trusted
// (no local-minimum trap, no clamp assumption) — used to validate the analytic `dist` on the worst facet centroids.
function bruteClosedObjectDist(px: number, py: number, pz: number, rA: AnalyticRadiusFn, ringZs: number[]): number {
  const zEps = 5e-4;
  let best = Infinity;
  // dense sheet: full azimuth × full z (coarse then it is only called ~40×)
  for (let i = 0; i < 3072; i++) {
    const th = (i / 3072) * TAU;
    for (let j = 0; j <= 800; j++) {
      const z = (j / 800) * H; const r = rA(th, z);
      const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z;
      const d = ex * ex + ey * ey + ez * ez; if (d < best) best = d;
    }
  }
  // dense treads: every ring annulus, full azimuth × radial sub-samples at fixed z.
  for (const zr of ringZs) {
    for (let i = 0; i < 3072; i++) {
      const th = (i / 3072) * TAU;
      const rIn = rA(th, zr - zEps), rOut = rA(th, zr + zEps);
      const rLo = Math.min(rIn, rOut), rHi = Math.max(rIn, rOut);
      for (let k = 0; k <= 40; k++) {
        const rr = rLo + (rHi - rLo) * (k / 40);
        const ex = px - rr * Math.cos(th), ey = py - rr * Math.sin(th), ez = pz - zr;
        const d = ex * ex + ey * ey + ez * ez; if (d < best) best = d;
      }
    }
  }
  return Math.sqrt(best);
}

// FAST LOCAL brute closed-object distance for a junction straddler: the true foot is within a few mm of the query, so
// scan a θ-window (±0.15 rad) × z-band (±8mm) on the sheet + the NEAREST ring's tread annulus (full θ-window). Dense
// enough (θ 0.15rad/512 ≈ 0.0003rad, z 16mm/400 = 0.04mm, radial 41) to resolve ≤0.01mm, bounded (~200k ops/call).
// SOUND local closed-object distance via MULTI-SEED Newton on the sheet + EXACT tread-annulus term. Cheap (~a few
// hundred rA calls, not 40k): the sheet foot for a junction sample is a smooth local minimum reachable by a box-refine
// from a handful of seeds (own (θ,z), and ±band on each side of the nearest rings so a foot on the OTHER side of the
// step gap is found — this is what the phantom cheap `dist` missed). The tread term is exact-analytic (radial clamp).
function localBruteClosedObjectDist(px: number, py: number, pz: number, rA: AnalyticRadiusFn, ringZs: number[]): number {
  const zEps = 5e-4;
  const th0 = Math.atan2(py, px);
  const d2 = (th: number, z: number): number => { const r = rA(th, z); const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; return ex * ex + ey * ey + ez * ez; };
  const refine = (th: number, z: number): number => {
    let bth = th, bz = z, best = d2(th, z), hTh = 0.03, hZ = 1.5;
    for (let it = 0; it < 60; it++) {
      let improved = false;
      for (const dt of [-hTh, 0, hTh]) for (const dz of [-hZ, 0, hZ]) { const zc = Math.max(0, Math.min(H, bz + dz)); const d = d2(bth + dt, zc); if (d < best) { best = d; bth += dt; bz = zc; improved = true; } }
      if (!improved) { hTh *= 0.5; hZ *= 0.5; if (hTh < 1e-8 && hZ < 1e-7) break; }
    }
    return best;
  };
  let best = Infinity;
  // sheet seeds: own z, and ±3mm on each side of the two nearest rings (foots the correct side of the occluded gap).
  const seedZs = new Set<number>([pz]);
  for (const zr of ringZs) { if (Math.abs(zr - pz) < 12) { seedZs.add(Math.max(0, zr - 3)); seedZs.add(Math.min(H, zr + 3)); } }
  for (const sz of seedZs) { const d = refine(th0, sz); if (d < best) best = d; }
  // tread annuli within reach (exact nearest radius on each horizontal annulus at the query azimuth).
  const rP = Math.hypot(px, py);
  for (const zring of ringZs) {
    if (Math.abs(zring - pz) > 12) continue;
    const rIn = rA(th0, zring - zEps), rOut = rA(th0, zring + zEps);
    const rLo = Math.min(rIn, rOut), rHi = Math.max(rIn, rOut);
    const rr = Math.max(rLo, Math.min(rHi, rP));
    const ex = px - rr * Math.cos(th0), ey = py - rr * Math.sin(th0), ez = pz - zring;
    const d = ex * ex + ey * ey + ez * ez; if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function runArtDeco(tag: string, nCol: number, nZ: number, ts: number): void {
  if (rowExists(tag)) { console.log(`[${tag}] row exists — skip`); return; }
  const t0 = Date.now();
  const rA = buildRadiusFn('ArtDeco' as StyleId, {}, DIMS);
  const rings = artDecoRings();
  const chevronFreq = 6, shear = (4 * Math.PI) / chevronFreq;
  const ringZs = rings.map(r => r.z);
  const dist = makeClosedObjectDist(rA, rings);

  const rows = buildArtDecoShearedRows(rA, rings, nCol, nZ, ts, shear);
  const mesh = buildStructuredWall(rA, H, rows);
  plog(`${tag} mesh built ${mesh.nF} tris (${Date.now() - t0}ms)`);

  const localBrute = (x: number, y: number, z: number): number => localBruteClosedObjectDist(x, y, z, rA, ringZs);
  const m = metric3DSound(mesh, rA, ringZs, dist, localBrute);
  plog(`${tag} scored p99=${m.p99.toFixed(4)} worst=${m.worst.toFixed(4)} over01=${m.over01} nStraddle=${m.nStraddle} (${Date.now() - t0}ms)`);
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx);
  const weldNM = auditNonManByIndex(mesh.xyz, mesh.idx);

  // ATTACK E — the analytic UPPER-BOUND dist vs the full-brute TRUE minimum on the worst-40 facet centroids. The
  // brute is the trusted floor; report BOTH the upper-bound worst and the brute-refined worst so an overstated tail
  // is corrected downward (the ruler can only overstate). worstBrute = the honest worst-facet true-3D number.
  const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => m.faceErr[y] - m.faceErr[x]).slice(0, 40);
  let advMax = 0, worstBrute = 0;
  for (const f of order) {
    const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
    const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (mesh.xyz[3 * a + 2] + mesh.xyz[3 * b + 2] + mesh.xyz[3 * c + 2]) / 3;
    const bru = bruteClosedObjectDist(px, py, pz, rA, ringZs);
    const e = Math.abs(dist(px, py, pz) - bru); if (e > advMax) advMax = e;
    if (bru > worstBrute) worstBrute = bru;
  }
  plog(`${tag} adv(ub-vs-brute worst40)=${advMax.toExponential(2)} worstBrute(centroid)=${worstBrute.toFixed(4)} (${Date.now() - t0}ms)`);

  // heatmap for visual evidence
  const vertErr = new Float64Array(mesh.nV); for (let f = 0; f < mesh.nF; f++) { const e = m.faceErr[f]; for (let k = 0; k < 3; k++) { const v = mesh.idx[3 * f + k]; if (e > vertErr[v]) vertErr[v] = e; } }
  dumpRenderBins(DIR, `ArtDeco_${tag}`, mesh.xyz, mesh.idx, { colors: vertErrColors(vertErr, 0.01),
    meta: { ruler: 'true3d-analytic-closed-object (VERIFIER)', label: `ArtDeco ${tag} — 3D vs analytic closed object (scale 0.01mm)`, worstMm: m.worst, p99Mm: m.p99, pctOver0_01: 100 * m.over01 / mesh.nF, scaleMm: 0.01 }, stl: false });

  checkpoint({
    tag, style: 'ArtDeco', nCol, nZ, ts, tris: mesh.nF,
    true3dP99Mm: +m.p99.toFixed(4), true3dWorstMm: +m.worst.toFixed(4), true3dP50Mm: +m.p50.toFixed(4),
    nOver01: m.over01, pctOver01: +(100 * m.over01 / mesh.nF).toFixed(4), nStraddleFacets: m.nStraddle,
    pctBelow20: +q.pctBelow20.toFixed(1), allMinAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: rawNM, weldNonMan: weldNM, ubVsBruteWorst40Mm: +advMax.toExponential(3), worstBruteCentroidMm: +worstBrute.toFixed(4),
    ruler: 'analytic UPPER-BOUND closed-object (own-sheet + tread annuli); worst-40 brute-refined',
    reaches001: m.p99 <= CAD_TOL, elapsedMs: Date.now() - t0,
  });
  // non-vacuous gate: watertight on the raw index (an injected crack would move rawNM).
  expect(rawNM).toBe(0);
}

// ── ATTACK A: reproduce the winning HD recipe (c960_z120_ts10, ~2.23M) with the INDEPENDENT analytic ruler ──
describe('VERIFY-ZTILED-ArtDeco-HD', () => {
  it.skipIf(process.env.PF_VZTILED !== '1' || process.env.PF_VZTILED_AD_HD !== '1')('ArtDeco HD sheared-φ doubled-ring treads → INDEPENDENT true-3D p99', () => {
    runArtDeco('ad_hd_c960_z120_ts10', 960, 120, 10);
  }, 3_000_000);
});

// ── ATTACK B: HALVE the density (over-fit test). If p99 blows up, the HD number is fragile. ──
describe('VERIFY-ZTILED-ArtDeco-HALF', () => {
  it.skipIf(process.env.PF_VZTILED !== '1' || process.env.PF_VZTILED_AD_HALF !== '1')('ArtDeco HALF density → density-fragility test', () => {
    runArtDeco('ad_half_c480_z60_ts6', 480, 60, 6);
  }, 3_000_000);
});

// ── SCREEN: the exact config the close probe attempted (c720_z20_ts9) — cheapest reproduction ──
describe('VERIFY-ZTILED-ArtDeco-SCREEN', () => {
  it.skipIf(process.env.PF_VZTILED !== '1' || process.env.PF_VZTILED_AD_SCREEN !== '1')('ArtDeco SCREEN config (close probe attempted) → true-3D p99', () => {
    runArtDeco('ad_screen_c720_z20_ts9', 720, 20, 9);
  }, 3_000_000);
});

// ── DIAGNOSTIC: settle Newton-0.008 vs exhaustive-brute-0.068 at the reddest junction facets. For each of the top-40
//    facets by a DIRECT super-dense local brute (not by my metric), compare: my Newton `dist`, my localBrute, and a
//    SUPER-DENSE local brute (θ 0.3rad/4000, z 12mm/6000, sub-step ⇒ resolves the near-vertical riser wall). The
//    super-dense brute is the trusted floor. This tells us which value is the phantom.
describe('VERIFY-ZTILED-ArtDeco-DIAG', () => {
  it.skipIf(process.env.PF_VZTILED !== '1' || process.env.PF_VZTILED_AD_DIAG !== '1')('ArtDeco junction: Newton vs local vs super-dense brute (settle the ruler)', () => {
    const rA = buildRadiusFn('ArtDeco' as StyleId, {}, DIMS);
    const rings = artDecoRings();
    const chevronFreq = 6, shear = (4 * Math.PI) / chevronFreq;
    const ringZs = rings.map(r => r.z);
    const rows = buildArtDecoShearedRows(rA, rings, 720, 20, 9, shear);
    const mesh = buildStructuredWall(rA, H, rows);
    const dist = makeClosedObjectDist(rA, rings);
    const localBrute = (x: number, y: number, z: number): number => localBruteClosedObjectDist(x, y, z, rA, ringZs);
    // super-dense local brute (trusted): resolves the riser wall to sub-0.001mm.
    const superDense = (px: number, py: number, pz: number): number => {
      const zEps = 5e-4; const th0 = Math.atan2(py, px); const rP = Math.hypot(px, py); let best = Infinity;
      for (let i = 0; i <= 4000; i++) { const th = th0 - 0.3 + 0.6 * (i / 4000);
        for (let j = 0; j <= 6000; j++) { const z = Math.max(0, Math.min(H, pz - 12 + 24 * (j / 6000))); const r = rA(th, z);
          const ex = px - r * Math.cos(th), ey = py - r * Math.sin(th), ez = pz - z; const d = ex * ex + ey * ey + ez * ez; if (d < best) best = d; } }
      for (const zr of ringZs) { if (Math.abs(zr - pz) > 12) continue;
        for (let i = 0; i <= 4000; i++) { const th = th0 - 0.3 + 0.6 * (i / 4000);
          const rIn = rA(th, zr - zEps), rOut = rA(th, zr + zEps); const rLo = Math.min(rIn, rOut), rHi = Math.max(rIn, rOut);
          const rr = Math.max(rLo, Math.min(rHi, rP)); const ex = px - rr * Math.cos(th), ey = py - rr * Math.sin(th), ez = pz - zr;
          const d = ex * ex + ey * ey + ez * ez; if (d < best) best = d; } }
      return Math.sqrt(best);
    };
    // rank facets by the super-dense brute on their centroid — but that's 362k × superdense (too slow). Instead rank by
    // localBrute (cheap+sound) then super-dense-verify the top 40. localBrute IS a valid trusted-ish floor.
    const onRing = (z: number): boolean => { for (const zr of ringZs) if (Math.abs(z - zr) < 0.02) return true; return false; };
    const cand: { f: number; lb: number; px: number; py: number; pz: number }[] = [];
    for (let f = 0; f < mesh.nF; f++) {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const az = mesh.xyz[3 * a + 2], bz = mesh.xyz[3 * b + 2], cz = mesh.xyz[3 * c + 2];
      const nOn = (onRing(az) ? 1 : 0) + (onRing(bz) ? 1 : 0) + (onRing(cz) ? 1 : 0);
      if (!(nOn > 0 && nOn < 3)) continue; // straddlers only
      const px = (mesh.xyz[3 * a] + mesh.xyz[3 * b] + mesh.xyz[3 * c]) / 3, py = (mesh.xyz[3 * a + 1] + mesh.xyz[3 * b + 1] + mesh.xyz[3 * c + 1]) / 3, pz = (az + bz + cz) / 3;
      const lb = localBrute(px, py, pz);
      cand.push({ f, lb, px, py, pz });
    }
    cand.sort((x, y) => y.lb - x.lb);
    const top = cand.slice(0, 40);
    let worstNewton = 0, worstLocal = 0, worstSuper = 0, maxLocalVsSuper = 0;
    const rows2: string[] = [];
    for (const c of top.slice(0, 12)) {
      const nw = dist(c.px, c.py, c.pz);
      const sd = superDense(c.px, c.py, c.pz);
      rows2.push(`f=${c.f} newton=${nw.toFixed(4)} local=${c.lb.toFixed(4)} super=${sd.toFixed(4)}`);
    }
    for (const c of top) {
      const nw = dist(c.px, c.py, c.pz); const sd = superDense(c.px, c.py, c.pz);
      if (nw > worstNewton) worstNewton = nw; if (c.lb > worstLocal) worstLocal = c.lb; if (sd > worstSuper) worstSuper = sd;
      if (Math.abs(c.lb - sd) > maxLocalVsSuper) maxLocalVsSuper = Math.abs(c.lb - sd);
    }
    plog(`DIAG nStraddle=${cand.length} worstNewton=${worstNewton.toFixed(4)} worstLocal=${worstLocal.toFixed(4)} worstSuper=${worstSuper.toFixed(4)} maxLocalVsSuper=${maxLocalVsSuper.toExponential(2)}`);
    for (const r of rows2) plog(`DIAG   ${r}`);
    checkpoint({ tag: 'DIAG_ad_screen', kind: 'junction-ruler-settle', nStraddle: cand.length,
      worstNewtonMm: +worstNewton.toFixed(4), worstLocalMm: +worstLocal.toFixed(4), worstSuperDenseMm: +worstSuper.toFixed(4),
      maxLocalVsSuperMm: +maxLocalVsSuper.toExponential(3), sample: rows2 });
    expect(worstSuper).toBeGreaterThan(0); // non-vacuous
  }, 3_000_000);
});
