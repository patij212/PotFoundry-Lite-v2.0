import { describe, expect, it } from 'vitest';

import { assembleVoronoiConformingChords } from '../../src/geometry/targetSolid/voronoiConformingChords';
import {
  voronoiBisectorSegmentsUv,
  type VoronoiLatticeParams,
} from '../../src/geometry/targetSolid/voronoiBisectorGuides';

/* STRATA-001 S2 diagnostic: dump the chord set for the first N bisector
 * segments, with the cell each chord cuts, so an INVALID_PARTITION can be
 * traced to a concrete pair. Gated PF_STRATA_DUMP=1. */

const RUN = process.env.PF_STRATA_DUMP === '1';
const LATTICE: VoronoiLatticeParams = {
  scale: 8,
  jitter: 0.8,
  pulse: 0,
  zStretch: 1,
  period: 8,
};

describe('STRATA chord dump', () => {
  it.runIf(RUN)('prints chords + cells for the first N segments', () => {
    const segs = Number.parseInt(process.env.PF_STRATA_DUMP_SEGS ?? '2', 10);
    const aLog2 = Number.parseInt(process.env.PF_STRATA_DUMP_ALOG2 ?? '8', 10);
    const vLog2 = Number.parseInt(process.env.PF_STRATA_DUMP_VLOG2 ?? '5', 10);
    const bits = 16;
    const denominator = 2 ** bits;
    const uStep = denominator / 2 ** aLog2;
    const vStep = denominator / 2 ** vLog2;

    const source = voronoiBisectorSegmentsUv(LATTICE).slice(0, segs);
    const lines: string[] = ['', `=== source segments (uv) ===`];
    for (const [index, s] of source.entries()) {
      lines.push(
        `  seg${index}: (${s.a[0].toFixed(6)}, ${s.a[1].toFixed(6)}) -> (${s.b[0].toFixed(6)}, ${s.b[1].toFixed(6)})`
      );
    }

    const { chords, droppedToJunctions } = assembleVoronoiConformingChords(LATTICE, {
      angularDivisionsLog2: aLog2,
      verticalDivisionsLog2: vLog2,
      chordFractionBits: bits,
      segmentLimit: segs,
    });
    lines.push('', `=== ${chords.length} chords (dropped ${droppedToJunctions}) ===`);
    const cellCount = new Map<string, number>();
    for (const chord of chords) {
      const su = Number(chord.start.uNumerator);
      const sv = Number(chord.start.vNumerator);
      const eu = Number(chord.end.uNumerator);
      const ev = Number(chord.end.vNumerator);
      const uCell = Math.floor((su + eu) / 2 / uStep);
      const vCell = Math.floor((sv + ev) / 2 / vStep);
      const key = `${uCell},${vCell}`;
      cellCount.set(key, (cellCount.get(key) ?? 0) + 1);
      const tag = (n: number, step: number): string => (n % step === 0 ? 'G' : '.');
      lines.push(
        `  cell(${key})  (${su}${tag(su, uStep)}, ${sv}${tag(sv, vStep)}) -> (${eu}${tag(eu, uStep)}, ${ev}${tag(ev, vStep)})`
      );
    }
    const contested = [...cellCount.entries()].filter(([, n]) => n > 1);
    lines.push('', `cells with >1 chord: ${contested.length} ${JSON.stringify(contested)}`);

    // Vertex degree census: a vertex touched by exactly one chord is an orphan
    // (T-junction) UNLESS it is a full grid corner, which every cell already owns.
    const degree = new Map<string, number>();
    for (const chord of chords) {
      for (const point of [chord.start, chord.end]) {
        const key = `${point.uNumerator},${point.vNumerator}`;
        degree.set(key, (degree.get(key) ?? 0) + 1);
      }
    }
    const orphans: string[] = [];
    for (const [key, count] of degree) {
      if (count !== 1) continue;
      const [u, v] = key.split(',').map(Number);
      const isCorner = u % uStep === 0 && v % vStep === 0;
      const onDomainEdge = u === 0 || u === denominator || v === 0 || v === denominator;
      if (!isCorner && !onDomainEdge) orphans.push(key);
    }
    lines.push(
      `degree-1 vertices that are NOT grid corners (T-JUNCTIONS): ${orphans.length}`,
      ...orphans.slice(0, 20).map((o) => `  orphan ${o}`),
      ''
    );
    // eslint-disable-next-line no-console
    console.log(lines.join('\n'));
    expect(chords.length).toBeGreaterThanOrEqual(0);
  });
});
