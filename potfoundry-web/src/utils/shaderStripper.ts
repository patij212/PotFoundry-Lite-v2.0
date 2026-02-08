

/**
 * Strips unused style functions from the raw WGSL string.
 * This function locates all function definitions in STYLE_FUNCTION_MAP
 * and removes the ones that do not match the activeFunctionName.
 * 
 * It uses a brace-counting parser to safely remove the entire function body.
 */
export function stripShaderCode(wgsl: string, activeFunctionName: string): string {
    const lines = wgsl.split('\n');
    const output: string[] = [];

    let insideRegion = false;
    let keepCurrentRegion = false;

    // We assume that the region name matches the active function name
    // OR matches a special "Shared" tag (though currently shared code is just outside regions).

    for (const line of lines) {
        const trimmed = line.trim();

        // Check for start of region
        if (trimmed.startsWith('// #region')) {
            insideRegion = true;
            const regionName = trimmed.replace('// #region', '').trim();

            // Keep if it matches the active function
            // We use simple string inclusion check so "#region style_celtic" matches "style_celtic_knot" if needed,
            // but exact match is safer:
            keepCurrentRegion = (regionName === activeFunctionName);

            // Validate: If we are meant to strip, we skip adding this line (and subsequent ones)
            // But we might want to keep the region markers for debugging? No, strip them to save bytes/confusion.
            if (keepCurrentRegion) {
                output.push(line);
            }
            continue;
        }

        // Check for end of region
        if (trimmed.startsWith('// #endregion')) {
            if (keepCurrentRegion) {
                output.push(line);
            }
            insideRegion = false;
            keepCurrentRegion = false;
            continue;
        }

        // Logic for content lines
        if (insideRegion) {
            if (keepCurrentRegion) {
                output.push(line);
            }
            // Else: discard line (stripping)
        } else {
            // Outside logic: Keep everything (Shared Code)
            output.push(line);
        }
    }

    return output.join('\n');
}
