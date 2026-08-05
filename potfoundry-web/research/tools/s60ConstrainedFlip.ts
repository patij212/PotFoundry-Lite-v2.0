// s60ConstrainedFlip.ts — THE CONSTRAINED FLIP. Connectivity-only orientation repair on a FIXED vertex set.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-05, BEFORE THE FIRST RUN. Full text: research/exchange/_strataConformBisect/
// S60_FLIP_FINDINGS.md §0. Short form, so the code and the claim cannot drift apart:
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// H-S60: on Voronoi (806,765 facets — 3.5x Gothic by over-bar count, 34x by p99) a flip-only pass accepted
// only when ALL of
//   C1  max(tangExc) over the incident PAIR strictly decreases,
//   C2  BOTH new facets' position sag <= max(10 um, old pair max)   [the DRIVER's own ruler, sagAdaptiveRaw]
//   C3  BOTH new facets clear a DERIVED f32 determinacy floor on min-altitude (jitterUm <= 1 um),
//   C4  topology preserved: interior edge, no (theta,z) fold, no duplicate-edge creation, orientation-
//       consistent re-labelling, boundary + non-manifold counts unchanged,
// reduces tangExc>10um by >= 2x while adding ZERO position failures.
//
// KILL-CRITERIA (the exact numbers):
//   K1  over10(tang)_after > 0.5 * over10(tang)_before                 -> REFUTED as a standalone fix
//   K2  over10(pos)_after  > over10(pos)_before                        -> guard BROKEN, arm unsound
//       AND rejPos == 0                                               -> the position clause is VACUOUS
//   K3  any output facet below the derived floor / maxAngle >= 179.999 / jitterUm > 10 um -> floor broken
//   K4  fracUnreachable (s61FlipCeiling.ts) decides connectivity-vs-refinement; >=0.5 => new vertices
//       are mandatory for the majority of the residual, <=0.1 => it is a SEARCH failure.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY C3 IS DERIVED AND NOT PICKED, and why it is also a MEASUREMENT-VALIDITY instrument
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Vertices are f32. A consumer computing (b-a)x(c-a) in f32 carries ~1/2 ulp(R) per component; displacing a
// vertex by delta perpendicular to the opposite edge tilts the plane by delta/h (h = that vertex's altitude),
// so over three vertices the normal is uncertain by <= 1.5*ulp(R)/minAlt. Since tangExc = sin(angle) x diam,
//        jitterUm = 1.5 * ulp(R) * diam / minAlt   (mm -> um)
// is the uncertainty OF THE QUANTITY WE ARE OPTIMISING. The floor is jitterUm <= 1 um = one tenth of the
// decision bar. ulp(R) is the exact f32 spacing at R, so nothing is tuned. The same number audits the S56
// result: tangExc "improvement" living in facets with jitterUm > 10 um is not improvement, it is noise.
// PF_S60_DETPROBE=1 validates the constant 1.5 by perturbing vertices by +-1/2 ulp and regressing.
//
// READ-ONLY over a finished STL. No pipeline file is touched; src/ is not imported except the style registry
// and the radius function, exactly as every other s5x/s6x probe does.
//
// Usage:  bash research/tools/run-s60-constrained-flip.sh <TAG>      (env: PF_S60_ARM=none|tangexc|con)
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { sagAdaptiveRaw, makeSagArgmax, type SagMesh } from '../bridge/_sagKernel';
import { writeBinarySTL } from '../bridge/labkit';
import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');

const STYLE = process.env.PF_S60_STYLE ?? 'Voronoi';
const STEM = process.env.PF_S60_STEM ?? 'voronoi_ring_D--';
const TAG = process.env.PF_S60_TAG ?? 'A2CON';
const ARM = (process.env.PF_S60_ARM ?? 'con').toLowerCase();      // none | tangexc | con
const USE_POS = ARM === 'con' && !envB('PF_S60_NOPOS', false);
const USE_DET = ARM === 'con' && !envB('PF_S60_NODET', false);
const USE_DUP = ARM !== 'tangexc';                                 // duplicate-edge clause: part of C4
const LEX = envB('PF_S60_LEX', false);                             // plateau descent on the PAIR SUM
const ROUNDS = Math.round(envF('PF_S60_ROUNDS', 40));
const BAR = envF('PF_S60_BAR_UM', 10);                             // the decision bar, um, BOTH rulers
const JBAR = envF('PF_S60_JBAR_UM', 1);                            // C3 floor, um
const DETMODE = (process.env.PF_S60_DETMODE ?? 'rel').toLowerCase(); // rel = max(JBAR, old) | abs = bare floor
const DIMS: StyleDims = { H: envF('PF_S60_H', 120), Rb: envF('PF_S60_RB', 40), Rt: envF('PF_S60_RT', 50), expn: envF('PF_S60_EXPN', 1) };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s60flip';
const WRITE_STL = envB('PF_S60_WRITE', true);
const DETPROBE = envB('PF_S60_DETPROBE', false);
const POS_STRIDE = Math.max(1, Math.round(envF('PF_S60_POS_STRIDE', 1)));  // 1 = whole-mesh position census

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
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const pq = (a: Float64Array | number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;

mkdirSync(OUTDIR, { recursive: true });
const CKPT = `${OUTDIR}/${TAG}.rounds.ndjson`;
const ck = (o: Record<string, unknown>): void => { appendFileSync(CKPT, `${JSON.stringify({ t: el(), ...o })}\n`); };

log('===== S60 — THE CONSTRAINED FLIP (connectivity only; 0 vertices moved, 0 triangles added) =====');
log(`style ${STYLE}  stem ${STEM}  tag ${TAG}`);
log(`*** ORIENTATION KEY = ${process.env.PF_S60_KEY ?? 'chord'}  ->  ${(process.env.PF_S60_KEY ?? 'chord').toLowerCase() === 'sin' ? '*** THE OLD NON-MONOTONE sin KEY (ablation only) ***' : '2*sin(theta/2)*diam, MONOTONE (the fix)'} ***`);
log(`ARM=${ARM}   C1 tangExc-decrease=${ARM !== 'none'}   C2 pos<=max(${BAR}um,old)=${USE_POS}   C3 det-floor(jitter<=${JBAR}um, mode=${DETMODE})=${USE_DET}   C4 dup-edge=${USE_DUP}   LEX-plateau=${LEX}`);

// ── 0. rA COST PROBE — decide feasibility before burning an hour
{
  const t = Date.now(); let acc = 0;
  for (let i = 0; i < 200000; i += 1) acc += rA((i * 0.0000173) % 6.28 - 3.14, (i * 0.00071) % H);
  const dt = (Date.now() - t) / 1000;
  log(`rA cost probe: 200k evals in ${dt.toFixed(2)} s = ${(0.2 / dt).toFixed(2)} M eval/s   (checksum ${acc.toFixed(3)})`);
}

// ── 1. READ + WELD (exact f32 compare; the STL round-trip is exact)
const path = `research/exchange/_strataConformBisect/${STEM}.stl`;
const { xyz, nTri } = readMeshFloat64(path, false);
log(`${path}: ${nTri} facets   [${el()}]`);
const SCRATCH = 2;                                   // two slots for candidate (not yet applied) facets
const VXa = new Float64Array(nTri * 3); const VYa = new Float64Array(nTri * 3); const VZa = new Float64Array(nTri * 3);
const ta = new Int32Array(nTri + SCRATCH); const tb = new Int32Array(nTri + SCRATCH); const tc = new Int32Array(nTri + SCRATCH);
let NV = 0;
{
  const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
  const map = new Map<number, number[]>();
  const corner = new Int32Array(3);
  for (let t = 0; t < nTri; t += 1) {
    for (let e = 0; e < 3; e += 1) {
      const i = t * 3 + e;
      const x = xyz[i * 3]; const y = xyz[i * 3 + 1]; const z = xyz[i * 3 + 2];
      f64[0] = x; f64[1] = y; f64[2] = z;
      let h = 2166136261;
      for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
      h >>>= 0;
      const b = map.get(h);
      let found = -1;
      if (b !== undefined) { for (const v of b) if (VXa[v] === x && VYa[v] === y && VZa[v] === z) { found = v; break; } }
      if (found < 0) { found = NV; VXa[NV] = x; VYa[NV] = y; VZa[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
      corner[e] = found;
    }
    ta[t] = corner[0]; tb[t] = corner[1]; tc[t] = corner[2];
  }
}
const VX = VXa.subarray(0, NV); const VY = VYa.subarray(0, NV); const VZ = VZa.subarray(0, NV);
const VT = new Float64Array(NV);
for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VY[v], VX[v]);
log(`weld: ${NV} unique vertices from ${nTri * 3} corners   [${el()}]`);
const MESH: SagMesh = { ta, tb, tc, vth: VT, vz: VZa, vx: VXa, vy: VYa };
const ARG = makeSagArgmax();

// ── 2. INSTRUMENT-VALIDITY GATE (same as S58): the mesher puts vertices ON the surface.
{
  const g: number[] = []; const st = Math.max(1, Math.floor(NV / 50000));
  for (let v = 0; v < NV; v += st) g.push(Math.abs(Math.hypot(VX[v], VY[v]) - rA(VT[v], VZ[v])));
  g.sort((a, b) => a - b);
  const p99 = pq(g, 0.99);
  log(`GATE vertex-on-surface: p50 ${pq(g, 0.5).toExponential(2)}  p99 ${p99.toExponential(2)}  max ${g[g.length - 1].toExponential(2)} mm -> ${p99 <= 0.05 ? 'TRUSTED' : '*** UNTRUSTED — rebuilt rA is NOT this mesh surface ***'}`);
}

// ── 3. GEOMETRY + THE THREE RULERS
function sidesOf(a: number, b: number, c: number): [number, number, number] {
  return [
    Math.hypot(VXa[b] - VXa[c], VYa[b] - VYa[c], VZa[b] - VZa[c]),
    Math.hypot(VXa[a] - VXa[c], VYa[a] - VYa[c], VZa[a] - VZa[c]),
    Math.hypot(VXa[a] - VXa[b], VYa[a] - VYa[b], VZa[a] - VZa[b]),
  ];
}
function maxAngOf(a: number, b: number, c: number): number {
  const [la, lb, lc] = sidesOf(a, b, c);
  const g = (p1: number, p2: number, p3: number): number => {
    const v = (p2 * p2 + p3 * p3 - p1 * p1) / (2 * Math.max(1e-30, p2 * p3));
    return (Math.acos(v > 1 ? 1 : v < -1 ? -1 : v) * 180) / Math.PI;
  };
  return Math.max(g(la, lb, lc), g(lb, lc, la), g(lc, la, lb));
}
/** exact f32 spacing at magnitude R (2^(exp-23)); the quantum a slicer's f32 normal is built from. */
function ulpF32(R: number): number {
  const a = Math.abs(R);
  if (!(a > 0)) return 2 ** -149;
  return 2 ** (Math.floor(Math.log2(a)) - 23);
}
/** C3: uncertainty (um) of tangExc induced by f32 vertex quantisation = 1.5*ulp(R)*diam/minAlt. */
const DET_K = envF('PF_S60_DET_K', 1.5);
function jitterUmOf(a: number, b: number, c: number): number {
  const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
  const ux = VXa[b] - ax; const uy = VYa[b] - ay; const uz = VZa[b] - az;
  const wx = VXa[c] - ax; const wy = VYa[c] - ay; const wz = VZa[c] - az;
  const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
  const cr = Math.hypot(cx, cy, cz);                       // = 2 * area
  const [la, lb, lc] = sidesOf(a, b, c);
  const diam = Math.max(la, lb, lc);
  const R = Math.max(
    Math.abs(ax), Math.abs(ay), Math.abs(az), Math.abs(VXa[b]), Math.abs(VYa[b]), Math.abs(VZa[b]),
    Math.abs(VXa[c]), Math.abs(VYa[c]), Math.abs(VZa[c]),
  );
  if (cr <= 0) return Infinity;
  const minAlt = cr / Math.max(1e-300, diam);
  return (DET_K * ulpF32(R) * diam / minAlt) * 1000;
}
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE RANKING KEY — FIXED 2026-08-05 BY LAND (S80-L2). PRE-REGISTERED BEFORE THE RE-RUN.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WAS `Math.sin(Math.acos(dot)) * diam`, transcribed from S56/S58 so the numbers would be comparable.
// `sin` is NON-MONOTONE on [0, pi]: it peaks at 90 deg and returns to ZERO at 180, so a FULLY INVERTED
// facet — the worst case there is — scored ~6.6e-16 mm. That is not a conservative reading, it is the
// wrong sign of wrong: the worst facets scored best. This quantity is THE RANKING KEY and THE ACCEPT TEST
// (C1) of this pass, so the greedy search was being steered AWAY from precisely the facets it exists to
// repair. Found by GUARD (S61 F4b) reading the formula rather than the output; already fixed in
// s55OrientHeatmap.ts:102.
//
// The right quantity is the CHORD between the two unit normals, 2*sin(theta/2)*diam: monotone on [0, pi],
// maximal (2*diam) at full inversion, and equal to sin(theta)*diam to O(theta^2) so small-angle numbers
// stay comparable. S66 re-scored the FINISHED STLs on both keys and found over-bar ratios 1.0002-1.0045 —
// but that is a re-score of a mesh produced BY THE OLD KEY and cannot tell you what a pass STEERED by the
// new key would do. Hence PF_S60_KEY, defaulting to the fix, with the old key kept ONLY as an in-process
// ablation. The live key is printed in the header; read it, do not assume it.
// H-L2: porting the monotone key and re-running every arm does not move any published verdict.
// K-L2: Gothic ratio leaves [3.0, 4.0] / K1,K2,K3,C4 flips PASS<->FAIL / rejPos becomes 0 on Gothic or
//       Voronoi / topology stops being byte-identical  =>  a verdict moved and must be re-stated.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `cover` — THE THIRD KEY, ADDED 2026-08-05 BY STYLEFLIP (S91). DEFAULT OFF; `chord` is unchanged, so a
// run without PF_S60_KEY is byte-identical to every arm published before today.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// *** WHY IT EXISTS: `chord` SAMPLES THE SURFACE NORMAL AT ONE POINT — THE FACET CENTROID — AND THE
// GREEDY PASS GAMES IT. *** S91 measured, on 14 hub-free styles, that the pass moves this key by a
// median 1.904x (up to INFINITY: SuperformulaBlossom's centroid over-bar area reaches exactly 0) while
// the honest COVERING ruler `orientRuler.orientOfFacet` (k=8, inset 0.02) moves by a median **1.015x**,
// 0 of 14 above 1.25x, 3 of 14 WORSE. The honest/centroid disagreement on the SAME facets GROWS under
// the pass — Gothic 5.6x -> 21.4x, SuperellipseMorph 27.9x -> 3,809.9x — which is the signature of an
// optimiser rotating the facet plane to match the normal at the ONE point that is scored, while the
// facet's true sup over its footprint is untouched. (S91_STYLEFLIP_FINDINGS.md §4C.)
//
// `cover` replaces the single centroid sample with the MAX over the 3 VERTICES + the centroid — the
// order-1 barycentric lattice plus its centre, which is where the sup sits whenever the normal field is
// monotone across the footprint. 20 rA evals instead of 5, i.e. 4x the key cost. It is still a LOWER
// bound on the true sup (a 4-point witness), not a certificate, and it is labelled as one.
//
// H-S91-COVER, PRE-REGISTERED BEFORE THE FIRST `cover` ARM RAN:
//   Driving C1 and the ranking with `cover` recovers a real orientation win on the HONEST k=8 ruler.
//   KILL: honest absolute over-bar AREA ratio stays < 1.25x  =>  the defect is NOT reachable by
//         connectivity at all, and the flip should be landed on its POSITION result alone.
//   CONFIRM: >= 1.5x  =>  the lever was real and was being driven by a broken key; fix the key.
//   NON-VACUITY: the `cover` arm must differ from the `chord` arm in flip count; if the two passes make
//         the same flips the key change is inert and nothing below is admissible.
const ORIENT_KEY = (process.env.PF_S60_KEY ?? 'chord').toLowerCase(); // chord = 2*sin(th/2)*diam (FIXED) | sin = the old non-monotone key | cover = 4-point witness (S91)
/** unit surface normal at (th, z) into out[0..2]. 5 rA evals. Same expression as the centroid key. */
function surfNormalAt(thc: number, zcRaw: number, out: Float64Array): void {
  const zc = Math.min(H, Math.max(0, zcRaw));
  const r = rA(thc, zc);
  const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
  const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
  const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
  const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
  const cc = Math.cos(thc); const ss = Math.sin(thc);
  let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
  const L = Math.hypot(nx, ny, nz) || 1;
  out[0] = nx / L; out[1] = ny / L; out[2] = nz / L;
}
const COVER_N = new Float64Array(3);
/** orientation error, um: monotone chord over a 4-POINT WITNESS (3 vertices + centroid). 20 rA evals. */
function tangExcCover(a: number, b: number, c: number): number {
  const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
  const bx = VXa[b]; const by = VYa[b]; const bz = VZa[b];
  const cx = VXa[c]; const cy = VYa[c]; const cz = VZa[c];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = VT[a];
  const dB = dThRaw(thA, VT[b]); const dC = dThRaw(thA, VT[c]);
  const ths = [thA, thA + dB, thA + dC, thA + (dB + dC) / 3];
  const zs = [az, bz, cz, (az + bz + cz) / 3];
  let worst = 0;
  for (let i = 0; i < 4; i += 1) {
    surfNormalAt(ths[i], zs[i], COVER_N);
    let dot = fx * COVER_N[0] + fy * COVER_N[1] + fz * COVER_N[2];
    dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const th = Math.acos(dot);
    if (th > worst) worst = th;
  }
  const [la, lb, lc] = sidesOf(a, b, c);
  return 2 * Math.sin(0.5 * worst) * Math.max(la, lb, lc) * 1000;
}
/** orientation error, um: normal-CHORD 2*sin(theta/2) x diam (monotone). 5 rA evals. */
function tangExcOf(a: number, b: number, c: number): number {
  if (ORIENT_KEY === 'cover') return tangExcCover(a, b, c);
  const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
  const bx = VXa[b]; const by = VYa[b]; const bz = VZa[b];
  const cx = VXa[c]; const cy = VYa[c]; const cz = VZa[c];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = VT[a];
  const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
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
  const [la, lb, lc] = sidesOf(a, b, c);
  const th = Math.acos(dot);
  return (ORIENT_KEY === 'sin' ? Math.sin(th) : 2 * Math.sin(0.5 * th)) * Math.max(la, lb, lc) * 1000;
}
/** the angle itself, deg — so the pass can report whether it MANUFACTURED inversions, not just moved a scalar. */
function normAngDegOf(a: number, b: number, c: number): number {
  const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
  const bx = VXa[b]; const by = VYa[b]; const bz = VZa[b];
  const cx = VXa[c]; const cy = VYa[c]; const cz = VZa[c];
  let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
  fx /= fl; fy /= fl; fz /= fl;
  const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
  if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
  const thA = VT[a];
  const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
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
  return (Math.acos(dot) * 180) / Math.PI;
}
/** position sag, um — THE DRIVER'S OWN RULER, imported from _sagKernel (not re-coded). */
const posOfSlot = (slot: number): number => sagAdaptiveRaw(rA, MESH, slot, 0.03, 12, 64, ARG) * 1000;
/** position of a candidate (not yet applied) facet, via a scratch slot. */
function posOfCand(slot: 0 | 1, a: number, b: number, c: number): number {
  const s = nTri + slot; ta[s] = a; tb[s] = b; tc[s] = c;
  return posOfSlot(s);
}

// ── 4. CENSUS (both rulers, always; position cached so the AFTER pass only re-scores what moved)
const posC = new Float64Array(nTri).fill(-1);
const posOf = (t: number): number => {
  const v = posC[t];
  if (v >= 0) return v;
  const w = posOfSlot(t); posC[t] = w; return w;
};
interface Census {
  tangP50: number; tangP99: number; tangMax: number; tangOver: number;
  posP50: number; posP99: number; posMax: number; posOver: number;
  maP50: number; maP99: number; maMax: number; cap150: number; cap179: number;
  jitP99: number; jitMax: number; jitOver1: number; jitOver10: number;
  tangOverJitBad: number;
  nOver90: number; nOver120: number; angMax: number; tangAreaOver: number; areaAll: number;
}
function census(label: string): Census {
  const tS = Date.now();
  const tang = new Float64Array(nTri); const ma = new Float64Array(nTri); const jit = new Float64Array(nTri);
  let tangOver = 0; let cap150 = 0; let cap179 = 0; let jitOver1 = 0; let jitOver10 = 0; let tangOverJitBad = 0;
  // AREA-WEIGHTING and the INVERSION counters are not decoration: facet COUNT over-states mis-oriented
  // SURFACE by 13-184x across styles (S66 §14), and a count-only column cannot tell a pass that REMOVED
  // inversions from one that MANUFACTURED them (the old sin key scored an inverted facet at ~0).
  let nOver90 = 0; let nOver120 = 0; let angMax = 0; let tangAreaOver = 0; let areaAll = 0;
  for (let t = 0; t < nTri; t += 1) {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    const g = tangExcOf(a, b, c); const m = maxAngOf(a, b, c); const j = jitterUmOf(a, b, c);
    tang[t] = g; ma[t] = m; jit[t] = j;
    const ang = normAngDegOf(a, b, c);
    const ux = VXa[b] - VXa[a]; const uy = VYa[b] - VYa[a]; const uz = VZa[b] - VZa[a];
    const wx = VXa[c] - VXa[a]; const wy = VYa[c] - VYa[a]; const wz = VZa[c] - VZa[a];
    const ar = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
    areaAll += ar;
    if (ang > angMax) angMax = ang;
    if (ang > 90) nOver90 += 1;
    if (ang > 120) nOver120 += 1;
    if (g > BAR) { tangOver += 1; tangAreaOver += ar; if (j > BAR) tangOverJitBad += 1; }
    if (m >= 150) cap150 += 1;
    if (m >= 179.999) cap179 += 1;
    if (j > 1) jitOver1 += 1;
    if (j > 10) jitOver10 += 1;
  }
  const tTang = (Date.now() - tS) / 1000;
  const pS = Date.now();
  const pos: number[] = []; let posOver = 0; let posMax = 0; let nPos = 0;
  for (let t = 0; t < nTri; t += POS_STRIDE) {
    const p = posOf(t); pos.push(p); nPos += 1;
    if (p > BAR) posOver += 1;
    if (p > posMax) posMax = p;
  }
  pos.sort((x, y) => x - y);
  const tPos = (Date.now() - pS) / 1000;
  const tSorted = Float64Array.from(tang).sort();
  const mSorted = Float64Array.from(ma).sort();
  const jSorted = Float64Array.from(jit).sort();
  const out: Census = {
    tangP50: pq(tSorted, 0.5), tangP99: pq(tSorted, 0.99), tangMax: tSorted[nTri - 1], tangOver,
    posP50: pq(pos, 0.5), posP99: pq(pos, 0.99), posMax, posOver,
    maP50: pq(mSorted, 0.5), maP99: pq(mSorted, 0.99), maMax: mSorted[nTri - 1], cap150, cap179,
    jitP99: pq(jSorted, 0.99), jitMax: jSorted[nTri - 1], jitOver1, jitOver10, tangOverJitBad,
    nOver90, nOver120, angMax, tangAreaOver, areaAll,
  };
  log('');
  log(`── ${label} ── (tang ${tTang.toFixed(1)}s, pos ${tPos.toFixed(1)}s over ${nPos} facets, stride ${POS_STRIDE})`);
  log(`   ORIENT tangExc  p50 ${out.tangP50.toFixed(2)}  p99 ${out.tangP99.toFixed(2)}  max ${out.tangMax.toFixed(1)} um   over-${BAR}um ${tangOver} (${((100 * tangOver) / nTri).toFixed(3)}%)`);
  log(`   POSITION  sag   p50 ${out.posP50.toFixed(2)}  p99 ${out.posP99.toFixed(2)}  max ${posMax.toFixed(1)} um   over-${BAR}um ${posOver} (${((100 * posOver) / nPos).toFixed(4)}%)`);
  log(`   SHAPE  maxAngle p50 ${out.maP50.toFixed(1)}  p99 ${out.maP99.toFixed(1)}  max ${out.maMax.toFixed(3)}   caps>=150 ${cap150}   >=179.999 ${cap179}`);
  log(`   DETERM jitterUm p99 ${out.jitP99.toFixed(3)}  max ${out.jitMax.toFixed(2)}   over-1um ${jitOver1} (${((100 * jitOver1) / nTri).toFixed(3)}%)   over-10um ${jitOver10}`);
  log(`   ORIENT by AREA  over-${BAR}um covers ${((100 * tangAreaOver) / Math.max(1e-30, areaAll)).toFixed(3)}% of the SURFACE (count says ${((100 * tangOver) / nTri).toFixed(3)}% — count over-states by ${(((tangOver / nTri) * areaAll) / Math.max(1e-30, tangAreaOver)).toFixed(2)}x)`);
  log(`   INVERSION  normal angle > 90deg ${nOver90}   > 120deg ${nOver120}   max ${angMax.toFixed(2)} deg`);
  log(`   VALIDITY: of the ${tangOver} facets over the tang bar, ${tangOverJitBad} have jitterUm > ${BAR} um (their normal is NOT f32-determined)`);
  ck({ census: label, ...out });
  return out;
}

// ── 5. DETERMINACY PROBE — validate the constant 1.5 rather than assert it
if (DETPROBE) {
  log('');
  log('── C3 DETERMINACY PROBE: perturb every vertex by +-1/2 ulp, compare measured |dtangExc| to predicted jitterUm');
  const N = Math.round(envF('PF_S60_DETPROBE_N', 4000)); const TRIALS = 8;
  const step = Math.max(1, Math.floor(nTri / N));
  const ratios: number[] = [];
  let rng = 123456789;
  const rnd = (): number => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; };
  const sx = new Float64Array(3); const sy = new Float64Array(3); const sz = new Float64Array(3);
  for (let t = 0; t < nTri; t += step) {
    const vv = [ta[t], tb[t], tc[t]];
    const base = tangExcOf(vv[0], vv[1], vv[2]);
    const pred = jitterUmOf(vv[0], vv[1], vv[2]);
    if (!(pred > 0) || !Number.isFinite(pred)) continue;
    for (let k = 0; k < 3; k += 1) { sx[k] = VXa[vv[k]]; sy[k] = VYa[vv[k]]; sz[k] = VZa[vv[k]]; }
    let worst = 0;
    for (let tr = 0; tr < TRIALS; tr += 1) {
      for (let k = 0; k < 3; k += 1) {
        const v = vv[k];
        VXa[v] = sx[k] + (rnd() < 0.5 ? -0.5 : 0.5) * ulpF32(sx[k]);
        VYa[v] = sy[k] + (rnd() < 0.5 ? -0.5 : 0.5) * ulpF32(sy[k]);
        VZa[v] = sz[k] + (rnd() < 0.5 ? -0.5 : 0.5) * ulpF32(sz[k]);
      }
      const d = Math.abs(tangExcOf(vv[0], vv[1], vv[2]) - base);
      if (d > worst) worst = d;
    }
    for (let k = 0; k < 3; k += 1) { VXa[vv[k]] = sx[k]; VYa[vv[k]] = sy[k]; VZa[vv[k]] = sz[k]; }
    ratios.push(worst / pred);
  }
  ratios.sort((a, b) => a - b);
  const rp99 = pq(ratios, 0.99); const rmax = ratios[ratios.length - 1];
  log(`   n=${ratios.length}  measured/predicted  p50 ${pq(ratios, 0.5).toFixed(3)}  p99 ${rp99.toFixed(3)}  max ${rmax.toFixed(3)}`);
  log(`   ${rmax <= 1 ? '*** the predicted jitterUm is an UPPER BOUND on every sampled facet — DET_K=1.5 stands ***' : `*** UNDER-PREDICTED by ${rmax.toFixed(2)}x — raise DET_K to ${(DET_K * rmax).toFixed(2)} ***`}`);
  ck({ detprobe: { n: ratios.length, p50: pq(ratios, 0.5), p99: rp99, max: rmax, DET_K } });
}

// ── 6. TOPOLOGY + ORIENTATION AUDIT (by welded INDEX)
const KEY = NV + 1;
function buildEdges(): Map<number, number[]> {
  const m = new Map<number, number[]>();
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const u = v3[e]; const v = v3[(e + 1) % 3];
      const k = u < v ? u * KEY + v : v * KEY + u;
      const l = m.get(k); if (l === undefined) m.set(k, [t]); else l.push(t);
    }
  }
  return m;
}
function topo(label: string, em: Map<number, number[]>): { edges: number; bnd: number; nm: number; orientBad: number } {
  let bnd = 0; let nm = 0; let orientBad = 0;
  for (const [k, l] of em) {
    if (l.length === 1) { bnd += 1; continue; }
    if (l.length > 2) { nm += 1; continue; }
    const u = Math.floor(k / KEY); const v = k - u * KEY;
    // orientation consistency: the shared edge must be traversed u->v in one facet and v->u in the other
    let dir1 = 0; let dir2 = 0;
    for (const [i, t] of [[0, l[0]], [1, l[1]]] as Array<[number, number]>) {
      const v3 = [ta[t], tb[t], tc[t]];
      let d = 0;
      for (let e = 0; e < 3; e += 1) { if (v3[e] === u && v3[(e + 1) % 3] === v) d = 1; else if (v3[e] === v && v3[(e + 1) % 3] === u) d = -1; }
      if (i === 0) dir1 = d; else dir2 = d;
    }
    if (dir1 !== 0 && dir1 === dir2) orientBad += 1;
  }
  log(`   TOPO ${label}: ${em.size} edges, boundary ${bnd}, non-manifold ${nm}, orientation-inconsistent ${orientBad}`);
  return { edges: em.size, bnd, nm, orientBad };
}

// ── 7. BEFORE
const before = census('BEFORE (flag-OFF control, measured in THIS process)');
const emBefore = buildEdges();
const topoBefore = topo('before', emBefore);
ck({ topoBefore });

// ── 8. FLIP ROUNDS
const EPS = 1e-9;
let totalFlips = 0;
const rej = { dirty: 0, sameOpp: 0, dup: 0, fold: 0, noImprove: 0, det: 0, pos: 0, lex: 0 };
let candFirstRound = 0;
if (ARM !== 'none') {
  log('');
  log(`FLIP ROUNDS — independent set per round; clause order: interior -> c!=d -> dup-edge -> fold -> C1 tangExc -> C3 det -> C2 pos`);
  log(`  (so rejDet counts candidates that pass C1+C4, and rejPos counts candidates that pass EVERYTHING ELSE — the non-vacuity numbers)`);
  const score = new Float64Array(nTri);
  for (let round = 0; round < ROUNDS; round += 1) {
    const rS = Date.now();
    const em = round === 0 ? emBefore : buildEdges();
    for (let t = 0; t < nTri; t += 1) score[t] = tangExcOf(ta[t], tb[t], tc[t]);
    const dirty = new Uint8Array(nTri);
    const created = new Set<number>();
    let flips = 0;
    const r0 = { dirty: 0, sameOpp: 0, dup: 0, fold: 0, noImprove: 0, det: 0, pos: 0, lex: 0 };
    for (const [k, l] of em) {
      if (l.length !== 2) continue;
      const t1 = l[0]; const t2 = l[1];
      if (dirty[t1] === 1 || dirty[t2] === 1) { r0.dirty += 1; continue; }
      const u = Math.floor(k / KEY); const v = k - u * KEY;
      // opposite vertices + the ORIENTED labelling: f1 is the facet traversing u->v.
      const A1 = [ta[t1], tb[t1], tc[t1]]; const A2 = [ta[t2], tb[t2], tc[t2]];
      const c = A1[0] !== u && A1[0] !== v ? A1[0] : A1[1] !== u && A1[1] !== v ? A1[1] : A1[2];
      const d = A2[0] !== u && A2[0] !== v ? A2[0] : A2[1] !== u && A2[1] !== v ? A2[1] : A2[2];
      if (c === d) { r0.sameOpp += 1; continue; }
      const kcd = c < d ? c * KEY + d : d * KEY + c;
      if (USE_DUP && (em.has(kcd) || created.has(kcd))) { r0.dup += 1; continue; }
      // C4 fold: quad strictly convex at the diagonal, in the (theta,z) graph domain
      const t0 = VT[u];
      const pux = 0; const puy = VZ[u];
      const pvx = dThRaw(t0, VT[v]); const pvy = VZ[v];
      const pcx = dThRaw(t0, VT[c]); const pcy = VZ[c];
      const pdx = dThRaw(t0, VT[d]); const pdy = VZ[d];
      const cr = (px: number, py: number, qx: number, qy: number, rx: number, ry: number): number => (qx - px) * (ry - py) - (qy - py) * (rx - px);
      const s1 = cr(pux, puy, pvx, pvy, pcx, pcy); const s2 = cr(pux, puy, pvx, pvy, pdx, pdy);
      const s3 = cr(pcx, pcy, pdx, pdy, pux, puy); const s4 = cr(pcx, pcy, pdx, pdy, pvx, pvy);
      if (!(s1 * s2 < 0 && s3 * s4 < 0)) { r0.fold += 1; continue; }
      // ORIENTED new facets. Quad boundary (with f1 traversing u->v): v->c, c->u, u->d, d->v.
      // New triangles on diagonal c-d: (c,u,d) and (c,d,v).  If f1 traverses v->u instead, c and d swap roles.
      let f1IsUV = false;
      for (let e = 0; e < 3; e += 1) if (A1[e] === u && A1[(e + 1) % 3] === v) f1IsUV = true;
      const cc = f1IsUV ? c : d; const dd = f1IsUV ? d : c;
      const n1: [number, number, number] = [cc, u, dd];
      const n2: [number, number, number] = [cc, dd, v];
      // C1
      const oldMax = Math.max(score[t1], score[t2]);
      const g1 = tangExcOf(n1[0], n1[1], n1[2]); const g2 = tangExcOf(n2[0], n2[1], n2[2]);
      const newMax = Math.max(g1, g2);
      let accept = newMax < oldMax - EPS;
      if (!accept && LEX && newMax <= oldMax + EPS) {
        const oldSum = score[t1] + score[t2];
        if (g1 + g2 < oldSum - EPS) { accept = true; r0.lex += 1; }
      }
      if (!accept) { r0.noImprove += 1; continue; }
      if (round === 0) candFirstRound += 1;
      // C3 — DETMODE='rel' (default) mirrors C2: never worse than max(floor, status quo). 'abs' is the
      // ablation: the bare floor. The relative form matters because 11.0% of the INPUT mesh is already
      // above the 1 um floor, so an absolute clause would mostly be measuring "flips avoid bad regions".
      if (USE_DET) {
        const j1 = jitterUmOf(n1[0], n1[1], n1[2]); const j2 = jitterUmOf(n2[0], n2[1], n2[2]);
        const jAllow = DETMODE === 'abs' ? JBAR
          : Math.max(JBAR, jitterUmOf(A1[0], A1[1], A1[2]), jitterUmOf(A2[0], A2[1], A2[2]));
        if (!(j1 <= jAllow && j2 <= jAllow)) { r0.det += 1; continue; }
      }
      // C2
      if (USE_POS) {
        const p1 = posOfCand(0, n1[0], n1[1], n1[2]);
        const p2 = posOfCand(1, n2[0], n2[1], n2[2]);
        const allow = Math.max(BAR, posOf(t1), posOf(t2));
        if (!(p1 <= allow && p2 <= allow)) { r0.pos += 1; continue; }
        posC[t1] = p1; posC[t2] = p2;
      } else { posC[t1] = -1; posC[t2] = -1; }
      ta[t1] = n1[0]; tb[t1] = n1[1]; tc[t1] = n1[2];
      ta[t2] = n2[0]; tb[t2] = n2[1]; tc[t2] = n2[2];
      score[t1] = g1; score[t2] = g2;
      dirty[t1] = 1; dirty[t2] = 1;
      created.add(kcd);
      flips += 1;
    }
    totalFlips += flips;
    for (const key of Object.keys(rej) as Array<keyof typeof rej>) rej[key] += r0[key];
    log(`  round ${String(round + 1).padStart(2)}: ${String(flips).padStart(7)} flips (cum ${totalFlips})   rej: fold ${r0.fold} dup ${r0.dup} noImp ${r0.noImprove} DET ${r0.det} POS ${r0.pos}${LEX ? ` lexAcc ${r0.lex}` : ''}   [${((Date.now() - rS) / 1000).toFixed(1)}s]`);
    ck({ round: round + 1, flips, cum: totalFlips, rej: { ...r0 } });
    if (flips === 0) break;
  }
}
log('');
log(`TOTAL flips ${totalFlips} = ${((100 * totalFlips) / nTri).toFixed(2)}% of facets;  VERTICES MOVED 0;  TRIANGLES ADDED 0`);
log(`CLAUSE REJECTIONS (cumulative): fold ${rej.fold}  dup-edge ${rej.dup}  no-improve ${rej.noImprove}  C3 DET ${rej.det}  C2 POS ${rej.pos}`);
log(`NON-VACUITY: C2 rejected ${rej.pos} candidates that passed every other clause; C3 rejected ${rej.det}.`);
log(`   ${rej.pos === 0 && USE_POS ? '*** K2 TRIPPED: the POSITION CLAUSE IS VACUOUS on this arm ***' : ''}${rej.det === 0 && USE_DET ? '  *** the DET CLAUSE IS VACUOUS on this arm ***' : ''}`);

// ── 9. AFTER
const after = census('AFTER');
const topoAfter = topo('after', buildEdges());
ck({ topoAfter, totalFlips, rej });

log('');
log('DELTA (both rulers, always)');
log(`   ORIENT over-${BAR}um   ${before.tangOver} -> ${after.tangOver}   (${(before.tangOver / Math.max(1, after.tangOver)).toFixed(2)}x)      p99 ${before.tangP99.toFixed(2)} -> ${after.tangP99.toFixed(2)} um   max ${before.tangMax.toFixed(1)} -> ${after.tangMax.toFixed(1)}`);
log(`   POSITION over-${BAR}um ${before.posOver} -> ${after.posOver}   p99 ${before.posP99.toFixed(2)} -> ${after.posP99.toFixed(2)} um   max ${before.posMax.toFixed(1)} -> ${after.posMax.toFixed(1)}`);
log(`   SHAPE caps>=150      ${before.cap150} -> ${after.cap150}    >=179.999 ${before.cap179} -> ${after.cap179}    maxAngle max ${before.maMax.toFixed(3)} -> ${after.maMax.toFixed(3)}`);
log(`   DETERM jitter>1um    ${before.jitOver1} -> ${after.jitOver1}    >10um ${before.jitOver10} -> ${after.jitOver10}`);
log(`   ORIENT by AREA       ${((100 * before.tangAreaOver) / Math.max(1e-30, before.areaAll)).toFixed(3)}% -> ${((100 * after.tangAreaOver) / Math.max(1e-30, after.areaAll)).toFixed(3)}% of surface   (${((before.tangAreaOver / Math.max(1e-30, before.areaAll)) / Math.max(1e-30, after.tangAreaOver / Math.max(1e-30, after.areaAll))).toFixed(2)}x)`);
log(`   INVERSION >90deg     ${before.nOver90} -> ${after.nOver90}   >120deg ${before.nOver120} -> ${after.nOver120}   ${after.nOver90 > before.nOver90 ? '*** the pass MANUFACTURED inversions — flag it ***' : '(removed, not manufactured)'}`);
log('');
log('PRE-REGISTERED KILL-CRITERIA');
const k1 = after.tangOver <= 0.5 * before.tangOver;
const k2broken = after.posOver > before.posOver;
const k2vac = USE_POS && rej.pos === 0;
const k3 = after.jitOver10 === 0 && after.cap179 === 0;
log(`   K1 tangOver_after <= 0.5*before : ${after.tangOver} <= ${(0.5 * before.tangOver).toFixed(0)} -> ${k1 ? 'PASS (H-S60 survives)' : '*** FAIL — REFUTED as a standalone fix ***'}`);
log(`   K2 posOver_after <= before      : ${after.posOver} <= ${before.posOver} -> ${k2broken ? '*** FAIL — guard BROKEN ***' : 'PASS'}${k2vac ? '   *** but the clause is VACUOUS (rejPos=0) ***' : ''}`);
log(`   K3 no facet over the det floor  : jitter>10um ${after.jitOver10}, maxAngle>=179.999 ${after.cap179} -> ${k3 ? 'PASS' : '*** FAIL — floor broken ***'}`);
log(`   K4 ceiling: run s61FlipCeiling.ts on the written STL`);
const topoOk = topoAfter.bnd === topoBefore.bnd && topoAfter.nm === topoBefore.nm && topoAfter.orientBad === topoBefore.orientBad && topoAfter.edges === topoBefore.edges;
log(`   C4 topology preserved           : ${topoOk ? 'PASS' : '*** FAIL ***'} (edges ${topoBefore.edges}->${topoAfter.edges}, bnd ${topoBefore.bnd}->${topoAfter.bnd}, nonMan ${topoBefore.nm}->${topoAfter.nm}, orientBad ${topoBefore.orientBad}->${topoAfter.orientBad})`);

writeFileSync(`${OUTDIR}/${TAG}.summary.json`, JSON.stringify({
  style: STYLE, stem: STEM, tag: TAG, arm: ARM, orientKey: ORIENT_KEY, nTri, NV, BAR, JBAR, DET_K, DETMODE, LEX,
  USE_POS, USE_DET, USE_DUP, totalFlips, rej, before, after, topoBefore, topoAfter,
  k1, k2broken, k2vac, k3, topoOk, candFirstRound,
}, null, 2));

// ── 10. WRITE (a NEW file; nothing in the pipeline is touched)
if (WRITE_STL && ARM !== 'none') {
  const P = new Float32Array(nTri * 9); const I = new Uint32Array(nTri * 3);
  for (let t = 0; t < nTri; t += 1) {
    const v3 = [ta[t], tb[t], tc[t]];
    for (let e = 0; e < 3; e += 1) {
      const v = v3[e];
      P[9 * t + 3 * e] = VXa[v]; P[9 * t + 3 * e + 1] = VYa[v]; P[9 * t + 3 * e + 2] = VZa[v];
      I[3 * t + e] = 3 * t + e;
    }
  }
  writeBinarySTL(`${OUTDIR}/${STEM}_${TAG}.stl`, P, I);
  log(`   flipped mesh written to ${OUTDIR}/${STEM}_${TAG}.stl`);
}
log('');
log(`done  [${el()}]`);
