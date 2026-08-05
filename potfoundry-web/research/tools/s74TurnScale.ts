// s74TurnScale.ts — IS THE TURNING CLASS GENUINELY C0, OR IS IT SMOOTH CURVATURE UNDER-RESOLVED?
//
// EVERYTHING IN S61's RECOMMENDATION HANGS ON THIS ONE DISTINCTION and it has not been measured. S61 §6
// says the TURNING class (74-100% of the orientation failures) is ALIGNMENT-ONLY because density cannot
// move it. That is TRUE FOR A C0 CREASE and FALSE FOR SMOOTH CURVATURE: a smooth patch's normal deviation
// falls quadratically under refinement (measured: the non-turning control moves x0.035 over a 64x diam
// span), so if the turning class is really smooth-but-under-resolved then a SIZING FIELD closes it and
// "alignment or nothing" is wrong.
//
// THE DISCRIMINATOR IS SCALE, AND IT IS EXACT. At a located turn point s*, measure
//        turn(delta) = angle( n(s* - delta) , n(s* + delta) )
// as delta shrinks. A C0 crease has a JUMP: turn(delta) is CONSTANT, independent of delta, all the way
// down. A smooth patch of curvature kappa has turn(delta) ~ 2*kappa*delta: LINEAR in delta. So
//        rho = turn(1e-2 mm) / turn(1e-4 mm)
// is ~1 for a crease and ~100 for smooth curvature. Two decades of separation; nothing to tune.
//
// The finite-difference step is scaled WITH delta (h = delta/20) so the normals either side are computed
// strictly inside their own half — otherwise at the smallest delta both FD windows would straddle the
// crease and every point would look smooth. That is the trap this probe is built to avoid.
//
// PRE-REGISTERED KILL-CRITERION (written before the run, S61_GUARD_FINDINGS.md §11):
//   classify each located point:  C0 if rho < 2 | SMOOTH if rho > 20 | AMBIGUOUS otherwise.
//   * the TURNING class is ALIGNMENT-ONLY   iff >= 60% of its points are C0
//   * it is DENSITY-CLOSABLE                iff >= 60% are SMOOTH   -> S61 §6 is WRONG and a sizing field
//                                                                      is the lever
//   * otherwise MIXED, and the split must be reported per style so the two halves get different treatment.
// CONTROL, non-negotiable: the same measurement on NON-TURNING facets must come out overwhelmingly
// SMOOTH, or the classifier is measuring something other than what it claims.
//
// Usage:  bash research/tools/run-s74-turn-scale.sh
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals, fdNormalsCentral, locateTurnAdaptive } from '../bridge/orientRuler';
import { appendFileSync, mkdirSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const NCAP = Math.round(envF('PF_S74_NCAP', 30000));
const SCAN = Math.round(envF('PF_S74_SCAN', 300000));
const OUTDIR = 'research/exchange/_strataConformBisect';
const NDJSON = `${OUTDIR}/S74_turn_scale.ndjson`;
const DEG = 180 / Math.PI;
const DELTAS = [1e-2, 1e-3, 1e-4];              // mm of arc along the edge
// A point whose normal barely turns at ANY scale is not a crease and not curvature — it is noise, and
// rho = noise/noise = 1 would be mis-filed as C0. S74's first run classified 97.78% of a FLAT LowPolyFacet
// face as "C0" for exactly that reason. Only points with something to classify are classified.
const TURN_FLOOR = (envF('PF_S74_FLOOR_DEG', 0.05) * Math.PI) / 180;
const JOBS: Array<[string, string]> = (process.env.PF_S74_JOBS
  ?? 'LowPolyFacet=lowpolyfacet_ring_D--,Voronoi=voronoi_ring_D--,GothicArches=gothicarches_ring_DS-HT_S39CTL')
  .split(',').map((s) => { const [a, b] = s.split('='); return [a, b] as [string, string]; });

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
const pq = (a: number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);

mkdirSync(OUTDIR, { recursive: true });
log('===== S74 — IS THE TURNING CLASS C0, OR SMOOTH CURVATURE UNDER-RESOLVED? =====');
log(`rho = turn(${DELTAS[0]} mm) / turn(${DELTAS[2]} mm):  ~1 = C0 JUMP,  ~100 = SMOOTH (linear in delta)`);
log('classify  C0: rho < 2   SMOOTH: rho > 20   AMBIGUOUS: between');

for (const [style, stem] of JOBS) {
  const t0 = Date.now();
  const path = `${OUTDIR}/${stem}.stl`;
  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch { log(`\n${style}: MISSING ${path}`); continue; }
  const { xyz, nTri } = mesh;
  const DIMS: StyleDims = { H: envF('PF_S74_H', 120), Rb: envF('PF_S74_RB', 40), Rt: envF('PF_S74_RT', 50), expn: 1 };
  const H = DIMS.H;
  const rAbase = buildRadiusFn(style as StyleId, { ...registryDefaults(style) }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  const nsK = fdNormals(rA, H);
  // one central-difference sampler per delta, with h scaled to delta so neither side straddles
  const nsD = DELTAS.map((d) => fdNormalsCentral(rA, H, d / 20, d / 20));
  const scratch = new Float64Array(12);
  const nbuf = [new Float64Array(3), new Float64Array(3)];
  log(`\n───────── ${style}  (${stem}, ${nTri} facets) ─────────`);

  const P = new Float64Array(9); const TH = new Float64Array(3); const Z = new Float64Array(3);
  const readFacet = (t: number): void => {
    const o = t * 9;
    for (let v = 0; v < 3; v += 1) { P[3 * v] = xyz[o + 3 * v]; P[3 * v + 1] = xyz[o + 3 * v + 1]; P[3 * v + 2] = xyz[o + 3 * v + 2]; Z[v] = xyz[o + 3 * v + 2]; }
    const thA = Math.atan2(P[1], P[0]);
    TH[0] = thA; TH[1] = thA + dThRaw(thA, Math.atan2(P[4], P[3])); TH[2] = thA + dThRaw(thA, Math.atan2(P[7], P[6]));
  };
  /** turn(delta) across the parameter point (th,z) along the edge direction (dth,dz), normalised to mm */
  const turnAt = (th: number, z: number, dthU: number, dzU: number, di: number): number => {
    const d = DELTAS[di];
    for (let side = 0; side < 2; side += 1) {
      const s = side === 0 ? -d : d;
      nsD[di](th + dthU * s, z + dzU * s, scratch);
      nbuf[side][0] = scratch[0]; nbuf[side][1] = scratch[1]; nbuf[side][2] = scratch[2];
    }
    let dot = nbuf[0][0] * nbuf[1][0] + nbuf[0][1] * nbuf[1][1] + nbuf[0][2] * nbuf[1][2];
    dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    return Math.acos(dot);
  };

  const stride = Math.max(1, Math.floor(nTri / SCAN));
  const rhoT: number[] = []; const rhoN: number[] = []; const t0T: number[] = [];
  let scanned = 0; let turning = 0; let nonTurn = 0;
  for (let t = 0; t < nTri && rhoT.length < NCAP; t += stride) {
    readFacet(t); scanned += 1;
    const o = orientOfFacet(nsK, P[0], P[1], P[2], P[3], P[4], P[5], P[6], P[7], P[8], TH[0], TH[1], TH[2],
      { k: 2, inset: 0.01, orient: 'outward', scratch });
    const isTurn = Number.isFinite(o.spreadRad) && o.spreadRad * DEG > 1;
    if (isTurn) turning += 1; else nonTurn += 1;
    // NON-TURNING facets are the CONTROL and are subsampled 1 in 8 so they cannot dominate the run
    if (!isTurn && (t / stride) % 8 !== 0) continue;
    // pick the edge with the largest located turn
    const rRef = (Math.hypot(P[0], P[1]) + Math.hypot(P[3], P[4]) + Math.hypot(P[6], P[7])) / 3;
    let bestTurn = -1; let bTh = 0; let bZ = 0; let bDth = 0; let bDz = 0; let bLen = 0;
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) {
      const lt = locateTurnAdaptive(rA, H, TH[i], Z[i], TH[j], Z[j], rRef, 14);
      if (lt.turn > bestTurn) {
        bestTurn = lt.turn;
        bTh = TH[i] + (TH[j] - TH[i]) * lt.s; bZ = Z[i] + (Z[j] - Z[i]) * lt.s;
        const dth = TH[j] - TH[i]; const dz = Z[j] - Z[i];
        bLen = Math.hypot(rRef * dth, dz);
        if (bLen > 0) { bDth = dth / bLen; bDz = dz / bLen; }
      }
    }
    if (!(bLen > 4 * DELTAS[0])) continue;         // edge too short for the widest delta to be interior
    const a = turnAt(bTh, bZ, bDth, bDz, 0);
    const c = turnAt(bTh, bZ, bDth, bDz, 2);
    if (!(a > TURN_FLOOR) || !(c > 1e-12)) continue;   // nothing to classify below the floor
    const rho = a / c;
    (isTurn ? rhoT : rhoN).push(rho);
    if (isTurn) t0T.push(a * DEG);
  }
  const cls = (a: number[]): { c0: number; sm: number; am: number } => {
    let c0 = 0; let sm = 0; let am = 0;
    for (const r of a) { if (r < 2) c0 += 1; else if (r > 20) sm += 1; else am += 1; }
    return { c0, sm, am };
  };
  const sT = [...rhoT].sort((x, y) => x - y); const sN = [...rhoN].sort((x, y) => x - y);
  const kT = cls(rhoT); const kN = cls(rhoN);
  const pc = (v: number, n: number): string => `${((100 * v) / Math.max(1, n)).toFixed(2)}%`;
  log(`  scanned ${scanned} (stride ${stride}): TURNING ${turning}  NON-TURNING ${nonTurn}`);
  log(`  TURNING  points ${rhoT.length}:  rho p05 ${pq(sT, 0.05).toFixed(3)}  p50 ${pq(sT, 0.5).toFixed(3)}  p95 ${pq(sT, 0.95).toFixed(2)}`);
  log(`     ==> C0 ${kT.c0} (${pc(kT.c0, rhoT.length)})   AMBIGUOUS ${kT.am} (${pc(kT.am, rhoT.length)})   SMOOTH ${kT.sm} (${pc(kT.sm, rhoT.length)})`);
  log(`     turn at delta=1e-2mm: p50 ${pq([...t0T].sort((x, y) => x - y), 0.5).toFixed(3)} deg  p95 ${pq([...t0T].sort((x, y) => x - y), 0.95).toFixed(3)} deg`);
  log(`  CONTROL non-turning points ${rhoN.length}:  rho p50 ${pq(sN, 0.5).toFixed(3)}`);
  log(`     ==> C0 ${kN.c0} (${pc(kN.c0, rhoN.length)})   AMBIGUOUS ${kN.am} (${pc(kN.am, rhoN.length)})   SMOOTH ${kN.sm} (${pc(kN.sm, rhoN.length)})`);
  const verdict = kT.c0 / Math.max(1, rhoT.length) >= 0.6 ? 'ALIGNMENT-ONLY'
    : kT.sm / Math.max(1, rhoT.length) >= 0.6 ? '*** DENSITY-CLOSABLE — S61 §6 IS WRONG ***' : 'MIXED';
  log(`  *** VERDICT: ${verdict} ***`);
  const dt = (Date.now() - t0) / 1000;
  log(`  ${dt.toFixed(0)} s`);
  appendFileSync(NDJSON, `${JSON.stringify({
    ts: new Date().toISOString(), style, stem, nTri, scanned, turning, nonTurn,
    nT: rhoT.length, rhoTp50: pq(sT, 0.5), c0T: kT.c0, amT: kT.am, smT: kT.sm,
    nN: rhoN.length, rhoNp50: pq(sN, 0.5), c0N: kN.c0, amN: kN.am, smN: kN.sm, verdict, secs: dt,
  })}\n`);
}
log(`\nndjson: ${NDJSON}`);
log('done');
