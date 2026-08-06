// research/tools/s99CreaseCensus.ts — S99: DOES THE OVER-BAR AREA SPAN GENUINE CREASES, AND WHY?
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS TOOL EXISTS — THE INSTRUMENT S93 USED FOR THE "CREASE" CLASS CANNOT SIZE IT
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S93 partitions the over-bar AREA into FOLDED / CREASE / SMOOTH-TURNING and reports CREASE at
// 0.39% (Gothic) / 0.11% (Voronoi). The CREASE test is `kinkDeg > 1`, where `kinkDeg` is the spread
// of the FOUR ONE-SIDED finite-difference normals AT A LATTICE POINT, at a FIXED step h = 2e-4 mm.
// `orientRuler.ts` documents that quantity's own limitation verbatim:
//
//     "it only fires when a lattice point lands within `hArc` of the kink — a set of measure ~h.
//      It is an h-DEPENDENT detector and it is NOT the one to use on a real mesh."
//
// A facet of diameter 0.5 mm carries 45 lattice points; a crease line crossing it passes within
// 2e-4 mm of a lattice point only by luck. So `kinkDeg > 1` is a ~1-in-N SAMPLER of the crease
// population, not a census of it, and 0.39% is a LOWER bound of unknown tightness.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE h-FREE DETECTOR — A TWO-SIDED LIMIT, NOT A FIXED-STEP DIFFERENCE AND NOT A BISECTION ENDPOINT
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// A crease is a place where the normal field has a JUMP. Along a segment of length L, at offset d
// from the located feature:
//     smooth patch : angle( n(s*-d), n(s*+d) )  ~  2*kappa*d  ->  0 as d -> 0
//     C0 crease    : angle( n(s*-d), n(s*+d) )  ->  the DIHEDRAL, INVARIANT in d
// So the tool evaluates that two-sided angle on a LADDER d = L*2^-6 ... L*2^-14 with the
// finite-difference half-width tied to d (h = d/32, so neither one-sided window can straddle the
// feature — even for a crossing as oblique as 2.5 deg). `turnFine` (d = L*2^-14) IS the dihedral;
// `turnFine/turnCoarse` over a 256x shrink of d is the (d)-class discriminator: ~1 = genuine C0,
// ~1/256 = a smooth curvature peak.
//
// *** THIS TOOL DOES NOT USE `orientRuler.locateTurnAdaptive`'s RETURNED TURN, AND HERE IS WHY. ***
// Fixture F1 (a z-wedge with the crease at the exact midpoint of the probe) makes it return EXACTLY
// HALF the dihedral: its bisection compares ang(n0,nm) vs ang(nm,n1) and on the symmetric tie the
// `>=` sends `hi = mid`, planting the bracket endpoint ON the crease, where a central difference
// returns the AVERAGE of the two one-sided normals. Fixture F5's symmetric smooth bump makes it
// return 0.0000 deg for a 12-deg turn, because the same tie walks the bracket to a flat end. That is
// the S74 "walks to the LEFT END" defect resurfacing in the SYMMETRIC configuration, which S74's own
// fixture (crease at s=0.5-ish but not exactly) does not exercise. Both are reproduced in the
// self-test below (`--xcheck`) rather than asserted away. `orientRuler.ts` is NOT patched here: it is
// a shipped instrument other running jobs share, and this is a read-only census.
//
// A CREASE LYING ALONG THE PROBE SEGMENT READS ~0 — that is the point, not a defect (fixture F3):
// it is exactly what distinguishes "this edge CROSSES a crease" (bad, spanning) from "this edge LIES
// ON a crease" (good, conforming). Endpoints are INSET by `EPS` so a vertex sitting exactly on a
// crease (the conforming mesher's best work) is not counted as a crossing.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS ATTRIBUTED, AGAINST THE BRIEF'S FOUR CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────────────────────────
//  (a) DETECTION  — the driver's OWN locator `locateKinkRaw` (imported from `_sweepPredicate`, the
//                   exact code the driver runs, with the driver's default constants) is run on the
//                   SAME segments. Its miss rate against the h-free detector IS (a).
//  (b) PLACEMENT  — the crossing's distance to the nearest facet VERTEX, in um. A conforming mesher
//                   that lands ON the crease puts this at ~0; one that lands NEAR it puts it at a
//                   small but non-zero value; one that ignores the crease puts it at ~L/4 (uniform).
//                   The driver's own `conformed` flag (crossing within CONF_MM=0.6um of an endpoint)
//                   is recorded next to it, so a mislabel is visible.
//  (c) LOST LATER — not decidable from a final mesh alone; this tool measures the STATE.
//  (d) NOT 1-D    — the `turnFine/turnCoarse` ladder ratio above.
//
// Usage: bash research/tools/run-s99-crease-census.sh
// PURE READ-ONLY. No production code, no flags, no mesher run.
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, edgeVerdictRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormalsCentral, fdNormals, locateTurnAdaptive, radialNormal } from '../bridge/orientRuler';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S99_STYLE ?? 'GothicArches';
const STL = process.env.PF_S99_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S99_TAG ?? 'GOTH';
const NSAMP = Math.round(envF('PF_S99_N', 20000));
const K = Math.round(envF('PF_S99_K', 8));
const INSET = envF('PF_S99_INSET', 0.02);
const BAR_UM = envF('PF_S99_BAR_UM', 10);
const TURN_DEG = envF('PF_S99_TURN_DEG', 1.0);
const EPS = envF('PF_S99_EPS', 0.05);
const SCAN = Math.round(envF('PF_S99_SCAN', 8));
const ITERS = Math.round(envF('PF_S99_ITERS', 16));
const DIMS: StyleDims = { H: envF('PF_S99_H', 120), Rb: envF('PF_S99_RB', 40), Rt: envF('PF_S99_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = process.env.PF_S99_OUT ?? 'research/exchange/_strataConformBisect/s99';
const RAD = 180 / Math.PI;
/** the two-sided offset ladder, as NEGATIVE powers of two of the segment length */
const LAD = [6, 8, 10, 12, 14];

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE DETECTOR
// ═══════════════════════════════════════════════════════════════════════════════════════════════
export interface CreaseHit {
  /** parameter along the probe segment where the normal field turns fastest */
  s: number;
  /** two-sided normal jump at offset L*2^-14 — the DIHEDRAL for a C0 crease, ~0 for a smooth patch */
  turnFine: number;
  /** the same at offset L*2^-6 */
  turnCoarse: number;
  /** turnFine / turnCoarse. ~1 => genuine C0 (invariant under a 256x shrink). ~1/256 => smooth. */
  ratio: number;
  /** the winning bracket was the coarse scan's RUNNER-UP, i.e. a bigger turn elsewhere masked it */
  masked: boolean;
}

function makeProbe(rA: (th: number, z: number) => number, Hd: number) {
  const nrm = (th: number, z: number, hMm: number, out: Float64Array, o: number): void => {
    const r0 = rA(th, z);
    const hTh = hMm / Math.max(1e-9, Math.abs(r0));
    let zLo = z - hMm; let zHi = z + hMm;
    if (zLo < 0) { zLo = 0; zHi = Math.min(Hd, 2 * hMm); }
    if (zHi > Hd) { zHi = Hd; zLo = Math.max(0, Hd - 2 * hMm); }
    const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * hTh);
    const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
    radialNormal(r0, rt, rz, th, out, o);
  };
  const ang = (p: Float64Array, po: number, q: Float64Array, qo: number): number => {
    let d = p[po] * q[qo] + p[po + 1] * q[qo + 1] + p[po + 2] * q[qo + 2];
    d = d > 1 ? 1 : d < -1 ? -1 : d; return Math.acos(d);
  };
  /**
   * Probe the segment (th0,z0)->(th1,z1). `rRef` turns theta into arc length so the FD step is a
   * true length everywhere.
   */
  const n0 = new Float64Array(3); const nm = new Float64Array(3); const n1 = new Float64Array(3);
  return function probe(
    th0: number, z0: number, th1: number, z1: number, rRef: number,
    scan = SCAN, iters = ITERS, nBrackets = 2,
  ): CreaseHit {
    const lenMm = Math.hypot(rRef * (th1 - th0), z1 - z0);
    if (!(lenMm > 0)) return { s: 0.5, turnFine: 0, turnCoarse: 0, ratio: 0, masked: false };
    const buf = new Float64Array(3 * (scan + 1));
    const at = (s: number, h: number, out: Float64Array, o: number): void =>
      nrm(th0 + (th1 - th0) * s, z0 + (z1 - z0) * s, h, out, o);
    // ── 1. coarse scan: rank the adjacent pairs by how much their normals differ. A C0 crease can
    //       never be MISSED by this (its jump is scale-free, so the two straddling scan points
    //       differ by the dihedral however narrow it is); a NARROW SMOOTH feature can be, which is
    //       a stated limitation and not the target class. The top `nBrackets` are followed so a
    //       large smooth turn elsewhere on the segment cannot mask a smaller crease; `masked`
    //       records when the runner-up won. ──
    const hC = lenMm / (scan * 32);
    for (let i = 0; i <= scan; i += 1) at(i / scan, hC, buf, 3 * i);
    const order: Array<{ i: number; a: number }> = [];
    for (let i = 0; i < scan; i += 1) order.push({ i, a: ang(buf, 3 * i, buf, 3 * (i + 1)) });
    order.sort((x, y) => y.a - x.a);
    let best: CreaseHit = { s: 0.5, turnFine: -1, turnCoarse: 0, ratio: 0, masked: false };
    for (let b = 0; b < Math.min(nBrackets, order.length); b += 1) {
      let lo = order[b].i / scan; let hi = (order[b].i + 1) / scan;
      // ── 2. bisect, keeping the half with the larger normal change. FD step = bracket/32, so a
      //       probe window never straddles the feature. A SYMMETRIC TIE shrinks about `mid`
      //       instead of picking a side — that is the F1/F2b defect fixed. ──
      for (let it = 0; it < iters; it += 1) {
        const w = hi - lo; const h = (lenMm * w) / 32; const mid = 0.5 * (lo + hi);
        at(lo, h, n0, 0); at(mid, h, nm, 0); at(hi, h, n1, 0);
        const a = ang(n0, 0, nm, 0); const c = ang(nm, 0, n1, 0);
        if (a > c + 1e-13) hi = mid;
        else if (c > a + 1e-13) lo = mid;
        else { lo = mid - 0.25 * w; hi = mid + 0.25 * w; }
      }
      const s = 0.5 * (lo + hi);
      // ── 3. the TWO-SIDED LIMIT ladder, ANCHORED so both rungs fit inside the segment. The span
      //       between the coarsest and finest rung is always 2^(LAD.last - LAD.first) = 256x, so
      //       `ratio` means the same thing wherever `s` landed. ──
      const dMax = Math.min(Math.pow(2, -LAD[0]), 0.45 * Math.min(s, 1 - s));
      if (!(dMax > 0)) continue;
      let tFine = 0; let tCoarse = 0;
      for (let q = 0; q < LAD.length; q += 1) {
        const d = dMax * Math.pow(2, LAD[0] - LAD[q]);
        const h = (lenMm * d) / 32;
        at(s - d, h, n0, 0); at(s + d, h, n1, 0);
        const a = ang(n0, 0, n1, 0);
        if (q === 0) tCoarse = a;
        tFine = a;
      }
      if (tFine > best.turnFine) {
        best = { s, turnFine: tFine, turnCoarse: tCoarse, ratio: tFine / Math.max(1e-300, tCoarse), masked: b > 0 };
      }
    }
    if (best.turnFine < 0) return { s: 0.5, turnFine: 0, turnCoarse: 0, ratio: 0, masked: false };
    return best;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// SELF-TEST — the detector is pinned on closed-form fixtures BEFORE it is pointed at a mesh.
// Every bar is TWO-SIDED (a truncated or collapsed implementation must fail it).
// ═══════════════════════════════════════════════════════════════════════════════════════════════
function selfTest(): boolean {
  log('═══ SELF-TEST: the h-free crease detector on closed-form fixtures ═══');
  let ok = true;
  const chk = (name: string, got: number, want: number, tol: number, unit: string): void => {
    const pass = Math.abs(got - want) <= tol;
    if (!pass) ok = false;
    log(`  ${pass ? 'PASS' : '*** FAIL ***'}  ${name}: got ${got.toPrecision(6)} ${unit}, want ${want.toPrecision(6)} +/- ${tol.toExponential(2)}`);
  };
  const R0 = 40; const HH = 120;

  // F1 — z-WEDGE, crease at the EXACT probe midpoint. rA = R0 + a*|z-z0|, dihedral = 2*atan(a).
  {
    const a = 0.5; const z0 = 60;
    const rW = (_th: number, z: number): number => R0 + a * Math.abs(z - z0);
    const P = makeProbe(rW, HH);
    const r = P(1.0, 40, 1.0, 80, R0);
    chk('F1 z-wedge  crease z', 40 + 40 * r.s, z0, 1e-4, 'mm');
    chk('F1 z-wedge  dihedral', r.turnFine * RAD, 2 * Math.atan(a) * RAD, 0.01, 'deg');
    chk('F1 z-wedge  ladder ratio (C0 => 1)', r.ratio, 1, 0.01, '');
    // the shipped instrument on the SAME fixture, for the record
    const lt = locateTurnAdaptive(rW, HH, 1.0, 40, 1.0, 80, R0, 24);
    log(`     [xcheck] orientRuler.locateTurnAdaptive returns ${(lt.turn * RAD).toPrecision(6)} deg = ${(lt.turn / (2 * Math.atan(a))).toFixed(4)}x the dihedral (symmetric-tie defect)`);
  }
  // F1b — the SAME wedge with the crease OFF-centre: the shipped instrument agrees there, which is
  // why the defect was invisible. Both must give the full dihedral.
  {
    const a = 0.5; const z0 = 61.3;
    const rW = (_th: number, z: number): number => R0 + a * Math.abs(z - z0);
    const P = makeProbe(rW, HH);
    const r = P(1.0, 40, 1.0, 80, R0);
    chk('F1b off-centre dihedral', r.turnFine * RAD, 2 * Math.atan(a) * RAD, 0.01, 'deg');
    const lt = locateTurnAdaptive(rW, HH, 1.0, 40, 1.0, 80, R0, 24);
    chk('F1b locateTurnAdaptive agrees off-centre', lt.turn * RAD, 2 * Math.atan(a) * RAD, 0.05, 'deg');
  }
  // F2 — SMOOTH, and the reference is EXACT, not "about zero". On a perfect cylinder the surface
  // normal turns by exactly the arc angle, so the two-sided turn at offset d is ANALYTICALLY
  // 2*d*Larc/R0 — LINEAR in d. Both rungs and the ratio are asserted against closed form, so a
  // detector that simply returns 0 (the failure mode a one-sided "must be small" bar would accept)
  // FAILS the coarse rung.
  {
    const rC = (): number => R0;
    const P = makeProbe(rC, HH);
    const Larc = 4; const dth = Larc / R0;
    const r = P(1.0, 60, 1.0 + dth, 60, R0);
    chk('F2 cylinder turnCoarse (=2*2^-6*Larc/R0)', r.turnCoarse, 2 * Math.pow(2, -6) * dth, 1e-6, 'rad');
    chk('F2 cylinder turnFine   (=2*2^-14*Larc/R0)', r.turnFine, 2 * Math.pow(2, -14) * dth, 1e-8, 'rad');
    chk('F2 cylinder ladder ratio (smooth => 2^-8)', r.ratio, Math.pow(2, -8), 1e-6, '');
  }
  // F2b — a NARROW SYMMETRIC SMOOTH BUMP. This is the configuration that makes the shipped
  // `locateTurnAdaptive` return 0.0000 deg for a 90-deg turn. It is recorded, not asserted: the
  // coarse scan can bracket the wrong interval for a smooth feature narrower than L/scan. That
  // cannot happen to a C0 crease, whose normal jump is scale-free — which is the only class here.
  {
    const rB = (_th: number, z: number): number => R0 + 2 * Math.exp(-((z - 60) * (z - 60)) / 2);
    const P2 = makeProbe(rB, HH);
    const wide = P2(1.0, 40, 1.0, 80, R0);       // feature 40x narrower than the segment
    const tight = P2(1.0, 58, 1.0, 62, R0);      // segment scaled to the feature
    log(`     [note] F2b narrow smooth bump: wide probe turnFine ${(wide.turnFine * RAD).toPrecision(4)} deg ratio ${wide.ratio.toExponential(2)}; tight probe turnFine ${(tight.turnFine * RAD).toPrecision(4)} deg ratio ${tight.ratio.toExponential(2)}`);
    const p2 = tight.ratio < 0.02;
    if (!p2) ok = false;
    log(`  ${p2 ? 'PASS' : '*** FAIL ***'}  F2b tight probe on a SMOOTH feature: ratio ${tight.ratio.toExponential(3)} < 0.02 (=> classed smooth, not crease)`);
    const lt = locateTurnAdaptive(rB, HH, 1.0, 58, 1.0, 62, R0, 24);
    log(`     [xcheck] orientRuler.locateTurnAdaptive on the tight probe returns ${(lt.turn * RAD).toPrecision(6)} deg (walks to a flat end on the symmetric tie)`);
  }
  // F3 — CREASE ALONG vs ACROSS the probe. Both halves asserted; one alone is vacuous.
  {
    const a = 0.5; const th0 = 1.0;
    const rT = (th: number, _z: number): number => R0 + a * R0 * Math.abs(dThRaw(th0, th));
    const P = makeProbe(rT, HH);
    const along = P(th0, 40, th0, 80, R0);
    chk('F3 along-crease turnFine', along.turnFine * RAD, 0, 0.02, 'deg');
    const acr = P(th0 - 0.02, 60, th0 + 0.02, 60, R0);
    chk('F3 across-crease dihedral', acr.turnFine * RAD, 2 * Math.atan(a) * RAD, 0.01, 'deg');
    chk('F3 across-crease theta', th0 - 0.02 + 0.04 * acr.s, th0, 1e-6, 'rad');
  }
  // F4 — WEAK crease (dihedral 1.146 deg): "no crease found" must not just mean "no BIG crease".
  {
    const a = 0.01; const z0 = 61.3;
    const rW = (_th: number, z: number): number => R0 + a * Math.abs(z - z0);
    const P = makeProbe(rW, HH);
    const r = P(1.0, 40, 1.0, 80, R0);
    chk('F4 weak     dihedral', r.turnFine * RAD, 2 * Math.atan(a) * RAD, 0.005, 'deg');
    chk('F4 weak     ladder ratio', r.ratio, 1, 0.02, '');
  }
  // F5 — OBLIQUE crossing. The dihedral is a property of the SURFACE, not of the probe direction:
  // two segments crossing the SAME crease at very different angles must return the SAME number.
  // This is the test that the h = d/32 window rule survives a shallow crossing.
  {
    const a = 0.3; const z0 = 60; const th0 = 1.0; const m = 1.0;
    const rO = (th: number, z: number): number => R0 + a * Math.abs((z - z0) - m * R0 * dThRaw(th0, th));
    const P = makeProbe(rO, HH);
    const p45 = P(th0, 50, th0, 70, R0);              // vertical probe, crease at 45 deg to it
    const pPerp = P(th0 - 0.005, 60 + 0.005 * R0, th0 + 0.005, 60 - 0.005 * R0, R0); // ~perpendicular
    const shallow = P(th0 - 0.02, 59.0, th0 + 0.02, 61.0, R0);   // ~8 deg crossing
    chk('F5 oblique  45deg vs perp', p45.turnFine * RAD, pPerp.turnFine * RAD, 0.02, 'deg');
    chk('F5 oblique  shallow vs perp', shallow.turnFine * RAD, pPerp.turnFine * RAD, 0.05, 'deg');
    const p = pPerp.turnFine * RAD > 5;
    if (!p) ok = false;
    log(`  ${p ? 'PASS' : '*** FAIL ***'}  F5 oblique  NON-VACUITY dihedral ${(pPerp.turnFine * RAD).toPrecision(4)} deg > 5`);
  }
  log(ok ? '═══ SELF-TEST PASSED ═══\n' : '═══ *** SELF-TEST FAILED — DO NOT READ THE CENSUS *** ═══\n');
  return ok;
}

if (process.env.PF_S99_SELFTEST !== '0') {
  const ok = selfTest();
  if (!ok) { process.exit(1); }
}
if (process.env.PF_S99_SELFTEST_ONLY === '1') { process.exit(0); }

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE CENSUS
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsCentral = fdNormalsCentral(rA, H, 2e-4, 2e-4);
const probe = makeProbe(rA, H);

// the DRIVER's own constants (research/bridge/_strataConformBisectS34.test.ts defaults)
const PRED: SweepPredConst = {
  esN: Math.round(envF('PF_CB_ESN', 8)),
  refHs: envF('PF_CB_REF_HS', 0.03),
  refNmax: Math.round(envF('PF_CB_REF_NMAX', 64)),
  kinkScan: Math.round(envF('PF_CB_KINK_SCAN', 16)),
  kinkHalvings: Math.round(envF('PF_CB_KINK_HALVINGS', 24)),
  kinkRatio: envF('PF_CB_KINK_RATIO', 0.15),
  jumpRatio: envF('PF_CB_JUMP_RATIO', 0.62),
  snap: true,
  confMm: envF('PF_CB_CONF_UM', 0.6) / 1000,
};

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log('===== S99 CREASE CENSUS =====');
log(`style ${STYLE}  tag ${TAG}  STL ${STL}`);
log(`mesh ${nTri} facets ${el()}`);
log(`covering k=${K} inset=${INSET}  chord bar ${BAR_UM} um  turn bar ${TURN_DEG} deg  eps ${EPS}  scan ${SCAN} iters ${ITERS}`);
log(`driver PRED: kinkScan ${PRED.kinkScan} halvings ${PRED.kinkHalvings} kinkRatio ${PRED.kinkRatio} jumpRatio ${PRED.jumpRatio} confMm ${PRED.confMm}`);

function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}
const idx = goldenIdx(nTri, NSAMP);
const NS = idx.length;
log(`sample ${NS} facets (${((100 * NS) / nTri).toFixed(3)}%), golden stride`);

interface Row {
  area: number; diam: number; minAng: number;
  normDeg: number; tangUm: number; spreadDeg: number; kinkDegH: number;
  turnDeg: number; ratio: number; nCross: number; missUm: number;
  /** min(t, 1-t) of the crossing on ITS edge — the quantity SNAP_ALPHA (0.12) is compared against */
  tMin: number;
  /** length of the crossed edge, mm */
  eLenMm: number;
  drvFound: number; drvJump: number; drvRatio: number; drvTErr: number; drvConf: number; drvSagUm: number;
  /** the driver's OWN ACCEPT quantity on this facet: `sagAdaptiveRaw`, um. Only for crossed facets. */
  planeSagUm: number;
  th: number; z: number;
}
const rows: Row[] = [];
// ── the two-way CONFUSION MATRIX between the driver's radius-based locator and the Gauss-map one,
//    over EVERY sampled edge (not only the ones one of them flagged). ──
let cmBoth = 0; let cmDrvOnly = 0; let cmMineOnly = 0; let cmNeither = 0; let cmEdges = 0;
let cmDrvOnlyTurnSmall = 0;   // driver fired, my ladder AT ITS OWN t reads < 1 deg => driver false positive
let cmDrvOnlyTurnBig = 0;     // driver fired, my ladder AT ITS OWN t reads > 1 deg => outside my EPS inset
let cmMasked = 0;
/**
 * For every "driver fired, real turn, but my EPS-inset excluded it" edge: the distance from the
 * crossing to the nearest ENDPOINT in um. THIS IS THE ADJUDICATION THAT DECIDES THE CENSUS.
 * < CONF_MM (0.6 um)  => the vertex IS ON the crease: CONFORMED, correctly not counted as a span.
 * >> CONF_MM          => a genuinely thin SPANNING band my inset threw away: the census under-counts.
 */
const drvOnlyBigDistUm: number[] = [];
/**
 * THE SEPARATION TEST. `locateKinkRaw`'s two-scale ratio `small/big` is 1/4 at a true C0 kink and
 * 1/16 at a smooth curvature peak; the driver's threshold is `kinkRatio = 0.15`, i.e. it sits
 * BETWEEN them but much closer to the smooth value. If the false positives cluster below ~0.20 and
 * the true crossings at ~0.25, one constant separates them and a conformance-aware accept rule
 * becomes affordable. These two arrays measure exactly that.
 */
const fpRatio: number[] = [];   // driver fired, the two-sided turn at ITS OWN t is < bar
const tpRatio: number[] = [];   // driver fired, the two-sided turn at ITS OWN t is > bar
interface CutRow {
  nCross: number; kids: number; area: number;
  parentNorm: number; parentTang: number; kidNorm: number; kidTang: number;
  kidMinAng: number; parentMinAng: number; areaRatio: number; turnDeg: number;
  moveNorm: number; moveTang: number; moveMinAng: number; moveDispUm: number; moveStillCrossed: number;
}
const cutRows: CutRow[] = [];
const CUT_CAP = Math.round(envF('PF_S99_CUT_CAP', 4000));

const scratch = new Float64Array(12);
const scratch2 = new Float64Array(12);
const nsKink = fdNormals(rA, H, 2e-4, 2e-4);
const sagArg = makeSagArgmax();
const sagM: SagMesh = {
  ta: [0], tb: [1], tc: [2],
  vth: new Float64Array(3), vz: new Float64Array(3), vx: new Float64Array(3), vy: new Float64Array(3),
};
let done = 0;

for (let q = 0; q < NS; q += 1) {
  const t = idx[q]; const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
  const nx0 = uy * vz - uz * vy; const ny0 = uz * vx - ux * vz; const nz0 = ux * vy - uy * vx;
  const area = 0.5 * Math.hypot(nx0, ny0, nz0);
  if (!(area > 0)) continue;
  const eA = Math.hypot(bx - cx, by - cy, bz - cz);
  const eB = Math.hypot(ax - cx, ay - cy, az - cz);
  const eC = Math.hypot(ax - bx, ay - by, az - bz);
  const diam = Math.max(eA, eB, eC);
  const s1 = Math.min(eA, eB, eC); const s3 = diam; const s2 = eA + eB + eC - s1 - s3;
  const minAng = Math.acos(Math.max(-1, Math.min(1, (s2 * s2 + s3 * s3 - s1 * s1) / Math.max(1e-300, 2 * s2 * s3)))) * RAD;

  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;

  const or = orientOfFacet(
    nsCentral, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
    { k: K, inset: INSET, orient: 'outward', scratch, barRad: (5 * Math.PI) / 180 },
  );
  // S93's OWN crease test, reproduced properly: `kinkRad` is only non-trivial when the sampler emits
  // the FOUR one-sided combinations, i.e. `fdNormals` — with `fdNormalsCentral` (1 candidate) it is
  // identically zero and the column is vacuous. Second call, same lattice, kinkRad only.
  const orK = orientOfFacet(
    nsKink, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
    { k: K, inset: INSET, orient: 'outward', scratch: scratch2, barRad: (5 * Math.PI) / 180 },
  );

  const E: Array<[number, number, number, number, number, number, number, number]> = [
    [thA, az, thB, bz, ax, ay, bx, by],
    [thB, bz, thC, cz, bx, by, cx, cy],
    [thC, cz, thA, az, cx, cy, ax, ay],
  ];
  let bestTurn = 0; let bestRatio = 0; let bestMiss = NaN; let nCross = 0; let bestTMin = NaN; let bestELen = NaN;
  let bDrvFound = 0; let bDrvJump = 0; let bDrvRatio = 0; let bDrvConf = 0; let bDrvSag = 0; let bDrvTErr = NaN;
  let bTh = 0; let bZ = 0;
  for (let e = 0; e < 3; e += 1) {
    const [t0, z0, t1, z1, x0, y0, x1, y1] = E[e];
    // INSET the endpoints: a vertex ON a crease must not read as a crossing (F3's contract).
    const p0 = EPS; const p1 = 1 - EPS;
    const at0 = t0 + (t1 - t0) * p0; const az0 = z0 + (z1 - z0) * p0;
    const at1 = t0 + (t1 - t0) * p1; const az1 = z0 + (z1 - z0) * p1;
    const res = probe(at0, az0, at1, az1, rRef);
    const turnDeg = res.turnFine * RAD;
    const tt = p0 + (p1 - p0) * res.s;
    // ── the DRIVER's own locator on the SAME (full, un-inset) edge — run on EVERY edge so the
    //    confusion matrix is two-way and neither detector gets to pick its own test set. ──
    const dth = dThRaw(t0, t1);
    const kk = locateKinkRaw(rA, t0, z0, t0 + dth, z1, PRED);
    const mine = turnDeg > TURN_DEG;
    const drv = kk !== null;
    cmEdges += 1;
    if (mine && drv) { cmBoth += 1; tpRatio.push(kk.ratio); }
    else if (drv) {
      cmDrvOnly += 1;
      // adjudicate: evaluate MY ladder AT THE DRIVER'S OWN t. Small => the driver false-positived on a
      // smooth curvature peak; big => my coarse scan missed it.
      const kt = Math.min(0.999, Math.max(0.001, kk.t));
      const d0 = Math.min(0.02, 0.45 * Math.min(kt, 1 - kt));
      const seg = probe(t0 + (t1 - t0) * (kt - d0), z0 + (z1 - z0) * (kt - d0),
        t0 + (t1 - t0) * (kt + d0), z0 + (z1 - z0) * (kt + d0), rRef);
      if (seg.turnFine * RAD > TURN_DEG) {
        cmDrvOnlyTurnBig += 1; tpRatio.push(kk.ratio);
        drvOnlyBigDistUm.push(Math.min(kk.t, 1 - kk.t) * Math.hypot(x1 - x0, y1 - y0, z1 - z0) * 1000);
      } else { cmDrvOnlyTurnSmall += 1; fpRatio.push(kk.ratio); }
    } else if (mine) cmMineOnly += 1;
    else cmNeither += 1;
    if (!mine) continue;
    nCross += 1;
    if (res.masked) cmMasked += 1;
    const cth = t0 + (t1 - t0) * tt; const cz2 = z0 + (z1 - z0) * tt;
    const cr = rA(cth, cz2);
    const cxp = cr * Math.cos(cth); const cyp = cr * Math.sin(cth);
    const miss = Math.min(
      Math.hypot(cxp - ax, cyp - ay, cz2 - az),
      Math.hypot(cxp - bx, cyp - by, cz2 - bz),
      Math.hypot(cxp - cx, cyp - cy, cz2 - cz),
    );
    if (turnDeg > bestTurn) {
      bestTurn = turnDeg; bestRatio = res.ratio; bestMiss = miss; bTh = cth; bZ = cz2;
      bestTMin = Math.min(tt, 1 - tt);
      bestELen = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
      bDrvFound = kk === null ? 0 : 1;
      bDrvJump = kk !== null && kk.jump ? 1 : 0;
      bDrvRatio = kk === null ? 0 : kk.ratio;
      bDrvTErr = kk === null ? NaN : Math.abs(kk.t - tt);
      const ev = edgeVerdictRaw(rA, t0, z0, x0, y0, t1, z1, x1, y1, PRED);
      bDrvConf = ev.conformed ? 1 : 0;
      bDrvSag = ev.sag * 1000;
    }
  }
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // THE CUT EXPERIMENT — does an edge ON the crease actually remove the defect, and what does it
  // cost? A crease entering a facet through one edge and leaving through another is cut by the
  // CHORD PQ between the two crossings, lifted onto the surface with the mesher's own `addV`
  // contract (r = rA(theta,z)). The 1->3 cut costs +2 triangles and, if the crease is straight,
  // makes PQ lie exactly ON it. Both children are then re-measured with the SAME ruler.
  // A ONE-crossing facet (crease enters and terminates, or leaves through a vertex) gets the 1->2
  // split at P — which places a VERTEX on the crease but NOT an edge, and is measured separately
  // BECAUSE THAT IS THE DISTINCTION THE BRIEF IS ABOUT.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (nCross >= 1 && cutRows.length < CUT_CAP) {
    const V: number[][] = [[ax, ay, az, thA], [bx, by, bz, thB], [cx, cy, cz, thC]];
    // recover the crossing points per edge (cheap: re-probe only the flagged edges)
    const pts: Array<{ e: number; x: number; y: number; z: number; th: number; turn: number }> = [];
    for (let e = 0; e < 3; e += 1) {
      const [t0, z0, t1, z1] = E[e];
      const p0 = EPS; const p1 = 1 - EPS;
      const res = probe(t0 + (t1 - t0) * p0, z0 + (z1 - z0) * p0, t0 + (t1 - t0) * p1, z0 + (z1 - z0) * p1, rRef);
      if (res.turnFine * RAD <= TURN_DEG) continue;
      const tt = p0 + (p1 - p0) * res.s;
      const cth = t0 + (t1 - t0) * tt; const zz = z0 + (z1 - z0) * tt;
      const rr = rA(cth, zz);
      pts.push({ e, x: rr * Math.cos(cth), y: rr * Math.sin(cth), z: zz, th: cth, turn: res.turnFine * RAD });
    }
    const kids: number[][][] = [];
    if (pts.length >= 2) {
      pts.sort((p, q2) => q2.turn - p.turn);
      const P = pts[0]; const Q = pts[1];
      // edge e joins vertices (e, (e+1)%3). The two cut edges share exactly one vertex.
      const eP = [P.e, (P.e + 1) % 3]; const eQ = [Q.e, (Q.e + 1) % 3];
      const shared = eP.find((v) => eQ.includes(v));
      if (shared !== undefined) {
        const oP = eP.find((v) => v !== shared) as number;
        const oQ = eQ.find((v) => v !== shared) as number;
        const S = V[shared]; const OP = V[oP]; const OQ = V[oQ];
        const Pv = [P.x, P.y, P.z, P.th]; const Qv = [Q.x, Q.y, Q.z, Q.th];
        kids.push([S, Pv, Qv]);        // the corner triangle, cut off by the crease chord
        kids.push([Pv, OP, OQ]);       // the quad, split
        kids.push([Pv, OQ, Qv]);
      }
    } else if (pts.length === 1) {
      const P = pts[0];
      const eP = [P.e, (P.e + 1) % 3];
      const opp = [0, 1, 2].find((v) => !eP.includes(v)) as number;
      const Pv = [P.x, P.y, P.z, P.th];
      kids.push([V[eP[0]], Pv, V[opp]]);
      kids.push([Pv, V[eP[1]], V[opp]]);
    }
    if (kids.length > 0) {
      let maxKidNorm = 0; let maxKidTang = 0; let minKidAng = 180; let kidArea = 0;
      for (const kd of kids) {
        const [K0, K1, K2] = kd;
        const kA = 0.5 * Math.hypot(
          (K1[1] - K0[1]) * (K2[2] - K0[2]) - (K1[2] - K0[2]) * (K2[1] - K0[1]),
          (K1[2] - K0[2]) * (K2[0] - K0[0]) - (K1[0] - K0[0]) * (K2[2] - K0[2]),
          (K1[0] - K0[0]) * (K2[1] - K0[1]) - (K1[1] - K0[1]) * (K2[0] - K0[0]),
        );
        if (!(kA > 0)) continue;
        kidArea += kA;
        const t0 = Math.atan2(K0[1], K0[0]);
        const t1 = t0 + dThRaw(t0, Math.atan2(K1[1], K1[0]));
        const t2 = t0 + dThRaw(t0, Math.atan2(K2[1], K2[0]));
        const ko = orientOfFacet(
          nsCentral, K0[0], K0[1], K0[2], K1[0], K1[1], K1[2], K2[0], K2[1], K2[2], t0, t1, t2,
          { k: K, inset: INSET, orient: 'outward', scratch, barRad: (5 * Math.PI) / 180 },
        );
        if (ko.normDeg > maxKidNorm) maxKidNorm = ko.normDeg;
        if (ko.tangMm * 1000 > maxKidTang) maxKidTang = ko.tangMm * 1000;
        const g0 = Math.hypot(K1[0] - K2[0], K1[1] - K2[1], K1[2] - K2[2]);
        const g1 = Math.hypot(K0[0] - K2[0], K0[1] - K2[1], K0[2] - K2[2]);
        const g2 = Math.hypot(K0[0] - K1[0], K0[1] - K1[1], K0[2] - K1[2]);
        const u1 = Math.min(g0, g1, g2); const u3 = Math.max(g0, g1, g2); const u2 = g0 + g1 + g2 - u1 - u3;
        const ang = Math.acos(Math.max(-1, Math.min(1, (u2 * u2 + u3 * u3 - u1 * u1) / Math.max(1e-300, 2 * u2 * u3)))) * RAD;
        if (ang < minKidAng) minKidAng = ang;
      }
      cutRows.push({
        nCross, kids: kids.length, area, parentNorm: or.normDeg, parentTang: or.tangMm * 1000,
        kidNorm: maxKidNorm, kidTang: maxKidTang, kidMinAng: minKidAng, parentMinAng: minAng,
        areaRatio: kidArea / Math.max(1e-300, area), turnDeg: bestTurn,
        moveNorm: NaN, moveTang: NaN, moveMinAng: NaN, moveDispUm: NaN, moveStillCrossed: NaN,
      });
      // ─────────────────────────────────────────────────────────────────────────────────────────
      // THE MOVE ARM — §4.3 / PF_CB_MOVE43H, which is BUILT and default OFF. Instead of adding a
      // vertex, MOVE the nearest endpoint of the max-turn crossing ONTO the crossing. Zero extra
      // triangles, no sliver by construction (the vertex travels along an existing edge direction).
      // Measured here on the facet ITSELF; the collateral on the moved vertex's STAR is NOT
      // measured and the displacement is reported so the size of that risk is visible.
      // ─────────────────────────────────────────────────────────────────────────────────────────
      {
        const P = pts[0];
        const vA = P.e; const vB = (P.e + 1) % 3;
        const dA = Math.hypot(P.x - V[vA][0], P.y - V[vA][1], P.z - V[vA][2]);
        const dB = Math.hypot(P.x - V[vB][0], P.y - V[vB][1], P.z - V[vB][2]);
        const mv = dA <= dB ? vA : vB;
        const disp = Math.min(dA, dB);
        const W: number[][] = [V[0].slice(), V[1].slice(), V[2].slice()];
        W[mv] = [P.x, P.y, P.z, P.th];
        const t0 = Math.atan2(W[0][1], W[0][0]);
        const t1 = t0 + dThRaw(t0, Math.atan2(W[1][1], W[1][0]));
        const t2 = t0 + dThRaw(t0, Math.atan2(W[2][1], W[2][0]));
        const mo = orientOfFacet(
          nsCentral, W[0][0], W[0][1], W[0][2], W[1][0], W[1][1], W[1][2], W[2][0], W[2][1], W[2][2], t0, t1, t2,
          { k: K, inset: INSET, orient: 'outward', scratch, barRad: (5 * Math.PI) / 180 },
        );
        const g0 = Math.hypot(W[1][0] - W[2][0], W[1][1] - W[2][1], W[1][2] - W[2][2]);
        const g1 = Math.hypot(W[0][0] - W[2][0], W[0][1] - W[2][1], W[0][2] - W[2][2]);
        const g2 = Math.hypot(W[0][0] - W[1][0], W[0][1] - W[1][1], W[0][2] - W[1][2]);
        const u1 = Math.min(g0, g1, g2); const u3 = Math.max(g0, g1, g2); const u2 = g0 + g1 + g2 - u1 - u3;
        const mang = Math.acos(Math.max(-1, Math.min(1, (u2 * u2 + u3 * u3 - u1 * u1) / Math.max(1e-300, 2 * u2 * u3)))) * RAD;
        // does a crease STILL cross the moved facet?
        const WT = [t0, t1, t2];
        let still = 0;
        for (let e = 0; e < 3; e += 1) {
          const i0 = e; const i1 = (e + 1) % 3;
          const p0b = EPS; const p1b = 1 - EPS;
          const rr2 = (Math.hypot(W[0][0], W[0][1]) + Math.hypot(W[1][0], W[1][1]) + Math.hypot(W[2][0], W[2][1])) / 3;
          const res2 = probe(
            WT[i0] + (WT[i1] - WT[i0]) * p0b, W[i0][2] + (W[i1][2] - W[i0][2]) * p0b,
            WT[i0] + (WT[i1] - WT[i0]) * p1b, W[i0][2] + (W[i1][2] - W[i0][2]) * p1b, rr2,
          );
          if (res2.turnFine * RAD > TURN_DEG) still += 1;
        }
        const cr2 = cutRows[cutRows.length - 1];
        cr2.moveNorm = mo.normDeg; cr2.moveTang = mo.tangMm * 1000;
        cr2.moveMinAng = mang; cr2.moveDispUm = disp * 1000; cr2.moveStillCrossed = still;
      }
    }
  }

  // the driver's OWN ACCEPT quantity, on the crossed facets only (it is the expensive one)
  let planeSagUm = NaN;
  if (nCross > 0) {
    (sagM.vth as Float64Array)[0] = thA; (sagM.vth as Float64Array)[1] = thB; (sagM.vth as Float64Array)[2] = thC;
    (sagM.vz as Float64Array)[0] = az; (sagM.vz as Float64Array)[1] = bz; (sagM.vz as Float64Array)[2] = cz;
    (sagM.vx as Float64Array)[0] = ax; (sagM.vx as Float64Array)[1] = bx; (sagM.vx as Float64Array)[2] = cx;
    (sagM.vy as Float64Array)[0] = ay; (sagM.vy as Float64Array)[1] = by; (sagM.vy as Float64Array)[2] = cy;
    planeSagUm = sagAdaptiveRaw(rA, sagM, 0, PRED.refHs, 12, PRED.refNmax, sagArg) * 1000;
  }

  rows.push({
    area, diam, minAng,
    normDeg: or.normDeg, tangUm: or.tangMm * 1000, spreadDeg: or.spreadRad * RAD, kinkDegH: orK.kinkRad * RAD,
    turnDeg: bestTurn, ratio: bestRatio, nCross, missUm: bestMiss * 1000, tMin: bestTMin, eLenMm: bestELen,
    drvFound: bDrvFound, drvJump: bDrvJump, drvRatio: bDrvRatio, drvTErr: bDrvTErr,
    drvConf: bDrvConf, drvSagUm: bDrvSag, planeSagUm, th: bTh, z: bZ,
  });
  done += 1;
  if (done % 5000 === 0) log(`  ${done}/${NS} ${el()}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REPORT
// ═══════════════════════════════════════════════════════════════════════════════════════════════
const N = rows.length;
const totArea = rows.reduce((s, r) => s + r.area, 0);
const isOver = (r: Row): boolean => r.tangUm > BAR_UM;
const over = rows.filter(isOver);
const overArea = over.reduce((s, r) => s + r.area, 0);
const sumA = (s: Row[]): number => s.reduce((a, r) => a + r.area, 0);
const pctA = (sub: Row[], base: number): string => `${((100 * sumA(sub)) / Math.max(1e-300, base)).toFixed(3)}%`;
const pctC = (sub: Row[], base: number): string => `${((100 * sub.length) / Math.max(1, base)).toFixed(3)}%`;
function wq(sub: Row[], f: (r: Row) => number, ps: number[]): string {
  if (sub.length === 0) return 'n/a';
  const a = sub.map((r) => ({ v: f(r), w: r.area })).filter((x) => Number.isFinite(x.v)).sort((x, y) => x.v - y.v);
  if (a.length === 0) return 'n/a';
  const tot = a.reduce((s, x) => s + x.w, 0);
  const out: string[] = [];
  for (const p of ps) { let acc = 0; let val = a[a.length - 1].v; for (const x of a) { acc += x.w; if (acc >= p * tot) { val = x.v; break; } } out.push(val.toPrecision(4)); }
  return out.join('  ');
}

const L: string[] = [];
const say = (s: string): void => { L.push(s); log(s); };
say('');
say('══════════════════════════════════════════════════════════════════════════════════════════');
say(`  S99 CREASE CENSUS — ${STYLE} / ${TAG}   ${N} facets sampled of ${nTri}`);
say(`  over-bar (2 sin(theta/2)*diam > ${BAR_UM} um):  COUNT ${over.length}/${N} = ${pctC(over, N)}   AREA ${pctA(over, totArea)} of sampled area`);
say('══════════════════════════════════════════════════════════════════════════════════════════');
say('');
say('── H-C1  HOW BIG IS THE CREASE CLASS, MEASURED h-FREE? ──');
say('   S93 used `kinkDeg > 1` at a FIXED h = 2e-4 mm. Both are shown on the SAME facets.');
for (const bar of [1, 5, 15, 45]) {
  const cr = rows.filter((r) => r.turnDeg > bar);
  const cro = over.filter((r) => r.turnDeg > bar);
  say(`   turn > ${String(bar).padStart(2)} deg   ALL: cnt ${pctC(cr, N).padStart(8)} area ${pctA(cr, totArea).padStart(8)}    OVER-BAR: cnt ${pctC(cro, over.length).padStart(8)} defAREA ${pctA(cro, overArea).padStart(8)}`);
}
{
  const s93 = rows.filter((r) => r.kinkDegH > 1);
  const s93o = over.filter((r) => r.kinkDegH > 1);
  say(`   S93 kinkDeg>1 (h=2e-4)  ALL: cnt ${pctC(s93, N).padStart(8)} area ${pctA(s93, totArea).padStart(8)}    OVER-BAR: cnt ${pctC(s93o, over.length).padStart(8)} defAREA ${pctA(s93o, overArea).padStart(8)}`);
  const cro = over.filter((r) => r.turnDeg > 1);
  const f = sumA(s93o) > 0 ? `${(sumA(cro) / sumA(s93o)).toFixed(2)}x` : 'n/a (h-dependent detector fired on ZERO area)';
  say(`   *** RATIO (over-bar defAREA, h-free / h-dependent) = ${f} ***`);
  const bothC = rows.filter((r) => r.turnDeg > 1 && r.kinkDegH > 1);
  say(`   agreement: h-free AND kinkDeg>1 : ${bothC.length}   h-free only: ${rows.filter((r) => r.turnDeg > 1 && r.kinkDegH <= 1).length}   kinkDeg>1 only: ${rows.filter((r) => r.turnDeg <= 1 && r.kinkDegH > 1).length}`);
  say(`   ⇒ RECALL of the h-dependent detector on genuine crossings: ${((100 * bothC.length) / Math.max(1, rows.filter((r) => r.turnDeg > 1).length)).toFixed(2)}%`);
  say(`   ⇒ PRECISION of the h-dependent detector: ${((100 * bothC.length) / Math.max(1, rows.filter((r) => r.kinkDegH > 1).length)).toFixed(2)}%`);
}
say('');
say('── TWO-WAY CONFUSION MATRIX over EVERY sampled edge (neither detector picks its own test set) ──');
{
  say(`   edges probed ${cmEdges}`);
  say(`   BOTH fire                                    : ${cmBoth} (${((100 * cmBoth) / Math.max(1, cmEdges)).toFixed(4)}%)`);
  say(`   DRIVER only (locateKinkRaw != null, turn<bar): ${cmDrvOnly} (${((100 * cmDrvOnly) / Math.max(1, cmEdges)).toFixed(4)}%)`);
  say(`      adjudicated at the DRIVER's OWN t: turn < ${TURN_DEG} deg (driver FALSE POSITIVE) ${cmDrvOnlyTurnSmall}   turn > bar (outside my EPS inset) ${cmDrvOnlyTurnBig}`);
  say(`   GAUSS-MAP only (driver silent)               : ${cmMineOnly} (${((100 * cmMineOnly) / Math.max(1, cmEdges)).toFixed(4)}%)`);
  say(`   neither                                      : ${cmNeither}`);
  say(`   crossings won by the coarse-scan RUNNER-UP bracket (masking check): ${cmMasked}`);
  say('');
  say('   ── ADJUDICATION of the "outside my EPS inset" cell: distance from the crossing to the nearest');
  say('      ENDPOINT, um. < CONF_MM (0.6 um) => THE VERTEX IS ON THE CREASE (conformed, correctly not a');
  say('      span). >> 0.6 um => a thin spanning band the inset threw away (the census under-counts). ──');
  {
    const a = drvOnlyBigDistUm.slice().sort((x, y) => x - y);
    const qq = (p: number): string => (a.length === 0 ? 'n/a' : a[Math.min(a.length - 1, Math.round(p * (a.length - 1)))].toPrecision(4));
    say(`   n ${a.length}   p05/25/50/75/95/max : ${qq(0.05)}  ${qq(0.25)}  ${qq(0.5)}  ${qq(0.75)}  ${qq(0.95)}  ${qq(1)}`);
    for (const b of [0.6, 5, 50]) {
      say(`   share < ${String(b).padStart(4)} um : ${((100 * a.filter((x) => x < b).length) / Math.max(1, a.length)).toFixed(2)}%`);
    }
  }
  say('');
  say('   ── THE SEPARATION TEST. `locateKinkRaw`\'s two-scale ratio small/big is 1/4 at a true C0 kink and');
  say(`      1/16 at a smooth curvature peak. The driver's threshold is kinkRatio = ${PRED.kinkRatio}. If the`);
  say('      FALSE POSITIVES sit below the TRUE ones, ONE CONSTANT makes a conformance-aware accept rule');
  say('      affordable; if they overlap, it cannot be keyed on this detector. ──');
  {
    const qs = (arr: number[], p: number): string => (arr.length === 0 ? 'n/a' : arr.slice().sort((x, y) => x - y)[Math.min(arr.length - 1, Math.round(p * (arr.length - 1)))].toPrecision(4));
    say(`   FALSE POSITIVES (n ${fpRatio.length})  ratio p05/25/50/75/95/max : ${qs(fpRatio, 0.05)}  ${qs(fpRatio, 0.25)}  ${qs(fpRatio, 0.5)}  ${qs(fpRatio, 0.75)}  ${qs(fpRatio, 0.95)}  ${qs(fpRatio, 1)}`);
    say(`   TRUE  CROSSINGS (n ${tpRatio.length})  ratio p00/05/25/50/75/95 : ${qs(tpRatio, 0)}  ${qs(tpRatio, 0.05)}  ${qs(tpRatio, 0.25)}  ${qs(tpRatio, 0.5)}  ${qs(tpRatio, 0.75)}  ${qs(tpRatio, 0.95)}`);
    for (const thr of [0.15, 0.18, 0.20, 0.22, 0.24]) {
      const kept = tpRatio.filter((x) => x >= thr).length;
      const fps = fpRatio.filter((x) => x >= thr).length;
      say(`     threshold ${thr.toFixed(2)} : TRUE kept ${((100 * kept) / Math.max(1, tpRatio.length)).toFixed(2)}%   FALSE surviving ${((100 * fps) / Math.max(1, fpRatio.length)).toFixed(2)}%   (edges demanded ${kept + fps} of ${cmEdges} = ${((100 * (kept + fps)) / Math.max(1, cmEdges)).toFixed(3)}%)`);
    }
  }
}
say('');
say('── H-C4  IS IT A GENUINE 1-D C0 LOCUS, OR SMOOTH HIGH CURVATURE?  (the (d) test) ──');
{
  const cr = rows.filter((r) => r.turnDeg > TURN_DEG);
  say(`   ladder ratio turn(L*2^-14)/turn(L*2^-6) on ${cr.length} crossings, area-wt p05/25/50/75/95: ${wq(cr, (r) => r.ratio, [0.05, 0.25, 0.5, 0.75, 0.95])}`);
  const inv = cr.filter((r) => r.ratio > 0.8);
  const van = cr.filter((r) => r.ratio < 0.05);
  say(`   ratio > 0.8 (INVARIANT under a 256x shrink => genuine C0): cnt ${pctC(inv, cr.length)}  area ${pctA(inv, sumA(cr))}`);
  say(`   ratio < 0.05 (VANISHES => smooth curvature peak)         : cnt ${pctC(van, cr.length)}  area ${pctA(van, sumA(cr))}`);
}
say('');
say("── H-C2  DETECTION: does the DRIVER's OWN `locateKinkRaw` find these crossings? ──");
{
  const cr = rows.filter((r) => r.turnDeg > TURN_DEG);
  const crA = sumA(cr);
  const found = cr.filter((r) => r.drvFound === 1);
  const jump = cr.filter((r) => r.drvJump === 1);
  const miss = cr.filter((r) => r.drvFound === 0);
  say(`   crossings (turnFine > ${TURN_DEG} deg): ${cr.length}`);
  say(`     driver FIRES  (kink != null)  : cnt ${pctC(found, cr.length).padStart(8)}  area ${pctA(found, crA).padStart(8)}`);
  say(`     of which JUMP (=> CURTAIN,    : cnt ${pctC(jump, cr.length).padStart(8)}  area ${pctA(jump, crA).padStart(8)}`);
  say("        triangleNeed returns 'none', never snapped)");
  say(`     driver MISSES (kink == null)  : cnt ${pctC(miss, cr.length).padStart(8)}  area ${pctA(miss, crA).padStart(8)}`);
  say(`   turn of the MISSED crossings, area-wt p05/25/50/75/95 (deg): ${wq(miss, (r) => r.turnDeg, [0.05, 0.25, 0.5, 0.75, 0.95])}`);
  say(`   turn of the FOUND  crossings, area-wt p05/25/50/75/95 (deg): ${wq(found, (r) => r.turnDeg, [0.05, 0.25, 0.5, 0.75, 0.95])}`);
  say(`   driver ratio on FOUND, area-wt p05/50/95: ${wq(found, (r) => r.drvRatio, [0.05, 0.5, 0.95])}   (kinkRatio ${PRED.kinkRatio}, jumpRatio ${PRED.jumpRatio})`);
  say(`   |t_driver - t_true| on FOUND, area-wt p05/50/95 (edge fraction): ${wq(found, (r) => r.drvTErr, [0.05, 0.5, 0.95])}`);
  const agree = found.filter((r) => r.drvTErr < 0.02);
  say(`     driver located the SAME crossing (|dt| < 0.02): cnt ${pctC(agree, found.length)}  area ${pctA(agree, sumA(found))}`);
}
say('');
say('── H-C3  PLACEMENT: how far is the crossing from the nearest facet VERTEX? ──');
{
  const cr = rows.filter((r) => r.turnDeg > TURN_DEG);
  const crA = sumA(cr);
  say(`   miss distance (um), area-wt p05/25/50/75/95/max : ${wq(cr, (r) => r.missUm, [0.05, 0.25, 0.5, 0.75, 0.95, 1])}`);
  say(`   as a FRACTION of facet diam, area-wt p05/25/50/75/95: ${wq(cr, (r) => r.missUm / 1000 / Math.max(1e-9, r.diam), [0.05, 0.25, 0.5, 0.75, 0.95])}`);
  for (const b of [0.6, 10, 100]) {
    const near = cr.filter((r) => r.missUm < b);
    say(`   crossings within ${String(b).padStart(5)} um of a vertex : cnt ${pctC(near, cr.length).padStart(8)}  area ${pctA(near, crA).padStart(8)}`);
  }
  const conf = cr.filter((r) => r.drvConf === 1);
  say(`   driver's own \`conformed\` flag TRUE on them     : cnt ${pctC(conf, cr.length).padStart(8)}  area ${pctA(conf, crA).padStart(8)}`);
  say(`   facet diam of crossed facets, area-wt p05/50/95 (mm): ${wq(cr, (r) => r.diam, [0.05, 0.5, 0.95])}`);
  say('');
  say(`   *** THE SNAP_ALPHA TEST. min(t,1-t) of the crossing on ITS OWN EDGE. The driver snaps ONLY when`);
  say(`       SNAP_ALPHA=${envF('PF_CB_SNAP_ALPHA', 0.12)} < t < 1-SNAP_ALPHA; in-band it falls through to a midpoint split (or, with`);
  say('       PF_CB_MOVE43H=1, to a vertex MOVE — which was OFF in both committed meshes). ***');
  say(`   tMin, area-wt p05/25/50/75/95 : ${wq(cr, (r) => r.tMin, [0.05, 0.25, 0.5, 0.75, 0.95])}   (UNIFORM would be 0.05/0.25/0.50 of 0.5 => 0.025/0.125/0.25)`);
  const inBand = cr.filter((r) => r.tMin <= envF('PF_CB_SNAP_ALPHA', 0.12));
  say(`   IN the SNAP_ALPHA band (tMin <= ${envF('PF_CB_SNAP_ALPHA', 0.12)})           : cnt ${pctC(inBand, cr.length).padStart(8)}  area ${pctA(inBand, crA).padStart(8)}`);
  say(`   crossed EDGE length, area-wt p05/50/95 (mm): ${wq(cr, (r) => r.eLenMm, [0.05, 0.5, 0.95])}`);
  say('');
  say(`   *** THE ACCEPT TEST. The driver's OWN accept quantity \`sagAdaptiveRaw\` (INFINITE-PLANE, the`);
  say('       ranked+accepted number) on the crossed facets. A facet under acceptTol is never re-queued,');
  say('       so its crease crossing is never revisited whatever the locus machinery would have done. ***');
  say(`   planeSag (um), area-wt p05/25/50/75/95 : ${wq(cr, (r) => r.planeSagUm, [0.05, 0.25, 0.5, 0.75, 0.95])}`);
  for (const at of [3.5, 7, 10]) {
    const acc = cr.filter((r) => r.planeSagUm < at);
    say(`   ACCEPTED by the plane ruler at acceptTol ${String(at).padStart(4)} um : cnt ${pctC(acc, cr.length).padStart(8)}  area ${pctA(acc, crA).padStart(8)}`);
  }
  say(`   edge chord SAG (the DIRECTED rank key), area-wt p05/50/95 (um): ${wq(cr, (r) => r.drvSagUm, [0.05, 0.5, 0.95])}`);
  say('');
  say('   ── JOINT: which gate is each surviving crossing sitting behind? (acceptTol from the run.json) ──');
  const AT = envF('PF_S99_ACCEPT_UM', 3.5); const SA = envF('PF_CB_SNAP_ALPHA', 0.12);
  const g1 = cr.filter((r) => r.planeSagUm < AT);
  const g2 = cr.filter((r) => r.planeSagUm >= AT && r.tMin <= SA);
  const g3 = cr.filter((r) => r.planeSagUm >= AT && r.tMin > SA);
  say(`   A. ACCEPTED by the plane ruler (planeSag < ${AT} um)                : cnt ${pctC(g1, cr.length).padStart(8)}  area ${pctA(g1, crA).padStart(8)}`);
  say(`   B. not accepted, but IN the SNAP_ALPHA band (=> R4 dead end)       : cnt ${pctC(g2, cr.length).padStart(8)}  area ${pctA(g2, crA).padStart(8)}`);
  say(`   C. not accepted, out of band (=> a SHAPE/AR refusal or budget)     : cnt ${pctC(g3, cr.length).padStart(8)}  area ${pctA(g3, crA).padStart(8)}`);
}
say('');
say('── CONTEXT: what do crossed facets look like on the orientation ruler? ──');
{
  const cr = rows.filter((r) => r.turnDeg > TURN_DEG);
  const nc = rows.filter((r) => r.turnDeg <= TURN_DEG);
  say(`   CROSSED   n ${cr.length}  normDeg p50 ${wq(cr, (r) => r.normDeg, [0.5])}  tangUm p50 ${wq(cr, (r) => r.tangUm, [0.5])}  over-bar cnt ${pctC(cr.filter(isOver), cr.length)} / area ${pctA(cr.filter(isOver), sumA(cr))}`);
  say(`   UNCROSSED n ${nc.length}  normDeg p50 ${wq(nc, (r) => r.normDeg, [0.5])}  tangUm p50 ${wq(nc, (r) => r.tangUm, [0.5])}  over-bar cnt ${pctC(nc.filter(isOver), nc.length)} / area ${pctA(nc.filter(isOver), sumA(nc))}`);
  say(`   ratio normDeg / (turn/2) on CROSSED, area-wt p05/50/95: ${wq(cr, (r) => r.normDeg / Math.max(1e-9, r.turnDeg / 2), [0.05, 0.5, 0.95])}  (1 = the facet plane bisects the crease)`);
  const crOver = cr.filter(isOver);
  say(`   *** CREASE-CROSSING share of the OVER-BAR defect AREA: ${pctA(crOver, overArea)}  (count ${pctC(crOver, over.length)}) ***`);
  const bigTurn = over.filter((r) => r.turnDeg > 5);
  say(`   *** same at a 5-deg dihedral floor:                    ${pctA(bigTurn, overArea)}  (count ${pctC(bigTurn, over.length)}) ***`);
  say(`   *** EXTRAPOLATED whole-mesh crease-spanning FACET COUNT: ${Math.round((cr.length / Math.max(1, N)) * nTri)} of ${nTri} ***`);
  say('');
  say('   ── OVERLAP WITH S93\'s "FOLDED" CLASS (normDeg > 90). S93 declares FOLDED/CREASE/SMOOTH mutually');
  say('      exclusive; if the crossings are mostly back-facing they were being counted as FOLDED. ──');
  const fold = rows.filter((r) => r.normDeg > 90);
  const foldCross = fold.filter((r) => r.turnDeg > TURN_DEG);
  say(`   FOLDED (normDeg>90)            : cnt ${pctC(fold, N)}  area ${pctA(fold, totArea)}   over-bar defAREA ${pctA(fold.filter(isOver), overArea)}`);
  say(`   FOLDED **and** crease-crossing  : cnt ${pctC(foldCross, N)}  area ${pctA(foldCross, totArea)}`);
  say(`     => share of the FOLDED class that is crease-crossing: cnt ${pctC(foldCross, fold.length)}  area ${pctA(foldCross, sumA(fold))}`);
  say(`     => share of the CROSSING class that is folded       : cnt ${pctC(foldCross, cr.length)}  area ${pctA(foldCross, sumA(cr))}`);
}
say('');
say('── THE CUT: does an EDGE ON the crease remove the defect, and what does it cost? ──');
say('   1->3 cut along the crease CHORD PQ (two crossings) vs 1->2 split at P (one crossing:');
say('   a VERTEX on the crease but NO edge on it). Cut points lifted with the mesher\'s own addV.');
{
  const cw = (sub: CutRow[], f: (r: CutRow) => number, ps: number[]): string => {
    if (sub.length === 0) return 'n/a';
    const a = sub.map((r) => ({ v: f(r), w: r.area })).filter((x) => Number.isFinite(x.v)).sort((x, y) => x.v - y.v);
    if (a.length === 0) return 'n/a';
    const tot = a.reduce((s, x) => s + x.w, 0);
    return ps.map((p) => { let acc = 0; let val = a[a.length - 1].v; for (const x of a) { acc += x.w; if (acc >= p * tot) { val = x.v; break; } } return val.toPrecision(4); }).join('  ');
  };
  for (const [label, sub] of [['1->3 (edge ON the crease)', cutRows.filter((r) => r.kids === 3)],
    ['1->2 (vertex only)', cutRows.filter((r) => r.kids === 2)]] as Array<[string, CutRow[]]>) {
    say(`   ${label}  n=${sub.length}`);
    if (sub.length === 0) continue;
    say(`     parent normDeg  area-wt p50/90/max : ${cw(sub, (r) => r.parentNorm, [0.5, 0.9, 1])}`);
    say(`     WORST CHILD     area-wt p50/90/max : ${cw(sub, (r) => r.kidNorm, [0.5, 0.9, 1])}`);
    say(`     parent tangUm   area-wt p50/90/max : ${cw(sub, (r) => r.parentTang, [0.5, 0.9, 1])}`);
    say(`     WORST CHILD tangUm p50/90/max      : ${cw(sub, (r) => r.kidTang, [0.5, 0.9, 1])}`);
    say(`     child minAngle  area-wt p05/50     : ${cw(sub, (r) => r.kidMinAng, [0.05, 0.5])}   (parent ${cw(sub, (r) => r.parentMinAng, [0.05, 0.5])})`);
    say(`     area preserved (kids/parent) p05/50/95: ${cw(sub, (r) => r.areaRatio, [0.05, 0.5, 0.95])}`);
    const cleared = sub.filter((r) => r.kidTang <= BAR_UM);
    const cleared5 = sub.filter((r) => r.kidNorm <= 5);
    say(`     CLEARS the ${BAR_UM}-um chord bar : cnt ${((100 * cleared.length) / sub.length).toFixed(2)}%`);
    say(`     CLEARS a 5-deg angular bar     : cnt ${((100 * cleared5.length) / sub.length).toFixed(2)}%`);
    const nslv = sub.filter((r) => r.kidMinAng < 5);
    say(`     children with minAngle < 5 deg : cnt ${((100 * nslv.length) / sub.length).toFixed(2)}%`);
  }
  say('');
  say('   ── THE MOVE ARM (§4.3 / PF_CB_MOVE43H, BUILT and default OFF): move the NEAREST endpoint onto');
  say('      the crossing instead of adding a vertex. ZERO extra triangles. Facet-local only — the moved');
  say("      vertex's STAR is NOT measured here; the displacement is reported so that risk is visible. ──");
  {
    const sub = cutRows.filter((r) => Number.isFinite(r.moveNorm));
    say(`   n=${sub.length}`);
    if (sub.length > 0) {
      say(`     parent normDeg  area-wt p50/90/max : ${cw(sub, (r) => r.parentNorm, [0.5, 0.9, 1])}`);
      say(`     AFTER THE MOVE  area-wt p50/90/max : ${cw(sub, (r) => r.moveNorm, [0.5, 0.9, 1])}`);
      say(`     parent tangUm   area-wt p50/90/max : ${cw(sub, (r) => r.parentTang, [0.5, 0.9, 1])}`);
      say(`     AFTER tangUm    area-wt p50/90/max : ${cw(sub, (r) => r.moveTang, [0.5, 0.9, 1])}`);
      say(`     minAngle after  area-wt p05/50     : ${cw(sub, (r) => r.moveMinAng, [0.05, 0.5])}   (parent ${cw(sub, (r) => r.parentMinAng, [0.05, 0.5])})`);
      say(`     DISPLACEMENT um area-wt p50/90/max : ${cw(sub, (r) => r.moveDispUm, [0.5, 0.9, 1])}`);
      say(`     still crease-crossed after the move: cnt ${((100 * sub.filter((r) => r.moveStillCrossed > 0).length) / sub.length).toFixed(2)}%`);
      say(`     CLEARS the ${BAR_UM}-um chord bar : cnt ${((100 * sub.filter((r) => r.moveTang <= BAR_UM).length) / sub.length).toFixed(2)}%`);
      say(`     CLEARS a 5-deg angular bar     : cnt ${((100 * sub.filter((r) => r.moveNorm <= 5).length) / sub.length).toFixed(2)}%`);
      say(`     minAngle < 5 deg after         : cnt ${((100 * sub.filter((r) => r.moveMinAng < 5).length) / sub.length).toFixed(2)}%  (parent ${((100 * sub.filter((r) => r.parentMinAng < 5).length) / sub.length).toFixed(2)}%)`);
    }
  }
  const extra = cutRows.reduce((s, r) => s + (r.kids - 1), 0);
  say(`   TRIANGLE COST on the sampled crossings: +${extra} for ${cutRows.length} parents = +${(extra / Math.max(1, cutRows.length)).toFixed(2)} per crossing facet`);
  say(`   => extrapolated whole-mesh cost: +${Math.round((extra / Math.max(1, N)) * nTri)} triangles on ${nTri} = +${((100 * (extra / Math.max(1, N)) * nTri) / nTri).toFixed(4)}%`);
}
say('');
say(`total ${el()}`);

const rep = `${OUTDIR}/S99_CREASE_${TAG}.report.txt`;
writeFileSync(rep, `${L.join('\n')}\n`);
const nd = `${OUTDIR}/S99_CREASE_${TAG}.ndjson`;
writeFileSync(nd, '');
let chunk = '';
for (const r of rows) {
  chunk += `${JSON.stringify({
    a: r.area, d: r.diam, ma: r.minAng, nd: r.normDeg, tu: r.tangUm, sp: r.spreadDeg, kh: r.kinkDegH,
    td: r.turnDeg, rt: r.ratio, nc: r.nCross, mu: r.missUm, df: r.drvFound, dj: r.drvJump, dr: r.drvRatio,
    dt: r.drvTErr, dc: r.drvConf, ds: r.drvSagUm, th: r.th, z: r.z,
  })}\n`;
  if (chunk.length > 1 << 20) { appendFileSync(nd, chunk); chunk = ''; }
}
if (chunk.length > 0) appendFileSync(nd, chunk);
log(`\nreport -> ${rep}`);
log(`ndjson -> ${nd}`);
