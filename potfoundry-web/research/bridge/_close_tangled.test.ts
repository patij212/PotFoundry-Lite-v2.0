// _close_tangled.test.ts — DEV-ONLY (env PF_CLOSE_TANGLED=1). CLOSE the TANGLED axis residual worst-red.
//
// PICKS UP FROM E-2026-07-03-TANGLED2 (_tangled2, SCORECARD.md): the winning recipe = metric-Delaunay under M +
// deep sag (chordSteiner) with LOW sweeps, NO network. Gyroid already CONFIRMED (worst-red brute-anchored true-3D
// p99 = 0.0000 @1.19M, %<20 2.1%, rawNonMan 0). Voronoi + Crystalline: quality + watertight CONFIRMED, fl-chord
// CAD-grade + density-responsive; their ONLY residual = a TINY worst-red set (13-50 facets) at trusted p99 ~0.10.
//
// TASK (this probe): push chordSteiner DEPTH on Voronoi + Crystalline to decide the residual's MECHANISM:
//   - density-responsive-need-more: worst-red trusted p99 keeps SHRINKING toward <=0.01 with depth  ⇒ reducible.
//   - steep-EXCLUDE-radial-overstate: worst-red trusted p99 PLATEAUS (floor) while gnOver=0 (brute AGREES it is a
//     real ~0.1mm near-VERTICAL cliff residual) and the radial sag on that red set is MUCH larger than the trusted
//     true-3D ⇒ radial overstates a designed cliff; true-3D fl-chord already CAD-grade ⇒ steep-EXCLUDE class.
//
// The discriminator = does trusted p99 DROP as tris grow (0.03 -> 0.015 -> 0.010)? Voronoi has NO depth arm yet
// (recon only ran 0.03); Crystalline has 0.03->0.015 (p99 0.114->0.0987 ~flat while nRed 280->13). This probe adds
// Voronoi's depth arm + one deeper Crystalline level + a CLIFF classifier (radialP99 on the red set vs trusted).
//
// Each style-depth is its OWN env-gated `it` + CHECKPOINTS (ndjson row + heatmap bins) the INSTANT computed, and
// SKIPS if its row already exists (resume/env-kill safe). ISOLATED — reuses labkit rulers + committed
// byte-identical-off kernel hooks READ-ONLY; edits NOTHING in src/, labkit, inhouseMetricMesh, or styles.
import { describe, it, expect } from 'vitest';
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth,
  buildMeshUt, buildLocator, featureLineChord3D, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_close_tangled');
const LEDGER = join(DIR, 'scorecard.ndjson');
// Match the recon's screening budget so V0 rows reproduce _tangled2; raise maxPoints per-depth so the sag guard is
// not budget-clipped (a clipped chordSteiner would fake a "floor" that is really a budget cap).
const BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;

interface Row {
  style: string; label: string; tolMm: number; tris: number;
  flChordP99: number; flMax: number;
  trustedP99: number; trustedMax: number; gnP99: number; gnOver: number; nSample: number; nRed: number;
  redRadialP99: number; redRadialMax: number; // radial sag on the SAME red facets → shows the overstatement
  minA: number; p5: number; median: number; pctB10: number; pctB20: number;
  nonMan: number; ms: number;
}

/** Was this style+label already scored? (resume/env-kill safe.) */
function alreadyScored(style: string, label: string): boolean {
  if (!existsSync(LEDGER)) return false;
  const txt = readFileSync(LEDGER, 'utf8');
  for (const ln of txt.split('\n')) {
    if (!ln.trim()) continue;
    try { const r = JSON.parse(ln) as Row; if (r.style === style && r.label === label) return true; } catch { /* skip */ }
  }
  return false;
}

function scoreOne(style: StyleId, label: string, tolMm: number, maxPoints: number): Row {
  const rA = buildRadiusFn(style, {}, DIMS);
  const truth = buildFeatureTruth(style, {}, DIMS, 384);
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...BASE, maxPoints, optimizeSweeps: 2, guardManifoldAlways: true, chordTolMm: tolMm, chordSteiner: true,
  });
  const ms = Date.now() - t0;
  const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const loc = buildLocator(meshUt, 256);
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
  const fl3 = featureLineChord3D(interior, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: mesh.indices });
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);
  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 });
  // radial sag on the SAME reddest facets bruteAnchoredRedPerp sampled → direct overstatement evidence.
  const redFaces: number[] = [];
  for (let f = 0; f < radial.faceErr.length; f++) if (radial.faceErr[f] > 0.1) redFaces.push(f);
  redFaces.sort((a, b) => radial.faceErr[b] - radial.faceErr[a]);
  const redSample = redFaces.slice(0, anchored.nSample).map((f) => radial.faceErr[f]).sort((a, b) => a - b);
  const redRadialP99 = redSample.length ? redSample[Math.min(redSample.length - 1, Math.floor(0.99 * redSample.length))] : 0;
  const redRadialMax = redSample.length ? redSample[redSample.length - 1] : 0;

  const row: Row = {
    style, label, tolMm, tris: idx.length / 3,
    flChordP99: +fl3.p99Mm.toFixed(4), flMax: +fl3.maxMm.toFixed(3),
    trustedP99: +anchored.trustedP99.toFixed(4), trustedMax: +anchored.trustedMax.toFixed(4),
    gnP99: +anchored.gnP99.toFixed(3), gnOver: anchored.gnOver, nSample: anchored.nSample, nRed: anchored.nRed,
    redRadialP99: +redRadialP99.toFixed(3), redRadialMax: +redRadialMax.toFixed(3),
    minA: q.minAngleDeg, p5: q.p5MinAngleDeg, median: q.medianMinAngleDeg, pctB10: q.pctBelow10, pctB20: q.pctBelow20,
    nonMan, ms: Math.round(ms),
  };
  // CHECKPOINT — append the row the INSTANT it is computed (resumable / env-kill safe).
  appendFileSync(LEDGER, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`${style}/${label.padEnd(14)} tol=${tolMm} tris=${String(row.tris).padStart(8)} flP99=${row.flChordP99} | worstRed trusted=${row.trustedP99}(max ${row.trustedMax},gn ${row.gnP99},over ${row.gnOver},red ${row.nRed}) redRadialP99=${row.redRadialP99} | minA=${row.minA} %<20=${row.pctB20} nonMan=${row.nonMan} ${row.ms}ms`);
  // Heatmap: on the CHEAP GN ruler only (no anchorSteep brute-recompute — that took ~24min on Voronoi's hash rA
  // and blows the per-style budget on VISUALIZATION; the trusted VERDICT number is already `anchored.trustedP99`).
  // Gate the heatmap behind PF_CT_HEATMAP so the depth arms stay fast; the row is the deliverable.
  if (process.env.PF_CT_HEATMAP === '1') {
    const mu = buildMeshUt(ut, idx, rA, DIMS.H);
    dumpHeatmap(DIR, `ct_${style}_${label}_chord`, mu.xyz, ut, idx, rA, DIMS.H, { stl: false });
  }
  return row;
}

describe('CLOSE-TANGLED — residual worst-red depth push (density-responsive vs steep-EXCLUDE)', () => {
  // ── Voronoi depth arm (the missing 0.015 point) — does trusted p99 0.093 shrink toward <=0.01 with depth? ──
  it.skipIf(process.env.PF_CLOSE_TANGLED !== '1')('Voronoi @0.03 (screen repro)', () => {
    mkdirSync(DIR, { recursive: true });
    if (alreadyScored('Voronoi', 'steiner0.03')) { console.log('SKIP Voronoi/0.03 (already scored)'); return; }
    scoreOne('Voronoi' as StyleId, 'steiner0.03', 0.03, 900_000);
    expect(true).toBe(true);
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_CLOSE_TANGLED !== '1')('Voronoi @0.015 (depth arm)', () => {
    mkdirSync(DIR, { recursive: true });
    if (alreadyScored('Voronoi', 'steiner0.015')) { console.log('SKIP Voronoi/0.015 (already scored)'); return; }
    // Voronoi's hash rA is ~10x costlier per-eval than Crystalline; 3M points + brute-anchor was >37min (env-kill
    // risk). Cap at 2.2M — still a MEANINGFUL density increase over the 1.8M@0.03 point to test depth-response,
    // while staying tractable. If tris hit the cap, that is reported (a capped chord = "need more budget", not floor).
    scoreOne('Voronoi' as StyleId, 'steiner0.015', 0.015, 2_200_000);
    expect(true).toBe(true);
  }, 90 * 60 * 1000);

  // ── Crystalline deeper level (0.010) — does the ~0.10 residual keep dropping (responsive) or PLATEAU (floor)? ──
  // NOTE: the recon (_tangled2 / SCORECARD.md) ALREADY has Crystalline's clean depth arm: 0.03 (1.8M, trusted p99
  // 0.114, nRed 280) → 0.015 (3.46M, trusted p99 0.0987, nRed 13) — density DOUBLED, p99 PLATEAUED (~13% drop),
  // count COLLAPSED. That is the plateau/steep-EXCLUDE signature. A 0.010 arm at 5M blew the build budget (>31min,
  // env-kill risk) and — capped BELOW 3.46M — would be a LOWER-density point, not deeper. So the Crystalline depth
  // conclusion stands on the recon arm; this `it` is kept for optional deeper confirm at a raised budget only.
  it.skipIf(process.env.PF_CLOSE_TANGLED !== '1' || process.env.PF_CT_CRYST010 !== '1')('Crystalline @0.010 (optional deeper confirm)', () => {
    mkdirSync(DIR, { recursive: true });
    if (alreadyScored('Crystalline', 'steiner0.010')) { console.log('SKIP Crystalline/0.010 (already scored)'); return; }
    scoreOne('Crystalline' as StyleId, 'steiner0.010', 0.010, 5_000_000);
    expect(true).toBe(true);
  }, 120 * 60 * 1000);
});
