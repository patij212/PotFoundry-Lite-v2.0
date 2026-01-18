const fs = require('fs');
const filePath = 'src/webgpu_core.ts';
console.log(`Reading ${filePath}`);
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let targetIndex = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].toLowerCase().includes('stripfunctions')) {
        console.log(`Found match at line ${i + 1}: ${lines[i]}`);
        targetIndex = i;
        break; // Take first match
    }
}

if (targetIndex !== -1) {
    const originalLine = lines[targetIndex];
    if (originalLine.includes('styleConstants')) {
        console.log('Already patched!');
        process.exit(0);
    }
    const indentation = originalLine.match(/^\s*/)[0];
    const replacement = `${indentation}const styleConstants = generateStyleConstants();\n${indentation}WGSL_SOURCE = stripFunctions(stripNames, styleConstants + '\\n' + potPreviewWgsl);`;
    lines[targetIndex] = replacement;
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('File patched successfully.');
} else {
    console.error('stripFunctions NOT FOUND');
    process.exit(1);
}
