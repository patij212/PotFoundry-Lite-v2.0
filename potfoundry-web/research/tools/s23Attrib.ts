// s23Attrib.ts — S23B: MECHANISM ATTRIBUTION FOR THE REFUTED CLAUSE. READ-ONLY, artifact-only.
// Three candidate causes, each CHECKED rather than assumed, over the population that actually refuted it:
//   (a) THE SERIALIZED GRID UNDER-PRICES. Measured 3.48x at D49 — is it SYSTEMIC over the shard sites?
//       Compares, per site: the shipped 0.25 mm grid field, against the surface's OWN demand at the
//       driver's own tolerance (PF_CB_TOL = 10 um), by the driver's own one-sided-sagitta solve.
//   (b) THE CORRIDOR. How far is each shard site from the nearest traced constraint? A site inside the
//       across rule's corridor is one the free-Steiner infill was FORBIDDEN to enter (Amendment B), and
//       the only mechanism that could reach it (Amendment C) is INFEASIBLE.
//   (c) D5 DISPERSION, the registered suspect. Is the shard population sitting where the field's own
//       within-cell p90/p10 dispersion is high? If it is not, D5 is not the mechanism.
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import { loadReconField } from '../bridge/_strataReconField';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const TWO_PI = 2 * Math.PI; const RAD2DEG = 180 / Math.PI; const rRef = 45;
// eslint-disable-next-line no-console
const log = console.log;
const ARM = process.argv[2] ?? 'S23B';
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';
const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);
const canon = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
const dTh = (a: number, b: number): number => { let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d; };

const field = loadReconField(`${EX}S22B.density.json`, { floorMm: 0.0364, alpha: 1.0 });
const raw = loadReconField(`${EX}S22B.density.json`, { floorMm: 0, alpha: Infinity });

/** the surface's own demand: largest chord whose two-sided sagitta stays under `tol`, four directions. */
function demand(th: number, z: number, tol: number): number {
  const P = (t: number, zz: number): [number, number, number] => {
    const c = canon(t); const r = rA(c, zz); return [r * Math.cos(c), r * Math.sin(c), zz];
  };
  const sag = (L: number): number => {
    let w = 0;
    for (const [ca, sa] of [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]] as Array<[number, number]>) {
      const dth = (ca * L) / rRef; const dz = sa * L;
      const p0 = P(th - dth / 2, Math.max(0, Math.min(120, z - dz / 2)));
      const pA = P(th, z);
      const pB = P(th + dth / 2, Math.max(0, Math.min(120, z + dz / 2)));
      const s = 0.5 * Math.hypot(pB[0] - 2 * pA[0] + p0[0], pB[1] - 2 * pA[1] + p0[1], pB[2] - 2 * pA[2] + p0[2]);
      if (s > w) w = s;
    }
    return w;
  };
  let lo = 2e-4; let hi = 4;
  for (let i = 0; i < 32; i += 1) { const m = Math.sqrt(lo * hi); if (sag(m) <= tol) lo = m; else hi = m; }
  return lo;
}

// ── the shard population, by the registration's own instrument ─────────────────────────────────────
const buf = readFileSync(`${EX}${ARM}.stl`);
const nTri = buf.readUInt32LE(80);
const pat = JSON.parse(readFileSync(`${EX}${ARM}.patches.json`, 'utf8')) as {
  patches: Array<{ theta: number; z: number; radiusMm: number }> };
const inRouted = (th: number, z: number): boolean =>
  pat.patches.some((g) => Math.hypot(rRef * dTh(g.theta, th), z - g.z) <= Math.min(g.radiusMm, 1.5));
const loci = JSON.parse(readFileSync(`${EX}${ARM}.loci.json`, 'utf8')) as { loci: Array<{ pts: Array<[number, number]> }> };
const LP: Array<[number, number]> = [];
for (const L of loci.loci) for (const p of L.pts) LP.push([rRef * canon(p[0]), p[1]]);

const sites: Array<{ th: number; z: number; long: number; ar3: number }> = [];
{
  let o = 84;
  for (let t = 0; t < nTri; t += 1) {
    o += 12;
    const c: number[] = [];
    for (let k = 0; k < 9; k += 1) { c.push(buf.readFloatLE(o)); o += 4; }
    o += 2;
    const e = [
      Math.hypot(c[3] - c[0], c[4] - c[1], c[5] - c[2]),
      Math.hypot(c[6] - c[3], c[7] - c[4], c[8] - c[5]),
      Math.hypot(c[0] - c[6], c[1] - c[7], c[2] - c[8]),
    ];
    const long = Math.max(...e);
    if (long < 1.0) continue;
    const nx = (c[4] - c[1]) * (c[8] - c[2]) - (c[5] - c[2]) * (c[7] - c[1]);
    const ny = (c[5] - c[2]) * (c[6] - c[0]) - (c[3] - c[0]) * (c[8] - c[2]);
    const nz = (c[3] - c[0]) * (c[7] - c[1]) - (c[4] - c[1]) * (c[6] - c[0]);
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const ar3 = (long * (e[0] + e[1] + e[2])) / (4 * (nl / 2));
    if (ar3 < 20) continue;
    const tA = Math.atan2(c[1], c[0]);
    const th = canon(tA + (dTh(tA, Math.atan2(c[4], c[3])) + dTh(tA, Math.atan2(c[7], c[6]))) / 3);
    const z = (c[2] + c[5] + c[8]) / 3;
    if (inRouted(th, z)) continue;
    sites.push({ th, z, long, ar3 });
  }
}
log(`=== S23B MECHANISM ATTRIBUTION — ${sites.length} shard sites OUTSIDE declared geometry (long >= 1.0 mm, AR3 >= 20) ===`);

const q = (a: number[], p: number): number => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const ratios: number[] = []; const dists: number[] = []; const disp: number[] = []; const fh: number[] = [];
for (const s of sites) {
  const h = field.hAt(s.th, s.z);
  const d = demand(s.th, s.z, 0.01);
  ratios.push(h / d); fh.push(h * 1000);
  let bd = Infinity; const X = rRef * s.th;
  for (const p of LP) { const dd = Math.hypot(p[0] - X, p[1] - s.z); if (dd < bd) bd = dd; }
  dists.push(bd * 1000);
  // (c) local field dispersion: max/min of the RAW grid over the 3x3 cells around the site
  let lo = Infinity; let hi = 0;
  for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
    const v = raw.hAt(s.th + (dc * raw.dxMm) / rRef, Math.max(0, Math.min(120, s.z + dr * raw.dyMm)));
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  disp.push(hi / Math.max(1e-9, lo));
}
log('');
log('--- (a) IS THE SERIALIZED-GRID UNDER-PRICING SYSTEMIC? ---');
log(`  shipped grid field h um at the shard sites : p10 ${q(fh, 0.1).toFixed(1)}  p50 ${q(fh, 0.5).toFixed(1)}  p90 ${q(fh, 0.9).toFixed(1)}`);
log(`  UNDER-PRICE RATIO (grid h / the surface's own 10 um demand):`);
log(`     p10 ${q(ratios, 0.1).toFixed(2)}x   p50 ${q(ratios, 0.5).toFixed(2)}x   p90 ${q(ratios, 0.9).toFixed(2)}x   MAX ${Math.max(...ratios).toFixed(2)}x`);
log(`     sites where the grid UNDER-PRICES (ratio > 1): ${ratios.filter((r) => r > 1).length} of ${ratios.length}`
  + `   (${((100 * ratios.filter((r) => r > 1).length) / ratios.length).toFixed(1)}%)`);
log(`     ... by more than 2x: ${ratios.filter((r) => r > 2).length}   by more than 3x: ${ratios.filter((r) => r > 3).length}`);
log(`  D49's measured 3.48x sits at the ${((100 * ratios.filter((r) => r < 3.48).length) / ratios.length).toFixed(0)}th percentile of this population`);
log('');
log('--- (b) THE CORRIDOR — distance from each shard site to the nearest TRACED constraint vertex ---');
log(`  um: p10 ${q(dists, 0.1).toFixed(0)}  p50 ${q(dists, 0.5).toFixed(0)}  p90 ${q(dists, 0.9).toFixed(0)}  MAX ${Math.max(...dists).toFixed(0)}`);
for (const bar of [385.3, 650, 1101]) {
  log(`  within ${bar.toFixed(1)} um of a constraint: ${dists.filter((d) => d <= bar).length} of ${dists.length}`
    + `   (${((100 * dists.filter((d) => d <= bar).length) / dists.length).toFixed(1)}%)`
    + `${bar === 385.3 ? '   <- acrossBase: the corridor Amendment B hands back to the across rule' : ''}`
    + `${bar === 650 ? '   <- acrossMaxMm: the outermost declared offset ring' : ''}`);
}
log('');
log('--- (c) D5 DISPERSION, THE REGISTERED SUSPECT — local RAW-field max/min over the 3x3 cells ---');
log(`  p10 ${q(disp, 0.1).toFixed(2)}  p50 ${q(disp, 0.5).toFixed(2)}  p90 ${q(disp, 0.9).toFixed(2)}  MAX ${Math.max(...disp).toFixed(2)}`);
log(`  D5's registered whole-field median is 2.793 and its p99 is 14.742 — the bar was <= 3.0.`);
log(`  sites sitting above the whole-field MEDIAN dispersion: ${disp.filter((d) => d > 2.793).length} of ${disp.length}`
  + `   (${((100 * disp.filter((d) => d > 2.793).length) / disp.length).toFixed(1)}%)`);
log(`  sites sitting above the whole-field p99 (14.742): ${disp.filter((d) => d > 14.742).length}`);
log('');
log('=== DONE ===');
void RAD2DEG;
