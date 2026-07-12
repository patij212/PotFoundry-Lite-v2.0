// _recentEmbedStl.test.ts — DEV-ONLY (env PF_RECENTSTL=1). Lifts the recent .ut parametric embed
// meshes (Voronoi/Crystalline/Gyroid/BasketWeave/CelticKnot research runs) to 3D and writes binary
// STL into research/exchange/_recent_stl/ for inspection. READ-ONLY on the source dirs — only writes
// into _recent_stl. Lift mirrors each embed test exactly: radiusFn(style,DIMS) === buildRadiusFn(
// style,{},DIMS); th = 2*pi*u, z = t*H, r = rA(th,z). Resumable: skips a mesh whose STL exists.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRadiusFn, writeBinarySTL, type StyleDims } from './labkit';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const TAU = Math.PI * 2;
const EX = join('research', 'exchange');
const OUT = join(EX, '_recent_stl');

// source dir -> style its generating test used (dims are uniform across all these runs)
const DIRS: Array<{ dir: string; style: StyleId }> = [
  { dir: '_voronoi_embed', style: 'Voronoi' as StyleId },
  { dir: '_crystalline_embed', style: 'Crystalline' as StyleId },
  { dir: '_gyroid_polish', style: 'GyroidManifold' as StyleId },
  { dir: '_gyroid_literal0', style: 'GyroidManifold' as StyleId },
  { dir: '_gyroid_truth', style: 'GyroidManifold' as StyleId },
  { dir: '_gyroid_close', style: 'GyroidManifold' as StyleId },
  { dir: '_gyroid_knee', style: 'GyroidManifold' as StyleId },
  // _weave_fe / _ck_close nest meshes under style-named subfolders (and _weave_fe holds two styles):
  { dir: '_weave_fe/BasketWeave', style: 'BasketWeave' as StyleId },
  { dir: '_weave_fe/CelticTriquetra', style: 'CelticTriquetra' as StyleId },
  { dir: '_ck_close/CelticKnot', style: 'CelticKnot' as StyleId },
];

describe('recent embed .ut -> STL', () => {
  it.skipIf(process.env.PF_RECENTSTL !== '1')('lift + STL each recent embed mesh', () => {
    mkdirSync(OUT, { recursive: true });
    const log = join(OUT, '_uv_lift.log');
    for (const { dir, style } of DIRS) {
      const srcDir = join(EX, dir);
      if (!existsSync(srcDir)) continue;
      const flat = dir.replace(/[\\/]/g, '__'); // flatten nested style paths for the output filename
      const rA = buildRadiusFn(style, {}, DIMS);
      const utFiles = readdirSync(srcDir).filter((f) => f.endsWith('.ut.bin'));
      for (const utf of utFiles) {
        const tag = utf.replace(/\.ut\.bin$/, '');
        const idxf = join(srcDir, `${tag}.idx.bin`);
        const outPath = join(OUT, `${flat}__${tag}.stl`);
        if (!existsSync(idxf)) { appendFileSync(log, `${dir}/${tag}: SKIP (no idx.bin)\n`); continue; }
        if (existsSync(outPath)) { appendFileSync(log, `${dir}/${tag}: EXIST\n`); continue; }
        const ut = new Float64Array(new Uint8Array(readFileSync(join(srcDir, utf))).buffer);
        const idx = new Uint32Array(new Uint8Array(readFileSync(idxf)).buffer);
        const nV = ut.length / 2;
        const xyz = new Float64Array(nV * 3);
        for (let i = 0; i < nV; i++) {
          const u = ut[2 * i], t = ut[2 * i + 1];
          const th = TAU * u, z = t * DIMS.H, r = rA(th, z);
          xyz[3 * i] = r * Math.cos(th);
          xyz[3 * i + 1] = r * Math.sin(th);
          xyz[3 * i + 2] = z;
        }
        writeBinarySTL(outPath, xyz, idx);
        const line = `${dir}/${tag}: verts=${nV} tris=${idx.length / 3} -> ${outPath}`;
        appendFileSync(log, line + '\n');
        // eslint-disable-next-line no-console
        console.log(line);
      }
    }
    expect(existsSync(OUT)).toBe(true);
  }, 60 * 60 * 1000);
});
