// s95WallCensus.ts — W1 (characterise the near-vertical class BY AREA) + W2 (why the lift folds,
// exactly) + W4-A (price a different LIFT), on the committed STLs, read-only.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE SCREEN ALREADY SAID, AND WHY THIS RUN EXISTS.
// `s95WallShare.cjs` / `s95WallFold.cjs` re-read S93's own 60,000-facet NDJSON and found:
//     whole-mesh max BETA :  Voronoi 76.22 deg  |  GothicArches 85.73 deg   <-- GOTHIC IS STEEPER
//     mesh AREA at beta>=80: Voronoi  0.00%     |  GothicArches  4.24%
// Gothic is the mesh LEPP closes at 6.67x / 0.00% uncleared. So "near-vertical wall" as a STATIC
// property of the surface CANNOT be what breaks Voronoi's refinement. Two things are still on the
// table and this file measures both EXACTLY rather than by the NDJSON's one-point proxies:
//   * BETA itself was a CENTROID sample there (five instrument defects in this project are exactly
//     that shape). Here it is a COVERING quantity over the same k=8 lattice, for zero extra rA evals.
//   * the FOLD was a proxy `phi = 2*dr*sin(beta)/h_min`. Here every sampled facet's THREE edges are
//     actually bisected, actually lifted, and the children's signed areas actually measured.
//
// ── PRE-REGISTERED HYPOTHESES AND KILL LINES (written before the first run) ────────────────────────
//
//  W1  H-W1 "near-vertical wall is the missing majority". Define BETA = angle(surface normal, radial)
//      = atan(hypot(r_theta/r, r_z)) -- for a radial graph n ~ R*(1, -R_th/R, -R_z) so this is exact,
//      not a heuristic. Covering: BETAmax = sup over the k=8 lattice, BETAmean = lattice mean.
//      *** KILL: if facets with BETAmean >= 60deg hold < 40% of Voronoi's over-bar CHORD AREA, H-W1
//      is REFUTED and the near-vertical class is not the missing ~88%. ***
//      CONTROL: the same class must hold materially LESS of Gothic's over-bar area, or the covariate
//      is not discriminating. (The screen already says it does NOT: 41.9% vs 18.4%, but Gothic's
//      surface is the steeper one -- so report both and let the reader see the tension.)
//
//  W2  H-W2 "the radial lift folds the child because the displacement is IN-PLANE". The derivation,
//      which is the whole answer if it survives:
//        liftAt puts the new vertex at r = rA(theta_m, z_m). Its displacement from the 3-D chord
//        midpoint is PURELY RADIAL, magnitude delta. On a wall at angle BETA the radial direction
//        makes angle BETA with the FACET normal, so
//            delta_perp = delta*cos(BETA)     delta_par = delta*sin(BETA)
//            *** dPar/dPerp = tan(BETA) EXACTLY *** (S82 measured dPar/dPerp p50 = 7.01 => BETA ~ 82deg)
//        Bisecting AB at M0, child (A,M,C) degenerates when M reaches line AC, and
//        dist(M0, AC) = 1/2 * (altitude from B). So the child INVERTS once
//            delta * sin(BETA) > 1/2 * h_min      h_min = 2*Area/diam
//            *** delta_crit = h_min / (2 sin BETA)  --  THE ANSWER TO "as a function of wall angle" ***
//      *** KILL 1 (the identity): if the measured p50 of |dPar/dPerp| / tan(BETAcen) is outside
//      [0.8, 1.25], the "displacement is purely radial" premise is wrong and the derivation is void.
//      *** KILL 2 (the predictor): if `phi = 2*delta*sin(BETA)/h_min >= 1` does not separate ACTUAL
//      folds with recall >= 0.7 AND precision >= 0.5, phi is not the mechanism, only a correlate. ***
//
//  W4A "a different LIFT removes the fold at a bounded price". ARM: instead of r = rA(theta_m, z_m)
//      (radial), place the new vertex at the point of the SURFACE NEAREST the 3-D chord midpoint --
//      i.e. project along the SURFACE normal, not along the radius. It is EDGE-INTRINSIC (depends only
//      on A and B), so it is CONFORMING; and it is still exactly on the surface, so it needs NO
//      representation change and NO off-surface vertex -- `addV`'s (theta, z) contract still holds,
//      the parameters just are not the midpoint's.
//      *** KILL: if the actual fold COUNT does not fall by >= 5x on Voronoi, the different lift is not
//      the minimal change and W4 must move to the region/primitive candidates. ***
//      COST is reported in rA evals per edge, measured, not modelled.
//
// ── INSTRUMENT DISCIPLINE ─────────────────────────────────────────────────────────────────────────
//  * orientation = `orientRuler.orientOfFacet` (k=8, inset 0.02) — THE SHIPPED COVERING RULER, taken
//    AFTER commit 5698d023 (the `outward` sign now comes from the analytic surface normal, not from
//    the XY-vanishing heuristic). `signMargin` is recorded per facet and its distribution printed:
//    a facet with a small margin has a reported angle that is a coin toss. Convention is stated on
//    every table. Shares are NOT invariant across conventions (5698d023 measured 0.079% of count at a
//    5deg bar) — small, real, not zero.
//  * COUNT and AREA on every row. AREA is the verdict; count over-states defect area 13-184x here.
//  * BOTH currencies: CHORD `2 sin(normRad/2)*diam > 10 um` and ANGLE `normDeg > 1 deg`.
//  * every sup is a LATTICE max => a LOWER bound on the true sup. Said once.
//  * FOLD is measured in the PARENT'S OWN PLANE by signed area against the parent's normal — a 3-D
//    test, not `signedAreaParam` on (theta,z) (§5.4: the shipped guard is in the wrong space).
//
// Usage: bash research/tools/run-s95-wall-census.sh
//   env: PF_S95_UNIT=w1|w2  PF_S95_STYLE  PF_S95_STL  PF_S95_TAG  PF_S95_N  PF_S95_K  PF_S95_H/RB/RT
// ══════════════════════════════════════════════════════════════════════════════════════════════════
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormalsCentral } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const UNIT = process.env.PF_S95_UNIT ?? 'w1';
const STYLE = process.env.PF_S95_STYLE ?? 'Voronoi';
const STL = process.env.PF_S95_STL ?? 'research/exchange/_strataConformBisect/voronoi_ring_D--.stl';
const TAG = process.env.PF_S95_TAG ?? 'VOR_D';
const NSAMP = Math.round(envF('PF_S95_N', 30000));
const K = Math.round(envF('PF_S95_K', 8));
const INSET = envF('PF_S95_INSET', 0.02);
const BAR_UM = envF('PF_S95_BAR_UM', 10);
const ANG_BAR = envF('PF_S95_ANG_BAR', 1.0);
const DIMS: StyleDims = { H: envF('PF_S95_H', 120), Rb: envF('PF_S95_RB', 40), Rt: envF('PF_S95_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s95';
mkdirSync(OUTDIR, { recursive: true });

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
let RA_EVALS = 0;
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => {
  RA_EVALS += 1;
  return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
};

log('===== S95 WALL CENSUS =====');
log(`unit ${UNIT}   style ${STYLE}   tag ${TAG}`);
log(`STL ${STL}`);
log(`covering k=${K} inset=${INSET} (${((K + 1) * (K + 2)) / 2} pts/facet)   bars: chord ${BAR_UM} um / angle ${ANG_BAR} deg`);
log('ORIENTATION RULER: orientRuler.orientOfFacet, convention OUTWARD, build AFTER 5698d023 (sign from');
log('  the analytic surface normal). signMargin recorded per facet.');

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`mesh ${nTri} facets   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

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
log(`sample ${NS} facets (${((100 * NS) / nTri).toFixed(3)}% coverage), golden stride`);

const HARC = 2e-4; const HZ = 2e-4;
const nsCentral = fdNormalsCentral(rA, H, HARC, HZ);
const scratch12 = new Float64Array(12);

/** surface point + unit normal + slope components at (th, z). 5 rA evals. */
function surfAt(th: number, z: number, out: Float64Array): void {
  const r0 = rA(th, z);
  const hTh = HARC / Math.max(1e-9, Math.abs(r0));
  const rP = rA(th + hTh, z); const rM = rA(th - hTh, z);
  let zLo = z - HZ; let zHi = z + HZ;
  if (zLo < 0) { zLo = 0; zHi = Math.min(H, 2 * HZ); }
  if (zHi > H) { zHi = H; zLo = Math.max(0, H - 2 * HZ); }
  const rZp = rA(th, zHi); const rZm = rA(th, zLo);
  const rt = (rP - rM) / (2 * hTh);
  const rz = zHi > zLo ? (rZp - rZm) / (zHi - zLo) : 0;
  const c = Math.cos(th); const s = Math.sin(th);
  let vx = rt * s + r0 * c; let vy = r0 * s - rt * c; let vz = -r0 * rz;
  const L = Math.hypot(vx, vy, vz) || 1;
  out[0] = r0 * c; out[1] = r0 * s; out[2] = z;         // position
  out[3] = vx / L; out[4] = vy / L; out[5] = vz / L;    // unit normal
  out[6] = rt / Math.max(1e-12, r0); out[7] = rz;       // slopeTh, slopeZ
  out[8] = r0;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNIT w1 — the class census
// ══════════════════════════════════════════════════════════════════════════════════════════════════
if (UNIT === 'w1') {
  const LP = ((K + 1) * (K + 2)) / 2;
  const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
  { const sh = 1 - INSET; const sc = INSET / 3; let q = 0;
    for (let i = 0; i <= K; i += 1) for (let j = 0; i + j <= K; j += 1) {
      wA[q] = sh * (i / K) + sc; wB[q] = sh * (j / K) + sc; wC[q] = 1 - wA[q] - wB[q]; q += 1; } }

  const NDJ = `${OUTDIR}/S95_W1_${TAG}.ndjson`;
  writeFileSync(NDJ, '');
  let buf = '';
  const rows: { ar: number; dm: number; ma: number; nd: number; tu: number; sm: number;
    bmax: number; bmean: number; bcen: number; bth: number; bz: number; dr: number }[] = [];
  const sf = new Float64Array(9);

  for (let q = 0; q < NS; q += 1) {
    const o = idx[q] * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    const eA = Math.hypot(bx - cx, by - cy, bz - cz);
    const eB = Math.hypot(ax - cx, ay - cy, az - cz);
    const eC = Math.hypot(ax - bx, ay - by, az - bz);
    const diam = Math.max(eA, eB, eC);
    const gx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const gy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const gz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const area = 0.5 * Math.hypot(gx, gy, gz);
    if (!(area > 0)) continue;
    const s1 = Math.min(eA, eB, eC); const s3 = diam; const s2 = eA + eB + eC - s1 - s3;
    const cosMin = (s2 * s2 + s3 * s3 - s1 * s1) / Math.max(1e-300, 2 * s2 * s3);
    const minAng = (Math.acos(Math.max(-1, Math.min(1, cosMin))) * 180) / Math.PI;

    const thA = Math.atan2(ay, ax);
    const thB = thA + dThRaw(thA, Math.atan2(by, bx));
    const thC = thA + dThRaw(thA, Math.atan2(cy, cx));

    // ── THE SHIPPED RULER (post-fix), with its sign margin ──
    const R = orientOfFacet(nsCentral, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
      { k: K, inset: INSET, orient: 'outward', scratch: scratch12 });

    // ── COVERING BETA: at every lattice point, the angle between the SURFACE normal and rhat.
    //    Zero extra rA evals beyond the lattice we must walk anyway.
    let bmax = 0; let bsum = 0; let drMax = 0; let n = 0;
    let bthCen = 0; let bzCen = 0; let bcen = 0;
    for (let p = 0; p < LP; p += 1) {
      const th = wA[p] * thA + wB[p] * thB + wC[p] * thC;
      const zz = wA[p] * az + wB[p] * bz + wC[p] * cz;
      surfAt(th, zz, sf);
      const slope = Math.hypot(sf[6], sf[7]);
      const bb = (Math.atan(slope) * 180) / Math.PI;
      if (bb > bmax) bmax = bb;
      bsum += bb; n += 1;
      // radial facet-to-surface deviation at this lattice point
      const px = wA[p] * ax + wB[p] * bx + wC[p] * cx;
      const py = wA[p] * ay + wB[p] * by + wC[p] * cy;
      const dRad = Math.abs(Math.hypot(px, py) - sf[8]);
      if (dRad > drMax) drMax = dRad;
    }
    { const th = (thA + thB + thC) / 3; const zz = (az + bz + cz) / 3;
      surfAt(th, zz, sf);
      bthCen = (Math.atan(Math.abs(sf[6])) * 180) / Math.PI;
      bzCen = (Math.atan(Math.abs(sf[7])) * 180) / Math.PI;
      bcen = (Math.atan(Math.hypot(sf[6], sf[7])) * 180) / Math.PI; }

    const rec = { ar: area, dm: diam, ma: minAng, nd: R.normDeg, tu: R.tangMm * 1000,
      sm: R.signMargin, bmax, bmean: bsum / Math.max(1, n), bcen, bth: bthCen, bz: bzCen, dr: drMax * 1000 };
    rows.push(rec);
    buf += `${JSON.stringify({ i: idx[q], ...rec })}\n`;
    if (rows.length % 2000 === 0) { appendFileSync(NDJ, buf); buf = ''; log(`  ${rows.length}/${NS}  [${((Date.now() - T0) / 1000).toFixed(1)}s]`); }
  }
  if (buf.length > 0) appendFileSync(NDJ, buf);

  const areaAll = rows.reduce((s, r) => s + r.ar, 0);
  const awq = (rs: typeof rows, val: (r: typeof rows[0]) => number, ps: number[]): number[] => {
    const arr = rs.map((r) => [val(r), r.ar] as [number, number]).filter((x) => Number.isFinite(x[0]));
    if (arr.length === 0) return ps.map(() => NaN);
    arr.sort((a, b) => a[0] - b[0]);
    const tot = arr.reduce((s, x) => s + x[1], 0);
    const out: number[] = []; let i = 0; let acc = 0;
    for (const p of ps) { const t = p * tot; while (i < arr.length && acc + arr[i][1] < t) { acc += arr[i][1]; i += 1; } out.push(arr[Math.min(i, arr.length - 1)][0]); }
    return out;
  };
  const P = [0.05, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0];
  const fq = (v: number[], d = 2): string => v.map((x) => x.toFixed(d).padStart(7)).join(' ');

  log('');
  log('='.repeat(112));
  log(`  ${STYLE} / ${TAG}   ${rows.length} facets of ${nTri}   rA evals ${RA_EVALS}`);
  log('='.repeat(112));
  log(`  signMargin (post-fix, |f . n_S(centroid)|) area-wt p05/25/50/75/90/99/max : ${fq(awq(rows, (r) => r.sm, P), 4)}`);
  { let c = 0; let a = 0; for (const r of rows) if (r.sm < 0.10) { c += 1; a += r.ar; }
    log(`  *** facets whose sign decided on a margin < 0.10: ${c} (${((100 * c) / rows.length).toFixed(3)}% of count, ${((100 * a) / areaAll).toFixed(4)}% of AREA) — their reported angle is a coin toss ***`); }
  log(`  BETAmax  (lattice sup)  area-wt : ${fq(awq(rows, (r) => r.bmax, P))}`);
  log(`  BETAmean (lattice mean) area-wt : ${fq(awq(rows, (r) => r.bmean, P))}`);
  log(`  BETAcen  (ONE point — the S93 proxy) area-wt : ${fq(awq(rows, (r) => r.bcen, P))}`);
  { const num = rows.filter((r) => r.bcen > 1e-6);
    log(`  *** covering-vs-centroid: BETAmean/BETAcen area-wt p05/50/95 = ${fq(awq(num, (r) => r.bmean / r.bcen, [0.05, 0.5, 0.95]), 3)}   BETAmax/BETAcen = ${fq(awq(num, (r) => r.bmax / r.bcen, [0.05, 0.5, 0.95]), 3)} ***`); }

  for (const CUR of [
    { name: `CHORD > ${BAR_UM} um`, over: (r: typeof rows[0]) => r.tu > BAR_UM },
    { name: `ANGLE > ${ANG_BAR} deg`, over: (r: typeof rows[0]) => r.nd > ANG_BAR },
  ]) {
    const over = rows.filter((r) => Number.isFinite(r.nd) && CUR.over(r));
    const aOver = over.reduce((s, r) => s + r.ar, 0);
    log('');
    log(`  ── ${CUR.name}:  COUNT ${over.length}/${rows.length} = ${((100 * over.length) / rows.length).toFixed(2)}%   AREA ${((100 * aOver) / areaAll).toFixed(3)}%`);
    const row = (label: string, pred: (r: typeof rows[0]) => boolean): void => {
      let c = 0; let a = 0; for (const r of over) if (pred(r)) { c += 1; a += r.ar; }
      let aAll = 0; for (const r of rows) if (Number.isFinite(r.nd) && pred(r)) aAll += r.ar;
      const dS = a / Math.max(1e-30, aOver); const pS = aAll / Math.max(1e-30, areaAll);
      log(`      ${label.padEnd(44)} cnt ${String(c).padStart(6)} (${((100 * c) / Math.max(1, over.length)).toFixed(1).padStart(5)}%)  defAREA ${(100 * dS).toFixed(2).padStart(6)}%  popAREA ${(100 * pS).toFixed(2).padStart(6)}%  ENRICH ${pS > 0 ? (dS / pS).toFixed(2) : '  -  '}`);
    };
    log('      ── BETAmean (covering) — CUMULATIVE ──');
    for (const b of [15, 30, 45, 60, 75, 85]) row(`BETAmean >= ${b}deg`, (r) => r.bmean >= b);
    log('      ── BETAmax (covering sup) — CUMULATIVE ──');
    for (const b of [15, 30, 45, 60, 75, 85]) row(`BETAmax  >= ${b}deg`, (r) => r.bmax >= b);
    log('      ── direction of the wall (BETAmean>=60) ──');
    row('BETAmean>=60 AND azimuthal-dom (bth > bz)', (r) => r.bmean >= 60 && r.bth > r.bz);
    row('BETAmean>=60 AND axial-dom     (bz >= bth)', (r) => r.bmean >= 60 && r.bz >= r.bth);
    log(`      area-wt BETAmean over the DEFECT : ${fq(awq(over, (r) => r.bmean, P))}`);
    log(`      area-wt BETAmean over WHOLE MESH : ${fq(awq(rows, (r) => r.bmean, P))}`);
  }
  writeFileSync(`${OUTDIR}/S95_W1_${TAG}.done`, `${new Date().toISOString()}\n`);
  log(`\nNDJSON ${NDJ}   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNIT w3 — IS A VORONOI CELL WALL THE OBJECT `src/geometry/doubleValued/` WAS BUILT FOR?
//
// That machinery's ENTRY CONTRACT is a `CliffComplexLike`: DECLARED polylines in (u,t) at which the
// radius is TWO-VALUED (`lipsAt(s) -> {upper, lower}`), which it CDT-constrains, splits per region,
// and bridges with flat wall quads. So the question is not aesthetic, it is a measurable property of
// `rA`: *** does the Voronoi radius have a JUMP (a cliff) or a KINK (C0) anywhere, or is it a
// bounded-slope C1 ramp? ***
//
// PRE-REGISTERED. Walk a dense (theta, z) grid; at each point take the ARC-LENGTH one-sided slopes
// at four halvings h = 1e-2 .. 1e-5 mm.
//   * a CLIFF  => |slope| ~ jump/h  DIVERGES as h halves (x2 per halving).
//   * a KINK (C0, not C1) => |slope| stays BOUNDED but the two one-sided slopes DISAGREE by a fixed
//     amount as h -> 0.
//   * a C1 ramp => bounded AND the one-sided slopes converge together.
// *** KILL: if max|slope| grows by >= 1.7x per halving over the last two halvings, Voronoi HAS a
// cliff and the doubleValued/curtain machinery is the right object. If it is flat AND the one-sided
// gap -> 0, it does NOT and W3 is a "no". ***
// ══════════════════════════════════════════════════════════════════════════════════════════════════
if (UNIT === 'w3') {
  const NG = Math.round(envF('PF_S95_NG', 400));
  const HS = [1e-2, 1e-3, 1e-4, 1e-5];
  log('');
  log(`── C0/C1 SCAN of rA for ${STYLE}: ${NG}x${NG} = ${NG * NG} probe points, 4 arclength halvings ──`);
  log('   slope is d r / d(arclength):  theta-direction uses h/r radians so both are per-mm.');
  const maxSlopeTh = new Array<number>(HS.length).fill(0);
  const maxSlopeZ = new Array<number>(HS.length).fill(0);
  const maxGapTh = new Array<number>(HS.length).fill(0);
  const maxGapZ = new Array<number>(HS.length).fill(0);
  let maxJump = 0; let maxJumpAt = '';
  for (let a = 0; a < NG; a += 1) {
    const th = (2 * Math.PI * (a + 0.5)) / NG;
    for (let b = 0; b < NG; b += 1) {
      const z = (H * (b + 0.5)) / NG;
      const r0 = rA(th, z);
      for (let e = 0; e < HS.length; e += 1) {
        const h = HS[e];
        const hTh = h / Math.max(1e-9, r0);
        const rp = rA(th + hTh, z); const rm = rA(th - hTh, z);
        const zp = Math.min(H, z + h); const zm = Math.max(0, z - h);
        const rzp = rA(th, zp); const rzm = rA(th, zm);
        const fTh = (rp - r0) / h; const bTh = (r0 - rm) / h;
        const fZ = zp > z ? (rzp - r0) / (zp - z) : 0; const bZ = z > zm ? (r0 - rzm) / (z - zm) : 0;
        if (Math.abs(fTh) > maxSlopeTh[e]) maxSlopeTh[e] = Math.abs(fTh);
        if (Math.abs(bTh) > maxSlopeTh[e]) maxSlopeTh[e] = Math.abs(bTh);
        if (Math.abs(fZ) > maxSlopeZ[e]) maxSlopeZ[e] = Math.abs(fZ);
        if (Math.abs(bZ) > maxSlopeZ[e]) maxSlopeZ[e] = Math.abs(bZ);
        if (Math.abs(fTh - bTh) > maxGapTh[e]) maxGapTh[e] = Math.abs(fTh - bTh);
        if (Math.abs(fZ - bZ) > maxGapZ[e]) maxGapZ[e] = Math.abs(fZ - bZ);
        if (e === HS.length - 1) {
          const j = Math.max(Math.abs(rp - rm), Math.abs(rzp - rzm));
          if (j > maxJump) { maxJump = j; maxJumpAt = `th=${th.toFixed(5)} z=${z.toFixed(4)}`; }
        }
      }
    }
  }
  log('');
  log('   h (mm)     max|dr/ds| theta   ratio     max|dr/ds| z    ratio    max one-sided GAP th / z');
  for (let e = 0; e < HS.length; e += 1) {
    const rt = e > 0 ? maxSlopeTh[e] / Math.max(1e-30, maxSlopeTh[e - 1]) : NaN;
    const rz = e > 0 ? maxSlopeZ[e] / Math.max(1e-30, maxSlopeZ[e - 1]) : NaN;
    log(`   ${HS[e].toExponential(0).padStart(8)}   ${maxSlopeTh[e].toFixed(5).padStart(15)}  ${(Number.isFinite(rt) ? rt.toFixed(4) : '  -  ').padStart(7)}  ${maxSlopeZ[e].toFixed(5).padStart(14)}  ${(Number.isFinite(rz) ? rz.toFixed(4) : '  -  ').padStart(7)}   ${maxGapTh[e].toExponential(3)} / ${maxGapZ[e].toExponential(3)}`);
  }
  const gr = Math.max(maxSlopeTh[3] / Math.max(1e-30, maxSlopeTh[2]), maxSlopeZ[3] / Math.max(1e-30, maxSlopeZ[2]));
  log('');
  log(`   *** growth over the LAST halving = ${gr.toFixed(4)}   KILL if >= 1.7 (a cliff) -> ${gr >= 1.7 ? 'CLIFF PRESENT — doubleValued applies' : 'NO CLIFF — bounded-slope ramp'} ***`);
  log(`   max |r(+h) - r(-h)| at h=1e-5 mm = ${maxJump.toExponential(4)} mm  at ${maxJumpAt}`);
  log(`   one-sided slope gap at h=1e-5: theta ${maxGapTh[3].toExponential(3)}  z ${maxGapZ[3].toExponential(3)}   (a KINK would hold a FIXED nonzero gap)`);
  log(`   rA evals ${RA_EVALS}   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
  writeFileSync(`${OUTDIR}/S95_W3_${TAG}.done`, `${new Date().toISOString()}\n`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// UNIT w2 — WHY THE LIFT FOLDS, EXACTLY  (+ the W4-A alternative lift, same edges, same budget)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
if (UNIT === 'w2') {
  const KC = Math.round(envF('PF_S95_KC', 4));                 // covering order for CHILD orientation
  const LPC = ((KC + 1) * (KC + 2)) / 2;
  const cwA = new Float64Array(LPC); const cwB = new Float64Array(LPC); const cwC = new Float64Array(LPC);
  { const sh = 1 - INSET; const sc = INSET / 3; let q = 0;
    for (let i = 0; i <= KC; i += 1) for (let j = 0; i + j <= KC; j += 1) {
      cwA[q] = sh * (i / KC) + sc; cwB[q] = sh * (j / KC) + sc; cwC[q] = 1 - cwA[q] - cwB[q]; q += 1; } }

  const sf = new Float64Array(9); const sf2 = new Float64Array(9);

  /**
   * NEAREST POINT ON THE SURFACE to a 3-D target, by Gauss-Newton in (theta, z) from a start guess.
   * Returns [th, z, dist]. Edge-intrinsic when the target is the 3-D chord midpoint, hence CONFORMING.
   */
  function nearestOnSurface(tx: number, ty: number, tz: number, th0: number, z0: number): [number, number, number] {
    let th = th0; let z = z0;
    let best = Infinity; let bth = th0; let bz = z0;
    for (let it = 0; it < 12; it += 1) {
      surfAt(th, z, sf);
      const dx = sf[0] - tx; const dy = sf[1] - ty; const dz = sf[2] - tz;
      const d = Math.hypot(dx, dy, dz);
      if (d < best) { best = d; bth = th; bz = z; }
      // tangents in the (theta, z) chart:  X_th = (r_th*c - r*s, r_th*s + r*c, 0), X_z = (r_z*c, r_z*s, 1)
      const r0 = sf[8]; const rt = sf[6] * r0; const rz = sf[7];
      const c = Math.cos(th); const s = Math.sin(th);
      const t1x = rt * c - r0 * s; const t1y = rt * s + r0 * c; const t1z = 0;
      const t2x = rz * c; const t2y = rz * s; const t2z = 1;
      // Gauss-Newton on f(th,z) = |X - T|^2 :  J^T J p = -J^T d
      const a11 = t1x * t1x + t1y * t1y + t1z * t1z;
      const a12 = t1x * t2x + t1y * t2y + t1z * t2z;
      const a22 = t2x * t2x + t2y * t2y + t2z * t2z;
      const b1 = -(t1x * dx + t1y * dy + t1z * dz);
      const b2 = -(t2x * dx + t2y * dy + t2z * dz);
      const det = a11 * a22 - a12 * a12;
      if (!(Math.abs(det) > 1e-18)) break;
      let pth = (b1 * a22 - b2 * a12) / det;
      let pz = (a11 * b2 - a12 * b1) / det;
      // damped: never step more than a quarter of the local feature scale
      const stepArc = Math.hypot(pth * r0, pz);
      const cap = 0.25 * Math.max(1e-4, d + 1e-3);
      if (stepArc > cap) { const f = cap / stepArc; pth *= f; pz *= f; }
      th += pth; z += pz;
      if (z < 0) z = 0; if (z > H) z = H;
      if (Math.hypot(pth * r0, pz) < 1e-9) break;
    }
    surfAt(th, z, sf);
    const d = Math.hypot(sf[0] - tx, sf[1] - ty, sf[2] - tz);
    if (d < best) { best = d; bth = th; bz = z; }
    return [bth, bz, best];
  }

  /** covering orientation (normRad, tangMm) of an arbitrary triangle given its unwrapped thetas */
  function childOrient(px: number[], pth: number[]): { normDeg: number; tangUm: number } {
    // (B-A) x (C-A). *** fx was (Bx-Ax)(Cz-Az) here on the first run — a wrong component — which
    // produced a physically impossible 15.5% fold rate at delta/h = 1.7e-3 and was caught by reading
    // the printed value, not the verdict. Do not "simplify" these three lines. ***
    let fx = (px[4] - px[1]) * (px[8] - px[2]) - (px[5] - px[2]) * (px[7] - px[1]);
    let fy = (px[5] - px[2]) * (px[6] - px[0]) - (px[3] - px[0]) * (px[8] - px[2]);
    let fz = (px[3] - px[0]) * (px[7] - px[1]) - (px[4] - px[1]) * (px[6] - px[0]);
    const fl = Math.hypot(fx, fy, fz);
    if (!(fl > 0)) return { normDeg: NaN, tangUm: NaN };
    fx /= fl; fy /= fl; fz /= fl;
    const dm = Math.max(
      Math.hypot(px[3] - px[6], px[4] - px[7], px[5] - px[8]),
      Math.hypot(px[0] - px[6], px[1] - px[7], px[2] - px[8]),
      Math.hypot(px[0] - px[3], px[1] - px[4], px[2] - px[5]));
    let best = -1;
    for (let p = 0; p < LPC; p += 1) {
      const th = cwA[p] * pth[0] + cwB[p] * pth[1] + cwC[p] * pth[2];
      const zz = cwA[p] * px[2] + cwB[p] * px[5] + cwC[p] * px[8];
      surfAt(th, zz, sf2);
      let d = fx * sf2[3] + fy * sf2[4] + fz * sf2[5];
      d = d > 1 ? 1 : d < -1 ? -1 : d;
      const a = Math.acos(d);
      if (a > best) best = a;
    }
    // NO min(best, pi-best) and NO 'outward' re-signing: the child keeps the PARENT'S winding, so a
    // FOLDED child must be allowed to read > 90 deg. Folding it back would hide the very defect.
    return { normDeg: (best * 180) / Math.PI, tangUm: 2 * Math.sin(0.5 * Math.min(best, Math.PI - 1e-12)) * dm * 1000 };
  }

  const NDJ = `${OUTDIR}/S95_W2_${TAG}.ndjson`;
  writeFileSync(NDJ, '');
  let buf = '';
  type ER = { ar: number; hmin: number; beta: number; dPar: number; dPerp: number; delta: number;
    phi: number; phiApex: number; dEdge: number; dApex: number;
    foldR: 0 | 1; foldN: 0 | 1; dNN: number; ndR: number; ndN: number;
    tuR: number; tuN: number; evR: number; evN: number; moveNN: number; perpN: number };
  const E: ER[] = [];
  let done = 0;

  for (let q = 0; q < NS; q += 1) {
    const o = idx[q] * 9;
    const V = [xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8]];
    // (B-A) x (C-A). See the note in childOrient: fx had the wrong component on the first run.
    let fx = (V[4] - V[1]) * (V[8] - V[2]) - (V[5] - V[2]) * (V[7] - V[1]);
    let fy = (V[5] - V[2]) * (V[6] - V[0]) - (V[3] - V[0]) * (V[8] - V[2]);
    let fz = (V[3] - V[0]) * (V[7] - V[1]) - (V[4] - V[1]) * (V[6] - V[0]);
    const fl = Math.hypot(fx, fy, fz);
    if (!(fl > 0)) continue;
    const area = 0.5 * fl; fx /= fl; fy /= fl; fz /= fl;
    const th0 = Math.atan2(V[1], V[0]);
    const TH = [th0, th0 + dThRaw(th0, Math.atan2(V[4], V[3])), th0 + dThRaw(th0, Math.atan2(V[7], V[6]))];

    // for each edge (i,j) with opposite vertex k
    for (const [i, j, k] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]] as const) {
      const Ax = V[3 * i]; const Ay = V[3 * i + 1]; const Az = V[3 * i + 2];
      const Bx = V[3 * j]; const By = V[3 * j + 1]; const Bz = V[3 * j + 2];
      const Cx = V[3 * k]; const Cy = V[3 * k + 1]; const Cz = V[3 * k + 2];
      const mx = 0.5 * (Ax + Bx); const my = 0.5 * (Ay + By); const mz = 0.5 * (Az + Bz);
      const thM = 0.5 * (TH[i] + TH[j]); const zM = 0.5 * (Az + Bz);

      // ── ARM R: the mesher's radial lift, r = rA(theta_m, z_m) ──
      const ev0 = RA_EVALS;
      surfAt(thM, zM, sf);
      const Rx = sf[0]; const Ry = sf[1]; const Rz = sf[2];
      const betaLoc = (Math.atan(Math.hypot(sf[6], sf[7])) * 180) / Math.PI;
      const evR = RA_EVALS - ev0;

      // ── ARM N: nearest point on the surface to the 3-D chord midpoint (edge-intrinsic) ──
      const ev1 = RA_EVALS;
      const [thN, zN, dNN] = nearestOnSurface(mx, my, mz, thM, zM);
      surfAt(thN, zN, sf);
      const Nx = sf[0]; const Ny = sf[1]; const Nz = sf[2];
      const evN = RA_EVALS - ev1;
      const moveNN = Math.hypot(Nx - Rx, Ny - Ry, Nz - Rz);
      // SOUNDNESS OF THE PROJECTION: at a true nearest point the residual is PARALLEL to the surface
      // normal, so |cos| must be ~1. If it is not, the Gauss-Newton did not converge and every ARM-N
      // number below is a reading of an unconverged solver, not of a projection.
      const rlen = Math.max(1e-30, dNN);
      const perpN = Math.abs(((mx - Nx) * sf[3] + (my - Ny) * sf[4] + (mz - Nz) * sf[5]) / rlen);

      // ── the displacement decomposition (ARM R) ──
      // ── THE THREE-WAY DECOMPOSITION (corrected after run 1) ──────────────────────────────────
      // A two-way perp/parallel split is not enough, because the IN-PLANE part has two pieces with
      // completely different consequences:
      //   * ALONG the edge (ehat): the lifted vertex simply SLIDES along AB. Both children stay
      //     positive. Harmless to tiling — it is a reparameterisation, not a fold. It is nonzero
      //     because the PARAMETRIC midpoint (th_m, z_m) is NOT the midpoint of the 3-D edge whenever
      //     r varies along it: for rA != rB the chord midpoint sits at a different polar angle, so
      //     the lift lands off-centre by O(L * dr/r) — FIRST order in L, i.e. it does NOT vanish
      //     under refinement.
      //   * toward the APEX C (mhat, in-plane, perpendicular to the edge): THIS is what folds a
      //     child, because it is what carries M across line AC or line BC.
      const ex0 = (Bx - Ax); const ey0 = (By - Ay); const ez0 = (Bz - Az);
      const eL = Math.hypot(ex0, ey0, ez0) || 1;
      const ehx = ex0 / eL; const ehy = ey0 / eL; const ehz = ez0 / eL;
      // mhat = in-plane unit vector from the edge toward C
      const acx = Cx - Ax; const acy = Cy - Ay; const acz = Cz - Az;
      const acd = acx * ehx + acy * ehy + acz * ehz;
      let mhx = acx - acd * ehx; let mhy = acy - acd * ehy; let mhz = acz - acd * ehz;
      const mL = Math.hypot(mhx, mhy, mhz) || 1; mhx /= mL; mhy /= mL; mhz /= mL;
      const dx = Rx - mx; const dy = Ry - my; const dz = Rz - mz;
      const delta = Math.hypot(dx, dy, dz);
      const dot = dx * fx + dy * fy + dz * fz;
      const dPerp = Math.abs(dot);
      const dPar = Math.hypot(dx - dot * fx, dy - dot * fy, dz - dot * fz);
      const dEdge = Math.abs(dx * ehx + dy * ehy + dz * ehz);
      const dApex = dx * mhx + dy * mhy + dz * mhz;      // SIGNED: + = toward C
      const eAB = Math.hypot(Bx - Ax, By - Ay, Bz - Az);
      const eBC = Math.hypot(Cx - Bx, Cy - By, Cz - Bz);
      const eCA = Math.hypot(Ax - Cx, Ay - Cy, Az - Cz);
      const dm = Math.max(eAB, eBC, eCA);
      const hmin = (2 * area) / Math.max(1e-30, dm);
      const sB = Math.sin((betaLoc * Math.PI) / 180);
      const phi = (2 * delta * sB) / Math.max(1e-30, hmin);          // the ORIGINAL pre-registered predictor
      const phiApex = (2 * Math.abs(dApex)) / Math.max(1e-30, hmin);  // the corrected one

      // ── THE FOLD, measured in the PARENT'S plane by signed area against the parent normal ──
      const sgnArea = (P0: number[], P1: number[], P2: number[]): number => {
        const ux = P1[0] - P0[0]; const uy = P1[1] - P0[1]; const uz = P1[2] - P0[2];
        const vx = P2[0] - P0[0]; const vy = P2[1] - P0[1]; const vz = P2[2] - P0[2];
        const cxx = uy * vz - uz * vy; const cyy = uz * vx - ux * vz; const czz = ux * vy - uy * vx;
        return 0.5 * (cxx * fx + cyy * fy + czz * fz);
      };
      const A3 = [Ax, Ay, Az]; const B3 = [Bx, By, Bz]; const C3 = [Cx, Cy, Cz];
      const MR = [Rx, Ry, Rz]; const MN = [Nx, Ny, Nz];
      const foldR: 0 | 1 = (sgnArea(A3, MR, C3) <= 0 || sgnArea(MR, B3, C3) <= 0) ? 1 : 0;
      const foldN: 0 | 1 = (sgnArea(A3, MN, C3) <= 0 || sgnArea(MN, B3, C3) <= 0) ? 1 : 0;

      // ── child orientation under both lifts (worse of the two children) ──
      // thN comes out of nearestOnSurface by SMALL steps from thM, so it is already on the facet's
      // own unwrapped theta branch — no re-unwrapping, which would be a silent branch bug.
      const thMr = thM; const thNr = thN;
      const co = (Mp: number[], thm: number): { normDeg: number; tangUm: number } => {
        const c1 = childOrient([A3[0], A3[1], A3[2], Mp[0], Mp[1], Mp[2], C3[0], C3[1], C3[2]], [TH[i], thm, TH[k]]);
        const c2 = childOrient([Mp[0], Mp[1], Mp[2], B3[0], B3[1], B3[2], C3[0], C3[1], C3[2]], [thm, TH[j], TH[k]]);
        return { normDeg: Math.max(c1.normDeg, c2.normDeg), tangUm: Math.max(c1.tangUm, c2.tangUm) };
      };
      const cR = co(MR, thMr); const cN = co(MN, thNr);

      const rec: ER = { ar: area, hmin, beta: betaLoc, dPar, dPerp, delta, phi, phiApex, dEdge, dApex,
        foldR, foldN, dNN, ndR: cR.normDeg, ndN: cN.normDeg, tuR: cR.tangUm, tuN: cN.tangUm,
        evR, evN, moveNN, perpN };
      E.push(rec);
      buf += `${JSON.stringify(rec)}\n`;
    }
    done += 1;
    if (done % 1000 === 0) { appendFileSync(NDJ, buf); buf = ''; log(`  ${done}/${NS} facets (${E.length} edges)  [${((Date.now() - T0) / 1000).toFixed(1)}s]`); }
  }
  if (buf.length > 0) appendFileSync(NDJ, buf);

  const aAll = E.reduce((s, r) => s + r.ar, 0);
  const awq = (rs: ER[], val: (r: ER) => number, ps: number[]): number[] => {
    const arr = rs.map((r) => [val(r), r.ar] as [number, number]).filter((x) => Number.isFinite(x[0]));
    if (arr.length === 0) return ps.map(() => NaN);
    arr.sort((a, b) => a[0] - b[0]);
    const tot = arr.reduce((s, x) => s + x[1], 0);
    const out: number[] = []; let i = 0; let acc = 0;
    for (const p of ps) { const t = p * tot; while (i < arr.length && acc + arr[i][1] < t) { acc += arr[i][1]; i += 1; } out.push(arr[Math.min(i, arr.length - 1)][0]); }
    return out;
  };
  const P = [0.05, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0];
  const fq = (v: number[], d = 4): string => v.map((x) => (Number.isFinite(x) ? x.toExponential(d) : 'NaN')).join(' ');

  log('');
  log('='.repeat(112));
  log(`  W2 / W4A   ${STYLE} / ${TAG}   ${done} parents, ${E.length} edges   rA evals ${RA_EVALS}`);
  log('='.repeat(112));

  // KILL 1 — the identity dPar/dPerp = tan(beta)
  const idn = E.filter((r) => r.dPerp > 1e-12 && r.beta > 1e-6);
  const ratio = (r: ER): number => (r.dPar / r.dPerp) / Math.tan((r.beta * Math.PI) / 180);
  log('');
  log('── W2 KILL 1: is the lift displacement PURELY RADIAL?  predicted dPar/dPerp = tan(BETA) ──');
  log(`   dPar/dPerp                area-wt p05/25/50/75/90/99/max : ${fq(awq(idn, (r) => r.dPar / r.dPerp, P), 3)}`);
  log(`   tan(BETA)                 area-wt                        : ${fq(awq(idn, (r) => Math.tan((r.beta * Math.PI) / 180), P), 3)}`);
  log(`   *** RATIO (dPar/dPerp)/tan(BETA)  area-wt                : ${fq(awq(idn, ratio, P), 4)} ***`);
  { const m = awq(idn, ratio, [0.5])[0];
    log(`   KILL if p50 outside [0.80, 1.25]:  p50 = ${m.toFixed(4)}  ->  ${m >= 0.8 && m <= 1.25 ? 'CONFIRMED' : '*** REFUTED ***'}`); }

  // ── THE CORRECTED DECOMPOSITION: which part of the in-plane displacement is which? ──
  log('');
  log('── W2 (corrected, pre-registered before this run): is the IN-PLANE displacement dominated by');
  log('   the harmless ALONG-EDGE slide rather than the fold-causing APEX-ward part? ──');
  log('   KILL: if |dApex| >= |dEdge| at the area-wt p50, the along-edge story is wrong.');
  log(`   |dEdge| (mm, slides M along AB — harmless)  area-wt : ${fq(awq(E, (r) => r.dEdge, P), 3)}`);
  log(`   |dApex| (mm, toward C  — THIS folds)        area-wt : ${fq(awq(E, (r) => Math.abs(r.dApex), P), 3)}`);
  log(`   dPerp   (mm, off the facet plane)           area-wt : ${fq(awq(E, (r) => r.dPerp, P), 3)}`);
  { const rr = awq(E.filter((r) => r.dEdge > 1e-14), (r) => Math.abs(r.dApex) / r.dEdge, [0.05, 0.5, 0.95]);
    log(`   *** |dApex|/|dEdge| area-wt p05/50/95 = ${fq(rr, 4)}   KILL if p50 >= 1.0 -> ${rr[1] < 1 ? 'CONFIRMED' : '*** REFUTED ***'} ***`); }

  // KILL 2 — phi as a fold predictor (BOTH the original and the corrected apex form)
  const conf = (key: (r: ER) => boolean): string => {
    let tp = 0; let fp = 0; let fn = 0; let tn = 0;
    for (const r of E) { const p = key(r); if (p && r.foldR === 1) tp += 1; else if (p) fp += 1; else if (r.foldR === 1) fn += 1; else tn += 1; }
    const rc = tp / Math.max(1, tp + fn); const pr = tp / Math.max(1, tp + fp);
    return `TP ${String(tp).padStart(6)} FP ${String(fp).padStart(6)} FN ${String(fn).padStart(6)} TN ${String(tn).padStart(6)}   recall ${rc.toFixed(4)}  precision ${pr.toFixed(4)}   ${rc >= 0.7 && pr >= 0.5 ? 'CONFIRMED' : '*** REFUTED ***'}`;
  };
  log('');
  log('── W2 KILL 2: does a phi >= 1 threshold PREDICT the actual fold? (KILL: recall<0.70 or prec<0.50) ──');
  log(`   phi     = 2*delta*sin(BETA)/h_min  (the ORIGINAL pre-registered predictor) : ${conf((r) => r.phi >= 1)}`);
  log(`   phiApex = 2*|dApex|/h_min          (the CORRECTED predictor)               : ${conf((r) => r.phiApex >= 1)}`);
  log(`   phiApex >= 0.5                                                             : ${conf((r) => r.phiApex >= 0.5)}`);
  log(`   phiApex area-wt : ${fq(awq(E, (r) => r.phiApex, P), 3)}`);
  log(`   phi                       area-wt : ${fq(awq(E, (r) => r.phi, P), 3)}`);
  log(`   delta (mm, radial lift)   area-wt : ${fq(awq(E, (r) => r.delta, P), 3)}`);
  log(`   h_min (mm)                area-wt : ${fq(awq(E, (r) => r.hmin, P), 3)}`);
  log(`   BETA at the midpoint (deg) area-wt: ${fq(awq(E, (r) => r.beta, P), 3)}`);
  log(`   delta_crit = h_min/(2 sin BETA) (mm) area-wt : ${fq(awq(E.filter((r) => r.beta > 1e-6), (r) => r.hmin / (2 * Math.sin((r.beta * Math.PI) / 180)), P), 3)}`);

  // the fold rate as a function of wall angle — the deliverable of W2
  log('');
  log('── W2 DELIVERABLE: fold rate vs wall angle BETA (arm R = the mesher lift) ──');
  log('   BETA band      edges    foldR   foldR%   foldAREA%   |dApex|/h_min p50   |dEdge|/h_min p50   foldN');
  for (const [lo, hi] of [[0, 5], [5, 15], [15, 30], [30, 45], [45, 60], [60, 75], [75, 90.1]]) {
    const S = E.filter((r) => r.beta >= lo && r.beta < hi);
    if (S.length === 0) { log(`   [${String(lo).padStart(2)}, ${String(hi).padStart(2)})          0`); continue; }
    const f = S.filter((r) => r.foldR === 1); const fN = S.filter((r) => r.foldN === 1);
    const aS = S.reduce((s, r) => s + r.ar, 0); const aF = f.reduce((s, r) => s + r.ar, 0);
    log(`   [${String(lo).padStart(2)}, ${String(hi).padStart(2)}) ${String(S.length).padStart(9)} ${String(f.length).padStart(8)} ${((100 * f.length) / S.length).toFixed(3).padStart(8)}% ${((100 * aF) / Math.max(1e-30, aS)).toFixed(3).padStart(10)}% ${awq(S, (r) => Math.abs(r.dApex) / r.hmin, [0.5])[0].toExponential(3).padStart(19)} ${awq(S, (r) => r.dEdge / r.hmin, [0.5])[0].toExponential(3).padStart(19)} ${String(fN.length).padStart(7)}`);
  }

  // W4A — the alternative lift
  const foldRc = E.filter((r) => r.foldR === 1); const foldNc = E.filter((r) => r.foldN === 1);
  const aFR = foldRc.reduce((s, r) => s + r.ar, 0); const aFN = foldNc.reduce((s, r) => s + r.ar, 0);
  log('');
  log('='.repeat(112));
  log('  W4-A: RADIAL LIFT (the mesher) vs NEAREST-POINT LIFT (project along the surface normal)');
  log('  Both keep the vertex EXACTLY on the surface. Nearest-point is EDGE-INTRINSIC => conforming.');
  log('='.repeat(112));
  log(`   folds  ARM R (radial)        ${String(foldRc.length).padStart(8)} / ${E.length} = ${((100 * foldRc.length) / Math.max(1, E.length)).toFixed(4)}%   parent AREA ${((100 * aFR) / Math.max(1e-30, aAll)).toFixed(4)}%`);
  log(`   folds  ARM N (nearest-point) ${String(foldNc.length).padStart(8)} / ${E.length} = ${((100 * foldNc.length) / Math.max(1, E.length)).toFixed(4)}%   parent AREA ${((100 * aFN) / Math.max(1e-30, aAll)).toFixed(4)}%`);
  { const rr = foldRc.length / Math.max(1, foldNc.length);
    log(`   *** fold COUNT reduction  ${rr.toFixed(3)}x   KILL if < 5.0x  ->  ${rr >= 5 ? 'CONFIRMED' : '*** REFUTED ***'} ***`); }
  { let both = 0; let onlyR = 0; let onlyN = 0;
    for (const r of E) { if (r.foldR === 1 && r.foldN === 1) both += 1; else if (r.foldR === 1) onlyR += 1; else if (r.foldN === 1) onlyN += 1; }
    log(`   paired: folds under BOTH ${both}   only-R ${onlyR}   *** only-N ${onlyN} (folds the ARM-N lift CREATES) ***`); }
  log(`   worse-child normDeg  ARM R  area-wt : ${fq(awq(E, (r) => r.ndR, P), 3)}`);
  log(`   worse-child normDeg  ARM N  area-wt : ${fq(awq(E, (r) => r.ndN, P), 3)}`);
  log(`   worse-child chord um ARM R  area-wt : ${fq(awq(E, (r) => r.tuR, P), 3)}`);
  log(`   worse-child chord um ARM N  area-wt : ${fq(awq(E, (r) => r.tuN, P), 3)}`);
  { let oR = 0; let oN = 0; let aR = 0; let aN = 0;
    for (const r of E) { if (r.tuR > BAR_UM) { oR += 1; aR += r.ar; } if (r.tuN > BAR_UM) { oN += 1; aN += r.ar; } }
    log(`   children over the ${BAR_UM}um CHORD bar:  ARM R ${oR} (${((100 * aR) / aAll).toFixed(3)}% area)   ARM N ${oN} (${((100 * aN) / aAll).toFixed(3)}% area)`); }
  log(`   |M_N - M_R| (mm, how far the alternative moves the vertex) area-wt : ${fq(awq(E, (r) => r.moveNN, P), 3)}`);
  log(`   dist(chord midpoint, surface) under ARM N (mm)             area-wt : ${fq(awq(E, (r) => r.dNN, P), 3)}`);
  { const pn = awq(E, (r) => r.perpN, [0.01, 0.05, 0.5]);
    let bad = 0; for (const r of E) if (r.perpN < 0.99) bad += 1;
    log(`   *** PROJECTION SOUNDNESS |cos(residual, n_S)| p01/p05/p50 = ${fq(pn, 4)}   edges with |cos| < 0.99: ${bad} (${((100 * bad) / Math.max(1, E.length)).toFixed(3)}%) — if this is large the Gauss-Newton did NOT converge and ARM N is unreadable ***`); }
  { const eR = E.reduce((s, r) => s + r.evR, 0) / Math.max(1, E.length);
    const eN = E.reduce((s, r) => s + r.evN, 0) / Math.max(1, E.length);
    log(`   *** COST, MEASURED: rA evals per edge  ARM R ${eR.toFixed(2)}   ARM N ${eN.toFixed(2)}   = ${(eN / Math.max(1e-9, eR)).toFixed(2)}x ***`); }
  writeFileSync(`${OUTDIR}/S95_W2_${TAG}.done`, `${new Date().toISOString()}\n`);
  log(`\nNDJSON ${NDJ}   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}
