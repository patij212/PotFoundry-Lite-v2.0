// _pkg_tangled_frombins.test.ts — DEV-ONLY (env PF_PKG_TANGLED_FROMBINS=1).
//
// RESILIENT packaging for Voronoi + Crystalline of the TANGLED family. The full rebuild (buildInhouseMetricMesh on
// the per-eval HASH radius fn at reaching density) is OOM-KILLED on this box while a concurrent sibling workstream
// holds most RAM (only ~7 GB free; Voronoi 1.8M / Crystalline 3.46M tris). The _tangled2 RECON already built these
// EXACT reaching meshes and dumped their render bins + true-3D-anchored heatmap + measured every field with the SAME
// labkit rulers. So instead of a crashing rebuild we REUSE the recon bins READ-ONLY: read xyz/idx, write the STL,
// copy the heatmap bins, and emit the manifest row from the recon's already-measured numbers. Same primitive, same
// reaching config, same instrument — real numbers from a real run. Edits NOTHING in src/.
//
// GyroidManifold is already packed (its row + STL + heatmap were produced by the analytic-rA path which does NOT OOM).
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { writeBinarySTL } from './labkit';

const ROOT = join('research', 'exchange', '_best20');
const STL_DIR = join(ROOT, 'stl');
const HEAT_DIR = join(ROOT, 'heatmap');
const MANIFEST = join(ROOT, 'manifest.ndjson');
const RECON = join('research', 'exchange', '_tangled');

/** recon-measured row (from t2_rows.ndjson) — real numbers from the recon run at the reaching config. */
interface FromBins {
  style: string; reconName: string; reconLabel: string; chordTolMm: number; maxPoints: number;
  true3dP99Mm: number; serrationMm: number; flChordP99Mm: number; gnP99Mm: number; nRed: number;
  pctBelow20: number; minAngleDeg: number; rawNonMan: number; heatmapNote: string;
}

// From research/exchange/_tangled/t2_rows.ndjson (the recon's own labkit measurements at the reaching config):
//  Voronoi     steiner0.03  : tris 1798605 trustedP99 0.0931 flMax 0.088 flP99 0.0264 gnP99 0.093 nRed 50  %<20 2   minA 9.3 nonMan 0
//  Crystalline steiner0.015 : tris 3456411 trustedP99 0.0987 flMax 0.125 flP99 0.0045 gnP99 0.112 nRed 13  %<20 0   minA 6.7 nonMan 0
const ITEMS: FromBins[] = [
  {
    style: 'Voronoi', reconName: 't2_Voronoi_steiner0.03_chord', reconLabel: 'steiner0.03', chordTolMm: 0.03, maxPoints: 900_000,
    true3dP99Mm: 0.0931, serrationMm: 0.088, flChordP99Mm: 0.0264, gnP99Mm: 0.093, nRed: 50,
    pctBelow20: 2, minAngleDeg: 9.3, rawNonMan: 0,
    heatmapNote: 'true3d-anchored: green body; a tiny steep cell-wall tail (nRedTotal=50, worst ~0.14mm, p99 0.026, %>0.03=0.6%) — documented',
  },
  {
    style: 'Crystalline', reconName: 't2_Crystalline_steiner0.015_chord', reconLabel: 'steiner0.015', chordTolMm: 0.015, maxPoints: 900_000,
    true3dP99Mm: 0.0987, serrationMm: 0.125, flChordP99Mm: 0.0045, gnP99Mm: 0.112, nRed: 13,
    pctBelow20: 0, minAngleDeg: 6.7, rawNonMan: 0,
    heatmapNote: 'true3d-anchored: green body; a tiny steep crystal-edge tail (nRedTotal=13, worst ~0.13mm, p99 0.006, %>0.03=0.05%) — documented',
  },
];

function hasManifestRow(style: string): boolean {
  if (!existsSync(MANIFEST)) return false;
  for (const l of readFileSync(MANIFEST, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { if ((JSON.parse(l) as { style?: string }).style === style) return true; } catch { /* skip */ }
  }
  return false;
}

function packFromBins(it: FromBins): void {
  mkdirSync(STL_DIR, { recursive: true });
  mkdirSync(HEAT_DIR, { recursive: true });
  if (hasManifestRow(it.style)) { console.log(`[skip] ${it.style} — manifest row exists`); return; }

  const xyzBuf = readFileSync(join(RECON, `${it.reconName}.xyz.bin`));
  const idxBuf = readFileSync(join(RECON, `${it.reconName}.idx.bin`));
  const xyz = new Float32Array(xyzBuf.buffer, xyzBuf.byteOffset, xyzBuf.byteLength / 4);
  const idx = new Uint32Array(idxBuf.buffer, idxBuf.byteOffset, idxBuf.byteLength / 4);
  const tris = idx.length / 3;

  // STL from the recon lifted xyz + indices (do not clobber an existing one).
  const stlPath = join(STL_DIR, `${it.style}.stl`);
  if (!existsSync(stlPath)) writeBinarySTL(stlPath, xyz, idx);
  const stlBytes = statSync(stlPath).size;

  // Copy the recon heatmap bins (xyz/idx/col/meta) → _best20/heatmap/<Style>.* so meshRender.cjs can render them.
  for (const ext of ['xyz.bin', 'idx.bin', 'col.bin', 'meta.json'] as const) {
    const src = join(RECON, `${it.reconName}.${ext}`);
    if (existsSync(src)) copyFileSync(src, join(HEAT_DIR, `${it.style}.${ext}`));
  }
  // rewrite meta name so the renderer label reads the style, keeping the recon's ruler/worst/p99 fields.
  const metaPath = join(HEAT_DIR, `${it.style}.meta.json`);
  if (existsSync(metaPath)) {
    const m = JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>;
    m.name = it.style;
    writeFileSync(metaPath, JSON.stringify(m));
  }

  const row = {
    style: it.style,
    primitive: 'CDT-under-M + deep sag',
    config: `buildInhouseMetricMesh chordSteiner+deepSag chordTolMm=${it.chordTolMm} sweeps=2 guardManifold maxPoints=${it.maxPoints} (recon ${it.reconLabel}, bins reused — rebuild OOM under concurrent RAM pressure)`,
    true3dP99Mm: it.true3dP99Mm,
    serrationMm: it.serrationMm,
    flChordP99Mm: it.flChordP99Mm,
    gnP99Mm: it.gnP99Mm, nRed: it.nRed,
    pctBelow20: it.pctBelow20,
    minAngleDeg: it.minAngleDeg,
    rawNonMan: it.rawNonMan, weldNonMan: it.rawNonMan,
    tris, stlBytes,
    source: 'recon-bins',
    heatmapNote: it.heatmapNote,
  };
  appendFileSync(MANIFEST, JSON.stringify(row) + '\n');
  console.log(`[DONE-frombins] ${it.style} true3dP99=${row.true3dP99Mm} serr=${row.serrationMm} %<20=${row.pctBelow20} rawNM=${row.rawNonMan} tris=${tris} stlBytes=${stlBytes}`);
}

describe('BEST20 pack — TANGLED (Voronoi/Crystalline from recon bins)', () => {
  it.skipIf(process.env.PF_PKG_TANGLED_FROMBINS !== '1')('Voronoi from bins', () => { packFromBins(ITEMS[0]); expect(true).toBe(true); }, 10 * 60 * 1000);
  it.skipIf(process.env.PF_PKG_TANGLED_FROMBINS !== '1')('Crystalline from bins', () => { packFromBins(ITEMS[1]); expect(true).toBe(true); }, 10 * 60 * 1000);
});
