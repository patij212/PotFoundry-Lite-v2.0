// s108AngleBarCalib.ts — CALIBRATE THE ANGULAR BAR AGAINST WHAT A HUMAN CAN ACTUALLY SEE.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY. The campaign's 1 deg bar was INHERITED, never chosen (state doc §0f.4: the implied bar is p50
// 0.666 deg per-facet / ~1.3 deg adjacent-normal, against SOLIDWORKS' 10 deg default, <=5 deg practical,
// <=1 deg premium). §7.1 prices the difference at ~50x in cost and ~4.5x in residual. Nobody has ever
// tied that constant to an observation. This tool exists to let a human do exactly that, once.
//
// AND IT MEASURES A QUANTITY THIS CAMPAIGN HAS NEVER MEASURED. Every angular number here is
// `orientOfFacet`/`normDeg` — facet normal vs ANALYTIC surface normal. That is FIDELITY. A slicer
// preview does not have the analytic surface; it shades from the facet normals in the file, so what the
// eye reads as banding is the angle BETWEEN ADJACENT FACETS. The two dissociate BOTH ways: two facets
// each 3 deg off but tilted the SAME way are mutually flat and INVISIBLE; two facets each 0.5 deg off in
// OPPOSITE directions show a 1 deg crease and are VISIBLE. So `normDeg` cannot answer "can you see it".
// See research/bridge/dihedralRuler.ts.
//
// SECOND VIRTUE: it is ANALYTIC-FREE. It touches only the mesh, so it cannot inherit the rA /
// style-params / tread-vertex confounds that have voided whole runs of the analytic-referenced
// instruments (S101's CelticKnot + BasketWeave NOT-MEASURED; S102/S103's PRECOND radial). It scores any
// STL whatever built it.
//
// WHAT YOU DO WITH THE OUTPUT. Open the two PNGs side by side. The CLAY panel is flat-shaded and is what
// the mesh looks like. The BAND panel colours every facet by its max adjacent dihedral in named bands.
// Find the artefact in CLAY, look at the same place in BAND, read the band. That degree value is the
// bar — measured, not inherited.
//
// Usage: bash research/tools/run-s108-angle-calib.sh
//   env: PF_S108_STL PF_S108_TAG PF_S108_WIN_TH0/TH1 (deg) PF_S108_WIN_Z0/Z1 (mm)
import { mkdirSync } from 'node:fs';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals, areaFractionOver } from '../bridge/dihedralRuler';
import { dumpRenderBins } from '../bridge/labkit';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const STL = process.env.PF_S108_STL ?? 'research/exchange/_strataConformBisect/gothicarches_ring_DS-HT_S39CTL.stl';
const TAG = process.env.PF_S108_TAG ?? 'GOTH';
const OUTDIR = 'research/exchange/_strataConformBisect/anglecalib';
// A window small enough that per-facet banding is resolvable on screen. Defaults to one 30 deg sector
// (the fundamental domain: 12-fold symmetry, see the S24i2 micro probe) over a 12 mm tall band.
const WIN_TH0 = envF('PF_S108_WIN_TH0', 0);
const WIN_TH1 = envF('PF_S108_WIN_TH1', 30);
const WIN_Z0 = envF('PF_S108_WIN_Z0', 74);
const WIN_Z1 = envF('PF_S108_WIN_Z1', 86);

/** Named bands, in DEGREES. Chosen to bracket every bar anyone has proposed for this project. */
const BANDS: Array<{ hi: number; name: string; rgb: [number, number, number] }> = [
  { hi: 0.5, name: '< 0.5', rgb: [0.16, 0.20, 0.28] },   // slate — below any proposed bar
  { hi: 1.0, name: '0.5-1', rgb: [0.13, 0.55, 0.55] },   // teal  — the campaign's inherited bar
  { hi: 2.0, name: '1-2', rgb: [0.20, 0.70, 0.25] },     // green
  { hi: 5.0, name: '2-5', rgb: [0.90, 0.80, 0.15] },     // yellow — "practical" CAD territory
  { hi: 10.0, name: '5-10', rgb: [0.95, 0.50, 0.10] },   // orange — SOLIDWORKS default territory
  { hi: Infinity, name: '> 10', rgb: [0.85, 0.12, 0.12] }, // red
];

const bandOf = (deg: number): number => {
  for (let i = 0; i < BANDS.length; i += 1) if (deg < BANDS[i].hi) return i;
  return BANDS.length - 1;
};

mkdirSync(OUTDIR, { recursive: true });

log('===== S108 ANGLE-BAR CALIBRATION — the ADJACENT-FACET dihedral (what a preview shades) =====');
log(`stl ${STL}`);
log(`tag ${TAG}   outdir ${OUTDIR}`);
log('');
log('⚠ THIS IS NOT `normDeg`. normDeg = facet vs ANALYTIC normal (fidelity). This = facet vs NEIGHBOUR');
log('  (visibility). They dissociate in both directions; only this one predicts what you can see.');
log('');

const t0 = Date.now();
const { xyz, nTri } = readMeshFloat64(STL, false);
log(`read ${nTri} facets in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// the STL reader returns a flat soup: vertex 3t+k of facet t. Indices are the identity.
const indices = new Uint32Array(nTri * 3);
for (let i = 0; i < indices.length; i += 1) indices[i] = i;

const t1 = Date.now();
const d = facetDihedrals(xyz, indices);
log(`dihedrals in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
log('');
log(`TOPOLOGY   interior ${d.interiorEdges}   boundary ${d.boundaryEdges}   non-manifold ${d.nonManifoldEdges}   inconsistent-winding ${d.inconsistentEdges}`);
if (d.boundaryEdges > 0) log('  ⚠ boundary edges > 0 — this mesh is open (a patch, a ring without caps, or a crack). Not an error, but say so when quoting.');
if (d.nonManifoldEdges > 0) log('  ⚠ non-manifold edges present — those edges are NOT scored.');

let totalArea = 0;
for (let f = 0; f < d.areaMm2.length; f += 1) totalArea += d.areaMm2[f];
log(`total area ${totalArea.toFixed(1)} mm^2 over ${nTri} facets`);
log('');

// ── THE LADDER. AREA-weighted, because count over-states defect area 13-184x in this project. ──
log('── AREA-WEIGHTED FRACTION OF THE SURFACE OVER EACH ANGULAR BAR ──');
log('  bar(deg)     over-bar AREA %      over-bar COUNT %   (count shown ONLY to expose the gap)');
const LADDER = [0.25, 0.5, 1, 2, 3, 5, 10, 20, 45];
for (const deg of LADDER) {
  const thr = (deg * Math.PI) / 180;
  const fa = areaFractionOver(d, thr);
  let cnt = 0;
  for (let f = 0; f < d.perFacetMaxRad.length; f += 1) if (d.perFacetMaxRad[f] > thr) cnt += 1;
  const fc = cnt / nTri;
  log(`  ${deg.toFixed(2).padStart(6)}       ${(fa * 100).toFixed(4).padStart(10)}          ${(fc * 100).toFixed(4).padStart(10)}`);
}
log('');

// ── AREA-WEIGHTED PERCENTILES. A bare max is banned in this project; the distribution is the answer. ──
const order = Array.from({ length: nTri }, (_, i) => i).sort((a, b) => d.perFacetMaxRad[a] - d.perFacetMaxRad[b]);
const pct = (p: number): number => {
  let acc = 0; const target = totalArea * p;
  for (const f of order) { acc += d.areaMm2[f]; if (acc >= target) return (d.perFacetMaxRad[f] * 180) / Math.PI; }
  return (d.perFacetMaxRad[order[order.length - 1]] * 180) / Math.PI;
};
log('── AREA-WEIGHTED DIHEDRAL PERCENTILES (deg) ──');
log(`  p50 ${pct(0.5).toFixed(3)}   p90 ${pct(0.9).toFixed(3)}   p99 ${pct(0.99).toFixed(3)}   p99.9 ${pct(0.999).toFixed(3)}`);
let maxDeg = 0;
for (let f = 0; f < d.perFacetMaxRad.length; f += 1) if (d.perFacetMaxRad[f] > maxDeg) maxDeg = d.perFacetMaxRad[f];
log(`  max ${((maxDeg * 180) / Math.PI).toFixed(3)}  ← reported, NEVER a verdict on its own`);
log('');

// ══════════════ WHAT IS THE HIGH-ANGLE CLASS? (the question the ladder raises but cannot answer) ══════════════
// A tight cluster of adjacent-facet dihedrals near 180 deg is NOT a curvature tail — it means neighbours are
// nearly BACK-TO-BACK. Three candidate explanations, and they need different fixes, so name which one:
//   (a) DUPLICATE facets (the same triangle stored twice, opposite winding) — shares all 3 edges with its
//       partner. A writer bug. NOTE it reads as CONSISTENT winding by the traversal test, so the winding
//       counter alone cannot catch it.
//   (b) KNIFE-EDGE geometry — a V-groove whose flanks close to a near-zero interior angle. Real surface.
//   (c) DEGENERATE SLIVERS whose normals are numerical noise (S98's needle class).
const DIAG_DEG = envF('PF_S108_DIAG_DEG', 45);
const diagThr = (DIAG_DEG * Math.PI) / 180;
{
  // count shared edges per facet PAIR, so a duplicate (3 shared) separates from a crease (1 shared)
  const pairKey = new Map<number, number>();
  for (let e = 0; e < d.edgeAngRad.length; e += 1) {
    if (d.edgeAngRad[e] <= diagThr) continue;
    const a = d.edgeF1[e]; const b = d.edgeF2[e];
    const lo = a < b ? a : b; const hi = a < b ? b : a;
    const k = lo * 4_194_304 + hi;              // facet ids < 2^22 for this mesh class
    pairKey.set(k, (pairKey.get(k) ?? 0) + 1);
  }
  let share1 = 0; let share2 = 0; let share3 = 0;
  for (const n of pairKey.values()) { if (n >= 3) share3 += 1; else if (n === 2) share2 += 1; else share1 += 1; }

  // shape + area of the offending facets
  const minAngleOf = (f: number): number => {
    const p = [0, 1, 2].map((k) => [xyz[f * 9 + k * 3], xyz[f * 9 + k * 3 + 1], xyz[f * 9 + k * 3 + 2]]);
    const L = [0, 1, 2].map((k) => Math.hypot(
      p[(k + 1) % 3][0] - p[k][0], p[(k + 1) % 3][1] - p[k][1], p[(k + 1) % 3][2] - p[k][2],
    ));
    let mn = Math.PI;
    for (let k = 0; k < 3; k += 1) {
      const a = L[k]; const b = L[(k + 1) % 3]; const c = L[(k + 2) % 3];
      if (a <= 0 || b <= 0) continue;
      let cv = (a * a + b * b - c * c) / (2 * a * b);
      if (cv > 1) cv = 1; else if (cv < -1) cv = -1;
      const ang = Math.acos(cv);
      if (ang < mn) mn = ang;
    }
    return (mn * 180) / Math.PI;
  };
  const hot: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (d.perFacetMaxRad[f] > diagThr) hot.push(f);
  const hotAngles = hot.map(minAngleOf).sort((a, b) => a - b);
  const allAngles = Array.from({ length: Math.min(nTri, 50_000) }, (_, i) => minAngleOf(Math.floor((i * nTri) / Math.min(nTri, 50_000)))).sort((a, b) => a - b);
  const med = (arr: number[]): number => (arr.length === 0 ? NaN : arr[Math.floor(arr.length / 2)]);
  let hotArea = 0; for (const f of hot) hotArea += d.areaMm2[f];
  let zMin = Infinity; let zMax = -Infinity;
  for (const f of hot) for (let k = 0; k < 3; k += 1) { const z = xyz[f * 9 + k * 3 + 2]; if (z < zMin) zMin = z; if (z > zMax) zMax = z; }

  log(`── WHAT IS THE >${DIAG_DEG} deg CLASS? ──`);
  log(`  facets ${hot.length} (${((hot.length / nTri) * 100).toFixed(4)}% count, ${((hotArea / totalArea) * 100).toFixed(4)}% area)`);
  log(`  offending PAIRS by shared-edge count:  1 edge (crease) ${share1}   2 edges ${share2}   3 edges (DUPLICATE FACET) ${share3}`);
  log(`  minAngle median: hot ${med(hotAngles).toFixed(2)} deg  vs  whole-mesh ${med(allAngles).toFixed(2)} deg  ⇒ ${med(hotAngles) < 5 ? 'SLIVER class' : 'WELL-SHAPED — not S98 needles'}`);
  log(`  z extent of the class: ${zMin.toFixed(2)} .. ${zMax.toFixed(2)} mm  (mesh is z 0..120)`);
  log(`  ⇒ ${share3 > 0 ? '*** DUPLICATE FACETS PRESENT — a writer/topology bug, not geometry ***' : 'no duplicate facets; the class shares ONE edge ⇒ a genuine crease or fold locus'}`);
  log('');
}

// ── RENDER BINS ──
const colFor = (deg: number): [number, number, number] => BANDS[bandOf(deg)].rgb;

const inWindow = (f: number): boolean => {
  let cx = 0; let cy = 0; let cz = 0;
  for (let k = 0; k < 3; k += 1) { cx += xyz[f * 9 + k * 3]; cy += xyz[f * 9 + k * 3 + 1]; cz += xyz[f * 9 + k * 3 + 2]; }
  cx /= 3; cy /= 3; cz /= 3;
  if (cz < WIN_Z0 || cz > WIN_Z1) return false;
  let th = (Math.atan2(cy, cx) * 180) / Math.PI;
  if (th < 0) th += 360;
  return th >= WIN_TH0 && th <= WIN_TH1;
};

const emit = (name: string, keep: (f: number) => boolean, withColour: boolean): number => {
  const fs: number[] = [];
  for (let f = 0; f < nTri; f += 1) if (keep(f)) fs.push(f);
  const v = new Float32Array(fs.length * 9);
  const c = withColour ? new Float32Array(fs.length * 9) : undefined;
  for (let i = 0; i < fs.length; i += 1) {
    const f = fs[i];
    for (let k = 0; k < 9; k += 1) v[i * 9 + k] = xyz[f * 9 + k];
    if (c) {
      const rgb = colFor((d.perFacetMaxRad[f] * 180) / Math.PI);
      for (let k = 0; k < 3; k += 1) { c[i * 9 + k * 3] = rgb[0]; c[i * 9 + k * 3 + 1] = rgb[1]; c[i * 9 + k * 3 + 2] = rgb[2]; }
    }
  }
  const idx = new Uint32Array(fs.length * 3);
  for (let i = 0; i < idx.length; i += 1) idx[i] = i;
  dumpRenderBins(OUTDIR, name, v, idx, { colors: c, meta: { tris: fs.length, ruler: 'adjacent-facet dihedral' } });
  return fs.length;
};

const all = (): boolean => true;
log('── RENDER BINS ──');
log(`  ${TAG}_clay_all    ${emit(`${TAG}_clay_all`, all, false)} facets   (flat-shaded, no colour: what it LOOKS like)`);
log(`  ${TAG}_band_all    ${emit(`${TAG}_band_all`, all, true)} facets   (banded by adjacent dihedral)`);
log(`  ${TAG}_clay_win    ${emit(`${TAG}_clay_win`, inWindow, false)} facets   (window th ${WIN_TH0}-${WIN_TH1} deg, z ${WIN_Z0}-${WIN_Z1} mm)`);
log(`  ${TAG}_band_win    ${emit(`${TAG}_band_win`, inWindow, true)} facets`);
log('');
log('── BAND LEGEND (degrees of adjacent-facet dihedral) ──');
for (const b of BANDS) log(`  ${b.name.padStart(6)}   rgb(${b.rgb.map((x) => Math.round(x * 255)).join(',')})`);
log('');
log('NEXT: render the bins, then find the artefact in the CLAY panel and read its colour in the BAND panel.');
log(`  NODE_PATH="$PWD/node_modules" PF_RENDER_CELL=1200 node research/render/meshRender.cjs ${OUTDIR}/${TAG}_calib.png ${OUTDIR} 2 ${TAG}_clay_win ${TAG}_band_win`);
log('');
log(`done [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
