
import { STYLE_FUNCTION_MAP } from '../styles/registry';

/**
 * Strips unused style functions from the raw WGSL string.
 * This function locates all function definitions in STYLE_FUNCTION_MAP
 * and removes the ones that do not match the activeFunctionName.
 * 
 * It uses a brace-counting parser to safely remove the entire function body.
 */
export function stripShaderCode(wgsl: string, activeFunctionName: string): string {
    let stripped = wgsl;
    const allFunctions = Object.values(STYLE_FUNCTION_MAP);

    // Helper to remove a specific function block handling nested braces
    const removeFunction = (code: string, funcName: string): string => {
        // Find "fn funcName" start
        const fnStartRegex = new RegExp(`fn\\s+${funcName}\\b`);
        const match = code.match(fnStartRegex);
        if (!match || match.index === undefined) return code;

        const startIndex = match.index;

        // Find the opening bracket '{' after declaration
        let openBraceIndex = code.indexOf('{', startIndex);
        if (openBraceIndex === -1) return code; // Should not happen in valid code

        // Walk forward counting braces
        let balance = 1;
        let currentIndex = openBraceIndex + 1;

        while (currentIndex < code.length && balance > 0) {
            const char = code[currentIndex];
            if (char === '{') {
                balance++;
            } else if (char === '}') {
                balance--;
            }
            currentIndex++;
        }

        if (balance === 0) {
            // Remove from startIndex to currentIndex (inclusive of closing brace)
            // We keep a newline to preserve line separation
            return code.substring(0, startIndex) + "\n" + code.substring(currentIndex);
        }

        return code; // Fallback if braces didn't balance (malformed?)
    };

    for (const func of allFunctions) {
        // Skip the active function
        if (func === activeFunctionName) continue;

        // Remove main variant
        stripped = removeFunction(stripped, func);
        // Remove _zero variant
        stripped = removeFunction(stripped, `${func}_zero`);
        // Remove _tau variant
        stripped = removeFunction(stripped, `${func}_tau`);
    }
    return stripped;
}
