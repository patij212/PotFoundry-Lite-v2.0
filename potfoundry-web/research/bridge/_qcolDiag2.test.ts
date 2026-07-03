// _qcolDiag2.test.ts — DEV-ONLY. E-2026-07-03-STRUCTCOL2 DIAGNOSTIC 2. diag1 proved the sliver tail is a GLOBAL
// aspect-ratio mismatch (dth ~0.12 across vs dz ~0.3 up => 3-6:1 cells everywhere) and that the vertical 3D speed
// is HUGE + varies (steepest column arc 405mm for a 120mm wall). The open question for the M-square fix: within a
// single t-row, what is the RANGE of vertical 3D speed (max/min over u)? That ratio is the IRREDUCIBLE aspect
// residual under a GLOBALLY-SHARED row (equal-arc-by-max-column squares the steep cells but leaves flat cells
// short-fat by that ratio). If the ratio is small (~2) global rows suffice; if huge (~10) we need per-column-band
// vertical density. ALSO: measure the actual column-WIDTH distribution (is width ≈ dthMm everywhere, or do
// collapsed gaps with 0 subs create wide-cell slivers = a separate source).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn } from './labkit';
import { buildRidgeGraph, rasterizeColumns, buildStructWall } from './_structColLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol2');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

function P(rA: (th: number, z: number) => number, u: number, t: number): [number, number, number] {
  const th = u * TAU, z = t * DIMS.H, r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

describe('QCOL DIAG2 — intra-row speed range + column width (E-STRUCTCOL2)', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('measures intra-row vertical-speed ratio + column-width distribution', () => {
    const sub = process.env.PF_QCOL_SUB ?? 'diag2';
    const name = `diag_${sub}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);

    // ---- (1) per-t intra-row vertical 3D speed max/min over u (excluding the seam band). The ratio bounds the
    // residual aspect under a single global row. Report the worst ratio + a t-profile.
    const NU = 480, NT = 200, dt = 1e-4;
    let worstRatio = 0, worstRatioT = 0;
    const prof: Array<{ t: number; min: number; max: number; ratio: number }> = [];
    for (let it = 0; it < NT; it++) {
      const t = it / (NT - 1);
      const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt); const dtt = t1 - t0;
      let mn = Infinity, mx = 0;
      for (let iu = 0; iu < NU; iu++) {
        const u = 0.02 + 0.96 * (iu / (NU - 1)); // exclude seam band
        const a = P(rA, u, t0), b = P(rA, u, t1);
        const sp = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dtt;
        if (sp < mn) mn = sp; if (sp > mx) mx = sp;
      }
      const ratio = mx / (mn || 1e-30);
      if (ratio > worstRatio) { worstRatio = ratio; worstRatioT = t; }
      if (it % 10 === 0) prof.push({ t: +t.toFixed(3), min: +mn.toFixed(1), max: +mx.toFixed(1), ratio: +ratio.toFixed(2) });
    }

    // ---- (2) column WIDTH distribution: build a moderate wall, measure per-cell the HORIZONTAL 3D edge (the
    // top-row edge between adjacent columns). Bin by width; flag the wide tail (collapsed-gap wide cells).
    const dthMm = 0.12, dzMm = 0.3, scanN = 8000, uToMm = TAU * DIMS.Rt;
    const tset = new Set<number>();
    tset.add(0); for (let z = 0; z <= DIMS.H + 1e-9; z += dzMm) tset.add(+(Math.min(DIMS.H, z) / DIMS.H).toFixed(8)); tset.add(1);
    for (const tb of BIRTHS) { tset.add(+Math.max(0, tb - 3e-4).toFixed(8)); tset.add(+Math.min(1, tb + 3e-4).toFixed(8)); }
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumns(g, uToMm, dthMm, 0.02, 0, rA, DIMS.H);
    const mesh = buildStructWall(rA, DIMS.H, rows);
    const idxA = mesh.idx, nF = mesh.nF, xyz = mesh.xyz;
    // horizontal edge = the shorter of the two non-vertical edges; but simpler: for every triangle collect all 3
    // edges, classify each as ~horizontal (dz small) vs ~vertical, histogram the horizontal edge lengths.
    const wBins = [0.02, 0.05, 0.08, 0.12, 0.2, 0.4, 0.8, 2, 1e9]; const wCount = new Int32Array(wBins.length);
    const hBins = [0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 1e9]; const hCount = new Int32Array(hBins.length);
    for (let f = 0; f < nF; f++) {
      const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
      const tri = [a, b, c];
      for (let e = 0; e < 3; e++) {
        const p = tri[e], q = tri[(e + 1) % 3];
        const dz = Math.abs(xyz[3 * p + 2] - xyz[3 * q + 2]);
        const L = Math.hypot(xyz[3 * p] - xyz[3 * q], xyz[3 * p + 1] - xyz[3 * q + 1], dz);
        if (dz < 1e-6) { for (let k = 0; k < wBins.length; k++) if (L <= wBins[k]) { wCount[k]++; break; } } // horizontal (same-row)
        else if (L > 1e-9) { const horiz = Math.hypot(xyz[3 * p] - xyz[3 * q], xyz[3 * p + 1] - xyz[3 * q + 1]); if (horiz < 0.3 * dz) { for (let k = 0; k < hBins.length; k++) if (L <= hBins[k]) { hCount[k]++; break; } } } // near-vertical
      }
    }

    const rec = {
      name,
      intraRowSpeed: { worstRatio: +worstRatio.toFixed(2), atT: +worstRatioT.toFixed(3), profile: prof },
      widthHistHorizontalEdge: wBins.map((b, k) => ({ upTo: b, count: wCount[k] })),
      heightHistVerticalEdge: hBins.map((b, k) => ({ upTo: b, count: hCount[k] })),
      note: 'worstRatio bounds residual aspect under a single global row. width~dthMm confirms equal-arc columns; a wide tail = collapsed-gap slivers.',
    };
    ckpt(name, rec);
    console.log(`QCOLDIAG2 ${name} | intra-row speed ratio worst ${worstRatio.toFixed(2)} @t${worstRatioT.toFixed(3)} | (see json for width/height hist)`);
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
