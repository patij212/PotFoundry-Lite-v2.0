// _certComposeLib.ts — PHASE D: the pure composition of a GPU triage screen with a CPU certified confirm.
// RESEARCH ONLY. PURE: no I/O, no globals, no mesh loading, no rA, no GPU — so every claim below is a unit
// test away from being checked, and none of it can drift with the transport.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY A COMPOSITION AT ALL
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// H1 (mesh -> surface) is ~98% of the audit cycle. Every H1 number this campaign has published came from a
// golden-ratio stride walk capped at PF_FT_H1MAX=40000 — 3.17% of `_S24i2` — and therefore travels with two
// caveats that have never been retired: the subset spread between two 3% samples, and the rim row, which
// this campaign already declines to score as wall and which is where the sampled witness keeps landing. A
// full-coverage CPU walk was priced at ~39.8 h and rejected by the operator.
//
// The way out is NOT a cheaper metric. It is to notice that most facets can be certified by a SOUND but
// COARSE instrument, and that only the residue needs the expensive one:
//
//    P_screen : screenBound = mx + covRad/n + margin <= TOL   -> certified BY THE SCREEN
//    P_surv   : everything else                                -> certified BY THE CPU
//    H1_certified = max( max_{P_screen} screenBound , max_{P_surv} cpuBound )
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THE SCREEN'S NUMBER IS A CERTIFICATE AND NOT A HEURISTIC
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// research/gpu/gpuRuler.js computes, per triangle, the max over a barycentric lattice of level `n` of the
// RADIAL-FOOT distance, Gauss-Newton tightened. Three properties, each stated in that file and none of them
// assumed here:
//   (1) the radial foot is a genuine point OF THE SURFACE, so its distance UPPER-bounds dist(p,S);
//   (2) Gauss-Newton returns min(radial, newton) and any surface point is still an upper bound, so a bad
//       step can only fail to help — it can never wave a bad triangle through;
//   (3) dist(.,S) is 1-Lipschitz for ANY set S, so max over the triangle <= max over the lattice + covRad/n.
// Hence `mx + covRad/n + margin` bounds the facet, with `margin` covering f32 and the measured GPU-vs-CPU
// rA disagreement. That is the SAME certificate structure as _facetTruthLib.certifyTriangle's
// `witnessed + covRad/n`, evaluated in f32 at a stated lattice level instead of f64 at an escalating one.
//
// *** THE LEMMA THE WHOLE ARM RESTS ON. *** No facet whose true deviation exceeds TOL can be in P_screen,
// because membership REQUIRES an upper bound <= TOL. So no exceedance can hide in the screened population,
// and taking the WITNESSED max over P_surv alone is sound. `scoreXval` below measures that lemma on a
// control set rather than asserting it — a screen that cannot fail is not an instrument.
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// AND WHY IT CANNOT WEAKEN `judge()`
// ═════════════════════════════════════════════════════════════════════════════════════════════════════════
// `composeH1` returns a plain DirectionReading. `certified` is true because both halves are sound upper
// bounds; `complete` is true ONLY when every facet was accounted for by one half or the other, counted
// explicitly rather than inferred; `witnessedMm` comes from the CPU half alone. judge() is then called
// unmodified, so PASS still requires both directions, full coverage in both, all gates, and a certified
// bound under TOL — and FAIL is still sound from any witnessed exceedance. The one thing that changes is
// that H1's `complete` can be TRUE for the first time on a production mesh.
import type { DirectionReading } from './_judgeVerdict';

const um = (mm: number): string => (Number.isFinite(mm) ? (mm * 1000).toFixed(3) : 'inf');

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE SCREEN'S BOUND — one definition, used by the cascade, by the cross-validation gate and by the report
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * `mx + covRad/n + margin`, in mm. THE ONLY PLACE THIS EXPRESSION EXISTS on the Node side.
 *
 * The cascade, the cross-validation gate and the report all consult it, and a second copy is exactly the
 * defect class this campaign has paid for twice (four copies of a Voronoi hash, one updated; three ufield
 * upload sites, one order). `n` is the lattice level the reading was taken at — passing the wrong level here
 * would silently loosen or tighten every certificate, so the caller must pass the level it dispatched.
 */
export function screenBoundMm(mxMm: number, covRadMm: number, n: number, marginMm: number): number {
  if (!(n > 0)) throw new Error(`screenBoundMm: lattice level must be > 0, got ${n}`);
  return mxMm + covRadMm / n + marginMm;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// D2 — THE CROSS-VALIDATION GATE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** One control facet measured BOTH ways. All distances in mm. */
export interface XvalRow {
  /** triangle index in the ORIGINAL soup */
  tri: number;
  /** the screen's measured max radial/GN distance over its lattice */
  mxGpu: number;
  /** the screen's covering radius for the same facet */
  covGpu: number;
  /** screenBoundMm(mxGpu, covGpu, n, margin) */
  boundGpu: number;
  /** certifyTriangle's witnessed value — a sound LOWER bound on the facet's true max */
  witCpu: number;
  /** certifyTriangle's bound — a sound UPPER bound on the facet's true max */
  boundCpu: number;
}

export interface XvalBar {
  id: string;
  claim: string;
  value: string;
  bar: string;
  pass: boolean;
  /** true when a failure of this bar is a STOP condition rather than a re-run */
  stops: boolean;
}

export interface XvalOutcome {
  n: number;
  nControl: number;
  /** X1: facets where the screen's bound is BELOW the CPU's witnessed value — a broken bound */
  x1Violations: number;
  x1Worst: { tri: number; boundGpuUm: number; witCpuUm: number; deficitUm: number } | null;
  /** X2: the control must contain facets that BOTH instruments put over TOL, or the gate is vacuous */
  x2CpuOver: number;
  x2GpuOver: number;
  /** X3: over-TOL RATES, in percent. GPU keyed on the MEASURED mx (trap 6), CPU on witnessed. */
  x3RateGpuPct: number;
  x3RateCpuPct: number;
  x3DeltaPoints: number;
  /** X4: facets the CPU witnesses over TOL that the screen would have CERTIFIED */
  x4Violations: number;
  x4List: number[];
  bars: XvalBar[];
  pass: boolean;
  /** true when a failed bar is one of the registered STOP conditions */
  stop: boolean;
  lines: string[];
}

/**
 * Score the control set against the four bars registered in the worklog's PHASE D block, BEFORE any number
 * was read. The bars are not re-derived here; they are transcribed, and `barPoints` is the only free
 * parameter — registered at 3.00, which is the WORSE of the two recorded precedents rounded up
 * (2026-07-28-gpu-rank-results.md: GeoStar 0.06 points, Gothic 2.95 points, both at 100% coverage).
 *
 * TRAP 6 IS LIVE. The rate comparison is on the MEASURED `mx`, never on `covRad` — covRad is the
 * circumradius and diverges as the smallest angle goes to zero, so a sliver fails a covRad-keyed test by
 * construction and any correlation built on it is circular.
 */
export function scoreXval(rows: readonly XvalRow[], tolMm: number, barPoints: number, n: number): XvalOutcome {
  const nControl = rows.length;
  if (nControl === 0) throw new Error('scoreXval: the control set is EMPTY. An empty gate is not a passed gate.');

  let x1Violations = 0;
  let x1Worst: XvalOutcome['x1Worst'] = null;
  let x2CpuOver = 0;
  let x2GpuOver = 0;
  let gpuOverMx = 0;
  let x4Violations = 0;
  const x4List: number[] = [];

  for (const r of rows) {
    // X1 — DOMINANCE. The screen's bound must never sit below a distance the CPU actually WITNESSED at a
    // real point of the same facet. Both are statements about max_{p in T} dist(p,S): boundGpu is an upper
    // bound on it, witCpu a lower bound. boundGpu < witCpu is therefore not a disagreement about tightness,
    // it is proof that one of them is not what it claims to be.
    if (r.boundGpu < r.witCpu) {
      x1Violations += 1;
      const deficitUm = (r.witCpu - r.boundGpu) * 1000;
      if (x1Worst === null || deficitUm > x1Worst.deficitUm) {
        x1Worst = { tri: r.tri, boundGpuUm: r.boundGpu * 1000, witCpuUm: r.witCpu * 1000, deficitUm };
      }
    }
    const cpuOver = r.witCpu > tolMm;
    if (cpuOver) x2CpuOver += 1;
    if (r.boundGpu > tolMm) x2GpuOver += 1;
    if (r.mxGpu > tolMm) gpuOverMx += 1;
    // X4 — NO UNDER-FLAGGING. X1's operational form: a facet the CPU witnesses over TOL that the screen
    // would have CERTIFIED is an exceedance hiding in P_screen, which is the one failure the composition
    // cannot survive.
    if (cpuOver && r.boundGpu <= tolMm) { x4Violations += 1; if (x4List.length < 64) x4List.push(r.tri); }
  }

  const x3RateGpuPct = (100 * gpuOverMx) / nControl;
  const x3RateCpuPct = (100 * x2CpuOver) / nControl;
  const x3DeltaPoints = Math.abs(x3RateGpuPct - x3RateCpuPct);

  const bars: XvalBar[] = [
    {
      id: 'X1', claim: 'DOMINANCE — screen bound below a CPU-witnessed distance on the same facet',
      value: `${x1Violations}${x1Worst === null ? '' : ` (worst tri ${x1Worst.tri}: bound ${x1Worst.boundGpuUm.toFixed(3)} um < witnessed ${x1Worst.witCpuUm.toFixed(3)} um, deficit ${x1Worst.deficitUm.toFixed(3)} um)`}`,
      bar: 'must be 0', pass: x1Violations === 0, stops: true,
    },
    {
      id: 'X2', claim: 'NON-VACUITY — the control must contain facets BOTH instruments put over TOL',
      value: `CPU witnessed over TOL: ${x2CpuOver}   screen bound over TOL: ${x2GpuOver}`,
      bar: 'both >= 1', pass: x2CpuOver >= 1 && x2GpuOver >= 1, stops: false,
    },
    {
      id: 'X3', claim: 'RATE AGREEMENT — |GPU mx>TOL rate - CPU witnessed>TOL rate|',
      value: `GPU ${x3RateGpuPct.toFixed(3)}%  CPU ${x3RateCpuPct.toFixed(3)}%  delta ${x3DeltaPoints.toFixed(3)} points`,
      bar: `<= ${barPoints.toFixed(2)} points (recorded precedent: 0.06 GeoStar / 2.95 Gothic)`,
      pass: x3DeltaPoints <= barPoints, stops: true,
    },
    {
      id: 'X4', claim: 'NO UNDER-FLAGGING — CPU-witnessed exceedances the screen would have CERTIFIED',
      value: `${x4Violations}${x4List.length === 0 ? '' : ` [tri ${x4List.join(' ')}]`}`,
      bar: 'must be 0', pass: x4Violations === 0, stops: true,
    },
  ];

  const pass = bars.every((b) => b.pass);
  const stop = bars.some((b) => !b.pass && b.stops);
  const lines: string[] = ['', '===== D2 CROSS-VALIDATION GATE (registered BEFORE any number was read) =====',
    `  control set ${nControl} facets, screen at lattice level n=${n}, TOL ${um(tolMm)} um`,
    '  Every control facet was measured BOTH ways: the GPU screen (f32, radial foot + Gauss-Newton, covering',
    '  radius closure) and certifyTriangle (f64, descent-then-Newton true perpendicular, escalating lattice).'];
  for (const b of bars) {
    lines.push(`  [${b.id}] ${b.pass ? 'PASS' : '*** FAIL ***'}   ${b.claim}`,
      `        measured ${b.value}`, `        bar      ${b.bar}${b.stops ? '   (a failure here is a registered STOP)' : '   (a failure here VOIDS the gate — widen the control and re-run)'}`);
  }
  lines.push(`  GATE: ${pass ? 'ALL BARS PASS — the screen is trusted as a certifier for this mesh' : 'NOT ALL BARS PASSED — see above'}`);
  return { n, nControl, x1Violations, x1Worst, x2CpuOver, x2GpuOver, x3RateGpuPct, x3RateCpuPct, x3DeltaPoints, x4Violations, x4List, bars, pass, stop, lines };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// D1 — THE COMPOSITION
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/** What one cascade level did. `certified` + `survivors` must equal `inCount` or the cascade lost facets. */
export interface ScreenRound {
  n: number;
  inCount: number;
  certified: number;
  survivors: number;
  /** max screen bound over the facets THIS round certified, mm */
  maxCertBoundMm: number;
  gpuMs: number;
  wallMs: number;
}

export interface ScreenSummary {
  nTri: number;
  rounds: readonly ScreenRound[];
  nCertified: number;
  nSurvivors: number;
  /** max screen bound over the WHOLE certified population, mm — one half of the composed certificate */
  maxCertBoundMm: number;
  maxCertBoundTri: number;
  levels: readonly number[];
  marginMm: number;
  gnIters: number;
  closureEps: number;
  parityUm: number;
  gpuMs: number;
  wallMs: number;
}

export interface CpuSummary {
  /** how many survivors were handed to the CPU */
  nSurvivors: number;
  /** how many of them the CPU actually audited (less only if a budget or clock truncated the walk) */
  nAudited: number;
  /** max certifyTriangle bound over the audited survivors, mm — the other half of the composed certificate */
  maxBoundMm: number;
  maxBoundTri: number;
  /** max certifyTriangle witnessed over the audited survivors, mm */
  maxWitnessedMm: number;
  maxWitnessedTri: number;
  /** survivors with a WITNESSED exceedance — proven defects */
  nOver: number;
  /** survivors the CPU could not certify and did not witness over TOL — resolution-limited, not proven */
  nUncert: number;
  nMax: number;
  workers: number;
  facetsPerSec: number;
  wallMs: number;
}

export interface ComposeInput {
  nTri: number;
  tolMm: number;
  screen: ScreenSummary;
  cpu: CpuSummary;
}

export interface ComposeOutcome {
  reading: DirectionReading;
  /** which half of the composition attains the composed bound */
  owner: 'screen' | 'cpu' | 'none';
  lines: string[];
}

/**
 * Compose the two halves into ONE DirectionReading for `judge()`.
 *
 * COVERAGE IS COUNTED, NEVER INFERRED. `complete` is true only when
 * `screen.nCertified + cpu.nAudited === nTri` AND every survivor was audited. A cascade that silently
 * skipped facets, or a CPU leg truncated by its clock, must NOT be able to present itself as full coverage —
 * that is the exact shape of the false-PASS cursor bug gpuRuler was bitten by (a skipped triangle never
 * enters `survivors`, i.e. is silently certified), and the counting here is what would catch it.
 */
export function composeH1(inp: ComposeInput): ComposeOutcome {
  const { nTri, tolMm, screen, cpu } = inp;
  const accounted = screen.nCertified + cpu.nAudited;
  const complete = accounted === nTri && cpu.nAudited === cpu.nSurvivors && screen.nSurvivors === cpu.nSurvivors;

  const sB = screen.nCertified > 0 ? screen.maxCertBoundMm : 0;
  const cB = cpu.nAudited > 0 ? cpu.maxBoundMm : 0;
  const boundMm = Math.max(sB, cB);
  const owner: ComposeOutcome['owner'] = accounted === 0 ? 'none' : cB >= sB && cpu.nAudited > 0 ? 'cpu' : 'screen';
  // The witness comes from the CPU half ALONE, and that is sound rather than lazy: every facet in P_screen
  // carries an upper bound <= TOL, so none of them can hold a witness above TOL, and a max over a subset is
  // still a sound LOWER bound on the true max. The screen has no witness to offer in any case — it reports a
  // bound, not a located point.
  const witnessedMm = cpu.nAudited > 0 ? cpu.maxWitnessedMm : 0;

  const coverage = `COMPOSED, 100%-triage: ${screen.nCertified}/${nTri} facets (${((100 * screen.nCertified) / Math.max(1, nTri)).toFixed(4)}%) certified BY THE GPU SCREEN`
    + ` at levels ${screen.levels.join('/')} (gnIters ${screen.gnIters}, closureEps ${screen.closureEps}, margin ${um(screen.marginMm)} um, f32; GPU-vs-CPU rA parity ${screen.parityUm.toFixed(3)} um measured at startup)`
    + `; ${cpu.nAudited}/${cpu.nSurvivors} survivors certified BY THE CPU (certifyTriangle, f64, nMax ${cpu.nMax}, ${cpu.workers} worker threads)`
    + `; accounted ${accounted}/${nTri}${complete ? ' — FULL COVERAGE' : ' *** INCOMPLETE — the unaccounted facets are UNKNOWN, not passing ***'}`;

  const lines: string[] = ['',
    '--- H1  MESH -> SURFACE   *** COMPOSED CERTIFICATE: GPU TRIAGE AT 100% COVERAGE + CPU CONFIRM ON SURVIVORS *** ---',
    '  MEASUREMENTS, NOT A VERDICT — the verdict block at the end of this report is the only place a PASS or',
    '  FAIL may be read from, and it requires BOTH directions to have run.',
    '  THE TWO POPULATIONS ARE PRINTED SEPARATELY ON PURPOSE. A reader who does not accept the screen half',
    '  can discard it and still read the CPU half; a reader who does accept it can see exactly what it bought.',
    '',
    `  POPULATION 1 — CERTIFIED BY THE GPU SCREEN : ${screen.nCertified} / ${nTri}  (${((100 * screen.nCertified) / Math.max(1, nTri)).toFixed(4)}%)`,
    `    certified bound over this population     : ${um(sB)} um   (facet ${screen.maxCertBoundTri})   ${sB <= tolMm ? 'within TOL by construction' : '*** ABOVE TOL — IMPOSSIBLE, the membership test is broken ***'}`,
    `    cascade  ${screen.rounds.map((r) => `n=${r.n}: ${r.inCount} in -> ${r.certified} certified, ${r.survivors} out`).join('   ')}`,
    `    screen   levels ${screen.levels.join('/')}   gnIters ${screen.gnIters}   closureEps ${screen.closureEps}   margin ${um(screen.marginMm)} um   f32`,
    `    parity   GPU rA vs the CPU auditor's OWN rA: ${screen.parityUm.toFixed(3)} um max over the startup lattice (the whole surface: geometry, expn, bell and style)`,
    `    cost     ${(screen.gpuMs / 1000).toFixed(1)} s GPU compute, ${(screen.wallMs / 1000).toFixed(1)} s wall including transport`,
    '',
    `  POPULATION 2 — CERTIFIED BY THE CPU        : ${cpu.nAudited} / ${cpu.nSurvivors} survivors`,
    `    certified bound over this population     : ${um(cB)} um   (facet ${cpu.maxBoundTri})`,
    `    witnessed max over this population       : ${um(cpu.maxWitnessedMm)} um   (facet ${cpu.maxWitnessedTri})`,
    `    survivors with a WITNESSED exceedance    : ${cpu.nOver}   (proven defects — a real point at a real distance)`,
    `    survivors UNCERTIFIED but not witnessed  : ${cpu.nUncert}   (resolution-limited at nMax ${cpu.nMax}; an honest UNKNOWN, never a pass)`,
    `    cost     ${(cpu.wallMs / 1000).toFixed(1)} s, ${cpu.workers} worker threads, ${cpu.facetsPerSec.toFixed(2)} facets/s`,
    '',
    `  *** COMPOSED CERTIFIED UPPER BOUND : ${um(boundMm)} um ***   ${boundMm <= tolMm ? 'within TOL' : 'OVER TOL'}   attained by the ${owner.toUpperCase()} half`,
    `  *** COMPOSED WITNESSED MAX         : ${um(witnessedMm)} um ***   ${witnessedMm <= tolMm ? 'within TOL' : 'OVER TOL'}   (CPU half only — see the note below)`,
    `  COVERAGE: ${coverage}`,
    '  WHY THE WITNESS IS THE CPU HALF ALONE: every facet in population 1 carries an upper bound <= TOL, so',
    '  none of them can hold a witness above TOL; a max over a subset is still a sound LOWER bound on the true',
    '  max. The screen reports a bound, not a located point, and is never quoted as a max (RATES transfer',
    '  between these two instruments, MAXIMA do not — 2026-07-28-gpu-rank-results.md).'];

  return {
    reading: { ran: true, complete, certified: true, witnessedMm, boundMm, coverage },
    owner, lines,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// D4 — THE RESIDUAL, CLASSIFIED FROM THE STL ALONE
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * 3-D aspect ratio, TRANSCRIBED from _judgeShape.meshShapeCensus rather than imported.
 *
 * AR = longest * perimeter / (4 * area) = longest edge / (2 * inradius). 1.732 equilateral, 2.414 for the
 * initial grid's right-isoceles cells. The transcription is checked at runtime — the caller asserts that the
 * max of this function over the whole mesh equals the census's own `arMax` to the digit — because a second
 * implementation that is never compared against the first is exactly how this campaign has previously
 * shipped two definitions of one quantity.
 */
export interface FacetGeom {
  ar: number; longestMm: number; shortestMm: number; areaMm2: number;
  zMin: number; zMax: number; thetaA: number;
}
export function facetGeom(xyz: Float64Array, t: number): FacetGeom {
  const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const nx = uy * wz - uz * wy; const ny = uz * wx - ux * wz; const nz = ux * wy - uy * wx;
  const area = 0.5 * Math.hypot(nx, ny, nz);
  const per = e0 + e1 + e2;
  const L = Math.max(e0, e1, e2);
  const S = Math.min(e0, e1, e2);
  return {
    ar: area > 0 ? (L * per) / (4 * area) : Infinity,
    longestMm: L, shortestMm: S, areaMm2: area,
    zMin: Math.min(az, bz, cz), zMax: Math.max(az, bz, cz), thetaA: Math.atan2(ay, ax),
  };
}

/**
 * THE OWNER TAXONOMY, AND WHAT IT DELIBERATELY DOES NOT CLAIM.
 *
 * S26 named the driver-side refuser exhaustively: `shape-ar` 96.3% / `shape-admit` 3.7% on 4,584 facets.
 * THAT ATTRIBUTION CANNOT BE REPRODUCED FROM A FINISHED STL and this file does not pretend to. `shape-ar`
 * is a property of a REFUSED SPLIT — the driver offered a split, scored the CHILDREN, and the S1 aspect cap
 * refused — so a facet at AR 40 whose children would be AR 80 is `shape-ar`-refused while sitting well
 * inside the cap itself. An STL carries no per-facet provenance, and a heuristic here would be worse than
 * silence (the same reasoning `_judgeShape.bladeGate` gives for refusing to guess PF_FT_GUARD_AR).
 *
 * So the classes below are GEOMETRIC ATTRIBUTES of the residual facet, and the bands are the ones the
 * recorded evidence already uses: the longest-edge buckets of 2026-07-28-gpu-rank-results.md §6b, and the
 * rim row this campaign already declines to score as wall (the standing BasketWeave caveat). S26's gate
 * attribution is CITED alongside, never re-derived.
 */
export type ResidualOwner = 'rim-row' | 'long-chord' | 'mid-chord' | 'fine' | 'over-cap-AR';

export interface OwnerBands {
  /** a facet with any vertex in this band of either rim is not scored as wall */
  rimMm: number;
  H: number;
  /** the driver's own S1 split-guard cap (PF_CB_SHAPE_AR) — reported, never guessed */
  arCap: number;
  longMm: number;
  midMm: number;
}

export function classifyResidual(g: FacetGeom, b: OwnerBands): ResidualOwner {
  if (g.zMax >= b.H - b.rimMm || g.zMin <= b.rimMm) return 'rim-row';
  if (g.ar > b.arCap) return 'over-cap-AR';
  if (g.longestMm >= b.longMm) return 'long-chord';
  if (g.longestMm >= b.midMm) return 'mid-chord';
  return 'fine';
}

export interface ResidualRow {
  tri: number;
  witnessedMm: number;
  owner: ResidualOwner;
  geom: FacetGeom;
}

export interface ResidualTable {
  rows: ResidualRow[];
  byOwner: Record<string, { count: number; maxUm: number }>;
  /** true when every witnessed exceedance is present, i.e. nOver <= the top-K the walk kept */
  enumerationComplete: boolean;
  nOver: number;
  topK: number;
  lines: string[];
}

export function buildResidualTable(
  rows: readonly ResidualRow[], nOver: number, topK: number, tolMm: number, nShow: number,
): ResidualTable {
  const sorted = rows.slice().sort((p, q) => (q.witnessedMm - p.witnessedMm) || (p.tri - q.tri));
  const byOwner: Record<string, { count: number; maxUm: number }> = {};
  for (const r of sorted) {
    const k = r.owner;
    const cur = byOwner[k] ?? { count: 0, maxUm: 0 };
    cur.count += 1;
    if (r.witnessedMm * 1000 > cur.maxUm) cur.maxUm = r.witnessedMm * 1000;
    byOwner[k] = cur;
  }
  // ENUMERATION COMPLETENESS IS A PROOF, NOT A HOPE. The walk keeps the top K facets BY WITNESSED VALUE, and
  // an over-TOL facet has, by definition, a witnessed value strictly greater than every non-over facet's. So
  // if nOver <= K the kept set CONTAINS every over-TOL facet and the enumeration below is complete. If
  // nOver > K it is a truncation and says so — it never presents a prefix as the whole residual.
  const enumerationComplete = nOver <= topK;
  const lines: string[] = ['',
    '--- THE RESIDUAL — every facet with a WITNESSED exceedance, enumerated by owner ---',
    `  ${nOver} facets carry a witnessed exceedance over TOL ${um(tolMm)} um.`,
    enumerationComplete
      ? `  ENUMERATION IS COMPLETE: nOver ${nOver} <= the ${topK} facets the walk kept by value, and an over-TOL facet's`
        + '\n  witnessed value strictly exceeds every non-over facet\'s, so the kept set contains all of them.'
      : `  *** ENUMERATION TRUNCATED: nOver ${nOver} > the ${topK} facets kept by value. What follows is the worst ${topK},`
        + '\n  not the whole residual. Raise PF_D_TOPK and re-run before quoting the owner counts. ***',
    '  OWNER CLASSES ARE GEOMETRIC ATTRIBUTES OF THE FACET, NOT THE DRIVER\'S REFUSAL REASON. S26 named that',
    '  refuser exhaustively (shape-ar 96.3% / shape-admit 3.7% on 4,584 facets) and it is a property of a',
    '  REFUSED SPLIT, which a finished STL does not carry. That attribution is cited, never re-derived here.',
    '  by owner:'];
  for (const [k, v] of Object.entries(byOwner).sort((a, c) => c[1].count - a[1].count)) {
    lines.push(`    ${k.padEnd(14)} ${String(v.count).padStart(7)}  (${((100 * v.count) / Math.max(1, sorted.length)).toFixed(2)}% of the enumerated residual)   worst ${v.maxUm.toFixed(3)} um`);
  }
  lines.push(`  WORST ${Math.min(nShow, sorted.length)} BY WITNESSED VALUE:`);
  for (const r of sorted.slice(0, nShow)) {
    lines.push(`    tri ${String(r.tri).padStart(9)}  ${(r.witnessedMm * 1000).toFixed(3).padStart(10)} um  ${r.owner.padEnd(12)}`
      + `  AR ${r.geom.ar.toFixed(2).padStart(9)}  long ${(r.geom.longestMm * 1000).toFixed(1).padStart(8)} um`
      + `  z ${r.geom.zMin.toFixed(3)}..${r.geom.zMax.toFixed(3)}  th ${r.geom.thetaA.toFixed(4)}`);
  }
  return { rows: sorted, byOwner, enumerationComplete, nOver, topK, lines };
}
