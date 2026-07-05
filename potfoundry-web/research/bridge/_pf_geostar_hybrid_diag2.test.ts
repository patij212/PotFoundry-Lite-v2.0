// _pf_geostar_hybrid_diag2.test.ts — DEV-ONLY (PF_GSHYBDIAG2=1). FOLLOW-UP discriminator.
//
// diag1 SURPRISE: 91% of the 21.7% GeoStar slivers are OFF-crest (23087 off / 2282 on). The HYBRID premise (strip
// the crest flank + apex-refine) targets the ON-crest 9% — it cannot touch the dominant OFF-crest population. This
// probe characterizes the OFF-crest slivers to decide the real lever:
//   (A) Are they grading-transition needles (a dense refined cavity abutting a coarse panel cell → high edge-length
//       ratio)? Measure per-off-crest-sliver the ratio (longest incident edge / shortest incident edge) at its verts.
//   (B) Are they concentrated near the crest band (within k*subpitch) or spread across the whole smooth panel?
//   (C) What does the ORIGINAL (pre-whole-mesh-refine) brute mesh look like vs the wholemesh mesh — did the extra
//       whole-mesh refine passes CREATE the off-crest slivers? Compare pctBelow20 + off/on split on BOTH meshes.
//
// If off-crest slivers are grading-transition from the whole-mesh refine's uniform edge-split + full-cdt2d re-tri,
// the lever is a cleaner refine (structured/graded) of the PANEL, not a crest strip. If they are intrinsic to the
// seed's chevron field, the tension is confirmed structural. Cheap (no long guard).
//
// ISOLATION: NEW file. Reloads BOTH persisted meshes READ-ONLY. Reuses labkit + _pf_perfectMesherLib + patch lib.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { triangleQualityDistribution } from './labkit';
import { extractProtectedComplex, liftMesh } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';

const DIR = join(process.cwd(), 'research', 'exchange', '_pf_geostar_hybrid_diag');
const NDJSON = join(DIR, 'scorecard2.ndjson');
const WHOLEMESH_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_wholemesh', 'refined_mesh.bin');
const BRUTE_BIN = join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_brute', 'refined_mesh.bin');

const BAYS = Number(process.env.PF_BAYS ?? 5);
const ZBAND_MM = Number(process.env.PF_ZBAND ?? 10);
const T_CENTER = Number(process.env.PF_TCENTER ?? 0.08);
const N_ROW = 260, N_COL = 260, MIN_AMP = 0.03;

const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); /* eslint-disable-next-line no-console */ console.log(`[${new Date().toISOString()}] ${m}`); };
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

function analyze(tag: string, patch: ReturnType<typeof makeGeoStarPatch>, m: { uv: number[]; tris: number[] }, crest: Array<[number, number, number]>, subP50: number): Record<string, unknown> {
  const xyz = liftMesh(patch, m.tris ? m.uv : m.uv);
  const nF = m.tris.length / 3;
  const q = triangleQualityDistribution({ vertices: xyz, indices: Int32Array.from(m.tris) });
  // per-vertex incident edge lengths (3D) for edge-ratio at sliver verts
  const nV = m.uv.length / 2;
  const vMinE = new Float64Array(nV).fill(Infinity); const vMaxE = new Float64Array(nV);
  const edge = (a: number, b: number): number => Math.hypot(xyz[3 * a] - xyz[3 * b], xyz[3 * a + 1] - xyz[3 * b + 1], xyz[3 * a + 2] - xyz[3 * b + 2]);
  for (let f = 0; f < nF; f++) {
    const a = m.tris[3 * f], b = m.tris[3 * f + 1], c = m.tris[3 * f + 2];
    for (const [x, y] of [[a, b], [b, c], [c, a]] as Array<[number, number]>) { const e = edge(x, y); if (e < vMinE[x]) vMinE[x] = e; if (e > vMaxE[x]) vMaxE[x] = e; if (e < vMinE[y]) vMinE[y] = e; if (e > vMaxE[y]) vMaxE[y] = e; }
  }
  const onCrestThresh = Math.max(0.05, 0.5 * subP50);
  let nSliv = 0, nOn = 0, nOff = 0; const offRatios: number[] = []; const offCrestDist: number[] = [];
  for (let f = 0; f < nF; f++) {
    const a = m.tris[3 * f], b = m.tris[3 * f + 1], c = m.tris[3 * f + 2];
    const A: [number, number, number] = [xyz[3 * a], xyz[3 * a + 1], xyz[3 * a + 2]];
    const B: [number, number, number] = [xyz[3 * b], xyz[3 * b + 1], xyz[3 * b + 2]];
    const C: [number, number, number] = [xyz[3 * c], xyz[3 * c + 1], xyz[3 * c + 2]];
    const ab = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), bc = Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]), ca = Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2]);
    const ang = (opp: number, x: number, y: number): number => Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - opp * opp) / (2 * x * y)))) * 180 / Math.PI;
    const minA = Math.min(ang(ab, bc, ca), ang(bc, ca, ab), ang(ca, ab, bc));
    if (minA >= 20) continue; nSliv++;
    const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3, cz = (A[2] + B[2] + C[2]) / 3;
    let d1 = Infinity; for (let k = 0; k < crest.length; k++) { const p = crest[k]; const d = Math.hypot(cx - p[0], cy - p[1], cz - p[2]); if (d < d1) d1 = d; }
    if (d1 < onCrestThresh) { nOn++; continue; }
    nOff++;
    const ratio = Math.max(vMaxE[a] / Math.max(1e-9, vMinE[a]), vMaxE[b] / Math.max(1e-9, vMinE[b]), vMaxE[c] / Math.max(1e-9, vMinE[c]));
    offRatios.push(ratio); offCrestDist.push(d1);
  }
  const row = {
    key: tag, tris: nF, pctBelow20: +q.pctBelow20.toFixed(1), minAngle: +q.minAngleDeg.toFixed(2), median: +q.medianMinAngleDeg.toFixed(2),
    nSliv, onCrest: nOn, offCrest: nOff, offFrac: +(nOff / Math.max(1, nSliv)).toFixed(3),
    offEdgeRatioP50: +pctl(offRatios, 0.5).toFixed(2), offEdgeRatioP90: +pctl(offRatios, 0.9).toFixed(2), offEdgeRatioMax: +Math.max(0, ...offRatios).toFixed(2),
    offCrestDistP50: +pctl(offCrestDist, 0.5).toFixed(3), offCrestDistP90: +pctl(offCrestDist, 0.9).toFixed(3),
  };
  plog(`[${tag}] tris=${nF} pct<20=${row.pctBelow20}% sliv=${nSliv} on=${nOn} off=${nOff} offFrac=${row.offFrac} | offEdgeRatio p50=${row.offEdgeRatioP50} p90=${row.offEdgeRatioP90} max=${row.offEdgeRatioMax} | offCrestDist p50=${row.offCrestDistP50} p90=${row.offCrestDistP90}`);
  return row;
}

describe('pf-GEOSTAR-HYBRID-DIAG2: off-crest sliver characterization (grading-transition vs intrinsic)', () => {
  it.skipIf(process.env.PF_GSHYBDIAG2 !== '1')('characterize off-crest slivers on wholemesh + brute meshes', () => {
    const patch = makeGeoStarPatch(BAYS, ZBAND_MM, T_CENTER);
    const pc = extractProtectedComplex(patch, N_ROW, N_COL, MIN_AMP);
    const subP50 = 0.0678; // from diag1 on this exact mesh
    const wm = loadMesh(WHOLEMESH_BIN); const br = loadMesh(BRUTE_BIN);
    if (!wm && !br) { expect(false).toBe(true); return; }
    if (wm) checkpoint(analyze('wholemesh', patch, wm, pc.crestSamples3D, subP50));
    if (br) checkpoint(analyze('brute', patch, br, pc.crestSamples3D, subP50));
    expect(true).toBe(true);
  }, 60 * 60 * 1000);
});
