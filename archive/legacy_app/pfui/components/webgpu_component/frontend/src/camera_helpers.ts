import type { Vec3 } from './camera_basis';
export type Ray = { origin: Vec3; dir: Vec3 };

const EPS = 1e-6;
const vec3Length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);
const vec3Normalize = (v: Vec3): Vec3 => {
  const len = vec3Length(v);
  if (!Number.isFinite(len) || len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
};
const vec3Subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vec3Dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vec3Scale = (v: Vec3, s: number): Vec3 => [v[0] * s, v[1] * s, v[2] * s];
const vec3Add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export const invertMat4 = (m: Float32Array): Float32Array | null => {
  const inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
  let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return null;
  det = 1 / det;
  for (let i = 0; i < 16; i += 1) inv[i] *= det;
  return inv;
};

const transformClipToWorld = (inv: Float32Array, x: number, y: number, z: number): Vec3 | null => {
  const cx = inv[0] * x + inv[4] * y + inv[8] * z + inv[12];
  const cy = inv[1] * x + inv[5] * y + inv[9] * z + inv[13];
  const cz = inv[2] * x + inv[6] * y + inv[10] * z + inv[14];
  const cw = inv[3] * x + inv[7] * y + inv[11] * z + inv[15];
  if (!Number.isFinite(cw) || Math.abs(cw) < EPS) return null;
  const iw = 1 / cw;
  return [cx * iw, cy * iw, cz * iw];
};

export const worldRayFromCanvas = (rig: { viewProjection: Float32Array }, canvas: HTMLCanvasElement, clientX: number, clientY: number): Ray | null => {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const ndcX = ((clientX - rect.left) / width) * 2 - 1;
  const ndcY = -(((clientY - rect.top) / height) * 2 - 1);
  const invVP = invertMat4(rig.viewProjection);
  if (!invVP) return null;
  const nearPoint = transformClipToWorld(invVP, ndcX, ndcY, 0);
  const farPoint = transformClipToWorld(invVP, ndcX, ndcY, 1);
  if (!nearPoint || !farPoint) return null;
  const dir = vec3Normalize(vec3Subtract(farPoint, nearPoint));
  return { origin: nearPoint, dir };
};

export const intersectRayZPlane = (ray: Ray, z: number): Vec3 | null => {
  if (Math.abs(ray.dir[2]) < EPS) return null;
  const t = (z - ray.origin[2]) / ray.dir[2];
  if (!Number.isFinite(t) || t <= 0) return null;
  return [ray.origin[0] + ray.dir[0] * t, ray.origin[1] + ray.dir[1] * t, z];
};

export const intersectRayCylinder = (ray: Ray, radius: number, minZ: number, maxZ: number): Vec3 | null => {
  if (radius <= EPS) return null;
  const dx = ray.dir[0];
  const dy = ray.dir[1];
  const ox = ray.origin[0];
  const oy = ray.origin[1];
  const a = dx * dx + dy * dy;
  if (Math.abs(a) < EPS) return null;
  const b = 2 * (ox * dx + oy * dy);
  const c = ox * ox + oy * oy - radius * radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sqrtDisc = Math.sqrt(disc);
  const invDenom = 0.5 / a;
  const candidates = [(-b - sqrtDisc) * invDenom, (-b + sqrtDisc) * invDenom].filter((t) => Number.isFinite(t) && t > EPS);
  candidates.sort((a, b) => a - b);
  for (const t of candidates) {
    const z = ray.origin[2] + ray.dir[2] * t;
    if (z >= minZ - EPS && z <= maxZ + EPS) {
      return [ray.origin[0] + dx * t, ray.origin[1] + dy * t, z];
    }
  }
  return null;
};

export default {};
