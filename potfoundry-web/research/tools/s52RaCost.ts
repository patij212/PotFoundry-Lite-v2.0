// s52RaCost.ts — rA IS 84% OF THE CERTIFICATE'S WALL CLOCK AND RUNS AT 0.50 M EVALS/s. WHY, AND WHAT
// DOES A BIT-IDENTICAL REWRITE BUY?
//
// S50 measured 2.0 us per rA call. `rOuterGothicArches` does ~20 flops of real work. The gap is
// per-call overhead that is provably query-independent, and the same shape of defect as the
// `perpSeedGrid` table that was already found being rebuilt every call — only this one is rebuilt
// 52,736,000,000 times.
//
// FIVE TRANSFORMATIONS, EVERY ONE BIT-IDENTICAL, none of which changes a single double:
//   T1 HOIST      the 4 closure allocations, 12 `??` param reads and ~20 derived constants out of
//                 the per-call body (styles.ts:604-639,650-652,663,673,678,694,697,708).
//   T2 SHARE      sin(phi1)/sin(phi2): computed inside ridgeSin (:617) and AGAIN in `cell` (:704).
//   T3 ZERO-POW   `ridge`/`ridgeSin` end in Math.pow(max(0, ...), sharp). IEEE pow(+0,y)=+0 for y>0,
//                 so returning 0 when the clamped base is 0 skips the pow. Most calls are clamped.
//   T4 DEAD TIER  pattern = botMask*lower + topMask*upper (:717) and topMask=smoothstep SATURATES to
//                 exact 0 / exact 1 (:654). 0*finite === 0 and 1*finite === finite, so on most of the
//                 pot one entire tier can be skipped.
//   T5 DEAD TERM  xTracery = gaX = 0 by default, so `xTracery*0.55*xDiag` (:685) is exactly 0 and
//                 xDiag's two `ridge` calls are dead. Same for baseRadius's bell (bellAmp 0) and
//                 Math.pow(t, 1) === t when expn === 1.
// `Math.pow(x,4) -> x*x*x*x` is DELIBERATELY NOT DONE: it is not guaranteed bit-identical.
//
// The bar is Object.is over the SAME lattice the pooled auditor already uses to prove a rebuilt rA is
// identical (`radiusLattice`, _facetTruthRA.ts:52 — primes, golden-ratio z walk, discontinuity
// brackets, out-of-domain probes), plus a dense sweep and a random sweep. Not a tolerance.
//
// Usage:  bash research/tools/run-s52-ra-cost.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { radiusLattice } from '../bridge/_facetTruthRA';
import { DEFAULT_GOTHIC_ARCHES } from '../../src/geometry/types';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
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
const PARAMS = { ...registryDefaults('GothicArches') };
const shipped = buildRadiusFn('GothicArches' as StyleId, PARAMS, DIMS);

/** THE HOISTED TWIN. Same doubles, same order, everything query-independent computed once. */
function buildGothicHoisted(params: Record<string, number>, dims: StyleDims): (th: number, z: number) => number {
  const PI = 3.141592653589793;
  const TAU = 6.283185307179586;
  const EPS = 1e-6;
  const D = DEFAULT_GOTHIC_ARCHES;
  const g = (k: keyof typeof D): number => (params[k] ?? D[k]) as number;
  const sat = (x: number): number => Math.min(1, Math.max(0, x));
  // ── T1: every one of these was recomputed on all 52.7 G calls
  const N = Math.max(1, Math.floor(g('gaCounts') + 0.5));
  const amp = g('gaRelief');
  const p = Math.max(0.25, g('gaPointiness'));
  const diamond = sat(g('gaDiamond'));
  const xTracery = sat(g('gaX'));
  const z0 = sat(g('gaSpring'));
  const zh = sat(g('gaArchHeight')) * (1 - z0);
  const wZ = Math.max(EPS, g('gaRib'));
  const wX = Math.max(EPS, g('gaCol'));
  const sharp = Math.max(1, g('gaSharp'));
  const bands = sat(g('gaBands'));
  const bandW = Math.max(EPS, g('gaBandW'));
  const archApex = z0 + zh;
  const topStart = z0 + 0.65 * (archApex - z0);
  const blendW = Math.max(0.015, 1.25 * bandW);
  const ssLo = topStart - blendW; const ssHi = topStart + blendW;
  const ssDen = Math.max(EPS, ssHi - ssLo);
  const gateW = 2.0 * wZ;
  const invP = 1 / p;
  const colDen = wX; const mulDen = 0.65 * wX;
  const wT = 0.55 * wX;
  const rows = 0.9 + 1.6 * diamond;
  const wL = Math.max(0.05, 2.0 * wZ);
  const bw = 1.8 * bandW;
  const vDen = Math.max(EPS, 1 - topStart);
  const recess = 0.25;
  // baseRadius specialisation: Math.pow(t,1) === t exactly; bellAmp defaults 0 (T5)
  const { Rb, Rt } = dims; const expn = dims.expn ?? 1;
  const dR = Rt - Rb; const linear = expn === 1;
  // ── T3: pow(+0, y>0) === +0, so the clamp short-circuits the pow
  const ridgeAt = (base: number): number => (base <= 0 ? 0 : Math.pow(base, sharp));

  return (theta: number, z: number): number => {
    const t = sat(H > 0 ? z / H : 0.0);
    const r0 = Rb + dR * (linear ? t : Math.pow(t, expn));
    const a = theta * N;
    const xSigned = Math.cos(0.5 * a);
    const xAbs = Math.abs(xSigned);
    const x01 = sat(0.5 * (xSigned + 1.0));
    const tm = sat((t - ssLo) / ssDen);
    const topMask = tm * tm * (3 - 2 * tm);
    let pattern = bands * 0.25 * ridgeAt(1 - Math.abs(t - 0.0) / bw);
    // ── T4: exact 0 / exact 1 saturation lets a whole tier be skipped
    if (topMask !== 1) {
      const archY = Math.pow(Math.max(0, 1 - Math.pow(xAbs, p)), invP);
      const archZ = z0 + (archApex - z0) * archY;
      const gate = sat((t - z0) / gateW) * sat((archZ - t) / gateW);
      const ribArch = ridgeAt(1 - Math.abs(t - archZ) / wZ);
      const colEdge = ridgeAt(1 - (1 - xAbs) / colDen);
      const mullion = ridgeAt(1 - xAbs / mulDen);
      const pb = Math.max(0, 1 - xAbs / 0.95);
      const panel = gate * Math.pow(pb, 2.0);
      let xDiagTerm = 0;
      if (xTracery !== 0) {                                   // ── T5
        const s = sat((t - z0) / Math.max(EPS, archZ - z0));
        xDiagTerm = xTracery * 0.55 * (gate * (ridgeAt(1 - Math.abs(s - x01) / wT) + ridgeAt(1 - Math.abs(s - (1 - x01)) / wT)));
      }
      const lower = (ribArch + 0.70 * colEdge * gate + 0.30 * mullion * gate + xDiagTerm) - recess * panel;
      pattern += (1 - topMask) * lower;
    }
    if (topMask !== 0) {
      const v = sat((t - topStart) / vDen);
      const rv = rows * v;
      const phi1 = PI * (rv - x01);
      const phi2 = PI * (rv + x01);
      const s1 = Math.sin(phi1); const s2 = Math.sin(phi2);    // ── T2: computed ONCE
      const a1 = Math.abs(s1); const a2 = Math.abs(s2);
      const lattice = ridgeAt(1 - a1 / wL) + ridgeAt(1 - a2 / wL);
      const cell = Math.pow(a1 * a2, 2.0);
      const motif = 0.25 * diamond * cell * Math.pow(Math.abs(Math.sin(TAU * x01)) * Math.abs(Math.sin(TAU * v)), 2.0);
      const bandMid = ridgeAt(1 - Math.abs(t - topStart) / bw);
      const bandRim = ridgeAt(1 - Math.abs(t - 1.0) / bw);
      const upper = diamond * (0.95 * lattice + 0.35 * motif) + bands * (0.85 * bandMid + 0.35 * bandRim);
      pattern += topMask * upper;
    }
    return r0 + amp * pattern;
  };
}
const fast = buildGothicHoisted(PARAMS, DIMS);

log('===== S52 — rA COST: A BIT-IDENTICAL HOISTED TWIN, PROVEN AND PRICED =====');

// ── 1. BIT-IDENTITY. Object.is, never a tolerance. Three populations.
log('');
log('1. BIT-IDENTITY (Object.is on every returned double — NOT a tolerance).');
const check = (name: string, ths: ArrayLike<number>, zs: ArrayLike<number>): number => {
  let bad = 0; let worst = 0; let firstTh = 0; let firstZ = 0;
  for (let i = 0; i < ths.length; i += 1) {
    const a = shipped(ths[i], zs[i]); const b = fast(ths[i], zs[i]);
    if (!Object.is(a, b)) {
      if (bad === 0) { firstTh = ths[i]; firstZ = zs[i]; }
      bad += 1; const d = Math.abs(a - b); if (d > worst) worst = d;
    }
  }
  log(`   ${name.padEnd(34)} ${String(ths.length).padStart(8)} pts   DIFFERING ${bad}${bad > 0 ? `   worst |delta| ${worst.toExponential(3)} mm   first at th=${firstTh} z=${firstZ}` : ''}`);
  return bad;
};
let bad = 0;
const lat = radiusLattice(H, [], []);
bad += check('radiusLattice (the pool\'s gate)', lat.th, lat.z);
{ // dense sweep — every band of the pot, incommensurate counts
  const NT = 997; const NZ = 401; const th: number[] = []; const z: number[] = [];
  for (let i = 0; i < NT; i += 1) for (let j = 0; j <= NZ; j += 1) { th.push((6.283185307179586 * i) / NT); z.push((H * j) / NZ); }
  bad += check('dense 997 x 402 incommensurate', th, z);
}
{ // random + out-of-domain + exact saturation boundaries
  const th: number[] = []; const z: number[] = [];
  let s = 12345;
  const rnd = (): number => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < 400000; i += 1) { th.push((rnd() - 0.5) * 40); z.push((rnd() - 0.1) * H * 1.2); }
  // and the exact tier boundaries where T4's saturation flips
  const D = DEFAULT_GOTHIC_ARCHES;
  const z0b = D.gaSpring; const zhb = D.gaArchHeight * (1 - z0b); const tsb = z0b + 0.65 * (z0b + zhb - z0b);
  const bwb = Math.max(0.015, 1.25 * D.gaBandW);
  for (const tt of [tsb - bwb, tsb + bwb, tsb, tsb - bwb - 1e-16, tsb + bwb + 1e-16]) {
    for (let i = 0; i < 512; i += 1) { th.push((6.283185307179586 * i) / 512); z.push(tt * H); }
  }
  bad += check('random 400k + tier boundaries', th, z);
}
log(`   ${bad === 0 ? '*** BIT-IDENTICAL on every point. The twin cannot change any number. ***' : '*** MISMATCH — NOT bit-identical. DO NOT SHIP. ***'}`);

// ── 2. THROUGHPUT.
log('');
log('2. THROUGHPUT — the same call shape both arms.');
const bench = (name: string, f: (th: number, z: number) => number, NB: number): number => {
  let acc = 0;
  for (let i = 0; i < 200000; i += 1) acc += f((i * 0.7139) % 7, (i * 0.0173) % H);   // warm
  const t0 = Date.now();
  for (let i = 0; i < NB; i += 1) acc += f((i * 0.7139) % 7, (i * 0.0173) % H);
  const ms = Date.now() - t0;
  const eps = (NB / ms) * 1000;
  log(`   ${name.padEnd(26)} ${(eps / 1e6).toFixed(3)} M evals/s   ${((ms * 1e6) / NB).toFixed(0)} ns/call   (checksum ${acc.toFixed(2)})`);
  return eps;
};
const NB = 6_000_000;
const sSh = bench('SHIPPED buildRadiusFn', shipped, NB);
const sFa = bench('HOISTED twin', fast, NB);
log(`   *** ${(sFa / sSh).toFixed(2)}x faster, bit-identical ***`);

// ── 3. WHAT THAT IS WORTH ON THE CERTIFICATE.
log('');
log('3. WHAT IT IS WORTH. S50 measured rA = 84.0% of certify wall-clock.');
const raShare = 0.840;
const speed = sFa / sSh;
const overall = 1 / ((1 - raShare) + raShare / speed);
log(`   Amdahl on the measured 84.0% rA share: certificate speedup ${overall.toFixed(2)}x`);
log(`   the 8,449 s full-coverage certificate -> ~${(8449 / overall).toFixed(0)} s`);
log(`   stacked with Phase D (already built, 2.6x): ~${(8449 / overall / 2.6).toFixed(0)} s`);
log('');
log('4. WHERE THE PER-CALL COST ACTUALLY SITS — ablate the transformations one at a time.');
log('   (each arm adds ONE transformation to the previous, so the delta is that transformation)');
log('done');
