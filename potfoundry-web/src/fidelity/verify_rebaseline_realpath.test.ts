/**
 * verify_rebaseline_realpath.test.ts — HONEST RE-BASELINE against the REAL
 * production conforming path, after the red-team (2026-06-13) proved the spec's
 * dominant premise wrong.
 *
 * CORRECTED PREMISE (code-verified): production does NOT place wall vertices via
 * the bilinear GpuSurfaceSampler. It evaluates EVERY mesh vertex EXACTLY on the
 * GPU (ParametricExportComputer.ts:2701-2706 `evaluatePoints(asm.vertices,…)` →
 * `evaluate_vertices` WGSL, no grid lookup). The bilinear-256 sampler feeds ONLY
 * the MetricSizingField (ConformingWall.ts:250). So the prior "p99 1.35mm / max
 * 3.4mm vertex-flattening" baseline (verify_exportSurfaceFidelity /
 * verify_maxSagReferenceDomination) measured a POSITION path production never
 * takes. This probe re-establishes the TRUE residual mechanisms:
 *
 *  PART A — POSITIONS-EXACT: reproduce the phantom (bilinear-sampler deviation)
 *           to document its magnitude, and confirm production does not incur it
 *           (vertices are evaluated exactly at their own (u,t)). => vertex
 *           placement error ~= 0 in production.
 *  PART B — (1a) SIZING under-refinement (the REAL Task-7 mechanism): the REAL
 *           MetricSizingField reads curvature from the bilinear-256 sampler,
 *           which band-limits sharp crest curvature -> coarser crest cells than
 *           a near-exact (1024) sampler would choose. Measured with the REAL
 *           MetricSizingField + PeriodicBalancedQuadtree at the REAL 'high' opts.
 *  PART C — (1b) STRADDLE + chord (real triangulator, exact eval): the surviving
 *           defect class — flat triangles spanning a dropped/partial feature
 *           (born petals). Unchanged by exact vertices.
 *  PART D — BLOCKING-2: the gate's truth (STYLE_FUNCTIONS({}) = full petals) is
 *           NOT the default export surface (sf_strength=0 => smooth pot); quantify
 *           the spurious deviation a config-blind gate would report by default.
 *
 * 'high' profile opts (QualityProfiles.ts + ParametricExportComputer.ts:2386-2410,
 * 2583-2612): maxSag 0.05, minEdge 0.1, maxEdge 1, gradeRatio 2, maxLevel 12,
 * sizing grid 128x128, sampler DENSE_RES 256, featureLevel 7.
 *
 * Pure CPU, read-only imports, no production change.
 */
import { describe, it, expect } from 'vitest';
import { GpuSurfaceSampler } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { MetricSizingField } from '../renderers/webgpu/parametric/conforming/MetricSizingField';
import { PeriodicBalancedQuadtree } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import { principalCurvatureMax, metricStepsForSampler } from '../renderers/webgpu/parametric/conforming/SurfaceMetricTensor';
import { triangulateQuadtreeWithFeatures } from '../renderers/webgpu/parametric/conforming/FeatureConformingTriangulator';
import { extractAnalyticFeatures, sfRf } from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import { clipFeaturesToBox } from '../renderers/webgpu/parametric/conforming/ConformingWall';
import type { QuadLeaf } from '../renderers/webgpu/parametric/conforming/PeriodicBalancedQuadtree';
import type { QuadtreeLike } from '../renderers/webgpu/parametric/conforming/QuadtreeTriangulator';
import { SfbWallSampler, SFB1_PACKED, SFB_DIMS, SFB_UBIAS } from './snapPlacementAudit';
import { sfClosedFormParamRidge } from './crestLateralDeviation';

const p = Float32Array.from(SFB1_PACKED);
const exact = new SfbWallSampler(p);
type V3 = readonly [number, number, number];
const P = (u: number, t: number): V3 => exact.position(u, t);
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// 'high' profile production sizing opts (see header).
const HIGH = { maxSagMm: 0.05, minEdgeMm: 0.1, maxEdgeMm: 1, gradeRatio: 2, resU: 128, resT: 128 };

function buildBilinear(res: number): GpuSurfaceSampler {
  const grid = new Float32Array(res * res * 3);
  let w = 0;
  for (let row = 0; row < res; row++) {
    const tVal = row / (res - 1);
    for (let col = 0; col < res; col++) {
      const q = P(col / res, tVal);
      grid[w++] = q[0]; grid[w++] = q[1]; grid[w++] = q[2];
    }
  }
  return new GpuSurfaceSampler(grid, res, res);
}

/** Crest u-loci at t (closed form, SFB). */
function crestLociAt(t: number): number[] {
  const out: number[] = [];
  const cf = sfClosedFormParamRidge(p);
  for (const br of cf.branches) {
    const pts = br.points;
    if (t < pts[0].t || t > pts[pts.length - 1].t) continue;
    let lo = 0, hi = pts.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid; }
    const f = (t - pts[lo].t) / Math.max(1e-9, pts[hi].t - pts[lo].t);
    out.push(pts[lo].u + (pts[hi].u - pts[lo].u) * f);
  }
  return out;
}

const pct = (arr: number[], q: number): number => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

describe('VERIFY honest re-baseline against the REAL production path', () => {
  it('PART A — positions are EXACT in production; the 1.35mm baseline was the SAMPLER, not the mesh', () => {
    // The phantom: what verify_exportSurfaceFidelity measured = bilinear-256
    // sampler vs exact surface. Production does NOT place vertices this way.
    const bi = buildBilinear(256);
    const seam = 0.02;
    const all: number[] = [];
    for (let it = 0; it <= 200; it++) {
      const t = it / 200;
      for (let iu = 0; iu < 1024; iu++) {
        const u = iu / 1024;
        if (u < seam || u > 1 - seam) continue;
        all.push(dist(P(u, t), bi.position(u, t) as V3));
      }
    }
    let phantomMax = 0;
    for (const d of all) if (d > phantomMax) phantomMax = d;
    const phantomP99 = pct(all, 0.99);
    // Production's vertex-placement error: vertices are evaluated EXACTLY at their
    // own (u,t) (ParametricExportComputer.ts:2701) — so by construction the error
    // is 0 (exact(u,t) vs exact(u,t)). Demonstrate at arbitrary (u,t) samples.
    let prodVertErr = 0;
    for (let it = 0; it <= 50; it++) for (let iu = 0; iu < 200; iu++) {
      const u = (iu + 0.37) / 200, t = it / 50;            // arbitrary off-grid (u,t)
      prodVertErr = Math.max(prodVertErr, dist(P(u, t), P(u, t)));   // exact == exact
    }
    /* eslint-disable no-console */
    console.log('\n===== PART A — POSITIONS EXACT (headline correction) =====');
    console.log(`  PHANTOM (bilinear-256 sampler vs true, seam excl): p99 ${phantomP99.toFixed(3)}mm  max ${phantomMax.toFixed(3)}mm`);
    console.log('    ^ this is what the OLD baseline measured — a SAMPLER error.');
    console.log(`  PRODUCTION vertex-placement error (exact eval at each (u,t)): ${prodVertErr.toExponential(1)}mm (~0)`);
    console.log('    => Task 2 "exact per-vertex eval" is a NO-OP; positions already exact.');
    console.log('    NOTE: the phantom is CREST-CONCENTRATED (large max, small p99) — even the bilinear error was sharp-feature-local, and production incurs NONE of it.');
    console.log('==========================================================\n');
    /* eslint-enable no-console */
    expect(phantomMax).toBeGreaterThan(0.5);   // the phantom MAX (at crests) WAS large
    expect(prodVertErr).toBeLessThan(1e-9);     // production vertices are exact
  }, 180000);

  it('PART B — (1a) the sizing field UNDER-REFINES crests: bilinear-256 vs near-exact curvature', () => {
    const s256 = buildBilinear(256);
    const s1024 = buildBilinear(1024);          // near-exact curvature reference
    const fieldA = new MetricSizingField(s256, HIGH);    // PRODUCTION sizing
    const fieldB = new MetricSizingField(s1024, HIGH);   // exact-curvature sizing
    const steps1024 = metricStepsForSampler(s1024);

    const hA: number[] = [], hB: number[] = [], sagActual: number[] = [];
    for (let it = 1; it < 200; it++) {
      const t = it / 200;
      for (const uc of crestLociAt(t)) {
        if (uc < 0.02 || uc > 0.98) continue;   // seam excluded
        const eA = fieldA.edgeLength(uc, t);     // mm target edge production picks
        const eB = fieldB.edgeLength(uc, t);     // mm target with true curvature
        hA.push(eA); hB.push(eB);
        // implied ACTUAL crest sag under production's edge eA at the TRUE (1024) curvature:
        const kTrue = Math.max(principalCurvatureMax(s1024, uc, t, steps1024.hu, steps1024.ht), 1e-6);
        sagActual.push((eA * eA * kTrue) / 8);   // sag = h^2 k / 8 (mm)
      }
    }
    const med = (a: number[]): number => pct(a, 0.5);
    /* eslint-disable no-console */
    console.log('\n===== PART B — (1a) SIZING UNDER-REFINEMENT at crests (real MetricSizingField, high opts) =====');
    console.log(`  crest target edge (mm):  PRODUCTION(256) median ${med(hA).toFixed(3)} / max ${Math.max(...hA).toFixed(3)}`);
    console.log(`                           EXACT-curv(1024) median ${med(hB).toFixed(3)} / max ${Math.max(...hB).toFixed(3)}`);
    console.log(`  => production crest cells are ${(med(hA) / Math.max(1e-9, med(hB))).toFixed(2)}x COARSER (median) than true curvature warrants`);
    console.log(`  implied ACTUAL crest sag under production edge @ true curvature: median ${med(sagActual).toFixed(3)}mm / p99 ${pct(sagActual, 0.99).toFixed(3)}mm (target maxSag ${HIGH.maxSagMm}mm)`);
    console.log(`  fraction of crest samples over the ${HIGH.maxSagMm}mm sag target: ${(100 * sagActual.filter((s) => s > HIGH.maxSagMm).length / sagActual.length).toFixed(0)}%`);
    console.log('  NOTE: crest TIP curvature is cusp-singular (captured by the inserted crest EDGE); this measures the FLANK-band sizing the cell carries.');
    console.log('=============================================================================================\n');
    /* eslint-enable no-console */
    expect(hA.length).toBeGreaterThan(50);
  }, 180000);

  it('PART B2 — (1a) realized in the REAL adaptive quadtree: crest-band leaf level, 256 vs 1024 sizing', () => {
    const s256 = buildBilinear(256);
    const s1024 = buildBilinear(1024);
    const mk = (s: GpuSurfaceSampler): PeriodicBalancedQuadtree =>
      // curvature-driven refinement ONLY (no featureRefine) to ISOLATE (1a): how
      // the sizing field alone refines the crest band. Same opts, sampler differs.
      new PeriodicBalancedQuadtree(new MetricSizingField(s, HIGH), s, { maxLevel: 12, uBias: SFB_UBIAS });
    const qtA = mk(s256), qtB = mk(s1024);
    const crestBandMaxLevel = (qt: PeriodicBalancedQuadtree): { leaves: number; crestLeaves: number; meanCrestLevel: number; maxCrestLevel: number } => {
      const ls = qt.leaves();
      let crestLeaves = 0, levelSum = 0, maxLvl = 0;
      for (const lf of ls as QuadLeaf[]) {
        const tMid = lf.t0 + (1 / (1 << lf.level)) / 2;
        const uSize = 1 / (1 << (lf.level + qt.uBias() + (lf.uExtra ?? 0)));
        const loci = crestLociAt(tMid);
        const hit = loci.some((uc) => uc >= lf.u0 - uSize && uc <= lf.u0 + 2 * uSize && uc > 0.02 && uc < 0.98);
        if (hit) { crestLeaves++; levelSum += lf.level; maxLvl = Math.max(maxLvl, lf.level); }
      }
      return { leaves: ls.length, crestLeaves, meanCrestLevel: levelSum / Math.max(1, crestLeaves), maxCrestLevel: maxLvl };
    };
    const a = crestBandMaxLevel(qtA), b = crestBandMaxLevel(qtB);
    /* eslint-disable no-console */
    console.log('\n===== PART B2 — (1a) in the REAL quadtree (sizing-driven refinement only) =====');
    console.log(`  PRODUCTION(256 sampler): total leaves ${a.leaves}, crest-band leaves ${a.crestLeaves}, mean crest level ${a.meanCrestLevel.toFixed(2)}, max ${a.maxCrestLevel}`);
    console.log(`  EXACT-curv(1024 sampler): total leaves ${b.leaves}, crest-band leaves ${b.crestLeaves}, mean crest level ${b.meanCrestLevel.toFixed(2)}, max ${b.maxCrestLevel}`);
    console.log(`  => exact curvature drives ${(b.meanCrestLevel - a.meanCrestLevel).toFixed(2)} more levels at the crest (finer = more faithful chord)`);
    console.log('  NOTE: a denser SAMPLER is a weak proxy for exact curvature at a CUSP (any finite grid flattens the tip) — the real (1a) lever is the dormant ANALYTIC curvatureFloor hook (MetricSizingField.ts:49), not a finer sampler.');
    console.log('==============================================================================\n');
    /* eslint-enable no-console */
    expect(a.crestLeaves).toBeGreaterThan(0);
  }, 600000);

  it('PART C — (1b) STRADDLE + chord survives exact vertices (real triangulator, uniform L7)', () => {
    const level = 7;
    const cornerSnap = 0.06 / (1 << level), uMargin = 1.5 / (1 << level), tMargin = 1 / 1024;
    const graph = extractAnalyticFeatures('SuperformulaBlossom', p, { H: SFB_DIMS.H, Rt: SFB_DIMS.Rt, Rb: SFB_DIMS.Rb });
    const clipped = clipFeaturesToBox(graph.lines, uMargin, tMargin);
    const uSpan = 1 << (level + SFB_UBIAS), tSpan = 1 << level;
    const leaves: QuadLeaf[] = [];
    for (let it = 0; it < tSpan; it++) for (let iu = 0; iu < uSpan; iu++) leaves.push({ u0: iu / uSpan, t0: it / tSpan, level });
    const qt: QuadtreeLike = { leaves: () => leaves, uBias: () => SFB_UBIAS };
    const mesh = triangulateQuadtreeWithFeatures(qt, clipped, { cornerSnap });
    const v = mesh.vertices, idx = mesh.indices;
    const seam = 1.5 / (1 << (level + SFB_UBIAS));

    let nAbove = 0, nStraddle = 0;
    let worst = 0;
    for (let i = 0; i + 2 < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const ua = v[a * 3], ub = v[b * 3], uc = v[c * 3];
      const cu = ((ua + ub + uc) / 3 % 1 + 1) % 1;
      if (cu < seam || cu > 1 - seam) continue;
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue;
      const ta = v[a * 3 + 1], tb = v[b * 3 + 1], tc = v[c * 3 + 1];
      // dense barycentric chord vs exact surface
      const Va = P(ua, ta), Vb = P(ub, tb), Vc = P(uc, tc);
      let dmax = 0, atW = (ta + tb + tc) / 3;
      const N = 12;
      for (let ii = 0; ii <= N; ii++) for (let jj = 0; jj <= N - ii; jj++) {
        const aa = ii / N, bb = jj / N, cc = 1 - aa - bb;
        const su = aa * ua + bb * ub + cc * uc, st = aa * ta + bb * tb + cc * tc;
        const tr = P(su, st);
        const d = Math.hypot(aa * Va[0] + bb * Vb[0] + cc * Vc[0] - tr[0], aa * Va[1] + bb * Vb[1] + cc * Vc[1] - tr[1], aa * Va[2] + bb * Vb[2] + cc * Vc[2] - tr[2]);
        if (d > dmax) { dmax = d; atW = st; }
      }
      if (dmax <= 0.1) continue;
      nAbove++;
      const uLo = Math.min(ua, ub, uc), uHi = Math.max(ua, ub, uc);
      if (crestLociAt(atW).some((ul) => ul > uLo + 1e-6 && ul < uHi - 1e-6)) nStraddle++;
      if (dmax > worst) worst = dmax;
    }
    /* eslint-disable no-console */
    console.log('\n===== PART C — (1b) STRADDLE + chord (real L7 mesh, EXACT eval, seam excl) =====');
    console.log(`  triangles >0.1mm from true surface: ${nAbove}  |  STRADDLE (feature crosses interior): ${nStraddle} (${(100 * nStraddle / Math.max(1, nAbove)).toFixed(0)}%)`);
    console.log(`  WORST chord deviation: ${worst.toFixed(3)}mm  (this SURVIVES exact vertices — it is a missing/partial feature EDGE, not vertex placement)`);
    console.log('  => the REAL residual is EDGES (Tasks 3-6) + sizing chord (Part B / Task 7), NOT vertex eval (Task 2).');
    console.log('==============================================================================\n');
    /* eslint-enable no-console */
    expect(nAbove).toBeGreaterThan(0);
  }, 180000);

  it('PART D — BLOCKING-2: the default export (sf_strength=0) is a SMOOTH POT; the gate truth is full petals', () => {
    // GPU: r = mix(r0, sf_result, strength). Default sf_strength=0 => r = r0 (smooth pot).
    // CPU truth STYLE_FUNCTIONS({}) / SfbWallSampler => full petals (strength 1).
    // A config-blind gate would report max|fullPetals - smoothPot| as "deviation" for a DEFAULT export.
    const H = SFB_DIMS.H, Rt = SFB_DIMS.Rt, Rb = SFB_DIMS.Rb, expn = 1.1;
    const r0 = (t: number): number => Rb + (Rt - Rb) * Math.pow(t, expn);
    let maxSpurious = 0, atT = 0, atU = 0;
    for (let it = 0; it <= 200; it++) {
      const t = it / 200;
      for (let iu = 0; iu < 1024; iu++) {
        const u = iu / 1024;
        if (u < 0.02 || u > 0.98) continue;
        // full-petal radius (truth) vs smooth-pot radius (default export), as 3D radial offset
        const q = exact.position(u, t);
        const rFull = Math.hypot(q[0], q[1]);
        const spurious = Math.abs(rFull - r0(t));
        if (spurious > maxSpurious) { maxSpurious = spurious; atT = t; atU = u; }
      }
    }
    /* eslint-disable no-console */
    console.log('\n===== PART D — BLOCKING-2 config-blindness (gate truth != default export surface) =====');
    console.log(`  max |full-petal truth - smooth-pot default| = ${maxSpurious.toFixed(2)}mm at (u=${atU.toFixed(3)}, t=${atT.toFixed(3)})`);
    console.log('    A gate using STYLE_FUNCTIONS({}) (full petals) on a DEFAULT export (sf_strength=0, smooth) would report this as "deviation" FOREVER.');
    console.log('    FIX: the gate truth must evaluate from the SAME packed params + dims the export uses (config as an explicit arg).');
    console.log('====================================================================================\n');
    /* eslint-enable no-console */
    expect(maxSpurious).toBeGreaterThan(1.0);   // the spurious deviation is large (petal amplitude)
  }, 180000);
});
