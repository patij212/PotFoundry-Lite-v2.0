// s23Density.ts — S23 RECONSTRUCTION, STAGE 0: DENSITY-FIELD EXTRACTABILITY.
// ARTIFACT-ONLY: no mesher run, no driver edit, no `src/` edit, no default flipped.
//
// Run from `potfoundry-web/`:
//   node node_modules/esbuild/bin/esbuild research/tools/s23Density.ts --bundle --platform=node \
//     --format=cjs --target=node20 --external:playwright --external:playwright-core \
//     --external:chromium-bidi --outfile=research/bridge/out/_run_s23d.cjs
//   node research/bridge/out/_run_s23d.cjs <ARM>          # ARM = S22B (the drained, gate-clean lineage)
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS ANSWERS, AND WHY IT IS A GO/NO-GO RATHER THAN A DIAGNOSTIC
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// S23 keeps the bisection driver ONLY as a density ORACLE: the refined mesh is discarded and a per-cell
// target edge length `h(theta,z)` survives it. That is the whole architecture, so the first question is
// whether such a field is EXTRACTABLE AT USABLE RESOLUTION — registered as the arm's #1 risk in its own
// words: "the refined mesh's local edge length is a noisy estimator near creases. Smooth it, and you lose
// the feature; do not, and you import the bisection texture through the back door."
// The bars D0-D6 and the verdicts E0/E1/E2 are registered in
// research/lab/2026-07-29-strata-perf-convergence-worklog.md, section
// "S23 — THE RECONSTRUCTION PASS. REGISTERED IN FULL", commit 95cd8662, BEFORE any number below was read.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// TRANSCRIPTION, NOT IMPORT — the S-e separation
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The f32 STL reader, the position weld, the atan2 theta recovery and `bestDot` are transcribed from
// `research/tools/s23mPreflight.ts` operand-for-operand. `_facetTruthLib`, `_sharp3dRef`, `_shapeGuard`,
// `_judgeNormal` and `_judgeShape` are byte-untouched by this file, and nothing in `src/` is imported
// except the two TYPES every census in this campaign already imports.
// The only value imports are the analytic SURFACE (`_facetTruthRA` + the registry defaults) — measuring a
// different surface would not be an independent instrument, it would be a different experiment.
import { readFileSync } from 'node:fs';
import { buildAuditRadiusFn } from '../bridge/_facetTruthRA';
import { registryDefaultsFor as registryDefaults } from '../bridge/_gpuRankBridge';
import type { StyleDims } from '../bridge/runStyle';
import type { StyleId } from '../../src/geometry/types';

const DIMS: StyleDims = { H: 120, Rb: 40, Rt: 50, expn: 1 };
const STYLE = 'GothicArches' as StyleId;
const H = 120;
const TWO_PI = 2 * Math.PI; const RAD2DEG = 180 / Math.PI; const rRef = 45;
const SQRT3 = Math.sqrt(3);
// eslint-disable-next-line no-console
const log = console.log;
const ARM = process.argv[2] ?? 'S22B';
const EX = 'research/exchange/_strataConformBisect/gothicarches_ring_DS-H_';

// ── THE CHART. Identical to the seed builder's own (`_strataAlignedSeed.ts:408`): x = rRef*theta, y = z,
//    with rRef = 45 HARDCODED there. Using any other chart would price the constructor in units it does
//    not build in.
const X_MAX = TWO_PI * rRef;                       // 282.743 mm of arc
const canonTheta = (t: number): number => { let x = t % TWO_PI; if (x < 0) x += TWO_PI; return x; };
const dThRaw = (a: number, b: number): number => {
  let d = b - a; while (d > Math.PI) d -= TWO_PI; while (d < -Math.PI) d += TWO_PI; return d;
};

// ── S23's REGISTERED CONSTANTS ────────────────────────────────────────────────────────────────────────
const CELL_MM = 0.25;                              // the REPORTING grid, registered
const BUCKET_MM = 0.5;                             // the scattered field's bucket hash, registered
const COVER_BAR_MM = 2.0;                          // D0
const LATT_HA_LO = 0.500; const LATT_HA_HI = 0.950;   // D1, derived below
const LATT_HMIN_LO = 0.193; const LATT_HMIN_HI = 0.770;
const D2_HMIN_BAR = 0.100;                         // D2(i)
const D2_RATIO_BAR = 2.0;                          // D2(ii)
const D3_RATIO_BAR = 0.5;                          // D3
const D5_DISP_BAR = 3.0;                           // D5
const D6_LO = 0.7; const D6_HI = 1.5; const D6_STOP = 3.0;   // D6
const PSLG_FLOOR_MM = 0.0364;                      // the seed's own hard floor: acrossMinMm*0.55 > pslgEpsMm

const { rA } = buildAuditRadiusFn(STYLE, { ...registryDefaults(STYLE) }, DIMS, 120);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// LOAD THE SHIPPED MESH — f32, the values that left the building (the S20.1 lesson)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const buf = readFileSync(`${EX}${ARM}.stl`);
const nTri = buf.readUInt32LE(80);
const xyz = new Float64Array(nTri * 9);
{ let o = 84; for (let t = 0; t < nTri; t += 1) { o += 12; for (let k = 0; k < 9; k += 1) { xyz[t * 9 + k] = buf.readFloatLE(o); o += 4; } o += 2; } }
log(`=== S23 STAGE 0 — DENSITY-FIELD EXTRACTABILITY.  arm ${ARM}, ${nTri} facets (f32, as shipped) ===`);
log(`  bars D0-D6 registered in the worklog (commit 95cd8662) BEFORE this ran. Artifact-only.`);

// WELD by exact f32 position, exactly as the driver's `addV` welds by 3-D position.
const key = new Float32Array(3);
const keyBytes = new Uint8Array(key.buffer);
const vmap = new Map<string, number>();
const vxA: number[] = []; const vyA: number[] = []; const vzA: number[] = []; const vthA: number[] = [];
const ta = new Int32Array(nTri); const tb = new Int32Array(nTri); const tc = new Int32Array(nTri);
function vid(x: number, y: number, z: number): number {
  key[0] = x; key[1] = y; key[2] = z;
  let s = '';
  for (let i = 0; i < 12; i += 1) s += String.fromCharCode(keyBytes[i]);
  const got = vmap.get(s);
  if (got !== undefined) return got;
  const id = vxA.length;
  vxA.push(x); vyA.push(y); vzA.push(z); vthA.push(canonTheta(Math.atan2(y, x)));
  vmap.set(s, id);
  return id;
}
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  ta[t] = vid(xyz[o], xyz[o + 1], xyz[o + 2]);
  tb[t] = vid(xyz[o + 3], xyz[o + 4], xyz[o + 5]);
  tc[t] = vid(xyz[o + 6], xyz[o + 7], xyz[o + 8]);
}
const nV = vxA.length;
const vx = Float64Array.from(vxA); const vy = Float64Array.from(vyA);
const vz = Float64Array.from(vzA); const vth = Float64Array.from(vthA);
vmap.clear();
log(`  welded ${nV} vertices from ${nTri * 3} corners   (${(nTri / nV).toFixed(3)} tri/vertex)`);

// the vertex's own chart position — this is where the field lives
const cxArr = new Float64Array(nV); const cyArr = new Float64Array(nV);
for (let v = 0; v < nV; v += 1) { cxArr[v] = rRef * vth[v]; cyArr[v] = vz[v]; }

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE ESTIMATOR — DEFINED IN THE REGISTRATION BEFORE IT WAS MEASURED
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
//   hMin(v) = min 3-D incident edge length            — the ACROSS scale (the S15 floor sets it)
//   hMed(v) = median 3-D incident edge length         — the mixed scale
//   hA(v)   = sqrt(2*A(v)/sqrt3), A(v) = (1/3) SUM_{f in F(v)} area(f)
//             — THE DENSITY-PRESERVING SCALAR. A uniform equilateral mesh of edge h owns (sqrt3/2) h^2 of
//             area per vertex, so hA is exactly the h at which an equilateral mesh has this mesh's local
//             vertex density, and N_tri = (4/sqrt3) INTEGRAL dA / h^2 follows with no further assumption.
const vArea = new Float64Array(nV);
const fArea = new Float64Array(nTri); const fLong = new Float64Array(nTri);
for (let t = 0; t < nTri; t += 1) {
  const a = ta[t]; const b = tb[t]; const c = tc[t];
  const ux = vx[b] - vx[a]; const uy = vy[b] - vy[a]; const uz = vz[b] - vz[a];
  const wx = vx[c] - vx[a]; const wy = vy[c] - vy[a]; const wz = vz[c] - vz[a];
  const ar = 0.5 * Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  fArea[t] = ar;
  const e0 = Math.hypot(ux, uy, uz);
  const e1 = Math.hypot(vx[c] - vx[b], vy[c] - vy[b], vz[c] - vz[b]);
  const e2 = Math.hypot(wx, wy, wz);
  fLong[t] = Math.max(e0, e1, e2);
  const third = ar / 3;
  vArea[a] += third; vArea[b] += third; vArea[c] += third;
}
const hA = new Float64Array(nV);
for (let v = 0; v < nV; v += 1) hA[v] = Math.sqrt((2 * vArea[v]) / SQRT3);

// distinct edges -> CSR of incident edge lengths per vertex
const edgeSet = new Set<number>();
const eKey = (a: number, b: number): number => (a < b ? a * nV + b : b * nV + a);
for (let t = 0; t < nTri; t += 1) {
  edgeSet.add(eKey(ta[t], tb[t])); edgeSet.add(eKey(tb[t], tc[t])); edgeSet.add(eKey(tc[t], ta[t]));
}
const nE = edgeSet.size;
const deg = new Int32Array(nV + 1);
const eA = new Int32Array(nE); const eB = new Int32Array(nE); const eL = new Float64Array(nE);
{
  let i = 0;
  for (const k of edgeSet) {
    const a = Math.floor(k / nV); const b = k - a * nV;
    eA[i] = a; eB[i] = b;
    eL[i] = Math.hypot(vx[a] - vx[b], vy[a] - vy[b], vz[a] - vz[b]);
    deg[a] += 1; deg[b] += 1; i += 1;
  }
}
edgeSet.clear();
const off = new Int32Array(nV + 1);
for (let v = 0; v < nV; v += 1) off[v + 1] = off[v] + deg[v];
const fill = new Int32Array(nV);
const vals = new Float64Array(off[nV]);
for (let i = 0; i < nE; i += 1) {
  const a = eA[i]; const b = eB[i];
  vals[off[a] + fill[a]] = eL[i]; fill[a] += 1;
  vals[off[b] + fill[b]] = eL[i]; fill[b] += 1;
}
const hMin = new Float64Array(nV); const hMed = new Float64Array(nV);
{
  const tmp: number[] = [];
  for (let v = 0; v < nV; v += 1) {
    const s = off[v]; const e = off[v + 1];
    if (e === s) { hMin[v] = NaN; hMed[v] = NaN; continue; }
    tmp.length = 0;
    for (let i = s; i < e; i += 1) tmp.push(vals[i]);
    tmp.sort((p, q) => p - q);
    hMin[v] = tmp[0]; hMed[v] = tmp[Math.floor(tmp.length / 2)];
  }
}
log(`  ${nE} distinct edges;  mean vertex degree ${(off[nV] / nV).toFixed(2)}`);

const pctOf = (arr: number[], p: number): number => (arr.length === 0 ? NaN
  : arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]);
const sortedSub = (idx: number[] | Int32Array, src: Float64Array): number[] => {
  const out: number[] = [];
  for (let i = 0; i < idx.length; i += 1) { const v = src[idx[i]]; if (Number.isFinite(v)) out.push(v); }
  out.sort((p, q) => p - q); return out;
};
const um = (v: number): string => (Number.isFinite(v) ? (v * 1000).toFixed(1) : 'n/a');

log('\n--- THE THREE ESTIMATORS OVER THE WHOLE WALL (um) ---');
{
  const all = new Int32Array(nV); for (let v = 0; v < nV; v += 1) all[v] = v;
  for (const [nm, src] of [['hMin', hMin], ['hMed', hMed], ['hA  ', hA]] as Array<[string, Float64Array]>) {
    const s = sortedSub(all, src);
    log(`  ${nm}: p01 ${um(pctOf(s, 0.01))}  p10 ${um(pctOf(s, 0.10))}  p50 ${um(pctOf(s, 0.50))}`
      + `  p90 ${um(pctOf(s, 0.90))}  p99 ${um(pctOf(s, 0.99))}  MIN ${um(s[0])}  MAX ${um(s[s.length - 1])}`);
  }
  const sMin = sortedSub(all, hMin);
  const underPslg = sMin.filter((v) => v < PSLG_FLOOR_MM).length;
  log(`  *** source vertices whose hMin is below the seed's OWN hard floor ${(PSLG_FLOOR_MM * 1000).toFixed(1)} um`
    + ` (acrossMinMm*0.55 > pslgEpsMm, _strataAlignedSeed.ts:398): ${underPslg} of ${nV}`
    + ` (${((100 * underPslg) / nV).toFixed(4)}%) — the constructor CANNOT be asked for these ***`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE SCATTERED FIELD — nearest source vertex in the (arc, z) chart, 0.5 mm bucket hash, seam-aware
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const bCols = Math.max(1, Math.round(X_MAX / BUCKET_MM));
const bRows = Math.ceil(H / BUCKET_MM) + 1;
const bW = X_MAX / bCols;                                  // exact wrap: bCols buckets tile the seam
const bCell = (x: number, y: number): number => {
  let ci = Math.floor(x / bW); ci = ((ci % bCols) + bCols) % bCols;
  const ri = Math.min(bRows - 1, Math.max(0, Math.floor(y / BUCKET_MM)));
  return ri * bCols + ci;
};
const bCount = new Int32Array(bCols * bRows + 1);
for (let v = 0; v < nV; v += 1) bCount[bCell(cxArr[v], cyArr[v]) + 1] += 1;
for (let i = 0; i < bCols * bRows; i += 1) bCount[i + 1] += bCount[i];
const bIdx = new Int32Array(nV);
{
  const f = new Int32Array(bCols * bRows);
  for (let v = 0; v < nV; v += 1) { const c = bCell(cxArr[v], cyArr[v]); bIdx[bCount[c] + f[c]] = v; f[c] += 1; }
}
const dx2 = (a: number, b: number): number => {
  let d = Math.abs(a - b); if (d > X_MAX / 2) d = X_MAX - d; return d;
};
/** nearest source vertex to a chart point; returns [vertexId, distanceMm]. Ring search, exact. */
function nearestSrc(x: number, y: number): [number, number] {
  const ci0 = ((Math.floor(x / bW) % bCols) + bCols) % bCols;
  const ri0 = Math.min(bRows - 1, Math.max(0, Math.floor(y / BUCKET_MM)));
  let best = -1; let bd = Infinity;
  for (let ring = 0; ring < Math.max(bCols, bRows); ring += 1) {
    // once a hit is closer than the ring's guaranteed clearance, no further ring can beat it
    if (best >= 0 && bd <= (ring - 1) * BUCKET_MM) break;
    for (let dr = -ring; dr <= ring; dr += 1) {
      const ri = ri0 + dr; if (ri < 0 || ri >= bRows) continue;
      const inner = Math.abs(dr) === ring;
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (!inner && Math.abs(dc) !== ring) continue;
        const ci = ((ci0 + dc) % bCols + bCols) % bCols;
        const c = ri * bCols + ci;
        for (let i = bCount[c]; i < bCount[c + 1]; i += 1) {
          const v = bIdx[i];
          const ddx = dx2(cxArr[v], x); const ddy = cyArr[v] - y;
          const d = Math.hypot(ddx, ddy);
          if (d < bd) { bd = d; best = v; }
        }
      }
    }
    if (best >= 0 && ring >= 2 && bd <= (ring - 1) * BUCKET_MM) break;
  }
  return [best, bd];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D0 — COVERAGE. Registered precondition: max nearest-source distance <= 2.0 mm over a 0.25 mm lattice.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const gCols = Math.max(1, Math.round(X_MAX / CELL_MM));
const gRows = Math.ceil(H / CELL_MM);
const gW = X_MAX / gCols; const gHh = H / gRows;
log('\n--- D0: COVERAGE of the scattered field ---');
let d0Worst = 0; let d0WorstX = 0; let d0WorstY = 0;
const gNear = new Float64Array(gCols * gRows);      // nearest-vertex hA at each reporting cell centre
{
  for (let r = 0; r < gRows; r += 1) {
    const y = (r + 0.5) * gHh;
    for (let c = 0; c < gCols; c += 1) {
      const x = (c + 0.5) * gW;
      const [v, d] = nearestSrc(x, y);
      gNear[r * gCols + c] = v >= 0 ? hA[v] : NaN;
      if (d > d0Worst) { d0Worst = d; d0WorstX = x; d0WorstY = y; }
    }
  }
}
const D0 = d0Worst <= COVER_BAR_MM;
log(`  ${gCols} x ${gRows} = ${gCols * gRows} probes at ${CELL_MM} mm`);
log(`  WORST nearest-source distance ${d0Worst.toFixed(4)} mm at chart (${d0WorstX.toFixed(2)}, ${d0WorstY.toFixed(2)})`
  + `   bar <= ${COVER_BAR_MM.toFixed(1)} mm   ${D0 ? 'HOLDS' : '*** FAILS — E0 INDETERMINATE ***'}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D1 — THE DESIGNED LATTICE REPRODUCES (1,101 um along / 385 um across)
// The class is isolated by S22B's OWN signature, unchanged: area >= 0.15 mm^2, dev < 1 deg, long >= 1 mm.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const hFD = 1e-6;
function bestDot(th: number, z: number, fx: number, fy: number, fz: number): number {
  const r0 = rA(th, z);
  const rTp = rA(th + hFD, z); const rTm = rA(th - hFD, z);
  const rZp = rA(th, z + hFD); const rZm = rA(th, z - hFD);
  const ct = Math.cos(th); const st = Math.sin(th);
  let best = -Infinity;
  for (const [rt, rz] of [
    [(rTp - rTm) / (2 * hFD), (rZp - rZm) / (2 * hFD)],
    [(rTp - r0) / hFD, (rZp - r0) / hFD], [(rTp - r0) / hFD, (r0 - rZm) / hFD],
    [(r0 - rTm) / hFD, (rZp - r0) / hFD], [(r0 - rTm) / hFD, (r0 - rZm) / hFD],
  ]) {
    const nx = r0 * ct + rt * st; const ny = r0 * st - rt * ct; const nz = -r0 * rz;
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    const d = (fx * nx + fy * ny + fz * nz) / nl; if (d > best) best = d;
  }
  return best;
}
const lattVerts: number[] = [];
{
  const isLatt = new Uint8Array(nV);
  let nLattTri = 0;
  for (let t = 0; t < nTri; t += 1) {
    if (fArea[t] < 0.15 || fLong[t] < 1.0) continue;
    const a = ta[t]; const b = tb[t]; const c = tc[t];
    let nx = (vy[b] - vy[a]) * (vz[c] - vz[a]) - (vz[b] - vz[a]) * (vy[c] - vy[a]);
    let ny = (vz[b] - vz[a]) * (vx[c] - vx[a]) - (vx[b] - vx[a]) * (vz[c] - vz[a]);
    let nz = (vx[b] - vx[a]) * (vy[c] - vy[a]) - (vy[b] - vy[a]) * (vx[c] - vx[a]);
    const nl = Math.hypot(nx, ny, nz); if (!(nl > 0)) continue;
    nx /= nl; ny /= nl; nz /= nl;
    const dB = dThRaw(vth[a], vth[b]); const dC = dThRaw(vth[a], vth[c]);
    const thc = canonTheta(vth[a] + (dB + dC) / 3); const zc = (vz[a] + vz[b] + vz[c]) / 3;
    const dev = Math.acos(Math.max(-1, Math.min(1, bestDot(thc, zc, nx, ny, nz)))) * RAD2DEG;
    if (!(dev < 1)) continue;
    nLattTri += 1;
    isLatt[a] = 1; isLatt[b] = 1; isLatt[c] = 1;
  }
  for (let v = 0; v < nV; v += 1) if (isLatt[v]) lattVerts.push(v);
  log('\n--- D1: THE DESIGNED LATTICE (S22B signature: area >= 0.15 mm^2, dev < 1 deg, long >= 1 mm) ---');
  log(`  ${nLattTri} facets -> ${lattVerts.length} source vertices`);
}
const lattHA = sortedSub(lattVerts, hA);
const lattHMIN = sortedSub(lattVerts, hMin);
const lattHMED = sortedSub(lattVerts, hMed);
const lattHAp50 = pctOf(lattHA, 0.5);
const D1a = lattHAp50 >= LATT_HA_LO && lattHAp50 <= LATT_HA_HI;
const lattHMINp50 = pctOf(lattHMIN, 0.5);
const D1b = lattHMINp50 >= LATT_HMIN_LO && lattHMINp50 <= LATT_HMIN_HI;
const D1 = D1a && D1b;
log(`  hA   p10 ${um(pctOf(lattHA, 0.1))}  p50 ${um(lattHAp50)}  p90 ${um(pctOf(lattHA, 0.9))} um`);
log(`  hMin p10 ${um(pctOf(lattHMIN, 0.1))}  p50 ${um(lattHMINp50)}  p90 ${um(pctOf(lattHMIN, 0.9))} um`);
log(`  hMed p10 ${um(pctOf(lattHMED, 0.1))}  p50 ${um(pctOf(lattHMED, 0.5))}  p90 ${um(pctOf(lattHMED, 0.9))} um`);
log(`  TARGET DERIVED FROM THE RECORD, NOT CHOSEN: a 1,101 x 385 um parallelogram splits into two triangles`);
log(`    of 211,942 um^2, whose equal-area equilateral has edge 699.6 um.`);
log(`  hA   p50 in [${(LATT_HA_LO * 1000).toFixed(0)}, ${(LATT_HA_HI * 1000).toFixed(0)}] um   ${D1a ? 'HOLDS' : '*** FAILS ***'}`);
log(`  hMin p50 in [${(LATT_HMIN_LO * 1000).toFixed(0)}, ${(LATT_HMIN_HI * 1000).toFixed(0)}] um   ${D1b ? 'HOLDS' : '*** FAILS ***'}`);
log(`  ==> D1 ${D1 ? 'HOLDS' : '*** FAILS — E1 NO-GO ***'}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D2 — THE LOCI ACROSS-WIDTHS AND THE S19 RING PROGRESSION
// Distance is to the nearest locus SEGMENT, not the nearest traced POINT: the polyline step is ~0.35 mm,
// so point-sampling would carry up to 175 um of error into a bin whose first edge is at 50 um.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
interface Locus { pts: Array<[number, number]> }
const loci = (JSON.parse(readFileSync(`${EX}${ARM}.loci.json`, 'utf8')) as { loci: Locus[]; junctions: Array<{ theta: number; z: number; radiusMm: number }> });
const segAX: number[] = []; const segAY: number[] = []; const segBX: number[] = []; const segBY: number[] = [];
for (const L of loci.loci) {
  for (let i = 0; i + 1 < L.pts.length; i += 1) {
    const [t0, z0] = L.pts[i]; const [t1, z1] = L.pts[i + 1];
    // unwrapped theta: keep the segment in ONE chart copy by taking the shortest arc from t0
    const x0 = rRef * canonTheta(t0); const x1 = x0 + rRef * dThRaw(canonTheta(t0), canonTheta(t1));
    segAX.push(x0); segAY.push(z0); segBX.push(x1); segBY.push(z1);
  }
}
const nSeg = segAX.length;
log(`\n--- D2: THE LOCI (${loci.loci.length} components, ${nSeg} segments from the seed's OWN loci.json) ---`);
// bucket segments at 1.0 mm, wrapping in x
const SB = 1.0;
const sCols = Math.max(1, Math.round(X_MAX / SB)); const sRows = Math.ceil(H / SB) + 2;
const sW = X_MAX / sCols;
const segBuckets = new Map<number, number[]>();
const pushSeg = (ci: number, ri: number, s: number): void => {
  if (ri < 0 || ri >= sRows) return;
  const c = ri * sCols + (((ci % sCols) + sCols) % sCols);
  const l = segBuckets.get(c); if (l === undefined) segBuckets.set(c, [s]); else l.push(s);
};
for (let s = 0; s < nSeg; s += 1) {
  const c0 = Math.floor(Math.min(segAX[s], segBX[s]) / sW); const c1 = Math.floor(Math.max(segAX[s], segBX[s]) / sW);
  const r0 = Math.floor(Math.min(segAY[s], segBY[s]) / SB); const r1 = Math.floor(Math.max(segAY[s], segBY[s]) / SB);
  for (let ci = c0; ci <= c1; ci += 1) for (let ri = r0; ri <= r1; ri += 1) pushSeg(ci, ri, s);
}
/** exact point-to-segment distance in the chart, seam-aware in x. Capped: returns Infinity beyond 1 mm. */
function distLocus(x: number, y: number): number {
  const ci0 = Math.floor(x / sW); const ri0 = Math.floor(y / SB);
  let best = Infinity;
  for (let dr = -1; dr <= 1; dr += 1) {
    const ri = ri0 + dr; if (ri < 0 || ri >= sRows) continue;
    for (let dc = -1; dc <= 1; dc += 1) {
      const c = ri * sCols + ((((ci0 + dc) % sCols) + sCols) % sCols);
      const l = segBuckets.get(c); if (l === undefined) continue;
      for (const s of l) {
        // bring the query point into the segment's chart copy
        let px = x; const mid = 0.5 * (segAX[s] + segBX[s]);
        while (px - mid > X_MAX / 2) px -= X_MAX;
        while (mid - px > X_MAX / 2) px += X_MAX;
        const ax = segAX[s]; const ay = segAY[s]; const bx = segBX[s]; const by = segBY[s];
        const ux = bx - ax; const uy = by - ay; const uu = ux * ux + uy * uy;
        let tt = uu > 0 ? ((px - ax) * ux + (y - ay) * uy) / uu : 0;
        tt = Math.max(0, Math.min(1, tt));
        const d = Math.hypot(px - (ax + tt * ux), y - (ay + tt * uy));
        if (d < best) best = d;
      }
    }
  }
  return best;
}
const D2_EDGES = [0, 0.050, 0.100, 0.200, 0.400, 0.650];
const D2_LBL = ['[0,50]', '[50,100]', '[100,200]', '[200,400]', '[400,650]'];
const binIdx: number[][] = [[], [], [], [], []];
const farVerts: number[] = [];
for (let v = 0; v < nV; v += 1) {
  const d = distLocus(cxArr[v], cyArr[v]);
  if (!Number.isFinite(d) || d > D2_EDGES[5]) { farVerts.push(v); continue; }
  for (let k = 0; k < 5; k += 1) if (d >= D2_EDGES[k] && d < D2_EDGES[k + 1]) { binIdx[k].push(v); break; }
}
const d2HA: number[] = []; const d2HMIN: number[] = [];
for (let k = 0; k < 5; k += 1) {
  const sa = sortedSub(binIdx[k], hA); const sm = sortedSub(binIdx[k], hMin);
  d2HA.push(pctOf(sa, 0.5)); d2HMIN.push(pctOf(sm, 0.5));
  log(`  d ${D2_LBL[k].padEnd(11)} n ${String(binIdx[k].length).padStart(7)}`
    + `   hA p50 ${um(pctOf(sa, 0.5)).padStart(7)}   hMin p50 ${um(pctOf(sm, 0.5)).padStart(7)}   hMin p10 ${um(pctOf(sm, 0.1)).padStart(7)} um`);
}
{
  const sf = sortedSub(farVerts, hA);
  log(`  d > 650 um  n ${String(farVerts.length).padStart(7)}   hA p50 ${um(pctOf(sf, 0.5)).padStart(7)}  (reference, not barred)`);
}
// ── D2' — THE AMENDMENT, registered in the worklog (commit 863715d4) BEFORE this re-score, with the
//    first pass's numbers DISCLOSED as having been in view. The original monotonicity clause is wrong
//    about the DESIGN: `_strataAlignedSeed.ts:859` emits ring j every min(4, round(g^j))-th chain point,
//    so at g = 1.6 the stride SATURATES at 4 from ring 3 (204.8 um) onward and the design's own element
//    size flattens exactly where the measurement flattens. The same question, correctly asked, is
//    CONTRAST — placed where the design puts it, between the ring band and the background lattice.
const farHA = pctOf(sortedSub(farVerts, hA), 0.5);
const d2Contrast = farHA / d2HA[0];
const d2HMINp10 = pctOf(sortedSub(binIdx[0], hMin), 0.1);
const D2a = Number.isFinite(d2HMIN[0]) && d2HMIN[0] <= D2_HMIN_BAR;
const D2b = Number.isFinite(d2Contrast) && d2Contrast >= D2_RATIO_BAR;
const D2c = Number.isFinite(d2HMINp10) && d2HMINp10 <= 0.050;
const D2 = D2a && D2b && D2c;
let mono = true;
for (let k = 1; k < 5; k += 1) if (!(d2HA[k] > d2HA[k - 1])) mono = false;
log(`  (i)   hMin p50 in [0,50] um = ${um(d2HMIN[0])} um   bar <= ${(D2_HMIN_BAR * 1000).toFixed(0)} um`
  + `   (the across rule PLACED min 50.0 / p50 50.0 um on this arm)   ${D2a ? 'HOLDS' : '*** FAILS ***'}`);
log(`  (ii)  CONTRAST hA p50(d>650)/hA p50(d in [0,50]) = ${Number.isFinite(d2Contrast) ? d2Contrast.toFixed(3) : 'n/a'}x`
  + `   bar >= ${D2_RATIO_BAR.toFixed(1)}x   ${D2b ? 'HOLDS' : '*** FAILS ***'}`);
log(`  (iii) SMEARING TEST, stated directly: hMin p10 in [0,50] = ${um(d2HMINp10)} um   bar <= 50.0 um`
  + `   (the extraction must RESOLVE the placed across floor, not average it away)   ${D2c ? 'HOLDS' : '*** FAILS ***'}`);
log(`  FINDING, reported and NOT withdrawn: the hA p50 profile is ${mono ? 'monotone rising' : 'NOT monotone'} inside [0,650] um.`);
log(`    The constructor's own ring stride saturates at 4 from ring 3 (204.8 um), so a reconstruction that`);
log(`    honours the extracted field in the [200,650] um band will place FINER material there than S19's rings do.`);
log(`  ==> D2' ${D2 ? 'HOLDS' : '*** FAILS — E1 NO-GO ***'}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D3 — THE JUNCTION DISKS ARE SMALL (the 43 DECLARED regions, at the routed radius)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const patches = (JSON.parse(readFileSync(`${EX}${ARM}.patches.json`, 'utf8')) as {
  patches: Array<{ id: string; theta: number; z: number; radiusMm: number }> }).patches;
const inRouted = (th: number, z: number): boolean =>
  patches.some((g) => Math.hypot(rRef * dThRaw(g.theta, th), z - g.z) <= Math.min(g.radiusMm, 1.5));
const diskVerts: number[] = [];
for (let v = 0; v < nV; v += 1) if (inRouted(vth[v], vz[v])) diskVerts.push(v);
const diskHA = sortedSub(diskVerts, hA);
const diskP50 = pctOf(diskHA, 0.5);
const D3ratio = diskP50 / lattHAp50;
const D3 = D3ratio <= D3_RATIO_BAR;
log(`\n--- D3: THE ${patches.length} DECLARED REGIONS (patches.json, radius min(r,1.5) mm) ---`);
log(`  ${diskVerts.length} source vertices   hA p10 ${um(pctOf(diskHA, 0.1))}  p50 ${um(diskP50)}  p90 ${um(pctOf(diskHA, 0.9))} um`);
log(`  disk hA p50 / lattice hA p50 = ${D3ratio.toFixed(4)}   bar <= ${D3_RATIO_BAR.toFixed(2)}`
  + `   ==> D3 ${D3 ? 'HOLDS' : '*** FAILS — E1 NO-GO ***'}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D4 — THE z 40-60 PHASE-2 BAND IS TIGHTER (the two named demand sites are at z 44.16992 and 45.38896)
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n--- D4: THE z-PROFILE, 5 mm bins ---');
const zBins: number[][] = [];
for (let i = 0; i < 24; i += 1) zBins.push([]);
for (let v = 0; v < nV; v += 1) zBins[Math.min(23, Math.max(0, Math.floor(vz[v] / 5)))].push(v);
const zP50: number[] = [];
for (let i = 0; i < 24; i += 1) zP50.push(pctOf(sortedSub(zBins[i], hA), 0.5));
{
  let line = '  ';
  for (let i = 0; i < 24; i += 1) {
    line += `${String(i * 5).padStart(3)}-${String(i * 5 + 5).padStart(3)}:${um(zP50[i]).padStart(7)}  `;
    if (i % 4 === 3) { log(line); line = '  '; }
  }
}
const allIdx = Int32Array.from({ length: nV }, (_, i) => i);
const allHAsorted = sortedSub(allIdx, hA);
const wholeP50 = pctOf(allHAsorted, 0.5);
const histBins = [8, 9, 10, 11];                       // z 40-45, 45-50, 50-55, 55-60 — the RETIRED landmark
const histVerts: number[] = [];
for (const i of histBins) for (const v of zBins[i]) histVerts.push(v);
const histP50 = pctOf(sortedSub(histVerts, hA), 0.5);
let coarsest = 0; for (let i = 1; i < 24; i += 1) if (zP50[i] > zP50[coarsest]) coarsest = i;
let finest = 0; for (let i = 1; i < 24; i += 1) if (Number.isFinite(zP50[i]) && zP50[i] < zP50[finest]) finest = i;
// ── D4' — THE AMENDMENT (worklog commit 863715d4, registered BEFORE this re-score). The original bar
//    named z 40-60 from the two demand sites at z 44.16992 / 45.38896 — sites S15 CLOSED (38.061 -> 0.667,
//    40.006 -> 3.816 um) and whose argmax MOVED. `_S22B`'s own report line 83 reads
//    `MAX-locus: z=[76.40,76.38,75.97]`, so the arm's OWN argmax is the landmark, not a retired one.
const ARGMAX_Z = 76.40;
const finestMid = finest * 5 + 2.5;
const D4a = Math.abs(finestMid - ARGMAX_Z) <= 10.0;
const argBins = [14, 15, 16];                          // z 70-75, 75-80, 80-85
const argVerts: number[] = [];
for (const i of argBins) for (const v of zBins[i]) argVerts.push(v);
const argP50 = pctOf(sortedSub(argVerts, hA), 0.5);
const D4b = argP50 < wholeP50;
const D4 = D4a && D4b;
log(`  whole-wall hA p50 ${um(wholeP50)} um`);
log(`  coarsest 5 mm bin z ${coarsest * 5}-${coarsest * 5 + 5} at ${um(zP50[coarsest])} um`
  + `   (that is undecorated wall — D1's designed lattice showing up in the z profile where it should)`);
log(`  (i)  FINEST 5 mm bin z ${finest * 5}-${finest * 5 + 5} at ${um(zP50[finest])} um;  |mid - 76.40| = `
  + `${Math.abs(finestMid - ARGMAX_Z).toFixed(2)} mm   bar <= 10.0 mm against _S22B's OWN MAX-locus z 76.40`
  + `   ${D4a ? 'HOLDS' : '*** FAILS ***'}`);
log(`  (ii) z[70,85] hA p50 ${um(argP50)} um  (x${(argP50 / wholeP50).toFixed(3)} of whole-wall)   bar < 1.000`
  + `   ${D4b ? 'HOLDS' : '*** FAILS ***'}`);
log(`  REPORTED, NOT BARRED — the RETIRED landmark: z[40,60] hA p50 ${um(histP50)} um`
  + `  (x${(histP50 / wholeP50).toFixed(3)});  S15 closed both sites there, which is why it is not a finding.`);
log(`  ==> D4' ${D4 ? 'HOLDS' : '*** FAILS — E1 NO-GO ***'}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D7 — CONSTRUCTIBILITY AGAINST THE CONSTRUCTOR'S OWN HARD FLOOR.  NEW BAR, registered in the worklog
// (commit 863715d4) before this re-score. `_strataAlignedSeed.ts:398` ASSERTS `acrossMinMm*0.55 >
// pslgEpsMm` with a THROW, so 36.4 um is a floor the constructor is ARCHITECTURALLY forbidden to go below.
// A field it cannot honour is not a usable field, and D0-D6 do not test for that at all.
// THE BAR IS ON hA, NOT hMin: hMin is the ACROSS scale of a deliberately anisotropic element (a designed
// 50 x 400 um element has hMin 50 by construction); hA is the DENSITY scalar the constructor is priced by.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n--- D7: CONSTRUCTIBILITY against the seed builder\'s own hard floor ---');
const hAsorted = allHAsorted;
const hMinSorted = sortedSub(allIdx, hMin);
const fracBelow = (s: number[], v: number): number => {
  let lo = 0; let hi = s.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; }
  return lo / s.length;
};
const d7hA36 = fracBelow(hAsorted, PSLG_FLOOR_MM);
const d7hA50 = fracBelow(hAsorted, 0.050);
const d7hM36 = fracBelow(hMinSorted, PSLG_FLOOR_MM);
const d7hM50 = fracBelow(hMinSorted, 0.050);
const D7 = d7hA36 <= 0.05;
log(`  hA   below ${(PSLG_FLOOR_MM * 1000).toFixed(1)} um (the THROW floor): ${(100 * d7hA36).toFixed(3)}%`
  + `   below 50.0 um (the default across floor): ${(100 * d7hA50).toFixed(3)}%`);
log(`  hMin below ${(PSLG_FLOOR_MM * 1000).toFixed(1)} um: ${(100 * d7hM36).toFixed(3)}%`
  + `   below 50.0 um: ${(100 * d7hM50).toFixed(3)}%   [REPORTED, unbarred — hMin is the ACROSS scale of a designed anisotropic element]`);
log(`  bar: hA below ${(PSLG_FLOOR_MM * 1000).toFixed(1)} um at <= 5.000% of source vertices`
  + `   ==> D7 ${D7 ? 'HOLDS' : '*** FAILS — E1 NO-GO ***'}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D5 — THE FIELD IS A FIELD, NOT BISECTION TEXTURE.
// hA is an AREA scalar, so within-cell dispersion in it is NOT the mesh's designed anisotropy (that lives
// in hMin vs hMax) — it is exactly the refinement texture, and a field a constructor cannot honour is not
// a field.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const gCell = (x: number, y: number): number => {
  let ci = Math.floor(x / gW); ci = ((ci % gCols) + gCols) % gCols;
  const ri = Math.min(gRows - 1, Math.max(0, Math.floor(y / gHh)));
  return ri * gCols + ci;
};
const gCount = new Int32Array(gCols * gRows + 1);
for (let v = 0; v < nV; v += 1) gCount[gCell(cxArr[v], cyArr[v]) + 1] += 1;
for (let i = 0; i < gCols * gRows; i += 1) gCount[i + 1] += gCount[i];
const gIdx = new Int32Array(nV);
{
  const f = new Int32Array(gCols * gRows);
  for (let v = 0; v < nV; v += 1) { const c = gCell(cxArr[v], cyArr[v]); gIdx[gCount[c] + f[c]] = v; f[c] += 1; }
}
const gMedHA = new Float64Array(gCols * gRows);
const disp: number[] = [];
let nPop = 0; let nCellsGE4 = 0;
{
  const tmp: number[] = [];
  for (let c = 0; c < gCols * gRows; c += 1) {
    const s = gCount[c]; const e = gCount[c + 1];
    if (e === s) { gMedHA[c] = NaN; continue; }
    nPop += 1;
    tmp.length = 0;
    for (let i = s; i < e; i += 1) { const h = hA[gIdx[i]]; if (Number.isFinite(h)) tmp.push(h); }
    if (tmp.length === 0) { gMedHA[c] = NaN; continue; }
    tmp.sort((p, q) => p - q);
    gMedHA[c] = tmp[Math.floor(tmp.length / 2)];
    if (tmp.length >= 4) {
      nCellsGE4 += 1;
      const lo = tmp[Math.floor(0.10 * tmp.length)]; const hi = tmp[Math.min(tmp.length - 1, Math.floor(0.90 * tmp.length))];
      if (lo > 0) disp.push(hi / lo);
    }
  }
}
disp.sort((p, q) => p - q);
const dispP50 = pctOf(disp, 0.5);
const D5 = dispP50 <= D5_DISP_BAR;
log('\n--- D5: WITHIN-CELL DISPERSION of hA (0.25 mm reporting cells with >= 4 source vertices) ---');
log(`  ${nPop} of ${gCols * gRows} cells populated (${((100 * nPop) / (gCols * gRows)).toFixed(1)}%);  ${nCellsGE4} carry >= 4 vertices`);
log(`  p90/p10 within cell: p50 ${dispP50.toFixed(3)}  p90 ${pctOf(disp, 0.9).toFixed(3)}  p99 ${pctOf(disp, 0.99).toFixed(3)}`
  + `  MAX ${disp.length ? disp[disp.length - 1].toFixed(2) : 'n/a'}`);
log(`  bar: median <= ${D5_DISP_BAR.toFixed(1)}   ==> D5 ${D5 ? 'HOLDS' : '*** FAILS — E1 NO-GO ***'}`);
// the inter-cell Lipschitz statistic — REPORTED, not barred
{
  const lip: number[] = [];
  for (let r = 0; r < gRows; r += 1) {
    for (let c = 0; c < gCols; c += 1) {
      const a = gMedHA[r * gCols + c]; if (!Number.isFinite(a)) continue;
      for (const [dr, dc] of [[0, 1], [1, 0]] as Array<[number, number]>) {
        const r2 = r + dr; if (r2 >= gRows) continue;
        const c2 = ((c + dc) % gCols + gCols) % gCols;
        const b = gMedHA[r2 * gCols + c2]; if (!Number.isFinite(b)) continue;
        lip.push(Math.abs(Math.log(a / b)) / CELL_MM);
      }
    }
  }
  lip.sort((p, q) => p - q);
  log(`  inter-cell |log(h_i/h_j)|/dist (per mm): p50 ${pctOf(lip, 0.5).toFixed(4)}  p90 ${pctOf(lip, 0.9).toFixed(4)}`
    + `  p99 ${pctOf(lip, 0.99).toFixed(4)}   [REPORTED, not barred]`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// D6 — THE COST THE FIELD IMPLIES.  N_tri = (4/sqrt3) INTEGRAL dA / h^2
// dA = sqrt( r^2 (1 + r_z^2) + r_theta^2 ) dtheta dz  — the exact area element of the swept surface, and
// the same |n| the admission instrument's own bestDot forms.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n--- D6: THE COST THE FIELD IMPLIES ---');
// D6a — the estimator's self-consistency: integrate over the mesh's OWN facets with h = mean vertex hA.
let selfN = 0; let totalArea = 0;
for (let t = 0; t < nTri; t += 1) {
  const h = (hA[ta[t]] + hA[tb[t]] + hA[tc[t]]) / 3;
  totalArea += fArea[t];
  if (h > 0) selfN += fArea[t] / ((SQRT3 / 4) * h * h);
}
log(`  total 3-D surface area of the shipped mesh: ${totalArea.toFixed(2)} mm^2`);
log(`  D6a estimator self-consistency: SUM A_f / ((sqrt3/4) hbar_f^2) = ${Math.round(selfN)}`
  + `  vs the mesh's own ${nTri}   x${(selfN / nTri).toFixed(4)}   [REPORTED]`);
// D6b — the CONSTRUCTOR-FACING prediction: integrate the nearest-vertex field over true surface area.
let fieldN = 0; let fieldArea = 0; let nBadCell = 0;
{
  const dTh = gW / rRef;                              // the reporting cell in theta
  const dZ = gHh;
  for (let r = 0; r < gRows; r += 1) {
    const z = (r + 0.5) * dZ;
    for (let c = 0; c < gCols; c += 1) {
      const th = ((c + 0.5) * gW) / rRef;
      const h = gNear[r * gCols + c];
      if (!Number.isFinite(h) || !(h > 0)) { nBadCell += 1; continue; }
      const r0 = rA(th, z);
      const rt = (rA(th + hFD, z) - rA(th - hFD, z)) / (2 * hFD);
      const rz = (rA(th, Math.min(H, z + hFD)) - rA(th, Math.max(0, z - hFD))) / (2 * hFD);
      const dA = Math.sqrt(r0 * r0 * (1 + rz * rz) + rt * rt) * dTh * dZ;
      fieldArea += dA;
      fieldN += dA / ((SQRT3 / 4) * h * h);
    }
  }
}
const D6ratio = fieldN / nTri;
const D6 = D6ratio <= D6_STOP;
const D6faithful = D6ratio >= D6_LO && D6ratio <= D6_HI;
log(`  analytic surface area over the ${gCols}x${gRows} grid: ${fieldArea.toFixed(2)} mm^2  (${nBadCell} cells with no field value)`);
log(`  D6b CONSTRUCTOR-FACING prediction: N_tri = ${Math.round(fieldN)}  vs _S22B's own ${nTri}`
  + `   x${D6ratio.toFixed(4)}`);
log(`  density-faithful band [${D6_LO}, ${D6_HI}]x: ${D6faithful ? 'INSIDE' : 'OUTSIDE (reported)'};`
  + `  NO-GO above ${D6_STOP.toFixed(1)}x: ${D6 ? 'not fired' : '*** FIRED ***'}`);
log(`  ==> D6 ${D6 ? 'HOLDS' : '*** FAILS — E1 NO-GO ***'}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE VERDICT — registered before any number above was read. FIRST MATCH WINS.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
log('\n══════════════════════════════════════════════════════════════════════════════════════════════');
log('  S23 STAGE 0 — THE REGISTERED SCORE. FIRST MATCH WINS.');
log('══════════════════════════════════════════════════════════════════════════════════════════════');
const rows: Array<[string, boolean, string]> = [
  ['D0  coverage', D0, `worst ${d0Worst.toFixed(4)} mm <= ${COVER_BAR_MM}`],
  ['D1  designed lattice', D1, `hA p50 ${um(lattHAp50)} um in [500,950];  hMin p50 ${um(lattHMINp50)} um in [193,770]`],
  ['D2\' loci contrast', D2, `hMin p50 ${um(d2HMIN[0])} <= 100;  contrast ${Number.isFinite(d2Contrast) ? d2Contrast.toFixed(3) : 'n/a'}x >= 2.0;  hMin p10 ${um(d2HMINp10)} <= 50`],
  ['D3  junction disks', D3, `${D3ratio.toFixed(4)} <= 0.50`],
  ['D4\' arm\'s own argmax', D4, `finest bin z ${finest * 5}-${finest * 5 + 5}, |mid-76.40| ${Math.abs(finestMid - ARGMAX_Z).toFixed(2)} mm <= 10;  z[70,85] x${(argP50 / wholeP50).toFixed(3)} < 1`],
  ['D5  texture dispersion', D5, `p90/p10 median ${dispP50.toFixed(3)} <= 3.0`],
  ['D6  implied cost', D6, `x${D6ratio.toFixed(4)} (< ${D6_STOP} stop; [${D6_LO},${D6_HI}] faithful)`],
  ['D7  constructibility', D7, `hA below 36.4 um at ${(100 * d7hA36).toFixed(3)}% <= 5.000%`],
];
for (const [nm, ok, det] of rows) log(`  ${ok ? 'HOLDS' : '**FAILS**'}  ${nm.padEnd(24)} ${det}`);
if (!D0) {
  log('\n  *** E0 INDETERMINATE — the field has a hole and cannot be queried. REPORT AND STOP. ***');
} else if (!(D1 && D2 && D3 && D4 && D5 && D6 && D7)) {
  log('\n  *** E1 NO-GO — THE DENSITY FIELD IS NOT EXTRACTABLE AT USABLE RESOLUTION. ***');
  log('  *** REPORT AS A RESULT AND STOP. THE RECONSTRUCTION IS NOT BUILT. ***');
} else {
  log('\n  *** E2 GO — D0-D7 all hold. The density field is extractable. BUILD. ***');
}
log('══════════════════════════════════════════════════════════════════════════════════════════════');
