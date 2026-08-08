// s119CliffLib.ts — S119 TASK 3: THE CLIFF-AWARE POSITION REFERENCE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// 1. THE SURFACE MODEL, STATED PRECISELY
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The campaign's position ruler scores a facet against the GRAPH of rA:
//        G  =  { ( rA(t,z) cos t , rA(t,z) sin t , z ) : t in [0,2pi), z in [0,H] }.
// That is the WRONG reference for a style whose rA is discontinuous, and S118 proved it empirically
// (a point placed exactly half way up CelticTriquetra's 1.720469 mm cliff reads 847.437 um, and the
// reading is LINEAR IN HEIGHT UP THE CLIFF: 423.698 at a quarter, 169.475 at a tenth, 33.894 at 2%).
// It is wrong because G is not the boundary of the solid the mesh is a boundary OF.
//
// THE SOLID. The driver's own model of the pot is the radially star-shaped region
//        Omega  =  { (rho cos t, rho sin t, z) : 0 <= rho <= rA(t,z), 0 <= z <= H }.
// THE MODEL USED HERE — the topological boundary of that solid, minus the caps:
//        S*  =  { (rho cos t, rho sin t, z) : rho in [ r_inf(t,z) , r_sup(t,z) ] }
// where r_inf / r_sup are the LOWER and UPPER semicontinuous envelopes of rA,
//        r_inf(t,z) = liminf_(t',z')->(t,z) rA(t',z') ,  r_sup(t,z) = limsup_(t',z')->(t,z) rA(t',z').
// Wherever rA is continuous r_inf = r_sup = rA and S* is exactly the graph G. On the discontinuity set
// Sigma = { (t,z) : r_inf < r_sup } the model adds the CURTAIN: the radial segment spanning the jump.
//
// WHY THE CURTAIN IS GENUINELY BOUNDARY (the justification, not an assertion). Take Q on the curtain at
// (t*,z*) with r_inf < rho_Q < r_sup. Every neighbourhood of (t*,z*) contains parameters with
// rA > rho_Q (so the corresponding points at radius rho_Q are INTERIOR to Omega) and parameters with
// rA < rho_Q (so those points are EXTERIOR). Hence Q is a limit of interior points and of exterior
// points: Q lies in the topological boundary of Omega. A closed solid has no hole, so ANY watertight
// mesh of Omega must contain facets that span the curtain — and scoring those facets against G alone
// asks them to be near a set that provably does not contain the boundary they are approximating.
//
// GEOMETRY OF THE CURTAIN. Sigma is a 1-dimensional set in the (t,z) chart (for CelticTriquetra it is
// the three medallion sector rays of `ctTriquetraHeight`, src/geometry/styles.ts:2263). The curtain is
// therefore Sigma x [r_inf, r_sup]: a RULED surface swept by a radial segment along a parameter curve.
// It is NOT necessarily vertical. Where Sigma runs at constant z the curtain is a HORIZONTAL ANNULAR
// LEDGE — which is exactly what the driver's `stitchRings` calls a TREAD. The model unifies the two:
// treads are curtain, not a separate unscoreable class, wherever they sit over Sigma.
//
// THE LIMITS OF THE MODEL — stated because they bound every number produced with it:
//   L1. SINGLE-VALUED rA ONLY. A genuinely multi-sheeted wall (over/under weave) is not a radial graph
//       and neither G nor S* describes it. Out of scope, same scope as the projector being corrected.
//   L2. CAPS ARE NOT IN S*. The z=0 and z=H disks are boundary of Omega but are not lateral surface;
//       facets lying in them are reported as a SEPARATE CLASS, never folded in (the S103 precedent).
//   L3. Sigma IS LOCATED NUMERICALLY, NOT SYMBOLICALLY. A jump smaller than `minJump` is not located.
//       That is BOUNDED, not unbounded: ignoring a seam of jump J over-reads a point by AT MOST J/2,
//       because the closure of G already contains both one-sided limit radii at that parameter, so any
//       curtain point is within J/2 of G. Run with minJump = 2 x (the smallest bar you quote) and the
//       omission cannot move a verdict by more than that bar.
//   L4. Sigma IS ASSUMED LOCALLY A CURVE, of curvature radius large against the local window. A
//       2-dimensional discontinuity set (rA discontinuous on a patch) is outside the model.
//   L5. The ruler returns an UPPER BOUND on dist(P, S*), never an under-reading: every value it returns
//       is realised by an ACTUAL point of S* (a polished graph foot, or a located curtain segment).
//       It therefore cannot falsely certify a bad mesh; it can only fail to notice that a mesh is even
//       better than it says.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// 2. HOW THE DISTANCE IS COMPUTED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//        dist(P, S*)  =  min( dist(P, G) , dist(P, curtain) ).
// dist(P,G) is the existing perpendicular projector (buildRadialSurfaceProjector) — unchanged, so that
// on a continuous style the cliff ruler IS the old ruler, bit for bit.
// dist(P, curtain) is computed in two tiers, and the tiering is SOUND rather than sampled:
//   TIER 1 — THE TABLE (rejection). Sigma is sampled by two transverse families: every z-level of a grid
//     of spacing dz, and every theta-value of a grid of spacing dTh. Between two consecutive samples
//     along Sigma the curve crosses NO z-level and NO theta-value, so the parametric chord is bounded by
//     hypot(dz, rMax*dTh) — a bound by CONSTRUCTION, not an observed statistic. Every table entry is an
//     exact point of the curtain, so the table min is a valid UPPER bound. If it exceeds the threshold
//     that currently matters plus the stated margin, no curtain point can matter and the point is
//     rejected — PROVEN irrelevant, not sampled away.
//   TIER 2 — THE LOCAL WINDOW. For the survivors, rA is evaluated on a (k+1)^2 grid over the parametric
//     window |dz| <= W, rho*|dt| <= W and every adjacent pair straddling a jump is bisected to the f64
//     limit. Any curtain point within 3D distance W of P has |dz| <= W and rho*|sin dt| <= W, so it lies
//     in that window; a curve crossing the window separates two adjacent grid nodes unless it only clips
//     one corner cell, and a corner cell of a k>=8 grid is farther than W from the centre. So the window
//     SEES every curtain point that could matter.
//     It does not LOCATE it exactly in one pass: the crossings it finds sit on grid lines, so a single
//     window over-reads by at most (cell/2)*(1+L_r), L_r bounding how fast the two limit radii move
//     along Sigma. `curtainDist` therefore runs a LADDER of windows, each sized to the best value found
//     so far, which drives that term down geometrically. The residual is not assumed — the tool's C3R
//     control re-runs a sample at k=64 x 8 windows and prints both the worst value change and the number
//     of verdict flips at the bars, so the discretisation is a MEASURED quantity in every report.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// 3. VALIDATION — TWO-SIDED, BEFORE USE
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// research/bridge/_s119CliffRuler.test.ts pins this module against a CLOSED-FORM cliff fixture whose
// exact distance function is written out independently (two cylinder patches + two flat radial curtains).
// A ruler that returned 0 everywhere would pass a "facets on the curtain read 0" test, so BOTH sides are
// asserted: on-curtain probes read ~0 AND off-surface probes reproduce the closed form. The fixture also
// asserts that the GRAPH-ONLY ruler reads ~jump/2 on the on-curtain probes, i.e. that the fixture really
// does reproduce the pathology being corrected.
export interface SeamSample {
  /** azimuth of the seam, rad (canonical [0,2pi)) */
  th: number;
  /** height of the seam, mm */
  z: number;
  /** lower one-sided limit of rA at the seam, mm */
  rLo: number;
  /** upper one-sided limit of rA at the seam, mm */
  rHi: number;
}

export type RadiusFn = (th: number, z: number) => number;

/** Exact distance from P to the curtain's radial segment at parameter (th,z). */
export function segDist(
  px: number, py: number, pz: number,
  th: number, z: number, rLo: number, rHi: number,
): number {
  const c = Math.cos(th); const s = Math.sin(th);
  const t = px * c + py * s;
  const tc = t < rLo ? rLo : t > rHi ? rHi : t;
  const dx = px - tc * c; const dy = py - tc * s; const dz = pz - z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Bisect a bracket that straddles a jump, along one axis, to the f64 limit.
 * Returns the surviving rise; a merely-steep bracket loses its rise and is rejected by the caller.
 *
 * EARLY REJECTION, and why it is safe. At each step the half with the LARGER endpoint difference is
 * kept, so a bracket that really contains a jump J keeps a rise of at least J minus the smooth variation
 * over the surviving half — a quantity that only shrinks. A merely-steep bracket's rise halves every
 * step. So once the rise has fallen below `rejectBelow` (half the acceptance threshold) after a few
 * steps, no continuation can bring it back above the acceptance threshold, and the bracket is abandoned.
 * On CelticTriquetra this is the difference between ~60 and ~8 rA calls on the overwhelming majority of
 * brackets, which are steep-but-continuous (165,845 of them in one S118 scan alone).
 */
function bisectJump(
  rA: RadiusFn, axis: 'th' | 'z', fixed: number, a0: number, b0: number, rejectBelow = 0,
): { p: number; rL: number; rR: number; rise: number } {
  let a = a0; let b = b0;
  let rL = axis === 'th' ? rA(a, fixed) : rA(fixed, a);
  let rR = axis === 'th' ? rA(b, fixed) : rA(fixed, b);
  for (let it = 0; it < 200; it += 1) {
    if (it >= 3 && Math.abs(rR - rL) < rejectBelow) break;
    const mid = 0.5 * (a + b);
    if (mid === a || mid === b) break;
    const rm = axis === 'th' ? rA(mid, fixed) : rA(fixed, mid);
    if (Math.abs(rm - rL) >= Math.abs(rR - rm)) { b = mid; rR = rm; } else { a = mid; rL = rm; }
  }
  return { p: 0.5 * (a + b), rL, rR, rise: Math.abs(rR - rL) };
}

export interface SeamScanOpts {
  H: number;
  /** number of z LEVELS in family A (spacing dz = H/nZlev) */
  nZlev: number;
  /** theta samples used to bracket jumps inside one family-A level */
  nThScan: number;
  /** number of theta VALUES in family B (spacing dTh = 2pi/nThVal) */
  nThVal: number;
  /** z samples used to bracket jumps inside one family-B column */
  nZscan: number;
  /** smallest jump located, mm. Ignoring a seam of jump J over-reads by at most J/2 (L3). */
  minJump: number;
  /** largest radius the surface reaches, mm (turns dTh into an arc-length spacing) */
  rMax: number;
}

export interface SeamScanResult {
  samples: SeamSample[];
  /** brackets that looked like a jump but lost their rise under bisection */
  steepRejected: number;
  dzMm: number;
  duMm: number;
  /** by construction: max parametric chord between consecutive samples along Sigma */
  spacingBound: number;
  nFamA: number;
  nFamB: number;
}

/**
 * Locate the discontinuity set by TWO TRANSVERSE FAMILIES (see TIER 1 above).
 *
 * `nThScan` / `nZscan` set only whether a jump is BRACKETED; `nZlev` / `nThVal` set the along-curve
 * spacing bound. They are separate knobs because they buy different things and the bound must not be
 * quietly inherited from the scan density.
 */
export function scanSeams(rA: RadiusFn, o: SeamScanOpts): SeamScanResult {
  const TAU = 2 * Math.PI;
  const out: SeamSample[] = [];
  let steep = 0;
  const half = 0.4 * o.minJump; // bracket on a LOWER threshold than acceptance, so partial cancellation
  // inside a bracket cannot hide a genuine jump; the bisection is what decides.
  let nA = 0; let nB = 0;
  // ── family A: fixed z, scan theta ──
  for (let j = 0; j <= o.nZlev; j += 1) {
    const z = (j / o.nZlev) * o.H;
    let prevT = 0; let prevR = rA(0, z);
    for (let i = 1; i <= o.nThScan; i += 1) {
      const th = (i / o.nThScan) * TAU;
      const r = rA(th, z);
      if (Math.abs(r - prevR) > half) {
        const b = bisectJump(rA, 'th', z, prevT, th, 0.5 * o.minJump);
        if (b.rise > o.minJump) {
          out.push({ th: b.p, z, rLo: Math.min(b.rL, b.rR), rHi: Math.max(b.rL, b.rR) }); nA += 1;
        } else steep += 1;
      }
      prevT = th; prevR = r;
    }
  }
  // ── family B: fixed theta, scan z ──
  for (let i = 0; i < o.nThVal; i += 1) {
    const th = (i / o.nThVal) * TAU;
    let prevZ = 0; let prevR = rA(th, 0);
    for (let j = 1; j <= o.nZscan; j += 1) {
      const z = (j / o.nZscan) * o.H;
      const r = rA(th, z);
      if (Math.abs(r - prevR) > half) {
        const b = bisectJump(rA, 'z', th, prevZ, z, 0.5 * o.minJump);
        if (b.rise > o.minJump) {
          out.push({ th, z: b.p, rLo: Math.min(b.rL, b.rR), rHi: Math.max(b.rL, b.rR) }); nB += 1;
        } else steep += 1;
      }
      prevZ = z; prevR = r;
    }
  }
  const dz = o.H / o.nZlev;
  const du = (TAU * o.rMax) / o.nThVal;
  return { samples: out, steepRejected: steep, dzMm: dz, duMm: du, spacingBound: Math.hypot(dz, du), nFamA: nA, nFamB: nB };
}

/**
 * A bucket index over the seam table, in (theta, z).
 *
 * `nearest` returns the smallest distance from P to a TABLE segment, or Infinity if none is within
 * `uBound`. Because every table entry is an exact curtain point, a finite return value is a valid UPPER
 * bound on dist(P, curtain); an Infinity return means only "none within uBound", never "no curtain".
 */
export class SeamIndex {
  readonly samples: SeamSample[];
  readonly cell: number;
  readonly spacingBound: number;
  private readonly rMax: number;
  private readonly map: Map<number, Int32Array>;
  private readonly nThCells: number;

  constructor(samples: SeamSample[], cellMm: number, rMax: number, spacingBound: number) {
    this.samples = samples;
    this.cell = cellMm;
    this.rMax = rMax;
    this.spacingBound = spacingBound;
    this.nThCells = Math.max(1, Math.ceil((2 * Math.PI * rMax) / cellMm));
    const tmp = new Map<number, number[]>();
    for (let i = 0; i < samples.length; i += 1) {
      const k = this.keyOf(samples[i].th, samples[i].z);
      let l = tmp.get(k); if (l === undefined) { l = []; tmp.set(k, l); }
      l.push(i);
    }
    this.map = new Map();
    for (const [k, l] of tmp) this.map.set(k, Int32Array.from(l));
  }

  private thCell(th: number): number {
    let t = th % (2 * Math.PI); if (t < 0) t += 2 * Math.PI;
    const c = Math.floor((t / (2 * Math.PI)) * this.nThCells);
    return c >= this.nThCells ? this.nThCells - 1 : c;
  }

  private keyOf(th: number, z: number): number {
    return this.thCell(th) * 1048576 + (Math.floor(z / this.cell) + 4096);
  }

  /** min over table segments, searching only cells that can hold a segment within `uBound`. */
  nearest(px: number, py: number, pz: number, uBound: number): number {
    if (this.samples.length === 0 || !(uBound > 0)) return Infinity;
    const rho = Math.hypot(px, py);
    let best = Infinity;
    const dThRad = rho > uBound ? Math.asin(uBound / rho) : Math.PI;
    const th0 = Math.atan2(py, px);
    const nzc = Math.ceil(uBound / this.cell) + 1;
    const ntc = Math.min(this.nThCells, Math.ceil((dThRad * this.rMax) / this.cell) + 1);
    const zc0 = Math.floor(pz / this.cell);
    const tc0 = this.thCell(th0);
    for (let dt = -ntc; dt <= ntc; dt += 1) {
      let tc = (tc0 + dt) % this.nThCells; if (tc < 0) tc += this.nThCells;
      for (let dzc = -nzc; dzc <= nzc; dzc += 1) {
        const l = this.map.get(tc * 1048576 + (zc0 + dzc + 4096));
        if (l === undefined) continue;
        for (let q = 0; q < l.length; q += 1) {
          const s = this.samples[l[q]];
          const d = segDist(px, py, pz, s.th, s.z, s.rLo, s.rHi);
          if (d < best) best = d;
        }
      }
    }
    return best <= uBound ? best : Infinity;
  }
}

export interface WindowResult {
  /** exact min distance to any curtain point inside the window, or Infinity */
  d: number;
  /** how many seam crossings the window located */
  found: number;
  /** rA evaluations spent */
  calls: number;
}

/**
 * TIER 2 — the local window. See the header for why the window and the grid are sufficient to SEE every
 * curtain point that could matter. `W` is the 3D radius that matters: any curtain point closer than W to
 * P lies inside the window.
 *
 * ACCURACY. The seam points it returns sit on GRID LINES, so a single call over-reads the true curtain
 * distance by at most (cell/2)*(1 + L_r), where L_r bounds how fast the jump's two limit radii move
 * along Sigma. `curtainDist` therefore calls this repeatedly with a shrinking window, which drives that
 * term down geometrically; the residual is measured, not assumed (see the ruler tool's REFINE control).
 */
export function curtainWindow(
  rA: RadiusFn, px: number, py: number, pz: number,
  W: number, minJump: number, H: number, k: number,
): WindowResult {
  const rho = Math.hypot(px, py);
  if (!(W > 0) || rho <= 0) return { d: Infinity, found: 0, calls: 0 };
  const dTh = rho > W ? Math.asin(W / rho) : Math.PI;
  const th0 = Math.atan2(py, px);
  const zLo = Math.max(0, pz - W); const zHi = Math.min(H, pz + W);
  if (!(zHi > zLo)) return { d: Infinity, found: 0, calls: 0 };
  const n = k + 1;
  const g = new Float64Array(n * n);
  const ths = new Float64Array(n); const zs = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    ths[i] = th0 - dTh + (2 * dTh * i) / k;
    zs[i] = zLo + ((zHi - zLo) * i) / k;
  }
  for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) g[i * n + j] = rA(ths[i], zs[j]);
  let calls = n * n;
  let best = Infinity; let found = 0;
  const half = 0.4 * minJump;
  const take = (b: { p: number; rL: number; rR: number; rise: number }, th: number, z: number): void => {
    if (b.rise <= minJump) return;
    found += 1;
    const d = segDist(px, py, pz, th, z, Math.min(b.rL, b.rR), Math.max(b.rL, b.rR));
    if (d < best) best = d;
  };
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      if (i + 1 < n && Math.abs(g[(i + 1) * n + j] - g[i * n + j]) > half) {
        const b = bisectJump(rA, 'th', zs[j], ths[i], ths[i + 1], 0.5 * minJump); calls += 60;
        take(b, b.p, zs[j]);
      }
      if (j + 1 < n && Math.abs(g[i * n + j + 1] - g[i * n + j]) > half) {
        const b = bisectJump(rA, 'z', ths[i], zs[j], zs[j + 1], 0.5 * minJump); calls += 60;
        take(b, ths[i], b.p);
      }
    }
  }
  return { d: best, found, calls };
}

export interface CurtainOpts {
  H: number;
  minJump: number;
  /** rejection margin added to the table bound; see TIER 1. Must cover (1+L_r)*spacingBound/2. */
  margin: number;
  /** grid order inside one window (k+1)^2 nodes */
  refineK: number;
  /** how many shrinking windows to run */
  refineIters: number;
}

export interface CurtainStat { tableCalls: number; tableHits: number; windows: number; rAcalls: number }

export function newCurtainStat(): CurtainStat { return { tableCalls: 0, tableHits: 0, windows: 0, rAcalls: 0 }; }

/**
 * dist(P, curtain) as an UPPER BOUND, using TIER 1 only to prove that TIER 2 is unnecessary.
 * `uBound` is any known upper bound on the answer that matters (e.g. R1, or the running max).
 * Returns Infinity when no curtain point is within `uBound` (+ margin).
 *
 * Every value returned is realised by a located curtain segment, so it can never UNDER-read.
 */
export function curtainDist(
  rA: RadiusFn, idx: SeamIndex, px: number, py: number, pz: number, uBound: number,
  o: CurtainOpts, st: CurtainStat,
): number {
  if (idx.samples.length === 0) return Infinity;
  st.tableCalls += 1;
  const tbl = idx.nearest(px, py, pz, uBound + o.margin);
  if (!Number.isFinite(tbl)) return Infinity;
  st.tableHits += 1;
  let best = tbl;
  let W = Math.min(uBound, tbl) * (1 + 1e-9);
  for (let it = 0; it < o.refineIters; it += 1) {
    const w = curtainWindow(rA, px, py, pz, W, o.minJump, o.H, o.refineK);
    st.windows += 1; st.rAcalls += w.calls;
    if (!Number.isFinite(w.d)) break;
    if (w.d < best) best = w.d;
    const nw = best * (1 + 1e-9);
    if (!(nw < W * 0.999)) break;
    W = nw;
  }
  return best;
}
