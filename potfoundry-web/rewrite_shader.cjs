const fs = require('fs');
const filePath = 'src/webgpu_core.ts';
let content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log('--- WGSL_SOURCE ---');
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('WGSL_SOURCE =')) {
        console.log(`Match at ${i + 1}: ${lines[i]}`);
    }
}
