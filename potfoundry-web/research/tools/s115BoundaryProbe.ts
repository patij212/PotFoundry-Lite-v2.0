// s115BoundaryProbe.ts — S115 side probe: WHERE are the 600 boundary edges, and IS the mesh a closed
// solid? B3's ray-parity test only means "renders inside-out" on a closed body; on an open tube a ray
// that escapes through an end flips the parity. This says which the mesh is, so B3 is quoted correctly.
import { readMeshFloat64 } from '../bridge/_facetTruthPool';

// eslint-disable-next-line no-console
const log = console.log;
const STL = process.env.PF_S115_STL ?? '';
if (STL.length === 0) { log('*** PF_S115_STL required ***'); process.exit(2); }
const M = readMeshFloat64(STL, false);
const xyz = M.xyz; const nTri = M.nTri;

// weld by exact coordinates
const buckets = new Map<number, number[]>();
const f32 = new Float32Array(3); const u32 = new Uint32Array(f32.buffer);
const cX: number[] = []; const cY: number[] = []; const cZ: number[] = [];
const id = new Int32Array(nTri * 3);
for (let v = 0; v < nTri * 3; v += 1) {
  const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
  f32[0] = x; f32[1] = y; f32[2] = z;
  let h = (u32[0] * 0x9e3779b1) ^ (u32[1] * 0x85ebca6b) ^ (u32[2] * 0xc2b2ae35); h |= 0;
  const b = buckets.get(h); let found = -1;
  if (b !== undefined) for (const c of b) if (cX[c] === x && cY[c] === y && cZ[c] === z) { found = c; break; }
  if (found < 0) { found = cX.length; cX.push(x); cY.push(y); cZ.push(z); if (b === undefined) buckets.set(h, [found]); else b.push(found); }
  id[v] = found;
}
const SHIFT = 67_108_864;
const cnt = new Map<number, number>();
for (let f = 0; f < nTri; f += 1) {
  const a = id[f * 3]; const b = id[f * 3 + 1]; const c = id[f * 3 + 2];
  for (const [u, v] of [[a, b], [b, c], [c, a]]) {
    const k = (u < v ? u : v) * SHIFT + (u < v ? v : u);
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
  }
}
const zs: number[] = []; const rs: number[] = [];
let nb = 0;
for (const [k, n] of cnt) {
  if (n !== 1) continue;
  nb += 1;
  const hi = k % SHIFT; const lo = (k - hi) / SHIFT;
  for (const v of [lo, hi]) { zs.push(cZ[v]); rs.push(Math.hypot(cX[v], cY[v])); }
}
const q = (v: number[], p: number): number => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
log(`facets ${nTri}  welded vertices ${cX.length}  boundary edges ${nb}`);
log(`boundary vertex z: MIN ${q(zs, 0).toFixed(4)} p50 ${q(zs, 0.5).toFixed(4)} MAX ${q(zs, 1).toFixed(4)}`);
log(`boundary vertex r: MIN ${q(rs, 0).toFixed(4)} p50 ${q(rs, 0.5).toFixed(4)} MAX ${q(rs, 1).toFixed(4)}`);
const atBot = zs.filter((z) => z < 1e-6).length; const atTop = zs.filter((z) => z > 119.999999).length;
log(`boundary vertices at z==0: ${atBot} of ${zs.length};  at z==H: ${atTop}`);
log(`=> ${atBot + atTop === zs.length ? 'ALL boundary is at the two RIMS: the mesh is an OPEN TUBE (no caps, no inner wall).' : 'boundary is NOT confined to the rims — there are interior holes/cracks.'}`);
// signed volume for reference
let v6 = 0;
for (let f = 0; f < nTri; f += 1) {
  const ax = xyz[f * 9]; const ay = xyz[f * 9 + 1]; const az = xyz[f * 9 + 2];
  const bx = xyz[f * 9 + 3]; const by = xyz[f * 9 + 4]; const bz = xyz[f * 9 + 5];
  const cx = xyz[f * 9 + 6]; const cy = xyz[f * 9 + 7]; const cz = xyz[f * 9 + 8];
  v6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
}
log(`divergence sum/6 = ${(v6 / 6).toFixed(3)} mm3;  solid-of-revolution volume for r=40->50 over H=120 is 765,834 mm3`);
log(`ratio ${((v6 / 6) / 765834).toFixed(4)}  (2/3 = 0.6667 is the signature of an OPEN LATERAL TUBE with no end caps)`);
