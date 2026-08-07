// s117FloorStack.ts — S117 P2 item 3: WHAT IS THE REAL FLOOR UNDER qMinEdge?
//
// qMinEdge = 0.04 mm is a HARD lower clamp. Item 3 asks: what is the SMALLEST EDGE THE
// REPRESENTATION CAN ACTUALLY CARRY, and how much margin is there between that and 0.04?
//
// This tool computes the floor stack from the SHIPPING constants, with every constant quoted at its
// file:line, and MEASURES the two that are measurable rather than asserting them:
//   - f32 STL quantisation: the ACTUAL ulp of Math.fround at the pot's radii (measured, not modelled)
//   - the QSCALE dedup grid and the WELD_TAU tolerance weld, converted from (u,t) to mm at those radii
//   - the quadtree's own reachable cell size at each maxLevel (the constraint that MOVES the floor)
//   - the QuadtreeCellKeyCodec 52-bit packing cap: the largest maxLevel that does not THROW
//
// The output is a LADDER OF FLOORS sorted by height. The binding floor is the TALLEST one — that is
// the real floor, and 0.04 mm's margin is measured against it.
//
// Usage: bash research/tools/run-s117-floors.sh
import { makeQuadtreeCellKeyCodec } from '../../src/renderers/webgpu/parametric/conforming/QuadtreeCellKeyCodec';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));

const H = envF('PF_S117_H', 120);
const RB = envF('PF_S117_RB', 40);
const RT = envF('PF_S117_RT', 50);
const RMAX = Math.max(RB, RT);
const CIRC = 2 * Math.PI * RMAX;          // worst-case (largest) arc per unit u
const CIRC_MIN = 2 * Math.PI * Math.min(RB, RT);

// ── shipping constants, each quoted at its file:line ──
const C = {
  qMinEdgeFloorArm: 0.04,   // ParametricExportComputer.ts:2660  max(0.04, profileSag*2)
  qMinEdgeCeilArm: 0.2,     // ParametricExportComputer.ts:2660  min(0.2, ...)
  CAD_MAX_LEVEL: 16,        // ParametricExportComputer.ts:2635
  CAD_NRING: 2048,          // ParametricExportComputer.ts:2637
  CAD_SAG_MM: 0.003,        // ParametricExportComputer.ts:2634
  CAD_BUDGET_TRIS: 16e6,    // ParametricExportComputer.ts:2639
  QSCALE: 1 << 24,          // FeatureConformingTriangulator.ts:219
  WELD_TAU: 1e-6,           // FeatureConformingTriangulator.ts:1773   (units: (u,t) parameter)
  STEINER_MIN_EDGE_DIST: 2e-6, // FeatureConformingTriangulator.ts:227 (units: (u,t) parameter)
  ON_EDGE_EPS: 1e-9,        // FeatureConformingTriangulator.ts:232
  MAX_U_EXTRA: 4,           // QuadtreeCellKeyCodec.ts:42
  CODEC_BITS: 52,           // QuadtreeCellKeyCodec.ts:88
};

log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   S117 P2 item 3 — THE FLOOR STACK UNDER qMinEdge = 0.04 mm');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log(`pot: H ${H} mm, Rb ${RB}, Rt ${RT}  =>  max circumference ${CIRC.toFixed(4)} mm (min ${CIRC_MIN.toFixed(4)})`);
log('');

// ── 1. f32 STORAGE. MEASURED via Math.fround, not modelled. ──
log('── FLOOR 1: f32 STL/GPU STORAGE QUANTISATION (MEASURED with Math.fround) ──');
const ulpAt = (x: number): number => {
  const f = Math.fround(x);
  let step = Math.abs(f) * 1e-9;
  // walk up until fround changes — the exact representable gap
  for (let i = 0; i < 200; i += 1) { if (Math.fround(f + step) !== f) break; step *= 2; }
  // bisect down to the exact ulp
  let lo = step / 2; let hi = step;
  for (let i = 0; i < 80; i += 1) { const m = (lo + hi) / 2; if (Math.fround(f + m) !== f) hi = m; else lo = m; }
  return hi;
};
for (const r of [RB, RT, H, RMAX * Math.SQRT2]) {
  log(`   |x| = ${r.toFixed(4).padStart(9)} mm   ulp(f32) = ${ulpAt(r).toExponential(4)} mm = ${(ulpAt(r) * 1000).toExponential(4)} um`);
}
const F32 = ulpAt(RMAX);
log(`   => two DISTINCT f32 vertices at r=${RMAX} need >= ${F32.toExponential(4)} mm separation. FLOOR_f32 = ${(F32 * 1e3).toFixed(6)} um`);
log('');

// ── 2. QSCALE dedup grid (u,t) -> mm ──
log('── FLOOR 2: QSCALE = 1<<24 EXACT DEDUP GRID (FeatureConformingTriangulator.ts:219) ──');
const qU = CIRC / C.QSCALE; const qT = H / C.QSCALE;
log(`   1/QSCALE = ${(1 / C.QSCALE).toExponential(4)} in (u,t)`);
log(`   -> u: ${qU.toExponential(4)} mm arc (${(qU * 1e3).toFixed(6)} um)   t: ${qT.toExponential(4)} mm (${(qT * 1e3).toFixed(6)} um)`);
log(`   Two vertices closer than this in (u,t) get the SAME dedup key => merged. FLOOR_QSCALE = ${(Math.max(qU, qT) * 1e3).toFixed(6)} um`);
log('');

// ── 3. WELD_TAU tolerance weld ──
log('── FLOOR 3: WELD_TAU = 1e-6 in (u,t) — THE TOLERANCE WELD (FeatureConformingTriangulator.ts:1773) ──');
const wU = C.WELD_TAU * CIRC; const wT = C.WELD_TAU * H;
log(`   -> u: ${wU.toExponential(4)} mm (${(wU * 1e3).toFixed(4)} um)   t: ${wT.toExponential(4)} mm (${(wT * 1e3).toFixed(4)} um)`);
log(`   Vertices within WELD_TAU in (u,t) are FUSED. An emitted edge must therefore exceed it.`);
log(`   STEINER_MIN_EDGE_DIST = 2e-6 (2x WELD_TAU) -> u ${(2 * wU * 1e3).toFixed(4)} um: the code's OWN`);
log(`   statement of the smallest separation it will deliberately create.`);
log(`   FLOOR_WELD = ${(Math.max(wU, wT) * 1e3).toFixed(4)} um   (2x margin form: ${(2 * Math.max(wU, wT) * 1e3).toFixed(4)} um)`);
log('');

// ── 4. QUADTREE REACH: the cell the tree can actually emit at each maxLevel ──
log('── FLOOR 4: QUADTREE REACH — the SMALLEST CELL maxLevel PERMITS (this is the floor that MOVES) ──');
log('   L    uBias  u-cells      t-cells    u arc (mm)      t (mm)      min(u,t) um   codec bits  codec');
for (const L of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]) {
  for (const B of [0, 1]) {
    const uCells = Math.pow(2, L + B); const tCells = Math.pow(2, L);
    const du = CIRC / uCells; const dt = H / tCells;
    let bits = -1; let codecOk = 'ok';
    try { makeQuadtreeCellKeyCodec(L, B); } catch (e) { codecOk = 'THROWS'; }
    // recompute the bit count the same way the codec does
    const bitsFor = (m: number): number => { if (m <= 0) return 1; let b = 0; let v = m; while (v > 0) { v = Math.floor(v / 2); b += 1; } return b; };
    const maxEUL = L + B + C.MAX_U_EXTRA;
    bits = Math.max(bitsFor(L) + L + bitsFor(C.MAX_U_EXTRA) + maxEUL, bitsFor(maxEUL) + L + maxEUL);
    const mark = L === C.CAD_MAX_LEVEL ? '  <== CAD_MAX_LEVEL (shipping)' : '';
    log(`   ${String(L).padStart(2)}   ${B}      ${String(uCells).padStart(9)}  ${String(tCells).padStart(9)}   ${du.toExponential(3).padStart(11)}  ${dt.toExponential(3).padStart(11)}   ${(Math.min(du, dt) * 1e3).toFixed(4).padStart(11)}   ${String(bits).padStart(9)}   ${codecOk}${mark}`);
  }
}
log('');

// ── 5. PINNED-BOUNDARY levelCap — the DENSITY-INVARIANT floor near the rim/base ──
log("── FLOOR 5: PINNED-BOUNDARY levelCap, 'linear' DEFAULT (PeriodicBalancedQuadtree.ts:648-666) ──");
log('   pin = log2(nRing) - uBias. A cell may reach pin+floor(nearEdge*2^pin) only.');
for (const B of [0, 1]) {
  const pin = Math.max(1, Math.round(Math.log2(C.CAD_NRING)) - B);
  const rowMm = H / Math.pow(2, pin);
  const needRows = C.CAD_MAX_LEVEL - pin;
  log(`   uBias ${B}: pin=${pin}  pinned-row height ${rowMm.toFixed(5)} mm  t-cell AT the pinned row ${rowMm.toFixed(5)} mm`);
  log(`      to reach maxLevel ${C.CAD_MAX_LEVEL} a cell needs nearEdge >= ${needRows}/2^${pin} = ${(needRows * rowMm).toFixed(5)} mm from the rim`);
  log(`      => a ${(needRows * rowMm).toFixed(5)} mm band at EACH end is level-capped BELOW maxLevel regardless of the sizing field.`);
  log(`      the cell AT the pin emits t-edges of ${rowMm.toFixed(5)} mm = ${(rowMm / C.qMinEdgeFloorArm).toFixed(2)}x qMinEdge(0.04) -- this clamp is TALLER than qMinEdge there.`);
  log(`      band share of the t-domain: ${(((2 * needRows * rowMm) / H) * 100).toFixed(4)}%`);
}
log('');

// ── 6. THE STACK, SORTED ──
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
log('   THE STACK — sorted by height. THE BINDING FLOOR IS THE TALLEST.');
log('════════════════════════════════════════════════════════════════════════════════════════════════════');
const pin1 = Math.max(1, Math.round(Math.log2(C.CAD_NRING)) - 1);
const stack: Array<[string, number, string]> = [
  ['f32 storage ulp @ r=' + RMAX, F32, 'MEASURED (Math.fround)'],
  ['QSCALE 1<<24 dedup grid (u)', qU, 'FeatureConformingTriangulator.ts:219'],
  ['WELD_TAU 1e-6 weld (u)', wU, 'FeatureConformingTriangulator.ts:1773'],
  ['STEINER_MIN_EDGE_DIST 2e-6 (u)', 2 * wU, 'FeatureConformingTriangulator.ts:227'],
  ['quadtree reach @ maxLevel 20, B=1 (u)', CIRC / Math.pow(2, 21), 'codec-max depth'],
  ['quadtree reach @ CAD_MAX_LEVEL 16, B=1 (t)', H / Math.pow(2, 16), 'ParametricExportComputer.ts:2635'],
  ['quadtree reach @ CAD_MAX_LEVEL 16, B=1 (u)', CIRC / Math.pow(2, 17), 'ParametricExportComputer.ts:2635'],
  ['quadtree reach @ maxLevel 12 (default non-CAD), B=1 (u)', CIRC / Math.pow(2, 13), 'QualityProfiles.ts:251'],
  ['*** qMinEdge FLOOR ARM ***', C.qMinEdgeFloorArm, 'ParametricExportComputer.ts:2660'],
  ["pinned-row t-edge, 'linear' levelCap, uBias 1", H / Math.pow(2, pin1), 'PeriodicBalancedQuadtree.ts:665'],
  ["qMinEdge at the SHIPPING DEFAULT profile ('high', eps 0.05)", Math.min(0.2, Math.max(0.04, 0.05 * 2)), 'ParametricExportComputer.ts:2660'],
  ['*** qMinEdge CEILING ARM (draft) ***', C.qMinEdgeCeilArm, 'ParametricExportComputer.ts:2660'],
];
stack.sort((a, b) => a[1] - b[1]);
log('   height (mm)      height (um)     constraint                                                    source');
for (const [n, v, s] of stack) {
  log(`   ${v.toExponential(4).padStart(12)}   ${(v * 1e3).toFixed(4).padStart(13)}     ${n.padEnd(58)}  ${s}`);
}
log('');
const realFloor = 2 * wU;   // the tallest PHYSICAL-representation floor (weld margin form)
log(`   REAL REPRESENTATION FLOOR (tallest of f32 / QSCALE / weld) = ${realFloor.toExponential(4)} mm = ${(realFloor * 1e3).toFixed(4)} um`);
log(`   qMinEdge floor arm 0.04 mm sits ${(C.qMinEdgeFloorArm / realFloor).toFixed(1)}x ABOVE it.`);
const reach16 = Math.min(H / Math.pow(2, 16), CIRC / Math.pow(2, 17));
log(`   The SHIPPING quadtree at CAD_MAX_LEVEL 16 already reaches ${reach16.toExponential(4)} mm = ${(reach16 * 1e3).toFixed(4)} um`);
log(`   => qMinEdge 0.04 is ${(C.qMinEdgeFloorArm / reach16).toFixed(1)}x above what TODAY'S TREE CAN ALREADY EMIT.`);
log(`   Lowering qMinEdge to ${reach16.toExponential(3)} mm requires NO depth change, NO codec change, NO new floor.`);
log('');
log('S117 FLOOR STACK DONE');
