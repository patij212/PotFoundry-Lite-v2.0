// _strataBudgetProbe.test.ts — ANALYTIC feasibility probe for shape-agnostic closure (research-only, PF_STRATA_BUDGET=1).
//
// Question: for a style at REGISTRY DEFAULTS, what triangle budget does a *conformed* mesh need to hit 0.01mm MAX,
// and what does a *non-conformed* (pure density) mesh need? Answers without building a mesh, so it is seconds not
// minutes, and it tells us whether "conform + refine" is even on the table before we build it.
//
// Method (no meshing):
//   For each point x on a fine (θ,z) grid and each of D directions d:
//     ONE-SIDED chord sag over physical length h:  s1(h) = 0.5·|P(x+h·d) − 2·P(x+h/2·d) + P(x)|
//        — models a mesh VERTEX/EDGE sitting AT x (i.e. conformed) with the triangle extending along d.
//     TWO-SIDED (centred) chord sag over h:        s2(h) = 0.5·|P(x+h/2·d) − 2·P(x) + P(x−h/2·d)|
//        — models a triangle that STRADDLES x (i.e. NOT conformed).
//   Bisect for the largest h with sag ≤ ε.  h*_conf(x) = min_d h1(d);  h*_raw(x) = min_d h2(d).
//   Budget N ≈ Σ_cells 2·dA / h*²  (isotropic graded).  Anisotropic lower bound uses h_min·h_max.
//
// P(θ,z) = (rA·cosθ, rA·sinθ, z); "physical length" measured in the 3D tangent metric (arc = r·dθ).
import { describe, it } from 'vitest';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_BUDGET === '1';
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

describe('STRATA budget probe', () => {
  it.runIf(RUN)('estimates conformed vs raw triangle budget from the analytic surface', () => {
    const STYLE = process.env.PF_BUDGET_STYLE ?? 'GothicArches';
    const eps = envF('PF_BUDGET_TOL', 0.01);
    const NU = Math.round(envF('PF_BUDGET_NU', 720));
    const NV = Math.round(envF('PF_BUDGET_NV', 480));
    const D = Math.round(envF('PF_BUDGET_DIRS', 8));
    const params = registryDefaults(STYLE);
    const rA = buildRadiusFn(STYLE as StyleId, params, DIMS);

    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    // P at (theta,z)
    const P = (th: number, z: number, out: [number, number, number]): void => {
      const t = canon(th);
      const r = rA(t, z);
      out[0] = r * Math.cos(t); out[1] = r * Math.sin(t); out[2] = z;
    };
    const p0: [number, number, number] = [0, 0, 0];
    const pA: [number, number, number] = [0, 0, 0];
    const pB: [number, number, number] = [0, 0, 0];

    // physical step of length L along direction (cos ψ = arc, sin ψ = z) at radius r
    const HMAX = 4.0;
    const HMIN = 2e-4;

    // one-sided (conformed) sag of the segment x → x + L·d
    const sag1 = (th: number, z: number, ca: number, sa: number, L: number, r: number): number => {
      const dth = (ca * L) / Math.max(1e-6, r);
      const dz = sa * L;
      P(th, z, p0); P(th + dth / 2, z + dz / 2, pA); P(th + dth, z + dz, pB);
      return 0.5 * Math.hypot(pB[0] - 2 * pA[0] + p0[0], pB[1] - 2 * pA[1] + p0[1], pB[2] - 2 * pA[2] + p0[2]);
    };
    // two-sided (straddling / non-conformed) sag of the segment x − L/2·d → x + L/2·d
    const sag2 = (th: number, z: number, ca: number, sa: number, L: number, r: number): number => {
      const dth = (ca * L) / Math.max(1e-6, r);
      const dz = sa * L;
      P(th, z, p0); P(th - dth / 2, z - dz / 2, pA); P(th + dth / 2, z + dz / 2, pB);
      return 0.5 * Math.hypot(pB[0] - 2 * p0[0] + pA[0], pB[1] - 2 * p0[1] + pA[1], pB[2] - 2 * p0[2] + pA[2]);
    };
    const ITERS = Math.round(envF('PF_BUDGET_ITERS', 16));
    const solveH = (f: (L: number) => number): number => {
      if (f(HMAX) <= eps) return HMAX;
      let lo = HMIN;
      let hi = HMAX;
      if (f(lo) > eps) return HMIN;
      for (let i = 0; i < ITERS; i += 1) { const m = 0.5 * (lo + hi); if (f(m) <= eps) lo = m; else hi = m; }
      return lo;
    };

    let nConf = 0;
    let nRaw = 0;
    let nAniso = 0;
    let worstConfH = Infinity; let worstConfTh = 0; let worstConfZ = 0;
    let worstRawH = Infinity; let worstRawTh = 0; let worstRawZ = 0;
    // area-weighted histogram of h*_conf
    const bins = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 4];
    const areaBins = new Float64Array(bins.length + 1);
    const triBins = new Float64Array(bins.length + 1);

    for (let j = 0; j < NV; j += 1) {
      const z = (H * (j + 0.5)) / NV;
      for (let i = 0; i < NU; i += 1) {
        const th = (TWO_PI * (i + 0.5)) / NU;
        const r = rA(th, z);
        const dA = ((TWO_PI * r) / NU) * (H / NV);
        let hc = Infinity; let hcMax = 0; let hr = Infinity;
        for (let d = 0; d < D; d += 1) {
          const psi = (Math.PI * d) / D;
          const ca = Math.cos(psi); const sa = Math.sin(psi);
          // CONFORMED: the mesh has an edge ON every locus, so the triangles at x live inside ONE smooth cell of the
          // feature arrangement. A one-sided probe that happens to run INTO a nearby locus straddles it and reports a
          // spuriously tiny h. Taking max(+d, −d) picks the side that stays inside the cell — the honest conformed h.
          const h1 = Math.max(solveH((L) => sag1(th, z, ca, sa, L, r)), solveH((L) => sag1(th, z, -ca, -sa, L, r)));
          const h2 = solveH((L) => sag2(th, z, ca, sa, L, r));
          if (h1 < hc) hc = h1;
          if (h1 > hcMax) hcMax = h1;
          if (h2 < hr) hr = h2;
        }
        nConf += (2 * dA) / (hc * hc);
        nAniso += (2 * dA) / (hc * hcMax);
        nRaw += (2 * dA) / (hr * hr);
        if (hc < worstConfH) { worstConfH = hc; worstConfTh = th; worstConfZ = z; }
        if (hr < worstRawH) { worstRawH = hr; worstRawTh = th; worstRawZ = z; }
        let b = 0; while (b < bins.length && hc > bins[b]) b += 1;
        areaBins[b] += dA; triBins[b] += (2 * dA) / (hc * hc);
      }
    }
    const totArea = areaBins.reduce((a, b) => a + b, 0);
    const lines: string[] = [
      '',
      `===== BUDGET PROBE: ${STYLE} @ registry defaults, tol ${eps}mm, grid ${NU}x${NV}, ${D} dirs =====`,
      `params ${JSON.stringify(params)}`,
      `surface area ~${totArea.toFixed(0)} mm²`,
      `  NON-CONFORMED (pure density, straddling):  ${(nRaw / 1e6).toFixed(2)} M tris   worst h* ${(worstRawH * 1000).toFixed(1)}µm @ θ=${worstRawTh.toFixed(3)} z=${worstRawZ.toFixed(2)}`,
      `  CONFORMED     (vertex on every locus):     ${(nConf / 1e6).toFixed(2)} M tris   worst h* ${(worstConfH * 1000).toFixed(1)}µm @ θ=${worstConfTh.toFixed(3)} z=${worstConfZ.toFixed(2)}`,
      `  CONFORMED + ANISOTROPIC (h_min·h_max):     ${(nAniso / 1e6).toFixed(2)} M tris`,
      '  h*_conf area/tri distribution:',
    ];
    for (let b = 0; b <= bins.length; b += 1) {
      const lo = b === 0 ? 0 : bins[b - 1];
      const hi = b === bins.length ? Infinity : bins[b];
      if (areaBins[b] <= 0) continue;
      lines.push(`    h ∈ [${lo}, ${hi === Infinity ? '∞' : hi}) mm : area ${((100 * areaBins[b]) / totArea).toFixed(2)}%  tris ${(triBins[b] / 1e6).toFixed(3)}M`);
    }
    lines.push('=========================================================');
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
  }, 3_000_000);
});
