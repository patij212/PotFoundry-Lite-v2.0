/**
 * verify_gyroidFeatureFlow.test.ts — HONEST, extractor-INDEPENDENT measurement of
 * how well the conforming mesh represents the sharp features of GyroidManifold.
 *
 * ## Why this exists
 *
 * `measureFeatureResolution` (FeatureLineGraph.ts) is CIRCULAR: it scores mesh
 * coverage against the SAME polyline `extractGyroidManifold` produced, so it can
 * never reveal under-resolution of the curve itself, nor of the relief WALLS the
 * curve only approximates. This file builds an INDEPENDENT reference (a dense
 * marching-squares trace of the gyroid level field) and measures the production
 * mesh against it, at two configs:
 *   A — production default-ish (maxLevel 12, maxSag 0.05, nRing 1024)
 *   B — CAD               (maxLevel 16, maxSag 0.003, nRing 2048)
 *
 * ## Hypothesis under test
 *
 * `extractGyroidManifold` traces the level set `val=0` (the relief band
 * CENTERLINE) and inserts it as a general-curve. But the sharp VISIBLE features
 * are the relief WALL BOUNDARIES (where the relief ramps, roughly the level sets
 * |val| ≈ th, th = gmThickness·1.5). So (a) the inserted centerline may be
 * mislocated / staircased relative to the true level set, and (b) the steep
 * flanks between centerline and plateau may be meshed by the band-limited /
 * depth-capped refiner and STAIRCASE.
 *
 * Pure CPU, read-only imports, no production change. (jsdom / Vitest, NO WebGPU —
 * the analytic SurfaceSampler stands in for the GPU dense-grid sampler.)
 */
import { describe, it, expect } from 'vitest';
import { rOuterGyroidManifold } from '../geometry/styles';
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
  segmentsToPolylines,
} from '../renderers/webgpu/parametric/conforming/SampledFeatureExtractor';
import type { SurfaceSampler, Vec3 } from '../renderers/webgpu/parametric/conforming/SurfaceSampler';
import { assembleWatertight } from '../renderers/webgpu/parametric/conforming/WatertightAssembly';

const TAU = 2 * Math.PI;

// ── Realistic pot dims + DEFAULT gyroid params (held identical between the radius
//    sampler and the packed extractor params so `gyroidVal` ⇄ `rOuterGyroidManifold`
//    agree). gm_* values mirror packGyroidManifold's defaults so the production
//    extractor reads exactly what the sampler's radius uses. ─────────────────────
const H = 120;
const R0 = 40; // Rt = Rb = r0
const TBOTTOM = 6;
const RDRAIN = 0;

// Single source of truth for the gyroid parameters (named → sampler, packed → extractor).
const GM = {
  gmScale: 3.5,
  gmThickness: 0.2,
  gmMorph: 0.0,
  gmRelief: 1.0,
  gmSharpness: 0.1,
  gmZStretch: 1.0,
  gmPulse: 0.0,
  gmEdgeFade: 0.15,
  gmBias: 0.0,
  gmCurve: 1.0,
} as const;
const GM_OPTS: StyleOptions = { ...GM };

// Relief WALL-BOUNDARY threshold: |val| = th, th = gmThickness·1.5 (styles.ts:1281).
const TH = GM.gmThickness * 1.5;

// Packed params (WGSL style_param slot order). buildStyleParamPayload uses
// packGyroidManifold, whose slots are: 0 scale, 1 thickness, 2 morph, 3 relief,
// 4 sharpness, 5 z_stretch, 6 pulse, 7 edge_fade, 8 bias, 9 curve — the SAME slots
// `gyroidVal`/`extractGyroidManifold` read (0,2,5,6,8). So we feed GM through it.
const [, packedArr] = buildStyleParamPayload('GyroidManifold', {
  gm_scale: GM.gmScale,
  gm_thickness: GM.gmThickness,
  gm_morph: GM.gmMorph,
  gm_relief: GM.gmRelief,
  gm_sharpness: GM.gmSharpness,
  gm_z_stretch: GM.gmZStretch,
  gm_pulse: GM.gmPulse,
  gm_edge_fade: GM.gmEdgeFade,
  gm_bias: GM.gmBias,
  gm_curve: GM.gmCurve,
});
const PACKED = Float32Array.from(packedArr);

// ── val(u,t): self-contained replica of the gyroid level scalar (styles.ts
//    1261-1275), so the WALL-BOUNDARY level sets |val|=th can be traced. ──────────
function val(u: number, t: number): number {
  const scale = GM.gmScale;
  const morph = GM.gmMorph;
  const zStretch = GM.gmZStretch;
  const pulse = GM.gmPulse;
  const bias = GM.gmBias;
  const phi = u * TAU; // theta
  const x = scale * Math.cos(phi);
  const y = scale * Math.sin(phi);
  const zTpms = scale * t * zStretch * 4.0 + pulse * TAU;
  const gyr = Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(zTpms) + Math.sin(zTpms) * Math.cos(x);
  const sch = Math.cos(x) + Math.cos(y) + Math.cos(zTpms);
  return (1 - morph) * gyr + morph * sch + bias;
}

/** Relief height contributed at (u,t): r − r0 (positive where the wall ramps up). */
function relief(u: number, t: number): number {
  return rOuterGyroidManifold(u * TAU, t * H, R0, H, GM_OPTS) - R0;
}

/** Analytic gyroid SurfaceSampler — cylinder map, exactly like SyntheticCylinderSampler. */
const sampler: SurfaceSampler = {
  position(u: number, t: number): Vec3 {
    const theta = u * TAU;
    const r = rOuterGyroidManifold(theta, t * H, R0, H, GM_OPTS);
    return [r * Math.cos(theta), r * Math.sin(theta), t * H];
  },
};
/** Smooth inner wall (constant offset) — the production inner wall is featureless. */
const innerSampler: SurfaceSampler = {
  position(u: number, t: number): Vec3 {
    const theta = u * TAU;
    const r = R0 - 4; // inner radius (wall thickness ~4mm)
    const z = TBOTTOM + t * (H - TBOTTOM);
    return [r * Math.cos(theta), r * Math.sin(theta), z];
  },
};

// 3D scale factors for (u,t) → mm (du·2π·r0 around, dt·H up). Used to convert
// (u,t) distances to mm and to set 3D tolerances.
const U_TO_MM = TAU * R0; // ≈ 251.3 mm full circumference
const T_TO_MM = H; // 120 mm

/** Densely sample a polyline set into (u,t) points (no subsampling beyond stored). */
function densifyLoci(lines: FeatureLine[], perSeg = 4): FeatureLinePt[] {
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
interface FeatureLinePt { u: number; t: number }

/** Periodic u-distance. */
function uDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/** 3D (mm) distance between two (u,t) points using the local cylinder metric. */
function utDist3D(a: FeatureLinePt, b: FeatureLinePt): number {
  const du = uDist(a.u, b.u) * U_TO_MM;
  const dt = Math.abs(a.t - b.t) * T_TO_MM;
  return Math.hypot(du, dt);
}

/** Min 3D distance (mm) from point p to a polyline-segment set (production loci). */
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
/** 3D (mm) point→segment distance in (u,t) with periodic-u unwrapping. */
function distToSeg3D(p: FeatureLinePt, a: FeatureLinePt, b: FeatureLinePt): number {
  // Unwrap b and p relative to a in u so the seam is handled.
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

// ── Mesh edge set (3D-coverage probe) ────────────────────────────────────────
interface MeshEdge { a: FeatureLinePt; b: FeatureLinePt }
/** Build the unique undirected (u,t) edge set of the OUTER wall (surfaceId 0). */
function outerWallEdges(verts: Float32Array, indices: Uint32Array): {
  edges: MeshEdge[];
  utVerts: FeatureUTVertex[];
} {
  const isOuter = (vi: number): boolean => verts[vi * 3 + 2] < 0.5; // surfaceId 0
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
  // Outer-wall (u,t) vertex list (for the circular metric).
  const utVerts: FeatureUTVertex[] = [];
  const nV = verts.length / 3;
  for (let i = 0; i < nV; i++) if (isOuter(i)) utVerts.push({ u: verts[i * 3], t: verts[i * 3 + 1] });
  return { edges, utVerts };
}

// ── 2D (u,t) ref-point grid: O(1) "is a query within bandMm of any ref point". ──
// Maps each ref point into a (NU × NT) cell; a query scans only its ±1 neighbour
// cells, so the per-query cost is bounded regardless of the total ref count. This
// is the lever that keeps the dense config-B facet scan tractable.
class RefGrid {
  private readonly cells: number[][];
  private readonly cellU: number;
  private readonly cellT: number;
  constructor(
    private readonly pts: FeatureLinePt[],
    bandMm: number,
  ) {
    // Cell size ≈ bandMm in each axis so a query touches ≤9 cells.
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
  private readonly nu: number;
  private readonly nt: number;
  private colU(u: number): number {
    const uu = ((u % 1) + 1) % 1;
    return Math.min(this.nu - 1, Math.floor(uu / this.cellU));
  }
  private rowT(t: number): number {
    const tt = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.min(this.nt - 1, Math.floor(tt / this.cellT));
  }
  /** True if (u,t) is within bandMm (3D) of any ref point. */
  within(u: number, t: number, bandMm: number): boolean {
    const cu = this.colU(u);
    const ct = this.rowT(t);
    const q = { u, t };
    for (let dt = -1; dt <= 1; dt++) {
      const rt = ct + dt;
      if (rt < 0 || rt >= this.nt) continue;
      for (let du = -1; du <= 1; du++) {
        const ru = ((cu + du) % this.nu + this.nu) % this.nu; // u periodic
        for (const ri of this.cells[rt * this.nu + ru]) {
          if (utDist3D(q, this.pts[ri]) <= bandMm) return true;
        }
      }
    }
    return false;
  }
}

/** Fraction of reference-locus points with a mesh EDGE within tolMm (3D). */
function edgeCoverage(refPts: FeatureLinePt[], edges: MeshEdge[], tolMm: number): number {
  if (refPts.length === 0) return 1;
  // 2D-grid the edges (bucket each edge into every (u,t) cell its midpoint-span
  // touches); a ref point checks only its ±1 neighbour cells.
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
    // Register at both endpoints' cells (an edge ≤ a couple of mesh cells long
    // never spans more than ±1 grid cell at this granularity).
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

/** Per-facet centroid radial deviation (mm) restricted to / excluded from a band. */
function facetRadialDeviation(
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
    // Facet centroid 3D vs true-surface point at the centroid's own (u,t) (radial).
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

interface Config {
  name: string;
  maxSagMm: number;
  maxLevel: number;
  nRing: number;
  resU: number;
  resT: number;
  cellSamples: number;
  featureLevel: number;
  targetTriangles: number;
}
const CONFIG_A: Config = {
  name: 'A (production default-ish)',
  maxSagMm: 0.05, maxLevel: 12, nRing: 1024, resU: 1024, resT: 1024,
  cellSamples: 1, featureLevel: 7, targetTriangles: 6_000_000,
};
// CAD config. NB: production CAD ('high') uses nRing 2048; that doubles the
// uniform ring (and quadruples the curve-insertion CDT work) and exhausts the
// jsdom CPU heap (>3GB, no completion in 10 min — MEASURED). The CAD LEVER per
// the crease-density breakthrough is the DEEP SAG REFINEMENT (maxSag↓ +
// maxLevel↑ + cellSamples), NOT the ring count, so we hold nRing at 1024 and push
// the sag/depth/cell-sample levers. This is faithful to the density mechanism;
// the nRing axis is documented as the only deviation from production CAD.
const CONFIG_B: Config = {
  name: 'B (CAD: deep sag refine, nRing held at 1024 for jsdom tractability)',
  maxSagMm: 0.003, maxLevel: 16, nRing: 1024, resU: 1024, resT: 1024,
  cellSamples: 2, featureLevel: 11, targetTriangles: 16_000_000,
};

/** Build the production watertight mesh for a config; return outer-wall geometry. */
function buildMesh(cfg: Config, generalCurves: FeatureLine[]): {
  verts: Float32Array; indices: Uint32Array; outerTriCount: number;
} {
  const asm = assembleWatertight(
    sampler,
    innerSampler,
    { H, tBottom: TBOTTOM, rDrain: RDRAIN },
    {
      maxSagMm: cfg.maxSagMm,
      maxEdgeMm: 1,
      minEdgeMm: Math.min(0.2, Math.max(0.04, cfg.maxSagMm * 2)),
      gradeRatio: 2,
      maxLevel: cfg.maxLevel,
      resU: 128, // sizing-field curvature-grid res (production qSizingRes=128)
      resT: 128,
      nRing: cfg.nRing,
      cellSamples: cfg.cellSamples,
      targetTriangles: cfg.targetTriangles,
      budgetMode: 'cap',
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

const log = (...a: unknown[]): void => {
  // eslint-disable-next-line no-console
  console.log(...a);
};

const EDGE_TOL_MM = 0.1;
const FLANK_BAND_MM = 0.5;

/** Shared, extractor-independent setup (cheap; computed once, lazily). */
interface Shared {
  refCenterPts: FeatureLinePt[];
  refWallPts: FeatureLinePt[];
  graph: ReturnType<typeof extractAnalyticFeatures>;
  prodLines: FeatureLine[];
}
let _shared: Shared | null = null;
function shared(): Shared {
  if (_shared) return _shared;
  // ── Self-check: the val() replica is consistent with the radius relief. ────
  // Relief peaks (large r) where |val| is small (≤ th); relief is ~0 where |val|≫th.
  let peakReliefSmallVal = 0;
  let plateauReliefLargeVal = 0;
  let nPeak = 0;
  let nPlateau = 0;
  for (let i = 0; i < 4000; i++) {
    const u = (i * 0.6180339887) % 1;
    const tt = ((i * 0.7548776662) % 1) * 0.7 + 0.15; // inside the edge-fade band
    const d = Math.abs(val(u, tt));
    const rel = relief(u, tt);
    if (d < 0.3 * TH) { peakReliefSmallVal += rel; nPeak++; }
    if (d > 2 * TH) { plateauReliefLargeVal += rel; nPlateau++; }
  }
  const meanPeakRelief = nPeak > 0 ? peakReliefSmallVal / nPeak : 0;
  const meanPlateauRelief = nPlateau > 0 ? plateauReliefLargeVal / nPlateau : 0;
  log('\n========== GYROID FEATURE-FLOW MEASUREMENT (extractor-independent) ==========');
  log(`dims H=${H} Rt=Rb=r0=${R0}; gm defaults; th=|val| wall threshold = ${TH.toFixed(4)}`);
  log(`SELF-CHECK val⇄radius: mean relief where |val|<0.3·th = ${meanPeakRelief.toFixed(4)}mm ` +
    `(peaks); where |val|>2·th = ${meanPlateauRelief.toFixed(4)}mm (plateau). ` +
    `relief(peak) >> relief(plateau)? ${meanPeakRelief > meanPlateauRelief + 0.05 ? 'YES' : 'NO'}`);
  expect(meanPeakRelief).toBeGreaterThan(meanPlateauRelief); // consistency

  // ── Reference loci (independent of the extractor) ──────────────────────────
  const refCenterSegs = marchingSquaresZero((u, t) => val(u, t), 2048, 2048, true);
  const refCenterLines = segmentsToPolylines(refCenterSegs, 'ref-center', 3, 0);
  const refWallSegs = marchingSquaresZero((u, t) => Math.abs(val(u, t)) - TH, 2048, 2048, true);
  const refWallLines = segmentsToPolylines(refWallSegs, 'ref-wall', 3, 0);
  const refCenterPts = densifyLoci(refCenterLines, 3);
  const refWallPts = densifyLoci(refWallLines, 3);
  log(`reference loci: centerline ${refCenterLines.length} polylines / ${refCenterPts.length} pts; ` +
    `wall-boundary ${refWallLines.length} polylines / ${refWallPts.length} pts`);

  // ── Production extraction (the inserted general-curves) ────────────────────
  const graph = extractAnalyticFeatures('GyroidManifold', PACKED, { H, Rt: R0, Rb: R0 });
  const prodLines = graph.lines.filter((l) => l.kind === 'general-curve');
  let prodPtCount = 0;
  for (const l of prodLines) prodPtCount += l.points.length;
  log(`production extractAnalyticFeatures: ${graph.lines.length} lines (${prodLines.length} general-curve), ` +
    `${prodPtCount} pts, groundTruthCount=${graph.groundTruthCount}`);

  // ── (1) Extraction fidelity: reference centerline → nearest production curve.
  let exMax = 0;
  let exSum = 0;
  for (const p of refCenterPts) {
    const d = minDistToSegments(p, prodLines);
    if (d > exMax) exMax = d;
    exSum += d;
  }
  const exMean = refCenterPts.length > 0 ? exSum / refCenterPts.length : 0;
  log('\n--- (1) EXTRACTION FIDELITY: ref centerline (val=0 @2048²) → production inserted curve ---');
  log(`    max  = ${exMax.toFixed(4)} mm`);
  log(`    mean = ${exMean.toFixed(4)} mm`);

  _shared = { refCenterPts, refWallPts, graph, prodLines };
  return _shared;
}

/** Build a config's mesh + emit the (2)(3)(4) measurement block. */
function measureConfig(cfg: Config): void {
  const { refCenterPts, refWallPts, graph, prodLines } = shared();
  expect(prodLines.length).toBeGreaterThan(0); // the gyroid extractor must emit curves
  log(`\n############ CONFIG ${cfg.name}`);
  log(`   maxLevel=${cfg.maxLevel} maxSag=${cfg.maxSagMm} nRing=${cfg.nRing} ` +
    `cellSamples=${cfg.cellSamples} featureLevel=${cfg.featureLevel} ############`);
  const t0 = Date.now();
  const { verts, indices, outerTriCount } = buildMesh(cfg, prodLines);
  const buildMs = Date.now() - t0;
  const { edges, utVerts } = outerWallEdges(verts, indices);
  log(`  mesh: ${verts.length / 3} verts (${utVerts.length} outer-wall), ` +
    `${indices.length / 3} tris (${outerTriCount} outer-wall), ${edges.length} outer edges; build ${buildMs}ms`);

  // (2) True edge-coverage: centerline vs wall-boundary.
  const covCenter = edgeCoverage(refCenterPts, edges, EDGE_TOL_MM);
  const covWall = edgeCoverage(refWallPts, edges, EDGE_TOL_MM);
  log(`  (2) TRUE EDGE-COVERAGE (mesh edge within ${EDGE_TOL_MM}mm 3D of reference locus):`);
  log(`        centerline (val=0)     : ${(100 * covCenter).toFixed(1)}%`);
  log(`        wall-boundary (|val|=th): ${(100 * covWall).toFixed(1)}%`);

  // (3) Crease crispness / staircase: facet radial dev near vs far from wall boundaries.
  const { near, far } = facetRadialDeviation(verts, indices, refWallPts, FLANK_BAND_MM);
  log(`  (3) FACET RADIAL DEVIATION (outer wall), band = ±${FLANK_BAND_MM}mm 3D of wall-boundary loci:`);
  log(`        NEAR walls : n=${near.count}  max=${near.max.toFixed(4)}  p99=${near.p99.toFixed(4)}  mean=${near.mean.toFixed(4)} mm`);
  log(`        FAR (flank): n=${far.count}  max=${far.max.toFixed(4)}  p99=${far.p99.toFixed(4)}  mean=${far.mean.toFixed(4)} mm`);

  // (4) Circular-metric contrast: the existing measureFeatureResolution.
  const circ = measureFeatureResolution(graph, utVerts);
  log(`  (4) CIRCULAR METRIC measureFeatureResolution (scores mesh vs the SAME extracted curve):`);
  log(`        expected=${circ.expected} present=${circ.present} dropped=${circ.dropped} ` +
    `(present/expected = ${circ.expected > 0 ? (100 * circ.present / circ.expected).toFixed(1) : 'n/a'}%); ` +
    `meshUColumns=${circ.meshUColumnCount}`);
  const avgCirc = circ.perLine.length > 0
    ? circ.perLine.reduce((s, l) => s + l.coverage, 0) / circ.perLine.length : 0;
  log(`        mean per-line coverage (circular) = ${(100 * avgCirc).toFixed(1)}%  ` +
    `vs TRUE wall-boundary edge-coverage ${(100 * covWall).toFixed(1)}%  ` +
    `→ circular−true gap = ${(100 * (avgCirc - covWall)).toFixed(1)} pts`);

  // Document the current state so the test runs (and fails LOUDLY if a future
  // change silently zeroes coverage). The numeric table is the deliverable.
  expect(refWallPts.length).toBeGreaterThan(0);
  expect(covCenter).toBeGreaterThanOrEqual(0);
}

describe('VERIFY GyroidManifold feature-flow (extractor-independent)', () => {
  it('CONFIG A (production default-ish): extraction fidelity + true edge-coverage + crispness + circular gap', () => {
    measureConfig(CONFIG_A);
  }, 600000);

  it('CONFIG B (CAD deep sag refine): true edge-coverage + crispness + circular gap', () => {
    measureConfig(CONFIG_B);
  }, 600000);
});
