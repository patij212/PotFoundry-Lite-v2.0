// _diag_holes_seam.cjs — is the 7mm worst-chord cluster at theta≈2π a TRUE ridge-tip
// chord, or an atan2/seam-wrap artifact? Also: histogram chord by petal-phase so we see
// whether bridging is at CUSPS (ridge tips) vs VALLEY floors independent of the seam.
const fs = require('fs');
const path = require('path');
const STL = process.argv[2] || path.resolve(__dirname, '..', 'export-deliverables', 'SuperformulaBlossom_sf1_sharp.stl');
const H = 120, R0 = 40, expn = 1, Rb = R0, Rt = R0, EPS = 1e-6, TAU = Math.PI * 2;
const P = { sfMBase: 6, sfMTop: 10, sfMCurveExp: 1.2, sfN1: 0.35, sfN1Top: 0.5, sfN2: 0.8, sfN2Top: 1.4, sfN3: 0.8, sfN3Top: 0.8, sfA: 1, sfB: 1 };
function baseRadius(z) { const t = Math.max(0, Math.min(1, z / H)); return Rb + (Rt - Rb) * Math.pow(t, expn); }
function sfv(theta, m, n1, n2, n3, a, b) { const c = Math.pow(Math.abs(Math.cos(m * theta / 4) / Math.max(a, EPS)), n2); const s = Math.pow(Math.abs(Math.sin(m * theta / 4) / Math.max(b, EPS)), n3); const d = Math.pow(c + s, 1 / Math.max(n1, EPS)); return d <= EPS ? 0 : Math.min(1 / d, 4); }
function trueRadius(theta, z) { const t = z / H; const m = P.sfMBase + (P.sfMTop - P.sfMBase) * Math.pow(t, P.sfMCurveExp); const n1 = P.sfN1 + (P.sfN1Top - P.sfN1) * t; const n2 = P.sfN2 + (P.sfN2Top - P.sfN2) * t; const n3 = P.sfN3 + (P.sfN3Top - P.sfN3) * t; const so = Math.PI / Math.max(m, 1); return baseRadius(z) * (0.90 + 0.35 * sfv(theta + so, m, n1, n2, n3, P.sfA, P.sfB)); }
// m petals: the superformula period in theta is 8π/m (cos(mθ/4)). With seam offset the
// ridge tips land at thetaAdj where cos/sin term is extremal. Compute petal-phase: how
// far (in fraction of one petal period) the point is from the NEAREST ridge tip.
function mAt(z) { const t = z / H; return P.sfMBase + (P.sfMTop - P.sfMBase) * Math.pow(t, P.sfMCurveExp); }

const buf = fs.readFileSync(STL); const nTri = buf.readUInt32LE(80);
console.log(`[seam] tris=${nTri}`);
// stream triangles (no weld needed; use raw face verts)
let off = 84;
const BARY = [[0.5, 0.5, 0], [0.5, 0, 0.5], [0, 0.5, 0.5], [1 / 3, 1 / 3, 1 / 3]];
// bins: petal-phase 0..1 where 0=ridge tip, 0.5=valley floor (since tips & valleys alternate
// every half period). We measure local slope sign to label tip vs valley instead.
let chordByDist = {}; // key = rounded dist-to-tip-fraction -> [sum,max,count]
let seamChords = [], nonSeamChords = [];
function trueAt(px, py, pz) { let th = Math.atan2(py, px); if (th < 0) th += TAU; return { th, tr: trueRadius(th, pz) }; }
for (let t = 0; t < nTri; t++) {
  const b = off + 12; const vxs = [], vys = [], vzs = [];
  for (let c = 0; c < 3; c++) { const o = b + c * 12; vxs.push(buf.readFloatLE(o)); vys.push(buf.readFloatLE(o + 4)); vzs.push(buf.readFloatLE(o + 8)); }
  off += 50;
  const ccz = (vzs[0] + vzs[1] + vzs[2]) / 3, ccx = (vxs[0] + vxs[1] + vxs[2]) / 3, ccy = (vys[0] + vys[1] + vys[2]) / 3;
  const cr = Math.hypot(ccx, ccy); if (cr < 42 || ccz < 8 || ccz > 112) continue;
  let maxGap = 0, worstTh = 0, worstFr = 0;
  for (const [wa, wb, wc] of BARY) {
    const px = vxs[0] * wa + vxs[1] * wb + vxs[2] * wc, py = vys[0] * wa + vys[1] * wb + vys[2] * wc, pz = vzs[0] * wa + vzs[1] * wb + vzs[2] * wc;
    const fr = Math.hypot(px, py); const { th, tr } = trueAt(px, py, pz); const g = Math.abs(tr - fr);
    if (g > maxGap) { maxGap = g; worstTh = th; worstFr = fr; }
  }
  // local petal-phase via the radius profile around the centroid theta: is this point near a
  // ridge tip (r near local max) or valley (r near local min)?
  let cth = Math.atan2(ccy, ccx); if (cth < 0) cth += TAU;
  const m = mAt(ccz); const halfPeriod = (TAU / m) / 2; // tip-to-valley angular spacing
  // sample true radius in a window to find nearest extremum type at this theta
  const rHere = trueRadius(cth, ccz), rL = trueRadius(cth - 0.02, ccz), rR = trueRadius(cth + 0.02, ccz);
  const isTip = rHere >= rL && rHere >= rR;      // local max => ridge tip
  const isValley = rHere <= rL && rHere <= rR;   // local min => valley floor
  const label = isTip ? 'tip' : isValley ? 'valley' : 'flank';
  if (!chordByDist[label]) chordByDist[label] = [0, 0, 0];
  chordByDist[label][0] += maxGap; if (maxGap > chordByDist[label][1]) chordByDist[label][1] = maxGap; chordByDist[label][2]++;
  // seam = within ~0.05 rad of theta=0/2π
  const dSeam = Math.min(cth, TAU - cth);
  if (dSeam < 0.05) seamChords.push(maxGap); else nonSeamChords.push(maxGap);
}
function st(a) { if (!a.length) return 'n=0'; const s = a.slice().sort((x, y) => x - y); const p = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))]; return `mean=${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(4)} p50=${p(0.5).toFixed(4)} p99=${p(0.99).toFixed(4)} max=${p(1).toFixed(4)} n=${a.length}`; }
console.log(`\nchord by local-extremum label (independent of seam):`);
for (const k of ['tip', 'valley', 'flank']) { const e = chordByDist[k]; if (e) console.log(`  ${k}: mean=${(e[0] / e[2]).toFixed(4)} max=${e[1].toFixed(4)} n=${e[2]}`); }
console.log(`\nseam(<0.05rad) chords:  ${st(seamChords)}`);
console.log(`non-seam chords:        ${st(nonSeamChords)}`);
// how many of the >1mm chords are within 0.05rad of seam?
const bigSeam = seamChords.filter((g) => g > 1).length, bigNon = nonSeamChords.filter((g) => g > 1).length;
console.log(`\n>1mm chords: seam=${bigSeam} non-seam=${bigNon}  (seam is ${(100 * bigSeam / (bigSeam + bigNon || 1)).toFixed(1)}% of big chords)`);
