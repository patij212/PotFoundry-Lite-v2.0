/**
 * noBridgeRefine.ts — the Tier-C fidelity core: no-bridge crest lock + the
 * whole-mesh honest-brute interior refinement loop.
 *
 * Port of research/bridge/_pf_perfectMesherBruteLib refineInteriorBruteWhole
 * (VALIDATION 7: drove Gothic 32→0 and GeoStar 791→0 residuals to LITERAL
 * whole-mesh 0 interior outliers, watertight, flat-P1). Mechanism:
 *
 *  - NO-BRIDGE: the protected complex's constraint edges are passed to cdt2d
 *    and re-passed unchanged on every re-triangulation, so every crest chain
 *    is a set of SHARED mesh edges — two flank facets meet AT the ridge and
 *    no facet interior straddles the zero-width cusp.
 *  - WHOLE-MESH stop driver: EVERY facet is scored EVERY pass (never an
 *    active-cavity restriction — that hid moderate-gradU residuals). PHASE A
 *    uses the cheap 7-pt lattice to converge the dense near-crest tail;
 *    PHASE B switches to the dense 45-pt lattice == the acceptance guard, so
 *    the loop can SEE everything the guard measures. Convergence only counts
 *    under the dense driver.
 *  - Edge-mode RED 1→4 insertion: outlier facets split at all three edge
 *    midpoints (in-chart, lifted on-surface), so a persistent apex facet
 *    converges geometrically; crest-edge midpoints are themselves on the
 *    crest (the constraint set keeps them locked).
 *  - Cap-hit facets remain outliers — honest; the caller's guard decides.
 *
 * @module conforming/tierC/noBridgeRefine
 */

import cdt2d from 'cdt2d';
import type { SurfaceSampler } from '../SurfaceSampler';
import type { ProtectedComplex } from './morseComplex';
import {
  BARY_STOP,
  DEFAULT_RULER,
  denseBary,
  facetInteriorHonest,
  liftChartMesh,
  radialSurfaceFromSampler,
  type ChartMesh,
  type RulerOptions,
} from './interiorRuler';

/** A rectangular chart domain (u in [0,1) fractions, t in [0,1]). */
export interface ChartDomain {
  uLo: number;
  uHi: number;
  tLo: number;
  tHi: number;
}

export interface RefineOptions {
  tolMm: number;
  maxPass: number;
  /** PHASE-A passes on the cheap 7-pt driver before the dense driver. */
  bulkPasses7pt: number;
  /** Background seed grid pitch (mm of 3D arc). */
  bgArcMm: number;
  /** Max 3D pitch (mm) constraint chains are densified to (default 0.15). */
  maxConstraintMm?: number;
  ruler: RulerOptions;
  /**
   * Cross-pass DIRTY-FACET cache (default off; opt-in perf lever). A facet
   * whose canonical (u,t) signature (its 3 sorted vertex coords) is UNCHANGED
   * since a prior pass under the SAME lattice reuses its cached dev verdict —
   * the ruler is a pure function of the 3 (u,t) pairs + lattice + opts, so the
   * cached verdict is EXACT. Only unchanged facets hit; every re-triangulated
   * facet is re-scored. Byte-identical trajectory (outliers/worst/inserted/
   * tris per pass identical); only the diagnostic `bruteCalls` counter drops
   * (cached facets legitimately do no brute work — that IS the speedup).
   * A per-pass hit rate is reported via `cacheHits`/`cacheChecks` in the stat.
   */
  dirtyFacetCache?: boolean;
}

export interface RefinePassStat {
  pass: number;
  nTris: number;
  outliers: number;
  worstMm: number;
  inserted: number;
  bruteCalls: number;
  dense: boolean;
  ms: number;
  /** Dirty-cache: facets whose verdict was reused this pass (0 when off). */
  cacheHits?: number;
  /** Dirty-cache: facets checked against the cache this pass (0 when off). */
  cacheChecks?: number;
}

export interface RefineResult extends ChartMesh {
  passes: number;
  capped: boolean;
  history: RefinePassStat[];
  constraintEdges: Array<[number, number]>;
}

const DEDUPE_CELL_MM = 0.004;

/**
 * Default constraint-chain 3D pitch (mm). Detector chains arrive at fine-cell
 * pitch (Gothic p50 0.99mm / p90 3.36mm / max 59mm — probe _tierc_constraintLen);
 * cdt2d cannot split a locked edge, so a long constraint edge floors every
 * crest-adjacent facet at ~L²κ/8 (a 1mm chord on a rib ≈ 0.4mm — the measured
 * plateau). Densifying to this pitch matches the research kernel's ~0.1mm
 * analytic crest chains and lets the crest refine along its length.
 */
const MAX_CONSTRAINT_MM = 0.15;

/**
 * Seed the chart mesh: protected-complex vertices (converted mm → chart) with
 * their constraint edges LOCKED (the complex is already dense + on-ridge +
 * planar from morseComplex; a straight belt-and-suspenders densification to
 * `maxConstraintMm` only splits any coarse chain — never re-snaps, which
 * would break planarity), plus a uniform background grid at bgArcMm pitch
 * over the domain, CDT'd in mm space (isotropic predicates).
 */
export function seedFromComplex(
  complex: ProtectedComplex,
  domain: ChartDomain,
  bgArcMm: number,
  sampler?: SurfaceSampler,
  maxConstraintMm = MAX_CONSTRAINT_MM,
): { uv: number[]; cEdges: Array<[number, number]> } {
  const { uToMm, tToMm } = complex;
  const uv: number[] = [];
  const cEdges: Array<[number, number]> = [];
  const idMap = new Map<number, number>(); // complex vertex → seed vertex
  const inDomain = (u: number, t: number): boolean =>
    u >= domain.uLo - 1e-9 &&
    u <= domain.uHi + 1e-9 &&
    t >= domain.tLo - 1e-9 &&
    t <= domain.tHi + 1e-9;
  // Border-crossing constraint segments are CLIPPED AT the boundary (an
  // interpolated boundary vertex; interior portion kept + locked), NEVER
  // dropped. Dropping them leaves an UNPROTECTED crest stub inside the
  // domain — facets bridge the unlocked cusp and the refine loop stalls at
  // an irreducible ~0.4mm floor (MEASURED: full Gothic gate capped at pass
  // 16 with ~295 outliers, worst 0.40, insertions a no-op).
  const clipToDomain = (
    pu: number,
    pt: number,
    qu: number,
    qt: number,
  ): [number, number] | null => {
    // p is inside; slide q toward p until inside (param clip per axis).
    let s = 1;
    if (qu < domain.uLo) s = Math.min(s, (domain.uLo - pu) / (qu - pu));
    if (qu > domain.uHi) s = Math.min(s, (domain.uHi - pu) / (qu - pu));
    if (qt < domain.tLo) s = Math.min(s, (domain.tLo - pt) / (qt - pt));
    if (qt > domain.tHi) s = Math.min(s, (domain.tHi - pt) / (qt - pt));
    if (!(s > 1e-6)) return null; // degenerate sliver at the border
    return [pu + s * (qu - pu), pt + s * (qt - pt)];
  };
  const addVert = (u: number, t: number, complexId?: number): number => {
    if (complexId !== undefined) {
      const hit = idMap.get(complexId);
      if (hit !== undefined) return hit;
    }
    const id = uv.length / 2;
    uv.push(u, t);
    if (complexId !== undefined) idMap.set(complexId, id);
    return id;
  };
  const pos3D = (u: number, t: number): [number, number, number] =>
    sampler
      ? sampler.position(((u % 1) + 1) % 1, Math.min(1, Math.max(0, t)))
      : [u * uToMm, t * tToMm, 0];
  // The complex is already dense (≤0.15mm) + on-ridge + planar (morseComplex
  // densifies+snaps BEFORE planarizeMM — snapping HERE, post-planarization,
  // re-introduces crossings and cdt2d throws `upperIds`). This is a STRAIGHT,
  // collinear densification only (planarity-safe — collinear points on a
  // non-crossing segment add no crossings): a belt-and-suspenders splitter in
  // case a chain arrives coarse. NEVER snap here.
  const pushConstraint = (ia: number, ib: number): void => {
    const au = uv[2 * ia];
    const atv = uv[2 * ia + 1];
    const bu = uv[2 * ib];
    const bt = uv[2 * ib + 1];
    const A = pos3D(au, atv);
    const B = pos3D(bu, bt);
    const len3 = Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
    const nSeg = Math.max(1, Math.ceil(len3 / maxConstraintMm));
    let prev = ia;
    for (let s = 1; s < nSeg; s++) {
      const f = s / nSeg;
      const mid = addVert(au + f * (bu - au), atv + f * (bt - atv));
      if (mid !== prev) cEdges.push([prev, mid]);
      prev = mid;
    }
    if (prev !== ib) cEdges.push([prev, ib]);
  };
  for (const [a, b] of complex.edges) {
    const ua = complex.vertices[2 * a] / uToMm;
    const ta = complex.vertices[2 * a + 1] / tToMm;
    const ub = complex.vertices[2 * b] / uToMm;
    const tb = complex.vertices[2 * b + 1] / tToMm;
    const aIn = inDomain(ua, ta);
    const bIn = inDomain(ub, tb);
    if (!aIn && !bIn) continue; // fully outside (border-to-border spans are rare noise)
    if (aIn && bIn) {
      pushConstraint(addVert(ua, ta, a), addVert(ub, tb, b));
      continue;
    }
    // One endpoint outside: keep the interior portion up to the boundary.
    const [pu, pt, pid, qu, qt] = aIn
      ? ([ua, ta, a, ub, tb] as const)
      : ([ub, tb, b, ua, ta] as const);
    const clipped = clipToDomain(pu, pt, qu, qt);
    if (clipped === null) continue;
    pushConstraint(addVert(pu, pt, pid), addVert(clipped[0], clipped[1]));
  }
  // Background grid (dedupe against existing points on a fine mm lattice).
  const pmap = new Map<number, number>();
  const keyOf = (u: number, t: number): number =>
    Math.round((u * uToMm) / DEDUPE_CELL_MM) * 100000 +
    Math.round((t * tToMm) / DEDUPE_CELL_MM);
  for (let i = 0; i < uv.length / 2; i++) {
    const k = keyOf(uv[2 * i], uv[2 * i + 1]);
    if (!pmap.has(k)) pmap.set(k, i);
  }
  const nu = Math.max(8, Math.round(((domain.uHi - domain.uLo) * uToMm) / bgArcMm));
  const nt = Math.max(8, Math.round(((domain.tHi - domain.tLo) * tToMm) / bgArcMm));
  for (let i = 0; i <= nu; i++) {
    for (let k = 0; k <= nt; k++) {
      const u = domain.uLo + (domain.uHi - domain.uLo) * (i / nu);
      const t = domain.tLo + (domain.tHi - domain.tLo) * (k / nt);
      const key = keyOf(u, t);
      if (pmap.has(key)) continue;
      pmap.set(key, uv.length / 2);
      uv.push(u, t);
    }
  }
  return { uv, cEdges };
}

/** mm-scaled chart CDT with locked constraint edges. */
function triangulateMM(
  uv: number[],
  uToMm: number,
  tToMm: number,
  cEdges: Array<[number, number]>,
): number[] {
  const nV = uv.length / 2;
  const pts: Array<[number, number]> = new Array<[number, number]>(nV);
  for (let i = 0; i < nV; i++) {
    pts[i] = [uv[2 * i] * uToMm, uv[2 * i + 1] * tToMm];
  }
  const t = cdt2d(pts, cEdges, { exterior: true }) as number[][];
  const out: number[] = [];
  for (const tr of t) out.push(tr[0], tr[1], tr[2]);
  return out;
}

/**
 * The whole-mesh honest-brute refine loop (see module doc). Returns the
 * refined chart mesh; `capped` is true when the pass budget ran out with
 * outliers remaining (the caller's mandatory guard then fails, honestly).
 */
export function refineToZeroOutliers(
  sampler: SurfaceSampler,
  complex: ProtectedComplex,
  domain: ChartDomain,
  opts: RefineOptions,
  onPass?: (s: RefinePassStat) => void,
): RefineResult {
  const surface = radialSurfaceFromSampler(sampler);
  const { uToMm, tToMm } = complex;
  const seed = seedFromComplex(
    complex,
    domain,
    opts.bgArcMm,
    sampler,
    opts.maxConstraintMm,
  );
  let uv = seed.uv.slice();
  const cEdges = seed.cEdges;
  let tris = triangulateMM(uv, uToMm, tToMm, cEdges);

  const pmap = new Map<number, number>();
  const keyOf = (u: number, t: number): number =>
    Math.round(((((u % 1) + 1) % 1) * uToMm) / DEDUPE_CELL_MM) * 100000 +
    Math.round((t * tToMm) / DEDUPE_CELL_MM);
  const rehash = (): void => {
    pmap.clear();
    for (let i = 0; i < uv.length / 2; i++) {
      const k = keyOf(uv[2 * i], uv[2 * i + 1]);
      if (!pmap.has(k)) pmap.set(k, i);
    }
  };
  const addPt = (u: number, t: number): number => {
    const k = keyOf(u, t);
    const hit = pmap.get(k);
    if (hit !== undefined) return hit;
    const id = uv.length / 2;
    pmap.set(k, id);
    uv.push(u, t);
    return id;
  };

  // CONSTRAINT SUBDIVISION (the full-gate stall fix — the campaign's
  // recoverySubdivideCollinear lesson resurfacing in this port): cdt2d
  // cannot split a locked edge through a vertex collinear-on it, so a
  // crest-adjacent facet bounded by a LONG constraint edge (detector-pitch
  // ~2.4mm vs the ~0.1mm research crest chains) can NEVER refine along the
  // crest — midpoint insertions dedupe-no-op forever (measured: inserted
  // ~850/pass, tris +~120/pass, worst pinned at 0.404). When refinement
  // wants a constraint edge's midpoint, SUBDIVIDE THE CONSTRAINT itself
  // ([a,b] → [a,m],[m,b]) with m RIDGE-SNAPPED along the edge normal so the
  // refined crest follows the true cusp, not the chain's chord.
  const cKey = (a: number, b: number): number =>
    a < b ? a * 1e7 + b : b * 1e7 + a;
  const cMap = new Map<number, number>(); // canonical pair → cEdges index
  for (let i = 0; i < cEdges.length; i++) {
    cMap.set(cKey(cEdges[i][0], cEdges[i][1]), i);
  }
  const dense = denseBary(8);
  const history: RefinePassStat[] = [];
  let capped = false;
  let pass = 0;
  let bulk = opts.bulkPasses7pt;
  // Cross-pass dirty-facet cache (opt-in). The `uv` array only ever GROWS
  // (addPt appends, never reorders), so a vertex index is STABLE across passes
  // and a facet's identity is its sorted (a,b,c) triple. Combined with the
  // lattice phase (dense vs 7-pt) the key uniquely determines the pure ruler
  // verdict ⇒ a hit is EXACT. Cleared when the phase flips (a 7-pt verdict is
  // not valid for a dense query).
  const useCache = opts.dirtyFacetCache === true;
  const devCache = new Map<string, number>();
  let cachePhaseDense: boolean | null = null;
  const facetKey = (a: number, b: number, c: number): string => {
    let x = a;
    let y = b;
    let z = c;
    if (x > y) [x, y] = [y, x];
    if (y > z) [y, z] = [z, y];
    if (x > y) [x, y] = [y, x];
    // Distinct sorted index triple → collision-free (a numeric pack overflows
    // Number.MAX_SAFE_INTEGER at >~10^5 vertices; a string is exact).
    return `${x}_${y}_${z}`;
  };
  for (pass = 1; pass <= opts.maxPass; pass++) {
    const t0 = Date.now();
    const xyz = liftChartMesh(sampler, uv);
    const nF = tris.length / 3;
    const useDense = pass > bulk;
    rehash();
    if (useCache && cachePhaseDense !== useDense) {
      devCache.clear();
      cachePhaseDense = useDense;
    }
    let outliers = 0;
    let worst = 0;
    let bruteCalls = 0;
    let cacheHits = 0;
    let cacheChecks = 0;
    const inserted = new Set<number>();
    for (let f = 0; f < nF; f++) {
      const a = tris[3 * f];
      const b = tris[3 * f + 1];
      const c = tris[3 * f + 2];
      let dev: number;
      if (useCache) {
        cacheChecks++;
        const fk = facetKey(a, b, c);
        const cached = devCache.get(fk);
        if (cached !== undefined) {
          dev = cached;
          cacheHits++;
        } else {
          const g = facetInteriorHonest(
            surface,
            xyz,
            uv,
            a,
            b,
            c,
            useDense ? dense : BARY_STOP,
            opts.ruler,
          );
          bruteCalls += g.bruteCalls;
          dev = g.dev;
          devCache.set(fk, dev);
        }
      } else {
        const g = facetInteriorHonest(
          surface,
          xyz,
          uv,
          a,
          b,
          c,
          useDense ? dense : BARY_STOP,
          opts.ruler,
        );
        bruteCalls += g.bruteCalls;
        dev = g.dev;
      }
      if (dev > worst) worst = dev;
      if (dev > opts.tolMm) {
        outliers++;
        // Edge-mode RED 1→4: seam-consistent corner u's, then all three
        // edge midpoints (in-chart; crest midpoints stay on the crest).
        let ua = uv[2 * a];
        let ub = uv[2 * b];
        let uc = uv[2 * c];
        const ta = uv[2 * a + 1];
        const tb = uv[2 * b + 1];
        const tc = uv[2 * c + 1];
        while (ub - ua > 0.5) ub -= 1;
        while (ua - ub > 0.5) ub += 1;
        while (uc - ua > 0.5) uc -= 1;
        while (ua - uc > 0.5) uc += 1;
        const edges: Array<[number, number, number, number, number, number]> = [
          [a, b, ua, ta, ub, tb],
          [b, c, ub, tb, uc, tc],
          [c, a, uc, tc, ua, ta],
        ];
        for (const [va, vb, eua, eta, eub, etb] of edges) {
          const ck = cKey(va, vb);
          const ci = cMap.get(ck);
          const mu = (eua + eub) / 2;
          const mt = (eta + etb) / 2;
          if (ci !== undefined) {
            // Locked crest edge: cdt2d cannot split it through a collinear
            // point. SUBDIVIDE THE CONSTRAINT at its STRAIGHT midpoint (never
            // snapped — a snapped midpoint moves off the line and can cross a
            // neighbour → cdt2d `upperIds` crash mid-refine; the complex is
            // already on-ridge from morseComplex). Backstop only: the seed is
            // already dense so this rarely fires.
            const k = keyOf(mu, mt);
            if (inserted.has(k)) continue;
            inserted.add(k);
            const mid = addPt(mu, mt);
            if (mid !== va && mid !== vb) {
              // Replace [va,vb] with [va,mid]; append [mid,vb].
              cEdges[ci] = [va, mid];
              cMap.delete(ck);
              cMap.set(cKey(va, mid), ci);
              const ni = cEdges.length;
              cEdges.push([mid, vb]);
              cMap.set(cKey(mid, vb), ni);
            }
          } else {
            const k = keyOf(mu, mt);
            if (!inserted.has(k)) {
              inserted.add(k);
              addPt(mu, mt);
            }
          }
        }
      }
    }
    const stat: RefinePassStat = {
      pass,
      nTris: nF,
      outliers,
      worstMm: worst,
      inserted: inserted.size,
      bruteCalls,
      dense: useDense,
      ms: Date.now() - t0,
      cacheHits,
      cacheChecks,
    };
    history.push(stat);
    if (onPass) onPass(stat);
    // PHASE-A 0-outliers under the cheap driver is NOT convergence — only the
    // dense driver's verdict counts (measured: 7-pt read 0 while the 45-pt
    // guard found 17 on the same mesh).
    if (outliers === 0 && useDense) break;
    if (outliers === 0 && !useDense) {
      bulk = pass; // bulk done early — switch to the dense driver next pass
      continue;
    }
    tris = triangulateMM(uv, uToMm, tToMm, cEdges);
    if (pass === opts.maxPass && outliers > 0) capped = true;
  }
  return { uv, tris, passes: pass, capped, history, constraintEdges: cEdges };
}
