/**
 * junctionWedge.featurefollow.test.ts — STEP 2 (throwaway) DECISIVE real-surface
 * strip-pave quality probe + construction-sensitivity analysis.
 *
 * The Step-2 flat-patch spike deleted surface relief; a straight-transverse-ribbon
 * probe slivered ~82%; BOTH use the wrong arm geometry. The real feature-aligned
 * mesher (Step 1) builds FEATURE-FOLLOWING bands — crest rail ALONG the ridge
 * spine, rows PARALLEL — proven clean (40-46°) but only on ONE smooth analytic SFB
 * ridge. This probe asks whether feature-following strip-pave stays clean on REAL
 * detected Voronoi/Gyroid ridges, and ISOLATES the construction sensitivities the
 * real mesher must get right.
 *
 * For each real ridge edge it paves THREE bands on the REAL surface and compares
 * worst 3D min-angle:
 *   (FF-raw)  crest = RAW detected polyline; foot = perpendicular offset, side
 *             chosen per-point by lower relief (the naive build).
 *   (FF-cond) crest = SMOOTHED + arclength-resampled spine; foot = offset on ONE
 *             consistent side (the conditioned build a real mesher would use).
 *   (straight) crest = straight (u,t) segment along the initial tangent; foot =
 *             parallel offset (the relief-crossing model).
 * All arc-length densified (the densifyRail fix). Controls: Voronoi + Gyroid (high
 * relief) vs HarmonicRipple (mild).
 *
 * READ: FF-cond ≫ FF-raw isolates spine/offset CONDITIONING as the lever. FF-cond
 * clean (≥~20°) ⇒ thesis holds on real relief WITH spine conditioning. FF-cond
 * still slivered ⇒ a deeper real-relief problem (narrow-cell crossing). Throwaway.
 *
 * @module fidelity/bandRemesh/junctionWedge.featurefollow.test
 */

import { describe, it, expect } from 'vitest';
import { styleSampler } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import type { StyleSamplerDims } from '../../renderers/webgpu/parametric/conforming/featureGraph/styleSampler';
import { detectFeatures } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { DetectFeaturesOptions } from '../../renderers/webgpu/parametric/conforming/featureGraph/detectFeatures';
import type { SurfaceSampler, Vec3 } from '../../renderers/webgpu/parametric/conforming/SurfaceSampler';
import type { FeatureEdge } from '../../renderers/webgpu/parametric/conforming/featureGraph/types';
import { buildStations } from './stations';
import type { StationPoint } from './stations';
import { paveBand } from './paver';
import type { Mesh3 } from './audit';

const DIMS: StyleSamplerDims = { H: 100, Rt: 40, Rb: 30, expn: 1 };
const U_TO_MM = 2 * Math.PI * ((DIMS.Rt + DIMS.Rb) / 2);
const T_TO_MM = DIMS.H;

const GLOBAL_OPTS: Omit<DetectFeaturesOptions, 'reliefIndicator'> = {
  coarseRes: 40, fineRes: 120, minStrength: 1.0, minAngleDeg: 28,
  uToMm: U_TO_MM, tToMm: T_TO_MM,
  creaseContrast: { windowRadius: 5, factor: 0.6, absFloorDeg: 8 },
};
const RELIEF_MEAN_SAMPLES = 256, RELIEF_ALPHA = 0.5, RELIEF_ABS_FLOOR_MM = 1e-3;

function samplerRadius(s: SurfaceSampler, u: number, t: number): number {
  const [x, y] = s.position(u, t); return Math.hypot(x, y);
}
function makeReliefIndicator(s: SurfaceSampler): (u: number, t: number) => number {
  const rowStats = new Map<number, { mean: number; floor: number }>();
  const statsAtT = (t: number): { mean: number; floor: number } => {
    const cached = rowStats.get(t); if (cached !== undefined) return cached;
    let sum = 0; const rs = new Float64Array(RELIEF_MEAN_SAMPLES);
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const r = samplerRadius(s, i / RELIEF_MEAN_SAMPLES, t); rs[i] = r; sum += r; }
    const mean = sum / RELIEF_MEAN_SAMPLES; let sq = 0;
    for (let i = 0; i < RELIEF_MEAN_SAMPLES; i++) { const d = rs[i] - mean; sq += d * d; }
    const stats = { mean, floor: Math.max(RELIEF_ABS_FLOOR_MM, RELIEF_ALPHA * Math.sqrt(sq / RELIEF_MEAN_SAMPLES)) };
    rowStats.set(t, stats); return stats;
  };
  return (u, t) => { const { mean, floor } = statsAtT(t); return Math.abs(samplerRadius(s, u, t) - mean) - floor; };
}
function globalOpts(s: SurfaceSampler): DetectFeaturesOptions { return { ...GLOBAL_OPTS, reliefIndicator: makeReliefIndicator(s) }; }

// ── 3D helpers ──────────────────────────────────────────────────────────────
function sub3(a: Vec3, b: Vec3): [number, number, number] { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function dot3(a: Vec3, b: Vec3): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function len3(a: Vec3): number { return Math.hypot(a[0], a[1], a[2]); }
function triMinAngle(A: Vec3, B: Vec3, C: Vec3): number {
  const a = len3(sub3(B, C)), b = len3(sub3(C, A)), c = len3(sub3(A, B));
  const ang = (x: number, y: number, o: number): number => {
    if (x <= 0 || y <= 0) return 0;
    return (Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - o * o) / (2 * x * y)))) * 180) / Math.PI;
  };
  return Math.min(ang(b, c, a), ang(a, c, b), ang(a, b, c));
}
function bandWorst(mesh: Mesh3): number {
  const { positions, indices } = mesh;
  const P = (i: number): Vec3 => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  let worst = Infinity;
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || c === a) continue;
    const m = triMinAngle(P(a), P(b), P(c)); if (m < worst) worst = m;
  }
  return worst === Infinity ? 0 : worst;
}

const METRIC_EPS = 1e-4;

function metricAt(s: SurfaceSampler, u: number, t: number): { pu: Vec3; pt: Vec3; E: number; F: number; G: number } {
  const pu = sub3(s.position(u + METRIC_EPS, t), s.position(u - METRIC_EPS, t)).map((x) => x / (2 * METRIC_EPS)) as [number, number, number];
  const pt = sub3(s.position(u, t + METRIC_EPS), s.position(u, t - METRIC_EPS)).map((x) => x / (2 * METRIC_EPS)) as [number, number, number];
  return { pu, pt, E: dot3(pu, pu), F: dot3(pu, pt), G: dot3(pt, pt) };
}

/**
 * Unit-3D-length UV perpendicular to a UV tangent (du,dt) at (u,t): the (a,b) such
 * that a·pos_u + b·pos_t ≈ (normal × tangent3D)/|·| (3D step length 1). Deterministic
 * (+normal×tangent side); the caller picks the sign. Falls back to (du⊥,0) on a
 * degenerate metric.
 */
function perpDir(s: SurfaceSampler, u: number, t: number, du: number, dt: number): { a: number; b: number } {
  const { pu, pt, E, F, G } = metricAt(s, u, t);
  const tan3: Vec3 = [pu[0] * du + pt[0] * dt, pu[1] * du + pt[1] * dt, pu[2] * du + pt[2] * dt];
  const nrm: Vec3 = [pu[1] * pt[2] - pu[2] * pt[1], pu[2] * pt[0] - pu[0] * pt[2], pu[0] * pt[1] - pu[1] * pt[0]];
  let perp3: Vec3 = [nrm[1] * tan3[2] - nrm[2] * tan3[1], nrm[2] * tan3[0] - nrm[0] * tan3[2], nrm[0] * tan3[1] - nrm[1] * tan3[0]];
  const pl = len3(perp3) || 1; perp3 = [perp3[0] / pl, perp3[1] / pl, perp3[2] / pl];
  const det = E * G - F * F;
  if (!(Math.abs(det) > 1e-12)) return { a: -dt, b: du };
  const rhsU = dot3(pu, perp3), rhsT = dot3(pt, perp3);
  let a = (rhsU * G - rhsT * F) / det;
  let b = (rhsT * E - rhsU * F) / det;
  const step3 = Math.sqrt(Math.max(1e-12, E * a * a + 2 * F * a * b + G * b * b));
  a /= step3; b /= step3;
  return { a, b };
}

function clipPolyline3D(poly: StationPoint[], s: SurfaceSampler, maxMm: number): StationPoint[] {
  if (poly.length < 2) return poly.map((p) => ({ u: p.u, t: p.t }));
  const out: StationPoint[] = [{ u: poly[0].u, t: poly[0].t }];
  let acc = 0;
  for (let i = 1; i < poly.length; i++) {
    const a = out[out.length - 1], b = poly[i];
    const seg = len3(sub3(s.position(b.u, b.t), s.position(a.u, a.t)));
    if (acc + seg >= maxMm) {
      const f = (maxMm - acc) / (seg || 1);
      out.push({ u: a.u + (b.u - a.u) * f, t: a.t + (b.t - a.t) * f });
      return out;
    }
    out.push({ u: b.u, t: b.t }); acc += seg;
  }
  return out;
}

function arcLen3D(poly: StationPoint[], s: SurfaceSampler): number {
  let acc = 0;
  for (let i = 1; i < poly.length; i++) acc += len3(sub3(s.position(poly[i].u, poly[i].t), s.position(poly[i - 1].u, poly[i - 1].t)));
  return acc;
}

/** Light Laplacian smoothing of a polyline in (u,t) (shortest-arc u), endpoints fixed. */
function smoothPolyline(poly: StationPoint[], passes: number): StationPoint[] {
  let cur = poly.map((p) => ({ u: p.u, t: p.t }));
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.map((p) => ({ u: p.u, t: p.t }));
    for (let i = 1; i < cur.length - 1; i++) {
      const a = cur[i - 1], c = cur[i + 1];
      let dua = a.u - cur[i].u; if (dua > 0.5) dua -= 1; if (dua < -0.5) dua += 1;
      let duc = c.u - cur[i].u; if (duc > 0.5) duc -= 1; if (duc < -0.5) duc += 1;
      next[i] = { u: cur[i].u + 0.25 * (dua + duc), t: cur[i].t + 0.25 * (a.t + c.t - 2 * cur[i].t) };
    }
    cur = next;
  }
  return cur;
}

/** Resample a polyline to even 3D arclength steps (~stepMm), endpoints preserved. */
function resampleArcLen(poly: StationPoint[], s: SurfaceSampler, stepMm: number): StationPoint[] {
  if (poly.length < 2) return poly.map((p) => ({ u: p.u, t: p.t }));
  const cum: number[] = [0];
  for (let i = 1; i < poly.length; i++) cum.push(cum[i - 1] + len3(sub3(s.position(poly[i].u, poly[i].t), s.position(poly[i - 1].u, poly[i - 1].t))));
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.round(total / stepMm));
  const out: StationPoint[] = [];
  let seg = 1;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * total;
    while (seg < poly.length - 1 && cum[seg] < target) seg++;
    const lo = seg - 1, hi = seg;
    const f = cum[hi] > cum[lo] ? (target - cum[lo]) / (cum[hi] - cum[lo]) : 0;
    let du = poly[hi].u - poly[lo].u; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
    out.push({ u: poly[lo].u + du * f, t: poly[lo].t + (poly[hi].t - poly[lo].t) * f });
  }
  return out;
}

function tangentUV(poly: StationPoint[], i: number): { du: number; dt: number } {
  const a = poly[Math.max(0, i - 1)], b = poly[Math.min(poly.length - 1, i + 1)];
  let du = (b.u - a.u) % 1; if (du > 0.5) du -= 1; if (du < -0.5) du += 1;
  const dt = b.t - a.t; const l = Math.hypot(du, dt) || 1;
  return { du: du / l, dt: dt / l };
}

const W_MM = 4.0, MAX_LEN_MM = 18.0, EDGE_MM = 3.0;

function densifyArcLen(rail: readonly StationPoint[], s: SurfaceSampler, maxMm: number): StationPoint[] {
  if (rail.length < 2) return rail.map((p) => ({ u: p.u, t: p.t }));
  const out: StationPoint[] = [{ u: rail[0].u, t: rail[0].t }];
  const seg3 = (a: StationPoint, b: StationPoint): number => len3(sub3(s.position(b.u, b.t), s.position(a.u, a.t)));
  for (let i = 1; i < rail.length; i++) {
    const a = rail[i - 1], b = rail[i];
    let n = Math.max(1, Math.ceil(seg3(a, b) / maxMm));
    for (let iter = 0; iter < 12; iter++) {
      let maxGap = 0; let prev = a;
      for (let k = 1; k <= n; k++) { const al = k / n; const cur = { u: a.u + (b.u - a.u) * al, t: a.t + (b.t - a.t) * al }; maxGap = Math.max(maxGap, seg3(prev, cur)); prev = cur; }
      if (maxGap <= maxMm) break;
      n = Math.ceil(n * (maxGap / maxMm) * 1.05) + 1; if (n > 20000) break;
    }
    for (let k = 1; k < n; k++) { const al = k / n; out.push({ u: a.u + (b.u - a.u) * al, t: a.t + (b.t - a.t) * al }); }
    out.push({ u: b.u, t: b.t });
  }
  return out;
}

function paveAndWorst(foot: StationPoint[], crest: StationPoint[], s: SurfaceSampler): number | null {
  const cap = (EDGE_MM / 2) * 0.9;
  try {
    const grid = buildStations(densifyArcLen(foot, s, cap), densifyArcLen(crest, s, cap), s, EDGE_MM);
    if (grid.rows.length < 2) return null;
    const band = paveBand(grid, s);
    const positions = new Float32Array(band.utVertices.length * 3);
    for (let i = 0; i < band.utVertices.length; i++) {
      const p = s.position(band.utVertices[i][0], band.utVertices[i][1]);
      positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
    }
    return bandWorst({ positions, indices: band.indices });
  } catch { return null; }
}

/** FF-raw foot: perpendicular offset, side chosen per-point by lower relief. */
function footRaw(crest: StationPoint[], s: SurfaceSampler): StationPoint[] {
  return crest.map((p, i) => {
    const tan = tangentUV(crest, i);
    const d = perpDir(s, p.u, p.t, tan.du, tan.dt);
    const rPlus = samplerRadius(s, p.u + d.a * W_MM * 0.5, p.t + d.b * W_MM * 0.5);
    const rMinus = samplerRadius(s, p.u - d.a * W_MM * 0.5, p.t - d.b * W_MM * 0.5);
    const sign = rPlus <= rMinus ? 1 : -1;
    return { u: p.u + sign * d.a * W_MM, t: p.t + sign * d.b * W_MM };
  });
}

/** FF-cond foot: ONE consistent side (majority lower-relief vote), on the smoothed spine. */
function footConsistent(crest: StationPoint[], s: SurfaceSampler): StationPoint[] {
  let vote = 0;
  const dirs = crest.map((p, i) => {
    const tan = tangentUV(crest, i);
    const d = perpDir(s, p.u, p.t, tan.du, tan.dt);
    const rPlus = samplerRadius(s, p.u + d.a * W_MM * 0.5, p.t + d.b * W_MM * 0.5);
    const rMinus = samplerRadius(s, p.u - d.a * W_MM * 0.5, p.t - d.b * W_MM * 0.5);
    vote += rPlus <= rMinus ? 1 : -1;
    return d;
  });
  const sign = vote >= 0 ? 1 : -1;
  return crest.map((p, i) => ({ u: p.u + sign * dirs[i].a * W_MM, t: p.t + sign * dirs[i].b * W_MM }));
}

function pctl(arr: number[], p: number): number {
  if (arr.length === 0) return 0; const v = [...arr].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(v.length * p))];
}

interface Stat { worsts: number[]; threw: number }
function emptyStat(): Stat { return { worsts: [], threw: 0 }; }
function push(st: Stat, w: number | null): void { if (w === null) st.threw++; else st.worsts.push(w); }
function sliverPct(st: Stat): number { return st.worsts.length ? (st.worsts.filter((w) => w < 20).length / st.worsts.length) * 100 : 0; }

interface StyleResult { id: string; edgesUsed: number; ffRaw: Stat; ffCond: Stat; straight: Stat }

function analyze(styleId: string, maxEdges: number): StyleResult {
  const s = styleSampler(styleId as Parameters<typeof styleSampler>[0], {}, DIMS);
  const graph = detectFeatures(s, globalOpts(s));
  const edges: FeatureEdge[] = graph.edges
    .filter((e) => e.polyline.length >= 3 && arcLen3D(e.polyline, s) >= 8)
    .slice(0, maxEdges);

  const ffRaw = emptyStat(), ffCond = emptyStat(), straight = emptyStat();
  for (const e of edges) {
    const crestRaw = clipPolyline3D(e.polyline, s, MAX_LEN_MM);
    if (crestRaw.length < 3) continue;

    // FF-raw
    push(ffRaw, paveAndWorst(footRaw(crestRaw, s), crestRaw, s));

    // FF-cond: smooth + arclength-resample the spine, consistent-side foot.
    const crestCond = resampleArcLen(smoothPolyline(crestRaw, 4), s, EDGE_MM);
    if (crestCond.length >= 3) push(ffCond, paveAndWorst(footConsistent(crestCond, s), crestCond, s));
    else ffCond.threw++;

    // straight ribbon
    const len = arcLen3D(crestRaw, s);
    const t0 = tangentUV(crestRaw, 0);
    const m0 = metricAt(s, crestRaw[0].u, crestRaw[0].t);
    const step3 = Math.sqrt(Math.max(1e-12, m0.E * t0.du * t0.du + 2 * m0.F * t0.du * t0.dt + m0.G * t0.dt * t0.dt));
    const su = t0.du / step3, st = t0.dt / step3;
    const straightCrest: StationPoint[] = [{ u: crestRaw[0].u, t: crestRaw[0].t }, { u: crestRaw[0].u + su * len, t: crestRaw[0].t + st * len }];
    const pd = perpDir(s, crestRaw[0].u, crestRaw[0].t, su, st);
    const straightFoot = straightCrest.map((p) => ({ u: p.u + pd.a * W_MM, t: p.t + pd.b * W_MM }));
    push(straight, paveAndWorst(straightFoot, straightCrest, s));
  }
  return { id: styleId, edgesUsed: edges.length, ffRaw, ffCond, straight };
}

describe('STEP 2 DECISIVE — feature-following (raw vs conditioned) vs straight on REAL relief', () => {
  const STYLES = ['Voronoi', 'GyroidManifold', 'HarmonicRipple'];
  const results = STYLES.map((id) => analyze(id, 200));

  it('emits the construction-sensitivity comparison (worstAll p50 + %slivered)', () => {
    /* eslint-disable no-console */
    console.log('\n=== STEP 2 DECISIVE: strip-pave quality on the REAL surface ===');
    console.log(`band W=${W_MM}mm len≤${MAX_LEN_MM}mm edge=${EDGE_MM}mm (arc-length densified)\n`);
    const fmt = (st: Stat): string =>
      `p50=${pctl(st.worsts, 0.5).toFixed(1).padStart(5)} %<20=${sliverPct(st).toFixed(0).padStart(3)}% threw=${st.threw}`;
    console.log('style'.padEnd(16) + 'edges'.padEnd(7) + 'FF-raw'.padEnd(28) + 'FF-cond'.padEnd(28) + 'straight');
    for (const r of results) {
      console.log(r.id.padEnd(16) + String(r.edgesUsed).padEnd(7) + fmt(r.ffRaw).padEnd(28) + fmt(r.ffCond).padEnd(28) + fmt(r.straight));
    }
    console.log(
      '\nREAD: FF-cond ≫ FF-raw ⇒ spine-smoothing + consistent-side offset is the lever (construction, not relief).\n' +
        'FF-cond clean (p50≥~20, low %<20) ⇒ feature-aligned thesis holds on REAL relief WITH spine conditioning.',
    );
    /* eslint-enable no-console */
    expect(results.length).toBe(STYLES.length);
  });

  it('REPORT: does conditioning recover feature-following on Voronoi? (no hard assert — learn)', () => {
    const v = results.find((r) => r.id === 'Voronoi');
    expect(v).toBeDefined();
    if (!v) return;
    /* eslint-disable-next-line no-console */
    console.log(
      `Voronoi: FF-raw p50=${pctl(v.ffRaw.worsts, 0.5).toFixed(1)} (%<20=${sliverPct(v.ffRaw).toFixed(0)}) -> ` +
        `FF-cond p50=${pctl(v.ffCond.worsts, 0.5).toFixed(1)} (%<20=${sliverPct(v.ffCond).toFixed(0)})`,
    );
    expect(v.ffCond.worsts.length).toBeGreaterThan(20);
  });

  it('BAND-WIDTH SWEEP: is the FF-cond tail the band-too-wide-for-cell effect?', () => {
    /* eslint-disable no-console */
    // Conditioned feature-following, but with the foot offset W swept. If the
    // sliver tail collapses as W shrinks, the tail is band-width-vs-cell-size
    // (a construction/sizing lever), not a fundamental high-relief limit.
    const footConsistentW = (crest: StationPoint[], s: SurfaceSampler, w: number): StationPoint[] => {
      let vote = 0;
      const dirs = crest.map((p, i) => {
        const tan = tangentUV(crest, i);
        const d = perpDir(s, p.u, p.t, tan.du, tan.dt);
        const rP = samplerRadius(s, p.u + d.a * w * 0.5, p.t + d.b * w * 0.5);
        const rM = samplerRadius(s, p.u - d.a * w * 0.5, p.t - d.b * w * 0.5);
        vote += rP <= rM ? 1 : -1;
        return d;
      });
      const sign = vote >= 0 ? 1 : -1;
      return crest.map((p, i) => ({ u: p.u + sign * dirs[i].a * w, t: p.t + sign * dirs[i].b * w }));
    };
    console.log('\n=== STEP 2: FF-cond band-width sweep (Voronoi + Gyroid) ===');
    for (const styleId of ['Voronoi', 'GyroidManifold']) {
      const s = styleSampler(styleId as Parameters<typeof styleSampler>[0], {}, DIMS);
      const graph = detectFeatures(s, globalOpts(s));
      const edges = graph.edges.filter((e) => e.polyline.length >= 3 && arcLen3D(e.polyline, s) >= 8).slice(0, 200);
      for (const w of [1.5, 2.5, 4.0]) {
        const st = emptyStat();
        for (const e of edges) {
          const crest = resampleArcLen(smoothPolyline(clipPolyline3D(e.polyline, s, MAX_LEN_MM), 4), s, EDGE_MM);
          if (crest.length < 3) { st.threw++; continue; }
          push(st, paveAndWorst(footConsistentW(crest, s, w), crest, s));
        }
        console.log(`  ${styleId.padEnd(15)} W=${w.toFixed(1)}mm: p50=${pctl(st.worsts, 0.5).toFixed(1).padStart(5)} %<20=${sliverPct(st).toFixed(0).padStart(3)}% (n=${st.worsts.length})`);
      }
    }
    /* eslint-enable no-console */
    expect(results.length).toBeGreaterThan(0);
  }, 180000);

  it('HONEST per-TRIANGLE sliver rate (not per-band) for FF-cond @ W=2.5mm', () => {
    /* eslint-disable no-console */
    // %<20 above marks a band slivered if it has ANY sub-20 triangle in ~18mm — a
    // harsh per-band metric. The production-relevant number is the per-TRIANGLE
    // fraction across the whole paved area. Measure that for the conditioned build.
    const W = 2.5;
    const footW = (crest: StationPoint[], s: SurfaceSampler): StationPoint[] => {
      let vote = 0;
      const dirs = crest.map((p, i) => {
        const tan = tangentUV(crest, i);
        const d = perpDir(s, p.u, p.t, tan.du, tan.dt);
        vote += samplerRadius(s, p.u + d.a * W * 0.5, p.t + d.b * W * 0.5) <= samplerRadius(s, p.u - d.a * W * 0.5, p.t - d.b * W * 0.5) ? 1 : -1;
        return d;
      });
      const sign = vote >= 0 ? 1 : -1;
      return crest.map((p, i) => ({ u: p.u + sign * dirs[i].a * W, t: p.t + sign * dirs[i].b * W }));
    };
    const paveTriStats = (foot: StationPoint[], crest: StationPoint[], s: SurfaceSampler): { nTri: number; nSliver: number } | null => {
      const cap = (EDGE_MM / 2) * 0.9;
      try {
        const grid = buildStations(densifyArcLen(foot, s, cap), densifyArcLen(crest, s, cap), s, EDGE_MM);
        if (grid.rows.length < 2) return null;
        const band = paveBand(grid, s);
        const pos = new Float32Array(band.utVertices.length * 3);
        for (let i = 0; i < band.utVertices.length; i++) { const p = s.position(band.utVertices[i][0], band.utVertices[i][1]); pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; }
        const P = (i: number): Vec3 => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
        let nTri = 0, nSliver = 0;
        for (let k = 0; k < band.indices.length; k += 3) {
          const a = band.indices[k], b = band.indices[k + 1], c = band.indices[k + 2];
          if (a === b || b === c || c === a) continue;
          nTri++; if (triMinAngle(P(a), P(b), P(c)) < 20) nSliver++;
        }
        return { nTri, nSliver };
      } catch { return null; }
    };
    console.log('\n=== STEP 2: HONEST per-triangle sliver rate (FF-cond, W=2.5mm) ===');
    for (const styleId of ['Voronoi', 'GyroidManifold', 'HarmonicRipple']) {
      const s = styleSampler(styleId as Parameters<typeof styleSampler>[0], {}, DIMS);
      const graph = detectFeatures(s, globalOpts(s));
      const edges = graph.edges.filter((e) => e.polyline.length >= 3 && arcLen3D(e.polyline, s) >= 8).slice(0, 200);
      let totTri = 0, totSliver = 0, bands = 0;
      for (const e of edges) {
        const crest = resampleArcLen(smoothPolyline(clipPolyline3D(e.polyline, s, MAX_LEN_MM), 4), s, EDGE_MM);
        if (crest.length < 3) continue;
        const st = paveTriStats(footW(crest, s), crest, s);
        if (!st) continue;
        totTri += st.nTri; totSliver += st.nSliver; bands++;
      }
      console.log(`  ${styleId.padEnd(15)} bands=${bands} tris=${totTri} sliver-tris(<20°)=${totSliver} = ${((totSliver / Math.max(1, totTri)) * 100).toFixed(1)}% of triangles`);
    }
    /* eslint-enable no-console */
    expect(true).toBe(true);
  }, 180000);
});
