/**
 * THROWAWAY diagnostic — full provenance/orientation breakdown of the F14-proxy
 * interior cracks (test M). Delete after root-cause is pinned.
 * @vitest-environment jsdom
 */
import { describe, it } from 'vitest';
import { buildCDTOuterWall } from './OuterWallTessellator';
import { repairOuterWallTJunctions } from './BoundaryTJunctionRepair';
import type { FeatureChain } from './types';

function makeUniformU(cols: number): Float32Array {
    const u = new Float32Array(cols);
    for (let i = 0; i < cols; i++) u[i] = i / (cols - 1);
    return u;
}
function makeUniformT(rows: number): Float32Array {
    const t = new Float32Array(rows);
    for (let i = 0; i < rows; i++) t[i] = i / (rows - 1);
    return t;
}

function buildF14Chains(numU: number, numT: number, maxBaseU = 0.92): FeatureChain[] {
    const cell = 1 / (numU - 1);
    const spiral = cell;
    const spacing = 2.5 * cell;
    const chains: FeatureChain[] = [];
    for (let c = 0; ; c++) {
        const baseU = 0.08 + c * spacing;
        if (baseU > maxBaseU) break;
        const pts = [];
        for (let row = 0; row < numT; row++) {
            let u = baseU + spiral * row;
            u = ((u % 1) + 1) % 1;
            if (u >= 1) u = 1 - 1e-7;
            pts.push({ row, u });
        }
        chains.push({ kind: c % 2 === 0 ? 'peak' : 'valley', points: pts });
    }
    return chains;
}

function classify(
    label: string,
    idx: ArrayLike<number>,
    verts: ArrayLike<number>,
    gridVertexCount: number,
    chainIds: Set<number> | Map<number, unknown>,
    unionU: Float32Array,
    tPositions: Float32Array,
    numU: number,
): void {
        // provenance by original vertex index range
        const provOf = (v: number): string => {
            if (v < gridVertexCount) return 'G';
            if (chainIds.has(v)) return 'C';
            return 'P';
        };
        const Q = 1e6;
        const keyOf = (v: number): string =>
            `${Math.round(verts[v * 3] * Q)},${Math.round(verts[v * 3 + 1] * Q)}`;
        const canon = new Map<string, number>();
        const canonU: number[] = [], canonT: number[] = [], canonProv: string[] = [];
        const idOf = (v: number): number => {
            const k = keyOf(v);
            let id = canon.get(k);
            if (id === undefined) {
                id = canonU.length;
                canon.set(k, id);
                canonU.push(verts[v * 3]); canonT.push(verts[v * 3 + 1]); canonProv.push(provOf(v));
            }
            return id;
        };
        const STRIDE = 0x4000000;
        const edgeCount = new Map<number, number>();
        for (let i = 0; i < idx.length; i += 3) {
            const a = idx[i], b = idx[i + 1], c = idx[i + 2];
            if (a === 0 && b === 0 && c === 0) continue;
            const ca = idOf(a), cb = idOf(b), cc = idOf(c);
            if (ca === cb || cb === cc || ca === cc) continue;
            for (const [p, q] of [[ca, cb], [cb, cc], [cc, ca]] as const) {
                const lo = Math.min(p, q), hi = Math.max(p, q);
                edgeCount.set(lo * STRIDE + hi, (edgeCount.get(lo * STRIDE + hi) ?? 0) + 1);
            }
        }
        const uMin = unionU[0], uMax = unionU[unionU.length - 1];
        const tMin = tPositions[0], tMax = tPositions[tPositions.length - 1];
        const onLine = (val: number, target: number) => Math.abs(val - target) < 1e-5;
        const isPerim = (p: number, q: number) =>
            (onLine(canonU[p], uMin) && onLine(canonU[q], uMin)) ||
            (onLine(canonU[p], uMax) && onLine(canonU[q], uMax)) ||
            (onLine(canonT[p], tMin) && onLine(canonT[q], tMin)) ||
            (onLine(canonT[p], tMax) && onLine(canonT[q], tMax));
        const provPair = new Map<string, number>();
        const orient = new Map<string, number>();
        // is the crack edge ON a column line (u == k*cell, both endpoints)?
        const cell = 1 / (numU - 1);
        const onColLine = (u: number) => {
            const k = Math.round(u / cell);
            return Math.abs(u - k * cell) < 1e-5;
        };
        // near-seam = at least one endpoint within 0.01 of u=1.0 (the chain/grid seam)
        const nearSeam = (u: number) => u > 0.99;
        let interior = 0, onCol = 0, seam = 0;
        for (const [key, count] of edgeCount) {
            if (count !== 1) continue;
            const p = Math.floor(key / STRIDE), q = key - p * STRIDE;
            if (isPerim(p, q)) continue;
            interior++;
            const pr = [canonProv[p], canonProv[q]].sort().join('');
            provPair.set(pr, (provPair.get(pr) ?? 0) + 1);
            const du = Math.abs(canonU[p] - canonU[q]), dt = Math.abs(canonT[p] - canonT[q]);
            const o = du < 0.1 * dt ? 'V' : dt < 0.1 * du ? 'H' : 'D';
            orient.set(o, (orient.get(o) ?? 0) + 1);
            if (onColLine(canonU[p]) && onColLine(canonU[q])) onCol++;
            if (nearSeam(canonU[p]) || nearSeam(canonU[q])) seam++;
        }
        // eslint-disable-next-line no-console
        console.warn(`[CRACK-PROV ${label}] interior=${interior} onColumnLine=${onCol} nearSeam=${seam} ` +
            `prov=${JSON.stringify([...provPair])} orient=${JSON.stringify([...orient])}`);
}

describe('crack provenance', () => {
    function run(numU: number, numT: number): void {
        const unionU = makeUniformU(numU);
        const tPositions = makeUniformT(numT);
        const rowMapping = Array.from({ length: numT }, (_, i) => i);
        const chains = buildF14Chains(numU, numT);
        const result = buildCDTOuterWall(
            chains, rowMapping, tPositions, unionU, 5000, 0, undefined, undefined,
            { rowEdgeQualityCompanions: false },
        );
        const tag = `${numU}x${numT}(${chains.length}ch)`;
        classify(`RAW ${tag}`, result.indices, result.vertices, result.gridVertexCount,
            result.chainVertexChainIds, unionU, tPositions, numU);
        const repair = repairOuterWallTJunctions(result.indices, result.vertices, result.indices.length);
        classify(`REPAIRED ${tag}`, repair.indices, result.vertices, result.gridVertexCount,
            result.chainVertexChainIds, unionU, tPositions, numU);
    }
    it('M proxy 200x253', () => { run(200, 253); }, 120000);
    it('denser proxy 200x253 maxBaseU=0.92 already; try numU=300', () => { run(300, 253); }, 120000);
});
