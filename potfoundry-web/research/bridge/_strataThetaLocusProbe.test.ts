// _strataThetaLocusProbe.test.ts — fast probe: GENERIC θ-jump locus detection + branch measurement.
// Gated PF_STRATA_TLP=1. RESEARCH ONLY.
//
// Purpose (pre-flight for the θ-curtain): prove, with numbers and no per-style code, that
//   (a) a two-scale ladder in θ classifies BasketWeave's loci as h0 JUMPs,
//   (b) the loci land at θ = 2πk/16 (recovered, not assumed) and coincide with grid columns at gu=208,
//   (c) the two branches r(θ*−ε) / r(θ*+ε) are ε-stable across 7 orders of ε (so ε=1e-9 is safe),
//   (d) the minimum branch separation over the meshed z-bands stays above the 0.05 µm weld radius.
import { describe, it } from 'vitest';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_TLP === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;
const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

describe('STRATA θ-locus probe', () => {
  // ── SWEEP MODE (PF_TLP_ALL=1): run the SAME generic detector over every registry style at registry defaults.
  // This is the regression guard for the θ-curtain: a style with 0 detected θ-jump loci gets 0 curtain triangles,
  // so the mechanism is provably a no-op there and the already-closed rows cannot move.
  it.runIf(RUN && process.env.PF_TLP_ALL === '1')('sweeps every registry style for θ-jump loci', () => {
    const rows: string[] = ['', '===== θ-JUMP LOCUS SWEEP — all registry styles, registry defaults ====='];
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const NZ = 23; const zProbes: number[] = [];
    for (let k = 1; k <= NZ; k += 1) zProbes.push((H * k) / (NZ + 1));
    for (const id of Object.keys(STYLE_REGISTRY)) {
      let rA: (th: number, z: number) => number;
      try { rA = buildRadiusFn(id as StyleId, registryDefaults(id), DIMS); } catch { rows.push(`  ${id.padEnd(22)} — no radius fn`); continue; }
      const R = (th: number, z: number): number => rA(canon(th), z);
      const nT = 4096; const d1 = TWO_PI / nT; const d2 = d1 / 8;
      let nBrk = 0; let prevIn = false; let maxJump = 0;
      for (let i = 0; i <= nT; i += 1) {
        const th = (TWO_PI * i) / nT;
        let j1 = 0; let j2 = 0;
        for (const z of zProbes) {
          j1 = Math.max(j1, Math.abs(R(th + d1, z) - R(th - d1, z)));
          j2 = Math.max(j2, Math.abs(R(th + d2, z) - R(th - d2, z)));
        }
        const isIn = j2 > 0.8 * j1 && j1 > 0.01;
        if (isIn && !prevIn) nBrk += 1;
        if (isIn) maxJump = Math.max(maxJump, j2);
        prevIn = isIn;
      }
      rows.push(`  ${id.padEnd(22)} θ-jump loci ${String(nBrk).padStart(3)}${nBrk > 0 ? `   max |Δr| ${(maxJump * 1000).toFixed(1)} µm  ⇒ NEEDS A θ-CURTAIN` : '   ⇒ curtain is a NO-OP'}`);
    }
    rows.push('=========================================================', '');
    // eslint-disable-next-line no-console
    console.log(rows.join('\n'));
  }, 900_000);

  it.runIf(RUN && process.env.PF_TLP_ALL !== '1')('detects θ-jump loci generically and measures branch stability', () => {
    const STYLE = process.env.PF_TLP_STYLE ?? 'BasketWeave';
    const gu = Number.parseInt(process.env.PF_TLP_GRIDU ?? '208', 10);
    const params = registryDefaults(STYLE);
    const rA = buildRadiusFn(STYLE as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const R = (th: number, z: number): number => rA(canon(th), z);
    const out: string[] = ['', `===== θ-LOCUS PROBE: ${STYLE} =====`, `params ${JSON.stringify(params)}`];

    // ── z probes (generic: spread over the interior, avoid the exact ends) ──
    const NZ = 23;
    const zProbes: number[] = [];
    for (let k = 1; k <= NZ; k += 1) zProbes.push((H * k) / (NZ + 1));

    // ── STAGE 1: coarse θ scan for scale-invariant |Δr| (the h0 signature) ──
    const nT = 8192; const d1 = TWO_PI / nT; const d2 = d1 / 8;
    const runs: Array<[number, number]> = []; // [thStart, thEnd] brackets
    let runStart = -1; let prevIn = false;
    const TOLMM = 0.01;
    for (let i = 0; i <= nT; i += 1) {
      const th = (TWO_PI * i) / nT;
      let j1 = 0; let j2 = 0;
      for (const z of zProbes) {
        j1 = Math.max(j1, Math.abs(R(th + d1, z) - R(th - d1, z)));
        j2 = Math.max(j2, Math.abs(R(th + d2, z) - R(th - d2, z)));
      }
      const isIn = j2 > 0.8 * j1 && j1 > TOLMM;
      if (isIn && !prevIn) runStart = th - d1;
      if (!isIn && prevIn) runs.push([runStart, th + d1]);
      prevIn = isIn;
    }
    if (prevIn) runs.push([runStart, TWO_PI + d1]);
    out.push(`stage1: ${runs.length} jump brackets in θ (scan ${nT}, probes ${NZ})`);

    // ── STAGE 2: bisect each bracket to machine precision ──
    const loci: number[] = [];
    for (const [a0, b0] of runs) {
      let lo = a0; let hi = b0;
      const jumpAt = (x: number, y: number): number => {
        let m = 0;
        for (const z of zProbes) m = Math.max(m, Math.abs(R(y, z) - R(x, z)));
        return m;
      };
      for (let it = 0; it < 70; it += 1) {
        const mid = 0.5 * (lo + hi);
        if (mid <= lo || mid >= hi) break;
        if (jumpAt(lo, mid) >= jumpAt(mid, hi)) hi = mid; else lo = mid;
      }
      loci.push(0.5 * (lo + hi));
    }
    out.push(`stage2: ${loci.length} loci`);
    const kOf = (th: number): number => (th * 16) / TWO_PI;
    out.push(`  θ*: ${loci.slice(0, 20).map((t) => t.toFixed(9)).join(' ')}${loci.length > 20 ? ' …' : ''}`);
    out.push(`  θ*·strands/2π (should be integers if the style is a k/16 tiling): ${loci.slice(0, 20).map((t) => kOf(t).toFixed(6)).join(' ')}`);
    const colIdx = loci.map((t) => (t * gu) / TWO_PI);
    out.push(`  grid-column index at gu=${gu}: ${colIdx.slice(0, 20).map((c) => c.toFixed(6)).join(' ')}`);
    const maxColErr = Math.max(...colIdx.map((c) => Math.abs(c - Math.round(c))));
    out.push(`  MAX |colIdx − round(colIdx)| = ${maxColErr.toExponential(3)}  ⇒ ${maxColErr < 1e-6 ? 'ON-GRID' : 'OFF-GRID'}`);

    // ── STAGE 3: two-scale class ladder AT each locus (jump ⇒ ratio → 1, crease ⇒ → 10 per decade) ──
    // ε-LIMIT VERDICT PER LOCUS FIRST. A coarse d/d/8 bracket scan OVER-REPORTS: it fires wherever |Δr| happens not
    // to shrink between two finite windows, which a very sharp CREASE can do. The only sound test is the ε→0 limit:
    // a jump keeps |r(θ*+ε) − r(θ*−ε)| ≥ tol as ε → 0, a crease drives it to 0 linearly. Test EVERY locus at the z
    // that maximises it, not at one arbitrary z.
    const jAt = (th: number, e: number): [number, number] => {
      let m = 0; let za = 0;
      for (const z of zProbes) { const d = Math.abs(R(th + e, z) - R(th - e, z)); if (d > m) { m = d; za = z; } }
      return [m, za];
    };
    let nTrueJump = 0; let nRejected = 0; let bestLocus = loci[0] ?? 0; let bestZ = 6.0; let bestJ = 0;
    const verdicts: string[] = [];
    for (const th of loci) {
      const [j9, z9] = jAt(th, 1e-9); const [j6] = jAt(th, 1e-6); const [j3] = jAt(th, 1e-3);
      const isJump = j9 > 0.01 && j9 > 0.5 * j3;
      if (isJump) { nTrueJump += 1; if (j9 > bestJ) { bestJ = j9; bestLocus = th; bestZ = z9; } } else nRejected += 1;
      if (verdicts.length < 6) verdicts.push(`   θ*=${th.toFixed(9)}  |Δr|@ε=1e-3 ${(j3 * 1000).toFixed(3)} µm → 1e-6 ${(j6 * 1000).toFixed(3)} → 1e-9 ${(j9 * 1000).toFixed(3)}  ⇒ ${isJump ? 'JUMP (h0)' : 'NOT A JUMP (crease/artifact) — REJECT'}`);
    }
    out.push(`stage3a: ε-limit verdict — ${nTrueJump}/${loci.length} brackets are TRUE h0 jumps, ${nRejected} rejected`);
    out.push(...verdicts);
    const EPS_LIST = [1e-4, 1e-5, 1e-6, 1e-7, 1e-8, 1e-9, 1e-10, 1e-11];
    const zT = bestZ;
    const th0 = bestLocus;
    out.push(`stage3b: class ladder at the WORST locus θ*=${th0.toFixed(9)}, z=${zT.toFixed(4)} (argmax over z probes)`);
    let prevD = 0;
    for (const e of EPS_LIST) {
      const rm = R(th0 - e, zT); const rp = R(th0 + e, zT);
      const d = Math.abs(rp - rm);
      out.push(`   ε=${e.toExponential(0)}  r−=${rm.toPrecision(17)}  r+=${rp.toPrecision(17)}  |Δ|=${(d * 1000).toFixed(6)} µm  ratio(prev/this)=${prevD > 0 ? (prevD / d).toFixed(6) : 'n/a'}`);
      prevD = d;
    }
    // branch drift over the ε window: how much does each branch MOVE between ε=1e-11 and ε=1e-6?
    const drM = Math.abs(R(th0 - 1e-6, zT) - R(th0 - 1e-11, zT));
    const drP = Math.abs(R(th0 + 1e-6, zT) - R(th0 + 1e-11, zT));
    out.push(`   branch drift over ε∈[1e-11,1e-6]:  r− ${(drM * 1e6).toFixed(3)} nm   r+ ${(drP * 1e6).toFixed(3)} nm`);
    out.push(`   value AT the locus  R(θ*)=${R(th0, zT).toPrecision(17)}  (= r+ ? ${Math.abs(R(th0, zT) - R(th0 + 1e-9, zT)) < 1e-6}, = r− ? ${Math.abs(R(th0, zT) - R(th0 - 1e-9, zT)) < 1e-6})`);

    // ── STAGE 4: branch separation vs the 0.05 µm weld radius, over the meshed z-bands ──
    // Reproduce the harness's z-step detector to get the band bounds, then scan |Δr| inside each band.
    const zSteps: number[] = [];
    {
      const nZ = 12000; const e1 = H / nZ; const e2 = e1 / 8;
      const probes = [0.21, 1.03, 2.44, 3.77, 5.29];
      let run = -1; let bestJ2 = 0; let bestZ = 0;
      const flush = (): void => { if (run >= 0) { zSteps.push(bestZ); run = -1; bestJ2 = 0; } };
      for (let j = 1; j < nZ; j += 1) {
        const z = H * (j / nZ);
        let j1 = 0; let j2 = 0;
        for (const th of probes) {
          j1 = Math.max(j1, Math.abs(R(th, z + e1) - R(th, z - e1)));
          j2 = Math.max(j2, Math.abs(R(th, z + e2) - R(th, z - e2)));
        }
        if (j2 > 0.8 * j1 && j1 > TOLMM) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
      }
      flush();
    }
    const stepEps = 0.004;
    out.push(`stage4: z-steps ${zSteps.length} @ ${zSteps.map((z) => z.toFixed(4)).join(', ')}`);
    const bounds = [0, ...zSteps, H];
    let minSep = Infinity; let minSepAt = '';
    let maxSep = 0;
    for (let b = 0; b + 1 < bounds.length; b += 1) {
      const za = b === 0 ? 0 : bounds[b] + stepEps;
      const zb = b + 2 === bounds.length ? H : bounds[b + 1] - stepEps;
      if (zb <= za) continue;
      for (const th of loci) {
        for (let s = 0; s <= 200; s += 1) {
          const z = za + ((zb - za) * s) / 200;
          const d = Math.abs(R(th + 1e-9, z) - R(th - 1e-9, z));
          if (d > maxSep) maxSep = d;
          if (d < minSep) { minSep = d; minSepAt = `θ=${th.toFixed(6)} z=${z.toFixed(5)} (band ${b})`; }
        }
      }
    }
    out.push(`   branch separation over all loci × all band interiors: MIN ${(minSep * 1000).toFixed(4)} µm at ${minSepAt}   MAX ${(maxSep * 1000).toFixed(3)} µm`);
    out.push(`   weld radius 0.05 µm ⇒ margin ${(minSep * 1000 / 0.05).toFixed(1)}×  ${minSep * 1000 > 0.05 ? 'SAFE (curtain cannot weld shut)' : '*** UNSAFE ***'}`);
    out.push('=========================================================', '');
    // eslint-disable-next-line no-console
    console.log(out.join('\n'));
  }, 900_000);
});
