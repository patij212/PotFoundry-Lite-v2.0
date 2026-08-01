// s23WeldHub.ts — S23-T PRE-FLIGHT: THE WELD LEAD'S OWN REGISTERED DISCRIMINATOR, SCORED.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE QUESTION, VERBATIM FROM THE R4 CLOSE-OUT'S "WHAT REMAINS" LIST, ITEM 2
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   *"`addPt`'s `minSepMm` = 192.65 um weld annihilates stage-2 crossing vertices (4 of 4, measured). THE
//    DISCRIMINATOR FOR WHETHER IT ALSO MANUFACTURES THE FAN HUBS: count hubs whose incident chain vertices
//    carry two different `ownerChain` values — the provenance arrays exist. This is the only named
//    candidate that touches the `z ~ 64.4` band on all three instruments."*
//
// IT IS RUN AS A PRE-FLIGHT AND NOT AS A FINDING. S23-T's registered claim is FIDELITY; the hub census is
// reported comparatively under T3 with no absolute clause. What this file settles is whether the arm is
// about to build on top of a KNOWN, NAMED manufacturing mechanism — which would have to be said out loud
// before the build rather than discovered in its census afterwards.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY `ownerChain` COULD NOT ANSWER IT AS WRITTEN, WHICH IS ITSELF A CORRECTION TO THE REGISTRATION
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `_strataAlignedSeed.ts:844` is `if (ownerChain[id] < 0) { ownerChain[id] = ci; ... }` — FIRST claimer
// only, never overwritten. So a point that two chains welded into carries exactly one `ownerChain` value
// and is indistinguishable from a point one chain placed. The discriminator as registered reads a
// quantity the array does not hold. `PF_S10_SEED_DIAG` now also emits `WELDPT <th> <z> <nChains>` for
// EVERY welded chain point — the multi-chain population AND its single-chain control — and this file
// matches that dump against the hub census the clause instrument itself produces.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE MATCH, AND ITS CONTROL
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A hub is *"a vertex on >= 12 facets carrying an edge >= 500 um"* (`s22shard.ts:127`, transcribed below
// operand-for-operand). If the weld manufactures hubs, hubs must sit ON multi-chain weld points — within
// the weld radius itself, 192.65 um, since that is the whole distance the mechanism can move anything.
// **THE CONTROL IS THE SINGLE-CHAIN POPULATION.** "Hubs are near a chain vertex" is vacuous at a junction;
// the lead only survives if hubs are near MULTI-chain welds at a rate the single-chain population does not
// reproduce. Both rates are printed, and so is the nearest-distance distribution, so the verdict does not
// live inside a threshold.
//
// Run from `potfoundry-web/`:
//   node research/bridge/out/_run_s23wh.cjs <ARM> <seed-log-with-WELDPT-lines>
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const TWO_PI = 2 * Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const ARM = process.argv[2] ?? 'S23R';
const SEEDLOG = process.argv[3] ?? 'research/exchange/_strataConformBisect/S23T_WELD.log';
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const dTh = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };

// ── THE HUB CENSUS, transcribed from s22shard.ts:57-87 + :127 ───────────────────────────────────────
const buf = readFileSync(`${EX}${ARM}.stl`);
const nTri = buf.readUInt32LE(80);
const vertKey = new Map<string, number>();
{
  let o = 84;
  const P = new Float64Array(9);
  for (let t = 0; t < nTri; t += 1) {
    o += 12; for (let k = 0; k < 9; k += 1) { P[k] = buf.readFloatLE(o); o += 4; } o += 2;
    const e = [
      Math.hypot(P[3] - P[0], P[4] - P[1], P[5] - P[2]),
      Math.hypot(P[6] - P[3], P[7] - P[4], P[8] - P[5]),
      Math.hypot(P[0] - P[6], P[1] - P[7], P[2] - P[8])];
    if (Math.max(e[0], e[1], e[2]) < 0.5) continue;              // the census's own 500 um long-edge gate
    for (let v = 0; v < 3; v += 1) {
      const k = `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`;
      vertKey.set(k, (vertKey.get(k) ?? 0) + 1);
    }
  }
}
const patch = JSON.parse(readFileSync(`${EX}${ARM}.patches.json`, 'utf8')) as {
  patches: Array<{ id: string; theta: number; z: number; radiusMm: number }> };
const inRouted = (th: number, z: number): boolean =>
  patch.patches.some((g) => Math.hypot(rRef * dTh(g.theta, th), z - g.z) <= Math.min(g.radiusMm, 1.5));

interface Hub { th: number; z: number; deg: number; routed: boolean }
const hubs: Hub[] = [];
for (const [k, d] of vertKey) {
  if (d < 12) continue;
  const [xs, ys, zs] = k.split(',').map(Number);
  const x = xs / 1e4; const y = ys / 1e4; const z = zs / 1e4;
  const th = Math.atan2(y, x);
  hubs.push({ th, z, deg: d, routed: inRouted(th, z) });
}
const outside = hubs.filter((h) => !h.routed);

// ── THE WELD DUMP ───────────────────────────────────────────────────────────────────────────────────
const WX: number[] = []; const WY: number[] = []; const WN: number[] = [];
let minSepUm = 0; let chainPts = 0;
for (const line of readFileSync(SEEDLOG, 'utf8').split(/\r?\n/)) {
  if (line.includes('WELDDIAG')) {
    const m = /minSepUm ([\d.]+)\s+chainPts (\d+)\s+distinctIds (\d+)\s+MULTI-CHAIN WELDS (\d+)\s+worst-fan (\d+)/.exec(line);
    if (m !== null) { minSepUm = Number(m[1]); chainPts = Number(m[2]); log(`  seed dump: ${line.trim()}`); }
    continue;
  }
  if (!line.includes('WELDPT')) continue;
  const p = line.trim().split(/\s+/);
  WX.push(rRef * Number(p[1])); WY.push(Number(p[2])); WN.push(Number(p[3]));
}
if (WX.length === 0) throw new Error(`s23WeldHub: no WELDPT lines in ${SEEDLOG}. Run the seed with PF_S10_SEED_DIAG=1.`);
// The probe's repair round re-runs the whole builder, so the dump appears once per BUILD. Identical
// (th, z, nChains) rows are the same point seen twice and are collapsed — a duplicated population would
// leave every rate below unchanged but would misreport the point counts, and the counts are quoted.
{
  const seen = new Set<string>();
  const kx: number[] = []; const ky: number[] = []; const kn: number[] = [];
  for (let i = 0; i < WX.length; i += 1) {
    const k = `${WX[i].toFixed(4)},${WY[i].toFixed(4)},${WN[i]}`;
    if (seen.has(k)) continue;
    seen.add(k); kx.push(WX[i]); ky.push(WY[i]); kn.push(WN[i]);
  }
  WX.length = 0; WY.length = 0; WN.length = 0;
  for (let i = 0; i < kx.length; i += 1) { WX.push(kx[i]); WY.push(ky[i]); WN.push(kn[i]); }
}
const nMulti = WN.filter((n) => n > 1).length;

// nearest weld point of a given class, in the chart, periodic in x
const xMax = rRef * TWO_PI;
const dxw = (a: number, b: number): number => { let d = Math.abs(a - b); if (d > xMax / 2) d = xMax - d; return d; };
const nearest = (th: number, z: number, minChains: number): number => {
  const x = rRef * (th < 0 ? th + TWO_PI : th);
  let bd = Infinity;
  for (let i = 0; i < WX.length; i += 1) {
    if (WN[i] < minChains) continue;
    const d = Math.hypot(dxw(WX[i], x), WY[i] - z);
    if (d < bd) bd = d;
  }
  return bd;
};
const q = (a: number[], p: number): number => {
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
};

log(`=== S23-T PRE-FLIGHT — THE WELD LEAD'S REGISTERED DISCRIMINATOR, ON ${ARM} ===`);
log(`  ${nTri} facets;  FAN HUBS (>= 12 long facets): ${hubs.length} total, ${outside.length} outside declared geometry`);
log(`  welded chain points ${WX.length} (from ${chainPts} chain points);  MULTI-CHAIN ${nMulti}`
  + ` (${((100 * nMulti) / Math.max(1, WX.length)).toFixed(2)}%);  weld radius minSep ${minSepUm} um`);
log('');
log('--- THE DISCRIMINATOR, WITH ITS CONTROL. Match radius IS the weld radius: nothing else is reachable. ---');
const RAD = minSepUm / 1000;
const dMulti = outside.map((h) => nearest(h.th, h.z, 2));
const dAny = outside.map((h) => nearest(h.th, h.z, 1));
const hitM = dMulti.filter((d) => d <= RAD).length;
const hitA = dAny.filter((d) => d <= RAD).length;
log(`  | population matched against | hubs within ${(RAD * 1000).toFixed(1)} um | rate | nearest um p10 / p50 / p90 |`);
log('  |---|---|---|---|');
log(`  | **MULTI-CHAIN welds (the lead)** | **${hitM} of ${outside.length}** | **${((100 * hitM) / Math.max(1, outside.length)).toFixed(1)}%**`
  + ` | ${(q(dMulti, 0.10) * 1000).toFixed(0)} / ${(q(dMulti, 0.50) * 1000).toFixed(0)} / ${(q(dMulti, 0.90) * 1000).toFixed(0)} |`);
log(`  | ALL welded chain points (control) | ${hitA} of ${outside.length} | ${((100 * hitA) / Math.max(1, outside.length)).toFixed(1)}%`
  + ` | ${(q(dAny, 0.10) * 1000).toFixed(0)} / ${(q(dAny, 0.50) * 1000).toFixed(0)} / ${(q(dAny, 0.90) * 1000).toFixed(0)} |`);
log('');
log('--- STRATIFIED BY HUB DEGREE. The base rate is the multi-chain share of the welded population, ---');
log('--- so a stratum ABOVE it is enrichment and a stratum BELOW it is depletion. No threshold anywhere. ---');
const BASE = (100 * nMulti) / Math.max(1, WX.length);
log(`  base rate (multi-chain share of welded chain points): ${BASE.toFixed(2)}%`);
log('  | hub degree | n | on a MULTI-CHAIN weld | rate | vs base | on ANY chain vertex |');
log('  |---|---|---|---|---|---|');
for (const [lo, hi, name] of [[12, 14, '12-14'], [15, 17, '15-17'], [18, 99, '>= 18'], [12, 99, 'ALL']] as Array<[number, number, string]>) {
  const S = outside.filter((h) => h.deg >= lo && h.deg <= hi);
  if (S.length === 0) continue;
  const m = S.filter((h) => nearest(h.th, h.z, 2) <= RAD).length;
  const a = S.filter((h) => nearest(h.th, h.z, 1) <= RAD).length;
  const r = (100 * m) / S.length;
  log(`  | ${name} | ${S.length} | ${m} | **${r.toFixed(1)}%** | **x${(r / BASE).toFixed(2)}** |`
    + ` ${a} (${((100 * a) / S.length).toFixed(1)}%) |`);
}
log('');
log('--- THE z ~ 64.4 BAND, the locus three instruments already point at ---');
const band = outside.filter((h) => h.z >= 64.0 && h.z <= 64.8);
const bandM = band.map((h) => nearest(h.th, h.z, 2));
log(`  hubs in z in [64.0, 64.8]: ${band.length} of ${outside.length} (${((100 * band.length) / Math.max(1, outside.length)).toFixed(1)}%)`);
if (band.length > 0) {
  log(`  of those, within the weld radius of a MULTI-CHAIN weld: ${bandM.filter((d) => d <= RAD).length}`
    + `   nearest um p50 ${(q(bandM, 0.5) * 1000).toFixed(0)}`);
}
log('');
log('--- THE 12 HIGHEST-DEGREE HUBS OUTSIDE DECLARED GEOMETRY, each with its own two distances ---');
log('     degree        th          z    nearest MULTI um   nearest ANY um');
for (const h of [...outside].sort((a, b) => b.deg - a.deg).slice(0, 12)) {
  log(`     ${String(h.deg).padStart(6)} ${h.th.toFixed(5).padStart(10)} ${h.z.toFixed(3).padStart(10)}`
    + ` ${(nearest(h.th, h.z, 2) * 1000).toFixed(1).padStart(18)} ${(nearest(h.th, h.z, 1) * 1000).toFixed(1).padStart(16)}`);
}
log('');
log('>> THE VERDICT IS THE TWO RATES SIDE BY SIDE AND NOTHING ELSE. If MULTI matches at a rate the ALL');
log('>> control also reaches, the lead explains nothing that "a hub is near a chain vertex" does not, and');
log('>> it is CLOSED. If MULTI matches far above what its own share of the population predicts, the weld');
log('>> is a named manufacturer of hubs and THE ARM IS BUILT ON TOP OF IT — which is said before the build.');
log('=== DONE ===');
