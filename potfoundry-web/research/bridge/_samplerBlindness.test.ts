// _samplerBlindness.test.ts — HOW BLIND is the conforming refiner's own surface? (PF_SBLIND=1)
//
// HYPOTHESIS (pre-registered, written BEFORE any style was measured):
//   The conforming sag refiner scores/refines against `styleSampler` — a 512x512 BILINEAR grid of
//   pre-evaluated positions. If that grid's OWN deviation from the exact analytic surface
//   (`buildAnalyticRadiusFn`) exceeds the 0.01mm export standard, then NO amount of density or budget
//   can drive a sampler-scored mesh below that deviation: the refiner cannot SEE the residual it is
//   supposed to remove. Styles whose relief wavelength is <= ~2 sampler cells are therefore
//   STRUCTURALLY INCAPABLE of a 0.01mm result through sampler-scored refinement.
//
// KILL-CRITERION (pre-registered):
//   A style is STRUCTURALLY BLIND iff  max |sampler.position(u,t) - exact(u,t)| > 0.01 mm  at the
//     PRODUCTION 512^2 grid, at production dims (H120/Rb45/Rt70/expn1.1, registry defaults).
//   The claim is REFUTED (blindness is not the mechanism) iff every style in
//     {GeometricStar, Crystalline, GyroidManifold, Voronoi} measures <= 0.01mm — i.e. the sampler is
//     already CAD-grade and the "density diverges" class must have another cause.
//   The smooth CONTROL (HarmonicRipple) is expected <= 0.01mm; if the control is ALSO blind the
//     measurement is contaminated (the ruler, not the styles) and the row is void.
//
// SECOND INSTRUMENT — the blindness the refiner actually acts on (not just position error):
//   h_cmd  = MetricSizingField(sampler).edgeLength(u*,t*)  — the target edge length the PRODUCTION
//            sizing field commands at the worst-error point, at a 0.01mm sag target.
//   h_req  = the largest arc length whose EXACT-surface chord sag at (u*,t*) is <= 0.01mm
//            (bisection on the exact surface; the honest requirement).
//   ratio  = h_cmd / h_req  — "the refiner commands N-times-too-long edges and cannot see it".
//
// CONTROLS: identical dims/params for every style; ONE surface pair per style (styleSampler vs
// buildAnalyticRadiusFn) — the SAME src primitives production uses. Sampling is OFF-NODE by
// construction (u=(i+.5)/nU, t=(j+.5)/nT) so grid nodes (where the error is 0 by construction)
// are never sampled. Convergence arm re-measures at 1024^2 / 2048^2 to prove it is O(h^2) grid
// error, not a bug.
//
// Resilience: one it() per arm; ndjson appended the INSTANT a style finishes.
import { describe, it } from 'vitest';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { styleSampler } from '../../src/renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { buildAnalyticRadiusFn } from '../../src/geometry/analyticRadius';
import { MetricSizingField } from '../../src/renderers/webgpu/parametric/conforming/MetricSizingField';
import type { StyleId } from '../../src/geometry/types';

const OUT = join('research', 'exchange', '_samplerBlindness');
mkdirSync(OUT, { recursive: true });
const NDJSON = join(OUT, 'blindness.ndjson');

/** PROD dims — the E-2026-07-23-HARDCARD / E-2026-07-24-GEOSTAR-LOCUS config. */
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const TAU = 2 * Math.PI;

const STYLES: StyleId[] = [
  'GeometricStar',
  'Crystalline',
  'GyroidManifold',
  'Voronoi',
  'HarmonicRipple', // smooth CONTROL
];

type Rad = (theta: number, z: number) => number;

function exactPos(rA: Rad, u: number, t: number): [number, number, number] {
  const th = u * TAU;
  const z = t * DIMS.H;
  const r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

interface BlindRow {
  style: string;
  gridU: number;
  gridT: number;
  nSamples: number;
  /** max |sampler - exact| over the off-node sample set (mm, 3D distance). */
  max3D: number;
  p999: number;
  p99: number;
  mean: number;
  /** argmax location. */
  uStar: number;
  tStar: number;
  /** sampler grid cell width at mid-height, in mm of arc. */
  cellArcMm: number;
  /** commanded vs required edge length at the argmax (0.01mm sag target). */
  hCmdMm?: number;
  hReqMm?: number;
  blindRatio?: number;
  blind: boolean;
  ms: number;
}

/**
 * Max 3D deviation of the pre-evaluated bilinear sampler from the exact analytic surface,
 * measured OFF-NODE (grid nodes are exact by construction so they carry no information).
 */
function measureGridError(
  style: StyleId, gridU: number, gridT: number, nU: number, nT: number,
): { max3D: number; p999: number; p99: number; mean: number; uStar: number; tStar: number } {
  const sampler = styleSampler(style, {}, { ...DIMS, gridResU: gridU, gridResT: gridT });
  const rA = buildAnalyticRadiusFn(style, {}, DIMS);
  let max3D = 0;
  let uStar = 0;
  let tStar = 0;
  let sum = 0;
  // Reservoir of all errors would be 2M doubles = 16MB — acceptable, and we want exact quantiles.
  const errs = new Float64Array(nU * nT);
  let k = 0;
  for (let j = 0; j < nT; j++) {
    const t = (j + 0.5) / nT;
    for (let i = 0; i < nU; i++) {
      const u = (i + 0.5) / nU;
      const s = sampler.position(u, t);
      const e = exactPos(rA, u, t);
      const d = Math.hypot(s[0] - e[0], s[1] - e[1], s[2] - e[2]);
      errs[k++] = d;
      sum += d;
      if (d > max3D) { max3D = d; uStar = u; tStar = t; }
    }
  }
  errs.sort();
  const q = (f: number): number => errs[Math.min(errs.length - 1, Math.floor(f * errs.length))];
  return { max3D, p999: q(0.999), p99: q(0.99), mean: sum / errs.length, uStar, tStar };
}

/**
 * Largest arc length h (mm, along u at fixed t) whose EXACT-surface chord sag at (u,t) is <= sagMm.
 * Bisection on h; the sag is the max distance from the exact curve to the chord joining the two
 * endpoints of a u-interval of that arc length CENTRED on (u,t) — measured on the exact surface,
 * so it is the honest requirement the refiner is supposed to meet.
 */
function requiredArcMm(rA: Rad, u: number, t: number, sagMm: number): number {
  const r0 = rA(u * TAU, t * DIMS.H);
  const circ = TAU * Math.max(r0, 1e-6); // mm of arc per unit u
  const sagForArc = (arc: number): number => {
    const du = arc / circ;
    const a = exactPos(rA, u - du / 2, t);
    const b = exactPos(rA, u + du / 2, t);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    let worst = 0;
    const N = 64;
    for (let s = 1; s < N; s++) {
      const p = exactPos(rA, u - du / 2 + (du * s) / N, t);
      const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]];
      const tt = L2 > 0 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / L2)) : 0;
      const d = Math.hypot(ap[0] - tt * ab[0], ap[1] - tt * ab[1], ap[2] - tt * ab[2]);
      if (d > worst) worst = d;
    }
    return worst;
  };
  let lo = 1e-4; // mm — assumed to satisfy sag
  let hi = 8;    // mm — maxEdgeMm
  if (sagForArc(hi) <= sagMm) return hi;
  if (sagForArc(lo) > sagMm) return lo;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (sagForArc(mid) <= sagMm) lo = mid; else hi = mid;
  }
  return lo;
}

function runStyleBlindness(style: StyleId, gridU: number, gridT: number, withSizing: boolean): void {
  const t0 = Date.now();
  const nU = Number(process.env.PF_SBLIND_NU ?? 2048);
  const nT = Number(process.env.PF_SBLIND_NT ?? 1024);
  const m = measureGridError(style, gridU, gridT, nU, nT);
  const rA = buildAnalyticRadiusFn(style, {}, DIMS);
  const midR = rA(0, DIMS.H / 2);
  const row: BlindRow = {
    style, gridU, gridT, nSamples: nU * nT,
    max3D: +m.max3D.toFixed(5), p999: +m.p999.toFixed(5), p99: +m.p99.toFixed(5), mean: +m.mean.toFixed(6),
    uStar: +m.uStar.toFixed(6), tStar: +m.tStar.toFixed(6),
    cellArcMm: +((TAU * midR) / gridU).toFixed(4),
    blind: m.max3D > 0.01,
    ms: 0,
  };
  if (withSizing) {
    // The production sizing field, built on the SAMPLER exactly as buildConformingWall does.
    const sampler = styleSampler(style, {}, { ...DIMS, gridResU: gridU, gridResT: gridT });
    const field = new MetricSizingField(sampler, {
      maxSagMm: 0.01, minEdgeMm: 0.02, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128,
    });
    row.hCmdMm = +field.edgeLength(m.uStar, m.tStar).toFixed(4);
    row.hReqMm = +requiredArcMm(rA, m.uStar, m.tStar, 0.01).toFixed(4);
    row.blindRatio = +(row.hCmdMm / Math.max(row.hReqMm, 1e-9)).toFixed(2);
  }
  row.ms = Date.now() - t0;
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  /* eslint-disable no-console */
  console.log(
    `[SBLIND ${style} @${gridU}x${gridT}] max3D=${row.max3D}mm p99.9=${row.p999} p99=${row.p99} mean=${row.mean} ` +
    `| argmax u=${row.uStar} t=${row.tStar} | cellArc=${row.cellArcMm}mm | ${row.blind ? 'STRUCTURALLY BLIND' : 'ok (<=0.01)'}` +
    (withSizing ? ` | h_cmd=${row.hCmdMm}mm h_req=${row.hReqMm}mm ratio=${row.blindRatio}x` : '') +
    ` (${row.ms}ms)`,
  );
  /* eslint-enable no-console */
}

/**
 * WORST-CASE refiner blindness: max over a stratified (u,t) scan of h_cmd/h_req.
 *
 * The position-error argmax is NOT where the refiner is most blind — a big position error can sit
 * on a region the field happens to size finely anyway. The decision-relevant statistic is
 * "commanded edge length / required edge length" maximised over the domain: that is exactly the
 * factor by which a sampler-scored mesh under-tessellates a locus it cannot see.
 */
function runBlindRatioScan(style: StyleId, gridU: number, gridT: number): void {
  const t0 = Date.now();
  const nU = Number(process.env.PF_SBLIND_RU ?? 256);
  const nT = Number(process.env.PF_SBLIND_RT ?? 64);
  const sampler = styleSampler(style, {}, { ...DIMS, gridResU: gridU, gridResT: gridT });
  const rA = buildAnalyticRadiusFn(style, {}, DIMS);
  const field = new MetricSizingField(sampler, {
    maxSagMm: 0.01, minEdgeMm: 0.02, maxEdgeMm: 8, gradeRatio: 2, resU: 128, resT: 128,
  });
  let worst = 0;
  let uStar = 0;
  let tStar = 0;
  let hCmdAt = 0;
  let hReqAt = 0;
  for (let j = 0; j < nT; j++) {
    const t = (j + 0.5) / nT;
    for (let i = 0; i < nU; i++) {
      const u = (i + 0.5) / nU;
      const hReq = requiredArcMm(rA, u, t, 0.01);
      const hCmd = field.edgeLength(u, t);
      const ratio = hCmd / Math.max(hReq, 1e-9);
      if (ratio > worst) { worst = ratio; uStar = u; tStar = t; hCmdAt = hCmd; hReqAt = hReq; }
    }
  }
  const row = {
    style, gridU, gridT, arm: 'ratioScan', nSamples: nU * nT,
    worstRatio: +worst.toFixed(2), uStar: +uStar.toFixed(6), tStar: +tStar.toFixed(6),
    hCmdMm: +hCmdAt.toFixed(4), hReqMm: +hReqAt.toFixed(4), ms: Date.now() - t0,
  };
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  /* eslint-disable no-console */
  console.log(
    `[SBLIND-RATIO ${style} @${gridU}x${gridT}] WORST h_cmd/h_req = ${row.worstRatio}x ` +
    `(h_cmd=${row.hCmdMm}mm vs h_req=${row.hReqMm}mm) at u=${row.uStar} t=${row.tStar} (${row.ms}ms)`,
  );
  /* eslint-enable no-console */
}

const ONLY = process.env.PF_SBLIND_STYLE;
const wants = (s: string): boolean => !ONLY || ONLY === s;

describe.skipIf(process.env.PF_SBLIND !== '1')('styleSampler blindness vs the exact analytic surface', () => {
  for (const style of STYLES) {
    it.skipIf(!wants(style))(`${style} @ production 512^2`, () => {
      runStyleBlindness(style, 512, 512, true);
    }, 1_800_000);
  }
  // The GPU export sampler is 256^2 (ParametricExportComputer DENSE_RES_U default), NOT the lab
  // styleSampler's 512^2 — production is one octave BLINDER than the lab harness.
  it.skipIf(process.env.PF_SBLIND_PROD !== '1')('PRODUCTION 256^2 (the real GPU export sampler)', () => {
    for (const style of STYLES) runStyleBlindness(style, 256, 256, true);
  }, 3_600_000);
  it.skipIf(process.env.PF_SBLIND_CONV !== '1')('CONVERGENCE — 1024^2 / 2048^2 (is it O(h^2) grid error?)', () => {
    for (const style of STYLES) {
      for (const g of [1024, 2048]) runStyleBlindness(style, g, g, false);
    }
  }, 3_600_000);
  it.skipIf(process.env.PF_SBLIND_RATIO !== '1')('WORST-CASE blindness ratio scan (h_cmd / h_req)', () => {
    for (const style of STYLES) runBlindRatioScan(style, 512, 512);
  }, 3_600_000);
});
