// _tierc_b0_toy_lib.ts — DEV-ONLY (research/, never imported by src/).
//
// E-2026-07-11-TIERC-HEADTOHEAD, Arm B0 (boundary-contract toy). Answers the load-bearing DS
// unknown pre-registered in E-2026-07-11-TIERC-HEADTOHEAD-prereg.md ("Arm B / B0") and named in
// architecture-v1.md SS2 "The known hard case — R-STRUCT<->R-CDT adoption (DS)": can a K3
// structured ring band (doubled ringBelow/ringAbove rows, evenThetas chains) share its boundary
// with a K1 quadtree region by an explicit OWNED/ADOPTED vertex chain — watertight (raw-index,
// non-vacuous) and T-junction-free — at the pinned DragonScales dims (H120/Rt50/Rb40/expn1)?
//
// ONE-RING TOY (per the task design): a structured ring band spans z in [SEAM_LO,SEAM_HI] =
// [57,63] around the k=4 DragonScales ring at z=60 (t=0.5); two PRODUCTION K1 regions
// (`buildConformingWall`, completely unmodified) cover narrow smooth z-bands on either side —
// [50,57] and [63,70] — deliberately NARROWED off the champion's full [0,H] span so the toy
// isolates the ONE seam under test instead of also re-discovering the ALREADY-KNOWN production
// over-refinement pathology at DS's OTHER 6 rings (ds-spec Β§1.4) inside the same K1 domain; a
// real B1 body-region would need to chop the K1 domain the same way (or feed it curvature-floor
// exemptions) for exactly this reason.
//
// CONTRACT under test: K1 already emits a well-known, production-proven boundary chain whenever
// `nRing` is set — `ConformingWallResult.bottomRing`/`topRing`, EXACTLY the mechanism
// `WatertightAssembly.ts` already relies on for cap/inner-wall seam-sharing elsewhere in
// production. `ConformingWall.ts` has ZERO awareness of "outer wall vs region" — it pins t=0/t=1
// for ANY `SurfaceSampler`, so a K1 build over an arbitrary z-sub-band terminates on the SAME
// nRing-pinned chain a full-height wall would. This file's `mergeAdoptedAssembly` makes the ring
// band's outermost rows literally REUSE those exact vertex indices (adoption, contract (c)) —
// offset into a combined raw-index buffer, not a position-weld — so `nonManRawBig` (labkit, no
// position tolerance) is a faithful, non-vacuous watertight witness. Because `nRing` MUST be a
// power of two (`buildConformingWall`'s own guard) while the ring band's own interior nTheta is a
// free choice (the champion's own recipe uses 2400, not a power of two), the two seam rows
// generally have DIFFERENT counts — `buildStructuredWall`'s EXISTING dispatch (equal-count
// diagonal-flip vs the general periodic merge-strip, `_sharp3dMesh.ts:96-116`) already handles
// that mismatch with NO new triangulation code, which is exactly contract (a)'s "conservative
// stitch strip" (this file exercises both counts-matched and counts-mismatched configurations
// through the identical adoption code path — see `runB0Config`'s `nThetaRing` parameter).
//
// DEV-ONLY. src/ is NEVER imported by. Read-only imports of production K1 kernel code
// (ConformingWall/SurfaceSampler) and the canonical DS truth (_ds_prodtruth_lib.ts, per
// champion-spec-dragonscales.md Β§2.2's provenance note) — no src/ edits, no edits to any shared
// research/bridge file (new-file-first per the prereg's shared-file discipline).
import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalyticRadiusFn } from './labkit';
import { nonManRawBig, nonManRawBigStats, triangleQualityDistribution } from './labkit';
import { dsRadiusFn, DIMS as DS_DIMS, H as DS_H, dragonRings } from './_ds_prodtruth_lib';
import { buildStructuredWall, evenThetas, type RowSpec, type BuiltMesh } from './_sharp3dMesh';
import {
  buildConformingWall,
  type ConformingWallOptions,
  type ConformingWallResult,
} from '../../src/renderers/webgpu/parametric/conforming/ConformingWall';
import type { SurfaceSampler, Vec3 } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { computeUBias } from '../../src/renderers/webgpu/parametric/conforming/WatertightAssembly';

const TAU = 2 * Math.PI;

// ─────────────────────────────────────── pinned dims + the one ring under test ───────────────────────────────────────
export const H = DS_H; // 120
export { DS_DIMS as DIMS };

const RING_K4 = dragonRings().find((r) => Math.abs(r.t - 0.5) < 1e-9);
if (!RING_K4) throw new Error('_tierc_b0_toy_lib: expected a k=4 (t=0.5) DragonScales ring at the pinned dims');
/** The single ring under test: k=4 of 8, z=60mm at H=120 (dragonRings() canonical, Β§2.2). */
export const RING_Z = RING_K4.z;
/** Doubled-ring offset — identical convention to the champion recipe (ds-spec Β§2.3). */
export const Z_EPS = 5e-4;

/** R-STRUCT ring band z-span (3mm each side of the ring — comfortably outside the champion's own 0.6mm exclusion band). */
export const SEAM_LO = 57;
export const SEAM_HI = 63;
/** K1 z-band spans — NARROWED to smooth territory immediately either side of the seam (see file header). */
export const K1_LOWER_ZLO = 50;
export const K1_LOWER_ZHI = SEAM_LO;
export const K1_UPPER_ZLO = SEAM_HI;
export const K1_UPPER_ZHI = 70;

export function dsRA(): AnalyticRadiusFn {
  return dsRadiusFn();
}

// ─────────────────────────────────────── K1 z-band sampler + region builder ───────────────────────────────────────

/** Maps local (u,t)in[0,1)x[0,1] to (theta=TAU*u, z=lerp(zLo,zHi,t)) via the REAL DS radius fn — the ONLY thing a
 *  region needs to hand `buildConformingWall`; the production kernel is otherwise untouched. */
export function makeZBandSampler(rA: AnalyticRadiusFn, zLo: number, zHi: number): SurfaceSampler {
  return {
    position(u: number, t: number): Vec3 {
      const tc = t < 0 ? 0 : t > 1 ? 1 : t;
      const theta = TAU * u;
      const z = zLo + tc * (zHi - zLo);
      const r = rA(theta, z);
      return [r * Math.cos(theta), r * Math.sin(theta), z];
    },
  };
}

export interface K1ZBandOpts {
  nRing: number;
  maxSagMm?: number;
  maxEdgeMm?: number;
  minEdgeMm?: number;
  gradeRatio?: number;
  maxLevel?: number;
  resU?: number;
  resT?: number;
}

/** Loose-but-real toy defaults: this toy tests the SEAM mechanism, not sheet fidelity, so
 *  maxSagMm is deliberately looser than the project's 0.01mm export standard (avoids wasting the
 *  run chasing DS's designed bump relief, a already-characterized, separate problem — ds-spec Β§4.6). */
export const K1_TOY_DEFAULTS: Required<Omit<K1ZBandOpts, 'nRing'>> = {
  maxSagMm: 0.05,
  maxEdgeMm: 3,
  minEdgeMm: 0.15,
  gradeRatio: 2,
  maxLevel: 10,
  resU: 128,
  resT: 24,
};

export interface K1Region {
  result: ConformingWallResult;
  sampler: SurfaceSampler;
  zLo: number;
  zHi: number;
  nRing: number;
  uBias: number;
  buildMs: number;
}

/**
 * Build ONE K1 z-band region via the UNMODIFIED production kernel (`buildConformingWall`).
 * `uBias` is computed via the SAME `computeUBias` production uses for every real wall (imported
 * read-only from WatertightAssembly.ts, not re-derived) — this toy's narrow 7mm z-bands against a
 * ~283mm circumference are an EXTREME wide/flat aspect ratio (wideFlat ~=40, Gate A threshold
 * ~4.24), so omitting this would leave the quadtree isotropic and manufacture thin near-boundary
 * slivers unrelated to the seam mechanism under test — computing it here is production parity,
 * not a new lever. `buildConformingWall` keeps the SHARED ring at exactly `nRing` regardless of
 * uBias (pinBoundaryLevel = log2(nRing) - uBias, ConformingWall.ts:779-786), so this cannot change
 * the adopted chain's vertex COUNT — only the interior cell shaping.
 */
export function buildK1ZBand(rA: AnalyticRadiusFn, zLo: number, zHi: number, opts: K1ZBandOpts): K1Region {
  const sampler = makeZBandSampler(rA, zLo, zHi);
  const merged = { ...K1_TOY_DEFAULTS, ...opts };
  const uBias = computeUBias(sampler, false);
  const wallOpts: ConformingWallOptions = {
    maxSagMm: merged.maxSagMm,
    maxEdgeMm: merged.maxEdgeMm,
    minEdgeMm: merged.minEdgeMm,
    gradeRatio: merged.gradeRatio,
    maxLevel: merged.maxLevel,
    resU: merged.resU,
    resT: merged.resT,
    nRing: opts.nRing,
    surfaceId: 0,
    uBias,
  };
  const t0 = Date.now();
  const result = buildConformingWall(sampler, wallOpts);
  return { result, sampler, zLo, zHi, nRing: opts.nRing, uBias, buildMs: Date.now() - t0 };
}

/** u-ascending theta array for a K1 region's boundary ring, read DIRECTLY off its own emitted
 *  vertex data (ADOPTION, not re-derivation) — `ring` is `topRing` or `bottomRing`, already
 *  U-ascending per `ConformingWallResult`'s own contract. */
export function adoptedThetas(region: K1Region, ring: number[]): Float64Array {
  const out = new Float64Array(ring.length);
  for (let i = 0; i < ring.length; i++) {
    const u = region.result.vertices[ring[i] * 3];
    out[i] = TAU * u;
  }
  return out;
}

// ─────────────────────────────────────── R-STRUCT ring band (buildRows/buildStructuredWall pattern) ───────────────────────────────────────

export interface RingBandOpts {
  /** The ring band's OWN interior theta count — free choice (the champion recipe uses 2400). */
  nThetaRing: number;
  treadCap?: number;
  sheetRowsEachSide?: number;
}

/**
 * Row schedule for the one-ring toy: adopted-lower boundary row -> a couple of sheet rows ->
 * ringBelow -> tread sub-rows -> ringAbove -> a couple of sheet rows -> adopted-upper boundary
 * row. Verbatim champion recipe (treadSub span-adaptive formula, zEps convention) per
 * `_pf_dszdensity.test.ts:66-84` / ds-spec Β§2.3, restricted to ONE ring and a bounded z-span, with
 * the two OUTERMOST rows' thetas coming from the adopted K1 chains instead of `evenThetas`.
 */
export function buildRingBandRows(
  rA: AnalyticRadiusFn,
  ringZ: number,
  seamLo: number,
  seamHi: number,
  lowerAdoptedTheta: Float64Array,
  upperAdoptedTheta: Float64Array,
  opts: RingBandOpts,
): RowSpec[] {
  const nTh = opts.nThetaRing;
  const treadCap = opts.treadCap ?? 4;
  const nSheet = opts.sheetRowsEachSide ?? 2;
  const zEps = Z_EPS;
  const rows: RowSpec[] = [];

  rows.push({ z: seamLo, rz: seamLo, thetas: lowerAdoptedTheta, kind: 'sheet' });
  for (let i = 1; i <= nSheet; i++) {
    const z = seamLo + (ringZ - zEps - seamLo) * (i / (nSheet + 1));
    rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' });
  }

  const rzIn = ringZ - zEps;
  const rzOut = ringZ + zEps;
  const rIn = rA(0, rzIn);
  const rOut = rA(0, rzOut);
  const span = Math.abs(rOut - rIn);
  const rMean = 0.5 * (rIn + rOut);
  const arc = (TAU * rMean) / nTh;
  const treadSub = Math.max(2, Math.min(treadCap, Math.round(span / Math.max(arc, 1e-4)) + 1));
  rows.push({ z: ringZ, rz: rzIn, thetas: evenThetas(nTh), kind: 'ringBelow' });
  for (let s = 1; s < treadSub; s++) {
    rows.push({
      z: ringZ, rz: ringZ, thetas: evenThetas(nTh), kind: 'tread',
      treadBlend: { s: s / treadSub, rzInner: rzIn, rzOuter: rzOut },
    });
  }
  rows.push({ z: ringZ, rz: rzOut, thetas: evenThetas(nTh), kind: 'ringAbove' });

  for (let i = 1; i <= nSheet; i++) {
    const z = rzOut + (seamHi - rzOut) * (i / (nSheet + 1));
    rows.push({ z, rz: z, thetas: evenThetas(nTh), kind: 'sheet' });
  }
  rows.push({ z: seamHi, rz: seamHi, thetas: upperAdoptedTheta, kind: 'sheet' });

  return rows;
}

// ─────────────────────────────────────── explicit RAW-INDEX assembly (adoption, not position-weld) ───────────────────────────────────────

export interface AssembledToy {
  xyz: Float64Array;
  idx: Uint32Array;
  counts: { lowerN: number; upperN: number; ringOwnN: number; totalV: number; totalF: number };
  /** combined-buffer indices, u-ascending, for the two adopted seams. */
  seamLo: Uint32Array;
  seamHi: Uint32Array;
  /** the toy's own intentionally-open far ends (bottom of lower / top of upper) — informational, mirrors the
   *  champion mesh's own open top/bottom (ds-spec Β§1.3's bd=4800). */
  farLo: Uint32Array;
  farHi: Uint32Array;
}

/** The ADOPTED (contract) assembly: the ring band's row-0/row-N vertices are LITERALLY the K1
 *  regions' own topRing/bottomRing indices (offset into the combined buffer) — no new vertices
 *  allocated for the seam, no position-weld anywhere. */
export function mergeAdoptedAssembly(lower: K1Region, upper: K1Region, ring: BuiltMesh): AssembledToy {
  const lowerN = lower.result.gridVertexCount;
  const upperN = upper.result.gridVertexCount;
  const nRingLo = lower.result.topRing.length;
  const nRingHi = upper.result.bottomRing.length;
  const ringTotal = ring.nV;
  const ringOwnN = ringTotal - nRingLo - nRingHi;
  const totalV = lowerN + upperN + ringOwnN;
  const upperOff = lowerN;
  const ringOff = lowerN + upperN;

  const xyz = new Float64Array(totalV * 3);
  for (let i = 0; i < lowerN; i++) {
    const [x, y, z] = lower.sampler.position(lower.result.vertices[i * 3], lower.result.vertices[i * 3 + 1]);
    xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z;
  }
  for (let i = 0; i < upperN; i++) {
    const [x, y, z] = upper.sampler.position(upper.result.vertices[i * 3], upper.result.vertices[i * 3 + 1]);
    const o = upperOff + i;
    xyz[3 * o] = x; xyz[3 * o + 1] = y; xyz[3 * o + 2] = z;
  }
  for (let v = nRingLo; v < ringTotal - nRingHi; v++) {
    const o = ringOff + (v - nRingLo);
    xyz[3 * o] = ring.xyz[3 * v]; xyz[3 * o + 1] = ring.xyz[3 * v + 1]; xyz[3 * o + 2] = ring.xyz[3 * v + 2];
  }

  const remap = (v: number): number => {
    if (v < nRingLo) return lower.result.topRing[v];
    if (v >= ringTotal - nRingHi) return upperOff + upper.result.bottomRing[v - (ringTotal - nRingHi)];
    return ringOff + (v - nRingLo);
  };

  const idx = new Uint32Array(lower.result.indices.length + upper.result.indices.length + ring.idx.length);
  let w = 0;
  for (let i = 0; i < lower.result.indices.length; i++) idx[w++] = lower.result.indices[i];
  for (let i = 0; i < upper.result.indices.length; i++) idx[w++] = upperOff + upper.result.indices[i];
  for (let i = 0; i < ring.idx.length; i++) idx[w++] = remap(ring.idx[i]);

  return {
    xyz, idx,
    counts: { lowerN, upperN, ringOwnN, totalV, totalF: idx.length / 3 },
    seamLo: Uint32Array.from(lower.result.topRing),
    seamHi: Uint32Array.from(Array.from(upper.result.bottomRing, (v) => upperOff + v)),
    farLo: Uint32Array.from(lower.result.bottomRing),
    farHi: Uint32Array.from(Array.from(upper.result.topRing, (v) => upperOff + v)),
  };
}

/** The NON-ADOPTED comparison: the ring band's row-0/row-N vertices are its OWN independent
 *  copies (same theta/xyz values, but NOT the K1 regions' indices) — simulates "position-
 *  coincident but not index-shared", the naive-stitch failure mode. Used ONLY as a non-vacuous
 *  contrast for gate 1 (see `research/lab/tierc/B0-boundary-contract-verdict.md`). */
export function mergeUngluedAssembly(lower: K1Region, upper: K1Region, ring: BuiltMesh): AssembledToy {
  const lowerN = lower.result.gridVertexCount;
  const upperN = upper.result.gridVertexCount;
  const upperOff = lowerN;
  const ringOff = lowerN + upperN;
  const totalV = lowerN + upperN + ring.nV;

  const xyz = new Float64Array(totalV * 3);
  for (let i = 0; i < lowerN; i++) {
    const [x, y, z] = lower.sampler.position(lower.result.vertices[i * 3], lower.result.vertices[i * 3 + 1]);
    xyz[3 * i] = x; xyz[3 * i + 1] = y; xyz[3 * i + 2] = z;
  }
  for (let i = 0; i < upperN; i++) {
    const [x, y, z] = upper.sampler.position(upper.result.vertices[i * 3], upper.result.vertices[i * 3 + 1]);
    const o = upperOff + i;
    xyz[3 * o] = x; xyz[3 * o + 1] = y; xyz[3 * o + 2] = z;
  }
  for (let v = 0; v < ring.nV; v++) {
    const o = ringOff + v;
    xyz[3 * o] = ring.xyz[3 * v]; xyz[3 * o + 1] = ring.xyz[3 * v + 1]; xyz[3 * o + 2] = ring.xyz[3 * v + 2];
  }
  const idx = new Uint32Array(lower.result.indices.length + upper.result.indices.length + ring.idx.length);
  let w = 0;
  for (let i = 0; i < lower.result.indices.length; i++) idx[w++] = lower.result.indices[i];
  for (let i = 0; i < upper.result.indices.length; i++) idx[w++] = upperOff + upper.result.indices[i];
  for (let i = 0; i < ring.idx.length; i++) idx[w++] = ringOff + ring.idx[i];

  return {
    xyz, idx,
    counts: { lowerN, upperN, ringOwnN: ring.nV, totalV, totalF: idx.length / 3 },
    seamLo: Uint32Array.from(lower.result.topRing),
    seamHi: Uint32Array.from(Array.from(upper.result.bottomRing, (v) => upperOff + v)),
    farLo: Uint32Array.from(lower.result.bottomRing),
    farHi: Uint32Array.from(Array.from(upper.result.topRing, (v) => upperOff + v)),
  };
}

// ─────────────────────────────────────── gate 1: watertight, non-vacuous ───────────────────────────────────────

/** Duplicate the first triangle (any interior triangle works) — makes each of its 3 edges'
 *  multiplicity go from 2 to 3, a KNOWN non-manifold defect. The non-vacuous control for gate 1. */
export function injectDuplicateTriangle(idx: Uint32Array): Uint32Array {
  const out = new Uint32Array(idx.length + 3);
  out.set(idx);
  out[idx.length] = idx[0];
  out[idx.length + 1] = idx[1];
  out[idx.length + 2] = idx[2];
  return out;
}

// ─────────────────────────────────────── gate 2: T-junction audit ───────────────────────────────────────

function segPtDist3D(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
): number {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L2 = dx * dx + dy * dy + dz * dz || 1;
  let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2;
  tt = Math.max(0, Math.min(1, tt));
  return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy), pz - (az + tt * dz));
}

export interface SeamTJunctionResult {
  seamZ: number;
  nAdopted: number;
  verticesAtSeamZ: number;
  extraVertices: number;
  tJunctions: number;
  ok: boolean;
}

/**
 * ZERO-T-junction audit for one seam ring: every combined-mesh vertex whose z sits within
 * `zQuantMm` of `seamZ` MUST be a member of the adopted chain (no strays). Because the seam edges
 * are horizontal (constant z), ANY point lying ON one of them (including a T-junction straddler)
 * necessarily shares that exact z — so a stray-free scan already proves zero T-junctions; any
 * stray found is additionally checked for lying strictly inside a seam EDGE segment (the literal
 * T-junction test), quantized per the pre-registered 1e-6mm.
 */
export function auditSeamTJunctions(
  xyz: Float64Array, adoptedChain: Uint32Array, seamZ: number, zQuantMm = 1e-6,
): SeamTJunctionResult {
  const n = xyz.length / 3;
  const adoptedSet = new Set<number>(adoptedChain);
  const atSeam: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.abs(xyz[3 * i + 2] - seamZ) <= zQuantMm) atSeam.push(i);
  }
  const extra = atSeam.filter((i) => !adoptedSet.has(i));
  const m = adoptedChain.length;
  let tJ = 0;
  const ON_EDGE_MM = 1e-6;
  for (const v of extra) {
    const px = xyz[3 * v], py = xyz[3 * v + 1], pz = xyz[3 * v + 2];
    for (let k = 0; k < m; k++) {
      const a = adoptedChain[k], b = adoptedChain[(k + 1) % m];
      const d = segPtDist3D(
        px, py, pz,
        xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2],
        xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2],
      );
      if (d <= ON_EDGE_MM) { tJ++; break; }
    }
  }
  return { seamZ, nAdopted: m, verticesAtSeamZ: atSeam.length, extraVertices: extra.length, tJunctions: tJ, ok: tJ === 0 };
}

// ─────────────────────────────────────── gate 3: riser serration (the champion's own metric) ───────────────────────────────────────

export interface SerrationResult { p99: number; max: number; n: number; }

/** feature-locus -> nearest-mesh-edge distance on the ringBelow/ringAbove rows. Re-derived from
 *  `_cu_dslip_serr.test.ts`'s `lipSerration` (test-file-local, not exported) — identical algorithm
 *  (4x-oversample the row, 3-neighbour window segment-distance), generalized to accept any
 *  BuiltMesh + RowSpec[] pair (the champion's own metric, ds-spec Β§1.3). */
export function ringSerration(rA: AnalyticRadiusFn, ring: BuiltMesh, rows: RowSpec[]): SerrationResult {
  const vals: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    if (rows[r].kind !== 'ringBelow' && rows[r].kind !== 'ringAbove') continue;
    const base = ring.rowStart[r];
    const n = rows[r].thetas.length;
    const rz = rows[r].rz;
    const z = rows[r].z;
    for (let s = 0; s < n * 4; s++) {
      const th = TAU * (s / (n * 4));
      const rr = rA(th, rz);
      const px = rr * Math.cos(th), py = rr * Math.sin(th), pz = z;
      const c0 = Math.floor((th / TAU) * n);
      let best = Infinity;
      for (let dc = -1; dc <= 1; dc++) {
        const c = ((c0 + dc) % n + n) % n;
        const cn = (c + 1) % n;
        const va = base + c, vb = base + cn;
        const d = segPtDist3D(
          px, py, pz,
          ring.xyz[3 * va], ring.xyz[3 * va + 1], ring.xyz[3 * va + 2],
          ring.xyz[3 * vb], ring.xyz[3 * vb + 1], ring.xyz[3 * vb + 2],
        );
        if (d < best) best = d;
      }
      vals.push(best);
    }
  }
  vals.sort((a, b) => a - b);
  return {
    p99: vals.length ? vals[Math.floor(0.99 * vals.length)] : 0,
    max: vals.length ? vals[vals.length - 1] : 0,
    n: vals.length,
  };
}

// ─────────────────────────────────────── top-level orchestration (one contract config -> all 3 gates) ───────────────────────────────────────

export interface B0RunConfig {
  key: string;
  contract: string;
  nThetaRing: number;
  ringOpts?: Partial<RingBandOpts>;
}

export interface B0RunResult {
  key: string;
  contract: string;
  nRing: number;
  uBias: number;
  nThetaRing: number;
  buildMs: { lower: number; upper: number; ringMs: number; mergeMs: number };
  tris: { lower: number; upper: number; ringOwn: number; total: number };
  gate1: {
    nonManBase: number;
    boundaryEdges: number;
    totalEdges: number;
    controlInjectedNonMan: number;
    nonVacuous: boolean;
    pass: boolean;
  };
  gate2: { lo: SeamTJunctionResult; hi: SeamTJunctionResult; pass: boolean };
  gate3: SerrationResult & { pass: boolean };
  quality: { pctBelow20: number; minAngleDeg: number };
  overallPass: boolean;
}

/** Run ONE (nRing fixed by the passed-in K1 regions, nThetaRing free) contract config end to end:
 *  build the ring band, adopt-merge, score all 3 pre-registered B0 gates. Pure function of its
 *  inputs (no fs side effects) — the TEST file owns checkpointing. */
export function runB0Config(cfg: B0RunConfig, lower: K1Region, upper: K1Region): B0RunResult {
  const rA = dsRA();
  const t0 = Date.now();
  const lowerAdopted = adoptedThetas(lower, lower.result.topRing);
  const upperAdopted = adoptedThetas(upper, upper.result.bottomRing);
  const rows = buildRingBandRows(rA, RING_Z, SEAM_LO, SEAM_HI, lowerAdopted, upperAdopted, {
    nThetaRing: cfg.nThetaRing,
    ...cfg.ringOpts,
  });
  const ring = buildStructuredWall(rA, H, rows);
  const ringMs = Date.now() - t0;

  const t1 = Date.now();
  const asm = mergeAdoptedAssembly(lower, upper, ring);
  const mergeMs = Date.now() - t1;

  const stats = nonManRawBigStats(asm.idx);
  const controlIdx = injectDuplicateTriangle(asm.idx);
  const controlNonMan = nonManRawBig(controlIdx);
  const gate1 = {
    nonManBase: stats.nonMan,
    boundaryEdges: stats.boundary,
    totalEdges: stats.edges,
    controlInjectedNonMan: controlNonMan,
    nonVacuous: controlNonMan > stats.nonMan,
    pass: stats.nonMan === 0,
  };

  const loT = auditSeamTJunctions(asm.xyz, asm.seamLo, SEAM_LO);
  const hiT = auditSeamTJunctions(asm.xyz, asm.seamHi, SEAM_HI);
  const gate2 = { lo: loT, hi: hiT, pass: loT.ok && hiT.ok };

  const ser = ringSerration(rA, ring, rows);
  const gate3 = { ...ser, pass: ser.p99 <= 0.001 };

  const q = triangleQualityDistribution({ vertices: Float32Array.from(asm.xyz), indices: asm.idx });

  return {
    key: cfg.key,
    contract: cfg.contract,
    nRing: lower.nRing,
    uBias: lower.uBias,
    nThetaRing: cfg.nThetaRing,
    buildMs: { lower: lower.buildMs, upper: upper.buildMs, ringMs, mergeMs },
    tris: {
      lower: lower.result.indices.length / 3,
      upper: upper.result.indices.length / 3,
      ringOwn: asm.counts.ringOwnN,
      total: asm.counts.totalF,
    },
    gate1,
    gate2,
    gate3,
    quality: { pctBelow20: q.pctBelow20, minAngleDeg: q.minAngleDeg },
    overallPass: gate1.pass && gate1.nonVacuous && gate2.pass && gate3.pass,
  };
}

// ─────────────────────────────────────── checkpointing (resilience — LAB-CHEATSHEET) ───────────────────────────────────────

const OUT_DIR = join('research', 'exchange', '_tierc_b0');
const NDJSON = join(OUT_DIR, 'scorecard.ndjson');

export function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}

export function checkpoint(row: Record<string, unknown>): void {
  mkdirSync(OUT_DIR, { recursive: true });
  appendFileSync(NDJSON, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(`[CP ${String(row.key)}] ${JSON.stringify(row)}`);
}

export function keyExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => {
    try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; }
  });
}

export { OUT_DIR as B0_OUT_DIR };
