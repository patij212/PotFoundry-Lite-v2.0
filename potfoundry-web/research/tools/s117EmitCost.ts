// s117EmitCost.ts — S117 P1 step 4: PER-TRIANGLE COST OF THE PRODUCTION emitInvariant, ATTRIBUTED.
//
// A bare "N ns/triangle" invites the reader to wonder how much of it is the predicate and how much is
// the harness. So this measures FOUR arms on the SAME triangles in the SAME process:
//   A  BASELINE   the loop and the array reads only — no predicate at all
//   B  CORE+scratch    T1|T2|T3 with a caller-supplied verdict (the allocation-free hot path)
//   C  CORE alloc      the same, but letting the module allocate a verdict per call
//   D  FULL       CORE + T4 against the real rA (42 analytic evaluations per triangle)
// and reports B-A as the predicate's own cost, C-B as the price of not passing a scratch, and D-B as
// the price of the analytic terms.
//
// Usage: bash research/tools/run-s117-cost.sh   (env PF_S117_STL absolute, PF_S117_STYLE, PF_S117_TAG)
import { mkdirSync, writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import {
  checkEmitInvariant, makeEmitVerdict, DEFENSIBLE_EMIT_INVARIANT, type EmitInvariantOptions,
} from '../../src/renderers/webgpu/parametric/conforming/emitInvariant';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));

const STYLE = process.env.PF_S117_STYLE ?? 'GothicArches';
const STL = process.env.PF_S117_STL ?? '';
const TAG = process.env.PF_S117_TAG ?? STYLE;
const OUTDIR = process.env.PF_S117_OUTDIR ?? 'research/exchange/_strataConformBisect/s117';
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
const H = DIMS.H;
const N_BENCH = envI('PF_S117_BENCHN', 400000);
const REPS = envI('PF_S117_REPS', 5);
const SHIP_TRIS = envF('PF_S117_SHIPTRIS', 1.1e7);   // the 0.001 mm triangle bill (S116)

if (STL.length === 0) { log('*** PF_S117_STL is required (ABSOLUTE path). ***'); process.exit(2); }
mkdirSync(OUTDIR, { recursive: true });

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  if (cfg === undefined) { log(`*** STYLE ${id} NOT IN STYLE_REGISTRY ***`); process.exit(3); }
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [kk, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(kk)] = v.default;
  }
  return out;
}
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz;
const nF = Math.min(M.nTri, N_BENCH);
const THA = new Float64Array(nF); const THB = new Float64Array(nF); const THC = new Float64Array(nF);
for (let f = 0; f < nF; f += 1) {
  const o = f * 9;
  const t = Math.atan2(xyz[o + 1], xyz[o]);
  THA[f] = t;
  THB[f] = t + dThRaw(t, Math.atan2(xyz[o + 4], xyz[o + 3]));
  THC[f] = t + dThRaw(t, Math.atan2(xyz[o + 7], xyz[o + 6]));
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S117 — emitInvariant PER-TRIANGLE COST, ATTRIBUTED — ${STYLE} (tag ${TAG}) =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`triangles benched ${nF}   reps ${REPS}   (best-of-reps reported, to shed GC and scheduler noise)`);

const scratch = makeEmitVerdict();
const optCore: EmitInvariantOptions = { ...DEFENSIBLE_EMIT_INVARIANT };
const optFull: EmitInvariantOptions = { ...DEFENSIBLE_EMIT_INVARIANT, rA, zMin: 0, zMax: H };

let sink = 0;
function bench(name: string, body: () => void): number {
  let best = Infinity;
  for (let r = 0; r < REPS; r += 1) {
    const t0 = process.hrtime.bigint();
    body();
    const dt = Number(process.hrtime.bigint() - t0) / nF;
    if (dt < best) best = dt;
  }
  log(`   ${name.padEnd(22)} ${best.toFixed(1).padStart(10)} ns/triangle`);
  return best;
}

const A = bench('A BASELINE (loop only)', () => {
  for (let f = 0; f < nF; f += 1) {
    const o = f * 9;
    sink += xyz[o] + xyz[o + 4] + xyz[o + 8] + THA[f] + THB[f] + THC[f];
  }
});
const B = bench('B CORE + scratch', () => {
  for (let f = 0; f < nF; f += 1) {
    const o = f * 9;
    const v = checkEmitInvariant(
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      THA[f], THB[f], THC[f], optCore, scratch,
    );
    if (v.ok) sink += 1;
  }
});
const C = bench('C CORE, module allocs', () => {
  for (let f = 0; f < nF; f += 1) {
    const o = f * 9;
    const v = checkEmitInvariant(
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      THA[f], THB[f], THC[f], optCore,
    );
    if (v.ok) sink += 1;
  }
});
const D = bench('D FULL (CORE + T4)', () => {
  for (let f = 0; f < nF; f += 1) {
    const o = f * 9;
    const v = checkEmitInvariant(
      xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
      THA[f], THB[f], THC[f], optFull, scratch,
    );
    if (v.ok) sink += 1;
  }
});
const E = bench('E rA alone x42', () => {
  for (let f = 0; f < nF; f += 1) for (let i = 0; i < 42; i += 1) sink += rA(THA[f] + i * 1e-6, xyz[f * 9 + 2]);
});

log('');
log(`   PREDICATE'S OWN COST (B - A)          ${(B - A).toFixed(1)} ns/triangle   <= the number to quote for the zero-eval core`);
log(`   PRICE OF NOT PASSING A SCRATCH (C - B) ${(C - B).toFixed(1)} ns/triangle`);
log(`   PRICE OF THE ANALYTIC TERMS (D - B)    ${(D - B).toFixed(0)} ns/triangle  (42 rA evals; rA alone x42 = ${E.toFixed(0)} ns)`);
log('');
log(`   AT THE 0.001 mm TRIANGLE BILL (${SHIP_TRIS.toExponential(1)} triangles):`);
log(`     CORE on every emitted triangle:  ${((B - A) * SHIP_TRIS / 1e9).toFixed(2)} s`);
log(`     FULL on every emitted triangle:  ${((D - A) * SHIP_TRIS / 1e9).toFixed(0)} s`);
log(`   (checksum ${sink.toFixed(3)})`);

writeFileSync(`${OUTDIR}/S117_COST_${TAG}.json`, JSON.stringify({
  style: STYLE, stl: STL, nF, reps: REPS, baselineNs: A, coreScratchNs: B, coreAllocNs: C, fullNs: D, rA42Ns: E,
  predicateOwnNs: B - A, scratchPriceNs: C - B, analyticPriceNs: D - B, shipTris: SHIP_TRIS,
}, null, 2));
log(`\njson -> ${OUTDIR}/S117_COST_${TAG}.json`);
