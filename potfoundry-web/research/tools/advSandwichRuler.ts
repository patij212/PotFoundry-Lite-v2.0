// s51AdvRuler.ts — DOES THE AR-CAP WIN SURVIVE AN HONEST RULER, AND DOES THE RULER GO BLIND WHERE THE
// LEVER ADDS FACETS?
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE ATTACK
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// The S40 headline (47.282 -> 10.830 um) is `max(sagAdaptive, sagOfN(12), tail@44)` — every term of it
// the driver's INFINITE-PLANE ruler. That ruler is a measured under-reader (median 21.9x, max 541x,
// 2026-08-02). The lever under test RAISES THE ASPECT-RATIO CAP, i.e. it deliberately admits thinner
// facets. If plane-blindness grows with aspect ratio, the headline falls BECAUSE the mesh got thinner,
// not because it got closer, and the result inverts.
//
// THE DISCRIMINATOR IS A SANDWICH ON ONE LATTICE. For every facet, on the SAME barycentric lattice and
// therefore the SAME rA evaluations, three distances from each analytic sample point:
//     plane  = distance to the triangle's INFINITE PLANE      (the driver's ruler; a LOWER bound)
//     ptTri  = distance to the TRIANGLE                       (the honest H1 witness; the driver's own
//                                                              `sagBoundedAtN().wit`, Ericson closest-point)
//     vert   = distance to the barycentrically CORRESPONDING point of the triangle (an UPPER bound)
// plane <= ptTri <= vert, pointwise, by construction. So:
//   * if MAX(vert) at cap 90 is still below MAX(plane) at cap 50, the improvement is REAL and NO
//     blindness argument can rescue the claim — the sandwich closes it.
//   * if MAX(ptTri) does not fall with the cap, the headline is an artefact of the ruler.
// The ratio ptTri/plane is the BLINDNESS, and it is cross-tabbed against aspect ratio, which is the
// quantity the lever moves. That is the whole experiment.
//
// CONTROL, NON-VACUOUS: `plane` at n=12 must reproduce the arm report's own
// "[STRATA-comparable fixed oracle 12]: MAX ..." line (S39CTL 47.282 um, S40AR90 10.813 um). If it does
// not, this file's STL reader / theta reconstruction / rA is wrong and nothing below can be believed.
//
// PLUS the driver's own EDGE ruler (`edgeSagRaw`, imported — not re-coded) over EVERY facet of the mesh
// rather than only over the stranded set, cross-tabbed against AR. That is the "does the high-AR
// population carry more chord error at cap 90" question, measured directly.
//
// Read-only over finished STLs. Single-threaded. ~130 M rA evals per arm.
//
// Usage:  PF_S51_TAGS=S39CTL,S40AR90 bash research/tools/run-s51-adv-ruler.sh
import { writeFileSync } from 'node:fs';
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { aspect3 } from '../bridge/_shapeGuard';
import { edgeSagRaw, type SweepPredConst } from '../bridge/_sweepPredicate';
import type { StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const TWO_PI = 2 * Math.PI;
const TAGS = (process.env.PF_S51_TAGS ?? 'S39CTL,S40AR90').split(',');
const NLAT = Math.round(Number(process.env.PF_S51_N ?? '12'));
const BASE = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_';

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
const { rA, evals } = buildAuditRadiusFn('GothicArches', registryDefaults('GothicArches'), DIMS, H);
/** the driver's PRED constants, defaults verbatim from _strataConformBisectS34.test.ts */
const PRED: SweepPredConst = {
  esN: 8, refHs: 0.03, refNmax: 64,
  kinkScan: 0, kinkHalvings: 0, kinkRatio: 0, jumpRatio: 0, snap: false, confMm: 0,
} as SweepPredConst;

function dTh(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}
const qOf = (s: Float64Array, p: number): number => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))];
const amax = (v: ArrayLike<number>): number => { let m = -Infinity; for (let i = 0; i < v.length; i += 1) if (v[i] > m) m = v[i]; return m; };

log('===== S51 — THE SANDWICH: does the AR-cap win survive an honest ruler? =====');
log(`lattice n=${NLAT} (the arm reports' own "STRATA-comparable fixed oracle 12"), one rA lattice, three distances.`);
log('plane <= ptTri <= vert pointwise. plane is the DRIVER\'s ruler.');
log('');

interface ArmOut {
  tag: string; nTri: number;
  planeMax: number; ptTriMax: number; vertMax: number;
  planeP99: number; ptTriP99: number; vertP99: number;
  planeP999: number; ptTriP999: number; vertP999: number;
  edgeMax: number; edgeP99: number; edgeP999: number; edgeOver10: number;
  overs: Record<string, number>;
}
const outs: ArmOut[] = [];

for (const tag of TAGS) {
  let mesh;
  try { mesh = readMeshFloat64(`${BASE}${tag}.stl`, false); } catch { log(`${tag} (no STL)`); continue; }
  const { xyz, nTri } = mesh;
  const t0 = Date.now(); const e0 = evals();
  const ar = new Float64Array(nTri);
  const dPlane = new Float64Array(nTri);
  const dPtTri = new Float64Array(nTri);
  const dVert = new Float64Array(nTri);
  const dEdge = new Float64Array(nTri);
  const n = NLAT;

  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    ar[t] = aspect3(ax, ay, az, bx, by, bz, cx, cy, cz);
    const thA = Math.atan2(ay, ax);
    const dB = dTh(thA, Math.atan2(by, bx)); const dC = dTh(thA, Math.atan2(cy, cx));

    // ── the driver's EDGE ruler, its own function, all three edges ──
    let eMax = edgeSagRaw(rA, ax, ay, az, bx, by, bz, thA, dB, PRED);
    const e2 = edgeSagRaw(rA, ax, ay, az, cx, cy, cz, thA, dC, PRED);
    if (e2 > eMax) eMax = e2;
    const e3 = edgeSagRaw(rA, bx, by, bz, cx, cy, cz, thA + dB, dC - dB, PRED);
    if (e3 > eMax) eMax = e3;
    dEdge[t] = eMax * 1000;

    // ── ONE lattice, THREE distances ──
    const abx = bx - ax; const aby = by - ay; const abz = bz - az;
    const acx = cx - ax; const acy = cy - ay; const acz = cz - az;
    let nx = aby * acz - abz * acy; let ny = abz * acx - abx * acz; let nz = abx * acy - aby * acx;
    const nl = Math.hypot(nx, ny, nz);
    const havePlane = nl >= 1e-18;
    if (havePlane) { nx /= nl; ny /= nl; nz /= nl; }
    let sPl = 0; let sPt = 0; let sVe = 0;
    for (let i = 0; i <= n; i += 1) {
      const wa = i / n;
      for (let j = 0; j <= n - i; j += 1) {
        const wb = j / n; const wc = 1 - wa - wb;
        const theta = thA + wb * dB + wc * dC;
        const z = wa * az + wb * bz + wc * cz;
        const r = rA(theta, z);
        const qx = r * Math.cos(theta); const qy = r * Math.sin(theta);
        // (1) plane — VERBATIM sagOfNRaw
        if (havePlane) {
          const dd = Math.abs((qx - ax) * nx + (qy - ay) * ny + (z - az) * nz);
          if (dd > sPl) sPl = dd;
        }
        // (2) vert — the barycentrically corresponding point of the triangle (upper bound)
        const vx = wa * ax + wb * bx + wc * cx;
        const vy = wa * ay + wb * by + wc * cy;
        const vz = wa * az + wb * bz + wc * cz;
        const dv = Math.hypot(qx - vx, qy - vy, z - vz);
        if (dv > sVe) sVe = dv;
        // (3) ptTri — exact closest point of the TRIANGLE, Ericson, transcribed from sagBoundedAtN
        const apx = qx - ax; const apy = qy - ay; const apz = z - az;
        const d1 = abx * apx + aby * apy + abz * apz;
        const dd2 = acx * apx + acy * apy + acz * apz;
        let ex: number; let ey: number; let ez: number;
        if (d1 <= 0 && dd2 <= 0) { ex = ax; ey = ay; ez = az; } else {
          const bpx = qx - bx; const bpy = qy - by; const bpz = z - bz;
          const d3 = abx * bpx + aby * bpy + abz * bpz;
          const d4 = acx * bpx + acy * bpy + acz * bpz;
          if (d3 >= 0 && d4 <= d3) { ex = bx; ey = by; ez = bz; } else {
            const vc = d1 * d4 - d3 * dd2;
            if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); ex = ax + abx * v; ey = ay + aby * v; ez = az + abz * v; } else {
              const cpx = qx - cx; const cpy = qy - cy; const cpz = z - cz;
              const d5 = abx * cpx + aby * cpy + abz * cpz;
              const d6 = acx * cpx + acy * cpy + acz * cpz;
              if (d6 >= 0 && d5 <= d6) { ex = cx; ey = cy; ez = cz; } else {
                const vb = d5 * dd2 - d1 * d6;
                if (vb <= 0 && dd2 >= 0 && d6 <= 0) { const w = dd2 / (dd2 - d6); ex = ax + acx * w; ey = ay + acy * w; ez = az + acz * w; } else {
                  const va = d3 * d6 - d5 * d4;
                  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
                    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                    ex = bx + (cx - bx) * w; ey = by + (cy - by) * w; ez = bz + (cz - bz) * w;
                  } else {
                    const den = 1 / (va + vb + vc); const v = vb * den; const w = vc * den;
                    ex = ax + abx * v + acx * w; ey = ay + aby * v + acy * w; ez = az + abz * v + acz * w;
                  }
                }
              }
            }
          }
        }
        const dt2 = (qx - ex) * (qx - ex) + (qy - ey) * (qy - ey) + (z - ez) * (z - ez);
        if (dt2 > sPt) sPt = dt2;
      }
    }
    dPlane[t] = sPl * 1000; dPtTri[t] = Math.sqrt(sPt) * 1000; dVert[t] = sVe * 1000;
    if ((t & 0x3ffff) === 0) {
      // eslint-disable-next-line no-console
      console.error(`  ${tag} ${t}/${nTri}  ${((Date.now() - t0) / 1000).toFixed(0)}s  ${((evals() - e0) / 1e6).toFixed(0)}M evals`);
    }
  }

  const secs = (Date.now() - t0) / 1000;
  const sPlane = Float64Array.from(dPlane).sort();
  const sPt = Float64Array.from(dPtTri).sort();
  const sVe = Float64Array.from(dVert).sort();
  const sEd = Float64Array.from(dEdge).sort();
  const cnt = (v: Float64Array, b: number): number => { let k = 0; for (let i = 0; i < v.length; i += 1) if (v[i] > b) k += 1; return k; };

  log(`--- ${tag}   ${nTri} tris   ${secs.toFixed(0)}s   ${((evals() - e0) / 1e6).toFixed(0)}M rA evals ---`);
  log(`  ${'ruler'.padEnd(8)} ${'p50'.padStart(9)} ${'p99'.padStart(9)} ${'p99.9'.padStart(9)} ${'MAX'.padStart(10)}   ${'>10um'.padStart(8)} ${'>25um'.padStart(7)} ${'>47um'.padStart(7)}`);
  for (const [nm, s] of [['plane', sPlane], ['ptTri', sPt], ['vert', sVe], ['edgeSag', sEd]] as Array<[string, Float64Array]>) {
    log(`  ${nm.padEnd(8)} ${qOf(s, 0.5).toFixed(4).padStart(9)} ${qOf(s, 0.99).toFixed(4).padStart(9)} ${qOf(s, 0.999).toFixed(4).padStart(9)} ${amax(s).toFixed(4).padStart(10)}   ${String(cnt(s, 10)).padStart(8)} ${String(cnt(s, 25)).padStart(7)} ${String(cnt(s, 47)).padStart(7)}`);
  }
  log(`  *** CONTROL: plane MAX must equal this arm's report "[STRATA-comparable fixed oracle 12]" ***`);

  // ── BLINDNESS vs ASPECT RATIO ──
  log('');
  log('  BLINDNESS ptTri/plane BY ASPECT-RATIO BAND (the quantity the lever moves):');
  log(`  ${'AR band'.padEnd(12)} ${'n'.padStart(9)} ${'ptTri p50'.padStart(10)} ${'ptTri MAX'.padStart(10)} ${'plane MAX'.padStart(10)} ${'ratio p50'.padStart(10)} ${'ratio p99'.padStart(10)} ${'ratio MAX'.padStart(10)}`);
  const bands: Array<[number, number, string]> = [[0, 5, '0-5'], [5, 10, '5-10'], [10, 20, '10-20'], [20, 35, '20-35'], [35, 50, '35-50'], [50, 65, '50-65 NEW'], [65, 90, '65-90 NEW'], [90, 1e9, '>90']];
  for (const [lo, hi, nm] of bands) {
    const rr: number[] = []; let pm = 0; let plm = 0; let k = 0; const pv: number[] = [];
    for (let t = 0; t < nTri; t += 1) {
      if (!(ar[t] >= lo && ar[t] < hi)) continue;
      k += 1; pv.push(dPtTri[t]);
      if (dPtTri[t] > pm) pm = dPtTri[t];
      if (dPlane[t] > plm) plm = dPlane[t];
      if (dPlane[t] > 1e-9) rr.push(dPtTri[t] / dPlane[t]);
    }
    if (k === 0) { log(`  ${nm.padEnd(12)} ${'0'.padStart(9)}`); continue; }
    const sr = Float64Array.from(rr).sort(); const spv = Float64Array.from(pv).sort();
    log(`  ${nm.padEnd(12)} ${String(k).padStart(9)} ${qOf(spv, 0.5).toFixed(4).padStart(10)} ${pm.toFixed(4).padStart(10)} ${plm.toFixed(4).padStart(10)} ${(sr.length ? qOf(sr, 0.5) : 0).toFixed(3).padStart(10)} ${(sr.length ? qOf(sr, 0.99) : 0).toFixed(3).padStart(10)} ${(sr.length ? amax(sr) : 0).toFixed(3).padStart(10)}`);
  }

  // ── EDGE SAG BY AR BAND (the coordinator's requested cross-tab) ──
  log('');
  log('  DRIVER EDGE RULER (edgeSagRaw, worst of 3 edges) BY AR BAND — full mesh, not just the stranded set:');
  log(`  ${'AR band'.padEnd(12)} ${'n'.padStart(9)} ${'p50'.padStart(9)} ${'p99'.padStart(9)} ${'MAX'.padStart(10)} ${'>10um'.padStart(8)} ${'%>10um'.padStart(8)}`);
  for (const [lo, hi, nm] of bands) {
    const v: number[] = [];
    for (let t = 0; t < nTri; t += 1) if (ar[t] >= lo && ar[t] < hi) v.push(dEdge[t]);
    if (v.length === 0) { log(`  ${nm.padEnd(12)} ${'0'.padStart(9)}`); continue; }
    const s = Float64Array.from(v).sort();
    const o10 = v.filter((x) => x > 10).length;
    log(`  ${nm.padEnd(12)} ${String(v.length).padStart(9)} ${qOf(s, 0.5).toFixed(4).padStart(9)} ${qOf(s, 0.99).toFixed(4).padStart(9)} ${amax(s).toFixed(4).padStart(10)} ${String(o10).padStart(8)} ${((100 * o10) / v.length).toFixed(4).padStart(8)}`);
  }

  // ── the worst facets on the HONEST ruler, and what the driver read on them ──
  log('');
  log('  WORST 12 BY ptTri (honest), with what the DRIVER\'s plane ruler read on the SAME facet:');
  const idx = Array.from({ length: nTri }, (_, i) => i).sort((a, b) => dPtTri[b] - dPtTri[a]).slice(0, 12);
  log(`  ${'ptTri'.padStart(10)} ${'plane'.padStart(10)} ${'vert'.padStart(10)} ${'edgeSag'.padStart(10)} ${'AR'.padStart(8)} ${'blind'.padStart(7)}  ${'z'.padStart(8)} ${'theta'.padStart(8)}`);
  for (const t of idx) {
    const o = t * 9;
    const gz = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
    const gth = Math.atan2((xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3, (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3);
    log(`  ${dPtTri[t].toFixed(3).padStart(10)} ${dPlane[t].toFixed(3).padStart(10)} ${dVert[t].toFixed(3).padStart(10)} ${dEdge[t].toFixed(3).padStart(10)} ${ar[t].toFixed(2).padStart(8)} ${(dPlane[t] > 1e-9 ? dPtTri[t] / dPlane[t] : 0).toFixed(2).padStart(7)}  ${gz.toFixed(3).padStart(8)} ${gth.toFixed(4).padStart(8)}`);
  }
  log('');

  const rec: ArmOut = {
    tag, nTri,
    planeMax: amax(sPlane), ptTriMax: amax(sPt), vertMax: amax(sVe),
    planeP99: qOf(sPlane, 0.99), ptTriP99: qOf(sPt, 0.99), vertP99: qOf(sVe, 0.99),
    planeP999: qOf(sPlane, 0.999), ptTriP999: qOf(sPt, 0.999), vertP999: qOf(sVe, 0.999),
    edgeMax: amax(sEd), edgeP99: qOf(sEd, 0.99), edgeP999: qOf(sEd, 0.999), edgeOver10: cnt(sEd, 10),
    overs: { ptTriOver10: cnt(sPt, 10), planeOver10: cnt(sPlane, 10), vertOver10: cnt(sVe, 10) },
  };
  outs.push(rec);
  // CHECKPOINT the instant this arm is done — the box is contended and this may be killed.
  writeFileSync(`research/exchange/_strataConformBisect/ADV_SANDWICH_${tag}.json`, JSON.stringify(rec, null, 2));
}

log('===== SUMMARY — THE SANDWICH =====');
log(`${'arm'.padEnd(10)} ${'plane MAX'.padStart(10)} ${'ptTri MAX'.padStart(10)} ${'vert MAX'.padStart(10)} ${'edge MAX'.padStart(10)}`);
for (const r of outs) log(`${r.tag.padEnd(10)} ${r.planeMax.toFixed(3).padStart(10)} ${r.ptTriMax.toFixed(3).padStart(10)} ${r.vertMax.toFixed(3).padStart(10)} ${r.edgeMax.toFixed(3).padStart(10)}`);
if (outs.length >= 2) {
  const a = outs[0]; const b = outs[outs.length - 1];
  log('');
  log(`KILL-CRITERION: if ${b.tag} vert MAX (${b.vertMax.toFixed(3)}) < ${a.tag} plane MAX (${a.planeMax.toFixed(3)}), the cap win is REAL`);
  log(`                and cannot be a blindness artefact — vert is a pointwise UPPER bound on the honest quantity.`);
  log(`                VERDICT: ${b.vertMax < a.planeMax ? 'SANDWICH CLOSES — the win is real on this lattice.' : 'SANDWICH OPEN — the honest upper bound does NOT beat the old headline.'}`);
  log(`                honest (ptTri) movement: ${a.ptTriMax.toFixed(3)} -> ${b.ptTriMax.toFixed(3)} = ${(a.ptTriMax / Math.max(1e-9, b.ptTriMax)).toFixed(2)}x   (headline claimed 4.37x)`);
}
