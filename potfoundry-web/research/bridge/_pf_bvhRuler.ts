// _pf_bvhRuler.ts — DEV-ONLY meshing LAB (research/, never imported by src/).
//
// THE SCALABLE BVH-TRUTH-TWIN RULER for E-2026-07-06-BVH-RULER. The honest basis the whole-mesh re-baseline needs:
// instead of scoring each facet-interior sample as min(GN, full-azimuth analytic bruteNearestOnRadialSurface) — an
// ANALYTIC nearest-point on the radial surface S(θ,z), which can stall in a wrong-local-minimum on tangled lattices
// and OVERSTATE near-vertical relief (cheatsheet: up to ~7×) — this scores it as the exact 3D point-to-triangle
// distance to an ULTRA-DENSE TRIANGULATED TWIN of the SAME surface, via the proven `buildRefLocator` flat-CSR BVH
// (Ericson closest-point, adversarially == brute to ~1e-6).
//
// WHY THIS IS AN INDEPENDENT SECOND RULER (the Q1 discriminator): for the analytic-ruler styles the object surface IS
// the single-valued radial surface S(θ,z)=(rA·cosθ, rA·sinθ, z). A dense θ×z triangulated twin of S is therefore an
// INDEPENDENT implementation of "nearest point on the object surface". If it agrees with the analytic brute, the
// whole-mesh ruler is honest (outliers GENUINE); if it reads materially smaller, the analytic brute OVERSTATES on
// steep facets (RULER ARTIFACT). The twin ALSO reaches densities the analytic brute cannot (BVH query is ~µs, not the
// O(nTheta·nZ) analytic scan) → it is the ruler the 22M-tri weave/braid/seam styles need.
//
// BAND-LIMIT GUARD (the 9th-audit catch): a too-coarse twin UNDER-states (its flat facets can't represent a fine
// channel wall, so a genuinely-far sample finds a spurious near-triangle) → would FAKE a "ruler artifact" verdict.
// `ratioStudy` re-scores the worst facets against a DOUBLED-resolution twin and reports the change; a valid artifact
// verdict REQUIRES <10% change. `twinOnSurfaceResidual` reports how far the twin's own dense grid points sit from the
// analytic surface (should be ~0 by construction) as a twin-fidelity sanity gate.

import { buildRefLocator, type RefMesh, type RefLocator } from './_sharp3dRef';
import { bruteNearestOnRadialSurface, projectPointToRadialSurface, type AnalyticRadiusFn } from './labkit';

const TAU = 2 * Math.PI;

// ───────────────────────── dense radial twin (the ultra-dense triangulated object surface) ─────────────────────────
/**
 * Build an ultra-dense triangulated twin of the single-valued radial surface S(θ,z)=(rA·cosθ, rA·sinθ, z) as a
 * periodic-in-θ structured grid (nTheta × nZ+1), lifted by the analytic rA. This is the "actual object surface" for
 * the analytic-ruler styles (Gyroid/Voronoi/HexHive/Crystalline/…): their meshes place vertices exactly on S, so S
 * IS the object. The twin is a SECOND, INDEPENDENT representation of S (dense triangles + BVH) vs the analytic
 * nearest-point brute — so agreement/disagreement between the two adjudicates the ruler.
 *
 * @param nTheta θ columns (periodic; e.g. 3072). @param nZ z rows (e.g. 3072). Twin tris = 2·nTheta·nZ.
 */
export function buildRadialTwin(rA: AnalyticRadiusFn, H: number, nTheta: number, nZ: number): RefMesh {
  const nRow = nZ + 1;
  const xyz = new Float64Array(nTheta * nRow * 3);
  for (let iz = 0; iz < nRow; iz++) {
    const z = (iz / nZ) * H;
    for (let it = 0; it < nTheta; it++) {
      const th = (it / nTheta) * TAU;
      const r = rA(th, z);
      const o = (iz * nTheta + it) * 3;
      xyz[o] = r * Math.cos(th); xyz[o + 1] = r * Math.sin(th); xyz[o + 2] = z;
    }
  }
  // two tris per quad cell; θ wraps (periodic). idx length = nZ·nTheta·2·3.
  const nF = nZ * nTheta * 2;
  const idx = new Uint32Array(nF * 3);
  let k = 0;
  for (let iz = 0; iz < nZ; iz++) {
    for (let it = 0; it < nTheta; it++) {
      const itn = (it + 1) % nTheta;
      const v00 = iz * nTheta + it, v01 = iz * nTheta + itn;
      const v10 = (iz + 1) * nTheta + it, v11 = (iz + 1) * nTheta + itn;
      idx[k++] = v00; idx[k++] = v10; idx[k++] = v11;
      idx[k++] = v00; idx[k++] = v11; idx[k++] = v01;
    }
  }
  return { xyz, idx, nV: nTheta * nRow, nF };
}

/**
 * Twin-fidelity sanity: sample a grid of points ON the analytic surface at HALF-CELL offsets (the worst-case for a
 * flat-facet twin — the facet centers, farthest from the twin's own vertices) and measure their distance to the twin
 * BVH. A faithful twin reads ~0 (the twin follows S to O(cell²·curvature)). If this is not ≪ tol the twin is too
 * coarse to be the ruler for that style → the caller must densify. This is the direct, style-specific band-limit gate.
 */
export function twinOnSurfaceResidual(
  loc: RefLocator, rA: AnalyticRadiusFn, H: number, nTheta: number, nZ: number,
  zStride = 1,
): { maxMm: number; p99Mm: number; p50Mm: number } {
  const ds: number[] = [];
  for (let iz = 0; iz < nZ; iz += Math.max(1, zStride)) {
    const z = ((iz + 0.5) / nZ) * H;
    for (let it = 0; it < nTheta; it += Math.max(1, Math.floor(nTheta / 400))) {
      const th = ((it + 0.5) / nTheta) * TAU;
      const r = rA(th, z);
      ds.push(loc.dist(r * Math.cos(th), r * Math.sin(th), z));
    }
  }
  ds.sort((a, b) => a - b);
  const pc = (q: number): number => ds.length ? ds[Math.min(ds.length - 1, Math.floor(q * ds.length))] : 0;
  return { maxMm: +(ds.length ? ds[ds.length - 1] : 0).toFixed(6), p99Mm: +pc(0.99).toFixed(6), p50Mm: +pc(0.5).toFixed(6) };
}

// ───────────────────────── facet-interior denseBary lattice ─────────────────────────
export function denseBary(n = 8): Array<[number, number, number]> {
  const B: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) B.push([i / n, j / n, (n - i - j) / n]);
  return B; // 45 pts for n=8 (>=36 pre-registered minimum)
}
const DENSE = denseBary(8);

// ───────────────────────── Q1: worst-facet ratio study (ruler vs BVH-truth) ─────────────────────────
export interface RatioStudyResult {
  style: string;
  nWorst: number;                 // facets studied (worst-N by ruler distance)
  twin: { nTheta: number; nZ: number; tris: number; onSurfMaxMm: number; onSurfP99Mm: number };
  twin2x: { nTheta: number; nZ: number; tris: number };
  // per-facet worst-interior distances under each ruler (max over denseBary of that facet):
  rulerP50: number; rulerP90: number; rulerMax: number;
  bvhP50: number; bvhP90: number; bvhMax: number;
  bvh2xP50: number; bvh2xP90: number; bvh2xMax: number;
  // ratio r = bvh / ruler per facet:
  ratioP10: number; ratioP50: number; ratioP90: number;
  fracRatioBelow03: number;       // fraction of worst facets with r < 0.3 (RULER ARTIFACT signature)
  fracRatioAbove07: number;       // fraction with r > 0.7 (GENUINE signature)
  // density-stability: |bvh2x - bvh| / bvh per facet (the 9th-audit band-limit check):
  densityDeltaP50: number; densityDeltaP90: number; densityDeltaMax: number;
  densityStable: boolean;         // p90 density delta < 0.10 (doubled-twin distances changed <10%)
  bruteXcheckMaxMm: number;       // BVH-vs-analytic-brute cross-check on a subset (should be ~0 on smooth control)
}

/**
 * Q1 worst-facet ratio study: on the top-`nWorst` outlier facets (by the whole-mesh RULER distance), compute for each
 * facet its worst-interior distance under BOTH rulers — the whole-mesh ruler `min(GN, analytic-brute)` and the
 * BVH-truth `loc.dist` to the dense twin — plus the DOUBLED-twin BVH distance for the density-stability gate. Reports
 * the per-facet ratio distribution r=BVH/ruler + the band-limit check. `worstFacets` = the facet indices to study
 * (caller pre-selects the worst-N by ruler distance — this keeps the study a labeled worst-facet diagnostic, NOT a
 * whole-mesh 0-outlier claim).
 */
export function ratioStudy(
  style: string,
  xyz: Float32Array | Float64Array, idx: Uint32Array | Int32Array,
  worstFacets: number[],
  rA: AnalyticRadiusFn, H: number,
  twinRes: { nTheta: number; nZ: number },
  opts: { onProgress?: (done: number, total: number) => void } = {},
): RatioStudyResult {
  // build twin + doubled twin ONCE
  const twinMesh = buildRadialTwin(rA, H, twinRes.nTheta, twinRes.nZ);
  const loc = buildRefLocator(twinMesh, 3.0);
  const onSurf = twinOnSurfaceResidual(loc, rA, H, twinRes.nTheta, twinRes.nZ);
  const twin2Res = { nTheta: twinRes.nTheta * 2, nZ: twinRes.nZ * 2 };
  const twin2Mesh = buildRadialTwin(rA, H, twin2Res.nTheta, twin2Res.nZ);
  const loc2 = buildRefLocator(twin2Mesh, 2.0);

  const rulerD: number[] = [], bvhD: number[] = [], bvh2D: number[] = [];
  const ratios: number[] = [], densDelta: number[] = [];
  const brute = { nTheta: 1024, nZ: 120, zBandMm: 3, refineIters: 60 };
  let xcheckMax = 0, xn = 0;
  const N = worstFacets.length;
  for (let wi = 0; wi < N; wi++) {
    const f = worstFacets[wi];
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    let rMax = 0, bMax = 0, b2Max = 0;
    for (const [wa, wb, wc] of DENSE) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      // whole-mesh ruler distance: min(GN-fallback, analytic full-azimuth brute) — the EXACT scoreWholeMeshInterior foot
      const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 0.02, maxIter: 40 }).dist;
      let rd = gn;
      if (gn > 0.05) rd = Math.min(gn, bruteNearestOnRadialSurface(px, py, pz, rA, H, brute).dist);
      if (rd > rMax) rMax = rd;
      // BVH-truth distance to the dense twin (independent second ruler)
      const bd = loc.dist(px, py, pz); if (bd > bMax) bMax = bd;
      const b2 = loc2.dist(px, py, pz); if (b2 > b2Max) b2Max = b2;
      // adversarial cross-check on a sparse subset: BVH-truth vs analytic brute (must agree on smooth control)
      if (xn < 60 && rd > 0.02) { const ab = bruteNearestOnRadialSurface(px, py, pz, rA, H, { nTheta: 2048, nZ: 400, zBandMm: 3, refineIters: 60 }).dist; xcheckMax = Math.max(xcheckMax, Math.abs(bd - ab)); xn++; }
    }
    rulerD.push(rMax); bvhD.push(bMax); bvh2D.push(b2Max);
    ratios.push(rMax > 1e-9 ? bMax / rMax : 1);
    densDelta.push(bMax > 1e-9 ? Math.abs(b2Max - bMax) / bMax : 0);
    if (opts.onProgress && (wi % 200 === 0 || wi === N - 1)) opts.onProgress(wi + 1, N);
  }
  const pc = (arr: number[], q: number): number => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(6); };
  const mx = (arr: number[]): number => +Math.max(0, ...arr).toFixed(6);
  const fracBelow = (arr: number[], t: number): number => arr.length ? +(arr.filter((v) => v < t).length / arr.length).toFixed(4) : 0;
  const fracAbove = (arr: number[], t: number): number => arr.length ? +(arr.filter((v) => v > t).length / arr.length).toFixed(4) : 0;
  const dP90 = pc(densDelta, 0.9);
  return {
    style, nWorst: N,
    twin: { nTheta: twinRes.nTheta, nZ: twinRes.nZ, tris: twinMesh.nF, onSurfMaxMm: onSurf.maxMm, onSurfP99Mm: onSurf.p99Mm },
    twin2x: { nTheta: twin2Res.nTheta, nZ: twin2Res.nZ, tris: twin2Mesh.nF },
    rulerP50: pc(rulerD, 0.5), rulerP90: pc(rulerD, 0.9), rulerMax: mx(rulerD),
    bvhP50: pc(bvhD, 0.5), bvhP90: pc(bvhD, 0.9), bvhMax: mx(bvhD),
    bvh2xP50: pc(bvh2D, 0.5), bvh2xP90: pc(bvh2D, 0.9), bvh2xMax: mx(bvh2D),
    ratioP10: pc(ratios, 0.1), ratioP50: pc(ratios, 0.5), ratioP90: pc(ratios, 0.9),
    fracRatioBelow03: fracBelow(ratios, 0.3), fracRatioAbove07: fracAbove(ratios, 0.7),
    densityDeltaP50: pc(densDelta, 0.5), densityDeltaP90: dP90, densityDeltaMax: mx(densDelta),
    densityStable: dP90 < 0.10,
    bruteXcheckMaxMm: +xcheckMax.toFixed(6),
  };
}

// ───────────────────────── Q2: scalable whole-mesh BVH ruler ─────────────────────────
export interface BvhRulerResult {
  nFacets: number;
  scannedFacets: number;
  stride: number;
  interiorOutliers: number;       // facets whose worst-interior BVH-truth distance > tol (EVERY scanned facet)
  scaledOutlierEstimate: number;  // interiorOutliers * stride (whole-mesh estimate; exact when stride=1)
  wholeMeshMaxMm: number;
  p50: number; p90: number; p99: number;
  worstFacet: number;
  worstXyz: [number, number, number];
  twinTris: number;
  twinOnSurfMaxMm: number;
}

/**
 * Q2 SCALABLE whole-mesh BVH ruler: score EVERY (or 1-in-stride) facet's worst-interior denseBary distance to the
 * dense radial twin via the BVH. Build the twin + BVH ONCE (amortized over millions of facets); each facet is then
 * ~45 BVH queries (µs each). Cheap facet-plane pre-screen: the facet-centroid BVH distance bounds the sag from below
 * only weakly, so we screen on the max of the 3 vertices + centroid (4 BVH queries); deep-green facets (screen ≤
 * advMargin) skip the full 45-pt lattice. NO top-N cap → honest whole-mesh outlier count. `stride` subsamples for
 * tractability on the largest meshes (interiorOutliers is the EXACT count over the subsample; scaledOutlierEstimate =
 * ×stride). CHECKPOINT the ndjson row per style in the caller.
 */
export function scoreWholeMeshBVH(
  xyz: Float32Array | Float64Array, idx: Uint32Array | Int32Array, rA: AnalyticRadiusFn, H: number,
  twinRes: { nTheta: number; nZ: number },
  opts: {
    tol?: number; stride?: number; onProgress?: (done: number, total: number, nOut: number, worst: number) => void; progressEvery?: number; cell?: number;
    /** Facet shard k of n (parallel processes; each rebuilds its own twin). */
    shard?: { k: number; n: number };
    /** Twin band-limit gate: 'full' (default), 'sub' (z-stride 8, for shards >0), 'skip'. */
    twinValidate?: 'full' | 'sub' | 'skip';
    /** Radial same-azimuth upper-bound prefilter (default true): |hypot(x,y) − rA(atan2,z)| is a strict upper bound on the true distance for z∈[0,H], so a green bound skips ALL BVH queries for the sample. Overstates only sub-margin percentile values (never outlier counts / max). */
    radialPrefilter?: boolean;
  } = {},
): BvhRulerResult {
  const tol = opts.tol ?? 0.01;
  const stride = Math.max(1, Math.floor(opts.stride ?? 1));
  const shardK = opts.shard?.k ?? 0;
  const shardN = Math.max(1, opts.shard?.n ?? 1);
  const usePrefilter = opts.radialPrefilter !== false;
  const twinMesh = buildRadialTwin(rA, H, twinRes.nTheta, twinRes.nZ);
  const loc = buildRefLocator(twinMesh, opts.cell ?? 3.0);
  const tv = opts.twinValidate ?? 'full';
  const onSurf = tv === 'skip'
    ? { maxMm: -1, p99Mm: -1, p50Mm: -1 }
    : twinOnSurfaceResidual(loc, rA, H, twinRes.nTheta, twinRes.nZ, tv === 'sub' ? 8 : 1);
  const nF = idx.length / 3;
  const BARY_FAST: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1 / 3, 1 / 3, 1 / 3]];
  const advMargin = 0.7 * tol;
  // Radial upper bound at a point (strict for z within [0,H]; returns Infinity
  // outside so rim points always fall through to the exact BVH path).
  const radialBound = (px: number, py: number, pz: number): number => {
    if (pz < 0 || pz > H) return Infinity;
    const th = Math.atan2(py, px);
    return Math.abs(Math.hypot(px, py) - rA(th < 0 ? th + TAU : th, pz));
  };
  const devS: number[] = [];
  let worst = 0, worstFacet = -1, scanned = 0;
  const progEvery = opts.progressEvery ?? Math.max(1, Math.floor((nF / (stride * shardN)) / 200));
  for (let f = shardK * stride; f < nF; f += stride * shardN) {
    scanned++;
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
    const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
    // Stage 0 (cheap, no BVH): radial upper bound over the DENSE lattice —
    // if even the bound's max is sub-margin the facet cannot be an outlier.
    if (usePrefilter) {
      let bMax = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        const bd = radialBound(px, py, pz);
        if (bd > bMax) { bMax = bd; if (bMax > advMargin) break; }
      }
      if (bMax <= advMargin) {
        devS.push(bMax);
        if (bMax > worst) { worst = bMax; worstFacet = f; }
        if (opts.onProgress && (scanned % progEvery === 0)) {
          let no = 0; for (const d of devS) if (d > tol) no++;
          opts.onProgress(f + 1, nF, no, worst);
        }
        continue;
      }
    }
    // fast screen: 3 verts + centroid
    let screen = 0;
    for (const [wa, wb, wc] of BARY_FAST) {
      const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
      const d = loc.dist(px, py, pz); if (d > screen) screen = d;
    }
    let dv: number;
    if (screen <= advMargin) { dv = screen; } else {
      dv = 0;
      for (const [wa, wb, wc] of DENSE) {
        const px = wa * ax + wb * bx + wc * cx, py = wa * ay + wb * by + wc * cy, pz = wa * az + wb * bz + wc * cz;
        const d = loc.dist(px, py, pz); if (d > dv) dv = d;
      }
    }
    devS.push(dv);
    if (dv > worst) { worst = dv; worstFacet = f; }
    if (opts.onProgress && (scanned % progEvery === 0 || f + stride >= nF)) {
      let no = 0; for (const d of devS) if (d > tol) no++;
      opts.onProgress(f + 1, nF, no, worst);
    }
  }
  let nOut = 0; for (const d of devS) if (d > tol) nOut++;
  const s = Float64Array.from(devS).sort();
  const pc = (q: number): number => s.length ? +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(6) : 0;
  let wXyz: [number, number, number] = [0, 0, 0];
  if (worstFacet >= 0) {
    const a = idx[3 * worstFacet], b = idx[3 * worstFacet + 1], c = idx[3 * worstFacet + 2];
    wXyz = [(xyz[3 * a] + xyz[3 * b] + xyz[3 * c]) / 3, (xyz[3 * a + 1] + xyz[3 * b + 1] + xyz[3 * c + 1]) / 3, (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3];
  }
  return {
    nFacets: nF, scannedFacets: scanned, stride,
    interiorOutliers: nOut, scaledOutlierEstimate: nOut * stride,
    wholeMeshMaxMm: +worst.toFixed(6), p50: pc(0.5), p90: pc(0.9), p99: pc(0.99),
    worstFacet, worstXyz: wXyz.map((v) => +v.toFixed(3)) as [number, number, number],
    twinTris: twinMesh.nF, twinOnSurfMaxMm: onSurf.maxMm,
  };
}

// ───────────────────────── pick the worst-N facets by the whole-mesh ruler (for the Q1 study) ─────────────────────────
/**
 * Cheap pass: score each facet's CENTROID under the whole-mesh ruler foot min(GN, brute) and return the top-`n`
 * facet indices by that distance. Used ONLY to select the worst-facet study population for `ratioStudy` (labeled a
 * worst-facet diagnostic — NOT a whole-mesh 0-outlier claim). Stride subsamples the selection pass on huge meshes.
 */
export function pickWorstFacetsByRuler(
  xyz: Float32Array | Float64Array, idx: Uint32Array | Int32Array, rA: AnalyticRadiusFn, H: number,
  n: number, opts: { stride?: number; onProgress?: (done: number, total: number) => void } = {},
): number[] {
  const stride = Math.max(1, Math.floor(opts.stride ?? 1));
  const nF = idx.length / 3;
  const brute = { nTheta: 512, nZ: 80, zBandMm: 3, refineIters: 40 };
  const heap: Array<{ f: number; d: number }> = [];
  for (let f = 0; f < nF; f += stride) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const px = (xyz[3 * a] + xyz[3 * b] + xyz[3 * c]) / 3;
    const py = (xyz[3 * a + 1] + xyz[3 * b + 1] + xyz[3 * c + 1]) / 3;
    const pz = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
    const gn = projectPointToRadialSurface(px, py, pz, rA, { coarseTrigger: 0.02, maxIter: 30 }).dist;
    let d = gn;
    if (gn > 0.03) d = Math.min(gn, bruteNearestOnRadialSurface(px, py, pz, rA, H, brute).dist);
    heap.push({ f, d });
    if (opts.onProgress && (f % (stride * 50000) === 0)) opts.onProgress(f, nF);
  }
  heap.sort((x, y) => y.d - x.d);
  return heap.slice(0, n).map((h) => h.f);
}

// load a heatmap-bins mesh (xyz f32, idx u32) from a directory + name.
export function loadBinMesh(xyzPath: string, idxPath: string): { xyz: Float32Array; idx: Uint32Array } {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readFileSync } = require('node:fs') as typeof import('node:fs');
  const xb = readFileSync(xyzPath); const ib = readFileSync(idxPath);
  const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
  const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  return { xyz, idx };
}
