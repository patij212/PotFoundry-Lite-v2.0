export type Vec3 = [number, number, number];

const EPS = 1e-6;

export const projectAxisToTangent = (axisWorld: Vec3, normal: Vec3 | null): Vec3 => {
  if (!normal) return axisWorld;
  const dot = axisWorld[0] * normal[0] + axisWorld[1] * normal[1] + axisWorld[2] * normal[2];
  const proj: Vec3 = [axisWorld[0] - dot * normal[0], axisWorld[1] - dot * normal[1], axisWorld[2] - dot * normal[2]];
  const len = Math.hypot(proj[0], proj[1], proj[2]);
  if (len > EPS) {
    return [proj[0] / len, proj[1] / len, proj[2] / len];
  }
  return axisWorld;
};

export default {};
