// s114bDragonDiag.ts — WHY THE DRAGONSCALES ORACLE CONTROL FIRED. A DIAGNOSIS, NOT A RESCUE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT FIRED. In S114-B the S113 oracle's pre-registered FLOOR control fired on DragonScales: the flank
// classifier labelled 1 of 309 target facets crease-bearing, against 568/600 on GothicArches and 486/600
// on Crystalline with the SAME code. So the DragonScales oracle verdict (0.49% of pairs / 1.40% of area
// irreducible) IS VOID BY MY OWN BAR and is not quoted as a result. This tool asks what the class
// actually is, so the void is a diagnosis rather than a hole.
//
// THE PARADOX TO RESOLVE. On that target set the oracle measured the analytic across-crease turn at
// p50 0.97 deg — the analytic surface is SMOOTH over those footprints — while the mesh dihedral is > 45
// deg and the straddling cut guarantees normDeg(inset 0.05) > 10 deg. But PRECOND on this mesh is
// 0.0075 um: every vertex is ON the analytic surface to 7.5 nm. A triangle with all three vertices on a
// locally-FLAT surface cannot be 20 deg off it. One of those three statements has to give.
//
// FOUR CANDIDATE EXPLANATIONS, EACH WITH THE MEASUREMENT THAT SEPARATES IT:
//   (A) the footprint DOES contain a kink and two-means failed to split it  -> orientOfFacet.spreadRad
//       (the kink-aware sampler's own crease detector) is LARGE on these facets.
//   (B) the radius function JUMPS rather than kinks (a cliff, `locateKinkRaw`'s `jump` flag) -> the
//       one-sided normals are near-radial on both sides so a normal-space split cannot see it; the
//       signature is a large r-variation across the footprint with small normal spread.
//   (C) the facet's PARAMETER footprint is a degenerate sliver, so the lattice does not represent the
//       triangle at all -> parameter-footprint area / 3D area (1/graphRatio) is tiny, aspect huge.
//   (D) it is honest mesh defect: smooth surface, badly-oriented facet.
//
// TWO-SIDED, AS ALWAYS: every quantity is printed for the DragonScales target set AND for the Gothic
// target set through the SAME code path, because a number with nothing to diff against has decided
// nothing. COUNT + AREA + MAX on every population.
//
// Usage: bash research/tools/run-s114b-dragon.sh
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
const DEG = 180 / Math.PI;
const DIR = process.env.PF_S114B_DIR
  ?? 'C:/Users/patij212/Downloads/PotFoundry-Lite-v2.0/potfoundry-web/research/exchange/_strataConformBisect';
const STEMS = (process.env.PF_S114D_STEMS ?? 'DragonScales:dragonscales_ring_D--,GothicArches:gothicarches_ring_DS-HT_S39CTL')
  .split(',').map((s) => s.trim());
const OUTDIR = 'research/exchange/_strataConformBisect/s114sweep';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const HI_DEG = 45; const CURTAIN_RATIO = 8; const DROP_CUT = 0.25; const NORMHI_MIN = 10;
const K = 8; const INSET_HI = 0.05; const H_FD = 2e-4;
const NDUMP = Math.round(envF('PF_S114D_NDUMP', 400));
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
mkdirSync(OUTDIR, { recursive: true });

log('===================================================================================================');
log('  S114-B DIAGNOSIS — the DragonScales oracle control fired. What IS that class?');
log('===================================================================================================');
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
    if (w * 1000 > 50) { log('  REFUSED'); continue; }
  }
  const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
  const ns = fdNormals(rA, H, H_FD, H_FD);
  const scratch = new Float64Array(12);
  const th3 = (f: number): [number, number, number] => {
    const a = Math.atan2(xyz[f * 9 + 1], xyz[f * 9]);
    return [a, a + dThRaw(a, Math.atan2(xyz[f * 9 + 4], xyz[f * 9 + 3])), a + dThRaw(a, Math.atan2(xyz[f * 9 + 7], xyz[f * 9 + 6]))];
  };
  const rRefOf = (f: number): number => (Math.hypot(xyz[f * 9], xyz[f * 9 + 1]) + Math.hypot(xyz[f * 9 + 3], xyz[f * 9 + 4]) + Math.hypot(xyz[f * 9 + 6], xyz[f * 9 + 7])) / 3;
  const orient = (f: number, ins: number): { normDeg: number; spreadDeg: number; diam: number } => {
    const [ath, bth, cth] = th3(f);
    const o = orientOfFacet(ns, xyz[f * 9], xyz[f * 9 + 1], xyz[f * 9 + 2], xyz[f * 9 + 3], xyz[f * 9 + 4], xyz[f * 9 + 5],
      xyz[f * 9 + 6], xyz[f * 9 + 7], xyz[f * 9 + 8], ath, bth, cth, { k: K, inset: ins, orient: 'winding', scratch });
    return { normDeg: o.normDeg, spreadDeg: (o.spreadRad * 180) / Math.PI, diam: o.diam };
  };
  function graphRatio(f: number): number {
    const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
    const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
    const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
    const a3 = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    const [ath, bth, cth] = th3(f); const rRef = rRefOf(f);
    const aP = 0.5 * Math.abs((rRef * (bth - ath)) * (cz - az) - (bz - az) * (rRef * (cth - ath)));
    return aP > 1e-15 ? a3 / aP : Infinity;
  }
  /**
   * (E) THE DISCRIMINATOR THAT SEPARATES A CREASE STRADDLE FROM PLAIN UNDER-RESOLUTION.
   * `spreadRad` is the spread of the up-to-4 ONE-SIDED candidates AT ONE lattice point — a C0 KINK
   * detector. It says NOTHING about how far the normal swings SMOOTHLY across the footprint. So a facet
   * can have spreadRad ~ 0 (no kink) and still be 30 deg off because the surface curves through 60 deg
   * inside it — which is ordinary under-resolution, and DENSITY FIXES IT. A crease straddle is exactly
   * the case density cannot fix (fixture H2: angle x0.9968 over five halvings).
   * This returns the DIAMETER of the analytic normal set over the order-k footprint lattice, taking one
   * consistent one-sided branch per point, alongside normDeg. The pairing separates the two classes:
   *   footprintDiam >> normDeg   ⇒ the surface really swings; the facet is too big  ⇒ UNDER-RESOLUTION
   *   footprintDiam ~ 0 << normDeg ⇒ locally flat surface, tilted facet             ⇒ PLACEMENT defect
   */
  function footprintDiamDeg(f: number, k: number): number {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    const pts: number[] = [];
    for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) {
      const wa = i / k; const wb = j / k; const wc = 1 - wa - wb;
      const nc = ns(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz, scratch);
      if (nc > 0) pts.push(scratch[0], scratch[1], scratch[2]);
    }
    const buf = new Float64Array(pts);
    let diam = 0;
    for (let a = 0; a * 3 < buf.length; a += 1) for (let b = a + 1; b * 3 < buf.length; b += 1) {
      let dp = buf[a * 3] * buf[b * 3] + buf[a * 3 + 1] * buf[b * 3 + 1] + buf[a * 3 + 2] * buf[b * 3 + 2];
      dp = dp > 1 ? 1 : dp < -1 ? -1 : dp;
      const t = Math.acos(dp); if (t > diam) diam = t;
    }
    return diam * DEG;
  }
  /** r-variation across the footprint: the (B) cliff/jump signature. */
  function rSpan(f: number): number {
    const [ath, bth, cth] = th3(f);
    const az = xyz[f * 9 + 2]; const bz = xyz[f * 9 + 5]; const cz = xyz[f * 9 + 8];
    let lo = Infinity; let hi = -Infinity;
    for (let i = 0; i <= 12; i += 1) for (let j = 0; i + j <= 12; j += 1) {
      const wa = i / 12; const wb = j / 12; const wc = 1 - wa - wb;
      const r = rA(wa * ath + wb * bth + wc * cth, wa * az + wb * bz + wc * cz);
      if (r < lo) lo = r; if (r > hi) hi = r;
    }
    return hi - lo;
  }
  const cenTZ = (f: number): [number, number] => {
    const [a, b, c] = th3(f);
    return [(a + b + c) / 3, (xyz[f * 9 + 2] + xyz[f * 9 + 5] + xyz[f * 9 + 8]) / 3];
  };
  const sharedEndpoints = (e: number): number[] | null => {
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e]; const o: number[] = [];
    for (let a = 0; a < 3; a += 1) {
      const ax = xyz[f1 * 9 + a * 3]; const ay = xyz[f1 * 9 + a * 3 + 1]; const az = xyz[f1 * 9 + a * 3 + 2];
      for (let b = 0; b < 3; b += 1) if (xyz[f2 * 9 + b * 3] === ax && xyz[f2 * 9 + b * 3 + 1] === ay && xyz[f2 * 9 + b * 3 + 2] === az) { o.push(ax, ay, az); break; }
    }
    return o.length === 6 ? o : null;
  };

  // rebuild the S112 TARGET SET exactly as S114-B did
  const tgt: Array<{ e: number; f1: number; f2: number; jumpEdge: boolean; jumpSeg: boolean }> = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] * DEG > HI_DEG)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    if (graphRatio(f1) > CURTAIN_RATIO || graphRatio(f2) > CURTAIN_RATIO) continue;
    const hi = Math.max(orient(f1, INSET_HI).normDeg, orient(f2, INSET_HI).normDeg);
    const lo = Math.max(orient(f1, 0).normDeg, orient(f2, 0).normDeg);
    const drop = lo > 1e-9 ? hi / lo : 1;
    if (!(drop >= DROP_CUT && hi > NORMHI_MIN)) continue;
    const p = sharedEndpoints(e); if (p === null) continue;
    const thE = Math.atan2(p[1], p[0]);
    const kE = locateKinkRaw(rA, thE, p[2], thE + dThRaw(thE, Math.atan2(p[4], p[3])), p[5], PRED);
    const a1 = cenTZ(f1); const a2 = cenTZ(f2);
    const kS = locateKinkRaw(rA, a1[0], a1[1], a1[0] + dThRaw(a1[0], a2[0]), a2[1], PRED);
    const onE = kE !== null && !kE.jump; const onS = kS !== null && !kS.jump;
    if (!onE && !onS) continue;
    tgt.push({ e, f1, f2, jumpEdge: kE !== null && kE.jump, jumpSeg: kS !== null && kS.jump });
  }
  log(`  TARGET SET rebuilt: ${tgt.length} pairs`);
  if (tgt.length === 0) { log('  empty — nothing to diagnose'); continue; }
  const fset = new Set<number>();
  for (const t of tgt) { fset.add(t.f1); fset.add(t.f2); }
  const fs = Array.from(fset).slice(0, NDUMP);
  const nd0: number[] = []; const nd5: number[] = []; const spr: number[] = []; const gr: number[] = [];
  const rsp: number[] = []; const ar: number[] = []; const dia: number[] = []; const fpd: number[] = [];
  for (const f of fs) {
    const o0 = orient(f, 0); const o5 = orient(f, INSET_HI);
    nd0.push(o0.normDeg); nd5.push(o5.normDeg); spr.push(o0.spreadDeg);
    gr.push(graphRatio(f)); rsp.push(rSpan(f)); ar.push(d.areaMm2[f]); dia.push(o0.diam);
    fpd.push(footprintDiamDeg(f, 12));
  }
  let aAll = 0; for (const a of ar) aAll += a;
  const shareOver = (v: number[], bar: number): { n: number; a: number } => {
    let n = 0; let a = 0;
    for (let i = 0; i < v.length; i += 1) if (v[i] >= bar) { n += 1; a += ar[i]; }
    return { n, a };
  };
  const sA = shareOver(spr, 45); const sB = shareOver(spr, 15); const sC = shareOver(spr, 1);
  log(`  ── per-facet diagnosis over ${fs.length} target facets (AREA ${aAll.toFixed(4)} mm2) ──`);
  log(`     normDeg inset 0.00   p10 ${q(nd0, 0.1).toFixed(2)} p50 ${q(nd0, 0.5).toFixed(2)} p90 ${q(nd0, 0.9).toFixed(2)} MAX ${mx(nd0).toFixed(2)} deg`);
  log(`     normDeg inset 0.05   p10 ${q(nd5, 0.1).toFixed(2)} p50 ${q(nd5, 0.5).toFixed(2)} p90 ${q(nd5, 0.9).toFixed(2)} MAX ${mx(nd5).toFixed(2)} deg`);
  log(`  (A) orientOfFacet.spreadRad  — the KINK-AWARE sampler's own crease detector, inside the footprint:`);
  log(`     spreadDeg  p10 ${q(spr, 0.1).toFixed(3)} p50 ${q(spr, 0.5).toFixed(3)} p90 ${q(spr, 0.9).toFixed(3)} MAX ${mx(spr).toFixed(2)} deg`);
  log(`     >=45 deg: COUNT ${sA.n} (${((100 * sA.n) / fs.length).toFixed(2)}%)  AREA ${((100 * sA.a) / aAll).toFixed(2)}%`);
  log(`     >=15 deg: COUNT ${sB.n} (${((100 * sB.n) / fs.length).toFixed(2)}%)  AREA ${((100 * sB.a) / aAll).toFixed(2)}%`);
  log(`     >= 1 deg: COUNT ${sC.n} (${((100 * sC.n) / fs.length).toFixed(2)}%)  AREA ${((100 * sC.a) / aAll).toFixed(2)}%`);
  log(`  (B) r-span across the footprint (a CLIFF/JUMP signature; the facet's own diam for scale):`);
  log(`     rSpan mm   p50 ${q(rsp, 0.5).toExponential(3)} p90 ${q(rsp, 0.9).toExponential(3)} MAX ${mx(rsp).toExponential(3)}`);
  log(`     diam  mm   p50 ${q(dia, 0.5).toExponential(3)} p90 ${q(dia, 0.9).toExponential(3)}`);
  log(`     rSpan/diam p50 ${(q(rsp, 0.5) / Math.max(1e-12, q(dia, 0.5))).toFixed(3)}`);
  log(`     pairs whose locateKinkRaw hit was a JUMP (curtain material): edge ${tgt.filter((t) => t.jumpEdge).length}  seg ${tgt.filter((t) => t.jumpSeg).length}  of ${tgt.length}`);
  log(`  (C) parameter-footprint degeneracy:`);
  log(`     graphRatio p50 ${q(gr, 0.5).toFixed(3)} p90 ${q(gr, 0.9).toFixed(3)} MAX ${mx(gr).toFixed(3)}   (the wall cut is <= ${CURTAIN_RATIO})`);
  log(`  (D) residual = smooth surface + tilted facet: facets with spreadDeg < 1 AND normDeg(0.05) > 10:`);
  {
    let n = 0; let a = 0;
    for (let i = 0; i < fs.length; i += 1) if (spr[i] < 1 && nd5[i] > 10) { n += 1; a += ar[i]; }
    log(`     COUNT ${n} (${((100 * n) / fs.length).toFixed(2)}%)   AREA ${a.toFixed(4)} mm2 = ${((100 * a) / aAll).toFixed(2)}% of the target facets scored`);
  }
  log('  (E) FOOTPRINT NORMAL-SET DIAMETER (order-12, one-sided branch) — the UNDER-RESOLUTION discriminator:');
  log(`     fpDiam deg  p10 ${q(fpd, 0.1).toFixed(2)} p50 ${q(fpd, 0.5).toFixed(2)} p90 ${q(fpd, 0.9).toFixed(2)} MAX ${mx(fpd).toFixed(2)}`);
  {
    const rat = fpd.map((v, i) => v / Math.max(1e-9, nd0[i]));
    log(`     fpDiam / normDeg(0)  p10 ${q(rat, 0.1).toFixed(3)} p50 ${q(rat, 0.5).toFixed(3)} p90 ${q(rat, 0.9).toFixed(3)}`);
    let uN = 0; let uA = 0; let pN = 0; let pA = 0;
    for (let i = 0; i < fs.length; i += 1) {
      if (fpd[i] >= 0.5 * nd0[i] && spr[i] < 15) { uN += 1; uA += ar[i]; }          // surface really swings, no kink
      if (fpd[i] < 0.5 * nd0[i] && nd0[i] > 10) { pN += 1; pA += ar[i]; }           // flat-ish surface, tilted facet
    }
    log(`     UNDER-RESOLUTION  (fpDiam >= 0.5*normDeg AND spread < 15): COUNT ${uN} (${((100 * uN) / fs.length).toFixed(2)}%)  AREA ${((100 * uA) / aAll).toFixed(2)}%   <== DENSITY FIXES THIS`);
    log(`     PLACEMENT DEFECT  (fpDiam <  0.5*normDeg AND normDeg > 10): COUNT ${pN} (${((100 * pN) / fs.length).toFixed(2)}%)  AREA ${((100 * pA) / aAll).toFixed(2)}%`);
    outAll.push({ style: STYLE, fpDiamP50: q(fpd, 0.5), fpDiamMax: mx(fpd), underResPct: (100 * uN) / fs.length, underResAreaPct: (100 * uA) / aAll, placePct: (100 * pN) / fs.length, placeAreaPct: (100 * pA) / aAll, kind: 'E' });
  }
  outAll.push({
    style: STYLE, stem, targetPairs: tgt.length, scoredFacets: fs.length, scoredAreaMm2: aAll,
    nd0P50: q(nd0, 0.5), nd5P50: q(nd5, 0.5), nd5Max: mx(nd5),
    spreadP50: q(spr, 0.5), spreadP90: q(spr, 0.9), spreadMax: mx(spr),
    spreadGe45N: sA.n, spreadGe45AreaPct: (100 * sA.a) / aAll,
    spreadGe15N: sB.n, spreadGe15AreaPct: (100 * sB.a) / aAll,
    rSpanP50: q(rsp, 0.5), diamP50: q(dia, 0.5), grP50: q(gr, 0.5), grMax: mx(gr),
  });
}
writeFileSync(`${OUTDIR}/S114_DRAGONDIAG.json`, `${JSON.stringify(outAll, null, 2)}\n`);
log('');
log(`wrote ${OUTDIR}/S114_DRAGONDIAG.json`);
