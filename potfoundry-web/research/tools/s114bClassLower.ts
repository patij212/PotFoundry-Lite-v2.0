// s114bClassLower.ts — A SOUND LOWER BOUND ON "REAL ANALYTIC TURN" OVER THE **WHOLE** >45 DEG CLASS.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE HOLE THIS FILLS. S114-B established, per style, that the S113 oracle's DOMAIN is the WALL side of
// the S112 funnel (graphRatio <= 8) intersected with the straddling + crease-labelled cuts. On Gothic
// that domain is 7.90% of the visible class by area. On Crystalline / DragonScales / GeometricStar it is
// 0.35% / 0.33% / 0.008%. So "does S113 generalise" cannot be answered from the oracle alone off Gothic —
// the oracle is silent on 99%+ of the class there, and reporting its verdict as the class's verdict would
// be answering a question nobody asked.
//
// A SECOND ATTEMPT AT THE CURTAIN CLASS ALREADY FAILED ITS OWN CONTROL. `s114bCurtainProbe.ts` walked the
// centroid-to-centroid path in (theta, z); its pre-registered CTL-CALIB (agree with the oracle on >= 90%
// of Gothic's target set) read 84.95% at n=2000 and FIRED, so none of its numbers are quotable and none
// are used here. Its diagnosis stands: a 1-D path misses creases that cross the PAIR but not the segment,
// which is why this file goes back to FOOTPRINTS.
//
// THE STATISTIC, AND WHY IT IS ONE-SIDED ON PURPOSE.
//   turnLower(pair) = max(  diameter of the analytic unit-normal set over the ORDER-K barycentric
//                           lattices of BOTH facets' (theta, z) footprints,
//                           the largest one-sided candidate SPREAD at any of those lattice points  )
// Both terms are ATTAINED values — an angle between two normals that actually exist on the surface inside
// the two footprints. So `turnLower >= 45` PROVES the analytic surface turns >= 45 deg there, and the
// pair's visible dihedral is CORRECT GEOMETRY that no mesh can remove. The converse is NOT claimed: on a
// CURTAIN facet the (theta, z) footprint is a sliver relative to the 3D triangle, so the lattice
// under-covers and `turnLower < 45` is UNDECIDED, never "reducible". *** EVERY NUMBER BELOW IS A FLOOR. ***
//
// PRE-REGISTERED BEFORE THE FIRST RUN.
//   CTL-CALIB (floor, VOIDS THE STATISTIC). On GothicArches' crease-labelled TARGET set this must
//       reproduce the S113 footprint oracle to >= 90% by COUNT and >= 95% by AREA (oracle: 93.29% /
//       99.37%). Cross-check already seen in the S114-B diagnosis: the per-facet footprint diameter read
//       p50 148.79 deg against the oracle's sepCrease p50 147.09 deg, a 1.2% agreement.
//   CTL-SMOOTH (ceiling, VOIDS the style). Wall pairs with mesh dihedral < 2 deg must come out
//       < 1% >= 45 deg. A statistic that fires on flat mesh is measuring the sampler, not the surface.
//   K-LADDER (reported). K is swept; the lower bound must RISE and FLATTEN in K. A bound that is still
//       climbing has not converged and its level is not quotable.
//
// COUNT + AREA-SHARE + MAX on every population, per style, never averaged.
//
// Usage: bash research/tools/run-s114b-lower.sh
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw, locateKinkRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import { fdNormals, orientOfFacet } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const DEG = 180 / Math.PI;
const DIR = process.env.PF_S114B_DIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';
const STEMS = (process.env.PF_S114L_STEMS ?? [
  'Crystalline:crystalline_ring_D--',
  'DragonScales:dragonscales_ring_D--',
  'GeometricStar:geometricstar_ring_D--',
  'GothicArches:gothicarches_ring_DS-HT_S39CTL',
].join(',')).split(',').map((s) => s.trim());
const OUTDIR = 'research/exchange/_strataConformBisect/s114sweep';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const HI_DEG = envF('PF_S114L_HI', 45);
const CURTAIN_RATIO = 8; const DROP_CUT = 0.25; const NORMHI_MIN = 10;
const KL = envI('PF_S114L_K', 12);
const KLADDER = (process.env.PF_S114L_KLADDER ?? '6,12,20').split(',').map(Number);
const NPAIR = envI('PF_S114L_NPAIR', 4000);
const NSMOOTH = envI('PF_S114L_NSMOOTH', 1200);
const NLAD = envI('PF_S114L_NLAD', 250);
const H_FD = 2e-4; const K_ORI = 8; const INSET_HI = 0.05;
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64, kinkScan: 16, kinkHalvings: 24,
  kinkRatio: 0.15, jumpRatio: 0.62, snap: true, confMm: 0.6 / 1000,
};
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const o: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') o[snakeToCamel(k)] = v.default;
  return o;
}
const q = (v: number[], p: number): number => {
  const s = v.slice().filter(Number.isFinite).sort((a, b) => a - b);
  return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))];
};
const mx = (v: number[]): number => v.reduce((a, b) => (Number.isFinite(b) && b > a ? b : a), -Infinity);
function goldenStride(n: number): number {
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let gs = Math.max(1, Math.round(n * 0.6180339887498949) | 1);
  while (gs > 1 && gcd(gs, n) !== 1) gs += 2;
  return gs >= n ? 1 : gs;
}
mkdirSync(OUTDIR, { recursive: true });
const T0 = Date.now();
const el = (): string => `[${((Date.now() - T0) / 1000).toFixed(1)}s]`;

log('===================================================================================================');
log('  S114-B — SOUND LOWER BOUND on the analytic turn under the WHOLE >45 deg class, per style');
log('===================================================================================================');
log(`turnLower = max(joint analytic normal-set DIAMETER over both order-${KL} footprint lattices, max one-sided candidate SPREAD)`);
log('EVERY SHARE BELOW IS A FLOOR: turnLower >= 45 PROVES real turn; turnLower < 45 is UNDECIDED, never "reducible".');
log(`pre-registered: CTL-CALIB >= 90% count AND >= 95% area vs the S113 oracle on Gothic's target (93.29% / 99.37%)`);
log('                CTL-SMOOTH < 1% on dihedral<2 wall pairs (VOIDS the style)');
log('');
const outAll: Array<Record<string, unknown>> = [];

for (const spec of STEMS) {
  const [STYLE, stem] = spec.split(':');
  const STL = `${DIR}/${stem}.stl`;
  log('══════════════════════════════════════════════════════════════════════════════════════════════════');
  log(`═════ ${STYLE}   ${stem} ═════`);
  if (!existsSync(STL)) { log('  MISSING'); continue; }
  const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const M = readMeshFloat64(STL, false);
  const xyz = M.xyz; const nTri = M.nTri;
  {
    let w = 0; const st = Math.max(1, Math.floor(nTri / 20000));
    for (let f = 0; f < nTri; f += st) for (let k = 0; k < 3; k += 1) {
      const dd = Math.abs(Math.hypot(xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1]) - rA(Math.atan2(xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3]), xyz[f * 9 + k * 3 + 2]));
      if (dd > w) w = dd;
    }
    log(`  PRECOND ${(w * 1000).toFixed(4)} um`);
    if (w * 1000 > 50) { log('  *** REFUSED ***'); continue; }
  }
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  let meshArea = 0;
  for (let f = 0; f < nTri; f += 1) meshArea += d.areaMm2[f];
  const ns = fdNormals(rA, H, H_FD, H_FD);
  const scratch = new Float64Array(12);
  const th3 = (f: number): [number, number, number] => {
    const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
    return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
  };
  function graphRatio(f: number): number {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const [ath, bth, cth] = th3(f);
    const rRef = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
    return aP > 1e-15 ? a3 / aP : Infinity;
  }
  /** every analytic normal candidate over one facet's order-k footprint lattice, appended to `acc`. */
  function collect(f: number, k: number, acc: number[]): number {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    let sprMax = 0;
    for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      const nc = ns(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz, scratch);
      for (let a = 0; a < nc; a += 1) for (let b = a + 1; b < nc; b += 1) {
        let dp = scratch[a * 3] * scratch[b * 3] + scratch[a * 3 + 1] * scratch[b * 3 + 1] + scratch[a * 3 + 2] * scratch[b * 3 + 2];
        dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
        const t = Math.acos(dp); if (t > sprMax) sprMax = t;
      }
      if (nc > 0) acc.push(scratch[0], scratch[1], scratch[2]);   // one consistent branch for the diameter
    }
    return sprMax * DEG;
  }
  function turnLower(f1: number, f2: number, k: number): number {
    const acc: number[] = [];
    const s1 = collect(f1, k, acc); const s2 = collect(f2, k, acc);
    let diam = 0;
    const m = acc.length / 3;
    for (let a = 0; a < m; a += 1) for (let b = a + 1; b < m; b += 1) {
      let dp = acc[a * 3] * acc[b * 3] + acc[a * 3 + 1] * acc[b * 3 + 1] + acc[a * 3 + 2] * acc[b * 3 + 2];
      dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
      const t = Math.acos(dp); if (t > diam) diam = t;
    }
    return Math.max(diam * DEG, s1, s2);
  }

  const hiE: number[] = []; const smE: number[] = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    const a = d.edgeAngRad[e] * DEG;
    if (a > HI_DEG) hiE.push(e); else if (a < 2) smE.push(e);
  }
  let hiA = 0; const hiF = new Set<number>();
  for (const e of hiE) { hiF.add(d.edgeF1[e]); hiF.add(d.edgeF2[e]); }
  for (const f of hiF) hiA += d.areaMm2[f];
  log(`  mesh ${nTri} facets ${meshArea.toFixed(1)} mm2   >${HI_DEG} deg class: ${hiE.length} edges, ${hiF.size} facets, ${hiA.toFixed(3)} mm2 = ${((100 * hiA) / meshArea).toFixed(4)}% of mesh`);
  if (hiE.length === 0) { log('  class EMPTY — nothing to bound'); continue; }
  const take = (arr: number[], n: number): number[] => {
    if (arr.length <= n) return arr.slice();
    const gs = goldenStride(arr.length); const o: number[] = [];
    for (let i = 0; i < n; i += 1) o.push(arr[(i * gs) % arr.length]);
    return o;
  };
  function score(name: string, es: number[], k: number, quiet = false): Record<string, unknown> {
    const vals: number[] = []; const cur: boolean[] = [];
    const fA = new Map<number, number>(); const fIrr = new Map<number, boolean>();
    for (const e of es) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const t = turnLower(f1, f2, k);
      vals.push(t);
      cur.push(graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO);
      for (const f of [f1, f2]) {
        fA.set(f, d.areaMm2[f]);
        fIrr.set(f, (fIrr.get(f) ?? false) || t >= HI_DEG);
      }
    }
    let aAll = 0; let aIrr = 0; let nIrr = 0;
    for (const [f, a] of fA) { aAll += a; if (fIrr.get(f) === true) { aIrr += a; nIrr += 1; } }
    const pIrr = vals.filter((v) => v >= HI_DEG).length;
    const r = {
      style: STYLE, pop: name, k, pairs: es.length, facets: fA.size, areaMm2: aAll,
      pairIrrPct: (100 * pIrr) / es.length, facetIrrPct: (100 * nIrr) / fA.size, areaIrrPct: (100 * aIrr) / aAll,
      p10: q(vals, 0.1), p50: q(vals, 0.5), p90: q(vals, 0.9), max: mx(vals),
      curtainPct: (100 * cur.filter(Boolean).length) / es.length,
    };
    if (!quiet) {
      log(`  ── ${name}  (K=${k}, n=${es.length} pairs, ${fA.size} facets, ${aAll.toFixed(3)} mm2; ${r.curtainPct.toFixed(1)}% curtain) ──`);
      log(`     turnLower deg   p10 ${r.p10.toFixed(2)}  p50 ${r.p50.toFixed(2)}  p90 ${r.p90.toFixed(2)}  MAX ${r.max.toFixed(2)}`);
      log(`     *** PROVEN >= ${HI_DEG} deg REAL ANALYTIC TURN:  PAIRS ${pIrr}/${es.length} = ${r.pairIrrPct.toFixed(2)}%   FACETS ${nIrr}/${fA.size} = ${r.facetIrrPct.toFixed(2)}%   AREA-share ${r.areaIrrPct.toFixed(2)}%  (a FLOOR) ***`);
    }
    return r;
  }

  const sampled = take(hiE, NPAIR);
  const rWhole = score(`WHOLE >${HI_DEG} deg class`, sampled, KL);
  outAll.push(rWhole);
  const curE = sampled.filter((e) => graphRatio(d.edgeF1[e]) > CURTAIN_RATIO || graphRatio(d.edgeF2[e]) > CURTAIN_RATIO);
  const walE = sampled.filter((e) => !(graphRatio(d.edgeF1[e]) > CURTAIN_RATIO || graphRatio(d.edgeF2[e]) > CURTAIN_RATIO));
  if (curE.length > 0) outAll.push(score('  ... CURTAIN subset (ruler under-covers; floor only)', curE, KL));
  if (walE.length > 0) outAll.push(score('  ... WALL subset', walE, KL));
  // CTL-SMOOTH
  const smSamp = take(smE.filter((e) => !(graphRatio(d.edgeF1[e]) > CURTAIN_RATIO || graphRatio(d.edgeF2[e]) > CURTAIN_RATIO)), NSMOOTH);
  const rSm = score('CTL-SMOOTH (dihedral < 2 deg wall pairs)', smSamp, KL);
  outAll.push(rSm);
  if ((rSm.pairIrrPct as number) >= 1) {
    log('  *** CTL-SMOOTH FIRED (bar: < 1%) — the pre-registered ceiling is breached. THIS STYLE\'S LOWER BOUND IS UNCERTIFIED. ***');
    // DIAGNOSIS, NOT A RESCUE. Two readings of a fire are possible and they are DISTINGUISHABLE:
    //   (i) SAMPLER ARTEFACT — the statistic invents turn; then the fired pairs' facets are close to the
    //       analytic normal (small normDeg) because nothing is actually wrong there.
    //   (ii) THE MESH SMOOTHED OVER A REAL CREASE — a genuine C0 crease passes through the footprints and
    //       the mesh spans it flat; then those facets are FAR from the analytic normal (large normDeg).
    // Printing normDeg on both sides of the split decides between them. It does not un-fire the bar.
    const ndOf = (f: number, ins: number): number => {
      const [ath, bth, cth] = th3(f);
      return orientOfFacet(ns, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
        xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_ORI, inset: ins, orient: 'winding', scratch }).normDeg;
    };
    const hit: number[] = []; const miss: number[] = []; let aH = 0; let aM = 0;
    for (const e of smSamp) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      const t = turnLower(f1, f2, KL);
      const v = Math.max(ndOf(f1, INSET_HI), ndOf(f2, INSET_HI));
      const a = d.areaMm2[f1] + d.areaMm2[f2];
      if (t >= HI_DEG) { hit.push(v); aH += a; } else { miss.push(v); aM += a; }
    }
    log(`     DIAGNOSIS of the fire — normDeg(inset ${INSET_HI}) on each side of the split:`);
    log(`       FIRED pairs   n=${hit.length}  normDeg p10 ${q(hit, 0.1).toFixed(2)} p50 ${q(hit, 0.5).toFixed(2)} p90 ${q(hit, 0.9).toFixed(2)} MAX ${mx(hit).toFixed(2)} deg   area ${aH.toFixed(3)} mm2`);
    log(`       rest          n=${miss.length}  normDeg p10 ${q(miss, 0.1).toFixed(2)} p50 ${q(miss, 0.5).toFixed(2)} p90 ${q(miss, 0.9).toFixed(2)} MAX ${mx(miss).toFixed(2)} deg   area ${aM.toFixed(3)} mm2`);
    log(`       normDeg p50 ratio FIRED/rest = x${(q(hit, 0.5) / Math.max(1e-9, q(miss, 0.5))).toFixed(2)}   (>>1 ⇒ the mesh SMOOTHED OVER a real crease; ~1 ⇒ sampler artefact)`);
    outAll.push({ style: STYLE, pop: 'CTL-SMOOTH-FIRE-DIAG', pairs: hit.length, facets: 0, areaMm2: aH,
      p10: q(hit, 0.1), p50: q(hit, 0.5), p90: q(hit, 0.9), max: mx(hit),
      restP50: q(miss, 0.5), ratio: q(hit, 0.5) / Math.max(1e-9, q(miss, 0.5)),
      pairIrrPct: NaN, facetIrrPct: NaN, areaIrrPct: NaN, curtainPct: 0, k: KL });
  }
  // K-LADDER
  const lad = KLADDER.map((k) => score(`k-ladder K=${k}`, take(sampled, NLAD), k, true));
  log(`  ── K-LADDER on ${Math.min(NLAD, sampled.length)} pairs — a lower bound must RISE and FLATTEN ──`);
  for (const L of lad) log(`     K=${String(L.k).padStart(2)}  p50 ${(L.p50 as number).toFixed(2)}  pairIrr ${(L.pairIrrPct as number).toFixed(2)}%  areaIrr ${(L.areaIrrPct as number).toFixed(2)}%`);
  outAll.push(...lad.map((L) => ({ ...L, pop: `KLAD ${L.k}` })));

  if (STYLE === 'GothicArches') {
    const nd = (f: number, ins: number): number => {
      const [ath, bth, cth] = th3(f);
      return orientOfFacet(ns, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
        xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K_ORI, inset: ins, orient: 'winding', scratch }).normDeg;
    };
    const sharedEndpoints = (e: number): number[] | null => {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e]; const o: number[] = [];
      for (let a = 0; a < 3; a += 1) {
        const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
        for (let b = 0; b < 3; b += 1) if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { o.push(ax, ay, az); break; }
      }
      return o.length === 6 ? o : null;
    };
    const tgt: number[] = [];
    for (const e of hiE) {
      const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
      if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) continue;
      const hi = Math.max(nd(f1, INSET_HI), nd(f2, INSET_HI));
      const lo = Math.max(nd(f1, 0), nd(f2, 0));
      if (!((lo > 1e-9 ? hi / lo : 1) >= DROP_CUT && hi > NORMHI_MIN)) continue;
      const p = sharedEndpoints(e); if (p === null) continue;
      const thE = Math.atan2(p[1], p[0]);
      const kE = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
      const c1t = th3(f1); const c2t = th3(f2);
      const a1 = (c1t[0] + c1t[1] + c1t[2]) / 3; const z1 = (xyz[f1 * 9 + 2] + xyz[f1 * 9 + 5] + xyz[f1 * 9 + 8]) / 3;
      const a2 = (c2t[0] + c2t[1] + c2t[2]) / 3; const z2 = (xyz[f2 * 9 + 2] + xyz[f2 * 9 + 5] + xyz[f2 * 9 + 8]) / 3;
      const kS = locateKinkRaw(rA, a1, z1, a1 + dThRaw(a1, a2), z2, PRED);
      if ((kE === null || kE.jump) && (kS === null || kS.jump)) continue;
      tgt.push(e);
    }
    log(`  ── CTL-CALIB: Gothic crease-labelled TARGET set = ${tgt.length} pairs (pinned 3,282) ──`);
    const rC = score('CTL-CALIB Gothic target set', take(tgt, NPAIR), KL);
    outAll.push(rC);
    log(`  *** CTL-CALIB: ${(rC.pairIrrPct as number).toFixed(2)}% pairs / ${(rC.areaIrrPct as number).toFixed(2)}% area vs oracle 93.29% / 99.37%.  FLOORS 90% / 95%. ***`);
    if ((rC.pairIrrPct as number) < 90 || (rC.areaIrrPct as number) < 95) log('  *** CTL-CALIB FIRED — THE STATISTIC IS NOT QUOTABLE. ***');
    else log('  *** CTL-CALIB PASSES — the statistic reproduces the S113 oracle on its own domain. ***');
  }
  log(`  ${el()}`);
}
log('');
log('===================================================================================================');
log('  S114-B LOWER-BOUND TABLE — every share is a FLOOR');
log('===================================================================================================');
log('style          population                                          pairs  facets   area mm2  p50 turn  PROVEN>=45: pair%  facet%  area%');
for (const r of outAll) {
  if (String(r.pop).startsWith('KLAD') || String(r.pop).startsWith('CTL-SMOOTH-FIRE')) continue;
  log(`${String(r.style).padEnd(14)} ${String(r.pop).padEnd(50)} ${String(r.pairs).padStart(6)} ${String(r.facets).padStart(7)} ${(r.areaMm2 as number).toFixed(2).padStart(10)} ${(r.p50 as number).toFixed(2).padStart(9)} ${(r.pairIrrPct as number).toFixed(2).padStart(17)} ${(r.facetIrrPct as number).toFixed(2).padStart(7)} ${(r.areaIrrPct as number).toFixed(2).padStart(7)}`);
}
writeFileSync(`${OUTDIR}/S114_LOWERBOUND_B.json`, `${JSON.stringify({ cuts: { HI_DEG, KL, KLADDER, NPAIR }, rows: outAll }, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_LOWERBOUND_B.json`);
log(`done ${el()}`);
