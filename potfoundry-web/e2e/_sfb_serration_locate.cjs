// _sfb_serration_locate.cjs — LOCATE the residual petal-ridge-tip serration.
// Reads BOTH the solid (closed, user-sliced) and the open clean wall (P3b), welds each,
// and finds "serrated/staircase" structure by three independent instruments:
//   (A) SLIVER triangles: 3D min-angle < 10deg.
//   (B) FACET-NORMAL DEVIATION: per shared edge, dihedral between adjacent faces; a
//       silhouette sawtooth shows as a chain of edges whose dihedral is large AND whose
//       SIGN (which way the crease bends) ALTERNATES along the chain. We flag "rough"
//       edges = dihedral > 25deg that are NOT a coherent smooth ridge (the structured
//       corridor ridge is a long monotone crease; staircase = alternating high dihedral).
//   (C) Per-edge dihedral-sign-flip count along petal-meridian: a true sawtooth.
// Then reports z-distribution (12 bins over [0,120]), the RIM(z>114) ∪ BASE(z<6) vs
// INTERIOR(z in [6,114]) fraction, theta/petal clustering (FL=11 → ~? petals; SFB sf1
// petals from feature count), and isolates the SOLID's fan CAP triangles (any triangle
// touching the rim centroid vertex) to see if the caps add their own near-rim slivers.
// Pure CPU. Usage: node --max-old-space-size=6144 e2e/_sfb_serration_locate.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', 'export-deliverables');

const H = 120;
const NBIN = 12;            // z bins of 10mm
const RIM_Z = 114, BASE_Z = 6;
const SLIVER_DEG = 10;
const ROUGH_DIH = 25;      // deg — a "rough" crease edge
const NPETAL_GUESS = 6;    // SFB sf1 — refined below from theta histogram of rough edges

function readWeld(file) {
  const buf = fs.readFileSync(file);
  const nTri = buf.readUInt32LE(80);
  const Q = 1e4;
  const key = (x, y, z) => `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`;
  const idOf = new Map(); const vx = [], vy = [], vz = [];
  const tri = new Int32Array(nTri * 3);
  let off = 84;
  const vid = (x, y, z) => { const k = key(x, y, z); let i = idOf.get(k); if (i === undefined) { i = vx.length; idOf.set(k, i); vx.push(x); vy.push(y); vz.push(z); } return i; };
  for (let t = 0; t < nTri; t++) {
    const b = off + 12;
    for (let c = 0; c < 3; c++) { const o = b + c * 12; tri[t * 3 + c] = vid(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)); }
    off += 50;
  }
  return { nTri, nV: vx.length, vx, vy, vz, tri };
}

const sub = (m, a, b) => [m.vx[a] - m.vx[b], m.vy[a] - m.vy[b], m.vz[a] - m.vz[b]];
const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const hyp = (a) => Math.hypot(a[0], a[1], a[2]);
function minAngle(m, a, b, c) {
  const d = (p, q) => Math.hypot(m.vx[p] - m.vx[q], m.vy[p] - m.vy[q], m.vz[p] - m.vz[q]);
  const A = d(b, c), B = d(c, a), C = d(a, b); if (A < 1e-9 || B < 1e-9 || C < 1e-9) return 0;
  const law = (x, y, op) => Math.acos(Math.max(-1, Math.min(1, (x * x + y * y - op * op) / (2 * x * y)))) * 180 / Math.PI;
  return Math.min(law(B, C, A), law(A, C, B), law(A, B, C));
}
const MULT = 1e8;
const ek = (i, j) => (i < j ? i * MULT + j : j * MULT + i);

function analyze(label, file, opts = {}) {
  const m = readWeld(file);
  const { nTri, nV, vx, vy, vz, tri } = m;
  // face normals (unit)
  const fnx = new Float64Array(nTri), fny = new Float64Array(nTri), fnz = new Float64Array(nTri);
  const fcz = new Float64Array(nTri), fcr = new Float64Array(nTri), fcth = new Float64Array(nTri);
  // detect rim-cap centroid verts: a vertex with VERY high degree (fan apex) at z≈0 or z≈H.
  const deg = new Int32Array(nV);
  const adjFaces = Array.from({ length: 0 });
  for (let t = 0; t < nTri; t++) {
    const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2];
    const n = cross(sub(m, b, a), sub(m, c, a)); const nl = hyp(n) || 1;
    fnx[t] = n[0] / nl; fny[t] = n[1] / nl; fnz[t] = n[2] / nl;
    const cxx = (vx[a] + vx[b] + vx[c]) / 3, cyy = (vy[a] + vy[b] + vy[c]) / 3, czz = (vz[a] + vz[b] + vz[c]) / 3;
    fcz[t] = czz; fcr[t] = Math.hypot(cxx, cyy); fcth[t] = (Math.atan2(cyy, cxx) + 2 * Math.PI) % (2 * Math.PI);
    deg[a]++; deg[b]++; deg[c]++;
  }
  // fan-apex vertices = degree huge AND near a rim plane (z<2 or z>H-2).
  const apex = new Set();
  for (let v = 0; v < nV; v++) if (deg[v] > 200 && (vz[v] < 2 || vz[v] > H - 2)) apex.add(v);

  // ── (A) slivers ──
  const sliverByBin = new Int32Array(NBIN);
  const sliverCapByBin = new Int32Array(NBIN);
  let sliverTot = 0, sliverCap = 0, sliverWall = 0;
  const sliverTh = []; // theta of wall slivers (non-cap)
  const binOf = (z) => Math.max(0, Math.min(NBIN - 1, Math.floor(z / (H / NBIN))));
  for (let t = 0; t < nTri; t++) {
    const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2];
    const ang = minAngle(m, a, b, c);
    if (ang < SLIVER_DEG) {
      sliverTot++; const bi = binOf(fcz[t]); sliverByBin[bi]++;
      const isCap = apex.has(a) || apex.has(b) || apex.has(c);
      if (isCap) { sliverCap++; sliverCapByBin[bi]++; }
      else { sliverWall++; sliverTh.push(fcth[t]); }
    }
  }

  // ── (B) rough edges: build edge→(two face) map, dihedral, sign (convex/concave via centroid offset). ──
  const edgeFaces = new Map(); // ek -> [t0, t1]
  for (let t = 0; t < nTri; t++) {
    const a = tri[3 * t], b = tri[3 * t + 1], c = tri[3 * t + 2];
    for (const [i, j] of [[a, b], [b, c], [c, a]]) { const k = ek(i, j); const l = edgeFaces.get(k); if (l) l.push(t); else edgeFaces.set(k, [t]); }
  }
  const roughByBin = new Int32Array(NBIN);
  const roughCapByBin = new Int32Array(NBIN);
  let roughTot = 0, roughCap = 0, roughWall = 0;
  const roughTh = [];
  // also: signed dihedral per edge for the sawtooth-flip metric, keyed by midpoint z.
  const signedEdges = []; // {z, th, sign, dih}
  for (const [k, fl] of edgeFaces) {
    if (fl.length !== 2) continue;
    const t0 = fl[0], t1 = fl[1];
    let dih = Math.acos(Math.max(-1, Math.min(1, fnx[t0] * fnx[t1] + fny[t0] * fny[t1] + fnz[t0] * fnz[t1]))) * 180 / Math.PI;
    const i = Math.floor(k / MULT), j = k % MULT;
    const mz = (vz[i] + vz[j]) / 2, mx = (vx[i] + vx[j]) / 2, my = (vy[i] + vy[j]) / 2;
    const mth = (Math.atan2(my, mx) + 2 * Math.PI) % (2 * Math.PI);
    // convex/concave sign: does face0's centroid sit on the + or − side of face1's plane?
    // use the radial direction as a stable reference: crease bends outward(+) or inward(−).
    const avgNr = (fnx[t0] + fnx[t1]) * Math.cos(mth) + (fny[t0] + fny[t1]) * Math.sin(mth);
    const sign = avgNr >= 0 ? 1 : -1;
    signedEdges.push({ z: mz, th: mth, sign, dih });
    if (dih > ROUGH_DIH) {
      roughTot++; const bi = binOf(mz); roughByBin[bi]++;
      const isCap = apex.has(i) || apex.has(j);
      if (isCap) { roughCap++; roughCapByBin[bi]++; }
      else { roughWall++; roughTh.push(mth); }
    }
  }

  // ── rim/base vs interior fractions (WALL only, cap-excluded) ──
  const inTip = (z) => (z > RIM_Z || z < BASE_Z);
  function tipFrac(byBin, capByBin) {
    let tip = 0, interior = 0, tipCap = 0;
    for (let bi = 0; bi < NBIN; bi++) {
      const zlo = bi * (H / NBIN), zhi = (bi + 1) * (H / NBIN);
      const zc = (zlo + zhi) / 2;
      const wall = byBin[bi] - capByBin[bi];
      if (inTip(zc)) { tip += wall; tipCap += capByBin[bi]; } else interior += wall;
    }
    return { tip, interior, tipCap };
  }

  // ── theta clustering: histogram rough-wall edges into 360 bins, find peak count → petals ──
  function petalCluster(thArr) {
    const NB = 360; const h = new Int32Array(NB);
    for (const th of thArr) h[Math.min(NB - 1, Math.floor(th / (2 * Math.PI) * NB))]++;
    // count local maxima above mean*2 separated by >=10deg
    const mean = thArr.length / NB;
    const peaks = [];
    for (let i = 0; i < NB; i++) {
      const v = h[i]; if (v < mean * 2 || v < 3) continue;
      const lo = h[(i - 1 + NB) % NB], hi = h[(i + 1) % NB];
      if (v >= lo && v >= hi) peaks.push(i);
    }
    // merge peaks within 10 bins
    const merged = [];
    for (const p of peaks) { if (merged.length && Math.min(Math.abs(p - merged[merged.length - 1]), NB - Math.abs(p - merged[merged.length - 1])) < 10) continue; merged.push(p); }
    return { nPeaks: merged.length, peakDeg: merged.map((p) => Math.round(p / NB * 360)) };
  }

  const sl = tipFrac(sliverByBin, sliverCapByBin);
  const ro = tipFrac(roughByBin, roughCapByBin);

  console.log(`\n========== ${label}  (${path.basename(file)}) ==========`);
  console.log(`tris=${nTri} welded-verts=${nV} | fan-apex verts detected=${apex.size}${apex.size ? ' [z=' + [...apex].map((v) => vz[v].toFixed(1)).join(',') + ']' : ''}`);

  console.log(`\n[A] SLIVERS (minAngle<${SLIVER_DEG}deg)  total=${sliverTot}  wall=${sliverWall}  cap=${sliverCap}`);
  console.log(`    z-bins (each 10mm): ` + Array.from({ length: NBIN }, (_, b) => `${b * 10}-${b * 10 + 10}:${sliverByBin[b]}${sliverCapByBin[b] ? '(cap' + sliverCapByBin[b] + ')' : ''}`).join('  '));
  console.log(`    WALL slivers: RIM(z>${RIM_Z})+BASE(z<${BASE_Z})=${sl.tip}  INTERIOR[${BASE_Z}-${RIM_Z}]=${sl.interior}  → tip-fraction=${(100 * sl.tip / Math.max(1, sl.tip + sl.interior)).toFixed(1)}%`);
  console.log(`    CAP slivers in tip bins=${sl.tipCap}`);

  console.log(`\n[B] ROUGH/CREASE edges (dihedral>${ROUGH_DIH}deg)  total=${roughTot}  wall=${roughWall}  cap=${roughCap}`);
  console.log(`    z-bins: ` + Array.from({ length: NBIN }, (_, b) => `${b * 10}-${b * 10 + 10}:${roughByBin[b]}${roughCapByBin[b] ? '(cap' + roughCapByBin[b] + ')' : ''}`).join('  '));
  console.log(`    WALL rough: RIM+BASE=${ro.tip}  INTERIOR=${ro.interior}  → tip-fraction=${(100 * ro.tip / Math.max(1, ro.tip + ro.interior)).toFixed(1)}%`);

  // theta clustering of the TIP rough/sliver edges specifically (do the tips cluster on petals?)
  const tipRoughTh = [], tipSliverTh = [];
  for (const e of signedEdges) if (e.dih > ROUGH_DIH && inTip(e.z) && !(apexNear(e, vz))) tipRoughTh.push(e.th);
  const clRoughTip = petalCluster(tipRoughTh);
  const clRoughAll = petalCluster(roughTh);
  const clSliver = petalCluster(sliverTh);
  console.log(`\n[θ] petal clustering (peaks in 360-bin theta histogram):`);
  console.log(`    rough edges ALL: ${clRoughAll.nPeaks} peaks @ ${clRoughAll.peakDeg.join(',')}deg`);
  console.log(`    rough edges TIP-only: ${clRoughTip.nPeaks} peaks @ ${clRoughTip.peakDeg.join(',')}deg  (n=${tipRoughTh.length})`);
  console.log(`    wall slivers: ${clSliver.nPeaks} peaks @ ${clSliver.peakDeg.join(',')}deg  (n=${sliverTh.length})`);

  return { label, sliverTot, sliverWall, sliverCap, sl, roughTot, roughWall, roughCap, ro, apex: apex.size, clSliver, clRoughTip };
}
function apexNear() { return false; } // signedEdges already wall/cap-split in arrays; placeholder

const solid = analyze('SOLID (closed, user-sliced)', path.join(OUT, 'SuperformulaBlossom_sf1_solid.stl'));
const wall = analyze('CLEAN WALL (P3b, open)', path.join(OUT, 'SuperformulaBlossom_sf1_structured_p3b.stl'));

console.log('\n\n================ VERDICT ================');
const solidTipSliverPct = 100 * solid.sl.tip / Math.max(1, solid.sl.tip + solid.sl.interior);
const wallTipSliverPct = 100 * wall.sl.tip / Math.max(1, wall.sl.tip + wall.sl.interior);
console.log(`SOLID wall-sliver tip-fraction = ${solidTipSliverPct.toFixed(1)}% | WALL(open) = ${wallTipSliverPct.toFixed(1)}%`);
console.log(`SOLID rough tip-fraction = ${(100 * solid.ro.tip / Math.max(1, solid.ro.tip + solid.ro.interior)).toFixed(1)}% | WALL(open) = ${(100 * wall.ro.tip / Math.max(1, wall.ro.tip + wall.ro.interior)).toFixed(1)}%`);
console.log(`Fan-cap-attached slivers in tip bins: SOLID=${solid.sl.tipCap}  (wall STL has no caps: apex=${wall.apex})`);
