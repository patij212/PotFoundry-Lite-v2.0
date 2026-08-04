// s32RefineMech.ts — THE THREE REFINEMENT-SIDE MECHANISMS, MEASURED.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY. 2026-08-04, commits 181e6962 + 55554e29: three seed knobs swept over 12 arms and the
// crease-crossing RATE will not leave 2.3-2.7%. The crossings are REAL (kink ratio spikes at the
// ideal 0.25) and 88.4% have EXACTLY ONE constrained endpoint — the micro-serration population.
// The population is a fixed point of edge bisection, so the remaining levers are refinement-side.
// Three were found by CODE READ and explicitly left unmeasured. This measures them.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// M1 — THE R4 BAND, AND WHETHER §4.3's VERTEX MOVE IS LEGAL
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// `refineOne` (_strataConformBisect.test.ts:2838) will only place a conforming vertex when the
// crossing sits OUTSIDE the SNAP_ALPHA band: `k.t > 0.12 && k.t < 0.88`. Inside the band it calls
// `weldWall(..., 'R4', 'conform')`, which at :2784 returns `move-deferred` — an HONEST DEAD END, in
// the driver's own words, because the repair it names is not built:
//
//     "§4.2 crease + R4/R1 -> SNAP-TO-LOCUS VERTEX MOVE. NOT IMPLEMENTED (§4.3 deferred).
//      The crossing is within SNAP_ALPHA*|e| of an endpoint ...; the answer is to MOVE that
//      endpoint onto the crossing, which conforms exactly, creates no vertex and terminates in
//      ONE step."
//
// *** AND THIS POPULATION HAS NEVER BEEN COUNTED. *** The driver's headline `alignedSeedCrossings`
// (the published 9,363) SKIPS the band by construction — test.ts:1409 `if (kk.t <= SNAP_ALPHA ||
// kk.t >= 1 - SNAP_ALPHA) continue`. So does this campaign's locality census. Every number quoted so
// far is the population SNAP *can* act on; the R4 population is disjoint from it and unpublished.
//
// MEASURED HERE: (a) how big it is, against the 9,363; (b) for each, whether §4.3's move is LEGAL —
// move the nearer endpoint onto the crossing and re-score its ENTIRE STAR with the driver's own
// `aspect3` (cap 50) and a `signedAreaParam` sign test (the fold guard); (c) the displacement; and
// (d) the split by whether the moved vertex carries a CONSTRAINT, because moving one perturbs the
// constraint polyline and is a different decision from moving a free vertex.
//
// ⚠ THIS IS AN OPTIMISTIC UPPER BOUND ON §4.3's LEGALITY RATE AND MUST BE QUOTED AS ONE. It scores
// the move on the SEED, where stars are fat (seed worst AR 85 but overwhelmingly far below the cap).
// The R4 events the driver actually hits arise MID-REFINEMENT, where the jam census measured stars
// sitting at AR p50 44.0 against a cap of 50. A move that is legal on the seed can be illegal there.
// So: a LOW legality rate here REFUTES §4.3 outright; a high one is necessary, not sufficient, and
// the honest follow-up is an in-driver instrumented arm.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// M2 — ONE KINK PER EDGE. IS 9,363 AN UNDERCOUNT?
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// `locateKinkRaw` coarse-scans |D2r| over `kinkScan`=16 bins, takes THE ARGMAX BIN, refines that one
// bracket, and returns AT MOST ONE kink. An edge crossing two chains — or one chain twice, which is
// the generic case near a gothic arch apex — reports only the stronger crossing. The weaker one is
// invisible to `triangleNeed`, to SNAP, and to every counter in the campaign.
//
// MEASURED HERE: a MULTI-kink scan that keeps every local maximum of |D2r| (up to MULTI_CAP), runs
// the SAME bracket-halving and the SAME two-scale test on each, and counts edges with >=2 qualifying
// kinks. The per-candidate arithmetic is transcribed from `locateKinkRaw` so the first-ranked result
// is identical to what the driver sees — verified by an equality check on every edge.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// M3 — `conformed` IS AN ENDPOINT DISTANCE, NOT A CROSSING TEST
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// _sweepPredicate.ts:184: `conformed = min(|A-P|,|B-P|) <= confMm`, P being the SINGLE returned
// crossing. `triangleNeed` (:2673) demands `conform` only when `!conformed`, and the flag is MONOTONE
// (:2797). Taken alone that is a defensible test. It becomes a blind spot only in combination with
// M2: if the argmax kink sits AT an endpoint, the edge reads `conformed = true` and is retired for
// locus purposes FOREVER — while a genuine INTERIOR crossing on the same edge goes unrepaired.
//
// MEASURED HERE: edges where the driver's returned kink gives `conformed = true` (or lands in the R4
// band) YET the multi-scan finds a qualifying crossing strictly inside the actionable range. That
// count is the honest size of the hidden population, and it is additive to the published 9,363.
//
// Control arm only, seed stage. ~6 min.
//
// Usage:  bash research/tools/run-s32-refine-mech.sh          (from potfoundry-web/)
//
// ═════════════════════════════════════════════════════════════════════════════════════════════════
// RESULT — 2026-08-04. Control reproduces (116,931 / 233,062 / 12,806; actionable 9,363).
// *** THE R4 BAND IS 1.63x THE ENTIRE PUBLISHED CROSSING POPULATION, AND IT WAS NEVER COUNTED. ***
// ═════════════════════════════════════════════════════════════════════════════════════════════════
//   ACTIONABLE crossings (the published 9,363)                              9,363
//   R4: non-jump crossing INSIDE the ±0.12 band                            21,782   (232.6%)
//     of those, already conformed (<=0.6 um from an endpoint)               6,556
//     *** genuinely deferred — the §4.3 population                         15,226 ***  (162.6%)
//        with a CONSTRAINED endpoint  15,124 (99.3%)   free  102 (0.7%)
//   jump-class in band (curtain material, not §4.3's)                         301
//
//   §4.3 MOVE LEGALITY on the seed:  LEGAL 15,190 (99.8%) | aspect 27 (0.2%) | fold 9 (0.1%)
//   move displacement   p10 2.38   p50 22.75   p90 49.50   max 496.65 um
//   star worst AR after p10 2.70   p50 3.47    p90 10.98   (max 136 is an aspect-refused row)
//
//   M2 one-kink-per-edge:  458 edges carry >=2 qualifying kinks = 0.131% of edges, 4.9% of 9,363.
//                          rank mismatches vs the driver: 0 (transcription exact).
//   M3 conformed/in-band hiding a real interior crossing:  108 = 1.2% of 9,363, additive.
//
// ─── WHAT THIS MEANS, IN RANK ORDER ──────────────────────────────────────────────────────────────
// 1. §4.3 IS THE DOMINANT UN-BUILT LEVER. 15,226 deferred events against 9,363 actionable ones. The
//    driver calls each an "HONEST DEAD END" and ships the facet anyway. Nothing in this campaign had
//    counted them, because the headline counter skips the band by construction (test.ts:1409).
// 2. M2 and M3 are REAL BUT MINOR — 4.9% and 1.2%. The code-read critique was directionally right
//    and an order of magnitude smaller than §4.3. Do not spend a driver arm on them first.
//
// ─── ⚠ THREE LIMITS ON THE 99.8%, AND THE THIRD IS THE ONE THAT MATTERS ──────────────────────────
// (a) Scored on the SEED (fat stars). Mid-refinement the jam census measured stars at AR p50 44.0
//     against a cap of 50, so the achievable rate there is strictly lower.
// (b) Each move is scored in ISOLATION. Neighbouring R4 sites share stars; applying thousands of
//     moves interacts, and this probe does not model that.
// (c) *** 99.3% OF THE MOVES DISPLACE A CONSTRAINT VERTEX, AND THIS PROBE SCORED ONLY GEOMETRY —
//     aspect3 + the (θ,z) fold sign. IT DID NOT SCORE PSLG INTEGRITY. *** Moving a constraint vertex
//     perturbs the constraint polyline, and two perturbed segments can CROSS — precisely the
//     planarity the seed builder establishes in stage 2 and which :938-944 records being destroyed
//     once already by running decimation after the crossing split. A §4.3 arm MUST re-check
//     constraint planarity after every move; this 99.8% is NOT evidence that it holds.
//
// ─── AND THE DISPLACEMENT IS ITSELF A FINDING ────────────────────────────────────────────────────
// p50 22.75 um is the distance from a CONSTRAINT vertex to where the true analytic locus crosses an
// edge incident to it. A constraint vertex is supposed to BE on the locus. So the seed's chain
// vertices sit tens of microns off the true locus — the tracer's polyline is resampled at ~0.61 mm
// and the chain at 1,101 um, so an interpolated chain point inherits that secant error. §4.3's move
// would therefore not be repairing a refinement artefact; it would be LAZILY CORRECTING THE SEED'S
// OWN PLACEMENT ERROR, one edge at a time, during refinement. That is a different (and more
// interesting) claim than the deferral comment makes, and it suggests a cheaper alternative worth
// pricing FIRST: re-solve chain vertices onto the locus AT SEED TIME, where planarity is still
// enforced centrally and no star is near the AR cap.
import { readFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { traceLoci, DEFAULT_TRACE_OPTS } from '../bridge/_strataLocusTrace';
import { locateKinkRaw, dThRaw, canonTheta, type SweepPredConst, type SweepKink } from '../bridge/_sweepPredicate';
import { buildAlignedSeedRepaired, DEFAULT_SEED_OPTS } from '../bridge/_strataAlignedSeed';
import { aspect3, signedAreaParam } from '../bridge/_shapeGuard';
import { REGION_SCHEMA, type RegionArtifact } from '../bridge/_strataRegionExtract';
import type { PatchRegion } from '../bridge/_judgeShape';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const SNAP_ALPHA = 0.12;   // PF_CB_SNAP_ALPHA default
const CONF_MM = 0.6 / 1000; // PF_CB_CONF_UM default
const AR_CAP = 50;          // PF_CB_SHAPE_AR default
const MULTI_CAP = 4;        // candidate bins kept per edge in the multi-scan
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
  snap: true, confMm: CONF_MM,
};
const styleParams = { ...registryDefaults('GothicArches') };
const rA = buildRadiusFn('GothicArches' as StyleId, styleParams, DIMS);

/** MULTI-KINK. Same coarse scan, same bracket-halving, same two-scale test as `locateKinkRaw` — but
 *  every local maximum of |D2r| is a candidate, not only the argmax. Results are returned in the
 *  driver's own ranking order (descending coarse |D2r|), so `out[0]` must equal what the driver
 *  returns; that equality is asserted per edge below. */
function locateKinksMulti(
  th0: number, z0: number, th1: number, z1: number, K: SweepPredConst,
): SweepKink[] {
  const dth = th1 - th0; const dz = z1 - z0;
  const at = (t: number): number => rA(canonTheta(th0 + dth * t), z0 + dz * t);
  const N = K.kinkScan;
  const rs = new Float64Array(N + 1);
  for (let k = 0; k <= N; k += 1) rs[k] = at(k / N);
  const d2 = new Float64Array(N + 1);
  for (let k = 1; k < N; k += 1) d2[k] = Math.abs(rs[k + 1] - 2 * rs[k] + rs[k - 1]);
  // every strict local max over the interior bins, ranked by |D2r| descending (argmax first)
  const cand: number[] = [];
  for (let k = 1; k < N; k += 1) {
    if (d2[k] <= 0) continue;
    const l = k - 1 >= 1 ? d2[k - 1] : -1;
    const r = k + 1 < N ? d2[k + 1] : -1;
    if (d2[k] >= l && d2[k] >= r) cand.push(k);
  }
  cand.sort((a, b) => d2[b] - d2[a]);
  const out: SweepKink[] = [];
  for (const bi of cand.slice(0, MULTI_CAP)) {
    let lo = (bi - 1) / N; let hi = (bi + 1) / N;
    let fLo = rs[bi - 1]; let fHi = rs[bi + 1]; let fMid = rs[bi];
    for (let it = 0; it < K.kinkHalvings; it += 1) {
      const mid = 0.5 * (lo + hi);
      const q1 = 0.5 * (lo + mid); const q3 = 0.5 * (mid + hi);
      const fq1 = at(q1); const fq3 = at(q3);
      const dL = Math.abs(fLo - 2 * fq1 + fMid);
      const dR = Math.abs(fMid - 2 * fq3 + fHi);
      if (dL >= dR) { hi = mid; fHi = fMid; fMid = fq1; } else { lo = mid; fLo = fMid; fMid = fq3; }
    }
    const tStar = 0.5 * (lo + hi);
    const w = 1 / N;
    const c = at(tStar);
    const big = Math.abs(at(tStar + w) - 2 * c + at(tStar - w));
    const small = Math.abs(at(tStar + w / 4) - 2 * c + at(tStar - w / 4));
    if (big <= 1e-12) continue;
    const ratio = small / big;
    if (ratio < K.kinkRatio) continue;
    out.push({ t: tStar, big, ratio, jump: ratio > K.jumpRatio });
  }
  return out;
}

log('===== S32 — THE THREE REFINEMENT-SIDE MECHANISMS, MEASURED =====');
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
  + `   ⇒ ${CTL_OK ? 'CONTROL REPRODUCES' : '*** CONTROL DOES NOT REPRODUCE — EVERYTHING BELOW IS VOID ***'}`);
log('');

// ── lift every seed vertex exactly as the driver does (canonical theta for BOTH r and the lift) ──
const nV = seed.pts.length;
const vth = new Float64Array(nV); const vz = new Float64Array(nV);
const vx = new Float64Array(nV); const vy = new Float64Array(nV);
for (let i = 0; i < nV; i += 1) {
  const th = seed.pts[i][0]; const z = seed.pts[i][1];
  const thc = canonTheta(th); const r = rA(thc, z);
  vth[i] = th; vz[i] = z; vx[i] = r * Math.cos(thc); vy[i] = r * Math.sin(thc);
}
// vertex -> incident triangles
const star: number[][] = Array.from({ length: nV }, () => []);
for (let t = 0; t < seed.tris.length; t += 1) {
  const [a, b, c] = seed.tris[t];
  star[a].push(t); star[b].push(t); star[c].push(t);
}
const onCon = new Set<number>();
for (const [a, b] of seed.constraints) { onCon.add(a); onCon.add(b); }

const pct = (arr: number[], f: number): number => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
function dist(name: string, arr: number[], scale: number, unit: string): void {
  if (arr.length === 0) { log(`  ${name.padEnd(24)} (empty)`); return; }
  const s = [...arr].sort((x, y) => x - y);
  log(`  ${name.padEnd(24)} p10 ${(pct(s, 0.10) * scale).toFixed(2).padStart(9)}  p50 ${(pct(s, 0.50) * scale).toFixed(2).padStart(9)}`
    + `  p90 ${(pct(s, 0.90) * scale).toFixed(2).padStart(9)}  max ${(s[s.length - 1] * scale).toFixed(2).padStart(9)} ${unit}`);
}

/** §4.3's move: put vertex `v` at the surface point (thc,z) and re-score its whole star. */
function moveLegal(v: number, thNew: number, zNew: number): { ok: boolean; why: string; worstAR: number } {
  const thc = canonTheta(thNew); const r = rA(thc, zNew);
  const nx = r * Math.cos(thc); const ny = r * Math.sin(thc);
  let worst = 0;
  for (const t of star[v]) {
    const [a, b, c] = seed.tris[t];
    const gx = (i: number): number => (i === v ? nx : vx[i]);
    const gy = (i: number): number => (i === v ? ny : vy[i]);
    const gz = (i: number): number => (i === v ? zNew : vz[i]);
    const gt = (i: number): number => (i === v ? thNew : vth[i]);
    // FOLD: the (theta,z) orientation must not flip. Same test the driver's S2 guard applies.
    const before = signedAreaParam(vth[a], vz[a], vth[b], vz[b], vth[c], vz[c]);
    const after = signedAreaParam(gt(a), gz(a), gt(b), gz(b), gt(c), gz(c));
    if (before === 0 || after === 0 || (before > 0) !== (after > 0)) return { ok: false, why: 'fold', worstAR: Infinity };
    const ar = aspect3(gx(a), gy(a), gz(a), gx(b), gy(b), gz(b), gx(c), gy(c), gz(c));
    if (ar > worst) worst = ar;
  }
  if (!(worst <= AR_CAP)) return { ok: false, why: 'aspect', worstAR: worst };
  return { ok: true, why: 'ok', worstAR: worst };
}

// ── ONE PASS over every undirected seed edge ─────────────────────────────────────────────────────
const seen = new Set<string>();
let tested = 0;
let actionable = 0;                    // the published population: non-jump, t outside the band
let r4 = 0; let r4Jump = 0;            // R4: non-jump, t INSIDE the band  (never counted anywhere)
let r4Conformed = 0;                   // of those, already within CONF_MM of an endpoint
const r4Disp: number[] = [];           // §4.3 displacement, mm
const r4WorstAR: number[] = [];
let mvOk = 0; let mvFold = 0; let mvAspect = 0;
let mvOkCon = 0; let mvOkFree = 0; let r4Con = 0; let r4Free = 0;
let multi2 = 0;                        // edges with >=2 qualifying kinks
let hidden = 0;                        // driver's kink NOT actionable, but a hidden one IS
let rankMismatch = 0;                  // multi-scan's top result != driver's (must be 0)

for (const [a, b, c] of seed.tris) {
  for (const [p, q] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) {
    const lo = p < q ? p : q; const hi = p < q ? q : p;
    const k0 = `${lo},${hi}`;
    if (seen.has(k0)) continue;
    seen.add(k0); tested += 1;
    const dth = dThRaw(vth[lo], vth[hi]);
    const drv = locateKinkRaw(rA, vth[lo], vz[lo], vth[lo] + dth, vz[hi], PRED);
    if (drv === null) continue;
    const inBand = drv.t <= SNAP_ALPHA || drv.t >= 1 - SNAP_ALPHA;

    if (!drv.jump && !inBand) actionable += 1;

    // ── M1: the R4 band ──
    if (inBand) {
      if (drv.jump) r4Jump += 1;
      else {
        r4 += 1;
        // the crossing point, lifted exactly as edgeVerdictRaw does
        const cth = vth[lo] + dth * drv.t; const cz = vz[lo] + (vz[hi] - vz[lo]) * drv.t;
        const cc = canonTheta(cth); const cr = rA(cc, cz);
        const px = cr * Math.cos(cc); const py = cr * Math.sin(cc);
        const dLo = Math.hypot(vx[lo] - px, vy[lo] - py, vz[lo] - cz);
        const dHi = Math.hypot(vx[hi] - px, vy[hi] - py, vz[hi] - cz);
        if (Math.min(dLo, dHi) <= CONF_MM) r4Conformed += 1;
        else {
          const v = dLo <= dHi ? lo : hi;
          if (onCon.has(v)) r4Con += 1; else r4Free += 1;
          r4Disp.push(Math.min(dLo, dHi));
          const m = moveLegal(v, cth, cz);
          if (m.ok) { mvOk += 1; r4WorstAR.push(m.worstAR); if (onCon.has(v)) mvOkCon += 1; else mvOkFree += 1; }
          else if (m.why === 'fold') mvFold += 1;
          else { mvAspect += 1; r4WorstAR.push(m.worstAR); }
        }
      }
    }

    // ── M2 / M3: the multi-scan ──
    const all = locateKinksMulti(vth[lo], vz[lo], vth[lo] + dth, vz[hi], PRED);
    if (all.length > 0 && (!Object.is(all[0].t, drv.t) || !Object.is(all[0].ratio, drv.ratio))) rankMismatch += 1;
    const qualifying = all.filter((k) => !k.jump);
    if (qualifying.length >= 2) multi2 += 1;
    if (!(!drv.jump && !inBand)) {
      // the driver got nothing actionable from this edge — is there a hidden one?
      if (qualifying.some((k) => k.t > SNAP_ALPHA && k.t < 1 - SNAP_ALPHA)) hidden += 1;
    }
  }
}

log('═════════ M1 — THE R4 BAND (SNAP_ALPHA), AND §4.3\'s VERTEX MOVE ═════════');
log(`  edges ${tested}`);
log(`  ACTIONABLE crossings (the published population)  ${actionable}   [S47CAV: 9,363]`);
log(`  *** R4: non-jump crossing INSIDE the ±${SNAP_ALPHA} band  ${r4}`
  + `  = ${((100 * r4) / Math.max(1, actionable)).toFixed(1)}% of the published count ***`);
log(`      of those, already conformed (<= ${(CONF_MM * 1000).toFixed(1)} um from an endpoint): ${r4Conformed}`);
log(`      genuinely deferred (the §4.3 population): ${r4 - r4Conformed}`
  + `   constrained endpoint ${r4Con} / free ${r4Free}`);
log(`  jump-class in band (curtain material, not §4.3's): ${r4Jump}`);
log('');
const pop = Math.max(1, r4 - r4Conformed);
log(`  §4.3 MOVE LEGALITY on the SEED (star re-scored: aspect3 cap ${AR_CAP} + (θ,z) fold sign):`);
log(`      LEGAL   ${mvOk} (${((100 * mvOk) / pop).toFixed(1)}%)   [constrained ${mvOkCon} / free ${mvOkFree}]`);
log(`      illegal — aspect  ${mvAspect} (${((100 * mvAspect) / pop).toFixed(1)}%)`);
log(`      illegal — fold    ${mvFold} (${((100 * mvFold) / pop).toFixed(1)}%)`);
dist('move displacement', r4Disp, 1000, 'um');
dist('star worst AR after', r4WorstAR, 1, '');
log('  ⚠ OPTIMISTIC UPPER BOUND. Scored on the SEED (fat stars). The R4 events the driver actually');
log('    hits arise MID-REFINEMENT, where the jam census measured stars at AR p50 44.0 vs a cap of 50.');
log('    A low rate here REFUTES §4.3; a high one is necessary, not sufficient.');
log('');
log('═════════ M2 — ONE KINK PER EDGE ═════════');
log(`  rank mismatches vs the driver's own locateKink: ${rankMismatch}   (MUST be 0 — the multi-scan's`);
log('    top-ranked result is transcribed to agree with the driver exactly)');
log(`  edges with >= 2 qualifying (non-jump) kinks: ${multi2}`
  + `   = ${((100 * multi2) / Math.max(1, tested)).toFixed(3)}% of edges,`
  + ` ${((100 * multi2) / Math.max(1, actionable)).toFixed(1)}% of the published count`);
log('');
log('═════════ M3 — `conformed` / in-band HIDING A REAL INTERIOR CROSSING ═════════');
log(`  edges the driver reports as NOT actionable (conformed, in-band, or jump) that DO carry a`);
log(`  qualifying crossing strictly inside the actionable range: *** ${hidden} ***`);
log(`      = ${((100 * hidden) / Math.max(1, actionable)).toFixed(1)}% of the published 9,363, and ADDITIVE to it.`);
log('');
log('READ IT LIKE THIS:');
log('  M1 R4 large AND move legality high   ⇒ §4.3 is the biggest un-built lever on the board, and the');
log('    seed says it is mostly legal. Next: instrument it IN the driver — the seed cannot prove it.');
log('  M1 R4 large AND legality low         ⇒ §4.3 is refuted before it is built. The band is a real');
log('    dead end and the answer is a connectivity move, not a vertex move.');
log('  M1 R4 small                          ⇒ the band is not where the population is; §4.3 is a');
log('    correctness fix, not a lever. Deprioritise it.');
log('  M3 hidden large                      ⇒ the published 9,363 is an UNDERCOUNT and every claim');
log('    scoped to it — including this campaign\'s — is measuring a subset. Fix the detector first.');
