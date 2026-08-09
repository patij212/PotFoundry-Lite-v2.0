// s116Render.ts — THE CAMPAIGN'S FIRST SINGLE-SIDED RENDERER. RESEARCH ONLY, READ-ONLY on all meshes.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS. Every render this campaign has ever produced was THREE.js DoubleSide. Under DoubleSide
// a triangle with reversed winding is shaded exactly like a correct one, so an ORIENTATION defect is
// invisible BY CONSTRUCTION — the pictures could not have shown the defect even if it filled the frame.
// S98 established the true back-facing population is 0.006-0.013% of area; S115 established that 0.89% of
// CelticTriquetra's area is inverted and ~1/3 of it is genuinely inside-out. Nobody has ever SEEN any of
// it. Separately, the 45 deg dihedral "visibility" bar was INHERITED and has never been checked against
// an image.
//
// This is a dependency-free software rasteriser: z-buffer, flat shading, headlight, SINGLE-SIDED. It has
// no browser, no three.js, no npm additions; PNG is written through node:zlib.
//
// IT IS AN INSTRUMENT, NOT A PICTURE MAKER. Every render also returns a census of what the camera could
// and could not see, per facet, with COUNT + 3D-AREA-SHARE + MAX together (never a bare count, never a
// bare max):
//   VISIBLE   — won at least one z-test sample.
//   OCCLUDED  — covered samples but lost every one of them.
//   SUBPIXEL  — inside the viewport, not culled, and covered NO sample at all. This is the blade class:
//               a needle standing edge-on has 3D area but zero screen area, and no render can show it.
//   BACKFACING (visible) — the defect the whole campaign has been blind to.
//
// ── MODES ─────────────────────────────────────────────────────────────────────────────────────────────
//   clay      cull back faces. TRUE single-sided. An inverted facet becomes a HOLE you see through.
//   backface  no cull. Front faces lit grey, BACK-FACING FACETS PAINTED LOUD MAGENTA.
//   heat      no cull. Per-facet scalar ramp with a printed, ticked colour scale in stated units.
//             Default scalar = per-facet MAX ADJACENT DIHEDRAL in deg (dihedralRuler, analytic-free).
//             Any parallel per-facet Float64 array can be supplied instead (see PF_S116_SCALAR).
// `clay` and `backface` on the same camera are an EVIDENCE PAIR: the hole in one is the magenta in the
// other. Neither exists under DoubleSide.
//
// ── VALIDATION (runs by default, BEFORE any mesh is rendered) ──────────────────────────────────────────
// A renderer that cannot show a defect you planted is not validated. `selfTest()` builds an analytic UV
// sphere and a capped cylinder with known-outward windings and asserts, with FLOORS as well as CEILINGS
// (a one-sided bar is satisfied by a blank image):
//   CLEAN     paints a real silhouette (floor), zero visible back-facing facets AND zero back-facing
//             pixels, dihedral ruler alive but small on the sphere, and ~90 deg on the cylinder RIM
//             (real geometry — the 45 deg bar flags a perfect cylinder, which is the point).
//   CULL==NOCULL  the two agree on painted pixels to 1e-3, proving culling removes only hidden faces.
//   WIND-FLIPPED  back-face mode DOES paint, above a floor, with the silhouette unchanged.
//   FOLDED        the dihedral heatmap DOES paint above 90 deg where the clean one was under 12.
// If any of these fails the process exits non-zero and NO mesh render is trusted.
//
// ── SCALAR FILE FORMAT (PF_S116_SCALAR) ───────────────────────────────────────────────────────────────
// A raw little-endian Float64 binary of exactly nTri values, one per facet in STL file order. That is
// what `new Float64Array(...)` writes with writeFileSync(Buffer.from(a.buffer)). Downstream S116 tools
// (normDeg, position error) emit this and get a heatmap for free.
//
// Usage: bash research/tools/run-s116-render.sh
//   env: PF_S116_STL(abs) PF_S116_TAG PF_S116_OUT PF_S116_W PF_S116_H PF_S116_SS PF_S116_AZ PF_S116_EL
//        PF_S116_MODES PF_S116_ZOOMS("th,z,halfmm;...") PF_S116_HEATMAX PF_S116_SCALAR(+_LABEL/_UNITS/
//        _MIN/_MAX) PF_S116_SELFTEST PF_S116_ONLYTEST
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';

// eslint-disable-next-line no-console
const log = console.log;
const envF = (n: string, d: number): number => (process.env[n] === undefined ? d : Number(process.env[n]));
const envS = (n: string, d: string): string => (process.env[n] === undefined ? d : (process.env[n] as string));
const DEG = 180 / Math.PI;

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// PNG  (RGB8, one IDAT, zlib via node:zlib). Same shape as research/tools/s94FinPlot.ts — kept local so
// this file has no research-side import beyond the two rulers.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
export function writePNG(path: string, W: number, H: number, rgb: Uint8Array): number {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y += 1) {
    raw[y * (1 + W * 3)] = 1; // filter 1 = Sub. Big win on flat-shaded fields vs filter 0.
    const row = y * W * 3; const o = y * (1 + W * 3) + 1;
    for (let x = 0; x < W * 3; x += 1) raw[o + x] = (rgb[row + x] - (x >= 3 ? rgb[row + x - 3] : 0)) & 0xFF;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr), pngChunk('IDAT', deflateSync(raw, { level: 9 })), pngChunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  return png.length;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// 5x7 bitmap font, ASCII 0x20..0x5F. 5 columns per glyph, one byte each, bit 0 = TOP row.
// Lower case is folded to upper case; anything outside the range renders as a blank.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const FONT_HEX = [
  '0000000000', '00005F0000', '0007000700', '147F147F14', '242A7F2A12', '2313086462', '3649552250', '0005030000', // sp ! " # $ % & '
  '001C224100', '0041221C00', '14083E0814', '08083E0808', '0050300000', '0808080808', '0060600000', '2010080402', // ( ) * + , - . /
  '3E5149453E', '00427F4000', '4261514946', '2141454B31', '1814127F10', '2745454539', '3C4A494930', '0171090503', // 0 1 2 3 4 5 6 7
  '3649494936', '064949291E', '0036360000', '0056360000', '0008142241', '1414141414', '4122140800', '0201510906', // 8 9 : ; < = > ?
  '324979413E', '7E1111117E', '7F49494936', '3E41414122', '7F4141221C', '7F49494941', '7F09090101', '3E4141497A', // @ A B C D E F G
  '7F0808087F', '00417F4100', '2040413F01', '7F08142241', '7F40404040', '7F020C027F', '7F0408107F', '3E4141413E', // H I J K L M N O
  '7F09090906', '3E4151215E', '7F09192946', '4649494931', '01017F0101', '3F4040403F', '1F2040201F', '3F4038403F', // P Q R S T U V W
  '6314081463', '0708700807', '6151494543', '007F414100', '0204081020', '0041417F00', '0402010204', '4040404040', // X Y Z [ \ ] ^ _
].join('');
const FONT = new Uint8Array(64 * 5);
{
  if (FONT_HEX.length !== 64 * 10) throw new Error(`FONT_HEX length ${FONT_HEX.length} != 640`);
  for (let i = 0; i < 64 * 5; i += 1) FONT[i] = parseInt(FONT_HEX.slice(i * 2, i * 2 + 2), 16);
}

function drawText(rgb: Uint8Array, W: number, H: number, x0: number, y0: number, s: string, r: number, g: number, b: number, sc = 2): void {
  let cx = x0;
  for (const chRaw of s.toUpperCase()) {
    const c = chRaw.charCodeAt(0);
    const gi = c >= 0x20 && c <= 0x5F ? c - 0x20 : 0;
    for (let col = 0; col < 5; col += 1) {
      const bits = FONT[gi * 5 + col];
      for (let row = 0; row < 7; row += 1) {
        if ((bits >> row & 1) === 0) continue;
        for (let dy = 0; dy < sc; dy += 1) for (let dx = 0; dx < sc; dx += 1) {
          const px = cx + col * sc + dx; const py = y0 + row * sc + dy;
          if (px < 0 || py < 0 || px >= W || py >= H) continue;
          const o = (py * W + px) * 3; rgb[o] = r; rgb[o + 1] = g; rgb[o + 2] = b;
        }
      }
    }
    cx += 6 * sc;
  }
}
const textW = (s: string, sc = 2): number => s.length * 6 * sc;
function fillRect(rgb: Uint8Array, W: number, H: number, x0: number, y0: number, w: number, h: number, r: number, g: number, b: number, alpha = 1): void {
  for (let y = y0; y < y0 + h; y += 1) {
    if (y < 0 || y >= H) continue;
    for (let x = x0; x < x0 + w; x += 1) {
      if (x < 0 || x >= W) continue;
      const o = (y * W + x) * 3;
      rgb[o] = Math.round(rgb[o] * (1 - alpha) + r * alpha);
      rgb[o + 1] = Math.round(rgb[o + 1] * (1 - alpha) + g * alpha);
      rgb[o + 2] = Math.round(rgb[o + 2] * (1 - alpha) + b * alpha);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Colour ramp for the heatmap. Ordered, monotone in luminance at the ends, and NOT red/green-only so the
// mid-range is still separable in grey print.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const RAMP: Array<[number, number, number]> = [
  [26, 40, 120], [0, 150, 190], [30, 180, 70], [235, 205, 30], [225, 45, 30],
];
function ramp(t: number, out: Float64Array): void {
  const u = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const f = u * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(f));
  const w = f - i;
  out[0] = RAMP[i][0] * (1 - w) + RAMP[i + 1][0] * w;
  out[1] = RAMP[i][1] * (1 - w) + RAMP[i + 1][1] * w;
  out[2] = RAMP[i][2] * (1 - w) + RAMP[i + 1][2] * w;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// The rasteriser.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
export type RenderMode = 'clay' | 'backface' | 'heat';

export interface ViewOpts {
  xyz: Float64Array;
  nTri: number;
  area: Float64Array;          // per-facet 3D area, mm2
  W: number; Hpx: number; ss: number;
  azDeg: number; elDeg: number;
  target: [number, number, number];
  halfHmm: number;             // half-height of the ORTHOGRAPHIC window, mm
  mode: RenderMode;
  scalar?: Float64Array;       // per-facet, heat mode
  scaleMin?: number; scaleMax?: number;
  scalarLabel?: string; scalarUnits?: string;
  caption: string;
  subcaption?: string;
}

export interface ViewStats {
  W: number; Hpx: number; ss: number;
  azDeg: number; elDeg: number; halfHmm: number; halfWmm: number;
  target: [number, number, number];
  mode: RenderMode;
  pixelsTotal: number; pixelsPainted: number; paintedFrac: number;
  /** samples (supersampled) whose winning facet is back-facing to this camera. */
  backSamples: number; backSampleFracOfPainted: number;
  visFacets: number; visArea: number; visAreaMax: number;
  backVisFacets: number; backVisArea: number; backVisAreaShare: number; backVisAreaMax: number;
  /**
   * THE SPLIT THAT STOPS A 10x MIS-STATEMENT, and it must be CAMERA-INDEPENDENT.
   *
   * These pots are OPEN single-sheet shells: looking down the mouth you see the REVERSE of the far wall,
   * which is back-facing and CORRECT. On Gothic that interior is 13.6% of visible area — quoting the raw
   * back-facing total as a defect share would overstate by an order of magnitude.
   *
   * The first split tried here was the sign of centroid DEPTH ("camera-side half"). Its own control
   * refuted it: at elevation 22 deg the +z term dominates the depth and 35 correctly-wound far-wall
   * facets scored as near-side. Depth mixes the camera's tilt into a question about the mesh.
   *
   * The split used instead is the facet's own orientation against the pot's CYLINDRICAL OUTWARD radial,
   * n . rHat with rHat = (cx, cy, 0)/|(cx, cy)| at the facet centroid. That is the same sense of "outward"
   * the styles' own r(theta, z) parameterisation uses, and it does not move when the camera does:
   *   OUTWARD (n.rHat > 0)  correctly wound; visible-and-back-facing means its inner side is being seen
   *                         through an opening. EXPECTED on an open shell.
   *   INWARD  (n.rHat < 0)  the facet's own normal points into the pot. Visible AND back-facing AND
   *                         inward is the orientation-defect CANDIDATE class.
   * CANDIDATE, not verdict: a genuine steep undercut can also carry n.rHat < 0, so this bounds the class
   * rather than adjudicating it. AXIAL counts facets whose centroid sits on the axis, where rHat is
   * undefined — reported so they cannot hide in either bucket.
   */
  backVisInwardFacets: number; backVisInwardArea: number; backVisInwardAreaShare: number; backVisInwardAreaMax: number;
  backVisOutwardFacets: number; backVisOutwardArea: number; backVisOutwardAreaShare: number;
  backVisAxialFacets: number; backVisAxialArea: number;
  backSamplesInward: number; backSamplesOutward: number;
  occludedFacets: number; occludedArea: number;
  /** in-viewport, un-culled, covered ZERO samples: the class no raster can ever show. */
  subpixelFacets: number; subpixelArea: number; subpixelAreaMax: number; subpixelAreaShareOfAttempted: number;
  attemptedFacets: number; attemptedArea: number;
  offscreenFacets: number;
  culledFacets: number;
  /** samples where two facets tied EXACTLY in depth, and how many of those a front facet was given. */
  tieSamples: number; tieFrontRescued: number;
  scalarVisMax: number; scalarVisMin: number; scalarOverScaleFacets: number;
  /** area-share, among VISIBLE facets, of facets whose scalar exceeds 45 (the inherited bar). */
  over45VisFacets: number; over45VisAreaShare: number; over45SampleShare: number;
}

export interface Rendered { rgb: Uint8Array; W: number; Hpx: number; stats: ViewStats }

export function facetAreas(xyz: Float64Array, nTri: number): Float64Array {
  const a = new Float64Array(nTri);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ux = xyz[o + 3] - xyz[o]; const uy = xyz[o + 4] - xyz[o + 1]; const uz = xyz[o + 5] - xyz[o + 2];
    const wx = xyz[o + 6] - xyz[o]; const wy = xyz[o + 7] - xyz[o + 1]; const wz = xyz[o + 8] - xyz[o + 2];
    const cx = uy * wz - uz * wy; const cy = uz * wx - ux * wz; const cz = ux * wy - uy * wx;
    a[t] = 0.5 * Math.hypot(cx, cy, cz);
  }
  return a;
}

export function renderView(opt: ViewOpts): Rendered {
  const { xyz, nTri, area, W, Hpx, ss, mode } = opt;
  const Ws = W * ss; const Hs = Hpx * ss;
  const az = opt.azDeg / DEG; const el = opt.elDeg / DEG;
  // d = unit vector from the scene TOWARD the camera. Orthographic; depth = dot(P-T, d), bigger = nearer.
  const dx = Math.cos(el) * Math.cos(az); const dy = Math.cos(el) * Math.sin(az); const dz = Math.sin(el);
  let rx = -dy; let ry = dx; let rz = 0;
  let rl = Math.hypot(rx, ry, rz);
  if (rl < 1e-12) { rx = 1; ry = 0; rz = 0; rl = 1; }
  rx /= rl; ry /= rl; rz /= rl;
  const ux = dy * rz - dz * ry; const uy = dz * rx - dx * rz; const uz = dx * ry - dy * rx;
  const [tx, ty, tz] = opt.target;
  const halfH = opt.halfHmm; const halfW = halfH * (W / Hpx);
  const sX = Ws / (2 * halfW); const sY = Hs / (2 * halfH);

  const zbuf = new Float32Array(Ws * Hs).fill(-Infinity);
  const idbuf = new Int32Array(Ws * Hs).fill(-1);
  const covered = new Uint8Array(nTri);   // covered >=1 sample
  const attempted = new Uint8Array(nTri); // bbox intersects viewport and not culled
  const facing = new Float32Array(nTri);  // n . d ; > 0 front-facing to this camera
  // 0 = outward (n.rHat > 0), 1 = inward (n.rHat < 0), 2 = axial (centroid on the axis, rHat undefined)
  const radialCls = new Uint8Array(nTri);

  const cull = mode === 'clay';
  let culledFacets = 0; let offscreenFacets = 0;
  let tieSamples = 0; let tieFrontRescued = 0;

  const px = new Float64Array(3); const py = new Float64Array(3); const pd = new Float64Array(3);
  for (let t = 0; t < nTri; t += 1) {
    const o = t * 9;
    const ax = xyz[o]; const ay = xyz[o + 1]; const azc = xyz[o + 2];
    const bx = xyz[o + 3]; const by = xyz[o + 4]; const bz = xyz[o + 5];
    const cxv = xyz[o + 6]; const cyv = xyz[o + 7]; const czv = xyz[o + 8];
    const e1x = bx - ax; const e1y = by - ay; const e1z = bz - azc;
    const e2x = cxv - ax; const e2y = cyv - ay; const e2z = czv - azc;
    let nx = e1y * e2z - e1z * e2y; let ny = e1z * e2x - e1x * e2z; let nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz);
    if (nl > 0) { nx /= nl; ny /= nl; nz /= nl; }
    const fc = nx * dx + ny * dy + nz * dz;
    facing[t] = fc;
    // Camera-INDEPENDENT radial class, computed before any culling so it is the same in every mode.
    const gx = (ax + bx + cxv) / 3; const gy = (ay + by + cyv) / 3;
    const gr = Math.hypot(gx, gy);
    radialCls[t] = gr <= 1e-9 ? 2 : ((nx * gx + ny * gy) / gr < 0 ? 1 : 0);
    if (cull && fc <= 0) { culledFacets += 1; continue; }

    px[0] = Ws * 0.5 + ((ax - tx) * rx + (ay - ty) * ry + (azc - tz) * rz) * sX;
    py[0] = Hs * 0.5 - ((ax - tx) * ux + (ay - ty) * uy + (azc - tz) * uz) * sY;
    pd[0] = (ax - tx) * dx + (ay - ty) * dy + (azc - tz) * dz;
    px[1] = Ws * 0.5 + ((bx - tx) * rx + (by - ty) * ry + (bz - tz) * rz) * sX;
    py[1] = Hs * 0.5 - ((bx - tx) * ux + (by - ty) * uy + (bz - tz) * uz) * sY;
    pd[1] = (bx - tx) * dx + (by - ty) * dy + (bz - tz) * dz;
    px[2] = Ws * 0.5 + ((cxv - tx) * rx + (cyv - ty) * ry + (czv - tz) * rz) * sX;
    py[2] = Hs * 0.5 - ((cxv - tx) * ux + (cyv - ty) * uy + (czv - tz) * uz) * sY;
    pd[2] = (cxv - tx) * dx + (cyv - ty) * dy + (czv - tz) * dz;

    let x0 = Math.floor(Math.min(px[0], px[1], px[2]));
    let x1 = Math.ceil(Math.max(px[0], px[1], px[2]));
    let y0 = Math.floor(Math.min(py[0], py[1], py[2]));
    let y1 = Math.ceil(Math.max(py[0], py[1], py[2]));
    if (x1 < 0 || y1 < 0 || x0 >= Ws || y0 >= Hs) { offscreenFacets += 1; continue; }
    attempted[t] = 1;
    if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
    if (x1 > Ws - 1) x1 = Ws - 1; if (y1 > Hs - 1) y1 = Hs - 1;

    const A = (px[1] - px[0]) * (py[2] - py[0]) - (py[1] - py[0]) * (px[2] - px[0]);
    if (A === 0) continue; // degenerate in screen space: an exactly edge-on or zero-area facet
    const sg = A > 0 ? 1 : -1;
    const invA = 1 / (sg * A);
    for (let y = y0; y <= y1; y += 1) {
      const fy = y + 0.5;
      for (let x = x0; x <= x1; x += 1) {
        const fx = x + 0.5;
        const w0 = sg * ((px[1] - fx) * (py[2] - fy) - (py[1] - fy) * (px[2] - fx));
        if (w0 < 0) continue;
        const w1 = sg * ((px[2] - fx) * (py[0] - fy) - (py[2] - fy) * (px[0] - fx));
        if (w1 < 0) continue;
        const w2 = sg * ((px[0] - fx) * (py[1] - fy) - (py[0] - fy) * (px[1] - fx));
        if (w2 < 0) continue;
        covered[t] = 1;
        const depth = (w0 * pd[0] + w1 * pd[1] + w2 * pd[2]) * invA;
        const k = y * Ws + x;
        const zk = zbuf[k];
        if (depth > zk) { zbuf[k] = depth; idbuf[k] = t; }
        else if (depth === zk && idbuf[k] >= 0) {
          // EXACT DEPTH TIE. This happens on a silhouette edge (a sample lying exactly on the shared
          // projected edge is inside BOTH facets at equal depth) and on genuinely COINCIDENT facets —
          // a zero-thickness fin. Left to arrival order it would let a silhouette tie paint a false
          // back-face, which is the one thing this renderer must never do. Ties therefore go to the
          // FRONT-facing facet, and are COUNTED so a coincident-fin population cannot hide behind the
          // convention.
          tieSamples += 1;
          if (facing[idbuf[k]] <= 0 && fc > 0) { idbuf[k] = t; tieFrontRescued += 1; }
        }
      }
    }
  }

  // ── shade: per-facet colour once (flat shading ⇒ a table), then a table lookup per sample.
  const col = new Uint8Array(nTri * 3);
  const smin = opt.scaleMin ?? 0; const smax = opt.scaleMax ?? 1;
  const inv = smax > smin ? 1 / (smax - smin) : 0;
  const rc = new Float64Array(3);
  let scalarOverScaleFacets = 0;
  for (let t = 0; t < nTri; t += 1) {
    const fc = facing[t];
    const lam = Math.abs(fc);
    if (mode === 'heat') {
      const v = opt.scalar === undefined ? 0 : opt.scalar[t];
      if (v > smax) scalarOverScaleFacets += 1;
      ramp((v - smin) * inv, rc);
      const sh = 0.60 + 0.40 * lam; // mild form shading; colour is still readable against the scale
      col[t * 3] = Math.min(255, Math.round(rc[0] * sh));
      col[t * 3 + 1] = Math.min(255, Math.round(rc[1] * sh));
      col[t * 3 + 2] = Math.min(255, Math.round(rc[2] * sh));
    } else if (mode === 'backface' && fc <= 0) {
      const sh = 0.55 + 0.45 * lam;
      col[t * 3] = Math.min(255, Math.round(255 * sh));
      col[t * 3 + 1] = Math.min(255, Math.round(20 * sh));
      col[t * 3 + 2] = Math.min(255, Math.round(200 * sh));
    } else {
      const sh = 0.12 + 0.88 * Math.pow(lam, 0.85);
      col[t * 3] = Math.min(255, Math.round(214 * sh));
      col[t * 3 + 1] = Math.min(255, Math.round(206 * sh));
      col[t * 3 + 2] = Math.min(255, Math.round(190 * sh));
    }
  }

  // ── resolve + downsample, and census what actually won.
  const won = new Uint8Array(nTri);
  const rgb = new Uint8Array(W * Hpx * 3);
  let pixelsPainted = 0; let backSamplesTot = 0; let over45Samples = 0; let paintedSamples = 0;
  let backSamplesInward = 0; let backSamplesOutward = 0;
  const n2 = ss * ss;
  for (let y = 0; y < Hpx; y += 1) {
    const bgT = y / Math.max(1, Hpx - 1);
    const bgr = Math.round(30 * (1 - bgT) + 13 * bgT);
    const bgg = Math.round(33 * (1 - bgT) + 15 * bgT);
    const bgb = Math.round(38 * (1 - bgT) + 19 * bgT);
    for (let x = 0; x < W; x += 1) {
      let sr = 0; let sg2 = 0; let sb = 0; let hit = 0;
      for (let jy = 0; jy < ss; jy += 1) {
        const rowo = (y * ss + jy) * Ws + x * ss;
        for (let jx = 0; jx < ss; jx += 1) {
          const t = idbuf[rowo + jx];
          if (t < 0) { sr += bgr; sg2 += bgg; sb += bgb; continue; }
          hit += 1; won[t] = 1;
          if (facing[t] <= 0) { backSamplesTot += 1; if (radialCls[t] === 1) backSamplesInward += 1; else backSamplesOutward += 1; }
          if (opt.scalar !== undefined && opt.scalar[t] > 45) over45Samples += 1;
          sr += col[t * 3]; sg2 += col[t * 3 + 1]; sb += col[t * 3 + 2];
        }
      }
      paintedSamples += hit;
      if (hit > 0) pixelsPainted += 1;
      const o = (y * W + x) * 3;
      rgb[o] = Math.round(sr / n2); rgb[o + 1] = Math.round(sg2 / n2); rgb[o + 2] = Math.round(sb / n2);
    }
  }

  let visFacets = 0; let visArea = 0; let visAreaMax = 0;
  let backVisFacets = 0; let backVisArea = 0; let backVisAreaMax = 0;
  let backVisInwardFacets = 0; let backVisInwardArea = 0; let backVisInwardAreaMax = 0;
  let backVisOutwardFacets = 0; let backVisOutwardArea = 0;
  let backVisAxialFacets = 0; let backVisAxialArea = 0;
  let occludedFacets = 0; let occludedArea = 0;
  let subpixelFacets = 0; let subpixelArea = 0; let subpixelAreaMax = 0;
  let attemptedFacets = 0; let attemptedArea = 0;
  let scalarVisMax = -Infinity; let scalarVisMin = Infinity;
  let over45VisFacets = 0; let over45VisArea = 0;
  for (let t = 0; t < nTri; t += 1) {
    if (attempted[t] === 1) { attemptedFacets += 1; attemptedArea += area[t]; }
    if (won[t] === 1) {
      visFacets += 1; visArea += area[t]; if (area[t] > visAreaMax) visAreaMax = area[t];
      if (facing[t] <= 0) {
        backVisFacets += 1; backVisArea += area[t]; if (area[t] > backVisAreaMax) backVisAreaMax = area[t];
        if (radialCls[t] === 1) {
          backVisInwardFacets += 1; backVisInwardArea += area[t];
          if (area[t] > backVisInwardAreaMax) backVisInwardAreaMax = area[t];
        } else if (radialCls[t] === 2) { backVisAxialFacets += 1; backVisAxialArea += area[t]; }
        else { backVisOutwardFacets += 1; backVisOutwardArea += area[t]; }
      }
      if (opt.scalar !== undefined) {
        const v = opt.scalar[t];
        if (v > scalarVisMax) scalarVisMax = v;
        if (v < scalarVisMin) scalarVisMin = v;
        if (v > 45) { over45VisFacets += 1; over45VisArea += area[t]; }
      }
    } else if (attempted[t] === 1) {
      if (covered[t] === 1) { occludedFacets += 1; occludedArea += area[t]; }
      else { subpixelFacets += 1; subpixelArea += area[t]; if (area[t] > subpixelAreaMax) subpixelAreaMax = area[t]; }
    }
  }

  const stats: ViewStats = {
    W, Hpx, ss, azDeg: opt.azDeg, elDeg: opt.elDeg, halfHmm: halfH, halfWmm: halfW,
    target: opt.target, mode,
    pixelsTotal: W * Hpx, pixelsPainted, paintedFrac: pixelsPainted / (W * Hpx),
    backSamples: backSamplesTot, backSampleFracOfPainted: paintedSamples > 0 ? backSamplesTot / paintedSamples : 0,
    visFacets, visArea, visAreaMax,
    backVisFacets, backVisArea, backVisAreaShare: visArea > 0 ? backVisArea / visArea : 0, backVisAreaMax,
    backVisInwardFacets, backVisInwardArea, backVisInwardAreaShare: visArea > 0 ? backVisInwardArea / visArea : 0, backVisInwardAreaMax,
    backVisOutwardFacets, backVisOutwardArea, backVisOutwardAreaShare: visArea > 0 ? backVisOutwardArea / visArea : 0,
    backVisAxialFacets, backVisAxialArea,
    backSamplesInward, backSamplesOutward,
    occludedFacets, occludedArea,
    subpixelFacets, subpixelArea, subpixelAreaMax,
    subpixelAreaShareOfAttempted: attemptedArea > 0 ? subpixelArea / attemptedArea : 0,
    attemptedFacets, attemptedArea,
    offscreenFacets, culledFacets, tieSamples, tieFrontRescued,
    scalarVisMax: Number.isFinite(scalarVisMax) ? scalarVisMax : NaN,
    scalarVisMin: Number.isFinite(scalarVisMin) ? scalarVisMin : NaN,
    scalarOverScaleFacets,
    over45VisFacets, over45VisAreaShare: visArea > 0 ? over45VisArea / visArea : 0,
    over45SampleShare: paintedSamples > 0 ? over45Samples / paintedSamples : 0,
  };

  drawOverlay(rgb, W, Hpx, opt, stats);
  return { rgb, W, Hpx, stats };
}

// ── caption, scale bar, legend ─────────────────────────────────────────────────────────────────────────
function niceLen(target: number): number {
  const e = Math.pow(10, Math.floor(Math.log10(target)));
  for (const m of [5, 2, 1]) if (m * e <= target) return m * e;
  return e;
}
function fmt(v: number): string {
  if (!Number.isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1000) return v.toFixed(0);
  if (a >= 100) return v.toFixed(1);
  if (a >= 1) return v.toFixed(2);
  if (a >= 0.01) return v.toFixed(3);
  return v.toExponential(1);
}

function drawOverlay(rgb: Uint8Array, W: number, H: number, opt: ViewOpts, st: ViewStats): void {
  const FG: [number, number, number] = [235, 235, 235];
  const sc = W >= 900 ? 2 : 1;
  const raw: string[] = [opt.caption];
  if (opt.subcaption !== undefined) raw.push(opt.subcaption);
  raw.push(`MODE ${st.mode.toUpperCase()}  AZ ${st.azDeg.toFixed(0)} EL ${st.elDeg.toFixed(0)}  ORTHO ${(2 * st.halfWmm).toFixed(2)}X${(2 * st.halfHmm).toFixed(2)} MM  SS ${st.ss}X`);
  if (st.mode === 'backface') {
    // INWARD first, OUTWARD labelled as the interior. These are OPEN shells: the outward-wound back faces
    // are the pot's inside seen through the mouth and are CORRECT. Quoting the total as a defect share
    // would be a ~10x mis-statement on Gothic.
    raw.push(`BACK-FACING, NORMAL POINTS INWARD (DEFECT CANDIDATES): ${st.backVisInwardFacets} FACETS, ${fmt(st.backVisInwardArea)} MM2 = ${(100 * st.backVisInwardAreaShare).toFixed(4)}% OF VISIBLE AREA, MAX ${fmt(st.backVisInwardAreaMax)} MM2`);
    raw.push(`BACK-FACING, WOUND OUTWARD = INTERIOR SEEN THROUGH THE OPENING (EXPECTED): ${st.backVisOutwardFacets} FACETS, ${fmt(st.backVisOutwardArea)} MM2 = ${(100 * st.backVisOutwardAreaShare).toFixed(4)}% OF VISIBLE AREA`);
    raw.push(`BACK-FACING PIXELS: ${(100 * st.backSampleFracOfPainted).toFixed(4)}% OF PAINTED (INWARD ${st.backSamplesInward}, OUTWARD ${st.backSamplesOutward} SAMPLES; ${st.backVisAxialFacets} ON-AXIS FACETS UNCLASSIFIED)`);
  } else if (st.mode === 'heat') {
    raw.push(`SCALE ${opt.scalarLabel ?? 'SCALAR'}  ${fmt(opt.scaleMin ?? 0)} TO ${fmt(opt.scaleMax ?? 1)} ${opt.scalarUnits ?? ''}  VISIBLE MAX ${fmt(st.scalarVisMax)}  ${st.scalarOverScaleFacets} FACETS OVER SCALE (CLAMPED)`);
    raw.push(`OVER 45: ${st.over45VisFacets} VISIBLE FACETS = ${(100 * st.over45VisAreaShare).toFixed(3)}% OF VISIBLE AREA, ${(100 * st.over45SampleShare).toFixed(3)}% OF PAINTED PIXELS`);
  } else {
    raw.push(`CULLED BACK FACES: ${st.culledFacets}  VISIBLE ${st.visFacets} FACETS ${fmt(st.visArea)} MM2`);
  }
  raw.push(`SUBPIXEL (IN FRAME, ZERO SAMPLES): ${st.subpixelFacets} FACETS, ${fmt(st.subpixelArea)} MM2 = ${(100 * st.subpixelAreaShareOfAttempted).toFixed(3)}% OF IN-FRAME AREA, MAX ${fmt(st.subpixelAreaMax)} MM2`);
  if (st.tieSamples > 0) raw.push(`EXACT DEPTH TIES: ${st.tieSamples} SAMPLES, ${st.tieFrontRescued} GIVEN TO THE FRONT FACET (COINCIDENT-FIN CANDIDATES)`);

  // WRAP. A statistic that runs off the right edge of the frame is a statistic nobody reads: the first
  // Gothic render silently truncated "30416 FACETS OVER SCALE".
  const maxChars = Math.max(20, Math.floor((W - 20) / (6 * sc)));
  const lines: string[] = [];
  for (const l of raw) {
    if (l.length <= maxChars) { lines.push(l); continue; }
    let rest = l;
    while (rest.length > maxChars) {
      let cut = rest.lastIndexOf(' ', maxChars);
      if (cut <= 0) cut = maxChars;
      lines.push(rest.slice(0, cut));
      rest = `  ${rest.slice(cut).trim()}`;
    }
    if (rest.trim().length > 0) lines.push(rest);
  }

  const lh = 7 * sc + 4;
  const bh = lines.length * lh + 8;
  let bw = 0; for (const l of lines) bw = Math.max(bw, textW(l, sc));
  fillRect(rgb, W, H, 0, 0, Math.min(W, bw + 16), bh, 0, 0, 0, 0.62);
  for (let i = 0; i < lines.length; i += 1) drawText(rgb, W, H, 8, 6 + i * lh, lines[i], FG[0], FG[1], FG[2], sc);

  // scale bar, bottom-left
  const mmPerPx = (2 * st.halfWmm) / W;
  const barMm = niceLen(0.22 * 2 * st.halfWmm);
  const barPx = Math.max(8, Math.round(barMm / mmPerPx));
  const by = H - 22 * sc;
  fillRect(rgb, W, H, 10, by - 6, barPx + 14 + textW(`${fmt(barMm)} MM`, sc), 10 * sc + 12, 0, 0, 0, 0.62);
  fillRect(rgb, W, H, 16, by, barPx, 3 * sc, 245, 245, 245);
  drawText(rgb, W, H, 16, by + 4 * sc + 2, `${fmt(barMm)} MM`, 235, 235, 235, sc);

  if (st.mode === 'heat') {
    const lw = Math.min(Math.round(W * 0.42), 460); const lhh = 14 * sc;
    const lx = W - lw - 16; const ly = H - lhh - 16 * sc;
    fillRect(rgb, W, H, lx - 8, ly - 8, lw + 16, lhh + 12 * sc + 14, 0, 0, 0, 0.7);
    const rc = new Float64Array(3);
    for (let i = 0; i < lw; i += 1) {
      ramp(i / (lw - 1), rc);
      fillRect(rgb, W, H, lx + i, ly, 1, lhh, Math.round(rc[0]), Math.round(rc[1]), Math.round(rc[2]));
    }
    const smin = opt.scaleMin ?? 0; const smax = opt.scaleMax ?? 1;
    for (let k = 0; k <= 4; k += 1) {
      const v = smin + (smax - smin) * (k / 4);
      const tx = lx + Math.round((lw - 1) * (k / 4));
      fillRect(rgb, W, H, tx, ly + lhh, 2, 4, 235, 235, 235);
      const s = fmt(v);
      drawText(rgb, W, H, Math.min(W - textW(s, sc) - 2, Math.max(0, tx - textW(s, sc) / 2)), ly + lhh + 6, s, 235, 235, 235, sc);
    }
    const cap = `${opt.scalarLabel ?? 'SCALAR'} (${opt.scalarUnits ?? ''})`;
    drawText(rgb, W, H, lx, ly - 8 * sc, cap, 235, 235, 235, sc);
  }
  if (st.mode === 'backface') {
    const sy = H - 16 * sc - 16; const swx = W - 16 - textW('BACK-FACING (WINDING INVERTED TO THIS CAMERA)', sc) - 26;
    fillRect(rgb, W, H, swx - 8, sy - 8, W - swx, 16 * sc + 16, 0, 0, 0, 0.7);
    fillRect(rgb, W, H, swx, sy, 7 * sc, 7 * sc, 214, 206, 190);
    drawText(rgb, W, H, swx + 10 * sc, sy, 'FRONT-FACING', 235, 235, 235, sc);
    fillRect(rgb, W, H, swx, sy + 9 * sc, 7 * sc, 7 * sc, 255, 20, 200);
    drawText(rgb, W, H, swx + 10 * sc, sy + 9 * sc, 'BACK-FACING (WINDING INVERTED TO THIS CAMERA)', 235, 235, 235, sc);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Analytic validation meshes.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// `+ 0` normalises -0 to +0. Without it the pole vertices (0*cos(pj) with cos<0) come out as -0, which
// compares equal but HASHES differently in dihedralRuler's weld — the pole ring would silently become a
// boundary and stop being scored. Learned the expensive way elsewhere in this campaign: an instrument
// that quietly stops measuring is worse than one that throws.
function pushTri(a: number[], p: number[], q: number[], r: number[]): void {
  a.push(p[0] + 0, p[1] + 0, p[2] + 0, q[0] + 0, q[1] + 0, q[2] + 0, r[0] + 0, r[1] + 0, r[2] + 0);
}
export function buildSphere(R: number, nLat: number, nLon: number): { xyz: Float64Array; nTri: number } {
  const a: number[] = [];
  // j is taken mod nLon so the seam column is BIT-IDENTICAL to column 0 and welds exactly.
  const S = (i: number, j: number): number[] => {
    const ti = Math.PI * (i / nLat); const pj = 2 * Math.PI * ((j % nLon) / nLon);
    return [R * Math.sin(ti) * Math.cos(pj), R * Math.sin(ti) * Math.sin(pj), R * Math.cos(ti)];
  };
  for (let i = 0; i < nLat; i += 1) {
    for (let j = 0; j < nLon; j += 1) {
      const p00 = S(i, j); const p01 = S(i, j + 1); const p10 = S(i + 1, j); const p11 = S(i + 1, j + 1);
      // At i == 0 p00 == p01 (north pole) so (p00,p11,p01) is degenerate; at i == nLat-1 p10 == p11
      // (south pole) so (p00,p10,p11) is. Emitting a zero-area facet would give it a zero normal, which
      // facetDihedrals reads as a 90 deg dihedral — a fake defect on a perfect sphere.
      if (i < nLat - 1) pushTri(a, p00, p10, p11);
      if (i > 0) pushTri(a, p00, p11, p01);
    }
  }
  return { xyz: new Float64Array(a), nTri: a.length / 9 };
}
/**
 * Capped cylinder, `nZ` rows up the wall. nZ > 1 ON PURPOSE: with a single row EVERY facet touches the
 * 90 deg rim, so the dihedral heatmap comes out uniformly red and demonstrates nothing. Subdivided, the
 * wall reads blue and only the two rims read red — which is what makes the picture EVIDENCE that the
 * heatmap discriminates rather than saturates.
 */
export function buildCylinder(R: number, z0: number, z1: number, nSeg: number, nZ = 10, caps = true): { xyz: Float64Array; nTri: number } {
  const a: number[] = [];
  const P = (j: number, z: number): number[] => {
    const t = 2 * Math.PI * ((j % nSeg) / nSeg);
    return [R * Math.cos(t), R * Math.sin(t), z];
  };
  for (let j = 0; j < nSeg; j += 1) {
    for (let k = 0; k < nZ; k += 1) {
      const za = z0 + (z1 - z0) * (k / nZ); const zb = z0 + (z1 - z0) * ((k + 1) / nZ);
      const A = P(j, za); const B = P(j + 1, za); const C = P(j + 1, zb); const D = P(j, zb);
      pushTri(a, A, B, C); pushTri(a, A, C, D);
    }
    if (caps) {
      pushTri(a, [0, 0, z1], P(j, z1), P(j + 1, z1));   // top cap, outward +z
      pushTri(a, [0, 0, z0], P(j + 1, z0), P(j, z0));   // bottom cap, outward -z
    }
  }
  return { xyz: new Float64Array(a), nTri: a.length / 9 };
}
/** Reverse the winding of every facet whose centroid azimuth is within `halfDeg` of `azDeg`. */
export function corruptWindingSector(xyz: Float64Array, azDeg: number, halfDeg: number): { xyz: Float64Array; n: number } {
  const y = Float64Array.from(xyz);
  let n = 0;
  for (let t = 0; t < y.length / 9; t += 1) {
    const o = t * 9;
    const cx = (y[o] + y[o + 3] + y[o + 6]) / 3; const cy = (y[o + 1] + y[o + 4] + y[o + 7]) / 3;
    let d = Math.atan2(cy, cx) * DEG - azDeg;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    if (Math.abs(d) > halfDeg) continue;
    for (let k = 0; k < 3; k += 1) { const tmp = y[o + 3 + k]; y[o + 3 + k] = y[o + 6 + k]; y[o + 6 + k] = tmp; }
    n += 1;
  }
  return { xyz: y, n };
}
/** Reverse the winding of a contiguous run of facets. Geometry untouched — pure orientation defect. */
export function corruptWinding(xyz: Float64Array, t0: number, t1: number): Float64Array {
  const y = Float64Array.from(xyz);
  for (let t = t0; t < t1; t += 1) {
    const o = t * 9;
    for (let k = 0; k < 3; k += 1) { const tmp = y[o + 3 + k]; y[o + 3 + k] = y[o + 6 + k]; y[o + 6 + k] = tmp; }
  }
  return y;
}
/** Push a cap of vertices THROUGH the origin: a genuine self-intersecting fold, windings untouched. */
export function corruptFold(xyz: Float64Array, dir: [number, number, number], cosHalf: number): Float64Array {
  const y = Float64Array.from(xyz);
  const dl = Math.hypot(dir[0], dir[1], dir[2]);
  const dx = dir[0] / dl; const dy = dir[1] / dl; const dz = dir[2] / dl;
  for (let v = 0; v < y.length / 3; v += 1) {
    const x = y[v * 3]; const yy = y[v * 3 + 1]; const z = y[v * 3 + 2];
    const l = Math.hypot(x, yy, z);
    if (l === 0) continue;
    const c = (x * dx + yy * dy + z * dz) / l;
    if (c < cosHalf) continue;
    const w = (c - cosHalf) / (1 - cosHalf);          // 0 at the rim, 1 at the axis
    const s = 1 - 2.4 * w;                             // crosses zero ⇒ folds through the centre
    y[v * 3] = x * s; y[v * 3 + 1] = yy * s; y[v * 3 + 2] = z * s;
  }
  return y;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// Driver.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
const OUT = envS('PF_S116_OUT', 'research/exchange/_strataConformBisect/s116');
mkdirSync(OUT, { recursive: true });
mkdirSync(`${OUT}/validate`, { recursive: true });

const W = Math.round(envF('PF_S116_W', 1000));
const HPX = Math.round(envF('PF_S116_H', 1300));
const SS = Math.round(envF('PF_S116_SS', 3));

interface Emitted { path: string; bytes: number; stats: ViewStats }
const emitted: Emitted[] = [];
function emit(name: string, r: Rendered): Emitted {
  const p = `${OUT}/${name}.png`;
  const bytes = writePNG(p, r.W, r.Hpx, r.rgb);
  const e: Emitted = { path: p, bytes, stats: r.stats };
  emitted.push(e);
  log(`  wrote ${p}  ${(bytes / 1048576).toFixed(2)} MB  painted ${(100 * r.stats.paintedFrac).toFixed(1)}%  vis ${r.stats.visFacets} facets ${r.stats.visArea.toFixed(1)} mm2`);
  return e;
}

function bbox(xyz: Float64Array): { lo: number[]; hi: number[]; ctr: number[]; rad: number } {
  const lo = [Infinity, Infinity, Infinity]; const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < xyz.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = xyz[i + k];
      if (v < lo[k]) lo[k] = v;
      if (v > hi[k]) hi[k] = v;
    }
  }
  const ctr = [0, 1, 2].map((k) => 0.5 * (lo[k] + hi[k]));
  const rad = 0.5 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  return { lo, hi, ctr, rad };
}

// ── VALIDATION ────────────────────────────────────────────────────────────────────────────────────────
interface Check { name: string; ok: boolean; got: string; want: string }
const checks: Check[] = [];
function check(name: string, ok: boolean, got: string, want: string): void {
  checks.push({ name, ok, got, want });
  log(`  [${ok ? 'PASS' : '**FAIL**'}] ${name}\n           got  ${got}\n           want ${want}`);
}

function dihedralDeg(xyz: Float64Array, nTri: number): Float64Array {
  const idx = new Int32Array(nTri * 3);
  for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
  const d = facetDihedrals(xyz, idx);
  const out = new Float64Array(nTri);
  for (let t = 0; t < nTri; t += 1) out[t] = d.perFacetMaxRad[t] * DEG;
  return out;
}

function selfTest(): boolean {
  log('');
  log('══════════════════════════════════════════════════════════════════════════════════════');
  log('VALIDATION — a renderer that cannot show a defect you planted is not validated.');
  log('══════════════════════════════════════════════════════════════════════════════════════');
  const VW = 700; const VH = 700; const VSS = 3;
  const sph = buildSphere(20, 48, 96);
  const cyl = buildCylinder(15, -20, 20, 96);
  const sphArea = facetAreas(sph.xyz, sph.nTri);
  const cylArea = facetAreas(cyl.xyz, cyl.nTri);
  const sphDih = dihedralDeg(sph.xyz, sph.nTri);
  const cylDih = dihedralDeg(cyl.xyz, cyl.nTri);
  log(`  sphere ${sph.nTri} facets ${sphArea.reduce((a, b) => a + b, 0).toFixed(2)} mm2 (analytic 4piR^2 = ${(4 * Math.PI * 400).toFixed(2)})`);
  log(`  cylinder ${cyl.nTri} facets ${cylArea.reduce((a, b) => a + b, 0).toFixed(2)} mm2 (analytic 2piRh+2piR^2 = ${(2 * Math.PI * 15 * 40 + 2 * Math.PI * 225).toFixed(2)})`);

  const base = {
    W: VW, Hpx: VH, ss: VSS, azDeg: 35, elDeg: 22,
    target: [0, 0, 0] as [number, number, number], halfHmm: 24,
  };
  const rClean = renderView({ ...base, xyz: sph.xyz, nTri: sph.nTri, area: sphArea, mode: 'clay', caption: 'VALIDATE CLEAN SPHERE R20 48X96 - CLAY (BACK FACES CULLED)' });
  writePNG(`${OUT}/validate/v1_sphere_clean_clay.png`, VW, VH, rClean.rgb);
  const rCleanBF = renderView({ ...base, xyz: sph.xyz, nTri: sph.nTri, area: sphArea, mode: 'backface', caption: 'VALIDATE CLEAN SPHERE - BACKFACE MODE (MUST PAINT NOTHING)' });
  writePNG(`${OUT}/validate/v2_sphere_clean_backface.png`, VW, VH, rCleanBF.rgb);
  const rCleanHeat = renderView({
    ...base, xyz: sph.xyz, nTri: sph.nTri, area: sphArea, mode: 'heat', scalar: sphDih,
    scaleMin: 0, scaleMax: 90, scalarLabel: 'MAX ADJACENT DIHEDRAL', scalarUnits: 'DEG',
    caption: 'VALIDATE CLEAN SPHERE - DIHEDRAL HEATMAP 0-90 DEG',
  });
  writePNG(`${OUT}/validate/v3_sphere_clean_heat.png`, VW, VH, rCleanHeat.rgb);

  check('A1 clean sphere paints a real silhouette (FLOOR and CEILING)',
    rClean.stats.paintedFrac > 0.20 && rClean.stats.paintedFrac < 0.75,
    `painted ${(100 * rClean.stats.paintedFrac).toFixed(2)}% of frame`, 'in (20%, 75%) — not blank, not everything');
  check('A2 clean sphere shows ZERO back-facing (count AND pixels)',
    rCleanBF.stats.backVisFacets === 0 && rCleanBF.stats.backSamples === 0,
    `${rCleanBF.stats.backVisFacets} facets, ${rCleanBF.stats.backSamples} samples, ${(100 * rCleanBF.stats.backVisAreaShare).toFixed(6)}% area`,
    'exactly 0 and 0 — otherwise the winding/normal convention is inverted and the RUN IS VOID');
  check('A3 dihedral ruler alive but small on the sphere (FLOOR and CEILING)',
    rCleanHeat.stats.scalarVisMax > 1 && rCleanHeat.stats.scalarVisMax < 12,
    `visible max ${rCleanHeat.stats.scalarVisMax.toFixed(3)} deg, min ${rCleanHeat.stats.scalarVisMin.toFixed(3)} deg`,
    'in (1, 12) deg for a 48x96 sphere');

  const cbase = { ...base, halfHmm: 26 };
  const rCyl = renderView({ ...cbase, xyz: cyl.xyz, nTri: cyl.nTri, area: cylArea, mode: 'backface', caption: 'VALIDATE CLEAN CYLINDER R15 H40 - BACKFACE MODE (MUST PAINT NOTHING)' });
  writePNG(`${OUT}/validate/v4_cylinder_clean_backface.png`, VW, VH, rCyl.rgb);
  const rCylHeat = renderView({
    ...cbase, xyz: cyl.xyz, nTri: cyl.nTri, area: cylArea, mode: 'heat', scalar: cylDih,
    scaleMin: 0, scaleMax: 90, scalarLabel: 'MAX ADJACENT DIHEDRAL', scalarUnits: 'DEG',
    caption: 'VALIDATE CLEAN CYLINDER - DIHEDRAL HEATMAP (THE 90 DEG RIM IS REAL GEOMETRY)',
  });
  writePNG(`${OUT}/validate/v5_cylinder_clean_heat.png`, VW, VH, rCylHeat.rgb);
  check('B1 clean cylinder paints and shows ZERO back-facing',
    rCyl.stats.paintedFrac > 0.15 && rCyl.stats.backVisFacets === 0 && rCyl.stats.backSamples === 0,
    `painted ${(100 * rCyl.stats.paintedFrac).toFixed(2)}%, back ${rCyl.stats.backVisFacets} facets / ${rCyl.stats.backSamples} samples`,
    'painted > 15% AND back-facing exactly 0');
  check('B2 heatmap DISCRIMINATES on the cylinder: 90 deg rim, sub-4 deg wall (BOTH bars)',
    rCylHeat.stats.scalarVisMax > 80 && rCylHeat.stats.scalarVisMax < 100
    && rCylHeat.stats.over45VisAreaShare > 0.05 && rCylHeat.stats.over45VisAreaShare < 0.85
    && rCylHeat.stats.scalarVisMin < 5,
    `visible max ${rCylHeat.stats.scalarVisMax.toFixed(2)} deg, min ${rCylHeat.stats.scalarVisMin.toFixed(2)} deg; over-45 area share ${(100 * rCylHeat.stats.over45VisAreaShare).toFixed(3)}%`,
    'max in (80,100) deg, min < 5 deg, over-45 share in (5%, 85%) — saturating red would be no evidence');

  const rCleanNoCull = renderView({ ...base, xyz: sph.xyz, nTri: sph.nTri, area: sphArea, mode: 'backface', caption: 'nocull control' });
  const relDiff = Math.abs(rCleanNoCull.stats.pixelsPainted - rClean.stats.pixelsPainted) / Math.max(1, rClean.stats.pixelsPainted);
  check('C1 CULL == NOCULL silhouette (culling removes only hidden faces)',
    relDiff < 1e-3,
    `cull ${rClean.stats.pixelsPainted} px vs nocull ${rCleanNoCull.stats.pixelsPainted} px, rel ${relDiff.toExponential(2)}`,
    'relative difference < 1e-3');

  // ── planted defect 1: reversed windings on a contiguous patch, geometry byte-identical.
  const T0 = Math.floor(sph.nTri * 0.30); const T1 = T0 + 900;
  const wind = corruptWinding(sph.xyz, T0, T1);
  const rWindClay = renderView({ ...base, xyz: wind, nTri: sph.nTri, area: sphArea, mode: 'clay', caption: `PLANTED DEFECT: ${T1 - T0} WINDINGS REVERSED - CLAY (HOLE)` });
  writePNG(`${OUT}/validate/v6_sphere_windflip_clay.png`, VW, VH, rWindClay.rgb);
  const rWind = renderView({ ...base, xyz: wind, nTri: sph.nTri, area: sphArea, mode: 'backface', caption: `PLANTED DEFECT: ${T1 - T0} WINDINGS REVERSED - BACKFACE (MUST PAINT)` });
  writePNG(`${OUT}/validate/v7_sphere_windflip_backface.png`, VW, VH, rWind.rgb);
  check('D1 wind-flip: BACKFACE mode DOES paint, above a floor',
    rWind.stats.backVisFacets > 50 && rWind.stats.backVisInwardFacets > 50 && rWind.stats.backSampleFracOfPainted > 0.002,
    `${rWind.stats.backVisFacets} back-facing facets visible, ${fmt(rWind.stats.backVisArea)} mm2 = ${(100 * rWind.stats.backVisAreaShare).toFixed(3)}% of visible area, ${(100 * rWind.stats.backSampleFracOfPainted).toFixed(3)}% of painted pixels`,
    '> 50 facets AND > 0.2% of painted pixels');
  check('D2 wind-flip: geometry unchanged so the NOCULL silhouette is unchanged',
    Math.abs(rWind.stats.pixelsPainted - rCleanNoCull.stats.pixelsPainted) / Math.max(1, rCleanNoCull.stats.pixelsPainted) < 1e-3,
    `${rWind.stats.pixelsPainted} px vs clean nocull ${rCleanNoCull.stats.pixelsPainted} px`,
    'relative difference < 1e-3');
  check('D3 wind-flip: CLAY mode opens a HOLE (fewer painted pixels than clean clay)',
    rWindClay.stats.pixelsPainted < rClean.stats.pixelsPainted * 0.995 && rWindClay.stats.pixelsPainted > rClean.stats.pixelsPainted * 0.5,
    `clay painted ${rWindClay.stats.pixelsPainted} px vs clean ${rClean.stats.pixelsPainted} px (${(100 * (1 - rWindClay.stats.pixelsPainted / rClean.stats.pixelsPainted)).toFixed(3)}% lost)`,
    'between 0.5% and 50% of the silhouette lost');

  // ── planted defect 2: a genuine self-intersecting fold, windings untouched.
  const fold = corruptFold(sph.xyz, [0.6, 0.5, 0.62], Math.cos(24 / DEG));
  const foldArea = facetAreas(fold, sph.nTri);
  const foldDih = dihedralDeg(fold, sph.nTri);
  const rFold = renderView({
    ...base, xyz: fold, nTri: sph.nTri, area: foldArea, mode: 'heat', scalar: foldDih,
    scaleMin: 0, scaleMax: 90, scalarLabel: 'MAX ADJACENT DIHEDRAL', scalarUnits: 'DEG',
    caption: 'PLANTED DEFECT: SELF-INTERSECTING FOLD - DIHEDRAL HEATMAP (MUST PAINT)',
  });
  writePNG(`${OUT}/validate/v8_sphere_fold_heat.png`, VW, VH, rFold.rgb);
  const rFoldBF = renderView({ ...base, xyz: fold, nTri: sph.nTri, area: foldArea, mode: 'backface', caption: 'PLANTED DEFECT: SELF-INTERSECTING FOLD - BACKFACE' });
  writePNG(`${OUT}/validate/v9_sphere_fold_backface.png`, VW, VH, rFoldBF.rgb);
  check('E1 fold: dihedral heatmap DOES paint above 90 deg where clean was under 12',
    rFold.stats.scalarVisMax > 90 && rFold.stats.over45VisAreaShare > 0.001,
    `visible max ${rFold.stats.scalarVisMax.toFixed(2)} deg (clean ${rCleanHeat.stats.scalarVisMax.toFixed(2)}), over-45 area share ${(100 * rFold.stats.over45VisAreaShare).toFixed(3)}%`,
    'max > 90 deg AND over-45 area share > 0.1%');
  check('E2 fold: the fold ALSO turns some facets inside-out (reported, not asserted tight)',
    rFoldBF.stats.backVisFacets > 0,
    `${rFoldBF.stats.backVisFacets} back-facing facets, ${(100 * rFoldBF.stats.backVisAreaShare).toFixed(3)}% of visible area`,
    '> 0 — a fold through the centre inverts the far sheet');

  // ── THE NEAR/FAR DISCRIMINATOR, validated on the geometry it exists for.
  // The shipping pots are OPEN single-sheet shells. Looking down the mouth you see the REVERSE of the far
  // wall: back-facing and CORRECT. If the total back-facing figure were quoted as a defect share it would
  // overstate by ~10x on these meshes. An open cylinder reproduces exactly that situation, so the split
  // is checked in BOTH directions rather than asserted.
  const open = buildCylinder(15, -20, 20, 96, 10, false);
  const openArea = facetAreas(open.xyz, open.nTri);
  const rOpen = renderView({
    ...cbase, xyz: open.xyz, nTri: open.nTri, area: openArea, mode: 'backface',
    caption: 'VALIDATE OPEN CYLINDER (NO CAPS), WINDINGS CORRECT - INTERIOR IS BACK-FACING AND EXPECTED, INWARD MUST BE 0',
  });
  writePNG(`${OUT}/validate/v10_opencyl_clean_backface.png`, VW, VH, rOpen.rgb);
  check('F1 open shell: correct windings give OUTWARD-wound back faces (interior) and ZERO inward',
    rOpen.stats.backVisOutwardFacets > 100 && rOpen.stats.backVisInwardFacets === 0,
    `outward ${rOpen.stats.backVisOutwardFacets} facets ${(100 * rOpen.stats.backVisOutwardAreaShare).toFixed(3)}% of visible area; INWARD ${rOpen.stats.backVisInwardFacets} facets ${(100 * rOpen.stats.backVisInwardAreaShare).toFixed(6)}%; axial ${rOpen.stats.backVisAxialFacets}`,
    'outward > 100 facets (the mouth is open) AND inward exactly 0 (nothing is inverted)');

  const openBad = corruptWindingSector(open.xyz, 35, 12);
  const rOpenBad = renderView({
    ...cbase, xyz: openBad.xyz, nTri: open.nTri, area: openArea, mode: 'backface',
    caption: `PLANTED: ${openBad.n} WINDINGS REVERSED IN ONE SECTOR OF AN OPEN SHELL`,
  });
  writePNG(`${OUT}/validate/v11_opencyl_nearflip_backface.png`, VW, VH, rOpenBad.rgb);
  check('F2 open shell: a planted inversion is SEPARATED from the interior, not buried in it',
    rOpenBad.stats.backVisInwardFacets > 20 && rOpenBad.stats.backVisInwardAreaShare > 0.01
    && Math.abs(rOpenBad.stats.backVisOutwardFacets - rOpen.stats.backVisOutwardFacets) <= 2,
    `inward ${rOpenBad.stats.backVisInwardFacets} facets ${(100 * rOpenBad.stats.backVisInwardAreaShare).toFixed(3)}% of visible area (was ${rOpen.stats.backVisInwardFacets}); outward ${rOpenBad.stats.backVisOutwardFacets} (was ${rOpen.stats.backVisOutwardFacets})`,
    'inward > 20 facets and > 1% of visible area, up from exactly 0, WITHOUT moving the interior count');

  const ok = checks.every((c) => c.ok);
  log('');
  log(`VALIDATION: ${checks.filter((c) => c.ok).length}/${checks.length} PASS  =>  ${ok ? 'RENDERER VALIDATED' : '*** RENDERER NOT VALIDATED — EVERY IMAGE BELOW IS VOID ***'}`);
  log(`validation PNGs: ${OUT}/validate/`);
  return ok;
}

// ── MESH RENDERING ────────────────────────────────────────────────────────────────────────────────────
function renderMesh(stl: string, tag: string): void {
  log('');
  log('══════════════════════════════════════════════════════════════════════════════════════');
  log(`MESH ${tag}: ${stl}`);
  const t0 = Date.now();
  const { xyz, nTri } = readMeshFloat64(stl, false);
  const area = facetAreas(xyz, nTri);
  let areaTot = 0; for (let t = 0; t < nTri; t += 1) areaTot += area[t];
  const bb = bbox(xyz);
  log(`  ${nTri} facets, ${areaTot.toFixed(3)} mm2, read+area in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  log(`  bbox x[${bb.lo[0].toFixed(3)}, ${bb.hi[0].toFixed(3)}] y[${bb.lo[1].toFixed(3)}, ${bb.hi[1].toFixed(3)}] z[${bb.lo[2].toFixed(3)}, ${bb.hi[2].toFixed(3)}]`);

  const MODES = envS('PF_S116_MODES', 'clay,backface,heat').split(',').map((s) => s.trim()).filter((s) => s.length > 0) as RenderMode[];
  const AZ = envS('PF_S116_AZ', '0,90,180,270').split(',').map(Number);
  const EL = envF('PF_S116_EL', 14);
  const HEATMAX = envF('PF_S116_HEATMAX', 90);

  let scalar: Float64Array | undefined;
  let sLabel = 'MAX ADJACENT DIHEDRAL'; let sUnits = 'DEG'; let sMin = 0; let sMax = HEATMAX;
  if (MODES.includes('heat')) {
    const sp = process.env.PF_S116_SCALAR;
    if (sp !== undefined && sp.length > 0) {
      if (!existsSync(sp)) throw new Error(`PF_S116_SCALAR not found: ${sp}`);
      const buf = readFileSync(sp);
      if (buf.length !== nTri * 8) throw new Error(`PF_S116_SCALAR is ${buf.length} bytes; expected ${nTri * 8} (f64 x nTri)`);
      scalar = new Float64Array(buf.buffer, buf.byteOffset, nTri);
      sLabel = envS('PF_S116_SCALAR_LABEL', 'SUPPLIED SCALAR');
      sUnits = envS('PF_S116_SCALAR_UNITS', '');
      sMin = envF('PF_S116_SCALAR_MIN', 0);
      sMax = envF('PF_S116_SCALAR_MAX', 1);
      log(`  scalar from ${sp}: ${sLabel} [${sMin}, ${sMax}] ${sUnits}`);
    } else {
      const td = Date.now();
      scalar = dihedralDeg(xyz, nTri);
      let mx = 0; for (let t = 0; t < nTri; t += 1) if (scalar[t] > mx) mx = scalar[t];
      log(`  dihedral ruler: ${((Date.now() - td) / 1000).toFixed(1)} s, whole-mesh max ${mx.toFixed(3)} deg`);
    }
  }

  const sub = `${nTri} FACETS  ${areaTot.toFixed(1)} MM2  Z ${bb.lo[2].toFixed(1)} TO ${bb.hi[2].toFixed(1)} MM`;
  const halfH = 0.56 * (bb.hi[2] - bb.lo[2]);
  const ctr: [number, number, number] = [bb.ctr[0], bb.ctr[1], bb.ctr[2]];

  for (const mode of MODES) {
    const azList = mode === 'heat' ? AZ.slice(0, 2) : AZ;
    for (const az of azList) {
      const r = renderView({
        xyz, nTri, area, W, Hpx: HPX, ss: SS, azDeg: az, elDeg: EL, target: ctr, halfHmm: halfH,
        mode, scalar: mode === 'heat' ? scalar : undefined,
        scaleMin: sMin, scaleMax: sMax, scalarLabel: sLabel, scalarUnits: sUnits,
        caption: `${tag}  ${stl.split(/[\\/]/).pop()}`, subcaption: sub,
      });
      emit(`${tag}_orbit_az${String(az).padStart(3, '0')}_${mode}`, r);
    }
  }

  // ── ZOOMS. "th,z,halfmm" triples, and/or the token `auto`.
  //
  // `auto` exists because a blind (theta, z) guess on a 1.7 M-facet pot lands on nothing. It picks two
  // sites FROM THE DATA and renders each at two scales:
  //   PEAK — the facet carrying the maximum scalar. The extreme, which may be a sliver.
  //   BIG  — the LARGEST-AREA facet over the 45 deg bar. The extreme by the currency that matters, since
  //          this campaign has repeatedly measured count and area disagreeing in DIRECTION.
  // Both are reported with their scalar AND their area so neither can stand in for the other.
  const ZOOM_EL = envF('PF_S116_ZOOM_EL', 0);
  interface ZoomSite { thDeg: number; zMm: number; halfMm: number; r?: number; tag: string }
  const sites: ZoomSite[] = [];
  const zs = envS('PF_S116_ZOOMS', '').trim();
  for (const part of zs.split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
    if (part.toLowerCase() === 'auto') {
      if (scalar === undefined) { log('  zoom auto: no scalar available (heat mode not selected) — skipped'); continue; }
      let tPeak = -1; let vPeak = -Infinity; let tBig = -1; let aBig = -1;
      for (let t = 0; t < nTri; t += 1) {
        if (scalar[t] > vPeak) { vPeak = scalar[t]; tPeak = t; }
        if (scalar[t] > 45 && area[t] > aBig) { aBig = area[t]; tBig = t; }
      }
      for (const [t, name] of [[tPeak, 'peak'], [tBig, 'big']] as Array<[number, string]>) {
        if (t < 0) continue;
        const o = t * 9;
        const cx = (xyz[o] + xyz[o + 3] + xyz[o + 6]) / 3;
        const cy = (xyz[o + 1] + xyz[o + 4] + xyz[o + 7]) / 3;
        const cz = (xyz[o + 2] + xyz[o + 5] + xyz[o + 8]) / 3;
        const th = Math.atan2(cy, cx); const rr = Math.hypot(cx, cy);
        log(`  zoom auto/${name}: facet ${t}  scalar ${scalar[t].toFixed(3)} ${sUnits}  area ${area[t].toExponential(3)} mm2  th ${(th * DEG).toFixed(4)} deg  z ${cz.toFixed(4)} mm  r ${rr.toFixed(4)} mm`);
        for (const half of [4, 0.8]) sites.push({ thDeg: th * DEG, zMm: cz, halfMm: half, r: rr, tag: `auto${name}${half}` });
      }
      continue;
    }
    const [a, b, c] = part.split(',').map(Number);
    sites.push({ thDeg: a, zMm: b, halfMm: c, tag: `th${a}z${b}h${c}` });
  }

  for (const site of sites) {
    const th = site.thDeg / DEG;
    let rTarget = site.r;
    if (rTarget === undefined) {
      // Measured from the mesh, not assumed: without the style's rA the wall radius here is unknown.
      let rs = 0; let n = 0; let rmax = 0;
      const dth = Math.max(2 / DEG, (2 * site.halfMm) / 40);
      for (let v = 0; v < nTri * 3; v += 1) {
        const x = xyz[v * 3]; const y = xyz[v * 3 + 1]; const z = xyz[v * 3 + 2];
        if (Math.abs(z - site.zMm) > site.halfMm) continue;
        let a2 = Math.atan2(y, x) - th;
        while (a2 > Math.PI) a2 -= 2 * Math.PI;
        while (a2 < -Math.PI) a2 += 2 * Math.PI;
        if (Math.abs(a2) > dth) continue;
        const rr = Math.hypot(x, y);
        rs += rr; n += 1; if (rr > rmax) rmax = rr;
      }
      rTarget = n > 0 ? rs / n : 0.5 * Math.hypot(bb.hi[0] - bb.lo[0], bb.hi[1] - bb.lo[1]);
      log(`  zoom ${site.tag}: ${n} vertices in window, mean r ${rTarget.toFixed(3)} mm, max r ${rmax.toFixed(3)} mm`);
    }
    const target: [number, number, number] = [rTarget * Math.cos(th), rTarget * Math.sin(th), site.zMm];
    for (const mode of MODES) {
      const r = renderView({
        // S121: the zoom elevation is a parameter (PF_S116_ZOOM_EL, default 0 = the previous behaviour,
        // byte-identical when unset). A HORIZONTAL band — a tread annulus at a C0 z-step — is seen
        // EDGE-ON at elevation 0 and collapses to a line no matter how far you zoom, so a camera that
        // cannot be tilted cannot photograph the one feature this session had to look at.
        xyz, nTri, area, W: 1100, Hpx: 1100, ss: SS, azDeg: site.thDeg, elDeg: ZOOM_EL, target, halfHmm: site.halfMm,
        mode, scalar: mode === 'heat' ? scalar : undefined,
        scaleMin: sMin, scaleMax: sMax, scalarLabel: sLabel, scalarUnits: sUnits,
        caption: `${tag} ZOOM ${site.tag.toUpperCase()}  TH=${site.thDeg.toFixed(3)} DEG  Z=${site.zMm.toFixed(3)} MM  HALF=${site.halfMm} MM`,
        subcaption: sub,
      });
      emit(`${tag}_zoom_${site.tag}_${mode}`, r);
    }
  }
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────────────
const T_ALL = Date.now();
log(`s116Render — single-sided software rasteriser. out=${OUT}  W=${W} H=${HPX} SS=${SS}`);
let validated = true;
if (envS('PF_S116_SELFTEST', '1') !== '0') validated = selfTest();
if (!validated) {
  log('');
  log('*** VALIDATION FAILED — REFUSING TO RENDER. THE RUN IS VOID. ***');
  process.exitCode = 1;
} else if (envS('PF_S116_ONLYTEST', '0') === '1') {
  log('PF_S116_ONLYTEST=1 — validation only.');
} else {
  const stls = envS('PF_S116_STL', '').split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  const tags = envS('PF_S116_TAG', '').split(';').map((s) => s.trim());
  if (stls.length === 0) log('PF_S116_STL empty — nothing to render.');
  for (let i = 0; i < stls.length; i += 1) {
    if (!existsSync(stls[i])) throw new Error(`STL not found: ${stls[i]}`);
    log(`  (${statSync(stls[i]).size} bytes)`);
    renderMesh(stls[i], tags[i] ?? `M${i}`);
  }
}

const summary = {
  tool: 's116Render.ts',
  when: new Date().toISOString(),
  validated,
  checks,
  images: emitted.map((e) => ({ path: e.path, bytes: e.bytes, stats: e.stats })),
};
// Tagged per run: an ONLYTEST pass once overwrote a 44-image census with an empty one.
const sumPath = `${OUT}/S116_RENDER_SUMMARY_${envS('PF_S116_RTAG', 'ALL')}.json`;
writeFileSync(sumPath, JSON.stringify(summary, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v), 2));
log('');
log(`summary  ${sumPath}`);
log(`images   ${emitted.length}, largest ${(Math.max(0, ...emitted.map((e) => e.bytes)) / 1048576).toFixed(2)} MB`);
log(`total    ${((Date.now() - T_ALL) / 1000).toFixed(1)} s`);
