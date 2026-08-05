// s94FinPlot.ts — THE PICTURE THAT ACTUALLY SHOWS THE DEFECT: a (arc-length, z) parameter-plane
// wireframe of a fin cluster. READ-ONLY. Writes PNG directly (no browser, no three.js).
//
// WHY NOT THE 3D RENDER. `s93ClusterRender` + `meshRender.cjs` produced a correct but uninformative
// picture: the MIS facets are 789 um long and 2.8 um tall, so at any camera distance that shows the wall
// they collapse to a one-pixel streak and the smooth panels dominate the frame. The claim being tested is
// about the ARRANGEMENT OF VERTICES (are they near-collinear chains?), and that is a 2-D question in the
// parameter plane. This draws every triangle edge in (r*theta, z), MIS facets in magenta over the rest in
// grey, at whatever zoom is asked for.
//
// Usage:  bash research/tools/run-s94-fin-plot.sh
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { dThRaw } from '../bridge/_sweepPredicate';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const STEM = process.env.PF_S94_STEM ?? 'voronoi_ring_D--';
const AR_SPLIT = envF('PF_S94_AR', 50);
const CTH = envF('PF_S94_CTH', -3.0965);          // window centre theta (rad) — S93's densest cell
const CZ = envF('PF_S94_CZ', 54.374);             // window centre z (mm)
const WMM = envF('PF_S94_WMM', 6.0);              // window half-width in mm of ARC
const HMM = envF('PF_S94_HMM', 4.0);              // window half-height in mm of z
const W = Math.round(envF('PF_S94_W', 1800));
const DIR = 'research/exchange/_strataConformBisect/s94plot';
mkdirSync(DIR, { recursive: true });
const NAME = process.env.PF_S94_NAME ?? 'fins_param';

const { xyz, nTri } = readMeshFloat64(`research/exchange/_strataConformBisect/${STEM}.stl`, false);
const Hpx = Math.round((W * HMM) / WMM);
const img = new Uint8Array(W * Hpx * 3).fill(250);

const px = (u: number): number => Math.round(((u + WMM) / (2 * WMM)) * (W - 1));
const py = (z: number): number => Math.round((1 - (z + HMM) / (2 * HMM)) * (Hpx - 1));
let painted = 0; let clipped = 0;
function dot(x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || y < 0 || x >= W || y >= Hpx) { clipped += 1; return; }
  painted += 1;
  // 2px pen so a 1-pixel wireframe survives downscaling in a viewer
  for (let dxp = 0; dxp <= 1; dxp += 1) {
    for (let dyp = 0; dyp <= 1; dyp += 1) {
      const xx = x + dxp; const yy = y + dyp;
      if (xx >= W || yy >= Hpx) continue;
      const o = (yy * W + xx) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
}
function line(x0: number, y0: number, x1: number, y1: number, r: number, g: number, b: number): void {
  let dx = Math.abs(x1 - x0); let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1; const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy; let x = x0; let y = y0;
  for (let guard = 0; guard < 20000; guard += 1) {
    dot(x, y, r, g, b);
    if (x === x1 && y === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

let nSel = 0; let nMis = 0;
const P = new Float64Array(6);
for (let t = 0; t < nTri; t += 1) {
  const o = t * 9;
  const ax = xyz[o]; const ay = xyz[o + 1]; const az = xyz[o + 2];
  const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
  const cx = xyz[o + 6]; const cy = xyz[o + 7]; const cz = xyz[o + 8];
  const thA = Math.atan2(ay, ax);
  const thB = thA + dThRaw(thA, Math.atan2(by, bx));
  const thC = thA + dThRaw(thA, Math.atan2(cy, cx));
  const rM = (Math.hypot(ax, ay) + Math.hypot(bx, by) + Math.hypot(cx, cy)) / 3;
  let d = (thA + thB + thC) / 3 - CTH;
  while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const zc = (az + bz + cz) / 3;
  if (Math.abs(d * rM) > WMM * 1.2 || Math.abs(zc - CZ) > HMM * 1.2) continue;
  nSel += 1;
  const uA = (thA - CTH - Math.round((thA - CTH) / (2 * Math.PI)) * 2 * Math.PI) * rM;
  // z is stored RELATIVE to the window centre — `py` maps [-HMM, +HMM], and the first run passed the
  // ABSOLUTE z, which put every vertex off-image (painted 0 px, clipped 2,216,339). The counters are what
  // caught it: a blank PNG on its own looked like "no geometry here", which would have been a wrong finding.
  P[0] = uA; P[1] = az - CZ;
  P[2] = uA + (thB - thA) * rM; P[3] = bz - CZ;
  P[4] = uA + (thC - thA) * rM; P[5] = cz - CZ;
  const fx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  const fy = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  const fz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const fl = Math.hypot(fx, fy, fz);
  const diam = Math.max(Math.hypot(bx - cx, by - cy, bz - cz), Math.hypot(ax - cx, ay - cy, az - cz), Math.hypot(ax - bx, ay - by, az - bz));
  const ar = fl > 1e-18 ? (diam * diam) / fl : Infinity;
  const mis = ar >= AR_SPLIT; if (mis) nMis += 1;
  const r = mis ? 230 : 150; const g = mis ? 0 : 175; const b = mis ? 190 : 150;
  for (let e = 0; e < 3; e += 1) {
    const i = 2 * e; const j = 2 * ((e + 1) % 3);
    line(px(P[i]), py(P[i + 1]), px(P[j]), py(P[j + 1]), r, g, b);
  }
}
log(`window +-${WMM} mm arc x +-${HMM} mm z at theta ${CTH}, z ${CZ}`);
log(`painted ${painted} px, clipped ${clipped} px`);
log(`drew ${nSel} facets, ${nMis} MIS (${((100 * nMis) / Math.max(1, nSel)).toFixed(2)}%)  image ${W}x${Hpx}`);

// ── minimal PNG writer (RGB8, one IDAT, zlib via node:zlib)
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc(Hpx * (1 + W * 3));
for (let y = 0; y < Hpx; y += 1) {
  raw[y * (1 + W * 3)] = 0;
  Buffer.from(img.buffer, img.byteOffset + y * W * 3, W * 3).copy(raw, y * (1 + W * 3) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hpx, 4);
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0)),
]);
const out = `${DIR}/${NAME}.png`;
writeFileSync(out, png);
log(`wrote ${out}`);
