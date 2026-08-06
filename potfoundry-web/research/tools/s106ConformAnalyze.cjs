// s106ConformAnalyze.cjs — offline statistics on the S106 CENSUS bins. No rA evals, seconds.
//
// Reads the per-level-0-facet leaf counts written by `s106ConformBisect.ts` in `census` mode:
//   S106_IND_<TAG>_<bar>_s<k>of<N>.bin   Int32  independent leaves  per level-0 facet (shard k)
//   S106_INDU_<TAG>_<bar>_s<k>of<N>.bin  Int32  independent OVER-BAR leaves per facet
//   S106_CON_<TAG>_<bar>.bin             Int32  conforming  leaves  per level-0 ANCESTOR
//   S106_CONU_<TAG>_<bar>.bin            Int32  conforming  OVER-BAR leaves per ancestor
//
// The census is a CENSUS: `M = sum(C)/sum(I)` needs no band. The bands printed below answer the
// DIFFERENT, pre-registered C3 question — "how much would M have moved if it had been SAMPLED the way
// every other number in this campaign was?" — by re-aggregating the SAME census over DISJOINT
// golden-stride phase blocks (§0j). No new runs, no distributional assumption.
//
// Usage: node research/tools/s106ConformAnalyze.cjs <TAG> <bar> [nTri]
'use strict';
const { readFileSync, existsSync, readdirSync } = require('node:fs');
const DIR = 'research/exchange/_strataConformBisect/frontier';
const TAG = process.argv[2];
const BAR = process.argv[3] || 'chord';
if (!TAG) { console.log('usage: node s106ConformAnalyze.cjs <TAG> <bar>'); process.exit(1); }

function readI32(p) { const b = readFileSync(p); return new Int32Array(b.buffer, b.byteOffset, b.length / 4); }

const files = readdirSync(DIR);
const indFiles = files.filter((f) => f.startsWith(`S106_IND_${TAG}_${BAR}_`) && f.endsWith('.bin'));
const induFiles = files.filter((f) => f.startsWith(`S106_INDU_${TAG}_${BAR}_`) && f.endsWith('.bin'));
if (indFiles.length === 0) { console.log(`no IND shards for ${TAG}/${BAR} in ${DIR}`); process.exit(1); }
let I = null; let IU = null;
for (const f of indFiles) { const a = readI32(`${DIR}/${f}`); if (I === null) I = new Int32Array(a.length); for (let i = 0; i < a.length; i += 1) I[i] += a[i]; }
for (const f of induFiles) { const a = readI32(`${DIR}/${f}`); if (IU === null) IU = new Int32Array(a.length); for (let i = 0; i < a.length; i += 1) IU[i] += a[i]; }
const n = I.length;
console.log(`IND shards merged: ${indFiles.length} files (${indFiles.join(', ')})  n=${n}`);
const conP = `${DIR}/S106_CON_${TAG}_${BAR}.bin`;
const hasCon = existsSync(conP);
const C = hasCon ? readI32(conP) : null;
const CU = existsSync(`${DIR}/S106_CONU_${TAG}_${BAR}.bin`) ? readI32(`${DIR}/S106_CONU_${TAG}_${BAR}.bin`) : null;

let sI = 0; let sC = 0; let sIU = 0; let sCU = 0; let nZeroI = 0;
for (let i = 0; i < n; i += 1) { sI += I[i]; if (I[i] === 0) nZeroI += 1; if (IU) sIU += IU[i]; if (C) sC += C[i]; if (CU) sCU += CU[i]; }
console.log('');
console.log(`══ ${TAG} / ${BAR} — CENSUS (every level-0 facet, no sampling) ══`);
console.log(`  facets                    ${n}`);
console.log(`  facets with I=0 (degen)   ${nZeroI}`);
console.log(`  INDEPENDENT leaves  I     ${sI}   = ${(sI / n).toFixed(5)} x facets     over-bar ${sIU} = ${((100 * sIU) / sI).toFixed(4)}%`);
if (C) {
  console.log(`  CONFORMING  leaves  C     ${sC}   = ${(sC / n).toFixed(5)} x facets     over-bar ${sCU} = ${((100 * sCU) / sC).toFixed(4)}%`);
  console.log('');
  console.log(`  *** C1  CONFORMITY MULTIPLIER  M = C / I = ${(sC / sI).toFixed(5)}   (CENSUS — this number has no sampling band) ***`);
  console.log(`  *** C2  absolute conforming triangles = ${sC}  = ${(sC / 1e6).toFixed(3)} M   vs a 12 M budget => ${sC <= 12e6 ? 'PASS' : 'FAIL'} ***`);
}
if (!C) { console.log('  (no conforming census bin yet)'); process.exit(0); }

// per-parent distribution of C/I
const ratios = [];
for (let i = 0; i < n; i += 1) if (I[i] > 0) ratios.push(C[i] / I[i]);
ratios.sort((a, b) => a - b);
const pc = (q) => ratios[Math.min(ratios.length - 1, Math.max(0, Math.floor(q * (ratios.length - 1))))];
console.log('');
console.log(`  per-parent C/I  p01 ${pc(0.01).toFixed(3)}  p10 ${pc(0.10).toFixed(3)}  p25 ${pc(0.25).toFixed(3)}  p50 ${pc(0.50).toFixed(3)}  p75 ${pc(0.75).toFixed(3)}  p90 ${pc(0.90).toFixed(3)}  p99 ${pc(0.99).toFixed(3)}  max ${pc(1).toFixed(3)}`);
let below = 0; for (const r of ratios) if (r < 1) below += 1;
console.log(`  parents where conformity is CHEAPER than independent (C<I): ${below} = ${((100 * below) / ratios.length).toFixed(3)}%  (a forced split is free progress — the multiplier is not a per-parent surcharge)`);
// concentration
const cSorted = Array.from(C).sort((a, b) => b - a);
let acc = 0; const top1 = Math.max(1, Math.round(n * 0.01));
for (let i = 0; i < top1; i += 1) acc += cSorted[i];
console.log(`  worst 1% of parents hold ${((100 * acc) / sC).toFixed(2)}% of all CONFORMING leaves`);

// ── C3: disjoint golden-stride phase blocks (§0j) ──
function goldenStride(nn) { let s = Math.round(nn * 0.6180339887); if (s % 2 === 0) s += 1; const g = (a, b) => (b === 0 ? a : g(b, a % b)); while (g(s, nn) !== 1) s += 2; return s; }
const S = goldenStride(n);
console.log('');
console.log('══ C3 — WOULD A SAMPLED STUDY HAVE SEEN THIS M?  disjoint golden-stride phase blocks, §0j ══');
console.log('  (a re-aggregation of the SAME census — not new runs. Block j = {(jC+q)*s mod n})');
console.log('   C(block)   R blocks     M min      M max    max/min   p2.5     p97.5    +/- rel vs census');
for (const CB of [150, 400, 2000, 8000]) {
  const R = Math.floor(n / CB);
  if (R < 2) continue;
  const ms = [];
  for (let j = 0; j < R; j += 1) {
    let bi = 0; let bc = 0;
    for (let q = 0; q < CB; q += 1) { const f = ((j * CB + q) * S) % n; bi += I[f]; bc += C[f]; }
    if (bi > 0) ms.push(bc / bi);
  }
  ms.sort((a, b) => a - b);
  const q25 = ms[Math.floor(0.025 * (ms.length - 1))]; const q975 = ms[Math.floor(0.975 * (ms.length - 1))];
  const cen = sC / sI;
  const rel = Math.max(Math.abs(ms[0] - cen), Math.abs(ms[ms.length - 1] - cen)) / cen;
  console.log(`   ${String(CB).padStart(7)}   ${String(ms.length).padStart(8)}   ${ms[0].toFixed(4).padStart(8)}  ${ms[ms.length - 1].toFixed(4).padStart(8)}   ${(ms[ms.length - 1] / ms[0]).toFixed(3).padStart(7)}  ${q25.toFixed(4).padStart(7)}  ${q975.toFixed(4).padStart(7)}   ${(100 * rel).toFixed(1).padStart(6)}%`);
}
// uncleared band, per §0j: never a bare number
console.log('');
console.log('══ uncleared %, BANDED (never quoted as a number — §0j.6) ══');
for (const CB of [150, 2000]) {
  const R = Math.floor(n / CB); if (R < 2) continue;
  const ui = []; const uc = [];
  for (let j = 0; j < R; j += 1) {
    let bi = 0; let biu = 0; let bc = 0; let bcu = 0;
    for (let q = 0; q < CB; q += 1) { const f = ((j * CB + q) * S) % n; bi += I[f]; biu += IU ? IU[f] : 0; bc += C[f]; bcu += CU ? CU[f] : 0; }
    if (bi > 0) ui.push((100 * biu) / bi);
    if (bc > 0) uc.push((100 * bcu) / bc);
  }
  ui.sort((a, b) => a - b); uc.sort((a, b) => a - b);
  const zi = ui.filter((x) => x === 0).length; const zc = uc.filter((x) => x === 0).length;
  console.log(`   C=${CB}  IND uncleared  census ${((100 * sIU) / sI).toFixed(4)}%  blocks [${ui[0].toFixed(4)} .. ${ui[ui.length - 1].toFixed(4)}]  blocks reading exactly 0.000%: ${zi}/${ui.length} = ${((100 * zi) / ui.length).toFixed(1)}%`);
  console.log(`   C=${CB}  CON uncleared  census ${((100 * sCU) / sC).toFixed(4)}%  blocks [${uc[0].toFixed(4)} .. ${uc[uc.length - 1].toFixed(4)}]  blocks reading exactly 0.000%: ${zc}/${uc.length} = ${((100 * zc) / uc.length).toFixed(1)}%`);
}
