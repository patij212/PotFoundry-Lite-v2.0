// _sfbChainWall.test.ts — DEV-ONLY. E-2026-07-02-SFB-CHAIN Lever 2 FULL closed wall (the deliverable build).
// Ridge-linked equal-count columns, band-by-band between the 4 petal-birth transitions (GEOM: 6->7 t~0.008,
// 7->8 t~0.342, 8->9 t~0.567, 9->10 t~0.833). Within each constant-feature-count band the columns are the
// ridge/valley loci (linked by nearest-theta to the band's seed order) + per-gap sub-columns => each feature is
// a near-vertical mesh-edge COLUMN by construction (zero serration, no recovery). At each transition one
// merge-strip row (stripBetween) bridges the count change (the feature-graph fork — inherently one merge row).
// Full z in [0,120] so facets have sane aspect ratios (the thin-base-band test's degenerate slivers are avoided).
//
// Measured: own-region radial chord (faithful single-valued, E-BREADTH) + analytic-brute at worst; serration to
// traced loci; watertight by RAW-INDEX (closed wall: every edge shared by exactly 2 => nonMan=0, boundary only
// at z=0/z=H rims which the pot base/rim close in production). z-rows dense at the base (exp-0.86 tip cusp).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface, dumpRenderBins } from './labkit';
import { trustedWorstAnalytic, serrationToMeshEdge, vertColorsFrom, tracePetalLoci } from './_sfbPushLib';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_sfbchain');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

// transition t-values (petal births); band boundaries. From GEOM probe.
const TRANSITIONS = [0.008, 0.342, 0.567, 0.833];

// robust: return ALTERNATING crest/valley features (a well-formed periodic profile has equal counts that strictly
// alternate). Detect crests + valleys separately, then ENFORCE alternation by keeping the strongest extremum in
// any same-type run (a spurious split gives two crests with no valley between — drop the weaker). This removes the
// odd-count / cross-type-dedup bug that mangled the linking.
function rowFeatures(rA: AnalyticRadiusFn, z: number, scanN: number): number[] {
  const vals = new Float64Array(scanN);
  for (let i = 0; i < scanN; i++) vals[i] = rA(TAU * (i / scanN), z);
  const refine = (i0: number, sign: number): number => {
    let lo = (i0 - 1) / scanN, hi = (i0 + 1) / scanN; const gr = (Math.sqrt(5) - 1) / 2;
    const f = (u: number): number => sign * rA(TAU * (((u % 1) + 1) % 1), z);
    let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
    for (let it = 0; it < 60 && hi - lo > 1e-9; it++) { if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); } else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); } }
    let u = (lo + hi) / 2; u -= Math.floor(u); return u * TAU;
  };
  const raw: Array<{ th: number; sign: number; r: number }> = [];
  for (let i = 0; i < scanN; i++) {
    const a = vals[(i - 1 + scanN) % scanN], b = vals[i], c = vals[(i + 1) % scanN];
    if (b >= a && b > c) { const th = refine(i, 1); raw.push({ th, sign: 1, r: rA(th, z) }); }
    if (b <= a && b < c) { const th = refine(i, -1); raw.push({ th, sign: -1, r: rA(th, z) }); }
  }
  raw.sort((x, y) => x.th - y.th);
  // collapse consecutive SAME-sign runs (cyclic) into the strongest one (crest=max r, valley=min r).
  const out: Array<{ th: number; sign: number }> = [];
  for (const f of raw) {
    if (out.length > 0 && out[out.length - 1].sign === f.sign) {
      const prev = out[out.length - 1] as { th: number; sign: number; r: number };
      if ((f.sign > 0 && f.r > (prev as any).r) || (f.sign < 0 && f.r < (prev as any).r)) out[out.length - 1] = f as any;
    } else out.push(f as any);
  }
  // cyclic wrap: if first and last share sign, merge
  if (out.length > 1 && out[0].sign === out[out.length - 1].sign) {
    const first = out[0] as any, last = out[out.length - 1] as any;
    if ((first.sign > 0 && last.r >= first.r) || (first.sign < 0 && last.r <= first.r)) out.shift(); else out.pop();
  }
  return out.map((f) => f.th);
}

// per-gap fraction lists sized to dthMm + geometric shoulder refinement (tipArcMm..dthMm) next to each feature.
function perGapFracs(feats: number[], dthMm: number, tipArcMm: number, nShoulder: number): number[][] {
  const n = feats.length;
  return feats.map((a, k) => {
    const b = (k + 1 < n ? feats[k + 1] : feats[0] + TAU);
    let gap = b - a; if (gap < 0) gap += TAU; const gMm = gap * 50;
    const set = new Set<number>();
    const subN = Math.max(1, Math.ceil(gMm / dthMm) - 1);
    for (let j = 1; j <= subN; j++) set.add(+(j / (subN + 1)).toFixed(9));
    for (let i = 0; i < nShoulder; i++) {
      const arc = tipArcMm * Math.pow(Math.max(dthMm, tipArcMm) / tipArcMm, i / Math.max(1, nShoulder - 1));
      const fr = arc / gMm; if (fr > 1e-7 && fr < 0.5) { set.add(+fr.toFixed(9)); set.add(+(1 - fr).toFixed(9)); }
    }
    return Array.from(set).filter((x) => x > 1e-7 && x < 1 - 1e-7).sort((x, y) => x - y);
  });
}

function linkedColumnThetas(feats: number[], fracsPerGap: number[][]): Float64Array {
  const n = feats.length; const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = feats[k], b = (k + 1 < n ? feats[k + 1] : feats[0] + TAU);
    out.push(((a % TAU) + TAU) % TAU);
    for (const fr of fracsPerGap[k]) { let v = a + (b - a) * fr; v = ((v % TAU) + TAU) % TAU; out.push(v); }
  }
  return Float64Array.from(out);
}

// order a row's features to match a seed cyclic order by nearest theta.
function orderToSeed(feats: number[], seed: number[]): number[] {
  const used = new Array(feats.length).fill(false); const out: number[] = [];
  for (const sf of seed) {
    let best = -1, bd = Infinity;
    for (let k = 0; k < feats.length; k++) { if (used[k]) continue; let d = Math.abs(feats[k] - sf); if (d > Math.PI) d = TAU - d; if (d < bd) { bd = d; best = k; } }
    if (best >= 0) { used[best] = true; out.push(feats[best]); }
  }
  return out;
}

describe('SFB-CHAIN WALL — full ridge-linked column wall (Lever 2 deliverable)', () => {
  it.skipIf(process.env.PF_SFBCHAIN_WALL !== '1')('builds full ridge-column wall; measures fidelity/serration/rawNonMan (resumable)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const dthMm = Number(process.env.PF_SFBCHAIN_DTH ?? '0.08');    // across-flank arc (mm)
    const tipArcMm = Number(process.env.PF_SFBCHAIN_TIPARC ?? '0.02');
    const nSh = Number(process.env.PF_SFBCHAIN_NSH ?? '8');
    const dzMm = Number(process.env.PF_SFBCHAIN_DZ ?? '0.35');      // z-row spacing (mm) in the mid wall
    const dzBaseMm = Number(process.env.PF_SFBCHAIN_DZBASE ?? '0.01'); // dense z at base (tip cusp)
    const tBaseFine = Number(process.env.PF_SFBCHAIN_TBASE ?? '0.02');
    const scanN = Number(process.env.PF_SFBCHAIN_SCANN ?? '16000');
    const name = `wall_dth${String(dthMm).replace('.', 'p')}_ta${String(tipArcMm).replace('.', 'p')}_sh${nSh}_dz${String(dzMm).replace('.', 'p')}_dzb${String(dzBaseMm).replace('.', 'p')}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }

    // z-rows: dense base band [0,tBaseFine] at dzBase, then dz. Also FORCE a row at each transition +/- eps.
    const tset = new Set<number>();
    for (let z = 0; z <= tBaseFine * DIMS.H + 1e-9; z += dzBaseMm) tset.add(+(z / DIMS.H).toFixed(8));
    for (let z = tBaseFine * DIMS.H; z <= DIMS.H + 1e-9; z += dzMm) tset.add(+(Math.min(DIMS.H, z) / DIMS.H).toFixed(8));
    tset.add(1);
    for (const tr of TRANSITIONS) { tset.add(+(tr - 5e-4).toFixed(8)); tset.add(+(tr + 5e-4).toFixed(8)); }
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);

    // assign each row to a band (by transition boundaries); build per-band seed order (from the band midpoint).
    const bandOf = (t: number): number => { let b = 0; for (const tr of TRANSITIONS) { if (t >= tr) b++; } return b; };
    const bandMidT = (b: number): number => {
      const lo = b === 0 ? 0 : TRANSITIONS[b - 1];
      const hi = b >= TRANSITIONS.length ? 1 : TRANSITIONS[b];
      return (lo + hi) / 2;
    };
    const bandSeed: number[][] = [];
    const bandFracs: number[][][] = [];
    for (let b = 0; b <= TRANSITIONS.length; b++) {
      const seed = rowFeatures(rA, bandMidT(b) * DIMS.H, scanN);
      bandSeed.push(seed);
      bandFracs.push(perGapFracs(seed, dthMm, tipArcMm, nSh));
    }
    console.log(`bands ${bandSeed.length} feat-counts ${bandSeed.map((s) => s.length).join(',')} rows ${ts.length}`);

    // build per-row theta arrays. Rows in the same band share column layout (equal-count strip). Rows across a
    // band boundary have different counts -> stripBetween merge.
    const rowsTh: Float64Array[] = []; const rowZ: number[] = []; const rowBand: number[] = [];
    for (const t of ts) {
      const b = bandOf(t); const z = t * DIMS.H;
      const fr = rowFeatures(rA, z, scanN);
      if (fr.length !== bandSeed[b].length) continue; // stay within the band's constant count (drop odd rows)
      const ordered = orderToSeed(fr, bandSeed[b]);
      rowsTh.push(linkedColumnThetas(ordered, bandFracs[b]));
      rowZ.push(z); rowBand.push(b);
    }
    // lift + index
    const rowStart: number[] = [0]; let total = 0;
    for (const th of rowsTh) { total += th.length; rowStart.push(total); }
    const xyz = new Float64Array(total * 3); const ut: number[] = new Array(total * 2);
    for (let r = 0; r < rowsTh.length; r++) {
      const base = rowStart[r]; const z = rowZ[r];
      for (let k = 0; k < rowsTh[r].length; k++) { const th = rowsTh[r][k]; const rad = rA(th, z); const v = base + k; xyz[3 * v] = rad * Math.cos(th); xyz[3 * v + 1] = rad * Math.sin(th); xyz[3 * v + 2] = z; ut[2 * v] = th / TAU; ut[2 * v + 1] = z / DIMS.H; }
    }
    const idx: number[] = [];
    const d2 = (u: number, v: number): number => { const dx = xyz[3 * u] - xyz[3 * v], dy = xyz[3 * u + 1] - xyz[3 * v + 1], dz = xyz[3 * u + 2] - xyz[3 * v + 2]; return dx * dx + dy * dy + dz * dz; };
    for (let r = 0; r + 1 < rowsTh.length; r++) {
      const tb = rowStart[r], bb = rowStart[r + 1]; const topTh = rowsTh[r], botTh = rowsTh[r + 1];
      const nTop = topTh.length, nBot = botTh.length;
      if (nTop === nBot && rowBand[r] === rowBand[r + 1]) {
        // equal-count structured strip (ridge = mesh-edge column)
        for (let c = 0; c < nTop; c++) { const cn = (c + 1) % nTop; const a = tb + c, an = tb + cn, bv = bb + c, bn = bb + cn; if (d2(a, bn) <= d2(an, bv)) { idx.push(a, bv, bn); idx.push(a, bn, an); } else { idx.push(a, bv, an); idx.push(an, bv, bn); } }
      } else {
        // theta-merge strip across a transition
        let i = 0, j = 0; const tn = (k: number): number => (k + 1 < nTop ? topTh[k + 1] : topTh[0] + TAU); const bn = (k: number): number => (k + 1 < nBot ? botTh[k + 1] : botTh[0] + TAU);
        const tv = (k: number): number => tb + (k % nTop), bv = (k: number): number => bb + (k % nBot);
        for (let s = 0; s < nTop + nBot; s++) { if (tn(i) <= bn(j)) { idx.push(tv(i), bv(j), tv(i + 1)); i++; } else { idx.push(tv(i), bv(j), bv(j + 1)); j++; } }
      }
    }
    const idxA = Uint32Array.from(idx); const nF = idxA.length / 3;
    console.log(`wall ${nF} tris, ${total} verts`);

    // RAW-INDEX non-manifold (sharded). closed wall -> interior edges =2; only z=0/z=H rims are boundary.
    const edgeAudit = ((): { nonMan: number; boundary: number } => {
      let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
      const EK = mx + 1; const NSHARD = 64;
      const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
      const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
      for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; bump(a, b); bump(b, c); bump(a, c); }
      let nm = 0, bd = 0; for (const m of ms) for (const v of m.values()) { if (v > 2) nm++; else if (v === 1) bd++; } return { nonMan: nm, boundary: bd };
    })();

    const utArr = ut as number[]; const xyzF = Float32Array.from(xyz);
    const own = perFaceChordSag(utArr, idxA, rA, DIMS.H);
    const twOwn = trustedWorstAnalytic(utArr, xyzF, idxA, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 800, 0.01);
    const loci = tracePetalLoci(rA, DIMS.H, { nRows: 481, thetaScan: 4000, kind: 'both' });
    const featUt: number[] = []; for (const ln of loci) for (const p of ln.points) featUt.push(p.u, p.t);
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, idxA);
    const vtx = Float64Array.from(xyz);
    const tq = triangleQualityDistribution({ vertices: vtx, indices: idxA });
    const rec = {
      config: name, dthMm, tipArcMm, nSh, dzMm, dzBaseMm, tBaseFine, tris: nF, verts: total,
      featCounts: bandSeed.map((s) => s.length),
      nonManRaw: edgeAudit.nonMan, boundaryEdges: edgeAudit.boundary,
      ownWorstMm: own.worstMm, ownTrustedWorstMm: twOwn.worstMm, ownTrustedNOver01: twOwn.nOverTol,
      ownNOver01: Math.round(own.fracOver(0.01) * nF), pctOver01: 100 * own.fracOver(0.01),
      maxBruteMinusGn: twOwn.maxBruteMinusGn, maxGnMinusBrute: twOwn.maxGnMinusBrute,
      ownTrustedWorstFacets: twOwn.overFacets.slice(0, 15),
      serrationMm: { worst: serr.worstMm, p99: serr.p99Mm, mean: serr.meanMm, n: serr.n },
      quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ckpt(name, rec);
    const col = vertColorsFrom(own.vertErr, 0.01);
    const p99 = Array.from(own.faceErr).sort((x, y) => x - y)[Math.floor(0.99 * nF)] ?? 0;
    dumpRenderBins(ROOT, name, xyzF, idxA, { colors: col, meta: { ruler: 'true3d(own)', worstMm: twOwn.worstMm, p99Mm: p99, pctOver0_01: 100 * own.fracOver(0.01), scaleMm: 0.01, style: STYLE }, stl: process.env.PF_SFBCHAIN_STL === '1' });
    console.log(`WALL ${name} ownWorst ${own.worstMm.toFixed(4)} ownTrusted ${twOwn.worstMm.toFixed(4)} (nOver01 ${twOwn.nOverTol}) pctOver01 ${(100 * own.fracOver(0.01)).toFixed(4)} serr ${serr.worstMm.toExponential(2)} rawNonMan ${edgeAudit.nonMan} bnd ${edgeAudit.boundary} minAngle ${tq.minAngleDeg} %<20 ${tq.pctBelow20}`);
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
