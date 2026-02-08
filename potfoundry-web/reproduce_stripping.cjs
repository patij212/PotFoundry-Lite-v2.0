
const fs = require('fs');
const path = require('path');

function stripShaderCode(wgsl, activeFunctionName) {
    const lines = wgsl.split('\n');
    const output = [];
    let insideRegion = false;
    let keepCurrentRegion = false;

    // Fix regex: we need to handle CRLF or LF. split('\n') leaves \r? maybe not.
    // .trim() handles whitespace.

    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('// #region')) {
            insideRegion = true;
            const regionName = trimmed.replace('// #region', '').trim();
            keepCurrentRegion = (regionName === activeFunctionName);
            if (keepCurrentRegion) output.push(line);
            continue;
        }
        if (trimmed.startsWith('// #endregion')) {
            if (keepCurrentRegion) output.push(line);
            insideRegion = false;
            keepCurrentRegion = false;
            continue;
        }
        if (insideRegion) {
            if (keepCurrentRegion) output.push(line);
        } else {
            output.push(line);
        }
    }
    return output.join('\n');
}

const stylesPath = path.join(__dirname, 'src/assets/shaders/styles.wgsl');
const content = fs.readFileSync(stylesPath, 'utf8');

console.log('Original Size:', content.length, 'bytes,', content.split('\n').length, 'lines');

const activeStyle = 'style_geometric_star';
const stripped = stripShaderCode(content, activeStyle);

console.log('Stripped Size:', stripped.length, 'bytes,', stripped.split('\n').length, 'lines');

if (stripped.length > content.length * 0.8) {
    console.error('FAIL: Stripping did not reduce size significantly.');
} else {
    console.log('PASS: Stripping worked.');
}

if (stripped.includes('fn style_geometric_star')) {
    console.log('PASS: Contains active function.');
} else {
    console.error('FAIL: Missing active function!: ' + activeStyle);
    // Debug region names
    const matches = content.match(/\/\/ #region.*/g);
    console.log('Found Regions:', matches ? matches.slice(0, 5) : 'None');
}

if (stripped.includes('fn style_celtic_knot')) {
    console.error('FAIL: Contains INACTIVE function!');
} else {
    console.log('PASS: Removed inactive function.');
}
