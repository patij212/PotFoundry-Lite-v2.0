// _raVerify.ts — did the S52 hoisted twin engage, and what is it worth end to end?
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { buildRadiusFn } from '../bridge/runStyle';
import type { StyleId, StyleDims } from '../../src/geometry/types';
// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const snake = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function defs(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const o: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) if (g) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') o[snake(k)] = v.default;
  return o;
}
for (const style of ['GothicArches', 'Voronoi']) {
  const a = buildAuditRadiusFn(style, defs(style), DIMS, 120);
  log(`${style.padEnd(14)} fastUsed=${String(a.fastUsed).padEnd(5)} latticeDiffs=${a.fastDiffs}`);
}
const P = defs('GothicArches');
const shipped = buildRadiusFn('GothicArches' as StyleId, P, DIMS);
const audit = buildAuditRadiusFn('GothicArches', P, DIMS, 120);
const N = 4_000_000;
let s = 0; let t0 = Date.now();
for (let i = 0; i < N; i += 1) { const th = (i * 0.0000173) % 6.283; s += shipped(th, (i % 12000) / 100); }
const tShip = Date.now() - t0;
let s2 = 0; t0 = Date.now();
for (let i = 0; i < N; i += 1) { const th = (i * 0.0000173) % 6.283; s2 += audit.rA(th, (i % 12000) / 100); }
const tFast = Date.now() - t0;
log('');
log(`shipped buildRadiusFn : ${tShip} ms  ${((1000 * N) / tShip / 1e6).toFixed(3)} M/s  ${((tShip * 1e6) / N).toFixed(0)} ns/call   checksum ${s.toFixed(9)}`);
log(`audit rA (twin+wrap)  : ${tFast} ms  ${((1000 * N) / tFast / 1e6).toFixed(3)} M/s  ${((tFast * 1e6) / N).toFixed(0)} ns/call   checksum ${s2.toFixed(9)}`);
log(`*** ${(tShip / tFast).toFixed(2)}x end-to-end, checksums ${Object.is(s, s2) ? 'BIT-IDENTICAL' : `DIFFER by ${Math.abs(s - s2).toExponential(3)}`} ***`);
log(`(the audit arm carries the canon/clamp wrapper AND the eval counter that the shipped arm does not)`);

// ── MUTATION BAR: does the widened guard CATCH a divergence the lattice alone misses? ────────────
// AUDIT built a real one (the `wT` clamp) and the lattice-only guard reported fastDiffs=0 while the
// surfaces differed by 1.68e-4 mm — it simply never sampled where the divergent branch was live. The
// fix widened the check with a 601x301 dense sweep. A widening nobody has SEEN catch anything is an
// assumption, so this injects a divergence confined to a small (theta,z) window and reports which
// half of the guard finds it. The window is deliberately narrow: a guard that only catches gross
// perturbations is not the one we need.
import { radiusLattice as lattice2 } from '../bridge/_facetTruthRA';
const TWO_PI2 = 2 * Math.PI;
const base = buildRadiusFn('GothicArches' as StyleId, P, DIMS);
for (const [wTh, wZ, label] of [[0.02, 0.5, 'window 0.02 rad x 0.5 mm'], [0.004, 0.1, 'window 0.004 rad x 0.1 mm']] as Array<[number, number, string]>) {
  const th0 = 1.7371; const z0 = 63.137;                      // an arbitrary interior point, off every grid phase
  const mutant = (th: number, z: number): number => {
    const d = Math.abs(((th - th0 + Math.PI) % TWO_PI2 + TWO_PI2) % TWO_PI2 - Math.PI);
    return (d < wTh && Math.abs(z - z0) < wZ) ? base(th, z) + 1.68e-4 : base(th, z);
  };
  let latHits = 0; const lat = lattice2(120, [], []);
  for (let i = 0; i < lat.th.length; i += 1) if (!Object.is(mutant(lat.th[i], lat.z[i]), base(lat.th[i], lat.z[i]))) latHits += 1;
  let denseHits = 0; const NT = 601; const NZ = 301;
  for (let i = 0; i < NT; i += 1) {
    const t = (TWO_PI2 * (i + 0.37)) / NT;
    for (let j = 0; j < NZ; j += 1) { const z = (120 * (j + 0.11)) / NZ; if (!Object.is(mutant(t, z), base(t, z))) denseHits += 1; }
  }
  log(`  ${label.padEnd(28)} lattice-only hits ${String(latHits).padStart(4)}   +dense hits ${String(denseHits).padStart(5)}   => ${denseHits > 0 ? (latHits === 0 ? '*** CAUGHT ONLY BY THE WIDENING ***' : 'caught by both') : 'MISSED BY BOTH — guard still insufficient'}`);
}
