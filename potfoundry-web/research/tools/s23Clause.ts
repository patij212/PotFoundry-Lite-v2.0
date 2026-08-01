// s23clause.ts — S23B: THE CLAUSE, SCORED. `shard / fan / plate / orientation ~0 BY CONSTRUCTION
// OUTSIDE DECLARED GEOMETRY`, with the declared/undeclared split the scored instrument does not print.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY A SECOND FILE RATHER THAN THREE LINES ADDED TO `s22shard.ts`
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `out/s22shard.ts` is THE SCORED INSTRUMENT and editing it would end comparability between the arms
// (S22, S22B, S22C and this one). It prints the S23 registration's own control — `long >= 1.0 mm AND
// AR3 >= 20 : 205` on `_S22B` — but it prints that class as ONE NUMBER, and THE CLAUSE is a statement
// about the class OUTSIDE DECLARED GEOMETRY. That split is the only thing this file adds.
//
// EVERY GEOMETRIC OPERAND IS TRANSCRIBED FROM `s22shard.ts` OPERAND-FOR-OPERAND — the f32 STL read, the
// 500 um pre-filter, `bestDot`'s five candidate normals, the centroid theta by `dTh` from vertex A, the
// `ar3 = long * perimeter / (4*area)` form, the gated/feature-spanning classification, `inRouted`'s
// `min(radiusMm, 1.5)` cap and the fan's `1e-4` vertex key. **THE VALIDATION IS THAT IT REPRODUCES
// `s22shard.ts`'s OWN NUMBERS ON `_S22B` TO THE DIGIT** — run it on S22B first; if the control line does
// not match, nothing this file says about S23B is worth reading. That is the A2 discipline applied to an
// instrument instead of to a kernel.
//
// "OUTSIDE DECLARED GEOMETRY" IS DEFINED BY THE REGISTRATION (95cd8662) AS: not inside one of the 43
// declared regions, AND not the designed 1,101/385 lattice. The second clause is measured by S22B's own
// separation signature, unchanged: area >= 0.15 mm^2 AND deviation < 1 deg AND longest edge >= 1 mm.
// Both counts are printed, so a reader can score the clause on the strict definition (regions only) or
// on the registered one (regions + designed lattice) without re-running anything.
//
// Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23Clause.ts --bundle --platform=node \
//     --format=cjs --target=node20 --external:playwright --external:playwright-core \
//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23clause.cjs
//   node research/bridge/out/_run_s23clause.cjs <ARM>
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
// `StyleDims` is NOT in `src/geometry/types` — it is `research/bridge/runStyle.ts:14`, and `s22shard.ts`
// carries the wrong import as one of the scoped tsconfig's pre-existing errors. Imported correctly here so
// this file adds none of its own; the TYPE is identical, so no operand changes.
import type { StyleId } from '../../src/geometry/types';
import type { StyleDims } from '../bridge/runStyle';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const TWO_PI = 2 * Math.PI; const RAD2DEG = 180 / Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const ARM = process.argv[2] ?? 'S22B';
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const buf = readFileSync(`${EX}${ARM}.stl`);
const nTri = buf.readUInt32LE(80);
const xyz = new Float64Array(nTri * 9);
{ let o = 84; for (let t = 0; t < nTri; t += 1) { o += 12; for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; } o += 2; } }

const hTh = 1e-6; const hZ = 1e-6;
function bestDot(th: number, z: number, fx: number, fy: number, fz: number): number {
  const r0 = rA(th, z);
  const rTp = rA(th + hTh, z); const rTm = rA(th - hTh, z);
  const rZp = rA(th, z + hZ); const rZm = rA(th, z - hZ);
  const dtF = (rTp - r0) / hTh; const dtB = (r0 - rTm) / hTh; const dtC = (rTp - rTm) / (2 * hTh);
  const dzF = (rZp - r0) / hZ; const dzB = (r0 - rZm) / hZ; const dzC = (rZp - rZm) / (2 * hZ);
  const ct = Math.cos(th); const st = Math.sin(th);
  let best = -1;
  for (const [rt, rz] of [[dtC, dzC], [dtF, dzF], [dtF, dzB], [dtB, dzF], [dtB, dzB]]) {
    const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const d = (fx * nx + fy * ny + fz * nz) / nl; if (d > best) best = d;
  }
  return best;
}
const dTh = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };

const patch = JSON.parse(readFileSync(`${EX}${ARM}.patches.json`, 'utf8')) as {
  patches: Array<{ id: string; theta: number; z: number; radiusMm: number }> };
const ROUTED = patch.patches;
const inRouted = (th: number, z: number): boolean =>
  ROUTED.some((g) => Math.hypot(rRef * dTh(g.theta, th), z - g.z) <= Math.min(g.radiusMm, 1.5));

interface S {
  long: number; ar3: number; area: number; dev: number; gated: boolean; span: boolean;
  th: number; z: number; zmin: number; zmax: number; routed: boolean; lattice: boolean;
}
const all: S[] = [];
const vertDeg = new Map<string, number>();
const vertPos = new Map<string, [number, number, number]>();
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  const A = [xyz[o], xyz[o + 1], xyz[o + 2]]; const B = [xyz[o + 3], xyz[o + 4], xyz[o + 5]]; const C = [xyz[o + 6], xyz[o + 7], xyz[o + 8]];
  let nx = (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]);
  let ny = (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]);
  let nz = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
  const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
  const area = nl / 2;
  const e = [Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]), Math.hypot(C[0] - B[0], C[1] - B[1], C[2] - B[2]), Math.hypot(A[0] - C[0], A[1] - C[1], A[2] - C[2])];
  const long = Math.max(...e);
  if (long < 0.5) continue;
  nx /= nl; ny /= nl; nz /= nl;
  const tA = Math.atan2(A[1], A[0]);
  const dB = dTh(tA, Math.atan2(B[1], B[0])); const dC = dTh(tA, Math.atan2(C[1], C[0]));
  const th = tA + (dB + dC) / 3; const z = (A[2] + B[2] + C[2]) / 3;
  const dev = Math.acos(Math.max(-1, Math.min(1, bestDot(th, z, nx, ny, nz)))) * RAD2DEG;
  let gated = false; let span = false;
  if (dev >= 90) {
    const dVA = bestDot(tA, A[2], nx, ny, nz);
    const dVB = dVA > 0 ? dVA : bestDot(tA + dB, B[2], nx, ny, nz);
    const dVC = dVB > 0 ? dVB : bestDot(tA + dC, C[2], nx, ny, nz);
    span = Math.max(dVA, dVB, dVC) > 0; gated = !span;
  }
  const ar3 = (long * (e[0] + e[1] + e[2])) / (4 * area);
  all.push({
    long, ar3, area, dev, gated, span, th, z,
    zmin: Math.min(A[2], B[2], C[2]), zmax: Math.max(A[2], B[2], C[2]),
    routed: inRouted(th, z),
    // S22B's OWN designed-lattice separation signature, unchanged (D1 used the same three clauses)
    lattice: area >= 0.15 && dev < 1 && long >= 1.0,
  });
  for (const P of [A, B, C]) {
    const k = `${Math.round(P[0] * 1e4)},${Math.round(P[1] * 1e4)},${Math.round(P[2] * 1e4)}`;
    vertDeg.set(k, (vertDeg.get(k) ?? 0) + 1);
    if (!vertPos.has(k)) vertPos.set(k, [P[0], P[1], P[2]]);
  }
}

log(`=== ${ARM}: S23 CLAUSE CENSUS — ${nTri} facets, ${all.length} with a long edge >= 500 um ===`);
log('  CONTROL LINES — these MUST reproduce out/s22shard.ts on the same arm, or nothing below counts.');
for (const [Lv, K] of [[1.0, 8], [1.0, 12], [1.0, 20], [1.5, 20]] as Array<[number, number]>) {
  log(`    long >= ${Lv.toFixed(1)} mm AND AR3 >= ${String(K).padStart(2)} : ${String(all.filter((s) => s.long >= Lv && s.ar3 >= K).length).padStart(6)}`);
}
const s22reg = all.filter((s) => s.long >= 1.5 && (s.dev >= 45 || s.ar3 >= 20));
log(`    S22 REGISTERED (long >= 1.5 mm AND (dev >= 45 OR AR3 >= 20)) : ${s22reg.length}`);
const fansAll = [...vertDeg.entries()].filter(([, d]) => d >= 12);
log(`    FANS (vertex on >= 12 facets carrying an edge >= 500 um) : ${fansAll.length}`);

// ── THE S23 CLAUSE QUANTITY — the registration's own instrument, split by provenance ────────────────
const SH = all.filter((s) => s.long >= 1.0 && (s.dev >= 45 || s.ar3 >= 20));
const SHar = all.filter((s) => s.long >= 1.0 && s.ar3 >= 20);
const rep = (name: string, set: S[]): void => {
  const inReg = set.filter((s) => s.routed).length;
  const latt = set.filter((s) => !s.routed && s.lattice).length;
  const out = set.filter((s) => !s.routed && !s.lattice);
  const rim = out.filter((s) => s.zmax >= 119.9 || s.zmin <= 0.1).length;
  log(`\n--- ${name} : ${set.length} total ---`);
  log(`    inside a DECLARED REGION      : ${inReg}`);
  log(`    the DESIGNED LATTICE class    : ${latt}   (area >= 0.15 mm^2, dev < 1 deg, long >= 1 mm)`);
  log(`    *** OUTSIDE DECLARED GEOMETRY : ${out.length} ***   of which rim-row (z >= 119.9 or <= 0.1) ${rim}, INTERIOR ${out.length - rim}`);
  if (out.length > 0) {
    const w = [...out].sort((a, b) => b.ar3 - a.ar3).slice(0, 10);
    log('       worst 10 UNDECLARED by AR3:   long um    AR3     area mm^2   dev deg      th         z');
    for (const s of w) {
      log(`                                  ${(s.long * 1000).toFixed(0).padStart(9)} ${s.ar3.toFixed(1).padStart(7)} ${s.area.toFixed(5).padStart(11)} ${s.dev.toFixed(2).padStart(9)} ${s.th.toFixed(5).padStart(10)} ${s.z.toFixed(3).padStart(9)}`);
    }
  }
};
rep('SHARDS — long >= 1.0 mm AND (dev >= 45 deg OR AR3 >= 20)', SH);
rep('SHARDS — long >= 1.0 mm AND AR3 >= 20   [the registration\'s quoted control, 205 on _S22B]', SHar);

// ── THE FAN HUBS, same split ───────────────────────────────────────────────────────────────────────
let fIn = 0; let fLatt = 0; const fOut: Array<[string, number, number, number]> = [];
for (const [k, d] of fansAll) {
  const P = vertPos.get(k) as [number, number, number];
  const th = Math.atan2(P[1], P[0]); const z = P[2];
  if (inRouted(th, z)) { fIn += 1; continue; }
  // a hub is NOT designed-lattice geometry: the lattice is a quad grid and its interior vertex degree is
  // 6. A degree >= 12 vertex over long edges is a fan by definition, wherever it sits — so this bucket is
  // reported as zero by construction and printed anyway, because an unprinted zero is an assumption.
  fLatt += 0;
  fOut.push([k, d, th, z]);
}
log(`\n--- FAN HUBS — vertex on >= 12 facets carrying an edge >= 500 um : ${fansAll.length} total ---`);
log(`    inside a DECLARED REGION      : ${fIn}`);
log(`    the DESIGNED LATTICE class    : ${fLatt}   (a lattice interior vertex has degree 6; a hub is never lattice)`);
log(`    *** OUTSIDE DECLARED GEOMETRY : ${fOut.length} ***`);
for (const [, d, th, z] of fOut.sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  log(`       degree ${String(d).padStart(3)}   th ${th.toFixed(5).padStart(10)}   z ${z.toFixed(3).padStart(9)}   rim-row ${z >= 119.9 || z <= 0.1 ? 'YES' : 'no'}`);
}

log(`\n=== THE CLAUSE, AS REGISTERED: <= 5 shards AND <= 2 fan hubs OUTSIDE DECLARED GEOMETRY ===`);
const shOut = SHar.filter((s) => !s.routed && !s.lattice).length;
log(`  shards outside declared geometry : ${shOut}   bar <= 5   ${shOut <= 5 ? 'HOLDS' : '*** MISSES — THE CONSTRUCTION ARGUMENT IS REFUTED ***'}`);
log(`  fan hubs outside declared geometry: ${fOut.length}   bar <= 2   ${fOut.length <= 2 ? 'HOLDS' : '*** MISSES — THE CONSTRUCTION ARGUMENT IS REFUTED ***'}`);
log('\n=== DONE ===');
