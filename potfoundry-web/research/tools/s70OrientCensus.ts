// s70OrientCensus.ts — THE ORIENTATION RULER ON REAL MESHES, and the REAL-MESH half of H2.
//
// Pre-registration and fixture results: research/exchange/_strataConformBisect/S61_GUARD_FINDINGS.md.
//
// WHAT THIS RUN DECIDES (kill-criteria fixed before it was written):
//
//  H2-real  On a crease-straddling facet the orientation ANGLE is density-invariant.
//           CONFIRMED if `normDeg p99` within the CREASE population (kinkDeg > 1) is FLAT (< 1.5x) across
//           a >= 8x span of facet `diam`. REFUTED if it falls >= 3x. The SMOOTH population (kinkDeg <= 1)
//           is the built-in control and must behave the OTHER way, or the binning is measuring size, not
//           mechanism.
//
//  V1       The instrument reproduces the published S58 numbers when run in the published MODE.
//           `legacyTangMm` at k=1 with no inset is the S55/S58 expression; its p99 must land within 20%
//           of the published value per style, or one of the two runs is not measuring what it says.
//
//  V2       The centroid under-read that fixture F1 derives analytically (x3.00) must be VISIBLE on real
//           meshes: `normDeg` at k=4 must exceed `normDeg` at k=1-centroid-only by a factor > 1.2.
//
// Every reading is paired with the DRIVER'S OWN position ruler (`sagAdaptiveRaw`, same call as S55/S58)
// so no row can be quoted on one ruler alone.
//
// Usage:  bash research/tools/run-s70-orient-census.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { orientOfFacet, fdNormals, fdNormalsCentral } from '../bridge/orientRuler';
import { aspect3 } from '../bridge/_shapeGuard';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NS = Math.round(envF('PF_S70_N', 2000000));
const GATE = envF('PF_S70_GATE_MM', 0.05);
const K = Math.round(envF('PF_S70_K', 4));
const INSET = envF('PF_S70_INSET', 0.01);
const OUTDIR = 'research/exchange/_strataConformBisect';
const NDJSON = `${OUTDIR}/S70_orient_census.ndjson`;
const DEG = 180 / Math.PI;

const JOBS: Array<[string, string]> = (process.env.PF_S70_JOBS
  ?? 'Voronoi=voronoi_ring_D--,LowPolyFacet=lowpolyfacet_ring_D--,GothicArches=gothicarches_ring_DS-HT_S39CTL')
  .split(',').map((s) => { const [a, b] = s.split('='); return [a, b] as [string, string]; });
// the S58 published rows, so V1 is checked against a NUMBER and not against a memory
const PUBLISHED: Record<string, { tangP99: number; over: number; posP99: number }> = {
  Voronoi: { tangP99: 1222.82, over: 39.696, posP99: 4.90 },
  LowPolyFacet: { tangP99: 28.48, over: 10.887, posP99: 4.95 },
  GothicArches: { tangP99: 36.05, over: 11.371, posP99: 3.42 },
};

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
const pq = (a: Float64Array | number[], f: number): number => {
  const L = a.length; return L === 0 ? 0 : a[Math.min(L - 1, Math.floor(f * L))];
};
const sortedSub = (src: Float64Array, idx: number[]): Float64Array => {
  const o = new Float64Array(idx.length);
  for (let i = 0; i < idx.length; i += 1) o[i] = src[idx[i]];
  o.sort(); return o;
};

mkdirSync(OUTDIR, { recursive: true });
log('===== S70 — ORIENTATION CENSUS on real meshes =====');
log(`k=${K} barycentric lattice (${((K + 1) * (K + 2)) / 2} points/facet, 5 rA evals each), inset=${INSET}`);
log(`gate: vertex-on-surface p99 <= ${GATE} mm or the row is UNTRUSTED`);

for (const [style, stem] of JOBS) {
  const t0 = Date.now();
  const path = `${OUTDIR}/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`\n${style}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  const DIMS: StyleDims = { H: envF('PF_S70_H', 120), Rb: envF('PF_S70_RB', 40), Rt: envF('PF_S70_RT', 50), expn: envF('PF_S70_EXPN', 1) };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  let evals = 0;
  const rA = (th: number, z: number): number => { evals += 1; return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z); };

  log(`\n───────── ${style}  (${stem}, ${nTri} facets) ─────────`);
  const gres: number[] = [];
  const gstep = Math.max(1, Math.floor((nTri * 3) / 50000));
  for (let i = 0; i < nTri * 3; i += gstep) {
    const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
    gres.push(Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z)));
  }
  gres.sort((a, b) => a - b);
  const gp99 = pq(gres, 0.99);
  const trusted = gp99 <= GATE;
  log(`  GATE vertex-on-surface: p50 ${pq(gres, 0.5).toFixed(6)}  p99 ${gp99.toFixed(6)}  max ${gres[gres.length - 1].toFixed(6)} mm  -> ${trusted ? 'TRUSTED' : '*** UNTRUSTED ***'}`);

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
  const nsK = fdNormals(rA, H);
  const nsC = fdNormalsCentral(rA, H);
  const scratch = new Float64Array(12);

  const aND = new Float64Array(n); const aTG = new Float64Array(n); const aLEG = new Float64Array(n);
  const aPOS = new Float64Array(n); const aKINK = new Float64Array(n); const aDIAM = new Float64Array(n);
  const aND1 = new Float64Array(n); const aSPR = new Float64Array(n);
  const aOVF = new Float64Array(n); const aMEAN = new Float64Array(n);
  const aAREA = new Float64Array(n); const aOVF1 = new Float64Array(n); const aOVF30 = new Float64Array(n);
  const aAR = new Float64Array(n);
  let evalsOrient = 0;
  for (let k = 0; k < n; k += 1) {
    const i0 = 3 * k;
    const e0 = evals;
    const o = orientOfFacet(
      nsK,
      vx[i0], vy[i0], vz[i0], vx[i0 + 1], vy[i0 + 1], vz[i0 + 1], vx[i0 + 2], vy[i0 + 2], vz[i0 + 2],
      vth[i0], vth[i0 + 1], vth[i0 + 2],
      { k: K, inset: INSET, orient: 'outward', scratch },
    );
    evalsOrient += evals - e0;
    // ── the S55/S58 MODE, VERBATIM (s55OrientHeatmap.ts:84-102): ONE central-difference normal at the
    // parameter CENTROID, h = 1e-5. Reproduced inline rather than through `orientOfFacet`, because
    // `orientOfFacet` with k=1 samples the three parameter VERTICES and that is a different quantity —
    // an earlier version of this file made exactly that substitution and inflated Voronoi's over-10um
    // count from 39.7% to 72.2% while leaving the p99 correct. V1 is a validity gate; it has to be the
    // published expression and not a near neighbour of it.
    let s5 = 0;
    {
      const ax = vx[i0]; const ay = vy[i0]; const az = vz[i0];
      const bx = vx[i0 + 1]; const by = vy[i0 + 1]; const bz = vz[i0 + 1];
      const cx = vx[i0 + 2]; const cy = vy[i0 + 2]; const cz = vz[i0 + 2];
      let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const fl = Math.hypot(fx, fy, fz);
      if (fl > 1e-18) {
        fx /= fl; fy /= fl; fz /= fl;
        const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
        if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
        const thc = (vth[i0] + vth[i0 + 1] + vth[i0 + 2]) / 3;
        const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
        const r = rA(thc, zc);
        const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
        const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
        const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
        const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
        const cc = Math.cos(thc); const ss = Math.sin(thc);
        let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
        const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
        let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
        s5 = Math.acos(dot);
      }
    }
    aND[k] = Number.isFinite(o.normDeg) ? o.normDeg : 0;
    aND1[k] = (s5 * 180) / Math.PI;
    aTG[k] = Number.isFinite(o.tangMm) ? o.tangMm * 1000 : 0;
    aLEG[k] = Math.sin(s5) * o.diam * 1000;
    aKINK[k] = Number.isFinite(o.kinkRad) ? o.kinkRad * DEG : 0;
    aSPR[k] = Number.isFinite(o.spreadRad) ? o.spreadRad * DEG : 0;
    aOVF[k] = Number.isFinite(o.overFrac) ? o.overFrac : 0;
    {
      const ux = vx[i0 + 1] - vx[i0]; const uy = vy[i0 + 1] - vy[i0]; const uz = vz[i0 + 1] - vz[i0];
      const wx = vx[i0 + 2] - vx[i0]; const wy = vy[i0 + 2] - vy[i0]; const wz = vz[i0 + 2] - vz[i0];
      aAREA[k] = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    }
    aAR[k] = aspect3(vx[i0], vy[i0], vz[i0], vx[i0 + 1], vy[i0 + 1], vz[i0 + 1], vx[i0 + 2], vy[i0 + 2], vz[i0 + 2]);
    const o1d = orientOfFacet(nsK, vx[i0], vy[i0], vz[i0], vx[i0 + 1], vy[i0 + 1], vz[i0 + 1], vx[i0 + 2], vy[i0 + 2], vz[i0 + 2],
      vth[i0], vth[i0 + 1], vth[i0 + 2], { k: K, inset: INSET, orient: 'outward', scratch, barRad: Math.PI / 180 });
    aOVF1[k] = Number.isFinite(o1d.overFrac) ? o1d.overFrac : 0;
    const o30 = orientOfFacet(nsK, vx[i0], vy[i0], vz[i0], vx[i0 + 1], vy[i0 + 1], vz[i0 + 1], vx[i0 + 2], vy[i0 + 2], vz[i0 + 2],
      vth[i0], vth[i0 + 1], vth[i0 + 2], { k: K, inset: INSET, orient: 'outward', scratch, barRad: (30 * Math.PI) / 180 });
    aOVF30[k] = Number.isFinite(o30.overFrac) ? o30.overFrac : 0;
    aMEAN[k] = Number.isFinite(o.meanRad) ? o.meanRad * DEG : 0;
    aDIAM[k] = o.diam;
    aPOS[k] = sagAdaptiveRaw(rA, SAGM, k, 0.03, 12, 64, ARG) * 1000;
  }

  const sND = Float64Array.from(aND).sort();
  const sTG = Float64Array.from(aTG).sort();
  const sLEG = Float64Array.from(aLEG).sort();
  const sPOS = Float64Array.from(aPOS).sort();
  const sKINK = Float64Array.from(aKINK).sort();
  const sSPR = Float64Array.from(aSPR).sort();
  const sMEAN = Float64Array.from(aMEAN).sort();
  const cnt = (a: Float64Array, v: number): number => { let c = 0; for (let i = 0; i < a.length; i += 1) if (a[i] > v) c += 1; return c; };
  const pct = (c: number): string => `${((100 * c) / n).toFixed(3)}%`;

  log(`  POSITION  sagAdaptiveRaw   p50 ${pq(sPOS, 0.5).toFixed(3)}  p99 ${pq(sPOS, 0.99).toFixed(3)}  max ${sPOS[n - 1].toFixed(3)} um   over-10um ${cnt(sPOS, 10)} (${pct(cnt(sPOS, 10))})`);
  log(`  ORIENT deg  k=${K}+inset    p50 ${pq(sND, 0.5).toFixed(4)}  p90 ${pq(sND, 0.9).toFixed(4)}  p99 ${pq(sND, 0.99).toFixed(4)}  max ${sND[n - 1].toFixed(4)}`);
  log(`     over 1deg ${cnt(sND, 1)} (${pct(cnt(sND, 1))})   over 5deg ${cnt(sND, 5)} (${pct(cnt(sND, 5))})   over 30deg ${cnt(sND, 30)} (${pct(cnt(sND, 30))})`);
  log(`  ORIENT mm   2sin(a/2)*diam p50 ${pq(sTG, 0.5).toFixed(3)}  p99 ${pq(sTG, 0.99).toFixed(3)}  max ${sTG[n - 1].toFixed(3)} um   over-10um ${cnt(sTG, 10)} (${pct(cnt(sTG, 10))})`);
  log(`  LEGACY mm   s55 mode        p99 ${pq(sLEG, 0.99).toFixed(3)}  max ${sLEG[n - 1].toFixed(3)} um   over-10um ${cnt(sLEG, 10)} (${pct(cnt(sLEG, 10))})`);
  const pub = PUBLISHED[style];
  if (pub !== undefined) {
    log(`  V1 vs S58 published: legacy p99 ${pq(sLEG, 0.99).toFixed(2)} vs ${pub.tangP99}  (${(pq(sLEG, 0.99) / pub.tangP99).toFixed(3)}x)   over10 ${pct(cnt(sLEG, 10))} vs ${pub.over}%   pos p99 ${pq(sPOS, 0.99).toFixed(2)} vs ${pub.posP99}`);
  }
  log(`  V2 centroid under-read: normDeg p99 k=${K} ${pq(sND, 0.99).toFixed(4)} vs centroid-only ${pq(Float64Array.from(aND1).sort(), 0.99).toFixed(4)}  = ${(pq(sND, 0.99) / Math.max(1e-9, pq(Float64Array.from(aND1).sort(), 0.99))).toFixed(3)}x`);
  log(`  KINK deg (h-local)         p99 ${pq(sKINK, 0.99).toFixed(4)}  max ${sKINK[n - 1].toFixed(4)}   over 1deg ${cnt(sKINK, 1)} (${pct(cnt(sKINK, 1))})`);
  log(`  SPREAD deg (h-free)        p50 ${pq(sSPR, 0.5).toFixed(4)}  p99 ${pq(sSPR, 0.99).toFixed(4)}  max ${sSPR[n - 1].toFixed(4)}   over 1deg ${cnt(sSPR, 1)} (${pct(cnt(sSPR, 1))})`);
  log(`  MEAN deg (area-avg)        p50 ${pq(sMEAN, 0.5).toFixed(4)}  p99 ${pq(sMEAN, 0.99).toFixed(4)}  max ${sMEAN[n - 1].toFixed(4)}`);
  // *** THE AREA QUESTION. A sup is attained if ANY point is over the bar. For every facet whose sup is
  // over 5 deg, how much of it is actually over 5 deg? A "hair" population (overFrac tiny) is a boundary
  // being counted as a defect; a "bulk" population (overFrac ~ 1) is a real defect over real area.
  {
    const bad: number[] = [];
    for (let i = 0; i < n; i += 1) if (aND[i] > 5) bad.push(aOVF[i]);
    bad.sort((x, y) => x - y);
    const hair = bad.filter((v) => v < 0.05).length; const bulk = bad.filter((v) => v > 0.5).length;
    log(`  AREA of the ${bad.length} facets whose SUP exceeds 5 deg: overFrac p05 ${pq(bad, 0.05).toFixed(4)}  p50 ${pq(bad, 0.5).toFixed(4)}  p95 ${pq(bad, 0.95).toFixed(4)}`);
    log(`     HAIR (<5% of the facet over 5deg) ${hair} (${((100 * hair) / Math.max(1, bad.length)).toFixed(1)}%)   BULK (>50%) ${bulk} (${((100 * bulk) / Math.max(1, bad.length)).toFixed(1)}%)`);
  }
  // ══════════ THE AREA-TRUE HEADLINE ══════════
  // The SUP of the angle is density-INVARIANT on a turn (S61 H2) and is therefore useless as a
  // convergence measure. The AREA of the SURFACE whose normal the mesh gets wrong by more than a bar is
  // not: a straddle band of width ~h around a crease has area ~ creaseLength * h, so it falls LINEARLY
  // under refinement and to ~0 under alignment. This is the statistic S53's five-arm sweep should have
  // read; it read the p99 of the sup and correctly found it flat.
  {
    let tot = 0; let b1 = 0; let b5 = 0; let b30 = 0;
    for (let i = 0; i < n; i += 1) { tot += aAREA[i]; b1 += aAREA[i] * aOVF1[i]; b5 += aAREA[i] * aOVF[i]; b30 += aAREA[i] * aOVF30[i]; }
    log(`  *** AREA-TRUE: fraction of the SURFACE mis-oriented by more than ...`);
    log(`        1 deg  ${((100 * b1) / tot).toFixed(4)}%      5 deg  ${((100 * b5) / tot).toFixed(4)}%      30 deg  ${((100 * b30) / tot).toFixed(4)}%     (total area ${tot.toFixed(1)} mm^2)`);
    log(`      compare FACET COUNTS over the same bars: ${((100 * cnt(sND, 1)) / n).toFixed(4)}% / ${((100 * cnt(sND, 5)) / n).toFixed(4)}% / ${((100 * cnt(sND, 30)) / n).toFixed(4)}%`);
    log(`      => the facet count over-states the mis-oriented AREA by ${(cnt(sND, 5) / n / Math.max(1e-12, b5 / tot)).toFixed(2)}x at the 5 deg bar`);
  }
  // THE DIAGNOSIS TABLE: what KIND of orientation failure is each over-bar facet?
  //   spread SMALL + normDeg LARGE  = MIS-ORIENTED against a nearly-constant normal field -> fixable by
  //                                   flip/placement at ZERO triangle cost
  //   spread LARGE                  = the surface TURNS inside the facet -> must SPLIT or ALIGN
  {
    let misOriented = 0; let turning = 0; let clean = 0;
    for (let i = 0; i < n; i += 1) {
      if (aND[i] <= 1) { clean += 1; continue; }
      if (aSPR[i] < 0.5 * aND[i]) misOriented += 1; else turning += 1;
    }
    const bad = misOriented + turning;
    // *** IS THE "MIS-ORIENTED" POPULATION JUST THE SLIVERS? *** A near-degenerate triangle's plane is
    // numerically undetermined, so its normal can be anything while the surface under it barely moves.
    // If that is what this population is, it is a SHAPE defect wearing an orientation costume and the
    // repo's existing aspect3 guard already owns it. Cross-tabbed rather than assumed.
    const arMis: number[] = []; const arTurn: number[] = []; const arAll: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const v = Number.isFinite(aAR[i]) ? aAR[i] : 1e9;
      arAll.push(v);
      if (aND[i] <= 1) continue;
      if (aSPR[i] < 0.5 * aND[i]) arMis.push(v); else arTurn.push(v);
    }
    arMis.sort((x, y) => x - y); arTurn.sort((x, y) => x - y); arAll.sort((x, y) => x - y);
    const pa = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
    log(`  aspect3 by population:  WHOLE MESH p50 ${pa(arAll, 0.5).toFixed(3)} p90 ${pa(arAll, 0.9).toFixed(3)} p99 ${pa(arAll, 0.99).toFixed(2)}`);
    log(`                          MIS-ORIENTED p50 ${pa(arMis, 0.5).toFixed(3)} p90 ${pa(arMis, 0.9).toFixed(3)} p99 ${pa(arMis, 0.99).toFixed(2)}   (n=${arMis.length})`);
    log(`                          TURNING      p50 ${pa(arTurn, 0.5).toFixed(3)} p90 ${pa(arTurn, 0.9).toFixed(3)} p99 ${pa(arTurn, 0.99).toFixed(2)}   (n=${arTurn.length})`);
    log(`  DIAGNOSIS of the ${bad} facets over 1 deg:  MIS-ORIENTED (spread < normDeg/2) ${misOriented} (${((100 * misOriented) / Math.max(1, bad)).toFixed(1)}%)   TURNING ${turning} (${((100 * turning) / Math.max(1, bad)).toFixed(1)}%)   [clean ${clean}]`);
  }

  // ── H2-real: normDeg p99 by diam OCTAVE, split by crease population
  const crease: number[] = []; const smooth: number[] = [];
  for (let k = 0; k < n; k += 1) (aSPR[k] > 1 ? crease : smooth).push(k);
  log(`  populations: TURNING(spread>1deg) ${crease.length} (${pct(crease.length)})   SMOOTH ${smooth.length}`);
  const octave = (d: number): number => Math.floor(Math.log2(Math.max(1e-9, d)));
  for (const [name, idx] of [['TURNING', crease], ['NON-TURNING', smooth]] as Array<[string, number[]]>) {
    if (idx.length < 200) { log(`  H2 ${name}: too few facets (${idx.length})`); continue; }
    const byOct = new Map<number, number[]>();
    for (const i of idx) { const o = octave(aDIAM[i]); let a = byOct.get(o); if (a === undefined) { a = []; byOct.set(o, a); } a.push(i); }
    const octs = [...byOct.keys()].sort((a, b) => a - b).filter((o) => (byOct.get(o) as number[]).length >= 100);
    log(`  H2 ${name} — normDeg p99 by diam octave (mm):`);
    const p99s: Array<[number, number, number, number]> = [];
    for (const o of octs) {
      const ii = byOct.get(o) as number[];
      const s = sortedSub(aND, ii); const sp = sortedSub(aPOS, ii); const st = sortedSub(aTG, ii);
      const sm = sortedSub(aMEAN, ii);
      // *** p99 OF A SUP IS A TAIL STATISTIC AND CANNOT SHOW CONVERGENCE (S74 §11). *** The MEAN angle and
      // the area fraction are what a smooth-but-under-resolved population moves on, so they are printed
      // beside the p99 rather than instead of it.
      let ta = 0; let ba = 0;
      for (const i2 of ii) { ta += aAREA[i2]; ba += aAREA[i2] * aOVF[i2]; }
      p99s.push([o, pq(s, 0.99), pq(sp, 0.99), pq(st, 0.99)]);
      log(`     diam [2^${o} = ${(2 ** o).toExponential(2)}, 2^${o + 1})  n=${String(ii.length).padStart(7)}   normDeg p99 ${pq(s, 0.99).toFixed(4).padStart(9)}  p50 ${pq(s, 0.5).toFixed(4).padStart(8)}  MEAN p50 ${pq(sm, 0.5).toFixed(4).padStart(8)}  areaOver5deg ${((100 * ba) / Math.max(1e-12, ta)).toFixed(3).padStart(7)}%   posUm p99 ${pq(sp, 0.99).toFixed(3).padStart(7)}   tangUm p99 ${pq(st, 0.99).toFixed(2).padStart(9)}`);
    }
    if (p99s.length >= 4) {
      const lo = p99s[0][1]; const hi = p99s[p99s.length - 1][1];
      const span = 2 ** (p99s[p99s.length - 1][0] - p99s[0][0]);
      log(`     => over a ${span}x diam span, normDeg p99 moves ${(hi / Math.max(1e-12, lo)).toFixed(3)}x   [H2 CONFIRMED if < 1.5x on CREASE]`);
    }
  }
  const dt = (Date.now() - t0) / 1000;
  log(`  ${(evalsOrient / 1e6).toFixed(1)} M rA evals for orientation (${(evalsOrient / n).toFixed(1)}/facet), ${dt.toFixed(0)} s`);
  // CHECKPOINT the instant the style's numbers exist
  appendFileSync(NDJSON, `${JSON.stringify({
    ts: new Date().toISOString(), style, stem, nTri, n, K, INSET, trusted, gateP99: gp99,
    posP50: pq(sPOS, 0.5), posP99: pq(sPOS, 0.99), posMax: sPOS[n - 1], posOver10: cnt(sPOS, 10),
    ndP50: pq(sND, 0.5), ndP99: pq(sND, 0.99), ndMax: sND[n - 1],
    ndOver1: cnt(sND, 1), ndOver5: cnt(sND, 5), ndOver30: cnt(sND, 30),
    tgP99: pq(sTG, 0.99), tgMax: sTG[n - 1], tgOver10: cnt(sTG, 10),
    legP99: pq(sLEG, 0.99), legOver10: cnt(sLEG, 10),
    kinkP99: pq(sKINK, 0.99), kinkOver1: cnt(sKINK, 1),
    sprP99: pq(sSPR, 0.99), sprMax: sSPR[n - 1], sprOver1: cnt(sSPR, 1),
    meanP50: pq(sMEAN, 0.5), meanP99: pq(sMEAN, 0.99),
    areaFrac1: (() => { let t = 0; let b = 0; for (let i = 0; i < n; i += 1) { t += aAREA[i]; b += aAREA[i] * aOVF1[i]; } return b / t; })(),
    areaFrac5: (() => { let t = 0; let b = 0; for (let i = 0; i < n; i += 1) { t += aAREA[i]; b += aAREA[i] * aOVF[i]; } return b / t; })(),
    areaFrac30: (() => { let t = 0; let b = 0; for (let i = 0; i < n; i += 1) { t += aAREA[i]; b += aAREA[i] * aOVF30[i]; } return b / t; })(),
    evalsPerFacet: evalsOrient / n, secs: dt,
  })}\n`);
}
log(`\nndjson checkpoint: ${NDJSON}`);
log('done');
