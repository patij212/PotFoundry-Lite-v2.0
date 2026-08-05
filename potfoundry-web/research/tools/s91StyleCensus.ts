// s91StyleCensus.ts — *** IS THE CONSTRAINED FLIP A ONE-STYLE LEVER? *** READ-ONLY, ALL 20 STYLES.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PRE-REGISTERED 2026-08-05 BEFORE THE FIRST RUN.  Ledger: research/exchange/_strataConformBisect/
// S91_STYLEFLIP_FINDINGS.md §0.  Nothing below is edited after a number is read.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// WHAT IS BANKED (S80/S81/S82, GothicArches S39CTL): the constrained flip moves orientation over-bar
// AREA 8.131% -> 2.179% (3.73x), honest position on the CHANGED facets 0.458x count / 0.616x area,
// 0 vertices moved, 0 triangles added, topology byte-identical.  It is REFUTED on Voronoi (1.33x) for a
// MEASURED reason: (a) Voronoi carries 32 vertices of facet-degree >= 1000 (worst 2,550 against a median
// of 5) holding 5.62% of the mesh, where every 1-RING operator is defeated, and (b) 124,245 of its facets
// are MIS-ORIENTED near-degenerate caps (aspect3 = diam*perim/4A >= 50), 98.31% of them over bar before
// AND after.  Gothic has ZERO vertices of degree >= 100 and 2 aspect3 >= 50 facets.
//
// H-S91.  THE STYLE REACH OF THE FLIP IS PREDICTED BY MESH STRUCTURE, NOT BY STYLE IDENTITY, and the
//         two structural markers already measured on the two known styles separate the registry:
//
//           HUB-DOMINATED   := (max facet-degree >= 1000) OR (>= 1.0% of incidences on degree >= 100)
//           MISORI-DOMINATED:= (aspect3 >= 50 facets hold >= 25% of the OVER-BAR ORIENTATION AREA)
//           Voronoi-class   := HUB-DOMINATED or MISORI-DOMINATED       (flip predicted <= 1.5x)
//           Gothic-class    := neither                                  (flip predicted >= 2x)
//
// KILL-CRITERIA, fixed before the run (these decide the CAMPAIGN's plan, not just this tool's verdict):
//   K-S91a  >= 60% of the 20 registry styles come out Voronoi-class  =>  *** THE FLIP IS A NICHE LEVER ***
//           and "land it on the remaining styles" is a set of one-to-few.  Report that TODAY.
//   K-S91b  <= 20% come out Voronoi-class  =>  the flip is a GENERAL lever; run the real pass broadly.
//   K-S91c  20-60%  =>  a real split; name both lists and run the pass on the Gothic-class list.
//   K-S91-VAC  The two ANCHORS must reproduce: Voronoi must come out HUB-DOMINATED with max degree 2,550
//           and 124,245 aspect3>=50 facets; Gothic S39CTL must come out hub-free with ~2.  If either
//           anchor misses, THIS TOOL IS BROKEN and no other row in the table is admissible.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THREE INSTRUMENT DECISIONS, STATED BECAUSE THEY DECIDE WHETHER THE TABLE MEANS ANYTHING
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//
// (1) TWO ORIENTATION RULERS, BOTH PRINTED, NEITHER SUBSTITUTED FOR THE OTHER.
//     * `tangExcCentroid` — the s60/landFlipPass ranking key VERBATIM: monotone chord 2*sin(th/2)*diam
//       with the surface normal sampled AT THE FACET CENTROID ONLY, 5 rA evals.  This is the quantity the
//       banked 8.131% -> 2.179% is expressed in, so the table's over-bar column is comparable to the
//       banked result ONLY in this ruler.  It is MEASURED 21.6x LOW as a whole-mesh count (S87: Gothic
//       32,468 published vs 700,486 honest) and is NOT a magnitude.
//     * `orientOfFacet` (research/bridge/orientRuler.ts) — order-k barycentric COVERING with the
//       kink-aware one-sided finite-difference sampler, insets 0.00 and 0.02, exactly s87's construction
//       (k=8, barRad 5deg).  THE HONEST LEVEL.  Run on a golden-stride SAMPLE per style because whole-mesh
//       is 620 rA evals/facet = ~4,200 s over the 14.6 M facets on disk.
//     CONTROL: my sampled Gothic S39CTL inset-0.02 numbers must reproduce s87's WHOLE-MESH row
//     (61.3296% count / 43.49037% area) inside sampling error.  Printed as a gate, not assumed.
//
// (2) THE rA GATE IS THE REGISTRY-DEFAULTS CHECK, and it runs before any orientation number is printed.
//     Every style's radius function is rebuilt HERE from STYLE_REGISTRY defaults at dims H120/Rb40/Rt50
//     — the driver's own `DIMS` (_strataConformBisectS34.test.ts:103).  If the on-disk mesh was built
//     with different params, |hypot(x,y) - rA(theta,z)| at its own vertices is large and EVERY
//     orientation number for that style is void.  p99 <= 0.05 mm => TRUSTED, else the row is printed
//     with its numbers marked VOID rather than quietly wrong.  (Scar: inherited harness params in this
//     repo are routinely de-featured, which makes a style look easy.)
//
// (3) COUNT AND AREA, ALWAYS, NEVER A BARE MAX.  Facet count over-states defect AREA 13-184x in this
//     campaign and count/area/max disagree in DIRECTION.  Every population here carries both.
//
// WHAT THIS TOOL DELIBERATELY DOES NOT DO: it does not flip anything.  The "predicted yield" column is a
// STRUCTURAL prediction from (1)+(2) calibrated on the two styles where the pass has actually been run.
// The real pass (s60ConstrainedFlip ARM=con) is the arm, and it is run separately on whatever this table
// says is worth running.  A prediction is not a measurement and is labelled as one.
//
// Usage:  bash research/tools/run-s91-style-census.sh      (env PF_S91_STEMS="Style:stem,Style:stem,...")
import { STYLE_REGISTRY } from '../../src/styles/registry';
import { buildRadiusFn } from '../bridge/runStyle';
import { canonTheta, dThRaw } from '../bridge/_sweepPredicate';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { orientOfFacet, fdNormals } from '../bridge/orientRuler';
import { mkdirSync, appendFileSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import type { StyleId, StyleDims } from '../../src/geometry/types';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envB = (n: string, d: boolean): boolean => (process.env[n] === undefined ? d : process.env[n] === '1');

const OUTDIR = 'research/exchange/_strataConformBisect/s91style';
const BAR = envF('PF_S91_BAR_UM', 10);            // the campaign's decision bar, um
const AR_SPLIT = envF('PF_S91_AR', 50);           // S90's MIS-ORIENTED / TURNING split on aspect3
const NSAMP = Math.round(envF('PF_S91_N', 25000));// honest-orientation golden-stride sample
const KLAT = Math.round(envF('PF_S91_K', 8));     // s87's lattice order
const INSETS = (process.env.PF_S91_INSETS ?? '0,0.02').split(',').map(Number);
const RESUME = envB('PF_S91_RESUME', true);
const DIMS: StyleDims = { H: envF('PF_S91_H', 120), Rb: envF('PF_S91_RB', 40), Rt: envF('PF_S91_RT', 50), expn: envF('PF_S91_EXPN', 1) };
const H = DIMS.H;

// style:stem.  The `_ring_D--` family (2026-07-25) is the only all-20 family on disk; the two ANCHORS are
// the exact meshes the flip verdicts were measured on (Voronoi `ring_D--`, Gothic `DS-HT_S39CTL`).
// GothicArches `ring_D--` is deliberately ALSO listed: that file was overwritten 2026-07-29 at 61,120
// facets, so it is a DIFFERENT mesh from the family and is carried as a density control, not as Gothic.
const DEFAULT_STEMS = [
  'GothicArches:gothicarches_ring_DS-HT_S39CTL',
  'Voronoi:voronoi_ring_D--',
  'LowPolyFacet:lowpolyfacet_ring_D--',
  'SuperformulaBlossom:superformulablossom_ring_D--',
  'FourierBloom:fourierbloom_ring_D--',
  'SpiralRidges:spiralridges_ring_D--',
  'SuperellipseMorph:superellipsemorph_ring_D--',
  'HarmonicRipple:harmonicripple_ring_D--C',
  'WaveInterference:waveinterference_ring_D--',
  'Crystalline:crystalline_ring_D--',
  'ArtDeco:artdeco_ring_D--',
  'DragonScales:dragonscales_ring_D--',
  'BambooSegments:bamboosegments_ring_D--',
  'RippleInterference:rippleinterference_ring_D--',
  'GyroidManifold:gyroidmanifold_ring_D--',
  'BasketWeave:basketweave_ring_D--',
  'GeometricStar:geometricstar_ring_D--',
  'HexagonalHive:hexagonalhive_ring_D--',
  'CelticKnot:celticknot_ring_D--',
  'CelticTriquetra:celtictriquetra_ring_D--',
  'GothicArches:gothicarches_ring_D--',
].join(',');
const STEMS = (process.env.PF_S91_STEMS ?? DEFAULT_STEMS).split(',').map((s) => s.trim()).filter((s) => s.length > 0);

mkdirSync(OUTDIR, { recursive: true });
const NDJSON = `${OUTDIR}/S91_STYLE_CENSUS.ndjson`;
const T0 = Date.now();
const el = (): string => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
const pq = (a: Float64Array | number[], f: number): number => (a.length === 0 ? 0 : a[Math.min(a.length - 1, Math.floor(f * a.length))]);

const snakeToCamel = (s: string): string => s.replace(/_([a-z])/g, (_m, c: string) => c.toUpperCase());
function registryDefaults(id: string): Record<string, number> {
  const cfg = (STYLE_REGISTRY as Record<string, {
    params?: Record<string, { default?: unknown }>; advancedParams?: Record<string, { default?: unknown }>;
  }>)[id];
  const out: Record<string, number> = {};
  for (const g of [cfg?.params, cfg?.advancedParams]) {
    if (g === undefined) continue;
    for (const [k, v] of Object.entries(g)) if (typeof v.default === 'number') out[snakeToCamel(k)] = v.default;
  }
  return out;
}

log('===== S91 — PER-STYLE FLIP-REACH CENSUS (is the constrained flip a one-style lever?) =====');
log(`bar ${BAR} um   aspect3 split ${AR_SPLIT}   honest sample N ${NSAMP} k ${KLAT} insets [${INSETS.join(',')}]`);
log(`dims H${DIMS.H} Rb${DIMS.Rb} Rt${DIMS.Rt} expn${DIMS.expn}   ${STEMS.length} meshes`);
log('');

// already-finished stems, so a killed run resumes by skipping them
const done = new Set<string>();
if (RESUME && existsSync(NDJSON)) {
  for (const line of readFileSync(NDJSON, 'utf8').split('\n')) {
    if (line.trim().length === 0) continue;
    try { const o = JSON.parse(line) as { stem?: string }; if (o.stem !== undefined) done.add(o.stem); } catch { /* partial line */ }
  }
  if (done.size > 0) log(`RESUME: ${done.size} stems already in ${NDJSON} — skipping them (PF_S91_RESUME=0 to force)`);
}

const rows: Record<string, unknown>[] = [];

for (const spec of STEMS) {
  const ix = spec.indexOf(':');
  const STYLE = spec.slice(0, ix);
  const STEM = spec.slice(ix + 1);
  if (done.has(STEM)) { rows.push({ stem: STEM, skipped: true }); continue; }
  const path = `research/exchange/_strataConformBisect/${STEM}.stl`;
  log(`\n${'═'.repeat(110)}\n═════ ${STYLE}   ${STEM} ═════`);
  const tS = Date.now();

  // ── rA from REGISTRY DEFAULTS at the driver's dims
  const params = registryDefaults(STYLE);
  const rAbase = buildRadiusFn(STYLE as StyleId, { ...params }, DIMS);
  const rA = (th: number, z: number): number => rAbase(canonTheta(th), z < 0 ? 0 : z > H ? H : z);
  log(`  registry defaults: ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(' ') || '(none numeric)'}`);

  let mesh;
  try { mesh = readMeshFloat64(path, false); } catch (e) { log(`  *** MISSING/UNREADABLE ${path}: ${String(e)}`); continue; }
  const { xyz } = mesh; const nTri = mesh.nTri;
  log(`  ${nTri} facets loaded   [${el()}]`);

  // ── WELD (exact f32 compare — the campaign's weld, verbatim)
  const VXa = new Float64Array(nTri * 3); const VYa = new Float64Array(nTri * 3); const VZa = new Float64Array(nTri * 3);
  const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
  let NV = 0;
  {
    const buf = new ArrayBuffer(24); const f64 = new Float64Array(buf); const u32 = new Uint32Array(buf);
    const map = new Map<number, number[]>();
    const corner = new Int32Array(3);
    for (let t = 0; t < nTri; t += 1) {
      for (let e = 0; e < 3; e += 1) {
        const i = t * 9 + e * 3;
        const x = xyz[i]; const y = xyz[i + 1]; const z = xyz[i + 2];
        f64[0] = x; f64[1] = y; f64[2] = z;
        let h = 2166136261;
        for (let k = 0; k < 6; k += 1) { h ^= u32[k]; h = Math.imul(h, 16777619); }
        h >>>= 0;
        const b = map.get(h);
        let found = -1;
        if (b !== undefined) { for (const v of b) if (VXa[v] === x && VYa[v] === y && VZa[v] === z) { found = v; break; } }
        if (found < 0) { found = NV; VXa[NV] = x; VYa[NV] = y; VZa[NV] = z; NV += 1; if (b === undefined) map.set(h, [found]); else b.push(found); }
        corner[e] = found;
      }
      ta[t] = corner[0]; tb[t] = corner[1]; tc[t] = corner[2];
    }
  }
  const VT = new Float64Array(NV);
  for (let v = 0; v < NV; v += 1) VT[v] = Math.atan2(VYa[v], VXa[v]);
  log(`  welded ${NV} vertices   [${el()}]`);

  // ── (2) THE rA GATE — registry defaults vs the mesh's own vertices. Runs FIRST.
  let gateP99 = 0; let gateP50 = 0; let gateMax = 0;
  {
    const stride = Math.max(1, Math.floor(NV / 40000));
    const g: number[] = [];
    for (let v = 0; v < NV; v += stride) {
      const rr = Math.hypot(VXa[v], VYa[v]);
      g.push(Math.abs(rr - rA(VT[v], VZa[v])));
    }
    g.sort((a, b) => a - b);
    gateP50 = pq(g, 0.5); gateP99 = pq(g, 0.99); gateMax = g[g.length - 1];
  }
  const TRUSTED = gateP99 <= 0.05;
  log(`  *** rA GATE (registry defaults vs mesh): p50 ${gateP50.toExponential(2)}  p99 ${gateP99.toExponential(2)}  max ${gateMax.toExponential(2)} mm  ->  ${TRUSTED ? 'TRUSTED' : '*** UNTRUSTED — orientation numbers for this style are VOID ***'}`);

  // ── (3) DEGREE DISTRIBUTION (s82's quantity, facet-degree = triangles incident per welded vertex)
  const deg = new Int32Array(NV);
  for (let t = 0; t < nTri; t += 1) { deg[ta[t]] += 1; deg[tb[t]] += 1; deg[tc[t]] += 1; }
  const dSorted = Array.from(deg).sort((a, b) => a - b);
  const dq = (f: number): number => dSorted[Math.min(dSorted.length - 1, Math.floor(f * dSorted.length))];
  const degMax = dSorted[dSorted.length - 1];
  const cntGE = (m: number): number => { let s = 0; for (let v = 0; v < NV; v += 1) if (deg[v] >= m) s += 1; return s; };
  const heldGE = (m: number): number => { let s = 0; for (let v = 0; v < NV; v += 1) if (deg[v] >= m) s += deg[v]; return s; };
  const tot3 = nTri * 3;
  const nDeg100 = cntGE(100); const nDeg1000 = cntGE(1000);
  const heldPct100 = (100 * heldGE(100)) / tot3;
  const heldPct1000 = (100 * heldGE(1000)) / tot3;
  const pctDeg10 = (100 * cntGE(10)) / NV;
  log(`  DEGREE  p50 ${dq(0.5)}  p99 ${dq(0.99)}  p999 ${dq(0.999)}  MAX ${degMax}   deg>=10 ${((100 * cntGE(10)) / NV).toFixed(3)}% of verts   deg>=100 ${nDeg100} verts holding ${heldPct100.toFixed(4)}% of mesh   deg>=1000 ${nDeg1000} (${heldPct1000.toFixed(4)}%)`);

  // ── (4) PER-FACET GEOMETRY + THE CENTROID CHORD RULER (s60/landFlipPass verbatim)
  const scr = new Float64Array(12);
  const NSFD = fdNormals(rA, H);
  /** the s60 ranking key VERBATIM: monotone chord, normal sampled AT THE CENTROID ONLY. 5 rA evals. */
  function tangExcCentroid(a: number, b: number, c: number): number {
    const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
    const bx = VXa[b]; const by = VYa[b]; const bz = VZa[b];
    const cx = VXa[c]; const cy = VYa[c]; const cz = VZa[c];
    let fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    let fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    let fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const fl = Math.hypot(fx, fy, fz); if (fl < 1e-18) return 0;
    fx /= fl; fy /= fl; fz /= fl;
    const gx = (ax + bx + cx) / 3; const gy = (ay + by + cy) / 3;
    if (fx * gx + fy * gy < 0) { fx = -fx; fy = -fy; fz = -fz; }
    const thA = VT[a];
    const thc = thA + (dThRaw(thA, VT[b]) + dThRaw(thA, VT[c])) / 3;
    const zc = Math.min(H, Math.max(0, (az + bz + cz) / 3));
    const r = rA(thc, zc);
    const hTh = 1e-5 / Math.max(1e-6, r); const hZ = 1e-5;
    const rTh = (rA(thc + hTh, zc) - rA(thc - hTh, zc)) / (2 * hTh);
    const zp = Math.min(H, zc + hZ); const zm = Math.max(0, zc - hZ);
    const rZ = zp > zm ? (rA(thc, zp) - rA(thc, zm)) / (zp - zm) : 0;
    const cc = Math.cos(thc); const ss = Math.sin(thc);
    let nx = rTh * ss + r * cc; let ny = r * ss - rTh * cc; let nz = -r * rZ;
    const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    let dot = fx * nx + fy * ny + fz * nz; dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    const la = Math.hypot(bx - cx, by - cy, bz - cz);
    const lb = Math.hypot(ax - cx, ay - cy, az - cz);
    const lc = Math.hypot(ax - bx, ay - by, az - bz);
    return 2 * Math.sin(0.5 * Math.acos(dot)) * Math.max(la, lb, lc) * 1000;
  }

  let areaAll = 0;
  let overN = 0; let overA = 0;
  let misN = 0; let misA = 0; let misOverN = 0; let misOverA = 0;
  let turnOverN = 0; let turnOverA = 0;
  let hubOverN = 0; let hubOverA = 0;             // over-bar facets touching a degree>=100 vertex
  let hubN = 0; let hubA = 0;                     // ALL facets touching a degree>=100 vertex
  let tangSum = 0; let tangMax = 0;
  const resv: number[] = [];                      // stride-5 reservoir for percentiles
  for (let t = 0; t < nTri; t += 1) {
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
    const ux = VXa[b] - ax; const uy = VYa[b] - ay; const uz = VZa[b] - az;
    const wx = VXa[c] - ax; const wy = VYa[c] - ay; const wz = VZa[c] - az;
    const px = uy * wz - uz * wy; const py = uz * wx - ux * wz; const pz = ux * wy - uy * wx;
    const area = 0.5 * Math.hypot(px, py, pz);
    const la = Math.hypot(VXa[b] - VXa[c], VYa[b] - VYa[c], VZa[b] - VZa[c]);
    const lb = Math.hypot(ax - VXa[c], ay - VYa[c], az - VZa[c]);
    const lc = Math.hypot(ux, uy, uz);
    const diam = Math.max(la, lb, lc);
    const perim = la + lb + lc;
    const aspect3 = area > 0 ? (diam * perim) / (4 * area) : Infinity;
    const g = TRUSTED ? tangExcCentroid(a, b, c) : 0;
    areaAll += area;
    tangSum += g * area; if (g > tangMax) tangMax = g;
    if (t % 5 === 0) resv.push(g);
    const isMis = aspect3 >= AR_SPLIT;
    const isHub = deg[a] >= 100 || deg[b] >= 100 || deg[c] >= 100;
    if (isMis) { misN += 1; misA += area; }
    if (isHub) { hubN += 1; hubA += area; }
    if (g > BAR) {
      overN += 1; overA += area;
      if (isMis) { misOverN += 1; misOverA += area; } else { turnOverN += 1; turnOverA += area; }
      if (isHub) { hubOverN += 1; hubOverA += area; }
    }
  }
  resv.sort((a, b) => a - b);
  const misOverAreaShare = overA > 0 ? (100 * misOverA) / overA : 0;
  const hubOverAreaShare = overA > 0 ? (100 * hubOverA) / overA : 0;
  log(`  AREA total ${areaAll.toFixed(2)} mm2`);
  log(`  ORIENT (CENTROID ruler, s60 key — 21.6x LOW as a level, comparable to the banked 8.131%->2.179%):`);
  log(`     over-${BAR}um  COUNT ${overN} (${((100 * overN) / nTri).toFixed(4)}%)   AREA ${((100 * overA) / areaAll).toFixed(4)}%   max ${tangMax.toFixed(1)} um   area-wtd mean ${(tangSum / areaAll).toFixed(3)} um   p50 ${pq(resv, 0.5).toFixed(3)} p99 ${pq(resv, 0.99).toFixed(2)}`);
  log(`  MIS-ORIENTED (aspect3>=${AR_SPLIT}): ${misN} facets (${((100 * misN) / nTri).toFixed(4)}% cnt, ${((100 * misA) / areaAll).toFixed(5)}% area)   of which over-bar ${misOverN} / AREA ${((100 * misOverA) / areaAll).toFixed(5)}%`);
  log(`  TURNING      (aspect3< ${AR_SPLIT}): ${nTri - misN} facets (${((100 * (nTri - misN)) / nTri).toFixed(4)}% cnt)   of which over-bar ${turnOverN} / AREA ${((100 * turnOverA) / areaAll).toFixed(5)}%`);
  log(`  *** SHARE OF THE OVER-BAR AREA HELD BY MIS-ORIENTED: ${misOverAreaShare.toFixed(4)}%   (by count ${overN > 0 ? ((100 * misOverN) / overN).toFixed(4) : '0'}%) ***`);
  log(`  SUPER-HUB reach: facets touching a deg>=100 vertex ${hubN} (${((100 * hubN) / nTri).toFixed(4)}% cnt, ${((100 * hubA) / areaAll).toFixed(5)}% area);  of the OVER-BAR area they hold ${hubOverAreaShare.toFixed(4)}%`);

  // ── (1) THE HONEST ORIENTATION RULER on a golden-stride sample (s87 construction)
  const gcd = (x: number, y: number): number => (y === 0 ? x : gcd(y, x % y));
  let gs = Math.max(1, Math.round(nTri * 0.6180339887498949) | 1);
  while (gs > 1 && gcd(gs, nTri) !== 1) gs += 2;
  if (gs >= nTri) gs = 1;
  const nS = Math.min(NSAMP, nTri);
  const hOverN = INSETS.map(() => 0); const hOverA = INSETS.map(() => 0);
  const hInv = INSETS.map(() => 0); const hMax = INSETS.map(() => 0);
  let sampA = 0; let sampCentOverN = 0; let sampCentOverA = 0;
  if (TRUSTED) {
    for (let q = 0; q < nS; q += 1) {
      const t = (q * gs) % nTri;
      const a = ta[t]; const b = tb[t]; const c = tc[t];
      const thA = VT[a];
      const thB = thA + dThRaw(thA, VT[b]); const thC = thA + dThRaw(thA, VT[c]);
      const ax = VXa[a]; const ay = VYa[a]; const az = VZa[a];
      const ux = VXa[b] - ax; const uy = VYa[b] - ay; const uz = VZa[b] - az;
      const wx = VXa[c] - ax; const wy = VYa[c] - ay; const wz = VZa[c] - az;
      const px = uy * wz - uz * wy; const py = uz * wx - ux * wz; const pz = ux * wy - uy * wx;
      const area = 0.5 * Math.hypot(px, py, pz);
      sampA += area;
      const gc2 = tangExcCentroid(a, b, c);
      if (gc2 > BAR) { sampCentOverN += 1; sampCentOverA += area; }
      for (let i = 0; i < INSETS.length; i += 1) {
        const o = orientOfFacet(
          NSFD,
          ax, ay, az, VXa[b], VYa[b], VZa[b], VXa[c], VYa[c], VZa[c],
          thA, thB, thC,
          { k: KLAT, inset: INSETS[i], scratch: scr, barRad: (5 * Math.PI) / 180 },
        );
        const um = o.tangMm * 1000;
        if (um > hMax[i]) hMax[i] = um;
        if (o.normDeg > 90) hInv[i] += 1;
        if (um > BAR) { hOverN[i] += 1; hOverA[i] += area; }
      }
      if (q > 0 && q % 5000 === 0) log(`     honest sample ${q}/${nS}   [${el()}]`);
    }
    for (let i = 0; i < INSETS.length; i += 1) {
      log(`  HONEST ORIENT (orientOfFacet k=${KLAT} inset ${INSETS[i].toFixed(2)}, n=${nS} = ${((100 * nS) / nTri).toFixed(3)}%): over-bar COUNT ${hOverN[i]} (${((100 * hOverN[i]) / nS).toFixed(4)}%)   AREA ${((100 * hOverA[i]) / sampA).toFixed(4)}%   inverted>90deg ${hInv[i]}   max ${hMax[i].toFixed(1)} um`);
    }
    log(`  SAME SAMPLE, CENTROID ruler: over-bar ${sampCentOverN} (${((100 * sampCentOverN) / nS).toFixed(4)}%) / AREA ${((100 * sampCentOverA) / sampA).toFixed(4)}%   =>  honest/centroid COUNT ${(hOverN[INSETS.length - 1] / Math.max(1, sampCentOverN)).toFixed(2)}x   AREA ${((hOverA[INSETS.length - 1] / Math.max(1e-30, sampCentOverA))).toFixed(2)}x`);
  } else {
    log('  HONEST ORIENT: SKIPPED — rA gate UNTRUSTED, the surface this mesh was built on is not the one the registry defaults describe.');
  }

  // ── THE PRE-REGISTERED CLASSIFIER
  const hubDominated = degMax >= 1000 || heldPct100 >= 1.0;
  const misDominated = TRUSTED && misOverAreaShare >= 25;
  const cls = hubDominated || misDominated ? 'VORONOI-CLASS' : 'GOTHIC-CLASS';
  log(`  *** CLASS: ${cls}   (hub-dominated ${hubDominated ? 'YES' : 'no'} [maxDeg ${degMax}, held@100 ${heldPct100.toFixed(4)}%];  misori-dominated ${misDominated ? 'YES' : 'no'} [${misOverAreaShare.toFixed(2)}% of over-bar area]) ***`);
  log(`  [${((Date.now() - tS) / 1000).toFixed(1)}s for this mesh]`);

  const row = {
    ts: new Date().toISOString(), style: STYLE, stem: STEM, nTri, NV, areaAll,
    gateP50, gateP99, gateMax, trusted: TRUSTED,
    degP50: dq(0.5), degP99: dq(0.99), degP999: dq(0.999), degMax, pctDeg10, nDeg100, heldPct100, nDeg1000, heldPct1000,
    overN, overPct: (100 * overN) / nTri, overAreaPct: (100 * overA) / areaAll, tangMax, tangAreaMean: tangSum / areaAll,
    misN, misPct: (100 * misN) / nTri, misAreaPct: (100 * misA) / areaAll,
    misOverN, misOverAreaPct: (100 * misOverA) / areaAll, misOverAreaShare,
    turnOverN, turnOverAreaPct: (100 * turnOverA) / areaAll,
    hubN, hubAreaPct: (100 * hubA) / areaAll, hubOverN, hubOverAreaShare,
    honest: INSETS.map((v, i) => ({ inset: v, overN: hOverN[i], overPct: (100 * hOverN[i]) / Math.max(1, nS), overAreaPct: (100 * hOverA[i]) / Math.max(1e-30, sampA), inv: hInv[i], max: hMax[i] })),
    sampN: nS, sampCentOverN, sampCentOverPct: (100 * sampCentOverN) / Math.max(1, nS), sampCentOverAreaPct: (100 * sampCentOverA) / Math.max(1e-30, sampA),
    hubDominated, misDominated, cls,
    secs: (Date.now() - tS) / 1000,
  };
  rows.push(row);
  appendFileSync(NDJSON, `${JSON.stringify(row)}\n`);      // CHECKPOINT: the instant it is computed
  log(`  checkpointed -> ${NDJSON}`);
}

// ── THE TABLE
log(`\n${'═'.repeat(140)}`);
log('S91 PER-STYLE CLASSIFICATION TABLE  (count AND area on every population; CENTROID ruler unless marked honest)');
log('═'.repeat(140));
const all = readFileSync(NDJSON, 'utf8').split('\n').filter((l) => l.trim().length > 0).map((l) => JSON.parse(l) as Record<string, number | string | boolean>);
const hdr = ['style', 'nTri', 'maxDeg', 'v>=100', 'held%@100', 'misN', 'misArea%', 'misShareOfOverArea%', 'overN(cent)', 'overArea%(cent)', 'honestOverArea%', 'gate', 'CLASS'];
log(hdr.join(' | '));
for (const r of all) {
  const hon = (r.honest as unknown as Array<{ inset: number; overAreaPct: number }> | undefined);
  const h2 = hon === undefined ? NaN : (hon[hon.length - 1]?.overAreaPct ?? NaN);
  log([
    r.style, r.nTri, r.degMax, r.nDeg100, (r.heldPct100 as number).toFixed(4),
    r.misN, (r.misAreaPct as number).toFixed(5), (r.misOverAreaShare as number).toFixed(2),
    r.overN, (r.overAreaPct as number).toFixed(4), Number.isFinite(h2) ? h2.toFixed(4) : 'n/a',
    r.trusted ? 'TRUSTED' : 'VOID', r.cls,
  ].join(' | '));
}
const vor = all.filter((r) => r.cls === 'VORONOI-CLASS').length;
const got = all.filter((r) => r.cls === 'GOTHIC-CLASS').length;
log(`\n*** ${vor} VORONOI-CLASS / ${got} GOTHIC-CLASS of ${all.length} meshes = ${((100 * vor) / Math.max(1, all.length)).toFixed(1)}% Voronoi-class ***`);
log(`K-S91a (>=60% Voronoi-class => NICHE LEVER): ${(100 * vor) / Math.max(1, all.length) >= 60 ? '*** TRIPPED ***' : 'not tripped'}`);
log(`K-S91b (<=20% Voronoi-class => GENERAL LEVER): ${(100 * vor) / Math.max(1, all.length) <= 20 ? '*** TRIPPED ***' : 'not tripped'}`);
writeFileSync(`${OUTDIR}/S91_STYLE_CENSUS.json`, JSON.stringify(all, null, 2));
log(`\nwritten ${OUTDIR}/S91_STYLE_CENSUS.json   [${el()}]`);
