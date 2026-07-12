function denseBary(n: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j + i <= n; j++) pts.push([i / n, j / n, (n - i - j) / n]);
  return pts;
}
const DENSE8 = denseBary(8);

function perpDistToPlane(
  p: [number, number, number], a: [number, number, number],
  b: [number, number, number], c: [number, number, number],
): number {
  const abx = b[0]-a[0], aby = b[1]-a[1], abz = b[2]-a[2];
  const acx = c[0]-a[0], acy = c[1]-a[1], acz = c[2]-a[2];
  const nx = aby*acz - abz*acy, ny = abz*acx - abx*acz, nz = abx*acy - aby*acx;
  const nLen = Math.hypot(nx, ny, nz);
  if (nLen < 1e-15) return 0;
  const apx = p[0]-a[0], apy = p[1]-a[1], apz = p[2]-a[2];
  return Math.abs(apx*nx + apy*ny + apz*nz) / nLen;
}

export interface SagReport {
  maxSagMm: number;
  facetCount: number;
  overTolCount: number;
  worst: { u: number; t: number; sagMm: number } | null;
}

export function scoreOuterSag(
  solid: { paramVerts: Float32Array; pos3D: Float32Array; indices: Uint32Array;
           outerIndexStart: number; outerIndexEnd: number },
  lift: (u: number, t: number) => [number, number, number],
  tolMm: number,
): SagReport {
  const { paramVerts, pos3D, indices, outerIndexStart, outerIndexEnd } = solid;
  const uAt = (v: number) => paramVerts[v * 3], tAt = (v: number) => paramVerts[v * 3 + 1];
  const xyz = (v: number): [number, number, number] => [pos3D[v*3], pos3D[v*3+1], pos3D[v*3+2]];

  let maxSag = 0, overTol = 0, facets = 0;
  let worst: SagReport['worst'] = null;

  for (let ti = outerIndexStart; ti < outerIndexEnd; ti += 3) {
    const ia = indices[ti], ib = indices[ti + 1], ic = indices[ti + 2];
    const A = xyz(ia), B = xyz(ib), C = xyz(ic);
    const ua = uAt(ia), ta = tAt(ia), ub = uAt(ib), tb = tAt(ib), uc = uAt(ic), tc = tAt(ic);
    facets++;
    let facetWorst = 0, facetU = ua, facetT = ta;
    for (const [wa, wb, wc] of DENSE8) {
      const u = wa*ua + wb*ub + wc*uc, t = wa*ta + wb*tb + wc*tc;
      const P = lift(u, t);
      const d = perpDistToPlane(P, A, B, C);
      if (d > facetWorst) { facetWorst = d; facetU = u; facetT = t; }
    }
    if (facetWorst > tolMm) overTol++;
    if (facetWorst > maxSag) { maxSag = facetWorst; worst = { u: facetU, t: facetT, sagMm: facetWorst }; }
  }
  return { maxSagMm: maxSag, facetCount: facets, overTolCount: overTol, worst };
}
