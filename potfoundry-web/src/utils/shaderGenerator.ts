import { STYLE_REGISTRY } from '../styles/registry';

/**
 * Convert PascalCase to MACRO_CASE (SCREAMING_SNAKE_CASE)
 * e.g. "SuperformulaBlossom" -> "SUPERFORMULA_BLOSSOM"
 */
function toMacroCase(str: string): string {
    return str
        .replace(/([A-Z])/g, '_$1')
        .toUpperCase()
        .replace(/^_/, '');
}

/**
 * Generate WGSL constants for all styles in the registry.
 * This ensures the shader is always in sync with TS definitions.
 * 
 * Output example:
 * const STYLE_SUPERFORMULA_BLOSSOM = 0;
 * const STYLE_FOURIER_BLOOM = 1;
 * ...
 */
export function generateStyleConstants(): string {
    const lines = [
        '// --- GENERATED STYLE CONSTANTS (from registry) ---'
    ];

    for (const [key, config] of Object.entries(STYLE_REGISTRY)) {
        const macroName = toMacroCase(key);
        lines.push(`const STYLE_${macroName} = ${config.id};`);
    }

    lines.push('// ---------------------------------------------');
    return lines.join('\n');
}
