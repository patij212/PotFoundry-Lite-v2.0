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
 * Internally a leaf is an integer cell `(level, iu, it)` with
 * `u0 = iu/2^level`, `t0 = it/2^level`; `iu` is taken mod `2^level` (periodic),
 * `it ∈ [0, 2^level)`. Integer cells make neighbour queries exact.
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
  /** Refinement level; cell size = 1/2^level in both u and t. */
  level: number;
}

/** Side of a cell. u-sides wrap; t-sides do not. */
export type QuadSide = 'uMinus' | 'uPlus' | 'tMinus' | 'tPlus';

/** Internal integer-cell key. */
interface Cell {
  level: number;
  iu: number;
  it: number;
}

function cellKey(level: number, iu: number, it: number): string {
  return `${level}:${iu}:${it}`;
}

export class PeriodicBalancedQuadtree {
  /** Set of leaf keys for O(1) existence checks. */
  private readonly leafSet = new Set<string>();
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
  /** Grid-scaled finite-difference steps for the metric (de-noised vs sampler). */
  private readonly steps: MetricSteps;

  constructor(
    field: MetricSizingField,
    metric: SurfaceSampler,
    opts: { maxLevel: number; pinBoundaryLevel?: number; minUniformLevel?: number },
  ) {
    this.maxLevel = opts.maxLevel;
    this.pinBoundaryLevel = opts.pinBoundaryLevel ?? 0;
    this.minUniformLevel = Math.max(0, Math.min(opts.minUniformLevel ?? 0, opts.maxLevel));
    this.steps = metricStepsForSampler(metric);
    this.refine(field, metric);
    if (this.pinBoundaryLevel > 0) this.enforcePinnedBoundary();
    this.balance(opts.maxLevel);
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
      for (const key of Array.from(this.leafSet)) {
        const [lvlS, iuS, itS] = key.split(':');
        const level = Number(lvlS);
        const iu = Number(iuS);
        const it = Number(itS);
        if (level >= this.pinBoundaryLevel) continue;
        if (!this.touchesBoundary(level, it)) continue;
        this.split(level, iu, it);
        changed = true;
      }
    }
  }

  // ----- construction -----------------------------------------------------

  private addLeaf(level: number, iu: number, it: number): void {
    const span = 1 << level;
    const wu = ((iu % span) + span) % span;
    this.leafSet.add(cellKey(level, wu, it));
  }

  private removeLeaf(level: number, iu: number, it: number): void {
    this.leafSet.delete(cellKey(level, iu, it));
  }

  /** Should the cell (level,iu,it) be split, given the sizing field? */
  private shouldRefine(
    field: MetricSizingField,
    metric: SurfaceSampler,
    level: number,
    iu: number,
    it: number,
  ): boolean {
    const size = 1 / (1 << level);
    const uc = (iu + 0.5) * size;
    const tc = (it + 0.5) * size;
    const { E, G } = firstFundamentalForm(metric, uc, tc, this.steps.hu, this.steps.ht);
    const physW = Math.sqrt(Math.max(E, 0)) * size;
    const physH = Math.sqrt(Math.max(G, 0)) * size;
    const target = field.edgeLength(uc, tc);
    return Math.max(physW, physH) > target;
  }

  /** Curvature/size-driven refinement from the root, capped by {@link levelCap}. */
  private refine(
    field: MetricSizingField,
    metric: SurfaceSampler,
  ): void {
    // Worklist of cells to examine; start at the single root cell.
    const stack: Cell[] = [{ level: 0, iu: 0, it: 0 }];
    this.leafSet.clear();
    while (stack.length > 0) {
      const c = stack.pop() as Cell;
      const cap = this.levelCap(c.level, c.it);
      // Force a uniform base refinement to `minUniformLevel` (bounded by the
      // pin-graded cap), then let curvature drive any deeper splits. The uniform
      // floor guarantees full-height columns at u=i/2^minUniformLevel.
      const belowUniformFloor = c.level < Math.min(this.minUniformLevel, cap);
      if (
        c.level < cap &&
        (belowUniformFloor || this.shouldRefine(field, metric, c.level, c.iu, c.it))
      ) {
        const cl = c.level + 1;
        const bu = c.iu * 2;
        const bt = c.it * 2;
        stack.push({ level: cl, iu: bu, it: bt });
        stack.push({ level: cl, iu: bu + 1, it: bt });
        stack.push({ level: cl, iu: bu, it: bt + 1 });
        stack.push({ level: cl, iu: bu + 1, it: bt + 1 });
      } else {
        this.addLeaf(c.level, c.iu, c.it);
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
      const [lvlS, iuS, itS] = key.split(':');
      const level = Number(lvlS);
      const iu = Number(iuS);
      const it = Number(itS);
      // Never split past a cell's pin-graded cap — this is what keeps the
      // uniform t=0/t=1 boundary rows intact under balance.
      if (level >= this.levelCap(level, it)) continue;
      if (!this.hasFinerThanOneLevelNeighbour(level, iu, it)) continue;

      // Re-enqueue the coarse edge-neighbours before splitting (their balance
      // relationship to the new finer children must be rechecked).
      const sides: QuadSide[] = ['uMinus', 'uPlus', 'tMinus', 'tPlus'];
      for (const side of sides) {
        for (const c of this.neighbourCells(level, iu, it, side)) {
          queue.push(cellKey(c.level, c.iu, c.it));
        }
      }
      this.split(level, iu, it);
      // The 4 new children may themselves border still-finer leaves.
      const cl = level + 1;
      const bu = iu * 2;
      const bt = it * 2;
      queue.push(cellKey(cl, bu, bt));
      queue.push(cellKey(cl, bu + 1, bt));
      queue.push(cellKey(cl, bu, bt + 1));
      queue.push(cellKey(cl, bu + 1, bt + 1));
    }
    this.rebuildCells();
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
   * violate balance from this cell's perspective).
   */
  private finestNeighbourLevel(
    level: number,
    iu: number,
    it: number,
    side: QuadSide,
  ): number {
    const span = 1 << level;
    // Adjacent cell coordinate at this level.
    let au = iu;
    let at = it;
    if (side === 'uMinus') au = (iu - 1 + span) % span;
    else if (side === 'uPlus') au = (iu + 1) % span;
    else if (side === 'tMinus') at = it - 1;
    else at = it + 1;
    if (at < 0 || at >= span) return level; // domain boundary in t

    // Probe progressively finer levels for any leaf covering the adjacent
    // cell's touching strip; return the finest level that has a leaf there.
    let finest = level;
    for (let lv = level; lv <= this.maxLevel; lv++) {
      if (lv === level) {
        if (this.leafSet.has(cellKey(lv, au, at))) {
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
            if (this.leafSet.has(cellKey(lv, colU, baseT + k))) {
              found = true;
              break;
            }
          }
        } else {
          // Shared edge runs along u; the touching row is the one nearest us.
          const rowT = side === 'tPlus' ? baseT : baseT + mul - 1;
          for (let k = 0; k < mul; k++) {
            const colU = (baseU + k) % (1 << lv);
            if (this.leafSet.has(cellKey(lv, colU, rowT))) {
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

  /** Split a leaf into 4 children. */
  private split(level: number, iu: number, it: number): void {
    this.removeLeaf(level, iu, it);
    const cl = level + 1;
    const bu = iu * 2;
    const bt = it * 2;
    this.addLeaf(cl, bu, bt);
    this.addLeaf(cl, bu + 1, bt);
    this.addLeaf(cl, bu, bt + 1);
    this.addLeaf(cl, bu + 1, bt + 1);
  }

  private rebuildCells(): void {
    this.cells = [];
    for (const key of this.leafSet) {
      const [l, u, t] = key.split(':');
      this.cells.push({ level: Number(l), iu: Number(u), it: Number(t) });
    }
  }

  // ----- public API -------------------------------------------------------

  /** Number of leaf cells (cheap — no array materialization). */
  leafCount(): number {
    return this.leafSet.size;
  }

  /** All leaf cells in physical-parameter terms. */
  leaves(): QuadLeaf[] {
    if (this.cells.length === 0 && this.leafSet.size > 0) this.rebuildCells();
    return this.cells.map((c) => ({
      u0: c.iu / (1 << c.level),
      t0: c.it / (1 << c.level),
      level: c.level,
    }));
  }

  /** Neighbour leaves across each of the 4 sides (u-sides wrap). */
  neighbors(leaf: QuadLeaf): { side: QuadSide; leaf: QuadLeaf }[] {
    const level = leaf.level;
    const iu = Math.round(leaf.u0 * (1 << level));
    const it = Math.round(leaf.t0 * (1 << level));
    const out: { side: QuadSide; leaf: QuadLeaf }[] = [];
    const sides: QuadSide[] = ['uMinus', 'uPlus', 'tMinus', 'tPlus'];
    for (const side of sides) {
      for (const c of this.neighbourCells(level, iu, it, side)) {
        out.push({
          side,
          leaf: {
            u0: c.iu / (1 << c.level),
            t0: c.it / (1 << c.level),
            level: c.level,
          },
        });
      }
    }
    return out;
  }

  /**
   * All existing leaf cells bordering `side` of (level,iu,it): the same-level
   * leaf, a coarser ancestor, or several finer leaves along the shared edge.
   */
  private neighbourCells(
    level: number,
    iu: number,
    it: number,
    side: QuadSide,
  ): Cell[] {
    const span = 1 << level;
    let au = iu;
    let at = it;
    if (side === 'uMinus') au = (iu - 1 + span) % span;
    else if (side === 'uPlus') au = (iu + 1) % span;
    else if (side === 'tMinus') at = it - 1;
    else at = it + 1;
    if (at < 0 || at >= span) return []; // domain boundary in t

    // Same level?
    if (this.leafSet.has(cellKey(level, au, at))) {
      return [{ level, iu: au, it: at }];
    }
    // Coarser ancestor?
    let cl = level - 1;
    let cu = au >> 1;
    let ct = at >> 1;
    while (cl >= 0) {
      if (this.leafSet.has(cellKey(cl, cu, ct))) {
        return [{ level: cl, iu: cu, it: ct }];
      }
      cl -= 1;
      cu >>= 1;
      ct >>= 1;
    }
    // Otherwise finer leaves along the shared edge.
    const found: Cell[] = [];
    for (let lv = level + 1; lv <= this.maxLevel; lv++) {
      const f = lv - level;
      const mul = 1 << f;
      const baseU = au * mul;
      const baseT = at * mul;
      if (side === 'uMinus' || side === 'uPlus') {
        const colU = side === 'uPlus' ? baseU : baseU + mul - 1;
        for (let k = 0; k < mul; k++) {
          if (this.leafSet.has(cellKey(lv, colU, baseT + k))) {
            found.push({ level: lv, iu: colU, it: baseT + k });
          }
        }
      } else {
        const rowT = side === 'tPlus' ? baseT : baseT + mul - 1;
        for (let k = 0; k < mul; k++) {
          const colU = (baseU + k) % (1 << lv);
          if (this.leafSet.has(cellKey(lv, colU, rowT))) {
            found.push({ level: lv, iu: colU, it: rowT });
          }
        }
      }
      if (found.length > 0) break;
    }
    return found;
  }
}
