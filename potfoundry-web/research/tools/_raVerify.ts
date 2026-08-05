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
