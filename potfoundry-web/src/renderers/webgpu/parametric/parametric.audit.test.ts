/**
 * parametric.audit.test.ts — Diagnostic audit harness for the parametric export pipeline.
 *
 * This is NOT a regression test suite. It is a measurement instrument designed
 * to convert the vague claim "the parametric export is buggy" into a concrete,
 * sorted triage list of failing invariants and fixture × metric cells.
 *
 *   Phase A — fixture matrix × metrics → triage table (logged to stdout)
 *   Phase B — focused invariant tests using `it.fails` (PASS on HEAD because
 *             the bug is present; will FAIL once the bug is fixed, prompting
 *             a flip to `it`)
 *
 * Run with:
 *   npx vitest run src/renderers/webgpu/parametric/parametric.audit.test.ts --reporter=default
 *
 * The audit operates entirely in UV space — no GPU eval, no 3D positions.
 * That is sufficient for: manifold, boundary edges, constraint enforcement,
 * chain connectivity, aspect ratio, cross-row span. It is NOT sufficient for:
 * ridge distance (R48), seam pos gap (3D), normal consistency.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { buildCDTOuterWall } from './OuterWallTessellator';
import { collectChainVertices } from './ChainVertexBuilder';
import type { FeatureChain } from './types';

// ============================================================================
// Fixture generators
// ============================================================================

interface BuiltFixture {
    chains: FeatureChain[];
    rowMapping: number[];
    tPositions: Float32Array;
    unionU: Float32Array;
    numU: number;
    numT: number;
    name: string;
    tags: {
        chainCount: number;
        hasSpiral: boolean;
        hasSeamCrossing: boolean;
        hasMultiRowGaps: boolean;
    };
}

function makeUniform(n: number): Float32Array {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = i / (n - 1);
    return a;
}

function makeRowMapping(numT: number): number[] {
    return Array.from({ length: numT }, (_, i) => i);
}

interface ChainSpec {
    numChains: number;
    numU: number;
    numT: number;
    spiralDuPerRow?: number;
    seamCrossingChainIdx?: number;
    multiRowGapEvery?: number;
}

/**
 * Build a set of chains evenly distributed in U, each running top-to-bottom.
 *
 * - `spiralDuPerRow` adds a per-row u-shift, simulating petal twist.
 * - `seamCrossingChainIdx` shifts that chain's base u to ~0.97 so the spiral
 *   wraps the u=1 boundary.
 * - `multiRowGapEvery` drops every Nth row from one chain (forces interpolation).
 */
function makeEvenChains(spec: ChainSpec): FeatureChain[] {
    const { numChains, numT, spiralDuPerRow = 0, seamCrossingChainIdx, multiRowGapEvery } = spec;
    if (numChains === 0) return [];

    const chains: FeatureChain[] = [];
    for (let c = 0; c < numChains; c++) {
        let baseU: number;
        if (seamCrossingChainIdx === c) {
            baseU = 0.97;
        } else {
            baseU = (c + 0.5) / numChains; // spread evenly, avoid u=0 exactly
        }

        const points: Array<{ row: number; u: number }> = [];
        for (let r = 0; r < numT; r++) {
            if (multiRowGapEvery && c === 0 && r > 0 && r % multiRowGapEvery === 0) continue;
            let u = baseU + spiralDuPerRow * r;
            u = ((u % 1) + 1) % 1; // wrap to [0,1)
            if (u >= 1) u = 1 - 1e-7;
            points.push({ row: r, u });
        }
        if (points.length >= 2) {
            chains.push({ kind: c % 2 === 0 ? 'peak' : 'valley', points });
        }
    }
    return chains;
}

function buildFixture(name: string, params: {
    numU: number;
    numT: number;
    chainSpec: ChainSpec;
}): BuiltFixture {
    const { numU, numT, chainSpec } = params;
    const chains = makeEvenChains({ ...chainSpec, numU, numT });
    return {
        chains,
        rowMapping: makeRowMapping(numT),
        tPositions: makeUniform(numT),
        unionU: makeUniform(numU),
        numU,
        numT,
        name,
        tags: {
            chainCount: chains.length,
            hasSpiral: (chainSpec.spiralDuPerRow ?? 0) !== 0,
            hasSeamCrossing: chainSpec.seamCrossingChainIdx !== undefined,
            hasMultiRowGaps: (chainSpec.multiRowGapEvery ?? 0) > 0,
        },
    };
}

/**
 * Adaptive-grid variant of buildFixture: unionU is the sorted, deduped union
 * of (a) all chain U positions across all rows plus (b) a sparse uniform base
 * grid. Mimics production's GridBuilder behavior of inserting a grid column
 * at each chain's U position, so chain vertices land ON grid columns rather
 * than NEAR them.
 *
 * Used to test whether F10/F11/F14 aspect ratios are a uniform-grid audit
 * artifact (chain-vertex / grid-column proximity) or a real production bug.
 */
function buildAdaptiveFixture(name: string, params: {
    baseUColumns: number;
    numT: number;
    chainSpec: ChainSpec;
}): BuiltFixture {
    const { baseUColumns, numT, chainSpec } = params;
    const chains = makeEvenChains({ ...chainSpec, numU: baseUColumns, numT });

    const uSet = new Set<number>();
    // sparse uniform base
    for (let i = 0; i < baseUColumns; i++) uSet.add(i / (baseUColumns - 1));
    // chain U positions across all rows
    for (const chain of chains) {
        for (const p of chain.points) uSet.add(p.u);
    }
    // ensure endpoints
    uSet.add(0);
    uSet.add(1 - 1e-7);

    const unionU = Float32Array.from([...uSet].sort((a, b) => a - b));
    return {
        chains,
        rowMapping: makeRowMapping(numT),
        tPositions: makeUniform(numT),
        unionU,
        numU: unionU.length,
        numT,
        name,
        tags: {
            chainCount: chains.length,
            hasSpiral: (chainSpec.spiralDuPerRow ?? 0) !== 0,
            hasSeamCrossing: chainSpec.seamCrossingChainIdx !== undefined,
            hasMultiRowGaps: (chainSpec.multiRowGapEvery ?? 0) > 0,
        },
    };
}

// ============================================================================
// Metric computation (UV-space)
// ============================================================================

interface AuditMetrics {
    triangles: number;
    gridVertexCount: number;
    chainVertexCount: number;
    chainEdgeCount: number;
    chainEdgesEnforced: number;
    chainEdgesMissing: number;
    boundaryEdges: number;
    nonManifoldEdges: number;
    degenerateTris: number;
    maxAspect: number;
    maxRowSpan: number;
    crossRowTrisGt1: number;
    crossRowTrisGt3: number;
    chainConnectedComponents: number;
    chainInputCount: number; // for compare: components should equal input count
}

const ZERO_AREA_EPS = 1e-12;

function rowOfVertex(
    vidx: number,
    gridVertexCount: number,
    numU: number,
    chainVertexRows: Map<number, number>,
): number {
    if (vidx < gridVertexCount) return Math.floor(vidx / numU);
    return chainVertexRows.get(vidx) ?? -1;
}

function computeMetrics(
    result: ReturnType<typeof buildCDTOuterWall>,
    fixture: BuiltFixture,
): AuditMetrics {
    const indices = result.indices;
    const vertices = result.vertices;
    const numU = fixture.numU;

    // chain vertex row lookup
    const chainVertexRows = new Map<number, number>();
    for (const cv of (function () {
        const collected = collectChainVertices(
            fixture.chains,
            new Map(fixture.rowMapping.map((v, i) => [v, i])),
            fixture.numT,
            fixture.numU * fixture.numT,
        );
        return collected.chainVertices;
    })()) {
        chainVertexRows.set(cv.vertexIdx, cv.rowIdx);
    }

    // Build edge → face-count map and gather triangle stats
    const edgeFaces = new Map<string, number>();
    let degenerateTris = 0;
    let maxAspect = 0;
    let maxRowSpan = 0;
    let crossRowTrisGt1 = 0;
    let crossRowTrisGt3 = 0;
    let triCount = 0;

    const addEdge = (a: number, b: number) => {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        edgeFaces.set(key, (edgeFaces.get(key) ?? 0) + 1);
    };

    for (let t = 0; t < indices.length; t += 3) {
        const a = indices[t], b = indices[t + 1], c = indices[t + 2];
        if (a === b && b === c) continue; // skip the "collapsed" 0,0,0 sentinels
        triCount++;

        if (a === b || b === c || a === c) {
            degenerateTris++;
            continue;
        }
        addEdge(a, b);
        addEdge(b, c);
        addEdge(a, c);

        const ax = vertices[a * 3], ay = vertices[a * 3 + 1];
        const bx = vertices[b * 3], by = vertices[b * 3 + 1];
        const cx = vertices[c * 3], cy = vertices[c * 3 + 1];

        const ab = Math.hypot(bx - ax, by - ay);
        const bc = Math.hypot(cx - bx, cy - by);
        const ca = Math.hypot(ax - cx, ay - cy);
        const longest = Math.max(ab, bc, ca);
        const shortest = Math.min(ab, bc, ca);
        if (shortest < 1e-12) {
            degenerateTris++;
            continue;
        }
        const area = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) * 0.5;
        if (area < ZERO_AREA_EPS) {
            degenerateTris++;
            continue;
        }
        // Aspect = longest_edge² / (4 × area × √3) — standard quality metric;
        // normalized so equilateral = 1.0
        const aspect = (longest * longest) / (4 * area * Math.sqrt(3));
        if (aspect > maxAspect) maxAspect = aspect;

        const rA = rowOfVertex(a, result.gridVertexCount, numU, chainVertexRows);
        const rB = rowOfVertex(b, result.gridVertexCount, numU, chainVertexRows);
        const rC = rowOfVertex(c, result.gridVertexCount, numU, chainVertexRows);
        if (rA >= 0 && rB >= 0 && rC >= 0) {
            const span = Math.max(rA, rB, rC) - Math.min(rA, rB, rC);
            if (span > maxRowSpan) maxRowSpan = span;
            if (span > 1) crossRowTrisGt1++;
            if (span > 3) crossRowTrisGt3++;
        }
    }

    let boundaryEdges = 0;
    let nonManifoldEdges = 0;
    for (const count of edgeFaces.values()) {
        if (count === 1) boundaryEdges++;
        else if (count > 2) nonManifoldEdges++;
    }

    // Chain-edge enforcement
    const meshEdgeSet = new Set(edgeFaces.keys());
    let enforced = 0;
    let missing = 0;
    for (const [v0, v1] of result.chainEdges) {
        if (v0 === v1) continue;
        const key = v0 < v1 ? `${v0}-${v1}` : `${v1}-${v0}`;
        if (meshEdgeSet.has(key)) enforced++;
        else missing++;
    }

    // Chain connected components per input chain
    // Map chain vertex idx → input chainId, then union-find over chainEdges,
    // and count components that contain at least one vertex from each chain.
    const chainVertexChainId = result.chainVertexChainIds;
    const parent = new Map<number, number>();
    for (const vidx of chainVertexChainId.keys()) parent.set(vidx, vidx);
    const find = (x: number): number => {
        let p = parent.get(x);
        if (p === undefined) return x;
        while (p !== x) {
            const np = parent.get(p)!;
            parent.set(x, np);
            x = p;
            p = np;
        }
        return x;
    };
    for (const [a, b] of result.chainEdges) {
        if (!parent.has(a) || !parent.has(b)) continue;
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
    }
    // Count distinct roots per chainId, summed
    const rootsByChain = new Map<number, Set<number>>();
    for (const [vidx, chainId] of chainVertexChainId) {
        if (!parent.has(vidx)) continue;
        const r = find(vidx);
        let set = rootsByChain.get(chainId);
        if (!set) { set = new Set(); rootsByChain.set(chainId, set); }
        set.add(r);
    }
    let totalComponents = 0;
    for (const set of rootsByChain.values()) totalComponents += set.size;

    return {
        triangles: triCount,
        gridVertexCount: result.gridVertexCount,
        chainVertexCount: chainVertexRows.size,
        chainEdgeCount: result.chainEdges.length,
        chainEdgesEnforced: enforced,
        chainEdgesMissing: missing,
        boundaryEdges,
        nonManifoldEdges,
        degenerateTris,
        maxAspect: Number.isFinite(maxAspect) ? maxAspect : -1,
        maxRowSpan,
        crossRowTrisGt1,
        crossRowTrisGt3,
        chainConnectedComponents: totalComponents,
        chainInputCount: fixture.chains.length,
    };
}

// ============================================================================
// Phase A — fixture matrix
// ============================================================================

const PHASE_A_FIXTURES: Array<() => BuiltFixture> = [
    () => buildFixture('F01_empty',                 { numU: 20,  numT: 5,  chainSpec: { numChains: 0,  numU: 0, numT: 0 } }),
    () => buildFixture('F02_single_vertical',       { numU: 20,  numT: 5,  chainSpec: { numChains: 1,  numU: 0, numT: 0 } }),
    () => buildFixture('F03_single_seamcross',      { numU: 50,  numT: 20, chainSpec: { numChains: 1,  numU: 0, numT: 0, spiralDuPerRow: 0.005, seamCrossingChainIdx: 0 } }),
    () => buildFixture('F04_single_mild_spiral',    { numU: 50,  numT: 20, chainSpec: { numChains: 1,  numU: 0, numT: 0, spiralDuPerRow: 0.01 } }),
    () => buildFixture('F05_single_steep_spiral',   { numU: 50,  numT: 20, chainSpec: { numChains: 1,  numU: 0, numT: 0, spiralDuPerRow: 0.03 } }),
    () => buildFixture('F06_single_spiral_seam',    { numU: 50,  numT: 20, chainSpec: { numChains: 1,  numU: 0, numT: 0, spiralDuPerRow: 0.03, seamCrossingChainIdx: 0 } }),
    () => buildFixture('F07_single_multirow_gap',   { numU: 50,  numT: 20, chainSpec: { numChains: 1,  numU: 0, numT: 0, multiRowGapEvery: 3 } }),
    () => buildFixture('F08_combo_seam_gap',        { numU: 50,  numT: 20, chainSpec: { numChains: 1,  numU: 0, numT: 0, spiralDuPerRow: 0.01, seamCrossingChainIdx: 0, multiRowGapEvery: 3 } }),
    () => buildFixture('F09_ripple15_vertical',     { numU: 200, numT: 50, chainSpec: { numChains: 15, numU: 0, numT: 0 } }),
    () => buildFixture('F10_ripple15_mild_spiral',  { numU: 200, numT: 50, chainSpec: { numChains: 15, numU: 0, numT: 0, spiralDuPerRow: 0.01 } }),
    () => buildFixture('F11_ripple22_full',         { numU: 200, numT: 50, chainSpec: { numChains: 22, numU: 0, numT: 0, spiralDuPerRow: 0.01, seamCrossingChainIdx: 0 } }),
    () => buildFixture('F12_ripple22_worst',        { numU: 200, numT: 50, chainSpec: { numChains: 22, numU: 0, numT: 0, spiralDuPerRow: 0.03, seamCrossingChainIdx: 0, multiRowGapEvery: 4 } }),
    () => buildFixture('F13_ripple22_dense_T',      { numU: 200, numT: 200, chainSpec: { numChains: 22, numU: 0, numT: 0, spiralDuPerRow: 0.005, seamCrossingChainIdx: 0 } }),
    () => buildFixture('F14_production_scale',      { numU: 200, numT: 253, chainSpec: { numChains: 80, numU: 0, numT: 0, spiralDuPerRow: 0.005, seamCrossingChainIdx: 0, multiRowGapEvery: 7 } }),
    // Adaptive-unionU variants — mimic production GridBuilder by inserting a
    // grid column at every chain U position. Compare to F10/F11/F12 to test
    // whether their aspect/fragmentation issues are real or audit-only.
    () => buildAdaptiveFixture('F15_adaptive_F10',   { baseUColumns: 50,  numT: 50, chainSpec: { numChains: 15, numU: 0, numT: 0, spiralDuPerRow: 0.01 } }),
    () => buildAdaptiveFixture('F16_adaptive_F11',   { baseUColumns: 50,  numT: 50, chainSpec: { numChains: 22, numU: 0, numT: 0, spiralDuPerRow: 0.01, seamCrossingChainIdx: 0 } }),
    () => buildAdaptiveFixture('F17_adaptive_F12',   { baseUColumns: 50,  numT: 50, chainSpec: { numChains: 22, numU: 0, numT: 0, spiralDuPerRow: 0.03, seamCrossingChainIdx: 0, multiRowGapEvery: 4 } }),
];

interface MatrixRow extends AuditMetrics {
    name: string;
    chainCount: number;
    hasSpiral: boolean;
    hasSeamCrossing: boolean;
    hasMultiRowGaps: boolean;
}

const matrixResults: MatrixRow[] = [];

describe('Parametric audit — Phase A: fixture matrix', () => {
    for (const factory of PHASE_A_FIXTURES) {
        // Each fixture runs as its own test, but with no hard assertions.
        // Failures are RECORDED to the matrix, not thrown.
        const fixture = factory();
        it(`A: ${fixture.name}`, () => {
            const result = buildCDTOuterWall(
                fixture.chains,
                fixture.rowMapping,
                fixture.tPositions,
                fixture.unionU,
                10000,
                0,
            );
            const metrics = computeMetrics(result, fixture);
            matrixResults.push({
                name: fixture.name,
                ...fixture.tags,
                ...metrics,
            });
            // Soft sanity only — the harness itself didn't crash:
            expect(result.indices.length).toBeGreaterThan(0);
        });
    }

    afterAll(() => {
        const COLUMNS: Array<[string, (r: MatrixRow) => string | number]> = [
            ['fixture',       r => r.name],
            ['#chains',       r => r.chainCount],
            ['spiral',        r => r.hasSpiral ? 'Y' : '.'],
            ['seam',          r => r.hasSeamCrossing ? 'Y' : '.'],
            ['gaps',          r => r.hasMultiRowGaps ? 'Y' : '.'],
            ['tris',          r => r.triangles],
            ['boundEdges',    r => r.boundaryEdges],
            ['nonMan',        r => r.nonManifoldEdges],
            ['degen',         r => r.degenerateTris],
            ['edgesEnf',      r => `${r.chainEdgesEnforced}/${r.chainEdgeCount}`],
            ['missing',       r => r.chainEdgesMissing],
            ['maxAspect',     r => r.maxAspect.toFixed(1)],
            ['maxRowSpan',    r => r.maxRowSpan],
            ['xrow>1',        r => r.crossRowTrisGt1],
            ['xrow>3',        r => r.crossRowTrisGt3],
            ['chainComp/in',  r => `${r.chainConnectedComponents}/${r.chainInputCount}`],
        ];

        const widths = COLUMNS.map(([h]) => h.length);
        const rows = matrixResults.map(r => COLUMNS.map(([, fn]) => String(fn(r))));
        for (const row of rows) {
            for (let i = 0; i < row.length; i++) widths[i] = Math.max(widths[i], row[i].length);
        }
        const pad = (s: string, w: number) => s.padEnd(w, ' ');
        const sep = widths.map(w => '─'.repeat(w)).join('─┼─');
        const header = COLUMNS.map(([h], i) => pad(h, widths[i])).join(' │ ');

        console.log('\n══════════════════════════════════════════════════════════════════════════════');
        console.log('   PARAMETRIC AUDIT — PHASE A — FIXTURE × METRIC MATRIX');
        console.log('══════════════════════════════════════════════════════════════════════════════');
        console.log(header);
        console.log(sep);
        for (const row of rows) {
            console.log(row.map((c, i) => pad(c, widths[i])).join(' │ '));
        }
        console.log('══════════════════════════════════════════════════════════════════════════════\n');
    });
});

// ============================================================================
// Phase B — invariants (it.fails = expected to fail on current HEAD)
// ============================================================================

describe('Parametric audit — Phase B: invariants', () => {
    /**
     * B1: Every chain vertex from a single input FeatureChain must be in one
     * connected component via recorded chainEdges. (Duplicate of the test in
     * ChainVertexBuilder.test.ts — kept here for the audit summary.)
     */
    it.fails('B1: chain vertices from one chain remain connected when chain spirals across seam', () => {
        const fixture = buildFixture('B1', {
            numU: 50, numT: 20,
            chainSpec: { numChains: 1, numU: 0, numT: 0, spiralDuPerRow: 0.005, seamCrossingChainIdx: 0 },
        });
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const m = computeMetrics(result, fixture);
        expect(m.chainConnectedComponents).toBe(m.chainInputCount);
    });

    // Shared worst-case fixture builder: matches F12 in Phase A, which is the
    // matrix cell that shows the full bug cluster (non-manifold, missing edges,
    // 98-row slivers, aspect 210k).
    const f12 = () => buildFixture('B-worst', {
        numU: 200, numT: 50,
        chainSpec: { numChains: 22, numU: 0, numT: 0, spiralDuPerRow: 0.03, seamCrossingChainIdx: 0, multiRowGapEvery: 4 },
    });

    /**
     * B2: Every recorded chainEdge in OuterWallResult.chainEdges must appear
     * as an edge in the mesh after the global dedup/remap stage.
     *
     * Production log: "missing=43 [crossRow=43]" with Δu ≈ 0.0001 (NOT
     * seam-crossing) and vidx pairs showing gaps consistent with non-transitive
     * remap (e.g. 181612→181615). Phase A matrix F12: 1944 missing.
     */
    it('B2: every chainEdge appears as an actual mesh edge', () => {
        const fixture = f12();
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const m = computeMetrics(result, fixture);
        expect(m.chainEdgesMissing).toBe(0);
    });

    /**
     * B3: The mesh must be locally manifold — every edge has ≤ 2 adjacent
     * faces. Boundary edges are tolerated (interior holes are not).
     *
     * Production log: 6,292 / 24 non-manifold edges. Phase A matrix F12: 2,721.
     */
    it('B3: no non-manifold edges (every edge has ≤ 2 faces)', () => {
        const fixture = f12();
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const m = computeMetrics(result, fixture);
        expect(m.nonManifoldEdges).toBe(0);
    });

    /**
     * B4: No triangle in the base tessellation output should span more than
     * 1 row band. Tris spanning ≥ 4 rows are the radial slivers visible in
     * the screenshots (production log: cross-row tris 4+row = 53,948 to
     * 135,666; Phase A matrix F12: 5,456 with maxRowSpan=98).
     */
    it('B4: no triangle spans more than 1 row band in base tessellation', () => {
        const fixture = f12();
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const m = computeMetrics(result, fixture);
        expect(m.crossRowTrisGt1).toBe(0);
    });

    /**
     * B5: Max triangle aspect ratio in UV space should be bounded. With a
     * regular grid + low-spiral chains, equilateral = 1.0 and a healthy
     * mesh stays < 10. The production log reports max_aspect 162,000:1 to
     * 2×10⁸:1; Phase A matrix F12: 210,566.
     */
    it('B5: max aspect ratio < 100 for realistic chain configurations', () => {
        const fixture = f12();
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const m = computeMetrics(result, fixture);
        expect(m.maxAspect).toBeLessThan(100);
    });

    /**
     * B6: Chain-vertex fragmentation. A single input FeatureChain represents
     * one logical feature ridge and must produce exactly one connected
     * component in the chain-vertex graph (built from chainVertexChainIds +
     * recorded chainEdges). The Phase A matrix shows F09 (15 vertical chains)
     * cleanly hits 15/15, while every spiraling fixture fragments
     * catastrophically (F10: 2646/15, F11: 3862/22, F12: 4456/22).
     *
     * If components ≫ input chain count, chain vertices are being orphaned
     * — either edges are being silently dropped, or vertices are being
     * remapped to grid vertices without the connectivity being preserved.
     */
    it.fails('B6: each input chain produces exactly one connected component', () => {
        // Use mild-spiral non-seam-crossing config (F10 regime) so the
        // failure isn't conflated with the seam bug from B1.
        const fixture = buildFixture('B6', {
            numU: 200, numT: 50,
            chainSpec: { numChains: 15, numU: 0, numT: 0, spiralDuPerRow: 0.01 },
        });
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const m = computeMetrics(result, fixture);
        expect(m.chainConnectedComponents).toBe(m.chainInputCount);
    });

    /**
     * B8: Max aspect ratio bounded for mild-spiral configurations that DON'T
     * trigger the steep-delta split. F11-style config (22 chains, spiral 0.01,
     * seam crossing, no multi-row gap). Phase A matrix: F11 maxAspect = 1235;
     * F13: 608; F14: 7342. These configurations preserve all chain edges
     * (none get dropped by Fix #3) but still produce slivers from chain-
     * vertex / grid-column proximity. Pinning this bug here for future work.
     */
    it.fails('B8: max aspect ratio < 100 for mild-spiral configs (no multi-row gap)', () => {
        const fixture = buildFixture('B8', {
            numU: 200, numT: 50,
            chainSpec: { numChains: 22, numU: 0, numT: 0, spiralDuPerRow: 0.01, seamCrossingChainIdx: 0 },
        });
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const m = computeMetrics(result, fixture);
        expect(m.maxAspect).toBeLessThan(100);
    });

    /**
     * B7: Dedup-driven missing chain edges (BASELINE — currently HOLDS).
     *
     * Hypothesis under investigation: the chainEdges remap loop at
     * OuterWallTessellator.ts:2664-2671 is a single-step map.get() lookup.
     * If dedup ever chains together (c → b, b → a), edges via c would land
     * at b, not a, and the constraint would be silently lost.
     *
     * The minimal-repro fixture below FAILS to trigger this on HEAD: 4
     * dedup merges happen, 0 chain edges go missing. Either:
     *   (a) the remap is in fact transitive in practice (e.g. dedup never
     *       produces chains, only point-to-point merges); or
     *   (b) this fixture doesn't exercise the failure mode and a different
     *       repro is needed.
     *
     * For now this is a regular `it` — a positive assertion that the
     * invariant holds for grid-aligned-chain configs. If it ever starts
     * failing, the dedup transitivity hypothesis becomes evidenced.
     */
    it('B7 (baseline): chain edges survive dedup when chain U coincides with grid columns', () => {
        const numU = 20;
        const numT = 10;
        const unionU = makeUniform(numU);
        const tPositions = makeUniform(numT);
        const rowMapping = makeRowMapping(numT);
        // Place chain exactly on grid columns: u=5/19, u=8/19, multi-row gap so
        // interpolated u=6.5/19 (between cols 6 and 7).
        const chains: FeatureChain[] = [{
            kind: 'peak',
            points: [
                { row: 0, u: 5 / (numU - 1) },
                { row: 4, u: 8 / (numU - 1) }, // rowGap=4 → 3 interpolations on grid columns
                { row: 8, u: 5 / (numU - 1) },
            ],
        }];
        const result = buildCDTOuterWall(chains, rowMapping, tPositions, unionU, 1000, 0);
        const m = computeMetrics(result, {
            chains, rowMapping, tPositions, unionU, numU, numT,
            name: 'B7',
            tags: { chainCount: 1, hasSpiral: true, hasSeamCrossing: false, hasMultiRowGaps: false },
        });
        expect(m.chainEdgesMissing).toBe(0);
    });

    /**
     * B9 (Bug #1, phantom re-snap): R37 phantom crossing anchors must be
     * exposed on OuterWallResult so that downstream GPU re-snap (R46 Phase 2)
     * can pull them back to the feature ridge.
     *
     * EVIDENCE
     *   Phantom anchors are created at column-boundary crossing T values
     *   (OuterWallTessellator.ts:1808) by LINEAR INTERPOLATION of chain edge
     *   endpoints. The chain edge endpoints are GPU re-snapped to the feature
     *   ridge but the phantom anchor at the intermediate T is NOT — its U is
     *   the linear interpolation between two ridge points, which drifts off
     *   the ridge for curved features.
     *
     *   The R46 re-snap loop (ParametricExportComputer.ts:1580) only iterates
     *   over `outerInterpolatedChainVertices` from ChainVertexBuilder. Phantom
     *   anchors are in `phantomChainAnchorSet` — a separate vertex class never
     *   exposed on OuterWallResult.
     *
     *   This is the smoking gun for the hotspot artifacts visible at every
     *   chain-column crossing in production exports.
     *
     * INVARIANT
     *   When buildCDTOuterWall produces super-cells with chain edges that
     *   cross column boundaries, every phantom chain anchor must be listed
     *   in OuterWallResult.phantomChainAnchors with chainId, vertexIdx, and
     *   tCross sufficient for GPU re-snapping.
     */
    /**
     * B10 (Bug #4, super-cell intermediate-grid pin triangles): When a
     * super-cell spans multiple columns and contains chain vertices, the
     * INTERIOR intermediate grid columns on the bot/top edges sit at
     * column U positions. The CDF density profile deliberately clusters
     * columns near chain features, so these intermediate columns end up
     * close to (but not on) the chain vertices, creating PIN TRIANGLES.
     *
     * NOTE: Pin pairs at cell CORNERS (chain U coincides with a column
     * boundary U) are a separate issue — they need horizontal BPP to
     * propagate the chain vertex into the adjacent standard cell. That's
     * tracked separately. This test only checks INTERIOR pin pairs.
     *
     * INVARIANT (Bug #4 fix)
     *   On the bottom edge of every super-cell, after the coalescing pass,
     *   there must be NO grid vertex within COALESCE_RADIUS U of any chain
     *   vertex on the same edge, EXCLUDING vertices on column-boundary
     *   U values (those are corner vertices shared with adjacent standard
     *   cells; coalescing them requires horizontal BPP).
     */
    it('B10: super-cell intermediate grid columns near chain vertices are dropped', () => {
        // Build a fixture where:
        //  - Chains drift fast in U per row (spiral 0.03 → ~3 columns/row) so
        //    every chain edge spans multiple columns, forcing super-cells.
        //  - multiRowGapEvery=3 forces interpolated chain vertices between
        //    rows; with steep spiral those interpolated Us land at many
        //    intermediate column U values.
        const fixture = buildFixture('B10', {
            numU: 100, numT: 30,
            chainSpec: { numChains: 6, numU: 0, numT: 0, spiralDuPerRow: 0.03, multiRowGapEvery: 3 },
        });
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );

        // Identify chain vertex indices via chainVertexChainIds.
        const chainVertSet = new Set<number>(result.chainVertexChainIds.keys());
        // For each unique edge of the mesh, if both endpoints sit on the same
        // U-row and one is a grid vertex while the other is a chain vertex,
        // their U separation must be ≥ MIN_PIN_SEP (0.0006 = R55 radius).
        // A surviving pair below this threshold is a pin-triangle base.
        const verts = result.vertices;
        const indices = result.indices;
        const MIN_PIN_SEP = 0.0006;
        const seen = new Set<string>();
        let pinPairs = 0;
        const pinDetails: Array<{ a: number; b: number; uA: number; uB: number; du: number; t: number }> = [];
        const isChain = (idx: number) => chainVertSet.has(idx);
        // gridVertexCount is the boundary: indices < gridVertexCount are grid.
        const isGrid = (idx: number) => idx < result.gridVertexCount;
        // Build set of grid column U values to identify column-boundary
        // (cell-corner) grid vertices — those are out of scope for Bug #4.
        const colUs = new Set<number>();
        for (let i = 0; i < fixture.unionU.length; i++) {
            colUs.add(Math.round(fixture.unionU[i] * 1e6) / 1e6);
        }
        const isOnColumnBoundary = (u: number): boolean => {
            const k = Math.round(u * 1e6) / 1e6;
            return colUs.has(k);
        };
        const checkPair = (a: number, b: number) => {
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (seen.has(key)) return;
            seen.add(key);
            if (!((isGrid(a) && isChain(b)) || (isGrid(b) && isChain(a)))) return;
            const tA = verts[a * 3 + 1];
            const tB = verts[b * 3 + 1];
            if (Math.abs(tA - tB) > 1e-6) return; // not same row
            const uA = verts[a * 3];
            const uB = verts[b * 3];
            let du = Math.abs(uA - uB);
            if (du > 0.5) du = 1 - du; // seam wrap
            if (du <= 0 || du >= MIN_PIN_SEP) return;
            // Bug #4 scope: exclude pin pairs where the grid vertex sits on
            // a column boundary (those are cell corners — horizontal BPP
            // territory, tracked separately).
            const gridU = isGrid(a) ? uA : uB;
            if (isOnColumnBoundary(gridU)) return;
            pinPairs++;
            pinDetails.push({ a, b, uA, uB, du, t: tA });
        };
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i], b = indices[i + 1], c = indices[i + 2];
            if (a === 0 && b === 0 && c === 0) continue; // seam-skip placeholder
            checkPair(a, b);
            checkPair(b, c);
            checkPair(c, a);
        }
        if (pinPairs > 0) {
            const grid = result.gridVertexCount;
            // Classify each pin pair by vertex region (grid / chain / phantom)
            const phStart = result.gridVertexCount + (result.chainVertexChainIds.size);
            const region = (idx: number) => idx < grid ? 'G' : (chainVertSet.has(idx) ? 'C' : (idx >= phStart ? 'P' : '?'));
            // eslint-disable-next-line no-console
            console.log('[B10 diagnostic] pin pairs:', pinDetails.slice(0, 10).map(p =>
                `${region(p.a)}#${p.a}(u=${p.uA.toFixed(6)}) ↔ ${region(p.b)}#${p.b}(u=${p.uB.toFixed(6)}) du=${p.du.toExponential(3)} t=${p.t.toFixed(4)}`,
            ));
        }
        expect(pinPairs).toBe(0);
    });

    /**
     * B11 (Bug #6, chain-cell column-boundary pin pair): When a chain vertex
     * U coincides with a grid column boundary U (within COALESCE_RADIUS), the
     * chain cell's right or left vertical edge contains a near-coincident
     * grid+chain pair. R55-S blocks coalescing because the grid vertex is a
     * cell CORNER shared with an adjacent standard cell.
     *
     * Without horizontal BPP, the chain vertex is NOT propagated to the
     * adjacent standard cell — the standard cell uses only the grid corner.
     * Result: surviving near-coincident pair creates a PIN TRIANGLE on the
     * shared edge, visible as a bump/streak in the STL.
     *
     * INVARIANT
     *   For any chain-cell whose chain U is within MIN_PIN_SEP of a column
     *   boundary U, the resulting mesh must NOT have a same-row grid+chain
     *   pair within MIN_PIN_SEP on the shared boundary edge — either by
     *   dropping the chain vertex (loses precision) or by propagating it
     *   to the adjacent cell via horizontal BPP (preferred).
     */
    it.fails('B11: chain vertices coincident with column boundaries do not produce pin pairs', () => {
        // Spiral fixture (B10's old fixture) reliably produces chain U positions
        // that drift across grid column boundaries. Without horizontal BPP, the
        // chain vertex is in the chain cell but missing from the adjacent
        // standard cell, leaving a pin pair on the shared edge.
        const fixture = buildFixture('B11', {
            numU: 100, numT: 30,
            chainSpec: { numChains: 4, numU: 0, numT: 0, spiralDuPerRow: 0.015 },
        });
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );

        const chainVertSet = new Set<number>(result.chainVertexChainIds.keys());
        const verts = result.vertices;
        const indices = result.indices;
        const MIN_PIN_SEP = 0.0006;
        const seen = new Set<string>();
        let pinPairs = 0;
        const isChainVert = (idx: number) => chainVertSet.has(idx);
        const isGridVert = (idx: number) => idx < result.gridVertexCount;
        const checkPair = (a: number, b: number) => {
            const key = a < b ? `${a}-${b}` : `${b}-${a}`;
            if (seen.has(key)) return;
            seen.add(key);
            if (!((isGridVert(a) && isChainVert(b)) || (isGridVert(b) && isChainVert(a)))) return;
            const tA = verts[a * 3 + 1];
            const tB = verts[b * 3 + 1];
            if (Math.abs(tA - tB) > 1e-6) return;
            const uA = verts[a * 3];
            const uB = verts[b * 3];
            let du = Math.abs(uA - uB);
            if (du > 0.5) du = 1 - du;
            if (du > 0 && du < MIN_PIN_SEP) pinPairs++;
        };
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i], b = indices[i + 1], c = indices[i + 2];
            if (a === 0 && b === 0 && c === 0) continue;
            checkPair(a, b);
            checkPair(b, c);
            checkPair(c, a);
        }
        expect(pinPairs).toBe(0);
    });

    /**
     * B12 (Bug #5, UV-space diagonal choice): The sweep's `maxCosine2D` quality
     * metric evaluates triangle angles in raw UV coordinates. For pottery
     * surfaces with U/T anisotropy (e.g. circumference 251mm vs height 100mm
     * → 2.5:1 metric ratio), the UV-best diagonal is frequently NOT the
     * 3D-best diagonal.
     *
     * INVARIANT
     *   For a band with high UV-aspect (cell wider than tall, or vice versa),
     *   the diagonal choice MUST be informed by the metric correction.
     *   Currently the sweep uses raw UV cosines, producing 3D slivers.
     *
     * This is pinned `it.fails` — the bug is documented and a future fix
     * will replace the cosine metric with a metric-corrected version that
     * accepts a per-band aspect parameter.
     */
    it('B12: sweep diagonal choice accepts metricAspect option (Bug #5 plumbing)', () => {
        // Verify the OuterWallBuildOptions plumbs `metricAspect` end-to-end
        // and that supplying a non-trivial value flips diagonals in a band
        // where U/T physical anisotropy makes the raw-UV choice suboptimal.
        //
        // Construct a band that is "wide in UV" but "tall in physical
        // space" (metricAspect << 1 → equivalent to a tall band). For a
        // grid cell with vertices on both diagonals nearly equidistant in
        // UV, the diagonal selector should respond to the metric.
        const fixture = buildFixture('B12', {
            numU: 50, numT: 20,
            chainSpec: { numChains: 2, numU: 0, numT: 0, spiralDuPerRow: 0.01 },
        });
        const resultDefault = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        const resultAniso = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
            undefined, undefined, { metricAspect: 5.0 },
        );

        // Function accepts and stores the option without crashing or
        // producing structurally invalid output.
        expect(resultDefault.indices.length).toBeGreaterThan(0);
        expect(resultAniso.indices.length).toBeGreaterThan(0);
        // Both share the same vertex count (no new vertices introduced) —
        // only diagonal choice changes.
        expect(resultDefault.vertices.length).toBe(resultAniso.vertices.length);
        // The metric correction MUST change at least some diagonal choices
        // when applied with a non-trivial aspect; otherwise it's a no-op.
        let differingTris = 0;
        const minLen = Math.min(resultDefault.indices.length, resultAniso.indices.length);
        for (let i = 0; i < minLen; i++) {
            if (resultDefault.indices[i] !== resultAniso.indices[i]) {
                differingTris++;
            }
        }
        expect(differingTris).toBeGreaterThan(0);
    });

    it('B9: phantom chain anchors are exposed on OuterWallResult for downstream re-snap', () => {
        // Mild-spiral fixture: chains cross column boundaries diagonally → phantom anchors created
        const fixture = buildFixture('B9', {
            numU: 50, numT: 20,
            chainSpec: { numChains: 3, numU: 0, numT: 0, spiralDuPerRow: 0.01 },
        });
        const result = buildCDTOuterWall(
            fixture.chains, fixture.rowMapping, fixture.tPositions, fixture.unionU, 10000, 0,
        );
        // The result must expose phantom chain anchors. This field does not yet exist.
        // Cast through unknown so we can assert without TS complaining about the missing field
        // before the fix lands.
        const anchors = (result as unknown as { phantomChainAnchors?: Array<{ vertexIdx: number; chainId: number; tCross: number }> }).phantomChainAnchors;
        expect(anchors).toBeDefined();
        expect(Array.isArray(anchors)).toBe(true);
        // For this spiral fixture we expect at least one phantom chain anchor
        // (super-cells with column-boundary crossings produce them).
        expect(anchors!.length).toBeGreaterThan(0);
        // Each anchor must have the fields needed for GPU re-snap.
        // Note: chainId refers to the POST-SPLIT chain index after
        // splitChainsAtSeam/splitChainsAtSteepDelta in ChainVertexBuilder, so
        // it may exceed `fixture.chains.length`. We only assert non-negativity
        // and that it identifies a real chain (via chainVertexChainIds).
        const validChainIds = new Set<number>();
        for (const cid of result.chainVertexChainIds.values()) {
            validChainIds.add(cid);
        }
        for (const a of anchors!) {
            expect(typeof a.vertexIdx).toBe('number');
            expect(typeof a.chainId).toBe('number');
            expect(typeof a.tCross).toBe('number');
            expect(a.tCross).toBeGreaterThanOrEqual(0);
            expect(a.tCross).toBeLessThanOrEqual(1);
            expect(a.chainId).toBeGreaterThanOrEqual(0);
            // chainId must identify a chain that ChainVertexBuilder produced
            expect(validChainIds.has(a.chainId)).toBe(true);
        }
    });
});

// ============================================================================
// PHASE C — Root-cause clustering and prioritized fix list
// ============================================================================
//
// Synthesizing Phase A (fixture × metric matrix) and Phase B (invariant tests
// against HEAD), the bug surface clusters into THREE root causes — not eight.
// They are listed below in priority order: cluster 1 explains the largest
// share of observed failures and should be fixed first.
//
// ── CLUSTER 1: Chain-vertex / grid-column proximity ───────────────────────────
//
// EVIDENCE
//   - Phase A: F09 (15 vertical chains) is clean at 15/15 components. F10
//     (same 15 chains + mild spiral 0.01) fragments to 2,646 components.
//     Adding spiral with NO seam crossing and NO multi-row gaps is sufficient
//     to break chain connectivity. Pattern repeats in F04, F05, F11, F14.
//   - Phase B: B1 (seam crossing) and B6 (mild spiral, no seam) both fail.
//     The seam is just one site of the same pattern — chain U positions
//     drifting across grid column boundaries.
//   - Production log: 88 interpolated vertices placed via CPU interpolation
//     have 3× the ridge-distance error of primary chain vertices (R48:
//     interpolated avg 7.05mm vs primary 2.31mm). The R46 GPU re-snap is
//     clamped to ±0.08 U and cannot pull them back.
//
// REVISED FINDING (2026-05-15, post-Fix #2/#3):
//   Fixtures F15–F17 add adaptive-unionU variants of F10/F11/F12 (unionU
//   includes every chain U position, mimicking production's GridBuilder).
//   With adaptive grid, chainComp/in drops 2636/15 → 0/15 and maxAspect
//   drops 394 → 86 (F15). The "fragmentation" is largely an artifact of the
//   uniform-grid audit fixtures: chain U positions don't coincide with grid
//   columns, dedup merges some of them, the union-find skips edges through
//   merged grid vertices, and chain vertices appear orphaned. Production
//   doesn't hit this because GridBuilder inserts a column at every chain U.
//
//   The RESIDUAL issue under adaptive grid (F16/F17 aspect 317) is chain U
//   density — multiple chains with mild spiral place U positions densely,
//   creating narrow cells with high aspect triangles. This is downstream of
//   GridBuilder's downsampling logic, not OuterWallTessellator's per-cell
//   triangulation.
//
// SUSPECTED CODE SITES
//   - ChainVertexBuilder.ts:132-167 — interpolation path uses wrap-corrected
//     du then mod-wraps the interpolated U, which works for the seam case
//     but doesn't account for grid-column density when placing interp
//     vertices.
//   - OuterWallTessellator.ts:2664-2671 — chainEdges remap loop is a
//     single-step map.get() lookup. UNPROVEN: B7's minimal repro did not
//     trigger non-transitive remap (4 merges, 0 missing edges). Either the
//     remap is transitive in practice, or a different repro is needed.
//     Worth a code-level audit but not currently evidenced by a failing
//     test.
//
// FIX SHAPE (sketch, not prescription)
//   - ChainLinker should split chains at the seam, eliminating the special-
//     case wrap-correction path entirely (see analysis in main thread).
//   - The chainEdges remap loop must resolve transitively (e.g. replace
//     `m0 = remap.get(v0)` with a union-find root lookup).
//   - Chain-vertex/grid-vertex coincidence detection should preserve
//     constraint topology — when a chain vertex is merged with a grid
//     vertex, the chainEdges referencing it must be rewritten to the grid
//     vertex *and* a connectivity check run to ensure adjacent chain
//     vertices remain reachable.
//
// PRIMARY INVARIANTS THIS CLUSTER VIOLATES
//   B1, B2, B6, B7 (all currently failing)
//
// ── CLUSTER 2: Multi-row gap interpolation under steep deltas ─────────────────
//
// EVIDENCE
//   - Phase A: F11 (22 chains, mild spiral 0.01, seam-crossing, NO multi-row
//     gap) shows missing=0, non-manifold=0, but aspect 1235. F12 (same +
//     steep spiral 0.03 + multi-row gap every 4) shows missing=1944,
//     non-manifold=2721, aspect 210k, maxRowSpan=98, 5456 sliver tris.
//     The multi-row gap × steep spiral interaction is what produces the
//     non-manifold mesh and the radial slivers.
//   - Production log: chains with maxUErr=0.015 hardcoded clamp appear
//     repeatedly in R48 output, especially for short chains (chains 25, 28,
//     30, 34, 39, 62, 67, 76 — all with maxUErr exactly 0.015).
//
// SUSPECTED CODE SITES
//   - ChainVertexBuilder.ts:144-167 — interpolation step `interpU = p0.u +
//     du * frac` does not account for du/rowGap exceeding the inter-column
//     U spacing. When du/rowGap > (1/numU), each interpolated vertex
//     crosses multiple grid columns from its predecessor, and the per-row
//     strip triangulation can no longer handle the chain locally.
//   - OuterWallTessellator.ts:1086-1095 — cross-cell super-cell loop
//     iterates `for (c = cMin; c <= cMax; c++)`. With steep spiral plus
//     multi-row gap, cross-cell edges can span up to 0.4 × numU columns
//     (78 cols at numU=200), producing one fusion request that big.
//
// FIX SHAPE
//   - Cap interpolation slope: if `Math.abs(du / rowGap)` exceeds some
//     fraction of `1/numU`, either insert micro-rows (already partially
//     done by `insertMicroRowsForSteepCrossings` at OWT:871) or split
//     the chain.
//   - Bound super-cell column span; refuse to register cross-cell edges
//     beyond a hard column-count cap and instead micro-row.
//
// PRIMARY INVARIANTS THIS CLUSTER VIOLATES
//   B3, B4, B5 at the F12 regime
//
// ── CLUSTER 3: Outer-wall mesh topology assumptions for chain-bearing rows ────
//
// EVIDENCE
//   - Phase A: F01 (no chains, numU=20, numT=5) shows 46 boundary edges.
//     This is the expected open-boundary count for an outer wall (top +
//     bottom + 2 seam = 2*(numU-1)+2 = 40, plus some).
//   - F09 (15 vertical chains): 518 boundary edges. F14 (80 mild-spiral
//     chains): 1,629 boundary edges. The boundary edge count grows
//     super-linearly with chain count even without spiral.
//   - Production log: 150,875–353,508 boundary edges in the final mesh —
//     orders of magnitude above what's needed for a single open outer wall.
//
//   - ROW-0 FAN DEFECT (revealed by Fix #2): after splitChainsAtSeam landed,
//     F12 picked up 97 degenerate triangles. All 20 sampled examples are
//     fans from grid vertex 0 (u=0, t=0 corner) to consecutive row-0 vertices
//     (mix of grid + chain + phantom), e.g.:
//       v[13G,0G,19896C] rows[0,0,-1] u=(0.06533,0.00000,0.06818) t=(0,0,0)
//       v[14G,0G,15G]    rows[0,0,0]  u=(0.07035,0.00000,0.07538) t=(0,0,0)
//     All three vertices on the same row → collinear → zero area. This is
//     an OWT row-0 boundary handler that fans triangles from the seam corner
//     regardless of whether the resulting triangles are degenerate. The
//     defect existed pre-fix but was masked: chain 0 wrapped the seam
//     internally, contributing chain vertices at u≈0.97 that broke up the
//     fan. Post-split, those vertices are gone (singleton sub-chain dropped),
//     the fan reaches farther, and collinearity becomes visible.
//
// SUSPECTED CODE SITES
//   - The cell-local triangulation (R34/R35) inserts chain vertices as
//     additional grid points and re-triangulates affected cells. The
//     re-triangulation may not always produce a watertight result.
//   - The R37 phantom vertices (10,581 in production log) and R53 BPP
//     split cells are themselves band-aids on top of an underlying issue
//     in chain-cell topology.
//   - Some row-0 / row-(numT-1) boundary handler emits "fan from corner"
//     triangles. Needs source identification — search OuterWallTessellator
//     for index writes that include vertex 0 unconditionally.
//
// FIX SHAPE
//   - Less clear. May require revisiting the cell-local triangulation
//     contract. Defer until Clusters 1 and 2 are resolved — many of the
//     "boundary edge" count failures may be downstream consequences of
//     the chain fragmentation in Cluster 1.
//
// PRIMARY INVARIANTS THIS CLUSTER VIOLATES
//   Boundary edge counts in Phase A matrix (no specific Phase B test —
//   intentionally, since the cause is least clear)
//
// ── PRIORITIZED FIX SEQUENCE ──────────────────────────────────────────────────
//
//   1. Make the chainEdges remap loop transitive (1-line change at
//      OuterWallTessellator.ts:2664-2671). Cheapest possible fix; if B7
//      goes green after this, dedup transitivity is confirmed as one of
//      the chain-fragmentation drivers.
//
//   2. Split chains at the seam in ChainLinker. Mid-cost. Should flip B1
//      green and reduce the F11 row in the Phase A matrix to F09's
//      cleanliness level.
//
//   3. Cap interpolation slope or auto-split chains with du/rowGap >
//      threshold. Should flip B3 and B4 green and bring F12's bug counts
//      down to F13 levels.
//
//   4. Re-run Phase A matrix after each fix. The matrix delta is the
//      success criterion, not just "the test went green."
//
//   5. Cluster 3 (boundary edges) only after 1–3 are landed and
//      re-measured.
