// _pf_anisoRuler.test.ts — DEV-ONLY (PF_ANISO=1). METROLOGY: are the perfect-mesher's 0-outlier "slivers" a
// GENUINE defect or an ISOTROPIC-min-angle RULER ARTIFACT on anisotropy-appropriate cells?
//
// NO NEW MESHING. Reuses the two persisted CONFIRMED 0-outlier meshes:
//   Gothic  = research/exchange/_pf_perfect_gothic_msquare/after_mesh.bin  (58365t, iso 56.2% <20°, 0 outliers)
//   GeoStar = research/exchange/_pf_perfect_geostar_brute/refined_mesh.bin (112863t, iso 21.3% <20°, 0 outliers)
// Reconstructs their PatchDefs verbatim (makeGothicPatch(4,12) / makeGeoStarPatch(5,10,0.08)) + the protected
// complex (deterministic) to classify FREE (non-crest) vs crest-incident triangles.
//
// PRE-REGISTERED KILL-CRITERION (registry E-2026-07-05-PERFECT-MESHER-ANISO-RULER, committed BEFORE measuring):
//   ACCEPT+DOCUMENT (isotropic ruler was wrong) iff, on FREE triangles of BOTH styles: M-metric pctBelow20 ≪
//     isotropic pctBelow20 (target M pctBelow20 <~10% AND M median >~30°) AND near-zero-area ≈ 0 AND STL-safe
//     (0 nonMan non-vacuous, 0 zero-area) AND the iso-<20 set is DOMINANTLY high-M-angle (anisotropy-appropriate).
//   REAL DEFECT (scoped one-sided PN) iff free cells degenerate under M too / near-zero-area / slicer-risky.
//
// The M-metric = creaseAligned (II,I)-generalized chord metric (buildCreaseAlignedMetric math, per-centroid).
// CONTROL: M = first-form g must reproduce the isotropic 3D angle (proves the instrument honest). Curvature +
// aspect-direction alignment reported clamp-free so the verdict is not a clamp artifact.
import { describe, it, expect } from 'vitest';
import { mkdirSync, existsSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditNonManByIndex, triangleQualityDistribution, dumpRenderBins } from './labkit';
import { makeGothicPatch, extractProtectedComplex, type PatchDef } from './_pf_perfectMesherLib';
import { makeGeoStarPatch } from './_pf_geostarPatchLib';
import {
  metricsAt, triMinAngleInMetric, tri3DArea, tri3DMinAngle, summarizeAngles, classifyFree,
  crestVertexMaskByProximity, liftUv, metricAnisotropy, type Sym2, type AnisoMetricOpts,
} from './_pf_anisoRulerLib';

const DIR = join(process.cwd(), 'research', 'exchange', '_pf_anisoRuler');
const NDJSON = join(DIR, 'scorecard.ndjson');
const PROG = join(DIR, 'progress.log');
const plog = (m: string): void => { mkdirSync(DIR, { recursive: true }); const l = `[${new Date().toISOString()}] ${m}`; appendFileSync(PROG, l + '\n'); /* eslint-disable-next-line no-console */ console.log(l); };
const rowExists = (key: string): boolean => { if (!existsSync(NDJSON)) return false; return readFileSync(NDJSON, 'utf8').split('\n').filter(Boolean).some((l) => { try { return JSON.parse(l).key === key; } catch { return false; } }); };
const checkpoint = (row: Record<string, unknown>): void => { mkdirSync(DIR, { recursive: true }); appendFileSync(NDJSON, JSON.stringify(row) + '\n'); /* eslint-disable-next-line no-console */ console.log(`[CP ${row.key}] ${JSON.stringify(row).slice(0, 400)}`); };

// mesh bin loader: header (nV,nT[,passes,capped]) then uv doubles + tris int32. Auto-detects 8- vs 16-byte header.
function loadBin(path: string): { uv: number[]; tris: number[] } | null {
  if (!existsSync(path)) return null;
  const buf = readFileSync(path);
  const nV = buf.readInt32LE(0), nT = buf.readInt32LE(4);
  const size16 = 16 + nV * 16 + nT * 12, size8 = 8 + nV * 16 + nT * 12;
  const off = buf.length === size16 ? 16 : (buf.length === size8 ? 8 : -1);
  if (off < 0) return null;
  const uv: number[] = new Array(nV * 2); const tris: number[] = new Array(nT * 3);
  let o = off; for (let i = 0; i < nV * 2; i++) { uv[i] = buf.readDoubleLE(o); o += 8; }
  for (let i = 0; i < nT * 3; i++) { tris[i] = buf.readInt32LE(o); o += 4; }
  return { uv, tris };
}

// watertight audit with a NON-VACUOUS injected-crack control (find an interior edge first, add a 3rd tri to it).
function findInteriorEdge(xyz: Float64Array, tris: number[]): [number, number] | null {
  const n = xyz.length / 3; const q = 1e4;
  const canon = new Int32Array(n); const wmap = new Map<string, number>();
  for (let i = 0; i < n; i++) { const k = `${Math.round(xyz[3 * i] * q)}_${Math.round(xyz[3 * i + 1] * q)}_${Math.round(xyz[3 * i + 2] * q)}`; const h = wmap.get(k); if (h !== undefined) canon[i] = h; else { wmap.set(k, i); canon[i] = i; } }
  const EK = n + 1; const key = (a: number, b: number): number => (a < b ? a * EK + b : b * EK + a);
  const cnt = new Map<number, number>();
  for (let k = 0; k < tris.length; k += 3) { const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue; cnt.set(key(a, b), (cnt.get(key(a, b)) ?? 0) + 1); cnt.set(key(b, c), (cnt.get(key(b, c)) ?? 0) + 1); cnt.set(key(c, a), (cnt.get(key(c, a)) ?? 0) + 1); }
  for (let k = 0; k < tris.length; k += 3) {
    const a = canon[tris[k]], b = canon[tris[k + 1]], c = canon[tris[k + 2]]; if (a === b || b === c || a === c) continue;
    if ((cnt.get(key(a, b)) ?? 0) === 2) return [tris[k], tris[k + 1]];
    if ((cnt.get(key(b, c)) ?? 0) === 2) return [tris[k + 1], tris[k + 2]];
    if ((cnt.get(key(c, a)) ?? 0) === 2) return [tris[k + 2], tris[k]];
  }
  return null;
}
function watertight(xyz: Float64Array, tris: number[], uvLen: number): { nonMan: number; injected: number; nonVacuous: boolean } {
  const nonMan = auditNonManByIndex(xyz, tris, 1e-4);
  const ie = findInteriorEdge(xyz, tris);
  const a0 = ie ? ie[0] : tris[0], b0 = ie ? ie[1] : tris[1]; const vNew = uvLen / 2;
  const xyz2 = new Float64Array(xyz.length + 3); xyz2.set(xyz);
  xyz2[3 * vNew] = xyz[3 * a0] + 3; xyz2[3 * vNew + 1] = xyz[3 * a0 + 1] + 3; xyz2[3 * vNew + 2] = xyz[3 * a0 + 2];
  const crackTris = tris.slice(); crackTris.push(a0, b0, vNew);
  const injected = auditNonManByIndex(xyz2, crackTris, 1e-4);
  return { nonMan, injected, nonVacuous: injected > nonMan };
}

// ── the metrology core: score one loaded mesh ──
// The anisotropic metric (creaseAligned) clamps are set WIDE so the eigenvalues reflect TRUE curvature anisotropy
// (not the clamp): tolMm=0.01 (the fidelity target the mesh was built to), hMin 0.001 / hMax 50 (so a low-curv
// along-crest direction is NOT floored and a high-curv across-crest one is NOT capped over the free-tri size range).
const ANISO: AnisoMetricOpts = { tolMm: 0.01, hMin: 0.001, hMax: 50 };

interface StyleScore {
  key: string; style: string; tris: number; freeTris: number; crestTris: number;
  // isotropic (3D) ruler — the reported 56%/21.3%
  isoAll: ReturnType<typeof triangleQualityDistribution>;
  isoFree: ReturnType<typeof summarizeAngles>;
  // CONTROL: first-form-metric angle on free tris — must ≈ isoFree
  ctrlFree: ReturnType<typeof summarizeAngles>;
  // TEST: creaseAligned anisotropic-metric angle on free tris
  anisoFree: ReturnType<typeof summarizeAngles>;
  // AREA (mm²) of free tris + zero-area / degenerate counts
  areaMinMm2: number; areaP1Mm2: number; areaMedianMm2: number;
  zeroAreaFree: number; belowPrinterFloorFree: Record<string, number>;
  // surface anisotropy the FREE cells actually experience (diagnoses whether creaseAligned's ratio is extreme):
  // first-form (√(G/E)-class, the parametrization stretch the LITERAL M=g/h² sees) + creaseAligned (II,I) ratio.
  firstFormAnisoMedian: number; firstFormAnisoP95: number;
  creaseAnisoMedian: number; creaseAnisoP95: number; creaseAnisoClampedFrac: number;
  // STL-safety (whole mesh)
  watertightNonMan: number; nonManInjected: number; nonVacuous: boolean; zeroAreaAll: number; dupVertFacesAll: number;
  // the iso-<20 correlation: of free tris with isotropic minAngle <20°, how many are high-M-angle (appropriate)?
  isoBelow20FreeCount: number;
  isoBelow20_MgeThresh: Record<string, number>; // M-metric angle >= {20,30}
  isoBelow20_alignedFrac: number; // fraction whose longest edge aligns with the low-curvature (large-target) axis
  isoBelow20_medianAniso: number; // median surface anisotropy ratio of the iso-<20 free set
}

function scoreMesh(key: string, style: string, patch: PatchDef, loaded: { uv: number[]; tris: number[] }, complexUv: number[], constraintEdges: Array<[number, number]>): StyleScore {
  const { rA, H } = patch;
  const uv = loaded.uv, tris = loaded.tris;
  const xyz = liftUv(patch, uv);
  const nF = tris.length / 3;

  // whole-mesh isotropic distribution (matches the reported ruler) + STL-safety
  const isoAll = triangleQualityDistribution({ vertices: Float32Array.from(xyz), indices: Int32Array.from(tris) });
  const wt = watertight(xyz, tris, uv.length);
  let zeroAreaAll = 0, dupVertFacesAll = 0;
  for (let f = 0; f < nF; f++) {
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    if (a === b || b === c || a === c) { dupVertFacesAll++; continue; }
    if (tri3DArea(xyz, a, b, c) < 1e-9) zeroAreaAll++;
  }

  // FREE classification by (u,t) proximity to a locked crest edge
  const crestMask = crestVertexMaskByProximity(uv, patch, complexUv, constraintEdges, 0.03);
  const free = classifyFree(tris, crestMask);
  let freeTris = 0; for (let f = 0; f < nF; f++) if (free[f]) freeTris++;

  // per-free-triangle: iso angle, control (first-form) angle, aniso (creaseAligned) angle, area, alignment
  const isoFreeA: number[] = [], ctrlFreeA: number[] = [], anisoFreeA: number[] = [], areaFree: number[] = [];
  let isoFreeDeg = 0, ctrlFreeDeg = 0, anisoFreeDeg = 0, zeroAreaFree = 0;
  const floorLevels = [0.0004, 0.0016, 0.0025]; // mm²: ~ (0.02mm)², (0.04mm)², (0.05mm)² — resin-printer voxel-area floors
  const belowFloor: Record<string, number> = {}; for (const fl of floorLevels) belowFloor[String(fl)] = 0;
  // surface-anisotropy-experienced-by-free-cells accumulators
  const ffAniso: number[] = [], caAniso: number[] = []; let caClamped = 0;
  const CLAMP_RATIO = Math.sqrt((1 / (ANISO.hMin * ANISO.hMin)) / (1 / (ANISO.hMax * ANISO.hMax))); // = hMax/hMin
  // iso-<20 correlation accumulators
  let isoB20 = 0, isoB20_Mge20 = 0, isoB20_Mge30 = 0, isoB20_aligned = 0; const isoB20_aniso: number[] = [];

  for (let f = 0; f < nF; f++) {
    if (!free[f]) continue;
    const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
    // seam-imaged centroid (u,t)
    let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
    while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
    const um = (ua + ub + uc) / 3, tm = (ta + tb + tc) / 3;
    const M = metricsAt(rA, H, um, tm, ANISO);

    const isoAng = tri3DMinAngle(xyz, a, b, c);
    const ctrlAng = triMinAngleInMetric(M.firstForm, ua, ta, ub, tb, uc, tc);   // first-form control (≡ iso)
    const anisoAng = triMinAngleInMetric(M.creaseAligned, ua, ta, ub, tb, uc, tc); // creaseAligned test
    const area = tri3DArea(xyz, a, b, c);

    if (isoAng > 0) isoFreeA.push(isoAng); else isoFreeDeg++;
    if (ctrlAng > 0) ctrlFreeA.push(ctrlAng); else ctrlFreeDeg++;
    if (anisoAng > 0) anisoFreeA.push(anisoAng); else anisoFreeDeg++;
    areaFree.push(area);
    if (area < 1e-9) zeroAreaFree++;
    for (const fl of floorLevels) if (area < fl) belowFloor[String(fl)]++;
    // anisotropy the free cell's centroid sees (first-form = literal M=g stretch; creaseAligned = (II,I) chord ratio)
    const ffa = metricAnisotropy(M.firstForm), caa = metricAnisotropy(M.creaseAligned);
    ffAniso.push(ffa); caAniso.push(caa);
    if (caa >= CLAMP_RATIO * 0.999) caClamped++; // creaseAligned ratio pinned at the hMax/hMin clamp (near-C0 curvature)

    if (isoAng > 0 && isoAng < 20) {
      isoB20++;
      if (anisoAng >= 20) isoB20_Mge20++;
      if (anisoAng >= 30) isoB20_Mge30++;
      isoB20_aniso.push(M.anisotropy);
      // alignment: does the triangle's LONGEST edge run ALONG the low-curvature (large-target-size) metric axis?
      // low-curvature axis = the eigenvector of creaseAligned with the SMALLER eigenvalue (largest target length).
      const eig = eigCreaseAxis(M.creaseAligned); // [ex,ey] of the smaller-eigenvalue (long-target) direction, in (u,t) mm-agnostic chart
      // longest edge direction in (u,t)
      const edges: Array<[number, number]> = [[ub - ua, tb - ta], [uc - ub, tc - tb], [ua - uc, ta - tc]];
      let li = 0, ll = -1; for (let e = 0; e < 3; e++) { const L2 = edges[e][0] * edges[e][0] + edges[e][1] * edges[e][1]; if (L2 > ll) { ll = L2; li = e; } }
      const ex = edges[li][0], ey = edges[li][1]; const eln = Math.hypot(ex, ey) || 1;
      const cosAlign = Math.abs((ex * eig[0] + ey * eig[1]) / eln); // |cos| — aligned if near 1
      if (cosAlign > Math.cos((30 * Math.PI) / 180)) isoB20_aligned++; // within 30° of the long-target axis
    }
  }

  const areaSorted = Float64Array.from(areaFree).sort();
  const apc = (q: number): number => areaSorted.length ? areaSorted[Math.min(areaSorted.length - 1, Math.floor(q * areaSorted.length))] : 0;
  const medAniso = isoB20_aniso.length ? Float64Array.from(isoB20_aniso).sort()[Math.floor(isoB20_aniso.length / 2)] : 0;
  const pctl = (arr: number[], q: number): number => { if (!arr.length) return 0; const s = Float64Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

  return {
    key, style, tris: nF, freeTris, crestTris: nF - freeTris,
    isoAll,
    isoFree: summarizeAngles(isoFreeA, isoFreeDeg),
    ctrlFree: summarizeAngles(ctrlFreeA, ctrlFreeDeg),
    anisoFree: summarizeAngles(anisoFreeA, anisoFreeDeg),
    areaMinMm2: +apc(0).toFixed(7), areaP1Mm2: +apc(0.01).toFixed(6), areaMedianMm2: +apc(0.5).toFixed(6),
    zeroAreaFree, belowPrinterFloorFree: belowFloor,
    firstFormAnisoMedian: +pctl(ffAniso, 0.5).toFixed(2), firstFormAnisoP95: +pctl(ffAniso, 0.95).toFixed(2),
    creaseAnisoMedian: +pctl(caAniso, 0.5).toFixed(2), creaseAnisoP95: +pctl(caAniso, 0.95).toFixed(1),
    creaseAnisoClampedFrac: freeTris ? +(caClamped / freeTris).toFixed(3) : 0,
    watertightNonMan: wt.nonMan, nonManInjected: wt.injected, nonVacuous: wt.nonVacuous, zeroAreaAll, dupVertFacesAll,
    isoBelow20FreeCount: isoB20,
    isoBelow20_MgeThresh: { '20': isoB20_Mge20, '30': isoB20_Mge30 },
    isoBelow20_alignedFrac: isoB20 ? +(isoB20_aligned / isoB20).toFixed(3) : 0,
    isoBelow20_medianAniso: +medAniso.toFixed(2),
  };
}

/** Long-target (small-eigenvalue) eigenvector of a symmetric-2x2 metric, as a unit (u,t) direction. */
function eigCreaseAxis(M: Sym2): [number, number] {
  const a = M[0], b = M[1], c = M[2];
  const tr = a + c, det = a * c - b * b; const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const lSmall = tr / 2 - disc; // smaller eigenvalue → largest target edge length → the long axis
  let ex: number, ey: number;
  if (Math.abs(b) > 1e-300) { ex = b; ey = lSmall - a; const el = Math.hypot(ex, ey); if (el > 1e-300) { ex /= el; ey /= el; } else { ex = 1; ey = 0; } }
  else if (a <= c) { ex = 1; ey = 0; } else { ex = 0; ey = 1; }
  return [ex, ey];
}

describe('pf-aniso-ruler: are the 0-outlier slivers a genuine defect or an isotropic-ruler artifact?', () => {
  // NOTE (diagnosed via _diag_gothicprefix): the persisted Gothic after_mesh.bin has t-span 8mm (tLo 0.71667 /
  // tHi 0.78333), NOT the M-square probe's default 12mm — so makeGothicPatch(4,8) reproduces its exact bounds +
  // crest prefix (verified: BMROW 0-3 C==M to 6 decimals). GeoStar makeGeoStarPatch(5,10,0.08) aligned=true.
  const styles: Array<{ key: string; style: string; bin: string; patch: () => PatchDef; boundsMatch: boolean }> = [
    { key: 'gothic', style: 'GothicArches', bin: join(process.cwd(), 'research', 'exchange', '_pf_perfect_gothic_msquare', 'after_mesh.bin'), patch: () => makeGothicPatch(4, 8), boundsMatch: true },
    { key: 'geostar', style: 'GeometricStar', bin: join(process.cwd(), 'research', 'exchange', '_pf_perfect_geostar_brute', 'refined_mesh.bin'), patch: () => makeGeoStarPatch(5, 10, 0.08), boundsMatch: false },
  ];

  for (const st of styles) {
    it.skipIf(process.env.PF_ANISO !== '1')(`${st.key}: M-metric vs isotropic on FREE triangles of the 0-outlier mesh`, () => {
      if (rowExists(st.key)) { plog(`${st.key} exists, skip`); return; }
      const loaded = loadBin(st.bin);
      if (!loaded) throw new Error(`missing mesh bin: ${st.bin}`);
      let patch = st.patch();
      // Derive the mesh (u,t) bbox and (for robustness) build the crest complex on a bounds-MATCHED patch so the
      // constraint edges trace the SAME crest curves the mesh was built on, independent of any zBand guess. The
      // crest loci are a property of rA over the (u,t) window, so bounds-matching makes the crest classification
      // exact even when the persisted mesh used non-default patch params.
      let uLo = 1e9, uHi = -1e9, tLo = 1e9, tHi = -1e9;
      for (let i = 0; i < loaded.uv.length / 2; i++) { const u = loaded.uv[2 * i], t = loaded.uv[2 * i + 1]; if (u < uLo) uLo = u; if (u > uHi) uHi = u; if (t < tLo) tLo = t; if (t > tHi) tHi = t; }
      patch = { ...patch, uLo, uHi, tLo, tHi };
      // rebuild the protected complex to get the constraint edges + complex uv (deterministic; SAME scan params as
      // the CONFIRMED run: Gothic N_ROW=N_COL=200 MIN_AMP=0.03; GeoStar N_ROW=N_COL=260 MIN_AMP=0.03).
      const nRow = st.key === 'geostar' ? 260 : 200, nCol = nRow;
      const pc = extractProtectedComplex(patch, nRow, nCol, 0.03);
      // ALIGNMENT GUARD: the mesh's crest PREFIX must match the rebuilt complex (same patch/params).
      let aligned = true; for (let i = 0; i < Math.min(pc.uv.length / 2, 20); i++) { if (2 * i + 1 < loaded.uv.length && (Math.abs(pc.uv[2 * i] - loaded.uv[2 * i]) > 1e-9 || Math.abs(pc.uv[2 * i + 1] - loaded.uv[2 * i + 1]) > 1e-9)) aligned = false; }
      plog(`[${st.key}] loaded ${loaded.uv.length / 2}v ${loaded.tris.length / 3}t | bbox u[${uLo.toFixed(4)},${uHi.toFixed(4)}] t[${tLo.toFixed(4)},${tHi.toFixed(4)}] | complex cEdges=${pc.constraintEdges.length} prefixAligned=${aligned}`);

      const s = scoreMesh(st.key, st.style, patch, loaded, pc.uv, pc.constraintEdges);
      const row: Record<string, unknown> = { ...s, alignedPrefix: aligned };
      writeFileSync(join(DIR, `${st.key}.json`), JSON.stringify(row, null, 2));
      checkpoint(row);
      plog(`[${st.key}] FREE ${s.freeTris}/${s.tris} | ISO free pct<20=${s.isoFree.pctBelow20}% med=${s.isoFree.medianDeg}° | CTRL(1st-form) pct<20=${s.ctrlFree.pctBelow20}% med=${s.ctrlFree.medianDeg}° | ANISO(creaseAlign) pct<20=${s.anisoFree.pctBelow20}% med=${s.anisoFree.medianDeg}° | ffAniso med=${s.firstFormAnisoMedian} p95=${s.firstFormAnisoP95} | caAniso med=${s.creaseAnisoMedian} p95=${s.creaseAnisoP95} clamped=${s.creaseAnisoClampedFrac} | zeroAreaFree=${s.zeroAreaFree} areaMin=${s.areaMinMm2}mm² | iso<20 N=${s.isoBelow20FreeCount} Mge20=${s.isoBelow20_MgeThresh['20']} aligned=${s.isoBelow20_alignedFrac} | nonVac=${s.nonVacuous} zeroAll=${s.zeroAreaAll}`);
      expect(s.tris).toBeGreaterThan(0);
    }, 60 * 60 * 1000);
  }

  // ── RENDER + worst-sliver geometry (PF_ANISORENDER=1). Reuses the load+classify; colours FREE tris by iso
  //    min-angle (red<20 / yellow 20-30 / green>30), crest tris grey. Dumps the worst-60 free slivers' geometry
  //    (3D edge lengths, aspect, along-vs-across-crest orientation) so the picture + the numbers agree on WHAT the
  //    "slivers" are (along-crest-flat anisotropy-appropriate cells vs genuine cross-curvature needles). ──
  for (const st of styles) {
    it.skipIf(process.env.PF_ANISORENDER !== '1')(`${st.key}: render free-sliver map + worst-sliver geometry`, () => {
      const loaded = loadBin(st.bin); if (!loaded) throw new Error(`missing ${st.bin}`);
      let patch = st.patch();
      let uLo = 1e9, uHi = -1e9, tLo = 1e9, tHi = -1e9;
      for (let i = 0; i < loaded.uv.length / 2; i++) { const u = loaded.uv[2 * i], t = loaded.uv[2 * i + 1]; if (u < uLo) uLo = u; if (u > uHi) uHi = u; if (t < tLo) tLo = t; if (t > tHi) tHi = t; }
      patch = { ...patch, uLo, uHi, tLo, tHi };
      const nRow = st.key === 'geostar' ? 260 : 200;
      const pc = extractProtectedComplex(patch, nRow, nRow, 0.03);
      const uv = loaded.uv, tris = loaded.tris; const xyz = liftUv(patch, uv); const nF = tris.length / 3;
      const crestMask = crestVertexMaskByProximity(uv, patch, pc.uv, pc.constraintEdges, 0.03);
      const free = classifyFree(tris, crestMask);
      // per-vertex colour: worst incident FREE-triangle min-angle → ramp; crest verts grey
      const worstInc = new Float64Array(uv.length / 2).fill(90);
      const wSliver: Array<{ f: number; iso: number; edges: [number, number, number]; aspect: number; alongDeg: number; z: number; rad: number; distCrestMm: number }> = [];
      for (let f = 0; f < nF; f++) {
        if (!free[f]) continue;
        const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
        const iso = tri3DMinAngle(xyz, a, b, c);
        if (iso < worstInc[a]) worstInc[a] = iso; if (iso < worstInc[b]) worstInc[b] = iso; if (iso < worstInc[c]) worstInc[c] = iso;
      }
      const col = new Float32Array((uv.length / 2) * 3);
      for (let i = 0; i < uv.length / 2; i++) {
        if (crestMask[i]) { col[3 * i] = 0.5; col[3 * i + 1] = 0.5; col[3 * i + 2] = 0.55; continue; } // crest grey
        const ang = worstInc[i]; let r: number, g: number, bl: number;
        if (ang < 20) { r = 0.86; g = 0.13; bl = 0.13; } else if (ang < 30) { r = 0.98; g = 0.82; bl = 0.10; } else { r = 0.13; g = 0.62; bl = 0.23; }
        col[3 * i] = r; col[3 * i + 1] = g; col[3 * i + 2] = bl;
      }
      dumpRenderBins(DIR, `${st.key}_slivermap`, xyz, tris, { colors: col, stl: false, meta: { ruler: `iso-minAngle (free: red<20 / yellow20-30 / green>30; crest grey)`, style: st.style } });
      // worst-60 free slivers: 3D edges, aspect, ALONG-crest orientation (angle between longest edge and the
      // crest tangent = the nearest constraint-edge direction). alongDeg≈0 ⇒ elongated ALONG the crest.
      const segDir = (px: number, py: number): [number, number, number] => {
        // nearest constraint segment (mm) + its unit direction + distance
        let best = Infinity, dx = 1, dy = 0;
        for (const [ia, ib] of pc.constraintEdges) {
          let ua = pc.uv[2 * ia], ta = pc.uv[2 * ia + 1], ub = pc.uv[2 * ib], tb = pc.uv[2 * ib + 1];
          while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1;
          const x0 = ua * patch.arcPerU, y0 = ta * patch.H, x1 = ub * patch.arcPerU, y1 = tb * patch.H;
          const ex = x1 - x0, ey = y1 - y0; const L2 = ex * ex + ey * ey; let tt = L2 > 0 ? ((px - x0) * ex + (py - y0) * ey) / L2 : 0; if (tt < 0) tt = 0; else if (tt > 1) tt = 1;
          const cx = x0 + tt * ex, cy = y0 + tt * ey; const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
          if (d2 < best) { best = d2; const el = Math.hypot(ex, ey) || 1; dx = ex / el; dy = ey / el; }
        }
        return [dx, dy, Math.sqrt(best)];
      };
      const cands: Array<{ f: number; iso: number }> = [];
      for (let f = 0; f < nF; f++) { if (!free[f]) continue; const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2]; const iso = tri3DMinAngle(xyz, a, b, c); if (iso > 0 && iso < 20) cands.push({ f, iso }); }
      cands.sort((x, y) => x.iso - y.iso);
      for (const { f, iso } of cands.slice(0, 60)) {
        const a = tris[3 * f], b = tris[3 * f + 1], c = tris[3 * f + 2];
        const e = (i: number, j: number): number => Math.hypot(xyz[3 * i] - xyz[3 * j], xyz[3 * i + 1] - xyz[3 * j + 1], xyz[3 * i + 2] - xyz[3 * j + 2]);
        const eAB = e(a, b), eBC = e(b, c), eCA = e(c, a); const longest = Math.max(eAB, eBC, eCA);
        const area = tri3DArea(xyz, a, b, c); const aspect = area > 1e-12 ? (longest * longest * Math.sqrt(3)) / (4 * area) : Infinity;
        // longest edge direction in the mm chart
        let ua = uv[2 * a], ub = uv[2 * b], uc = uv[2 * c]; const ta = uv[2 * a + 1], tb = uv[2 * b + 1], tc = uv[2 * c + 1];
        while (ub - ua > 0.5) ub -= 1; while (ua - ub > 0.5) ub += 1; while (uc - ua > 0.5) uc -= 1; while (ua - uc > 0.5) uc += 1;
        const emm: Array<[number, number, number]> = [[(ub - ua) * patch.arcPerU, (tb - ta) * patch.H, eAB], [(uc - ub) * patch.arcPerU, (tc - tb) * patch.H, eBC], [(ua - uc) * patch.arcPerU, (ta - tc) * patch.H, eCA]];
        let li = 0, ll = -1; for (let k = 0; k < 3; k++) if (emm[k][2] > ll) { ll = emm[k][2]; li = k; }
        const lx = emm[li][0], ly = emm[li][1]; const ln = Math.hypot(lx, ly) || 1;
        const um = (ua + ub + uc) / 3, tm = (ta + tb + tc) / 3; const [dx, dy, dCrest] = segDir(um * patch.arcPerU, tm * patch.H);
        let cosA = Math.abs((lx * dx + ly * dy) / ln); if (cosA > 1) cosA = 1;
        const alongDeg = (Math.acos(cosA) * 180) / Math.PI; // 0 ⇒ longest edge ALONG the crest tangent
        const cx = (xyz[3 * a] + xyz[3 * b] + xyz[3 * c]) / 3, cy = (xyz[3 * a + 1] + xyz[3 * b + 1] + xyz[3 * c + 1]) / 3, cz = (xyz[3 * a + 2] + xyz[3 * b + 2] + xyz[3 * c + 2]) / 3;
        wSliver.push({ f, iso: +iso.toFixed(2), edges: [+eAB.toFixed(4), +eBC.toFixed(4), +eCA.toFixed(4)], aspect: +aspect.toFixed(1), alongDeg: +alongDeg.toFixed(1), z: +cz.toFixed(2), rad: +Math.hypot(cx, cy).toFixed(2), distCrestMm: +dCrest.toFixed(3) });
      }
      // summary of the worst-60: median alongDeg (≈0 ⇒ along-crest artifact; ≈45+ ⇒ not aligned), median dist-to-crest
      const alongs = wSliver.map((w) => w.alongDeg).sort((x, y) => x - y); const dists = wSliver.map((w) => w.distCrestMm).sort((x, y) => x - y);
      const medAlong = alongs.length ? alongs[Math.floor(alongs.length / 2)] : 0, medDist = dists.length ? dists[Math.floor(dists.length / 2)] : 0;
      writeFileSync(join(DIR, `${st.key}_worstslivers.json`), JSON.stringify({ style: st.style, nCandIsoBelow20: cands.length, medianAlongDeg: medAlong, medianDistCrestMm: medDist, worst60: wSliver }, null, 2));
      plog(`[${st.key} render] slivermap dumped; worst-60 free sliver: medianAlongDeg=${medAlong}° (0=along-crest) medianDistCrest=${medDist}mm; nIsoBelow20free=${cands.length}`);
      expect(nF).toBeGreaterThan(0);
    }, 60 * 60 * 1000);
  }
});
