// ════════════════════════════════════════════════════════════════════════════════════════════════════════
// s29FpLocality.mjs — WHERE DID THE VETO'S EXTRA FACETS GO? RESEARCH ONLY.
//   node research/tools/s29FpLocality.mjs
//
// The armed iterate `_S29FPi1` reads 29.231% of a UNIFORM 520-facet sample over 10 um; its flag-OFF twin
// `_CTLi1` reads 1.346%. Two readings of that are still open and they have opposite consequences:
//   (A) THE VETO DEGRADED THE WHOLE SURFACE. Then the extra facets are spread everywhere and the arm is
//       refuted outright.
//   (B) THE VETO POURED REFINEMENT INTO ITS OWN 1.754% MEMBER REGION AND DID NOT CLOSE IT. Then the mesh
//       outside that region is unchanged, the 29% is a POPULATION effect — a uniform sample of FACETS is
//       not a uniform sample of SURFACE — and what is refuted is density-closure at those loci, which is
//       S29's own h1-sink hypothesis.
//
// This decides between them with pure geometry and no certificate: the share of each mesh's facets whose
// (theta,z) footprint meets the member region, and the facet-area distribution inside vs outside it. The
// membership test is transcribed from `s29Accept.listed`'s box test (minus the strand clause, which is
// run state and not geometry).
// ════════════════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from 'node:fs';

const TWO_PI = 2 * Math.PI;
const EX = 'research/exchange/_strataConformBisect';
const MEMBERS = `${EX}/S29_members.json`;
const MESHES = [
  ['CONTROL  _CTLi1   (no override, no veto)', `${EX}/gothicarches_ring_DS-H_CTLi1.stl`],
  ['ARMED    _S29FPi1 (PF_CB_FPVETO=1)      ', `${EX}/gothicarches_ring_DS-H_S29FPi1.stl`],
];

const f = JSON.parse(readFileSync(MEMBERS, 'utf8'));
const { dTheta: cdT, dZ: cdZ, nTheta: cnT, nZ: cnZ } = f.cellGrid;
const mask = new Uint8Array(cnT * cnZ);
for (const c of f.cells) mask[c] = 1;

/** `s29Accept.listed`'s box test, verbatim in structure. */
const listed = (thA, thB, thC, zA, zB, zC) => {
  let b = thB; let c = thC;
  while (b - thA > Math.PI) b -= TWO_PI;
  while (b - thA < -Math.PI) b += TWO_PI;
  while (c - thA > Math.PI) c -= TWO_PI;
  while (c - thA < -Math.PI) c += TWO_PI;
  const t0 = Math.min(thA, b, c); const t1 = Math.max(thA, b, c);
  const z0 = Math.min(zA, zB, zC); const z1 = Math.max(zA, zB, zC);
  const j0 = Math.max(0, Math.floor(z0 / cdZ));
  const j1 = Math.min(cnZ - 1, Math.floor(z1 / cdZ));
  if (j1 < j0) return false;
  const i0 = Math.floor(t0 / cdT); const i1 = Math.floor(t1 / cdT);
  const span = Math.min(i1 - i0, cnT - 1);
  for (let k = 0; k <= span; k += 1) {
    const ii = (((i0 + k) % cnT) + cnT) % cnT;
    const base = ii * cnZ;
    for (let j = j0; j <= j1; j += 1) if (mask[base + j] === 1) return true;
  }
  return false;
};

const readStl = (p) => {
  const buf = readFileSync(p);
  const n = buf.readUInt32LE(80);
  return { buf, n };
};

console.log('=== WHERE THE VETO\'S EXTRA FACETS WENT ===');
console.log(`member region: ${f.cellGrid.cells} cells of ${cnT}x${cnZ} = ${f.cellGrid.surfaceFractionPct.toFixed(3)}% of the (theta,z) domain\n`);

const rows = [];
for (const [label, path] of MESHES) {
  const { buf, n } = readStl(path);
  let inN = 0; let inArea = 0; let outArea = 0;
  for (let t = 0; t < n; t += 1) {
    const o = 84 + t * 50 + 12;
    const ax = buf.readFloatLE(o); const ay = buf.readFloatLE(o + 4); const az = buf.readFloatLE(o + 8);
    const bx = buf.readFloatLE(o + 12); const by = buf.readFloatLE(o + 16); const bz = buf.readFloatLE(o + 20);
    const cx = buf.readFloatLE(o + 24); const cy = buf.readFloatLE(o + 28); const cz = buf.readFloatLE(o + 32);
    const ux = bx - ax; const uy = by - ay; const uz = bz - az;
    const vx = cx - ax; const vy = cy - ay; const vz = cz - az;
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(nx, ny, nz);
    const hit = listed(Math.atan2(ay, ax), Math.atan2(by, bx), Math.atan2(cy, cx), az, bz, cz);
    if (hit) { inN += 1; inArea += area; } else { outArea += area; }
  }
  rows.push({ label, n, inN, inArea, outArea });
  console.log(`${label}  ${n} facets`);
  console.log(`   IN  the member region : ${inN} facets = ${((100 * inN) / n).toFixed(3)}% of facets`
    + `   ${inArea.toFixed(1)} mm2 = ${((100 * inArea) / (inArea + outArea)).toFixed(3)}% of area`);
  console.log(`   OUT of it             : ${n - inN} facets = ${((100 * (n - inN)) / n).toFixed(3)}%`
    + `   ${outArea.toFixed(1)} mm2`);
  console.log(`   mean facet area IN ${(inArea / Math.max(inN, 1)).toExponential(3)} mm2`
    + `   OUT ${(outArea / Math.max(n - inN, 1)).toExponential(3)} mm2\n`);
}

const [ctl, arm] = rows;
console.log('=== THE DELTA ===');
console.log(`  facets       ${ctl.n} -> ${arm.n}   (+${arm.n - ctl.n}, x${(arm.n / ctl.n).toFixed(3)})`);
console.log(`  IN  region   ${ctl.inN} -> ${arm.inN}   (+${arm.inN - ctl.inN}, x${(arm.inN / Math.max(ctl.inN, 1)).toFixed(2)})`);
console.log(`  OUT of it    ${ctl.n - ctl.inN} -> ${arm.n - arm.inN}   (${arm.n - arm.inN - (ctl.n - ctl.inN) >= 0 ? '+' : ''}${arm.n - arm.inN - (ctl.n - ctl.inN)}, x${((arm.n - arm.inN) / (ctl.n - ctl.inN)).toFixed(3)})`);
const share = (arm.inN - ctl.inN) / (arm.n - ctl.n);
console.log(`\n  ${(100 * share).toFixed(1)}% of the veto's EXTRA facets landed inside the member region.`);
console.log(share > 0.8
  ? '  => READING (B): the refinement went where the veto aimed it and DID NOT CLOSE. The mesh outside is\n'
    + '     essentially untouched, so the 29.231% is a POPULATION effect of a uniform FACET sample, and what\n'
    + '     is refuted is DENSITY-CLOSURE at those loci — S29\'s own h1-sink hypothesis, now measured.'
  : '  => READING (A): the extra facets are NOT concentrated in the member region. The veto perturbed the\n'
    + '     whole surface and the arm is refuted outright.');
