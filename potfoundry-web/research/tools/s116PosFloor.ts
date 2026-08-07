// s116PosFloor.ts — S116 PART 1: WHAT IS THE POSITION ERROR *TODAY*, EXHAUSTIVELY, AGAINST BOTH FLOORS.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS AND WHAT IT REFUSES TO DO
// ─────────────────────────────────────────────────────────────────────────────────────────────────
// S115 priced the shipping meshes with a STRIDE sample and with the RADIAL projector alone, and both
// choices bit: a stride of 8 missed 4 facets sitting at 1,374.8 um (27x the export gate), and the
// radial ruler is structurally blind on curtain facets — 99.075% of them are already "over the bar"
// under it, which makes any unrestricted average meaningless. This tool fixes both:
//
//   * EXHAUSTIVE. Every facet. No stride anywhere. The cheap ruler is cheap enough (measured 17-20 s
//     for a whole 1.7 M-facet mesh at k=4) that a stride was never justified.
//   * THREE RULERS, REPORTED AS A BRACKET, never one number.
//       R1 RADIAL GAP    |hypot(x,y) - rA(atan2(y,x), z)|. A PROVEN UPPER BOUND on the true distance
//                        to the surface: the point (rA*cos, rA*sin, z) is ON the surface and lies at
//                        exactly that distance. So R1 <= bar CERTIFIES a facet, forever, with no
//                        appeal. R1 > bar certifies nothing — it is the candidate set.
//       R2 NORMAL-CORRECTED  R1 * |n_A . rhat| at the radial foot. The standard first-order
//                        correction; exact for a plane, an approximation otherwise. NOT sound in
//                        either direction, so it is only ever quoted next to R3.
//       R3 PERPENDICULAR buildRadialSurfaceProjector — globally-seeded Gauss-Newton, which the
//                        docstring establishes is a VALID UPPER BOUND that never under-states (every
//                        seed is polished to an actual surface point). This is the reference.
//     R3 <= R1 always (the projector seeds include the radial foot). The pair therefore BRACKETS the
//     truth and the report prints the bracket width rather than a single verdict.
//
// AND THE CONTROLS THAT CAN VOID THE RUN:
//   C1 VERTEX-ON-SURFACE. Every mesh vertex is claimed to be rA-derived, so R1 at a vertex must be at
//      the f32 STL quantisation floor (~50 mm * 2^-24 = 3.0e-6 mm). If it is not, the mesh is not the
//      mesh this ruler thinks it is and every number below is void.
//   C2 R3 <= R1 + eps on every probed point. A violation means the projector is not seeding the
//      radial foot, i.e. R1 is not the upper bound this tool relies on.
//   C3 z-domain containment: rA is CLAMPED outside [0,H], so a facet outside that band would be scored
//      against an extrapolated surface. Counted and reported.
//
// SCAR COMPLIANCE. The barycentric lattice order k is SWEPT (scar 2): a max over a finite lattice
// under-reads the true sup over the triangle, so the k-ladder has to be shown to converge before any
// k is quoted. The projector's seed grid (nTheta x nZ) and seedTopK are swept for the same reason.
//
// SCOPE, STATED PLAINLY: this is the mesh->surface half (H1). It cannot see a feature the mesh missed
// entirely (H2). Facet interiors are what chord sag lives in, so H1 is the right half for pricing the
// floors; the H2 caveat is repeated in the report so no reader takes this for a two-sided Hausdorff.
//
// Usage: bash research/tools/run-s116-posfloor.sh   (env PF_S116_STL absolute)
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { buildRadialSurfaceProjector } from '../../src/fidelity/radialSurfaceProjector';
import { writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../bridge/runStyle';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envI = (n: string, d: number): number => Math.round(envF(n, d));
const STYLE = process.env.PF_S116_STYLE ?? 'CelticTriquetra';
const STL = process.env.PF_S116_STL ?? '';
const TAG = process.env.PF_S116_TAG ?? 'X';
const OUTDIR = process.env.PF_S116_OUTDIR ?? 'research/exchange/_strataConformBisect/s116';
const DIMS: StyleDims = { H: envF('PF_S116_H', 120), Rb: envF('PF_S116_RB', 40), Rt: envF('PF_S116_RT', 50), expn: 1 };
const H = DIMS.H;
const BAR_HI = envF('PF_S116_BARHI', 0.01);      // the shipping export gate, mm
const BAR_LO = envF('PF_S116_BARLO', 0.001);     // the stretch floor, mm
const K = envI('PF_S116_K', 6);                  // production lattice order
const KSW = (process.env.PF_S116_KSWEEP ?? '2,3,4,6,8,12').split(',').map((s) => Math.round(Number(s)));
const KSW_N = envI('PF_S116_KSWEEP_N', 60000);   // facets in the k-sweep (strided over the WHOLE mesh)
const PROJ_NTH = envI('PF_S116_PNTH', 1024);
const PROJ_NZ = envI('PF_S116_PNZ', 512);
const PROJ_K = envI('PF_S116_PK', 6);
const PERP_TOP = envI('PF_S116_PERPTOP', 4);     // lattice points per facet handed to R3
const PERP_CAND = envF('PF_S116_PERPCAND', 0.0005); // R1 above this => adjudicate with R3
const PERP_CAP = envI('PF_S116_PERPCAP', 3_000_000); // hard cap on R3 calls; overflow is REPORTED
if (STL.length === 0) { log('*** PF_S116_STL required ***'); process.exit(2); }

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[STYLE];
const D: Record<string, number> = {};
for (const g of [cfg?.params, cfg?.advancedParams]) if (g !== undefined) for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') D[snakeToCamel(k)] = v.default;
const rAb = buildRadiusFn(STYLE as StyleId, { ...D }, DIMS);
const rA = (th: number, z: number): number => rAb(canonTheta(th), z < 0 ? 0 : z > H ? H : z);

const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`===== S116 PART 1 — EXHAUSTIVE POSITION FLOOR CENSUS — ${STYLE} =====`);
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`stl      ${STL}`);
log(`facets   ${nTri}   (EXHAUSTIVE: every facet is visited; no stride anywhere in the main pass)`);
log(`params   ${JSON.stringify(D)}   dims H=${H} Rb=${DIMS.Rb} Rt=${DIMS.Rt} expn=${DIMS.expn}`);
log(`bars     HI ${BAR_HI} mm (${(BAR_HI * 1000).toFixed(1)} um)   LO ${BAR_LO} mm (${(BAR_LO * 1000).toFixed(1)} um)`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const q = (v: Float64Array | number[], p: number): number => {
  const n = v.length; if (n === 0) return NaN;
  return v[Math.min(n - 1, Math.max(0, Math.floor(n * p)))];
};
const sortedCopy = (v: Float64Array): Float64Array => { const c = v.slice(); c.sort(); return c; };
const pct = (a: number, b: number): string => (b === 0 ? '   —   ' : ((a / b) * 100).toFixed(4));

/** R1 over a barycentric lattice of order k. Returns {max, argmax bary index}. */
const latticePts = (k: number): Float64Array => {
  const out: number[] = [];
  for (let i = 0; i <= k; i += 1) for (let j = 0; i + j <= k; j += 1) out.push((k - i - j) / k, i / k, j / k);
  return new Float64Array(out);
};

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// SCAR 2 — LATTICE ORDER SWEEP. Shown BEFORE any k is used for a headline number.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── SCAR 2: BARYCENTRIC LATTICE ORDER k — CONVERGENCE OF THE R1 SUP ──');
log('   (strided over the WHOLE mesh purely so the ladder is affordable; the MAIN pass below is exhaustive)');
log('   k     pts/facet      MAX R1 mm     mean R1 mm    facets>HI    facets>LO');
{
  const kstride = Math.max(1, Math.floor(nTri / KSW_N));
  for (const k of KSW) {
    const L = latticePts(k); const np = L.length / 3;
    let mx = 0; let sum = 0; let n = 0; let oh = 0; let ol = 0;
    for (let f = 0; f < nTri; f += kstride) {
      const o = f * 9;
      const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
      const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
      const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
      let w = 0;
      for (let p = 0; p < np; p += 1) {
        const w0 = L[p * 3], w1 = L[p * 3 + 1], w2 = L[p * 3 + 2];
        const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
        const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
        if (dd > w) w = dd;
      }
      if (w > mx) mx = w; sum += w; n += 1; if (w > BAR_HI) oh += 1; if (w > BAR_LO) ol += 1;
    }
    log(`   ${String(k).padStart(3)}  ${String(np).padStart(10)}   ${mx.toExponential(4).padStart(13)}  ${(sum / n).toExponential(4).padStart(13)}  ${String(oh).padStart(10)}   ${String(ol).padStart(10)}   (n=${n})`);
  }
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// MAIN PASS — EXHAUSTIVE. R1 + geometry + C1 + C3, every facet.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const LAT = latticePts(K); const NP = LAT.length / 3;
const r1 = new Float64Array(nTri);        // R1 sup over the lattice
const r1arg = new Int32Array(nTri);       // argmax lattice index
const areaA = new Float64Array(nTri);     // 3D facet area, mm2
const hEdge = new Float64Array(nTri);     // longest edge, mm
const parArea = new Float64Array(nTri);   // |parametric footprint| in mm2 (arc-length units)
const vertMax = new Float64Array(nTri);   // C1: worst vertex R1
let areaTot = 0; let zOut = 0; let degen = 0;
const tMain = Date.now();
{
  const wbuf = new Float64Array(NP);
  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const area = 0.5 * Math.hypot(nx, ny, nz);
    areaA[f] = area; areaTot += area;
    hEdge[f] = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - bx, cy - by, cz - bz), Math.hypot(ax - cx, ay - cy, az - cz));
    if (az < 0 || az > H || bz < 0 || bz > H || cz < 0 || cz > H) zOut += 1;

    // parametric footprint (unwrapped theta, scaled to arc length by the mean radius)
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    const rm = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
    const ua = tha * rm, ub = thb * rm, uc = thc * rm;
    parArea[f] = 0.5 * Math.abs((ub - ua) * (cz - az) - (uc - ua) * (bz - az));
    if (parArea[f] <= 0) degen += 1;

    // C1 — vertices must be ON the surface
    const va = Math.abs(Math.hypot(ax, ay) - rA(tha, az));
    const vb = Math.abs(Math.hypot(bx, by) - rA(thb, bz));
    const vc = Math.abs(Math.hypot(cx, cy) - rA(thc, cz));
    vertMax[f] = Math.max(va, vb, vc);

    let w = 0; let wi = 0;
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const dd = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
      wbuf[p] = dd; if (dd > w) { w = dd; wi = p; }
    }
    r1[f] = w; r1arg[f] = wi;
  }
}
log(`── MAIN EXHAUSTIVE PASS: ${nTri} facets x ${NP} lattice points (k=${K}) in ${((Date.now() - tMain) / 1000).toFixed(1)} s ──`);
log(`   total 3D area ${areaTot.toFixed(3)} mm2`);
log('');

// ── CONTROLS ──
const vs = sortedCopy(vertMax);
const f32floor = 50 * Math.pow(2, -24);
log('── CONTROLS ──');
log(`   C1 vertex-on-surface (R1 at the 3 vertices, EXHAUSTIVE):`);
log(`      p50 ${q(vs, 0.5).toExponential(3)}  p99 ${q(vs, 0.99).toExponential(3)}  p99.99 ${q(vs, 0.9999).toExponential(3)}  MAX ${q(vs, 1).toExponential(3)} mm`);
log(`      f32 STL quantisation floor at r~50mm = ${f32floor.toExponential(3)} mm.  MAX/floor = ${(q(vs, 1) / f32floor).toFixed(2)}x`);
{
  let nOver = 0; let aOver = 0;
  for (let f = 0; f < nTri; f += 1) if (vertMax[f] > BAR_LO) { nOver += 1; aOver += areaA[f]; }
  log(`      facets with a vertex OFF the surface by more than the LO bar (${BAR_LO} mm): ${nOver} (${pct(nOver, nTri)}%), area ${pct(aOver, areaTot)}%`);
  log(`      ${nOver === 0 ? 'CONTROL HOLDS — vertices are on the surface by construction; ALL residual below is facet-INTERIOR.' : 'CONTROL FIRES — some vertices are off-surface; the "chord sag only" reading does NOT hold for those.'}`);
}
log(`   C3 facets with a vertex outside z in [0,H]: ${zOut} (${pct(zOut, nTri)}%)  ${zOut === 0 ? 'CONTROL HOLDS' : 'clamped-rA extrapolation — see note'}`);
log(`      facets with ZERO parametric footprint area (exactly degenerate in (theta,z)): ${degen} (${pct(degen, nTri)}%)`);
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// R3 — PERPENDICULAR ADJUDICATION of every facet whose R1 clears the candidate threshold.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── SCAR 2b: PROJECTOR SEED-GRID SWEEP (R3 must be grid-independent before it adjudicates anything) ──');
log('   nTheta x nZ   topK      MAX R3 mm      mean R3 mm    build ms   proj/s');
{
  const gsweep: Array<[number, number, number]> = [[512, 256, 6], [1024, 512, 6], [1024, 512, 12], [2048, 768, 6]];
  const NS = envI('PF_S116_GSW_N', 4000);
  // sample the WORST facets by R1 — that is where a wrong seed well would actually bite
  const idx = Array.from({ length: nTri }, (_, i) => i);
  idx.sort((a, b) => r1[b] - r1[a]);
  const probe = idx.slice(0, NS);
  for (const [nt, nz, tk] of gsweep) {
    const tb = Date.now();
    const P = buildRadialSurfaceProjector(rA, { H, nTheta: nt, nZ: nz, seedTopK: tk });
    const bms = Date.now() - tb;
    const t0 = Date.now(); let mx = 0; let sum = 0;
    for (const f of probe) {
      const o = f * 9; const p = r1arg[f];
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * xyz[o] + w1 * xyz[o + 3] + w2 * xyz[o + 6];
      const y = w0 * xyz[o + 1] + w1 * xyz[o + 4] + w2 * xyz[o + 7];
      const z = w0 * xyz[o + 2] + w1 * xyz[o + 5] + w2 * xyz[o + 8];
      const d = P.project(x, y, z).dist; if (d > mx) mx = d; sum += d;
    }
    const ms = Math.max(1, Date.now() - t0);
    log(`   ${String(nt).padStart(5)} x ${String(nz).padStart(4)}   ${String(tk).padStart(3)}    ${mx.toExponential(4).padStart(13)}  ${(sum / probe.length).toExponential(4).padStart(13)}   ${String(bms).padStart(8)}   ${(probe.length / (ms / 1000)).toFixed(0).padStart(7)}`);
  }
}
log('');

const proj = buildRadialSurfaceProjector(rA, { H, nTheta: PROJ_NTH, nZ: PROJ_NZ, seedTopK: PROJ_K });
const r3 = new Float64Array(nTri);
let nCand = 0; let nProjCalls = 0; let c2viol = 0; let c2worst = 0; let capped = 0;
{
  const tP = Date.now();
  const ord = new Int32Array(NP);
  const dd = new Float64Array(NP);
  for (let f = 0; f < nTri; f += 1) {
    if (r1[f] <= PERP_CAND) { r3[f] = r1[f]; continue; }   // R1 is an upper bound => already certified
    nCand += 1;
    if (nProjCalls >= PERP_CAP) { r3[f] = r1[f]; capped += 1; continue; }
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    for (let p = 0; p < NP; p += 1) {
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      dd[p] = Math.abs(Math.hypot(x, y) - rA(Math.atan2(y, x), z));
    }
    // top-PERP_TOP lattice points by R1 — insertion selection into a fixed buffer; no per-facet allocation
    // (1.1 M allocations of a 45-element array was 40% of this pass in the smoke run).
    let nTop = 0;
    for (let p = 0; p < NP; p += 1) {
      const v = dd[p];
      if (nTop < PERP_TOP) { let i = nTop; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; nTop += 1; }
      else if (v > dd[ord[nTop - 1]]) { let i = nTop - 1; while (i > 0 && dd[ord[i - 1]] < v) { ord[i] = ord[i - 1]; i -= 1; } ord[i] = p; }
    }
    let best = 0;
    for (let ti = 0; ti < nTop; ti += 1) {
      const p = ord[ti];
      const w0 = LAT[p * 3], w1 = LAT[p * 3 + 1], w2 = LAT[p * 3 + 2];
      const x = w0 * ax + w1 * bx + w2 * cx, y = w0 * ay + w1 * by + w2 * cy, z = w0 * az + w1 * bz + w2 * cz;
      const d = proj.project(x, y, z).dist; nProjCalls += 1;
      if (d > dd[p] + 1e-9) { c2viol += 1; const e = d - dd[p]; if (e > c2worst) c2worst = e; }
      if (d > best) best = d;
    }
    r3[f] = best;
  }
  log(`── R3 PERPENDICULAR ADJUDICATION ──`);
  log(`   candidates (R1 > ${PERP_CAND} mm): ${nCand} (${pct(nCand, nTri)}% of facets)`);
  log(`   projector calls: ${nProjCalls}  (top-${PERP_TOP} lattice points per candidate)  in ${((Date.now() - tP) / 1000).toFixed(1)} s`);
  log(`   facets left UNADJUDICATED by the cap (reported as R1, i.e. conservatively over-read): ${capped}`);
  log(`   C2 R3 > R1 violations: ${c2viol} / ${nProjCalls}  worst excess ${c2worst.toExponential(3)} mm  ${c2viol === 0 ? 'CONTROL HOLDS — R1 is a valid upper bound.' : 'CONTROL FIRES'}`);
  log('');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE HEADLINE TABLE — COUNT + AREA + MAX, per bar, per ruler. Never one of the three alone.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
const tally = (v: Float64Array, bar: number): { n: number; a: number; mx: number } => {
  let n = 0; let a = 0; let mx = 0;
  for (let f = 0; f < nTri; f += 1) { const d = v[f]; if (d > bar) { n += 1; a += areaA[f]; } if (d > mx) mx = d; }
  return { n, a, mx };
};
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   HEADLINE — POSITION ERROR OF THE SHIPPING MESH, EXHAUSTIVE, COUNT + AREA + MAX TOGETHER');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   ruler                bar mm     facets over        of mesh      AREA over mm2    of area      MAX mm');
for (const [name, v] of [['R1 radial (UPPER BOUND)', r1], ['R3 perpendicular (HONEST)', r3]] as Array<[string, Float64Array]>) {
  for (const bar of [BAR_HI, BAR_LO]) {
    const t = tally(v, bar);
    log(`   ${name.padEnd(26)} ${bar.toFixed(4)}  ${String(t.n).padStart(12)}  ${pct(t.n, nTri).padStart(10)}%  ${t.a.toFixed(4).padStart(15)}  ${pct(t.a, areaTot).padStart(9)}%  ${t.mx.toExponential(4)}`);
  }
}
log('');
log('   READ: R1 is a PROVEN upper bound, so "R1 <= bar" is an unappealable certificate and the R1 row is a');
log('   CEILING on the defect. R3 never under-states either, so the truth for the over-set lies between the');
log('   two rows. Where they disagree, the gap IS the radial projector\'s curtain blindness, quantified.');
log('');

// distribution
{
  const s1 = sortedCopy(r1); const s3 = sortedCopy(r3);
  const ps = [0.5, 0.9, 0.99, 0.999, 0.9999, 0.99999, 1];
  log('   FULL DISTRIBUTION (per facet, EXHAUSTIVE), mm:');
  log(`   quantile   ${ps.map((p) => (p === 1 ? 'MAX' : `p${(p * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}`).padStart(12)).join('')}`);
  log(`   R1 radial  ${ps.map((p) => q(s1, p).toExponential(3).padStart(12)).join('')}`);
  log(`   R3 perp    ${ps.map((p) => q(s3, p).toExponential(3).padStart(12)).join('')}`);
  // area-weighted deciles of the defect
  let aOverHi = 0; let aOverLo = 0;
  for (let f = 0; f < nTri; f += 1) { if (r3[f] > BAR_HI) aOverHi += areaA[f]; if (r3[f] > BAR_LO) aOverLo += areaA[f]; }
  log('');
  log(`   AREA above HI bar (R3): ${aOverHi.toFixed(4)} mm2 = ${pct(aOverHi, areaTot)}%   above LO bar: ${aOverLo.toFixed(4)} mm2 = ${pct(aOverLo, areaTot)}%`);
}
log('');

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// THE SPLIT: chord sag of a correct triangulation vs. footprint-degenerate (fold/blade/curtain).
// A facet whose 3 vertices are ON the surface IS, by definition, the correct flat chord over its own
// parametric footprint — so its residual is chord sag and shrinking the footprint must kill it. The
// exception is a footprint with (near-)zero parameter area but large 3D area: there the triangle is a
// CURTAIN spanning a jump in the parameterisation, the "chord over a footprint" reading collapses, and
// this is the class S115 showed is mesh-made. graphRatio = 3D area / parametric area is that test.
// ─────────────────────────────────────────────────────────────────────────────────────────────────
log('── THE SPLIT — graphRatio = 3D area / parametric footprint area (a degeneracy census, EXHAUSTIVE) ──');
{
  const edges = [0, 1.5, 3, 10, 100, 1e4, Infinity];
  const lbl = ['[1.0,1.5)  flat-ish graph', '[1.5,3)    tilted', '[3,10)     steep', '[10,100)   near-edge-on', '[1e2,1e4)  CURTAIN', '>=1e4      DEGENERATE'];
  const cn = new Array<number>(6).fill(0); const ca = new Array<number>(6).fill(0);
  const coHi = new Array<number>(6).fill(0); const caHi = new Array<number>(6).fill(0); const cmx = new Array<number>(6).fill(0);
  const coLo = new Array<number>(6).fill(0); const caLo = new Array<number>(6).fill(0);
  for (let f = 0; f < nTri; f += 1) {
    const g = parArea[f] > 0 ? areaA[f] / parArea[f] : Infinity;
    let b = 5; for (let i = 0; i < 6; i += 1) if (g >= edges[i] && g < edges[i + 1]) { b = i; break; }
    cn[b] += 1; ca[b] += areaA[f];
    if (r3[f] > BAR_HI) { coHi[b] += 1; caHi[b] += areaA[f]; }
    if (r3[f] > BAR_LO) { coLo[b] += 1; caLo[b] += areaA[f]; }
    if (r3[f] > cmx[b]) cmx[b] = r3[f];
  }
  log('   band                        facets    %mesh     area mm2   %area   >HI facets  >HI area%  >LO area%   MAX R3 mm');
  for (let i = 0; i < 6; i += 1) {
    log(`   ${lbl[i].padEnd(26)} ${String(cn[i]).padStart(9)} ${pct(cn[i], nTri).padStart(8)}% ${ca[i].toFixed(2).padStart(11)} ${pct(ca[i], areaTot).padStart(7)}% ${String(coHi[i]).padStart(11)} ${pct(caHi[i], areaTot).padStart(9)}% ${pct(caLo[i], areaTot).padStart(9)}%  ${cmx[i].toExponential(3)}`);
  }
  const curtA = ca[4] + ca[5]; const curtHi = caHi[4] + caHi[5]; const curtLo = caLo[4] + caLo[5];
  let totHi = 0; let totLo = 0;
  for (let f = 0; f < nTri; f += 1) { if (r3[f] > BAR_HI) totHi += areaA[f]; if (r3[f] > BAR_LO) totLo += areaA[f]; }
  log('');
  log(`   CURTAIN+DEGENERATE (graphRatio >= 100): ${pct(curtA, areaTot)}% of MESH area,`);
  log(`      and it carries ${pct(curtHi, totHi)}% of the >HI defect area and ${pct(curtLo, totLo)}% of the >LO defect area.`);
  log('   (These shares are OF THE DEFECT CLASS. The MESH share is the first number. Do not conflate them.)');
}
log('');

// worst-facet dump
{
  const idx = Array.from({ length: nTri }, (_, i) => i);
  idx.sort((a, b) => r3[b] - r3[a]);
  log('── WORST 15 FACETS BY R3 (the honest ruler) ──');
  log('   rank        facet      R3 mm       R1 mm     area mm2    hEdge mm   graphRatio   vertMax mm');
  for (let i = 0; i < Math.min(15, idx.length); i += 1) {
    const f = idx[i]; const g = parArea[f] > 0 ? areaA[f] / parArea[f] : Infinity;
    log(`   ${String(i + 1).padStart(4)} ${String(f).padStart(12)}  ${r3[f].toExponential(3)}  ${r1[f].toExponential(3)}  ${areaA[f].toExponential(3)}  ${hEdge[f].toExponential(3)}  ${(Number.isFinite(g) ? g.toExponential(3) : 'INF').padStart(11)}  ${vertMax[f].toExponential(3)}`);
  }
}
log('');

// machine-readable
{
  const out = {
    style: STYLE, stl: STL, nTri, areaTot, K, barHi: BAR_HI, barLo: BAR_LO,
    controls: { vertMaxMax: q(sortedCopy(vertMax), 1), zOut, degen, c2viol, c2worst, capped, nCand, nProjCalls },
    headline: {
      r1Hi: tally(r1, BAR_HI), r1Lo: tally(r1, BAR_LO),
      r3Hi: tally(r3, BAR_HI), r3Lo: tally(r3, BAR_LO),
    },
  };
  const p = `${OUTDIR}/S116_POSFLOOR_${TAG}.json`;
  writeFileSync(p, JSON.stringify(out, null, 2));
  log(`json -> ${p}`);
  // per-facet residuals for the ladder tool to reuse
  if (process.env.PF_S116_DUMPBIN === '1') {
    const b = `${OUTDIR}/S116_R3_${TAG}.f32`;
    writeFileSync(b, Buffer.from(new Float32Array(r3).buffer));
    log(`r3 binary -> ${b}`);
  }
}
log('S116 PART 1 DONE');
