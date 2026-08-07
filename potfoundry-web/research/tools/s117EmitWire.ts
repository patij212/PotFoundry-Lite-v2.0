// s117EmitWire.ts — S117 P1 part 2: MEASURE THE WIRED EMIT-TIME INVARIANT.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TWO MODES, AND WHY BOTH ARE NEEDED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MODE `live`  Arms `globalThis.__pfEmitInvariant`, then drives THE SHIPPING GENERATOR head-less by
//              dynamically importing `s117ShipMesh.ts` (a fully synchronous top-level script — the
//              dynamic import is what lets the flag be set BEFORE its module body runs). Afterwards it
//              reads the module-level accumulator the wiring publishes into, and prints what the
//              instrument caught. This answers "what does the flag ON find in production?".
//
// MODE `stl`   The TWO-SIDED CONTROL. A zero-violation result from mode `live` is worthless on its own —
//              it is equally consistent with "the generator is clean" and with "the instrument is
//              broken/vacuous". So mode `stl` replays the SAME predicate, at the SAME settings, over a
//              finished STL by recovering each facet's (u,t): u = unwrapped(atan2(y,x))/2pi, t = z/H.
//              Point it at a mesh KNOWN to contain the defect (the pre-guard research-driver output) and
//              it must FIRE; point it at the shipping output and it must not.
//
//              *** SCOPE SCAR: run mode `stl` on an OUTER-WALL-ONLY STL. *** A closed solid contains the
//              INNER wall, whose triangles are deliberately wound the OTHER way in (u,t) so that the
//              solid's 3D normals all point outward. Feeding a whole solid to a wall-scoped winding
//              predicate reports ~half the mesh as `fold`, which would be a pure instrument artefact.
//              This tool refuses to report a whole-solid scan as a verdict (control CS below).
//
// Usage: bash research/tools/run-s117-emitwire.sh
//   env PF_S117W_MODE=live|stl
//       live: PF_S117_* are forwarded verbatim to s117ShipMesh (STYLE/TAG/SMOKE/OUTDIR/...)
//       stl : PF_S117W_STL=<abs path>  PF_S117W_H=<pot height mm, for t=z/H>  PF_S117W_LABEL=<tag>
//   PF_S117W_OUT=<dir>   (default research/exchange/_strataConformBisect/s117/p1wire)

import {
  getLastEmitCertificate, resetLastEmitCertificate,
  checkEmitInvariantUV, makeEmitUvVerdict, DEFENSIBLE_EMIT_UV,
  triangulateQuadtree, MetricSizingField, PeriodicBalancedQuadtree,
} from '../../src/renderers/webgpu/parametric/conforming';
import { SyntheticCylinderSampler } from '../../src/renderers/webgpu/parametric/conforming/SurfaceSampler';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { dThRaw } from '../bridge/_sweepPredicate';
import { writeFileSync, mkdirSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const MODE = envS('PF_S117W_MODE', 'live');
const OUT = envS('PF_S117W_OUT', 'research/exchange/_strataConformBisect/s117/p1wire');
mkdirSync(OUT, { recursive: true });

const TWO_PI = Math.PI * 2;
const f6 = (x: number): string => (Number.isFinite(x) ? x.toFixed(6) : String(x));

log('══════════════════════════════════════════════════════════════════════════════════════════');
log('  S117 P1 (part 2) — THE WIRED EMIT-TIME INVARIANT, MEASURED');
log('══════════════════════════════════════════════════════════════════════════════════════════');
log(`mode         ${MODE}`);
log(`predicate    tauQ=${DEFENSIBLE_EMIT_UV.tauQ}  sigma=${DEFENSIBLE_EMIT_UV.sigma}  minAltBar=${DEFENSIBLE_EMIT_UV.minAltBar} (OFF: no mm scale at the emit site)`);
log('');

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
async function runLive(): Promise<void> {
  const g = globalThis as unknown as { __pfEmitInvariant?: boolean; __pfEmitInvariantGate?: boolean };
  const GATE = envS('PF_S117W_GATE', '0') === '1';
  g.__pfEmitInvariant = true;
  g.__pfEmitInvariantGate = GATE;
  resetLastEmitCertificate();
  log(`── FLAGS ARMED: __pfEmitInvariant=true  __pfEmitInvariantGate=${GATE}`);
  log('── driving the shipping generator (s117ShipMesh) ─────────────────────────────────────────');
  log('');
  const t0 = Date.now();
  // Dynamic import: evaluated AFTER the flags above are set. s117ShipMesh's body is fully synchronous,
  // so by the time this resolves the whole build has run and the accumulator is complete.
  await import('./s117ShipMesh');
  const wallMs = Date.now() - t0;
  log('');
  log('── THE CERTIFICATE ──────────────────────────────────────────────────────────────────────');
  const cert = getLastEmitCertificate();
  if (cert === undefined) {
    log('*** CONTROL CL FIRED: the accumulator is EMPTY. The flag did not reach the triangulators —');
    log('*** either the wiring is dead or the export never called them. RUN IS VOID. ***');
    process.exitCode = 1;
    return;
  }
  const shareUv = cert.uvAreaTotal > 0 ? cert.uvAreaBad / cert.uvAreaTotal : 0;
  log(`  triangulation calls instrumented .... ${cert.builds}`);
  log(`  triangles CHECKED ................... ${cert.checked}`);
  log(`  VIOLATIONS (count) .................. ${cert.violations}`);
  log(`  VIOLATIONS ((u,t) area share) ....... ${(shareUv * 100).toFixed(6)} %   [${f6(cert.uvAreaBad)} of ${f6(cert.uvAreaTotal)} (u,t) units^2]`);
  log(`     by term:  degenerate ${cert.byReason.degenerate}   fold ${cert.byReason.fold}   blade ${cert.byReason.blade}`);
  log(`     by TRI_SOURCE: ${cert.bySource.map((n, i) => (n ? `${i}:${n}` : '')).filter(Boolean).join('  ') || '(none)'}`);
  log(`  WORST WITNESSES over every checked triangle (the MAX half of the triple):`);
  log(`     min |qUv| signed ................. ${cert.worstQUv}      (tauQ bar ${DEFENSIBLE_EMIT_UV.tauQ}; negative ⇒ a fold)`);
  log(`     min (u,t) altitude ............... ${cert.worstMinAlt}`);
  if (cert.firstViolation) log(`  first violation: ${JSON.stringify(cert.firstViolation)}`);
  log('');
  log(`  wall-clock for the whole instrumented build: ${wallMs} ms`);
  log('');
  // ── CONTROLS ──────────────────────────────────────────────────────────────────────────────────────
  // CL1: the instrument must have run on a non-trivial number of triangles, or "zero violations" is
  //      vacuous. CL2: `builds` > 1 is EXPECTED — the budget search builds candidate meshes and every
  //      one of them is certified, so `checked` is NOT the final triangle count and must not be quoted
  //      as one.
  log(`  CL1 not-vacuous (checked > 1e5) ..... ${cert.checked > 100_000 ? 'PASS' : '*** FAIL — RUN IS VOID ***'}`);
  log(`  CL2 note: 'checked' spans ALL ${cert.builds} triangulation calls this export made (budget-search`);
  log(`      candidates included). It is NOT the shipped triangle count and is never quoted as one.`);
  const label = envS('PF_S117_TAG', 'LIVE');
  writeFileSync(`${OUT}/S117_EMITWIRE_${label}.json`, JSON.stringify({
    mode: 'live', label, wallMs, gate: GATE, certificate: cert, uvAreaShare: shareUv,
  }, null, 2));
  log(`  -> ${OUT}/S117_EMITWIRE_${label}.json`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function runStl(): void {
  const STL = envS('PF_S117W_STL', '');
  const H = envF('PF_S117W_H', 120);
  const LABEL = envS('PF_S117W_LABEL', 'STL');
  if (STL === '') { log('*** PF_S117W_STL is required in mode stl. ***'); process.exitCode = 1; return; }
  log(`stl          ${STL}`);
  log(`H            ${H}   (t = z/H)`);
  const { xyz, nTri } = readMeshFloat64(STL, false);
  log(`facets       ${nTri}`);
  log('');

  const v = makeEmitUvVerdict();
  let violations = 0;
  const byReason = { degenerate: 0, fold: 0, blade: 0 };
  let area3Total = 0;
  let area3Bad = 0;
  let uvTotal = 0;
  let uvBad = 0;
  let worstQ = Number.POSITIVE_INFINITY;
  let worstAlt = Number.POSITIVE_INFINITY;
  let maxBadArea3 = 0;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;

  for (let f = 0; f < nTri; f += 1) {
    const o = f * 9;
    const ax = xyz[o], ay = xyz[o + 1], az = xyz[o + 2];
    const bx = xyz[o + 3], by = xyz[o + 4], bz = xyz[o + 5];
    const cx = xyz[o + 6], cy = xyz[o + 7], cz = xyz[o + 8];
    if (az < zMin) zMin = az; if (az > zMax) zMax = az;
    // 3D area — the honest denominator for an AREA SHARE (the (u,t) one is reported separately).
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const a3 = 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
    area3Total += a3;
    // UNWRAPPED theta on a common branch — orientOfFacet's / checkEmitInvariantUV's precondition.
    const tha = Math.atan2(ay, ax);
    const thb = tha + dThRaw(tha, Math.atan2(by, bx));
    const thc = tha + dThRaw(tha, Math.atan2(cy, cx));
    checkEmitInvariantUV(
      tha / TWO_PI, az / H, thb / TWO_PI, bz / H, thc / TWO_PI, cz / H,
      DEFENSIBLE_EMIT_UV, v,
    );
    uvTotal += Math.abs(v.apUv);
    if (v.qUv < worstQ) worstQ = v.qUv;
    if (v.minAlt < worstAlt) worstAlt = v.minAlt;
    if (v.ok) continue;
    violations += 1;
    area3Bad += a3;
    uvBad += Math.abs(v.apUv);
    if (a3 > maxBadArea3) maxBadArea3 = a3;
    if (v.reason === 'degenerate') byReason.degenerate += 1;
    else if (v.reason === 'fold') byReason.fold += 1;
    else if (v.reason === 'blade') byReason.blade += 1;
  }

  const share3 = area3Total > 0 ? area3Bad / area3Total : 0;
  const shareUv = uvTotal > 0 ? uvBad / uvTotal : 0;
  log('── RESULT (COUNT + AREA-SHARE + MAX, per facet) ─────────────────────────────────────────');
  log(`  VIOLATIONS (count) .................. ${violations} of ${nTri}   (${((violations / nTri) * 100).toFixed(6)} % by count)`);
  log(`  VIOLATIONS (3D area share) .......... ${(share3 * 100).toFixed(6)} %   [${f6(area3Bad)} of ${f6(area3Total)} mm2]`);
  log(`  VIOLATIONS ((u,t) area share) ....... ${(shareUv * 100).toFixed(6)} %`);
  log(`  MAX single violating facet 3D area .. ${f6(maxBadArea3)} mm2`);
  log(`     by term:  degenerate ${byReason.degenerate}   fold ${byReason.fold}   blade ${byReason.blade}`);
  log(`  WORST WITNESSES over the whole mesh:`);
  log(`     min signed qUv ................... ${worstQ}`);
  log(`     min (u,t) altitude ............... ${worstAlt}`);
  log('');
  // ── CONTROLS ──────────────────────────────────────────────────────────────────────────────────────
  // CS: an outer-wall-only STL spans essentially the full height. A CLOSED SOLID also does, so height
  // alone cannot detect the mistake; instead: a solid contains the reverse-wound inner wall, which makes
  // the fold count blow up toward ~50%. Refuse to report >20% fold-by-count as a verdict.
  const foldShare = byReason.fold / Math.max(nTri, 1);
  log(`  z span ${f6(zMin)} .. ${f6(zMax)} mm`);
  if (foldShare > 0.2) {
    log(`*** CONTROL CS FIRED: ${(foldShare * 100).toFixed(2)}% of facets read as 'fold'. That is the signature of`);
    log('*** feeding a CLOSED SOLID (which contains the reverse-wound INNER wall) to a WALL-scoped');
    log('*** winding predicate. Re-run on the OUTER-WALL-ONLY STL. THIS SCAN IS VOID AS A VERDICT. ***');
    process.exitCode = 1;
  } else {
    log('  CS whole-solid-misuse control ....... PASS (fold share under the 20% artefact bar)');
  }
  writeFileSync(`${OUT}/S117_EMITWIRE_STL_${LABEL}.json`, JSON.stringify({
    mode: 'stl', label: LABEL, stl: STL, H, nTri, violations, byReason,
    area3Total, area3Bad, share3, uvTotal, uvBad, shareUv, maxBadArea3, worstQ, worstAlt,
    controlCS: foldShare <= 0.2 ? 'PASS' : 'FIRED',
  }, null, 2));
  log(`  -> ${OUT}/S117_EMITWIRE_STL_${LABEL}.json`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// MODE `cost` — the IN-PROCESS, INTERLEAVED, COST-MATCHED A/B.
//
// The head-less ship harness cannot price this instrument: two byte-identical flag-OFF runs of it
// differ by ~10% wall-clock, which is larger than any plausible per-triangle cost. So price it where
// the noise can be controlled: ONE process, ONE prebuilt quadtree (so no build variance enters), the
// two arms INTERLEAVED (so thermal/JIT drift hits both equally), and the MEDIAN of N reps reported.
function runCost(): void {
  const REPS = Math.max(3, Math.floor(envF('PF_S117W_REPS', 9)));
  const LEVEL = Math.floor(envF('PF_S117W_LEVEL', 9));
  const g = globalThis as unknown as { __pfEmitInvariant?: boolean };
  const sampler = new SyntheticCylinderSampler(40, 120, 4, 6);
  const field = new MetricSizingField(sampler, {
    maxSagMm: 0.05, minEdgeMm: 0.05, maxEdgeMm: 2, gradeRatio: 2, resU: 129, resT: 129,
  });
  const qt = new PeriodicBalancedQuadtree(field, sampler, { maxLevel: LEVEL });
  g.__pfEmitInvariant = false;
  const warm = triangulateQuadtree(qt);
  const nTri = warm.indices.length / 3;
  log(`── COST A/B: maxLevel=${LEVEL}, ${nTri} triangles/rep, ${REPS} interleaved reps ─────────────`);
  const WARM = Math.max(2, Math.floor(envF('PF_S117W_WARM', 4)));
  const offMs: number[] = [];
  const onMs: number[] = [];
  for (let r = 0; r < REPS + WARM; r += 1) {
    g.__pfEmitInvariant = false;
    let t = performance.now();
    triangulateQuadtree(qt);
    const dOff = performance.now() - t;
    g.__pfEmitInvariant = true;
    t = performance.now();
    const m = triangulateQuadtree(qt);
    const dOn = performance.now() - t;
    if (r === 0 && m.emitCertificate === undefined) {
      log('*** CONTROL CC FIRED: the ON arm produced no certificate. The A/B is not measuring the');
      log('*** instrument. RUN IS VOID. ***');
      process.exitCode = 1;
      return;
    }
    if (r < WARM) continue; // discard: JIT tiering + first-touch GC land entirely here
    offMs.push(dOff);
    onMs.push(dOn);
  }
  g.__pfEmitInvariant = false;
  const med = (a: number[]): number => { const s = [...a].sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
  const mOff = med(offMs);
  const mOn = med(onMs);
  // MIN is the robust estimator for "this rep suffered no interference"; the median still carries GC.
  const lOff = Math.min(...offMs);
  const lOn = Math.min(...onMs);
  const nsMedian = ((mOn - mOff) * 1e6) / nTri;
  const nsMin = ((lOn - lOff) * 1e6) / nTri;
  log(`  (discarded ${WARM} warm-up rep pairs)`);
  log(`  OFF  min ${lOff.toFixed(2)} ms   median ${mOff.toFixed(2)} ms   [${offMs.map((x) => x.toFixed(0)).join(' ')}]`);
  log(`  ON   min ${lOn.toFixed(2)} ms   median ${mOn.toFixed(2)} ms   [${onMs.map((x) => x.toFixed(0)).join(' ')}]`);
  log(`  *** COST, MIN estimator ............ ${nsMin.toFixed(2)} ns / triangle   (${(((lOn / lOff) - 1) * 100).toFixed(2)} %)`);
  log(`      cost, median estimator ......... ${nsMedian.toFixed(2)} ns / triangle   (${(((mOn / mOff) - 1) * 100).toFixed(2)} %)`);
  // CC2: the OFF arm's OWN min-to-median gap bounds what this measurement can resolve. Quote it always.
  const noiseOff = mOff - lOff;
  const resolvable = (lOn - lOff) > noiseOff;
  log(`  OFF-arm min→median noise ........... ${noiseOff.toFixed(2)} ms  = ${((noiseOff * 1e6) / nTri).toFixed(2)} ns/triangle-equivalent`);
  log(`  CC2 resolvable? .................... ${resolvable ? 'YES — the MIN-arm delta exceeds the OFF-arm noise' : 'NO — the delta is INSIDE the noise floor; the figure is an UPPER BOUND only'}`);
  writeFileSync(`${OUT}/S117_EMITWIRE_COST.json`, JSON.stringify({
    mode: 'cost', level: LEVEL, nTri, reps: REPS, warm: WARM, offMs, onMs,
    medOff: mOff, medOn: mOn, minOff: lOff, minOn: lOn, nsMin, nsMedian, noiseOff, resolvable,
  }, null, 2));
  log(`  -> ${OUT}/S117_EMITWIRE_COST.json`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  if (MODE === 'live') await runLive();
  else if (MODE === 'cost') runCost();
  else runStl();
  log('');
  log('DONE.');
}
void main();
