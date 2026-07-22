// _layeredStripCert.test.ts — E-2026-07-22-LAYERED-STRIP. Extend the DragonScales structured ring-strip emitter
// (buildDsRingStripWall, double-valued tread wall at each C0 ring) to OTHER horizontal-C0 LAYERED styles, then judge-cert
// via the general cut-at-gap adapter. BambooSegments is the clean case: its node-boundary cliff (the `asymVar` term
// jumps at t=k/nodeCount via floor(segmentPhase)) is a DENSITY-INVARIANT horizontal C0 ring (~0.95mm on a uniform grid),
// exactly the class the DS tread wall closes by construction. This is the FIRST reuse of the DS layered template on a
// second style — the U4 curtain/layered class opening.
//
// Env-gated PF_LAYERSTRIP; checkpointed. Research-only; judge READ-ONLY.
import { describe, it } from 'vitest';
import { mkdirSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceTrue3DSag, nonManRawBigStats, triangleQualityDistribution } from './labkit';
import { certifyPeriodicGridMesh } from './certAdapter';
import { buildDsRingStripWall, buildDsRingTSchedule } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsRingStrips';
import { DEFAULT_DS_LATTICE } from '../../src/renderers/webgpu/parametric/conforming/tierC/dsFeatureEdges';
import type { StyleId, StyleOptions } from '../../src/geometry/types';

// Production DEFAULT_DIMENSIONS (per the SR-PROD-CLOSE subagent): OD140/H120 tapered ⇒ H120 / Rt70 / Rb45 / expn1.1.
const DIMS = { H: 120, Rb: 45, Rt: 70, expn: 1.1 };
const OUT_DIR = join('research', 'exchange', '_layeredStripCert');
const NDJSON = join(OUT_DIR, 'strip.ndjson');
function plog(m: string): void { mkdirSync(OUT_DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(join(OUT_DIR, 'run.log'), l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); }
function keyExists(k: string): boolean { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return (JSON.parse(l) as { key?: string }).key === k; } catch { return false; } }); }
function checkpoint(row: Record<string, unknown>): void { mkdirSync(OUT_DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP] ${JSON.stringify(row)}`); }

type RA = (theta: number, z: number) => number;
interface LayeredCase { tag: string; style: StyleId; params: StyleOptions; ringCount: number; }
const CASES: LayeredCase[] = [
  { tag: 'Bamboo', style: 'BambooSegments' as StyleId, params: {} as StyleOptions, ringCount: 5 }, // C0 rings at t=k/5
];

describe('LAYERED-STRIP-CERT — DS ring-strip double-valued wall for horizontal-C0 layered styles', () => {
  it.skipIf(process.env.PF_LAYERSTRIP !== '1')('close (ring-excluded fwd) + judge-cert via the DS ring-strip emitter', () => {
    plog(`=== LAYERED-STRIP => ${NDJSON} ===`);
    for (const cs of CASES) {
      const rA = buildRadiusFn(cs.style, cs.params, DIMS) as unknown as RA;
      const lattice = { ...DEFAULT_DS_LATTICE, scaleRows: cs.ringCount };
      const ringZs: number[] = []; for (let k = 1; k < cs.ringCount; k++) ringZs.push((k / cs.ringCount) * DIMS.H);
      let closed: { nU: number; bodyMax: number; tris: number } | null = null;
      for (const nU of [512, 1024, 2048]) {
        const key = `strip|${cs.tag}|nU${nU}`;
        if (keyExists(key)) { plog(`[skip] ${key}`); continue; }
        const tRows = buildDsRingTSchedule(DIMS.H, { lattice, bodyStepMm: 0.06, flankReachMm: 2.0, flankRows: 30 });
        const wall = buildDsRingStripWall(rA, DIMS.H, nU, tRows);
        const sag = perFaceTrue3DSag(wall.ut, wall.indices, rA as never, DIMS.H, { preFilterMm: 0.001 });
        const nF = wall.indices.length / 3;
        // ring-exclude the tread-wall faces (within 1mm z of a C0 ring) — those are the double-valued cliff, closed by
        // construction and mis-scored by the single-valued ruler (the DS-COMPOSE ring-exclusion).
        let bodyMax = 0, bodyOut = 0, bodyN = 0, wallMax = 0;
        for (let f = 0; f < nF; f++) {
          const zc = (wall.vertices[3 * wall.indices[3 * f] + 2] + wall.vertices[3 * wall.indices[3 * f + 1] + 2] + wall.vertices[3 * wall.indices[3 * f + 2] + 2]) / 3;
          let dzr = 1e9; for (const rz of ringZs) { const d = Math.abs(zc - rz); if (d < dzr) dzr = d; }
          const e = sag.faceErr[f];
          if (dzr <= 1.0) { if (e > wallMax) wallMax = e; continue; }
          bodyN++; if (e > bodyMax) bodyMax = e; if (e > 0.01) bodyOut++;
        }
        const nm = nonManRawBigStats(wall.indices);
        const q = triangleQualityDistribution({ vertices: wall.vertices, indices: wall.indices });
        plog(`[${cs.tag}] nU=${nU} rows=${tRows.length} tris=${nF} fwd-body MAX=${bodyMax.toFixed(6)} out=${bodyOut}/${bodyN} (ring-face MAX=${wallMax.toFixed(4)}) | nonMan=${nm.nonMan} boundary=${nm.boundary} | %<20=${q.pctBelow20.toFixed(2)} minAng=${q.minAngleDeg.toFixed(2)}`);
        checkpoint({ key, tag: cs.tag, nU, rows: tRows.length, tris: nF, bodyMax: +bodyMax.toFixed(6), bodyOut, bodyN, ringFaceMax: +wallMax.toFixed(4), nonMan: nm.nonMan, boundary: nm.boundary, pctBelow20: +q.pctBelow20.toFixed(2), minAngle: +q.minAngleDeg.toFixed(2) });
        if (bodyMax <= 0.01 && bodyOut === 0 && !closed && nF <= 1_048_576) closed = { nU, bodyMax, tris: nF };
      }
      if (!closed) { plog(`[${cs.tag}] did NOT close ≤0.01 (ring-excluded) under the judge cap — needs more density or another feature axis`); continue; }
      const certKey = `cert|${cs.tag}|nU${closed.nU}`;
      if (keyExists(certKey)) { plog(`[skip] ${certKey}`); continue; }
      const tRows = buildDsRingTSchedule(DIMS.H, { lattice, bodyStepMm: 0.06, flankReachMm: 2.0, flankRows: 30 });
      const wall = buildDsRingStripWall(rA, DIMS.H, closed.nU, tRows);
      const v = certifyPeriodicGridMesh(wall.ut, wall.indices, wall.vertices, wall.nU, 0, rA, DIMS.H, 20, { patchId: `layeredstrip-${cs.tag.toLowerCase()}` });
      plog(`[${cs.tag}] CERT nU=${closed.nU} tris=${v.tris} judge=${v.accepted ? 'ACCEPT' : 'REJECT'} maxδ=${v.maxDelta.toFixed(6)} wrap=${v.wrapTris} nonPos=${v.nonPosTris} nonGap=${v.nonGapStraddle} :: ${v.detail}`);
      const fold = closed.bodyMax + v.maxDelta;
      plog(`[${cs.tag}] geometric fold: fwd-body ${closed.bodyMax.toFixed(6)} + δ ${v.maxDelta.toFixed(6)} = ${fold.toFixed(6)} ≤ 0.01 ⇒ ${fold <= 0.01} | CLOSED=${v.accepted && fold <= 0.01}`);
      checkpoint({ key: certKey, tag: cs.tag, nU: closed.nU, tris: v.tris, accepted: v.accepted, maxDelta: +v.maxDelta.toFixed(6), wrapTris: v.wrapTris, nonPos: v.nonPosTris, nonGap: v.nonGapStraddle, fold: +fold.toFixed(6), CLOSED: v.accepted && fold <= 0.01, detail: v.detail });
    }
    plog('[LAYERED-STRIP] DONE');
  }, 30 * 60 * 1000);
});
