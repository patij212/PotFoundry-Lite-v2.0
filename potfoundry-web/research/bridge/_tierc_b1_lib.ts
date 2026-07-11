// _tierc_b1_lib.ts — DEV-ONLY (research/, never imported by src/).
//
// E-2026-07-11-TIERC-HEADTOHEAD, Arm B1 (DS full outer wall: 7 R-STRUCT ring bands + 8 R-CDT body
// bands). Small helper lib for the B1 probe (_tierc_armB1.test.ts): raw bin dump/load (mirrors
// labkit's dumpRenderBins/loadBinMesh convention, kept local since this dumps a THIRD array
// (nothing new in shape, just avoiding a labkit edit per shared-file discipline), a by-index
// boundary-edge rim-vs-interior classifier (topologyMetric/nonManRawBigStats give COUNTS only, not
// per-edge z — this file adds the z-classification on top, reusing nothing that already exists),
// and a CORRECTED fallback chain builder that fixes a domain-overlap bug found in
// tierc_manifest.ts's dragonScalesAnatomy (see doc comment on buildDsChainCorrected below) by
// composing B0's OWN proven primitives (_tierc_b0_toy_lib.ts) with non-overlapping z-domains,
// exactly mirroring tierc_regionLayer.ts's buildStructCdtChain/mergeAdoptedChain logic (both pure
// functions, safely reproduced here rather than imported, since importing an unexported
// module-private function is not possible and editing the committed file is out of scope).
//
// DEV-ONLY. src/ never imports this. Read-only imports only; no committed research/bridge file
// is edited to produce this module.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { AnalyticRadiusFn } from './labkit';
import {
  buildK1ZBand, adoptedThetas, buildRingBandRows, K1_TOY_DEFAULTS, type K1Region,
} from './_tierc_b0_toy_lib';
import { buildStructuredWall, type BuiltMesh } from './_sharp3dMesh';
import { dragonRings } from './_ds_prodtruth_lib';

export const B1_OUT_DIR = join('research', 'exchange', '_tierc_b1');

// ─────────────────────────────────────── bin dump/load (xyz f32 + idx u32, raw) ───────────────────────────────────────

export function dumpB1Bin(name: string, xyz: Float32Array | Float64Array, idx: Uint32Array): void {
  const { mkdirSync } = require('node:fs') as typeof import('node:fs');
  mkdirSync(B1_OUT_DIR, { recursive: true });
  const xyzF32 = xyz instanceof Float32Array ? xyz : Float32Array.from(xyz);
  writeFileSync(join(B1_OUT_DIR, `${name}.xyz.bin`), Buffer.from(xyzF32.buffer, xyzF32.byteOffset, xyzF32.byteLength));
  writeFileSync(join(B1_OUT_DIR, `${name}.idx.bin`), Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
}

export function loadB1Bin(name: string): { xyz: Float32Array; idx: Uint32Array } {
  const xb = readFileSync(join(B1_OUT_DIR, `${name}.xyz.bin`));
  const ib = readFileSync(join(B1_OUT_DIR, `${name}.idx.bin`));
  const xyz = new Float32Array(xb.buffer, xb.byteOffset, xb.byteLength / 4);
  const idx = new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4);
  return { xyz, idx };
}

export function b1BinExists(name: string): boolean {
  return existsSync(join(B1_OUT_DIR, `${name}.xyz.bin`)) && existsSync(join(B1_OUT_DIR, `${name}.idx.bin`));
}

// ─────────────────────────────────────── boundary-edge rim-vs-interior classifier ───────────────────────────────────────

/**
 * Raw-INDEX (no weld) boundary-edge scan, sorted-key run-length (mirrors src/fidelity/metrics.ts's
 * topologyMetric packed-key technique — 2^27 multiplier requiring lo<2^26 — rather than a Map, so
 * this stays exact and uncapped at any triangle count this arm could plausibly build). Classifies
 * each multiplicity-1 (boundary) edge as 'rim' (both endpoints within rimEpsMm of z=0 or z=H — the
 * champion mesh's OWN designed open top/bottom, ds-spec §1.3's bd=4800) or 'interior' (a genuine
 * hole — the defect class this arm is checking for).
 */
export function boundaryRimVsInterior(
  xyz: Float32Array | Float64Array, idx: Uint32Array, H: number, rimEpsMm = 0.05,
): { rim: number; interior: number; interiorSamples: Array<{ a: number; b: number; za: number; zb: number }> } {
  const nT = idx.length / 3;
  const keys = new Float64Array(nT * 3);
  let m = 0;
  for (let t = 0; t < nT; t++) {
    const v0 = idx[3 * t], v1 = idx[3 * t + 1], v2 = idx[3 * t + 2];
    const pairs: Array<[number, number]> = [[v0, v1], [v1, v2], [v2, v0]];
    for (const [a, b] of pairs) {
      const lo = a < b ? a : b, hi = a < b ? b : a;
      keys[m++] = lo * 134217728 + hi;
    }
  }
  const K = keys.subarray(0, m).slice();
  K.sort();
  let rim = 0, interior = 0;
  const interiorSamples: Array<{ a: number; b: number; za: number; zb: number }> = [];
  let i = 0;
  const isRimZ = (z: number): boolean => Math.abs(z) <= rimEpsMm || Math.abs(z - H) <= rimEpsMm;
  while (i < m) {
    let j = i + 1;
    while (j < m && K[j] === K[i]) j++;
    if (j - i === 1) {
      const key = K[i];
      const lo = Math.floor(key / 134217728);
      const hi = key - lo * 134217728;
      const za = xyz[lo * 3 + 2], zb = xyz[hi * 3 + 2];
      if (isRimZ(za) && isRimZ(zb)) rim++;
      else {
        interior++;
        if (interiorSamples.length < 25) interiorSamples.push({ a: lo, b: hi, za, zb });
      }
    }
    i = j;
  }
  return { rim, interior, interiorSamples };
}

// ─────────────────────────────────────── CORRECTED fallback chain builder ───────────────────────────────────────

/**
 * FINDING (see B1 verdict for the full writeup): tierc_manifest.ts's `dragonScalesAnatomy` gives
 * each R-CDT body region a domain that runs from ring-z to ring-z (e.g. body-0 = [0,15], body-1 =
 * [15,30], ... — `boundaries[i]` is the RAW ring z, never offset by the ring's own half-band), while
 * each R-STRUCT ring region's domain is `[ringZ-0.6, ringZ+0.6]` (DS_RING_HALF_BAND_MM). Those two
 * domains OVERLAP by 0.6mm on each side of every ring (body-0's [0,15] and ring-0's [14.4,15.6]
 * share [14.4,15]) — unlike B0's OWN toy, whose K1 bands stop EXACTLY at the ring band's own
 * seamLo/seamHi ([50,57]/[57,63]/[63,70], zero overlap). The consequence, generalizing B0's proven
 * per-seam mechanism: `buildK1ZBand`'s own quadtree independently meshes the WHOLE overlap band
 * (each body region's own adaptive mesh runs all the way to its own zHi=ring z, including through
 * the [ringZ-0.6,ringZ] sub-range), while `buildRingBandRows`' own 2-sheet-rows-each-side (borrowed
 * verbatim from the B0 toy, which had a clean non-overlapping domain to work with) ALSO covers that
 * same sub-range with its OWN, differently-discretized vertices. The result is not a classic
 * shared-edge non-manifold defect (the two patches don't share edges outside the true adopted seam,
 * so `nonManRawBig` stays blind to it) but a genuine DOUBLED/self-intersecting shell in a thin band
 * around every ring — real wasted geometry, and (because the ring band's row-0/row-N vertices get
 * REMAPPED onto the K1 region's own boundary ring by adoption, while its intervening "own" sheet
 * rows keep their ORIGINAL nominal z) a non-monotonic z sequence along the ring band's own row list.
 *
 * This function is the FALLBACK: compose the SAME B0-proven primitives with CORRECTED,
 * non-overlapping domains — body-i spans [ring(i-1).z+halfBand, ring(i).z-halfBand] (or [0,...]/
 * [...,H] at the ends), ring-i spans exactly [ring(i).z-halfBand, ring(i).z+halfBand] — zero overlap,
 * matching B0's own tested (if narrower) configuration. Merge logic is copied verbatim from
 * tierc_regionLayer.ts's `mergeAdoptedChain` (a pure function; reproduced here rather than imported
 * since that symbol is not exported and editing the committed file is out of scope for this arm).
 */
export interface DsChainOpts {
  nRing?: number;
  nThetaRing?: number;
  treadCap?: number;
  halfBandMm?: number;
  resU?: number;
  resT?: number;
  maxSagMm?: number;
  maxEdgeMm?: number;
  minEdgeMm?: number;
  gradeRatio?: number;
  maxLevel?: number;
}

export function buildDsChainCorrected(
  rA: AnalyticRadiusFn, H: number, opts: DsChainOpts = {},
): {
  xyz: Float64Array; idx: Uint32Array;
  bodies: K1Region[]; rings: BuiltMesh[];
  bodyBoundaries: number[]; ringBoundaries: Array<[number, number]>;
} {
  const halfBand = opts.halfBandMm ?? 0.6;
  const nRing = opts.nRing ?? 512;
  const nThetaRing = opts.nThetaRing ?? 2400;
  const treadCap = opts.treadCap ?? 4;
  const dr = dragonRings(8);
  const ringZs = dr.map((r) => r.z);

  const bodyBoundaries: number[] = [0];
  const ringBoundaries: Array<[number, number]> = [];
  for (const z of ringZs) {
    bodyBoundaries.push(z - halfBand);
    ringBoundaries.push([z - halfBand, z + halfBand]);
    bodyBoundaries.push(z + halfBand);
  }
  bodyBoundaries.push(H);
  // bodyBoundaries now: [0, r0-hb, r0+hb, r1-hb, r1+hb, ..., r6+hb, H] — 18 entries -> pair up (0,1),(2,3),...
  const bodySpans: Array<[number, number]> = [];
  for (let i = 0; i < bodyBoundaries.length; i += 2) bodySpans.push([bodyBoundaries[i], bodyBoundaries[i + 1]]);

  const bodies: K1Region[] = bodySpans.map(([zLo, zHi]) =>
    buildK1ZBand(rA, zLo, zHi, {
      nRing,
      maxSagMm: opts.maxSagMm ?? K1_TOY_DEFAULTS.maxSagMm,
      maxEdgeMm: opts.maxEdgeMm ?? K1_TOY_DEFAULTS.maxEdgeMm,
      minEdgeMm: opts.minEdgeMm ?? K1_TOY_DEFAULTS.minEdgeMm,
      gradeRatio: opts.gradeRatio ?? K1_TOY_DEFAULTS.gradeRatio,
      maxLevel: opts.maxLevel ?? K1_TOY_DEFAULTS.maxLevel,
      resU: opts.resU ?? K1_TOY_DEFAULTS.resU,
      resT: opts.resT ?? K1_TOY_DEFAULTS.resT,
    }),
  );

  const rings: BuiltMesh[] = ringBoundaries.map(([seamLo, seamHi], i) => {
    const lower = bodies[i];
    const upper = bodies[i + 1];
    const lowerAdopted = adoptedThetas(lower, lower.result.topRing);
    const upperAdopted = adoptedThetas(upper, upper.result.bottomRing);
    const ringZ = ringZs[i];
    const rows = buildRingBandRows(rA, ringZ, seamLo, seamHi, lowerAdopted, upperAdopted, { nThetaRing, treadCap });
    return buildStructuredWall(rA, H, rows);
  });

  // ── merge (verbatim port of tierc_regionLayer.ts's mergeAdoptedChain — see file header) ──
  const n = bodies.length;
  const bodyOffset: number[] = new Array(n);
  let total = 0;
  for (let i = 0; i < n; i++) { bodyOffset[i] = total; total += bodies[i].result.gridVertexCount; }
  const ringOffset: number[] = new Array(rings.length);
  const ringLowerN: number[] = new Array(rings.length);
  const ringUpperN: number[] = new Array(rings.length);
  for (let i = 0; i < rings.length; i++) {
    const lowerN = bodies[i].result.topRing.length;
    const upperN = bodies[i + 1].result.bottomRing.length;
    ringLowerN[i] = lowerN; ringUpperN[i] = upperN;
    ringOffset[i] = total;
    total += rings[i].nV - lowerN - upperN;
  }

  const xyz = new Float64Array(total * 3);
  for (let i = 0; i < n; i++) {
    const b = bodies[i]; const base = bodyOffset[i];
    for (let v = 0; v < b.result.gridVertexCount; v++) {
      const [x, y, z] = b.sampler.position(b.result.vertices[v * 3], b.result.vertices[v * 3 + 1]);
      const o = base + v;
      xyz[3 * o] = x; xyz[3 * o + 1] = y; xyz[3 * o + 2] = z;
    }
  }
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i]; const lowerN = ringLowerN[i]; const upperN = ringUpperN[i]; const base = ringOffset[i];
    for (let v = lowerN; v < ring.nV - upperN; v++) {
      const o = base + (v - lowerN);
      xyz[3 * o] = ring.xyz[3 * v]; xyz[3 * o + 1] = ring.xyz[3 * v + 1]; xyz[3 * o + 2] = ring.xyz[3 * v + 2];
    }
  }
  const remapRing = (i: number, v: number): number => {
    const ring = rings[i]; const lowerN = ringLowerN[i]; const upperN = ringUpperN[i];
    if (v < lowerN) return bodyOffset[i] + bodies[i].result.topRing[v];
    if (v >= ring.nV - upperN) return bodyOffset[i + 1] + bodies[i + 1].result.bottomRing[v - (ring.nV - upperN)];
    return ringOffset[i] + (v - lowerN);
  };
  let idxTotalLen = 0;
  for (let i = 0; i < n; i++) idxTotalLen += bodies[i].result.indices.length;
  for (let i = 0; i < rings.length; i++) idxTotalLen += rings[i].idx.length;
  const idx = new Uint32Array(idxTotalLen);
  let w = 0;
  for (let i = 0; i < n; i++) {
    const b = bodies[i]; const off = bodyOffset[i];
    for (let k = 0; k < b.result.indices.length; k++) idx[w++] = off + b.result.indices[k];
  }
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    for (let k = 0; k < ring.idx.length; k++) idx[w++] = remapRing(i, ring.idx[k]);
  }
  return { xyz, idx, bodies, rings, bodyBoundaries, ringBoundaries };
}
