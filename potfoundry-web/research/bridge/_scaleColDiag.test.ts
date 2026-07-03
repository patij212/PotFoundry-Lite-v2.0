// _scaleColDiag.test.ts — DEV-ONLY. E-SCALECOL diagnosis: HarmonicRipple (smooth control) gave a 16mm chord worst
// via the driver — that is a BUILDER bug, not a fidelity failure on a smooth ripple. Falsify the cause: is the
// ridge-graph mis-tracking the 19<->20 crest-count wobble (spurious extrema) into a broken chain that produces
// giant cross-wall facets? Inspect the graph directly (drift, births, discontinuities) + the worst facets' geometry.
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, perFaceChordSag } from './labkit';
import { rowExtrema, validateRidgeGraph } from './_structColLib';
import { buildRidgeGraphDeflicker } from './_scaleColGraph';
import { msquareRows, rasterizeColumnsSquare, buildStructWallSquare } from './_qcolMsquare';
import { findBirths } from './_scaleColDriver';
import type { StyleDims } from './runStyle';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_SCALECOL === '1';
const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const OUT = join('research', 'exchange', '_scalecol');

describe.skipIf(!RUN)('E-SCALECOL diag', () => {
  it('inspect ridge graph + count-wobble on a style', () => {
    mkdirSync(OUT, { recursive: true });
    const STYLE = (process.env.PF_SCALECOL_STYLE ?? 'HarmonicRipple') as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS); const H = DIMS.H;
    const scanN = Number(process.env.PF_SCALECOL_SCANN ?? '8000');

    // 1) crest/valley count across a fine t-scan — where does it wobble?
    const nT = 121; const counts: Array<{ t: number; c: number; v: number }> = [];
    for (let i = 0; i < nT; i++) { const t = i / (nT - 1); const z = t * H; counts.push({ t: +t.toFixed(4), c: rowExtrema(rA, z, 1, scanN).length, v: rowExtrema(rA, z, -1, scanN).length }); }
    const cVals = counts.map((x) => x.c), vVals = counts.map((x) => x.v);
    const wobble = counts.filter((x, i) => i > 0 && (x.c !== counts[i - 1].c || x.v !== counts[i - 1].v));

    // 2) build the DEFLICKER graph on M-square rows, validate it.
    const births = findBirths(rA, H, scanN);
    const ts = msquareRows(rA, H, 0.25, births, { seamBand: 0.02 });
    const g = buildRidgeGraphDeflicker(rA, H, ts, scanN, { persistFrac: 0.06 });
    const val = validateRidgeGraph(g);
    console.log(`DEFLICKER diag: ${JSON.stringify(g.diag)} nCrest=${g.nCrest} nValley=${g.nValley}`);
    // per-slot birthRow: how many slots are born ABOVE row 0 (should be ~0 for a constant-count style)?
    const cBornAbove0 = g.crestBirthRow.filter((r) => r > 0).length;
    const vBornAbove0 = g.valleyBirthRow.filter((r) => r > 0).length;
    console.log(`crest slots born above row0: ${cBornAbove0}, valley: ${vBornAbove0}; crestBirthRows=${JSON.stringify(Array.from(g.crestBirthRow))}`);

    // 3) worst facets: where are the 16mm facets? (u,t and edge lengths)
    const rows = rasterizeColumnsSquare(g, rA, H, 0.03, 2, 0.03, 0.6);
    const mesh = buildStructWallSquare(rA, H, rows, 'wrap');
    const own = perFaceChordSag(mesh.ut, mesh.idx, rA, H);
    const order = Array.from({ length: mesh.nF }, (_, f) => f).sort((a, b) => own.faceErr[b] - own.faceErr[a]).slice(0, 15);
    const worst = order.map((f) => {
      const a = mesh.idx[3 * f], b = mesh.idx[3 * f + 1], c = mesh.idx[3 * f + 2];
      const ed = (i: number, j: number): number => Math.hypot(mesh.xyz[3 * i] - mesh.xyz[3 * j], mesh.xyz[3 * i + 1] - mesh.xyz[3 * j + 1], mesh.xyz[3 * i + 2] - mesh.xyz[3 * j + 2]);
      return { sag: +own.faceErr[f].toFixed(3), uA: +mesh.ut[2 * a].toFixed(4), tA: +mesh.ut[2 * a + 1].toFixed(4), uB: +mesh.ut[2 * b].toFixed(4), uC: +mesh.ut[2 * c].toFixed(4), edgeMax: +Math.max(ed(a, b), ed(b, c), ed(a, c)).toFixed(3) };
    });

    const rec = {
      style: STYLE, crestRange: [Math.min(...cVals), Math.max(...cVals)], valleyRange: [Math.min(...vVals), Math.max(...vVals)],
      nWobbleTransitions: wobble.length, wobbleAt: wobble.slice(0, 20),
      birthsDetected: births.length, birthsT: births.slice(0, 20),
      graph: { nCrest: g.nCrest, nValley: g.nValley, maxDriftU: +val.maxDriftU.toFixed(5), maxDriftMm: +val.maxDriftMm.toFixed(3), discontinuities: val.discontinuities, nBirths: val.births.length },
      worstFacets: worst,
    };
    writeFileSync(join(OUT, `diag_${STYLE}.json`), JSON.stringify(rec, null, 2));
    console.log(`${STYLE}: crest ${rec.crestRange} valley ${rec.valleyRange} wobbles=${wobble.length} births=${births.length} | graph drift=${val.maxDriftMm.toFixed(2)}mm disc=${val.discontinuities} | worst sag=${worst[0]?.sag} edgeMax=${worst[0]?.edgeMax} at u=${worst[0]?.uA} t=${worst[0]?.tA}`);
    console.log(`wobbleAt: ${JSON.stringify(wobble.slice(0, 12))}`);
  }, 3_600_000);
});
