/**
 * PeriodicBalancedQuadtree.ts — Adaptive quadtree over the outer-wall
 * parameter domain [0,1)×[0,1], periodic in u.
 *
 * A cell on the u=1 edge is a neighbour of the u=0 edge cell at the same
 * t-span (the wall is a closed loop). Each leaf is refined while its physical
 * extent (`sqrt(E)·du` wide, `sqrt(G)·dt` tall at the cell centre) exceeds the
 * {@link MetricSizingField} target there, then the tree is 2:1 balanced: no
 * leaf is edge-adjacent (including across the u-seam) to a leaf more than one
 * level finer.
 *
 * Internally a leaf is an integer cell `(level, iu, it, uExtra)`. The t-axis is
 * isotropic: `t0 = it/2^level`, `tSize = 1/2^level`, `it ∈ [0, 2^level)`. The
 * u-axis carries the global anisotropy bias B AND a per-leaf directional
 * `uExtra` (default 0): the EFFECTIVE u-level is `eUL = level + B + uExtra`, so
 * `u0 = iu/2^eUL`, `uSize = 1/2^eUL`, and `iu` is taken mod `2^eUL` (periodic).
 * Integer cells make neighbour queries exact; keying on `eUL` (not the bare
 * level) keeps a uExtra=0 cell and a uExtra=1 cell distinct even when their u0
 * collides under the bare span.
 *
 * @module conforming/PeriodicBalancedQuadtree
 */

import type { SurfaceSampler } from './SurfaceSampler';
import { firstFundamentalForm, metricStepsForSampler, type MetricSteps } from './SurfaceMetricTensor';
import type { MetricSizingField } from './MetricSizingField';

/** A leaf cell, exposed in physical-parameter terms. */
export interface QuadLeaf {
  /** Lower-u corner in [0,1). */
  u0: number;
  /** Lower-t corner in [0,1). */
  t0: number;
  /** Refinement level; t-size = 1/2^level. u-size = 1/2^(level+uBias+uExtra). */
  level: number;
  /**
   * Integer u-index at the EFFECTIVE u-level `level+uBias+uExtra` (periodic mod
   * 2^eUL). Populated by {@link PeriodicBalancedQuadtree.leaves} so conforming-
   * core consumers read the integer address DIRECTLY instead of reconstructing it
   * via `round(u0·2^(level+B))` — which collides when a uExtra=0 cell at iu=k and
   * a uExtra=1 cell at iu=2k share u0. OPTIONAL: hand-built test fixtures (plain
   * `{u0,t0,level}` literals) omit it; consumers fall back to the round-trip
   * (valid because such fixtures are always uExtra=0).
   */
  iu?: number;
  /** Integer t-index at `level` (it ∈ [0,2^level)). Optional (see {@link iu}). */
  it?: number;
  /**
   * Per-leaf directional u-refinement (default 0). A u-split of `(level,iu,it,k)`
   * → `(level,iu*2,it,k+1)` and `(level,iu*2+1,it,k+1)`: the cell narrows in u
   * only (t unchanged), so an extreme short-WIDE leaf becomes 3D-near-square. 0
   * everywhere is byte-identical to the isotropic+uBias tree (GAP 1 no-op).
   * OPTIONAL: absent ⇒ 0 (plain fixtures / pre-GAP1 leaves).
   */
  uExtra?: number;
  /**
   * Per-leaf first fundamental form `{E,F,G}` at the cell centre (Tier 1b). The
   * shape-aware triangulation templates ({@link triangulateQuadtree}) read it to
   * choose the shorter 3D diagonal / ear-clip transition polygons in the local
   * 3D metric, WITHOUT a per-triangle sampler call. OPTIONAL: when absent the
   * triangulator emits the legacy isotropic templates verbatim (byte-identical
   * smooth-default path). Tagging is the quadtree's job (it already evaluates the
   * metric at each cell centre); plain test fixtures omit it.
   */
  efg?: { E: number; F: number; G: number };
}

/** Side of a cell. u-sides wrap; t-sides do not. */
export type QuadSide = 'uMinus' | 'uPlus' | 'tMinus' | 'tPlus';

/** Internal integer-cell key. */
interface Cell {
  level: number;
  iu: number;
  it: number;
  /** Per-leaf directional u-refinement (default 0). */
  uExtra: number;
}

/**
 * Primary leaf key, keyed on the EFFECTIVE u-level so uExtra-distinguished cells
 * never collide: `${level}:${it}:${eUL}:${iu}`. `level` is retained (the t-axis
 * uses it directly); `eUL` and `iu` fix the u-position/modulus.
 */
function cellKey(level: number, it: number, eUL: number, iu: number): string {
  return `${level}:${it}:${eUL}:${iu}`;
}

/** Secondary key indexing a leaf by its effective u-position only: `${eUL}:${it}:${iu}`. */
function uEffKey(eUL: number, it: number, iu: number): string {
  return `${eUL}:${it}:${iu}`;
}

/** Cap on per-leaf directional u-refinement (bounds tri inflation + probe depth). */
const MAX_U_EXTRA = 4;
/** Reference metric anisotropy at which the directional gate opens (matches computeUBias). */
const UBIAS_AREF = 3;
/** F-inclusive 3D aspect above which a short-wide leaf is directionally u-split. */
const U_SPLIT_TRIGGER = 20;

export class PeriodicBalancedQuadtree {
  /** Set of primary leaf keys for O(1) existence checks. */
  private readonly leafSet = new Set<string>();
  /**
   * Secondary index: effective-u key (`${eUL}:${it}:${iu}`) → primary key. Lets a
   * u-side neighbour probe find a finer u-neighbour whether it arose from level+1
   * (t-isotropic refinement) or uExtra+1 (directional refinement) — both raise
   * eUL by 1. Maintained in lock-step with `leafSet`.
   */
  private readonly uByEffective = new Map<string, string>();
  /** Leaf cells in insertion order (rebuilt on demand). */
  private cells: Cell[] = [];
  /** Deepest level allowed; bounds the finer-neighbour probes. */
  private maxLevel = 0;
  /**
   * If set, the t=0 and t=1 boundary rows are forced to EXACTLY this level
   * (uniform 2^pin cells), while the interior refines freely. The cap grades
   * one level per pin-row away from the boundary so 2:1 balance holds against
   * the pinned rows (the cell touching the boundary is `pin`, the next at most
   * `pin+1`, etc.). 0/undefined disables pinning.
   */
  private readonly pinBoundaryLevel: number;
  /**
   * If set (>0), EVERY cell is refined to at least this level, producing a
   * uniform 2^L × 2^L base grid before curvature-driven refinement adds more.
   * This guarantees a full-height vertical column at each u = i/2^L (i in
   * [0,2^L)) — the prerequisite for pinning a sharp vertical crease onto a real
   * mesh edge via a u-warp. Capped by `maxLevel`/`levelCap` like any refinement.
   */
  private readonly minUniformLevel: number;
  /**
   * Optional feature-driven refinement: every cell a feature curve passes
   * through is refined to at least `featureRefine.level` (capped by maxLevel /
   * pin grading), so the curve crosses each cell SIMPLY (≈ one short arc). This
   * is what keeps the downstream local-CDT insertion sliver-free — a small loop
   * inside one large coarse cell would otherwise fan into thin triangles.
   * `intersects(u0,t0,size)` returns true iff a feature segment meets that cell.
   */
  private readonly featureRefine?: { level: number; intersects: (u0: number, t0: number, size: number) => boolean };
  /**
   * Optional CREASE-driven refinement: cells a warp-pinned crease locus crosses
   * are size-tested with the BIAS-FREE u-width (1/2^level instead of 1/2^(level+B))
   * so their t-subdivision matches the B=0 mesh. This restores the crease-column
   * t-rows that the global anisotropy bias B>0 otherwise removes — under B>0 the
   * u-driven square refinement near a sharp crease reaches the sizing target B
   * levels SHALLOWER, halving the crease column's t-rows per uBias level and
   * dropping the feature-coverage metric below threshold. The bias-free test
   * re-adds exactly the lost levels, and ONLY on crease-crossed cells (the rest of
   * the wall keeps the bias quality win — square cells, fewer triangles). The
   * crease itself stays a real, continuous mesh edge (it is a warp-pinned full-
   * height column, never a CDT insertion). `intersects(u0,t0,size)` returns true
   * iff a crease locus meets that cell. Omit ⇒ no crease refinement (B-invariant
   * no-op at B=0, since the bias-free width equals the biased width there).
   */
  private readonly creaseRefine?: { intersects: (u0: number, t0: number, size: number) => boolean };
  /** Grid-scaled finite-difference steps for the metric (de-noised vs sampler). */
  private readonly steps: MetricSteps;
  /**
   * Optional WARP-COMPOSED surface map used ONLY to tag each leaf's `efg` in
   * {@link leaves} (Stage-1 Task 2). Sizing/refinement keep using the PLAIN
   * `metric` arg — the composed map exists solely so the triangulator's
   * diagonal/ear-clip choices see the metric the emitted triangles ACTUALLY
   * carry after the post-assembly domain warps. Absent ⇒ no leaf is tagged
   * (legacy byte-identical path).
   */
  private readonly efgSampler?: SurfaceSampler;
  /**
   * Anisotropy bias B (≥0). A level-L leaf spans Δu = 1/2^(L+B) in u and
   * Δt = 1/2^L in t, so cells are 3D-near-square under extreme circumference/
   * height anisotropy (a square (u,t) cell maps to a √E/√G:1 sliver — see GAP 1).
   * B=0 (default) is byte-identical to the isotropic quadtree. The root is a
   * 2^B × 1 grid; square splits then preserve the 2^B:1 u:t cell-aspect at every
   * level, so the metric anisotropy is corrected uniformly. T-coordinates and the
   * pin/levelCap grading (t-based) are unaffected by B.
   */
  private readonly uBiasLevel: number;
  /**
   * If true, after balancing the tree runs a LOCAL directional u-refinement pass
   * (per-leaf `uExtra`) that drives residual short-WIDE slivers — cells whose
   * LOCAL √E/√G/2^B still exceeds the sliver bound — to 3D-near-square. Gated on
   * the SAME relief-aware base-anisotropy criterion as the global bias, so at
   * default dims it touches zero cells (no-op). Default false.
   */
  private readonly directionalRefine: boolean;
  /**
   * Metric samples per axis for the {@link shouldRefine} size test (default 1 =
   * cell-centre only, byte-identical to the legacy refiner). >1 evaluates the
   * first fundamental form on a k×k interior grid and splits if ANY sample's
   * physical extent exceeds the local target — so a steep relief crease passing
   * anywhere through the cell is seen (the centre-only test misses an off-centre
   * crease, leaving the wall under-tessellated → stretched chord facets). Cost is
   * k² metric evals per refinement decision; leaf geometry/efg are unchanged.
   */
  private readonly cellSamples: number;

  constructor(
    field: MetricSizingField,
    metric: SurfaceSampler,
    opts: {
      maxLevel: number;
      pinBoundaryLevel?: number;
      minUniformLevel?: number;
      featureRefine?: { level: number; intersects: (u0: number, t0: number, size: number) => boolean };
      /**
       * CREASE-driven refinement: crease-crossed cells are size-tested with the
       * BIAS-FREE u-width so their t-subdivision matches the B=0 mesh (restores the
       * crease-column t-rows the anisotropy bias B>0 removes). No-op at B=0.
       */
      creaseRefine?: { intersects: (u0: number, t0: number, size: number) => boolean };
      /** Anisotropy bias B (≥0): Δu = 1/2^(level+B), Δt = 1/2^level. 0 = isotropic. */
      uBias?: number;
      /** Enable the local directional u-refinement pass (per-leaf uExtra). */
      directionalRefine?: boolean;
      /**
       * Metric samples per axis for the refinement size test (default 1 =
       * centre-only, byte-identical). >1 makes the refiner SEE a steep crease
       * anywhere in the cell (catches the off-centre UV→3D stretch the centre
       * sample misses). Snapped to ≥1 in the constructor.
       */
      cellSamples?: number;
      /**
       * Optional WARP-COMPOSED sampler for per-leaf `efg` tagging in
       * {@link leaves} (see the field doc). Sizing/refinement ignore it — the
       * PLAIN `metric` stays the sizing basis (spec: sizing stays plain).
       */
      efgSampler?: SurfaceSampler;
    },
  ) {
    this.maxLevel = opts.maxLevel;
    this.pinBoundaryLevel = opts.pinBoundaryLevel ?? 0;
    this.minUniformLevel = Math.max(0, Math.min(opts.minUniformLevel ?? 0, opts.maxLevel));
    this.featureRefine = opts.featureRefine;
    this.creaseRefine = opts.creaseRefine;
    this.uBiasLevel = Math.max(0, Math.floor(opts.uBias ?? 0));
    this.directionalRefine = opts.directionalRefine ?? false;
    this.cellSamples = Math.max(1, Math.floor(opts.cellSamples ?? 1));
    this.efgSampler = opts.efgSampler;
    this.steps = metricStepsForSampler(metric);
    this.refine(field, metric);
    if (this.pinBoundaryLevel > 0) this.enforcePinnedBoundary();
    this.balance(opts.maxLevel);
    if (this.directionalRefine) this.localDirectionalRefine(metric);
  }

  /** The anisotropy bias B (≥0). Consumers map u-index via 2^(level+B). */
  uBias(): number {
    return this.uBiasLevel;
  }

  /** Effective u-level of a cell: level + global bias + per-leaf uExtra. */
  private effULevel(level: number, uExtra: number): number {
    return level + this.uBiasLevel + uExtra;
  }

  /** u-axis index modulus at an effective u-level: 2^eUL (periodic modulus for iu). */
  private uModulus(eUL: number): number {
    return 1 << eUL;
  }

  /** u-axis index modulus for a (level,uExtra) cell: 2^(level+B+uExtra). */
  private uSpanCell(level: number, uExtra: number): number {
    return 1 << this.effULevel(level, uExtra);
  }

  /**
   * Deepest level a cell `(level,iu,it)` may be refined to, given the pinned
   * boundary. Without a pin this is just `maxLevel`. With a pin, a cell may go
   * one level finer for each full pin-row its NEAREST t-edge sits away from the
   * t=0/t=1 boundary — so boundary-touching cells cap at `pin`, the next pin-row
   * at `pin+1`, etc. This grading is exactly what keeps the uniform pinned rows
   * 2:1-balanced against a refined interior.
   */
  private levelCap(level: number, it: number): number {
    if (this.pinBoundaryLevel <= 0) return this.maxLevel;
    const span = 1 << level;
    const t0 = it / span;
    const t1 = (it + 1) / span;
    const nearEdge = Math.min(t0, 1 - t1); // distance to nearest boundary
    const pinRows = Math.floor(nearEdge * (1 << this.pinBoundaryLevel) + 1e-9);
    return Math.min(this.maxLevel, this.pinBoundaryLevel + pinRows);
  }

  /** Does this cell's t-span touch the t=0 or t=1 domain boundary? */
  private touchesBoundary(level: number, it: number): boolean {
    return it === 0 || it === (1 << level) - 1;
  }

  /**
   * Split any boundary-touching leaf that is still coarser than `pinBoundaryLevel`
   * until both the t=0 and t=1 rows are uniform at exactly the pin level. The
   * `levelCap` already prevents boundary cells from being refined PAST the pin,
   * so after this pass the two boundary rows hold exactly 2^pin cells each.
   */
  private enforcePinnedBoundary(): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of Array.from(this.leafSet.values()).map((k) => this.cellOfKey(k))) {
        if (c.level >= this.pinBoundaryLevel) continue;
        if (c.uExtra !== 0) continue; // pinning predates directional refine
        if (!this.touchesBoundary(c.level, c.it)) continue;
        this.split(c.level, c.iu, c.it);
        changed = true;
      }
    }
  }

  // ----- construction -----------------------------------------------------

  /** Reconstruct a Cell from its primary key. */
  private cellOfKey(key: string): Cell {
    const [lvlS, itS, eULS, iuS] = key.split(':');
    const level = Number(lvlS);
    const it = Number(itS);
    const eUL = Number(eULS);
    const iu = Number(iuS);
    return { level, iu, it, uExtra: eUL - this.uBiasLevel - level };
  }

  private addLeaf(level: number, iu: number, it: number, uExtra = 0): void {
    const eUL = this.effULevel(level, uExtra);
    const span = this.uModulus(eUL); // u-index wraps mod 2^eUL
    const wu = ((iu % span) + span) % span;
    const key = cellKey(level, it, eUL, wu);
    this.leafSet.add(key);
    this.uByEffective.set(uEffKey(eUL, it, wu), key);
  }

  private removeLeaf(level: number, iu: number, it: number, uExtra = 0): void {
    const eUL = this.effULevel(level, uExtra);
    const span = this.uModulus(eUL);
    const wu = ((iu % span) + span) % span;
    this.leafSet.delete(cellKey(level, it, eUL, wu));
    this.uByEffective.delete(uEffKey(eUL, it, wu));
  }

  /** Existence of a (level,iu,it,uExtra) leaf (iu wrapped mod 2^eUL). */
  private hasLeaf(level: number, iu: number, it: number, uExtra = 0): boolean {
    const eUL = this.effULevel(level, uExtra);
    const span = this.uModulus(eUL);
    const wu = ((iu % span) + span) % span;
    return this.leafSet.has(cellKey(level, it, eUL, wu));
  }

  /**
   * Should the cell (level,iu,it) be split, given the sizing field?
   *
   * When `biasFreeU` the u-width is taken as the BIAS-FREE 1/2^level (as if B=0)
   * for the size test only — used on crease-crossed cells so their t-subdivision
   * matches the B=0 mesh (the cell GEOMETRY is still the biased 1/2^(level+B); only
   * the refinement DECISION ignores the bias). At B=0 the two widths coincide, so
   * this is a perfect no-op there.
   */
  private shouldRefine(
    field: MetricSizingField,
    metric: SurfaceSampler,
    level: number,
    iu: number,
    it: number,
    biasFreeU = false,
  ): boolean {
    const uSize = 1 / this.uSpanCell(level, 0); // 1/2^(level+B)
    const tSize = 1 / (1 << level);
    // Bias-free u-width (1/2^level) for the crease test; biased width otherwise.
    const wTestSize = biasFreeU ? 1 / (1 << level) : uSize;
    // Sample the metric on a k×k INTERIOR grid. k=1 ⇒ offset (0.5,0.5) = exactly
    // the cell centre, so this is byte-identical to the legacy centre-only test.
    // k>1 makes the refiner SEE a steep relief crease that crosses the cell
    // OFF-centre: firstFundamentalForm finite-differences the REAL surface, so an
    // off-centre sample directly measures the local UV→3D stretch the centre
    // misses (that miss is what leaves the wall under-tessellated → stretched
    // chord facets / "staircased" crease). Split if ANY sample's physical extent
    // exceeds the local target. Cost is k² metric evals per refinement decision.
    const k = this.cellSamples;
    for (let p = 0; p < k; p++) {
      for (let q = 0; q < k; q++) {
        const uc = (iu + (p + 0.5) / k) * uSize;
        const tc = (it + (q + 0.5) / k) * tSize;
        const { E, G } = firstFundamentalForm(metric, uc, tc, this.steps.hu, this.steps.ht);
        const physW = Math.sqrt(Math.max(E, 0)) * wTestSize;
        const physH = Math.sqrt(Math.max(G, 0)) * tSize;
        if (Math.max(physW, physH) > field.edgeLength(uc, tc)) return true;
      }
    }
    return false;
  }

  /** Curvature/size-driven refinement from the root, capped by {@link levelCap}. */
  private refine(
    field: MetricSizingField,
    metric: SurfaceSampler,
  ): void {
    // Worklist of cells to examine; start at the 2^B × 1 root grid (a single
    // cell when B=0). The B root columns give every cell the 2^B:1 u:t aspect.
    const stack: Cell[] = [];
    const rootU = this.uSpanCell(0, 0); // 2^B
    for (let iu = 0; iu < rootU; iu++) stack.push({ level: 0, iu, it: 0, uExtra: 0 });
    this.leafSet.clear();
    this.uByEffective.clear();
    while (stack.length > 0) {
      const c = stack.pop() as Cell;
      const cap = this.levelCap(c.level, c.it);
      // Force a uniform base refinement to `minUniformLevel` (bounded by the
      // pin-graded cap), then let curvature drive any deeper splits. The uniform
      // floor guarantees full-height columns at u=i/2^(minUniformLevel+B).
      const belowUniformFloor = c.level < Math.min(this.minUniformLevel, cap);
      // Feature-driven refinement: refine cells a feature curve crosses to the
      // feature level so the curve crosses each cell simply (sliver-free CDT).
      const uSize = 1 / this.uSpanCell(c.level, 0);
      const tSize = 1 / (1 << c.level);
      const belowFeatureFloor =
        this.featureRefine !== undefined &&
        c.level < Math.min(this.featureRefine.level, cap) &&
        // Cell box is [iu·Δu, iu·Δu+Δu]×[it·Δt, it·Δt+Δt]; pass the larger extent
        // as `size` so an anisotropic (B>0) cell is still hit-tested over its full
        // span (the intersector treats `size` as a square edge; the larger extent
        // is a conservative superset → never misses a crossing).
        this.featureRefine.intersects(c.iu * uSize, c.it * tSize, Math.max(uSize, tSize));
      // Crease-driven refinement: on cells a warp-pinned crease crosses, run the
      // size test with the BIAS-FREE u-width so the crease column keeps the B=0
      // t-rows the global bias would otherwise strip (restores feature coverage,
      // bias-invariantly). No-op at B=0 (bias-free width == biased width).
      const onCrease =
        this.creaseRefine !== undefined &&
        this.uBiasLevel > 0 &&
        this.creaseRefine.intersects(c.iu * uSize, c.it * tSize, Math.max(uSize, tSize));
      if (
        c.level < cap &&
        (belowUniformFloor ||
          belowFeatureFloor ||
          this.shouldRefine(field, metric, c.level, c.iu, c.it, onCrease))
      ) {
        const cl = c.level + 1;
        const bu = c.iu * 2;
        const bt = c.it * 2;
        stack.push({ level: cl, iu: bu, it: bt, uExtra: 0 });
        stack.push({ level: cl, iu: bu + 1, it: bt, uExtra: 0 });
        stack.push({ level: cl, iu: bu, it: bt + 1, uExtra: 0 });
        stack.push({ level: cl, iu: bu + 1, it: bt + 1, uExtra: 0 });
      } else {
        this.addLeaf(c.level, c.iu, c.it, 0);
      }
    }
  }

  /**
   * Enforce 2:1 balance: split any leaf that is edge-adjacent (incl. across the
   * u-seam) to a leaf more than one level finer, until stable. Queue-driven —
   * when a coarse leaf splits, only its 4 children and its edge-neighbours
   * (which may now be the coarse side of a 2:1 violation) are re-examined,
   * rather than rescanning the whole tree each pass.
   */
  private balance(maxLevel: number): void {
    this.maxLevel = maxLevel;
    const queue: string[] = Array.from(this.leafSet);
    while (queue.length > 0) {
      const key = queue.pop() as string;
      if (!this.leafSet.has(key)) continue; // already split
      const c = this.cellOfKey(key);
      if (c.uExtra !== 0) continue; // square balance predates directional refine
      const { level, iu, it } = c;
      // Never split past a cell's pin-graded cap — this is what keeps the
      // uniform t=0/t=1 boundary rows intact under balance.
      if (level >= this.levelCap(level, it)) continue;
      if (!this.hasFinerThanOneLevelNeighbour(level, iu, it)) continue;

      // Re-enqueue the coarse edge-neighbours before splitting (their balance
      // relationship to the new finer children must be rechecked).
      const sides: QuadSide[] = ['uMinus', 'uPlus', 'tMinus', 'tPlus'];
      for (const side of sides) {
        for (const c2 of this.neighbourCells(level, iu, it, 0, side)) {
          queue.push(this.keyOf(c2));
        }
      }
      this.split(level, iu, it);
      // The 4 new children may themselves border still-finer leaves.
      const cl = level + 1;
      const bu = iu * 2;
      const bt = it * 2;
      queue.push(this.keyOf({ level: cl, iu: bu, it: bt, uExtra: 0 }));
      queue.push(this.keyOf({ level: cl, iu: bu + 1, it: bt, uExtra: 0 }));
      queue.push(this.keyOf({ level: cl, iu: bu, it: bt + 1, uExtra: 0 }));
      queue.push(this.keyOf({ level: cl, iu: bu + 1, it: bt + 1, uExtra: 0 }));
    }
    this.rebuildCells();
  }

  /** Primary key for a Cell. */
  private keyOf(c: Cell): string {
    const eUL = this.effULevel(c.level, c.uExtra);
    const span = this.uModulus(eUL);
    const wu = ((c.iu % span) + span) % span;
    return cellKey(c.level, c.it, eUL, wu);
  }

  /** Does this cell border any leaf more than one level finer? */
  private hasFinerThanOneLevelNeighbour(
    level: number,
    iu: number,
    it: number,
  ): boolean {
    const sides: QuadSide[] = ['uMinus', 'uPlus', 'tMinus', 'tPlus'];
    for (const side of sides) {
      const finerLevel = this.finestNeighbourLevel(level, iu, it, side);
      if (finerLevel > level + 1) return true;
    }
    return false;
  }

  /**
   * The finest level among existing leaves bordering `side` of (level,iu,it).
   * Returns `level` if no finer leaf is found (coarser/equal neighbours never
   * violate balance from this cell's perspective). This square-balance probe
   * considers only uExtra=0 leaves (directional refinement is a later pass and
   * enforces its OWN eUL balance); the t-isotropic split-level is what matters.
   */
  private finestNeighbourLevel(
    level: number,
    iu: number,
    it: number,
    side: QuadSide,
  ): number {
    const uSpanL = this.uSpanCell(level, 0); // u wraps mod 2^(level+B)
    const tSpanL = 1 << level; // t domain bound
    // Adjacent cell coordinate at this level.
    let au = iu;
    let at = it;
    if (side === 'uMinus') au = (iu - 1 + uSpanL) % uSpanL;
    else if (side === 'uPlus') au = (iu + 1) % uSpanL;
    else if (side === 'tMinus') at = it - 1;
    else at = it + 1;
    if (at < 0 || at >= tSpanL) return level; // domain boundary in t

    // Probe progressively finer levels for any leaf covering the adjacent
    // cell's touching strip; return the finest level that has a leaf there.
    let finest = level;
    for (let lv = level; lv <= this.maxLevel; lv++) {
      if (lv === level) {
        if (this.hasLeaf(lv, au, at, 0)) {
          finest = Math.max(finest, lv);
          // a same-level leaf fully covers the side; no finer split possible there
          return finest;
        }
        // No same-level leaf: it is either coarser (covered below) or finer.
      } else {
        const f = lv - level;
        const mul = 1 << f;
        // Range of finer cells along the shared edge of the adjacent cell.
        const baseU = au * mul;
        const baseT = at * mul;
        let found = false;
        if (side === 'uMinus' || side === 'uPlus') {
          // Shared edge runs along t; the touching column is the one nearest us.
          const colU = side === 'uPlus' ? baseU : baseU + mul - 1;
          for (let k = 0; k < mul; k++) {
            if (this.hasLeaf(lv, colU, baseT + k, 0)) {
              found = true;
              break;
            }
          }
        } else {
          // Shared edge runs along u; the touching row is the one nearest us.
          const rowT = side === 'tPlus' ? baseT : baseT + mul - 1;
          for (let k = 0; k < mul; k++) {
            if (this.hasLeaf(lv, baseU + k, rowT, 0)) {
              found = true;
              break;
            }
          }
        }
        if (found) finest = Math.max(finest, lv);
      }
    }
    return finest;
  }

  /** Split a leaf into 4 children (square split; uExtra reset to 0). */
  private split(level: number, iu: number, it: number): void {
    this.removeLeaf(level, iu, it, 0);
    const cl = level + 1;
    const bu = iu * 2;
    const bt = it * 2;
    this.addLeaf(cl, bu, bt, 0);
    this.addLeaf(cl, bu + 1, bt, 0);
    this.addLeaf(cl, bu, bt + 1, 0);
    this.addLeaf(cl, bu + 1, bt + 1, 0);
  }

  private rebuildCells(): void {
    this.cells = [];
    for (const key of this.leafSet) this.cells.push(this.cellOfKey(key));
  }

  // ----- public API -------------------------------------------------------

  /** Number of leaf cells (cheap — no array materialization). */
  leafCount(): number {
    return this.leafSet.size;
  }

  /**
   * All leaf cells in physical-parameter terms (u0 = iu/2^eUL).
   *
   * When an `efgSampler` was injected, each leaf is additionally tagged with
   * `efg` = the first fundamental form of that (warp-COMPOSED) map at the cell
   * CENTRE — the input the shaped triangulation templates gate on. Population
   * happens HERE and ONLY here:
   *  - `leafOfCell` is the hot per-edge neighbours path (called many times per
   *    leaf during triangulation); tagging there would multiply sampler calls
   *    for values the neighbour consumers never read.
   *  - The budget-scale search calls only {@link leafCount}, never `leaves()`,
   *    so repeated quadtree rebuilds during the search pay NOTHING for efg
   *    (lazy = free); the cost lands once, on the final triangulated build.
   * The FD steps are `this.steps` — derived from the PLAIN metric's grid
   * resolution. The composed wrapper FORWARDS `gridResolution()` from the plain
   * sampler (same (u,t) domain), so `metricStepsForSampler(efgSampler)` would
   * be equivalent; reusing `this.steps` keeps one step basis for the whole
   * tree. Per-leaf cost: one `firstFundamentalForm` = 4 `position()` calls.
   */
  leaves(): QuadLeaf[] {
    /**
     * Max relative component deviation (center vs inset corners) above which
     * the per-leaf constant-metric assumption is declared violated and efg is
     * suppressed. Pre-registered at 0.5 (epoch-1 guard; see the block below).
     */
    const EFG_MAX_REL_VARIATION = 0.5;
    if (this.cells.length === 0 && this.leafSet.size > 0) this.rebuildCells();
    return this.cells.map((c) => {
      const uSpan = this.uSpanCell(c.level, c.uExtra);
      const tSpan = 1 << c.level;
      const leaf: QuadLeaf = {
        u0: c.iu / uSpan,
        t0: c.it / tSpan,
        level: c.level,
        iu: c.iu,
        it: c.it,
        uExtra: c.uExtra,
      };
      if (this.efgSampler) {
        const uc = (c.iu + 0.5) / uSpan;
        const tc = (c.it + 0.5) / tSpan;
        const center = firstFundamentalForm(this.efgSampler, uc, tc, this.steps.hu, this.steps.ht);
        // METRIC-RELIABILITY GUARD (epoch-1 MEASURED regression: LowPolyFacet
        // band 0→7.8, GothicArches 0.7→4.4 sub-15°, all in the DP tag): the
        // shaped templates assume the metric is CONSTANT over the leaf; on
        // facet/crease styles the surface bends INSIDE the cell, the center
        // efg misrepresents it, and the DP picks diagonals that are bad in
        // real 3D. Probe two inset corners; if any component deviates from the
        // center by more than EFG_MAX_REL_VARIATION (E,G relative to
        // themselves; F relative to √(E·G)), suppress efg — the shapedTemplate
        // gate then falls back to the legacy fan, which measurement showed
        // handles intra-cell relief better. Cost: 3 FFF (12 position()) per
        // leaf, final build only.
        const cA = firstFundamentalForm(
          this.efgSampler, (c.iu + 0.25) / uSpan, (c.it + 0.25) / tSpan, this.steps.hu, this.steps.ht,
        );
        const cB = firstFundamentalForm(
          this.efgSampler, (c.iu + 0.75) / uSpan, (c.it + 0.75) / tSpan, this.steps.hu, this.steps.ht,
        );
        const scaleF = Math.sqrt(Math.max(center.E * center.G, 1e-30));
        const varOf = (m: { E: number; F: number; G: number }): number =>
          Math.max(
            Math.abs(m.E - center.E) / Math.max(center.E, 1e-30),
            Math.abs(m.G - center.G) / Math.max(center.G, 1e-30),
            Math.abs(m.F - center.F) / scaleF,
          );
        if (Math.max(varOf(cA), varOf(cB)) <= EFG_MAX_REL_VARIATION) {
          leaf.efg = center;
        }
      }
      return leaf;
    });
  }

  /** Neighbour leaves across each of the 4 sides (u-sides wrap). */
  neighbors(leaf: QuadLeaf): { side: QuadSide; leaf: QuadLeaf }[] {
    const level = leaf.level;
    const uExtra = leaf.uExtra ?? 0;
    const iu = leaf.iu ?? Math.round(leaf.u0 * this.uSpanCell(level, uExtra));
    const it = leaf.it ?? Math.round(leaf.t0 * (1 << level));
    const out: { side: QuadSide; leaf: QuadLeaf }[] = [];
    const sides: QuadSide[] = ['uMinus', 'uPlus', 'tMinus', 'tPlus'];
    for (const side of sides) {
      for (const c of this.neighbourCells(level, iu, it, uExtra, side)) {
        out.push({ side, leaf: this.leafOfCell(c) });
      }
    }
    return out;
  }

  /** Expose a Cell as a QuadLeaf. */
  private leafOfCell(c: Cell): QuadLeaf {
    return {
      u0: c.iu / this.uSpanCell(c.level, c.uExtra),
      t0: c.it / (1 << c.level),
      level: c.level,
      iu: c.iu,
      it: c.it,
      uExtra: c.uExtra,
    };
  }

  /**
   * All existing leaf cells bordering `side` of (level,iu,it,uExtra): the
   * same-class leaf, a coarser ancestor, or several finer leaves along the shared
   * edge. The u-axis is resolved on the EFFECTIVE u-level lattice (eUL=level+B+
   * uExtra), the t-axis on `level` (t is isotropic — uExtra never changes the
   * t-resolution). At uExtra=0 everywhere this is byte-identical to the original
   * level-keyed probe: eUL=level+B is a fixed bijection of level, so every
   * effective-u step is exactly a level step and the same leaves are returned.
   */
  private neighbourCells(
    level: number,
    iu: number,
    it: number,
    uExtra: number,
    side: QuadSide,
  ): Cell[] {
    const eUL = this.effULevel(level, uExtra);
    const uSpanL = this.uModulus(eUL); // u wraps mod 2^eUL
    const tSpanL = 1 << level; // t domain bound
    let au = iu;
    let at = it;
    let ae = eUL; // effective-u level of the adjacent strip we probe
    if (side === 'uMinus') au = (iu - 1 + uSpanL) % uSpanL;
    else if (side === 'uPlus') au = (iu + 1) % uSpanL;
    else if (side === 'tMinus') at = it - 1;
    else at = it + 1;
    if (at < 0 || at >= tSpanL) return []; // domain boundary in t
    const uSide = side === 'uMinus' || side === 'uPlus';

    // Same class (same level, same eUL)? Found directly via the secondary index.
    {
      const k = this.uByEffective.get(uEffKey(ae, at, au));
      if (k !== undefined) {
        const c = this.cellOfKey(k);
        if (c.level === level) return [c];
      }
    }

    // Coarser ancestor: a single leaf covering the adjacent strip at a coarser
    // effective u-level. At each coarser eUL (au halved per step) the ancestor's
    // level may be anything ≤ our level (with uExtra' = eUL−B−level' ≥ 0); its
    // t-row is our adjacent t-row projected to that coarser level. The first hit
    // (coarsest-first along the walk) is the unique covering ancestor. At
    // uExtra=0 only level'=ce−B is possible, so this collapses to the original
    // level-keyed ancestor walk (level and t halve together with eUL).
    {
      let ce = ae - 1;
      let cu = au >> 1;
      while (ce >= this.uBiasLevel) {
        const maxLvl = Math.min(level, ce - this.uBiasLevel);
        for (let cl = maxLvl; cl >= 0; cl--) {
          const cux = ce - this.uBiasLevel - cl;
          if (cux < 0 || cux > MAX_U_EXTRA) continue;
          const ct = at >> (level - cl); // adjacent t-row projected to coarser level
          if (this.hasLeaf(cl, cu, ct, cux)) return [this.normCell(cl, cu, ct, cux)];
        }
        ce -= 1;
        cu >>= 1;
      }
    }

    // Finer leaves along the shared edge (at a finer eUL; on t-sides also a finer
    // level). The first finer eUL that has any leaf wins (2:1 balance bounds it
    // to eUL+1, but we scan a small window to stay robust during re-balance).
    const found: Cell[] = [];
    const maxEUL = this.maxLevel + this.uBiasLevel + MAX_U_EXTRA;
    for (let fe = ae + 1; fe <= maxEUL; fe++) {
      const mul = 1 << (fe - ae); // finer u-modulus / our u-modulus
      const baseU = au * mul; // our adjacent u-index projected to the finer eUL
      if (uSide) {
        // Shared edge runs along t; the touching column is the one nearest us.
        const colU = side === 'uPlus' ? baseU : baseU + mul - 1;
        // A finer u-neighbour is finer in level and/or uExtra. Try each level'
        // (≥ our level — finer u-cells are never coarser in t) with matching
        // uExtra' = fe − B − level'; its t-rows subdivide our strip.
        for (let lvl = level; lvl <= this.maxLevel; lvl++) {
          const ux = fe - this.uBiasLevel - lvl;
          if (ux < 0 || ux > MAX_U_EXTRA) continue;
          const tMul = 1 << (lvl - level);
          const tBase = at * tMul;
          for (let k = 0; k < tMul; k++) {
            if (this.hasLeaf(lvl, colU, tBase + k, ux)) found.push(this.normCell(lvl, colU, tBase + k, ux));
          }
        }
      } else {
        // Shared edge runs along u; the touching row is the one nearest us. Finer
        // t-cells are at level' > level; their eUL = level'+B+uExtra' = fe.
        for (let lvl = level + 1; lvl <= this.maxLevel; lvl++) {
          const ux = fe - this.uBiasLevel - lvl;
          if (ux < 0 || ux > MAX_U_EXTRA) continue;
          const tMul = 1 << (lvl - level);
          const baseT = at * tMul;
          const rowT = side === 'tPlus' ? baseT : baseT + tMul - 1;
          for (let k = 0; k < mul; k++) {
            if (this.hasLeaf(lvl, baseU + k, rowT, ux)) found.push(this.normCell(lvl, baseU + k, rowT, ux));
          }
        }
      }
      if (found.length > 0) break;
    }
    return found;
  }

  /** Normalize a cell's iu into [0,2^eUL) and return a Cell. */
  private normCell(level: number, iu: number, it: number, uExtra: number): Cell {
    const eUL = this.effULevel(level, uExtra);
    const span = this.uModulus(eUL);
    return { level, iu: ((iu % span) + span) % span, it, uExtra };
  }

  // ----- local directional refinement (GAP 1, per-leaf uExtra) -------------

  /**
   * Directional u-split of a leaf: `(level,iu,it,k)` → `(level,iu*2,it,k+1)` and
   * `(level,iu*2+1,it,k+1)`. Narrows the cell in u only (t unchanged), so a
   * short-WIDE leaf becomes 3D-near-square. Raises the cell's eUL by 1.
   */
  private directionalUSplit(c: Cell): void {
    this.removeLeaf(c.level, c.iu, c.it, c.uExtra);
    this.addLeaf(c.level, c.iu * 2, c.it, c.uExtra + 1);
    this.addLeaf(c.level, c.iu * 2 + 1, c.it, c.uExtra + 1);
  }

  /**
   * The maximum effective u-level among the existing INTERIOR (non-boundary-row)
   * leaves bordering a cell, scanning EVERY eUL band on each edge (not just the
   * first/coarsest finer one — an edge may abut leaves at several eULs, e.g. a
   * mix of uExtra=2 and uExtra=3 cells). The pinned boundary rows are EXCLUDED:
   * they never directionally refine (uExtra stays 0 so the shared rings match both
   * walls), and the N-mid registry covers their t-edge subdivision watertightly —
   * so they do not impose a 2:1 eUL constraint. Interior cells are balanced ≤1
   * amongst themselves (small mid-sets, well-shaped transition triangles).
   */
  private maxInteriorNeighbourEUL(c: Cell): number {
    const eUL = this.effULevel(c.level, c.uExtra);
    let max = 0;
    const consider = (cell: Cell): void => {
      if (this.touchesBoundary(cell.level, cell.it)) return; // pinned ring exempt
      const e = this.effULevel(cell.level, cell.uExtra);
      if (e > max) max = e;
    };
    // Only FINER neighbours (eUL'>eUL) can force a split (same/coarser are ≤ eUL),
    // so a single full finer scan per side is sufficient — and exact (every band).
    const sides: QuadSide[] = ['uMinus', 'uPlus', 'tMinus', 'tPlus'];
    for (const side of sides) {
      this.forEachFinerNeighbourOnSide(c.level, c.iu, c.it, eUL, side, consider);
    }
    return max;
  }

  /**
   * Invoke `cb` for every existing leaf at a FINER effective u-level (eUL'>eUL)
   * that borders `side` of (level,iu,it). Unlike {@link neighbourCells} this does
   * NOT stop at the first finer band — it scans all of them, so the true finest
   * neighbour is found (needed for an exact eUL balance under mixed uExtra).
   */
  private forEachFinerNeighbourOnSide(
    level: number, iu: number, it: number, eUL: number, side: QuadSide,
    cb: (c: Cell) => void,
  ): void {
    const span = this.uModulus(eUL);
    const tSpanL = 1 << level;
    let au = iu;
    let at = it;
    if (side === 'uMinus') au = (iu - 1 + span) % span;
    else if (side === 'uPlus') au = (iu + 1) % span;
    else if (side === 'tMinus') at = it - 1;
    else at = it + 1;
    if (at < 0 || at >= tSpanL) return;
    const uSide = side === 'uMinus' || side === 'uPlus';
    const maxEUL = this.maxLevel + this.uBiasLevel + MAX_U_EXTRA;
    for (let fe = eUL + 1; fe <= maxEUL; fe++) {
      const mul = 1 << (fe - eUL);
      const baseU = au * mul;
      if (uSide) {
        const colU = side === 'uPlus' ? baseU : baseU + mul - 1;
        for (let lvl = level; lvl <= this.maxLevel; lvl++) {
          const ux = fe - this.uBiasLevel - lvl;
          if (ux < 0 || ux > MAX_U_EXTRA) continue;
          const tMul = 1 << (lvl - level);
          const tBase = at * tMul;
          for (let k = 0; k < tMul; k++) {
            if (this.hasLeaf(lvl, colU, tBase + k, ux)) cb(this.normCell(lvl, colU, tBase + k, ux));
          }
        }
      } else {
        for (let lvl = level + 1; lvl <= this.maxLevel; lvl++) {
          const ux = fe - this.uBiasLevel - lvl;
          if (ux < 0 || ux > MAX_U_EXTRA) continue;
          const tMul = 1 << (lvl - level);
          const baseT = at * tMul;
          const rowT = side === 'tPlus' ? baseT : baseT + tMul - 1;
          for (let k = 0; k < mul; k++) {
            if (this.hasLeaf(lvl, baseU + k, rowT, ux)) cb(this.normCell(lvl, baseU + k, rowT, ux));
          }
        }
      }
    }
  }

  /**
   * F-INCLUSIVE true 3D-quad aspect of a cell at its centre, plus the physical
   * width/height. The quad's two physical edge vectors are `Pu·du` (|·|=√E·du)
   * and `Pt·dt` (|·|=√G·dt); its area is `√(EG−F²)·du·dt`. The aspect uses the
   * longest edge² over twice the area (matches metrics.ts's right-triangle
   * factor). Crucially F-inclusive: an F-SHEAR sliver (EG−F²→0, e.g. Voronoi/
   * Gyroid) has a SMALL area → large aspect, but its long axis is NOT u, so the
   * `physW>physH` caller guard leaves it untouched (u-refinement can't fix shear).
   */
  private cellAspect3D(
    metric: SurfaceSampler, level: number, iu: number, it: number, uExtra: number,
  ): { aspect: number; physW: number; physH: number } {
    const du = 1 / this.uSpanCell(level, uExtra);
    const dt = 1 / (1 << level);
    const uc = (iu + 0.5) * du;
    const tc = (it + 0.5) * dt;
    const { E, F, G } = firstFundamentalForm(metric, uc, tc, this.steps.hu, this.steps.ht);
    const physW = Math.sqrt(Math.max(E, 0)) * du;
    const physH = Math.sqrt(Math.max(G, 0)) * dt;
    const area = Math.sqrt(Math.max(E * G - F * F, 0)) * du * dt;
    const longest2 = Math.max(physW * physW, physH * physH);
    const aspect = area <= 1e-300 ? Infinity : (longest2 * Math.sqrt(3)) / (2 * area);
    return { aspect, physW, physH };
  }

  /**
   * Gate the directional pass on the SAME relief-aware BASE-anisotropy criterion
   * the global bias uses (`median(2π·r/√G) > UBIAS_AREF·√2`). At default dims the
   * SHAPE is not wide/flat → the gate is NOT tripped → the pass returns having
   * touched zero cells (byte-identical no-op), regardless of per-cell relief.
   */
  private directionalGateTripped(metric: SurfaceSampler): boolean {
    const ratios: number[] = [];
    const N = 12;
    for (let j = 1; j < N; j++) {
      const t = j / N;
      for (let i = 0; i < N; i++) {
        const u = i / N;
        const p = metric.position(u, t);
        const { G } = firstFundamentalForm(metric, u, t, this.steps.hu, this.steps.ht);
        const sG = Math.sqrt(Math.max(G, 1e-12));
        ratios.push((2 * Math.PI * Math.hypot(p[0], p[1])) / sG);
      }
    }
    ratios.sort((a, b) => a - b);
    const med = ratios.length === 0 ? 1 : ratios[Math.floor(ratios.length / 2)] || 1;
    return med > UBIAS_AREF * Math.SQRT2;
  }

  /**
   * Local directional u-refinement (GAP 1). Runs ONLY when `directionalRefine`
   * AND the wide/flat gate is tripped (so it is a no-op at default dims). Splits
   * residual short-WIDE slivers in u until their F-inclusive 3D aspect drops below
   * the sliver bound, then enforces both-axis 2:1 effective-u-level balance.
   * Boundary rows are NEVER touched (uExtra stays 0 → shared rings stay pinned).
   * F-SHEAR slivers (long axis ≠ u) are LEFT UNTOUCHED (physW>physH guard).
   */
  private localDirectionalRefine(metric: SurfaceSampler): void {
    // (1) HARD GATE — identical to computeUBias's B=0 gate. No-op at default dims.
    if (!this.directionalGateTripped(metric)) return;

    // (2) Trigger pass: u-split any leaf whose F-inclusive aspect exceeds the
    //     trigger, whose long axis IS u (physW>physH), that has u-refinement
    //     budget left, and that does NOT touch the t=0/t=1 boundary. Iterate so a
    //     once-split cell is re-tested (one split may not suffice).
    let changed = true;
    let guard = 0;
    while (changed && guard++ < MAX_U_EXTRA + 2) {
      changed = false;
      for (const c of Array.from(this.leafSet.values()).map((k) => this.cellOfKey(k))) {
        if (c.uExtra >= MAX_U_EXTRA) continue;
        if (this.touchesBoundary(c.level, c.it)) continue; // rings never split
        const { aspect, physW, physH } = this.cellAspect3D(metric, c.level, c.iu, c.it, c.uExtra);
        if (aspect > U_SPLIT_TRIGGER && physW > physH) {
          this.directionalUSplit(c);
          changed = true;
        }
      }
    }

    // (3) Both-axis 2:1 effective-u-level balance: split any non-boundary leaf
    //     whose eUL is ≥2 below a neighbour's, to fixpoint. The N-mid registry in
    //     the triangulator already tolerates an arbitrary subdivision on a t-edge
    //     against the (exempt) boundary row, but bounding the interior disparity
    //     to ≤1 keeps the transition mid-sets small and the triangles well-shaped.
    this.balanceEffectiveU();

    this.rebuildCells();
  }

  /**
   * Queue-driven 2:1 effective-u-level balance for directional cells: any
   * NON-BOUNDARY leaf whose eUL is more than one below some edge-neighbour's eUL
   * is directionally u-split (raising its eUL by 1), until stable. Boundary rows
   * are exempt (never split) — the N-mid registry covers their t-edge transition.
   */
  private balanceEffectiveU(): void {
    const queue: string[] = Array.from(this.leafSet);
    let guard = 0;
    const guardMax = (this.leafSet.size + 1) * (MAX_U_EXTRA + this.maxLevel + 2) + 16;
    while (queue.length > 0 && guard++ < guardMax * 8) {
      const key = queue.pop() as string;
      if (!this.leafSet.has(key)) continue; // already split
      const c = this.cellOfKey(key);
      if (this.touchesBoundary(c.level, c.it)) continue; // rings never split
      if (c.uExtra >= MAX_U_EXTRA) continue; // budget exhausted
      const eUL = this.effULevel(c.level, c.uExtra);
      if (this.maxInteriorNeighbourEUL(c) <= eUL + 1) continue; // balanced vs interior

      // Re-enqueue neighbours (their balance vs the new finer children changes),
      // split, then enqueue the two children.
      const sides: QuadSide[] = ['uMinus', 'uPlus', 'tMinus', 'tPlus'];
      for (const side of sides) {
        for (const nb of this.neighbourCells(c.level, c.iu, c.it, c.uExtra, side)) {
          queue.push(this.keyOf(nb));
        }
      }
      this.directionalUSplit(c);
      queue.push(this.keyOf({ level: c.level, iu: c.iu * 2, it: c.it, uExtra: c.uExtra + 1 }));
      queue.push(this.keyOf({ level: c.level, iu: c.iu * 2 + 1, it: c.it, uExtra: c.uExtra + 1 }));
    }
  }
}
