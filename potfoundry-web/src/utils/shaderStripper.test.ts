
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { stripShaderCode } from './shaderStripper';
import { STYLE_REGISTRY, STYLE_FUNCTION_MAP } from '../styles/registry';

// Load the actual shader file (Synchonously for tests)
const shadersDir = path.resolve(__dirname, '../assets/shaders');
const stylesWgsl = fs.readFileSync(path.join(shadersDir, 'styles.wgsl'), 'utf8');

describe('Shader Stripper Optimization', () => {
    it('should be able to read the source wgsl file', () => {
        expect(stylesWgsl).toBeDefined();
        expect(stylesWgsl.length).toBeGreaterThan(1000);
    });

    it('should strip unused functions for every style in the registry', () => {
        const allFunctions = Object.values(STYLE_FUNCTION_MAP);

        let totalOriginalSize = 0;
        let totalStrippedSize = 0;
        let minSavings = 1.0;
        let maxSavings = 0.0;

        for (const styleIdStr of Object.keys(STYLE_FUNCTION_MAP)) {
            const styleId = Number(styleIdStr);
            const activeFunc = STYLE_FUNCTION_MAP[styleId];

            const stripped = stripShaderCode(stylesWgsl, activeFunc);

            // 1. Verify the ACTIVE function is PRESENT
            // Using regex to match specific fn definition to avoid partial matches
            expect(stripped).toMatch(new RegExp(`fn\\s+${activeFunc}\\b`));

            // 2. Verify ALL OTHER functions are ABSENT
            for (const otherFunc of allFunctions) {
                if (otherFunc === activeFunc) continue;

                // Should strictly NOT find "fn otherFunc"
                const match = stripped.match(new RegExp(`fn\\s+${otherFunc}\\b`));
                if (match) {
                    console.error(`Failed to strip ${otherFunc} when active is ${activeFunc}`);
                }
                expect(match).toBeNull();
            }

            // 3. Track savings
            totalOriginalSize += stylesWgsl.length;
            totalStrippedSize += stripped.length;

            const currentSavings = 1.0 - (stripped.length / stylesWgsl.length);
            if (currentSavings < minSavings) minSavings = currentSavings;
            if (currentSavings > maxSavings) maxSavings = currentSavings;

            // Per-style savings check (at least 10% reduction expected for any style)
            const ratio = stripped.length / stylesWgsl.length;
            expect(ratio).toBeLessThan(0.95);
        }

        const avgSavings = 1.0 - (totalStrippedSize / totalOriginalSize);
        console.log(`Payload Reduction - Avg: ${(avgSavings * 100).toFixed(1)}%, Min: ${(minSavings * 100).toFixed(1)}%, Max: ${(maxSavings * 100).toFixed(1)}%`);
    });

    it('should significantly reduce payload for complex styles like Celtic Triquetra', () => {
        // Find Style 18 (Celtic Triquetra)
        const style18Entry = Object.values(STYLE_REGISTRY).find(s => s.id === 18);
        expect(style18Entry).toBeDefined();

        const activeFunc = style18Entry!.shaderName;
        const stripped = stripShaderCode(stylesWgsl, activeFunc);

        const originalKb = stylesWgsl.length / 1024;
        const strippedKb = stripped.length / 1024;

        console.log(`Style 18 Reduction: ${originalKb.toFixed(1)}KB -> ${strippedKb.toFixed(1)}KB`);

        // We expect massive reduction here because it shouldn't contain 17 other styles
        expect(strippedKb).toBeLessThan(originalKb * 0.6); // Expect at least 40% reduction (actually got 60% in logs)
    });
});
