// research/spike-raycast-oracle/scorecard.ts
export interface ScoreRow {
  style: string;
  featureKinds: Record<string, number>;
  sagOffMm: number; overTolOff: number;
  sagOnMm: number; overTolOn: number;
  verdictRan: boolean;
  trisOff: number; trisOn: number;
  worstOn: { u: number; t: number; sagMm: number } | null;
  conditionC: { ok: boolean; boundaryEdges: number; nonManifoldEdges: number;
                orientationMismatches: number; selfIntersections: number; stlPath: string };
  driftMaxMm: number | null;
}

const f = (x: number, d = 4) => x.toFixed(d);
const drift = (x: number | null) => (x === null ? 'pending' : f(x));

function goNoGo(r: ScoreRow): string {
  // Spike-methodology pivot (Task 4): CPU/GPU drift gates ahead of A/C —
  // where the CPU field diverges from the certified GPU field, the CPU sag
  // numbers measure the wrong surface and can't certify tolerance.
  // 0.002mm = 20% of the 0.01mm tolerance.
  if (r.driftMaxMm !== null && r.driftMaxMm > 0.002) return 'CPU/GPU drift too large — CPU sag unverified (needs GPU measurement)';
  const aMet = r.overTolOn === 0;
  const cMet = r.conditionC.ok;
  if (aMet && cMet) return 'A+C met (oracle-refine viable)';
  if (!aMet && r.verdictRan) return 'A UNMET after verdict cap → remesher/machinery signal';
  if (!aMet && !r.verdictRan) return 'A UNMET, verdict inert (feature kind not general-curve)';
  if (!cMet) return `C UNMET (bnd=${r.conditionC.boundaryEdges}) → SP3 watertight`;
  return 'see notes';
}

export function renderScorecard(rows: ScoreRow[], capNote: string): string {
  const head = [
    '# Raycast-Oracle Fidelity Scorecard (2026-07-12)',
    '',
    `**Cap (recorded/reasoned):** ${capNote}`,
    '',
    '**Bar:** A) max outer chord-sag ≤ 0.01mm everywhere; B2) feature-band facets satisfy A;',
    'C) watertight/manifold/oriented + self-intersection-free (validator) + manual slice.',
    'Triangle counts are reported, not gated. Drift (CPU-vs-certified-GPU) certifies A in Phase 2.',
    '',
    '| Style | feature kinds | sag OFF | >tol OFF | sag ON | >tol ON | verdictRan | tris OFF | tris ON | worst(u,t) | C ok | bnd | nonMan | orient | selfX | drift max | verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];
  const body = rows.map((r) => {
    const w = r.worstOn ? `(${f(r.worstOn.u, 3)},${f(r.worstOn.t, 3)})` : '—';
    const kinds = Object.entries(r.featureKinds).map(([k, n]) => `${k}:${n}`).join(' ') || 'none';
    return `| ${r.style} | ${kinds} | ${f(r.sagOffMm)} | ${r.overTolOff} | ${f(r.sagOnMm)} | ${r.overTolOn} | ${r.verdictRan} | ${r.trisOff} | ${r.trisOn} | ${w} | ${r.conditionC.ok} | ${r.conditionC.boundaryEdges} | ${r.conditionC.nonManifoldEdges} | ${r.conditionC.orientationMismatches} | ${r.conditionC.selfIntersections} | ${drift(r.driftMaxMm)} | ${goNoGo(r)} |`;
  });
  return [...head, ...body, ''].join('\n');
}
