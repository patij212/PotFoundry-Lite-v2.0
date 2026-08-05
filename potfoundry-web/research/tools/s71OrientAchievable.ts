// s71OrientAchievable.ts — CAN A SINGLE SPLIT FIX A TURNING FACET, AND IS THE PLACEMENT FINDABLE CHEAPLY?
//
// Pre-registration (arms + kill-criterion) : research/exchange/_strataConformBisect/S61_GUARD_FINDINGS.md §3.
//
// This is the CHEAPEST DISCRIMINATOR for the whole guard design and it runs READ-ONLY over a finished STL,
// with no mesher, no fork and no arm. S70 established that the failure class is facets inside which the
// surface TURNS, and that refining them does not reduce the angle (x1.001 over an 8x size span). The only
// remaining lever is ALIGNMENT. Before forking a 5,616-line driver to implement alignment, this asks
// whether alignment can work AT ALL, by trying every placement offline:
//
//   M     midpoint of the LONGEST edge                    (the driver's Rivara default)
//   Mall  best of the three edges, each at its midpoint    (what a smarter edge CHOICE alone would buy)
//   B     best over 3 edges x a 17-point s-grid            (the ORIENT-SNAP IDEAL, unaffordable online)
//   Kink  `locateTurn` — 14 normal evals of Gauss-map bisection   (the CHEAP, BUILDABLE rule)
//
// Every child is built exactly as `bisectAt` would build it: the split point is the PARAMETRIC point on
// the (theta,z) segment, lifted by rA, and both children are (a, M, apex) and (M, b, apex).
//
// Usage:  bash research/tools/run-s71-orient-achievable.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals, locateTurn } from '../bridge/orientRuler';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NCAP = Math.round(envF('PF_S71_NCAP', 12000));       // TURNING facets sampled per style
const K = Math.round(envF('PF_S71_K', 4));
const INSET = envF('PF_S71_INSET', 0.01);
const SPREAD_MIN = envF('PF_S71_SPREAD', 1.0);             // deg — the TURNING gate from S70
const NS_GRID = Math.round(envF('PF_S71_GRID', 17));
const OUTDIR = 'research/exchange/_strataConformBisect';
const NDJSON = `${OUTDIR}/S71_achievable.ndjson`;
const DEG = 180 / Math.PI;

const JOBS: Array<[string, string]> = (process.env.PF_S71_JOBS
  ?? 'LowPolyFacet=lowpolyfacet_ring_D--,Voronoi=voronoi_ring_D--,GothicArches=gothicarches_ring_DS-HT_S39CTL')
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
const frac = (a: number[], v: number): number => a.filter((x) => x < v).length / Math.max(1, a.length);

mkdirSync(OUTDIR, { recursive: true });
log('===== S71 — IS THE TURNING CLASS FIXABLE BY PLACEMENT? =====');
log(`TURNING gate spread > ${SPREAD_MIN} deg; ruler k=${K} inset=${INSET}; s-grid ${NS_GRID}; cap ${NCAP} facets/style`);

for (const [style, stem] of JOBS) {
  const t0 = Date.now();
  const path = `${OUTDIR}/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`\n${style}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  const DIMS: StyleDims = { H: envF('PF_S71_H', 120), Rb: envF('PF_S71_RB', 40), Rt: envF('PF_S71_RT', 50), expn: envF('PF_S71_EXPN', 1) };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  let evals = 0;
  const rA = (th: number, z: number): number => { evals += 1; return rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z); };
  const ns = fdNormals(rA, H);
  const scratch = new Float64Array(12);
  log(`\n───────── ${style}  (${stem}, ${nTri} facets) ─────────`);

  const P = new Float64Array(9); const TH = new Float64Array(3); const Z = new Float64Array(3);
  const readFacet = (t: number): void => {
    const o = t * 9;
    for (let v = 0; v < 3; v += 1) { P[3 * v] = xyz[o + 3 * v]; P[3 * v + 1] = xyz[o + 3 * v + 1]; P[3 * v + 2] = xyz[o + 3 * v + 2]; Z[v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(P[1], P[0]);
    TH[0] = thA;
    TH[1] = thA + dThRaw(thA, Math.atan2(P[4], P[3]));
    TH[2] = thA + dThRaw(thA, Math.atan2(P[7], P[6]));
  };
  const score = (
    x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number,
    t0v: number, t1v: number, t2v: number,
  ): { nd: number; spr: number } => {
    const o = orientOfFacet(ns, x0, y0, z0, x1, y1, z1, x2, y2, z2, t0v, t1v, t2v, { k: K, inset: INSET, orient: 'outward', scratch });
    return { nd: Number.isFinite(o.normDeg) ? o.normDeg : 0, spr: Number.isFinite(o.spreadRad) ? o.spreadRad * DEG : 0 };
  };
  /** the split point on edge (i,j) at parameter s, lifted onto the surface EXACTLY as bisectAt does */
  const liftEdge = (i: number, j: number, s: number): { x: number; y: number; z: number; th: number } => {
    const th = TH[i] + (TH[j] - TH[i]) * s;
    const z = Z[i] + (Z[j] - Z[i]) * s;
    const r = rA(th, z);
    return { x: r * Math.cos(th), y: r * Math.sin(th), z, th };
  };
  /** max normDeg over the two children of splitting edge (i,j) at s; apex is the third vertex */
  const splitCost = (i: number, j: number, ap: number, s: number): number => {
    const m = liftEdge(i, j, s);
    const c1 = score(P[3 * i], P[3 * i + 1], P[3 * i + 2], m.x, m.y, m.z, P[3 * ap], P[3 * ap + 1], P[3 * ap + 2], TH[i], m.th, TH[ap]);
    const c2 = score(m.x, m.y, m.z, P[3 * j], P[3 * j + 1], P[3 * j + 2], P[3 * ap], P[3 * ap + 1], P[3 * ap + 2], m.th, TH[j], TH[ap]);
    return Math.max(c1.nd, c2.nd);
  };
  /**
   * TWO-CUT. A straight crease enters a triangle through one edge and LEAVES through another, so a single
   * edge split always leaves one child still straddling (the child that keeps the apex the crease passes
   * beside). Cutting BOTH crossed edges — vertex A kept, M on AB at s1, N on AC at s2 — yields THREE
   * children, (A,M,N) | (M,B,C) | (M,C,N), which is exactly what two successive `bisectAt` calls produce.
   * `apex` is the vertex the two cut edges share.
   */
  const cut2Cost = (apex: number, u: number, v: number, s1: number, s2: number): number => {
    const m = liftEdge(apex, u, s1);       // on edge apex-u
    const nn = liftEdge(apex, v, s2);      // on edge apex-v
    const c1 = score(P[3 * apex], P[3 * apex + 1], P[3 * apex + 2], m.x, m.y, m.z, nn.x, nn.y, nn.z, TH[apex], m.th, nn.th);
    const c2 = score(m.x, m.y, m.z, P[3 * u], P[3 * u + 1], P[3 * u + 2], P[3 * v], P[3 * v + 1], P[3 * v + 2], m.th, TH[u], TH[v]);
    const c3 = score(m.x, m.y, m.z, P[3 * v], P[3 * v + 1], P[3 * v + 2], nn.x, nn.y, nn.z, m.th, TH[v], nn.th);
    return Math.max(c1.nd, Math.max(c2.nd, c3.nd));
  };
  /** how many DISTINCT surface normals (clustered at 1 deg) appear over the footprint — 2 = one crease,
   *  >= 3 = a junction, which no straight cut of any kind can separate into flat pieces. */
  const faceCount = (): number => {
    const reps: number[][] = [];
    const kk = 6;
    for (let i = 0; i <= kk; i += 1) {
      for (let j = 0; i + j <= kk; j += 1) {
        const wa = 0.98 * (i / kk) + 0.02 / 3; const wb = 0.98 * (j / kk) + 0.02 / 3; const wc = 1 - wa - wb;
        const th = wa * TH[0] + wb * TH[1] + wc * TH[2];
        const z = wa * Z[0] + wb * Z[1] + wc * Z[2];
        const nc = ns(th, z, scratch);
        for (let q = 0; q < nc; q += 1) {
          const nx = scratch[3 * q]; const ny = scratch[3 * q + 1]; const nz = scratch[3 * q + 2];
          let found = false;
          for (const r of reps) if (r[0] * nx + r[1] * ny + r[2] * nz > Math.cos(1 / DEG)) { found = true; break; }
          if (!found) reps.push([nx, ny, nz]);
        }
      }
    }
    return reps.length;
  };

  // ── pass 1: find the TURNING facets (cheap-ish screen at k=2)
  const turning: number[] = [];
  const strideScan = Math.max(1, Math.floor(nTri / Math.max(1, Math.round(envF('PF_S71_SCAN', 400000)))));
  let scanned = 0;
  for (let t = 0; t < nTri; t += strideScan) {
    readFacet(t); scanned += 1;
    const o = orientOfFacet(ns, P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8], TH[0], TH[1], TH[2],
      { k: 2, inset: INSET, orient: 'outward', scratch });
    if (Number.isFinite(o.spreadRad) && o.spreadRad * DEG > SPREAD_MIN && Number.isFinite(o.normDeg) && o.normDeg > 1) turning.push(t);
  }
  log(`  scanned ${scanned} facets (stride ${strideScan}) -> ${turning.length} TURNING (${((100 * turning.length) / scanned).toFixed(3)}%)`);
  if (turning.length < 50) { log('  too few TURNING facets to price a placement rule'); continue; }
  const pick = turning.filter((_, i) => i % Math.max(1, Math.ceil(turning.length / NCAP)) === 0);

  const par: number[] = []; const aM: number[] = []; const aMall: number[] = []; const aB: number[] = []; const aKink: number[] = [];
  const sBestAll: number[] = []; const sKinkAll: number[] = []; const dS: number[] = [];
  const aCut2: number[] = []; const aCut2I: number[] = []; const nFaces: number[] = [];
  for (const t of pick) {
    readFacet(t);
    const p0 = score(P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8], TH[0], TH[1], TH[2]);
    par.push(p0.nd);
    const eL = [
      [1, 2, 0, Math.hypot(P[3] - P[6], P[4] - P[7], P[5] - P[8])],
      [0, 2, 1, Math.hypot(P[0] - P[6], P[1] - P[7], P[2] - P[8])],
      [0, 1, 2, Math.hypot(P[0] - P[3], P[1] - P[4], P[2] - P[5])],
    ];
    const longest = eL.reduce((a, b) => (b[3] > a[3] ? b : a));
    aM.push(splitCost(longest[0], longest[1], longest[2], 0.5));
    let best = Infinity; let bestS = 0.5; let bestMid = Infinity; let bestKink = Infinity; let kS = 0.5;
    for (const [i, j, ap] of eL) {
      const mid = splitCost(i, j, ap, 0.5);
      if (mid < bestMid) bestMid = mid;
      for (let g = 1; g < NS_GRID + 1; g += 1) {
        const s = g / (NS_GRID + 1);
        const c = splitCost(i, j, ap, s);
        if (c < best) { best = c; bestS = s; }
      }
      const lt = locateTurn(ns, TH[i], Z[i], TH[j], Z[j], 14, scratch);
      const ck = splitCost(i, j, ap, Math.min(0.95, Math.max(0.05, lt.s)));
      if (ck < bestKink) { bestKink = ck; kS = lt.s; }
    }
    aMall.push(bestMid); aB.push(best); aKink.push(bestKink);
    sBestAll.push(bestS); sKinkAll.push(kS); dS.push(Math.abs(bestS - kS));
    // ── TWO-CUT arms. Choose the apex whose two incident edges both TURN the most (the crease enters and
    // leaves through them); price the cheap located-crossing placement and the 9x9-grid ideal.
    nFaces.push(faceCount());
    const turnOf = [0, 0, 0];
    const sOf = [0.5, 0.5, 0.5];
    for (let e = 0; e < 3; e += 1) {
      const i = eL[e][0]; const j = eL[e][1];
      const lt = locateTurn(ns, TH[i], Z[i], TH[j], Z[j], 14, scratch);
      turnOf[e] = lt.turn * DEG; sOf[e] = Math.min(0.97, Math.max(0.03, lt.s));
    }
    // edge e is opposite vertex eL[e][2]; the two edges incident to apex `a` are those with eL[e][2] != a
    let bestC2 = Infinity; let bestC2I = Infinity;
    for (let a = 0; a < 3; a += 1) {
      const inc: number[] = [];
      for (let e = 0; e < 3; e += 1) if (eL[e][2] !== a) inc.push(e);
      const e1 = inc[0]; const e2 = inc[1];
      const u = eL[e1][0] === a ? eL[e1][1] : eL[e1][0];
      const v = eL[e2][0] === a ? eL[e2][1] : eL[e2][0];
      const s1 = eL[e1][0] === a ? sOf[e1] : 1 - sOf[e1];
      const s2 = eL[e2][0] === a ? sOf[e2] : 1 - sOf[e2];
      const c = cut2Cost(a, u, v, s1, s2);
      if (c < bestC2) bestC2 = c;
      for (let g1 = 1; g1 <= 9; g1 += 1) {
        for (let g2 = 1; g2 <= 9; g2 += 1) {
          const ci = cut2Cost(a, u, v, g1 / 10, g2 / 10);
          if (ci < bestC2I) bestC2I = ci;
        }
      }
    }
    aCut2.push(bestC2); aCut2I.push(bestC2I);
  }
  const S = (a: number[]): number[] => [...a].sort((x, y) => x - y);
  const sPar = S(par); const sM = S(aM); const sMall = S(aMall); const sB = S(aB); const sK = S(aKink);
  log(`  priced ${pick.length} TURNING facets`);
  log('  arm       normDeg of the WORSE child      frac<1deg  frac<5deg');
  log(`    PARENT   p50 ${pq(sPar, 0.5).toFixed(4).padStart(9)}  p99 ${pq(sPar, 0.99).toFixed(4).padStart(9)}   ${(100 * frac(par, 1)).toFixed(2)}%   ${(100 * frac(par, 5)).toFixed(2)}%`);
  log(`    M        p50 ${pq(sM, 0.5).toFixed(4).padStart(9)}  p99 ${pq(sM, 0.99).toFixed(4).padStart(9)}   ${(100 * frac(aM, 1)).toFixed(2)}%   ${(100 * frac(aM, 5)).toFixed(2)}%`);
  log(`    Mall     p50 ${pq(sMall, 0.5).toFixed(4).padStart(9)}  p99 ${pq(sMall, 0.99).toFixed(4).padStart(9)}   ${(100 * frac(aMall, 1)).toFixed(2)}%   ${(100 * frac(aMall, 5)).toFixed(2)}%`);
  log(`    B ideal  p50 ${pq(sB, 0.5).toFixed(4).padStart(9)}  p99 ${pq(sB, 0.99).toFixed(4).padStart(9)}   ${(100 * frac(aB, 1)).toFixed(2)}%   ${(100 * frac(aB, 5)).toFixed(2)}%`);
  log(`    Kink     p50 ${pq(sK, 0.5).toFixed(4).padStart(9)}  p99 ${pq(sK, 0.99).toFixed(4).padStart(9)}   ${(100 * frac(aKink, 1)).toFixed(2)}%   ${(100 * frac(aKink, 5)).toFixed(2)}%`);
  const rB = pq(sB, 0.5) / Math.max(1e-12, pq(sM, 0.5));
  const rK = pq(sK, 0.5) / Math.max(1e-12, pq(sM, 0.5));
  const recov = (1 - rK) / Math.max(1e-12, 1 - rB);
  const sC2 = S(aCut2); const sC2I = S(aCut2I); const sNF = S(nFaces);
  log(`    Cut2     p50 ${pq(sC2, 0.5).toFixed(4).padStart(9)}  p99 ${pq(sC2, 0.99).toFixed(4).padStart(9)}   ${(100 * frac(aCut2, 1)).toFixed(2)}%   ${(100 * frac(aCut2, 5)).toFixed(2)}%   <- located crossings, BOTH crossed edges`);
  log(`    Cut2i    p50 ${pq(sC2I, 0.5).toFixed(4).padStart(9)}  p99 ${pq(sC2I, 0.99).toFixed(4).padStart(9)}   ${(100 * frac(aCut2I, 1)).toFixed(2)}%   ${(100 * frac(aCut2I, 5)).toFixed(2)}%   <- 9x9 grid IDEAL two-cut`);
  log(`  distinct surface normals over the footprint (1 deg clustering): p50 ${pq(sNF, 0.5)}  p90 ${pq(sNF, 0.9)}  max ${sNF[sNF.length - 1]}   frac>=3 ${(100 * (1 - frac(nFaces, 3))).toFixed(2)}%`);
  log(`  *** median(B)/median(M) = ${rB.toFixed(4)}   [CONFIRMED <= 0.5, REFUTED >= 0.9] ***`);
  log(`  *** frac<1deg  B ${(100 * frac(aB, 1)).toFixed(2)}%  vs  M ${(100 * frac(aM, 1)).toFixed(2)}%  = ${(frac(aB, 1) / Math.max(1e-9, frac(aM, 1))).toFixed(2)}x   [CONFIRMED >= 3x] ***`);
  log(`  *** Kink recovers ${(100 * recov).toFixed(1)}% of B's median improvement   [CONFIRMED >= 60%] ***`);
  log(`  placement: |sBest - sKink| p50 ${pq(S(dS), 0.5).toFixed(4)}  p90 ${pq(S(dS), 0.9).toFixed(4)}   (0.5 = no agreement at all)`);
  const dt = (Date.now() - t0) / 1000;
  log(`  ${(evals / 1e6).toFixed(1)} M rA evals, ${dt.toFixed(0)} s`);
  appendFileSync(NDJSON, `${JSON.stringify({
    ts: new Date().toISOString(), style, stem, nTri, scanned, turning: turning.length, priced: pick.length,
    K, INSET, SPREAD_MIN, NS_GRID,
    parP50: pq(sPar, 0.5), mP50: pq(sM, 0.5), mallP50: pq(sMall, 0.5), bP50: pq(sB, 0.5), kP50: pq(sK, 0.5),
    parP99: pq(sPar, 0.99), mP99: pq(sM, 0.99), bP99: pq(sB, 0.99), kP99: pq(sK, 0.99),
    fracB1: frac(aB, 1), fracM1: frac(aM, 1), fracK1: frac(aKink, 1), fracMall1: frac(aMall, 1),
    cut2P50: pq(sC2, 0.5), cut2iP50: pq(sC2I, 0.5), fracCut2_1: frac(aCut2, 1), fracCut2i_1: frac(aCut2I, 1),
    facesP50: pq(sNF, 0.5), facesGE3: 1 - frac(nFaces, 3),
    ratioBM: rB, ratioKM: rK, recov, dSp50: pq(S(dS), 0.5), secs: dt,
  })}\n`);
}
log(`\nndjson checkpoint: ${NDJSON}`);
log('done');
