// s117CliffProbe.ts — S117 P4 CONTROL: IS rA ACTUALLY DISCONTINUOUS, OR IS maxGradR LYING?
//
// s117ApcrReach's STAGE A reports max|grad r| growing exactly as 1/h on some styles (ArtDeco:
// 209.78 -> 1049.36 -> 10494.70 -> 104948.10 for h = 1e-3, 2e-4, 2e-5, 2e-6 — the product
// max|grad r| * h is CONSTANT to 4 significant figures). That is the signature of a JUMP, but it is
// an inference from a finite-difference stencil, and a finite-difference stencil is exactly the kind
// of instrument that has fooled this campaign before (scar 3). So the jump is measured DIRECTLY here:
// bisect down onto the locus of the largest gradient and print the r profile across it.
//
// If rA is discontinuous, the profile is a step whose RISE is independent of the bracket width, and
// the bracket can be driven to the f64 floor without the rise shrinking. If rA is merely steep, the
// rise falls in proportion to the bracket.
//
// WHY THIS MATTERS FOR THE VERDICT. Two campaign instruments assume the surface is a LIPSCHITZ GRAPH
// with |grad r| <= L:
//    CEIL = 2*atan(L)  — the analytic fold ceiling; L -> inf makes CEIL -> 180 deg and the fold ruler
//                        VACUOUS (no dihedral can exceed it, so "zero folds" carries no information);
//    dist >= R1/sqrt(1+L^2) — the proven position lower bound; L -> inf makes it 0, i.e. vacuous.
// Both remain SOUND. Both become USELESS. A style with a jump must therefore be reported as
// ruler-limited, not as clean.
//
// Usage: bash research/tools/run-s117-cliff.sh
//   env PF_S117_STYLES(; separated) PF_S117_H PF_S117_RB PF_S117_RT PF_S117_TAG PF_S117_OUTDIR
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STYLES = envS('PF_S117_STYLES', 'GothicArches;ArtDeco;CelticTriquetra;HexagonalHive;SpiralRidges;Voronoi').split(';').filter((s) => s.length > 0);
const OUTDIR = envS('PF_S117_OUTDIR', 'research/exchange/_strataConformBisect/s117');
const TAG = envS('PF_S117_TAG', 'CLIFF');
const DIMS: StyleDims = { H: envF('PF_S117_H', 120), Rb: envF('PF_S117_RB', 40), Rt: envF('PF_S117_RT', 50), expn: 1 };
const H = DIMS.H;
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('===== S117 P4 CONTROL — IS rA DISCONTINUOUS? DIRECT BISECTION ONTO THE JUMP =====');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('');

interface Out { style: string; thJump: number; zJump: number; riseAtWide: number; riseAtTight: number; bracketWide: number; bracketTight: number; verdict: string; maxGradAtH: Record<string, number>; }
const outs: Out[] = [];

for (const STYLE of STYLES) {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
  if (cfg === undefined) { log(`   *** ${STYLE} not in registry, skipped ***`); continue; }
  const D: Record<string, number> = {};
  for (const g of [cfg.params, cfg.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
  const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
  const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

  log(`──────── ${STYLE} ────────`);
  // 1. the 1/h ladder, reproduced here independently of the operator tool
  const grads: Record<string, number> = {};
  let bestTh = 0; let bestZ = 0; let bestG = 0;
  for (const h of [1e-3, 2e-4, 2e-5, 2e-6]) {
    let g = 0; let gt = 0; let gz = 0;
    for (let i = 0; i < 400; i += 1) {
      const th = (i / 400) * 2 * Math.PI;
      for (let j = 0; j <= 400; j += 1) {
        const z = (j / 400) * H;
        const r0 = rA(th, z);
        const hTh = h / Math.max(1e-9, r0);
        const rt = (rA(th + hTh, z) - rA(th - hTh, z)) / (2 * h);
        const zl = Math.max(0, z - h * 10); const zh = Math.min(H, z + h * 10);
        const rz = zh > zl ? (rA(th, zh) - rA(th, zl)) / (zh - zl) : 0;
        const m = Math.hypot(rt, rz);
        if (m > g) { g = m; gt = th; gz = z; }
      }
    }
    grads[h.toExponential(0)] = g;
    log(`   h=${h.toExponential(3)}  max|grad r| ${g.toExponential(6)}   product |grad r|*h = ${(g * h).toExponential(6)}`);
    if (h === 2e-6) { bestTh = gt; bestZ = gz; bestG = g; }
  }
  const prods = Object.entries(grads).map(([k, v]) => v * Number(k));
  const prodSpread = Math.max(...prods) / Math.min(...prods);
  log(`   product spread across 4 decades of h: ${prodSpread.toFixed(4)}x   (1.0000 = a PERFECT jump; a smooth surface makes the product fall like h)`);

  // 2. bisect onto the jump ALONG WHICHEVER AXIS CARRIES THE GRADIENT.
  //    (An earlier version of this probe bisected in theta only and reported ArtDeco CONTINUOUS. That
  //     was a PROBE BUG, not a result: ArtDeco's gradient locus is a z-step, so a theta bracket never
  //     straddles it. The axis is now chosen by measuring both partials at the locus.)
  const z0 = bestZ;
  const hFine = 2e-6;
  const r00 = rA(bestTh, z0);
  const dTh = Math.abs(rA(bestTh + hFine / r00, z0) - rA(bestTh - hFine / r00, z0)) / (2 * hFine);
  const dZ = Math.abs(rA(bestTh, z0 + hFine * 10) - rA(bestTh, z0 - hFine * 10)) / (2 * hFine * 10);
  const axis: 'theta' | 'z' = dTh >= dZ ? 'theta' : 'z';
  log(`   worst locus theta=${bestTh.toFixed(6)} rad  z=${z0.toFixed(4)} mm   max|grad r| ${bestG.toExponential(4)}`);
  log(`   partials at the locus (h=2e-6): |dr/d(arc)| ${dTh.toExponential(4)}   |dr/dz| ${dZ.toExponential(4)}  =>  bisecting along ${axis.toUpperCase()}`);
  // param `u` is arc-mm along theta, or mm along z
  const at = (u: number): number => (axis === 'theta' ? rA(bestTh + u / r00, z0) : rA(bestTh, z0 + u));
  let lo = -1e-3; let hi = 1e-3;
  let rLo = at(lo); let rHi = at(hi);
  const bracketWide = hi - lo;
  const riseWide = Math.abs(rHi - rLo);
  log(`   bracket ${bracketWide.toExponential(3)} mm along ${axis}  ->  rise |dr| ${riseWide.toExponential(6)} mm`);
  for (let it = 0; it < 400; it += 1) {
    const mid = 0.5 * (lo + hi);
    if (mid === lo || mid === hi) break;
    const rm = at(mid);
    // keep the half that still straddles the biggest change
    if (Math.abs(rm - rLo) >= Math.abs(rHi - rm)) { hi = mid; rHi = rm; } else { lo = mid; rLo = rm; }
  }
  const bracketTight = hi - lo;
  const riseTight = Math.abs(rHi - rLo);
  // THE RAW NUMBERS. A ladder of max|grad r| is a stencil statistic and a stencil can be argued with
  // (a concurrent S117 tool reports CelticTriquetra's max|grad r| as CONVERGED at 6.844 — its grid
  // simply never lands a stencil across the jump). Two columns of rA VALUES cannot be argued with.
  const mid = 0.5 * (lo + hi);
  log('   rA PROFILE ACROSS THE LOCUS (raw evaluations, no stencil, no derivative):');
  log(`      offset from ${axis}=${(axis === 'theta' ? 0 : z0).toFixed(6)}${axis === 'theta' ? ' (arc mm)' : ' (mm)'}        rA (mm)`);
  for (const d of [-1e-1, -1e-2, -1e-3, -1e-6, -1e-9, -1e-12, 1e-12, 1e-9, 1e-6, 1e-3, 1e-2, 1e-1]) {
    log(`      ${(mid + d).toExponential(6).padStart(16)}   ${at(mid + d).toFixed(9)}`);
  }
  log(`   bracket arc ${bracketTight.toExponential(3)} mm (f64 floor)  ->  rise |dr| ${riseTight.toExponential(6)} mm`);
  const shrink = riseWide > 0 ? riseTight / riseWide : 0;
  const verdict = shrink > 0.5 && riseTight > 1e-4
    ? 'DISCONTINUOUS — the rise SURVIVES a bracket collapse of 12+ decades. rA is NOT a Lipschitz graph.'
    : shrink < 0.05 ? 'CONTINUOUS — the rise collapses with the bracket. rA is Lipschitz here.'
      : 'INDETERMINATE — report as UNKNOWN, do not quote a Lipschitz constant.';
  log(`   rise retained after collapsing the bracket by ${(bracketWide / Math.max(1e-300, bracketTight)).toExponential(2)}x: ${(shrink * 100).toFixed(4)}%`);
  log(`   *** ${verdict} ***`);
  if (verdict.startsWith('DISCONTINUOUS')) {
    log(`   => CEIL = 2*atan(L) is VACUOUS on ${STYLE} (L unbounded => CEIL -> 180 deg): a "zero folds over CEIL" result carries NO information.`);
    log(`   => dist >= R1/sqrt(1+L^2) is VACUOUS on ${STYLE} (bound -> 0): sound, but useless.`);
    log(`   => a mesh that is a GRAPH over the (theta,z) chart must contain RISER facets spanning the jump; their perpendicular`);
    log(`      distance to rA is bounded below by about half the rise (${(riseTight / 2).toExponential(3)} mm), so the >0.01 mm class CANNOT be cleared by ANY refinement.`);
  }
  log('');
  outs.push({ style: STYLE, thJump: bestTh, zJump: z0, riseAtWide: riseWide, riseAtTight: riseTight, bracketWide, bracketTight, verdict, maxGradAtH: grads });
}

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   SUMMARY — WHICH STYLES HAVE A LIPSCHITZ GRAPH, AND WHICH DO NOT');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   style             |grad r|*h spread   rise @ wide bracket   rise @ f64 bracket   verdict');
for (const o of outs) {
  const prods = Object.entries(o.maxGradAtH).map(([k, v]) => v * Number(k));
  const sp = Math.max(...prods) / Math.min(...prods);
  log(`   ${o.style.padEnd(17)} ${sp.toFixed(4).padStart(16)}x  ${o.riseAtWide.toExponential(4).padStart(20)}  ${o.riseAtTight.toExponential(4).padStart(19)}   ${o.verdict.split(' —')[0]}`);
}
writeFileSync(`${OUTDIR}/S117_CLIFF_${TAG}.json`, JSON.stringify(outs, null, 1));
log(`json -> ${OUTDIR}/S117_CLIFF_${TAG}.json`);
log('S117 CLIFF PROBE DONE');
