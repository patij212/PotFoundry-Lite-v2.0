// _pkg_cusp.test.ts — DEV-ONLY (PF_PKG_CUSP=1). _best20 deliverable, FAMILY=cusp.
// STYLES: GothicArches, GeometricStar — the proven steep-EXCLUDE styles (zero-width ridge/chevron cusps, faces
// CAD-grade). Rebuilds the BEST-available mesh per style (proven recipes: GothicArches = CDT-under-M + local crest
// segments via _cu_gothicseg; GeometricStar = feature-conforming strap-crease via _ct_gs), then emits STL + true-3D
// heatmap + one manifest row to research/exchange/_best20/. Steep-EXCLUDE fingerprint: green faces + thin one-facet
// ribbon on the rib/chevron crest.
//
// ISOLATION: NEW file only. Reuses labkit rulers + the two reference probe libs READ-ONLY. Writes ONLY
// research/exchange/_best20/. Env sub-gate + STL-exists skip ⇒ resumable (env has interrupted repeatedly).
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildRadiusFn, type StyleDims, buildInhouseMetricMesh, type InhouseMeshOpts,
  buildMeshUt, triangleQualityDistribution, perFaceChordSag, perFaceTrue3DSagAnchored,
  bruteAnchoredRedPerp, writeBinarySTL, dumpHeatmap, vertErrColors, dumpRenderBins,
  liftUtToRadial,
} from './labkit';
import type { StyleId } from '../../src/geometry/types';
import { extractGothicCrestSegments, measureCrestSerration, type CrestExtractOpts } from './_cu_gothicsegLib';
import { buildStructuredWall, type RowSpec, type BuiltMesh } from './_sharp3dMesh';

const TAU = 2 * Math.PI;
const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const H = DIMS.H;

const ROOT = join(process.cwd(), 'research', 'exchange', '_best20');
const STL_DIR = join(ROOT, 'stl');
const HEAT_DIR = join(ROOT, 'heatmap');
const MANIFEST = join(ROOT, 'manifest.ndjson');
const PROG = join(ROOT, 'progress.log');

const plog = (msg: string): void => {
  mkdirSync(ROOT, { recursive: true });
  const line = `[${new Date().toISOString()}] ${msg}`;
  appendFileSync(PROG, line + '\n');
  /* eslint-disable-next-line no-console */ console.log(line);
};
const ensureDirs = (): void => { mkdirSync(STL_DIR, { recursive: true }); mkdirSync(HEAT_DIR, { recursive: true }); };
const stlPath = (style: string): string => join(STL_DIR, `${style}.stl`);
const manifestRow = (row: Record<string, unknown>): void => {
  mkdirSync(ROOT, { recursive: true });
  appendFileSync(MANIFEST, JSON.stringify(row) + '\n');
  /* eslint-disable-next-line no-console */ console.log(`[MANIFEST ${row.style}] ${JSON.stringify(row)}`);
};

// RAW-INDEX non-manifold (literal-index edges shared by >2 tris).
function auditNonManRaw(idx: ArrayLike<number>): number {
  const keys = new Float64Array(idx.length); let w = 0; const BIG = 2 ** 26;
  for (let k = 0; k < idx.length; k += 3) {
    const a = idx[k], b = idx[k + 1], c = idx[k + 2];
    if (a === b || b === c || a === c) continue;
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) { const lo = p < q ? p : q, hi = p < q ? q : p; keys[w++] = lo * BIG + hi; }
  }
  const arr = keys.subarray(0, w); arr.sort();
  let nm = 0, i = 0;
  while (i < w) { let j = i + 1; while (j < w && arr[j] === arr[i]) j++; if (j - i > 2) nm++; i = j; }
  return nm;
}

// ── GothicArches: CDT-under-M + local crest segments (proven best = _cu_gothicseg hd-4.5M) ──────────────────
const GOTHIC_EXTRACT: CrestExtractOpts = { nRows: 640, nUScan: 4096, minPromMm: 0.03, minAboveMeanMm: 0.02, maxLinkDu: 0.012, refine: true };

function buildGothic(): { style: string; primitive: string; config: string;
  xyz: Float64Array; ut: number[]; idx: Uint32Array; tris: number;
  serrationMm: number; crestUt: number[]; rA: (th: number, z: number) => number; } {
  const style = 'GothicArches';
  const rA = buildRadiusFn(style as StyleId, {}, DIMS);
  plog(`${style}: extracting crest segments...`);
  const ex = extractGothicCrestSegments(rA, H, GOTHIC_EXTRACT);
  plog(`${style}: loci peaks=${ex.nPeaks} segments=${ex.constraints.length / 2}; building kernel (hd-4.5M recipe)...`);
  const opts: InhouseMeshOpts = {
    tolMm: 0.004, hMin: 0.008, hMax: 8, sizeRes: 256, gradeBeta: 0.2, seedN: 14,
    maxPoints: 4_500_000, splitThresh: 1.5, optimizeSweeps: 2, dedupeEps: 1e-7,
    chordTolMm: 0.008, chordSteiner: true,
    guardManifoldAlways: true, guardRecoveryManifold: true, recoveryRobust: true,
    injectedPoints: ex.points, pinInjected: true, constraintEdges: ex.constraints,
  };
  const t0 = Date.now();
  const mesh = buildInhouseMetricMesh(rA, H, opts);
  plog(`${style}: kernel built tris=${(mesh.indices.length / 3 / 1e6).toFixed(2)}M in ${((Date.now() - t0) / 1000).toFixed(0)}s hitBudget=${mesh.hitBudget}`);
  const m = buildMeshUt(mesh.ut, mesh.indices, rA, H);
  const serr = measureCrestSerration(ex.crestUt, m.xyz, mesh.indices, rA, H);
  return {
    style, primitive: 'CDT-under-M + local crest segments (in-house kernel)',
    config: 'hd-4.5M: maxPoints=4.5M tolMm=0.004 hMin=0.008 chordTolMm=0.008 recoveryRobust+guardManifold',
    xyz: m.xyz, ut: mesh.ut, idx: mesh.indices instanceof Uint32Array ? mesh.indices : Uint32Array.from(mesh.indices),
    tris: mesh.indices.length / 3, serrationMm: serr.p99Mm, crestUt: ex.crestUt, rA,
  };
}

// ── GeometricStar: feature-conforming strap-crease loci + wall picket (proven best = _ct_gs ct_z1300_b1700_p4) ──
const GS = { N: 8, gap: 0.05, detail: 0.5, layers: 4.0, zoom: 1.0, shift: 0.0, relief: 2.0, edge: 0.02 };
const ANGLE = TAU / GS.N;
const STAR_ANGLE = (0.2 + 0.6 * GS.detail) * (Math.PI / 2);
const N_STAR_X = Math.sin(STAR_ANGLE);
const N_STAR_Y = Math.cos(STAR_ANGLE);

function sectorLociAbsA(v: number, targetD: number): number[] {
  const out: number[] = [];
  for (const sign of [1, -1]) {
    const uvXabs = (sign * targetD - v * N_STAR_Y) / N_STAR_X;
    if (uvXabs <= 0) continue;
    const absA = uvXabs / (GS.N / 4);
    if (absA > 0 && absA < ANGLE / 2 - 1e-9) out.push(absA);
  }
  return Array.from(new Set(out.map((x) => +x.toFixed(12))));
}
function gsRowThetas(z: number, baseNth: number, wallPicket: number): Float64Array {
  const t = Math.max(0, Math.min(1, z / H));
  const vRaw = t * GS.layers * GS.zoom;
  const row = Math.floor(vRaw);
  const v = (vRaw - row - 0.5) * 2.0;
  const rowOffset = (row % 2) * (Math.PI / GS.N) * GS.shift * 2.0;
  const set = new Set<number>();
  const push = (th: number): void => { let x = th % TAU; if (x < 0) x += TAU; set.add(+x.toFixed(10)); };
  for (let i = 0; i < baseNth; i++) push((TAU * i) / baseNth);
  const strapDs = [GS.gap, GS.gap + GS.edge];
  for (let s = 0; s < GS.N; s++) {
    const thC = (s + 0.5) * ANGLE - rowOffset;
    push(thC); push(thC - ANGLE / 2); push(thC + ANGLE / 2);
    for (const D of strapDs) for (const absA of sectorLociAbsA(v, D)) for (const side of [-1, 1]) {
      const aCtr = side * absA; push(thC + aCtr);
      for (let k = 1; k <= wallPicket; k++) {
        const dA = (k / (wallPicket + 1)) * (GS.edge / (N_STAR_X * (GS.N / 4))) * 0.5;
        push(thC + aCtr + dA); push(thC + aCtr - dA);
      }
    }
  }
  return Float64Array.from([...set].sort((a, b) => a - b));
}
function gsCrestZ(nZ: number): number[] {
  const set = new Set<number>();
  const push = (z: number): void => { set.add(+Math.max(0, Math.min(H, z)).toFixed(6)); };
  for (let i = 0; i <= nZ; i++) push((H * i) / nZ);
  const nBnd = GS.layers * GS.zoom;
  for (let k = 0; k <= nBnd; k++) { const zb = (H * k) / nBnd; push(zb); push(zb - 0.03); push(zb + 0.03); }
  return [...set].sort((a, b) => a - b);
}
// serration: strap-crease |dLine|=gap centerline -> nearest MESH EDGE (from _ct_gs).
function gsSerrationToMeshEdge(mesh: BuiltMesh, rA: (t: number, z: number) => number, nSampleZ: number): number {
  const { xyz, idx, nF } = mesh; const cell = 0.6;
  const key = (x: number, y: number, z: number): string => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  const grid = new Map<string, number[]>(); const edA: number[] = [], edB: number[] = []; const seen = new Set<number>();
  const addEdge = (a: number, b: number): void => { const lo = Math.min(a, b), hi = Math.max(a, b); const kk = lo * 2 ** 26 + hi; if (seen.has(kk)) return; seen.add(kk); const e = edA.length; edA.push(a); edB.push(b); const mx = (xyz[3 * a] + xyz[3 * b]) / 2, my = (xyz[3 * a + 1] + xyz[3 * b + 1]) / 2, mz = (xyz[3 * a + 2] + xyz[3 * b + 2]) / 2; const k = key(mx, my, mz); const g = grid.get(k); if (g) g.push(e); else grid.set(k, [e]); };
  for (let f = 0; f < nF; f++) { const a = idx[3 * f], b = idx[3 * f + 1], c = idx[3 * f + 2]; addEdge(a, b); addEdge(b, c); addEdge(c, a); }
  const distToSeg = (px: number, py: number, pz: number, a: number, b: number): number => {
    const ax = xyz[3 * a], ay = xyz[3 * a + 1], az = xyz[3 * a + 2], bx = xyz[3 * b], by = xyz[3 * b + 1], bz = xyz[3 * b + 2];
    const dx = bx - ax, dy = by - ay, dz = bz - az; const L2 = dx * dx + dy * dy + dz * dz || 1e-12;
    let tt = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / L2; tt = Math.max(0, Math.min(1, tt));
    const qx = ax + tt * dx, qy = ay + tt * dy, qz = az + tt * dz; return Math.hypot(px - qx, py - qy, pz - qz);
  };
  const errs: number[] = [];
  for (let iz = 1; iz < nSampleZ; iz++) {
    const z = (H * iz) / nSampleZ; const t = z / H; const vRaw = t * GS.layers * GS.zoom; const row = Math.floor(vRaw); const v = (vRaw - row - 0.5) * 2.0; const rowOffset = (row % 2) * (Math.PI / GS.N) * GS.shift * 2.0;
    for (const absA of sectorLociAbsA(v, GS.gap)) for (let s = 0; s < GS.N; s++) for (const side of [-1, 1]) {
      const thC = (s + 0.5) * ANGLE - rowOffset; const th = thC + side * absA;
      const r = rA(th, z); const px = r * Math.cos(th), py = r * Math.sin(th), pz = z;
      const ix0 = Math.floor(px / cell), iy0 = Math.floor(py / cell), iz0 = Math.floor(pz / cell);
      let best = Infinity;
      for (let gx = -1; gx <= 1; gx++) for (let gy = -1; gy <= 1; gy++) for (let gz = -1; gz <= 1; gz++) {
        const g = grid.get(`${ix0 + gx},${iy0 + gy},${iz0 + gz}`); if (!g) continue;
        for (const e of g) { const d = distToSeg(px, py, pz, edA[e], edB[e]); if (d < best) best = d; }
      }
      if (best < Infinity) errs.push(best);
    }
  }
  errs.sort((a, b) => a - b);
  return errs.length ? errs[Math.min(errs.length - 1, Math.floor(0.99 * errs.length))] : 0;
}

function buildGeometricStar(): { style: string; primitive: string; config: string;
  xyz: Float64Array; ut: number[]; idx: Uint32Array; tris: number; serrationMm: number;
  rA: (th: number, z: number) => number; } {
  const style = 'GeometricStar';
  const rA = buildRadiusFn(style as StyleId, {}, DIMS);
  const nZ = 1300, baseNth = 1700, wallPicket = 4;
  plog(`${style}: building feature-conforming nZ=${nZ} baseNth=${baseNth} picket=${wallPicket} ...`);
  const t0 = Date.now();
  const zs = gsCrestZ(nZ);
  const rows: RowSpec[] = zs.map((z) => ({ z, rz: z, thetas: gsRowThetas(z, baseNth, wallPicket), kind: 'sheet' as const }));
  const mesh = buildStructuredWall(rA, H, rows);
  plog(`${style}: built ${mesh.nF} tris in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const serr = gsSerrationToMeshEdge(mesh, rA, 2000);
  return {
    style, primitive: 'feature-conforming structured wall (strap-crease loci + wall picket columns)',
    config: 'ct_z1300_b1700_p4: nZ=1300 baseNth=1700 wallPicket=4 (dense M-square crest-embed)',
    xyz: mesh.xyz, ut: mesh.ut, idx: mesh.idx, tris: mesh.nF, serrationMm: serr, rA,
  };
}

function finalize(built: { style: string; primitive: string; config: string; xyz: Float64Array; ut: number[]; idx: Uint32Array; tris: number; serrationMm: number; rA: (th: number, z: number) => number; }): void {
  const { style, xyz, ut, idx, rA } = built;
  ensureDirs();
  // STL
  const sp = stlPath(style);
  writeBinarySTL(sp, xyz, idx);
  const stlBytes = statSync(sp).size;
  plog(`${style}: STL written ${sp} (${stlBytes} bytes)`);
  // metrics
  const radial = perFaceChordSag(ut, idx, rA, H);
  const q = triangleQualityDistribution({ vertices: xyz, indices: idx });
  const rawNonMan = auditNonManRaw(idx);
  plog(`${style}: radialP99=${radial.worstMm.toFixed(4)} %<20=${q.pctBelow20.toFixed(2)} rawNonMan=${rawNonMan}; brute-anchoring true-3D...`);
  const brute = bruteAnchoredRedPerp(ut, idx, rA, H, { redMm: 0.008, sampleN: 240, radial, coarse: { nTheta: 1536, nZ: 400 }, fine: { nTheta: 3072, nZ: 800 } });
  const true3dP99 = brute.nRed > 0 ? brute.trustedP99 : radial.worstMm;
  plog(`${style}: true3dP99(trusted)=${true3dP99.toFixed(5)} gnP99=${brute.gnP99.toFixed(5)} nRed=${brute.nRed} gnOver=${brute.gnOver}`);
  // TRUE-3D heatmap (brute-anchored steep visual so the red tail shows its TRUE thin-ribbon colour)
  let heatmapNote = '';
  try {
    const anSag = perFaceTrue3DSagAnchored(ut, idx, rA, H, {
      preFilterMm: 0.008, redMm: 0.02, topK: 120,
      coarse: { nTheta: 1024, nZ: 300 }, fine: { nTheta: 2048, nZ: 600 }, radial,
    });
    dumpRenderBins(HEAT_DIR, style, xyz, idx, {
      colors: vertErrColors(anSag.vertErr, 0.01),
      meta: { ruler: 'true3d-anchored', label: `${style} — true-3D vs analytic (brute-anchored, green<=0.01mm)`, worstMm: anSag.worstMm, p99Mm: true3dP99, scaleMm: 0.01, style, primitive: built.primitive },
    });
    heatmapNote = 'steep-EXCLUDE: zero-width cusp, faces CAD-grade — green faces + thin one-facet ribbon on rib/chevron crest';
    plog(`${style}: heatmap dumped (true3d-anchored, scale 0.01mm)`);
  } catch (e) {
    heatmapNote = `heatmap failed: ${String(e)}`;
    plog(`${style}: heatmap FAILED ${String(e)}`);
  }
  manifestRow({
    style, primitive: built.primitive, config: built.config,
    true3dP99Mm: +true3dP99.toFixed(5), serrationMm: +built.serrationMm.toFixed(5),
    pctBelow20: +q.pctBelow20.toFixed(2), rawNonMan, tris: built.tris, stlBytes,
    heatmapNote, family: 'cusp',
  });
}

describe('_pkg_cusp: best20 cusp family (GothicArches, GeometricStar)', () => {
  it.skipIf(process.env.PF_PKG_CUSP !== '1')('GothicArches — CDT-under-M + crest segments', () => {
    if (existsSync(stlPath('GothicArches'))) { plog('GothicArches STL exists — skip'); return; }
    finalize(buildGothic());
    expect(existsSync(stlPath('GothicArches'))).toBeTruthy();
  }, 60 * 60 * 1000);

  it.skipIf(process.env.PF_PKG_CUSP !== '1')('GeometricStar — feature-conforming strap-crease', () => {
    if (existsSync(stlPath('GeometricStar'))) { plog('GeometricStar STL exists — skip'); return; }
    finalize(buildGeometricStar());
    expect(existsSync(stlPath('GeometricStar'))).toBeTruthy();
  }, 60 * 60 * 1000);
});
