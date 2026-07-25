// _strataColDiff.test.ts — THE STRAIGHT-LINE INVARIANT between the two curtain paths.
// Gated PF_STRATA_COLDIFF=1. RESEARCH ONLY. Needs almost no compute (no meshing, no refinement).
//
// CONTRACT: on a style whose h0 loci are STRAIGHT constant-θ lines (BasketWeave: θ* = 2πk/16, which at gu=208 land
// on grid columns 13k), the TRACED-CHAIN assembly must emit a column layout IDENTICAL to the proven COLUMN
// assembly — same count, same θ values, same locus flags, at every row of every band. The chain path is the
// curved-locus generalisation, so the straight case is its degenerate case and any disagreement is a bug in the
// generalisation, not a modelling choice.
//
// WHY THIS EXISTS: the chain path meshes BasketWeave with 624 seam-cracks / 158 boundary loops where the column
// path is watertight (0/0) — same style, same grid, same curtain code downstream. That localises the defect to the
// column assembly, and this test pins it. Keeping the assertion afterwards locks the invariant for CelticKnot,
// where there is no watertight reference to diff against.
import { describe, it, expect } from 'vitest';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from './labkit';
import type { StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_STRATA_COLDIFF === '1';
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
const envF = (n: string, d: number): number => { const r = process.env[n]; if (r === undefined) return d; const v = Number.parseFloat(r); return Number.isFinite(v) ? v : d; };

describe('STRATA column/chain assembly invariant', () => {
  it.runIf(RUN)('chain assembly reproduces the column assembly on straight loci', () => {
    const STYLE = process.env.PF_COLDIFF_STYLE ?? 'BasketWeave';
    const gu = Math.round(envF('PF_CB_GRIDU', 208));
    const gv = Math.round(envF('PF_CB_GRIDV', 140));
    const TOL = envF('PF_CB_TOL', 0.01);
    const BR_EPS = envF('PF_CB_BR_EPS', 1e-9);
    const CURT_SCAN = Math.round(envF('PF_CB_CURT_SCAN', 8192));
    const CURT_ZP = Math.round(envF('PF_CB_CURT_ZP', 23));
    const CURT_MERGE = envF('PF_CB_CURT_MERGE', 0.35);
    const CURT_ZFRAC = envF('PF_CB_CURT_ZFRAC', 0.9);
    const CHAIN_SCAN = Math.round(envF('PF_CB_CHAIN_SCAN', 16384));
    const CHAIN_MATCH = envF('PF_CB_CHAIN_MATCH', 0.06);
    const MINSEP = envF('PF_CB_CHAIN_MINSEP', 1e-5);
    const stepEps = envF('PF_CB_STEP_EPS_UM', 4) / 1000;

    const params = registryDefaults(STYLE);
    const rA = buildRadiusFn(STYLE as StyleId, params, DIMS);
    const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
    const R = (th: number, z: number): number => rA(th, z);
    const cyc = (a: number, b: number): number => { const d = Math.abs(a - b) % TWO_PI; return Math.min(d, TWO_PI - d); };
    const log: string[] = ['', `===== COLUMN/CHAIN ASSEMBLY DIFF: ${STYLE} (gu=${gu}, gv=${gv}) =====`];

    // ───────── z-steps (identical to both harnesses) ─────────
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
        if (j2 > 0.8 * j1 && j1 > TOL) { if (run < 0) run = z; if (j2 > bestJ2) { bestJ2 = j2; bestZ = z; } } else flush();
      }
      flush();
    }

    // ───────── PATH A: the proven COLUMN assembly ─────────
    const jumpLoci: number[] = [];
    {
      const zProbes: number[] = [];
      for (let k = 1; k <= CURT_ZP; k += 1) zProbes.push((H * k) / (CURT_ZP + 1));
      const d1 = TWO_PI / CURT_SCAN;
      const jSpan = (x: number, y: number): number => { let m = 0; for (const z of zProbes) m = Math.max(m, Math.abs(R(y, z) - R(x, z))); return m; };
      const brackets: Array<[number, number]> = [];
      let runStart = 0; let prevIn = false;
      const rPrev = new Float64Array(zProbes.length);
      for (let k = 0; k < zProbes.length; k += 1) rPrev[k] = R(0, zProbes[k]);
      for (let i = 1; i <= CURT_SCAN; i += 1) {
        const th = (TWO_PI * i) / CURT_SCAN;
        let d = 0;
        for (let k = 0; k < zProbes.length; k += 1) { const c = R(canon(th), zProbes[k]); d = Math.max(d, Math.abs(c - rPrev[k])); rPrev[k] = c; }
        const isIn = d > TOL;
        if (isIn && !prevIn) runStart = th - d1;
        if (!isIn && prevIn) brackets.push([runStart, th]);
        prevIn = isIn;
      }
      if (prevIn) brackets.push([runStart, TWO_PI]);
      const raw: number[] = [];
      for (const [a0, b0] of brackets) {
        let lo = a0; let hi = b0;
        for (let it = 0; it < 70; it += 1) {
          const mid = 0.5 * (lo + hi);
          if (mid <= lo || mid >= hi) break;
          if (jSpan(canon(lo), canon(mid)) >= jSpan(canon(mid), canon(hi))) hi = mid; else lo = mid;
        }
        const th = 0.5 * (lo + hi);
        let nHit = 0;
        for (const z of zProbes) {
          const j9 = Math.abs(R(canon(th + BR_EPS), z) - R(canon(th - BR_EPS), z));
          const j3 = Math.abs(R(canon(th + 1e-3), z) - R(canon(th - 1e-3), z));
          if (j9 > TOL && j9 > 0.5 * j3) nHit += 1;
        }
        if (nHit / zProbes.length >= CURT_ZFRAC) raw.push(th);
      }
      for (const x0 of raw) {
        let v = x0 % TWO_PI; if (v < 0) v += TWO_PI;
        if (v >= TWO_PI - 1e-9 || v <= 1e-9) v = 0;
        if (!jumpLoci.some((u) => cyc(u, v) < 1e-6)) jumpLoci.push(v);
      }
      jumpLoci.sort((a, b) => a - b);
    }
    const colTh: number[] = []; const colLoc: boolean[] = [];
    {
      const pitch = TWO_PI / gu;
      const cands: Array<[number, boolean]> = jumpLoci.map((t) => [t, true] as [number, boolean]);
      for (let i = 0; i < gu; i += 1) {
        const th = (TWO_PI * i) / gu;
        if (jumpLoci.some((L) => cyc(L, th) < CURT_MERGE * pitch)) continue;
        cands.push([th, false]);
      }
      cands.sort((p, q) => p[0] - q[0]);
      for (const [t, L] of cands) { colTh.push(t); colLoc.push(L); }
    }
    const nc = colTh.length;
    log.push(`PATH A (column): ${jumpLoci.length} loci → ${nc} columns, ${colLoc.filter(Boolean).length} of them locus`);

    // ───────── PATH B: the TRACED-CHAIN assembly (per band) ─────────
    const lociAtZ = (z: number): number[] => {
      const dth = TWO_PI / CHAIN_SCAN;
      const brk: Array<[number, number]> = [];
      let start = 0; let prevIn = false; let prevR = R(0, z);
      for (let i = 1; i <= CHAIN_SCAN; i += 1) {
        const th = (TWO_PI * i) / CHAIN_SCAN;
        const cur = R(canon(th), z);
        const isIn = Math.abs(cur - prevR) > TOL;
        if (isIn && !prevIn) start = th - dth;
        if (!isIn && prevIn) brk.push([start, th]);
        prevIn = isIn; prevR = cur;
      }
      if (prevIn) brk.push([start, TWO_PI]);
      const res: number[] = [];
      for (const [a0, b0] of brk) {
        let lo = a0; let hi = b0;
        for (let it = 0; it < 60; it += 1) {
          const mid = 0.5 * (lo + hi);
          if (mid <= lo || mid >= hi) break;
          if (Math.abs(R(canon(mid), z) - R(canon(lo), z)) >= Math.abs(R(canon(hi), z) - R(canon(mid), z))) hi = mid; else lo = mid;
        }
        const th = 0.5 * (lo + hi);
        const j9 = Math.abs(R(canon(th + BR_EPS), z) - R(canon(th - BR_EPS), z));
        const j3 = Math.abs(R(canon(th + 1e-3), z) - R(canon(th - 1e-3), z));
        if (j9 > TOL && j9 > 0.5 * j3) res.push(canon(th) >= TWO_PI - 1e-9 ? 0 : canon(th));
      }
      res.sort((x, y) => x - y);
      const uq: number[] = [];
      for (const x of res) if (!uq.some((u) => Math.min(Math.abs(u - x), TWO_PI - Math.abs(u - x)) < 1e-6)) uq.push(x);
      return uq;
    };

    const bounds = [0, ...zSteps, H];
    let firstDiff = '';
    let bandsChecked = 0;
    const ncSeen = new Set<number>();
    for (let b = 0; b + 1 < bounds.length; b += 1) {
      const za = b === 0 ? 0 : bounds[b] + stepEps;
      const zb = b + 2 === bounds.length ? H : bounds[b + 1] - stepEps;
      const bandH = zb - za;
      if (bandH <= 0) continue;
      const rows = Math.max(1, Math.round((gv * bandH) / H));
      const zsB: number[] = [];
      for (let j = 0; j <= rows; j += 1) zsB.push(za + (bandH * j) / rows);
      const per = zsB.map(lociAtZ);
      let m = 0; let ref = 0;
      per.forEach((L, j) => { if (L.length > m) { m = L.length; ref = j; } });
      if (m === 0) continue;
      const chain: number[][] = new Array<number[]>(rows + 1);
      chain[ref] = per[ref].slice();
      const prop = (from: number, to: number, step: number): void => {
        for (let j = from; j !== to; j += step) {
          const prev = chain[j]; const cand = per[j + step].slice();
          const used = new Set<number>(); const outR: number[] = new Array<number>(m);
          for (let k = 0; k < m; k += 1) {
            let best = -1; let bd = Infinity;
            for (let c = 0; c < cand.length; c += 1) { if (used.has(c)) continue; const d = cyc(cand[c], prev[k]); if (d < bd) { bd = d; best = c; } }
            if (best >= 0 && bd < CHAIN_MATCH) { used.add(best); outR[k] = cand[best]; } else outR[k] = prev[k];
          }
          for (let k = 1; k < m; k += 1) if (outR[k] < outR[k - 1] + MINSEP) outR[k] = outR[k - 1] + MINSEP;
          chain[j + step] = outR;
        }
      };
      prop(ref, rows, 1); prop(ref, 0, -1);
      const pitch = TWO_PI / gu;
      const nSub: number[] = new Array<number>(m).fill(1);
      for (let k = 0; k < m; k += 1) {
        let mx = 0;
        for (let j = 0; j <= rows; j += 1) { const nx = chain[j][(k + 1) % m] + (k + 1 === m ? TWO_PI : 0); mx = Math.max(mx, nx - chain[j][k]); }
        nSub[k] = Math.max(1, Math.ceil(mx / pitch - 1e-9));
      }
      const colLocB: boolean[] = [];
      for (let k = 0; k < m; k += 1) { colLocB.push(true); for (let q = 1; q < nSub[k]; q += 1) colLocB.push(false); }
      const ncB = colLocB.length;
      ncSeen.add(ncB);
      for (let j = 0; j <= rows; j += 1) {
        const rc: number[] = [];
        for (let k = 0; k < m; k += 1) {
          const a0 = chain[j][k]; const b0 = chain[j][(k + 1) % m] + (k + 1 === m ? TWO_PI : 0);
          rc.push(a0);
          for (let q = 1; q < nSub[k]; q += 1) rc.push(a0 + ((b0 - a0) * q) / nSub[k]);
        }
        for (let q = 1; q < rc.length; q += 1) if (rc[q] < rc[q - 1] + MINSEP) rc[q] = rc[q - 1] + MINSEP;
        if (firstDiff === '') {
          if (ncB !== nc) firstDiff = `band ${b} row ${j}: COLUMN COUNT ncB=${ncB} vs nc=${nc}   (m=${m}, nSub=[${nSub.slice(0, 6).join(',')}${nSub.length > 6 ? ',…' : ''}], distinct nSub=${[...new Set(nSub)].join('/')})`;
          else {
            for (let i = 0; i < nc; i += 1) {
              if (colLocB[i] !== colLoc[i]) { firstDiff = `band ${b} row ${j} col ${i}: LOCUS FLAG chain=${colLocB[i]} column=${colLoc[i]}`; break; }
              const d = Math.abs(rc[i] - colTh[i]);
              if (d > 1e-12) { firstDiff = `band ${b} row ${j} col ${i}: θ chain=${rc[i].toPrecision(17)} column=${colTh[i].toPrecision(17)} Δ=${d.toExponential(3)}`; break; }
            }
          }
        }
      }
      bandsChecked += 1;
    }
    log.push(`PATH B (chain): ${bandsChecked} bands checked, distinct column counts {${[...ncSeen].join(', ')}}`);
    log.push(firstDiff === '' ? 'INVARIANT HOLDS — chain assembly == column assembly on straight loci' : `*** FIRST DIVERGENCE ***\n  ${firstDiff}`);
    log.push('=========================================================', '');
    // eslint-disable-next-line no-console
    console.log(log.join('\n'));
    expect(firstDiff).toBe('');
  }, 900_000);
});
