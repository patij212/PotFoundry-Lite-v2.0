// s96StrandedTail.ts — WHAT DO THE `unresolved` STRANDED FACETS COST ON THE HONEST RULER?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE GAP THIS FILLS. S95 priced the SHAPE-on Voronoi mesh at 0.86197% +-26.2% of surface PROVEN-FAILING
// (certifyTriangle @ 10 um) from a UNIFORM 8,000-facet sample. The 560 `shape-ar` strandees are 0.114% of
// that mesh, so a 1.63%-coverage uniform sample expects ~9 of them — and its in-sample max of 67.327 um
// against the driver's own reported worst unresolved of 263.072 um (edge ruler) says it did NOT catch the
// worst. S95 therefore stated its number as a fair estimate of the TYPICAL cost and an UNDER-ESTIMATE OF
// THE TAIL, and named this arm as the way to close it: score EXACTLY the strandees, not a sample.
//
// The driver deliberately emits only its own two rulers for these facets (`keyUm`, the sag key it gave up
// at, and `sagNowUm`, its edge ruler re-read on the shipped mesh) — its own comment says H1 is left out
// because "the refinement ruler must equal the audit ruler" and computing an approximation here would
// create a third, unvalidated ruler. So H1 has to be applied from outside, which is what this does.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MATCHING. The emitted record carries `tri` (the driver's INTERNAL index, which is NOT the shipped STL
// index — dead triangles are skipped when the soup is built), plus centroid (theta,z) and the three
// sorted edge lengths in um. Facets are matched into the STL on
//     (shortUm, midUm, longUm, z)
// which is highly discriminating, and the driver computed those on f32-ROUNDED vertices (`const ax =
// f32(vx[A])` at the emission site) — the same values the STL stores — so the key is exact, not fuzzy.
// The MATCH RATE IS REPORTED. An unmatched record is counted and excluded, never silently dropped, and a
// low match rate invalidates the arm rather than shrinking it.
//
// Usage: bash research/tools/run-s96-stranded-tail.sh
//   env: PF_S96_STEM  PF_S96_STYLE  PF_S96_TOL_MM(0.010)  PF_S96_NMAX(512)  PF_S96_H/RB/RT
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { readFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STEM = process.env.PF_S96_STEM ?? 'voronoi_ring_D--H_S94CTL';
const STYLE = process.env.PF_S96_STYLE ?? 'Voronoi';
const TOL = envF('PF_S96_TOL_MM', 0.010);
const NMAX = Math.round(envF('PF_S96_NMAX', 512));
const BAR_UM = TOL * 1000;
const DIMS: StyleDims = { H: envF('PF_S96_H', 120), Rb: envF('PF_S96_RB', 40), Rt: envF('PF_S96_RT', 50), expn: 1 };
const H = DIMS.H;
const DIR = 'research/exchange/_strataConformBisect';

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

const T0 = Date.now();
log('===== S96 — THE STRANDED TAIL ON THE HONEST RULER =====');
log(`stem ${STEM}  style ${STYLE}  bar ${BAR_UM} um  nMax ${NMAX}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}  detectThetaJumps ${thJ.length}`);

interface URec { tri: number; z: number; shortUm: number; midUm: number; longUm: number; keyUm: number; sagNowUm: number; why?: string; }
const raw = JSON.parse(readFileSync(`${DIR}/${STEM}.unresolved.json`, 'utf8')) as { facets?: URec[] };
const recs = raw.facets ?? [];
log(`unresolved records: ${recs.length}`);
if (recs.length === 0) { log('*** NO RECORDS — did the run set PF_CB_EMIT_UNRESOLVED=1? ABORT ***'); process.exit(1); }

const M = readMeshFloat64(`${DIR}/${STEM}.stl`, false);
const nTri = M.nTri; const xyz = M.xyz as unknown as Float64Array;
log(`${nTri} facets read   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

const areaOf = (o: number): number => {
  const ux = xyz[o + 3] - xyz[o]; const uy = xyz[o + 4] - xyz[o + 1]; const uz = xyz[o + 5] - xyz[o + 2];
  const wx = xyz[o + 6] - xyz[o]; const wy = xyz[o + 7] - xyz[o + 1]; const wz = xyz[o + 8] - xyz[o + 2];
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};
const keyOf = (s: number, m: number, l: number, z: number): string => `${s.toFixed(1)}|${m.toFixed(1)}|${l.toFixed(1)}|${z.toFixed(5)}`;

// index the mesh by (sorted edge lengths um, centroid z)
const index = new Map<string, number[]>();
let areaAll = 0;
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  areaAll += areaOf(o);
  const e = [
    Math.hypot(xyz[o + 3] - xyz[o + 6], xyz[o + 4] - xyz[o + 7], xyz[o + 5] - xyz[o + 8]),
    Math.hypot(xyz[o] - xyz[o + 6], xyz[o + 1] - xyz[o + 7], xyz[o + 2] - xyz[o + 8]),
    Math.hypot(xyz[o] - xyz[o + 3], xyz[o + 1] - xyz[o + 4], xyz[o + 2] - xyz[o + 5]),
  ].sort((p, q) => p - q).map((v) => v * 1000);
  const cz = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
  const k = keyOf(e[0], e[1], e[2], cz);
  const l = index.get(k); if (l === undefined) index.set(k, [t]); else l.push(t);
}
log(`mesh area ${areaAll.toFixed(2)} mm2, index keys ${index.size}   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

let matched = 0; let unmatched = 0; let ambiguous = 0;
let failProven = 0; let passProven = 0; let unknown = 0;
let areaFail = 0; let areaMatched = 0;
let witMax = 0; let witMaxTri = -1;
const wits: number[] = [];
for (const r of recs) {
  const cands = index.get(keyOf(r.shortUm, r.midUm, r.longUm, r.z));
  if (cands === undefined) { unmatched += 1; continue; }
  if (cands.length > 1) ambiguous += 1;
  const t = cands[0];
  matched += 1;
  const o = t * 9;
  const ar = areaOf(o); areaMatched += ar;
  const v = certifyTriangle(rA,
    xyz[o], xyz[o + 1], xyz[o + 2], xyz[o + 3], xyz[o + 4], xyz[o + 5], xyz[o + 6], xyz[o + 7], xyz[o + 8],
    { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
  const wUm = v.witnessed * 1000;
  wits.push(wUm);
  if (wUm > witMax) { witMax = wUm; witMaxTri = t; }
  if (wUm > BAR_UM) { failProven += 1; areaFail += ar; }
  else if (v.certified) passProven += 1;
  else unknown += 1;
  if (matched % 100 === 0) log(`  scored ${matched}/${recs.length}   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
}

wits.sort((a, b) => a - b);
const q = (f: number): number => (wits.length === 0 ? NaN : wits[Math.min(wits.length - 1, Math.floor(f * wits.length))]);

log('');
log('═══ RESULT — the STRANDED facets, scored individually ═══');
log(`  matched ${matched}/${recs.length}  (unmatched ${unmatched}, ambiguous-key ${ambiguous})`);
if (matched < recs.length * 0.9) log('  *** MATCH RATE BELOW 90% — the arm is NOT admissible, fix the matching before reading on ***');
log('');
log(`  PROVEN-FAIL ${failProven}/${matched} (${((100 * failProven) / Math.max(1, matched)).toFixed(2)}%)   PROVEN-PASS ${passProven}   UNKNOWN ${unknown}`);
log(`  honest witnessed on strandees (um): p50 ${q(0.5).toFixed(3)}  p90 ${q(0.9).toFixed(3)}  p99 ${q(0.99).toFixed(3)}  MAX ${witMax.toFixed(3)}  (facet ${witMaxTri})`);
log('');
log(`  strandee AREA        ${areaMatched.toFixed(4)} mm2 = ${((100 * areaMatched) / areaAll).toFixed(5)}% of the mesh`);
log(`  strandee FAILING AREA ${areaFail.toFixed(4)} mm2 = ${((100 * areaFail) / areaAll).toFixed(5)}% of the mesh`);
log('');
log('  ── against S95\'s UNIFORM arm on the same mesh (0.86197% +-26.2% failing area, in-sample max 67.327 um)');
log(`     the strandees contribute ${((100 * areaFail) / areaAll).toFixed(5)}% of surface, i.e. ${(((100 * areaFail) / areaAll) / 0.86197 * 100).toFixed(2)}% of the uniform estimate`);
log(`     and their honest MAX is ${witMax.toFixed(1)} um against the uniform sample's in-sample max of 67.327 um`);
log('');
log(`  driver's own view of the same facets: worst keyUm ${Math.max(...recs.map((r) => r.keyUm)).toFixed(3)} um (plane), worst sagNowUm ${Math.max(...recs.map((r) => r.sagNowUm)).toFixed(3)} um (edge)`);
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
