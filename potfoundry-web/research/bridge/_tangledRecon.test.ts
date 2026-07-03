// _tangledRecon.test.ts — DEV-ONLY (env PF_TANGLED=1). RECON for the TANGLED-LATTICE primitive (Gyroid first).
//
// The last unbuilt axis: dense curved crest/valley NETWORK (no clean feature-ridge or grid), so structured columns
// fail (E-SCALECOL Gyroid ridge-graph = 38mm). The destination (E-SCALECOL / FRONTIER-THESIS) = transition-free
// CDT-under-M with the crest/valley network PROTECTED as constraint edges + M-square quality + deep sag refinement.
//
// This RECON (cheapest discriminator) measures, BEFORE building the full protected-network pipeline:
//   (A) the Gyroid crest/valley NETWORK extracted by buildFeatureTruth (# lines / points — is it a usable skeleton?)
//   (B) the RAW kernel baseline at moderate budget: true-3D chord (brute-anchored, honest), min-angle/%<20, rawNonMan
//   (C) whether chordSteiner-alone (no network) already closes the chord — isolates "does the network buy anything?"
//
// ISOLATED — CALLS the kernel + committed byte-identical-off hooks, edits NOTHING. Reuses labkit rulers.
import { describe, it, expect } from 'vitest';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth, buildMeshUt, buildLocator,
  featureLineChord3D, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const DIR = join('research', 'exchange', '_tangled');
// moderate screening budget (iterate cheap); deep confirm only the winner later.
const OPTS = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, maxPoints: 900_000, splitThresh: 1.5, optimizeSweeps: 2 } as const;

interface Row { label: string; tris: number; chordP99: number; chordMax: number; trustedP99: number; gnP99: number; minA: number; pctB20: number; nonMan: number; }

function measure(rA: ReturnType<typeof buildRadiusFn>, label: string, mesh: { ut: number[]; indices: Uint32Array; constraint?: { requested: number; recovered: number } }, truth: ReturnType<typeof buildFeatureTruth>): Row {
  const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);
  const loc = buildLocator(meshUt, 256);
  // feature-line true-3D chord on the network loci (interior only)
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
  const fl3 = featureLineChord3D(interior, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
  const q = triangleQualityDistribution({ vertices: liftUtToRadial(ut, rA, DIMS.H).vertices, indices: mesh.indices });
  const nonMan = auditNonManByIndex(meshUt.xyz, idx);
  // honest brute-anchored steep-lattice true-3D perp on the worst red facets
  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: 40 });
  const row: Row = { label, tris: idx.length / 3, chordP99: fl3.p99Mm, chordMax: fl3.maxMm, trustedP99: anchored.trustedP99, gnP99: anchored.gnP99, minA: q.minAngleDeg, pctB20: q.pctBelow20, nonMan };
  // eslint-disable-next-line no-console
  console.log(`${label.padEnd(22)} tris=${String(row.tris).padStart(8)} flChordP99=${fl3.p99Mm.toFixed(4)} flMax=${fl3.maxMm.toFixed(3)} trustP99=${anchored.trustedP99.toFixed(4)}(gn ${anchored.gnP99.toFixed(3)},over ${anchored.gnOver}/${anchored.nSample}) minA=${q.minAngleDeg.toFixed(2)} %<20=${q.pctBelow20.toFixed(1)} nonMan=${nonMan}`);
  return row;
}

describe('TANGLED recon — Gyroid network + raw-kernel baseline', () => {
  it.skipIf(process.env.PF_TANGLED !== '1')('Gyroid: network characterization + raw vs chordSteiner baseline', () => {
    mkdirSync(DIR, { recursive: true });
    const STYLE = 'GyroidManifold' as StyleId;
    const rA = buildRadiusFn(STYLE, {}, DIMS);
    const truth = buildFeatureTruth(STYLE, {}, DIMS, 384);
    const nPts = truth.lines.reduce((s, l) => s + l.points.length, 0);
    const uRange = truth.lines.length ? [Math.min(...truth.lines.flatMap((l) => l.points.map((p) => p.u))), Math.max(...truth.lines.flatMap((l) => l.points.map((p) => p.u)))] : [0, 0];
    // eslint-disable-next-line no-console
    console.log(`NETWORK: ${truth.lines.length} lines / ${nPts} points  uToMm=${truth.uToMm.toFixed(1)}  H=${truth.tToMm}  uRange=[${uRange[0].toFixed(2)},${uRange[1].toFixed(2)}]`);

    // (B) raw kernel baseline
    const rawMesh = buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true });
    const base = measure(rA, 'raw_kernel', rawMesh, truth);
    // heatmap of the raw baseline (anchored steep visual)
    const mu = buildMeshUt(Array.from(rawMesh.ut), Array.from(rawMesh.indices), rA, DIMS.H);
    dumpHeatmap(DIR, 'recon_raw_Gyroid', mu.xyz, Array.from(rawMesh.ut), Array.from(rawMesh.indices), rA, DIMS.H, { anchorSteep: { redMm: 0.1, topK: 150 }, stl: false });
    // (C) chordSteiner-alone (deep sag refinement, no network) — does density alone close chord? and what to quality?
    const steiner = measure(rA, 'chordSteiner_0.03', buildInhouseMetricMesh(rA, DIMS.H, { ...OPTS, guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true }), truth);
    expect(base.tris).toBeGreaterThan(0);
    expect(steiner.tris).toBeGreaterThan(0);
  }, 60 * 60 * 1000);
});
