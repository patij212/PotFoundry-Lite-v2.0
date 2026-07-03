// _tangled2.test.ts — DEV-ONLY (env PF_TANGLED2=1). QUALITY-CLOSE for the TANGLED-LATTICE primitive.
//
// PICKS UP FROM RECON (_tangledRecon, E-2026-07-03-TANGLED): chordSteiner@0.03 already SOLVES Gyroid chord
// (fl-chord p99 0.0194, brute-anchored worst-red = ZERO red facets @1.19M, rawNonMan 0). The ONLY gap is
// TRIANGLE QUALITY: an EXTREME-sliver tail (min-angle 0.90-1.70°; %<20 itself LOW at 1.7-2.1%).
//
// JOB: close the min-angle sliver tail WITHOUT losing the chord, then confirm on Voronoi + Crystalline.
//   Q1 (cheapest QUALITY lever): MORE optimizeSweeps (true-3D max-min-angle Lawson flips + on-surface smooth).
//   Q2 (if residual): PROTECT the crest/valley network as constraint edges (buildFeatureConformingMeshB +
//       planarize) so facets ALIGN to the network instead of STRADDLING it (straddle = the sliver source).
//       27k-line O(n^2) planarize → SUBSAMPLE the network to the sharpest loci (sharpFrac lever).
//   Keep chordSteiner on so chord stays <=0.012.
//
// Each variant is its OWN env-gated `it` + CHECKPOINTS (ndjson row + heatmap bins) the INSTANT computed, so a
// killed run resumes by re-running only the unfinished variant. ISOLATED — reuses labkit rulers + committed
// byte-identical-off kernel hooks READ-ONLY; edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureConformingMeshB, buildFeatureTruth,
  buildMeshUt, buildLocator, featureLineChord3D, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import type { FeatureLine } from '../../src/renderers/webgpu/parametric/conforming/FeatureLineGraph';

const TAU = 2 * Math.PI;

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_tangled');
const LEDGER = join(DIR, 't2_rows.ndjson');
// moderate screening budget (iterate cheap); the recon used 900k. Keep it so V0 reproduces the recon.
const BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 900_000, splitThresh: 1.5 } as const;

interface Row {
  style: string; label: string; tris: number;
  flChordP99: number; flMax: number;
  trustedP99: number; gnP99: number; gnOver: number; nSample: number; nRed: number;
  minA: number; p5: number; median: number; mean: number; pctB10: number; pctB20: number;
  nonMan: number; ms: number;
}

function measure(
  style: StyleId, label: string,
  mesh: { ut: number[]; indices: Uint32Array; constraint?: { requested: number; recovered: number; failed: number } },
  rA: ReturnType<typeof buildRadiusFn>, truth: ReturnType<typeof buildFeatureTruth>,
  ms: number, dumpVisual: boolean,
): Row {
  const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const loc = buildLocator(meshUt, 256);
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
  const fl3 = featureLineChord3D(interior, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: mesh.indices });
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);
  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 });
  const row: Row = {
    style, label, tris: idx.length / 3,
    flChordP99: +fl3.p99Mm.toFixed(4), flMax: +fl3.maxMm.toFixed(3),
    trustedP99: +anchored.trustedP99.toFixed(4), gnP99: +anchored.gnP99.toFixed(3), gnOver: anchored.gnOver, nSample: anchored.nSample, nRed: anchored.nRed,
    minA: q.minAngleDeg, p5: q.p5MinAngleDeg, median: q.medianMinAngleDeg, mean: q.meanMinAngleDeg, pctB10: q.pctBelow10, pctB20: q.pctBelow20,
    nonMan, ms: Math.round(ms),
  };
  if (mesh.constraint) (row as Record<string, unknown>).constraint = { req: mesh.constraint.requested, rec: mesh.constraint.recovered, fail: mesh.constraint.failed };
  // CHECKPOINT — append the row the INSTANT it is computed.
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${style}/${label.padEnd(20)} tris=${String(row.tris).padStart(8)} flP99=${row.flChordP99} flMax=${row.flMax} worstRed(trust)=${row.trustedP99}(gn ${row.gnP99},over ${row.gnOver},red ${row.nRed}) minA=${row.minA} p5=${row.p5} med=${row.median} %<10=${row.pctB10} %<20=${row.pctB20} nonMan=${row.nonMan} ${row.ms}ms`);
  if (dumpVisual) {
    const mu = buildMeshUt(ut, idx, rA, DIMS.H);
    dumpHeatmap(DIR, `t2_${style}_${label}_chord`, mu.xyz, ut, idx, rA, DIMS.H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
  }
  return row;
}

// ── shared kernel builders ───────────────────────────────────────────────────
function rawSteiner(style: StyleId, sweeps: number): { rA: ReturnType<typeof buildRadiusFn>; run: () => ReturnType<typeof buildInhouseMetricMesh> } {
  const rA = buildRadiusFn(style, {}, DIMS);
  return { rA, run: () => buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, optimizeSweeps: sweeps, guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true }) };
}

// ── network-subsample helpers (planarize is O(n^2)-ish on 27k lines → gate/subsample the network) ──
/** row-mean radius cache for amplitude gating. */
function makeRowMean(rA: ReturnType<typeof buildRadiusFn>, H: number): (t: number) => number {
  const cache = new Map<number, number>();
  return (t: number): number => {
    const key = Math.round(t * 2048);
    const c = cache.get(key); if (c !== undefined) return c;
    const z = t * H; let s = 0; const N = 128;
    for (let i = 0; i < N; i++) s += rA(TAU * (i / N), z);
    const m = s / N; cache.set(key, m); return m;
  };
}
/** peak relief amplitude (mm) along a line = max |r − rowMean|. */
function lineAmp(line: FeatureLine, rA: ReturnType<typeof buildRadiusFn>, H: number, rowMean: (t: number) => number): number {
  let a = 0;
  for (const p of line.points) { const r = rA(TAU * (p.u - Math.floor(p.u)), p.t * H); const d = Math.abs(r - rowMean(p.t)); if (d > a) a = d; }
  return a;
}

describe('TANGLED2 — quality-close (kill the extreme-sliver tail while keeping chord)', () => {
  // ── Q1: MORE optimizeSweeps on Gyroid (cheapest lever) — does the flip/smooth kill the 0.9-1.7deg tail? ──
  it.skipIf(process.env.PF_TANGLED2 !== '1')('Gyroid Q1: optimizeSweeps sweep {2,6,10}', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GyroidManifold' as StyleId;
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    for (const sweeps of [2, 6, 10]) {
      const { rA, run } = rawSteiner(STYLE, sweeps);
      const t0 = Date.now(); const mesh = run(); const ms = Date.now() - t0;
      measure(STYLE, `sw${sweeps}`, mesh, rA, truth, ms, sweeps === 10);
    }
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── Q2 network recon: how does the 27k-line network thin by amplitude gate? (cheap; no full mesh) ──
  it.skipIf(process.env.PF_TANGLED2 !== '1')('Gyroid Q2-recon: network amplitude distribution', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GyroidManifold' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const rm = makeRowMean(rA, DIMS.H);
    const amps = truth.lines.map((l) => lineAmp(l, rA, DIMS.H, rm)).sort((a, b) => a - b);
    const pct = (p: number): number => amps[Math.min(amps.length - 1, Math.floor(p * amps.length))];
    const kinds = new Map<string, number>();
    for (const l of truth.lines) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
    // eslint-disable-next-line no-console
    console.log(`NET: ${truth.lines.length} lines. amp mm p10=${pct(0.1).toFixed(3)} p50=${pct(0.5).toFixed(3)} p90=${pct(0.9).toFixed(3)} max=${amps[amps.length - 1].toFixed(3)}. kinds=${JSON.stringify(Object.fromEntries(kinds))}`);
    for (const thr of [0, pct(0.5), pct(0.75), pct(0.9)]) {
      const kept = truth.lines.filter((l) => lineAmp(l, rA, DIMS.H, rm) >= thr).length;
      // eslint-disable-next-line no-console
      console.log(`  ampGate>=${thr.toFixed(3)}mm → ${kept} lines (${(100 * kept / truth.lines.length).toFixed(0)}%)`);
    }
    expect(amps.length).toBeGreaterThan(0);
  }, 30 * 60 * 1000);

  // ── Q2: PROTECTED crest/valley NETWORK (constraint edges + planarize) so facets ALIGN, not straddle ──
  // Reuses buildFeatureConformingMeshB (inject pinned network points + constraint edges + planarize). Keep
  // chordSteiner + chordTolMm on for the chord; sweeps=2 (Q1 proved MORE sweeps regress). Subsample the
  // network by amplitude gate to keep planarize O(n^2) tractable.
  it.skipIf(process.env.PF_TANGLED2 !== '1')('Gyroid Q2: protected network variants', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GyroidManifold' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const rm = makeRowMean(rA, DIMS.H);
    const amps = truth.lines.map((l) => lineAmp(l, rA, DIMS.H, rm)).sort((a, b) => a - b);
    const pct = (p: number): number => amps[Math.min(amps.length - 1, Math.floor(p * amps.length))];

    // start with the SHARPEST 25% of loci (amp>=p75) as protected constraints — the sliver source is the
    // straddle of the sharpest crest/valley network; gating keeps planarize tractable.
    const variants: Array<{ label: string; thr: number; planarize: boolean; injectStepMm: number }> = [
      { label: 'net_p90', thr: pct(0.9), planarize: true, injectStepMm: 0.06 },
      { label: 'net_p75', thr: pct(0.75), planarize: true, injectStepMm: 0.06 },
    ];
    for (const v of variants) {
      const lineFilter = (l: FeatureLine): boolean => lineAmp(l, rA, DIMS.H, rm) >= v.thr;
      const t0 = Date.now();
      const mesh = buildFeatureConformingMeshB(STYLE, {}, DIMS, {
        ...BASE, optimizeSweeps: 2, guardManifoldAlways: true,
        chordTolMm: 0.03, chordSteiner: true,
        truth, lineFilter, injectStepMm: v.injectStepMm, pin: true,
        planarizeConstraints: v.planarize, guardRecoveryManifold: true, recoveryRobust: true,
        profile: true,
      });
      const ms = Date.now() - t0;
      measure(STYLE, v.label, mesh, rA, truth, ms, true);
    }
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── Q3 DIAGNOSTIC: WHERE is the sw2 extreme-sliver tail? interior vs seam; near-sharp-crest vs body;
  //    needle (2 long 1 short) vs cap (2 short 1 long). Decides if the tail is irreducible or attackable. ──
  it.skipIf(process.env.PF_TANGLED2 !== '1')('Gyroid Q3-diag: localize the sw2 sliver tail', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GyroidManifold' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const rm = makeRowMean(rA, DIMS.H);
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true });
    const ut = Array.from(mesh.ut); const idx = mesh.indices;
    const lift = liftUtToRadial(ut, rA, DIMS.H).vertices;
    const nF = idx.length / 3;
    // classify each sliver (<20deg)
    let nSliver = 0, seamSliver = 0, needle = 0, cap = 0, sharpBand = 0; // sharpBand = centroid |r-rowMean|>0.7mm (near sharp crest)
    let below5 = 0, seamBelow5 = 0;
    const angMin = (a: number, b: number, c: number): number => {
      const ax = lift[3 * a], ay = lift[3 * a + 1], az = lift[3 * a + 2];
      const bx = lift[3 * b], by = lift[3 * b + 1], bz = lift[3 * b + 2];
      const cx = lift[3 * c], cy = lift[3 * c + 1], cz = lift[3 * c + 2];
      const ab = Math.hypot(ax - bx, ay - by, az - bz), bc = Math.hypot(bx - cx, by - cy, bz - cz), ca = Math.hypot(cx - ax, cy - ay, cz - az);
      const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      if (!(area > 1e-12)) return 0;
      const law = (p: number, q: number, r: number): number => Math.acos(Math.max(-1, Math.min(1, (p * p + q * q - r * r) / (2 * p * q)))) * 180 / Math.PI;
      return Math.min(law(bc, ca, ab), law(ab, ca, bc), law(ab, bc, ca));
    };
    for (let f = 0; f < nF; f++) {
      const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
      const m = angMin(a, b, c);
      if (m >= 20) continue;
      nSliver++;
      if (m < 5) below5++;
      // seam: any vertex u within 0.01 of 0/1
      const nearSeam = [a, b, c].some((v) => { const u = ut[2 * v]; return u < 0.01 || u > 0.99; });
      if (nearSeam) { seamSliver++; if (m < 5) seamBelow5++; }
      // needle vs cap by edge lengths
      const eL = [a, b, c].map((_v, i) => { const p = [a, b, c][i], q = [a, b, c][(i + 1) % 3]; return Math.hypot(lift[3 * p] - lift[3 * q], lift[3 * p + 1] - lift[3 * q + 1], lift[3 * p + 2] - lift[3 * q + 2]); }).sort((x, y) => x - y);
      if (eL[2] > 3 * eL[0] && eL[1] > 3 * eL[0]) cap++; else if (eL[2] > 3 * eL[1]) needle++;
      // sharp band: centroid amplitude
      const cu = (ut[2 * a] + ut[2 * b] + ut[2 * c]) / 3, ctv = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const rc = rA(TAU * (cu - Math.floor(cu)), ctv * DIMS.H);
      if (Math.abs(rc - rm(ctv)) > 0.7) sharpBand++;
    }
    // eslint-disable-next-line no-console
    console.log(`Q3 sw2 slivers(<20)=${nSliver} (${(100 * nSliver / nF).toFixed(2)}%) below5=${below5} | seam=${seamSliver} (seamBelow5=${seamBelow5}) | needle=${needle} cap=${cap} | nearSharpCrest=${sharpBand} (${nSliver ? (100 * sharpBand / nSliver).toFixed(0) : 0}%)`);
    expect(nSliver).toBeGreaterThanOrEqual(0);
  }, 60 * 60 * 1000);

  // ── Q4: deeper chordSteiner on Gyroid — does 0.02 push fl-chord ≤0.01 while keeping quality? ──
  it.skipIf(process.env.PF_TANGLED2 !== '1')('Gyroid Q4: chordSteiner depth {0.02}', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GyroidManifold' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    // deeper chord needs more budget: raise maxPoints so the sag guard is not budget-clipped.
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, maxPoints: 2_200_000, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.02, chordSteiner: true });
    const ms = Date.now() - t0;
    measure(STYLE, 'steiner0.02', mesh, rA, truth, ms, true);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  // ── Q5: confirm the WINNING recipe (chordSteiner deep sag, sweeps=2, no network) — PER STYLE, checkpointed. ──
  // Split per style + one tol (0.03) at the Gyroid-equivalent 0.9M budget so each unit checkpoints and a kill
  // resumes cleanly (Voronoi's hash rA is expensive per-eval → keep the unit bounded). build/measure timed.
  it.skipIf(process.env.PF_TANGLED2 !== '1')('Crystalline: chordSteiner confirm', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'Crystalline' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true });
    const bMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`  [Crystalline build] ${bMs}ms tris=${mesh.indices.length / 3}`);
    measure(STYLE, 'steiner0.03', mesh, rA, truth, bMs, true);
    expect(true).toBe(true);
  }, 90 * 60 * 1000);

  it.skipIf(process.env.PF_TANGLED2 !== '1')('Voronoi: chordSteiner confirm', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'Voronoi' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true });
    const bMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`  [Voronoi build] ${bMs}ms tris=${mesh.indices.length / 3}`);
    measure(STYLE, 'steiner0.03', mesh, rA, truth, bMs, true);
    expect(true).toBe(true);
  }, 90 * 60 * 1000);

  // ── Q6: DENSITY-RESPONSE discriminator — deeper chordSteiner (0.015) on Crystalline (helical density-ripple):
  //    does worst-red 0.114 SHRINK with depth (⇒ mechanism-complete, reducible) or is it a FLOOR? ──
  it.skipIf(process.env.PF_TANGLED2 !== '1')('Crystalline Q6: chordSteiner depth 0.015 (density-response)', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'Crystalline' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const t0 = Date.now();
    const mesh = buildInhouseMetricMesh(rA, DIMS.H, { ...BASE, maxPoints: 3_000_000, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: 0.015, chordSteiner: true });
    const bMs = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`  [Crystalline0.015 build] ${bMs}ms tris=${mesh.indices.length / 3}`);
    measure(STYLE, 'steiner0.015', mesh, rA, truth, bMs, true);
    expect(true).toBe(true);
  }, 90 * 60 * 1000);
});
