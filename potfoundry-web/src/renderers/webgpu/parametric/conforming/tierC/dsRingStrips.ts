// dsRingStrips.ts — CONVERGE-A: UNIFIED STRUCTURED RING-STRIP EMITTER for the DragonScales interior rings.
//
// WHY THIS FILE EXISTS (the two measured findings that define it):
//   S2  (E-2026-07-19-DS-RISER-CLOSE, 008cab1b): the region-kernel constraint RINGS do NOT close the tread — the
//        long full-circumference u-running riser constraints only PARTIALLY recover in the dense near-ring Delaunay
//        (subdivFailNonCollinear ~1094), leaving stretches where the ~1mm C0 step is still chorded (TREAD max 0.266).
//   B   (E-2026-07-19-DS-CONVERGE-B-FLANK, d23b8cbe): the anisotropic (II,I) metric MOVES the near-ring FLANK 3.4x
//        (0.343 -> 0.102) but FLOORS there — the chord guard splits the metric-LONGEST (across-flank) edge while the
//        residual sag is ALONG-flank, so it splits the wrong axis and halts.
//   BOTH verdicts converged on the SAME recommendation: emit ONE STRUCTURED along-ring strip with GUARANTEED
//   CONNECTIVITY (rows-ALONG each ring / columns-ACROSS the ring) instead of free-Delaunay recovery. The across-ring
//   columns give exactly the along-flank resolution B's guard could not; a double-valued tread at t=k/8 gives the C0.
//
// THE MECHANISM (structured cylinder grid — watertight BY CONSTRUCTION, no recovery, no stitch):
//   • ALONG-ring ROWS: nU circumferential columns at u=i/nU (full 2pi), the row at each t-station is one closed ring
//     of nU vertices. When nU is a multiple of 2*scalesPerRow the columns land exactly on the theta-valley u-lattice
//     (u=m/16 on even rows, (m-0.5)/16 on odd) so a mesh column edge lies ON each valley (no facet chords the valley).
//   • ACROSS-ring COLUMNS: the vertical (t-running) edges between consecutive t-stations. Their DENSITY near a ring —
//     graded fine at the tread, coarsening out to the body — is the along-flank resolution (this is B's aniso (II,I)
//     t-sizing composed as the row schedule: fine across the steep flank, sparse in the smooth body).
//   • DOUBLE-VALUED TREAD: at each interior stagger ring t=k/8 (k=1..scaleRows-1) the schedule places a PAIR of rows
//     at t=k/8 -/+ dtHalf (NO row exactly AT the C0 jump). The lower row lifts to r- (row k-1's one-sided limit), the
//     upper to r+ (row k's) — the SAME one-sided-limit weld pattern as src/geometry/doubleValued (studied read-only:
//     doubleValuedMesh.getV lifts a cliff vertex to surface(u -/+ delta,t) into its own region). The quad between the
//     pair IS the near-vertical tread face (r- -> r+ over dz=2*dtHalf*H), EXPLICITLY emitted — never chorded, never
//     recovered. S2's tread-strip deviation analysis: worst ~ (dtHalfMm - rulerWallEps 5e-4) => dtHalf~0.005 => ~0.0045.
//   • The u-seam (column i=nU wraps to column 0) welds BY INDEX — one shared column, watertight cylinder.
//
// REUSES the src/geometry/doubleValued primitives READ-ONLY (createMesh/addVertex/addTriangle/addQuad/toMeshData) and
// the one-sided-limit lift pattern; edits NOTHING there. Pure browser-capable arithmetic (no node:/gmsh/WASM/DOM) so
// it ships exactly like buildMetricMesh. Flag-gated (isDsRingStripsEnabled) + byte-identical off — see index.ts.

import type { AnalyticRadiusFn } from '../../../../../fidelity/analyticSurfaceGate';
import { createMesh, addVertex, addQuad } from '../../../../../geometry/doubleValued/mesh';
import { type DsLattice, DEFAULT_DS_LATTICE } from './dsFeatureEdges';
import type { ConformingOuterWallResult } from '../ConformingOuterWall';

const TAU = 2 * Math.PI;

/** Options for the geometric t-station schedule (the across-ring column layout). All lengths in mm. */
export interface DsTScheduleOpts {
  /** DragonScales lattice (default {@link DEFAULT_DS_LATTICE} = 8/16/0.5) — sets the ring t-stations k/scaleRows. */
  lattice?: DsLattice;
  /**
   * Double-tread half-height (mm): each ring gets a row at t=k/8 -/+ treadHalfMm/H. The tread quad spans dz=2*this.
   * S2: worst tread deviation ~ (treadHalfMm - 5e-4) => 0.005 lands ~0.0045 <= 0.01. Smaller closes tighter but risks
   * a sub-metric sliver band. Default 0.005.
   */
  treadHalfMm?: number;
  /** How far the graded flank rows fan out from each ring (mm). Covers the FLANK band (0.05-1mm) + margin. Default 1.3. */
  flankReachMm?: number;
  /** Max graded flank rows per side of each ring (geometric ladder from the tread outward). Default 20. */
  flankRows?: number;
  /** Geometric ratio of the flank ladder (each step = previous * this). Default 1.5. */
  flankGrade?: number;
  /** Uniform body-row spacing (mm) filling the gaps between adjacent rings' flank reaches. Default 0.5. */
  bodyStepMm?: number;
}

/** Result of {@link buildDsRingStripWall}: an explicit-XYZ structured cylinder mesh + its (u,t) provenance + rims. */
export interface DsRingStripWall {
  /** Flat xyz (3 per vertex). */
  vertices: Float32Array;
  /** Flat triangle vertex indices (3 per face). */
  indices: Uint32Array;
  /** Flat (u,t) per vertex (index-aligned with vertices) — the single-valued provenance (u in [0,1), t in [0,1]). */
  ut: number[];
  /** The sorted t-stations (rows) the grid used — diagnostic. */
  tRows: number[];
  /** Circumferential column count (nU). */
  nU: number;
  /** Ordered t=0 rim vertex indices (ascending u). */
  bottomRing: number[];
  /** Ordered t=1 rim vertex indices (ascending u). */
  topRing: number[];
}

const RING_EPS = 1e-9;

/**
 * Build the sorted, de-duplicated t-station schedule (the across-ring COLUMN layout): a double-tread PAIR straddling
 * every interior stagger ring, a geometric flank ladder fanning out from each ring, and uniform body rows filling the
 * remaining gaps. t=0 and t=1 are always present (the pot rims). No row is ever placed AT a ring t=k/scaleRows (the C0
 * jump is bracketed, never sampled).
 */
export function buildDsRingTSchedule(H: number, opts: DsTScheduleOpts = {}): number[] {
  const lat = opts.lattice ?? DEFAULT_DS_LATTICE;
  const scaleRows = lat.scaleRows;
  const dtHalf = (opts.treadHalfMm ?? 0.005) / H;
  const reach = (opts.flankReachMm ?? 1.3) / H;
  const flankRows = Math.max(1, Math.floor(opts.flankRows ?? 20));
  const grade = Math.max(1.05, opts.flankGrade ?? 1.5);
  const bodyStepT = Math.max(1e-6, (opts.bodyStepMm ?? 0.5) / H);

  const raw: number[] = [0, 1];
  for (let k = 1; k < scaleRows; k++) {
    const tk = k / scaleRows;
    // tread pair + geometric flank ladder outward on both sides.
    let d = dtHalf;
    let step = dtHalf;
    raw.push(tk - d, tk + d);
    for (let j = 0; j < flankRows; j++) {
      step *= grade;
      d += step;
      if (d > reach) break;
      raw.push(tk - d, tk + d);
    }
  }
  // sort + dedup within a tight epsilon (the tread pair 2*dtHalf apart survives; float dups collapse).
  raw.sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const t of raw) {
    const tc = t < 0 ? 0 : t > 1 ? 1 : t;
    if (uniq.length === 0 || tc - uniq[uniq.length - 1] > RING_EPS) uniq.push(tc);
  }
  // fill body gaps that exceed the body step (uniform rows keep the smooth-body chord bounded).
  const out: number[] = [];
  for (let i = 0; i < uniq.length; i++) {
    out.push(uniq[i]);
    if (i + 1 >= uniq.length) break;
    const a = uniq[i];
    const b = uniq[i + 1];
    const gap = b - a;
    if (gap > bodyStepT * 1.5) {
      const n = Math.ceil(gap / bodyStepT);
      for (let m = 1; m < n; m++) out.push(a + (gap * m) / n);
    }
  }
  return out;
}

/**
 * Emit the structured DragonScales outer wall: a watertight cylinder grid of `nU` circumferential columns x `tRows`
 * t-stations, lifted through `rA`. The u-seam welds by index (column nU == column 0). Every quad is the surface strip
 * between four grid nodes; the double-tread pair in `tRows` makes the near-vertical tread face an EXPLICIT quad.
 *
 * @param rA     exact analytic radius r(theta, z) for DragonScales (defaults merged by the caller).
 * @param H      wall height (mm).
 * @param nU     circumferential columns (>= 3). Multiple of 2*scalesPerRow => columns land on the theta-valley lattice.
 * @param tRows  sorted t-stations (from {@link buildDsRingTSchedule} or a metric-driven schedule) — the row layout.
 */
export function buildDsRingStripWall(
  rA: AnalyticRadiusFn,
  H: number,
  nU: number,
  tRows: number[],
): DsRingStripWall {
  const cols = Math.max(3, Math.floor(nU));
  const rows = tRows.length;
  const mesh = createMesh();
  const ut: number[] = [];
  // grid[j*cols + i] = vertex index of (row j, column i). Column `cols` is the periodic image of column 0 (u=1==u=0),
  // NOT stored — the wrap in the quad loop uses column 0 directly, so the seam is one shared index column.
  const grid = new Int32Array(rows * cols);
  for (let j = 0; j < rows; j++) {
    const t = tRows[j];
    const z = t * H;
    for (let i = 0; i < cols; i++) {
      const u = i / cols;
      const th = TAU * u;
      const r = rA(th, z);
      const id = addVertex(mesh, r * Math.cos(th), r * Math.sin(th), z);
      grid[j * cols + i] = id;
      ut.push(u, t);
    }
  }
  // Structured quads: for each cell (row j..j+1, column i..i+1 with i+1 wrapping to 0) emit one quad (two triangles).
  // addQuad(a,b,c,d) => (a,b,c)+(a,c,d). Order a=（j,i) b=(j,i+1) c=(j+1,i+1) d=(j+1,i) gives outward-consistent winding
  // for an increasing-t, increasing-u (CCW-from-outside) cylinder; winding is irrelevant to the by-index manifold audit.
  for (let j = 0; j + 1 < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const iN = i + 1 === cols ? 0 : i + 1;
      const a = grid[j * cols + i];
      const b = grid[j * cols + iN];
      const c = grid[(j + 1) * cols + iN];
      const d = grid[(j + 1) * cols + i];
      addQuad(mesh, a, b, c, d);
    }
  }
  const bottomRing: number[] = [];
  const topRing: number[] = [];
  for (let i = 0; i < cols; i++) {
    bottomRing.push(grid[i]);
    topRing.push(grid[(rows - 1) * cols + i]);
  }
  return {
    vertices: new Float32Array(mesh.positions),
    indices: new Uint32Array(mesh.triangles),
    ut,
    tRows,
    nU: cols,
    bottomRing,
    topRing,
  };
}

/** Convenience: build the geometric schedule and emit the wall in one call (the wiring entry). */
export function buildDsRingStripWallGeometric(
  rA: AnalyticRadiusFn,
  H: number,
  nU: number,
  scheduleOpts: DsTScheduleOpts = {},
): DsRingStripWall {
  return buildDsRingStripWall(rA, H, nU, buildDsRingTSchedule(H, scheduleOpts));
}

/**
 * Pack a {@link DsRingStripWall} into the {@link ConformingOuterWallResult} contract the region dispatch +
 * WatertightAssembly consume. The result stores (u,t,0) vertices (the DOWNSTREAM single-valued lift reproduces the
 * strip xyz exactly — the emitter's t-schedule brackets every C0 jump so no vertex is at a discontinuity), the
 * structured index buffer, per-face seam flags by u-span (the seam is already welded by index, so seam-adjacent
 * triangles wrap u=(nU-1)/nU -> 0), and the t=0/t=1 rims. gridVertexCount = the vertex count.
 *
 * NOTE: this wall is already a periodic cylinder (u-seam welded by index) with EMERGENT rim counts (nU). Assembly
 * adoption via `assembleWatertight` (which pairs index-for-index against a `nRing` inner wall) needs the rims
 * reconciled to that `nRing` — a documented follow-up. The flag is default-off, and the CONVERGE-A measurement scores
 * the strip mesh DIRECTLY (xyz+indices), so this packing only has to be a valid, watertight ConformingOuterWallResult.
 */
export function dsRingStripWallToOuterWall(wall: DsRingStripWall): ConformingOuterWallResult {
  const nV = wall.ut.length / 2;
  const vertices = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    vertices[3 * i] = wall.ut[2 * i];
    vertices[3 * i + 1] = wall.ut[2 * i + 1];
    vertices[3 * i + 2] = 0;
  }
  const nF = wall.indices.length / 3;
  const seamTriangles = new Uint8Array(nF);
  for (let f = 0; f < nF; f++) {
    const ua = vertices[3 * wall.indices[3 * f]];
    const ub = vertices[3 * wall.indices[3 * f + 1]];
    const uc = vertices[3 * wall.indices[3 * f + 2]];
    if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) seamTriangles[f] = 1;
  }
  return {
    vertices,
    indices: wall.indices,
    seamTriangles,
    gridVertexCount: nV,
    bottomRing: wall.bottomRing,
    topRing: wall.topRing,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// BAMBOO-SEGMENTS SCHEDULE (E-2026-07-22-BAMBOO-SCHED — the first LAYERED-class production closure).
//
// BambooSegments (post the rim-floor() fix in rOuterBambooSegments / bamboo_segments_radius) is a SMOOTH body — the
// node rings are Gaussian bulges exp(-d²/2w²), the taper is quadratic, the striations are sin(θ·k) — with a genuine
// C0 asymVar STEP at each INTERIOR segment boundary t=k/nodeCount (k=1..nodeCount-1) whenever bsAsymmetry≠0 (the judge
// bambooSegmentsLayeredOuterWallTarget.ts emits a "radial curtain" at each such boundary). So the same CONVERGE-A
// structured ring-strip machinery that closes DragonScales applies: nodeCount takes DragonScales' scaleRows role, and
// the double-valued tread pair at each t=k/nodeCount brackets the asymVar step by construction (never chords it). The
// difference from the DS ring schedule is the BODY fill: DS uses uniform body rows, Bamboo grades them by a SAG LAW on
// the (θ-independent) node-bulge curvature so the smooth flank is chorded ≤tol where its 2nd difference demands. The
// rim (t=1) is now smooth (last real segment extends to it) ⇒ NO rim bracket, unlike the pre-fix probe.
//
// Reuses buildDsRingTSchedule (tread pairs, body fill suppressed) + buildDsRingStripWall (the shared emitter) +
// dsRingStripWallToOuterWall (the shared packing) unchanged. Flag-gated (isBambooEnabled / __pfBamboo) + byte-identical
// off — see index.ts (buildBambooDispatchWall has no default caller). Pure browser-capable arithmetic.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Options for the BambooSegments t-station schedule (the across-ring column layout). All lengths in mm. */
export interface BambooTScheduleOpts {
  /**
   * Segment count (registry bsNodeCount, default 5). Interior asymVar C0 boundaries sit at t=k/nodeCount for
   * k=1..nodeCount-1; the schedule brackets each with a tread pair. Must match the analytic surface's node count.
   */
  nodeCount?: number;
  /**
   * Double-valued tread half-height (mm): each interior boundary gets a row at t=k/nodeCount ∓ treadHalfMm/H, so the
   * asymVar step is an EXPLICIT near-vertical strip (dz=2·this), never a chord. Default 0.002 (the closing config).
   */
  treadHalfMm?: number;
  /**
   * Sag-law body chord tolerance (mm): body rows are placed where the Gaussian node-bulge 2nd difference demands a
   * chord ≤ this. The residual after close is u-chord ∝ 1/nU, so a tighter body tol mostly adds rows without moving the
   * whole-mesh MAX; 0.004 is the closing value.
   */
  sagTolMm?: number;
  /** Sag-law body row spacing clamp (mm). Defaults min 0.01 / max 0.12. */
  sagHMinMm?: number;
  sagHMaxMm?: number;
  /** Flank-ladder reach (mm) fanning from each interior ring, forwarded to {@link buildDsRingTSchedule}. Default 2.0. */
  flankReachMm?: number;
  /**
   * Flank-ladder max rows per side of each ring, forwarded to {@link buildDsRingTSchedule}. Default 0 (sliver-Pareto):
   * the sag-law body already grades the smooth flank, so the DS geometric ladder is redundant here and its fine
   * near-tread rows are the sliver source. The tread pair itself is always kept.
   */
  flankRows?: number;
  /** Flank-ladder geometric ratio, forwarded to {@link buildDsRingTSchedule}. Default 1.5. */
  flankGrade?: number;
}

/** Central-difference step (mm) for the sag-law r''(z). */
const BAMBOO_FD_STEP_MM = 0.02;

/**
 * Build the BambooSegments t-station schedule: a double-valued tread PAIR straddling every interior segment boundary
 * t=k/nodeCount (k=1..nodeCount-1) via the DS ring machinery ({@link buildDsRingTSchedule} with scaleRows=nodeCount and
 * the uniform body fill suppressed), plus SAG-LAW body rows graded by the node-bulge curvature. t=0 and t=1 are always
 * present (the pot rims). No row is ever placed AT a boundary (the C0 jump is bracketed, never sampled), and — after
 * the rim-floor() fix — the rim itself needs no bracket.
 */
export function buildBambooTSchedule(
  H: number,
  rA: AnalyticRadiusFn,
  opts: BambooTScheduleOpts = {},
): number[] {
  const nodeCount = Math.max(1, Math.floor(opts.nodeCount ?? 5));
  const tol = opts.sagTolMm ?? 0.004;
  const hMin = (opts.sagHMinMm ?? 0.01) / H;
  const hMax = (opts.sagHMaxMm ?? 0.12) / H;
  // (a) interior segment-boundary tread PAIRS: the DS ring machinery with scaleRows=nodeCount places a pair at t=k/
  //     nodeCount for k=1..nodeCount-1 (its loop is k<scaleRows ⇒ NO pair at t=1). Body fill suppressed (bodyStepMm
  //     huge) so the sag-law walk below is the sole body source (else a redundant ~2× double-fill for no fidelity gain).
  const base = new Set<number>(buildDsRingTSchedule(H, {
    lattice: { ...DEFAULT_DS_LATTICE, scaleRows: nodeCount },
    treadHalfMm: opts.treadHalfMm ?? 0.002,
    bodyStepMm: 1e9,
    flankReachMm: opts.flankReachMm ?? 2.0,
    flankRows: opts.flankRows ?? 0,
    flankGrade: opts.flankGrade ?? 1.5,
  }));
  base.add(0);
  base.add(1);
  // (b) SAG-LAW body rows on the θ=0 profile (the Gaussian node-bulge curvature is θ-independent; asymVar/striation are
  //     piecewise-flat/small in z). Walk z, place the next row at Δt = sqrt(8·tol/|r''(z)|)/H clamped to [hMin,hMax].
  const rProfile = (z: number): number => rA(0, Math.max(0, Math.min(H, z)));
  const secondDiff = (z: number): number =>
    Math.abs((rProfile(z + BAMBOO_FD_STEP_MM) - 2 * rProfile(z) + rProfile(z - BAMBOO_FD_STEP_MM)) / (BAMBOO_FD_STEP_MM * BAMBOO_FD_STEP_MM));
  let t = 0;
  while (t < 1) {
    const k = secondDiff(t * H);
    let stepT = k > 1e-9 ? Math.sqrt((8 * tol) / k) / H : hMax;
    stepT = Math.max(hMin, Math.min(hMax, stepT));
    t += stepT;
    if (t < 1) base.add(t);
  }
  // sort + dedup within a tight epsilon (the tread pair 2·treadHalf apart survives; float dups collapse).
  const rows = [...base].filter((x) => x >= 0 && x <= 1).sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const r of rows) if (uniq.length === 0 || r - uniq[uniq.length - 1] > RING_EPS) uniq.push(r);
  return uniq;
}

/** Convenience: build the Bamboo schedule and emit the ring-strip wall in one call (the wiring entry). */
export function buildBambooRingStripWallGeometric(
  rA: AnalyticRadiusFn,
  H: number,
  nU: number,
  opts: BambooTScheduleOpts = {},
): DsRingStripWall {
  return buildDsRingStripWall(rA, H, nU, buildBambooTSchedule(H, rA, opts));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// SCALE-TIP CONE-FAN (E-2026-07-21-DS-CONEFAN-PROD — the tournament winner, whole-body ≤0.01 proven).
//
// The DragonScales scale TIP is a genuine C1 CONE APEX (rOuterDragonScales scaleShape ≈ 1.5·√(xDist²+yDist²) near the
// apex ⇒ |grad| constant in every radial direction). It defeated BOTH the uniform grid AND the curvature-adaptive
// region kernel at ~0.04mm (E-DS-BODY-CLOSE / E-DS-HYBRID: the "double wall"). A frontier tournament
// (E-DS-TIPCONE-TOURNAMENT) found the ONLY converging mechanism: an EXPLICIT graded polar cone-fan at each apex. Round
// 4 (E-DS-CONEFAN-PROD) proved the fan welds BY INDEX into the FAST strip grid (nonMan 0, ~160× faster than the region
// kernel) and hits whole-body ≤0.01 (fwd 0.0072 / rev 0.0024, 0 outliers @ 9.76M tris in 2.6s).
//
// Flag-gated (isDsConeFanEnabled / __pfDsConeFan) + byte-identical off: the ring-only path (buildDsRingStripWall) is
// UNCHANGED; these are additive functions with no default caller.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Options for the crest-anchored cone-fan schedule + the per-apex fan. All lengths mm. */
export interface DsConeFanOpts {
  /** DragonScales lattice (default 8/16/0.5). */
  lattice?: DsLattice;
  /**
   * Uniform body-row spacing (mm). Default 0.10 — the sliver-Pareto value (E-2026-07-22-DS-SLIVER): near the nU=4096
   * u-column arc (~0.069mm) so body quads are near-isotropic. Coarser (≥0.16) EXPLODES slivers; 0.10 lands the grid at
   * the ~3% intrinsic tread floor while IMPROVING whole-body fidelity (fwd 0.005 vs 0.0072 at the old 0.12).
   */
  bodyStepMm?: number;
  /**
   * Rows per side of the geometric ladder fanning out from each crest cusp. Default 0 (E-2026-07-22-DS-SLIVER): the
   * per-apex fan already resolves the tip cone, so the ladder only ADDED thin-row slivers + anisotropic fan blocks and
   * (measured) WORSENED fidelity. The crest ROW itself is always kept (the fan apex must be exact) — this is only the
   * fine ladder around it.
   */
  crestLadderRows?: number;
  /** Fan block half-extent in grid CELLS (the (2p+1)² block retriangulated as a fan; default 3). */
  patchP?: number;
  /** Fan ring fractions apex→boundary (geometric-graded, fine near apex; default the whole-body-close ladder). */
  fanFrac?: number[];
  /** Tread double-pair half-height (mm), forwarded to the ring schedule (default 0.005 — the near-vertical C0 riser). */
  treadHalfMm?: number;
  /** Flank-ladder reach (mm) fanning from each ring, forwarded to the ring schedule (default 1.3). */
  flankReachMm?: number;
  /** Flank-ladder max rows per side of each ring, forwarded to the ring schedule (default 20). */
  flankRows?: number;
  /** Flank-ladder geometric ratio, forwarded to the ring schedule. Default 2.5 (E-2026-07-22-DS-SLIVER): steeper than
   *  the ring-strip's 1.5 so the ladder skips the fine near-tread sliver rows (fidelity unchanged — worst facet is elsewhere). */
  flankGrade?: number;
}

const DEFAULT_CONE_FAN_FRAC = [0.05, 0.12, 0.25, 0.45, 0.7];

/**
 * Crest-anchored t-schedule for the cone-fan wall: the ring machinery (tread pairs + flank ladders, {@link
 * buildDsRingTSchedule} with the body fill suppressed) + a row EXACTLY on each scale-center crest t=(k+0.5)/scaleRows
 * + a symmetric geometric ladder fanning out from each crest + a uniform body fill. A grid vertex lands on every crest
 * (so the fan apex is exact); the t-cusp ridgeline is captured; the flanks/rings keep their CONVERGE-A structure.
 */
export function buildDsConeFanTSchedule(H: number, opts: DsConeFanOpts = {}): number[] {
  const lat = opts.lattice ?? DEFAULT_DS_LATTICE;
  const scaleRows = lat.scaleRows;
  // DEFAULTS = the E-2026-07-22-DS-SLIVER safe-Pareto config (14.3% → 3.3% <20°, min 1.4° → 2.4°, fwd fidelity 0.0072 →
  // 0.005, watertight preserved): body 0.10 (near-isotropic quads), NO crest ladder (the fan resolves the tip cone),
  // flank grade 2.5 (skip the fine near-tread sliver rows). The ~3% residual is the intrinsic tread-riser floor.
  const bodyStepT = Math.max(1e-6, (opts.bodyStepMm ?? 0.10) / H);
  const ladderRows = Math.max(0, Math.floor(opts.crestLadderRows ?? 0));
  // ring machinery only (huge bodyStepMm ⇒ buildDsRingTSchedule adds no uniform body rows). The tread/flank-ladder
  // knobs forward to the ring schedule so the cone-fan can regrade them (sliver Pareto) without a separate schedule.
  const set = new Set<number>(buildDsRingTSchedule(H, {
    lattice: lat,
    bodyStepMm: 1e9,
    flankGrade: opts.flankGrade ?? 2.5,
    ...(opts.treadHalfMm !== undefined ? { treadHalfMm: opts.treadHalfMm } : {}),
    ...(opts.flankReachMm !== undefined ? { flankReachMm: opts.flankReachMm } : {}),
    ...(opts.flankRows !== undefined ? { flankRows: opts.flankRows } : {}),
  }));
  for (let k = 0; k < scaleRows; k++) {
    const tc = (k + 0.5) / scaleRows;
    set.add(tc);
    let d = 0.02 / H;
    let step = 0.02 / H;
    for (let j = 0; j < ladderRows; j++) {
      const a = tc - d;
      const b = tc + d;
      if (a > 0) set.add(a);
      if (b < 1) set.add(b);
      step *= 1.4;
      d += step;
      if (d > 1.3 / H) break;
    }
  }
  const rows = [...set].sort((a, b) => a - b);
  const out: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    out.push(rows[i]);
    if (i + 1 >= rows.length) break;
    const gap = rows[i + 1] - rows[i];
    if (gap > bodyStepT * 1.5) {
      const n = Math.ceil(gap / bodyStepT);
      for (let m = 1; m < n; m++) out.push(rows[i] + (gap * m) / n);
    }
  }
  const uniq: number[] = [];
  for (const t of out) if (uniq.length === 0 || t - uniq[uniq.length - 1] > RING_EPS) uniq.push(t);
  return uniq;
}

/** The scale-tip (u,t) apexes: even rows u=(m+0.5)/scalesPerRow, odd rows u=m/scalesPerRow, at t=(k+0.5)/scaleRows. */
function scaleTipUts(lat: DsLattice): Array<{ u: number; t: number }> {
  const tips: Array<{ u: number; t: number }> = [];
  for (let k = 0; k < lat.scaleRows; k++) {
    const t = (k + 0.5) / lat.scaleRows;
    for (let m = 0; m < lat.scalesPerRow; m++) {
      let u = (k % 2 === 0 ? m + 0.5 : m) / lat.scalesPerRow;
      u -= Math.floor(u);
      tips.push({ u, t });
    }
  }
  return tips;
}

/**
 * Emit the DragonScales outer wall with a per-apex SCALE-TIP CONE-FAN: the structured cylinder grid (nU cols × tRows)
 * where the (2p+1)² grid block around each of the scaleRows·scalesPerRow apexes is retriangulated as a graded polar
 * fan (apex + `fanFrac` rings spoked to the block's 8p perimeter vertices). The perimeter vertices are EXISTING grid
 * vertices ⇒ the fan welds to the untouched outer grid by index (each perimeter edge shared by the fan + one outer
 * cell ⇒ manifold BY CONSTRUCTION). Cells interior to a block are removed (replaced by the fan). Apex blocks that
 * would exceed the t-range or overlap an already-placed block are skipped (the returned `skippedApexes`).
 *
 * @param rA     exact analytic radius r(theta,z) for DragonScales.
 * @param H      wall height (mm).
 * @param nU     circumferential columns (>=3; a multiple of 2·scalesPerRow lands columns on the tip u-lattice).
 * @param tRows  sorted t-stations (from {@link buildDsConeFanTSchedule}; a row must sit on each crest for an exact apex).
 */
export function buildDsConeFanWall(
  rA: AnalyticRadiusFn,
  H: number,
  nU: number,
  tRows: number[],
  opts: DsConeFanOpts = {},
): DsRingStripWall & { fanTriangles: number; apexCount: number; skippedApexes: number } {
  const lat = opts.lattice ?? DEFAULT_DS_LATTICE;
  const p = Math.max(1, Math.floor(opts.patchP ?? 3));
  const fanFrac = opts.fanFrac && opts.fanFrac.length > 0 ? opts.fanFrac : DEFAULT_CONE_FAN_FRAC;
  const cols = Math.max(3, Math.floor(nU));
  const rows = tRows.length;
  const positions: number[] = [];
  const ut: number[] = [];
  const addV = (u: number, t: number): number => {
    const th = TAU * u;
    const z = t * H;
    const r = rA(th, z);
    const id = positions.length / 3;
    positions.push(r * Math.cos(th), r * Math.sin(th), z);
    ut.push(u, t);
    return id;
  };
  const grid = new Int32Array(rows * cols);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) grid[j * cols + i] = addV(i / cols, tRows[j]);

  const wrapCol = (i: number): number => ((i % cols) + cols) % cols;
  const rowOfT = (t: number): number => {
    let br = 0;
    let bd = Infinity;
    for (let j = 0; j < rows; j++) { const d = Math.abs(tRows[j] - t); if (d < bd) { bd = d; br = j; } }
    return br;
  };
  const removed = new Uint8Array((rows - 1) * cols);
  const keep: Array<{ r: number; c: number }> = [];
  let skipped = 0;
  for (const tip of scaleTipUts(lat)) {
    const r = rowOfT(tip.t);
    const c = Math.round(tip.u * cols) % cols;
    // range guard FIRST ⇒ r+dj ∈ [r-p, r+p-1] ⊆ [0, rows-2] is always a valid `removed` index (matches the proven
    // probe's cellKey = j*cols + wrapCol(i); wraps the periodic COLUMN only, never the row).
    if (r - p < 0 || r + p > rows - 1) { skipped++; continue; }
    let clash = false;
    for (let dj = -p; dj < p && !clash; dj++) for (let di = -p; di < p; di++) if (removed[(r + dj) * cols + wrapCol(c + di)]) { clash = true; break; }
    if (clash) { skipped++; continue; }
    for (let dj = -p; dj < p; dj++) for (let di = -p; di < p; di++) removed[(r + dj) * cols + wrapCol(c + di)] = 1;
    keep.push({ r, c });
  }

  const triangles: number[] = [];
  for (let j = 0; j + 1 < rows; j++) for (let i = 0; i < cols; i++) {
    if (removed[j * cols + i]) continue;
    const iN = i + 1 === cols ? 0 : i + 1;
    const a = grid[j * cols + i], b = grid[j * cols + iN], c = grid[(j + 1) * cols + iN], d = grid[(j + 1) * cols + i];
    triangles.push(a, b, c, a, c, d);
  }
  let fanTriangles = 0;
  const G = fanFrac.length;
  for (const ap of keep) {
    const apexV = grid[ap.r * cols + ap.c];
    const rTop = ap.r - p, rBot = ap.r + p, cL = ap.c - p, cR = ap.c + p;
    const loop: number[] = [];
    for (let i = cL; i <= cR; i++) loop.push(grid[rTop * cols + wrapCol(i)]);
    for (let j = rTop + 1; j <= rBot; j++) loop.push(grid[j * cols + wrapCol(cR)]);
    for (let i = cR - 1; i >= cL; i--) loop.push(grid[rBot * cols + wrapCol(i)]);
    for (let j = rBot - 1; j >= rTop + 1; j--) loop.push(grid[j * cols + wrapCol(cL)]);
    const B = loop.length;
    const au = ut[2 * apexV];
    const at = ut[2 * apexV + 1];
    const spoke: number[][] = [];
    for (let k = 0; k < B; k++) {
      let bu = ut[2 * loop[k]];
      const bt = ut[2 * loop[k] + 1];
      if (bu - au > 0.5) bu -= 1; else if (au - bu > 0.5) bu += 1;
      const colV: number[] = [];
      for (let g = 0; g < G; g++) {
        const f = fanFrac[g];
        let u = au + f * (bu - au);
        u -= Math.floor(u);
        colV.push(addV(u, at + f * (bt - at)));
      }
      spoke.push(colV);
    }
    // WINDING: every fan triangle is emitted CCW in (u,t) (= outward normal on this increasing-u/increasing-t
    // cylinder), matching the grid quads above BY CONSTRUCTION — not left for the assembly's orientOutward to repair.
    // The apex ring (apexV, spoke[k][0], spoke[kn][0]) and the outer band below are already CCW because the block loop
    // winds CCW around the interior apex; only the interior RING BANDS needed their order fixed (they wound CW —
    // area2 = -f_g·(f_{g+1}-f_g)·(d_k×d_kn) < 0 — a latent inconsistency previously masked downstream).
    for (let k = 0; k < B; k++) { const kn = (k + 1) % B; triangles.push(apexV, spoke[k][0], spoke[kn][0]); fanTriangles++; }
    for (let g = 0; g + 1 < G; g++) for (let k = 0; k < B; k++) {
      const kn = (k + 1) % B;
      // quad (spoke[k][g], spoke[kn][g], spoke[kn][g+1], spoke[k][g+1]) split on the spoke[k][g]→spoke[kn][g+1]
      // diagonal, both triangles wound CCW (reversed from the earlier CW emission; same three vertices each).
      triangles.push(spoke[k][g], spoke[kn][g + 1], spoke[kn][g], spoke[k][g], spoke[k][g + 1], spoke[kn][g + 1]);
      fanTriangles += 2;
    }
    for (let k = 0; k < B; k++) {
      const kn = (k + 1) % B;
      triangles.push(spoke[k][G - 1], loop[k], loop[kn], spoke[k][G - 1], loop[kn], spoke[kn][G - 1]);
      fanTriangles += 2;
    }
  }
  const bottomRing: number[] = [];
  const topRing: number[] = [];
  for (let i = 0; i < cols; i++) { bottomRing.push(grid[i]); topRing.push(grid[(rows - 1) * cols + i]); }
  return {
    vertices: new Float32Array(positions),
    indices: new Uint32Array(triangles),
    ut,
    tRows,
    nU: cols,
    bottomRing,
    topRing,
    fanTriangles,
    apexCount: keep.length,
    skippedApexes: skipped,
  };
}

/** Convenience: build the crest-anchored schedule and emit the cone-fan wall in one call (the wiring entry). */
export function buildDsConeFanWallGeometric(
  rA: AnalyticRadiusFn,
  H: number,
  nU: number,
  opts: DsConeFanOpts = {},
): DsRingStripWall & { fanTriangles: number; apexCount: number; skippedApexes: number } {
  return buildDsConeFanWall(rA, H, nU, buildDsConeFanTSchedule(H, opts), opts);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// S3 — CUT-AT-GAP CERT DOMAIN (E-2026-07-21-DS-SEAM path B, simplified). Present the PERIODIC production cone-fan's
// (u,t) domain as a judge-clean FLAT partition of [0,1]² for `verifyExactDyadicRectanglePartition` (Track A, READ-ONLY).
//
// The production cone-fan is a periodic cylinder with a scale-tip apex EXACTLY on u=0 (odd rows). Cutting the flat
// rectangle at u=0 makes that apex STRADDLE the seam (the scope's path-B part (c) seam-apex split). CUT-AT-GAP avoids
// it entirely: relabel the domain u-origin so the flat seam falls on an apex-GAP column q>p (the midpoint between two
// apex columns). Then the u=0 apex maps to an INTERIOR, contiguous u_judge and NO fan straddles the seam — only the
// single grid quad column at q crosses it, closed by an explicit u=1 lattice copy of column q (welded by 3D position
// downstream). This certifies the EXACT production mesh: the 3D positions are UNCHANGED (same θ sampling); the seam
// copies are coincident duplicates that weld away ⇒ DS-COMPOSE's whole-mesh 0.005 does not regress. Winding is already
// outward-CCW by part (a). Additive: no production caller ⇒ flag-off byte-identical by construction.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The judge-clean flat (u,t) DOMAIN of the cone-fan (cut at an apex-gap column) + its 3D positions. */
export interface DsConeFanCertDomain {
  /** u_judge ∈ [0,1] per vertex — the flat-rectangle domain U (the u=1 seam copies carry exactly 1). Index-aligned. */
  uJudge: Float64Array;
  /** t ∈ [0,1] per vertex — the domain V. Index-aligned. */
  t: Float64Array;
  /** 3D xyz per vertex — the PRODUCTION cone-fan positions + coincident u=1 seam copies (weld ⇒ identical mesh). */
  positions: Float32Array;
  /** Triangle vertex indices; NO triangle spans u_judge 0↔1 (cut at an apex-gap column ⇒ no wrap). */
  indices: Uint32Array;
  /** The apex-gap column the cylinder was cut at (domain seam = u_phys q/nU). */
  cutColumn: number;
  /** Circumferential column count (nU). */
  nU: number;
  /** Count of appended u=1 seam-duplicate vertices (exact lattice copies of column q). */
  seamDupCount: number;
}

/**
 * Build the {@link DsConeFanCertDomain} — the cut-at-gap judge-clean partition of the production cone-fan.
 *
 * @param nU  circumferential columns. MUST satisfy nU/(4·scalesPerRow) > patchP (so the midpoint apex-gap column clears
 *            every fan block); throws otherwise. The production nU=4096 and the probe's nU≥256 (default p=3) qualify.
 */
export function buildDsConeFanCertDomain(
  rA: AnalyticRadiusFn,
  H: number,
  nU: number,
  opts: DsConeFanOpts = {},
): DsConeFanCertDomain {
  const wall = buildDsConeFanWallGeometric(rA, H, nU, opts);
  const cols = wall.nU;
  const lat = opts.lattice ?? DEFAULT_DS_LATTICE;
  const p = Math.max(1, Math.floor(opts.patchP ?? 3));
  // Apex columns sit at multiples of cols/(2·scalesPerRow); the domain seam is the MIDPOINT gap between two of them.
  const apexColStep = cols / (2 * lat.scalesPerRow);
  const q = Math.round(apexColStep / 2);
  if (!Number.isInteger(apexColStep) || apexColStep <= 2 * p || q <= p || q >= cols) {
    throw new Error(
      `buildDsConeFanCertDomain: no valid apex-gap cut column for nU=${cols}, p=${p} (apexColStep=${apexColStep}, q=${q}); ` +
        'need nU divisible by 4·scalesPerRow and nU/(4·scalesPerRow) > patchP',
    );
  }
  const shift = q / cols;
  const nV = wall.ut.length / 2;
  const uJ: number[] = new Array(nV);
  const tt: number[] = new Array(nV);
  for (let v = 0; v < nV; v++) {
    let u = wall.ut[2 * v] - shift;
    u -= Math.floor(u); // wrap into [0,1) — the u-origin now sits on the apex gap q
    uJ[v] = u;
    tt[v] = wall.ut[2 * v + 1];
  }
  const pos: number[] = Array.from(wall.vertices);
  // Only the grid quad column at q straddles the flat seam (q is a gap ⇒ no fan crosses it). Redirect each straddling
  // triangle's LOW-u (column-q, u_judge=0) vertices to a dedup'd u=1 copy so the triangle sits contiguously at u≈1.
  const dupOf = new Map<number, number>();
  const getDup = (v: number): number => {
    let d = dupOf.get(v);
    if (d === undefined) {
      d = uJ.length;
      uJ.push(1); // exact u=1 boundary
      tt.push(tt[v]);
      pos.push(wall.vertices[3 * v], wall.vertices[3 * v + 1], wall.vertices[3 * v + 2]);
      dupOf.set(v, d);
    }
    return d;
  };
  const nF = wall.indices.length / 3;
  const outIdx = new Uint32Array(wall.indices.length);
  for (let f = 0; f < nF; f++) {
    let a = wall.indices[3 * f];
    let b = wall.indices[3 * f + 1];
    let c = wall.indices[3 * f + 2];
    if (Math.max(uJ[a], uJ[b], uJ[c]) - Math.min(uJ[a], uJ[b], uJ[c]) > 0.5) {
      if (uJ[a] < 0.5) a = getDup(a);
      if (uJ[b] < 0.5) b = getDup(b);
      if (uJ[c] < 0.5) c = getDup(c);
    }
    outIdx[3 * f] = a;
    outIdx[3 * f + 1] = b;
    outIdx[3 * f + 2] = c;
  }
  return {
    uJudge: Float64Array.from(uJ),
    t: Float64Array.from(tt),
    positions: Float32Array.from(pos),
    indices: outIdx,
    cutColumn: q,
    nU: cols,
    seamDupCount: dupOf.size,
  };
}
