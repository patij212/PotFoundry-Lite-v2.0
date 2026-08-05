// frontierCertify.ts — CALIBRATE THE POSITION PROXY AGAINST `certifyTriangle`, AND GET o/w HONESTLY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS, STATED AS A WEAKNESS OF MY OWN WORK. `frontierTaxonomy.ts` reports a position number
// (`dPerpUm` = max over the k=8 covering of |(P_facet - P_surface) . n_hat|) and uses it for the
// load-bearing H-B claim *"99.9% of the over-bar ORIENTATION area has position under the bar"*. That
// number is NOT `certifyTriangle`: it is a first-order perpendicular offset read on 45 lattice points,
// where the real certificate walks a lattice of up to `nMax` levels with a coordinate descent + Newton
// per candidate point and costs 40k-330k rA evaluations per facet. A sparse lattice UNDER-reads a max.
// So the proxy is measured here against the certificate on the same facets rather than assumed.
//
// PRE-REGISTERED, before the first run:
//   H-F: `dPerpUm` under-reads `certifyTriangle.witnessed` by a bounded factor and does not reorder the
//        population. *** KILL: if the area-weighted p50 of `witnessed / dPerp` exceeds 3.0, or if
//        Spearman rho(dPerp, witnessed) < 0.8, the proxy is not usable and H-B must be restated using
//        only the certificate. ***
//   H-G: the honest `o/w = tangUm / witnessed` has area-weighted p50 in [4, 16] — i.e. the identity
//        `chord ~ 8 * sag` holds on real facets and the 10 um orientation bar IS a ~1.25 um position bar.
//   H-H: the fraction of the ORIENTATION-over-bar sample whose HONEST position is <= 10 um is > 90%.
//        *** This is the sentence that decides whether the orientation defect is a second, unstated
//        standard rather than a failure of the stated one. ***
//
// The sample is STRATIFIED over the orientation chord so the tail is represented; every stratum's weight
// is carried through to the reported quantiles, and the unstratified control column is printed next to it.
//
// Usage: bash research/tools/run-frontier-certify.sh
//   env: PF_FC_STYLE PF_FC_STL PF_FC_TAG PF_FC_N(600) PF_FC_TOL(0.010) PF_FC_NMAX(512) PF_FC_H/RB/RT
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_FC_STYLE ?? 'GothicArches';
const STL = process.env.PF_FC_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_FC_TAG ?? 'S39CTL';
const NPICK = Math.round(envF('PF_FC_N', 600));
const TOL = envF('PF_FC_TOL', 0.010);
const NMAX = Math.round(envF('PF_FC_NMAX', 512));
// COST GUARD. `exhaustive: true` refuses to short-circuit at the first exceedance, which is right for a
// magnitude but on a 5 mm-cov facet asks for a 512-level lattice (131,841 points) each of which may be
// tightened at ~300 rA. The first run of this tool spent >20 minutes on its last 50 facets for that
// reason. `sampleCap` bounds it; `witnessedComplete` reports honestly wherever the cap binds and the
// completeness rate is printed, so a capped reading is never silently quoted as a max.
const SCAP = envF('PF_FC_SAMPLECAP', 60000);
const K = 8; const INSET = 0.02; const BAR_UM = 10;
const DIMS: StyleDims = { H: envF('PF_FC_H', 120), Rb: envF('PF_FC_RB', 40), Rt: envF('PF_FC_RT', 50), expn: 1 };
const H = DIMS.H;

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
mkdirSync('research/exchange/_strataConformBisect/frontier', { recursive: true });
log('===== FRONTIER CERTIFY — the position PROXY against `certifyTriangle`, and the honest o/w =====');
log(`style ${STYLE}  tag ${TAG}  tol ${TOL} mm  nMax ${NMAX}  sampleCap ${SCAP}  sample ${NPICK} (stratified by orientation chord)`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}   detectThetaJumps ${thJ.length}`);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
log(`mesh ${nTri} facets  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

const LP = ((K + 1) * (K + 2)) / 2;
const wA = new Float64Array(LP); const wB = new Float64Array(LP); const wC = new Float64Array(LP);
{
  const sh = 1 - INSET; const sc = INSET / 3; let q = 0;
  for (let i = 0; i <= K; i += 1) {
    for (let j = 0; i + j <= K; j += 1) {
      const a = sh * (i / K) + sc; const b = sh * (j / K) + sc;
      wA[q] = a; wB[q] = b; wC[q] = 1 - a - b; q += 1;
    }
  }
}
const HARC = 2e-4; const HZ = 2e-4;

interface Row { i: number; chordUm: number; angDeg: number; dPerpUm: number; area: number; diam: number; }
function screen(t: number): Row | null {
  const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz),
    Math.hypot(ax - bx, ay - by, az - bz));
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 0)) return null;
  const area = 0.5 * fl;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  let best = -1; let dPerpMax = 0;
  for (let p = 0; p < LP; p += 1) {
    const th = wA[p] * thA + wB[p] * thB + wC[p] * thC;
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
    const a = Math.acos(d); if (a > best) best = a;
    const px = wA[p] * ax + wB[p] * bx + wC[p] * cx;
    const py = wA[p] * ay + wB[p] * by + wC[p] * cy;
    const pz = wA[p] * az + wB[p] * bz + wC[p] * cz;
    const dp = Math.abs((px - r0 * c) * vx + (py - r0 * s) * vy + (pz - zz) * vz);
    if (dp > dPerpMax) dPerpMax = dp;
  }
  return { i: t, chordUm: 2 * Math.sin(0.5 * best) * diam * 1000, angDeg: (best * 180) / Math.PI, dPerpUm: dPerpMax * 1000, area, diam };
}

// ── screen a broad population, then stratify by orientation chord ──
function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}
const SCREEN = Math.min(nTri, 40000);
const sIdx = goldenIdx(nTri, SCREEN);
const pool: Row[] = [];
for (let q = 0; q < sIdx.length; q += 1) { const r = screen(sIdx[q]); if (r !== null) pool.push(r); }
log(`screened ${pool.length} facets  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

// strata on the chord: under bar, 1-2x bar, 2-5x, 5-20x, >20x
const EDGES = [0, BAR_UM, 2 * BAR_UM, 5 * BAR_UM, 20 * BAR_UM, Infinity];
const strata: Row[][] = EDGES.slice(1).map(() => []);
for (const r of pool) {
  for (let b = 0; b < EDGES.length - 1; b += 1) {
    if (r.chordUm > EDGES[b] && r.chordUm <= EDGES[b + 1]) { strata[b].push(r); break; }
  }
}
const per = Math.max(20, Math.floor(NPICK / strata.length));
const picked: Array<{ r: Row; w: number }> = [];
for (let b = 0; b < strata.length; b += 1) {
  const st = strata[b];
  if (st.length === 0) continue;
  const take = Math.min(per, st.length);
  const step = st.length / take;
  for (let j = 0; j < take; j += 1) picked.push({ r: st[Math.floor(j * step)], w: st.length / take });
  log(`  stratum chord in (${EDGES[b]}, ${EDGES[b + 1]}] um: population ${st.length}, taking ${take}, weight ${(st.length / take).toFixed(2)}`);
}
log(`certifying ${picked.length} facets  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

interface Out { r: Row; w: number; wit: number; bnd: number; cert: boolean; complete: boolean; }
const outs: Out[] = [];
for (let q = 0; q < picked.length; q += 1) {
  const { r, w } = picked[q];
  const o = r.i * 9;
  const v = certifyTriangle(rA,
    xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ, exhaustive: true, sampleCap: SCAP });
  outs.push({ r, w, wit: v.witnessed * 1000, bnd: v.bound * 1000, cert: v.certified, complete: v.witnessedComplete });
  if ((q + 1) % 50 === 0) log(`  ${q + 1}/${picked.length}  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

// weighted quantiles over the stratified sample (weight = area * stratum weight)
function wq(rows: Out[], val: (o: Out) => number, ps: number[]): number[] {
  const arr = rows.map((o) => [val(o), o.r.area * o.w] as [number, number]).filter((x) => Number.isFinite(x[0]));
  arr.sort((a, b) => a[0] - b[0]);
  const tot = arr.reduce((s, x) => s + x[1], 0);
  const out: number[] = []; let i = 0; let acc = 0;
  for (const p of ps) {
    const t = p * tot;
    while (i < arr.length && acc + arr[i][1] < t) { acc += arr[i][1]; i += 1; }
    out.push(arr[Math.min(i, arr.length - 1)][0]);
  }
  return out;
}
const P = [0.05, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0];
const fmt = (v: number[], d = 3): string => v.map((x) => x.toFixed(d)).join('  ');

// Spearman rho on ranks (unweighted, whole certified sample)
function spearman(a: number[], b: number[]): number {
  const rank = (x: number[]): number[] => {
    const o = x.map((v, i) => [v, i] as [number, number]).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(x.length);
    for (let i = 0; i < o.length; i += 1) r[o[i][1]] = i;
    return r;
  };
  const ra = rank(a); const rb = rank(b); const n = a.length;
  const ma = (n - 1) / 2; let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i += 1) { num += (ra[i] - ma) * (rb[i] - ma); da += (ra[i] - ma) ** 2; db += (rb[i] - ma) ** 2; }
  return num / Math.sqrt(Math.max(1e-30, da * db));
}

const overOr = outs.filter((o) => o.r.chordUm > BAR_UM);
log('');
log('══════════════════════════════════════════════════════════════════════════════════════');
log(`  ${STYLE} / ${TAG}   certified ${outs.length} facets, ${overOr.length} of them ORIENTATION-over-bar`);
log(`  witnessedComplete on ${outs.filter((o) => o.complete).length}/${outs.length}`);
log('══════════════════════════════════════════════════════════════════════════════════════');
log('');
log('── H-F  is the position PROXY usable? ──');
log(`    witnessed / dPerp   area-wt p05/25/50/75/90/99/max: ${fmt(wq(outs, (o) => o.wit / Math.max(1e-9, o.r.dPerpUm), P), 3)}`);
log(`    Spearman rho(dPerp, witnessed) over ${outs.length} certified facets: ${spearman(outs.map((o) => o.r.dPerpUm), outs.map((o) => o.wit)).toFixed(4)}`);
log(`    witnessed (um)  area-wt quantiles: ${fmt(wq(outs, (o) => o.wit, P), 4)}`);
log(`    dPerp     (um)  area-wt quantiles: ${fmt(wq(outs, (o) => o.r.dPerpUm, P), 4)}`);
log('');
log('── H-G  the honest o/w:  tangUm / certifyTriangle.witnessed ──');
log(`    over-bar-orientation facets, area-wt quantiles: ${fmt(wq(overOr, (o) => o.r.chordUm / Math.max(1e-9, o.wit), P), 2)}`);
log(`    ALL certified facets,        area-wt quantiles: ${fmt(wq(outs, (o) => o.r.chordUm / Math.max(1e-9, o.wit), P), 2)}`);
log('');
log('── H-H  do the orientation-over-bar facets PASS the honest 10 um POSITION bar? ──');
{
  const wsum = (rows: Out[]): number => rows.reduce((s, o) => s + o.r.area * o.w, 0);
  const tot = wsum(overOr);
  const pass = wsum(overOr.filter((o) => o.wit <= BAR_UM));
  const passCert = wsum(overOr.filter((o) => o.cert));
  const pass125 = wsum(overOr.filter((o) => o.wit <= BAR_UM / 8));
  log(`    witnessed <= ${BAR_UM} um : ${((100 * pass) / Math.max(1e-30, tot)).toFixed(3)}% of orientation-over-bar AREA   (count ${overOr.filter((o) => o.wit <= BAR_UM).length}/${overOr.length})`);
  log(`    CERTIFIED (two-sided pass): ${((100 * passCert) / Math.max(1e-30, tot)).toFixed(3)}% of that AREA`);
  log(`    witnessed <= ${(BAR_UM / 8).toFixed(3)} um (= the position bar the ORIENTATION bar implies): ${((100 * pass125) / Math.max(1e-30, tot)).toFixed(3)}%`);
}
log('');
log('── THE ANGLE THE BAR IS ACTUALLY DEMANDING ──');
{
  const abar = (o: Out): number => (o.r.diam > 0 ? (2 * Math.asin(Math.min(1, (BAR_UM / 1000) / (2 * o.r.diam))) * 180) / Math.PI : 180);
  log(`    implied angular deviation bar (deg) per facet, area-wt quantiles: ${fmt(wq(outs, abar, P), 4)}`);
  log(`    measured sup angle (deg),                      area-wt quantiles: ${fmt(wq(outs, (o) => o.r.angDeg, P), 4)}`);
}
const p = `research/exchange/_strataConformBisect/frontier/FR_CERT_${TAG}.ndjson`;
writeFileSync(p, `${outs.map((o) => JSON.stringify({ i: o.r.i, w: o.w, ar: o.r.area, dm: o.r.diam, ch: o.r.chordUm, ang: o.r.angDeg, dp: o.r.dPerpUm, wit: o.wit, bnd: o.bnd, cert: o.cert, cmp: o.complete })).join('\n')}\n`);
log('');
log(`rows -> ${p}`);
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
