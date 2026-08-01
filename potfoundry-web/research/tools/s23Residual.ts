// s23Residual.ts — S23B: LOCATE AND CLASSIFY THE SCALE-INVARIANT RESIDUAL. READ-ONLY, artifact-only.
//
// The constructed mesh read HEADLINE 622.349 um at PF_CB_RECON_SCALE 4, 2 AND 1 — identical to the digit,
// on a facet whose three vertices are byte-identical in all three meshes. A residual that does not move
// when the mesh triples in density is one of exactly four things, and they have four different owners:
//   (1) a MISPLACED CONSTRAINT (the S10 layer-2 negative-control class)          -> a tracer fix
//   (2) a genuine C0 / jump-class spot the tracer EXCLUDED                       -> a declared curtain
//   (3) a seam or rim-row effect (ruler-domain artifact, BasketWeave precedent)  -> an excluded row
//   (4) representable geometry the DECLARED rule simply under-resolves           -> Phase-2 demand
// This file measures which. It does NOT chase it with density: S7 already answered that road.
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const H = 120; const TWO_PI = 2 * Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
const dTh = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };

// THE WITNESS, read off the shipped f32 bytes of all three probe meshes (identical in each).
const TH = [4.449065, 4.449410, 4.452377];
const Z = [80.91705, 80.79443, 80.57988];
log('=== S23B — THE SCALE-INVARIANT RESIDUAL, LOCATED AND CLASSIFIED ===');
log('  witness facet (byte-identical vertices in _S23BP4 / _S23BP2 / _S23BP1; edges 124.9/259.6/376.2 um):');
for (let i = 0; i < 3; i += 1) log(`    v${i}  th ${TH[i].toFixed(6)}  z ${Z[i].toFixed(5)}  r(analytic) ${rA(TH[i], Z[i]).toFixed(5)}`);

const thC = (TH[0] + TH[1] + TH[2]) / 3; const zC = (Z[0] + Z[1] + Z[2]) / 3;
log('');
log('--- (3) SEAM / RIM-ROW TEST ---');
log(`  centroid th ${thC.toFixed(6)} z ${zC.toFixed(5)}   arc to the seam ${(rRef * Math.min(thC, TWO_PI - thC)).toFixed(2)} mm`
  + `   z to the nearest rim ${Math.min(zC, H - zC).toFixed(3)} mm   (the rim-row band is z >= 119.9 or <= 0.1)`);

// ── the SURFACE over the facet's own footprint ─────────────────────────────────────────────────────
const th0 = Math.min(...TH); const th1 = Math.max(...TH);
const z0 = Math.min(...Z); const z1 = Math.max(...Z);
let rMin = Infinity; let rMax = -Infinity; let aTh = 0; let aZ = 0; let bTh2 = 0; let bZ2 = 0;
const N = 260;
for (let i = 0; i <= N; i += 1) {
  const th = th0 + ((th1 - th0) * i) / N;
  for (let j = 0; j <= N; j += 1) {
    const z = z0 + ((z1 - z0) * j) / N;
    const r = rA(th, z);
    if (r < rMin) { rMin = r; aTh = th; aZ = z; }
    if (r > rMax) { rMax = r; bTh2 = th; bZ2 = z; }
  }
}
log('');
log('--- THE ANALYTIC SURFACE OVER THE FACET FOOTPRINT (260x260 probes) ---');
log(`  r ranges ${rMin.toFixed(5)} .. ${rMax.toFixed(5)} mm   = RADIAL EXCURSION ${((rMax - rMin) * 1000).toFixed(1)} um`);
log(`    min at th ${aTh.toFixed(6)} z ${aZ.toFixed(5)}      max at th ${bTh2.toFixed(6)} z ${bZ2.toFixed(5)}`);
log(`  the facet's own three vertices span r ${Math.min(...TH.map((t, i) => rA(t, Z[i]))).toFixed(5)}`
  + ` .. ${Math.max(...TH.map((t, i) => rA(t, Z[i]))).toFixed(5)} mm — the surface leaves the facet's own range by`
  + ` ${((Math.min(...TH.map((t, i) => rA(t, Z[i]))) - rMin) * 1000).toFixed(1)} um inward /`
  + ` ${((rMax - Math.max(...TH.map((t, i) => rA(t, Z[i])))) * 1000).toFixed(1)} um outward`);

// ── (2) C0 / JUMP CLASS — the driver's own two-scale rule ──────────────────────────────────────────
log('');
log('--- (2) C0 / JUMP-CLASS TEST — the driver own two-scale rule (j2 > 0.8*j1 means a C0 step) ---');
for (const probe of [['radial MIN', aTh, aZ], ['radial MAX', bTh2, bZ2]] as Array<[string, number, number]>) {
  const [nm, thA, zA] = probe;
  for (const dir of ['z', 'theta'] as const) {
    const d1 = 0.02; const d2 = d1 / 8;
    const step = (d: number): number => (dir === 'z'
      ? Math.abs(rA(thA, Math.min(H, zA + d)) - rA(thA, Math.max(0, zA - d)))
      : Math.abs(rA(thA + d / rRef, zA) - rA(thA - d / rRef, zA)));
    const j1 = step(d1); const j2 = step(d2);
    log(`  ${nm.padEnd(10)} along ${dir.padEnd(5)}:  j1(+-20um) ${(j1 * 1000).toFixed(2)} um   j2(+-2.5um) ${(j2 * 1000).toFixed(2)} um`
      + `   ratio ${(j2 / Math.max(1e-12, j1)).toFixed(4)}   ${j2 > 0.8 * j1 ? '*** C0 STEP ***' : 'C1 — falls with the probe scale'}`);
  }
}

// ── (1) MISPLACED CONSTRAINT / distance to the traced loci ─────────────────────────────────────────
const loci = JSON.parse(readFileSync(`${EX}S23BP1.loci.json`, 'utf8')) as {
  loci: Array<{ pts: Array<[number, number]> }>;
  junctions: Array<{ theta: number; z: number; radiusMm: number }>;
};
let best = Infinity; let bTh = 0; let bZ = 0;
for (const L of loci.loci) for (const p of L.pts) {
  const d = Math.hypot(rRef * dTh(canon(p[0]), canon(thC)), p[1] - zC);
  if (d < best) { best = d; bTh = p[0]; bZ = p[1]; }
}
log('');
log('--- (1) MISPLACED-CONSTRAINT TEST — distance to the nearest TRACED locus vertex ---');
log(`  nearest traced vertex: th ${canon(bTh).toFixed(6)} z ${bZ.toFixed(5)}   distance ${(best * 1000).toFixed(1)} um`);
log('    (the tracer layer-1 control bar is 25 um; PSLG conditioning can displace a constraint by 20 um)');
log(`  the surface's own radial MINIMUM inside the footprint is`
  + ` ${(Math.hypot(rRef * dTh(canon(bTh), aTh), bZ - aZ) * 1000).toFixed(1)} um from that traced vertex`);
log(`  ...and its radial MAXIMUM is`
  + ` ${(Math.hypot(rRef * dTh(canon(bTh), bTh2), bZ - bZ2) * 1000).toFixed(1)} um from it`);

// ── declared-region membership + nearest junction ──────────────────────────────────────────────────
const pat = JSON.parse(readFileSync(`${EX}S23BP1.patches.json`, 'utf8')) as {
  patches: Array<{ id: string; theta: number; z: number; radiusMm: number }> };
let bestReg = Infinity; let bestId = '';
for (const g of pat.patches) {
  const d = Math.hypot(rRef * dTh(g.theta, thC), zC - g.z);
  if (d < bestReg) { bestReg = d; bestId = g.id; }
}
let bJ = Infinity; let bJi = -1;
loci.junctions.forEach((j, i) => { const d = Math.hypot(rRef * dTh(j.theta, thC), zC - j.z); if (d < bJ) { bJ = d; bJi = i; } });
log('');
log(`--- DECLARED-REGION MEMBERSHIP --- nearest of ${pat.patches.length}: ${bestId} at ${bestReg.toFixed(3)} mm`
  + `   => ${bestReg <= 1.5 ? '*** INSIDE a declared region ***' : 'OUTSIDE every declared region'}`);
log(`  nearest TRACED JUNCTION centre: #${bJi} at ${bJ.toFixed(3)} mm of the ${loci.junctions.length} traced`);

// ── (4) congruent-copy check against the known pinned sites ────────────────────────────────────────
log('');
log('--- KNOWN PINNED SITES — the congruent-copy check ---');
const pin: Array<[string, number, number]> = [
  ['the 25.063 um congruent copy (P-a)', 6.021386, 113.45994],
  ['_S22B MAX-locus (its own H2 argmax)', 4.4491, 76.40],
];
for (const [nm, th, z] of pin) {
  log(`  ${nm.padEnd(38)} th ${th.toFixed(6)} z ${z.toFixed(5)}`
    + `   chart distance ${Math.hypot(rRef * dTh(canon(th), thC), z - zC).toFixed(3)} mm`
    + `   dz ${Math.abs(z - zC).toFixed(3)} mm`);
}
log('');
log('=== DONE ===');
