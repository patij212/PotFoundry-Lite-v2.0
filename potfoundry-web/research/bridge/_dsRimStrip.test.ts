// _dsRimStrip.test.ts — E-2026-07-13-DS-RIMSTRIP (PF_DSRIM=1 fast; PF_DSRIM_COMP=1 composite; PF_DSRIM_RENDER=1).
//
// THE DEFINITIVE DS body 0.01-close attempt. The render (E-2026-07-13-DS-FLANKTOE) pinned the residual to the
// HORIZONTAL row-boundary/RIM near-vertical z-walls (t=const, u-running). BOTH prior feature-edge attempts
// (straight θ-edge DS-THETAEDGE, curved flank-toe DS-FLANKTOE) FAILED identically — witness max 0.847 BYTE-UNMOVED —
// because they run constraints in t, ORTHOGONAL to a t=const wall. Brief's fix: u-RUNNING constraint rings (full-u
// loop at each t=const row-boundary + the rim), the §V11l riser mechanism on the RIGHT axis.
//
// STEP 1 (analytic, done in scan): |dr/dz| spikes >600 (near-vertical walls / stagger-flip steps) at EVERY t=k/8 and
// the LARGEST (634) at t=1 (the RIM). The 7 interior risers (t=1/8..7/8) are the EXCLUDED ring-band; the rim (t=1)
// is NOT in dragonRings() ⇒ BODY, and dominates. Confirmed: ALL 200 worst body facets at zC 119.9–120 (t≈1).
//
// STEP 1b (discriminator this probe adds): the rim step is a floor()-BOUNDARY ARTIFACT — at z=120, rowPhase=8.0,
// Math.floor(8)=8 flips the stagger (row 7 odd → row 8 even) ⇒ the radius JUMPS up to 1.27mm at the measure-zero
// z=H slice while the entire row-7 body just below is continuous. The mesh's rim vertices at t=1 lift to this
// spurious row-8 surface; facets connecting them to the row-7 body chord the 1.27mm cliff → 0.847 residual.
// A one-sided rim lift (row = min(floor(rowPhase), scaleRows-1), i.e. clamp z at H⁻) removes it. NO (u,t) topology
// can fix a MISPLACED VERTEX, so u-strips are predicted NOT to close it — this probe measures both to decide.
//
// ARMS (witness = perFaceTrue3DSag on the body subset, ring-band bandMm1.0 excluded — the fast decisive MAX signal):
//   OFF|rA            baseline, standard rA lift+score           (reproduce witness max 0.847)
//   OFF|rimCont       SAME (u,t) mesh RE-LIFTED + scored with rim-continuous rA (row-7 limit at rim)  [DISCRIMINATOR]
//   ON|ustrip|rA      u-running constraint rings @ t=k/8±δ + t=1⁻, standard rA                          [PRE-REGISTERED]
//   ON|ustrip|rimCont u-strip mesh re-lifted+scored rim-continuous                                      [combined]
// Composite (V11g certified ruler, PF_DSRIM_COMP=1) reported for OFF (known 0.01725) recomputed + OFF|rimCont +
// ON|ustrip — the certified p99 for the kill-criterion.
//
// KILL-CRITERION (pre-reg): u-strip CLOSES iff composite body p99 ≤ 0.01 AND witness max collapses 0.85→≤~0.05 AND
// %<20° ≤ ~3.5 AND nonMan 0 (tris flagged >3M). If max collapses only under rimCont (not u-strip), the residual is
// the rim floor() artifact ⇒ fix is a one-sided rim lift in src, NOT feature-conforming strips.
//
// DEV-ONLY; research/ only; never edits src/. Reuses buildInhouseMetricMesh + perFaceTrue3DSag + _ds_prodtruth_lib
// (V11g ruler) + labkit READ-ONLY. Resumable: checkpointed ndjson per arm.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildInhouseMetricMesh, triangleQualityDistribution, auditNonManByIndex, liftUtToRadial, perFaceTrue3DSag,
  dumpHeatmap,
} from './labkit';
import type { InhouseMeshOpts, AnalyticRadiusFn } from './labkit';
import {
  buildConformRuler, scoreBodyFacets, dragonRings, classifyRingBand, dsRadiusFn, radialBoundAt, DENSE, H as DS_H, TOL,
} from './_ds_prodtruth_lib';

const SIZE_RES = 192, HMIN_3D = 0.05, HMAX_3D = 8, GRADE_BETA = 0.2;
const MAX_POINTS = 2_500_000, TOLMM = 0.01;
const SCALE_ROWS = 8;
const TAU = 2 * Math.PI;

const OUT_DIR = join('research', 'exchange', '_dsRimStrip');
const NDJSON = join(OUT_DIR, 'arms.ndjson');

function plog(m: string): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const l = `[${new Date().toISOString()}] ${m}`;
  appendFileSync(join(OUT_DIR, 'run.log'), l + '\n');
  // eslint-disable-next-line no-console
  console.log(l);
}
function armExists(k: string): boolean {
  if (!existsSync(NDJSON)) return false;
  return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean)
    .some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } });
}

/** Rim-continuous radius: clamp z just below H so the top slice evaluates the row-(scaleRows-1) LIMIT (stagger of the
 * last real row), removing the floor()-at-integer row-8 stagger-flip step at the rim. Continuous from below at z=H. */
function rimContinuous(rA: AnalyticRadiusFn, H: number): AnalyticRadiusFn {
  const zTop = H - 1e-4; // 1e-4 mm below rim → rowPhase 7.99999 (row 7), the real top-row limit
  return (theta: number, z: number): number => rA(theta, z >= zTop ? zTop : z);
}

/** Full-u constraint rings at t-stations (closed loops of consecutive + wrap edges). The u-RUNNING axis: forces mesh
 * edges ALONG the t=const row-boundary/rim walls so facets do not bridge across them (the §V11l riser mechanism). */
function buildURingGraph(stations: number[], nU: number): {
  injectedPoints: number[]; constraintEdges: number[]; rings: number;
} {
  const injectedPoints: number[] = [];
  const constraintEdges: number[] = [];
  let rings = 0;
  for (const t of stations) {
    const base = injectedPoints.length / 2;
    for (let i = 0; i < nU; i++) { injectedPoints.push(i / nU, t); }
    for (let i = 0; i < nU; i++) constraintEdges.push(base + i, base + ((i + 1) % nU));
    rings++;
  }
  return { injectedPoints, constraintEdges, rings };
}

interface WitnessRes { p99: number; max: number; out: number; n: number; }
function witnessBody(ut: number[], idx: Uint32Array, body: number[], rA: AnalyticRadiusFn, H: number): WitnessRes {
  const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
  let mx = 0, out = 0; const devs: number[] = [];
  for (const f of body) { const e = sag.faceErr[f]; devs.push(e); if (e > mx) mx = e; if (e > TOL) out++; }
  const s = Float64Array.from(devs).sort();
  return { p99: s.length ? +s[Math.floor(0.99 * s.length)].toFixed(6) : 0, max: +mx.toFixed(6), out, n: body.length };
}

function radialBody(xyz: Float32Array, idx: Uint32Array, body: number[], rA: AnalyticRadiusFn): WitnessRes {
  let mx = 0, out = 0; const devs: number[] = [];
  for (const f of body) {
    const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2];
    let dv = 0;
    for (const [wa, wb, wc] of DENSE) {
      const px = wa * xyz[3 * a] + wb * xyz[3 * b] + wc * xyz[3 * c];
      const py = wa * xyz[3 * a + 1] + wb * xyz[3 * b + 1] + wc * xyz[3 * c + 1];
      const pz = wa * xyz[3 * a + 2] + wb * xyz[3 * b + 2] + wc * xyz[3 * c + 2];
      const d = radialBoundAt(rA, px, py, pz); if (d > dv) dv = d;
    }
    devs.push(dv); if (dv > mx) mx = dv; if (dv > TOL) out++;
  }
  const s = Float64Array.from(devs).sort();
  return { p99: s.length ? +s[Math.floor(0.99 * s.length)].toFixed(6) : 0, max: +mx.toFixed(6), out, n: body.length };
}

function bodyFacets(xyz: Float32Array, idx: Uint32Array): number[] {
  const ringZs = dragonRings().map((r) => r.z);
  const cls = classifyRingBand(xyz, idx, ringZs, 1.0);
  const body: number[] = [];
  for (let f = 0; f < idx.length / 3; f++) if (cls(f) === 'body') body.push(f);
  return body;
}

const baseOpts: InhouseMeshOpts = {
  tolMm: TOLMM, hMin: HMIN_3D, hMax: HMAX_3D, sizeRes: SIZE_RES, gradeBeta: GRADE_BETA,
  maxPoints: MAX_POINTS, guardManifoldAlways: true,
};
// u-running rings: interior risers t=k/8 ± δ (the §V11l double-band tread) + rim t=1⁻ (the BODY target).
function rimStations(): number[] {
  const dt = 0.3 / DS_H; // 0.3mm above/below in t units
  const st: number[] = [];
  for (let k = 1; k < SCALE_ROWS; k++) { st.push(k / SCALE_ROWS - dt, k / SCALE_ROWS + dt); }
  st.push(1 - dt); // rim tread just below the top boundary
  return st;
}
const uStripOpts = (): InhouseMeshOpts => {
  const g = buildURingGraph(rimStations(), 512);
  return { ...baseOpts, injectedPoints: g.injectedPoints, constraintEdges: g.constraintEdges, pinInjected: true, recoverySubdivideCollinear: true };
};

describe('DS rim-strip — do u-running row-boundary/rim strips close DS body to 0.01, or is it the rim floor() artifact?', () => {
  it.skipIf(process.env.PF_DSRIM !== '1')('FAST — witness max: OFF/rA, OFF/rimCont, ON-ustrip/rA, ON-ustrip/rimCont', () => {
    const rA = dsRadiusFn(); const H = DS_H;
    const rimRA = rimContinuous(rA, H);

    // ---- OFF mesh (identity with DS-TRUE3D/FLANKTOE) ----
    if (!armExists('OFF|rA') || !armExists('OFF|rimCont')) {
      let t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, baseOpts);
      plog(`[OFF] meshed ${mesh.indices.length / 3} tris in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      const idx = mesh.indices, ut = mesh.ut;
      const xyz = liftUtToRadial(ut, rA, H).vertices;
      const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
      const nonMan = auditNonManByIndex(xyz, idx);
      const body = bodyFacets(xyz, idx);

      // diagnostic: worst-10 facet vertices — is a rim vertex (t≈1) lifted to the row-8 surface?
      const sag = perFaceTrue3DSag(ut, idx, rA, H, { preFilterMm: 0.01 });
      const bsorted = [...body].sort((a, b) => sag.faceErr[b] - sag.faceErr[a]).slice(0, 10);
      const diag = bsorted.map((f) => {
        const vs = [idx[3 * f], idx[3 * f + 1], idx[3 * f + 2]].map((v) => ({
          t: +ut[2 * v + 1].toFixed(6), r: +Math.hypot(xyz[3 * v], xyz[3 * v + 1]).toFixed(4),
        }));
        return { f, err: +sag.faceErr[f].toFixed(4), vs };
      });
      plog(`[OFF] worst-10 body facet verts (t,r): ${JSON.stringify(diag)}`);

      const wRA = witnessBody(ut, idx, body, rA, H);
      const rRA = radialBody(xyz, idx, body, rA);
      appendFileSync(NDJSON, JSON.stringify({
        key: 'OFF|rA', arm: 'OFF', ruler: 'rA', tris: idx.length / 3, pctBelow20: +q.pctBelow20.toFixed(2),
        p5minAng: +q.p5MinAngleDeg.toFixed(2), nonMan, body: body.length,
        witP99: wRA.p99, witMax: wRA.max, witOut: wRA.out, radP99: rRA.p99, radMax: rRA.max,
      }) + '\n');
      plog(`[OFF|rA] witness p99=${wRA.p99} max=${wRA.max} out=${wRA.out} | radial p99=${rRA.p99} max=${rRA.max}`);

      // DISCRIMINATOR: re-lift + re-score with rim-continuous rA (row-7 limit at the rim)
      const xyzRim = liftUtToRadial(ut, rimRA, H).vertices;
      const bodyRim = bodyFacets(xyzRim, idx); // ring-band classification unchanged (interior z's identical)
      const wRim = witnessBody(ut, idx, bodyRim, rimRA, H);
      const rRim = radialBody(xyzRim, idx, bodyRim, rimRA);
      appendFileSync(NDJSON, JSON.stringify({
        key: 'OFF|rimCont', arm: 'OFF', ruler: 'rimCont', tris: idx.length / 3, body: bodyRim.length,
        witP99: wRim.p99, witMax: wRim.max, witOut: wRim.out, radP99: rRim.p99, radMax: rRim.max,
      }) + '\n');
      plog(`[OFF|rimCont] witness p99=${wRim.p99} max=${wRim.max} out=${wRim.out} | radial p99=${rRim.p99} max=${rRim.max}`);
    } else plog('[skip] OFF arms recorded');

    // ---- ON u-strip mesh ----
    if (!armExists('ON|ustrip|rA') || !armExists('ON|ustrip|rimCont')) {
      const opts = uStripOpts();
      let t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, opts);
      plog(`[ON] meshed ${mesh.indices.length / 3} tris in ${((Date.now() - t0) / 1000).toFixed(1)}s ${mesh.constraint ? `constraint{req=${mesh.constraint.requested} present=${mesh.constraint.alreadyPresent} recovered=${mesh.constraint.recovered} failed=${mesh.constraint.failed}}` : ''}`);
      const idx = mesh.indices, ut = mesh.ut;
      const xyz = liftUtToRadial(ut, rA, H).vertices;
      const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
      const nonMan = auditNonManByIndex(xyz, idx);
      const body = bodyFacets(xyz, idx);
      const wRA = witnessBody(ut, idx, body, rA, H);
      appendFileSync(NDJSON, JSON.stringify({
        key: 'ON|ustrip|rA', arm: 'ON-ustrip', ruler: 'rA', tris: idx.length / 3, pctBelow20: +q.pctBelow20.toFixed(2),
        p5minAng: +q.p5MinAngleDeg.toFixed(2), nonMan, body: body.length,
        constraint: mesh.constraint ?? null, witP99: wRA.p99, witMax: wRA.max, witOut: wRA.out,
      }) + '\n');
      plog(`[ON|ustrip|rA] witness p99=${wRA.p99} max=${wRA.max} out=${wRA.out} nonMan=${nonMan} %<20=${q.pctBelow20.toFixed(2)}`);

      const xyzRim = liftUtToRadial(ut, rimRA, H).vertices;
      const bodyRim = bodyFacets(xyzRim, idx);
      const wRim = witnessBody(ut, idx, bodyRim, rimRA, H);
      appendFileSync(NDJSON, JSON.stringify({
        key: 'ON|ustrip|rimCont', arm: 'ON-ustrip', ruler: 'rimCont', tris: idx.length / 3, body: bodyRim.length,
        witP99: wRim.p99, witMax: wRim.max, witOut: wRim.out,
      }) + '\n');
      plog(`[ON|ustrip|rimCont] witness p99=${wRim.p99} max=${wRim.max} out=${wRim.out}`);
    } else plog('[skip] ON arms recorded');
    plog('[FAST] DONE');
  }, 6_000_000);

  // COMPOSITE (V11g certified ruler) — the certified p99 for the kill-criterion. Expensive (~18min/arm).
  it.skipIf(process.env.PF_DSRIM_COMP !== '1')('COMPOSITE — certified body p99: OFF/rA, OFF/rimCont, ON-ustrip/rA', () => {
    const rA = dsRadiusFn(); const H = DS_H;
    const rimRA = rimContinuous(rA, H);
    const arms: Array<{ key: string; ruler: AnalyticRadiusFn; opts: InhouseMeshOpts }> = [
      { key: 'COMP|OFF|rA', ruler: rA, opts: baseOpts },
      { key: 'COMP|OFF|rimCont', ruler: rimRA, opts: baseOpts },
      { key: 'COMP|ON|ustrip|rA', ruler: rA, opts: uStripOpts() },
    ];
    for (const { key, ruler, opts } of arms) {
      if (armExists(key)) { plog(`[skip] ${key}`); continue; }
      let t0 = Date.now();
      const mesh = buildInhouseMetricMesh(rA, H, opts); // MESH always built with real rA lift-topology; ruler is the truth
      const idx = mesh.indices, ut = mesh.ut;
      const xyz = liftUtToRadial(ut, ruler, H).vertices; // score against the ruler's surface (rim-cont re-lift for rimCont)
      const body = bodyFacets(xyz, idx);
      const loc = buildConformRuler(ruler);
      const t3 = scoreBodyFacets(xyz, idx, body, loc, ruler, TOL,
        (d, tot) => { if (d % Math.max(1, Math.floor(tot / 4)) === 0) plog(`  [${key}] ${d}/${tot}`); });
      appendFileSync(NDJSON, JSON.stringify({
        key, tris: idx.length / 3, body: body.length,
        t3P50: t3.p50, t3P90: t3.p90, t3P99: t3.p99, t3Max: t3.maxMm, t3Out: t3.outliers,
      }) + '\n');
      plog(`[${key}] composite p50=${t3.p50} p99=${t3.p99} max=${t3.maxMm} out=${t3.outliers}/${body.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
    plog('[COMPOSITE] DONE');
  }, 12_000_000);

  it.skipIf(process.env.PF_DSRIM_RENDER !== '1')('RENDER — OFF/rA vs OFF/rimCont vs ON-ustrip true-3D heatmap bins', () => {
    const rA = dsRadiusFn(); const H = DS_H;
    const rimRA = rimContinuous(rA, H);
    const meshOFF = buildInhouseMetricMesh(rA, H, baseOpts);
    const meshON = buildInhouseMetricMesh(rA, H, uStripOpts());
    const arms: Array<[string, typeof meshOFF, AnalyticRadiusFn]> = [
      ['dsOFF_rA', meshOFF, rA],
      ['dsOFF_rimCont', meshOFF, rimRA],
      ['dsON_ustrip_rA', meshON, rA],
    ];
    for (const [name, mesh, ruler] of arms) {
      const xyz = liftUtToRadial(mesh.ut, ruler, H).vertices;
      const sag = dumpHeatmap(OUT_DIR, name, xyz, mesh.ut, mesh.indices, ruler, H, { scaleMm: 0.15, preFilterMm: 0.01, stl: false, meta: { arm: name } });
      plog(`[RENDER ${name}] tris=${mesh.indices.length / 3} worst=${sag.worstMm.toFixed(4)} p99>0.03=${(100 * sag.fracOver(0.03)).toFixed(2)}%`);
    }
  }, 6_000_000);
});
