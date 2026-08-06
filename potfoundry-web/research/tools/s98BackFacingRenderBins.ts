// s98BackFacingRenderBins.ts — the render bins for S98-BF's visual evidence.
//
// THE LAB RENDERER CANNOT SHOW THIS DEFECT. `research/render/meshRender.cjs` builds every material with
// `side: THREE.DoubleSide` (lines 78-79), which lights a back-facing triangle exactly like a front-facing
// one. So every picture this campaign has ever produced is BLIND to the class this experiment is about.
// The companion renderer `s98BackfaceRender.cjs` renders the SAME bins twice, once DoubleSide (what the
// lab always saw) and once FrontSide (backface culling ON — what a slicer, a WebGL viewer and the app's
// own preview do), so the defect appears as MISSING GEOMETRY next to the picture that hides it.
//
// Emits, per requested mesh:
//   <tag>_full  — the whole mesh
//   <tag>_patch — a local patch around the worst bucket-(a) facet (by |worstDeg|), with a colour buffer
//                 painting bucket-(a) facets RED and everything else neutral clay.
//
// Usage: bash research/tools/run-s98-render.sh
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STL = process.env.PF_S98R_STL ?? '';
const NDJSON = process.env.PF_S98R_NDJSON ?? '';
const TAG = process.env.PF_S98R_TAG ?? 'mesh';
const OUTDIR = process.env.PF_S98R_OUT ?? 'research/exchange/_strataConformBisect/s98bf/render';
const PATCH_MM = envF('PF_S98R_PATCH', 3.0);
const PICK = Math.round(envF('PF_S98R_PICK', 0));   // which bucket-(a) facet to centre the patch on (rank by worstDeg)

mkdirSync(OUTDIR, { recursive: true });

function readStl(path: string): { xyz: Float64Array; nTri: number } {
  const buf = readFileSync(path);
  const nTri = buf.readUInt32LE(80);
  const xyz = new Float64Array(nTri * 9);
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; }
    o += 2;
  }
  return { xyz, nTri };
}
const M = readStl(STL);
const rows = readFileSync(NDJSON, 'utf8').trim().split('\n').filter((s) => s.length > 0)
  .map((s) => JSON.parse(s) as { tri: number; worstDeg: number; minAng: number; areaMm2: number });
log(`${TAG}: ${M.nTri} facets, ${rows.length} bucket-(a) records`);
const bad = new Set<number>(rows.map((r) => r.tri));

function dump(name: string, tris: number[], mark: Set<number>): void {
  const pos = new Float32Array(tris.length * 9);
  const col = new Float32Array(tris.length * 9);
  const idx = new Uint32Array(tris.length * 3);
  for (let q = 0; q < tris.length; q += 1) {
    const o = tris[q] * 9;
    const isBad = mark.has(tris[q]);
    for (let k = 0; k < 9; k += 1) pos[q * 9 + k] = M.xyz[o + k];
    for (let v = 0; v < 3; v += 1) {
      // RED for a bucket-(a) facet, neutral clay otherwise. Per-CORNER (STL soup) so nothing smooths across
      // a facet boundary — the research/render README's flat-shade rule.
      col[q * 9 + v * 3] = isBad ? 0.87 : 0.81;
      col[q * 9 + v * 3 + 1] = isBad ? 0.09 : 0.54;
      col[q * 9 + v * 3 + 2] = isBad ? 0.09 : 0.35;
    }
    idx[q * 3] = q * 3; idx[q * 3 + 1] = q * 3 + 1; idx[q * 3 + 2] = q * 3 + 2;
  }
  writeFileSync(`${OUTDIR}/${name}.xyz.bin`, Buffer.from(pos.buffer, pos.byteOffset, pos.byteLength));
  writeFileSync(`${OUTDIR}/${name}.idx.bin`, Buffer.from(idx.buffer, idx.byteOffset, idx.byteLength));
  writeFileSync(`${OUTDIR}/${name}.col.bin`, Buffer.from(col.buffer, col.byteOffset, col.byteLength));
  writeFileSync(`${OUTDIR}/${name}.meta.json`, JSON.stringify({ name, tris: tris.length, nBad: tris.filter((t) => mark.has(t)).length }));
  log(`  ${name}: ${tris.length} tris, ${tris.filter((t) => mark.has(t)).length} bucket-(a)`);
}

// whole mesh
{
  const all: number[] = [];
  for (let t = 0; t < M.nTri; t += 1) all.push(t);
  dump(`${TAG}_full`, all, bad);
}

// patch around the chosen bucket-(a) facet
if (rows.length > 0) {
  const ranked = rows.slice().sort((a, b) => b.worstDeg - a.worstDeg);
  const pick = ranked[Math.min(PICK, ranked.length - 1)];
  const o = pick.tri * 9;
  const cx = (M.xyz[o] + M.xyz[o + 3] + M.xyz[o + 6]) / 3;
  const cy = (M.xyz[o + 1] + M.xyz[o + 4] + M.xyz[o + 7]) / 3;
  const cz = (M.xyz[o + 2] + M.xyz[o + 5] + M.xyz[o + 8]) / 3;
  const sel: number[] = [];
  for (let t = 0; t < M.nTri; t += 1) {
    const q = t * 9;
    const gx = (M.xyz[q] + M.xyz[q + 3] + M.xyz[q + 6]) / 3;
    const gy = (M.xyz[q + 1] + M.xyz[q + 4] + M.xyz[q + 7]) / 3;
    const gz = (M.xyz[q + 2] + M.xyz[q + 5] + M.xyz[q + 8]) / 3;
    if (Math.hypot(gx - cx, gy - cy, gz - cz) < PATCH_MM) sel.push(t);
  }
  log(`  patch centre tri ${pick.tri} worstDeg ${pick.worstDeg.toFixed(1)} minAng ${pick.minAng.toFixed(2)} at (${cx.toFixed(2)},${cy.toFixed(2)},${cz.toFixed(2)}), radius ${PATCH_MM}mm`);
  dump(`${TAG}_patch`, sel, bad);
}
log('done');
