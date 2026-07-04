// _pkg_tangled.test.ts — DEV-ONLY (env PF_PKG_TANGLED=1). BEST-20 packaging for the TANGLED family.
//
// STYLES: GyroidManifold (chordTol 0.02), Voronoi (0.015), Crystalline (0.010).
// Primitive: CDT-under-M + deep sag — reuses the _tangled2 reaching recipe READ-ONLY:
//   buildInhouseMetricMesh({ chordSteiner:true, guardManifoldAlways:true, optimizeSweeps:2 }) at chordTolMm.
//
// For each style: build once, write STL (labkit writeBinarySTL), dump TRUE-3D heatmap bins (labkit dumpHeatmap,
// steep-lattice brute-anchored ruler), re-measure, and CHECKPOINT one manifest row the INSTANT the style is done.
// Resumable: a style whose STL already exists is SKIPPED. Edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, buildFeatureTruth,
  buildMeshUt, buildLocator, featureLineChord3D, liftUtToRadial, triangleQualityDistribution,
  auditNonManByIndex, perFaceChordSag, bruteAnchoredRedPerp, dumpHeatmap, writeBinarySTL,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const ROOT = join('research', 'exchange', '_best20');
const STL_DIR = join(ROOT, 'stl');
const HEAT_DIR = join(ROOT, 'heatmap');
const MANIFEST = join(ROOT, 'manifest.ndjson');

// reaching config = the _tangled2 recipe. moderate screening budget; raise for the deeper chord tols.
const BASE = { tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14, splitThresh: 1.5 } as const;

/** RAW-INDEX non-manifold: undirected edges (by literal index) shared by >2 tris. */
function auditNonManRaw(idx: ArrayLike<number>): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const key = p < q ? `${p}_${q}` : `${q}_${p}`; ec.set(key, (ec.get(key) ?? 0) + 1); }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

interface StyleCfg { style: StyleId; primitive: string; chordTolMm: number; maxPoints: number; anchorTopK: number; sampleN: number; heatmapNote: string; }

// Voronoi/Crystalline use a per-eval HASH radius fn → brute-anchoring is expensive. Keep the anchored topK + sampleN
// modest for them (the p99 signal lives in the few worst red facets; ~60/25 is plenty) so the measurement phase does
// not OOM/stall on the 4M-tri hash meshes. Gyroid (smooth analytic) can afford the full anchor.
const STYLES: StyleCfg[] = [
  { style: 'GyroidManifold' as StyleId, primitive: 'CDT-under-M + deep sag', chordTolMm: 0.02, maxPoints: 2_200_000, anchorTopK: 200, sampleN: 40, heatmapNote: 'green throughout; no steep tail' },
  { style: 'Voronoi' as StyleId, primitive: 'CDT-under-M + deep sag', chordTolMm: 0.03, maxPoints: 900_000, anchorTopK: 60, sampleN: 25, heatmapNote: 'green except a tiny steep cell-edge tail (documented)' },
  { style: 'Crystalline' as StyleId, primitive: 'CDT-under-M + deep sag', chordTolMm: 0.015, maxPoints: 900_000, anchorTopK: 60, sampleN: 25, heatmapNote: 'green except a tiny steep crystal-edge tail (documented)' },
];

/** completion marker = a manifest ROW for this style (not just the STL, which a sibling agent may write). */
function hasManifestRow(style: string): boolean {
  if (!existsSync(MANIFEST)) return false;
  for (const l of readFileSync(MANIFEST, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { if ((JSON.parse(l) as { style?: string }).style === style) return true; } catch { /* skip */ }
  }
  return false;
}

function packOne(cfg: StyleCfg): void {
  mkdirSync(STL_DIR, { recursive: true });
  mkdirSync(HEAT_DIR, { recursive: true });
  const stlPath = join(STL_DIR, `${cfg.style}.stl`);
  // Resumable on the REAL completion marker (the manifest row). The STL alone is not enough — a sibling
  // workstream shares this dir; and a prior kill may have left an STL+heatmap but no row.
  if (hasManifestRow(cfg.style)) { console.log(`[skip] ${cfg.style} — manifest row exists`); return; }

  const memMB = (): string => `rss=${(process.memoryUsage().rss / 1048576).toFixed(0)}MB heap=${(process.memoryUsage().heapUsed / 1048576).toFixed(0)}MB`;
  process.stderr.write(`[${cfg.style}] START build maxPoints=${cfg.maxPoints} chordTol=${cfg.chordTolMm} ${memMB()}
`);
  const rA = buildRadiusFn(cfg.style, {}, DIMS);
  const truth = buildFeatureTruth(cfg.style, {}, DIMS, 384);

  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, DIMS.H, {
    ...BASE, maxPoints: cfg.maxPoints, optimizeSweeps: 2,
    guardManifoldAlways: true, chordTolMm: cfg.chordTolMm, chordSteiner: true,
  });
  const buildMs = Date.now() - t0;
  process.stderr.write(`[${cfg.style}] BUILT tris=${mesh.indices.length / 3} ${buildMs}ms ${memMB()}
`);

  const ut = Array.from(mesh.ut); const idx = Array.from(mesh.indices);
  const meshUt = buildMeshUt(ut, idx, rA, DIMS.H);  // lifted xyz (single build, reused for STL/heatmap/measure)
  const lift = meshUt.xyz;
  const tris = idx.length / 3;

  // STL (lifted xyz + indices). Reuse an existing valid STL (a sibling/prior run may have written it) — do NOT
  // clobber; only write if absent.
  if (!existsSync(stlPath)) writeBinarySTL(stlPath, lift, mesh.indices);
  const stlBytes = statSync(stlPath).size;

  // radial chord (reused for both the heatmap anchor and the measurement anchor — compute ONCE).
  const radial = perFaceChordSag(ut, idx, rA, DIMS.H);

  // TRUE-3D heatmap (steep-lattice brute-anchored ruler) → bins for meshRender.cjs. Skip if bins already present.
  if (!existsSync(join(HEAT_DIR, `${cfg.style}.col.bin`))) {
    dumpHeatmap(HEAT_DIR, cfg.style, meshUt.xyz, ut, idx, rA, DIMS.H, { anchorSteep: { redMm: 0.1, topK: cfg.anchorTopK }, stl: false });
  }

  // ── re-measure ──
  const loc = buildLocator(meshUt, 256);
  const interior = { ...truth, lines: truth.lines.filter((l) => l.points.every((p) => p.u > 0.01 && p.u < 0.99 && p.t > 0.01 && p.t < 0.99)) };
  const fl3 = featureLineChord3D(interior, loc, meshUt, rA, DIMS.H, 0.05, 0, 4);
  process.stderr.write(`[${cfg.style}] fl3 done ${memMB()}
`);
  const q = triangleQualityDistribution({ vertices: lift, indices: mesh.indices });
  const rawNonMan = auditNonManRaw(idx);
  const weldNonMan = auditNonManByIndex(meshUt.xyz, idx);
  process.stderr.write(`[${cfg.style}] q+nonMan done, anchoring... ${memMB()}
`);
  const anchored = bruteAnchoredRedPerp(ut, idx, rA, DIMS.H, { radial, sampleN: cfg.sampleN });
  process.stderr.write(`[${cfg.style}] anchor done ${memMB()}
`);

  const row = {
    style: cfg.style,
    primitive: cfg.primitive,
    config: `buildInhouseMetricMesh chordSteiner+deepSag chordTolMm=${cfg.chordTolMm} sweeps=2 guardManifold maxPoints=${cfg.maxPoints}`,
    true3dP99Mm: +anchored.trustedP99.toFixed(4),
    serrationMm: +fl3.maxMm.toFixed(4),           // on-feature true-3D chord max (CDT serration analog)
    flChordP99Mm: +fl3.p99Mm.toFixed(4),
    gnP99Mm: +anchored.gnP99.toFixed(3), gnOver: anchored.gnOver, nRed: anchored.nRed,
    pctBelow20: +q.pctBelow20.toFixed(3),
    minAngleDeg: +q.minAngleDeg.toFixed(3),
    rawNonMan, weldNonMan,
    tris, stlBytes,
    buildMs,
    heatmapNote: cfg.heatmapNote,
  };
  appendFileSync(MANIFEST, JSON.stringify(row) + '\n');
  console.log(`[DONE] ${cfg.style} true3dP99=${row.true3dP99Mm} serr=${row.serrationMm} %<20=${row.pctBelow20} rawNM=${rawNonMan} tris=${tris} stlBytes=${stlBytes} (${buildMs}ms, nRed=${anchored.nRed})`);
}

describe('BEST20 pack — TANGLED family', () => {
  it.skipIf(process.env.PF_PKG_TANGLED !== '1')('GyroidManifold', () => { packOne(STYLES[0]); expect(true).toBe(true); }, 60 * 60 * 1000);
  it.skipIf(process.env.PF_PKG_TANGLED !== '1')('Voronoi', () => { packOne(STYLES[1]); expect(true).toBe(true); }, 90 * 60 * 1000);
  it.skipIf(process.env.PF_PKG_TANGLED !== '1')('Crystalline', () => { packOne(STYLES[2]); expect(true).toBe(true); }, 90 * 60 * 1000);
});
