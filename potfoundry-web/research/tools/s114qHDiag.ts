// s114qHDiag.ts — MY OWN h-CONTROL FIRED IN s114Requote AND THIS IS THE ADJUDICATION.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT FIRED. `s114Requote`'s h-ladder, pinned straddling class, centroid lattice k=64, n=80:
//     h (mm)    2e-5     5e-5     2e-4     1e-3
//     normDeg   4.99    49.97   113.46   135.52
//     cheb      4.24    23.85    58.34    70.17
//     spread    2.51     8.16    21.78    34.92
// A statistic that moves 27x on the finite-difference step is not a statistic. EVERY normDeg,
// spreadDeg and cheb in S112, S113 and S114 is taken at h = 2e-4 mm, so this is not a defect in my
// substitute — it is a defect in the whole family, INCLUDING the published `normDeg`.
//
// TWO EXPLANATIONS, AND THEY HAVE OPPOSITE CONSEQUENCES:
//   H-WINDOW  The finite-difference window is a BLUR RADIUS. A probe within `h` of a C0 crease returns a
//             blended normal, so a bigger h makes more probes "see" the crease. If the crease lies on or
//             near the footprint BOUNDARY, then the entire large-normDeg reading is the window reaching
//             out to it, and the honest answer at h -> 0 is that the interior is accurate.
//             *** CONSEQUENCE: the campaign's normDeg on the crease class is an h-inflated number and the
//             "straddle" of the median pinned facet is not a straddle at all. ***
//   H-NOISE   `rA` is not smooth at the f64 level (a quantisation, a float32 cast, a lookup), so a small
//             h divides two nearly-equal numbers and the derivative collapses toward 0, which sends every
//             normal to the pure radial direction and makes normDeg SMALL for a spurious reason.
//             *** CONSEQUENCE: small h is garbage and the large readings are the right ones. ***
//
// THE DISCRIMINATOR, and it is two-sided by construction:
//   (1) THE SMOOTH CONTROL. On facets with adjacent dihedral < 2 deg there is no crease within reach of
//       ANY h in the ladder, so H-WINDOW predicts a FLAT h-ladder there while H-NOISE predicts the same
//       collapse. One population cannot distinguish them; two can.
//   (2) THE INTERIOR-STRADDLER CLASS (S113 Part C's 1,537 facets, intSep>=45 AND intMinor>=0.05 at inset
//       0.10 — a crease genuinely inside the footprint with a real minority AREA share). H-WINDOW
//       predicts this class stays LARGE as h shrinks, because its minority flank has area and does not
//       need the window to be found. H-NOISE predicts it collapses like everything else.
//   (3) THE DERIVATIVE ITSELF. `fdNormals` forms rtF=(r(th+h)-r(th))/h and rtB=(r(th)-r(th-h))/h. On a
//       smooth point these agree to O(h) and BOTH converge; under quantisation their DISAGREEMENT blows
//       up as h shrinks. Reported as a relative disagreement per h, on smooth wall points only.
//   (4) A CLOSED-FORM ANCHOR. A synthetic exact radius fn (a cone plus a sinusoid) is pushed through the
//       SAME `fdNormals` at the same h ladder and compared against its analytic normal. If the h ladder is
//       flat there and not on `rA`, the h-dependence belongs to `rA`, not to the sampler.
//
// PRE-REGISTERED: I expect H-WINDOW. *** KILL: if the SMOOTH control collapses like the crease class, or
// if (3) blows up below 2e-5, or if (4) is not flat, then small h is not trustworthy, H-NOISE is live and
// I must NOT quote any h->0 number. *** Report the ladder either way.
//
// Usage: bash research/tools/run-s114q-hdiag.sh
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormals, radialNormal, type NormalSampler } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => process.env[n] ?? d;

const STYLE = envS('PF_S114Q_STYLE', 'GothicArches');
const STL = envS('PF_S114Q_STL', 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl');
const NDJ = envS('PF_S114Q_NDJSON', 'research/exchange/_strataConformBisect/straddle/S113_STRADDLE_GOTH.ndjson');
const NDJC = envS('PF_S114Q_NDJSONC', 'research/exchange/_strataConformBisect/straddle/S113OPC_ORACLE_GOTH.ndjson');
const TAG = envS('PF_S114Q_TAG', 'GOTH');
const OUTDIR = 'research/exchange/_strataConformBisect/requote';
const K = Math.round(envF('PF_S114Q_K', 64));
const NSUB = Math.round(envF('PF_S114Q_N', 80));
const HS = envS('PF_S114Q_HS', '2e-6,5e-6,1e-5,2e-5,5e-5,1e-4,2e-4,5e-4,1e-3,5e-3').split(',').map(Number);
const DIMS: StyleDims = { H: envF('PF_S114Q_H', 120), Rb: envF('PF_S114Q_RB', 40), Rt: envF('PF_S114Q_RT', 50), expn: 1 };
const H = DIMS.H;
const DEG = 180 / Math.PI;

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
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('===== S114q — ADJUDICATING THE h-DEPENDENCE THAT MY OWN CONTROL FOUND =====');
log(`style ${STYLE}  tag ${TAG}  lattice k=${K} (centroid, ${K * K} equal-area points)  n=${NSUB} per population`);
log('H-WINDOW: h is a blur radius reaching a crease near the footprint boundary => smooth control FLAT.');
log('H-NOISE : rA is not f64-smooth => the derivative collapses => smooth control COLLAPSES TOO.');
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
  log(`PRECOND radial MAX |r_mesh - rA| = ${(worst * 1000).toFixed(4)} um   (must read 0.0310 um)`);
  if (worst * 1000 > 50) { log('*** REFUSING: params/dims mismatch. ***'); process.exit(4); }
}
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
let meshArea = 0;
for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
log(`mesh ${nTri} facets  ${meshArea.toFixed(3)} mm2  ${el()}`);

const pin = readFileSync(NDJ, 'utf8').split('\n').filter((l) => l.length > 2)
  .map((l) => JSON.parse(l) as { f1: number; f2: number; drop: number });
const pinF: number[] = [];
{ const s = new Set<number>(); for (const r of pin) for (const f of [r.f1, r.f2]) if (!s.has(f)) { s.add(f); pinF.push(f); } }
const intStrad: number[] = [];
for (const l of readFileSync(NDJC, 'utf8').split('\n')) {
  if (l.length < 3) continue;
  const o = JSON.parse(l) as { f: number; intSep: number; intMinor: number };
  if (o.intSep >= 45 && o.intMinor >= 0.05) intStrad.push(o.f);
}
log(`pinned ${pinF.length} facets;  Part C interior straddlers ${intStrad.length} (S113: 1537)`);

const strat = (arr: number[], n: number): number[] => {
  if (arr.length <= n) return arr.slice();
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let g = Math.max(1, Math.round(arr.length * 0.6180339887498949) | 1);
  while (g > 1 && gcd(g, arr.length) !== 1) g += 2;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) out.push(arr[(i * g) % arr.length]);
  return out;
};
const graphRatio = (f: number): number => {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  const at = Math.atan2(ay, ax); const bt = at + dThRaw(at, Math.atan2(by, bx)); const ct = at + dThRaw(at, Math.atan2(cy, cx));
  const rR = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const aP = 0.5 * Math.abs((rR * (bt - at)) * (cz - az) - (bz - az) * (rR * (ct - at)));
  return aP > 1e-15 ? a3 / aP : Infinity;
};
const smoothF: number[] = [];
{
  let seed = 987654321;
  const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const inPin = new Set(pinF); const lo = (2 * Math.PI) / 180;
  for (let t = 0; t < 600000 && smoothF.length < 900; t += 1) {
    const f = Math.floor(rnd() * nTri);
    if (inPin.has(f) || d.perFacetMaxRad[f] >= lo || graphRatio(f) > 8) continue;
    smoothF.push(f);
  }
}
const intSet = new Set(intStrad);
const nonInt = pinF.filter((f) => !intSet.has(f));
log(`pinned NOT interior-straddling ${nonInt.length};  smooth control pool ${smoothF.length}`);
log('');

const th3 = (f: number): [number, number, number] => {
  const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
  return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
};
function woundNormal(f: number, out: Float64Array): void {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / L; out[1] = ny / L; out[2] = nz / L;
}
function baryCentroid(k: number): Float64Array {
  const out = new Float64Array(k * k * 3);
  let m = 0;
  for (let i = 0; i < k; i += 1) for (let j = 0; i + j <= k - 1; j += 1) {
    const wa = (i + 1 / 3) / k; const wb = (j + 1 / 3) / k;
    out[m * 3] = wa; out[m * 3 + 1] = wb; out[m * 3 + 2] = 1 - wa - wb; m += 1;
  }
  for (let i = 0; i < k; i += 1) for (let j = 0; i + j <= k - 2; j += 1) {
    const wa = (i + 2 / 3) / k; const wb = (j + 2 / 3) / k;
    out[m * 3] = wa; out[m * 3 + 1] = wb; out[m * 3 + 2] = 1 - wa - wb; m += 1;
  }
  return out;
}
const BARY = baryCentroid(K);
const scratch = new Float64Array(12);
const fnB = new Float64Array(3);
/** p50 normDeg and mean-normal spread over the centroid lattice, at a given h. */
function probe(f: number, ns: NormalSampler): { norm: number; spread: number; multi: number } {
  woundNormal(f, fnB);
  const [ath, bth, cth] = th3(f);
  const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
  let best = -1; let sx = 0; let sy = 0; let sz = 0; let multi = 0;
  const pts = BARY.length / 3;
  for (let p = 0; p < pts; p += 1) {
    const wa = BARY[p * 3]; const wb = BARY[p * 3 + 1]; const wc = BARY[p * 3 + 2];
    const nc = ns(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz, scratch);
    if (nc > 1) multi += 1;
    let ax = 0; let ay = 0; let azz = 0;
    for (let i = 0; i < nc; i += 1) {
      ax += scratch[i * 3]; ay += scratch[i * 3 + 1]; azz += scratch[i * 3 + 2];
      let dp = fnB[0] * scratch[i * 3] + fnB[1] * scratch[i * 3 + 1] + fnB[2] * scratch[i * 3 + 2];
      dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
      const a = Math.acos(dp); if (a > best) best = a;
    }
    sx += ax / nc; sy += ay / nc; sz += azz / nc;
  }
  return {
    norm: best * DEG,
    spread: 2 * Math.acos(Math.min(1, Math.hypot(sx, sy, sz) / pts)) * DEG,
    multi: multi / pts,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// (1)+(2) THE FOUR-POPULATION h LADDER
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const POPS: Array<[string, number[]]> = [
  ['INTERIOR STRADDLERS (1,537)', strat(intStrad, NSUB)],
  ['PINNED, NOT interior-strad', strat(nonInt, NSUB)],
  ['PINNED, ALL (6,193)', strat(pinF, NSUB)],
  ['SMOOTH control (<2 deg)', strat(smoothF, NSUB)],
];
log('── (1)+(2) THE FOUR-POPULATION h LADDER (centroid lattice, fixed k, only h moves) ──');
log('   H-WINDOW predicts: INTERIOR STRADDLERS flat-ish, SMOOTH control flat, the rest collapsing as h->0.');
log('   H-NOISE   predicts: ALL FOUR collapse together.');
const tbl: Record<string, unknown> = {};
for (const [nm, set] of POPS) {
  log(`   ${nm}  n=${set.length}`);
  const rows: Array<Record<string, number>> = [];
  for (const h of HS) {
    const ns = fdNormals(rA, H, h, h);
    const r = set.map((f) => probe(f, ns));
    const nn = r.map((x) => x.norm); const ss = r.map((x) => x.spread); const mmv = r.map((x) => x.multi);
    log(`     h=${h.toExponential(0).padStart(6)}  normDeg p50 ${q(nn, 0.5).toFixed(3).padStart(8)} p90 ${q(nn, 0.9).toFixed(2).padStart(7)} MAX ${mx(nn).toFixed(2).padStart(7)}   spread p50 ${q(ss, 0.5).toFixed(3).padStart(8)}   multi-candidate points p50 ${(q(mmv, 0.5) * 100).toFixed(2).padStart(6)}%`);
    rows.push({ h, normP50: q(nn, 0.5), normP90: q(nn, 0.9), normMax: mx(nn), spreadP50: q(ss, 0.5), multiP50: q(mmv, 0.5) });
  }
  tbl[nm] = rows;
  log('');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// (3) IS THE DERIVATIVE ITSELF STABLE? forward vs backward one-sided r_th on SMOOTH wall points.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── (3) DERIVATIVE STABILITY on SMOOTH wall points — forward vs backward one-sided r_th ──');
log('   Under quantisation the two disagree MORE as h shrinks. Under smoothness they agree to O(h).');
{
  const pts: Array<[number, number]> = [];
  for (const f of strat(smoothF, 300)) {
    const [ath, bth, cth] = th3(f);
    const gz = (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3;
    pts.push([(ath + bth + cth) / 3, gz]);
  }
  for (const h of HS) {
    const rel: number[] = []; const dif: number[] = [];
    for (const [th, z] of pts) {
      const r0 = rA(th, z); const hTh = h / Math.max(1e-9, Math.abs(r0));
      const rtF = (rA(th + hTh, z) - r0) / hTh;
      const rtB = (r0 - rA(th - hTh, z)) / hTh;
      const sc = Math.max(Math.abs(rtF), Math.abs(rtB), 1e-12);
      rel.push(Math.abs(rtF - rtB) / sc); dif.push(Math.abs(rtF - rtB));
    }
    log(`     h=${h.toExponential(0).padStart(6)}  |rtF-rtB|/scale p50 ${q(rel, 0.5).toExponential(2)} p90 ${q(rel, 0.9).toExponential(2)}   |rtF-rtB| p50 ${q(dif, 0.5).toExponential(2)}`);
  }
}
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// (4) CLOSED-FORM ANCHOR — the SAME sampler on a surface whose normal is known exactly.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('── (4) CLOSED-FORM ANCHOR: fdNormals on r(th,z) = 40 + 0.5*z/120 + 0.3*sin(8*th), exact normal known ──');
log('   If THIS ladder is flat and the rA ladder is not, the h-dependence belongs to rA/the geometry,');
log('   not to the finite-difference sampler.');
{
  const rEx = (th: number, _z: number): number => 40 + 0.5 * (_z / 120) + 0.3 * Math.sin(8 * th);
  const rExTh = (th: number): number => 2.4 * Math.cos(8 * th);
  const rExZ = (): number => 0.5 / 120;
  const nA = new Float64Array(3);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 400; i += 1) pts.push([(i * 0.61803398875 * 2 * Math.PI) % (2 * Math.PI), 5 + (i % 100)]);
  for (const h of HS) {
    const ns = fdNormals(rEx, 120, h, h);
    const errs: number[] = [];
    for (const [th, z] of pts) {
      const nc = ns(th, z, scratch);
      radialNormal(rEx(th, z), rExTh(th), rExZ(), th, nA, 0);
      let worst = 0;
      for (let i = 0; i < nc; i += 1) {
        let dp = nA[0] * scratch[i * 3] + nA[1] * scratch[i * 3 + 1] + nA[2] * scratch[i * 3 + 2];
        dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
        const a = Math.acos(dp) * DEG; if (a > worst) worst = a;
      }
      errs.push(worst);
    }
    log(`     h=${h.toExponential(0).padStart(6)}  |fd normal - exact normal| p50 ${q(errs, 0.5).toExponential(2)} deg  p90 ${q(errs, 0.9).toExponential(2)}  MAX ${mx(errs).toExponential(2)}`);
  }
}
log('');
writeFileSync(`${OUTDIR}/S114Q_HDIAG_${TAG}.json`, `${JSON.stringify({ style: STYLE, stl: STL, k: K, n: NSUB, hs: HS, ladder: tbl }, null, 2)}\n`);
log(`wrote ${OUTDIR}/S114Q_HDIAG_${TAG}.json`);
log(`done ${el()}`);
