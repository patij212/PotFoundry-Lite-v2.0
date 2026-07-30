// _phase2Loci.ts — PHASE-2 EXCEEDANCE SET + TIGHTENING FIELD. Schema, writer, reader, field. RESEARCH ONLY.
// Nothing in src/ may import this.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS — the D25 result, stated precisely
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2026-07-29, GothicArches ring, PF_CB_RANK=plane (heap), 60x40 init, TRICAP 2.5M, DIRECTED+SNAP:
// the heap DRAINED at 903,506 tris / 1,802,980 allocations. The driver self-reported MAX 7.806 um with
// 0/903,506 triangles over 0.01 mm — a fixed point of ITS OWN criterion. The independent H2 auditor read
// 19.247 um true-3D, with 1,730 of 40,008,064 surface samples over tol (0.0043 %).
//
// The driver has nothing left to do: it converged. The residual 1.92x is exactly the h^1 crease content the
// PLANE ruler structurally cannot see. Three A/Bs (worklog R1 / R1b) proved that replacing the driver's
// in-loop ruler with an honest one allocates WORSE, not better — the plane distance is an improvement-rate
// estimator and the honest quantity is a badness estimator, and refinement needs the first.
//
// So the fix is not a better in-loop ruler. It is the CERTIFICATE TELLING THE DRIVER WHERE TO LOOK:
//
//     mesh  ->  audit (honest, once, at the end)  ->  emit the loci it exceeded at  ->  mesh AGAIN
//               from scratch, with acceptTol locally reduced near those loci.
//
// This file is the artifact in the middle of that arrow, plus the field the driver consumes.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// FOUR PROPERTIES, ALL LOAD-BEARING
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
//  1. IT MAY ONLY TIGHTEN. `tolScale >= 1` is clamped on write, re-clamped on read, and re-clamped again in
//     `scaleForSphere`. A field that could loosen would let an outer iteration UNDO a closure the previous
//     one bought, and the whole loop would stop being monotone in the only direction that matters.
//  2. IT IS A PURE FUNCTION OF THE RECORDED LOCI. No adaptivity, no history, no hidden state, no reference
//     to the previous mesh. Given (style, params, dims, flags, loci file) the mesh is determined. An outer
//     loop whose behaviour depends on HOW it got there is not reproducible, and this campaign has already
//     paid for one irreproducible baseline (project_strata_baselines_not_reproducible, 2026-07-28).
//     Accumulation across iterations therefore lives in the FILE (a later file simply carries a larger
//     `tolScale`), never in the driver.
//  3. PROVENANCE IS PART OF THE PAYLOAD. The file records the style, the exact params, the dims, the tol and
//     the stage, plus the mesh and the audit it came from. `verifyProvenance` returns the list of MISMATCHES
//     so a consumer can REFUSE. Same discipline as _sizingFieldArtifact.ts, for the same reason: a loci set
//     computed on another surface is not "approximately right", it is a different surface.
//  4. THE FIELD IS TESTED AGAINST A BOUNDING SPHERE, NOT A CENTROID. A coarse triangle whose centroid sits
//     outside every locus ball can still COVER one; testing the centroid alone would accept it, never split
//     it, and the tightened region would be unreachable from the initial grid. `scaleForSphere` tightens
//     whenever the triangle's bounding sphere INTERSECTS a locus ball. That over-includes slightly at coarse
//     scales and converges to the true region as triangles shrink — and over-inclusion is safe in exactly
//     one direction, because tightening never loosens.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const PHASE2_LOCI_SCHEMA = 'pf.phase2Loci/1';
export const PHASE2_RUN_SCHEMA = 'pf.phase2Run/1';

export interface Phase2Dims { H: number; Rb: number; Rt: number; expn: number }

/**
 * The mesher run that produced the audited STL. Written by the driver as `<tag>.run.json` beside the STL,
 * copied VERBATIM into the loci file by the auditor, and compared against the consuming run by the driver.
 *
 * It exists so the chain mesh -> audit -> loci -> mesh is CHECKED rather than asserted. Without it the
 * auditor has to be TOLD which style an STL is, by hand, on a command line — and a GothicArches loci set
 * fed to a GeometricStar run would produce a plausible, fully formatted, entirely meaningless mesh.
 */
export interface Phase2RunManifest {
  schema: string;
  style: string;
  params: Record<string, number>;
  dims: Phase2Dims;
  H: number;
  stage: string;
  tolMm: number;
  acceptTolMm: number;
  gridU: number;
  gridV: number;
  triCap: number;
  driver: string;
  rank: string;
  directed: boolean;
  snap: boolean;
  reproj: boolean;
  /** stable single-line key of style+params+dims+tol+stage — the hard equality check. */
  key: string;
  tag: string;
  stl: string;
  nTri: number;
  /** allocations, live triangles, and the four NOT-CONVERGED signals, so the loop can read a verdict. */
  alloc: number;
  unresolvedLeft: number;
  capped: boolean;
  timeCapped: boolean;
  curtainSites: number;
  verdict: string;
  headlineMaxMm: number;
  secs: number;
  /** the tightening field this run CONSUMED, if any. null on iteration 1. */
  tighten: { file: string; key: string; clusters: number; radiusMm: number; maxScale: number } | null;
  generatedAt: string;
}

/**
 * One cluster of exceeding surface samples.
 *
 * (th, z, r) is the recorded surface locus — `r` is the MEASURED radius of the sample, not `rA(th,z)`,
 * because a phase-C witness lies on a tread wall or curtain at a radius strictly between the one-sided
 * limits and reconstructing it from the graph would name a different point.
 * (x, y, z) is the same point in Cartesian mm, which is what the field is queried in.
 */
export interface Phase2Cluster {
  th: number; z: number; r: number;
  x: number; y: number;
  /** exceeding samples that snapped into this cluster */ count: number;
  /** largest measured surface->mesh distance in this cluster, mm */ maxErrMm: number;
  /** acceptTol divisor the driver applies inside this cluster's ball. ALWAYS >= 1. */ tolScale: number;
}

export interface Phase2TightenSpec {
  /** ball radius around each cluster, mm. */ radiusMm: number;
  /** grid pitch the raw loci were snapped to, mm. */ clusterMm: number;
  /** how `tolScale` was chosen. */ mode: 'fixed' | 'slope';
  /** the fixed divisor, when mode === 'fixed'. */ factor: number;
  /** measured error decay per halving of h, when mode === 'slope'. */ slope: number;
  /** ceiling applied to every tolScale. */ maxScale: number;
}

export interface Phase2LociFile {
  schema: string;
  /** the mesher run that produced the audited mesh — copied verbatim from `<tag>.run.json`. */
  run: Phase2RunManifest;
  audit: {
    tool: string;
    stlPath: string;
    nTri: number;
    tolMm: number;
    coveragePitchMm: number;
    minPitchMm: number;
    /** H2 witnessed max on this mesh, mm — the number this loci set is the argument of. */ maxMm: number;
    maxTh: number; maxZ: number; maxR: number; maxOnWall: boolean;
    queries: number;
    /** samples over tol as reported by surfaceToMeshMax. MUST equal `rawCount` below. */ overCount: number;
    /** exceeding samples the recorder actually captured. */ rawCount: number;
    /** true when PF_P2_RAWCAP truncated the recording — the loci set is then INCOMPLETE. */ rawCapped: boolean;
    capped: boolean;
    structPitchUniformMm: number;
    secs: number;
    /** total surface area of the audited mesh, mm^2 — the loop prices tightening against it. */ meshAreaMm2: number;
    generatedAt: string;
  };
  tighten: Phase2TightenSpec;
  clusters: Phase2Cluster[];
  /** §5.4 INFEASIBLE-AT-CAP input, computed by the emitter so the loop reads a number instead of re-deriving one. */
  predict: Phase2Prediction;
  caveats: string[];
}

const TWO_PI = 2 * Math.PI;

/** Stable single-line key. Two runs agree iff this string agrees. */
export function phase2Key(
  style: string, params: Record<string, number>, dims: Phase2Dims, tolMm: number, stage: string,
): string {
  const ps = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join(',');
  return `${style}|${ps}|H=${dims.H},Rb=${dims.Rb},Rt=${dims.Rt},expn=${dims.expn}|tol=${tolMm}|stage=${stage}`;
}

/**
 * Spec §5.3, restated in the lever the driver actually has.
 *
 * The spec writes the feedback in h: `k = ceil(log2(E/tol) / log2(s))` halvings, `h_target = h/2^k`, using
 * the MEASURED decay s in [1.45, 3.2] per halving. But the driver has no h knob — it has `acceptTol`, the
 * threshold on a PLANE-distance witness, and plane distance on a smooth patch is curvature*h^2/8, i.e.
 * `acceptTol ~ h^2`. So k halvings of h is a divisor of 4^k on acceptTol, NOT 2^k.
 *
 * That factor-of-two-in-the-exponent is the whole reason this is stated here rather than inline: reading
 * "one halving" as "acceptTol/2" would under-tighten by a square root and produce an iteration that measures
 * as no-progress for a reason that has nothing to do with the surface.
 */
export function scaleFromSlope(maxErrMm: number, tolMm: number, slope: number, maxScale: number): number {
  if (!(maxErrMm > tolMm) || !(slope > 1)) return 1;
  const k = Math.ceil(Math.log2(maxErrMm / tolMm) / Math.log2(slope));
  return Math.min(maxScale, Math.max(1, 4 ** k));
}

export interface RawExceedance { x: number; y: number; z: number; d: number }

/**
 * Snap raw exceeding samples onto a uniform 3-D grid of pitch `clusterMm` and reduce each occupied cell to
 * one cluster. DETERMINISTIC: the cell index is a pure function of the coordinate, the representative is the
 * cell's own argmax (ties broken by first-seen, and the raw list is produced in a fixed sweep order), and a
 * grid too fine for `maxClusters` is COARSENED BY DOUBLING rather than by dropping loci.
 *
 * Dropping the smallest clusters would be a silent, error-magnitude-dependent filter — precisely the kind of
 * hidden state property 2 forbids. Doubling is a pure function of the input set.
 */
export function clusterExceedances(
  raw: readonly RawExceedance[], clusterMm0: number, maxClusters: number,
): { cells: Map<string, RawExceedance & { count: number }>; clusterMm: number; coarsenings: number } {
  let clusterMm = clusterMm0;
  let coarsenings = 0;
  for (;;) {
    const cells = new Map<string, RawExceedance & { count: number }>();
    for (const p of raw) {
      const key = `${Math.floor(p.x / clusterMm)},${Math.floor(p.y / clusterMm)},${Math.floor(p.z / clusterMm)}`;
      const cur = cells.get(key);
      if (cur === undefined) { cells.set(key, { x: p.x, y: p.y, z: p.z, d: p.d, count: 1 }); continue; }
      cur.count += 1;
      if (p.d > cur.d) { cur.x = p.x; cur.y = p.y; cur.z = p.z; cur.d = p.d; }
    }
    if (cells.size <= maxClusters || coarsenings >= 24) return { cells, clusterMm, coarsenings };
    clusterMm *= 2; coarsenings += 1;
  }
}

// ───────────────────────────── file I/O ─────────────────────────────

export function writeJsonFile(path: string, obj: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(obj, null, 2)}\n`);
}

export function readRunManifest(path: string): Phase2RunManifest {
  const m = JSON.parse(readFileSync(path, 'utf8')) as Phase2RunManifest;
  if (m.schema !== PHASE2_RUN_SCHEMA) throw new Error(`${path}: schema '${m.schema}' != '${PHASE2_RUN_SCHEMA}'`);
  return m;
}

/**
 * Read a loci file, validate its schema, and RE-CLAMP every `tolScale` to >= 1.
 *
 * The clamp is applied on read as well as on write on purpose: a hand-edited or externally generated file
 * must not be able to loosen the driver's accept test. There is no path through this module by which a
 * value below 1 reaches the field.
 */
export function readLociFile(path: string): Phase2LociFile {
  const f = JSON.parse(readFileSync(path, 'utf8')) as Phase2LociFile;
  if (f.schema !== PHASE2_LOCI_SCHEMA) throw new Error(`${path}: schema '${f.schema}' != '${PHASE2_LOCI_SCHEMA}'`);
  if (!Array.isArray(f.clusters)) throw new Error(`${path}: no clusters array`);
  for (const c of f.clusters) if (!(c.tolScale >= 1)) c.tolScale = 1;
  return f;
}

export interface ProvenanceExpectation {
  style: string;
  params: Record<string, number>;
  dims: Phase2Dims;
  tolMm: number;
  stage: string;
}

/**
 * Return the list of MISMATCHES between a loci file and the run about to consume it. Empty means it matches.
 * Returning rather than throwing is deliberate — the caller decides whether to refuse, and gets to print
 * every difference at once instead of the first one.
 */
export function verifyLociProvenance(f: Phase2LociFile, expect: ProvenanceExpectation): string[] {
  const out: string[] = [];
  const want = phase2Key(expect.style, expect.params, expect.dims, expect.tolMm, expect.stage);
  if (f.run.key !== want) {
    out.push(`key: file '${f.run.key}' != run '${want}'`);
    if (f.run.style !== expect.style) out.push(`  style: '${f.run.style}' != '${expect.style}'`);
    if (f.run.stage !== expect.stage) out.push(`  stage: '${f.run.stage}' != '${expect.stage}'`);
    if (f.run.tolMm !== expect.tolMm) out.push(`  tol: ${f.run.tolMm} != ${expect.tolMm}`);
    const d = f.run.dims;
    if (d.H !== expect.dims.H || d.Rb !== expect.dims.Rb || d.Rt !== expect.dims.Rt || d.expn !== expect.dims.expn) {
      out.push(`  dims: ${JSON.stringify(d)} != ${JSON.stringify(expect.dims)}`);
    }
    const keys = new Set([...Object.keys(f.run.params), ...Object.keys(expect.params)]);
    for (const k of [...keys].sort()) {
      if (f.run.params[k] !== expect.params[k]) out.push(`  param ${k}: ${f.run.params[k]} != ${expect.params[k]}`);
    }
  }
  if (f.audit.rawCapped) out.push('audit.rawCapped: the exceedance recording was TRUNCATED — this loci set is incomplete');
  if (f.audit.rawCount !== f.audit.overCount) {
    out.push(`audit: rawCount ${f.audit.rawCount} != surfaceToMeshMax overCount ${f.audit.overCount} — the recorder did not see every query`);
  }
  return out;
}

// ───────────────────────────── the field ─────────────────────────────

export interface TightenField {
  /**
   * The acceptTol DIVISOR for a triangle whose bounding sphere is centre (cx,cy,cz), radius `rad`.
   * ALWAYS >= 1: this function is the last of three clamps and the one the driver actually calls.
   */
  scaleForSphere(cx: number, cy: number, cz: number, rad: number): number;
  readonly clusters: number;
  readonly radiusMm: number;
  readonly maxScale: number;
  /** grid cell of the acceleration hash, mm. */ readonly cellMm: number;
  /** queries that fell back to the linear scan because the sphere was larger than the grid pays for. */
  linearScans(): number;
}

/**
 * Build the O(1) lookup: a field bounding-box reject, then a uniform hash grid at 2x `radiusMm`, plus a
 * LINEAR-SCAN fallback for query spheres so large that the cell ring would cost more than touching every
 * cluster.
 *
 * The fallback is not an optimisation, it is a correctness guard with a cost bound: the initial 60x40 grid
 * carries triangles several mm across, and scanning a +-5 mm ring of 0.5 mm cells is 23^3 = 12k lookups per
 * `consider`. Those triangles are a few thousand and shrink immediately, so bounding the work by
 * `clusters.length` costs nothing and removes the pathological case entirely.
 */
export function buildTightenField(f: Phase2LociFile): TightenField {
  const radiusMm = f.tighten.radiusMm;
  // CELL = 2x THE BALL RADIUS, not 1x. The ring bound is |floor(c/h) - floor(q/h)| <= floor(reach/h) + 1, and
  // `reach` is at least `radiusMm` for even a degenerate query — so h = radiusMm forces span = 2 and 125 cell
  // probes on EVERY call, while h = 2*radiusMm gives span = 1 and 27. The driver calls this once per
  // `consider`, i.e. ~1.8 M times on a D25-scale run, so the constant is worth the one line. It changes no
  // answer: the acceptance test is the exact distance, and `scaleForSphere` is proven equal to brute force
  // over both the grid and the fallback path in _phase2Field.test.ts.
  const cellMm = Math.max(1e-6, 2 * radiusMm);
  const cs = f.clusters;
  const n = cs.length;
  const cx = new Float64Array(n); const cy = new Float64Array(n); const cz = new Float64Array(n);
  const sc = new Float64Array(n);
  let maxScale = 1;
  for (let i = 0; i < n; i += 1) {
    cx[i] = cs[i].x; cy[i] = cs[i].y; cz[i] = cs[i].z;
    sc[i] = Math.max(1, cs[i].tolScale);
    if (sc[i] > maxScale) maxScale = sc[i];
  }
  const grid = new Map<string, number[]>();
  const gi = (v: number): number => Math.floor(v / cellMm);
  for (let i = 0; i < n; i += 1) {
    const k = `${gi(cx[i])},${gi(cy[i])},${gi(cz[i])}`;
    const b = grid.get(k);
    if (b === undefined) grid.set(k, [i]); else b.push(i);
  }
  // Bounding box of the whole field, inflated by the ball radius. On a converged mesh the tightened region is
  // a few per cent of the surface at most (0.08 % in the smoke, ~4 % at D25 scale), so the overwhelming
  // majority of `consider` calls are nowhere near a locus and this rejects them in six comparisons.
  let bxLo = Infinity; let byLo = Infinity; let bzLo = Infinity;
  let bxHi = -Infinity; let byHi = -Infinity; let bzHi = -Infinity;
  for (let i = 0; i < n; i += 1) {
    if (cx[i] < bxLo) bxLo = cx[i]; if (cx[i] > bxHi) bxHi = cx[i];
    if (cy[i] < byLo) byLo = cy[i]; if (cy[i] > byHi) byHi = cy[i];
    if (cz[i] < bzLo) bzLo = cz[i]; if (cz[i] > bzHi) bzHi = cz[i];
  }
  let linear = 0;
  const scaleForSphere = (qx: number, qy: number, qz: number, rad: number): number => {
    if (n === 0) return 1;
    const reach = radiusMm + rad;
    if (qx < bxLo - reach || qx > bxHi + reach || qy < byLo - reach || qy > byHi + reach
      || qz < bzLo - reach || qz > bzHi + reach) return 1;
    const span = Math.floor(reach / cellMm) + 1;
    const side = 2 * span + 1;
    let best = 1;
    const r2 = reach * reach;
    if (side * side * side > n) {
      linear += 1;
      for (let i = 0; i < n; i += 1) {
        if (sc[i] <= best) continue;
        const dx = cx[i] - qx; const dy = cy[i] - qy; const dz = cz[i] - qz;
        if (dx * dx + dy * dy + dz * dz <= r2) best = sc[i];
      }
      return best;
    }
    const bx = gi(qx); const by = gi(qy); const bz = gi(qz);
    for (let ax = -span; ax <= span; ax += 1) {
      for (let ay = -span; ay <= span; ay += 1) {
        for (let az = -span; az <= span; az += 1) {
          const b = grid.get(`${bx + ax},${by + ay},${bz + az}`);
          if (b === undefined) continue;
          for (const i of b) {
            if (sc[i] <= best) continue;
            const dx = cx[i] - qx; const dy = cy[i] - qy; const dz = cz[i] - qz;
            if (dx * dx + dy * dy + dz * dz <= r2) best = sc[i];
          }
        }
      }
    }
    return best;
  };
  return {
    scaleForSphere, clusters: n, radiusMm, maxScale, cellMm, linearScans: () => linear,
  };
}

export interface TightenAreaStats {
  /** area covered by at least one locus ball, mm^2. */ unionAreaMm2: number;
  /** sum over covered cells of cellArea * (localScale - 1) — the EXTRA triangle demand per unit density. */
  weightedExcessAreaMm2: number;
  /** cells the rasteriser marked; the resolution the two areas above are quantised at. */ cells: number;
}

/**
 * Rasterise the tightened region in the surface's own (arc, z) parameter plane at `clusterMm` pitch.
 *
 * WHY A UNION AND NOT A SUM OF DISCS. The residual is CLUSTERED by construction — D25's 1,730 exceeding
 * samples sit in a handful of neighbourhoods — so `nClusters * pi * r^2` over-counts the overlap by an order
 * of magnitude, and an INFEASIBLE-AT-CAP exit priced on it would refuse runs that fit comfortably.
 *
 * WHY THE WEIGHTED FORM IS THE ONE THE PREDICTION USES. Triangle density scales as 1/h^2 and acceptTol ~ h^2,
 * so density scales as the tolScale DIVISOR: a cell tightened 4x wants ~4x the triangles it has. The extra
 * demand is therefore sum(cellArea * (scale - 1)) * currentDensity, not unionArea * (maxScale - 1), which
 * would price every cell at the worst cell's scale.
 *
 * `rNom` converts theta to arc — pass the audited mesh's own maximum radius. Over-stating it over-states the
 * area, hence the demand, hence fires INFEASIBLE early rather than late.
 */
export function tightenedAreaStats(f: Phase2LociFile, rNom: number): TightenAreaStats {
  const p = f.tighten.clusterMm;
  const rad = f.tighten.radiusMm;
  const span = Math.ceil(rad / p);
  const nWrap = Math.max(1, Math.round((TWO_PI * rNom) / p));
  const marked = new Map<string, number>();
  for (const c of f.clusters) {
    const arc = c.th * rNom;
    const a0 = Math.floor(arc / p); const z0 = Math.floor(c.z / p);
    const s = Math.max(1, c.tolScale);
    for (let i = -span; i <= span; i += 1) {
      for (let j = -span; j <= span; j += 1) {
        const ai = a0 + i; const zj = z0 + j;
        const da = (ai + 0.5) * p - arc; const dz = (zj + 0.5) * p - c.z;
        if (da * da + dz * dz > rad * rad) continue;
        // wrap the arc coordinate so a cluster at theta ~ 0 and one at theta ~ 2pi share cells
        const key = `${((ai % nWrap) + nWrap) % nWrap},${zj}`;
        const cur = marked.get(key);
        if (cur === undefined || s > cur) marked.set(key, s);
      }
    }
  }
  let excess = 0;
  for (const [, s] of marked) excess += p * p * (s - 1);
  return { unionAreaMm2: marked.size * p * p, weightedExcessAreaMm2: excess, cells: marked.size };
}

/** @see tightenedAreaStats — kept as the plain union area for callers that only want the footprint. */
export function tightenedAreaMm2(f: Phase2LociFile, rNom: number): number {
  return tightenedAreaStats(f, rNom).unionAreaMm2;
}

export interface Phase2Prediction {
  meshAreaMm2: number;
  nTri: number;
  /** triangles per mm^2 of the AUDITED mesh. */ densityPerMm2: number;
  unionAreaMm2: number;
  weightedExcessAreaMm2: number;
  /** extra triangles the field implies at the audited mesh's local density. */ extraTris: number;
  /** nTri + extraTris. Compare against triCap for the INFEASIBLE-AT-CAP exit. */ predictedTris: number;
  /** honest limits — read them before believing the number. */ caveats: string[];
}

/**
 * Price the field BEFORE spending an iteration on it (spec §5.4's INFEASIBLE-AT-CAP exit).
 *
 * It is an estimate and it says so. The density it extrapolates from is the mesh's GLOBAL average, while the
 * tightened region is by definition where the mesh is already densest, so the true extra is likely LOWER
 * than this — i.e. the exit is conservative in the direction of refusing a run that would have fit. That is
 * the wrong direction to be wrong in, so the exit belongs to the loop's operator to override, and the number
 * is reported next to the cap rather than acted on silently.
 */
export function predictTightenedCount(f: Phase2LociFile, rNom: number, nTri: number, meshAreaMm2: number): Phase2Prediction {
  const st = tightenedAreaStats(f, rNom);
  const density = meshAreaMm2 > 0 ? nTri / meshAreaMm2 : 0;
  const extra = density * st.weightedExcessAreaMm2;
  return {
    meshAreaMm2, nTri, densityPerMm2: density,
    unionAreaMm2: st.unionAreaMm2, weightedExcessAreaMm2: st.weightedExcessAreaMm2,
    extraTris: extra, predictedTris: nTri + extra,
    caveats: [
      'density is the mesh GLOBAL average; the tightened region is already denser than average, so this OVER-states the extra.',
      'it assumes triangle density scales as the tolScale divisor (density ~ 1/h^2, acceptTol ~ h^2) — a smooth-patch identity, not a theorem at a crease.',
      'the driver re-meshes FROM SCRATCH, so the whole mesh may move; this prices the tightening, not the run.',
    ],
  };
}
