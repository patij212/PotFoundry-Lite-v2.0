// s119MeshClassCensus.ts — S119 TASK 3.5: WHICH FACETS CANNOT BE SCORED BY *ANY* RADIAL REFERENCE?
//
// The cliff model (s119CliffLib) extends the reference from the graph of rA to the boundary of the solid,
// which absorbs TREADS (horizontal ledges) wherever they stand over the discontinuity set. Two classes
// still fall outside it and must be reported separately rather than folded in (the S103 precedent):
//   CAP     — facets lying in the z=0 / z=H disks. Boundary of the solid, but not lateral surface.
//   OVERHANG— facets whose outward normal points INWARD in the radial sense, i.e. a wall that is not a
//             graph over (theta,z) at all. A radial model of ANY kind (graph or curtain) cannot score
//             these, because the solid they bound is not radially star-shaped there.
// This census counts both, plus the near-horizontal (tread-like) population, so the scorecard's coverage
// is a measured number rather than an assumption.
//
// Usage: bash research/tools/run-s119-census.sh   env PF_S119M_STL PF_S119M_TAG PF_S119M_H
import { readMeshF32 } from './s118MeshIo';
import { writeFileSync, mkdirSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const STL = envS('PF_S119M_STL', '');
const TAG = envS('PF_S119M_TAG', 'RUN');
const H = envF('PF_S119M_H', 120);
const OUTDIR = envS('PF_S119M_OUTDIR', 'research/exchange/_strataConformBisect/s119');
const CAP_EPS = envF('PF_S119M_CAPEPS', 1e-4);

const { xyz, nTri } = readMeshF32(STL);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S119 MESH CLASS CENSUS — ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh ${STL}   ${nTri.toLocaleString()} facets`);

let zMin = Infinity; let zMax = -Infinity; let areaTot = 0;
let nCapB = 0; let aCapB = 0; let nCapT = 0; let aCapT = 0;
const NZB = 20;
const horizN = new Float64Array(NZB); const horizA = new Float64Array(NZB);
let nRadOut = 0; let aRadOut = 0;
for (let f = 0; f < nTri; f += 1) {
  const b = f * 9;
  const ax = xyz[b], ay = xyz[b + 1], az = xyz[b + 2];
  const bx = xyz[b + 3], by = xyz[b + 4], bz = xyz[b + 5];
  const cx = xyz[b + 6], cy = xyz[b + 7], cz = xyz[b + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz); const ar = 0.5 * L;
  areaTot += ar;
  if (L > 0) { nx /= L; ny /= L; nz /= L; }
  zMin = Math.min(zMin, az, bz, cz); zMax = Math.max(zMax, az, bz, cz);
  if (az < CAP_EPS && bz < CAP_EPS && cz < CAP_EPS) { nCapB += 1; aCapB += ar; }
  if (az > H - CAP_EPS && bz > H - CAP_EPS && cz > H - CAP_EPS) { nCapT += 1; aCapT += ar; }
  // |nz| ladder: how much of the mesh is a horizontal ledge?
  const bI = Math.min(NZB - 1, Math.floor(Math.abs(nz) * NZB));
  horizN[bI] += 1; horizA[bI] += ar;
  // radial orientation: a graph-over-(theta,z) wall has outward normal with a POSITIVE radial component
  const mx = (ax + bx + cx) / 3; const my = (ay + by + cy) / 3;
  const rr = Math.hypot(mx, my);
  if (rr > 0) { const dot = (nx * mx + ny * my) / rr; if (dot < 0) { nRadOut += 1; aRadOut += ar; } }
}
const pc = (a: number): string => `${((100 * a) / areaTot).toFixed(4)}%`;
log(`   3D area ${areaTot.toFixed(3)} mm2    z range ${zMin.toFixed(4)} .. ${zMax.toFixed(4)} mm   (H = ${H})`);
log('');
log(`── CAP class (all corners within ${CAP_EPS} mm of a cap plane) ──`);
log(`   bottom z=0 : ${nCapB.toLocaleString()} facets  ${aCapB.toFixed(3)} mm2  ${pc(aCapB)} OF MESH`);
log(`   top    z=H : ${nCapT.toLocaleString()} facets  ${aCapT.toFixed(3)} mm2  ${pc(aCapT)} OF MESH`);
log('');
log('── |n_z| LADDER — how much of the mesh is a horizontal ledge (a TREAD)? ──');
log('    |n_z| band        count        area mm2      %MESH');
for (let i = NZB - 1; i >= 0; i -= 1) {
  if (horizN[i] === 0) continue;
  log(`   ${(i / NZB).toFixed(2)}..${((i + 1) / NZB).toFixed(2)}   ${String(horizN[i]).padStart(12)}   ${horizA[i].toFixed(3).padStart(12)}   ${pc(horizA[i]).padStart(9)}`);
}
log('');
log('── RADIALLY INWARD-FACING facets (outward normal has a NEGATIVE radial component) ──');
log(`   ${nRadOut.toLocaleString()} facets  ${aRadOut.toFixed(3)} mm2  ${pc(aRadOut)} OF MESH`);
log('   These are the ONLY class no radial reference can score: the solid is not star-shaped in rho there,');
log('   so neither the graph of rA nor its curtain describes the surface they approximate. A near-vertical');
log('   riser standing ON a curtain reads |n_z| ~ 0 and a POSITIVE radial component, so it is NOT in this class.');
mkdirSync(OUTDIR, { recursive: true });
writeFileSync(`${OUTDIR}/S119_CENSUS_${TAG}.json`, JSON.stringify({
  stl: STL, nTri, areaTot, zMin, zMax, capB: { n: nCapB, a: aCapB }, capT: { n: nCapT, a: aCapT },
  horizN: Array.from(horizN), horizA: Array.from(horizA), radInward: { n: nRadOut, a: aRadOut },
}, null, 1));
log(`json -> ${OUTDIR}/S119_CENSUS_${TAG}.json`);
log('S119 MESH CLASS CENSUS DONE');
