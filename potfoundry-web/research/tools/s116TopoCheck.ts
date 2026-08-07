// s116TopoCheck.ts — topology + fold census of a WRITTEN STL, read back from disk.
// The deliverable is the FILE, not the in-memory mesh that produced it, so the shipping numbers have to
// come from a re-read. Analytic-free (dihedralRuler only) except for the ceiling, which is printed for
// reference from the caller's env. usage env: PF_S116_STL(abs, ';'-separated) PF_S116_CEIL(deg)
import { readMeshFloat64 } from '../bridge/_facetTruthPool';
import { facetDihedrals } from '../bridge/dihedralRuler';

// eslint-disable-next-line no-console
const log = console.log;
const DEG = 180 / Math.PI;
const CEIL = Number(process.env.PF_S116_CEIL ?? '168.160');
for (const stl of (process.env.PF_S116_STL ?? '').split(';').map((s) => s.trim()).filter((s) => s.length > 0)) {
  const { xyz, nTri } = readMeshFloat64(stl, false);
  const idx = new Int32Array(nTri * 3);
  for (let i = 0; i < nTri * 3; i += 1) idx[i] = i;
  const D = facetDihedrals(xyz, idx);
  let area = 0; for (let t = 0; t < nTri; t += 1) area += D.areaMm2[t];
  const bar = (deg: number): { n: number; a: number } => {
    let n = 0; let a = 0; const r = deg / DEG;
    for (let t = 0; t < nTri; t += 1) if (D.perFacetMaxRad[t] > r) { n += 1; a += D.areaMm2[t]; }
    return { n, a };
  };
  let mx = 0; for (let t = 0; t < nTri; t += 1) if (D.perFacetMaxRad[t] > mx) mx = D.perFacetMaxRad[t];
  const c45 = bar(45); const cc = bar(CEIL); const bl = bar(175);
  log(`\n${stl.split(/[\\/]/).pop()}`);
  log(`  facets ${nTri}   3D area ${area.toFixed(3)} mm2`);
  log(`  TOPOLOGY  interior ${D.interiorEdges}  boundary ${D.boundaryEdges}  NON-MANIFOLD ${D.nonManifoldEdges}  INCONSISTENT WINDING ${D.inconsistentEdges}`);
  log(`  dihedral MAX ${(mx * DEG).toFixed(3)} deg`);
  log(`  >45 deg    COUNT ${c45.n} (${((c45.n / nTri) * 100).toFixed(4)}%)  AREA ${c45.a.toFixed(4)} mm2 (${((c45.a / area) * 100).toFixed(4)}% OF MESH)`);
  log(`  >CEIL ${CEIL.toFixed(2)}  COUNT ${cc.n} (${((cc.n / nTri) * 100).toFixed(4)}%)  AREA ${cc.a.toFixed(4)} mm2 (${((cc.a / area) * 100).toFixed(4)}% OF MESH)`);
  log(`  >=175 deg  COUNT ${bl.n} (${((bl.n / nTri) * 100).toFixed(4)}%)  AREA ${bl.a.toFixed(4)} mm2 (${((bl.a / area) * 100).toFixed(4)}% OF MESH)`);
}
