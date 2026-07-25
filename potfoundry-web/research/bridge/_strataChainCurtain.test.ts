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
import { mkdirSync, writeFileSync } from 'node:fs';
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
    const BR_EVAL = CURTAIN || envOn('PF_CB_CHAIN') || envOn('PF_CB_CURTAIN_EVAL'); // branch-aware analytic evaluation (ruler + detectors)
    const BR_EPS = envF('PF_CB_BR_EPS', 1e-9);          // branch-extraction offset in θ (rad)
    const LOC_EPS = envF('PF_CB_LOC_EPS', 1e-11);       // "this sample sits ON the locus" window (rad)
    const CURT_SCAN = Math.round(envF('PF_CB_CURT_SCAN', 8192));  // θ bins for the coarse jump scan
    const CURT_ZP = Math.round(envF('PF_CB_CURT_ZP', 23));        // z probes per θ bin
    const CURT_MERGE = envF('PF_CB_CURT_MERGE', 0.35);
    const CURT_ZFRAC = envF('PF_CB_CURT_ZFRAC', 0.9); // a column curtain requires a z-INVARIANT locus
    // ── L5 TRACED-CHAIN curtain: the curved-locus generalisation of the column curtain. Measured prerequisites:
    //    the loci are ORDER-PRESERVING (0 theta-order violations at 180/360/720 rows) and each is a GRAPH over z,
    //    so a chain is just a column whose theta varies per row -- and reprojection is a 1-D theta search at fixed z.
    const CHAIN = envOn('PF_CB_CHAIN');
    const CHAIN_SCAN = Math.round(envF('PF_CB_CHAIN_SCAN', 16384));  // drop a uniform column within this fraction of a col pitch
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
      let best = 0;
      for (let k = 1; k < N; k += 1) {
        const t = k / N;
        const th = th0 + d * t; const z = z0 + dz * t;
        const r = Rbr(th, z, locU, br);
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
    const locusThNear = (z: number, thPred: number, win: number): number => {
      const N = 24;
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
      if (CHAIN) {
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
            for (let j = from; j !== to; j += step) {
              const prev = chain[j]; const cand = per[j + step].slice();
              const used = new Set<number>(); const outR: number[] = new Array(m);
              for (let k = 0; k < m; k += 1) {
                let best = -1; let bd = Infinity;
                for (let c = 0; c < cand.length; c += 1) { if (used.has(c)) continue; const d = cyd(cand[c], prev[k]); if (d < bd) { bd = d; best = c; } }
                if (best >= 0 && bd < CHAIN_MATCH) { used.add(best); outR[k] = cand[best]; chainMatched += 1; }
                else { outR[k] = prev[k]; chainHeld += 1; }
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
      const gL: number[][] = []; const gR: number[][] = [];
      for (let j = 0; j <= rows; j += 1) {
        const z = za + (bandH * j) / rows;
        const rowL: number[] = []; const rowR: number[] = [];
        for (let i = 0; i < ncB; i += 1) {
          if (!colLocB[i]) { const v = addV(rowCols[j][i], z); rowL.push(v); rowR.push(v); continue; }
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
      for (let j = 0; j < rows; j += 1) for (let i = 0; i < ncB; i += 1) {
        const i1 = (i + 1) % ncB;
        addT(gR[j][i], gL[j][i1], gL[j + 1][i1]);
        addT(gR[j][i], gL[j + 1][i1], gR[j + 1][i]);
      }
      // ── THE CURTAIN. Winding is fixed by ORIENTATION CONSISTENCY, not by the sign of the jump: the minus sheet
      //    traverses M0→M1 and the plus sheet traverses P1→P0, so the curtain's boundary cycle must be
      //    M1 → M0 → P0 → P1. Correct for r+ > r− and r+ < r− alike; degenerate corners are dropped by addT.
      if (CURTAIN || CHAIN) for (let i = 0; i < ncB; i += 1) {
        if (!colLocB[i]) continue;
        for (let j = 0; j < rows; j += 1) {
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
        const thL = locusThNear(mz, canon(mth), CHAIN_WIN);
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
    const consider = (t: number): void => {
      if (t < 0 || !alive[t]) return;
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
          curtainEdges += 1;
          const s = edgeSagN(p, qv, CA_N);
          if (s > curtainChordMax) { curtainChordMax = s; curtainChordE = p; }
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
      `  chains: built ${chainsBuilt}, row-matches ${chainMatched}, HELD (coalesced/undetected) ${chainHeld}, reprojected splits ${chainReproj}, reproj-FAILED ${chainReprojFail}`,
      `  curtain: ${curtainTris} init tris, ${liveCurtainTris} live, ${curtainPairs} doubled row-slots, ${pinchVerts} pinch verts (|Δr|<${(PINCH_MM * 1000).toFixed(3)} µm, init MIN |Δr| ${minBranchSepMm === Infinity ? 'n/a' : `${um(minBranchSepMm)} µm`}), ${curtainVerts} branch-tagged verts, ${branchSplits} branch-inherited splits`,
      `  branch separation (live cross-edges): MIN ${minSepLiveMm === Infinity ? 'n/a' : `${um(minSepLiveMm)} µm at ${minSepAt}`}  vs weld ${um(WELD_MM)} µm ⇒ ${minSepLiveMm === Infinity ? 'n/a' : `${(minSepLiveMm / WELD_MM).toFixed(1)}×  ${minSepLiveMm > WELD_MM ? 'OK' : '*** CURTAIN CAN WELD SHUT ***'}`}`,
      `  CURTAIN CHORD audit (${curtainEdges} branch edges @ n=${Math.round(envF('PF_CB_CURT_AUDIT_N', 64))}): MAX ${um(curtainChordMax)} µm  ${curtainChordMax <= TOL ? 'PASS' : 'FAIL'}${curtainChordE >= 0 ? `  @ θ=${vth[curtainChordE].toFixed(6)} z=${vz[curtainChordE].toFixed(3)}` : ''}`,
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
      `  TAIL-locus: ${locus(tailT)}`,
      ...(process.env.PF_CB_LOCUS_AUDIT === '1'
        ? [`  LOCUS AUDIT (closure invariant): ${locusCrossed} tris still crossed by a detected locus; worst on-locus sag ${um(locusMax)} µm  ${locusMax <= TOL ? 'PASS' : 'FAIL'}`,
           `  LOCUS-locus: ${locus(locusT)}`]
        : []),
      `  min edge ${um(minEdge)} µm`,
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
