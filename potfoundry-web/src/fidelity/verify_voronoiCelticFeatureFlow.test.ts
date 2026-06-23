/**
 * verify_voronoiCelticFeatureFlow.test.ts — HONEST, extractor-INDEPENDENT
 * measurement of how well the conforming mesh represents the sharp features of
 * Voronoi and CelticKnot, extending the Gyroid feature-flow probe
 * (verify_gyroidFeatureFlow.test.ts) to two more styles.
 *
 * ## Why this exists
 *
 * `measureFeatureResolution` (FeatureLineGraph.ts) is CIRCULAR — it scores mesh
 * coverage against the SAME polyline the extractor produced, so it can never
 * reveal (a) under-resolution of the inserted curve itself, nor (b) the steep
 * relief FLANKS the centerline only approximates. For Gyroid the feature EDGES
 * flow well (~96-100% coverage) and the real defect is the steep-flank STAIRCASE,
 * which raising near-feature density (featureLevel 7 → 11) fixes. This file asks:
 * does that generalize to Voronoi + CelticKnot, or do THEIR feature edges fail to
 * flow at all (worse coverage)?
 *
 * We reuse the gyroid harness's mechanics (analytic SurfaceSampler from a CPU
 * radius fn, `assembleWatertight` fed `outerFeatureLines` from
 * `extractAnalyticFeatures`, marching-squares reference loci, edge-coverage +
 * facet-deviation + circular-metric contrast) but parametrize per style.
 *
 * ## The lever under test
 *
 * Production inserts the extracted general-curves but caps near-feature
 * refinement at `featureLevel=7` by default; `featureLevel=11` is gated behind a
 * default-off flag (ParametricExportComputer.ts:2704). We run BOTH at the SAME
 * default depth (maxLevel 12, maxSag 0.05, nRing 1024) so the only variable is
 * the near-feature density cap.
 *
 * ## Reference scalars (independent of the inserted curve)
 *
 *  • Voronoi  — the extractor traces the categorical border of `voronoiCellId`
 *    (FeatureLineGraph.ts:631). We REPLICATE that exact scalar (hash22/fract/wrap)
 *    and trace it at hi-res via `marchingSquaresLabels` for the EXTRACTION-FIDELITY
 *    reference. For an INDEPENDENT relief-ridge locus we trace the CONTINUOUS
 *    cell-SDF `cellSdf = f2 − f1` zero-band (`cellSdf − vThickness = 0`) via
 *    `marchingSquaresZero` — this is the actual web boundary `rOuterVoronoi` uses
 *    (`web = 1 − smoothstep(0, th, cellSdf)`), so it is the true visible crease,
 *    NOT a re-trace of the extractor's categorical field.
 *
 *  • CelticKnot — the extractor places strand centerlines as smooth analytic
 *    sinusoids (no hash). A genuinely independent reference cannot reuse that
 *    sinusoid, so we trace the RIDGE of the relief field `r − r0` directly: within
 *    each column we mark where ∂(r−r0)/∂u changes sign (a local radius extremum =
 *    the strand crest), via `marchingSquaresZero` on the central-difference
 *    u-gradient. CAVEAT: the relief field is piecewise (Z-buffer occlusion +
 *    background plateau `r0 − 0.3·relief`), so its gradient is C0 and the ridge
 *    trace is noisier than a smooth level set; we document this honestly and also
 *    report a direct strand-distance reference as a cross-check.
 *
 * Pure CPU, read-only imports, no production change. (jsdom / Vitest, NO WebGPU —
 * the analytic SurfaceSampler stands in for the GPU dense-grid sampler.)
 */
import { describe, it, expect } from 'vitest';
import { rOuterVoronoi, rOuterCelticKnot } from '../geometry/styles';
import { DEFAULT_VORONOI, DEFAULT_CELTIC_KNOT } from '../geometry/types';
import type { StyleOptions } from '../geometry/types';
import { buildStyleParamPayload } from '../utils/styleParams';
import {
  extractAnalyticFeatures,
  measureFeatureResolution,
  type FeatureLine,
  type FeatureUTVertex,
} from '../renderers/webgpu/parametric/conforming/FeatureLineGraph';
import {
  marchingSquaresZero,
  marchingSquaresLabels,
  segmentsToPolylines,
} from '../renderers/webgpu/parametric/conforming/SampledFeatureExtractor';
import type { SurfaceSampler, Vec3 } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { assembleWatertight } from '../renderers/webgpu/parametric/conforming/WatertightAssembly';

const TAU = 2 * Math.PI;

// ── Realistic pot dims (identical to the gyroid harness). ─────────────────────
const H = 120;
const R0 = 40; // Rt = Rb = r0
const TBOTTOM = 6;
const RDRAIN = 0;

const U_TO_MM = TAU * R0; // ≈ 251.3 mm full circumference
const T_TO_MM = H; // 120 mm

const EDGE_TOL_MM = 0.1;
const FLANK_BAND_MM = 0.5;

// ── Generic (u,t) point + distance helpers (verbatim from the gyroid harness) ──
interface FeatureLinePt { u: number; t: number }

function uDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}
function utDist3D(a: FeatureLinePt, b: FeatureLinePt): number {
  const du = uDist(a.u, b.u) * U_TO_MM;
  const dt = Math.abs(a.t - b.t) * T_TO_MM;
  return Math.hypot(du, dt);
}
function distToSeg3D(p: FeatureLinePt, a: FeatureLinePt, b: FeatureLinePt): number {
  const un = (x: number): number => {
    let d = (x - a.u) % 1;
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return a.u + d;
  };
  const au = a.u, at = a.t;
  const bu = un(b.u), bt = b.t;
  const pu = un(p.u), pt = p.t;
  const dux = (bu - au) * U_TO_MM;
  const dty = (bt - at) * T_TO_MM;
  const px = (pu - au) * U_TO_MM;
  const py = (pt - at) * T_TO_MM;
  const len2 = dux * dux + dty * dty;
  let s = len2 > 1e-12 ? (px * dux + py * dty) / len2 : 0;
  s = Math.max(0, Math.min(1, s));
  return Math.hypot(px - s * dux, py - s * dty);
}
function minDistToSegments(p: FeatureLinePt, lines: FeatureLine[]): number {
  let best = Infinity;
  for (const l of lines) {
    const pts = l.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = distToSeg3D(p, pts[i], pts[i + 1]);
      if (d < best) best = d;
    }
  }
  return best;
}
function densifyLoci(lines: FeatureLine[], perSeg = 3): FeatureLinePt[] {
  const out: FeatureLinePt[] = [];
  for (const l of lines) {
    const pts = l.points;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      for (let s = 0; s < perSeg; s++) {
        const f = s / perSeg;
        out.push({ u: a.u + (b.u - a.u) * f, t: a.t + (b.t - a.t) * f });
      }
    }
    if (pts.length > 0) out.push(pts[pts.length - 1]);
  }
  return out;
}

// ── Mesh edge set (3D-coverage probe) — verbatim from the gyroid harness. ─────
interface MeshEdge { a: FeatureLinePt; b: FeatureLinePt }
function outerWallEdges(verts: Float32Array, indices: Uint32Array): {
  edges: MeshEdge[];
  utVerts: FeatureUTVertex[];
} {
  const isOuter = (vi: number): boolean => verts[vi * 3 + 2] < 0.5;
  const seen = new Set<number>();
  const edges: MeshEdge[] = [];
  const ptOf = (vi: number): FeatureLinePt => ({ u: verts[vi * 3], t: verts[vi * 3 + 1] });
  const addEdge = (i: number, j: number): void => {
    if (!isOuter(i) || !isOuter(j)) return;
    const k = i < j ? i * 1e7 + j : j * 1e7 + i;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push({ a: ptOf(i), b: ptOf(j) });
  };
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  const utVerts: FeatureUTVertex[] = [];
  const nV = verts.length / 3;
  for (let i = 0; i < nV; i++) if (isOuter(i)) utVerts.push({ u: verts[i * 3], t: verts[i * 3 + 1] });
  return { edges, utVerts };
}

// ── 2D (u,t) ref-point grid (verbatim from the gyroid harness). ───────────────
class RefGrid {
  private readonly cells: number[][];
  private readonly cellU: number;
  private readonly cellT: number;
  private readonly nu: number;
  private readonly nt: number;
  constructor(
    private readonly pts: FeatureLinePt[],
    bandMm: number,
  ) {
    this.cellU = Math.max(bandMm / U_TO_MM, 1 / 4096);
    this.cellT = Math.max(bandMm / T_TO_MM, 1 / 4096);
    this.nu = Math.max(1, Math.ceil(1 / this.cellU));
    this.nt = Math.max(1, Math.ceil(1 / this.cellT));
    this.cells = Array.from({ length: this.nu * this.nt }, () => []);
    for (let i = 0; i < pts.length; i++) {
      const cu = this.colU(pts[i].u);
      const ct = this.rowT(pts[i].t);
      this.cells[ct * this.nu + cu].push(i);
    }
  }
  private colU(u: number): number {
    const uu = ((u % 1) + 1) % 1;
    return Math.min(this.nu - 1, Math.floor(uu / this.cellU));
  }
  private rowT(t: number): number {
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.min(this.nt - 1, Math.floor(tt / this.cellT));
  }
  within(u: number, t: number, bandMm: number): boolean {
    const cu = this.colU(u);
    const ct = this.rowT(t);
    const q = { u, t };
    for (let dt = -1; dt <= 1; dt++) {
      const rt = ct + dt;
      if (rt < 0 || rt >= this.nt) continue;
      for (let du = -1; du <= 1; du++) {
        const ru = ((cu + du) % this.nu + this.nu) % this.nu;
        for (const ri of this.cells[rt * this.nu + ru]) {
          if (utDist3D(q, this.pts[ri]) <= bandMm) return true;
        }
      }
    }
    return false;
  }
}

function edgeCoverage(refPts: FeatureLinePt[], edges: MeshEdge[], tolMm: number): number {
  if (refPts.length === 0) return 1;
  const wrapU = (u: number): number => ((u % 1) + 1) % 1;
  const cellU = Math.max(tolMm / U_TO_MM, 1 / 4096);
  const cellT = Math.max(tolMm / T_TO_MM, 1 / 4096);
  const nu = Math.max(1, Math.ceil(1 / cellU));
  const nt = Math.max(1, Math.ceil(1 / cellT));
  const cells: number[][] = Array.from({ length: nu * nt }, () => []);
  const colU = (u: number): number => Math.min(nu - 1, Math.floor(wrapU(u) / cellU));
  const rowT = (t: number): number => Math.min(nt - 1, Math.max(0, Math.floor((t < 0 ? 0 : t > 1 ? 1 : t) / cellT)));
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const seen = new Set<number>();
    for (const ep of [e.a, e.b]) {
      const k = rowT(ep.t) * nu + colU(ep.u);
      if (!seen.has(k)) { seen.add(k); cells[k].push(i); }
    }
  }
  let hits = 0;
  for (const p of refPts) {
    const cu = colU(p.u);
    const ct = rowT(p.t);
    let covered = false;
    for (let dt = -1; dt <= 1 && !covered; dt++) {
      const rt = ct + dt;
      if (rt < 0 || rt >= nt) continue;
      for (let du = -1; du <= 1 && !covered; du++) {
        const ru = ((cu + du) % nu + nu) % nu;
        for (const ei of cells[rt * nu + ru]) {
          if (distToSeg3D(p, edges[ei].a, edges[ei].b) <= tolMm) { covered = true; break; }
        }
      }
    }
    if (covered) hits++;
  }
  return hits / refPts.length;
}

interface BandStat { count: number; max: number; mean: number; p99: number; _all: number[] }
function newStat(): BandStat { return { count: 0, max: 0, mean: 0, p99: 0, _all: [] }; }
function pushStat(s: BandStat, v: number): void { s._all.push(v); if (v > s.max) s.max = v; }
function finishStat(s: BandStat): void {
  s.count = s._all.length;
  if (s.count === 0) return;
  let sum = 0;
  for (const v of s._all) sum += v;
  s.mean = sum / s.count;
  const sorted = s._all.slice().sort((x, y) => x - y);
  s.p99 = sorted[Math.min(sorted.length - 1, Math.floor(0.99 * sorted.length))];
}

/** Per-facet centroid radial deviation (mm), near vs far from feature loci.
 *  Parametrized on the style's own sampler (radial deviation against it). */
function facetRadialDeviation(
  sampler: SurfaceSampler,
  verts: Float32Array,
  indices: Uint32Array,
  refLociPts: FeatureLinePt[],
  bandMm: number,
): { near: BandStat; far: BandStat } {
  const near = newStat();
  const far = newStat();
  const grid = new RefGrid(refLociPts, bandMm);
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t], b = indices[t + 1], c = indices[t + 2];
    if (verts[a * 3 + 2] >= 0.5 || verts[b * 3 + 2] >= 0.5 || verts[c * 3 + 2] >= 0.5) continue; // outer wall only
    const ua = verts[a * 3], ub = verts[b * 3], uc = verts[c * 3];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) continue; // skip seam-wrap facet
    const ta = verts[a * 3 + 1], tb = verts[b * 3 + 1], tc = verts[c * 3 + 1];
    const cu = (ua + ub + uc) / 3;
    const ct = (ta + tb + tc) / 3;
    const Pa = sampler.position(ua, ta);
    const Pb = sampler.position(ub, tb);
    const Pc = sampler.position(uc, tc);
    const fx = (Pa[0] + Pb[0] + Pc[0]) / 3;
    const fy = (Pa[1] + Pb[1] + Pc[1]) / 3;
    const fz = (Pa[2] + Pb[2] + Pc[2]) / 3;
    const S = sampler.position(cu, ct);
    const dev = Math.hypot(fx - S[0], fy - S[1], fz - S[2]);
    if (grid.within(cu, ct, bandMm)) pushStat(near, dev);
    else pushStat(far, dev);
  }
  finishStat(near);
  finishStat(far);
  return { near, far };
}

const log = (...a: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.log(...a);
};

// ── Configs: SAME default depth, only featureLevel differs (7 vs 11). ─────────
interface FeatureLevelConfig {
  name: string;
  featureLevel: number;
}
const FL7: FeatureLevelConfig = { name: 'featureLevel 7 (production default)', featureLevel: 7 };
const FL11: FeatureLevelConfig = { name: 'featureLevel 11 (un-gated lever)', featureLevel: 11 };

// Shared default-depth mesh params (production default-ish, matching gyroid CONFIG_A).
const BASE = {
  maxSagMm: 0.05,
  maxEdgeMm: 1,
  minEdgeMm: 0.1,
  gradeRatio: 2,
  maxLevel: 12,
  resU: 128, // sizing-field curvature-grid res (production qSizingRes=128)
  resT: 128,
  nRing: 1024,
  cellSamples: 1,
  targetTriangles: 6_000_000,
  budgetMode: 'cap' as const,
};

interface StyleSpec {
  styleId: string;
  sampler: SurfaceSampler;
  innerSampler: SurfaceSampler;
  packed: Float32Array;
  /** Hi-res extractor-OWN-scalar reference (for extraction fidelity). */
  refExtractorPts: FeatureLinePt[];
  refExtractorLineCount: number;
  /** Independent relief-ridge reference (for true edge-coverage + flank band). */
  refRidgePts: FeatureLinePt[];
  refRidgeLineCount: number;
}

function buildMesh(spec: StyleSpec, cfg: FeatureLevelConfig, generalCurves: FeatureLine[]): {
  verts: Float32Array; indices: Uint32Array; outerTriCount: number;
} {
  const asm = assembleWatertight(
    spec.sampler,
    spec.innerSampler,
    { H, tBottom: TBOTTOM, rDrain: RDRAIN },
    {
      ...BASE,
      featureLevel: cfg.featureLevel,
      outerFeatureLines: generalCurves.length > 0 ? generalCurves : undefined,
    },
  );
  let outerTriCount = 0;
  for (let t = 0; t + 2 < asm.indices.length; t += 3) {
    const a = asm.indices[t];
    if (asm.vertices[a * 3 + 2] < 0.5) outerTriCount++;
  }
  return { verts: asm.vertices, indices: asm.indices, outerTriCount };
}

/** Run a (style × featureLevel) measurement block and console.log the numbers. */
function measure(spec: StyleSpec, prodLines: FeatureLine[], cfg: FeatureLevelConfig): void {
  log(`\n  ──── ${spec.styleId} @ ${cfg.name} ────`);
  const t0 = Date.now();
  const { verts, indices, outerTriCount } = buildMesh(spec, cfg, prodLines);
  const buildMs = Date.now() - t0;
  const { edges, utVerts } = outerWallEdges(verts, indices);
  log(`    mesh: ${verts.length / 3} verts (${utVerts.length} outer), ` +
    `${indices.length / 3} tris (${outerTriCount} outer), ${edges.length} outer edges; build ${buildMs}ms`);

  // (2) True edge-coverage: extractor-own-scalar locus AND independent ridge locus.
  const covExtractor = edgeCoverage(spec.refExtractorPts, edges, EDGE_TOL_MM);
  const covRidge = edgeCoverage(spec.refRidgePts, edges, EDGE_TOL_MM);
  log(`    (2) TRUE EDGE-COVERAGE (mesh edge within ${EDGE_TOL_MM}mm 3D of ref locus):`);
  log(`          extractor-own-scalar locus : ${(100 * covExtractor).toFixed(1)}%  (n=${spec.refExtractorPts.length})`);
  log(`          independent relief-ridge   : ${(100 * covRidge).toFixed(1)}%  (n=${spec.refRidgePts.length})`);

  // (3) Flank staircase: facet radial dev near vs far from the ridge loci.
  const { near, far } = facetRadialDeviation(spec.sampler, verts, indices, spec.refRidgePts, FLANK_BAND_MM);
  log(`    (3) FACET RADIAL DEVIATION (outer wall), band = ±${FLANK_BAND_MM}mm 3D of ridge loci:`);
  log(`          NEAR feature : n=${near.count}  max=${near.max.toFixed(4)}  p99=${near.p99.toFixed(4)}  mean=${near.mean.toFixed(4)} mm`);
  log(`          FAR  (control): n=${far.count}  max=${far.max.toFixed(4)}  p99=${far.p99.toFixed(4)}  mean=${far.mean.toFixed(4)} mm`);

  // (4) Circular-metric contrast.
  const graph = { styleId: spec.styleId, lines: prodLines, groundTruthCount: prodLines.length };
  const circ = measureFeatureResolution(graph, utVerts);
  const avgCirc = circ.perLine.length > 0
    ? circ.perLine.reduce((s, l) => s + l.coverage, 0) / circ.perLine.length : 0;
  log(`    (4) CIRCULAR METRIC measureFeatureResolution (scores mesh vs the SAME extracted curve):`);
  log(`          expected=${circ.expected} present=${circ.present} dropped=${circ.dropped}; ` +
    `mean per-line coverage = ${(100 * avgCirc).toFixed(1)}%`);
  log(`          → circular reports ${(100 * avgCirc).toFixed(1)}% vs TRUE ridge edge-coverage ` +
    `${(100 * covRidge).toFixed(1)}% (gap = ${(100 * (avgCirc - covRidge)).toFixed(1)} pts); ` +
    `blind to flank p99 ${near.p99.toFixed(4)}mm`);

  // Always-runs assertion: the build produced an outer wall.
  expect(outerTriCount).toBeGreaterThan(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// VORONOI
// ─────────────────────────────────────────────────────────────────────────────
function fract(x: number): number { return x - Math.floor(x); }
/** WGSL hash22 (f64 replica of FeatureLineGraph.ts:612 / styles.ts hash22). */
function vHash22(px: number, py: number): [number, number] {
  let p3x = fract(px * 0.1031);
  let p3y = fract(py * 0.103);
  let p3z = fract(px * 0.0973);
  const d = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33);
  p3x += d; p3y += d; p3z += d;
  return [fract((p3x + p3y) * p3z), fract((p3x + p3z) * p3y)];
}
/** voronoiCellId — EXACT replica of FeatureLineGraph.ts:631 (the extractor's own
 *  categorical scalar). Packed slots: 0 scale, 1 jitter, 5 z_stretch, 6 pulse. */
function voronoiCellId(uWall: number, t: number, p: Float32Array): number {
  const scale = p[0] > 0 ? p[0] : 8;
  const jitter = p[1];
  const stretch = p[5] > 0 ? p[5] : 1;
  const pulse = p[6];
  const uAnim = uWall * scale + pulse * scale;
  const v = t * scale * stretch;
  const cellIdX = Math.floor(uAnim);
  const cellIdY = Math.floor(v);
  const cuX = fract(uAnim);
  const cuY = fract(v);
  let f1 = 1e9;
  let bestX = 0;
  let bestY = 0;
  for (let ny = -1; ny <= 1; ny++) {
    for (let nx = -1; nx <= 1; nx++) {
      const nidX = cellIdX + nx;
      const nidY = cellIdY + ny;
      const wrappedX = ((nidX % scale) + scale) % scale;
      const h = vHash22(wrappedX, nidY);
      const dx = nx + h[0] * jitter - cuX;
      const dy = ny + h[1] * jitter - cuY;
      const dist = dx * dx + dy * dy;
      if (dist < f1) { f1 = dist; bestX = wrappedX; bestY = nidY; }
    }
  }
  return Math.round(bestX) * 4096 + (bestY + 32);
}
/** Continuous cell-SDF `f2 − f1` (the WEB boundary `rOuterVoronoi` actually uses):
 *  an INDEPENDENT relief-ridge scalar, NOT the categorical field. cellSdf small ⇒
 *  on a cell border. We trace `cellSdf − vThickness = 0` (the web's smoothstep e1). */
function voronoiCellSdf(uWall: number, t: number, p: Float32Array): number {
  const scale = p[0] > 0 ? p[0] : 8;
  const jitter = p[1];
  const stretch = p[5] > 0 ? p[5] : 1;
  const pulse = p[6];
  const uAnim = uWall * scale + pulse * scale;
  const v = t * scale * stretch;
  const cellIdX = Math.floor(uAnim);
  const cellIdY = Math.floor(v);
  const cuX = fract(uAnim);
  const cuY = fract(v);
  let f1 = 999;
  let f2 = 999;
  for (let ny = -1; ny <= 1; ny++) {
    for (let nx = -1; nx <= 1; nx++) {
      const nidX = cellIdX + nx;
      const nidY = cellIdY + ny;
      const wrappedX = ((nidX % scale) + scale) % scale;
      const h = vHash22(wrappedX, nidY);
      const dx = nx + h[0] * jitter - cuX;
      const dy = ny + h[1] * jitter - cuY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < f1) { f2 = f1; f1 = dist; } else if (dist < f2) { f2 = dist; }
    }
  }
  return f2 - f1;
}

function buildVoronoiSpec(): StyleSpec {
  const V = DEFAULT_VORONOI;
  const VOPTS: StyleOptions = { ...V };
  const sampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = rOuterVoronoi(theta, t * H, R0, H, VOPTS);
      return [r * Math.cos(theta), r * Math.sin(theta), t * H];
    },
  };
  const innerSampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 - 4;
      const z = TBOTTOM + t * (H - TBOTTOM);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
  const [, packedArr] = buildStyleParamPayload('Voronoi', {
    v_scale: V.vScale, v_jitter: V.vJitter, v_thickness: V.vThickness, v_relief: V.vRelief,
    v_morph: V.vMorph, v_z_stretch: V.vZStretch, v_pulse: V.vPulse, v_edge_fade: V.vEdgeFade,
  });
  const packed = Float32Array.from(packedArr);

  // Reference 1: extractor's OWN categorical cell-ID border @ hi-res.
  const exSegs = marchingSquaresLabels((u, t) => voronoiCellId(u, t, packed), 2048, 1536, true);
  const exLines = segmentsToPolylines(exSegs, 'ref-vor-cellid', 3, 0);
  // Reference 2: independent continuous cell-SDF web boundary (cellSdf = vThickness).
  const ridgeSegs = marchingSquaresZero((u, t) => voronoiCellSdf(u, t, packed) - V.vThickness, 2048, 1536, true);
  const ridgeLines = segmentsToPolylines(ridgeSegs, 'ref-vor-web', 3, 0);

  return {
    styleId: 'Voronoi', sampler, innerSampler, packed,
    refExtractorPts: densifyLoci(exLines, 3), refExtractorLineCount: exLines.length,
    refRidgePts: densifyLoci(ridgeLines, 3), refRidgeLineCount: ridgeLines.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CELTIC KNOT
// ─────────────────────────────────────────────────────────────────────────────
function buildCelticKnotSpec(): StyleSpec {
  const C = DEFAULT_CELTIC_KNOT;
  const COPTS: StyleOptions = { ...C };
  const sampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = rOuterCelticKnot(theta, t * H, R0, H, COPTS);
      return [r * Math.cos(theta), r * Math.sin(theta), t * H];
    },
  };
  const innerSampler: SurfaceSampler = {
    position(u: number, t: number): Vec3 {
      const theta = u * TAU;
      const r = R0 - 4;
      const z = TBOTTOM + t * (H - TBOTTOM);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
  const [, packedArr] = buildStyleParamPayload('CelticKnot', {
    ck_scale: C.ckScale, ck_width: C.ckWidth, ck_relief: C.ckRelief, ck_gap: C.ckGap,
    ck_roundness: C.ckRoundness, ck_twist: C.ckTwist, ck_strands: C.ckStrands,
  });
  const packed = Float32Array.from(packedArr);

  // Independent reference: trace the RIDGE of the relief field (r − r0) directly,
  // WITHOUT reusing the extractor's strand sinusoid. ∂(r−r0)/∂u sign-change =
  // local radius extremum = strand crest. periodicU=true (the braid tiles in u).
  // CAVEAT: relief is C0 (Z-buffer occlusion + background plateau), so this
  // gradient zero set is noisier than a smooth level set — documented honestly.
  const relief = (u: number, t: number): number =>
    rOuterCelticKnot(u * TAU, t * H, R0, H, COPTS) - R0;
  const hU = 0.5 / 2048;
  const ridgeSegs = marchingSquaresZero(
    (u, t) => relief(u + hU, t) - relief(u - hU, t), 2048, 1536, true);
  const ridgeLines = segmentsToPolylines(ridgeSegs, 'ref-ck-ridge', 3, 0);
  // Filter to crests only (relief > 30% of max), dropping the background-plateau
  // gradient noise. This keeps the trace on the visible braided strands.
  let maxRel = 0;
  for (let i = 0; i < 4000; i++) {
    const u = (i * 0.6180339887) % 1;
    const t = (i * 0.7548776662) % 1;
    const r = relief(u, t);
    if (r > maxRel) maxRel = r;
  }
  const crestThresh = 0.3 * maxRel;
  const ridgeCrest = ridgeLines
    .map((l) => ({ ...l, points: l.points.filter((p) => relief(p.u, p.t) > crestThresh) }))
    .filter((l) => l.points.length >= 3);

  // The extractor's own scalar IS the strand-centerline sinusoid; for the
  // extraction-fidelity reference we densely sample those analytic centerlines
  // directly (the smooth ground truth the extractor approximates with N=97 pts).
  const exLines = celticKnotAnalyticCenterlines(packed, 769);

  return {
    styleId: 'CelticKnot', sampler, innerSampler, packed,
    refExtractorPts: densifyLoci(exLines, 1), refExtractorLineCount: exLines.length,
    refRidgePts: densifyLoci(ridgeCrest, 2), refRidgeLineCount: ridgeCrest.length,
  };
}

/** Analytic strand centerlines (the extractor's ground truth) at high t-res N.
 *  Mirrors extractCelticKnot (FeatureLineGraph.ts:574) but denser. */
function celticKnotAnalyticCenterlines(p: Float32Array, N: number): FeatureLine[] {
  const wrapU = (u: number): number => ((u % 1) + 1) % 1;
  const columns = Math.max(1, Math.floor(p[0]));
  const strands = Math.max(2, Math.min(8, Math.floor(p[6] + 0.5)));
  const tightness = Math.max(0.5, p[5] + 0.5);
  const amp = 0.4;
  const phaseStep = TAU / strands;
  const lines: FeatureLine[] = [];
  for (let c = 0; c < columns; c++) {
    const basePhase = c * Math.PI * 0.333;
    for (let i = 0; i < strands; i++) {
      const phase = basePhase + phaseStep * i;
      const points: FeatureLinePt[] = [];
      for (let s = 0; s < N; s++) {
        const t = s / (N - 1);
        const v = t * tightness * TAU * 3;
        const localU = amp * Math.sin(v + phase);
        points.push({ u: wrapU(c / columns + (localU + 1) / (2 * columns)), t });
      }
      lines.push({ kind: 'general-curve', points, label: `ref-strand[c=${c},i=${i}]` });
    }
  }
  return lines;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-style setup: extraction fidelity (1) + the two featureLevel blocks.
// ─────────────────────────────────────────────────────────────────────────────
function runStyle(spec: StyleSpec): void {
  log(`\n========== ${spec.styleId.toUpperCase()} FEATURE-FLOW (extractor-independent) ==========`);
  log(`dims H=${H} Rt=Rb=r0=${R0}; default params`);
  log(`reference loci: extractor-own-scalar ${spec.refExtractorLineCount} polylines / ` +
    `${spec.refExtractorPts.length} pts; independent ridge ${spec.refRidgeLineCount} polylines / ` +
    `${spec.refRidgePts.length} pts`);

  // Production extraction (the inserted general-curves).
  const graph = extractAnalyticFeatures(spec.styleId, spec.packed, { H, Rt: R0, Rb: R0 });
  const prodLines = graph.lines.filter((l) => l.kind === 'general-curve');
  let prodPtCount = 0;
  for (const l of prodLines) prodPtCount += l.points.length;
  log(`production extractAnalyticFeatures: ${graph.lines.length} lines ` +
    `(${prodLines.length} general-curve), ${prodPtCount} pts, groundTruthCount=${graph.groundTruthCount}`);

  if (prodLines.length === 0) {
    log(`  !! EXTRACTOR RETURNED EMPTY for ${spec.styleId} — feature edges cannot flow (no inserted curve).`);
  }

  // (1) Extraction fidelity: extractor-own-scalar reference → nearest production curve.
  let exMax = 0;
  let exSum = 0;
  for (const p of spec.refExtractorPts) {
    const d = minDistToSegments(p, prodLines);
    if (Number.isFinite(d)) { if (d > exMax) exMax = d; exSum += d; }
  }
  const exMean = spec.refExtractorPts.length > 0 ? exSum / spec.refExtractorPts.length : 0;
  log(`(1) EXTRACTION FIDELITY: hi-res extractor-own-scalar ref → production inserted curve:`);
  log(`      max  = ${exMax.toFixed(4)} mm   mean = ${exMean.toFixed(4)} mm` +
    (prodLines.length === 0 ? '  (no curve → distances are Infinity, shown as 0)' : ''));

  measure(spec, prodLines, FL7);
  measure(spec, prodLines, FL11);
}

describe('VERIFY Voronoi + CelticKnot feature-flow (extractor-independent)', () => {
  it('VORONOI: extraction fidelity + true edge-coverage + flank staircase + circular gap @ FL7 & FL11', () => {
    runStyle(buildVoronoiSpec());
  }, 600000);

  it('CELTIC KNOT: extraction fidelity + true edge-coverage + flank staircase + circular gap @ FL7 & FL11', () => {
    runStyle(buildCelticKnotSpec());
  }, 600000);
});
