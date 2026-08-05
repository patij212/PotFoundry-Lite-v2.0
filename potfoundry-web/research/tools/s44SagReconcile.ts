// s44SagReconcile.ts — RECONCILE THE DRIVER'S OWN EDGE SAG WITH THE GEOMETRY IT SHIPS.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE CONTRADICTION THIS EXISTS TO SETTLE
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Two measurements on `S39CTL`'s stranded facets disagree by two orders of magnitude:
//
//   S43  every welded vertex is ON the analytic surface. Radial residual over all 571,663:
//        p50 0.0012 um, MAX 0.031 um, ZERO above 0.05 um. The stranded facets' own vertices are
//        indistinguishable from a control sample.
//   the  driver's `<tag>.unresolved.json` carries `sagNowUm` up to 210.617 um — its OWN edge ruler,
//        re-read on the shipped mesh — on a facet whose longest edge is 130.6 um.
//
// Endpoints on the surface, and a chord that deviates 1.6x its own length from it. Both cannot be
// describing the same edge. Exactly one of these is true and this file finds out which:
//
//   (A) THE SURFACE REALLY DOES BULGE that far between the endpoints. Then the sag is honest, the
//       facet spans a feature 1.6x its own length, and no single bisection conforms to it — the fix
//       is connectivity or a finer approach. S42's relief ratio would then have been reported at the
//       WRONG PLACE: it recorded |lift - chord| at the AR-BEST placement, which is a minimiser, not
//       the max over the edge. A small number there says nothing about the max, and reading it as if
//       it did was my error.
//
//   (B) THE SAG IS COMPUTED FROM PARAMETERS THAT DO NOT MATCH THE SHIPPED POSITIONS. `edgeSagRaw`
//       walks the edge in (theta, z) using the DRIVER'S STORED `vth[a]`, `dTh(a,b)` and `vz` — not
//       the vertex's position. If a vertex's stored (theta, z) has drifted from the (theta, z) its
//       shipped xyz implies, the ruler lifts a curve between the WRONG parameters, and the distance
//       it reports is to a piece of surface the edge never spanned. The vertex is then "off the
//       surface" in the sense that matters — its parameters and its position disagree — while a
//       radial residual test like S43 sees nothing, because the position is on the surface for its
//       OWN theta.
//
// (B) IS TESTABLE WITHOUT THE DRIVER'S STATE. Reconstruct theta from the shipped position
// (theta = canonTheta(atan2(y,x))), recompute the sag at HIGH resolution, and compare with the
// driver's number. Agreement => (A) and the geometry is real. Disagreement => (B), and the gap
// localises to the parameters, which is a defect in vertex bookkeeping rather than in the surface.
//
// RESOLUTION IS SEPARATED FROM PARAMETERISATION ON PURPOSE. The driver samples the edge at
// esN = max(K.esN, min(refNmax, ceil(len/refHs))) points — on a 130 um edge with refHs = 30 um that
// is a handful. This reports the driver's own esN AND a 4096-point sweep, so "the driver's ruler
// under-samples" and "the driver's ruler uses wrong parameters" cannot be confused for each other.
//
// Read-only. Safe beside a live arm.
//
// Usage:  bash research/tools/run-s44-sag-reconcile.sh [TAG]
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/labkit';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import type { StyleId, StyleDims } from '../../src/geometry/types';
import { readFileSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TAG = process.env.PF_S44_TAG ?? 'S39CTL';
const BASE = `research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_${TAG}`;
// the driver's own edge-sag resolution constants (PF_CB_ESN / PF_CB_REF_HS / PF_CB_REF_NMAX defaults)
const ESN = 8; const REF_HS = 0.03; const REF_NMAX = 64;
const FINE = 4096;

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>;
    advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}
const rAraw = buildRadiusFn('GothicArches' as StyleId, { ...registryDefaults('GothicArches') }, DIMS);
const R = (th: number, z: number): number => rAraw(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

log('===== S44 — RECONCILE THE DRIVER EDGE SAG WITH THE SHIPPED GEOMETRY =====');
log(`STL ${BASE}.stl`);
const t0 = Date.now();
const { xyz, nTri } = readMeshFloat64(`${BASE}.stl`, false);
const vx: number[] = []; const vy: number[] = []; const vz: number[] = [];
const vkey = new Map<string, number>();
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
const vid = (x: number, y: number, z: number): number => {
  const k = `${x},${y},${z}`; const g = vkey.get(k); if (g !== undefined) return g;
  const i = vx.length; vkey.set(k, i); vx.push(x); vy.push(y); vz.push(z); return i;
};
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  ta[t] = vid(xyz[o], xyz[o + 1], xyz[o + 2]);
  tb[t] = vid(xyz[o + 3], xyz[o + 4], xyz[o + 5]);
  tc[t] = vid(xyz[o + 6], xyz[o + 7], xyz[o + 8]);
}
log(`     ${nTri} triangles, ${vx.length} welded vertices`);
const vth = vx.map((_, i) => canonTheta(Math.atan2(vy[i], vx[i])));

/** edgeSagRaw, verbatim, with the sample count as a parameter so resolution is separable. */
const sagAt = (a: number, b: number, n: number): number => {
  const ax = vx[a]; const ay = vy[a]; const az = vz[a];
  const ex = vx[b] - ax; const ey = vy[b] - ay; const ez = vz[b] - az;
  const eL2 = ex * ex + ey * ey + ez * ez;
  if (eL2 < 1e-24) return 0;
  const th0 = vth[a]; const d = dThRaw(vth[a], vth[b]); const dz = vz[b] - az;
  let best = 0;
  for (let k = 1; k < n; k += 1) {
    const t = k / n;
    const th = th0 + d * t; const z = az + dz * t;
    const r = R(th, z);
    const px = r * Math.cos(th) - ax; const py = r * Math.sin(th) - ay; const pz = z - az;
    const proj = (px * ex + py * ey + pz * ez) / eL2;
    best = Math.max(best, Math.hypot(px - proj * ex, py - proj * ey, pz - proj * ez));
  }
  return best;
};
const eLen = (a: number, b: number): number => Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
const driverN = (a: number, b: number): number => Math.max(ESN, Math.min(REF_NMAX, Math.ceil(eLen(a, b) / REF_HS)));
const worstEdgeSag = (t: number, n: number | null): { sag: number; e: number } => {
  const es: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
  let best = 0; let bi = 0;
  for (let i = 0; i < 3; i += 1) {
    const s = sagAt(es[i][0], es[i][1], n ?? driverN(es[i][0], es[i][1]));
    if (s > best) { best = s; bi = i; }
  }
  return { sag: best * 1000, e: bi };
};

interface JamRow { z: number; shortUm: number; midUm: number; longUm: number; sagNowUm: number; keyUm: number }
const jam = (JSON.parse(readFileSync(`${BASE}.unresolved.json`, 'utf8')) as { facets: JamRow[] }).facets;
const byZ = new Map<number, number[]>();
for (let t = 0; t < nTri; t += 1) {
  const z = Math.round(((vz[ta[t]] + vz[tb[t]] + vz[tc[t]]) / 3) * 1000) / 1000;
  const l = byZ.get(z); if (l === undefined) byZ.set(z, [t]); else l.push(t);
}
const findTri = (r: JamRow): number => {
  const want = [r.shortUm, r.midUm, r.longUm].sort((x, y) => x - y);
  for (const dz of [0, 0.001, -0.001]) {
    for (const t of byZ.get(Math.round((r.z + dz) * 1000) / 1000) ?? []) {
      const es = [eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])]
        .map((v) => Math.round(v * 10000) / 10).sort((x, y) => x - y);
      if (es.every((v, k) => Math.abs(v - want[k]) < 0.35)) return t;
    }
  }
  return -1;
};

const rows: Array<{ rep: number; drv: number; fine: number; le: number }> = [];
for (const r of jam) {
  const t = findTri(r); if (t < 0) continue;
  rows.push({
    rep: r.sagNowUm,
    drv: worstEdgeSag(t, null).sag,
    fine: worstEdgeSag(t, FINE).sag,
    le: Math.max(eLen(ta[t], tb[t]), eLen(tb[t], tc[t]), eLen(tc[t], ta[t])) * 1000,
  });
}
log('');
log(`RECONSTRUCTED SAG vs THE DRIVER'S REPORTED sagNowUm, over ${rows.length} stranded facets.`);
log('  "driverN"  = same sample count the driver uses.   "fine" = 4096 samples.');
log('  theta is reconstructed from the SHIPPED POSITION; the driver used its own stored vth.');
log('');
rows.sort((a, b) => b.rep - a.rep);
log(`  ${'reported'.padStart(10)} ${'driverN'.padStart(10)} ${'fine4096'.padStart(10)} ${'longest um'.padStart(11)}   reported/fine`);
for (const r of rows.slice(0, 14)) {
  log(`  ${r.rep.toFixed(2).padStart(10)} ${r.drv.toFixed(2).padStart(10)} ${r.fine.toFixed(2).padStart(10)} ${r.le.toFixed(1).padStart(11)}   ${(r.rep / Math.max(1e-9, r.fine)).toFixed(1)}x`);
}
// THE VERDICT COMPARES reported vs driverN, NOT reported vs fine. Those answer different questions and
// conflating them was a defect in the first version of this file: `fine` legitimately reads HIGHER than
// `driverN` (more samples can only find a larger max), so testing agreement against `fine` scores the
// driver's SAMPLE COUNT as if it were a parameter mismatch. reported-vs-driverN isolates the parameters,
// which is the (A)/(B) question; driverN-vs-fine isolates the resolution, reported separately below.
const ratios = rows.map((r) => r.rep / Math.max(1e-9, r.drv)).sort((a, b) => a - b);
const qq = (p: number): number => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))];
const agree = rows.filter((r) => Math.abs(r.rep - r.drv) <= 0.02 * Math.max(r.rep, r.drv)).length;
log('');
log(`  reported / driverN   p10 ${qq(0.1).toFixed(4)}   p50 ${qq(0.5).toFixed(4)}   p90 ${qq(0.9).toFixed(4)}   max ${qq(1).toFixed(4)}`);
log(`  facets where reconstructed-from-position AGREES with the driver within 2%: ${agree} / ${rows.length} (${((100 * agree) / rows.length).toFixed(1)}%)`);
const under = rows.map((r) => r.fine / Math.max(1e-9, r.drv)).sort((a, b) => a - b);
const uq = (p: number): number => under[Math.min(under.length - 1, Math.floor(p * under.length))];
log(`  RESOLUTION, separately — fine4096 / driverN: p50 ${uq(0.5).toFixed(3)}  p90 ${uq(0.9).toFixed(3)}  max ${uq(1).toFixed(3)}`);
log('    (>1 means the driver\'s esN under-reads its OWN ruler; this is a sampling error, not a parameter one)');
log('');
log('  VERDICT:');
if (agree > 0.9 * rows.length) {
  log('    (A) THE SAG IS REAL. Reconstructed-from-position theta reproduces the driver to within 2% on');
  log('        essentially the whole population, so the parameters and the positions agree and the surface');
  log('        genuinely departs the chord by that much. The stranded facets span features larger than');
  log('        themselves and no single bisection conforms to them.');
} else {
  log('    (B) THE PARAMETERS AND THE POSITIONS DISAGREE. Reconstructing theta from the shipped position');
  log('        does NOT reproduce the driver\'s own sag, so the ruler is walking between parameters that');
  log('        are not the ones the shipped vertices sit at. That is a vertex-bookkeeping defect, and it');
  log('        would make every sag reading on the affected edges a measurement of the wrong curve.');
}
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE FEATURE WIDTH — the number that decides whether DENSITY can ever close these facets.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// If the sag is real, the edge crosses something. WHAT it crosses decides the fix:
//   a BROAD bulge (feature width comparable to the edge) closes by halving — each halving quarters a
//     smooth chord error, and a few halvings reach 10 um.
//   a NARROW spike (feature width << edge) does NOT. Halving an edge that straddles a spike leaves one
//     child still straddling it with almost the same sag. The error falls only once h drops BELOW the
//     feature width — so the required h is the WIDTH, not a fraction of the current edge, and the
//     triangle count scales with (edge/width)^2 rather than with the tolerance.
// Measured by walking the worst edge at 4096 samples and taking the fraction of it on which the
// deviation from the chord exceeds the 10 um product bar. That fraction x the edge length IS the
// required h, directly, with no model in between.
log('');
log('FEATURE WIDTH ON THE WORST EDGE — how fine must h be before bisection starts paying?');
const widths: Array<{ sag: number; le: number; wUm: number; frac: number }> = [];
for (const r of jam) {
  const t = findTri(r); if (t < 0) continue;
  const es: Array<[number, number]> = [[ta[t], tb[t]], [tb[t], tc[t]], [tc[t], ta[t]]];
  let bi = 0; let bs = 0;
  for (let i = 0; i < 3; i += 1) { const s = sagAt(es[i][0], es[i][1], FINE); if (s > bs) { bs = s; bi = i; } }
  const [a, b] = es[bi];
  const ax = vx[a]; const ay = vy[a]; const az = vz[a];
  const ex = vx[b] - ax; const ey = vy[b] - ay; const ez = vz[b] - az;
  const eL2 = ex * ex + ey * ey + ez * ez;
  const th0 = vth[a]; const d = dThRaw(vth[a], vth[b]); const dz = vz[b] - az;
  let over = 0;
  for (let k = 1; k < FINE; k += 1) {
    const tt = k / FINE;
    const th = th0 + d * tt; const z = az + dz * tt;
    const rr = R(th, z);
    const px = rr * Math.cos(th) - ax; const py = rr * Math.sin(th) - ay; const pz = z - az;
    const proj = (px * ex + py * ey + pz * ez) / eL2;
    if (Math.hypot(px - proj * ex, py - proj * ey, pz - proj * ez) > 0.010) over += 1;
  }
  const le = Math.sqrt(eL2) * 1000;
  const frac = over / FINE;
  widths.push({ sag: bs * 1000, le, wUm: frac * le, frac });
}
const wq = (arr: number[], p: number): number => { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const fr = widths.map((w) => w.frac);
const wu = widths.map((w) => w.wUm);
log(`  fraction of the worst edge that is OVER the 10 um bar:  p10 ${wq(fr, 0.1).toFixed(3)}  p50 ${wq(fr, 0.5).toFixed(3)}  p90 ${wq(fr, 0.9).toFixed(3)}  max ${wq(fr, 1).toFixed(3)}`);
log(`  that fraction x edge length = REQUIRED h, in um:        p10 ${wq(wu, 0.1).toFixed(1)}  p50 ${wq(wu, 0.5).toFixed(1)}  p90 ${wq(wu, 0.9).toFixed(1)}  max ${wq(wu, 1).toFixed(1)}`);
const broad = widths.filter((w) => w.frac > 0.5).length;
log(`  BROAD (over-bar on >50% of the edge — density closes these): ${broad} / ${widths.length} (${((100 * broad) / widths.length).toFixed(1)}%)`);
log(`  NARROW (<10% of the edge — a spike; density is the wrong lever): ${widths.filter((w) => w.frac < 0.1).length} / ${widths.length} (${((100 * widths.filter((w) => w.frac < 0.1).length) / widths.length).toFixed(1)}%)`);
log('');
log(`  CURRENT longest edge on these facets: p50 ${wq(widths.map((w) => w.le), 0.5).toFixed(1)} um`);
log(`  ⇒ halvings needed to reach the required h: p50 ${Math.max(0, Math.ceil(Math.log2(wq(widths.map((w) => w.le), 0.5) / Math.max(0.001, wq(wu, 0.5))))).toFixed(0)}`);
log('    Each halving of an edge in 2-D costs ~4x the local facets, so read that exponent as the price.');
log('');
log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
