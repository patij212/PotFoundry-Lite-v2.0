// audRaFastDiff.ts — ADVERSARIAL AUDIT OF THE HOISTED rA TWIN (`_raFast.ts`, landed 2026-08-05).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// THE CLAIM UNDER ATTACK
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// `_raFast.ts` header: *"THE FIVE TRANSFORMATIONS. EVERY ONE IS EXACT. NONE TOUCHES A DOUBLE."* and
// *"Object.is-identical output on 819,867 points"*, guarded at runtime by `buildAuditRadiusFn`, which
// checks the twin against the shipped `buildRadiusFn` over `radiusLattice(H, [], [])` — 16,471 grid
// points plus 42 out-of-domain probes — and falls back on ANY deviation.
//
// The brief: *"Is the lattice check sufficient? Can you construct a (theta,z) where the twin differs
// and the lattice does not sample it?"*
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT READING THE TWO SOURCES SIDE BY SIDE FOUND, BEFORE RUNNING ANYTHING
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// D1. THE THREE-TERM ASSOCIATION IS REORDERED.
//     shipped `styles.ts:717`:  pattern = botMask*lower + topMask*upper + bands*0.25*bandBase
//                            => fl( fl(L + U) + B )
//     twin `_raFast.ts:106-139`: pattern = B;  pattern += L;  pattern += U
//                            => fl( fl(B + L) + U )
//     IEEE addition is COMMUTATIVE but NOT ASSOCIATIVE. These agree whenever at most TWO of the three
//     addends are non-zero (commutativity then covers it) and may differ in the last ulp when all
//     three are live. AT REGISTRY DEFAULTS THEY ARE NEVER ALL THREE LIVE: `bandBase` has support
//     t < 1.8*gaBandW = 0.072 and `topMask` is exactly 0 below ssLo = topStart - blendW ~ 0.51, so the
//     supports are DISJOINT and the reorder is inert. *** That is a property of the DEFAULT PARAMS,
//     not of the transformation. *** Raise `gaBandW` (or drop `gaSpring`/`gaArchHeight`) until
//     1.8*gaBandW > topStart - blendW and all three become live together.
// D2. `wT` LOSES ITS `Math.max(EPS, .)` CLAMP.
//     shipped: `ridge(s - x01, wT, sharp)` and `ridge` opens with `const w = Math.max(EPS, wIn)`.
//     twin:    `ridgeAt(1 - Math.abs(s - x01) / wT)` with `wT = 0.55 * wX`, unclamped.
//     wX >= EPS = 1e-6 only guarantees wT >= 5.5e-7, so for gaCol < 1.818e-6 the shipped code divides
//     by 1e-6 and the twin divides by 0.55*gaCol. Reachable only with gaX != 0 (the T5 branch).
// D3. THE TWIN SILENTLY DROPS `bellAmp` / `bellCenter` / `bellWidth`.
//     shipped `profile.ts:baseRadius` applies `r *= 1 + bellAmp*exp(...)` when `bellAmp != 0`; the twin
//     hard-codes its absence under T5 ("bellAmp = 0 by default"). Any caller passing a bell makes the
//     twin a DIFFERENT SURFACE, not a faster one.
// D4. The fast-twin check calls `radiusLattice(H, [], [])` — with EMPTY jump arrays — so the
//     discontinuity BRACKETS that `radiusLattice`'s own header calls "the places where a one-ULP
//     difference would actually change which side of a jump a sample lands on" are ABSENT from the
//     verification. Harmless for GothicArches (detectZJumps / detectThetaJumps both return 0) and a
//     live trap for the next style transcribed.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED, WRITTEN BEFORE THE FIRST RUN
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// H-G. The twin is bit-identical AT THE CAMPAIGN CONFIG.
//      KILL: any Object.is mismatch over 5,000,000 random (theta,z) + the adversarial boundary set, at
//      registry defaults and the campaign dims, REFUTES the landing outright.
// H-H. The twin is NOT exact IN GENERAL; D1/D2/D3 are reachable by parameters.
//      KILL: if all four adversarial parameter sets give ZERO mismatches, D1-D3 are wrong as read and
//      the header's "EVERY ONE IS EXACT" stands.
// H-I. THE GUARD HOLDS EVEN SO: wherever the twin differs, `radiusLattice(H,[],[])` sees it and
//      `buildAuditRadiusFn` falls back, so the failure mode is "no speedup", never "a different
//      surface".
//      KILL: *** a parameter set where the twin differs on the random sample but the lattice reports
//      fastDiffs === 0 REFUTES the guard *** — that is the manager's question, and it is the only
//      result here that would matter to a shipped number.
//
// Usage:  bash research/tools/run-aud-rafast-diff.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { buildFastRadiusFn } from '../bridge/_raFast';
import { buildAuditRadiusFn, radiusLattice } from '../bridge/_facetTruthRA';
import { perpSeedGrid, type RadiusFn } from '../bridge/_facetTruthLib';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NRAND = Math.round(envF('PF_AUDRA_N', 5e6));
const OUT = 'research/exchange/_strataConformBisect/AUD_RAFAST.ndjson';
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
/** ulp distance between two doubles (0 = Object.is-identical for finite values). */
const ulps = (a: number, b: number): number => {
  if (Object.is(a, b)) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  const buf = new ArrayBuffer(8); const f = new Float64Array(buf); const i = new BigInt64Array(buf);
  f[0] = a; let ia = i[0]; f[0] = b; let ib = i[0];
  if (ia < 0n) ia = -9223372036854775808n - ia;
  if (ib < 0n) ib = -9223372036854775808n - ib;
  const d = ia > ib ? ia - ib : ib - ia;
  return Number(d);
};

mkdirSync('research/exchange/_strataConformBisect', { recursive: true });
log('===== AUD-RAFAST-DIFF — adversarial audit of the hoisted rA twin =====');
log(`dims H ${H} Rb ${DIMS.Rb} Rt ${DIMS.Rt} expn ${DIMS.expn}   random points per arm ${NRAND}`);

const DEF = registryDefaults('GothicArches');
log(`registry defaults for GothicArches: ${JSON.stringify(DEF)}`);

// ── the adversarial (theta,z) set: every exact boundary the transformations lean on
function adversarialPoints(params: Record<string, number>): Array<[number, number]> {
  const sat = (x: number): number => Math.min(1, Math.max(0, x));
  const EPS = 1e-6;
  const z0 = sat(params.gaSpring ?? 0.15);
  const zh = sat(params.gaArchHeight ?? 0.7) * (1 - z0);
  const bandW = Math.max(EPS, params.gaBandW ?? 0.04);
  const archApex = z0 + zh;
  const topStart = z0 + 0.65 * (archApex - z0);
  const blendW = Math.max(0.015, 1.25 * bandW);
  const N = Math.max(1, Math.floor((params.gaCounts ?? 12) + 0.5));
  const bw = 1.8 * bandW;
  const ts: number[] = [0, 1, z0, archApex, topStart, topStart - blendW, topStart + blendW, bw, 2 * bw, 1 - bw];
  const out: Array<[number, number]> = [];
  for (const t0 of ts) {
    for (const dt of [0, -1e-16, 1e-16, -1e-12, 1e-12, -1e-8, 1e-8]) {
      const t = t0 + dt;
      // theta at bay centre (xAbs=0), bay edge (xAbs=1), and quarter points, per bay
      for (const frac of [0, 0.25, 0.5, 0.75, 1, 0.5 - 1e-12, 0.5 + 1e-12]) {
        out.push([(2 * Math.PI * frac) / N, t * H]);
      }
    }
  }
  for (const th of [-7.3, -1e-12, 0, 2 * Math.PI, 2 * Math.PI + 1e-12, 19.7, 1e300]) {
    for (const z of [-3, -1e-12, 0, H / 3, H, H + 1e-12, H + 3]) out.push([th, z]);
  }
  return out;
}

interface Arm { name: string; why: string; params: Record<string, number>; dims?: StyleDims }
const ARMS: Arm[] = [
  { name: 'DEFAULTS', why: 'the campaign config — the landing is claimed here', params: { ...DEF } },
  {
    name: 'D1-OVERLAP',
    why: 'gaBandW raised until bandBase support (1.8*bandW) covers ssLo, so ALL THREE addends are live and the reordered association is exercised',
    params: { ...DEF, gaBandW: 0.45, gaSpring: 0.02, gaArchHeight: 0.35 },
  },
  {
    name: 'D1-OVERLAP-2',
    why: 'same mechanism, different corner: huge bands + shallow arch',
    params: { ...DEF, gaBandW: 0.9, gaSpring: 0.0, gaArchHeight: 0.1, gaSharp: 1 },
  },
  { name: 'D2-WT-CLAMP', why: 'gaX != 0 opens the T5 branch AND gaCol tiny so 0.55*wX < EPS: shipped divides by EPS, twin by 0.55*wX', params: { ...DEF, gaX: 0.8, gaCol: 1e-9 } },
  { name: 'T5-XTRACERY', why: 'gaX != 0 alone — the T5 branch is DEAD at defaults and has never been checked by the runtime guard', params: { ...DEF, gaX: 0.7 } },
  { name: 'D3-BELL', why: 'bellAmp != 0 — shipped baseRadius applies a bell the twin does not implement at all', params: { ...DEF, bellAmp: 0.3 } },
  { name: 'EXPN', why: 'expn != 1 disables the Math.pow(t,1)===t specialisation', params: { ...DEF }, dims: { H: 120, Rb: 40, Rt: 50, expn: 1.7 } },
  { name: 'ZERO-DIAMOND-BANDS', why: 'diamond=0 and bands=0 make whole terms exactly zero — the signed-zero corners', params: { ...DEF, gaDiamond: 0, gaBands: 0 } },
  { name: 'SHARP-FRACTIONAL', why: 'non-integer sharp exercises pow(+0, y) and the ridgeAt short-circuit', params: { ...DEF, gaSharp: 2.5, gaX: 0.4 } },
  { name: 'N1', why: 'gaCounts=1 makes the bay period 2*pi — the seam lands on the lattice column exactly', params: { ...DEF, gaCounts: 1 } },
];

const hdr = 'arm                  fastUsed  latticeDiffs |  randomDiffs / N        worstUlp   worstAbs   |  advDiffs / N   | GUARD';
log(''); log(hdr); log('-'.repeat(hdr.length));

for (const arm of ARMS) {
  const dims = arm.dims ?? DIMS;
  const shipped = buildRadiusFn('GothicArches' as never, arm.params, dims);
  const fast = buildFastRadiusFn('GothicArches', arm.params, dims, dims.H);
  if (fast === null) { log(`${arm.name.padEnd(20)} NO TWIN`); continue; }

  // (a) the runtime guard's own verdict, computed exactly as buildAuditRadiusFn computes it
  const aud = buildAuditRadiusFn('GothicArches', arm.params, dims, dims.H);
  const lat = radiusLattice(dims.H, [], []);
  let latDiffs = 0;
  for (let i = 0; i < lat.th.length; i += 1) {
    if (!Object.is(fast(lat.th[i], lat.z[i]), shipped(lat.th[i], lat.z[i]))) latDiffs += 1;
  }

  // (b) a large uniform-random sample — deterministic LCG so the run reproduces
  let s = 0x9e3779b9 >>> 0;
  const rnd = (): number => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  let rDiffs = 0; let worstUlp = 0; let worstAbs = 0; let worstTh = 0; let worstZ = 0;
  for (let k = 0; k < NRAND; k += 1) {
    const th = rnd() * 2 * Math.PI; const z = rnd() * dims.H;
    const a = fast(th, z); const b = shipped(th, z);
    if (!Object.is(a, b)) {
      rDiffs += 1;
      const u = ulps(a, b); const ab = Math.abs(a - b);
      if (u > worstUlp) worstUlp = u;
      if (ab > worstAbs) { worstAbs = ab; worstTh = th; worstZ = z; }
    }
  }

  // (c) the adversarial boundary set
  const adv = adversarialPoints(arm.params);
  let aDiffs = 0; let aWorstAbs = 0;
  for (const [th, z] of adv) {
    const a = fast(th, z); const b = shipped(th, z);
    if (!Object.is(a, b)) { aDiffs += 1; aWorstAbs = Math.max(aWorstAbs, Math.abs(a - b)); }
  }

  // *** THE GUARD VERDICT: differs somewhere but the lattice does not see it => the guard is UNSOUND.
  const differs = rDiffs > 0 || aDiffs > 0;
  const guard = !differs ? 'n/a (identical)'
    : latDiffs > 0 ? 'HOLDS (falls back)'
      : '*** BREACHED — differs but lattice sees 0 ***';
  log(`${arm.name.padEnd(20)} ${String(aud.fastUsed).padEnd(9)} ${String(latDiffs).padStart(12)} | ${String(rDiffs).padStart(9)} / ${NRAND}  ${String(worstUlp).padStart(9)} ${worstAbs.toExponential(2).padStart(10)}   | ${String(aDiffs).padStart(6)} / ${adv.length}  | ${guard}`);
  if (rDiffs > 0) log(`${' '.repeat(20)}   worst-abs at theta ${worstTh.toFixed(12)} z ${worstZ.toFixed(12)}  (${(100 * rDiffs / NRAND).toFixed(6)}% of samples)`);
  appendFileSync(OUT, `${JSON.stringify({
    arm: arm.name, why: arm.why, params: arm.params, dims,
    fastUsed: aud.fastUsed, fastDiffsReportedByGuard: aud.fastDiffs, latticeDiffs: latDiffs,
    randomN: NRAND, randomDiffs: rDiffs, worstUlp, worstAbs, worstTh, worstZ,
    advN: adv.length, advDiffs: aDiffs, advWorstAbs: aWorstAbs, guard,
  })}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// 3b — THE `distPerp` SEEDING-GRID MEMOISATION: CAN TWO DIFFERENT SURFACES SHARE ONE CLOSURE OBJECT?
// ═══════════════════════════════════════════════════════════════════════════════════════════════════
// `perpSeedCache = new WeakMap<RadiusFn, Map<'H|nu|nv', PerpSeedGrid>>()`. The cache is CORRECT iff
// (function identity, H, nu, nv) determines the grid — i.e. iff a given rA object always evaluates the
// same way. Three ways that could fail, all tested below:
//   A. two builds with DIFFERENT params returning the SAME object (interning / memoised builder)
//   B. one object whose captured state is MUTATED after construction (the builder aliases the caller's
//      params object instead of snapshotting it)
//   C. one object whose result depends on a GLOBAL that changes between calls
log('');
log('═══ 3b — perpSeedGrid WeakMap: identity vs surface ═══');
{
  const pA = { ...DEF }; const pB = { ...DEF, gaRelief: 3.0 };
  const rA1 = buildRadiusFn('GothicArches' as never, pA, DIMS) as unknown as RadiusFn;
  const rA2 = buildRadiusFn('GothicArches' as never, pA, DIMS) as unknown as RadiusFn;
  const rB = buildRadiusFn('GothicArches' as never, pB, DIMS) as unknown as RadiusFn;
  log(`  A. same params, two builds -> same object?  ${rA1 === rA2}   (must be false, or two surfaces could share a cache slot)`);
  log(`     different params        -> same object?  ${(rA1 as unknown) === (rB as unknown)}   (must be false)`);
  const gA = perpSeedGrid(rA1, H, 180, 120); const gB = perpSeedGrid(rB, H, 180, 120);
  log(`     grids are distinct objects: ${gA !== gB}; grid[0] differs: ${gA.x[0] !== gB.x[0]}  (${gA.x[0].toFixed(9)} vs ${gB.x[0].toFixed(9)})`);
  log(`     same rA, SAME (H,nu,nv) -> cache hit (same object): ${perpSeedGrid(rA1, H, 180, 120) === gA}`);
  log(`     same rA, DIFFERENT H    -> distinct grid:            ${perpSeedGrid(rA1, 60, 180, 120) !== gA}`);
  log(`     same rA, DIFFERENT nu   -> distinct grid:            ${perpSeedGrid(rA1, H, 360, 120) !== gA}`);

  // B. MUTATION AFTER CONSTRUCTION — does buildRadiusFn snapshot its params?
  const pMut: Record<string, number> = { ...DEF };
  const rMut = buildRadiusFn('GothicArches' as never, pMut, DIMS) as unknown as RadiusFn;
  const before = rMut(0.7, 60);
  pMut.gaRelief = 9.0;
  const after = rMut(0.7, 60);
  log(`  B. mutate the caller's params object after the build: rA(0.7,60) ${before.toFixed(12)} -> ${after.toFixed(12)}  ${before === after ? 'SNAPSHOT (safe)' : '*** ALIASED — the same closure IS two surfaces ***'}`);

  // C. THE HAZARD, DEMONSTRATED ON PURPOSE: a closure that reads mutable state defeats the cache.
  // Nothing in the library forbids this; the cache's correctness is a property of every CALLER.
  let knob = 1;
  const rHaz: RadiusFn = (th: number, z: number) => 45 + knob * Math.sin(th) + 0 * z;
  const g1 = perpSeedGrid(rHaz, H, 8, 4);
  knob = 5;
  const g2 = perpSeedGrid(rHaz, H, 8, 4);
  log(`  C. a closure reading mutable state: grid rebuilt after the state changed? ${g1 !== g2}  -> ${g1 === g2 ? '*** STALE GRID SERVED (the hazard is real for such a caller) ***' : 'rebuilt'}`);
  log(`     stale grid x[1] ${g2.x[1].toFixed(9)} vs a fresh build ${(45 + 5 * Math.sin((2 * Math.PI) / 8)) * Math.cos((2 * Math.PI) / 8) === 0 ? '' : ''}${((45 + 5 * Math.sin((2 * Math.PI) / 8)) * Math.cos((2 * Math.PI) / 8)).toFixed(9)}`);
}
log('');
log('done');
