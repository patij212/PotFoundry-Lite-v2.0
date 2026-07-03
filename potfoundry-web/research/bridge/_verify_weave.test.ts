// _verify_weave.test.ts — ADVERSARIAL VERIFIER for the WEAVE/BRAID axis (PF_VERIFY_WEAVE=1). DEV-ONLY (research/ only).
//
// Default verdict = REFUTED. The close-partner (_close_weave) claims BW_sq08 / CK_uni24_c06 / CT_uni24_c06 REACH
// honest true-3D p99 <= 0.01. This probe INDEPENDENTLY re-meshes each with the partner's stated recipe and re-measures
// with the honest labkit rulers, then ATTACKS:
//   (A) RULER ARTIFACT — the partner's honestVerdictP99 = min(anchoredTail, radialP99). On a CONST-U STRADDLE mesh the
//       swept crease is NOT a mesh edge, so a small fraction of facets carry a genuine ~0.5mm 3D gap that a p99 HIDES.
//       We report radial p99 AND radial max AND anchored-tail p99/max AND the red-fraction (>0.1mm) + gnOver so the
//       straddle tail cannot hide. A wider red sample (sampleN=200, redMm lower) than the partner's 60.
//   (B) DENSITY-FRAGILE — re-mesh at HALF the claimed density; does the honest number blow up? (over-fit to 1 density).
//   (C) WATERTIGHT both ways — RAW-index (auditNonManRaw, partner's audit) AND position-WELD (auditNonManByIndex,
//       coincident-vertex fold detector). Both must be 0.
//   (D) %<20 via triangleQualityDistribution on the WHOLE mesh (no lenient whole-vs-outer).
//
// ISOLATION: reuses _weaveLib (buildWeaveDoubledGrid, basketWeaveGrid) + _braidLib (celticKnotGrid) + labkit rulers
// READ-ONLY. NO src/ / kernel / labkit edits. Per-style ndjson checkpoint the INSTANT it is scored (resume-safe).
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp,
  triangleQualityDistribution, bruteNearestOnRadialSurface,
} from './labkit';
import { buildWeaveDoubledGrid, basketWeaveGrid, type WeaveCreaseGrid } from './_weaveLib';
import { celticKnotGrid } from './_braidLib';
import type { StyleId } from '../../src/geometry/types';
import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const RUN = process.env.PF_VERIFY_WEAVE === '1';
const TAU = 2 * Math.PI;
const DIMS = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const OUT = join(process.cwd(), 'research', 'exchange', '_verify_weave');
const NDJSON = join(OUT, 'verify.ndjson');

function pctl(arr: ArrayLike<number>, p: number): number {
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0;
}

/** RAW-index non-manifold edge count (>2 tris) — the partner's own watertight audit, no weld. Typed-array keys. */
function auditRawEdges(indices: ArrayLike<number>): { nonMan: number; boundary: number } {
  let maxI = 0;
  for (let k = 0; k < indices.length; k++) if (indices[k] > maxI) maxI = indices[k];
  const N = maxI + 1;
  if (N * N >= 9e15) throw new Error(`edge-key overflow risk: N=${N}`);
  const nTri = Math.floor(indices.length / 3);
  const keys = new Float64Array(nTri * 3);
  let w = 0;
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    keys[w++] = (a < b ? a * N + b : b * N + a);
    keys[w++] = (b < c ? b * N + c : c * N + b);
    keys[w++] = (c < a ? c * N + a : a * N + c);
  }
  const arr = keys.subarray(0, w).sort();
  let nonMan = 0, boundary = 0, i = 0;
  while (i < w) { let j = i + 1; while (j < w && arr[j] === arr[i]) j++; const cnt = j - i; if (cnt > 2) nonMan++; else if (cnt === 1) boundary++; i = j; }
  return { nonMan, boundary };
}

/**
 * POSITION-WELD non-manifold audit (coincident-vertex FOLD detector) — sharded so it survives >16.7M verts (labkit's
 * auditNonManByIndex uses a single Map for the weld canon which overflows the JS ~2^24 Map cap on these 10M-vertex
 * meshes). Weld vertices at the same quantized position (SHARDED weld map), then count undirected edges shared by >2
 * welded tris. A raw-index-0 but weld->0 pair confirms no coincident fold; weld>0 while raw==0 reveals a fold.
 */
function auditWeldNonMan(xyz: ArrayLike<number>, indices: ArrayLike<number>, quantizeMm = 1e-4): number {
  const n = xyz.length / 3;
  const q = 1 / quantizeMm;
  const NSH = 64;
  const wmaps: Array<Map<number, number>> = Array.from({ length: NSH }, () => new Map<number, number>());
  const canon = new Int32Array(n);
  // quantized position key packed into a Float64 (exact for |coord*q| < ~2e6 with these dims): shard by a cheap hash.
  const qkey = (i: number): { hi: number; lo: number; sh: number } => {
    const x = Math.round(xyz[3 * i] * q), y = Math.round(xyz[3 * i + 1] * q), z = Math.round(xyz[3 * i + 2] * q);
    // pack (x,y) into hi and z into lo; both stay well under 2^53 for these dims (|coord|<~180mm ⇒ |q-coord|<2e6)
    const hi = (x + 4194304) * 8388608 + (y + 4194304); // offset to non-negative; 2^22 range each
    const sh = (((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) >>> 0) & (NSH - 1);
    return { hi, lo: z, sh };
  };
  const keyStr = (i: number): string => `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`;
  // build weld canon: first-seen vertex index per quantized position, sharded by hash of the string key.
  const shardMaps: Array<Map<string, number>> = Array.from({ length: NSH }, () => new Map<string, number>());
  for (let i = 0; i < n; i++) {
    const { sh } = qkey(i); const k = keyStr(i); const mp = shardMaps[sh];
    const h = mp.get(k); if (h !== undefined) canon[i] = h; else { mp.set(k, i); canon[i] = i; }
  }
  void wmaps;
  // edge multiplicity on welded indices, sharded by min endpoint.
  const EK = n + 1;
  const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const ecs: Array<Map<number, number>> = Array.from({ length: NSH }, () => new Map<number, number>());
  const bump = (p: number, r: number): void => { const kk = key(p, r); const m = ecs[(p < r ? p : r) & (NSH - 1)]; m.set(kk, (m.get(kk) ?? 0) + 1); };
  for (let k = 0; k < indices.length; k += 3) {
    const a = canon[indices[k]], b = canon[indices[k + 1]], c = canon[indices[k + 2]];
    if (a === b || b === c || a === c) continue;
    bump(a, b); bump(b, c); bump(c, a);
  }
  let nm = 0; for (const m of ecs) for (const v of m.values()) if (v > 2) nm++; return nm;
}

interface VRecipe { style: StyleId; tag: string; grid: () => WeaveCreaseGrid; hRowMm: number; wTargetMm: number; cliffChordMm: number; }

/** INDEPENDENT re-mesh + re-measure with ATTACK metrics; append ndjson the instant it is scored. */
function verify(rA: AnalyticRadiusFn, r: VRecipe): Record<string, unknown> {
  const t0 = Date.now();
  const build = buildWeaveDoubledGrid(rA, H, r.grid(), {
    hRowMm: r.hRowMm, wTargetMm: r.wTargetMm, cliffChordMm: r.cliffChordMm, seamMode: 'cliff',
  });
  const m = build.mesh;
  const ut = m.ut, idx = m.idx, xyz = m.xyz;
  const tris = m.nF;

  // radial screen (the partner's honest upper-bound + red-facet picker)
  const radial = perFaceChordSag(ut, idx, rA, H);
  const radialP99 = pctl(radial.faceErr, 0.99);
  const radialP999 = pctl(radial.faceErr, 0.999);
  const radialMax = radial.worstMm;
  // GN true-3D field
  const true3d = perFaceTrue3DSag(ut, idx, rA, H);
  const gnP99 = pctl(true3d.faceErr, 0.99);
  const gnP999 = pctl(true3d.faceErr, 0.999);
  const gnMax = true3d.worstMm;
  // red fraction: facets whose GN true-3D exceeds 0.1mm and 0.05mm (the straddle tail the p99 can hide)
  let over10 = 0, over05 = 0;
  for (let f = 0; f < true3d.faceErr.length; f++) { if (true3d.faceErr[f] > 0.1) over10++; if (true3d.faceErr[f] > 0.05) over05++; }
  const fracOver10 = tris ? over10 / tris : 0;
  const fracOver05 = tris ? over05 / tris : 0;

  // HONEST brute-anchored true-3D on the worst RED facets — WIDER sample than the partner (sampleN=200, redMm=0.05 so
  // the swept-straddle tail is captured, not skipped). trustedP99/trustedMax = the honest steep-red perp.
  const anchor = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.05, sampleN: 200, radial });

  // quality on the WHOLE mesh (Float32 vertices)
  const vf = new Float32Array(xyz.length); for (let i = 0; i < xyz.length; i++) vf[i] = xyz[i];
  const tq = triangleQualityDistribution({ vertices: vf, indices: idx });

  // watertight BOTH ways
  const raw = auditRawEdges(idx);
  let weldNonMan = -1; // -1 = not computed (guard against OOM on huge meshes)
  try { weldNonMan = auditWeldNonMan(xyz, idx, 1e-4); } catch (e) { console.log(`weld audit skipped: ${(e as Error).message}`); }

  // the partner's own honest-verdict number (min of anchored tail + radial p99) — reproduce to compare
  const partnerHonestP99 = Math.min(anchor.trustedP99, radialP99);

  const row = {
    style: r.style, tag: r.tag,
    hRowMm: r.hRowMm, wTargetMm: r.wTargetMm, cliffChordMm: r.cliffChordMm,
    tris, verts: m.nV,
    // honest verdict numbers
    partnerHonestP99: +partnerHonestP99.toFixed(4),
    radialP99: +radialP99.toFixed(4), radialP999: +radialP999.toFixed(4), radialMax: +radialMax.toFixed(4),
    gnP99: +gnP99.toFixed(4), gnP999: +gnP999.toFixed(4), gnMax: +gnMax.toFixed(4),
    anchTailP99: +anchor.trustedP99.toFixed(4), anchTailMax: +anchor.trustedMax.toFixed(4),
    nRed: anchor.nRed, nSample: anchor.nSample, gnOver: anchor.gnOver, bruteOver: anchor.bruteOver,
    fracOver10: +(fracOver10 * 100).toFixed(4), fracOver05: +(fracOver05 * 100).toFixed(4), nOver10: over10, nOver05: over05,
    pctBelow20: +tq.pctBelow20.toFixed(2), pctBelow10: +tq.pctBelow10.toFixed(2), minAngleDeg: +tq.minAngleDeg.toFixed(2),
    rawNonMan: raw.nonMan, boundary: raw.boundary, weldNonMan,
    // partner's verdict was reaches001 = partnerHonestP99 <= 0.01
    partnerReaches001: partnerHonestP99 <= 0.01,
    scoreMs: Date.now() - t0,
  };
  mkdirSync(OUT, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  console.log(
    `${r.tag} tris=${(tris / 1e6).toFixed(2)}M partnerP99=${row.partnerHonestP99} | radialP99=${row.radialP99} radialMax=${row.radialMax} ` +
    `gnP99=${row.gnP99} anchTailP99=${row.anchTailP99} anchTailMax=${row.anchTailMax} (nRed=${row.nRed} gnOver=${row.gnOver}) ` +
    `over0.1=${row.fracOver10}%(${over10}) over0.05=${row.fracOver05}%(${over05}) %<20=${row.pctBelow20} rawNM=${row.rawNonMan} weldNM=${row.weldNonMan} bnd=${row.boundary} (${row.scoreMs}ms)`,
  );
  return row;
}

function alreadyScored(tag: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').trim().split('\n').filter(Boolean)
    .some((l) => { try { return JSON.parse(l).tag === tag; } catch { return false; } });
}

const ckGrid = (rA: AnalyticRadiusFn, nU: number) => (): WeaveCreaseGrid => {
  const p = { ckScale: 1, ckWidth: 1, ckRelief: 1, ckGap: 1, ckRoundness: 1, ckTwist: 0, ckStrands: 1 };
  const base = celticKnotGrid(rA, H, p as never);
  const creaseU: number[] = []; for (let mm = 0; mm < nU; mm++) creaseU.push(mm / nU);
  return { creaseU, creaseT: base.creaseT };
};

describe('adversarial verify weave/braid (independent re-mesh + honest rulers)', () => {
  // ── BasketWeave: reproduce the CLAIMED winner (sq08) + a HALF-density density-fragility probe (sq16). ──
  it.skipIf(!RUN)('BasketWeave sq08 (claimed reach) + sq16 (half-density fragility)', () => {
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const grid = (): WeaveCreaseGrid => basketWeaveGrid(16, 10, 0);
    const recipes: VRecipe[] = [
      { style: 'BasketWeave', tag: 'V_BW_sq08', grid, hRowMm: 0.08, wTargetMm: 0.08, cliffChordMm: 0.08 },
      { style: 'BasketWeave', tag: 'V_BW_sq16', grid, hRowMm: 0.16, wTargetMm: 0.16, cliffChordMm: 0.16 },
    ];
    for (const r of recipes) { if (alreadyScored(r.tag)) { console.log(`skip ${r.tag}`); continue; } verify(rA, r); }
    expect(existsSync(NDJSON)).toBe(true);
  }, 60 * 60 * 1000);

  // ── CelticKnot: reproduce the CLAIMED winner (uni24_c06) + half-density (uni12_c12). ──
  it.skipIf(!RUN)('CelticKnot uni24_c06 (claimed reach) + uni12_c12 (half-density fragility)', () => {
    const rA = buildRadiusFn('CelticKnot', {}, DIMS);
    const recipes: VRecipe[] = [
      { style: 'CelticKnot', tag: 'V_CK_uni24_c06', grid: ckGrid(rA, 24), hRowMm: 0.06, wTargetMm: 0.06, cliffChordMm: 0.06 },
      { style: 'CelticKnot', tag: 'V_CK_uni12_c12', grid: ckGrid(rA, 12), hRowMm: 0.12, wTargetMm: 0.12, cliffChordMm: 0.12 },
    ];
    for (const r of recipes) { if (alreadyScored(r.tag)) { console.log(`skip ${r.tag}`); continue; } verify(rA, r); }
    expect(existsSync(NDJSON)).toBe(true);
  }, 60 * 60 * 1000);

  // ── CelticTriquetra: reproduce the CLAIMED winner (uni24_c06) + half-density (uni12_c12). ──
  it.skipIf(!RUN)('CelticTriquetra uni24_c06 (claimed reach) + uni12_c12 (half-density fragility)', () => {
    const rA = buildRadiusFn('CelticTriquetra', {}, DIMS);
    const recipes: VRecipe[] = [
      { style: 'CelticTriquetra', tag: 'V_CT_uni24_c06', grid: ckGrid(rA, 24), hRowMm: 0.06, wTargetMm: 0.06, cliffChordMm: 0.06 },
      { style: 'CelticTriquetra', tag: 'V_CT_uni12_c12', grid: ckGrid(rA, 12), hRowMm: 0.12, wTargetMm: 0.12, cliffChordMm: 0.12 },
    ];
    for (const r of recipes) { if (alreadyScored(r.tag)) { console.log(`skip ${r.tag}`); continue; } verify(rA, r); }
    expect(existsSync(NDJSON)).toBe(true);
  }, 60 * 60 * 1000);

  // ── ATTACK: is BasketWeave sq08's ~250k-facet GN>0.1mm tail a GENUINE 3D gap or GN-overstatement (steep-EXCLUDE)?
  // The main probe anchors the RADIAL-red facets (which come to 0.029). This anchors the worst facets BY GN TRUE-3D
  // (a DIFFERENT set — the cliff walls) with a full-azimuth brute (coarse+fine). If brute drops them << GN => steep-
  // EXCLUDE / radial-overstate (partner's claim holds, true-3D is CAD-grade). If they STAY >0.1 => genuine 3D gap =>
  // the p99<=0.01 verdict MASKS a real defect => REFUTE the CAD-grade framing. Appends a distinct ndjson row.
  it.skipIf(!RUN)('BasketWeave sq08 — anchor the GN-RED tail (steep-EXCLUDE vs genuine-gap)', () => {
    if (alreadyScored('V_BW_sq08_gnRed')) { console.log('skip V_BW_sq08_gnRed'); return; }
    const rA = buildRadiusFn('BasketWeave', {}, DIMS);
    const build = buildWeaveDoubledGrid(rA, H, basketWeaveGrid(16, 10, 0), { hRowMm: 0.08, wTargetMm: 0.08, cliffChordMm: 0.08, seamMode: 'cliff' });
    const { ut, idx } = build.mesh; const nF = idx.length / 3;
    const true3d = perFaceTrue3DSag(ut, idx, rA, H);
    // worst-K facets BY GN true-3D
    const order: number[] = []; for (let f = 0; f < nF; f++) if (true3d.faceErr[f] > 0.1) order.push(f);
    order.sort((a, b) => true3d.faceErr[b] - true3d.faceErr[a]);
    const K = Math.min(300, order.length);
    const lift = (i: number): [number, number, number] => { const th = TAU * ut[2 * i], z = ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const cN = { nTheta: 2048, nZ: 400 }, fN = { nTheta: 8192, nZ: 1600 };
    const gnV: number[] = [], trV: number[] = []; let stayRed = 0;
    for (let k = 0; k < K; k++) {
      const f = order[k];
      const [ax, ay, az] = lift(idx[3 * f]), [bx, by, bz] = lift(idx[3 * f + 1]), [cx2, cy2, cz2] = lift(idx[3 * f + 2]);
      const cx = (ax + bx + cx2) / 3, cy = (ay + by + cy2) / 3, cz = (az + bz + cz2) / 3;
      const gn = true3d.faceErr[f];
      let tf = Math.min(gn, bruteNearestOnRadialSurface(cx, cy, cz, rA, H, cN).dist);
      tf = Math.min(tf, bruteNearestOnRadialSurface(cx, cy, cz, rA, H, fN).dist); // always fine-confirm the GN-reddest
      gnV.push(gn); trV.push(tf); if (tf > 0.1) stayRed++;
    }
    const p99 = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0; };
    const row = {
      style: 'BasketWeave', tag: 'V_BW_sq08_gnRed', nOver10: order.length, anchoredK: K,
      gnRedP99: +p99(gnV).toFixed(4), gnRedMax: +Math.max(...gnV, 0).toFixed(4),
      trustedRedP99: +p99(trV).toFixed(4), trustedRedMax: +Math.max(...trV, 0).toFixed(4), stayRed,
    };
    const TerV = trV.sort((x, y) => x - y);
    console.log(`V_BW_sq08_gnRed nOver0.1=${order.length} anchoredK=${K} gnRedMax=${row.gnRedMax} trustedRedP99=${row.trustedRedP99} trustedRedMax=${row.trustedRedMax} stayRed(>0.1)=${stayRed} trustedMin=${TerV[0]?.toFixed(4)}`);
    mkdirSync(OUT, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n');
    expect(existsSync(NDJSON)).toBe(true);
  }, 60 * 60 * 1000);
});
