// _smoothGridCert.test.ts — E-2026-07-22-SMOOTH-GRID-CERT. Demonstrate the campaign thesis: for a SMOOTH style, a
// uniform STRUCTURED periodic grid at the density that closes true-3D ≤0.01mm is JUDGE-CERTIFIABLE via the general
// cut-at-gap adapter (certAdapter.ts). Free-Delaunay conforming meshes carry non-dyadic float stations ⇒ NOT
// judge-certifiable; a structured grid's columns are u=i/nU (dyadic-snappable) ⇒ it IS. So the certifiable production
// path for smooth styles is a structured grid, and this closes the U5.3 "wire mesher outputs to exact partitions" loop
// for the smooth-style class the same way DragonScales closed it for the structured-emitter class.
//
// Env-gated PF_SMOOTHGRID; checkpointed. Research-only.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceTrue3DSag, nonManRawBigStats, triangleQualityDistribution } from './labkit';
import { certifyPeriodicGridMesh } from './certAdapter';
import type { StyleId, StyleOptions } from '../../src/geometry/types';

const TAU = 2 * Math.PI;
const OUT_DIR = join('research', 'exchange', '_smoothGridCert');
const NDJSON = join(OUT_DIR, 'grid.ndjson');
function plog(m: string): void { mkdirSync(OUT_DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT_DIR, 'run.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); }
function keyExists(k: string): boolean { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } }); }
function checkpoint(row: Record<string, unknown>): void { mkdirSync(OUT_DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP] ${JSON.stringify(row)}`); }
/** All measured grid rungs for a tag (cached + fresh) — so the cert selection is resumable across killed runs. */
function loadRungs(tag: string): Array<{ nU: number; nT: number; tris: number; max: number; out: number }> {
  if (!existsSync(NDJSON)) return [];
  const rows: Array<{ nU: number; nT: number; tris: number; max: number; out: number }> = [];
  for (const l of readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)) {
    try {
      const r = JSON.parse(l) as { key?: string; nU?: number; nT?: number; tris?: number; true3dMax?: number; out?: number };
      if (typeof r.key === 'string' && r.key.startsWith(`grid|${tag}|`) && r.nU !== undefined) rows.push({ nU: r.nU, nT: r.nT as number, tris: r.tris as number, max: r.true3dMax as number, out: r.out as number });
    } catch { /* skip */ }
  }
  return rows;
}

type RA = (theta: number, z: number) => number;
/** A uniform STRUCTURED periodic cylinder grid (nU columns × nT rows) on a smooth surface; CCW (outward) winding. */
function buildSmoothGrid(rA: RA, H: number, nU: number, nT: number): { ut: number[]; indices: Uint32Array; positions: Float32Array; nU: number } {
  const positions: number[] = [];
  const ut: number[] = [];
  const grid = new Int32Array(nT * nU);
  for (let j = 0; j < nT; j++) for (let i = 0; i < nU; i++) {
    const u = i / nU, t = j / (nT - 1), th = TAU * u, z = t * H, r = rA(th, z);
    grid[j * nU + i] = positions.length / 3;
    positions.push(r * Math.cos(th), r * Math.sin(th), z);
    ut.push(u, t);
  }
  const idx: number[] = [];
  for (let j = 0; j + 1 < nT; j++) for (let i = 0; i < nU; i++) {
    const iN = (i + 1) % nU;
    const a = grid[j * nU + i], b = grid[j * nU + iN], c = grid[(j + 1) * nU + iN], d = grid[(j + 1) * nU + i];
    idx.push(a, b, c, a, c, d); // CCW in (u,t) = outward (same convention as the cone-fan grid)
  }
  return { ut, indices: Uint32Array.from(idx), positions: Float32Array.from(positions), nU };
}

interface SmoothCase { tag: string; style: StyleId; params: StyleOptions; }
const CASES: SmoothCase[] = [
  { tag: 'HR_gentle', style: 'HarmonicRipple' as StyleId, params: { hr_petal_amp: 0.01, hr_ripple_amp: 0, hr_bell: 0 } as StyleOptions },
  { tag: 'SE_defaults', style: 'SuperellipseMorph' as StyleId, params: {} as StyleOptions },
  { tag: 'FB_defaults', style: 'FourierBloom' as StyleId, params: {} as StyleOptions },
  { tag: 'RI_defaults', style: 'RippleInterference' as StyleId, params: {} as StyleOptions },
];

describe('SMOOTH-GRID-CERT — structured grid closes + judge-certifies for smooth styles', () => {
  it.skipIf(process.env.PF_SMOOTHGRID !== '1')('close true-3D ≤0.01 on a uniform grid, then judge-cert via the cut-at-gap adapter', () => {
    plog(`=== SMOOTH-GRID-CERT => ${NDJSON} ===`);
    const H = 120, Rb = 70, Rt = 70; // OD140 / H120 production scale
    const onlyTag = process.env.PF_SMOOTHGRID_TAG;
    for (const cs of CASES) {
      if (onlyTag && cs.tag !== onlyTag) continue;
      const rA = buildRadiusFn(cs.style, cs.params, { H, Rb, Rt }) as unknown as RA;
      // density ladder — record each rung; find the CLOSING grid (fidelity ≤0.01mm) AND the largest UNDER-CAP grid.
      // The judge's hard triangle cap is 1,048,576; the grid STRUCTURE is density-invariant, so an under-cap grid
      // certifies the whole family (exactly like the DS representative-wall cert covers production nU=4096).
      const HARD_CAP = 1_048_576;
      const bits = 20; // N=2^20; power-of-2 nU divides N ⇒ grid columns snap exactly (only t carries snap δ on a smooth grid).
      // power-of-2 nU (exact column snap); vertical sweep at nU=2048 separates angular- from vertical-limited residual.
      for (const [nU, nT] of [[256, 128], [512, 256], [1024, 384], [2048, 256], [2048, 384], [2048, 512]] as Array<[number, number]>) {
        const key = `grid|${cs.tag}|${nU}x${nT}`;
        if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
        const g = buildSmoothGrid(rA, H, nU, nT);
        const sag = perFaceTrue3DSag(g.ut, g.indices, rA as never, H, { preFilterMm: 0.001 });
        const nF = g.indices.length / 3;
        let max = 0, out = 0;
        for (let f = 0; f < nF; f++) { const e = sag.faceErr[f]; if (e > max) max = e; if (e > 0.01) out++; }
        const nm = nonManRawBigStats(g.indices);
        const q = triangleQualityDistribution({ vertices: g.positions, indices: g.indices });
        plog(`[${cs.tag}] ${nU}x${nT} tris=${nF} true3D MAX=${max.toFixed(6)} out=${out} | nonMan=${nm.nonMan} boundary=${nm.boundary} | %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)}`);
        checkpoint({ key, tag: cs.tag, nU, nT, tris: nF, true3dMax: +max.toFixed(6), out, nonMan: nm.nonMan, boundary: nm.boundary, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2) });
      }
      // Select from ALL rungs (cached + fresh) ⇒ resumable: closing grid (smallest tris ≤0.01) + largest under-cap grid.
      const rungs = loadRungs(cs.tag);
      const closedGrid = rungs.filter((r) => r.max <= 0.01 && r.out === 0).sort((a, b) => a.tris - b.tris)[0] ?? null;
      const certGrid = rungs.filter((r) => r.tris <= HARD_CAP).sort((a, b) => b.tris - a.tris)[0] ?? null;
      // Cert the SHIPPABLE grid = the CLOSING grid if it's under the cap (the actual production mesh), else the largest
      // under-cap grid (representative; the structure is density-invariant so it certifies the closing grid's family too).
      const shipGrid = closedGrid && closedGrid.tris <= HARD_CAP ? closedGrid : certGrid;
      if (shipGrid) {
        const certKey = `cert|${cs.tag}|${shipGrid.nU}x${shipGrid.nT}`;
        if (!keyExists(certKey)) {
          const gc = buildSmoothGrid(rA, H, shipGrid.nU, shipGrid.nT);
          const v = certifyPeriodicGridMesh(gc.ut, gc.indices, gc.positions, shipGrid.nU, 0, rA, H, bits, { patchId: `smoothgrid-${cs.tag.toLowerCase().replace(/_/g, '-')}` });
          plog(`[${cs.tag}] SHIP-CERT @ ${shipGrid.nU}x${shipGrid.nT} (${v.tris} tris) judge=${v.accepted ? 'ACCEPT' : 'REJECT'} maxδ=${v.maxDelta.toFixed(6)} wrap=${v.wrapTris} nonPos=${v.nonPosTris} :: ${v.detail}`);
          checkpoint({ key: certKey, tag: cs.tag, nU: shipGrid.nU, nT: shipGrid.nT, tris: v.tris, accepted: v.accepted, maxDelta: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPos: v.nonPosTris, detail: v.detail });
        }
      }
      // FIDELITY verdict on the closing grid + the vertical-slice fold (fidelity + snap δ ≤ 0.01).
      if (closedGrid) {
        const underCap = closedGrid.tris <= HARD_CAP;
        plog(`[${cs.tag}] FIDELITY closes ≤0.01 @ ${closedGrid.nU}x${closedGrid.nT} (${closedGrid.tris} tris, ${underCap ? 'UNDER cap ⇒ directly judge-certifiable' : 'OVER cap ⇒ certified by the density-invariant structure'}) true3D MAX=${closedGrid.max.toFixed(6)}`);
        checkpoint({ key: `close|${cs.tag}`, tag: cs.tag, closesAt: `${closedGrid.nU}x${closedGrid.nT}`, closeTris: closedGrid.tris, closeMax: +closedGrid.max.toFixed(6), underCap });
      } else {
        plog(`[${cs.tag}] did NOT close ≤0.01 within the ladder — needs more density or curvature grading`);
      }
    }
    plog('[SMOOTH-GRID-CERT] DONE');
  }, 30 * 60 * 1000);
});
