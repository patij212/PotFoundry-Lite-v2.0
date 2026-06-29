// DEFECT FACE CENSUS — the RED faces in the SFB@1 slicer screenshots.
// For EVERY triangle in the binary STL: 3D area, min interior angle, aspect ratio,
// and winding (face-normal vs radial-outward at centroid).
// Reports counts + % for: (a) DEGENERATE area<1e-6; (b) INVERTED normal·outward<0;
// (c) sliver minAngle<1deg; (d) minAngle<5deg.
// Spatial: bins (theta,z) for a/b/c; tests clustering at petal-edge cusps.
// FOLD TEST: do inverted faces overlap a nearby outward face (same 3D footprint)?
// Usage: node --max-old-space-size=6144 e2e/_diag_faces.cjs [stlPath]
const fs = require('fs');
const path = require('path');

const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');
const buf = fs.readFileSync(STL);
const nTri = buf.readUInt32LE(80);
console.log(`[faces] ${path.basename(STL)} tris=${nTri}`);

// ── Raw per-face read (NO weld — we want the literal STL geometry per triangle). ──
// Each face: 50 bytes = 12(normal) + 9*4(verts) + 2(attr). Data starts at byte 84.
const TAU = Math.PI * 2;
function pct(arr, p) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }

// Accumulators
let degen = [], inverted = [], sliver1 = [], minA5 = [];
let areas = [], minAngles = [], aspects = [];
let nOuter = 0; // outer-wall faces considered for spatial binning

// store per-face data we need for fold-test + spatial: centroid, normal, theta, z, area, cr
const faceTheta = new Float32Array(nTri);
const faceZ = new Float32Array(nTri);
const faceCx = new Float32Array(nTri);
const faceCy = new Float32Array(nTri);
const faceCz = new Float32Array(nTri);
const faceNx = new Float32Array(nTri);
const faceNy = new Float32Array(nTri);
const faceNz = new Float32Array(nTri);
const faceArea = new Float32Array(nTri);
const faceFlag = new Uint8Array(nTri); // bit0 degen, bit1 inverted, bit2 sliver1, bit3 min5, bit4 outerWall

let off = 84;
for (let t = 0; t < nTri; t++) {
  const b = off + 12; // skip stored normal; recompute from geometry
  const ax = buf.readFloatLE(b), ay = buf.readFloatLE(b + 4), az = buf.readFloatLE(b + 8);
  const bx = buf.readFloatLE(b + 12), by = buf.readFloatLE(b + 16), bz = buf.readFloatLE(b + 20);
  const cx = buf.readFloatLE(b + 24), cy = buf.readFloatLE(b + 28), cz = buf.readFloatLE(b + 32);
  off += 50;

  // edges
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const vx = cx - ax, vy = cy - ay, vz = cz - az;
  // cross = u x v
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const nl = Math.hypot(nx, ny, nz);
  const area = 0.5 * nl;

  // edge lengths
  const eAB = Math.hypot(bx - ax, by - ay, bz - az);
  const eBC = Math.hypot(cx - bx, cy - by, cz - bz);
  const eCA = Math.hypot(ax - cx, ay - cy, az - cz);
  const lo = Math.min(eAB, eBC, eCA), hi = Math.max(eAB, eBC, eCA);
  const aspect = hi / Math.max(1e-12, lo);

  // min interior angle (law of cosines) — degrees. Guard degenerate edges.
  let minAng;
  if (eAB < 1e-9 || eBC < 1e-9 || eCA < 1e-9) {
    minAng = 0;
  } else {
    const ang = (o1, o2, opp) => Math.acos(Math.max(-1, Math.min(1, (o1 * o1 + o2 * o2 - opp * opp) / (2 * o1 * o2)))) * 180 / Math.PI;
    minAng = Math.min(ang(eAB, eCA, eBC), ang(eAB, eBC, eCA), ang(eBC, eCA, eAB));
  }

  // centroid
  const ccx = (ax + bx + cx) / 3, ccy = (ay + by + cy) / 3, ccz = (az + bz + cz) / 3;
  const cr = Math.hypot(ccx, ccy);
  const theta = Math.atan2(ccy, ccx); // [-pi,pi]
  const thetaN = (theta + TAU) % TAU;

  // winding: dot(faceNormal, radial-outward at centroid). radial-outward = [ccx,ccy,0]/r.
  // For the OUTER wall the correct normal points OUTWARD (dot>0). dot<0 => inverted winding.
  let dotOut = 0;
  if (nl > 1e-12 && cr > 1e-9) {
    dotOut = (nx * ccx + ny * ccy + nz * 0) / (nl * cr);
  }

  // classify
  let flag = 0;
  if (area < 1e-6) flag |= 1;
  if (dotOut < 0) flag |= 2;
  if (minAng < 1) flag |= 4;
  if (minAng < 5) flag |= 8;

  // outer-wall membership (same filter as reference analyzer): cr>42, z in [8,112]
  const isOuter = cr > 42 && ccz > 8 && ccz < 112;
  if (isOuter) flag |= 16;

  faceTheta[t] = thetaN; faceZ[t] = ccz; faceCx[t] = ccx; faceCy[t] = ccy; faceCz[t] = ccz;
  faceNx[t] = nl > 1e-12 ? nx / nl : 0; faceNy[t] = nl > 1e-12 ? ny / nl : 0; faceNz[t] = nl > 1e-12 ? nz / nl : 0;
  faceArea[t] = area; faceFlag[t] = flag;

  areas.push(area); minAngles.push(minAng); if ((t & 7) === 0) aspects.push(aspect);
  if (flag & 1) degen.push(t);
  if (flag & 2) inverted.push(t);
  if (flag & 4) sliver1.push(t);
  if (flag & 8) minA5.push(t);
  if (isOuter) nOuter++;
}

const f = (n) => `${n} (${(100 * n / nTri).toFixed(3)}%)`;
console.log(`\n[AREA] mm^2  p1=${pct(areas, 0.01).toExponential(2)} p50=${pct(areas, 0.5).toExponential(2)} p99=${pct(areas, 0.99).toExponential(2)} max=${pct(areas, 1).toExponential(2)}`);
console.log(`[MIN-ANGLE deg] p1=${pct(minAngles, 0.01).toFixed(2)} p50=${pct(minAngles, 0.5).toFixed(1)} mean=${(minAngles.reduce((a, b) => a + b, 0) / nTri).toFixed(1)}`);
console.log(`[ASPECT] (sampled 1/8) p50=${pct(aspects, 0.5).toFixed(2)} p99=${pct(aspects, 0.99).toFixed(1)} max=${pct(aspects, 1).toFixed(1)}`);
console.log(`\n[CENSUS over all ${nTri} faces]`);
console.log(`  (a) DEGENERATE area<1e-6 mm^2 : ${f(degen.length)}`);
console.log(`  (b) INVERTED  n.out<0         : ${f(inverted.length)}`);
console.log(`  (c) SLIVER    minAngle<1deg   : ${f(sliver1.length)}`);
console.log(`  (d)           minAngle<5deg   : ${f(minA5.length)}`);
console.log(`  outer-wall faces (cr>42,z8..112): ${f(nOuter)}`);

// ── SPATIAL DISTRIBUTION: bin (theta,z). Petals are periodic in theta. ──
// SFB usually has m-fold symmetry; detect dominant theta period of the defect set.
function thetaHistogram(idxs, label, nbins = 72) {
  if (idxs.length === 0) { console.log(`  [${label}] (none)`); return; }
  const bins = new Array(nbins).fill(0);
  for (const t of idxs) bins[Math.min(nbins - 1, Math.floor(faceTheta[t] / TAU * nbins))]++;
  const zbins = 12; const zb = new Array(zbins).fill(0);
  let zmin = 1e9, zmax = -1e9;
  for (const t of idxs) { if (faceZ[t] < zmin) zmin = faceZ[t]; if (faceZ[t] > zmax) zmax = faceZ[t]; }
  for (const t of idxs) zb[Math.min(zbins - 1, Math.floor((faceZ[t] - zmin) / Math.max(1e-9, zmax - zmin) * zbins))]++;
  const mx = Math.max(...bins);
  const spark = bins.map((v) => ' .:-=+*#%@'[Math.min(9, Math.floor(v / Math.max(1, mx) * 9))]).join('');
  console.log(`  [${label}] n=${idxs.length} theta-hist(${nbins}b, 0..2pi):`);
  console.log(`    |${spark}|  peakBin=${mx}`);
  console.log(`    z-range=[${zmin.toFixed(1)},${zmax.toFixed(1)}]mm  z-hist(${zbins}b): ${zb.join(',')}`);
}
console.log(`\n[SPATIAL — theta(72 bins) & z]`);
thetaHistogram(degen, 'DEGENERATE');
thetaHistogram(inverted, 'INVERTED');
thetaHistogram(sliver1, 'SLIVER<1');

// ── CUSP CLUSTERING: petal cusps = high radial-gradient theta boundaries. ──
// Build a per-theta-bin mean centroid-radius profile from outer-wall faces; cusps =
// thetas where |d(r)/d(theta)| is large (ridge->valley boundary). Then measure what
// fraction of defect faces sit within a narrow band of those high-gradient thetas.
const RB = 360; // fine theta bins for radius profile
const rSum = new Float64Array(RB), rCnt = new Float64Array(RB);
for (let t = 0; t < nTri; t++) {
  if (!(faceFlag[t] & 16)) continue; // outer wall only
  const cr = Math.hypot(faceCx[t], faceCy[t]);
  const bi = Math.min(RB - 1, Math.floor(faceTheta[t] / TAU * RB));
  rSum[bi] += cr; rCnt[bi]++;
}
const rProf = new Float64Array(RB);
for (let i = 0; i < RB; i++) rProf[i] = rCnt[i] > 0 ? rSum[i] / rCnt[i] : NaN;
// fill gaps by neighbor
for (let i = 0; i < RB; i++) if (Number.isNaN(rProf[i])) rProf[i] = rProf[(i + RB - 1) % RB] || 40;
// gradient magnitude
const grad = new Float64Array(RB);
for (let i = 0; i < RB; i++) grad[i] = Math.abs(rProf[(i + 1) % RB] - rProf[(i + RB - 1) % RB]);
// cusp bins = top fraction of gradient
const gsorted = Array.from(grad).sort((a, b) => b - a);
const gThresh = gsorted[Math.floor(0.15 * RB)]; // top 15% gradient bins = cusp zone
const cuspBin = new Uint8Array(RB);
let nCuspBins = 0;
for (let i = 0; i < RB; i++) if (grad[i] >= gThresh) { cuspBin[i] = 1; nCuspBins++; }
const rMax = Math.max(...rProf), rMin = Math.min(...rProf);
console.log(`\n[CUSP PROFILE] outer-wall mean-r over theta: min=${rMin.toFixed(1)} max=${rMax.toFixed(1)} amp=${(rMax - rMin).toFixed(1)}mm`);
// estimate petal count = number of r-profile maxima
let nPeaks = 0;
for (let i = 0; i < RB; i++) { const p = rProf[(i + RB - 1) % RB], c = rProf[i], n = rProf[(i + 1) % RB]; if (c > p && c >= n && c > rMin + 0.4 * (rMax - rMin)) nPeaks++; }
console.log(`[CUSP PROFILE] estimated petal lobes (r maxima) ~= ${nPeaks}; cusp(high-grad) bins=${nCuspBins}/${RB} (${(100 * nCuspBins / RB).toFixed(0)}%)`);

function cuspFraction(idxs, label) {
  if (idxs.length === 0) { console.log(`  [${label}] (none)`); return; }
  let inCusp = 0;
  for (const t of idxs) { const bi = Math.min(RB - 1, Math.floor(faceTheta[t] / TAU * RB)); if (cuspBin[bi]) inCusp++; }
  const expectedRandom = nCuspBins / RB;
  const observed = inCusp / idxs.length;
  const enrich = observed / Math.max(1e-9, expectedRandom);
  console.log(`  [${label}] in-cusp ${inCusp}/${idxs.length} = ${(100 * observed).toFixed(1)}%  (random≈${(100 * expectedRandom).toFixed(0)}%)  ENRICHMENT=${enrich.toFixed(2)}x`);
}
console.log(`[CUSP CLUSTERING] (cusp=top-15% radial-gradient thetas; enrichment>1 => clusters at cusps)`);
cuspFraction(degen, 'DEGENERATE');
cuspFraction(inverted, 'INVERTED');
cuspFraction(sliver1, 'SLIVER<1');
cuspFraction(minA5, 'minAngle<5');

// ── FOLD TEST: does each inverted face overlap a nearby OUTWARD face occupying ──
// nearly the same 3D footprint? Spatial hash on centroid; for each inverted face find
// an outward face whose centroid is within a small radius AND whose 3D footprint
// overlaps (centroid distance < ~ the inverted face's own size + normals anti-parallel).
console.log(`\n[FOLD TEST] (inverted face paired with a nearby outward face on same footprint = a fold)`);
if (inverted.length === 0) {
  console.log(`  no inverted faces.`);
} else {
  // build centroid hash of ALL outward faces (flag bit1 == 0)
  const CELL = 0.5; // mm grid
  const hkey = (x, y, z) => `${Math.round(x / CELL)},${Math.round(y / CELL)},${Math.round(z / CELL)}`;
  const grid = new Map();
  for (let t = 0; t < nTri; t++) {
    if (faceFlag[t] & 2) continue; // skip inverted; we want outward partners
    const k = hkey(faceCx[t], faceCy[t], faceCz[t]);
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(t);
  }
  // characteristic face size ~ sqrt(area)
  let nFold = 0, nAntiParallel = 0, sampleReported = 0;
  const sampleN = Math.min(inverted.length, 200000);
  const distSamples = [];
  for (let s = 0; s < sampleN; s++) {
    const it = inverted[s];
    const ix = faceCx[it], iy = faceCy[it], iz = faceCz[it];
    const isize = Math.sqrt(Math.max(faceArea[it], 1e-9));
    const reach = Math.max(isize * 1.5, 0.15); // footprint overlap reach
    // search neighbouring cells
    let best = -1, bestD = 1e9;
    const gx = Math.round(ix / CELL), gy = Math.round(iy / CELL), gz = Math.round(iz / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(`${gx + dx},${gy + dy},${gz + dz}`); if (!a) continue;
      for (const ot of a) {
        const d = Math.hypot(faceCx[ot] - ix, faceCy[ot] - iy, faceCz[ot] - iz);
        if (d < bestD) { bestD = d; best = ot; }
      }
    }
    if (best >= 0) {
      distSamples.push(bestD);
      // anti-parallel normals => the two faces face opposite ways = fold sheet
      const dotNN = faceNx[it] * faceNx[best] + faceNy[it] * faceNy[best] + faceNz[it] * faceNz[best];
      const overlaps = bestD < reach;
      if (dotNN < -0.3) nAntiParallel++;
      if (overlaps) nFold++;
      if (sampleReported < 6 && overlaps && dotNN < -0.3) {
        console.log(`    fold ex: inv face@(r=${Math.hypot(ix, iy).toFixed(2)},z=${iz.toFixed(2)},th=${(faceTheta[it] / TAU * 360).toFixed(1)}deg) <-> outward face dist=${bestD.toFixed(3)}mm dotNN=${dotNN.toFixed(2)} invArea=${faceArea[it].toExponential(2)}`);
        sampleReported++;
      }
    }
  }
  console.log(`  sampled ${sampleN} inverted faces:`);
  console.log(`    nearest-outward-centroid dist: p50=${pct(distSamples, 0.5).toFixed(3)} p90=${pct(distSamples, 0.9).toFixed(3)} mm`);
  console.log(`    inverted faces overlapping an outward face (dist<footprint): ${nFold} (${(100 * nFold / sampleN).toFixed(1)}%)`);
  console.log(`    inverted faces with an anti-parallel (dotNN<-0.3) outward neighbour: ${nAntiParallel} (${(100 * nAntiParallel / sampleN).toFixed(1)}%)  [= fold sheet]`);
}

// ── DEFECT CO-LOCATION: how many inverted faces are ALSO slivers? ──
let invSliver = 0, invDegen = 0;
for (const t of inverted) { if (faceFlag[t] & 4) invSliver++; if (faceFlag[t] & 1) invDegen++; }
console.log(`\n[CO-LOCATION] inverted faces that are also slivers(<1deg)=${invSliver} (${(100 * invSliver / Math.max(1, inverted.length)).toFixed(1)}%), also degenerate=${invDegen}`);
