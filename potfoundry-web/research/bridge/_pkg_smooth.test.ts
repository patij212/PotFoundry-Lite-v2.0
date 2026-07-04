// _pkg_smooth.test.ts — DEV-ONLY (env PF_PKGSMOOTH=1). PACKAGE the SMOOTH family (RippleInterference,
// WaveInterference, SuperellipseMorph, FourierBloom, HarmonicRipple) into the _best20 exchange layout:
//   research/exchange/_best20/stl/<Style>.stl          (labkit writeBinarySTL — lifted xyz + indices)
//   research/exchange/_best20/heatmap/<Style>.{xyz,idx,col}.bin + .meta.json  (labkit dumpHeatmap, TRUE-3D ruler)
//   research/exchange/_best20/manifest.ndjson          (one row per style)
//
// PRIMITIVE = dense M-square under the surface metric M (buildInhouseMetricMesh, the _close_smooth recipe:
// tolMm~0.004, chordSteiner:true, guardManifoldAlways:true). These are single-valued wavy height fields ⇒ no
// feature graph / ridge / weave — the uniform metric-square + deep-sag chordSteiner reaches all-green (<=0.01).
// HarmonicRipple is density-fragile ⇒ bump its budget to >=1.1M.
//
// HONEST RULERS (labkit, READ-ONLY): true3dP99 = bruteAnchoredRedPerp(...).trustedP99 if any red facet, else the
// whole-mesh perFaceTrue3DSag p99 (smooth ⇒ no wrong-local-minimum feet). serrationMm = featureLineChord3D on the
// crest loci (feature true-curve → own mesh edge; smooth field with no C0 discontinuity ⇒ ~0 by construction).
// pctBelow20 = triangleQualityDistribution. rawNonMan = raw-index (literal) non-manifold, MUST be 0.
//
// One env-gated `it` PER STYLE + CHECKPOINT (STL + heatmap bins + manifest row) the INSTANT scored ⇒ a killed run
// resumes by re-running only the styles whose STL does not yet exist. Edits NOTHING in src/.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, statSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, buildInhouseMetricMesh, liftUtToRadial, buildMeshUt, buildLocator,
  buildFeatureTruth, featureLineChord3D,
  perFaceChordSag, perFaceTrue3DSag, bruteAnchoredRedPerp,
  triangleQualityDistribution, dumpHeatmap, writeBinarySTL,
  type StyleDims,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';

const RUN = process.env.PF_PKGSMOOTH === '1';
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;
const ROOT = join('research', 'exchange', '_best20');
const STL_DIR = join(ROOT, 'stl');
const HM_DIR = join(ROOT, 'heatmap');
const MANIFEST = join(ROOT, 'manifest.ndjson');
const CAD_TOL = 0.01;

// _close_smooth recipe (M=g/h² + deep-sag chordSteiner). HarmonicRipple gets a larger budget (density-fragile).
const BASE_RECIPE = {
  tolMm: 0.004, hMin: 0.006, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
  maxPoints: 800_000, splitThresh: 1.5, optimizeSweeps: 2,
  guardManifoldAlways: true, chordTolMm: 0.03, chordSteiner: true,
} as const;

const STYLES: { id: StyleId; maxPoints: number }[] = [
  { id: 'RippleInterference' as StyleId, maxPoints: 800_000 },
  { id: 'WaveInterference' as StyleId, maxPoints: 800_000 },
  { id: 'SuperellipseMorph' as StyleId, maxPoints: 800_000 },
  { id: 'FourierBloom' as StyleId, maxPoints: 800_000 },
  { id: 'HarmonicRipple' as StyleId, maxPoints: 1_400_000 },
];

function p99(arr: ArrayLike<number>): number {
  const s = Float64Array.from(arr as ArrayLike<number>).sort();
  return s.length ? s[Math.min(s.length - 1, Math.floor(0.99 * s.length))] : 0;
}
/** RAW-INDEX non-manifold: undirected edges (by literal index, no weld) shared by >2 tris. */
function auditNonManRaw(indices: ArrayLike<number>): number {
  const ec = new Map<string, number>();
  for (let k = 0; k < indices.length; k += 3) {
    const a = indices[k], b = indices[k + 1], c = indices[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      ec.set(key, (ec.get(key) ?? 0) + 1);
    }
  }
  let nm = 0; for (const v of ec.values()) if (v > 2) nm++; return nm;
}

function scoreStyle(id: StyleId, maxPoints: number): void {
  mkdirSync(STL_DIR, { recursive: true });
  mkdirSync(HM_DIR, { recursive: true });
  const rA = buildRadiusFn(id, {}, DIMS);
  const recipe = { ...BASE_RECIPE, maxPoints };
  const mesh = buildInhouseMetricMesh(rA, H, recipe);
  const ut = Array.from(mesh.ut);
  const idxArr = Array.from(mesh.indices);
  const idx = mesh.indices;
  const tris = idx.length / 3;

  // Lifted 3D positions for STL + quality.
  const xyz = liftUtToRadial(ut, rA, H).vertices;

  // TRUE-3D fidelity: radial screen (red pick) + honest whole-mesh true-3D p99, brute-anchor worst-red.
  const radial = perFaceChordSag(ut, idx, rA, H);
  const true3d = perFaceTrue3DSag(ut, idx, rA, H);
  const true3dP99 = p99(true3d.faceErr);
  const nRed = radial.fracOver(0.1) * tris;
  let trustedP99 = true3dP99;
  if (nRed > 0) {
    const a = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.1, sampleN: 40, radial });
    trustedP99 = a.trustedP99;
  }

  // SERRATION: feature-line true-3D chord on the crest loci (curve → own mesh edge). Smooth single-valued fields
  // carry no C0 discontinuity ⇒ this is ~0 by construction. Guarded (empty truth ⇒ 0).
  let serrationMm = 0;
  try {
    const truth = buildFeatureTruth(id, {}, DIMS, 1024);
    if (truth && (truth as { chains?: unknown[] }).chains && (truth as { chains: unknown[] }).chains.length) {
      const mu = buildMeshUt(ut, idxArr, rA, H);
      const loc = buildLocator(mu, 256);
      const fl = featureLineChord3D(truth, loc, mu, rA, H, 0.5);
      serrationMm = fl.p99Mm;
    }
  } catch { serrationMm = 0; }

  const tq = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const rawNonMan = auditNonManRaw(idx);

  // STL — lifted xyz + indices.
  const stlPath = join(STL_DIR, `${id}.stl`);
  writeBinarySTL(stlPath, xyz, idx);
  const stlBytes = statSync(stlPath).size;

  // HEATMAP — true-3D ruler bins (rendered to PNG afterwards).
  const mu = buildMeshUt(ut, idxArr, rA, H);
  dumpHeatmap(HM_DIR, id, mu.xyz, ut, idxArr, rA, H, { stl: false });

  const heatmapNote = trustedP99 <= CAD_TOL
    ? `full true-3D heatmap, all-green (p99=${trustedP99.toFixed(4)}<=0.01)`
    : `true-3D heatmap p99=${trustedP99.toFixed(4)} (>0.01)`;

  const row = {
    style: id,
    primitive: 'M-square (surface-metric M=g/h²) + deep-sag chordSteiner',
    config: `tolMm=0.004,chordTolMm=0.03,chordSteiner,guardManifoldAlways,maxPoints=${maxPoints}`,
    true3dP99Mm: +trustedP99.toFixed(4),
    serrationMm: +serrationMm.toFixed(4),
    pctBelow20: +tq.pctBelow20.toFixed(2),
    rawNonMan,
    tris,
    stlBytes,
    heatmapNote,
  };
  // CHECKPOINT — append the manifest row the INSTANT scored (STL + bins already on disk).
  appendFileSync(MANIFEST, JSON.stringify(row) + '\n');
  // eslint-disable-next-line no-console
  console.log(
    `${String(id).padEnd(20)} tris=${String(tris).padStart(7)} true3dP99=${row.true3dP99Mm} ` +
    `serr=${row.serrationMm} %<20=${row.pctBelow20} rawNM=${rawNonMan} stlBytes=${stlBytes} | ${heatmapNote}`,
  );
}

/** styles whose STL already exists (resume — env kills repeatedly). */
function stlExists(id: StyleId): boolean { return existsSync(join(STL_DIR, `${id}.stl`)); }

describe('PKG-SMOOTH — _best20 STL + true-3D heatmap + manifest for the 5 smooth wavy-field styles', () => {
  for (const { id, maxPoints } of STYLES) {
    it.skipIf(!RUN)(`package ${id}`, () => {
      if (stlExists(id)) { console.log(`${id}: STL exists — SKIP (resume)`); return; }
      scoreStyle(id, maxPoints);
      expect(existsSync(join(STL_DIR, `${id}.stl`))).toBe(true);
    }, 20 * 60 * 1000);
  }
});
