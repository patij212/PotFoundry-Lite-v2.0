const fs = require('fs');

// Load shaders
const mobileWgsl = fs.readFileSync('src/assets/shaders/preview_full_mobile.wgsl', 'utf8');
const stylesWgsl = fs.readFileSync('src/assets/shaders/styles.wgsl', 'utf8');

// Extract harmonic_radius region (same as extractStyleRegionOnly)
const lines = stylesWgsl.split('\n');
const output = [];
let insideRegion = false;
let keepCurrentRegion = false;
for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('// #region')) {
        insideRegion = true;
        const regionName = trimmed.replace('// #region', '').trim();
        keepCurrentRegion = regionName === 'harmonic_radius';
        continue;
    }
    if (trimmed.startsWith('// #endregion')) {
        insideRegion = false;
        keepCurrentRegion = false;
        continue;
    }
    if (insideRegion && keepCurrentRegion) {
        output.push(line);
    }
}
const extractedStyle = output.join('\n');

// Mobile dispatch (same as ShaderManager)
const functionName = 'harmonic_radius';
const mobileDispatch = `
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}
`;

// Compose (same as ShaderManager.getStyleWGSL mobile path)
const parts = mobileWgsl.split('// __STYLE_SLOT__');
console.log('Parts count:', parts.length);
console.log('Part 0 length:', parts[0].length, 'bytes');
console.log('Part 0 ends with:', JSON.stringify(parts[0].slice(-80)));
console.log('Part 1 length:', (parts[1] || '').length, 'bytes');
console.log('Part 1 starts with:', JSON.stringify((parts[1] || '').slice(0, 80)));
console.log('');
console.log('Extracted style preview:', extractedStyle.substring(0, 120));
console.log('Extracted style length:', extractedStyle.length, 'lines:', extractedStyle.split('\n').length);
console.log('');

const composed = [parts[0], extractedStyle, mobileDispatch, parts[1] || ''].join('\n');
console.log('Composed size:', composed.length, 'bytes,', (composed.length / 1024).toFixed(1), 'KB');
console.log('Composed lines:', composed.split('\n').length);

// Write composed shader for inspection
fs.writeFileSync('composed_mobile_shader.wgsl', composed, 'utf8');
console.log('\nWritten to composed_mobile_shader.wgsl');

// Check for obvious issues
console.log('\n--- Validation Checks ---');
const composedLines = composed.split('\n');

// Check all function declarations
const fnDecls = composedLines
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter(x => x.text.startsWith('fn '));
console.log('\nFunction declarations:');
fnDecls.forEach(f => console.log(`  Line ${f.line}: ${f.text.substring(0, 80)}`));

// Check for function calls to undefined functions
const declaredFns = fnDecls.map(f => {
    const m = f.text.match(/^fn\s+(\w+)/);
    return m ? m[1] : null;
}).filter(Boolean);
console.log('\nDeclared functions:', declaredFns.join(', '));

// Check that vs_main and fs_main exist
console.log('Has vs_main:', declaredFns.includes('vs_main'));
console.log('Has fs_main:', declaredFns.includes('fs_main'));
console.log('Has style_radius:', declaredFns.includes('style_radius'));
console.log('Has harmonic_radius:', declaredFns.includes('harmonic_radius'));
console.log('Has surf:', declaredFns.includes('surf'));

// Check struct declarations
const structDecls = composedLines
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter(x => x.text.startsWith('struct '));
console.log('\nStruct declarations:');
structDecls.forEach(s => console.log(`  Line ${s.line}: ${s.text.substring(0, 80)}`));

// Check @vertex and @fragment decorators
const entryPoints = composedLines
    .map((l, i) => ({ line: i + 1, text: l.trim() }))
    .filter(x => x.text.includes('@vertex') || x.text.includes('@fragment'));
console.log('\nEntry points:');
entryPoints.forEach(e => console.log(`  Line ${e.line}: ${e.text.substring(0, 100)}`));

// Check brace balance
let braces = 0;
for (const line of composedLines) {
    braces += (line.match(/{/g) || []).length;
    braces -= (line.match(/}/g) || []).length;
}
console.log('\nBrace balance (should be 0):', braces);
