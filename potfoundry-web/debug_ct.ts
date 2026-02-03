
import { ConstrainedTriangulator } from './src/utils/geometry/ConstrainedTriangulator';

console.log('Starting Debug ConstrainedTriangulator...');

const start = performance.now();
try {
    const mesh = ConstrainedTriangulator.generateFullPot([]);
    const dt = performance.now() - start;
    console.log(`[PASS] Generated mesh with ${mesh.vertices.length / 3} vertices in ${dt.toFixed(2)}ms`);
} catch (e) {
    console.error('[FAIL] Error:', e);
}
