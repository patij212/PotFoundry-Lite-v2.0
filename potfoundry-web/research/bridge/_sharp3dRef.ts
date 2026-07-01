// _sharp3dRef.ts — DEV-ONLY (research/ only; src/ must never import this). ISOLATED helper for
// E-2026-07-01-SHARP3D-ARTDECO. Builds the ACTUAL CLOSED 3D outer-wall reference object for a
// radius-discontinuous style (ArtDeco), and a GENUINE 3D metric (facet-sample → nearest point on the
// reference mesh via a spatial hash), fixing the two faults the prior "accept/exclude" verdict rested on:
//   (1) the mesh never meshed the connecting tread surface between the two radii at a step;
//   (2) the ruler (projectPointToRadialSurface) measured against r(θ,z), which does NOT parameterize the tread.
//
// The reference is r(θ,z) sampled DENSELY on the OPEN t-bands (avoiding the exact discontinuity z's) PLUS an
// explicit warped-annular TREAD band at each of the N discontinuity rings connecting r-below(θ) ↔ r-above(θ)
// at the ring's fixed z. Watertight by construction (shared ring vertices).
//
// COPIES nothing from src/; only reads the analytic rA closure (passed in). No kernel edits.

import type { AnalyticRadiusFn } from '../../src/fidelity/analyticSurfaceGate';

const TAU = 2 * Math.PI;

export interface StepRing {
  /** z of the discontinuity (mm). */ z: number;
  /** normalized t = z/H. */ t: number;
  /** true iff radius jumps UP (reduced→full) with increasing z ⇒ up-facing tread. */ up: boolean;
}

/**
 * Locate the radius-discontinuity rings of a stepped style analytically from its step schedule.
 * ArtDeco: stepLocal = frac(t*stepCount); stepEdge on [0,0.1)∪(0.9,1] ⇒ jumps at stepLocal = 0.1 and 0.9
 * within each tier k∈[0,stepCount). loc=0.1 → jump UP; loc=0.9 → jump DOWN.
 */
export function artDecoStepRings(H: number, stepCount: number): StepRing[] {
  const rings: StepRing[] = [];
  for (let k = 0; k < stepCount; k++) {
    for (const [loc, up] of [[0.1, true], [0.9, false]] as const) {
      const t = (k + loc) / stepCount;
      rings.push({ z: t * H, t, up });
    }
  }
  return rings;
}

export interface RefMesh {
  /** flat xyz triples (Float64). */ xyz: Float64Array;
  /** triangle indices. */ idx: Uint32Array;
  nV: number;
  nF: number;
}

/**
 * Dense watertight reference of the closed outer wall. Sheet rows on the open t-bands (each ring z is
 * approached from BELOW and ABOVE by rows offset by ±zEps so the sheet row uses the correct one-sided
 * radius), plus a TREAD strip (fixed z_ring) between the below-radius ring and the above-radius ring.
 *
 * @param nTheta  θ resolution (columns; periodic).
 * @param nZperBand  z rows within each open band between consecutive rings (and the end bands).
 * @param zEps  how far (mm) below/above a ring the one-sided sheet row is evaluated (keeps it off the jump).
 */
export function buildStepReference(
  rA: AnalyticRadiusFn, H: number, rings: StepRing[],
  opts: {
    nTheta: number; nZperBand: number; zEps?: number;
    /** OPT: per-row θ samples (feature-conforming reference). Given the row's rz (mm). Overrides nTheta uniform. */
    thetasFor?: (rz: number) => Float64Array;
  },
): RefMesh {
  const nTheta = opts.nTheta;
  const zEps = opts.zEps ?? 1e-3;
  const thetasForRow = (rz: number): Float64Array => {
    if (opts.thetasFor) return opts.thetasFor(rz);
    const a = new Float64Array(nTheta); for (let j = 0; j < nTheta; j++) a[j] = TAU * (j / nTheta); return a;
  };
  // The ordered list of z "levels" that carry a full θ-ring of vertices. Every ring contributes TWO levels at
  // the SAME z (below-radius, above-radius) so the tread is a strip between them. Between levels we fill sheet
  // rows. Levels are tagged with which one-sided z to sample the radius at.
  type Level = { z: number; rz: number; kind: 'sheet' | 'ringBelow' | 'ringAbove' };
  const levels: Level[] = [];
  const zTop = H;
  const sortedRings = [...rings].sort((a, b) => a.z - b.z);
  // start at z=0
  let cursor = 0;
  const pushSheetBand = (z0: number, z1: number, nrows: number): void => {
    // interior rows strictly between z0 and z1 (endpoints are ring/boundary levels handled separately)
    for (let i = 1; i < nrows; i++) {
      const z = z0 + (z1 - z0) * (i / nrows);
      levels.push({ z, rz: z, kind: 'sheet' });
    }
  };
  // bottom boundary sheet row
  levels.push({ z: 0, rz: zEps, kind: 'sheet' });
  for (const ring of sortedRings) {
    // sheet band from cursor→ring (rows sampled at their own z, which lies off the jump)
    pushSheetBand(cursor, ring.z, opts.nZperBand);
    // ring below-radius level (radius just BELOW the jump)
    levels.push({ z: ring.z, rz: ring.z - zEps, kind: 'ringBelow' });
    // ring above-radius level (radius just ABOVE the jump) — SAME z
    levels.push({ z: ring.z, rz: ring.z + zEps, kind: 'ringAbove' });
    cursor = ring.z;
  }
  pushSheetBand(cursor, zTop, opts.nZperBand);
  levels.push({ z: zTop, rz: zTop - zEps, kind: 'sheet' });

  // Build vertices: one θ-ring per level; per-row θ-set (feature-conforming reference supported).
  const nLev = levels.length;
  const rowTh: Float64Array[] = levels.map((lv) => thetasForRow(lv.rz));
  const rowStart: number[] = [0];
  for (const th of rowTh) rowStart.push(rowStart[rowStart.length - 1] + th.length);
  const total = rowStart[rowStart.length - 1];
  const xyz = new Float64Array(total * 3);
  for (let l = 0; l < nLev; l++) {
    const { z, rz } = levels[l]; const ths = rowTh[l]; const base = rowStart[l];
    for (let j = 0; j < ths.length; j++) {
      const th = ths[j]; const r = rA(th, rz); const o = (base + j) * 3;
      xyz[o] = r * Math.cos(th); xyz[o + 1] = r * Math.sin(th); xyz[o + 2] = z;
    }
  }
  // Build triangles: MERGE-STRIP between every consecutive level pair (periodic in θ), robust to differing
  // per-row θ-sets. Advance whichever ring's next vertex has the smaller θ.
  const idx: number[] = [];
  for (let l = 0; l + 1 < nLev; l++) {
    const topBase = rowStart[l], topN = rowTh[l].length, topT = rowTh[l];
    const botBase = rowStart[l + 1], botN = rowTh[l + 1].length, botT = rowTh[l + 1];
    let i = 0, j = 0;
    const topNext = (k: number): number => (k + 1 < topN ? topT[k + 1] : topT[0] + TAU);
    const botNext = (k: number): number => (k + 1 < botN ? botT[k + 1] : botT[0] + TAU);
    const steps = topN + botN;
    for (let s = 0; s < steps; s++) {
      const tn = topNext(i), bn = botNext(j);
      if (tn <= bn) { idx.push(topBase + (i % topN), botBase + (j % botN), topBase + ((i + 1) % topN)); i++; }
      else { idx.push(topBase + (i % topN), botBase + (j % botN), botBase + ((j + 1) % botN)); j++; }
    }
  }
  return { xyz, idx: Uint32Array.from(idx), nV: total, nF: idx.length / 3 };
}

// ───────────────────────── spatial hash over reference triangles ─────────────────────────

export interface RefLocator {
  /** nearest 3D point-to-mesh distance (mm) from (px,py,pz) to the reference surface. */
  dist: (px: number, py: number, pz: number) => number;
  /** same, but returns {dist, tri} (the winning reference triangle index) for adversarial checks. */
  distTri: (px: number, py: number, pz: number) => { dist: number; tri: number };
  bruteDist: (px: number, py: number, pz: number) => number;
}

/** squared point-to-triangle distance in 3D (exact; Ericson/real-time-collision-detection closest-point). */
function pointTriDist2(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) return apx * apx + apy * apy + apz * apz;
  const bpx = px - bx, bpy = py - by, bpz = pz - bz;
  const d3 = abx * bpx + aby * bpy + abz * bpz;
  const d4 = acx * bpx + acy * bpy + acz * bpz;
  if (d3 >= 0 && d4 <= d3) return bpx * bpx + bpy * bpy + bpz * bpz;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    const qx = ax + v * abx, qy = ay + v * aby, qz = az + v * abz;
    const dx = px - qx, dy = py - qy, dz = pz - qz; return dx * dx + dy * dy + dz * dz;
  }
  const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
  const d5 = abx * cpx + aby * cpy + abz * cpz;
  const d6 = acx * cpx + acy * cpy + acz * cpz;
  if (d6 >= 0 && d5 <= d6) return cpx * cpx + cpy * cpy + cpz * cpz;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    const qx = ax + w * acx, qy = ay + w * acy, qz = az + w * acz;
    const dx = px - qx, dy = py - qy, dz = pz - qz; return dx * dx + dy * dy + dz * dz;
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    const qx = bx + w * (cx - bx), qy = by + w * (cy - by), qz = bz + w * (cz - bz);
    const dx = px - qx, dy = py - qy, dz = pz - qz; return dx * dx + dy * dy + dz * dz;
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  const qx = ax + abx * v + acx * w, qy = ay + aby * v + acy * w, qz = az + abz * v + acz * w;
  const dx = px - qx, dy = py - qy, dz = pz - qz; return dx * dx + dy * dy + dz * dz;
}

/**
 * Uniform-grid spatial hash over the reference triangles (by AABB), FLAT CSR buckets (no per-cell Map/array) +
 * a visited-STAMP array (no per-query Set). Query = expanding shells until the nearest triangle can't be beaten.
 * Includes a brute-force fallback for adversarial verification.
 */
export function buildRefLocator(ref: RefMesh, cell = 3.0): RefLocator {
  const { xyz, idx, nF } = ref;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < xyz.length; i += 3) {
    if (xyz[i] < minX) minX = xyz[i]; if (xyz[i] > maxX) maxX = xyz[i];
    if (xyz[i + 1] < minY) minY = xyz[i + 1]; if (xyz[i + 1] > maxY) maxY = xyz[i + 1];
    if (xyz[i + 2] < minZ) minZ = xyz[i + 2]; if (xyz[i + 2] > maxZ) maxZ = xyz[i + 2];
  }
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const ny = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1);
  const nCells = nx * ny * nz;
  const ixOf = (x: number): number => Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cell)));
  const iyOf = (y: number): number => Math.min(ny - 1, Math.max(0, Math.floor((y - minY) / cell)));
  const izOf = (z: number): number => Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cell)));
  const cid = (ix: number, iy: number, iz: number): number => (ix * ny + iy) * nz + iz;

  // tri AABB cell ranges (computed once)
  const tlx = new Int32Array(nF), tly = new Int32Array(nF), tlz = new Int32Array(nF);
  const thx = new Int32Array(nF), thy = new Int32Array(nF), thz = new Int32Array(nF);
  const counts = new Int32Array(nCells + 1);
  for (let f = 0; f < nF; f++) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    const axx = xyz[3 * a], ayy = xyz[3 * a + 1], azz = xyz[3 * a + 2];
    const bxx = xyz[3 * b], byy = xyz[3 * b + 1], bzz = xyz[3 * b + 2];
    const cxx = xyz[3 * c], cyy = xyz[3 * c + 1], czz = xyz[3 * c + 2];
    const lx = ixOf(Math.min(axx, bxx, cxx)), hx = ixOf(Math.max(axx, bxx, cxx));
    const ly = iyOf(Math.min(ayy, byy, cyy)), hy = iyOf(Math.max(ayy, byy, cyy));
    const lz = izOf(Math.min(azz, bzz, czz)), hz = izOf(Math.max(azz, bzz, czz));
    tlx[f] = lx; thx[f] = hx; tly[f] = ly; thy[f] = hy; tlz[f] = lz; thz[f] = hz;
    for (let ix = lx; ix <= hx; ix++) for (let iy = ly; iy <= hy; iy++) for (let iz = lz; iz <= hz; iz++) counts[cid(ix, iy, iz) + 1]++;
  }
  for (let i = 0; i < nCells; i++) counts[i + 1] += counts[i];
  const total = counts[nCells];
  const items = new Int32Array(total);
  const cursor = counts.slice(0, nCells);
  for (let f = 0; f < nF; f++) {
    const lx = tlx[f], hx = thx[f], ly = tly[f], hy = thy[f], lz = tlz[f], hz = thz[f];
    for (let ix = lx; ix <= hx; ix++) for (let iy = ly; iy <= hy; iy++) for (let iz = lz; iz <= hz; iz++) { const c = cid(ix, iy, iz); items[cursor[c]++] = f; }
  }

  const triDist2 = (f: number, px: number, py: number, pz: number): number => {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    return pointTriDist2(px, py, pz,
      xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2],
      xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2],
      xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]);
  };
  const stamp = new Int32Array(nF).fill(-1); let query = 0;
  const distTri = (px: number, py: number, pz: number): { dist: number; tri: number } => {
    const cx = ixOf(px), cy = iyOf(py), cz = izOf(pz);
    let best = Infinity, bestTri = -1;
    const q = query++;
    const maxRing = Math.max(nx, ny, nz);
    for (let ring = 0; ring < maxRing; ring++) {
      let anyCell = false;
      const xlo = Math.max(0, cx - ring), xhi = Math.min(nx - 1, cx + ring);
      const ylo = Math.max(0, cy - ring), yhi = Math.min(ny - 1, cy + ring);
      const zlo = Math.max(0, cz - ring), zhi = Math.min(nz - 1, cz + ring);
      for (let ix = xlo; ix <= xhi; ix++) {
        const xShell = ix === cx - ring || ix === cx + ring;
        for (let iy = ylo; iy <= yhi; iy++) {
          const yShell = iy === cy - ring || iy === cy + ring;
          for (let iz = zlo; iz <= zhi; iz++) {
            if (ring > 0 && !(xShell || yShell || iz === cz - ring || iz === cz + ring)) continue;
            anyCell = true;
            const c = cid(ix, iy, iz); const s = counts[c], e = counts[c + 1];
            for (let p = s; p < e; p++) { const f = items[p]; if (stamp[f] === q) continue; stamp[f] = q; const d2 = triDist2(f, px, py, pz); if (d2 < best) { best = d2; bestTri = f; } }
          }
        }
      }
      if (bestTri >= 0 && (ring * cell) * (ring * cell) > best && ring > 0) break;
      if (!anyCell && ring > 0) break;
    }
    return { dist: Math.sqrt(best), tri: bestTri };
  };
  const bruteDist = (px: number, py: number, pz: number): number => {
    let best = Infinity;
    for (let f = 0; f < nF; f++) { const d2 = triDist2(f, px, py, pz); if (d2 < best) best = d2; }
    return Math.sqrt(best);
  };
  return { dist: (x, y, z) => distTri(x, y, z).dist, distTri, bruteDist };
}
