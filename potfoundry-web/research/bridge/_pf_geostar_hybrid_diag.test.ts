// _pf_geostar_hybrid_diag.test.ts — DEV-ONLY (PF_GSHYBDIAG=1). CHEAPEST DISCRIMINATOR for the HYBRID.
//
// The HYBRID task = clean structured-strip flank EVERYWHERE + localized honest-brute apex refine ONLY on outlier
// tris, on GeometricStar. Before building anything, this probe answers TWO questions that decide whether the hybrid
// CAN win, cheaply (no long guard):
//   (Q1) What is the crest sub-pitch (nearest-OTHER-crest 3D distance) on the CONFIRMED whole-mesh 0-outlier mesh?
//        VALIDATION-7 measured p50=0.088mm; re-confirm on the actual mesh. This bounds any square strip half-width.
//   (Q2) WHERE do the 21.7% pctBelow20 slivers live — ON-crest (cross-curvature needles LONG-ALONG the near-vertical
//        flank, INTRINSIC at sub-pitch) or OFF-crest (grading/panel, fixable by a strip)? For each <20° facet:
//        classify by nearest-crest-3D distance (onCrest if < 0.5*subpitch) AND by longest-edge angle to the local
//        crest tangent (a cross-curvature needle is ~90° to the crest; a chord-across is ~0°).
//
// If the slivers are dominated by ON-crest cross-curvature needles at sub-pitch, the strip cannot fit a square cell
// there (its half-width > the valley) and the hybrid REFUTES on the SAME intrinsic tension VALIDATION-7 measured —
// cheaply, before a multi-hour build. If a large fraction are OFF-crest / panel, a strip on those regions could help.
//
// ISOLATION: NEW file. Reloads the CONFIRMED wholemesh mesh READ-ONLY. Reuses labkit + _pf_perfectMesherLib +
// _pf_geostarPatchLib + _pf_perfectMesherMsquareLib(metricScales). Writes ONLY research/exchange/_pf_geostar_hybrid_diag.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { triangleQualityDistribution } from './labkit';
import { extractProtectedComplex, liftMesh, lift } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import { metricScales } from './_pf_perfectMesherMsquareLib';

const DIR = join(process.cwd(), 'research', 'exchange', '_pf_geostar_hybrid_diag');
const NDJSON = join(DIR, 'scorecard.ndjson');
const WHOLEMESH_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh', 'refined_mesh.bin');
const BRUTE_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_brute', 'refined_mesh.bin');

const BAYS = Number(process.env.PF_BAYS ?? 5);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 10);
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const N_ROW = 260, N_COL = 260, MIN_AMP = 0.03;

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); /* eslint-disable-next-line no-console */ console.log(`[${new Date().toISOString()}] ${m}`); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row)}`); };

function loadMesh(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const size16 = 16 + nV * 16 + nT * 12, size8 = 8 + nV * 16 + nT * 12;
  const off = buf.length === size16 ? 16 : (buf.length === size8 ? 8 : -1);
  if (off < 0) return null;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

function pctl(arr: number[], q: number): number { if (!arr.length) return 0; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; }

describe('pf-GEOSTAR-HYBRID-DIAG: crest sub-pitch + sliver localization (cheapest discriminator)', () => {
  it.skipIf(process.env.PF_GSHYBDIAG !== '1')('measure sub-pitch and classify where slivers live', () => {
    if (rowExists('diag')) { plog('diag exists, skip'); return; }
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    const { rA, H } = patch;
    plog(`[diag] patch u[${patch.uLo.toFixed(4)}..${patch.uHi.toFixed(4)}] t[${patch.tLo.toFixed(4)}..${patch.tHi.toFixed(4)}]`);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    plog(`[diag] complex fam=${pc.familyCount} segU=${pc.nSegU} segT=${pc.nSegT} cEdges=${pc.constraintEdges.length} crestSamples=${pc.crestSamples3D.length}`);

    let m = loadMesh(WHOLEMESH_BIN); let src = 'wholemesh';
    if (!m) { m = loadMesh(BRUTE_BIN); src = 'brute'; }
    if (!m) { expect(existsSync(WHOLEMESH_BIN) || existsSync(BRUTE_BIN)).toBe(true); return; }
    plog(`[diag] baseline(${src}) ${m.uv.length / 2}v ${m.tris.length / 3}t`);

    const xyz = liftMesh(patch, m.uv);
    const crest = pc.crestSamples3D; // Array<[x,y,z]>

    // (Q1) crest sub-pitch: for each crest sample, nearest-OTHER crest sample 3D distance (>1e-3 to skip self/adjacent
    // arc neighbours we approximate by requiring dist > a tiny arc floor). Report min/p50/mean.
    const subPitch: number[] = [];
    const ARC_FLOOR = 0.02; // ignore same-chain immediate neighbours below this (arc step); the pitch is the gap to the NEXT strap
    for (let i = 0; i < crest.length; i += 2) { // subsample for speed
      const p = crest[i]; let best = Infinity;
      for (let k = 0; k < crest.length; k++) { if (k === i) continue; const q = crest[k]; const d = Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); if (d > ARC_FLOOR && d < best) best = d; }
      if (best < Infinity) subPitch.push(best);
    }
    const spMin = subPitch.length ? Math.min(...subPitch) : 0;
    const spP50 = pctl(subPitch, 0.5), spMean = subPitch.reduce((a, b) => a + b, 0) / Math.max(1, subPitch.length);
    plog(`[diag Q1] crest sub-pitch (nearest-other-crest 3D): min=${spMin.toFixed(4)} p50=${spP50.toFixed(4)} mean=${spMean.toFixed(4)} n=${subPitch.length}`);

    // (Q2) sliver localization. For each facet with minAngle < 20: classify.
    const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(m.tris) });
    const nF = m.tris.length / 3;
    // nearest-crest 3D of a facet centroid (KD-free brute; subsample crest for speed with a coarse grid map)
    const onCrestThresh = Math.max(0.05, 0.5 * spP50); // onCrest if centroid within half sub-pitch of a crest
    // longest-edge angle to local crest tangent (mm-space in (u,t)) — need a crest tangent near the centroid.
    // Build a crest (u,t) list from constraintEdges midpoints for tangent lookup.
    const cVerts = new Set<number>(); for (const [a, b] of pc.constraintEdges) { cVerts.add(a); cVerts.add(b); }
    // adjacency for crest tangent: map crest vertex -> neighbours (in the seed index space of the COMPLEX, not the mesh).
    // The complex was extracted independently of the loaded mesh; use crestSamples3D nearest for onCrest, and for the
    // needle-orientation test use the facet's own longest edge vs the direction to the 2nd-nearest crest sample.
    let nSliv = 0, nOnCrest = 0, nOffCrest = 0;
    let nNeedleAcross = 0, nChordAcross = 0; // among onCrest slivers: longest-edge ~perp to crest (needle) vs ~along (chord)
    const angToCrestList: number[] = [];
    for (let f = 0; f < nF; f++) {
      const a = m.tris[3 * f], b = m.tris[3 * f + 1], c = m.tris[3 * f + 2];
      // min angle of this facet (3D)
      const A: [number, number, number] = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]];
      const B: [number, number, number] = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]];
      const C: [number, number, number] = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
      const ab = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
      const bc = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]);
      const ca = Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]);
      const angle = (opp: number, x: number, y: number): number => { const v = (x * x + y * y - opp * opp) / (2 * x * y); return Math.acos(Math.max(-1, Math.min(1, v))) * 180 / Math.PI; };
      const minA = Math.min(angle(ab, bc, ca), angle(bc, ca, ab), angle(ca, ab, bc));
      if (minA >= 20) continue;
      nSliv++;
      const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3, cz = (A[2] + B[2] + C[2]) / 3;
      // nearest crest sample + 2nd nearest (for tangent direction)
      let d1 = Infinity, i1 = -1; for (let k = 0; k < crest.length; k++) { const p = crest[k]; const d = Math.hypot(cx - p[0], cy - p[1], cz - p[2]); if (d < d1) { d1 = d; i1 = k; } }
      const onCrest = d1 < onCrestThresh;
      if (onCrest) nOnCrest++; else { nOffCrest++; continue; }
      // crest tangent: nearest OTHER crest sample within a small ball forms the local along-crest direction
      let dT = Infinity; let tanV: [number, number, number] | null = null;
      const p1 = crest[i1];
      for (let k = 0; k < crest.length; k++) { if (k === i1) continue; const p = crest[k]; const d = Math.hypot(p1[0] - p[0], p1[1] - p[1], p1[2] - p[2]); if (d > 1e-4 && d < dT) { dT = d; tanV = [p[0] - p1[0], p[1] - p1[1], p[2] - p1[2]]; } }
      if (!tanV) continue;
      const tl = Math.hypot(tanV[0], tanV[1], tanV[2]) || 1e-9; tanV = [tanV[0] / tl, tanV[1] / tl, tanV[2] / tl];
      // longest edge of the facet
      const edges: Array<[[number, number, number], [number, number, number], number]> = [[A, B, ab], [B, C, bc], [C, A, ca]];
      edges.sort((x, y) => y[2] - x[2]); const [E0, E1] = edges[0];
      let ev: [number, number, number] = [E1[0] - E0[0], E1[1] - E0[1], E1[2] - E0[2]];
      const el = Math.hypot(ev[0], ev[1], ev[2]) || 1e-9; ev = [ev[0] / el, ev[1] / el, ev[2] / el];
      const dot = Math.abs(ev[0] * tanV[0] + ev[1] * tanV[1] + ev[2] * tanV[2]);
      const angToCrest = Math.acos(Math.max(0, Math.min(1, dot))) * 180 / Math.PI; // 0=along crest, 90=across
      angToCrestList.push(angToCrest);
      if (angToCrest > 45) nNeedleAcross++; else nChordAcross++;
    }
    const angMed = pctl(angToCrestList, 0.5);
    plog(`[diag Q2] slivers(<20deg)=${nSliv} (${(100 * nSliv / nF).toFixed(1)}%) onCrest=${nOnCrest} offCrest=${nOffCrest} | onCrest longest-edge-angle-to-crest: needleAcross(>45)=${nNeedleAcross} chordAlong(<45)=${nChordAcross} medAng=${angMed.toFixed(1)}deg`);

    // sample metric anisotropy at a few onCrest sliver centroids (su/st) to characterize the flank steepness
    const uMid = (patch.uLo + patch.uHi) / 2; const { su, st } = metricScales(rA, H, ((uMid % 1) + 1) % 1, T_CENTER);
    plog(`[diag] metric at band center: su=${su.toFixed(2)} st=${st.toFixed(2)} (arcPerU=${patch.arcPerU.toFixed(2)})`);

    void lift;
    const row = {
      key: 'diag', target: 'GeometricStar', src, tris: nF,
      subPitchMin: +spMin.toFixed(4), subPitchP50: +spP50.toFixed(4), subPitchMean: +spMean.toFixed(4),
      pctBelow20: +q.pctBelow20.toFixed(1), minAngleDeg: +q.minAngleDeg.toFixed(2), medianMinAngle: +q.medianMinAngleDeg.toFixed(2),
      nSliv, onCrestSliv: nOnCrest, offCrestSliv: nOffCrest, onCrestFrac: +(nOnCrest / Math.max(1, nSliv)).toFixed(3),
      needleAcross: nNeedleAcross, chordAlong: nChordAcross, medAngToCrest: +angMed.toFixed(1),
      onCrestThresh: +onCrestThresh.toFixed(4),
      maxSquareHalfWidthMm: +(0.5 * spP50).toFixed(4),
    };
    writeFileSync(join(DIR, 'diag.json'), JSON.stringify(row, null, 2));
    checkpoint(row);
    expect(nF).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
