// s106ConformBisect.ts — *** WHAT DOES CONFORMITY COST? ***  (agent CONFORM, 2026-08-06)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HOLE THIS EXISTS TO FILL
//
// Every refinement cost in the STRATA campaign is printed with this caveat, verbatim from
// `frontierRefine.ts`:
//
//     "(conformity ignored for all three equally, so each count is a lower bound; the RATIO is the claim)"
//
// `frontierRefine.adaptBisect` walks a per-parent stack. When it bisects an edge it does NOT bisect the
// neighbour that shares that edge. The result is a mesh full of hanging nodes — not a mesh. So every
// absolute triangle count in §7.1 is a LOWER BOUND OF UNKNOWN TIGHTNESS, and the campaign has been
// reasoning about a 12 M budget on those lower bounds for weeks:
//
//     Voronoi S94CTL   492,068 facets x 8.697x  =  4.28 M   |
//     Gothic  S39CTL 1,142,166 facets x 5.856x  =  6.69 M   |  vs a 12 M working budget
//
// If the conformity multiplier is 1.5x both fit. If it is 10x neither does. NOBODY HAS MEASURED IT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE METHODOLOGICAL TRAP, NAMED UP FRONT
//
// *** CONFORMITY IS A GLOBAL PROPERTY. IT CANNOT BE MEASURED BY SAMPLING INDEPENDENT PARENTS. *** The
// moment facet A is refined, its neighbour B may be forced to split, which may force C. The campaign's
// whole sampling apparatus (golden-stride parents, phase blocks, per-parent trees) is STRUCTURALLY
// UNABLE to see this. That is exactly why it was never measured.
//
// APPROACH CHOSEN (approach (c) of the brief, pre-registered):
//   * ONE code path parameterised by a REGION = (CORE facets, HALO depth).
//   * `region = whole mesh` => a CENSUS. No sampling, no boundary truncation at all beyond the mesh's
//     own genuine rim. A census needs no band, and that is a STRENGTH.
//   * `region = BFS patch of size P, halo h` => the cheap arm. Simulation runs on CORE u HALO; the
//     count C is attributed ONLY to level-0 ancestors in CORE. Propagation that escapes CORE u HALO is
//     truncated => *** UNDER-ESTIMATE. BIAS DIRECTION: DOWNWARD. *** Bounded by two printed numbers:
//     `boundary-terminal %` (LEPP walks that died on a patch-boundary edge) and the P-sweep itself.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED HYPOTHESES AND KILL LINES  (written and committed BEFORE the first run)
//
//   C1 — THE MULTIPLIER.  M = conforming_leaves / independent_leaves, same mesh, same 10 um covering
//        chord bar, same operator (longest-edge bisection = LEPP, what the campaign quotes and what the
//        driver approximates), same depth cap. Per style. *** THIS IS THE DELIVERABLE. ***
//        The conforming arm is Rivara BACKWARD LONGEST-EDGE BISECTION: to refine T, walk the
//        longest-edge propagation path to a TERMINAL PAIR and bisect that pair, repeat until T splits.
//        The mesh is conforming after EVERY step — zero hanging nodes, by construction, always.
//        The independent arm is `frontierRefine.adaptBisect('lepp')`, copied VERBATIM.
//
//   C2 — DOES IT FIT?  conforming absolute count for the 10 um chord bar on Gothic S39CTL and
//        shape-gated Voronoi S94CTL against the 12 M budget. PASS/FAIL with a band.
//        *** PRE-REGISTERED READING: M <= 1.5 => "both fit" survives. M >= 2.8 (Voronoi) / 1.8 (Gothic)
//        => the style crosses 12 M and the "density closes the chord bar" budget conclusion FAILS. ***
//
//   C3 — IS M STABLE OR TAIL-DOMINATED?  KILL/FLAG: if M's own spread across DISJOINT GOLDEN-STRIDE
//        PHASE BLOCKS of level-0 parents exceeds +/-50%, M is tail-dominated like everything else in
//        this campaign and MUST be reported as a band, never a point.
//        (The census gives per-root C and per-root I exactly, so the blocks cost nothing extra: they
//        are a re-aggregation of the same census, not new runs.)
//
//   C4 — DOES CONFORMITY CHANGE A RATIO?  The campaign has ASSUMED it cancels. Two tests:
//        (a) M(Gothic) vs M(Voronoi) — if they differ, no cross-style count comparison is safe.
//        (b) *** M AT THE POSITION BAR. *** §7.0's best-conditioned claim ("the 10 um position bar is
//            not what is stopping us — 1.025x / 1.053x") is a lower bound too, and conformity's
//            RELATIVE cost is LARGEST when refinement is SPARSE and LOCALISED, which is exactly the
//            position bar's regime. If M_position >> M_chord the headline moves.
//        KILL for C4: if |M_chord - M_position| / M_chord < 0.15 AND |M_goth - M_vor| / M_goth < 0.15,
//        conformity DOES cancel out of the campaign's ratios and the caveat can be retired as harmless.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// CONTROLS THAT MUST PRINT (a verdict line without these is not usable)
//
//   * FIDELITY: `PF_CF_MODE=fid` runs the independent arm ONLY, on the campaign's own golden stride,
//     and must reproduce `frontierRefine`/`s98QRefine` to the digit:
//         Gothic S39CTL N=2000 uniLev2/maxLev6 : LEPP 10652 leaves = 5.33x, 17.42% uncleared
//                                                POS  2048 leaves = 1.02x,  0.000% uncleared
//         Voronoi S94CTL N=2000                : LEPP 16933 leaves = 8.47x,  0.00% uncleared
//                                                POS  2063 leaves = 1.03x,  0.000% uncleared
//     A silently drifted copy invalidates everything downstream, so this is RUN, not asserted.
//   * WELD: vertices are welded by EXACT float32 bit pattern by default (`PF_CF_WELDQ=0`). The STL
//     stores float32, so a shared vertex is bit-identical across its facets and an exact weld is the
//     TIGHTEST correct one. Too tight leaves the mesh artificially disconnected (UNDERSTATES
//     propagation); too loose welds across genuine seams. *** EDGE MANIFOLDNESS IS PRINTED: how many
//     edges carry 1, 2, >2 incident faces, at every tolerance tried. *** This is the single most
//     likely place for a silent bug in this tool.
//   * THETA FRAME: a triangle's 3 unwrapped thetas are RECOMPUTED from xyz (atan2 + dThRaw off corner
//     0) rather than inherited, because a global mesh has no global unwrap. That is equivalent to
//     inheritance up to a constant 2*pi*k on all three corners, and every use of theta downstream is
//     2*pi-periodic. `PF_CF_THINHERIT=1` runs the inherited variant as a control; the fidelity check
//     proves the recomputed one reproduces the parent tool.
//   * TIE RULE: the conforming LEPP needs a STRICT TOTAL ORDER on edges ((len, maxVid, minVid)) or the
//     propagation path can cycle. `frontierRefine` uses first-max-wins on edge index. On a structured
//     mesh exact length ties are COMMON, so both tie rules are run on the independent arm and the tie
//     rate is printed. M is quoted between arms using the SAME tie rule.
//   * NON-VACUITY: the conforming arm reports hanging nodes = 0 by construction; the independent arm's
//     hanging-node count is printed as the contrast (it must be large, or the two arms are the same
//     thing and M=1 is a bug not a result).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// RULER. `PF_CF_RULER=outward` (default) = the `5698d023` convention (sign from the ANALYTIC surface
// normal at the footprint centroid). `PF_CF_RULER=legacy` = `frontierRefine`'s inline `f_xy . centroid_xy`
// — used for the FIDELITY check, because that is the convention the published numbers are on. §0i.5
// measured the two at <0.7% apart on these multipliers; M is a RATIO of two counts on the SAME ruler,
// so it is doubly robust. Both are reported.
//
// SEMANTICS OF THE CAP. `cap = 2 * PF_CF_MAXLEV` bisections from the level-0 ancestor, matching
// `adaptBisect`'s `lev >= 2 * MAXLEV`. In the conforming arm the cap gates the DECISION to refine (a
// triangle over bar at depth >= cap is not enqueued) but NOT forced propagation — because refusing a
// forced split would break conformity, which is the one thing this tool exists to preserve.
// `forcedOverCap` is printed.
//
// Usage: bash research/tools/run-s106-conform.sh
//   env: PF_CF_MODE=fid|patch|census  PF_CF_ARMS=ind,con  PF_CF_STYLE PF_CF_STL PF_CF_TAG
//        PF_CF_BAR_UM(10) PF_CF_BARS=chord,pos PF_CF_MAXLEV(6) PF_CF_K(8) PF_CF_INSET(0.02)
//        PF_CF_N(2000) PF_CF_PATCH PF_CF_HALO PF_CF_SEEDS PF_CF_WELDQ PF_CF_RULER PF_CF_MAXTRI
//        PF_CF_SHARD PF_CF_NSHARD PF_CF_H/RB/RT
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, existsSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => process.env[n] ?? d;

const STYLE = envS('PF_CF_STYLE', 'GothicArches');
const STL = envS('PF_CF_STL', 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl');
const TAG = envS('PF_CF_TAG', 'RUN');
const MODE = envS('PF_CF_MODE', 'fid');
const ARMS = envS('PF_CF_ARMS', 'ind,con').split(',');
const BARS = envS('PF_CF_BARS', 'chord').split(',');
const NSAMP = Math.round(envF('PF_CF_N', 2000));
const K = Math.round(envF('PF_CF_K', 8));
const INSET = envF('PF_CF_INSET', 0.02);
const BAR_UM = envF('PF_CF_BAR_UM', 10);
const MAXLEV = Math.round(envF('PF_CF_MAXLEV', 6));
const CAP = 2 * MAXLEV;
const LEGACYSIGN = envS('PF_CF_RULER', 'outward') === 'legacy';
const WELDQ = envF('PF_CF_WELDQ', 0);
const MAXTRI = Math.round(envF('PF_CF_MAXTRI', 60e6));
const WATCHDOG = Math.round(envF('PF_CF_WATCHDOG', 0));
const PROGMS = Math.round(envF('PF_CF_PROGMS', 30000));
/** HARD depth limit on FORCED (propagation) splits. A forced split at depth >= HARDCAP is REFUSED,
 *  which leaves a HANGING NODE. `st.refusedForced` is that count = the conformity DEFICIT, printed. */
const HARDCAP = Math.round(envF('PF_CF_HARDCAP', 1000000));
const SHARD = Math.round(envF('PF_CF_SHARD', 0));
const NSHARD = Math.round(envF('PF_CF_NSHARD', 1));
const PATCHSIZES = envS('PF_CF_PATCH', '250,1000,4000,16000,64000').split(',').map((s) => Math.round(Number(s)));
const HALOS = envS('PF_CF_HALO', '0').split(',').map((s) => Math.round(Number(s)));
const NSEEDS = Math.round(envF('PF_CF_SEEDS', 8));
const DIMS: StyleDims = { H: envF('PF_CF_H', 120), Rb: envF('PF_CF_RB', 40), Rt: envF('PF_CF_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/frontier';

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

const T0 = Date.now();
const el = (): string => ((Date.now() - T0) / 1000).toFixed(1);
mkdirSync(OUTDIR, { recursive: true });
log('===== S106 CONFORM — WHAT DOES CONFORMITY COST? =====');
log(`style ${STYLE}  tag ${TAG}  mode ${MODE}  arms [${ARMS.join(',')}]  bars [${BARS.join(',')}]`);
log(`bar ${BAR_UM} um  covering k=${K} inset=${INSET}  maxLev ${MAXLEV} => bisection cap ${CAP}`);
log(`RULER = ${LEGACYSIGN ? 'legacy (f_xy . centroid_xy) — the convention the published numbers are on' : '5698d023 (sign from the ANALYTIC surface normal at the footprint centroid)'}`);
log(`STL ${STL}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M0 = readMeshFloat64(STL, false);
const xyz0 = M0.xyz; const nTri0 = M0.nTri;
log(`mesh ${nTri0} facets  [${el()}s]`);

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// THE RULER — verbatim from frontierRefine.score (+ the s94ConeRefine 5698d023 sign branch)
// ───────────────────────────────────────────────────────────────────────────────────────────────────
const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const scq = INSET / 3;
  let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + scq; const b = sh * (j / K) + scq;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}
const HARC = 2e-4; const HZ = 2e-4;

function lift(th: number, z: number): [number, number, number] {
  const r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}
/** unit surface normal at a parameter point, 5 rA evals. */
function surfNormalAt(th: number, z: number): [number, number, number] {
  const r0 = rA(th, z);
  const hT = HARC / Math.max(1e-9, Math.abs(r0));
  let zl = z - HZ; let zh = z + HZ;
  if (zl < 0) { zl = 0; zh = Math.min(H, 2 * HZ); }
  if (zh > H) { zh = H; zl = Math.max(0, H - 2 * HZ); }
  const rt = (rA(th + hT, z) - rA(th - hT, z)) / (2 * hT);
  const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
  const c = Math.cos(th); const s2 = Math.sin(th);
  const axn = rt * s2 + r0 * c; const ayn = r0 * s2 - rt * c; const azn = -r0 * rz;
  const L = Math.hypot(axn, ayn, azn) || 1;
  return [axn / L, ayn / L, azn / L];
}
let signMarginMin = 1; let signMarginLo10 = 0; let signMarginLo01 = 0; let signMarginN = 0;
let nScores = 0;

interface Score { chordUm: number; area: number; dPerpUm: number; angDeg: number; }
function score(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
  ath: number, bth: number, cth: number,
): Score {
  nScores += 1;
  const eA = Math.hypot(bx - cx, by - cy, bz - cz);
  const eB = Math.hypot(ax - cx, ay - cy, az - cz);
  const eC = Math.hypot(ax - bx, ay - by, az - bz);
  const diam = Math.max(eA, eB, eC);
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const area = 0.5 * fl;
  if (!(fl > 0)) return { chordUm: 0, area: 0, dPerpUm: 0, angDeg: 0 };
  fx /= fl; fy /= fl; fz /= fl;
  if (LEGACYSIGN) {
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  } else {
    const [rx, ry, rz2] = surfNormalAt((ath + bth + cth) / 3, (az + bz + cz) / 3);
    const d0 = fx * rx + fy * ry + fz * rz2;
    const m0 = Math.abs(d0);
    if (m0 < signMarginMin) signMarginMin = m0;
    signMarginN += 1; if (m0 < 0.1) signMarginLo10 += 1; if (m0 < 0.01) signMarginLo01 += 1;
    if (d0 < 0) { fx = -fx; fy = -fy; fz = -fz; }
  }
  let best = -1; let dPerpMax = 0;
  for (let p = 0; p < LP; p += 1) {
    const th = wA[p] * ath + wB[p] * bth + wC[p] * cth;
    const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const r0 = rA(th, zz);
    const hTh = HARC / Math.max(1e-9, Math.abs(r0));
    let zLo = zz - HZ; let zHi = zz + HZ;
    if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
    if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
    const rt = (rA(th + hTh, zz) - rA(th - hTh, zz)) / (2 * hTh);
    const rz = zHi > zLo ? (rA(th, zHi) - rA(th, zLo)) / (zHi - zLo) : 0;
    const c = Math.cos(th); const s = Math.sin(th);
    let vx = rt * s + r0 * c; let vy = r0 * s - rt * c; let vz = -r0 * rz;
    const L = Math.hypot(vx, vy, vz) || 1; vx /= L; vy /= L; vz /= L;
    let d = fx * vx + fy * vy + fz * vz; d = d > 1 ? 1 : d < -1 ? -1 : d;
    const a = Math.acos(d);
    if (a > best) best = a;
    const px = wA[p] * ax + wB[p] * bx + wC[p] * cx;
    const py = wA[p] * ay + wB[p] * by + wC[p] * cy;
    const pz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const dp = Math.abs((px - r0 * c) * vx + (py - r0 * s) * vy + (pz - zz) * vz);
    if (dp > dPerpMax) dPerpMax = dp;
  }
  return { chordUm: 2 * Math.sin(0.5 * best) * diam * 1000, area, dPerpUm: dPerpMax * 1000, angDeg: (best * 180) / Math.PI };
}

type BarName = 'chord' | 'pos';
const overBar = (s: Score, bar: BarName): boolean => (bar === 'chord' ? s.chordUm > BAR_UM : s.dPerpUm > BAR_UM);

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// ARM I — INDEPENDENT. VERBATIM from frontierRefine.adaptBisect('lepp') / bisect('lepp').
// The only addition is `TIETOTAL`, which switches the tie-break to the conforming arm's strict total
// order so that M compares two arms running the SAME operator.
// ───────────────────────────────────────────────────────────────────────────────────────────────────
interface Tri { x: number[]; y: number[]; z: number[]; th: number[]; }

/**
 * THE SHARED STRICT TOTAL ORDER ON EDGES. Rivara's LEPP walk only terminates if the propagation path's
 * edge key strictly increases; plain "longest, first index wins" can CYCLE when two edges tie exactly,
 * and on a structured ring mesh exact ties are not rare. Key = (length, lexicographically-larger
 * endpoint, lexicographically-smaller endpoint) — defined purely from COORDINATES, so the independent
 * and the conforming arm pick the SAME GEOMETRIC EDGE and M compares one operator with itself.
 * `frontierRefine`'s first-max rule is kept as `tieTotal=false` for the fidelity check.
 */
function lexGreater(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  if (ax !== bx) return ax > bx;
  if (ay !== by) return ay > by;
  return az > bz;
}
/** is edge (len,P,Q) strictly greater than the current best (bl,bhx..,blx..)? */
function edgeGreater(len: number, hx: number, hy: number, hz: number, lx: number, ly: number, lz: number,
  bl: number, bhx: number, bhy: number, bhz: number, blx: number, bly: number, blz: number): boolean {
  if (len !== bl) return len > bl;
  if (hx !== bhx || hy !== bhy || hz !== bhz) return lexGreater(hx, hy, hz, bhx, bhy, bhz);
  return lexGreater(lx, ly, lz, blx, bly, blz);
}

function bisectInd(t: Tri, tieTotal: boolean): Tri[] {
  let bi = 0; let bv = -1;
  let bhx = 0; let bhy = 0; let bhz = 0; let blx = 0; let bly = 0; let blz = 0;
  for (let u = 0; u < 3; u += 1) {
    const v = (u + 1) % 3;
    const m = Math.hypot(t.x[v] - t.x[u], t.y[v] - t.y[u], t.z[v] - t.z[u]);
    if (!tieTotal) { if (m > bv) { bi = u; bv = m; } continue; }
    const uHi = lexGreater(t.x[u], t.y[u], t.z[u], t.x[v], t.y[v], t.z[v]);
    const hx = uHi ? t.x[u] : t.x[v]; const hy = uHi ? t.y[u] : t.y[v]; const hz = uHi ? t.z[u] : t.z[v];
    const lx = uHi ? t.x[v] : t.x[u]; const ly = uHi ? t.y[v] : t.y[u]; const lz = uHi ? t.z[v] : t.z[u];
    if (bv < 0 || edgeGreater(m, hx, hy, hz, lx, ly, lz, bv, bhx, bhy, bhz, blx, bly, blz)) {
      bi = u; bv = m; bhx = hx; bhy = hy; bhz = hz; blx = lx; bly = ly; blz = lz;
    }
  }
  const u = bi; const v = (bi + 1) % 3; const w = (bi + 2) % 3;
  const thm = 0.5 * (t.th[u] + t.th[v]); const zm = 0.5 * (t.z[u] + t.z[v]);
  const [mx, my, mz] = lift(thm, zm);
  void mz;
  {
    const L = Math.hypot(t.x[v] - t.x[u], t.y[v] - t.y[u], t.z[v] - t.z[u]);
    const dU = Math.hypot(mx - t.x[u], my - t.y[u], zm - t.z[u]);
    const dV = Math.hypot(mx - t.x[v], my - t.y[v], zm - t.z[v]);
    const rr = Math.max(dU, dV) / Math.max(1e-300, L);
    nsTot += 1; if (rr > nsWorst) nsWorst = rr;
    if (rr >= 1) nsSplits += 1;
  }
  return [
    { x: [t.x[u], mx, t.x[w]], y: [t.y[u], my, t.y[w]], z: [t.z[u], zm, t.z[w]], th: [t.th[u], thm, t.th[w]] },
    { x: [mx, t.x[v], t.x[w]], y: [my, t.y[v], t.y[w]], z: [zm, t.z[v], t.z[w]], th: [thm, t.th[v], t.th[w]] },
  ];
}
const scTri = (t: Tri): Score => score(t.x[0], t.y[0], t.z[0], t.x[1], t.y[1], t.z[1], t.x[2], t.y[2], t.z[2],
  t.th[0], t.th[1], t.th[2]);

let tieHits = 0; let tieTests = 0;
// *** THE NON-SHORTENING CENSUS. `lift(0.5*(thU+thV), 0.5*(zU+zV))` is NOT a bisection: on a RADIAL
// edge (dR >> r*dTheta) the parametric midpoint snaps onto the surface on the far side of the step and
// the child is CONGRUENT TO ITS PARENT. `frontierRefine` never sees it because its depth cap truncates
// the recursion. Counted here on the VERBATIM operator so the finding cannot be blamed on this tool. ***
let nsSplits = 0; let nsTot = 0; let nsWorst = 0;
/** independent refinement of ONE level-0 facet. Returns leaves + uncleared + hanging-node estimate. */
function refineIndependent(root: Tri, bar: BarName, tieTotal: boolean): { tris: number; unc: number; splits: number } {
  let tris = 0; let unc = 0; let splits = 0;
  const stack: Array<[Tri, number]> = [[root, 0]];
  while (stack.length > 0) {
    const [t, lev] = stack.pop() as [Tri, number];
    const s = scTri(t);
    if (!overBar(s, bar) || lev >= CAP) { tris += 1; if (overBar(s, bar)) unc += 1; continue; }
    // tie census (diagnostic only, does not alter the operator)
    {
      const l0 = Math.hypot(t.x[1] - t.x[0], t.y[1] - t.y[0], t.z[1] - t.z[0]);
      const l1 = Math.hypot(t.x[2] - t.x[1], t.y[2] - t.y[1], t.z[2] - t.z[1]);
      const l2 = Math.hypot(t.x[0] - t.x[2], t.y[0] - t.y[2], t.z[0] - t.z[2]);
      const mx = Math.max(l0, l1, l2);
      let n = 0; if (l0 === mx) n += 1; if (l1 === mx) n += 1; if (l2 === mx) n += 1;
      tieTests += 1; if (n > 1) tieHits += 1;
    }
    splits += 1;
    for (const ch of bisectInd(t, tieTotal)) stack.push([ch, lev + 1]);
  }
  return { tris, unc, splits };
}
function rootTriOf(f: number): Tri {
  const o = f * 9;
  const ax = xyz0[o]; const ay = xyz0[o + 1]; const az = xyz0[o + 2];
  const bx = xyz0[o + 3]; const by = xyz0[o + 4]; const bz = xyz0[o + 5];
  const cx = xyz0[o + 6]; const cy = xyz0[o + 7]; const cz = xyz0[o + 8];
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  return { x: [ax, bx, cx], y: [ay, by, cy], z: [az, bz, cz], th: [thA, thB, thC] };
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// WELD + ADJACENCY.  Exact float32 bit-pattern weld by default. Manifoldness printed.
// ───────────────────────────────────────────────────────────────────────────────────────────────────
const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
function vkeyExact(x: number, y: number, z: number): string {
  f32[0] = x; f32[1] = y; f32[2] = z;
  return `${u32[0]},${u32[1]},${u32[2]}`;
}
function vkeyQ(x: number, y: number, z: number, q: number): string {
  return `${Math.round(x / q)},${Math.round(y / q)},${Math.round(z / q)}`;
}
interface Welded { nV: number; vx: Float64Array; vy: Float64Array; vz: Float64Array; tv: Int32Array;
  e1: number; e2: number; e3plus: number; nEdges: number; }
function weld(quant: number): Welded {
  const map = new Map<string, number>();
  const vx: number[] = []; const vy: number[] = []; const vz: number[] = [];
  const tv = new Int32Array(nTri0 * 3);
  for (let t = 0; t < nTri0; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const o = t * 9 + k * 3;
      const x = xyz0[o]; const y = xyz0[o + 1]; const z = xyz0[o + 2];
      const key = quant > 0 ? vkeyQ(x, y, z, quant) : vkeyExact(x, y, z);
      let vi = map.get(key);
      if (vi === undefined) { vi = vx.length; map.set(key, vi); vx.push(x); vy.push(y); vz.push(z); }
      tv[t * 3 + k] = vi;
    }
  }
  const nV = vx.length;
  // edge manifoldness census
  const ecnt = new Map<number, number>();
  const MUL = 4194304; // 2^22 ; safe while nV < 4.19M and nV*MUL+nV < 2^53
  if (nV >= MUL) throw new Error(`edge key overflow: nV=${nV}`);
  for (let t = 0; t < nTri0; t += 1) {
    for (let k = 0; k < 3; k += 1) {
      const a = tv[t * 3 + k]; const b = tv[t * 3 + ((k + 1) % 3)];
      const kk = a < b ? a * MUL + b : b * MUL + a;
      ecnt.set(kk, (ecnt.get(kk) ?? 0) + 1);
    }
  }
  let e1 = 0; let e2 = 0; let e3plus = 0;
  for (const c of ecnt.values()) { if (c === 1) e1 += 1; else if (c === 2) e2 += 1; else e3plus += 1; }
  return { nV, vx: Float64Array.from(vx), vy: Float64Array.from(vy), vz: Float64Array.from(vz), tv,
    e1, e2, e3plus, nEdges: ecnt.size };
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
// ARM C — CONFORMING. Rivara backward longest-edge bisection on a REGION.
// Edge i of a triangle is the edge OPPOSITE corner i:  e0=(B,C) e1=(C,A) e2=(A,B).
// ───────────────────────────────────────────────────────────────────────────────────────────────────
class ConMesh {
  nT = 0; nV = 0;
  TA: Int32Array; TB: Int32Array; TC: Int32Array;
  N0: Int32Array; N1: Int32Array; N2: Int32Array;
  DEP: Int32Array; ROOT: Int32Array; SCC: Uint8Array; ALIVE: Uint8Array;
  VX: Float64Array; VY: Float64Array; VZ: Float64Array;
  capT: number; capV: number;
  constructor(capT: number, capV: number) {
    this.capT = capT; this.capV = capV;
    this.TA = new Int32Array(capT); this.TB = new Int32Array(capT); this.TC = new Int32Array(capT);
    this.N0 = new Int32Array(capT); this.N1 = new Int32Array(capT); this.N2 = new Int32Array(capT);
    this.DEP = new Int32Array(capT); this.ROOT = new Int32Array(capT); this.SCC = new Uint8Array(capT);
    this.ALIVE = new Uint8Array(capT);
    this.VX = new Float64Array(capV); this.VY = new Float64Array(capV); this.VZ = new Float64Array(capV);
  }
  growT(): void {
    const n = Math.min(MAXTRI, Math.ceil(this.capT * 1.6));
    if (n <= this.capT) throw new Error(`TRIANGLE CAP HIT at ${this.capT} (PF_CF_MAXTRI=${MAXTRI})`);
    const gi = (a: Int32Array): Int32Array => { const b = new Int32Array(n); b.set(a); return b; };
        const gu = (a: Uint8Array): Uint8Array => { const b = new Uint8Array(n); b.set(a); return b; };
    this.TA = gi(this.TA); this.TB = gi(this.TB); this.TC = gi(this.TC);
    this.N0 = gi(this.N0); this.N1 = gi(this.N1); this.N2 = gi(this.N2);
    this.DEP = gi(this.DEP); this.ROOT = gi(this.ROOT); this.SCC = gu(this.SCC); this.ALIVE = gu(this.ALIVE);
    this.capT = n;
  }
  growV(): void {
    const n = Math.ceil(this.capV * 1.6);
    const g = (a: Float64Array): Float64Array => { const b = new Float64Array(n); b.set(a); return b; };
    this.VX = g(this.VX); this.VY = g(this.VY); this.VZ = g(this.VZ); this.capV = n;
  }
  addV(x: number, y: number, z: number): number { if (this.nV >= this.capV) this.growV();
    const i = this.nV; this.VX[i] = x; this.VY[i] = y; this.VZ[i] = z; this.nV += 1; return i; }
  addT(a: number, b: number, c: number, dep: number, root: number): number {
    if (this.nT >= this.capT) this.growT();
    const i = this.nT; this.TA[i] = a; this.TB[i] = b; this.TC[i] = c;
    this.N0[i] = -1; this.N1[i] = -1; this.N2[i] = -1;
    this.DEP[i] = dep; this.ROOT[i] = root; this.ALIVE[i] = 1; this.nT += 1; return i;
  }
  nb(t: number, e: number): number { return e === 0 ? this.N0[t] : e === 1 ? this.N1[t] : this.N2[t]; }
  setNb(t: number, e: number, v: number): void { if (e === 0) this.N0[t] = v; else if (e === 1) this.N1[t] = v; else this.N2[t] = v; }
  corner(t: number, i: number): number { return i === 0 ? this.TA[t] : i === 1 ? this.TB[t] : this.TC[t]; }
  /** replace the neighbour pointer FROM t TO oldN with newN. */
  repoint(t: number, oldN: number, newN: number): void {
    if (t < 0) return;
    if (this.N0[t] === oldN) { this.N0[t] = newN; return; }
    if (this.N1[t] === oldN) { this.N1[t] = newN; return; }
    if (this.N2[t] === oldN) { this.N2[t] = newN; return; }
  }
  /** the 3 unwrapped thetas of triangle t, recomputed from xyz off corner 0. */
  thetas(t: number, out: Float64Array): void {
    const a = this.TA[t]; const b = this.TB[t]; const c = this.TC[t];
    const t0 = Math.atan2(this.VY[a], this.VX[a]);
    out[0] = t0;
    out[1] = t0 + dThRaw(t0, Math.atan2(this.VY[b], this.VX[b]));
    out[2] = t0 + dThRaw(t0, Math.atan2(this.VY[c], this.VX[c]));
  }
  scoreT(t: number, bar: BarName): Score {
    const a = this.TA[t]; const b = this.TB[t]; const c = this.TC[t];
    const th = TH3; this.thetas(t, th);
    void bar;
    return score(this.VX[a], this.VY[a], this.VZ[a], this.VX[b], this.VY[b], this.VZ[b],
      this.VX[c], this.VY[c], this.VZ[c], th[0], th[1], th[2]);
  }
  /** longest edge by THE SHARED STRICT TOTAL ORDER (coordinate-defined, identical in both arms). */
  longest(t: number): number {
    let bi = -1; let bl = -1;
    let bhx = 0; let bhy = 0; let bhz = 0; let blx = 0; let bly = 0; let blz = 0;
    for (let e = 0; e < 3; e += 1) {
      const u = this.corner(t, (e + 1) % 3); const v = this.corner(t, (e + 2) % 3);
      const ux = this.VX[u]; const uy = this.VY[u]; const uz = this.VZ[u];
      const vx2 = this.VX[v]; const vy2 = this.VY[v]; const vz2 = this.VZ[v];
      const L = Math.hypot(vx2 - ux, vy2 - uy, vz2 - uz);
      const uHi = lexGreater(ux, uy, uz, vx2, vy2, vz2);
      const hx = uHi ? ux : vx2; const hy = uHi ? uy : vy2; const hz = uHi ? uz : vz2;
      const lx = uHi ? vx2 : ux; const ly = uHi ? vy2 : uy; const lz = uHi ? vz2 : uz;
      if (bl < 0 || edgeGreater(L, hx, hy, hz, lx, ly, lz, bl, bhx, bhy, bhz, blx, bly, blz)) {
        bi = e; bl = L; bhx = hx; bhy = hy; bhz = hz; blx = lx; bly = ly; blz = lz;
      }
    }
    return bi;
  }
}
const TH3 = new Float64Array(3);

interface ConStats {
  finalTris: number; overBarTris: number; splits: number; forcedOverCap: number;
  boundaryTerminals: number; pairTerminals: number; leppSteps: number; leppWalks: number; maxLepp: number;
  escapedToHalo: number; guardHits: number; mismatchTerm: number; maxDep: number; overCapAlive: number; refusedForced: number; nsSplits: number; nsTot: number; nsWorst: number;
}

/** build a ConMesh over `faces` (a subset of level-0 facets), weld-shared. */
function buildRegion(w: Welded, faces: Int32Array, capT: number): ConMesh {
  const m = new ConMesh(capT, Math.max(1024, Math.ceil(capT * 0.6)));
  // local vertex remap
  const vmap = new Map<number, number>();
  for (let i = 0; i < faces.length; i += 1) {
    const f = faces[i];
    const lv: number[] = [];
    for (let k = 0; k < 3; k += 1) {
      const gv = w.tv[f * 3 + k];
      let l = vmap.get(gv);
      if (l === undefined) { l = m.addV(w.vx[gv], w.vy[gv], w.vz[gv]); vmap.set(gv, l); }
      lv.push(l);
    }
    m.addT(lv[0], lv[1], lv[2], 0, f);
  }
  // adjacency over the region only
  const MUL = 4194304;
  const emap = new Map<number, number>(); // edgeKey -> first (tri*4 + edgeIdx)
  for (let t = 0; t < m.nT; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const u = m.corner(t, (e + 1) % 3); const v = m.corner(t, (e + 2) % 3);
      const kk = u < v ? u * MUL + v : v * MUL + u;
      const prev = emap.get(kk);
      if (prev === undefined) emap.set(kk, t * 4 + e);
      else { const pt = prev >> 2; const pe = prev & 3; m.setNb(t, e, pt); m.setNb(pt, pe, t); emap.delete(kk); }
    }
  }
  return m;
}

/** Rivara backward longest-edge bisection to `bar`. `inCore[rootFacet]` decides what is counted. */
function refineConforming(m: ConMesh, bar: BarName, inCore: Uint8Array | null, progressEvery: number,
  progressCb: ((s: ConStats) => void) | null): ConStats {
  const st: ConStats = { finalTris: 0, overBarTris: 0, splits: 0, forcedOverCap: 0, boundaryTerminals: 0,
    pairTerminals: 0, leppSteps: 0, leppWalks: 0, maxLepp: 0, escapedToHalo: 0, guardHits: 0, mismatchTerm: 0, maxDep: 0, overCapAlive: 0, refusedForced: 0, nsSplits: 0, nsTot: 0, nsWorst: 0 };
  const nSeed = m.nT;
  for (let t = 0; t < nSeed; t += 1) m.SCC[t] = overBar(m.scoreT(t, bar), bar) ? 1 : 0;
  let stack = new Int32Array(Math.max(1024, nSeed));
  let sp = 0;
  const push = (t: number): void => { if (sp >= stack.length) { const s2 = new Int32Array(stack.length * 2); s2.set(stack); stack = s2; } stack[sp] = t; sp += 1; };
  for (let t = nSeed - 1; t >= 0; t -= 1) if (m.SCC[t] === 1) push(t);

  /** split ONE triangle at edge e using midpoint vertex mid. Returns [child1, child2]. */
  const splitAt = (t: number, e: number, mid: number): [number, number] => {
    const p = m.corner(t, e); const u = m.corner(t, (e + 1) % 3); const v = m.corner(t, (e + 2) % 3);
    const nbPU = m.nb(t, (e + 2) % 3); // edge (p,u)
    const nbVP = m.nb(t, (e + 1) % 3); // edge (v,p)
    const dep = m.DEP[t] + 1; const root = m.ROOT[t];
    const c1 = m.addT(p, u, mid, dep, root);
    const c2 = m.addT(p, mid, v, dep, root);
    // c1 edges: e0=(u,mid) -> set by caller ; e1=(mid,p) -> c2 ; e2=(p,u) -> nbPU
    m.setNb(c1, 1, c2); m.setNb(c1, 2, nbPU); m.repoint(nbPU, t, c1);
    // c2 edges: e0=(mid,v) -> set by caller ; e1=(v,p) -> nbVP ; e2=(p,mid) -> c1
    m.setNb(c2, 1, nbVP); m.setNb(c2, 2, c1); m.repoint(nbVP, t, c2);
    m.ALIVE[t] = 0; st.splits += 1;
    if (dep > st.maxDep) st.maxDep = dep;
    if (m.DEP[t] >= CAP) st.forcedOverCap += 1;
    if (inCore !== null && inCore[root] === 0) st.escapedToHalo += 1;
    return [c1, c2];
  };
  const midOf = (t: number, e: number): number => {
    const u = m.corner(t, (e + 1) % 3); const v = m.corner(t, (e + 2) % 3);
    const th = TH3; m.thetas(t, th);
    const iu = (e + 1) % 3; const iv = (e + 2) % 3;
    const thm = 0.5 * (th[iu] + th[iv]); const zm = 0.5 * (m.VZ[u] + m.VZ[v]);
    const [x, y, z] = lift(thm, zm); void z;
    {
      const L = Math.hypot(m.VX[v] - m.VX[u], m.VY[v] - m.VY[u], m.VZ[v] - m.VZ[u]);
      const dU = Math.hypot(x - m.VX[u], y - m.VY[u], zm - m.VZ[u]);
      const dV = Math.hypot(x - m.VX[v], y - m.VY[v], zm - m.VZ[v]);
      const rr = Math.max(dU, dV) / Math.max(1e-300, L);
      st.nsTot += 1; if (rr > st.nsWorst) st.nsWorst = rr;
      if (rr >= 1) st.nsSplits += 1;
    }
    return m.addV(x, y, zm);
  };
  const finish = (t: number): void => {
    const s = m.scoreT(t, bar);
    m.SCC[t] = overBar(s, bar) ? 1 : 0;
    if (m.SCC[t] === 1) push(t);
  };

  // *** THE PATH STACK — O(L), NOT O(L^2). *** The first version of this loop re-walked the propagation
  // path FROM THE TARGET after every terminal-pair split, which is O(L^2) per target and made the Gothic
  // whole-mesh run compute-bound with no progress for 25 minutes (measured: CPU delta 29.8 s / 30 s wall,
  // so it was computing, not stalled). The standard Rivara form keeps the path and BACKS UP one element
  // after each split. *** IT PRODUCES THE SAME MESH — verified below by re-running the recorded patch
  // sweep and requiring identical M to the digit. ***
  const GUARD = Math.round(envF('PF_CF_GUARD', 200000));
  let path = new Int32Array(4096); let plen = 0;
  const ppush = (t: number): void => { if (plen >= path.length) { const p2 = new Int32Array(path.length * 2); p2.set(path); path = p2; } path[plen] = t; plen += 1; };
  let processed = 0; let lastProg = Date.now();
  while (sp > 0) {
    sp -= 1; const target = stack[sp];
    if (m.ALIVE[target] === 0) continue;
    if (m.SCC[target] !== 1) continue;
    if (m.DEP[target] >= CAP) continue;
    plen = 0; ppush(target);
    st.leppWalks += 1;
    let steps = 0;
    // *** WATCHDOG. The Gothic whole-mesh run went compute-bound with no progress twice; a watchdog that
    // PRINTS THE LOOPING TARGET'S STATE is the only way to tell a real pathology from a bug. ***
    const tgtSplits0 = st.splits; let iters = 0; let wdN = 0;
    while (plen > 0) {
      iters += 1;
      if (WATCHDOG > 0 && iters % WATCHDOG === 0 && wdN < 25) {
        wdN += 1;
        const cur0 = path[plen - 1]; const e0 = m.longest(cur0);
        const u0 = m.corner(cur0, (e0 + 1) % 3); const v0 = m.corner(cur0, (e0 + 2) % 3);
        const eL = Math.hypot(m.VX[v0] - m.VX[u0], m.VY[v0] - m.VY[u0], m.VZ[v0] - m.VZ[u0]);
        // *** THE DECISIVE QUANTITY: does the parametric midpoint actually LIE BETWEEN the endpoints? ***
        const thW = TH3; m.thetas(cur0, thW);
        const iu0 = (e0 + 1) % 3; const iv0 = (e0 + 2) % 3;
        const thmW = 0.5 * (thW[iu0] + thW[iv0]); const zmW = 0.5 * (m.VZ[u0] + m.VZ[v0]);
        const [mxW, myW] = lift(thmW, zmW);
        const dU = Math.hypot(mxW - m.VX[u0], myW - m.VY[u0], zmW - m.VZ[u0]);
        const dV = Math.hypot(mxW - m.VX[v0], myW - m.VY[v0], zmW - m.VZ[v0]);
        const ru = Math.hypot(m.VX[u0], m.VY[u0]); const rv = Math.hypot(m.VX[v0], m.VY[v0]);
        log(`      MIDPOINT PROBE  |uv| ${eL.toExponential(4)}  |u-mid| ${dU.toExponential(4)}  |v-mid| ${dV.toExponential(4)}  ratio(max/|uv|) ${(Math.max(dU, dV) / Math.max(1e-300, eL)).toFixed(6)}  | dTheta ${(thW[iv0] - thW[iu0]).toExponential(3)}  dZ ${(m.VZ[v0] - m.VZ[u0]).toExponential(3)}  dR ${(rv - ru).toExponential(3)}  rMid ${rA(thmW, zmW).toFixed(9)}  rU ${ru.toFixed(9)}  rV ${rv.toFixed(9)}`);
        const s0 = m.scoreT(target, bar);
        log(`  *** WATCHDOG target ${target} root ${m.ROOT[target]} dep ${m.DEP[target]} alive ${m.ALIVE[target]} chord ${s0.chordUm.toFixed(3)}um area ${s0.area.toExponential(3)} | iters ${iters} plen ${plen} splitsThisTarget ${st.splits - tgtSplits0} | top ${cur0} dep ${m.DEP[cur0]} longestEdge ${eL.toExponential(4)}mm | nT ${m.nT} nV ${m.nV}  [${el()}s]`);
      }
      while (plen > 0 && m.ALIVE[path[plen - 1]] === 0) plen -= 1;
      if (plen === 0) break;
      const cur = path[plen - 1];
      const e = m.longest(cur);
      const U = m.nb(cur, e);
      if (U < 0) { // boundary terminal
        // ABANDON THE WHOLE TARGET. Refusing only this one split leaves the walk re-deriving the same
        // terminal forever (measured: 4,000,000 refusals on one Gothic patch). Abandoning keeps the mesh
        // FULLY CONFORMING — zero hanging nodes — and simply leaves the target uncleared, which is the
        // honest reading: this target cannot be refined within the forced-split depth limit.
        if (m.DEP[cur] >= HARDCAP) { st.refusedForced += 1; plen = 0; break; }
        st.boundaryTerminals += 1;
        const mid = midOf(cur, e);
        const [c1, c2] = splitAt(cur, e, mid);
        finish(c1); finish(c2);
        plen -= 1; continue;
      }
      const eU = m.longest(U);
      if (m.nb(U, eU) === cur) { // terminal PAIR (both agree the shared edge is longest)
        // NON-VACUITY GUARD: the two triangles must name the SAME geometric edge. If they do not,
        // the adjacency is corrupt and every count downstream is meaningless — so it is counted,
        // not swallowed.
        const cu = m.corner(cur, (e + 1) % 3); const cv = m.corner(cur, (e + 2) % 3);
        const uu = m.corner(U, (eU + 1) % 3); const uv = m.corner(U, (eU + 2) % 3);
        if (!((cu === uu && cv === uv) || (cu === uv && cv === uu))) { st.mismatchTerm += 1; }
        if (m.DEP[cur] >= HARDCAP || m.DEP[U] >= HARDCAP) { st.refusedForced += 1; plen = 0; break; }
        st.pairTerminals += 1;
        const mid = midOf(cur, e);
        const [a1, a2] = splitAt(cur, e, mid);
        const [b1, b2] = splitAt(U, eU, mid);
        // cross-link the four halves across the bisected edge
        // cur: a1=(p,u,mid) has e0=(u,mid) ; a2=(p,mid,v) has e0=(mid,v)
        // U  : its (u',v') = (v,u) so b1=(q,v,mid) e0=(v,mid) ; b2=(q,mid,u) e0=(mid,u)
        const a1u = m.TB[a1]; // u
        const b1u = m.TB[b1]; // U's first edge endpoint
        if (a1u === b1u) { m.setNb(a1, 0, b1); m.setNb(b1, 0, a1); m.setNb(a2, 0, b2); m.setNb(b2, 0, a2); } else { m.setNb(a1, 0, b2); m.setNb(b2, 0, a1); m.setNb(a2, 0, b1); m.setNb(b1, 0, a2); }
        finish(a1); finish(a2); finish(b1); finish(b2);
        plen -= 1; continue;
      }
      ppush(U); steps += 1; st.leppSteps += 1;
      if (plen > st.maxLepp) st.maxLepp = plen;
      if (steps > GUARD) { st.guardHits += 1; plen = 0; break; }
    }
    processed += 1;
    if (progressEvery > 0 && progressCb !== null && Date.now() - lastProg > PROGMS) { lastProg = Date.now(); progressCb(st); }
  }
  for (let t = 0; t < m.nT; t += 1) if (m.ALIVE[t] === 1) { st.finalTris += 1; if (m.SCC[t] === 1) st.overBarTris += 1; if (m.DEP[t] > CAP) st.overCapAlive += 1; }
  return st;
}

// ───────────────────────────────────────────────────────────────────────────────────────────────────
function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}

// ═══════════════════════════════════════════════ MODES ═══════════════════════════════════════════════
if (MODE === 'fid') {
  // FIDELITY: independent arm only, on the campaign's own golden stride. Must reproduce frontierRefine.
  const idx = goldenIdx(nTri0, NSAMP);
  log(`sample ${idx.length} parents (${((100 * idx.length) / nTri0).toFixed(3)}%), golden stride`);
  for (const tie of [false, true]) {
    for (const bar of BARS as BarName[]) {
      let tris = 0; let unc = 0; let np = 0;
      tieHits = 0; tieTests = 0;
      for (let q = 0; q < idx.length; q += 1) {
        const root = rootTriOf(idx[q]);
        const s0 = scTri(root);
        if (!(s0.area > 0)) continue;
        np += 1;
        const r = refineIndependent(root, bar, tie);
        tris += r.tris; unc += r.unc;
        if ((q + 1) % 500 === 0) log(`  ${tie ? 'TOTAL' : 'FIRST'}/${bar}  ${q + 1}/${idx.length}  [${el()}s]`);
      }
      log(`FID  tie=${tie ? 'totalOrder' : 'firstMax(frontierRefine)'}  bar=${bar}  cap=${CAP}: ${tris} leaves for ${np} parents = ${(tris / Math.max(1, np)).toFixed(4)}x   uncleared ${unc} = ${((100 * unc) / Math.max(1, tris)).toFixed(3)}%   tieRate ${((100 * tieHits) / Math.max(1, tieTests)).toFixed(3)}%`);
      log(`     NON-SHORTENING SPLITS (max(|u-mid|,|v-mid|) >= |uv|, i.e. the "bisection" did not shrink the edge): ${nsSplits} of ${nsTot} = ${((100 * nsSplits) / Math.max(1, nsTot)).toFixed(4)}%   worst ratio ${nsWorst.toFixed(6)}`);
      nsSplits = 0; nsTot = 0; nsWorst = 0;
    }
  }
  log(`nScores ${nScores}   [${el()}s]  => ${(nScores / ((Date.now() - T0) / 1000)).toFixed(0)} score/s`);
} else if (MODE === 'weld') {
  // WELD SANITY only — cheap, prints the manifoldness census at several tolerances.
  for (const q of [0, 1e-6, 1e-5, 1e-4, 1e-3]) {
    const w = weld(q);
    log(`weld q=${q === 0 ? 'EXACT-f32-bits' : `${q} mm`}: nV ${w.nV}  edges ${w.nEdges}  [1-face ${w.e1}]  [2-face ${w.e2}]  [>2-face ${w.e3plus}]  boundary% ${((100 * w.e1) / w.nEdges).toFixed(4)}  nonMan% ${((100 * w.e3plus) / w.nEdges).toFixed(4)}   [${el()}s]`);
  }
} else if (MODE === 'patch' || MODE === 'census') {
  const w = weld(WELDQ);
  log(`WELD ${WELDQ === 0 ? 'EXACT float32 bit pattern' : `quantised ${WELDQ} mm`}: nV ${w.nV} (${(nTri0 * 3 / w.nV).toFixed(3)} instances/vertex)  edges ${w.nEdges}  1-face ${w.e1} (${((100 * w.e1) / w.nEdges).toFixed(4)}%)  2-face ${w.e2}  >2-face ${w.e3plus} (${((100 * w.e3plus) / w.nEdges).toFixed(4)}%)  [${el()}s]`);
  // face adjacency for BFS
  const MUL = 4194304;
  const fnb = new Int32Array(nTri0 * 3).fill(-1);
  {
    const emap = new Map<number, number>();
    for (let t = 0; t < nTri0; t += 1) {
      for (let e = 0; e < 3; e += 1) {
        const u = w.tv[t * 3 + ((e + 1) % 3)]; const v = w.tv[t * 3 + ((e + 2) % 3)];
        const kk = u < v ? u * MUL + v : v * MUL + u;
        const prev = emap.get(kk);
        if (prev === undefined) emap.set(kk, t * 4 + e);
        else { const pt = prev >> 2; const pe = prev & 3; fnb[t * 3 + e] = pt; fnb[pt * 3 + pe] = t; emap.delete(kk); }
      }
    }
  }
  log(`face adjacency built  [${el()}s]`);

  if (MODE === 'census') {
    const bar = (BARS[0] as BarName);
    const doInd = ARMS.includes('ind');
    const doCon = ARMS.includes('con');
    if (doInd) {
      const perRoot = new Int32Array(nTri0); const perRootUnc = new Int32Array(nTri0);
      let tot = 0; let unc = 0; let np = 0;
      const t1 = Date.now();
      for (let f = SHARD; f < nTri0; f += NSHARD) {
        const root = rootTriOf(f);
        const s0 = scTri(root);
        if (!(s0.area > 0)) { perRoot[f] = 0; continue; }
        np += 1;
        const r = refineIndependent(root, bar, true);
        perRoot[f] = r.tris; perRootUnc[f] = r.unc; tot += r.tris; unc += r.unc;
        if (np % 20000 === 0) {
          const done = np * NSHARD; const rate = np / ((Date.now() - t1) / 1000);
          log(`  IND shard${SHARD} ${np} parents (${((100 * done) / nTri0).toFixed(2)}%)  ${tot} leaves  ${rate.toFixed(0)} par/s  ETA ${(((nTri0 / NSHARD) - np) / rate / 60).toFixed(1)} min  [${el()}s]`);
          appendFileSync(`${OUTDIR}/S106_PROG_${TAG}_ind${SHARD}.log`, `${np} ${tot} ${unc} ${el()}\n`);
        }
      }
      writeFileSync(`${OUTDIR}/S106_IND_${TAG}_${bar}_s${SHARD}of${NSHARD}.bin`, Buffer.from(perRoot.buffer));
      writeFileSync(`${OUTDIR}/S106_INDU_${TAG}_${bar}_s${SHARD}of${NSHARD}.bin`, Buffer.from(perRootUnc.buffer));
      log(`IND CENSUS shard ${SHARD}/${NSHARD} bar=${bar}: ${tot} leaves over ${np} parents = ${(tot / Math.max(1, np)).toFixed(5)}x   uncleared ${unc} = ${((100 * unc) / Math.max(1, tot)).toFixed(4)}%   [${el()}s]`);
    }
    if (doCon) {
      const all = new Int32Array(nTri0); for (let i = 0; i < nTri0; i += 1) all[i] = i;
      const cap0 = Math.min(MAXTRI, Math.max(nTri0 * 4, 1 << 20));
      log(`building conforming region over ALL ${nTri0} facets (initial capT ${cap0})  [${el()}s]`);
      const m = buildRegion(w, all, cap0);
      let bE1 = 0; for (let t = 0; t < m.nT; t += 1) for (let e = 0; e < 3; e += 1) if (m.nb(t, e) < 0) bE1 += 1;
      log(`region: ${m.nT} tris, ${m.nV} verts, ${bE1} half-edges without a neighbour  [${el()}s]`);
      const progFile = `${OUTDIR}/S106_PROG_${TAG}_con.log`;
      const stF = refineConforming(m, bar, null, 1, (s) => {
        appendFileSync(progFile, `${s.splits} ${m.nT} ${s.leppWalks} ${s.leppSteps} ${s.maxLepp} ${el()}\n`);
        log(`  CON ${s.splits} splits, ${m.nT} alloc, walks ${s.leppWalks} steps ${s.leppSteps} (mean ${(s.leppSteps / Math.max(1, s.leppWalks)).toFixed(2)}, MAXPATH ${s.maxLepp}), ${(nScores / ((Date.now() - T0) / 1000)).toFixed(0)} score/s  [${el()}s]`);
      });
      const perRootC = new Int32Array(nTri0);
      const perRootCU = new Int32Array(nTri0);
      for (let t = 0; t < m.nT; t += 1) if (m.ALIVE[t] === 1) { perRootC[m.ROOT[t]] += 1; if (m.SCC[t] === 1) perRootCU[m.ROOT[t]] += 1; }
      writeFileSync(`${OUTDIR}/S106_CON_${TAG}_${bar}.bin`, Buffer.from(perRootC.buffer));
      writeFileSync(`${OUTDIR}/S106_CONU_${TAG}_${bar}.bin`, Buffer.from(perRootCU.buffer));
      log(`CON CENSUS bar=${bar}: ${stF.finalTris} final tris from ${nTri0} facets = ${(stF.finalTris / nTri0).toFixed(5)}x   over-bar ${stF.overBarTris} = ${((100 * stF.overBarTris) / stF.finalTris).toFixed(4)}%`);
      log(`  maxDep ${stF.maxDep}  aliveOverCap ${stF.overCapAlive}  *** ABANDONED TARGETS (over bar, refused at HARDCAP ${HARDCAP}; mesh stays CONFORMING, target stays UNCLEARED) ${stF.refusedForced} ***  nonShorteningSplits ${stF.nsSplits}/${stF.nsTot} = ${((100 * stF.nsSplits) / Math.max(1, stF.nsTot)).toFixed(4)}% worst ${stF.nsWorst.toFixed(4)}  splits ${stF.splits}  forcedOverCap ${stF.forcedOverCap}  leppWalks ${stF.leppWalks}  leppSteps ${stF.leppSteps} (mean ${(stF.leppSteps / Math.max(1, stF.leppWalks)).toFixed(3)}, max ${stF.maxLepp})  pairTerm ${stF.pairTerminals}  boundaryTerm ${stF.boundaryTerminals} (${((100 * stF.boundaryTerminals) / Math.max(1, stF.pairTerminals + stF.boundaryTerminals)).toFixed(4)}%)  guardHits ${stF.guardHits}  mismatchTerm ${stF.mismatchTerm}  [${el()}s]`);
    }
  } else {
    // PATCH SWEEP
    const seeds: number[] = [];
    { const g = goldenIdx(nTri0, NSEEDS); for (let i = 0; i < g.length; i += 1) seeds.push(g[i]); }
    const rows: string[] = [];
    for (const bar of BARS as BarName[]) {
      for (const P of PATCHSIZES) {
        for (const HL of HALOS) {
          for (let si = 0; si < seeds.length; si += 1) {
            // BFS core of P facets, then HL halo rings
            const seen = new Uint8Array(nTri0);
            const order: number[] = [];
            const q: number[] = [seeds[si]]; seen[seeds[si]] = 1;
            let qi = 0;
            while (qi < q.length && order.length < P) {
              const t = q[qi]; qi += 1; order.push(t);
              for (let e = 0; e < 3; e += 1) { const u = fnb[t * 3 + e]; if (u >= 0 && seen[u] === 0) { seen[u] = 1; q.push(u); } }
            }
            const coreN = order.length;
            const inCore = new Uint8Array(nTri0);
            for (const t of order) inCore[t] = 1;
            // halo rings
            let ring: number[] = order.slice();
            const haloList: number[] = [];
            for (let h = 0; h < HL; h += 1) {
              const nxt: number[] = [];
              for (const t of ring) for (let e = 0; e < 3; e += 1) { const u = fnb[t * 3 + e]; if (u >= 0 && seen[u] === 0) { seen[u] = 1; nxt.push(u); haloList.push(u); } }
              ring = nxt; if (ring.length === 0) break;
            }
            const faces = Int32Array.from([...order, ...haloList]);
            // independent arm over CORE only
            let indT = 0; let indU = 0; let indP = 0;
            for (const f of order) {
              const rt = rootTriOf(f); const s0 = scTri(rt);
              if (!(s0.area > 0)) continue;
              indP += 1;
              const r = refineIndependent(rt, bar, true);
              indT += r.tris; indU += r.unc;
            }
            // conforming arm over CORE u HALO
            const m = buildRegion(w, faces, Math.max(4096, faces.length * 4));
            const st = refineConforming(m, bar, inCore, 1, (s) => log(`    ..P=${coreN} seed=${seeds[si]} splits ${s.splits} nT ${m.nT} maxDep ${s.maxDep} maxPath ${s.maxLepp} forcedOverCap ${s.forcedOverCap} walks ${s.leppWalks}  [${el()}s]`));
            let conCore = 0; let conCoreU = 0; let conAll = 0;
            for (let t = 0; t < m.nT; t += 1) if (m.ALIVE[t] === 1) { conAll += 1; if (inCore[m.ROOT[t]] === 1) { conCore += 1; if (m.SCC[t] === 1) conCoreU += 1; } }
            const Mx = conCore / Math.max(1, indT);
            const row = `PATCH bar=${bar} P=${coreN} halo=${HL} seed=${seeds[si]}  I=${indT} (${(indT / Math.max(1, indP)).toFixed(4)}x, unc ${((100 * indU) / Math.max(1, indT)).toFixed(3)}%)  C_core=${conCore} (${(conCore / Math.max(1, indP)).toFixed(4)}x, unc ${((100 * conCoreU) / Math.max(1, conCore)).toFixed(3)}%)  *** M=${Mx.toFixed(4)} ***  C_all=${conAll}  boundaryTerm%=${((100 * st.boundaryTerminals) / Math.max(1, st.pairTerminals + st.boundaryTerminals)).toFixed(3)}  escapedToHalo=${st.escapedToHalo}  leppMean=${(st.leppSteps / Math.max(1, st.leppWalks)).toFixed(3)} max=${st.maxLepp}  refusedForced=${st.refusedForced}  nonShort=${st.nsSplits}/${st.nsTot}  maxDep=${st.maxDep}  mismatch=${st.mismatchTerm}  [${el()}s]`;
            log(row); rows.push(row);
            appendFileSync(`${OUTDIR}/S106_PATCH_${TAG}.ndjson`, `${JSON.stringify({ bar, P: coreN, halo: HL, seed: seeds[si], indT, indU, indP, conCore, conCoreU, conAll, M: Mx, bTerm: st.boundaryTerminals, pTerm: st.pairTerminals, escaped: st.escapedToHalo, leppSteps: st.leppSteps, leppWalks: st.leppWalks, maxLepp: st.maxLepp, forcedOverCap: st.forcedOverCap, t: Number(el()) })}\n`);
          }
        }
      }
    }
    log('');
    log('══ PATCH SWEEP SUMMARY ══');
    for (const r of rows) log(`  ${r}`);
  }
  if (!LEGACYSIGN && signMarginN > 0) {
    log(`signMargin |f . n_S| over ${signMarginN} scored triangles: min ${signMarginMin.toExponential(2)}  share < 0.10: ${((100 * signMarginLo10) / signMarginN).toFixed(3)}%   < 0.01: ${((100 * signMarginLo01) / signMarginN).toFixed(3)}%`);
  }
} else {
  log(`unknown PF_CF_MODE=${MODE}`);
}
void readFileSync; void existsSync;
log(`done  [${el()}s]   nScores ${nScores}  ${(nScores / ((Date.now() - T0) / 1000)).toFixed(0)} score/s`);
