// s33ChainResolve.ts — PRICING THE SEED-TIME CHAIN RE-SOLVE.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE CLAIM BEING PRICED
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2026-08-04, commit 20d5729d (`s32RefineMech.ts`) measured the §4.3 deferral population at 15,226 —
// 1.63x the entire published crossing count — and found that **99.3% of the vertices §4.3 would move
// carry a CONSTRAINT**, with displacement p50 22.75 um / p90 49.50 um.
//
// A constraint vertex is supposed to BE on the locus. It is not. The tracer's polyline is resampled
// at ~0.61 mm and the chain at 1,101 um, so an interpolated chain point inherits the secant error of
// the polyline it was interpolated on. §4.3 would be correcting that error LAZILY, one edge at a
// time, mid-refinement, on 15,124 constraint vertices whose stars are by then near the AR cap — and
// with no PSLG planarity check anywhere in the design.
//
// SO PRICE THE CHEAP ALTERNATIVE FIRST: re-solve the chain vertices onto the true analytic locus AT
// SEED TIME, where planarity is enforced centrally by one stage-2 pass and no star is near the cap.
// The primitive already exists and has never been used — L3 / REPROJECT's TRANSVERSE RE-SOLVE
// (_strataConformBisect.test.ts:2207-2222, `PF_CB_REPROJECT`, "transverse re-solves 0" in every run).
// Its probe geometry and its end-of-probe rejection guard are transcribed here verbatim.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS MEASURED, PER ARM (span = transverse probe half-width)
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//   1. DISPLACEMENT — how far each chain vertex actually is from the true locus. This is the
//      independent confirmation of S32's 22.75 um reading, measured a different way (a transverse
//      probe about the vertex, not a kink on an incident edge).
//   2. ACCEPTANCE — REPROJ's guard rejects a kink found near a probe END as a DIFFERENT locus
//      (`|2t-1| < 0.5`), which also caps the accepted displacement at span/2. Reported, because a
//      high rejection rate means the span is wrong, not that the vertices are on-locus.
//   3. CONFORMANCE DEBT AFTER THE MOVE — actionable crossings AND the R4 band, recounted with the
//      driver's own detector. Both, because they are disjoint and the sum is the real debt.
//   4. *** PSLG PLANARITY *** — do any two constraint segments PROPERLY CROSS after the move? This
//      is the risk that decides the whole idea, it is the one S32 explicitly did NOT score, and
//      _strataAlignedSeed.ts:938-944 records it being destroyed once already by mis-ordering
//      decimation against the crossing split. Measured directly, by segment intersection.
//   5. SHAPE — triangles over the AR cap, worst AR, and folds (a (θ,z) orientation flip).
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ⚠ THE APPROXIMATION, STATED UP FRONT, AND WHICH WAY IT ERRS
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// This moves vertices in the ALREADY-TRIANGULATED seed. A real seed-time re-solve would move the
// chain points BEFORE `cdt2d`, and the triangulation would then adapt to them. So:
//   * SHAPE damage here is an OVER-estimate — a real re-solve re-triangulates and would not inherit
//     these stretched stars. Folds and over-cap counts below are worst-case.
//   * CROSSING reduction here is an UNDER-estimate for the same reason — the CDT would also adapt.
//   * PLANARITY is EXACT and not an approximation: it depends only on where the constraint vertices
//     end up, not on the triangulation. That is the number to trust, and it is the decisive one.
// A LOW planarity-break count with a real displacement is a GO for building it in the seed builder.
// A HIGH one means the re-solve must be followed by a re-planarization pass (which stage 2 already
// implements) and the cost of that is the next thing to price, not this.
//
// Boundary-snapped vertices (z=0/H or the seam) are NEVER moved — the builder snapped them there
// deliberately (:948-950) and moving one off re-creates the 1 um-tall sliver that snap exists to
// prevent. Junction vertices (>2 constraint neighbours) are never moved either: the chain direction,
// and therefore the transverse probe, is ILL-DEFINED exactly where two loci cross, which is the
// seed builder's own stated reason for routing junctions to patches instead.
//
// Usage:  bash research/tools/run-s33-chain-resolve.sh          (from potfoundry-web/)
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// RESULT — 2026-08-04. *** GO AT ±50 um: REAL DEBT -34.4%, ZERO PSLG BREAKS. AND IT IS NOT A
// SUBSTITUTE FOR §4.3 — THE TWO FIX DIFFERENT HALVES. ***
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// Control reproduces the seed AND S32's in-band split exactly: 9,363 actionable + 6,556 conformed
// + 15,226 deferred. 12,808 constraint vertices; 798 boundary + 211 junction correctly skipped.
//
//  span   moved   displacement(um)      actionable    conformed     DEFERRED   REAL DEBT   PSLG  folds
//   ctl       —                  —           9,363        6,556       15,226      24,589      0      0
//  ±50   11,294  p50 4.19 p90 10.97    1,399 (-85%)  +23,319    14,724 (-3.3%)  16,123 (-34.4%)  0     5
//  ±100  11,454  p50 4.28 p90 11.39    1,243         +23,127    11,445 (-25%)   12,688 (-48.4%) 13    24
//  ±200  11,493  p50 4.33 p90 11.57    1,340         +22,250     9,253 (-39%)   10,593 (-56.9%) 10    89
//
// ─── 1. THE MECHANISM IS CONFIRMED AND THE EFFECT IS LARGE ───────────────────────────────────────
// Chain vertices ARE off the locus, by p50 4.19 um PERPENDICULAR. (Not in conflict with S32's
// 22.75 um: that measured distance ALONG an incident edge to the crossing; a shallow edge/locus
// angle turns ~4 um of perpendicular error into ~23 um along-edge. The perpendicular one is the
// physical quantity.) Re-solving them collapses the ACTIONABLE crossings 9,363 -> 1,399, **-85%**.
// Those are the transversal crossings — the micro-serration population.
//
// ─── 2. *** THE FINDING THAT CHANGES THE PLAN: IT IS NOT AN ALTERNATIVE TO §4.3 *** ──────────────
// At ±50 um — the ONLY span with zero planarity breaks — the DEFERRED population moves by 502 of
// 15,226 (-3.3%). Essentially untouched. The seed-time re-solve kills the actionable half; §4.3's
// half survives it almost entirely. They are COMPLEMENTARY, not substitutes, and the earlier framing
// of them as a choice was wrong. Sequence: re-solve first (cheap, safe, -85% on the visible defect),
// then §4.3 for the remainder — which still needs its own PSLG check built before any arm.
//
// ─── 3. SPAN IS A REAL TRADE, AND ±50 um IS THE ONLY FREE ONE ────────────────────────────────────
// Wider spans DO eat the deferred half (-25%, -39%) but break PSLG planarity (13, 10) and wreck
// shape (folds 24/89, worstAR 1,750/25,598). That is REPROJ's documented failure mode: a wider
// transverse probe reaches a NEIGHBOURING locus, and its end-of-probe guard cannot catch every case.
// ⇒ ±50 um is the shipping setting. A wider span is only admissible AFTER a stage-2 re-planarization
//   pass, and that pass's cost is the next thing to price — not a blocker, a sequence.
//
// ─── 4. WHAT IS WORST-CASE HERE AND WHAT IS EXACT ────────────────────────────────────────────────
// folds 5 / overCap 6 / worstAR 208 at ±50 um are OVER-estimates: this probe perturbs an
// already-triangulated seed. A real seed-time re-solve moves the points BEFORE cdt2d and the
// triangulation adapts, so those should vanish. PSLG planarity is EXACT and it reads 0.
// The guard-rejection trap did NOT fire (155 of 11,799 at ±50 um, 11,294 actually moved), so the
// result is not a disguised no-op.
//
// ⚠ THE METRIC IN THIS FILE'S FIRST RUN WAS WRONG AND INVERTED THE HEADLINE — see `debt()`. It
//   counted the whole in-band population as debt, so a re-solve that moves crossings ONTO vertices
//   (which is what conformance IS) read as "+47.7% REGRESSION". Conformed is the GOAL STATE. The
//   split is S32's and should never have been collapsed.
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { traceLoci, DEFAULT_TRACE_OPTS } from '../bridge/_strataLocusTrace';
import { locateKinkRaw, dThRaw, canonTheta, type SweepPredConst } from '../bridge/_sweepPredicate';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS } from '../bridge/_strataAlignedSeed';
import { aspect3, signedAreaParam } from '../bridge/_shapeGuard';
import { REGION_SCHEMA, type RegionArtifact } from '../bridge/_strataRegionExtract';
import type { PatchRegion } from '../bridge/_judgeShape';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const rRef = 45;
const TWO_PI = 2 * Math.PI;
const SNAP_ALPHA = 0.12;
const AR_CAP = 50;
const BOUND_TOL = 1e-9;
const AL_PATCH = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_S21B.regions.json';
const AL_PATCH_IDS = ('0,25,32,34,39,42,43,44,46,47,49,51,53,54,57,59,65,68,72,77,87,92,93,96,97,107,'
  + '1000,1001,1002,1003,1004,1005,1006,1007,1008,1009,1010,1011,1012,1013,1014,1015,1016').split(',');

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 16, kinkHalvings: 24, kinkRatio: 0.15, jumpRatio: 0.62,
  snap: true, confMm: 0.6 / 1000,
};
const styleParams = { ...registryDefaults('GothicArches') };
const rA = buildRadiusFn('GothicArches' as StyleId, styleParams, DIMS);

log('===== S33 — PRICING THE SEED-TIME CHAIN RE-SOLVE =====');
const t0 = Date.now();
const art = traceLoci(rA, { ...DEFAULT_TRACE_OPTS, H, pred: PRED, nu: 400, nv: 280, hRefMm: 0.35 });
log(`trace ${((Date.now() - t0) / 1000).toFixed(0)}s — ${art.counts.loci} components, junctions ${art.counts.junctions}`);

const regArt = JSON.parse(readFileSync(AL_PATCH, 'utf8')) as RegionArtifact;
if (regArt.schema !== REGION_SCHEMA) throw new Error('patch schema mismatch');
const chosen = new Map<number, { id: number; theta: number; z: number; radiusMm: number }>();
for (const s of AL_PATCH_IDS) {
  const r = regArt.regions.find((x) => x.id === Number(s));
  if (r === undefined) throw new Error(`patch id ${s} absent`);
  chosen.set(r.id, r);
}
const patchRoute: PatchRegion[] = [...chosen.values()].sort((a, b) => a.id - b.id)
  .map((r) => ({ id: `D${r.id}`, theta: r.theta, z: r.z, radiusMm: r.radiusMm }));

const t1 = Date.now();
const seed = buildAlignedSeedRepaired(rA, art, {
  ...DEFAULT_SEED_OPTS, H, gu: 200, gv: 140,
  alongMul: 1.0, acrossFrac: 0.35, useField: true,
  acrossAbs: true, acrossMinMm: 0.050, seedARmax: 24, bowFrac: 0,
  patchRoute, patchMaxMm: 1.5, patchSubMax: 16,
  acrossRings: 7, acrossGrade: 1.6, acrossStrideMax: 4,
  acrossStructured: false, acrossStructuredMode: 'full',
  acrossMaxMm: 0.650, turnMul: 9,
  mistraceUm: 0, shapeAR: 50, tolMm: 0.01,
}, 6).seed;
const st = seed.stats;
const CTL_OK = st.points === 116931 && st.tris === 233062 && st.constraints === 12806;
log(`seed ${((Date.now() - t1) / 1000).toFixed(0)}s — points ${st.points} tris ${st.tris} constraints ${st.constraints}`
  + `   ⇒ ${CTL_OK ? 'CONTROL REPRODUCES' : '*** DOES NOT REPRODUCE — EVERYTHING BELOW IS VOID ***'}`);

const nV = seed.pts.length;
const th0 = new Float64Array(nV); const z0 = new Float64Array(nV);
for (let i = 0; i < nV; i += 1) { th0[i] = seed.pts[i][0]; z0[i] = seed.pts[i][1]; }

// constraint adjacency
const adj: number[][] = Array.from({ length: nV }, () => []);
for (const [a, b] of seed.constraints) { adj[a].push(b); adj[b].push(a); }
const onBoundary = (i: number): boolean => {
  const x = rRef * th0[i];
  return z0[i] <= BOUND_TOL || z0[i] >= H - BOUND_TOL || x <= BOUND_TOL || x >= rRef * TWO_PI - BOUND_TOL;
};
let nChain = 0; let nSkipBoundary = 0; let nSkipJunction = 0; let nSkipDegenerate = 0;
for (let i = 0; i < nV; i += 1) {
  if (adj[i].length === 0) continue;
  nChain += 1;
  if (onBoundary(i)) nSkipBoundary += 1;
  else if (adj[i].length > 2) nSkipJunction += 1;
}
log(`constraint vertices ${nChain}   skipped: boundary ${nSkipBoundary}, junction ${nSkipJunction}`);
log('');

const pct = (a: number[], f: number): number => a[Math.min(a.length - 1, Math.floor(f * a.length))];
function dist(name: string, arr: number[], scale: number, unit: string): void {
  if (arr.length === 0) { log(`  ${name.padEnd(24)} (empty)`); return; }
  const s = [...arr].sort((x, y) => x - y);
  log(`  ${name.padEnd(24)} p10 ${(pct(s, 0.10) * scale).toFixed(2).padStart(8)}  p50 ${(pct(s, 0.50) * scale).toFixed(2).padStart(8)}`
    + `  p90 ${(pct(s, 0.90) * scale).toFixed(2).padStart(8)}  max ${(s[s.length - 1] * scale).toFixed(2).padStart(9)} ${unit}`);
}

/** The driver's conformance debt on a given vertex placement.
 *
 *  ⚠ THE FIRST VERSION OF THIS FUNCTION WAS WRONG AND INVERTED THE HEADLINE. It counted the WHOLE
 *  in-band population as debt. But S32 had already established that in-band splits two ways, and
 *  only one of them is debt:
 *    * CONFORMED — the crossing is within `confMm` (0.6 um) of an endpoint. `edgeVerdictRaw:184`
 *      sets `conformed = true` and `triangleNeed:2673` never asks for a conform split. The feature
 *      passes through a MESH VERTEX. That is the GOAL STATE, not a defect.
 *    * DEFERRED  — in-band but further than confMm from either endpoint. `weldWall:2784` returns
 *      `move-deferred`, §4.3's unbuilt move is the named repair, and the facet SHIPS. Real debt.
 *  Lumping them made a re-solve that moves crossings ONTO vertices — precisely what conformance
 *  means — look like a 47.7% REGRESSION. Split, exactly as s32RefineMech.ts does. */
function debt(th: Float64Array, z: Float64Array): {
  actionable: number; conformed: number; deferred: number; tested: number;
} {
  const seen = new Set<string>();
  let actionable = 0; let conformed = 0; let deferred = 0; let tested = 0;
  for (const [a, b, c] of seed.tris) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
      const lo = p < q ? p : q; const hi = p < q ? q : p;
      const k = `${lo},${hi}`;
      if (seen.has(k)) continue;
      seen.add(k); tested += 1;
      const dth = dThRaw(th[lo], th[hi]);
      const kk = locateKinkRaw(rA, th[lo], z[lo], th[lo] + dth, z[hi], PRED);
      if (kk === null || kk.jump) continue;
      if (kk.t > SNAP_ALPHA && kk.t < 1 - SNAP_ALPHA) { actionable += 1; continue; }
      // in band — conformed, or genuinely deferred? Lift the crossing exactly as edgeVerdictRaw does.
      const cth = th[lo] + dth * kk.t; const cz = z[lo] + (z[hi] - z[lo]) * kk.t;
      const cc = canonTheta(cth); const cr = rA(cc, cz);
      const px = cr * Math.cos(cc); const py = cr * Math.sin(cc);
      const lift = (i: number): [number, number] => {
        const tc = canonTheta(th[i]); const r = rA(tc, z[i]);
        return [r * Math.cos(tc), r * Math.sin(tc)];
      };
      const [lx, ly] = lift(lo); const [hx, hy] = lift(hi);
      const dLo = Math.hypot(lx - px, ly - py, z[lo] - cz);
      const dHi = Math.hypot(hx - px, hy - py, z[hi] - cz);
      if (Math.min(dLo, dHi) <= PRED.confMm) conformed += 1; else deferred += 1;
    }
  }
  return { actionable, conformed, deferred, tested };
}

/** PROPER crossings among the constraint segments — the PSLG planarity test, in chart coords. */
function planarityBreaks(th: Float64Array, z: Float64Array): number {
  const X = (i: number): number => rRef * canonTheta(th[i]);
  const segs = seed.constraints;
  const BS = 2.0;
  const buckets = new Map<string, number[]>();
  for (let s = 0; s < segs.length; s += 1) {
    const [a, b] = segs[s];
    const xa = X(a); const xb = X(b);
    // a segment that wraps the seam in chart coords is not comparable here; the builder forbids
    // constraints spanning the cut (`splitAtSeam`), so this should never fire — count it if it does.
    if (Math.abs(xa - xb) > rRef * Math.PI) continue;
    for (let ix = Math.floor(Math.min(xa, xb) / BS); ix <= Math.floor(Math.max(xa, xb) / BS); ix += 1) {
      for (let iy = Math.floor(Math.min(z[a], z[b]) / BS); iy <= Math.floor(Math.max(z[a], z[b]) / BS); iy += 1) {
        const k = `${ix},${iy}`; const l = buckets.get(k);
        if (l === undefined) buckets.set(k, [s]); else l.push(s);
      }
    }
  }
  const o = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number => {
    const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    return v > 0 ? 1 : v < 0 ? -1 : 0;
  };
  const found = new Set<string>();
  for (const list of buckets.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const s = list[i]; const t = list[j];
        const [a, b] = segs[s]; const [c, d] = segs[t];
        if (a === c || a === d || b === c || b === d) continue;   // shared endpoint is not a crossing
        const o1 = o(X(a), z[a], X(b), z[b], X(c), z[c]);
        const o2 = o(X(a), z[a], X(b), z[b], X(d), z[d]);
        const o3 = o(X(c), z[c], X(d), z[d], X(a), z[a]);
        const o4 = o(X(c), z[c], X(d), z[d], X(b), z[b]);
        if (o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0) {
          found.add(s < t ? `${s},${t}` : `${t},${s}`);
        }
      }
    }
  }
  return found.size;
}

/** shape census on a placement: over-cap facets, worst AR, folds vs the control orientation. */
function shape(th: Float64Array, z: Float64Array): { overCap: number; worst: number; folds: number } {
  let overCap = 0; let worst = 0; let folds = 0;
  for (const [a, b, c] of seed.tris) {
    const before = signedAreaParam(th0[a], z0[a], th0[b], z0[b], th0[c], z0[c]);
    const after = signedAreaParam(th[a], z[a], th[b], z[b], th[c], z[c]);
    if (before !== 0 && (after === 0 || (before > 0) !== (after > 0))) folds += 1;
    const P = [a, b, c].map((i) => {
      const tc = canonTheta(th[i]); const r = rA(tc, z[i]);
      return [r * Math.cos(tc), r * Math.sin(tc), z[i]] as [number, number, number];
    });
    const ar = aspect3(P[0][0], P[0][1], P[0][2], P[1][0], P[1][1], P[1][2], P[2][0], P[2][1], P[2][2]);
    if (ar > worst) worst = ar;
    if (ar > AR_CAP) overCap += 1;
  }
  return { overCap, worst, folds };
}

// ── CONTROL ──────────────────────────────────────────────────────────────────────────────────────
log('### CONTROL — no re-solve');
const cDebt = debt(th0, z0);
const cPlan = planarityBreaks(th0, z0);
const cShape = shape(th0, z0);
log(`    actionable ${cDebt.actionable}   in-band conformed ${cDebt.conformed}   in-band DEFERRED ${cDebt.deferred}`
  + `   / ${cDebt.tested} edges`);
log(`    >>> REAL DEBT (actionable + deferred) ${cDebt.actionable + cDebt.deferred} <<<`
  + `   [conformed is the GOAL STATE, not debt]`);
log(`    PSLG planarity breaks ${cPlan}   overCap ${cShape.overCap}  worstAR ${cShape.worst.toFixed(2)}  folds ${cShape.folds}`);
log(`    (S47CAV published actionable 9,363; S32 measured in-band 21,782 = 6,556 conformed + 15,226 deferred)`);
log('');

// ── ARMS: transverse re-solve at three probe half-widths ─────────────────────────────────────────
for (const spanUm of [50, 100, 200]) {
  const span = spanUm / 1000;
  const th = Float64Array.from(th0); const z = Float64Array.from(z0);
  const disp: number[] = [];
  let moved = 0; let rejGuard = 0; let rejNull = 0; let rejJump = 0; let skipped = 0;
  for (let i = 0; i < nV; i += 1) {
    if (adj[i].length === 0) continue;
    if (onBoundary(i) || adj[i].length > 2) { skipped += 1; continue; }
    // local chain direction from the constraint neighbours (transcribed geometry: REPROJ :2209-2216)
    const n0 = adj[i][0]; const n1 = adj[i].length > 1 ? adj[i][1] : i;
    const mth = th0[i]; const mz = z0[i];
    const rMid = rA(canonTheta(mth), mz);
    const eArc = rMid * dThRaw(th0[n0], th0[n1]); const eZ = z0[n1] - z0[n0];
    const L = Math.hypot(eArc, eZ);
    if (!(L > 1e-9)) { nSkipDegenerate += 1; skipped += 1; continue; }
    const pArc = -eZ / L; const pZ = eArc / L;
    const dth = (pArc * span) / Math.max(1e-6, rMid); const dz = pZ * span;
    const k = locateKinkRaw(rA, mth - dth, mz - dz, mth + dth, mz + dz, PRED);
    if (k === null) { rejNull += 1; continue; }
    if (k.jump) { rejJump += 1; continue; }
    if (!(Math.abs(2 * k.t - 1) < 0.5)) { rejGuard += 1; continue; }   // REPROJ's own end-of-probe guard
    const off = 2 * k.t - 1;
    th[i] = mth + off * dth; z[i] = mz + off * dz;
    disp.push(Math.hypot(rRef * (th[i] - mth), z[i] - mz));
    moved += 1;
  }
  const d = debt(th, z);
  const plan = planarityBreaks(th, z);
  const sh = shape(th, z);
  const totalC = cDebt.actionable + cDebt.deferred; const total = d.actionable + d.deferred;
  const sg = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);
  log(`### ARM span ±${spanUm} um`);
  log(`    moved ${moved} of ${nChain - skipped} eligible`
    + `   rejected: guard ${rejGuard} (kink near probe end = a DIFFERENT locus), no-kink ${rejNull}, jump ${rejJump}`);
  dist('displacement', disp, 1000, 'um');
  log(`    actionable ${d.actionable} (${sg(d.actionable - cDebt.actionable)})`
    + `   in-band conformed ${d.conformed} (${sg(d.conformed - cDebt.conformed)})`
    + `   in-band DEFERRED ${d.deferred} (${sg(d.deferred - cDebt.deferred)})`);
  log(`    >>> REAL DEBT ${total} vs ${totalC}  = ${sg(total - totalC)}`
    + ` (${(((100 * (total - totalC)) / totalC)).toFixed(1)}%) <<<`);
  log(`    *** PSLG planarity breaks ${plan} (control ${cPlan}) ***`);
  log(`    overCap ${sh.overCap} (ctl ${cShape.overCap})  worstAR ${sh.worst.toFixed(2)} (ctl ${cShape.worst.toFixed(2)})`
    + `  folds ${sh.folds}`);
  log('');
}

log('READ IT LIKE THIS:');
log('  DEBT down materially AND planarity breaks ~0  ⇒ GO. Build the re-solve into the seed builder');
log('    between chain resample and stage-2 planarization. Shape numbers here are worst-case (this');
log('    probe does not re-triangulate); the real thing will be better, not worse.');
log('  DEBT down BUT planarity breaks > 0            ⇒ the re-solve MUST be followed by stage-2');
log('    re-planarization. That pass already exists; price its cost next. Not a blocker, a sequence.');
log('  DEBT FLAT                                     ⇒ the chain vertices are NOT the error source and');
log('    S32\'s 22.75 um displacement is measuring something else. Then §4.3 in-driver is the only');
log('    remaining lever and it needs its own PSLG check built before any arm.');
log('  guard rejections dominant                     ⇒ the span is wrong, not the vertices. Re-run');
log('    before concluding anything — a rejected probe leaves the vertex where it was.');
