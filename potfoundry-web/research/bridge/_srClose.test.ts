// _srClose.test.ts — DEV-ONLY (PF_SRCLOSE=1 + per-arm sub-gate). Prototype a SpiralRidges PRODUCTION mesh that hits
// honest true-3D perp <=0.01mm on the MAX (0 outliers), watertight, low-sliver, at PRODUCTION scale
// (DEFAULT_DIMENSIONS: OD140/H120 => H120/Rt70/Rb45/expn1.1) + registry-default SpiralRidges params.
// Mirrors the DragonScales vertical slice (whole outer-wall mesh <=0.01 + watertight + judge-cert scope).
//
// PRIOR ART (must not re-derive — grep EXPERIMENT-REGISTRY.md):
//   E-2026-07-03-CLOSE-THETA claimed p99 0.0046 but the redMm=0.1 brute anchor NEVER FIRED (radialMax 0.015<0.1) =>
//     it was a BODY-DILUTED whole-mesh radial p99, not the honest tail.
//   E-2026-07-03-VERIFY-THETA REFUTED that: honest brute-anchored worst-red p99 (redMm=0.01) = 0.013 @3.29M,
//     DENSITY-FRAGILE 0.041 @0.82M — the skewed-cell config.
//   E-2026-07-03-GAP-GSBSS OVERTURNED it: SQUARE-cell M-square (buildStructuredWall, uniform-theta + graded-z) at
//     GENTLE dims {H120,Rb40,Rt50,expn1}: 2.18M => true-3D MAX 0.0072 / 4.14M => true-3D MAX 0.0038, nRed(0.008)=0,
//     %<20=0, minAngle>20, rawNonMan 0. reaches001=true. But that was the GENTLE pot.
//   E-2026-07-08 PROD-ARTIFACT-TRUTH: the PRODUCTION conforming mesher (ParametricExportComputer, band-limited
//     sampler) at production defaults regressed to true-3D 0.0358->0.0239 Newton, worst locus t~=0.98 near-rim
//     crest-aliasing tail. That is a DIFFERENT mesher; here we drive the RESEARCH kernels at production scale.
//
// THE PRODUCTION-SCALE GAP: production Rt70/Rb45 (vs gentle Rt50/Rb40) has ~40% larger radii => the ridge amplitude
// (amp*r0, amp<=0.25) is ~40% larger in absolute mm => ~40% higher surface curvature + ~40% more surface area. So
// the gentle-dim tri budget will NOT transfer 1:1 — this probe MEASURES how much density production needs.
//
// METRIC DISCIPLINE (labkit): VERDICT ruler = perFaceTrue3DSag (facet->NEAREST surface). Certify on the MAX (0
// outliers), NOT p99 alone (the 2026-07-20 DS lesson: p99 hid a 12x tip-cone tail). radial (perFaceChordSag) is a
// screen + the red-set source. Honest tail = bruteAnchoredRedPerp(redMm=0.008) so the anchor FIRES (the VERIFY fix).
// GN-SELECTED adversarial worst-K brute floor guards against the ruler UNDER-selecting a genuine 3D tail
// (the VERIFY-WEAVE BasketWeave trap). Watertight = nonManRawBigStats (raw-index, large-mesh-safe; boundary = the
// two open rim rings = 2*nTheta, the outer-wall attachment boundary, NOT a crack). Slivers = triangleQualityDistribution.
//
// ISOLATION: NEW files only (_srClose*). Reuses _sharp3dMesh (buildStructuredWall/evenThetas) + inhouseMetricMesh +
// labkit rulers READ-ONLY. Writes ONLY research/exchange/_srclose/. Per-arm env sub-gate + per-config rowExists skip
// => resumable across the kills. NO src/ or kernel/labkit edit.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh,
  perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp, bruteNearestOnRadialSurface,
  triangleQualityDistribution, nonManRawBigStats, auditNonManByIndex,
  vertErrColors, dumpRenderBins, perFaceTrue3DSagAnchored,
  type ChordSagResult,
} from './labkit';
import { DEFAULT_SPIRAL, type StyleId } from '../../src/geometry/types';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
// PRODUCTION scale — DEFAULT_DIMENSIONS (OD140 => Rt70, OD90 base => Rb45, H120, expn1.1). StyleDims={H,Rb,Rt,expn}.
const DIMS: StyleDims = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const H = DIMS.H;
const CAD = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_srclose');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return (JSON.parse(l) as { key?: string }).key === key; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${String(row.key)}] ${JSON.stringify(row)}`); };
const p99 = (arr: ArrayLike<number>): number => { const s = Float64Array.from(arr as ArrayLike<number>).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0; };
const countOver = (arr: Float64Array, mm: number): number => { let o = 0; for (let i = 0; i < arr.length; i++) if (arr[i] > mm) o++; return o; };

// ── SpiralRidges primary-ridge phase (for localization): primaryArg = k*theta + TAU*turns*t. Chord sag PEAKS at
// max |curvature| = crest/trough (|sin| max => primaryArg near pi/2 + n*pi). distToExtremum in [0, pi/2].
const K = DEFAULT_SPIRAL.spiralK, TURNS = DEFAULT_SPIRAL.spiralTurns;
const distToExtremum = (u: number, t: number): number => {
  const arg = K * (TAU * u) + TAU * TURNS * t;
  const m = ((arg - Math.PI / 2) % Math.PI + Math.PI) % Math.PI; // dist to nearest pi/2 + n*pi, folded to [0,pi)
  return Math.min(m, Math.PI - m);
};

// ── graded-z rows: density ~ |d2r/dz2| (crest/crease targeting). grade<=0 => uniform. Always includes 0 and H.
function gradedZ(rA: (th: number, z: number) => number, nZ: number, grade: number): number[] {
  if (grade <= 0) return Array.from({ length: nZ + 1 }, (_, j) => (H * j) / nZ);
  const NS = 2000; const dens = new Float64Array(NS + 1);
  const thetas = [0, TAU * 0.13, TAU * 0.37, TAU * 0.61, TAU * 0.83];
  const dz = H / NS;
  for (let i = 0; i <= NS; i++) {
    const z = H * (i / NS); let c = 0;
    for (const th of thetas) { const zm = Math.max(0, z - dz), zp = Math.min(H, z + dz); c = Math.max(c, Math.abs(rA(th, zp) - 2 * rA(th, z) + rA(th, zm))); }
    dens[i] = 1 + grade * c;
  }
  const cdf = new Float64Array(NS + 1);
  for (let i = 1; i <= NS; i++) cdf[i] = cdf[i - 1] + 0.5 * (dens[i] + dens[i - 1]);
  const total = cdf[NS]; const zs: number[] = [0]; let k = 0;
  for (let j = 1; j < nZ; j++) { const target = (total * j) / nZ; while (k < NS && cdf[k + 1] < target) k++; const seg = cdf[k + 1] - cdf[k] || 1; zs.push(H * ((k + (target - cdf[k]) / seg) / NS)); }
  zs.push(H);
  return zs;
}
function buildSheet(rA: (th: number, z: number) => number, nTh: number, nZ: number, zGrade: number): BuiltMesh {
  const zs = gradedZ(rA, nZ, zGrade);
  const rows: RowSpec[] = zs.map((z) => ({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' as const }));
  return buildStructuredWall(rA, H, rows);
}

// ── full honest scoring of a mesh (structured or kernel). Certify on MAX + 0 outliers (DS lesson).
interface Scored {
  tris: number; nV: number;
  true3dMax: number; true3dP99: number; over01: number;
  radialMax: number; radialP99: number;
  anchorNRed: number; anchorTrustedMax: number; anchorTrustedP99: number; gnOver: number;
  gnSelMax: number; gnSelStayHi: number;
  honestMax: number; honestP99: number;
  pctBelow20: number; minAngleDeg: number; medianMinAngleDeg: number;
  nonMan: number; boundary: number; edges: number; weldNonMan: number;
  true3d: ChordSagResult; radial: ChordSagResult;
}
function scoreMesh(ut: number[], idx: Uint32Array, xyz: ArrayLike<number>, rA: (th: number, z: number) => number, tag: string, t0: number): Scored {
  const nF = idx.length / 3, nV = ut.length / 2;
  const radial = perFaceChordSag(ut, idx, rA, H);
  const radialMax = radial.worstMm, radialP99 = p99(radial.faceErr);
  plog(`${tag}: radial done max=${radialMax.toFixed(5)} p99=${radialP99.toFixed(5)} (${Date.now() - t0}ms)`);
  const true3d = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.004 });
  const true3dMax = true3d.worstMm, true3dP99 = p99(true3d.faceErr), over01 = countOver(true3d.faceErr, CAD);
  plog(`${tag}: true-3D done max=${true3dMax.toFixed(5)} p99=${true3dP99.toFixed(5)} over0.01=${over01} (${Date.now() - t0}ms)`);
  // honest tail: anchor at redMm=0.008 (AT/BELOW target so it FIRES). For a smooth SR mesh nRed should be 0.
  const anch = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.008, sampleN: 160, radial, coarse: { nTheta: 1536, nZ: 400 }, fine: { nTheta: 3072, nZ: 800 } });
  plog(`${tag}: anchor done nRed=${anch.nRed} trustedMax=${anch.trustedMax.toFixed(5)} trustedP99=${anch.trustedP99.toFixed(5)} gnOver=${anch.gnOver} (${Date.now() - t0}ms)`);
  // GN-SELECTED adversarial worst-80 (VERIFY-WEAVE method): brute-floor the worst-by-true3d centroids full-azimuth.
  let gnSelMax = 0, gnSelStayHi = 0;
  {
    const order = Array.from({ length: nF }, (_, i) => i).sort((x, y) => true3d.faceErr[y] - true3d.faceErr[x]).slice(0, 80);
    const lift = (i: number): [number, number, number] => { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    for (const f of order) {
      const [ax, ay, az] = lift(idx[3 * f]), [bx, by, bz] = lift(idx[3 * f + 1]), [cx, cy, cz] = lift(idx[3 * f + 2]);
      const d = bruteNearestOnRadialSurface((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, rA, H, { nTheta: 3072, nZ: 800 }).dist;
      if (d > gnSelMax) gnSelMax = d; if (d > CAD) gnSelStayHi++;
    }
  }
  plog(`${tag}: GN-sel worst80 max=${gnSelMax.toFixed(5)} stayHi>0.01=${gnSelStayHi} (${Date.now() - t0}ms)`);
  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const nm = nonManRawBigStats(idx);
  const weldNonMan = auditNonManByIndex(xyz, idx);
  // honest MAX/p99 = worst of the true-3D whole-mesh ruler, the anchored red tail (if fired), and the GN-sel floor.
  const anchMax = anch.nRed > 0 ? anch.trustedMax : 0, anchP99 = anch.nRed > 0 ? anch.trustedP99 : 0;
  const honestMax = Math.max(true3dMax, gnSelMax, anchMax);
  const honestP99 = Math.max(true3dP99, anchP99);
  return {
    tris: nF, nV, true3dMax, true3dP99, over01, radialMax, radialP99,
    anchorNRed: anch.nRed, anchorTrustedMax: anchMax, anchorTrustedP99: anchP99, gnOver: anch.gnOver,
    gnSelMax, gnSelStayHi, honestMax, honestP99,
    pctBelow20: q.pctBelow20, minAngleDeg: q.minAngleDeg, medianMinAngleDeg: q.medianMinAngleDeg,
    nonMan: nm.nonMan, boundary: nm.boundary, edges: nm.edges, weldNonMan, true3d, radial,
  };
}
function rowOf(key: string, extra: Record<string, unknown>, s: Scored, tookMs: number): Record<string, unknown> {
  return {
    key, ...extra, tris: s.tris, nV: s.nV,
    true3dMaxMm: +s.true3dMax.toFixed(5), true3dP99Mm: +s.true3dP99.toFixed(5), over0_01: s.over01,
    radialMaxMm: +s.radialMax.toFixed(5), radialP99Mm: +s.radialP99.toFixed(5),
    anchorNRed: s.anchorNRed, anchorTrustedMaxMm: +s.anchorTrustedMax.toFixed(5), anchorTrustedP99Mm: +s.anchorTrustedP99.toFixed(5), gnOverstated: s.gnOver,
    gnSelAdvMaxMm: +s.gnSelMax.toFixed(5), gnSelAdvStayHi: s.gnSelStayHi,
    honestMaxMm: +s.honestMax.toFixed(5), honestP99Mm: +s.honestP99.toFixed(5),
    pctBelow20: +s.pctBelow20.toFixed(2), minAngleDeg: +s.minAngleDeg.toFixed(2), medianMinAngleDeg: +s.medianMinAngleDeg.toFixed(1),
    nonMan: s.nonMan, boundaryEdges: s.boundary, auditedEdges: s.edges, weldNonMan: s.weldNonMan,
    // CERTIFY ON MAX + 0 OUTLIERS + watertight + slivers (DS lesson: never p99 alone)
    reachesMax: s.honestMax <= CAD && s.over01 === 0 && s.nonMan === 0 && s.pctBelow20 < 5,
    tookMs,
  };
}

// ═════════════════════ ARM 1: KERNEL BASELINE + LOCALIZATION (buildInhouseMetricMesh) ═════════════════════
// Measure the in-house metric-Delaunay kernel at production scale, LOCALIZE the residual (where on the wall), and
// test the chordTolMm fidelity guard. This is the audit-first diagnostic the task mandates.
interface KernCfg { tag: string; opts: Parameters<typeof buildInhouseMetricMesh>[2]; }
function localize(s: Scored, ut: number[], idx: Uint32Array): Record<string, unknown> {
  const nF = idx.length / 3;
  const order = Array.from({ length: nF }, (_, i) => i).sort((x, y) => s.true3d.faceErr[y] - s.true3d.faceErr[x]).slice(0, 300);
  const tbins = new Array(10).fill(0) as number[];
  let sumExtr = 0, nearRim = 0, nearBase = 0, mid = 0;
  for (const f of order) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const t = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
    const u = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3;
    tbins[Math.min(9, Math.floor(t * 10))]++;
    sumExtr += distToExtremum(u, t);
    if (t > 0.9) nearRim++; else if (t < 0.1) nearBase++; else mid++;
  }
  // baseline: mean distToExtremum over a random sample (uniform reference ~ pi/4 = 0.785)
  return {
    worstK: order.length, worstTbins: tbins,
    meanDistToExtremum: +(sumExtr / order.length).toFixed(4), uniformRef: +(Math.PI / 4).toFixed(4),
    fracNearRim_t_gt0_9: +(nearRim / order.length).toFixed(3), fracNearBase_t_lt0_1: +(nearBase / order.length).toFixed(3), fracMid: +(mid / order.length).toFixed(3),
  };
}
function runKernel(cfg: KernCfg): void {
  const key = `kern_${cfg.tag}`;
  if (rowExists(key)) { plog(`${key}: exists — skip`); return; }
  const t0 = Date.now();
  plog(`${key}: building buildInhouseMetricMesh ...`);
  const rA = buildRadiusFn('SpiralRidges' as StyleId, {}, DIMS);
  const mesh = buildInhouseMetricMesh(rA, H, cfg.opts);
  const xyz = new Float64Array(mesh.points * 3);
  for (let i = 0; i < mesh.points; i++) { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * H, r = rA(th, z); xyz[3 * i] = r * Math.cos(th); xyz[3 * i + 1] = r * Math.sin(th); xyz[3 * i + 2] = z; }
  plog(`${key}: built ${mesh.indices.length / 3} tris, ${mesh.points} pts, rounds=${mesh.rounds}, hitBudget=${mesh.hitBudget} (${Date.now() - t0}ms)`);
  const s = scoreMesh(mesh.ut, mesh.indices, xyz, rA, key, t0);
  const loc = localize(s, mesh.ut, mesh.indices);
  plog(`${key}: LOCALIZE ${JSON.stringify(loc)}`);
  checkpoint({ ...rowOf(key, { arm: 'kernel', primitive: 'inhouseMetricMesh', rounds: mesh.rounds, hitBudget: mesh.hitBudget, ...cfg.opts }, s, Date.now() - t0), localize: loc });
  expect(s.nonMan).toBe(0);
}

// ═════════════════════ ARM 2: STRUCTURED M-SQUARE SWEEP (buildStructuredWall) — the closer ═════════════════════
// Uniform-theta + square-ish cells (light zGrade) is the GAP-GSBSS closer; sweep density at PRODUCTION scale until
// true-3D MAX <=0.01 with 0 outliers, watertight, %<20<5. Circumference: top 2pi*70~=440mm, base 2pi*45~=283mm,
// mean ~360mm; H=120 => square cells at mean need nZ ~= 0.33*nTh (top 0.27, base 0.42).
interface SqCfg { nTh: number; nZ: number; zGrade: number; tag: string; dump?: boolean; }
function runStruct(c: SqCfg): void {
  const key = `sq_${c.tag}`;
  if (rowExists(key)) { plog(`${key}: exists — skip`); return; }
  const t0 = Date.now();
  const rA = buildRadiusFn('SpiralRidges' as StyleId, {}, DIMS);
  plog(`${key}: building sheet nTh=${c.nTh} nZ=${c.nZ} zGrade=${c.zGrade} ...`);
  const mesh = buildSheet(rA, c.nTh, c.nZ, c.zGrade);
  plog(`${key}: built ${mesh.nF} tris (${Date.now() - t0}ms)`);
  const s = scoreMesh(mesh.ut, mesh.idx, mesh.xyz, rA, key, t0);
  if (c.dump) {
    try {
      const anSag = perFaceTrue3DSagAnchored(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.004, redMm: 0.008, topK: 80, coarse: { nTheta: 1024, nZ: 300 }, fine: { nTheta: 2048, nZ: 600 } });
      dumpRenderBins(DIR, `sr_prod_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(anSag.vertErr, 0.01), meta: { ruler: 'true3d-anchored', label: `SpiralRidges PRODUCTION M-square (${c.tag}) — true-3D vs analytic surface (scale 0.01mm)`, worstMm: anSag.worstMm, p99Mm: s.true3dP99, scaleMm: 0.01 }, stl: true });
      plog(`${key}: heatmap dumped`);
    } catch (e) { plog(`${key}: heatmap failed ${String(e)}`); }
  }
  // expected boundary = the two open rim rings (t=0 and t=1) = 2*nTh; report it (attachment boundary, not a crack).
  checkpoint(rowOf(key, { arm: 'struct', primitive: 'structuredWall-Msquare', nTh: c.nTh, nZ: c.nZ, zGrade: c.zGrade, expectedRimEdges: 2 * c.nTh }, s, Date.now() - t0));
  expect(s.nonMan).toBe(0);
}

// ─────────────────────────── the arms ───────────────────────────
describe('SRCLOSE-kernel', () => {
  it.skipIf(process.env.PF_SRCLOSE !== '1' || process.env.PF_SR_KERNEL !== '1')('inhouseMetricMesh baseline + localization @ production scale', () => {
    mkdirSync(DIR, { recursive: true });
    // raw metric sizing (no chord guard) — exposes the crest-aliasing residual to localize
    runKernel({ tag: 'raw_p800k', opts: { tolMm: 0.01, hMin: 0.02, hMax: 8, sizeRes: 220, gradeBeta: 0.2, seedN: 12, maxPoints: 800_000, splitThresh: 1.5, optimizeSweeps: 2, guardManifoldAlways: true } });
    // + chord-sag fidelity guard (chordTolMm + Steiner + dense guard sampler) — the heatmap-greening lever
    runKernel({ tag: 'chord_p1500k', opts: { tolMm: 0.006, hMin: 0.01, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 1_500_000, splitThresh: 1.5, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.01, chordSteiner: true, chordSampleN: 8 } });
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 60 * 60 * 1000);
});

describe('SRCLOSE-struct', () => {
  it.skipIf(process.env.PF_SRCLOSE !== '1' || process.env.PF_SR_STRUCT !== '1')('structured M-square sweep @ production scale => true-3D MAX <=0.01', () => {
    mkdirSync(DIR, { recursive: true });
    // screen: expect production to need ~1.4-2x the gentle-dim budget (gentle closed at 4.14M => MAX 0.0038).
    runStruct({ nTh: 2400, nZ: 820, zGrade: 4, tag: 'c2400_z820' });   // ~3.9M
    runStruct({ nTh: 3000, nZ: 1020, zGrade: 4, tag: 'c3000_z1020' });  // ~6.1M
    runStruct({ nTh: 3600, nZ: 1220, zGrade: 4, tag: 'c3600_z1220', dump: true }); // ~8.8M (winner-candidate: dump)
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 60 * 60 * 1000);
});

// HD confirm (only if the sweep is marginal at 8.8M) — separate gate so it resumes independently.
describe('SRCLOSE-struct-hd', () => {
  it.skipIf(process.env.PF_SRCLOSE !== '1' || process.env.PF_SR_STRUCT_HD !== '1')('structured M-square HD confirm', () => {
    mkdirSync(DIR, { recursive: true });
    runStruct({ nTh: 4200, nZ: 1420, zGrade: 4, tag: 'c4200_z1420', dump: true }); // ~11.9M
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 60 * 60 * 1000);
});

// ═════════════════════ ARM 3: COARSE sweep — find the MINIMAL production budget ═════════════════════
// 3.94M already gives MAX 0.0048 (2x under bar) => probe coarser to bracket the true minimum tri budget.
describe('SRCLOSE-coarse', () => {
  it.skipIf(process.env.PF_SRCLOSE !== '1' || process.env.PF_SR_COARSE !== '1')('coarse structured sweep → minimal budget', () => {
    mkdirSync(DIR, { recursive: true });
    runStruct({ nTh: 1500, nZ: 520, zGrade: 4, tag: 'c1500_z520' });  // ~1.56M
    runStruct({ nTh: 1900, nZ: 650, zGrade: 4, tag: 'c1900_z650' });  // ~2.47M
    runStruct({ nTh: 2100, nZ: 720, zGrade: 4, tag: 'c2100_z720' });  // ~3.02M
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 60 * 60 * 1000);
});

// ═════════════════════ ARM 4: JUDGE-CERT reachability (Track A, READ-ONLY) ═════════════════════
// Scope whether the structured grid the exact-dyadic partition (verifyExactDyadicRectanglePartition via certAdapter's
// cutAtGap) accepts. SpiralRidges is smooth => ANY column is a gap (no cut-at-feature like DS). Two demos:
//  (a) UNIFORM pow2 grid (nTh=512,nZ=256, zGrade=0) snapped to N=2^10=1024 (multiple of both) => EXACT snap δ=0,
//      judge should ACCEPT (262k tris < 2^20 cap) — proves the topology certifies directly.
//  (b) the production GRADED grid's snap δ at bits=14 (no judge; just the path-A δ) => shows the bounded δ that
//      folds into the geometric bound when rows are curvature-graded (non-dyadic t-stations).
describe('SRCLOSE-cert', () => {
  it.skipIf(process.env.PF_SRCLOSE !== '1' || process.env.PF_SR_CERT !== '1')('judge-cert reachability (cut-at-gap + exact-dyadic)', async () => {
    mkdirSync(DIR, { recursive: true });
    const { certifyPeriodicGridMesh, cutAtGapCertDomain, snapAndVerifyCertDomain } = await import('./certAdapter');
    const rA = buildRadiusFn('SpiralRidges' as StyleId, {}, DIMS);
    // (a) uniform pow2 grid — exact dyadic snap.
    {
      const nTh = 512, nZ = 256;
      const mesh = buildSheet(rA, nTh, nZ, 0);
      const pos = Float32Array.from(mesh.xyz);
      const t0 = Date.now();
      const v = certifyPeriodicGridMesh(mesh.ut, mesh.idx, pos, nTh, 0, rA, H, 10, { patchId: 'sr-uniform-512x256', maxTriangles: 1_048_576 });
      checkpoint({ key: 'cert_uniform_512x256_b10', arm: 'cert', demo: 'uniform-pow2', nTh, nZ, bits: 10, N: 1024, tris: mesh.nF, accepted: v.accepted, maxDeltaMm: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPosTris: v.nonPosTris, seamDupCount: v.seamDupCount, detail: v.detail, tookMs: Date.now() - t0 });
    }
    // (b) production graded grid — snap δ only (mesh too big for the 2^20 judge cap; report the bounded δ).
    {
      const nTh = 2400, nZ = 820;
      const mesh = buildSheet(rA, nTh, nZ, 4);
      const pos = Float32Array.from(mesh.xyz);
      const t0 = Date.now();
      const dom = cutAtGapCertDomain(mesh.ut, mesh.idx, pos, nTh, 0);
      // snap δ at bits=14 without invoking the (tri-capped) judge: reuse snapAndVerify but cap tris to 1 so the judge
      // rejects on count while maxDelta is still computed over ALL vertices (δ accounting runs before the judge).
      const v = snapAndVerifyCertDomain(dom, rA, H, 14, { patchId: 'sr-graded-2400x820', maxTriangles: 1 });
      checkpoint({ key: 'cert_graded_2400x820_b14', arm: 'cert', demo: 'graded-snap-delta', nTh, nZ, bits: 14, N: 16384, tris: mesh.nF, judgeAccepted: v.accepted, maxDeltaMm: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPosTris: v.nonPosTris, seamDupCount: v.seamDupCount, note: 'judge tri-cap=1 forces reject; maxDelta is the real path-A δ over all verts (full mesh needs multi-patch atlas like DS S1)', tookMs: Date.now() - t0 });
    }
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 30 * 60 * 1000);
});
