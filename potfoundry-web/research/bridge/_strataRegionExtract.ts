// _strataRegionExtract.ts — P5 STEP 2. LOAD-WEIGHTED REGION EXTRACTION over the traced junction disks.
// RESEARCH ONLY; nothing in src/ may import this.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IT IS FOR
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The tracer emits 235 junction disks per run and the judge emits a visible-artifact census. Neither one
// tells you WHICH disks to route. This joins them: it re-runs the judge's own normal gate over a finished
// STL, localises every gated facet into the disk that contains it, and ranks the disks by MEASURED ARTIFACT
// LOAD — never by disk count. That distinction is not stylistic; it was measured (worklog, P5 handoff §2):
// z 25-30 carries 35 disks and 42 back-facing facets, while z 80-85 carries 17 disks and 411.
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// IT VALIDATES ITSELF AGAINST THE INSTRUMENT IT EXTENDS, AND REFUSES OTHERWISE
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// The gate is re-implemented here rather than imported because `_judgeNormal` returns aggregate counts plus
// a bounded worst-list (an insertion sort, unusable at full size), and Step 2 needs the per-facet answer.
// A classifier that does not reproduce the instrument it claims to extend is measuring something else — so
// `validate` compares the recomputed counts against the judge's published ones and the caller is expected
// to refuse on a mismatch. The GATED count must be EXACT; `over90` and `featureSpanning` carry a small
// recorded delta (11 facets on `_S11A`, 3 on `_S15A`, always in the same direction and always inside the
// exempt population, so the gate count is unaffected).
//
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// COMPONENTS, NOT DIFFERENCES (the 2026-07-31 metric note)
// ────────────────────────────────────────────────────────────────────────────────────────────────────────
// `gated = over90 - featureSpanning` exactly, and S15 demonstrated that the difference can move against
// fidelity because the EXEMPTION moves. So every per-disk record here carries all three numbers, and the
// out-of-disk population is additionally binned by distance to the nearest traced locus. Rank on whatever
// you like; BAR on components.
import { readFileSync } from 'node:fs';
import { canonTheta, dThRaw } from './_sweepPredicate';

/** the chart's isotropic reference radius — the same constant the tracer and the seed builder use. */
const R_REF = 45;

export const REGION_SCHEMA = 'pf.strata.regions/1';

export interface TracedJunction {
  theta: number;
  z: number;
  radiusMm: number;
  branches?: number;
  minAngleDeg?: number;
  branchDirs?: Array<{ dirTheta: number; dirZ: number; exitTheta: number; exitZ: number }>;
}

export interface RegionRecord {
  /** stable id: the disk's index in the run's own loci.json junction array. */
  id: number;
  theta: number;
  z: number;
  radiusMm: number;
  branches: number;
  minAngleDeg: number;
  /** MEASURED ARTIFACT LOAD — the three components, never just the difference. */
  gated: number;
  over90: number;
  featureSpanning: number;
  /** facets whose centroid lies in the disk, of any classification — the denominator. */
  facets: number;
  /** gated per mm^2 of disk area. */
  loadDensity: number;
  branchDirs: Array<{ dirTheta: number; dirZ: number; exitTheta: number; exitZ: number }>;
}

export interface RegionArtifact {
  schema: string;
  source: { stl: string; loci: string; nTri: number };
  validate: {
    over90: number; gated: number; featureSpanning: number;
    judge?: { over90: number; gated: number; featureSpanning: number };
    exact: boolean;
  };
  totals: {
    disks: number;
    disksWithLoad: number;
    gatedInDisk: number;
    gatedOutOfDisk: number;
    /** out-of-disk gated facets binned by distance to the NEAREST TRACED LOCUS, in um. */
    outOfDiskByLocusDist: Array<{ upToUm: number; count: number }>;
    outOfDiskOnLocusBand: number;
    outOfDiskOffLocus: number;
  };
  /** every disk, ordered by DESCENDING measured load. */
  regions: RegionRecord[];
}

export interface ExtractOpts {
  stlPath: string;
  lociPath: string;
  /** the audit's radius function, already bound to (style, params, dims) — never rebuilt here. */
  rA: (th: number, z: number) => number;
  /** the judge's published counts, for the self-validation. */
  judge?: { over90: number; gated: number; featureSpanning: number };
  /** an "on-locus" facet is one whose centroid is within this of a traced polyline, mm. */
  onLocusBandMm?: number;
  /** bin edges for the out-of-disk distance histogram, um. */
  binsUm?: number[];
}

/**
 * The FIVE-candidate analytic normal test, transcribed from `_judgeNormal` rather than imported.
 * A guard and an auditor sharing a definition cannot disagree; this one is CHECKED against it instead.
 */
function makeBestDot(rA: (th: number, z: number) => number): (th: number, z: number, fx: number, fy: number, fz: number) => number {
  const hTh = 1e-6; const hZ = 1e-6;
  return (th, z, fx, fy, fz) => {
    const r0 = rA(th, z);
    const rTp = rA(th + hTh, z); const rTm = rA(th - hTh, z);
    const rZp = rA(th, z + hZ); const rZm = rA(th, z - hZ);
    const ct = Math.cos(th); const st = Math.sin(th);
    const cands: Array<[number, number]> = [
      [(rTp - rTm) / (2 * hTh), (rZp - rZm) / (2 * hZ)],
      [(rTp - r0) / hTh, (rZp - r0) / hZ],
      [(rTp - r0) / hTh, (r0 - rZm) / hZ],
      [(r0 - rTm) / hTh, (rZp - r0) / hZ],
      [(r0 - rTm) / hTh, (r0 - rZm) / hZ],
    ];
    let best = -Infinity;
    for (const [rt, rz] of cands) {
      const nx = r0 * ct + rt * st;
      const ny = r0 * st - rt * ct;
      const nz = -r0 * rz;
      const n = Math.hypot(nx, ny, nz) || 1;
      const d = (fx * nx + fy * ny + fz * nz) / n;
      if (d > best) best = d;
    }
    return best;
  };
}

/** bucketed nearest-distance-to-locus in the flat chart, seam-safe via shortest-arc theta deltas. */
function makeLocusDistance(loci: Array<{ pts: Array<[number, number]> }>): (th: number, z: number) => number {
  const ax: number[] = []; const ay: number[] = []; const bx: number[] = []; const by: number[] = [];
  for (const L of loci) {
    for (let i = 0; i + 1 < L.pts.length; i += 1) {
      // segments are stored in UNWRAPPED chart x relative to their own first endpoint; queries unwrap to it
      ax.push(R_REF * canonTheta(L.pts[i][0])); ay.push(L.pts[i][1]);
      bx.push(R_REF * canonTheta(L.pts[i][0]) + R_REF * dThRaw(canonTheta(L.pts[i][0]), canonTheta(L.pts[i + 1][0])));
      by.push(L.pts[i + 1][1]);
    }
  }
  const BS = 2.0;                                  // mm; ~1.5 segments per cell at this trace density
  const buckets = new Map<string, number[]>();
  for (let s = 0; s < ax.length; s += 1) {
    for (let gx = Math.floor(Math.min(ax[s], bx[s]) / BS); gx <= Math.floor(Math.max(ax[s], bx[s]) / BS); gx += 1) {
      for (let gy = Math.floor(Math.min(ay[s], by[s]) / BS); gy <= Math.floor(Math.max(ay[s], by[s]) / BS); gy += 1) {
        const k = `${gx},${gy}`; const l = buckets.get(k); if (l === undefined) buckets.set(k, [s]); else l.push(s);
      }
    }
  }
  const one = (x: number, y: number, s: number): number => {
    const ux = bx[s] - ax[s]; const uy = by[s] - ay[s];
    const l2 = ux * ux + uy * uy;
    // unwrap the query onto this segment's own frame
    let qx = ax[s] + R_REF * dThRaw(canonTheta(ax[s] / R_REF), canonTheta(x / R_REF));
    if (!Number.isFinite(qx)) qx = x;
    let t = l2 < 1e-18 ? 0 : ((qx - ax[s]) * ux + (y - ay[s]) * uy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(qx - (ax[s] + t * ux), y - (ay[s] + t * uy));
  };
  return (th, z) => {
    const x = R_REF * canonTheta(th); const y = z;
    let best = Infinity;
    // widen the ring until something is found — the loci are dense, so this is 1-2 rings in practice
    for (let ring = 1; ring <= 12; ring += 1) {
      const gx0 = Math.floor(x / BS); const gy0 = Math.floor(y / BS);
      for (let dx = -ring; dx <= ring; dx += 1) {
        for (let dy = -ring; dy <= ring; dy += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring && ring > 1) continue;   // only the new shell
          for (const s of buckets.get(`${gx0 + dx},${gy0 + dy}`) ?? []) {
            const d = one(x, y, s);
            if (d < best) best = d;
          }
        }
      }
      // a segment two whole cells outside the current best cannot beat it
      if (best <= (ring - 1) * BS) break;
    }
    return best;
  };
}

export function extractRegions(o: ExtractOpts): RegionArtifact {
  const bestDot = makeBestDot(o.rA);
  const art = JSON.parse(readFileSync(o.lociPath, 'utf8')) as {
    junctions: TracedJunction[]; loci: Array<{ pts: Array<[number, number]> }>;
  };
  const disks = art.junctions;
  const distToLocus = makeLocusDistance(art.loci);
  const buf = readFileSync(o.stlPath);
  const nTri = buf.readUInt32LE(80);

  const rec: RegionRecord[] = disks.map((d, i) => ({
    id: i, theta: d.theta, z: d.z, radiusMm: d.radiusMm,
    branches: d.branches ?? (d.branchDirs?.length ?? 0),
    minAngleDeg: d.minAngleDeg ?? 0,
    gated: 0, over90: 0, featureSpanning: 0, facets: 0, loadDensity: 0,
    branchDirs: d.branchDirs ?? [],
  }));
  // disk lookup, bucketed — 235 disks against ~1M facets is 235M tests unbucketed
  const DBS = 4.0;
  const dBuckets = new Map<string, number[]>();
  // SEAM-SAFE BY CONSTRUCTION: a disk whose bounding box crosses theta=0 is registered TWICE, once at each
  // end of the chart, so a facet centroid at theta ~ 2pi finds a disk centred at theta ~ 0. Measured cost of
  // getting this wrong: 1 facet on `_S11A` and 4 on `_S15A` misfiled as out-of-disk against the linear-scan
  // classifier. Small, and exactly the class of error that is invisible until something depends on it.
  const CHART_W = R_REF * 2 * Math.PI;
  for (let i = 0; i < disks.length; i += 1) {
    const cy = disks[i].z; const r = disks[i].radiusMm;
    const cx0 = R_REF * canonTheta(disks[i].theta);
    const shifts = [0];
    if (cx0 - r < 0) shifts.push(CHART_W);
    if (cx0 + r > CHART_W) shifts.push(-CHART_W);
    for (const sh of shifts) {
      const cx = cx0 + sh;
      for (let gx = Math.floor((cx - r) / DBS); gx <= Math.floor((cx + r) / DBS); gx += 1) {
        for (let gy = Math.floor((cy - r) / DBS); gy <= Math.floor((cy + r) / DBS); gy += 1) {
          const k = `${gx},${gy}`; const l = dBuckets.get(k); if (l === undefined) dBuckets.set(k, [i]); else l.push(i);
        }
      }
    }
  }
  const whichDisk = (th: number, z: number): number => {
    const x = R_REF * canonTheta(th);
    for (const i of dBuckets.get(`${Math.floor(x / DBS)},${Math.floor(z / DBS)}`) ?? []) {
      if (Math.hypot(R_REF * dThRaw(canonTheta(th), disks[i].theta), z - disks[i].z) <= disks[i].radiusMm) return i;
    }
    return -1;
  };

  const binsUm = o.binsUm ?? [25, 50, 100, 200, 400, 800, 1600, 3200, Infinity];
  const bins = binsUm.map((u) => ({ upToUm: u, count: 0 }));
  const bandMm = o.onLocusBandMm ?? 0.2;
  let over90 = 0; let gated = 0; let featSpan = 0;
  let gatedInDisk = 0; let gatedOut = 0; let onBand = 0; let offBand = 0;

  const P = new Float64Array(9);
  for (let t = 0; t < nTri; t += 1) {
    const off = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k += 1) P[k] = buf.readFloatLE(off + k * 4);
    const ux = P[3] - P[0]; const uy = P[4] - P[1]; const uz = P[5] - P[2];
    const vx = P[6] - P[0]; const vy = P[7] - P[1]; const vz = P[8] - P[2];
    let fx = uy * vz - uz * vy; let fy = uz * vx - ux * vz; let fz = ux * vy - uy * vx;
    const fl = Math.hypot(fx, fy, fz);
    if (!(fl > 0)) continue;
    fx /= fl; fy /= fl; fz /= fl;
    const cx = (P[0] + P[3] + P[6]) / 3; const cy = (P[1] + P[4] + P[7]) / 3; const cz = (P[2] + P[5] + P[8]) / 3;
    const cth = canonTheta(Math.atan2(cy, cx));
    const dk = whichDisk(cth, cz);
    if (dk >= 0) rec[dk].facets += 1;
    if (bestDot(cth, cz, fx, fy, fz) >= 0) continue;          // front-facing at the centroid
    over90 += 1;
    if (dk >= 0) rec[dk].over90 += 1;
    let allBack = true;
    for (let k = 0; k < 3; k += 1) {
      const vth = canonTheta(Math.atan2(P[k * 3 + 1], P[k * 3]));
      if (bestDot(vth, P[k * 3 + 2], fx, fy, fz) >= 0) { allBack = false; break; }
    }
    if (!allBack) { featSpan += 1; if (dk >= 0) rec[dk].featureSpanning += 1; continue; }
    gated += 1;
    if (dk >= 0) { rec[dk].gated += 1; gatedInDisk += 1; continue; }
    gatedOut += 1;
    const d = distToLocus(cth, cz);
    if (d <= bandMm) onBand += 1; else offBand += 1;
    for (const b of bins) { if (d * 1000 <= b.upToUm) { b.count += 1; break; } }
  }

  for (const r of rec) r.loadDensity = r.gated / Math.max(1e-9, Math.PI * r.radiusMm * r.radiusMm);
  rec.sort((a, b) => (b.gated - a.gated) || (b.over90 - a.over90) || (a.id - b.id));

  return {
    schema: REGION_SCHEMA,
    source: { stl: o.stlPath, loci: o.lociPath, nTri },
    validate: {
      over90, gated, featureSpanning: featSpan, judge: o.judge,
      exact: o.judge === undefined ? false : o.judge.gated === gated,
    },
    totals: {
      disks: disks.length,
      disksWithLoad: rec.filter((r) => r.gated > 0).length,
      gatedInDisk, gatedOutOfDisk: gatedOut,
      outOfDiskByLocusDist: bins,
      outOfDiskOnLocusBand: onBand, outOfDiskOffLocus: offBand,
    },
    regions: rec,
  };
}
