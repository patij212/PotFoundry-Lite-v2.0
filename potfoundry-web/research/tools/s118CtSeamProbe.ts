// s118CtSeamProbe.ts — S118 DRIVE PHASE, STEP 0: IS THE 0.01 mm BAR REACHABLE ON CelticTriquetra?
//
// THE QUESTION. CelticTriquetra's rA is GENUINELY DISCONTINUOUS: `ctTriquetraHeight`
// (src/geometry/styles.ts:2263) does `sector = Math.floor(angle / (CT_TAU/3))` and then ROTATES the
// medallion point by `sector * CT_TAU/3` before measuring one arc. A single off-centre circle is not
// 120-deg symmetric, so the height JUMPS across each of the three sector rays. The solid therefore has a
// genuine radial CLIFF there.
//
// THE RULER'S SURFACE MODEL IS THE GRAPH OF rA OVER (theta, z) — `buildRadialSurfaceProjector` samples
// rA on a (theta, z) grid and polishes onto that graph. THE GRAPH DOES NOT CONTAIN THE CLIFF FACE.
// Any closed mesh MUST span the cliff (a solid has no hole), so its cliff facets have interior points
// that lie in the gap between the two sheets — and the projector will report ~half the jump for them,
// no matter how fine the mesh is.
//
// If that is true, then the campaign's 0.01 mm bar has a FLOOR on CT that is a property of the RULER,
// not of the mesh, and no refinement operator can close it. That is a claim about a mechanism, so it is
// tested here with CONTROLS rather than asserted:
//
//   C1  MEASURE THE JUMP. Sample rA either side of each sector ray at many radii; report the jump.
//   C2  THE CLIFF-MIDPOINT PROBE. Put a point exactly on the cliff face, half way up the jump, and ask
//       the projector for its distance. If the graph model is the issue this reads ~jump/2.
//   C3  THE EXACT-MESH CONTROL — THE DECISIVE ONE. Build a structured (theta,z) grid mesh whose EVERY
//       vertex is exactly rA(theta,z) (PRECOND == 0 by construction), at several resolutions, and score
//       its perpendicular residual. If the residual off-seam falls like h^2 but the residual ON the
//       seam does NOT fall at all, the floor is proven to be irreducible by density.
//   C4  A NEGATIVE CONTROL: run the same C3 ladder on GothicArches, whose rA is continuous. If the
//       Gothic ladder converges to zero while CT's does not, the effect is CT's discontinuity and not a
//       bug in my grid mesher or in the projector.
//
// Usage: bash research/tools/run-s118-ctseam.sh
//   env PF_S118P_STYLE PF_S118P_NG (csv of grid resolutions) PF_S118P_TAG
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STYLE = envS('PF_S118P_STYLE', 'CelticTriquetra');
const DIMS: StyleDims = { H: envF('PF_S118P_H', 120), Rb: envF('PF_S118P_RB', 40), Rt: envF('PF_S118P_RT', 50), expn: 1 };
const H = DIMS.H;
const TAU = 2 * Math.PI;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 STEP 0 — CAN ${STYLE} REACH 0.01 mm? THE C0-SEAM FLOOR PROBE =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`params ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt}`);
log('');

const proj = buildRadialSurfaceProjector(rA, { H, nTheta: 1536, nZ: 768, seedTopK: 6 });
log(`projector grid ${proj.gridThetaCount} x ${proj.gridZCount} = ${proj.sampleCount.toLocaleString()} samples`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// C1 — WHERE IS THE JUMP, AND HOW BIG IS IT?  Scan the whole (theta,z) domain for the largest
// finite-difference jump in rA. NOTHING about the medallion is assumed: the scan is global.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── C1  GLOBAL JUMP SCAN — max |rA(th+e,z) - rA(th-e,z)| over a dense grid, e SWEPT ──');
log('   (a smooth surface gives a jump that FALLS LINEARLY with e; a cliff gives one that does not move)');
interface Jump { j: number; th: number; z: number }
function scanJump(nT: number, nZ: number, e: number): Jump {
  let best: Jump = { j: 0, th: 0, z: 0 };
  for (let i = 0; i < nT; i += 1) {
    const th = (i / nT) * TAU;
    for (let k = 0; k <= nZ; k += 1) {
      const z = (k / nZ) * H;
      const j = Math.abs(rA(th + e, z) - rA(th - e, z));
      if (j > best.j) best = { j, th, z };
    }
  }
  return best;
}
for (const e of [1e-3, 1e-4, 1e-5, 1e-6, 1e-7]) {
  const b = scanJump(2000, 600, e);
  log(`   e=${e.toExponential(0).padStart(7)}  MAX jump ${b.j.toFixed(6)} mm  at theta ${b.th.toFixed(5)} (u ${(b.th / TAU).toFixed(5)})  z ${b.z.toFixed(3)} (t ${(b.z / H).toFixed(4)})`);
}
log('   *** MY OWN SCAN CONTROL: this sweep CANNOT be read as "the jump shrinks with e". A fixed 2000-point');
log('   theta grid only STRADDLES a seam when a grid point lands within e of it, so at e<=1e-6 the scan');
log('   MISSES the seam and reports smooth-surface noise instead. The e=1e-3 row is the one that found it.');
log('   The DISCONTINUITY TEST is the bisection below, which brackets the seam and never loses it.');
log('');

// The seed MUST come from a step coarse enough to have actually straddled the seam.
const seed = scanJump(4000, 1200, 1e-3);
log(`   refined seed (e=1e-3, 4000x1200): jump ${seed.j.toFixed(6)} mm at theta ${seed.th.toFixed(6)}  z ${seed.z.toFixed(4)}`);
/**
 * Bracket-preserving bisection for a jump in rA along theta at fixed z.
 * INVARIANT: [lo,hi] always contains the jump. At each step the half with the LARGER internal
 * variation keeps it. A SMOOTH rA collapses |rA(hi)-rA(lo)| to ~0 as (hi-lo) -> 0; a genuine
 * discontinuity holds it at the jump height forever. That is the actual test.
 */
function bisectJump(th0: number, th1: number, z: number, iters: number): { th: number; rl: number; rh: number; w: number } {
  let lo = th0; let hi = th1;
  for (let it = 0; it < iters; it += 1) {
    const mid = 0.5 * (lo + hi);
    const rl = rA(lo, z); const rm = rA(mid, z); const rh = rA(hi, z);
    if (Math.abs(rm - rl) >= Math.abs(rh - rm)) hi = mid; else lo = mid;
  }
  return { th: 0.5 * (lo + hi), rl: rA(lo, z), rh: rA(hi, z), w: hi - lo };
}
{
  const b = bisectJump(seed.th - 1e-3, seed.th + 1e-3, seed.z, 60);
  log(`   BISECTED SEAM at theta ${b.th.toFixed(12)}   r- ${b.rl.toFixed(6)}  r+ ${b.rh.toFixed(6)}  *** JUMP ${Math.abs(b.rh - b.rl).toFixed(6)} mm ***`);
  log(`   bracket width after 60 bisections: ${b.w.toExponential(3)} rad = ${(b.w * 45 * 1e6).toFixed(3)} nm of arc on a 45 mm arm`);
  // THE VERDICT MUST FOLLOW THE MEASUREMENT, NOT THE HYPOTHESIS. An earlier version printed
  // "TRULY DISCONTINUOUS" unconditionally and said exactly that on GothicArches, where the measured
  // jump is 0.000000 mm. Caught by running the negative control; the line is now conditional.
  const survived = Math.abs(b.rh - b.rl);
  if (survived > 0.05) log(`   *** THE TEST: the jump SURVIVED (${survived.toFixed(6)} mm) with the bracket collapsed to ${(b.w * 45 * 1e6).toFixed(1)} nm ⇒ rA IS TRULY DISCONTINUOUS. ***`);
  else log(`   *** THE TEST: the jump COLLAPSED to ${survived.toFixed(6)} mm as the bracket closed ⇒ rA IS CONTINUOUS HERE (steep, not discontinuous). ***`);
  log('');
  const lo = b.th - 0.5 * b.w; const hi = b.th + 0.5 * b.w; const rl = b.rl; const rh = b.rh;

  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  // C2 — THE CLIFF-MIDPOINT PROBE. A point on the cliff FACE, half way between the two sheets.
  // ════════════════════════════════════════════════════════════════════════════════════════════════════
  log('── C2  CLIFF-MIDPOINT PROBE — the ruler asked about a point that is ON the solid but NOT on the graph ──');
  const thS = 0.5 * (lo + hi);
  for (const f of [0.5, 0.25, 0.1, 0.02]) {
    const rMid = rl + f * (rh - rl);
    const p = proj.project(rMid * Math.cos(thS), rMid * Math.sin(thS), seed.z);
    log(`   fraction ${f.toFixed(2).padStart(5)} up the cliff (r ${rMid.toFixed(5)}):  projector dist ${(p.dist * 1000).toFixed(3)} um   [expected ~ min(f, 1-f) * jump = ${(Math.min(f, 1 - f) * Math.abs(rh - rl) * 1000).toFixed(1)} um if the graph model has no cliff face]`);
  }
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// C3 / C4 — THE EXACT-MESH PATCH LADDER.
// A structured (theta,z) grid over a PATCH centred on the worst jump locus. Every vertex is EXACTLY
// rA(theta,z), so PRECOND is 0 by construction and everything the perpendicular ruler reports is CHORD
// error. On a smooth patch chord error falls like h^2 (4x per doubling). If the SEAM-STRADDLING facets'
// residual does NOT fall while the others' does, the floor is the cliff face and no operator removes it.
//
// STRADDLING IS DETECTED, NOT ASSUMED: a cell straddles iff a bracket-preserving bisection across its
// theta interval still shows a jump > 0.05 mm after the bracket has collapsed to ~1e-16 rad. A smooth
// rA cannot survive that test; a discontinuity always does.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── C3  EXACT-MESH PATCH LADDER — every vertex ON rA, so the ONLY error is chord error ──');
const PW_TH = envF('PF_S118P_PWTH', 0.06);          // patch half-width in theta (rad)
const PW_Z = envF('PF_S118P_PWZ', 2.0);             // patch half-height in z (mm)
const thC = seed.th; const zC = seed.z;
const TH_LO = thC - PW_TH; const TH_HI = thC + PW_TH;
const Z_LO = zC - PW_Z; const Z_HI = zC + PW_Z;
log(`   patch: theta ${TH_LO.toFixed(4)}..${TH_HI.toFixed(4)}   z ${Z_LO.toFixed(3)}..${Z_HI.toFixed(3)}   (centred on the worst jump locus)`);

// ── LOCATE THE SEAM CURVE theta_s(z), by bisection, at every z we need. NOTHING is assumed about
//    where the medallion is or how its rays run: the seam is FOUND. A first attempt classified a cell
//    by a single mid-z bisection and UNDER-COUNTED — the seam runs DIAGONALLY across this patch (it
//    shifts a full cell width per cell height), so half the straddling cells were mislabelled
//    "off-seam" and dragged the off-seam MAX up to the cliff value. That control fired, and this is
//    the fix: the seam is located per z and a facet straddles iff its vertices sit on both sides.
// SECOND CONTROL FAILURE, SECOND FIX. The first seamAt returned NaN unless the two PATCH EDGES already
// differed by > 0.05 mm — but rA's smooth variation can offset the jump, so it declared "no cliff" on
// rows that have one, and every cell in those rows was mislabelled off-seam. That dragged the off-seam
// MAX up to the cliff value and made it look non-convergent. The detector now SCANS the row finely for
// an adjacent pair that differs by more than the local smooth variation can explain, and only then
// bisects. NaN now means "the fine scan found no candidate", not "the endpoints happened to agree".
const seamAt = (z: number): number => {
  const N = 400;
  const dTh = (TH_HI - TH_LO) / N;
  let prev = rA(TH_LO, z);
  for (let i = 1; i <= N; i += 1) {
    const th = TH_LO + dTh * i;
    const cur = rA(th, z);
    if (Math.abs(cur - prev) > 0.05) {
      let lo = th - dTh; let hi = th;
      for (let it = 0; it < 60; it += 1) {
        const mid = 0.5 * (lo + hi);
        const rl2 = rA(lo, z); const rm = rA(mid, z); const rh2 = rA(hi, z);
        if (Math.abs(rm - rl2) >= Math.abs(rh2 - rm)) hi = mid; else lo = mid;
      }
      if (Math.abs(rA(hi, z) - rA(lo, z)) > 0.05) return 0.5 * (lo + hi);   // the jump SURVIVED
    }
    prev = cur;
  }
  return NaN;
};
{
  const rows: string[] = [];
  for (let q = 0; q <= 4; q += 1) { const z = Z_LO + (q / 4) * (Z_HI - Z_LO); const s = seamAt(z); rows.push(`z=${z.toFixed(2)}→${Number.isNaN(s) ? 'none' : s.toFixed(6)}`); }
  log(`   seam curve theta_s(z), located by bisection: ${rows.join('  ')}`);
}
log('');
log('    n     cells   facets    h_arc um   MAX STRADDLING   MAX off-seam  MAX >=1 cell off   strad  off>0.01  wall');
const NGS = envS('PF_S118P_NG', '16,32,64,128,256').split(',').map((s) => Math.round(Number(s)));
let prevOff = 0;
for (const n of NGS) {
  const t0 = Date.now();
  let maxOff = 0; let maxOn = 0; let maxFar = 0; let nStrad = 0; let offOver = 0; let nT = 0;
  const P = (th: number, z: number): number[] => { const r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
  const dTh = (TH_HI - TH_LO) / n;
  // theta_s at every grid z line, once
  const sm = new Float64Array(n + 1);
  for (let k = 0; k <= n; k += 1) sm[k] = seamAt(Z_LO + (k / n) * (Z_HI - Z_LO));
  for (let i = 0; i < n; i += 1) {
    const th0 = TH_LO + dTh * i; const th1 = TH_LO + dTh * (i + 1);
    for (let k = 0; k < n; k += 1) {
      const z0 = Z_LO + ((Z_HI - Z_LO) * k) / n; const z1 = Z_LO + ((Z_HI - Z_LO) * (k + 1)) / n;
      const s0 = sm[k]; const s1 = sm[k + 1];
      const sLo = Math.min(Number.isNaN(s0) ? Infinity : s0, Number.isNaN(s1) ? Infinity : s1);
      const sHi = Math.max(Number.isNaN(s0) ? -Infinity : s0, Number.isNaN(s1) ? -Infinity : s1);
      const strad = sLo <= th1 && sHi >= th0;                       // the seam passes through the cell
      const gapCells = strad ? 0 : Math.min(Math.abs(th0 - sHi), Math.abs(sLo - th1)) / dTh;
      if (strad) nStrad += 1;
      const A = P(th0, z0); const B = P(th1, z0); const C = P(th1, z1); const Dp = P(th0, z1);
      for (const tri of [[A, B, C], [A, C, Dp]]) {
        nT += 1;
        let w = 0;
        const pts: number[][] = [
          [(tri[0][0] + tri[1][0]) / 2, (tri[0][1] + tri[1][1]) / 2, (tri[0][2] + tri[1][2]) / 2],
          [(tri[1][0] + tri[2][0]) / 2, (tri[1][1] + tri[2][1]) / 2, (tri[1][2] + tri[2][2]) / 2],
          [(tri[2][0] + tri[0][0]) / 2, (tri[2][1] + tri[0][1]) / 2, (tri[2][2] + tri[0][2]) / 2],
          [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3, (tri[0][2] + tri[1][2] + tri[2][2]) / 3],
        ];
        for (const p of pts) { const d = proj.project(p[0], p[1], p[2]).dist; if (d > w) w = d; }
        if (strad) { if (w > maxOn) maxOn = w; }
        else {
          if (w > maxOff) maxOff = w;
          if (w > 0.01) offOver += 1;
          if (gapCells >= 1 && w > maxFar) maxFar = w;
        }
      }
    }
  }
  const hArc = ((TH_HI - TH_LO) / n) * 45 * 1000;
  const rate = prevOff > 0 ? `  (fell ${(prevOff / Math.max(maxFar, 1e-12)).toFixed(2)}x)` : '';
  log(`  ${String(n).padStart(4)}  ${String(n * n).padStart(8)} ${String(nT).padStart(8)}  ${hArc.toFixed(2).padStart(9)} ${(maxOn * 1000).toFixed(3).padStart(14)} um ${(maxOff * 1000).toFixed(4).padStart(12)} um ${(maxFar * 1000).toFixed(4).padStart(15)} um ${String(nStrad).padStart(7)} ${String(offOver).padStart(9)}  ${((Date.now() - t0) / 1000).toFixed(0)}s${rate}`);
  prevOff = maxFar;
}
log('');
log('READ IT LIKE THIS:');
log('  * "MAX >=1 cell off" falling ~4x per doubling = h^2 chord convergence ⇒ ruler + grid mesher are sound.');
log('  * "MAX STRADDLING" NOT falling ⇒ the floor is the CLIFF FACE, which the graph-of-rA ruler does not');
log('    contain, and NO refinement operator can remove it: the mesh must span the cliff (a solid has no');
log('    hole there), and the ruler has no surface points inside the jump to measure against.');
log('  * strad = 0 on a continuous style (run with PF_S118P_STYLE=GothicArches as the C4 control).');
log('S118 STEP 0 DONE');
