// _gf_gothic_diag.test.ts — DEV-ONLY (PF_GF_GOTHIC=1). E-2026-07-04-GF-GOTHIC diagnosis (the tiebreaker).
//
// The flank-strip sweep (_gf_gothic) found true-3D FLAT at ~0.080 across u-pitch 0.30->0.16->0.10 (P0 0.0799, P1
// 0.0801, P2 ~0.080) while %<20 REGRESSED 3.9->9.5->15.6 — pinned flank points add density+slivers but do NOT lower
// the true-3D floor, DESPITE the recon proving the flank chord IS pitch-responsive (0.968@N1 -> 0.0187@N16). WHY?
//
// TIEBREAKER (decisive): rebuild ONE config, locate the worst-200 red facets, and for each report:
//   (a) the LOCAL flank SPAN in mm-arc (how thin the wall is at that (u,t)) + gradU/gradT,
//   (b) whether a PINNED flank point actually landed within pitch of the facet centroid (did my points survive?),
//   (c) the crest->valley true-3D chord AT that facet's row (recon-style) — is it a sub-pitch KNIFE-EDGE the flat
//       facet fundamentally cannot follow (span < pitch => 0 points added => genuine steep-EXCLUDE cusp), or a wall
//       my points reached but the CDT bridged anyway (mechanism bug)?
// Also: also run the true-3D on this rebuilt mesh so the P2-class number is captured (P2's brute-anchor was killed).
//
// ISOLATION: NEW file. Reuses labkit + _cu_gothicsegLib + _gf_gothicFlankLib READ-ONLY. Writes ONLY _gf_gothic/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts,
  buildMeshUt, triangleQualityDistribution, perFaceChordSag, bruteAnchoredRedPerp,
  bruteNearestOnRadialSurface, type AnalyticRadiusFn,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { type CrestExtractResult } from './_cu_gothicsegLib';
import { buildFlankPoints, type FlankPitchOpts } from './_gf_gothicFlankLib';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;
const STYLE = 'GothicArches' as StyleId;
const R_MEAN = 48;
const DIR = join(process.cwd(), 'research', 'exchange', '_gf_gothic');
const NDJSON = join(DIR, 'scorecard.ndjson');
const DIAGJSON = join(DIR, 'diag.ndjson');
const PROG = join(DIR, 'progress.log');
const EXCACHE = join(process.cwd(), 'research', 'exchange', '_gd_gothic', 'extract.cache.json');

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (file: string, key: string): boolean => {
  if (!existsSync(file)) return false;
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } });
};
const checkpoint = (file: string, row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(file, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };

function auditNonManRaw(idx: ArrayLike<number>): number {
  const keys = new Float64Array(idx.length); let w = 0; const BIG = 2 ** 26;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const lo = p < q ? p : q, hi = p < q ? q : p; keys[w++] = lo * BIG + hi; }
  }
  const arr = keys.subarray(0, w); arr.sort();
  let nm = 0, i = 0; while (i < w) { let j = i + 1; while (j < w && arr[j] === arr[i]) j++; if (j - i > 2) nm++; i = j; } return nm;
}
function lift(rA: AnalyticRadiusFn, u: number, t: number): [number, number, number] {
  const th = TAU * (u - Math.floor(u)), z = t * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z];
}
function segDist(p: number[], a: number[], b: number[]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2]; const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
  let tt = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy + (p[2] - a[2]) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(p[0] - (a[0] + tt * dx), p[1] - (a[1] + tt * dy), p[2] - (a[2] + tt * dz));
}
// crest->valley true-3D chord at fixed t, walking u both sides; returns the WORST straight-chord sag (recon-style),
// AND the flank half-span in mm-arc (min of the two sides). This says whether the wall is a sub-pitch knife-edge.
function flankProbeU(rA: AnalyticRadiusFn, uC: number, t: number, maxDu: number): { chord1: number; spanArc: number } {
  const z = t * H; let worstChord = 0, minSpanArc = Infinity;
  for (const dir of [1, -1]) {
    // find valley
    const N = 256; let uPrev = uC, rPrev = rA(TAU * (uC - Math.floor(uC)), z), uV = uC + dir * maxDu;
    for (let i = 1; i <= N; i++) { const u = uC + dir * maxDu * (i / N); const r = rA(TAU * (u - Math.floor(u)), z); if (r > rPrev + 1e-9) { uV = uPrev; break; } uPrev = u; rPrev = r; }
    const spanDu = Math.abs(uV - uC); const spanArc = spanDu * R_MEAN * TAU; if (spanArc < minSpanArc) minSpanArc = spanArc;
    if (spanDu < 1e-7) continue;
    // single straight chord crest->valley, worst interior sample (=chord at N=1: the residual a facet incurs if the CDT bridges the whole flank)
    const a = lift(rA, uC, t), b = lift(rA, uV, t);
    for (let k = 1; k <= 15; k++) { const s = k / 16; const pm = lift(rA, uC + (uV - uC) * s, t); const d = segDist(pm, a, b); if (d > worstChord) worstChord = d; }
  }
  return { chord1: worstChord, spanArc: minSpanArc === Infinity ? 0 : minSpanArc };
}

const EXCFG = { key: 'diag-P1-u0.16-t0.14', uPitchMmArc: 0.16, tPitchMmZ: 0.14 };
const BUDGET = 6_000_000, BASE_TOL = 0.006, BASE_HMIN = 0.010, CHORD_TOL = 0.010, MAXDU = (1 / 72) / 2 * 1.2, MAXDT = 0.05;

function loadExtract(): CrestExtractResult {
  const c = JSON.parse(readFileSync(EXCACHE, 'utf8')); return c as CrestExtractResult;
}

describe('gf-gothic diag: why is true-3D flat under flank pitch?', () => {
  it.skipIf(process.env.PF_GF_GOTHIC !== '1')('locate-worst-vs-flankspan', () => {
    if (rowExists(DIAGJSON, EXCFG.key)) { plog(`${EXCFG.key} diag exists, skip`); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const ex = loadExtract();
    const flankOpts: FlankPitchOpts = { uPitchMmArc: EXCFG.uPitchMmArc, tPitchMmZ: EXCFG.tPitchMmZ, rMean: R_MEAN, H, maxDu: MAXDU, maxDt: MAXDT, minGradU: 6, minGradT: 0.4 };
    const flank = buildFlankPoints(rA, ex.crestUt, flankOpts);
    const injected = ex.points.concat(flank.points);
    plog(`${EXCFG.key}: injected crest=${ex.points.length / 2} flank=${flank.points.length / 2}; building...`);
    const opts: InhouseMeshOpts = {
      tolMm: BASE_TOL, hMin: BASE_HMIN, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
      maxPoints: BUDGET, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
      chordTolMm: CHORD_TOL, chordSteiner: true,
      guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
      injectedPoints: injected, pinInjected: true, constraintEdges: ex.constraints,
    };
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, H, opts);
    plog(`${EXCFG.key}: built ${(mesh.indices.length / 3 / 1e6).toFixed(2)}M in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    const radial = perFaceChordSag(mesh.ut, mesh.indices, rA, H);
    const rawNonMan = auditNonManRaw(mesh.indices);
    const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);
    const q = triangleQualityDistribution({ vertices: m.xyz, indices: mesh.indices });
    const brute = bruteAnchoredRedPerp(mesh.ut, mesh.indices, rA, H, { redMm: 0.03, sampleN: 64, radial });
    plog(`${EXCFG.key}: true3dP99=${brute.trustedP99.toFixed(4)} nRed=${brute.nRed} %<20=${q.pctBelow20.toFixed(1)} rawNonMan=${rawNonMan}`);

    // Locate the worst-200 by GN-perp (perFaceTrue3DSag would be slow; use radial to pick, then brute-anchor each).
    // Actually: pick worst-200 by radial sag AND separately by true-3D via a per-facet brute at centroid.
    const nF = mesh.indices.length / 3;
    // candidate red set by radial (matches bruteAnchoredRedPerp's selection)
    const red: number[] = []; for (let f = 0; f < nF; f++) if (radial.faceErr[f] > 0.03) red.push(f);
    // score each red facet's TRUE-3D perp at centroid (brute) so we rank by the REAL residual, not radial
    const scored: Array<{ f: number; perp: number }> = [];
    const liftV = (i: number): [number, number, number] => { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    // cap the brute scoring to the worst-800 radial (perf); those contain the true-3D worst
    red.sort((x, y) => radial.faceErr[y] - radial.faceErr[x]);
    const cand = red.slice(0, Math.min(800, red.length));
    for (const f of cand) {
      const [ax, ay, az] = liftV(mesh.indices[3 * f]), [bx, by, bz] = liftV(mesh.indices[3 * f + 1]), [cx2, cy2, cz2] = liftV(mesh.indices[3 * f + 2]);
      const cx = (ax + bx + cx2) / 3, cy = (ay + by + cy2) / 3, cz = (az + bz + cz2) / 3;
      const bf = bruteNearestOnRadialSurface(cx, cy, cz, rA, H, { nTheta: 2048, nZ: 400 });
      scored.push({ f, perp: bf.dist });
    }
    scored.sort((a, b) => b.perp - a.perp);
    const worst = scored.slice(0, 200);

    // for each worst facet: local flank span + crest->valley chord + gradU/gradT + nearest pinned flank point dist
    // build a spatial hash of flank points (u,t) for the "did my point land near here" test
    const fpU: number[] = [], fpT: number[] = [];
    for (let i = 0; i + 1 < flank.points.length; i += 2) { fpU.push(flank.points[i]); fpT.push(flank.points[i + 1]); }
    const du = 1 / 8192, dt = 1 / 8192;
    const rows: Array<Record<string, number | boolean>> = [];
    let nKnife = 0, nWideBridged = 0, nPtNear = 0;
    for (const w of worst) {
      const f = w.f; const a = mesh.indices[3 * f], b = mesh.indices[3 * f + 1], c = mesh.indices[3 * f + 2];
      let ua = mesh.ut[2 * a], ub = mesh.ut[2 * b], uc = mesh.ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      const ta = mesh.ut[2 * a + 1], tb = mesh.ut[2 * b + 1], tc = mesh.ut[2 * c + 1];
      const um = ((ua + ub + uc) / 3); const uw = um - Math.floor(um); const tm = (ta + tb + tc) / 3; const z = tm * H;
      const gU = Math.abs(rA(TAU * ((uw + du) - Math.floor(uw + du)), z) - rA(TAU * ((uw - du) - Math.floor(uw - du)), z)) / (2 * du * TAU);
      const tzHi = Math.min(1, tm + dt) * H, tzLo = Math.max(0, tm - dt) * H;
      const gT = Math.abs(rA(TAU * uw, tzHi) - rA(TAU * uw, tzLo)) / Math.max(1e-9, tzHi - tzLo);
      const fp = flankProbeU(rA, uw, tm, MAXDU);
      // facet's own u-extent in mm-arc (how wide the bridging facet is)
      const facetArc = (Math.max(ua, ub, uc) - Math.min(ua, ub, uc)) * R_MEAN * TAU;
      const facetZ = (Math.max(ta, tb, tc) - Math.min(ta, tb, tc)) * H;
      // nearest pinned flank point (u,t) to the centroid (periodic u), in mm
      let nearFp = Infinity;
      for (let i = 0; i < fpU.length; i++) { let dU = Math.abs(fpU[i] - uw); if (dU > 0.5) dU = 1 - dU; const dArc = dU * R_MEAN * TAU; const dZ = Math.abs(fpT[i] - tm) * H; const d = Math.hypot(dArc, dZ); if (d < nearFp) nearFp = d; }
      const pitchMm = Math.min(EXCFG.uPitchMmArc, EXCFG.tPitchMmZ);
      const ptNear = nearFp <= pitchMm * 1.5;
      if (ptNear) nPtNear++;
      // knife-edge: the flank half-span is thinner than one pitch (my generator adds 0 points there)
      const isKnife = fp.spanArc < EXCFG.uPitchMmArc;
      if (isKnife) nKnife++; else if (facetArc > EXCFG.uPitchMmArc * 2) nWideBridged++;
      rows.push({ f, perp: +w.perp.toFixed(4), gradU: +gU.toFixed(1), gradT: +gT.toFixed(2), flankSpanArc: +fp.spanArc.toFixed(3), crestValChord: +fp.chord1.toFixed(4), facetArcMm: +facetArc.toFixed(3), facetZmm: +facetZ.toFixed(3), nearFpMm: +nearFp.toFixed(3), ptNear, isKnife });
    }
    writeFileSync(join(DIR, 'diag_worst200.json'), JSON.stringify(rows, null, 0));
    const med = (arr: number[]): number => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const summary = {
      key: EXCFG.key, tris: nF, true3dP99: +brute.trustedP99.toFixed(4), nRed: brute.nRed, pctBelow20: +q.pctBelow20.toFixed(2), rawNonMan,
      worstN: worst.length, nKnife, nWideBridged, nPtNear,
      knifeFrac: +(nKnife / Math.max(1, worst.length)).toFixed(3),
      ptNearFrac: +(nPtNear / Math.max(1, worst.length)).toFixed(3),
      medFlankSpanArc: +med(rows.map((r) => r.flankSpanArc as number)).toFixed(3),
      medCrestValChord: +med(rows.map((r) => r.crestValChord as number)).toFixed(4),
      medFacetArcMm: +med(rows.map((r) => r.facetArcMm as number)).toFixed(3),
      medFacetZmm: +med(rows.map((r) => r.facetZmm as number)).toFixed(3),
      medGradU: +med(rows.map((r) => r.gradU as number)).toFixed(1),
      medGradT: +med(rows.map((r) => r.gradT as number)).toFixed(2),
      medNearFpMm: +med(rows.map((r) => r.nearFpMm as number)).toFixed(3),
    };
    checkpoint(DIAGJSON, summary);
    plog(`${EXCFG.key}: [DIAG] knifeFrac=${summary.knifeFrac} ptNearFrac=${summary.ptNearFrac} medFlankSpanArc=${summary.medFlankSpanArc} medFacetArc=${summary.medFacetArcMm} medCrestValChord=${summary.medCrestValChord} medNearFp=${summary.medNearFpMm}`);
    // Also mirror the true-3D into the main scorecard for the P2-class record (key P2 was killed pre-checkpoint).
    if (!rowExists(NDJSON, 'diag-P1-true3d')) checkpoint(NDJSON, { key: 'diag-P1-true3d', tris: nF, uPitchMmArc: EXCFG.uPitchMmArc, tPitchMmZ: EXCFG.tPitchMmZ, true3dP99: +brute.trustedP99.toFixed(4), nRed: brute.nRed, pctBelow20: +q.pctBelow20.toFixed(2), rawNonMan, serrNote: 'see P1 row (same loci)' });
    expect(worst.length).toBeGreaterThan(0);
  }, 120 * 60 * 1000);
});
