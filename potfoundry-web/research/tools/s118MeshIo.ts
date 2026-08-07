// s118MeshIo.ts — bounded-memory mesh IO for the 1e7-triangle regime, plus a closed-form synthetic mesh.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// WHY A SECOND READER EXISTS NEXT TO readMeshFloat64
// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// A BINARY STL STORES f32. `readMeshFloat64` widens every coordinate to f64 and hands back a
// Float64Array of 9N — 720 MB at N=1e7 — while `readFileSync` is simultaneously holding the whole 500 MB
// file. `readMeshF32` keeps the SAME VALUES in a Float32Array (360 MB) and streams the file in blocks so
// the file is never resident whole.
//
// THE HALVING IS EXACT, NOT AN APPROXIMATION, AND THAT IS CHECKABLE:
//   * the source datum is an f32 bit pattern;
//   * `Buffer.readFloatLE` returns the f64 that exactly represents that f32;
//   * storing it into a Float32Array round-trips to the same bit pattern;
//   * reading it back out of the Float32Array widens EXACTLY to the same f64.
// So every downstream f64 expression sees identical operands and produces identical results, including
// `facetDihedralsBig`'s EXACT-equality weld. s118Ceilings stage `read` diffs the two readers coordinate
// by coordinate and refuses to call it a saving unless the diff count is 0. Do not take this on trust —
// it is the one assumption the whole bounded-memory design rests on.
//
// The synthetic mesh is a CLOSED TUBE GRID, chosen because its V/E/F and interior/boundary edge counts
// have a closed form. A topology ruler validated against a previous RUN only proves reproducibility; one
// validated against a closed form proves correctness, and at 1e7 facets there is no previous run.
import { openSync, readSync, writeSync, closeSync, statSync } from 'node:fs';

export interface MeshF32 { xyz: Float32Array; nTri: number }

/** Binary STL -> Float32Array of 9 coords per triangle, streamed. Stored facet normals are ignored. */
export function readMeshF32(path: string, blockFacets = 200_000): MeshF32 {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(84);
    readSync(fd, head, 0, 84, 0);
    const nTri = head.readUInt32LE(80);
    const size = statSync(path).size;
    if (size !== 84 + nTri * 50) throw new Error(`STL size mismatch: ${size} != 84 + ${nTri}*50`);
    const xyz = new Float32Array(nTri * 9);
    const blk = Buffer.alloc(blockFacets * 50);
    let done = 0;
    while (done < nTri) {
      const n = Math.min(blockFacets, nTri - done);
      let got = 0;
      while (got < n * 50) {
        const r = readSync(fd, blk, got, n * 50 - got, 84 + done * 50 + got);
        if (r <= 0) throw new Error(`short read at facet ${done}`);
        got += r;
      }
      for (let t = 0; t < n; t += 1) {
        const o = t * 50 + 12;
        const w = (done + t) * 9;
        for (let k = 0; k < 9; k += 1) xyz[w + k] = blk.readFloatLE(o + k * 4);
      }
      done += n;
    }
    return { xyz, nTri };
  } finally { closeSync(fd); }
}

export interface TubeSpec { nTheta: number; nZ: number; V: number; E: number; F: number; interior: number; boundary: number }

/**
 * Closed form for an nTheta x nZ tube grid (wrapped in theta, open at top and bottom), 2 facets per quad.
 *   V = nTheta*(nZ+1)
 *   E = nTheta*(nZ+1)  [theta-direction rings]  +  nTheta*nZ  [z-direction rungs]  +  nTheta*nZ  [diagonals]
 *   F = 2*nTheta*nZ ,  chi = V - E + F = 0 ,  boundary = 2*nTheta (the two open rims)
 */
export function tubeClosedForm(nTheta: number, targetFacets: number): TubeSpec {
  const nZ = Math.max(1, Math.floor(targetFacets / (2 * nTheta)));
  const V = nTheta * (nZ + 1);
  const E = nTheta * (nZ + 1) + 2 * nTheta * nZ;
  const F = 2 * nTheta * nZ;
  const boundary = 2 * nTheta;
  return { nTheta, nZ, V, E, F, interior: E - boundary, boundary };
}

/**
 * Write the synthetic tube as a binary STL, STREAMED one theta-column at a time.
 *
 * The radius carries a deliberate two-frequency ripple so the mesh is not a developable cylinder: a
 * dihedral ruler on a perfect cylinder reads a single spacing-determined angle everywhere and would hide
 * an indexing bug. Vertex coordinates are computed from (i, j) alone and written as f32, so the two (or
 * four) facets that share a corner emit BIT-IDENTICAL bytes and the exact-equality weld must find them.
 * Returns the byte count written.
 */
export function writeSynthTubeStl(path: string, cf: TubeSpec, H: number, Rb: number, Rt: number): number {
  return writeSynthStl(path, cf, H, (th, z) => Rb + (Rt - Rb) * (z / H)
    + 1.5 * Math.sin(6 * th) * Math.cos((3 * Math.PI * z) / H)
    + 0.4 * Math.sin(29 * th + (7 * Math.PI * z) / H));
}

/**
 * Write an nTheta x nZ tube grid lifted onto ANY radius law, streamed one theta-column at a time.
 *
 * Passing a real style's rA is how the 1e7 TIMING run is made representative. A synthetic mesh whose
 * radius law does not match the surface being scored is useless as a cost proxy: EVERY facet would be
 * flagged by the radial prefilter and the perpendicular phase would price a mesh nobody will ever build.
 * With the style's own rA the residual is the honest chord sag of a 1e7 grid, which is the regime the
 * DRIVE agents are actually heading for.
 */
export function writeSynthStl(path: string, cf: TubeSpec, H: number, rFn: (th: number, z: number) => number): number {
  const { nTheta, nZ } = cf;
  const TAU = 2 * Math.PI;
  const colX = new Float64Array(nZ + 1); const colY = new Float64Array(nZ + 1); const colZ = new Float64Array(nZ + 1);
  const nxtX = new Float64Array(nZ + 1); const nxtY = new Float64Array(nZ + 1); const nxtZ = new Float64Array(nZ + 1);
  const fillCol = (i: number, X: Float64Array, Y: Float64Array, Z: Float64Array): void => {
    const th = (i / nTheta) * TAU;
    const cs = Math.cos(th); const sn = Math.sin(th);
    for (let j = 0; j <= nZ; j += 1) {
      const z = (j / nZ) * H;
      const r = rFn(th, z);
      X[j] = r * cs; Y[j] = r * sn; Z[j] = z;
    }
  };
  const fd = openSync(path, 'w');
  let written = 0;
  try {
    const head = Buffer.alloc(84);
    head.writeUInt32LE(cf.F, 80);
    writeSync(fd, head, 0, 84); written += 84;
    const blk = Buffer.alloc(2 * nZ * 50);
    fillCol(0, colX, colY, colZ);
    for (let i = 0; i < nTheta; i += 1) {
      fillCol((i + 1) % nTheta, nxtX, nxtY, nxtZ);
      let o = 0;
      for (let j = 0; j < nZ; j += 1) {
        // quad corners: a=(i,j) b=(i+1,j) c=(i+1,j+1) d=(i,j+1); triangles (a,b,c) and (a,c,d)
        const ax = colX[j], ay = colY[j], az = colZ[j];
        const bx = nxtX[j], by = nxtY[j], bz = nxtZ[j];
        const cx = nxtX[j + 1], cy = nxtY[j + 1], cz = nxtZ[j + 1];
        const dx = colX[j + 1], dy = colY[j + 1], dz = colZ[j + 1];
        o = emitTri(blk, o, ax, ay, az, bx, by, bz, cx, cy, cz);
        o = emitTri(blk, o, ax, ay, az, cx, cy, cz, dx, dy, dz);
      }
      writeSync(fd, blk, 0, o); written += o;
      colX.set(nxtX); colY.set(nxtY); colZ.set(nxtZ);
    }
  } finally { closeSync(fd); }
  return written;
}

function emitTri(
  b: Buffer, o: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number,
): number {
  let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
  let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
  let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
  b.writeFloatLE(nx, o); b.writeFloatLE(ny, o + 4); b.writeFloatLE(nz, o + 8);
  b.writeFloatLE(ax, o + 12); b.writeFloatLE(ay, o + 16); b.writeFloatLE(az, o + 20);
  b.writeFloatLE(bx, o + 24); b.writeFloatLE(by, o + 28); b.writeFloatLE(bz, o + 32);
  b.writeFloatLE(cx, o + 36); b.writeFloatLE(cy, o + 40); b.writeFloatLE(cz, o + 44);
  b.writeUInt16LE(0, o + 48);
  return o + 50;
}
