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
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { baseRadius } from '../../src/geometry/profile';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { openGpuRank, type GpuRank } from './_gpuRankBridge';
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
// PHASE 2 (spec §5.2-5.4). The certificate tells the driver WHERE to look; this is the consumer side.
import {
  PHASE2_RUN_SCHEMA, buildTightenField, phase2Key, readLociFile, verifyLociProvenance, writeJsonFile,
  type Phase2RunManifest, type TightenField,
} from './_phase2Loci';

const RUN = process.env.PF_BLADE === '1';
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

describe('BLADE repro (instrumented clone of STRATA conforming-bisection)', () => {
  it.runIf(RUN)('records the birth of every degenerate facet', async () => {
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
      let s = 0;
      for (let i = 0; i <= n; i += 1) for (let j = 0; j <= n - i; j += 1) {
        const wa = i / n; const wb = j / n; const wc = 1 - wa - wb;
        const theta = th0 + wb * dB + wc * dC;
        const z = wa * vz[a] + wb * vz[b] + wc * vz[c];
        const r = R(canon(theta), z);
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

    // ───────────────────────────── BISECTION ─────────────────────────────
    const created: number[] = [];
    let nSnap = 0; let nReproj = 0; let nJump = 0; let weldedSplits = 0;

    // ═════════════ BLADE WATCH — diagnostic instrumentation, NOT part of the production driver ═════════════
    // A "blade" is a facet that is degenerate IN THE (theta,z) PARAMETER DOMAIN — the domain this driver
    // actually triangulates. Measuring degeneracy there, with theta converted to arc length at the local
    // radius, removes the SURFACE's own curvature from the number: a large, well-shaped facet that merely
    // spans a cliff does NOT count, and a genuine zero-area sliver does. (Confirmed against the shipped STL:
    // 100 % of the folded/blade facets there have parametric AR > 128 and ZERO have parAR <= 8.)
    const parARof = (a: number, b: number, c: number): number => {
      const rM = (Math.hypot(vx[a], vy[a]) + Math.hypot(vx[b], vy[b]) + Math.hypot(vx[c], vy[c])) / 3;
      const ux = dTh(a, b) * rM; const uy = vz[b] - vz[a];
      const wx = dTh(a, c) * rM; const wy = vz[c] - vz[a];
      const s = Math.abs(ux * wy - uy * wx);
      const e0 = Math.hypot(ux, uy); const e1 = Math.hypot(wx - ux, wy - uy); const e2 = Math.hypot(wx, wy);
      const per = e0 + e1 + e2; const L = Math.max(e0, e1, e2);
      return s > 0 ? (L * per) / (2 * s) : Infinity;
    };
    /** 3-D aspect ratio (longest edge / 2*inradius) — the quantity the RENDER shows. */
    const ar3Dof = (a: number, b: number, c: number): number => {
      const e0 = eLen(a, b); const e1 = eLen(b, c); const e2 = eLen(c, a);
      const ux = vx[b] - vx[a]; const uy = vy[b] - vy[a]; const uz = vz[b] - vz[a];
      const wx = vx[c] - vx[a]; const wy = vy[c] - vy[a]; const wz = vz[c] - vz[a];
      const area = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
      const L = Math.max(e0, e1, e2);
      return area > 0 ? (L * (e0 + e1 + e2)) / (4 * area) : Infinity;
    };
    const BLADE_AR = envF('PF_BLADE_AR', 128);
    let bladeSrc = 'init';   // which refiner asked for the split
    let bladePlace = 'init'; // where splitEdge put the point
    // WHICH TRIANGLE IS BEING DAMAGED. `refineDirected` applies its aspect guard (PF_CB_AR) to the POPPED
    // triangle only, but `bisectAt` splits EVERY triangle incident to the chosen edge — and for the
    // neighbour that edge may be its shortest. If most blades are born in NEIGHBOURS the guard is in the
    // wrong place; if they are born in the OWNER the guard itself is too loose.
    let bladeOwner = -1;
    const bladeBirths = new Map<string, number>();
    const bladeEdgeRank = new Map<string, number>(); // was the split edge the parent's longest / mid / shortest?
    const bladeSamples: string[] = [];
    // AMPLIFICATION LEDGER — the quantity that decides whether blades are a cascade or a one-off.
    // For a bisection of edge (a,b) at parameter t inside a triangle of parametric height h over ab, the two
    // children have bases t|ab| and (1-t)|ab| at the SAME height h, so
    //     childAR / parentAR  ~  1/min(t, 1-t)                                                        (A1)
    // i.e. every split at an extreme t multiplies aspect ratio. Longest-edge (LEPP) bisection bounds this by
    // always halving the longest edge; DIRECTED bisection does not. Recorded per (which edge of the parent,
    // which placement rule) so the two levers can be separated.
    interface Amp { n: number; sumLog: number; max: number; maxT: number }
    const ampBy = new Map<string, Amp>();
    const noteAmp = (key: string, ratio: number, tPar: number): void => {
      if (!Number.isFinite(ratio) || ratio <= 0) return;
      let a = ampBy.get(key);
      if (a === undefined) { a = { n: 0, sumLog: 0, max: 0, maxT: 0 }; ampBy.set(key, a); }
      a.n += 1; a.sumLog += Math.log(Math.max(1e-6, ratio));
      if (ratio > a.max) { a.max = ratio; a.maxT = tPar; }
    };
    const noteChild = (child: number, parentAR: number, extra: string, rank: string): void => {
      if (child < 0) return;
      const ar = parARof(ta[child], tb[child], tc[child]);
      if (!(ar > BLADE_AR)) return;
      const born = !(parentAR > BLADE_AR);
      const k = `${bladeSrc}/${bladePlace}${born ? '  *BORN*' : '  (inherited)'}`;
      bladeBirths.set(k, (bladeBirths.get(k) ?? 0) + 1);
      if (born) {
        bladeEdgeRank.set(rank, (bladeEdgeRank.get(rank) ?? 0) + 1);
        if (bladeSamples.length < 40) {
          const a = ta[child]; const b = tb[child]; const c = tc[child];
          bladeSamples.push(`${k}  parAR ${parentAR.toFixed(1)} -> ${ar.toFixed(0)}  splitEdgeWas=${rank}  ${extra}  feat=${vFeat[a] ? 1 : 0}${vFeat[b] ? 1 : 0}${vFeat[c] ? 1 : 0}  th=[${vth[a].toFixed(7)},${vth[b].toFixed(7)},${vth[c].toFixed(7)}] z=[${vz[a].toFixed(5)},${vz[b].toFixed(5)},${vz[c].toFixed(5)}]`);
        }
      }
    };
    /** mesh-wide blade census — run at each pipeline checkpoint so births can be attributed to a stage. */
    const bladeCensus = (label: string): void => {
      let live = 0; let blades = 0; let needles = 0; let caps = 0; let worst = 0; let ar3hi = 0;
      for (let t = 0; t < ta.length; t += 1) {
        if (!alive[t]) continue;
        live += 1;
        const a = ta[t]; const b = tb[t]; const c = tc[t];
        if (ar3Dof(a, b, c) > 50) ar3hi += 1;
        const ar = parARof(a, b, c);
        if (!(ar > BLADE_AR)) continue;
        blades += 1;
        if (ar > worst && Number.isFinite(ar)) worst = ar;
        const l0 = eLen(a, b); const l1 = eLen(b, c); const l2 = eLen(c, a);
        const L = Math.max(l0, l1, l2); const S = Math.min(l0, l1, l2);
        if (S < 0.02 * L) needles += 1; else caps += 1;
      }
      console.log(`[BLADE ${label}] live ${live}  parAR>${BLADE_AR}: ${blades} (${(100 * blades / Math.max(1, live)).toFixed(3)}%)  3D-AR>50: ${ar3hi} (${(100 * ar3hi / Math.max(1, live)).toFixed(3)}%)  needle ${needles}  cap ${caps}  worst parAR ${worst.toFixed(0)}`);
    };

    /** split edge (a,b) at parameter t (0..1) — splits EVERY incident triangle ⇒ watertight, no T-junctions. */
    const bisectAt = (a: number, b: number, tPar: number, feat: boolean): boolean => {
      const [mth, mz] = edgeParam(a, b, tPar);
      const m = addV(mth, mz, feat);
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
        // BLADE WATCH: measure the parent BEFORE it dies, and rank the edge we are about to split against
        // the parent's own three edges. `bisectAt` splits EVERY incident triangle at the same point, so for
        // one of them (a,b) may well be its SHORTEST edge — the classic aspect-destroying case that LEPP's
        // longest-edge rule exists to prevent and that DIRECTED refinement abandons.
        const pAR = parARof(ta[t], tb[t], tc[t]);
        const p3D = ar3Dof(ta[t], tb[t], tc[t]);
        const pl = [eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])].sort((x, y) => y - x);
        const lab = eLen(a, b);
        const rank = `${lab >= pl[0] - 1e-12 ? 'longest' : lab <= pl[2] + 1e-12 ? 'SHORTEST' : 'middle'}@${t === bladeOwner ? 'OWNER' : 'neighbour'}`;
        killT(t);
        const c1 = addT(oa, m, apex); const c2 = addT(m, ob, apex);
        created.push(c1);
        created.push(c2);
        const ex = `t=${tPar.toFixed(4)} |ab|=${(lab * 1000).toFixed(2)}um parentEdges=${pl.map((q) => (q * 1000).toFixed(1)).join('/')}um`;
        noteChild(c1, pAR, ex, rank);
        noteChild(c2, pAR, ex, rank);
        if (Number.isFinite(pAR) && pAR > 0) {
          const worstChild = Math.max(c1 >= 0 ? parARof(ta[c1], tb[c1], tc[c1]) : 0, c2 >= 0 ? parARof(ta[c2], tb[c2], tc[c2]) : 0);
          noteAmp(`${bladeSrc}/${bladePlace.replace(/#\d+/, '#n')} [${rank}]`, worstChild / pAR, tPar);
          noteAmp('ALL', worstChild / pAR, tPar);
        }
        // …and the SAME ratio in the 3-D metric the render shows. The split point is chosen and placed in
        // (theta,z) but the edge is SELECTED by 3-D length (`eLen`), so on a high-relief surface the
        // "midpoint" of an edge is NOT its 3-D midpoint — a mismatch that shows up only in this column.
        if (Number.isFinite(p3D) && p3D > 0) {
          const worst3 = Math.max(c1 >= 0 ? ar3Dof(ta[c1], tb[c1], tc[c1]) : 0, c2 >= 0 ? ar3Dof(ta[c2], tb[c2], tc[c2]) : 0);
          noteAmp(`3D ${bladeSrc}/${bladePlace.replace(/#\d+/, '#n')} [${rank}]`, worst3 / p3D, tPar);
          noteAmp('3D ALL', worst3 / p3D, tPar);
          // where does the parametric split point land in 3-D arc length along the edge?
          const t3 = eLen(a, m) / Math.max(1e-12, eLen(a, m) + eLen(m, b));
          noteAmp(`t3D-vs-t  ${bladePlace.replace(/#\d+/, '#n')}`, Math.min(t3, 1 - t3) / Math.max(1e-9, Math.min(tPar, 1 - tPar)), tPar);
        }
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
          // BLADE WATCH: a SNAP split is also the ONLY path that can put the new vertex on a locus that BOTH
          // endpoints already sit on — record whether the edge being snapped already ran ALONG a locus.
          bladePlace = `SNAP${vFeat[a] && vFeat[b] ? '-alongLocus' : ''}${k.jump ? '-jump' : ''}`;
          if (bisectAt(a, b, k.t, true)) return true;
        }
      }
      bladePlace = 'REPROJ';
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
      const feat = vFeat[a] && vFeat[b];
      // The midpoint can weld onto a pre-existing vertex, which does not subdivide the edge and is refused.
      // Abandoning the edge strands the triangle forever (MEASURED: no-op splits === welded splits, and the
      // stranded triangles were exactly the GeoStar/Voronoi/Gyroid MAX loci). Walk a nudge LADDER outward from the
      // midpoint; in a saturated weld neighbourhood the first few offsets can all collide.
      for (let ni = 0; ni < NUDGE_LADDER.length; ni += 1) {
        bladePlace = ni === 0 ? 'MIDPOINT' : `NUDGE#${ni}`;
        if (bisectAt(a, b, NUDGE_LADDER[ni], feat)) return true;
      }
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
      bladeSrc = 'directed';
      for (const [, e] of cands) if (splitEdge(vs[e][0], vs[e][1])) return; // best-first, but never give up on a refusal
      bladeSrc = 'directed-ARguardDROPPED';
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
    type Outcome = 'split' | 'proximity' | 'floor' | 'move-deferred' | 'weld-bug' | 'no-incident' | 'curtain';
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
    type Refusal = 'R1' | 'R2' | 'R3' | 'R4' | 'R0';
    const tryBisect = (a: number, b: number, tPar: number, feat: boolean): { ok: boolean; refusal: Refusal } => {
      const wBefore = weldedSplits;
      const ok = bisectAt(a, b, tPar, feat);
      if (ok) return { ok: true, refusal: 'R0' };
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
          const r = tryBisect(a, b, k.t, true);
          if (r.ok) { nConformSplit += 1; nSnap += 1; if (k.jump) nJump += 1; return 'split'; }
          if (r.refusal === 'R0') { nNoIncident += 1; return 'no-incident'; }
          return weldWall(t, a, b, nd.cls, r.refusal, 'conform');
        }
        return weldWall(t, a, b, nd.cls, 'R4', 'conform');
      }
      // SIZE. Candidate = an edge at or above FLOOR_MM that passes refineDirected's aspect guard
      // (ls[e]*AR >= lMax, "never thin an already-short edge further"); pick the max edgeSag among them, and if
      // NONE passes the aspect guard drop it rather than strand the triangle — exactly refineDirected's own
      // two-tier fallback (L897). PF_CB_DIRECTED=0 is the ABLATION arm: longest edge instead of max sag.
      const lMax = Math.max(ls[0], ls[1], ls[2]);
      let be = -1; let bk = -1;
      const keyOf = (e: number): number => (DIRECTED ? edgeVerdict(es[e][0], es[e][1]).sag : ls[e]);
      for (let e = 0; e < 3; e += 1) {
        if (ls[e] < FLOOR_MM || ls[e] * AR < lMax) continue;
        const key = keyOf(e); if (key > bk) { bk = key; be = e; }
      }
      if (be < 0) for (let e = 0; e < 3; e += 1) {
        if (ls[e] < FLOOR_MM) continue;
        const key = keyOf(e); if (key > bk) { bk = key; be = e; }
      }
      if (be < 0) { nFloorRefused += 1; return 'floor'; }
      const [a, b] = canonEdge(es[be][0], es[be][1]); // 0.5 is direction-free; canonical anyway so weldWall's edgeVerdict hits
      const r = tryBisect(a, b, 0.5, false);
      if (r.ok) { nSizeSplit += 1; return 'split'; }
      if (r.refusal === 'R0') { nNoIncident += 1; return 'no-incident'; }
      return weldWall(t, a, b, nd.cls, r.refusal, 'size');
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
    // §2.3 seeding. Under `sweep` the whole initial grid goes into the FIFO unmeasured — the predicate is
    // evaluated at POP, not at push, so there is no up-front ranking pass to pay for.
    if (SWEEP) { for (let t = 0; t < ta.length; t += 1) qPush(t); qGenEnd = qTail; }
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
      bladeSrc = DIRECTED ? 'directed' : 'lepp';
      bladeOwner = t;
      // TRAJECTORY: is the blade population a one-off or does it COMPOUND with refinement? Sampled on a
      // fixed iteration stride so the curve is comparable across arms.
      if (iters % 2000 === 0) bladeCensus(`iter ${iters}`);
      if (DIRECTED) refineDirected(t); else refineLepp(t);
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
      if (created.length === 0) { stuck += 1; unresolved.set(t, kTop); }
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
    for (const [t, k] of unresolved) if (alive[t]) { unresolvedLeft += 1; if (k > unresolvedMax) unresolvedMax = k; }
    // §2.5 "worst-left" GENUINELY DISAPPEARS UNDER `sweep` AND THAT IS A REAL LOSS. With no key, a capped run
    // cannot report the worst residual for free. Replacement: ONE bounded pass over the live remainder of the
    // queue, reported as `worst-left (edge ruler, LOWER BOUND)` — NEVER as a residual estimate. §6.4: the
    // anytime property is given up for real here, and it must not be papered over.
    let queueLeft = 0; let queueWorstSag = 0;
    const unresolvedByWhy = new Map<string, number>();
    if (SWEEP) {
      const size = qTail - qHead;
      for (let i = 0; i < size; i += 1) {
        const t = qBuf[(qHead + i) & qMask];
        if (!alive[t]) continue;
        queueLeft += 1;
        const s = worstEdgeSag(t);
        if (s > queueWorstSag) queueWorstSag = s;
      }
      for (const [t] of unresolved) {
        if (!alive[t]) continue;
        const why = unresolvedWhy.get(t) ?? 'unknown';
        unresolvedByWhy.set(why, (unresolvedByWhy.get(why) ?? 0) + 1);
      }
    }

    // Release the browser as soon as refinement is done — the audit phase below can run for many minutes and
    // has no use for it. `parityUm` and the counters are captured first because the handle goes away.
    const gpuLine = gpu === null ? '' :
      `gpu-rank: n=${GR_N} gn=${GR_GN} covfrac=${GR_COVFRAC} margin=${(GR_MARGIN * 1000).toFixed(3)}µm  scored ${gpuScored} in ${gpuFlushes} flushes / ${gpu.stats.batches} dispatches   ${(gpu.stats.gpuMs / 1000).toFixed(0)}s GPU + ${((gpu.stats.wallMs - gpu.stats.gpuMs) / 1000).toFixed(0)}s transport   rA parity ${gpu.parityUm.toFixed(3)}µm   device-losses ${gpu.stats.deviceLosses}`;
    if (gpu !== null) { await gpu.close(); gpu = null; }

    bladeCensus('after refinement loop');

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

    bladeCensus('after collapse/flip pass');
    console.log('\n════════════ BLADE BIRTH LEDGER (parametric AR > ' + String(BLADE_AR) + ') ════════════');
    console.log('  key = <refiner>/<placement>   *BORN* = the PARENT was well-shaped, the CHILD is not');
    for (const [k, v] of [...bladeBirths.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${String(v).padStart(9)}  ${k}`);
    console.log('  --- of the *BORN* blades, the split edge was the parent triangle\'s: ---');
    for (const [k, v] of [...bladeEdgeRank.entries()].sort((x, y) => y[1] - x[1])) console.log(`  ${String(v).padStart(9)}  ${k} edge`);
    console.log('  --- ASPECT AMPLIFICATION per split: worstChildAR / parentAR (geometric mean) ---');
    for (const [k, a] of [...ampBy.entries()].sort((x, y) => y[1].n - x[1].n)) {
      console.log(`  ${String(a.n).padStart(9)}  gmean x${Math.exp(a.sumLog / a.n).toFixed(3)}   max x${a.max.toFixed(1)} (at t=${a.maxT.toFixed(4)})   ${k}`);
    }
    console.log('  --- samples ---');
    for (const s of bladeSamples) console.log(`   ${s}`);
    console.log('════════════════════════════════════════════════════════════\n');

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
    const order = liveIdx.map((_t, i) => i).sort((p, q) => sags[q] - sags[p]).slice(0, Math.min(tailK, liveIdx.length));
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
    const RANK_SUFFIX: Record<RankMode, string> = { bounded: 'B', plane: '', ptperp: 'P' };
    const tag = `${STYLE.toLowerCase()}_${STAGE}_${DIRECTED ? 'D' : 'l'}${SNAP ? 'S' : '-'}${REPROJ ? 'R' : '-'}${SWEEP ? 'W' : RANK_SUFFIX[RANK]}${BND_DOOM ? 'G' : ''}${tighten === null ? '' : 'T'}${process.env.PF_CB_TAG_SUFFIX ?? ''}`;
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
      `grid ${gu}×${gv} (${initTris} init tris) → ${soup.length} tris (alloc ${ta.length}/${triCap})${capped ? '  [CAPPED]' : ''}${timeCapped ? `  [TIME-CAPPED @ ${MAXSECS}s — NOT converged, this is a TRAJECTORY not a verdict]` : ''}   ${((Date.now() - t0ms) / 1000).toFixed(0)}s, ${(rEvals / 1e6).toFixed(0)}M rA evals`,
      `splits ${iters}   snaps ${nSnap} (jump-class ${nJump})   transverse re-solves ${nReproj}   z-steps ${zSteps.length}`,
      `cleanup: collapsed ${collapsedTris} tris (safe-collapse ${safeCollapses}, link-refused ${refusedCollapses} with ${refusedOffenders} offenders, flips ${flipsDone}, flips-refused-on-locus ${flipsLocusRefused})   welded-splits ${weldedSplits}${NOWELD ? ' (REFUSED)' : ' (allowed)'}`,
      ...(SWEEP ? [] : [`heap: ${heapT.length} left, worst-left ${um(heapLeftMax)} µm, key-inversions ${keyInversions}, no-op splits ${stuck}   MAXtri@oracle${oracleRef} ${maxT >= 0 ? um(sagOfN(maxT, oracleRef)) : 'n/a'} µm`]),
      ...(SWEEP ? [
        `queue: ${queueLeft} live left after ${sweep} sweeps (${qDropped} dead entries compacted out), no-op actions ${stuck}   MAXtri@oracle${oracleRef} ${maxT >= 0 ? um(sagOfN(maxT, oracleRef)) : 'n/a'} µm`,
        `  worst-left ${um(queueWorstSag)} µm  (EDGE RULER, LOWER BOUND — this is NOT a residual estimate; the heap's`,
        '  worst-left had a key to read and the FIFO does not. §6.4: the anytime property is genuinely given up.)',
      ] : []),
      `unresolved: ${unresolvedLeft} live over-tol triangles the splitter could NOT subdivide, worst ${um(unresolvedMax)} µm${unresolvedLeft > 0 ? '   *** an EMPTY HEAP DOES NOT MEAN CLOSURE — these left the queue unrefined ***' : ''}`,
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
        `  unresolved by reason: ${unresolvedByWhy.size === 0 ? 'none' : [...unresolvedByWhy.entries()].sort((x, y) => y[1] - x[1]).map(([w, c]) => `${w} ${c}`).join('  ')}`,
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
