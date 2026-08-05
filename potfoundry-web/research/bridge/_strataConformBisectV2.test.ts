// _strataConformBisect.test.ts — STRATA-001 follow-on: SHAPE-AGNOSTIC closure by FEATURE-DIRECTED CONFORMING BISECTION.
// Gated PF_STRATA_CB=1. RESEARCH ONLY — never touches src/, never touches the proven _strataVoronoiSolid harness.
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
import { mkdirSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { baseRadius } from '../../src/geometry/profile';
import { buildRadiusFn } from './labkit';
import { traceLoci, DEFAULT_TRACE_OPTS, LOCUS_SCHEMA, type LocusArtifact } from './_strataLocusTrace';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS, type AlignedSeed } from './_strataAlignedSeed';
// S23 — the extracted absolute density field. Value import, but reachable ONLY when PF_CB_RECON is set;
// with the lever unset `loadReconField` is never called and no field is ever read.
import { loadReconField, type ReconField } from './_strataReconField';
import { REGION_SCHEMA, type RegionArtifact } from './_strataRegionExtract';
import type { PatchRegion } from './_judgeShape';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { openGpuRank, type GpuRank } from './_gpuRankBridge';
// S29 — the accept-override. Value import, but reachable ONLY when PF_CB_ACCEPT_OVERRIDE is set; with the
// lever unset `loadS29Override` is never called, no membership is read and no perpendicular ruler runs.
// Same shape as the S23 `loadReconField` import directly above, for the same reason.
//
// S-e: `research/tools/s29Perp.ts` — which `s29Accept` calls — is this arm's OWN TRANSCRIPTION of the
// certificate's perpendicular ruler. `_facetTruthLib` is NOT imported here and is NOT edited by this arm,
// so the instrument that scores S29 is not the instrument S29 was built from. The transcription is
// validated against `_facetTruthLib`'s own published V8/V9/V10 fixtures — and against two falsifiers that
// MUST fail — by `node research/bridge/out/_run_s29perp.cjs --validate`, run BEFORE this wiring existed.
import { loadS29Override, type S29Override } from '../tools/s29Accept';
// THE PREDICATE LIVES IN ONE FILE, imported by this driver AND by the sweep worker thread (see
// _sweepPool.ts's header for why parallelising it cannot move the mesh). `canon` / `dTh` / `edgeSag` /
// `locateKink` below are thin wrappers around these bodies — the bodies are verbatim transcriptions of what
// used to be inline here, so `PF_CB_DRIVER=heap` (the control for every comparison in this campaign) is
// byte-unchanged across the extraction.
import {
  canonTheta, dThRaw, edgeSagRaw, locateKinkRaw, edgeVerdictRaw, verdictIdentical,
  type SweepPredConst, type SweepRawVerdict,
} from './_sweepPredicate';
import { thetaJumpProbe } from './_sweepRA';
import { SweepPool, resolveSweepWorkers, type SweepPoolStats } from './_sweepPool';
// THE SHAPE TERM (2026-07-29 blade fix). Pure functions, no mesh state — see _shapeGuard.ts's header for
// why `aspect3` is the census's own metric and why that identity is the point.
import { aspect3, signedAreaParam, chordParam, type LiftedPoint } from './_shapeGuard';
import {
  defaultCavityOptions,
  planCavityForTriangle,
  type DriverMeshView,
} from './_strataCavityEscalate';
// THE ONE DEFINITION of the barycentric sag ruler (2026-07-29 audit-pool extraction). `sagOfN` and
// `sagAdaptive` below are now one-line wrappers over these bodies, transcribed VERBATIM, so the driver's
// serial audit and every audit WORKER THREAD run the same arithmetic instead of two copies that must be kept
// in sync. Same discipline and the same reason as _sweepPredicate.ts's extraction of edgeSag / locateKink —
// and it matters MORE here, because `sagAdaptive` is also the DEFAULT heap key (PF_CB_RANK=plane), so the
// extraction is only admissible if the STL comes out byte-identical. That is the first acceptance test.
import { sagOfNRaw, sagAdaptiveRaw, makeSagArgmax, type SagMesh } from './_sagKernel';
// PARALLEL POST-LOOP AUDIT (PF_CB_AUDIT_WORKERS, default = physical cores; 1 = today's exact serial path).
// READ-ONLY against the mesh and against rA, so it cannot move a vertex and the STL cannot change.
import {
  resolveAuditWorkers, mirrorAuditMesh, packAuditTris, runAuditPool, AUDIT_MAIN_STRIDE,
  type AuditJob, type AuditOutcome,
} from './_auditPool';
// PHASE 2 (spec §5.2-5.4). The certificate tells the driver WHERE to look; this is the consumer side.
import {
  PHASE2_RUN_SCHEMA, buildTightenField, phase2Key, readLociFile, verifyLociProvenance, writeJsonFile,
  type Phase2RunManifest, type TightenField,
} from './_phase2Loci';

const RUN = process.env.PF_STRATA_CB === '1';
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

describe('STRATA conforming-bisection', () => {
  it.runIf(RUN)('meshes any style by feature-directed conforming bisection', async () => {
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
    // ─── TWO DIFFERENT JOBS. GETTING THEM BACKWARDS RE-CREATES THE ZENO MECHANISM (spec §1.2) ───
    // SNAP_ALPHA is a RELATIVE SLIVER GUARD on WHERE a new vertex may be PLACED: a crossing within α of an
    // endpoint would make a needle, so the split is declined. It is NOT a conformance test, and used as one —
    // which is what the heap driver does today — it never terminates: once a vertex sits near a crease every
    // later crossing has t inside the band, SNAP declines, and midpoint bisection marches geometrically into
    // the 50 nm weld wall (worklog 2026-07-29, "CORRECTIONS TO MY OWN READING" #3).
    // CONF_MM is the ABSOLUTE CONFORMANCE CRITERION, and it exists only under PF_CB_DRIVER=sweep: an edge is
    // CONFORMED once one of its endpoints is within CONF_MM of the located crossing POINT in 3-D. Absolute ⇒ it
    // TERMINATES — once a vertex is within 0.6 µm the edge stays conformed however short it later gets. The
    // 0.6 µm default is this file's own header number (L36-39: "placing the vertex within ~0.6 µm of the crest
    // is REQUIRED"). SNAP_ALPHA survives under `sweep` ONLY as the placement guard.
    const SNAP_ALPHA = envF('PF_CB_SNAP_ALPHA', 0.12); // reject crossings within α of an endpoint (sliver guard)
    const CONF_MM = envF('PF_CB_CONF_UM', 0.6) / 1000; // sweep-driver CONFORMANCE radius (NOT a sliver guard)
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
    // ─────────── V2-L1  LAST-CHANCE PLACEMENT SEARCH (PF_CB_LASTCHANCE, default 0 = OFF) ───────────
    // WHY. `splitEdge` enumerates ELEVEN fixed chord fractions and, if none is admissible, abandons the
    // triangle forever — it lands in `unresolved` and is frozen into the STL. That ladder is an
    // ENUMERATION, not a SEARCH, and the 2026-08-03 jam census measured what it costs
    // (`research/exchange/_strataJamCensus/JAM_S40VFC.report.txt`, 1,180 of S40VFC's 4,283 unresolved
    // facets audited on the driver's own composed gates):
    //   * 1,153 (97.7 %) jammed with `selected=NONE` after a p50 of 35 placement attempts;
    //   * refusals are 89 % ASPECT (36,089) against 4,393 normal;
    //   * a dense 2,049-sample sweep of the SAME three edges under the SAME gates found a legal
    //     placement on 324 — **28.1 % of the jam has a legal split the ladder never samples**. One
    //     rescue sits 111.4 um off the surface and is legal at AR 44.6 against a cap of 50.
    // Best achievable worst-AR over all sampled placements is p50 51.9: where a legal window exists it
    // is a few percent wide, which is exactly why eleven fixed rungs miss it.
    //
    // WHERE, AND WHY NOT IN `splitEdge`. The run refused 773,079 candidates on aspect; escalating all of
    // them to a dense sweep would cost ~1.6 G extra gate evaluations. This fires ONLY at the moment a
    // facet is about to be abandoned — ~4,283 of them — so the whole lever costs ~0.4 M probes. It is a
    // LAST CHANCE, not a new ranking or acceptance rule: it changes no key, no tolerance and no gate.
    // Every placement it commits passed the identical `bisectAt` choke point every other split does.
    //
    // SOUNDNESS. `bisectAt` runs the S1/S2 shape gate BEFORE `addV`, and its weld-collapse / weld
    // returns add no vertex either, so a refused probe leaves no orphan in the weld grid. Sweeping it
    // repeatedly is therefore side-effect-free until the first acceptance.
    const LASTCHANCE = Math.max(0, Math.round(envF('PF_CB_LASTCHANCE', 0)));
    let lcTried = 0;    // facets that reached the last chance
    let lcRescued = 0;  // facets it split after the ladder had given up
    let lcProbes = 0;   // bisectAt probes it spent
    // ─────────── V2-L2  IN-LOOP CONSTRAINED-CAVITY ESCALATION (PF_CB_CAVITY, default 0 = OFF) ──────────
    // WHY. S46 measured that a perfect placement search is NOT enough: rescuing 1,280 jammed facets
    // removed only 409 from `unresolved`, because the children inherit the corner and jam in their
    // parents' place. Refinement over a FIXED CONNECTIVITY cannot reach a conforming anisotropic mesh at
    // a crease — the jam census found NO legal single-edge split on any of three edges at any of 2,049
    // positions for 97.7% of jammed facets, with best-achievable AR clustered at p50 51.9 against a
    // cap of 50. The move set, not the placement, is the defect.
    //
    // WHAT. When both ordinary refinement AND the last-chance sweep fail, escalate to a local
    // CONNECTIVITY change: freeze a ring boundary around the facet, keep the feature edges as PSLG
    // constraints, and re-triangulate the interior. That is `_strataCorridorCavity`'s already-certified
    // planner, called in the loop instead of as a post-hoc pass over 22 hand-picked regions.
    //
    // WHY IT IS SOUND. The planner commits nothing without its full certificate: every named edge
    // recovered, zero proper crossings, AR <= the driver's own cap, zero admission failures, zero
    // non-manifold edges, equal Euler characteristic, an unchanged frozen boundary and a strict visual
    // improvement. This driver then applies the edit with its OWN `killT`/`addV`/`addT`, and every born
    // triangle goes through `consider` exactly like a split child. No gate is relaxed.
    //
    // WHY IT IS AFFORDABLE. It fires once per facet that has already exhausted every cheaper move —
    // ~4,000 of them at this config, against 1.5 M split candidates.
    const CAVITY = Math.max(0, Math.round(envF('PF_CB_CAVITY', 0)));          // 0 = off, else patch size
    const CAVITY_BUDGET = Math.round(envF('PF_CB_CAVITY_BUDGET', 20000));     // hard cap on escalations
    const CAVITY_RINGS = Math.round(envF('PF_CB_CAVITY_RINGS', 2));
    const CAVITY_ROUNDS = Math.round(envF('PF_CB_CAVITY_ROUNDS', 3));
    let cavTried = 0; let cavAccepted = 0; let cavApplied = 0;
    let cavRemoved = 0; let cavAdded = 0; let cavOrphanAbort = 0;
    // / are declared far below, so the payload is COLLECTED here and written there.
    const CAVITY_DUMP = envOn('PF_CB_CAVITY_DUMP');
    const cavDumps: unknown[] = [];
    let cavRounds = 0;
    let cavPatchSum = 0; let cavChainSum = 0; let cavStepSum = 0;
    let cavSawWitness = 0; let cavHitPatchRim = 0;
    const cavRefusals = new Map<string, number>();
    // ══════════════════════════════════════════════════════════════════════════════════════════════════════
    // L5  THE SHAPE TERM — four levers, ALL DEFAULT ON, each individually reachable so the DEFECT stays
    //     reproducible. Diagnosis: research/lab/2026-07-29-strata-perf-convergence-worklog.md, "DIAGNOSED".
    //     Maths and metric justification: research/bridge/_shapeGuard.ts's header.
    // ══════════════════════════════════════════════════════════════════════════════════════════════════════
    // PF_CB_SHAPE=0 PF_CB_MID3D=0 PF_CB_LONGFALL=0 together restore the pre-2026-07-29 splitter EXACTLY —
    // no extra rA evaluation, no extra branch taken — which is what makes the blade census a valid A/B.
    // VERIFIED, NOT ASSERTED: with those three off, GothicArches ring 40x28 / 120 k / DIRECTED+SNAP /
    // PF_CB_ACCEPT=0.0035 reproduces the pre-change baseline gothicarches_ring_DS-.stl BYTE-FOR-BYTE
    // (md5 f574c61bdfc9df7cdec953138bd8837f), with every report line identical down to `heap: 58545 left`
    // and `min edge 1.892 um`. The defect therefore stays exactly reproducible for comparison.
    //
    //  S1 SHAPE GUARD (PF_CB_SHAPE, default ON). Before a split is committed, compute `aspect3` of EVERY
    //     child that would be produced, on BOTH sides of the edge (bisectAt splits every incident triangle,
    //     while the old PF_CB_AR cap was evaluated only for the POPPED triangle — MEASURED: 68 % of blade
    //     births, 1 142 of 1 688, damaged a NEIGHBOUR, and the neighbour columns carried all the large
    //     amplification x42/x145/x91/x214). Refuse if any child exceeds PF_CB_SHAPE_AR.
    //
    //     THE DEFAULT, 50, IS THE CENSUS'S OWN BLADE DEFINITION, AND IT IS THE LOOSEST CAP THAT ZEROES THE
    //     CENSUS. research/tools/_bladeCensus.mjs calls a facet a blade at AR > 50 and every number in the
    //     diagnosis is quoted at that threshold, so the guard's contract is checkable in one line: after
    //     this fix the census's blade count is 0.
    //
    //     THE MEASURED DISTRIBUTION it sits in. 40x28 / 120 k DIRECTED+SNAP control, 61 120 facets:
    //         p50 4.03   p90 12.99   p99 92.94   p99.9 233.6   max 521.4      (AR > 50 = 2.52 %)
    //     and on the 1.43 M-facet D51 run: p50 3.93  p90 18.99  p99 115.7  max 19 286  (AR > 50 = 3.36 %).
    //     50 is ~4x above the 90th percentile, so ordinary DIRECTED anisotropy — an edge ALONG a rib is
    //     long, the one ACROSS it is short, and that asymmetry is the lever's entire value — is nowhere
    //     near it; and it is below the 99th, so it genuinely binds on the population the diagnosis named.
    //
    //     THE CAP SWEEP, one flag apart, same 40x28 / 120 k config, census at ITS OWN threshold of 50:
    //       cap     census AR>50      folds   unresolved   plane-ruler MAX   min edge   wall
    //       OFF     1 540 (2.520 %)   0       0            295.802 um        1.892 um   284 s
    //       100       938 (1.535 %)   0       0            207.311 um        7.165 um   283 s
    //       50          0 (0.000 %)   0       56           405.396 um       12.575 um   278 s
    //       25          0 (0.000 %)   0       220          398.629 um       22.756 um   271 s
    //     100 is NOT enough — it still leaves 938 blades by the instrument's own definition. 25 buys
    //     nothing further on that instrument and quadruples the triangles the guard strands. 50 is the
    //     knee, and it is the knee because it IS the definition. (The plane-ruler column is the driver's
    //     own SELF-REPORT and the blade diagnosis proved it ~110x blind on exactly these facets — it is
    //     printed for completeness and must NOT be read as a fidelity ranking; the control's 295.802 um is
    //     measured on a mesh with 1 540 blades in it.)
    //
    //  S2 FOLD GUARD (PF_CB_SHAPE_FOLD, default ON, sub-lever of S1). Refuse a split that would flip a
    //     child's (theta,z) orientation relative to its parent. Targets the 2.22 % INVERTED population
    //     directly. Compared against the PARENT's sign, not against a fixed sign, so a mesh that already
    //     carries inverted facets (any guard-OFF run) can still be refined rather than deadlocking.
    //
    //  S3 3-D MIDPOINT (PF_CB_MID3D, default ON). The edge is CHOSEN by 3-D length; place the point so it
    //     is the midpoint in that same metric. SNAP's crossing placement is EXEMPT — it must land on the
    //     locus. See _shapeGuard.ts `chordParam`.
    //
    //  S4 LONGEST-EDGE PREFERENCE (PF_CB_LONGFALL, default ON). DIRECTED's max-sag choice is valuable and
    //     is NOT deleted: it is overridden only when the max-sag edge's split would violate S1 AT ITS BEST
    //     PLACEMENT (the midpoint) and the longest edge's would not. That is exactly Rivara's pair of
    //     hypotheses — longest edge, midpoint — recovered in the cases where they are needed and nowhere
    //     else. Counted (`shape-longfall`), so "how often does the lever actually get overridden" is a
    //     measured number rather than a hope.
    const SHAPE = process.env.PF_CB_SHAPE !== '0';
    const SHAPE_AR = envF('PF_CB_SHAPE_AR', 50);
    const SHAPE_FOLD = process.env.PF_CB_SHAPE_FOLD !== '0';
    const MID3D = process.env.PF_CB_MID3D !== '0';
    const MID3D_ITERS = Math.round(envF('PF_CB_MID3D_ITERS', 24));
    // Bound on how far the 3-D solve may move a placement away from the parametric target. The MEASURED
    // bias is ~0.09 (0.41/0.59 against 0.5), so 0.25 never binds on the observed population; it exists so a
    // pathological r(theta,z) cannot hand the guard a t=0.02 placement — i.e. so the FIX cannot become the
    // defect. Clamps are COUNTED and printed; a run where this fires is a finding, not a tuning knob.
    const MID3D_MAXSHIFT = envF('PF_CB_MID3D_MAXSHIFT', 0.25);
    const LONGFALL = process.env.PF_CB_LONGFALL !== '0';
    // ─────────────────── S5 CAP-TARGETED FLIP REPAIR — DEFAULT **OFF**, ON MEASUREMENT ───────────────────
    // The brief asked whether enabling tryFlip repairs CAP facets. Two separate answers, both measured on
    // the 40x28 / 120 k DIRECTED+SNAP control (1 540 facets over AR 50), three arms differing in ONE flag:
    //
    //  (a) PF_CB_FLIP=1 ALONE CANNOT REPAIR A CAP, and the reason is structural, not statistical. tryFlip is
    //      reachable ONLY from the needle-collapse loop, which iterates `shortEdges` — edges below
    //      PF_CB_NEEDLE_UM (0.2 um) — and only for the offenders blocking a collapse. A cap has all three
    //      edges long by construction (measured p50 longest 400 um), so it never enters that list and
    //      tryFlip is never called on it. MEASURED: the control reports `flips 0`, cap count unchanged.
    //
    //  (b) A cap-TARGETED entry point (this pass) does fire, and it is a PARTIAL mitigation that BUYS SHAPE
    //      WITH FIDELITY. MEASURED, control vs control+PF_CB_SHAPE_FLIP=1, identical in every other flag:
    //          facets over cap  1 540 -> 950   (38.3 % repaired; 1 463 tried, 640 performed)
    //          WORST AR         521.4 -> 521.4 (it never reaches the facet that matters)
    //          plane-ruler MAX  295.802 -> 382.775 um  (+29 %, attributable to those 640 flips alone)
    //      156 further flips were correctly refused for lying ON a locus.
    //
    // So it is left implemented, flag-gated and OFF. Turning it on would be exactly the "enable it hopefully"
    // the brief warns against: it fixes a third of the symptom, never the worst case, at a measured fidelity
    // cost — and with the S1 guard on there is nothing left for it to repair anyway (0 candidates, 0 flips).
    // PREVENTING THE BIRTH IS THE FIX; THIS IS A DRESSING.
    const SHAPE_FLIP = envOn('PF_CB_SHAPE_FLIP');
    // ══════════════ S6  THE POST-LOOP SHAPE INVARIANT (PF_CB_POST_SHAPE, DEFAULT ON) — 2026-07-29 ══════════════
    // S1-S4 guard `bisectAt`, and `bisectAt` ONLY. That is the whole of the guard: it is a property of SPLITS.
    // The passes that run AFTER the refinement loop are not covered, and two of them rewrite facets:
    //
    //   1. THE LINK-CONDITION-SAFE NEEDLE COLLAPSE (below, DEFAULT ON). Moving vertex v onto u rewrites every
    //      surviving triangle in v's star. It is guarded for TOPOLOGY (the link condition) and for NOTHING
    //      ELSE — no `aspect3` test, no `signedAreaParam` test — so it can raise a neighbour's aspect ratio
    //      above the cap, or invert it in (theta,z), and no instrument in this file would notice.
    //   2. `tryFlip`, called from the collapse loop WITHOUT its `gate` argument (PF_CB_FLIP=1, default OFF).
    //      It sign-checks both new triangles, so it CANNOT manufacture a fold — but nothing there bounds
    //      ASPECT, so it can manufacture a blade.
    //   (The S5 cap repair is NOT a gap: it already passes `tryFlip` an improvement gate.)
    //
    // CONSEQUENCE, and it is a MEASUREMENT defect before it is a mesh defect: a mesh whose refinement was
    // perfectly guarded can still fail the blade gate, and the failure would be attributed to the split guard,
    // which cannot have caused it. This lever closes that gap.
    //
    // THE INVARIANT. For the facets an operation TOUCHES — the live triangles it REWRITES, each compared
    // against itself after the rewrite — the operation is admitted iff BOTH hold:
    //        max aspect3 AFTER          <=  max aspect3 BEFORE      (never make the worst one worse)
    //        count(aspect3 > cap) AFTER <=  count BEFORE            (never add an over-cap facet)
    // Facets the operation DELETES appear on NEITHER side: deleting a facet can only help, and counting a
    // deleted blade on the `before` side would license the operation to raise a survivor to that blade's AR.
    // The second clause is not implied by the first — an operation can lower the worst AR of a pair while
    // pushing a clean facet over the cap, (60,3) -> (55,55) — and the second clause is what the blade GATE
    // actually counts, so both are enforced. When the touched set is clean (worst BEFORE <= cap) the first
    // clause alone already forbids any over-cap result, which is exactly "may not push a facet above the cap".
    //
    // THE CAP AND THE METRIC ARE THE SPLIT GUARD'S, VERBATIM: PF_CB_SHAPE_AR and `_shapeGuard.aspect3`, the
    // same expression research/tools/_bladeCensus.mjs computes. That identity is precisely what lets the blade
    // gate attribute a counted facet to a code path; a post-loop guard scored on any other quantity would
    // refuse the wrong facets and still leave the census reading blades.
    //
    // FOLD TOO, AND ONLY WHERE IT IS MISSING. The collapse also gets an S2-style (theta,z) sign test (sub-lever
    // PF_CB_SHAPE_FOLD, as for splits); `tryFlip` already has one and is not given a second.
    //
    // IT IS A SUB-LEVER OF S1. With PF_CB_SHAPE=0 this is INERT, so the guard-OFF control
    // (PF_CB_SHAPE=0 PF_CB_MID3D=0 PF_CB_LONGFALL=0) stays byte-unchanged and the blade defect stays exactly
    // reproducible. PF_CB_POST_SHAPE=0 turns it off on its own, with the split guard still on, which is the
    // A/B that prices it. NOTE both arms of that A/B carry the same 'H' tag suffix — use PF_CB_TAG_SUFFIX or
    // the second run silently overwrites the first.
    const POST_SHAPE = SHAPE && process.env.PF_CB_POST_SHAPE !== '0';
    // ══════════════ PARALLEL POST-LOOP AUDIT (PF_CB_AUDIT_WORKERS) — see _auditPool.ts ══════════════
    // MEASURED: a 2.5 M-cap run spent ~1229 s in total, and at 200x140 / 5 M cap the post-loop audit dominates
    // once refinement has finished. Every facet's score is a pure function of its three vertex coordinates and
    // of rA, READ-ONLY against the mesh, so the MEASUREMENT is evaluated in a worker pool while every
    // REDUCTION stays on this thread in the original order. 1 = today's exact serial path and no worker is
    // spawned; default = physical cores. THE ACCEPTANCE TEST is that 1 and N produce an IDENTICAL report,
    // including the rA eval total — a measurement that depends on thread scheduling is not a measurement.
    const AUDIT_WORKERS = resolveAuditWorkers();
    const AUDIT_CHUNK = Math.round(envF('PF_CB_AUDIT_CHUNK', 1024));
    const AUDIT_HEAP_MB = Math.round(envF('PF_CB_AUDIT_HEAP_MB', 1024));
    // PF_CB_AUDIT_VERIFY=1 — re-score EVERY pooled facet on the main thread with the driver's own
    // `sagAdaptive` / `sagOfN` and Object.is-compare. ~2x cost. The per-facet companion to the rA lattice
    // check the pool runs before it will start, and the same gate PF_CB_SWEEP_VERIFY is for the predicate.
    // Its extra evaluations are counted separately and EXCLUDED from the reported total, so a VERIFY run
    // still prints the same cost line as a plain one.
    const AUDIT_VERIFY = envOn('PF_CB_AUDIT_VERIFY');
    // ───────────────────── DRIVER SELECT — PF_CB_DRIVER (added 2026-07-29, spec §7.1) ─────────────────────
    // 'heap'  DEFAULT. Today's driver, unchanged and byte-reproducible: a binary max-heap keyed by PF_CB_RANK,
    //         popped worst-first. It is the CONTROL for every comparison, so nothing below may perturb it.
    // 'sweep' NEW. Phase-1 of research/lab/2026-07-29-quota-driver-spec.md: a local THRESHOLD predicate feeding
    //         a plain FIFO, with class routing (smooth → bisect to size, crease → directed+snap, jump → STOP
    //         and tag for the curtain stage), and the honest quantity demoted to an end-of-run certificate.
    //
    // WHY THERE IS NO RANKING KEY AT ALL. Three independent A/Bs at equal triangle budget (LEPP, DIRECTED+SNAP,
    // and a matched three-way on PF_CB_RANK — worklog §R1/§R1b) say ranking refinement on an ERROR estimate,
    // however honest, loses to the cheap plane ruler: plane distance measures how much a split will IMPROVE a
    // patch, point-to-triangle measures how BAD it is. Ranking on badness is a WORST-FIRST SINK — true-C0
    // facets are permanently worst, splits never improve them, and they absorb the budget. MEASURED: the losing
    // arm's own H2 argmax facet still carried 1953/3239/3318 µm edges from the UNTOUCHED initial grid after
    // 100 832 splits. The conclusion is not "pick a better key", it is DO NOT RANK: for an L∞ target every
    // violating triangle must be fixed, so ordering cannot move the fixed point of the predicate. A threshold
    // has no key to be biased. (edgeSag is ALSO size-correlated — it is admissible here ONLY because it is
    // compared against a CONSTANT, never against another triangle. That is the crux and it is easy to lose.)
    type DriverMode = 'heap' | 'sweep';
    const DRIVER: DriverMode = ((): DriverMode => {
      const raw = process.env.PF_CB_DRIVER;
      if (raw === undefined || raw === '') return 'heap'; // DEFAULT = today, byte-reproducible
      if (raw === 'heap' || raw === 'sweep') return raw;
      // FAIL LOUD, matching the PF_CB_RANK precedent: a run tagged as one experiment and driven by another is
      // exactly the confound this flag exists to remove.
      throw new Error(`PF_CB_DRIVER: unknown mode '${raw}' — expected heap | sweep`);
    })();
    const SWEEP = DRIVER === 'sweep';
    // PF_CB_RANK / PF_CB_BOUNDED are INERT under `sweep` — there is no rank. Silently ignoring an explicitly
    // set one would mislabel the run, so refuse (spec §7.3).
    if (SWEEP && process.env.PF_CB_RANK !== undefined && process.env.PF_CB_RANK !== '') {
      throw new Error(`PF_CB_DRIVER=sweep has NO ranking key — PF_CB_RANK='${process.env.PF_CB_RANK}' is inert. Unset it, or run PF_CB_DRIVER=heap.`);
    }
    if (SWEEP && process.env.PF_CB_BOUNDED !== undefined && process.env.PF_CB_BOUNDED !== '') {
      throw new Error(`PF_CB_DRIVER=sweep has NO ranking key — PF_CB_BOUNDED='${process.env.PF_CB_BOUNDED}' is inert. Unset it, or run PF_CB_DRIVER=heap.`);
    }
    // ── PF_CB_SWEEP_WORKERS — parallel PREDICATE evaluation, sweep driver ONLY (added 2026-07-29) ──
    // The heap driver is inherently serial (a global priority queue whose pops mutate shared topology). The
    // FIFO sweep is not: within one generation `triangleNeed` is READ-ONLY against the mesh and against rA,
    // independent per triangle, and ~100 % of the cost. So the MEASUREMENT is evaluated in a worker pool at
    // each generation boundary and the ACTIONS are applied serially by the unchanged loop below.
    //   1 = the existing serial path — NO worker is spawned and no prefetch table exists, so a regression is
    //       always bisectable against a code path that did not change.
    //   default = physical cores.
    // WHY THIS CANNOT MOVE THE MESH is argued at length in _sweepPool.ts. The short version: the pool computes
    // ONLY the pure per-edge measurement; the §3.3 jump-stickiness bookkeeping, the memo, every counter and
    // every mesh mutation stay on the main thread in the order they have always run. PF_CB_SWEEP_WORKERS=1
    // vs 8 must produce ONE STL md5, and that is the acceptance test.
    const SWEEP_WORKERS = SWEEP ? resolveSweepWorkers() : 1;
    // PF_CB_SWEEP_VERIFY=1 — re-measure EVERY prefetched edge on the main thread and Object.is-compare all
    // seven fields. ~2x cost; this is the gate that proves a worker's arithmetic is bit-identical rather than
    // close, and it is the per-edge companion to the rA lattice check the pool runs before it will start.
    const SWEEP_VERIFY = envOn('PF_CB_SWEEP_VERIFY');
    if (!SWEEP && process.env.PF_CB_SWEEP_WORKERS !== undefined && process.env.PF_CB_SWEEP_WORKERS !== '') {
      throw new Error(`PF_CB_SWEEP_WORKERS='${process.env.PF_CB_SWEEP_WORKERS}' only applies to PF_CB_DRIVER=sweep — the heap driver is serial by construction. Unset it, or run PF_CB_DRIVER=sweep.`);
    }
    // PF_CB_TIGHTEN is wired into `consider` — the HEAP driver's accept test. The sweep driver's accept test
    // is `triangleNeed`'s edge-sagitta THRESHOLD, which the field does not touch, so a `sweep` run given a
    // field would ignore it in silence and report a mesh tagged as Phase-2 that had no Phase-2 in it. Refuse,
    // matching the PF_CB_RANK / PF_CB_SWEEP_WORKERS precedent above. (The FIFO is also the arm D25 refuted at
    // drain scale; the heap is the one that converges, so it is the one Phase 2 feeds.)
    if (SWEEP && process.env.PF_CB_TIGHTEN !== undefined && process.env.PF_CB_TIGHTEN !== '') {
      throw new Error(`PF_CB_TIGHTEN is a HEAP-driver lever (it scales \`consider\`'s acceptTol) and is INERT under PF_CB_DRIVER=sweep. Unset it, or run the heap driver.`);
    }
    // ─── S29 ACCEPT-OVERRIDE — PF_CB_ACCEPT_OVERRIDE=<members.json>, NEW AND DEFAULT OFF. ───
    // Same refusal as PF_CB_TIGHTEN and for the same reason: the override's accept-side forced push lives in
    // `consider`, which is the HEAP driver's gate. Under `sweep` half the wiring would be silently inert and
    // the run would report a mesh tagged S29 with no S29 in it.
    if (SWEEP && process.env.PF_CB_ACCEPT_OVERRIDE !== undefined && process.env.PF_CB_ACCEPT_OVERRIDE !== '') {
      throw new Error(`PF_CB_ACCEPT_OVERRIDE is a HEAP-driver lever (its accept-side forced push is in \`consider\`) and is INERT under PF_CB_DRIVER=sweep. Unset it, or run the heap driver.`);
    }
    const t0ms = Date.now();

    const styleParams: Record<string, number> = { ...registryDefaults(STYLE) };
    if (process.env.PF_CB_PARAMS !== undefined) Object.assign(styleParams, JSON.parse(process.env.PF_CB_PARAMS) as Record<string, number>);
    const rA = buildRadiusFn(STYLE as StyleId, styleParams, DIMS);
    let rEvals = 0;
    const R = (th: number, z: number): number => { rEvals += 1; return rA(th, z); };

    // ═══════════ PHASE-2 TIGHTENING FIELD — PF_CB_TIGHTEN=<loci.json>, DEFAULT OFF ═══════════
    // WHAT IT CHANGES, AND ONLY THIS: the scalar `acceptTol` that `consider` tests against becomes a LOCAL
    // `acceptTol / tolScale(t)`, with tolScale >= 1 near a recorded exceedance locus and EXACTLY 1 elsewhere.
    // Same ranker, same splitter, same locus machinery, same heap, same cap, same audit. UNSET = today's
    // exact code path — `consider` reads the same `acceptTol` double it always has, so the STL md5 is
    // unchanged (proven, see the report line below and the byte-identity note in the worklog).
    //
    // WHY A FIELD AND NOT A BETTER RULER. The D25 run drained its heap with 0/903,506 triangles over its own
    // criterion at 7.806 um while the honest auditor read 19.247 um: the driver CONVERGED and has nothing
    // left to do. Three A/Bs (worklog R1/R1b) already refuted "give the driver an honest in-loop ruler" —
    // the honest quantity ranks by how BAD a facet is, refinement needs how much a split will IMPROVE it,
    // and the honest arms allocated measurably worse at equal budget. What is missing is not a ruler, it is
    // the certificate's ANSWER: 1,730 of 40,008,064 surface samples exceeded, at loci the plane ruler is
    // structurally blind to. Tell the driver where they are and let it use the ruler that works.
    //
    // WHY FROM SCRATCH AND NOT RESUMED. The driver is deterministic in (style, params, flags, field), so a
    // re-run with the field applied is a well-defined object with no dependence on the previous mesh's
    // topology. Resuming would make the result a function of the path taken, which is exactly the property
    // that made this campaign's committed baselines unreproducible.
    const TIGHTEN_PATH = process.env.PF_CB_TIGHTEN ?? '';
    let tighten: TightenField | null = null;
    let tightenSrc: { file: string; key: string; clusters: number; radiusMm: number; maxScale: number } | null = null;
    let tightenHits = 0;         // `consider` calls that landed inside a tightened ball
    let tightenFloorHits = 0;    // ... and were dropped by FLOOR_MM before the accept test ran
    let tightenPushes = 0;       // ... and were queued ONLY because the local tol was tighter than acceptTol
    if (TIGHTEN_PATH !== '') {
      const loci = readLociFile(TIGHTEN_PATH);
      // PROVENANCE IS REFUSED, NOT WARNED ABOUT. A loci set computed on another surface is not
      // "approximately right" — it is a different surface, and the mesh it produces would be plausible,
      // fully reported and wrong everywhere. Same discipline as the sizing-field artifact.
      const mism = verifyLociProvenance(loci, { style: STYLE, params: styleParams, dims: DIMS, tolMm: TOL, stage: STAGE });
      if (mism.length > 0) {
        throw new Error(`PF_CB_TIGHTEN=${TIGHTEN_PATH} does not match this run:\n  ${mism.join('\n  ')}`);
      }
      tighten = buildTightenField(loci);
      tightenSrc = {
        file: TIGHTEN_PATH, key: loci.run.key, clusters: tighten.clusters,
        radiusMm: tighten.radiusMm, maxScale: tighten.maxScale,
      };
    }

    // ═══════════ S29 ACCEPT-OVERRIDE — PF_CB_ACCEPT_OVERRIDE=<members.json>, DEFAULT OFF ═══════════
    // WHAT IT CHANGES, AND ONLY THIS:
    //     accept(t)  <=>  blindAccept(t)  AND  ( listed(t) ? perp(t) <= 10 µm : true )
    // For a LISTED facet the blind pass becomes NECESSARY BUT NO LONGER SUFFICIENT. The heap key, the
    // ranking, the escalation, the conformance-first ordering and `acceptTol` itself are UNTOUCHED, and an
    // unlisted facet takes a bit-identical path — nothing below is consulted for it. `tolScale` is NOT used
    // and `PF_CB_TIGHTEN` stays unset: this arm changes the QUANTITY, and bundling the tolerance lever would
    // make the result unattributable.
    //
    // WHY THE QUANTITY AND NOT THE TOLERANCE. S10B (×1.00), S12 and S28 (×1.00) are three refutations of ONE
    // shape — all three moved the number the blind ruler is compared against; none changed what is measured.
    // Scaling a blind ruler's threshold does not make it see.
    //
    // WHY THIS IS NOT R1b. R1b refuted the honest quantity as a GLOBAL RANKER and named the mechanism: a
    // worst-first SINK, because an honest quantity reports true-C0 facets as permanently worst and a split
    // never improves them. Here the honest quantity ranks NOTHING — it holds a veto over ACCEPTANCE at
    // 14,328 enumerated facets whose population EXCLUDES the h⁰/h¹ sinks by construction (cage and rim were
    // subtracted), and the veto is bounded by a per-site split budget with a re-strand tripwire.
    const OVERRIDE_PATH = process.env.PF_CB_ACCEPT_OVERRIDE ?? '';
    let s29: S29Override | null = null;
    let ovForcedPush = 0;   // `consider` calls the override kept out of the accepted set
    let ovNeedSize = 0;     // `triangleNeed` verdicts the override turned from 'none' into 'size'
    if (OVERRIDE_PATH !== '') {
      s29 = loadS29Override(OVERRIDE_PATH, {
        key: phase2Key(STYLE, styleParams, DIMS, TOL, STAGE), style: STYLE, stage: STAGE, tolMm: TOL,
      });
    }

    // canon / dTh now delegate to _sweepPredicate so the worker threads apply the IDENTICAL seam handling.
    // Both bodies are verbatim; aliasing rather than re-typing them is the point.
    const canon = canonTheta;

    // ───────────────────────────── mesh store (θ,z) with 3D spatial-hash weld ─────────────────────────────
    const vth: number[] = []; const vz: number[] = []; const vx: number[] = []; const vy: number[] = [];
    const vFeat: boolean[] = []; // vertex sits ON a detected feature locus
    let addVNew = false;         // did the last addV CREATE a vertex, or weld onto an existing one?
    const gcell = new Map<string, number[]>();
    const gi = (v: number): number => Math.floor(v / WELD_MM);
    const addV = (thetaRaw: number, z: number, feat = false): number => {
      const theta = canon(thetaRaw);
      const r = R(theta, z);
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
      const key = `${cx},${cy},${cz}`;
      const b = gcell.get(key); if (b === undefined) gcell.set(key, [idx]); else b.push(idx);
      return idx;
    };
    /** shortest-arc θ delta from a to b (handles the θ=0≡2π seam). */
    const dTh = (a: number, b: number): number => dThRaw(vth[a], vth[b]);
    /** point on edge (a,b) at parameter t∈[0,1], as (θ,z) — shortest arc. */
    const edgeParam = (a: number, b: number, t: number): [number, number] => [vth[a] + dTh(a, b) * t, vz[a] + (vz[b] - vz[a]) * t];

    const ta: number[] = []; const tb: number[] = []; const tc: number[] = []; const alive: boolean[] = [];
    const BIG = 1 << 27;
    // SHARDED edge index. Node's V8 caps a single Map at 2^23 entries (Chrome allows 2^24) — at ~1.5 unique edges
    // per live triangle that ceilings the mesher near 5.6M live triangles with "RangeError: Map maximum size
    // exceeded" (measured: GyroidManifold survives 7M allocated / 3.5M live, dies at 16M). Sharding by the low bits
    // of the key (which come from the second vertex index, so they distribute well) multiplies the ceiling by
    // EDGE_SHARDS. Drop-in: exposes the same get/set/delete the 8 call sites already use.
    const EDGE_SHARDS = 32;
    const edgeShards: Array<Map<number, number[]>> = Array.from({ length: EDGE_SHARDS }, () => new Map<number, number[]>());
    const edgeMap = {
      get: (k: number): number[] | undefined => edgeShards[k % EDGE_SHARDS].get(k),
      set: (k: number, v: number[]): void => { edgeShards[k % EDGE_SHARDS].set(k, v); },
      delete: (k: number): void => { edgeShards[k % EDGE_SHARDS].delete(k); },
    };
    const eKey = (a: number, b: number): number => (a < b ? a * BIG + b : b * BIG + a);
    const eAdd = (a: number, b: number, t: number): void => { const k = eKey(a, b); const l = edgeMap.get(k); if (l === undefined) edgeMap.set(k, [t]); else l.push(t); };
    // MEMORY: drop the key once its list empties. Without this, every edge EVER created leaves a permanent
    // empty-array entry, so edgeMap grows with CUMULATIVE allocation rather than live triangles and blows V8's
    // ~2^24 Map cap ("RangeError: Map maximum size exceeded") around 13M allocated — measured on GyroidManifold.
    // Behaviour-identical: neighbor() treats a missing key and an empty list the same (no incident triangle).
    // ─── PER-EDGE VERDICT MEMO (spec §1.5) — populated and read ONLY by the sweep driver ───
    // `edgeSag` and `locateKink` are pure functions of two vertex indices and their coordinates, and this driver
    // already establishes the invariant that makes memoising them sound: vertices are never moved, and
    // killT/addT never rewrite a live triangle's corners during refinement (see "RE-QUEUE THE SURVIVOR WITHOUT
    // RE-MEASURING IT" below). Every interior edge is tested by BOTH its incident triangles, so the memo halves
    // the predicate's cost. Entry lifetime is exactly the edge's: `eDel` drops the edgeMap key the moment the
    // incident list empties, so the eviction piggybacks there — one line, no separate bookkeeping.
    // THE INVARIANT IS BROKEN BY A VERTEX MOVE (spec §4.3), which is DEFERRED and NOT implemented here. When it
    // lands it must evict every edge incident to the moved vertex, gated by PF_CB_MEMO_VERIFY=1 (spec §6.5) —
    // a stale memo is the exact shape of the Voronoi hash-desync bug.
    interface EdgeVerdict { sag: number; kink: Kink | null; conformed: boolean; jumpConfirmed: boolean; px: number; py: number; pz: number }
    const edgeCache = new Map<number, EdgeVerdict>();
    const eDel = (a: number, b: number, t: number): void => { const k = eKey(a, b); const l = edgeMap.get(k); if (l === undefined) return; const i = l.indexOf(t); if (i >= 0) l.splice(i, 1); if (l.length === 0) { edgeMap.delete(k); if (SWEEP) edgeCache.delete(k); } };
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
    // THE BODY MOVED TO _sweepPredicate.ts, VERBATIM — coarse scan, bracket-halving bisection, two-scale class
    // test — so this driver and the sweep worker threads run the SAME arithmetic rather than two copies that
    // must be kept in sync. `PRED` (declared beside `edgeSag` below) carries KINK_SCAN / KINK_HALVINGS /
    // KINK_RATIO / JUMP_RATIO; it is read at CALL time, and the first call happens long after every const in
    // this closure is initialised.
    const locateKink = (th0: number, z0: number, th1: number, z1: number): Kink | null =>
      locateKinkRaw(R, th0, z0, th1, z1, PRED);

    // REFINEMENT RULER PITCH — shared by `edgeSag` (WHICH edge to split) and `consider` (accept / re-queue).
    // Declared here rather than beside `sagAdaptive` because `edgeSag` above needs the same pitch.
    // DEFAULTS CHANGED 2026-07-29 (were 0.15 mm, n∈[6,24]). The refinement ruler scored at a 5× COARSER pitch
    // and a 2.7× lower sample ceiling than the AUD_* ruler that judges the same mesh in the audit below, and an
    // accept is PERMANENT — `consider` is never called again on an accepted triangle. So every triangle the
    // coarse ruler waved through was frozen at a fidelity the audit ruler then re-read as a failure; the driver
    // was grading its own homework with a blunter instrument. These now mirror AUD_HS/AUD_NMIN/AUD_NMAX exactly.
    // THIS CHANGES WHAT EVERY PREVIOUSLY PUBLISHED RUN MEANS: pre-2026-07-29 runs refined at 0.15 mm / n≤24.
    const REF_HS = envF('PF_CB_REF_HS', 0.03); const REF_NMIN = Math.round(envF('PF_CB_REF_NMIN', 12)); const REF_NMAX = Math.round(envF('PF_CB_REF_NMAX', 64));

    // ───────────────────────────── EDGE CHORD SAG (the anisotropy driver) ─────────────────────────────
    // max distance from the true surface curve over the edge's parametric span to the straight 3D edge.
    // ABSOLUTE-PITCH SAMPLING (was a fixed ES_N=8 samples for every edge, of any length). This is the RANKING
    // function that picks which edge gets the split, and 8 samples on a default-grid edge is a ~157 µm pitch —
    // blind to ribs needing sub-20 µm, so an edge crossing a feature routinely ranked BELOW a benign one and the
    // anisotropy lever steered by noise. Same discipline `sagAdaptive` already applies to the triangle ruler:
    // sample count follows edge length / REF_HS, floored at ES_N (the old fixed count) and capped at REF_NMAX.
    const ES_N = Math.round(envF('PF_CB_ESN', 8));
    // EVERY env constant the per-edge predicate reads, in ONE plain-JSON object — because that object is what
    // crosses the thread boundary to a sweep worker. A knob that is honoured here and defaulted there would be
    // a silent two-surfaces bug, so there is exactly one place to add one.
    const PRED: SweepPredConst = {
      esN: ES_N, refHs: REF_HS, refNmax: REF_NMAX,
      kinkScan: KINK_SCAN, kinkHalvings: KINK_HALVINGS, kinkRatio: KINK_RATIO, jumpRatio: JUMP_RATIO,
      snap: SNAP, confMm: CONF_MM,
    };
    // BODY MOVED TO _sweepPredicate.ts, VERBATIM (the two different thetas — rA at canon(th), the Cartesian
    // lift at raw th — are preserved exactly; they are load-bearing at the seam).
    const edgeSag = (a: number, b: number): number =>
      edgeSagRaw(R, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vth[a], dTh(a, b), PRED);

    // ───────────────────────────── TRIANGLE SAG ORACLE ─────────────────────────────
    // THE BODY MOVED TO _sagKernel.ts, VERBATIM — same expressions, same operand order, same forensics, and
    // `canon`/`dTh` still resolve to _sweepPredicate's `canonTheta`/`dThRaw` — so this driver and the audit
    // WORKER THREADS run the SAME ruler rather than two copies that must be kept in sync. `SAGM` holds
    // REFERENCES to the live arrays, which grow in place, so it is built once and never rebuilt.
    const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy };
    // The ten `argWa..argDC` closure variables, moved into ONE record the kernel writes into. Read at exactly
    // one place: the RULER FORENSICS block in the report.
    const ARG = makeSagArgmax();
    const sagOfN = (t: number, n: number): number => sagOfNRaw(R, SAGM, t, n, ARG);
    // RESOLUTION-BOUNDED oracle. MEASURED TRAP: a FIXED barycentric sample count under-reports by up to 11× on a
    // coarse triangle straddling a thin sharp feature (GothicArches rib: 110 µm @ n=8, 790 µm @ n=12, 1257 µm @ n=44
    // — same triangle). That corrupts the priority queue (worst triangles look mild ⇒ never popped) AND the verdict.
    // Sampling must be bounded in ABSOLUTE mm, not in triangle fractions.
    // BODY MOVED TO _sagKernel.ts alongside `sagOfN`, VERBATIM — including the argument ORDER inside
    // Math.max, which is what fixes the winning double on a tie and therefore the lattice level `n`.
    const sagAdaptive = (t: number, hSample: number, nMin: number, nMax: number): number =>
      sagAdaptiveRaw(R, SAGM, t, hSample, nMin, nMax, ARG);
    // (REF_HS / REF_NMIN / REF_NMAX — the pitch this and `edgeSag` both sample at — are declared above.)

    // ───────────────── L4  BOUNDED ACCEPT (PF_CB_BOUNDED=0 to disable, DEFAULT ON) ─────────────────
    // WHY. `sagAdaptive` returns a WITNESSED value on a lattice whose level is clamped at 64, and `consider`
    // accepts a triangle when that witness is under `acceptTol`. A witness is a lower bound with no error
    // control, so "accepted" means only "no sample I happened to take read high" — which is why 16 of the
    // 19 scorecard rows land at exactly ACCEPT, and why the 2026-07-27 re-audit found seven of them over
    // the product bar with the heap DRAINED and most of the budget unspent (see
    // research/lab/2026-07-27-facet-truth-reaudit.md §7).
    //
    // THE RULE. A triangle may be accepted only if its own sampling actually RESOLVED it:
    //        witnessed + coveringRadius  <=  acceptTol
    // Distance-to-a-set is 1-Lipschitz, so a surface point lying between samples cannot be further from the
    // triangle than (nearest sample's distance + the 3-D spacing to that sample). Two deliberate changes
    // from `sagOfN` beyond the extra term:
    //   * distance to the TRIANGLE, not to its infinite plane — the plane is not the thing being printed;
    //   * the covering term is the MEASURED 3-D spacing of adjacent surface samples, not a parameter-space
    //     quantity. On a cliff that spacing stays large however fine the parameter lattice gets, so a
    //     feature-spanning facet can never be accepted — it refines to the floor and stays flagged, which
    //     is the correct answer (it names the loci that need a curtain rather than density).
    //
    // The point-triangle distance below is deliberately NOT shared with the auditor in
    // research/bridge/_facetTruthLib.ts. Duplication is protective here: the whole value of that auditor is
    // that it shares no machinery with the mesher it judges.
    // DEFAULT FLIPPED 2026-07-29 (was PF_CB_BOUNDED=1 opt-in, i.e. OFF). The accept quantity was `sagOfN` /
    // `sagAdaptive`, which is the distance from analytic surface points to the triangle's INFINITE PLANE, while
    // the gate that judges the result measures true point-to-surface / point-to-triangle distance. The plane
    // distance is SMALL for exactly the facet that spans a feature, so the driver cannot see what it is failing
    // to refine. MEASURED: the driver self-reported PASS at 5.856 µm on a mesh the independent auditor read at
    // 362.888 µm — 62×. The honest ruler (`sagBounded`, point-to-TRIANGLE via `ptTri2`, plus the measured
    // covering term) is now the default accept AND rank quantity; PF_CB_BOUNDED=0 restores the plane ruler.
    // THIS CHANGES WHAT EVERY PREVIOUSLY PUBLISHED RUN MEANS — every committed baseline was driven by the plane
    // ruler and is not comparable to a run made with this default. (The 'B' tag suffix keeps their STLs safe.)
    //
    // ───────────── RANK / ACCEPT MODE SELECTOR — PF_CB_RANK (added 2026-07-29, experiment R1b) ─────────────
    // ONE quantity serves three roles in this driver: the heap KEY (which triangle is worst), the ACCEPT test
    // (is this triangle done), and the number the report prints. The 2026-07-29 A/Bs (R1, worklog
    // research/lab/2026-07-29-strata-perf-convergence-worklog.md) separated the first two:
    //   * the honest QUANTITY (point-to-TRIANGLE, `ptTri2`) is right and must stay — the plane ruler's blindness
    //     is STRUCTURAL (a crest above a tent of near-coincident infinite planes reads ~0 at ANY n);
    //   * the honest KEY (wit + gap) is WRONG. `gap ~ L/n` is a function of triangle SIZE, not of fit, so ranking
    //     on it turns worst-first into LARGEST-first — a uniform sweep in disguise. MEASURED signature in the
    //     A2 arm: plane-ruler p50 0.000 µm and 9.6 % of TRIANGLES over tol (its facets sit ON the surface) while
    //     the true-3D auditor read 86.3 % of the SURFACE over tol (it never went where the surface is), plus
    //     574 025 splits refused to weld collisions. It lost the true-3D A/B twice, at equal triangle budget,
    //     once under LEPP and once under DIRECTED+SNAP.
    //
    //   PF_CB_RANK=bounded  (DEFAULT) `sagBounded` — wit + gap, escalating to BND_NMAX. Today's behaviour.
    //   PF_CB_RANK=plane              `sagAdaptive` (or `sagOfN` when PF_CB_ADAPT=0) — distance to the triangle's
    //                                 INFINITE PLANE. Byte-for-byte the legacy PF_CB_BOUNDED=0 path.
    //   PF_CB_RANK=ptperp    (NEW)    the honest QUANTITY at the blind ruler's COST: `sagAdaptive`'s absolute-pitch
    //                                 lattice (REF_HS / REF_NMIN / REF_NMAX, ONE pass, no escalation) with the
    //                                 point-to-TRIANGLE distance substituted for the plane distance, and NO
    //                                 covering term. Size-independent pitch ⇒ the key measures FIT, not SIZE.
    //
    // PF_CB_BOUNDED is kept as a legacy alias and simply chooses the DEFAULT mode. PF_CB_RANK wins when both
    // are given.
    //
    // ─────────── DEFAULT REVERTED TO 'plane' 2026-07-29, ON MEASUREMENT. Read this before changing it. ───────────
    // The 2026-07-29 morning flip made the honest point-to-triangle quantity the default RANK. Three independent
    // A/Bs at EQUAL triangle budget then said that was wrong, the last of them a matched three-way on this exact
    // selector (H2 true-3D, 100 % coverage, one instrument, 40 M queries each):
    //     plane   H2 max 126.0 um   46.6 % of surface over tol   0 weld refusals      0 stranded   456 s
    //     ptperp  H2 max 444.1 um   81.7 %                       696,052              2,002        769 s
    //     bounded H2 max 698.2 um   84.1 %                       574,025                 58       1031 s
    //
    // WHY THE "BLIND" RULER WINS, because it is not luck and it will be re-proposed otherwise:
    //   plane distance measures how NON-FLAT a patch is (curvature x size^2) = HOW MUCH A SPLIT WILL IMPROVE IT.
    //   point-to-triangle measures how FAR the surface currently is = HOW BAD IT IS.
    // Refinement must rank on the first. Ranking on badness creates a WORST-FIRST SINK: an honest quantity reports
    // true-C0 (h^0) facets as permanently worst, a split never improves them, so they stay at the head of the heap
    // forever and absorb the budget. MEASURED: the ptperp arm's own H2 argmax facet still carries edges of
    // 1953/3239/3318 um — essentially the untouched 60x40 INITIAL GRID. It never went there. Its H2 z-histogram is
    // higher than plane's in all 24 bins, so the starvation is global, not one band. And "flatten this patch" is
    // always satisfiable by splitting, which is why the plane arm hits the 0.05 um weld floor exactly ZERO times
    // while both honest arms drive into it and strand facets.
    //
    // THE HONEST QUANTITY IS NOT WRONG — IT IS IN THE WRONG PLACE. Compare each arm's self-report to H2:
    // plane 45.3 vs 126.0 um (under-reports 2.8x, a BAD certificate); ptperp 452.6 vs 444.1 (2 %); bounded
    // 739.2 vs 698.2 (6 %) — both honest modes are EXCELLENT certificates. Cheap biased ranker in the loop,
    // honest quantity as the end-of-run judge. Do not put the certificate back in the inner loop.
    // Evidence: research/lab/2026-07-29-strata-perf-convergence-worklog.md, sections R1 / R1b.
    type RankMode = 'bounded' | 'plane' | 'ptperp';
    const RANK: RankMode = ((): RankMode => {
      const raw = process.env.PF_CB_RANK;
      if (raw === undefined || raw === '') return process.env.PF_CB_BOUNDED === '1' ? 'bounded' : 'plane';
      if (raw === 'bounded' || raw === 'plane' || raw === 'ptperp') return raw;
      // FAIL LOUD. A typo'd mode silently falling back to the default would produce a run tagged as one
      // experiment and driven by another — the exact confound this selector exists to remove.
      throw new Error(`PF_CB_RANK: unknown mode '${raw}' — expected one of bounded | plane | ptperp`);
    })();
    const BND_N = Math.round(envF('PF_CB_BND_N', 12)); // STARTING lattice level for the bounded probe
    // Max level the escalation may reach. DEFAULT RAISED 12 → 192 together with the flip above: 12 == BND_N ==
    // no escalation, and with no escalation the covering term alone (~L/n) refuses every triangle with edges
    // over ~75 µm regardless of how well it fits (measured 93.0 % refused at n=12 vs 47.0 % at n=192, of which
    // 46 points were pure sampling artifact). As an opt-in lever that clamp only reproduced the 2026-07-27 run
    // byte-for-byte; as the DEFAULT accept it would drive every run into the triangle cap before fidelity ever
    // entered. Set PF_CB_BND_NMAX=12 to reproduce the 2026-07-27 bounded run exactly.
    const BND_NMAX = Math.round(envF('PF_CB_BND_NMAX', 192));

    /**
     * Bounded error estimate for one triangle: max over sampled surface points of their distance to the
     * TRIANGLE, plus the measured 3-D spacing of those samples. Never under-states, so a triangle it lets
     * through has genuinely been resolved at this sampling.
     *
     * The exact squared point-to-triangle distance (Ericson closest-point, seven Voronoi-region cases) used
     * to be a separate `ptTri2(px,py,pz,a,b,c)` helper called once per lattice sample. It is INLINED here —
     * with the branch structure, the operand order and the association order of every expression preserved —
     * for one reason: it re-read nine array elements and re-derived ab/ac from them on EVERY sample, and it
     * allocated a fresh `sq` closure (capturing px,py,pz) on EVERY sample, at n=192 that is 18 721 closures
     * per call. Hoisting the per-triangle setup out of the sample loop and expanding `sq` into explicit
     * expressions is arithmetically a no-op. VERIFIED, not assumed: 3 200 (triangle, level) pairs covering
     * every level the escalation can reach (12/24/32/48/64/96/128/192) on 400 GothicArches triangles,
     * `Object.is` on BOTH `wit` and `gap` — 0 mismatches. Measured 1.18x at n=192, 1.10x at n=12.
     * (A first attempt also skipped the closest-point solve when the cheap distance-to-the-infinite-PLANE
     * was already under the running max. That is WRONG and the same check caught it: plane distance is a
     * LOWER bound on distance-to-triangle, so it cannot prove a sample harmless — it silently LOWERED `wit`
     * on 245 of the 3 200 pairs. A running-max guard needs an UPPER bound. Left here so it is not retried.)
     */
    const sagBoundedAtN = (t: number, n: number): { wit: number; gap: number } => {
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const th0 = vth[a]; const dB = dTh(a, b); const dC = dTh(a, c);
      const ax = vx[a]; const ay = vy[a]; const az = vz[a];
      const bx = vx[b]; const by = vy[b]; const bz = vz[b];
      const cx = vx[c]; const cy = vy[c]; const cz = vz[c];
      const abx = bx - ax; const aby = by - ay; const abz = bz - az;
      const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
      // `R` (the counting wrapper) is bypassed in the sample loop and the counter is bumped in bulk: the loop
      // makes exactly (n+1)(n+2)/2 evaluations, so `rEvals` — and therefore the "N M rA evals" the report
      // prints — is unchanged to the last unit, without a closure-variable write per sample.
      rEvals += ((n + 1) * (n + 2)) / 2;
      // The covering term is the largest 3-D gap between lattice-adjacent surface samples: on a smooth patch
      // it shrinks with n, across a cliff it does not, which is exactly the signal we want to keep.
      // Computed INCREMENTALLY against the previous point in the row rather than by storing the lattice —
      // identical set of adjacent pairs, so the value is unchanged, but it removes an O(n^2) allocation that
      // at n=192 was ~450 kB of array churn PER CALL and dominated both the runtime and the heap.
      let worst = 0; let gap = 0;
      for (let i = 0; i <= n; i += 1) {
        const wa = i / n; const zi = wa * az;
        let px = 0; let py = 0; let pz = 0; let have = false;
        for (let j = 0; j <= n - i; j += 1) {
          const wb = j / n; const wc = 1 - wa - wb;
          const theta = th0 + wb * dB + wc * dC;
          const z = zi + wb * bz + wc * cz;
          let thc = theta % TWO_PI; if (thc < 0) thc += TWO_PI; // canon(theta), inlined
          const r = rA(thc, z);
          const qx = r * Math.cos(theta); const qy = r * Math.sin(theta);
          if (have) {
            const g = (px - qx) ** 2 + (py - qy) ** 2 + (pz - z) ** 2;
            if (g > gap) gap = g;
          }
          px = qx; py = qy; pz = z; have = true;
          // ── exact closest point of the TRIANGLE to (qx,qy,z) — Ericson, branch-for-branch as before ──
          const apx = qx - ax; const apy = qy - ay; const apz = z - az;
          const d1 = abx * apx + aby * apy + abz * apz;
          const dd2 = acx * apx + acy * apy + acz * apz;
          let ex: number; let ey: number; let ez: number;
          if (d1 <= 0 && dd2 <= 0) { ex = ax; ey = ay; ez = az; } else {
            const bpx = qx - bx; const bpy = qy - by; const bpz = z - bz;
            const d3 = abx * bpx + aby * bpy + abz * bpz;
            const d4 = acx * bpx + acy * bpy + acz * bpz;
            if (d3 >= 0 && d4 <= d3) { ex = bx; ey = by; ez = bz; } else {
              const vc = d1 * d4 - d3 * dd2;
              if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); ex = ax + abx * v; ey = ay + aby * v; ez = az + abz * v; } else {
                const cpx = qx - cx; const cpy = qy - cy; const cpz = z - cz;
                const d5 = abx * cpx + aby * cpy + abz * cpz;
                const d6 = acx * cpx + acy * cpy + acz * cpz;
                if (d6 >= 0 && d5 <= d6) { ex = cx; ey = cy; ez = cz; } else {
                  const vb = d5 * dd2 - d1 * d6;
                  if (vb <= 0 && dd2 >= 0 && d6 <= 0) { const w = dd2 / (dd2 - d6); ex = ax + acx * w; ey = ay + acy * w; ez = az + acz * w; } else {
                    const va = d3 * d6 - d5 * d4;
                    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
                      const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                      ex = bx + (cx - bx) * w; ey = by + (cy - by) * w; ez = bz + (cz - bz) * w;
                    } else {
                      const den = 1 / (va + vb + vc); const v = vb * den; const w = vc * den;
                      ex = ax + abx * v + acx * w; ey = ay + aby * v + acy * w; ez = az + abz * v + acz * w;
                    }
                  }
                }
              }
            }
          }
          const d2 = (qx - ex) * (qx - ex) + (qy - ey) * (qy - ey) + (z - ez) * (z - ez);
          if (d2 > worst) worst = d2;
        }
      }
      return { wit: Math.sqrt(worst), gap: Math.sqrt(gap) };
    };

    /**
     * ESCALATING bounded estimate. §6 designed this as "n is raised until the bound clears the tolerance"
     * and called the fixed clamp "unnecessary and harmful"; the first implementation nevertheless pinned
     * n = BND_N = 12 and never escalated. MEASURED consequence on the 2026-07-27 GeometricStar run: the
     * covering term alone is ~L/n, so at n=12 EVERY triangle with edges above ~75 µm is refused regardless
     * of how well it fits. On a random sample of 400 baseline triangles that is **93.0 % refused at n=12
     * vs 47.0 % with n escalated to 192**, against only 27.3 % whose WITNESS alone exceeds tol. So 46 points
     * of the refusal rate were pure sampling artifact, the run was forced into a global ~75 µm edge length
     * (~12 M triangles for this pot, above the 9 M cap) and CAPPED before fidelity ever entered.
     *
     * Escalating is not more expensive than the splits it avoids: certifying an L-sized triangle needs
     * n >= L/tol, i.e. ~(L/tol)^2/2 samples, and splitting it into four children each needs (L/2/tol)^2/2 —
     * the same total, but it also doubles the triangle count. Two early exits keep it honest:
     *   - if the WITNESS alone already exceeds acceptTol, no n can rescue the triangle: refuse at once.
     *   - the gap term falls ~1/n, so once gap is already under tol there is nothing left to buy.
     */
    // ───────────── DOOMED-ESCALATION GUARD (PF_CB_BND_DOOM=1, DEFAULT OFF) ─────────────
    // MEASURED WASTE (GothicArches ring, 40x28, 60 k cap): of 71.6 M rA evaluations spent inside the bounded
    // probe, 63.1 M (88 %) belong to the 3 351 triangles whose predictor jumps straight to n = BND_NMAX — and
    // the predictor sends a triangle there precisely when it has already computed that BND_NMAX will NOT be
    // enough. Those 63.1 M evaluations are spent confirming a refusal that was already known.
    //
    // THE BOUND (a proof, not the predictor's ~1/n heuristic). Lattice row i = 0 runs (wa,wb,wc) =
    // (0, j/n, 1-j/n) for j = 0..n; its endpoints are exactly vertices C and B (vertices lie ON the surface,
    // `addV` puts them there), and `gap` maxes over row-adjacent pairs. By the triangle inequality the n
    // sub-chords sum to at least |BC|, so
    //        gap(n)  >=  |BC| / n      for EVERY n.                                             (G1)
    // When BND_N divides BND_NMAX (12 | 192) the level-BND_NMAX lattice CONTAINS the level-BND_N one with
    // bit-identical parameters — (K*i)/(K*n0) and i/n0 are correctly-rounded divisions of exactly
    // representable integers with the same real value, so they are the same double, hence the same theta, z,
    // r and point — which gives two more:
    //        wit(BND_NMAX) >= wit(BND_N)                                                        (G2)
    //        gap(BND_NMAX) >= gap(BND_N) / K,  K = BND_NMAX/BND_N   (each coarse pair is subdivided into K)
    // (G2) is exact (a max over a superset). (G1)/(G3) hold in exact arithmetic; in floating point each chord
    // carries ~1e-16 relative error, so the test below demands the bound beat the tolerance by 1e-9 relative
    // — six orders of slack, and erring only towards escalating anyway.
    //
    // WHAT IT PRESERVES AND WHAT IT DOES NOT. The ACCEPT/REJECT DECISION is provably unchanged: the guard
    // only fires when wit + gap > acceptTol is forced at every level the escalation could reach, i.e. the
    // triangle is refused either way. `bsDoomAcc` counts any triangle that was flagged doomed and then
    // accepted anyway — it MUST stay 0. What DOES change is the heap KEY of those triangles: they carry the
    // level-BND_N bound (still a sound upper bound, just looser — ~K times looser in its covering term)
    // instead of the level-BND_NMAX one.
    //
    // MEASURED, GothicArches ring 40x28 / 60 k cap / TAILK 200 (the P2 reference configuration):
    //   guard OFF   92 s   103 M rA evals   bounded probe 71.6 M   escalated 4 488   accepted 2 021
    //   guard ON    48 s    53 M rA evals   bounded probe 21.8 M   escalated 1 828   accepted 2 021
    //                                                          => 1.92x wall, 3.28x on the probe
    //   2 660 escalations skipped. PF_CB_BND_DOOM_VERIFY=1 replayed the full escalation for every one of
    //   them: accepted-anyway 0. `accepted` is identical (2 021) with and without. The STL came out
    //   BYTE-IDENTICAL (md5 7d93c24c…) to the guard-off run and to the pre-change baseline, and every line
    //   of the report except the wall clock matched.
    //
    // SO WHY IS IT STILL OFF BY DEFAULT. Because that byte-identity is a property of WHERE THIS RUN STOPS,
    // not of the guard. The run caps with worst-left 1 582 µm; the triangles whose key the guard loosens sit
    // near acceptTol (7 µm), i.e. at the very bottom of a 34 516-deep heap, and are never popped either way.
    // Drain the heap further (bigger PF_CB_TRICAP, or PF_CB_MAXSECS on a real budget) and the ~K-times-larger
    // keys WILL reorder against the un-loosened ones, and the mesh will diverge. That divergence is sound —
    // the key stays a valid upper bound and no accept flips — but it is a re-baseline, and every committed
    // STL plus the numbers in research/lab/2026-07-29-strata-perf-convergence-worklog.md predate it.
    // Before flipping the default: run the deep-drain A/B and record where the two meshes first differ.
    const BND_DOOM = envOn('PF_CB_BND_DOOM');
    const BND_DOOM_VERIFY = envOn('PF_CB_BND_DOOM_VERIFY');
    const BND_K = BND_NMAX / BND_N;
    const BND_NESTED = BND_NMAX % BND_N === 0;
    let bsDoom = 0; let bsDoomAcc = 0;
    // INSTRUMENTATION (PF_CB_BNDSTATS=1) — where the escalation evals actually go.
    const BNDSTATS = envOn('PF_CB_BNDSTATS');
    let bsCalls = 0; let bsEsc = 0; let bsEvals = 0; let bsAcc = 0;
    let bsDoomBC = 0; let bsDoomBCevals = 0; let bsDoomBCacc = 0;
    let bsReuse = 0;
    const bsLevelCount = new Map<number, number>(); const bsLevelEvals = new Map<number, number>();
    const lat = (n: number): number => ((n + 1) * (n + 2)) / 2;
    const sagBounded = (t: number): number => {
      let n = BND_N;
      let r = sagBoundedAtN(t, n);
      let evals = lat(n);
      // witness alone over tol => the triangle genuinely does not fit; escalating only costs time.
      // PREDICT the level instead of climbing to it. The gap term is the max spacing of a lattice of level
      // n over a fixed patch, so it falls as ~1/n: to reach a residual of (acceptTol - wit) the level needed
      // is about n * gap / (acceptTol - wit). A doubling ladder pays for every rung below the answer —
      // 12+24+48+96+192 costs 25 115 samples where 192 alone costs 18 721, ~34 % pure overhead — so jump
      // straight to the prediction and keep the ladder only as the fallback when the prediction undershoots.
      // Soundness is unaffected: wit + gap is a valid bound at EVERY level (1-Lipschitz), so stopping at any
      // n is sound and escalating only tightens.
      if (r.wit <= acceptTol && r.wit + r.gap > acceptTol && n < BND_NMAX) {
        const want = (n * r.gap) / Math.max(acceptTol - r.wit, 1e-9);
        const pow2 = 2 ** Math.ceil(Math.log2(Math.max(want, n * 2)));
        const nNext = Math.min(BND_NMAX, Math.max(n * 2, pow2));
        // DOOMED? (G1) holds at every level, so |BC|/BND_NMAX is a floor on the covering term wherever the
        // escalation goes. (G2)/(G3) additionally apply only when the escalation is already saturated at
        // BND_NMAX — then that is the ONLY level it will visit (the while-loop below cannot climb past it),
        // so the level-BND_N witness is a genuine floor for the level it will actually be judged at.
        let doomed = false;
        if (BND_DOOM) {
          let gapLow = eLen(tb[t], tc[t]) / BND_NMAX;
          let witLow = 0;
          if (nNext === BND_NMAX && BND_NESTED) { witLow = r.wit; gapLow = Math.max(gapLow, r.gap / BND_K); }
          doomed = (witLow + gapLow) * (1 - 1e-9) > acceptTol;
        }
        if (doomed) {
          bsDoom += 1;
          // FALSIFICATION MODE (PF_CB_BND_DOOM_VERIFY=1): pay the escalation the guard just skipped and check
          // that its verdict really is REFUSE. Returns the guard's value either way, so a VERIFY run produces
          // the same mesh as the plain DOOM run — it costs the speedup and buys the proof an audit trail.
          if (BND_DOOM_VERIFY) {
            let nv = nNext; let rv = sagBoundedAtN(t, nv);
            while (rv.wit <= acceptTol && rv.wit + rv.gap > acceptTol && nv < BND_NMAX) { nv = Math.min(BND_NMAX, nv * 2); rv = sagBoundedAtN(t, nv); }
            if (rv.wit + rv.gap <= acceptTol) bsDoomAcc += 1; // MUST stay 0 — a hit refutes (G1)/(G2)/(G3)
          }
        } else {
          n = nNext;
          r = sagBoundedAtN(t, n);
          evals += lat(n);
          while (r.wit <= acceptTol && r.wit + r.gap > acceptTol && n < BND_NMAX) {
            n = Math.min(BND_NMAX, n * 2);
            r = sagBoundedAtN(t, n);
            evals += lat(n);
          }
        }
      }
      if (BNDSTATS) {
        bsCalls += 1; bsEvals += evals;
        if (n > BND_N) bsEsc += 1;
        if (r.wit + r.gap <= acceptTol) bsAcc += 1;
        bsLevelCount.set(n, (bsLevelCount.get(n) ?? 0) + 1);
        bsLevelEvals.set(n, (bsLevelEvals.get(n) ?? 0) + evals);
        // the weakest form of the guard — (G1) alone, no nesting needed: gap(N) >= |BC|/N at EVERY level, so
        // |BC|/BND_NMAX > acceptTol already forces a refusal everywhere. Tracked separately to show how much
        // of the waste the edge-length term alone explains (measured: 4.1 % — the wit term is what matters).
        if (eLen(tb[t], tc[t]) / BND_NMAX > acceptTol) {
          bsDoomBC += 1; bsDoomBCevals += evals - lat(BND_N);
          if (r.wit + r.gap <= acceptTol) bsDoomBCacc += 1; // MUST stay 0 or the bound is wrong
        }
      }
      return r.wit + r.gap;
    };

    /**
     * PF_CB_RANK=ptperp — the CHEAP-HONEST key. Structurally `sagAdaptive` (same absolute-pitch sizing: the
     * lattice level follows the LONGEST EDGE divided by REF_HS, floored at REF_NMIN and capped at REF_NMAX,
     * so the sample pitch is ~REF_HS mm on a big triangle and on a small one alike) with the true
     * point-to-TRIANGLE distance substituted for the distance to the triangle's infinite plane.
     *
     * WHAT IT DELIBERATELY DOES NOT DO, and why each omission is the point:
     *   * NO covering/gap term. `gap ~ L/n` is a monotone function of triangle SIZE at fixed pitch, so adding it
     *     makes the key rank by size and the driver sweeps uniformly (measured: R1/A2 above).
     *   * NO escalation. One lattice pass at one pitch. Two triangles are therefore compared at the same
     *     resolution, which is what makes the ordering mean "worse fit" rather than "measured harder".
     * Consequence, stated plainly: this is a WITNESS (a lower bound), not a certificate — exactly the same
     * soundness class as the plane ruler it is priced against, but of the RIGHT quantity. Certification stays
     * where the worklog put it: one batched pass on the final mesh, and the independent auditor.
     *
     * Cost: identical rA-evaluation count to `sagAdaptive` at the same (REF_HS, REF_NMIN, REF_NMAX) — same
     * lattice, same parameters — plus the Ericson closest-point solve per sample, which is pure arithmetic on
     * values already in registers while rA dominates the cycle.
     * Implemented by reusing `sagBoundedAtN` and DISCARDING its `gap`: that function's lattice is bit-identical
     * to `sagOfN`'s (same wa/wb/wc, same theta/z recurrences), so 'ptperp' and 'plane' see the same points and
     * differ in the measured distance ALONE. Duplicating the closest-point solve to save the handful of flops
     * `gap` costs would put a second copy of it in this file, which is how the two arms would drift apart.
     */
    const sagPtPerp = (t: number): number => {
      const le = Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
      const n = Math.max(REF_NMIN, Math.min(REF_NMAX, Math.ceil(le / REF_HS)));
      return sagBoundedAtN(t, n).wit;
    };
    const AUD_HS = envF('PF_CB_AUD_HS', 0.03); const AUD_NMIN = Math.round(envF('PF_CB_AUD_NMIN', 12)); const AUD_NMAX = Math.round(envF('PF_CB_AUD_NMAX', 64));

    // ───────────────── L5  GPU RANK (PF_CB_GPU_RANK=1, default OFF) ─────────────────
    // WHAT IT CHANGES, AND ONLY THIS. The key the heap is ordered by, and the quantity `acceptTol` is tested
    // against. Nothing else — same splitter, same locus machinery, same accept THRESHOLD, same final audit.
    //
    // WHY. The 2026-07-28 diagnosis (research/lab/2026-07-28-strata001-handoff.md §0) closed on this ruler:
    // `sagOfN` reports the distance from an analytic point to the triangle's INFINITE PLANE, and that number
    // is small for exactly the facet that spans a feature. Five independent measurements ruled out the
    // alternatives — the surface is density-closable (no plateau as h→0), the driver had 35-81 % of its
    // budget unspent, 72-96 % of the failures are well-shaped rather than slivers, and 0.0-0.5 % of them lie
    // within 10x of the refinement floor. What is left is that GeometricStar's MEDIAN failing facet is
    // 1.7 mm across sitting 252 µm off the surface while the driver read it as passing. The driver cannot see
    // what it is failing to refine.
    //
    // The replacement is the quantity the product bar is actually written in: max over points OF THE TRIANGLE
    // of the true perpendicular distance TO THE SURFACE. research/gpu/gpuRuler.js computes it (radial foot,
    // one-sided-limit jump closure, Gauss-Newton tightening), cross-validates against the independent CPU
    // auditor to within 2 points, and runs ~42x faster than the CPU ruler it replaces.
    //
    // WITNESSED, NOT CERTIFIED — DELIBERATELY. The screen also returns covRad, and `mx + covRad/n + margin`
    // is a sound upper bound (distance-to-a-set is 1-Lipschitz). Using that as the accept test would ALSO
    // make the driver sound — and would confound the experiment, because at n=12 the covering term alone is
    // ~L/12, so every triangle with edges above ~84 µm would be refused on sampling grounds regardless of how
    // well it fits. That is the measured failure of the L4 escalating-accept lever (§14f: 93 % refused at
    // n=12 vs 47 % at n=192, 46 points of it pure artifact). So the default keeps the SAME witness semantics
    // as `sagAdaptive` and changes only the quantity measured, which is the pre-registered hypothesis.
    // PF_CB_GPU_COVFRAC=1 adds the full covering term back for anyone who wants the sound variant.
    const GPU_RANK = envOn('PF_CB_GPU_RANK');
    const GR_N = Math.round(envF('PF_CB_GPU_N', 12));
    const GR_GN = Math.round(envF('PF_CB_GPU_GN', 2));
    const GR_COVFRAC = envF('PF_CB_GPU_COVFRAC', 0);
    const GR_MARGIN = envF('PF_CB_GPU_MARGIN_UM', 0) / 1000;
    // BATCH SIZE IS AN EXPERIMENTAL CONTROL, NOT A PERFORMANCE KNOB. Every queued candidate is invisible to
    // the heap until its batch flushes, so a large batch quietly converts worst-first into breadth-first —
    // and then a disappointing result could not be attributed to the ranking function, which is the whole
    // point of the run. MEASURED round-trip cost: 113 flushes = 1 s of transport, i.e. ~9 ms each, so at 512
    // (a flush every ~128 splits) a full run pays ~70 s to keep the ordering approximately honest. Cheap.
    const GR_BATCH = Math.round(envF('PF_CB_GPU_BATCH', 512));
    let gpu: GpuRank | null = null;
    let gpuScored = 0;
    let gpuFlushes = 0;
    // Pass the mesher's OWN rA to the bridge: its startup parity guard then compares the two functions that
    // must agree — the surface the driver refines against and the surface the GPU scores against — and
    // refuses to open if they differ. A ranking function steering against a different pot would produce a
    // plausible mesh that is wrong everywhere, silently.
    if (GPU_RANK) gpu = await openGpuRank({ style: STYLE, params: styleParams, cpuRadius: rA, n: GR_N, gnIters: GR_GN });

    // ══════════ S10 — ALIGNED CONSTRAINED SEED (2026-07-30). ALL DEFAULT OFF ══════════
    // PF_CB_ALIGNED_SEED=1 replaces the uniform gu x gv grid with a constrained triangulation whose edges
    // lie ALONG the traced C0/crease loci. See _strataAlignedSeed.ts for the construction and
    // _strataLocusTrace.ts for the tracer; the tracer's negative control is
    // research/bridge/_strataLocusTraceNegControl.test.ts and its bars are pre-registered in the worklog.
    const ALIGNED_SEED = envOn('PF_CB_ALIGNED_SEED') && !SWEEP && !GPU_RANK;
    const AL_NU = Math.round(envF('PF_CB_ALIGNED_NU', 400));      // tracer seeding lattice
    const AL_NV = Math.round(envF('PF_CB_ALIGNED_NV', 280));
    const AL_HREF = envF('PF_CB_ALIGNED_HREF', 0.35);             // element size the junction disks assume
    const AL_ALONG = envF('PF_CB_ALIGNED_ALONG', 1.0);            // along-locus spacing / background cell
    const AL_ACROSS = envF('PF_CB_ALIGNED_ACROSS', 0.35);         // offset-chain distance / background cell
    const AL_FIELD = process.env.PF_CB_ALIGNED_FIELD !== '0';     // modulate spacing by R2's sizing field
    const AL_ROUNDS = Math.round(envF('PF_CB_ALIGNED_ROUNDS', 6));
    const AL_MEASURE = process.env.PF_CB_ALIGNED_MEASURE !== '0';
    // ── S15 / PHASE C STEP 1b — THE ACROSS-SPACING RULE. DEFAULT OFF, like every lever in this campaign.
    // The relative modulator floors the across-locus spacing at acrossBase/fieldRange = 192.6 um while R2's
    // field asks for 44.7 um at the mesh's two worst fidelity sites, whose crease turns over in 106.0 um
    // (worklog, S13 addendum). PF_CB_ALIGNED_ACROSS_ABS=1 keys the across spacing to R2's ABSOLUTE answer
    // where that is sharper, floored at PF_CB_ALIGNED_ACROSS_MIN_UM, with the along spacing bounded at
    // PF_CB_ALIGNED_SEED_AR x across wherever the rule binds so the seed cannot be born over the cap.
    const AL_ACROSS_ABS = envOn('PF_CB_ALIGNED_ACROSS_ABS');
    const AL_ACROSS_MIN = envF('PF_CB_ALIGNED_ACROSS_MIN_UM', 50) / 1000;
    const AL_SEED_AR = envF('PF_CB_ALIGNED_SEED_AR', 24);
    // S16 STEP 1b': where the across rule binds, shorten the along span until the traced locus's own BOW
    // over that span fits inside PF_CB_ALIGNED_BOW_FRAC x across, so an offset-ring chord cannot cut the
    // locus it hugs. Default 0 = OFF. S15 measured the defect this repairs: seed edges crossing a locus
    // 963 -> 3,425 with the ring at 50 um.
    const AL_BOW_FRAC = envF('PF_CB_ALIGNED_BOW_FRAC', 0);
    if (AL_ACROSS_ABS && !ALIGNED_SEED) {
      throw new Error('PF_CB_ALIGNED_ACROSS_ABS=1 is inert without PF_CB_ALIGNED_SEED=1. Unset it, or enable the seed.');
    }
    if (AL_BOW_FRAC !== 0 && !AL_ACROSS_ABS) {
      throw new Error('PF_CB_ALIGNED_BOW_FRAC is inert without PF_CB_ALIGNED_ACROSS_ABS=1. Unset it, or enable the across rule.');
    }
    // ── S18 / P5 STEP 3 — THE X-CROSSING PATCH EMITTER. PF_CB_ALIGNED_PATCH=<regions.json>, DEFAULT UNSET.
    // The routing list is an INPUT, not a computation: measured artifact load can only be read off a
    // FINISHED mesh, so Step 2's `_strataRegionExtract` produces `<tag>.regions.json` and this consumes it.
    // SELECTION IS THE UNION OF TWO CRITERIA, and S17 measured why one is not enough: the top N by class
    // load, PLUS any ids named explicitly. Disk #39 carries the mesh's worst surface error (24.281 um) and
    // is rank 68 of 235 by class load with gated = 0 — the class ranking does not rank the fidelity target.
    // ── S19 — GRADED ACROSS-COMPLETION + THE CREASE-TURNOVER ALONG BOUND. Both DEFAULT OFF.
    // PF_CB_ALIGNED_RINGS=1 is the single ring this file has always placed; >1 fills the measured void
    // between the innermost ring and the background lattice. PF_CB_ALIGNED_TURN_MUL=0 leaves the along
    // spacing to the anisotropy guard alone. Both are inert without the across rule and the driver throws.
    const AL_RINGS = Math.round(envF('PF_CB_ALIGNED_RINGS', 1));
    const AL_RGRADE = envF('PF_CB_ALIGNED_RING_GRADE', 1.6);
    const AL_RMAX = envF('PF_CB_ALIGNED_RING_MAX_UM', 650) / 1000;
    const AL_TURN_MUL = envF('PF_CB_ALIGNED_TURN_MUL', 0);
    if ((AL_RINGS !== 1 || AL_TURN_MUL !== 0) && !AL_ACROSS_ABS) {
      throw new Error('PF_CB_ALIGNED_RINGS / PF_CB_ALIGNED_TURN_MUL are inert without PF_CB_ALIGNED_ACROSS_ABS=1.');
    }
    const AL_PATCH = process.env.PF_CB_ALIGNED_PATCH ?? '';
    const AL_PATCH_TOPN = Math.round(envF('PF_CB_ALIGNED_PATCH_TOPN', 25));
    const AL_PATCH_IDS = (process.env.PF_CB_ALIGNED_PATCH_IDS ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
    const AL_PATCH_MAX = envF('PF_CB_ALIGNED_PATCH_MAX_MM', 1.5);
    // S21 — the grading fix's only knob. 1 REPRODUCES THE S18 EMITTER EXACTLY (no sub-rings, so patch
    // interior sizing is the bare polar grading again) and exists so the fix can be A/B'd against the
    // arithmetic it replaces rather than asserted. Default 16 = the fix active.
    const AL_PATCH_SUBMAX = Math.round(envF('PF_CB_ALIGNED_PATCH_SUBMAX', 16));
    // ══════════ S23 — THE RECONSTRUCTION PASS. PF_CB_RECON=<field.json>, DEFAULT UNSET ══════════
    // UNSET, NOTHING BELOW EXECUTES AND THE DRIVER PATH IS BYTE-IDENTICAL (W1 identity, md5
    // 8a59fb37a9115600b13262254380ccb0, re-taken after this edit). SET, the driver stops being a refiner:
    // the aligned seed is built at FINAL density against the extracted absolute field, every vertex is
    // lifted onto R, every facet goes through the composed acceptance as a CENSUS, and the run HANDS OFF
    // TO NOBODY — no refinement loop, no post-loop pass, no de-shard pass. Registered in full at 95cd8662
    // ("THE BUILD — ONE CONSTRUCTION PASS OVER THE WHOLE WALL"), with the field-preparation decision
    // registered separately on 2026-08-01 before this code ran.
    //
    // THE PREPARATION CONSTANTS ARE LEVERS BECAUSE THEY ARE DECLARED VARIABLES, and a declared variable
    // that cannot be moved from the command line is not reproducible — the arm's own command has to be a
    // complete statement of what it built.
    const RECON = process.env.PF_CB_RECON ?? '';
    const RECON_FLOOR = envF('PF_CB_RECON_FLOOR_UM', 36.4) / 1000;
    const RECON_ALPHA = envF('PF_CB_RECON_ALPHA', 1.0);
    const RECON_BETA = envF('PF_CB_RECON_BETA', 0.83);
    const RECON_CAND = Math.round(envF('PF_CB_RECON_CAND', 3));
    // S23B AMENDMENT, DEFAULT OFF. Let the field bound the chain ALONG spacing too — the one clause that
    // adds constraints, and therefore the one the S7 tripwire is aimed at.
    const RECON_CHAIN = envOn('PF_CB_RECON_CHAIN');
    // THE PROBE KNOB, AND IT IS THE HANDOFF'S OWN RULE MADE EXECUTABLE: "probe the SEED at low density,
    // never the POPULATION". Scaling the field UP by k rebuilds the identical construction at 1/k^2 the
    // point count, so the probe prices cdt2d and the infill on the same code path the production arm uses.
    // 1 = the production arm.
    const RECON_SCALE = envF('PF_CB_RECON_SCALE', 1);
    let reconField: ReconField | null = null;
    if (RECON !== '') {
      if (!ALIGNED_SEED) throw new Error('PF_CB_RECON is inert without PF_CB_ALIGNED_SEED=1. Unset it, or enable the seed.');
      if (SWEEP || GPU_RANK) throw new Error('PF_CB_RECON is not implemented for the sweep or gpu-rank drivers.');
      reconField = loadReconField(RECON, { floorMm: RECON_FLOOR, alpha: RECON_ALPHA });
    }
    let patchRoute: PatchRegion[] = [];
    if (AL_PATCH !== '') {
      if (!ALIGNED_SEED) throw new Error('PF_CB_ALIGNED_PATCH is inert without PF_CB_ALIGNED_SEED=1. Unset it, or enable the seed.');
      const regArt = JSON.parse(readFileSync(AL_PATCH, 'utf8')) as RegionArtifact;
      if (regArt.schema !== REGION_SCHEMA) {
        throw new Error(`PF_CB_ALIGNED_PATCH: expected schema ${REGION_SCHEMA}, got ${String(regArt.schema)}. `
          + 'A region list from a different producer is a mis-registered provenance declaration waiting to happen.');
      }
      // `regions` is written in DESCENDING measured load, so the top-N slice IS the load-weighted set.
      const chosen = new Map<number, { id: number; theta: number; z: number; radiusMm: number }>();
      for (const r of regArt.regions.slice(0, Math.max(0, AL_PATCH_TOPN))) chosen.set(r.id, r);
      for (const idStr of AL_PATCH_IDS) {
        const r = regArt.regions.find((x) => x.id === Number(idStr));
        if (r === undefined) throw new Error(`PF_CB_ALIGNED_PATCH_IDS names disk ${idStr}, which is not in ${AL_PATCH}.`);
        chosen.set(r.id, r);
      }
      patchRoute = [...chosen.values()]
        .sort((a, b) => a.id - b.id)
        .map((r) => ({ id: `D${r.id}`, theta: r.theta, z: r.z, radiusMm: r.radiusMm }));
    }
    // LAYER-2 NEGATIVE CONTROL: push every traced locus this far along its own normal before seeding. A
    // non-zero value builds a DELIBERATELY MISTRACED seed, which must produce a census-visible defect —
    // proving the pipeline would catch a tracer regression instead of shipping a misplaced constraint.
    const AL_MISTRACE = envF('PF_CB_ALIGNED_MISTRACE_UM', 0);
    if (AL_MISTRACE !== 0 && !ALIGNED_SEED) {
      throw new Error('PF_CB_ALIGNED_MISTRACE_UM is inert without PF_CB_ALIGNED_SEED=1. Unset it, or enable the seed.');
    }
    // ══════════ S41 — SEED-TIME CHAIN RE-SOLVE, PORTED INTO V2. PF_CB_ALIGNED_RESOLVE_UM, DEFAULT 0 = OFF ══════════
    // PORTED VERBATIM from the S34 fork (_strataConformBisectS34.test.ts:1137), which is itself the ONLY
    // behavioural difference between that fork and its parent. The IMPLEMENTATION is not copied and does
    // not live here: `resolveSpanMm` / `resolvePred` are optional fields of the SHARED seed builder
    // (_strataAlignedSeed.ts:256,262), committed in 71d76c39. This is three lines of wiring, so the two
    // forks cannot drift in the mechanism — only in whether they forward the flag.
    //
    // WHY: the campaign's two levers that MOVE anything live in two different forks and therefore cannot
    // be composed by configuration. The re-solve (S34 fork) cut `unresolved` 3,980 -> 774 (-80.6%) at 9%
    // fewer triangles and 46% less time, AND LEFT THE MAX AT 47.28. The in-loop constrained-cavity
    // escalation (this fork, PF_CB_CAVITY) cut the HEADLINE MAX 47.297 -> 22.241 (-53%) for +1.7%
    // triangles, AND LEFT `unresolved` at 3,571. Each fixes the half the other does not. NOBODY HAS RUN
    // THEM TOGETHER, because until this line there was no single binary that could.
    //
    // ⚠ 50 IS THE MEASURED SHIPPING VALUE (s34ResolveSeedAB.ts). 100/200 cut the residual further but
    //   BREAK PSLG planarity (13/10 breaks) — a wider transverse probe reaches a NEIGHBOURING locus.
    //
    // AT 0 THE OPTIONS ARE ABSENT FROM THE OBJECT, so the flag-OFF path is the unported V2's arithmetic
    // exactly — which the control arm must demonstrate (byte-identical STL against a pre-port V2 run)
    // before the treatment arm means anything.
    const AL_RESOLVE_MM = envF('PF_CB_ALIGNED_RESOLVE_UM', 0) / 1000;
    if (AL_RESOLVE_MM !== 0 && !ALIGNED_SEED) {
      throw new Error('PF_CB_ALIGNED_RESOLVE_UM is inert without PF_CB_ALIGNED_SEED=1. Unset it, or enable the seed.');
    }
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
    const bounds = [0, ...zSteps, H];
    // ═══════════ S10 — THE ALIGNED CONSTRAINED SEED (PF_CB_ALIGNED_SEED=1, DEFAULT OFF) ═══════════
    // Replaces the uniform grid with a constrained triangulation whose edges LIE ALONG the traced feature
    // loci, so no seed edge crosses a locus BY CONSTRUCTION. The uniform-grid block below is untouched and
    // runs verbatim when the lever is off, so the flag-OFF path is byte-identical by construction as well
    // as by the measured md5.
    //
    // WHY IT IS SEPARATE FROM S9a AND NOT STACKED WITH IT: S9a (PF_CB_CONFORM_FIRST) SPLITS grid edges at
    // their crossings; this DELETES the crossings. Running both makes the arm untestable as "aligned
    // alone" — the counter that would report the effect would also be the lever that changes it. So the
    // aligned arm measures the same quantity WITHOUT mutating: `alignedSeedCrossings` runs the S9a
    // enumeration (locateKink, interior, non-jump, outside the SNAP_ALPHA band) over every seed edge and
    // only counts. The two levers remain composable; this arm just does not compose them.
    let alignedLoci: LocusArtifact | null = null;
    let alignedStats: AlignedSeed['stats'] | null = null;
    let alignedPatches: PatchRegion[] = [];
    let alignedRounds = 0; let alignedBanned = 0;
    let alignedSeedCrossings = -1; let alignedSeedEdges = 0; let alignedTraceMs = 0;
    if (ALIGNED_SEED) {
      if (zSteps.length > 0) {
        // The seed triangulates ONE (theta,z) rectangle. A style with a detected C0 z-step needs one chart
        // per band plus tread annuli between them, which is not built. Refuse rather than silently seed a
        // single chart across a cliff — the PF_CB_RANK / PF_CB_SWEEP_WORKERS precedent for an inert lever.
        throw new Error(
          `PF_CB_ALIGNED_SEED=1 is not implemented for a style with detected C0 z-steps (${zSteps.length} found at `
          + `z=${zSteps.map((z) => z.toFixed(3)).join(',')}). The aligned seed triangulates one (theta,z) chart; `
          + `banded seeding + tread annuli are unbuilt. Run without the lever, or extend the seed per band.`,
        );
      }
      const tTrace = Date.now();
      alignedLoci = traceLoci(rA, {
        ...DEFAULT_TRACE_OPTS, H, pred: PRED,
        nu: AL_NU, nv: AL_NV, hRefMm: AL_HREF,
      });
      alignedTraceMs = Date.now() - tTrace;
      const rep = buildAlignedSeedRepaired(rA, alignedLoci, {
        ...DEFAULT_SEED_OPTS, H, gu, gv,
        alongMul: AL_ALONG, acrossFrac: AL_ACROSS, useField: AL_FIELD,
        acrossAbs: AL_ACROSS_ABS, acrossMinMm: AL_ACROSS_MIN, seedARmax: AL_SEED_AR, bowFrac: AL_BOW_FRAC,
        patchRoute, patchMaxMm: AL_PATCH_MAX, patchSubMax: AL_PATCH_SUBMAX,
        acrossRings: AL_RINGS, acrossGrade: AL_RGRADE, acrossMaxMm: AL_RMAX, turnMul: AL_TURN_MUL,
        mistraceUm: AL_MISTRACE, shapeAR: SHAPE_AR, tolMm: TOL,
        // S41: absent at 0, so the control arm's options object is byte-identical to the pre-port V2's.
        // `resolvePred` is PRED — the driver's OWN kink constants — because a seed conformed with
        // different constants than the driver measures with is a silent two-surfaces bug.
        ...(AL_RESOLVE_MM === 0 ? {} : { resolveSpanMm: AL_RESOLVE_MM, resolvePred: PRED }),
        // S23 — the extracted absolute field, as free Steiner infill. `undefined` when the lever is unset,
        // and then the seed builder's S23 clauses are arithmetically absent.
        ...(reconField === null ? {} : {
          reconField: {
            floorMm: RECON_SCALE * reconField.floorMm, dxMm: reconField.dxMm,
            // RECON_SCALE = 1 is the identity and multiplies nothing away: the closure is only installed
            // when the lever is set at all, and the probe's own scale is printed in the report.
            hAt: (th: number, z: number): number => RECON_SCALE * (reconField as ReconField).hAt(th, z),
          },
          reconBeta: RECON_BETA, reconCand: RECON_CAND, reconChain: RECON_CHAIN,
        }),
      }, AL_ROUNDS);
      alignedStats = rep.seed.stats; alignedRounds = rep.roundsUsed; alignedBanned = rep.banned;
      alignedPatches = rep.seed.patches;
      // Constraint vertices are marked `feat` — they ARE on a detected locus, which is exactly what SNAP
      // marks when it lands a vertex on one. The seam closes through `addV`'s own 3-D weld: canonTheta(2pi)
      // is 0, so a vertex emitted at (2pi, z) IS the vertex at (0, z), exactly and not to a tolerance.
      const onCon = new Set<number>();
      for (const [a, b] of rep.seed.constraints) { onCon.add(a); onCon.add(b); }
      const idx = rep.seed.pts.map(([th, z], i) => addV(th, z, onCon.has(i)));
      for (const [a, b, c] of rep.seed.tris) addT(idx[a], idx[b], idx[c]);
      // THE LEVER'S HEADLINE, measured by the DRIVER'S OWN detector rather than by the seed builder's
      // internal geometry — the seed builder's crossing count is self-referential (it tests against the
      // very chains it placed) and would read LOW on a deliberately mistraced seed, which is precisely the
      // case the layer-2 negative control exists to catch.
      if (AL_MEASURE) {
        const seenAl = new Set<number>();
        let cross = 0; let tested = 0;
        for (let t = 0; t < ta.length; t += 1) {
          if (!alive[t]) continue;
          for (const [pv, qv] of [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]] as Array<[number, number]>) {
            const k0 = eKey(pv, qv);
            if (seenAl.has(k0)) continue;
            seenAl.add(k0); tested += 1;
            const kk = locateKink(vth[pv], vz[pv], vth[pv] + dTh(pv, qv), vz[qv]);
            if (kk === null || kk.jump) continue;
            if (kk.t <= SNAP_ALPHA || kk.t >= 1 - SNAP_ALPHA) continue;
            cross += 1;
          }
        }
        alignedSeedCrossings = cross; alignedSeedEdges = tested;
      }
    } else {
    for (let b = 0; b + 1 < bounds.length; b += 1) {
      const za = b === 0 ? 0 : bounds[b] + stepEps;
      const zb = b + 2 === bounds.length ? H : bounds[b + 1] - stepEps;
      const bandH = zb - za;
      if (bandH <= 0) continue;
      const rows = Math.max(1, Math.round((gv * bandH) / H));
      const grid: number[][] = [];
      for (let j = 0; j <= rows; j += 1) {
        const z = za + (bandH * j) / rows;
        const row: number[] = [];
        for (let i = 0; i < gu; i += 1) row.push(addV((TWO_PI * i) / gu, z));
        grid.push(row);
      }
      for (let j = 0; j < rows; j += 1) for (let i = 0; i < gu; i += 1) {
        const i1 = (i + 1) % gu;
        addT(grid[j][i], grid[j][i1], grid[j + 1][i1]);
        addT(grid[j][i], grid[j + 1][i1], grid[j + 1][i]);
      }
    }
    }

    // ───────── S6  INITIAL-GRID SHAPE CENSUS. MEASUREMENT ONLY — nothing is refused here. ─────────
    // The grid is emitted BEFORE any guard exists and it cannot be refused: it IS the mesh. So it is COUNTED,
    // in the census's own metric, and printed — because a facet BORN over the cap is a blade-gate failure the
    // split guard can never have caused and can never fix, and it must not be attributed to the guard.
    //
    // AND IT IS WORSE THAN "cannot fix": an over-cap grid facet is FROZEN. S1 refuses any split whose children
    // exceed the cap, and a blade's children are blades, so the facet is never subdivided and survives into
    // the STL. (The one-line change that would let it out — admit a split that strictly IMPROVES the worst
    // child AR even while still over the cap — is deliberately NOT made here. It changes the SPLIT guard, it
    // needs its own A/B, and this pass is about the post-loop gap.)
    //
    // COMPUTED, NOT GUESSED, for the two standard configurations at H=120 Rb=40 Rt=50 on a style with NO
    // detected z-step (GothicArches): one band, rows = gv, and each cell is a right triangle whose legs are
    // the horizontal chord and the vertical chord. aspect3 of a right triangle with legs a,b and hypotenuse c
    // is c(a+b+c)/(2ab):
    //   200x140:  a 1.5708  b 0.8601 mm at r=50  =>  2.798        (a 1.2566  b 0.8601 at r=40  =>  2.564)
    //   60x40:    a 5.2336  b 3.0104 mm at r=50  =>  2.737        (a 4.1869  b 3.0104 at r=40  =>  2.527)
    // i.e. ~18x BELOW the cap of 50 — and that is the smooth profile, before any relief. With a radial
    // excursion D between ADJACENT grid vertices there is a rigorous bound: the horizontal edge has NO
    // z-component, so the perpendicular component of the vertical edge is at least dz and the area is at least
    // e1*dz/2; and the longest edge is at most e1+e2, the perimeter at most 2(e1+e2). Hence
    //        aspect3  <=  (e1 + e2)^2 / (e1 * dz),   e1 = hypot(chord, D),  e2 = hypot(D, dz).
    // That bound stays under 50 up to D ~ 10 mm at 200x140 and D ~ 40 mm at 60x40 — both far outside anything
    // reachable at these dims, where the pot radius itself is only 40-50 mm.
    // ⇒ FOR BOTH STANDARD CONFIGURATIONS THE INITIAL GRID CANNOT EXCEED THE CAP.
    //
    // IT CAN IN GENERAL, AND HERE IS EXACTLY WHEN. A THIN C0 BAND gets rows = max(1, round(gv*bandH/H)) = 1,
    // so its vertical pitch is the whole band while the horizontal chord is unchanged, and aspect3 -> chord/dz.
    // Over the cap once dz < chord/50, i.e. once bandH < chord/50 + 2*PF_CB_STEP_EPS_UM: about 39 um at
    // gu=200, about 113 um at gu=60. GothicArches has NO detected z-step, so this cannot fire on the
    // pre-registered runs — but a LAYERED style with two detected steps within ~40 um WILL be born over the
    // cap, and this census is how that becomes visible instead of being blamed on the guard.
    let gridOverCap = 0; let gridWorstAR = 0;
    for (let t = 0; t < ta.length; t += 1) {
      const ar = aspect3(
        vx[ta[t]], vy[ta[t]], vz[ta[t]], vx[tb[t]], vy[tb[t]], vz[tb[t]], vx[tc[t]], vy[tc[t]], vz[tc[t]],
      );
      if (ar > SHAPE_AR) gridOverCap += 1;
      if (ar > gridWorstAR) gridWorstAR = ar;
    }

    // ───────────────────────────── BISECTION ─────────────────────────────
    const created: number[] = [];
    let nSnap = 0; let nReproj = 0; let nJump = 0; let weldedSplits = 0;

    // ══════════════════════ L5 SHAPE TERM — the guard, the solver, and their counters ══════════════════════
    let nShapeChecks = 0; let nShapeChildren = 0;
    let nShapeRefusedAR = 0; let nShapeRefusedFold = 0;
    let shapeWorstAdmitted = 0;      // the largest child AR this run ever COMMITTED to (bounded by SHAPE_AR)
    let nMid3dSolves = 0; let nMid3dClamped = 0; let mid3dShiftSum = 0; let mid3dShiftMax = 0;
    let nLongFallTested = 0; let nLongFallFired = 0;
    /** Why the LAST bisectAt refused. Read (never written) by tryBisect, exactly as `addVNew` is. */
    // ('admit' has been ASSIGNED by the S20 split-side gate since that gate landed; the annotation simply
    //  did not list it, and nothing read the value narrowly enough to notice. S22's pass classifies its own
    //  refusals by this field, so the union is widened to what the code already writes. Type-only: no
    //  runtime byte moves, so every flag-OFF path stays byte-identical by construction.)
    let lastBisectShape: 'none' | 'ar' | 'fold' | 'admit' = 'none';
    /**
     * Read `lastBisectShape` at its DECLARED type. The checker's flow analysis narrows the variable to its
     * initializer `'none'` at every read in this scope, because the only writer is `bisectAt` — a closure
     * the checker cannot see mutate it (the same limitation the S8 cascade documents at its retreat step,
     * where it works around it by not repeating the test). Reading through a function boundary drops the
     * narrowing, so S22 can classify a refusal by the gate that caused it instead of guessing.
     */
    const bisectRefusal = (): 'none' | 'ar' | 'fold' | 'admit' => lastBisectShape;
    // ═══ S26 — THE PLACEMENT half of the refusal channel. `lastBisectShape` names the SHAPE gate that
    // refused; it stays 'none' when the refusal was a PLACEMENT one, and until S26 that 'none' bucket was
    // the whole reason `unresolvedWhy` read `unknown` on every production arm. S25.2 measured what that
    // cost: the H2 argmax carrier (tri 135048, ar3 19.877) has ZERO AR-refused children — it is NOT
    // cap-owned — so the one facet the certificate cares about was stranded by a mechanism nothing
    // recorded. These four are `bisectAt`'s own non-shape false-returns, named at the point each is taken.
    // Assignment only, on paths that already returned false, so no flag-OFF byte can move by construction —
    // the same argument `lastShapeOffenderT` makes directly below.
    type PlaceRefusal = 'none' | 'weld-collapse' | 'weld' | 'apex' | 'no-incident';
    let lastBisectPlace: PlaceRefusal = 'none';
    /** Read `lastBisectPlace` at its DECLARED type — same flow-analysis dodge as `bisectRefusal`. */
    const bisectPlacement = (): PlaceRefusal => lastBisectPlace;
    /** WHICH incident triangle `shapeAdmits` was protecting when it refused. Read only by the S8 cascade
     *  pass (it follows the protector); written on every shape refusal. Assigning a closure number moves
     *  no byte of any mesh, so every flag-OFF path stays byte-identical by construction. */
    let lastShapeOffenderT = -1;

    /**
     * The point `addV` WOULD create at parametric s on edge (a,b), computed WITHOUT inserting it.
     * Arithmetic copied from `addV` operand-for-operand — canon first, rA at the canonical theta, cos/sin of
     * that same canonical theta — so the guard scores the exact vertex the split will produce, not a
     * near-copy of it. (The one case where they differ is a WELD: `addV` may return an existing vertex
     * within WELD_MM instead. PF_CB_NOWELD, on by default, refuses that split anyway, and with NOWELD off
     * the two points are within 50 nm, four orders below the shortest edge the driver keeps.)
     */
    const liftAt = (a: number, b: number, s: number): LiftedPoint => {
      const [th, z] = edgeParam(a, b, s);
      const theta = canon(th);
      const r = R(theta, z);
      return { x: r * Math.cos(theta), y: r * Math.sin(theta), z, th: theta };
    };
    /**
     * S3. The parameter whose LIFTED point sits at 3-D chord fraction `frac` along the edge. Returns `frac`
     * itself when MID3D is off, so the legacy path takes zero extra rA evaluations and stays byte-identical.
     */
    const placeAt = (a: number, b: number, frac: number): number => {
      if (!MID3D) return frac;
      nMid3dSolves += 1;
      const s = chordParam((u) => liftAt(a, b, u), vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], frac, MID3D_ITERS);
      const shift = Math.abs(s - frac);
      mid3dShiftSum += shift; if (shift > mid3dShiftMax) mid3dShiftMax = shift;
      if (shift <= MID3D_MAXSHIFT) return s;
      nMid3dClamped += 1;
      return s > frac ? frac + MID3D_MAXSHIFT : frac - MID3D_MAXSHIFT;
    };
    /** the two endpoints of edge (a,b) IN triangle t's traversal order — bisectAt's own `oa/ob` rule. */
    const orientedEnds = (t: number, a: number, b: number): [number, number] => {
      const seq = [ta[t], tb[t], tc[t]];
      for (let i = 0; i < 3; i += 1) {
        if (seq[i] === a && seq[(i + 1) % 3] === b) return [a, b];
        if (seq[i] === b && seq[(i + 1) % 3] === a) return [b, a];
      }
      return [a, b];
    };
    /**
     * S1 + S2. Would splitting edge (a,b) at the (already lifted) point `p` produce a child worse than
     * SHAPE_AR, or one whose (theta,z) orientation is flipped relative to its parent?
     *
     * CHECKED FOR EVERY LIVE INCIDENT TRIANGLE AND BOTH OF ITS CHILDREN. That is the entire correction to
     * PF_CB_AR, which gated only the POPPED triangle's edge SELECTION and never an emitted facet, on either
     * side. No mesh state is touched, so a refusal costs nothing to undo.
     */
    // ═══════════ S20 — EMIT-TIME FOOTPRINT-NORMAL ADMISSION (PF_CB_ADMIT_NORMAL*, DEFAULT OFF) ═══════════
    // The auditor's A2 instrument — the only one in this repo that has ever agreed with the operator's eye —
    // as an ADMISSION condition instead of a post-hoc census. TRANSCRIBED from `_judgeNormal`, deliberately
    // NOT imported: a guard and an auditor sharing an implementation cannot disagree, and X1 needs them to
    // be able to. Constants named in-line so the two can be diffed by eye.
    const ADMIT_NORMAL = envOn('PF_CB_ADMIT_NORMAL');
    const ADMIT_NORMAL_SPLIT = envOn('PF_CB_ADMIT_NORMAL_SPLIT');
    // ═══════════ S20.1 — ASSERT ADMISSION ON THE VALUES THAT SHIP (PF_CB_ADMIT_SHIPPED, DEFAULT OFF) ═══════════
    // MEASURED, not assumed (S20.1 diagnostic, on a mesh byte-identical to `_S20A`): the same sweep over the
    // same 1,218,088 facets answers 0 on the driver's f64 vertices and 108 on the f32 vertices it WRITES —
    // and 108 is exactly the judge's gated count, facet for facet. The channel is the whole of it.
    // WHY IT IS AN O(1) FLIP AND NOT A BOUNDARY WOBBLE, which is where S20.1's registered prediction was
    // WRONG: the flipped facets are not marginal (deviation p50 113.9 deg, max 161.8 deg, and no f32-ulp
    // perturbation moves any of them). The sensitivity is not in the FACET normal, it is in the ANALYTIC one.
    // `admBestDot` builds its five candidates from difference quotients at ADM_H = 1e-6 mm, while one f32 ulp
    // on z ~ 80 mm is ~7.6e-6 mm — SEVEN TIMES THE STENCIL. Rounding a vertex therefore does not nudge the
    // reference normal, it can carry the entire 1 nm stencil across a crease onto the other flank, where all
    // five candidates agree on the wrong side. A finer step would not fix it: the artifact simply cannot
    // resolve where the sample point is to better than an f32 ulp.
    // SO THE HONEST TEST IS THE SHIPPED ONE. The product is the STL. Asserting an invariant on an f64 mesh
    // that never leaves the process is asserting it about nothing, and X1 is judged on the file.
    // THETA COMES FROM THE ROUNDED COORDINATES TOO, and that clause is load-bearing: rounding coordinates
    // alone catches 105 of the 108 (measured), because a consumer of the STL recovers theta by atan2 from the
    // very coordinates that were rounded. Keeping the f64 `vth` beside f32 x,y is a mismatched pair that
    // exists nowhere downstream. This is still the DRIVER'S OWN transcription — `_judgeNormal` is not
    // imported and S-e stands; it is fed the inputs any reader of the file would have.
    const ADMIT_SHIPPED = envOn('PF_CB_ADMIT_SHIPPED');
    const f32 = Math.fround;
    const ADM_H = 1e-6;                       // _judgeNormal's step, theta (rad) and z (mm)
    let admitChecks = 0; let admitRefusedSplit = 0; let admitForcedPush = 0;
    /** max dot of the facet normal with the FIVE candidate analytic normals at (th,z) — _judgeNormal's rule. */
    const admBestDot = (th: number, z: number, fx: number, fy: number, fz: number): number => {
      const r0 = rA(th, z);
      const rTp = rA(th + ADM_H, z); const rTm = rA(th - ADM_H, z);
      const rZp = rA(th, z + ADM_H); const rZm = rA(th, z - ADM_H);
      const ct = Math.cos(th); const st = Math.sin(th);
      const cands: Array<[number, number]> = [
        [(rTp - rTm) / (2 * ADM_H), (rZp - rZm) / (2 * ADM_H)],
        [(rTp - r0) / ADM_H, (rZp - r0) / ADM_H], [(rTp - r0) / ADM_H, (r0 - rZm) / ADM_H],
        [(r0 - rTm) / ADM_H, (rZp - r0) / ADM_H], [(r0 - rTm) / ADM_H, (r0 - rZm) / ADM_H],
      ];
      let best = -Infinity;
      for (const [rt, rz] of cands) {
        const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
        const n = Math.hypot(nx, ny, nz) || 1;
        const d = (fx * nx + fy * ny + fz * nz) / n;
        if (d > best) best = d;
      }
      return best;
    };
    /**
     * FOOTPRINT-BACK-FACING, A2 semantics EXACTLY: back-facing at the CENTROID **and** at all three vertex
     * parameter points. A facet that is centroid-back but FRONT-facing at one of its own vertices is
     * FEATURE-SPANNING and stays admissible — the bar is the gate's bar and not one micron tighter.
     */
    const footBack = (
      px0: number, py0: number, pz0: number, qx0: number, qy0: number, qz0: number, sx0: number, sy0: number, sz0: number,
      pth0: number, qth0: number, sth0: number,
    ): boolean => {
      admitChecks += 1;
      // S20.1 — THE ONE PLACE THE QUANTISATION HAPPENS. `footBack` is the single choke point every admission
      // call goes through (accept-side `footBackT`, both split-side children), so quantising here fixes all
      // three at once and leaves exactly one branch to reason about. Flag OFF => the eleven names below are
      // the arguments themselves and the arithmetic is the byte-identical S20 path.
      const px = ADMIT_SHIPPED ? f32(px0) : px0; const py = ADMIT_SHIPPED ? f32(py0) : py0;
      const pz = ADMIT_SHIPPED ? f32(pz0) : pz0;
      const qx = ADMIT_SHIPPED ? f32(qx0) : qx0; const qy = ADMIT_SHIPPED ? f32(qy0) : qy0;
      const qz = ADMIT_SHIPPED ? f32(qz0) : qz0;
      const sx = ADMIT_SHIPPED ? f32(sx0) : sx0; const sy = ADMIT_SHIPPED ? f32(sy0) : sy0;
      const sz = ADMIT_SHIPPED ? f32(sz0) : sz0;
      const pth = ADMIT_SHIPPED ? Math.atan2(py, px) : pth0;
      const qth = ADMIT_SHIPPED ? Math.atan2(qy, qx) : qth0;
      const sth = ADMIT_SHIPPED ? Math.atan2(sy, sx) : sth0;
      let fx = (qy - py) * (sz - pz) - (qz - pz) * (sy - py);
      let fy = (qz - pz) * (sx - px) - (qx - px) * (sz - pz);
      let fz = (qx - px) * (sy - py) - (qy - py) * (sx - px);
      const fl = Math.hypot(fx, fy, fz);
      if (!(fl > 0)) return false;                       // zero-area: S1/S2's business, not this gate's
      fx /= fl; fy /= fl; fz /= fl;
      const cth = canonTheta(Math.atan2((py + qy + sy) / 3, (px + qx + sx) / 3));
      if (admBestDot(cth, (pz + qz + sz) / 3, fx, fy, fz) >= 0) return false;   // front at the centroid
      if (admBestDot(canonTheta(pth), pz, fx, fy, fz) >= 0) return false;       // FEATURE-SPANNING exemption
      if (admBestDot(canonTheta(qth), qz, fx, fy, fz) >= 0) return false;
      if (admBestDot(canonTheta(sth), sz, fx, fy, fz) >= 0) return false;
      return true;
    };
    /** the same test on a LIVE triangle index. */
    const footBackT = (t: number): boolean => footBack(
      vx[ta[t]], vy[ta[t]], vz[ta[t]], vx[tb[t]], vy[tb[t]], vz[tb[t]], vx[tc[t]], vy[tc[t]], vz[tc[t]],
      vth[ta[t]], vth[tb[t]], vth[tc[t]],
    );

    const shapeAdmits = (a: number, b: number, p: LiftedPoint): boolean => {
      if (!SHAPE) return true;
      const list = edgeMap.get(eKey(a, b));
      if (list === undefined) return true;
      nShapeChecks += 1;
      let worst = 0;
      for (const t of list) {
        if (!alive[t]) continue;
        const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
        const [oa, ob] = orientedEnds(t, a, b);
        nShapeChildren += 2;
        const ar1 = aspect3(vx[oa], vy[oa], vz[oa], p.x, p.y, p.z, vx[apex], vy[apex], vz[apex]);
        const ar2 = aspect3(p.x, p.y, p.z, vx[ob], vy[ob], vz[ob], vx[apex], vy[apex], vz[apex]);
        if (ar1 > SHAPE_AR || ar2 > SHAPE_AR) { nShapeRefusedAR += 1; lastBisectShape = 'ar'; lastShapeOffenderT = t; return false; }
        if (ar1 > worst) worst = ar1;
        if (ar2 > worst) worst = ar2;
        if (!SHAPE_FOLD) continue;
        // Anchored at the APEX for parent and both children alike, so the three signs are the same object
        // measured three times rather than three differently-anchored objects compared.
        const sPar = signedAreaParam(vth[apex], vz[apex], vth[oa], vz[oa], vth[ob], vz[ob]);
        const s1 = signedAreaParam(vth[apex], vz[apex], vth[oa], vz[oa], p.th, p.z);
        const s2 = signedAreaParam(vth[apex], vz[apex], p.th, p.z, vth[ob], vz[ob]);
        if (Math.sign(s1) !== Math.sign(sPar) || Math.sign(s2) !== Math.sign(sPar)) {
          nShapeRefusedFold += 1; lastBisectShape = 'fold'; lastShapeOffenderT = t; return false;
        }
      }
      // S20 (b) SPLIT-SIDE — children scored alongside S1/S2, for BOTH triangles incident to the edge (the
      // 2026-07-29 lesson: 68% of blade births damage a NEIGHBOUR). Refusal is S1's refusal.
      if (ADMIT_NORMAL_SPLIT) {
        for (const t of list) {
          if (!alive[t]) continue;
          const apex = ta[t] !== a && ta[t] !== b ? ta[t] : tb[t] !== a && tb[t] !== b ? tb[t] : tc[t];
          const [oa, ob] = orientedEnds(t, a, b);
          if (footBack(vx[oa], vy[oa], vz[oa], p.x, p.y, p.z, vx[apex], vy[apex], vz[apex], vth[oa], p.th, vth[apex])
            || footBack(p.x, p.y, p.z, vx[ob], vy[ob], vz[ob], vx[apex], vy[apex], vz[apex], p.th, vth[ob], vth[apex])) {
            admitRefusedSplit += 1; lastBisectShape = 'admit'; lastShapeOffenderT = t; return false;
          }
        }
      }
      if (worst > shapeWorstAdmitted) shapeWorstAdmitted = worst;
      return true;
    };
    /** S4's question: could edge (a,b) be split SAFELY AT ALL — i.e. at its best (mid-chord) placement? */
    const shapeAdmitsBest = (a: number, b: number): boolean => {
      if (!SHAPE) return true;
      return shapeAdmits(a, b, liftAt(a, b, placeAt(a, b, 0.5)));
    };

    /** split edge (a,b) at parameter t (0..1) — splits EVERY incident triangle ⇒ watertight, no T-junctions. */
    const bisectAt = (a: number, b: number, tPar: number, feat: boolean): boolean => {
      lastBisectShape = 'none';
      lastBisectPlace = 'none';
      lastShapeOffenderT = -1;
      // S1/S2 GATE — BEFORE addV, so a refusal leaves no orphan vertex in the weld grid and cannot perturb
      // any later weld. This is the whole fix: `bisectAt` is the ONE choke point every split goes through.
      if (SHAPE && !shapeAdmits(a, b, liftAt(a, b, tPar))) return false;
      const [mth, mz] = edgeParam(a, b, tPar);
      const m = addV(mth, mz, feat);
      if (m === a || m === b) { lastBisectPlace = 'weld-collapse'; return false; } // weld collapsed the split — nothing to do
      // A split point that WELDS onto a pre-existing vertex does not subdivide the edge: it stitches the edge to a
      // vertex from an unrelated part of the local mesh, which is exactly how an edge ends up with >2 incident
      // triangles (a topological pinch). Counting these is the audit; refusing them is the fix at source.
      if (!addVNew) { weldedSplits += 1; if (NOWELD) { lastBisectPlace = 'weld'; return false; } }
      const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
      // DEGENERACY GUARD (measured need): if the new vertex welds onto an incident triangle's APEX, both replacement
      // triangles are degenerate — the split then DELETES geometry and the refinement churns forever without growing
      // (SNAP+LEPP ablation: 6 M allocations, 68 k alive). Refuse the split so the caller falls back.
      for (const t of list) {
        if (!alive[t]) continue;
        if (ta[t] === m || tb[t] === m || tc[t] === m) { lastBisectPlace = 'apex'; return false; }
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
      if (!made) lastBisectPlace = 'no-incident';   // S26: the edge had no LIVE incident triangle left
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
          // ── S9b: discharge the conformity refusal AT FIRST ENCOUNTER (PF_CB_SNAP_CASCADE, default OFF).
          // A shape-refused SNAP split is the fossil's birth certificate: stranded here, the crossing edge
          // survives while the corridor refines around it, and by the time anything retries, the pair is
          // censored at the cap (S8's measured self-block). Trains are still SHALLOW at first encounter
          // (the S8 pilot conformed 94.8% in exactly this regime), so cascade NOW. Jump-class is curtain
          // material and is never cascaded. On 'deadlock'/'refused' the ladder below proceeds unchanged —
          // any protector splits the cascade DID make stay in `created`, so the pop loop sees progress and
          // re-queues the survivor instead of stranding it.
          if (SNAP_CASCADE && !k.jump && lastBisectShape !== 'none') {
            scFired += 1;
            const oc = cascadeConform(a, b, k.t);
            scSplits += cascadeStat.splits;
            if (oc === 'budget') { scBudget += 1; scBudgetStopped = true; }
            else if (oc === 'conformed') scConformed += 1;
            else if (oc === 'proximity') scProximity += 1;
            else if (oc === 'deadlock') scDeadlocked += 1;
            else scRefusedOther += 1;
            if (oc === 'conformed' || oc === 'proximity') return true;
          }
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
            // S1/S2 SHAPE GATE — MIRRORED FROM `bisectAt` (2026-07-30). The weld and apex guards below were
            // mirrored into this hand-copy when they were found missing; the SHAPE gate was NOT, which left
            // this the one facet-creation site that bypassed shapeAdmits entirely (FOLD-ANOMALY §3(c): inert
            // at defaults, a live hole the moment PF_CB_REPROJECT=1). Scored BEFORE addV — on the exact
            // vertex addV would produce: canon first, R at the canonical theta, cos/sin of that same theta,
            // liftAt's own arithmetic — so a refusal leaves no orphan vertex in the weld grid. With SHAPE
            // off the block is skipped whole: zero extra rA evaluations on the legacy path.
            let reprojAdmit = true;
            if (SHAPE) {
              const thNew = canon(mth + off * dth);
              const zNew = mz + off * dz;
              const rNew = R(thNew, zNew);
              reprojAdmit = shapeAdmits(a, b, { x: rNew * Math.cos(thNew), y: rNew * Math.sin(thNew), z: zNew, th: thNew });
            }
            if (reprojAdmit) {
              const m = addV(mth + off * dth, mz + off * dz, true);
              const list = (edgeMap.get(eKey(a, b)) ?? []).slice();
              // GUARDS MIRRORED FROM `bisectAt` — this splitter is a hand-copy of it that had NEITHER, so the
              // REPROJECT lever manufactured exactly the two failures those guards exist to stop: a split point
              // that WELDS onto a pre-existing vertex does not subdivide the edge, it stitches the edge to an
              // unrelated vertex (the >2-incidence topological pinch), and a point landing on an incident
              // triangle's APEX makes both replacement triangles degenerate, so the split DELETES geometry and
              // refinement churns without growing. Refuse both; the caller falls through to the nudge ladder.
              if (!addVNew) weldedSplits += 1;
              let apexHit = false;
              for (const t of list) { if (alive[t] && (ta[t] === m || tb[t] === m || tc[t] === m)) { apexHit = true; break; } }
              if (m !== a && m !== b && (addVNew || !NOWELD) && !apexHit) {
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
      }
      const feat = vFeat[a] && vFeat[b];
      // The midpoint can weld onto a pre-existing vertex, which does not subdivide the edge and is refused.
      // Abandoning the edge strands the triangle forever (MEASURED: no-op splits === welded splits, and the
      // stranded triangles were exactly the GeoStar/Voronoi/Gyroid MAX loci). Walk a nudge LADDER outward from the
      // midpoint; in a saturated weld neighbourhood the first few offsets can all collide.
      // S3: the ladder's rungs are CHORD fractions now, not parametric ones. `placeAt` is the identity when
      // PF_CB_MID3D=0, so the legacy ladder is reproduced exactly. SNAP (above) and REPROJECT (above) are
      // both EXEMPT — their placements are locus placements and must not be re-centred.
      for (const tPar of NUDGE_LADDER) if (bisectAt(a, b, placeAt(a, b, tPar), feat)) return true;
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

    /**
     * V2-L1. The last thing tried before a facet is abandoned: sweep ALL THREE edges at `LASTCHANCE`
     * interior positions and take the first placement the driver's own gates admit.
     *
     * Ordered longest edge first (most sag, least aspect-degrading split), and within an edge
     * coarse-to-fine outward from the midpoint, so when a legal placement exists near the centre — the
     * shape-preserving one — it is found in a few probes and the committed split stays as close to
     * Rivara's amplification-minimising point as legality allows. Edges under FLOOR_MM are skipped
     * exactly as the refiners skip them, so this cannot drive refinement below the floor.
     *
     * Returns true iff it committed a split, in which case `created` holds the children.
     */
    const lastChanceSplit = (t: number): boolean => {
      if (LASTCHANCE <= 0 || !alive[t]) return false;
      lcTried += 1;
      const order = [0, 1, 2].sort((x, y) => {
        const [ax, bx] = eVerts(t, x); const [ay, by] = eVerts(t, y);
        return eLen(ay, by) - eLen(ax, bx);
      });
      const half = Math.floor(LASTCHANCE / 2) + 1;
      for (const e of order) {
        const [a, b] = eVerts(t, e);
        if (eLen(a, b) < FLOOR_MM) continue;
        const feat = vFeat[a] && vFeat[b];
        for (let i = 0; i < LASTCHANCE; i += 1) {
          const step = Math.floor((i + 1) / 2);
          const frac = 0.5 + (i % 2 === 0 ? 1 : -1) * step * (0.5 / half);
          if (!(frac > 0 && frac < 1)) continue;
          lcProbes += 1;
          if (bisectAt(a, b, placeAt(a, b, frac), feat)) { lcRescued += 1; return true; }
        }
      }
      return false;
    };

    /**
     * V2-L2. The driver's window onto its own arrays, handed to the cavity planner. Built once.
     * `dTh` here is the ANGLE-taking `dThRaw`, not the driver's vertex-index `dTh` — the planner and
     * the patch unwrap both work in raw angles.
     */
    const cavityView: DriverMeshView = {
      ta, tb, tc, vx, vy, vz, vth, alive, vFeat, edgeMap, eKey,
      dTh: dThRaw,
      canonTheta,
      R,
      // AN EDGE IS A FEATURE EDGE ONLY IF IT RUNS ALONG A LOCUS. Both endpoints being on-locus is not
      // enough — a chord across a cell between two on-locus vertices passes that test and then walls
      // the cavity off from its own interior. The discriminator is the MIDPOINT: probe a short segment
      // PERPENDICULAR to the edge, centred on its midpoint. A locus running along the edge crosses that
      // probe near its centre; a chord's midpoint sits off-locus and the probe finds nothing.
      edgeAlongLocus: (a: number, b: number): boolean => {
        if (!vFeat[a] || !vFeat[b]) return false;
        const dth = dTh(a, b);
        const dz = vz[b] - vz[a];
        const mth = vth[a] + dth * 0.5;
        const mz = (vz[a] + vz[b]) * 0.5;
        const len = Math.hypot(dth, dz);
        if (!(len > 0)) return false;
        // A quarter of the edge length to each side: long enough to straddle the locus, short enough
        // not to reach a neighbouring one.
        const s = 0.25 * len;
        const pth = (-dz / len) * s;
        const pz = (dth / len) * s;
        const k = locateKink(mth - pth, mz - pz, mth + pth, mz + pz);
        return k !== null && k.t > 0.3 && k.t < 0.7;
      },
    };
    const cavityOptions = defaultCavityOptions({
      patchTriangles: CAVITY,
      rings: CAVITY_RINGS,
      hardAr: SHAPE_AR,
      rRefMm: Math.max(DIMS.Rb, DIMS.Rt),
      visualThresholdMm: TOL,
      weldMm: WELD_MM,
    });

    /**
     * V2-L2. Last resort: replace the facet's neighbourhood with a constrained re-triangulation.
     * Returns true iff a certified cavity was applied, in which case `created` holds the new triangles.
     */
    const cavityEscalate = (t: number): boolean => {
      if (CAVITY <= 0 || !alive[t] || cavTried >= CAVITY_BUDGET) return false;
      cavTried += 1;
      const planned = planCavityForTriangle(cavityView, t, cavityOptions);
      cavPatchSum += planned.patchTriangles;
      cavChainSum += planned.constraintChains;
      cavStepSum += planned.adaptiveSteps;
      if (planned.sawBlockingWitness) cavSawWitness += 1;
      if (planned.hitPatchBoundary) cavHitPatchRim += 1;
      if (!planned.ok || planned.edit === undefined) {
        cavRefusals.set(planned.refusal, (cavRefusals.get(planned.refusal) ?? 0) + 1);
        // FULL per-attempt evidence for the first few refusals. Aggregate counters told me WHAT was
        // refused twice and WHY neither time; the planner already records the blocking triangle, its
        // vertex kinds and its per-edge feature ids.
        if (CAVITY_DUMP && cavDumps.length < 3) {
          cavDumps.push({
            seedTriangle: t,
            refusal: planned.refusal,
            patchTriangles: planned.patchTriangles,
            constraintChains: planned.constraintChains,
            adaptiveSteps: planned.adaptiveSteps,
            selectedParents: planned.selectedParents,
            attempts: planned.attempts,
          });
        }
        return false;
      }
      cavAccepted += 1;
      const edit = planned.edit;
      // PHASE 1 — resolve the planner's new vertices through the driver's own weld. Done BEFORE any
      // kill, so a weld collapse can abort with the mesh untouched. An unreferenced vertex left in the
      // weld grid is harmless to the STL (facets carry coordinates, not indices) but is counted.
      const born: number[] = edit.addVertices.map((v) => addV(v.theta, v.z, v.feature));
      const resolve = (id: number): number => (id < 0 ? born[-1 - id] : id);
      const resolved = edit.addTriangles.map(([a, b, c]) =>
        [resolve(a), resolve(b), resolve(c)] as [number, number, number]);
      // A weld that merged two corners of a replacement facet would silently delete geometry.
      if (resolved.some(([a, b, c]) => a === b || b === c || c === a)) { cavOrphanAbort += 1; return false; }
      // PHASE 2 — commit. Kill first so the replacements do not transiently share edges with parents.
      for (const dead of edit.removeTriangles) if (alive[dead]) killT(dead);
      for (const [a, b, c] of resolved) {
        const nt = addT(a, b, c);
        if (nt >= 0) created.push(nt);
      }
      cavApplied += 1;
      cavRemoved += edit.removeTriangles.length;
      cavAdded += resolved.length;
      return true;
    };
    const neighbor = (t: number, a: number, b: number): number => {
      const l = edgeMap.get(eKey(a, b));
      if (l === undefined) return -1;
      for (const o of l) if (o !== t && alive[o]) return o;
      return -1;
    };

    // ══════════ S9 — CONFORMITY AT BIRTH (2026-07-30, second iteration of the fossil campaign) ══════════
    // S8 measured why POST-LOOP repair cannot work at production: by the time a fossil's conformity split
    // is retried, refinement has walled it in and the survivors sit AT the AR cap — 18,102 of 18,102
    // deadlocks were SELF-BLOCK (the population is CENSORED at the cap). But the same cascade conformed
    // 94.8% of sites on the shallow pilot mesh: every site is conformable WHEN FIRST ENCOUNTERED. So stop
    // the birth instead of repairing the fossil — discharge the conformity obligation the moment it exists:
    //   S9a PF_CB_CONFORM_FIRST — BEFORE seeding, split every initial-grid edge at its located interior
    //       crease crossing. At generation zero everything is fat (measured grid worst AR 3.40), the guard
    //       admits essentially every crossing split, and no ranking delay exists to wall anything in.
    //   S9b PF_CB_SNAP_CASCADE  — IN the loop, when SNAP's crossing split is shape-refused, discharge the
    //       refusal by cascade AT FIRST ENCOUNTER (trains are still shallow) instead of stranding the
    //       triangle into `unresolved`, where the corridor then censors it against the cap.
    // Both default OFF. Every split still goes through `bisectAt`, so S1/S2 score every child on both
    // sides — neither lever can emit an over-cap facet or a fold, by the refinement loop's own argument.
    const CONFORM_FIRST = envOn('PF_CB_CONFORM_FIRST') && !SWEEP && !GPU_RANK;
    const SNAP_CASCADE = envOn('PF_CB_SNAP_CASCADE') && !SWEEP && !GPU_RANK;
    const S9_DEPTH = Math.round(envF('PF_CB_S9_DEPTH', 12));
    const S9_BUDGET = Math.round(envF('PF_CB_S9_BUDGET', 600000)); // ceiling on S9's OWN gross allocations (S9a+S9b)
    // S9.1 ACCOUNTING FIX (measured defect of the first S9 arm): the budget was an ABSOLUTE ta.length
    // ceiling anchored at gen-0, so the in-loop lever went dead the moment TOTAL allocations passed the
    // anchor (~656k of a 2.5M run) — S9b processed only ~838 of its 34,728 refusals and 'budget' returns
    // were invisible in the outcome counters. The budget now meters allocations ATTRIBUTABLE to cascade
    // splits alone, and every budget-stopped site is COUNTED.
    let s9AllocsUsed = 0;
    let g0Cand = 0; let g0Conformed = 0; let g0Proximity = 0; let g0Deadlocked = 0; let g0RefusedOther = 0;
    let g0Budget = 0; let g0Splits = 0; let g0Passes = 0; let g0Allocs = 0;
    let scFired = 0; let scConformed = 0; let scProximity = 0; let scDeadlocked = 0; let scRefusedOther = 0;
    let scBudget = 0; let scSplits = 0; let scBudgetStopped = false;
    /** per-call stats `cascadeConform` fills (reset each call) — call sites fold them into their own counters. */
    const cascadeStat = { splits: 0, depth: 0 };
    /**
     * Discharge ONE conformity obligation: split (a0,b0) AT parametric t0 (a located crossing), resolving
     * shape refusals by Rivara obligation — midpoint-split the protecting triangle's LONGEST edge first,
     * recursively and depth-capped — or by retreat-toward-the-crossing when the pair itself blocks an
     * off-centre placement. The logic mirrors the S8 post-loop `conformSite` (kept verbatim below for that
     * experiment's reproducibility); THIS live variant never touches `created.length` — the caller owns
     * that array (the pop loop considers everything pushed into it; the S9a pass clears it after its sweep).
     */
    const cascadeConform = (a0: number, b0: number, t0: number): 'conformed' | 'proximity' | 'deadlock' | 'refused' | 'budget' => {
      cascadeStat.splits = 0; cascadeStat.depth = 0;
      const obA: number[] = [a0]; const obB: number[] = [b0]; const obT: number[] = [t0];
      let depth = 0;
      let attempts = 0;
      const attemptCap = 4 * S9_DEPTH + 8;
      for (;;) {
        if (s9AllocsUsed >= S9_BUDGET) return 'budget';
        attempts += 1;
        if (attempts > attemptCap) return 'deadlock';
        const i = obA.length - 1;
        const av = obA[i]; const bv = obB[i]; const tv = obT[i];
        if (!(edgeMap.get(eKey(av, bv)) ?? []).some((x) => alive[x])) {
          // a deeper obligation re-meshed this edge away; for the crossing edge itself that is unreachable
          // (protector splits never touch it) — refuse defensively rather than mis-count a conform.
          if (i === 0) return 'refused';
          obA.pop(); obB.pop(); obT.pop();
          continue;
        }
        const isCrossing = tv >= 0;
        const taBeforeMain = ta.length;
        if (bisectAt(av, bv, isCrossing ? tv : placeAt(av, bv, 0.5), isCrossing ? true : vFeat[av] && vFeat[bv])) {
          cascadeStat.splits += 1;
          s9AllocsUsed += ta.length - taBeforeMain;
          if (i === 0) { cascadeStat.depth = depth; return 'conformed'; }
          obA.pop(); obB.pop(); obT.pop();
          continue;
        }
        // `lastShapeOffenderT < 0` subsumes the weld/apex case: bisectAt resets it to -1 on entry and only
        // the two shape refusals set it (see the S8 note on TS narrowing of the closure variable).
        if (lastShapeOffenderT < 0 || !alive[lastShapeOffenderT]) return 'refused';
        if (depth >= S9_DEPTH) return 'deadlock';
        const [pv, qv] = eVerts(lastShapeOffenderT, longestE(lastShapeOffenderT));
        if (eKey(pv, qv) !== eKey(av, bv)) {
          // PROTECTOR obligation — the offender is refined before (av,bv) may split.
          obA.push(pv); obB.push(qv); obT.push(-1); depth += 1;
          continue;
        }
        // The offender's longest edge IS the blocked edge.
        if (!isCrossing) return 'deadlock'; // a midpoint split refused at its own longest edge is a true dead end
        // RETREAT: midpoint-split the crossing edge, then chase the crossing into the child that carries it.
        const cBefore = created.length;
        const taBeforeRetreat = ta.length;
        if (!bisectAt(av, bv, placeAt(av, bv, 0.5), vFeat[av] && vFeat[bv])) {
          if (lastShapeOffenderT < 0 || !alive[lastShapeOffenderT]) return 'refused';
          const [p2, q2] = eVerts(lastShapeOffenderT, longestE(lastShapeOffenderT));
          if (eKey(p2, q2) === eKey(av, bv)) return 'deadlock';
          obA.push(p2); obB.push(q2); obT.push(-1); depth += 1;
          continue;
        }
        cascadeStat.splits += 1; depth += 1;
        s9AllocsUsed += ta.length - taBeforeRetreat;
        // the new vertex: bisectAt pushed its batch at cBefore, first two are addT(oa,m,apex), addT(m,ob,apex)
        const c0 = created[cBefore]; const c1 = created[cBefore + 1];
        const m = created.length >= cBefore + 2 && c0 >= 0 && c1 >= 0 && tb[c0] === ta[c1] ? tb[c0] : -1;
        if (m < 0) return 'refused';
        let carried = false;
        for (const [ca, cb] of [[av, m], [m, bv]] as Array<[number, number]>) {
          const ck = locateKink(vth[ca], vz[ca], vth[ca] + dTh(ca, cb), vz[cb]);
          if (ck !== null && !ck.jump && ck.t > SNAP_ALPHA && ck.t < 1 - SNAP_ALPHA) {
            obA[0] = ca; obB[0] = cb; obT[0] = ck.t;
            carried = true;
            break;
          }
        }
        if (!carried) { cascadeStat.depth = depth; return 'proximity'; }
      }
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
    const refineDirected = (t: number): void => {
      const vs: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
      const ls = vs.map(([a, b]) => eLen(a, b));
      const lMax = Math.max(ls[0], ls[1], ls[2]);
      const cands: Array<[number, number]> = [];
      for (let e = 0; e < 3; e += 1) {
        if (ls[e] < FLOOR_MM) continue;
        if (ls[e] * AR < lMax) continue; // aspect guard: never thin an already-short edge further
        cands.push([edgeSag(vs[e][0], vs[e][1]), e]);
      }
      cands.sort((x, y) => y[0] - x[0]);
      // ─── S4 LONGEST-EDGE PREFERENCE WHEN SHAPE IS AT RISK ───
      // DIRECTED deliberately picks the max-SAG edge and that lever stays. It is overridden ONLY when the
      // max-sag edge cannot be split safely AT ITS BEST PLACEMENT (mid-chord — no other placement on that
      // edge can beat it, since childAR/parentAR ~= 1/min(t,1-t) is minimised at the middle) and the LONGEST
      // edge can. Both Rivara hypotheses are then in force for exactly the split that needed them.
      // The `!== e0` test keeps this free in the common case where DIRECTED already chose the longest edge.
      if (SHAPE && LONGFALL && cands.length > 1) {
        const eL = longestE(t);
        if (cands[0][1] !== eL) {
          nLongFallTested += 1;
          if (!shapeAdmitsBest(vs[cands[0][1]][0], vs[cands[0][1]][1]) && shapeAdmitsBest(vs[eL][0], vs[eL][1])) {
            const i = cands.findIndex(([, e]) => e === eL);
            if (i > 0) { cands.unshift(cands.splice(i, 1)[0]); nLongFallFired += 1; }
          }
        }
      }
      for (const [, e] of cands) if (splitEdge(vs[e][0], vs[e][1])) return; // best-first, but never give up on a refusal
      for (let e = 0; e < 3; e += 1) if (ls[e] >= FLOOR_MM && splitEdge(vs[e][0], vs[e][1])) return; // drop the guard
    };

    // ══════════════════════════════════════════════════════════════════════════════════════════════════════
    // PHASE-1 SWEEP DRIVER (PF_CB_DRIVER=sweep). Spec: research/lab/2026-07-29-quota-driver-spec.md §§1,2,3,5,7
    // ══════════════════════════════════════════════════════════════════════════════════════════════════════
    // Everything below is INERT unless SWEEP. It calls the existing `edgeSag`, `locateKink` and `bisectAt`
    // unmodified — this is a re-wiring, not new maths. The heap driver, `sagBounded`/`sagPtPerp`/`sagAdaptive`,
    // `splitEdge`, `refineLepp`, `refineDirected`, the collapse/flip pass, `analyze` and the STL writer are all
    // untouched, so `PF_CB_DRIVER=heap` (the default) stays the byte-reproducible control.
    //
    // WHAT IS DELIBERATELY NOT HERE, and must not be assumed present:
    //   * spec §4.3 SNAP-TO-LOCUS VERTEX MOVE — DEFERRED. §1.5 says do not land the per-edge memo and the move
    //     in the same commit (the move breaks the memo's invariant), and the memo is load-bearing for the
    //     predicate's cost. A refusal that §4.2 would answer with a move is CLASSIFIED and ROUTED here, but
    //     recorded as the explicit unresolved reason `move-deferred` instead of being acted on.
    //   * spec §5.2-§5.4 Phase 2 (batched GPU/CPU certificate), local h tightening, the outer loop — deferred
    //     to commit 5 of §7.4. Phase 1 reports a TRAJECTORY, never a verdict (§5.1).
    //   * Phase 0 (`sizingFeasibility`) seeding of the jump-class map — deferred to commit 4 of §7.4. The
    //     two-sweep stickiness rule of §3.3 IS implemented; the Phase-0 half of it is not.
    type SizingClass = 'smooth' | 'crease' | 'jump';
    type Need = 'none' | 'conform' | 'size';
    /** What one pop actually did. Only 'split' and 'proximity' are PROGRESS; the rest are unresolved reasons. */
    // 'shape-refused' joins the UNRESOLVED reasons, never the progress ones: a split the S1/S2 guard
    // declined has produced nothing, so a triangle with no other admissible edge must leave the queue
    // VISIBLE. Silently dropping it is precisely the failure mode `unresolved` was added to end.
    // S26 widens this union so the HEAP driver can name its refusals too. The sweep driver's `refineOne`
    // already returned a reason; the heap driver's `refineDirected`/`refineLepp` are void and recorded
    // NOTHING, which is why every production arm's histogram read `unknown` (S25.2's finding). The new
    // members are exactly `bisectAt`'s own refusal paths, split by which gate took them — shape refusals
    // keep their gate ('ar' / 'fold' / 'admit', the three `shapeAdmits` writes) and placement refusals keep
    // theirs. 'unclassified' is deliberately reachable: if it ever appears in a histogram that is a
    // REGISTERED DEFECT of this taxonomy, not a shrug, and it names itself so it cannot hide.
    type Outcome = 'split' | 'proximity' | 'floor' | 'move-deferred' | 'weld-bug' | 'no-incident' | 'curtain' | 'shape-refused'
      | 'shape-ar' | 'shape-fold' | 'shape-admit' | 'weld-collapse' | 'weld' | 'apex' | 'tricap' | 'unclassified';
    /**
     * S26 — NAME THE REFUSER for a facet the heap driver could not split.
     *
     * Called ONLY where the driver has already decided to strand `t` (refinement returned and `created` is
     * empty), so it runs on ~5k facets of a 1.26M mesh and costs three edge lengths each. It reads, never
     * writes: `bisectAt` resets both channels on entry and sets one of them on every false-return, and
     * `splitEdge` cannot return false without running its whole NUDGE_LADDER through `bisectAt` (the ladder
     * is the last thing it does), so the channels describe THIS facet's last refused placement and are
     * never stale from an earlier triangle.
     *
     * THE FLOOR TEST COMES FIRST AND THAT ORDER IS THE CLAIM. `refineDirected` only ever offers an edge
     * with `ls[e] >= FLOOR_MM`; if all three edges are under the floor it makes no `splitEdge` call at all
     * and the refusal channels would still hold whatever the PREVIOUS triangle wrote. Testing the floor
     * first makes that case name itself instead of inheriting a neighbour's reason — and 'floor' is the h⁰
     * verdict this campaign has been trying to separate from artifact refusals since R1.
     */
    const classifyStrand = (t: number): Outcome => {
      const l0 = eLen(ta[t], tb[t]); const l1 = eLen(tb[t], tc[t]); const l2 = eLen(tc[t], ta[t]);
      if (l0 < FLOOR_MM && l1 < FLOOR_MM && l2 < FLOOR_MM) return 'floor';
      if (ta.length >= triCap) return 'tricap';
      const sh = bisectRefusal();
      if (sh === 'ar') return 'shape-ar';
      if (sh === 'fold') return 'shape-fold';
      if (sh === 'admit') return 'shape-admit';
      const pl = bisectPlacement();
      if (pl === 'weld-collapse') return 'weld-collapse';
      if (pl === 'weld') return 'weld';
      if (pl === 'apex') return 'apex';
      if (pl === 'no-incident') return 'no-incident';
      return 'unclassified';
    };
    const MEMO_VERIFY = envOn('PF_CB_MEMO_VERIFY');
    const CELL_MM = envF('PF_CB_CELL_MM', 0.1);          // site-quantisation pitch for §3.3 stickiness
    const SITE_CAP = Math.round(envF('PF_CB_SITE_CAP', 4_000_000)); // keeps the site map under V8's Map cap
    const CURTAIN_CAP = Math.round(envF('PF_CB_CURTAIN_CAP', 4096));
    let sweep = 1;
    let memoHits = 0; let memoMisses = 0; let memoMismatch = 0;
    let nClassFlips = 0; let siteMapSaturated = false;

    const triEdges = (t: number): Array<[number, number]> => [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];

    // ─── §1.2 CONFORMANCE TEST. Three rA evals: one for the crossing point, none for the two distances. ───
    /**
     * The measurement itself, with no memo and no bookkeeping — so PF_CB_MEMO_VERIFY can replay it cleanly,
     * and so PF_CB_SWEEP_VERIFY can re-measure a prefetched edge against it.
     *
     * BODY MOVED TO _sweepPredicate.ts (`edgeVerdictRaw`), VERBATIM AND IN THE SAME ORDER: edgeSag, then the
     * kink probe (skipped entirely when PF_CB_SNAP=0 — the ablation arm), then the crossing point, then the
     * ABSOLUTE conformance test. Same order matters as much as same arithmetic: it is what makes the rA eval
     * count and the short-circuit on `kink === null` identical between this path and a worker's.
     * `jumpConfirmed` is filled in by `edgeVerdict` below, on the main thread only — it is §3.3 driver state,
     * not a measurement, and that separation is the whole reason the pool cannot move the mesh.
     */
    const computeVerdict = (a: number, b: number): EdgeVerdict => {
      const v = edgeVerdictRaw(R, vth[a], vz[a], vx[a], vy[a], vth[b], vz[b], vx[b], vy[b], PRED);
      return { sag: v.sag, kink: v.kink, conformed: v.conformed, jumpConfirmed: false, px: v.px, py: v.py, pz: v.pz };
    };
    // ─── THE PREFETCH TABLE (PF_CB_SWEEP_WORKERS > 1). It is NOT a second cache: it holds ONLY the pure
    // measurement, it is consulted ONLY on a memo MISS, and it is CLEARED at every generation boundary before
    // the shared result block is overwritten — so there is no window in which an index can point at stale
    // bytes. Everything order-sensitive (`noteSite`, the memo insert, the counters) still happens on the main
    // thread, at the same moment, in the same order, with the same `sweep`. See _sweepPool.ts. ───
    let sweepPool: SweepPool | null = null;
    const preIndex = new Map<number, number>();
    let preServed = 0; let preUnwritten = 0; let preVerified = 0;
    const takePrefetched = (a: number, b: number): EdgeVerdict | null => {
      if (sweepPool === null) return null;
      const k = eKey(a, b); // callers canonicalise (a<b) before reaching here
      const slot = preIndex.get(k);
      if (slot === undefined) return null;
      preIndex.delete(k);
      const raw: SweepRawVerdict | null = sweepPool.verdict(slot);
      // A slot no worker reached reads STATUS=0 and is refused rather than consumed. A dropped chunk must
      // never be mistakable for "no feature on this edge" — that is a silent-zeros failure and this repo has
      // measured one before (a failed WebGPU dispatch leaves zeros).
      if (raw === null) { preUnwritten += 1; return null; }
      preServed += 1;
      if (SWEEP_VERIFY) {
        const fresh = edgeVerdictRaw(R, vth[a], vz[a], vx[a], vy[a], vth[b], vz[b], vx[b], vy[b], PRED);
        preVerified += 1;
        if (!verdictIdentical(fresh, raw)) {
          throw new Error(
            `PF_CB_SWEEP_VERIFY: worker verdict for edge (${a},${b}) is NOT bit-identical to a main-thread `
            + `re-measurement. worker sag=${raw.sag} kink=${raw.kink === null ? 'null' : raw.kink.t} conf=${raw.conformed}; `
            + `main sag=${fresh.sag} kink=${fresh.kink === null ? 'null' : fresh.kink.t} conf=${fresh.conformed}. `
            + `The pooled mesh would differ from the serial one. Refusing to continue.`);
        }
      }
      return { sag: raw.sag, kink: raw.kink, conformed: raw.conformed, jumpConfirmed: false, px: raw.px, py: raw.py, pz: raw.pz };
    };
    // ─── §3.3 STICKINESS. `locateKink`'s two-scale window is 1/KINK_SCAN OF THE EDGE, so it shrinks with the
    // edge and one physical feature can read smooth → crease → jump across sweeps. Curtain deferral is TERMINAL
    // and unrecoverable, so it must not fire on a single noisy reading: a jump is acted on only when the same
    // site read jump on the PREVIOUS sweep too, from a DIFFERENT (freshly measured) edge. Recorded on the memo
    // MISS path only — a cache hit is the same measurement re-read, not a second opinion.
    // Packed value: lastJumpSweep * 2 + lastClass (lastJumpSweep 0 = never read jump; sweeps start at 1).
    const siteMem = new Map<string, number>();
    const siteKey = (v: EdgeVerdict): string => `${Math.round(v.px / CELL_MM)},${Math.round(v.py / CELL_MM)},${Math.round(v.pz / CELL_MM)}`;
    const noteSite = (v: EdgeVerdict, isJump: boolean): boolean => {
      const key = siteKey(v);
      const cur = isJump ? 1 : 0;
      const prev = siteMem.get(key);
      if (prev === undefined) {
        if (siteMem.size >= SITE_CAP) { siteMapSaturated = true; return false; }
        siteMem.set(key, (isJump ? sweep : 0) * 2 + cur);
        return false;
      }
      const lastCls = prev % 2;
      const lastJump = (prev - lastCls) / 2;
      if (lastCls !== cur) nClassFlips += 1;
      siteMem.set(key, (isJump ? sweep : lastJump) * 2 + cur);
      return isJump && lastJump === sweep - 1;
    };
    // THE MEMO IS KEYED BY THE UNDIRECTED EDGE, SO IT MUST BE MEASURED AND APPLIED IN ONE CANONICAL
    // DIRECTION. `edgeSag` and `locateKink` are NOT symmetric in (a,b): locateKink parameterises t from its
    // FIRST endpoint, so a swap returns 1-t, and edgeSag's samples differ in the last bits. The two triangles
    // incident to an interior edge traverse it in OPPOSITE directions (that is what consistent winding means),
    // so a naive undirected memo hands the second one a MIRRORED crossing and the conforming vertex lands at
    // the reflection of the feature. MEASURED, and this is the whole reason §6.5's gate exists: before this
    // canonicalisation PF_CB_MEMO_VERIFY read 178 153 mismatches on 383 200 hits — i.e. the ~46 % of hits that
    // arrive reversed. Store against lo→hi; callers that need to PLACE a vertex canonicalise first.
    const canonEdge = (a: number, b: number): [number, number] => (a < b ? [a, b] : [b, a]);
    const edgeVerdict = (a0: number, b0: number): EdgeVerdict => {
      const [a, b] = canonEdge(a0, b0);
      const k = eKey(a, b);
      const hit = edgeCache.get(k);
      if (hit !== undefined) {
        memoHits += 1;
        if (MEMO_VERIFY) {
          // §6.5 GATE. Recompute and Object.is-compare BOTH halves. With no vertex move in flight this MUST
          // read 0; it is here so the §4.3 move cannot land without the check that proves the memo still holds.
          // `conformed` is DELIBERATELY NOT compared: `weldWall`'s proximity route MUTATES it to true on the
          // cached object (that is the state change which makes proximity terminate rather than spin), so it is
          // driver state riding on the memo, not a memoised measurement. Adding it here would report the
          // intended mutation as staleness. `sag` and `kink.t` are the measured halves and must match exactly.
          const fresh = computeVerdict(a, b);
          if (!Object.is(fresh.sag, hit.sag) || !Object.is(fresh.kink?.t ?? -1, hit.kink?.t ?? -1)) memoMismatch += 1;
        }
        return hit;
      }
      memoMisses += 1;
      // THE ONLY LINE THE POOL CHANGES. Serving the miss from the prefetch table instead of measuring here is
      // arithmetically a no-op (same body, same inputs, PF_CB_SWEEP_VERIFY proves it per edge); everything
      // below — the §3.3 stickiness call with the CURRENT `sweep`, the memo insert, the counters — runs on
      // this thread in the order it always has. That is why W=1 and W=8 produce ONE STL md5.
      const v = sweepPool === null ? computeVerdict(a, b) : (takePrefetched(a, b) ?? computeVerdict(a, b));
      if (v.kink !== null) v.jumpConfirmed = noteSite(v, v.kink.jump);
      edgeCache.set(k, v);
      return v;
    };
    const worstEdgeSag = (t: number): number => {
      const es = triEdges(t);
      let s = 0;
      for (let e = 0; e < 3; e += 1) { const v = edgeVerdict(es[e][0], es[e][1]).sag; if (v > s) s = v; }
      return s;
    };

    // ─── §1.3 THE ACCEPT CONDITION. ONE action per pop; conformance first (density cannot buy locus
    // placement), size second. ACCEPT ⟺ need === 'none'. `acceptTol` is the existing PF_CB_ACCEPT: the
    // predicate is a 1-D LOWER bound on the facet-interior quantity the auditor judges (§6.1), so the 30 %
    // margin against TOL matters MORE here, not less. ───
    const triangleNeed = (t: number): { need: Need; edge: 0 | 1 | 2; cls: SizingClass } => {
      const es = triEdges(t);
      let sawKink = false; let sawJump = false;
      let confEdge = -1;
      for (let e = 0; e < 3; e += 1) {
        const v = edgeVerdict(es[e][0], es[e][1]);
        if (v.kink === null) continue;
        sawKink = true;
        if (v.kink.jump && v.jumpConfirmed) sawJump = true; // an UNCONFIRMED jump is treated as crease (§3.3)
        if (!v.conformed && confEdge < 0) confEdge = e;
      }
      const worstCls: SizingClass = sawJump ? 'jump' : sawKink ? 'crease' : 'smooth';
      // §3 THE SINGLE BEHAVIOURAL CHANGE WITH THE MOST EVIDENCE BEHIND IT. `locateKink` has returned this class
      // all along and the driver counted it as `nJump` and threw it away, then spent budget bisecting h⁰ sites
      // that bisection can never fix (measured: 1 368 µm of error at a demanded 50 nm resolution = 27 000:1).
      // The decision belongs HERE, at triangle scope before any edge is chosen — not inside `splitEdge`, which
      // is already past the decision to split and whose SNAP_ALPHA band lets a near-endpoint jump fall straight
      // through to midpoint bisection with the class discarded.
      if (worstCls === 'jump') return { need: 'none', edge: 0, cls: 'jump' };
      if (confEdge >= 0) return { need: 'conform', edge: confEdge as 0 | 1 | 2, cls: worstCls };
      let bs = 0; let be = 0;
      for (let e = 0; e < 3; e += 1) {
        const s = edgeVerdict(es[e][0], es[e][1]).sag;
        if (s > bs) { bs = s; be = e; }
      }
      if (bs > acceptTol) return { need: 'size', edge: be as 0 | 1 | 2, cls: worstCls };
      // ─── S29 ACCEPT-OVERRIDE. The blind ruler has PASSED; for a LISTED facet that is necessary but not
      // sufficient. Note the position: AFTER the `worstCls === 'jump'` return above, so the override is
      // never consulted at a confirmed h⁰ jump and can never demand refinement there — the exact demand
      // that stranded 2,002 facets in R1b is structurally unreachable from here. AFTER the `conform` return
      // too, so conformance-first ordering is unchanged. ───
      if (s29 !== null) {
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        if (s29.listed(vth[a], vth[b], vth[c], vz[a], vz[b], vz[c])
          && !s29.perpOk(t, R, DIMS.H, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[c], vy[c], vz[c])) {
          ovNeedSize += 1;
          // split the LONGEST edge, not the sagitta argmax: the blind sags are all under `acceptTol` here
          // (that is why we are on this line at all), so their argmax carries no information. This is the
          // ruler-blind case by construction — the facet reads flat and is not.
          const l0 = eLen(a, b); const l1 = eLen(b, c); const l2 = eLen(c, a);
          const le = l0 >= l1 && l0 >= l2 ? 0 : l1 >= l2 ? 1 : 2;
          return { need: 'size', edge: le as 0 | 1 | 2, cls: worstCls };
        }
      }
      return { need: 'none', edge: 0, cls: worstCls };
    };

    // ─── §3.3 THE CURTAIN TAG. Phase 1 only TAGS and STOPS. The consumer is a separate STAGE keyed by a
    // DETECTED feature (exactly as compileFeatureCurtain and the DragonScales ring-strip emitter already are),
    // so shape-agnosticism holds. R2 prices BasketWeave's honest jump demand at 0.138 M curtain triangles
    // against a straddling "demand" that DIVERGES under grid refinement (1.91x per doubling) — which is the
    // whole argument for tagging rather than refining. ───
    interface CurtainSite { tri: number; th: number; z: number; big: number; sweep: number }
    const curtainSites: CurtainSite[] = [];
    const curtainCells = new Set<string>();
    let curtainTagged = 0;
    const curtainDefer = (t: number): void => {
      curtainTagged += 1;
      const es = triEdges(t);
      for (let e = 0; e < 3; e += 1) {
        const v = edgeVerdict(es[e][0], es[e][1]);
        if (v.kink === null || !v.kink.jump || !v.jumpConfirmed) continue;
        const key = siteKey(v);
        if (curtainCells.has(key)) continue;
        curtainCells.add(key);
        // `big` is locateKink's two-scale |Δ²r| over its window — a PROXY for the jump magnitude in mm, not a
        // certified jump height. The curtain stage must re-measure; this only says WHERE to look.
        if (curtainSites.length < CURTAIN_CAP) {
          const [lo, hi] = canonEdge(es[e][0], es[e][1]); // v.kink.t is measured lo→hi (see `canonEdge`)
          const [th, z] = edgeParam(lo, hi, v.kink.t);
          curtainSites.push({ tri: t, th: canon(th), z, big: v.kink.big, sweep });
        }
      }
    };

    // ─── §4 THE WELD WALL. `WELD_MM` = 50 nm is the DEFINITION OF POINT IDENTITY and `analyze()` shares it, so
    // it is never lowered and NUDGE_LADDER is never retried (§4.4: each halving buys exactly one useless split,
    // and the ladder's SUCCESSES are worse than its failures — it places a vertex up to 35 % of the edge from
    // where the geometry asked, manufacturing exactly the misplaced facets V7b measures at 402.230 µm).
    // PF_CB_NUDGE is therefore INERT under `sweep`: `refineOne` calls `bisectAt` directly and never enters
    // `splitEdge`. The four refusals §4.1 separates are classified from OUTSIDE `bisectAt` (which is not
    // edited) using its two observable side effects, `weldedSplits` and `addVNew`. ───
    let nConformSplit = 0; let nSizeSplit = 0; let nProximity = 0; let nMoveDeferred = 0;
    let nSmoothWeldBug = 0; let nCreaseSizeWeld = 0; let nFloorRefused = 0; let nNoIncident = 0;
    const weldBugLog: string[] = [];
    // R5 = the S1/S2 SHAPE GUARD declined. It is a FIFTH refusal, deliberately not folded into any of the
    // four weld refusals: a weld refusal says two points coincided, R5 says the geometry the split would
    // have emitted is unprintable. Routing it through `weldWall` would count real shape refusals as
    // splitter weld bugs and bury the new signal in an old one.
    type Refusal = 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R0';
    let nShapeUnresolved = 0;
    const tryBisect = (a: number, b: number, tPar: number, feat: boolean): { ok: boolean; refusal: Refusal } => {
      const wBefore = weldedSplits;
      const ok = bisectAt(a, b, tPar, feat);
      if (ok) return { ok: true, refusal: 'R0' };
      // The guard runs BEFORE addV, so neither `weldedSplits` nor `addVNew` moved — the two observables the
      // classification below reads. `lastBisectShape` is the third, set by the same call.
      if (lastBisectShape !== 'none') return { ok: false, refusal: 'R5' };
      // R1 (`m === a || m === b`) returns BEFORE the weldedSplits bump, so a refusal that did not bump it and
      // left addVNew false is exactly R1. A bump under NOWELD is R2 (the partner is an unrelated vertex); with
      // NOWELD off the flow continues and a later refusal is the apex-degeneracy guard R3. Neither bumped and
      // addVNew true means the edge had no live incident triangle at all.
      const welded = weldedSplits > wBefore;
      const refusal: Refusal = !welded && !addVNew ? 'R1' : welded && NOWELD ? 'R2' : welded ? 'R3' : 'R0';
      return { ok: false, refusal };
    };
    /** read-only replica of `addV`'s weld search — finds the partner WITHOUT inserting a vertex. */
    const weldPartner = (px: number, py: number, pz: number): number => {
      const cx = gi(px); const cy = gi(py); const cz = gi(pz);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const list = gcell.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (list === undefined) continue;
        for (const j of list) if (Math.hypot(vx[j] - px, vy[j] - py, vz[j] - pz) <= WELD_MM) return j;
      }
      return -1;
    };
    /** §4.2 route a refused split by CLASS. `route` distinguishes a locus split from a plain size split. */
    const weldWall = (t: number, a: number, b: number, cls: SizingClass, refusal: Refusal, route: 'conform' | 'size'): Outcome => {
      if (cls === 'jump') { curtainDefer(t); return 'curtain'; } // defensive: triangleNeed already returned 'none'
      if (route === 'conform') {
        if (refusal === 'R4' || refusal === 'R1') {
          // §4.2 crease + R4/R1 → SNAP-TO-LOCUS VERTEX MOVE. NOT IMPLEMENTED (§4.3 deferred — see the header).
          // The crossing is within SNAP_ALPHA·|e| of an endpoint, or welded onto one; the answer is to MOVE
          // that endpoint onto the crossing, which conforms exactly, creates no vertex and terminates in ONE
          // step. Until that lands this is an HONEST DEAD END, not an accept: it goes to `unresolved`, so a
          // drained FIFO still reports NOT-CONVERGED.
          nMoveDeferred += 1;
          return 'move-deferred';
        }
        // §4.2 crease + R2/R3 → CONFORMED BY PROXIMITY. A weld partner within WELD_MM (50 nm) of the wanted
        // locus point means the locus ALREADY passes within 50 nm of an existing vertex — 12x tighter than the
        // 0.6 µm CONF_MM calls sufficient. Mark the edge conformed and stop refining it FOR LOCUS REASONS; the
        // triangle may still need SIZE work, so it is re-enqueued. That is a state change, not a spin:
        // `conformed` is monotone, the memo entry lives exactly as long as the edge, and there are 3 edges.
        // Do NOT nudge here — nudging is what manufactures the >2-incidence pinch the guard exists to prevent.
        const v = edgeVerdict(a, b);
        if (!v.conformed) { v.conformed = true; nProximity += 1; }
        return 'proximity';
      }
      // §4.2 size route → LOG AS A BUG. A midpoint that welds means two independent refinement fronts converged
      // to within 50 nm. On a smooth patch that is a SPLITTER DEFECT, not a geometry fact, and it must be
      // visible rather than silently absorbed. Counted separately for crease-class triangles, where a conformed
      // locus nearby makes it less surprising and the claim "defect" would be overstated.
      if (cls === 'smooth') nSmoothWeldBug += 1; else nCreaseSizeWeld += 1;
      if (weldBugLog.length < 256) {
        const [mth, mz] = edgeParam(a, b, 0.5);
        const thc = canon(mth); const rm = R(thc, mz);
        const mx = rm * Math.cos(thc); const my = rm * Math.sin(thc);
        const j = weldPartner(mx, my, mz);
        const dj = j < 0 ? -1 : Math.hypot(vx[j] - mx, vy[j] - my, vz[j] - mz);
        weldBugLog.push(`t=${t} cls=${cls} ${refusal} e=(${a},${b}) |e|=${(eLen(a, b) * 1000).toFixed(3)}µm sag=${(edgeVerdict(a, b).sag * 1000).toFixed(3)}µm partner=${j} |partner-mid|=${dj < 0 ? 'n/a' : `${(dj * 1e6).toFixed(1)}nm`}`);
      }
      return 'weld-bug';
    };

    // ─── §3.2 CLASS ROUTING. Exactly ONE action per pop — two would make the sweep count meaningless and
    // reintroduce the inner LEPP walk's unbounded guard=200_000 loops (§6.7). ───
    //   smooth  → BISECT TO SIZE: midpoint split of the max-edgeSag edge, aspect-guarded.
    //   crease  → DIRECTED + SNAP: split at the CACHED crossing k.t, feat = true.
    //   jump    → STOP (handled by the caller before we get here).
    // §6.7 FLOOR_MM gates SPLIT CANDIDACY, never predicate evaluation: a sub-floor triangle that violates is
    // `unresolved`, not accepted.
    const refineOne = (t: number, nd: { need: Need; edge: 0 | 1 | 2; cls: SizingClass }): Outcome => {
      const es = triEdges(t);
      const ls = [eLen(es[0][0], es[0][1]), eLen(es[1][0], es[1][1]), eLen(es[2][0], es[2][1])];
      if (nd.need === 'conform') {
        // CANONICAL DIRECTION, NOT the triangle's traversal — `k.t` was measured lo→hi and must be applied
        // lo→hi or the vertex lands at the mirror of the crossing (see `canonEdge`). `bisectAt` accepts either
        // order of the endpoints, so this costs nothing.
        const [a, b] = canonEdge(es[nd.edge][0], es[nd.edge][1]);
        if (ls[nd.edge] < FLOOR_MM) { nFloorRefused += 1; return 'floor'; }
        const k = edgeVerdict(a, b).kink as Kink;
        // SNAP_ALPHA in its ONLY surviving role: a guard on WHERE the vertex may be placed. Outside the band is
        // refusal R4 — the dominant Zeno case, and the one §4.3's move exists to answer.
        if (k.t > SNAP_ALPHA && k.t < 1 - SNAP_ALPHA) {
          // k.t IS the locus. S3 does not touch it — placing a crossing anywhere but ON the crossing is
          // the one thing SNAP exists to prevent.
          const r = tryBisect(a, b, k.t, true);
          if (r.ok) { nConformSplit += 1; nSnap += 1; if (k.jump) nJump += 1; return 'split'; }
          if (r.refusal === 'R0') { nNoIncident += 1; return 'no-incident'; }
          // R5 BEFORE weldWall. weldWall's conform route treats anything that is not R4/R1 as "conformed by
          // proximity" — a MONOTONE state change that would mark this edge done forever. A shape refusal is
          // the opposite of done: nothing was placed, the locus is still uncrossed, and the honest record is
          // `unresolved`.
          if (r.refusal === 'R5') { nShapeUnresolved += 1; return 'shape-refused'; }
          return weldWall(t, a, b, nd.cls, r.refusal, 'conform');
        }
        return weldWall(t, a, b, nd.cls, 'R4', 'conform');
      }
      // SIZE. Candidate = an edge at or above FLOOR_MM that passes refineDirected's aspect guard
      // (ls[e]*AR >= lMax, "never thin an already-short edge further"); pick the max edgeSag among them, and if
      // NONE passes the aspect guard drop it rather than strand the triangle — exactly refineDirected's own
      // two-tier fallback (L897). PF_CB_DIRECTED=0 is the ABLATION arm: longest edge instead of max sag.
      const lMax = Math.max(ls[0], ls[1], ls[2]);
      const keyOf = (e: number): number => (DIRECTED ? edgeVerdict(es[e][0], es[e][1]).sag : ls[e]);
      // The two tiers, as an ORDERED LIST rather than a single argmax, so an S1/S2 refusal on the best edge
      // can FALL THROUGH to the next one instead of stranding the triangle. With the shape levers off the
      // list's head is bit-for-bit the old `be`: Array.prototype.sort is stable, so a key tie keeps ascending
      // edge index — exactly what the old strict `key > bk` scan did — and only order[0] is ever tried.
      let order: number[] = [];
      for (let e = 0; e < 3; e += 1) if (ls[e] >= FLOOR_MM && ls[e] * AR >= lMax) order.push(e);
      if (order.length === 0) for (let e = 0; e < 3; e += 1) if (ls[e] >= FLOOR_MM) order.push(e);
      if (order.length === 0) { nFloorRefused += 1; return 'floor'; }
      order = order.map((e) => [keyOf(e), e] as [number, number]).sort((x, y) => y[0] - x[0]).map(([, e]) => e);
      // S4, same rule as refineDirected's: override the max-sag choice ONLY when its best placement is
      // inadmissible and the longest edge's is not.
      if (SHAPE && LONGFALL && order.length > 1) {
        let eL = 0; for (let e = 1; e < 3; e += 1) if (ls[e] > ls[eL]) eL = e;
        if (order[0] !== eL && order.includes(eL)) {
          nLongFallTested += 1;
          const [ha, hb] = canonEdge(es[order[0]][0], es[order[0]][1]);
          const [la, lb] = canonEdge(es[eL][0], es[eL][1]);
          if (!shapeAdmitsBest(ha, hb) && shapeAdmitsBest(la, lb)) {
            order = [eL, ...order.filter((e) => e !== eL)]; nLongFallFired += 1;
          }
        }
      }
      for (const be of order) {
        const [a, b] = canonEdge(es[be][0], es[be][1]); // 0.5 is direction-free; canonical anyway so weldWall's edgeVerdict hits
        const r = tryBisect(a, b, placeAt(a, b, 0.5), false);
        if (r.ok) { nSizeSplit += 1; return 'split'; }
        // A SHAPE refusal is edge-local — another edge of the same triangle may still be splittable — so it
        // is the ONLY refusal that continues. Every weld refusal keeps its existing terminal handling, since
        // those are statements about the mesh's vertex set rather than about this edge's geometry.
        if (r.refusal === 'R5') continue;
        if (r.refusal === 'R0') { nNoIncident += 1; return 'no-incident'; }
        return weldWall(t, a, b, nd.cls, r.refusal, 'size');
      }
      // R5 is the ONLY refusal that continues the loop, so reaching here means every candidate edge was
      // shape-refused. The triangle violated and no mechanism could act on it ⇒ `unresolved`, never dropped.
      nShapeUnresolved += 1;
      return 'shape-refused';
    };

    // ─── §2.2 THE WORK LIST: a ring buffer over Int32Array, grown by DOUBLING (never Array.shift(), which is
    // O(n)), with a GENERATION MARKER so sweeps stay observable. One Int32 per entry against the heap's TWO
    // number[] arrays — ~10 MB vs ~40 MB at 2.5 M entries, and the heap's entry count is CUMULATIVE pushes.
    // Duplicates are impossible by construction: entries come only from `created` (fresh addT ids) plus the
    // re-enqueued survivor, which was just popped. Dead entries ARE possible (bisectAt splits every incident
    // triangle, killing queued neighbours) — the alive[t] check at pop handles them, and §6.7's compaction at
    // each sweep boundary stops them accumulating against V8's array limits. ───
    let qBuf = new Int32Array(1 << 16);
    let qMask = qBuf.length - 1;
    let qHead = 0; let qTail = 0; let qGenEnd = 0; let qDropped = 0;
    const qSize = (): number => qTail - qHead;
    const qPush = (t: number): void => {
      if (qTail - qHead >= qBuf.length) {
        // GROW BY DOUBLING, and RE-DERIVE THE MASK (§6.7 — easy to get wrong silently). Entries are copied out
        // in ring order so the new buffer starts at index 0.
        // REBASE THE GENERATION MARKER TOO. qHead/qTail/qGenEnd are absolute counters sharing ONE origin; the
        // copy moves the origin to the current head, so qGenEnd must move with them or the sweep boundary
        // `qHead >= qGenEnd` is tested against a stale origin and fires ~qHead pops LATE. That is not cosmetic:
        // §3.3's stickiness rule confirms a jump only when the same site read jump on the IMMEDIATELY previous
        // sweep, so a swallowed boundary silently demotes genuine h⁰ sites to crease and refines them into the
        // weld wall — and compaction (§6.7) is skipped for the same span. qGenEnd >= qHead always holds here:
        // the boundary is tested at the top of the loop BEFORE the pop, so qHead never passes it un-reset.
        const size = qTail - qHead;
        const next = new Int32Array(qBuf.length * 2);
        for (let i = 0; i < size; i += 1) next[i] = qBuf[(qHead + i) & qMask];
        qGenEnd = Math.max(0, qGenEnd - qHead);
        qBuf = next; qMask = next.length - 1; qHead = 0; qTail = size;
      }
      qBuf[qTail & qMask] = t; qTail += 1;
    };
    const qPop = (): number => { const t = qBuf[qHead & qMask]; qHead += 1; return t; };
    /** drop dead entries from the pending region, in place. Returns how many went. */
    const qCompact = (): number => {
      const size = qTail - qHead;
      let w = 0;
      for (let i = 0; i < size; i += 1) {
        const t = qBuf[(qHead + i) & qMask];
        if (!alive[t]) continue;
        qBuf[(qHead + w) & qMask] = t; w += 1; // w <= i always, so this never overwrites an unread slot
      }
      qTail = qHead + w;
      return size - w;
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
    // GPU-RANK CANDIDATE QUEUE. A GPU round trip only pays for itself in bulk — one triangle per dispatch is
    // ~2 orders off — so `consider` DEFERS under the flag and the batch is scored on the way round the loop.
    // The cost is that a freshly split child enters the heap up to GR_BATCH candidates late, i.e. worst-first
    // becomes worst-first-modulo-a-batch. That is a real approximation and it is reported (`key-inversions`
    // already counts it; the baseline run logged 175 924 of them with the CPU ruler, so the discipline was
    // never exact to begin with).
    const pend: number[] = [];
    /**
     * §5.3 THE LOCAL ACCEPT THRESHOLD for triangle `t`. NEVER above `acceptTol` — `scaleForSphere` is clamped
     * to >= 1 and this is a division, so the field can only ever TIGHTEN, by construction rather than by
     * convention. With no field it returns the `acceptTol` double itself, so the unset path is bit-unchanged.
     *
     * The test is against the triangle's BOUNDING SPHERE, not its centroid. A coarse facet can COVER a locus
     * while its centroid sits outside every ball; a centroid test would accept it, never split it, and the
     * tightened region would be unreachable from the 60x40 initial grid — the field would then be inert on
     * exactly the run that needs it. Over-inclusion at coarse scales is safe in one direction only, which is
     * the direction tightening runs in, and it converges to the true region as the triangle shrinks.
     */
    const localAcceptTol = (t: number): number => {
      if (tighten === null) return acceptTol;
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const cx = (vx[a] + vx[b] + vx[c]) / 3;
      const cy = (vy[a] + vy[b] + vy[c]) / 3;
      const cz = (vz[a] + vz[b] + vz[c]) / 3;
      const rad = Math.sqrt(Math.max(
        (vx[a] - cx) ** 2 + (vy[a] - cy) ** 2 + (vz[a] - cz) ** 2,
        (vx[b] - cx) ** 2 + (vy[b] - cy) ** 2 + (vz[b] - cz) ** 2,
        (vx[c] - cx) ** 2 + (vy[c] - cy) ** 2 + (vz[c] - cz) ** 2,
      ));
      const s = tighten.scaleForSphere(cx, cy, cz, rad);
      if (s > 1) tightenHits += 1;
      return acceptTol / s;
    };
    const consider = (t: number): void => {
      if (t < 0 || !alive[t]) return;
      const le = Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
      // FLOOR_MM gates SPLIT CANDIDACY and it is NOT relaxed by the field (spec §6.7): a sub-floor triangle
      // that a tightened tol would still reject is a REFINEMENT-FLOOR fact, not an accept. Count it so a run
      // that quietly hit the floor inside the tightened region cannot look like a clean pass.
      if (le < FLOOR_MM) { if (tighten !== null && tighten.scaleForSphere(vx[ta[t]], vy[ta[t]], vz[ta[t]], le) > 1) tightenFloorHits += 1; return; }
      if (GPU_RANK) { pend.push(t); return; }
      const s = RANK === 'bounded' ? sagBounded(t)
        : RANK === 'ptperp' ? sagPtPerp(t)
          : ADAPT ? sagAdaptive(t, REF_HS, REF_NMIN, REF_NMAX) : sagOfN(t, oracleRef);
      const at = localAcceptTol(t);
      // S20 (a) ACCEPT-SIDE — a facet that points the wrong way against its own footprint may NOT be
      // accepted, whatever the ruler says. It stays in the queue and keeps refining; if it ends the run
      // still footprint-back-facing it is an ADMISSION STRAND and is enumerated, which is the product.
      if (s <= at && ADMIT_NORMAL && footBackT(t)) { admitForcedPush += 1; hpush(t, s); return; }
      // ─── S29 ACCEPT-OVERRIDE, accept side. Mirrors the S20 line directly above, and for the same reason:
      // a facet the blind ruler would accept is not accepted while the honest quantity says it is over the
      // bar. It stays in the queue and keeps refining. It is pushed AT ITS BLIND KEY `s` — the honest
      // quantity holds a veto, it does NOT rank, so the heap's ordering is untouched. That is R1b's own
      // conclusion kept intact: "the honest quantity is an EXCELLENT judge and a BAD driver". ───
      if (s <= at && s29 !== null) {
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        if (s29.listed(vth[a], vth[b], vth[c], vz[a], vz[b], vz[c])
          && !s29.perpOk(t, R, DIMS.H, vx[a], vy[a], vz[a], vx[b], vy[b], vz[b], vx[c], vy[c], vz[c])) {
          ovForcedPush += 1; hpush(t, s); return;
        }
      }
      if (s > at) { if (at !== acceptTol && s <= acceptTol) tightenPushes += 1; hpush(t, s); }
    };
    /** score every queued candidate on the GPU and push the ones that miss `acceptTol`. */
    const flushGpu = async (): Promise<void> => {
      if (gpu === null || pend.length === 0) return;
      const batch: number[] = [];
      for (const t of pend) if (alive[t]) batch.push(t); // a candidate can die between queueing and flushing
      pend.length = 0;
      if (batch.length === 0) return;
      const xyz = new Float32Array(batch.length * 9);
      for (let i = 0; i < batch.length; i += 1) {
        const t = batch[i]; const a = ta[t]; const b = tb[t]; const c = tc[t]; const o = i * 9;
        xyz[o] = vx[a]; xyz[o + 1] = vy[a]; xyz[o + 2] = vz[a];
        xyz[o + 3] = vx[b]; xyz[o + 4] = vy[b]; xyz[o + 5] = vz[b];
        xyz[o + 6] = vx[c]; xyz[o + 7] = vy[c]; xyz[o + 8] = vz[c];
      }
      const res = await gpu.score(xyz, batch.length);
      for (let i = 0; i < batch.length; i += 1) {
        const s = res[i * 2] + (GR_COVFRAC * res[i * 2 + 1]) / GR_N + GR_MARGIN;
        // Same local threshold as the CPU path. Applying it here rather than refusing the flag combination
        // keeps ONE definition of the accept test; a GPU-ranked run that silently ignored the field would be
        // a run tagged as one experiment and driven by another.
        const at = localAcceptTol(batch[i]);
        if (s > at) { if (at !== acceptTol && s <= acceptTol) tightenPushes += 1; hpush(batch[i], s); }
      }
      gpuScored += batch.length; gpuFlushes += 1;
    };
    // ───────── S9a: CONFORM-FIRST (PF_CB_CONFORM_FIRST=1; default OFF) — runs BEFORE seeding ─────────
    // Sweep every live edge of the raw grid; split each interior crease crossing AT the crossing, cascade-
    // backed (rarely needed here: the grid's measured worst AR is 3.40 and everything splits legally).
    // Multi-pass, because a conformity split's child edges can themselves cross a neighbouring locus.
    // Conformity thereby stops being a RANKED CHOICE the plane ruler can defer until the corridor has
    // walled the site in — it is discharged while discharge is still possible. Children created here are
    // ordinary live triangles when the seeding loop below runs, so they enter the heap like grid facets.
    if (CONFORM_FIRST) {
      const taStart = ta.length;
      for (let pass = 0; pass < 4; pass += 1) {
        g0Passes += 1;
        let did = false;
        const seenE9 = new Set<number>();
        for (let t0 = 0; t0 < ta.length; t0 += 1) {
          if (!alive[t0]) continue;
          if (s9AllocsUsed >= S9_BUDGET) break;
          const es9: Array<[number, number]> = [[ta[t0], tb[t0]], [tb[t0], tc[t0]], [tc[t0], ta[t0]]];
          for (const [pv, qv] of es9) {
            const k0 = eKey(pv, qv);
            if (seenE9.has(k0)) continue;
            seenE9.add(k0);
            if (!(edgeMap.get(k0) ?? []).some((x) => alive[x])) continue; // re-meshed earlier this pass
            const kk = locateKink(vth[pv], vz[pv], vth[pv] + dTh(pv, qv), vz[qv]);
            if (kk === null || kk.jump) continue; // jump-class is curtain material, never a snap
            if (kk.t <= SNAP_ALPHA || kk.t >= 1 - SNAP_ALPHA) continue;
            g0Cand += 1;
            const oc = cascadeConform(pv, qv, kk.t);
            g0Splits += cascadeStat.splits;
            if (oc === 'conformed') g0Conformed += 1;
            else if (oc === 'proximity') g0Proximity += 1;
            else if (oc === 'deadlock') g0Deadlocked += 1;
            else if (oc === 'budget') g0Budget += 1;
            else g0RefusedOther += 1;
            if (cascadeStat.splits > 0) did = true;
          }
        }
        if (!did) break;
      }
      g0Allocs = ta.length - taStart;
      created.length = 0; // children are live triangles; the seeding loop below considers every one
    }
    // §2.3 seeding. Under `sweep` the whole initial grid goes into the FIFO unmeasured — the predicate is
    // evaluated at POP, not at push, so there is no up-front ranking pass to pay for.
    // S23 — THE CONSTRUCTION PASS HANDS OFF TO NOBODY. Under PF_CB_RECON the seed IS the mesh, so it is
    // never seeded into the heap: the refinement loop below finds an empty heap and exits on its first
    // test, the collapse/flip/de-shard passes are already default-OFF and stay off, and everything from
    // the watertight audit onward runs on the constructed mesh verbatim. Refusing to SEED (rather than
    // breaking out of the loop) is what makes that true without touching one line of the loop itself.
    if (RECON !== '') { /* the constructed seed is the product; nothing is refined */ }
    else if (SWEEP) { for (let t = 0; t < ta.length; t += 1) qPush(t); qGenEnd = qTail; }
    else for (let t = 0; t < ta.length; t += 1) consider(t);
    const initTris = ta.length;
    let capped = false;
    let iters = 0;
    let stuck = 0;
    // UNRESOLVED = popped over `acceptTol`, refinement produced NOTHING, never re-queued. Kept explicitly so the
    // run can say so; `stuck` alone only counted them (see the loop body for the measurement).
    const unresolved = new Map<number, number>(); // triangle → the key it was popped at
    let lastKey = Infinity;
    let keyInversions = 0;
    // WALL-CLOCK BUDGET (PF_CB_MAXSECS, 0 = off). An escalating accept test costs ~6.6 k rA evals per
    // triangle, so a run can outlive the session that launched it and then report NOTHING — the loop only
    // exits on an empty heap or the triangle cap, and the STL/report are written after it. Stopping on time
    // and SAYING SO turns "no result" into a measured trajectory (tris so far, heap left, worst left), which
    // is what actually distinguishes converging from exploding.
    const MAXSECS = envF('PF_CB_MAXSECS', 0);
    const PROGRESS = process.env.PF_CB_PROGRESS ?? '';
    let timeCapped = false;
    // Why the unresolved reasons are kept separately: `unresolved` must stay EXACTLY the Map the survivor
    // filter and the NOT-CONVERGED verdict already consume (spec §2.5), so the diagnosis rides alongside.
    const unresolvedWhy = new Map<number, Outcome>();
    // ═══════════════ S25 — PER-FACET `unresolved` EMISSION (PF_CB_EMIT_UNRESOLVED=1, DEFAULT OFF) ═══════════════
    // WHY THIS EXISTS, stated so it is not mistaken for a convenience dump. S24's close-out named
    // `<tag>.strands.json` as "the M=g/h^2 routing input, 4,675 facets". IT IS NOT, AND THE 4,675 HAD NO
    // SERIALIZED FORM ANYWHERE IN THE TREE. `strands.json` carries the ADMISSION-stranded population
    // (emitter below, gated on `footBackT`), which is 0 BY DESIGN and whose emptiness is a PASS. The 4,675
    // is THIS map — shape-refused facets the splitter could not subdivide — and until this flag landed it
    // was reduced to two scalars (`unresolvedLeft` / `unresolvedMax`) and a by-reason histogram and then
    // thrown away. A routing arm registered against a list that does not exist is unfalsifiable, which is
    // why the extraction had to be BUILT before S25 could be registered at all.
    //
    // THE SNAPSHOT, AND WHY IT IS NOT THE SAME THING AS THE LIVE MAP AT WRITE TIME. `unresolvedLeft` is
    // computed once, right after the main loop, over SURVIVORS only. The de-shard / flip / cascade RESUME
    // pass then runs and MUTATES this map (`unresolved.delete` / `.set` in the resume loop) — on `_S24i2`
    // that pass made 504 further splits. So there are two honest populations and they are not equal:
    //   * the REDUCTION-POINT set — what the report's headline `unresolved: N` line counts, and the number
    //     every S2x row in the worklog quotes (4,675 on `_S24i2`, 5,013 on `_S24i3`);
    //   * the FINAL set — what is still unresolved and still alive in the mesh that actually SHIPS, which
    //     is the population a routing arm has to act on.
    // BOTH ARE EMITTED, with the reduction-point count as the reconciliation anchor, because quoting one
    // while the log quotes the other is exactly the class of confound that produced this file's existence.
    const EMIT_UNRESOLVED = envOn('PF_CB_EMIT_UNRESOLVED');
    /** (tri, popped key) captured AT THE REDUCTION POINT, before the resume pass can mutate the map. */
    const unresolvedSnap: Array<[number, number]> = [];

    // ══════════════ PARALLEL PREDICATE PREFETCH (PF_CB_SWEEP_WORKERS > 1, sweep driver only) ══════════════
    // Evaluate in parallel, apply serially. At each generation boundary the pending region is a FIXED list of
    // triangles; their (deduplicated, canonicalised) edges are measured in a worker pool while nothing mutates
    // the mesh, and the loop below then applies actions exactly as it always has, in queue order.
    //
    // WHY STALENESS CANNOT ARISE, and why the §3.3 stickiness rule in particular is safe — the question that
    // has to be answered before any of this is allowed to ship:
    //   * `edgeVerdictRaw` is a pure function of the two endpoints' coordinates and of rA. Vertices are NEVER
    //     MOVED (spec §4.3's move is deferred; killT/addT never rewrite a live triangle's corners during
    //     refinement), so a verdict for edge (a,b) stays correct for the whole life of that edge, whichever
    //     sweep it is finally read in. `syncVertices` re-checks that invariant on a strided sample every
    //     generation and REFUSES to continue if any mirrored coordinate ever changed.
    //   * A split during the generation KILLS triangles, so some prefetched edges are never consumed. Those
    //     entries are simply dropped at the next boundary. They never reach `noteSite`, `edgeCache` or a
    //     counter — their only trace is rA evals, which is a COST number, reported separately.
    //   * §3.3 STICKINESS is evaluated at CONSUMPTION time, not at measurement time. `noteSite` runs inside
    //     `edgeVerdict`'s miss path, on this thread, with the CURRENT `sweep` — so an edge prefetched in sweep
    //     5 and first consumed in sweep 6 records sweep 6, which is exactly what a serial run would record,
    //     because a serial run would also have first measured it in sweep 6. Nothing about the measurement
    //     carries a sweep number, so the "jump on the IMMEDIATELY PREVIOUS sweep" test is untouched. This is
    //     stronger than "re-evaluated next sweep, same fixed point": the mesh is BIT-identical, not merely
    //     convergent, which is what makes the W=1 vs W=8 md5 test meaningful.
    //   * DETERMINISM needs no sort. Edge i's verdict is written to slot i and only slot i, by whichever
    //     worker claimed the chunk containing i, so the result block is a pure function of the input list and
    //     is independent of thread interleaving. The apply order is the unchanged FIFO order — deterministic
    //     AND equal to serial, which sorting by triangle index would not be.
    let preGenerations = 0; let preDispatched = 0;
    const prefetchGeneration = async (): Promise<void> => {
      if (sweepPool === null) return;
      preIndex.clear();                       // MUST precede beginBatch: the result block is about to be reused
      sweepPool.syncVertices(vth, vz, vx, vy);
      const size = qTail - qHead;
      let live = 0;
      for (let i = 0; i < size; i += 1) if (alive[qBuf[(qHead + i) & qMask]]) live += 1;
      sweepPool.beginBatch(live * 3);
      for (let i = 0; i < size; i += 1) {
        const t = qBuf[(qHead + i) & qMask];
        if (!alive[t]) continue;
        const c0 = ta[t]; const c1 = tb[t]; const c2 = tc[t];
        for (let e = 0; e < 3; e += 1) {
          const u = e === 0 ? c0 : e === 1 ? c1 : c2;
          const v = e === 0 ? c1 : e === 1 ? c2 : c0;
          // CANONICAL lo→hi, matching `canonEdge`: `locateKink` parameterises t from its FIRST endpoint and
          // the two triangles incident to an interior edge traverse it in OPPOSITE directions, so measuring
          // an edge in the wrong direction returns a MIRRORED crossing (measured once already: 178 153
          // mismatches on 383 200 memo hits before the memo was canonicalised).
          const a = u < v ? u : v; const b = u < v ? v : u;
          const k = eKey(a, b);
          if (edgeCache.has(k) || preIndex.has(k)) continue; // already measured, or already queued this batch
          preIndex.set(k, sweepPool.pushEdge(a, b));
        }
      }
      preGenerations += 1;
      preDispatched += sweepPool.batchSize;
      await sweepPool.run();
    };
    if (SWEEP && SWEEP_WORKERS > 1) {
      // Opened here, after `zSteps` exists, so the verification lattice can BRACKET the detected C0 loci —
      // the only places a one-ULP divergence between the parent's rA and a worker's rebuilt copy would
      // actually change which side of a cliff a sample lands on. `rA` (not `R`) is passed as the reference so
      // the ~16.5 k lattice evals are not billed to the mesher's reported rA count.
      sweepPool = await SweepPool.open({
        workers: SWEEP_WORKERS,
        style: STYLE, styleParams, dims: DIMS, pred: PRED, H,
        zJumps: zSteps, thJumps: thetaJumpProbe(rA, H),
        refRadius: rA,
        workerHeapMb: Math.round(envF('PF_CB_SWEEP_HEAP_MB', 1024)),
        chunkMax: Math.round(envF('PF_CB_SWEEP_CHUNK', 64)),
      });
      await prefetchGeneration(); // generation 1: seeded above, and the loop's boundary test will not fire for it
    }

    // ══════════════════════════ §2.3 THE PHASE-1 SWEEP LOOP ══════════════════════════
    // FIFO, not a heap, because the target is L∞: a max is order-insensitive, so every violating triangle must
    // be fixed and no order can terminate with a known violator outstanding — ordering cannot move the fixed
    // point. The heap's only product is the anytime property, and at a binary product bar 400 µm and 900 µm are
    // equally unshippable, so there is no partial credit to buy. FIFO is also starvation-free (the heap
    // finished one measured run with 228 063 left and worst-left 1 025.9 µm) and batchable.
    // `finally`, not a straight-line close: PF_CB_SWEEP_VERIFY throws on a mismatch and the pool must not
    // leave 8 live worker threads behind holding the process open when it does.
    let sweepStats: SweepPoolStats | null = null;
    try {
    if (SWEEP) {
      while (qSize() > 0) {
        if (ta.length >= triCap) { capped = true; break; }
        if (MAXSECS > 0 && (iters & 1023) === 0 && (Date.now() - t0ms) / 1000 > MAXSECS) { timeCapped = true; break; }
        if (qHead >= qGenEnd) {
          // GENERATION BOUNDARY. Compact first (§6.7), then open the next sweep.
          qDropped += qCompact();
          sweep += 1;
          qGenEnd = qTail;
          if ((DEBUG || PROGRESS !== '') && qSize() > 0) {
            let al = 0; for (let k = 0; k < alive.length; k += 1) if (alive[k]) al += 1;
            const line = `${((Date.now() - t0ms) / 1000).toFixed(0)}s sweep=${sweep} queue=${qSize()} acts=${iters} alive=${al} alloc=${ta.length} cls=[conf ${nConformSplit} size ${nSizeSplit} prox ${nProximity} curtain ${curtainTagged}] unres=${unresolved.size} rA=${(rEvals / 1e6).toFixed(0)}M`;
            // eslint-disable-next-line no-console
            if (DEBUG) console.log(`   … ${line}`);
            if (PROGRESS !== '') { try { appendFileSync(PROGRESS, `${line}\n`); } catch { /* progress logging must never kill the run */ } }
          }
          if (qSize() === 0) break;
          // The generation's triangle list is now FIXED (qGenEnd = qTail, nothing mutates the mesh until the
          // next pop), which is exactly the window in which the predicate is safely parallel.
          if (sweepPool !== null) await prefetchGeneration();
        }
        const t = qPop();
        if (!alive[t]) continue;
        const nd = triangleNeed(t);
        if (nd.need === 'none') {
          // §3.4 a jump-class facet is DEFERRED, never `unresolved`. If it landed there, every BasketWeave run
          // would report NOT-CONVERGED forever for a reason no bisection driver can ever fix, and the signal
          // would be worthless.
          if (nd.cls === 'jump') curtainDefer(t);
          continue;
        }
        created.length = 0;
        const outcome = refineOne(t, nd);
        for (const nt of created) if (nt >= 0) qPush(nt);
        if (outcome === 'split' || outcome === 'proximity') {
          // PROGRESS. `split` kills t and enqueues its children; `proximity` leaves t alive with one edge newly
          // marked conformed, which is a monotone state change, so re-testing it next round terminates.
          if (alive[t]) qPush(t);
          unresolved.delete(t); unresolvedWhy.delete(t);
        } else if (outcome !== 'curtain') {
          // §2.5 THE STOP-RULE SOUNDNESS. Popped over-tolerance, refinement produced nothing, never re-queued.
          // A DRAINED FIFO IS NOT A PASS while any of these survive. The recorded value is the predicate's own
          // worstEdgeSag (already memoised, so free), replacing the heap key the old driver recorded — same
          // semantics: this triangle violated and no mechanism could act on it.
          stuck += 1;
          unresolved.set(t, worstEdgeSag(t));
          unresolvedWhy.set(t, outcome);
        }
        iters += 1;
      }
    }
    } finally {
      // Release the pool as soon as refinement is done. Everything after this point (the queue-remainder scan,
      // the collapse/flip passes, the audit) measures on the main thread — which is what a W=1 run does too, so
      // no number below can depend on whether a pool ever existed. `stats` outlives `close()`.
      if (sweepPool !== null) { const p = sweepPool; sweepPool = null; sweepStats = p.stats; preIndex.clear(); await p.close(); }
    }

    while (!SWEEP && (heapT.length > 0 || pend.length > 0)) {
      // Flush when the batch is full, or when the heap has run dry and the only work left is queued. The
      // second clause is what makes termination correct: an unscored candidate is not an absent one, and
      // exiting on `heapT.length === 0` alone would silently certify everything still in the queue.
      if (GPU_RANK && (pend.length >= GR_BATCH || heapT.length === 0)) await flushGpu();
      if (heapT.length === 0) break;
      if (MAXSECS > 0 && (iters & 1023) === 0 && (Date.now() - t0ms) / 1000 > MAXSECS) { timeCapped = true; break; }
      const kTop = heapK[0];
      const t = hpop();
      if (kTop > lastKey + 1e-12) keyInversions += 1;
      lastKey = kTop;
      if (!alive[t]) continue;
      if (ta.length >= triCap) { capped = true; break; }
      created.length = 0;
      if (DIRECTED) refineDirected(t); else refineLepp(t);
      // V2-L1. Last chance before this facet is frozen into the STL, and only for facets ordinary
      // refinement has already given up on. Inert when PF_CB_LASTCHANCE=0.
      if (created.length === 0) lastChanceSplit(t);
      for (const nt of created) consider(nt);
      // RE-QUEUE THE SURVIVOR WITHOUT RE-MEASURING IT. `consider(t)` here re-ran the whole bounded probe on a
      // triangle that refinement left ALIVE — i.e. one whose three vertex indices and whose vertex coordinates
      // are both unchanged (vertices are never moved, and `killT`/`addT` never rewrite a live triangle's
      // corners during refinement; the collapse and flip passes that do run only after this loop). `sagBounded`
      // — and equally `sagPtPerp` / `sagAdaptive` / `sagOfN`, i.e. EVERY CPU rank mode — is a pure function of
      // exactly that data plus `acceptTol`, so it necessarily returns the same double it
      // returned when this triangle was pushed — which is `kTop`, the key it was just popped at. Pushing
      // `kTop` directly is the identical heap operation for zero rA evaluations. `kTop > acceptTol` holds
      // because t was in the heap at all, so the `s > acceptTol` test it replaces cannot change either.
      // THE SAME ARGUMENT SURVIVES PF_CB_TIGHTEN VERBATIM. `localAcceptTol(t)` is a pure function of t's three
      // vertex COORDINATES (via the bounding sphere) and of the loci file, neither of which changes while t
      // stays alive, so the local threshold it was admitted under is still the threshold it would be tested
      // against. Nothing here needs to know whether a field exists.
      if (created.length > 0) {
        if (alive[t] && !GPU_RANK && Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])) >= FLOOR_MM) { bsReuse += 1; hpush(t, kTop); } else consider(t);
        unresolved.delete(t);
      }
      iters += 1;
      // NOT CONVERGED, NOT CONVERGED-AND-QUIET. When refinement produces nothing the over-tolerance triangle is
      // simply gone: `consider` is only ever called on split PRODUCTS, so it is never re-queued and "heap: 0
      // left" then reads as convergence. MEASURED: 563 600 dropped = 20.1 % of split attempts. Record it with
      // the key it was popped at instead of re-queueing — re-queueing spins forever on the same refusal.
      if (created.length === 0) { stuck += 1; unresolved.set(t, kTop); unresolvedWhy.set(t, classifyStrand(t)); }
      // PROGRESS TO A FILE (PF_CB_PROGRESS=<path>), not just to stdout. Vitest buffers a worker's stdout
      // until the test ends, so on a multi-hour run console.log tells you NOTHING while it matters — and
      // the only question that matters mid-run is whether the heap is DRAINING or GROWING. `heap` and
      // `worstLeft` here are that answer, sampled over time: a converging run shows both falling.
      if ((DEBUG || PROGRESS !== '') && iters % 50000 === 0) {
        let al = 0; for (let k = 0; k < alive.length; k += 1) if (alive[k]) al += 1;
        let wl = 0; for (let i = 0; i < heapK.length; i += 1) if (heapK[i] > wl) wl = heapK[i];
        const line = `${((Date.now() - t0ms) / 1000).toFixed(0)}s splits=${iters} alive=${al} alloc=${ta.length} heap=${heapT.length} worstLeft=${(wl * 1000).toFixed(1)}um rA=${(rEvals / 1e6).toFixed(0)}M${GPU_RANK ? ` pend=${pend.length} gpuScored=${gpuScored} gpuS=${((gpu?.stats.wallMs ?? 0) / 1000).toFixed(0)}` : ''}`;
        // eslint-disable-next-line no-console
        if (DEBUG) console.log(`   … ${line}`);
        if (PROGRESS !== '') { try { appendFileSync(PROGRESS, `${line}\n`); } catch { /* progress logging must never kill the run */ } }
      }
    }

    let heapLeftMax = 0;
    for (let i = 0; i < heapT.length; i += 1) if (alive[heapT[i]] && heapK[i] > heapLeftMax) heapLeftMax = heapK[i];
    // Only the SURVIVORS count: a recorded triangle can still have been re-meshed afterwards by a neighbouring
    // edge split (bisectAt splits every incident triangle), and those are genuinely resolved.
    let unresolvedLeft = 0; let unresolvedMax = 0;
    // S25: the snapshot rides along in this exact loop, so the emitted `atReduction` count is the SAME
    // traversal that produces the reported scalar and cannot drift from it. Push only — no mesh state is
    // read or written — so the flag-OFF path is unchanged and the ON path cannot move a vertex.
    for (const [t, k] of unresolved) if (alive[t]) {
      unresolvedLeft += 1; if (k > unresolvedMax) unresolvedMax = k;
      if (EMIT_UNRESOLVED) unresolvedSnap.push([t, k]);
    }
    // §2.5 "worst-left" GENUINELY DISAPPEARS UNDER `sweep` AND THAT IS A REAL LOSS. With no key, a capped run
    // cannot report the worst residual for free. Replacement: ONE bounded pass over the live remainder of the
    // queue, reported as `worst-left (edge ruler, LOWER BOUND)` — NEVER as a residual estimate. §6.4: the
    // anytime property is given up for real here, and it must not be papered over.
    let queueLeft = 0; let queueWorstSag = 0;
    const unresolvedByWhy = new Map<string, number>();
    // ═══ S26 — THE REASONS HISTOGRAM IS UN-GATED FROM `SWEEP`. ═══
    // It was built inside the `if (SWEEP)` block below, so it only ever ran on the sweep driver — while
    // EVERY production arm in this campaign is the HEAP driver. The histogram that would have shown the
    // `unknown` bucket was therefore dark on exactly the runs that had one. REPORT-ONLY: it reads the map
    // and writes a counter, touching no mesh state, so it cannot move a byte on any path.
    for (const [t] of unresolved) {
      if (!alive[t]) continue;
      const why = unresolvedWhy.get(t) ?? 'unknown';
      unresolvedByWhy.set(why, (unresolvedByWhy.get(why) ?? 0) + 1);
    }
    if (SWEEP) {
      const size = qTail - qHead;
      for (let i = 0; i < size; i += 1) {
        const t = qBuf[(qHead + i) & qMask];
        if (!alive[t]) continue;
        queueLeft += 1;
        const s = worstEdgeSag(t);
        if (s > queueWorstSag) queueWorstSag = s;
      }
      // S26: the reasons histogram that used to be built HERE now runs unconditionally above, because this
      // block only ever executed on the sweep driver and every production arm is the heap driver.
    }

    // Release the browser as soon as refinement is done — the audit phase below can run for many minutes and
    // has no use for it. `parityUm` and the counters are captured first because the handle goes away.
    const gpuLine = gpu === null ? '' :
      `gpu-rank: n=${GR_N} gn=${GR_GN} covfrac=${GR_COVFRAC} margin=${(GR_MARGIN * 1000).toFixed(3)}µm  scored ${gpuScored} in ${gpuFlushes} flushes / ${gpu.stats.batches} dispatches   ${(gpu.stats.gpuMs / 1000).toFixed(0)}s GPU + ${((gpu.stats.wallMs - gpu.stats.gpuMs) / 1000).toFixed(0)}s transport   rA parity ${gpu.parityUm.toFixed(3)}µm   device-losses ${gpu.stats.deviceLosses}`;
    if (gpu !== null) { await gpu.close(); gpu = null; }

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
    // S5 CAP-REPAIR instrumentation (see PF_CB_SHAPE_FLIP above).
    let capBefore = 0; let capAfter = 0; let capFlipTried = 0; let capFlipDone = 0;
    let capWorstBefore = 0; let capWorstAfter = 0;
    // ───────── S6  POST-LOOP SHAPE INVARIANT — counters, then the collapse's admission test ─────────
    // Every refusal is COUNTED and every count is PRINTED. A refusal that leaves a facet over the cap is
    // reported on its own (`nPostCollapseRefusedDirty`), because "the guard declined and the blade stayed"
    // is a different fact from "the guard declined and the mesh is clean", and only the first one explains a
    // blade-gate count.
    let nPostCollapseTested = 0; let nPostCollapseRefusedAR = 0; let nPostCollapseRefusedFold = 0;
    let nPostCollapseRefusedDirty = 0;   // ... of the aspect refusals, how many left a facet ALREADY over the cap
    let nPostFlipTested = 0; let nPostFlipRefusedAR = 0;
    let postWorstAdmitted = 0;           // the largest AR any ADMITTED post-loop operation left behind
    // ───────── S6-PILOT (2026-07-30, PRE-REGISTERED): SLIVER COLLAPSE-AND-RESUME — flags + counters ─────────
    // Default OFF; heap driver only (the resume loop mirrors its pop step, so SWEEP/GPU_RANK are excluded).
    const SLIVER_COLLAPSE = envOn('PF_CB_SLIVER_COLLAPSE') && !SWEEP && !GPU_RANK;
    const SLIVER_AR = envF('PF_CB_SLIVER_AR', SHAPE_AR / 2);
    const SLIVER_MAX_MM = envF('PF_CB_SLIVER_MAXEDGE_UM', 5) / 1000;
    const SLIVER_RESUME_BUDGET = Math.round(envF('PF_CB_SLIVER_RESUME_BUDGET', 20000));
    let sliverRan = false;
    let sliverTested = 0; let sliverCollapsed = 0; let sliverRefusedLen = 0; let sliverRefusedOther = 0;
    let sliverResumeSplits = 0; let sliverResumeBudgetUsed = 0; let sliverResumeCapped = false;
    let sliverOffendersBefore = 0; let sliverOffendersAfter = 0;
    let sliverUnresolvedAfter = 0; let sliverUnresolvedWorstAfter = 0;
    // ── S7-PILOT (2026-07-30, second iteration — same session): CONFORMING FLIP of fossil crossing edges.
    // The S6 pilot measured the offender class as 100% long-edged (1,888/1,888 refused on the 5 µm motion
    // bound; zero needles): the artefacts are FOSSILS of the initial grid — bay-to-bay edges that CROSS a
    // locus, surviving as bridge pairs while refinement built the conforming corridor beside them (edge
    // lengths quantized at grid-pitch/2^k: ~675-725 µm; four θ-copies; human-visible as red sliver trains).
    // The repair primitive for a bridged crossing is the 2-2 FLIP of the crossing edge: zero vertex motion
    // (zero H1 risk, zero budget), conforming restored, pair AR improved. tryFlip already exists with locus
    // safety and winding checks — S5 just never calls it below AR 50, and the fossils live at AR 6-23.
    const CONF_FLIP = envOn('PF_CB_CONF_FLIP') && !SWEEP && !GPU_RANK;
    let confFlipRan = false;
    let confFlipCand = 0; let confFlipDone = 0; let confFlipRefused = 0; let confFlipPasses = 0;
    // ── S8-PILOT (2026-07-30, third iteration): CASCADE-SPLIT of fossil crossing edges AT the crossing.
    // The three refutation-grade measurements that force this design: CTLPLUS (more refinement alone GROWS
    // the class, 211 → 294), S6 (the class contains ZERO collapsible needles — 100% long-edged), S7
    // (rotating the crossing edge feeds the class ×1.44 — a fossil quad's OTHER diagonal is also a
    // bay-to-bay bridge). What a fossil needs is its crossing edge SPLIT AT THE CROSSING — which is what
    // SNAP has always tried — with the neighbour-degradation refusal resolved by CASCADING the split to
    // the protecting neighbour. S4's own counter measured the deadlock this discharges: in ~95% of refused
    // splits BOTH candidate edges were inadmissible, because in a sliver train along a locus your longest
    // edge is your degenerate neighbour's SHORT edge — a mutual protection the one-edge-at-a-time guard
    // cannot see past. The cascade is Rivara's own resolution (LEPP as a CONFORMITY OBLIGATION at fossil
    // sites, not as a ranking policy — the 2026-07-29 LEPP refutation was about RANKING): midpoint-split
    // the protector's LONGEST edge first (the measured ×0.99-amplification move), recursively and
    // depth-capped, then retry the crossing split. Every split goes through `bisectAt`, so S1/S2 score
    // every child on both sides and the pass CANNOT manufacture the defect class it repairs.
    const FOSSIL_CASCADE = envOn('PF_CB_FOSSIL_CASCADE') && !SWEEP && !GPU_RANK;
    const FOSSIL_DEPTH = Math.round(envF('PF_CB_FOSSIL_DEPTH', 12));      // max protector obligations per site
    const FOSSIL_BUDGET = Math.round(envF('PF_CB_FOSSIL_BUDGET', 40000)); // gross allocs the pass may add
    const FOSSIL_PASSES = Math.round(envF('PF_CB_FOSSIL_PASSES', 3));     // outer sweeps (S7 convention)
    let fossilRan = false; let fossilPasses = 0;
    let fossilCand = 0; let fossilConformed = 0; let fossilProximity = 0;
    let fossilSplits = 0; let fossilCascadeSplits = 0; let fossilRetreatSplits = 0;
    let fossilDeadlocked = 0; let fossilRefusedOther = 0; let fossilDepthMax = 0;
    // deadlock CAUSE split (S8-PROD2): depth cap hit / attempt cap hit / self-blocked (a triangle whose
    // own longest edge is the blocked edge refused even the Rivara midpoint). Sums to fossilDeadlocked.
    let fossilDeadDepth = 0; let fossilDeadAttempts = 0; let fossilDeadSelf = 0;
    let fossilAllocUsed = 0; let fossilBudgetCapped = false;
    // ══════ S22 (2026-07-31) — THE DE-SHARD FINISHING PASS (PF_CB_DESHARD, DEFAULT OFF) ══════
    // REGISTERED BEFORE IT WAS BUILT (worklog "S22 (PHASE D-PREP)"), on the operator's `_S21B` verdict:
    // "S21B is better but the tessellation is still not perfect. i think we need to eliminate this sharded
    // meshing." Every census in this campaign keys on AREA x STANDOFF and reads 0 at the 0.02 mm^2 visible
    // floor; the eye keys on LENGTH. A 2 mm x 15 um needle carries a thousandth of the visible-AREA floor
    // and glints across a render. So the pass targets the LENGTH-keyed population directly:
    //   (i)  SUBDIVISION — a facet over the length bar is split at its LONGEST edge, recursively, and every
    //        child goes through `bisectAt` => S1 aspect + S2 (theta,z) fold + the S20 split-side
    //        footprint-normal admission on the SHIPPED f32 values. A refused parent is RECORDED with its
    //        reason, never silently kept.
    //   (ii) IMPROVEMENT-GATED FLIPS over the FAN worklist — the census's own high-degree hubs. Gate:
    //        worst-AR STRICTLY decreases AND both children are admissible. Zero vertex motion, zero live
    //        triangle growth, so a flip cannot buy shape with fidelity.
    //
    // *** WHY THIS IS SAFE NOW WHEN REFINEMENT AND FLIPS HISTORICALLY FED THIS EXACT CLASS. *** CTLPLUS
    // measured that generic extra refinement made the artifact class WORSE (211 -> 294) and S7's conforming
    // flip made it worse x1.44 — both because refinement and flipping BIRTH orientation defects at exactly
    // the feature loci they target. `_S21B` then measured the orientation class UNBIRTHABLE under composed
    // admission: 26,434 candidate children REFUSED by the split-side guard, 0 survivors of 1,247,786, judge
    // -confirmed [NORMAL] PASS count 0 against an EMPTY strand list. The CTLPLUS law is defused BY
    // CONSTRUCTION, not by hope. **THAT PRECONDITION IS THEREFORE ENFORCED AND NOT ASSUMED**: the pass
    // REFUSES TO RUN unless ADMIT_NORMAL + ADMIT_NORMAL_SPLIT + ADMIT_SHIPPED are all on, because with
    // admission off the justification lapses with it and this pass becomes the CTLPLUS experiment again.
    const DESHARD_REQ = ADMIT_NORMAL && ADMIT_NORMAL_SPLIT && ADMIT_SHIPPED;
    const DESHARD = envOn('PF_CB_DESHARD') && !SWEEP && !GPU_RANK && DESHARD_REQ;
    // S22B (2026-07-31) — THE BAR IS LOWERED 1.5 -> 1.0 mm, AND IT IS DERIVED, NOT GUESSED. `_S22A` fell
    // 123 -> 29 on the 1.5 mm bar while the LOOSE band moved only x0.969, because — measured on `_S22A` —
    // the photographed sub-floor population's LONGEST facet is 1,285 um and the bar was 1,500 um. **The bar
    // sat above the entire population it was meant to reach.** Their length p05/p10 is 1,010/1,017 um, so
    // L_B = 1.0 mm covers 232 of 232 = 100%. `PF_CB_DESHARD_LMM=1.5` reproduces `_S22A`'s bar exactly.
    // K STAYS AT 20 AND THAT CLAUSE IS NOW LOAD-BEARING IN A WAY IT WAS NOT AT 1.5 mm: the designed lattice
    // spans 1,068-2,921 um, so at 1.0 mm the LENGTH clause no longer separates intended geometry from
    // defects and only the AR clause does. Measured on `_S22A`: the bar catches 7 lattice elements at
    // K = 12 (worst AR3 12.3) and ZERO at K = 20 — 1.63x of clearance. Do not lower K.
    const DESHARD_L = envF('PF_CB_DESHARD_LMM', 1.0);          // L_B — DERIVED from the photographed set
    const DESHARD_AR = envF('PF_CB_DESHARD_AR', 20);           // K — the ONLY thing separating the designed
    const DESHARD_DEV = envF('PF_CB_DESHARD_DEV', 45);         //     1,101/385 um lattice from a defect
    const DESHARD_DEPTH = Math.round(envF('PF_CB_DESHARD_DEPTH', 4));    // registered recursion bound
    // S22B: 2,000 -> 8,000 NEW LIVE triangles. Derived, not inflated: `_S22A` converted 101 candidates into
    // 72 splits and +144 live (1.43 live per candidate), so 838 candidates project to ~1,200 and 8,000 is
    // 6.7x headroom at +0.64% of the mesh. S22 spent 7% of its budget; this one is meant to be spent.
    const DESHARD_BUDGET = Math.round(envF('PF_CB_DESHARD_BUDGET', 12000));
    // S22C — S8's PROTECTOR CASCADE, WIRED. Default ON, but only reachable when PF_CB_DESHARD (itself
    // DEFAULT OFF) is on, so no default moves; `PF_CB_DESHARD_CASCADE=0` reproduces `_S22B` exactly.
    const DESHARD_CASCADE = process.env.PF_CB_DESHARD_CASCADE !== '0';
    const DESHARD_CASDEPTH = Math.round(envF('PF_CB_DESHARD_CASDEPTH', 12));   // S8's own FOSSIL_DEPTH
    const DESHARD_FANDEG = Math.round(envF('PF_CB_DESHARD_FANDEG', 12));
    const DESHARD_FANLONG = envF('PF_CB_DESHARD_FANLONG_UM', 500) / 1000;
    const DESHARD_FANPASSES = Math.round(envF('PF_CB_DESHARD_FANPASSES', 6));
    let deshardRan = false;
    let deshardBefore = 0; let deshardAfter = 0;
    let deshardTried = 0; let deshardSplits = 0; let deshardRefused = 0;
    let deshardRefAR = 0; let deshardRefFold = 0; let deshardRefAdmit = 0; let deshardRefOther = 0;
    // THE BUDGET IS BILLED IN **NEW LIVE TRIANGLES**, WHICH IS THE REGISTERED QUANTITY (W6: "<= ~2,000 new
    // triangles, i.e. < 0.2% of 1,247,786" and "live tris <= 1,300,000"). Gross allocations are NOT the
    // same number and billing them would silently halve the budget: `bisectAt` kills each incident triangle
    // and emits two per side, so an interior split allocates 4 and adds 2. The flip sub-pass allocates 2 and
    // adds 0 — it is net-zero in the registered quantity by construction — so gross allocations are reported
    // SEPARATELY for each sub-pass rather than summed into one misleading total. (Measured on the T1 smoke,
    // where the summed form read "+6,536 of 2,000 BUDGET-CAPPED" while the subdivision had in fact stopped
    // dead on its budget and the other 4,536 were the flips' churn.)
    let deshardDepthMax = 0; let deshardLiveAdded = 0; let deshardBudgetCapped = false;
    let deshardAllocSub = 0; let deshardAllocFan = 0;
    let deshardFanBefore = 0; let deshardFanAfter = 0; let deshardFanPassesRun = 0;
    let deshardFanCand = 0; let deshardFanFlipped = 0;
    let deshardFanRefAR = 0; let deshardFanRefAdmit = 0; let deshardFanRefValid = 0;
    // S22B (c) — THE ON-LOCUS SPOKE PATH, counted on its own lines and never merged with the flips.
    // `_S22A` measured 594 flip attempts refused because the spoke lies ON a detected locus. That refusal
    // is CORRECT — rotating a locus edge undoes the conforming corridor the whole pipeline exists to
    // produce — but it left those fans untreated. A fan anchored on a locus cannot ROTATE its edges; it
    // can SHORTEN them. A midpoint split of an on-locus spoke moves no vertex off its locus and adds one
    // ON it, and it reduces the FAN census for the right reason rather than by evading it: the census
    // counts vertices carrying >= 12 facets with an edge >= 500 um, so halving a 900 um spoke drops that
    // facet out of the long-edged set because the edge really is shorter.
    let deshardFanLocus = 0; let deshardFanLocusSplit = 0;
    let deshardFanLocusShort = 0; let deshardFanLocusRefused = 0;
    // S22C — the protector cascade's own counters. `casConformed` is the number the registered <= 30%
    // prediction is scored against; `casSelfBlocked` is S8's measured production failure mode (the
    // offender's longest edge IS the blocked edge, so there is no protector to refine and no re-centring
    // available at a midpoint split); `casDepthHist` shows whether the ladder actually climbed.
    let casSites = 0; let casConformed = 0; let casProtectorSplits = 0;
    let casSelfBlocked = 0; let casDepthCapped = 0; let casAttemptCapped = 0; let casOther = 0;
    let casDepthMax = 0; const casDepthHist = new Array<number>(16).fill(0);
    let deshardSplitsViaCascade = 0; let deshardFanLocusViaCascade = 0;
    /** the parents the pass could NOT discharge — printed, so a survivor is declared and never silent. */
    const deshardRefusedLog: string[] = [];
    /**
     * S6. Would collapsing v onto u make the shape of the facets it TOUCHES worse?
     *
     * TOUCHED = the live triangles in v's star that SURVIVE the collapse, i.e. every triangle containing v
     * except those that also contain u (the `dying` set — those are deleted outright). Each is compared
     * against ITSELF with v rewritten to u, so a deleted blade can never license raising a survivor to its
     * aspect ratio. See the invariant note at PF_CB_POST_SHAPE for why both clauses are needed.
     *
     * A triangle in the star but not dying cannot contain u (a triangle containing both u and v is shared by
     * definition), so the rewritten corners are always three distinct vertices; `aspect3` returning Infinity
     * here would mean a genuinely zero-area facet, which the test then correctly refuses.
     *
     * Returns 'ok' | 'ar' | 'fold'. NO MESH STATE IS TOUCHED, so a refusal costs nothing to undo — the same
     * property that lets `shapeAdmits` refuse before `addV`.
     */
    const postCollapseAdmits = (
      u: number, v: number, star: Iterable<number>, dying: ReadonlySet<number>,
    ): 'ok' | 'ar' | 'fold' => {
      let wB = 0; let wA = 0; let nB = 0; let nA = 0; let fold = false;
      for (const t of star) {
        if (!alive[t] || dying.has(t)) continue;
        const a0 = ta[t]; const b0 = tb[t]; const c0 = tc[t];
        const a1 = a0 === v ? u : a0; const b1 = b0 === v ? u : b0; const c1 = c0 === v ? u : c0;
        const arB = aspect3(vx[a0], vy[a0], vz[a0], vx[b0], vy[b0], vz[b0], vx[c0], vy[c0], vz[c0]);
        const arA = aspect3(vx[a1], vy[a1], vz[a1], vx[b1], vy[b1], vz[b1], vx[c1], vy[c1], vz[c1]);
        if (arB > wB) wB = arB;
        if (arA > wA) wA = arA;
        if (arB > SHAPE_AR) nB += 1;
        if (arA > SHAPE_AR) nA += 1;
        if (SHAPE_FOLD && !fold) {
          // Same test S2 applies at a split, on the same anchoring: the triangle's own corner order, before
          // and after. A sign change is a FOLD by construction — the mesh is a triangulation of the (theta,z)
          // cylinder, so the sign IS the orientation.
          const sB = signedAreaParam(vth[a0], vz[a0], vth[b0], vz[b0], vth[c0], vz[c0]);
          const sA = signedAreaParam(vth[a1], vz[a1], vth[b1], vz[b1], vth[c1], vz[c1]);
          if (Math.sign(sA) !== Math.sign(sB)) fold = true;
        }
      }
      if (fold) return 'fold';
      if (wA > wB || nA > nB) { if (nB > 0) nPostCollapseRefusedDirty += 1; return 'ar'; }
      if (wA > postWorstAdmitted) postWorstAdmitted = wA;
      return 'ok';
    };
    /** the mesh triangle's own `aspect3`, i.e. the census's AR read off the live arrays. */
    const arTri = (t: number): number => aspect3(
      vx[ta[t]], vy[ta[t]], vz[ta[t]], vx[tb[t]], vy[tb[t]], vz[tb[t]], vx[tc[t]], vy[tc[t]], vz[tc[t]],
    );
    /**
     * S22. The LENGTH-KEYED SHARD instrument, as a live predicate on triangle `t`.
     *
     *     SHARD := longest 3-D edge >= L_vis  AND  (deviation >= D  OR  3-D AR >= K)
     *
     * with the REGISTERED constants L_vis = 1.5 mm, D = 45 deg, K = 20. Length is what makes a facet
     * VISIBLE; the second clause is what makes it a DEFECT rather than a legitimately long facet on a flat
     * region — without it the bar would condemn every large well-shaped element on smooth wall.
     *
     * WHY K = 20 AND NOT 12, AND IT IS A MEASUREMENT: on `_S21B`, six of the fifteen longest facets read
     * AR3 exactly 12.0 at area 0.212 mm^2 and deviation 0.12-0.26 deg — the aligned seed's DESIGNED
     * anisotropic elements (along 1,101 um / across 385 um). A bar at AR3 >= 12 would declare the mesh's
     * own intended anisotropy a defect and could never be satisfied. K = 20 sits above that band and below
     * the p99 of 30.0, so it is derived from the distribution rather than chosen.
     *
     * THE AR IS `arTri` — i.e. `_shapeGuard.aspect3`, longestEdge * perimeter / (4 * area) — which is
     * VERBATIM the offline census's AR3. Guard and instrument therefore measure the same object, which is
     * this campaign's standing rule ("the refinement ruler must equal the audit ruler").
     *
     * The deviation clause is evaluated ONLY when the AR clause has already failed (it costs five rA evals
     * and the AR clause costs none), and on the SHIPPED f32 values when PF_CB_ADMIT_SHIPPED is on — the
     * S20.1 finding is that an f32 ulp on z ~ 80 mm is seven times `admBestDot`'s 1e-6 stencil, so a
     * deviation read on f64 vertices is a reading about a mesh that never leaves the process.
     */
    const shardOf = (t: number): boolean => {
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      if (Math.max(eLen(a, b), eLen(b, c), eLen(c, a)) < DESHARD_L) return false;
      if (arTri(t) >= DESHARD_AR) return true;
      if (!(DESHARD_DEV < 180)) return false;
      const qz = (v: number): number => (ADMIT_SHIPPED ? f32(v) : v);
      const px = qz(vx[a]); const py = qz(vy[a]); const pz = qz(vz[a]);
      const qx = qz(vx[b]); const qy = qz(vy[b]); const qq = qz(vz[b]);
      const sx = qz(vx[c]); const sy = qz(vy[c]); const sz = qz(vz[c]);
      let fx = (qy - py) * (sz - pz) - (qq - pz) * (sy - py);
      let fy = (qq - pz) * (sx - px) - (qx - px) * (sz - pz);
      let fz = (qx - px) * (sy - py) - (qy - py) * (sx - px);
      const fl = Math.hypot(fx, fy, fz);
      if (!(fl > 0)) return false;                       // zero-area is S1/S2's business, not this bar's
      fx /= fl; fy /= fl; fz /= fl;
      const cth = canonTheta(Math.atan2((py + qy + sy) / 3, (px + qx + sx) / 3));
      const d = admBestDot(cth, (pz + qq + sz) / 3, fx, fy, fz);
      return Math.acos(Math.max(-1, Math.min(1, d))) * (180 / Math.PI) >= DESHARD_DEV;
    };
    /** S22. Does `t` carry a long edge at the FAN instrument's threshold (>= 500 um by default)? */
    const fanLong = (t: number): boolean =>
      Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])) >= DESHARD_FANLONG;
    /** S22. The FAN census: vertices shared by >= FANDEG live facets that each carry a long edge. */
    const fanCensus = (): Map<number, number> => {
      const deg = new Map<number, number>();
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t] || !fanLong(t)) continue;
        for (const v of [ta[t], tb[t], tc[t]]) deg.set(v, (deg.get(v) ?? 0) + 1);
      }
      for (const [v, d] of deg) if (d < DESHARD_FANDEG) deg.delete(v);
      return deg;
    };
    /** S22. The live shard count — the pass's own before/after reading of the registered instrument. */
    const shardCensus = (): number => {
      let n = 0;
      for (let t = 0; t < ta.length; t += 1) if (alive[t] && shardOf(t)) n += 1;
      return n;
    };
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
      /**
       * locus-safe 2-2 flip of edge (pv,qv); returns true if performed. Keeps nbr/vTris consistent.
       *
       * `gate` (added 2026-07-29 for the S5 cap repair) is consulted AFTER every validity test and BEFORE
       * any mutation, with the two apexes the flip would join. Omitted ⇒ the collapse path's behaviour is
       * unchanged, which matters because that path is the one PF_CB_FLIP has always driven.
       */
      const tryFlip = (pv: number, qv: number, gate?: (r0: number, s0: number) => boolean): boolean => {
        const inc = (edgeMap.get(eKey(pv, qv)) ?? []).filter((t) => alive[t]);
        if (inc.length !== 2) return false;
        const apexOf = (t: number): number => (ta[t] !== pv && ta[t] !== qv ? ta[t] : tb[t] !== pv && tb[t] !== qv ? tb[t] : tc[t]);
        // TRAVERSAL DIRECTION, MEASURED not assumed. The emitted pair (r0,pv,s0)+(s0,qv,r0) is only correctly
        // wound if inc[0] traverses pv→qv; the code asserted that in a comment and never checked it, so for the
        // half of the incident pairs stored the other way round the flip emitted REVERSED triangles into an
        // otherwise consistent mesh — invisible to every check in this file, since `analyze` was incidence-only.
        // Identify the pv→qv triangle and call ITS apex r0; refuse when both (or neither) run the same way,
        // because that pair is already inconsistently oriented and a blind flip cannot repair it.
        const runsPQ = (t: number): boolean => { const s = [ta[t], tb[t], tc[t]]; for (let i = 0; i < 3; i += 1) if (s[i] === pv && s[(i + 1) % 3] === qv) return true; return false; };
        const f0 = runsPQ(inc[0]);
        if (f0 === runsPQ(inc[1])) return false;
        const r0 = apexOf(f0 ? inc[0] : inc[1]); const s0 = apexOf(f0 ? inc[1] : inc[0]);
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
        if (gate !== undefined && !gate(r0, s0)) return false; // S5: caller-supplied improvement test
        // winding: r0 is now the apex of the pv→qv triangle (checked above), so the quad is qv → r0 → pv → s0
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
      /**
       * S6 for the COLLAPSE-DRIVEN flip — the one `tryFlip` call site that passes no gate at all.
       *
       * `tryFlip` already refuses a FOLD (it sign-checks both new triangles in (theta,z) against the pair's
       * reference sign), so this adds only the ASPECT half, which nothing bounded before.
       *
       * The two emitted triangles are (r0,pv,s0) and (s0,qv,r0) — the winding `tryFlip` commits to below —
       * and the two `aspect3` calls are the S5 cap-repair gate's expressions VERBATIM, in the same operand
       * order, so the two gates measure the same object the same way.
       *
       * Returns `undefined` when the lever is off, which is the exact un-gated call this site has always
       * made: `tryFlip` skips its `gate !== undefined` branch entirely and the path is byte-identical.
       */
      const postFlipGate = (pv: number, qv: number): ((r0: number, s0: number) => boolean) | undefined => {
        if (!POST_SHAPE) return undefined;
        return (r0: number, s0: number): boolean => {
          nPostFlipTested += 1;
          let wB = 0; let nB = 0;
          for (const x of edgeMap.get(eKey(pv, qv)) ?? []) {
            if (!alive[x]) continue;
            const ar = arTri(x);
            if (ar > wB) wB = ar;
            if (ar > SHAPE_AR) nB += 1;
          }
          const a1 = aspect3(vx[r0], vy[r0], vz[r0], vx[pv], vy[pv], vz[pv], vx[s0], vy[s0], vz[s0]);
          const a2 = aspect3(vx[s0], vy[s0], vz[s0], vx[qv], vy[qv], vz[qv], vx[r0], vy[r0], vz[r0]);
          const wA = Math.max(a1, a2);
          const nA = (a1 > SHAPE_AR ? 1 : 0) + (a2 > SHAPE_AR ? 1 : 0);
          if (wA > wB || nA > nB) { nPostFlipRefusedAR += 1; return false; }
          if (wA > postWorstAdmitted) postWorstAdmitted = wA;
          return true;
        };
      };
      const shortEdges: Array<[number, number, number]> = [];
      const seenE = new Set<number>();
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        for (const [p, qv] of [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]] as Array<[number, number]>) {
          // BOUNDED DEDUP: length-test FIRST, and only dedup the SHORT edges. Deduping every edge put ~1.5 entries
          // per live triangle into the Set and blew V8's 2^23 Set cap ("RangeError: Set maximum size exceeded")
          // at ~7.7M live triangles — measured on GyroidManifold, and the same failure mode already fixed once in
          // detectSelfIntersections. Short edges are rare by construction, so the Set stays tiny. Identical result:
          // the same unique short edges are collected; eLen is just evaluated once per incident triangle.
          const L = eLen(p, qv);
          if (L >= SAFE_MM) continue;
          const k = eKey(p, qv);
          if (seenE.has(k)) continue;
          seenE.add(k);
          shortEdges.push([L, p, qv]);
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
            // S6: the shape gate. `postFlipGate` returns undefined when PF_CB_POST_SHAPE is off, which is the
            // exact un-gated call this line has always made — so the OFF path is byte-identical.
            if (tryFlip(u, w, postFlipGate(u, w)) || tryFlip(v, w, postFlipGate(v, w))) flipsDone += 1;
          }
          bad = offenders();
        }
        if (bad.length > 0) { refusedCollapses += 1; refusedOffenders += bad.length; continue; }
        // ───────── S6: the collapse is TOPOLOGY-safe by here; make it SHAPE-safe too ─────────
        // Everything above proves the LINK CONDITION and nothing above looks at the geometry the collapse
        // produces — yet moving v onto u rewrites every surviving triangle in v's star. This is the guard the
        // 2026-07-29 review named as UNFIXED. It runs BEFORE any mutation, so a refusal costs nothing to undo.
        //
        // ONE CARVE-OUT, AND IT IS NOT A COMPROMISE. A collapse of an edge SHORTER THAN WELD_MM is never
        // refused on shape. Below the weld radius the two endpoints are literally ONE POINT to `analyze()`
        // and to any downstream slicer (both position-weld at exactly this WELD_MM), so declining the
        // collapse preserves nothing: it leaves the pair for the position weld to merge, which is what turns
        // the shared edges NON-MANIFOLD — the measured 215-edge failure this whole pass exists to prevent,
        // and the thing `expect(nonManifold).toBe(0)` at the end of this file asserts against. A sub-weld
        // collapse is a topology obligation, not a shape decision. (PF_CB_NEEDLE_UM is 0.2 um and WELD_MM is
        // 0.05 um, so the carve-out covers the bottom quarter of the collapse band, not the whole of it.)
        if (POST_SHAPE && eLen(u, v) >= WELD_MM) {
          nPostCollapseTested += 1;
          const shapeVerdict = postCollapseAdmits(u, v, sv, new Set(shared));
          if (shapeVerdict === 'ar') { nPostCollapseRefusedAR += 1; continue; }
          if (shapeVerdict === 'fold') { nPostCollapseRefusedFold += 1; continue; }
        }
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

      // ───────── S5  CAP-TARGETED SHAPE REPAIR (PF_CB_SHAPE_FLIP) — and the measurement that prices it ─────────
      // The diagnosis observed "PF_CB_FLIP defaults OFF, so tryFlip — the natural repair for a cap — never
      // ran". Enabling PF_CB_FLIP does NOT fix that, and the reason is structural rather than empirical:
      // tryFlip is reachable ONLY from the loop above, which iterates `shortEdges` — edges shorter than
      // PF_CB_NEEDLE_UM (0.2 um) — and only for the offenders blocking a collapse. A CAP blade has all three
      // edges long by construction (measured p50 longest 400 um), so it never enters that list and tryFlip
      // is never called on it, whatever PF_CB_FLIP is set to. `flips 0` in the run report is that fact.
      //
      // So the repair needs its OWN entry point, which is this pass: for every facet still over the cap,
      // attempt the locus-safe 2-2 flip of its LONGEST edge — for a cap (one near-straight-angle vertex)
      // that is the edge opposite the flat vertex, and swapping the quad's diagonal is the textbook repair.
      // The flip is GATED on actually improving the pair's worst AR, so it can only ever make the mesh
      // better by the census's own metric; and `capBefore`/`capAfter` are reported so "does it repair caps"
      // is answered with a number in every run instead of being assumed.
      // tryFlip's existing refusals all stand: not exactly 2 incident, apexes equal, the opposite edge
      // already present (which would pinch), the edge lying ON a locus (that would undo the conforming this
      // pipeline exists to produce), a non-convex quad, and an inconsistently-wound pair.
      for (let t = 0; t < ta.length; t += 1) if (alive[t]) { const ar = arTri(t); if (ar > SHAPE_AR) capBefore += 1; if (ar > capWorstBefore) capWorstBefore = ar; }
      if (SHAPE_FLIP && capBefore > 0) {
        const bad: Array<[number, number]> = [];
        for (let t = 0; t < ta.length; t += 1) if (alive[t] && arTri(t) > SHAPE_AR) bad.push([arTri(t), t]);
        bad.sort((x, y) => y[0] - x[0]); // worst first
        for (const [, t] of bad) {
          if (!alive[t]) continue; // a previous flip may already have re-meshed it
          const e = longestE(t); const [pv, qv] = eVerts(t, e);
          const inc = (edgeMap.get(eKey(pv, qv)) ?? []).filter((x) => alive[x]);
          if (inc.length !== 2) continue;
          const arOld = Math.max(arTri(inc[0]), arTri(inc[1]));
          capFlipTried += 1;
          const ok = tryFlip(pv, qv, (r0, s0) => Math.max(
            aspect3(vx[r0], vy[r0], vz[r0], vx[pv], vy[pv], vz[pv], vx[s0], vy[s0], vz[s0]),
            aspect3(vx[s0], vy[s0], vz[s0], vx[qv], vy[qv], vz[qv], vx[r0], vy[r0], vz[r0]),
          ) < arOld);
          if (ok) capFlipDone += 1;
        }
      }
      for (let t = 0; t < ta.length; t += 1) if (alive[t]) { const ar = arTri(t); if (ar > SHAPE_AR) capAfter += 1; if (ar > capWorstAfter) capWorstAfter = ar; }

      // ───────── S6-PILOT: SLIVER COLLAPSE-AND-RESUME (PF_CB_SLIVER_COLLAPSE=1; default OFF) ─────────
      // Pre-registered 2026-07-30 (worklog, EXECUTION §). MECHANISM UNDER TEST: sliver trains along loci
      // deadlock the split guard — S4's own counter measured that in ~95% of refused splits BOTH candidate
      // edges were inadmissible, because in a train your longest edge is your degenerate neighbour's short
      // edge — while the one primitive that removes a sliver (the S6-gated collapse above) is dead code at
      // every measured config (needle threshold 0.2 µm < guard-ON min edge 0.722 µm). This pass gives it a
      // TARGETED live call site and then lets refinement resume where the removals un-protected neighbours.
      // BOUNDS, so the pass cannot manufacture what it exists to remove:
      //   * only edges shorter than PF_CB_SLIVER_MAXEDGE_UM (default 5 µm = TOL/2) collapse — the largest
      //     vertex motion stays below half the product tolerance, so no single collapse can create an H1
      //     violation. CAP-family blades (all edges long) are deliberately OUT OF SCOPE for this pass.
      //   * the survivor is the FEATURE endpoint when exactly one endpoint carries vFeat, so conforming
      //     vertices are never dragged off their loci.
      //   * every collapse goes through the SAME link condition and the SAME postCollapseAdmits (AR+fold)
      //     gate as the needle pass; every resume split goes through refineDirected → splitEdge → bisectAt,
      //     so S1–S4 apply unchanged.
      //   * the resume budget is EXPLICIT (PF_CB_SLIVER_RESUME_BUDGET gross allocations beyond PF_CB_TRICAP,
      //     default 20000) — the A/B design pairs it with a flag-OFF control at TRICAP+BUDGET.
      // Unlike the needle pass, the relabel here maintains edgeMap coherently (eDel old / eAdd new): the
      // resume loop consults incident lists through bisectAt, and a stale list would split phantom edges.
      /** repaired-neighbourhood seeds for the shared resume loop (collapse survivors + flip products) */
      const pilotReseed: number[] = [];
      if (SLIVER_COLLAPSE) {
        sliverRan = true;
        const off: Array<[number, number]> = [];
        for (let t = 0; t < ta.length; t += 1) if (alive[t]) { const ar = arTri(t); if (ar > SLIVER_AR) off.push([ar, t]); }
        sliverOffendersBefore = off.length;
        off.sort((x, y) => y[0] - x[0]); // worst first
        for (const [, t0] of off) {
          if (!alive[t0]) continue; // an earlier collapse may have removed or re-meshed it
          sliverTested += 1;
          const es: Array<[number, number, number]> = [
            [eLen(ta[t0], tb[t0]), ta[t0], tb[t0]],
            [eLen(tb[t0], tc[t0]), tb[t0], tc[t0]],
            [eLen(tc[t0], ta[t0]), tc[t0], ta[t0]],
          ];
          es.sort((x, y) => x[0] - y[0]);
          const [sL, p0, q0] = es[0];
          if (sL >= SLIVER_MAX_MM) { sliverRefusedLen += 1; continue; }
          // survivor preference: keep the locus vertex; with none (or both) on a locus, try both directions
          const dirs: Array<[number, number]> = vFeat[p0] && !vFeat[q0] ? [[p0, q0]]
            : vFeat[q0] && !vFeat[p0] ? [[q0, p0]]
              : [[p0, q0], [q0, p0]];
          let done = false;
          for (const [u, v] of dirs) {
            const su = vTris.get(u); const sv = vTris.get(v);
            if (su === undefined || sv === undefined) continue;
            const shared: number[] = [];
            for (const t of su) if (alive[t] && sv.has(t)) shared.push(t);
            if (shared.length === 0) continue;
            const apex = new Set<number>();
            for (const t of shared) { for (const w of [ta[t], tb[t], tc[t]]) if (w !== u && w !== v) apex.add(w); }
            const nu = nbr.get(u); const nv = nbr.get(v);
            if (nu === undefined || nv === undefined) continue;
            let linkBad = false;
            for (const w of nu) if (nv.has(w) && !apex.has(w)) { linkBad = true; break; }
            if (linkBad) continue;
            nPostCollapseTested += 1;
            const shapeVerdict = postCollapseAdmits(u, v, sv, new Set(shared));
            if (shapeVerdict === 'ar') { nPostCollapseRefusedAR += 1; continue; }
            if (shapeVerdict === 'fold') { nPostCollapseRefusedFold += 1; continue; }
            // collapse v → u. killT keeps edgeMap live for the dying pair; survivors relabel with explicit
            // eDel/eAdd so the resume loop's incident lists are the true ones.
            for (const t of shared) { killT(t); collapsedTris += 1; }
            for (const t of Array.from(sv)) {
              if (!alive[t]) continue;
              const a0 = ta[t]; const b0 = tb[t]; const c0 = tc[t];
              eDel(a0, b0, t); eDel(b0, c0, t); eDel(c0, a0, t);
              if (ta[t] === v) ta[t] = u; if (tb[t] === v) tb[t] = u; if (tc[t] === v) tc[t] = u;
              eAdd(ta[t], tb[t], t); eAdd(tb[t], tc[t], t); eAdd(tc[t], ta[t], t);
              addVT(u, t);
              pilotReseed.push(t);
            }
            for (const w of nv) { if (w === u) continue; const nw = nbr.get(w); if (nw !== undefined) { nw.delete(v); nw.add(u); } addNbr(u, w); }
            nbr.delete(v); vTris.delete(v);
            nu.delete(v);
            sliverCollapsed += 1;
            done = true;
            break;
          }
          if (!done) sliverRefusedOther += 1; // link/shape refusals — the shared S6 counters above carry the split
        }
      }

      // ───────── S7-PILOT: CONFORMING FLIP of fossil crossing edges (PF_CB_CONF_FLIP=1; default OFF) ─────────
      // See the S7 note at the counter block. Candidate = an edge, shared by exactly two live facets, whose
      // OWN 1-D profile carries an interior crease kink (locateKink — the SNAP primitive — with t inside the
      // SNAP_ALPHA band and not jump-class): the signature of a bay-to-bay chord CROSSING a locus. An edge
      // ALONG a locus is smooth along itself and never matches; tryFlip's own edgeOnLocus check backstops
      // that anyway. The flip is gated on strictly improving the pair's worst AR (the S5 gate, verbatim), so
      // the pass can only improve the census metric, moves no vertex, and costs no triangle budget.
      // Enumeration dedups CANDIDATES only (rare), not all edges — the Set stays far below V8's 2^23 cap
      // (the detectSelfIntersections lesson); the price is at most a second locateKink on a shared edge.
      if (CONF_FLIP) {
        confFlipRan = true;
        const flippedKeys = new Set<number>();
        for (let pass = 0; pass < 3; pass += 1) {
          let didAny = false;
          confFlipPasses += 1;
          for (let t = 0; t < ta.length; t += 1) {
            if (!alive[t]) continue;
            const e0 = longestE(t);
            const [pv, qv] = eVerts(t, e0);
            const k = eKey(pv, qv);
            if (flippedKeys.has(k)) continue;
            const inc = (edgeMap.get(k) ?? []).filter((x) => alive[x]);
            if (inc.length !== 2) continue;
            const kk = locateKink(vth[pv], vz[pv], vth[pv] + dTh(pv, qv), vz[qv]);
            if (kk === null || kk.jump) continue;
            if (kk.t <= SNAP_ALPHA || kk.t >= 1 - SNAP_ALPHA) continue; // endpoint kink — already conformed there
            flippedKeys.add(k);
            confFlipCand += 1;
            const arOld = Math.max(arTri(inc[0]), arTri(inc[1]));
            const before = ta.length;
            const ok = tryFlip(pv, qv, (r0, s0) => Math.max(
              aspect3(vx[r0], vy[r0], vz[r0], vx[pv], vy[pv], vz[pv], vx[s0], vy[s0], vz[s0]),
              aspect3(vx[s0], vy[s0], vz[s0], vx[qv], vy[qv], vz[qv], vx[r0], vy[r0], vz[r0]),
            ) < arOld);
            if (ok) {
              confFlipDone += 1; didAny = true;
              for (let nt = before; nt < ta.length; nt += 1) pilotReseed.push(nt);
            } else confFlipRefused += 1;
          }
          if (!didAny) break;
        }
      }

      // ───────── S8-PILOT: CASCADE-SPLIT of fossil crossing edges (PF_CB_FOSSIL_CASCADE=1; default OFF) ─────────
      // See the S8 note at the counter block. Candidate enumeration is S7's VERBATIM (longest edge of a live
      // facet, exactly 2 incident, locateKink interior crease crossing inside the SNAP_ALPHA band) so the two
      // pilots name the same population. Per site the pass owes ONE conformity split — `bisectAt` at the
      // located crossing, the exact split SNAP was refused — and discharges a shape refusal by OBLIGATION:
      //   * PROTECTOR obligation: the offending incident triangle's LONGEST edge is midpoint-split first
      //     (Rivara's ×0.99-amplification move), recursively, depth-capped — then the blocked split retries;
      //   * RETREAT obligation: when the offender's longest edge IS the blocked edge (the crossing sits too
      //     far off-centre for the pair's own children), midpoint-split the crossing edge and re-locate the
      //     crossing on the child that carries it — t' ≈ 2t re-centres geometrically, so a few retreats exit
      //     the SNAP_ALPHA band, or the crossing lands within α of a vertex at child scale and the site is
      //     counted CONFORMED BY PROXIMITY (the vertex is within α·L/2^k of the locus, shrinking each level).
      // Every split goes through `bisectAt` ⇒ S1/S2 score every child on BOTH sides of every edge, exactly as
      // in the refinement loop, so the pass cannot emit an over-cap child or a fold. Budgets are EXPLICIT and
      // separate: FOSSIL_BUDGET gross allocations for the pass, then the shared resume budget below.
      if (FOSSIL_CASCADE) {
        fossilRan = true;
        const taStart = ta.length;
        const fossilCap = taStart + FOSSIL_BUDGET;
        /** the vertex the successful `bisectAt` just inserted on (a,b): its construction pushes
         *  addT(oa, m, apex) then addT(m, ob, apex), so tb[created[0]] === ta[created[1]] === m.
         *  Checked, not assumed — a -1 (degenerate addT) or a mismatch returns -1 and the caller refuses. */
        const splitVertexOf = (): number => {
          if (created.length < 2 || created[0] < 0 || created[1] < 0) return -1;
          const m = tb[created[0]];
          return ta[created[1]] === m ? m : -1;
        };
        /** discharge one fossil site: the crossing split plus whatever obligations it takes. */
        const conformSite = (a0: number, b0: number, t0: number): boolean => {
          // obligation stack, parallel arrays (top = next split owed). Slot 0 is ALWAYS the crossing split;
          // obT >= 0 marks a crossing placement (feat=true, exempt from re-centring, exactly as SNAP's).
          const obA: number[] = [a0]; const obB: number[] = [b0]; const obT: number[] = [t0];
          let depth = 0;
          let attempts = 0;
          const ATTEMPT_CAP = 4 * FOSSIL_DEPTH + 8; // a retried split can re-fail with a NEW offender; bound the site outright
          for (;;) {
            if (ta.length >= fossilCap) { fossilBudgetCapped = true; return false; }
            attempts += 1;
            if (attempts > ATTEMPT_CAP) { fossilDeadlocked += 1; fossilDeadAttempts += 1; return false; }
            const i = obA.length - 1;
            const av = obA[i]; const bv = obB[i]; const tv = obT[i];
            if (!(edgeMap.get(eKey(av, bv)) ?? []).some((x) => alive[x])) {
              // a deeper obligation re-meshed this edge away (bisectAt splits every incident triangle).
              // For a protector that is a discharge; for the crossing edge itself it should be unreachable
              // (protector splits never touch it) — refuse defensively rather than mis-count a conform.
              if (i === 0) { fossilRefusedOther += 1; return false; }
              obA.pop(); obB.pop(); obT.pop();
              continue;
            }
            created.length = 0;
            const isCrossing = tv >= 0;
            if (bisectAt(av, bv, isCrossing ? tv : placeAt(av, bv, 0.5), isCrossing ? true : vFeat[av] && vFeat[bv])) {
              fossilSplits += 1;
              for (const nt of created) if (nt >= 0) pilotReseed.push(nt);
              if (i === 0) { fossilConformed += 1; if (depth > fossilDepthMax) fossilDepthMax = depth; return true; }
              fossilCascadeSplits += 1;
              obA.pop(); obB.pop(); obT.pop();
              continue;
            }
            if (lastBisectShape === 'none') { fossilRefusedOther += 1; return false; } // weld/apex — no ladder here, the placement is the point
            const off = lastShapeOffenderT;
            if (off < 0 || !alive[off]) { fossilRefusedOther += 1; return false; }
            if (depth >= FOSSIL_DEPTH) { fossilDeadlocked += 1; fossilDeadDepth += 1; return false; }
            const [pv, qv] = eVerts(off, longestE(off));
            if (eKey(pv, qv) !== eKey(av, bv)) {
              // PROTECTOR: the offender must be refined before (av,bv) may split. Rivara's move is ITS
              // longest edge at the midpoint — the one split whose children provably stay well-shaped.
              obA.push(pv); obB.push(qv); obT.push(-1); depth += 1;
              continue;
            }
            // The offender's longest edge IS the blocked edge.
            if (!isCrossing) { fossilDeadlocked += 1; fossilDeadSelf += 1; return false; } // a midpoint split refused at its own longest edge is a true dead end
            // RETREAT: midpoint-split the crossing edge, then chase the crossing into the child.
            created.length = 0;
            if (!bisectAt(av, bv, placeAt(av, bv, 0.5), vFeat[av] && vFeat[bv])) {
              // `lastShapeOffenderT < 0` subsumes the `'none'` case: bisectAt resets the offender to -1 on
              // entry and ONLY the two shape refusals set it, so a weld/apex refusal reads -1 here. (The
              // explicit `'none'` test is not repeated because TS's flow analysis cannot see bisectAt
              // mutate the closure variable past the narrowing check above.)
              if (lastShapeOffenderT < 0 || !alive[lastShapeOffenderT]) { fossilRefusedOther += 1; return false; }
              const [p2, q2] = eVerts(lastShapeOffenderT, longestE(lastShapeOffenderT));
              if (eKey(p2, q2) === eKey(av, bv)) { fossilDeadlocked += 1; fossilDeadSelf += 1; return false; }
              obA.push(p2); obB.push(q2); obT.push(-1); depth += 1;
              continue;
            }
            const m = splitVertexOf();
            fossilSplits += 1; fossilRetreatSplits += 1; depth += 1;
            for (const nt of created) if (nt >= 0) pilotReseed.push(nt);
            if (m < 0) { fossilRefusedOther += 1; return false; }
            let carried = false;
            for (const [ca, cb] of [[av, m], [m, bv]] as Array<[number, number]>) {
              const ck = locateKink(vth[ca], vz[ca], vth[ca] + dTh(ca, cb), vz[cb]);
              if (ck !== null && !ck.jump && ck.t > SNAP_ALPHA && ck.t < 1 - SNAP_ALPHA) {
                obA[0] = ca; obB[0] = cb; obT[0] = ck.t;
                carried = true;
                break;
              }
            }
            if (!carried) { fossilProximity += 1; if (depth > fossilDepthMax) fossilDepthMax = depth; return true; }
          }
        };
        // Enumeration dedups across passes (S7's counting semantics: a candidate edge is counted ONCE and
        // attempted once); later passes exist to pick up NEW candidates born from this pass's own splits.
        const tried = new Set<number>();
        let budgetStop = false;
        for (let pass = 0; pass < FOSSIL_PASSES && !budgetStop; pass += 1) {
          fossilPasses += 1;
          let didAny = false;
          for (let t0 = 0; t0 < ta.length; t0 += 1) {
            if (!alive[t0]) continue;
            if (ta.length >= fossilCap) { fossilBudgetCapped = true; budgetStop = true; break; }
            const [pv, qv] = eVerts(t0, longestE(t0));
            const k0 = eKey(pv, qv);
            if (tried.has(k0)) continue;
            const inc = (edgeMap.get(k0) ?? []).filter((x) => alive[x]);
            if (inc.length !== 2) continue;
            const kk = locateKink(vth[pv], vz[pv], vth[pv] + dTh(pv, qv), vz[qv]);
            if (kk === null || kk.jump) continue;
            if (kk.t <= SNAP_ALPHA || kk.t >= 1 - SNAP_ALPHA) continue;
            tried.add(k0);
            fossilCand += 1;
            if (conformSite(pv, qv, kk.t)) didAny = true;
          }
          if (!didAny) break;
        }
        fossilAllocUsed = ta.length - taStart;
      }

      // ───────── S22: THE DE-SHARD FINISHING PASS (PF_CB_DESHARD=1; default OFF) ─────────
      // See the registration note at the counter block for the design and for the admission precondition
      // this pass refuses to run without. Two sub-passes, in this order and for this reason: SUBDIVISION
      // first, because splitting a shard changes the degree of the vertices it hangs from and therefore
      // changes the FAN worklist; enumerating fans first would act on a worklist the other sub-pass is
      // about to invalidate.
      /**
       * S22C. Discharge ONE blocked de-shard split by S8's PROTECTOR obligation.
       *
       * This is `conformSite`'s ladder with the RETREAT half deliberately removed. S8 needed retreat
       * because its blocked splits were OFF-CENTRE SNAP crossings (t in [0.12, 0.88], amplification up to
       * 1/min(t,1-t) ~ 8x) that could sometimes be rescued by re-centring. **A de-shard split is already at
       * the midpoint of the longest edge — Rivara's amplification-minimising point — so there is nowhere to
       * retreat TO**, and this file's own S8 note states the consequence: if the best placement on an edge
       * breaches the cap, no admissible placement exists on it. The only remaining lever is to make the
       * OFFENDING NEIGHBOUR thinner and retry, which is exactly the protector obligation.
       *
       * Every split still goes through `bisectAt`, so S1/S2 and the split-side admission gate score every
       * child on both sides — the ladder cannot manufacture the class it is climbing to remove.
       */
      const deshardConform = (a0: number, b0: number): boolean => {
        const obA: number[] = [a0]; const obB: number[] = [b0];
        let depth = 0; let attempts = 0;
        const ATTEMPT_CAP = 4 * DESHARD_CASDEPTH + 8;   // a retried split can re-fail with a NEW offender
        casSites += 1;
        for (;;) {
          if (deshardLiveAdded >= DESHARD_BUDGET) { deshardBudgetCapped = true; return false; }
          attempts += 1;
          if (attempts > ATTEMPT_CAP) { casAttemptCapped += 1; return false; }
          const i = obA.length - 1;
          const av = obA[i]; const bv = obB[i];
          if (!(edgeMap.get(eKey(av, bv)) ?? []).some((x) => alive[x])) {
            // a deeper obligation re-meshed this edge away. For a protector that is a discharge; for the
            // TARGET edge it should be unreachable (protector splits never touch it), so refuse
            // defensively rather than mis-count a conform.
            if (i === 0) { casOther += 1; return false; }
            obA.pop(); obB.pop();
            continue;
          }
          created.length = 0;
          if (bisectAt(av, bv, placeAt(av, bv, 0.5), vFeat[av] && vFeat[bv])) {
            deshardLiveAdded += created.filter((nt) => nt >= 0).length / 2;
            for (const nt of created) if (nt >= 0) pilotReseed.push(nt);
            if (i === 0) {
              casConformed += 1;
              if (depth > casDepthMax) casDepthMax = depth;
              casDepthHist[Math.min(15, depth)] += 1;
              return true;                            // the blocked split finally landed
            }
            casProtectorSplits += 1;
            obA.pop(); obB.pop();
            continue;
          }
          // Only an ASPECT refusal names a protector worth chasing. An `admit` refusal is a BACK-FACING
          // child and no amount of neighbour refinement changes its orientation, so climbing there would
          // spend budget against a gate that is not the one blocking.
          if (bisectRefusal() !== 'ar') { casOther += 1; return false; }
          const off = lastShapeOffenderT;
          if (off < 0 || !alive[off]) { casOther += 1; return false; }
          if (depth >= DESHARD_CASDEPTH) { casDepthCapped += 1; return false; }
          const [pv2, qv2] = eVerts(off, longestE(off));
          if (eKey(pv2, qv2) === eKey(av, bv)) {
            // THE S8 PRODUCTION FAILURE MODE, and the one this arm expects to dominate: the offender's own
            // longest edge IS the blocked edge, so there is no protector to refine and (unlike S8) no
            // off-centre placement to re-centre. A true dead end under the S1 cap.
            casSelfBlocked += 1; return false;
          }
          obA.push(pv2); obB.push(qv2); depth += 1;
        }
      };

      if (DESHARD) {
        deshardRan = true;
        const taStart = ta.length;
        deshardBefore = shardCensus();
        // ── (i) LENGTH-DRIVEN SUBDIVISION AT THE LONG EDGE, RECURSIVELY ────────────────────────────────
        // The split is at the LONGEST edge at the MIDPOINT — Rivara's two hypotheses, the ONE placement
        // this file has measured as amplification-neutral (x0.99 geometric mean over 58,880 splits, vs
        // x2.31 middle edge / x4.00 shortest / x1.77 SNAP). A de-shard pass that split anywhere else would
        // manufacture the shape class it exists to remove, which is precisely the CTLPLUS failure.
        const stackT: number[] = []; const stackD: number[] = [];
        for (let t = 0; t < ta.length; t += 1) if (alive[t] && shardOf(t)) { stackT.push(t); stackD.push(0); }
        while (stackT.length > 0) {
          if (deshardLiveAdded >= DESHARD_BUDGET) { deshardBudgetCapped = true; break; }
          const t = stackT.pop() as number; const d = stackD.pop() as number;
          // a neighbour's split re-meshes BOTH sides of its edge, so a queued facet may already be gone or
          // already be under the bar. Re-testing is not defensive noise: it is what keeps the recursion
          // finite when two shards share their long edge.
          if (!alive[t] || !shardOf(t)) continue;
          deshardTried += 1;
          const [pv, qv] = eVerts(t, longestE(t));
          created.length = 0;
          let landed = bisectAt(pv, qv, placeAt(pv, qv, 0.5), vFeat[pv] && vFeat[qv]);
          let viaCascade = false;
          if (landed) {
            // `bisectAt` kills each live incident triangle and emits two in its place, so the LIVE growth is
            // exactly half the number of children it created — counted, not assumed from an edge-degree.
            deshardLiveAdded += created.filter((nt) => nt >= 0).length / 2;
            for (const nt of created) if (nt >= 0) pilotReseed.push(nt);  // the registered FIDELITY RE-QUEUE
          } else if (DESHARD_CASCADE && bisectRefusal() === 'ar') {
            // S22C: the S1 refusal NAMES the neighbour it was protecting. Discharge that protector and
            // retry instead of abandoning the parent. `deshardConform` does its own budget and reseed
            // accounting, and leaves `created` holding the TARGET split's children on success.
            landed = deshardConform(pv, qv);
            viaCascade = landed;
          }
          if (landed) {
            deshardSplits += 1;
            if (viaCascade) deshardSplitsViaCascade += 1;
            if (d > deshardDepthMax) deshardDepthMax = d;
            for (const nt of created) {
              if (nt < 0) continue;
              if (d + 1 < DESHARD_DEPTH && alive[nt] && shardOf(nt)) { stackT.push(nt); stackD.push(d + 1); }
            }
          } else {
            // REFUSED. `bisectAt` sets `lastBisectShape` on every refusal path, so the parent is classified
            // by the gate that stopped it rather than lumped into one number. A refusal is a RESULT: it
            // says the composed gates would not let this facet be repaired here, and the facet stays in
            // the census as a declared survivor.
            deshardRefused += 1;
            const why = bisectRefusal();
            if (why === 'ar') deshardRefAR += 1;
            else if (why === 'fold') deshardRefFold += 1;
            else if (why === 'admit') deshardRefAdmit += 1;
            else deshardRefOther += 1;
            if (deshardRefusedLog.length < 20 && alive[t]) {
              deshardRefusedLog.push(`      REFUSED[${why}] tri ${t}  AR3 ${arTri(t).toFixed(1)}`
                + `  long ${(Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])) * 1000).toFixed(0)} um`
                + `  th ${vth[ta[t]].toFixed(5)}  z ${vz[ta[t]].toFixed(3)}  depth ${d}`);
            }
          }
        }
        // ── (ii) IMPROVEMENT-GATED FLIPS OVER THE FAN WORKLIST ─────────────────────────────────────────
        // A fan hub is a background-grid vertex adjacent to a refined region: the refined side contributes
        // many short edges, the unrefined background side contributes long ones, and the vertex ends up the
        // apex of a fan of 19-25 long facets (measured on `_S21B`: 11 of the 12 highest-degree hubs sit
        // 1.33-2.59 mm out, i.e. just OUTSIDE the 1.5 mm routed radius, on EXACT integer grid nodes).
        // Flipping a spoke (hub,w) rewrites the quad hub-r0-w-s0 onto the diagonal (r0,s0), which drops the
        // hub's degree by exactly one and moves no vertex at all. `tryFlip` already refuses a locus edge, a
        // non-convex quad, a pinch, an inconsistent pair and a >2-incidence edge; the gate below adds the
        // registered pair — worst-AR STRICTLY decreases AND both children admissible.
        deshardAllocSub = ta.length - taStart;
        const taFan = ta.length;
        const hubs0 = fanCensus();
        deshardFanBefore = hubs0.size;
        // THE WORKLIST IS THE CENSUS AT PASS START AND IS NOT RE-RANKED BETWEEN PASSES — "the pass acts
        // where the census points and nowhere else". Later passes exist to retry hubs whose star has since
        // changed, not to chase hubs the instrument did not name.
        const hubList = [...hubs0.entries()].sort((x, y) => y[1] - x[1]).map(([v]) => v);
        const hubSet = new Set(hubList);
        for (let pass = 0; pass < DESHARD_FANPASSES; pass += 1) {
          let didAny = false;
          deshardFanPassesRun += 1;
          // ONE sweep per pass builds every hub's star of long-edged facets. Per-hub sweeps would be
          // hubs x passes x |ta| and this mesh has 1.2 M live facets in ~2.3 M allocations. The star can go
          // stale WITHIN a pass as flips land; that is harmless and deliberate — every candidate is
          // re-validated against the live `edgeMap` below and again inside `tryFlip`, so a stale entry
          // costs one cheap refusal and never a wrong mutation.
          const star = new Map<number, number[]>();
          for (let t = 0; t < ta.length; t += 1) {
            if (!alive[t] || !fanLong(t)) continue;
            for (const v of [ta[t], tb[t], tc[t]]) {
              if (!hubSet.has(v)) continue;
              const l = star.get(v); if (l === undefined) star.set(v, [t]); else l.push(t);
            }
          }
          for (const hub of hubList) {
            const st = star.get(hub);
            if (st === undefined || st.length < DESHARD_FANDEG) continue; // an earlier flip discharged it
            const spokes = new Set<number>();
            for (const t of st) { if (!alive[t]) continue; for (const w of [ta[t], tb[t], tc[t]]) if (w !== hub) spokes.add(w); }
            for (const w of spokes) {
              const inc = (edgeMap.get(eKey(hub, w)) ?? []).filter((x) => alive[x]);
              if (inc.length !== 2) { deshardFanRefValid += 1; continue; }
              deshardFanCand += 1;
              // ── S22B (c): ON-LOCUS SPOKE ⇒ SHORTEN INSTEAD OF ROTATE ────────────────────────────────
              // Tested BEFORE `tryFlip` rather than inferred from its refusal, so the two paths are
              // disjoint by construction and each candidate is billed to exactly one of them.
              if (edgeOnLocus(hub, w)) {
                deshardFanLocus += 1;
                // A spoke already below the census's own long-edge threshold is not what the operator
                // sees, and splitting it would spend budget to remove nothing from the instrument.
                if (eLen(hub, w) < DESHARD_FANLONG) { deshardFanLocusShort += 1; continue; }
                if (deshardLiveAdded >= DESHARD_BUDGET) { deshardBudgetCapped = true; continue; }
                created.length = 0;
                let okL = bisectAt(hub, w, placeAt(hub, w, 0.5), vFeat[hub] && vFeat[w]);
                if (okL) {
                  deshardLiveAdded += created.filter((nt) => nt >= 0).length / 2;
                  for (const nt of created) if (nt >= 0) pilotReseed.push(nt);
                } else if (DESHARD_CASCADE && bisectRefusal() === 'ar') {
                  okL = deshardConform(hub, w);       // S22C: same protector ladder on the locus path
                  if (okL) deshardFanLocusViaCascade += 1;
                }
                if (okL) { deshardFanLocusSplit += 1; didAny = true; } else deshardFanLocusRefused += 1;
                continue;
              }
              const arOld = Math.max(arTri(inc[0]), arTri(inc[1]));
              const before = ta.length;
              const ok = tryFlip(hub, w, (r0, s0) => {
                const a1 = aspect3(vx[r0], vy[r0], vz[r0], vx[hub], vy[hub], vz[hub], vx[s0], vy[s0], vz[s0]);
                const a2 = aspect3(vx[s0], vy[s0], vz[s0], vx[w], vy[w], vz[w], vx[r0], vy[r0], vz[r0]);
                const wA = Math.max(a1, a2);
                if (!(wA < arOld)) { deshardFanRefAR += 1; return false; }   // STRICTLY decreases
                // ADMISSION ON THE PAIR THE FLIP WOULD EMIT, in `tryFlip`'s own winding — addT(r0,pv,s0)
                // then addT(s0,qv,r0) — and through the SAME `footBack` choke point every other admission
                // call uses, so the PF_CB_ADMIT_SHIPPED quantisation applies here too.
                if (footBack(vx[r0], vy[r0], vz[r0], vx[hub], vy[hub], vz[hub], vx[s0], vy[s0], vz[s0],
                  vth[r0], vth[hub], vth[s0])
                  || footBack(vx[s0], vy[s0], vz[s0], vx[w], vy[w], vz[w], vx[r0], vy[r0], vz[r0],
                    vth[s0], vth[w], vth[r0])) { deshardFanRefAdmit += 1; return false; }
                if (wA > postWorstAdmitted) postWorstAdmitted = wA;
                return true;
              });
              if (ok) {
                deshardFanFlipped += 1; didAny = true;
                for (let nt = before; nt < ta.length; nt += 1) pilotReseed.push(nt);
                // S22B: the per-hub `break` that used to sit here is REMOVED. It capped a hub at ONE action
                // per sweep, so a degree-25 hub needed 13 sweeps to fall under the census threshold and got
                // 3 — which is a large part of why `_S22A` left 93 hubs standing. Continuing is safe
                // because every remaining spoke is re-validated against the LIVE `edgeMap` at the top of
                // this loop and again inside `tryFlip`; the stale star can only cost a cheap refusal.
              }
            }
          }
          if (!didAny) break;
        }
        // NOTE: the after-censuses are NOT taken here. They are taken after the shared resume below, so the
        // reported number is the one the STL will carry rather than the one this pass happened to leave.
        deshardAllocFan = ta.length - taFan;
      }

      // ───────────── V2-L2  POST-DRAIN CAVITY ESCALATION PASS ─────────────
      // ⚠ PLACEMENT DEBT: this sits inside the enclosing `PF_CB_SAFE_COLLAPSE !== 0` block, so setting
      // PF_CB_SAFE_COLLAPSE=0 silently disables the cavity pass too. That coupling is accidental and
      // should be undone by hoisting this block out before the lever is trusted in an A/B that varies
      // safe-collapse. It is harmless at the default (safe-collapse ON).
      // WHY IT RUNS HERE AND NOT INLINE. The first build called  the instant a facet
      // jammed. Every escalation refused, and the planner's own record said why: the blocking facet had
      // AR 4.81 against a cap of 50 and NO feature involvement — it was blocked on VISUAL error, 127 um
      // against a 10 um bar, on a triangle with two FROZEN-PERIMETER corners. A cavity may not split its
      // own frozen boundary, so an inherited boundary that is itself over the bar can never certify, and
      // growing the front only inherits a different over-the-bar boundary.
      //
      // That is a statement about WHEN, not about the mechanism: mid-refinement the neighbourhood has
      // not converged yet, so no good boundary exists to freeze. S44 succeeded because it cut its
      // cavities into an already-converged 1.26 M-facet mesh where only 22 regions were bad.
      //
      // So the escalation runs once the heap has DRAINED — every cheap move exhausted, the surroundings
      // as converged as this driver can make them — but still inside the driver, before any STL is
      // written. The products re-enter , so a cavity's children are refined like any others.
      if (CAVITY > 0 && !capped && !timeCapped) {
        for (let round = 0; round < CAVITY_ROUNDS; round += 1) {
          const jammed = [...unresolved.keys()].filter((t) => alive[t]);
          if (jammed.length === 0) break;
          let progressed = 0;
          for (const t of jammed) {
            if (cavTried >= CAVITY_BUDGET) break;
            created.length = 0;
            if (!cavityEscalate(t)) continue;
            progressed += 1;
            unresolved.delete(t);
            unresolvedWhy.delete(t);
            for (const nt of created) consider(nt);
          }
          cavRounds += 1;
          if (progressed === 0) break;
          // Drain whatever the cavities re-queued before the next round, so the following round again
          // sees a converged neighbourhood rather than half-refined cavity children.
          while (heapT.length > 0 && ta.length < triCap) {
            const t = hpop();
            if (t < 0) break;
            if (!alive[t]) continue;
            created.length = 0;
            if (DIRECTED) refineDirected(t); else refineLepp(t);
            if (created.length === 0) lastChanceSplit(t);
            for (const nt of created) consider(nt);
            if (created.length === 0) { unresolved.set(t, worstEdgeSag(t)); unresolvedWhy.set(t, classifyStrand(t)); }
          }
        }
      }

      // RESUME (shared by S6-collapse, S7-flip, S8-cascade and S22 de-shard): re-seed the repaired neighbourhoods and the
      // still-alive unresolved set, then drain the heap under the explicit extra budget — the heap driver's
      // pop step verbatim (pop → refineDirected/refineLepp → consider children → survivor re-queue →
      // unresolved bookkeeping). Termination: every pop either splits (budget-bounded) or lands in
      // `unresolved` and is never re-queued.
      if ((SLIVER_COLLAPSE || CONF_FLIP || FOSSIL_CASCADE || DESHARD) && SLIVER_RESUME_BUDGET > 0
        && sliverCollapsed + confFlipDone + fossilSplits + deshardSplits + deshardFanFlipped > 0) {
        // S22: the de-shard resume is capped at the pass's OWN allocation base + budget, NOT at
        // PF_CB_TRICAP. On this arm TRICAP is 8 M against ~2.3 M allocations, so the legacy expression is
        // not a binding cap at all and the registered cost ceiling (live tris <= 1.30 M) would rest on the
        // heap draining rather than on a bound. Only reachable with the flag on, so the OFF path is
        // byte-identical.
        const resumeCap = DESHARD
          ? ta.length + SLIVER_RESUME_BUDGET
          : (FOSSIL_CASCADE ? Math.max(triCap, ta.length) : triCap) + SLIVER_RESUME_BUDGET;
        const resumeBase = ta.length; // gross allocs at resume start, so the S8 pass's own splits are not billed to the resume
        for (const t of pilotReseed) if (alive[t]) consider(t);
        for (const [t] of unresolved) if (alive[t]) consider(t);
        while (heapT.length > 0) {
          if (ta.length >= resumeCap) { sliverResumeCapped = true; break; }
          if (MAXSECS > 0 && (Date.now() - t0ms) / 1000 > MAXSECS) { timeCapped = true; break; }
          const kTop = heapK[0];
          const t = hpop();
          if (!alive[t]) continue;
          created.length = 0;
          if (DIRECTED) refineDirected(t); else refineLepp(t);
          for (const nt of created) consider(nt);
          if (created.length > 0) {
            sliverResumeSplits += 1;
            unresolved.delete(t);
            if (alive[t]) consider(t);
          } else { unresolved.set(t, kTop); unresolvedWhy.set(t, classifyStrand(t)); }   // S26: the resume strands too, and it used to do so anonymously
        }
        sliverResumeBudgetUsed = Math.max(0, ta.length - resumeBase);
      }
      if (SLIVER_COLLAPSE || CONF_FLIP || FOSSIL_CASCADE || DESHARD) {
        for (let t = 0; t < ta.length; t += 1) if (alive[t]) { if (arTri(t) > SLIVER_AR) sliverOffendersAfter += 1; }
        for (const [t, k] of unresolved) if (alive[t]) { sliverUnresolvedAfter += 1; if (k > sliverUnresolvedWorstAfter) sliverUnresolvedWorstAfter = k; }
      }
      // S22: the census AFTER the resume, because the resume's own splits are refinement acting on the same
      // facets and the ship gate is read on the STL, not on the state the pass happened to leave behind.
      if (DESHARD) { deshardAfter = shardCensus(); deshardFanAfter = fanCensus().size; }
    }

    // ═══════════════ S27 — THE STRAND-RETRY PASS (PF_CB_STRAND_RETRY=1, DEFAULT OFF) ═══════════════
    // THE CLAIM THIS TESTS. S26 named the argmax carrier's refuser as `shape-ar` — the S1 aspect cap — while
    // S25.2 measured ZERO AR-refused children at that same carrier ON THE SHIPPED MESH. Both are right: the
    // driver recorded its refusal AT STRAND TIME and the tool scored the FINAL mesh. The artifact proves the
    // states differ from the facet's own two rulers (keyUm 14.0815 -> sagNowUm 20.9242, x1.49, and vertices
    // are never moved here, so only neighbours can have changed). So the cage-face may be a TIMING property:
    // refused against a neighbourhood that has since refined, and never looked at again.
    //
    // WHAT IS AND IS NOT NEW. The resume above ALREADY re-considers the unresolved set once and resolved 187
    // of them — so retrying is not the new idea. **The new idea is ITERATION.** Inside one drain, a facet
    // popped early and re-stranded is never re-popped, even though later splits in that same drain change
    // its neighbourhood. Each pass here gives every survivor another look after everything else has moved.
    // If the effect is real it shows as a pass-over-pass decay; if the resume already took all of it, pass 2
    // resolves nothing and the claim is refuted for the price of one pass.
    //
    // NO GATE IS WEAKENED. Each retry runs the driver's own `refineDirected`/`refineLepp` -> `splitEdge` ->
    // `bisectAt`, so S1 (aspect), S2 ((theta,z) fold) and the S20/S21B/S22 composed admission all score on
    // shipped values exactly as in the main loop. The ONLY thing that changes is WHEN a facet is reconsidered.
    //
    // BUDGET BOOKKEEPING FOLLOWS THE RESUME'S PRECEDENT AND S9.1's ACCOUNTING FIX: the cap is anchored at
    // THIS pass's own allocation base (never at PF_CB_TRICAP, which is not binding here), it meters
    // allocations attributable to the retry alone, and a budget-stopped pass is COUNTED and reported rather
    // than dying silently — the exact failure S9.1 was written to end.
    const STRAND_RETRY = envOn('PF_CB_STRAND_RETRY');
    const SR_PASSES = Math.round(envF('PF_CB_STRAND_RETRY_PASSES', 8));
    const SR_BUDGET = Math.round(envF('PF_CB_STRAND_RETRY_BUDGET', 200000));
    let srPassesRun = 0; let srResolved = 0; let srSplits = 0; let srBudgetUsed = 0;
    let srBudgetStopped = false; let srTimeCapped = false;
    let srBefore = 0; let srBeforeWorst = 0; let srAfter = 0; let srAfterWorst = 0;
    const srResolvedBy = new Map<string, number>();
    const srPerPass: number[] = [];
    const srBeforeBy = new Map<string, number>();
    const srAfterBy = new Map<string, number>();
    if (STRAND_RETRY && SR_BUDGET > 0) {
      for (const [t, k] of unresolved) if (alive[t]) {
        srBefore += 1; if (k > srBeforeWorst) srBeforeWorst = k;
        const w = unresolvedWhy.get(t) ?? 'unknown';
        srBeforeBy.set(w, (srBeforeBy.get(w) ?? 0) + 1);
      }
      const srBase = ta.length;
      const srCap = ta.length + SR_BUDGET;
      for (let pass = 0; pass < SR_PASSES; pass += 1) {
        let seeded = 0;
        for (const [t] of unresolved) if (alive[t]) { consider(t); seeded += 1; }
        if (seeded === 0) break;
        srPassesRun += 1;
        let resolvedThisPass = 0;
        while (heapT.length > 0) {
          if (ta.length >= srCap) { srBudgetStopped = true; break; }
          if (MAXSECS > 0 && (Date.now() - t0ms) / 1000 > MAXSECS) { srTimeCapped = true; break; }
          const kTop = heapK[0];
          const t = hpop();
          if (!alive[t]) continue;
          const wasWhy = unresolvedWhy.get(t) ?? 'unknown';
          const wasStranded = unresolved.has(t);
          created.length = 0;
          if (DIRECTED) refineDirected(t); else refineLepp(t);
          for (const nt of created) consider(nt);
          if (created.length > 0) {
            srSplits += 1;
            // Count a RESOLUTION only for a facet that was actually on the stranded list — the drain also
            // pops this pass's own children, and billing those as "resolved strands" would inflate the one
            // number the probe turns on.
            if (wasStranded) { resolvedThisPass += 1; srResolved += 1; srResolvedBy.set(wasWhy, (srResolvedBy.get(wasWhy) ?? 0) + 1); }
            unresolved.delete(t); unresolvedWhy.delete(t);
            if (alive[t]) consider(t);
          } else { unresolved.set(t, kTop); unresolvedWhy.set(t, classifyStrand(t)); }
        }
        srPerPass.push(resolvedThisPass);
        if (resolvedThisPass === 0 || srBudgetStopped || srTimeCapped) break;
      }
      srBudgetUsed = Math.max(0, ta.length - srBase);
      for (const [t, k] of unresolved) if (alive[t]) {
        srAfter += 1; if (k > srAfterWorst) srAfterWorst = k;
        const w = unresolvedWhy.get(t) ?? 'unknown';
        srAfterBy.set(w, (srAfterBy.get(w) ?? 0) + 1);
      }
      // The headline `unresolvedLeft` / `unresolvedMax` are taken BEFORE the resume and must not silently
      // change meaning, so the retry's effect is recomputed and reported on its own lines below.
    }

    // ───────────────────────────── soup + watertight audit (3D position weld) ─────────────────────────────
    const soup: Array<[P3, P3, P3]> = [];
    const PT = (i: number): P3 => [vx[i], vy[i], vz[i]];
    const liveIdx: number[] = [];
    for (let t = 0; t < ta.length; t += 1) if (alive[t]) { soup.push([PT(ta[t]), PT(tb[t]), PT(tc[t])]); liveIdx.push(t); }

    // Re-runnable position-weld topology audit (fresh weld state per call) — the ONE source of truth, exactly as
    // _strataVoronoiSolid.analyze(): a slicer position-welds too, so this is what "watertight" means downstream.
    interface Topo { nonManifold: number; boundary: number; orientMismatch: number; loops: number[][]; seamCrack: number; wpos: P3[] }
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
      // ORIENTATION (added). Incidence counting alone CANNOT see a reversed facet: an edge whose two triangles
      // traverse it the SAME way counts 2, reads "manifold", and is a fold. Nothing in this pipeline checked
      // winding anywhere — and `tryFlip` above could emit reversed triangles into an otherwise consistent mesh.
      // The direction tally is packed into the SAME map value (occupancy in the low field, a→b-with-a<b
      // traversals in the high field) instead of a second Map: a second map at ~3 entries per triangle re-opens
      // the V8 2^23 Map-cap failure this file has already hit twice.
      const DIR_UNIT = 65536;
      const bump = (a: number, b: number): void => { const k = a < b ? a * WB + b : b * WB + a; ec.set(k, (ec.get(k) ?? 0) + 1 + (a < b ? DIR_UNIT : 0)); };
      for (const [a, b, c] of tris) { const ia = wIndex(a); const ib = wIndex(b); const ic = wIndex(c); bump(ia, ib); bump(ib, ic); bump(ic, ia); }
      let nonManifold = 0; let boundary = 0; let orientMismatch = 0;
      const bAdj = new Map<number, number[]>();
      for (const [k, packed] of ec.entries()) {
        const cnt = packed % DIR_UNIT; const fwd = (packed - cnt) / DIR_UNIT;
        // every INTERIOR edge must be traversed exactly once in each direction; fwd ≠ 1 ⇒ the two facets disagree
        if (cnt === 2) { if (fwd !== 1) orientMismatch += 1; continue; }
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
      return { nonManifold, boundary, orientMismatch, loops: loopsOut, seamCrack: sc, wpos };
    };

    // ───────────────────────────── STAGE B: closure to a printable SOLID ─────────────────────────────
    // Structure ported from _strataVoronoiSolid (stitchRings / innerLoopAtZ / cap assembly): the outer wall keeps the
    // conforming mesh; the cavity side is a smooth surface of revolution, so it is meshed uniformly and cheaply.
    const ang = (p: P3): number => { const a = Math.atan2(p[1], p[0]); return a < 0 ? a + TWO_PI : a; };
    const stitchRings = (loopA: P3[], loopB: P3[]): number => {
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
      // THE CAVITY MUST CLEAR THE ACTUAL WALL, NOT THE PROFILE IT WAS DRAWN FROM. `baseRadius(z) - wallT` knows
      // nothing about the style, but rA(θ,z) dips BELOW the profile wherever the style carves inward — for 8 of
      // the 20 registry-default styles the cavity radius exceeds the outer wall somewhere (Crystalline by
      // 10.98 mm at the rim). The cavity surface then pokes THROUGH the outer wall, and because the audit is a
      // position-weld incidence count it still reports "boundary 0 — CLOSED SOLID" on a self-intersecting mesh.
      // Take the minimum of the profile and the true wall over θ; CAV_TH samples cost ~1 rA eval per 0.5°.
      const CAV_TH = Math.round(envF('PF_CB_CAVITY_TH', 720));
      const rInner = (z: number): number => {
        let mn = baseRadius(z, H, DIMS.Rb, DIMS.Rt, DIMS.expn ?? 1);
        for (let d = 0; d < CAV_TH; d += 1) { const r = R((TWO_PI * d) / CAV_TH, z); if (r < mn) mn = r; }
        const rc = mn - wallT;
        // HARD FAIL rather than clamp: a non-positive cavity radius means there is no wall at this z, so there
        // is no solid to close and any mesh emitted would be a fiction that still passes the topology audit.
        if (rc <= 0) throw new Error(`CAVITY: min outer radius ${mn.toFixed(4)}mm at z=${z.toFixed(3)} is <= wallT ${wallT}mm (cavity radius ${rc.toFixed(4)}mm). STAGE=solid cannot close ${STYLE} at these dims — lower PF_CB_WALLT, or run PF_CB_STAGE=ring.`);
        return rc;
      };
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
    const orientMismatch = finalTopo.orientMismatch;

    // ───────────────────────────── fidelity (oracle N) + tail re-measure ─────────────────────────────
    // PF_CB_TAILK / PF_CB_TAILN are READ HERE rather than below the main loop (their only move in this hunk):
    // the pooled job descriptor is one object and it carries every level the pool may be asked for. Both are
    // pure `envF` reads with no dependency on anything between, so the values are unchanged.
    const tailK = Math.round(envF('PF_CB_TAILK', 3000));
    const tailN = Math.round(envF('PF_CB_TAILN', 44));
    // ═════════ PARALLEL POST-LOOP AUDIT (PF_CB_AUDIT_WORKERS > 1). Everything below is _auditPool.ts. ═════════
    // WHAT IS PARALLEL: the per-facet MEASUREMENT, which is a pure function of three vertex coordinates and of
    // rA and is read-only against the mesh. WHAT IS NOT: every REDUCTION — the two argmaxes, `sags[]`, the
    // percentile sort, the tail ordering, the over-tol count — all of which stay on this thread, in the
    // original `liveIdx` order, reading a finished result block. Slot i is written by exactly one worker, so
    // that block is a pure function of the input list and NOTHING here can depend on interleaving. The
    // argmax rule is therefore not "given a tie-break": it is the original strict-`>` scan, unmoved.
    // PF_CB_AUDIT_WORKERS=1 spawns nothing and runs the identical serial lines.
    const auditPooled = AUDIT_WORKERS > 1 && liveIdx.length > 0;
    // Computed only when pooling, so the serial arm does not pay ~4 k probe evaluations for nothing. `rA` and
    // not `R` — the lattice is the pool's own verification cost and is not billed to the mesher's count.
    const auditThJumps: number[] = auditPooled ? thetaJumpProbe(rA, H) : [];
    let auditMesh: ReturnType<typeof mirrorAuditMesh> | null = null;
    let auditMain: AuditOutcome | null = null;
    let auditTail: AuditOutcome | null = null;
    let auditForensicEvals = 0; let auditVerifyEvals = 0; let auditVerifyChecked = 0;
    const auditCfgFor = (
      mesh: ReturnType<typeof mirrorAuditMesh>, tris: ReturnType<typeof packAuditTris>, job: AuditJob,
    ) => ({
      workers: AUDIT_WORKERS, chunkMax: AUDIT_CHUNK, workerHeapMb: AUDIT_HEAP_MB,
      style: STYLE, styleParams, dims: DIMS, H,
      zJumps: zSteps, thJumps: auditThJumps, refRadius: rA,
      mesh, tris, job,
    });
    if (auditPooled) {
      // THE MIRROR IS TAKEN HERE, not earlier: the collapse/flip pass above is the last thing that rewrites a
      // corner index, and nothing between this line and the end of the audit mutates the mesh.
      auditMesh = mirrorAuditMesh(vth, vz, vx, vy);
      auditMain = await runAuditPool(auditCfgFor(auditMesh, packAuditTris(liveIdx, ta, tb, tc), {
        kind: 'main', count: liveIdx.length, audHs: AUD_HS, audNmin: AUD_NMIN, audNmax: AUD_NMAX, oracleN, tailN,
      }));
      // The workers' evaluations are the SAME evaluations the serial arm makes on this thread — same
      // triangles, same levels — so folding them in keeps the reported `M rA evals` IDENTICAL between the two
      // arms. Lattice-verification evals are excluded by the worker and reported on their own line.
      rEvals += auditMain.rEvals;
    }
    const sags: number[] = []; let maxSag = 0; let maxT = -1; let minEdge = Infinity;
    let maxFixed = 0; let maxFixedT = -1;
    let fWa = 0; let fWb = 0; let fWc = 0; let fTheta = 0; let fZ = 0; let fR = 0; let fNl = 0; let fDd = 0; let fDB = 0; let fDC = 0;
    for (let li = 0; li < liveIdx.length; li += 1) {
      const t = liveIdx[li];
      const s = auditMain === null
        ? sagAdaptive(t, AUD_HS, AUD_NMIN, AUD_NMAX)      // HONEST ruler (absolute-bounded sampling)
        : auditMain.out[li * AUDIT_MAIN_STRIDE];
      const sf = auditMain === null
        ? sagOfN(t, oracleN)                              // STRATA-comparable fixed-N ruler
        : auditMain.out[li * AUDIT_MAIN_STRIDE + 1];
      sags.push(s);
      if (s > maxSag) { maxSag = s; maxT = t; }
      if (sf > maxFixed) {
        maxFixed = sf; maxFixedT = t;
        // In the pooled arm the argmax SAMPLE lives in a worker's scratch record; it is recovered below by
        // re-running the ruler on the single winning triangle. The reduction itself is unchanged either way.
        if (auditMain === null) {
          fWa = ARG.wa; fWb = ARG.wb; fWc = ARG.wc; fTheta = ARG.theta; fZ = ARG.z; fR = ARG.r; fNl = ARG.nl; fDd = ARG.dd; fDB = ARG.dB; fDC = ARG.dC;
        }
      }
      minEdge = Math.min(minEdge, eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t]));
    }
    if (auditMain !== null && maxFixedT >= 0) {
      // RULER FORENSICS, RECOVERED EXACTLY. `sagOfN` is pure and no vertex has moved, so re-running it on the
      // winner reproduces the identical ten doubles the serial arm captured inline. Its evaluations are
      // EXCLUDED from `rEvals` (snapshot and restore) so both arms print the same cost, and counted on their
      // own line so the recomputation is still visible rather than hidden.
      const saveF = rEvals;
      sagOfN(maxFixedT, oracleN);
      auditForensicEvals = rEvals - saveF;
      rEvals = saveF;
      fWa = ARG.wa; fWb = ARG.wb; fWc = ARG.wc; fTheta = ARG.theta; fZ = ARG.z; fR = ARG.r; fNl = ARG.nl; fDd = ARG.dd; fDB = ARG.dB; fDC = ARG.dC;
    }
    if (auditMain !== null && AUDIT_VERIFY) {
      // PF_CB_AUDIT_VERIFY=1 — THE PER-FACET IDENTITY GATE, the companion to the pool's rA lattice check and
      // the exact analogue of PF_CB_SWEEP_VERIFY. Re-score every facet HERE with the driver's own closures and
      // Object.is-compare. A mismatch THROWS: a pooled audit that disagrees with the serial one is not
      // "close", it is a different measurement, and every number below it would be meaningless.
      const saveV = rEvals;
      for (let li = 0; li < liveIdx.length; li += 1) {
        const t = liveIdx[li];
        const a2 = sagAdaptive(t, AUD_HS, AUD_NMIN, AUD_NMAX);
        const f2 = sagOfN(t, oracleN);
        auditVerifyChecked += 1;
        if (!Object.is(a2, auditMain.out[li * AUDIT_MAIN_STRIDE]) || !Object.is(f2, auditMain.out[li * AUDIT_MAIN_STRIDE + 1])) {
          throw new Error(
            `PF_CB_AUDIT_VERIFY: the pooled score for live triangle ${t} (slot ${li}) is NOT bit-identical to a `
            + `main-thread re-measurement. pooled adaptive=${auditMain.out[li * AUDIT_MAIN_STRIDE]} `
            + `fixed=${auditMain.out[li * AUDIT_MAIN_STRIDE + 1]}; main adaptive=${a2} fixed=${f2}. `
            + `The pooled audit would report a different mesh quality than the serial one. Refusing to continue.`);
        }
      }
      auditVerifyEvals = rEvals - saveV;
      rEvals = saveV;
    }
    // ADVERSARIAL TAIL: the per-triangle barycentric oracle can UNDER-report a straddled crest (it may sample past
    // the tent tip). Re-measure the worst K at a much denser oracle so a PASS cannot be a sampling artifact.
    const order = liveIdx.map((_t, i) => i).sort((p, q) => sags[q] - sags[p]).slice(0, Math.min(tailK, liveIdx.length));
    if (auditPooled && auditMesh !== null && order.length > 0) {
      const tailIds = new Int32Array(order.length);
      for (let j = 0; j < order.length; j += 1) tailIds[j] = liveIdx[order[j]];
      auditTail = await runAuditPool(auditCfgFor(auditMesh, packAuditTris(tailIds, ta, tb, tc), {
        kind: 'tail', count: order.length, audHs: AUD_HS, audNmin: AUD_NMIN, audNmax: AUD_NMAX, oracleN, tailN,
      }));
      rEvals += auditTail.rEvals;
    }
    let tailMax = 0; let tailT = -1;
    for (let j = 0; j < order.length; j += 1) {
      const t = liveIdx[order[j]];
      const s = auditTail === null ? sagOfN(t, tailN) : auditTail.out[j];
      if (s > tailMax) { tailMax = s; tailT = t; }
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
        for (const [p, qv] of pairs) {
          const k = locateKink(vth[p], vz[p], vth[p] + dTh(p, qv), vz[qv]);
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
          for (let k = 0; k <= LA_N; k += 1) {
            const u = k / LA_N;
            const th = t0h + dth2 * u; const z = z0h + (z1h - z0h) * u;
            const r = R(canon(th), z);
            const dd = Math.abs((r * Math.cos(th) - ax) * nx + (r * Math.sin(th) - ay) * ny + (z - az) * nz);
            if (dd > worst) worst = dd;
          }
        }
        if (worst > locusMax) { locusMax = worst; locusT = t; }
      }
    }

    const headlineMax = Math.max(maxSag, maxFixed, tailMax);
    // A MEASUREMENT IS NOT A VERDICT WHEN THE DRIVER NEVER FINISHED. `headlineMax <= TOL` was printed as PASS
    // even when the heap had merely been emptied by DROPPING over-tolerance triangles (see `unresolved`), or
    // when the run stopped on the triangle cap / the wall clock. In all three cases the reported max is a lower
    // bound on a mesh that was never refined to completion, so the verdict is NOT-CONVERGED, not PASS.
    // §3.4 EXTENDED WITH A FOURTH STATE, NEVER WEAKENED. Jump-class facets are DEFERRED-TO-CURTAIN, which is a
    // different fact from NOT-CONVERGED: no bisection driver can ever close them, so reporting them as
    // unresolved would make the signal worthless. The curtain stage does not exist yet, so `curtainStageRan` is
    // constant false — the state can only ever mean "tagged, not consumed".
    const curtainStageRan = false;
    const verdict = headlineMax > TOL ? 'FAIL'
      : (unresolvedLeft > 0 || capped || timeCapped) ? 'NOT-CONVERGED'
        : (SWEEP && curtainSites.length > 0 && !curtainStageRan) ? 'DEFERRED-TO-CURTAIN'
          : 'PASS';
    const sorted = sags.slice().sort((a, b) => a - b);
    const q = (p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    const over = sorted.filter((s) => s > TOL).length;
    const um = (mm: number): string => (mm * 1000).toFixed(3);
    const locus = (t: number): string => {
      if (t < 0) return 'n/a';
      const [a, b, c] = [ta[t], tb[t], tc[t]];
      const es = [eLen(a, b), eLen(b, c), eLen(c, a)].map((x) => (x * 1000).toFixed(1)).join('/');
      const zc = (vz[a] + vz[b] + vz[c]) / 3;
      return `z=[${[vz[a], vz[b], vz[c]].map((x) => x.toFixed(2)).join(',')}] (${((100 * zc) / H).toFixed(0)}% H) θ=[${[vth[a], vth[b], vth[c]].map((x) => x.toFixed(4)).join(',')}] edges(µm)=${es} feat=[${[vFeat[a], vFeat[b], vFeat[c]].map((f) => (f ? 1 : 0)).join('')}]`;
    };

    const outDir = join('research', 'exchange', '_strataConformBisect');
    mkdirSync(outDir, { recursive: true });
    // BOUNDED gets its own suffix: without it this would overwrite the exact baseline STLs the
    // 2026-07-27 re-audit measured, destroying the comparison the experiment exists to make.
    // PF_CB_TAG_SUFFIX exists for the same reason as the BOUNDED 'B' above: two runs that differ only by an
    // env knob (e.g. PF_CB_BND_NMAX) would otherwise share a filename and the second would silently destroy
    // the first, which is the comparison the experiment exists to make.
    // PF_CB_BND_DOOM gets a 'G' for the same reason as the 'B' above: it changes the refinement ORDER, so its
    // mesh is a different object and must not land on the guard-off filename.
    // RANK SUFFIX: 'B' = bounded, '' = plane, 'P' = ptperp. The first two are exactly the strings the legacy
    // BOUNDED flag produced, so every committed STL keeps its filename; 'ptperp' is a third mesh of the same
    // style/stage/levers and gets its own so an R1b run cannot overwrite either A/B arm.
    // DRIVER SUFFIX: 'W' = the Phase-1 sWeep driver (§7.2). Same reason as B/G/P — a sweep run is a different
    // mesh from the heap run with otherwise identical flags, and gothicarches_ring_DS-W.stl must not land on
    // gothicarches_ring_DS-.stl, which is the control the comparison exists to make.
    // TIGHTEN SUFFIX: 'T'. Same reason as B/G/P/W — a Phase-2 tightened run is a DIFFERENT MESH from the
    // control with otherwise identical flags, and it must not land on the control's filename. The control is
    // the thing every A/B in this campaign is measured against; overwriting it destroys the comparison.
    // SHAPE SUFFIX: 'H'. Same reason as B/G/P/W/T, and it is the most important one yet — the shape levers
    // default ON, so an unflagged run of this file after 2026-07-29 is a DIFFERENT MESH from every committed
    // baseline. Without this suffix the first such run would silently overwrite the exact STLs the blade
    // diagnosis was measured on. A control (PF_CB_SHAPE=0 PF_CB_MID3D=0 PF_CB_LONGFALL=0) drops the letter
    // and lands back on the historical filename, which is what makes the before/after census an A/B.
    const RANK_SUFFIX: Record<RankMode, string> = { bounded: 'B', plane: '', ptperp: 'P' };
    const SHAPE_SUFFIX = SHAPE || MID3D || LONGFALL ? 'H' : '';
    const tag = `${STYLE.toLowerCase()}_${STAGE}_${DIRECTED ? 'D' : 'l'}${SNAP ? 'S' : '-'}${REPROJ ? 'R' : '-'}${SWEEP ? 'W' : RANK_SUFFIX[RANK]}${SHAPE_SUFFIX}${BND_DOOM ? 'G' : ''}${tighten === null ? '' : 'T'}${process.env.PF_CB_TAG_SUFFIX ?? ''}`;
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
    if (cavDumps.length > 0) {
      writeFileSync(join(outDir, `${tag}.cavity-refusals.json`), `${JSON.stringify(cavDumps, null, 2)}
`, 'utf8');
    }

    // ─── S10: THE TRACED LOCI + JUNCTION DISKS, written beside the STL. This is P5's INPUT and it is a
    // deliverable whether or not the A/B wins: the junction disks are the enumerated target list the
    // junction-routing campaign needs, and nothing else in the pipeline produces them. Each disk carries a
    // REGION description — centre, radius, branch count, the minimum angle between branches, the measured
    // scatter of the evidence, and the branch DIRECTIONS with the point at which each leaves the disk — so
    // a router can consume it directly instead of re-deriving geometry from a bare point. ───
    if (alignedLoci !== null) {
      const rMidJ = 45;
      const disks = alignedLoci.junctions.map((j) => {
        const branches: Array<{ dirTheta: number; dirZ: number; exitTheta: number; exitZ: number }> = [];
        for (const id of j.lociIds) {
          const P = alignedLoci.loci[id]?.pts ?? [];
          for (let i = 0; i + 1 < P.length; i += 1) {
            const mTh = 0.5 * (P[i][0] + P[i + 1][0]); const mZ = 0.5 * (P[i][1] + P[i + 1][1]);
            const dth = dThRaw(canon(mTh), j.theta);
            const dd = Math.hypot(rMidJ * dth, mZ - j.z);
            if (dd > j.radiusMm * 1.25 || dd < j.radiusMm * 0.75) continue;
            const ux = rMidJ * dThRaw(j.theta, canon(mTh)); const uy = mZ - j.z;
            const n = Math.hypot(ux, uy) || 1;
            branches.push({ dirTheta: ux / n, dirZ: uy / n, exitTheta: canon(mTh), exitZ: mZ });
          }
        }
        return { ...j, branchDirs: branches.slice(0, 8) };
      });
      writeFileSync(join(outDir, `${tag}.loci.json`), JSON.stringify({
        schema: LOCUS_SCHEMA,
        run: { style: STYLE, params: styleParams, dims: DIMS, stage: STAGE, tag, gu, gv, tolMm: TOL, mistraceUm: AL_MISTRACE },
        meta: alignedLoci.meta,
        counts: alignedLoci.counts,
        seed: alignedStats,
        loci: alignedLoci.loci,
        junctions: disks,
      }, null, 1));
      // S18: the DECLARED PATCH PROVENANCE, beside the mesh it describes. This is exactly the shape
      // `_judgeShape`'s `CensusOptions.patches` consumes; Step 4's A/B hands this file to the blade gate.
      // Written even when EMPTY, so "no patches were declared" is a recorded fact rather than a missing file.
      writeFileSync(join(outDir, `${tag}.patches.json`), JSON.stringify({
        schema: 'pf.strata.patches/1',
        run: { style: STYLE, params: styleParams, dims: DIMS, stage: STAGE, tag },
        source: AL_PATCH === '' ? null : { regions: AL_PATCH, topN: AL_PATCH_TOPN, ids: AL_PATCH_IDS, maxMm: AL_PATCH_MAX },
        patches: alignedPatches,
      }, null, 1));
    }

    // ═══ S20 — THE STRAND LIST. THE PRODUCT, NOT A FAILURE REPORT. ═══
    // Every facet that ends the run still footprint-back-facing is an ADMISSION STRAND: the admission test
    // asked for geometry the bisection primitive could not deliver. Enumerated with everything the routed
    // demand needs — position, carrier geometry, and the locus/disk membership — so the M=g/h^2 primitive
    // and the declared-patch emitter consume a work order instead of a complaint.
    let admitStranded = 0; let admitAccepted = 0;
    // ═══ S20.1 DIAGNOSTIC — PF_CB_ADMIT_DIAG=1, DEFAULT OFF, CHANGES NO DECISION. ═══
    // The registered D1/D2 discriminators were specified as artifact-only, and D2's quantity — |atan2(y,x) -
    // vth| — is NOT IN THE ARTIFACT: an STL carries positions and no parametric theta. This block supplies
    // exactly that missing quantity and nothing else. It runs AFTER the STL has been written, touches no mesh
    // state, and feeds no accept/split/strand decision; `admitChecks` is snapshotted and restored around every
    // diagnostic call so the reported counter is bit-identical to a run without the flag.
    // THREE ANSWERS TO ONE QUESTION, so the disagreeing CHANNEL is named rather than guessed:
    //   A  f64 coordinates + stored vth        — what the driver's sweep answers today
    //   B  f32-round-tripped coordinates + vth — the values that SHIP, driver thetas (D1's fix, as registered)
    //   C  f32-round-tripped coordinates + atan2 thetas — exactly the judge's own inputs
    const ADMIT_DIAG = envOn('PF_CB_ADMIT_DIAG');
    const diag = { A: 0, B: 0, C: 0, AneB: 0, AneC: 0, BneC: 0, dThMax: 0, dThMaxV: -1 };
    if (ADMIT_DIAG) {
      // D2's registered quantity, measured over every vertex the mesh actually uses.
      for (let i = 0; i < vth.length; i += 1) {
        let d = Math.abs(dThRaw(canon(Math.atan2(vy[i], vx[i])), vth[i]));
        if (!Number.isFinite(d)) d = 0;
        if (d > diag.dThMax) { diag.dThMax = d; diag.dThMaxV = i; }
      }
    }
    /** the same test on a live triangle, but on the values that SHIP and/or on the judge's own thetas. */
    const footBackShipped = (t: number, judgeTheta: boolean): boolean => {
      const A = ta[t]; const B = tb[t]; const C = tc[t];
      const px = f32(vx[A]); const py = f32(vy[A]); const pz = f32(vz[A]);
      const qx = f32(vx[B]); const qy = f32(vy[B]); const qz = f32(vz[B]);
      const sx = f32(vx[C]); const sy = f32(vy[C]); const sz = f32(vz[C]);
      return footBack(px, py, pz, qx, qy, qz, sx, sy, sz,
        judgeTheta ? Math.atan2(py, px) : vth[A],
        judgeTheta ? Math.atan2(qy, qx) : vth[B],
        judgeTheta ? Math.atan2(sy, sx) : vth[C]);
    };
    if (ADMIT_NORMAL || ADMIT_NORMAL_SPLIT) {
      const strands: Array<Record<string, number | string>> = [];
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        admitAccepted += 1;
        if (ADMIT_DIAG) {
          const keep = admitChecks;
          const a = footBackT(t); const b = footBackShipped(t, false); const c = footBackShipped(t, true);
          admitChecks = keep;                           // the sweep's own single check below is the only one counted
          if (a) diag.A += 1;
          if (b) diag.B += 1;
          if (c) diag.C += 1;
          if (a !== b) diag.AneB += 1;
          if (a !== c) diag.AneC += 1;
          if (b !== c) diag.BneC += 1;
        }
        if (!footBackT(t)) continue;
        admitStranded += 1;
        if (strands.length >= 20000) continue;                 // the list is evidence, not a memory leak
        const A = ta[t]; const B = tb[t]; const C = tc[t];
        const e3 = [
          Math.hypot(vx[B] - vx[A], vy[B] - vy[A], vz[B] - vz[A]),
          Math.hypot(vx[C] - vx[B], vy[C] - vy[B], vz[C] - vz[B]),
          Math.hypot(vx[A] - vx[C], vy[A] - vy[C], vz[A] - vz[C]),
        ].sort((x, y) => x - y);
        strands.push({
          tri: t,
          theta: Number(canonTheta(Math.atan2((vy[A] + vy[B] + vy[C]) / 3, (vx[A] + vx[B] + vx[C]) / 3)).toFixed(6)),
          z: Number(((vz[A] + vz[B] + vz[C]) / 3).toFixed(5)),
          ar3: Number(aspect3(vx[A], vy[A], vz[A], vx[B], vy[B], vz[B], vx[C], vy[C], vz[C]).toFixed(3)),
          shortUm: Number((e3[0] * 1000).toFixed(1)),
          longUm: Number((e3[2] * 1000).toFixed(1)),
        });
      }
      writeFileSync(join(outDir, `${tag}.strands.json`), JSON.stringify({
        schema: 'pf.strata.strands/1',
        run: { style: STYLE, params: styleParams, dims: DIMS, stage: STAGE, tag },
        wiring: { accept: ADMIT_NORMAL, split: ADMIT_NORMAL_SPLIT },
        counts: {
          liveFacets: admitAccepted, stranded: admitStranded, listed: strands.length,
          admitChecks, admitRefusedSplit, admitForcedPush,
        },
        ...(ADMIT_DIAG ? { diag } : {}),
        strands,
      }, null, 1));
    }

    // ═══ S23 — THE COMPOSED ACCEPTANCE, RUN AS A CENSUS OVER CONSTRUCTED ELEMENTS ═══
    // WHY A CENSUS AND NOT A GATE, stated so it cannot be mistaken for a weakening. In the refinement
    // driver S1/S2/admission are SPLIT guards: they refuse a placement and the loop tries another. A
    // construction pass has no other placement to try — a constructed element is placed once and never
    // inherited (addendum A3's own words) — so the composed acceptance can only be an ADMISSION CONDITION
    // measured on what was built. Every facet is tested by all four clauses, on the values that SHIP, and
    // the result is written beside the STL as evidence rather than folded into a pass/fail line.
    //   S1  aspect3 <= PF_CB_SHAPE_AR (50), on f32-round-tripped coordinates
    //   S2  the (theta,z) FOLD — signed parametric area, anchored at the facet's own first vertex and
    //       measured through `dTh` so a seam-spanning facet is measured across the seam and not around it
    //   S20 footprint-normal admission, on the JUDGE's own inputs (f32 coords + atan2 thetas)
    //   A3  ALT_FLOOR 0.7629 um = 100 f32 ulp of z, bounding the shipped facet-normal error at 0.992 deg
    // PROVENANCE, transcribed from the seed's own `inDisk` (chart distance at rRef = 45, routed radius):
    // an over-cap facet inside a DECLARED region is a declared blade; one outside is a silent gate failure
    // and it is the number the preconditions bar.
    const ALT_FLOOR_MM = 0.0007629;
    const rcPatches = alignedPatches.map((p) => ({ th: p.theta, z: p.z, r: p.radiusMm }));
    const rcDeclared = (th: number, z: number): boolean => {
      for (const p of rcPatches) {
        if (Math.hypot(45 * dThRaw(canon(th), p.th), z - p.z) <= p.r) return true;
      }
      return false;
    };
    const rc = {
      facets: 0, s1Over: 0, s1OverDeclared: 0, s1OverUndeclared: 0,
      worstAR: 0, worstARUndeclared: 0, s2Fold: 0, s2Zero: 0,
      admitBack: 0, altBelow: 0, altBelowDeclared: 0, altMinUm: Infinity, declaredFacets: 0,
      worstARSite: { th: 0, z: 0, ar: 0 },
    };
    if (RECON !== '') {
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        const A = ta[t]; const B = tb[t]; const C = tc[t];
        const ax = f32(vx[A]); const ay = f32(vy[A]); const az = f32(vz[A]);
        const bx = f32(vx[B]); const by = f32(vy[B]); const bz = f32(vz[B]);
        const cx2 = f32(vx[C]); const cy2 = f32(vy[C]); const cz2 = f32(vz[C]);
        rc.facets += 1;
        const cth = canon(Math.atan2((ay + by + cy2) / 3, (ax + bx + cx2) / 3));
        const czc = (az + bz + cz2) / 3;
        const dec = rcDeclared(cth, czc);
        if (dec) rc.declaredFacets += 1;
        // S1
        const ar = aspect3(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
        if (ar > rc.worstAR) { rc.worstAR = ar; rc.worstARSite = { th: Number(cth.toFixed(6)), z: Number(czc.toFixed(5)), ar: Number(ar.toFixed(3)) }; }
        if (ar > SHAPE_AR) { rc.s1Over += 1; if (dec) rc.s1OverDeclared += 1; else rc.s1OverUndeclared += 1; }
        if (!dec && ar > rc.worstARUndeclared) rc.worstARUndeclared = ar;
        // S2 — anchored at A, through dTh, so the seam is crossed the short way
        const t0 = vth[A];
        const sPar = signedAreaParam(t0, vz[A], t0 + dTh(A, B), vz[B], t0 + dTh(A, C), vz[C]);
        if (sPar < 0) rc.s2Fold += 1; else if (sPar === 0) rc.s2Zero += 1;
        // S20 — the judge's own inputs
        if (footBackShipped(t, true)) rc.admitBack += 1;
        // A3 — minimum altitude = 2*area / longest edge, on the shipped values
        const e0 = Math.hypot(bx - ax, by - ay, bz - az);
        const e1 = Math.hypot(cx2 - bx, cy2 - by, cz2 - bz);
        const e2 = Math.hypot(ax - cx2, ay - cy2, az - cz2);
        const ux = bx - ax; const uy = by - ay; const uz = bz - az;
        const wx = cx2 - ax; const wy = cy2 - ay; const wz = cz2 - az;
        const area2 = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
        const alt = area2 / Math.max(1e-30, Math.max(e0, e1, e2));
        if (alt < rc.altMinUm) rc.altMinUm = alt;
        if (alt < ALT_FLOOR_MM) { rc.altBelow += 1; if (dec) rc.altBelowDeclared += 1; }
      }
      rc.altMinUm = Number.isFinite(rc.altMinUm) ? rc.altMinUm * 1000 : -1;
      writeFileSync(join(outDir, `${tag}.accept.json`), JSON.stringify({
        schema: 'pf.strata.accept/1',
        run: { style: STYLE, params: styleParams, dims: DIMS, stage: STAGE, tag },
        field: {
          path: RECON, floorUm: RECON_FLOOR * 1000, alpha: RECON_ALPHA,
          beta: RECON_BETA, cand: RECON_CAND, scale: RECON_SCALE,
          stats: reconField === null ? null : reconField.stats,
        },
        bars: { shapeAR: SHAPE_AR, altFloorUm: ALT_FLOOR_MM * 1000 },
        declaredRegions: rcPatches.length,
        census: rc,
      }, null, 1));
    }

    // ═══════════════ S25 — THE `unresolved` LIST, PER FACET (PF_CB_EMIT_UNRESOLVED=1) ═══════════════
    // The population the S24 close-out believed `strands.json` carried. See the declaration site for why
    // the two are different things and why an empty strands file is a PASS rather than a missing list.
    //
    // PLACED HERE, AFTER `rcDeclared`, ON PURPOSE: the routing arm's G4 precondition is that an over-cap
    // routed facet must be inside a DECLARED region, so the declaration bit has to ride with the facet or
    // the arm would have to re-derive it from a second copy of the patch geometry. One definition, used by
    // the accept census and by this list.
    //
    // WHAT IS DELIBERATELY *NOT* HERE: H2 and H1. Neither is cheap in this process — H2 needs the
    // surface->mesh sampler and H1 the certified-bound machinery, both of which live in the audit and are
    // the instruments every arm in this campaign is scored on. Computing an approximation of either here
    // would create a THIRD ruler that nothing has validated, against the standing rule that the refinement
    // ruler must equal the audit ruler. What IS emitted is the driver's own two rulers, named as such:
    // `keyUm` (the sag key this facet was popped at, i.e. what the driver believed when it gave up) and
    // `sagNowUm` (the same edge ruler re-read on the FINAL mesh). The audit reads the true error; these two
    // say what the driver could see. The gap between them is the blindness this campaign keeps measuring.
    if (EMIT_UNRESOLVED) {
      const uCap = 20000;
      const facets: Array<Record<string, number | string | boolean>> = [];
      // The FINAL set: still in the map AND still alive in the mesh that ships.
      let finalCount = 0; let finalWorst = 0; let whyUnknown = 0; let declaredCount = 0; let overCapCount = 0;
      const snapIds = new Set<number>();
      for (const [t] of unresolvedSnap) snapIds.add(t);
      const finalIds = new Set<number>();
      for (const [t, k] of unresolved) {
        if (!alive[t]) continue;
        finalCount += 1; finalIds.add(t);
        if (k > finalWorst) finalWorst = k;
        if (facets.length >= uCap) continue;             // the list is evidence, not a memory leak
        const A = ta[t]; const B = tb[t]; const C = tc[t];
        const ax = f32(vx[A]); const ay = f32(vy[A]); const az = f32(vz[A]);
        const bx = f32(vx[B]); const by = f32(vy[B]); const bz = f32(vz[B]);
        const cx2 = f32(vx[C]); const cy2 = f32(vy[C]); const cz2 = f32(vz[C]);
        const e3 = [
          Math.hypot(bx - ax, by - ay, bz - az),
          Math.hypot(cx2 - bx, cy2 - by, cz2 - bz),
          Math.hypot(ax - cx2, ay - cy2, az - cz2),
        ].sort((x, y) => x - y);
        const cth = canonTheta(Math.atan2((ay + by + cy2) / 3, (ax + bx + cx2) / 3));
        const czc = (az + bz + cz2) / 3;
        const ar = aspect3(ax, ay, az, bx, by, bz, cx2, cy2, cz2);
        // parAR — VERBATIM `_strataParARCensus`'s arithmetic (R_REF = 45, shortest-arc deltas anchored at
        // the first vertex), on the f32 values that SHIP, so this column is directly comparable to the
        // offline parAR census every arm is scored with rather than being a second definition.
        const th0 = canonTheta(Math.atan2(ay, ax));
        const th1 = canonTheta(Math.atan2(by, bx));
        const th2 = canonTheta(Math.atan2(cy2, cx2));
        const pe = [
          Math.hypot(45 * dThRaw(th0, th1), bz - az),
          Math.hypot(45 * dThRaw(th1, th2), cz2 - bz),
          Math.hypot(45 * dThRaw(th2, th0), az - cz2),
        ];
        const sp2 = Math.abs(45 * (dThRaw(th0, th1) * (cz2 - az) - dThRaw(th0, th2) * (bz - az)));
        const parAR = sp2 > 0 ? (Math.max(...pe) * (pe[0] + pe[1] + pe[2])) / (2 * sp2) : Infinity;
        const why = unresolvedWhy.get(t) ?? 'unknown';
        if (why === 'unknown') whyUnknown += 1;
        const dec = rcDeclared(cth, czc);
        if (dec) declaredCount += 1;
        if (ar > SHAPE_AR) overCapCount += 1;
        facets.push({
          tri: t,
          theta: Number(cth.toFixed(6)),
          z: Number(czc.toFixed(5)),
          shortUm: Number((e3[0] * 1000).toFixed(1)),
          midUm: Number((e3[1] * 1000).toFixed(1)),
          longUm: Number((e3[2] * 1000).toFixed(1)),
          ar3: Number(ar.toFixed(3)),
          parAR: Number.isFinite(parAR) ? Number(parAR.toFixed(3)) : -1,
          keyUm: Number((k * 1000).toFixed(4)),
          sagNowUm: Number((worstEdgeSag(t) * 1000).toFixed(4)),
          why,
          declared: dec,
          inSnapshot: snapIds.has(t),
        });
      }
      let diedSinceReduction = 0;
      for (const [t] of unresolvedSnap) if (!alive[t] || !unresolved.has(t)) diedSinceReduction += 1;
      let addedSinceReduction = 0;
      for (const t of finalIds) if (!snapIds.has(t)) addedSinceReduction += 1;
      writeFileSync(join(outDir, `${tag}.unresolved.json`), JSON.stringify({
        schema: 'pf.strata.unresolved/1',
        run: { style: STYLE, params: styleParams, dims: DIMS, stage: STAGE, tag, tolMm: TOL, acceptTolMm: acceptTol },
        // The two populations, both named, so a consumer cannot quote one believing it is the other.
        // `atReduction` is the number the run's own `unresolved:` report line prints and the number every
        // worklog row quotes. `final` is what is still unresolved in the SHIPPED mesh. They differ by the
        // resume pass and the difference is itemised rather than reconciled silently.
        counts: {
          atReduction: unresolvedLeft,
          atReductionWorstUm: Number((unresolvedMax * 1000).toFixed(3)),
          final: finalCount,
          finalWorstUm: Number((finalWorst * 1000).toFixed(3)),
          diedSinceReduction,
          addedSinceReduction,
          listed: facets.length,
          cap: uCap,
          truncated: finalCount > uCap,
          declaredOfListed: declaredCount,
          overShapeCapOfListed: overCapCount,
          whyUnknownOfListed: whyUnknown,
        },
        bars: { shapeAR: SHAPE_AR, declaredRegions: rcPatches.length },
        // Named so the artifact cannot be read as a fidelity claim. See the block comment above.
        rulers: {
          keyUm: 'the driver sag key this facet was popped at — DRIVER SELF-REPORT, never a fidelity number',
          sagNowUm: 'the same edge ruler re-read on the final mesh — DRIVER SELF-REPORT',
          h1h2: 'NOT COMPUTED HERE. The audit is the instrument; a third ruler in this file would be unvalidated.',
        },
        facets,
      }, null, 1));
    }

    // ─── §5.4 THE RUN MANIFEST. Written beside the STL, ALWAYS (it does not touch a byte of the STL).
    // Nothing else ties an STL to the surface it was built on: DIMS is a file-local constant, STYLE defaults
    // to 'GothicArches', and the STL header carries a fixed string. The auditor currently has to be TOLD the
    // style by hand on a command line, and a GothicArches loci set fed back into a GeometricStar run would
    // produce a plausible, fully formatted, entirely meaningless mesh with nothing detecting it. This makes
    // the mesh -> audit -> loci -> mesh chain CHECKED instead of asserted, which is the whole reason the
    // sizing-field artifact carries its provenance as a payload field rather than as a comment. ───
    const manifest: Phase2RunManifest = {
      schema: PHASE2_RUN_SCHEMA,
      style: STYLE, params: styleParams, dims: DIMS, H, stage: STAGE,
      tolMm: TOL, acceptTolMm: acceptTol, gridU: gu, gridV: gv, triCap,
      driver: DRIVER, rank: SWEEP ? 'n/a' : RANK, directed: DIRECTED, snap: SNAP, reproj: REPROJ,
      key: phase2Key(STYLE, styleParams, DIMS, TOL, STAGE),
      tag, stl: `${tag}.stl`, nTri: soup.length, alloc: ta.length,
      unresolvedLeft, capped, timeCapped, curtainSites: curtainCells.size,
      verdict, headlineMaxMm: headlineMax, secs: (Date.now() - t0ms) / 1000,
      tighten: tightenSrc,
      generatedAt: new Date().toISOString(),
    };
    writeJsonFile(join(outDir, `${tag}.run.json`), manifest);

    // ─── S29 STRAND LIST. Written whenever the override is armed, ZERO OR NOT. The registration's
    // expect-nonzero clause is only meaningful if the count can be read either way from an artifact: "zero
    // strands with the bound not falling means the wiring is BROKEN, not that the mesh healed". S28's
    // toothless S5b is the precedent this refuses to repeat. ───
    if (s29 !== null) {
      const st = s29.stats();
      writeFileSync(join(outDir, `${tag}.s29strands.json`), JSON.stringify({
        schema: 'pf.strata.s29.strands/1',
        run: { style: STYLE, params: styleParams, dims: DIMS, stage: STAGE, tag, tolMm: TOL, acceptTolMm: acceptTol },
        override: {
          file: OVERRIDE_PATH, barUm: s29.file.tolUm,
          members: s29.file.counts.members, sites: s29.file.sinkGuard.sites,
          budgetN: s29.file.sinkGuard.budgetN, fallRatio: s29.file.sinkGuard.fallRatio,
          sourceStl: s29.file.source.stl, sourceMd5: s29.file.source.stlMd5,
          cellFractionPct: s29.file.cellGrid.surfaceFractionPct,
        },
        stats: { ...st, ovForcedPush, ovNeedSize },
        // EXPECT-NONZERO is declared IN the artifact, so a reader who never saw the registration still
        // knows which way to read a zero.
        expectNonzero: 'Some strands are EXPECTED on the h¹ tail. ZERO strands together with an interior '
          + 'certified bound that did not fall is a STOP-and-diagnose (broken wiring), not a result.',
        strands: s29.strands(),
      }, null, 1));
    }

    const report = [
      '',
      `===== STRATA CONFORMING-BISECTION: ${STYLE} ${STAGE.toUpperCase()}  [${DIRECTED ? 'DIRECTED' : 'lepp'} | ${SNAP ? 'SNAP' : 'no-snap'} | ${REPROJ ? 'REPROJ' : 'no-reproj'}] =====`,
      `params ${JSON.stringify(styleParams)}`,
      // WHICH QUANTITY DROVE THIS MESH. Three modes now produce three different meshes from otherwise identical
      // flags, and the tag suffix alone (B / '' / P) is not self-explanatory in a directory listing.
      ...(SWEEP ? [
        'driver: PF_CB_DRIVER=sweep — PHASE-1 FIFO SWEEP. NO RANKING KEY EXISTS. The work list is a plain FIFO and',
        `  the accept test is a THRESHOLD: a triangle needs work iff some edge has an UNCONFORMED located crossing`,
        `  (conformance radius PF_CB_CONF_UM ${(CONF_MM * 1000).toFixed(3)} µm, ABSOLUTE ⇒ it terminates) or some edge has`,
        `  edgeSag > acceptTol ${um(acceptTol)} µm (absolute pitch ${REF_HS}mm, n∈[${ES_N},${REF_NMAX}]). edgeSag is size-correlated and`,
        '  would be largest-first if RANKED — it is admissible ONLY because it is compared against a CONSTANT.',
        `  SNAP_ALPHA ${SNAP_ALPHA} survives ONLY as the sliver guard on WHERE a new vertex may be placed.`,
        `  ablations: PF_CB_DIRECTED=${DIRECTED ? '1 (size route splits the max-edgeSag edge)' : '0 (size route splits the LONGEST edge)'}`,
        `             PF_CB_SNAP=${SNAP ? '1 (class router ON: smooth→size, crease→snap, jump→curtain)' : '0 (CLASS ROUTER OFF — pure size threshold, no conformance, no curtain)'}`,
        `  INERT under sweep: PF_CB_NUDGE (refineOne calls bisectAt directly and never enters splitEdge — the`,
        '    nudge ladder is DELETED, not tuned: it turns one refusal into 11 rA-bearing attempts and its',
        '    SUCCESSES place a vertex up to 35% of the edge from where the geometry asked for it);',
        `    PF_CB_REPROJECT${REPROJ ? '=1 — NOT WIRED into the sweep path in Phase 1 (§3.2 refineOne does one bisectAt per pop)' : ''};`,
        '    PF_CB_RANK / PF_CB_BOUNDED (refused loudly if set); PF_CB_GPU_RANK (becomes the Phase-2 engine, not built yet).',
      ] : []),
      ...(SWEEP ? [] : [`rank/accept: PF_CB_RANK=${RANK} — ${RANK === 'bounded'
        ? `sagBounded: point-to-TRIANGLE witness + measured covering gap, escalating n=${BND_N}→${BND_NMAX}`
        : RANK === 'ptperp'
          ? `sagPtPerp: point-to-TRIANGLE witness, ONE pass at absolute pitch ${REF_HS}mm, n∈[${REF_NMIN},${REF_NMAX}], NO covering term, NO escalation`
          : ADAPT
            ? `sagAdaptive: INFINITE-PLANE distance, absolute pitch ${REF_HS}mm, n∈[${REF_NMIN},${REF_NMAX}]`
            : `sagOfN: INFINITE-PLANE distance, fixed n=${oracleRef}`}   acceptTol ${um(acceptTol)} µm`]),
      ...(tighten === null ? [] : [
        `PHASE-2 TIGHTENING FIELD: ${TIGHTEN_PATH}`,
        `  ${tighten.clusters} loci, ball radius ${(tighten.radiusMm * 1000).toFixed(0)} µm, max tolScale ${tighten.maxScale.toFixed(2)}×`,
        `  ⇒ localTol = acceptTol/tolScale inside a ball, EXACTLY acceptTol outside. The field can only TIGHTEN.`,
        `  consider() calls inside a ball ${tightenHits}   of which queued ONLY because of the field ${tightenPushes}`,
        `  floor-refused inside a ball ${tightenFloorHits}${tightenFloorHits > 0 ? '   *** these are REFINEMENT-FLOOR facts inside the region Phase 2 asked to close — not accepts ***' : ''}`,
        // Not a warning. The field takes whichever of the two lookups is cheaper, and with a handful of loci
        // the ${(tighten.cellMm * 1000).toFixed(0)} µm cell ring (>= 27 cells) always costs more than touching every cluster — so a SMALL
        // field is 100 % linear by design. It becomes informative once the field is large, where a high count
        // means coarse triangles are dominating the queries.
        `  lookups taken linearly ${tighten.linearScans()} (whole-list scan chosen over a ${(tighten.cellMm * 1000).toFixed(0)} µm cell ring; with ${tighten.clusters} clusters that is expected)`,
      ]),
      // ─── S29 ACCEPT-OVERRIDE. Printed ALWAYS when armed, and the STRAND COUNT is printed zero or not —
      // the registration's expect-nonzero clause turns on being able to read it either way. ───
      ...(s29 === null ? [] : (() => {
        const st = s29.stats(); const str = s29.strands();
        const f = s29.file;
        return [
          `--- S29 ACCEPT-OVERRIDE: ${OVERRIDE_PATH} ---`,
          `  rule: accept ⟺ blindAccept AND (listed ? perp ≤ ${f.tolUm} µm : true).  The plane ruler still RANKS;`
          + `  the heap key, acceptTol (${um(acceptTol)} µm) and the h⁰ jump routing are UNTOUCHED.`,
          `  membership ${f.counts.members} facets = ${f.counts.over} over-TOL − ${f.counts.rim} rim − ${f.counts.cage} cage`
          + `   [src ${f.source.stl} md5 ${f.source.stlMd5.slice(0, 8)}…]`,
          `  carried as a (θ,z) REGION — ${f.cellGrid.cells} cells of ${f.cellGrid.nTheta}×${f.cellGrid.nZ}`
          + ` = ${f.cellGrid.surfaceFractionPct.toFixed(3)}% of the domain (tri indices do not survive a from-scratch remesh)`,
          `  listed tests ${st.listedTests}, hits ${st.listedHits}   perp evaluations ${st.perpEvals}, REJECTS ${st.perpRejects}`,
          `  geometry-keyed cache: ${st.memoHits} hits / ${st.memoHits + st.perpEvals} lookups`
          + ` = ${st.memoHits + st.perpEvals > 0 ? ((100 * st.memoHits) / (st.memoHits + st.perpEvals)).toFixed(1) : '0.0'}%`
          + ` — an INDEX-keyed memo missed every facet conformity re-created under a new index`,
          `  forced pushes: consider() ${ovForcedPush}   triangleNeed() 'none'→'size' ${ovNeedSize}`,
          `  worst perpendicular reading seen ${st.maxPerpUm.toFixed(3)} µm`,
          `  realised seed pitch (REGISTERED ≤ 2.1817e-3 rad, ≤ 0.0625 mm): dθ ${st.worstDTheta.toExponential(4)}  dz ${st.worstDz.toExponential(4)}`,
          // ─── PF_CB_FPVETO. PRINTED EITHER WAY, so a control run declares WHICH ruler priced its accepts
          // rather than leaving it to be inferred from the cost. The foot-point ruler has no seed grid, so
          // the registered seed-pitch line above reads 0 under it BY CONSTRUCTION — that is not a miss. ───
          `  point ruler: ${st.fpVeto
            ? `FOOT-POINT (PF_CB_FPVETO=1) — Gauss-Newton from the facet's parameter-space centroid, bounded to`
              + ` its padded (θ,z) footprint; ${st.fpPoints} lattice points tightened`
            : 'S29 REGISTERED (sweep + coordinate descent + damped Newton) — PF_CB_FPVETO off'}`,
          `  rA evaluations spent on the accept test ${st.rAEvals}`
          + ` = ${st.perpEvals > 0 ? (st.rAEvals / st.perpEvals).toFixed(0) : '0'} per honest accept test`
          + ` (S29 iteration 1 measured ~2,844 and did not converge inside 5,400 s)`,
          `  SINK GUARD: N=${f.sinkGuard.budgetN} splits/site, re-strand unless the reading falls ≥${f.sinkGuard.fallRatio}×`
          + `   sites ${f.sinkGuard.sites}`,
          `  *** STRANDED SITES ${st.strandedSites} (${st.strandedMembers} member facets) ***`
          + (st.strandedSites === 0
            ? '   — EXPECT-NONZERO: zero strands with the certified bound NOT falling means the wiring is broken, not that the mesh healed. STOP and diagnose.'
            : '   — expected on the h¹ tail; these reverted to blind accept and the loop continued.'),
          ...str.slice(0, 24).map((s) => `    strand θ ${s.theta.toFixed(4)} z ${s.z.toFixed(3)}`
            + `  entry ${s.entryUm.toFixed(3)} µm → best ${s.bestUm.toFixed(3)} µm (×${s.ratio.toFixed(2)})`
            + `  ${s.splits} splits, ${s.members} members`),
          ...(str.length > 24 ? [`    … and ${str.length - 24} more (full list in the .s29strands.json artifact)`] : []),
        ];
      })()),
      `grid ${gu}×${gv} (${initTris} init tris) → ${soup.length} tris (alloc ${ta.length}/${triCap})${capped ? '  [CAPPED]' : ''}${timeCapped ? `  [TIME-CAPPED @ ${MAXSECS}s — NOT converged, this is a TRAJECTORY not a verdict]` : ''}   ${((Date.now() - t0ms) / 1000).toFixed(0)}s, ${(rEvals / 1e6).toFixed(0)}M rA evals`,
      `splits ${iters}   snaps ${nSnap} (jump-class ${nJump})   transverse re-solves ${nReproj}   z-steps ${zSteps.length}`,
      `cleanup: collapsed ${collapsedTris} tris (safe-collapse ${safeCollapses}, link-refused ${refusedCollapses} with ${refusedOffenders} offenders, flips ${flipsDone}, flips-refused-on-locus ${flipsLocusRefused})   welded-splits ${weldedSplits}${NOWELD ? ' (REFUSED)' : ' (allowed)'}`,
      // ─── L5 SHAPE TERM. Printed ALWAYS, including when every lever is off, so a control run says so in
      // its own report rather than by the absence of a block. ───
      `--- SHAPE (L5, 2026-07-29 blade fix) ---`,
      `  levers: PF_CB_SHAPE=${SHAPE ? `1 cap AR>${SHAPE_AR}` : '0 *** GUARD OFF — this run REPRODUCES the blade defect ***'}` +
        `  fold=${SHAPE_FOLD ? 1 : 0}  mid3d=${MID3D ? `1 (${MID3D_ITERS} halvings, |shift| cap ${MID3D_MAXSHIFT})` : '0 (parametric midpoint — the measured 0.819 off-centre bias is BACK)'}  longfall=${LONGFALL ? 1 : 0}`,
      `  guard: ${nShapeChecks} split candidates scored, ${nShapeChildren} child facets (BOTH sides of every edge)`,
      `  refused: ${nShapeRefusedAR} on aspect (>${SHAPE_AR}), ${nShapeRefusedFold} on (θ,z) FOLD${SWEEP ? `   ⇒ shape-unresolved ${nShapeUnresolved}` : '   ⇒ heap driver: a fully-refused triangle lands in `unresolved` via the no-op-split path'}`,
      // "ADMITTED", not "committed": the S4 probe scores candidate placements it may never take, so this is
      // an UPPER bound on the worst child that actually landed. That is the direction that makes it a
      // useful invariant — it must never exceed the cap.
      `  worst child AR the guard ever ADMITTED: ${SHAPE ? `${shapeWorstAdmitted.toFixed(2)} (must be <= ${SHAPE_AR})` : 'n/a — guard off, nothing was scored'}`,
      `  3-D midpoint: ${nMid3dSolves} solves, mean |s-frac| ${nMid3dSolves > 0 ? (mid3dShiftSum / nMid3dSolves).toFixed(5) : 'n/a'}, max ${mid3dShiftMax.toFixed(5)}, clamped ${nMid3dClamped}`,
      `  longest-edge preference: tested ${nLongFallTested}, FIRED ${nLongFallFired} (max-sag edge inadmissible AND longest edge admissible)`,
      `  V2-L1 LAST-CHANCE PLACEMENT SEARCH: PF_CB_LASTCHANCE=${LASTCHANCE}`
        + (LASTCHANCE <= 0
          ? '  [OFF — this fork is then the HEAD driver verbatim]'
          : `  reached ${lcTried} abandoned facets, RESCUED ${lcRescued}`
            + ` (${lcTried === 0 ? 'n/a' : `${((100 * lcRescued) / lcTried).toFixed(1)}%`})`
            + ` in ${lcProbes} bisectAt probes   [jam census predicted ~28.1%]`),
      `  V2-L2 IN-LOOP CONSTRAINED-CAVITY ESCALATION: PF_CB_CAVITY=${CAVITY}`
        + (CAVITY <= 0
          ? '  [OFF]'
          : ` patch, rings ${CAVITY_RINGS}, budget ${CAVITY_BUDGET}\n`
            + `    escalated ${cavTried} facets that had exhausted every cheaper move`
            + ` → ${cavAccepted} CERTIFIED, ${cavApplied} applied`
            + ` (${cavTried === 0 ? 'n/a' : `${((100 * cavApplied) / cavTried).toFixed(1)}%`})\n`
            + `    connectivity: removed ${cavRemoved} triangles, added ${cavAdded}`
            + ` (net ${cavAdded - cavRemoved >= 0 ? '+' : ''}${cavAdded - cavRemoved});`
            + ` ${cavOrphanAbort} aborted after a weld collapse\n`
            + `    diagnostics: patch p̄ ${cavTried === 0 ? 0 : Math.round(cavPatchSum / cavTried)} tris,`
            + ` constraint chains p̄ ${cavTried === 0 ? 0 : (cavChainSum / cavTried).toFixed(1)},`
            + ` adaptive steps p̄ ${cavTried === 0 ? 0 : (cavStepSum / cavTried).toFixed(1)};`
            + ` blocking witness seen ${cavSawWitness}/${cavTried};`
            + ` *** cavity reached the EXTRACTED PATCH RIM ${cavHitPatchRim}/${cavTried} *** (an artificial`
            + ` boundary: a longest-edge-boundary refusal there means the patch was too small, NOT that the`
            + ` geometry is unfixable — raise PF_CB_CAVITY)
`
            + `    refusals: ${[...cavRefusals].sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${v}`).join('  ') || 'none'}\n`
            + '    NB every applied cavity passed the planner\'s full certificate (constraints recovered,'
            + ' zero proper crossings, AR ≤ cap, Euler equal, boundary frozen, visual strictly improved).'),
      // ─── S6 POST-LOOP INVARIANT. Printed ALWAYS, including when the lever is off, so a control run says so
      // in its own report rather than by the absence of a block — the same convention as the SHAPE block. ───
      `  post-loop guard: PF_CB_POST_SHAPE=${POST_SHAPE ? 1 : 0}${SHAPE ? '' : ' (INERT — PF_CB_SHAPE=0, so the control is byte-unchanged)'}   cap AR>${SHAPE_AR}, metric = _shapeGuard.aspect3 (the census's own)`,
      `    initial grid: ${gridOverCap} of ${initTris} facets over the cap, worst AR ${gridWorstAR.toFixed(2)}`
        + `${gridOverCap > 0 ? '   *** BORN OVER THE CAP. No split guard can have caused these and none can repair them — S1 refuses their splits, so they are FROZEN into the STL. Expect the blade gate to count them. ***' : ''}`,
      `    collapse: ${nPostCollapseTested} tested, refused ${nPostCollapseRefusedAR} on aspect + ${nPostCollapseRefusedFold} on (θ,z) FOLD`
        + `${nPostCollapseRefusedDirty > 0 ? `   *** ${nPostCollapseRefusedDirty} of the aspect refusals LEFT A FACET ALREADY OVER THE CAP in place — visible, not silent ***` : ''}`,
      `    flip (collapse-driven, PF_CB_FLIP=${FLIP_ON ? 1 : 0}): ${nPostFlipTested} gate calls, refused ${nPostFlipRefusedAR} on aspect   [tryFlip sign-checks (θ,z) itself, so this path cannot fold]`,
      `    worst AR any ADMITTED post-loop operation left behind: ${POST_SHAPE ? postWorstAdmitted.toFixed(2) : 'n/a — lever off, nothing was scored'}`,
      // S6-PILOT block — printed ONLY when requested, so every flag-off report stays byte-identical to today.
      ...(envOn('PF_CB_SLIVER_COLLAPSE') ? [
        `  S6-PILOT sliver collapse-and-resume: ${sliverRan ? 'RAN' : 'REQUESTED BUT NOT RUN (needs the heap driver: no SWEEP/GPU_RANK, and PF_CB_SAFE_COLLAPSE not 0)'}`,
        `    offenders (AR > ${SLIVER_AR}): BEFORE ${sliverOffendersBefore} → AFTER ${sliverOffendersAfter}   tested ${sliverTested}, collapsed ${sliverCollapsed}`,
        `    refused: ${sliverRefusedLen} on shortest-edge >= ${(SLIVER_MAX_MM * 1000).toFixed(1)} um (CAP family — out of scope BY DESIGN, motion is capped at TOL/2), ${sliverRefusedOther} on link/shape (split carried by the S6 collapse counters above)`,
        `    resume: ${sliverResumeSplits} splits on +${sliverResumeBudgetUsed} of ${SLIVER_RESUME_BUDGET} budget${sliverResumeCapped ? '  [RESUME-CAPPED]' : ''}   unresolved AFTER ${sliverUnresolvedAfter} (worst ${(sliverUnresolvedWorstAfter * 1000).toFixed(3)} um)`,
      ] : []),
      ...(ADMIT_NORMAL || ADMIT_NORMAL_SPLIT ? [
        `  S20 EMIT-TIME FOOTPRINT-NORMAL ADMISSION: accept-side ${ADMIT_NORMAL ? 'ON' : 'off'}, split-side ${ADMIT_NORMAL_SPLIT ? 'ON' : 'off'}`
          + `   (A2 semantics: >=90 deg against the MOST FAVOURABLE of five candidate normals at the centroid AND all three vertex`
          + ` parameter points; centroid-back + vertex-front is FEATURE-SPANNING and stays admissible)`,
        `    ${admitChecks} admission checks   ${admitForcedPush} accepts REFUSED and re-queued   ${admitRefusedSplit} splits REFUSED on admission`
          + `   ADMISSION-STRANDED at the end: ${admitStranded} of ${admitAccepted} live facets`
          + `   ${admitStranded > 5000 || (admitAccepted > 0 && admitForcedPush > 0.25 * admitAccepted) ? '*** INFEASIBLE-AS-WIRED — refusal-storm criterion FIRED (registered: refusals > 25% of accepts, or strands > 5,000) ***' : '[refusal-storm criterion NOT fired]'}`,
        // S25 CORRECTION. This line used to read "the ROUTED-DEMAND input for M=g/h^2 elements and declared
        // patches, not a failure report" — UNCONDITIONALLY, including on the runs where the list is empty,
        // which is every run where admission is clean. S24's close-out transcribed it and booked a 4,675-facet
        // routing input that does not exist in this file (the 4,675 is `unresolved`, a different population,
        // emitted separately under PF_CB_EMIT_UNRESOLVED). A report line that asserts what an artifact is FOR
        // is a claim about a consumer, not a measurement, and it inherited a measurement's authority. It now
        // states the COUNT and names the file that actually carries the routed demand.
        `    strand list: ${tag}.strands.json — ${admitStranded} ADMISSION-stranded facet(s) listed${admitStranded === 0 ? '  [EMPTY = the S20 admission criterion is clean; this is a PASS, not a missing list]' : ''}`,
        `      NOT the M=g/h^2 routing input. That population is \`unresolved\` (shape-refused, ${unresolvedLeft} at the reduction point) and is emitted to ${tag}.unresolved.json only under PF_CB_EMIT_UNRESOLVED=1${EMIT_UNRESOLVED ? '  [ON — written]' : '  [OFF — not written this run]'}`,
        ...(ADMIT_DIAG ? [
          '    *** S20.1 DIAGNOSTIC (PF_CB_ADMIT_DIAG=1) — the same sweep answered three ways. NO DECISION USED IT. ***',
          `      A f64 coords + stored vth        : ${diag.A}   <- what the strand count above reports`,
          `      B f32-SHIPPED coords + stored vth: ${diag.B}   (differs from A on ${diag.AneB} facets)`,
          `      C f32-SHIPPED coords + atan2 theta: ${diag.C}   (differs from A on ${diag.AneC}, from B on ${diag.BneC})`,
          `      D2's registered quantity, worst over ${vth.length} vertices: |atan2(vy,vx) - vth| = ${diag.dThMax.toExponential(3)} rad (vertex ${diag.dThMaxV})`,
        ] : []),
      ] : []),
      ...(envOn('PF_CB_CONF_FLIP') ? [
        `  S7-PILOT conforming flip (fossil crossing edges): ${confFlipRan ? `RAN, ${confFlipPasses} sweep(s)` : 'REQUESTED BUT NOT RUN (needs the heap driver: no SWEEP/GPU_RANK, and PF_CB_SAFE_COLLAPSE not 0)'}`,
        `    crossing-edge candidates ${confFlipCand}, flipped ${confFlipDone}, refused ${confFlipRefused} (AR gate + tryFlip validity: 2-incidence, convexity, winding, on-locus)`,
        `    offenders (AR > ${SLIVER_AR}) AFTER ${sliverOffendersAfter}   resume: ${sliverResumeSplits} splits on +${sliverResumeBudgetUsed} of ${SLIVER_RESUME_BUDGET} budget${sliverResumeCapped ? '  [RESUME-CAPPED]' : ''}   unresolved AFTER ${sliverUnresolvedAfter} (worst ${(sliverUnresolvedWorstAfter * 1000).toFixed(3)} um)`,
      ] : []),
      // S22 DE-SHARD block — printed ONLY when requested, so every flag-off report stays byte-identical.
      ...(envOn('PF_CB_DESHARD') ? [
        `  S22 DE-SHARD FINISHING PASS: ${deshardRan ? 'RAN' : `REQUESTED BUT NOT RUN — ${!DESHARD_REQ
          ? '*** ADMISSION IS NOT COMPOSED (needs PF_CB_ADMIT_NORMAL=1 + PF_CB_ADMIT_NORMAL_SPLIT=1 + PF_CB_ADMIT_SHIPPED=1). The pass REFUSES to run: `_S21B` measured the orientation class UNBIRTHABLE only under composed admission, and without it this pass is the CTLPLUS experiment that made the class WORSE 211 -> 294. ***'
          : 'needs the heap driver (no SWEEP/GPU_RANK) and PF_CB_SAFE_COLLAPSE not 0'}`}`,
        `    instrument: SHARD = longest edge >= ${DESHARD_L} mm AND (deviation >= ${DESHARD_DEV} deg OR AR3 >= ${DESHARD_AR})`
          + `   FAN = vertex on >= ${DESHARD_FANDEG} facets carrying an edge >= ${(DESHARD_FANLONG * 1000).toFixed(0)} um`,
        `    *** SHARDS ${deshardBefore} -> ${deshardAfter}`
          + `${deshardBefore > 0 ? ` (x${(deshardAfter / deshardBefore).toFixed(3)})` : ''}`
          + `   FANS ${deshardFanBefore} -> ${deshardFanAfter}`
          + `${deshardFanBefore > 0 ? ` (x${(deshardFanAfter / deshardFanBefore).toFixed(3)})` : ''} ***`,
        `    (i) subdivision: ${deshardTried} candidates attempted, ${deshardSplits} split, ${deshardRefused} REFUSED`
          + ` (${deshardRefAR} aspect / ${deshardRefFold} fold / ${deshardRefAdmit} admission / ${deshardRefOther} weld-apex)`
          + `   max recursion depth ${deshardDepthMax} of ${DESHARD_DEPTH}`
          + `   refusal rate ${deshardTried > 0 ? ((100 * deshardRefused) / deshardTried).toFixed(1) : '0.0'}%`
          + `${deshardTried > 0 && deshardRefused > 0.5 * deshardTried ? '   *** INFEASIBLE-AS-WIRED — registered criterion FIRED (refusals > 50% of shard candidates) ***' : '   [INFEASIBLE criterion NOT fired]'}`,
        `    (ii) fan flips: ${deshardFanPassesRun} of ${DESHARD_FANPASSES} sweep(s), ${deshardFanCand} candidates, ${deshardFanFlipped} FLIPPED`
          + `   refused ${deshardFanRefAR} on the improvement gate (worst-AR must STRICTLY decrease),`
          + ` ${deshardFanRefAdmit} on admission, ${deshardFanRefValid} on 2-incidence`,
        `    (iii) ON-LOCUS SPOKES — shortened, never rotated: ${deshardFanLocus} spokes lie ON a locus,`
          + ` ${deshardFanLocusSplit} SPLIT at the midpoint, ${deshardFanLocusRefused} refused by the composed gates,`
          + ` ${deshardFanLocusShort} already below the ${(DESHARD_FANLONG * 1000).toFixed(0)} um census threshold`
          + `   [a midpoint split moves no vertex OFF its locus and adds one ON it — the conforming corridor is preserved, not evaded]`,
        `    (iv) S22C PROTECTOR CASCADE (PF_CB_DESHARD_CASCADE=${DESHARD_CASCADE ? 1 : 0}, depth cap ${DESHARD_CASDEPTH}): ${casSites} blocked sites entered,`
          + ` ${casConformed} CONFORMED (${casSites > 0 ? ((100 * casConformed) / casSites).toFixed(1) : '0.0'}% — registered prediction was <= 30%),`
          + ` ${casProtectorSplits} protector splits, max depth ${casDepthMax}`
          + `${casSites > 0 && casProtectorSplits === 0 ? '   *** INFEASIBLE-AS-WIRED — 0 PROTECTOR SPLITS IS A WIRING FAILURE, NOT A REFUTATION (Y2) ***' : ''}`,
        `      dead ends: ${casSelfBlocked} SELF-BLOCKED (the offender's own longest edge IS the blocked edge — no protector to refine and, unlike S8, no off-centre placement to re-centre),`
          + ` ${casDepthCapped} depth-capped, ${casAttemptCapped} attempt-capped, ${casOther} weld/apex/admit`,
        `      cascade depth histogram (0..15): ${casDepthHist.join(' ')}`
          + `   splits that ONLY landed via the ladder: ${deshardSplitsViaCascade} subdivision + ${deshardFanLocusViaCascade} on-locus`,
        `    budget (billed in NEW LIVE TRIANGLES — W6's own quantity): subdivision +${deshardLiveAdded} of ${DESHARD_BUDGET}`
          + `${deshardBudgetCapped ? '  *** BUDGET-CAPPED — the worklist was NOT discharged ***' : ''}`
          + `   flips +0 by construction (2 killed, 2 emitted, no vertex moved)`,
        `    gross allocations, reported separately so neither sub-pass is billed for the other:`
          + ` subdivision ${deshardAllocSub}, flips ${deshardAllocFan}`
          + `   resume ${sliverResumeSplits} splits on +${sliverResumeBudgetUsed} of ${SLIVER_RESUME_BUDGET}${sliverResumeCapped ? '  [RESUME-CAPPED]' : ''}`,
        ...(deshardRefusedLog.length > 0
          ? ['    SURVIVORS — the parents the composed gates would not let this pass repair. DECLARED, never silent:', ...deshardRefusedLog]
          : ['    SURVIVORS: none — every attempted candidate was discharged.']),
      ] : []),
      ...(ALIGNED_SEED && alignedStats !== null && alignedLoci !== null ? [
        `  S10 ALIGNED CONSTRAINED SEED: PF_CB_ALIGNED_SEED=1   trace ${AL_NU}x${AL_NV} in ${(alignedTraceMs / 1000).toFixed(0)}s`
          + `${AL_MISTRACE !== 0 ? `   *** MISTRACED BY ${AL_MISTRACE} um — LAYER-2 NEGATIVE CONTROL, NOT A PRODUCTION MESH ***` : ''}`,
        `    traced loci: ${alignedLoci.loci.length} components, ${alignedLoci.counts.polylinePts} points, ${alignedLoci.counts.totalLengthMm.toFixed(1)} mm total`
          + `   junctions ${alignedLoci.junctions.length} (from ${alignedLoci.counts.rawJunctions} raw)   jump-class crossings EXCLUDED ${alignedLoci.counts.jumpExcluded}`,
        `    seed: ${alignedStats.points} points -> ${alignedStats.tris} tris   constraints ${alignedStats.constraints} RECOVERED ${alignedStats.constraintsRecovered}`
          + ` (conditioned ${alignedStats.constraintsConditioned}, decimated ${alignedStats.decimated}, degenerate dropped ${alignedStats.degenerateDropped})`
          + `   repair rounds ${alignedRounds}, banned ${alignedBanned}`,
        `    spacing: along ${(alignedStats.alongMm * 1000).toFixed(0)} um / across ${(alignedStats.acrossMm * 1000).toFixed(0)} um`
          + `   background kept ${alignedStats.bgKept} dropped ${alignedStats.bgDropped}   offset points ${alignedStats.offsetPts}`
          + `   sizing field ${AL_FIELD ? 'ON' : 'OFF'} (${alignedStats.fieldEvals} rA evals)`,
        `    seed shape census: ${alignedStats.overCap} of ${alignedStats.tris} over the cap (worst AR ${alignedStats.worstAR.toFixed(2)}, worst PARAMETRIC AR ${alignedStats.worstParAR.toFixed(1)})`,
        `    *** S41 SEED-TIME CHAIN RE-SOLVE (ported from the S34 fork): PF_CB_ALIGNED_RESOLVE_UM=${(AL_RESOLVE_MM * 1000).toFixed(0)}`
          + `${AL_RESOLVE_MM === 0 ? ' (OFF — this is the control arm, and its STL must be byte-identical to a pre-port V2 run)' : ''}`
          + `   re-solved ${alignedStats.chainResolved} chain vertices, refused ${alignedStats.chainResolveRefused} ***`,
        ...(AL_ACROSS_ABS ? [
          `    *** S15 STEP 1b ACROSS RULE ON: PF_CB_ALIGNED_ACROSS_ABS=1  floor ${(AL_ACROSS_MIN * 1000).toFixed(1)} um  seed AR bound ${AL_SEED_AR.toFixed(0)}`
            + `   BOUND at ${alignedStats.acrossBoundPts} chain points (along shortened at ${alignedStats.alongBoundPts})`
            + `   across placed: min ${(alignedStats.acrossMinPlacedMm * 1000).toFixed(1)} um / p50 ${(alignedStats.acrossP50PlacedMm * 1000).toFixed(1)} um`
            + `   (the relative rule floors at ${((alignedStats.acrossMm * 1000) / 2).toFixed(1)} um) ***`,
          ...(AL_BOW_FRAC > 0 ? [
            `    *** S16 STEP 1b' BOW RULE ON: PF_CB_ALIGNED_BOW_FRAC=${AL_BOW_FRAC}   along shortened at`
              + ` ${alignedStats.bowShortenedPts} further chain points so the traced locus's own bow fits inside`
              + ` ${(AL_BOW_FRAC * 100).toFixed(0)}% of the offset ring — an offset-ring chord may not cut the locus it hugs ***`,
          ] : []),
        ] : []),
        ...(AL_RINGS !== 1 || AL_TURN_MUL !== 0 ? [
          `    *** S19 GRADED ACROSS-COMPLETION: PF_CB_ALIGNED_RINGS=${AL_RINGS} grade ${AL_RGRADE} max ${(AL_RMAX * 1000).toFixed(0)} um`
            + `  (rings actually used ${alignedStats.offsetRingsUsed})   PF_CB_ALIGNED_TURN_MUL=${AL_TURN_MUL}`
            + ` bound the along spacing at ${alignedStats.turnBoundPts} chain points`
            + `   — the empty band between the innermost ring and the 1,101 um background lattice is where 88% of the`
            + ` large tilted offenders lived (S19 decomposition) ***`,
        ] : []),
        ...(alignedStats.patchRegions > 0 ? [
          `    *** S18 STEP 3 X-CROSSING PATCH EMITTER ON: ${AL_PATCH}   top${AL_PATCH_TOPN} by measured load`
            + `${AL_PATCH_IDS.length > 0 ? ` + ids [${AL_PATCH_IDS.join(',')}] (the FIDELITY targets — S17 measured that the class ranking does not rank them)` : ''}`
            + `   routed radius cap ${AL_PATCH_MAX.toFixed(2)} mm ***`,
          `      ${alignedStats.patchRegions} regions DECLARED, ${alignedStats.patchPts} structured points on ${alignedStats.patchRings} graded rings`
            + `   (refused ${alignedStats.patchRefusedPt} on point clearance, ${alignedStats.patchRefusedSeg} on constraint clearance)`
            + `   — free Steiner points ONLY: zero constraint edges added, so no constraint can span the chart and the`
            + ` patch is watertight through the SAME single cdt2d call as the rest of the seed`,
          `      S21 GRADING FIX (patch interior sizing = min(polar grading, sizing field)):`
            + ` the field BOUND the polar grading on ${alignedStats.patchFieldBoundRings} rings,`
            + ` inserting ${alignedStats.patchSubRings} sub-rings; worst polar/field ratio`
            + ` ${alignedStats.patchWorstRatio.toFixed(2)}x`
            + `   — S18 measured the defect this repairs: disk #25's congruent copy 0.008 -> 31.429 um because the polar`
            + ` set REPLACED a finer background lattice. ${alignedStats.patchSubCapped === 0
              ? 'The patchSubMax guard never clipped, so the fix applied in full.'
              : `*** THE patchSubMax GUARD CLIPPED ON ${alignedStats.patchSubCapped} RINGS — the routed disk may STILL be`
                + ' coarser than the field there, and that is reported rather than absorbed. ***'}`,
        ] : []),
        ...(RECON !== '' && reconField !== null ? [
          `    *** S23 RECONSTRUCTION — ONE CONSTRUCTION PASS, HANDS OFF TO NOBODY. PF_CB_RECON=${RECON}`
            + `${RECON_SCALE !== 1 ? `   *** PROBE at PF_CB_RECON_SCALE=${RECON_SCALE} — NOT a production mesh ***` : ''}`,
          `      field: floor ${(RECON_FLOOR * 1000).toFixed(1)} um (clamped ${reconField.stats.flooredCells} of ${reconField.stats.nCells} cells,`
            + ` raw min ${reconField.stats.rawMinUm} um), gradation alpha ${RECON_ALPHA}`
            + ` (lowered ${reconField.stats.gradedCells} cells, worst x${reconField.stats.worstGradeRatio}, ${reconField.stats.sweeps} sweeps)`,
          `      prepared h um: min ${reconField.stats.min} p01 ${reconField.stats.p01} p10 ${reconField.stats.p10}`
            + ` p50 ${reconField.stats.p50} p90 ${reconField.stats.p90} p99 ${reconField.stats.p99} max ${reconField.stats.max}`
            + `   8-neighbour size ratio p99 ${reconField.stats.ratioRawP99} -> ${reconField.stats.ratioP99} (MAX ${reconField.stats.ratioRawMax} -> ${reconField.stats.ratioMax})`,
          `      CHAIN ALONG BOUND BY THE FIELD (PF_CB_RECON_CHAIN=${RECON_CHAIN ? 1 : 0}): shortened at`
            + ` ${alignedStats.reconAlongBoundPts} chain points   — the ONE clause that adds constraints;`
            + ` recovery ${alignedStats.constraintsRecovered} of ${alignedStats.constraints} is the S7 tripwire`,
          `      INFILL (free Steiner points ONLY — ZERO constraints added): ${alignedStats.reconPts} placed`
            + ` from ${alignedStats.reconCandidates} candidates at beta ${RECON_BETA} / cand ${RECON_CAND}`
            + `   refused ${alignedStats.reconRefusedPt} on point clearance, ${alignedStats.reconRefusedSeg} on constraint clearance`
            + `   in ${(alignedStats.reconMs / 1000).toFixed(0)}s`,
          `      boundary densification (rim rows + BOTH seam columns from ONE z-set, per S11): ${alignedStats.reconBoundaryPts} points`
            + `   candidates whose demand was already AT the floor: ${alignedStats.reconFloorHits}`
            + `   — the population the constructor is architecturally forbidden to resolve finer, reported not absorbed`,
          `      COMPOSED ACCEPTANCE over ${rc.facets} constructed facets, on the values that SHIP:`
            + `   S1 over-cap ${rc.s1Over} (declared ${rc.s1OverDeclared} / UNDECLARED ${rc.s1OverUndeclared}),`
            + ` worst AR ${rc.worstAR.toFixed(2)} (worst UNDECLARED ${rc.worstARUndeclared.toFixed(2)})`,
          `        S2 folds ${rc.s2Fold} (zero-area ${rc.s2Zero})   S20 footprint-back ${rc.admitBack}`
            + `   ALT_FLOOR 0.7629 um: ${rc.altBelow} below (declared ${rc.altBelowDeclared}), min altitude ${rc.altMinUm.toFixed(4)} um`
            + `   ${rc.declaredFacets} facets inside the ${rcPatches.length} declared regions`,
        ] : []),
        ...(alignedSeedCrossings >= 0 ? [
          `    *** THE LEVER'S OWN MEASUREMENT — seed edges that CROSS a locus, by the driver's own locateKink:`
            + ` ${alignedSeedCrossings} of ${alignedSeedEdges} edges (${((100 * alignedSeedCrossings) / Math.max(1, alignedSeedEdges)).toFixed(3)}%).`
            + ` The uniform grid at this config had 10,641 (S9a's gen-0 enumeration, live grid, multi-pass). ***`,
        ] : []),
      ] : []),
      ...(envOn('PF_CB_CONFORM_FIRST') || envOn('PF_CB_SNAP_CASCADE') ? [
        `  S9 conformity-at-birth: PF_CB_CONFORM_FIRST=${CONFORM_FIRST ? 1 : 0}  PF_CB_SNAP_CASCADE=${SNAP_CASCADE ? 1 : 0}   depth ${S9_DEPTH}, shared budget ${S9_BUDGET} gross allocs`,
        ...(CONFORM_FIRST ? [
          `    S9a gen-0 conformity: ${g0Cand} crossing edges in ${g0Passes} sweep(s): CONFORMED ${g0Conformed} + ${g0Proximity} by-proximity, deadlocked ${g0Deadlocked}, budget-stopped ${g0Budget}, other ${g0RefusedOther}   splits ${g0Splits} (+${g0Allocs} allocs BEFORE seeding)`,
        ] : []),
        ...(SNAP_CASCADE ? [
          `    S9b in-loop discharge: fired on ${scFired} refused SNAP splits: CONFORMED ${scConformed} + ${scProximity} by-proximity, deadlocked ${scDeadlocked}, budget-stopped ${scBudget}, other ${scRefusedOther}   splits ${scSplits}${scBudgetStopped ? '  [S9 BUDGET REACHED]' : ''}`,
        ] : []),
        `    S9 attributable allocations: ${s9AllocsUsed} of ${S9_BUDGET}`,
      ] : []),
      ...(envOn('PF_CB_FOSSIL_CASCADE') ? [
        `  S8-PILOT fossil cascade-split (crossing edges, Rivara obligations): ${fossilRan ? `RAN, ${fossilPasses} sweep(s)` : 'REQUESTED BUT NOT RUN (needs the heap driver: no SWEEP/GPU_RANK, and PF_CB_SAFE_COLLAPSE not 0)'}`,
        `    crossing-edge candidates ${fossilCand}: CONFORMED ${fossilConformed} + ${fossilProximity} by-proximity (crossing within SNAP_ALPHA of a vertex at child scale), DEADLOCKED ${fossilDeadlocked} (depth ${fossilDeadDepth} / attempts ${fossilDeadAttempts} / self-block ${fossilDeadSelf}; depth cap ${FOSSIL_DEPTH}), other-refused ${fossilRefusedOther}`,
        `    splits ${fossilSplits} (protector ${fossilCascadeSplits}, retreat ${fossilRetreatSplits})   deepest site ${fossilDepthMax}   +${fossilAllocUsed} of ${FOSSIL_BUDGET} gross allocs${fossilBudgetCapped ? '  [BUDGET-CAPPED]' : ''}`,
        `    resume: ${sliverResumeSplits} splits on +${sliverResumeBudgetUsed} of ${SLIVER_RESUME_BUDGET} budget${sliverResumeCapped ? '  [RESUME-CAPPED]' : ''}   unresolved AFTER ${sliverUnresolvedAfter} (worst ${(sliverUnresolvedWorstAfter * 1000).toFixed(3)} um)`,
      ] : []),
      // S5. The two counts either side of the pass are the ANSWER to "does tryFlip repair caps", measured on
      // this run's own mesh. `cap-before` is also the honest final blade count in the census's metric.
      ...(process.env.PF_CB_SAFE_COLLAPSE === '0'
        ? ['  cap repair: NOT MEASURED — PF_CB_SAFE_COLLAPSE=0 disables the block this census lives in.']
        : [`  cap repair: PF_CB_SHAPE_FLIP=${SHAPE_FLIP ? 1 : 0}   facets over cap BEFORE ${capBefore} (worst ${capWorstBefore.toFixed(1)}) → AFTER ${capAfter} (worst ${capWorstAfter.toFixed(1)})   flips tried ${capFlipTried}, done ${capFlipDone}`]),
      ...(capBefore > 0 && SHAPE
        ? (POST_SHAPE
          ? [`  *** ${capBefore} facets over the cap survived a run with BOTH guards ON. S1 covers bisectAt and S6`,
             '      covers the collapse and the collapse-driven flip, so a survivor can only be (a) BORN in the',
             `      INITIAL GRID — ${gridOverCap} were, see the post-loop guard block above — or (b) a float32 tie:`,
             '      the STL is float32 while both guards score float64, so a facet within ~0.1 % of the cap can',
             '      tip either way. That moves individuals, never the population. ***']
          : [`  *** ${capBefore} facets over the cap survived a run with the SPLIT guard ON. It covers SPLITS; these`,
             '      can only have come from the INITIAL GRID or from the collapse pass, and both are reachable.',
             '      PF_CB_POST_SHAPE=1 (the default) closes the second of those — this run had it OFF. ***'])
        : []),
      ...(SWEEP ? [] : [`heap: ${heapT.length} left, worst-left ${um(heapLeftMax)} µm, key-inversions ${keyInversions}, no-op splits ${stuck}   MAXtri@oracle${oracleRef} ${maxT >= 0 ? um(sagOfN(maxT, oracleRef)) : 'n/a'} µm`]),
      ...(SWEEP ? [
        `queue: ${queueLeft} live left after ${sweep} sweeps (${qDropped} dead entries compacted out), no-op actions ${stuck}   MAXtri@oracle${oracleRef} ${maxT >= 0 ? um(sagOfN(maxT, oracleRef)) : 'n/a'} µm`,
        `  worst-left ${um(queueWorstSag)} µm  (EDGE RULER, LOWER BOUND — this is NOT a residual estimate; the heap's`,
        '  worst-left had a key to read and the FIFO does not. §6.4: the anytime property is genuinely given up.)',
      ] : []),
      `unresolved: ${unresolvedLeft} live over-tol triangles the splitter could NOT subdivide, worst ${um(unresolvedMax)} µm${unresolvedLeft > 0 ? '   *** an EMPTY HEAP DOES NOT MEAN CLOSURE — these left the queue unrefined ***' : ''}`,
      // S26: printed on EVERY driver now. It used to live inside the `SWEEP` block below, so the one thing
      // that could have named the heap driver's refusals was dark on every heap run — which is every
      // production arm this campaign has scored.
      `  unresolved by reason: ${unresolvedByWhy.size === 0 ? 'none' : [...unresolvedByWhy.entries()].sort((x, y) => y[1] - x[1]).map(([w, c]) => `${w} ${c}`).join('  ')}`,
      ...((unresolvedByWhy.get('unknown') ?? 0) > 0 ? [
        `  *** ${unresolvedByWhy.get('unknown')} facets read reason 'unknown' — A PATH STRANDS WITHOUT NAMING ITSELF.`,
        "      S26 wired `unresolvedWhy` on the no-op-split and resume paths and widened the taxonomy to every",
        '      `bisectAt` refusal. An `unknown` survivor means a stranding route neither of those covers, and it is',
        '      a REGISTERED DEFECT of the taxonomy rather than a property of the mesh. Find the route. ***'] : []),
      // ═══ S27 — THE STRAND-RETRY PASS. Reported on its OWN lines because the headline `unresolved:` above
      // is taken BEFORE the resume and must not silently change meaning. ═══
      ...(STRAND_RETRY ? [
        `strand-retry: ${srPassesRun} pass(es) of ${SR_PASSES}   unresolved ${srBefore} -> ${srAfter} (RESOLVED ${srResolved}, ${srBefore > 0 ? ((100 * srResolved) / srBefore).toFixed(1) : '0.0'}%)`
          + `   worst ${um(srBeforeWorst)} -> ${um(srAfterWorst)} µm`,
        `  resolved per pass: ${srPerPass.length === 0 ? 'none' : srPerPass.join(' → ')}   ${srPerPass.length > 1 && srPerPass[1] === 0 ? '*** PASS 2 RESOLVED ZERO — the resume had already taken all of it; ITERATION buys nothing ***' : '(a decaying series is the signature the probe predicted)'}`,
        `  resolved BY THE REASON THEY CARRIED: ${srResolvedBy.size === 0 ? 'none' : [...srResolvedBy.entries()].sort((x, y) => y[1] - x[1]).map(([w, c]) => `${w} ${c}`).join('  ')}`,
        `  re-stranded by reason AFTER retry: ${srAfterBy.size === 0 ? 'none' : [...srAfterBy.entries()].sort((x, y) => y[1] - x[1]).map(([w, c]) => `${w} ${c}`).join('  ')}`,
        `  before, by reason: ${srBeforeBy.size === 0 ? 'none' : [...srBeforeBy.entries()].sort((x, y) => y[1] - x[1]).map(([w, c]) => `${w} ${c}`).join('  ')}`,
        `  budget: ${srSplits} splits on +${srBudgetUsed} of ${SR_BUDGET} gross allocations (metered to THIS pass, anchored at its own base)`
          + `${srBudgetStopped ? '   *** BUDGET-STOPPED — the pass did not reach quiescence and the numbers above are a LOWER BOUND ***' : ''}`
          + `${srTimeCapped ? '   *** TIME-CAPPED ***' : ''}`,
        ...(srPassesRun >= SR_PASSES && !srBudgetStopped ? [
          `  *** PASS-CAPPED at ${SR_PASSES} — still resolving when it stopped, so the numbers are a LOWER BOUND. Raise PF_CB_STRAND_RETRY_PASSES. ***`] : []),
      ] : []),
      ...((unresolvedByWhy.get('unclassified') ?? 0) > 0 ? [
        `  *** ${unresolvedByWhy.get('unclassified')} facets read 'unclassified' — \`classifyStrand\` ran but matched no known`,
        '      refusal: an edge was above the floor, the cap was not hit, and BOTH refusal channels read none. That is a',
        "      `splitEdge` exit the taxonomy does not model. REGISTERED DEFECT, same standing as 'unknown'. ***'"] : []),
      ...(SWEEP ? [
        // §5.1 A DRAINED FIFO IS A PREDICATE FIXED POINT, NOT A CERTIFICATE. The predicate is a 1-D edge
        // sagitta at REF_HS pitch plus a 16-bin kink probe: a LOWER bound on the facet-interior point-to-
        // triangle quantity the auditor judges. §6.1 proves it WILL under-call on sub-pitch features (V5's
        // 10 µm crest: interior ruler 5.552 µm, H2 391.661 µm — 70x, and the edge predicate is coarser still).
        // The design answer is Phase 2 and only Phase 2; the pass bar is the auditor, never this block.
        '--- PHASE 1 (SWEEP DRIVER) ---',
        `  sweeps ${sweep}   in ${initTris} → out ${liveIdx.length} tris   actions ${iters}   splits ${nConformSplit + nSizeSplit} (conform ${nConformSplit} / size ${nSizeSplit})`,
        `  conformed-by-proximity ${nProximity}   snap-MOVES 0 (§4.3 DEFERRED — see move-deferred below)   floor-refused ${nFloorRefused}   no-incident ${nNoIncident}`,
        `  curtain-deferred ${curtainTagged} triangles at ${curtainCells.size} distinct sites (${curtainSites.length} recorded, cap ${CURTAIN_CAP})   class-flips ${nClassFlips}${siteMapSaturated ? '   *** SITE MAP SATURATED — stickiness degraded, raise PF_CB_SITE_CAP ***' : ''}`,
        `  weld-wall: smooth-midpoint BUGS ${nSmoothWeldBug} (crease-class size welds ${nCreaseSizeWeld})   move-deferred ${nMoveDeferred}`,
        `  memo: ${memoHits} hits / ${memoMisses} misses (${((100 * memoHits) / Math.max(1, memoHits + memoMisses)).toFixed(1)}% hit)${MEMO_VERIFY ? `   PF_CB_MEMO_VERIFY mismatches ${memoMismatch} (MUST be 0)` : '   (PF_CB_MEMO_VERIFY=1 to gate it)'}`,
        // PARALLEL PREDICATE. Read the two eval columns as COST, never as fidelity: the worker column includes
        // SPECULATIVE edges (triangles killed by a neighbour's split before they were popped), so the pooled
        // total is HIGHER than a serial run's while the mesh is bit-identical. Nothing else in this report
        // moves with the worker count — that is the claim, and PF_CB_SWEEP_WORKERS=1 vs 8 on one md5 is the test.
        ...(sweepStats === null ? [
          `  predicate: SERIAL (PF_CB_SWEEP_WORKERS=${SWEEP_WORKERS}) — the unchanged code path; set >1 to evaluate triangleNeed in a worker pool.`,
        ] : [
          `  predicate: PARALLEL, ${sweepStats.workers} workers   ${preGenerations} generations   ${preDispatched} edges dispatched   ${preServed} served to the driver   ${preUnwritten} slots unwritten (MUST be 0)`,
          `    rA evals: ${(rEvals / 1e6).toFixed(1)}M main-thread + ${(sweepStats.workerEvals / 1e6).toFixed(1)}M worker (INCLUDES speculation — a COST number, not a fidelity one)`,
          `    rA identity: ${sweepStats.latPoints} (worker x lattice) comparisons, ${sweepStats.latDiffCount} differ, worst ${(sweepStats.latMaxDev * 1000).toFixed(6)} µm — checked BEFORE any edge was measured, run refused on any deviation`,
          `    ${SWEEP_VERIFY ? `PF_CB_SWEEP_VERIFY ON: ${preVerified} prefetched edges re-measured on the main thread and Object.is-compared on all 7 fields (a mismatch THROWS)` : 'PF_CB_SWEEP_VERIFY=1 to re-measure every prefetched edge on the main thread and gate bit-identity'}`,
          `    shared buffers peak ${(sweepStats.peakBytes / (1 << 20)).toFixed(1)} MB   ${sweepStats.verticesMirrored} vertices mirrored (append-only invariant re-checked every generation)`,
        ]),
        // S26: the `unresolved by reason` line that used to be HERE is now printed unconditionally above.
        ...(nMoveDeferred > 0 ? ['  *** move-deferred = the crossing landed inside the SNAP_ALPHA band or welded onto an endpoint. Spec §4.3',
          '      answers this by MOVING that endpoint onto the crossing (conforms exactly, creates no vertex, terminates',
          '      in ONE step). NOT IMPLEMENTED — §1.5 forbids landing it in the same commit as the per-edge memo. These',
          '      are counted as UNRESOLVED, never accepted. ***'] : []),
        ...(nSmoothWeldBug + nCreaseSizeWeld > 0 ? [
          `  *** MIDPOINT WELDS on the size route: ${nSmoothWeldBug} SMOOTH-class + ${nCreaseSizeWeld} crease-class. A SMOOTH one is a`,
          `      SPLITTER DEFECT, not a geometry fact (§4.2): two independent refinement fronts met within ${(WELD_MM * 1e6).toFixed(0)} nm on a`,
          '      patch with NO feature. Crease-class ones have a conformed locus nearby, so they are recorded but NOT',
          `      claimed as defects. First ${Math.min(5, weldBugLog.length)} of both, cls= gives the actual class:`,
          ...weldBugLog.slice(0, 5).map((s) => `      ${s}`)] : []),
        ...(curtainCells.size > 0 ? [`  *** ${curtainCells.size} CURTAIN SITES TAGGED AND NOT CONSUMED — no bisection driver can ever close an h⁰ jump`,
          '      (measured: 1 368 µm of error at a demanded 50 nm resolution = 27 000:1). They are DEFERRED-TO-CURTAIN,',
          '      deliberately NOT unresolved: a curtain STAGE keyed by the detected feature is the honest answer. ***'] : []),
        `  ${queueLeft === 0 && !capped && !timeCapped ? '*** DRAINED — this is a PREDICATE fixed point, NOT a certificate. Phase 2 decides. ***' : '*** DID NOT DRAIN — capped/time-capped, so not even a predicate fixed point. ***'}`,
      ] : []),
      ...(BND_DOOM ? [
        `bnd-doom-guard: ON — ${bsDoom} escalations skipped as PROVABLY un-certifiable at every level <= ${BND_NMAX}` +
        `${BND_DOOM_VERIFY ? `   VERIFY: escalated anyway, accepted-anyway ${bsDoomAcc} (MUST be 0)` : ''}` +
        '   *** decision-preserving but the heap KEY of those triangles is the level-' + String(BND_N) + ' bound, so worst-first ORDER and hence the MESH differ from a guard-off run ***',
      ] : []),
      ...(BNDSTATS ? [
        `bnd-stats: calls ${bsCalls} (escalated ${bsEsc}, accepted ${bsAcc})  evals ${(bsEvals / 1e6).toFixed(1)}M   requeue-without-remeasure ${bsReuse}`,
        `bnd-levels: ${[...bsLevelCount.entries()].sort((x, y) => x[0] - y[0]).map(([n, c]) => `n=${n}:${c}tri/${((bsLevelEvals.get(n) ?? 0) / 1e6).toFixed(1)}M`).join('  ')}`,
        `bnd-doomed(|bc|/${BND_NMAX}>tol): ${bsDoomBC} tris, ${(bsDoomBCevals / 1e6).toFixed(1)}M escalation evals (${((100 * bsDoomBCevals) / Math.max(1, bsEvals)).toFixed(1)}% of all bnd evals)  accepted-anyway ${bsDoomBCacc} (MUST be 0)`,
      ] : []),
      ...(gpuLine === '' ? [] : [gpuLine,
        '  NB the FIDELITY block below is the DRIVER SELF-REPORT on the plane ruler this lever replaced. It is',
        '  kept only so the run stays comparable with the committed baselines; it is NOT the verdict. Judge with',
        '  research/bridge/_strataFacetTruth.test.ts at FULL coverage.']),
      '--- WATERTIGHT (3D position-weld) ---',
      `  non-manifold edges : ${nonManifold}  ${nonManifold === 0 ? 'OK' : 'FAIL'}`,
      `  reversed facets    : ${orientMismatch}  ${orientMismatch === 0 ? 'OK' : 'FAIL — interior edge traversed the same way twice ⇒ inconsistent winding'}`,
      `  seam-crack edges   : ${seamCrack}  ${seamCrack === 0 ? 'OK' : 'FAIL'}`,
      `  boundary edges     : ${boundary}   ${STAGE === 'solid' ? (boundary === 0 ? 'OK — CLOSED SOLID' : 'FAIL — open') : '(ring ⇒ top+bottom only)'}   loops ${loops.length}`,
      `  soup: ${soup.length} tris = ${liveIdx.length} outer wall + ${treadTris} treads + ${capTris} caps`,
      // The caveat below used to print ONLY under GPU_RANK, so an ordinary run showed a bare "PASS". Every
      // number in this block comes from sagOfN/sagAdaptive, i.e. distance to the triangle's INFINITE PLANE —
      // small for exactly the facet that spans a feature (measured: 5.856 µm here vs 362.888 µm from the
      // independent auditor on the same mesh). It is a self-report, and it says so unconditionally now.
      `--- FIDELITY (DRIVER SELF-REPORT on the PLANE ruler — NOT the verdict; judge with`,
      `             research/bridge/_strataFacetTruth.test.ts at FULL coverage) ---`,
      `  HEADLINE MAX ${um(headlineMax)} µm  ${verdict}   = max(adaptive ${um(maxSag)}, fixed-${oracleN} ${um(maxFixed)}, tail-${tailN} ${um(tailMax)})`,
      ...(verdict === 'NOT-CONVERGED'
        ? [`  *** NOT-CONVERGED: ${unresolvedLeft} unresolved (worst ${um(unresolvedMax)} µm)${capped ? ', TRIANGLE-CAPPED' : ''}${timeCapped ? ', TIME-CAPPED' : ''} — the max above is a LOWER BOUND on a mesh the driver never finished refining ***`]
        : []),
      ...(verdict === 'DEFERRED-TO-CURTAIN'
        ? [`  *** DEFERRED-TO-CURTAIN: the predicate reached its fixed point with ${curtainCells.size} h⁰ sites tagged and no curtain`,
           '      stage to consume them. This is NOT a pass and NOT a NOT-CONVERGED either — it is a different fact ***']
        : []),
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
      // AUDIT COST, AND ITS IDENTITY GUARANTEES. Read the eval columns as COST. The FIDELITY numbers above are
      // claimed INDEPENDENT of the worker count: slot i is written by exactly one worker and every reduction
      // runs on the main thread in the original order, so PF_CB_AUDIT_WORKERS=1 vs N must reproduce this whole
      // report byte-for-byte except the wall clock and this block. That is the acceptance test, not a hope.
      ...(auditMain === null
        ? [`  audit: SERIAL (PF_CB_AUDIT_WORKERS=${AUDIT_WORKERS}) — the unchanged code path; set >1 to score facets in a worker pool.`]
        : [
          `  audit: PARALLEL, ${auditMain.workers} workers   main ${liveIdx.length} facets in ${(auditMain.wallMs / 1000).toFixed(1)}s (chunk ${auditMain.chunk})`
            + `${auditTail === null ? '   tail: none' : `   tail ${order.length} facets in ${(auditTail.wallMs / 1000).toFixed(1)}s (chunk ${auditTail.chunk})`}`,
          `    rA evals: ${((auditMain.rEvals + (auditTail?.rEvals ?? 0)) / 1e6).toFixed(1)}M in workers — INCLUDED in the total above, because they are the same evaluations a serial run makes`,
          `      + ${((auditMain.latEvals + (auditTail?.latEvals ?? 0)) / 1e3).toFixed(1)}k identity-lattice and ${auditForensicEvals} forensic re-evals, both EXCLUDED so both arms print the same total`,
          `    rA identity: ${auditMain.latPoints} (worker × lattice) comparisons, ${auditMain.latDiffCount} differ, worst ${(auditMain.latMaxDev * 1000).toFixed(6)} µm — checked BEFORE any facet was scored, run refused on any deviation`,
          `    shared buffers: ${((auditMesh?.bytes ?? 0) / (1 << 20)).toFixed(1)} MB vertices + ${((liveIdx.length * 12) / (1 << 20)).toFixed(1)} MB corners + ${((liveIdx.length * 16) / (1 << 20)).toFixed(1)} MB results (the mesh is SHARED, never copied per worker)`,
          `    ${AUDIT_VERIFY
            ? `PF_CB_AUDIT_VERIFY ON: ${auditVerifyChecked} facets re-scored on the main thread and Object.is-compared on both rulers (a mismatch THROWS); ${(auditVerifyEvals / 1e6).toFixed(1)}M extra rA evals, EXCLUDED`
            : 'PF_CB_AUDIT_VERIFY=1 to re-score every facet on the main thread and gate bit-identity per facet'}`,
          '    NB the LOCUS AUDIT (PF_CB_LOCUS_AUDIT=1) is NOT pooled — it is off by default and stays serial.',
        ]),
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
