// _qcolDiag.test.ts — DEV-ONLY (research/ only; src/ NEVER imports this). E-2026-07-03-STRUCTCOL2 DIAGNOSTIC.
// Follow-up to E-2026-07-02-STRUCTCOL (PARTIAL). GOAL of the arc: SFB@1 to the COMPLETE bar — the residual to
// close is the density-INVARIANT SLIVER TAIL (%<20 ~67%). SCORECARD hypothesis: the structured columns are
// chord-great but built at a FIXED aspect ratio (dthMm across-flank ~0.08 vs dzMm up-wall ~0.2-0.35) => cells
// are ~2.5-4:1 => guaranteed slivers regardless of density.
//
// THIS PROBE (cheap, moderate density) FALSIFIES the aspect-ratio mechanism BEFORE building the M-square fix:
//   (1) measure the VERTICAL 3D speed |dP/dt| per (u-band, t) — how many mm of 3D surface a column travels per
//       unit t. If a steep flank moves >>dz per z, its row-height-3D >> dthMm => the sliver source is real.
//   (2) build the baseline wall (buildStructWall, buildRidgeGraph/rasterizeColumns as committed) at MODERATE
//       density and measure the actual per-cell 3D aspect ratio distribution + WHERE minAngle<20 cells live
//       (u,t histogram) + minAngle. Confirms: slivers are aspect-driven (width vs height mismatch), not random.
//
// Env PF_STRUCTCOL2=1 gates the whole file; PF_QCOL_SUB names the run. Output research/exchange/_structcol2/.
// Reuses committed libs READ-ONLY (buildRidgeGraph/rasterizeColumns/buildStructWall from _structColLib).

import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, triangleQualityDistribution } from './labkit';
import { buildRidgeGraph, rasterizeColumns, buildStructWall } from './_structColLib';
import type { StyleDims } from './runStyle';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'SuperformulaBlossom' as const;
const ROOT = join('research', 'exchange', '_structcol2');
const ckpt = (name: string, obj: unknown): void => { mkdirSync(ROOT, { recursive: true }); writeFileSync(join(ROOT, `${name}.json`), JSON.stringify(obj, null, 2)); };
const done = (name: string): boolean => existsSync(join(ROOT, `${name}.json`));
const BIRTHS = [0.00045, 0.33825, 0.56132, 0.82872];

/** 3D point on the surface at (u,t). */
function P(rA: (th: number, z: number) => number, u: number, t: number): [number, number, number] {
  const th = u * TAU, z = t * DIMS.H, r = rA(th, z);
  return [r * Math.cos(th), r * Math.sin(th), z];
}

describe('QCOL DIAG — aspect-ratio sliver mechanism (E-STRUCTCOL2)', () => {
  it.skipIf(process.env.PF_STRUCTCOL2 !== '1')('measures vertical-3D-speed profile + baseline cell aspect distribution', () => {
    const sub = process.env.PF_QCOL_SUB ?? 'diag1';
    const name = `diag_${sub}`;
    if (done(name)) { console.log(`SKIP ${name}`); return; }
    const rA = buildRadiusFn(STYLE, {}, DIMS);

    // ---- (1) VERTICAL 3D SPEED |dP/dt| across (u,t). For a grid of u and t, finite-difference the 3D position
    // in t. This is the "how tall is a row of height dt" curve => the row-height-3D per unit t at each u.
    const NU = 240, NT = 240, dt = 1e-4;
    let maxSpeed = 0, maxSpeedU = 0, maxSpeedT = 0;
    // per-t: max over u of the vertical speed (the binding constraint for a globally-shared row).
    const perTmax = new Float64Array(NT);
    for (let it = 0; it < NT; it++) {
      const t = it / (NT - 1);
      const t0 = Math.max(0, t - dt), t1 = Math.min(1, t + dt); const dtt = t1 - t0;
      let rowMax = 0;
      for (let iu = 0; iu < NU; iu++) {
        const u = iu / NU;
        const a = P(rA, u, t0), b = P(rA, u, t1);
        const sp = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / dtt; // mm per unit t
        if (sp > rowMax) rowMax = sp;
        if (sp > maxSpeed) { maxSpeed = sp; maxSpeedU = u; maxSpeedT = t; }
      }
      perTmax[it] = rowMax;
    }
    // total vertical 3D arc-length of the STEEPEST column path (integral of maxSpeed over t) => how many equal-
    // arc rows are needed for a target 3D step. Also min speed (flat regions) to size the dz dynamic range.
    let arcMax = 0; for (let it = 1; it < NT; it++) arcMax += 0.5 * (perTmax[it] + perTmax[it - 1]) * (1 / (NT - 1));
    // for the target dthMm=0.08: rows needed if we equal-arc the steepest column
    const rowsForSquare08 = arcMax / 0.08;

    // ---- (2) BASELINE wall at MODERATE density: measure per-cell 3D aspect + sliver locations.
    const dthMm = 0.12, dzMm = 0.3, scanN = 8000, uToMm = TAU * DIMS.Rt;
    const tset = new Set<number>();
    tset.add(0); for (let z = 0; z <= DIMS.H + 1e-9; z += dzMm) tset.add(+(Math.min(DIMS.H, z) / DIMS.H).toFixed(8)); tset.add(1);
    for (const tb of BIRTHS) { tset.add(+Math.max(0, tb - 3e-4).toFixed(8)); tset.add(+Math.min(1, tb + 3e-4).toFixed(8)); }
    const ts = Array.from(tset).filter((t) => t >= 0 && t <= 1).sort((a, b) => a - b);
    const g = buildRidgeGraph(rA, DIMS.H, ts, scanN);
    const rows = rasterizeColumns(g, uToMm, dthMm, 0.02, 0, rA, DIMS.H);
    const mesh = buildStructWall(rA, DIMS.H, rows);
    const idxA = mesh.idx, nF = mesh.nF, xyz = mesh.xyz, ut = mesh.ut;

    // per-cell aspect: for each triangle, longest edge / shortest edge (3D). Bin the aspect + min-angle by
    // whether the triangle is a sliver (minAngle<20). Also histogram sliver COUNT by (u,t) 20x20 grid.
    const UB = 20, TB = 20; const sliverHist = new Int32Array(UB * TB); const allHist = new Int32Array(UB * TB);
    const aspBins = [1, 1.5, 2, 3, 4, 6, 10, 1e9]; const aspCount = new Int32Array(aspBins.length);
    let minAng = 180, nSliver = 0;
    const ang = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): number => {
      // min interior angle of triangle abc
      const e = (px: number, py: number, pz: number, qx: number, qy: number, qz: number): number => Math.hypot(px - qx, py - qy, pz - qz);
      const A = e(bx, by, bz, cx, cy, cz), B = e(cx, cy, cz, ax, ay, az), C = e(ax, ay, az, bx, by, bz);
      const clamp = (x: number): number => Math.max(-1, Math.min(1, x));
      const aa = Math.acos(clamp((B * B + C * C - A * A) / (2 * B * C || 1e-30)));
      const ab = Math.acos(clamp((A * A + C * C - B * B) / (2 * A * C || 1e-30)));
      const ac = Math.PI - aa - ab;
      return Math.min(aa, ab, ac) * 180 / Math.PI;
    };
    for (let f = 0; f < nF; f++) {
      const a = idxA[3 * f], b = idxA[3 * f + 1], c = idxA[3 * f + 2];
      const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2];
      const bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
      const cx = xyz[3 * c], cy = xyz[3 * c + 1], cz = xyz[3 * c + 2];
      const e = (px: number, py: number, pz: number, qx: number, qy: number, qz: number): number => Math.hypot(px - qx, py - qy, pz - qz);
      const l0 = e(ax, ay, az, bx, by, bz), l1 = e(bx, by, bz, cx, cy, cz), l2 = e(cx, cy, cz, ax, ay, az);
      const lmax = Math.max(l0, l1, l2), lmin = Math.min(l0, l1, l2);
      const asp = lmax / (lmin || 1e-30);
      for (let k = 0; k < aspBins.length; k++) { if (asp <= aspBins[k]) { aspCount[k]++; break; } }
      const mn = ang(ax, ay, az, bx, by, bz, cx, cy, cz);
      if (mn < minAng) minAng = mn;
      // centroid (u,t) for the histogram
      let ua = ut[2 * a], ub = ut[2 * b], uc = ut[2 * c];
      if (Math.max(ua, ub, uc) - Math.min(ua, ub, uc) > 0.5) { if (ua < 0.5) ua += 1; if (ub < 0.5) ub += 1; if (uc < 0.5) uc += 1; }
      let uC = (ua + ub + uc) / 3; uC -= Math.floor(uC);
      const tC = (ut[2 * a + 1] + ut[2 * b + 1] + ut[2 * c + 1]) / 3;
      const ib = Math.min(UB - 1, Math.max(0, Math.floor(uC * UB))), jb = Math.min(TB - 1, Math.max(0, Math.floor(tC * TB)));
      allHist[jb * UB + ib]++;
      if (mn < 20) { nSliver++; sliverHist[jb * UB + ib]++; }
    }
    const tq = triangleQualityDistribution({ vertices: Float64Array.from(xyz), indices: idxA });
    // top sliver cells by (u,t)
    const cells: Array<{ u: number; t: number; sliver: number; all: number; frac: number }> = [];
    for (let j = 0; j < TB; j++) for (let i = 0; i < UB; i++) { const s = sliverHist[j * UB + i], al = allHist[j * UB + i]; if (al > 0) cells.push({ u: +((i + 0.5) / UB).toFixed(3), t: +((j + 0.5) / TB).toFixed(3), sliver: s, all: al, frac: +(s / al).toFixed(3) }); }
    cells.sort((x, y) => y.sliver - x.sliver);

    const rec = {
      name, verticalSpeed: { maxSpeedMmPerT: +maxSpeed.toFixed(3), atU: +maxSpeedU.toFixed(4), atT: +maxSpeedT.toFixed(4), steepColArcMm: +arcMax.toFixed(2), rowsForSquare_dth0p08: Math.ceil(rowsForSquare08), perTmaxSample: Array.from(perTmax).filter((_, i) => i % 24 === 0).map((x) => +x.toFixed(2)) },
      baseline: { dthMm, dzMm, rows: ts.length, tris: nF, minAngle: +minAng.toFixed(3), qualMinAngle: tq.minAngleDeg, pctBelow20: tq.pctBelow20, nSliver, aspectBins: aspBins.map((b, k) => ({ upTo: b, count: aspCount[k] })) },
      topSliverCells: cells.slice(0, 25),
    };
    ckpt(name, rec);
    console.log(`QCOLDIAG ${name} | maxVspeed ${maxSpeed.toFixed(2)}mm/t @u${maxSpeedU.toFixed(3)},t${maxSpeedT.toFixed(3)} | steepArc ${arcMax.toFixed(1)}mm rowsForSquare0.08=${Math.ceil(rowsForSquare08)} | baseline minAngle ${minAng.toFixed(2)} %<20 ${tq.pctBelow20} nSliver ${nSliver}/${nF}`);
    expect(nF).toBeGreaterThan(0);
  }, 3_600_000);
});
