// T0 refinement: is the off-surface error at the PETAL CUSPS (convex tips) and is the
// theta=359.8 cluster a real cusp or a seam artifact? Measure |r-R| vs angular distance
// to the nearest superformula PEAK (local max of R(theta)) at the vertex's z.
const fs = require('fs');
const path = require('path');
const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');
const EPSILON = 1e-9, TAU = 2 * Math.PI, H = 120, Rb = 40, Rt = 40, expn = 1;
const SF = { sfMBase: 6, sfMTop: 10, sfMCurveExp: 1.2, sfN1: 0.35, sfN1Top: 0.5, sfN2: 0.8, sfN2Top: 1.4, sfN3: 0.8, sfN3Top: 0.8, sfA: 1, sfB: 1 };
function sfv(theta, m, n1, n2, n3, a, b) {
  const c = Math.pow(Math.abs(Math.cos(m * theta / 4) / Math.max(a, EPSILON)), n2);
  const s = Math.pow(Math.abs(Math.sin(m * theta / 4) / Math.max(b, EPSILON)), n3);
  const denom = Math.pow(c + s, 1 / Math.max(n1, EPSILON));
  if (denom <= EPSILON) return 0; return Math.min(1 / denom, 4);
}
function Rtrue(theta, z) {
  const t = z / H;
  const m = SF.sfMBase + (SF.sfMTop - SF.sfMBase) * Math.pow(t, SF.sfMCurveExp);
  const n1 = SF.sfN1 + (SF.sfN1Top - SF.sfN1) * t, n2 = SF.sfN2 + (SF.sfN2Top - SF.sfN2) * t, n3 = SF.sfN3 + (SF.sfN3Top - SF.sfN3) * t;
  const seamOffset = Math.PI / Math.max(m, 1);
  return (Rb) * (0.9 + 0.35 * sfv(theta + seamOffset, m, n1, n2, n3, SF.sfA, SF.sfB));
}
// Find peaks/valleys of R(theta) at given z by dense scan.
function extrema(z, N = 7200) {
  const peaks = [], valleys = [];
  let pr = Rtrue((N - 1) / N * TAU, z), cr = Rtrue(0, z), nr;
  for (let i = 0; i < N; i++) {
    const thn = (i + 1) / N * TAU; nr = Rtrue(thn, z);
    const th = i / N * TAU;
    if (cr > pr && cr >= nr) peaks.push({ th, r: cr });
    if (cr < pr && cr <= nr) valleys.push({ th, r: cr });
    pr = cr; cr = nr;
  }
  return { peaks, valleys };
}
// angular distance
function adist(a, b) { let d = Math.abs(a - b) % TAU; return Math.min(d, TAU - d); }

const buf = fs.readFileSync(STL); const nTri = buf.readUInt32LE(80);
const Q = 1e4, vmap = new Map(), vx = [], vy = [], vz = []; let off = 84;
function idOf(x, y, z) { const k = `${Math.round(x * Q)},${Math.round(y * Q)},${Math.round(z * Q)}`; let id = vmap.get(k); if (id === undefined) { id = vx.length; vmap.set(k, id); vx.push(x); vy.push(y); vz.push(z); } }
for (let tI = 0; tI < nTri; tI++) { const b0 = off + 12; for (let c = 0; c < 3; c++) { const o = b0 + c * 12; idOf(buf.readFloatLE(o), buf.readFloatLE(o + 4), buf.readFloatLE(o + 8)); } off += 50; }
const nV = vx.length;

// Cache extrema per z-bin (0.5mm bins)
const zcache = new Map();
function getExtrema(z) { const k = Math.round(z * 2); let e = zcache.get(k); if (!e) { e = extrema(k / 2); zcache.set(k, e); } return e; }

// distance-to-peak buckets
const buckets = { peakNear: [], valleyNear: [], slope: [] }; // <0.15rad of peak; <0.15 of valley; else
let seamZone = [];
for (let v = 0; v < nV; v++) {
  const x = vx[v], y = vy[v], z = vz[v]; const r = Math.hypot(x, y);
  if (r <= 42 || z <= 8 || z >= 112) continue;
  let theta = Math.atan2(y, x); if (theta < 0) theta += TAU;
  const R = Rtrue(theta, z); const ad = Math.abs(r - R);
  const e = getExtrema(z);
  let dp = Infinity, dvl = Infinity;
  for (const p of e.peaks) dp = Math.min(dp, adist(theta, p.th));
  for (const p of e.valleys) dvl = Math.min(dvl, adist(theta, p.th));
  // half petal angular width ~ pi/m; m at this z:
  const tt = z / H; const m = SF.sfMBase + (SF.sfMTop - SF.sfMBase) * Math.pow(tt, SF.sfMCurveExp);
  const halfPetal = Math.PI / m; // peak-to-valley angular spacing
  const near = 0.25 * halfPetal;
  if (dp < near) buckets.peakNear.push(ad);
  else if (dvl < near) buckets.valleyNear.push(ad);
  else buckets.slope.push(ad);
  if (adist(theta, 0) < 0.05 || adist(theta, TAU) < 0.05) seamZone.push(ad);
}
function pct(a, p) { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function st(n, a) { if (!a.length) return console.log(`  ${n}: empty`); const mean = a.reduce((x, y) => x + y, 0) / a.length; console.log(`  ${n}: n=${a.length} mean=${mean.toFixed(4)} p50=${pct(a, 0.5).toFixed(4)} p90=${pct(a, 0.9).toFixed(4)} p99=${pct(a, 0.99).toFixed(4)} max=${pct(a, 1).toFixed(3)}`); }
console.log('[T0b] |r-R| bucketed by angular distance to nearest superformula extremum:');
st('PEAK-near  (convex petal tip, <0.25 half-petal)', buckets.peakNear);
st('VALLEY-near (concave notch bottom)            ', buckets.valleyNear);
st('SLOPE      (petal flank)                      ', buckets.slope);
console.log('\n[seam-zone control] verts within 0.05rad of theta=0/2pi:');
st('seam-zone |r-R|', seamZone);
// quantify fraction of large-error verts at peaks
const big = (a) => a.filter((x) => x > 0.1).length;
const tot = big(buckets.peakNear) + big(buckets.valleyNear) + big(buckets.slope);
console.log(`\n[where are the >0.1mm off-surface verts] peak=${big(buckets.peakNear)} (${(100*big(buckets.peakNear)/tot).toFixed(0)}%) valley=${big(buckets.valleyNear)} (${(100*big(buckets.valleyNear)/tot).toFixed(0)}%) slope=${big(buckets.slope)} (${(100*big(buckets.slope)/tot).toFixed(0)}%)`);
