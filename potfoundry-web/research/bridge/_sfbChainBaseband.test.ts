// _sfbChainBaseband.test.ts — DEV-ONLY. E-2026-07-02-SFB-CHAIN Lever 2 MECHANISM TEST on the BASE BAND only.
// The E-SFB-PUSH residual is the 6 base petal-tip cusps at t=0 (exp-0.86, dropped to 0.011 @ step0.03 but the
// recovery failed there). The base band t in [0, tBand] has a CONSTANT feature count (6 crests + 6 valleys,
// GEOM probe: 6 petals until t~0.008, then 7 — so tBand<=0.008 is a clean constant-12-feature band). Build a
// RIDGE-LINKED equal-count structured strip on JUST this band: columns = [feat_1, subs, feat_2, subs, ...] in a
// FIXED feature order across rows => each feature is a near-vertical mesh-edge COLUMN by construction (zero
// serration, no recovery). Refine sub-columns near each feature to close the cusp. Measures whether the base
// tips reach <=0.01 with a clean ridge-column (the decisive mechanism test — cheap, no kernel, no recovery).
//
// This is an OPEN wall band (t in [0,tBand]) — a MECHANISM test, not the closed pot. Fidelity = own-region
// radial chord (faithful single-valued) + analytic brute at worst; serration to the linked feature loci;
// watertight is N/A for an open band (report raw-index >2-edge count = interior non-manifold, must be 0).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag, triangleQualityDistribution, projectPointToRadialSurface } from './labkit';
import { trustedWorstAnalytic, serrationToMeshEdge } from './_sfbPushLib';
import type { StyleDims } from './runStyle';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_sfbchain');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));

// per-row radial extrema (crest=max sign+1, valley=min sign-1), golden-refined, returned as {theta, sign}.
function rowFeatures(rA: AnalyticRadiusFn, z: number, scanN: number): Array<{ th: number; sign: number }> {
  const vals = new Float64Array(scanN);
  for (let i = 0; i < scanN; i++) vals[i] = rA(TAU * (i / scanN), z);
  const out: Array<{ th: number; sign: number }> = [];
  const rawA: Array<{ th: number; sign: number; r: number }> = [];
  for (let i = 0; i < scanN; i++) {
    const a = vals[(i - 1 + scanN) % scanN], b = vals[i], c = vals[(i + 1) % scanN];
    // SEAM-ROBUST refine: search the window in a CONTINUOUS (possibly negative / >TAU) frame anchored at i/N so a
    // feature straddling u=0 is not wrapped to two sides / lost. Normalize to [0,TAU) ONLY at the end (single pt).
    const refCont = (i0: number, sign: number): number => {
      let lo = (i0 - 1) / scanN, hi = (i0 + 1) / scanN; const gr = (Math.sqrt(5) - 1) / 2;
      const f = (u: number): number => sign * rA(TAU * (((u % 1) + 1) % 1), z);
      let c1 = hi - gr * (hi - lo), c2 = lo + gr * (hi - lo); let f1 = f(c1), f2 = f(c2);
      for (let it = 0; it < 60 && hi - lo > 1e-9; it++) { if (f1 < f2) { lo = c1; c1 = c2; f1 = f2; c2 = lo + gr * (hi - lo); f2 = f(c2); } else { hi = c2; c2 = c1; f2 = f1; c1 = hi - gr * (hi - lo); f1 = f(c1); } }
      let u = (lo + hi) / 2; u = ((u % 1) + 1) % 1; return u * TAU; // exactly one representative in [0,TAU)
    };
    if (b >= a && b > c) { const th = refCont(i, 1); rawA.push({ th, sign: 1, r: rA(th, z) }); }
    if (b <= a && b < c) { const th = refCont(i, -1); rawA.push({ th, sign: -1, r: rA(th, z) }); }
  }
  // DEDUP identical θ (a seam feature can be detected at both i≈0 and i≈N-1 → two entries at ~same θ).
  rawA.sort((x, y) => x.th - y.th);
  const dd: typeof rawA = [];
  for (const f of rawA) { if (dd.length === 0 || Math.abs(f.th - dd[dd.length - 1].th) > 1e-5) dd.push(f); }
  if (dd.length > 1 && dd[0].th + TAU - dd[dd.length - 1].th < 1e-5) dd.pop();
  rawA.length = 0; for (const f of dd) rawA.push(f);
  // ENFORCE crest/valley ALTERNATION (collapse a same-sign run to its strongest extremum). A well-formed periodic
  // profile alternates; a spurious split gives two crests with no valley -> keep the max-r crest / min-r valley.
  for (const f of rawA) {
    if (out.length > 0 && (out[out.length - 1] as any).sign === f.sign) {
      const prev = out[out.length - 1] as any;
      if ((f.sign > 0 && f.r > prev.r) || (f.sign < 0 && f.r < prev.r)) out[out.length - 1] = f as any;
    } else out.push(f as any);
  }
  if (out.length > 1 && (out[0] as any).sign === (out[out.length - 1] as any).sign) {
    const first = out[0] as any, last = out[out.length - 1] as any;
    if ((first.sign > 0 && last.r >= first.r) || (first.sign < 0 && last.r <= first.r)) out.shift(); else out.pop();
  }
  // remove near-coincident opposite-sign pairs (a degenerate crest≈valley at the seam gives a 0-width column).
  const minGapRad = 0.3 / 50;
  const filt: Array<{ th: number; sign: number }> = [];
  for (const f of out) { if (filt.length === 0 || Math.abs(f.th - filt[filt.length - 1].th) > minGapRad) filt.push(f); }
  if (filt.length > 1 && (filt[0].th + TAU - filt[filt.length - 1].th) < minGapRad) filt.pop();
  return filt;
}

// RIDGE-LINKED equal-count columns with a GRADED per-gap fractional layout. Column c means the SAME logical
// slot on every row => equal-count index strip => feature is a mesh-edge column (zero serration). The sub-column
// positions inside each gap are the SAME fixed fractions `fracs` (in (0,1)) for every gap and every row, so the
// count is constant. fracs is DENSE near 0 and 1 (the cusp shoulders next to each feature) and sparse in the
// middle — this makes the tip facet (feature -> first sub) TINY while keeping the mid-gap cheap.
function linkedColumnThetas(feats: number[], fracsPerGap: number[][]): Float64Array {
  const n = feats.length; const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const a = feats[k]; const b = (k + 1 < n ? feats[k + 1] : feats[0] + TAU);
    out.push(((a % TAU) + TAU) % TAU); // the feature column itself
    for (const fr of fracsPerGap[k]) { let v = a + (b - a) * fr; v = ((v % TAU) + TAU) % TAU; out.push(v); }
  }
  return Float64Array.from(out);
}


describe('SFB-CHAIN BASEBAND — ridge-linked column mechanism test', () => {
  it.skipIf(process.env.PF_SFBCHAIN_BASEBAND !== '1')('base-band ridge columns reach <=0.01 with zero serration (resumable)', () => {
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const tLo = Number(process.env.PF_SFBCHAIN_TLO ?? '0');          // window low
    const tBand = Number(process.env.PF_SFBCHAIN_TBAND ?? '0.008');  // window high
    const nRows = Number(process.env.PF_SFBCHAIN_ROWS ?? '400');     // z-rows across the window
    const scanN = Number(process.env.PF_SFBCHAIN_SCANN ?? '16000');
    const dthMm = Number(process.env.PF_SFBCHAIN_DTH ?? '0.02'); // across-flank target arc (mm) — smooth flanks
    const tipArcEnv = process.env.PF_SFBCHAIN_TIPARC ?? '0.02';
    const nShEnv = process.env.PF_SFBCHAIN_NSH ?? '6';
    const clusterBase = process.env.PF_SFBCHAIN_CLUSTERBASE === '1'; // quadratic-cluster rows at tLo (cusp)
    const name = `baseband_tl${String(tLo).replace('.', 'p')}_tb${String(tBand).replace('.', 'p')}_r${nRows}_dth${String(dthMm).replace('.', 'p')}_ta${tipArcEnv.replace('.', 'p')}_sh${nShEnv}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }

    // seed feature order from the window MIDPOINT (robust). Establish count + order.
    const zSeed = ((tLo + tBand) / 2) * DIMS.H;
    const seedFeats = rowFeatures(rA, zSeed, scanN);
    const nFeat = seedFeats.length;
    console.log(`window [${tLo},${tBand}]: ${nFeat} features at mid t=${((tLo + tBand) / 2).toFixed(4)}`);

    // z-rows across [tLo, tBand]. cluster at tLo if clusterBase (base cusp), else uniform.
    const ts: number[] = [];
    for (let i = 0; i <= nRows; i++) { const f = i / nRows; ts.push(tLo + (tBand - tLo) * (clusterBase ? f * f : f)); }
    const tsU = Array.from(new Set(ts.map((t) => +t.toFixed(8)))).sort((a, b) => a - b);

    // UNIFORM sub-column fractions across each gap sized to dthMm (resolves the STEEP PETAL FLANKS, not only the
    // tip — the flanks between crest and valley carry most of the chord, so shoulder-only grading left an 11mm
    // mid-gap facet). Equal-count => ridge-linked index strip => feature is a clean mesh-edge column. subN = the
    // MAX over gaps of ceil(gapMm/dthMm)-1 so the finest gap governs (constant count for the index strip).
    const gapsMm: number[] = [];
    for (let k = 0; k < seedFeats.length; k++) { const a = seedFeats[k].th, b = (k + 1 < seedFeats.length ? seedFeats[k + 1].th : seedFeats[0].th + TAU); let g = b - a; if (g < 0) g += TAU; gapsMm.push(g * 50); }
    // PER-GAP fractions (fixed per gap-index across rows -> equal-count strip preserved). Each gap gets UNIFORM
    // subs sized to dthMm (resolves flanks) PLUS geometric SHOULDER refinement from tipArcMm..dthMm next to each
    // feature (the exp-0.86 tip cusp). Narrow crest-valley gaps thus get their OWN dense sampling (the maxGap-
    // shared-fraction bug that left a 0.5mm facet across a 0.5mm gap is fixed).
    const tipArcMm = Number(process.env.PF_SFBCHAIN_TIPARC ?? '0.02');
    const nShoulder = Number(process.env.PF_SFBCHAIN_NSH ?? '6');
    const fracsPerGap: number[][] = gapsMm.map((gMm) => {
      const set = new Set<number>();
      const subN = Math.max(1, Math.ceil(gMm / dthMm) - 1);
      for (let j = 1; j <= subN; j++) set.add(+(j / (subN + 1)).toFixed(9));
      for (let i = 0; i < nShoulder; i++) {
        const arc = tipArcMm * Math.pow(Math.max(dthMm, tipArcMm) / tipArcMm, i / Math.max(1, nShoulder - 1));
        const fr = arc / gMm;
        if (fr > 1e-7 && fr < 0.5) { set.add(+fr.toFixed(9)); set.add(+(1 - fr).toFixed(9)); }
      }
      return Array.from(set).filter((x) => x > 1e-7 && x < 1 - 1e-7).sort((a, b) => a - b);
    });
    const nColPerRow = nFeat + fracsPerGap.reduce((s, a) => s + a.length, 0);
    console.log(`gaps ${gapsMm.map((g) => g.toFixed(2)).join(',')}mm subsPerGap ${fracsPerGap.map((a) => a.length).join(',')} (nCol/row = ${nColPerRow})`);

    // per-row: link features to the seed order by nearest theta; emit the SAME graded fraction layout.
    const rowsTh: Float64Array[] = [];
    const rowZ: number[] = [];
    for (const t of tsU) {
      const z = t * DIMS.H;
      const fr = rowFeatures(rA, z, scanN);
      if (fr.length !== nFeat) continue; // stay strictly in the constant-count band
      const ordered: number[] = [];
      const used = new Array(fr.length).fill(false);
      for (const sf of seedFeats) {
        let best = -1, bd = Infinity;
        for (let k = 0; k < fr.length; k++) { if (used[k]) continue; let d = Math.abs(fr[k].th - sf.th); if (d > Math.PI) d = TAU - d; if (d < bd) { bd = d; best = k; } }
        if (best >= 0) { used[best] = true; ordered.push(fr[best].th); }
      }
      rowsTh.push(linkedColumnThetas(ordered, fracsPerGap));
      rowZ.push(z);
    }
    console.log(`rows in band: ${rowsTh.length}, cols/row: ${rowsTh[0]?.length}`);
    // build equal-count index strip wall (column c -> c across rows). All rows have the SAME count nFeat*(1+fixedSub).
    const nCol = rowsTh[0].length;
    const nR = rowsTh.length;
    const xyz = new Float64Array(nR * nCol * 3); const ut: number[] = new Array(nR * nCol * 2);
    for (let r = 0; r < nR; r++) for (let k = 0; k < nCol; k++) {
      const th = rowsTh[r][k]; const z = rowZ[r]; const rad = rA(th, z); const v = r * nCol + k;
      xyz[3 * v] = rad * Math.cos(th); xyz[3 * v + 1] = rad * Math.sin(th); xyz[3 * v + 2] = z;
      ut[2 * v] = th / TAU; ut[2 * v + 1] = z / DIMS.H;
    }
    const idx: number[] = [];
    const d2 = (u: number, v: number): number => { const dx = xyz[3 * u] - xyz[3 * v], dy = xyz[3 * u + 1] - xyz[3 * v + 1], dz = xyz[3 * u + 2] - xyz[3 * v + 2]; return dx * dx + dy * dy + dz * dz; };
    for (let r = 0; r + 1 < nR; r++) {
      const tb = r * nCol, bb = (r + 1) * nCol;
      for (let c = 0; c < nCol; c++) {
        const cn = (c + 1) % nCol;
        const a = tb + c, an = tb + cn, b = bb + c, bn = bb + cn;
        if (d2(a, bn) <= d2(an, b)) { idx.push(a, b, bn); idx.push(a, bn, an); }
        else { idx.push(a, b, an); idx.push(an, b, bn); }
      }
    }
    const idxA = Uint32Array.from(idx); const nF = idxA.length / 3;
    console.log(`wall ${nF} tris, ${nR * nCol} verts`);

    // interior non-manifold (raw index >2-shared edge; an OPEN band has boundary edges =1, interior =2). SHARDED
    // (a single Map caps at 2^24; a dense band overflows).
    const nonManRaw = ((): number => {
      let mx = 0; for (let i = 0; i < idxA.length; i++) if (idxA[i] > mx) mx = idxA[i];
      const EK = mx + 1; const NSHARD = 64;
      const ms: Array<Map<number, number>> = Array.from({ length: NSHARD }, () => new Map<number, number>());
      const bump = (a: number, b: number): void => { const lo = a < b ? a : b, hi = a < b ? b : a; const k = lo * EK + hi; const m = ms[lo & (NSHARD - 1)]; m.set(k, (m.get(k) ?? 0) + 1); };
      for (let f = 0; f < idxA.length; f += 3) { const a = idxA[f], b = idxA[f + 1], c = idxA[f + 2]; bump(a, b); bump(b, c); bump(a, c); }
      let nm = 0; for (const m of ms) for (const v of m.values()) if (v > 2) nm++; return nm;
    })();

    const utArr = ut as number[]; const xyzF = Float32Array.from(xyz);
    const own = perFaceChordSag(utArr, idxA, rA, DIMS.H);
    const twOwn = trustedWorstAnalytic(utArr, xyzF, idxA, own.faceErr,
      (px, py, pz) => projectPointToRadialSurface(px, py, pz, rA).dist, rA, DIMS.H, 600, 0.01);
    // serration: build feature loci for THIS band (linked features across rows) as (u,t) samples
    const featUt: number[] = [];
    for (let r = 0; r < nR; r++) { const z = rowZ[r]; const fr = rowFeatures(rA, z, scanN); for (const f of fr) featUt.push((((f.th / TAU) % 1) + 1) % 1, z / DIMS.H); }
    const serr = serrationToMeshEdge(featUt, rA, DIMS.H, xyzF, idxA);
    const vtx = Float64Array.from(xyz);
    const tq = triangleQualityDistribution({ vertices: vtx, indices: idxA });
    const rec = {
      config: name, tBand, nRows: nR, nFeat, nCol, dthMm, tris: nF,
      nonManRaw, ownWorstMm: own.worstMm,
      ownTrustedWorstMm: twOwn.worstMm, ownTrustedNOver01: twOwn.nOverTol,
      ownNOver01: Math.round(own.fracOver(0.01) * nF), pctOver01: 100 * own.fracOver(0.01),
      maxBruteMinusGn: twOwn.maxBruteMinusGn,
      ownTrustedWorstFacets: twOwn.overFacets.slice(0, 10),
      serrationMm: { worst: serr.worstMm, p99: serr.p99Mm, mean: serr.meanMm, n: serr.n },
      quality: { minAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20 },
    };
    ckpt(name, rec);
    console.log(`BASEBAND ${name} ownWorst ${own.worstMm.toFixed(4)} ownTrusted ${twOwn.worstMm.toFixed(4)} (nOver01 ${twOwn.nOverTol}) serr ${serr.worstMm.toExponential(2)} rawNonMan ${nonManRaw} minAngle ${tq.minAngleDeg} %<20 ${tq.pctBelow20}`);
    expect(nF).toBeGreaterThan(0);
  }, 1_800_000);
});
