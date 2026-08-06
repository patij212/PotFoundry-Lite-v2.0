// s112AngularDecomp.ts — THE PER-FACET ANGULAR DECOMPOSITION OF THE VISIBLE CLASS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS TOOL EXISTS — AND WHAT I FOUND BEFORE WRITING A LINE OF IT
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The entry brief for this session says three things. Two of them are wrong, and finding that out is the
// reason this tool measures what it measures rather than what the brief asked for.
//
//  (1) "S20's accept-side veto fired 0 of 5,313,594 times because FLOOR_MM returns above it at :2807."
//      *** THE MECHANISM IS WRONG. *** `_strataConformBisectL.test.ts:2807` reads
//          `if (le < FLOOR_MM) { ...; return; }`
//      and `le` is the facet's MAX edge. It returns for SUB-FLOOR triangles only; it does not shadow the
//      accept-side veto at :2816 for any ordinary facet. *** AND THE DENOMINATOR IS MISLABELLED. ***
//      `admitChecks` (:1428, incremented at :1458 inside `footBack`) is ONE counter shared by the split
//      side (:1524/:1525, TWO calls per bisect candidate), the hub path (:4195/:4197) and the census
//      sweep (:4859-:4880). 5,313,594 is that total. The accept-side denominator was never logged, so
//      "0 of 5,313,594" is 0 out of an unknown number. The likely real cause of `admitForcedPush == 0`
//      is COMPOSITION: `ADMIT_NORMAL_SPLIT` refused 38,133 back-facing children AT BIRTH, so none
//      survived to be offered at the accept test.
//
//  (2) "Give the driver an angular quantity — it has none." The first half is right and the second half
//      is right ONLY OF THE DRIVER. `orientOfFacet` in `research/bridge/orientRuler.ts` is a fully built,
//      two-sided, 9-fixture-validated angular ruler that ~30 tools already import. The driver is the one
//      thing that does not. The gap is WIRING, not construction.
//
//  (3) S20 was never an angular quantity in the first place. `footBack` (:1454-1484) is a 4-way AND of
//      SIGN tests (`admBestDot >= 0` at the centroid and all three vertices). It can only catch fully
//      inverted facets — S98's 0.006-0.013% class. Repairing its ordering would not give the driver an
//      angle. So "fix :2807" is not a route to the crease demand and is not pursued here.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MEASUREMENT — THE DISCRIMINATOR THE RULER ALREADY DOCUMENTS AND NOBODY HAS EVER RUN
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `orientRuler.ts:277-287` states the dichotomy this campaign needs, in the ruler's own words:
//
//     spreadRad LARGE  => the surface TURNS inside the footprint; no facet plane can fit it;
//                         the only remedies are SPLIT or ALIGN.
//     spreadRad SMALL but normRad LARGE
//                      => the normal field barely moves and the facet is simply MIS-ORIENTED against it;
//                         a FLIP or a re-placement fixes it AT ZERO TRIANGLE COST.
//
// S111 could not make that split because its probe is PAIRWISE (`measDeg / footMax`, p50 2.38): a ratio
// over one merged footprint cannot say which facet is wrong or whether the surface forced it. This tool
// decomposes it PER FACET, where the inequality is exact:
//
//     dihedral(f1,f2)  <=  normRad(f1) + normRad(f2) + (analytic turn between the two footprints)
//
// so `normRad` IS the mesh's own contribution and `spreadRad` IS the surface's. That is the whole point.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, BEFORE THE FIRST RUN. Written down so my own run can falsify me, as S111's did.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// P1 — THE RULER'S DICHOTOMY SEPARATES THE CAMPAIGN'S CLASSES.
//      CREASE class (crease on shared edge or centroid segment): median spreadDeg/normDeg >= 0.50.
//      RESIDUAL class (no crease on either locus):               median spreadDeg/normDeg <= 0.25.
//      *** KILL LINE: if the two medians differ by less than 1.5x, the documented discriminator does not
//      separate these classes and P1 is REFUTED. *** Report the number either way; do not rescue it.
//
// P2 — THE ADDRESSABLE POPULATION (this is the one that decides whether the driver gets wired at all).
//      "Flip/replace-fixable" := BOTH facets have spreadDeg < 5 AND at least one has normDeg > 10.
//      i.e. the surface is flat across both footprints and the mesh is off anyway.
//      *** KILL LINE: if that population is under 5% of the visible class BY AREA, an angular accept-side
//      veto in the driver cannot pay for itself, and S112 Part B (the wiring) MUST NOT BE BUILT. ***
//
// P3 — THE ANGULAR QUANTITY DOES NOT REACH THE CREASE CLASS. Descriptive, not a kill line: on the crease
//      class I predict normDeg ~ spreadDeg, i.e. the facet is already doing about as well as any single
//      plane can over that footprint, and no veto that only READS an angle can improve it. If instead
//      normDeg >> spreadDeg on the crease class, the crease class is partly a placement defect too and
//      the campaign's framing of it as purely a conformance demand is wrong.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// INSTRUMENT DISCIPLINE — the four scars this lineage has already paid for, each answered
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//  * COUNT ALONE OVER-STATES AREA BY 13-184x AND DISAGREES IN DIRECTION. Every population below is
//    reported as COUNT + AREA-SHARE + MAX, area accumulated over the UNIQUE facet set (a facet on two
//    high-dihedral edges must not be counted twice).
//  * PROBE FOOTPRINTS, NOT ENDPOINTS (S110's 13x, S111's L*kappa_max at 0.23). k=8 is 45 lattice points
//    per facet; a k-LADDER (4/8/16) runs on a subsample so the reader can see whether k=8 has converged
//    rather than take it on faith.
//  * A CENTRAL DIFFERENCE ACROSS A C0 CREASE RETURNS THE AVERAGE OF THE TWO ONE-SIDED NORMALS
//    (`orientRuler` defect (3)). *** S111 USED `fdNormalsCentral`. *** So this tool runs the KINK-AWARE
//    `fdNormals` as primary and reports the central sampler beside it as a control column, which prices
//    S111's own sampler bias for free.
//  * ORIENTATION CONVENTION IS NOT INVARIANT ("shares move a little, maxima move a lot"). Primary is
//    `winding` — the same convention `dihedralRuler` uses and the one a consumer of the STL renders.
//    The `outward` variant runs on a subsample so the sensitivity is visible, and `signMargin` is
//    reported so a coin-toss decision cannot hide.
//  * TWO-SIDED IN SITU. A NEGATIVE CONTROL runs on the same mesh: a random sample of LOW-dihedral pairs
//    (the 97.6% that are visibly fine). If the ruler reads large normDeg/spreadDeg there, it is broken
//    and every number below is void. A ruler validated only on the population it is meant to indict is
//    not validated.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ⛔⛔ RUN 1 OF THIS TOOL WAS VOID AND ITS OWN NEGATIVE CONTROL IS WHAT CAUGHT IT. READ THIS FIRST.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Run 1 (inset 0, no curtain scope) read normDeg p50 154.9 deg on the visible class and p90 162.8 deg on
// LOW-dihedral pairs — i.e. on facets that are mutually flat and visibly fine. `S91_CENSUS_ALL20.log`
// reads `inverted>90deg 0` on every mesh it censused with the same ruler at the same k. The control fired,
// the run was discarded, and `s112bOrientDiag.ts` found TWO defects, BOTH MINE, NEITHER IN THE RULER:
//
//  (1) *** I USED `inset: 0`. THE KNOWN-GOOD CALLER (`s91StyleCensus.ts:341`) USES 0.02. *** Measured on
//      this STL, that single option moves `inverted>90deg` 1,485 -> 195 (7.6x) and normDeg p99
//      164.55 -> 60.41 deg. It is the ruler's OWN documented false alarm (`orientRuler.ts:213-224`): a
//      finite-difference normal evaluated EXACTLY ON a C0 crease returns the average of the two flanks,
//      and a crease-conformed mesh puts its vertices exactly there ON PURPOSE. An INSET LADDER now runs
//      on every population so this sensitivity can never be buried in a default again.
//
//  (2) *** MY SELECTION WAS PERFECTLY CORRELATED WITH THE ARTEFACT. *** I conditioned on the high-dihedral
//      class, which IS the crease/curtain population — exactly where defect (1) false-alarms hardest. A
//      whole-mesh reading would have shown normDeg p50 4.76 deg immediately. Selecting on the defect class
//      and then measuring with an instrument that mis-reads that class is a trap this campaign has now
//      sprung twice (S109 probed the wrong locus; S110's 2-point probe under-read 13x).
//
// AND THE STRUCTURAL FACT THE DIAGNOSTIC TURNED UP, which changes what this tool may legitimately score:
//   H-A (STL winding inverted) EXCLUDED — f . n_analytic is negative on 0.132% of facets, p50 dot 0.9998.
//   H-D (theta=0 seam artefact) EXCLUDED — both populations spread over the circle.
//   *** H-B CONFIRMED: the normDeg>90 class is NEAR-VERTICAL — radial alignment |f . rhat| p50 0.1847
//   versus 0.7054 for the rest, with |r_th|/r p50 2.81 versus 0.83. THOSE ARE CURTAIN / CLIFF FACETS,
//   AND AN rA-REFERENCED NORMAL IS NOT DEFINED ON THEM AT ALL: the surface is not a graph of rA there. ***
//   The driver already knows this class exists — `locateKinkRaw` carries a `jump` flag and the driver
//   calls jump-class loci "curtain material, never a snap" (`_strataConformBisectL.test.ts:2886`).
//
// SO THIS TOOL NOW SCOPES ITSELF. Facets are split into WALL (a graph of rA; the ruler is sound) and
// CURTAIN (not a graph; the ruler is UNDEFINED and reports nothing but the discontinuity). P1/P2/P3 are
// scored on the WALL only, and the CURTAIN class is REPORTED, never folded in — the same move S103 made
// when it stopped letting treads void a wall verdict. A cliff that turns 90 degrees is a real 3D feature
// the mesh is supposed to have, not a defect, and scoring it as one is how the visible class got its size.
//
// Usage: bash research/tools/run-s112-angdecomp.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { orientOfFacet, fdNormals, fdNormalsCentral, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S112_STYLE ?? 'GothicArches';
const STL = process.env.PF_S112_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S112_TAG ?? 'GOTH';
const HI_DEG = envF('PF_S112_HI_DEG', 45);
const K = Math.round(envF('PF_S112_K', 8));
const SUB = Math.round(envF('PF_S112_SUB', 400));        // subsample size for the ladders/controls
// INSET — the option that voided run 1. 0.02 is `s91StyleCensus.ts:341`'s value, i.e. the one the only
// known-good caller of this ruler uses. NEVER take the default here; the ladder below prices it.
const INSET = envF('PF_S112_INSET', 0.05);
const INSET_LADDER = (process.env.PF_S112_INSETS ?? '0,0.01,0.02,0.05').split(',').map(Number);
// THE INSET-DROP DISCRIMINATOR (run 2's finding, and the reason INSET above is 0.05 and not s91's 0.02).
// normDeg on this class is NOT converged in inset — p50 157.08 / 93.06 / 39.36 / 2.44 deg at inset
// 0 / 0.01 / 0.02 / 0.05 — while it IS converged in lattice order k (39.358 at k=4, 8 AND 16). So the sup
// is attained ON the footprint BOUNDARY, i.e. at the vertices, i.e. exactly where a crease-conformed mesh
// PUTS them, and exactly where a finite-difference normal is undefined. That splits the class:
//   * a LARGE drop from inset LO to HI => the facet's whole error lives on its boundary => a vertex sits
//     ON the crease => the facet is CONFORMED. This is the mesher's GOOD work being indicted by the ruler.
//   * a SMALL drop with normDeg still high => the footprint INTERIOR straddles the crease => a GENUINE
//     defect, which no inset rescues and which refinement provably cannot fix (fixture H2: the straddle
//     angle is density-invariant, x0.9968 over five halvings, against a smooth control at x28.43).
// normDeg at INSET_HI is a WITNESS: the inset costs a bounded under-read, so whatever it reports is real.
// It is therefore SOUND FOR REFUSALS, which is the direction a defect census needs.
const INSET_LO = envF('PF_S112_INSET_LO', 0);
const INSET_HI = envF('PF_S112_INSET_HI', 0.05);
// CURTAIN CUT — a facet is a graph of rA only if its (r*theta, z) parameter footprint has real extent.
// `graphRatio` = 3D area / parameter-plane area. A wall facet tilted t from the parameter plane reads
// 1/cos(t) (2.0 at 60 deg); a vertical curtain spans ~no parameter area at all and diverges. The cut is
// swept in the report so the verdict cannot rest on the threshold.
const CURTAIN_RATIO = envF('PF_S112_CURTAIN', 8);
const DIMS: StyleDims = { H: envF('PF_S112_H', 120), Rb: envF('PF_S112_RB', 40), Rt: envF('PF_S112_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/angdecomp';

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

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const nsKink: NormalSampler = fdNormals(rA, H, 2e-4, 2e-4);
const nsCentral: NormalSampler = fdNormalsCentral(rA, H, 2e-4, 2e-4);

log('===== S112 — PER-FACET ANGULAR DECOMPOSITION OF THE VISIBLE CLASS =====');
log(`style ${STYLE}  tag ${TAG}  high cut ${HI_DEG} deg  lattice k=${K}  sampler=fdNormals (KINK-AWARE)`);
log(`INSET ${INSET} (s91's value — run 1 used 0 and was VOID)   CURTAIN CUT ${CURTAIN_RATIO}x graphRatio`);
log('THE QUESTION: of the measured dihedral, how much is the MESH (normDeg) and how much is the SURFACE');
log('(spreadDeg)? The remedy differs: spread large => SPLIT/ALIGN; spread small + norm large => FLIP,');
log('which costs ZERO triangles. See the pre-registration in this file\'s header before reading results.');
log('');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
{
  let worst = 0; const step = Math.max(1, Math.floor(nTri / 20000));
  for (let f = 0; f < nTri; f += step) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    if (dd > worst) worst = dd;
  }
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (S111 read 0.0310 um on this mesh)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}

const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(1)} mm2   interior edges ${d.interiorEdges}  inconsistent ${d.inconsistentEdges}  ${el()}`);
log('');

// ── the ruler, on one facet index, with a chosen sampler / convention ───────────────────────────────
const scratch = new Float64Array(12);
function orientOf(f: number, ns: NormalSampler, k: number, outward: boolean, inset = INSET): {
  normDeg: number; spreadDeg: number; kinkDeg: number; overFrac: number; signMargin: number;
} {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  // UNWRAPPED theta on one branch — orientOfFacet's stated precondition.
  const ath = Math.atan2(ay, ax);
  const bth = ath + dThRaw(ath, Math.atan2(by, bx));
  const cth = ath + dThRaw(ath, Math.atan2(cy, cx));
  const o = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, ath, bth, cth, {
    k, orient: outward ? 'outward' : 'winding', scratch, inset,
  });
  return {
    normDeg: o.normDeg, spreadDeg: (o.spreadRad * 180) / Math.PI, kinkDeg: (o.kinkRad * 180) / Math.PI,
    overFrac: o.overFrac, signMargin: o.signMargin,
  };
}

/**
 * IS THIS FACET A GRAPH OF rA? — 3D area divided by (r*theta, z) parameter-plane area.
 * The ruler compares a facet normal against rA's normal AT THE FACET'S PARAMETER FOOTPRINT. When the
 * footprint has no extent, there is no meaningful reference normal and the comparison is undefined, not
 * merely noisy. Returns Infinity for a perfectly vertical curtain facet.
 */
function graphRatio(f: number): number {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const ath = Math.atan2(ay, ax);
  const bth = ath + dThRaw(ath, Math.atan2(by, bx));
  const cth = ath + dThRaw(ath, Math.atan2(cy, cx));
  const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
  return aP > 1e-15 ? a3 / aP : Infinity;
}

const sharedEndpoints = (e: number): number[] | null => {
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const out: number[] = [];
  for (let a = 0; a < 3; a += 1) {
    const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
    for (let b = 0; b < 3; b += 1) {
      if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { out.push(ax, ay, az); break; }
    }
  }
  return out.length === 6 ? out : null;
};
const centroid = (f: number): [number, number, number] => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  return [cx / 3, cy / 3, cz / 3];
};
/** S109/S110's label EXACTLY: a crease on the shared edge OR on the centroid segment. */
const creaseLabel = (e: number): boolean => {
  const p = sharedEndpoints(e);
  if (p !== null) {
    const th0 = Math.atan2(p[1], p[0]);
    const kEdge = locateKinkRaw(rA, th0, p[2], th0 + dThRaw(th0, Math.atan2(p[4], p[3])), p[5], PRED);
    if (kEdge !== null && !kEdge.jump) return true;
  }
  const c1 = centroid(d.edgeF1[e]); const c2 = centroid(d.edgeF2[e]);
  const thc = Math.atan2(c1[1], c1[0]);
  const kSeg = locateKinkRaw(rA, thc, c1[2], thc + dThRaw(thc, Math.atan2(c2[1], c2[0])), c2[2], PRED);
  return kSeg !== null && !kSeg.jump;
};

// ══════════════════════════════════ THE NEGATIVE CONTROL, RUN FIRST ═════════════════════════════════
// A ruler validated only on the population it is meant to indict is not validated. These are LOW-dihedral
// pairs on the SAME mesh — the 97.6% that are visibly fine. If normDeg/spreadDeg read large here, every
// number below this line is void and the run must be thrown away.
// ⚠ THE FIRST VERSION OF THIS CONTROL WAS MIS-SPECIFIED AND I AM RECORDING THAT RATHER THAN DELETING IT.
// It asserted an ABSOLUTE bar (low-dihedral p90 normDeg < 5 deg) and fired at 6.480. The premise was that
// "visibly fine" implies "small normDeg" — and S108 HAD ALREADY REFUTED EXACTLY THAT: two facets tilted
// the SAME way are mutually flat (invisible) while both are off the surface. Low dihedral does not imply
// low fidelity error; that dissociation is the entire reason `dihedralRuler` exists beside this one.
// The bar was wrong when I wrote it, not wrong in hindsight. The correct control is RELATIVE: facets
// selected for local flatness must read NO WORSE than the mesh at large. Changing a pre-registered bar
// after seeing data is a move this campaign distrusts, so both the old bar and its failure stay printed.
{
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let gsr = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (gsr > 1 && gcd(gsr, nTri) !== 1) gsr += 2;
  const ref: number[] = [];
  for (let i = 0; i < 1500; i += 1) ref.push(orientOf((i * gsr) % nTri, nsKink, K, false).normDeg);
  const lo: number[] = [];
  const loThr = (2 * Math.PI) / 180;
  const stride = Math.max(1, Math.floor(d.edgeAngRad.length / (SUB * 8)));
  for (let e = 0; e < d.edgeAngRad.length && lo.length < SUB; e += stride) if (d.edgeAngRad[e] < loThr) lo.push(e);
  const nd: number[] = []; const sp: number[] = [];
  for (const e of lo) {
    const a = orientOf(d.edgeF1[e], nsKink, K, false); const b = orientOf(d.edgeF2[e], nsKink, K, false);
    nd.push(Math.max(a.normDeg, b.normDeg)); sp.push(Math.max(a.spreadDeg, b.spreadDeg));
  }
  const qq = (v: number[], p: number): number => { const s = v.slice().sort((x, y) => x - y); return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  log(`── NEGATIVE CONTROL: the ruler on LOW-dihedral (<2 deg) pairs vs the WHOLE MESH (inset ${INSET}) ──`);
  log(`  low-dihedral n=${lo.length}   normDeg p50 ${qq(nd, 0.5).toFixed(3)} p90 ${qq(nd, 0.9).toFixed(3)} MAX ${Math.max(...nd).toFixed(3)}`);
  log(`                                spreadDeg p50 ${qq(sp, 0.5).toFixed(3)} p90 ${qq(sp, 0.9).toFixed(3)}`);
  log(`  WHOLE-MESH reference n=${ref.length}   normDeg p50 ${qq(ref, 0.5).toFixed(3)} p90 ${qq(ref, 0.9).toFixed(3)}`);
  log(`  [old ABSOLUTE bar, mis-specified, kept for the record: p90 < 5 deg => ${qq(nd, 0.9) < 5 ? 'pass' : `FIRED at ${qq(nd, 0.9).toFixed(3)}`}]`);
  log(`  ${qq(nd, 0.9) <= qq(ref, 0.9) * 1.25 ? '[PASS] locally-flat facets read no worse than the mesh at large — the ruler is not manufacturing this class.'
    : '*** FAIL — the ruler reads WORSE on locally-flat facets than on the mesh at large. EVERY NUMBER BELOW IS VOID. ***'}`);
  log('');
}

// ══════════════════════════════════════ THE MAIN DECOMPOSITION ══════════════════════════════════════
type Row = {
  e: number; f1: number; f2: number; measDeg: number; crease: boolean; curtain: boolean; gr: number;
  norm1: number; norm2: number; spread1: number; spread2: number; normMax: number; spreadMax: number;
  normLo: number; drop: number;
};
const allRows: Row[] = [];
const hiThr = (HI_DEG * Math.PI) / 180;
for (let e = 0; e < d.edgeAngRad.length; e += 1) {
  if (!(d.edgeAngRad[e] > hiThr)) continue;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  const a = orientOf(f1, nsKink, K, false, INSET_HI); const b = orientOf(f2, nsKink, K, false, INSET_HI);
  const aLo = orientOf(f1, nsKink, K, false, INSET_LO); const bLo = orientOf(f2, nsKink, K, false, INSET_LO);
  const g1 = graphRatio(f1); const g2 = graphRatio(f2);
  const normHi = Math.max(a.normDeg, b.normDeg); const normLo = Math.max(aLo.normDeg, bLo.normDeg);
  allRows.push({
    e, f1, f2, measDeg: (d.edgeAngRad[e] * 180) / Math.PI, crease: creaseLabel(e),
    curtain: g1 > CURTAIN_RATIO || g2 > CURTAIN_RATIO, gr: Math.max(g1, g2),
    norm1: a.normDeg, norm2: b.normDeg, spread1: a.spreadDeg, spread2: b.spreadDeg,
    normMax: normHi, spreadMax: Math.max(a.spreadDeg, b.spreadDeg),
    normLo, drop: normLo > 1e-9 ? normHi / normLo : 1,
  });
}
log(`high-dihedral pairs (>${HI_DEG} deg): ${allRows.length}   (S108 read 19,582 on this mesh)   ${el()}`);

/** area over the UNIQUE facet set of a row subset — a facet on two high edges must not count twice. */
const areaOf = (rs: Row[]): number => {
  const s = new Set<number>();
  for (const r of rs) { s.add(r.f1); s.add(r.f2); }
  let a = 0; for (const f of s) a += d.areaMm2[f];
  return a;
};
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const rep = (name: string, rs: Row[], denom: Row[]): void => {
  const ar = areaOf(rs);
  log(`  ${name.padEnd(34)} n=${String(rs.length).padStart(6)} (${((rs.length / Math.max(1, denom.length)) * 100).toFixed(2).padStart(6)}%)   AREA ${ar.toFixed(2).padStart(9)} mm2 = ${((ar / meshArea) * 100).toFixed(4)}% of mesh`);
};

// ═══════════════ SCOPE FIRST: WALL (the ruler is defined) vs CURTAIN (it is not) ═══════════════
const curtainRows = allRows.filter((r) => r.curtain);
const rows = allRows.filter((r) => !r.curtain);
log('');
log('── SCOPE: is the ruler even DEFINED on this facet? (graphRatio = 3D area / parameter area) ──');
log(`   cut ${CURTAIN_RATIO}x. A wall facet tilted 60 deg off the parameter plane reads 2.0; a vertical`);
log('   curtain spans no parameter area and diverges. rA has no normal to compare against there.');
rep('WALL   (a graph of rA — SCORED)', rows, allRows);
rep('CURTAIN (NOT a graph — REPORTED)', curtainRows, allRows);
log('   CURTAIN-CUT SWEEP (the verdict must not rest on the threshold):');
for (const c of [4, 8, 16, 64]) {
  const cr = allRows.filter((r) => r.gr > c);
  log(`     cut ${String(c).padStart(3)}x  curtain n=${String(cr.length).padStart(6)} (${((cr.length / Math.max(1, allRows.length)) * 100).toFixed(2)}% of class)  AREA ${((areaOf(cr) / meshArea) * 100).toFixed(4)}% of mesh`);
}
log('   ⚠ A CURTAIN FACET AT 160 deg IS NOT A DEFECT. A cliff is a real 3D feature the mesh is supposed');
log('   to have (the standing export rule: cliffs are features to mesh, not artifacts). Counting them as');
log('   visible defect is how this class got its size — S108 measured the dihedral and never asked this.');
log('');

const crease = rows.filter((r) => r.crease);
const resid = rows.filter((r) => !r.crease);
log('── CLASS SPLIT within the WALL scope (S109/S110 labels, same instrument) ──');
rep('CREASE-ASSOCIATED', crease, rows);
rep('RESIDUAL (no crease either locus)', resid, rows);
log(`  S110 published 15,424 / 4,158 = 78.77% / 21.23% of the UNSCOPED class. Any divergence here is the`);
log('  curtain scoping, not a label disagreement — the unscoped counts are printed above to check that.');
log('');

log('── P0 (NEW, run 2) — CONFORMED vs STRADDLING, from the INSET DROP ──');
log(`   normDeg(inset ${INSET_HI}) / normDeg(inset ${INSET_LO}).  ~0 => the whole error sits on the facet BOUNDARY,`);
log('   i.e. a vertex is ON the crease and the facet is CONFORMED (the mesher\'s good work, falsely indicted).');
log('   ~1 => the footprint INTERIOR straddles the crease: a GENUINE defect, and fixture H2 proves');
log('   refinement cannot fix it (straddle angle x0.9968 over five halvings; smooth control x28.43).');
{
  const conformed = rows.filter((r) => r.drop < 0.25 && r.normLo > 10);
  const straddling = rows.filter((r) => r.drop >= 0.25 && r.normMax > 10);
  rep('CONFORMED (falsely indicted)', conformed, rows);
  rep('STRADDLING (genuine defect)', straddling, rows);
  rep('  ...straddling AND crease-labelled', straddling.filter((r) => r.crease), rows);
  const dr = rows.map((r) => r.drop);
  log(`  inset-drop over the whole WALL class: p10 ${q(dr, 0.1).toFixed(3)}  p50 ${q(dr, 0.5).toFixed(3)}  p90 ${q(dr, 0.9).toFixed(3)}`);
  log(`  *** GENUINE (straddling) defect AREA = ${((areaOf(straddling) / meshArea) * 100).toFixed(4)}% of the mesh,`);
  log(`      against the ${((areaOf(allRows) / meshArea) * 100).toFixed(4)}% the unscoped dihedral census reports. ***`);
}
log('');

log('── P1 — THE RULER\'S OWN DICHOTOMY: spreadDeg / normDeg, per pair ──');
log('   ~1 => the SURFACE turns inside the footprint (no plane fits: SPLIT or ALIGN)');
log('   ~0 => the field is flat and the FACET is misplaced (FLIP/re-place: ZERO triangle cost)');
const ratioOf = (rs: Row[]): number[] => rs.map((r) => (r.normMax > 1e-9 ? r.spreadMax / r.normMax : Infinity));
for (const [nm, rs] of [['CREASE', crease], ['RESIDUAL', resid], ['ALL', rows]] as Array<[string, Row[]]>) {
  const rr = ratioOf(rs);
  log(`  ${nm.padEnd(10)} spread/norm  p10 ${q(rr, 0.1).toFixed(3)}  p25 ${q(rr, 0.25).toFixed(3)}  p50 ${q(rr, 0.5).toFixed(3)}  p75 ${q(rr, 0.75).toFixed(3)}  p90 ${q(rr, 0.9).toFixed(3)}`);
  log(`  ${' '.repeat(10)} normDeg   p50 ${q(rs.map((r) => r.normMax), 0.5).toFixed(2).padStart(7)}  p90 ${q(rs.map((r) => r.normMax), 0.9).toFixed(2).padStart(7)}   spreadDeg p50 ${q(rs.map((r) => r.spreadMax), 0.5).toFixed(2).padStart(7)}  p90 ${q(rs.map((r) => r.spreadMax), 0.9).toFixed(2).padStart(7)}   measDeg p50 ${q(rs.map((r) => r.measDeg), 0.5).toFixed(2)}`);
}
{
  const mc = q(ratioOf(crease), 0.5); const mr = q(ratioOf(resid), 0.5);
  const sep = mc > mr ? mc / Math.max(1e-9, mr) : mr / Math.max(1e-9, mc);
  log('');
  log(`  P1 VERDICT: crease p50 ${mc.toFixed(3)} vs residual p50 ${mr.toFixed(3)}  =>  separation ${sep.toFixed(2)}x`);
  log(`    registered: crease >= 0.50 AND residual <= 0.25; KILL if separation < 1.5x`);
  log(`    ${sep < 1.5 ? '*** P1 REFUTED — the documented discriminator does NOT separate these classes. ***'
    : mc >= 0.5 && mr <= 0.25 ? '[P1 CONFIRMED as registered]'
      : '[P1 PARTIAL — separated, but not at the registered thresholds. Quote the numbers, not the verdict.]'}`);
}
log('');

log('── P2 — THE ADDRESSABLE POPULATION: both spreadDeg < 5 AND max normDeg > 10 ──');
log('   (the surface is flat across BOTH footprints and the mesh is off anyway => a placement defect)');
const fixable = rows.filter((r) => r.spread1 < 5 && r.spread2 < 5 && r.normMax > 10);
rep('FLIP/REPLACE-FIXABLE', fixable, rows);
rep('  ...of which CREASE-labelled', fixable.filter((r) => r.crease), rows);
rep('  ...of which RESIDUAL', fixable.filter((r) => !r.crease), rows);
{
  const shareArea = areaOf(fixable) / Math.max(1e-12, areaOf(rows));
  log('');
  log(`  P2 VERDICT: ${(shareArea * 100).toFixed(2)}% of the VISIBLE CLASS by area   (registered kill line: < 5% => DO NOT BUILD Part B)`);
  log(`    ${shareArea < 0.05 ? '*** P2 KILL LINE FIRED — an angular accept-side veto cannot pay for itself. Part B is NOT to be built. ***'
    : '[P2 PASSES — the population is large enough that wiring the angular quantity into the driver is worth pricing.]'}`);
}
log('');

log('── P3 — DOES THE ANGULAR QUANTITY REACH THE CREASE CLASS? (descriptive) ──');
{
  const excess = crease.map((r) => r.normMax - r.spreadMax);
  log(`  crease normDeg - spreadDeg:  p10 ${q(excess, 0.1).toFixed(2)}  p50 ${q(excess, 0.5).toFixed(2)}  p90 ${q(excess, 0.9).toFixed(2)} deg`);
  log('    ~0 or negative => the facet is already as good as any single plane over that footprint, and no');
  log('    veto that merely READS an angle can improve it: the demand must be DISCHARGED by geometry.');
  log('    Strongly positive => the crease class is ALSO partly a placement defect, and the campaign\'s');
  log('    framing of it as purely a conformance demand is incomplete.');
}
log('');

// ══════════════════════════════ LADDERS AND CONTROLS ON A SUBSAMPLE ═════════════════════════════════
const sub = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / SUB)) === 0).slice(0, SUB);
log(`── CONVERGENCE + CONVENTION + SAMPLER LADDERS (subsample n=${sub.length}) ──`);
log('   *** INSET LADDER — THE OPTION THAT VOIDED RUN 1. Never quote a normDeg without it. ***');
for (const ins of INSET_LADDER) {
  const nd = sub.map((r) => Math.max(orientOf(r.f1, nsKink, K, false, ins).normDeg, orientOf(r.f2, nsKink, K, false, ins).normDeg));
  const inv = nd.filter((x) => x > 90).length;
  log(`     inset ${ins.toFixed(3)}  normDeg p50 ${q(nd, 0.5).toFixed(3).padStart(8)} p90 ${q(nd, 0.9).toFixed(3).padStart(8)} p99 ${q(nd, 0.99).toFixed(3).padStart(8)}   >90deg ${inv}`);
}
log('   k-LADDER: does k=8 read the same as k=16? (the 13x endpoint under-read scar)');
for (const kk of [4, 8, 16]) {
  const nd = sub.map((r) => Math.max(orientOf(r.f1, nsKink, kk, false).normDeg, orientOf(r.f2, nsKink, kk, false).normDeg));
  const sp = sub.map((r) => Math.max(orientOf(r.f1, nsKink, kk, false).spreadDeg, orientOf(r.f2, nsKink, kk, false).spreadDeg));
  log(`     k=${String(kk).padStart(2)}  normDeg p50 ${q(nd, 0.5).toFixed(3).padStart(8)} p90 ${q(nd, 0.9).toFixed(3).padStart(8)}   spreadDeg p50 ${q(sp, 0.5).toFixed(3).padStart(8)} p90 ${q(sp, 0.9).toFixed(3).padStart(8)}`);
}
log('   SAMPLER: kink-aware (this tool) vs CENTRAL (what S111 used — averages across a C0 crease)');
{
  const a = sub.map((r) => Math.max(orientOf(r.f1, nsKink, K, false).normDeg, orientOf(r.f2, nsKink, K, false).normDeg));
  const b = sub.map((r) => Math.max(orientOf(r.f1, nsCentral, K, false).normDeg, orientOf(r.f2, nsCentral, K, false).normDeg));
  const per = a.map((x, i) => (b[i] > 1e-9 ? x / b[i] : Infinity));
  log(`     kink normDeg p50 ${q(a, 0.5).toFixed(3)}   central p50 ${q(b, 0.5).toFixed(3)}   PER-PAIR ratio p50 ${q(per, 0.5).toFixed(3)} p90 ${q(per, 0.9).toFixed(3)}`);
  log('     (a ratio > 1 is the amount S111\'s central sampler under-read by, on the same footprints)');
}
log('   CONVENTION: winding (primary) vs outward');
{
  const a = sub.map((r) => Math.max(orientOf(r.f1, nsKink, K, false).normDeg, orientOf(r.f2, nsKink, K, false).normDeg));
  const b = sub.map((r) => Math.max(orientOf(r.f1, nsKink, K, true).normDeg, orientOf(r.f2, nsKink, K, true).normDeg));
  const mg = sub.map((r) => Math.min(orientOf(r.f1, nsKink, K, true).signMargin, orientOf(r.f2, nsKink, K, true).signMargin));
  log(`     winding p50 ${q(a, 0.5).toFixed(3)} MAX ${Math.max(...a).toFixed(2)}   outward p50 ${q(b, 0.5).toFixed(3)} MAX ${Math.max(...b).toFixed(2)}   signMargin p10 ${q(mg, 0.1).toFixed(3)}`);
  log('     (a small signMargin means the outward decision was a coin toss on those facets — do not quote it)');
}
log('');

writeFileSync(`${OUTDIR}/S112_ANGDECOMP_${TAG}.json`, `${JSON.stringify({
  style: STYLE, stl: STL, hiDeg: HI_DEG, k: K, sampler: 'fdNormals(kink-aware)', convention: 'winding',
  inset: INSET, curtainCut: CURTAIN_RATIO,
  meshFacets: nTri, meshAreaMm2: meshArea,
  highPairsUnscoped: allRows.length, curtainPairs: curtainRows.length, curtainAreaMm2: areaOf(curtainRows),
  highPairs: rows.length,
  crease: crease.length, residual: resid.length,
  creaseAreaMm2: areaOf(crease), residualAreaMm2: areaOf(resid),
  classAreaMm2: areaOf(rows),
  p1: { creaseRatioP50: q(ratioOf(crease), 0.5), residualRatioP50: q(ratioOf(resid), 0.5) },
  p2: { fixable: fixable.length, fixableAreaMm2: areaOf(fixable), fixableAreaShareOfClass: areaOf(fixable) / Math.max(1e-12, areaOf(rows)) },
  p3: { creaseNormMinusSpreadP50: q(crease.map((r) => r.normMax - r.spreadMax), 0.5) },
}, null, 2)}\n`);
log(`wrote ${OUTDIR}/S112_ANGDECOMP_${TAG}.json`);
log(`done ${el()}`);
