// _ct_gs.test.ts — DEV-ONLY (PF_CT_GS=1). E-2026-07-03-CT-GEOMETRICSTAR.
// DISCRIMINATE: is GeometricStar's honest brute-anchored chevron/strap-crease residual (~0.036 trustedP99 in the
// _gap_gsbss dense M-square) a genuine density-INVARIANT steep-EXCLUDE cliff, or does FEATURE-CONFORMING the strap
// crease loci (make the near-vertical strapwork edges MESH EDGES, zero serration) drive it to CAD-grade (<=0.01)?
//
// PRIOR ART (do not re-derive):
//   _gap_gsbss dense M-square (uniform-θ, graded-z): trustedP99 0.04295 @5.72M -> 0.03616 @9.79M (16% drop / 1.7x
//     tris — SLOW), radialP99 0.0168 -> 0.00916 (density-responsive on-surface), gnWholeP99 0.0152 -> 0.0087, gnOver=0.
//     ⇒ the WORST-RED tail (strap-crease facets) is only weakly density-responsive under UNIFORM sampling.
//   E-2026-07-02-BREADTH: "Red only on strap-edge crease lines (density-responsive C1 corner)"; ArtDeco block:
//     the C1 chevron chord sag is LINEAR-in-facet-width (sag/h~const) ⇒ uniform density STALLS; the clean fix is a
//     crease-CONFORMING structured strip (sheared-φ) that makes the crease a mesh edge (serration ~0.0036).
//   GEOMETRY (styles.ts rOuterGeometricStar, defaults N=8/gap=0.05/detail=0.5/relief=2/edge=0.02/vFade): the sharp
//     loci are (per row, fixed v=row-local-z): the sector-center FOLD a=0 (C1), the strap crease |dLine|∈{gap,gap+edge}
//     (near-vertical wall over the tiny 0.02 smoothstep), the sector boundary a=±angle/2 (C0), and row boundary v=±1.
//
// THIS PROBE: a structured wall whose PER-ROW θ-samples are placed EXACTLY on the strap-crease loci (the crease is a
// mesh-edge column chain by construction ⇒ serration~0), with a picket of samples across the near-vertical wall so no
// facet straddles it, PLUS z-rows landing on the row boundaries. Measured with the SAME honest ruler as _gap_gsbss:
// bruteAnchoredRedPerp.trustedP99 (redMm=0.008), gnSelAdv worst-facet brute floor, radial own-region screen,
// serration (crease curve -> nearest MESH EDGE), triangle quality, RAW-index nonMan. TWO densities.
//
// ISOLATION: NEW file only. Reuses _sharp3dMesh (buildStructuredWall/RowSpec) + labkit rulers READ-ONLY. Writes ONLY
// research/exchange/_ct_gs/. Env sub-gate + row-exists skip ⇒ resumable.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims,
  triangleQualityDistribution, auditNonManByIndex,
  perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp, bruteNearestOnRadialSurface,
  vertErrColors, dumpRenderBins, perFaceTrue3DSagAnchored,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { buildStructuredWall, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const CAD_TOL = 0.01;
const DIR = join(process.cwd(), 'research', 'exchange', '_ct_gs');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');

// GeometricStar defaults (must match styles.ts DEFAULT_GEOMETRIC_STAR)
const GS = { N: 8, gap: 0.05, detail: 0.5, layers: 4.0, zoom: 1.0, shift: 0.0, relief: 2.0, edge: 0.02 };
const ANGLE = TAU / GS.N;                    // sector width in θ
const STAR_ANGLE = (0.2 + 0.6 * GS.detail) * (Math.PI / 2);
const N_STAR_X = Math.sin(STAR_ANGLE);
const N_STAR_Y = Math.cos(STAR_ANGLE);

const plog = (msg: string): void => { mkdirSync(DIR, { recursive: true }); const line = `[${new Date().toISOString()}] ${msg}`; appendFileSync(PROG, line + '\n'); /* eslint-disable-next-line no-console */ console.log(line); };
const rowExists = (key: string): boolean => {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } });
};
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CHECKPOINT ${row.key}] ${JSON.stringify(row)}`); };

// RAW-INDEX non-manifold (sort-based, from _gap_gsbss — literal-index edges shared by >2 tris).
function auditNonManRaw(idx: ArrayLike<number>): number {
  const keys = new Float64Array(idx.length); let w = 0; const BIG = 2 ** 26;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const lo = p < q ? p : q, hi = p < q ? q : p; keys[w++] = lo * BIG + hi; }
  }
  const arr = keys.subarray(0, w); arr.sort();
  let nm = 0, i = 0;
  while (i < w) { let j = i + 1; while (j < w && arr[j] === arr[i]) j++; if (j - i > 2) nm++; i = j; }
  return nm;
}
function p99(arr: ArrayLike<number>): number { const s = Float64Array.from(arr as ArrayLike<number>).sort(); return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0; }

// ── PER-ROW CREASE LOCI ──────────────────────────────────────────────────────────────────────────────────────
// For a fixed z (→ t → vRaw, row, v=(vRaw-row-0.5)*2, rowOffset), the strap relief is a function of θ via:
//   th = θ+rowOffset ; sector = floor(th/ANGLE) ; a = (th/ANGLE - sector - 0.5)*ANGLE  (a ∈ [-ANGLE/2, ANGLE/2))
//   uvX = a*(N/4) ; pX = |uvX| ; pY = v ; dLine = pX*nStarX + pY*nStarY ; dStrap = |dLine| - gap
// Sharp loci in θ WITHIN one sector (relative to sector center th_c = (sector+0.5)*ANGLE):
//   (1) a=0            fold/cusp (C1, pX kink)                          — always present
//   (2) a=±ANGLE/2     sector boundary (C0, wraps to next tile)         — shared with neighbour sector
//   (3) |dLine|=gap        strap inner edge (smoothstep start)          — present when reachable
//   (4) |dLine|=gap+edge   strap outer edge (smoothstep end)            — present when reachable
// dLine = |uvX|*nStarX + v*nStarY, uvX = a*(N/4). Solve |a|:
//   |dLine|=D  →  |uvX|*nStarX = ±D - v*nStarY  →  |a| = (±D - v*nStarY)/(nStarX*(N/4)), keep roots in [0,ANGLE/2].
function sectorLociAbsA(v: number, targetD: number): number[] {
  const scale = N_STAR_X * (GS.N / 4);       // d|dLine|/d|a|
  const out: number[] = [];
  for (const sign of [1, -1]) {
    const uvXabs = (sign * targetD - v * N_STAR_Y) / N_STAR_X;   // |uvX| = pX
    if (uvXabs <= 0) continue;
    const absA = uvXabs / (GS.N / 4);
    if (absA > 0 && absA < ANGLE / 2 - 1e-9) out.push(absA);
  }
  void scale;
  return Array.from(new Set(out.map((x) => +x.toFixed(12))));
}

/** θ-samples for one row: crease loci (fold, sector bnds, strap edges) + a picket across each strap wall + a base
 *  fill so cells stay ~square. Returns sorted unique θ in [0,TAU). `wallPicket` sub-samples the near-vertical wall. */
function rowThetas(z: number, baseNth: number, wallPicket: number): Float64Array {
  const t = Math.max(0, Math.min(1, z / H));
  const vRaw = t * GS.layers * GS.zoom;
  const row = Math.floor(vRaw);
  const v = (vRaw - row - 0.5) * 2.0;
  const rowOffset = (row % 2) * (Math.PI / GS.N) * GS.shift * 2.0;   // shift=0 default ⇒ 0
  const set = new Set<number>();
  const push = (th: number): void => { let x = th % TAU; if (x < 0) x += TAU; set.add(+x.toFixed(10)); };
  // base uniform fill (θ, in world frame)
  for (let i = 0; i < baseNth; i++) push((TAU * i) / baseNth);
  // per-sector loci: sector center th_c = (s+0.5)*ANGLE - rowOffset (invert th=θ+rowOffset)
  const strapDs = [GS.gap, GS.gap + GS.edge];       // inner + outer strap edges (|dLine| targets)
  for (let s = 0; s < GS.N; s++) {
    const thC = (s + 0.5) * ANGLE - rowOffset;      // world θ of sector center (a=0 fold)
    push(thC);
    push(thC - ANGLE / 2); push(thC + ANGLE / 2);   // sector boundaries (C0)
    for (const D of strapDs) {
      for (const absA of sectorLociAbsA(v, D)) {
        // place the crease column AND a picket band straddling it so no facet bridges the wall
        for (const side of [-1, 1]) {
          const aCtr = side * absA;
          push(thC + aCtr);
          for (let k = 1; k <= wallPicket; k++) {
            const dA = (k / (wallPicket + 1)) * (GS.edge / (N_STAR_X * (GS.N / 4))) * 0.5;
            push(thC + aCtr + dA); push(thC + aCtr - dA);
          }
        }
      }
    }
  }
  const arr = Float64Array.from([...set].sort((a, b) => a - b));
  return arr;
}

/** z-rows: base uniform + explicit rows AT each row-boundary t=k/(layers*zoom) (C0 tile boundary) with a thin
 *  band around it (the vFade + row-tile junction). graded by nothing else (strap crease is θ, handled per-row). */
function crestZ(nZ: number): number[] {
  const set = new Set<number>();
  const push = (z: number): void => { set.add(+Math.max(0, Math.min(H, z)).toFixed(6)); };
  for (let i = 0; i <= nZ; i++) push((H * i) / nZ);
  const nBnd = GS.layers * GS.zoom;               // number of vertical tiles
  for (let k = 0; k <= nBnd; k++) {
    const zb = (H * k) / nBnd;
    push(zb); push(zb - 0.03); push(zb + 0.03);   // thin band at the row boundary (vFade→0 cusp)
  }
  return [...set].sort((a, b) => a - b);
}

function buildConforming(nZ: number, baseNth: number, wallPicket: number): BuiltMesh {
  const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
  const zs = crestZ(nZ);
  const rows: RowSpec[] = zs.map((z) => ({ z, rz: z, thetas: rowThetas(z, baseNth, wallPicket), kind: 'sheet' as const }));
  return buildStructuredWall(rA, H, rows);
}

// SERRATION: the strap-crease loci → nearest MESH EDGE. Sample many points along the |dLine|=gap crease curve (the
// dominant sharp strap centerline) across rows and measure distance to the nearest mesh edge segment via a coarse
// spatial hash on edge midpoints (curve is a mesh-edge chain ⇒ expect ~0).
function serrationToMeshEdge(mesh: BuiltMesh, rA: (t: number, z: number) => number, nSampleZ: number): number {
  // gather mesh edges as endpoint xyz; hash midpoints into a grid keyed by (ix,iy,iz)
  const { xyz, idx, nF } = mesh;
  const cell = 0.6; // mm
  const key = (x: number, y: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>();      // cellKey -> list of edge indices (into edA/edB)
  const edA: number[] = [], edB: number[] = [];
  const seen = new Set<number>();
  const addEdge = (a: number, b: number): void => { const lo = Math.min(a, b), hi = Math.max(a, b); const kk = lo * 2 ** 26 + hi; if (seen.has(kk)) return; seen.add(kk); const e = edA.length; edA.push(a); edB.push(b); const mx = (xyz[3 * a] + xyz[3 * b]) / 2, my = (xyz[3 * a + 1] + xyz[3 * b + 1]) / 2, mz = (xyz[3 * a + 2] + xyz[3 * b + 2]) / 2; const k = key(mx, my, mz); const g = grid.get(k); if (g) g.push(e); else grid.set(k, [e]); };
  for (let f = 0; f < nF; f++) { const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; addEdge(a, b); addEdge(b, c); addEdge(c, a); }
  const distToSeg = (px: number, py: number, pz: number, a: number, b: number): number => {
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
    let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
    const qx = ax + tt * dx, qy = ay + tt * dy, qz = az + tt * dz;
    return Math.hypot(px - qx, py - qy, pz - qz);
  };
  let worst = 0; const errs: number[] = [];
  for (let iz = 1; iz < nSampleZ; iz++) {
    const z = (H * iz) / nSampleZ; const t = z / H; const vRaw = t * GS.layers * GS.zoom; const row = Math.floor(vRaw); const v = (vRaw - row - 0.5) * 2.0; const rowOffset = (row % 2) * (Math.PI / GS.N) * GS.shift * 2.0;
    for (const absA of sectorLociAbsA(v, GS.gap)) {
      for (let s = 0; s < GS.N; s++) {
        for (const side of [-1, 1]) {
          const thC = (s + 0.5) * ANGLE - rowOffset; const th = thC + side * absA;
          const r = rA(th, z); const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
          const ix0 = Math.floor(px / cell), iy0 = Math.floor(py / cell), iz0 = Math.floor(pz / cell);
          let best = Infinity;
          for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) for (let gz = -1; gz <= 1; gz++) {
            const g = grid.get(`${ix0 + gx},${iy0 + gy},${iz0 + gz}`); if (!g) continue;
            for (const e of g) { const d = distToSeg(px, py, pz, edA[e], edB[e]); if (d < best) best = d; }
          }
          if (best < Infinity) { errs.push(best); if (best > worst) worst = best; }
        }
      }
    }
  }
  errs.sort((a, b) => a - b);
  return errs.length ? errs[Math.min(errs.length - 1, Math.floor(0.99 * errs.length))] : 0;
}

interface Cfg { nZ: number; baseNth: number; wallPicket: number; tag: string; dump?: boolean; }

function scoreCfg(c: Cfg): void {
  const key = `GeometricStar_${c.tag}`;
  if (rowExists(key)) { plog(`${key}: exists — skip`); return; }
  const t0 = Date.now();
  const rA = buildRadiusFn('GeometricStar' as StyleId, {}, DIMS);
  plog(`${key}: building nZ=${c.nZ} baseNth=${c.baseNth} picket=${c.wallPicket} ...`);
  const mesh = buildConforming(c.nZ, c.baseNth, c.wallPicket);
  plog(`${key}: built ${mesh.nF} tris nV=${mesh.nV} (${Date.now() - t0}ms)`);
  const radial = perFaceChordSag(mesh.ut, mesh.idx, rA, H);
  const radP99 = p99(radial.faceErr);
  plog(`${key}: radial radP99=${radP99.toFixed(5)} radMax=${radial.worstMm.toFixed(4)} (${Date.now() - t0}ms)`);
  const gn = perFaceTrue3DSag(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.004 });
  const gnP99 = p99(gn.faceErr); let gnOver01 = 0; for (let f = 0; f < mesh.nF; f++) if (gn.faceErr[f] > 0.01) gnOver01++;
  plog(`${key}: GN gnP99=${gnP99.toFixed(5)} gnMax=${gn.worstMm.toFixed(4)} over01=${gnOver01} (${Date.now() - t0}ms)`);
  const anch = bruteAnchoredRedPerp(mesh.ut, mesh.idx, rA, H, {
    redMm: 0.008, sampleN: 240, radial,
    coarse: { nTheta: 1536, nZ: 400 }, fine: { nTheta: 3072, nZ: 800 },
  });
  plog(`${key}: anchor nRed=${anch.nRed} gnP99=${anch.gnP99.toFixed(5)} trustedP99=${anch.trustedP99.toFixed(5)} trustedMax=${anch.trustedMax.toFixed(5)} gnOver=${anch.gnOver} (${Date.now() - t0}ms)`);
  // adversarial GN-selected worst-120 full-azimuth brute floor (guards radial under-selection)
  let gnSelP99 = 0, gnSelMax = 0, gnSelHi = 0;
  {
    const order = Array.from({ length: mesh.nF }, (_, i) => i).sort((x, y) => gn.faceErr[y] - gn.faceErr[x]).slice(0, 120);
    const lift = (i: number): [number, number, number] => { const th = TAU * mesh.ut[2 * i], z = mesh.ut[2 * i + 1] * H, r = rA(th, z); return [r * Math.cos(th), r * Math.sin(th), z]; };
    const ds: number[] = [];
    for (const f of order) {
      const [ax, ay, az] = lift(mesh.idx[3 * f]), [bx, by, bz] = lift(mesh.idx[3 * f + 1]), [cx, cy, cz] = lift(mesh.idx[3 * f + 2]);
      const d = bruteNearestOnRadialSurface((ax + bx + cx) / 3, (ay + by + cy) / 3, (az + bz + cz) / 3, rA, H, { nTheta: 3072, nZ: 800 }).dist;
      ds.push(d); if (d > 0.01) gnSelHi++;
    }
    ds.sort((a, b) => a - b); gnSelMax = ds[ds.length - 1] || 0; gnSelP99 = ds[Math.min(ds.length - 1, Math.floor(0.99 * ds.length))] || 0;
  }
  plog(`${key}: GN-SEL worst120 p99=${gnSelP99.toFixed(5)} max=${gnSelMax.toFixed(5)} stayHi=${gnSelHi} (${Date.now() - t0}ms)`);
  const serr = serrationToMeshEdge(mesh, rA, 2000);
  plog(`${key}: serration(crease->mesh edge) p99=${serr.toFixed(6)} (${Date.now() - t0}ms)`);
  const q = triangleQualityDistribution({ vertices: mesh.xyz, indices: mesh.idx });
  const rawNM = auditNonManRaw(mesh.idx); const weldNM = auditNonManByIndex(mesh.xyz, mesh.idx);
  const anchP99 = anch.nRed > 0 ? anch.trustedP99 : radP99;
  const honest = Math.max(anchP99, gnSelP99);
  if (c.dump) {
    try {
      const anSag = perFaceTrue3DSagAnchored(mesh.ut, mesh.idx, rA, H, { preFilterMm: 0.008, redMm: 0.02, topK: 80, coarse: { nTheta: 1024, nZ: 300 }, fine: { nTheta: 2048, nZ: 600 } });
      dumpRenderBins(DIR, `GeometricStar_conform_heatmap`, mesh.xyz, mesh.idx, { colors: vertErrColors(anSag.vertErr, 0.01),
        meta: { ruler: 'true3d-anchored', label: `GeometricStar CONFORM (${c.tag}) — true-3D vs analytic (anchored, 0.01mm)`, worstMm: anSag.worstMm, p99Mm: gnP99, scaleMm: 0.01 }, stl: true });
      plog(`${key}: heatmap dumped`);
    } catch (e) { plog(`${key}: heatmap failed ${String(e)}`); }
  }
  checkpoint({
    key, style: 'GeometricStar', tag: c.tag, recipe: 'feature-conforming (strap-crease loci + wall picket columns)',
    tris: mesh.nF, nZ: c.nZ, baseNth: c.baseNth, wallPicket: c.wallPicket,
    honestTrue3dP99Mm: +honest.toFixed(5),
    radialP99Mm: +radP99.toFixed(5), radialMaxMm: +radial.worstMm.toFixed(5),
    gnWholeMeshP99Mm: +gnP99.toFixed(5), gnOver01: gnOver01,
    anchorNRed: anch.nRed, anchorTrustedP99Mm: +anch.trustedP99.toFixed(5), anchorGnP99Mm: +anch.gnP99.toFixed(5), gnOverstatedCount: anch.gnOver,
    gnSelAdvP99Mm: +gnSelP99.toFixed(5), gnSelAdvMaxMm: +gnSelMax.toFixed(5), gnSelAdvStayHi: gnSelHi,
    serrationP99Mm: +serr.toFixed(6),
    pctBelow20: +q.pctBelow20.toFixed(2), minAngleDeg: +q.minAngleDeg.toFixed(2),
    rawNonMan: rawNM, weldNonMan: weldNM,
    reaches001: honest <= CAD_TOL && q.pctBelow20 < 5 && rawNM === 0,
    tookMs: Date.now() - t0,
  });
  expect(rawNM).toBe(0);
}

// TWO densities (crease-conforming). baseNth is the world-θ background fill; loci+picket add ~N*(#loci)*picket per row.
const CFGS: Cfg[] = [
  { nZ: 900, baseNth: 1200, wallPicket: 3, tag: 'ct_z900_b1200_p3' },
  { nZ: 1300, baseNth: 1700, wallPicket: 4, tag: 'ct_z1300_b1700_p4', dump: true },
];

describe('CT-GEOMETRICSTAR', () => {
  it.skipIf(process.env.PF_CT_GS !== '1')('GeometricStar feature-conforming strap-crease (2 densities) → honest true-3D', () => {
    mkdirSync(DIR, { recursive: true });
    for (const c of CFGS) scoreCfg(c);
    expect(existsSync(NDJSON)).toBeTruthy();
  }, 60 * 60 * 1000);
});
