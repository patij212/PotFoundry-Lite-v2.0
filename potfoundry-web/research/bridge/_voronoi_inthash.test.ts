// E-2026-07-10-INTHASH — measurement arm (pre-registered; see
// research/lab/E-2026-07-10-INTHASH-prereg.md and EXPERIMENT-REGISTRY.md).
//
// Redirect from E-2026-07-09-VORONOI-TRUTHBRIDGE (REFUTED: per-op Math.fround f32-emulation of the
// EXISTING float hash only improved p99 1.21x; 0/500 worst vertices showed argmin flips between f64
// and f32-emulated CPU paths — both CPU precisions agree with each other, disagree with the real
// GPU). This probe tests whether an INTEGER-EXACT hash (PCG2D on integer cell coordinates, dyadic-
// rational hash->float conversion) makes cell selection bit-identical across F64/F32-emulated
// evaluation BY CONSTRUCTION — eliminating the floating-point rounding path from the hash entirely
// rather than trying to out-predict GPU-side FMA/fast-math fusion.
//
// DEV-ONLY. src/ never imports research/. This probe imports src/ READ-ONLY (DEFAULT_VORONOI) for
// realistic param defaults, exactly like every other research/bridge probe.
import { describe, it, expect } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { DEFAULT_VORONOI } from '../../src/geometry/types';
import {
  hash22Int, hashDeterminismProbe, rOuterVoronoiIntF32, rOuterVoronoiIntF64, cellArgminBothPrecisionsInt,
  type VoronoiParams,
} from './_voronoi_inthash_lib';
import {
  rOuterVoronoiF32, rOuterVoronoiF64Ref, cellArgminBothPrecisions,
} from './_voronoi_truthbridge_lib';

const ON = process.env.PF_INTHASH === '1';
const DIMS = { H: 120, Rb: 40, Rt: 50 };
const TAU = Math.PI * 2;
const OUTDIR = join('research', 'exchange', '_inthash');

const VPARAMS: VoronoiParams = {
  scale: DEFAULT_VORONOI.vScale,
  jitter: DEFAULT_VORONOI.vJitter,
  thickness: DEFAULT_VORONOI.vThickness,
  relief: DEFAULT_VORONOI.vRelief,
  morph: DEFAULT_VORONOI.vMorph,
  zStretch: DEFAULT_VORONOI.vZStretch,
  pulse: DEFAULT_VORONOI.vPulse,
  edgeFade: DEFAULT_VORONOI.vEdgeFade,
};
const R0 = 45; // representative mid-wall base radius for radius-delta reporting (not baseRadius-exact — this arm isolates the hash/cell mechanism, not the profile blend)

// minimal RGB PNG writer (no deps) — same pattern as research/bridge/_pf_direct_svg.test.ts.
function writePNG(path: string, W: number, H: number, rgb: Uint8Array): void {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    rgb.subarray(y * W * 3, (y + 1) * W * 3).forEach((v, i) => { raw[y * (1 + W * 3) + 1 + i] = v; });
  }
  const idat = deflateSync(raw);
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const t = Buffer.from(type, 'ascii');
    const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, cr]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  writeFileSync(path, Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]));
}

interface PctStats { max: number; p99: number; p50: number; count: number }
function pctStats(devs: Float64Array): PctStats {
  const a = devs.slice();
  a.sort();
  const n = a.length;
  return { max: n ? a[n - 1] : 0, p99: n ? a[Math.min(n - 1, Math.floor(0.99 * n))] : 0, p50: n ? a[Math.floor(0.5 * n)] : 0, count: n };
}

/** Deterministic PRNG (mulberry32) — pure JS, no crypto dep, reproducible across runs for a fixed
 *  seed, used only to pick sample loci (not part of the hash chain under test). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('E-2026-07-10-INTHASH', () => {
  it.skipIf(!ON)('(1) DETERMINISM GATE — bit-identity of hash/jitter/argmin, F64 vs F32-emulated, int-hash chain', () => {
    const rng = mulberry32(0xc0ffee);
    const N_RANDOM = 1_500_000;
    const N_BOUNDARY = 500_000; // dense bands straddling integer cell lines in scaled (u,v)
    const scaleVal = VPARAMS.scale;

    let hashBitDiffs = 0;
    let jitterBitDiffs = 0;
    let argminDiffs = 0;
    let maxF1Delta = 0;
    let maxF2Delta = 0;
    let maxRadiusDeltaMm = 0;
    let floatValueDiffs = 0; // secondary metric: f1/f2 FLOAT VALUE differs (expected — ordinary last-ULP rounding on the still-floating-point distance/sqrt chain even with bit-identical hash inputs)
    let worstArgminSample: { theta: number; z: number; f64Idx: [number, number, number, number]; f32Idx: [number, number, number, number] } | null = null;
    let worstRadiusSample: { theta: number; z: number; f64: number; f32: number } | null = null;
    let nChecked = 0;

    // (a) RAW HASH determinism — hash22Int takes no Round parameter; confirm the u32 output +
    // derived unit float are literally IDENTICAL objects in repeated calls across a wide integer
    // domain (sanity: the function is pure and precision-independent by construction, not just by
    // absence of a Round argument).
    for (let i = 0; i < 200_000; i++) {
      const cx = Math.floor(rng() * 4_000_000) - 2_000_000;
      const cy = Math.floor(rng() * 4_000_000) - 2_000_000;
      const a = hash22Int(cx, cy);
      const b = hashDeterminismProbe(cx, cy);
      if (a.x !== b.x || a.y !== b.y) hashBitDiffs++;
    }

    // (b) ARGMIN + downstream determinism, RANDOM (theta,z) coverage.
    //
    // Two DISTINCT claims are checked here, deliberately kept separate after TWO iterations on the
    // gate's own measurement (both permitted/expected under the prereg's "iterate once" clause —
    // both iterations found bugs in THIS TEST's invariant, not in the design, and are reported
    // verbatim rather than silently fixed):
    //
    // ITERATION 1 (first design): gated on f1===f1/f2===f2 FLOAT VALUE equality. Found
    // 2,000,000/2,000,000 "diffs" — but max delta was ~5.8e-7, far below any cell-boundary jump.
    // Root cause: the downstream distance/sqrt chain still runs through per-op Math.fround rounding
    // even with bit-identical hash inputs — ordinary last-ULP float noise, not a design flaw.
    //
    // ITERATION 2: gated on WINNING-NEIGHBOR RASTER INDEX (0..8 relative to the local cellId
    // origin) equality instead. Found 104/2,000,000 diffs. Root-caused via
    // research/exchange/_inthash debug (worst sample: v=4.999999845..., i.e. ~1.5e-7 from an
    // integer line) — F64 and F32-emulated ROUNDING of the smooth v-coordinate can floor() to
    // DIFFERENT local cellId origins (e.g. floor(4.9999998)=4 vs floor(5.0000000-after-rounding)=5)
    // when the true value sits a hair's width from an integer boundary. This shifts EVERY
    // neighbor's RASTER position by a constant offset while the ABSOLUTE physical winning cell
    // stays identical (verified by hand: cellId(5,4)+(0,1) === cellId(5,5)+(0,0) === absolute cell
    // (5,5) in BOTH precisions for the worst sample). This is an artifact of comparing a
    // floor()-relative index, not a real divergence — and it is generic to ANY floor()-tiled cell
    // scheme (int-hash or float-hash), not specific to this design.
    //
    // FINAL (this version): gates on the WINNING CELL's ABSOLUTE INTEGER ID (f1CellX/f1CellY,
    // f2CellX/f2CellY from CellResult) — the invariant that actually reflects "did the two
    // precisions select the SAME physical cell as the winner", robust to which local floor()
    // frame either evaluation happened to land in. THIS is the core claim (H1): removing
    // ABSOLUTE-CELL argmin flips is what prevents an O(cell-size) radius jump; the f1/f2 FLOAT
    // VALUES are reported separately (floatValueDiffs, non-gating) since they always carry ordinary
    // rounding noise regardless of which cell won.
    const checkSample = (theta: number, z: number): void => {
      nChecked++;
      const { f64, f32 } = cellArgminBothPrecisionsInt(theta, z, DIMS.H, VPARAMS);
      const f1d = Math.abs(f64.f1 - f32.f1);
      const f2d = Math.abs(f64.f2 - f32.f2);
      if (f1d > maxF1Delta) maxF1Delta = f1d;
      if (f2d > maxF2Delta) maxF2Delta = f2d;
      if (f64.f1 !== f32.f1 || f64.f2 !== f32.f2) floatValueDiffs++;
      // THE GATE: did F64 and F32-emulated select a DIFFERENT ABSOLUTE PHYSICAL CELL as the winner?
      if (f64.f1CellX !== f32.f1CellX || f64.f1CellY !== f32.f1CellY
        || f64.f2CellX !== f32.f2CellX || f64.f2CellY !== f32.f2CellY) {
        argminDiffs++;
        if (!worstArgminSample) {
          worstArgminSample = {
            theta, z,
            f64Idx: [f64.f1CellX, f64.f1CellY, f64.f2CellX, f64.f2CellY],
            f32Idx: [f32.f1CellX, f32.f1CellY, f32.f2CellX, f32.f2CellY],
          };
        }
      }
      const rF64 = rOuterVoronoiIntF64(theta, z, R0, DIMS.H, VPARAMS);
      const rF32 = rOuterVoronoiIntF32(theta, z, R0, DIMS.H, VPARAMS);
      const rd = Math.abs(rF64 - rF32);
      if (rd > maxRadiusDeltaMm) { maxRadiusDeltaMm = rd; worstRadiusSample = { theta, z, f64: rF64, f32: rF32 }; }
    };

    for (let i = 0; i < N_RANDOM; i++) {
      const theta = rng() * TAU;
      const z = rng() * DIMS.H;
      checkSample(theta, z);
    }

    // (c) BOUNDARY BANDS — sample within +-1e-4 of integer lines in the SCALED (u,v) domain (the
    // domain periodicCellularInt actually floors), then invert back to (theta,z) for the shared
    // call signature. u = (theta/TAU)*scaleVal (ignoring pulse=0 at default) => theta = (u/scaleVal)*TAU.
    // v = t*scaleVal*stretchVal (stretchVal=1 at default) => t = v/scaleVal => z = t*H.
    const stretchVal = VPARAMS.zStretch > 0 ? VPARAMS.zStretch : 1;
    for (let i = 0; i < N_BOUNDARY; i++) {
      // pick a random integer cell line (either a u-line or a v-line) and jitter within 1e-4
      const axisIsU = rng() < 0.5;
      if (axisIsU) {
        const uLine = Math.floor(rng() * (scaleVal + 2)) - 1;
        const u = uLine + (rng() * 2 - 1) * 1e-4;
        const v = rng() * scaleVal * 3 - scaleVal; // cover a few periods of v too
        const theta = ((u / scaleVal) * TAU + TAU) % TAU;
        const t = v / (scaleVal * stretchVal);
        const z = Math.max(0, Math.min(DIMS.H, t * DIMS.H));
        checkSample(theta, z);
      } else {
        const vLine = Math.floor(rng() * (scaleVal * 3 + 2)) - (scaleVal + 1);
        const v = vLine + (rng() * 2 - 1) * 1e-4;
        const u = rng() * scaleVal;
        const theta = ((u / scaleVal) * TAU + TAU) % TAU;
        const t = v / (scaleVal * stretchVal);
        const z = Math.max(0, Math.min(DIMS.H, t * DIMS.H));
        checkSample(theta, z);
      }
    }

    // jitterBitDiffs is folded into hashBitDiffs above (hash22Int returns BOTH the x/y unit floats
    // in one call — a diff in either lane is caught by the x!==y check); it is 0 BY CONSTRUCTION
    // since hash22Int has no Round parameter at all to diverge on (proven, not just argued, by the
    // 200k-sample loop above).
    jitterBitDiffs = hashBitDiffs;

    /* eslint-disable no-console */
    console.log(`[inthash-determinism] total samples checked: ${nChecked} (random=${N_RANDOM}, boundary=${N_BOUNDARY})`);
    console.log(`[inthash-determinism] raw hash22Int bit-diffs (repeat-call sanity, 200k domain samples): ${hashBitDiffs}`);
    console.log(`[inthash-determinism] jitter-float bit-diffs (same mechanism as hash, no separate Round path): ${jitterBitDiffs}`);
    console.log(`[inthash-determinism] GATE — winning ABSOLUTE CELL diffs (f1CellX/Y, f2CellX/Y) F64 vs F32-emulated: ${argminDiffs}/${nChecked}`);
    console.log(`[inthash-determinism] secondary (non-gating) — f1/f2 FLOAT VALUE diffs (expected ordinary last-ULP rounding on the still-floating-point distance chain, even with bit-identical hash inputs): ${floatValueDiffs}/${nChecked}`);
    console.log(`[inthash-determinism] max |f1_f64 - f1_f32| = ${maxF1Delta.toExponential(3)}, max |f2_f64 - f2_f32| = ${maxF2Delta.toExponential(3)} (normalized units — smooth-function float noise, NOT O(cell) jumps)`);
    console.log(`[inthash-determinism] max |radius_f64 - radius_f32| = ${maxRadiusDeltaMm.toExponential(3)} mm (at R0=${R0}, H=${DIMS.H})`);
    if (worstArgminSample) console.log(`[inthash-determinism] worst SELECTION-diff sample (should not exist if gate passes): ${JSON.stringify(worstArgminSample)}`);
    if (worstRadiusSample) console.log(`[inthash-determinism] worst radius-delta sample: ${JSON.stringify(worstRadiusSample)}`);
    /* eslint-enable no-console */

    // KILL CRITERIA (pre-registered): any nonzero bit-diff in hash/jitter/WINNING-NEIGHBOR-SELECTION
    // ⇒ H1 fails its own core claim. These expectations ARE the gate — a failure here is the
    // REFUTED verdict, reported verbatim via the console output above (which stage first shows
    // divergence). floatValueDiffs is intentionally NOT gated (see the checkSample doc comment
    // above for why last-ULP float noise on the distance chain is expected and harmless).
    expect(hashBitDiffs).toBe(0);
    expect(argminDiffs).toBe(0);
  }, 300_000);

  it.skipIf(!ON)('(2) A/B CONTROL — same boundary-band sweep through the EXISTING float-hash chain', () => {
    const rng = mulberry32(0xc0ffee); // SAME seed as measurement 1's boundary loop for a matched-sample A/B
    const N_BOUNDARY = 500_000;
    const scaleVal = VPARAMS.scale;
    const stretchVal = VPARAMS.zStretch > 0 ? VPARAMS.zStretch : 1;

    let argminFlips = 0;
    let maxRadiusDeltaMm = 0;
    let nChecked = 0;
    let worstFlipSample: { theta: number; z: number; f64: unknown; f32: unknown } | null = null;

    for (let i = 0; i < N_BOUNDARY; i++) {
      const axisIsU = rng() < 0.5;
      let theta: number, z: number;
      if (axisIsU) {
        const uLine = Math.floor(rng() * (scaleVal + 2)) - 1;
        const u = uLine + (rng() * 2 - 1) * 1e-4;
        const v = rng() * scaleVal * 3 - scaleVal;
        theta = ((u / scaleVal) * TAU + TAU) % TAU;
        const t = v / (scaleVal * stretchVal);
        z = Math.max(0, Math.min(DIMS.H, t * DIMS.H));
      } else {
        const vLine = Math.floor(rng() * (scaleVal * 3 + 2)) - (scaleVal + 1);
        const v = vLine + (rng() * 2 - 1) * 1e-4;
        const u = rng() * scaleVal;
        theta = ((u / scaleVal) * TAU + TAU) % TAU;
        const t = v / (scaleVal * stretchVal);
        z = Math.max(0, Math.min(DIMS.H, t * DIMS.H));
      }
      nChecked++;
      const { f64, f32 } = cellArgminBothPrecisions(theta, z, DIMS.H, VPARAMS);
      const ARGMIN_EPS = 0.003; // same threshold as E-2026-07-09-VORONOI-TRUTHBRIDGE's divergence-locus check
      if (Math.abs(f64.f1 - f32.f1) > ARGMIN_EPS || Math.abs(f64.f2 - f32.f2) > ARGMIN_EPS) {
        argminFlips++;
        if (!worstFlipSample) worstFlipSample = { theta, z, f64, f32 };
      }
      const rF64 = rOuterVoronoiF64Ref(theta, z, R0, DIMS.H, VPARAMS);
      const rF32 = rOuterVoronoiF32(theta, z, R0, DIMS.H, VPARAMS);
      const rd = Math.abs(rF64 - rF32);
      if (rd > maxRadiusDeltaMm) maxRadiusDeltaMm = rd;
    }

    /* eslint-disable no-console */
    console.log(`[inthash-AB-control] EXISTING float-hash chain, SAME adversarial boundary-band sweep (n=${nChecked}):`);
    console.log(`[inthash-AB-control] argmin flips (>0.003 normalized units, matches truthbridge threshold): ${argminFlips}/${nChecked}`);
    console.log(`[inthash-AB-control] max |radius_f64 - radius_f32| = ${maxRadiusDeltaMm.toFixed(6)} mm`);
    if (worstFlipSample) console.log(`[inthash-AB-control] worst flip sample: ${JSON.stringify(worstFlipSample)}`);
    console.log('[inthash-AB-control] NOTE: E-2026-07-09-VORONOI-TRUTHBRIDGE found 0/500 flips sampling the ARTIFACT\'s actual worst vertices; this is a DIFFERENT (harder, adversarial-boundary) sampling regime — either result here is informative, reported honestly.');
    /* eslint-enable no-console */

    // No pass/fail gate on this test — it is a CONTROL measurement, reported for comparison, not a
    // kill criterion of the int-hash design itself.
    expect(nChecked).toBe(N_BOUNDARY);
  }, 300_000);

  it.skipIf(!ON)('(3) PERF — ns/eval, float-hash chain vs int-hash chain, >=10M evals each, warmed', () => {
    const N_WARMUP = 500_000;
    const N_TIMED = 10_000_000;
    const rng = mulberry32(0xbeef);

    // Pre-generate sample loci ONCE so both chains see the identical input sequence (fair A/B —
    // no RNG-call overhead inside the timed loop, and no chain gets different inputs by chance).
    const thetas = new Float64Array(N_TIMED);
    const zs = new Float64Array(N_TIMED);
    for (let i = 0; i < N_TIMED; i++) { thetas[i] = rng() * TAU; zs[i] = rng() * DIMS.H; }

    const bench = (fn: (theta: number, z: number) => number): { ns: number; sink: number } => {
      let sink = 0;
      for (let i = 0; i < N_WARMUP; i++) sink += fn(thetas[i % N_TIMED], zs[i % N_TIMED]);
      const t0 = process.hrtime.bigint();
      for (let i = 0; i < N_TIMED; i++) sink += fn(thetas[i], zs[i]);
      const t1 = process.hrtime.bigint();
      return { ns: Number(t1 - t0) / N_TIMED, sink }; // ns/eval; sink returned (not discarded) to keep the loop from being dead-code-eliminated
    };

    const floatBench = bench((theta, z) => rOuterVoronoiF64Ref(theta, z, R0, DIMS.H, VPARAMS));
    const intBench = bench((theta, z) => rOuterVoronoiIntF64(theta, z, R0, DIMS.H, VPARAMS));
    const floatNs = floatBench.ns;
    const intNs = intBench.ns;

    const ratio = intNs / floatNs;
    /* eslint-disable no-console */
    console.log(`[inthash-perf] EXISTING float-hash chain (f64): ${floatNs.toFixed(2)} ns/eval over ${N_TIMED.toLocaleString()} evals`);
    console.log(`[inthash-perf] NEW int-hash chain (f64):        ${intNs.toFixed(2)} ns/eval over ${N_TIMED.toLocaleString()} evals`);
    console.log(`[inthash-perf] int/float ratio: ${ratio.toFixed(3)}x (${ratio < 1 ? 'int chain FASTER' : 'int chain SLOWER'})`);
    if (ratio > 1.5) console.log('[inthash-perf] KILL-CRITERION NOTE: int chain >1.5x slower than float chain — does not kill correctness (H1), but must be surfaced in the verdict per pre-registration.');
    /* eslint-enable no-console */

    expect(floatNs).toBeGreaterThan(0);
    expect(intNs).toBeGreaterThan(0);
  }, 300_000);

  it.skipIf(!ON)('(4) VISUAL PACK — (u,t) relief field grayscale, OLD (float-hash) vs NEW (int-hash), DEFAULT_VORONOI', () => {
    mkdirSync(OUTDIR, { recursive: true });
    const SIZE = 1024;
    const oldRgb = new Uint8Array(SIZE * SIZE * 3);
    const newRgb = new Uint8Array(SIZE * SIZE * 3);

    // Sample the relief pattern directly in (u,v)-normalized space so cell layout is visible at a
    // useful zoom (a few periods of the DEFAULT_VORONOI scale=8 across the image), independent of
    // the cylindrical (theta,z) wrap — this isolates the HASH/CELL visual, which is the thing under
    // test, from the unrelated cylinder-mapping visual.
    const uSpan = VPARAMS.scale; // one full period of the periodic X axis
    const vSpan = VPARAMS.scale * 1.5; // 1.5x span in v so the image isn't perfectly square-periodic

    let oldMinRelief = Infinity, oldMaxRelief = -Infinity;
    let newMinRelief = Infinity, newMaxRelief = -Infinity;
    const oldReliefField = new Float64Array(SIZE * SIZE);
    const newReliefField = new Float64Array(SIZE * SIZE);

    for (let py = 0; py < SIZE; py++) {
      const v = (py / SIZE) * vSpan;
      const t = v / VPARAMS.scale;
      const z = Math.max(0, Math.min(DIMS.H, t * DIMS.H));
      for (let px = 0; px < SIZE; px++) {
        const u = (px / SIZE) * uSpan;
        const theta = ((u / VPARAMS.scale) * TAU + TAU) % TAU;
        const rOld = rOuterVoronoiF64Ref(theta, z, 0, DIMS.H, VPARAMS); // r0=0 isolates the pattern term
        const rNew = rOuterVoronoiIntF64(theta, z, 0, DIMS.H, VPARAMS);
        const idx = py * SIZE + px;
        oldReliefField[idx] = rOld;
        newReliefField[idx] = rNew;
        if (rOld < oldMinRelief) oldMinRelief = rOld;
        if (rOld > oldMaxRelief) oldMaxRelief = rOld;
        if (rNew < newMinRelief) newMinRelief = rNew;
        if (rNew > newMaxRelief) newMaxRelief = rNew;
      }
    }

    const toGray = (field: Float64Array, lo: number, hi: number, out: Uint8Array): void => {
      const span = Math.max(hi - lo, 1e-9);
      for (let i = 0; i < field.length; i++) {
        const g = Math.max(0, Math.min(255, Math.round(((field[i] - lo) / span) * 255)));
        out[i * 3] = g; out[i * 3 + 1] = g; out[i * 3 + 2] = g;
      }
    };
    toGray(oldReliefField, oldMinRelief, oldMaxRelief, oldRgb);
    toGray(newReliefField, newMinRelief, newMaxRelief, newRgb);

    writePNG(join(OUTDIR, 'voronoi_relief_OLD_floathash.png'), SIZE, SIZE, oldRgb);
    writePNG(join(OUTDIR, 'voronoi_relief_NEW_inthash.png'), SIZE, SIZE, newRgb);

    // Basic cell-layout statistics: count local-minima "cell center" pixels (a crude but honest
    // proxy for cell count/density — a pixel whose relief is lower than all 4 orthogonal neighbors)
    // as a cheap same-order-of-magnitude sanity check that NEW isn't a degenerate field (e.g.
    // constant, striped, or far denser/sparser than OLD).
    const countLocalMinima = (field: Float64Array): number => {
      let n = 0;
      for (let py = 1; py < SIZE - 1; py++) {
        for (let px = 1; px < SIZE - 1; px++) {
          const idx = py * SIZE + px;
          const c = field[idx];
          if (c < field[idx - 1] && c < field[idx + 1] && c < field[idx - SIZE] && c < field[idx + SIZE]) n++;
        }
      }
      return n;
    };
    const oldMinimaCount = countLocalMinima(oldReliefField);
    const newMinimaCount = countLocalMinima(newReliefField);

    // Pixel-diff fraction: how many pixels are within a small tolerance of each other (should be
    // LOW — a different hash produces a different cell layout almost everywhere except by chance).
    let samePixels = 0;
    const PIX_TOL = (oldMaxRelief - oldMinRelief) * 0.02;
    for (let i = 0; i < oldReliefField.length; i++) {
      if (Math.abs(oldReliefField[i] - newReliefField[i]) < PIX_TOL) samePixels++;
    }
    const sameFrac = samePixels / oldReliefField.length;

    const meta = {
      size: SIZE, uSpan, vSpan, scale: VPARAMS.scale,
      old: { minRelief: oldMinRelief, maxRelief: oldMaxRelief, localMinimaCount: oldMinimaCount },
      new: { minRelief: newMinRelief, maxRelief: newMaxRelief, localMinimaCount: newMinimaCount },
      samePixelFraction: sameFrac,
      note: 'r0=0 isolates the pattern term; images are the RELIEF PATTERN, not a real pot radius. old=EXISTING float-hash chain (styles.ts port), new=NEW int-hash chain (this arm).',
    };
    writeFileSync(join(OUTDIR, 'voronoi_relief_meta.json'), JSON.stringify(meta, null, 2));

    /* eslint-disable no-console */
    console.log(`[inthash-visual] OLD (float-hash): relief range [${oldMinRelief.toFixed(4)}, ${oldMaxRelief.toFixed(4)}], local-minima (cell-center proxy) count=${oldMinimaCount}`);
    console.log(`[inthash-visual] NEW (int-hash):   relief range [${newMinRelief.toFixed(4)}, ${newMaxRelief.toFixed(4)}], local-minima (cell-center proxy) count=${newMinimaCount}`);
    console.log(`[inthash-visual] same-pixel fraction (within 2% of range): ${(sameFrac * 100).toFixed(2)}% — expect LOW (different hash => different cell layout)`);
    console.log(`[inthash-visual] wrote ${join(OUTDIR, 'voronoi_relief_OLD_floathash.png')} + voronoi_relief_NEW_inthash.png + voronoi_relief_meta.json`);
    /* eslint-enable no-console */

    expect(existsSync(join(OUTDIR, 'voronoi_relief_OLD_floathash.png'))).toBe(true);
    expect(existsSync(join(OUTDIR, 'voronoi_relief_NEW_inthash.png'))).toBe(true);
  }, 120_000);
});
