// s92FlipCoveringRescore.ts — DOES THE CONSTRAINED FLIP'S 3.73x SURVIVE THE COVERING ORIENTATION RULER?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE CLAIM UNDER TEST. S80/S81 banked the constrained flip at **3.73x by AREA on Gothic S39CTL**
// (over-bar orientation area 8.131% -> 2.179%, i.e. 73.2% of the over-bar area removed). S88 §6 quotes
// that figure as the baseline any ranking key would have to beat — and S88 §9 states plainly that it
// "did not re-run or re-validate the flip" and "did not check whether the flip's 3.73x survives".
//
// THE REASON TO DOUBT IT IS STRUCTURAL, NOT STATISTICAL. The 8.131% -> 2.179% is expressed in
// `landFlipPass.orientOf`, which is `normAngOf` — the angle between the facet normal and the surface
// normal **AT THE CENTROID ONLY** (its own docstring: "5 rA evals"). That same quantity is ALSO the
// flip's C1 accept test and its ranking key. So the pass optimises the centroid measure directly, and a
// centroid measure is exactly the one a re-cut diagonal can satisfy while the facet's interior stays
// wrong. S87 independently measured the centroid ruler **21.6x low as a level** on this very mesh.
//
// An improvement measured in the currency the optimiser maximises is not evidence about the surface.
// This tool re-scores the SAME two meshes on `orientOfFacet` — the covering ruler, sup over an order-k
// barycentric lattice — and prints BOTH rulers side by side so the gap is the finding, not an assertion.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS HELD FIXED so the comparison is about the RULER and nothing else:
//   * the same two STLs the 3.73x was banked on: the S39CTL input, and s80land/..._GATE.stl (the packaged
//     flip output whose geometry md5 abbcb74f... is the H-L4-GATE artefact);
//   * ONE golden-ratio-stride sample of facet INDICES, drawn once and scored on BOTH meshes. The flip
//     rewrites slots IN PLACE, so index k in AFTER is the descendant of index k in BEFORE;
//   * both rulers on every sampled facet, area recorded on every facet, count AND area reported;
//   * the covering ruler's construction copied from s70OrientCensus: k=8, inset 0.02, orient 'outward',
//     `fdNormalsCentral`, theta unwrapped with `dThRaw` off vertex A's branch.
//
// NON-VACUITY, checked before any ratio is believed: the CENTROID column must reproduce the banked
// 8.131% -> 2.179%. If it does not, this tool is not measuring what S80 measured and no covering number
// here is admissible.
//
// Usage: bash research/tools/run-s92-flip-covering.sh
//   env: PF_S92_N(40000)  PF_S92_K(8)  PF_S92_INSET(0.02)  PF_S92_BAR_UM(10)
//        PF_S92_H/RB/RT   PF_S92_STYLE  PF_S92_BEFORE  PF_S92_AFTER
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormalsCentral } from '../bridge/orientRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S92_STYLE ?? 'GothicArches';
const BEFORE = process.env.PF_S92_BEFORE ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const AFTER = process.env.PF_S92_AFTER ?? 'research/exchange/_strataConformBisect/s80land/gothicarches_ring_DS-HT_S39CTL_GATE.stl';
const NSAMP = Math.round(envF('PF_S92_N', 40000));
const K = Math.round(envF('PF_S92_K', 8));
const INSET = envF('PF_S92_INSET', 0.02);
const BAR_UM = envF('PF_S92_BAR_UM', 10);
const BAR_MM = BAR_UM / 1000;
const DIMS: StyleDims = { H: envF('PF_S92_H', 120), Rb: envF('PF_S92_RB', 40), Rt: envF('PF_S92_RT', 50), expn: 1 };
const H = DIMS.H;

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
log('===== S92 — DOES THE FLIP\'S 3.73x SURVIVE THE COVERING ORIENTATION RULER? =====');
log(`style ${STYLE}   bar ${BAR_UM} um   N ${NSAMP}   covering k=${K} inset=${INSET} (${((K + 1) * (K + 2)) / 2} pts/facet)`);
log(`BEFORE ${BEFORE}`);
log(`AFTER  ${AFTER}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const ns = fdNormalsCentral(rA, H);

const A = readMeshFloat64(BEFORE, false);
const B = readMeshFloat64(AFTER, false);
log(`BEFORE ${A.nTri} facets   AFTER ${B.nTri} facets   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
if (A.nTri !== B.nTri) { log('*** FACET COUNTS DIFFER — not a connectivity-only pair, ABORT ***'); process.exit(1); }
const nTri = A.nTri;

// ── THE SAMPLE. Golden-ratio stride, same construction the campaign's other probes use, drawn ONCE and
// scored on BOTH meshes so the two columns are the same population rather than two independent draws.
function goldenIdx(n: number, count: number): Int32Array {
  let s = Math.round(n * 0.6180339887);
  if (s % 2 === 0) s += 1;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  while (gcd(s, n) !== 1) s += 2;
  const out = new Int32Array(Math.min(count, n));
  for (let q = 0; q < out.length; q += 1) out[q] = (q * s) % n;
  return out;
}
const idx = goldenIdx(nTri, NSAMP);
log(`sample ${idx.length} facets (${((100 * idx.length) / nTri).toFixed(3)}% coverage), golden stride`);

/** the s60 CENTROID key, verbatim from landFlipPass.orientOf: 2*sin(theta/2)*diam, um. 5 rA evals. */
function centroidOrientUm(
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = Math.atan2(ay, ax);
  const thc = thA + (dThRaw(thA, Math.atan2(by, bx)) + dThRaw(thA, Math.atan2(cy, cx))) / 3;
  const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
  const r = rA(thc, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
  const cc = Math.cos(thc); const ss = Math.sin(thc);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
  const ang = Math.acos(dot);
  const diam = Math.max(
    Math.hypot(bx - cx, by - cy, bz - cz),
    Math.hypot(ax - cx, ay - cy, az - cz),
    Math.hypot(ax - bx, ay - by, az - bz),
  );
  return 2 * Math.sin(0.5 * ang) * diam * 1000;
}

const areaOf = (
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number => {
  const ux = bx - ax; const uy = by - ay; const uz = bz - az;
  const wx = cx - ax; const wy = cy - ay; const wz = cz - az;
  return 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
};

interface Col { cntOver: number; areaOver: number; areaAll: number; maxUm: number; cntFold: number; areaFold: number; maxDeg: number; }
const mk = (): Col => ({ cntOver: 0, areaOver: 0, areaAll: 0, maxUm: 0, cntFold: 0, areaFold: 0, maxDeg: 0 });

const scratch = new Float64Array(12);
function scoreMesh(xyz: Float64Array, label: string): { cen: Col; cov: Col } {
  const cen = mk(); const cov = mk();
  for (let q = 0; q < idx.length; q += 1) {
    const o = idx[q] * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    const ar = areaOf(ax, ay, az, bx, by, bz, cx, cy, cz);
    cen.areaAll += ar; cov.areaAll += ar;

    const cu = centroidOrientUm(ax, ay, az, bx, by, bz, cx, cy, cz);
    if (cu > cen.maxUm) cen.maxUm = cu;
    if (cu > BAR_UM) { cen.cntOver += 1; cen.areaOver += ar; }

    const thA = Math.atan2(ay, ax);
    const thB = thA + dThRaw(thA, Math.atan2(by, bx));
    const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
    const out = orientOfFacet(ns, ax, ay, az, bx, by, bz, cx, cy, cz, thA, thB, thC,
      { k: K, inset: INSET, orient: 'outward', scratch });
    const vu = out.tangMm * 1000;
    if (Number.isFinite(vu)) {
      if (vu > cov.maxUm) cov.maxUm = vu;
      if (vu > BAR_UM) { cov.cntOver += 1; cov.areaOver += ar; }
    }
    // ── S97 THE FOLD CLASS. `normDeg > 90` means the facet is BACK-FACING its own surface — not an
    // approximation of anything, and the most visually destructive defect a mesh can carry (inverted
    // normals render as black or wrongly-lit patches). Isolated here because the flip's headline was
    // judged on BULK orientation area (S92: 1.050x, unimpressive) and nobody has asked what it does to
    // THIS subclass, which is the one that matters for export/visual quality. Measured on the COVERING
    // ruler, so it is not the centroid quantity S92 refuted.
    const nd = (out.normRad * 180) / Math.PI;
    if (Number.isFinite(nd)) {
      if (nd > cov.maxDeg) cov.maxDeg = nd;
      if (nd > 90) { cov.cntFold += 1; cov.areaFold += ar; }
    }
    if ((q + 1) % 10000 === 0) log(`  ${label}: ${q + 1}/${idx.length}   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
  }
  return { cen, cov };
}

const rB = scoreMesh(A.xyz as unknown as Float64Array, 'BEFORE');
const rA2 = scoreMesh(B.xyz as unknown as Float64Array, 'AFTER ');

const pct = (c: Col): number => (100 * c.areaOver) / Math.max(1e-30, c.areaAll);
const cpct = (c: Col): number => (100 * c.cntOver) / Math.max(1, idx.length);
const ratio = (b: Col, a: Col): string => `${(pct(b) / Math.max(1e-30, pct(a))).toFixed(3)}x`;
const cratio = (b: Col, a: Col): string => `${(cpct(b) / Math.max(1e-30, cpct(a))).toFixed(3)}x`;

log('');
log('═══ RESULT — the SAME two meshes, the SAME facets, two rulers ═══');
log('');
log('  CENTROID ruler (s60/landFlipPass `orientOf` — the currency the 3.73x is banked in)');
log(`    BEFORE over-bar ${rB.cen.cntOver}/${idx.length} (${cpct(rB.cen).toFixed(3)}%)   AREA ${pct(rB.cen).toFixed(4)}%   max ${rB.cen.maxUm.toFixed(1)} um`);
log(`    AFTER  over-bar ${rA2.cen.cntOver}/${idx.length} (${cpct(rA2.cen).toFixed(3)}%)   AREA ${pct(rA2.cen).toFixed(4)}%   max ${rA2.cen.maxUm.toFixed(1)} um`);
log(`    *** CENTROID ratio  by AREA ${ratio(rB.cen, rA2.cen)}   by COUNT ${cratio(rB.cen, rA2.cen)} ***`);
log('');
log(`  COVERING ruler (orientOfFacet, k=${K} inset=${INSET}, sup over the facet)`);
log(`    BEFORE over-bar ${rB.cov.cntOver}/${idx.length} (${cpct(rB.cov).toFixed(3)}%)   AREA ${pct(rB.cov).toFixed(4)}%   max ${rB.cov.maxUm.toFixed(1)} um`);
log(`    AFTER  over-bar ${rA2.cov.cntOver}/${idx.length} (${cpct(rA2.cov).toFixed(3)}%)   AREA ${pct(rA2.cov).toFixed(4)}%   max ${rA2.cov.maxUm.toFixed(1)} um`);
log(`    *** COVERING ratio  by AREA ${ratio(rB.cov, rA2.cov)}   by COUNT ${cratio(rB.cov, rA2.cov)} ***`);
log('');
log(`  LEVEL GAP (BEFORE, covering/centroid over-bar AREA): ${(pct(rB.cov) / Math.max(1e-30, pct(rB.cen))).toFixed(2)}x`);
log('');
log('  ═══ THE FOLD CLASS (normDeg > 90 on the COVERING ruler — facets BACK-FACING their own surface) ═══');
const fpc = (c: Col): number => (100 * c.areaFold) / Math.max(1e-30, c.areaAll);
log(`    BEFORE  folded ${rB.cov.cntFold}/${idx.length} facets   AREA ${fpc(rB.cov).toFixed(5)}% of sampled surface   max normDeg ${rB.cov.maxDeg.toFixed(2)}`);
log(`    AFTER   folded ${rA2.cov.cntFold}/${idx.length} facets   AREA ${fpc(rA2.cov).toFixed(5)}% of sampled surface   max normDeg ${rA2.cov.maxDeg.toFixed(2)}`);
log(`    *** FOLD ratio  by COUNT ${(rB.cov.cntFold / Math.max(1, rA2.cov.cntFold)).toFixed(3)}x   by AREA ${(fpc(rB.cov) / Math.max(1e-30, fpc(rA2.cov))).toFixed(3)}x ***`);
log('    (a fold is not an approximation — it is a defect. ZERO is the only acceptable value for export.)');
log('');
// NON-VACUITY. The banked reference is PER MESH and must be supplied per mesh — the first version of
// this block hardcoded Gothic's 8.131/2.179 and therefore printed a 55%/251% "failure" on Voronoi, whose
// banked pair is 13.139/7.960. A check that reports a failure for the wrong reason is as useless as one
// that reports a pass for the wrong reason, so the reference is now explicit and its absence is stated.
const REF_B = process.env.PF_S92_REF_BEFORE === undefined ? NaN : Number(process.env.PF_S92_REF_BEFORE);
const REF_A = process.env.PF_S92_REF_AFTER === undefined ? NaN : Number(process.env.PF_S92_REF_AFTER);
if (Number.isFinite(REF_B) && Number.isFinite(REF_A)) {
  log(`  NON-VACUITY — the CENTROID column must reproduce this mesh's banked ${REF_B}% -> ${REF_A}%.`);
  log(`    banked BEFORE ${REF_B.toFixed(4)}%  vs  measured ${pct(rB.cen).toFixed(4)}%   (delta ${(100 * (pct(rB.cen) - REF_B) / REF_B).toFixed(2)}%)`);
  log(`    banked AFTER  ${REF_A.toFixed(4)}%  vs  measured ${pct(rA2.cen).toFixed(4)}%   (delta ${(100 * (pct(rA2.cen) - REF_A) / REF_A).toFixed(2)}%)`);
  log(`    banked ratio  ${(REF_B / REF_A).toFixed(3)}x  vs  measured ${ratio(rB.cen, rA2.cen)}`);
} else {
  log('  NON-VACUITY — NOT CHECKED: no banked reference supplied for this mesh.');
  log('    Set PF_S92_REF_BEFORE / PF_S92_REF_AFTER (this mesh\'s published centroid over-bar AREA %) to arm it.');
}
log('');
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
