// _strataChainCurtain.test.ts — FORK of _strataCurtainClose.test.ts + the TRACED-CHAIN curtain (curved h0 loci).
// Gated PF_STRATA_CHAIN=1. RESEARCH ONLY — never touches src/, never touches the parent harness.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHY A FORK: the parent file is the recorded instrument for the 17-closed scorecard. Every addition here is behind
// PF_CB_CURTAIN / PF_CB_CURTAIN_EVAL (both default OFF), so with the flags off this file must reproduce the parent's
// numbers exactly — which is one of the three runs reported.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// L4  θ-CURTAIN (PF_CB_CURTAIN=1) — the h0 mechanism, rotated 90° from the already-working z-step treads.
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THEOREM (not re-litigated): a jump is two-valued AT its locus; a single-valued mesh vertex can carry at most one
// branch. Neither refinement nor grid alignment can close an h0 feature — a double-valued curtain is MANDATORY.
//
//  1. DETECT (generic, no per-style code): scan θ for scale-invariant |Δr| — a two-scale ladder where the ratio
//     d(ε)/d(ε/8) → 1 is a JUMP (a crease or smooth point gives → 8). Bisect each bracket to machine precision.
//  2. COLUMNS: merge the detected loci into the uniform θ-column set (dropping any uniform column that falls within
//     CURTAIN_MERGE of a locus), so a locus is ALWAYS a column whether or not gu happens to align.
//  3. DOUBLE: each locus column carries TWO vertex rows at the SAME θ — vMinus (r = rA(θ*−ε)) and vPlus
//     (r = rA(θ*+ε)) — so the curtain is a true vertical wall, not a sliver. Cells bind to their own copy: the quad
//     spanning (i−1,i) uses vMinus[i]; the quad spanning (i,i+1) uses vPlus[i].
//  4. STITCH: a quad strip between vMinus[i][j] and vPlus[i][j] down each row, wound by ORIENTATION CONSISTENCY with
//     the two sheets (M1→M0→P0→P1), so it is correct for either sign of the jump.
//  5. PIN: the branch is a VERTEX PROPERTY (vBranch ∈ {−1,0,+1} + vLocTh). bisectAt INHERITS it when both endpoints
//     sit on the same locus, so a refined midpoint re-evaluates rA(θ*±ε, zmid) — it stays ON its own branch curve
//     instead of collapsing back onto the arbitrary value rA takes AT the locus.
//  6. PINCH: where the jump amplitude vanishes (BasketWeave: z=0 and z=H, measured |Δr| = 0), the two copies WOULD
//     weld. That is geometrically correct — the curtain closes to a point — so emit ONE vertex tagged branch 0 and
//     let addT reject the degenerate triangle. Elsewhere the separation must exceed the weld radius; asserted.
//  7. RULE THE RIGHT SURFACE (PF_CB_CURTAIN_EVAL=1, implied by CURTAIN): at a jump the analytic surface is TWO-
//     VALUED, so a ruler sample that lands exactly ON a locus must be compared against the branch its triangle
//     represents. Same ±ε the mesher uses — not a softer ruler. PROOF IT IS NOT A WHITEWASH: run CURTAIN_EVAL alone
//     (branch-aware ruler, NO curtain) and the 1.9 mm defect must still read ~1.9 mm.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE IDEA (three independent levers, each flag-gated, ALL DEFAULT OFF ⇒ this file reproduces STRATA grid+LEPP)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// STRATA's `bisect(a,b)` already splits EVERY triangle incident to edge (a,b). That means bisecting an ARBITRARY
// edge at an ARBITRARY point is watertight and T-junction-free by construction. LEPP's longest-edge rule is NOT a
// topological requirement — it is only a triangle-QUALITY heuristic. That freedom is the whole lever:
//
//   L1  DIRECTED (PF_CB_DIRECTED=1) — split the edge with the largest EDGE CHORD SAG, not the longest edge.
//       An edge lying ALONG a straight ridge has ~0 sag; the edge ACROSS it has all of it. So refinement becomes
//       anisotropic *for free*, with no metric tensor, no M=g/h² field, no per-style code. (The analytic budget
//       probe measures this lever at 14× on GothicArches: 2.08 M isotropic vs 0.15 M anisotropic.)
//       Guarded by an ASPECT CAP: never split an edge already shorter than longest/AR — else needles.
//
//   L2  SNAP (PF_CB_SNAP=1) — when the chosen edge CROSSES a feature locus, put the new vertex exactly ON the locus
//       instead of at the midpoint. Because `bisect` splits both incident triangles at that same point, the two
//       neighbours agree by construction. After the 2nd crossing edge of a triangle is split, the chord joining the
//       two locus vertices IS a mesh edge — i.e. the CHAIN emerges from local edge splits; no chain contract, no
//       marching squares, no splitPolygonByChain, no fail-closed refusal needed. Junctions need no special case:
//       a cell with 3–4 crossings simply gets 3–4 splits.
//       Locus finding is a generic 1-D KINK LOCATOR (below): direction-agnostic, works on ANY r(θ,z).
//
//   L3  REPROJECT (PF_CB_REPROJECT=1) — an edge whose BOTH ends are on a locus runs ALONG it. Its arithmetic
//       midpoint leaves a CURVED locus by κ·L²/8, so conforming decays exactly as you refine. Re-solve that midpoint
//       by running the same 1-D kink locator on a short TRANSVERSE segment. Bounded move (≤ CB_REPROJ_FRAC·|ab|).
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// THE 1-D KINK LOCATOR (the single generic detector — no per-style code, no axis projection)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Given ANY segment in (θ,z), find where the surface has a gradient discontinuity along it:
//   1. coarse scan of |Δ²r| over N bins → argmax bin → bracket
//   2. TWO-SCALE class test at the argmax: small/big ≈ 1/16 ⇒ smooth (reject), ≈1/4 ⇒ CREASE (accept), ≈1 ⇒ JUMP
//   3. BRACKET-HALVING kink bisection: keep the half whose |Δ²r| is larger. 24 halvings ⇒ ~1e-7 of the segment.
// Step 3 is the piece that matters and that the earlier crease-cut prototype lacked: placing the vertex within
// ~0.6 µm of the crest is REQUIRED (an offset δ costs ≈ 2·Δs·δ ≈ 16·δ of sag on GothicArches' rib), and a
// linear-fit intercept on a 20-bin scan is ~10 µm accurate — 20× too coarse. Sub-µm placement is not a polish
// detail, it is the difference between conforming and not.
import { describe, it, expect } from 'vitest';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { baseRadius } from '../../src/geometry/profile';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_CHAIN === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

type P3 = [number, number, number];

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
const envOn = (n: string): boolean => process.env[n] === '1';
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

describe('STRATA conforming-bisection + θ-curtain', () => {
  it.runIf(RUN)('meshes any style by feature-directed conforming bisection with double-valued θ curtains', () => {
    const STYLE = process.env.PF_CB_STYLE ?? 'GothicArches';
    const TOL = envF('PF_CB_TOL', 0.01);
    const acceptTol = envF('PF_CB_ACCEPT', 0.007);
    const triCap = Math.round(envF('PF_CB_TRICAP', 2_500_000));
    const gu = Math.round(envF('PF_CB_GRIDU', 200));
    const gv = Math.round(envF('PF_CB_GRIDV', 140));
    const oracleN = Math.round(envF('PF_CB_ORACLE', 12)); // final audit (same as STRATA ⇒ comparable)
    const oracleRef = Math.round(envF('PF_CB_ORACLE_REF', 8)); // cheaper oracle while refining
    const ADAPT = process.env.PF_CB_ADAPT !== '0'; // resolution-bounded oracle (on by default; =0 for the STRATA ruler)
    const DIRECTED = envOn('PF_CB_DIRECTED');
    const SNAP = envOn('PF_CB_SNAP');
    const REPROJ = envOn('PF_CB_REPROJECT');
    const AR = envF('PF_CB_AR', 8); // aspect cap for directed splits
    const FLOOR_MM = envF('PF_CB_FLOOR_UM', 1.5) / 1000;
    const WELD_MM = envF('PF_CB_WELD_UM', 0.05) / 1000;
    const COLLAPSE_MM = envF('PF_CB_COLLAPSE_UM', 1) / 1000;
    const SNAP_ALPHA = envF('PF_CB_SNAP_ALPHA', 0.12); // reject crossings within α of an endpoint (sliver guard)
    const REPROJ_FRAC = envF('PF_CB_REPROJ_FRAC', 0.15); // max transverse move as a fraction of |ab|
    const KINK_RATIO = envF('PF_CB_KINK_RATIO', 0.15); // small/big above this ⇒ crease-or-jump (smooth ≈ 0.0625)
    const JUMP_RATIO = envF('PF_CB_JUMP_RATIO', 0.62); // small/big above this ⇒ C0 JUMP (needs a curtain, not a snap)
    const KINK_SCAN = Math.round(envF('PF_CB_KINK_SCAN', 16));
    const KINK_HALVINGS = Math.round(envF('PF_CB_KINK_HALVINGS', 24));
    const STAGE = process.env.PF_CB_STAGE ?? 'ring'; // 'ring' (outer wall only) | 'solid' (closed printable pot)
    const wallT = envF('PF_CB_WALLT', 4);          // inner-wall thickness (mm)
    const floorZ = envF('PF_CB_FLOORZ', 10);       // cavity floor height (mm)
    const innerDiv = Math.round(envF('PF_CB_INNERDIV', 256));
    const innerRings = Math.round(envF('PF_CB_INNERRINGS', 48));
    const NOWELD = process.env.PF_CB_NOWELD !== '0'; // refuse splits whose new vertex welds onto an existing one
    const FLIP_ON = envOn('PF_CB_FLIP');            // locus-safe 2-2 edge flips to unblock refused collapses
    const NUDGE_LADDER = (process.env.PF_CB_NUDGE ?? '0.5,0.42,0.58,0.35,0.65,0.28,0.72,0.21,0.79,0.15,0.85')
      .split(',').map((x) => Number.parseFloat(x)).filter((x) => Number.isFinite(x) && x > 0 && x < 1);
    const DEBUG = envOn('PF_CB_DEBUG');
    // ── L4 θ-CURTAIN flags (BOTH DEFAULT OFF ⇒ this file reproduces the parent harness) ──
    const CURTAIN = envOn('PF_CB_CURTAIN');            // detect θ-jump loci, double the columns, stitch curtains
    const BR_EVAL = CURTAIN || envOn('PF_CB_CHAIN') || envOn('PF_CB_TRACE') || envOn('PF_CB_CURTAIN_EVAL'); // branch-aware analytic evaluation (ruler + detectors)
    const BR_EPS = envF('PF_CB_BR_EPS', 1e-9);          // branch-extraction offset in θ (rad)
    const LOC_EPS = envF('PF_CB_LOC_EPS', 1e-11);       // "this sample sits ON the locus" window (rad)
    const CURT_SCAN = Math.round(envF('PF_CB_CURT_SCAN', 8192));  // θ bins for the coarse jump scan
    const CURT_ZP = Math.round(envF('PF_CB_CURT_ZP', 23));        // z probes per θ bin
    const CURT_MERGE = envF('PF_CB_CURT_MERGE', 0.35);
    const CURT_ZFRAC = envF('PF_CB_CURT_ZFRAC', 0.9); // a column curtain requires a z-INVARIANT locus
    // ── L5 TRACED-CHAIN curtain: the curved-locus generalisation of the column curtain. Measured prerequisites:
    //    the loci are ORDER-PRESERVING (0 theta-order violations at 180/360/720 rows) and each is a GRAPH over z,
    //    so a chain is just a column whose theta varies per row -- and reprojection is a 1-D theta search at fixed z.
    // ── L6 TRACED-CONTOUR curtain (PF_CB_TRACE=1) — supersedes the per-row nearest-θ matcher of L5.
    //    MEASURED (research/exchange/_strataCkContour): CelticKnot's h0 loci are ONE family, and every locus is a
    //    GRAPH OVER z with |dθ/dz| ≤ 0.0329 rad/mm (= 1.48 mm arc per mm of z) — the analytic bound of the strand
    //    sine. There is NO square-root cusp: a coalescence is a TRANSVERSAL corner of the union boundary
    //    {minD ≤ strandW}, so both merging arcs have finite slope and chording them converges QUADRATICALLY. That is
    //    exactly what the row sweep showed (p90 7.573 → 0.684 µm and p99 320.8 → 22.1 µm for 4× rows ≈ 16×). What
    //    does NOT converge is IDENTITY and TERMINATION, and neither is a resolution problem:
    //      • the fixed-m chain model allocates m = max loci on ONE row (18) for ~116 monotone branches, so a branch
    //        whose life does not overlap that row can only exist by re-using a slot the matcher happens to give it;
    //      • a dormant slot is PARKED at a dead θ and still owns a grid column;
    //      • the greedy nearest-θ match can swap identities where two loci close below the match window.
    //    L6 replaces the guesswork with connectivity: march each locus as a curve (slope-continuity gate ⇒ a merge
    //    is detected instead of hopped), round each merge onto its partner, cut the curve into monotone branches,
    //    give every branch its own column slot, add every corner z as a ROW so a merge is a mesh vertex, and
    //    INTERPOLATE dormant slots between their live neighbours instead of parking them on dead geometry.
    const TRACE = envOn('PF_CB_TRACE');
    const CHAIN = envOn('PF_CB_CHAIN') || TRACE;
    const CHAIN_SCAN = Math.round(envF('PF_CB_CHAIN_SCAN', 16384));
    // Local re-bisection resolution. MEASURED: adjacent loci close to 1.10e-3 rad, so a 24-sample sweep of a
    // +/-0.02 rad window (1.67e-3 rad) is COARSER than the global scan and cannot separate them. 256 gives
    // 1.56e-4 rad -- seven times finer than the closest approach we measured.
    const CHAIN_LOCN = Math.round(envF('PF_CB_CHAIN_LOCN', 256));  // drop a uniform column within this fraction of a col pitch
    const PINCH_MM = envF('PF_CB_PINCH_UM', 0.1) / 1000; // |r+ − r−| below this ⇒ the curtain closes to a point
    const t0ms = Date.now();

    const styleParams: Record<string, number> = { ...registryDefaults(STYLE) };
    if (process.env.PF_CB_PARAMS !== undefined) Object.assign(styleParams, JSON.parse(process.env.PF_CB_PARAMS) as Record<string, number>);
    const rA = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);
    let rEvals = 0;
    const R = (th: number, z: number): number => { rEvals += 1; return rA(th, z); };

    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };

    // ───────────────────────────── GENERIC θ-JUMP LOCUS DETECTOR (no per-style code) ─────────────────────────────
    // FIND, then CLASSIFY — they are different tests and must not be conflated.
    //   FIND: cover [0,2π) with ABUTTING intervals and flag every one across which max_z |Δr| exceeds tol. Gap-free,
    //     so no jump can hide between samples. The previous centred form (|Δr| at d vs d/8, accept if ratio ≈ 1)
    //     was a broken finder: it only fires when the locus lands within d/8 of a bin CENTRE ⇒ ~25 % recall on an
    //     arbitrary style. MEASURED on CelticKnot: 834 loci found → 3117 after this fix (max/row 7 → 18, and 18 is
    //     exactly 3 columns × 3 strands × 2 silhouettes). BasketWeave was unaffected only by luck — its loci at
    //     2πk/16 sit exactly on bin centres whenever CURT_SCAN is a multiple of 16.
    //   CLASSIFY: bisect the bracket to machine precision, then take the ε→0 LIMIT. A jump keeps |r(θ*+ε) − r(θ*−ε)|
    //     ≥ tol as ε→0; a crease drives it to 0 linearly. This filter is load-bearing, not cosmetic — MEASURED on
    //     GothicArches it rejects 96/96 brackets (|Δr| 143 µm at ε=1e-3 → 0.000 µm at ε=1e-9), which is what keeps
    //     the curtain a no-op on a style that has no h0 at all.
    const jumpLoci: number[] = [];      // θ ∈ [0,2π), ascending, of every detected h0 θ-locus
    let curtScanEvals = 0; let curtBrackets = 0; let curtRejected = 0; let curtSnaking = 0;
    if (BR_EVAL) {
      const zProbes: number[] = [];
      for (let k = 1; k <= CURT_ZP; k += 1) zProbes.push((H * k) / (CURT_ZP + 1));
      const d1 = TWO_PI / CURT_SCAN;
      const jSpan = (x: number, y: number): number => { let m = 0; for (const z of zProbes) m = Math.max(m, Math.abs(R(y, z) - R(x, z))); return m; };
      const brackets: Array<[number, number]> = [];
      let runStart = 0; let prevIn = false;
      const rPrev = new Float64Array(zProbes.length);
      for (let k = 0; k < zProbes.length; k += 1) rPrev[k] = R(0, zProbes[k]);
      for (let i = 1; i <= CURT_SCAN; i += 1) {
        const th = (TWO_PI * i) / CURT_SCAN;
        let d = 0;
        for (let k = 0; k < zProbes.length; k += 1) { const c = R(canon(th), zProbes[k]); d = Math.max(d, Math.abs(c - rPrev[k])); rPrev[k] = c; }
        const isIn = d > TOL;
        if (isIn && !prevIn) runStart = th - d1;
        if (!isIn && prevIn) brackets.push([runStart, th]);
        prevIn = isIn;
      }
      if (prevIn) brackets.push([runStart, TWO_PI]);
      curtBrackets = brackets.length;
      const raw: number[] = [];
      for (const [a0, b0] of brackets) {
        let lo = a0; let hi = b0;
        for (let it = 0; it < 70; it += 1) {
          const mid = 0.5 * (lo + hi);
          if (mid <= lo || mid >= hi) break;
          if (jSpan(canon(lo), canon(mid)) >= jSpan(canon(mid), canon(hi))) hi = mid; else lo = mid;
        }
        const th = 0.5 * (lo + hi);
        // VERTICALITY / FAIL-CLOSED APPLICABILITY. A doubled COLUMN can only represent a locus that is the same θ at
        // every z. The bracket scan maxes over z, so a SNAKING locus (CelticKnot's |localU − amp·sin(v·frq+φ)| =
        // strandW) projects onto a θ where a jump exists at only a few z — building a column there would be a lie.
        // Require the jump at ≥ CURT_ZFRAC of the z probes; otherwise refuse and COUNT it, so the mechanism reports
        // exactly what it cannot represent instead of silently mis-meshing it.
        let nHit = 0;
        for (const z of zProbes) {
          const j9 = Math.abs(R(canon(th + 1e-9), z) - R(canon(th - 1e-9), z));
          const j3 = Math.abs(R(canon(th + 1e-3), z) - R(canon(th - 1e-3), z));
          if (j9 > TOL && j9 > 0.5 * j3) nHit += 1;
        }
        const frac = nHit / zProbes.length;
        if (frac >= CURT_ZFRAC) raw.push(th);
        else if (nHit > 0) { curtSnaking += 1; curtRejected += 1; }
        else curtRejected += 1;
      }
      // canonicalize + cyclic dedup (the θ=0 locus is found twice: once at the scan start, once at 2π)
      const cyc = (a: number, b: number): number => { const d = Math.abs(a - b) % TWO_PI; return Math.min(d, TWO_PI - d); };
      for (const x0 of raw) {
        let v = x0 % TWO_PI; if (v < 0) v += TWO_PI;
        if (v >= TWO_PI - 1e-9 || v <= 1e-9) v = 0;   // 2π ≡ 0 — the seam locus must be EXACTLY 0
        if (!jumpLoci.some((u) => cyc(u, v) < 1e-6)) jumpLoci.push(v);
      }
      jumpLoci.sort((a, b) => a - b);
      curtScanEvals = rEvals;
    }
    /** the detected locus this θ sits on (cyclic, within LOC_EPS), or NaN. */
    const locusNear = (theta: number): number => {
      for (let i = 0; i < jumpLoci.length; i += 1) {
        const d = Math.abs(theta - jumpLoci[i]);
        if (d < LOC_EPS || TWO_PI - d < LOC_EPS) return jumpLoci[i];
      }
      return NaN;
    };
    /** branch-aware analytic evaluation: at a jump the surface is TWO-VALUED, so a sample landing ON the locus
     *  (within LOC_EPS) is read on the branch `br` its triangle/edge represents. br = 0 ⇒ plain evaluation. */
    const Rbr = (thU: number, z: number, locU: number, br: number): number =>
      (br !== 0 && Math.abs(thU - locU) < LOC_EPS ? R(canon(locU + br * BR_EPS), z) : R(canon(thU), z));

    // ───────────────────────────── mesh store (θ,z) with 3D spatial-hash weld ─────────────────────────────
    const vth: number[] = []; const vz: number[] = []; const vx: number[] = []; const vy: number[] = [];
    const vFeat: boolean[] = []; // vertex sits ON a detected feature locus
    // ── L4: BRANCH TAGS. vLocTh[v] = the θ of the jump locus this vertex sits on (NaN = not on one);
    //    vBranch[v] ∈ {−1,+1} = which side's limit its radius carries, 0 = a PINCH (the two branches coincide).
    //    These two fields are the whole "double-valued vertex": everything else (refinement, ruler, detector) reads
    //    the branch from them instead of re-evaluating rA AT the locus, where rA is branch-arbitrary.
    const vLocTh: number[] = []; const vBranch: number[] = [];
    let addVNew = false;         // did the last addV CREATE a vertex, or weld onto an existing one?
    const gcell = new Map<string, number[]>();
    const gi = (v: number): number => Math.floor(v / WELD_MM);
    /** `br` ≠ 0 ⇒ the vertex is placed AT θ but carries the radius of the branch θ+br·ε — the explicit-radius
     *  variant demanded by a double-valued locus. `addV` (br = 0) is byte-identical to the parent harness. */
    const addV = (thetaRaw: number, z: number, feat = false, br = 0, locTh = NaN): number => {
      const theta = canon(thetaRaw);
      const r = br !== 0 ? R(canon(theta + br * BR_EPS), z) : R(theta, z);
      const x = r * Math.cos(theta); const y = r * Math.sin(theta);
      const cx = gi(x); const cy = gi(y); const cz = gi(z);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const list = gcell.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (list === undefined) continue;
        for (const j of list) if (Math.hypot(vx[j] - x, vy[j] - y, vz[j] - z) <= WELD_MM) { if (feat) vFeat[j] = true; addVNew = false; return j; }
      }
      const idx = vth.length;
      addVNew = true;
      vth.push(theta); vz.push(z); vx.push(x); vy.push(y); vFeat.push(feat);
      // Tag ANY vertex that lands on a detected locus, curtain or not — the ruler needs to know a sample sits on a
      // two-valued locus even in the control run where no curtain was built.
      vLocTh.push(Number.isNaN(locTh) && BR_EVAL && !CHAIN ? locusNear(theta) : locTh); vBranch.push(br);
      const key = `${cx},${cy},${cz}`;
      const b = gcell.get(key); if (b === undefined) gcell.set(key, [idx]); else b.push(idx);
      return idx;
    };
    const onLoc = (v: number): boolean => !Number.isNaN(vLocTh[v]);
    /** Branch context of an EDGE: non-zero only when both ends sit on the SAME locus. A pinch (branch 0) inherits
     *  the other end's branch; opposite branches (a curtain cross-edge) yield 0 — its footprint is degenerate. */
    const edgeBranch = (a: number, b: number): number => {
      if (!BR_EVAL || !onLoc(a) || vLocTh[a] !== vLocTh[b]) return 0;
      const ba = vBranch[a]; const bb = vBranch[b];
      if (ba !== 0 && bb !== 0) return ba === bb ? ba : 0;
      return ba !== 0 ? ba : bb;
    };
    /** shortest-arc θ delta from a to b (handles the θ=0≡2π seam). */
    const dTh = (a: number, b: number): number => {
      let d = vth[b] - vth[a];
      if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI;
      return d;
    };
    /** point on edge (a,b) at parameter t∈[0,1], as (θ,z) — shortest arc. */
    const edgeParam = (a: number, b: number, t: number): [number, number] => [vth[a] + dTh(a, b) * t, vz[a] + (vz[b] - vz[a]) * t];

    const ta: number[] = []; const tb: number[] = []; const tc: number[] = []; const alive: boolean[] = [];
    const BIG = 1 << 27;
    const edgeMap = new Map<number, number[]>();
    const eKey = (a: number, b: number): number => (a < b ? a * BIG + b : b * BIG + a);
    const eAdd = (a: number, b: number, t: number): void => { const k = eKey(a, b); const l = edgeMap.get(k); if (l === undefined) edgeMap.set(k, [t]); else l.push(t); };
    const eDel = (a: number, b: number, t: number): void => { const l = edgeMap.get(eKey(a, b)); if (l === undefined) return; const i = l.indexOf(t); if (i >= 0) l.splice(i, 1); };
    const addT = (a: number, b: number, c: number): number => {
      if (a === b || b === c || c === a) return -1;
      const t = ta.length;
      ta.push(a); tb.push(b); tc.push(c); alive.push(true);
      eAdd(a, b, t); eAdd(b, c, t); eAdd(c, a, t);
      return t;
    };
    const killT = (t: number): void => { alive[t] = false; eDel(ta[t], tb[t], t); eDel(tb[t], tc[t], t); eDel(tc[t], ta[t], t); };
    const eLen = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);

    // ───────────────────────────── THE GENERIC 1-D KINK LOCATOR ─────────────────────────────
    // Segment (th0,z0) → (th1,z1) in (θ,z). Returns the parameter of the gradient discontinuity + its class.
    // Direction-agnostic: this is the ONLY detector, and it is applied to whatever segment we hand it — mesh edges
    // (any orientation) and transverse probes. No z-scan, no θ-scan, no axis projection anywhere.
    interface Kink { t: number; big: number; ratio: number; jump: boolean }
    const locateKink = (th0: number, z0: number, th1: number, z1: number, locU = NaN, br = 0): Kink | null => {
      const dth = th1 - th0; const dz = z1 - z0;
      const at = (t: number): number => Rbr(th0 + dth * t, z0 + dz * t, locU, br);
      // 1. coarse scan
      const N = KINK_SCAN;
      const rs = new Float64Array(N + 1);
      for (let k = 0; k <= N; k += 1) rs[k] = at(k / N);
      let bi = -1; let bv = 0;
      for (let k = 1; k < N; k += 1) { const d2 = Math.abs(rs[k + 1] - 2 * rs[k] + rs[k - 1]); if (d2 > bv) { bv = d2; bi = k; } }
      if (bi < 0 || bv <= 0) return null;
      // 2. bracket-halving kink bisection — keep the half with the larger |Δ²r|. Converges on the kink itself,
      //    NOT on the argmax bin centre; this is what buys sub-µm placement.
      let lo = (bi - 1) / N; let hi = (bi + 1) / N;
      let fLo = rs[bi - 1]; let fHi = rs[bi + 1]; let fMid = rs[bi];
      for (let it = 0; it < KINK_HALVINGS; it += 1) {
        const mid = 0.5 * (lo + hi);
        const q1 = 0.5 * (lo + mid); const q3 = 0.5 * (mid + hi);
        const fq1 = at(q1); const fq3 = at(q3);
        const dL = Math.abs(fLo - 2 * fq1 + fMid);
        const dR = Math.abs(fMid - 2 * fq3 + fHi);
        if (dL >= dR) { hi = mid; fHi = fMid; fMid = fq1; } else { lo = mid; fLo = fMid; fMid = fq3; }
      }
      const tStar = 0.5 * (lo + hi);
      // 3. TWO-SCALE class test AT the located point (window = the original bracket half-width)
      const w = 1 / N;
      const c = at(tStar);
      const big = Math.abs(at(tStar + w) - 2 * c + at(tStar - w));
      const small = Math.abs(at(tStar + w / 4) - 2 * c + at(tStar - w / 4));
      if (big <= 1e-12) return null;
      const ratio = small / big;
      if (ratio < KINK_RATIO) return null; // smooth curvature peak (≈1/16) — density handles it
      return { t: tStar, big, ratio, jump: ratio > JUMP_RATIO };
    };

    // ───────────────────────────── EDGE CHORD SAG (the anisotropy driver) ─────────────────────────────
    // max distance from the true surface curve over the edge's parametric span to the straight 3D edge.
    const ES_N = Math.round(envF('PF_CB_ESN', 8));
    const edgeSagN = (a: number, b: number, N: number, ovLocU = NaN, ovBr = 0): number => {
      const ax = vx[a]; const ay = vy[a]; const az = vz[a];
      let ex = vx[b] - ax; let ey = vy[b] - ay; let ez = vz[b] - az;
      const eL2 = ex * ex + ey * ey + ez * ez;
      if (eL2 < 1e-24) return 0;
      const th0 = vth[a]; const d = dTh(a, b); const z0 = vz[a]; const dz = vz[b] - vz[a];
      // BRANCH: an edge running ALONG a locus has EVERY interior sample sitting exactly on it — read the branch the
      // edge carries, or the ruler compares the r− sheet against the r+ limit and manufactures the whole jump.
      const brT = edgeBranch(a, b);
      const br = ovBr !== 0 ? ovBr : brT;
      let locU = NaN;
      if (ovBr !== 0) { locU = ovLocU; while (locU - th0 > Math.PI) locU -= TWO_PI; while (th0 - locU > Math.PI) locU += TWO_PI; }
      else if (brT !== 0) locU = th0;
      // A CURVED curtain edge is the branch curve itself: EVERY interior sample is meant to sit on the locus, where
      // rA is branch-arbitrary (a floor() at an integer). Rbr only substitutes the branch limit within LOC_EPS of a
      // FIXED locU, which is true for a straight column and false for a traced chain — so on a chain the sampler
      // reads ±600 µm essentially at random. That is not a fidelity signal, it is an undefined evaluation, and since
      // it drives the DIRECTED split priority it makes refinement chase curtain edges to the 1.5 µm floor forever.
      // On the traced path, read the edge's OWN branch limit at every sample. Not a whitewash: a MISPLACED curtain
      // then reads its true distance to the surface at those θ, and placement is measured independently.
      const brAll = TRACE && br !== 0;
      let best = 0;
      for (let k = 1; k < N; k += 1) {
        const t = k / N;
        const th = th0 + d * t; const z = z0 + dz * t;
        const r = brAll ? R(canon(th + br * BR_EPS), z) : Rbr(th, z, locU, br);
        const px = r * Math.cos(th) - ax; const py = r * Math.sin(th) - ay; const pz = z - az;
        const proj = (px * ex + py * ey + pz * ez) / eL2;
        const qx = px - proj * ex; const qy = py - proj * ey; const qz = pz - proj * ez;
        const dist = Math.hypot(qx, qy, qz);
        if (dist > best) best = dist;
      }
      return best;
    };
    const edgeSag = (a: number, b: number): number => edgeSagN(a, b, ES_N);

    // ───────────────────────────── TRIANGLE SAG ORACLE ─────────────────────────────
    let argWa = 0; let argWb = 0; let argWc = 0; let argTheta = 0; let argZ = 0; let argR = 0; let argNl = 0; let argDd = 0; let argDB = 0; let argDC = 0;
    const sagOfN = (t: number, n: number): number => {
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const ax = vx[a]; const ay = vy[a]; const az = vz[a];
      let nx = (vy[b] - ay) * (vz[c] - az) - (vz[b] - az) * (vy[c] - ay);
      let ny = (vz[b] - az) * (vx[c] - ax) - (vx[b] - ax) * (vz[c] - az);
      let nz = (vx[b] - ax) * (vy[c] - ay) - (vy[b] - ay) * (vx[c] - ax);
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-18) return 0;
      nx /= nl; ny /= nl; nz /= nl;
      const th0 = vth[a]; const dB = dTh(a, b); const dC = dTh(a, c);
      // BRANCH CONTEXT — derived from GEOMETRY, never from the mesher's own tags, so the ruler is the same
      // instrument whether or not a curtain was built. No triangle interior ever CROSSES a locus (grid columns are
      // never straddled and bisection only subdivides existing edges), so a triangle lies wholly on one side and
      // the side is the sign of (θ-centroid − θ*). Samples that land exactly on the locus sub-simplex — a corner,
      // or a whole edge when two vertices share it — are then read on THAT side's branch.
      let locU = NaN; let locB = 0; let nonMask = 0;
      if (BR_EVAL) {
        const la = onLoc(a); const lb = onLoc(b); const lc = onLoc(c);
        if (la || lb || lc) {
          // The locus theta AT THE CENTROID's z, interpolated along the triangle's locus sub-simplex. For a straight
          // column this is just the column theta; for a traced chain it follows the curve, which is what makes the
          // side test correct for a chord that spans two rows.
          const lt: number[] = []; const lz: number[] = [];
          if (la) { lt.push(th0); lz.push(vz[a]); }
          if (lb) { lt.push(th0 + dB); lz.push(vz[b]); }
          if (lc) { lt.push(th0 + dC); lz.push(vz[c]); }
          const zc = (vz[a] + vz[b] + vz[c]) / 3;
          if (lt.length === 1) locU = lt[0];
          else { const dzl = lz[1] - lz[0]; locU = Math.abs(dzl) < 1e-12 ? 0.5 * (lt[0] + lt[1]) : lt[0] + ((lt[1] - lt[0]) * (zc - lz[0])) / dzl; }
          const thC = th0 + (dB + dC) / 3;
          locB = thC > locU + LOC_EPS ? 1 : thC < locU - LOC_EPS ? -1 : 0;
          nonMask = (la ? 0 : 1) | (lb ? 0 : 2) | (lc ? 0 : 4);
        }
      }
      let s = 0;
      for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
        const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
        const theta = th0 + wb * dB + wc * dC;
        const z = wa * vz[a] + wb * vz[b] + wc * vz[c];
        // A sample is read on the triangle's own branch only when it lies ON the locus sub-simplex, i.e. every
        // NON-locus vertex has zero barycentric weight (a corner, or a whole edge when two vertices share a chain).
        let r: number;
        if (locB !== 0) {
          const wNon = ((nonMask & 1) !== 0 ? wa : 0) + ((nonMask & 2) !== 0 ? wb : 0) + ((nonMask & 4) !== 0 ? wc : 0);
          r = wNon < 1e-12 ? R(canon(theta + locB * BR_EPS), z) : R(canon(theta), z);
        } else r = R(canon(theta), z);
        const dd = Math.abs((r * Math.cos(theta) - ax) * nx + (r * Math.sin(theta) - ay) * ny + (z - az) * nz);
        if (dd > s) {
          s = dd;
          // RULER FORENSICS: record the argmax sample so a suspicious reading can be attributed to
          // interpolation/wrap (theta,z outside the footprint), the evaluator (r off the local surface), or a
          // degenerate plane normal (nl). Written only on improvement, so the cost is negligible.
          argWa = wa; argWb = wb; argWc = wc; argTheta = theta; argZ = z; argR = r; argNl = nl; argDd = dd;
          argDB = dB; argDC = dC;
        }
      }
      return s;
    };
    // RESOLUTION-BOUNDED oracle. MEASURED TRAP: a FIXED barycentric sample count under-reports by up to 11× on a
    // coarse triangle straddling a thin sharp feature (GothicArches rib: 110 µm @ n=8, 790 µm @ n=12, 1257 µm @ n=44
    // — same triangle). That corrupts the priority queue (worst triangles look mild ⇒ never popped) AND the verdict.
    // Sampling must be bounded in ABSOLUTE mm, not in triangle fractions.
    const sagAdaptive = (t: number, hSample: number, nMin: number, nMax: number): number => {
      const le = Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
      const n = Math.max(nMin, Math.min(nMax, Math.ceil(le / hSample)));
      return sagOfN(t, n);
    };
    const REF_HS = envF('PF_CB_REF_HS', 0.15); const REF_NMIN = Math.round(envF('PF_CB_REF_NMIN', 6)); const REF_NMAX = Math.round(envF('PF_CB_REF_NMAX', 24));
    const AUD_HS = envF('PF_CB_AUD_HS', 0.03); const AUD_NMIN = Math.round(envF('PF_CB_AUD_NMIN', 12)); const AUD_NMAX = Math.round(envF('PF_CB_AUD_NMAX', 64));

    // ───────────────────────────── INIT: uniform θ×z grid, C0 z-bands ─────────────────────────────
    const zSteps: number[] = [];
    {
      const nZ = 12000; const d1 = H / nZ; const d2 = d1 / 8;
      const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
      let run = -1; let bestJ2 = 0; let bestZ = 0;
      const flush = (): void => { if (run >= 0) { zSteps.push(bestZ); run = -1; bestJ2 = 0; } };
      for (let j = 1; j < nZ; j += 1) {
        const z = H * (j / nZ);
        let j1 = 0; let j2 = 0;
        for (const th of probes) {
          j1 = Math.max(j1, Math.abs(R(th, z + d1) - R(th, z - d1)));
          j2 = Math.max(j2, Math.abs(R(th, z + d2) - R(th, z - d2)));
        }
        if (j2 > 0.8 * j1 && j1 > TOL) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
      }
      flush();
    }
    const stepEps = envF('PF_CB_STEP_EPS_UM', 4) / 1000;
    // ───── PER-ROW LOCUS FINDER + CHAIN TRACER (generic; the curved-locus analogue of the column detector) ─────
    // Same FIND/CLASSIFY split as the column detector, but at ONE z: gap-free abutting-interval bracketing (so no
    // jump can hide between samples), bisect, then the epsilon->0 limit verdict (so creases are rejected).
    const lociAtZ = (z: number): number[] => {
      const dth = TWO_PI / CHAIN_SCAN;
      const brk: Array<[number, number]> = [];
      let start = 0; let prevIn = false; let prevR = R(0, z);
      for (let i = 1; i <= CHAIN_SCAN; i += 1) {
        const th = (TWO_PI * i) / CHAIN_SCAN;
        const cur = R(canon(th), z);
        const isIn = Math.abs(cur - prevR) > TOL;
        if (isIn && !prevIn) start = th - dth;
        if (!isIn && prevIn) brk.push([start, th]);
        prevIn = isIn; prevR = cur;
      }
      if (prevIn) brk.push([start, TWO_PI]);
      const res: number[] = [];
      for (const [a0, b0] of brk) {
        let lo = a0; let hi = b0;
        for (let it = 0; it < 60; it += 1) {
          const mid = 0.5 * (lo + hi);
          if (mid <= lo || mid >= hi) break;
          if (Math.abs(R(canon(mid), z) - R(canon(lo), z)) >= Math.abs(R(canon(hi), z) - R(canon(mid), z))) hi = mid; else lo = mid;
        }
        const th = 0.5 * (lo + hi);
        const j9 = Math.abs(R(canon(th + BR_EPS), z) - R(canon(th - BR_EPS), z));
        const j3 = Math.abs(R(canon(th + 1e-3), z) - R(canon(th - 1e-3), z));
        if (j9 > TOL && j9 > 0.5 * j3) res.push(canon(th) >= TWO_PI - 1e-9 ? 0 : canon(th));
      }
      res.sort((x, y) => x - y);
      const uq: number[] = [];
      for (const x of res) if (!uq.some((u) => Math.min(Math.abs(u - x), TWO_PI - Math.abs(u - x)) < 1e-6)) uq.push(x);
      return uq;
    };
    /** REPROJECT: the locus theta at this z, nearest to a predicted theta. This is what keeps a chord vertex ON the
     *  curve when refinement bisects a chain edge -- the piece the earlier crease-cut prototype lacked. */
    const locusThNear = (z: number, thPred: number, win: number, nSamp = 0): number => {
      const N = nSamp > 0 ? nSamp : CHAIN_LOCN;
      let bestLo = NaN; let bestD = Infinity;
      let pr = R(canon(thPred - win), z);
      for (let i = 1; i <= N; i += 1) {
        const th = thPred - win + (2 * win * i) / N;
        const cur = R(canon(th), z);
        if (Math.abs(cur - pr) > TOL) {
          let lo = th - (2 * win) / N; let hi = th;
          for (let it = 0; it < 60; it += 1) {
            const mid = 0.5 * (lo + hi);
            if (mid <= lo || mid >= hi) break;
            if (Math.abs(R(canon(mid), z) - R(canon(lo), z)) >= Math.abs(R(canon(hi), z) - R(canon(mid), z))) hi = mid; else lo = mid;
          }
          const c = 0.5 * (lo + hi); const d = Math.abs(c - thPred);
          if (d < bestD) { bestD = d; bestLo = c; }
        }
        pr = cur;
      }
      return bestLo;
    };
    // ───────────────────── L6: LOCUS CURVE TRACER (generic; connectivity, not per-row re-detection) ─────────────────
    const TR_RBAR = 0.5 * (DIMS.Rb + DIMS.Rt);   // mm — expresses a θ offset as arc length; no per-style content
    const TR_DZ0 = envF('PF_CB_TR_DZ0', 1.0);
    const TR_DZFIRST = envF('PF_CB_TR_DZFIRST', 0.02);
    const TR_DZMIN = envF('PF_CB_TR_DZMIN', 1e-7);
    const TR_WIN0 = envF('PF_CB_TR_WIN0', 1.5e-3);    // rad — corrector half-window FLOOR (~68 µm arc)
    const TR_WINCAP = envF('PF_CB_TR_WINCAP', 8e-3);  // rad — hard cap, well under the 0.09 rad median inter-locus gap
    const TR_WINN = Math.round(envF('PF_CB_TR_WINN', 32));
    const TR_SLOPETOL = envF('PF_CB_TR_SLOPETOL', 4e-3); // rad/mm
    // A TRUE merge has its partner at distance → 0 (two arcs crossing transversally separate like Δslope·δz, so
    // 1 µm below the death they are 7e-8 rad apart). A WIDE window therefore does not help recall — it only lets a
    // branch that died for some other reason hop onto an unrelated neighbour 450 µm away, which then shows up as a
    // branch that jumps in θ and puts a CYCLE in the slot-order graph.
    const TR_MERGEWIN = envF('PF_CB_TR_MERGEWIN', 1e-4);
    const TR_CHORD = envF('PF_CB_TR_CHORD', 0.004);   // mm arc — traced-polyline chord tolerance
    const TR_SEEDROWS = Math.round(envF('PF_CB_TR_SEEDROWS', 24));
    const TR_CORRWIN = envF('PF_CB_TR_CORRWIN', 5e-4); // rad — window when re-solving a branch θ at a mesh row
    const TR_REPROJWIN = envF('PF_CB_TR_REPROJWIN', 4e-3); // rad — window when re-solving a bisected curtain midpoint
    /** every θ-jump inside [c−w, c+w] at this z (a LOCAL scan, far finer than the global one).
     *  The bisection CACHES its endpoint radii (1 rA eval per halving instead of 4) — the tracer calls this on every
     *  march step, so the constant matters. */
    const lociWinAll = (z: number, c: number, w: number, n: number): number[] => {
      const res: number[] = [];
      let pr = R(canon(c - w), z);
      for (let i = 1; i <= n; i += 1) {
        const th = c - w + (2 * w * i) / n;
        const cur = R(canon(th), z);
        if (Math.abs(cur - pr) > TOL) {
          let lo = th - (2 * w) / n; let hi = th;
          let rLo = pr; let rHi = cur;
          for (let it = 0; it < 40; it += 1) {
            const mid = 0.5 * (lo + hi);
            if (mid <= lo || mid >= hi) break;
            const rMid = R(canon(mid), z);
            if (Math.abs(rMid - rLo) >= Math.abs(rHi - rMid)) { hi = mid; rHi = rMid; } else { lo = mid; rLo = rMid; }
          }
          const c2 = 0.5 * (lo + hi);
          if (Math.abs(R(canon(c2 + BR_EPS), z) - R(canon(c2 - BR_EPS), z)) > TOL) res.push(c2);
        }
        pr = cur;
      }
      res.sort((x, y) => x - y);
      const uq: number[] = [];
      for (const x of res) if (!uq.some((u) => Math.abs(u - x) < 1e-11)) uq.push(x);
      return uq;
    };
    const trCorrect = (z: number, thPred: number, win: number): number => {
      const L = lociWinAll(z, thPred, win, TR_WINN);
      let best = NaN; let bd = Infinity;
      for (const x of L) { const d = Math.abs(x - thPred); if (d < bd) { bd = d; best = x; } }
      return best;
    };
    interface TrMarch { pts: Array<[number, number]>; end: 'domain' | 'merge' | 'dead'; endTh: number; endZ: number; partner: number }
    /** march ONE locus branch from (th0,z0) in z-direction `dir`. The SLOPE-CONTINUITY GATE is what makes this a
     *  tracer rather than a re-detector: at a merge the partner arc has the opposite slope, so an inconsistent
     *  candidate is a HOP and is refused — the step then shrinks until the death point is bisected exactly. */
    const trMarch = (th0: number, z0: number, dir: number, zLo: number, zHi: number): TrMarch => {
      const pts: Array<[number, number]> = [[th0, z0]];
      let th = th0; let z = z0; let dz = TR_DZFIRST; let slope = 0; let haveSlope = false;
      let guard = 400000;
      for (;;) {
        if (guard-- <= 0) return { pts, end: 'dead', endTh: th, endZ: z, partner: NaN };
        let zN = z + dir * dz;
        if (zN > zHi) zN = zHi;
        if (zN < zLo) zN = zLo;
        if (Math.abs(zN - z) < 1e-12) return { pts, end: 'domain', endTh: th, endZ: z, partner: NaN };
        const pred = th + (haveSlope ? slope * (zN - z) : 0);
        const win = Math.min(TR_WINCAP, TR_WIN0 + (haveSlope ? TR_SLOPETOL * Math.abs(zN - z) : 0));
        const thN = trCorrect(zN, pred, win);
        const okSlope = !haveSlope || (Number.isFinite(thN) && Math.abs((thN - th) / (zN - z) - slope) <= TR_SLOPETOL + 0.5 * Math.abs(slope));
        if (!Number.isFinite(thN) || !okSlope) {
          if (dz > TR_DZMIN) { dz *= 0.5; continue; }
          let lo = z; let hi = zN; let thLast = th;
          for (let it = 0; it < 60; it += 1) {
            const m = 0.5 * (lo + hi);
            if (m === lo || m === hi) break;
            const t2 = trCorrect(m, thLast + (haveSlope ? slope * (m - lo) : 0), Math.min(TR_WINCAP, TR_WIN0 + TR_SLOPETOL * Math.abs(m - lo)));
            if (Number.isFinite(t2) && Math.abs(t2 - thLast) < TR_WINCAP) { lo = m; thLast = t2; } else hi = m;
          }
          pts.push([thLast, lo]);
          const near = lociWinAll(lo - dir * 1e-6, thLast, TR_MERGEWIN, 128).filter((x) => Math.abs(x - thLast) > 1e-11);
          let partner = NaN; let bd = Infinity;
          for (const x of near) { const d = Math.abs(x - thLast); if (d < bd) { bd = d; partner = x; } }
          if (Number.isFinite(partner) && bd < TR_MERGEWIN) { trMergesT += 1; return { pts, end: 'merge', endTh: thLast, endZ: lo, partner }; }
          trDeadT += 1;
          return { pts, end: 'dead', endTh: thLast, endZ: lo, partner: NaN };
        }
        const zm = 0.5 * (z + zN);
        const thm = trCorrect(zm, 0.5 * (th + thN), Math.min(TR_WINCAP, TR_WIN0 + TR_SLOPETOL * Math.abs(zN - z)));
        if (Number.isFinite(thm)) {
          const dev = Math.abs(thm - 0.5 * (th + thN)) * TR_RBAR;
          if (dev > TR_CHORD && dz > 64 * TR_DZMIN) { dz *= 0.5; continue; }
          if (dev < 0.15 * TR_CHORD) dz = Math.min(TR_DZ0, dz * 1.7);
        }
        slope = (thN - th) / (zN - z); haveSlope = true;
        th = thN; z = zN;
        pts.push([th, z]);
        if (z >= zHi - 1e-12 || z <= zLo + 1e-12) return { pts, end: 'domain', endTh: th, endZ: z, partner: NaN };
      }
    };
    /** the whole curve through a seed: march up rounding every merge onto its partner, then march down, then join. */
    const trCurve = (th0: number, z0: number, zLo: number, zHi: number): Array<[number, number]> => {
      // CLOSURE. A closed locus curve (a "dome": two arcs meeting at a bottom and a top corner) is traversed
      // indefinitely by a merge-rounding marcher — the seed is not a corner, so it is never re-hit exactly. Close on
      // the CORNERS instead: revisiting a corner means the loop is complete, and the downward half is then pure
      // duplication and is skipped. Without this the tracer over-traces by ~15× (measured: 47,584 mm of arc for a
      // locus set whose true total length is ~3,200 mm).
      const corners: Array<[number, number]> = [];
      let closed = false;
      const half = (dir: number): Array<[number, number]> => {
        const acc: Array<[number, number]> = [];
        let th = th0; let z = z0; let d = dir; let hops = 0;
        const evalStart = rEvals;
        for (;;) {
          const m = trMarch(th, z, d, zLo, zHi);
          for (let i = 1; i < m.pts.length; i += 1) acc.push(m.pts[i]);
          trHopsT += 1;
          // HARD BUDGET. A tracer that ping-pongs between two nearby points would otherwise burn the whole run; cap
          // the work per curve and COUNT the cap so a truncated trace is reported, never silently accepted.
          if (rEvals - evalStart > TR_BUDGET) { trBudgetHitT += 1; break; }
          if (m.end !== 'merge' || hops++ > 4000 || acc.length > 400000) break;
          if (corners.some((c) => Math.abs(c[0] - m.endTh) < 1e-5 && Math.abs(c[1] - m.endZ) < 1e-4)) { closed = true; break; }
          corners.push([m.endTh, m.endZ]);
          th = m.partner; z = m.endZ; d = -d;
          acc.push([th, z]);
        }
        return acc;
      };
      const up = half(+1);
      if (closed) { trClosedT += 1; return [[th0, z0] as [number, number], ...up]; }
      const dn = half(-1);
      return [...dn.slice().reverse(), [th0, z0] as [number, number], ...up];
    };
    /** live progress for a job whose stdout the fork pool buffers until the test ends (PF_CB_TR_LOG=1). */
    const TR_LOG = envOn('PF_CB_TR_LOG');
    const trLogPath = join('research', 'exchange', '_strataConformBisect', `trace_${STYLE.toLowerCase()}.log`);
    const trLog = (m: string): void => {
      if (!TR_LOG) return;
      mkdirSync(join('research', 'exchange', '_strataConformBisect'), { recursive: true });
      appendFileSync(trLogPath, `${((Date.now() - t0ms) / 1000).toFixed(1)}s ${(rEvals / 1e6).toFixed(1)}M | ${m}\n`);
    };
    // ── COLUMN SET: uniform columns, with every detected jump locus FORCED to be a column. A uniform column that
    //    falls inside CURTAIN_MERGE of a locus is dropped in the locus's favour (else the pair makes a sliver
    //    column). When gu already aligns (BasketWeave at gu=208: loci at 13k) this is a same-count substitution.
    const colTh: number[] = []; const colLoc: boolean[] = [];
    {
      const pitch = TWO_PI / gu;
      const cyc = (x: number, y: number): number => { const d = Math.abs(x - y) % TWO_PI; return Math.min(d, TWO_PI - d); };
      const cands: Array<[number, boolean]> = jumpLoci.map((t) => [t, true] as [number, boolean]);
      for (let i = 0; i < gu; i += 1) {
        const th = (TWO_PI * i) / gu;
        if (CURTAIN && jumpLoci.some((L) => cyc(L, th) < CURT_MERGE * pitch)) continue;
        cands.push([th, false]);
      }
      if (!CURTAIN) { cands.length = 0; for (let i = 0; i < gu; i += 1) cands.push([(TWO_PI * i) / gu, false]); }
      cands.sort((p, q) => p[0] - q[0]);
      for (const [t, L] of cands) { colTh.push(t); colLoc.push(L); }
    }
    const nc = colTh.length;
    let curtainTris = 0; let pinchVerts = 0; let curtainPairs = 0; let minBranchSepMm = Infinity;
    let chainsBuilt = 0; let chainMatched = 0; let chainHeld = 0; let chainReproj = 0; let chainReprojFail = 0;
    let chainRecovered = 0; let chainSuspect = 0; let chainSlots = 0; let chainTermSnap = 0;
    let trCurvesT = 0; let trBranchesT = 0; let trRowsAddedT = 0; let trOrderViolT = 0; let trSlotsT = 0; let slotBase = 0;
    let trAudTot = 0; let trAudMiss = 0; let trAudWorst = 0; let trAudAt = ''; let trGhost = 0; let trGhostTot = 0;
    let trHopsT = 0; let trMergesT = 0; let trDeadT = 0; let trDomT = 0; let trClosedT = 0; let trBudgetHitT = 0;
    let trCycleBreakT = 0; let trBackMaxT = 0; let trMinsepLive = 0; let trMinsepMax = 0; let trDemotedT = 0; let trLiveSlotsT = 0;
    const TR_AUDROWS = Math.round(envF('PF_CB_TR_AUDROWS', 16));
    const TR_BUDGET = Math.round(envF('PF_CB_TR_BUDGET', 4e6)); // rA evals per traced curve
    const TR_DEDUPE = envF('PF_CB_TR_DEDUPE', 0.2);  // mm arc — two branches this close at a shared z are one branch
    const TR_TIE = envF('PF_CB_TR_TIE', 0.01);       // mm arc — closer than this, the θ order is noise: no constraint
    const TERM_BISECT = Math.round(envF('PF_CB_TERM_BISECT', 14));
    const CHAIN_MATCH = envF('PF_CB_CHAIN_MATCH', 0.06);
    const CHAIN_WIN = envF('PF_CB_CHAIN_WIN', 0.02);
    const MINSEP = envF('PF_CB_CHAIN_MINSEP', 1e-5); // min theta between adjacent columns (rad); >> weld radius
    const bounds = [0, ...zSteps, H];
    for (let b = 0; b + 1 < bounds.length; b += 1) {
      const za = b === 0 ? 0 : bounds[b] + stepEps;
      const zb = b + 2 === bounds.length ? H : bounds[b + 1] - stepEps;
      const bandH = zb - za;
      if (bandH <= 0) continue;
      const rows = Math.max(1, Math.round((gv * bandH) / H));
      // gL[j][i] = the vertex bounding the cell on the MINUS side of column i (used as the RIGHT end of quad i−1→i)
      // gR[j][i] = the vertex bounding the cell on the PLUS side  (used as the LEFT end of quad i→i+1)
      // They are the same object except on a locus column, where the surface is two-valued.
      // ── CHAIN COLUMNS: trace each h0 locus across the band's rows, then lay the grid out as
      //    [chain 0, fillers, chain 1, fillers, …] with a FIXED column count so the rows still form quads.
      //    A chain that cannot be matched at a row HOLDS POSITION; the branch pair there measures |Δr|≈0 and the
      //    existing PINCH path collapses it to one vertex, so a coalesced chain costs nothing.
      let rowCols: number[][] = []; let colLocB: boolean[] = []; let ncB = nc; let chainIdx: number[] = [];
      // L6 adds two per-ROW quantities the column model never needed: an explicit z per row (so a merge corner can
      // BE a row) and a per-row liveness flag (so a dormant slot stops pretending to be a locus).
      let zRowB: number[] = []; let colLive: boolean[][] = [];
      if (TRACE) {
        // ── 1. TRACE the locus curves of this band by connectivity ──
        const seedsT: Array<[number, number]> = [];
        for (let s = 0; s < TR_SEEDROWS; s += 1) {
          const zs = za + (bandH * (s + 0.5)) / TR_SEEDROWS;
          for (const th of lociAtZ(zs)) seedsT.push([th, zs]);
        }
        const polys: Array<Array<[number, number]>> = [];
        const nearPoly = (th: number, z: number): number => {
          let best = Infinity;
          for (const p of polys) for (let i = 0; i + 1 < p.length; i += 1) {
            const a = p[i]; const c2 = p[i + 1];
            if (z < Math.min(a[1], c2[1]) - 1e-9 || z > Math.max(a[1], c2[1]) + 1e-9) continue;
            const u = Math.abs(c2[1] - a[1]) < 1e-12 ? 0 : (z - a[1]) / (c2[1] - a[1]);
            best = Math.min(best, Math.abs(a[0] + (c2[0] - a[0]) * u - th) * TR_RBAR);
          }
          return best;
        };
        trLog(`band ${b} z=[${za.toFixed(3)},${zb.toFixed(3)}] seeds ${seedsT.length}`);
        for (const [th, zs] of seedsT) {
          if (nearPoly(th, zs) < 0.05) continue;
          const e0 = rEvals;
          const pc = trCurve(th, zs, za, zb);
          polys.push(pc);
          trLog(`  curve ${polys.length}: ${pc.length} nodes, ${((rEvals - e0) / 1e3).toFixed(0)}k evals, seed θ=${th.toFixed(5)} z=${zs.toFixed(3)}`);
        }
        // ── 2. cut each curve into MONOTONE-in-z branches; the cut points ARE the merge corners ──
        interface TrBr { zs: number[]; ths: number[]; zLo: number; zHi: number; mean: number }
        const brs: TrBr[] = [];
        const pushSeg = (s: Array<[number, number]>): void => {
          if (s.length < 2) return;
          const asc = s[s.length - 1][1] >= s[0][1] ? s : s.slice().reverse();
          const zsA: number[] = []; const thA: number[] = [];
          for (const q of asc) { if (zsA.length > 0 && q[1] - zsA[zsA.length - 1] <= 0) continue; zsA.push(q[1]); thA.push(q[0]); }
          if (zsA.length < 2) return;
          const mean = thA.reduce((x, y) => x + y, 0) / thA.length;
          const cand: TrBr = { zs: zsA, ths: thA, zLo: zsA[0], zHi: zsA[zsA.length - 1], mean };
          // DEDUPE by GEOMETRY, not by z-extent: every curve is traced twice (both halves round the merges) and two
          // seeds on one curve give the same branch, but the two copies can differ slightly at the ends. Comparing
          // (zLo,zHi,mean) therefore lets near-duplicates through — and a duplicate pair is CO-LIVE at the SAME θ,
          // which makes their relative order arbitrary and puts a CYCLE in the slot-order constraint graph. Compare
          // where it is unambiguous: θ at the middle of the z-overlap.
          for (const e of brs) {
            const zA = Math.max(e.zLo, cand.zLo); const zB = Math.min(e.zHi, cand.zHi);
            if (zB <= zA) continue;
            const zm2 = 0.5 * (zA + zB);
            const at = (br: TrBr): number => {
              let lo = 0; let hi = br.zs.length - 1;
              while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (br.zs[mid] <= zm2) lo = mid; else hi = mid; }
              const d2 = br.zs[hi] - br.zs[lo];
              const u = Math.abs(d2) < 1e-15 ? 0 : Math.max(0, Math.min(1, (zm2 - br.zs[lo]) / d2));
              return br.ths[lo] + (br.ths[hi] - br.ths[lo]) * u;
            };
            if (Math.abs(at(e) - at(cand)) * TR_RBAR < TR_DEDUPE) return;
          }
          brs.push(cand);
        };
        for (const p of polys) {
          let start = 0; let dir = 0;
          for (let i = 1; i < p.length; i += 1) {
            const d = Math.sign(p[i][1] - p[i - 1][1]);
            if (d === 0) continue;
            if (dir === 0) { dir = d; continue; }
            if (d !== dir) { pushSeg(p.slice(start, i)); start = i - 1; dir = d; }
          }
          pushSeg(p.slice(start));
        }
        brs.sort((x, y) => x.mean - y.mean);
        const M = brs.length;
        trLog(`band ${b}: ${polys.length} curves → ${M} branches (hops ${trHopsT}, merges ${trMergesT}, dead ${trDeadT}, closed ${trClosedT}, budget-hits ${trBudgetHitT})`);
        trCurvesT += polys.length; trBranchesT += M;
        if (M === 0) {
          zRowB = []; for (let j = 0; j <= rows; j += 1) zRowB.push(za + (bandH * j) / rows);
          rowCols = zRowB.map(() => colTh.slice()); colLocB = colTh.map(() => false); ncB = colTh.length;
          chainIdx = colTh.map(() => -1); colLive = zRowB.map(() => colLocB);
        } else {
          // ── 3. ROWS = uniform ∪ every branch endpoint (so a merge corner is a mesh vertex, not a chord shortcut) ──
          const zSet: Array<[number, boolean]> = []; // z, isCorner
          for (let j = 0; j <= rows; j += 1) zSet.push([za + (bandH * j) / rows, false]);
          for (const br of brs) for (const zc of [br.zLo, br.zHi]) if (zc > za + 1e-3 && zc < zb - 1e-3) { zSet.push([zc, true]); trRowsAddedT += 1; }
          zSet.sort((x, y) => x[0] - y[0]);
          // MIN ROW SPACING is a WELD guard, not a nicety: two arcs meeting at a corner separate like Δslope·δz, so a
          // row δz below a corner puts the two branch columns ~0.066·δz rad apart. At δz = 1e-3 mm that is 3 µm of arc
          // = 60× the weld radius; any closer and the two columns would position-weld into one.
          // COLLISION RULE: when a corner lands within δz of a uniform row the CORNER WINS — dropping it would put the
          // branch termination up to 1.48·δz mm of arc away from the true merge, which is the very error being fixed.
          const zRowT: number[] = []; const zRowC: boolean[] = [];
          for (const [zz, isC] of zSet) {
            const n2 = zRowT.length;
            if (n2 === 0 || zz - zRowT[n2 - 1] > 1e-3) { zRowT.push(zz); zRowC.push(isC); continue; }
            if (isC && !zRowC[n2 - 1] && (n2 < 2 || zz - zRowT[n2 - 2] > 1e-3)) { zRowT[n2 - 1] = zz; zRowC[n2 - 1] = true; }
          }
          if (zRowT[zRowT.length - 1] < zb - 1e-9) zRowT[zRowT.length - 1] = zb;
          // ── 4. per-row slot θ: LIVE slots read their own branch; DORMANT slots are INTERPOLATED between their live
          //       neighbours (never parked on dead geometry, which is what made a dead column look like a locus) ──
          const brThAt = (br: TrBr, z: number): number => {
            let lo = 0; let hi = br.zs.length - 1;
            while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (br.zs[mid] <= z) lo = mid; else hi = mid; }
            const dzs = br.zs[hi] - br.zs[lo];
            const u = Math.abs(dzs) < 1e-15 ? 0 : Math.max(0, Math.min(1, (z - br.zs[lo]) / dzs));
            const thI = br.ths[lo] + (br.ths[hi] - br.ths[lo]) * u;
            const c2 = trCorrect(z, thI, TR_CORRWIN);
            return Number.isFinite(c2) ? c2 : thI;
          };
          // ── 4a. SLOT ORDER by TOPOLOGICAL SORT of the observed per-row θ order.
          // Sorting branches by MEAN θ is NOT order-consistent: two branches alive at the same row can have means in
          // the opposite order (arcs travel up to 0.42 rad in θ). MEASURED: 1,183 order violations on CelticKnot at
          // 355 branches — and a violated order is not cosmetic, because the MINSEP pass then rewrites every
          // offending column to `previous + 1e-5 rad`, compressing hundreds of columns into a sliver and leaving one
          // 1.19 rad gap (a 52 mm triangle appeared in the mesh). The order the grid needs is exactly the partial
          // order the rows impose, so take that: an edge a→b for every pair adjacent in θ on every row, then Kahn.
          // The cylinder is cut at the widest θ gap that no branch ever enters, which makes the cyclic order linear.
          let cut = 0;
          {
            const allTh: number[] = [];
            for (const br of brs) for (const t2 of br.ths) allTh.push(canon(t2));
            allTh.sort((x, y) => x - y);
            let bestG = -1;
            for (let i = 0; i < allTh.length; i += 1) {
              const nx = i + 1 === allTh.length ? allTh[0] + TWO_PI : allTh[i + 1];
              const g = nx - allTh[i];
              if (g > bestG) { bestG = g; cut = canon(allTh[i] + g / 2); }
            }
          }
          const key = (t2: number): number => canon(t2 - cut);
          const rowLive: Array<Array<[number, number]>> = []; // per row: [branch, key(θ)] ascending
          for (const z of zRowT) {
            const L2: Array<[number, number]> = [];
            for (let k = 0; k < M; k += 1) {
              if (z < brs[k].zLo - 1e-12 || z > brs[k].zHi + 1e-12) continue;
              L2.push([k, key(brThAt(brs[k], z))]);
            }
            L2.sort((x, y) => x[1] - y[1]);
            rowLive.push(L2);
          }
          const adj: Array<Set<number>> = Array.from({ length: M }, () => new Set<number>());
          const indeg = new Array<number>(M).fill(0);
          // TIE TOLERANCE: two branches converging on a merge can correct onto θ values a few nm apart, where the
          // sort order is noise. Constraining a noise-ordered pair is how a CYCLE gets into the graph, so only
          // constrain pairs that are unambiguously separated (1 µm of arc).
          for (const L2 of rowLive) for (let q = 0; q + 1 < L2.length; q += 1) {
            const a = L2[q][0]; const c3 = L2[q + 1][0];
            if ((L2[q + 1][1] - L2[q][1]) * TR_RBAR < TR_TIE) continue;
            if (!adj[a].has(c3)) { adj[a].add(c3); indeg[c3] += 1; }
          }
          const order: number[] = [];
          {
            const ready: number[] = [];
            for (let k = 0; k < M; k += 1) if (indeg[k] === 0) ready.push(k);
            const meanKey = brs.map((br) => key(br.mean));
            const done = new Array<boolean>(M).fill(false);
            while (order.length < M) {
              if (ready.length === 0) {
                // A residual cycle means the rows genuinely disagree. Break it at the smallest-θ survivor rather
                // than appending the rest arbitrarily, and COUNT it so a scrambled grid can never pass silently.
                let bestK = -1;
                for (let k = 0; k < M; k += 1) if (!done[k] && (bestK < 0 || meanKey[k] < meanKey[bestK])) bestK = k;
                if (bestK < 0) break;
                trCycleBreakT += 1; indeg[bestK] = 0; ready.push(bestK);
              }
              ready.sort((x, y) => meanKey[x] - meanKey[y]);
              const k = ready.shift() as number;
              if (done[k]) continue;
              done[k] = true; order.push(k);
              for (const nx of adj[k]) { indeg[nx] -= 1; if (indeg[nx] <= 0 && !done[nx]) ready.push(nx); }
            }
          }
          const slotOf = new Array<number>(M).fill(-1);
          for (let sIdx = 0; sIdx < M; sIdx += 1) slotOf[order[sIdx]] = sIdx;
          const slotTh: number[][] = []; const slotLive: boolean[][] = [];
          for (let jr2 = 0; jr2 < zRowT.length; jr2 += 1) {
            const th = new Array<number>(M).fill(NaN);
            const live = new Array<boolean>(M).fill(false);
            const li: number[] = [];
            for (const [k, tk] of rowLive[jr2]) { th[slotOf[k]] = tk; live[slotOf[k]] = true; trLiveSlotsT += 1; }
            // ORDER REPAIR = the fail-closed contract for the grid. If the topological order still puts two live
            // slots out of θ order at this row, the MINSEP pass downstream would rewrite the offender to
            // `previous + 1e-5 rad`, compressing the columns and opening a huge gap elsewhere (measured: a 92 mm
            // triangle and a 14.6 mm backward step). DEMOTE the offender to inert instead: the grid stays sound and
            // the cost is one un-curtained locus at one row, which is COUNTED and reported rather than hidden.
            {
              let prev = -Infinity;
              for (let k = 0; k < M; k += 1) {
                if (!live[k]) continue;
                if (th[k] <= prev + MINSEP) { live[k] = false; th[k] = NaN; trDemotedT += 1; continue; }
                prev = th[k];
              }
            }
            for (let k = 0; k < M; k += 1) if (live[k]) li.push(k);
            if (li.length === 0) { for (let k = 0; k < M; k += 1) th[k] = (TWO_PI * k) / M; }
            else {
              const first = li[0]; const last = li[li.length - 1];
              // DORMANT SLOTS ARE PARKED, NOT RE-INTERPOLATED PER ROW. A pure lerp between the live anchors makes an
              // inert column's θ depend on WHICH slots happen to be live at that row, so a birth or death one row
              // above can move that column by ~1 rad in a single row step — a 49 mm skewed quad. The plane ruler is
              // blind to it (the triangle is thin, so its plane passes near the surface) but the Hausdorff ruler
              // caught it at 6.0 mm, which is exactly r·(1−cos) for a 1.05 rad chord. Park each dormant slot on ITS
              // OWN branch, evaluated at the nearest z it was alive at: that is stationary in z by construction.
              // Fall back to the lerp per-run when the parked values are not strictly ordered inside the run.
              const fill = (a: number, c2: number, thA: number, thB: number): void => {
                const n2 = c2 - a;
                if (n2 <= 1) return;
                const park: number[] = [];
                let ok = true; let prev2 = thA;
                for (let k = a + 1; k < c2; k += 1) {
                  const br = brs[order[((k % M) + M) % M]];
                  const p2 = key(brThAt(br, Math.max(br.zLo, Math.min(br.zHi, zRowT[jr2]))));
                  let pv = p2; while (pv < prev2 - Math.PI) pv += TWO_PI; while (pv > prev2 + Math.PI) pv -= TWO_PI;
                  if (!(pv > prev2 + MINSEP)) { ok = false; break; }
                  park.push(pv); prev2 = pv;
                }
                if (ok && prev2 + MINSEP < thB) { for (let k = a + 1; k < c2; k += 1) th[k] = park[k - a - 1]; return; }
                const span = Math.max(MINSEP * n2, thB - thA);
                for (let k = a + 1; k < c2; k += 1) th[k] = thA + (span * (k - a)) / n2;
              };
              for (let q = 0; q + 1 < li.length; q += 1) fill(li[q], li[q + 1], th[li[q]], th[li[q + 1]]);
              const hiT = th[first] + TWO_PI;
              const wrapN = first + (M - 1 - last) + 1;
              {
                // the run that crosses the cut: slots last+1 … M−1 … 0 … first−1, anchored by th[last] and th[first]+2π
                const idx = (q: number): number => (last + q) % M;
                const park: number[] = []; let ok = true; let prev2 = th[last];
                for (let q = 1; q < wrapN; q += 1) {
                  const br = brs[order[idx(q)]];
                  let pv = key(brThAt(br, Math.max(br.zLo, Math.min(br.zHi, zRowT[jr2]))));
                  while (pv < prev2 - Math.PI) pv += TWO_PI;
                  while (pv > prev2 + Math.PI) pv -= TWO_PI;
                  if (!(pv > prev2 + MINSEP)) { ok = false; break; }
                  park.push(pv); prev2 = pv;
                }
                const use = ok && prev2 + MINSEP < hiT;
                const span = Math.max(MINSEP * wrapN, hiT - th[last]);
                for (let q = 1; q < wrapN; q += 1) {
                  const k = idx(q);
                  const v = use ? park[q - 1] : th[last] + (span * q) / wrapN;
                  th[k] = k > last ? v : v - TWO_PI;
                }
              }
              for (let q = 0; q + 1 < li.length; q += 1) if (th[li[q + 1]] <= th[li[q]]) { trOrderViolT += 1; trBackMaxT = Math.max(trBackMaxT, (th[li[q]] - th[li[q + 1]]) * TR_RBAR); }
            }
            slotTh.push(th); slotLive.push(live);
          }
          // ── 4b. COVERAGE AUDIT = the tracer's own closure invariant, in BOTH directions. A locus with no LIVE slot
          //       is an unmeshed 600 µm cliff that no refinement can ever remove; a live slot with no locus is a
          //       GHOST curtain planted on continuous geometry. Both are silent failures without this check.
          for (let s = 0; s < TR_AUDROWS; s += 1) {
            const jr = Math.min(zRowT.length - 1, Math.floor(((s + 0.5) * zRowT.length) / TR_AUDROWS));
            const z = zRowT[jr];
            const L = lociAtZ(z);
            const dcy = (x: number, y: number): number => { const d = Math.abs(x - y) % TWO_PI; return Math.min(d, TWO_PI - d); };
            for (const thq of L) {
              let bd = Infinity;
              for (let k = 0; k < M; k += 1) if (slotLive[jr][k]) bd = Math.min(bd, dcy(slotTh[jr][k] + cut, thq));
              trAudTot += 1;
              if (bd * TR_RBAR > 0.02) { trAudMiss += 1; if (bd * TR_RBAR > trAudWorst) { trAudWorst = bd * TR_RBAR; trAudAt = `θ=${thq.toFixed(6)} z=${z.toFixed(4)}`; } }
            }
            // GHOST test must be DIRECT, not "is there a locus in the row-scan list": the global scan bins θ at
            // 2π/16384 = 17 µm of arc, so two loci converging toward a merge collapse into ONE bracket and the second
            // live slot would be mis-reported as a ghost. Ask the surface instead — a live slot is honest iff its own
            // ε→0 two-sided difference really is a jump.
            for (let k = 0; k < M; k += 1) {
              if (!slotLive[jr][k]) continue;
              trGhostTot += 1;
              if (Math.abs(R(canon(slotTh[jr][k] + cut + BR_EPS), z) - R(canon(slotTh[jr][k] + cut - BR_EPS), z)) <= TOL) trGhost += 1;
            }
          }
          // ── 5. fillers + strict ordering (identical mechanism to the column path) ──
          const pitchT = TWO_PI / gu;
          const nSubT: number[] = new Array<number>(M).fill(1);
          for (let k = 0; k < M; k += 1) {
            let mx = 0;
            for (let j = 0; j < slotTh.length; j += 1) { const nx = slotTh[j][(k + 1) % M] + (k + 1 === M ? TWO_PI : 0); mx = Math.max(mx, nx - slotTh[j][k]); }
            nSubT[k] = Math.max(1, Math.ceil(mx / pitchT - 1e-9));
          }
          rowCols = []; colLive = [];
          for (let j = 0; j < slotTh.length; j += 1) {
            const rc: number[] = []; const lv: boolean[] = [];
            for (let k = 0; k < M; k += 1) {
              const a0 = slotTh[j][k] + cut; const b0 = slotTh[j][(k + 1) % M] + cut + (k + 1 === M ? TWO_PI : 0);
              rc.push(a0); lv.push(slotLive[j][k]);
              for (let q = 1; q < nSubT[k]; q += 1) { rc.push(a0 + ((b0 - a0) * q) / nSubT[k]); lv.push(false); }
            }
            for (let q = 1; q < rc.length; q += 1) if (rc[q] < rc[q - 1] + MINSEP) { if (lv[q]) { trMinsepLive += 1; trMinsepMax = Math.max(trMinsepMax, (rc[q - 1] + MINSEP - rc[q]) * TR_RBAR); } rc[q] = rc[q - 1] + MINSEP; }
            rowCols.push(rc); colLive.push(lv);
          }
          colLocB = []; chainIdx = [];
          for (let k = 0; k < M; k += 1) { colLocB.push(true); chainIdx.push(slotBase + k); for (let q = 1; q < nSubT[k]; q += 1) { colLocB.push(false); chainIdx.push(-1); } }
          ncB = colLocB.length;
          zRowB = zRowT;
          slotBase += M;
          trSlotsT += M;
          trLog(`band ${b}: rows ${zRowT.length} (uniform ${rows + 1} + corners), cols ${ncB}, coverage-miss ${trAudMiss}/${trAudTot}, ghost ${trGhost}/${trGhostTot}`);
        }
      } else if (CHAIN) {
        const zsB: number[] = [];
        for (let j = 0; j <= rows; j += 1) zsB.push(za + (bandH * j) / rows);
        const per = zsB.map(lociAtZ);
        let m = 0; let ref = 0;
        per.forEach((L, j) => { if (L.length > m) { m = L.length; ref = j; } });
        if (m === 0) { rowCols = zsB.map(() => colTh.slice()); colLocB = colLoc.slice(); ncB = nc; chainIdx = colTh.map(() => -1); }
        else {
          const chain: number[][] = new Array(rows + 1);
          chain[ref] = per[ref].slice();
          const cyd = (x: number, y: number): number => { const d = Math.abs(x - y) % TWO_PI; return Math.min(d, TWO_PI - d); };
          const prop = (from: number, to: number, step: number): void => {
            const wasHeld: boolean[] = new Array<boolean>(m).fill(false);
            for (let j = from; j !== to; j += step) {
              const prev = chain[j]; const prev2 = chain[j - step]; const cand = per[j + step].slice();
              const zNext = zsB[j + step];
              const used = new Set<number>(); const outR: number[] = new Array(m);
              for (let k = 0; k < m; k += 1) {
                // PREDICT one step, then FREEZE. A chain is a graph over z, so the next row's theta is the previous one plus
                // the recent slope. Freezing a stale theta is the one thing that must not happen: it plants a
                // curtain where the locus no longer is, and that wrong-branch strip is an h0 error refinement can
                // never remove (MEASURED: chord audit 2540 um exactly where chains were held).
                // Extrapolate only from a row that was itself RESOLVED, and cap the step. An unresolved chain that
                // keeps re-applying its last slope drifts linearly and runs off the geometry (MEASURED: chord audit
                // 2540 -> 16106 um when the slope was allowed to compound). One step of prediction buys the recall;
                // freezing after that keeps a dormant chain parked where it vanished, which SUSPECT=0 shows is safe.
                let pred = prev[k];
                if (prev2 !== undefined && !wasHeld[k]) {
                  let sl = prev[k] - prev2[k];
                  if (sl > CHAIN_MATCH) sl = CHAIN_MATCH; else if (sl < -CHAIN_MATCH) sl = -CHAIN_MATCH;
                  pred = prev[k] + sl;
                }
                chainSlots += 1;
                let best = -1; let bd = Infinity;
                for (let c = 0; c < cand.length; c += 1) { if (used.has(c)) continue; const d = cyd(cand[c], pred); if (d < bd) { bd = d; best = c; } }
                if (best >= 0 && bd < CHAIN_MATCH) { used.add(best); outR[k] = cand[best]; wasHeld[k] = false; chainMatched += 1; continue; }
                // RECOVERY: the global per-row scan merges two brackets when adjacent loci close below its bin
                // width. A LOCAL re-bisection around the predicted theta is far finer, so try that before giving up.
                const rec = locusThNear(zNext, canon(pred), CHAIN_WIN);
                if (Number.isFinite(rec)) { outR[k] = rec; wasHeld[k] = false; chainRecovered += 1; continue; }
                // TERMINATION GEOMETRY. A dormant chain must not be parked at an EXTRAPOLATED theta: the terminal
                // branch edge then chords straight from the last live locus point to a position the locus never
                // reached, cutting the corner as the curve bends away. Instead bisect in z for the point where the
                // locus actually ENDS, tracking theta down to it, and park there — so the terminal segment aims at
                // the true death point and its residual is the one-row sagitta rather than a whole slope step.
                let zLo = zsB[j]; let zHi = zNext; let thLast = prev[k]; let found = false;
                for (let it = 0; it < TERM_BISECT; it += 1) {
                  const zm = 0.5 * (zLo + zHi);
                  const t2 = locusThNear(zm, canon(thLast), CHAIN_WIN);
                  if (Number.isFinite(t2)) { zLo = zm; thLast = t2; found = true; } else zHi = zm;
                }
                if (found) chainTermSnap += 1;
                outR[k] = found ? thLast : prev[k];
                wasHeld[k] = true; chainHeld += 1;
                // AUDIT: an unresolved slot is only SAFE if there is genuinely no jump at the placed theta -- then
                // the branch pair measures |dr|~0 and the existing PINCH path collapses it to one vertex. If a jump
                // IS there, we have placed a curtain on the wrong locus; surface it instead of baking it in.
                if (Math.abs(R(canon(outR[k] + BR_EPS), zNext) - R(canon(outR[k] - BR_EPS), zNext)) > TOL) chainSuspect += 1;
              }
              for (let k = 1; k < m; k += 1) if (outR[k] < outR[k - 1] + MINSEP) outR[k] = outR[k - 1] + MINSEP;
              chain[j + step] = outR;
            }
          };
          prop(ref, rows, 1); prop(ref, 0, -1);
          const pitch = TWO_PI / gu;
          const nSub: number[] = new Array(m).fill(1);
          for (let k = 0; k < m; k += 1) {
            let mx = 0;
            for (let j = 0; j <= rows; j += 1) { const nx = chain[j][(k + 1) % m] + (k + 1 === m ? TWO_PI : 0); mx = Math.max(mx, nx - chain[j][k]); }
            // EXACTNESS: mx comes from BISECTED theta, so an exactly-integral ratio lands at 13.0000000000000004
            // and ceil() silently adds a filler column (MEASURED: 214 columns vs the column path's 208 on
            // BasketWeave). Round down by a relative epsilon so the straight-line case is bit-comparable.
            nSub[k] = Math.max(1, Math.ceil(mx / pitch - 1e-9));
          }
          rowCols = []; colLocB = []; chainIdx = [];
          for (let j = 0; j <= rows; j += 1) {
            const rc: number[] = [];
            for (let k = 0; k < m; k += 1) {
              const a0 = chain[j][k]; const b0 = chain[j][(k + 1) % m] + (k + 1 === m ? TWO_PI : 0);
              rc.push(a0);
              for (let q = 1; q < nSub[k]; q += 1) rc.push(a0 + ((b0 - a0) * q) / nSub[k]);
            }
            // STRICTLY increasing columns. A collapsed gap makes its fillers coincide, those vertices position-weld
            // into one, and the edges around them pick up a third incident triangle (MEASURED: 951 non-manifold on
            // the INITIAL grid, zero refinement). MINSEP is far above the weld radius yet ~0.45 um of arc, so it is
            // geometrically inert; the affected columns sit in a coalesced region where |dr|~0 and PINCH anyway.
            for (let q = 1; q < rc.length; q += 1) if (rc[q] < rc[q - 1] + MINSEP) rc[q] = rc[q - 1] + MINSEP;
            rowCols.push(rc);
          }
          for (let k = 0; k < m; k += 1) { colLocB.push(true); chainIdx.push(k); for (let q = 1; q < nSub[k]; q += 1) { colLocB.push(false); chainIdx.push(-1); } }
          ncB = colLocB.length;
          chainsBuilt += m;
        }
      } else {
        for (let j = 0; j <= rows; j += 1) rowCols.push(colTh);
        colLocB = colLoc; ncB = nc; chainIdx = colTh.map(() => -1);
      }
      // Non-TRACE paths keep exactly the previous behaviour: uniform row z, liveness ≡ the static column flag. So
      // with PF_CB_TRACE unset this file is byte-identical to the recorded chain/column instrument.
      if (!TRACE) {
        zRowB = []; for (let j = 0; j <= rows; j += 1) zRowB.push(za + (bandH * j) / rows);
        colLive = zRowB.map(() => colLocB);
      }
      const nR = zRowB.length - 1;
      const gL: number[][] = []; const gR: number[][] = [];
      for (let j = 0; j <= nR; j += 1) {
        const z = zRowB[j];
        const rowL: number[] = []; const rowR: number[] = [];
        for (let i = 0; i < ncB; i += 1) {
          if (!colLive[j][i]) { const v = addV(rowCols[j][i], z); rowL.push(v); rowR.push(v); continue; }
          const th = rowCols[j][i];
          const rM = R(canon(th - BR_EPS), z); const rP = R(canon(th + BR_EPS), z);
          const sep = Math.abs(rP - rM);
          if (sep < minBranchSepMm) minBranchSepMm = sep;
          if (sep < PINCH_MM) {
            // the jump amplitude vanishes here: the curtain closes to a point. ONE vertex, tagged branch 0 so a
            // refined neighbour still inherits whichever branch the OTHER endpoint carries.
            const v = addV(th, z, true, 0, CHAIN ? chainIdx[i] : th);
            if (addVNew) pinchVerts += 1;
            rowL.push(v); rowR.push(v); continue;
          }
          const vM = addV(th, z, true, -1, CHAIN ? chainIdx[i] : th);
          const vP = addV(th, z, true, +1, CHAIN ? chainIdx[i] : th);
          // A style whose jump is below the weld radius would have its curtain silently welded SHUT — the one way
          // this mechanism can fail invisibly. Refuse rather than emit a lie.
          if (vM === vP) throw new Error(`curtain welded shut at θ=${th} z=${z}: |Δr|=${sep} mm ≤ weld ${WELD_MM} mm`);
          curtainPairs += 1;
          rowL.push(vM); rowR.push(vP);
        }
        gL.push(rowL); gR.push(rowR);
      }
      for (let j = 0; j < nR; j += 1) for (let i = 0; i < ncB; i += 1) {
        const i1 = (i + 1) % ncB;
        addT(gR[j][i], gL[j][i1], gL[j + 1][i1]);
        addT(gR[j][i], gL[j + 1][i1], gR[j + 1][i]);
      }
      // ── THE CURTAIN. Winding is fixed by ORIENTATION CONSISTENCY, not by the sign of the jump: the minus sheet
      //    traverses M0→M1 and the plus sheet traverses P1→P0, so the curtain's boundary cycle must be
      //    M1 → M0 → P0 → P1. Correct for r+ > r− and r+ < r− alike; degenerate corners are dropped by addT.
      if (CURTAIN || CHAIN) for (let i = 0; i < ncB; i += 1) {
        if (!colLocB[i]) continue;
        for (let j = 0; j < nR; j += 1) {
          // A curtain quad exists only where the slot is a LIVE locus at BOTH rows. Where the branch dies, the two
          // sheets already meet at the single vertex of the dormant row, so the strip closes with one triangle from
          // the row below; emitting a quad past the death is exactly the "wrong-side strip" this rewrite removes.
          if (TRACE && !colLive[j][i] && !colLive[j + 1][i]) continue;
          const M0 = gL[j][i]; const M1 = gL[j + 1][i]; const P0 = gR[j][i]; const P1 = gR[j + 1][i];
          if (addT(M1, M0, P0) >= 0) curtainTris += 1;
          if (addT(M1, P0, P1) >= 0) curtainTris += 1;
        }
      }
    }

    // ───────────────────────────── BISECTION ─────────────────────────────
    const created: number[] = [];
    let nSnap = 0; let nReproj = 0; let nJump = 0; let weldedSplits = 0;
    /** split edge (a,b) at parameter t (0..1) — splits EVERY incident triangle ⇒ watertight, no T-junctions. */
    let branchSplits = 0;
    const bisectAt = (a: number, b: number, tPar: number, feat: boolean): boolean => {
      const [mth, mz] = edgeParam(a, b, tPar);
      // PIN AGAINST REFINEMENT. An edge running along a locus is a BRANCH curve; its midpoint must be re-solved on
      // that same branch — rA AT the locus is branch-arbitrary (measured: it silently takes r+), so a plain addV
      // here would yank the r− sheet's boundary 2 mm across onto r+ every time the edge is bisected.
      const br = edgeBranch(a, b);
      if (br !== 0) branchSplits += 1;
      // REPROJECTION. A chord between two locus samples is displaced from the true CURVED locus by the sagitta, and
      // inside that strip the mesh sits on the wrong side of the cliff. MEASURED on CelticKnot the sagitta is
      // quadratic in span (p50 21.0 / 5.17 / 1.26 um at 1.333 / 0.667 / 0.333 mm), so re-solving every bisection
      // midpoint back onto the locus makes conforming IMPROVE with refinement instead of decaying.
      let mthUse = mth;
      if (br !== 0 && CHAIN) {
        // TRACE tightens this window by 5×: a traced chord is within ~10 µm arc (2e-4 rad) of its own branch, so a
        // 0.02 rad search is 100× wider than it needs to be and can re-solve onto a NEIGHBOURING locus near a merge.
        const thL = locusThNear(mz, canon(mth), TRACE ? TR_REPROJWIN : CHAIN_WIN);
        if (Number.isFinite(thL)) { mthUse = thL; chainReproj += 1; } else chainReprojFail += 1;
      }
      const m = br !== 0 ? addV(mthUse, mz, true, br, vLocTh[a]) : addV(mth, mz, feat);
      if (m === a || m === b) return false; // weld collapsed the split — nothing to do
      // A split point that WELDS onto a pre-existing vertex does not subdivide the edge: it stitches the edge to a
      // vertex from an unrelated part of the local mesh, which is exactly how an edge ends up with >2 incident
      // triangles (a topological pinch). Counting these is the audit; refusing them is the fix at source.
      if (!addVNew) { weldedSplits += 1; if (NOWELD) return false; }
      const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
      // DEGENERACY GUARD (measured need): if the new vertex welds onto an incident triangle's APEX, both replacement
      // triangles are degenerate — the split then DELETES geometry and the refinement churns forever without growing
      // (SNAP+LEPP ablation: 6 M allocations, 68 k alive). Refuse the split so the caller falls back.
      for (const t of list) {
        if (!alive[t]) continue;
        if (ta[t] === m || tb[t] === m || tc[t] === m) return false;
      }
      let made = false;
      for (const t of list) {
        if (!alive[t]) continue;
        const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
        const seq = [ta[t], tb[t], tc[t]];
        let oa = a; let ob = b;
        for (let i = 0; i < 3; i += 1) {
          if (seq[i] === a && seq[(i + 1) % 3] === b) { oa = a; ob = b; break; }
          if (seq[i] === b && seq[(i + 1) % 3] === a) { oa = b; ob = a; break; }
        }
        killT(t);
        created.push(addT(oa, m, apex));
        created.push(addT(m, ob, apex));
        made = true;
      }
      return made;
    };
    /** where to split edge (a,b): feature crossing (SNAP) → transverse re-solve (REPROJECT) → midpoint. */
    const splitEdge = (a: number, b: number): boolean => {
      if (SNAP) {
        const k = locateKink(vth[a], vz[a], vth[a] + dTh(a, b), vz[b]);
        if (k !== null && k.t > SNAP_ALPHA && k.t < 1 - SNAP_ALPHA) {
          if (k.jump) nJump += 1;
          nSnap += 1;
          if (bisectAt(a, b, k.t, true)) return true;
        }
      }
      if (REPROJ && vFeat[a] && vFeat[b]) {
        // edge runs ALONG a locus: re-solve the midpoint transversally so conforming survives refinement
        const [mth, mz] = edgeParam(a, b, 0.5);
        const rMid = R(canon(mth), mz);
        const eArc = rMid * dTh(a, b); const eZ = vz[b] - vz[a];
        const L = Math.hypot(eArc, eZ);
        if (L > 1e-9) {
          const span = REPROJ_FRAC * L;
          const pArc = -eZ / L; const pZ = eArc / L; // unit perpendicular in (arc,z)
          const dth = (pArc * span) / Math.max(1e-6, rMid); const dz = pZ * span;
          const k = locateKink(mth - dth, mz - dz, mth + dth, mz + dz);
          // GUARD: two vertices on the SAME locus put its chord deviation κ·L²/8 near the probe CENTRE. A kink found
          // near a probe END is a DIFFERENT locus (common once many vertices carry the feature tag) — following it
          // drags the midpoint across neighbouring geometry and manufactures 0.1 µm needles (measured). Reject it.
          if (k !== null && !k.jump && Math.abs(2 * k.t - 1) < 0.5) {
            const off = 2 * k.t - 1; // −1..1 across the transverse probe
            nReproj += 1;
            const m = addV(mth + off * dth, mz + off * dz, true);
            if (m !== a && m !== b) {
              const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
              let made = false;
              for (const t of list) {
                if (!alive[t]) continue;
                const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
                const seq = [ta[t], tb[t], tc[t]];
                let oa = a; let ob = b;
                for (let i = 0; i < 3; i += 1) {
                  if (seq[i] === a && seq[(i + 1) % 3] === b) { oa = a; ob = b; break; }
                  if (seq[i] === b && seq[(i + 1) % 3] === a) { oa = b; ob = a; break; }
                }
                killT(t);
                created.push(addT(oa, m, apex));
                created.push(addT(m, ob, apex));
                made = true;
              }
              if (made) return true;
            }
          }
        }
      }
      const feat = vFeat[a] && vFeat[b];
      // The midpoint can weld onto a pre-existing vertex, which does not subdivide the edge and is refused.
      // Abandoning the edge strands the triangle forever (MEASURED: no-op splits === welded splits, and the
      // stranded triangles were exactly the GeoStar/Voronoi/Gyroid MAX loci). Walk a nudge LADDER outward from the
      // midpoint; in a saturated weld neighbourhood the first few offsets can all collide.
      for (const tPar of NUDGE_LADDER) if (bisectAt(a, b, tPar, feat)) return true;
      return false;
    };

    // LEPP walk (quality-preserving longest-edge chain) — used when DIRECTED is off.
    const longestE = (t: number): number => {
      const l0 = eLen(ta[t], tb[t]); const l1 = eLen(tb[t], tc[t]); const l2 = eLen(tc[t], ta[t]);
      if (l0 >= l1 && l0 >= l2) return 0;
      if (l1 >= l0 && l1 >= l2) return 1;
      return 2;
    };
    const eVerts = (t: number, e: number): [number, number] => (e === 0 ? [ta[t], tb[t]] : e === 1 ? [tb[t], tc[t]] : [tc[t], ta[t]]);
    const neighbor = (t: number, a: number, b: number): number => {
      const l = edgeMap.get(eKey(a, b));
      if (l === undefined) return -1;
      for (const o of l) if (o !== t && alive[o]) return o;
      return -1;
    };
    const refineLepp = (t0: number): void => {
      let guard = 200_000;
      while (alive[t0] && guard-- > 0) {
        if (ta.length >= triCap) return;
        let t = t0; let inner = 200_000;
        for (;;) {
          if (inner-- <= 0 || ta.length >= triCap) return;
          const e = longestE(t); const [a, b] = eVerts(t, e);
          const nb = neighbor(t, a, b);
          if (nb === -1) { if (!splitEdge(a, b)) return; break; }
          const enb = longestE(nb); const [na, nv] = eVerts(nb, enb);
          if ((na === a && nv === b) || (na === b && nv === a)) { if (!splitEdge(a, b)) return; break; }
          t = nb;
        }
        if (!alive[t0]) break;
        const e0 = longestE(t0); const [a0, b0] = eVerts(t0, e0);
        const nb0 = neighbor(t0, a0, b0);
        if (nb0 === -1) { splitEdge(a0, b0); break; }
        const en0 = longestE(nb0); const [na0, nv0] = eVerts(nb0, en0);
        if ((na0 === a0 && nv0 === b0) || (na0 === b0 && nv0 === a0)) { if (!splitEdge(a0, b0)) return; break; }
      }
    };
    /** DIRECTED: split the edge with the largest chord sag, subject to an aspect cap. */
    /** which side of which jump locus a triangle lies on — the same geometric rule the ruler uses. */
    const triBranch = (t: number): [number, number] => {
      if (!BR_EVAL) return [NaN, 0];
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      let lt = NaN;
      if (onLoc(a)) lt = vLocTh[a]; else if (onLoc(b)) lt = vLocTh[b]; else if (onLoc(c)) lt = vLocTh[c];
      if (Number.isNaN(lt)) return [NaN, 0];
      let lu = lt;
      while (lu - vth[a] > Math.PI) lu -= TWO_PI;
      while (vth[a] - lu > Math.PI) lu += TWO_PI;
      const thC = vth[a] + (dTh(a, b) + dTh(a, c)) / 3;
      return [lt, thC > lu + LOC_EPS ? 1 : thC < lu - LOC_EPS ? -1 : 0];
    };
    const refineDirected = (t: number): void => {
      const vs: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
      const ls = vs.map(([a, b]) => eLen(a, b));
      const lMax = Math.max(ls[0], ls[1], ls[2]);
      const [tLoc, tBr] = triBranch(t);
      const cands: Array<[number, number]> = [];
      for (let e = 0; e < 3; e += 1) {
        if (ls[e] < FLOOR_MM) continue;
        if (ls[e] * AR < lMax) continue; // aspect guard: never thin an already-short edge further
        cands.push([edgeSagN(vs[e][0], vs[e][1], ES_N, tLoc, tBr), e]);
      }
      cands.sort((x, y) => y[0] - x[0]);
      for (const [, e] of cands) if (splitEdge(vs[e][0], vs[e][1])) return; // best-first, but never give up on a refusal
      for (let e = 0; e < 3; e += 1) if (ls[e] >= FLOOR_MM && splitEdge(vs[e][0], vs[e][1])) return; // drop the guard
    };

    // ───────────────────────────── worst-first refinement ─────────────────────────────
    const heapT: number[] = []; const heapK: number[] = [];
    const hswap = (i: number, j: number): void => { const t = heapT[i]; heapT[i] = heapT[j]; heapT[j] = t; const k = heapK[i]; heapK[i] = heapK[j]; heapK[j] = k; };
    const hpush = (t: number, k: number): void => {
      heapT.push(t); heapK.push(k);
      let i = heapT.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (heapK[p] >= heapK[i]) break; hswap(i, p); i = p; }
    };
    const hpop = (): number => {
      const top = heapT[0]; const lt = heapT.pop() as number; const lk = heapK.pop() as number;
      if (heapT.length > 0) {
        heapT[0] = lt; heapK[0] = lk;
        let i = 0; const n = heapT.length;
        for (;;) {
          let big = i; const l = 2 * i + 1; const r = 2 * i + 2;
          if (l < n && heapK[l] > heapK[big]) big = l;
          if (r < n && heapK[r] > heapK[big]) big = r;
          if (big === i) break;
          hswap(i, big); i = big;
        }
      }
      return top;
    };
    // A CURTAIN triangle spans the cliff: its three vertices sit on ONE locus but on DIFFERENT branches, so its
    // (θ,z) footprint is a 1-D segment — measure zero on the surface — and it represents the vertical wall, which is
    // not part of the graph r(θ,z) at all. Ruling it against the graph is undefined: on a STRAIGHT column every
    // sample lands at the column θ and reads ~0 (a blind spot), while on a CURVED chain the samples walk along the
    // locus where rA is branch-arbitrary and read ±½·jump at random. In the A-run that noise consumed 47 % of the
    // refinement budget (3,968 of 8,426 splits) chasing a number that means nothing.
    // Exclude them from the graph ruler and the heap — and note what still covers them, so this is a definition, not
    // a blind spot: (1) the CURTAIN CHORD audit rules each branch edge against its own branch curve; (2) the
    // PLACEMENT audit rules the chord against the true locus; (3) the HAUSDORFF re-measure rules the analytic
    // surface against the mesh; (4) the branch edges are still refined, driven by the SHEET triangles that share
    // them. Surface coverage is unaffected: a measure-zero footprint carries no analytic surface.
    let curtainSkipped = 0;
    const isCurtainTri = (t: number): boolean => {
      if (!TRACE) return false;
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      if (!onLoc(a) || vLocTh[a] !== vLocTh[b] || vLocTh[b] !== vLocTh[c]) return false;
      const A = vBranch[a]; const B = vBranch[b]; const C = vBranch[c];
      return !(A === B && B === C);
    };
    const consider = (t: number): void => {
      if (t < 0 || !alive[t]) return;
      if (isCurtainTri(t)) return;
      const le = Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
      if (le < FLOOR_MM) return;
      const s = ADAPT ? sagAdaptive(t, REF_HS, REF_NMIN, REF_NMAX) : sagOfN(t, oracleRef);
      if (s > acceptTol) hpush(t, s);
    };
    for (let t = 0; t < ta.length; t += 1) consider(t);
    const initTris = ta.length;
    let capped = false;
    let iters = 0;
    let stuck = 0;
    let lastKey = Infinity;
    let keyInversions = 0;
    while (heapT.length > 0) {
      const kTop = heapK[0];
      const t = hpop();
      if (kTop > lastKey + 1e-12) keyInversions += 1;
      lastKey = kTop;
      if (!alive[t]) continue;
      if (ta.length >= triCap) { capped = true; break; }
      created.length = 0;
      if (DIRECTED) refineDirected(t); else refineLepp(t);
      for (const nt of created) consider(nt);
      if (created.length > 0) consider(t);
      iters += 1;
      if (created.length === 0) stuck += 1; // split produced nothing (weld collapse) — do not spin on it
      if (DEBUG && iters % 200000 === 0) {
        let al = 0; for (let k = 0; k < alive.length; k += 1) if (alive[k]) al += 1;
        // eslint-disable-next-line no-console
        console.log(`   … ${iters} splits, ${al} alive, heap ${heapT.length}, ${((Date.now() - t0ms) / 1000).toFixed(0)}s, ${(rEvals / 1e6).toFixed(0)}M rA`);
      }
    }

    let heapLeftMax = 0;
    for (let i = 0; i < heapT.length; i += 1) if (alive[heapT[i]] && heapK[i] > heapLeftMax) heapLeftMax = heapK[i];

    // ───────────────────────────── needle collapse ─────────────────────────────
    // STRATA's naive union-find collapse MEASURABLY creates non-manifold edges (12 on GothicArches) because it
    // ignores the link condition. It is now OPT-IN ONLY (PF_CB_NAIVE_COLLAPSE=1) and should not ship.
    const COLLAPSE_ON = process.env.PF_CB_NAIVE_COLLAPSE === '1';
    const uf = new Int32Array(vth.length);
    for (let i = 0; i < uf.length; i += 1) uf[i] = i;
    const find = (x0: number): number => { let x = x0; while (uf[x] !== x) { uf[x] = uf[uf[x]]; x = uf[x]; } return x; };
    const union = (a: number, b: number): void => { const ra = find(a); const rb = find(b); if (ra !== rb) uf[Math.max(ra, rb)] = Math.min(ra, rb); };
    if (COLLAPSE_ON) for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const eab = eLen(a, b); const ebc = eLen(b, c); const eca = eLen(c, a);
      const mn = Math.min(eab, ebc, eca);
      if (mn < COLLAPSE_MM) { if (eab === mn) union(a, b); else if (ebc === mn) union(b, c); else union(c, a); }
    }
    let collapsedTris = 0;
    if (COLLAPSE_ON) for (let t = 0; t < ta.length; t += 1) {
      if (!alive[t]) continue;
      const a = find(ta[t]); const b = find(tb[t]); const c = find(tc[t]);
      if (a === b || b === c || c === a) { alive[t] = false; collapsedTris += 1; continue; }
      ta[t] = a; tb[t] = b; tc[t] = c;
    }

    // ───────── LINK-CONDITION-SAFE NEEDLE COLLAPSE (generic mesh-quality pass) ─────────
    // Adaptive bisection occasionally lands two vertices ~0.1 µm apart (two independent split points converging on the
    // same locus). The resulting needle (measured on GeometricStar: edges 983/983/0.1 µm) has a garbage plane normal,
    // so its sag reads ~84 µm even though the surface there is fine — and the 3D position weld in any downstream
    // audit/slicer merges the pair, turning the shared edges NON-MANIFOLD (measured 215).
    // The naive union-find collapse used by STRATA also creates non-manifold edges (measured 12 on GothicArches).
    // The standard guarantee is the LINK CONDITION: edge (u,v) is collapsible iff N(u) ∩ N(v) is exactly the set of
    // apexes of the triangles sharing (u,v). Enforce it; refuse otherwise. Style-agnostic, geometry-agnostic.
    let safeCollapses = 0; let refusedCollapses = 0; let refusedOffenders = 0; let flipsDone = 0; let flipsLocusRefused = 0;
    // An edge lies ON a locus iff a TRANSVERSE probe through its midpoint finds a kink at the probe CENTRE.
    // Same primitive as the detector — no per-style knowledge, no locus table to maintain.
    const edgeOnLocus = (pv: number, qv: number): boolean => {
      const mth = vth[pv] + dTh(pv, qv) * 0.5; const mz = (vz[pv] + vz[qv]) / 2;
      const rMid = R(canon(mth), mz);
      const eArc = rMid * dTh(pv, qv); const eZ = vz[qv] - vz[pv];
      const L = Math.hypot(eArc, eZ);
      if (L < 1e-9) return false;
      const span = 0.5 * L;
      const pArc = -eZ / L; const pZ = eArc / L;
      const dth = (pArc * span) / Math.max(1e-6, rMid); const dz = pZ * span;
      const k = locateKink(mth - dth, mz - dz, mth + dth, mz + dz);
      return k !== null && Math.abs(2 * k.t - 1) < 0.3;
    };

    const SAFE_MM = envF('PF_CB_NEEDLE_UM', 0.2) / 1000;
    if (process.env.PF_CB_SAFE_COLLAPSE !== '0') {
      const nbr = new Map<number, Set<number>>();
      const vTris = new Map<number, Set<number>>();
      const addNbr = (p: number, q: number): void => { let s = nbr.get(p); if (s === undefined) { s = new Set(); nbr.set(p, s); } s.add(q); };
      const addVT = (p: number, t: number): void => { let s = vTris.get(p); if (s === undefined) { s = new Set(); vTris.set(p, s); } s.add(t); };
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        addNbr(a, b); addNbr(b, a); addNbr(b, c); addNbr(c, b); addNbr(c, a); addNbr(a, c);
        addVT(a, t); addVT(b, t); addVT(c, t);
      }
      /** locus-safe 2-2 flip of edge (pv,qv); returns true if performed. Keeps nbr/vTris consistent. */
      const tryFlip = (pv: number, qv: number): boolean => {
        const inc = (edgeMap.get(eKey(pv, qv)) ?? []).filter((t) => alive[t]);
        if (inc.length !== 2) return false;
        const apexOf = (t: number): number => (ta[t] !== pv && ta[t] !== qv ? ta[t] : tb[t] !== pv && tb[t] !== qv ? tb[t] : tc[t]);
        const r0 = apexOf(inc[0]); const s0 = apexOf(inc[1]);
        if (r0 === s0) return false;
        if ((edgeMap.get(eKey(r0, s0)) ?? []).some((t) => alive[t])) return false; // (r,s) already exists ⇒ would pinch
        if (edgeOnLocus(pv, qv)) { flipsLocusRefused += 1; return false; }
        // orientation check in (θ,z) shortest-arc coords around pv — both new triangles must keep the original sign
        const P = (w: number): [number, number] => [dTh(pv, w), vz[w] - vz[pv]];
        const cr = (A: [number, number], B: [number, number], C: [number, number]): number => (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
        const Pp = P(pv); const Pq = P(qv); const Pr = P(r0); const Ps = P(s0);
        const s1 = cr(Pr, Pp, Ps); const s2 = cr(Ps, Pq, Pr);
        const ref = cr(Pp, Pq, Pr);
        if (ref === 0 || s1 === 0 || s2 === 0) return false;
        if (Math.sign(s1) !== Math.sign(ref) || Math.sign(s2) !== Math.sign(ref)) return false; // non-convex quad
        // ensure winding: inc[0] traverses pv→qv, so the quad is qv → r0 → pv → s0
        for (const t of inc) { alive[t] = false; eDel(ta[t], tb[t], t); eDel(tb[t], tc[t], t); eDel(tc[t], ta[t], t); }
        const n1 = addT(r0, pv, s0); const n2 = addT(s0, qv, r0);
        for (const nt of [n1, n2]) {
          if (nt < 0) continue;
          for (const [x, y] of [[ta[nt], tb[nt]], [tb[nt], tc[nt]], [tc[nt], ta[nt]]] as Array<[number, number]>) {
            let sx = nbr.get(x); if (sx === undefined) { sx = new Set(); nbr.set(x, sx); } sx.add(y);
            let sy = nbr.get(y); if (sy === undefined) { sy = new Set(); nbr.set(y, sy); } sy.add(x);
          }
          for (const x of [ta[nt], tb[nt], tc[nt]]) { let sx = vTris.get(x); if (sx === undefined) { sx = new Set(); vTris.set(x, sx); } sx.add(nt); }
        }
        // (pv,qv) is gone: drop it from the neighbour sets if no surviving triangle uses it
        if (!(edgeMap.get(eKey(pv, qv)) ?? []).some((t) => alive[t])) { nbr.get(pv)?.delete(qv); nbr.get(qv)?.delete(pv); }
        return true;
      };
      const shortEdges: Array<[number, number, number]> = [];
      const seenE = new Set<number>();
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        for (const [p, qv] of [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]] as Array<[number, number]>) {
          const k = eKey(p, qv);
          if (seenE.has(k)) continue;
          seenE.add(k);
          const L = eLen(p, qv);
          if (L < SAFE_MM) shortEdges.push([L, p, qv]);
        }
      }
      shortEdges.sort((x, y) => x[0] - y[0]);
      for (const [, u0, v0] of shortEdges) {
        const u = u0; const v = v0;
        const su = vTris.get(u); const sv = vTris.get(v);
        if (su === undefined || sv === undefined) continue;
        const shared: number[] = [];
        for (const t of su) if (alive[t] && sv.has(t)) shared.push(t);
        if (shared.length === 0) continue;
        const apex = new Set<number>();
        for (const t of shared) { for (const w of [ta[t], tb[t], tc[t]]) if (w !== u && w !== v) apex.add(w); }
        const nu = nbr.get(u); const nv = nbr.get(v);
        if (nu === undefined || nv === undefined) continue;
        const offenders = (): number[] => { const out: number[] = []; for (const w of nu) if (nv.has(w) && !apex.has(w)) out.push(w); return out; };
        let bad = offenders();
        if (bad.length > 0 && FLIP_ON) {
          // LOCUS-SAFE 2-2 FLIP. w ∈ N(u)∩N(v) that is not an apex of (u,v) is exactly what makes the collapse produce
          // a >2-incidence edge. Flipping (u,w) (or (v,w)) removes w from the intersection. NEVER flip an edge that
          // lies ON a detected locus — that would undo the conforming the whole pipeline exists to produce.
          for (const w of bad.slice()) {
            if (tryFlip(u, w) || tryFlip(v, w)) flipsDone += 1;
          }
          bad = offenders();
        }
        if (bad.length > 0) { refusedCollapses += 1; refusedOffenders += bad.length; continue; }
        // collapse v → u
        for (const t of shared) { alive[t] = false; collapsedTris += 1; }
        for (const t of Array.from(sv)) {
          if (!alive[t]) continue;
          if (ta[t] === v) ta[t] = u; if (tb[t] === v) tb[t] = u; if (tc[t] === v) tc[t] = u;
          addVT(u, t);
        }
        for (const w of nv) { if (w === u) continue; const nw = nbr.get(w); if (nw !== undefined) { nw.delete(v); nw.add(u); } addNbr(u, w); }
        nbr.delete(v); vTris.delete(v);
        nu.delete(v);
        safeCollapses += 1;
      }
    }

    // ───────────────────────────── soup + watertight audit (3D position weld) ─────────────────────────────
    const soup: Array<[P3, P3, P3]> = [];
    const PT = (i: number): P3 => [vx[i], vy[i], vz[i]];
    const liveIdx: number[] = [];
    for (let t = 0; t < ta.length; t += 1) if (alive[t]) { soup.push([PT(ta[t]), PT(tb[t]), PT(tc[t])]); liveIdx.push(t); }

    // Re-runnable position-weld topology audit (fresh weld state per call) — the ONE source of truth, exactly as
    // _strataVoronoiSolid.analyze(): a slicer position-welds too, so this is what "watertight" means downstream.
    interface Topo { nonManifold: number; boundary: number; loops: number[][]; seamCrack: number; wpos: P3[] }
    const analyze = (tris: Array<[P3, P3, P3]>): Topo => {
      const wCell = new Map<string, number[]>(); const wpos: P3[] = [];
      const wIndex = (p: P3): number => {
        const cx = gi(p[0]); const cy = gi(p[1]); const cz = gi(p[2]);
        for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
          const l = wCell.get(`${cx + dx},${cy + dy},${cz + dz}`);
          if (l === undefined) continue;
          for (const j of l) if (Math.hypot(wpos[j][0] - p[0], wpos[j][1] - p[1], wpos[j][2] - p[2]) <= WELD_MM) return j;
        }
        const idx = wpos.length; wpos.push(p);
        const key = `${cx},${cy},${cz}`;
        const b = wCell.get(key); if (b === undefined) wCell.set(key, [idx]); else b.push(idx);
        return idx;
      };
      const ec = new Map<number, number>();
      const WB = 1 << 25;
      const bump = (a: number, b: number): void => { const k = a < b ? a * WB + b : b * WB + a; ec.set(k, (ec.get(k) ?? 0) + 1); };
      for (const [a, b, c] of tris) { const ia = wIndex(a); const ib = wIndex(b); const ic = wIndex(c); bump(ia, ib); bump(ib, ic); bump(ic, ia); }
      let nonManifold = 0; let boundary = 0;
      const bAdj = new Map<number, number[]>();
      for (const [k, cnt] of ec.entries()) {
        if (cnt === 2) continue;
        if (cnt > 2) { nonManifold += 1; continue; }
        boundary += 1;
        const a = Math.floor(k / WB); const b = k % WB;
        (bAdj.get(a) ?? (bAdj.set(a, []), bAdj.get(a) as number[])).push(b);
        (bAdj.get(b) ?? (bAdj.set(b, []), bAdj.get(b) as number[])).push(a);
      }
      const seenB = new Set<number>(); const loopsOut: number[][] = [];
      for (const st of bAdj.keys()) {
        if (seenB.has(st)) continue;
        const loop: number[] = []; let cur = st; let prev = -1; let guard = bAdj.size + 5;
        while (guard-- > 0) {
          loop.push(cur); seenB.add(cur);
          let next = -1;
          for (const n of bAdj.get(cur) ?? []) if (n !== prev && (!seenB.has(n) || n === st)) { next = n; break; }
          if (next === -1 || next === st) break;
          prev = cur; cur = next;
        }
        if (loop.length > 2) loopsOut.push(loop);
      }
      let sc = 0;
      for (const loop of loopsOut) {
        const mz = loop.reduce((sm, i) => sm + wpos[i][2], 0) / loop.length;
        if (mz > 1e-3 && mz < H - 1e-3) sc += loop.length;
      }
      return { nonManifold, boundary, loops: loopsOut, seamCrack: sc, wpos };
    };

    // ───────────────────────────── STAGE B: closure to a printable SOLID ─────────────────────────────
    // Structure ported from _strataVoronoiSolid (stitchRings / innerLoopAtZ / cap assembly): the outer wall keeps the
    // conforming mesh; the cavity side is a smooth surface of revolution, so it is meshed uniformly and cheaply.
    const ang = (p: P3): number => { const a = Math.atan2(p[1], p[0]); return a < 0 ? a + TWO_PI : a; };
    // ── WALK-ORDER stitch (CURTAIN only). The parent sorts each loop by angle, which is fine for a plain ring but
    //    WRONG once a curtain puts TWO boundary vertices at the SAME θ: their atan2 values differ by ~1 ulp, so the
    //    sort can swap them, and the merge — which covers `array[i] → array[i+1]` for every i — then covers two
    //    edges that do not exist while leaving two real boundary edges uncovered ⇒ seam cracks. The loops already
    //    arrive from analyze() in true boundary-walk order, so use that; only normalize the direction and the phase.
    const orientLoop = (loop: P3[]): P3[] => {
      const n = loop.length;
      if (n < 3) return loop.slice();
      let s = 0;
      for (let i = 0; i < n; i += 1) { let d = ang(loop[(i + 1) % n]) - ang(loop[i]); if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI; s += d; }
      return s < 0 ? loop.slice().reverse() : loop.slice();
    };
    const unwrapFrom = (loop: P3[]): number[] => {
      const u = new Array<number>(loop.length);
      u[0] = ang(loop[0]);
      for (let i = 1; i < loop.length; i += 1) { let d = ang(loop[i]) - ang(loop[i - 1]); if (d > Math.PI) d -= TWO_PI; else if (d < -Math.PI) d += TWO_PI; u[i] = u[i - 1] + d; }
      return u;
    };
    const stitchWalk = (loopA: P3[], loopB: P3[]): number => {
      const A = orientLoop(loopA); let B = orientLoop(loopB);
      const na = A.length; const nb = B.length;
      if (na === 0 || nb === 0) return 0;
      let best = 0; let bd = Infinity;
      const a0 = ang(A[0]);
      for (let i = 0; i < nb; i += 1) { let d = Math.abs(ang(B[i]) - a0); if (d > Math.PI) d = TWO_PI - d; if (d < bd) { bd = d; best = i; } }
      B = B.slice(best).concat(B.slice(0, best));
      const ua = unwrapFrom(A); const ub = unwrapFrom(B);
      let ia = 0; let ib = 0; let n = 0;
      while (ia < na || ib < nb) {
        const ath = ua[ia % na] + (ia >= na ? TWO_PI : 0);
        const bth = ub[ib % nb] + (ib >= nb ? TWO_PI : 0);
        if (ia < na && (ib >= nb || ath <= bth)) { soup.push([A[ia % na], A[(ia + 1) % na], B[ib % nb]]); ia += 1; }
        else { soup.push([A[ia % na], B[(ib + 1) % nb], B[ib % nb]]); ib += 1; }
        n += 1;
      }
      return n;
    };
    const stitchRings = (loopA: P3[], loopB: P3[]): number => {
      // MUST cover the CHAIN path too. A curtain puts TWO boundary vertices at the SAME theta, whose atan2 values
      // differ by ~1 ulp, so the angle SORT can swap them and the merge then covers two edges that do not exist
      // while leaving two real boundary edges uncovered. Gating this on CURTAIN alone left the chain path on the
      // broken sort (MEASURED: 624 seam-cracks / 158 loops on BasketWeave, where the column path is 0/0).
      if (CURTAIN || CHAIN) return stitchWalk(loopA, loopB);
      const a = loopA.slice().sort((p, q) => ang(p) - ang(q)).map((p) => ({ th: ang(p), p }));
      const b = loopB.slice().sort((p, q) => ang(p) - ang(q)).map((p) => ({ th: ang(p), p }));
      const na = a.length; const nb = b.length;
      if (na === 0 || nb === 0) return 0;
      let ia = 0; let ib = 0; let n = 0;
      while (ia < na || ib < nb) {
        const ath = a[ia % na].th + (ia >= na ? TWO_PI : 0);
        const bth = b[ib % nb].th + (ib >= nb ? TWO_PI : 0);
        if (ia < na && (ib >= nb || ath <= bth)) { soup.push([a[ia % na].p, a[(ia + 1) % na].p, b[ib % nb].p]); ia += 1; }
        else { soup.push([a[ia % na].p, b[(ib + 1) % nb].p, b[ib % nb].p]); ib += 1; }
        n += 1;
      }
      return n;
    };
    const loopZof = (loop: number[], wp: P3[]): number => loop.reduce((s2, i) => s2 + wp[i][2], 0) / loop.length;

    let outerTopo = analyze(soup);
    // double-valued TREAD annuli bridging each detected C0 z-step (no-op when zSteps is empty, e.g. GothicArches)
    let treadTris = 0;
    if (zSteps.length > 0) {
      const sortedL = outerTopo.loops.slice()
        .sort((p, q) => loopZof(p, outerTopo.wpos) - loopZof(q, outerTopo.wpos))
        .map((loop) => loop.map((i) => outerTopo.wpos[i]));
      for (let sIdx = 0; sIdx < zSteps.length; sIdx += 1) {
        const below = sortedL[1 + 2 * sIdx]; const above = sortedL[2 + 2 * sIdx];
        if (below !== undefined && above !== undefined) treadTris += stitchRings(below, above);
      }
      outerTopo = analyze(soup);
    }
    const seamCrack = outerTopo.seamCrack; // OUTER-WALL cracks (caps legitimately add their own boundary loops)
    const sortedLoops = outerTopo.loops.slice().sort((p, q) => loopZof(p, outerTopo.wpos) - loopZof(q, outerTopo.wpos));
    const botLoop = (sortedLoops[0] ?? []).map((i) => outerTopo.wpos[i]);
    const topLoop = (sortedLoops[sortedLoops.length - 1] ?? []).map((i) => outerTopo.wpos[i]);

    let capTris = 0;
    if (STAGE === 'solid') {
      const rInner = (z: number): number => baseRadius(z, H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1) - wallT;
      const byAngle = (loop: P3[]): P3[] => loop.slice().sort((i, j) => ang(i) - ang(j));
      const bot = byAngle(botLoop); const top = byAngle(topLoop);
      const cBot: P3 = [0, 0, 0];
      for (let i = 0; i < bot.length; i += 1) { soup.push([cBot, bot[(i + 1) % bot.length], bot[i]]); capTris += 1; }
      const innerLoopAtZ = (z: number): P3[] => {
        const r = rInner(z); const pts: P3[] = [];
        for (let d = 0; d < innerDiv; d += 1) { const th = (TWO_PI * d) / innerDiv; pts.push([r * Math.cos(th), r * Math.sin(th), z]); }
        return pts;
      };
      capTris += stitchRings(top, innerLoopAtZ(H)); // rim annulus
      const zrings: number[] = [];
      for (let k = 0; k <= innerRings; k += 1) zrings.push(H - ((H - floorZ) * k) / innerRings);
      for (let k = 0; k < innerRings; k += 1) {
        const z0 = zrings[k]; const z1 = zrings[k + 1];
        const r0 = rInner(z0); const r1 = rInner(z1);
        for (let d = 0; d < innerDiv; d += 1) {
          const th0 = (TWO_PI * d) / innerDiv; const th1 = (TWO_PI * ((d + 1) % innerDiv)) / innerDiv;
          const A: P3 = [r0 * Math.cos(th0), r0 * Math.sin(th0), z0];
          const B: P3 = [r0 * Math.cos(th1), r0 * Math.sin(th1), z0];
          const C: P3 = [r1 * Math.cos(th1), r1 * Math.sin(th1), z1];
          const Dp: P3 = [r1 * Math.cos(th0), r1 * Math.sin(th0), z1];
          soup.push([A, C, B]); soup.push([A, Dp, C]); capTris += 2; // inward-facing (cavity)
        }
      }
      const cFloor: P3 = [0, 0, floorZ];
      const floorRing = innerLoopAtZ(floorZ);
      for (let d = 0; d < innerDiv; d += 1) { soup.push([cFloor, floorRing[d], floorRing[(d + 1) % innerDiv]]); capTris += 1; }
    }
    const finalTopo = STAGE === 'solid' ? analyze(soup) : outerTopo;
    const nonManifold = finalTopo.nonManifold; const boundary = finalTopo.boundary; const loops = finalTopo.loops;

    // ───────────────────────────── fidelity (oracle N) + tail re-measure ─────────────────────────────
    const sags: number[] = []; let maxSag = 0; let maxT = -1; let minEdge = Infinity;
    let maxFixed = 0; let maxFixedT = -1;
    let fWa = 0; let fWb = 0; let fWc = 0; let fTheta = 0; let fZ = 0; let fR = 0; let fNl = 0; let fDd = 0; let fDB = 0; let fDC = 0;
    for (const t of liveIdx) {
      if (isCurtainTri(t)) { curtainSkipped += 1; sags.push(0); continue; } // wall, not graph — see isCurtainTri
      const s = sagAdaptive(t, AUD_HS, AUD_NMIN, AUD_NMAX); // HONEST ruler (absolute-bounded sampling)
      const sf = sagOfN(t, oracleN); // STRATA-comparable fixed-N ruler
      sags.push(s);
      if (s > maxSag) { maxSag = s; maxT = t; }
      if (sf > maxFixed) {
        maxFixed = sf; maxFixedT = t;
        fWa = argWa; fWb = argWb; fWc = argWc; fTheta = argTheta; fZ = argZ; fR = argR; fNl = argNl; fDd = argDd; fDB = argDB; fDC = argDC;
      }
      minEdge = Math.min(minEdge, eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
    }
    // ADVERSARIAL TAIL: the per-triangle barycentric oracle can UNDER-report a straddled crest (it may sample past
    // the tent tip). Re-measure the worst K at a much denser oracle so a PASS cannot be a sampling artifact.
    const tailK = Math.round(envF('PF_CB_TAILK', 3000));
    const tailN = Math.round(envF('PF_CB_TAILN', 44));
    const order = liveIdx.map((t, i) => i).sort((p, q) => sags[q] - sags[p]).slice(0, Math.min(tailK, liveIdx.length));
    let tailMax = 0; let tailT = -1;
    for (const i of order) { const t = liveIdx[i]; const s = sagOfN(t, tailN); if (s > tailMax) { tailMax = s; tailT = t; } }
    // ───────── HAUSDORFF RE-MEASURE of the over-tolerance tail (PF_CB_HAUS=1) ─────────
    // WHY THIS IS NEEDED, AND WHY IT IS NOT A WHITEWASH.
    // sagOfN measures |analytic point − the TRIANGLE'S OWN PLANE|. At a CURVED h0 locus that instrument is
    // structurally inflating, for a reason that has nothing to do with mesh quality: a straight mesh edge cannot lie
    // on a curved cliff, so between the curtain chord and the true locus there is always a strip — of width exactly
    // the chord sagitta — in which a surface sample belongs to the branch on the OTHER side of the chord. Its
    // distance to THIS triangle's plane is the full jump (600 µm on CelticKnot), while its distance to the MESH is
    // the strip width, because the correct sheet is present in the adjacent triangle, a few µm away. No density
    // removes the strip: it shrinks quadratically but is never empty, so a plane-distance MAX can never reach 10 µm
    // on a curved cliff at ANY finite budget. Every previously-closed h0 style (BasketWeave's constant-θ column,
    // the four constant-z tread styles) has an EXACTLY representable straight locus and therefore no strip at all —
    // which is why this has not appeared before.
    // The product bar is "MAX perpendicular distance mesh → exact analytic surface", i.e. one-sided Hausdorff, so
    // re-measure the tail against the MESH (closest point on any triangle of the local 1-ring), not against one
    // plane. This CANNOT hide a missing curtain: if a cliff is unmeshed, the far-branch surface points have no mesh
    // anywhere near them and still read the full jump. It only declines to charge the mesh 600 µm for geometry it
    // actually contains 3 µm away.
    // Rigour: every triangle whose plane-sag exceeds TOL is re-measured, so the reported Hausdorff MAX bounds the
    // true one over the whole surface (for all other triangles the plane distance — an upper bound — is already
    // under tolerance).
    let hausMax = 0; let hausT = -1; let hausTris = 0; let hausSamples = 0;
    if (process.env.PF_CB_HAUS === '1') {
      const vTri = new Map<number, number[]>();
      const addVT2 = (v: number, t: number): void => { const l = vTri.get(v); if (l === undefined) vTri.set(v, [t]); else l.push(t); };
      for (const t of liveIdx) { addVT2(ta[t], t); addVT2(tb[t], t); addVT2(tc[t], t); }
      /** squared distance from p to triangle (a,b,c) — Ericson's closest-point-on-triangle, clamped to the face. */
      const d2Tri = (px: number, py: number, pz: number, ia: number, ib: number, ic: number): number => {
        const ax = vx[ia]; const ay = vy[ia]; const az = vz[ia];
        const abx = vx[ib] - ax; const aby = vy[ib] - ay; const abz = vz[ib] - az;
        const acx = vx[ic] - ax; const acy = vy[ic] - ay; const acz = vz[ic] - az;
        const apx = px - ax; const apy = py - ay; const apz = pz - az;
        const d1 = abx * apx + aby * apy + abz * apz; const d2 = acx * apx + acy * apy + acz * apz;
        const sq = (qx: number, qy: number, qz: number): number => qx * qx + qy * qy + qz * qz;
        if (d1 <= 0 && d2 <= 0) return sq(apx, apy, apz);
        const bpx = px - vx[ib]; const bpy = py - vy[ib]; const bpz = pz - vz[ib];
        const d3 = abx * bpx + aby * bpy + abz * bpz; const d4 = acx * bpx + acy * bpy + acz * bpz;
        if (d3 >= 0 && d4 <= d3) return sq(bpx, bpy, bpz);
        const vc = d1 * d4 - d3 * d2;
        if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v2 = d1 / (d1 - d3); return sq(apx - v2 * abx, apy - v2 * aby, apz - v2 * abz); }
        const cpx = px - vx[ic]; const cpy = py - vy[ic]; const cpz = pz - vz[ic];
        const d5 = abx * cpx + aby * cpy + abz * cpz; const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) return sq(cpx, cpy, cpz);
        const vb = d5 * d2 - d1 * d6;
        if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w2 = d2 / (d2 - d6); return sq(apx - w2 * acx, apy - w2 * acy, apz - w2 * acz); }
        const va = d3 * d6 - d5 * d4;
        if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
          const w2 = (d4 - d3) / ((d4 - d3) + (d5 - d6));
          return sq(px - vx[ib] - w2 * (vx[ic] - vx[ib]), py - vy[ib] - w2 * (vy[ic] - vy[ib]), pz - vz[ib] - w2 * (vz[ic] - vz[ib]));
        }
        const den = 1 / (va + vb + vc); const v3 = vb * den; const w3 = vc * den;
        return sq(apx - v3 * abx - w3 * acx, apy - v3 * aby - w3 * acy, apz - v3 * abz - w3 * acz);
      };
      for (let li = 0; li < liveIdx.length; li += 1) {
        if (sags[li] <= TOL) continue;
        const t = liveIdx[li];
        hausTris += 1;
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        const cand = new Set<number>();
        for (const v of [a, b, c]) for (const u of vTri.get(v) ?? []) if (alive[u]) cand.add(u);
        const th0 = vth[a]; const dB = dTh(a, b); const dC = dTh(a, c);
        const le = Math.max(eLen(a, b), eLen(b, c), eLen(c, a));
        const n = Math.max(AUD_NMIN, Math.min(AUD_NMAX, Math.ceil(le / AUD_HS)));
        let worst = 0;
        for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
          const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
          const theta = th0 + wb * dB + wc * dC;
          const z = wa * vz[a] + wb * vz[b] + wc * vz[c];
          const r = R(canon(theta), z);
          const px = r * Math.cos(theta); const py = r * Math.sin(theta);
          let best = Infinity;
          for (const u of cand) { const d = d2Tri(px, py, z, ta[u], tb[u], tc[u]); if (d < best) best = d; }
          hausSamples += 1;
          if (best > worst) worst = best;
        }
        const wsq = Math.sqrt(worst);
        if (wsq > hausMax) { hausMax = wsq; hausT = t; }
      }
    }

    // ───────── LOCUS AUDIT = the CLOSURE INVARIANT (re-detect features ON the produced mesh) ─────────
    // Barycentric sampling CANNOT prove a tolerance on a surface with gradient jumps: a tent tip between two samples
    // is missed by up to Δs·pitch/2, and Δs ≈ 16.7 mm/mm on GothicArches' rib ⇒ a 17 µm pitch admits a 140 µm blind
    // spot. Denser sampling is hopeless (proving 10 µm would need a ~1.2 µm pitch ⇒ ~28 G evaluations).
    // The tractable proof is TARGETED: the sag maximum of a triangle sits either at a smooth interior critical point
    // (which moderate sampling does capture) or ON a feature locus crossing the triangle. So re-run the SAME generic
    // kink locator on every alive triangle's three edges; where ≥2 crossings are found, the locus crosses the
    // triangle — sample densely along the chord joining them, which is exactly where the tent tip lives.
    // If no triangle is crossed by a locus, no triangle has h¹ error character ⇒ the mesh is conformed, and the
    // barycentric ruler is then valid (smooth interiors only). This is self-verifying generality: it either passes
    // or names the exact triangles it could not conform.
    let locusMax = 0; let locusT = -1; let locusCrossed = 0;
    if (process.env.PF_CB_LOCUS_AUDIT === '1') {
      const LA_N = Math.round(envF('PF_CB_LOCUS_N', 40));
      for (const t of liveIdx) {
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        const pairs: Array<[number, number]> = [[a, b], [b, c], [c, a]];
        const hits: Array<[number, number]> = [];
        // BRANCH CONTEXT for the closure invariant. Without it every triangle merely TOUCHING a curtain reports a
        // kink at its on-locus endpoint (rA there is the other branch) and the invariant reads the full 2 mm jump —
        // a false FAIL on exactly the geometry the curtain just closed.
        let triLocTh = NaN; let triBr = 0;
        if (BR_EVAL) {
          for (const v of [a, b, c]) if (onLoc(v)) { triLocTh = vLocTh[v]; break; }
          if (!Number.isNaN(triLocTh)) {
            const dBl = dTh(a, b); const dCl = dTh(a, c);
            let lu = triLocTh;
            while (lu - vth[a] > Math.PI) lu -= TWO_PI;
            while (vth[a] - lu > Math.PI) lu += TWO_PI;
            const thC = vth[a] + (dBl + dCl) / 3;
            triBr = thC > lu + LOC_EPS ? 1 : thC < lu - LOC_EPS ? -1 : 0;
          }
        }
        /** unwrap the absolute locus θ into the frame of a segment that starts at `origin`. */
        const luIn = (origin: number): number => {
          if (triBr === 0 || Number.isNaN(triLocTh)) return NaN;
          let lu = triLocTh;
          while (lu - origin > Math.PI) lu -= TWO_PI;
          while (origin - lu > Math.PI) lu += TWO_PI;
          return lu;
        };
        for (const [p, qv] of pairs) {
          const k = locateKink(vth[p], vz[p], vth[p] + dTh(p, qv), vz[qv], luIn(vth[p]), triBr);
          if (k !== null) hits.push(edgeParam(p, qv, k.t));
        }
        if (hits.length < 2) continue;
        locusCrossed += 1;
        const ax = vx[a]; const ay = vy[a]; const az = vz[a];
        let nx = (vy[b] - ay) * (vz[c] - az) - (vz[b] - az) * (vy[c] - ay);
        let ny = (vz[b] - az) * (vx[c] - ax) - (vx[b] - ax) * (vz[c] - az);
        let nz = (vx[b] - ax) * (vy[c] - ay) - (vy[b] - ay) * (vx[c] - ax);
        const nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-18) continue;
        nx /= nl; ny /= nl; nz /= nl;
        let worst = 0;
        for (let i = 0; i < hits.length; i += 1) for (let j = i + 1; j < hits.length; j += 1) {
          const [t0h, z0h] = hits[i]; const [t1h, z1h] = hits[j];
          let dth2 = t1h - t0h;
          if (dth2 > Math.PI) dth2 -= TWO_PI; else if (dth2 < -Math.PI) dth2 += TWO_PI;
          const luChord = luIn(t0h);
          for (let k = 0; k <= LA_N; k += 1) {
            const u = k / LA_N;
            const th = t0h + dth2 * u; const z = z0h + (z1h - z0h) * u;
            const r = Rbr(th, z, luChord, triBr);
            const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
            if (dd > worst) worst = dd;
          }
        }
        if (worst > locusMax) { locusMax = worst; locusT = t; }
      }
    }

    // ───────── CURTAIN AUDIT (the curtain's own ruler — the barycentric oracle CANNOT see it) ─────────
    // A curtain triangle's (θ,z) footprint is a degenerate segment, so every barycentric sample lands exactly in its
    // own plane and sagOfN returns ~0 by construction. That is a blind spot, not a pass. What actually has to be
    // true is: (1) each branch CURVE r∓(θ*,z) is followed to tolerance by the chord between consecutive curtain
    // vertices, and (2) the two copies never come closer than the weld radius. Measure both directly.
    let curtainChordMax = 0; let curtainChordE = -1; let curtainEdges = 0;
    let placeMax = 0; let placeAtTh = 0; let placeAtZ = 0; let placeUnresolved = 0;
    const placeAll: number[] = [];
    // ── ATTRIBUTION. A slot that has gone DORMANT (its locus died) still owns a grid column, its vertices are still
    //    tagged onLoc, and its vertical edges are therefore still swept by this audit — even though |Δr| ≈ 0 there so
    //    the PINCH path emitted no curtain triangle at all. Measuring "distance to the nearest OTHER locus" on such an
    //    edge is meaningless, and it is exactly the kind of probe that can dominate a p999/MAX. Split the distribution
    //    by whether the edge really carries a jump at BOTH of its own endpoints, so the tail can be attributed to a
    //    real mis-placement rather than to a dead column, or vice versa. Costs 4 rA evals per curtain edge.
    const placeLive: number[] = []; const placeDead: number[] = [];
    let liveJumpEdges = 0; let deadJumpEdges = 0;
    const worstProbes: Array<{ arc: number; th: number; z: number; live: boolean; slot: number; jP: number; jQ: number }> = [];
    const PLACE_WIN = envF('PF_CB_PLACE_WIN', 0.35);   // >> the 0.0935 rad median inter-locus gap
    const PLACE_RES = envF('PF_CB_PLACE_RES', 5e-4);  // rad per sample; window is swept at CONSTANT resolution
    // The window sweep is ~1400 rA evals PER PROBE, so on a multi-million-triangle run the audit can cost more
    // than the mesh. STRIDE subsamples the curtain EDGE list (deterministically, 1-in-N) without touching the
    // window or its resolution, so the distribution is preserved and only its sample count falls.
    const PLACE_STRIDE = Math.round(envF('PF_CB_PLACE_STRIDE', 1));
    let liveCurtainTris = 0; let minSepLiveMm = Infinity; let minSepAt = '';
    let curtainVerts = 0;
    {
      const CA_N = Math.round(envF('PF_CB_CURT_AUDIT_N', 64));
      const seen = new Set<number>();
      for (const t of liveIdx) {
        const vsT = [ta[t], tb[t], tc[t]];
        if (onLoc(vsT[0]) && vLocTh[vsT[0]] === vLocTh[vsT[1]] && vLocTh[vsT[1]] === vLocTh[vsT[2]]) liveCurtainTris += 1;
        for (const [p, qv] of [[vsT[0], vsT[1]], [vsT[1], vsT[2]], [vsT[2], vsT[0]]] as Array<[number, number]>) {
          if (!onLoc(p) || vLocTh[p] !== vLocTh[qv]) continue; // (cheap test first: keeps `seen` tiny)
          const k = eKey(p, qv);
          if (seen.has(k)) continue;
          seen.add(k);
          const bp = vBranch[p]; const bq = vBranch[qv];
          if (bp !== 0 && bq !== 0 && bp !== bq) {
            // a CROSS edge: its 3D length is the realized jump |r+ − r−| at this (θ,z)
            const L = eLen(p, qv);
            if (L < minSepLiveMm) { minSepLiveMm = L; minSepAt = `θ=${vth[p].toFixed(6)} z=${vz[p].toFixed(4)}`; }
            continue;
          }
          if (vz[p] === vz[qv]) continue;
          // PINCH-to-PINCH: both ends are branch 0, so the curtain closed to a point here and NO curtain triangle was
          // emitted. Ruling such an edge against "the nearest locus" measures nothing about the mesh.
          if (bp === 0 && bq === 0) continue;
          curtainEdges += 1;
          const s = edgeSagN(p, qv, CA_N);
          if (s > curtainChordMax) { curtainChordMax = s; curtainChordE = p; }
          // CURTAIN PLACEMENT ERROR — the honest metric for a CURVED locus, and the one that must reach tolerance.
          // edgeSagN reads the branch only where |theta - theta0| < LOC_EPS. For a straight column (dTh = 0) that is
          // every sample, so its number is meaningful (BasketWeave: 4.767 um). For a traced chain the interior
          // samples sit OFF the locus and are read raw, so that number mixes in the 600 um jump and is not a
          // placement measure. What actually matters is how far the chord strays from the locus in THETA: that
          // strip is where the mesh sits on the wrong side of the cliff, and its width in ARC is the real error.
          if (CHAIN && (PLACE_STRIDE <= 1 || curtainEdges % PLACE_STRIDE === 0)) {
            const dthE = dTh(p, qv);
            const jP = Math.abs(R(canon(vth[p] + BR_EPS), vz[p]) - R(canon(vth[p] - BR_EPS), vz[p]));
            const jQ = Math.abs(R(canon(vth[qv] + BR_EPS), vz[qv]) - R(canon(vth[qv] - BR_EPS), vz[qv]));
            const liveEdge = jP > TOL && jQ > TOL;
            if (liveEdge) liveJumpEdges += 1; else deadJumpEdges += 1;
            for (let q = 1; q < 4; q += 1) {
              const tt = q / 4;
              const thC = vth[p] + dthE * tt; const zC = vz[p] + (vz[qv] - vz[p]) * tt;
              // UN-CEILED: the previous +/-0.02 rad window (900 um of arc) CLIPPED the measurement -- anything worse
              // came back "unresolved" and the MAX pinned at the window edge, so a fix that halved the error and one
              // that did nothing both read ~988 um. Sweep a window far wider than the 0.0935 rad median inter-locus
              // gap, at constant angular resolution, and keep the whole distribution rather than just the MAX.
              const nS = Math.max(64, Math.ceil((2 * PLACE_WIN) / PLACE_RES));
              const thL = locusThNear(zC, canon(thC), PLACE_WIN, nS);
              if (!Number.isFinite(thL)) { placeUnresolved += 1; continue; }
              let dd = Math.abs(canon(thC) - thL); if (dd > Math.PI) dd = TWO_PI - dd;
              const arc = dd * R(canon(thL), zC);
              placeAll.push(arc);
              if (liveEdge) placeLive.push(arc); else placeDead.push(arc);
              if (arc > 0.005) {
                worstProbes.push({ arc, th: thC, z: zC, live: liveEdge, slot: vLocTh[p], jP, jQ });
                if (worstProbes.length > 4000) { worstProbes.sort((x, y) => y.arc - x.arc); worstProbes.length = 2000; }
              }
              if (arc > placeMax) { placeMax = arc; placeAtTh = thC; placeAtZ = zC; }
            }
          }
        }
      }
      for (let v = 0; v < vth.length; v += 1) if (onLoc(v)) curtainVerts += 1;
    }

    const headlineMax = Math.max(maxSag, maxFixed, tailMax);
    const sorted = sags.slice().sort((a, b) => a - b);
    const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const over = sorted.filter((s) => s > TOL).length;
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const locus = (t: number): string => {
      if (t < 0) return 'n/a';
      const [a, b, c] = [ta[t], tb[t], tc[t]];
      const es = [eLen(a, b), eLen(b, c), eLen(c, a)].map((x) => (x * 1000).toFixed(1)).join('/');
      const zc = (vz[a] + vz[b] + vz[c]) / 3;
      return `z=[${[vz[a], vz[b], vz[c]].map((x) => x.toFixed(2)).join(',')}] (${((100 * zc) / H).toFixed(0)}% H) θ=[${[vth[a], vth[b], vth[c]].map((x) => x.toFixed(4)).join(',')}] edges(µm)=${es} feat=[${[vFeat[a], vFeat[b], vFeat[c]].map((f) => (f ? 1 : 0)).join('')}] branch=[${[a, b, c].map((v) => (onLoc(v) ? (vBranch[v] > 0 ? '+' : vBranch[v] < 0 ? '-' : '0') : '.')).join('')}]`;
    };

    const outDir = join('research', 'exchange', '_strataConformBisect');
    mkdirSync(outDir, { recursive: true });
    const tag = `${STYLE.toLowerCase()}_${STAGE}_${DIRECTED ? 'D' : 'l'}${SNAP ? 'S' : '-'}${REPROJ ? 'R' : '-'}${CURTAIN ? 'C' : BR_EVAL ? 'e' : '-'}`;
    const buf = Buffer.alloc(84 + soup.length * 50);
    buf.write('STRATA conforming-bisection', 0, 'ascii');
    buf.writeUInt32LE(soup.length, 80);
    let o = 84;
    for (const [a, b, c] of soup) {
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const nl = Math.hypot(nx, ny, nz) || 1;
      buf.writeFloatLE(nx / nl, o); buf.writeFloatLE(ny / nl, o + 4); buf.writeFloatLE(nz / nl, o + 8);
      for (const [k, p] of [a, b, c].entries()) { buf.writeFloatLE(p[0], o + 12 + k * 12); buf.writeFloatLE(p[1], o + 16 + k * 12); buf.writeFloatLE(p[2], o + 20 + k * 12); }
      buf.writeUInt16LE(0, o + 48); o += 50;
    }
    writeFileSync(join(outDir, `${tag}.stl`), buf);

    const report = [
      '',
      `===== STRATA CONFORMING-BISECTION: ${STYLE} ${STAGE.toUpperCase()}  [${DIRECTED ? 'DIRECTED' : 'lepp'} | ${SNAP ? 'SNAP' : 'no-snap'} | ${REPROJ ? 'REPROJ' : 'no-reproj'} | ${CURTAIN ? 'θ-CURTAIN' : BR_EVAL ? 'branch-eval only (NO curtain)' : 'no-curtain'}] =====`,
      `params ${JSON.stringify(styleParams)}`,
      `grid ${gu}×${gv} → ${nc} cols (${initTris} init tris) → ${soup.length} tris (alloc ${ta.length}/${triCap})${capped ? '  [CAPPED]' : ''}   ${((Date.now() - t0ms) / 1000).toFixed(0)}s, ${(rEvals / 1e6).toFixed(0)}M rA evals`,
      `splits ${iters}   snaps ${nSnap} (jump-class ${nJump})   transverse re-solves ${nReproj}   z-steps ${zSteps.length}`,
      `--- θ-JUMP LOCI (generic two-scale detector, ${(curtScanEvals / 1e6).toFixed(2)}M evals) ---`,
      `  brackets ${curtBrackets} → rejected ${curtRejected} (of which ${curtSnaking} SNAKING = jump present at <${(CURT_ZFRAC*100).toFixed(0)}% of z probes ⇒ NEEDS THE TRACED-POLYLINE CURTAIN, refused here) → detected ${jumpLoci.length}${jumpLoci.length > 0 ? `  θ*=[${jumpLoci.slice(0, 8).map((x) => x.toFixed(9)).join(', ')}${jumpLoci.length > 8 ? ', …' : ''}]  grid-col idx=[${jumpLoci.slice(0, 8).map((x) => ((x * gu) / TWO_PI).toFixed(4)).join(', ')}${jumpLoci.length > 8 ? ', …' : ''}]` : ''}`,
      `  chains: built ${chainsBuilt}, matched ${chainMatched}, locally RECOVERED ${chainRecovered}, HELD ${chainHeld} (${chainSlots > 0 ? ((100 * chainHeld) / chainSlots).toFixed(1) : '0'}% hold rate), of which SUSPECT (jump present at the held θ) ${chainSuspect}; terminal-snap to true death point ${chainTermSnap}`,
      `  chains: reprojected splits ${chainReproj}, reproj-FAILED ${chainReprojFail}`,
      ...(TRACE ? [`  TRACER: ${trCurvesT} curves → ${trBranchesT} monotone branches → ${trSlotsT} column slots; ${trRowsAddedT} merge-corner ROWS inserted; θ-order violations ${trOrderViolT} (worst backward step ${um(trBackMaxT)} µm arc), cycle-breaks ${trCycleBreakT}; order-repair DEMOTED ${trDemotedT}/${trLiveSlotsT} live row-slots; MINSEP moved ${trMinsepLive} LIVE columns (worst ${um(trMinsepMax)} µm arc)  ${trOrderViolT === 0 && trMinsepLive === 0 ? 'OK' : '*** SLOT ORDER INCONSISTENT ***'}`] : []),
      ...(TRACE ? [`  TRACER internals: hops ${trHopsT}, merges ${trMergesT}, dead-ends ${trDeadT}, closed loops ${trClosedT}, per-curve budget hits ${trBudgetHitT}`] : []),
      ...(TRACE ? [`  TRACER COVERAGE (independent row scans on ${TR_AUDROWS} rows/band): loci with NO live slot within 20 µm ${trAudMiss}/${trAudTot}  ${trAudMiss === 0 ? 'PASS' : `FAIL worst ${um(trAudWorst)} µm @ ${trAudAt}`};  GHOST live slots with no locus ${trGhost}/${trGhostTot}  ${trGhost === 0 ? 'PASS' : 'FAIL'}`] : []),
      `  curtain: ${curtainTris} init tris, ${liveCurtainTris} live, ${curtainPairs} doubled row-slots, ${pinchVerts} pinch verts (|Δr|<${(PINCH_MM * 1000).toFixed(3)} µm, init MIN |Δr| ${minBranchSepMm === Infinity ? 'n/a' : `${um(minBranchSepMm)} µm`}), ${curtainVerts} branch-tagged verts, ${branchSplits} branch-inherited splits`,
      `  branch separation (live cross-edges): MIN ${minSepLiveMm === Infinity ? 'n/a' : `${um(minSepLiveMm)} µm at ${minSepAt}`}  vs weld ${um(WELD_MM)} µm ⇒ ${minSepLiveMm === Infinity ? 'n/a' : `${(minSepLiveMm / WELD_MM).toFixed(1)}×  ${minSepLiveMm > WELD_MM ? 'OK' : '*** CURTAIN CAN WELD SHUT ***'}`}`,
      `  CURTAIN CHORD audit (${curtainEdges} branch edges @ n=${Math.round(envF('PF_CB_CURT_AUDIT_N', 64))}): MAX ${um(curtainChordMax)} µm  ${curtainChordMax <= TOL ? 'PASS' : 'FAIL'}${curtainChordE >= 0 ? `  @ θ=${vth[curtainChordE].toFixed(6)} z=${vz[curtainChordE].toFixed(3)}` : ''}${CHAIN ? '   [NOTE: valid only for STRAIGHT loci; see placement error below]' : ''}`,
      ...(CHAIN ? (() => {
        const so = placeAll.slice().sort((x, y) => x - y);
        const pq = (f: number): number => (so.length === 0 ? 0 : so[Math.min(so.length - 1, Math.floor(f * so.length))]);
        const dist = (a: number[], tag: string): string => {
          if (a.length === 0) return `    ${tag}: none`;
          const s2 = a.slice().sort((x, y) => x - y);
          const f = (fr: number): string => um(s2[Math.min(s2.length - 1, Math.floor(fr * s2.length))]);
          return `    ${tag}: n=${s2.length} p50 ${f(0.5)} p90 ${f(0.9)} p99 ${f(0.99)} p999 ${f(0.999)} MAX ${um(s2[s2.length - 1])} µm   over-${TOL}mm ${s2.filter((x) => x > TOL).length}`;
        };
        worstProbes.sort((x, y) => y.arc - x.arc);
        return [
          `  CURTAIN PLACEMENT error (chord→locus θ offset, in arc; window ±${PLACE_WIN} rad @ ${PLACE_RES} rad/sample):`,
          `    MAX ${um(placeMax)} µm  ${placeMax <= TOL ? 'PASS' : 'FAIL'}  @ θ=${placeAtTh.toFixed(6)} z=${placeAtZ.toFixed(3)}`,
          `    distribution over ${so.length} probes (edge stride 1-in-${PLACE_STRIDE}): p50 ${um(pq(0.5))}  p90 ${um(pq(0.9))}  p99 ${um(pq(0.99))}  p999 ${um(pq(0.999))} µm   over-${TOL}mm ${so.filter((x) => x > TOL).length}/${so.length}   unresolved (no locus in window) ${placeUnresolved}`,
          `    ATTRIBUTION — curtain edges: ${liveJumpEdges} LIVE (|Δr|>tol at BOTH ends) / ${deadJumpEdges} DEAD (a dormant slot: no jump, PINCH ⇒ no curtain triangle at all)`,
          dist(placeLive, 'LIVE probes '),
          dist(placeDead, 'DEAD probes '),
          `    worst ${Math.min(10, worstProbes.length)} probes (arc µm | live? | slot | |Δr| at the two edge ends µm):`,
          ...worstProbes.slice(0, 10).map((w) => `      ${um(w.arc).padStart(10)} | ${w.live ? 'LIVE' : 'dead'} | slot ${String(w.slot).padStart(3)} | θ=${w.th.toFixed(6)} z=${w.z.toFixed(3)} | ${um(w.jP)} , ${um(w.jQ)}`),
        ];
      })() : []),
      `cleanup: collapsed ${collapsedTris} tris (safe-collapse ${safeCollapses}, link-refused ${refusedCollapses} with ${refusedOffenders} offenders, flips ${flipsDone}, flips-refused-on-locus ${flipsLocusRefused})   welded-splits ${weldedSplits}${NOWELD ? ' (REFUSED)' : ' (allowed)'}`,
      `heap: ${heapT.length} left, worst-left ${um(heapLeftMax)} µm, key-inversions ${keyInversions}, no-op splits ${stuck}   MAXtri@oracle${oracleRef} ${maxT >= 0 ? um(sagOfN(maxT, oracleRef)) : 'n/a'} µm`,
      '--- WATERTIGHT (3D position-weld) ---',
      `  non-manifold edges : ${nonManifold}  ${nonManifold === 0 ? 'OK' : 'FAIL'}`,
      `  seam-crack edges   : ${seamCrack}  ${seamCrack === 0 ? 'OK' : 'FAIL'}`,
      `  boundary edges     : ${boundary}   ${STAGE === 'solid' ? (boundary === 0 ? 'OK — CLOSED SOLID' : 'FAIL — open') : '(ring ⇒ top+bottom only)'}   loops ${loops.length}`,
      `  soup: ${soup.length} tris = ${liveIdx.length} outer wall + ${treadTris} treads + ${capTris} caps`,
      `--- FIDELITY ---`,
      `  HEADLINE MAX ${um(headlineMax)} µm  ${headlineMax <= TOL ? 'PASS' : 'FAIL'}   = max(adaptive ${um(maxSag)}, fixed-${oracleN} ${um(maxFixed)}, tail-${tailN} ${um(tailMax)})`,
      `  ruler spread ${(headlineMax / Math.max(1e-9, Math.min(maxSag, maxFixed))).toFixed(1)}×  ${headlineMax > 4 * Math.min(maxSag, maxFixed) ? '*** LARGE SPREAD = UNCONFORMED h0 FEATURE (a sampling grid stepped over a jump wedge) ***' : 'consistent'}`,
      `  --- adaptive oracle (≤${AUD_HS}mm sample pitch, n∈[${AUD_NMIN},${AUD_NMAX}]) ---`,
      `  MAX ${um(maxSag)} µm  ${maxSag <= TOL ? 'PASS' : 'FAIL'}   p99 ${um(q(0.99))}  p50 ${um(q(0.5))}  over-${TOL}mm ${over}/${sorted.length}`,
      `  MAX-locus: ${locus(maxT)}`,
      `  [STRATA-comparable fixed oracle ${oracleN}]: MAX ${um(maxFixed)} µm   locus ${locus(maxFixedT)}`,
      ...(maxFixedT >= 0 && maxFixed > 4 * maxSag
        ? (() => {
            const a2 = ta[maxFixedT]; const b2 = tb[maxFixedT]; const c2 = tc[maxFixedT];
            const rv = (i: number): string => `vth=${vth[i].toPrecision(17)} vz=${vz[i].toPrecision(17)} vx=${vx[i].toPrecision(17)} vy=${vy[i].toPrecision(17)}`;
            const inFoot = fWa >= -1e-12 && fWb >= -1e-12 && fWc >= -1e-12;
            const thMin = Math.min(vth[a2], vth[b2], vth[c2]); const thMax = Math.max(vth[a2], vth[b2], vth[c2]);
            const zMin = Math.min(vz[a2], vz[b2], vz[c2]); const zMax = Math.max(vz[a2], vz[b2], vz[c2]);
            const thIn = canon(fTheta) >= thMin - 1e-9 && canon(fTheta) <= thMax + 1e-9;
            const zIn = fZ >= zMin - 1e-9 && fZ <= zMax + 1e-9;
            const rHere = R(canon(fTheta), fZ);
            return [
              '  *** RULER FORENSICS (fixed ruler exceeded adaptive by >4x) ***',
              `    A: ${rv(a2)}`,
              `    B: ${rv(b2)}`,
              `    C: ${rv(c2)}`,
              `    dB=${fDB.toPrecision(17)}  dC=${fDC.toPrecision(17)}   |n|=${fNl.toPrecision(17)}`,
              `    argmax bary (wa,wb,wc)=(${fWa.toPrecision(17)}, ${fWb.toPrecision(17)}, ${fWc.toPrecision(17)})  barycentric-in-footprint=${inFoot}`,
              `    argmax theta=${fTheta.toPrecision(17)} (θ-range [${thMin.toPrecision(10)}, ${thMax.toPrecision(10)}] in=${thIn})`,
              `    argmax z=${fZ.toPrecision(17)} (z-range [${zMin.toPrecision(10)}, ${zMax.toPrecision(10)}] in=${zIn})`,
              `    argmax r=${fR.toPrecision(17)}   re-evaluated r here=${rHere.toPrecision(17)}   dd=${fDd.toPrecision(17)}`,
            ];
          })()
        : []),
      `  TAIL re-measure (worst ${order.length} @ oracle ${tailN}): MAX ${um(tailMax)} µm  ${tailMax <= TOL ? 'PASS' : 'FAIL'}`,
      ...(process.env.PF_CB_HAUS === '1'
        ? [`  HAUSDORFF re-measure (surface → NEAREST MESH POINT, all ${hausTris} plane-over-tol tris, ${hausSamples} samples): MAX ${um(hausMax)} µm  ${hausMax <= TOL ? 'PASS' : 'FAIL'}`,
           `  HAUS-locus: ${locus(hausT)}`]
        : []),
      `  TAIL-locus: ${locus(tailT)}`,
      ...(process.env.PF_CB_LOCUS_AUDIT === '1'
        ? [`  LOCUS AUDIT (closure invariant): ${locusCrossed} tris still crossed by a detected locus; worst on-locus sag ${um(locusMax)} µm  ${locusMax <= TOL ? 'PASS' : 'FAIL'}`,
           `  LOCUS-locus: ${locus(locusT)}`]
        : []),
      `  min edge ${um(minEdge)} µm${TRACE ? `   [curtain-wall tris excluded from the graph ruler: ${curtainSkipped}]` : ''}`,
      '=========================================================',
      '',
    ].join('\n');
    // eslint-disable-next-line no-console
    console.log(report);
    writeFileSync(join(outDir, `${tag}.report.txt`), report);
    expect(nonManifold).toBe(0);
    expect(seamCrack).toBe(0);
    if (STAGE === 'solid') expect(boundary).toBe(0);
  }, 6_000_000);
});
