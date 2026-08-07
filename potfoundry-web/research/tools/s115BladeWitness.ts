// s115BladeWitness.ts — S115 WITNESS DUMP. Print the RAW BYTES of the blade pairs S115 found.
//
// WHY. S115 concluded that 67.7% of CelticTriquetra's >45 deg class AREA is BLADES: adjacent facet pairs
// at ~180 deg dihedral whose centroids sit 0.07 pair-diameters apart, i.e. zero-thickness fins. That is an
// INTERPRETATION of two derived numbers. This tool prints the underlying vertex coordinates, radii, thetas,
// z and rA so the claim can be read off the mesh directly instead of trusted. No statistics, no sampling —
// six witnesses and their arithmetic.
//
// Usage: PF_S115W_STL=<abs> bash research/tools/run-s115-witness.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const STYLE = process.env.PF_S115W_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S115W_STL ?? '';
const NW = Number(process.env.PF_S115W_N ?? 6);
const BAR = Number(process.env.PF_S115W_BAR ?? 179);
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DEG = 180 / Math.PI;
if (STL.length === 0) { log('*** PF_S115W_STL is required (ABSOLUTE path). ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const DEFAULTS: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) {
  if (g === undefined) continue;
  for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') DEFAULTS[snakeToCamel(k)] = v.default;
}
const rAb = buildRadiusFn(STYLE as StyleId, { ...DEFAULTS }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > DIMS.H ? DIMS.H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;
const d = facetDihedrals(xyz, new Uint32Array(nTri * 3).map((_, i) => i));
log(`${STYLE}  ${nTri} facets   interior edges ${d.interiorEdges}  boundary ${d.boundaryEdges}  inconsistent ${d.inconsistentEdges}`);
log(`witnessing the first ${NW} interior edges with dihedral >= ${BAR} deg`);
log('');

const thr = (BAR * Math.PI) / 180;
let shown = 0;
const nrm = (f: number): [number, number, number] => {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz) || 1;
  nx /= L; ny /= L; nz /= L;
  return [nx, ny, nz];
};
for (let e = 0; e < d.edgeAngRad.length && shown < NW; e += 1) {
  if (!(d.edgeAngRad[e] >= thr)) continue;
  const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
  shown += 1;
  log(`─── WITNESS ${shown}: edge ${e}, dihedral ${(d.edgeAngRad[e] * DEG).toFixed(6)} deg, facets ${f1} & ${f2} ───`);
  for (const f of [f1, f2]) {
    log(`  facet ${f}   area ${d.areaMm2[f].toExponential(4)} mm2`);
    for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const r = Math.hypot(x, y); const th = Math.atan2(y, x);
      log(`    v${k}  x ${x.toFixed(6)}  y ${y.toFixed(6)}  z ${z.toFixed(6)}   =>  r ${r.toFixed(6)}  theta ${(((th * DEG) + 360) % 360).toFixed(6)} deg   rA(theta,z) ${rA(th, z).toFixed(6)}   |r-rA| ${(Math.abs(r - rA(th, z)) * 1000).toFixed(4)} um`);
    }
    const n = nrm(f);
    const gx = (xyz[f * 9] + xyz[f * 9 + 3] + xyz[f * 9 + 6]) / 3;
    const gy = (xyz[f * 9 + 1] + xyz[f * 9 + 4] + xyz[f * 9 + 7]) / 3;
    const gl = Math.hypot(gx, gy) || 1;
    log(`    wound normal (${n[0].toFixed(6)}, ${n[1].toFixed(6)}, ${n[2].toFixed(6)})   n . r_hat = ${((n[0] * gx + n[1] * gy) / gl).toFixed(6)}`);
  }
  // the theta/z EXTENT of the pair, and the radial extent — a fin is tall in r and ~nil in (theta,z)
  let thMin = Infinity; let thMax = -Infinity; let zMin = Infinity; let zMax = -Infinity; let rMin = Infinity; let rMax = -Infinity;
  let rRef = 0; let nv = 0;
  for (const f of [f1, f2]) for (let k = 0; k < 3; k += 1) {
    const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
    const r = Math.hypot(x, y); const th = Math.atan2(y, x);
    thMin = Math.min(thMin, th); thMax = Math.max(thMax, th);
    zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
    rRef += r; nv += 1;
  }
  rRef /= nv;
  const arc = rRef * (thMax - thMin);
  log(`    PAIR EXTENT:  arc ${arc.toFixed(6)} mm   z ${(zMax - zMin).toFixed(6)} mm   RADIUS ${(rMax - rMin).toFixed(6)} mm`);
  log(`    => the pair spans ${(rMax - rMin).toFixed(4)} mm of RADIUS across ${Math.hypot(arc, zMax - zMin).toFixed(6)} mm of (arc,z): slope ${((rMax - rMin) / Math.max(1e-12, Math.hypot(arc, zMax - zMin))).toFixed(1)}`);
  log('');
}
log(`(a radial surface r=rA(theta,z) whose max |grad r| is ~6.9 CANNOT span more radius than 6.9x its`);
log(` (arc,z) extent. A slope far above that is a mesh CURTAIN, not a steep surface.)`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE BLADE SUB-CENSUS — the witnesses show the class is NOT one thing, so split it and measure the split.
//
//   DUPLICATE      the two facets are near-COINCIDENT: they share 2 vertices exactly and their two APEX
//                  vertices are a tiny fraction of the pair diameter apart. A doubled sheet.
//   FLANK-NEEDLE   the two facets are distinct but both stand EDGE-ON to the radial direction
//                  (|n . r_hat| ~ 0) while the surface under them has an ordinary slope. Their long edge
//                  runs UP the flank, so each normal is set by the short cross-flank offset alone.
//   OTHER          neither.
// Every threshold below is SWEPT and the ladder printed; none is inherited.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
{
  const areaOf = (f: number): number => d.areaMm2[f];
  interface P { apexRel: number; slope: number; minRDot: number; area: number; dihedral: number }
  const rows: P[] = [];
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (!(d.edgeAngRad[e] >= thr)) continue;
    const f1 = d.edgeF1[e]; const f2 = d.edgeF2[e];
    // exact shared vertices, and the two apexes
    const key = (f: number, k: number): string => `${xyz[f * 9 + k * 3]},${xyz[f * 9 + k * 3 + 1]},${xyz[f * 9 + k * 3 + 2]}`;
    const s1 = new Set<string>(); for (let k = 0; k < 3; k += 1) s1.add(key(f1, k));
    let a1 = -1; let a2 = -1;
    for (let k = 0; k < 3; k += 1) if (!s1.has(key(f2, k))) a2 = k;
    const s2 = new Set<string>(); for (let k = 0; k < 3; k += 1) s2.add(key(f2, k));
    for (let k = 0; k < 3; k += 1) if (!s2.has(key(f1, k))) a1 = k;
    let dm = 0;
    for (const ff of [f1, f2]) for (let i = 0; i < 3; i += 1) {
      const j = (i + 1) % 3;
      dm = Math.max(dm, Math.hypot(xyz[ff * 9 + i * 3] - xyz[ff * 9 + j * 3], xyz[ff * 9 + i * 3 + 1] - xyz[ff * 9 + j * 3 + 1], xyz[ff * 9 + i * 3 + 2] - xyz[ff * 9 + j * 3 + 2]));
    }
    const apex = (a1 >= 0 && a2 >= 0)
      ? Math.hypot(xyz[f1 * 9 + a1 * 3] - xyz[f2 * 9 + a2 * 3], xyz[f1 * 9 + a1 * 3 + 1] - xyz[f2 * 9 + a2 * 3 + 1], xyz[f1 * 9 + a1 * 3 + 2] - xyz[f2 * 9 + a2 * 3 + 2])
      : 0;
    let thMin = Infinity; let thMax = -Infinity; let zMin = Infinity; let zMax = -Infinity;
    let rMin = Infinity; let rMax = -Infinity; let rRef = 0;
    for (const f of [f1, f2]) for (let k = 0; k < 3; k += 1) {
      const x = xyz[f * 9 + k * 3]; const y = xyz[f * 9 + k * 3 + 1]; const z = xyz[f * 9 + k * 3 + 2];
      const r = Math.hypot(x, y); const th = Math.atan2(y, x);
      thMin = Math.min(thMin, th); thMax = Math.max(thMax, th);
      zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
      rMin = Math.min(rMin, r); rMax = Math.max(rMax, r); rRef += r;
    }
    rRef /= 6;
    const par = Math.hypot(rRef * (thMax - thMin), zMax - zMin);
    let mrd = Infinity;
    for (const f of [f1, f2]) {
      const n = nrm(f);
      const gx = (xyz[f * 9] + xyz[f * 9 + 3] + xyz[f * 9 + 6]) / 3;
      const gy = (xyz[f * 9 + 1] + xyz[f * 9 + 4] + xyz[f * 9 + 7]) / 3;
      const gl = Math.hypot(gx, gy) || 1;
      mrd = Math.min(mrd, Math.abs((n[0] * gx + n[1] * gy) / gl));
    }
    rows.push({ apexRel: apex / Math.max(1e-12, dm), slope: (rMax - rMin) / Math.max(1e-12, par), minRDot: mrd, area: areaOf(f1) + areaOf(f2), dihedral: d.edgeAngRad[e] * DEG });
  }
  let tot = 0; for (const r of rows) tot += r.area;
  const qq = (v: number[], p: number): number => { const s = v.slice().sort((a, b) => a - b); return s.length === 0 ? NaN : s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  log(`── BLADE SUB-CENSUS: all ${rows.length} interior edges with dihedral >= ${BAR} deg (pair area ${tot.toFixed(3)} mm2) ──`);
  log(`  apexSep/diam     p10 ${qq(rows.map((r) => r.apexRel), 0.1).toExponential(2)}  p50 ${qq(rows.map((r) => r.apexRel), 0.5).toExponential(2)}  p90 ${qq(rows.map((r) => r.apexRel), 0.9).toExponential(2)}`);
  log(`  pair slope dr/ds p10 ${qq(rows.map((r) => r.slope), 0.1).toFixed(3)}  p50 ${qq(rows.map((r) => r.slope), 0.5).toFixed(3)}  p90 ${qq(rows.map((r) => r.slope), 0.9).toFixed(3)}   (analytic ceiling on |grad r| ~ 6.9)`);
  log(`  min |n.r_hat|    p10 ${qq(rows.map((r) => r.minRDot), 0.1).toExponential(2)}  p50 ${qq(rows.map((r) => r.minRDot), 0.5).toExponential(2)}  p90 ${qq(rows.map((r) => r.minRDot), 0.9).toExponential(2)}   (0 = the facet stands EDGE-ON to the radial direction)`);
  log('');
  log('  DUPLICATE LADDER — pairs whose two apex vertices are within X of the pair diameter:');
  for (const cut of [1e-4, 1e-3, 1e-2, 0.05, 0.1, 0.25]) {
    let n = 0; let a = 0;
    for (const r of rows) if (r.apexRel <= cut) { n += 1; a += r.area; }
    log(`    apexSep/diam <= ${cut.toExponential(0).padStart(7)}   pairs ${String(n).padStart(7)} (${((n / rows.length) * 100).toFixed(3).padStart(7)}%)   AREA ${((a / tot) * 100).toFixed(3).padStart(7)}% of the blade area`);
  }
  log('');
  log('  EDGE-ON LADDER — pairs where BOTH facets stand within X of edge-on to the radial direction:');
  for (const cut of [1e-3, 1e-2, 0.05, 0.1, 0.25]) {
    let n = 0; let a = 0;
    for (const r of rows) if (r.minRDot <= cut) { n += 1; a += r.area; }
    log(`    min|n.r_hat| <= ${cut.toExponential(0).padStart(7)}   pairs ${String(n).padStart(7)} (${((n / rows.length) * 100).toFixed(3).padStart(7)}%)   AREA ${((a / tot) * 100).toFixed(3).padStart(7)}% of the blade area`);
  }
  log('');
  log('  SLOPE LADDER — is the SURFACE under the pair steep enough to justify anything?');
  for (const cut of [0.5, 1, 2, 3.44, 6.9, 20, 100]) {
    let n = 0; let a = 0;
    for (const r of rows) if (r.slope > cut) { n += 1; a += r.area; }
    log(`    pair slope > ${String(cut).padStart(6)}   pairs ${String(n).padStart(7)} (${((n / rows.length) * 100).toFixed(3).padStart(7)}%)   AREA ${((a / tot) * 100).toFixed(3).padStart(7)}% of the blade area`);
  }
  log('');
  // MUTUALLY EXCLUSIVE split at the reference cuts
  const DUP = 0.01; const EDGEON = 0.05;
  let dN = 0; let dA = 0; let fN = 0; let fA = 0; let oN = 0; let oA = 0;
  for (const r of rows) {
    if (r.apexRel <= DUP) { dN += 1; dA += r.area; }
    else if (r.minRDot <= EDGEON) { fN += 1; fA += r.area; }
    else { oN += 1; oA += r.area; }
  }
  log(`  *** MUTUALLY EXCLUSIVE SPLIT (apexSep/diam <= ${DUP} => DUPLICATE; else min|n.r_hat| <= ${EDGEON} => FLANK-NEEDLE) ***`);
  log(`    DUPLICATE     pairs ${dN} (${((dN / rows.length) * 100).toFixed(3)}%)   AREA ${((dA / tot) * 100).toFixed(3)}% of the blade area`);
  log(`    FLANK-NEEDLE  pairs ${fN} (${((fN / rows.length) * 100).toFixed(3)}%)   AREA ${((fA / tot) * 100).toFixed(3)}% of the blade area`);
  log(`    OTHER         pairs ${oN} (${((oN / rows.length) * 100).toFixed(3)}%)   AREA ${((oA / tot) * 100).toFixed(3)}% of the blade area`);
  log(`    SUM ${(((dA + fA + oA) / tot) * 100).toFixed(3)}%  <== exhaustiveness`);
}
