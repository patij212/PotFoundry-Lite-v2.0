// s102SplitH1H2.ts — THE COORDINATOR'S DISCRIMINATOR: DOES REFINEMENT PUSH H1 UP WHILE H2 FALLS?
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED AS H-S82-5 IN S82_SPLIT_FINDINGS.md §1, BEFORE THIS FILE EXISTED. RESTATED VERBATIM:
//
//   "If refinement converts position error into orientation error by rotating children, then across
//    refinement rounds H1 should RISE while H2 FALLS." (H1 = facet -> surface, `certifyTriangle`;
//    H2 = surface -> mesh. They are OPPOSITE Hausdorff directions; a rotated child stands off the
//    surface — large H1 — while its siblings still cover the surface — small H2.)
//
//   CONFIRMED if H1 proven-fail AREA fraction rises >= 1.3x while H2 p99 falls >= 1.3x.
//   REFUTED if they move the same way, or if neither moves >= 1.3x.
//
// ── WHAT S101 ALREADY DID TO THIS HYPOTHESIS, AND WHY THE RUN IS STILL WORTH IT.
// S101 refuted the ROTATION mechanism the prediction was built on (the split's children are not more
// mis-oriented; theta_par - max theta_child <= max rho, and the over-bar AREA fraction never rises). So
// on the stated mechanism I expect H1 NOT to rise, and I am saying so before the run.
// BUT S101 found a DIFFERENT defect that makes the same prediction for a different reason: the split's
// in-plane slide FOLDS 25.03% of Voronoi's children and adds 24.5% surface area. A tent/fold is precisely
// "mesh where the surface is not" — large H1, unchanged H2. So this run discriminates between:
//     H1 rises  =>  the FOLD is real in the product's own ruler (S101 §2.3 confirmed end-to-end)
//     H1 flat   =>  the fold is a topological defect that the position bar cannot see, and BOTH the
//                   rotation story and my fold story are inert for the 10 um product verdict.
// Either way the number is worth having, and the second outcome is the one that would cost me a finding.
//
// ── INSTRUMENTS, AND THE ONE THING THAT MAKES THE COMPARISON FAIR
// H1: `certifyTriangle(tol=0.010)` — two-sided by construction (witnessed = a real point at a real
//     distance = PROOF of failure; certified = bound <= tol over the WHOLE triangle = PROOF of pass;
//     everything else is UNKNOWN and is PRINTED, never folded into either).
//     Sampled by UNIFORM STRIDE and reported by AREA as well as by count, because the three meshes have
//     different facet counts and a count fraction is not comparable across them. The area-weighted
//     fraction estimates the fraction of the PRINTED SURFACE that is proven over the bar, which is.
// H2: the SAME FIXED (theta,z) surface lattice for all three meshes -> nearest distance to that mesh via
//     `buildArtifactLocator`. Paired, so a difference is a difference in the mesh and not in the sample.
//
// READ-ONLY over finished STLs. Usage: bash research/tools/run-s102-split-h1h2.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { certifyTriangle, detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { buildArtifactLocator } from '../bridge/_ds_prodtruth_lib';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STYLE = process.env.PF_S102_STYLE ?? 'Voronoi';
const TOL = envF('PF_S102_TOL_MM', 0.010);
const NH1 = Math.round(envF('PF_S102_NH1', 1200));
const NMAX = Math.round(envF('PF_S102_NMAX', 512));
const NU = Math.round(envF('PF_S102_NU', 900));       // H2 lattice, theta
const NV = Math.round(envF('PF_S102_NV', 300));       // H2 lattice, z
const BAND = envF('PF_S102_BAND_MM', 0.5);            // keep off the rim rows
const DOH2 = envF('PF_S102_H2', 1) === 1;
const DIMS: StyleDims = { H: envF('PF_S102_H', 120), Rb: envF('PF_S102_RB', 40), Rt: envF('PF_S102_RT', 50), expn: envF('PF_S102_EXPN', 1) };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect';
const NDJSON = `${OUTDIR}/S82_split_h1h2.ndjson`;
// BEFORE, +1 round, +4 rounds — the exact meshes S65 produced.
const JOBS: Array<[string, string]> = (process.env.PF_S102_JOBS
  ?? 'R0_BEFORE=s60flip/voronoi_ring_D--_A2CON,R1=s60flip/V_SPLIT1R_split,R4=s60flip/V_SPLIT1_split')
  .split(',').map((s) => { const [a, b] = s.split('='); return [a, b] as [string, string]; });

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, { params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }> }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) { if (g === undefined) continue; for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default; }
  return out;
}
const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const S = (a: number[]): number[] => { const c = a.slice(); c.sort((x, y) => x - y); return c; };
const pq = (a: number[], f: number): number => (a.length === 0 ? NaN : a[Math.min(a.length - 1, Math.floor(f * a.length))]);
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
mkdirSync(OUTDIR, { recursive: true });

log('===== S102 — H1 (facet->surface) vs H2 (surface->mesh) ACROSS REFINEMENT ROUNDS =====');
log(`style ${STYLE}   tol ${TOL} mm   H1 sample ${NH1}/mesh nMax ${NMAX}   H2 lattice ${NU}x${NV}`);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}  detectThetaJumps ${thJ.length}   [${el()}]`);

// ── THE FIXED H2 QUERY SET, built ONCE so every mesh is scored on the same points.
const QX = new Float64Array(NU * NV); const QY = new Float64Array(NU * NV); const QZ = new Float64Array(NU * NV);
{
  let q = 0;
  for (let j = 0; j < NV; j += 1) {
    const z = BAND + ((H - 2 * BAND) * j) / (NV - 1);
    for (let i = 0; i < NU; i += 1) {
      const th = (2 * Math.PI * i) / NU;
      const r = rA(th, z);
      QX[q] = r * Math.cos(th); QY[q] = r * Math.sin(th); QZ[q] = z; q += 1;
    }
  }
  log(`H2 query set: ${q} surface points, z in [${BAND}, ${H - BAND}]   [${el()}]`);
}

for (const [label, stem] of JOBS) {
  const path = `${OUTDIR}/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`\n${label}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  log('');
  log(`═════════ ${label}  (${stem}, ${nTri} facets)  [${el()}] ═════════`);

  // ── H1: uniform stride, certifyTriangle at the product bar, by COUNT and by AREA
  const step = Math.max(1, Math.floor(nTri / NH1));
  const n = Math.floor(nTri / step);
  let aTot = 0; let aFail = 0; let aPass = 0; let aUnk = 0;
  let nFail = 0; let nPass = 0; let nUnk = 0;
  const wit: number[] = []; const bnd: number[] = [];
  const t1 = Date.now();
  for (let k = 0; k < n; k += 1) {
    const o = (k * step) * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
    const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    const v = certifyTriangle(rA, ax, ay, az, bx, by, bz, cx, cy, cz, { H, tol: TOL, nMax: NMAX, zJumps: zJ, thJumps: thJ });
    wit.push(v.witnessed * 1000); bnd.push(v.bound * 1000);
    aTot += area;
    if (v.witnessed > TOL) { nFail += 1; aFail += area; } else if (v.certified) { nPass += 1; aPass += area; } else { nUnk += 1; aUnk += area; }
  }
  const sw = S(wit); const sb = S(bnd);
  log(`  H1  n=${n} (stride ${step}, ${((Date.now() - t1) / 1000).toFixed(1)}s)   sampled area ${aTot.toFixed(2)} mm2`);
  log(`      *** PROVEN-FAIL ${nFail} (${((100 * nFail) / n).toFixed(3)}% count, ${((100 * aFail) / aTot).toFixed(3)}% AREA)   PROVEN-PASS ${nPass} (${((100 * nPass) / n).toFixed(3)}%, ${((100 * aPass) / aTot).toFixed(3)}% AREA)   UNKNOWN ${nUnk} (${((100 * nUnk) / n).toFixed(3)}%, ${((100 * aUnk) / aTot).toFixed(3)}% AREA) ***`);
  log(`      witnessed p50 ${pq(sw, 0.5).toFixed(3)} p99 ${pq(sw, 0.99).toFixed(2)} max ${sw[sw.length - 1].toFixed(2)} um   bound p50 ${pq(sb, 0.5).toFixed(3)} max ${sb[sb.length - 1].toFixed(2)} um`);

  // ── H2: the fixed surface lattice -> this mesh
  let h2p50 = NaN; let h2p99 = NaN; let h2max = NaN; let h2over = 0; let h2secs = 0;
  if (DOH2) {
    const t2 = Date.now();
    const f32 = new Float32Array(nTri * 9);
    for (let i = 0; i < nTri * 9; i += 1) f32[i] = xyz[i];
    const idx = new Uint32Array(nTri * 3);
    for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
    const loc = buildArtifactLocator(f32, idx);
    const d: number[] = [];
    for (let q = 0; q < QX.length; q += 1) {
      const dd = loc.dist(QX[q], QY[q], QZ[q]) * 1000;
      d.push(dd); if (dd > TOL * 1000) h2over += 1;
    }
    const sd = S(d);
    h2p50 = pq(sd, 0.5); h2p99 = pq(sd, 0.99); h2max = sd[sd.length - 1]; h2secs = (Date.now() - t2) / 1000;
    log(`  H2  ${QX.length} fixed surface points -> mesh (${h2secs.toFixed(1)}s)   p50 ${h2p50.toFixed(3)}  p99 ${h2p99.toFixed(3)}  max ${h2max.toFixed(2)} um   over-${(TOL * 1000).toFixed(0)}um ${h2over} (${((100 * h2over) / QX.length).toFixed(4)}%)`);
  }
  appendFileSync(NDJSON, `${JSON.stringify({
    style: STYLE, label, stem, nTri, tol: TOL, n, nFail, nPass, nUnk,
    failCountPct: (100 * nFail) / n, failAreaPct: (100 * aFail) / aTot,
    passAreaPct: (100 * aPass) / aTot, unkAreaPct: (100 * aUnk) / aTot,
    witP50: pq(sw, 0.5), witP99: pq(sw, 0.99), witMax: sw[sw.length - 1],
    h2p50, h2p99, h2max, h2over, h2n: QX.length, h2secs, secs: (Date.now() - T0) / 1000,
  })}\n`);
  log(`  [checkpoint -> ${NDJSON}]`);
}
log('');
log(`done  [${el()}]`);
