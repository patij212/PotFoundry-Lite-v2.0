// s81LandFlipGate.ts — THE EQUIVALENCE GATE for the packaged pass.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. `landFlipPass.ts` re-homes the S60 constrained flip so a DRIVER can call it over an
// in-memory soup. A re-home is a rewrite, and a rewrite that "looks the same" is exactly how a campaign
// acquires an unattributable number. So the packaged pass is not trusted on inspection: it is run over the
// SAME STL with the SAME options as the probe arm and the OUTPUT STL IS MD5-COMPARED.
//
// H-L4-GATE: landConstrainedFlip(posRuler='plane') over `<stem>.stl` produces a mesh BYTE-IDENTICAL to
//            s60ConstrainedFlip's `con` arm on the monotone chord key.
// KILL:      md5 differs  =>  the packaged pass is NOT the measured pass; every driver number taken
//            through it is inadmissible until the difference is found and named. Not a warning — a STOP.
//
// It also prices the HONEST C2 (posRuler='h1'): the same pass with `certifyTriangle`'s witness replacing
// the blind plane ruler on the acceptance test, with the orientation key as the optional cheap SELECTOR.
//
// Usage:  bash research/tools/run-s81-land-flip-gate.sh
//   env:  PF_S81_STYLE, PF_S81_STEM, PF_S81_TAG, PF_S81_RULER=plane|h1|off, PF_S81_SEL_UM,
//         PF_S81_ROUNDS, PF_S81_CMP=<path to the STL that must match>
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { detectZJumps, detectThetaJumps } from '../bridge/_facetTruthLib';
import { landConstrainedFlip, type LandPosRuler, type LandCensus } from './landFlipPass';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STYLE = process.env.PF_S81_STYLE ?? 'GothicArches';
const STEM = process.env.PF_S81_STEM ?? 'gothicarches_ring_DS-HT_S39CTL';
const TAG = process.env.PF_S81_TAG ?? 'GATE';
const RULER = (process.env.PF_S81_RULER ?? 'plane') as LandPosRuler;
const SEL = envF('PF_S81_SEL_UM', 0);
const ROUNDS = Math.round(envF('PF_S81_ROUNDS', 40));
const CMP = process.env.PF_S81_CMP ?? '';
/** 0 = the exhaustive sweep (the CONTROL). 1 = hoist the score recompute. 2 = + the dirty-edge frontier.
 *  Defaults to the pass's own default (2 since S86); set PF_LAND_FAST=0 to re-run the control. */
const FAST = Math.round(envF('PF_LAND_FAST', 2)) as 0 | 1 | 2;
const DIMS: StyleDims = { H: envF('PF_S81_H', 120), Rb: envF('PF_S81_RB', 40), Rt: envF('PF_S81_RT', 50), expn: 1 };
const H = DIMS.H;
const OUTDIR = 'research/exchange/_strataConformBisect/s80land';

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
mkdirSync(OUTDIR, { recursive: true });

log('===== S81 — EQUIVALENCE GATE for the PACKAGED constrained flip (landFlipPass.ts) =====');
log(`style ${STYLE}  stem ${STEM}  tag ${TAG}  C2 ruler ${RULER}  selector ${SEL} um  rounds ${ROUNDS}  fastLevel ${FAST}`);

const rAbase = buildRadiusFn(STYLE as StyleId, { ...registryDefaults(STYLE) }, DIMS);
const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
const zJ = detectZJumps(rA, H); const thJ = detectThetaJumps(rA, H);
log(`closure: detectZJumps ${zJ.length}  detectThetaJumps ${thJ.length}`);

const { xyz, nTri } = readMeshFloat64(`research/exchange/_strataConformBisect/${STEM}.stl`, false);
log(`${nTri} facets read   [${((Date.now() - T0) / 1000).toFixed(1)}s]`);

const P = Float64Array.from(xyz);
const st = landConstrainedFlip(P, nTri, {
  rA, H, barUm: 10, jbarUm: 1, rounds: ROUNDS, posRuler: RULER, h1SelectUm: SEL,
  useDet: true, detMode: 'rel', gateMm: 0.05, nMax: 512, zJumps: zJ, thJumps: thJ, fastLevel: FAST, log,
});

const show = (l: string, c: LandCensus): void => {
  log(`  ${l}`);
  log(`    ORIENT over-10um ${c.orientOver} (${((100 * c.orientOver) / nTri).toFixed(3)}%)  p50 ${c.orientP50.toFixed(2)} p99 ${c.orientP99.toFixed(2)} max ${c.orientMax.toFixed(1)} um   by AREA ${c.orientAreaOverPct.toFixed(3)}% of surface`);
  log(`    INVERSION >90deg ${c.over90}  >120deg ${c.over120}  max ${c.angMax.toFixed(2)} deg`);
  log(`    POSITION (plane ruler) over-10um ${c.posOver}  p99 ${c.posP99.toFixed(2)} max ${c.posMax.toFixed(1)} um`);
  log(`    SHAPE maxAngle max ${c.maxAngMax.toFixed(3)}  caps>=150 ${c.cap150}   DETERM jit>1um ${c.jitOver1} >10um ${c.jitOver10}`);
  log(`    TOPO ${c.edges} edges, boundary ${c.boundary}, non-manifold ${c.nonManifold}, orientation-inconsistent ${c.orientInconsistent}`);
};
log('');
show('BEFORE', st.before);
show('AFTER ', st.after);
log('');
log(`flips ${st.flips} in ${st.rounds} rounds, ${st.secs.toFixed(1)}s   frozen off-surface ${st.frozen}`);
log(`rej: frozen ${st.rej.frozen}  dirty ${st.rej.dirty}  dup ${st.rej.dup}  fold ${st.rej.fold}  noImprove ${st.rej.noImprove}  DET ${st.rej.det}  POS ${st.rej.pos}`);
log(`WORK (fastLevel ${FAST}): body entries ${st.candBody}  score evals ${st.scoreEvals}  frontier-skipped ${st.frontierSkipped}`);
if (RULER === 'h1') log(`H1 C2: evaluated ${st.h1Evaluated} candidates, selector skipped ${st.h1Skipped} (${((100 * st.h1Skipped) / Math.max(1, st.h1Skipped + st.h1Evaluated)).toFixed(2)}%)`);
log(`ORIENT over-bar ${st.before.orientOver} -> ${st.after.orientOver}  (${(st.before.orientOver / Math.max(1, st.after.orientOver)).toFixed(3)}x)   by AREA ${st.before.orientAreaOverPct.toFixed(3)}% -> ${st.after.orientAreaOverPct.toFixed(3)}%  (${(st.before.orientAreaOverPct / Math.max(1e-30, st.after.orientAreaOverPct)).toFixed(3)}x)`);
log(`POSITION (plane) over-bar ${st.before.posOver} -> ${st.after.posOver}`);
log(`NON-VACUITY: C2 rejected ${st.rej.pos}, C3 rejected ${st.rej.det}. ${st.rej.pos === 0 && RULER !== 'off' ? '*** C2 IS VACUOUS ON THIS ARM ***' : ''}`);

// ── WRITE + THE GATE
const buf = Buffer.alloc(84 + nTri * 50);
buf.write('STRATA landFlipPass', 0, 'ascii');
buf.writeUInt32LE(nTri, 80);
let o = 84;
for (let t = 0; t < nTri; t += 1) {
  const ax = P[t * 9]; const ay = P[t * 9 + 1]; const az = P[t * 9 + 2];
  const bx = P[t * 9 + 3]; const by = P[t * 9 + 4]; const bz = P[t * 9 + 5];
  const cx = P[t * 9 + 6]; const cy = P[t * 9 + 7]; const cz = P[t * 9 + 8];
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
  buf.writeFloatLE(nx, o); buf.writeFloatLE(ny, o + 4); buf.writeFloatLE(nz, o + 8);
  buf.writeFloatLE(ax, o + 12); buf.writeFloatLE(ay, o + 16); buf.writeFloatLE(az, o + 20);
  buf.writeFloatLE(bx, o + 24); buf.writeFloatLE(by, o + 28); buf.writeFloatLE(bz, o + 32);
  buf.writeFloatLE(cx, o + 36); buf.writeFloatLE(cy, o + 40); buf.writeFloatLE(cz, o + 44);
  buf.writeUInt16LE(0, o + 48); o += 50;
}
const outPath = `${OUTDIR}/${STEM.split('/').pop()}_${TAG}.stl`;
writeFileSync(outPath, buf);
// GEOMETRY-ONLY digest: the 80-byte header and the per-facet normal are DERIVED, and two writers may
// differ there without disagreeing about a single triangle. The gate must test the mesh, not the header.
const geoHash = (b: Buffer): string => {
  const h = createHash('md5');
  const v = Buffer.alloc(36);
  for (let t = 0; t < nTri; t += 1) { b.copy(v, 0, 84 + t * 50 + 12, 84 + t * 50 + 48); h.update(v); }
  return h.digest('hex');
};
const mine = geoHash(buf);
log('');
log(`written ${outPath}`);
log(`GEOMETRY MD5 (vertices only, normals+header excluded): ${mine}`);
let gate = 'not requested';
if (CMP !== '') {
  if (!existsSync(CMP)) { gate = `*** CMP MISSING: ${CMP} ***`; } else {
    const other = readFileSync(CMP);
    const nOther = other.readUInt32LE(80);
    if (nOther !== nTri) gate = `*** FACET COUNT DIFFERS: ${nOther} vs ${nTri} — GATE FAILED ***`;
    else {
      const h = createHash('md5'); const v = Buffer.alloc(36);
      for (let t = 0; t < nTri; t += 1) { other.copy(v, 0, 84 + t * 50 + 12, 84 + t * 50 + 48); h.update(v); }
      const oh = h.digest('hex');
      gate = oh === mine
        ? `PASS — byte-identical geometry to ${CMP}  (${oh})`
        : `*** FAIL — geometry differs from ${CMP}  (theirs ${oh}, mine ${mine}) ***`;
    }
  }
  log(`H-L4-GATE: ${gate}`);
}
writeFileSync(`${OUTDIR}/${TAG}.landgate.json`, JSON.stringify({
  style: STYLE, stem: STEM, tag: TAG, ruler: RULER, selUm: SEL, rounds: ROUNDS,
  geoMd5: mine, cmp: CMP, gate, stats: st, secs: (Date.now() - T0) / 1000,
}, null, 2));
log(`done  [${((Date.now() - T0) / 1000).toFixed(1)}s]`);
