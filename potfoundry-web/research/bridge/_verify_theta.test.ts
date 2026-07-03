// _verify_theta.test.ts — DEV-ONLY (PF_VERIFY_THETA=1). ADVERSARIAL VERIFIER for the θ-RIDGE axis.
// Default verdict REFUTED. Independently re-meshes the close-partner's ONE reaches001=true claim
// (SpiralRidges, uniform-smooth, hRow 0.20 @3.29M) with THEIR stated recipe (buildScaleColMesh) and
// re-measures with the HONEST rulers from labkit — NOT trusting the partner's numbers.
//
// Attack surface on SpiralRidges (the partner's `honest` fell back to p99(radial.faceErr) because nRed=0:
// no facet exceeded redMm=0.1 radial, so bruteAnchoredRedPerp NEVER FIRED. So their "true-3D 0.0046" is
// actually a RADIAL p99 that was never cross-checked against the true-3D projector):
//   (A) RULER ARTIFACT — run perFaceTrue3DSag (honest facet→nearest-surface projector) directly, and
//       run bruteAnchoredRedPerp with a LOW redMm so it ACTUALLY anchors. Cross-check radial vs true-3D.
//   (B) DENSITY-FRAGILE — re-mesh at HALF density (hRow 0.40) and full (0.20); does p99 blow up / stay ≤0.01?
//   (C) WATERTIGHT — raw-index nonMan (non-vacuous) + weld nonMan, independently.
//   (D) %<20 — whole-mesh minAngle distribution, not a lenient interior/outer subset.
//
// RESILIENCE: one it() per density row; a scorecard row is appended the INSTANT it is scored.
import { describe, it, expect } from 'vitest';
import { existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp,
  auditNonManByIndex, triangleQualityDistribution,
} from './labkit';
import { buildScaleColMesh } from './_scaleColDriver';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_VERIFY_THETA === '1';
const DIR = join(process.cwd(), 'research', 'exchange', '_verify_theta');
const NDJSON = join(DIR, 'verify.ndjson');
// SAME dims the partner used (DIMS in _close_theta.test.ts).
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;

/** raw-index non-manifold (literal index, no weld) — the non-vacuous watertight signal (partner's pattern). */
function auditNonManRaw(indices: ArrayLike<number>): number {
  const NSHARD = 64;
  const ecs: Array<Map<string, number>> = Array.from({ length: NSHARD }, () => new Map<string, number>());
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; const sh = ecs[(p < q ? p : q) & (NSHARD - 1)]; sh.set(key, (sh.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}

function pct(arr: ArrayLike<number>, p: number): number { const s = Float64Array.from(arr as ArrayLike<number>).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; }

function verifyRow(style: StyleId, hRow: number): void {
  mkdirSync(DIR, { recursive: true });
  const rA = buildRadiusFn(style, {}, DIMS);
  const t0 = Date.now();
  const build = buildScaleColMesh(rA, H, { hRowMm: hRow });
  const m = build.mesh;
  const xyz = m.xyz instanceof Float64Array ? m.xyz : Float64Array.from(m.xyz);

  // (A) RADIAL screen + HONEST true-3D projector (independent of the partner's redMm gate).
  const radial = perFaceChordSag(m.ut, m.idx, rA, H);
  const radialP99 = pct(radial.faceErr, 0.99);
  const true3d = perFaceTrue3DSag(m.ut, m.idx, rA, H, { preFilterMm: 0.005 });
  const true3dP99 = pct(true3d.faceErr, 0.99);
  const true3dMax = true3d.worstMm;
  // brute-anchor with a LOW redMm so it ACTUALLY fires on this near-CAD mesh (partner's 0.1 never triggered).
  const nRedLow = (() => { let n = 0; for (let f = 0; f < radial.faceErr.length; f++) if (radial.faceErr[f] > 0.01) n++; return n; })();
  const anchor = nRedLow > 0
    ? bruteAnchoredRedPerp(m.ut, m.idx, rA, H, { redMm: 0.01, sampleN: 60, radial })
    : { trustedP99: 0, gnP99: 0, trustedMax: 0, nRed: 0, gnOver: 0 };

  // (C) watertight — raw + weld
  const rawNM = auditNonManRaw(m.idx);
  const weldNM = auditNonManByIndex(xyz, m.idx);

  // (D) quality — WHOLE mesh minAngle
  const tq = triangleQualityDistribution({ vertices: xyz, indices: m.idx });

  const honestVerdictP99 = anchor.nRed > 0 ? Math.max(true3dP99, anchor.trustedP99) : true3dP99;
  const row = {
    style, hRow, tris: m.nF, path: build.path, builder: build.builder,
    radialP99: +radialP99.toFixed(4), radialMax: +radial.worstMm.toFixed(4),
    true3dP99: +true3dP99.toFixed(4), true3dMax: +true3dMax.toFixed(4),
    anchorTrustedP99: +anchor.trustedP99.toFixed(4), anchorGnP99: +anchor.gnP99.toFixed(4), anchorNRed: anchor.nRed, anchorGnOver: anchor.gnOver,
    radialVsTrue3dRatio: true3dP99 > 1e-9 ? +(radialP99 / true3dP99).toFixed(2) : null,
    pctBelow20: +tq.pctBelow20.toFixed(2), minAngleDeg: +tq.minAngleDeg.toFixed(2), medianMinAngle: +tq.medianMinAngleDeg.toFixed(1),
    rawNonMan: rawNM, weldNonMan: weldNM,
    honestVerdictP99: +honestVerdictP99.toFixed(4),
    reaches001_true3d: honestVerdictP99 <= 0.010,
    reaches001_full: honestVerdictP99 <= 0.010 && tq.pctBelow20 < 5 && rawNM === 0,
    ms: Date.now() - t0,
  };
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  console.log(`[VERIFY] ${style} h=${hRow} tris=${m.nF} radialP99=${row.radialP99} TRUE3D-p99=${row.true3dP99} (max=${row.true3dMax}) anchor(trusted=${row.anchorTrustedP99} gn=${row.anchorGnP99} nRed=${row.anchorNRed}) ratio=${row.radialVsTrue3dRatio} %<20=${row.pctBelow20} minAng=${row.minAngleDeg} rawNM=${rawNM} weldNM=${weldNM} => reaches001_true3d=${row.reaches001_true3d} full=${row.reaches001_full}`);
}

describe('E-2026-07-03-VERIFY-THETA — adversarial re-measure of SpiralRidges reaches001 claim', () => {
  // full density (partner's finest, claimed 0.0046) then HALF density (density-fragility test).
  it.skipIf(!RUN)('SpiralRidges h=0.20 (partner finest)', () => { verifyRow('SpiralRidges' as StyleId, 0.20); expect(existsSync(NDJSON)).toBeTruthy(); }, 30 * 60 * 1000);
  it.skipIf(!RUN)('SpiralRidges h=0.40 (HALF density — fragility)', () => { verifyRow('SpiralRidges' as StyleId, 0.40); expect(existsSync(NDJSON)).toBeTruthy(); }, 30 * 60 * 1000);
});
