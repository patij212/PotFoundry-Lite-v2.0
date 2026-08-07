// s117EdgeCensus.ts — S117 P2 CONTROL: what edge lengths does the mesh ACTUALLY contain?
//
// The sizing-field probe PREDICTS that at the shipping config the field never asks for an edge below
// ~0.054 mm (Gothic) — so the quadtree, whose refinement test is `max(physW,physH) > field.edgeLength`,
// should emit essentially nothing below that. This tool tests the prediction against a real mesh.
// If the mesh contains a large population well BELOW the predicted field floor, the prediction is
// WRONG and the sizing-field probe is void as an explanation.
//
// Reports COUNT + AREA-share + MAX together (never a bare count, never a bare max), per the campaign's
// measurement discipline, plus the edge-length quantile ladder.
//
// Usage: PF_S117_STL=<abs> PF_S117_TAG=<tag> bash research/tools/run-s117-edges.sh
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { writeFileSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const STL = process.env.PF_S117_STL ?? '';
const TAG = process.env.PF_S117_TAG ?? 'X';
const OUTDIR = process.env.PF_S117_OUTDIR ?? 'research/exchange/_strataConformBisect/s117';
const PRED = Number(process.env.PF_S117_PRED ?? '0.053826'); // the predicted field floor
if (STL.length === 0) { log('*** PF_S117_STL required ***'); process.exit(2); }

const M = readMeshFloat64(STL, false);
const nE = M.nTri * 3;
const el = new Float64Array(nE);
const ea = new Float64Array(nE);     // the area of the facet the edge belongs to (for area-share)
let totalArea = 0;
let minAlt = Infinity;
for (let f = 0; f < M.nTri; f += 1) {
  const o = f * 9;
  const ax = M.xyz[o], ay = M.xyz[o + 1], az = M.xyz[o + 2];
  const bx = M.xyz[o + 3], by = M.xyz[o + 4], bz = M.xyz[o + 5];
  const cx = M.xyz[o + 6], cy = M.xyz[o + 7], cz = M.xyz[o + 8];
  const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const A = 0.5 * Math.hypot(nx, ny, nz);
  totalArea += A;
  const e0 = Math.hypot(bx - ax, by - ay, bz - az);
  const e1 = Math.hypot(cx - bx, cy - by, cz - bz);
  const e2 = Math.hypot(ax - cx, ay - cy, az - cz);
  el[f * 3] = e0; el[f * 3 + 1] = e1; el[f * 3 + 2] = e2;
  ea[f * 3] = A; ea[f * 3 + 1] = A; ea[f * 3 + 2] = A;
  const longest = Math.max(e0, e1, e2);
  if (longest > 0) { const alt = (2 * A) / longest; if (alt < minAlt) minAlt = alt; }
}

const idx = Array.from({ length: nE }, (_, i) => i).sort((a, b) => el[a] - el[b]);
const qv = (p: number): number => el[idx[Math.min(nE - 1, Math.floor(p * (nE - 1)))]];

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`   S117 EDGE CENSUS — ${TAG}`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl ${STL}`);
log(`${M.nTri} facets, ${nE} directed edges, 3D area ${totalArea.toFixed(3)} mm2, min facet altitude ${minAlt.toExponential(4)} mm`);
log('');
log('── EDGE-LENGTH QUANTILE LADDER (mm) ──');
for (const p of [0, 0.0001, 0.001, 0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 1]) {
  log(`   p${(p * 100).toFixed(2).padStart(6)}   ${qv(p).toExponential(5)}`);
}
log('');
log('── POPULATION BELOW EACH THRESHOLD: COUNT + AREA-SHARE + the MAX in that class ──');
log('   threshold (mm)   edges below   count-share    area-share of owning facets   longest edge in class');
for (const T of [0.2, 0.1, 0.0538, 0.04, 0.02, 0.01, 0.004, 0.0018, 0.0006, 1e-4]) {
  let n = 0; let a = 0; let mx = 0;
  const seen = new Set<number>();
  for (let i = 0; i < nE; i += 1) {
    if (el[i] < T) {
      n += 1; if (el[i] > mx) mx = el[i];
      const f = Math.floor(i / 3);
      if (!seen.has(f)) { seen.add(f); a += ea[i]; }
    }
  }
  const mark = Math.abs(T - PRED) < 1e-6 ? '  <== PREDICTED FIELD FLOOR' : '';
  log(`   ${T.toExponential(3).padStart(13)}   ${String(n).padStart(11)}   ${((n / nE) * 100).toFixed(5).padStart(10)}%   ${((a / totalArea) * 100).toFixed(5).padStart(26)}%   ${(n > 0 ? mx.toExponential(4) : '-').padStart(20)}${mark}`);
}
log('');
{
  let below = 0;
  for (let i = 0; i < nE; i += 1) if (el[i] < PRED) below += 1;
  log(`── VERDICT vs the sizing-field prediction (field floor ${PRED} mm) ──`);
  log(`   edges below the predicted floor: ${below} / ${nE} = ${((below / nE) * 100).toFixed(5)}%`);
  log(`   shortest edge in the mesh: ${qv(0).toExponential(5)} mm  (${(qv(0) / PRED).toFixed(4)}x the predicted floor)`);
  log(`   PREDICTION ${below / nE < 0.02 ? 'HOLDS' : '*** FAILS — the mesh carries a large sub-floor population; the sizing-field explanation is INCOMPLETE ***'}`);
  log('   NOTE: a small sub-floor population is EXPECTED — transition templates, the u-seam, cap fans and');
  log('   the pinned rings emit edges the sizing field never sized. Those are TOPOLOGY, not the field.');
}
writeFileSync(`${OUTDIR}/S117_EDGES_${TAG}.json`, JSON.stringify({
  stl: STL, nTri: M.nTri, nE, totalArea, minAlt, pred: PRED,
  quantiles: Object.fromEntries([0, 0.0001, 0.001, 0.01, 0.05, 0.5, 0.99, 1].map((p) => [p, qv(p)])),
}, null, 2));
log(`json -> ${OUTDIR}/S117_EDGES_${TAG}.json`);
log('S117 EDGE CENSUS DONE');
