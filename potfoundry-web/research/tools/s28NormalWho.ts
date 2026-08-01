// s28NormalWho.ts — WHICH FACET DID THE [NORMAL] GATE FAIL ON? RESEARCH ONLY. ARTIFACT-ONLY, REPORT-ONLY.
//
// The S28 iterate `_S28i1` moved the campaign's most stable texture number: the certificate's [NORMAL] gate
// went 0 -> 1. `_S24i2` and every arm since `_S21B` read 0. A count is not a finding until the thing it
// counts has a name, so this names it.
//
// IT RE-USES THE UNTOUCHABLE'S OWN CENSUS AND ADDS NOTHING. `_judgeNormal.facetNormalCensus` is imported
// READ-ONLY and called with the same rA (`buildAuditRadiusFn`), the same H, the same detected C0 jump lists
// and the same step sizes the certificate uses, so the counts it returns here must equal the certificate's
// or one of the two is wrong — which is checked, below, and refused if it does not hold. The ONLY difference
// is `nWorst`: the certificate prints the top 12 by deviation and the gated facet was not among them (all 12
// were feature-spanning), so this asks for a much longer list and then filters it by the GATE'S OWN
// predicate as the census reports it per facet: off-locus, not feature-spanning, and >= 90 degrees.
//
// A facet is GATED when it is back-facing against the analytic normal at the centroid AND at all three
// vertex parameter points. `NormalWorst.featureSpan` is exactly the "front-facing somewhere in its own
// footprint" escape, so `!onLocus && !featureSpan && deg >= 90` is the gated population, transcribed from
// the gate rather than re-derived beside it.
//
// USAGE  node <bundle> [stl] [nWorst]
//   env: PF_S28NW_STYLE (GothicArches)

import { existsSync } from 'node:fs';
import { detectThetaJumps, detectZJumps } from '../bridge/_facetTruthLib';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetNormalCensus, normalGate } from '../bridge/_judgeNormal';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import type { StyleDims } from '../bridge/runStyle';

/* eslint-disable no-console */
const log = console.log;

const STL = process.argv[2] ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S28i1.stl';
const NWORST = Number(process.argv[3] ?? 40000);
const STYLE = process.env.PF_S28NW_STYLE ?? 'GothicArches';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

if (!existsSync(STL)) {
  log(`*** S28 NORMAL-WHO FAILED: STL not found: ${STL} ***`);
  process.exit(1);
}

const rA = buildAuditRadiusFn(STYLE, registryDefaults(STYLE), DIMS, H).rA;
const { xyz, nTri } = readMeshFloat64(STL, false);
const zJumps = detectZJumps(rA, H);
const thJumps = detectThetaJumps(rA, H);

log(`\n===== S28 NORMAL-WHO =====`);
log(`stl ${STL}  (${nTri} facets)   C0 z-steps ${zJumps.length}, theta-jumps ${thJumps.length}   nWorst ${NWORST}`);

const nc = facetNormalCensus(rA, xyz, nTri, { H, zJumps, thJumps, nWorst: NWORST });
const g = normalGate(nc);

log(`gate ${g.id}: ${g.pass ? 'PASS' : '*** FAIL ***'}   count ${g.count} (expected ${g.expected})`);
log(`wind ${nc.windSign > 0 ? 'OUTWARD' : nc.windSign < 0 ? 'INWARD' : 'AMBIGUOUS'} ${(100 * nc.windAgreeFrac).toFixed(2)}%`);
log(`deviation p50 ${nc.degP50.toFixed(4)}  p90 ${nc.degP90.toFixed(4)}  p99 ${nc.degP99.toFixed(4)}  MAX ${nc.degMax.toFixed(4)} (tri ${nc.degMaxTri})`);
log(`off-locus  >=15 ${nc.over15}  >=30 ${nc.over30}  >=45 ${nc.over45}  >=60 ${nc.over60}  >=90 ${nc.over90}  >=120 ${nc.over120}  >=150 ${nc.over150}`);
log(`nBackFacing (THE GATE) ${nc.nBackFacing}   featureSpanBack ${nc.nFeatureSpanBack}   onLocus ${nc.nOnLocus}   degenerate ${nc.nDegenerate}`);
log(`worst list length ${nc.worst.length} of nWorst ${NWORST}`);

// THE GATED POPULATION, TRANSCRIBED FROM THE GATE'S OWN PER-FACET FLAGS.
const gated = nc.worst.filter((w) => !w.onLocus && !w.featureSpan && w.deg >= 90);
log(`\n--- FACETS MATCHING THE GATE PREDICATE INSIDE THE WORST LIST: ${gated.length} ---`);
for (const w of gated) {
  log(`  tri ${String(w.tri).padStart(9)}  ${w.deg.toFixed(3)} deg  th ${w.th.toFixed(5)}  z ${w.z.toFixed(4)}`
    + `   <-- BACK-FACING AT THE CENTROID *AND* AT ALL THREE VERTEX PARAMETER POINTS`);
}

// NON-VACUITY. If the worst list did not reach 90 degrees it cannot contain the gated facet, and an empty
// result would then mean "did not look far enough", not "no such facet" — the two must never be confused.
const minDeg = nc.worst.length > 0 ? nc.worst[nc.worst.length - 1].deg : Infinity;
log(`\nthe worst list reaches down to ${Number.isFinite(minDeg) ? minDeg.toFixed(3) : 'n/a'} deg`);
if (gated.length !== nc.nBackFacing) {
  log(`*** INCONCLUSIVE: found ${gated.length} gated facet(s) in the list but the census counts ${nc.nBackFacing}.`);
  if (minDeg > 90) log(`*** The list bottoms out at ${minDeg.toFixed(3)} deg, ABOVE the 90 deg gate threshold — raise nWorst and re-run. ***`);
  else log('*** The list reaches below 90 deg, so the shortfall is NOT a truncation. Do not quote either number. ***');
  process.exit(2);
}
log(`\nCONSISTENT: ${gated.length} facet(s) found, census nBackFacing ${nc.nBackFacing}. The gate's count has a name.`);
log('===== END S28 NORMAL-WHO =====\n');
