// audTruePos.ts — WHAT IS THE **TRUE** POSITION ERROR AT THE FACETS `tangExc` CONDEMNS?
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// `audOrientCone` measured, on Voronoi's top-1500 facets by `tangExc` (tangExc p50 1327.2 um):
//     max-over-lattice distRadial (an UPPER bound on d(p) at each sampled point)  p50 29.65 um
//     distPerp at that argmax                                                     p50 12.48 um
//     truePerp / tangExc                                                          p50 0.0092
// but BOTH of those are lattice-sampled, and `distPerp` has a documented wrong-basin failure mode
// (`_facetTruthLib` records a MEASURED 26% over-statement at the default nu=180,nv=120). So neither
// is admissible as the load-bearing number.
//
// `certifyTriangle` IS admissible: it returns `witnessed` (a genuine achieved distance at a real
// point => a LOWER bound on the facet's true maximum) and `bound` = witnessed + covering radius at the
// final level (a RIGOROUS UPPER bound over the WHOLE triangle, gaps included). Two-sided, by
// construction, and it is the same instrument every H1 number in this campaign is written against.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, WRITTEN BEFORE THE FIRST RUN
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// H-E. On Voronoi the driver's plane ruler (`sagAdaptiveRaw`) reports posUm max 5.5 um and ZERO facets
//      over the 10 um product bar. The claim built on that — "position over-bar is 0, so orientation is
//      a class no ruler scores" — requires the position column to be TRUE.
//      MEASURE: `certifyTriangle` on the top-K facets by `tangExc` and on a matched RANDOM control.
//      KILL: if the top-K `witnessed` p50 is <= 10 um AND its max is <= 2x the plane ruler's 5.5 um,
//      the plane ruler is vindicated on this population and H-E is REFUTED (the position arm of the
//      SECTION 14 comparison stands).
//      CONFIRM: if `witnessed` (a LOWER bound, so it cannot be an over-statement artefact) exceeds
//      10 um on a material fraction of the top-K, then the mesh FAILS THE PRODUCT'S OWN POSITION BAR
//      at exactly those facets and the shipped ruler reports 0 — i.e. the discovery is a BROKEN
//      POSITION RULER, not a missing orientation ruler.
//
// H-F. THE RANDOM CONTROL IS WHAT MAKES IT NON-VACUOUS. If a random sample of facets shows the same
//      `witnessed` distribution as the top-K, then `tangExc` is not selecting anything and the position
//      failure is mesh-wide (still a broken ruler, but `tangExc` earns no credit for finding it).
//      If the top-K is materially worse than random, `tangExc` IS a usable DETECTOR of a position
//      defect — which is a genuinely useful result, and a different claim from the one in SECTION 14.
//      KILL: top-K witnessed p50 / random witnessed p50 < 2 => `tangExc` is not a selective detector.
//
// NOTE ON `tol`, AND A COST CORRECTION MADE BEFORE ANY NUMBER WAS TAKEN. The first configuration was
// `tol 1 um, nMax 512, exhaustive` — chasing a MAGNITUDE. It did not finish 250 facets in 10 minutes,
// because `exhaustive` spends the full level ceiling on every failing facet (512^2/2 = 131k lattice
// points, the ones over threshold each costing a descent + Newton). Killed and re-scoped, because the
// question does not need a magnitude:
//
//   THE VERDICT IS TWO-SIDED AND CHEAP AT `tol = the product bar`. `certifyTriangle` short-circuits
//   the moment `witnessed > tol` — and that witness is a REAL POINT at a REAL distance, so it is a
//   PROOF OF FAILURE, not an estimate. And `certified == true` means `bound <= tol` over the WHOLE
//   triangle, gaps included — a PROOF OF PASS. Every facet lands in `proven-fail`, `proven-pass`, or
//   `unknown` (level/sample ceiling), and the third bucket is REPORTED, never folded into either.
//
// The magnitude run is kept as a small separate group (`PF_AUDTP_MAGK` facets, exhaustive at
// tol = 0.002 mm so everything above 2 um is tightened and exact) so that one number is honest.
//
// Usage:  bash research/tools/run-aud-true-pos.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NS = Math.round(envF('PF_AUDTP_N', 250000));
const TOPK = Math.round(envF('PF_AUDTP_TOPK', 600));
const TOL = envF('PF_AUDTP_TOL_MM', 0.010);          // THE PRODUCT BAR — the verdict tol
const NMAX = Math.round(envF('PF_AUDTP_NMAX', 512));
const MAGK = Math.round(envF('PF_AUDTP_MAGK', 40));  // exhaustive magnitude subset
const MAGTOL = envF('PF_AUDTP_MAGTOL_MM', 0.002);
const MAGNMAX = Math.round(envF('PF_AUDTP_MAGNMAX', 192));
const OUT = 'research/exchange/_strataConformBisect/AUD_TRUEPOS.ndjson';
const JOBS: Array<[string, string]> = (process.env.PF_AUDTP_JOBS
  ?? 'Voronoi=voronoi_ring_D--,LowPolyFacet=lowpolyfacet_ring_D--')
  .split(',').map((s) => { const [a, b] = s.split('='); return [a, b] as [string, string]; });

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
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
const RAD = 180 / Math.PI;

log('===== AUD-TRUE-POS — certifyTriangle at the facets tangExc condemns =====');
log(`N ${NS}  topK ${TOPK}  tol ${TOL} mm  nMax ${NMAX}`);
mkdirSync('research/exchange/_strataConformBisect', { recursive: true });

for (const [style, stem] of JOBS) {
  const path = `research/exchange/_strataConformBisect/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`\n${style}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  const DIMS: StyleDims = { H: envF('PF_AUDTP_H', 120), Rb: envF('PF_AUDTP_RB', 40), Rt: envF('PF_AUDTP_RT', 50), expn: 1 };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const t0 = Date.now();
  log(`\n═════════ ${style}  (${stem}, ${nTri} facets) ═════════`);

  const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
  log(`  closure: detectZJumps ${zJ.length}   detectThetaJumps ${thJ.length}`);

  const step = Math.max(1, Math.floor(nTri / NS));
  const n = Math.floor(nTri / step);
  const ta = new Int32Array(n); const tb = new Int32Array(n); const tc = new Int32Array(n);
  const vth = new Float64Array(3 * n); const vz = new Float64Array(3 * n);
  const vx = new Float64Array(3 * n); const vy = new Float64Array(3 * n);
  for (let k = 0; k < n; k += 1) {
    const o = (k * step) * 9;
    for (let v = 0; v < 3; v += 1) { vx[3 * k + v] = xyz[o + 3 * v]; vy[3 * k + v] = xyz[o + 3 * v + 1]; vz[3 * k + v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(vy[3 * k], vx[3 * k]);
    vth[3 * k] = thA;
    vth[3 * k + 1] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 1], vx[3 * k + 1]));
    vth[3 * k + 2] = thA + dThRaw(thA, Math.atan2(vy[3 * k + 2], vx[3 * k + 2]));
    ta[k] = 3 * k; tb[k] = 3 * k + 1; tc[k] = 3 * k + 2;
  }
  const SAGM: SagMesh = { ta, tb, tc, vth, vz, vx, vy }; const ARG = makeSagArgmax();

  // tangExc exactly as s58 computes it (per-facet radial flip, single central-difference normal)
  const tg = new Float64Array(n);
  for (let k = 0; k < n; k += 1) {
    const ax = vx[3 * k]; const ay = vy[3 * k]; const az = vz[3 * k];
    const bx = vx[3 * k + 1]; const by = vy[3 * k + 1]; const bz = vz[3 * k + 1];
    const cx = vx[3 * k + 2]; const cy = vy[3 * k + 2]; const cz = vz[3 * k + 2];
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) { tg[k] = 0; continue; }
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thc = (vth[3 * k] + vth[3 * k + 1] + vth[3 * k + 2]) / 3;
    const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
    const r = rA(thc, zc);
    const h1 = 1e-5 / Math.max(1e-6, r); const h2 = 1e-5;
    const rTh = (rA(thc + h1, zc) - rA(thc - h1, zc)) / (2 * h1);
    const zp = Math.min(H, zc + h2); const zm = Math.max(0, zc - h2);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
    tg[k] = Math.sin(Math.acos(dot)) * diam * 1000;
  }

  const order = Array.from({ length: n }, (_v, i) => i).sort((p, q) => tg[q] - tg[p]);
  const top = order.slice(0, Math.min(TOPK, n));
  // deterministic pseudo-random control of the same size (golden-ratio stride, so it spans the mesh)
  const ctrl: number[] = [];
  {
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    let s = Math.max(1, Math.round(n * 0.6180339887498949) | 1);
    while (s > 1 && gcd(s, n) !== 1) s += 2;
    if (s >= n) s = 1;
    for (let q = 0; q < Math.min(TOPK, n); q += 1) ctrl.push((q * s) % n);
  }

  // ── THE VERDICT PASS: three buckets, and the third one is printed rather than folded away.
  const runGroup = (idxs: number[], label: string): Record<string, number> => {
    const wit: number[] = []; const bnd: number[] = []; const pos: number[] = []; const tge: number[] = [];
    let nFailProven = 0; let nPassProven = 0; let nUnknown = 0; let posOverBar = 0;
    const tg0 = Date.now();
    for (const k of idxs) {
      const v = certifyTriangle(rA,
        vx[3 * k], vy[3 * k], vz[3 * k],
        vx[3 * k + 1], vy[3 * k + 1], vz[3 * k + 1],
        vx[3 * k + 2], vy[3 * k + 2], vz[3 * k + 2],
        { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
      wit.push(v.witnessed * 1000); bnd.push(v.bound * 1000);
      if (v.witnessed > TOL) nFailProven += 1;            // a REAL point at a REAL distance over the bar
      else if (v.certified) nPassProven += 1;             // bound <= tol over the WHOLE triangle
      else nUnknown += 1;                                 // level/sample ceiling — neither proven
      const pv = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000;
      pos.push(pv); if (pv > TOL * 1000) posOverBar += 1;
      tge.push(tg[k]);
    }
    const sw = S(wit); const sb = S(bnd); const sp = S(pos); const st = S(tge);
    log(`  ── ${label} (n=${idxs.length}, ${((Date.now() - tg0) / 1000).toFixed(1)}s) ─────────────────────────────`);
    log(`     tangExc                     p50 ${pq(st, 0.5).toFixed(1).padStart(9)}  p99 ${pq(st, 0.99).toFixed(1).padStart(9)}  max ${st[st.length - 1].toFixed(1).padStart(9)} um`);
    log(`     *** H1 VERDICT at the ${(TOL * 1000).toFixed(0)} um PRODUCT BAR:  PROVEN-FAIL ${nFailProven}   PROVEN-PASS ${nPassProven}   UNKNOWN ${nUnknown}  (of ${idxs.length}) ***`);
    log(`     H1 witnessed (>= true max at short-circuit is a LOWER bound)  p50 ${pq(sw, 0.5).toFixed(2)}  p99 ${pq(sw, 0.99).toFixed(2)}  max ${sw[sw.length - 1].toFixed(2)} um`);
    log(`     H1 bound                     p50 ${pq(sb, 0.5).toFixed(2)}  p99 ${pq(sb, 0.99).toFixed(2)}  max ${sb[sb.length - 1].toFixed(2)} um`);
    log(`     driver plane ruler posUm     p50 ${pq(sp, 0.5).toFixed(2)}  p99 ${pq(sp, 0.99).toFixed(2)}  max ${sp[sp.length - 1].toFixed(2)} um   over-bar ${posOverBar}/${idxs.length}`);
    log(`     *** THE HEAD-TO-HEAD: H1 proves ${nFailProven} FAILURES where the plane ruler reports ${posOverBar} ***`);
    return {
      failProven: nFailProven, passProven: nPassProven, unknown: nUnknown,
      witP50: pq(sw, 0.5), witP99: pq(sw, 0.99), witMax: sw[sw.length - 1],
      bndP50: pq(sb, 0.5), bndMax: sb[sb.length - 1],
      posP50: pq(sp, 0.5), posP99: pq(sp, 0.99), posMax: sp[sp.length - 1], posOverBar,
      tgP50: pq(st, 0.5), tgMax: st[st.length - 1], n: idxs.length,
    };
  };

  const gTop = runGroup(top, `TOP-${top.length} BY tangExc`);
  const gCtl = runGroup(ctrl, `RANDOM CONTROL, same size`);
  // ── THE OTHER SIDE OF THE TWO-SIDEDNESS (task 4). The tangExc tail exposes where the plane ruler
  // UNDER-reads. To see where it OVER-reads, select on the PLANE RULER ITSELF: its own worst facets,
  // scored by H1. The operator's S39CTL example is exactly this — plane 47.281 where the mesh is 22.190.
  const posAll = new Float64Array(n);
  for (let k = 0; k < n; k += 1) posAll[k] = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000;
  const topPos = Array.from({ length: n }, (_v, i) => i).sort((p, q) => posAll[q] - posAll[p]).slice(0, Math.min(TOPK, n));
  const gPos = runGroup(topPos, `TOP-${topPos.length} BY THE PLANE RULER ITSELF (the OVER-read arm)`);
  log('');
  log(`  H-F selectivity: top-K proven-fail rate / control proven-fail rate = ${((gTop.failProven / gTop.n) / Math.max(1e-9, gCtl.failProven / gCtl.n)).toFixed(2)}x   (kill < 2x)`);
  log(`  TWO-SIDEDNESS on this style:  plane/H1 at the plane ruler's own worst  p50 ${(gPos.posP50 / Math.max(1e-9, gPos.witP50)).toFixed(3)}x   max/max ${(gPos.posMax / Math.max(1e-9, gPos.witMax)).toFixed(3)}x`);
  log(`                                H1/plane at the tangExc tail            p50 ${(gTop.witP50 / Math.max(1e-9, gTop.posP50)).toFixed(2)}x   max/max ${(gTop.witMax / Math.max(1e-9, gTop.posMax)).toFixed(2)}x`);
  log(`  A single multiplicative correction exists ONLY if these two are reciprocal. Read them.`);

  // ── THE MAGNITUDE PASS: small, exhaustive, tol below everything of interest so it is exact.
  const mag = top.slice(0, Math.min(MAGK, top.length));
  const mw: number[] = []; const mb: number[] = []; const mt: number[] = []; let mComplete = 0;
  const tm0 = Date.now();
  for (const k of mag) {
    const v = certifyTriangle(rA,
      vx[3 * k], vy[3 * k], vz[3 * k],
      vx[3 * k + 1], vy[3 * k + 1], vz[3 * k + 1],
      vx[3 * k + 2], vy[3 * k + 2], vz[3 * k + 2],
      { H, tol: MAGTOL, nMax: MAGNMAX, exhaustive: true, zJumps: zJ, thJumps: thJ });
    mw.push(v.witnessed * 1000); mb.push(v.bound * 1000); mt.push(tg[k]);
    if (v.witnessedComplete) mComplete += 1;
  }
  const smw = S(mw); const smb = S(mb); const smt = S(mt);
  log(`  ── MAGNITUDE, exhaustive, tol ${MAGTOL * 1000} um, nMax ${MAGNMAX} (n=${mag.length}, ${((Date.now() - tm0) / 1000).toFixed(1)}s) ──`);
  log(`     tangExc       p50 ${pq(smt, 0.5).toFixed(1)}  max ${smt[smt.length - 1].toFixed(1)} um`);
  log(`     H1 witnessed  p50 ${pq(smw, 0.5).toFixed(2)}  p90 ${pq(smw, 0.9).toFixed(2)}  max ${smw[smw.length - 1].toFixed(2)} um   (witnessedComplete ${mComplete}/${mag.length})`);
  log(`     H1 bound      p50 ${pq(smb, 0.5).toFixed(2)}  max ${smb[smb.length - 1].toFixed(2)} um`);
  log(`     *** tangExc / H1 witnessed  p50 ${(pq(smt, 0.5) / Math.max(1e-9, pq(smw, 0.5))).toFixed(1)}x ***`);
  appendFileSync(OUT, `${JSON.stringify({
    style, stem, nTri, sampled: n, tol: TOL, nMax: NMAX, zJumps: zJ.length, thJumps: thJ.length,
    top: gTop, ctrl: gCtl, byPlaneRuler: gPos,
    magnitude: { n: mag.length, tol: MAGTOL, nMax: MAGNMAX, witP50: pq(smw, 0.5), witMax: smw[smw.length - 1], bndP50: pq(smb, 0.5), bndMax: smb[smb.length - 1], tgP50: pq(smt, 0.5), complete: mComplete },
    secs: (Date.now() - t0) / 1000,
  })}\n`);
  log(`  [checkpoint appended to ${OUT}]`);
}
log('');
log(`done (RAD sentinel ${RAD.toFixed(0)})`);
