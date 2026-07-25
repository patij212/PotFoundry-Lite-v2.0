// _strataJumpProbe.test.ts — classify a suspected discontinuity at a named (θ,z) locus. PF_STRATA_JUMP=1.
//
// WHY THIS EXISTS. Barycentric area sampling cannot certify a tolerance against an h⁰ (C0 jump) feature: once the
// mesh has conformed toward the locus, the wedge of "other side" still trapped inside a triangle has width δ→0 but
// height = the FULL jump magnitude. A sampling grid finds it with probability ~δ/h → 0. That is exactly how
// BasketWeave read MAX 5.000 µm on the adaptive grid (n=13) and MAX 1987.566 µm on the fixed grid (n=12) for the
// SAME mesh — near-identical densities, 400× apart, because one grid landed a sample in the wedge and the other
// stepped over it. Sampling only ever UNDER-estimates, so the larger reading is the true one and the spread is a
// FINDING, not noise.
//
// This probe answers the question the mesher's rulers cannot: is the locus a JUMP (h⁰, needs a curtain), a CREASE
// (h¹, conforming handles it), or SMOOTH (h², density handles it)? It uses the same two-scale test as the mesher's
// detector, but swept over a dense window and in every direction — no mesh involved.
import { describe, it } from 'vitest';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_JUMP === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = 120;
const TWO_PI = 2 * Math.PI;

function envF(n: string, d: number): number {
  const r = process.env[n];
  if (r === undefined) return d;
  const v = Number.parseFloat(r);
  return Number.isFinite(v) ? v : d;
}
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

describe('STRATA jump probe', () => {
  it.runIf(RUN)('classifies the discontinuity class at a named locus', () => {
    const STYLE = process.env.PF_JUMP_STYLE ?? 'BasketWeave';
    const th0 = envF('PF_JUMP_THETA', 3.5362);
    const z0 = envF('PF_JUMP_Z', 66.6);
    const win = envF('PF_JUMP_WIN', 0.6); // half-window in mm (physical) around the locus
    const N = Math.round(envF('PF_JUMP_N', 400));
    const params = registryDefaults(STYLE);
    const rA = buildRadiusFn(STYLE as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const R = (t: number, z: number): number => rA(canon(t), Math.min(H, Math.max(0, z)));

    // LINE MODE: scan r along a segment given by FULL-PRECISION endpoints. This is the instrument that window mode
    // cannot replace: a lattice probe steps over any feature narrower than its own spacing, which is exactly how a
    // ±0.6 mm / 4 µm-lattice window reported "smooth" over a region provably containing a 2 mm excursion. A dense
    // 1-D scan along the offending edge resolves width AND class (jump vs narrow smooth trough) in one shot.
    const lineSpec = process.env.PF_JUMP_LINE;
    if (lineSpec !== undefined) {
      const v = lineSpec.split(',').map((x) => Number.parseFloat(x));
      const [t0, za, t1, zb] = [v[0], v[1], v[2], v[3]];
      const M = Math.round(envF('PF_JUMP_LINEN', 200000));
      const rAt = (u: number): number => R(t0 + (t1 - t0) * u, za + (zb - za) * u);
      const rEnd0 = rAt(0); const rEnd1 = rAt(1);
      const base = 0.5 * (rEnd0 + rEnd1);
      let lo = Infinity; let hi = -Infinity; let uLo = 0; let uHi = 0;
      let excursion = 0; // samples deviating > 0.05 mm from the endpoint baseline
      for (let k = 0; k <= M; k += 1) {
        const u = k / M; const r = rAt(u);
        if (r < lo) { lo = r; uLo = u; }
        if (r > hi) { hi = r; uHi = u; }
        if (Math.abs(r - base) > 0.05) excursion += 1;
      }
      // physical length of the segment and of the excursion band
      const P0 = [rEnd0 * Math.cos(t0), rEnd0 * Math.sin(t0), za];
      const P1 = [rEnd1 * Math.cos(t1), rEnd1 * Math.sin(t1), zb];
      const segLen = Math.hypot(P1[0] - P0[0], P1[1] - P0[1], P1[2] - P0[2]);
      const bandMm = (excursion / M) * segLen;
      // two-scale class test AT the extremum (whichever deviates more from the baseline)
      const uStar = Math.abs(lo - base) > Math.abs(hi - base) ? uLo : uHi;
      const cls: string[] = [];
      for (const frac of [1e-3, 1e-4, 1e-5, 1e-6]) {
        const d = frac;
        const c = rAt(uStar);
        const big = Math.abs(rAt(Math.min(1, uStar + d)) - 2 * c + rAt(Math.max(0, uStar - d)));
        cls.push(`  |Δ²r| at ±${(d * segLen * 1000).toFixed(3)}µm = ${(big * 1000).toFixed(3)}µm`);
      }
      // eslint-disable-next-line no-console
      console.log([
        '',
        `===== LINE SCAN: ${STYLE} =====`,
        `  from (θ=${t0}, z=${za}) to (θ=${t1}, z=${zb})   segment length ${(segLen * 1000).toFixed(1)} µm, ${M} samples (${((segLen * 1e6) / M).toFixed(2)} nm pitch)`,
        `  r at endpoints: ${rEnd0.toFixed(9)} / ${rEnd1.toFixed(9)}`,
        `  r min ${lo.toFixed(9)} @u=${uLo.toFixed(6)}   max ${hi.toFixed(9)} @u=${uHi.toFixed(6)}   EXCURSION ${((hi - lo) * 1000).toFixed(2)} µm`,
        `  samples >0.05mm off the endpoint baseline: ${excursion}/${M}  ⇒ feature width ≈ ${(bandMm * 1000).toFixed(2)} µm`,
        '  second-difference ladder at the extremum (a JUMP holds its value as the step shrinks; smooth ∝ step²):',
        ...cls,
        '=========================================================',
        '',
      ].join('\n'));
      return;
    }

    // TRIANGLE MODE: reconstruct a specific reported triangle from its printed (θ,z) vertices and re-measure its
    // plane sag on a dense barycentric grid, reporting WHERE the maximum sits and how much r actually varies over
    // the footprint. This separates "the mesher found a real defect" from "the ruler produced a bogus number":
    // a smooth patch cannot deviate from its own chord plane by more than r varies across it.
    const triSpec = process.env.PF_JUMP_TRI;
    if (triSpec !== undefined) {
      const v = triSpec.split(',').map((x) => Number.parseFloat(x));
      const th = [v[0], v[2], v[4]]; const zz = [v[1], v[3], v[5]];
      const P = (t: number, z: number): [number, number, number] => { const r = R(t, z); return [r * Math.cos(t), r * Math.sin(t), z]; };
      const A = P(th[0], zz[0]); const B = P(th[1], zz[1]); const C = P(th[2], zz[2]);
      let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
      let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
      let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      const nl = Math.hypot(nx, ny, nz);
      nx /= nl; ny /= nl; nz /= nl;
      const eL = [Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]), Math.hypot(B[0] - C[0], B[1] - C[1], B[2] - C[2]), Math.hypot(C[0] - A[0], C[1] - A[1], C[2] - A[2])];
      const M = Math.round(envF('PF_JUMP_TRIN', 600));
      let worst = 0; let wWa = 0; let wWb = 0;
      let rMin = Infinity; let rMax = -Infinity;
      for (let i = 0; i <= M; i += 1) for (let j = 0; j <= M - i; j += 1) {
        const wa = i / M; const wb = j / M; const wc = 1 - wa - wb;
        const t = wa * th[0] + wb * th[1] + wc * th[2];
        const z = wa * zz[0] + wb * zz[1] + wc * zz[2];
        const r = R(t, z);
        if (r < rMin) rMin = r; if (r > rMax) rMax = r;
        const d = Math.abs((r * Math.cos(t) - A[0]) * nx + (r * Math.sin(t) - A[1]) * ny + (z - A[2]) * nz);
        if (d > worst) { worst = d; wWa = wa; wWb = wb; }
      }
      // eslint-disable-next-line no-console
      console.log([
        '',
        `===== TRIANGLE RE-MEASURE: ${STYLE} =====`,
        `  vertices (θ,z): ${th.map((x, k) => `(${x},${zz[k]})`).join(' ')}`,
        `  3D edge lengths (µm): ${eL.map((x) => (x * 1000).toFixed(1)).join(' / ')}   area ${(0.5 * nl * 1e6).toFixed(0)} µm²`,
        `  r over the footprint: min ${rMin.toFixed(6)} max ${rMax.toFixed(6)} ⇒ SPREAD ${((rMax - rMin) * 1000).toFixed(2)} µm`,
        `  dense (${M}×${M}) plane sag MAX ${(worst * 1000).toFixed(3)} µm at barycentric (${wWa.toFixed(3)}, ${wWb.toFixed(3)})`,
        `  VERDICT: a plane sag can never exceed the r-spread by much on a smooth patch — ${worst * 1000 > 5 * (rMax - rMin) * 1000 + 10 ? 'REAL FEATURE' : 'the big reading was a RULER ARTIFACT'}`,
        '=========================================================',
        '',
      ].join('\n'));
      return;
    }

    const rC = R(th0, z0);
    // Scan a (arc, z) window. For every sample, take the max |Δr| across the 4 neighbours at scale d, and again at
    // d/8. A TRUE C0 jump keeps its magnitude at both scales (ratio → 1); a crease halves (→ 0.5); smooth → 0.125.
    const d1 = (2 * win) / N;
    const d2 = d1 / 8;
    const dth = (m: number): number => m / rC;
    let best = 0; let bTh = 0; let bZ = 0; let bRatio = 0; let bDirDeg = 0;
    let jumpCells = 0; let creaseCells = 0;
    const jumpMags: number[] = [];
    for (let i = 0; i <= N; i += 1) {
      const a = -win + (2 * win * i) / N;
      for (let j = 0; j <= N; j += 1) {
        const b = -win + (2 * win * j) / N;
        const t = th0 + dth(a); const z = z0 + b;
        let m1 = 0; let m1dir = 0;
        for (let k = 0; k < 4; k += 1) {
          const ang = (Math.PI * k) / 4;
          const ca = Math.cos(ang); const sa = Math.sin(ang);
          const v = Math.abs(R(t + dth(ca * d1), z + sa * d1) - R(t - dth(ca * d1), z - sa * d1));
          if (v > m1) { m1 = v; m1dir = (ang * 180) / Math.PI; }
        }
        if (m1 < 1e-9) continue;
        const ca = Math.cos((m1dir * Math.PI) / 180); const sa = Math.sin((m1dir * Math.PI) / 180);
        // BUGFIX (measured): the old test compared a ±d1 stencil against a ±d1/8 stencil CENTRED ON THE LATTICE
        // POINT. A jump is straddled by the coarse stencil whenever the lattice point is within d1 of it (always,
        // since the lattice pitch IS d1) but by the fine stencil only within d1/8 — ~12% of the time. When the
        // coarse straddled and the fine did not, ratio ≈ 0 fell through BOTH branches and the jump was counted as
        // NOTHING. That is how a ±0.6 mm window reported "smooth" over a provable 1990 µm BasketWeave jump.
        // Correct method: LOCATE the feature by bracket-halving along the probe direction (the mesher's own
        // locateKink), then evaluate both scales CENTRED ON THE FEATURE so they always straddle it.
        let m2 = 0; let ratio = 0;
        if (m1 > 0.01) {
          let lo = -d1; let hi = d1;
          const rAtS = (u: number): number => R(t + dth(ca * u), z + sa * u);
          let fLo = rAtS(lo); let fHi = rAtS(hi); let fMid = rAtS(0);
          for (let it = 0; it < 26; it += 1) {
            const mid = 0.5 * (lo + hi); const q1 = 0.5 * (lo + mid); const q3 = 0.5 * (mid + hi);
            const fq1 = rAtS(q1); const fq3 = rAtS(q3);
            const dL = Math.abs(fLo - 2 * fq1 + fMid); const dR = Math.abs(fMid - 2 * fq3 + fHi);
            if (dL >= dR) { hi = mid; fHi = fMid; fMid = fq1; } else { lo = mid; fLo = fMid; fMid = fq3; }
          }
          const uStar = 0.5 * (lo + hi);
          const c0 = rAtS(uStar);
          const big = Math.abs(rAtS(uStar + d1) - 2 * c0 + rAtS(uStar - d1));
          const small = Math.abs(rAtS(uStar + d1 / 8) - 2 * c0 + rAtS(uStar - d1 / 8));
          ratio = big > 1e-12 ? small / big : 0;
          m2 = small;
          // census on the COARSE magnitude, never on the ratio — a large m1 is a feature by definition
          if (ratio > 0.62) { jumpCells += 1; jumpMags.push(big); } else if (ratio > 0.2) creaseCells += 1;
          if (big > best) { best = big; bTh = t; bZ = z; bRatio = ratio; bDirDeg = m1dir; }
        } else {
          m2 = Math.abs(R(t + dth(ca * d2), z + sa * d2) - R(t - dth(ca * d2), z - sa * d2));
          ratio = m2 / m1;
          if (m2 > best) { best = m2; bTh = t; bZ = z; bRatio = ratio; bDirDeg = m1dir; }
        }
      }
    }
    jumpMags.sort((x, y) => y - x);
    const cls = bRatio > 0.62 ? 'C0 JUMP (h⁰ — needs a CURTAIN)' : bRatio > 0.2 ? 'CREASE (h¹ — conforming handles it)' : 'SMOOTH (h² — density handles it)';
    // eslint-disable-next-line no-console
    console.log([
      '',
      `===== JUMP PROBE: ${STYLE} @ θ=${th0} z=${z0}, ±${win}mm, ${N}×${N} =====`,
      `params ${JSON.stringify(params)}`,
      `  worst |Δr| at the FINE scale (${(d2 * 1000).toFixed(2)} µm step): ${(best * 1000).toFixed(1)} µm`,
      `  at θ=${bTh.toFixed(5)} z=${bZ.toFixed(4)}, probe direction ${bDirDeg.toFixed(0)}° from arc-axis`,
      `  two-scale ratio (fine/coarse) = ${bRatio.toFixed(3)}   ⇒  ${cls}`,
      `  window census (|Δr| > 10 µm): ${jumpCells} JUMP-class cells, ${creaseCells} CREASE-class cells`,
      `  jump magnitudes: max ${(1000 * (jumpMags[0] ?? 0)).toFixed(1)} µm, median ${(1000 * (jumpMags[Math.floor(jumpMags.length / 2)] ?? 0)).toFixed(1)} µm`,
      '=========================================================',
      '',
    ].join('\n'));
  }, 3_000_000);
});
