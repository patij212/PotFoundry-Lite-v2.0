// s118ThinCensus.ts — S118 DRIVE: separate "the facet is a NEEDLE" from "the facet is SMALL".
//
// s118Score's needle class is `arc-space minimum altitude < 2 um`. That is an ABSOLUTE length, and it was
// chosen when the meshes under test had ~1e6 facets whose arc footprints were tens of microns across. It
// is a good defect test at that density. At the densities this session drives to it stops being one: an
// EQUILATERAL arc-space triangle of side 4 um has a minimum altitude of 3.5 um, and one of side 2.3 um
// has 2.0 um. So a perfectly-shaped facet crosses the "needle" bar purely by getting small.
//
// That distinction decides an artefact verdict, so it is measured rather than argued:
//   NEEDLE (absolute)   minAlt < NEEDLEUM um            — what s118Score reports
//   THIN   (scale-free) minAlt / longest arc edge < TAU — a SHAPE test, invariant to size
// A facet that is THIN is a real degeneracy at any density. A facet that is NEEDLE but not THIN is small.
// Both are reported as COUNT + AREA-share + MAX, and the size floor is priced against the two consumers
// that care: the f32 STL coordinate quantum, and the smallest feature a slicer will resolve.
//
// Usage: node research/bridge/out/_run_s118ThinCensus.cjs
//   env PF_S118T_STL(abs) PF_S118T_TAG PF_S118T_NEEDLEUM PF_S118T_TAU
import { dThRaw } from '../bridge/_sweepPredicate';
import { facetGeom } from './s118ScoreLib';
import { readMeshF32 } from './s118MeshIo';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));

const STL = envS('PF_S118T_STL', '');
const TAG = envS('PF_S118T_TAG', 'RUN');
const NEEDLE_UM = envF('PF_S118T_NEEDLEUM', 2);
const TAUS = envS('PF_S118T_TAUS', '0.005,0.01,0.02,0.05,0.1').split(',').map(Number);
if (STL.length === 0) { log('*** PF_S118T_STL required ***'); process.exit(2); }

const T0 = Date.now();
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S118 THIN CENSUS — NEEDLE (absolute) vs THIN (scale-free)   tag ${TAG} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`mesh ${STL}`);

const { xyz, nTri } = readMeshF32(STL);
let area3 = 0;
let ndlC = 0; let ndlA = 0;
let minAlt = Infinity; let minThin = Infinity; let minEdgeArc = Infinity; let minEdge3 = Infinity;
let invC = 0; let poleC = 0;
const thinC = new Array<number>(TAUS.length).fill(0);
const thinA = new Array<number>(TAUS.length).fill(0);
// cross-tabulate: of the facets the ABSOLUTE bar convicts, how many are actually badly shaped?
let ndlAndThinC = 0; let ndlAndThinA = 0;
const thinVals: number[] = [];
const altVals: number[] = [];
for (let f = 0; f < nTri; f += 1) {
  const b = f * 9;
  const ax = xyz[b], ay = xyz[b + 1], az = xyz[b + 2];
  const bx = xyz[b + 3], by = xyz[b + 4], bz = xyz[b + 5];
  const cx = xyz[b + 6], cy = xyz[b + 7], cz = xyz[b + 8];
  const tha = Math.atan2(ay, ax);
  const thb = tha + dThRaw(tha, Math.atan2(by, bx));
  const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
  const G = facetGeom(ax, ay, az, bx, by, bz, cx, cy, cz, tha, thb, thc);
  area3 += G.area;
  if (G.apsSign < 0) invC += 1;
  if (G.graphRatio >= 100) poleC += 1;
  const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  const e1 = Math.hypot((thb - tha) * rm, bz - az);
  const e2 = Math.hypot((thc - thb) * rm, cz - bz);
  const e3 = Math.hypot((tha - thc) * rm, az - cz);
  const emax = Math.max(e1, e2, e3);
  const emin = Math.min(e1, e2, e3);
  const thin = emax > 0 ? (G.minAltUm / 1000) / emax : 0;
  const isN = G.minAltUm < NEEDLE_UM;
  if (isN) { ndlC += 1; ndlA += G.area; }
  for (let i = 0; i < TAUS.length; i += 1) if (thin < TAUS[i]) { thinC[i] += 1; thinA[i] += G.area; }
  if (isN && thin < 0.02) { ndlAndThinC += 1; ndlAndThinA += G.area; }
  if (G.minAltUm < minAlt) minAlt = G.minAltUm;
  if (thin < minThin) minThin = thin;
  if (emin < minEdgeArc) minEdgeArc = emin;
  const d3 = Math.min(
    Math.hypot(bx - ax, by - ay, bz - az),
    Math.hypot(cx - bx, cy - by, cz - bz),
    Math.hypot(ax - cx, ay - cy, az - cz),
  );
  if (d3 < minEdge3) minEdge3 = d3;
  if (f % 37 === 0) { thinVals.push(thin); altVals.push(G.minAltUm); }
}
thinVals.sort((a, b) => a - b); altVals.sort((a, b) => a - b);
const q = (v: number[], p: number): number => (v.length === 0 ? NaN : v[Math.min(v.length - 1, Math.floor(v.length * p))]);
const pct = (a: number, b: number): string => (b > 0 ? ((a / b) * 100).toFixed(4) : 'n/a');

log(`facets ${nTri.toLocaleString()}   3D area ${area3.toFixed(3)} mm2`);
log('');
log(`── ABSOLUTE bar (what s118Score reports): arc min altitude < ${NEEDLE_UM} um ──`);
log(`   ${ndlC.toLocaleString()} facets (${pct(ndlC, nTri)}%)   ${ndlA.toFixed(4)} mm2 = ${pct(ndlA, area3)}% OF MESH`);
log('');
log('── SCALE-FREE bar (a SHAPE test): arc minAlt / longest arc edge < tau. The ladder is swept (scar 4). ──');
log('        tau        count       %count       area mm2      %MESH area');
for (let i = 0; i < TAUS.length; i += 1) {
  log(`   ${TAUS[i].toFixed(4).padStart(8)}  ${thinC[i].toLocaleString().padStart(11)}  ${pct(thinC[i], nTri).padStart(10)}%  ${thinA[i].toFixed(4).padStart(13)}  ${pct(thinA[i], area3).padStart(12)}%`);
}
log(`   an EQUILATERAL arc triangle has ratio 0.866; a right isoceles one 0.5; the seed grid's is 0.5.`);
log('');
log('── CROSS-TABULATION — the question the two bars disagree about ──');
log(`   convicted by the ABSOLUTE bar: ${ndlC.toLocaleString()} facets, ${ndlA.toFixed(4)} mm2`);
log(`   of those, ALSO badly shaped (ratio < 0.02): ${ndlAndThinC.toLocaleString()} facets, ${ndlAndThinA.toFixed(4)} mm2`);
log(`   => ${pct(ndlC - ndlAndThinC, Math.max(1, ndlC))}% of the "needles" are WELL-SHAPED FACETS THAT ARE MERELY SMALL.`);
log('');
log('── DISTRIBUTIONS (1-in-37 stride, for shape only; every COUNT/AREA above is EXHAUSTIVE) ──');
log(`   arc min altitude um: p01 ${q(altVals, 0.01).toFixed(4)}  p50 ${q(altVals, 0.5).toFixed(4)}  p99 ${q(altVals, 0.99).toFixed(4)}   MESH MIN ${minAlt.toFixed(6)} um`);
log(`   shape ratio        : p01 ${q(thinVals, 0.01).toFixed(4)}  p50 ${q(thinVals, 0.5).toFixed(4)}  p99 ${q(thinVals, 0.99).toFixed(4)}   MESH MIN ${minThin.toFixed(6)}`);
log('');
log('── SIZE FLOOR, priced against the consumers that care (scar 6) ──');
log(`   min ARC edge ${(minEdgeArc * 1000).toFixed(4)} um    min 3D edge ${(minEdge3 * 1000).toFixed(4)} um`);
log(`   f32 coordinate quantum at r=50 mm is 3.8147e-3 um  =>  min 3D edge is ${(minEdge3 * 1000 / 3.8147e-3).toFixed(0)}x the quantum`);
log(`   a 0.4 mm FDM nozzle / 25 um SLA pixel is ${(400 / (minEdge3 * 1000)).toFixed(0)}x / ${(25 / (minEdge3 * 1000)).toFixed(0)}x the min 3D edge`);
log('');
log(`   FOOTPRINT-SIGN INVERSIONS ${invC}   DEGENERACY POLES (graphRatio>=100) ${poleC}`);
log(`WALL ${((Date.now() - T0) / 1000).toFixed(1)} s`);
log('S118 THIN CENSUS DONE');
