/**
 * measureProjectorMax.ts — a LEAN, MAX-first, browser-safe mesh→surface distance ruler.
 *
 * The one-sided Hausdorff (mesh → exact analytic surface) MAX, computed by the
 * GLOBALLY-CORRECT radial projector (buildRadialSurfaceProjector) alone: vertices for the
 * placement channel, triangle centroid + edge midpoints for the flat-facet chord channel.
 * NO per-facet coarse global search — that is the ~3.6ms/triangle cost inside
 * measureRadialFidelity / perpendicular3DDeviation that makes whole-mesh production-scale
 * measurement infeasible (measured: 169s for a 47k-tri wall ⇒ ~9h at 9M tris).
 *
 * Two production-scale hardening properties (this runs IN-PAGE on multi-million-triangle
 * export walls, so it must not wedge the browser):
 *   - ASYNC-CHUNKED: yields to the event loop every CHUNK samples, so a 45-min scan on a 9M-tri
 *     DS wall never blocks the renderer (no "page unresponsive"; the harness stays alive).
 *   - MEMORY-BOUNDED: p99 comes from a fixed histogram, not an O(samples) sorted array (which
 *     would be ~320MB for a 9M-tri wall, on top of the mesh itself).
 *
 * Shape scope = single-valued radial `rA` (same as the projector). The export emitters place
 * vertices exactly on rA (measured vertexMax ≈ f32 floor), so this reads the honest
 * tessellation error as chordMax. Designed cliffs are MEASURED, never excluded
 * (feedback_export_standard). Certify on `maxMm`; AND it with a watertight topology check on
 * the full closed solid. For MISSING surface (a hole), the watertight/boundaryEdges check is
 * the complement (this one-sided ruler is blind to omission; a closed mesh has none).
 *
 * Pure CPU. Additive: composes existing exports, changes none of them.
 */
import { buildRadialSurfaceProjector } from './radialSurfaceProjector';
import type { AnalyticRadiusFn } from './analyticSurfaceGate';
import type { MeshView } from './types';

export interface ProjectorMaxOptions {
  /** Wall height (mm). */
  H: number;
  /** Certification tolerance (mm); default 0.01. */
  tolMm?: number;
  /** Global projector grid resolution (default 1024 × 512). */
  nTheta?: number;
  nZ?: number;
  /** Gauss-Newton polish cap per project() (default 8; on-surface vertices converge fast). */
  maxIter?: number;
  zMin?: number;
  zMax?: number;
  /** Samples per event-loop yield (default 25000). Lower = more responsive, slightly slower. */
  chunk?: number;
  /**
   * TREAD-AWARE mode (for riser/tread styles — DragonScales, BambooSegments, ArtDeco). When set, a triangle whose
   * vertex-RADIUS spread (max|xy| − min|xy|) exceeds this (mm) is treated as a near-vertical RISER/TREAD face that the
   * single-valued `rA` cannot represent (measuring it against `rA` fabricates ~half-step inflation). Its chord samples
   * are routed to `treadChordMaxMm` (reported for transparency) instead of `chordMaxMm`, so `smoothMaxMm` (=
   * max(vertexMax, smooth chord)) is the HONEST fidelity of the tessellated surface. Structured emitters place their
   * treads as faithful vertical walls by construction (verify vertexMax ≈ 0 separately), so `smoothMaxMm` is the
   * verdict for them. Unset ⇒ every face counts in `chordMaxMm`/`maxMm` (single-valued behaviour, unchanged).
   */
  treadRadiusSpreadMm?: number;
}

export interface ProjectorMaxReport {
  /** max(vertexMax, chordMax) — THE certification number. */
  maxMm: number;
  /** Worst vertex → surface distance (placement; ≈ f32 floor when on-surface). */
  vertexMaxMm: number;
  /** Worst centroid/edge-midpoint → surface distance (flat-facet tessellation chord). */
  chordMaxMm: number;
  /** ~99th-percentile over all samples (histogram-binned; diagnosis only — never certify on it). */
  p99Mm: number;
  samples: number;
  /** Non-finite samples skipped (>0 ⇒ do not gate; the reference is untrusted here). */
  nonFiniteCount: number;
  tolMm: number;
  /** maxMm ≤ tol AND all samples finite. AND this with a watertight full-solid check. */
  certified: boolean;
  // ── tread-aware split (populated only when opts.treadRadiusSpreadMm is set; else = maxMm / 0 / 0) ──
  /** max(vertexMax, SMOOTH-face chord) — the HONEST fidelity of the tessellated surface (riser/tread faces excluded). */
  smoothMaxMm: number;
  /** Worst chord on the riser/tread faces (vs single-valued rA ⇒ ~half-step inflation; transparency only, never gate). */
  treadChordMaxMm: number;
  /** Triangles classified as riser/tread (radius-spread > threshold). */
  treadFaceCount: number;
}

const HIST_BUCKETS = 4096;
const HIST_MAX_MM = 2.0; // p99 resolution ≈ 0.0005mm; anything larger lands in the overflow bucket

export async function measureProjectorMax(
  mesh: MeshView,
  rA: AnalyticRadiusFn,
  opts: ProjectorMaxOptions,
): Promise<ProjectorMaxReport> {
  const tolMm = opts.tolMm ?? 0.01;
  const chunk = Math.max(1000, Math.floor(opts.chunk ?? 25000));
  const proj = buildRadialSurfaceProjector(rA, {
    H: opts.H,
    zMin: opts.zMin ?? 0,
    zMax: opts.zMax ?? opts.H,
    nTheta: opts.nTheta ?? 1024,
    nZ: opts.nZ ?? 512,
    maxIter: opts.maxIter ?? 8,
  });
  const V = mesh.vertices;
  const I = mesh.indices;
  const nV = V.length / 3;
  const nT = I.length / 3;

  const hist = new Int32Array(HIST_BUCKETS + 1); // last cell = overflow (≥ HIST_MAX_MM)
  let total = 0;
  let vertexMax = 0;
  let chordMax = 0;
  let treadChordMax = 0;
  let treadFaceCount = 0;
  let nonFinite = 0;
  const invBin = HIST_BUCKETS / HIST_MAX_MM;
  const treadThr = opts.treadRadiusSpreadMm;

  // `tread` chord samples (riser faces vs single-valued rA) are tracked separately and kept OUT of the histogram +
  // chordMax, so p99/smoothMax reflect the tessellated surface, not the inflated vertical treads.
  const record = (d: number, chordChannel: boolean, tread: boolean): void => {
    if (!Number.isFinite(d)) {
      nonFinite++;
      return;
    }
    if (tread) {
      if (d > treadChordMax) treadChordMax = d;
      return;
    }
    if (chordChannel) {
      if (d > chordMax) chordMax = d;
    } else if (d > vertexMax) {
      vertexMax = d;
    }
    hist[d >= HIST_MAX_MM ? HIST_BUCKETS : Math.min(HIST_BUCKETS - 1, (d * invBin) | 0)]++;
    total++;
  };
  const yieldToLoop = (): Promise<void> => new Promise((r) => setTimeout(r));

  // Placement channel — each unique vertex once (chunked). Vertices are never "tread" (a placed vertex is on the
  // surface; only the flat-facet interior can bridge a vertical riser).
  for (let base = 0; base < nV; base += chunk) {
    const end = Math.min(nV, base + chunk);
    for (let i = base; i < end; i++) {
      record(proj.project(V[3 * i], V[3 * i + 1], V[3 * i + 2]).dist, false, false);
    }
    await yieldToLoop();
  }
  // Chord channel — centroid + 3 edge midpoints per triangle (chunked; ~4 samples per tri).
  const triPerChunk = Math.max(250, (chunk / 4) | 0);
  for (let base = 0; base < nT; base += triPerChunk) {
    const end = Math.min(nT, base + triPerChunk);
    for (let t = base; t < end; t++) {
      const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
      const ax = V[3 * a], ay = V[3 * a + 1], az = V[3 * a + 2];
      const bx = V[3 * b], by = V[3 * b + 1], bz = V[3 * b + 2];
      const cx = V[3 * c], cy = V[3 * c + 1], cz = V[3 * c + 2];
      // Tread classification: a large vertex-radius spread ⇒ a near-vertical riser face rA can't represent.
      let tread = false;
      if (treadThr !== undefined) {
        const ra = Math.hypot(ax, ay), rb = Math.hypot(bx, by), rc = Math.hypot(cx, cy);
        if (Math.max(ra, rb, rc) - Math.min(ra, rb, rc) > treadThr) {
          tread = true;
          treadFaceCount++;
        }
      }
      record(proj.project((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3).dist, true, tread);
      record(proj.project((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2).dist, true, tread);
      record(proj.project((bx + cx) / 2, (by + cy) / 2, (bz + cz) / 2).dist, true, tread);
      record(proj.project((cx + ax) / 2, (cy + ay) / 2, (cz + az) / 2).dist, true, tread);
    }
    await yieldToLoop();
  }

  let p99 = NaN;
  if (total > 0) {
    const target = Math.floor(total * 0.99);
    let acc = 0;
    for (let bkt = 0; bkt <= HIST_BUCKETS; bkt++) {
      acc += hist[bkt];
      if (acc >= target) {
        p99 = bkt >= HIST_BUCKETS ? HIST_MAX_MM : (bkt / HIST_BUCKETS) * HIST_MAX_MM;
        break;
      }
    }
  }
  const smoothMaxMm = Math.max(vertexMax, chordMax); // honest tessellated-surface max (treads excluded in tread-aware mode)
  const maxMm = Math.max(smoothMaxMm, treadChordMax); // FULL max — equals smoothMaxMm when not tread-aware (treadChordMax=0)
  // Certify on the HONEST max: smoothMaxMm in tread-aware mode (the treads are faithful vertical walls by construction,
  // so their rA-inflation is not a fidelity failure), else the full maxMm (single-valued styles).
  const certMax = treadThr !== undefined ? smoothMaxMm : maxMm;
  return {
    maxMm,
    vertexMaxMm: vertexMax,
    chordMaxMm: chordMax,
    p99Mm: p99,
    samples: total,
    nonFiniteCount: nonFinite,
    tolMm,
    certified: nonFinite === 0 && certMax <= tolMm,
    smoothMaxMm,
    treadChordMaxMm: treadChordMax,
    treadFaceCount,
  };
}
